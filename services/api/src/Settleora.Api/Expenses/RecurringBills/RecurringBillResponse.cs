namespace Settleora.Api.Expenses.RecurringBills;

internal sealed record RecurringBillTemplateListResponse(
    IReadOnlyList<RecurringBillTemplateResponse> Templates);

internal sealed record RecurringBillTemplateResponse(
    Guid Id,
    Guid OwnerUserProfileId,
    Guid? GroupId,
    string? MerchantName,
    string? Description,
    string Status,
    RecurringBillScheduleResponse Schedule,
    string ForecastAmount,
    string ForecastCurrency,
    RecurringBillTemplatePayloadResponse? BillPayload,
    DateOnly? NextOccurrenceDate,
    int PayloadVersion,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? ArchivedAtUtc);

internal sealed record RecurringBillTemplatePayloadResponse(
    string Currency,
    IReadOnlyList<RecurringBillTemplatePayloadItemResponse> Items,
    IReadOnlyList<RecurringBillTemplatePayloadAdjustmentResponse> Adjustments,
    IReadOnlyList<RecurringBillTemplatePayloadPayerResponse> Payers);

internal sealed record RecurringBillTemplatePayloadItemResponse(
    string Name,
    string? Note,
    string Amount,
    string Currency,
    IReadOnlyList<RecurringBillTemplatePayloadItemSplitResponse> Splits);

internal sealed record RecurringBillTemplatePayloadItemSplitResponse(
    Guid UserProfileId,
    string SplitMethod,
    string? BasisValue,
    int AllocationOrder);

internal sealed record RecurringBillTemplatePayloadAdjustmentResponse(
    string Type,
    string Direction,
    string AllocationMethod,
    string Amount,
    string Currency,
    string? ReasonNote);

internal sealed record RecurringBillTemplatePayloadPayerResponse(
    Guid UserProfileId,
    string Amount,
    string Currency,
    string? PaymentMethodLabelSnapshot);

internal sealed record RecurringBillScheduleResponse(
    string Type,
    int? IntervalCount,
    int? IntervalDays,
    DateOnly StartDate,
    DateOnly? EndDate,
    int? DueOffsetDays);

internal sealed record RecurringBillForecastListResponse(
    IReadOnlyList<RecurringBillForecastOccurrenceResponse> Occurrences);

internal sealed record RecurringBillForecastOccurrenceResponse(
    Guid TemplateId,
    Guid? OccurrenceId,
    Guid? GroupId,
    DateOnly OccurrenceDate,
    DateOnly? DueDate,
    string Status,
    bool DraftGenerated,
    Guid? GeneratedBillId,
    string ForecastAmount,
    string ForecastCurrency,
    string? MerchantName);

internal sealed record RecurringBillGenerateDraftResponse(
    Guid TemplateId,
    Guid OccurrenceId,
    DateOnly OccurrenceDate,
    DateOnly? DueDate,
    string OccurrenceStatus,
    Guid GeneratedBillId,
    string BillStatus,
    string TotalAmount,
    string TotalCurrency);
