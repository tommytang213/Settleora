namespace Settleora.Api.Expenses.BillSearch;

internal sealed record ExpenseBillExportResponse(
    DateTimeOffset GeneratedAtUtc,
    ExpenseBillExportFilterResponse AppliedFilters,
    int RowCount,
    IReadOnlyList<ExpenseBillExportRowResponse> Rows);

internal sealed record ExpenseBillExportFilterResponse(
    DateOnly? FromDate,
    DateOnly? ToDate,
    string? Status,
    string? ReconciliationStatus,
    string? Currency,
    string? Merchant,
    string? Search,
    string ArchiveState,
    int Limit);

internal sealed record ExpenseBillExportRowResponse(
    Guid BillId,
    Guid? GroupId,
    string? MerchantName,
    DateOnly BillDate,
    string BillStatus,
    string ReconciliationStatus,
    string TotalAmount,
    string Currency,
    int ItemCount,
    int ParticipantCount,
    int PayerCount,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc);
