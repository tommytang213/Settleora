using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Users.Groups;

internal static class GroupMemberManagementEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string GroupMemberUnavailableTitle = "Group member unavailable";
    private const string GroupMemberUnavailableDetail = "The requested group member is unavailable.";
    private const string GroupMemberPermissionDeniedTitle = "Group member permission denied";
    private const string GroupMemberPermissionDeniedDetail = "The authenticated actor cannot manage group members.";
    private const string InvalidGroupMemberRequestTitle = "Invalid group member request";
    private const string InvalidGroupMemberRequestDetail = "The submitted group member request is invalid.";
    private const string GroupMemberConflictTitle = "Group member conflict";
    private const string GroupMemberConflictDetail = "The submitted group membership change conflicts with current group membership state.";
    private const string GroupMemberWriteFailedTitle = "Group member write failed";
    private const string GroupMemberWriteFailedDetail = "Unable to complete group member write.";
    private const string GroupMemberAddedAction = "group_member.added";
    private const string GroupMemberRoleUpdatedAction = "group_member.role_updated";
    private const string GroupMemberRemovedAction = "group_member.removed";

    public static WebApplication MapGroupMemberManagementEndpoints(this WebApplication app)
    {
        var groupMembers = app.MapGroup("/api/v1/groups/{groupId:guid}/members")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        groupMembers.MapGet("", ListMembersAsync);
        groupMembers.MapPost("", AddMemberAsync);
        groupMembers.MapPatch("/{userProfileId:guid}", UpdateMemberAsync);
        groupMembers.MapDelete("/{userProfileId:guid}", RemoveMemberAsync);

        return app;
    }

    private static async Task<IResult> ListMembersAsync(
        Guid groupId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out _))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var members = await dbContext.Set<GroupMembership>()
            .AsNoTracking()
            .Where(membership => membership.GroupId == groupId
                && membership.Status == GroupMembershipStatuses.Active
                && membership.Group.DeletedAtUtc == null
                && membership.UserProfile.DeletedAtUtc == null)
            .OrderBy(membership => membership.CreatedAtUtc)
            .ThenBy(membership => membership.UserProfileId)
            .Select(membership => new GroupMemberResponse(
                membership.UserProfileId,
                membership.UserProfile.DisplayName,
                membership.Role,
                membership.Status,
                membership.CreatedAtUtc,
                membership.UpdatedAtUtc))
            .ToListAsync(cancellationToken);

        return Results.Ok(new GroupMemberListResponse(members));
    }

    private static async Task<IResult> AddMemberAsync(
        Guid groupId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IGroupMembershipAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await ReadAddRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.UserProfileId is null || readResult.Role is null)
        {
            return InvalidGroupMemberRequest(readResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanManageGroupMembershipAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var target = await LoadActiveProfileWithAccountAsync(
            dbContext,
            readResult.UserProfileId.Value,
            cancellationToken);
        if (target is null)
        {
            return GroupMemberUnavailable();
        }

        var membershipExists = await MembershipExistsAsync(
            dbContext,
            groupId,
            readResult.UserProfileId.Value,
            cancellationToken);
        if (membershipExists)
        {
            return GroupMemberConflict();
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        var membership = new GroupMembership
        {
            GroupId = groupId,
            UserProfileId = readResult.UserProfileId.Value,
            Role = readResult.Role,
            Status = GroupMembershipStatuses.Active,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc
        };

        dbContext.Set<GroupMembership>().Add(membership);
        await auditWriter.WriteAsync(
            new GroupMembershipAuditEvent(
                GroupMemberAddedAction,
                actor.AuthAccountId,
                target.AuthAccountId,
                groupId,
                readResult.UserProfileId.Value,
                PreviousRole: null,
                NewRole: readResult.Role,
                PreviousStatus: null,
                NewStatus: null,
                OccurredAtUtc: occurredAtUtc),
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return await MembershipExistsAsync(
                dbContext,
                groupId,
                readResult.UserProfileId.Value,
                cancellationToken)
                ? GroupMemberConflict()
                : GroupMemberWriteFailed();
        }

        return Results.Created(
            $"/api/v1/groups/{groupId:D}/members/{membership.UserProfileId:D}",
            MapResponse(membership, target.UserProfile));
    }

    private static async Task<IResult> UpdateMemberAsync(
        Guid groupId,
        Guid userProfileId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IGroupMembershipAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await ReadUpdateRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Role is null)
        {
            return InvalidGroupMemberRequest(readResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanManageGroupMembershipAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var membership = await LoadActiveMembershipAsync(
            dbContext,
            groupId,
            userProfileId,
            trackChanges: true,
            cancellationToken);
        if (membership is null)
        {
            return GroupMemberUnavailable();
        }

        if (membership.Role == GroupMembershipRoles.Owner
            && readResult.Role == GroupMembershipRoles.Member
            && await CountActiveOwnersAsync(dbContext, groupId, cancellationToken) <= 1)
        {
            return GroupMemberConflict();
        }

        var previousRole = membership.Role;
        var occurredAtUtc = timeProvider.GetUtcNow();
        var subjectAuthAccountId = await ResolveActiveAuthAccountIdAsync(
            dbContext,
            userProfileId,
            cancellationToken);

        membership.Role = readResult.Role;
        membership.UpdatedAtUtc = occurredAtUtc;
        await auditWriter.WriteAsync(
            new GroupMembershipAuditEvent(
                GroupMemberRoleUpdatedAction,
                actor.AuthAccountId,
                subjectAuthAccountId,
                groupId,
                userProfileId,
                previousRole,
                readResult.Role,
                PreviousStatus: null,
                NewStatus: null,
                OccurredAtUtc: occurredAtUtc),
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return GroupMemberWriteFailed();
        }

        return Results.Ok(MapResponse(membership, membership.UserProfile));
    }

    private static async Task<IResult> RemoveMemberAsync(
        Guid groupId,
        Guid userProfileId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IGroupMembershipAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanManageGroupMembershipAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var membership = await LoadActiveMembershipAsync(
            dbContext,
            groupId,
            userProfileId,
            trackChanges: true,
            cancellationToken);
        if (membership is null)
        {
            return GroupMemberUnavailable();
        }

        if (membership.Role == GroupMembershipRoles.Owner
            && await CountActiveOwnersAsync(dbContext, groupId, cancellationToken) <= 1)
        {
            return GroupMemberConflict();
        }

        var previousStatus = membership.Status;
        var occurredAtUtc = timeProvider.GetUtcNow();
        var subjectAuthAccountId = await ResolveActiveAuthAccountIdAsync(
            dbContext,
            userProfileId,
            cancellationToken);

        membership.Status = GroupMembershipStatuses.Removed;
        membership.UpdatedAtUtc = occurredAtUtc;
        await auditWriter.WriteAsync(
            new GroupMembershipAuditEvent(
                GroupMemberRemovedAction,
                actor.AuthAccountId,
                subjectAuthAccountId,
                groupId,
                userProfileId,
                PreviousRole: null,
                NewRole: null,
                PreviousStatus: previousStatus,
                NewStatus: GroupMembershipStatuses.Removed,
                OccurredAtUtc: occurredAtUtc),
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return GroupMemberWriteFailed();
        }

        return Results.NoContent();
    }

    private static async Task<GroupMemberRequestReadResult> ReadAddRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        return await ReadMemberRequestAsync(
            request,
            requiresUserProfileId: true,
            requiresRole: false,
            cancellationToken);
    }

    private static async Task<GroupMemberRequestReadResult> ReadUpdateRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        return await ReadMemberRequestAsync(
            request,
            requiresUserProfileId: false,
            requiresRole: true,
            cancellationToken);
    }

    private static async Task<GroupMemberRequestReadResult> ReadMemberRequestAsync(
        HttpRequest request,
        bool requiresUserProfileId,
        bool requiresRole,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            errors["body"] = ["A JSON object body is required."];
            return GroupMemberRequestReadResult.Invalid(errors);
        }

        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(
                request.Body,
                cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            errors["body"] = ["A JSON object body is required."];
            return GroupMemberRequestReadResult.Invalid(errors);
        }
        catch (BadHttpRequestException)
        {
            errors["body"] = ["A JSON object body is required."];
            return GroupMemberRequestReadResult.Invalid(errors);
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                errors["body"] = ["A JSON object body is required."];
                return GroupMemberRequestReadResult.Invalid(errors);
            }

            Guid? userProfileId = null;
            string? role = null;
            var hasUserProfileId = false;
            var hasRole = false;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "userProfileId":
                        if (!requiresUserProfileId)
                        {
                            errors[property.Name] = ["This field is not supported."];
                            break;
                        }

                        hasUserProfileId = true;
                        userProfileId = ReadUserProfileId(property.Value, errors);
                        break;
                    case "role":
                        hasRole = true;
                        role = ReadRole(property.Value, errors);
                        break;
                    default:
                        errors[property.Name] = ["This field is not supported."];
                        break;
                }
            }

            if (requiresUserProfileId && !hasUserProfileId)
            {
                errors["userProfileId"] = ["User profile ID is required."];
            }

            if (requiresRole && !hasRole)
            {
                errors["role"] = ["Group role is required."];
            }

            if (!requiresRole && !hasRole)
            {
                role = GroupMembershipRoles.Member;
            }

            return errors.Count == 0
                ? GroupMemberRequestReadResult.Valid(userProfileId, role!)
                : GroupMemberRequestReadResult.Invalid(errors);
        }
    }

    private static Guid? ReadUserProfileId(
        JsonElement value,
        Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is not JsonValueKind.String
            || !Guid.TryParse(value.GetString(), out var userProfileId))
        {
            errors["userProfileId"] = ["User profile ID must be a UUID string."];
            return null;
        }

        return userProfileId;
    }

    private static string? ReadRole(
        JsonElement value,
        Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            errors["role"] = ["Group role must be owner or member."];
            return null;
        }

        var role = value.GetString();
        if (role is not (GroupMembershipRoles.Owner or GroupMembershipRoles.Member))
        {
            errors["role"] = ["Group role must be owner or member."];
            return null;
        }

        return role;
    }

    private static async Task<ActiveProfileWithAccount?> LoadActiveProfileWithAccountAsync(
        SettleoraDbContext dbContext,
        Guid userProfileId,
        CancellationToken cancellationToken)
    {
        return await dbContext.Set<AuthAccount>()
            .AsNoTracking()
            .Where(account => account.UserProfileId == userProfileId
                && account.Status == AuthAccountStatuses.Active
                && account.DeletedAtUtc == null
                && account.UserProfile.DeletedAtUtc == null)
            .Select(account => new ActiveProfileWithAccount(
                account.Id,
                account.UserProfile))
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static Task<Guid?> ResolveActiveAuthAccountIdAsync(
        SettleoraDbContext dbContext,
        Guid userProfileId,
        CancellationToken cancellationToken)
    {
        return dbContext.Set<AuthAccount>()
            .AsNoTracking()
            .Where(account => account.UserProfileId == userProfileId
                && account.Status == AuthAccountStatuses.Active
                && account.DeletedAtUtc == null
                && account.UserProfile.DeletedAtUtc == null)
            .Select(account => (Guid?)account.Id)
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static Task<bool> MembershipExistsAsync(
        SettleoraDbContext dbContext,
        Guid groupId,
        Guid userProfileId,
        CancellationToken cancellationToken)
    {
        return dbContext.Set<GroupMembership>()
            .AsNoTracking()
            .AnyAsync(
                membership => membership.GroupId == groupId
                    && membership.UserProfileId == userProfileId,
                cancellationToken);
    }

    private static async Task<GroupMembership?> LoadActiveMembershipAsync(
        SettleoraDbContext dbContext,
        Guid groupId,
        Guid userProfileId,
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        var memberships = dbContext.Set<GroupMembership>()
            .Where(membership => membership.GroupId == groupId
                && membership.UserProfileId == userProfileId
                && membership.Status == GroupMembershipStatuses.Active
                && membership.Group.DeletedAtUtc == null
                && membership.UserProfile.DeletedAtUtc == null);

        if (!trackChanges)
        {
            memberships = memberships.AsNoTracking();
        }

        return await memberships
            .Include(membership => membership.UserProfile)
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static Task<int> CountActiveOwnersAsync(
        SettleoraDbContext dbContext,
        Guid groupId,
        CancellationToken cancellationToken)
    {
        return dbContext.Set<GroupMembership>()
            .AsNoTracking()
            .CountAsync(
                membership => membership.GroupId == groupId
                    && membership.Role == GroupMembershipRoles.Owner
                    && membership.Status == GroupMembershipStatuses.Active
                    && membership.Group.DeletedAtUtc == null
                    && membership.UserProfile.DeletedAtUtc == null,
                cancellationToken);
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason switch
        {
            BusinessAuthorizationFailureReason.DeniedUnauthenticated => Unauthenticated(),
            BusinessAuthorizationFailureReason.DeniedInsufficientRole => GroupMemberPermissionDenied(),
            _ => GroupMemberUnavailable()
        };
    }

    private static GroupMemberResponse MapResponse(
        GroupMembership membership,
        UserProfile userProfile)
    {
        return new GroupMemberResponse(
            membership.UserProfileId,
            userProfile.DisplayName,
            membership.Role,
            membership.Status,
            membership.CreatedAtUtc,
            membership.UpdatedAtUtc);
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult GroupMemberUnavailable()
    {
        return Results.Problem(
            title: GroupMemberUnavailableTitle,
            detail: GroupMemberUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult GroupMemberPermissionDenied()
    {
        return Results.Problem(
            title: GroupMemberPermissionDeniedTitle,
            detail: GroupMemberPermissionDeniedDetail,
            statusCode: StatusCodes.Status403Forbidden);
    }

    private static IResult InvalidGroupMemberRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidGroupMemberRequestTitle,
            detail: InvalidGroupMemberRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult GroupMemberConflict()
    {
        return Results.Problem(
            title: GroupMemberConflictTitle,
            detail: GroupMemberConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult GroupMemberWriteFailed()
    {
        return Results.Problem(
            title: GroupMemberWriteFailedTitle,
            detail: GroupMemberWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private sealed class GroupMemberRequestReadResult
    {
        private GroupMemberRequestReadResult(
            Guid? userProfileId,
            string? role,
            IDictionary<string, string[]> errors)
        {
            UserProfileId = userProfileId;
            Role = role;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public Guid? UserProfileId { get; }

        public string? Role { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static GroupMemberRequestReadResult Valid(
            Guid? userProfileId,
            string role)
        {
            return new GroupMemberRequestReadResult(
                userProfileId,
                role,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static GroupMemberRequestReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new GroupMemberRequestReadResult(null, null, errors);
        }
    }

    private sealed record ActiveProfileWithAccount(
        Guid AuthAccountId,
        UserProfile UserProfile);
}
