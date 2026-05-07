using Settleora.Api.Domain.Expenses;
using Settleora.Api.Money;

namespace Settleora.Api.Domain.Settlements;

internal sealed class SettlementCandidateDerivationService
{
    public const string BasisConfirmedBillNetPositionV1 = "confirmed_bill_net_position_v1";

    private const string DebtorPosition = "debtor";
    private const string CreditorPosition = "creditor";
    private const string BalancedPosition = "balanced";

    private readonly SupportedCurrencyPolicy supportedCurrencies;
    private readonly MoneyRoundingService roundingService;

    public SettlementCandidateDerivationService()
    {
        supportedCurrencies = SupportedCurrencyPolicy.Default;
        roundingService = new MoneyRoundingService(supportedCurrencies);
    }

    public SettlementCandidateDerivationResult DeriveCandidates(ExpenseBill bill)
    {
        ArgumentNullException.ThrowIfNull(bill);

        if (bill.ArchivedAtUtc is not null || bill.Status == ExpenseBillStatuses.Archived)
        {
            return SettlementCandidateDerivationResult.Failed(SettlementCandidateDerivationFailure.Create(
                SettlementCandidateDerivationFailureReason.BillArchived,
                "bill_archived",
                "bill",
                "Settlement candidates can be derived only from non-archived bills."));
        }

        if (bill.Status != ExpenseBillStatuses.Confirmed)
        {
            return SettlementCandidateDerivationResult.Failed(SettlementCandidateDerivationFailure.Create(
                SettlementCandidateDerivationFailureReason.BillNotConfirmed,
                "bill_not_confirmed",
                "bill.status",
                "Settlement candidates can be derived only from confirmed bills."));
        }

        if (!TryCreateBillCurrency(bill.TotalCurrency, out var billCurrency, out var failure))
        {
            return SettlementCandidateDerivationResult.Failed(failure);
        }

        if (!TryResolveParticipantShares(
            bill.Participants,
            billCurrency,
            out var participantShares,
            out var participantTotal,
            out failure))
        {
            return SettlementCandidateDerivationResult.Failed(failure);
        }

        if (!TryResolvePayerContributions(
            bill.Payers,
            billCurrency,
            out var payerContributions,
            out var payerTotal,
            out failure))
        {
            return SettlementCandidateDerivationResult.Failed(failure);
        }

        if (participantTotal != payerTotal)
        {
            return SettlementCandidateDerivationResult.Failed(SettlementCandidateDerivationFailure.Create(
                SettlementCandidateDerivationFailureReason.ParticipantPayerTotalMismatch,
                "participant_payer_total_mismatch",
                "participants.resolved_share_amount",
                "Participant resolved share totals must equal payer contribution totals after rounding policy."));
        }

        var netPositions = ResolveNetPositions(
            participantShares,
            payerContributions,
            billCurrency.Value);
        var candidates = AllocateCandidates(
            bill,
            billCurrency.Value,
            netPositions,
            out failure);
        if (failure is not null)
        {
            return SettlementCandidateDerivationResult.Failed(failure);
        }

        if (candidates.Count is 0)
        {
            return SettlementCandidateDerivationResult.Failed(SettlementCandidateDerivationFailure.Create(
                SettlementCandidateDerivationFailureReason.NoCandidates,
                "no_settlement_candidates",
                "bill",
                "The confirmed bill has no non-zero settlement candidates."));
        }

        return SettlementCandidateDerivationResult.Success(
            new MoneyAmount(participantTotal, billCurrency),
            new MoneyAmount(payerTotal, billCurrency),
            netPositions,
            candidates);
    }

