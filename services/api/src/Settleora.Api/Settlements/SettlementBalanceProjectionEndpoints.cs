using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal static class SettlementBalanceProjectionEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string SettlementBalancesUnavailableTitle = "Settlement balances unavailable";
    private const string SettlementBalancesUnavailableDetail = "Settlement balances are unavailable.";

    private static readonly string[] ActiveProjectionRequestStatuses =
    [
        SettlementRequestStatuses.Requested,
        SettlementRequestStatuses.PartiallyPaid,
        SettlementRequestStatuses.MarkedPaid,
        SettlementRequestStatuses.Confirmed
    ];

    public static WebApplication MapSettlementBalanceProjectionEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/settlement-balances", ListSettlementBalanceProjectionsAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        return app;
    }

    private static async Task<IResult> ListSettlementBalanceProjectionsAsync(
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

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var settlementRequests = await VisibleSettlementBalanceRequestQuery(dbContext, actor.UserProfileId)
            .OrderBy(settlementRequest => settlementRequest.GroupId)
            .ThenBy(settlementRequest => settlementRequest.DebtorUserProfileId)
            .ThenBy(settlementRequest => settlementRequest.CreditorUserProfileId)
            .ThenBy(settlementRequest => settlementRequest.Currency)
            .ThenBy(settlementRequest => settlementRequest.Id)
            .ToListAsync(cancellationToken);

        var aggregates = new Dictionary<SettlementBalanceProjectionKey, SettlementBalanceProjectionAggregate>();
        foreach (var settlementRequest in settlementRequests)
        {
            if (!TryProjectSettlementRequest(
                    settlementRequest,
                    actor.UserProfileId,
                    out var projection))
            {
                continue;
            }

            var key = new SettlementBalanceProjectionKey(
                projection.CounterpartyUserProfileId,
                projection.GroupId,
                projection.Direction,
                projection.Currency);
            aggregates[key] = aggregates.TryGetValue(key, out var aggregate)
                ? aggregate.Add(projection)
                : projection;
        }

        var balances = aggregates.Values
            .OrderBy(balance => balance.Direction, StringComparer.Ordinal)
            .ThenBy(balance => balance.CounterpartyUserProfileId)
            .ThenBy(balance => balance.GroupId)
            .ThenBy(balance => balance.Currency, StringComparer.Ordinal)
            .Select(SettlementBalanceProjectionResponse.From)
            .ToArray();

        return Results.Ok(new SettlementBalanceProjectionListResponse(
            timeProvider.GetUtcNow(),
            balances));
    }

    private static IQueryable<SettlementRequest> VisibleSettlementBalanceRequestQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId)
    {
        return dbContext.Set<SettlementRequest>()
            .AsNoTracking()
            .Include(settlementRequest => settlementRequest.Lines)
            .Include(settlementRequest => settlementRequest.Payments)
                .ThenInclude(payment => payment.Allocations)
            .Where(settlementRequest => settlementRequest.ArchivedAtUtc == null
                && settlementRequest.SourceExpenseBillId != null
                && ActiveProjectionRequestStatuses.Contains(settlementRequest.Status)
                && settlementRequest.DebtorUserProfile.DeletedAtUtc == null
                && settlementRequest.CreditorUserProfile.DeletedAtUtc == null
                && settlementRequest.RequestedByUserProfile.DeletedAtUtc == null
                && (settlementRequest.DebtorUserProfileId == actorUserProfileId
                    || settlementRequest.CreditorUserProfileId == actorUserProfileId)
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

    private static bool TryProjectSettlementRequest(
        SettlementRequest settlementRequest,
        Guid actorUserProfileId,
        out SettlementBalanceProjectionAggregate projection)
    {
        projection = default!;

        if (!SettlementRuntimePolicy.IsValidSettlementAmount(settlementRequest.Amount)
            || string.IsNullOrWhiteSpace(settlementRequest.Currency)
            || !ActiveProjectionRequestStatuses.Contains(settlementRequest.Status))
        {
            return false;
        }

        var direction = settlementRequest.DebtorUserProfileId == actorUserProfileId
            ? SettlementBalanceDirections.Outgoing
            : SettlementBalanceDirections.Incoming;
        var counterpartyUserProfileId = direction is SettlementBalanceDirections.Outgoing
            ? settlementRequest.CreditorUserProfileId
            : settlementRequest.DebtorUserProfileId;

        var lines = settlementRequest.Lines
            .OrderBy(line => line.AllocationOrder)
            .ThenBy(line => line.CreatedAtUtc)
            .ThenBy(line => line.Id)
            .ToArray();
        if (lines.Length == 0)
        {
            return false;
        }

        var selectedLineAmount = 0m;
        var lineAmounts = new Dictionary<Guid, decimal>();
        var lineCoverage = new Dictionary<Guid, decimal>();
        foreach (var line in lines)
        {
            if (!CanProjectLine(line)
                || !string.Equals(line.Currency, settlementRequest.Currency, StringComparison.Ordinal)
                || lineAmounts.ContainsKey(line.Id))
            {
                return false;
            }

            selectedLineAmount += line.ExactAmount;
            lineAmounts[line.Id] = line.ExactAmount;
            lineCoverage[line.Id] = 0m;
        }

        if (selectedLineAmount != settlementRequest.Amount)
        {
            return false;
        }

        var pendingClaimedAmount = 0m;
        var confirmedClearedAmount = 0m;
        var pendingPaymentCount = 0;
        var confirmedPaymentCount = 0;
        foreach (var payment in settlementRequest.Payments.Where(payment =>
            SettlementRuntimePolicy.IsActivePaymentStatus(payment.Status)))
        {
            if (!CanProjectActivePayment(settlementRequest, payment))
            {
                return false;
            }

            var paymentAllocations = payment.Allocations
                .OrderBy(allocation => allocation.AllocationOrder)
                .ThenBy(allocation => allocation.CreatedAtUtc)
                .ThenBy(allocation => allocation.Id)
                .ToArray();
            if (paymentAllocations.Length == 0)
            {
                return false;
            }

            var paymentAllocationTotal = 0m;
            foreach (var allocation in paymentAllocations)
            {
                if (!lineAmounts.ContainsKey(allocation.SettlementRequestLineId)
                    || allocation.SettlementPaymentId != payment.Id
                    || !SettlementRuntimePolicy.IsValidSettlementAmount(allocation.ClearedAmount)
                    || !string.Equals(allocation.Currency, settlementRequest.Currency, StringComparison.Ordinal)
                    || allocation.AllocationOrder < 0)
                {
                    return false;
                }

                paymentAllocationTotal += allocation.ClearedAmount;
                lineCoverage[allocation.SettlementRequestLineId] += allocation.ClearedAmount;
                if (payment.Status == SettlementPaymentStatuses.Confirmed)
                {
                    confirmedClearedAmount += allocation.ClearedAmount;
                }
                else
                {
                    pendingClaimedAmount += allocation.ClearedAmount;
                }
            }

            if (paymentAllocationTotal != payment.Amount)
            {
                return false;
            }

            if (payment.Status == SettlementPaymentStatuses.Confirmed)
            {
                confirmedPaymentCount++;
            }
            else
            {
                pendingPaymentCount++;
            }
        }

        var activeCoverage = pendingClaimedAmount + confirmedClearedAmount;
        if (activeCoverage > selectedLineAmount)
        {
            return false;
        }

        foreach (var lineCoveragePair in lineCoverage)
        {
            if (lineCoveragePair.Value > lineAmounts[lineCoveragePair.Key])
            {
                return false;
            }
        }

        projection = new SettlementBalanceProjectionAggregate(
            counterpartyUserProfileId,
            settlementRequest.GroupId,
            direction,
            settlementRequest.Currency,
            selectedLineAmount,
            pendingClaimedAmount,
            confirmedClearedAmount,
            RequestCount: 1,
            LineCount: lines.Length,
            pendingPaymentCount,
            confirmedPaymentCount);
        return true;
    }

    private static bool CanProjectLine(SettlementRequestLine line)
    {
        return SettlementRuntimePolicy.IsValidSettlementAmount(line.ExactAmount)
            && line.AllocationOrder >= 0
            && (line.Status is SettlementRequestLineStatuses.Open
                or SettlementRequestLineStatuses.PartiallyCleared
                or SettlementRequestLineStatuses.Cleared);
    }

    private static bool CanProjectActivePayment(
        SettlementRequest settlementRequest,
        SettlementPayment payment)
    {
        return SettlementRuntimePolicy.IsValidSettlementAmount(payment.Amount)
            && (payment.Status is SettlementPaymentStatuses.MarkedPaid
                or SettlementPaymentStatuses.Confirmed)
            && payment.PaidByUserProfileId == settlementRequest.DebtorUserProfileId
            && payment.ReceivedByUserProfileId == settlementRequest.CreditorUserProfileId
            && payment.CreatedByUserProfileId == settlementRequest.DebtorUserProfileId
            && string.Equals(payment.Currency, settlementRequest.Currency, StringComparison.Ordinal);
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : SettlementBalancesUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult SettlementBalancesUnavailable()
    {
        return Results.Problem(
            title: SettlementBalancesUnavailableTitle,
            detail: SettlementBalancesUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private sealed record SettlementBalanceProjectionKey(
        Guid CounterpartyUserProfileId,
        Guid? GroupId,
        string Direction,
        string Currency);
}
