using Settleora.Api.Domain.Expenses;
using Settleora.Api.Money;

namespace Settleora.Api.Tests;

public sealed class ExpenseBillCalculationServiceTests
{
    private static readonly Guid ParticipantOne = StableGuid(1);
    private static readonly Guid ParticipantTwo = StableGuid(2);
    private static readonly Guid ParticipantThree = StableGuid(3);

    private readonly ExpenseBillCalculationService service = new();

    [Fact]
    public void EqualItemSplitAssignsResidualMinorUnitsByAllocationOrder()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            10.01m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo),
                Split(ParticipantThree)
            ]);

        var result = service.Calculate(bill);

        AssertSucceeded(result);
        AssertMoney(10.01m, "USD", result.BillTotal!);
        AssertItemSplit(result, ParticipantOne, 3.34m, residual: true, allocationOrder: 0);
        AssertItemSplit(result, ParticipantTwo, 3.34m, residual: true, allocationOrder: 1);
        AssertItemSplit(result, ParticipantThree, 3.33m, residual: false, allocationOrder: 2);
        AssertParticipantShare(result, ParticipantOne, 3.34m, allocationOrder: 0);
        AssertParticipantShare(result, ParticipantTwo, 3.34m, allocationOrder: 1);
        AssertParticipantShare(result, ParticipantThree, 3.33m, allocationOrder: 2);
    }

    [Fact]
    public void ExactAmountItemSplitSucceedsWhenSharesMatchRoundedItemAmount()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            10.004m,
            ExpenseBillItemSplitMethods.ExactAmount,
            [
                Split(ParticipantOne, 4.00m),
                Split(ParticipantTwo, 6.00m)
            ]);

        var result = service.Calculate(bill);

        AssertSucceeded(result);
        AssertMoney(10.00m, "USD", result.BillTotal!);
        AssertItemSplit(result, ParticipantOne, 4.00m, residual: false, allocationOrder: 0, basisValue: 4.00m);
        AssertItemSplit(result, ParticipantTwo, 6.00m, residual: false, allocationOrder: 1, basisValue: 6.00m);
    }

    [Fact]
    public void ExactAmountItemSplitFailsWhenSharesDoNotMatchRoundedItemAmount()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            10.00m,
            ExpenseBillItemSplitMethods.ExactAmount,
            [
                Split(ParticipantOne, 4.00m),
                Split(ParticipantTwo, 5.99m)
            ]);

        var result = service.Calculate(bill);

        Assert.False(result.Succeeded);
        Assert.Equal("exact_amount_split_total_mismatch", result.Code);
        Assert.Empty(result.ItemSplits);
    }

    [Fact]
    public void ExactAmountItemSplitRequiresBasisValue()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            10.00m,
            ExpenseBillItemSplitMethods.ExactAmount,
            [
                Split(ParticipantOne, 4.00m),
                Split(ParticipantTwo)
            ]);

        var result = service.Calculate(bill);

        Assert.False(result.Succeeded);
        Assert.Equal("missing_split_basis", result.Code);
    }

    [Fact]
    public void PercentageItemSplitSucceedsWhenPercentagesTotalExactlyOneHundred()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            10.01m,
            ExpenseBillItemSplitMethods.Percentage,
            [
                Split(ParticipantOne, 50m),
                Split(ParticipantTwo, 30m),
                Split(ParticipantThree, 20m)
            ]);

        var result = service.Calculate(bill);

        AssertSucceeded(result);
        AssertMoney(10.01m, "USD", result.BillTotal!);
        AssertItemSplit(result, ParticipantOne, 5.01m, residual: true, allocationOrder: 0, basisValue: 50m);
        AssertItemSplit(result, ParticipantTwo, 3.00m, residual: false, allocationOrder: 1, basisValue: 30m);
        AssertItemSplit(result, ParticipantThree, 2.00m, residual: false, allocationOrder: 2, basisValue: 20m);
    }

    [Fact]
    public void PercentageItemSplitFailsWhenPercentagesDoNotTotalExactlyOneHundred()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            10.00m,
            ExpenseBillItemSplitMethods.Percentage,
            [
                Split(ParticipantOne, 40m),
                Split(ParticipantTwo, 40m)
            ]);

        var result = service.Calculate(bill);

        Assert.False(result.Succeeded);
        Assert.Equal("percentage_split_total_mismatch", result.Code);
    }

    [Fact]
    public void PercentageItemSplitRequiresBasisValue()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            10.00m,
            ExpenseBillItemSplitMethods.Percentage,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo, 100m)
            ]);

        var result = service.Calculate(bill);

        Assert.False(result.Succeeded);
        Assert.Equal("missing_split_basis", result.Code);
    }

    [Fact]
    public void PercentageItemSplitRejectsZeroOrNegativeBasisValues()
    {
        foreach (var invalidBasisValue in new[] { 0m, -1m })
        {
            var bill = CreateBill();
            AddItem(
                bill,
                10.00m,
                ExpenseBillItemSplitMethods.Percentage,
                [
                    Split(ParticipantOne, invalidBasisValue),
                    Split(ParticipantTwo, 100m - invalidBasisValue)
                ]);

            var result = service.Calculate(bill);

            Assert.False(result.Succeeded);
            Assert.Equal("invalid_split_basis", result.Code);
        }
    }

    [Fact]
    public void RatioAndShareWeightSplitsUseWeightedAllocationWithDeterministicResiduals()
    {
        var ratioBill = CreateBill();
        AddItem(
            ratioBill,
            0.05m,
            ExpenseBillItemSplitMethods.Ratio,
            [
                Split(ParticipantOne, 5m),
                Split(ParticipantTwo, 3m),
                Split(ParticipantThree, 2m)
            ]);

        var ratioResult = service.Calculate(ratioBill);

        AssertSucceeded(ratioResult);
        AssertItemSplit(ratioResult, ParticipantOne, 0.03m, residual: true, allocationOrder: 0, basisValue: 5m);
        AssertItemSplit(ratioResult, ParticipantTwo, 0.01m, residual: false, allocationOrder: 1, basisValue: 3m);
        AssertItemSplit(ratioResult, ParticipantThree, 0.01m, residual: false, allocationOrder: 2, basisValue: 2m);

        var shareWeightBill = CreateBill();
        AddItem(
            shareWeightBill,
            0.05m,
            ExpenseBillItemSplitMethods.ShareWeight,
            [
                Split(ParticipantOne, 5m),
                Split(ParticipantTwo, 3m),
                Split(ParticipantThree, 2m)
            ]);

        var shareWeightResult = service.Calculate(shareWeightBill);

        AssertSucceeded(shareWeightResult);
        AssertItemSplit(shareWeightResult, ParticipantOne, 0.03m, residual: true, allocationOrder: 0, basisValue: 5m);
        AssertItemSplit(shareWeightResult, ParticipantTwo, 0.01m, residual: false, allocationOrder: 1, basisValue: 3m);
        AssertItemSplit(shareWeightResult, ParticipantThree, 0.01m, residual: false, allocationOrder: 2, basisValue: 2m);
    }

    [Fact]
    public void RatioAndShareWeightSplitsRejectZeroOrNegativeBasisValues()
    {
        foreach (var splitMethod in new[] { ExpenseBillItemSplitMethods.Ratio, ExpenseBillItemSplitMethods.ShareWeight })
        {
            foreach (var invalidBasisValue in new[] { 0m, -1m })
            {
                var bill = CreateBill();
                AddItem(
                    bill,
                    10.00m,
                    splitMethod,
                    [
                        Split(ParticipantOne, invalidBasisValue),
                        Split(ParticipantTwo, 1m)
                    ]);

                var result = service.Calculate(bill);

                Assert.False(result.Succeeded);
                Assert.Equal("invalid_split_basis", result.Code);
            }
        }
    }

    [Fact]
    public void UnsupportedItemSplitMethodReturnsBoundedFailure()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            10.00m,
            "client_calculated",
            [
                Split(ParticipantOne),
                Split(ParticipantTwo)
            ]);

        var result = service.Calculate(bill);

        Assert.False(result.Succeeded);
        Assert.Equal("unsupported_split_method", result.Code);
    }

    [Fact]
    public void MultipleItemsWithDifferentSplitMethodsAggregateParticipantShares()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            10.01m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo),
                Split(ParticipantThree)
            ],
            sortOrder: 1);
        AddItem(
            bill,
            6.00m,
            ExpenseBillItemSplitMethods.ExactAmount,
            [
                Split(ParticipantOne, 2.00m),
                Split(ParticipantTwo, 4.00m)
            ],
            sortOrder: 2);

        var result = service.Calculate(bill);

        AssertSucceeded(result);
        AssertMoney(16.01m, "USD", result.BillTotal!);
        AssertParticipantShare(result, ParticipantOne, 5.34m, allocationOrder: 0);
        AssertParticipantShare(result, ParticipantTwo, 7.34m, allocationOrder: 1);
        AssertParticipantShare(result, ParticipantThree, 3.33m, allocationOrder: 2);
    }

    [Fact]
    public void EqualChargeAdjustmentIncreasesParticipantSharesAndBillTotal()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            9.00m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo),
                Split(ParticipantThree)
            ]);
        AddAdjustment(
            bill,
            1.00m,
            ExpenseBillAdjustmentDirections.Charge,
            ExpenseBillAdjustmentAllocationMethods.Equal);

        var result = service.Calculate(bill);

        AssertSucceeded(result);
        AssertMoney(10.00m, "USD", result.BillTotal!);
        AssertAdjustmentAllocation(result, ParticipantOne, 0.34m, residual: true);
        AssertAdjustmentAllocation(result, ParticipantTwo, 0.33m, residual: false);
        AssertAdjustmentAllocation(result, ParticipantThree, 0.33m, residual: false);
        AssertParticipantShare(result, ParticipantOne, 3.34m, allocationOrder: 0);
        AssertParticipantShare(result, ParticipantTwo, 3.33m, allocationOrder: 1);
        AssertParticipantShare(result, ParticipantThree, 3.33m, allocationOrder: 2);
    }

    [Fact]
    public void EqualCreditAdjustmentDecreasesParticipantSharesAndBillTotal()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            9.00m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo),
                Split(ParticipantThree)
            ]);
        AddAdjustment(
            bill,
            1.00m,
            ExpenseBillAdjustmentDirections.Credit,
            ExpenseBillAdjustmentAllocationMethods.Equal);

        var result = service.Calculate(bill);

        AssertSucceeded(result);
        AssertMoney(8.00m, "USD", result.BillTotal!);
        AssertAdjustmentAllocation(result, ParticipantOne, 0.34m, residual: true);
        AssertParticipantShare(result, ParticipantOne, 2.66m, allocationOrder: 0);
        AssertParticipantShare(result, ParticipantTwo, 2.67m, allocationOrder: 1);
        AssertParticipantShare(result, ParticipantThree, 2.67m, allocationOrder: 2);
    }

    [Fact]
    public void CreditAdjustmentLargerThanBillTotalFails()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            1.00m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo)
            ]);
        AddAdjustment(
            bill,
            1.01m,
            ExpenseBillAdjustmentDirections.Credit,
            ExpenseBillAdjustmentAllocationMethods.Equal);

        var result = service.Calculate(bill);

        Assert.False(result.Succeeded);
        Assert.Equal("negative_bill_total", result.Code);
    }

    [Fact]
    public void CreditAdjustmentLargerThanParticipantShareFails()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            10.00m,
            ExpenseBillItemSplitMethods.ExactAmount,
            [
                Split(ParticipantOne, 0.01m),
                Split(ParticipantTwo, 9.99m)
            ]);
        AddAdjustment(
            bill,
            0.04m,
            ExpenseBillAdjustmentDirections.Credit,
            ExpenseBillAdjustmentAllocationMethods.Equal);

        var result = service.Calculate(bill);

        Assert.False(result.Succeeded);
        Assert.Equal("negative_participant_share", result.Code);
    }

    [Fact]
    public void ProportionalAdjustmentAllocationUsesPreAdjustmentItemSubtotal()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            10.00m,
            ExpenseBillItemSplitMethods.ExactAmount,
            [
                Split(ParticipantOne, 6.00m),
                Split(ParticipantTwo, 3.00m),
                Split(ParticipantThree, 1.00m)
            ]);
        AddAdjustment(
            bill,
            1.00m,
            ExpenseBillAdjustmentDirections.Charge,
            ExpenseBillAdjustmentAllocationMethods.ProportionalByItemSubtotal);

        var result = service.Calculate(bill);

        AssertSucceeded(result);
        AssertMoney(11.00m, "USD", result.BillTotal!);
        AssertAdjustmentAllocation(result, ParticipantOne, 0.60m, residual: false);
        AssertAdjustmentAllocation(result, ParticipantTwo, 0.30m, residual: false);
        AssertAdjustmentAllocation(result, ParticipantThree, 0.10m, residual: false);
        AssertParticipantShare(result, ParticipantOne, 6.60m, allocationOrder: 0);
        AssertParticipantShare(result, ParticipantTwo, 3.30m, allocationOrder: 1);
        AssertParticipantShare(result, ParticipantThree, 1.10m, allocationOrder: 2);
    }

    [Fact]
    public void ProportionalAdjustmentAllocationFailsWhenNoPositiveItemSubtotalExists()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            0.00m,
            ExpenseBillItemSplitMethods.ExactAmount,
            [
                Split(ParticipantOne, 0.00m),
                Split(ParticipantTwo, 0.00m)
            ]);
        AddAdjustment(
            bill,
            1.00m,
            ExpenseBillAdjustmentDirections.Charge,
            ExpenseBillAdjustmentAllocationMethods.ProportionalByItemSubtotal);

        var result = service.Calculate(bill);

        Assert.False(result.Succeeded);
        Assert.Equal("adjustment_allocation_denominator_not_positive", result.Code);
    }

    [Fact]
    public void ManualAdjustmentAllocationReturnsExplicitUnsupportedFailure()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            10.00m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo)
            ]);
        AddAdjustment(
            bill,
            1.00m,
            ExpenseBillAdjustmentDirections.Charge,
            ExpenseBillAdjustmentAllocationMethods.Manual);

        var result = service.Calculate(bill);

        Assert.False(result.Succeeded);
        Assert.Equal("unsupported_manual_adjustment_allocation", result.Code);
    }

    [Fact]
    public void MixedCurrenciesAreRejected()
    {
        var itemCurrencyBill = CreateBill();
        AddItem(
            itemCurrencyBill,
            10.00m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo)
            ],
            currency: "EUR");

        var itemCurrencyResult = service.Calculate(itemCurrencyBill);

        Assert.False(itemCurrencyResult.Succeeded);
        Assert.Equal("currency_mismatch", itemCurrencyResult.Code);
        Assert.Equal("items.currency", itemCurrencyResult.Failure!.Field);

        var adjustmentCurrencyBill = CreateBill();
        AddItem(
            adjustmentCurrencyBill,
            10.00m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo)
            ]);
        AddAdjustment(
            adjustmentCurrencyBill,
            1.00m,
            ExpenseBillAdjustmentDirections.Charge,
            ExpenseBillAdjustmentAllocationMethods.Equal,
            currency: "EUR");

        var adjustmentCurrencyResult = service.Calculate(adjustmentCurrencyBill);

        Assert.False(adjustmentCurrencyResult.Succeeded);
        Assert.Equal("currency_mismatch", adjustmentCurrencyResult.Code);
        Assert.Equal("adjustments.currency", adjustmentCurrencyResult.Failure!.Field);

        var payerCurrencyBill = CreateBill();
        AddItem(
            payerCurrencyBill,
            10.00m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo)
            ]);
        AddPayer(payerCurrencyBill, ParticipantOne, 10.00m, currency: "EUR");

        var payerCurrencyResult = service.Calculate(payerCurrencyBill);

        Assert.False(payerCurrencyResult.Succeeded);
        Assert.Equal("currency_mismatch", payerCurrencyResult.Code);
        Assert.Equal("payers.currency", payerCurrencyResult.Failure!.Field);
    }

    [Fact]
    public void DuplicateAndMissingParticipantIdsAreRejected()
    {
        var duplicateBill = CreateBill();
        AddItem(
            duplicateBill,
            10.00m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantOne, allocationOrder: 1)
            ]);

        var duplicateResult = service.Calculate(duplicateBill);

        Assert.False(duplicateResult.Succeeded);
        Assert.Equal("invalid_split_participant", duplicateResult.Code);

        var missingBill = CreateBill();
        AddItem(
            missingBill,
            10.00m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(Guid.Empty),
                Split(ParticipantTwo, allocationOrder: 1)
            ]);

        var missingResult = service.Calculate(missingBill);

        Assert.False(missingResult.Succeeded);
        Assert.Equal("invalid_split_participant", missingResult.Code);
    }

    [Fact]
    public void PayerContributionsMustMatchResolvedBillTotalAfterAdjustmentsWhenSupplied()
    {
        var matchedBill = CreateBill();
        AddItem(
            matchedBill,
            10.00m,
            ExpenseBillItemSplitMethods.ExactAmount,
            [
                Split(ParticipantOne, 4.00m),
                Split(ParticipantTwo, 6.00m)
            ]);
        AddAdjustment(
            matchedBill,
            1.00m,
            ExpenseBillAdjustmentDirections.Charge,
            ExpenseBillAdjustmentAllocationMethods.Equal);
        AddPayer(matchedBill, ParticipantOne, 5.00m);
        AddPayer(matchedBill, ParticipantTwo, 6.00m);

        var matchedResult = service.Calculate(matchedBill);

        AssertSucceeded(matchedResult);
        AssertMoney(11.00m, "USD", matchedResult.PayerContributionTotal!);

        var mismatchedBill = CreateBill();
        AddItem(
            mismatchedBill,
            10.00m,
            ExpenseBillItemSplitMethods.ExactAmount,
            [
                Split(ParticipantOne, 4.00m),
                Split(ParticipantTwo, 6.00m)
            ]);
        AddAdjustment(
            mismatchedBill,
            1.00m,
            ExpenseBillAdjustmentDirections.Charge,
            ExpenseBillAdjustmentAllocationMethods.Equal);
        AddPayer(mismatchedBill, ParticipantOne, 5.00m);
        AddPayer(mismatchedBill, ParticipantTwo, 5.99m);

        var mismatchedResult = service.Calculate(mismatchedBill);

        Assert.False(mismatchedResult.Succeeded);
        Assert.Equal("payer_contribution_total_mismatch", mismatchedResult.Code);
    }

    [Fact]
    public void PayerContributionsRequirePresentUniqueNonNegativePayers()
    {
        var missingPayerBill = CreateBill();
        AddItem(
            missingPayerBill,
            10.00m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo)
            ]);
        AddPayer(missingPayerBill, Guid.Empty, 10.00m);

        var missingPayerResult = service.Calculate(missingPayerBill);

        Assert.False(missingPayerResult.Succeeded);
        Assert.Equal("invalid_payer", missingPayerResult.Code);

        var duplicatePayerBill = CreateBill();
        AddItem(
            duplicatePayerBill,
            10.00m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo)
            ]);
        AddPayer(duplicatePayerBill, ParticipantOne, 5.00m);
        AddPayer(duplicatePayerBill, ParticipantOne, 5.00m);

        var duplicatePayerResult = service.Calculate(duplicatePayerBill);

        Assert.False(duplicatePayerResult.Succeeded);
        Assert.Equal("invalid_payer", duplicatePayerResult.Code);

        var negativePayerBill = CreateBill();
        AddItem(
            negativePayerBill,
            10.00m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo)
            ]);
        AddPayer(negativePayerBill, ParticipantOne, -10.00m);

        var negativePayerResult = service.Calculate(negativePayerBill);

        Assert.False(negativePayerResult.Succeeded);
        Assert.Equal("negative_amount_not_allowed", negativePayerResult.Code);
    }

    [Fact]
    public void DeletedItemsAreIgnoredWhenResolvingBillTotalsAndParticipantShares()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            6.00m,
            ExpenseBillItemSplitMethods.ExactAmount,
            [
                Split(ParticipantOne, 2.00m),
                Split(ParticipantTwo, 4.00m)
            ],
            sortOrder: 1);
        AddItem(
            bill,
            100.00m,
            ExpenseBillItemSplitMethods.Equal,
            [Split(ParticipantThree)],
            sortOrder: 2,
            deleted: true);

        var result = service.Calculate(bill);

        AssertSucceeded(result);
        AssertMoney(6.00m, "USD", result.BillTotal!);
        Assert.Equal(2, result.ItemSplits.Count);
        AssertParticipantShare(result, ParticipantOne, 2.00m, allocationOrder: 0);
        AssertParticipantShare(result, ParticipantTwo, 4.00m, allocationOrder: 1);
        Assert.DoesNotContain(result.ParticipantShares, share => share.UserProfileId == ParticipantThree);
    }

    [Fact]
    public void NoActiveItemsFailClearly()
    {
        var bill = CreateBill();
        AddItem(
            bill,
            10.00m,
            ExpenseBillItemSplitMethods.Equal,
            [
                Split(ParticipantOne),
                Split(ParticipantTwo)
            ],
            deleted: true);

        var result = service.Calculate(bill);

        Assert.False(result.Succeeded);
        Assert.Equal("no_active_items", result.Code);
    }

    private static ExpenseBill CreateBill(
        string currency = "USD",
        params Guid[] participantIds)
    {
        var bill = new ExpenseBill
        {
            Id = StableGuid(100),
            CreatedByUserProfileId = participantIds.FirstOrDefault(ParticipantOne),
            BillDate = new DateOnly(2026, 5, 7),
            Status = ExpenseBillStatuses.Draft,
            TotalAmount = 0m,
            TotalCurrency = currency,
            CreatedAtUtc = DateTimeOffset.UnixEpoch,
            UpdatedAtUtc = DateTimeOffset.UnixEpoch
        };

        foreach (var participantId in participantIds)
        {
            bill.Participants.Add(new ExpenseBillParticipant
            {
                ExpenseBillId = bill.Id,
                UserProfileId = participantId,
                Status = ExpenseBillParticipantStatuses.PendingAcceptance,
                ResolvedShareAmount = 0m,
                ResolvedShareCurrency = currency,
                CreatedAtUtc = DateTimeOffset.UnixEpoch,
                UpdatedAtUtc = DateTimeOffset.UnixEpoch
            });
        }

        return bill;
    }

    private static ExpenseBillItem AddItem(
        ExpenseBill bill,
        decimal amount,
        string splitMethod,
        IReadOnlyList<SplitInput> splits,
        int sortOrder = 0,
        string currency = "USD",
        bool deleted = false)
    {
        var item = new ExpenseBillItem
        {
            Id = StableGuid(200 + sortOrder),
            ExpenseBillId = bill.Id,
            Name = $"Item {sortOrder}",
            Amount = amount,
            Currency = currency,
            SortOrder = sortOrder,
            CreatedAtUtc = DateTimeOffset.UnixEpoch,
            UpdatedAtUtc = DateTimeOffset.UnixEpoch,
            DeletedAtUtc = deleted ? DateTimeOffset.UnixEpoch.AddDays(1) : null
        };

        for (var index = 0; index < splits.Count; index++)
        {
            var split = splits[index];
            item.Splits.Add(new ExpenseBillItemSplit
            {
                Id = StableGuid(1_000 + sortOrder * 10 + index),
                ExpenseBillItemId = item.Id,
                UserProfileId = split.UserProfileId,
                SplitMethod = splitMethod,
                BasisValue = split.BasisValue,
                ResolvedAmount = 0m,
                ResolvedCurrency = currency,
                AllocationOrder = split.AllocationOrder ?? index,
                CreatedAtUtc = DateTimeOffset.UnixEpoch,
                UpdatedAtUtc = DateTimeOffset.UnixEpoch
            });
        }

        bill.Items.Add(item);
        return item;
    }

    private static ExpenseBillAdjustment AddAdjustment(
        ExpenseBill bill,
        decimal amount,
        string direction,
        string allocationMethod,
        string currency = "USD")
    {
        var adjustment = new ExpenseBillAdjustment
        {
            Id = StableGuid(400 + bill.Adjustments.Count),
            ExpenseBillId = bill.Id,
            Type = ExpenseBillAdjustmentTypes.ManualAdjustment,
            Direction = direction,
            AllocationMethod = allocationMethod,
            Amount = amount,
            Currency = currency,
            SortOrder = bill.Adjustments.Count,
            CreatedAtUtc = DateTimeOffset.UnixEpoch,
            UpdatedAtUtc = DateTimeOffset.UnixEpoch
        };

        bill.Adjustments.Add(adjustment);
        return adjustment;
    }

    private static ExpenseBillPayer AddPayer(
        ExpenseBill bill,
        Guid participantId,
        decimal amount,
        string currency = "USD")
    {
        var payer = new ExpenseBillPayer
        {
            Id = StableGuid(500 + bill.Payers.Count),
            ExpenseBillId = bill.Id,
            UserProfileId = participantId,
            Amount = amount,
            Currency = currency,
            CreatedAtUtc = DateTimeOffset.UnixEpoch,
            UpdatedAtUtc = DateTimeOffset.UnixEpoch
        };

        bill.Payers.Add(payer);
        return payer;
    }

    private static SplitInput Split(
        Guid participantId,
        decimal? basisValue = null,
        int? allocationOrder = null)
    {
        return new SplitInput(participantId, basisValue, allocationOrder);
    }

    private static void AssertSucceeded(ExpenseBillCalculationResult result)
    {
        Assert.True(result.Succeeded, result.Failure?.ToString() ?? result.Code);
    }

    private static void AssertMoney(decimal amount, string currency, MoneyAmount money)
    {
        Assert.Equal(amount, money.Amount);
        Assert.Equal(currency, money.Currency.Value);
    }

    private static void AssertItemSplit(
        ExpenseBillCalculationResult result,
        Guid participantId,
        decimal resolvedAmount,
        bool residual,
        int allocationOrder,
        decimal? basisValue = null)
    {
        var split = Assert.Single(result.ItemSplits, split => split.UserProfileId == participantId);
        Assert.Equal(resolvedAmount, split.ResolvedAmount);
        Assert.Equal("USD", split.ResolvedCurrency);
        Assert.Equal(residual, split.ReceivedResidualMinorUnit);
        Assert.Equal(allocationOrder, split.AllocationOrder);
        Assert.Equal(basisValue, split.BasisValue);
    }

    private static void AssertParticipantShare(
        ExpenseBillCalculationResult result,
        Guid participantId,
        decimal resolvedShareAmount,
        int allocationOrder)
    {
        var share = Assert.Single(result.ParticipantShares, share => share.UserProfileId == participantId);
        Assert.Equal(resolvedShareAmount, share.ResolvedShareAmount);
        Assert.Equal("USD", share.ResolvedShareCurrency);
        Assert.Equal(allocationOrder, share.AllocationOrder);
        Assert.Equal(ExpenseBillParticipantStatuses.PendingAcceptance, share.Status);
    }

    private static void AssertAdjustmentAllocation(
        ExpenseBillCalculationResult result,
        Guid participantId,
        decimal allocatedAmount,
        bool residual)
    {
        var allocation = Assert.Single(
            result.AdjustmentAllocations,
            allocation => allocation.UserProfileId == participantId);
        Assert.Equal(allocatedAmount, allocation.AllocatedAmount);
        Assert.Equal("USD", allocation.Currency);
        Assert.Equal(residual, allocation.ReceivedResidualMinorUnit);
    }

    private static Guid StableGuid(int value)
    {
        return new Guid($"00000000-0000-0000-0000-{value:000000000000}");
    }

    private sealed record SplitInput(
        Guid UserProfileId,
        decimal? BasisValue,
        int? AllocationOrder);
}
