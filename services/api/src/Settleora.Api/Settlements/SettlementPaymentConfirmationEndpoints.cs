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
    private const string PersonalGroupMode = "personal";
    private const string GroupMode = "group";
    private const decimal PaymentAmountMaxValue = 999_999_999_999_999.9999m;

    private static readonly string[] ActivePaymentStatuses =
    [
        SettlementPaymentStatuses.MarkedPaid,
        SettlementPaymentStatuses.Confirmed
    ];

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

        if (request.ContentLength.GetValueOrDefault() > 0)
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

        var activePayments = settlementRequest.Payments
            .Where(candidate => ActivePaymentStatuses.Contains(candidate.Status, StringComparer.Ordinal))
            .ToArray();
        if (!HasValidCoverageData(settlementRequest, activePayments))
        {
            return SettlementPaymentConflict();
        }

        var activePaymentCoverage = activePayments.Sum(candidate => candidate.Amount);
        var confirmedPaymentCoverage = activePayments
            .Where(candidate => candidate.Status == SettlementPaymentStatuses.Confirmed
                || candidate.Id == payment.Id)
            .Sum(candidate => candidate.Amount);
        if (activePaymentCoverage > settlementRequest.Amount
            || confirmedPaymentCoverage > settlementRequest.Amount)
        {
            return SettlementPaymentConflict();
        }

        var previousRequestStatus = settlementRequest.Status;
        var newRequestStatus = RecomputeSettlementRequestStatus(
            settlementRequest.Amount,
            activePaymentCoverage,
            confirmedPaymentCoverage);
        var now = timeProvider.GetUtcNow();

        payment.Status = SettlementPaymentStatuses.Confirmed;
        payment.ConfirmedAtUtc = now;
        payment.UpdatedAtUtc = now;
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

    private static bool IsValidAmount(decimal amount)
    {
        return amount is > 0m and <= PaymentAmountMaxValue;
    }

    private static bool CanConfirmRequestStatus(string status)
    {
        return status is SettlementRequestStatuses.PartiallyPaid
            or SettlementRequestStatuses.MarkedPaid;
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
