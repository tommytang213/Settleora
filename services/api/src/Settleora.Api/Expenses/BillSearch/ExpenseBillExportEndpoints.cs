using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.BillSearch;

internal static class ExpenseBillExportEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string BillExportUnavailableTitle = "Bill export unavailable";
    private const string BillExportUnavailableDetail = "The requested bill export is unavailable.";
    private const string InvalidBillExportRequestTitle = "Invalid bill export request";
    private const string InvalidBillExportRequestDetail = "The submitted bill export request is invalid.";

    private static readonly string[] CsvHeaders =
    [
        "billId",
        "groupId",
        "merchantName",
        "billDate",
        "billStatus",
        "reconciliationStatus",
        "totalAmount",
        "currency",
        "itemCount",
        "participantCount",
        "payerCount",
        "createdAtUtc",
        "updatedAtUtc"
    ];

    public static WebApplication MapExpenseBillExportEndpoints(this WebApplication app)
    {
        var personalBills = app.MapGroup("/api/v1/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        personalBills.MapGet("/export.json", ExportPersonalBillsJsonAsync);
        personalBills.MapGet("/export.csv", ExportPersonalBillsCsvAsync);

        var groupBills = app.MapGroup("/api/v1/groups/{groupId:guid}/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        groupBills.MapGet("/export.json", ExportGroupBillsJsonAsync);
        groupBills.MapGet("/export.csv", ExportGroupBillsCsvAsync);

        return app;
    }

    private static async Task<IResult> ExportPersonalBillsJsonAsync(
        string? fromDate,
        string? toDate,
        string? status,
        string? reconciliationStatus,
        string? currency,
        string? merchant,
        string? search,
        string? archiveState,
        string? limit,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var result = await BuildPersonalExportResponseAsync(
            fromDate,
            toDate,
            status,
            reconciliationStatus,
            currency,
            merchant,
            search,
            archiveState,
            limit,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            timeProvider,
            cancellationToken);

        return result.Error ?? Results.Json(result.Response);
    }

    private static async Task<IResult> ExportPersonalBillsCsvAsync(
        string? fromDate,
        string? toDate,
        string? status,
        string? reconciliationStatus,
        string? currency,
        string? merchant,
        string? search,
        string? archiveState,
        string? limit,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var result = await BuildPersonalExportResponseAsync(
            fromDate,
            toDate,
            status,
            reconciliationStatus,
            currency,
            merchant,
            search,
            archiveState,
            limit,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            timeProvider,
            cancellationToken);

        return result.Error ?? Results.Text(ToCsv(result.Response!.Rows), "text/csv", Encoding.UTF8);
    }

    private static async Task<IResult> ExportGroupBillsJsonAsync(
        Guid groupId,
        string? fromDate,
        string? toDate,
        string? status,
        string? reconciliationStatus,
        string? currency,
        string? merchant,
        string? search,
        string? archiveState,
        string? limit,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var result = await BuildGroupExportResponseAsync(
            groupId,
            fromDate,
            toDate,
            status,
            reconciliationStatus,
            currency,
            merchant,
            search,
            archiveState,
            limit,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            timeProvider,
            cancellationToken);

        return result.Error ?? Results.Json(result.Response);
    }

    private static async Task<IResult> ExportGroupBillsCsvAsync(
        Guid groupId,
        string? fromDate,
        string? toDate,
        string? status,
        string? reconciliationStatus,
        string? currency,
        string? merchant,
        string? search,
        string? archiveState,
        string? limit,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var result = await BuildGroupExportResponseAsync(
            groupId,
            fromDate,
            toDate,
            status,
            reconciliationStatus,
            currency,
            merchant,
            search,
            archiveState,
            limit,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            timeProvider,
            cancellationToken);

        return result.Error ?? Results.Text(ToCsv(result.Response!.Rows), "text/csv", Encoding.UTF8);
    }

    private static async Task<ExpenseBillExportBuildResult> BuildPersonalExportResponseAsync(
        string? fromDate,
        string? toDate,
        string? status,
        string? reconciliationStatus,
        string? currency,
        string? merchant,
        string? search,
        string? archiveState,
        string? limit,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return ExpenseBillExportBuildResult.Failed(Unauthenticated());
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return ExpenseBillExportBuildResult.Failed(MapAuthorizationFailure(authorizationResult));
        }

        if (!ExpenseBillSearchFilter.TryRead(
            fromDate,
            toDate,
            status,
            reconciliationStatus,
            currency,
            merchant,
            search,
            archiveState,
            limit,
            out var filter,
            out var errors))
        {
            return ExpenseBillExportBuildResult.Failed(InvalidBillExportRequest(errors));
        }

        var rows = await LoadRowsAsync(
            ExpenseBillSearchQueries.VisiblePersonalBillsIncludingArchived(dbContext, actor.UserProfileId),
            filter,
            cancellationToken);

        return ExpenseBillExportBuildResult.Succeeded(BuildResponse(filter, rows, timeProvider));
    }

    private static async Task<ExpenseBillExportBuildResult> BuildGroupExportResponseAsync(
        Guid groupId,
        string? fromDate,
        string? toDate,
        string? status,
        string? reconciliationStatus,
        string? currency,
        string? merchant,
        string? search,
        string? archiveState,
        string? limit,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out _))
        {
            return ExpenseBillExportBuildResult.Failed(Unauthenticated());
        }

        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return ExpenseBillExportBuildResult.Failed(MapAuthorizationFailure(authorizationResult));
        }

        if (!ExpenseBillSearchFilter.TryRead(
            fromDate,
            toDate,
            status,
            reconciliationStatus,
            currency,
            merchant,
            search,
            archiveState,
            limit,
            out var filter,
            out var errors))
        {
            return ExpenseBillExportBuildResult.Failed(InvalidBillExportRequest(errors));
        }

        var rows = await LoadRowsAsync(
            ExpenseBillSearchQueries.VisibleGroupBillsIncludingArchived(dbContext, groupId),
            filter,
            cancellationToken);

        return ExpenseBillExportBuildResult.Succeeded(BuildResponse(filter, rows, timeProvider));
    }

    private static async Task<IReadOnlyList<ExpenseBillExportRowResponse>> LoadRowsAsync(
        IQueryable<ExpenseBill> visibleBillsQuery,
        ExpenseBillSearchFilter filter,
        CancellationToken cancellationToken)
    {
        var bills = await visibleBillsQuery
            .ApplySearchFilter(filter)
            .WithBillDetails()
            .OrderForList()
            .Take(filter.Limit)
            .ToListAsync(cancellationToken);

        return bills
            .Select(MapRow)
            .ToArray();
    }

    private static ExpenseBillExportResponse BuildResponse(
        ExpenseBillSearchFilter filter,
        IReadOnlyList<ExpenseBillExportRowResponse> rows,
        TimeProvider timeProvider)
    {
        return new ExpenseBillExportResponse(
            timeProvider.GetUtcNow(),
            new ExpenseBillExportFilterResponse(
                filter.FromDate,
                filter.ToDate,
                filter.Status,
                filter.ReconciliationStatus,
                filter.Currency,
                filter.Merchant,
                filter.Search,
                filter.ArchiveState,
                filter.Limit),
            rows.Count,
            rows);
    }

    private static ExpenseBillExportRowResponse MapRow(ExpenseBill bill)
    {
        return new ExpenseBillExportRowResponse(
            bill.Id,
            bill.GroupId,
            bill.MerchantName,
            bill.BillDate,
            bill.Status,
            bill.ReconciliationStatus,
            FormatAmount(bill.TotalAmount),
            bill.TotalCurrency,
            bill.Items.Count(item => item.DeletedAtUtc is null),
            bill.Participants.Count,
            bill.Payers.Count,
            bill.CreatedAtUtc,
            bill.UpdatedAtUtc);
    }

    private static string ToCsv(IReadOnlyList<ExpenseBillExportRowResponse> rows)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(",", CsvHeaders));

        foreach (var row in rows)
        {
            builder.AppendLine(string.Join(
                ",",
                CsvCell(row.BillId.ToString("D")),
                CsvCell(row.GroupId is null ? null : row.GroupId.Value.ToString("D")),
                CsvCell(row.MerchantName),
                CsvCell(row.BillDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
                CsvCell(row.BillStatus),
                CsvCell(row.ReconciliationStatus),
                CsvCell(row.TotalAmount),
                CsvCell(row.Currency),
                CsvCell(row.ItemCount.ToString(CultureInfo.InvariantCulture)),
                CsvCell(row.ParticipantCount.ToString(CultureInfo.InvariantCulture)),
                CsvCell(row.PayerCount.ToString(CultureInfo.InvariantCulture)),
                CsvCell(row.CreatedAtUtc.ToString("O", CultureInfo.InvariantCulture)),
                CsvCell(row.UpdatedAtUtc.ToString("O", CultureInfo.InvariantCulture))));
        }

        return builder.ToString();
    }

    private static string CsvCell(string? value)
    {
        var safeValue = NeutralizeSpreadsheetFormula(value ?? string.Empty);
        return safeValue.IndexOfAny([',', '"', '\r', '\n']) >= 0
            ? $"\"{safeValue.Replace("\"", "\"\"", StringComparison.Ordinal)}\""
            : safeValue;
    }

    private static string NeutralizeSpreadsheetFormula(string value)
    {
        if (value.Length == 0)
        {
            return value;
        }

        var leadingSpacesTrimmed = value.TrimStart(' ');
        var startsWithControlPrefix = leadingSpacesTrimmed.Length > 0
            && leadingSpacesTrimmed[0] is '\t' or '\r' or '\n';
        var trimmedStart = value.TrimStart();
        var startsWithFormulaPrefix = trimmedStart.Length > 0
            && trimmedStart[0] is '=' or '+' or '-' or '@';
        return startsWithControlPrefix || startsWithFormulaPrefix
            ? $"'{value}"
            : value;
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : BillExportUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult BillExportUnavailable()
    {
        return Results.Problem(
            title: BillExportUnavailableTitle,
            detail: BillExportUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidBillExportRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidBillExportRequestTitle,
            detail: InvalidBillExportRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private sealed record ExpenseBillExportBuildResult(
        ExpenseBillExportResponse? Response,
        IResult? Error)
    {
        public static ExpenseBillExportBuildResult Succeeded(ExpenseBillExportResponse response)
        {
            return new ExpenseBillExportBuildResult(response, null);
        }

        public static ExpenseBillExportBuildResult Failed(IResult error)
        {
            return new ExpenseBillExportBuildResult(null, error);
        }
    }
}
