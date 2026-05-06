namespace Settleora.Api.Money;

internal sealed class MoneyAllocationService
{
    private readonly SupportedCurrencyPolicy supportedCurrencies;
    private readonly MoneyRoundingService roundingService;

    public MoneyAllocationService()
        : this(SupportedCurrencyPolicy.Default, new MoneyRoundingService(SupportedCurrencyPolicy.Default))
    {
    }

    public MoneyAllocationService(
        SupportedCurrencyPolicy supportedCurrencies,
        MoneyRoundingService roundingService)
    {
        this.supportedCurrencies = supportedCurrencies;
        this.roundingService = roundingService;
    }

    public MoneyAllocationResult AllocateEqual(
        MoneyAmount total,
        IReadOnlyList<Guid> participantKeys,
        MoneyRoundingMode roundingMode = MoneyRoundingMode.NearestToEven)
    {
        var participantValidation = ValidateParticipantKeys(participantKeys);
        if (!participantValidation.Succeeded)
        {
            return MoneyAllocationResult.Failed(participantValidation);
        }

        var totalValidation = ValidateAllocationTotal(total);
        if (!totalValidation.Succeeded)
        {
            return MoneyAllocationResult.Failed(totalValidation);
        }

        if (!TryRoundTotal(total, roundingMode, out var roundedTotal, out var totalMinorUnits, out var scaleFactor, out var roundingValidation))
        {
            return MoneyAllocationResult.Failed(roundingValidation);
        }

        var baseMinorUnits = totalMinorUnits / participantKeys.Count;
        var residualMinorUnits = checked((int)(totalMinorUnits % participantKeys.Count));
        var shares = new List<MoneyAllocationShare>(participantKeys.Count);
        var residualParticipantKeys = new List<Guid>(residualMinorUnits);

        for (var index = 0; index < participantKeys.Count; index++)
        {
            var receivesResidual = index < residualMinorUnits;
            var shareMinorUnits = baseMinorUnits + (receivesResidual ? 1 : 0);
            var participantKey = participantKeys[index];

            if (receivesResidual)
            {
                residualParticipantKeys.Add(participantKey);
            }

            shares.Add(new MoneyAllocationShare(
                participantKey,
                FromMinorUnits(shareMinorUnits, roundedTotal.Currency, scaleFactor),
                index,
                receivesResidual));
        }

        return MoneyAllocationResult.Success(
            roundedTotal,
            shares,
            residualMinorUnits,
            residualParticipantKeys);
    }

    public MoneyAllocationResult AllocateByWeights(
        MoneyAmount total,
        IReadOnlyList<MoneyAllocationWeight> participantWeights,
        MoneyRoundingMode roundingMode = MoneyRoundingMode.NearestToEven)
    {
        var participantValidation = ValidateWeightedParticipants(participantWeights);
        if (!participantValidation.Succeeded)
        {
            return MoneyAllocationResult.Failed(participantValidation);
        }

        var totalValidation = ValidateAllocationTotal(total);
        if (!totalValidation.Succeeded)
        {
            return MoneyAllocationResult.Failed(totalValidation);
        }

        if (!TryRoundTotal(total, roundingMode, out var roundedTotal, out var totalMinorUnits, out var scaleFactor, out var roundingValidation))
        {
            return MoneyAllocationResult.Failed(roundingValidation);
        }

        var totalWeight = participantWeights.Sum(participantWeight => participantWeight.Weight);
        var drafts = new List<WeightedAllocationDraft>(participantWeights.Count);
        long assignedMinorUnits = 0;

        for (var index = 0; index < participantWeights.Count; index++)
        {
            var participantWeight = participantWeights[index];
            var rawMinorUnits = totalMinorUnits * participantWeight.Weight / totalWeight;
            var floorMinorUnits = decimal.ToInt64(decimal.Floor(rawMinorUnits));
            var fractionalRemainder = rawMinorUnits - floorMinorUnits;
            assignedMinorUnits += floorMinorUnits;

            drafts.Add(new WeightedAllocationDraft(
                participantWeight.ParticipantKey,
                index,
                floorMinorUnits,
                fractionalRemainder));
        }

        var remainingMinorUnits = checked((int)(totalMinorUnits - assignedMinorUnits));
        var residualParticipantKeys = new List<Guid>(remainingMinorUnits);
        var residualInputOrders = drafts
            .OrderByDescending(draft => draft.FractionalRemainder)
            .ThenBy(draft => draft.InputOrder)
            .Take(remainingMinorUnits)
            .Select(draft => draft.InputOrder)
            .ToHashSet();

        var shares = new List<MoneyAllocationShare>(drafts.Count);
        foreach (var draft in drafts.OrderBy(draft => draft.InputOrder))
        {
            var receivesResidual = residualInputOrders.Contains(draft.InputOrder);
            var shareMinorUnits = draft.FloorMinorUnits + (receivesResidual ? 1 : 0);

            if (receivesResidual)
            {
                residualParticipantKeys.Add(draft.ParticipantKey);
            }

            shares.Add(new MoneyAllocationShare(
                draft.ParticipantKey,
                FromMinorUnits(shareMinorUnits, roundedTotal.Currency, scaleFactor),
                draft.InputOrder,
                receivesResidual));
        }

        return MoneyAllocationResult.Success(
            roundedTotal,
            shares,
            remainingMinorUnits,
            residualParticipantKeys);
    }

