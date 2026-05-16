namespace Settleora.Api.Domain.RecurringBills;

internal sealed record RecurringBillSchedule(
    string ScheduleType,
    int? IntervalCount,
    int? IntervalDays,
    DateOnly StartDate,
    DateOnly? EndDate,
    int? DueOffsetDays);
