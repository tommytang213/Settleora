using Settleora.Api.Money;

namespace Settleora.Api.Domain.Expenses;

internal sealed class ExpenseBillCalculationService
{
    private readonly SupportedCurrencyPolicy supportedCurrencies;
    private readonly MoneyAllocationService allocationService;

    public ExpenseBillCalculationService()
    {
        supportedCurrencies = SupportedCurrencyPolicy.Default;
        var roundingService = new MoneyRoundingService(supportedCurrencies);
        allocationService = new MoneyAllocationService(supportedCurrencies, roundingService);
    }

    public ExpenseBillCalculationResult Calculate(ExpenseBill bill)
    {
        ArgumentNullException.ThrowIfNull(bill);

        if (!TryCreateBillCurrency(bill.TotalCurrency, out var billCurrency, out var failure))
        {
            return ExpenseBillCalculationResult.Failed(failure);
        }

        var participantIds = ResolveBillParticipantOrder(bill);
        if (!ValidateBillParticipants(participantIds, out failure))
        {
            return ExpenseBillCalculationResult.Failed(failure);
        }

        var itemSplits = new List<ExpenseBillCalculatedItemSplit>();
        var preAdjustmentShares = participantIds.ToDictionary(
            participantId => participantId,
            _ => 0m);
        var participantOrder = participantIds.ToList();
        var itemSubtotal = 0m;
        var activeItemCount = 0;

        foreach (var item in bill.Items
            .Where(item => item.DeletedAtUtc is null)
            .OrderBy(item => item.SortOrder)
            .ThenBy(item => item.Id))
        {
            activeItemCount++;
            if (!TryCreateSameCurrencyMoney(
                item.Amount,
                item.Currency,
                billCurrency,
                "items.amount",
                "items.currency",
                out var itemAmount,
                out failure))
            {
                return ExpenseBillCalculationResult.Failed(failure);
            }

            var splitResult = ResolveItemSplits(item, itemAmount);
            if (!splitResult.Succeeded)
            {
                return ExpenseBillCalculationResult.Failed(splitResult.Failure!);
            }

            itemSubtotal += splitResult.RoundedItemTotal!.Amount;
            itemSplits.AddRange(splitResult.ItemSplits);

            foreach (var calculatedSplit in splitResult.ItemSplits)
            {
                if (!preAdjustmentShares.ContainsKey(calculatedSplit.UserProfileId))
                {
                    preAdjustmentShares[calculatedSplit.UserProfileId] = 0m;
                    participantOrder.Add(calculatedSplit.UserProfileId);
                }

                preAdjustmentShares[calculatedSplit.UserProfileId] += calculatedSplit.ResolvedAmount;
            }
        }

        if (activeItemCount is 0)
        {
            return ExpenseBillCalculationResult.Failed(ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.NoActiveItems,
                "no_active_items",
                "items",
                "At least one active bill item is required for calculation."));
        }

        var participantShares = new Dictionary<Guid, decimal>(preAdjustmentShares);
        var adjustmentAllocations = new List<ExpenseBillCalculatedAdjustmentAllocation>();
        var billTotal = itemSubtotal;

        foreach (var adjustment in bill.Adjustments
            .OrderBy(adjustment => adjustment.SortOrder)
            .ThenBy(adjustment => adjustment.Id))
        {
            var adjustmentResult = ApplyAdjustment(
                adjustment,
                billCurrency,
                participantOrder,
                preAdjustmentShares,
                participantShares,
                billTotal);
            if (!adjustmentResult.Succeeded)
            {
                return ExpenseBillCalculationResult.Failed(adjustmentResult.Failure!);
            }

            billTotal = adjustmentResult.BillTotal;
            adjustmentAllocations.AddRange(adjustmentResult.Allocations);
        }

        if (!ValidateNonNegativeParticipantShares(participantShares, out failure))
        {
            return ExpenseBillCalculationResult.Failed(failure);
        }

        if (!ValidatePayers(
            bill.Payers,
            billCurrency,
            billTotal,
            out var payerContributionTotal,
            out failure))
        {
            return ExpenseBillCalculationResult.Failed(failure);
        }

