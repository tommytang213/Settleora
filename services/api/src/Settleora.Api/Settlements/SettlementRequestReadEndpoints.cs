using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal static class SettlementRequestReadEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string SettlementUnavailableTitle = "Settlement unavailable";
    private const string SettlementUnavailableDetail = "The requested settlement is unavailable.";

    public static WebApplication MapSettlementRequestReadEndpoints(this WebApplication app)
    {
        var settlements = app.MapGroup("/api/v1/settlements")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        settlements.MapGet("", ListSettlementRequestsAsync);
        settlements.MapGet("/{settlementId:guid}", GetSettlementRequestAsync);

        return app;
    }

    private static async Task<IResult> ListSettlementRequestsAsync(
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

        var settlementRequests = await VisibleSettlementRequestQuery(dbContext, actor.UserProfileId)
            .OrderByDescending(settlementRequest => settlementRequest.RequestedAtUtc)
            .ThenByDescending(settlementRequest => settlementRequest.CreatedAtUtc)
            .ThenBy(settlementRequest => settlementRequest.Id)
            .ToListAsync(cancellationToken);

        return Results.Ok(new SettlementRequestListResponse(
            settlementRequests.Select(SettlementRequestResponse.From).ToArray()));
    }

    private static async Task<IResult> GetSettlementRequestAsync(
        Guid settlementId,
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

        var settlementRequest = await VisibleSettlementRequestQuery(dbContext, actor.UserProfileId)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == settlementId,
                cancellationToken);
        if (settlementRequest is null)
        {
            return SettlementUnavailable();
        }

        return Results.Ok(SettlementRequestResponse.From(settlementRequest));
    }

    private static IQueryable<SettlementRequest> VisibleSettlementRequestQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId)
    {
        return dbContext.Set<SettlementRequest>()
            .AsNoTracking()
            .Include(settlementRequest => settlementRequest.Lines)
            .Where(settlementRequest => settlementRequest.ArchivedAtUtc == null
                && settlementRequest.SourceExpenseBillId != null
                && settlementRequest.DebtorUserProfile.DeletedAtUtc == null
                && settlementRequest.CreditorUserProfile.DeletedAtUtc == null
                && settlementRequest.RequestedByUserProfile.DeletedAtUtc == null
                && (settlementRequest.DebtorUserProfileId == actorUserProfileId
                    || settlementRequest.CreditorUserProfileId == actorUserProfileId
                    || settlementRequest.RequestedByUserProfileId == actorUserProfileId)
                && (settlementRequest.GroupId == null
                    || (settlementRequest.GroupId != null
                        && settlementRequest.Group != null
                        && settlementRequest.Group.DeletedAtUtc == null
                        && settlementRequest.DebtorUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == settlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && settlementRequest.CreditorUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == settlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && settlementRequest.RequestedByUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == settlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && dbContext.Set<GroupMembership>().Any(membership =>
                            membership.GroupId == settlementRequest.GroupId.Value
                            && membership.UserProfileId == actorUserProfileId
                            && membership.Status == GroupMembershipStatuses.Active))));
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : SettlementUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult SettlementUnavailable()
    {
        return Results.Problem(
            title: SettlementUnavailableTitle,
            detail: SettlementUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }
}