    private bool TryResolveParticipantShares(
        IEnumerable<ExpenseBillParticipant> participants,
        CurrencyCode billCurrency,
        out IReadOnlyDictionary<Guid, decimal> participantShares,
        out decimal participantTotal,
        out SettlementCandidateDerivationFailure failure)
    {
        var shares = new Dictionary<Guid, decimal>();
        participantTotal = 0m;
        failure = default!;

        foreach (var participant in participants)
        {
            if (participant.UserProfileId == Guid.Empty)
            {
                participantShares = shares;
                failure = SettlementCandidateDerivationFailure.Create(
                    SettlementCandidateDerivationFailureReason.InvalidParticipant,
                    "invalid_participant",
                    "participants.user_profile_id",
                    "Bill participant identifiers must be present.");
                return false;
            }

            if (shares.ContainsKey(participant.UserProfileId))
            {
                participantShares = shares;
                failure = SettlementCandidateDerivationFailure.Create(
                    SettlementCandidateDerivationFailureReason.InvalidParticipant,
                    "invalid_participant",
                    "participants.user_profile_id",
                    "Bill participant identifiers must be unique.");
                return false;
            }

            if (!TryCreateSameCurrencyMoney(
                participant.ResolvedShareAmount,
                participant.ResolvedShareCurrency,
                billCurrency,
                "participants.resolved_share_amount",
                "participants.resolved_share_currency",
                SettlementCandidateDerivationFailureReason.NegativeParticipantShare,
                "negative_participant_share",
                "Participant resolved shares must not be negative.",
                out var participantShare,
                out failure))
            {
                participantShares = shares;
                return false;
            }

            if (!roundingService.TryRoundToCurrencyMinorUnits(
                participantShare,
                MoneyRoundingMode.NearestToEven,
                out var roundedShare,
                out var roundingResult))
            {
                participantShares = shares;
                failure = SettlementCandidateDerivationFailure.FromMoney(roundingResult, "participants.resolved_share_amount");
                return false;
            }

            shares.Add(participant.UserProfileId, roundedShare.Amount);
            participantTotal += roundedShare.Amount;
        }

        if (shares.Count is 0)
        {
            participantShares = shares;
            failure = SettlementCandidateDerivationFailure.Create(
                SettlementCandidateDerivationFailureReason.NoParticipants,
                "no_participants",
                "participants",
                "At least one bill participant is required for settlement candidate derivation.");
            return false;
        }

        participantShares = shares;
        return true;
    }

    private bool TryResolvePayerContributions(
        IEnumerable<ExpenseBillPayer> payers,
        CurrencyCode billCurrency,
        out IReadOnlyDictionary<Guid, decimal> payerContributions,
        out decimal payerTotal,
        out SettlementCandidateDerivationFailure failure)
    {
        var contributions = new Dictionary<Guid, decimal>();
        payerTotal = 0m;
        failure = default!;
        var payerCount = 0;

        foreach (var payer in payers)
        {
            payerCount++;
            if (payer.UserProfileId == Guid.Empty)
            {
                payerContributions = contributions;
                failure = SettlementCandidateDerivationFailure.Create(
                    SettlementCandidateDerivationFailureReason.InvalidPayer,
                    "invalid_payer",
                    "payers.user_profile_id",
                    "Payer identifiers must be present.");
                return false;
            }

            if (!TryCreateSameCurrencyMoney(
                payer.Amount,
                payer.Currency,
                billCurrency,
                "payers.amount",
                "payers.currency",
                SettlementCandidateDerivationFailureReason.NegativePayerContribution,
                "negative_payer_contribution",
                "Payer contributions must not be negative.",
                out var payerContribution,
                out failure))
            {
                payerContributions = contributions;
                return false;
            }

            if (!roundingService.TryRoundToCurrencyMinorUnits(
                payerContribution,
                MoneyRoundingMode.NearestToEven,
                out var roundedContribution,
                out var roundingResult))
            {
                payerContributions = contributions;
                failure = SettlementCandidateDerivationFailure.FromMoney(roundingResult, "payers.amount");
                return false;
            }

            contributions[payer.UserProfileId] = contributions.GetValueOrDefault(payer.UserProfileId)
                + roundedContribution.Amount;
            payerTotal += roundedContribution.Amount;
        }

        if (payerCount is 0)
        {
            payerContributions = contributions;
            failure = SettlementCandidateDerivationFailure.Create(
                SettlementCandidateDerivationFailureReason.NoPayers,
                "no_payers",
                "payers",
                "At least one payer contribution is required for settlement candidate derivation.");
            return false;
        }

        payerContributions = contributions;
        return true;
    }