        var calculatedParticipantShares = participantOrder
            .Select((participantId, index) => new ExpenseBillCalculatedParticipantShare(
                participantId,
                participantShares[participantId],
                billCurrency.Value,
                index,
                ExpenseBillParticipantStatuses.PendingAcceptance))
            .ToArray();

        return ExpenseBillCalculationResult.Success(
            new MoneyAmount(billTotal, billCurrency),
            itemSplits,
            calculatedParticipantShares,
            adjustmentAllocations,
            payerContributionTotal is null ? null : new MoneyAmount(payerContributionTotal.Value, billCurrency));
    }

    private ExpenseBillItemCalculationResult ResolveItemSplits(
        ExpenseBillItem item,
        MoneyAmount itemAmount)
    {
        var orderedSplits = item.Splits
            .OrderBy(split => split.AllocationOrder)
            .ThenBy(split => split.UserProfileId)
            .ThenBy(split => split.Id)
            .ToArray();

        if (orderedSplits.Length is 0 ||
            orderedSplits.Any(split => split.UserProfileId == Guid.Empty) ||
            orderedSplits.Select(split => split.UserProfileId).Distinct().Count() != orderedSplits.Length)
        {
            return ExpenseBillItemCalculationResult.Failed(ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.InvalidSplitParticipant,
                "invalid_split_participant",
                "items.splits",
                "Item split participants must be present and unique per item."));
        }

        var unsupportedSplit = orderedSplits.FirstOrDefault(split =>
            !ExpenseBillItemSplitMethods.IsSupported(split.SplitMethod));
        if (unsupportedSplit is not null)
        {
            return ExpenseBillItemCalculationResult.Failed(ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.UnsupportedSplitMethod,
                "unsupported_split_method",
                "items.splits.split_method",
                "Item split method is not supported."));
        }

        var splitMethod = orderedSplits[0].SplitMethod;
        if (orderedSplits.Any(split => split.SplitMethod != splitMethod))
        {
            return ExpenseBillItemCalculationResult.Failed(ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.MixedItemSplitMethods,
                "mixed_item_split_methods",
                "items.splits.split_method",
                "A single item must use one split method."));
        }

        if (splitMethod is ExpenseBillItemSplitMethods.ExactAmount)
        {
            return ResolveExactItemSplits(item, itemAmount, orderedSplits);
        }

        MoneyAllocationResult? allocationResult;
        if (splitMethod is ExpenseBillItemSplitMethods.Equal)
        {
            allocationResult = allocationService.AllocateEqual(
                itemAmount,
                orderedSplits.Select(split => split.UserProfileId).ToArray());
        }
        else if (splitMethod is ExpenseBillItemSplitMethods.Percentage)
        {
            allocationResult = AllocatePercentage(itemAmount, orderedSplits, out var allocationFailure);
            if (allocationResult is null)
            {
                return ExpenseBillItemCalculationResult.Failed(allocationFailure!);
            }
        }
        else
        {
            allocationResult = AllocateWeighted(itemAmount, orderedSplits, out var allocationFailure);
            if (allocationResult is null)
            {
                return ExpenseBillItemCalculationResult.Failed(allocationFailure!);
            }
        }

        return CreateItemSplitResult(item, itemAmount, orderedSplits, allocationResult);
    }

    private ExpenseBillItemCalculationResult ResolveExactItemSplits(
        ExpenseBillItem item,
        MoneyAmount itemAmount,
        IReadOnlyList<ExpenseBillItemSplit> orderedSplits)
    {
        var customShares = new List<MoneyCustomAllocationShare>(orderedSplits.Count);
        foreach (var split in orderedSplits)
        {
            if (!TryCreateBasisMoney(
                split,
                itemAmount.Currency,
                allowZero: true,
                out var basisAmount,
                out var failure))
            {
                return ExpenseBillItemCalculationResult.Failed(failure);
            }

            customShares.Add(new MoneyCustomAllocationShare(split.UserProfileId, basisAmount));
        }

        var allocationResult = allocationService.AllocateCustom(itemAmount, customShares);
        if (!allocationResult.Succeeded)
        {
            var failure = allocationResult.ValidationResult.FailureReason is MoneyValidationFailureReason.CustomSplitTotalMismatch
                ? ExpenseBillCalculationFailure.Create(
                    ExpenseBillCalculationFailureReason.ExactAmountSplitTotalMismatch,
                    "exact_amount_split_total_mismatch",
                    "items.splits.basis_value",
                    "Exact amount split basis values must equal the rounded item amount.")
                : ExpenseBillCalculationFailure.FromMoney(
                    allocationResult.ValidationResult,
                    "items.splits.basis_value");

            return ExpenseBillItemCalculationResult.Failed(failure);
        }

        return CreateItemSplitResult(item, itemAmount, orderedSplits, allocationResult);
    }

    private MoneyAllocationResult? AllocatePercentage(
        MoneyAmount itemAmount,
        IReadOnlyList<ExpenseBillItemSplit> orderedSplits,
        out ExpenseBillCalculationFailure? failure)
    {
        failure = null;
        var weights = new List<MoneyAllocationWeight>(orderedSplits.Count);
        var percentageTotal = 0m;

        foreach (var split in orderedSplits)
        {
            if (!TryCreatePositiveBasisValue(split, out var basisValue, out failure))
            {
                return null;
            }

            percentageTotal += basisValue;
            weights.Add(new MoneyAllocationWeight(split.UserProfileId, basisValue));
        }

        if (percentageTotal != 100m)
        {
            failure = ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.PercentageSplitTotalMismatch,
                "percentage_split_total_mismatch",
                "items.splits.basis_value",
                "Percentage split basis values must total exactly 100.");
            return null;
        }

        var allocationResult = allocationService.AllocateByWeights(itemAmount, weights);
        if (!allocationResult.Succeeded)
        {
            failure = ExpenseBillCalculationFailure.FromMoney(
                allocationResult.ValidationResult,
                "items.splits.basis_value");
            return null;
        }

        return allocationResult;
    }

    private MoneyAllocationResult? AllocateWeighted(
        MoneyAmount itemAmount,
        IReadOnlyList<ExpenseBillItemSplit> orderedSplits,
        out ExpenseBillCalculationFailure? failure)
    {
        failure = null;
        var weights = new List<MoneyAllocationWeight>(orderedSplits.Count);
        foreach (var split in orderedSplits)
        {
            if (!TryCreatePositiveBasisValue(split, out var basisValue, out failure))
            {
                return null;
            }

            weights.Add(new MoneyAllocationWeight(split.UserProfileId, basisValue));
        }

        var allocationResult = allocationService.AllocateByWeights(itemAmount, weights);
        if (!allocationResult.Succeeded)
        {
            failure = ExpenseBillCalculationFailure.FromMoney(
                allocationResult.ValidationResult,
                "items.splits.basis_value");
            return null;
        }

        return allocationResult;
    }

    private static ExpenseBillItemCalculationResult CreateItemSplitResult(
        ExpenseBillItem item,
        MoneyAmount itemAmount,
        IReadOnlyList<ExpenseBillItemSplit> orderedSplits,
        MoneyAllocationResult allocationResult)
    {
        if (!allocationResult.Succeeded)
        {
            return ExpenseBillItemCalculationResult.Failed(
                ExpenseBillCalculationFailure.FromMoney(allocationResult.ValidationResult));
        }

        var splitByParticipant = orderedSplits.ToDictionary(split => split.UserProfileId);
        var calculatedSplits = allocationResult.Shares
            .Select(share =>
            {
                var split = splitByParticipant[share.ParticipantKey];
                return new ExpenseBillCalculatedItemSplit(
                    item.Id,
                    split.Id,
                    share.ParticipantKey,
                    split.SplitMethod,
                    split.BasisValue,
                    share.Amount.Amount,
                    share.Amount.Currency.Value,
                    split.AllocationOrder,
                    share.ReceivedResidualMinorUnit);
            })
            .ToArray();

        return ExpenseBillItemCalculationResult.Success(
            allocationResult.RoundedTotal ?? itemAmount,
            calculatedSplits);
    }

    private ExpenseBillAdjustmentCalculationResult ApplyAdjustment(
        ExpenseBillAdjustment adjustment,
        CurrencyCode billCurrency,
        IReadOnlyList<Guid> participantOrder,
        IReadOnlyDictionary<Guid, decimal> preAdjustmentShares,
        IDictionary<Guid, decimal> participantShares,
        decimal currentBillTotal)
    {
        if (!TryCreateSameCurrencyMoney(
            adjustment.Amount,
            adjustment.Currency,
            billCurrency,
            "adjustments.amount",
            "adjustments.currency",
            out var adjustmentAmount,
            out var failure))
        {
            return ExpenseBillAdjustmentCalculationResult.Failed(failure);
        }

        if (!ExpenseBillAdjustmentDirections.IsSupported(adjustment.Direction))
        {
            return ExpenseBillAdjustmentCalculationResult.Failed(ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.InvalidAdjustmentDirection,
                "invalid_adjustment_direction",
                "adjustments.direction",
                "Adjustment direction is not supported."));
        }

        if (!ExpenseBillAdjustmentAllocationMethods.IsSupported(adjustment.AllocationMethod))
        {
            return ExpenseBillAdjustmentCalculationResult.Failed(ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.UnsupportedAdjustmentAllocationMethod,
                "unsupported_adjustment_allocation_method",
                "adjustments.allocation_method",
                "Adjustment allocation method is not supported."));
        }

        if (adjustment.AllocationMethod is ExpenseBillAdjustmentAllocationMethods.Manual)
        {
            return ExpenseBillAdjustmentCalculationResult.Failed(ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.UnsupportedManualAdjustmentAllocation,
                "unsupported_manual_adjustment_allocation",
                "adjustments.allocation_method",
                "Manual adjustment allocation is intentionally unsupported in this service slice."));
        }

        MoneyAllocationResult allocationResult;
        if (adjustment.AllocationMethod is ExpenseBillAdjustmentAllocationMethods.Equal)
        {
            allocationResult = allocationService.AllocateEqual(adjustmentAmount, participantOrder);
        }
        else
        {
            var weights = participantOrder
                .Where(participantId => preAdjustmentShares.GetValueOrDefault(participantId) > 0)
                .Select(participantId => new MoneyAllocationWeight(
                    participantId,
                    preAdjustmentShares[participantId]))
                .ToArray();
            if (weights.Length is 0)
            {
                return ExpenseBillAdjustmentCalculationResult.Failed(ExpenseBillCalculationFailure.Create(
                    ExpenseBillCalculationFailureReason.AdjustmentAllocationDenominatorNotPositive,
                    "adjustment_allocation_denominator_not_positive",
                    "adjustments.allocation_method",
                    "Proportional adjustment allocation requires a positive active item subtotal."));
            }

            allocationResult = allocationService.AllocateByWeights(adjustmentAmount, weights);
        }

        if (!allocationResult.Succeeded)
        {
            return ExpenseBillAdjustmentCalculationResult.Failed(
                ExpenseBillCalculationFailure.FromMoney(allocationResult.ValidationResult, "adjustments"));
        }

        var signedMultiplier = adjustment.Direction is ExpenseBillAdjustmentDirections.Charge ? 1m : -1m;
        var nextBillTotal = currentBillTotal + signedMultiplier * allocationResult.RoundedTotal!.Amount;
        if (nextBillTotal < 0)
        {
            return ExpenseBillAdjustmentCalculationResult.Failed(ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.NegativeBillTotal,
                "negative_bill_total",
                "adjustments.amount",
                "Adjustment credit would make the bill total negative."));
        }

        var allocations = new List<ExpenseBillCalculatedAdjustmentAllocation>(allocationResult.Shares.Count);
        foreach (var allocationShare in allocationResult.Shares)
        {
            var participantId = allocationShare.ParticipantKey;
            if (!participantShares.ContainsKey(participantId))
            {
                participantShares[participantId] = 0m;
            }

            var signedShareAmount = signedMultiplier * allocationShare.Amount.Amount;
            var nextParticipantShare = participantShares[participantId] + signedShareAmount;
            if (nextParticipantShare < 0)
            {
                return ExpenseBillAdjustmentCalculationResult.Failed(ExpenseBillCalculationFailure.Create(
                    ExpenseBillCalculationFailureReason.NegativeParticipantShare,
                    "negative_participant_share",
                    "adjustments.amount",
                    "Adjustment credit would make a participant resolved share negative."));
            }

            participantShares[participantId] = nextParticipantShare;
            allocations.Add(new ExpenseBillCalculatedAdjustmentAllocation(
                adjustment.Id,
                participantId,
                adjustment.Direction,
                adjustment.AllocationMethod,
                allocationShare.Amount.Amount,
                billCurrency.Value,
                allocationShare.InputOrder,
                allocationShare.ReceivedResidualMinorUnit));
        }

        return ExpenseBillAdjustmentCalculationResult.Success(nextBillTotal, allocations);
    }

    private bool ValidatePayers(
        IEnumerable<ExpenseBillPayer> payers,
        CurrencyCode billCurrency,
        decimal billTotal,
        out decimal? payerContributionTotal,
        out ExpenseBillCalculationFailure failure)
    {
        payerContributionTotal = null;
        failure = default!;

        var roundedPayerTotal = 0m;
        var payerCount = 0;
        var payerIds = new HashSet<Guid>();
        foreach (var payer in payers)
        {
            payerCount++;
            if (payer.UserProfileId == Guid.Empty)
            {
                failure = ExpenseBillCalculationFailure.Create(
                    ExpenseBillCalculationFailureReason.InvalidPayer,
                    "invalid_payer",
                    "payers.user_profile_id",
                    "Payer participant identifiers must be present.");
                return false;
            }

            if (!payerIds.Add(payer.UserProfileId))
            {
                failure = ExpenseBillCalculationFailure.Create(
                    ExpenseBillCalculationFailureReason.InvalidPayer,
                    "invalid_payer",
                    "payers.user_profile_id",
                    "Payer participant identifiers must be unique.");
                return false;
            }

            if (!TryCreateSameCurrencyMoney(
                payer.Amount,
                payer.Currency,
                billCurrency,
                "payers.amount",
                "payers.currency",
                out var payerAmount,
                out failure))
            {
                return false;
            }

            var payerAllocationResult = allocationService.AllocateCustom(
                payerAmount,
                [new MoneyCustomAllocationShare(payer.UserProfileId, payerAmount)]);
            if (!payerAllocationResult.Succeeded)
            {
                failure = ExpenseBillCalculationFailure.FromMoney(
                    payerAllocationResult.ValidationResult,
                    "payers.amount");
                return false;
            }

            roundedPayerTotal += payerAllocationResult.RoundedTotal!.Amount;
        }

        if (payerCount is 0)
        {
            return true;
        }

        payerContributionTotal = roundedPayerTotal;
        if (roundedPayerTotal != billTotal)
        {
            failure = ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.PayerContributionTotalMismatch,
                "payer_contribution_total_mismatch",
                "payers.amount",
                "Payer contribution totals must equal the resolved bill total.");
            return false;
        }

        return true;
    }

    private bool TryCreateBillCurrency(
        string submittedCurrency,
        out CurrencyCode billCurrency,
        out ExpenseBillCalculationFailure failure)
    {
        billCurrency = default!;
        failure = default!;

        if (!CurrencyCode.TryCreate(submittedCurrency, out billCurrency))
        {
            failure = ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.InvalidCurrencyFormat,
                "invalid_currency_format",
                "bill.currency",
                "Bill currency must be an uppercase three-letter code.");
            return false;
        }

        var supportedResult = supportedCurrencies.ValidateSupported(billCurrency, "bill.currency");
        if (!supportedResult.Succeeded)
        {
            failure = ExpenseBillCalculationFailure.FromMoney(supportedResult, "bill.currency");
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
        out MoneyAmount moneyAmount,
        out ExpenseBillCalculationFailure failure)
    {
        moneyAmount = default!;
        failure = default!;

        if (!CurrencyCode.TryCreate(submittedCurrency, out var currency))
        {
            failure = ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.InvalidCurrencyFormat,
                "invalid_currency_format",
                currencyField,
                "Currency must be an uppercase three-letter code.");
            return false;
        }

        var supportedResult = supportedCurrencies.ValidateSupported(currency, currencyField);
        if (!supportedResult.Succeeded)
        {
            failure = ExpenseBillCalculationFailure.FromMoney(supportedResult, currencyField);
            return false;
        }

        if (!currency.Equals(billCurrency))
        {
            failure = ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.CurrencyMismatch,
                "currency_mismatch",
                currencyField,
                "Bill, item, adjustment, and payer currencies must match.");
            return false;
        }

        var validationResult = MoneyAmount.TryCreate(
            amount,
            currency,
            MoneyValidationOptions.Default with
            {
                AmountField = amountField,
                CurrencyField = currencyField
            },
            supportedCurrencies,
            out moneyAmount);
        if (!validationResult.Succeeded)
        {
            failure = ExpenseBillCalculationFailure.FromMoney(validationResult, validationResult.Field);
            return false;
        }

        return true;
    }

    private bool TryCreateBasisMoney(
        ExpenseBillItemSplit split,
        CurrencyCode currency,
        bool allowZero,
        out MoneyAmount moneyAmount,
        out ExpenseBillCalculationFailure failure)
    {
        moneyAmount = default!;
        failure = default!;

        if (split.BasisValue is null)
        {
            failure = ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.MissingSplitBasis,
                "missing_split_basis",
                "items.splits.basis_value",
                "Split basis value is required for this split method.");
            return false;
        }

        var validationResult = MoneyAmount.TryCreate(
            split.BasisValue.Value,
            currency,
            MoneyValidationOptions.Default with
            {
                AllowZero = allowZero,
                AmountField = "items.splits.basis_value",
                CurrencyField = "items.currency"
            },
            supportedCurrencies,
            out moneyAmount);
        if (!validationResult.Succeeded)
        {
            failure = ExpenseBillCalculationFailure.FromMoney(
                validationResult,
                "items.splits.basis_value");
            return false;
        }

        return true;
    }

    private static bool TryCreatePositiveBasisValue(
        ExpenseBillItemSplit split,
        out decimal basisValue,
        out ExpenseBillCalculationFailure? failure)
    {
        basisValue = 0;
        failure = null;

        if (split.BasisValue is null)
        {
            failure = ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.MissingSplitBasis,
                "missing_split_basis",
                "items.splits.basis_value",
                "Split basis value is required for this split method.");
            return false;
        }

        basisValue = split.BasisValue.Value;
        if (basisValue <= 0)
        {
            failure = ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.InvalidSplitBasis,
                "invalid_split_basis",
                "items.splits.basis_value",
                "Split basis value must be greater than zero for this split method.");
            return false;
        }

        return true;
    }

    private static IReadOnlyList<Guid> ResolveBillParticipantOrder(ExpenseBill bill)
    {
        return bill.Participants
            .OrderBy(participant => participant.UserProfileId)
            .Select(participant => participant.UserProfileId)
            .ToArray();
    }

    private static bool ValidateBillParticipants(
        IReadOnlyList<Guid> participantIds,
        out ExpenseBillCalculationFailure failure)
    {
        failure = default!;
        if (participantIds.Any(participantId => participantId == Guid.Empty))
        {
            failure = ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.InvalidParticipant,
                "invalid_participant",
                "participants.user_profile_id",
                "Bill participant identifiers must be present.");
            return false;
        }

        if (participantIds.Distinct().Count() != participantIds.Count)
        {
            failure = ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.InvalidParticipant,
                "invalid_participant",
                "participants.user_profile_id",
                "Bill participants must be unique.");
            return false;
        }

        return true;
    }

    private static bool ValidateNonNegativeParticipantShares(
        IReadOnlyDictionary<Guid, decimal> participantShares,
        out ExpenseBillCalculationFailure failure)
    {
        failure = default!;
        if (participantShares.Any(participantShare => participantShare.Value < 0))
        {
            failure = ExpenseBillCalculationFailure.Create(
                ExpenseBillCalculationFailureReason.NegativeParticipantShare,
                "negative_participant_share",
                "participants.resolved_share_amount",
                "Participant resolved shares must not be negative.");
            return false;
        }

        return true;
    }
}