    public MoneyAllocationResult AllocateCustom(
        MoneyAmount total,
        IReadOnlyList<MoneyCustomAllocationShare> customShares,
        MoneyRoundingMode roundingMode = MoneyRoundingMode.NearestToEven)
    {
        var participantValidation = ValidateParticipantKeys(
            customShares.Select(customShare => customShare.ParticipantKey).ToArray());
        if (!participantValidation.Succeeded)
        {
            return MoneyAllocationResult.Failed(participantValidation);
        }

        var totalValidation = ValidateAllocationTotal(total);
        if (!totalValidation.Succeeded)
        {
            return MoneyAllocationResult.Failed(totalValidation);
        }

        if (!TryRoundTotal(total, roundingMode, out var roundedTotal, out var totalMinorUnits, out var scaleFactor, out var roundingValidation))
        {
            return MoneyAllocationResult.Failed(roundingValidation);
        }

        var shares = new List<MoneyAllocationShare>(customShares.Count);
        long assignedMinorUnits = 0;

        for (var index = 0; index < customShares.Count; index++)
        {
            var customShare = customShares[index];
            if (!customShare.Amount.Currency.Equals(total.Currency))
            {
                return MoneyAllocationResult.Failed(MoneyValidationResult.Failed(
                    MoneyValidationFailureReason.CurrencyMismatch,
                    "split.participants",
                    "Split amounts must use the same currency as the total."));
            }

            if (customShare.Amount.Amount < 0)
            {
                return MoneyAllocationResult.Failed(MoneyValidationResult.Failed(
                    MoneyValidationFailureReason.NegativeAmountNotAllowed,
                    "split.participants",
                    "Negative split amounts are not allowed for this operation."));
            }

            if (!roundingService.TryRoundToCurrencyMinorUnits(
                customShare.Amount,
                roundingMode,
                out var roundedShare,
                out var shareValidation))
            {
                return MoneyAllocationResult.Failed(shareValidation);
            }

            var shareMinorUnits = ToMinorUnits(roundedShare.Amount, scaleFactor);
            assignedMinorUnits += shareMinorUnits;

            shares.Add(new MoneyAllocationShare(
                customShare.ParticipantKey,
                roundedShare,
                index,
                ReceivedResidualMinorUnit: false));
        }

        if (assignedMinorUnits != totalMinorUnits)
        {
            return MoneyAllocationResult.Failed(MoneyValidationResult.Failed(
                MoneyValidationFailureReason.CustomSplitTotalMismatch,
                "split.participants",
                "Custom split amounts must equal the rounded total."));
        }

        return MoneyAllocationResult.Success(
            roundedTotal,
            shares,
            residualMinorUnits: 0,
            residualParticipantKeys: []);
    }

    private bool TryRoundTotal(
        MoneyAmount total,
        MoneyRoundingMode roundingMode,
        out MoneyAmount roundedTotal,
        out long totalMinorUnits,
        out decimal scaleFactor,
        out MoneyValidationResult validationResult)
    {
        roundedTotal = default!;
        totalMinorUnits = 0;
        scaleFactor = 0;

        if (!supportedCurrencies.TryGetMinorUnitDigits(total.Currency, out var minorUnitDigits))
        {
            validationResult = MoneyValidationResult.Failed(
                MoneyValidationFailureReason.UnsupportedCurrency,
                "currency",
                "Currency is not supported for this operation.");
            return false;
        }

        scaleFactor = MoneyRoundingService.GetScaleFactor(minorUnitDigits);
        if (!roundingService.TryRoundToCurrencyMinorUnits(
            total,
            roundingMode,
            out roundedTotal,
            out validationResult))
        {
            return false;
        }

        totalMinorUnits = ToMinorUnits(roundedTotal.Amount, scaleFactor);
        validationResult = MoneyValidationResult.Valid();
        return true;
    }

