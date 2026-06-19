using System.Net;
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
using Settleora.Api.Domain.Sync;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class SyncOfflineServerFoundationEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string WrongRawToken = "wrong-sync-offline-server-token";
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 17, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 17, 10, 5, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ArchiveTimestamp = new(2026, 5, 17, 10, 30, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset RestoreTimestamp = new(2026, 5, 17, 10, 45, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public SyncOfflineServerFoundationEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task SyncEndpointsRequireAuthenticatedActor()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        var billId = Guid.NewGuid();

        using (var operationRequest = CreateJsonRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            ArchiveOperationJson("unauthenticated", billId, null)))
        using (var operationResponse = await client.SendAsync(operationRequest))
        {
            await AssertUnauthenticatedProblemAsync(operationResponse);
        }

        using (var changesRequest = new HttpRequestMessage(HttpMethod.Get, "/api/v1/sync/changes"))
        using (var changesResponse = await client.SendAsync(changesRequest))
        {
            await AssertUnauthenticatedProblemAsync(changesResponse);
        }
    }

    [Fact]
    public async Task BillArchiveRestoreSyncOperationsAreAcceptedReplayedAndVisibleInChangeFeed()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Lifecycle Owner");
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Visible Sync Lifecycle Merchant",
            InitialTimestamp,
            includeSensitiveRows: true);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp);
        var archiveBody = ArchiveOperationJson("archive-once", billId, null);
        using (var archiveRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            actorSession.RawSessionToken,
            archiveBody))
        using (var archiveResponse = await client.SendAsync(archiveRequest))
        {
            var payload = await AssertSyncOperationResponseAsync(
                archiveResponse,
                "accepted",
                billId,
                expectedVersion: 1,
                expectedErrorCode: null);
            Assert.NotEqual(Guid.Empty, payload.GetProperty("operationId").GetGuid());
        }

        Assert.Equal(ArchiveTimestamp, await ReadArchivedAtAsync(testFactory, billId));
        Assert.Equal(1, await CountSyncOperationsAsync(testFactory));
        Assert.Equal(1, await CountSyncResourceVersionsAsync(testFactory));

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(5));
        using (var replayRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            actorSession.RawSessionToken,
            archiveBody))
        using (var replayResponse = await client.SendAsync(replayRequest))
        {
            await AssertSyncOperationResponseAsync(
                replayResponse,
                "replayed",
                billId,
                expectedVersion: 1,
                expectedErrorCode: null);
        }

        Assert.Equal(ArchiveTimestamp, await ReadArchivedAtAsync(testFactory, billId));
        Assert.Equal(1, await CountSyncOperationsAsync(testFactory));

        using (var archiveChangesRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/sync/changes?sinceVersion=0&limit=10",
            actorSession.RawSessionToken))
        using (var archiveChangesResponse = await client.SendAsync(archiveChangesRequest))
        {
            await AssertSingleChangeAsync(
                archiveChangesResponse,
                billId,
                expectedVersion: 1,
                expectedChangeKind: "archived",
                expectedGroupId: null);
        }

        testContext.TimeProvider.SetUtcNow(RestoreTimestamp);
        using (var restoreRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            actorSession.RawSessionToken,
            RestoreOperationJson("restore-once", billId, 1)))
        using (var restoreResponse = await client.SendAsync(restoreRequest))
        {
            await AssertSyncOperationResponseAsync(
                restoreResponse,
                "accepted",
                billId,
                expectedVersion: 2,
                expectedErrorCode: null);
        }

        Assert.Null(await ReadArchivedAtAsync(testFactory, billId));
        using (var restoreChangesRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/sync/changes?sinceVersion=1&limit=10",
            actorSession.RawSessionToken))
        using (var restoreChangesResponse = await client.SendAsync(restoreChangesRequest))
        {
            await AssertSingleChangeAsync(
                restoreChangesResponse,
                billId,
                expectedVersion: 2,
                expectedChangeKind: "restored",
                expectedGroupId: null);
        }
    }

    [Fact]
    public async Task SameIdempotencyKeyWithChangedPayloadConflictsWithoutDuplicateMutation()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Idempotency Owner");
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Sync Idempotency Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp);
        using (var archiveRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            actorSession.RawSessionToken,
            ArchiveOperationJson("same-key", billId, null)))
        using (var archiveResponse = await client.SendAsync(archiveRequest))
        {
            await AssertSyncOperationResponseAsync(
                archiveResponse,
                "accepted",
                billId,
                expectedVersion: 1,
                expectedErrorCode: null);
        }

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(10));
        using (var changedRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            actorSession.RawSessionToken,
            RestoreOperationJson("same-key", billId, 1)))
        using (var changedResponse = await client.SendAsync(changedRequest))
        {
            await AssertSyncOperationResponseAsync(
                changedResponse,
                "conflict",
                billId,
                expectedVersion: null,
                "idempotency_key_conflict");
        }

        Assert.Equal(ArchiveTimestamp, await ReadArchivedAtAsync(testFactory, billId));
        Assert.Equal(1, await CountSyncOperationsAsync(testFactory));
        Assert.Equal(1, await CountSyncResourceVersionsAsync(testFactory));
    }

    [Fact]
    public async Task StaleBaseVersionConflictsAndPreservesBusinessResource()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Stale Owner");
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Sync Stale Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp);
        using (var archiveRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            actorSession.RawSessionToken,
            ArchiveOperationJson("archive-before-stale", billId, null)))
        using (var archiveResponse = await client.SendAsync(archiveRequest))
        {
            await AssertSyncOperationResponseAsync(
                archiveResponse,
                "accepted",
                billId,
                expectedVersion: 1,
                expectedErrorCode: null);
        }

        testContext.TimeProvider.SetUtcNow(RestoreTimestamp);
        using (var staleRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            actorSession.RawSessionToken,
            RestoreOperationJson("restore-stale", billId, 0)))
        using (var staleResponse = await client.SendAsync(staleRequest))
        {
            await AssertSyncOperationResponseAsync(
                staleResponse,
                "conflict",
                billId,
                expectedVersion: 1,
                "stale_base_version");
        }

        Assert.Equal(ArchiveTimestamp, await ReadArchivedAtAsync(testFactory, billId));
        Assert.Equal(["accepted", "conflict"], await ReadSyncOperationStatusesAsync(testFactory));
    }

    [Fact]
    public async Task SyncOperationsFailClosedForCrossUserCrossGroupAndRemovedMembers()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Denied Actor");
        var ownerSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Denied Owner");
        var removedSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Denied Removed");
        var outsideSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Denied Outside");
        var personalBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId: null,
            [ownerSession.UserProfileId, actorSession.UserProfileId],
            "Cross User Sync Merchant",
            InitialTimestamp);
        var groupId = await SeedGroupAsync(
            testFactory,
            ownerSession.UserProfileId,
            "Sync Denied Group",
            InitialTimestamp,
            new MembershipSeed(ownerSession.UserProfileId, GroupMembershipRoles.Owner, GroupMembershipStatuses.Active),
            new MembershipSeed(removedSession.UserProfileId, GroupMembershipRoles.Member, GroupMembershipStatuses.Removed));
        var groupBillId = await SeedBillAsync(
            testFactory,
            ownerSession.UserProfileId,
            groupId,
            [ownerSession.UserProfileId],
            "Cross Group Sync Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp);
        using (var crossUserRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            actorSession.RawSessionToken,
            ArchiveOperationJson("cross-user", personalBillId, null)))
        using (var crossUserResponse = await client.SendAsync(crossUserRequest))
        {
            await AssertSyncOperationResponseAsync(
                crossUserResponse,
                "rejected",
                personalBillId,
                expectedVersion: null,
                "resource_unavailable");
        }

        using (var removedRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            removedSession.RawSessionToken,
            ArchiveOperationJson("removed-member", groupBillId, null)))
        using (var removedResponse = await client.SendAsync(removedRequest))
        {
            await AssertSyncOperationResponseAsync(
                removedResponse,
                "rejected",
                groupBillId,
                expectedVersion: null,
                "resource_unavailable");
        }

        using (var outsideRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            outsideSession.RawSessionToken,
            ArchiveOperationJson("cross-group", groupBillId, null)))
        using (var outsideResponse = await client.SendAsync(outsideRequest))
        {
            await AssertSyncOperationResponseAsync(
                outsideResponse,
                "rejected",
                groupBillId,
                expectedVersion: null,
                "resource_unavailable");
        }

        Assert.Null(await ReadArchivedAtAsync(testFactory, personalBillId));
        Assert.Null(await ReadArchivedAtAsync(testFactory, groupBillId));
        Assert.Equal(["rejected", "rejected", "rejected"], await ReadSyncOperationStatusesAsync(testFactory));
    }

    [Fact]
    public async Task RejectedOperationDoesNotMutateBusinessResource()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Rejected Owner");
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Rejected Sync Merchant",
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp);
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            actorSession.RawSessionToken,
            ArchiveOperationJson("unsupported-payload", billId, null, "\"clientSubmittedOwnerId\":\"not-authoritative\""));
        using var response = await client.SendAsync(request);

        await AssertSyncOperationResponseAsync(
            response,
            "rejected",
            billId,
            expectedVersion: null,
            "unsupported_payload");
        Assert.Null(await ReadArchivedAtAsync(testFactory, billId));
        Assert.Equal(["rejected"], await ReadSyncOperationStatusesAsync(testFactory));
        Assert.Equal(0, await CountSyncResourceVersionsAsync(testFactory));
    }

    [Fact]
    public async Task ChangeFeedExcludesInvisibleResourcesBoundsLimitAndExposesOnlySafeMetadata()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Feed Actor");
        var otherSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Feed Other");
        var visibleBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Hidden Feed Merchant",
            InitialTimestamp,
            includeSensitiveRows: true);
        var secondVisibleBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Second Hidden Feed Merchant",
            InitialTimestamp.AddMinutes(1));
        var invisibleBillId = await SeedBillAsync(
            testFactory,
            otherSession.UserProfileId,
            groupId: null,
            [otherSession.UserProfileId],
            "Invisible Feed Merchant",
            InitialTimestamp.AddMinutes(2));
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp);
        await SubmitAcceptedArchiveAsync(client, actorSession.RawSessionToken, "feed-visible-one", visibleBillId);
        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(1));
        await SubmitAcceptedArchiveAsync(client, actorSession.RawSessionToken, "feed-visible-two", secondVisibleBillId);
        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(2));
        await SubmitAcceptedArchiveAsync(client, otherSession.RawSessionToken, "feed-invisible", invisibleBillId);

        using (var limitedRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/sync/changes?sinceVersion=0&limit=1",
            actorSession.RawSessionToken))
        using (var limitedResponse = await client.SendAsync(limitedRequest))
        {
            var content = await limitedResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, limitedResponse.StatusCode);
            Assert.DoesNotContain(invisibleBillId.ToString("D"), content);
            Assert.DoesNotContain("Hidden Feed Merchant", content);
            Assert.DoesNotContain("Seeded Sync Item", content);
            Assert.DoesNotContain("Sensitive sync item note", content);
            Assert.DoesNotContain("payment label secret", content);
            Assert.DoesNotContain("storage/object/key", content);
            Assert.DoesNotContain("Seeded OCR Merchant", content);
            Assert.DoesNotContain(actorSession.RawSessionToken, content);
            Assert.DoesNotContain("authAccountId", content, StringComparison.OrdinalIgnoreCase);

            using var payload = JsonDocument.Parse(content);
            Assert.Equal(1, payload.RootElement.GetProperty("limit").GetInt32());
            var change = Assert.Single(payload.RootElement.GetProperty("changes").EnumerateArray());
            Assert.Equal(visibleBillId, change.GetProperty("resourceId").GetGuid());
            Assert.Equal("expense_bill", change.GetProperty("resourceType").GetString());
            Assert.Equal("archived", change.GetProperty("changeKind").GetString());
        }

        using (var boundedRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/sync/changes?sinceVersion=0&limit=500",
            actorSession.RawSessionToken))
        using (var boundedResponse = await client.SendAsync(boundedRequest))
        {
            var content = await boundedResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, boundedResponse.StatusCode);
            using var payload = JsonDocument.Parse(content);
            Assert.Equal(100, payload.RootElement.GetProperty("limit").GetInt32());
            Assert.Equal(2, payload.RootElement.GetProperty("changes").GetArrayLength());
        }
    }

    [Fact]
    public async Task ChangeFeedRejectsSmuggledQueryAndBodyFieldsBeforeActorReadoutOrSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Feed Envelope Actor");
        var visibleBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Smuggled Sync Merchant",
            InitialTimestamp,
            includeSensitiveRows: true);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp);
        await SubmitAcceptedArchiveAsync(client, actorSession.RawSessionToken, "sync-feed-envelope", visibleBillId);
        Assert.Equal(1, await CountSyncOperationsAsync(testFactory));
        Assert.Equal(1, await CountSyncResourceVersionsAsync(testFactory));

        using (var unsupportedRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/sync/changes?sinceVersion=0&actorUserProfileId=00000000-0000-0000-0000-000000000001&includeHidden=true",
            actorSession.RawSessionToken))
        using (var unsupportedResponse = await client.SendAsync(unsupportedRequest))
        {
            var content = await AssertInvalidSyncRequestProblemAsync(unsupportedResponse);
            Assert.Contains("Unsupported query fields are not allowed.", content);
            Assert.DoesNotContain("00000000-0000-0000-0000-000000000001", content);
            Assert.DoesNotContain("includeHidden", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Smuggled Sync Merchant", content);
            Assert.DoesNotContain(visibleBillId.ToString("D"), content);
            Assert.DoesNotContain(actorSession.RawSessionToken, content);
        }

        using (var bodyRequest = CreateJsonBearerRequest(
            HttpMethod.Get,
            "/api/v1/sync/changes?sinceVersion=0",
            actorSession.RawSessionToken,
            """{"resourceType":"expense_bill","actorUserProfileId":"00000000-0000-0000-0000-000000000001"}"""))
        using (var bodyResponse = await client.SendAsync(bodyRequest))
        {
            var content = await AssertInvalidSyncRequestProblemAsync(bodyResponse);
            Assert.Contains("Sync change feed requests do not accept a body.", content);
            Assert.DoesNotContain("actorUserProfileId", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(actorSession.RawSessionToken, content);
        }

        Assert.Equal(1, await CountSyncOperationsAsync(testFactory));
        Assert.Equal(1, await CountSyncResourceVersionsAsync(testFactory));
    }

    [Fact]
    public async Task ChangeFeedRejectsDuplicateAndInvalidSupportedQueryValuesWithoutRawEchoOrReads()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Feed Invalid Query Actor");
        using var client = testFactory.CreateClient();

        using (var duplicateRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/sync/changes?sinceVersion=0&sinceVersion=1&limit=10",
            actorSession.RawSessionToken))
        using (var duplicateResponse = await client.SendAsync(duplicateRequest))
        {
            var content = await AssertInvalidSyncRequestProblemAsync(duplicateResponse);
            Assert.Contains("sinceVersion accepts only one value.", content);
            Assert.DoesNotContain(actorSession.RawSessionToken, content);
        }

        using (var invalidRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/sync/changes?sinceVersion=-1&limit=not-a-number&resourceType=hidden_resource",
            actorSession.RawSessionToken))
        using (var invalidResponse = await client.SendAsync(invalidRequest))
        {
            var content = await AssertInvalidSyncRequestProblemAsync(invalidResponse);
            Assert.Contains("sinceVersion must be greater than or equal to zero.", content);
            Assert.Contains("limit must be an integer.", content);
            Assert.Contains("resourceType is not supported.", content);
            Assert.DoesNotContain("not-a-number", content);
            Assert.DoesNotContain("hidden_resource", content);
            Assert.DoesNotContain(actorSession.RawSessionToken, content);
        }

        Assert.Equal(0, await CountSyncOperationsAsync(testFactory));
        Assert.Equal(0, await CountSyncResourceVersionsAsync(testFactory));
    }

    [Fact]
    public void OpenApiAndGeneratedClientsExposeSyncOperations()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var operationsBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/sync/operations:");
        var changesBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/sync/changes:");
        var requestSchema = ExtractOpenApiSchemaBlock(openApi, "SyncOperationRequest:");
        var operationTypeSchema = ExtractOpenApiSchemaBlock(openApi, "SyncOperationType:");
        var operationStatusSchema = ExtractOpenApiSchemaBlock(openApi, "SyncOperationStatus:");
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "SyncOperationResponse:");
        var changesSchema = ExtractOpenApiSchemaBlock(openApi, "SyncChangesResponse:");

        Assert.Contains("operationId: submitSyncOperation", operationsBlock);
        Assert.Contains("operationId: listSyncChanges", changesBlock);
        Assert.Contains("SyncOperationType", requestSchema);
        Assert.Contains("bill_archive", operationTypeSchema);
        Assert.Contains("bill_restore", operationTypeSchema);
        Assert.Contains("SyncOperationStatus", responseSchema);
        Assert.Contains("replayed", operationStatusSchema);
        Assert.Contains("safeErrorCode", responseSchema);
        Assert.Contains("changes", changesSchema);
        Assert.DoesNotContain("merchantName", changesSchema);
        Assert.DoesNotContain("paymentMethodLabelSnapshot", changesSchema);
        Assert.DoesNotContain("storageObjectKey", changesSchema);

        var webClient = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/client.ts"));
        var dartClient = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/client.dart"));
        var webModels = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/models.ts"));
        var dartModels = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/models.dart"));

        Assert.Contains("submitSyncOperation", webClient);
        Assert.Contains("listSyncChanges", webClient);
        Assert.Contains("submitSyncOperation", dartClient);
        Assert.Contains("listSyncChanges", dartClient);
        Assert.Contains("SyncOperationRequest", webModels);
        Assert.Contains("class SyncOperationRequest", dartModels);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new SyncTestTimeProvider(InitialTimestamp);
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
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task SubmitAcceptedArchiveAsync(
        HttpClient client,
        string rawSessionToken,
        string idempotencyKey,
        Guid billId)
    {
        using var request = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            rawSessionToken,
            ArchiveOperationJson(idempotencyKey, billId, null));
        using var response = await client.SendAsync(request);
        await AssertSyncOperationResponseAsync(
            response,
            "accepted",
            billId,
            expectedVersion: null,
            expectedErrorCode: null,
            assertVersion: false);
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        SyncTestTimeProvider timeProvider,
        string displayName)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
        var account = await SeedAccountAsync(testFactory, displayName, InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Sync offline endpoint test",
                UserAgentSummary: "Sync offline endpoint test user agent",
                NetworkAddressHash: "sync-offline-endpoint-test-network",
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

        await dbContext.SaveChangesAsync();
        return new SeededAccount(authAccountId, userProfileId);
    }

    private static async Task<Guid> SeedGroupAsync(
        WebApplicationFactory<Program> testFactory,
        Guid creatorUserProfileId,
        string name,
        DateTimeOffset createdAtUtc,
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
            UpdatedAtUtc = createdAtUtc
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
        Guid creatorProfileId,
        Guid? groupId,
        IReadOnlyList<Guid> participantProfileIds,
        string merchantName,
        DateTimeOffset createdAtUtc,
        bool includeSensitiveRows = false)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var billId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        var participantShare = decimal.Round(12m / participantProfileIds.Count, 4);
        var bill = new ExpenseBill
        {
            Id = billId,
            CreatedByUserProfileId = creatorProfileId,
            BillOwnerUserProfileId = creatorProfileId,
            GroupId = groupId,
            MerchantName = merchantName,
            BillDate = DateOnly.FromDateTime(createdAtUtc.UtcDateTime),
            Status = ExpenseBillStatuses.Draft,
            TotalAmount = 12m,
            TotalCurrency = "USD",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };
        var item = new ExpenseBillItem
        {
            Id = itemId,
            ExpenseBillId = billId,
            Name = "Seeded Sync Item",
            Note = "Sensitive sync item note",
            Amount = 12m,
            Currency = "USD",
            SortOrder = 0,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        };

        for (var index = 0; index < participantProfileIds.Count; index++)
        {
            var participantId = participantProfileIds[index];
            bill.Participants.Add(new ExpenseBillParticipant
            {
                ExpenseBillId = billId,
                UserProfileId = participantId,
                Status = ExpenseBillParticipantStatuses.PendingAcceptance,
                ResolvedShareAmount = participantShare,
                ResolvedShareCurrency = "USD",
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
            item.Splits.Add(new ExpenseBillItemSplit
            {
                Id = Guid.NewGuid(),
                ExpenseBillItemId = itemId,
                UserProfileId = participantId,
                SplitMethod = ExpenseBillItemSplitMethods.Equal,
                ResolvedAmount = participantShare,
                ResolvedCurrency = "USD",
                AllocationOrder = index,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        bill.Items.Add(item);
        bill.Payers.Add(new ExpenseBillPayer
        {
            Id = Guid.NewGuid(),
            ExpenseBillId = billId,
            UserProfileId = creatorProfileId,
            Amount = 12m,
            Currency = "USD",
            PaymentMethodLabelSnapshot = "payment label secret",
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });
        dbContext.Set<ExpenseBill>().Add(bill);

        if (includeSensitiveRows)
        {
            var fileId = Guid.NewGuid();
            dbContext.Set<FileObject>().Add(new FileObject
            {
                Id = fileId,
                OwnerUserProfileId = creatorProfileId,
                CreatedByUserProfileId = creatorProfileId,
                Purpose = FileObjectPurposes.ReceiptImage,
                Status = FileObjectStatuses.Active,
                ContentType = "image/png",
                SizeBytes = 128,
                StorageProvider = "local",
                StorageObjectKey = "storage/object/key",
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
            bill.Attachments.Add(new ExpenseBillAttachment
            {
                ExpenseBillId = billId,
                FileObjectId = fileId,
                Purpose = ExpenseBillAttachmentPurposes.Receipt,
                CreatedByUserProfileId = creatorProfileId,
                CreatedAtUtc = createdAtUtc
            });
            dbContext.Set<ReceiptOcrReview>().Add(new ReceiptOcrReview
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = billId,
                FileObjectId = fileId,
                CreatedByUserProfileId = creatorProfileId,
                GroupId = groupId,
                Status = ReceiptOcrReviewStatuses.Reviewed,
                Source = ReceiptOcrReviewSources.OnDevice,
                MerchantText = "Seeded OCR Merchant",
                Currency = "USD",
                GrandTotalAmount = 12m,
                CreatedAtUtc = createdAtUtc,
                UpdatedAtUtc = createdAtUtc
            });
        }

        await dbContext.SaveChangesAsync();
        return billId;
    }

    private static async Task<DateTimeOffset?> ReadArchivedAtAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<ExpenseBill>()
            .Where(bill => bill.Id == billId)
            .Select(bill => bill.ArchivedAtUtc)
            .SingleAsync();
    }

    private static async Task<int> CountSyncOperationsAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<SyncOperation>()
            .CountAsync();
    }

    private static async Task<int> CountSyncResourceVersionsAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<SyncResourceVersion>()
            .CountAsync();
    }

    private static async Task<string[]> ReadSyncOperationStatusesAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<SyncOperation>()
            .OrderBy(operation => operation.CreatedAtUtc)
            .ThenBy(operation => operation.Id)
            .Select(operation => operation.Status)
            .ToArrayAsync();
    }

    private static async Task<JsonElement> AssertSyncOperationResponseAsync(
        HttpResponseMessage response,
        string expectedStatus,
        Guid resourceId,
        long? expectedVersion,
        string? expectedErrorCode,
        bool assertVersion = true)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(WrongRawToken, content);
        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement.Clone();
        Assert.Equal(expectedStatus, root.GetProperty("status").GetString());
        Assert.Equal("expense_bill", root.GetProperty("resourceType").GetString());
        Assert.Equal(resourceId, root.GetProperty("resourceId").GetGuid());
        if (assertVersion)
        {
            if (expectedVersion is null)
            {
                Assert.Equal(JsonValueKind.Null, root.GetProperty("resultingVersion").ValueKind);
            }
            else
            {
                Assert.Equal(expectedVersion.Value, root.GetProperty("resultingVersion").GetInt64());
            }
        }

        if (expectedErrorCode is null)
        {
            Assert.Equal(JsonValueKind.Null, root.GetProperty("safeErrorCode").ValueKind);
            Assert.Equal(JsonValueKind.Null, root.GetProperty("safeMessage").ValueKind);
        }
        else
        {
            Assert.Equal(expectedErrorCode, root.GetProperty("safeErrorCode").GetString());
            Assert.NotEqual(JsonValueKind.Null, root.GetProperty("safeMessage").ValueKind);
        }

        return root;
    }

    private static async Task AssertSingleChangeAsync(
        HttpResponseMessage response,
        Guid resourceId,
        long expectedVersion,
        string expectedChangeKind,
        Guid? expectedGroupId)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        using var payload = JsonDocument.Parse(content);
        var change = Assert.Single(payload.RootElement.GetProperty("changes").EnumerateArray());
        Assert.Equal(resourceId, change.GetProperty("resourceId").GetGuid());
        Assert.Equal(expectedVersion, change.GetProperty("version").GetInt64());
        Assert.Equal(expectedChangeKind, change.GetProperty("changeKind").GetString());
        if (expectedGroupId is null)
        {
            Assert.Equal(JsonValueKind.Null, change.GetProperty("groupId").ValueKind);
        }
        else
        {
            Assert.Equal(expectedGroupId.Value, change.GetProperty("groupId").GetGuid());
        }
    }

    private static async Task AssertUnauthenticatedProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task<string> AssertInvalidSyncRequestProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid sync request", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("The submitted sync request is invalid.", payload.RootElement.GetProperty("detail").GetString());
        Assert.True(payload.RootElement.TryGetProperty("errors", out _));
        return content;
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

    private static HttpRequestMessage CreateJsonBearerRequest(
        HttpMethod method,
        string path,
        string rawSessionToken,
        string json)
    {
        var request = CreateJsonRequest(method, path, json);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");
        return request;
    }

    private static HttpRequestMessage CreateJsonRequest(
        HttpMethod method,
        string path,
        string json)
    {
        return new HttpRequestMessage(method, path)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
    }

    private static string ArchiveOperationJson(
        string idempotencyKey,
        Guid billId,
        long? baseVersion,
        string payloadFields = "")
    {
        return SyncOperationJson(
            idempotencyKey,
            "bill_archive",
            billId,
            baseVersion,
            payloadFields);
    }

    private static string RestoreOperationJson(
        string idempotencyKey,
        Guid billId,
        long? baseVersion)
    {
        return SyncOperationJson(
            idempotencyKey,
            "bill_restore",
            billId,
            baseVersion,
            payloadFields: "");
    }

    private static string SyncOperationJson(
        string idempotencyKey,
        string operationType,
        Guid billId,
        long? baseVersion,
        string payloadFields)
    {
        var baseVersionJson = baseVersion?.ToString() ?? "null";
        return $$"""
            {
              "idempotencyKey": "{{idempotencyKey}}",
              "operationType": "{{operationType}}",
              "resourceType": "expense_bill",
              "resourceId": "{{billId:D}}",
              "baseVersion": {{baseVersionJson}},
              "payload": { {{payloadFields}} }
            }
            """;
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
        SyncTestTimeProvider TimeProvider);

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

    private sealed class SyncTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public SyncTestTimeProvider(DateTimeOffset utcNow)
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