internal sealed class ExpenseBillCalculationResult
{
    private ExpenseBillCalculationResult(
        ExpenseBillCalculationFailure? failure,
        MoneyAmount? billTotal,
        IReadOnlyList<ExpenseBillCalculatedItemSplit> itemSplits,
        IReadOnlyList<ExpenseBillCalculatedParticipantShare> participantShares,
        IReadOnlyList<ExpenseBillCalculatedAdjustmentAllocation> adjustmentAllocations,
        MoneyAmount? payerContributionTotal)
    {
        Failure = failure;
        BillTotal = billTotal;
        ItemSplits = itemSplits;
        ParticipantShares = participantShares;
        AdjustmentAllocations = adjustmentAllocations;
        PayerContributionTotal = payerContributionTotal;
    }

    public bool Succeeded => Failure is null;

    public ExpenseBillCalculationFailure? Failure { get; }

    public string Code => Failure?.Code ?? "valid";

    public MoneyAmount? BillTotal { get; }

    public IReadOnlyList<ExpenseBillCalculatedItemSplit> ItemSplits { get; }

    public IReadOnlyList<ExpenseBillCalculatedParticipantShare> ParticipantShares { get; }

    public IReadOnlyList<ExpenseBillCalculatedAdjustmentAllocation> AdjustmentAllocations { get; }

