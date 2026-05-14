using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.SignIn;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Storage;

namespace Settleora.Api.Tests;

public sealed class SelfPaymentDetailsQrEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string PaymentDetailsPath = "/api/v1/users/me/payment-details";
    private const string PaymentQrPath = "/api/v1/users/me/payment-details/qr";
    private const string PaymentQrContentPath = "/api/v1/users/me/payment-details/qr/content";
    private const string WrongRawToken = "visible-wrong-payment-qr-session-token";
    private const string PaymentQrAttachedAction = "payment_details.qr_attached";
    private const string PaymentQrReplacedAction = "payment_details.qr_replaced";
    private const string PaymentQrRemovedAction = "payment_details.qr_removed";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 5, 11, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 5, 11, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 5, 11, 30, 0, TimeSpan.Zero);
    private static readonly byte[] ValidPngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01];
    private static readonly byte[] ValidJpegBytes = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46];
    private static readonly byte[] ValidWebpBytes = [0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x00];

    private readonly WebApplicationFactory<Program> factory;

    public SelfPaymentDetailsQrEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PostValidPngUploadCreatesProfileActiveFileLinkAndSafeQrResponse()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateQrUploadRequest(
            actor.RawSessionToken,
            ValidPngBytes,
            "image/png",
            "secret-fps-payment-qr.png");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var content = await response.Content.ReadAsStringAsync();
        AssertSafeQrResponseContent(content, "secret-fps-payment-qr.png", actor.RawSessionToken);
        var payload = ReadPaymentDetailsPayload(content);
        Assert.True(payload.IsConfigured);
        Assert.NotNull(payload.Id);
        Assert.Equal(UserPaymentProfileVisibilities.SettlementCounterpartiesOnly, payload.Visibility);
        Assert.NotNull(payload.QrFile);
        Assert.Equal("image/png", payload.QrFile!.ContentType);
        Assert.Equal(ValidPngBytes.LongLength, payload.QrFile.SizeBytes);
        Assert.Equal(WriteTimestamp, payload.QrFile.UpdatedAtUtc);

        var paymentProfile = await ReadPaymentProfileAsync(testFactory, payload.Id!.Value);
        Assert.Equal(payload.QrFile.Id, paymentProfile.QrFileObjectId);
        Assert.Equal(actor.UserProfileId, paymentProfile.UserProfileId);
        Assert.Equal(UserPaymentProfileVisibilities.SettlementCounterpartiesOnly, paymentProfile.Visibility);

        var fileObject = await ReadFileObjectAsync(testFactory, payload.QrFile.Id);
        AssertPaymentQrFileObject(
            fileObject,
            actor.UserProfileId,
            FileObjectStatuses.Active,
            "image/png",
            ValidPngBytes);
        Assert.Null(fileObject.OriginalFilename);
        Assert.DoesNotContain("secret-fps-payment-qr.png", fileObject.StorageObjectKey, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(ValidPngBytes, testContext.StorageProvider.ReadStoredBytes(fileObject.StorageObjectKey));

        var paymentAuditEvent = Assert.Single(await ReadPaymentQrAuditEventsAsync(testFactory));
        AssertPaymentQrAuditMetadata(
            paymentAuditEvent,
            PaymentQrAttachedAction,
            payload.Id.Value,
            payload.QrFile.Id,
            rowCreated: true,
            "qr_attached",
            "secret-fps-payment-qr.png",
            fileObject.StorageObjectKey);

        var lifecycleActions = (await ReadFileLifecycleAuditEventsAsync(testFactory))
            .Select(auditEvent => auditEvent.Action)
            .Order(StringComparer.Ordinal)
            .ToArray();
        Assert.Equal(["file.upload_completed", "file.upload_started"], lifecycleActions);
    }

    [Fact]
    public async Task PostReplacingQrLinksNewFileMarksPreviousDeletedAndAuditsReplacement()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        var firstPayload = await UploadQrAsync(
            client,
            actor.RawSessionToken,
            ValidPngBytes,
            "image/png",
            "first-secret.png");

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(5));
        var secondPayload = await UploadQrAsync(
            client,
            actor.RawSessionToken,
            ValidJpegBytes,
            "image/jpeg",
            "second-secret.jpg");

        Assert.NotNull(firstPayload.QrFile);
        Assert.NotNull(secondPayload.QrFile);
        Assert.NotEqual(firstPayload.QrFile!.Id, secondPayload.QrFile!.Id);

        var paymentProfile = await ReadPaymentProfileAsync(testFactory, secondPayload.Id!.Value);
        Assert.Equal(secondPayload.QrFile.Id, paymentProfile.QrFileObjectId);

        var previousFile = await ReadFileObjectAsync(testFactory, firstPayload.QrFile.Id);
        var currentFile = await ReadFileObjectAsync(testFactory, secondPayload.QrFile.Id);
        Assert.Equal(FileObjectStatuses.Deleted, previousFile.Status);
        Assert.NotNull(previousFile.DeletedAtUtc);
        AssertPaymentQrFileObject(
            currentFile,
            actor.UserProfileId,
            FileObjectStatuses.Active,
            "image/jpeg",
            ValidJpegBytes);

        var paymentAuditActions = (await ReadPaymentQrAuditEventsAsync(testFactory))
            .Select(auditEvent => auditEvent.Action)
            .Order(StringComparer.Ordinal)
            .ToArray();
        Assert.Equal([PaymentQrAttachedAction, PaymentQrReplacedAction], paymentAuditActions);
        Assert.Contains(
            await ReadFileLifecycleAuditEventsAsync(testFactory),
            auditEvent => auditEvent.Action == "file.deleted"
                && auditEvent.SafeMetadataJson?.Contains(firstPayload.QrFile.Id.ToString("D"), StringComparison.Ordinal) is true);
    }

    [Fact]
    public async Task PostStorageWriteFailureMarksUploadFailedAndDoesNotAlterExistingQrReference()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        var firstPayload = await UploadQrAsync(
            client,
            actor.RawSessionToken,
            ValidPngBytes,
            "image/png",
            "existing.png");

        testContext.StorageProvider.FailWrites = true;
        using var request = CreateQrUploadRequest(
            actor.RawSessionToken,
            ValidJpegBytes,
            "image/jpeg",
            "should-not-link.jpg");

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        AssertSafeProblemContent(content, "should-not-link.jpg");
        var paymentProfile = await ReadPaymentProfileAsync(testFactory, firstPayload.Id!.Value);
        Assert.Equal(firstPayload.QrFile!.Id, paymentProfile.QrFileObjectId);

        var fileObjects = await ReadFileObjectsAsync(testFactory);
        Assert.Contains(fileObjects, fileObject => fileObject.Id == firstPayload.QrFile.Id
            && fileObject.Status == FileObjectStatuses.Active);
        Assert.Contains(fileObjects, fileObject => fileObject.Id != firstPayload.QrFile.Id
            && fileObject.Status == FileObjectStatuses.UploadFailed
            && fileObject.Purpose == FileObjectPurposes.PaymentQr);
        Assert.DoesNotContain(
            await ReadPaymentQrAuditEventsAsync(testFactory),
            auditEvent => auditEvent.Action == PaymentQrReplacedAction);
        Assert.Contains(
            await ReadFileLifecycleAuditEventsAsync(testFactory),
            auditEvent => auditEvent.Action == "file.upload_failed");
    }

    [Theory]
    [InlineData("image/svg+xml", "secret.svg", new byte[] { 0x3C, 0x73, 0x76, 0x67 })]
    [InlineData("application/pdf", "secret.pdf", new byte[] { 0x25, 0x50, 0x44, 0x46 })]
    [InlineData("text/plain", "secret.txt", new byte[] { 0x66, 0x70, 0x73 })]
    [InlineData("application/octet-stream", "secret.exe", new byte[] { 0x4D, 0x5A, 0x00, 0x00 })]
    [InlineData(null, "secret.bin", new byte[] { 0x00, 0x01 })]
    public async Task PostRejectsUnsupportedQrUploadTypesWithoutEchoingFilenameOrCreatingRows(
        string? contentType,
        string filename,
        byte[] bytes)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreateQrUploadRequest(actor.RawSessionToken, bytes, contentType, filename);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        AssertSafeProblemContent(content, filename);
        Assert.Equal(0, await CountActivePaymentProfilesAsync(testFactory, actor.UserProfileId));
        Assert.Empty(await ReadFileObjectsAsync(testFactory));
        Assert.Empty(await ReadPaymentQrAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task PostRejectsEmptyOversizedInvalidSignatureAndUnsupportedMultipartShape()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        var oversized = new byte[(2 * 1024 * 1024) + 1];
        Array.Copy(ValidPngBytes, oversized, ValidPngBytes.Length);

        using (var emptyRequest = CreateQrUploadRequest(actor.RawSessionToken, [], "image/png", "empty-secret.png"))
        using (var emptyResponse = await client.SendAsync(emptyRequest))
        {
            var content = await emptyResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.BadRequest, emptyResponse.StatusCode);
            AssertSafeProblemContent(content, "empty-secret.png");
        }

        using (var oversizedRequest = CreateQrUploadRequest(actor.RawSessionToken, oversized, "image/png", "oversized-secret.png"))
        using (var oversizedResponse = await client.SendAsync(oversizedRequest))
        {
            var content = await oversizedResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.BadRequest, oversizedResponse.StatusCode);
            AssertSafeProblemContent(content, "oversized-secret.png");
        }

        using (var mismatchRequest = CreateQrUploadRequest(actor.RawSessionToken, ValidPngBytes, "image/webp", "mismatch-secret.webp"))
        using (var mismatchResponse = await client.SendAsync(mismatchRequest))
        {
            var content = await mismatchResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.BadRequest, mismatchResponse.StatusCode);
            AssertSafeProblemContent(content, "mismatch-secret.webp");
        }

        using (var wrongShapeRequest = CreateQrUploadRequest(actor.RawSessionToken, ValidPngBytes, "image/png", "wrong-field.png", fieldName: "avatar"))
        using (var wrongShapeResponse = await client.SendAsync(wrongShapeRequest))
        {
            var content = await wrongShapeResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.BadRequest, wrongShapeResponse.StatusCode);
            AssertSafeProblemContent(content, "wrong-field.png");
        }

        Assert.Equal(0, await CountActivePaymentProfilesAsync(testFactory, actor.UserProfileId));
        Assert.Empty(await ReadFileObjectsAsync(testFactory));
        Assert.Empty(await ReadPaymentQrAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task DeleteRemovesLinkedQrMarksFileDeletedAndRepeatedDeleteIsIdempotent()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        var payload = await UploadQrAsync(
            client,
            actor.RawSessionToken,
            ValidWebpBytes,
            "image/webp",
            "delete-secret.webp");

        using (var deleteRequest = CreateBearerRequest(HttpMethod.Delete, PaymentQrPath, actor.RawSessionToken))
        using (var deleteResponse = await client.SendAsync(deleteRequest))
        {
            Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);
        }

        var paymentProfile = await ReadPaymentProfileAsync(testFactory, payload.Id!.Value);
        Assert.Null(paymentProfile.QrFileObjectId);
        var fileObject = await ReadFileObjectAsync(testFactory, payload.QrFile!.Id);
        Assert.Equal(FileObjectStatuses.Deleted, fileObject.Status);
        Assert.NotNull(fileObject.DeletedAtUtc);

        var paymentActions = (await ReadPaymentQrAuditEventsAsync(testFactory))
            .Select(auditEvent => auditEvent.Action)
            .Order(StringComparer.Ordinal)
            .ToArray();
        Assert.Equal([PaymentQrAttachedAction, PaymentQrRemovedAction], paymentActions);

        using (var repeatedRequest = CreateBearerRequest(HttpMethod.Delete, PaymentQrPath, actor.RawSessionToken))
        using (var repeatedResponse = await client.SendAsync(repeatedRequest))
        {
            Assert.Equal(HttpStatusCode.NoContent, repeatedResponse.StatusCode);
        }

        Assert.Equal(2, (await ReadPaymentQrAuditEventsAsync(testFactory)).Count);
    }

    [Fact]
    public async Task GetQrContentReturnsOnlyOwnersActiveLinkedPaymentQrBytesWithSafeHeaders()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        await UploadQrAsync(
            client,
            actor.RawSessionToken,
            ValidPngBytes,
            "image/png",
            "content-secret.png");
        using var request = CreateBearerRequest(HttpMethod.Get, PaymentQrContentPath, actor.RawSessionToken);

        using var response = await client.SendAsync(request);
        var bytes = await response.Content.ReadAsByteArrayAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/png", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(ValidPngBytes, bytes);
        Assert.True(response.Headers.TryGetValues("X-Content-Type-Options", out var nosniffValues));
        Assert.Contains("nosniff", nosniffValues);
        Assert.True(response.Content.Headers.TryGetValues("Content-Disposition", out var contentDispositionValues));
        Assert.Contains("attachment", contentDispositionValues);
    }

    [Fact]
    public async Task GetQrContentReturnsSafeUnavailableForMissingInactiveWrongPurposeOrWrongOwnerQr()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        var other = await SeedAccountAsync(testFactory, "Other QR Owner", InitialTimestamp.AddMinutes(1));
        using var client = testFactory.CreateClient();

        using (var missingRequest = CreateBearerRequest(HttpMethod.Get, PaymentQrContentPath, actor.RawSessionToken))
        using (var missingResponse = await client.SendAsync(missingRequest))
        {
            await AssertPaymentDetailsUnavailableProblemAsync(missingResponse);
        }

        foreach (var blockedFile in new[]
        {
            await SeedLinkedFileAsync(testFactory, actor.UserProfileId, actor.UserProfileId, FileObjectPurposes.PaymentQr, FileObjectStatuses.Deleted),
            await SeedLinkedFileAsync(testFactory, actor.UserProfileId, actor.UserProfileId, FileObjectPurposes.PaymentQr, FileObjectStatuses.UploadFailed),
            await SeedLinkedFileAsync(testFactory, actor.UserProfileId, actor.UserProfileId, FileObjectPurposes.ReceiptImage, FileObjectStatuses.Active),
            await SeedLinkedFileAsync(testFactory, actor.UserProfileId, other.UserProfileId, FileObjectPurposes.PaymentQr, FileObjectStatuses.Active)
        })
        {
            await LinkPaymentProfileToFileAsync(testFactory, actor.UserProfileId, blockedFile.Id);
            using var request = CreateBearerRequest(HttpMethod.Get, PaymentQrContentPath, actor.RawSessionToken);
            using var response = await client.SendAsync(request);
            await AssertPaymentDetailsUnavailableProblemAsync(response);
        }
    }

    [Fact]
    public async Task GetPaymentDetailsHidesMalformedQrMetadataForWrongPurposeStatusOrOwner()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        var other = await SeedAccountAsync(testFactory, "Other QR Metadata Owner", InitialTimestamp.AddMinutes(1));
        using var client = testFactory.CreateClient();

        foreach (var blockedFile in new[]
        {
            await SeedLinkedFileAsync(testFactory, actor.UserProfileId, actor.UserProfileId, FileObjectPurposes.PaymentQr, FileObjectStatuses.Deleted),
            await SeedLinkedFileAsync(testFactory, actor.UserProfileId, actor.UserProfileId, FileObjectPurposes.ReceiptImage, FileObjectStatuses.Active),
            await SeedLinkedFileAsync(testFactory, actor.UserProfileId, other.UserProfileId, FileObjectPurposes.PaymentQr, FileObjectStatuses.Active)
        })
        {
            await LinkPaymentProfileToFileAsync(testFactory, actor.UserProfileId, blockedFile.Id);
            using var request = CreateBearerRequest(HttpMethod.Get, PaymentDetailsPath, actor.RawSessionToken);
            using var response = await client.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            AssertSafeQrResponseContent(content, blockedFile.Id.ToString("D"));
            var payload = ReadPaymentDetailsPayload(content);
            Assert.True(payload.IsConfigured);
            Assert.Null(payload.QrFile);
        }
    }

    [Fact]
    public async Task MissingInvalidOrDeletedActorFailsClosedForQrEndpoints()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();

        using (var missingPostRequest = CreateQrUploadRequest(null, ValidPngBytes, "image/png", "missing-auth.png"))
        using (var missingPostResponse = await client.SendAsync(missingPostRequest))
        {
            await AssertUnauthenticatedProblemAsync(missingPostResponse, "missing-auth.png");
        }

        using (var invalidGetRequest = CreateBearerRequest(HttpMethod.Get, PaymentQrContentPath, WrongRawToken))
        using (var invalidGetResponse = await client.SendAsync(invalidGetRequest))
        {
            await AssertUnauthenticatedProblemAsync(invalidGetResponse, WrongRawToken);
        }

        await MarkProfileDeletedAsync(testFactory, actor.UserProfileId);
        using (var deletedDeleteRequest = CreateBearerRequest(HttpMethod.Delete, PaymentQrPath, actor.RawSessionToken))
        using (var deletedDeleteResponse = await client.SendAsync(deletedDeleteRequest))
        {
            await AssertPaymentDetailsUnavailableProblemAsync(deletedDeleteResponse);
        }
    }

    [Fact]
    public void OpenApiContractDefinesOnlySelfPaymentQrEndpointsAndSafeMetadata()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));

        var postBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/users/me/payment-details/qr:");
        var contentBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/users/me/payment-details/qr/content:");
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "SelfPaymentDetailsResponse:");
        var qrSchema = ExtractOpenApiSchemaBlock(openApi, "SelfPaymentDetailsQrFileResponse:");

        Assert.Contains("operationId: attachSelfPaymentQr", postBlock);
        Assert.Contains("operationId: removeSelfPaymentQr", postBlock);
        Assert.Contains("multipart/form-data", postBlock);
        Assert.Contains("operationId: getSelfPaymentQrContent", contentBlock);
        Assert.Contains("image/png", contentBlock);
        Assert.Contains("image/jpeg", contentBlock);
        Assert.Contains("image/webp", contentBlock);
        Assert.Contains("qrFile", responseSchema);
        Assert.Contains("contentType", qrSchema);
        Assert.Contains("sizeBytes", qrSchema);
        Assert.DoesNotContain("storageObjectKey", responseSchema + qrSchema);
        Assert.DoesNotContain("storagePath", responseSchema + qrSchema);
        Assert.DoesNotContain("providerUrl", responseSchema + qrSchema);
        Assert.DoesNotContain("vaultKey", responseSchema + qrSchema);
        Assert.DoesNotContain("/api/v1/files", openApi);
        Assert.DoesNotContain("/api/v1/admin/payment-details", openApi);
        Assert.DoesNotContain("counterparty-payment-details", openApi);
    }

    [Fact]
    public void GeneratedClientsExposeSelfPaymentQrOperationsFromOpenApi()
    {
        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/client.dart"));
        var webModels = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/models.ts"));
        var dartModels = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/models.dart"));

        Assert.Contains("attachSelfPaymentQr", webClient);
        Assert.Contains("removeSelfPaymentQr", webClient);
        Assert.Contains("getSelfPaymentQrContent", webClient);
        Assert.Contains("attachSelfPaymentQr", dartClient);
        Assert.Contains("removeSelfPaymentQr", dartClient);
        Assert.Contains("getSelfPaymentQrContent", dartClient);
        Assert.Contains("SelfPaymentDetailsQrFileResponse", webModels);
        Assert.Contains("class SelfPaymentDetailsQrFileResponse", dartModels);
        Assert.Contains("qrFile", webModels);
        Assert.Contains("qrFile", dartModels);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new PaymentQrTestTimeProvider(InitialTimestamp);
        var storageProvider = new TestPaymentQrStorageProvider();
        var testFactory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<SettleoraDbContext>();
                services.RemoveAll<DbContextOptions>();
                services.RemoveAll<DbContextOptions<SettleoraDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<SettleoraDbContext>>();
                services.AddDbContext<SettleoraDbContext>(options =>
                {
                    options.UseInMemoryDatabase(databaseName);
                });

                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(timeProvider);

                services.RemoveAll<IFileObjectStorageProvider>();
                services.AddSingleton<IFileObjectStorageProvider>(storageProvider);
            });
        });

        return new FactoryTestContext(testFactory, timeProvider, storageProvider);
    }

    private static async Task<PaymentDetailsPayload> UploadQrAsync(
        HttpClient client,
        string rawSessionToken,
        byte[] bytes,
        string contentType,
        string filename)
    {
        using var request = CreateQrUploadRequest(rawSessionToken, bytes, contentType, filename);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return ReadPaymentDetailsPayload(content);
    }

    private static HttpRequestMessage CreateQrUploadRequest(
        string? rawSessionToken,
        byte[] bytes,
        string? contentType,
        string filename,
        string fieldName = "file")
    {
        var request = new HttpRequestMessage(HttpMethod.Post, PaymentQrPath);
        if (rawSessionToken is not null)
        {
            request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");
        }

        var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        if (!string.IsNullOrWhiteSpace(contentType))
        {
            fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        }

        form.Add(fileContent, fieldName, filename);
        request.Content = form;
        return request;
    }

    private static HttpRequestMessage CreateBearerRequest(
        HttpMethod method,
        string path,
        string rawSessionToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        PaymentQrTestTimeProvider timeProvider)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
        var account = await SeedAccountAsync(testFactory, "Self Payment QR Actor", InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Payment QR endpoint test",
                UserAgentSummary: "Payment QR endpoint test user agent",
                NetworkAddressHash: "payment-qr-endpoint-test-network",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededSession(
            account.AuthAccountId,
            account.UserProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            sessionCreationResult.SessionExpiresAtUtc.Value);
    }

    private static async Task<SeededAccount> SeedAccountAsync(
        WebApplicationFactory<Program> testFactory,
        string displayName,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
            DefaultCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });
        dbContext.Set<AuthIdentity>().Add(new AuthIdentity
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            ProviderType = AuthIdentityProviderTypes.Local,
            ProviderName = LocalSignInService.LocalProviderName,
            ProviderSubject = $"{authAccountId:D}@example.test",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
        return new SeededAccount(authAccountId, userProfileId);
    }

    private static async Task<FileObject> SeedLinkedFileAsync(
        WebApplicationFactory<Program> testFactory,
        Guid actorUserProfileId,
        Guid ownerUserProfileId,
        string purpose,
        string status)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var fileObject = new FileObject
        {
            Id = Guid.NewGuid(),
            OwnerUserProfileId = ownerUserProfileId,
            CreatedByUserProfileId = ownerUserProfileId,
            Purpose = purpose,
            Status = status,
            ContentType = "image/png",
            OriginalFilename = null,
            SizeBytes = ValidPngBytes.LongLength,
            Sha256Hash = Convert.ToHexString(SHA256.HashData(ValidPngBytes)).ToLowerInvariant(),
            StorageProvider = StorageProviderNames.Local,
            StorageObjectKey = $"file-objects/payment_qr/2026/05/05/{Guid.NewGuid():N}",
            EncryptionMode = FileObjectEncryptionModes.ServerManaged,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            DeletedAtUtc = status == FileObjectStatuses.Deleted ? InitialTimestamp : null
        };

        dbContext.Set<FileObject>().Add(fileObject);
        await EnsurePaymentProfileAsync(dbContext, actorUserProfileId, fileObject.Id);
        await dbContext.SaveChangesAsync();
        return fileObject;
    }

    private static async Task LinkPaymentProfileToFileAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId,
        Guid fileObjectId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        await EnsurePaymentProfileAsync(dbContext, userProfileId, fileObjectId);
        await dbContext.SaveChangesAsync();
    }

    private static async Task EnsurePaymentProfileAsync(
        SettleoraDbContext dbContext,
        Guid userProfileId,
        Guid fileObjectId)
    {
        var paymentProfile = await dbContext.Set<UserPaymentProfile>().SingleOrDefaultAsync(
            profile => profile.UserProfileId == userProfileId && profile.DeletedAtUtc == null);
        if (paymentProfile is null)
        {
            paymentProfile = new UserPaymentProfile
            {
                Id = Guid.NewGuid(),
                UserProfileId = userProfileId,
                Visibility = UserPaymentProfileVisibilities.Default,
                CreatedAtUtc = InitialTimestamp,
                UpdatedAtUtc = InitialTimestamp
            };
            dbContext.Set<UserPaymentProfile>().Add(paymentProfile);
        }

        paymentProfile.QrFileObjectId = fileObjectId;
        paymentProfile.UpdatedAtUtc = InitialTimestamp;
    }

    private static async Task MarkProfileDeletedAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var userProfile = await dbContext.Set<UserProfile>().SingleAsync(profile => profile.Id == userProfileId);
        userProfile.DeletedAtUtc = ValidationTimestamp;
        userProfile.UpdatedAtUtc = ValidationTimestamp;
        await dbContext.SaveChangesAsync();
    }

    private static async Task<UserPaymentProfile> ReadPaymentProfileAsync(
        WebApplicationFactory<Program> testFactory,
        Guid paymentProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<UserPaymentProfile>()
            .AsNoTracking()
            .SingleAsync(paymentProfile => paymentProfile.Id == paymentProfileId);
    }

    private static async Task<FileObject> ReadFileObjectAsync(
        WebApplicationFactory<Program> testFactory,
        Guid fileObjectId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<FileObject>()
            .AsNoTracking()
            .SingleAsync(fileObject => fileObject.Id == fileObjectId);
    }

    private static async Task<IReadOnlyList<FileObject>> ReadFileObjectsAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<FileObject>()
            .AsNoTracking()
            .OrderBy(fileObject => fileObject.CreatedAtUtc)
            .ThenBy(fileObject => fileObject.Id)
            .ToArrayAsync();
    }

    private static async Task<int> CountActivePaymentProfilesAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<UserPaymentProfile>().CountAsync(
            paymentProfile => paymentProfile.UserProfileId == userProfileId
                && paymentProfile.DeletedAtUtc == null);
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadPaymentQrAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action == PaymentQrAttachedAction
                || auditEvent.Action == PaymentQrReplacedAction
                || auditEvent.Action == PaymentQrRemovedAction)
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Action)
            .ToArrayAsync();
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadFileLifecycleAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action.StartsWith("file."))
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Action)
            .ToArrayAsync();
    }

    private static PaymentDetailsPayload ReadPaymentDetailsPayload(string content)
    {
        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;

        Assert.Equal(9, root.EnumerateObject().Count());
        return new PaymentDetailsPayload(
            root.GetProperty("isConfigured").GetBoolean(),
            ReadNullableGuid(root.GetProperty("id")),
            ReadNullableString(root.GetProperty("preferredMethodLabel")),
            ReadNullableString(root.GetProperty("paymentHandle")),
            ReadNullableString(root.GetProperty("paymentNote")),
            root.GetProperty("visibility").GetString()!,
            ReadQrPayload(root.GetProperty("qrFile")),
            ReadNullableDateTimeOffset(root.GetProperty("createdAtUtc")),
            ReadNullableDateTimeOffset(root.GetProperty("updatedAtUtc")));
    }

    private static PaymentQrPayload? ReadQrPayload(JsonElement value)
    {
        return value.ValueKind is JsonValueKind.Null
            ? null
            : new PaymentQrPayload(
                value.GetProperty("id").GetGuid(),
                value.GetProperty("contentType").GetString()!,
                value.GetProperty("sizeBytes").GetInt64(),
                value.GetProperty("updatedAtUtc").GetDateTimeOffset());
    }

    private static Guid? ReadNullableGuid(JsonElement value)
    {
        return value.ValueKind is JsonValueKind.Null
            ? null
            : value.GetGuid();
    }

    private static string? ReadNullableString(JsonElement value)
    {
        return value.ValueKind is JsonValueKind.Null
            ? null
            : value.GetString();
    }

    private static DateTimeOffset? ReadNullableDateTimeOffset(JsonElement value)
    {
        return value.ValueKind is JsonValueKind.Null
            ? null
            : value.GetDateTimeOffset();
    }

    private static void AssertPaymentQrFileObject(
        FileObject fileObject,
        Guid expectedUserProfileId,
        string expectedStatus,
        string expectedContentType,
        byte[] expectedBytes)
    {
        Assert.Equal(expectedUserProfileId, fileObject.OwnerUserProfileId);
        Assert.Equal(expectedUserProfileId, fileObject.CreatedByUserProfileId);
        Assert.Equal(FileObjectPurposes.PaymentQr, fileObject.Purpose);
        Assert.Equal(expectedStatus, fileObject.Status);
        Assert.Equal(expectedContentType, fileObject.ContentType);
        Assert.Equal(expectedBytes.LongLength, fileObject.SizeBytes);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(expectedBytes)).ToLowerInvariant(), fileObject.Sha256Hash);
        Assert.Equal(StorageProviderNames.Local, fileObject.StorageProvider);
        Assert.Equal(FileObjectEncryptionModes.ServerManaged, fileObject.EncryptionMode);
        Assert.Null(fileObject.VaultKeyRef);
        Assert.Null(fileObject.RetentionPolicy);
        Assert.DoesNotContain("storage-root", fileObject.StorageObjectKey, StringComparison.OrdinalIgnoreCase);
    }

    private static void AssertPaymentQrAuditMetadata(
        AuthAuditEvent auditEvent,
        string expectedAction,
        Guid expectedPaymentProfileId,
        Guid expectedQrFileObjectId,
        bool rowCreated,
        string expectedChangeCategory,
        params string[] forbiddenValues)
    {
        Assert.Equal(expectedAction, auditEvent.Action);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.NotNull(auditEvent.SafeMetadataJson);
        Assert.True(auditEvent.SafeMetadataJson!.Length <= 4096);

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);
        Assert.Equal("payment_details_self_profile", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(expectedPaymentProfileId.ToString("D"), metadata.RootElement.GetProperty("paymentProfileId").GetString());
        Assert.Equal(expectedQrFileObjectId.ToString("D"), metadata.RootElement.GetProperty("qrFileObjectId").GetString());
        Assert.Equal(rowCreated, metadata.RootElement.GetProperty("rowCreated").GetBoolean());
        Assert.Equal(expectedChangeCategory, metadata.RootElement.GetProperty("changeCategory").GetString());

        var fields = metadata.RootElement.GetProperty("fieldsChanged")
            .EnumerateArray()
            .Select(field => field.GetString()!)
            .ToArray();
        Assert.Equal(["qr_file"], fields);

        AssertSafeAuditContent(auditEvent, forbiddenValues);
    }

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task AssertPaymentDetailsUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Payment details unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static void AssertSafeProblemContent(
        string content,
        string? unexpectedResponseText = null)
    {
        var lowerContent = content.ToLowerInvariant();

        if (unexpectedResponseText is not null)
        {
            Assert.DoesNotContain(unexpectedResponseText, content);
        }

        Assert.DoesNotContain(WrongRawToken, content);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("metadata", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("vault", lowerContent);
        Assert.DoesNotContain("counterparty", lowerContent);
    }

    private static void AssertSafeQrResponseContent(
        string content,
        params string[] forbiddenValues)
    {
        var lowerContent = content.ToLowerInvariant();

        foreach (var forbiddenValue in forbiddenValues)
        {
            Assert.DoesNotContain(forbiddenValue, content);
        }

        Assert.DoesNotContain("auth", lowerContent);
        Assert.DoesNotContain("account", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("metadata", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("vault", lowerContent);
        Assert.DoesNotContain("counterparty", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("rootpath", lowerContent);
        Assert.DoesNotContain("providerurl", lowerContent);
    }

    private static void AssertSafeAuditContent(
        AuthAuditEvent auditEvent,
        params string[] forbiddenValues)
    {
        var auditText = string.Join(
            "\n",
            auditEvent.Action,
            auditEvent.Outcome,
            auditEvent.SafeMetadataJson ?? string.Empty);
        var lowerAuditText = auditText.ToLowerInvariant();

        foreach (var forbiddenValue in forbiddenValues)
        {
            Assert.DoesNotContain(forbiddenValue, auditText);
        }

        Assert.DoesNotContain("request", lowerAuditText);
        Assert.DoesNotContain("body", lowerAuditText);
        Assert.DoesNotContain("token", lowerAuditText);
        Assert.DoesNotContain("password", lowerAuditText);
        Assert.DoesNotContain("credential", lowerAuditText);
        Assert.DoesNotContain("verifier", lowerAuditText);
        Assert.DoesNotContain("providerurl", lowerAuditText);
        Assert.DoesNotContain("storageobjectkey", lowerAuditText);
        Assert.DoesNotContain("storage_object_key", lowerAuditText);
        Assert.DoesNotContain("path", lowerAuditText);
        Assert.DoesNotContain("vault", lowerAuditText);
    }

    private static string FindRepoFile(string relativePath)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, relativePath);
            if (File.Exists(candidate))
            {
                return candidate;
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException($"Could not find {relativePath} from {AppContext.BaseDirectory}.");
    }

    private static string ExtractOpenApiPathBlock(string openApi, string pathHeader)
    {
        var start = openApi.IndexOf(pathHeader, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Could not find OpenAPI path block {pathHeader}.");

        var nextPath = openApi.IndexOf("\n  /", start + pathHeader.Length, StringComparison.Ordinal);
        return nextPath < 0
            ? openApi[start..]
            : openApi[start..nextPath];
    }

    private static string ExtractOpenApiSchemaBlock(string openApi, string schemaHeader)
    {
        var start = openApi.IndexOf($"    {schemaHeader}", StringComparison.Ordinal);
        Assert.True(start >= 0, $"Could not find OpenAPI schema block {schemaHeader}.");

        var nextSchema = openApi.IndexOf("\n    ", start + schemaHeader.Length + 4, StringComparison.Ordinal);
        while (nextSchema >= 0
            && openApi.Length > nextSchema + 5
            && openApi[nextSchema + 5] is ' ')
        {
            nextSchema = openApi.IndexOf("\n    ", nextSchema + 1, StringComparison.Ordinal);
        }

        return nextSchema < 0
            ? openApi[start..]
            : openApi[start..nextSchema];
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        PaymentQrTestTimeProvider TimeProvider,
        TestPaymentQrStorageProvider StorageProvider);

    private sealed record SeededAccount(
        Guid AuthAccountId,
        Guid UserProfileId);

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset SessionExpiresAtUtc);

    private sealed record PaymentDetailsPayload(
        bool IsConfigured,
        Guid? Id,
        string? PreferredMethodLabel,
        string? PaymentHandle,
        string? PaymentNote,
        string Visibility,
        PaymentQrPayload? QrFile,
        DateTimeOffset? CreatedAtUtc,
        DateTimeOffset? UpdatedAtUtc);

    private sealed record PaymentQrPayload(
        Guid Id,
        string ContentType,
        long SizeBytes,
        DateTimeOffset UpdatedAtUtc);

    private sealed class PaymentQrTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public PaymentQrTestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }

        public void SetUtcNow(DateTimeOffset value)
        {
            utcNow = value;
        }
    }

    private sealed class TestPaymentQrStorageProvider : IFileObjectStorageProvider
    {
        private readonly Dictionary<string, byte[]> storedObjects = new(StringComparer.Ordinal);

        public string ProviderName => StorageProviderNames.Local;

        public bool FailWrites { get; set; }

        public string CreateObjectKey(string purpose, Guid fileObjectId, DateTimeOffset createdAtUtc)
        {
            return string.Join(
                '/',
                "file-objects",
                purpose,
                createdAtUtc.Year.ToString("0000"),
                createdAtUtc.Month.ToString("00"),
                createdAtUtc.Day.ToString("00"),
                fileObjectId.ToString("N"));
        }

        public async Task WriteAsync(string objectKey, Stream content, CancellationToken cancellationToken)
        {
            if (FailWrites)
            {
                throw new IOException("Simulated QR storage write failure.");
            }

            await using var buffer = new MemoryStream();
            await content.CopyToAsync(buffer, cancellationToken);
            storedObjects.Add(objectKey, buffer.ToArray());
        }

        public Task<Stream> OpenReadAsync(string objectKey, CancellationToken cancellationToken)
        {
            if (!storedObjects.TryGetValue(objectKey, out var bytes))
            {
                throw new FileNotFoundException("Simulated missing QR object.");
            }

            Stream stream = new MemoryStream(bytes, writable: false);
            return Task.FromResult(stream);
        }

        public Task DeleteAsync(string objectKey, CancellationToken cancellationToken)
        {
            storedObjects.Remove(objectKey);
            return Task.CompletedTask;
        }

        public byte[] ReadStoredBytes(string objectKey)
        {
            return storedObjects[objectKey];
        }
    }
}
