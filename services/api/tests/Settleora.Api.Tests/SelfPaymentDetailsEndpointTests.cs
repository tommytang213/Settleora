using System.Net;
using System.Text;
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
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class SelfPaymentDetailsEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string PaymentDetailsPath = "/api/v1/users/me/payment-details";
    private const string WrongRawToken = "visible-wrong-payment-details-session-token";
    private const string PaymentDetailsCreatedAction = "payment_details.created";
    private const string PaymentDetailsUpdatedAction = "payment_details.updated";
    private const string PaymentDetailsVisibilityChangedAction = "payment_details.visibility_changed";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 5, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 5, 10, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 5, 10, 30, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public SelfPaymentDetailsEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task GetWithoutPaymentProfileReturnsStableUnconfiguredDefaultVisibility()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, actor.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await ReadPaymentDetailsPayloadAsync(response);
        Assert.False(payload.IsConfigured);
        Assert.Null(payload.Id);
        Assert.Null(payload.PreferredMethodLabel);
        Assert.Null(payload.PaymentHandle);
        Assert.Null(payload.PaymentNote);
        Assert.Equal(UserPaymentProfileVisibilities.SettlementCounterpartiesOnly, payload.Visibility);
        Assert.Null(payload.CreatedAtUtc);
        Assert.Null(payload.UpdatedAtUtc);
    }

    [Fact]
    public async Task GetWithPaymentProfileReturnsConfiguredSelfDetailsOnly()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        var paymentProfileId = await SeedPaymentProfileAsync(
            testFactory,
            actor.UserProfileId,
            "FPS",
            "fps-123",
            "Use invoice reference",
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, actor.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await ReadPaymentDetailsPayloadAsync(response);
        Assert.True(payload.IsConfigured);
        Assert.Equal(paymentProfileId, payload.Id);
        Assert.Equal("FPS", payload.PreferredMethodLabel);
        Assert.Equal("fps-123", payload.PaymentHandle);
        Assert.Equal("Use invoice reference", payload.PaymentNote);
        Assert.Equal(UserPaymentProfileVisibilities.SettlementCounterpartiesOnly, payload.Visibility);
        Assert.Equal(InitialTimestamp, payload.CreatedAtUtc);
        Assert.Equal(InitialTimestamp, payload.UpdatedAtUtc);
    }

    [Fact]
    public async Task GetResponseDoesNotExposeAuthSessionCredentialStorageVaultCounterpartyOrUnrelatedUserData()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        var unrelated = await SeedAccountAsync(testFactory, "Unrelated Payment User", InitialTimestamp.AddMinutes(1));
        await SeedPaymentProfileAsync(
            testFactory,
            actor.UserProfileId,
            "PayMe",
            "self-payment-handle",
            "self payment note",
            UserPaymentProfileVisibilities.Private);
        await SeedPaymentProfileAsync(
            testFactory,
            unrelated.UserProfileId,
            "Hidden Method",
            "hidden-unrelated-handle",
            "hidden unrelated note",
            UserPaymentProfileVisibilities.GroupMembersWhenShared);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, actor.AuthSessionId);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, actor.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("self-payment-handle", content);
        Assert.DoesNotContain(actor.RawSessionToken, content);
        Assert.DoesNotContain(sessionTokenHash, content);
        Assert.DoesNotContain(actor.AuthAccountId.ToString("D"), content);
        Assert.DoesNotContain(unrelated.AuthAccountId.ToString("D"), content);
        Assert.DoesNotContain(unrelated.UserProfileId.ToString("D"), content);
        Assert.DoesNotContain("Unrelated Payment User", content);
        Assert.DoesNotContain("hidden-unrelated-handle", content);
        Assert.DoesNotContain("hidden unrelated note", content);
        AssertSafePaymentDetailsResponseContent(content);
    }

    [Fact]
    public async Task MissingOrInvalidSessionReturnsUniformUnauthenticatedProblemWithoutEchoingToken()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();

        using var missingResponse = await client.GetAsync(PaymentDetailsPath);
        await AssertUnauthenticatedProblemAsync(missingResponse);

        using var invalidRequest = CreateBearerRequest(HttpMethod.Get, WrongRawToken);
        using var invalidResponse = await client.SendAsync(invalidRequest);
        await AssertUnauthenticatedProblemAsync(invalidResponse, WrongRawToken);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("deleted")]
    public async Task MissingDeletedOrNotAllowedProfileFailsClosedWithSafeNotFound(string profileState)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        await MarkProfileUnavailableAsync(testFactory, actor.UserProfileId, profileState);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, actor.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertPaymentDetailsUnavailableProblemAsync(response);
    }

    [Fact]
    public async Task BusinessAuthorizationDeniedFailsClosedWithSafeNotFound()
    {
        var testContext = CreateFactory(new DenyingBusinessAuthorizationService());
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, actor.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertPaymentDetailsUnavailableProblemAsync(response);
    }

    [Fact]
    public async Task PatchCreatesPaymentProfileForCurrentActorWithDefaultVisibilityAndSafeAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            actor.RawSessionToken,
            "{\"preferredMethodLabel\":\"  FPS  \",\"paymentHandle\":\"  fps-123  \",\"paymentNote\":\" Pay by Friday \"}");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await ReadPaymentDetailsPayloadAsync(response);
        Assert.True(payload.IsConfigured);
        Assert.NotNull(payload.Id);
        Assert.Equal("FPS", payload.PreferredMethodLabel);
        Assert.Equal("fps-123", payload.PaymentHandle);
        Assert.Equal("Pay by Friday", payload.PaymentNote);
        Assert.Equal(UserPaymentProfileVisibilities.SettlementCounterpartiesOnly, payload.Visibility);
        Assert.Equal(WriteTimestamp, payload.CreatedAtUtc);
        Assert.Equal(WriteTimestamp, payload.UpdatedAtUtc);

        var paymentProfile = await ReadPaymentProfileAsync(testFactory, payload.Id!.Value);
        Assert.Equal(actor.UserProfileId, paymentProfile.UserProfileId);
        Assert.Equal(UserPaymentProfileVisibilities.SettlementCounterpartiesOnly, paymentProfile.Visibility);
        Assert.Equal(1, await CountActivePaymentProfilesAsync(testFactory, actor.UserProfileId));

        var auditEvent = await AssertSinglePaymentDetailsAuditEventAsync(
            testFactory,
            PaymentDetailsCreatedAction,
            actor.AuthAccountId,
            WriteTimestamp);
        AssertPaymentDetailsAuditMetadata(
            auditEvent,
            payload.Id.Value,
            rowCreated: true,
            expectedFields:
            [
                "payment_handle",
                "payment_note",
                "preferred_method_label"
            ],
            previousVisibility: null,
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly);
        AssertSafePaymentDetailsAuditContent(
            auditEvent,
            "fps-123",
            "Pay by Friday",
            "FPS",
            actor.RawSessionToken);
    }

    [Fact]
    public async Task PatchCreatesPaymentProfileWithExplicitSupportedVisibility()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            actor.RawSessionToken,
            "{\"paymentHandle\":\"only-me\",\"visibility\":\"private\"}");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await ReadPaymentDetailsPayloadAsync(response);
        Assert.True(payload.IsConfigured);
        Assert.Equal(UserPaymentProfileVisibilities.Private, payload.Visibility);

        var paymentProfile = await ReadPaymentProfileAsync(testFactory, payload.Id!.Value);
        Assert.Equal(actor.UserProfileId, paymentProfile.UserProfileId);
        Assert.Equal(UserPaymentProfileVisibilities.Private, paymentProfile.Visibility);
    }

    [Fact]
    public async Task PatchUpdatesExistingFieldsPreservesOmittedFieldsAndKeepsOneActiveProfile()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        var paymentProfileId = await SeedPaymentProfileAsync(
            testFactory,
            actor.UserProfileId,
            "FPS",
            "old-handle",
            "old note",
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            actor.RawSessionToken,
            "{\"paymentHandle\":\"new-handle\"}");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await ReadPaymentDetailsPayloadAsync(response);
        Assert.Equal(paymentProfileId, payload.Id);
        Assert.Equal("FPS", payload.PreferredMethodLabel);
        Assert.Equal("new-handle", payload.PaymentHandle);
        Assert.Equal("old note", payload.PaymentNote);
        Assert.Equal(UserPaymentProfileVisibilities.SettlementCounterpartiesOnly, payload.Visibility);
        Assert.Equal(InitialTimestamp, payload.CreatedAtUtc);
        Assert.Equal(WriteTimestamp, payload.UpdatedAtUtc);
        Assert.Equal(1, await CountActivePaymentProfilesAsync(testFactory, actor.UserProfileId));

        var paymentProfile = await ReadPaymentProfileAsync(testFactory, paymentProfileId);
        Assert.Equal("FPS", paymentProfile.PreferredMethodLabel);
        Assert.Equal("new-handle", paymentProfile.PaymentHandle);
        Assert.Equal("old note", paymentProfile.PaymentNote);
        Assert.Equal(WriteTimestamp, paymentProfile.UpdatedAtUtc);
    }

    [Fact]
    public async Task PatchExplicitNullClearsFieldsAndWhitespaceOnlyNormalizesToNull()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        var paymentProfileId = await SeedPaymentProfileAsync(
            testFactory,
            actor.UserProfileId,
            "Wise",
            "wise-handle",
            "keep reference",
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            actor.RawSessionToken,
            "{\"preferredMethodLabel\":null,\"paymentHandle\":\"   \",\"paymentNote\":\"   \"}");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await ReadPaymentDetailsPayloadAsync(response);
        Assert.Equal(paymentProfileId, payload.Id);
        Assert.Null(payload.PreferredMethodLabel);
        Assert.Null(payload.PaymentHandle);
        Assert.Null(payload.PaymentNote);

        var paymentProfile = await ReadPaymentProfileAsync(testFactory, paymentProfileId);
        Assert.Null(paymentProfile.PreferredMethodLabel);
        Assert.Null(paymentProfile.PaymentHandle);
        Assert.Null(paymentProfile.PaymentNote);
    }

    [Fact]
    public async Task PatchVisibilityChangeUpdatesVisibilityTimestampAndWritesBoundedAuditEvents()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        var paymentProfileId = await SeedPaymentProfileAsync(
            testFactory,
            actor.UserProfileId,
            "Bank",
            "bank-handle",
            "bank note",
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            actor.RawSessionToken,
            "{\"visibility\":\"group_members_when_shared\"}");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await ReadPaymentDetailsPayloadAsync(response);
        Assert.Equal(paymentProfileId, payload.Id);
        Assert.Equal(UserPaymentProfileVisibilities.GroupMembersWhenShared, payload.Visibility);
        Assert.Equal(WriteTimestamp, payload.UpdatedAtUtc);

        var auditEvents = await ReadPaymentDetailsAuditEventsAsync(testFactory);
        Assert.Equal([PaymentDetailsUpdatedAction, PaymentDetailsVisibilityChangedAction], auditEvents.Select(auditEvent => auditEvent.Action).Order().ToArray());
        Assert.All(auditEvents, auditEvent =>
        {
            Assert.Equal(actor.AuthAccountId, auditEvent.ActorAuthAccountId);
            Assert.Equal(actor.AuthAccountId, auditEvent.SubjectAuthAccountId);
            Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
            Assert.Equal(WriteTimestamp, auditEvent.OccurredAtUtc);
            AssertSafePaymentDetailsAuditContent(
                auditEvent,
                "bank-handle",
                "bank note",
                "Bank",
                actor.RawSessionToken,
                "request",
                "body",
                "storage",
                "vault");
        });

        var visibilityAuditEvent = Assert.Single(
            auditEvents,
            auditEvent => auditEvent.Action == PaymentDetailsVisibilityChangedAction);
        AssertPaymentDetailsAuditMetadata(
            visibilityAuditEvent,
            paymentProfileId,
            rowCreated: false,
            expectedFields: ["visibility"],
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly,
            UserPaymentProfileVisibilities.GroupMembersWhenShared);
    }

    [Fact]
    public async Task PatchRejectsUnsupportedFieldsWithoutEchoingPropertyNamesOrValuesAndDoesNotCreate()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        var requestBody = JsonSerializer.Serialize(new
        {
            paymentHandle = "should-not-persist",
            rawSessionToken = "visible-payment-token",
            storagePath = "visible-payment-storage-path",
            vaultKey = "visible-payment-vault-key"
        });
        using var request = CreatePatchRequest(actor.RawSessionToken, requestBody);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        await AssertInvalidPaymentDetailsUpdateProblemAsync(response, content);
        Assert.Contains("Unsupported fields are not allowed.", content);
        Assert.DoesNotContain("rawSessionToken", content);
        Assert.DoesNotContain("storagePath", content);
        Assert.DoesNotContain("vaultKey", content);
        Assert.DoesNotContain("visible-payment-token", content);
        Assert.DoesNotContain("visible-payment-storage-path", content);
        Assert.DoesNotContain("visible-payment-vault-key", content);
        Assert.DoesNotContain("should-not-persist", content);
        Assert.Equal(0, await CountActivePaymentProfilesAsync(testFactory, actor.UserProfileId));
        await AssertNoPaymentDetailsAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task PatchRejectsUnsupportedVisibilityWithoutEchoingSubmittedValue()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        const string unsupportedVisibility = "global_public_directory";
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            actor.RawSessionToken,
            $"{{\"visibility\":\"{unsupportedVisibility}\"}}");

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        await AssertInvalidPaymentDetailsUpdateProblemAsync(response, content);
        Assert.DoesNotContain(unsupportedVisibility, content);
        Assert.Equal(0, await CountActivePaymentProfilesAsync(testFactory, actor.UserProfileId));
        await AssertNoPaymentDetailsAuditEventsAsync(testFactory);
    }

    [Theory]
    [InlineData("preferredMethodLabel", 121)]
    [InlineData("paymentHandle", 321)]
    [InlineData("paymentNote", 1001)]
    public async Task PatchRejectsOverlongSensitiveTextWithoutEchoingSubmittedValueOrUpdating(
        string fieldName,
        int length)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        var paymentProfileId = await SeedPaymentProfileAsync(
            testFactory,
            actor.UserProfileId,
            "FPS",
            "safe-handle",
            "safe note",
            UserPaymentProfileVisibilities.SettlementCounterpartiesOnly);
        var submittedValue = new string('x', length);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            actor.RawSessionToken,
            JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                [fieldName] = submittedValue
            }));

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        await AssertInvalidPaymentDetailsUpdateProblemAsync(response, content);
        Assert.DoesNotContain(submittedValue, content);

        var paymentProfile = await ReadPaymentProfileAsync(testFactory, paymentProfileId);
        Assert.Equal("FPS", paymentProfile.PreferredMethodLabel);
        Assert.Equal("safe-handle", paymentProfile.PaymentHandle);
        Assert.Equal("safe note", paymentProfile.PaymentNote);
        Assert.Equal(InitialTimestamp, paymentProfile.UpdatedAtUtc);
        await AssertNoPaymentDetailsAuditEventsAsync(testFactory);
    }

    [Theory]
    [InlineData("preferredMethodLabel")]
    [InlineData("paymentHandle")]
    [InlineData("paymentNote")]
    public async Task PatchRejectsNonStringTextFields(string fieldName)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            actor.RawSessionToken,
            JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                [fieldName] = 123
            }));

        using var response = await client.SendAsync(request);

        await AssertInvalidPaymentDetailsUpdateProblemAsync(response);
        Assert.Equal(0, await CountActivePaymentProfilesAsync(testFactory, actor.UserProfileId));
        await AssertNoPaymentDetailsAuditEventsAsync(testFactory);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("[]")]
    public async Task PatchRequiresJsonObjectWithAtLeastOneSupportedField(string body)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(actor.RawSessionToken, body);

        using var response = await client.SendAsync(request);

        await AssertInvalidPaymentDetailsUpdateProblemAsync(response);
        Assert.Equal(0, await CountActivePaymentProfilesAsync(testFactory, actor.UserProfileId));
        await AssertNoPaymentDetailsAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task PatchRejectsMissingBody()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Patch, actor.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertInvalidPaymentDetailsUpdateProblemAsync(response);
        Assert.Equal(0, await CountActivePaymentProfilesAsync(testFactory, actor.UserProfileId));
        await AssertNoPaymentDetailsAuditEventsAsync(testFactory);
    }

    [Fact]
    public async Task PatchRejectsClientSubmittedProfileOrPaymentProfileIdsWithoutApplyingThem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider);
        var unrelated = await SeedAccountAsync(testFactory, "Unrelated Target", InitialTimestamp.AddMinutes(1));
        var clientSubmittedPaymentProfileId = Guid.NewGuid();
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            actor.RawSessionToken,
            JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                ["id"] = clientSubmittedPaymentProfileId,
                ["userProfileId"] = unrelated.UserProfileId,
                ["paymentHandle"] = "should-not-apply"
            }));

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        await AssertInvalidPaymentDetailsUpdateProblemAsync(response, content);
        Assert.DoesNotContain("userProfileId", content);
        Assert.DoesNotContain("should-not-apply", content);
        Assert.Equal(0, await CountActivePaymentProfilesAsync(testFactory, actor.UserProfileId));
        Assert.Equal(0, await CountActivePaymentProfilesAsync(testFactory, unrelated.UserProfileId));
        await AssertNoPaymentDetailsAuditEventsAsync(testFactory);
    }

    [Fact]
    public void OpenApiContractDefinesSelfPaymentDetailsOnlyWithoutQrCounterpartyOrAdminSurface()
    {
        var openApiPath = FindRepoFile("packages/contracts/openapi/settleora.v1.yaml");
        var openApi = File.ReadAllText(openApiPath);
        var pathBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/users/me/payment-details:");
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "SelfPaymentDetailsResponse:");
        var requestSchema = ExtractOpenApiSchemaBlock(openApi, "UpdateSelfPaymentDetailsRequest:");
        var visibilitySchema = ExtractOpenApiSchemaBlock(openApi, "PaymentDetailsVisibility:");

        Assert.Contains("operationId: getSelfPaymentDetails", pathBlock);
        Assert.Contains("operationId: updateSelfPaymentDetails", pathBlock);
        Assert.Contains("SessionBearerAuth", pathBlock);
        Assert.Contains("PaymentDetailsVisibility", responseSchema);
        Assert.Contains("PaymentDetailsVisibility", requestSchema);
        Assert.Contains("settlement_counterparties_only", visibilitySchema);
        Assert.Contains("additionalProperties: false", requestSchema);
        Assert.DoesNotContain("qrFileId", responseSchema);
        Assert.DoesNotContain("storagePath", responseSchema);
        Assert.DoesNotContain("/api/v1/admin/payment-details", openApi);
        Assert.DoesNotContain("counterparty-payment-details", openApi);
    }

    [Fact]
    public void GeneratedClientsExposeSelfPaymentDetailsOperationsFromOpenApi()
    {
        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/generated/client.dart"));
        var webModels = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/models.ts"));
        var dartModels = File.ReadAllText(FindRepoFile("packages/client-dart/generated/models.dart"));

        Assert.Contains("getSelfPaymentDetails", webClient);
        Assert.Contains("updateSelfPaymentDetails", webClient);
        Assert.Contains("SelfPaymentDetailsResponse", webModels);
        Assert.Contains("UpdateSelfPaymentDetailsRequest", webModels);
        Assert.Contains("PaymentDetailsVisibility", webModels);
        Assert.Contains("getSelfPaymentDetails", dartClient);
        Assert.Contains("updateSelfPaymentDetails", dartClient);
        Assert.Contains("class SelfPaymentDetailsResponse", dartModels);
        Assert.Contains("class UpdateSelfPaymentDetailsRequest", dartModels);
        Assert.Contains("typedef PaymentDetailsVisibility", dartModels);
    }

    private FactoryTestContext CreateFactory(
        IBusinessAuthorizationService? businessAuthorizationService = null)
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new PaymentDetailsTestTimeProvider(InitialTimestamp);
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

                if (businessAuthorizationService is not null)
                {
                    services.RemoveAll<IBusinessAuthorizationService>();
                    services.AddSingleton(businessAuthorizationService);
                }
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        PaymentDetailsTestTimeProvider timeProvider)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
        var account = await SeedAccountAsync(testFactory, "Self Payment Actor", InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Payment details endpoint test",
                UserAgentSummary: "Payment details endpoint test user agent",
                NetworkAddressHash: "payment-details-endpoint-test-network",
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

    private static async Task<Guid> SeedPaymentProfileAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId,
        string? preferredMethodLabel,
        string? paymentHandle,
        string? paymentNote,
        string visibility)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var paymentProfileId = Guid.NewGuid();
        dbContext.Set<UserPaymentProfile>().Add(new UserPaymentProfile
        {
            Id = paymentProfileId,
            UserProfileId = userProfileId,
            PreferredMethodLabel = preferredMethodLabel,
            PaymentHandle = paymentHandle,
            PaymentNote = paymentNote,
            Visibility = visibility,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });

        await dbContext.SaveChangesAsync();
        return paymentProfileId;
    }

    private static async Task MarkProfileUnavailableAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId,
        string profileState)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var userProfile = await dbContext.Set<UserProfile>().SingleAsync(
            profile => profile.Id == userProfileId);

        if (profileState == "missing")
        {
            dbContext.Set<UserProfile>().Remove(userProfile);
        }
        else
        {
            userProfile.DeletedAtUtc = ValidationTimestamp;
            userProfile.UpdatedAtUtc = ValidationTimestamp;
        }

        await dbContext.SaveChangesAsync();
    }

    private static async Task<UserPaymentProfile> ReadPaymentProfileAsync(
        WebApplicationFactory<Program> testFactory,
        Guid paymentProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<UserPaymentProfile>().SingleAsync(
            paymentProfile => paymentProfile.Id == paymentProfileId);
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

    private static async Task<string> ReadSessionTokenHashAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthSession>()
            .Where(session => session.Id == authSessionId)
            .Select(session => session.SessionTokenHash)
            .SingleAsync();
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadPaymentDetailsAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.Action == PaymentDetailsCreatedAction
                || auditEvent.Action == PaymentDetailsUpdatedAction
                || auditEvent.Action == PaymentDetailsVisibilityChangedAction)
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Action)
            .ToArrayAsync();
    }

    private static async Task<AuthAuditEvent> AssertSinglePaymentDetailsAuditEventAsync(
        WebApplicationFactory<Program> testFactory,
        string expectedAction,
        Guid expectedAuthAccountId,
        DateTimeOffset expectedOccurredAtUtc)
    {
        var auditEvent = Assert.Single(await ReadPaymentDetailsAuditEventsAsync(testFactory));
        Assert.Equal(expectedAction, auditEvent.Action);
        Assert.Equal(expectedAuthAccountId, auditEvent.ActorAuthAccountId);
        Assert.Equal(expectedAuthAccountId, auditEvent.SubjectAuthAccountId);
        Assert.Equal(AuthAuditOutcomes.Success, auditEvent.Outcome);
        Assert.Equal(expectedOccurredAtUtc, auditEvent.OccurredAtUtc);
        Assert.Null(auditEvent.CorrelationId);
        Assert.Null(auditEvent.RequestId);

        return auditEvent;
    }

    private static async Task AssertNoPaymentDetailsAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        Assert.Empty(await ReadPaymentDetailsAuditEventsAsync(testFactory));
    }

    private static HttpRequestMessage CreateBearerRequest(HttpMethod method, string rawSessionToken)
    {
        var request = new HttpRequestMessage(method, PaymentDetailsPath);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreatePatchRequest(string rawSessionToken, string json)
    {
        var request = CreateBearerRequest(HttpMethod.Patch, rawSessionToken);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        return request;
    }

    private static async Task<PaymentDetailsPayload> ReadPaymentDetailsPayloadAsync(HttpResponseMessage response)
    {
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var root = payload.RootElement;

        Assert.Equal(8, root.EnumerateObject().Count());
        return new PaymentDetailsPayload(
            root.GetProperty("isConfigured").GetBoolean(),
            ReadNullableGuid(root.GetProperty("id")),
            ReadNullableString(root.GetProperty("preferredMethodLabel")),
            ReadNullableString(root.GetProperty("paymentHandle")),
            ReadNullableString(root.GetProperty("paymentNote")),
            root.GetProperty("visibility").GetString()!,
            ReadNullableDateTimeOffset(root.GetProperty("createdAtUtc")),
            ReadNullableDateTimeOffset(root.GetProperty("updatedAtUtc")));
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

    private static void AssertPaymentDetailsAuditMetadata(
        AuthAuditEvent auditEvent,
        Guid expectedPaymentProfileId,
        bool rowCreated,
        IReadOnlyList<string> expectedFields,
        string? previousVisibility,
        string? newVisibility)
    {
        Assert.NotNull(auditEvent.SafeMetadataJson);
        Assert.True(auditEvent.SafeMetadataJson!.Length <= 4096);

        using var metadata = JsonDocument.Parse(auditEvent.SafeMetadataJson);
        Assert.Equal(
            "payment_details_self_profile",
            metadata.RootElement.GetProperty("workflowName").GetString());
        Assert.Equal(
            expectedPaymentProfileId.ToString("D"),
            metadata.RootElement.GetProperty("paymentProfileId").GetString());
        Assert.Equal(rowCreated, metadata.RootElement.GetProperty("rowCreated").GetBoolean());

        var fields = metadata.RootElement.GetProperty("fieldsChanged")
            .EnumerateArray()
            .Select(field => field.GetString())
            .ToArray();
        Assert.Equal(expectedFields.Order(StringComparer.Ordinal), fields);

        if (previousVisibility is null)
        {
            Assert.False(metadata.RootElement.TryGetProperty("previousVisibility", out _));
        }
        else
        {
            Assert.Equal(previousVisibility, metadata.RootElement.GetProperty("previousVisibility").GetString());
        }

        if (newVisibility is null)
        {
            Assert.False(metadata.RootElement.TryGetProperty("newVisibility", out _));
        }
        else
        {
            Assert.Equal(newVisibility, metadata.RootElement.GetProperty("newVisibility").GetString());
        }
    }

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
        if (unexpectedResponseText is not null)
        {
            Assert.DoesNotContain(unexpectedResponseText, content);
        }

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Authentication is required to access this resource.",
            payload.RootElement.GetProperty("detail").GetString());
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
        Assert.Equal(
            "The requested payment details are unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertInvalidPaymentDetailsUpdateProblemAsync(
        HttpResponseMessage response,
        string? content = null)
    {
        content ??= await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid payment details update", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted payment details update is invalid.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static void AssertSafeProblemContent(string content)
    {
        var lowerContent = content.ToLowerInvariant();

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

    private static void AssertSafePaymentDetailsResponseContent(string content)
    {
        var lowerContent = content.ToLowerInvariant();

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
        Assert.DoesNotContain("qr", lowerContent);
        Assert.DoesNotContain("file", lowerContent);
    }

    private static void AssertSafePaymentDetailsAuditContent(
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
        Assert.DoesNotContain("hash", lowerAuditText);
        Assert.DoesNotContain("password", lowerAuditText);
        Assert.DoesNotContain("credential", lowerAuditText);
        Assert.DoesNotContain("verifier", lowerAuditText);
        Assert.DoesNotContain("provider", lowerAuditText);
        Assert.DoesNotContain("payload", lowerAuditText);
        Assert.DoesNotContain("storage", lowerAuditText);
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
        PaymentDetailsTestTimeProvider TimeProvider);

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
        DateTimeOffset? CreatedAtUtc,
        DateTimeOffset? UpdatedAtUtc);

    private sealed class PaymentDetailsTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public PaymentDetailsTestTimeProvider(DateTimeOffset utcNow)
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

    private sealed class DenyingBusinessAuthorizationService : IBusinessAuthorizationService
    {
        public Task<BusinessAuthorizationResult> CanAccessProfileAsync(
            Guid userProfileId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(BusinessAuthorizationResult.Deny(
                BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed));
        }

        public Task<BusinessAuthorizationResult> CanAccessGroupAsync(
            Guid groupId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(BusinessAuthorizationResult.Deny(
                BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed));
        }

        public Task<BusinessAuthorizationResult> CanManageGroupMembershipAsync(
            Guid groupId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(BusinessAuthorizationResult.Deny(
                BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed));
        }

        public Task<BusinessAuthorizationResult> CanManageGroupSettingsAsync(
            Guid groupId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(BusinessAuthorizationResult.Deny(
                BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed));
        }

        public BusinessAuthorizationResult HasSystemRole(string systemRole)
        {
            return BusinessAuthorizationResult.Deny(
                BusinessAuthorizationFailureReason.DeniedInsufficientRole);
        }
    }
}