    public MoneyAmount? PayerContributionTotal { get; }

    public static ExpenseBillCalculationResult Success(
        MoneyAmount billTotal,
        IReadOnlyList<ExpenseBillCalculatedItemSplit> itemSplits,
        IReadOnlyList<ExpenseBillCalculatedParticipantShare> participantShares,
        IReadOnlyList<ExpenseBillCalculatedAdjustmentAllocation> adjustmentAllocations,
        MoneyAmount? payerContributionTotal)
    {
        return new ExpenseBillCalculationResult(
            failure: null,
            billTotal,
            itemSplits,
            participantShares,
            adjustmentAllocations,
            payerContributionTotal);
    }

    public static ExpenseBillCalculationResult Failed(ExpenseBillCalculationFailure failure)
    {
        return new ExpenseBillCalculationResult(
            failure,
            billTotal: null,
            itemSplits: [],
            participantShares: [],
            adjustmentAllocations: [],
            payerContributionTotal: null);
    }
}

internal sealed record ExpenseBillCalculatedItemSplit(
    Guid ExpenseBillItemId,
    Guid ExpenseBillItemSplitId,
    Guid UserProfileId,
    string SplitMethod,
    decimal? BasisValue,
    decimal ResolvedAmount,
    string ResolvedCurrency,
    int AllocationOrder,
    bool ReceivedResidualMinorUnit);

