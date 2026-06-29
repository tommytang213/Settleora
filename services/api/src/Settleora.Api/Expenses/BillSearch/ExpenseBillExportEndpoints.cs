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
    private const string PersonalBillExportBodyMessage = "Bill export requests do not accept a body.";
    private const string GroupBillExportBodyMessage = "Group bill export requests do not accept a body.";
    private const string PersonalScopeType = "personal";
    private const string GroupScopeType = "group";
    private const string CsvFormat = "csv";
    private const string JsonFormat = "json";
    private const long BillExportSizeLimitBytes = 1_048_576;
    private static readonly TimeSpan ReadinessFreshness = TimeSpan.FromMinutes(5);

    private static readonly string[] SupportedFormats = [CsvFormat, JsonFormat];

    private static readonly HashSet<string> SupportedBillExportQueryFields = new(StringComparer.Ordinal)
    {
        "fromDate",
        "toDate",
        "status",
        "reconciliationStatus",
        "currency",
        "merchant",
        "search",
        "archiveState",
        "limit"
    };

    private static readonly HashSet<string> SupportedBillExportReadinessQueryFields = new(
        SupportedBillExportQueryFields.Concat(["format"]),
        StringComparer.Ordinal);

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
        personalBills.MapGet("/export-readiness", GetPersonalBillExportReadinessAsync);
        personalBills.MapGet("/export.json", ExportPersonalBillsJsonAsync);
        personalBills.MapGet("/export.csv", ExportPersonalBillsCsvAsync);

        var groupBills = app.MapGroup("/api/v1/groups/{groupId:guid}/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        groupBills.MapGet("/export-readiness", GetGroupBillExportReadinessAsync);
        groupBills.MapGet("/export.json", ExportGroupBillsJsonAsync);
        groupBills.MapGet("/export.csv", ExportGroupBillsCsvAsync);

        return app;
    }

    private static async Task<IResult> GetPersonalBillExportReadinessAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var result = await BuildPersonalExportReadinessResponseAsync(
            request,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            timeProvider,
            cancellationToken);

        return result.Error ?? Results.Json(result.Response);
    }

    private static async Task<IResult> GetGroupBillExportReadinessAsync(
        Guid groupId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var result = await BuildGroupExportReadinessResponseAsync(
            groupId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            timeProvider,
            cancellationToken);

        return result.Error ?? Results.Json(result.Response);
    }

    private static async Task<IResult> ExportPersonalBillsJsonAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var result = await BuildPersonalExportResponseAsync(
            request,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            timeProvider,
            cancellationToken);

        return result.Error ?? Results.Json(result.Response);
    }

    private static async Task<IResult> ExportPersonalBillsCsvAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var result = await BuildPersonalExportResponseAsync(
            request,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            timeProvider,
            cancellationToken);

        return result.Error ?? Results.Text(ToCsv(result.Response!.Rows), "text/csv", Encoding.UTF8);
    }

    private static async Task<IResult> ExportGroupBillsJsonAsync(
        Guid groupId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var result = await BuildGroupExportResponseAsync(
            groupId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            timeProvider,
            cancellationToken);

        return result.Error ?? Results.Json(result.Response);
    }

    private static async Task<IResult> ExportGroupBillsCsvAsync(
        Guid groupId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var result = await BuildGroupExportResponseAsync(
            groupId,
            request,
            currentActorAccessor,
            businessAuthorizationService,
            dbContext,
            timeProvider,
            cancellationToken);

        return result.Error ?? Results.Text(ToCsv(result.Response!.Rows), "text/csv", Encoding.UTF8);
    }

    private static async Task<ExpenseBillExportBuildResult> BuildPersonalExportResponseAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var filterReadResult = ReadExportFilter(request, PersonalBillExportBodyMessage, allowFormat: false);
        if (!filterReadResult.Succeeded || filterReadResult.Filter is null)
        {
            return ExpenseBillExportBuildResult.Failed(InvalidBillExportRequest(filterReadResult.Errors));
        }

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

        var rows = await LoadRowsAsync(
            ExpenseBillSearchQueries.VisiblePersonalBillsIncludingArchived(dbContext, actor.UserProfileId),
            filterReadResult.Filter,
            cancellationToken);

        return ExpenseBillExportBuildResult.Succeeded(BuildResponse(filterReadResult.Filter, rows, timeProvider));
    }

    private static async Task<ExpenseBillExportBuildResult> BuildGroupExportResponseAsync(
        Guid groupId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var filterReadResult = ReadExportFilter(request, GroupBillExportBodyMessage, allowFormat: false);
        if (!filterReadResult.Succeeded || filterReadResult.Filter is null)
        {
            return ExpenseBillExportBuildResult.Failed(InvalidBillExportRequest(filterReadResult.Errors));
        }

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

        var rows = await LoadRowsAsync(
            ExpenseBillSearchQueries.VisibleGroupBillsIncludingArchived(dbContext, groupId),
            filterReadResult.Filter,
            cancellationToken);

        return ExpenseBillExportBuildResult.Succeeded(BuildResponse(filterReadResult.Filter, rows, timeProvider));
    }

    private static async Task<ExpenseBillExportReadinessBuildResult> BuildPersonalExportReadinessResponseAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var filterReadResult = ReadExportFilter(request, PersonalBillExportBodyMessage, allowFormat: true);
        if (!filterReadResult.Succeeded || filterReadResult.Filter is null)
        {
            return ExpenseBillExportReadinessBuildResult.Failed(InvalidBillExportRequest(filterReadResult.Errors));
        }

        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return ExpenseBillExportReadinessBuildResult.Failed(Unauthenticated());
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return ExpenseBillExportReadinessBuildResult.Failed(MapAuthorizationFailure(authorizationResult));
        }

        var rowCount = await CountRowsAsync(
            ExpenseBillSearchQueries.VisiblePersonalBillsIncludingArchived(dbContext, actor.UserProfileId),
            filterReadResult.Filter,
            cancellationToken);

        return ExpenseBillExportReadinessBuildResult.Succeeded(BuildReadinessResponse(
            PersonalScopeType,
            groupId: null,
            filterReadResult.Filter,
            ReadRequestedFormat(request),
            rowCount,
            timeProvider));
    }

    private static async Task<ExpenseBillExportReadinessBuildResult> BuildGroupExportReadinessResponseAsync(
        Guid groupId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var filterReadResult = ReadExportFilter(request, GroupBillExportBodyMessage, allowFormat: true);
        if (!filterReadResult.Succeeded || filterReadResult.Filter is null)
        {
            return ExpenseBillExportReadinessBuildResult.Failed(InvalidBillExportRequest(filterReadResult.Errors));
        }

        if (!currentActorAccessor.TryGetCurrentActor(out _))
        {
            return ExpenseBillExportReadinessBuildResult.Failed(Unauthenticated());
        }

        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return ExpenseBillExportReadinessBuildResult.Failed(MapAuthorizationFailure(authorizationResult));
        }

        var rowCount = await CountRowsAsync(
            ExpenseBillSearchQueries.VisibleGroupBillsIncludingArchived(dbContext, groupId),
            filterReadResult.Filter,
            cancellationToken);

        return ExpenseBillExportReadinessBuildResult.Succeeded(BuildReadinessResponse(
            GroupScopeType,
            groupId,
            filterReadResult.Filter,
            ReadRequestedFormat(request),
            rowCount,
            timeProvider));
    }

    private static BillExportFilterReadResult ReadExportFilter(
        HttpRequest request,
        string bodyMessage,
        bool allowFormat)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        RejectExportRequestBody(request, bodyMessage, errors);
        RejectUnsupportedExportQueryFields(request, allowFormat, errors);

        var fromDate = ReadOptionalQueryString(request, "fromDate", errors);
        var toDate = ReadOptionalQueryString(request, "toDate", errors);
        var status = ReadOptionalQueryString(request, "status", errors);
        var reconciliationStatus = ReadOptionalQueryString(request, "reconciliationStatus", errors);
        var currency = ReadOptionalQueryString(request, "currency", errors);
        var merchant = ReadOptionalQueryString(request, "merchant", errors);
        var search = ReadOptionalQueryString(request, "search", errors);
        var archiveState = ReadOptionalQueryString(request, "archiveState", errors);
        var limit = ReadOptionalQueryString(request, "limit", errors);
        ExpenseBillSearchFilter? filter = null;

        if (errors.Count == 0
            && !ExpenseBillSearchFilter.TryRead(
                fromDate,
                toDate,
                status,
                reconciliationStatus,
                currency,
                merchant,
                search,
                archiveState,
                limit,
                out filter,
                out var filterErrors))
        {
            foreach (var error in filterErrors)
            {
                foreach (var message in error.Value)
                {
                    AddError(errors, error.Key, message);
                }
            }
        }

        return errors.Count == 0
            ? BillExportFilterReadResult.Valid(filter!)
            : BillExportFilterReadResult.Invalid(ToErrorDictionary(errors));
    }

    private static void RejectExportRequestBody(
        HttpRequest request,
        string message,
        Dictionary<string, List<string>> errors)
    {
        if (RequestHasBody(request))
        {
            AddError(errors, "body", message);
        }
    }

    private static void RejectUnsupportedExportQueryFields(
        HttpRequest request,
        bool allowFormat,
        Dictionary<string, List<string>> errors)
    {
        var supportedFields = allowFormat
            ? SupportedBillExportReadinessQueryFields
            : SupportedBillExportQueryFields;

        foreach (var field in request.Query.Keys)
        {
            if (!supportedFields.Contains(field))
            {
                AddError(errors, "query", "Unsupported query fields are not allowed.");
                return;
            }
        }
    }

    private static string? ReadOptionalQueryString(
        HttpRequest request,
        string name,
        Dictionary<string, List<string>> errors)
    {
        if (!request.Query.TryGetValue(name, out var values) || values.Count == 0)
        {
            return null;
        }

        if (values.Count > 1)
        {
            AddError(errors, name, "Only one value is supported.");
            return null;
        }

        var raw = values.ToString();
        return string.IsNullOrWhiteSpace(raw) ? null : raw;
    }

    private static bool RequestHasBody(HttpRequest request)
    {
        return request.ContentLength.GetValueOrDefault() > 0
            || request.Headers.TryGetValue("Transfer-Encoding", out var transferEncoding)
            && transferEncoding.Count > 0;
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

    private static Task<int> CountRowsAsync(
        IQueryable<ExpenseBill> visibleBillsQuery,
        ExpenseBillSearchFilter filter,
        CancellationToken cancellationToken)
    {
        return visibleBillsQuery
            .ApplySearchFilter(filter)
            .CountAsync(cancellationToken);
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

    private static ExpenseBillExportReadinessResponse BuildReadinessResponse(
        string scopeType,
        Guid? groupId,
        ExpenseBillSearchFilter filter,
        string requestedFormat,
        int matchingRowCount,
        TimeProvider timeProvider)
    {
        var normalizedFormat = requestedFormat.Trim().ToLowerInvariant();
        var rejectedFilters = new List<ExpenseBillExportFilterRejectionResponse>();
        var supportedFormat = SupportedFormats.Contains(normalizedFormat, StringComparer.Ordinal);
        var estimatedRows = Math.Min(matchingRowCount, filter.Limit);
        var available = supportedFormat && estimatedRows > 0;
        var code = available
            ? "ready"
            : supportedFormat
                ? "no_exportable_records"
                : "unsupported_format";
        var message = code switch
        {
            "ready" => "This export is ready for the selected scope and filters.",
            "no_exportable_records" => "No exportable bills match the selected scope and filters.",
            _ => "The requested export format is not supported."
        };

        if (!supportedFormat)
        {
            rejectedFilters.Add(new ExpenseBillExportFilterRejectionResponse(
                "format",
                "unsupported_format",
                "Format must be csv or json."));
        }

        var exportLabel = normalizedFormat == JsonFormat ? "Export JSON" : "Export CSV";
        return new ExpenseBillExportReadinessResponse(
            scopeType,
            groupId,
            normalizedFormat,
            SupportedFormats,
            available,
            code,
            message,
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
            BuildDefaultedFilters(filter),
            rejectedFilters,
            ExpenseBillSearchFilter.MaxLimit,
            estimatedRows,
            BillExportSizeLimitBytes,
            null,
            false,
            BuildRedactions(),
            new ExpenseBillExportAuditPreviewResponse(
                "bill_export.execute",
                scopeType,
                groupId,
                normalizedFormat,
                WritesAuditOnReadiness: false,
                WritesAuditOnExport: true),
            new ExpenseBillExportConfirmationResponse(
                scopeType == GroupScopeType ? "Export group bills" : "Export personal bills",
                "Export a bounded bill-level file for the selected scope and filters. Receipt files, proof files, QR images, storage references, raw OCR text, private notes, secrets, and unrelated records are not included.",
                exportLabel),
            timeProvider.GetUtcNow().Add(ReadinessFreshness));
    }

    private static IReadOnlyList<ExpenseBillExportFilterDefaultResponse> BuildDefaultedFilters(
        ExpenseBillSearchFilter filter)
    {
        var defaults = new List<ExpenseBillExportFilterDefaultResponse>();
        if (filter.ArchiveState == ExpenseBillArchiveStates.Active)
        {
            defaults.Add(new ExpenseBillExportFilterDefaultResponse(
                "archiveState",
                ExpenseBillArchiveStates.Active,
                "Active bills are exported by default."));
        }

        if (filter.Limit == ExpenseBillSearchFilter.DefaultLimit)
        {
            defaults.Add(new ExpenseBillExportFilterDefaultResponse(
                "limit",
                ExpenseBillSearchFilter.DefaultLimit.ToString(CultureInfo.InvariantCulture),
                "Default row limit applied."));
        }

        return defaults;
    }

    private static IReadOnlyList<ExpenseBillExportRedactionResponse> BuildRedactions()
    {
        return
        [
            new ExpenseBillExportRedactionResponse(
                "file_bytes",
                "excluded",
                "Receipt files, proof files, QR images, and other storage bytes are not included."),
            new ExpenseBillExportRedactionResponse(
                "storage_internals",
                "excluded",
                "Storage provider paths, object keys, signed URLs, and filesystem paths are not included."),
            new ExpenseBillExportRedactionResponse(
                "sensitive_notes",
                "excluded",
                "Raw OCR text, private notes, and unrelated user data are not included.")
        ];
    }

    private static string ReadRequestedFormat(HttpRequest request)
    {
        return ReadOptionalQueryString(
                request,
                "format",
                new Dictionary<string, List<string>>(StringComparer.Ordinal))
            ?? CsvFormat;
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

    private static void AddError(
        Dictionary<string, List<string>> errors,
        string key,
        string message)
    {
        if (!errors.TryGetValue(key, out var values))
        {
            values = [];
            errors[key] = values;
        }

        if (!values.Contains(message, StringComparer.Ordinal))
        {
            values.Add(message);
        }
    }

    private static IDictionary<string, string[]> ToErrorDictionary(
        Dictionary<string, List<string>> errors)
    {
        return errors.ToDictionary(
            pair => pair.Key,
            pair => pair.Value.ToArray(),
            StringComparer.Ordinal);
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

    private sealed record ExpenseBillExportReadinessBuildResult(
        ExpenseBillExportReadinessResponse? Response,
        IResult? Error)
    {
        public static ExpenseBillExportReadinessBuildResult Succeeded(ExpenseBillExportReadinessResponse response)
        {
            return new ExpenseBillExportReadinessBuildResult(response, null);
        }

        public static ExpenseBillExportReadinessBuildResult Failed(IResult error)
        {
            return new ExpenseBillExportReadinessBuildResult(null, error);
        }
    }

    private sealed record BillExportFilterReadResult(
        ExpenseBillSearchFilter? Filter,
        IDictionary<string, string[]> Errors)
    {
        public bool Succeeded => Errors.Count == 0;

        public static BillExportFilterReadResult Valid(ExpenseBillSearchFilter filter)
        {
            return new BillExportFilterReadResult(filter, new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static BillExportFilterReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new BillExportFilterReadResult(null, errors);
        }
    }
}