    private static MoneyValidationResult ValidateAllocationTotal(MoneyAmount total)
    {
        if (total.Amount < 0)
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.NegativeAmountNotAllowed,
                "amount",
                "Negative amount is not allowed for this operation.");
        }

        return MoneyValidationResult.Valid();
    }

    private static MoneyValidationResult ValidateParticipantKeys(IReadOnlyList<Guid> participantKeys)
    {
        if (participantKeys.Count is 0)
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.InvalidSplitParticipant,
                "split.participants",
                "At least one split participant is required.");
        }

        if (participantKeys.Any(participantKey => participantKey == Guid.Empty))
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.InvalidSplitParticipant,
                "split.participants",
                "Split participant identifiers must be present.");
        }

        if (participantKeys.Distinct().Count() != participantKeys.Count)
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.InvalidSplitParticipant,
                "split.participants",
                "Split participants must be unique.");
        }

        return MoneyValidationResult.Valid();
    }

    private static MoneyValidationResult ValidateWeightedParticipants(
        IReadOnlyList<MoneyAllocationWeight> participantWeights)
    {
        var participantValidation = ValidateParticipantKeys(
            participantWeights.Select(participantWeight => participantWeight.ParticipantKey).ToArray());
        if (!participantValidation.Succeeded)
        {
            return participantValidation;
        }

        if (participantWeights.Any(participantWeight => participantWeight.Weight <= 0))
        {
            return MoneyValidationResult.Failed(
                MoneyValidationFailureReason.InvalidSplitWeight,
                "split.participants",
                "Split weights must be greater than zero.");
        }

        return MoneyValidationResult.Valid();
    }

    private static long ToMinorUnits(decimal amount, decimal scaleFactor)
    {
        return decimal.ToInt64(amount * scaleFactor);
    }

    private static MoneyAmount FromMinorUnits(
        long minorUnits,
        CurrencyCode currency,
        decimal scaleFactor)
    {
        return new MoneyAmount(minorUnits / scaleFactor, currency);
    }

    private sealed record WeightedAllocationDraft(
        Guid ParticipantKey,
        int InputOrder,
        long FloorMinorUnits,
        decimal FractionalRemainder);
}

internal sealed record MoneyAllocationWeight(Guid ParticipantKey, decimal Weight);

internal sealed record MoneyCustomAllocationShare(Guid ParticipantKey, MoneyAmount Amount);

internal sealed record MoneyAllocationShare(
    Guid ParticipantKey,
    MoneyAmount Amount,
    int InputOrder,
    bool ReceivedResidualMinorUnit);

internal sealed class MoneyAllocationResult
{
    private MoneyAllocationResult(
        MoneyValidationResult validationResult,
        MoneyAmount? roundedTotal,
        IReadOnlyList<MoneyAllocationShare> shares,
        int residualMinorUnits,
        IReadOnlyList<Guid> residualParticipantKeys)
    {
        ValidationResult = validationResult;
        RoundedTotal = roundedTotal;
        Shares = shares;
        ResidualMinorUnits = residualMinorUnits;
        ResidualParticipantKeys = residualParticipantKeys;
    }

    public bool Succeeded => ValidationResult.Succeeded;

    public MoneyValidationResult ValidationResult { get; }

    public MoneyAmount? RoundedTotal { get; }

    public IReadOnlyList<MoneyAllocationShare> Shares { get; }

    public int ResidualMinorUnits { get; }

    public IReadOnlyList<Guid> ResidualParticipantKeys { get; }

    public string Code => ValidationResult.Code;

    public static MoneyAllocationResult Success(
        MoneyAmount roundedTotal,
        IReadOnlyList<MoneyAllocationShare> shares,
        int residualMinorUnits,
        IReadOnlyList<Guid> residualParticipantKeys)
    {
        return new MoneyAllocationResult(
            MoneyValidationResult.Valid(),
            roundedTotal,
            shares,
            residualMinorUnits,
            residualParticipantKeys);
    }

    public static MoneyAllocationResult Failed(MoneyValidationResult validationResult)
    {
        return new MoneyAllocationResult(
            validationResult,
            roundedTotal: null,
            shares: [],
            residualMinorUnits: 0,
            residualParticipantKeys: []);
    }
}