internal sealed record ExpenseBillCalculatedParticipantShare(
    Guid UserProfileId,
    decimal ResolvedShareAmount,
    string ResolvedShareCurrency,
    int AllocationOrder,
    string Status);

internal sealed record ExpenseBillCalculatedAdjustmentAllocation(
    Guid ExpenseBillAdjustmentId,
    Guid UserProfileId,
    string Direction,
    string AllocationMethod,
    decimal AllocatedAmount,
    string Currency,
    int AllocationOrder,
    bool ReceivedResidualMinorUnit);

internal sealed record ExpenseBillCalculationFailure(
    ExpenseBillCalculationFailureReason Reason,
    string Code,
    string Field,
    string Message)
{
    public static ExpenseBillCalculationFailure Create(
        ExpenseBillCalculationFailureReason reason,
        string code,
        string field,
        string message)
    {
        return new ExpenseBillCalculationFailure(reason, code, field, message);
    }

    public static ExpenseBillCalculationFailure FromMoney(
        MoneyValidationResult validationResult,
        string? field = null)
    {
        return new ExpenseBillCalculationFailure(
            MapReason(validationResult.FailureReason),
            validationResult.Code,
            field ?? validationResult.Field,
            validationResult.Message);
    }

    private static ExpenseBillCalculationFailureReason MapReason(
        MoneyValidationFailureReason failureReason)
    {
        return failureReason switch
        {
            MoneyValidationFailureReason.InvalidCurrencyFormat => ExpenseBillCalculationFailureReason.InvalidCurrencyFormat,
            MoneyValidationFailureReason.UnsupportedCurrency => ExpenseBillCalculationFailureReason.UnsupportedCurrency,
            MoneyValidationFailureReason.InvalidDecimalFormat => ExpenseBillCalculationFailureReason.InvalidDecimalFormat,
            MoneyValidationFailureReason.AmountOutOfRange => ExpenseBillCalculationFailureReason.AmountOutOfRange,
            MoneyValidationFailureReason.TooManyFractionalDigits => ExpenseBillCalculationFailureReason.TooManyFractionalDigits,
            MoneyValidationFailureReason.NegativeAmountNotAllowed => ExpenseBillCalculationFailureReason.NegativeAmountNotAllowed,
            MoneyValidationFailureReason.ZeroAmountNotAllowed => ExpenseBillCalculationFailureReason.ZeroAmountNotAllowed,
            MoneyValidationFailureReason.CurrencyMismatch => ExpenseBillCalculationFailureReason.CurrencyMismatch,
            MoneyValidationFailureReason.InvalidSplitParticipant => ExpenseBillCalculationFailureReason.InvalidSplitParticipant,
            MoneyValidationFailureReason.InvalidSplitWeight => ExpenseBillCalculationFailureReason.InvalidSplitBasis,
            MoneyValidationFailureReason.CustomSplitTotalMismatch => ExpenseBillCalculationFailureReason.ExactAmountSplitTotalMismatch,
            _ => ExpenseBillCalculationFailureReason.InvalidMoney
        };
    }
}

