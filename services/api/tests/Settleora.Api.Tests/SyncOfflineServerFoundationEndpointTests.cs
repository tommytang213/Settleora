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
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Settlements;
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

        using (var statusRequest = new HttpRequestMessage(HttpMethod.Get, "/api/v1/sync/local-status"))
        using (var statusResponse = await client.SendAsync(statusRequest))
        {
            await AssertUnauthenticatedProblemAsync(statusResponse);
        }

        using (var backupReadinessRequest = new HttpRequestMessage(HttpMethod.Get, "/api/v1/local-backup/package-readiness"))
        using (var backupReadinessResponse = await client.SendAsync(backupReadinessRequest))
        {
            await AssertUnauthenticatedProblemAsync(backupReadinessResponse);
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
        Assert.Equal(0, await CountInAppNotificationsAsync(testFactory));

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
        Assert.Equal(0, await CountInAppNotificationsAsync(testFactory));

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
        Assert.Equal(0, await CountInAppNotificationsAsync(testFactory));
    }

    [Fact]
    public async Task StaleBaseVersionConflictsAndPreservesBusinessResource()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Stale Owner");
        var otherSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Stale Other");
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

        var notification = await AssertSingleSyncConflictNotificationAsync(
            testFactory,
            actorSession.UserProfileId,
            billId,
            expectedGroupId: null,
            expectedCreatedAtUtc: RestoreTimestamp);
        var syncOperation = await ReadSyncOperationAsync(testFactory, notification.SyncOperationId!.Value);
        Assert.Equal("restore-stale", syncOperation.IdempotencyKey);

        using (var notificationRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/notifications",
            actorSession.RawSessionToken))
        using (var notificationResponse = await client.SendAsync(notificationRequest))
        {
            var content = await notificationResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, notificationResponse.StatusCode);
            Assert.Contains(InAppNotificationEventTypes.SyncConflictDetected, content);
            Assert.Contains(notification.SyncOperationId.Value.ToString("D"), content);
            Assert.Contains(billId.ToString("D"), content);
            Assert.DoesNotContain("restore-stale", content);
            Assert.DoesNotContain(syncOperation.RequestPayloadHash, content);
            Assert.DoesNotContain("Seeded Sync Item", content);
            Assert.DoesNotContain("Sensitive sync item note", content);
            Assert.DoesNotContain("payment label secret", content);
        }

        using (var readRequest = CreateBearerRequest(
            HttpMethod.Get,
            notification.ActionUrl!,
            actorSession.RawSessionToken))
        using (var readResponse = await client.SendAsync(readRequest))
        {
            var content = await readResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, readResponse.StatusCode);
            using var payload = JsonDocument.Parse(content);
            Assert.Equal(notification.SyncOperationId.Value, payload.RootElement.GetProperty("operationId").GetGuid());
            Assert.Equal("conflict", payload.RootElement.GetProperty("status").GetString());
            Assert.Equal(billId, payload.RootElement.GetProperty("resourceId").GetGuid());
            Assert.Equal("stale_base_version", payload.RootElement.GetProperty("safeErrorCode").GetString());
            Assert.DoesNotContain("restore-stale", content);
            Assert.DoesNotContain(syncOperation.RequestPayloadHash, content);
            Assert.DoesNotContain("Seeded Sync Item", content);
            Assert.DoesNotContain("Sensitive sync item note", content);
            Assert.DoesNotContain("payment label secret", content);
        }

        using (var crossUserReadRequest = CreateBearerRequest(
            HttpMethod.Get,
            notification.ActionUrl!,
            otherSession.RawSessionToken))
        using (var crossUserReadResponse = await client.SendAsync(crossUserReadRequest))
        {
            Assert.Equal(HttpStatusCode.NotFound, crossUserReadResponse.StatusCode);
        }

        using (var markReadRequest = CreateBearerRequest(
            HttpMethod.Post,
            $"/api/v1/notifications/{notification.Id:D}/read",
            actorSession.RawSessionToken))
        using (var markReadResponse = await client.SendAsync(markReadRequest))
        {
            Assert.Equal(HttpStatusCode.OK, markReadResponse.StatusCode);
        }

        using (var archiveNotificationRequest = CreateBearerRequest(
            HttpMethod.Post,
            $"/api/v1/notifications/{notification.Id:D}/archive",
            actorSession.RawSessionToken))
        using (var archiveNotificationResponse = await client.SendAsync(archiveNotificationRequest))
        {
            Assert.Equal(HttpStatusCode.OK, archiveNotificationResponse.StatusCode);
        }

        var operationAfterNotificationActions = await ReadSyncOperationAsync(testFactory, notification.SyncOperationId.Value);
        Assert.Equal(SyncOperationStatuses.Conflict, operationAfterNotificationActions.Status);
        Assert.Equal("stale_base_version", operationAfterNotificationActions.SafeErrorCode);
        Assert.Equal(ArchiveTimestamp, await ReadArchivedAtAsync(testFactory, billId));
    }

    [Fact]
    public async Task ResourceStateConflictWritesCurrentActorSyncConflictNotification()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync State Conflict Owner");
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Sync State Conflict Merchant",
            InitialTimestamp);
        await SeedActiveSettlementRequestAsync(
            testFactory,
            billId,
            actorSession.UserProfileId,
            actorSession.UserProfileId,
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp);
        using (var conflictRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            actorSession.RawSessionToken,
            ArchiveOperationJson("resource-state-conflict", billId, null)))
        using (var conflictResponse = await client.SendAsync(conflictRequest))
        {
            var payload = await AssertSyncOperationResponseAsync(
                conflictResponse,
                "conflict",
                billId,
                expectedVersion: 0,
                "resource_state_conflict");
            Assert.NotEqual(Guid.Empty, payload.GetProperty("operationId").GetGuid());
        }

        Assert.Null(await ReadArchivedAtAsync(testFactory, billId));
        Assert.Equal(["conflict"], await ReadSyncOperationStatusesAsync(testFactory));
        var notification = await AssertSingleSyncConflictNotificationAsync(
            testFactory,
            actorSession.UserProfileId,
            billId,
            expectedGroupId: null,
            expectedCreatedAtUtc: ArchiveTimestamp);
        Assert.True(notification.SyncOperationId.HasValue);
        Assert.Equal($"/api/v1/sync/operations/{notification.SyncOperationId.GetValueOrDefault():D}", notification.ActionUrl);
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
        Assert.Equal(0, await CountInAppNotificationsAsync(testFactory));
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
        Assert.Equal(0, await CountInAppNotificationsAsync(testFactory));
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
        Assert.Equal(0, await CountInAppNotificationsAsync(testFactory));
    }

    [Fact]
    public async Task LocalStatusReturnsServerDerivedReadOnlyStatusAndUnsupportedBrowserStates()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Local Status Actor");
        var otherSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Local Status Other");
        var actorBillId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Local Status Hidden Merchant",
            InitialTimestamp,
            includeSensitiveRows: true);
        var otherBillId = await SeedBillAsync(
            testFactory,
            otherSession.UserProfileId,
            groupId: null,
            [otherSession.UserProfileId],
            "Other Hidden Status Merchant",
            InitialTimestamp.AddMinutes(1),
            includeSensitiveRows: true);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp);
        await SubmitAcceptedArchiveAsync(client, actorSession.RawSessionToken, "status-accepted", actorBillId);
        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(1));
        using (var rejectedRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            actorSession.RawSessionToken,
            ArchiveOperationJson("status-rejected", actorBillId, 1, "\"unsupported\":\"value\"")))
        using (var rejectedResponse = await client.SendAsync(rejectedRequest))
        {
            await AssertSyncOperationResponseAsync(
                rejectedResponse,
                "rejected",
                actorBillId,
                expectedVersion: null,
                "unsupported_payload");
        }

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(2));
        using (var conflictRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            actorSession.RawSessionToken,
            RestoreOperationJson("status-conflict", actorBillId, 0)))
        using (var conflictResponse = await client.SendAsync(conflictRequest))
        {
            await AssertSyncOperationResponseAsync(
                conflictResponse,
                "conflict",
                actorBillId,
                expectedVersion: 1,
                "stale_base_version");
        }

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(3));
        using (var otherRejectedRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/sync/operations",
            otherSession.RawSessionToken,
            ArchiveOperationJson("other-status-rejected", otherBillId, null, "\"unsupported\":\"value\"")))
        using (var otherRejectedResponse = await client.SendAsync(otherRejectedRequest))
        {
            await AssertSyncOperationResponseAsync(
                otherRejectedResponse,
                "rejected",
                otherBillId,
                expectedVersion: null,
                "unsupported_payload");
        }

        var syncOperationCountBeforeStatusRead = await CountSyncOperationsAsync(testFactory);
        var syncResourceVersionCountBeforeStatusRead = await CountSyncResourceVersionsAsync(testFactory);
        var notificationCountBeforeStatusRead = await CountInAppNotificationsAsync(testFactory);
        var archivedAtBeforeStatusRead = await ReadArchivedAtAsync(testFactory, actorBillId);

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(4));
        using var statusRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/sync/local-status",
            actorSession.RawSessionToken);
        using var statusResponse = await client.SendAsync(statusRequest);
        var content = await statusResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, statusResponse.StatusCode);
        Assert.Equal("application/json", statusResponse.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("Local Status Hidden Merchant", content);
        Assert.DoesNotContain("Other Hidden Status Merchant", content);
        Assert.DoesNotContain("Seeded Sync Item", content);
        Assert.DoesNotContain("Sensitive sync item note", content);
        Assert.DoesNotContain("payment label secret", content);
        Assert.DoesNotContain("storage/object/key", content);
        Assert.DoesNotContain("Seeded OCR Merchant", content);
        Assert.DoesNotContain("status-accepted", content);
        Assert.DoesNotContain("status-rejected", content);
        Assert.DoesNotContain("status-conflict", content);
        Assert.DoesNotContain(actorSession.RawSessionToken, content);
        Assert.DoesNotContain("requestPayloadHash", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("authAccountId", content, StringComparison.OrdinalIgnoreCase);

        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        Assert.Equal("server_mode", root.GetProperty("mode").GetString());
        Assert.True(root.GetProperty("available").GetBoolean());
        Assert.Equal("server_mode_active", root.GetProperty("stableCode").GetString());
        Assert.Equal("authenticated", root.GetProperty("sessionState").GetString());
        Assert.Equal("reachable", root.GetProperty("serverReachability").GetString());
        Assert.Equal(ArchiveTimestamp.AddMinutes(4), root.GetProperty("generatedAtUtc").GetDateTimeOffset());
        Assert.Equal(ArchiveTimestamp.AddMinutes(9), root.GetProperty("expiresAtUtc").GetDateTimeOffset());
        Assert.Equal(1, root.GetProperty("lastAcceptedServerVersion").GetInt64());
        AssertFeatureStatus(root.GetProperty("serverMode"), "available", "server_mode_active");
        AssertFeatureStatus(root.GetProperty("localModeSupport"), "unsupported", "local_mode_unsupported");
        AssertFeatureStatus(root.GetProperty("backupRestoreSupport"), "unsupported", "backup_restore_unsupported");
        AssertFeatureStatus(root.GetProperty("syncMutationSupport"), "unsupported", "sync_mutation_unsupported");
        AssertOperationSummary(root.GetProperty("pendingOperationSummary"), "unavailable", null, "sync_status_unavailable");
        AssertOperationSummary(root.GetProperty("failedOperationSummary"), "available", 1, "sync_failed_present");
        AssertOperationSummary(root.GetProperty("conflictSummary"), "available", 1, "sync_conflict_present");
        AssertUnsupportedFeatureCodes(
            root.GetProperty("unsupportedFeatures"),
            "browser_local_mode",
            "browser_local_persistence",
            "local_backup_restore",
            "sync_mutation",
            "conflict_resolution");
        Assert.Contains("excludes record payloads", root.GetProperty("privacyBoundary").GetString(), StringComparison.Ordinal);

        Assert.Equal(syncOperationCountBeforeStatusRead, await CountSyncOperationsAsync(testFactory));
        Assert.Equal(syncResourceVersionCountBeforeStatusRead, await CountSyncResourceVersionsAsync(testFactory));
        Assert.Equal(notificationCountBeforeStatusRead, await CountInAppNotificationsAsync(testFactory));
        Assert.Equal(archivedAtBeforeStatusRead, await ReadArchivedAtAsync(testFactory, actorBillId));
    }

    [Fact]
    public async Task LocalStatusRejectsQueryAndBodyBeforeSyncReadsOrSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Sync Local Status Guard Actor");
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Local Status Guard Merchant",
            InitialTimestamp,
            includeSensitiveRows: true);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp);
        await SubmitAcceptedArchiveAsync(client, actorSession.RawSessionToken, "status-guard-accepted", billId);
        var syncOperationCountBeforeStatusRead = await CountSyncOperationsAsync(testFactory);
        var syncResourceVersionCountBeforeStatusRead = await CountSyncResourceVersionsAsync(testFactory);
        var notificationCountBeforeStatusRead = await CountInAppNotificationsAsync(testFactory);

        using (var queryRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/sync/local-status?actorUserProfileId=00000000-0000-0000-0000-000000000001&includeHidden=true",
            actorSession.RawSessionToken))
        using (var queryResponse = await client.SendAsync(queryRequest))
        {
            var content = await AssertInvalidSyncRequestProblemAsync(queryResponse);
            Assert.Contains("Sync local status requests do not accept query fields.", content);
            Assert.DoesNotContain("00000000-0000-0000-0000-000000000001", content);
            Assert.DoesNotContain("includeHidden", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Local Status Guard Merchant", content);
            Assert.DoesNotContain(billId.ToString("D"), content);
            Assert.DoesNotContain(actorSession.RawSessionToken, content);
        }

        using (var bodyRequest = CreateJsonBearerRequest(
            HttpMethod.Get,
            "/api/v1/sync/local-status",
            actorSession.RawSessionToken,
            """{"submitSyncOperation":true,"resourceId":"00000000-0000-0000-0000-000000000001"}"""))
        using (var bodyResponse = await client.SendAsync(bodyRequest))
        {
            var content = await AssertInvalidSyncRequestProblemAsync(bodyResponse);
            Assert.Contains("Sync local status requests do not accept a body.", content);
            Assert.DoesNotContain("submitSyncOperation", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("resourceId", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(actorSession.RawSessionToken, content);
        }

        Assert.Equal(syncOperationCountBeforeStatusRead, await CountSyncOperationsAsync(testFactory));
        Assert.Equal(syncResourceVersionCountBeforeStatusRead, await CountSyncResourceVersionsAsync(testFactory));
        Assert.Equal(notificationCountBeforeStatusRead, await CountInAppNotificationsAsync(testFactory));
        Assert.Equal(ArchiveTimestamp, await ReadArchivedAtAsync(testFactory, billId));
    }

    [Fact]
    public async Task LocalBackupPackageReadinessReturnsMetadataOnlyUnsupportedStatesWithoutSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Backup Readiness Actor");
        var otherSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Backup Readiness Hidden Actor");
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Backup Readiness Visible Merchant",
            InitialTimestamp,
            includeSensitiveRows: true);
        await SeedBillAsync(
            testFactory,
            otherSession.UserProfileId,
            groupId: null,
            [otherSession.UserProfileId],
            "Backup Readiness Hidden Merchant",
            InitialTimestamp.AddMinutes(1),
            includeSensitiveRows: true);
        var syncOperationCountBeforeReadiness = await CountSyncOperationsAsync(testFactory);
        var syncResourceVersionCountBeforeReadiness = await CountSyncResourceVersionsAsync(testFactory);
        var notificationCountBeforeReadiness = await CountInAppNotificationsAsync(testFactory);
        var archivedAtBeforeReadiness = await ReadArchivedAtAsync(testFactory, billId);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(6));
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/local-backup/package-readiness",
            actorSession.RawSessionToken);
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("Backup Readiness Visible Merchant", content);
        Assert.DoesNotContain("Backup Readiness Hidden Merchant", content);
        Assert.DoesNotContain("Seeded Sync Item", content);
        Assert.DoesNotContain("Sensitive sync item note", content);
        Assert.DoesNotContain("payment label secret", content);
        Assert.DoesNotContain("storage/object/key", content);
        Assert.DoesNotContain(actorSession.RawSessionToken, content);
        Assert.DoesNotContain(billId.ToString("D"), content);
        Assert.DoesNotContain("packageBytes", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storageObjectKey", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("signedUrl", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("directStorageUrl", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("filesystemPath", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("localDevicePath", content, StringComparison.OrdinalIgnoreCase);

        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        Assert.False(root.GetProperty("available").GetBoolean());
        Assert.Equal("backup_package_unsupported", root.GetProperty("stableCode").GetString());
        Assert.Equal("server_authoritative", root.GetProperty("serverModePosture").GetString());
        Assert.Equal(ArchiveTimestamp.AddMinutes(6), root.GetProperty("generatedAtUtc").GetDateTimeOffset());
        Assert.Equal(ArchiveTimestamp.AddMinutes(11), root.GetProperty("expiresAtUtc").GetDateTimeOffset());
        AssertFeatureStatus(root.GetProperty("browserLocalPersistence"), "unsupported", "browser_local_persistence_unsupported");
        AssertFeatureStatus(root.GetProperty("packageGeneration"), "unsupported", "package_generation_unsupported");
        AssertFeatureStatus(root.GetProperty("packageDownload"), "unsupported", "package_download_unsupported");
        AssertFeatureStatus(root.GetProperty("restorePreview"), "unsupported", "restore_preview_unsupported");
        AssertFeatureStatus(root.GetProperty("restoreConfirmation"), "unsupported", "restore_confirmation_unsupported");
        AssertFeatureStatus(root.GetProperty("localModeAuthority"), "unsupported", "local_mode_authority_unsupported");
        AssertUnsupportedFeatureValues(
            root.GetProperty("unsupportedFeatures"),
            "browser_local_persistence",
            "package_generation",
            "package_download",
            "restore_preview",
            "restore_confirmation",
            "local_mode_authority");
        Assert.Contains("metadata only", root.GetProperty("privacyBoundary").GetString(), StringComparison.Ordinal);
        Assert.Contains("No backup package is created", root.GetProperty("dataEgressBoundary").GetString(), StringComparison.Ordinal);
        Assert.Equal(3, root.GetProperty("knownPackageConcepts").GetArrayLength());
        Assert.False(root.TryGetProperty("package", out _));
        Assert.False(root.TryGetProperty("downloadUrl", out _));
        Assert.False(root.TryGetProperty("restorePreviewRows", out _));

        Assert.Equal(syncOperationCountBeforeReadiness, await CountSyncOperationsAsync(testFactory));
        Assert.Equal(syncResourceVersionCountBeforeReadiness, await CountSyncResourceVersionsAsync(testFactory));
        Assert.Equal(notificationCountBeforeReadiness, await CountInAppNotificationsAsync(testFactory));
        Assert.Equal(archivedAtBeforeReadiness, await ReadArchivedAtAsync(testFactory, billId));
    }

    [Fact]
    public async Task LocalBackupPackageReadinessRejectsQueryAndBodyBeforeReadsOrSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Backup Readiness Guard Actor");
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Backup Readiness Guard Merchant",
            InitialTimestamp,
            includeSensitiveRows: true);
        var syncOperationCountBeforeReadiness = await CountSyncOperationsAsync(testFactory);
        var syncResourceVersionCountBeforeReadiness = await CountSyncResourceVersionsAsync(testFactory);
        var notificationCountBeforeReadiness = await CountInAppNotificationsAsync(testFactory);
        using var client = testFactory.CreateClient();

        using (var queryRequest = CreateBearerRequest(
            HttpMethod.Get,
            "/api/v1/local-backup/package-readiness?includePackageBytes=true&storageObjectKey=visible-storage-key",
            actorSession.RawSessionToken))
        using (var queryResponse = await client.SendAsync(queryRequest))
        {
            var content = await queryResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.BadRequest, queryResponse.StatusCode);
            Assert.Contains("Unsupported query fields are not allowed.", content);
            Assert.DoesNotContain("includePackageBytes", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("visible-storage-key", content);
            Assert.DoesNotContain("Backup Readiness Guard Merchant", content);
            Assert.DoesNotContain(billId.ToString("D"), content);
            Assert.DoesNotContain(actorSession.RawSessionToken, content);
        }

        using (var bodyRequest = CreateJsonBearerRequest(
            HttpMethod.Get,
            "/api/v1/local-backup/package-readiness",
            actorSession.RawSessionToken,
            """{"downloadUrl":"https://storage.example.invalid/signed","localDevicePath":"/tmp/backup.settleora"}"""))
        using (var bodyResponse = await client.SendAsync(bodyRequest))
        {
            var content = await bodyResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.BadRequest, bodyResponse.StatusCode);
            Assert.Contains("Local backup package readiness requests do not accept a body.", content);
            Assert.DoesNotContain("downloadUrl", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("storage.example.invalid", content);
            Assert.DoesNotContain("/tmp/backup.settleora", content);
            Assert.DoesNotContain(actorSession.RawSessionToken, content);
        }

        Assert.Equal(syncOperationCountBeforeReadiness, await CountSyncOperationsAsync(testFactory));
        Assert.Equal(syncResourceVersionCountBeforeReadiness, await CountSyncResourceVersionsAsync(testFactory));
        Assert.Equal(notificationCountBeforeReadiness, await CountInAppNotificationsAsync(testFactory));
        Assert.Null(await ReadArchivedAtAsync(testFactory, billId));
    }

    [Fact]
    public async Task LocalBackupPackageSessionLifecycleReturnsMetadataOnlyWithoutPackageSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Backup Session Actor");
        var otherSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Backup Session Hidden Actor");
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Backup Session Visible Merchant",
            InitialTimestamp,
            includeSensitiveRows: true);
        await SeedBillAsync(
            testFactory,
            otherSession.UserProfileId,
            groupId: null,
            [otherSession.UserProfileId],
            "Backup Session Hidden Merchant",
            InitialTimestamp.AddMinutes(1),
            includeSensitiveRows: true);
        var syncOperationCountBeforeSession = await CountSyncOperationsAsync(testFactory);
        var syncResourceVersionCountBeforeSession = await CountSyncResourceVersionsAsync(testFactory);
        var notificationCountBeforeSession = await CountInAppNotificationsAsync(testFactory);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(8));
        using var createRequest = CreateBearerRequest(
            HttpMethod.Post,
            "/api/v1/local-backup/package-sessions",
            actorSession.RawSessionToken);
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        Assert.Equal("application/json", createResponse.Content.Headers.ContentType?.MediaType);
        AssertLocalBackupSessionContentIsSafe(createContent, actorSession.RawSessionToken, billId);
        using var createPayload = JsonDocument.Parse(createContent);
        var createRoot = createPayload.RootElement;
        var packageSessionId = createRoot.GetProperty("packageSessionId").GetGuid();
        Assert.NotEqual(Guid.Empty, packageSessionId);
        Assert.Equal("created", createRoot.GetProperty("status").GetString());
        Assert.Equal("package_session_created", createRoot.GetProperty("stableCode").GetString());
        Assert.Equal("server_mode_copy_data_only", createRoot.GetProperty("scope").GetString());
        Assert.Equal("server_authoritative", createRoot.GetProperty("serverModePosture").GetString());
        Assert.True(createRoot.GetProperty("availableForPackageGeneration").GetBoolean());
        Assert.Equal(ArchiveTimestamp.AddMinutes(8), createRoot.GetProperty("createdAtUtc").GetDateTimeOffset());
        Assert.Equal(ArchiveTimestamp.AddMinutes(23), createRoot.GetProperty("expiresAtUtc").GetDateTimeOffset());
        Assert.Equal(ArchiveTimestamp.AddMinutes(8), createRoot.GetProperty("generatedAtUtc").GetDateTimeOffset());
        Assert.Equal(JsonValueKind.Null, createRoot.GetProperty("discardedAtUtc").ValueKind);
        Assert.Equal(JsonValueKind.Null, createRoot.GetProperty("cancelledAtUtc").ValueKind);
        Assert.Equal("package_session_created", createRoot.GetProperty("readiness").GetProperty("stableCode").GetString());
        Assert.True(createRoot.GetProperty("readiness").GetProperty("canPreparePackage").GetBoolean());
        Assert.False(createRoot.GetProperty("readiness").GetProperty("canDownloadPackage").GetBoolean());
        Assert.False(createRoot.GetProperty("readiness").GetProperty("canRestorePackage").GetBoolean());
        Assert.False(createRoot.GetProperty("manifestPreview").GetProperty("manifestAvailable").GetBoolean());
        Assert.Equal("package_manifest_metadata_only", createRoot.GetProperty("manifestPreview").GetProperty("manifestStableCode").GetString());
        Assert.Contains("short-lived API-mediated data-only copy", createRoot.GetProperty("confirmationCopy").GetString(), StringComparison.Ordinal);
        AssertUnsupportedFeatureValues(
            createRoot.GetProperty("unsupportedFeatures"),
            "restore_preview",
            "restore_confirmation",
            "browser_local_persistence",
            "local_mode_authority");

        using (var otherActorRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}",
            otherSession.RawSessionToken))
        using (var otherActorResponse = await client.SendAsync(otherActorRequest))
        {
            var otherActorContent = await otherActorResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.NotFound, otherActorResponse.StatusCode);
            Assert.DoesNotContain("Backup Session Visible Merchant", otherActorContent);
            Assert.DoesNotContain("Backup Session Hidden Merchant", otherActorContent);
            Assert.DoesNotContain(actorSession.RawSessionToken, otherActorContent);
        }

        using (var getRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}",
            actorSession.RawSessionToken))
        using (var getResponse = await client.SendAsync(getRequest))
        {
            var getContent = await getResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
            AssertLocalBackupSessionContentIsSafe(getContent, actorSession.RawSessionToken, billId);
            using var getPayload = JsonDocument.Parse(getContent);
            Assert.Equal(packageSessionId, getPayload.RootElement.GetProperty("packageSessionId").GetGuid());
            Assert.Equal("created", getPayload.RootElement.GetProperty("status").GetString());
        }

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(10));
        using (var discardRequest = CreateBearerRequest(
            HttpMethod.Post,
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}/discard",
            actorSession.RawSessionToken))
        using (var discardResponse = await client.SendAsync(discardRequest))
        {
            var discardContent = await discardResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, discardResponse.StatusCode);
            AssertLocalBackupSessionContentIsSafe(discardContent, actorSession.RawSessionToken, billId);
            using var discardPayload = JsonDocument.Parse(discardContent);
            var discardRoot = discardPayload.RootElement;
            Assert.Equal("discarded", discardRoot.GetProperty("status").GetString());
            Assert.Equal("package_session_discarded", discardRoot.GetProperty("stableCode").GetString());
            Assert.Equal(ArchiveTimestamp.AddMinutes(10), discardRoot.GetProperty("discardedAtUtc").GetDateTimeOffset());
        }

        Assert.Equal(syncOperationCountBeforeSession, await CountSyncOperationsAsync(testFactory));
        Assert.Equal(syncResourceVersionCountBeforeSession, await CountSyncResourceVersionsAsync(testFactory));
        Assert.Equal(notificationCountBeforeSession, await CountInAppNotificationsAsync(testFactory));
        Assert.Null(await ReadArchivedAtAsync(testFactory, billId));
    }

    [Fact]
    public async Task LocalBackupPackageGenerationDownloadContractReturnsSafeMetadataOnly()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Backup Generation Actor");
        var otherSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Backup Generation Hidden Actor");
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Backup Generation Visible Merchant",
            InitialTimestamp,
            includeSensitiveRows: true);
        await SeedBillAsync(
            testFactory,
            otherSession.UserProfileId,
            groupId: null,
            [otherSession.UserProfileId],
            "Backup Generation Hidden Merchant",
            InitialTimestamp.AddMinutes(1),
            includeSensitiveRows: true);
        var syncOperationCountBeforeSession = await CountSyncOperationsAsync(testFactory);
        var syncResourceVersionCountBeforeSession = await CountSyncResourceVersionsAsync(testFactory);
        var notificationCountBeforeSession = await CountInAppNotificationsAsync(testFactory);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(8));
        using var createRequest = CreateBearerRequest(
            HttpMethod.Post,
            "/api/v1/local-backup/package-sessions",
            actorSession.RawSessionToken);
        using var createResponse = await client.SendAsync(createRequest);
        using var createPayload = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var packageSessionId = createPayload.RootElement.GetProperty("packageSessionId").GetGuid();

        using (var unauthenticatedRequest = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}/prepare"))
        using (var unauthenticatedResponse = await client.SendAsync(unauthenticatedRequest))
        {
            Assert.Equal(HttpStatusCode.Unauthorized, unauthenticatedResponse.StatusCode);
        }

        foreach (var path in new[]
        {
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}/prepare",
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}/artifact-status",
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}/cancel",
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}/download-actions"
        })
        {
            using var otherActorRequest = CreateBearerRequest(
                path.Contains("artifact-status", StringComparison.Ordinal) ? HttpMethod.Get : HttpMethod.Post,
                path,
                otherSession.RawSessionToken);
            using var otherActorResponse = await client.SendAsync(otherActorRequest);
            var otherActorContent = await otherActorResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.NotFound, otherActorResponse.StatusCode);
            Assert.DoesNotContain("Backup Generation Visible Merchant", otherActorContent);
            Assert.DoesNotContain("Backup Generation Hidden Merchant", otherActorContent);
            Assert.DoesNotContain(actorSession.RawSessionToken, otherActorContent);
        }

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(9));
        using (var prepareRequest = CreateBearerRequest(
            HttpMethod.Post,
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}/prepare",
            actorSession.RawSessionToken))
        using (var prepareResponse = await client.SendAsync(prepareRequest))
        {
            var prepareContent = await prepareResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, prepareResponse.StatusCode);
            AssertLocalBackupSessionContentIsSafe(prepareContent, actorSession.RawSessionToken, billId);
            using var preparePayload = JsonDocument.Parse(prepareContent);
            AssertLocalBackupArtifactReady(
                preparePayload.RootElement,
                packageSessionId,
                expectDownloadAction: false);
        }

        using (var statusRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}/artifact-status",
            actorSession.RawSessionToken))
        using (var statusResponse = await client.SendAsync(statusRequest))
        {
            var statusContent = await statusResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, statusResponse.StatusCode);
            AssertLocalBackupSessionContentIsSafe(statusContent, actorSession.RawSessionToken, billId);
            using var statusPayload = JsonDocument.Parse(statusContent);
            AssertLocalBackupArtifactReady(
                statusPayload.RootElement,
                packageSessionId,
                expectDownloadAction: false);
        }

        Guid downloadActionId;
        string contentPath;
        string packageSha256;
        using (var downloadActionRequest = CreateBearerRequest(
            HttpMethod.Post,
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}/download-actions",
            actorSession.RawSessionToken))
        using (var downloadActionResponse = await client.SendAsync(downloadActionRequest))
        {
            var downloadActionContent = await downloadActionResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, downloadActionResponse.StatusCode);
            AssertLocalBackupSessionContentIsSafe(downloadActionContent, actorSession.RawSessionToken, billId);
            using var downloadActionPayload = JsonDocument.Parse(downloadActionContent);
            var downloadActionRoot = downloadActionPayload.RootElement;
            AssertLocalBackupArtifactReady(downloadActionRoot, packageSessionId, expectDownloadAction: true);
            downloadActionId = downloadActionRoot.GetProperty("downloadActionId").GetGuid();
            contentPath = downloadActionRoot.GetProperty("contentPath").GetString()!;
            packageSha256 = downloadActionRoot.GetProperty("packageSha256").GetString()!;
            Assert.Equal($"/api/v1/local-backup/package-sessions/{packageSessionId:D}/download-actions/{downloadActionId:D}/content", contentPath);
        }

        using (var otherActorContentRequest = CreateBearerRequest(
            HttpMethod.Get,
            contentPath,
            otherSession.RawSessionToken))
        using (var otherActorContentResponse = await client.SendAsync(otherActorContentRequest))
        {
            Assert.Equal(HttpStatusCode.NotFound, otherActorContentResponse.StatusCode);
        }

        using (var contentRequest = CreateBearerRequest(
            HttpMethod.Get,
            contentPath,
            actorSession.RawSessionToken))
        using (var contentResponse = await client.SendAsync(contentRequest))
        {
            var packageContent = await contentResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, contentResponse.StatusCode);
            Assert.Equal("application/vnd.settleora.local-backup+json", contentResponse.Content.Headers.ContentType?.MediaType);
            Assert.NotNull(contentResponse.Content.Headers.ContentDisposition);
            Assert.Equal("attachment", contentResponse.Content.Headers.ContentDisposition!.DispositionType);
            Assert.EndsWith(".json", contentResponse.Content.Headers.ContentDisposition.FileName);
            AssertLocalBackupPackageContentIsSafe(packageContent, actorSession.RawSessionToken, billId);
            using var packagePayload = JsonDocument.Parse(packageContent);
            var packageRoot = packagePayload.RootElement;
            Assert.Equal("settleora.local-backup.data-only", packageRoot.GetProperty("packageFormatName").GetString());
            Assert.Equal("2026-06-30.data-only.v1", packageRoot.GetProperty("packageVersion").GetString());
            Assert.Equal("2026-06-30.manifest.v1", packageRoot.GetProperty("manifestVersion").GetString());
            Assert.Equal(packageSessionId, packageRoot.GetProperty("packageSessionId").GetGuid());
            Assert.Equal("server_authoritative_copy", packageRoot.GetProperty("sourceAuthorityBoundary").GetString());
            Assert.Equal("server_mode_copy", packageRoot.GetProperty("sourceProfileMode").GetString());
            Assert.Equal(ArchiveTimestamp.AddMinutes(9), packageRoot.GetProperty("generatedAtUtc").GetDateTimeOffset());
            Assert.Equal(ArchiveTimestamp.AddMinutes(19), packageRoot.GetProperty("expiresAtUtc").GetDateTimeOffset());
            Assert.True(packageRoot.GetProperty("sections").GetArrayLength() >= 6);
            Assert.Contains("current_actor_profile_summary", packageContent);
            Assert.Contains("personal_bill_safe_summary", packageContent);
            Assert.Contains("omitted_unsupported", packageContent);
            Assert.Contains("unsupported", packageContent);
            Assert.Equal("Backup Generation Actor", packageRoot.GetProperty("data").GetProperty("currentActorProfileSummary").GetProperty("displayName").GetString());
            Assert.Equal(1, packageRoot.GetProperty("data").GetProperty("personalBillSafeSummary").GetProperty("totalVisiblePersonalBills").GetInt32());
            Assert.Equal(1, packageRoot.GetProperty("data").GetProperty("personalBillSafeSummary").GetProperty("itemCount").GetInt32());
            Assert.Equal(packageSha256, Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(packageContent))).ToLowerInvariant());
        }

        using (var reusedContentRequest = CreateBearerRequest(
            HttpMethod.Get,
            contentPath,
            actorSession.RawSessionToken))
        using (var reusedContentResponse = await client.SendAsync(reusedContentRequest))
        {
            Assert.Equal(HttpStatusCode.NotFound, reusedContentResponse.StatusCode);
        }

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(10));
        using (var cancelRequest = CreateBearerRequest(
            HttpMethod.Post,
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}/cancel",
            actorSession.RawSessionToken))
        using (var cancelResponse = await client.SendAsync(cancelRequest))
        {
            var cancelContent = await cancelResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, cancelResponse.StatusCode);
            AssertLocalBackupSessionContentIsSafe(cancelContent, actorSession.RawSessionToken, billId);
            using var cancelPayload = JsonDocument.Parse(cancelContent);
            AssertLocalBackupArtifactMetadataOnly(
                cancelPayload.RootElement,
                packageSessionId,
                "cancelled",
                "package_generation_cancelled");
        }

        using (var cancelledSessionRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}",
            actorSession.RawSessionToken))
        using (var cancelledSessionResponse = await client.SendAsync(cancelledSessionRequest))
        {
            using var cancelledSessionPayload = JsonDocument.Parse(await cancelledSessionResponse.Content.ReadAsStringAsync());
            Assert.Equal("cancelled", cancelledSessionPayload.RootElement.GetProperty("status").GetString());
            Assert.Equal("package_session_cancelled", cancelledSessionPayload.RootElement.GetProperty("stableCode").GetString());
            Assert.Equal(ArchiveTimestamp.AddMinutes(10), cancelledSessionPayload.RootElement.GetProperty("cancelledAtUtc").GetDateTimeOffset());
            Assert.Equal(JsonValueKind.Null, cancelledSessionPayload.RootElement.GetProperty("discardedAtUtc").ValueKind);
        }

        Assert.Equal(syncOperationCountBeforeSession, await CountSyncOperationsAsync(testFactory));
        Assert.Equal(syncResourceVersionCountBeforeSession, await CountSyncResourceVersionsAsync(testFactory));
        Assert.Equal(notificationCountBeforeSession, await CountInAppNotificationsAsync(testFactory));
        Assert.Null(await ReadArchivedAtAsync(testFactory, billId));
    }

    [Fact]
    public async Task LocalBackupPackageSessionExpiryAndRequestGuardsAreSafe()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Backup Session Guard Actor");
        var billId = await SeedBillAsync(
            testFactory,
            actorSession.UserProfileId,
            groupId: null,
            [actorSession.UserProfileId],
            "Backup Session Guard Merchant",
            InitialTimestamp,
            includeSensitiveRows: true);
        var syncOperationCountBeforeSession = await CountSyncOperationsAsync(testFactory);
        var syncResourceVersionCountBeforeSession = await CountSyncResourceVersionsAsync(testFactory);
        var notificationCountBeforeSession = await CountInAppNotificationsAsync(testFactory);
        using var client = testFactory.CreateClient();

        using (var queryRequest = CreateBearerRequest(
            HttpMethod.Post,
            "/api/v1/local-backup/package-sessions?includePackageBytes=true&downloadUrl=https://storage.example.invalid/signed",
            actorSession.RawSessionToken))
        using (var queryResponse = await client.SendAsync(queryRequest))
        {
            var content = await queryResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.BadRequest, queryResponse.StatusCode);
            Assert.Contains("Unsupported query fields are not allowed.", content);
            Assert.DoesNotContain("includePackageBytes", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("storage.example.invalid", content);
            Assert.DoesNotContain("Backup Session Guard Merchant", content);
            Assert.DoesNotContain(actorSession.RawSessionToken, content);
        }

        using (var bodyRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            "/api/v1/local-backup/package-sessions",
            actorSession.RawSessionToken,
            """{"packageBytes":"abc","storageObjectKey":"visible-storage-key","localDevicePath":"/tmp/backup.settleora"}"""))
        using (var bodyResponse = await client.SendAsync(bodyRequest))
        {
            var content = await bodyResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.BadRequest, bodyResponse.StatusCode);
            Assert.Contains("Local backup package session creation does not accept a body", content);
            Assert.DoesNotContain("packageBytes", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("visible-storage-key", content);
            Assert.DoesNotContain("/tmp/backup.settleora", content);
            Assert.DoesNotContain(actorSession.RawSessionToken, content);
        }

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(12));
        using var createRequest = CreateBearerRequest(
            HttpMethod.Post,
            "/api/v1/local-backup/package-sessions",
            actorSession.RawSessionToken);
        using var createResponse = await client.SendAsync(createRequest);
        using var createPayload = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var packageSessionId = createPayload.RootElement.GetProperty("packageSessionId").GetGuid();

        testContext.TimeProvider.SetUtcNow(ArchiveTimestamp.AddMinutes(28));
        using (var expiredGetRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}",
            actorSession.RawSessionToken))
        using (var expiredGetResponse = await client.SendAsync(expiredGetRequest))
        {
            var expiredContent = await expiredGetResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, expiredGetResponse.StatusCode);
            AssertLocalBackupSessionContentIsSafe(expiredContent, actorSession.RawSessionToken, billId);
            using var expiredPayload = JsonDocument.Parse(expiredContent);
            Assert.Equal("expired", expiredPayload.RootElement.GetProperty("status").GetString());
            Assert.Equal("package_session_expired", expiredPayload.RootElement.GetProperty("stableCode").GetString());
            Assert.Equal(JsonValueKind.Null, expiredPayload.RootElement.GetProperty("discardedAtUtc").ValueKind);
        }

        using (var bodyDiscardRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}/discard",
            actorSession.RawSessionToken,
            """{"downloadUrl":"https://storage.example.invalid/signed"}"""))
        using (var bodyDiscardResponse = await client.SendAsync(bodyDiscardRequest))
        {
            var content = await bodyDiscardResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.BadRequest, bodyDiscardResponse.StatusCode);
            Assert.Contains("Local backup package session discard requests do not accept a body.", content);
            Assert.DoesNotContain("downloadUrl", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("storage.example.invalid", content);
        }

        using (var queryPrepareRequest = CreateBearerRequest(
            HttpMethod.Post,
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}/prepare?artifactId=leaked&signedUrl=https://storage.example.invalid/signed",
            actorSession.RawSessionToken))
        using (var queryPrepareResponse = await client.SendAsync(queryPrepareRequest))
        {
            var content = await queryPrepareResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.BadRequest, queryPrepareResponse.StatusCode);
            Assert.Contains("Unsupported query fields are not allowed.", content);
            Assert.DoesNotContain("artifactId", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("storage.example.invalid", content);
        }

        using (var bodyDownloadActionRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            $"/api/v1/local-backup/package-sessions/{packageSessionId:D}/download-actions",
            actorSession.RawSessionToken,
            """{"downloadToken":"secret","directStorageUrl":"https://storage.example.invalid/direct"}"""))
        using (var bodyDownloadActionResponse = await client.SendAsync(bodyDownloadActionRequest))
        {
            var content = await bodyDownloadActionResponse.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.BadRequest, bodyDownloadActionResponse.StatusCode);
            Assert.Contains("Local backup package download action requests do not accept a body", content);
            Assert.DoesNotContain("downloadToken", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("directStorageUrl", content, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("storage.example.invalid", content);
        }

        Assert.Equal(syncOperationCountBeforeSession, await CountSyncOperationsAsync(testFactory));
        Assert.Equal(syncResourceVersionCountBeforeSession, await CountSyncResourceVersionsAsync(testFactory));
        Assert.Equal(notificationCountBeforeSession, await CountInAppNotificationsAsync(testFactory));
        Assert.Null(await ReadArchivedAtAsync(testFactory, billId));
    }

    [Fact]
    public void OpenApiAndGeneratedClientsExposeSyncOperations()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var localStatusBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/sync/local-status:");
        var backupReadinessBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/local-backup/package-readiness:");
        var backupSessionCreateBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/local-backup/package-sessions:");
        var backupSessionReadBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/local-backup/package-sessions/{packageSessionId}:");
        var backupSessionDiscardBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/local-backup/package-sessions/{packageSessionId}/discard:");
        var backupSessionPrepareBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/local-backup/package-sessions/{packageSessionId}/prepare:");
        var backupArtifactStatusBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/local-backup/package-sessions/{packageSessionId}/artifact-status:");
        var backupGenerationCancelBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/local-backup/package-sessions/{packageSessionId}/cancel:");
        var backupDownloadActionBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/local-backup/package-sessions/{packageSessionId}/download-actions:");
        var backupDownloadContentBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/local-backup/package-sessions/{packageSessionId}/download-actions/{downloadActionId}/content:");
        var backupReadinessSchema = ExtractOpenApiSchemaBlock(openApi, "LocalBackupPackageReadinessResponse:");
        var backupReadinessStableCodeSchema = ExtractOpenApiSchemaBlock(openApi, "LocalBackupPackageReadinessCode:");
        var backupSessionSchema = ExtractOpenApiSchemaBlock(openApi, "LocalBackupPackageSessionResponse:");
        var backupSessionStableCodeSchema = ExtractOpenApiSchemaBlock(openApi, "LocalBackupPackageSessionStableCode:");
        var backupArtifactStableCodeSchema = ExtractOpenApiSchemaBlock(openApi, "LocalBackupPackageArtifactStableCode:");
        var backupGenerationSchema = ExtractOpenApiSchemaBlock(openApi, "LocalBackupPackageGenerationStatusResponse:");
        var backupArtifactStatusSchema = ExtractOpenApiSchemaBlock(openApi, "LocalBackupPackageArtifactStatusResponse:");
        var backupDownloadActionSchema = ExtractOpenApiSchemaBlock(openApi, "LocalBackupPackageDownloadActionResponse:");
        var operationsBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/sync/operations:");
        var operationReadBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/sync/operations/{syncOperationId}:");
        var changesBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/sync/changes:");
        var localStatusSchema = ExtractOpenApiSchemaBlock(openApi, "SyncLocalStatusResponse:");
        var localStatusStableCodeSchema = ExtractOpenApiSchemaBlock(openApi, "SyncLocalStatusStableCode:");
        var requestSchema = ExtractOpenApiSchemaBlock(openApi, "SyncOperationRequest:");
        var operationTypeSchema = ExtractOpenApiSchemaBlock(openApi, "SyncOperationType:");
        var operationStatusSchema = ExtractOpenApiSchemaBlock(openApi, "SyncOperationStatus:");
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "SyncOperationResponse:");
        var changesSchema = ExtractOpenApiSchemaBlock(openApi, "SyncChangesResponse:");

        Assert.Contains("operationId: getSyncLocalStatus", localStatusBlock);
        Assert.Contains("SyncLocalStatusResponse", localStatusBlock);
        Assert.Contains("serverMode", localStatusSchema);
        Assert.Contains("localModeSupport", localStatusSchema);
        Assert.Contains("backupRestoreSupport", localStatusSchema);
        Assert.Contains("syncMutationSupport", localStatusSchema);
        Assert.Contains("unsupportedFeatures", localStatusSchema);
        Assert.Contains("local_mode_unsupported", localStatusStableCodeSchema);
        Assert.Contains("backup_restore_unsupported", localStatusStableCodeSchema);
        Assert.Contains("sync_mutation_unsupported", localStatusStableCodeSchema);
        Assert.Contains("operationId: getLocalBackupPackageReadiness", backupReadinessBlock);
        Assert.Contains("LocalBackupPackageReadinessResponse", backupReadinessBlock);
        Assert.Contains("packageGeneration", backupReadinessSchema);
        Assert.Contains("packageDownload", backupReadinessSchema);
        Assert.Contains("restorePreview", backupReadinessSchema);
        Assert.Contains("restoreConfirmation", backupReadinessSchema);
        Assert.Contains("localModeAuthority", backupReadinessSchema);
        Assert.Contains("unsupportedFeatures", backupReadinessSchema);
        Assert.Contains("backup_package_unsupported", backupReadinessStableCodeSchema);
        Assert.Contains("package_generation_unsupported", backupReadinessStableCodeSchema);
        Assert.Contains("restore_confirmation_unsupported", backupReadinessStableCodeSchema);
        Assert.Contains("operationId: createLocalBackupPackageSession", backupSessionCreateBlock);
        Assert.Contains("operationId: getLocalBackupPackageSession", backupSessionReadBlock);
        Assert.Contains("operationId: discardLocalBackupPackageSession", backupSessionDiscardBlock);
        Assert.Contains("operationId: prepareLocalBackupPackageSession", backupSessionPrepareBlock);
        Assert.Contains("operationId: getLocalBackupPackageArtifactStatus", backupArtifactStatusBlock);
        Assert.Contains("operationId: cancelLocalBackupPackageGeneration", backupGenerationCancelBlock);
        Assert.Contains("operationId: createLocalBackupPackageDownloadAction", backupDownloadActionBlock);
        Assert.Contains("operationId: downloadLocalBackupPackageContent", backupDownloadContentBlock);
        Assert.Contains("application/vnd.settleora.local-backup+json", backupDownloadContentBlock);
        Assert.Contains("format: binary", backupDownloadContentBlock);
        Assert.Contains("LocalBackupPackageSessionResponse", backupSessionCreateBlock);
        Assert.Contains("LocalBackupPackageSessionResponse", backupSessionReadBlock);
        Assert.Contains("LocalBackupPackageSessionResponse", backupSessionDiscardBlock);
        Assert.Contains("LocalBackupPackageGenerationStatusResponse", backupSessionPrepareBlock);
        Assert.Contains("LocalBackupPackageArtifactStatusResponse", backupArtifactStatusBlock);
        Assert.Contains("LocalBackupPackageGenerationStatusResponse", backupGenerationCancelBlock);
        Assert.Contains("LocalBackupPackageDownloadActionResponse", backupDownloadActionBlock);
        Assert.Contains("packageSessionId", backupSessionSchema);
        Assert.Contains("availableForPackageGeneration", backupSessionSchema);
        Assert.Contains("manifestPreview", backupSessionSchema);
        Assert.Contains("confirmationCopy", backupSessionSchema);
        Assert.Contains("unsupportedFeatures", backupSessionSchema);
        Assert.Contains("cancelledAtUtc", backupSessionSchema);
        Assert.Contains("package_session_created", backupSessionStableCodeSchema);
        Assert.Contains("package_session_cancelled", backupSessionStableCodeSchema);
        Assert.Contains("package_session_expired", backupSessionStableCodeSchema);
        Assert.Contains("package_session_discarded", backupSessionStableCodeSchema);
        Assert.Contains("package_ready_to_download", backupSessionStableCodeSchema);
        Assert.Contains("metadata_only_no_artifact", backupArtifactStableCodeSchema);
        Assert.Contains("package_ready_to_download", backupArtifactStableCodeSchema);
        Assert.Contains("package_download_action_ready", backupArtifactStableCodeSchema);
        Assert.Contains("package_download_unavailable", backupArtifactStableCodeSchema);
        Assert.Contains("package_generation_cancelled", backupArtifactStableCodeSchema);
        Assert.Contains("artifactAvailable", backupGenerationSchema);
        Assert.Contains("safeFilename", backupGenerationSchema);
        Assert.Contains("contentType", backupGenerationSchema);
        Assert.Contains("contentLengthBytes", backupGenerationSchema);
        Assert.Contains("packageSha256", backupArtifactStatusSchema);
        Assert.Contains("downloadAvailable", backupArtifactStatusSchema);
        Assert.Contains("downloadActionId", backupDownloadActionSchema);
        Assert.Contains("contentPath", backupDownloadActionSchema);
        Assert.Contains("nextAllowedActions", backupDownloadActionSchema);
        Assert.DoesNotContain("downloadUrl", backupSessionSchema);
        Assert.DoesNotContain("storageObjectKey", backupSessionSchema);
        Assert.DoesNotContain("packageBytes", backupSessionSchema);
        Assert.DoesNotContain("signedUrl", backupGenerationSchema);
        Assert.DoesNotContain("downloadToken", backupArtifactStatusSchema);
        Assert.DoesNotContain("directStorageUrl", backupDownloadActionSchema);
        Assert.Contains("operationId: submitSyncOperation", operationsBlock);
        Assert.Contains("operationId: getSyncOperation", operationReadBlock);
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
        Assert.Contains("getSyncOperation", webClient);
        Assert.Contains("listSyncChanges", webClient);
        Assert.Contains("getSyncLocalStatus", webClient);
        Assert.Contains("getLocalBackupPackageReadiness", webClient);
        Assert.Contains("createLocalBackupPackageSession", webClient);
        Assert.Contains("getLocalBackupPackageSession", webClient);
        Assert.Contains("discardLocalBackupPackageSession", webClient);
        Assert.Contains("prepareLocalBackupPackageSession", webClient);
        Assert.Contains("getLocalBackupPackageArtifactStatus", webClient);
        Assert.Contains("cancelLocalBackupPackageGeneration", webClient);
        Assert.Contains("createLocalBackupPackageDownloadAction", webClient);
        Assert.Contains("downloadLocalBackupPackageContent", webClient);
        Assert.Contains("submitSyncOperation", dartClient);
        Assert.Contains("getSyncOperation", dartClient);
        Assert.Contains("listSyncChanges", dartClient);
        Assert.Contains("getSyncLocalStatus", dartClient);
        Assert.Contains("getLocalBackupPackageReadiness", dartClient);
        Assert.Contains("createLocalBackupPackageSession", dartClient);
        Assert.Contains("getLocalBackupPackageSession", dartClient);
        Assert.Contains("discardLocalBackupPackageSession", dartClient);
        Assert.Contains("prepareLocalBackupPackageSession", dartClient);
        Assert.Contains("getLocalBackupPackageArtifactStatus", dartClient);
        Assert.Contains("cancelLocalBackupPackageGeneration", dartClient);
        Assert.Contains("createLocalBackupPackageDownloadAction", dartClient);
        Assert.Contains("downloadLocalBackupPackageContent", dartClient);
        Assert.Contains("SyncOperationRequest", webModels);
        Assert.Contains("SyncLocalStatusResponse", webModels);
        Assert.Contains("LocalBackupPackageReadinessResponse", webModels);
        Assert.Contains("LocalBackupPackageSessionResponse", webModels);
        Assert.Contains("LocalBackupPackageGenerationStatusResponse", webModels);
        Assert.Contains("LocalBackupPackageArtifactStatusResponse", webModels);
        Assert.Contains("LocalBackupPackageDownloadActionResponse", webModels);
        Assert.Contains("class SyncOperationRequest", dartModels);
        Assert.Contains("class SyncLocalStatusResponse", dartModels);
        Assert.Contains("class LocalBackupPackageReadinessResponse", dartModels);
        Assert.Contains("class LocalBackupPackageSessionResponse", dartModels);
        Assert.Contains("class LocalBackupPackageGenerationStatusResponse", dartModels);
        Assert.Contains("class LocalBackupPackageArtifactStatusResponse", dartModels);
        Assert.Contains("class LocalBackupPackageDownloadActionResponse", dartModels);
    }

    [Fact]
    public void OpenApiAndGeneratedClientsExposeSyncConflictNotificationsOnly()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var eventSchema = ExtractOpenApiSchemaBlock(openApi, "InAppNotificationEventType:");
        var subjectSchema = ExtractOpenApiSchemaBlock(openApi, "InAppNotificationSubjectType:");
        var webModels = File.ReadAllText(FindRepoFile("packages/client-web/src/generated/models.ts"));
        var dartModels = File.ReadAllText(FindRepoFile("packages/client-dart/lib/generated/models.dart"));

        Assert.Contains("sync.conflict_detected", eventSchema);
        Assert.Contains("sync_operation", subjectSchema);
        Assert.DoesNotContain("sync.operation_failed", eventSchema);
        Assert.DoesNotContain("sync.operation_queued", eventSchema);
        Assert.DoesNotContain("sync.conflict_resolved", eventSchema);
        Assert.Contains("sync.conflict_detected", webModels);
        Assert.Contains("sync.conflict_detected", dartModels);
        Assert.Contains("sync_operation", webModels);
        Assert.Contains("sync_operation", dartModels);
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

    private static async Task SeedActiveSettlementRequestAsync(
        WebApplicationFactory<Program> testFactory,
        Guid billId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        DateTimeOffset createdAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        dbContext.Set<SettlementRequest>().Add(new SettlementRequest
        {
            Id = Guid.NewGuid(),
            SourceExpenseBillId = billId,
            DebtorUserProfileId = debtorUserProfileId,
            CreditorUserProfileId = creditorUserProfileId,
            RequestedByUserProfileId = creditorUserProfileId,
            Amount = 12m,
            Currency = "USD",
            Status = SettlementRequestStatuses.Requested,
            RequestedAtUtc = createdAtUtc,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc
        });

        await dbContext.SaveChangesAsync();
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

    private static async Task<int> CountInAppNotificationsAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<InAppNotification>()
            .CountAsync();
    }

    private static async Task<InAppNotification> AssertSingleSyncConflictNotificationAsync(
        WebApplicationFactory<Program> testFactory,
        Guid actorUserProfileId,
        Guid billId,
        Guid? expectedGroupId,
        DateTimeOffset expectedCreatedAtUtc)
    {
        using var scope = testFactory.Services.CreateScope();
        var notification = Assert.Single(await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<InAppNotification>()
            .AsNoTracking()
            .ToListAsync());

        Assert.Equal(actorUserProfileId, notification.RecipientUserProfileId);
        Assert.Equal(actorUserProfileId, notification.ActorUserProfileId);
        Assert.Equal(InAppNotificationEventTypes.SyncConflictDetected, notification.EventType);
        Assert.Equal(InAppNotificationStatuses.Unread, notification.Status);
        Assert.Equal(InAppNotificationPriorities.Attention, notification.Priority);
        Assert.Equal(InAppNotificationSubjectTypes.SyncOperation, notification.SubjectType);
        Assert.Equal("notifications.sync.conflict_detected.title", notification.TitleKey);
        Assert.Equal("notifications.sync.conflict_detected.message", notification.MessageKey);
        Assert.Null(notification.SafeSummary);
        Assert.Equal(expectedGroupId, notification.GroupId);
        Assert.Equal(billId, notification.ExpenseBillId);
        Assert.Null(notification.ExpenseBillRevisionId);
        Assert.Null(notification.SettlementRequestId);
        Assert.Null(notification.SettlementPaymentId);
        Assert.Null(notification.RecurringBillTemplateId);
        Assert.Null(notification.RecurringBillOccurrenceId);
        Assert.Null(notification.ReceiptOcrReviewId);
        Assert.Null(notification.ReceiptAttachmentFileId);
        Assert.NotNull(notification.SyncOperationId);
        Assert.Equal($"/api/v1/sync/operations/{notification.SyncOperationId.Value:D}", notification.ActionUrl);
        Assert.Equal(expectedCreatedAtUtc, notification.CreatedAtUtc);
        Assert.Null(notification.ReadAtUtc);
        Assert.Null(notification.ArchivedAtUtc);
        return notification;
    }

    private static async Task<SyncOperation> ReadSyncOperationAsync(
        WebApplicationFactory<Program> testFactory,
        Guid syncOperationId)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<SyncOperation>()
            .AsNoTracking()
            .SingleAsync(operation => operation.Id == syncOperationId);
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

    private static void AssertFeatureStatus(
        JsonElement feature,
        string expectedState,
        string expectedStableCode)
    {
        Assert.Equal(expectedState, feature.GetProperty("state").GetString());
        Assert.Equal(expectedStableCode, feature.GetProperty("stableCode").GetString());
        Assert.NotEqual(JsonValueKind.Null, feature.GetProperty("safeMessage").ValueKind);
    }

    private static void AssertOperationSummary(
        JsonElement summary,
        string expectedState,
        int? expectedCount,
        string expectedStableCode)
    {
        Assert.Equal(expectedState, summary.GetProperty("state").GetString());
        if (expectedCount is null)
        {
            Assert.Equal(JsonValueKind.Null, summary.GetProperty("count").ValueKind);
        }
        else
        {
            Assert.Equal(expectedCount.Value, summary.GetProperty("count").GetInt32());
        }

        Assert.Equal(expectedStableCode, summary.GetProperty("stableCode").GetString());
        Assert.NotEqual(JsonValueKind.Null, summary.GetProperty("safeMessage").ValueKind);
    }

    private static void AssertUnsupportedFeatureCodes(JsonElement features, params string[] expectedFeatures)
    {
        var actualFeatures = features.EnumerateArray()
            .Select(feature => feature.GetProperty("feature").GetString())
            .ToArray();
        Assert.Equal(expectedFeatures, actualFeatures);

        foreach (var feature in features.EnumerateArray())
        {
            Assert.NotEqual(JsonValueKind.Null, feature.GetProperty("stableCode").ValueKind);
            Assert.NotEqual(JsonValueKind.Null, feature.GetProperty("safeMessage").ValueKind);
        }
    }

    private static void AssertUnsupportedFeatureValues(JsonElement features, params string[] expectedFeatures)
    {
        var actualFeatures = features.EnumerateArray()
            .Select(feature => feature.GetString())
            .ToArray();
        Assert.Equal(expectedFeatures, actualFeatures);
    }

    private static void AssertLocalBackupSessionContentIsSafe(
        string content,
        string rawSessionToken,
        Guid visibleBillId)
    {
        Assert.DoesNotContain("Backup Session Visible Merchant", content);
        Assert.DoesNotContain("Backup Session Hidden Merchant", content);
        Assert.DoesNotContain("Backup Session Guard Merchant", content);
        Assert.DoesNotContain("Seeded Sync Item", content);
        Assert.DoesNotContain("Sensitive sync item note", content);
        Assert.DoesNotContain("payment label secret", content);
        Assert.DoesNotContain("storage/object/key", content);
        Assert.DoesNotContain(rawSessionToken, content);
        Assert.DoesNotContain(visibleBillId.ToString("D"), content);
        Assert.DoesNotContain("packageBytes", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("downloadUrl", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storageObjectKey", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("signedUrl", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("directStorageUrl", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("artifactId", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("bucketName", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("bearerToken", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("downloadToken", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("downloadCredential", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("contentDisposition", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("filesystemPath", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("localDevicePath", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("restorePreviewRows", content, StringComparison.OrdinalIgnoreCase);
    }

    private static void AssertLocalBackupPackageContentIsSafe(
        string content,
        string rawSessionToken,
        Guid visibleBillId)
    {
        Assert.DoesNotContain("Backup Generation Visible Merchant", content);
        Assert.DoesNotContain("Backup Generation Hidden Merchant", content);
        Assert.DoesNotContain("Seeded Sync Item", content);
        Assert.DoesNotContain("Sensitive sync item note", content);
        Assert.DoesNotContain("payment label secret", content);
        Assert.DoesNotContain("storage/object/key", content);
        Assert.DoesNotContain(rawSessionToken, content);
        Assert.DoesNotContain(visibleBillId.ToString("D"), content);
        Assert.DoesNotContain("storageObjectKey", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("signedUrl", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("directStorageUrl", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("bucketName", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("bearerToken", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("downloadToken", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("downloadCredential", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("filesystemPath", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("localDevicePath", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("/tmp/", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("/mnt/", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("objectKey", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("rawOcrText", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("password", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("secret", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("credential", content, StringComparison.OrdinalIgnoreCase);
    }

    private static void AssertLocalBackupArtifactReady(
        JsonElement root,
        Guid packageSessionId,
        bool expectDownloadAction)
    {
        Assert.Equal(packageSessionId, root.GetProperty("packageSessionId").GetGuid());
        Assert.Equal(expectDownloadAction ? "download_action_ready" : "ready", root.GetProperty("status").GetString());
        Assert.Equal(expectDownloadAction ? "package_download_action_ready" : "package_ready_to_download", root.GetProperty("stableCode").GetString());
        if (!expectDownloadAction)
        {
            Assert.False(root.GetProperty("canPreparePackage").GetBoolean());
        }

        Assert.True(root.GetProperty("artifactAvailable").GetBoolean());
        Assert.True(root.GetProperty("canDownloadPackage").GetBoolean());
        Assert.True(root.GetProperty("downloadAvailable").GetBoolean());
        if (!expectDownloadAction)
        {
            Assert.NotEqual(JsonValueKind.Null, root.GetProperty("generatedAtUtc").ValueKind);
        }

        Assert.NotEqual(JsonValueKind.Null, root.GetProperty("expiresAtUtc").ValueKind);
        if (!expectDownloadAction)
        {
            Assert.NotEqual(JsonValueKind.Null, root.GetProperty("artifactExpiresAtUtc").ValueKind);
        }

        Assert.EndsWith(".json", root.GetProperty("safeFilename").GetString());
        Assert.Equal("application/vnd.settleora.local-backup+json", root.GetProperty("contentType").GetString());
        Assert.True(root.GetProperty("contentLengthBytes").GetInt32() > 0);
        Assert.Equal(64, root.GetProperty("packageSha256").GetString()!.Length);
        if (expectDownloadAction)
        {
            Assert.NotEqual(Guid.Empty, root.GetProperty("downloadActionId").GetGuid());
            Assert.NotEqual(JsonValueKind.Null, root.GetProperty("downloadActionExpiresAtUtc").ValueKind);
            Assert.StartsWith("/api/v1/local-backup/package-sessions/", root.GetProperty("contentPath").GetString(), StringComparison.Ordinal);
        }

        Assert.NotEqual(JsonValueKind.Null, root.GetProperty("privacyBoundary").ValueKind);
        Assert.NotEqual(JsonValueKind.Null, root.GetProperty("dataEgressBoundary").ValueKind);
        AssertUnsupportedFeatureValues(
            root.GetProperty("unsupportedFeatures"),
            "restore_preview",
            "restore_confirmation",
            "browser_local_persistence",
            "local_mode_authority");
        Assert.Contains("create_download_action", root.GetProperty("nextAllowedActions").EnumerateArray().Select(action => action.GetString()));
    }

    private static void AssertLocalBackupArtifactMetadataOnly(
        JsonElement root,
        Guid packageSessionId,
        string expectedStatus,
        string expectedStableCode)
    {
        Assert.Equal(packageSessionId, root.GetProperty("packageSessionId").GetGuid());
        Assert.Equal(expectedStatus, root.GetProperty("status").GetString());
        Assert.Equal(expectedStableCode, root.GetProperty("stableCode").GetString());
        Assert.False(root.GetProperty("canPreparePackage").GetBoolean());
        Assert.False(root.GetProperty("artifactAvailable").GetBoolean());
        Assert.False(root.GetProperty("canDownloadPackage").GetBoolean());
        Assert.False(root.GetProperty("downloadAvailable").GetBoolean());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("generatedAtUtc").ValueKind);
        Assert.NotEqual(JsonValueKind.Null, root.GetProperty("expiresAtUtc").ValueKind);
        Assert.NotEqual(JsonValueKind.Null, root.GetProperty("privacyBoundary").ValueKind);
        Assert.NotEqual(JsonValueKind.Null, root.GetProperty("dataEgressBoundary").ValueKind);
        AssertUnsupportedFeatureValues(
            root.GetProperty("unsupportedFeatures"),
            "restore_preview",
            "restore_confirmation",
            "browser_local_persistence",
            "local_mode_authority");
        Assert.NotEmpty(root.GetProperty("nextAllowedActions").EnumerateArray());
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
