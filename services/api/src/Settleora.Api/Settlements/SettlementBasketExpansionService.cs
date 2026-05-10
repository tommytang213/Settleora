using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Settlements;

internal static class SettlementBasketExpansionService
{
    private static readonly string[] DuplicateBlockingStatuses =
    [
        SettlementRequestStatuses.Requested,
        SettlementRequestStatuses.PartiallyPaid,
        SettlementRequestStatuses.MarkedPaid,
        SettlementRequestStatuses.Confirmed,
        SettlementRequestStatuses.Disputed
    ];

    public static async Task<SettlementBasketExpansionResult> ExpandPayAllOutstandingForCounterpartyAsync(
        SettleoraDbContext dbContext,
        SettlementCandidateDerivationService candidateDerivationService,
        Guid actorUserProfileId,
        Guid counterpartyUserProfileId,
        string direction,
        string currency,
        Guid? groupId,
        CancellationToken cancellationToken)
    {
        if (!await CounterpartyIsVisibleAsync(
                dbContext,
                actorUserProfileId,
                counterpartyUserProfileId,
                groupId,
                cancellationToken))
        {
            return SettlementBasketExpansionResult.Unavailable();
        }

        var debtorUserProfileId = direction is SettlementBalanceDirections.Outgoing
            ? actorUserProfileId
            : counterpartyUserProfileId;
        var creditorUserProfileId = direction is SettlementBalanceDirections.Outgoing
            ? counterpartyUserProfileId
            : actorUserProfileId;

        var duplicateKeys = await ReadDuplicateBlockingKeysAsync(
            dbContext,
            groupId,
            debtorUserProfileId,
            creditorUserProfileId,
            currency,
            cancellationToken);

        var bills = await VisibleBasketBillQuery(
                dbContext,
                actorUserProfileId,
                counterpartyUserProfileId,
                groupId)
            .OrderBy(bill => bill.CreatedAtUtc)
            .ThenBy(bill => bill.Id)
            .ToListAsync(cancellationToken);

        var lines = new List<SettlementBasketLineProjection>();
        foreach (var bill in bills)
        {
            var derivationResult = candidateDerivationService.DeriveCandidates(bill);
            if (!derivationResult.Succeeded)
            {
                continue;
            }

            foreach (var candidate in derivationResult.Candidates)
            {
                if (candidate.DebtorUserProfileId != debtorUserProfileId
                    || candidate.CreditorUserProfileId != creditorUserProfileId
                    || !string.Equals(candidate.Currency, currency, StringComparison.Ordinal)
                    || !SettlementRuntimePolicy.IsValidSettlementAmount(candidate.Amount)
                    || duplicateKeys.Contains(DuplicateSettlementRequestLineKey.From(candidate)))
                {
                    continue;
                }

                lines.Add(new SettlementBasketLineProjection(
                    candidate.SourceExpenseBillId,
                    bill.ActiveAcceptedBillRevisionId,
                    candidate.CandidateKey,
                    candidate.Amount,
                    candidate.Currency,
                    candidate.Basis,
                    bill.CreatedAtUtc,
                    candidate.AllocationOrder));
            }
        }

        var orderedLines = lines
            .OrderBy(line => line.CreatedAtUtc)
            .ThenBy(line => line.SourceExpenseBillId)
            .ThenBy(line => line.SourceCandidateKey, StringComparer.Ordinal)
            .ThenBy(line => line.CandidateAllocationOrder)
            .ToArray();

        return SettlementBasketExpansionResult.Available(
            debtorUserProfileId,
            creditorUserProfileId,
            orderedLines);
    }

