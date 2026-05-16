using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal static class SettlementDisputeEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string SettlementUnavailableTitle = "Settlement unavailable";
    private const string SettlementUnavailableDetail = "The requested settlement is unavailable.";
    private const string SettlementPaymentUnavailableTitle = "Settlement payment unavailable";
    private const string SettlementPaymentUnavailableDetail = "The requested settlement payment is unavailable.";
    private const string InvalidSettlementDisputeTitle = "Invalid settlement dispute";
    private const string InvalidSettlementDisputeDetail = "Settlement dispute does not accept a request body.";
    private const string InvalidSettlementPaymentDisputeTitle = "Invalid settlement payment dispute";
    private const string InvalidSettlementPaymentDisputeDetail = "Settlement payment dispute does not accept a request body.";
    private const string SettlementDisputeConflictTitle = "Settlement dispute conflict";
    private const string SettlementDisputeConflictDetail = "The settlement cannot be disputed for the current settlement state.";
    private const string SettlementPaymentDisputeConflictTitle = "Settlement payment conflict";
    private const string SettlementPaymentDisputeConflictDetail = "The settlement payment cannot be disputed for the current settlement state.";
    private const string SettlementDisputeWriteFailedTitle = "Settlement dispute write failed";
    private const string SettlementDisputeWriteFailedDetail = "Unable to complete settlement dispute write.";
    private const string SettlementPaymentDisputeWriteFailedTitle = "Settlement payment write failed";
    private const string SettlementPaymentDisputeWriteFailedDetail = "Unable to complete settlement payment write.";
    private const string SettlementRequestDisputeWorkflowName = "settlement_request_dispute";
    private const string SettlementPaymentDisputeWorkflowName = "settlement_payment_dispute";
    private const string SettlementRequestDisputedAction = "settlement.request_disputed";
    private const string SettlementPaymentDisputedAction = "settlement.payment_disputed";
    private const string RequestDisputeCandidateBasis = "request_status_transition";

    public static WebApplication MapSettlementDisputeEndpoints(this WebApplication app)
    {
        var settlements = app.MapGroup("/api/v1/settlements")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        settlements.MapPost("/{settlementId:guid}/dispute", DisputeSettlementRequestAsync);

        var settlementPayments = app.MapGroup("/api/v1/settlement-payments")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        settlementPayments.MapPost("/{paymentId:guid}/dispute", DisputeSettlementPaymentAsync);

        return app;
    }

    private static async Task<IResult> DisputeSettlementRequestAsync(
        Guid settlementId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ISettlementRequestAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
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
            return InvalidSettlementDispute();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapSettlementAuthorizationFailure(authorizationResult);
        }

        var settlementRequest = await SettlementRequestDisputeQuery(dbContext, actor.UserProfileId)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == settlementId,
                cancellationToken);
        if (settlementRequest is null)
        {
            return SettlementUnavailable();
        }

        if (settlementRequest.GroupId.HasValue)
        {
            var groupAuthorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
                settlementRequest.GroupId.Value,
                cancellationToken);
            if (!groupAuthorizationResult.Allowed)
            {
                return MapSettlementAuthorizationFailure(groupAuthorizationResult);
            }
        }

        if (!CanDisputeSettlementRequest(settlementRequest, actor.UserProfileId))
        {
            return SettlementDisputeConflict();
        }

        var previousRequestStatus = settlementRequest.Status;
        var now = timeProvider.GetUtcNow();
        if (!SettlementPaymentAllocationRuntime.TryMarkSelectedLines(
                settlementRequest,
                SettlementRequestLineStatuses.Disputed,
                now))
        {
            return SettlementDisputeConflict();
        }

        settlementRequest.Status = SettlementRequestStatuses.Disputed;
        settlementRequest.DisputedAtUtc = now;
        settlementRequest.UpdatedAtUtc = now;
        SettlementResidualRuntime.ResolvePendingResiduals(
            settlementRequest.Residuals,
            SettlementResidualStatuses.Disputed,
            now);

        await auditWriter.WriteAsync(
            new SettlementRequestAuditEvent(
                SettlementRequestDisputedAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                settlementRequest.Id,
                settlementRequest.SourceExpenseBillId!.Value,
                settlementRequest.GroupId,
                settlementRequest.GroupId.HasValue
                    ? SettlementRuntimePolicy.GroupMode
                    : SettlementRuntimePolicy.PersonalGroupMode,
                settlementRequest.DebtorUserProfileId,
                settlementRequest.CreditorUserProfileId,
                settlementRequest.Status,
                settlementRequest.Amount,
                settlementRequest.Currency,
                RequestDisputeCandidateBasis,
                now)
            {
                WorkflowName = SettlementRequestDisputeWorkflowName,
                PreviousRequestStatus = previousRequestStatus,
                NewRequestStatus = settlementRequest.Status
            },
            cancellationToken);
        await InAppNotificationEvents.WriteSettlementRequestNotificationAsync(
            notificationWriter,
            settlementRequest,
            actor.UserProfileId,
            SettlementRequestDisputedAction,
            InAppNotificationPriorities.Urgent,
            now,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return SettlementDisputeWriteFailed();
        }

        return Results.Ok(SettlementRequestResponse.From(settlementRequest));
    }

    private static async Task<IResult> DisputeSettlementPaymentAsync(
        Guid paymentId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ISettlementPaymentAuditWriter auditWriter,
        IInAppNotificationWriter notificationWriter,
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
            return InvalidSettlementPaymentDispute();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapSettlementPaymentAuthorizationFailure(authorizationResult);
        }

        var payment = await SettlementPaymentDisputeQuery(dbContext, actor.UserProfileId)
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

        if (!CanDisputeSettlementPayment(payment, settlementRequest, actor.UserProfileId))
        {
            return SettlementPaymentDisputeConflict();
        }

        var previousPaymentStatus = payment.Status;
        var previousRequestStatus = settlementRequest.Status;
        var now = timeProvider.GetUtcNow();

        payment.Status = SettlementPaymentStatuses.Disputed;
        payment.DisputedAtUtc = now;
        payment.UpdatedAtUtc = now;
        SettlementResidualRuntime.ResolvePendingResiduals(
            payment.Residuals,
            SettlementResidualStatuses.Disputed,
            now);
        if (!SettlementPaymentAllocationRuntime.TryRecomputeActiveLineCoverage(
                settlementRequest,
                now,
                out var allocationResult)
            || !SettlementPaymentAllocationRuntime.TryMarkSelectedLines(
                settlementRequest,
                SettlementRequestLineStatuses.Disputed,
                now))
        {
            return SettlementPaymentDisputeConflict();
        }

        settlementRequest.Status = SettlementRequestStatuses.Disputed;
        settlementRequest.DisputedAtUtc = now;
        settlementRequest.UpdatedAtUtc = now;

        await auditWriter.WriteAsync(
            new SettlementPaymentAuditEvent(
                SettlementPaymentDisputeWorkflowName,
                SettlementPaymentDisputedAction,
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
                settlementRequest.Status,
                payment.Status,
                payment.Amount,
                allocationResult.ActivePaymentCoverage,
                settlementRequest.Amount,
                payment.Currency,
                payment.PaymentDate,
                now)
            {
                PreviousPaymentStatus = previousPaymentStatus,
                NewPaymentStatus = payment.Status
            },
            cancellationToken);
        await InAppNotificationEvents.WriteSettlementPaymentNotificationAsync(
            notificationWriter,
            settlementRequest,
            payment,
            actor.UserProfileId,
            SettlementPaymentDisputedAction,
            InAppNotificationPriorities.Urgent,
            now,
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return SettlementPaymentDisputeWriteFailed();
        }

        return Results.Ok(SettlementPaymentResponse.From(payment, settlementRequest.Status));
    }

    private static IQueryable<SettlementRequest> SettlementRequestDisputeQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId)
    {
        return dbContext.Set<SettlementRequest>()
            .Include(settlementRequest => settlementRequest.Lines)
            .Include(settlementRequest => settlementRequest.Residuals)
            .Where(settlementRequest => settlementRequest.ArchivedAtUtc == null
                && settlementRequest.SourceExpenseBillId != null
                && (settlementRequest.DebtorUserProfileId == actorUserProfileId
                    || settlementRequest.CreditorUserProfileId == actorUserProfileId)
                && settlementRequest.DebtorUserProfile.DeletedAtUtc == null
                && settlementRequest.CreditorUserProfile.DeletedAtUtc == null
                && settlementRequest.RequestedByUserProfile.DeletedAtUtc == null
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

    private static IQueryable<SettlementPayment> SettlementPaymentDisputeQuery(
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

    private static bool CanDisputeSettlementRequest(
        SettlementRequest settlementRequest,
        Guid actorUserProfileId)
    {
        return CanDisputeRequestStatus(settlementRequest.Status)
            && SettlementRuntimePolicy.IsValidSettlementAmount(settlementRequest.Amount)
            && !string.IsNullOrWhiteSpace(settlementRequest.Currency)
            && (settlementRequest.DebtorUserProfileId == actorUserProfileId
                || settlementRequest.CreditorUserProfileId == actorUserProfileId)
            && SettlementRequestStatuses.IsSupported(settlementRequest.Status);
    }

    private static bool CanDisputeSettlementPayment(
        SettlementPayment payment,
        SettlementRequest settlementRequest,
        Guid actorUserProfileId)
    {
        return payment.Status == SettlementPaymentStatuses.MarkedPaid
            && CanDisputeRequestStatus(settlementRequest.Status)
            && payment.ReceivedByUserProfileId == actorUserProfileId
            && settlementRequest.CreditorUserProfileId == actorUserProfileId
            && payment.PaidByUserProfileId == settlementRequest.DebtorUserProfileId
            && payment.ReceivedByUserProfileId == settlementRequest.CreditorUserProfileId
            && payment.CreatedByUserProfileId == settlementRequest.DebtorUserProfileId
            && string.Equals(payment.Currency, settlementRequest.Currency, StringComparison.Ordinal)
            && SettlementRuntimePolicy.IsValidSettlementAmount(payment.Amount)
            && SettlementRuntimePolicy.IsValidSettlementAmount(settlementRequest.Amount)
            && SettlementRequestStatuses.IsSupported(settlementRequest.Status)
            && SettlementPaymentStatuses.IsSupported(payment.Status);
    }

    private static bool CanDisputeRequestStatus(string status)
    {
        return status is SettlementRequestStatuses.Requested
            or SettlementRequestStatuses.PartiallyPaid
            or SettlementRequestStatuses.MarkedPaid;
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

    private static IResult InvalidSettlementDispute()
    {
        return Results.Problem(
            title: InvalidSettlementDisputeTitle,
            detail: InvalidSettlementDisputeDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvalidSettlementPaymentDispute()
    {
        return Results.Problem(
            title: InvalidSettlementPaymentDisputeTitle,
            detail: InvalidSettlementPaymentDisputeDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult SettlementDisputeConflict()
    {
        return Results.Problem(
            title: SettlementDisputeConflictTitle,
            detail: SettlementDisputeConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult SettlementPaymentDisputeConflict()
    {
        return Results.Problem(
            title: SettlementPaymentDisputeConflictTitle,
            detail: SettlementPaymentDisputeConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult SettlementDisputeWriteFailed()
    {
        return Results.Problem(
            title: SettlementDisputeWriteFailedTitle,
            detail: SettlementDisputeWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static IResult SettlementPaymentDisputeWriteFailed()
    {
        return Results.Problem(
            title: SettlementPaymentDisputeWriteFailedTitle,
            detail: SettlementPaymentDisputeWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }
}
