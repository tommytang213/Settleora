namespace Settleora.Api.Domain.RecurringBills;

public static class RecurringBillConstraints
{
    public const int MerchantNameMaxLength = 200;
    public const int DescriptionMaxLength = 1000;
    public const int ScheduleTypeMaxLength = 32;
    public const int TemplateStatusMaxLength = 32;
    public const int OccurrenceStatusMaxLength = 32;
    public const int PayloadJsonMaxLength = 32_000;
    public const int CurrencyMaxLength = 3;
    public const int MoneyAmountPrecision = 19;
    public const int MoneyAmountScale = 4;
    public const decimal MoneyAmountMaxValue = 999999999999999.9999m;
    public const int MaxForecastOccurrences = 100;
    public const int MaxScheduleIterations = 5000;
}
