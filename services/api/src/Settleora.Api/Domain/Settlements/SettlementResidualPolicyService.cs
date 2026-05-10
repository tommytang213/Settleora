using Settleora.Api.Money;

namespace Settleora.Api.Domain.Settlements;

internal sealed class SettlementResidualPolicyService
{
    private readonly SupportedCurrencyPolicy supportedCurrencies;

    public SettlementResidualPolicyService()
        : this(SupportedCurrencyPolicy.Default)
    {
    }

    public SettlementResidualPolicyService(SupportedCurrencyPolicy supportedCurrencies)
    {
        this.supportedCurrencies = supportedCurrencies;
    }

    public SettlementResidualPolicyResult Decide(
        decimal exactSelectedTotal,
        string exactSelectedCurrency,
        decimal actualPaidAmount,
        string actualPaidCurrency,
        string? proposedResidualPolicy)
    {
        if (!TryCreateMoney(
                exactSelectedTotal,
                exactSelectedCurrency,
                "exactSelectedTotal",
                "exactSelectedCurrency",
                out var selectedTotal,
                out var failure))
        {
            return SettlementResidualPolicyResult.Failed(failure);
        }

        if (!TryCreateMoney(
                actualPaidAmount,
                actualPaidCurrency,
                "actualPaidAmount",
                "actualPaidCurrency",
                out var actualPaid,
                out failure))
        {
            return SettlementResidualPolicyResult.Failed(failure);
        }

        if (!selectedTotal.Currency.Equals(actualPaid.Currency))
        {
            return SettlementResidualPolicyResult.Failed(SettlementResidualPolicyFailure.Create(
                SettlementResidualPolicyFailureReason.CurrencyMismatch,
                "currency_mismatch",
                "actualPaidCurrency",
                "Exact selected total and actual paid currencies must match."));
        }

        var deltaAmount = actualPaid.Amount - selectedTotal.Amount;
        if (deltaAmount == 0m)
        {
            if (proposedResidualPolicy is not null)
            {
                return SettlementResidualPolicyResult.Failed(SettlementResidualPolicyFailure.Create(
                    SettlementResidualPolicyFailureReason.ResidualPolicyNotAllowedForExactPayment,
                    "residual_policy_not_allowed_for_exact_payment",
                    "proposedResidualPolicy",
                    "Exact payments must not carry residual policy."));
            }

            return SettlementResidualPolicyResult.Success(new SettlementResidualPolicyDecision(
                SettlementResidualPaymentClassification.Exact,
                deltaAmount,
                selectedTotal.Currency.Value,
                Residual: null));
        }

        if (string.IsNullOrWhiteSpace(proposedResidualPolicy))
        {
            return SettlementResidualPolicyResult.Failed(SettlementResidualPolicyFailure.Create(
                SettlementResidualPolicyFailureReason.MissingResidualPolicy,
                "missing_residual_policy",
                "proposedResidualPolicy",
                "Underpayment and overpayment require explicit residual policy."));
        }

        if (!SettlementResidualPolicies.IsSupported(proposedResidualPolicy))
        {
            return SettlementResidualPolicyResult.Failed(SettlementResidualPolicyFailure.Create(
                SettlementResidualPolicyFailureReason.UnsupportedResidualPolicy,
                "unsupported_residual_policy",
                "proposedResidualPolicy",
                "Residual policy is not supported."));
        }

        var direction = deltaAmount < 0m
            ? SettlementResidualDirections.Underpayment
            : SettlementResidualDirections.Overpayment;
        if (!TryCreateResidualDecision(
                direction,
                decimal.Abs(deltaAmount),
                selectedTotal.Currency.Value,
                proposedResidualPolicy,
                out var residualDecision,
                out failure))
        {
            return SettlementResidualPolicyResult.Failed(failure);
        }

        var classification = direction == SettlementResidualDirections.Underpayment
            ? SettlementResidualPaymentClassification.Underpayment
            : SettlementResidualPaymentClassification.Overpayment;

        return SettlementResidualPolicyResult.Success(new SettlementResidualPolicyDecision(
            classification,
            deltaAmount,
            selectedTotal.Currency.Value,
            residualDecision));
    }

    private bool TryCreateMoney(
        decimal amount,
        string currencyValue,
        string amountField,
        string currencyField,
        out MoneyAmount moneyAmount,
        out SettlementResidualPolicyFailure failure)
    {
        moneyAmount = default!;
        failure = default!;

        if (!CurrencyCode.TryCreate(currencyValue, out var currency))
        {
            failure = SettlementResidualPolicyFailure.Create(
                SettlementResidualPolicyFailureReason.InvalidCurrencyFormat,
                "invalid_currency_format",
                currencyField,
                "Currency must be an uppercase three-letter code.");
            return false;
        }

        var supportedResult = supportedCurrencies.ValidateSupported(currency, currencyField);
        if (!supportedResult.Succeeded)
        {
            failure = SettlementResidualPolicyFailure.FromMoney(supportedResult, currencyField);
            return false;
        }

        var validationResult = MoneyAmount.TryCreate(
            amount,
            currency,
            MoneyValidationOptions.Default with
            {
                AllowZero = false,
                AmountField = amountField,
                CurrencyField = currencyField
            },
            supportedCurrencies,
            out moneyAmount);
        if (!validationResult.Succeeded)
        {
            failure = SettlementResidualPolicyFailure.FromMoney(validationResult, validationResult.Field);
            return false;
        }

        if (amount > SettlementConstraints.MoneyAmountMaxValue)
        {
            failure = SettlementResidualPolicyFailure.Create(
                SettlementResidualPolicyFailureReason.AmountOutOfRange,
                "amount_out_of_range",
                amountField,
                "Amount exceeds the supported settlement storage range.");
            return false;
        }

        return true;
    }

