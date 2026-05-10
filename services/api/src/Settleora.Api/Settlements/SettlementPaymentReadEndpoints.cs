using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal static class SettlementPaymentReadEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string SettlementUnavailableTitle = "Settlement unavailable";
    private const string SettlementUnavailableDetail = "The requested settlement is unavailable.";
    private const string SettlementPaymentUnavailableTitle = "Settlement payment unavailable";
    private const string SettlementPaymentUnavailableDetail = "The requested settlement payment is unavailable.";

    private static readonly string[] VisiblePaymentStatuses =
    [
        SettlementPaymentStatuses.MarkedPaid,
        SettlementPaymentStatuses.Confirmed,
        SettlementPaymentStatuses.Disputed,
        SettlementPaymentStatuses.Cancelled
    ];

    private static readonly string[] VisibleRequestStatuses =
    [
        SettlementRequestStatuses.Requested,
        SettlementRequestStatuses.PartiallyPaid,
        SettlementRequestStatuses.MarkedPaid,
        SettlementRequestStatuses.Confirmed,
        SettlementRequestStatuses.Disputed,
        SettlementRequestStatuses.Cancelled
    ];

    public static WebApplication MapSettlementPaymentReadEndpoints(this WebApplication app)
    {
        var settlements = app.MapGroup("/api/v1/settlements")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        settlements.MapGet("/{settlementId:guid}/payments", ListSettlementPaymentsAsync);

        var settlementPayments = app.MapGroup("/api/v1/settlement-payments")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        settlementPayments.MapGet("/{paymentId:guid}", GetSettlementPaymentAsync);

        return app;
    }

    private static async Task<IResult> ListSettlementPaymentsAsync(
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
            return MapSettlementAuthorizationFailure(authorizationResult);
        }

        var settlementContext = await VisibleSettlementRequestQuery(dbContext, actor.UserProfileId)
            .Where(settlementRequest => settlementRequest.Id == settlementId)
            .Select(settlementRequest => new SettlementReadContext(
                settlementRequest.Id,
                settlementRequest.GroupId))
            .SingleOrDefaultAsync(cancellationToken);
        if (settlementContext is null)
        {
            return SettlementUnavailable();
        }

        if (settlementContext.GroupId.HasValue)
        {
            var groupAuthorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
                settlementContext.GroupId.Value,
                cancellationToken);
            if (!groupAuthorizationResult.Allowed)
            {
                return MapSettlementAuthorizationFailure(groupAuthorizationResult);
            }
        }

        var payments = await VisibleSettlementPaymentQuery(dbContext, actor.UserProfileId)
            .Where(payment => payment.SettlementRequestId == settlementId)
            .OrderByDescending(payment => payment.ClaimedAtUtc)
            .ThenByDescending(payment => payment.CreatedAtUtc)
            .ThenBy(payment => payment.Id)
            .ToListAsync(cancellationToken);

        return Results.Ok(new SettlementPaymentListResponse(
            payments
                .Select(payment => SettlementPaymentResponse.From(
                    payment,
                    payment.SettlementRequest.Status))
                .ToArray()));
    }

    private static async Task<IResult> GetSettlementPaymentAsync(
        Guid paymentId,
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
            return MapSettlementPaymentAuthorizationFailure(authorizationResult);
        }

        var payment = await VisibleSettlementPaymentQuery(dbContext, actor.UserProfileId)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == paymentId,
                cancellationToken);
        if (payment is null)
        {
            return SettlementPaymentUnavailable();
        }

        var settlementRequest = payment.SettlementRequest;
        if (settlementRequest.GroupId.HasValue)
        {
            var groupAuthorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
                settlementRequest.GroupId.Value,
                cancellationToken);
            if (!groupAuthorizationResult.Allowed)
            {
                return MapSettlementPaymentAuthorizationFailure(groupAuthorizationResult);
            }
        }

        return Results.Ok(SettlementPaymentResponse.From(payment, settlementRequest.Status));
    }

    private static IQueryable<SettlementRequest> VisibleSettlementRequestQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId)
    {
        return dbContext.Set<SettlementRequest>()
            .AsNoTracking()
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

    private static IQueryable<SettlementPayment> VisibleSettlementPaymentQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId)
    {
        return dbContext.Set<SettlementPayment>()
            .AsNoTracking()
            .Include(payment => payment.SettlementRequest)
            .Include(payment => payment.Allocations)
            .Include(payment => payment.Residuals)
            .Where(payment => payment.SettlementRequest.ArchivedAtUtc == null
                && payment.SettlementRequest.SourceExpenseBillId != null
                && payment.SettlementRequest.DebtorUserProfile.DeletedAtUtc == null
                && payment.SettlementRequest.CreditorUserProfile.DeletedAtUtc == null
                && payment.SettlementRequest.RequestedByUserProfile.DeletedAtUtc == null
                && payment.PaidByUserProfile.DeletedAtUtc == null
                && payment.ReceivedByUserProfile.DeletedAtUtc == null
                && payment.CreatedByUserProfile.DeletedAtUtc == null
                && payment.PaidByUserProfileId == payment.SettlementRequest.DebtorUserProfileId
                && payment.ReceivedByUserProfileId == payment.SettlementRequest.CreditorUserProfileId
                && payment.CreatedByUserProfileId == payment.SettlementRequest.DebtorUserProfileId
                && payment.Amount > 0m
                && payment.Amount <= SettlementConstraints.MoneyAmountMaxValue
                && payment.SettlementRequest.Amount > 0m
                && payment.SettlementRequest.Amount <= SettlementConstraints.MoneyAmountMaxValue
                && payment.Currency == payment.SettlementRequest.Currency
                && VisiblePaymentStatuses.Contains(payment.Status)
                && VisibleRequestStatuses.Contains(payment.SettlementRequest.Status)
                && (payment.SettlementRequest.DebtorUserProfileId == actorUserProfileId
                    || payment.SettlementRequest.CreditorUserProfileId == actorUserProfileId
                    || payment.SettlementRequest.RequestedByUserProfileId == actorUserProfileId)
                && (payment.SettlementRequest.GroupId == null
                    || (payment.SettlementRequest.GroupId != null
                        && payment.SettlementRequest.Group != null
                        && payment.SettlementRequest.Group.DeletedAtUtc == null
                        && payment.SettlementRequest.DebtorUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == payment.SettlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && payment.SettlementRequest.CreditorUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == payment.SettlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && payment.SettlementRequest.RequestedByUserProfile.GroupMemberships.Any(membership =>
                            membership.GroupId == payment.SettlementRequest.GroupId.Value
                            && membership.Status == GroupMembershipStatuses.Active)
                        && dbContext.Set<GroupMembership>().Any(membership =>
                            membership.GroupId == payment.SettlementRequest.GroupId.Value
                            && membership.UserProfileId == actorUserProfileId
                            && membership.Status == GroupMembershipStatuses.Active))));
    }

    private static IResult MapSettlementAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : SettlementUnavailable();
    }

    private static IResult MapSettlementPaymentAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : SettlementPaymentUnavailable();
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

    private static IResult SettlementPaymentUnavailable()
    {
        return Results.Problem(
            title: SettlementPaymentUnavailableTitle,
            detail: SettlementPaymentUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private sealed record SettlementReadContext(Guid SettlementRequestId, Guid? GroupId);
}
