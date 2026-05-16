namespace Settleora.Api.Expenses.RecurringBills;

internal sealed record RecurringBillAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid SubjectAuthAccountId,
    Guid TemplateId,
    Guid? GroupId,
    string GroupMode,
    string TemplateStatus,
    string? OccurrenceDate,
    Guid? GeneratedBillId,
    string Currency,
    decimal ForecastAmount,
    DateTimeOffset OccurredAtUtc);
