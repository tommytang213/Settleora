using Settleora.Api.Domain.Settlements;

namespace Settleora.Api.Tests;

public sealed class SettlementResidualPolicyServiceTests
{
    private readonly SettlementResidualPolicyService service = new();

    [Fact]
    public void ExactPaymentCreatesNoResidualDecisionAndZeroDelta()
    {
        var result = service.Decide(
            exactSelectedTotal: 246.90m,
            exactSelectedCurrency: "USD",
            actualPaidAmount: 246.90m,
            actualPaidCurrency: "USD",
            proposedResidualPolicy: null);

        Assert.True(result.Succeeded);
        Assert.Equal("valid", result.Code);
        Assert.NotNull(result.Decision);
        Assert.Equal(SettlementResidualPaymentClassification.Exact, result.Decision!.Classification);
        Assert.Equal(0m, result.Decision.DeltaAmount);
        Assert.Equal("USD", result.Decision.Currency);
        Assert.Null(result.Decision.Residual);
    }

    [Theory]
    [MemberData(nameof(SupportedResidualPolicyCases))]
    public void SupportedResidualPoliciesMapToDirectionStatusAndReceiverConfirmationExpectations(
        decimal exactSelectedTotal,
        decimal actualPaidAmount,
        string policy,
        string expectedClassification,
        string expectedDirection,
        decimal expectedDelta,
        decimal expectedResidualAmount,
        string expectedReceiverConfirmedStatus)
    {
        var result = service.Decide(
            exactSelectedTotal,
            "USD",
            actualPaidAmount,
            "USD",
            policy);

        Assert.True(result.Succeeded);
        Assert.NotNull(result.Decision);
        Assert.Equal(expectedClassification, result.Decision!.Classification.ToString());
        Assert.Equal(expectedDelta, result.Decision.DeltaAmount);
        Assert.NotNull(result.Decision.Residual);
        Assert.Equal(expectedDirection, result.Decision.Residual!.Direction);
        Assert.Equal(expectedResidualAmount, result.Decision.Residual.Amount);
        Assert.Equal("USD", result.Decision.Residual.Currency);
        Assert.Equal(policy, result.Decision.Residual.Policy);
        Assert.Equal(
            SettlementResidualStatuses.PendingReceiverConfirmation,
            result.Decision.Residual.InitialStatus);
        Assert.Equal(expectedReceiverConfirmedStatus, result.Decision.Residual.ReceiverConfirmedStatus);
        Assert.True(result.Decision.Residual.RequiresReceiverConfirmation);
        Assert.False(result.Decision.Residual.AllowsDebtClearingBeforeReceiverConfirmation);
        Assert.True(result.Decision.Residual.RequiresExplicitResidualRecord);
    }

    [Fact]
    public void UnderpaymentDeltaIsCalculatedCorrectly()
    {
        var result = service.Decide(
            exactSelectedTotal: 246.90m,
            exactSelectedCurrency: "HKD",
            actualPaidAmount: 246.00m,
            actualPaidCurrency: "HKD",
            proposedResidualPolicy: SettlementResidualPolicies.RemainingBalance);

        Assert.True(result.Succeeded);
        Assert.NotNull(result.Decision);
        Assert.Equal(SettlementResidualPaymentClassification.Underpayment, result.Decision!.Classification);
        Assert.Equal(-0.90m, result.Decision.DeltaAmount);
        Assert.NotNull(result.Decision.Residual);
        Assert.Equal(0.90m, result.Decision.Residual!.Amount);
        Assert.Equal(SettlementResidualDirections.Underpayment, result.Decision.Residual.Direction);
    }

    [Fact]
    public void OverpaymentDeltaIsCalculatedCorrectly()
    {
        var result = service.Decide(
            exactSelectedTotal: 246.90m,
            exactSelectedCurrency: "HKD",
            actualPaidAmount: 247.00m,
            actualPaidCurrency: "HKD",
            proposedResidualPolicy: SettlementResidualPolicies.CreditForward);

        Assert.True(result.Succeeded);
        Assert.NotNull(result.Decision);
        Assert.Equal(SettlementResidualPaymentClassification.Overpayment, result.Decision!.Classification);
        Assert.Equal(0.10m, result.Decision.DeltaAmount);
        Assert.NotNull(result.Decision.Residual);
        Assert.Equal(0.10m, result.Decision.Residual!.Amount);
        Assert.Equal(SettlementResidualDirections.Overpayment, result.Decision.Residual.Direction);
    }

    [Fact]
    public void CurrencyMismatchIsRejected()
    {
        var result = service.Decide(
            exactSelectedTotal: 10m,
            exactSelectedCurrency: "USD",
            actualPaidAmount: 10m,
            actualPaidCurrency: "HKD",
            proposedResidualPolicy: null);

        AssertPolicyFailure(
            result,
            SettlementResidualPolicyFailureReason.CurrencyMismatch,
            "currency_mismatch",
            "actualPaidCurrency");
    }

