using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Sync;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed partial class SyncOfflineServerFoundationEndpointTests
{
    public static IEnumerable<object?[]> DeniedGroupLifecycleActors()
    {
        foreach (var archive in new[] { true, false })
        {
            foreach (var role in new[] { "member", "group_owner" })
            {
                foreach (var baseVersion in new long?[] { null, 7, 6 })
                {
                    yield return [role, archive, baseVersion];
                }
            }

            foreach (var role in new[] { "creator_removed", "owner_removed", "outside" })
            {
                yield return [role, archive, 7L];
            }
        }
    }

    [Theory]
    [MemberData(nameof(DeniedGroupLifecycleActors))]
    public async Task GroupLifecycleSyncDeniesNonOwnersAndLostAccessBeforeVersionChecks(
        string role, bool archive, long? baseVersion)
    {
        var context = CreateFactory();
        using var testFactory = context.Factory;
        var scenario = await SeedGroupLifecycleScenarioAsync(testFactory, context.TimeProvider, role, archive);
        using var client = testFactory.CreateClient();
        context.TimeProvider.SetUtcNow(ArchiveTimestamp);
        var before = await ReadLifecycleBusinessStateAsync(testFactory);
        var body = SyncOperationJson("denied-lifecycle", archive ? "bill_archive" : "bill_restore",
            scenario.BillId, baseVersion, "");

        // The equivalent online operation and sync operation require the same actor authority.
        using (var onlineRequest = CreateBearerRequest(HttpMethod.Post,
            $"/api/v1/groups/{scenario.GroupId:D}/bills/{scenario.BillId:D}/{(archive ? "archive" : "restore")}",
            scenario.Actor.RawSessionToken))
        using (var onlineResponse = await client.SendAsync(onlineRequest))
        {
            Assert.Equal(HttpStatusCode.NotFound, onlineResponse.StatusCode);
        }

        Guid? operationId = null;
        for (var attempt = 0; attempt < 2; attempt++)
        {
            using var request = CreateJsonBearerRequest(HttpMethod.Post, "/api/v1/sync/operations",
                scenario.Actor.RawSessionToken, body);
            using var response = await client.SendAsync(request);
            var result = await AssertSyncOperationResponseAsync(response, "rejected", scenario.BillId,
                expectedVersion: null, "resource_unavailable");
            var currentId = result.GetProperty("operationId").GetGuid();
            if (operationId is not null)
            {
                Assert.Equal(operationId, currentId);
            }
            operationId = currentId;
            Assert.Equal(before, await ReadLifecycleBusinessStateAsync(testFactory));
        }

        Assert.Equal(1, await CountSyncOperationsAsync(testFactory));
        var operation = await ReadSyncOperationAsync(testFactory, operationId!.Value);
        Assert.Equal(scenario.Actor.UserProfileId, operation.ActorUserProfileId);
        Assert.Null(operation.ResultVersion);
        var audit = Assert.Single(await ReadLifecycleAndSyncAuditsAsync(testFactory));
        Assert.Equal("sync.operation_rejected", audit.Action);
        Assert.Equal(AuthAuditOutcomes.Denied, audit.Outcome);
        Assert.Equal(scenario.Actor.AuthAccountId, audit.ActorAuthAccountId);
        Assert.DoesNotContain("Lifecycle private merchant", audit.SafeMetadataJson);
        Assert.DoesNotContain("Sensitive sync item note", audit.SafeMetadataJson);
        await AssertSingleSyncOperationFailedNotificationAsync(testFactory, scenario.Actor.UserProfileId,
            scenario.BillId, expectedGroupId: null, ArchiveTimestamp);
    }

    [Theory]
    [InlineData("creator", true)]
    [InlineData("creator", false)]
    [InlineData("owner", true)]
    [InlineData("owner", false)]
    public async Task GroupLifecycleSyncAcceptsDistinctCreatorOrOwnerAndKeepsReplaysIdempotent(
        string role, bool archive)
    {
        var context = CreateFactory();
        using var testFactory = context.Factory;
        var scenario = await SeedGroupLifecycleScenarioAsync(testFactory, context.TimeProvider, role, archive);
        using var client = testFactory.CreateClient();
        context.TimeProvider.SetUtcNow(ArchiveTimestamp);
        var financialBefore = await ReadLifecycleBusinessStateAsync(testFactory, includeLifecycle: false);
        var body = SyncOperationJson("authorized-lifecycle", archive ? "bill_archive" : "bill_restore",
            scenario.BillId, 7, "");
        var first = await SendLifecycleOperationAsync(client, scenario, body, "accepted", 8, null);
        var after = await ReadLifecycleBusinessStateAsync(testFactory);
        Assert.Equal(archive ? ArchiveTimestamp : null, await ReadArchivedAtAsync(testFactory, scenario.BillId));
        Assert.Equal(financialBefore, await ReadLifecycleBusinessStateAsync(testFactory, includeLifecycle: false));
        using (var scope = testFactory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
            Assert.Equal(ArchiveTimestamp, (await db.Set<ExpenseBill>().SingleAsync()).UpdatedAtUtc);
            var version = await db.Set<SyncResourceVersion>().SingleAsync();
            Assert.Equal(8, version.Version);
            Assert.Equal(scenario.Actor.UserProfileId, version.ChangedByUserProfileId);
            Assert.Equal(scenario.GroupId, version.GroupId);
            Assert.Equal(archive, version.IsArchived);
        }

        context.TimeProvider.SetUtcNow(RestoreTimestamp);
        var replay = await SendLifecycleOperationAsync(client, scenario, body, "replayed", 8, null);
        Assert.Equal(first.GetProperty("operationId").GetGuid(), replay.GetProperty("operationId").GetGuid());
        Assert.Equal(after, await ReadLifecycleBusinessStateAsync(testFactory));
        Assert.Equal(1, await CountSyncOperationsAsync(testFactory));

        // A changed operation under the same key conflicts without creating new effects.
        await SendLifecycleOperationAsync(client, scenario,
            SyncOperationJson("authorized-lifecycle", archive ? "bill_restore" : "bill_archive", scenario.BillId, 8, ""),
            "conflict", null, "idempotency_key_conflict");
        Assert.Equal(after, await ReadLifecycleBusinessStateAsync(testFactory));
        Assert.Equal(1, await CountSyncOperationsAsync(testFactory));
        Assert.Equal(2, (await ReadLifecycleAndSyncAuditsAsync(testFactory)).Count);
        Assert.Equal(0, await CountInAppNotificationsAsync(testFactory));

        // A fresh request for the existing state is accepted without another lifecycle write.
        await SendLifecycleOperationAsync(client, scenario,
            SyncOperationJson("already-in-state", archive ? "bill_archive" : "bill_restore", scenario.BillId, 8, ""),
            "accepted", 8, null);
        Assert.Equal(after, await ReadLifecycleBusinessStateAsync(testFactory));
        Assert.Equal(2, await CountSyncOperationsAsync(testFactory));
        var audits = await ReadLifecycleAndSyncAuditsAsync(testFactory);
        var lifecycleAudit = Assert.Single(audits, audit => audit.Action.StartsWith("bill.", StringComparison.Ordinal));
        Assert.Equal(archive ? "bill.archived" : "bill.restored", lifecycleAudit.Action);
        Assert.Equal(scenario.Actor.AuthAccountId, lifecycleAudit.ActorAuthAccountId);
        Assert.Equal(AuthAuditOutcomes.Success, lifecycleAudit.Outcome);
        Assert.Equal(2, audits.Count(audit => audit.Action == "sync.operation_accepted"));
        Assert.Equal(0, await CountInAppNotificationsAsync(testFactory));

        // Current access is rechecked for new queued intent even after a prior accepted operation.
        using (var scope = testFactory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
            var membership = await db.Set<GroupMembership>().SingleAsync(member =>
                member.GroupId == scenario.GroupId && member.UserProfileId == scenario.Actor.UserProfileId);
            membership.Status = GroupMembershipStatuses.Removed;
            await db.SaveChangesAsync();
        }
        await SendLifecycleOperationAsync(client, scenario,
            SyncOperationJson("after-removal", archive ? "bill_restore" : "bill_archive", scenario.BillId, 7, ""),
            "rejected", null, "resource_unavailable");
        Assert.Equal(after, await ReadLifecycleBusinessStateAsync(testFactory));
        Assert.Equal(1, (await ReadLifecycleAndSyncAuditsAsync(testFactory)).Count(audit => audit.Action.StartsWith("bill.", StringComparison.Ordinal)));
        await AssertSingleSyncOperationFailedNotificationAsync(testFactory, scenario.Actor.UserProfileId,
            scenario.BillId, expectedGroupId: null, RestoreTimestamp);
    }

    [Theory]
    [InlineData("creator", true)]
    [InlineData("creator", false)]
    [InlineData("owner", true)]
    [InlineData("owner", false)]
    public async Task GroupLifecycleSyncAuthorizedStaleVersionConflictsWithoutLifecycleMutation(
        string role, bool archive)
    {
        var context = CreateFactory();
        using var testFactory = context.Factory;
        var scenario = await SeedGroupLifecycleScenarioAsync(testFactory, context.TimeProvider, role, archive);
        using var client = testFactory.CreateClient();
        context.TimeProvider.SetUtcNow(ArchiveTimestamp);
        var before = await ReadLifecycleBusinessStateAsync(testFactory);
        var body = SyncOperationJson("authorized-stale", archive ? "bill_archive" : "bill_restore", scenario.BillId, 6, "");
        var first = await SendLifecycleOperationAsync(client, scenario, body, "conflict", 7, "stale_base_version");
        var replay = await SendLifecycleOperationAsync(client, scenario, body, "conflict", 7, "stale_base_version");
        Assert.Equal(first.GetProperty("operationId").GetGuid(), replay.GetProperty("operationId").GetGuid());
        Assert.Equal(before, await ReadLifecycleBusinessStateAsync(testFactory));
        Assert.Equal(1, await CountSyncOperationsAsync(testFactory));
        var audit = Assert.Single(await ReadLifecycleAndSyncAuditsAsync(testFactory));
        Assert.Equal("sync.operation_conflicted", audit.Action);
        Assert.Equal(AuthAuditOutcomes.Denied, audit.Outcome);
        await AssertSingleSyncConflictNotificationAsync(testFactory, scenario.Actor.UserProfileId,
            scenario.BillId, scenario.GroupId, ArchiveTimestamp);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task GroupLifecycleSyncIdempotencyKeyCannotBorrowAnotherActorsAcceptedAuthority(bool archive)
    {
        var context = CreateFactory();
        using var testFactory = context.Factory;
        var scenario = await SeedGroupLifecycleScenarioAsync(testFactory, context.TimeProvider, "owner", archive);
        var other = await SeedSessionActorAsync(testFactory, context.TimeProvider, "Other active member");
        using (var scope = testFactory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
            db.Set<GroupMembership>().Add(new GroupMembership
            {
                GroupId = scenario.GroupId, UserProfileId = other.UserProfileId,
                Role = GroupMembershipRoles.Member, Status = GroupMembershipStatuses.Active,
                CreatedAtUtc = InitialTimestamp, UpdatedAtUtc = InitialTimestamp
            });
            await db.SaveChangesAsync();
        }
        using var client = testFactory.CreateClient();
        context.TimeProvider.SetUtcNow(ArchiveTimestamp);
        var body = SyncOperationJson("shared-key", archive ? "bill_archive" : "bill_restore", scenario.BillId, 7, "");
        var accepted = await SendLifecycleOperationAsync(client, scenario, body, "accepted", 8, null);
        var before = await ReadLifecycleBusinessStateAsync(testFactory);
        var otherScenario = scenario with { Actor = other };
        var denied = await SendLifecycleOperationAsync(client, otherScenario, body, "rejected", null, "resource_unavailable");
        var replay = await SendLifecycleOperationAsync(client, otherScenario, body, "rejected", null, "resource_unavailable");
        Assert.NotEqual(accepted.GetProperty("operationId").GetGuid(), denied.GetProperty("operationId").GetGuid());
        Assert.Equal(denied.GetProperty("operationId").GetGuid(), replay.GetProperty("operationId").GetGuid());
        Assert.Equal(before, await ReadLifecycleBusinessStateAsync(testFactory));
        Assert.Equal(2, await CountSyncOperationsAsync(testFactory));
        var audits = await ReadLifecycleAndSyncAuditsAsync(testFactory);
        Assert.Equal(3, audits.Count);
        Assert.Single(audits, audit => audit.Action == "sync.operation_rejected" && audit.ActorAuthAccountId == other.AuthAccountId);
        await AssertSingleSyncOperationFailedNotificationAsync(testFactory, other.UserProfileId,
            scenario.BillId, expectedGroupId: null, ArchiveTimestamp);
    }

    private static async Task<JsonElement> SendLifecycleOperationAsync(
        HttpClient client, GroupLifecycleScenario scenario, string body, string status, long? version, string? code)
    {
        using var request = CreateJsonBearerRequest(HttpMethod.Post, "/api/v1/sync/operations",
            scenario.Actor.RawSessionToken, body);
        using var response = await client.SendAsync(request);
        return await AssertSyncOperationResponseAsync(response, status, scenario.BillId, version, code);
    }

    private static async Task<GroupLifecycleScenario> SeedGroupLifecycleScenarioAsync(
        WebApplicationFactory<Program> testFactory, SyncTestTimeProvider timeProvider, string role, bool archive)
    {
        var creator = await SeedSessionActorAsync(testFactory, timeProvider, "Lifecycle creator");
        var owner = await SeedSessionActorAsync(testFactory, timeProvider, "Lifecycle distinct bill owner");
        var actor = role.StartsWith("creator", StringComparison.Ordinal) ? creator
            : role.StartsWith("owner", StringComparison.Ordinal) ? owner
            : await SeedSessionActorAsync(testFactory, timeProvider, "Lifecycle other actor");
        var memberships = new List<MembershipSeed>
        {
            new(creator.UserProfileId, GroupMembershipRoles.Member,
                role == "creator_removed" ? GroupMembershipStatuses.Removed : GroupMembershipStatuses.Active),
            new(owner.UserProfileId, GroupMembershipRoles.Member,
                role == "owner_removed" ? GroupMembershipStatuses.Removed : GroupMembershipStatuses.Active)
        };
        if (role is "member" or "group_owner")
        {
            memberships.Add(new(actor.UserProfileId,
                role == "group_owner" ? GroupMembershipRoles.Owner : GroupMembershipRoles.Member,
                GroupMembershipStatuses.Active));
        }
        var groupId = await SeedGroupAsync(testFactory,
            role == "group_owner" ? actor.UserProfileId : creator.UserProfileId,
            "Lifecycle group", InitialTimestamp, memberships.ToArray());
        var billId = await SeedBillAsync(testFactory, creator.UserProfileId, groupId,
            new[] { creator.UserProfileId, owner.UserProfileId, actor.UserProfileId }.Distinct().ToArray(),
            "Lifecycle private merchant", InitialTimestamp, includeSensitiveRows: true);
        using var scope = testFactory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var bill = await db.Set<ExpenseBill>().SingleAsync(bill => bill.Id == billId);
        bill.BillOwnerUserProfileId = owner.UserProfileId;
        bill.ArchivedAtUtc = archive ? null : InitialTimestamp;
        db.Set<SyncResourceVersion>().Add(new SyncResourceVersion
        {
            Id = Guid.NewGuid(), ResourceType = SyncResourceTypes.ExpenseBill, ResourceId = billId,
            Version = 7, ChangeKind = archive ? SyncChangeKinds.Updated : SyncChangeKinds.Archived,
            ChangedAtUtc = InitialTimestamp, ChangedByUserProfileId = creator.UserProfileId,
            OwnerUserProfileId = owner.UserProfileId, GroupId = groupId, IsArchived = !archive
        });
        await db.SaveChangesAsync();
        return new GroupLifecycleScenario(actor, billId, groupId);
    }

    private static async Task<List<AuthAuditEvent>> ReadLifecycleAndSyncAuditsAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>().Set<AuthAuditEvent>()
            .AsNoTracking().Where(audit => audit.Action.StartsWith("sync.") || audit.Action.StartsWith("bill."))
            .ToListAsync();
    }

    private static async Task<string> ReadLifecycleBusinessStateAsync(
        WebApplicationFactory<Program> testFactory, bool includeLifecycle = true)
    {
        using var scope = testFactory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        // Compare every persisted scalar, including identifiers, timestamps and money, not just row counts.
        var rows = new SortedDictionary<string, string[]>();
        async Task Capture<TEntity>() where TEntity : class
        {
            var entities = await db.Set<TEntity>().AsNoTracking().ToListAsync();
            rows[typeof(TEntity).Name] = entities.Select(entity => JsonSerializer.Serialize(
                db.Entry(entity).Properties
                    .Where(property => includeLifecycle || typeof(TEntity) != typeof(ExpenseBill)
                        || property.Metadata.Name is not (nameof(ExpenseBill.ArchivedAtUtc) or nameof(ExpenseBill.UpdatedAtUtc)))
                    .OrderBy(property => property.Metadata.Name, StringComparer.Ordinal)
                    .ToDictionary(property => property.Metadata.Name, property => property.CurrentValue)))
                .Order(StringComparer.Ordinal).ToArray();
        }
        await Capture<ExpenseBill>();
        await Capture<ExpenseBillItem>();
        await Capture<ExpenseBillItemSplit>();
        await Capture<ExpenseBillParticipant>();
        await Capture<ExpenseBillPayer>();
        await Capture<ExpenseBillAdjustment>();
        await Capture<ExpenseBillAttachment>();
        await Capture<ReceiptOcrReview>();
        await Capture<FileObject>();
        await Capture<SettlementRequest>();
        if (includeLifecycle)
        {
            await Capture<SyncResourceVersion>();
        }
        return JsonSerializer.Serialize(rows);
    }

    private sealed record GroupLifecycleScenario(SeededSession Actor, Guid BillId, Guid GroupId);
}