internal enum ExpenseBillCalculationFailureReason
{
    None = 0,
    InvalidCurrencyFormat,
    UnsupportedCurrency,
    InvalidDecimalFormat,
    AmountOutOfRange,
    TooManyFractionalDigits,
    NegativeAmountNotAllowed,
    ZeroAmountNotAllowed,
    CurrencyMismatch,
    InvalidMoney,
    InvalidParticipant,
    InvalidPayer,
    InvalidSplitParticipant,
    UnsupportedSplitMethod,
    MixedItemSplitMethods,
    MissingSplitBasis,
    InvalidSplitBasis,
    ExactAmountSplitTotalMismatch,
    PercentageSplitTotalMismatch,
    InvalidAdjustmentDirection,
    UnsupportedAdjustmentAllocationMethod,
    UnsupportedManualAdjustmentAllocation,
    NoActiveItems,
    AdjustmentAllocationDenominatorNotPositive,
    NegativeBillTotal,
    NegativeParticipantShare,
    PayerContributionTotalMismatch
}

internal sealed class ExpenseBillItemCalculationResult
{
    private ExpenseBillItemCalculationResult(
        ExpenseBillCalculationFailure? failure,
        MoneyAmount? roundedItemTotal,
        IReadOnlyList<ExpenseBillCalculatedItemSplit> itemSplits)
    {
        Failure = failure;
        RoundedItemTotal = roundedItemTotal;
        ItemSplits = itemSplits;
    }