    [Theory]
    [InlineData("ZZZ", nameof(SettlementResidualPolicyFailureReason.UnsupportedCurrency), "unsupported_currency")]
    [InlineData("usd", nameof(SettlementResidualPolicyFailureReason.InvalidCurrencyFormat), "invalid_currency_format")]
    public void InvalidOrUnsupportedCurrencyIsRejected(
        string currency,
        string expectedReason,
        string expectedCode)
    {
        var result = service.Decide(
            exactSelectedTotal: 10m,
            exactSelectedCurrency: currency,
            actualPaidAmount: 10m,
            actualPaidCurrency: currency,
            proposedResidualPolicy: null);

        AssertPolicyFailure(result, expectedReason, expectedCode, "exactSelectedCurrency");
    }

    [Theory]
    [InlineData(0, nameof(SettlementResidualPolicyFailureReason.ZeroAmountNotAllowed), "zero_amount_not_allowed")]
    [InlineData(-1, nameof(SettlementResidualPolicyFailureReason.NegativeAmountNotAllowed), "negative_amount_not_allowed")]
    public void ZeroOrNegativeSelectedTotalIsRejected(
        decimal selectedTotal,
        string expectedReason,
        string expectedCode)
    {
        var result = service.Decide(
            exactSelectedTotal: selectedTotal,
            exactSelectedCurrency: "USD",
            actualPaidAmount: 10m,
            actualPaidCurrency: "USD",
            proposedResidualPolicy: null);

        AssertPolicyFailure(result, expectedReason, expectedCode, "exactSelectedTotal");
    }

    [Theory]
    [InlineData(0, nameof(SettlementResidualPolicyFailureReason.ZeroAmountNotAllowed), "zero_amount_not_allowed")]
    [InlineData(-1, nameof(SettlementResidualPolicyFailureReason.NegativeAmountNotAllowed), "negative_amount_not_allowed")]
    public void ZeroOrNegativeActualPaidAmountIsRejected(
        decimal actualPaidAmount,
        string expectedReason,
        string expectedCode)
    {
        var result = service.Decide(
            exactSelectedTotal: 10m,
            exactSelectedCurrency: "USD",
            actualPaidAmount: actualPaidAmount,
            actualPaidCurrency: "USD",
            proposedResidualPolicy: SettlementResidualPolicies.RemainingBalance);

        AssertPolicyFailure(result, expectedReason, expectedCode, "actualPaidAmount");
    }

    [Theory]
    [InlineData("selected")]
    [InlineData("actual")]
    public void AmountsOverSettlementMoneyMaximumAreRejected(string overLimitInput)
    {
        var overLimitAmount = SettlementConstraints.MoneyAmountMaxValue + 0.0001m;
        var selectedTotal = overLimitInput == "selected" ? overLimitAmount : 10m;
        var actualPaidAmount = overLimitInput == "actual" ? overLimitAmount : 9m;

        var result = service.Decide(
            exactSelectedTotal: selectedTotal,
            exactSelectedCurrency: "USD",
            actualPaidAmount: actualPaidAmount,
            actualPaidCurrency: "USD",
            proposedResidualPolicy: SettlementResidualPolicies.RemainingBalance);

        AssertPolicyFailure(
            result,
            SettlementResidualPolicyFailureReason.AmountOutOfRange,
            "amount_out_of_range",
            overLimitInput == "selected" ? "exactSelectedTotal" : "actualPaidAmount");
    }

    [Theory]
    [InlineData(100, 99, SettlementResidualPolicies.CreditForward)]
    [InlineData(100, 99, SettlementResidualPolicies.WaivedByPayer)]
    [InlineData(100, 99, SettlementResidualPolicies.AppliedToOtherLine)]
    [InlineData(100, 101, SettlementResidualPolicies.RemainingBalance)]
    [InlineData(100, 101, SettlementResidualPolicies.CarriedForward)]
    [InlineData(100, 101, SettlementResidualPolicies.Waived)]
    [InlineData(100, 101, SettlementResidualPolicies.AppliedToOtherLine)]
    public void UnsupportedPolicyDirectionCombinationsAreRejected(
        decimal exactSelectedTotal,
        decimal actualPaidAmount,
        string policy)
    {
        var result = service.Decide(
            exactSelectedTotal,
            "USD",
            actualPaidAmount,
            "USD",
            policy);

        AssertPolicyFailure(
            result,
            SettlementResidualPolicyFailureReason.UnsupportedResidualPolicyDirection,
            "unsupported_residual_policy_direction",
            "proposedResidualPolicy");
    }

    [Fact]
    public void UnsupportedPolicyValueIsRejected()
    {
        var result = service.Decide(
            exactSelectedTotal: 100m,
            exactSelectedCurrency: "USD",
            actualPaidAmount: 99m,
            actualPaidCurrency: "USD",
            proposedResidualPolicy: "silently_discarded");

        AssertPolicyFailure(
            result,
            SettlementResidualPolicyFailureReason.UnsupportedResidualPolicy,
            "unsupported_residual_policy",
            "proposedResidualPolicy");
    }