    private static IReadOnlyList<SettlementParticipantNetPosition> ResolveNetPositions(
        IReadOnlyDictionary<Guid, decimal> participantShares,
        IReadOnlyDictionary<Guid, decimal> payerContributions,
        string currency)
    {
        var userProfileIds = participantShares.Keys
            .Concat(payerContributions.Keys)
            .Distinct()
            .OrderBy(userProfileId => userProfileId)
            .ToArray();

        return userProfileIds
            .Select(userProfileId =>
            {
                var payerContribution = payerContributions.GetValueOrDefault(userProfileId);
                var resolvedShare = participantShares.GetValueOrDefault(userProfileId);
                var netPosition = payerContribution - resolvedShare;
                return new SettlementParticipantNetPosition(
                    userProfileId,
                    payerContribution,
                    resolvedShare,
                    netPosition,
                    currency,
                    GetPositionCategory(netPosition));
            })
            .ToArray();
    }

    private static IReadOnlyList<SettlementCandidate> AllocateCandidates(
        ExpenseBill bill,
        string currency,
        IReadOnlyList<SettlementParticipantNetPosition> netPositions,
        out SettlementCandidateDerivationFailure? failure)
    {
        failure = null;
        var debtors = netPositions
            .Where(position => position.NetPositionAmount < 0)
            .Select(position => new MutableNetPosition(
                position.UserProfileId,
                remainingAmount: decimal.Abs(position.NetPositionAmount),
                originalNetPositionAmount: position.NetPositionAmount))
            .OrderBy(position => position.UserProfileId)
            .ToArray();
        var creditors = netPositions
            .Where(position => position.NetPositionAmount > 0)
            .Select(position => new MutableNetPosition(
                position.UserProfileId,
                remainingAmount: position.NetPositionAmount,
                originalNetPositionAmount: position.NetPositionAmount))
            .OrderBy(position => position.UserProfileId)
            .ToArray();

        var candidates = new List<SettlementCandidate>();
        var creditorIndex = 0;

        foreach (var debtor in debtors)
        {
            while (debtor.RemainingAmount > 0 && creditorIndex < creditors.Length)
            {
                var creditor = creditors[creditorIndex];
                if (creditor.RemainingAmount == 0)
                {
                    creditorIndex++;
                    continue;
                }

                if (debtor.UserProfileId == creditor.UserProfileId)
                {
                    failure = SettlementCandidateDerivationFailure.Create(
                        SettlementCandidateDerivationFailureReason.SameCounterpartyCandidate,
                        "same_counterparty_candidate",
                        "bill",
                        "Settlement candidate debtor and creditor must be different users.");
                    return [];
                }

                var amount = decimal.Min(debtor.RemainingAmount, creditor.RemainingAmount);
                if (amount <= 0)
                {
                    failure = SettlementCandidateDerivationFailure.Create(
                        SettlementCandidateDerivationFailureReason.InvalidCandidateAmount,
                        "invalid_candidate_amount",
                        "bill",
                        "Settlement candidate amount must be positive.");
                    return [];
                }

                candidates.Add(new SettlementCandidate(
                    CreateCandidateKey(
                        bill.Id,
                        debtor.UserProfileId,
                        creditor.UserProfileId,
                        amount,
                        currency),
                    bill.Id,
                    bill.GroupId,
                    debtor.UserProfileId,
                    creditor.UserProfileId,
                    amount,
                    currency,
                    BasisConfirmedBillNetPositionV1,
                    candidates.Count,
                    debtor.OriginalNetPositionAmount,
                    creditor.OriginalNetPositionAmount));

                debtor.RemainingAmount -= amount;
                creditor.RemainingAmount -= amount;
                if (creditor.RemainingAmount == 0)
                {
                    creditorIndex++;
                }
            }
        }

        return candidates;
    }

    private bool TryCreateBillCurrency(
        string submittedCurrency,
        out CurrencyCode billCurrency,
        out SettlementCandidateDerivationFailure failure)
    {
        billCurrency = default!;
        failure = default!;

        if (!CurrencyCode.TryCreate(submittedCurrency, out billCurrency))
        {
            failure = SettlementCandidateDerivationFailure.Create(
                SettlementCandidateDerivationFailureReason.InvalidCurrencyFormat,
                "invalid_currency_format",
                "bill.currency",
                "Bill currency must be an uppercase three-letter code.");
            return false;
        }

        var supportedResult = supportedCurrencies.ValidateSupported(billCurrency, "bill.currency");
        if (!supportedResult.Succeeded)
        {
            failure = SettlementCandidateDerivationFailure.FromMoney(supportedResult, "bill.currency");
            return false;
        }

        return true;
    }

