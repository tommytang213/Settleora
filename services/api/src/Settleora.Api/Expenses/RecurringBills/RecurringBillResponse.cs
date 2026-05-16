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
    DateOnly? NextOccurrenceDate,
    int PayloadVersion,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? ArchivedAtUtc);

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
