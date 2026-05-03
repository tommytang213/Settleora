using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class BusinessAuthorizationServiceTests
{
    private static readonly DateTimeOffset Timestamp = new(2026, 5, 4, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task OwnProfileAccessIsAllowed()
    {
        using var dbContext = CreateDbContext();
        var data = await SeedDataAsync(dbContext);
        var service = CreateService(dbContext, CreateActor(data.ActorProfileId));

        var result = await service.CanAccessProfileAsync(data.ActorProfileId);

        AssertAllowed(result);
    }

    [Fact]
    public async Task AnotherProfileAccessIsDeniedWithoutSystemRoleBypass()
    {
        using var dbContext = CreateDbContext();
        var data = await SeedDataAsync(dbContext);
        var actor = CreateActor(
            data.ActorProfileId,
            [SystemRoles.Owner, SystemRoles.Admin, SystemRoles.User]);
        var service = CreateService(dbContext, actor);

        var result = await service.CanAccessProfileAsync(data.OtherProfileId);

        AssertDenied(result, BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed);
    }

    [Fact]
    public async Task MissingActorDeniesProfileAccessAsUnauthenticated()
    {
        using var dbContext = CreateDbContext();
        var data = await SeedDataAsync(dbContext);
        var service = CreateService(dbContext, actor: null);

        var result = await service.CanAccessProfileAsync(data.ActorProfileId);

        AssertDenied(result, BusinessAuthorizationFailureReason.DeniedUnauthenticated);
    }

    [Fact]
    public async Task MissingOwnProfileDeniesWithoutLeakingProfileState()
    {
        using var dbContext = CreateDbContext();
        var actorProfileId = Guid.NewGuid();
        var service = CreateService(dbContext, CreateActor(actorProfileId));

        var result = await service.CanAccessProfileAsync(actorProfileId);

        AssertDenied(result, BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed);
    }

    [Fact]
    public async Task ActiveGroupMemberCanAccessGroup()
    {
        using var dbContext = CreateDbContext();
        var data = await SeedDataAsync(
            dbContext,
            actorGroupRole: GroupMembershipRoles.Member,
            actorMembershipStatus: GroupMembershipStatuses.Active);
        var service = CreateService(dbContext, CreateActor(data.ActorProfileId));

        var result = await service.CanAccessGroupAsync(data.GroupId);

        AssertAllowed(result);
    }

    [Fact]
    public async Task ActiveGroupOwnerCanManageMembershipAndSettings()
    {
        using var dbContext = CreateDbContext();
        var data = await SeedDataAsync(
            dbContext,
            actorGroupRole: GroupMembershipRoles.Owner,
            actorMembershipStatus: GroupMembershipStatuses.Active);
        var service = CreateService(dbContext, CreateActor(data.ActorProfileId));

        var membershipResult = await service.CanManageGroupMembershipAsync(data.GroupId);
        var settingsResult = await service.CanManageGroupSettingsAsync(data.GroupId);

        AssertAllowed(membershipResult);
        AssertAllowed(settingsResult);
    }

    [Fact]
    public async Task ActiveGroupMemberCannotPerformOwnerOnlyManagement()
    {
        using var dbContext = CreateDbContext();
        var data = await SeedDataAsync(
            dbContext,
            actorGroupRole: GroupMembershipRoles.Member,
            actorMembershipStatus: GroupMembershipStatuses.Active);
        var service = CreateService(dbContext, CreateActor(data.ActorProfileId));

        var result = await service.CanManageGroupMembershipAsync(data.GroupId);

        AssertDenied(result, BusinessAuthorizationFailureReason.DeniedInsufficientRole);
    }

    [Fact]
    public async Task RemovedMembershipCannotAccessGroup()
    {
        using var dbContext = CreateDbContext();
        var data = await SeedDataAsync(
            dbContext,
            actorGroupRole: GroupMembershipRoles.Owner,
            actorMembershipStatus: GroupMembershipStatuses.Removed);
        var service = CreateService(dbContext, CreateActor(data.ActorProfileId));

        var result = await service.CanAccessGroupAsync(data.GroupId);

        AssertDenied(result, BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed);
    }

    [Fact]
    public async Task UnrelatedGroupAccessIsDeniedWithoutLeakingGroupState()
    {
        using var dbContext = CreateDbContext();
        var data = await SeedDataAsync(dbContext);
        var service = CreateService(dbContext, CreateActor(data.ActorProfileId));

        var unrelatedResult = await service.CanAccessGroupAsync(data.UnrelatedGroupId);
        var missingResult = await service.CanAccessGroupAsync(Guid.NewGuid());

        AssertDenied(unrelatedResult, BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed);
        AssertDenied(missingResult, BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed);
        Assert.Equal(unrelatedResult.Code, missingResult.Code);
    }

    [Fact]
    public async Task SystemRolesAreRecognizedButDoNotBypassGroupMembership()
    {
        using var dbContext = CreateDbContext();
        var data = await SeedDataAsync(
            dbContext,
            actorGroupRole: GroupMembershipRoles.Member,
            actorMembershipStatus: GroupMembershipStatuses.Active);
        var actor = CreateActor(
            data.ActorProfileId,
            [SystemRoles.Owner, SystemRoles.Admin, SystemRoles.User]);
        var service = CreateService(dbContext, actor);

        var adminRoleResult = service.HasSystemRole(SystemRoles.Admin);
        var unrelatedGroupResult = await service.CanAccessGroupAsync(data.UnrelatedGroupId);
        var ownerOnlyGroupResult = await service.CanManageGroupSettingsAsync(data.GroupId);

        AssertAllowed(adminRoleResult);
        AssertDenied(unrelatedGroupResult, BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed);
        AssertDenied(ownerOnlyGroupResult, BusinessAuthorizationFailureReason.DeniedInsufficientRole);
    }

    [Fact]
    public void MissingActorDeniesSystemRoleDetectionAsUnauthenticated()
    {
        using var dbContext = CreateDbContext();
        var service = CreateService(dbContext, actor: null);

        var result = service.HasSystemRole(SystemRoles.Owner);

        AssertDenied(result, BusinessAuthorizationFailureReason.DeniedUnauthenticated);
    }

    [Fact]
    public void ResultStringUsesOnlySafeBoundedCodes()
    {
        const string visibleToken = "raw-token-like-material";
        const string visiblePassword = "visible-password-material";
        var result = BusinessAuthorizationResult.Deny(
            BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed);

        var text = result.ToString();

        Assert.Contains("denied_not_found_or_not_allowed", text, StringComparison.Ordinal);
        Assert.DoesNotContain(visibleToken, text, StringComparison.Ordinal);
        Assert.DoesNotContain(visiblePassword, text, StringComparison.Ordinal);
        Assert.DoesNotContain("password", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("hash", text, StringComparison.OrdinalIgnoreCase);
    }

    private static SettleoraDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SettleoraDbContext(options);
    }

    private static IBusinessAuthorizationService CreateService(
        SettleoraDbContext dbContext,
        AuthenticatedActor? actor)
    {
        return new BusinessAuthorizationService(
            new TestCurrentActorAccessor(actor),
            dbContext);
    }

    private static AuthenticatedActor CreateActor(
        Guid userProfileId,
        IReadOnlyList<string>? systemRoles = null)
    {
        return new AuthenticatedActor(
            Guid.NewGuid(),
            userProfileId,
            Guid.NewGuid(),
            Timestamp.AddHours(1),
            systemRoles ?? [SystemRoles.User]);
    }

    private static async Task<SeededData> SeedDataAsync(
        SettleoraDbContext dbContext,
        string actorGroupRole = GroupMembershipRoles.Member,
        string actorMembershipStatus = GroupMembershipStatuses.Active)
    {
        var actorProfileId = Guid.NewGuid();
        var otherProfileId = Guid.NewGuid();
        var groupId = Guid.NewGuid();
        var unrelatedGroupId = Guid.NewGuid();

        dbContext.Set<UserProfile>().AddRange(
            new UserProfile
            {
                Id = actorProfileId,
                DisplayName = "Actor Profile",
                DefaultCurrency = "USD",
                CreatedAtUtc = Timestamp,
                UpdatedAtUtc = Timestamp
            },
            new UserProfile
            {
                Id = otherProfileId,
                DisplayName = "Other Profile",
                DefaultCurrency = "USD",
                CreatedAtUtc = Timestamp,
                UpdatedAtUtc = Timestamp
            });

        dbContext.Set<UserGroup>().AddRange(
            new UserGroup
            {
                Id = groupId,
                Name = "Household",
                CreatedByUserProfileId = actorProfileId,
                CreatedAtUtc = Timestamp,
                UpdatedAtUtc = Timestamp
            },
            new UserGroup
            {
                Id = unrelatedGroupId,
                Name = "Unrelated Group",
                CreatedByUserProfileId = otherProfileId,
                CreatedAtUtc = Timestamp,
                UpdatedAtUtc = Timestamp
            });

        dbContext.Set<GroupMembership>().AddRange(
            new GroupMembership
            {
                GroupId = groupId,
                UserProfileId = actorProfileId,
                Role = actorGroupRole,
                Status = actorMembershipStatus,
                CreatedAtUtc = Timestamp,
                UpdatedAtUtc = Timestamp
            },
            new GroupMembership
            {
                GroupId = unrelatedGroupId,
                UserProfileId = otherProfileId,
                Role = GroupMembershipRoles.Owner,
                Status = GroupMembershipStatuses.Active,
                CreatedAtUtc = Timestamp,
                UpdatedAtUtc = Timestamp
            });

        await dbContext.SaveChangesAsync();
        return new SeededData(actorProfileId, otherProfileId, groupId, unrelatedGroupId);
    }

    private static void AssertAllowed(BusinessAuthorizationResult result)
    {
        Assert.True(result.Allowed);
        Assert.Equal(BusinessAuthorizationFailureReason.None, result.FailureReason);
        Assert.Equal("allowed", result.Code);
    }

    private static void AssertDenied(
        BusinessAuthorizationResult result,
        BusinessAuthorizationFailureReason expectedFailureReason)
    {
        Assert.False(result.Allowed);
        Assert.Equal(expectedFailureReason, result.FailureReason);
        Assert.NotEqual("allowed", result.Code);
    }

    private sealed record SeededData(
        Guid ActorProfileId,
        Guid OtherProfileId,
        Guid GroupId,
        Guid UnrelatedGroupId);

    private sealed class TestCurrentActorAccessor : ICurrentActorAccessor
    {
        private readonly AuthenticatedActor? actor;

        public TestCurrentActorAccessor(AuthenticatedActor? actor)
        {
            this.actor = actor;
        }

        public bool TryGetCurrentActor(out AuthenticatedActor actor)
        {
            if (this.actor is null)
            {
                actor = default!;
                return false;
            }

            actor = this.actor;
            return true;
        }
    }
}
