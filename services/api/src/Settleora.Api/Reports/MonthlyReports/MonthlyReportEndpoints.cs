using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Persistence;

namespace Settleora.Api.Reports.MonthlyReports;

internal static class MonthlyReportEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string MonthlyReportUnavailableTitle = "Monthly report unavailable";
    private const string MonthlyReportUnavailableDetail = "The requested monthly report is unavailable.";
    private const string InvalidMonthlyReportRequestTitle = "Invalid monthly report request";
    private const string InvalidMonthlyReportRequestDetail = "The submitted monthly report request is invalid.";

    public static WebApplication MapMonthlyReportEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/reports/monthly", GetMonthlyReportAsync)
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        return app;
    }

    private static async Task<IResult> GetMonthlyReportAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var requestReadResult = ReadMonthlyReportRequest(request);
        if (!requestReadResult.Succeeded || requestReadResult.Request is null)
        {
            return InvalidMonthlyReportRequest(requestReadResult.Errors);
        }

        var monthlyReportRequest = requestReadResult.Request;
        var authorizationResult = monthlyReportRequest.GroupId is null
            ? await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken)
            : await businessAuthorizationService.CanAccessGroupAsync(monthlyReportRequest.GroupId.Value, cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var monthEnd = monthlyReportRequest.MonthStart.AddMonths(1);
        var bills = await VisibleBillsQuery(
                dbContext,
                actor.UserProfileId,
                monthlyReportRequest.GroupId,
                monthlyReportRequest.MonthStart,
                monthEnd)
            .OrderBy(bill => bill.BillDate)
            .ThenBy(bill => bill.CreatedAtUtc)
            .ThenBy(bill => bill.Id)
            .ToListAsync(cancellationToken);
        var billIds = bills
            .Select(bill => bill.Id)
            .ToHashSet();

        var response = new MonthlyReportResponse(
            monthlyReportRequest.MonthText,
            monthlyReportRequest.GroupId,
            timeProvider.GetUtcNow(),
            bills.Count,
            BuildCurrencyTotals(bills.Select(bill => new CurrencyAmount(bill.TotalCurrency, bill.TotalAmount))),
            BuildCurrencyTotals(bills
                .SelectMany(bill => bill.Participants)
                .Where(participant => participant.UserProfileId == actor.UserProfileId)
                .Select(participant => new CurrencyAmount(
                    participant.ResolvedShareCurrency,
                    participant.ResolvedShareAmount))),
            BuildCurrencyTotals(bills
                .SelectMany(bill => bill.Payers)
                .Where(payer => payer.UserProfileId == actor.UserProfileId)
                .Select(payer => new CurrencyAmount(
                    payer.Currency,
                    payer.Amount))),
            BuildStatusCounts(
                ExpenseBillReconciliationStatuses.All,
                bills.Select(bill => bill.ReconciliationStatus)),
            await BuildSettlementRequestStatusCountsAsync(
                dbContext,
                billIds,
                actor.UserProfileId,
                monthlyReportRequest.GroupId,
                cancellationToken),
            await BuildSettlementPaymentStatusCountsAsync(
                dbContext,
                billIds,
                actor.UserProfileId,
                monthlyReportRequest.GroupId,
                cancellationToken));

        return Results.Ok(response);
    }

    private static IQueryable<ExpenseBill> VisibleBillsQuery(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId,
        Guid? groupId,
        DateOnly monthStart,
        DateOnly monthEnd)
    {
        var query = dbContext.Set<ExpenseBill>()
            .AsNoTracking()
            .Include(bill => bill.Participants)
            .Include(bill => bill.Payers)
            .Where(bill => bill.BillDate >= monthStart
                && bill.BillDate < monthEnd
                && bill.ArchivedAtUtc == null
                && bill.CreatedByUserProfile.DeletedAtUtc == null);

        return groupId is null
            ? query.Where(bill => bill.GroupId == null
                && (bill.CreatedByUserProfileId == actorUserProfileId
                    || bill.Participants.Any(participant => participant.UserProfileId == actorUserProfileId)))
            : query.Where(bill => bill.GroupId == groupId.Value
                && bill.Group != null
                && bill.Group.DeletedAtUtc == null);
    }

    private static async Task<IReadOnlyList<MonthlyReportStatusCountResponse>> BuildSettlementRequestStatusCountsAsync(
        SettleoraDbContext dbContext,
        IReadOnlySet<Guid> visibleBillIds,
        Guid actorUserProfileId,
        Guid? groupId,
        CancellationToken cancellationToken)
    {
        if (visibleBillIds.Count == 0)
        {
            return BuildStatusCounts(SettlementRequestStatusList.All, []);
        }

        var statuses = await dbContext.Set<SettlementRequest>()
            .AsNoTracking()
            .Where(request => request.SourceExpenseBillId != null
                && visibleBillIds.Contains(request.SourceExpenseBillId.Value)
                && request.ArchivedAtUtc == null
                && request.GroupId == groupId
                && (request.DebtorUserProfileId == actorUserProfileId
                    || request.CreditorUserProfileId == actorUserProfileId
                    || request.RequestedByUserProfileId == actorUserProfileId))
            .Select(request => request.Status)
            .ToArrayAsync(cancellationToken);

        return BuildStatusCounts(SettlementRequestStatusList.All, statuses);
    }

    private static async Task<IReadOnlyList<MonthlyReportStatusCountResponse>> BuildSettlementPaymentStatusCountsAsync(
        SettleoraDbContext dbContext,
        IReadOnlySet<Guid> visibleBillIds,
        Guid actorUserProfileId,
        Guid? groupId,
        CancellationToken cancellationToken)
    {
        if (visibleBillIds.Count == 0)
        {
            return BuildStatusCounts(SettlementPaymentStatusList.All, []);
        }

        var statuses = await dbContext.Set<SettlementPayment>()
            .AsNoTracking()
            .Where(payment => payment.SettlementRequest.SourceExpenseBillId != null
                && visibleBillIds.Contains(payment.SettlementRequest.SourceExpenseBillId.Value)
                && payment.SettlementRequest.ArchivedAtUtc == null
                && payment.SettlementRequest.GroupId == groupId
                && (payment.SettlementRequest.DebtorUserProfileId == actorUserProfileId
                    || payment.SettlementRequest.CreditorUserProfileId == actorUserProfileId
                    || payment.SettlementRequest.RequestedByUserProfileId == actorUserProfileId
                    || payment.PaidByUserProfileId == actorUserProfileId
                    || payment.ReceivedByUserProfileId == actorUserProfileId
                    || payment.CreatedByUserProfileId == actorUserProfileId))
            .Select(payment => payment.Status)
            .ToArrayAsync(cancellationToken);

        return BuildStatusCounts(SettlementPaymentStatusList.All, statuses);
    }

    private static IReadOnlyList<MonthlyReportCurrencyTotalResponse> BuildCurrencyTotals(
        IEnumerable<CurrencyAmount> amounts)
    {
        return amounts
            .Where(amount => !string.IsNullOrWhiteSpace(amount.Currency))
            .GroupBy(amount => amount.Currency, StringComparer.Ordinal)
            .OrderBy(group => group.Key, StringComparer.Ordinal)
            .Select(group => new MonthlyReportCurrencyTotalResponse(
                group.Key,
                FormatAmount(group.Sum(amount => amount.Amount))))
            .ToArray();
    }

    private static IReadOnlyList<MonthlyReportStatusCountResponse> BuildStatusCounts(
        IReadOnlyList<string> orderedStatuses,
        IEnumerable<string> statuses)
    {
        var counts = statuses
            .Where(status => !string.IsNullOrWhiteSpace(status))
            .GroupBy(status => status, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => group.Count(),
                StringComparer.Ordinal);

        return orderedStatuses
            .Select(status => new MonthlyReportStatusCountResponse(
                status,
                counts.TryGetValue(status, out var count) ? count : 0))
            .ToArray();
    }

    private static MonthlyReportRequestReadResult ReadMonthlyReportRequest(HttpRequest request)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        RejectRequestBody(request, errors);
        RejectUnsupportedQueryFields(request, errors);

        var submittedMonth = ReadSingleQueryString(request, "month", errors);
        Guid? groupId = null;
        var submittedGroupId = ReadSingleQueryString(request, "groupId", errors);
        if (submittedGroupId is not null)
        {
            if (!Guid.TryParse(submittedGroupId, out var parsedGroupId))
            {
                AddError(errors, "groupId", "Group ID must be a valid UUID.");
            }
            else
            {
                groupId = parsedGroupId;
            }
        }

        if (!TryReadMonth(submittedMonth, out var monthStart, out var monthText, out var monthErrors))
        {
            foreach (var (field, fieldErrors) in monthErrors)
            {
                foreach (var fieldError in fieldErrors)
                {
                    AddError(errors, field, fieldError);
                }
            }
        }

        return errors.Count == 0
            ? MonthlyReportRequestReadResult.Valid(new MonthlyReportRequest(monthStart, monthText, groupId))
            : MonthlyReportRequestReadResult.Invalid(ToErrorDictionary(errors));
    }

    private static void RejectRequestBody(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        if (request.ContentLength.GetValueOrDefault() > 0
            || request.Headers.TryGetValue("Transfer-Encoding", out var transferEncoding)
            && transferEncoding.Count > 0)
        {
            AddError(errors, "body", "Monthly report requests do not accept a body.");
        }
    }

    private static void RejectUnsupportedQueryFields(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        foreach (var field in request.Query.Keys)
        {
            if (!string.Equals(field, "month", StringComparison.Ordinal)
                && !string.Equals(field, "groupId", StringComparison.Ordinal))
            {
                AddError(errors, "query", "Unsupported query fields are not allowed.");
                return;
            }
        }
    }

    private static string? ReadSingleQueryString(
        HttpRequest request,
        string field,
        Dictionary<string, List<string>> errors)
    {
        if (!request.Query.TryGetValue(field, out var values) || values.Count == 0)
        {
            return null;
        }

        if (values.Count > 1)
        {
            AddError(errors, field, "Only one value is supported.");
            return null;
        }

        return values.ToString();
    }

    private static bool TryReadMonth(
        string? submittedMonth,
        out DateOnly monthStart,
        out string monthText,
        out IDictionary<string, string[]> errors)
    {
        monthStart = default;
        monthText = string.Empty;
        errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (submittedMonth is null
            || !DateOnly.TryParseExact(
                submittedMonth,
                "yyyy-MM",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out monthStart))
        {
            errors = new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["month"] = ["Month must be a yyyy-MM value."]
            };
            return false;
        }

        monthText = monthStart.ToString("yyyy-MM", CultureInfo.InvariantCulture);
        return true;
    }

    private static void AddError(
        Dictionary<string, List<string>> errors,
        string field,
        string error)
    {
        if (!errors.TryGetValue(field, out var fieldErrors))
        {
            fieldErrors = [];
            errors[field] = fieldErrors;
        }

        fieldErrors.Add(error);
    }

    private static IDictionary<string, string[]> ToErrorDictionary(Dictionary<string, List<string>> errors)
    {
        return errors.ToDictionary(
            pair => pair.Key,
            pair => pair.Value.Distinct(StringComparer.Ordinal).ToArray(),
            StringComparer.Ordinal);
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : MonthlyReportUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult MonthlyReportUnavailable()
    {
        return Results.Problem(
            title: MonthlyReportUnavailableTitle,
            detail: MonthlyReportUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidMonthlyReportRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidMonthlyReportRequestTitle,
            detail: InvalidMonthlyReportRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private sealed record CurrencyAmount(
        string Currency,
        decimal Amount);

    private sealed record MonthlyReportRequest(
        DateOnly MonthStart,
        string MonthText,
        Guid? GroupId);

    private sealed class MonthlyReportRequestReadResult
    {
        private MonthlyReportRequestReadResult(
            MonthlyReportRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public MonthlyReportRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static MonthlyReportRequestReadResult Valid(MonthlyReportRequest request)
        {
            return new MonthlyReportRequestReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static MonthlyReportRequestReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new MonthlyReportRequestReadResult(null, errors);
        }
    }

    private static class SettlementRequestStatusList
    {
        public static IReadOnlyList<string> All { get; } =
        [
            SettlementRequestStatuses.Requested,
            SettlementRequestStatuses.PartiallyPaid,
            SettlementRequestStatuses.MarkedPaid,
            SettlementRequestStatuses.Confirmed,
            SettlementRequestStatuses.Disputed,
            SettlementRequestStatuses.Cancelled
        ];
    }

    private static class SettlementPaymentStatusList
    {
        public static IReadOnlyList<string> All { get; } =
        [
            SettlementPaymentStatuses.MarkedPaid,
            SettlementPaymentStatuses.Confirmed,
            SettlementPaymentStatuses.Disputed,
            SettlementPaymentStatuses.Cancelled
        ];
    }
}