    private static bool TryCreateResidualDecision(
        string direction,
        decimal residualAmount,
        string currency,
        string policy,
        out SettlementResidualDecision decision,
        out SettlementResidualPolicyFailure failure)
    {
        decision = default!;
        failure = default!;

        var receiverConfirmedStatus = MapReceiverConfirmedStatus(direction, policy);
        if (receiverConfirmedStatus is null)
        {
            failure = SettlementResidualPolicyFailure.Create(
                SettlementResidualPolicyFailureReason.UnsupportedResidualPolicyDirection,
                "unsupported_residual_policy_direction",
                "proposedResidualPolicy",
                "Residual policy is not supported for the calculated residual direction.");
            return false;
        }

        decision = new SettlementResidualDecision(
            direction,
            residualAmount,
            currency,
            policy,
            SettlementResidualStatuses.PendingReceiverConfirmation,
            receiverConfirmedStatus,
            RequiresReceiverConfirmation: true,
            AllowsDebtClearingBeforeReceiverConfirmation: false,
            RequiresExplicitResidualRecord: true);
        return true;
    }

    private static string? MapReceiverConfirmedStatus(string direction, string policy)
    {
        return direction switch
        {
            SettlementResidualDirections.Underpayment => policy switch
            {
                SettlementResidualPolicies.RemainingBalance => SettlementResidualStatuses.Confirmed,
                SettlementResidualPolicies.CarriedForward => SettlementResidualStatuses.CarriedForward,
                SettlementResidualPolicies.Waived => SettlementResidualStatuses.Waived,
                _ => null
            },
            SettlementResidualDirections.Overpayment => policy switch
            {
                SettlementResidualPolicies.CreditForward => SettlementResidualStatuses.Credited,
                SettlementResidualPolicies.WaivedByPayer => SettlementResidualStatuses.Waived,
                _ => null
            },
            _ => null
        };
    }
}

internal enum SettlementResidualPaymentClassification
{
    Exact = 0,
    Underpayment,
    Overpayment
}

internal sealed class SettlementResidualPolicyResult
{
    private SettlementResidualPolicyResult(
        SettlementResidualPolicyDecision? decision,
        SettlementResidualPolicyFailure? failure)
    {
        Decision = decision;
        Failure = failure;
    }

    public bool Succeeded => Failure is null;

    public string Code => Failure?.Code ?? "valid";

    public SettlementResidualPolicyDecision? Decision { get; }

    public SettlementResidualPolicyFailure? Failure { get; }

    public static SettlementResidualPolicyResult Success(SettlementResidualPolicyDecision decision)
    {
        return new SettlementResidualPolicyResult(decision, failure: null);
    }

    public static SettlementResidualPolicyResult Failed(SettlementResidualPolicyFailure failure)
    {
        return new SettlementResidualPolicyResult(decision: null, failure);
    }
}

internal sealed record SettlementResidualPolicyDecision(
    SettlementResidualPaymentClassification Classification,
    decimal DeltaAmount,
    string Currency,
    SettlementResidualDecision? Residual);

internal sealed record SettlementResidualDecision(
    string Direction,
    decimal Amount,
    string Currency,
    string Policy,
    string InitialStatus,
    string ReceiverConfirmedStatus,
    bool RequiresReceiverConfirmation,
    bool AllowsDebtClearingBeforeReceiverConfirmation,
    bool RequiresExplicitResidualRecord);

internal sealed record SettlementResidualPolicyFailure(
    SettlementResidualPolicyFailureReason Reason,
    string Code,
    string Field,
    string Message)
{
    public static SettlementResidualPolicyFailure Create(
        SettlementResidualPolicyFailureReason reason,
        string code,
        string field,
        string message)
    {
        return new SettlementResidualPolicyFailure(reason, code, field, message);
    }

    public static SettlementResidualPolicyFailure FromMoney(
        MoneyValidationResult validationResult,
        string? field = null)
    {
        return new SettlementResidualPolicyFailure(
            MapReason(validationResult.FailureReason),
            validationResult.Code,
            field ?? validationResult.Field,
            validationResult.Message);
    }

    private static SettlementResidualPolicyFailureReason MapReason(
        MoneyValidationFailureReason failureReason)
    {
        return failureReason switch
        {
            MoneyValidationFailureReason.InvalidCurrencyFormat => SettlementResidualPolicyFailureReason.InvalidCurrencyFormat,
            MoneyValidationFailureReason.UnsupportedCurrency => SettlementResidualPolicyFailureReason.UnsupportedCurrency,
            MoneyValidationFailureReason.InvalidDecimalFormat => SettlementResidualPolicyFailureReason.InvalidDecimalFormat,
            MoneyValidationFailureReason.AmountOutOfRange => SettlementResidualPolicyFailureReason.AmountOutOfRange,
            MoneyValidationFailureReason.TooManyFractionalDigits => SettlementResidualPolicyFailureReason.TooManyFractionalDigits,
            MoneyValidationFailureReason.NegativeAmountNotAllowed => SettlementResidualPolicyFailureReason.NegativeAmountNotAllowed,
            MoneyValidationFailureReason.ZeroAmountNotAllowed => SettlementResidualPolicyFailureReason.ZeroAmountNotAllowed,
            _ => SettlementResidualPolicyFailureReason.InvalidMoney
        };
    }
}

internal enum SettlementResidualPolicyFailureReason
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
    MissingResidualPolicy,
    ResidualPolicyNotAllowedForExactPayment,
    UnsupportedResidualPolicy,
    UnsupportedResidualPolicyDirection
}
