using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Auth.Authorization;

internal sealed class BusinessAuthorizationService : IBusinessAuthorizationService
{
    private readonly ICurrentActorAccessor currentActorAccessor;
    private readonly SettleoraDbContext dbContext;

    public BusinessAuthorizationService(
        ICurrentActorAccessor currentActorAccessor,
        SettleoraDbContext dbContext)
    {
        this.currentActorAccessor = currentActorAccessor;
        this.dbContext = dbContext;
    }

    public async Task<BusinessAuthorizationResult> CanAccessProfileAsync(
        Guid userProfileId,
        CancellationToken cancellationToken = default)
    {
        if (!TryGetActor(out var actor))
        {
            return DeniedUnauthenticated();
        }

        if (actor.UserProfileId != userProfileId)
        {
            return DeniedNotFoundOrNotAllowed();
        }

        var profileExists = await dbContext.Set<UserProfile>()
            .AsNoTracking()
            .AnyAsync(
                profile => profile.Id == userProfileId
                    && profile.DeletedAtUtc == null,
                cancellationToken);

        return profileExists
            ? BusinessAuthorizationResult.Allow()
            : DeniedNotFoundOrNotAllowed();
    }

    public async Task<BusinessAuthorizationResult> CanAccessGroupAsync(
        Guid groupId,
        CancellationToken cancellationToken = default)
    {
        if (!TryGetActor(out var actor))
        {
            return DeniedUnauthenticated();
        }

        var membership = await GetActiveActorMembershipAsync(actor, groupId, cancellationToken);
        if (membership is null)
        {
            return DeniedNotFoundOrNotAllowed();
        }

        return membership.Role is GroupMembershipRoles.Owner or GroupMembershipRoles.Member
            ? BusinessAuthorizationResult.Allow()
            : DeniedInsufficientRole();
    }

    public Task<BusinessAuthorizationResult> CanManageGroupMembershipAsync(
        Guid groupId,
        CancellationToken cancellationToken = default)
    {
        return CanPerformGroupOwnerActionAsync(groupId, cancellationToken);
    }

    public Task<BusinessAuthorizationResult> CanManageGroupSettingsAsync(
        Guid groupId,
        CancellationToken cancellationToken = default)
    {
        return CanPerformGroupOwnerActionAsync(groupId, cancellationToken);
    }

    public BusinessAuthorizationResult HasSystemRole(string systemRole)
    {
        if (!TryGetActor(out var actor))
        {
            return DeniedUnauthenticated();
        }

        if (!SettleoraAuthorizationPolicies.IsSupportedSystemRole(systemRole))
        {
            return DeniedInsufficientRole();
        }

        return actor.SystemRoles.Contains(systemRole, StringComparer.Ordinal)
            ? BusinessAuthorizationResult.Allow()
            : DeniedInsufficientRole();
    }

    private async Task<BusinessAuthorizationResult> CanPerformGroupOwnerActionAsync(
        Guid groupId,
        CancellationToken cancellationToken)
    {
        if (!TryGetActor(out var actor))
        {
            return DeniedUnauthenticated();
        }

        var membership = await GetActiveActorMembershipAsync(actor, groupId, cancellationToken);
        if (membership is null)
        {
            return DeniedNotFoundOrNotAllowed();
        }

        return membership.Role is GroupMembershipRoles.Owner
            ? BusinessAuthorizationResult.Allow()
            : DeniedInsufficientRole();
    }

    private async Task<GroupMembership?> GetActiveActorMembershipAsync(
        AuthenticatedActor actor,
        Guid groupId,
        CancellationToken cancellationToken)
    {
        var actorProfileExists = await dbContext.Set<UserProfile>()
            .AsNoTracking()
            .AnyAsync(
                profile => profile.Id == actor.UserProfileId
                    && profile.DeletedAtUtc == null,
                cancellationToken);
        if (!actorProfileExists)
        {
            return null;
        }

        var groupExists = await dbContext.Set<UserGroup>()
            .AsNoTracking()
            .AnyAsync(
                group => group.Id == groupId
                    && group.DeletedAtUtc == null,
                cancellationToken);
        if (!groupExists)
        {
            return null;
        }

        return await dbContext.Set<GroupMembership>()
            .AsNoTracking()
            .SingleOrDefaultAsync(
                membership => membership.GroupId == groupId
                    && membership.UserProfileId == actor.UserProfileId
                    && membership.Status == GroupMembershipStatuses.Active,
                cancellationToken);
    }

    private bool TryGetActor(out AuthenticatedActor actor)
    {
        return currentActorAccessor.TryGetCurrentActor(out actor);
    }

    private static BusinessAuthorizationResult DeniedUnauthenticated()
    {
        return BusinessAuthorizationResult.Deny(
            BusinessAuthorizationFailureReason.DeniedUnauthenticated);
    }

    private static BusinessAuthorizationResult DeniedNotFoundOrNotAllowed()
    {
        return BusinessAuthorizationResult.Deny(
            BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed);
    }

    private static BusinessAuthorizationResult DeniedInsufficientRole()
    {
        return BusinessAuthorizationResult.Deny(
            BusinessAuthorizationFailureReason.DeniedInsufficientRole);
    }
}