    private static IQueryable<ExpenseBill> VisibleBasketBillQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId,
        Guid counterpartyUserProfileId,
        Guid? groupId)
    {
        var query = dbContext.Set<ExpenseBill>()
            .AsNoTracking()
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .Where(bill => bill.Status == ExpenseBillStatuses.Confirmed
                && bill.ArchivedAtUtc == null
                && bill.CreatedByUserProfile.DeletedAtUtc == null
                && bill.Participants.All(participant => participant.UserProfile.DeletedAtUtc == null)
                && bill.Payers.All(payer => payer.UserProfile.DeletedAtUtc == null)
                && (bill.CreatedByUserProfileId == actorUserProfileId
                    || bill.Participants.Any(participant => participant.UserProfileId == actorUserProfileId)
                    || bill.Payers.Any(payer => payer.UserProfileId == actorUserProfileId))
                && (bill.CreatedByUserProfileId == counterpartyUserProfileId
                    || bill.Participants.Any(participant => participant.UserProfileId == counterpartyUserProfileId)
                    || bill.Payers.Any(payer => payer.UserProfileId == counterpartyUserProfileId)));

        if (groupId is null)
        {
            return query.Where(bill => bill.GroupId == null);
        }

        var requiredGroupId = groupId.Value;
        return query.Where(bill => bill.GroupId == requiredGroupId
            && bill.Group != null
            && bill.Group.DeletedAtUtc == null
            && bill.CreatedByUserProfile.GroupMemberships.Any(membership =>
                membership.GroupId == requiredGroupId
                && membership.Status == GroupMembershipStatuses.Active)
            && bill.Participants.All(participant =>
                participant.UserProfile.GroupMemberships.Any(membership =>
                    membership.GroupId == requiredGroupId
                    && membership.Status == GroupMembershipStatuses.Active))
            && bill.Payers.All(payer =>
                payer.UserProfile.GroupMemberships.Any(membership =>
                    membership.GroupId == requiredGroupId
                    && membership.Status == GroupMembershipStatuses.Active))
            && dbContext.Set<GroupMembership>().Any(membership =>
                membership.GroupId == requiredGroupId
                && membership.UserProfileId == actorUserProfileId
                && membership.Status == GroupMembershipStatuses.Active)
            && dbContext.Set<GroupMembership>().Any(membership =>
                membership.GroupId == requiredGroupId
                && membership.UserProfileId == counterpartyUserProfileId
                && membership.Status == GroupMembershipStatuses.Active));
    }

    private static async Task<bool> CounterpartyIsVisibleAsync(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId,
        Guid counterpartyUserProfileId,
        Guid? groupId,
        CancellationToken cancellationToken)
    {
        var counterpartyExists = await dbContext.Set<UserProfile>()
            .AsNoTracking()
            .AnyAsync(
                profile => profile.Id == counterpartyUserProfileId
                    && profile.DeletedAtUtc == null,
                cancellationToken);
        if (!counterpartyExists)
        {
            return false;
        }

        if (groupId is not { } requiredGroupId)
        {
            return true;
        }

        return await dbContext.Set<UserGroup>()
                .AsNoTracking()
                .AnyAsync(
                    group => group.Id == requiredGroupId
                        && group.DeletedAtUtc == null,
                    cancellationToken)
            && await dbContext.Set<GroupMembership>()
                .AsNoTracking()
                .AnyAsync(
                    membership => membership.GroupId == requiredGroupId
                        && membership.UserProfileId == actorUserProfileId
                        && membership.Status == GroupMembershipStatuses.Active,
                    cancellationToken)
            && await dbContext.Set<GroupMembership>()
                .AsNoTracking()
                .AnyAsync(
                    membership => membership.GroupId == requiredGroupId
                        && membership.UserProfileId == counterpartyUserProfileId
                        && membership.Status == GroupMembershipStatuses.Active,
                    cancellationToken);
    }

    private static async Task<HashSet<DuplicateSettlementRequestLineKey>> ReadDuplicateBlockingKeysAsync(
        SettleoraDbContext dbContext,
        Guid? groupId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        string currency,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Set<SettlementRequestLine>()
            .AsNoTracking()
            .Where(line => line.SettlementRequest.ArchivedAtUtc == null
                && line.SettlementRequest.DebtorUserProfileId == debtorUserProfileId
                && line.SettlementRequest.CreditorUserProfileId == creditorUserProfileId
                && line.SettlementRequest.Currency == currency
                && DuplicateBlockingStatuses.Contains(line.SettlementRequest.Status));

        query = groupId is null
            ? query.Where(line => line.SettlementRequest.GroupId == null)
            : query.Where(line => line.SettlementRequest.GroupId == groupId.Value);

        var duplicates = await query
            .Select(line => new
            {
                line.SourceExpenseBillId,
                line.SettlementRequest.GroupId,
                line.SettlementRequest.DebtorUserProfileId,
                line.SettlementRequest.CreditorUserProfileId,
                Amount = line.ExactAmount,
                line.Currency
            })
            .ToListAsync(cancellationToken);

        return duplicates
            .Select(duplicate => new DuplicateSettlementRequestLineKey(
                duplicate.SourceExpenseBillId,
                duplicate.GroupId,
                duplicate.DebtorUserProfileId,
                duplicate.CreditorUserProfileId,
                duplicate.Amount,
                duplicate.Currency))
            .ToHashSet();
    }

    private sealed record DuplicateSettlementRequestLineKey(
        Guid SourceExpenseBillId,
        Guid? GroupId,
        Guid DebtorUserProfileId,
        Guid CreditorUserProfileId,
        decimal Amount,
        string Currency)
    {
        public static DuplicateSettlementRequestLineKey From(SettlementCandidate candidate)
        {
            return new DuplicateSettlementRequestLineKey(
                candidate.SourceExpenseBillId,
                candidate.GroupId,
                candidate.DebtorUserProfileId,
                candidate.CreditorUserProfileId,
                candidate.Amount,
                candidate.Currency);
        }
    }
}

internal sealed record SettlementBasketExpansionResult(
    bool IsAvailable,
    Guid DebtorUserProfileId,
    Guid CreditorUserProfileId,
    IReadOnlyList<SettlementBasketLineProjection> Lines)
{
    public static SettlementBasketExpansionResult Available(
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        IReadOnlyList<SettlementBasketLineProjection> lines)
    {
        return new SettlementBasketExpansionResult(
            true,
            debtorUserProfileId,
            creditorUserProfileId,
            lines);
    }

    public static SettlementBasketExpansionResult Unavailable()
    {
        return new SettlementBasketExpansionResult(
            false,
            Guid.Empty,
            Guid.Empty,
            []);
    }
}

internal sealed record SettlementBasketLineProjection(
    Guid SourceExpenseBillId,
    Guid? SourceBillRevisionId,
    string SourceCandidateKey,
    decimal ExactAmount,
    string Currency,
    string CandidateBasis,
    DateTimeOffset CreatedAtUtc,
    int CandidateAllocationOrder);
