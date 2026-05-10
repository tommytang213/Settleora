using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal static class SettlementPaymentConfirmationEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string SettlementPaymentUnavailableTitle = "Settlement payment unavailable";
    private const string SettlementPaymentUnavailableDetail = "The requested settlement payment is unavailable.";
    private const string InvalidSettlementPaymentConfirmationTitle = "Invalid settlement payment confirmation";
    private const string InvalidSettlementPaymentConfirmationDetail = "Settlement payment confirmation does not accept a request body.";
    private const string SettlementPaymentConflictTitle = "Settlement payment conflict";
    private const string SettlementPaymentConflictDetail = "The settlement payment cannot be confirmed for the current settlement state.";
    private const string SettlementPaymentWriteFailedTitle = "Settlement payment write failed";
    private const string SettlementPaymentWriteFailedDetail = "Unable to complete settlement payment write.";
    private const string SettlementPaymentConfirmationWorkflowName = "settlement_payment_confirmation";
    private const string SettlementPaymentConfirmedAction = "settlement.payment_confirmed";

    public static WebApplication MapSettlementPaymentConfirmationEndpoints(this WebApplication app)
    {
        var settlementPayments = app.MapGroup("/api/v1/settlement-payments")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        settlementPayments.MapPost("/{paymentId:guid}/confirm", ConfirmSettlementPaymentAsync);

        return app;
    }

    private static async Task<IResult> ConfirmSettlementPaymentAsync(
        Guid paymentId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ISettlementPaymentAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (SettlementRuntimePolicy.RequestHasBody(request))
        {
            return InvalidSettlementPaymentConfirmation();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var payment = await SettlementPaymentConfirmationQuery(dbContext, actor.UserProfileId)
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
                return MapAuthorizationFailure(groupAuthorizationResult);
            }
        }

        if (!CanConfirmPayment(payment, settlementRequest))
        {
            return SettlementPaymentConflict();
        }

        var previousRequestStatus = settlementRequest.Status;
        var now = timeProvider.GetUtcNow();

        payment.Status = SettlementPaymentStatuses.Confirmed;
        payment.ConfirmedAtUtc = now;
        payment.UpdatedAtUtc = now;
        if (!SettlementPaymentAllocationRuntime.TryRecomputeActiveLineCoverage(
                settlementRequest,
                now,
                out var allocationResult))
        {
            return SettlementPaymentConflict();
        }

        var newRequestStatus = SettlementRuntimePolicy.RecomputeSettlementRequestStatus(
            settlementRequest.Amount,
            allocationResult.ActivePaymentCoverage,
            allocationResult.ConfirmedPaymentCoverage);
        settlementRequest.Status = newRequestStatus;
        settlementRequest.UpdatedAtUtc = now;
        if (newRequestStatus == SettlementRequestStatuses.Confirmed)
        {
            settlementRequest.ConfirmedAtUtc = now;
        }

        await auditWriter.WriteAsync(
            new SettlementPaymentAuditEvent(
                SettlementPaymentConfirmationWorkflowName,
                SettlementPaymentConfirmedAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                settlementRequest.Id,
                payment.Id,
                settlementRequest.SourceExpenseBillId!.Value,
                settlementRequest.GroupId,
                settlementRequest.GroupId.HasValue
                    ? SettlementRuntimePolicy.GroupMode
                    : SettlementRuntimePolicy.PersonalGroupMode,
                settlementRequest.DebtorUserProfileId,
                settlementRequest.CreditorUserProfileId,
                previousRequestStatus,
                newRequestStatus,
                payment.Status,
                payment.Amount,
                allocationResult.ActivePaymentCoverage,
                settlementRequest.Amount,
                payment.Currency,
                payment.PaymentDate,
                now),
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return SettlementPaymentWriteFailed();
        }

        return Results.Ok(SettlementPaymentResponse.From(payment, settlementRequest.Status));
    }

    private static IQueryable<SettlementPayment> SettlementPaymentConfirmationQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId)
    {
        return dbContext.Set<SettlementPayment>()
            .Include(payment => payment.SettlementRequest)
                .ThenInclude(settlementRequest => settlementRequest.Payments)
                    .ThenInclude(candidate => candidate.Allocations)
            .Include(payment => payment.SettlementRequest)
                .ThenInclude(settlementRequest => settlementRequest.Payments)
                    .ThenInclude(candidate => candidate.Residuals)
            .Include(payment => payment.SettlementRequest)
                .ThenInclude(settlementRequest => settlementRequest.Lines)
            .Include(payment => payment.Allocations)
            .Include(payment => payment.Residuals)
            .Where(payment => payment.SettlementRequest.ArchivedAtUtc == null
                && payment.SettlementRequest.SourceExpenseBillId != null
                && payment.SettlementRequest.CreditorUserProfileId == actorUserProfileId
                && payment.SettlementRequest.DebtorUserProfile.DeletedAtUtc == null
                && payment.SettlementRequest.CreditorUserProfile.DeletedAtUtc == null
                && payment.SettlementRequest.RequestedByUserProfile.DeletedAtUtc == null
                && payment.PaidByUserProfile.DeletedAtUtc == null
                && payment.ReceivedByUserProfile.DeletedAtUtc == null
                && payment.CreatedByUserProfile.DeletedAtUtc == null
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

    private static bool CanConfirmPayment(
        SettlementPayment payment,
        SettlementRequest settlementRequest)
    {
        return payment.Status == SettlementPaymentStatuses.MarkedPaid
            && CanConfirmRequestStatus(settlementRequest.Status)
            && payment.PaidByUserProfileId == settlementRequest.DebtorUserProfileId
            && payment.ReceivedByUserProfileId == settlementRequest.CreditorUserProfileId
            && payment.CreatedByUserProfileId == settlementRequest.DebtorUserProfileId
            && string.Equals(payment.Currency, settlementRequest.Currency, StringComparison.Ordinal)
            && SettlementRuntimePolicy.IsValidSettlementAmount(payment.Amount)
            && SettlementRuntimePolicy.IsValidSettlementAmount(settlementRequest.Amount)
            && SettlementRequestStatuses.IsSupported(settlementRequest.Status)
            && SettlementPaymentStatuses.IsSupported(payment.Status)
            && !SettlementResidualRuntime.HasPendingResidual(payment);
    }

    private static bool CanConfirmRequestStatus(string status)
    {
        return status is SettlementRequestStatuses.PartiallyPaid
            or SettlementRequestStatuses.MarkedPaid;
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
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

    private static IResult SettlementPaymentUnavailable()
    {
        return Results.Problem(
            title: SettlementPaymentUnavailableTitle,
            detail: SettlementPaymentUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidSettlementPaymentConfirmation()
    {
        return Results.Problem(
            title: InvalidSettlementPaymentConfirmationTitle,
            detail: InvalidSettlementPaymentConfirmationDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult SettlementPaymentConflict()
    {
        return Results.Problem(
            title: SettlementPaymentConflictTitle,
            detail: SettlementPaymentConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult SettlementPaymentWriteFailed()
    {
        return Results.Problem(
            title: SettlementPaymentWriteFailedTitle,
            detail: SettlementPaymentWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }
}
