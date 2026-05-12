using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Storage;

namespace Settleora.Api.Tests;

public sealed class ReceiptOcrReviewEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WrongRawToken = "wrong-receipt-ocr-review-session-token";
    private const string HiddenOriginalFilename = "private-receipt-name.png";
    private const string HiddenStorageObjectKey = "private/storage/object-key";
    private const string HiddenRawOcrText = "RAW OCR FULL TEXT SECRET";
    private const string ReviewSavedAction = "bill_attachment.ocr_review_saved";
    private const string ReviewReadAction = "bill_attachment.ocr_review_read";
    private const string ReviewRemovedAction = "bill_attachment.ocr_review_removed";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 12, 1, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 12, 1, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 12, 1, 30, 0, TimeSpan.Zero);
    private static readonly byte[] ValidPngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01];

    private readonly WebApplicationFactory<Program> factory;

    public ReceiptOcrReviewEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PersonalBillOwnerCanSaveParticipantCanReadAndOwnerCanRemoveReceiptOcrReviewWithoutMutatingBillTruth()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Receipt OCR Owner");
        var participant = await SeedAccountAsync(testFactory, "Receipt OCR Participant", InitialTimestamp.AddMinutes(1));
        var participantSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, participant);
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId, participant.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var fileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var beforeBillItems = await CountBillItemsAsync(testFactory, billId);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using var putRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            PersonalOcrReviewPath(billId, fileId),
            ownerSession.RawSessionToken,
            ValidReviewJson());
        using var putResponse = await client.SendAsync(putRequest);
        var putContent = await putResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, putResponse.StatusCode);
        Assert.Equal(PersonalOcrReviewPath(billId, fileId), putResponse.Headers.Location?.OriginalString);
        AssertSafeReviewJson(putContent);
        var savedPayload = ReadReviewPayload(putContent);
        Assert.Equal(billId, savedPayload.BillId);
        Assert.Equal(fileId, savedPayload.FileId);
        Assert.Null(savedPayload.GroupId);
        Assert.Equal(ReceiptOcrReviewStatuses.Provisional, savedPayload.Status);
        Assert.Equal(ReceiptOcrReviewSources.OnDevice, savedPayload.Source);
        Assert.Equal("Cafe Central", savedPayload.MerchantText);
        Assert.Equal("USD", savedPayload.Currency);
        Assert.Equal("11.5", savedPayload.GrandTotalAmount);
        Assert.Equal(["Latte", "Bagel"], savedPayload.Lines.Select(line => line.Text).ToArray());

        var savedReview = await ReadReceiptOcrReviewAsync(testFactory, savedPayload.Id);
        Assert.Equal(ownerSession.UserProfileId, savedReview.CreatedByUserProfileId);
        Assert.Equal(2, savedReview.Lines.Count);
        Assert.Null(savedReview.RemovedAtUtc);
        Assert.Equal(beforeBillItems, await CountBillItemsAsync(testFactory, billId));
        Assert.Empty(await ReadSettlementRequestsAsync(testFactory));
        Assert.Null((await ReadBillAttachmentAsync(testFactory, billId, fileId)).RemovedAtUtc);
        Assert.Equal(FileObjectStatuses.Active, (await ReadFileObjectAsync(testFactory, fileId)).Status);

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(1));
        using (var getRequest = CreateBearerRequest(HttpMethod.Get, PersonalOcrReviewPath(billId, fileId), participantSession.RawSessionToken))
        using (var getResponse = await client.SendAsync(getRequest))
        {
            var getContent = await getResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
            AssertSafeReviewJson(getContent);
            Assert.Equal(savedPayload.Id, ReadReviewPayload(getContent).Id);
        }

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(2));
        using (var deleteRequest = CreateBearerRequest(HttpMethod.Delete, PersonalOcrReviewPath(billId, fileId), ownerSession.RawSessionToken))
        using (var deleteResponse = await client.SendAsync(deleteRequest))
        {
            Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);
        }

        var removedReview = await ReadReceiptOcrReviewAsync(testFactory, savedPayload.Id);
        Assert.Equal(WriteTimestamp.AddMinutes(2), removedReview.RemovedAtUtc);
        Assert.Equal(FileObjectStatuses.Active, (await ReadFileObjectAsync(testFactory, fileId)).Status);
        Assert.Null((await ReadBillAttachmentAsync(testFactory, billId, fileId)).RemovedAtUtc);

        using (var removedGetRequest = CreateBearerRequest(HttpMethod.Get, PersonalOcrReviewPath(billId, fileId), ownerSession.RawSessionToken))
        using (var removedGetResponse = await client.SendAsync(removedGetRequest))
        {
            await AssertReceiptOcrReviewUnavailableProblemAsync(removedGetResponse);
        }

        var audits = await ReadReceiptOcrReviewAuditEventsAsync(testFactory);
        Assert.Equal([ReviewSavedAction, ReviewReadAction, ReviewRemovedAction], audits.Select(audit => audit.Action).ToArray());
        AssertReviewAuditMetadata(audits[0], ReviewSavedAction, billId, groupId: null, fileId, savedPayload.Id, "ocr_review_saved");
        AssertReviewAuditMetadata(audits[1], ReviewReadAction, billId, groupId: null, fileId, savedPayload.Id, "ocr_review_read");
        AssertReviewAuditMetadata(audits[2], ReviewRemovedAction, billId, groupId: null, fileId, savedPayload.Id, "ocr_review_removed");
    }

    [Fact]
    public async Task GroupBillReceiptOcrReviewUsesRouteGroupAccessAndSafeGroupScopedResponse()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Group OCR Owner");
        var participant = await SeedAccountAsync(testFactory, "Group OCR Participant", InitialTimestamp.AddMinutes(1));
        var participantSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, participant);
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Receipt OCR Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(participant.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId, participant.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var fileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using var putRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            GroupOcrReviewPath(groupId, billId, fileId),
            ownerSession.RawSessionToken,
            ValidReviewJson(ReceiptOcrReviewStatuses.Reviewed, ReceiptOcrReviewSources.ManualEntry));
        using var putResponse = await client.SendAsync(putRequest);
        var putContent = await putResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, putResponse.StatusCode);
        var savedPayload = ReadReviewPayload(putContent);
        Assert.Equal(groupId, savedPayload.GroupId);
        Assert.Equal(ReceiptOcrReviewStatuses.Reviewed, savedPayload.Status);
        Assert.Equal(ReceiptOcrReviewSources.ManualEntry, savedPayload.Source);

        using var getRequest = CreateBearerRequest(
            HttpMethod.Get,
            GroupOcrReviewPath(groupId, billId, fileId),
            participantSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var getContent = await getResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        AssertSafeReviewJson(getContent);
        Assert.Equal(savedPayload.Id, ReadReviewPayload(getContent).Id);
    }

    [Fact]
    public async Task DeniedActorsWrongRoutesLockedBillsAndNonReceiptAttachmentsFailClosed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Denied OCR Owner");
        var participant = await SeedAccountAsync(testFactory, "Denied OCR Participant", InitialTimestamp.AddMinutes(1));
        var participantSession = await SeedSessionForAccountAsync(testFactory, testContext.TimeProvider, participant);
        var outsiderSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Denied OCR Outsider");
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Denied OCR Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(participant.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active),
            new MembershipSeed(outsiderSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Active));
        var wrongGroupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Wrong OCR Group",
            InitialTimestamp,
            deletedAtUtc: null,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active));
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId, participant.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var otherBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(3));
        var finalizedBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Finalized,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(4));
        var archivedBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: InitialTimestamp.AddMinutes(5),
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(5));
        var receiptFileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var finalizedFileId = await SeedBillAttachmentAsync(
            testFactory,
            finalizedBillId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var archivedFileId = await SeedBillAttachmentAsync(
            testFactory,
            archivedBillId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        var removedFileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: InitialTimestamp.AddMinutes(6));
        var deletedFileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Deleted,
            removedAtUtc: null);
        var supportingFileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.SupportingAttachment,
            FileObjectPurposes.SupportingAttachment,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();

        using (var outsiderRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            GroupOcrReviewPath(groupId, billId, receiptFileId),
            outsiderSession.RawSessionToken,
            ValidReviewJson()))
        using (var outsiderResponse = await client.SendAsync(outsiderRequest))
        {
            await AssertBillUnavailableProblemAsync(outsiderResponse);
        }

        using (var participantMutationRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            GroupOcrReviewPath(groupId, billId, receiptFileId),
            participantSession.RawSessionToken,
            ValidReviewJson()))
        using (var participantMutationResponse = await client.SendAsync(participantMutationRequest))
        {
            await AssertBillUnavailableProblemAsync(participantMutationResponse);
        }

        using (var wrongBillRequest = CreateBearerRequest(HttpMethod.Get, GroupOcrReviewPath(groupId, otherBillId, receiptFileId), ownerSession.RawSessionToken))
        using (var wrongBillResponse = await client.SendAsync(wrongBillRequest))
        {
            await AssertBillUnavailableProblemAsync(wrongBillResponse);
        }

        using (var wrongGroupRequest = CreateBearerRequest(HttpMethod.Get, GroupOcrReviewPath(wrongGroupId, billId, receiptFileId), ownerSession.RawSessionToken))
        using (var wrongGroupResponse = await client.SendAsync(wrongGroupRequest))
        {
            await AssertBillUnavailableProblemAsync(wrongGroupResponse);
        }

        await UpdateMembershipStatusAsync(testFactory, groupId, participant.UserProfileId, GroupMembershipStatuses.Removed);
        using (var removedMemberRequest = CreateBearerRequest(HttpMethod.Get, GroupOcrReviewPath(groupId, billId, receiptFileId), participantSession.RawSessionToken))
        using (var removedMemberResponse = await client.SendAsync(removedMemberRequest))
        {
            await AssertBillUnavailableProblemAsync(removedMemberResponse);
        }

        using (var finalizedRequest = CreateJsonBearerRequest(HttpMethod.Put, PersonalOcrReviewPath(finalizedBillId, finalizedFileId), ownerSession.RawSessionToken, ValidReviewJson()))
        using (var finalizedResponse = await client.SendAsync(finalizedRequest))
        {
            await AssertReceiptOcrReviewConflictProblemAsync(finalizedResponse);
        }

        using (var archivedRequest = CreateJsonBearerRequest(HttpMethod.Put, PersonalOcrReviewPath(archivedBillId, archivedFileId), ownerSession.RawSessionToken, ValidReviewJson()))
        using (var archivedResponse = await client.SendAsync(archivedRequest))
        {
            await AssertBillUnavailableProblemAsync(archivedResponse);
        }

        foreach (var blockedFileId in new[] { removedFileId, deletedFileId, supportingFileId })
        {
            using var blockedRequest = CreateJsonBearerRequest(
                HttpMethod.Put,
                GroupOcrReviewPath(groupId, billId, blockedFileId),
                ownerSession.RawSessionToken,
                ValidReviewJson());
            using var blockedResponse = await client.SendAsync(blockedRequest);
            await AssertBillUnavailableProblemAsync(blockedResponse);
        }

        Assert.Empty(await ReadReceiptOcrReviewsAsync(testFactory));
        Assert.Empty(await ReadReceiptOcrReviewAuditEventsAsync(testFactory));
    }

    [Fact]
    public async Task InvalidReceiptOcrReviewPayloadsAreRejectedWithoutPersistingReviewRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Invalid OCR Owner");
        var billId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            ExpenseBillStatuses.Confirmed,
            archivedAtUtc: null,
            [ownerSession.UserProfileId],
            [ownerSession.UserProfileId],
            InitialTimestamp.AddMinutes(2));
        var fileId = await SeedBillAttachmentAsync(
            testFactory,
            billId,
            ownerSession.UserProfileId,
            ExpenseBillAttachmentPurposes.Receipt,
            FileObjectPurposes.ReceiptImage,
            FileObjectStatuses.Active,
            removedAtUtc: null);
        using var client = testFactory.CreateClient();

        var tooManyLines = string.Join(
            ',',
            Enumerable.Range(0, ReceiptOcrReviewConstraints.MaxLineCount + 1)
                .Select(index => $$"""{"text":"Line {{index}}"}"""));
        var invalidPayloads = new[]
        {
            "{}",
            $$"""{"status":"provisional","source":"on_device","merchantText":"{{new string('x', 201)}}"}""",
            """{"status":"accepted","source":"on_device","merchantText":"Cafe"}""",
            """{"status":"provisional","source":"unknown","merchantText":"Cafe"}""",
            """{"status":"provisional","source":"on_device","currency":"usd","grandTotalAmount":"10.00"}""",
            """{"status":"provisional","source":"on_device","currency":"USD","grandTotalAmount":"1e2"}""",
            """{"status":"provisional","source":"on_device","currency":"USD","grandTotalAmount":"-1.00"}""",
            """{"status":"provisional","source":"on_device","grandTotalAmount":"10.00"}""",
            """{"status":"provisional","source":"on_device","currency":"USD","lines":[{"text":"Latte","quantity":"0"}]}""",
            $$"""{"status":"provisional","source":"on_device","lines":[{{tooManyLines}}]}"""
        };

        foreach (var payload in invalidPayloads)
        {
            using var request = CreateJsonBearerRequest(
                HttpMethod.Put,
                PersonalOcrReviewPath(billId, fileId),
                ownerSession.RawSessionToken,
                payload);
            using var response = await client.SendAsync(request);
            await AssertInvalidReceiptOcrReviewProblemAsync(response, payload);
        }

        using (var unauthenticatedRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            PersonalOcrReviewPath(billId, fileId),
            rawSessionToken: null,
            ValidReviewJson()))
        using (var unauthenticatedResponse = await client.SendAsync(unauthenticatedRequest))
        {
            await AssertUnauthenticatedProblemAsync(unauthenticatedResponse);
        }

        using (var wrongTokenRequest = CreateBearerRequest(HttpMethod.Get, PersonalOcrReviewPath(billId, fileId), WrongRawToken))
        using (var wrongTokenResponse = await client.SendAsync(wrongTokenRequest))
        {
            await AssertUnauthenticatedProblemAsync(wrongTokenResponse);
        }

        Assert.Empty(await ReadReceiptOcrReviewsAsync(testFactory));
        Assert.Empty(await ReadReceiptOcrReviewLinesAsync(testFactory));
        Assert.Empty(await ReadReceiptOcrReviewAuditEventsAsync(testFactory));
    }

    [Fact]
    public void OpenApiAndGeneratedClientsExposeReceiptOcrReviewIntakeWithoutGenericFilesOrRawText()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var personalBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/bills/{billId}/attachments/{fileId}/ocr-review:");
        var groupBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/groups/{groupId}/bills/{billId}/attachments/{fileId}/ocr-review:");
        var requestSchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewUpsertRequest:");
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "ReceiptOcrReviewResponse:");

        Assert.Contains("operationId: upsertPersonalBillAttachmentOcrReview", personalBlock);
        Assert.Contains("operationId: getPersonalBillAttachmentOcrReview", personalBlock);
        Assert.Contains("operationId: removePersonalBillAttachmentOcrReview", personalBlock);
        Assert.Contains("operationId: upsertGroupBillAttachmentOcrReview", groupBlock);
        Assert.Contains("operationId: getGroupBillAttachmentOcrReview", groupBlock);
        Assert.Contains("operationId: removeGroupBillAttachmentOcrReview", groupBlock);
        Assert.Contains("provisional", openApi);
        Assert.Contains("reviewed", openApi);
        Assert.Contains("on_device", openApi);
        Assert.Contains("imported_reviewed_data", openApi);
        Assert.Contains("maxItems: 100", requestSchema);
        Assert.Contains("grandTotalAmount", responseSchema);
        Assert.Contains("lines", responseSchema);
        Assert.DoesNotContain("rawText", requestSchema + responseSchema, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storageObjectKey", requestSchema + responseSchema, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("providerPath", requestSchema + responseSchema, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("signedUrl", requestSchema + responseSchema, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("/api/v1/files", openApi);
        Assert.DoesNotContain("/api/v1/receipts", openApi);

        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/generated/client.dart"));
        var webModels = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/models.ts"));
        var dartModels = File.ReadAllText(FindRepoFile("packages/client-dart/generated/models.dart"));

        Assert.Contains("upsertPersonalBillAttachmentOcrReview", webClient);
        Assert.Contains("getPersonalBillAttachmentOcrReview", webClient);
        Assert.Contains("removePersonalBillAttachmentOcrReview", webClient);
        Assert.Contains("upsertGroupBillAttachmentOcrReview", dartClient);
        Assert.Contains("getGroupBillAttachmentOcrReview", dartClient);
        Assert.Contains("removeGroupBillAttachmentOcrReview", dartClient);
        Assert.Contains("ReceiptOcrReviewResponse", webModels);
        Assert.Contains("ReceiptOcrReviewUpsertRequest", webModels);
        Assert.Contains("class ReceiptOcrReviewResponse", dartModels);
        Assert.Contains("class ReceiptOcrReviewUpsertRequest", dartModels);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new ReceiptOcrReviewTestTimeProvider(InitialTimestamp);
        var testFactory = factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
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
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static string ValidReviewJson(
        string status = ReceiptOcrReviewStatuses.Provisional,
        string source = ReceiptOcrReviewSources.OnDevice)
    {
        return $$"""
            {
              "status": "{{status}}",
              "source": "{{source}}",
              "merchantText": "Cafe Central",
              "receiptIssuedAtUtc": "2026-05-12T08:00:00Z",
              "currency": "USD",
              "subtotalAmount": "10.00",
              "taxAmount": "0.80",
              "serviceChargeAmount": "1.20",
              "discountAmount": "0.50",
              "grandTotalAmount": "11.50",
              "lines": [
                {
                  "text": "Latte",
                  "quantity": "1",
                  "unitPriceAmount": "5.25",
                  "lineTotalAmount": "5.25"
                },
                {
                  "text": "Bagel",
                  "quantity": "2",
                  "unitPriceAmount": "2.50",
                  "lineTotalAmount": "5.00"
                }
              ]
            }
            """;
    }

    private static HttpRequestMessage CreateJsonBearerRequest(
        HttpMethod method,
        string path,
        string? rawSessionToken,
        string json)
    {
        var request = new HttpRequestMessage(method, path);
        if (rawSessionToken is not null)
        {
            request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");
        }

        request.Content = new StringContent(json, Encoding.UTF8, "application/json");
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
        ReceiptOcrReviewTestTimeProvider timeProvider,
        string displayName)
    {
        var account = await SeedAccountAsync(testFactory, displayName, InitialTimestamp);
        return await SeedSessionForAccountAsync(testFactory, timeProvider, account);
    }

    private static async Task<SeededAccount> SeedAccountAsync(
        WebApplicationFactory<Program> testFactory,
        string displayName,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? deletedAtUtc = null)
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
            UpdatedAtUtc = createdAtUtc,
            DeletedAtUtc = deletedAtUtc
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
        return new SeededAccount(authAccountId, userProfileId);
    }

    private static async Task<SeededSession> SeedSessionForAccountAsync(
        WebApplicationFactory<Program> testFactory,
        ReceiptOcrReviewTestTimeProvider timeProvider,
        SeededAccount account)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Receipt OCR review endpoint test",
                UserAgentSummary: "Receipt OCR review endpoint test user agent",
                NetworkAddressHash: "receipt-ocr-review-endpoint-test-network",
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

    private static async Task<Guid> SeedGroupAsync(
        WebApplicationFactory<Program> testFactory,
        Guid creatorUserProfileId,
        string name,
        DateTimeOffset createdAtUtc,
        DateTimeOffset? deletedAtUtc,
        params MembershipSeed[] memberships)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var groupId = Guid.NewGuid();
        dbContext.Set<UserGroup>().Add(new UserGroup
        {
            Id = groupId,
            Name = name,
            CreatedByUserProfileId = creatorUserProfileId,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            DeletedAtUtc = deletedAtUtc
        });

        foreach (var membership in memberships)
        {
            dbContext.Set<GroupMembership>().Add(new GroupMembership
            {
                GroupId = groupId,
                UserProfileId = membership.UserProfileId,
                Role = membership.Role,
                Status = membership.Status,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        await dbContext.SaveChangesAsync();
        return groupId;
    }

    private static async Task<Guid> SeedBillAsync(
        WebApplicationFactory<Program> testFactory,
        Guid ownerProfileId,
        Guid? groupId,
        string status,
        DateTimeOffset? archivedAtUtc,
        IReadOnlyList<Guid> participantIds,
        IReadOnlyList<Guid> payerIds,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var billId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var totalAmount = participantIds.Count * 10m;
        var bill = new ExpenseBill
        {
            Id = billId,
            CreatedByUserProfileId = ownerProfileId,
            BillOwnerUserProfileId = ownerProfileId,
            GroupId = groupId,
            MerchantName = "Seeded bill merchant",
            BillDate = DateOnly.FromDateTime(createdAtUtc.UtcDateTime),
            Status = status,
            TotalAmount = totalAmount,
            TotalCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            ArchivedAtUtc = archivedAtUtc
        };
        var item = new ExpenseBillItem
        {
            Id = itemId,
            ExpenseBillId = billId,
            Name = "Seeded bill item",
            Amount = totalAmount,
            Currency = "USD",
            SortOrder = 0,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };

        for (var index = 0; index < participantIds.Count; index++)
        {
            var participantId = participantIds[index];
            bill.Participants.Add(new ExpenseBillParticipant
            {
                ExpenseBillId = billId,
                UserProfileId = participantId,
                Status = ExpenseBillParticipantStatuses.Accepted,
                ResolvedShareAmount = 10m,
                ResolvedShareCurrency = "USD",
                AcceptedAtUtc = createdAtUtc,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
            item.Splits.Add(new ExpenseBillItemSplit
            {
                Id = Guid.NewGuid(),
                ExpenseBillItemId = itemId,
                UserProfileId = participantId,
                SplitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                BasisValue = 10m,
                ResolvedAmount = 10m,
                ResolvedCurrency = "USD",
                AllocationOrder = index,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        bill.Items.Add(item);
        foreach (var payerId in payerIds)
        {
            bill.Payers.Add(new ExpenseBillPayer
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = billId,
                UserProfileId = payerId,
                Amount = totalAmount,
                Currency = "USD",
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        dbContext.Set<ExpenseBill>().Add(bill);
        await dbContext.SaveChangesAsync();
        return billId;
    }

    private static async Task<Guid> SeedBillAttachmentAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid fileOwnerUserProfileId,
        string attachmentPurpose,
        string fileObjectPurpose,
        string status,
        DateTimeOffset? removedAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var fileObjectId = Guid.NewGuid();
        dbContext.Set<FileObject>().Add(new FileObject
        {
            Id = fileObjectId,
            OwnerUserProfileId = fileOwnerUserProfileId,
            CreatedByUserProfileId = fileOwnerUserProfileId,
            Purpose = fileObjectPurpose,
            Status = status,
            ContentType = "image/png",
            OriginalFilename = HiddenOriginalFilename,
            SizeBytes = ValidPngBytes.LongLength,
            Sha256Hash = Convert.ToHexString(SHA256.HashData(ValidPngBytes)).ToLowerInvariant(),
            StorageProvider = StorageProviderNames.Local,
            StorageObjectKey = HiddenStorageObjectKey,
            EncryptionMode = FileObjectEncryptionModes.ServerManaged,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            DeletedAtUtc = status == FileObjectStatuses.Deleted ? InitialTimestamp : null
        });
        dbContext.Set<ExpenseBillAttachment>().Add(new ExpenseBillAttachment
        {
            ExpenseBillId = billId,
            FileObjectId = fileObjectId,
            Purpose = attachmentPurpose,
            CreatedByUserProfileId = fileOwnerUserProfileId,
            CreatedAtUtc = InitialTimestamp,
            RemovedAtUtc = removedAtUtc
        });

        await dbContext.SaveChangesAsync();
        return fileObjectId;
    }

    private static async Task UpdateMembershipStatusAsync(
        WebApplicationFactory<Program> testFactory,
        Guid groupId,
        Guid userProfileId,
        string status)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var membership = await dbContext.Set<GroupMembership>()
            .SingleAsync(candidate => candidate.GroupId == groupId && candidate.UserProfileId == userProfileId);
        membership.Status = status;
        membership.UpdatedAtUtc = ValidationTimestamp;
        await dbContext.SaveChangesAsync();
    }

    private static async Task<ReceiptOcrReview> ReadReceiptOcrReviewAsync(
        WebApplicationFactory<Program> testFactory,
        Guid reviewId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ReceiptOcrReview>()
            .AsNoTracking()
            .Include(review => review.Lines)
            .SingleAsync(review => review.Id == reviewId);
    }

    private static async Task<IReadOnlyList<ReceiptOcrReview>> ReadReceiptOcrReviewsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ReceiptOcrReview>()
            .AsNoTracking()
            .OrderBy(review => review.CreatedAtUtc)
            .ToArrayAsync();
    }

    private static async Task<IReadOnlyList<ReceiptOcrReviewLine>> ReadReceiptOcrReviewLinesAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ReceiptOcrReviewLine>()
            .AsNoTracking()
            .OrderBy(line => line.SortOrder)
            .ToArrayAsync();
    }

    private static async Task<ExpenseBillAttachment> ReadBillAttachmentAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid fileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBillAttachment>()
            .AsNoTracking()
            .SingleAsync(attachment => attachment.ExpenseBillId == billId
                && attachment.FileObjectId == fileId);
    }

    private static async Task<FileObject> ReadFileObjectAsync(
        WebApplicationFactory<Program> testFactory,
        Guid fileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<FileObject>()
            .AsNoTracking()
            .SingleAsync(fileObject => fileObject.Id == fileId);
    }

    private static async Task<int> CountBillItemsAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<ExpenseBillItem>()
            .AsNoTracking()
            .CountAsync(item => item.ExpenseBillId == billId);
    }

    private static async Task<IReadOnlyList<object>> ReadSettlementRequestsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<Settleora.Api.Domain.Settlements.SettlementRequest>()
            .AsNoTracking()
            .Cast<object>()
            .ToArrayAsync();
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadReceiptOcrReviewAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action.StartsWith("bill_attachment.ocr_review"))
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Action)
            .ToArrayAsync();
    }

    private static ReceiptOcrReviewPayload ReadReviewPayload(string content)
    {
        using var document = JsonDocument.Parse(content);
        var root = document.RootElement;
        Assert.Equal(
            [
                "billId",
                "createdAtUtc",
                "currency",
                "discountAmount",
                "fileId",
                "grandTotalAmount",
                "groupId",
                "id",
                "lines",
                "merchantText",
                "receiptIssuedAtUtc",
                "serviceChargeAmount",
                "source",
                "status",
                "subtotalAmount",
                "taxAmount",
                "updatedAtUtc"
            ],
            root.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal).ToArray());

        return new ReceiptOcrReviewPayload(
            root.GetProperty("id").GetGuid(),
            root.GetProperty("billId").GetGuid(),
            root.GetProperty("fileId").GetGuid(),
            root.GetProperty("groupId").ValueKind is JsonValueKind.Null
                ? null
                : root.GetProperty("groupId").GetGuid(),
            root.GetProperty("status").GetString()!,
            root.GetProperty("source").GetString()!,
            root.GetProperty("merchantText").GetString(),
            root.GetProperty("currency").GetString(),
            root.GetProperty("grandTotalAmount").GetString(),
            root.GetProperty("lines")
                .EnumerateArray()
                .Select(line => new ReceiptOcrReviewLinePayload(
                    line.GetProperty("id").GetGuid(),
                    line.GetProperty("sortOrder").GetInt32(),
                    line.GetProperty("text").GetString()!))
                .ToArray());
    }

    private static void AssertReviewAuditMetadata(
        AuthAuditEvent auditEvent,
        string expectedAction,
        Guid expectedBillId,
        Guid? groupId,
        Guid expectedFileId,
        Guid expectedReviewId,
        string expectedActionCategory)
    {
        Assert.Equal(expectedAction, auditEvent.Action);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.NotNull(auditEvent.SafeMetadataJson);
        Assert.True(auditEvent.SafeMetadataJson!.Length <= 4096);

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);
        Assert.Equal("receipt_ocr_review_intake", metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(expectedBillId.ToString("D"), metadata.RootElement.GetProperty("billId").GetString());
        if (groupId.HasValue)
        {
            Assert.Equal(groupId.Value.ToString("D"), metadata.RootElement.GetProperty("groupId").GetString());
            Assert.Equal("group", metadata.RootElement.GetProperty("groupMode").GetString());
        }
        else
        {
            Assert.False(metadata.RootElement.TryGetProperty("groupId", out _));
            Assert.Equal("personal", metadata.RootElement.GetProperty("groupMode").GetString());
        }

        Assert.Equal(expectedFileId.ToString("D"), metadata.RootElement.GetProperty("fileObjectId").GetString());
        Assert.Equal(expectedReviewId.ToString("D"), metadata.RootElement.GetProperty("receiptOcrReviewId").GetString());
        Assert.Equal(ExpenseBillAttachmentPurposes.Receipt, metadata.RootElement.GetProperty("attachmentPurpose").GetString());
        Assert.Equal(expectedActionCategory, metadata.RootElement.GetProperty("actionCategory").GetString());
        Assert.Equal(2, metadata.RootElement.GetProperty("lineCount").GetInt32());
        AssertSafeAuditContent(auditEvent);
    }

    private static async Task AssertUnauthenticatedProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task AssertBillUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bill unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task AssertReceiptOcrReviewUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Receipt OCR review unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task AssertInvalidReceiptOcrReviewProblemAsync(
        HttpResponseMessage response,
        string submittedPayload)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
        Assert.DoesNotContain(submittedPayload, content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid receipt OCR review", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.True(payload.RootElement.TryGetProperty("errors", out _));
    }

    private static async Task AssertReceiptOcrReviewConflictProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Receipt OCR review conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static void AssertSafeReviewJson(string content)
    {
        var lowerContent = content.ToLowerInvariant();
        Assert.DoesNotContain(HiddenOriginalFilename, content);
        Assert.DoesNotContain(HiddenStorageObjectKey, content);
        Assert.DoesNotContain(HiddenRawOcrText, content);
        Assert.DoesNotContain("auth", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("object_key", lowerContent);
        Assert.DoesNotContain("signedurl", lowerContent);
        Assert.DoesNotContain("rawtext", lowerContent);
    }

    private static void AssertSafeProblemContent(string content)
    {
        var lowerContent = content.ToLowerInvariant();
        Assert.DoesNotContain(WrongRawToken, content);
        Assert.DoesNotContain(HiddenRawOcrText, content);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("object_key", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("vault", lowerContent);
        Assert.DoesNotContain("cafe central", lowerContent);
        Assert.DoesNotContain("latte", lowerContent);
    }

    private static void AssertSafeAuditContent(AuthAuditEvent auditEvent)
    {
        var auditText = string.Join(
            "\n",
            auditEvent.Action,
            auditEvent.Outcome,
            auditEvent.SafeMetadataJson ?? string.Empty);
        var lowerAuditText = auditText.ToLowerInvariant();

        Assert.DoesNotContain(HiddenOriginalFilename, auditText);
        Assert.DoesNotContain(HiddenStorageObjectKey, auditText);
        Assert.DoesNotContain("Cafe Central", auditText);
        Assert.DoesNotContain("Latte", auditText);
        Assert.DoesNotContain(HiddenRawOcrText, auditText);
        Assert.DoesNotContain("requestbody", lowerAuditText);
        Assert.DoesNotContain("request_body", lowerAuditText);
        Assert.DoesNotContain("token", lowerAuditText);
        Assert.DoesNotContain("password", lowerAuditText);
        Assert.DoesNotContain("credential", lowerAuditText);
        Assert.DoesNotContain("verifier", lowerAuditText);
        Assert.DoesNotContain("provider", lowerAuditText);
        Assert.DoesNotContain("storageobjectkey", lowerAuditText);
        Assert.DoesNotContain("storage_object_key", lowerAuditText);
        Assert.DoesNotContain("path", lowerAuditText);
        Assert.DoesNotContain("vault", lowerAuditText);
        Assert.DoesNotContain("filename", lowerAuditText);
    }

    private static string PersonalOcrReviewPath(Guid billId, Guid fileId)
    {
        return $"/api/v1/bills/{billId:D}/attachments/{fileId:D}/ocr-review";
    }

    private static string GroupOcrReviewPath(Guid groupId, Guid billId, Guid fileId)
    {
        return $"/api/v1/groups/{groupId:D}/bills/{billId:D}/attachments/{fileId:D}/ocr-review";
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
        ReceiptOcrReviewTestTimeProvider TimeProvider);

    private sealed record SeededAccount(
        Guid AuthAccountId,
        Guid UserProfileId);

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset SessionExpiresAtUtc);

    private sealed record MembershipSeed(
        Guid UserProfileId,
        string Role,
        string Status);

    private sealed record ReceiptOcrReviewPayload(
        Guid Id,
        Guid BillId,
        Guid FileId,
        Guid? GroupId,
        string Status,
        string Source,
        string? MerchantText,
        string? Currency,
        string? GrandTotalAmount,
        IReadOnlyList<ReceiptOcrReviewLinePayload> Lines);

    private sealed record ReceiptOcrReviewLinePayload(
        Guid Id,
        int SortOrder,
        string Text);

    private sealed class ReceiptOcrReviewTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public ReceiptOcrReviewTestTimeProvider(DateTimeOffset utcNow)
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
}
