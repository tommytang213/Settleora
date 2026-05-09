namespace Settleora.Api.Domain.Expenses;

internal sealed class BillRevisionAffectedParticipantService
{
    public BillRevisionAffectedParticipantResult Compare(
        BillRevisionMoneyBasis activeBasis,
        BillRevisionMoneyBasis candidateBasis,
        Guid changedByUserProfileId)
    {
        ArgumentNullException.ThrowIfNull(activeBasis);
        ArgumentNullException.ThrowIfNull(candidateBasis);

        var affected = new HashSet<Guid>();
        var paidByReconfirmation = new HashSet<Guid>();

        var activeParticipants = activeBasis.Participants.ToDictionary(participant => participant.UserProfileId);
        var candidateParticipants = candidateBasis.Participants.ToDictionary(participant => participant.UserProfileId);
        foreach (var participantId in activeParticipants.Keys.Concat(candidateParticipants.Keys).Distinct())
        {
            var hasActive = activeParticipants.TryGetValue(participantId, out var activeParticipant);
            var hasCandidate = candidateParticipants.TryGetValue(participantId, out var candidateParticipant);
            if (!hasActive || !hasCandidate)
            {
                affected.Add(participantId);
                continue;
            }

            if (activeParticipant!.ResolvedShareAmount != candidateParticipant!.ResolvedShareAmount
                || !StringComparer.Ordinal.Equals(activeParticipant.ResolvedShareCurrency, candidateParticipant.ResolvedShareCurrency))
            {
                affected.Add(participantId);
            }
        }

        var activePayers = activeBasis.Payers.ToDictionary(payer => payer.UserProfileId);
        var candidatePayers = candidateBasis.Payers.ToDictionary(payer => payer.UserProfileId);
        foreach (var payerId in activePayers.Keys.Concat(candidatePayers.Keys).Distinct())
        {
            var hasActive = activePayers.TryGetValue(payerId, out var activePayer);
            var hasCandidate = candidatePayers.TryGetValue(payerId, out var candidatePayer);
            if (!hasActive || !hasCandidate)
            {
                affected.Add(payerId);
                if (hasCandidate && payerId != changedByUserProfileId)
                {
                    paidByReconfirmation.Add(payerId);
                }

                continue;
            }

            if (activePayer!.Amount != candidatePayer!.Amount
                || !StringComparer.Ordinal.Equals(activePayer.Currency, candidatePayer.Currency))
            {
                affected.Add(payerId);
                if (payerId != changedByUserProfileId)
                {
                    paidByReconfirmation.Add(payerId);
                }
            }
        }

        return new BillRevisionAffectedParticipantResult(
            affected.OrderBy(id => id).ToArray(),
            paidByReconfirmation.OrderBy(id => id).ToArray());
    }
}

internal sealed record BillRevisionMoneyBasis(
    IReadOnlyList<BillRevisionParticipantBasis> Participants,
    IReadOnlyList<BillRevisionPayerBasis> Payers)
{
    public static BillRevisionMoneyBasis FromBill(ExpenseBill bill)
    {
        ArgumentNullException.ThrowIfNull(bill);

        return new BillRevisionMoneyBasis(
            bill.Participants
                .Select(participant => new BillRevisionParticipantBasis(
                    participant.UserProfileId,
                    participant.ResolvedShareAmount,
                    participant.ResolvedShareCurrency))
                .ToArray(),
            bill.Payers
                .GroupBy(payer => payer.UserProfileId)
                .Select(group =>
                {
                    var first = group.First();
                    return new BillRevisionPayerBasis(
                        group.Key,
                        group.Sum(payer => payer.Amount),
                        first.Currency);
                })
                .ToArray());
    }
}

internal sealed record BillRevisionParticipantBasis(
    Guid UserProfileId,
    decimal ResolvedShareAmount,
    string ResolvedShareCurrency);

internal sealed record BillRevisionPayerBasis(
    Guid UserProfileId,
    decimal Amount,
    string Currency);

internal sealed record BillRevisionAffectedParticipantResult(
    IReadOnlyList<Guid> AffectedParticipantIds,
    IReadOnlyList<Guid> PayersRequiringConfirmation);