    public bool Succeeded => Failure is null;

    public ExpenseBillCalculationFailure? Failure { get; }

    public MoneyAmount? RoundedItemTotal { get; }

    public IReadOnlyList<ExpenseBillCalculatedItemSplit> ItemSplits { get; }

    public static ExpenseBillItemCalculationResult Success(
        MoneyAmount roundedItemTotal,
        IReadOnlyList<ExpenseBillCalculatedItemSplit> itemSplits)
    {
        return new ExpenseBillItemCalculationResult(
            failure: null,
            roundedItemTotal,
            itemSplits);
    }

    public static ExpenseBillItemCalculationResult Failed(ExpenseBillCalculationFailure failure)
    {
        return new ExpenseBillItemCalculationResult(
            failure,
            roundedItemTotal: null,
            itemSplits: []);
    }
}

internal sealed class ExpenseBillAdjustmentCalculationResult
{
    private ExpenseBillAdjustmentCalculationResult(
        ExpenseBillCalculationFailure? failure,
        decimal billTotal,
        IReadOnlyList<ExpenseBillCalculatedAdjustmentAllocation> allocations)
    {
        Failure = failure;
        BillTotal = billTotal;
        Allocations = allocations;
    }

    public bool Succeeded => Failure is null;

    public ExpenseBillCalculationFailure? Failure { get; }

    public decimal BillTotal { get; }

    public IReadOnlyList<ExpenseBillCalculatedAdjustmentAllocation> Allocations { get; }

    public static ExpenseBillAdjustmentCalculationResult Success(
        decimal billTotal,
        IReadOnlyList<ExpenseBillCalculatedAdjustmentAllocation> allocations)
    {
        return new ExpenseBillAdjustmentCalculationResult(
            failure: null,
            billTotal,
            allocations);
    }

    public static ExpenseBillAdjustmentCalculationResult Failed(ExpenseBillCalculationFailure failure)
    {
        return new ExpenseBillAdjustmentCalculationResult(
            failure,
            billTotal: 0,
            allocations: []);
    }
}
