namespace Settleora.Api.Reports.MonthlyReports;

internal sealed record MonthlyReportResponse(
    string Month,
    Guid? GroupId,
    DateTimeOffset GeneratedAtUtc,
    int BillCount,
    IReadOnlyList<MonthlyReportCurrencyTotalResponse> TotalByCurrency,
    IReadOnlyList<MonthlyReportCurrencyTotalResponse> ActorShareByCurrency,
    IReadOnlyList<MonthlyReportCurrencyTotalResponse> ActorPaidByCurrency,
    IReadOnlyList<MonthlyReportStatusCountResponse> ReconciliationCounts,
    IReadOnlyList<MonthlyReportStatusCountResponse> SettlementRequestCounts,
    IReadOnlyList<MonthlyReportStatusCountResponse> SettlementPaymentCounts);

internal sealed record MonthlyReportCurrencyTotalResponse(
    string Currency,
    string Amount);

internal sealed record MonthlyReportStatusCountResponse(
    string Status,
    int Count);
