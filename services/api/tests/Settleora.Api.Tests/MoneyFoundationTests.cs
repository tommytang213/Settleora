using System.Globalization;
using Settleora.Api.Money;

namespace Settleora.Api.Tests;

public sealed class MoneyFoundationTests
{
    [Theory]
    [InlineData("HKD")]
    [InlineData("USD")]
    [InlineData("JPY")]
    public void CurrencyCodeAcceptsUppercaseThreeLetterCodes(string submittedCurrency)
    {
        var accepted = CurrencyCode.TryCreate(submittedCurrency, out var currencyCode);

        Assert.True(accepted);
        Assert.Equal(submittedCurrency, currencyCode.Value);
        Assert.Equal(submittedCurrency, currencyCode.ToString());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("usd")]
    [InlineData("Usd")]
    [InlineData("US")]
    [InlineData("USDD")]
    [InlineData(" US")]
    [InlineData("US ")]
    [InlineData(" USD ")]
    [InlineData("U$D")]
    [InlineData("12D")]
    [InlineData("123")]
    public void CurrencyCodeRejectsInvalidFormats(string? submittedCurrency)
    {
        var accepted = CurrencyCode.TryCreate(submittedCurrency, out _);

        Assert.False(accepted);
    }

    [Fact]
    public void MoneyParserReturnsStableInvalidCurrencyFormatCode()
    {
        var validationResult = MoneyAmount.TryParse(
            "12.34",
            "usd",
            MoneyValidationOptions.Default,
            SupportedCurrencyPolicy.Default,
            out _);

        Assert.False(validationResult.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.InvalidCurrencyFormat, validationResult.FailureReason);
        Assert.Equal("invalid_currency_format", validationResult.Code);
        Assert.Equal("currency", validationResult.Field);
    }

    [Theory]
    [InlineData("JPY", 0)]
    [InlineData("HKD", 2)]
    [InlineData("USD", 2)]
    [InlineData("EUR", 2)]
    [InlineData("GBP", 2)]
    [InlineData("KWD", 3)]
    [InlineData("BHD", 3)]
    public void SupportedCurrencyPolicyReturnsMinorUnits(string submittedCurrency, int expectedMinorUnits)
    {
        var currency = CreateCurrency(submittedCurrency);
        var policy = SupportedCurrencyPolicy.Default;

        var supported = policy.TryGetMinorUnitDigits(currency, out var minorUnits);

        Assert.True(supported);
        Assert.True(policy.IsSupported(currency));
        Assert.Equal(expectedMinorUnits, minorUnits);
    }

    [Fact]
    public void UnsupportedCurrencyIsRejectedForAuthoritativeValidation()
    {
        var currency = CreateCurrency("ZZZ");
        var validationResult = SupportedCurrencyPolicy.Default.ValidateSupported(currency);

        Assert.False(validationResult.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.UnsupportedCurrency, validationResult.FailureReason);
        Assert.Equal("unsupported_currency", validationResult.Code);
    }

    [Fact]
    public void MoneyParserRejectsUnsupportedCurrencyDuringAuthoritativeValidation()
    {
        var validationResult = MoneyAmount.TryParse(
            "12.34",
            "ZZZ",
            MoneyValidationOptions.Default,
            SupportedCurrencyPolicy.Default,
            out _);

        Assert.False(validationResult.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.UnsupportedCurrency, validationResult.FailureReason);
        Assert.Equal("unsupported_currency", validationResult.Code);
        Assert.Equal("currency", validationResult.Field);
    }

    [Theory]
    [InlineData("12", "12")]
    [InlineData("12.34", "12.34")]
    [InlineData("0.01", "0.01")]
    [InlineData("-12.34", "-12.34")]
    [InlineData("00012.3400", "12.3400")]
    public void DecimalStringParserAcceptsPlainBaseTenStrings(string submittedAmount, string expectedAmount)
    {
        var validationResult = MoneyAmount.TryParse(
            submittedAmount,
            CreateCurrency("HKD"),
            MoneyValidationOptions.Default with { AllowNegative = true },
            SupportedCurrencyPolicy.Default,
            out var moneyAmount);

        Assert.True(validationResult.Succeeded);
        Assert.Equal(decimal.Parse(expectedAmount, CultureInfo.InvariantCulture), moneyAmount.Amount);
        Assert.Equal("HKD", moneyAmount.Currency.Value);
    }

