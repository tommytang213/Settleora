using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Users.Groups;

internal static class GroupFoundationEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string GroupUnavailableTitle = "Group unavailable";
    private const string GroupUnavailableDetail = "The requested group is unavailable.";
    private const string GroupPermissionDeniedTitle = "Group permission denied";
    private const string GroupPermissionDeniedDetail = "The authenticated actor cannot manage this group.";
    private const string InvalidGroupRequestTitle = "Invalid group request";
    private const string InvalidGroupRequestDetail = "The submitted group request is invalid.";
    private const string GroupWriteFailedTitle = "Group write failed";
    private const string GroupWriteFailedDetail = "Unable to complete group write.";

    public static WebApplication MapGroupFoundationEndpoints(this WebApplication app)
    {
        var groups = app.MapGroup("/api/v1/groups")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        groups.MapPost("", CreateGroupAsync);
        groups.MapGet("", ListGroupsAsync);
        groups.MapGet("/{groupId:guid}", GetGroupAsync);
        groups.MapPatch("/{groupId:guid}", UpdateGroupAsync);

        return app;
    }

    private static async Task<IResult> CreateGroupAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await ReadCreateRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Name is null)
        {
            return InvalidGroupRequest(readResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var occurredAtUtc = timeProvider.GetUtcNow();
        var group = new UserGroup
        {
            Id = Guid.NewGuid(),
            Name = readResult.Name,
            CreatedByUserProfileId = actor.UserProfileId,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc
        };
        var membership = new GroupMembership
        {
            GroupId = group.Id,
            UserProfileId = actor.UserProfileId,
            Role = GroupMembershipRoles.Owner,
            Status = GroupMembershipStatuses.Active,
            CreatedAtUtc = occurredAtUtc,
            UpdatedAtUtc = occurredAtUtc
        };

        dbContext.Set<UserGroup>().Add(group);
        dbContext.Set<GroupMembership>().Add(membership);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return GroupWriteFailed();
        }

        return Results.Created(
            $"/api/v1/groups/{group.Id:D}",
            MapResponse(group, membership));
    }

    private static async Task<IResult> ListGroupsAsync(
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var groups = await dbContext.Set<GroupMembership>()
            .AsNoTracking()
            .Where(membership => membership.UserProfileId == actor.UserProfileId
                && membership.Status == GroupMembershipStatuses.Active
                && membership.Group.DeletedAtUtc == null)
            .OrderBy(membership => membership.Group.CreatedAtUtc)
            .ThenBy(membership => membership.GroupId)
            .Select(membership => new GroupResponse(
                membership.Group.Id,
                membership.Group.Name,
                membership.Role,
                membership.Status,
                membership.Group.CreatedAtUtc,
                membership.Group.UpdatedAtUtc))
            .ToListAsync(cancellationToken);

        return Results.Ok(new GroupListResponse(groups));
    }

    private static async Task<IResult> GetGroupAsync(
        Guid groupId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
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

        var membership = await LoadActiveMembershipWithGroupAsync(
            dbContext,
            groupId,
            actor.UserProfileId,
            trackChanges: false,
            cancellationToken);

        return membership is null
            ? GroupUnavailable()
            : Results.Ok(MapResponse(membership.Group, membership));
    }

    private static async Task<IResult> UpdateGroupAsync(
        Guid groupId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var patchResult = await ReadUpdateRequestAsync(request, cancellationToken);
        if (!patchResult.Succeeded || patchResult.Name is null)
        {
            return InvalidGroupRequest(patchResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanManageGroupSettingsAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var membership = await LoadActiveMembershipWithGroupAsync(
            dbContext,
            groupId,
            actor.UserProfileId,
            trackChanges: true,
            cancellationToken);
        if (membership is null)
        {
            return GroupUnavailable();
        }

        membership.Group.Name = patchResult.Name;
        membership.Group.UpdatedAtUtc = timeProvider.GetUtcNow();

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return GroupWriteFailed();
        }

        return Results.Ok(MapResponse(membership.Group, membership));
    }

    private static async Task<GroupMembership?> LoadActiveMembershipWithGroupAsync(
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
                && membership.Group.DeletedAtUtc == null);

        if (!trackChanges)
        {
            memberships = memberships.AsNoTracking();
        }

        return await memberships
            .Include(membership => membership.Group)
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static async Task<GroupRequestReadResult> ReadCreateRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        return await ReadGroupNameRequestAsync(
            request,
            missingNameMessage: "Group name is required.",
            noRecognizedFieldMessage: "Group name is required.",
            cancellationToken);
    }

    private static async Task<GroupRequestReadResult> ReadUpdateRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        return await ReadGroupNameRequestAsync(
            request,
            missingNameMessage: "At least one supported group field is required.",
            noRecognizedFieldMessage: "At least one supported group field is required.",
            cancellationToken);
    }

    private static async Task<GroupRequestReadResult> ReadGroupNameRequestAsync(
        HttpRequest request,
        string missingNameMessage,
        string noRecognizedFieldMessage,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            errors["body"] = ["A JSON object body is required."];
            return GroupRequestReadResult.Invalid(errors);
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
            return GroupRequestReadResult.Invalid(errors);
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                errors["body"] = ["A JSON object body is required."];
                return GroupRequestReadResult.Invalid(errors);
            }

            string? name = null;
            var recognizedFieldCount = 0;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "name":
                        recognizedFieldCount++;
                        name = ReadGroupName(property.Value, errors);
                        break;
                    default:
                        errors[property.Name] = ["This field is not supported."];
                        break;
                }
            }

            if (recognizedFieldCount == 0)
            {
                errors["body"] = [noRecognizedFieldMessage];
            }
            else if (name is null && !errors.ContainsKey("name"))
            {
                errors["name"] = [missingNameMessage];
            }

            return errors.Count == 0
                ? GroupRequestReadResult.Valid(name!)
                : GroupRequestReadResult.Invalid(errors);
        }
    }

    private static string? ReadGroupName(
        JsonElement value,
        Dictionary<string, string[]> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            errors["name"] = ["Group name must be a string."];
            return null;
        }

        var name = value.GetString()!.Trim();
        if (name.Length == 0)
        {
            errors["name"] = ["Group name is required when supplied."];
            return null;
        }

        if (name.Length > UserGroupConstraints.NameMaxLength)
        {
            errors["name"] =
            [
                $"Group name must be {UserGroupConstraints.NameMaxLength} characters or fewer."
            ];
            return null;
        }

        return name;
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason switch
        {
            BusinessAuthorizationFailureReason.DeniedUnauthenticated => Unauthenticated(),
            BusinessAuthorizationFailureReason.DeniedInsufficientRole => GroupPermissionDenied(),
            _ => GroupUnavailable()
        };
    }

    private static GroupResponse MapResponse(
        UserGroup group,
        GroupMembership membership)
    {
        return new GroupResponse(
            group.Id,
            group.Name,
            membership.Role,
            membership.Status,
            group.CreatedAtUtc,
            group.UpdatedAtUtc);
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult GroupUnavailable()
    {
        return Results.Problem(
            title: GroupUnavailableTitle,
            detail: GroupUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult GroupPermissionDenied()
    {
        return Results.Problem(
            title: GroupPermissionDeniedTitle,
            detail: GroupPermissionDeniedDetail,
            statusCode: StatusCodes.Status403Forbidden);
    }

    private static IResult InvalidGroupRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidGroupRequestTitle,
            detail: InvalidGroupRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult GroupWriteFailed()
    {
        return Results.Problem(
            title: GroupWriteFailedTitle,
            detail: GroupWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private sealed class GroupRequestReadResult
    {
        private GroupRequestReadResult(
            string? name,
            IDictionary<string, string[]> errors)
        {
            Name = name;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public string? Name { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static GroupRequestReadResult Valid(string name)
        {
            return new GroupRequestReadResult(
                name,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static GroupRequestReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new GroupRequestReadResult(null, errors);
        }
    }
}