    private bool TryCreateSameCurrencyMoney(
        decimal amount,
        string submittedCurrency,
        CurrencyCode billCurrency,
        string amountField,
        string currencyField,
        SettlementCandidateDerivationFailureReason negativeReason,
        string negativeCode,
        string negativeMessage,
        out MoneyAmount moneyAmount,
        out SettlementCandidateDerivationFailure failure)
    {
        moneyAmount = default!;
        failure = default!;

        if (!CurrencyCode.TryCreate(submittedCurrency, out var currency))
        {
            failure = SettlementCandidateDerivationFailure.Create(
                SettlementCandidateDerivationFailureReason.InvalidCurrencyFormat,
                "invalid_currency_format",
                currencyField,
                "Currency must be an uppercase three-letter code.");
            return false;
        }

        var supportedResult = supportedCurrencies.ValidateSupported(currency, currencyField);
        if (!supportedResult.Succeeded)
        {
            failure = SettlementCandidateDerivationFailure.FromMoney(supportedResult, currencyField);
            return false;
        }

        if (!currency.Equals(billCurrency))
        {
            failure = SettlementCandidateDerivationFailure.Create(
                SettlementCandidateDerivationFailureReason.CurrencyMismatch,
                "currency_mismatch",
                currencyField,
                "Bill, participant, and payer currencies must match.");
            return false;
        }

        var validationResult = MoneyAmount.TryCreate(
            amount,
            currency,
            MoneyValidationOptions.Default with
            {
                AllowZero = true,
                AmountField = amountField,
                CurrencyField = currencyField
            },
            supportedCurrencies,
            out moneyAmount);
        if (!validationResult.Succeeded)
        {
            failure = validationResult.FailureReason is MoneyValidationFailureReason.NegativeAmountNotAllowed
                ? SettlementCandidateDerivationFailure.Create(
                    negativeReason,
                    negativeCode,
                    amountField,
                    negativeMessage)
                : SettlementCandidateDerivationFailure.FromMoney(validationResult, validationResult.Field);
            return false;
        }

        return true;
    }

    private static string CreateCandidateKey(
        Guid sourceBillId,
        Guid debtorUserProfileId,
        Guid creditorUserProfileId,
        decimal amount,
        string currency)
    {
        return FormattableString.Invariant(
            $"bill:{sourceBillId:D}:debtor:{debtorUserProfileId:D}:creditor:{creditorUserProfileId:D}:amount:{amount:0.0000}:currency:{currency}");
    }

    private static string GetPositionCategory(decimal netPositionAmount)
    {
        return netPositionAmount switch
        {
            > 0 => CreditorPosition,
            < 0 => DebtorPosition,
            _ => BalancedPosition
        };
    }

    private sealed class MutableNetPosition
    {
        public MutableNetPosition(
            Guid userProfileId,
            decimal remainingAmount,
            decimal originalNetPositionAmount)
        {
            UserProfileId = userProfileId;
            RemainingAmount = remainingAmount;
            OriginalNetPositionAmount = originalNetPositionAmount;
        }

        public Guid UserProfileId { get; }

        public decimal RemainingAmount { get; set; }

        public decimal OriginalNetPositionAmount { get; }
    }
}

internal sealed class SettlementCandidateDerivationResult
{
    private SettlementCandidateDerivationResult(
        SettlementCandidateDerivationFailure? failure,
        MoneyAmount? participantTotal,
        MoneyAmount? payerContributionTotal,
        IReadOnlyList<SettlementParticipantNetPosition> netPositions,
        IReadOnlyList<SettlementCandidate> candidates)
    {
        Failure = failure;
        ParticipantTotal = participantTotal;
        PayerContributionTotal = payerContributionTotal;
        NetPositions = netPositions;
        Candidates = candidates;
    }

    public bool Succeeded => Failure is null;

