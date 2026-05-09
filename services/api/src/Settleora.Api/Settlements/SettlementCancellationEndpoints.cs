using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal static class SettlementCancellationEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string SettlementUnavailableTitle = "Settlement unavailable";
    private const string SettlementUnavailableDetail = "The requested settlement is unavailable.";
    private const string SettlementPaymentUnavailableTitle = "Settlement payment unavailable";
    private const string SettlementPaymentUnavailableDetail = "The requested settlement payment is unavailable.";
    private const string InvalidSettlementCancellationTitle = "Invalid settlement cancellation";
    private const string InvalidSettlementCancellationDetail = "Settlement cancellation does not accept a request body.";
    private const string InvalidSettlementPaymentCancellationTitle = "Invalid settlement payment cancellation";
    private const string InvalidSettlementPaymentCancellationDetail = "Settlement payment cancellation does not accept a request body.";
    private const string SettlementCancellationConflictTitle = "Settlement cancellation conflict";
    private const string SettlementCancellationConflictDetail = "The settlement cannot be cancelled for the current settlement state.";
    private const string SettlementPaymentCancellationConflictTitle = "Settlement payment conflict";
    private const string SettlementPaymentCancellationConflictDetail = "The settlement payment cannot be cancelled for the current settlement state.";
    private const string SettlementCancellationWriteFailedTitle = "Settlement cancellation write failed";
    private const string SettlementCancellationWriteFailedDetail = "Unable to complete settlement cancellation write.";
    private const string SettlementPaymentCancellationWriteFailedTitle = "Settlement payment write failed";
    private const string SettlementPaymentCancellationWriteFailedDetail = "Unable to complete settlement payment write.";
    private const string SettlementRequestCancellationWorkflowName = "settlement_request_cancellation";
    private const string SettlementPaymentCancellationWorkflowName = "settlement_payment_cancellation";
    private const string SettlementRequestCancelledAction = "settlement.request_cancelled";
    private const string SettlementPaymentCancelledAction = "settlement.payment_cancelled";
    private const string PersonalGroupMode = "personal";
    private const string GroupMode = "group";
    private const string RequestCancellationCandidateBasis = "request_status_transition";
    private const decimal SettlementAmountMaxValue = 999_999_999_999_999.9999m;

    private static readonly string[] ActivePaymentStatuses =
    [
        SettlementPaymentStatuses.MarkedPaid,
        SettlementPaymentStatuses.Confirmed
    ];

    public static WebApplication MapSettlementCancellationEndpoints(this WebApplication app)
    {
        var settlements = app.MapGroup("/api/v1/settlements")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        settlements.MapPost("/{settlementId:guid}/cancel", CancelSettlementRequestAsync);

        var settlementPayments = app.MapGroup("/api/v1/settlement-payments")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        settlementPayments.MapPost("/{paymentId:guid}/cancel", CancelSettlementPaymentAsync);

        return app;
    }

    private static async Task<IResult> CancelSettlementRequestAsync(
        Guid settlementId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ISettlementRequestAuditWriter auditWriter,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        if (request.ContentLength.GetValueOrDefault() > 0)
        {
            return InvalidSettlementCancellation();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapSettlementAuthorizationFailure(authorizationResult);
        }

        var settlementRequest = await SettlementRequestCancellationQuery(dbContext, actor.UserProfileId)
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

        if (!CanCancelSettlementRequest(settlementRequest))
        {
            return SettlementCancellationConflict();
        }

        var previousRequestStatus = settlementRequest.Status;
        var now = timeProvider.GetUtcNow();
        settlementRequest.Status = SettlementRequestStatuses.Cancelled;
        settlementRequest.CancelledAtUtc = now;
        settlementRequest.UpdatedAtUtc = now;

        await auditWriter.WriteAsync(
            new SettlementRequestAuditEvent(
                SettlementRequestCancelledAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                settlementRequest.Id,
                settlementRequest.SourceExpenseBillId!.Value,
                settlementRequest.GroupId,
                settlementRequest.GroupId.HasValue ? GroupMode : PersonalGroupMode,
                settlementRequest.DebtorUserProfileId,
                settlementRequest.CreditorUserProfileId,
                settlementRequest.Status,
                settlementRequest.Amount,
                settlementRequest.Currency,
                RequestCancellationCandidateBasis,
                now)
            {
                WorkflowName = SettlementRequestCancellationWorkflowName,
                PreviousRequestStatus = previousRequestStatus,
                NewRequestStatus = settlementRequest.Status
            },
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return SettlementCancellationWriteFailed();
        }

        return Results.Ok(SettlementRequestResponse.From(settlementRequest));
    }

    private static async Task<IResult> CancelSettlementPaymentAsync(
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

        if (request.ContentLength.GetValueOrDefault() > 0)
        {
            return InvalidSettlementPaymentCancellation();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapSettlementPaymentAuthorizationFailure(authorizationResult);
        }

        var payment = await SettlementPaymentCancellationQuery(dbContext, actor.UserProfileId)
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

        if (!CanCancelSettlementPayment(payment, settlementRequest, actor.UserProfileId))
        {
            return SettlementPaymentCancellationConflict();
        }

        var remainingActivePayments = settlementRequest.Payments
            .Where(candidate => candidate.Id != payment.Id
                && ActivePaymentStatuses.Contains(candidate.Status, StringComparer.Ordinal))
            .ToArray();
        if (!HasValidCoverageData(settlementRequest, remainingActivePayments))
        {
            return SettlementPaymentCancellationConflict();
        }

        var activePaymentCoverage = remainingActivePayments.Sum(candidate => candidate.Amount);
        var confirmedPaymentCoverage = remainingActivePayments
            .Where(candidate => candidate.Status == SettlementPaymentStatuses.Confirmed)
            .Sum(candidate => candidate.Amount);
        if (activePaymentCoverage > settlementRequest.Amount
            || confirmedPaymentCoverage > settlementRequest.Amount)
        {
            return SettlementPaymentCancellationConflict();
        }

        var previousPaymentStatus = payment.Status;
        var previousRequestStatus = settlementRequest.Status;
        var newRequestStatus = RecomputeSettlementRequestStatus(
            settlementRequest.Amount,
            activePaymentCoverage,
            confirmedPaymentCoverage);
        var now = timeProvider.GetUtcNow();

        payment.Status = SettlementPaymentStatuses.Cancelled;
        payment.CancelledAtUtc = now;
        payment.UpdatedAtUtc = now;
        settlementRequest.Status = newRequestStatus;
        settlementRequest.UpdatedAtUtc = now;
        if (newRequestStatus == SettlementRequestStatuses.Confirmed
            && settlementRequest.ConfirmedAtUtc is null)
        {
            settlementRequest.ConfirmedAtUtc = now;
        }

        await auditWriter.WriteAsync(
            new SettlementPaymentAuditEvent(
                SettlementPaymentCancellationWorkflowName,
                SettlementPaymentCancelledAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                settlementRequest.Id,
                payment.Id,
                settlementRequest.SourceExpenseBillId!.Value,
                settlementRequest.GroupId,
                settlementRequest.GroupId.HasValue ? GroupMode : PersonalGroupMode,
                settlementRequest.DebtorUserProfileId,
                settlementRequest.CreditorUserProfileId,
                previousRequestStatus,
                newRequestStatus,
                payment.Status,
                payment.Amount,
                activePaymentCoverage,
                settlementRequest.Amount,
                payment.Currency,
                payment.PaymentDate,
                now)
            {
                PreviousPaymentStatus = previousPaymentStatus,
                NewPaymentStatus = payment.Status
            },
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return SettlementPaymentCancellationWriteFailed();
        }

        return Results.Ok(SettlementPaymentResponse.From(payment, settlementRequest.Status));
    }

    private static IQueryable<SettlementRequest> SettlementRequestCancellationQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId)
    {
        return dbContext.Set<SettlementRequest>()
            .Include(settlementRequest => settlementRequest.Payments)
            .Where(settlementRequest => settlementRequest.ArchivedAtUtc == null
                && settlementRequest.SourceExpenseBillId != null
                && settlementRequest.SourceExpenseBill != null
                && settlementRequest.RequestedByUserProfileId == actorUserProfileId
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

    private static IQueryable<SettlementPayment> SettlementPaymentCancellationQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId)
    {
        return dbContext.Set<SettlementPayment>()
            .Include(payment => payment.SettlementRequest)
                .ThenInclude(settlementRequest => settlementRequest.Payments)
            .Where(payment => payment.SettlementRequest.ArchivedAtUtc == null
                && payment.SettlementRequest.SourceExpenseBillId != null
                && payment.SettlementRequest.SourceExpenseBill != null
                && payment.SettlementRequest.DebtorUserProfileId == actorUserProfileId
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

    private static bool CanCancelSettlementRequest(SettlementRequest settlementRequest)
    {
        return settlementRequest.Status == SettlementRequestStatuses.Requested
            && settlementRequest.Payments.Count == 0
            && IsValidAmount(settlementRequest.Amount)
            && !string.IsNullOrWhiteSpace(settlementRequest.Currency)
            && SettlementRequestStatuses.IsSupported(settlementRequest.Status);
    }

    private static bool CanCancelSettlementPayment(
        SettlementPayment payment,
        SettlementRequest settlementRequest,
        Guid actorUserProfileId)
    {
        return payment.Status == SettlementPaymentStatuses.MarkedPaid
            && CanCancelPaymentRequestStatus(settlementRequest.Status)
            && payment.PaidByUserProfileId == actorUserProfileId
            && payment.CreatedByUserProfileId == actorUserProfileId
            && payment.ReceivedByUserProfileId == settlementRequest.CreditorUserProfileId
            && payment.PaidByUserProfileId == settlementRequest.DebtorUserProfileId
            && string.Equals(payment.Currency, settlementRequest.Currency, StringComparison.Ordinal)
            && IsValidAmount(payment.Amount)
            && IsValidAmount(settlementRequest.Amount)
            && SettlementRequestStatuses.IsSupported(settlementRequest.Status)
            && SettlementPaymentStatuses.IsSupported(payment.Status);
    }

    private static bool HasValidCoverageData(
        SettlementRequest settlementRequest,
        IReadOnlyCollection<SettlementPayment> activePayments)
    {
        return activePayments.All(payment =>
            IsValidAmount(payment.Amount)
            && SettlementPaymentStatuses.IsSupported(payment.Status)
            && payment.PaidByUserProfileId == settlementRequest.DebtorUserProfileId
            && payment.ReceivedByUserProfileId == settlementRequest.CreditorUserProfileId
            && string.Equals(payment.Currency, settlementRequest.Currency, StringComparison.Ordinal));
    }

    private static bool CanCancelPaymentRequestStatus(string status)
    {
        return status is SettlementRequestStatuses.PartiallyPaid
            or SettlementRequestStatuses.MarkedPaid;
    }

    private static bool IsValidAmount(decimal amount)
    {
        return amount is > 0m and <= SettlementAmountMaxValue;
    }

    private static string RecomputeSettlementRequestStatus(
        decimal requestAmount,
        decimal activePaymentCoverage,
        decimal confirmedPaymentCoverage)
    {
        if (confirmedPaymentCoverage == requestAmount)
        {
            return SettlementRequestStatuses.Confirmed;
        }

        if (activePaymentCoverage == requestAmount)
        {
            return SettlementRequestStatuses.MarkedPaid;
        }

        return activePaymentCoverage > 0m
            ? SettlementRequestStatuses.PartiallyPaid
            : SettlementRequestStatuses.Requested;
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

    private static IResult InvalidSettlementCancellation()
    {
        return Results.Problem(
            title: InvalidSettlementCancellationTitle,
            detail: InvalidSettlementCancellationDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvalidSettlementPaymentCancellation()
    {
        return Results.Problem(
            title: InvalidSettlementPaymentCancellationTitle,
            detail: InvalidSettlementPaymentCancellationDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult SettlementCancellationConflict()
    {
        return Results.Problem(
            title: SettlementCancellationConflictTitle,
            detail: SettlementCancellationConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult SettlementPaymentCancellationConflict()
    {
        return Results.Problem(
            title: SettlementPaymentCancellationConflictTitle,
            detail: SettlementPaymentCancellationConflictDetail,
            statusCode: StatusCodes.Status409Conflict);
    }

    private static IResult SettlementCancellationWriteFailed()
    {
        return Results.Problem(
            title: SettlementCancellationWriteFailedTitle,
            detail: SettlementCancellationWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static IResult SettlementPaymentCancellationWriteFailed()
    {
        return Results.Problem(
            title: SettlementPaymentCancellationWriteFailedTitle,
            detail: SettlementPaymentCancellationWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }
}