    [Theory]
    [InlineData("1e2")]
    [InlineData("1E2")]
    [InlineData("1,000.00")]
    [InlineData("$12.34")]
    [InlineData(" 12.34")]
    [InlineData("12.34 ")]
    [InlineData("")]
    [InlineData("NaN")]
    [InlineData("Infinity")]
    [InlineData("+12.34")]
    [InlineData(".34")]
    [InlineData("12.")]
    public void DecimalStringParserRejectsNonPlainDecimalFormats(string submittedAmount)
    {
        var validationResult = MoneyAmount.TryParse(
            submittedAmount,
            CreateCurrency("USD"),
            MoneyValidationOptions.Default,
            SupportedCurrencyPolicy.Default,
            out _);

        Assert.False(validationResult.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.InvalidDecimalFormat, validationResult.FailureReason);
        Assert.Equal("invalid_decimal_format", validationResult.Code);
        if (submittedAmount.Length > 0)
        {
            Assert.DoesNotContain(submittedAmount, validationResult.ToString(), StringComparison.Ordinal);
        }
    }

    [Fact]
    public void DecimalStringParserUsesInvariantCulture()
    {
        var originalCulture = CultureInfo.CurrentCulture;
        var originalUiCulture = CultureInfo.CurrentUICulture;

        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("fr-FR");
            CultureInfo.CurrentUICulture = CultureInfo.GetCultureInfo("fr-FR");

            var acceptedResult = MoneyAmount.TryParse(
                "12.34",
                CreateCurrency("EUR"),
                MoneyValidationOptions.Default,
                SupportedCurrencyPolicy.Default,
                out var acceptedAmount);
            var rejectedResult = MoneyAmount.TryParse(
                "12,34",
                CreateCurrency("EUR"),
                MoneyValidationOptions.Default,
                SupportedCurrencyPolicy.Default,
                out _);

            Assert.True(acceptedResult.Succeeded);
            Assert.Equal(12.34m, acceptedAmount.Amount);
            Assert.False(rejectedResult.Succeeded);
            Assert.Equal(MoneyValidationFailureReason.InvalidDecimalFormat, rejectedResult.FailureReason);
        }
        finally
        {
            CultureInfo.CurrentCulture = originalCulture;
            CultureInfo.CurrentUICulture = originalUiCulture;
        }
    }

    [Fact]
    public void AmountBoundsAreEnforced()
    {
        var currency = CreateCurrency("USD");
        var acceptedResult = MoneyAmount.TryParse(
            "999999999999999.9999",
            currency,
            MoneyValidationOptions.Default,
            SupportedCurrencyPolicy.Default,
            out var acceptedAmount);
        var rejectedResult = MoneyAmount.TryParse(
            "1000000000000000.0000",
            currency,
            MoneyValidationOptions.Default,
            SupportedCurrencyPolicy.Default,
            out _);
        var negativeAcceptedResult = MoneyAmount.TryParse(
            "-999999999999999.9999",
            currency,
            MoneyValidationOptions.Default with { AllowNegative = true },
            SupportedCurrencyPolicy.Default,
            out var negativeAcceptedAmount);
        var negativeRejectedResult = MoneyAmount.TryParse(
            "-1000000000000000.0000",
            currency,
            MoneyValidationOptions.Default with { AllowNegative = true },
            SupportedCurrencyPolicy.Default,
            out _);

        Assert.True(acceptedResult.Succeeded);
        Assert.Equal(MoneyAmount.MaxAbsStorageAmount, acceptedAmount.Amount);
        Assert.False(rejectedResult.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.AmountOutOfRange, rejectedResult.FailureReason);
        Assert.Equal("amount_out_of_range", rejectedResult.Code);
        Assert.True(negativeAcceptedResult.Succeeded);
        Assert.Equal(-MoneyAmount.MaxAbsStorageAmount, negativeAcceptedAmount.Amount);
        Assert.False(negativeRejectedResult.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.AmountOutOfRange, negativeRejectedResult.FailureReason);
        Assert.Equal("amount_out_of_range", negativeRejectedResult.Code);
    }

    [Fact]
    public void TooManyFractionalDigitsAreRejectedWhenOperationPolicyRequiresIt()
    {
        var validationResult = MoneyAmount.TryParse(
            "12.345",
            CreateCurrency("HKD"),
            MoneyValidationOptions.Default with { MaxFractionalDigits = 2 },
            SupportedCurrencyPolicy.Default,
            out _);

        Assert.False(validationResult.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.TooManyFractionalDigits, validationResult.FailureReason);
        Assert.Equal("too_many_fractional_digits", validationResult.Code);
    }

    [Fact]
    public void FractionalScaleValidationCountsSubmittedTrailingZeros()
    {
        var validationResult = MoneyAmount.TryParse(
            "12.340",
            CreateCurrency("HKD"),
            MoneyValidationOptions.Default with { MaxFractionalDigits = 2 },
            SupportedCurrencyPolicy.Default,
            out _);

        Assert.False(validationResult.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.TooManyFractionalDigits, validationResult.FailureReason);
        Assert.Equal("too_many_fractional_digits", validationResult.Code);
    }

    [Fact]
    public void StorageScaleValidationRejectsMoreThanFourFractionalDigits()
    {
        var validationResult = MoneyAmount.TryParse(
            "12.34567",
            CreateCurrency("HKD"),
            MoneyValidationOptions.Default with { MaxFractionalDigits = null },
            SupportedCurrencyPolicy.Default,
            out _);

        Assert.False(validationResult.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.TooManyFractionalDigits, validationResult.FailureReason);
        Assert.Equal("too_many_fractional_digits", validationResult.Code);
    }

    [Fact]
    public void NegativeAndZeroPolicyOptionsBehaveCorrectly()
    {
        var currency = CreateCurrency("HKD");

        var negativeRejected = MoneyAmount.TryParse(
            "-0.01",
            currency,
            MoneyValidationOptions.Default,
            SupportedCurrencyPolicy.Default,
            out _);
        var negativeAccepted = MoneyAmount.TryParse(
            "-0.01",
            currency,
            MoneyValidationOptions.Default with { AllowNegative = true },
            SupportedCurrencyPolicy.Default,
            out var negativeAmount);
        var zeroRejected = MoneyAmount.TryParse(
            "0.00",
            currency,
            MoneyValidationOptions.Default with { AllowZero = false },
            SupportedCurrencyPolicy.Default,
            out _);
        var zeroAccepted = MoneyAmount.TryParse(
            "0.00",
            currency,
            MoneyValidationOptions.Default,
            SupportedCurrencyPolicy.Default,
            out var zeroAmount);

        Assert.False(negativeRejected.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.NegativeAmountNotAllowed, negativeRejected.FailureReason);
        Assert.True(negativeAccepted.Succeeded);
        Assert.Equal(-0.01m, negativeAmount.Amount);
        Assert.False(zeroRejected.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.ZeroAmountNotAllowed, zeroRejected.FailureReason);
        Assert.True(zeroAccepted.Succeeded);
        Assert.Equal(0.00m, zeroAmount.Amount);
    }

    [Fact]
    public void NearestRoundingUsesExplicitMidpointToEvenBehavior()
    {
        var service = new MoneyRoundingService();

        var roundedDownToEven = service.Round(2.345m, 2, MoneyRoundingMode.NearestToEven);
        var roundedUpToEven = service.Round(2.355m, 2, MoneyRoundingMode.NearestToEven);

        Assert.Equal(2.34m, roundedDownToEven);
        Assert.Equal(2.36m, roundedUpToEven);
    }

    [Fact]
    public void RoundUpAndRoundDownAreDeterministicForPositiveAndNegativeValues()
    {
        var service = new MoneyRoundingService();

        Assert.Equal(1.24m, service.Round(1.231m, 2, MoneyRoundingMode.RoundUp));
        Assert.Equal(1.23m, service.Round(1.231m, 2, MoneyRoundingMode.RoundDown));
        Assert.Equal(-1.23m, service.Round(-1.231m, 2, MoneyRoundingMode.RoundUp));
        Assert.Equal(-1.24m, service.Round(-1.231m, 2, MoneyRoundingMode.RoundDown));
    }

    [Fact]
    public void CurrencyMinorUnitRoundingUsesSupportedCurrencyScale()
    {
        var service = new MoneyRoundingService();

        AssertMoney(13m, "JPY", service.RoundToCurrencyMinorUnits(Money("12.60", "JPY")));
        AssertMoney(12.34m, "HKD", service.RoundToCurrencyMinorUnits(Money("12.345", "HKD")));
        AssertMoney(12.34m, "USD", service.RoundToCurrencyMinorUnits(Money("12.345", "USD")));
        AssertMoney(12.34m, "EUR", service.RoundToCurrencyMinorUnits(Money("12.345", "EUR")));
        AssertMoney(12.34m, "GBP", service.RoundToCurrencyMinorUnits(Money("12.345", "GBP")));
        AssertMoney(12.346m, "KWD", service.RoundToCurrencyMinorUnits(Money("12.3456", "KWD")));
        AssertMoney(12.346m, "BHD", service.RoundToCurrencyMinorUnits(Money("12.3456", "BHD")));
    }

    [Fact]
    public void CurrencyMinorUnitRoundingRejectsValuesThatRoundPastStorageBounds()
    {
        var service = new MoneyRoundingService();
        var amount = new MoneyAmount(MoneyAmount.MaxAbsStorageAmount, CreateCurrency("USD"));

        var rounded = service.TryRoundToCurrencyMinorUnits(
            amount,
            MoneyRoundingMode.NearestToEven,
            out _,
            out var validationResult);

        Assert.False(rounded);
        Assert.Equal(MoneyValidationFailureReason.AmountOutOfRange, validationResult.FailureReason);
        Assert.Equal("amount_out_of_range", validationResult.Code);
    }

    [Fact]
    public void StorageScaleRoundingUsesNumericNineteenFourDirection()
    {
        var service = new MoneyRoundingService();

        var roundedAmount = service.RoundToStorageScale(
            new MoneyAmount(12.34565m, CreateCurrency("HKD")));

        AssertMoney(12.3456m, "HKD", roundedAmount);
    }

    [Fact]
    public void EqualSplitAssignsResidualMinorUnitsByInputOrder()
    {
        var participantKeys = ParticipantKeys(3);
        var service = new MoneyAllocationService();

        var result = service.AllocateEqual(Money("10.00", "HKD"), participantKeys);

        Assert.True(result.Succeeded);
        AssertMoney(10.00m, "HKD", result.RoundedTotal!);
        Assert.Equal(1, result.ResidualMinorUnits);
        Assert.Equal([participantKeys[0]], result.ResidualParticipantKeys);
        AssertAllocationAmounts(result, [3.34m, 3.33m, 3.33m]);
        Assert.True(result.Shares[0].ReceivedResidualMinorUnit);
        Assert.False(result.Shares[1].ReceivedResidualMinorUnit);
        Assert.False(result.Shares[2].ReceivedResidualMinorUnit);
        AssertAllocationSumsToRoundedTotal(result);
    }

    [Fact]
    public void EqualSplitUsesRoundedTotalMinorUnitsForResidualDistribution()
    {
        var participantKeys = ParticipantKeys(2);
        var service = new MoneyAllocationService();

        var result = service.AllocateEqual(Money("10.006", "HKD"), participantKeys);

        Assert.True(result.Succeeded);
        AssertMoney(10.01m, "HKD", result.RoundedTotal!);
        Assert.Equal(1, result.ResidualMinorUnits);
        Assert.Equal([participantKeys[0]], result.ResidualParticipantKeys);
        AssertAllocationAmounts(result, [5.01m, 5.00m]);
        AssertAllocationSumsToRoundedTotal(result);
    }

    [Fact]
    public void EqualSplitRejectsRoundedTotalsThatExceedStorageBounds()
    {
        var participantKeys = ParticipantKeys(1);
        var service = new MoneyAllocationService();

        var result = service.AllocateEqual(
            new MoneyAmount(MoneyAmount.MaxAbsStorageAmount, CreateCurrency("USD")),
            participantKeys);

        Assert.False(result.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.AmountOutOfRange, result.ValidationResult.FailureReason);
        Assert.Equal("amount_out_of_range", result.Code);
    }

    [Fact]
    public void RatioSplitUsesLargestRemainderWithDeterministicTieBreak()
    {
        var participantKeys = ParticipantKeys(3);
        var weights = new[]
        {
            new MoneyAllocationWeight(participantKeys[0], 5),
            new MoneyAllocationWeight(participantKeys[1], 3),
            new MoneyAllocationWeight(participantKeys[2], 2)
        };
        var service = new MoneyAllocationService();

        var result = service.AllocateByWeights(Money("0.05", "HKD"), weights);

        Assert.True(result.Succeeded);
        Assert.Equal(1, result.ResidualMinorUnits);
        Assert.Equal([participantKeys[0]], result.ResidualParticipantKeys);
        AssertAllocationAmounts(result, [0.03m, 0.01m, 0.01m]);
        AssertAllocationSumsToRoundedTotal(result);
    }

    [Fact]
    public void RatioSplitRejectsZeroAndNegativeWeights()
    {
        var participantKeys = ParticipantKeys(2);
        var service = new MoneyAllocationService();

        var zeroResult = service.AllocateByWeights(
            Money("1.00", "HKD"),
            [
                new MoneyAllocationWeight(participantKeys[0], 1),
                new MoneyAllocationWeight(participantKeys[1], 0)
            ]);
        var negativeResult = service.AllocateByWeights(
            Money("1.00", "HKD"),
            [
                new MoneyAllocationWeight(participantKeys[0], 1),
                new MoneyAllocationWeight(participantKeys[1], -1)
            ]);

        Assert.False(zeroResult.Succeeded);
        Assert.False(negativeResult.Succeeded);
        Assert.Equal("invalid_split_weight", zeroResult.Code);
        Assert.Equal("invalid_split_weight", negativeResult.Code);
    }

    [Fact]
    public void AllocationRejectsEmptyParticipants()
    {
        var service = new MoneyAllocationService();

        var result = service.AllocateEqual(Money("1.00", "USD"), []);

        Assert.False(result.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.InvalidSplitParticipant, result.ValidationResult.FailureReason);
        Assert.Equal("invalid_split_participant", result.Code);
    }

    [Fact]
    public void AllocationRejectsDuplicateParticipants()
    {
        var participantKeys = ParticipantKeys(2);
        var service = new MoneyAllocationService();

        var result = service.AllocateEqual(
            Money("1.00", "USD"),
            [participantKeys[0], participantKeys[0]]);

        Assert.False(result.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.InvalidSplitParticipant, result.ValidationResult.FailureReason);
        Assert.Equal("invalid_split_participant", result.Code);
    }

    [Fact]
    public void CustomAmountSplitRequiresRoundedAmountsToMatchRoundedTotalExactly()
    {
        var participantKeys = ParticipantKeys(3);
        var service = new MoneyAllocationService();

        var result = service.AllocateCustom(
            Money("10.00", "HKD"),
            [
                new MoneyCustomAllocationShare(participantKeys[0], Money("3.34", "HKD")),
                new MoneyCustomAllocationShare(participantKeys[1], Money("3.33", "HKD")),
                new MoneyCustomAllocationShare(participantKeys[2], Money("3.33", "HKD"))
            ]);

        Assert.True(result.Succeeded);
        AssertAllocationAmounts(result, [3.34m, 3.33m, 3.33m]);
        AssertAllocationSumsToRoundedTotal(result);
    }

    [Fact]
    public void CustomAmountSplitRejectsMismatchesWithoutSpreadingResiduals()
    {
        var participantKeys = ParticipantKeys(3);
        var service = new MoneyAllocationService();

        var result = service.AllocateCustom(
            Money("10.00", "HKD"),
            [
                new MoneyCustomAllocationShare(participantKeys[0], Money("3.34", "HKD")),
                new MoneyCustomAllocationShare(participantKeys[1], Money("3.33", "HKD")),
                new MoneyCustomAllocationShare(participantKeys[2], Money("3.32", "HKD"))
            ]);

        Assert.False(result.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.CustomSplitTotalMismatch, result.ValidationResult.FailureReason);
        Assert.Equal("custom_split_total_mismatch", result.Code);
        Assert.Empty(result.Shares);
    }

    [Fact]
    public void CustomAmountSplitRejectsCurrencyMismatch()
    {
        var participantKeys = ParticipantKeys(2);
        var service = new MoneyAllocationService();

        var result = service.AllocateCustom(
            Money("10.00", "HKD"),
            [
                new MoneyCustomAllocationShare(participantKeys[0], Money("5.00", "HKD")),
                new MoneyCustomAllocationShare(participantKeys[1], Money("5.00", "USD"))
            ]);

        Assert.False(result.Succeeded);
        Assert.Equal(MoneyValidationFailureReason.CurrencyMismatch, result.ValidationResult.FailureReason);
        Assert.Equal("currency_mismatch", result.Code);
    }

    private static MoneyAmount Money(string amount, string currency)
    {
        var validationResult = MoneyAmount.TryParse(
            amount,
            CreateCurrency(currency),
            MoneyValidationOptions.Default with { AllowNegative = true },
            SupportedCurrencyPolicy.Default,
            out var moneyAmount);

        Assert.True(validationResult.Succeeded);
        return moneyAmount;
    }

    private static CurrencyCode CreateCurrency(string submittedCurrency)
    {
        var accepted = CurrencyCode.TryCreate(submittedCurrency, out var currencyCode);
        Assert.True(accepted);
        return currencyCode;
    }

    private static Guid[] ParticipantKeys(int count)
    {
        return Enumerable.Range(0, count)
            .Select(index => new Guid($"00000000-0000-0000-0000-{index + 1:000000000000}"))
            .ToArray();
    }

    private static void AssertMoney(decimal expectedAmount, string expectedCurrency, MoneyAmount actual)
    {
        Assert.Equal(expectedAmount, actual.Amount);
        Assert.Equal(expectedCurrency, actual.Currency.Value);
    }

    private static void AssertAllocationAmounts(
        MoneyAllocationResult result,
        IReadOnlyList<decimal> expectedAmounts)
    {
        Assert.Equal(expectedAmounts.Count, result.Shares.Count);
        for (var index = 0; index < expectedAmounts.Count; index++)
        {
            AssertMoney(expectedAmounts[index], "HKD", result.Shares[index].Amount);
            Assert.Equal(index, result.Shares[index].InputOrder);
        }
    }

    private static void AssertAllocationSumsToRoundedTotal(MoneyAllocationResult result)
    {
        Assert.NotNull(result.RoundedTotal);
        Assert.Equal(
            result.RoundedTotal.Amount,
            result.Shares.Sum(share => share.Amount.Amount));
        Assert.All(
            result.Shares,
            share => Assert.Equal(result.RoundedTotal.Currency, share.Amount.Currency));
    }
}
