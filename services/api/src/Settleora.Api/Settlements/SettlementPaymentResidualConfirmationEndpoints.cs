using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal static class SettlementPaymentResidualConfirmationEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string SettlementPaymentUnavailableTitle = "Settlement payment unavailable";
    private const string SettlementPaymentUnavailableDetail = "The requested settlement payment is unavailable.";
    private const string InvalidResidualConfirmationTitle = "Invalid settlement residual confirmation";
    private const string InvalidResidualConfirmationDetail = "Settlement residual confirmation does not accept a request body.";
    private const string ResidualConfirmationConflictTitle = "Settlement payment conflict";
    private const string ResidualConfirmationConflictDetail = "The settlement residual cannot be confirmed for the current settlement state.";
    private const string ResidualConfirmationWriteFailedTitle = "Settlement payment write failed";
    private const string ResidualConfirmationWriteFailedDetail = "Unable to complete settlement residual confirmation write.";
    private const string ResidualConfirmationWorkflowName = "settlement_residual_confirmation";
    private const string ResidualConfirmedAction = "settlement.residual_confirmed";
    private const string ResidualConfirmedActionCategory = "residual_confirmed";

    public static WebApplication MapSettlementPaymentResidualConfirmationEndpoints(this WebApplication app)
    {
        var settlementPayments = app.MapGroup("/api/v1/settlement-payments")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        settlementPayments.MapPost(
            "/{paymentId:guid}/residuals/{residualId:guid}/confirm",
            ConfirmSettlementPaymentResidualAsync);

        return app;
    }

    private static async Task<IResult> ConfirmSettlementPaymentResidualAsync(
        Guid paymentId,
        Guid residualId,
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
            return InvalidResidualConfirmation();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var payment = await SettlementPaymentResidualConfirmationQuery(dbContext, actor.UserProfileId)
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

        var residual = payment.Residuals.SingleOrDefault(candidate => candidate.Id == residualId);
        if (residual is null)
        {
            return SettlementPaymentUnavailable();
        }

        if (!CanConfirmResidual(
                payment,
                settlementRequest,
                residual,
                actor.UserProfileId,
                out var receiverConfirmedStatus))
        {
            return ResidualConfirmationConflict();
        }

        var previousResidualStatus = residual.Status;
        var previousRequestStatus = settlementRequest.Status;
        var now = timeProvider.GetUtcNow();
        residual.Status = receiverConfirmedStatus;
        residual.ResolvedAtUtc = now;

        if (!SettlementPaymentAllocationRuntime.TryRecomputeActiveLineCoverage(
                settlementRequest,
                now,
                out var allocationResult))
        {
            return ResidualConfirmationConflict();
        }

        var newRequestStatus = SettlementRuntimePolicy.RecomputeSettlementRequestStatus(
            settlementRequest.Amount,
            allocationResult.ActiveSettlementCoverage,
            allocationResult.ConfirmedSettlementCoverage);
        settlementRequest.Status = newRequestStatus;
        if (newRequestStatus != previousRequestStatus)
        {
            settlementRequest.UpdatedAtUtc = now;
        }

        await auditWriter.WriteAsync(
            new SettlementPaymentAuditEvent(
                ResidualConfirmationWorkflowName,
                ResidualConfirmedAction,
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
                now,
                ActionCategory: ResidualConfirmedActionCategory)
            {
                SettlementResidualId = residual.Id,
                ResidualDirection = residual.Direction,
                ResidualPolicy = residual.Policy,
                PreviousResidualStatus = previousResidualStatus,
                NewResidualStatus = residual.Status,
                ResidualAmount = residual.Amount
            },
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return ResidualConfirmationWriteFailed();
        }

        return Results.Ok(SettlementPaymentResponse.From(payment, settlementRequest.Status));
    }

    private static IQueryable<SettlementPayment> SettlementPaymentResidualConfirmationQuery(
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
                && payment.ReceivedByUserProfileId == actorUserProfileId
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

    private static bool CanConfirmResidual(
        SettlementPayment payment,
        SettlementRequest settlementRequest,
        SettlementResidual residual,
        Guid actorUserProfileId,
        out string receiverConfirmedStatus)
    {
        receiverConfirmedStatus = string.Empty;

        return payment.Status == SettlementPaymentStatuses.MarkedPaid
            && CanConfirmResidualRequestStatus(settlementRequest.Status)
            && actorUserProfileId == settlementRequest.CreditorUserProfileId
            && actorUserProfileId == payment.ReceivedByUserProfileId
            && actorUserProfileId != payment.PaidByUserProfileId
            && payment.PaidByUserProfileId == settlementRequest.DebtorUserProfileId
            && payment.ReceivedByUserProfileId == settlementRequest.CreditorUserProfileId
            && payment.CreatedByUserProfileId == settlementRequest.DebtorUserProfileId
            && residual.DebtorUserProfileId == settlementRequest.DebtorUserProfileId
            && residual.CreditorUserProfileId == settlementRequest.CreditorUserProfileId
            && residual.SettlementPaymentId == payment.Id
            && residual.SettlementRequestId == settlementRequest.Id
            && string.Equals(payment.Currency, settlementRequest.Currency, StringComparison.Ordinal)
            && SettlementRuntimePolicy.IsValidSettlementAmount(payment.Amount)
            && SettlementRuntimePolicy.IsValidSettlementAmount(settlementRequest.Amount)
            && SettlementRequestStatuses.IsSupported(settlementRequest.Status)
            && SettlementPaymentStatuses.IsSupported(payment.Status)
            && SettlementResidualRuntime.TryGetReceiverConfirmedStatusForPendingResidual(
                payment,
                residual,
                out receiverConfirmedStatus);
    }

    private static bool CanConfirmResidualRequestStatus(string status)
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

    private static IResult InvalidResidualConfirmation()
    {
        return Results.Problem(
            title: InvalidResidualConfirmationTitle,
            detail: InvalidResidualConfirmationDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult ResidualConfirmationConflict()
    {
        return Results.Problem(
            title: ResidualConfirmationConflictTitle,
            detail: ResidualConfirmationConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult ResidualConfirmationWriteFailed()
    {
        return Results.Problem(
            title: ResidualConfirmationWriteFailedTitle,
            detail: ResidualConfirmationWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }
}