    [Fact]
    public void PayerCannotUnilaterallyWaiveUnderpaymentAsFullyCleared()
    {
        var result = service.Decide(
            exactSelectedTotal: 100m,
            exactSelectedCurrency: "USD",
            actualPaidAmount: 99.99m,
            actualPaidCurrency: "USD",
            proposedResidualPolicy: SettlementResidualPolicies.Waived);

        Assert.True(result.Succeeded);
        Assert.NotNull(result.Decision?.Residual);
        Assert.Equal(SettlementResidualDirections.Underpayment, result.Decision!.Residual!.Direction);
        Assert.Equal(SettlementResidualPolicies.Waived, result.Decision.Residual.Policy);
        Assert.Equal(
            SettlementResidualStatuses.PendingReceiverConfirmation,
            result.Decision.Residual.InitialStatus);
        Assert.Equal(SettlementResidualStatuses.Waived, result.Decision.Residual.ReceiverConfirmedStatus);
        Assert.True(result.Decision.Residual.RequiresReceiverConfirmation);
        Assert.False(result.Decision.Residual.AllowsDebtClearingBeforeReceiverConfirmation);
    }

    [Fact]
    public void OverpaymentRequiresExplicitResidualPolicyAndIsNotSilentlyDiscarded()
    {
        var missingPolicyResult = service.Decide(
            exactSelectedTotal: 100m,
            exactSelectedCurrency: "USD",
            actualPaidAmount: 100.10m,
            actualPaidCurrency: "USD",
            proposedResidualPolicy: null);
        AssertPolicyFailure(
            missingPolicyResult,
            SettlementResidualPolicyFailureReason.MissingResidualPolicy,
            "missing_residual_policy",
            "proposedResidualPolicy");

        var explicitPolicyResult = service.Decide(
            exactSelectedTotal: 100m,
            exactSelectedCurrency: "USD",
            actualPaidAmount: 100.10m,
            actualPaidCurrency: "USD",
            proposedResidualPolicy: SettlementResidualPolicies.WaivedByPayer);

        Assert.True(explicitPolicyResult.Succeeded);
        Assert.NotNull(explicitPolicyResult.Decision?.Residual);
        Assert.Equal(0.10m, explicitPolicyResult.Decision!.Residual!.Amount);
        Assert.Equal(SettlementResidualDirections.Overpayment, explicitPolicyResult.Decision.Residual.Direction);
        Assert.True(explicitPolicyResult.Decision.Residual.RequiresExplicitResidualRecord);
    }

    public static IEnumerable<object[]> SupportedResidualPolicyCases()
    {
        yield return
        [
            100m,
            99m,
            SettlementResidualPolicies.RemainingBalance,
            nameof(SettlementResidualPaymentClassification.Underpayment),
            SettlementResidualDirections.Underpayment,
            -1m,
            1m,
            SettlementResidualStatuses.Confirmed
        ];
        yield return
        [
            100m,
            99m,
            SettlementResidualPolicies.CarriedForward,
            nameof(SettlementResidualPaymentClassification.Underpayment),
            SettlementResidualDirections.Underpayment,
            -1m,
            1m,
            SettlementResidualStatuses.CarriedForward
        ];
        yield return
        [
            100m,
            99m,
            SettlementResidualPolicies.Waived,
            nameof(SettlementResidualPaymentClassification.Underpayment),
            SettlementResidualDirections.Underpayment,
            -1m,
            1m,
            SettlementResidualStatuses.Waived
        ];
        yield return
        [
            100m,
            101m,
            SettlementResidualPolicies.CreditForward,
            nameof(SettlementResidualPaymentClassification.Overpayment),
            SettlementResidualDirections.Overpayment,
            1m,
            1m,
            SettlementResidualStatuses.Credited
        ];
        yield return
        [
            100m,
            101m,
            SettlementResidualPolicies.WaivedByPayer,
            nameof(SettlementResidualPaymentClassification.Overpayment),
            SettlementResidualDirections.Overpayment,
            1m,
            1m,
            SettlementResidualStatuses.Waived
        ];
    }

    private static void AssertPolicyFailure(
        SettlementResidualPolicyResult result,
        SettlementResidualPolicyFailureReason expectedReason,
        string expectedCode,
        string expectedField)
    {
        AssertPolicyFailure(
            result,
            expectedReason.ToString(),
            expectedCode,
            expectedField);
    }

    private static void AssertPolicyFailure(
        SettlementResidualPolicyResult result,
        string expectedReason,
        string expectedCode,
        string expectedField)
    {
        Assert.False(result.Succeeded);
        Assert.Null(result.Decision);
        Assert.NotNull(result.Failure);
        Assert.Equal(expectedReason, result.Failure!.Reason.ToString());
        Assert.Equal(expectedCode, result.Code);
        Assert.Equal(expectedField, result.Failure.Field);
    }
}
