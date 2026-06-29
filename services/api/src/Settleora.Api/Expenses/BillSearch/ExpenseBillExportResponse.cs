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

internal sealed record ExpenseBillExportReadinessResponse(
    string ScopeType,
    Guid? GroupId,
    string RequestedFormat,
    IReadOnlyList<string> SupportedFormats,
    bool Available,
    string Code,
    string Message,
    ExpenseBillExportFilterResponse AcceptedFilters,
    IReadOnlyList<ExpenseBillExportFilterDefaultResponse> DefaultedFilters,
    IReadOnlyList<ExpenseBillExportFilterRejectionResponse> RejectedFilters,
    int RowLimit,
    int? EstimatedRows,
    long? SizeLimitBytes,
    long? EstimatedSizeBytes,
    bool IncludesFileBytes,
    IReadOnlyList<ExpenseBillExportRedactionResponse> Redactions,
    ExpenseBillExportAuditPreviewResponse AuditPreview,
    ExpenseBillExportConfirmationResponse Confirmation,
    DateTimeOffset ExpiresAtUtc);

internal sealed record ExpenseBillExportFilterDefaultResponse(
    string Field,
    string Value,
    string Reason);

internal sealed record ExpenseBillExportFilterRejectionResponse(
    string Field,
    string Code,
    string Message);

internal sealed record ExpenseBillExportRedactionResponse(
    string Category,
    string Handling,
    string Message);

internal sealed record ExpenseBillExportAuditPreviewResponse(
    string Action,
    string ScopeType,
    Guid? GroupId,
    string Format,
    bool WritesAuditOnReadiness,
    bool WritesAuditOnExport);

internal sealed record ExpenseBillExportConfirmationResponse(
    string Title,
    string Body,
    string ConfirmLabel);
