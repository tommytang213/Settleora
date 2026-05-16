namespace Settleora.Api.Domain.RecurringBills;

internal sealed class RecurringBillScheduleService
{
    public RecurringBillScheduleValidationResult Validate(RecurringBillSchedule schedule)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);

        if (!RecurringBillScheduleTypes.IsSupported(schedule.ScheduleType))
        {
            errors["schedule.type"] = ["Schedule type is not supported."];
        }

        if (schedule.EndDate is not null && schedule.EndDate.Value < schedule.StartDate)
        {
            errors["schedule.endDate"] = ["Schedule end date must be on or after the start date."];
        }

        if (schedule.DueOffsetDays is < -365 or > 365)
        {
            errors["schedule.dueOffsetDays"] = ["Due offset days must be between -365 and 365."];
        }

        if (schedule.ScheduleType is RecurringBillScheduleTypes.CustomIntervalDays)
        {
            if (schedule.IntervalDays is null or <= 0 or > 3660)
            {
                errors["schedule.intervalDays"] = ["Custom interval days must be a positive value no greater than 3660."];
            }

            if (schedule.IntervalCount is not null)
            {
                errors["schedule.intervalCount"] = ["Interval count is not used for custom interval day schedules."];
            }
        }
        else
        {
            if (schedule.IntervalCount is null or <= 0 or > 120)
            {
                errors["schedule.intervalCount"] = ["Interval count must be a positive value no greater than 120."];
            }

            if (schedule.IntervalDays is not null)
            {
                errors["schedule.intervalDays"] = ["Interval days is only used for custom interval day schedules."];
            }
        }

        return errors.Count == 0
            ? RecurringBillScheduleValidationResult.Valid()
            : RecurringBillScheduleValidationResult.Invalid(errors);
    }

    public IReadOnlyList<RecurringBillScheduledOccurrence> GenerateOccurrences(
        RecurringBillSchedule schedule,
        DateOnly rangeStart,
        DateOnly rangeEnd,
        int limit)
    {
        if (!Validate(schedule).Succeeded || rangeEnd < rangeStart || limit <= 0)
        {
            return [];
        }

        var boundedLimit = Math.Min(limit, RecurringBillConstraints.MaxForecastOccurrences);
        var occurrences = new List<RecurringBillScheduledOccurrence>(boundedLimit);
        var occurrenceDate = schedule.StartDate;
        var iterationCount = 0;

        while (occurrenceDate <= rangeEnd
            && (schedule.EndDate is null || occurrenceDate <= schedule.EndDate.Value)
            && iterationCount < RecurringBillConstraints.MaxScheduleIterations)
        {
            if (occurrenceDate >= rangeStart)
            {
                occurrences.Add(new RecurringBillScheduledOccurrence(
                    occurrenceDate,
                    schedule.DueOffsetDays is null
                        ? null
                        : occurrenceDate.AddDays(schedule.DueOffsetDays.Value)));

                if (occurrences.Count >= boundedLimit)
                {
                    break;
                }
            }

            var nextOccurrenceDate = NextOccurrenceDate(schedule, occurrenceDate);
            if (nextOccurrenceDate <= occurrenceDate)
            {
                break;
            }

            occurrenceDate = nextOccurrenceDate;
            iterationCount++;
        }

        return occurrences;
    }

    public DateOnly? GetNextOccurrenceOnOrAfter(
        RecurringBillSchedule schedule,
        DateOnly earliestDate)
    {
        return GenerateOccurrences(schedule, earliestDate, earliestDate.AddYears(10), limit: 1)
            .SingleOrDefault()
            ?.OccurrenceDate;
    }

    public bool ContainsOccurrence(
        RecurringBillSchedule schedule,
        DateOnly occurrenceDate)
    {
        return GenerateOccurrences(schedule, occurrenceDate, occurrenceDate, limit: 1)
            .Any(candidate => candidate.OccurrenceDate == occurrenceDate);
    }

    private static DateOnly NextOccurrenceDate(
        RecurringBillSchedule schedule,
        DateOnly occurrenceDate)
    {
        return schedule.ScheduleType switch
        {
            RecurringBillScheduleTypes.Weekly => occurrenceDate.AddDays(7 * schedule.IntervalCount!.Value),
            RecurringBillScheduleTypes.Monthly => occurrenceDate.AddMonths(schedule.IntervalCount!.Value),
            RecurringBillScheduleTypes.Yearly => occurrenceDate.AddYears(schedule.IntervalCount!.Value),
            RecurringBillScheduleTypes.CustomIntervalDays => occurrenceDate.AddDays(schedule.IntervalDays!.Value),
            _ => occurrenceDate
        };
    }
}

internal sealed record RecurringBillScheduledOccurrence(
    DateOnly OccurrenceDate,
    DateOnly? DueDate);

internal sealed class RecurringBillScheduleValidationResult
{
    private RecurringBillScheduleValidationResult(IDictionary<string, string[]> errors)
    {
        Errors = errors;
    }

    public bool Succeeded => Errors.Count == 0;

    public IDictionary<string, string[]> Errors { get; }

    public static RecurringBillScheduleValidationResult Valid()
    {
        return new RecurringBillScheduleValidationResult(
            new Dictionary<string, string[]>(StringComparer.Ordinal));
    }

    public static RecurringBillScheduleValidationResult Invalid(IDictionary<string, string[]> errors)
    {
        return new RecurringBillScheduleValidationResult(errors);
    }
}