    public string Code => Failure?.Code ?? "valid";

    public SettlementCandidateDerivationFailure? Failure { get; }

    public MoneyAmount? ParticipantTotal { get; }

    public MoneyAmount? PayerContributionTotal { get; }

    public IReadOnlyList<SettlementParticipantNetPosition> NetPositions { get; }

    public IReadOnlyList<SettlementCandidate> Candidates { get; }

    public static SettlementCandidateDerivationResult Success(
        MoneyAmount participantTotal,
        MoneyAmount payerContributionTotal,
        IReadOnlyList<SettlementParticipantNetPosition> netPositions,
        IReadOnlyList<SettlementCandidate> candidates)
    {
        return new SettlementCandidateDerivationResult(
            failure: null,
            participantTotal,
            payerContributionTotal,
            netPositions,
            candidates);
    }

    public static SettlementCandidateDerivationResult Failed(SettlementCandidateDerivationFailure failure)
    {
        return new SettlementCandidateDerivationResult(
            failure,
            participantTotal: null,
            payerContributionTotal: null,
            netPositions: [],
            candidates: []);
    }
}

internal sealed record SettlementCandidate(
    string CandidateKey,
    Guid SourceExpenseBillId,
    Guid? GroupId,
    Guid DebtorUserProfileId,
    Guid CreditorUserProfileId,
    decimal Amount,
    string Currency,
    string Basis,
    int AllocationOrder,
    decimal DebtorNetPositionAmount,
    decimal CreditorNetPositionAmount);

internal sealed record SettlementParticipantNetPosition(
    Guid UserProfileId,
    decimal PayerContributionAmount,
    decimal ResolvedShareAmount,
    decimal NetPositionAmount,
    string Currency,
    string PositionCategory);

internal sealed record SettlementCandidateDerivationFailure(
    SettlementCandidateDerivationFailureReason Reason,
    string Code,
    string Field,
    string Message)
{
    public static SettlementCandidateDerivationFailure Create(
        SettlementCandidateDerivationFailureReason reason,
        string code,
        string field,
        string message)
    {
        return new SettlementCandidateDerivationFailure(reason, code, field, message);
    }

    public static SettlementCandidateDerivationFailure FromMoney(
        MoneyValidationResult validationResult,
        string? field = null)
    {
        return new SettlementCandidateDerivationFailure(
            MapReason(validationResult.FailureReason),
            validationResult.Code,
            field ?? validationResult.Field,
            validationResult.Message);
    }

    private static SettlementCandidateDerivationFailureReason MapReason(
        MoneyValidationFailureReason failureReason)
    {
        return failureReason switch
        {
            MoneyValidationFailureReason.InvalidCurrencyFormat => SettlementCandidateDerivationFailureReason.InvalidCurrencyFormat,
            MoneyValidationFailureReason.UnsupportedCurrency => SettlementCandidateDerivationFailureReason.UnsupportedCurrency,
            MoneyValidationFailureReason.InvalidDecimalFormat => SettlementCandidateDerivationFailureReason.InvalidDecimalFormat,
            MoneyValidationFailureReason.AmountOutOfRange => SettlementCandidateDerivationFailureReason.AmountOutOfRange,
            MoneyValidationFailureReason.TooManyFractionalDigits => SettlementCandidateDerivationFailureReason.TooManyFractionalDigits,
            MoneyValidationFailureReason.CurrencyMismatch => SettlementCandidateDerivationFailureReason.CurrencyMismatch,
            _ => SettlementCandidateDerivationFailureReason.InvalidMoney
        };
    }
}

internal enum SettlementCandidateDerivationFailureReason
{
    None = 0,
    BillNotConfirmed,
    BillArchived,
    NoParticipants,
    NoPayers,
    InvalidParticipant,
    InvalidPayer,
    InvalidCurrencyFormat,
    UnsupportedCurrency,
    InvalidDecimalFormat,
    AmountOutOfRange,
    TooManyFractionalDigits,
    CurrencyMismatch,
    InvalidMoney,
    NegativeParticipantShare,
    NegativePayerContribution,
    ParticipantPayerTotalMismatch,
    NoCandidates,
    SameCounterpartyCandidate,
    InvalidCandidateAmount
}
