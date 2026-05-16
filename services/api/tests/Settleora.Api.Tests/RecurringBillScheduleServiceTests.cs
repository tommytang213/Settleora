using Settleora.Api.Domain.RecurringBills;

namespace Settleora.Api.Tests;

public sealed class RecurringBillScheduleServiceTests
{
    [Theory]
    [InlineData(RecurringBillScheduleTypes.Weekly, 7)]
    [InlineData(RecurringBillScheduleTypes.Monthly, 31)]
    [InlineData(RecurringBillScheduleTypes.Yearly, 365)]
    [InlineData(RecurringBillScheduleTypes.CustomIntervalDays, 10)]
    public void GenerateOccurrencesSupportsBoundedDateBasedSchedules(
        string scheduleType,
        int expectedDayOffset)
    {
        var service = new RecurringBillScheduleService();
        var schedule = scheduleType == RecurringBillScheduleTypes.CustomIntervalDays
            ? new RecurringBillSchedule(scheduleType, null, 10, new DateOnly(2026, 1, 1), null, DueOffsetDays: 3)
            : new RecurringBillSchedule(scheduleType, 1, null, new DateOnly(2026, 1, 1), null, DueOffsetDays: 3);

        var occurrences = service.GenerateOccurrences(
            schedule,
            new DateOnly(2026, 1, 1),
            new DateOnly(2027, 1, 10),
            limit: 2);

        Assert.Equal(2, occurrences.Count);
        Assert.Equal(new DateOnly(2026, 1, 1), occurrences[0].OccurrenceDate);
        Assert.Equal(new DateOnly(2026, 1, 4), occurrences[0].DueDate);
        Assert.Equal(new DateOnly(2026, 1, 1).AddDays(expectedDayOffset), occurrences[1].OccurrenceDate);
    }

    [Fact]
    public void ValidateRejectsBadScheduleShapesBeforeLooping()
    {
        var service = new RecurringBillScheduleService();

        var validation = service.Validate(new RecurringBillSchedule(
            RecurringBillScheduleTypes.CustomIntervalDays,
            IntervalCount: 1,
            IntervalDays: null,
            StartDate: new DateOnly(2026, 1, 1),
            EndDate: new DateOnly(2025, 12, 31),
            DueOffsetDays: 400));

        Assert.False(validation.Succeeded);
        Assert.Contains("schedule.intervalDays", validation.Errors.Keys);
        Assert.Contains("schedule.intervalCount", validation.Errors.Keys);
        Assert.Contains("schedule.endDate", validation.Errors.Keys);
        Assert.Contains("schedule.dueOffsetDays", validation.Errors.Keys);
    }
}
