namespace Settleora.Api.Domain.Settlements;

public static class SettlementConstraints
{
    public const int RequestStatusMaxLength = 32;
    public const int RequestLineStatusMaxLength = 32;
    public const int PaymentStatusMaxLength = 32;
    public const int ResidualDirectionMaxLength = 32;
    public const int ResidualPolicyMaxLength = 32;
    public const int ResidualStatusMaxLength = 32;
    public const int NoteMaxLength = 1000;
    public const int ResidualReasonMaxLength = 1000;
    public const int SourceCandidateKeyMaxLength = 240;
    public const int CurrencyMaxLength = 3;
    public const int MoneyAmountPrecision = 19;
    public const int MoneyAmountScale = 4;
    public const decimal MoneyAmountMaxValue = 999999999999999.9999m;
}
