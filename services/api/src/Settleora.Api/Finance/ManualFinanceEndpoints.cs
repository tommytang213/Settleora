using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Finance;
using Settleora.Api.Domain.RecurringBills;
using Settleora.Api.Domain.Users;
using Settleora.Api.Expenses.RecurringBills;
using Settleora.Api.Money;
using Settleora.Api.Persistence;

namespace Settleora.Api.Finance;

internal static class ManualFinanceEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string ManualAccountUnavailableTitle = "Manual financial account unavailable";
    private const string ManualAccountUnavailableDetail = "The requested manual financial account is unavailable.";
    private const string ManualIncomeUnavailableTitle = "Manual income source unavailable";
    private const string ManualIncomeUnavailableDetail = "The requested manual income source is unavailable.";
    private const string InvalidManualAccountTitle = "Invalid manual financial account request";
    private const string InvalidManualIncomeTitle = "Invalid manual income source request";
    private const string InvalidManualFinanceSummaryTitle = "Invalid manual finance summary request";
    private const string InvalidManualFinanceNoBodyDetail = "This manual finance action does not accept a request body.";
    private const string InvalidManualAccountListBodyMessage = "Manual financial account list requests do not accept a body.";
    private const string InvalidManualAccountReadBodyMessage = "Manual financial account read requests do not accept a body.";
    private const string InvalidManualIncomeListBodyMessage = "Manual income source list requests do not accept a body.";
    private const string InvalidManualIncomeReadBodyMessage = "Manual income source read requests do not accept a body.";
    private const int DefaultSummaryWindowDays = 60;
    private const int MaxSummaryWindowDays = 366;
    private static readonly HashSet<string> AccountCreateFields = new(StringComparer.Ordinal)
    {
        "displayName",
        "accountType",
        "currentBalanceAmount",
        "currency",
        "balanceAsOfDate",
        "note"
    };

    private static readonly HashSet<string> AccountPatchFields = new(AccountCreateFields, StringComparer.Ordinal);
    private static readonly HashSet<string> IncomeFields = new(StringComparer.Ordinal)
    {
        "displayName",
        "amount",
        "currency",
        "cadence",
        "nextExpectedDate",
        "endDate",
        "manualFinancialAccountId",
        "note"
    };

    public static WebApplication MapManualFinanceEndpoints(this WebApplication app)
    {
        var accounts = app.MapGroup("/api/v1/manual-financial-accounts")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        accounts.MapGet("", ListAccountsAsync);
        accounts.MapPost("", CreateAccountAsync);
        accounts.MapGet("/{accountId:guid}", GetAccountAsync);
        accounts.MapPatch("/{accountId:guid}", PatchAccountAsync);
        accounts.MapPost("/{accountId:guid}/archive", ArchiveAccountAsync);

        var incomeSources = app.MapGroup("/api/v1/manual-income-sources")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        incomeSources.MapGet("", ListIncomeSourcesAsync);
        incomeSources.MapPost("", CreateIncomeSourceAsync);
        incomeSources.MapGet("/{incomeSourceId:guid}", GetIncomeSourceAsync);
        incomeSources.MapPut("/{incomeSourceId:guid}", UpdateIncomeSourceAsync);
        incomeSources.MapPost("/{incomeSourceId:guid}/archive", ArchiveIncomeSourceAsync);

        var summary = app.MapGroup("/api/v1/manual-finance")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);
        summary.MapGet("/summary", GetSummaryAsync);

        return app;
    }

    private static async Task<IResult> GetSummaryAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ExpenseBillCalculationService calculationService,
        RecurringBillScheduleService recurringBillScheduleService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var now = timeProvider.GetUtcNow();
        var windowResult = ReadSummaryWindow(request, now);
        if (!windowResult.Succeeded || windowResult.Window is null)
        {
            return InvalidSummary(windowResult.Errors);
        }

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken);
        if (!authorization.Allowed)
        {
            return authorization.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
                ? Unauthenticated()
                : Results.Problem(
                    title: "Manual finance summary unavailable",
                    detail: "The requested manual finance summary is unavailable.",
                    statusCode: StatusCodes.Status404NotFound);
        }

        var window = windowResult.Window;
        var accountRows = await VisibleAccounts(dbContext, actor.UserProfileId, trackChanges: false)
            .Where(account => account.ArchivedAtUtc == null
                && account.Status == ManualFinancialAccountStatuses.Active)
            .Select(account => new CurrencyAmount(account.CurrentBalanceCurrency, account.CurrentBalanceAmount))
            .ToListAsync(cancellationToken);

        var incomeRows = await VisibleIncomeSources(dbContext, actor.UserProfileId, trackChanges: false)
            .Where(income => income.ArchivedAtUtc == null
                && income.Status == ManualIncomeSourceStatuses.Active
                && income.Cadence == ManualIncomeCadences.OneTime
                && income.NextExpectedDate >= window.StartDate
                && income.NextExpectedDate <= window.EndDate)
            .Select(income => new CurrencyAmount(income.Currency, income.Amount))
            .ToListAsync(cancellationToken);

        var recurringIncomeSources = await VisibleIncomeSources(dbContext, actor.UserProfileId, trackChanges: false)
            .Where(income => income.ArchivedAtUtc == null
                && income.Status == ManualIncomeSourceStatuses.Active
                && income.Cadence != ManualIncomeCadences.OneTime
                && (income.EndDate == null || income.EndDate >= window.StartDate)
                && income.NextExpectedDate <= window.EndDate)
            .Select(income => new ManualIncomeProjectionSource(
                income.Currency,
                income.Amount,
                income.Cadence,
                income.NextExpectedDate,
                income.EndDate))
            .ToListAsync(cancellationToken);
        var recurringIncomeRows = ProjectRecurringIncomeRows(
            recurringIncomeSources,
            window.StartDate,
            window.EndDate);

        var futureBillRows = await VisiblePersonalOneTimeFutureBills(dbContext, actor.UserProfileId)
            .Where(bill => bill.BillDate >= window.StartDate
                && bill.BillDate <= window.EndDate)
            .Select(bill => new CurrencyAmount(bill.TotalCurrency, bill.TotalAmount))
            .ToListAsync(cancellationToken);

        var groupFutureBills = await VisibleGroupOneTimeFutureBills(dbContext, actor.UserProfileId)
            .Where(bill => bill.BillDate >= window.StartDate
                && bill.BillDate <= window.EndDate)
            .Select(bill => new GroupFutureBillProjectionSource(
                bill.Id,
                bill.Participants
                    .Where(participant => participant.UserProfileId == actor.UserProfileId)
                    .Select(participant => new GroupFutureBillProjectionShare(
                        participant.ResolvedShareCurrency,
                        participant.ResolvedShareAmount))
                    .ToArray()))
            .ToListAsync(cancellationToken);
        var groupFutureBillProjection = ProjectGroupFutureBillRows(groupFutureBills);

        var recurringBillTemplates = await VisiblePersonalRecurringBillTemplates(dbContext, actor.UserProfileId)
            .Where(template => template.Status == RecurringBillTemplateStatuses.Active
                && template.ArchivedAtUtc == null
                && (template.EndDate == null || template.EndDate >= window.StartDate)
                && template.StartDate <= window.EndDate)
            .Select(template => new RecurringBillProjectionSource(
                template.ForecastCurrency,
                template.ForecastAmount,
                template.ScheduleType,
                template.IntervalCount,
                template.IntervalDays,
                template.StartDate,
                template.EndDate,
                template.DueOffsetDays))
            .ToListAsync(cancellationToken);
        var recurringBillRows = ProjectRecurringBillRows(
            recurringBillTemplates,
            recurringBillScheduleService,
            window.StartDate,
            window.EndDate);

        var groupRecurringBillTemplates = await VisibleGroupRecurringBillTemplates(dbContext, actor.UserProfileId)
            .Where(template => template.Status == RecurringBillTemplateStatuses.Active
                && template.ArchivedAtUtc == null
                && (template.EndDate == null || template.EndDate >= window.StartDate)
                && template.StartDate <= window.EndDate)
            .Select(template => new GroupRecurringBillProjectionSource(
                template.Id,
                template.OwnerUserProfileId,
                template.GroupId!.Value,
                template.MerchantName,
                template.PayloadJson,
                template.ScheduleType,
                template.IntervalCount,
                template.IntervalDays,
                template.StartDate,
                template.EndDate,
                template.DueOffsetDays))
            .ToListAsync(cancellationToken);
        var groupRecurringBillProjection = ProjectGroupRecurringBillRows(
            groupRecurringBillTemplates,
            actor.UserProfileId,
            calculationService,
            recurringBillScheduleService,
            timeProvider.GetUtcNow(),
            window.StartDate,
            window.EndDate);

        var currencies = accountRows
            .Concat(incomeRows)
            .Concat(recurringIncomeRows)
            .Concat(futureBillRows)
            .Concat(groupFutureBillProjection.Rows)
            .Concat(recurringBillRows)
            .Concat(groupRecurringBillProjection.Rows)
            .Select(row => row.Currency)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(currency => currency, StringComparer.Ordinal)
            .ToArray();

        var responseWarnings = new List<string>
        {
            "doesNotIncludeBankSync",
            "doesNotConvertCurrency",
            "includesOnlyActiveManualAccounts",
            "includesOnlyOneTimeManualIncomeInWindow",
            "includesSafeRecurringManualIncomeInWindow",
            "includesOnlyPersonalOneTimeFutureBillDraftsInWindow",
            "includesPersonalRecurringBillProjectionInWindow",
            "includesSafeGroupFutureBillProjectionInWindow",
            "includesSafeGroupRecurringBillProjectionInWindow"
        };
        if (groupFutureBillProjection.ExcludedUnsupportedCount > 0)
        {
            responseWarnings.Add("groupFutureBillsPartiallyExcludedUnsupportedActorShare");
        }

        if (groupRecurringBillProjection.ExcludedUnsupportedCount > 0)
        {
            responseWarnings.Add("groupRecurringBillsPartiallyExcludedUnsupportedActorShare");
        }

        var rows = currencies.Select(currency =>
        {
            var accountTotal = SumByCurrency(accountRows, currency);
            var incomeTotal = SumByCurrency(incomeRows, currency);
            var recurringIncomeTotal = SumByCurrency(recurringIncomeRows, currency);
            var obligationTotal = SumByCurrency(futureBillRows, currency);
            var groupObligationTotal = SumByCurrency(groupFutureBillProjection.Rows, currency);
            var recurringObligationTotal = SumByCurrency(recurringBillRows, currency);
            var groupRecurringObligationTotal = SumByCurrency(groupRecurringBillProjection.Rows, currency);
            var estimatedAvailable = accountTotal + incomeTotal + recurringIncomeTotal
                - obligationTotal
                - groupObligationTotal
                - recurringObligationTotal
                - groupRecurringObligationTotal;
            var rowWarnings = new List<string>
            {
                "doesNotConvertCurrency",
                "includesSafeRecurringManualIncomeInWindow",
                "includesPersonalRecurringBillProjectionInWindow",
                "includesSafeGroupFutureBillProjectionInWindow",
                "includesSafeGroupRecurringBillProjectionInWindow"
            };
            if (groupFutureBillProjection.ExcludedUnsupportedCount > 0)
            {
                rowWarnings.Add("groupFutureBillsPartiallyExcludedUnsupportedActorShare");
            }

            if (groupRecurringBillProjection.ExcludedUnsupportedCount > 0)
            {
                rowWarnings.Add("groupRecurringBillsPartiallyExcludedUnsupportedActorShare");
            }

            return new ManualFinanceSummaryCurrencyRowResponse(
                currency,
                FormatAmount(accountTotal),
                FormatAmount(incomeTotal),
                FormatAmount(recurringIncomeTotal),
                FormatAmount(obligationTotal),
                FormatAmount(groupObligationTotal),
                FormatAmount(recurringObligationTotal),
                FormatAmount(groupRecurringObligationTotal),
                FormatAmount(estimatedAvailable),
                rowWarnings);
        }).ToArray();

        return Results.Ok(new ManualFinanceSummaryResponse(
            now,
            window.StartDate,
            window.EndDate,
            rows,
            responseWarnings));
    }

    private static async Task<IResult> ListAccountsAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var listFilterResult = ReadManualFinanceListFilter(request, InvalidManualAccountListBodyMessage);
        if (!listFilterResult.Succeeded || listFilterResult.Filter is null)
        {
            return InvalidAccount(listFilterResult.Errors);
        }

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken);
        if (!authorization.Allowed)
        {
            return MapAccountAuthorizationFailure(authorization);
        }

        var includeArchived = listFilterResult.Filter.IncludeArchived;
        var query = VisibleAccounts(dbContext, actor.UserProfileId, trackChanges: false);
        if (!includeArchived)
        {
            query = query.Where(account => account.ArchivedAtUtc == null);
        }

        var accounts = await query
            .OrderBy(account => account.DisplayName)
            .ThenBy(account => account.Id)
            .ToListAsync(cancellationToken);
        return Results.Ok(new ManualFinancialAccountListResponse(accounts.Select(MapAccount).ToArray()));
    }

    private static async Task<IResult> CreateAccountAsync(
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

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken);
        if (!authorization.Allowed)
        {
            return MapAccountAuthorizationFailure(authorization);
        }

        var readResult = await ReadAccountCreateRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidAccount(readResult.Errors);
        }

        var now = timeProvider.GetUtcNow();
        var submitted = readResult.Request;
        var account = new ManualFinancialAccount
        {
            Id = Guid.NewGuid(),
            OwnerUserProfileId = actor.UserProfileId,
            DisplayName = submitted.DisplayName,
            AccountType = submitted.AccountType,
            CurrentBalanceAmount = submitted.CurrentBalanceAmount,
            CurrentBalanceCurrency = submitted.Currency,
            BalanceAsOfDate = submitted.BalanceAsOfDate,
            Note = submitted.Note,
            Status = ManualFinancialAccountStatuses.Active,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.Set<ManualFinancialAccount>().Add(account);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/v1/manual-financial-accounts/{account.Id:D}", MapAccount(account));
    }

    private static async Task<IResult> GetAccountAsync(
        Guid accountId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readoutResult = ReadManualFinanceReadoutRequest(request, InvalidManualAccountReadBodyMessage);
        if (!readoutResult.Succeeded)
        {
            return InvalidAccount(readoutResult.Errors);
        }

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken);
        if (!authorization.Allowed)
        {
            return MapAccountAuthorizationFailure(authorization);
        }

        var account = await VisibleAccounts(dbContext, actor.UserProfileId, trackChanges: false)
            .SingleOrDefaultAsync(candidate => candidate.Id == accountId, cancellationToken);
        return account is null ? AccountUnavailable() : Results.Ok(MapAccount(account));
    }

    private static async Task<IResult> PatchAccountAsync(
        Guid accountId,
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

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken);
        if (!authorization.Allowed)
        {
            return MapAccountAuthorizationFailure(authorization);
        }

        var readResult = await ReadAccountPatchRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidAccount(readResult.Errors);
        }

        var account = await VisibleAccounts(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(candidate => candidate.Id == accountId, cancellationToken);
        if (account is null)
        {
            return AccountUnavailable();
        }

        if (readResult.Request.DisplayNameSpecified)
        {
            account.DisplayName = readResult.Request.DisplayName!;
        }

        if (readResult.Request.AccountTypeSpecified)
        {
            account.AccountType = readResult.Request.AccountType!;
        }

        if (readResult.Request.CurrencySpecified)
        {
            account.CurrentBalanceCurrency = readResult.Request.Currency!;
        }

        if (readResult.Request.CurrentBalanceAmountSpecified)
        {
            account.CurrentBalanceAmount = readResult.Request.CurrentBalanceAmount!.Value;
        }

        if (readResult.Request.BalanceAsOfDateSpecified)
        {
            account.BalanceAsOfDate = readResult.Request.BalanceAsOfDate!.Value;
        }

        if (readResult.Request.NoteSpecified)
        {
            account.Note = readResult.Request.Note;
        }

        account.UpdatedAtUtc = timeProvider.GetUtcNow();
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(MapAccount(account));
    }

    private static async Task<IResult> ArchiveAccountAsync(
        Guid accountId,
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

        if (RequestHasBody(request))
        {
            return InvalidAccountNoBody();
        }

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken);
        if (!authorization.Allowed)
        {
            return MapAccountAuthorizationFailure(authorization);
        }

        var account = await VisibleAccounts(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(candidate => candidate.Id == accountId, cancellationToken);
        if (account is null)
        {
            return AccountUnavailable();
        }

        if (account.ArchivedAtUtc is null)
        {
            var now = timeProvider.GetUtcNow();
            account.Status = ManualFinancialAccountStatuses.Archived;
            account.ArchivedAtUtc = now;
            account.UpdatedAtUtc = now;
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return Results.Ok(MapAccount(account));
    }

    private static async Task<IResult> ListIncomeSourcesAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var listFilterResult = ReadManualFinanceListFilter(request, InvalidManualIncomeListBodyMessage);
        if (!listFilterResult.Succeeded || listFilterResult.Filter is null)
        {
            return InvalidIncome(listFilterResult.Errors);
        }

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken);
        if (!authorization.Allowed)
        {
            return MapIncomeAuthorizationFailure(authorization);
        }

        var includeArchived = listFilterResult.Filter.IncludeArchived;
        var query = VisibleIncomeSources(dbContext, actor.UserProfileId, trackChanges: false);
        if (!includeArchived)
        {
            query = query.Where(income => income.ArchivedAtUtc == null);
        }

        var incomeSources = await query
            .OrderBy(income => income.NextExpectedDate)
            .ThenBy(income => income.DisplayName)
            .ThenBy(income => income.Id)
            .ToListAsync(cancellationToken);
        return Results.Ok(new ManualIncomeSourceListResponse(incomeSources.Select(MapIncome).ToArray()));
    }

    private static async Task<IResult> CreateIncomeSourceAsync(
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

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken);
        if (!authorization.Allowed)
        {
            return MapIncomeAuthorizationFailure(authorization);
        }

        var readResult = await ReadIncomeRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidIncome(readResult.Errors);
        }

        if (readResult.Request.ManualFinancialAccountId is not null
            && !await VisibleAccounts(dbContext, actor.UserProfileId, trackChanges: false)
                .AnyAsync(account => account.Id == readResult.Request.ManualFinancialAccountId.Value
                    && account.ArchivedAtUtc == null, cancellationToken))
        {
            return IncomeUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        var submitted = readResult.Request;
        var income = new ManualIncomeSource
        {
            Id = Guid.NewGuid(),
            OwnerUserProfileId = actor.UserProfileId,
            ManualFinancialAccountId = submitted.ManualFinancialAccountId,
            DisplayName = submitted.DisplayName,
            Amount = submitted.Amount,
            Currency = submitted.Currency,
            Cadence = submitted.Cadence,
            NextExpectedDate = submitted.NextExpectedDate,
            EndDate = submitted.EndDate,
            Note = submitted.Note,
            Status = ManualIncomeSourceStatuses.Active,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.Set<ManualIncomeSource>().Add(income);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/v1/manual-income-sources/{income.Id:D}", MapIncome(income));
    }

    private static async Task<IResult> GetIncomeSourceAsync(
        Guid incomeSourceId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readoutResult = ReadManualFinanceReadoutRequest(request, InvalidManualIncomeReadBodyMessage);
        if (!readoutResult.Succeeded)
        {
            return InvalidIncome(readoutResult.Errors);
        }

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken);
        if (!authorization.Allowed)
        {
            return MapIncomeAuthorizationFailure(authorization);
        }

        var income = await VisibleIncomeSources(dbContext, actor.UserProfileId, trackChanges: false)
            .SingleOrDefaultAsync(candidate => candidate.Id == incomeSourceId, cancellationToken);
        return income is null ? IncomeUnavailable() : Results.Ok(MapIncome(income));
    }

    private static async Task<IResult> UpdateIncomeSourceAsync(
        Guid incomeSourceId,
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

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken);
        if (!authorization.Allowed)
        {
            return MapIncomeAuthorizationFailure(authorization);
        }

        var readResult = await ReadIncomeRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidIncome(readResult.Errors);
        }

        var income = await VisibleIncomeSources(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(candidate => candidate.Id == incomeSourceId, cancellationToken);
        if (income is null)
        {
            return IncomeUnavailable();
        }

        if (readResult.Request.ManualFinancialAccountId is not null
            && !await VisibleAccounts(dbContext, actor.UserProfileId, trackChanges: false)
                .AnyAsync(account => account.Id == readResult.Request.ManualFinancialAccountId.Value
                    && account.ArchivedAtUtc == null, cancellationToken))
        {
            return IncomeUnavailable();
        }

        var submitted = readResult.Request;
        income.ManualFinancialAccountId = submitted.ManualFinancialAccountId;
        income.DisplayName = submitted.DisplayName;
        income.Amount = submitted.Amount;
        income.Currency = submitted.Currency;
        income.Cadence = submitted.Cadence;
        income.NextExpectedDate = submitted.NextExpectedDate;
        income.EndDate = submitted.EndDate;
        income.Note = submitted.Note;
        income.UpdatedAtUtc = timeProvider.GetUtcNow();
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Ok(MapIncome(income));
    }

    private static async Task<IResult> ArchiveIncomeSourceAsync(
        Guid incomeSourceId,
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

        if (RequestHasBody(request))
        {
            return InvalidIncomeNoBody();
        }

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken);
        if (!authorization.Allowed)
        {
            return MapIncomeAuthorizationFailure(authorization);
        }

        var income = await VisibleIncomeSources(dbContext, actor.UserProfileId, trackChanges: true)
            .SingleOrDefaultAsync(candidate => candidate.Id == incomeSourceId, cancellationToken);
        if (income is null)
        {
            return IncomeUnavailable();
        }

        if (income.ArchivedAtUtc is null)
        {
            var now = timeProvider.GetUtcNow();
            income.Status = ManualIncomeSourceStatuses.Archived;
            income.ArchivedAtUtc = now;
            income.UpdatedAtUtc = now;
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return Results.Ok(MapIncome(income));
    }

    private static IQueryable<ManualFinancialAccount> VisibleAccounts(
        SettleoraDbContext dbContext,
        Guid ownerUserProfileId,
        bool trackChanges)
    {
        var query = dbContext.Set<ManualFinancialAccount>()
            .Where(account => account.OwnerUserProfileId == ownerUserProfileId
                && account.OwnerUserProfile.DeletedAtUtc == null);
        return trackChanges ? query : query.AsNoTracking();
    }

    private static IQueryable<ManualIncomeSource> VisibleIncomeSources(
        SettleoraDbContext dbContext,
        Guid ownerUserProfileId,
        bool trackChanges)
    {
        var query = dbContext.Set<ManualIncomeSource>()
            .Where(income => income.OwnerUserProfileId == ownerUserProfileId
                && income.OwnerUserProfile.DeletedAtUtc == null);
        return trackChanges ? query : query.AsNoTracking();
    }

    private static IQueryable<ExpenseBill> VisiblePersonalOneTimeFutureBills(
        SettleoraDbContext dbContext,
        Guid ownerUserProfileId)
    {
        return dbContext.Set<ExpenseBill>()
            .AsNoTracking()
            .Where(bill => bill.GroupId == null
                && bill.BillOwnerUserProfileId == ownerUserProfileId
                && bill.BillOwnerUserProfile.DeletedAtUtc == null
                && bill.ArchivedAtUtc == null
                && (bill.Status == ExpenseBillStatuses.Draft
                    || bill.Status == ExpenseBillStatuses.PendingConfirmation));
    }

    private static IQueryable<ExpenseBill> VisibleGroupOneTimeFutureBills(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId)
    {
        return dbContext.Set<ExpenseBill>()
            .AsNoTracking()
            .Where(bill => bill.GroupId != null
                && bill.Group != null
                && bill.Group.DeletedAtUtc == null
                && bill.CreatedByUserProfile.DeletedAtUtc == null
                && bill.ArchivedAtUtc == null
                && (bill.Status == ExpenseBillStatuses.Draft
                    || bill.Status == ExpenseBillStatuses.PendingConfirmation)
                && bill.Group.Memberships.Any(membership => membership.UserProfileId == actorUserProfileId
                    && membership.Status == GroupMembershipStatuses.Active
                    && membership.UserProfile.DeletedAtUtc == null));
    }

    private static IQueryable<RecurringBillTemplate> VisiblePersonalRecurringBillTemplates(
        SettleoraDbContext dbContext,
        Guid ownerUserProfileId)
    {
        return dbContext.Set<RecurringBillTemplate>()
            .AsNoTracking()
            .Where(template => template.GroupId == null
                && template.OwnerUserProfileId == ownerUserProfileId
                && template.OwnerUserProfile.DeletedAtUtc == null);
    }

    private static IQueryable<RecurringBillTemplate> VisibleGroupRecurringBillTemplates(
        SettleoraDbContext dbContext,
        Guid actorUserProfileId)
    {
        return dbContext.Set<RecurringBillTemplate>()
            .AsNoTracking()
            .Where(template => template.GroupId != null
                && template.OwnerUserProfile.DeletedAtUtc == null
                && template.Group != null
                && template.Group.DeletedAtUtc == null
                && template.Group.Memberships.Any(membership => membership.UserProfileId == actorUserProfileId
                    && membership.Status == GroupMembershipStatuses.Active
                    && membership.UserProfile.DeletedAtUtc == null));
    }

    private static IReadOnlyList<CurrencyAmount> ProjectRecurringIncomeRows(
        IReadOnlyList<ManualIncomeProjectionSource> sources,
        DateOnly windowStartDate,
        DateOnly windowEndDate)
    {
        var rows = new List<CurrencyAmount>();
        foreach (var source in sources)
        {
            foreach (var expectedDate in GenerateManualIncomeOccurrences(source, windowStartDate, windowEndDate))
            {
                if (expectedDate >= windowStartDate && expectedDate <= windowEndDate)
                {
                    rows.Add(new CurrencyAmount(source.Currency, source.Amount));
                }
            }
        }

        return rows;
    }

    private static GroupProjectionResult ProjectGroupFutureBillRows(
        IReadOnlyList<GroupFutureBillProjectionSource> bills)
    {
        var rows = new List<CurrencyAmount>();
        var excludedUnsupportedCount = 0;
        foreach (var bill in bills)
        {
            if (bill.Participants.Count != 1
                || string.IsNullOrWhiteSpace(bill.Participants[0].ResolvedShareCurrency))
            {
                excludedUnsupportedCount++;
                continue;
            }

            rows.Add(new CurrencyAmount(
                bill.Participants[0].ResolvedShareCurrency,
                bill.Participants[0].ResolvedShareAmount));
        }

        return new GroupProjectionResult(rows, excludedUnsupportedCount);
    }

    private static IReadOnlyList<CurrencyAmount> ProjectRecurringBillRows(
        IReadOnlyList<RecurringBillProjectionSource> sources,
        RecurringBillScheduleService scheduleService,
        DateOnly windowStartDate,
        DateOnly windowEndDate)
    {
        var rows = new List<CurrencyAmount>();
        foreach (var source in sources)
        {
            var schedule = new RecurringBillSchedule(
                source.ScheduleType,
                source.IntervalCount,
                source.IntervalDays,
                source.StartDate,
                source.EndDate,
                source.DueOffsetDays);
            foreach (var occurrence in scheduleService.GenerateOccurrences(
                schedule,
                windowStartDate,
                windowEndDate,
                RecurringBillConstraints.MaxForecastOccurrences))
            {
                rows.Add(new CurrencyAmount(source.Currency, source.Amount));
            }
        }

        return rows;
    }

    private static GroupProjectionResult ProjectGroupRecurringBillRows(
        IReadOnlyList<GroupRecurringBillProjectionSource> sources,
        Guid actorUserProfileId,
        ExpenseBillCalculationService calculationService,
        RecurringBillScheduleService scheduleService,
        DateTimeOffset now,
        DateOnly windowStartDate,
        DateOnly windowEndDate)
    {
        var rows = new List<CurrencyAmount>();
        var excludedUnsupportedCount = 0;
        foreach (var source in sources)
        {
            var payload = RecurringBillTemplatePayloadCodec.Deserialize(source.PayloadJson);
            if (payload is null)
            {
                excludedUnsupportedCount++;
                continue;
            }

            var schedule = new RecurringBillSchedule(
                source.ScheduleType,
                source.IntervalCount,
                source.IntervalDays,
                source.StartDate,
                source.EndDate,
                source.DueOffsetDays);
            var occurrences = scheduleService.GenerateOccurrences(
                schedule,
                windowStartDate,
                windowEndDate,
                RecurringBillConstraints.MaxForecastOccurrences);

            foreach (var occurrence in occurrences)
            {
                var actorShare = CalculateGroupRecurringActorShare(
                    source,
                    payload,
                    actorUserProfileId,
                    occurrence.OccurrenceDate,
                    calculationService,
                    now);
                if (actorShare is null)
                {
                    excludedUnsupportedCount++;
                    continue;
                }

                rows.Add(actorShare);
            }
        }

        return new GroupProjectionResult(rows, excludedUnsupportedCount);
    }

    private static CurrencyAmount? CalculateGroupRecurringActorShare(
        GroupRecurringBillProjectionSource source,
        RecurringBillTemplatePayload payload,
        Guid actorUserProfileId,
        DateOnly occurrenceDate,
        ExpenseBillCalculationService calculationService,
        DateTimeOffset now)
    {
        var bill = RecurringBillDraftBuilder.CreateDraftBill(
            source.GroupId,
            source.OwnerUserProfileId,
            actorUserProfileId,
            source.MerchantName,
            occurrenceDate,
            payload,
            now);
        var initialCalculation = calculationService.Calculate(bill);
        if (!initialCalculation.Succeeded)
        {
            return null;
        }

        RecurringBillDraftBuilder.ApplyCalculation(bill, initialCalculation);
        RecurringBillDraftBuilder.AddPayers(
            bill,
            actorUserProfileId,
            actorUserProfileId,
            payload,
            initialCalculation.BillTotal!.Amount,
            initialCalculation.BillTotal.Currency.Value,
            now);
        var finalCalculation = calculationService.Calculate(bill);
        if (!finalCalculation.Succeeded)
        {
            return null;
        }

        var actorShare = finalCalculation.ParticipantShares
            .SingleOrDefault(participant => participant.UserProfileId == actorUserProfileId);
        return actorShare is null || string.IsNullOrWhiteSpace(actorShare.ResolvedShareCurrency)
            ? null
            : new CurrencyAmount(actorShare.ResolvedShareCurrency, actorShare.ResolvedShareAmount);
    }

    private static IEnumerable<DateOnly> GenerateManualIncomeOccurrences(
        ManualIncomeProjectionSource source,
        DateOnly windowStartDate,
        DateOnly windowEndDate)
    {
        var occurrenceDate = source.NextExpectedDate;
        var iterationCount = 0;
        while (occurrenceDate <= windowEndDate
            && (source.EndDate is null || occurrenceDate <= source.EndDate.Value)
            && iterationCount < RecurringBillConstraints.MaxScheduleIterations)
        {
            if (occurrenceDate >= windowStartDate)
            {
                yield return occurrenceDate;
            }

            var nextOccurrenceDate = NextManualIncomeOccurrenceDate(source.Cadence, occurrenceDate);
            if (nextOccurrenceDate is null || nextOccurrenceDate.Value <= occurrenceDate)
            {
                yield break;
            }

            occurrenceDate = nextOccurrenceDate.Value;
            iterationCount++;
        }
    }

    private static DateOnly? NextManualIncomeOccurrenceDate(string cadence, DateOnly occurrenceDate)
    {
        return cadence switch
        {
            ManualIncomeCadences.Weekly => occurrenceDate.AddDays(7),
            ManualIncomeCadences.Biweekly => occurrenceDate.AddDays(14),
            ManualIncomeCadences.Monthly => occurrenceDate.AddMonths(1),
            ManualIncomeCadences.Quarterly => occurrenceDate.AddMonths(3),
            ManualIncomeCadences.Yearly => occurrenceDate.AddYears(1),
            _ => null
        };
    }

    private static async Task<RequestReadResult<AccountCreateRequest>> ReadAccountCreateRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        using var document = await JsonDocument.ParseAsync(request.Body, cancellationToken: cancellationToken);
        var root = document.RootElement;
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        AddUnsupportedFieldErrors(root, AccountCreateFields, errors);
        var displayName = ReadBoundedString(root, "displayName", required: true, ManualFinanceConstraints.DisplayNameMaxLength, errors);
        var accountType = ReadAccountType(root, "accountType", required: true, errors);
        var currency = ReadCurrency(root, "currency", required: true, errors);
        var amount = ReadMoney(root, "currentBalanceAmount", currency, "currency", allowNegative: true, allowZero: true, errors);
        var balanceAsOfDate = ReadDate(root, "balanceAsOfDate", required: true, errors);
        var note = ReadBoundedString(root, "note", required: false, ManualFinanceConstraints.NoteMaxLength, errors);

        return errors.Count > 0 || displayName is null || accountType is null || currency is null || amount is null || balanceAsOfDate is null
            ? RequestReadResult<AccountCreateRequest>.Failed(ToValidationDictionary(errors))
            : RequestReadResult<AccountCreateRequest>.Success(new AccountCreateRequest(displayName, accountType, amount.Value, currency, balanceAsOfDate.Value, note));
    }

    private static async Task<RequestReadResult<AccountPatchRequest>> ReadAccountPatchRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        using var document = await JsonDocument.ParseAsync(request.Body, cancellationToken: cancellationToken);
        var root = document.RootElement;
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        AddUnsupportedFieldErrors(root, AccountPatchFields, errors);
        var currencySpecified = TryGetProperty(root, "currency", out _);
        var amountSpecified = TryGetProperty(root, "currentBalanceAmount", out _);
        var currency = currencySpecified ? ReadCurrency(root, "currency", required: true, errors) : null;
        var patch = new AccountPatchRequest(
            TryGetProperty(root, "displayName", out _),
            ReadBoundedString(root, "displayName", required: false, ManualFinanceConstraints.DisplayNameMaxLength, errors),
            TryGetProperty(root, "accountType", out _),
            ReadAccountType(root, "accountType", required: false, errors),
            currencySpecified,
            currency,
            amountSpecified,
            amountSpecified ? ReadMoney(root, "currentBalanceAmount", currency, "currency", allowNegative: true, allowZero: true, errors) : null,
            TryGetProperty(root, "balanceAsOfDate", out _),
            ReadDate(root, "balanceAsOfDate", required: false, errors),
            TryGetProperty(root, "note", out _),
            ReadBoundedString(root, "note", required: false, ManualFinanceConstraints.NoteMaxLength, errors));

        if (patch.CurrentBalanceAmountSpecified && !patch.CurrencySpecified)
        {
            AddError(errors, "currency", "Currency is required when currentBalanceAmount is patched.");
        }

        return errors.Count > 0 ? RequestReadResult<AccountPatchRequest>.Failed(ToValidationDictionary(errors)) : RequestReadResult<AccountPatchRequest>.Success(patch);
    }

    private static async Task<RequestReadResult<IncomeRequest>> ReadIncomeRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        using var document = await JsonDocument.ParseAsync(request.Body, cancellationToken: cancellationToken);
        var root = document.RootElement;
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        AddUnsupportedFieldErrors(root, IncomeFields, errors);
        var displayName = ReadBoundedString(root, "displayName", required: true, ManualFinanceConstraints.DisplayNameMaxLength, errors);
        var currency = ReadCurrency(root, "currency", required: true, errors);
        var amount = ReadMoney(root, "amount", currency, "currency", allowNegative: false, allowZero: false, errors);
        var cadence = ReadIncomeCadence(root, "cadence", required: true, errors);
        var nextExpectedDate = ReadDate(root, "nextExpectedDate", required: true, errors);
        var endDate = ReadDate(root, "endDate", required: false, errors);
        var note = ReadBoundedString(root, "note", required: false, ManualFinanceConstraints.NoteMaxLength, errors);
        var accountId = ReadOptionalGuid(root, "manualFinancialAccountId", errors);
        if (nextExpectedDate is not null && endDate is not null && endDate.Value < nextExpectedDate.Value)
        {
            AddError(errors, "endDate", "End date must be on or after next expected date.");
        }

        return errors.Count > 0 || displayName is null || currency is null || amount is null || cadence is null || nextExpectedDate is null
            ? RequestReadResult<IncomeRequest>.Failed(ToValidationDictionary(errors))
            : RequestReadResult<IncomeRequest>.Success(new IncomeRequest(displayName, amount.Value, currency, cadence, nextExpectedDate.Value, endDate, accountId, note));
    }

    private static SummaryWindowReadResult ReadSummaryWindow(HttpRequest request, DateTimeOffset now)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        RejectSummaryRequestBody(request, errors);
        RejectUnsupportedSummaryQueryFields(request, errors);

        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var startDate = ReadOptionalQueryDate(request, "windowStartDate", errors) ?? today;
        var endDate = ReadOptionalQueryDate(request, "windowEndDate", errors) ?? startDate.AddDays(DefaultSummaryWindowDays);

        if (endDate < startDate)
        {
            AddError(errors, "windowEndDate", "Window end date must be on or after window start date.");
        }

        if (startDate.AddDays(MaxSummaryWindowDays) < endDate)
        {
            AddError(errors, "windowEndDate", $"Summary window must be no more than {MaxSummaryWindowDays} days.");
        }

        return errors.Count == 0
            ? SummaryWindowReadResult.Success(new SummaryWindow(startDate, endDate))
            : SummaryWindowReadResult.Failed(ToValidationDictionary(errors));
    }

    private static ManualFinanceListFilterReadResult ReadManualFinanceListFilter(
        HttpRequest request,
        string bodyMessage)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        RejectManualFinanceRequestBody(request, bodyMessage, errors);
        RejectUnsupportedManualFinanceListQueryFields(request, errors);
        var includeArchived = ReadOptionalQueryBool(request, "includeArchived", errors) ?? false;

        return errors.Count == 0
            ? ManualFinanceListFilterReadResult.Success(new ManualFinanceListFilter(includeArchived))
            : ManualFinanceListFilterReadResult.Failed(ToValidationDictionary(errors));
    }

    private static ManualFinanceReadoutReadResult ReadManualFinanceReadoutRequest(
        HttpRequest request,
        string bodyMessage)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        RejectManualFinanceRequestBody(request, bodyMessage, errors);
        RejectUnsupportedManualFinanceReadoutQueryFields(request, errors);

        return errors.Count == 0
            ? ManualFinanceReadoutReadResult.Success()
            : ManualFinanceReadoutReadResult.Failed(ToValidationDictionary(errors));
    }

    private static void RejectManualFinanceRequestBody(
        HttpRequest request,
        string message,
        Dictionary<string, List<string>> errors)
    {
        if (RequestHasBody(request))
        {
            AddError(errors, "body", message);
        }
    }

    private static void RejectUnsupportedManualFinanceListQueryFields(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        foreach (var field in request.Query.Keys)
        {
            if (!string.Equals(field, "includeArchived", StringComparison.Ordinal))
            {
                AddError(errors, "query", "Unsupported query fields are not allowed.");
                return;
            }
        }
    }

    private static void RejectUnsupportedManualFinanceReadoutQueryFields(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        if (request.Query.Count > 0)
        {
            AddError(errors, "query", "Unsupported query fields are not allowed.");
        }
    }

    private static bool? ReadOptionalQueryBool(
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
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        if (!bool.TryParse(raw, out var value))
        {
            AddError(errors, name, $"{name} must be a boolean string.");
            return null;
        }

        return value;
    }

    private static void RejectSummaryRequestBody(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        if (RequestHasBody(request))
        {
            AddError(errors, "body", "Manual finance summary requests do not accept a body.");
        }
    }

    private static void RejectUnsupportedSummaryQueryFields(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        foreach (var field in request.Query.Keys)
        {
            if (!string.Equals(field, "windowStartDate", StringComparison.Ordinal)
                && !string.Equals(field, "windowEndDate", StringComparison.Ordinal))
            {
                AddError(errors, "query", "Unsupported query fields are not allowed.");
                return;
            }
        }
    }

    private static DateOnly? ReadOptionalQueryDate(HttpRequest request, string name, Dictionary<string, List<string>> errors)
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
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        if (!DateOnly.TryParseExact(raw, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            AddError(errors, name, $"{name} must be a yyyy-MM-dd date string.");
            return null;
        }

        return date;
    }

    private static string? ReadBoundedString(JsonElement root, string propertyName, bool required, int maxLength, Dictionary<string, List<string>> errors)
    {
        if (!TryGetProperty(root, propertyName, out var value) || value.ValueKind is JsonValueKind.Null)
        {
            if (required)
            {
                AddError(errors, propertyName, $"{propertyName} is required.");
            }

            return null;
        }

        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, propertyName, $"{propertyName} must be a string.");
            return null;
        }

        var trimmed = value.GetString()?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            if (required)
            {
                AddError(errors, propertyName, $"{propertyName} is required.");
            }

            return null;
        }

        if (trimmed.Length > maxLength)
        {
            AddError(errors, propertyName, $"{propertyName} is too long.");
            return null;
        }

        return trimmed;
    }

    private static string? ReadAccountType(JsonElement root, string propertyName, bool required, Dictionary<string, List<string>> errors)
    {
        var value = ReadBoundedString(root, propertyName, required, ManualFinanceConstraints.AccountTypeMaxLength, errors);
        if (value is not null && !ManualFinancialAccountTypes.IsSupported(value))
        {
            AddError(errors, propertyName, "Account type is not supported.");
            return null;
        }

        return value;
    }

    private static string? ReadIncomeCadence(JsonElement root, string propertyName, bool required, Dictionary<string, List<string>> errors)
    {
        var value = ReadBoundedString(root, propertyName, required, ManualFinanceConstraints.IncomeCadenceMaxLength, errors);
        if (value is not null && !ManualIncomeCadences.IsSupported(value))
        {
            AddError(errors, propertyName, "Cadence is not supported.");
            return null;
        }

        return value;
    }

    private static string? ReadCurrency(JsonElement root, string propertyName, bool required, Dictionary<string, List<string>> errors)
    {
        var value = ReadBoundedString(root, propertyName, required, ManualFinanceConstraints.CurrencyMaxLength, errors);
        if (value is null)
        {
            return null;
        }

        if (!CurrencyCode.TryCreate(value, out var currency))
        {
            AddError(errors, propertyName, "Currency must be an uppercase three-letter code.");
            return null;
        }

        var supported = SupportedCurrencyPolicy.Default.ValidateSupported(currency, propertyName);
        if (!supported.Succeeded)
        {
            AddError(errors, propertyName, supported.Message);
            return null;
        }

        return value;
    }

    private static decimal? ReadMoney(
        JsonElement root,
        string propertyName,
        string? currency,
        string currencyPropertyName,
        bool allowNegative,
        bool allowZero,
        Dictionary<string, List<string>> errors)
    {
        if (!TryGetProperty(root, propertyName, out var value) || value.ValueKind is JsonValueKind.Null)
        {
            AddError(errors, propertyName, $"{propertyName} is required.");
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, propertyName, "Amount must be a plain base-10 decimal string.");
            return null;
        }

        if (!CurrencyCode.TryCreate(currency, out var currencyCode))
        {
            return null;
        }

        var validation = MoneyAmount.TryParse(
            value.GetString(),
            currencyCode,
            MoneyValidationOptions.Default with
            {
                AllowNegative = allowNegative,
                AllowZero = allowZero,
                AmountField = propertyName,
                CurrencyField = currencyPropertyName
            },
            SupportedCurrencyPolicy.Default,
            out var money);
        if (!validation.Succeeded)
        {
            AddError(errors, validation.Field, validation.Message);
            return null;
        }

        return money.Amount;
    }

    private static DateOnly? ReadDate(JsonElement root, string propertyName, bool required, Dictionary<string, List<string>> errors)
    {
        if (!TryGetProperty(root, propertyName, out var value) || value.ValueKind is JsonValueKind.Null)
        {
            if (required)
            {
                AddError(errors, propertyName, $"{propertyName} is required.");
            }

            return null;
        }

        if (value.ValueKind is not JsonValueKind.String
            || !DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            AddError(errors, propertyName, $"{propertyName} must be a yyyy-MM-dd date string.");
            return null;
        }

        return date;
    }

    private static Guid? ReadOptionalGuid(JsonElement root, string propertyName, Dictionary<string, List<string>> errors)
    {
        if (!TryGetProperty(root, propertyName, out var value) || value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String || !Guid.TryParse(value.GetString(), out var id))
        {
            AddError(errors, propertyName, $"{propertyName} must be a UUID string.");
            return null;
        }

        return id;
    }

    private static bool TryGetProperty(JsonElement root, string propertyName, out JsonElement value)
    {
        if (root.ValueKind == JsonValueKind.Object)
        {
            return root.TryGetProperty(propertyName, out value);
        }

        value = default;
        return false;
    }

    private static void AddUnsupportedFieldErrors(
        JsonElement root,
        IReadOnlySet<string> supportedFields,
        Dictionary<string, List<string>> errors)
    {
        if (root.ValueKind != JsonValueKind.Object)
        {
            return;
        }

        foreach (var property in root.EnumerateObject())
        {
            if (!supportedFields.Contains(property.Name))
            {
                AddError(errors, property.Name, "Unsupported fields are not allowed.");
            }
        }
    }

    private static ManualFinancialAccountResponse MapAccount(ManualFinancialAccount account)
    {
        return new ManualFinancialAccountResponse(
            account.Id,
            account.DisplayName,
            account.AccountType,
            FormatAmount(account.CurrentBalanceAmount),
            account.CurrentBalanceCurrency,
            account.BalanceAsOfDate,
            account.Note,
            account.Status,
            account.CreatedAtUtc,
            account.UpdatedAtUtc,
            account.ArchivedAtUtc);
    }

    private static ManualIncomeSourceResponse MapIncome(ManualIncomeSource income)
    {
        return new ManualIncomeSourceResponse(
            income.Id,
            income.DisplayName,
            FormatAmount(income.Amount),
            income.Currency,
            income.Cadence,
            income.NextExpectedDate,
            income.EndDate,
            income.ManualFinancialAccountId,
            income.Note,
            income.Status,
            income.CreatedAtUtc,
            income.UpdatedAtUtc,
            income.ArchivedAtUtc);
    }

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private static decimal SumByCurrency(IEnumerable<CurrencyAmount> rows, string currency)
    {
        return rows
            .Where(row => row.Currency == currency)
            .Sum(row => row.Amount);
    }

    private static IResult MapAccountAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : AccountUnavailable();
    }

    private static IResult MapIncomeAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : IncomeUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult AccountUnavailable()
    {
        return Results.Problem(
            title: ManualAccountUnavailableTitle,
            detail: ManualAccountUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult IncomeUnavailable()
    {
        return Results.Problem(
            title: ManualIncomeUnavailableTitle,
            detail: ManualIncomeUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidAccount(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidManualAccountTitle,
            detail: "The submitted manual financial account request is invalid.",
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvalidAccountNoBody()
    {
        return Results.Problem(
            title: InvalidManualAccountTitle,
            detail: InvalidManualFinanceNoBodyDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvalidIncome(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidManualIncomeTitle,
            detail: "The submitted manual income source request is invalid.",
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvalidIncomeNoBody()
    {
        return Results.Problem(
            title: InvalidManualIncomeTitle,
            detail: InvalidManualFinanceNoBodyDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult InvalidSummary(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidManualFinanceSummaryTitle,
            detail: "The submitted manual finance summary request is invalid.",
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static bool RequestHasBody(HttpRequest request)
    {
        return request.ContentLength.GetValueOrDefault() > 0
            || request.Headers.TryGetValue("Transfer-Encoding", out var transferEncoding)
            && transferEncoding.Count > 0;
    }

    private static void AddError(Dictionary<string, List<string>> errors, string key, string message)
    {
        if (!errors.TryGetValue(key, out var messages))
        {
            messages = [];
            errors[key] = messages;
        }

        messages.Add(message);
    }

    private static Dictionary<string, string[]> ToValidationDictionary(Dictionary<string, List<string>> errors)
    {
        return errors.ToDictionary(pair => pair.Key, pair => pair.Value.ToArray(), StringComparer.Ordinal);
    }

    private sealed record RequestReadResult<T>(bool Succeeded, T? Request, Dictionary<string, string[]> Errors)
    {
        public static RequestReadResult<T> Success(T request)
        {
            return new RequestReadResult<T>(true, request, []);
        }

        public static RequestReadResult<T> Failed(Dictionary<string, string[]> errors)
        {
            return new RequestReadResult<T>(false, default, errors);
        }
    }

    private sealed record AccountCreateRequest(
        string DisplayName,
        string AccountType,
        decimal CurrentBalanceAmount,
        string Currency,
        DateOnly BalanceAsOfDate,
        string? Note);

    private sealed record AccountPatchRequest(
        bool DisplayNameSpecified,
        string? DisplayName,
        bool AccountTypeSpecified,
        string? AccountType,
        bool CurrencySpecified,
        string? Currency,
        bool CurrentBalanceAmountSpecified,
        decimal? CurrentBalanceAmount,
        bool BalanceAsOfDateSpecified,
        DateOnly? BalanceAsOfDate,
        bool NoteSpecified,
        string? Note);

    private sealed record IncomeRequest(
        string DisplayName,
        decimal Amount,
        string Currency,
        string Cadence,
        DateOnly NextExpectedDate,
        DateOnly? EndDate,
        Guid? ManualFinancialAccountId,
        string? Note);

    private sealed record CurrencyAmount(string Currency, decimal Amount);

    private sealed record ManualIncomeProjectionSource(
        string Currency,
        decimal Amount,
        string Cadence,
        DateOnly NextExpectedDate,
        DateOnly? EndDate);

    private sealed record GroupFutureBillProjectionSource(
        Guid Id,
        IReadOnlyList<GroupFutureBillProjectionShare> Participants);

    private sealed record GroupFutureBillProjectionShare(
        string ResolvedShareCurrency,
        decimal ResolvedShareAmount);

    private sealed record RecurringBillProjectionSource(
        string Currency,
        decimal Amount,
        string ScheduleType,
        int? IntervalCount,
        int? IntervalDays,
        DateOnly StartDate,
        DateOnly? EndDate,
        int? DueOffsetDays);

    private sealed record GroupRecurringBillProjectionSource(
        Guid Id,
        Guid OwnerUserProfileId,
        Guid GroupId,
        string? MerchantName,
        string PayloadJson,
        string ScheduleType,
        int? IntervalCount,
        int? IntervalDays,
        DateOnly StartDate,
        DateOnly? EndDate,
        int? DueOffsetDays);

    private sealed record GroupProjectionResult(
        IReadOnlyList<CurrencyAmount> Rows,
        int ExcludedUnsupportedCount);

    private sealed record ManualFinanceListFilter(bool IncludeArchived);

    private sealed record ManualFinanceListFilterReadResult(bool Succeeded, ManualFinanceListFilter? Filter, Dictionary<string, string[]> Errors)
    {
        public static ManualFinanceListFilterReadResult Success(ManualFinanceListFilter filter)
        {
            return new ManualFinanceListFilterReadResult(true, filter, []);
        }

        public static ManualFinanceListFilterReadResult Failed(Dictionary<string, string[]> errors)
        {
            return new ManualFinanceListFilterReadResult(false, null, errors);
        }
    }

    private sealed record ManualFinanceReadoutReadResult(bool Succeeded, Dictionary<string, string[]> Errors)
    {
        public static ManualFinanceReadoutReadResult Success()
        {
            return new ManualFinanceReadoutReadResult(true, []);
        }

        public static ManualFinanceReadoutReadResult Failed(Dictionary<string, string[]> errors)
        {
            return new ManualFinanceReadoutReadResult(false, errors);
        }
    }

    private sealed record SummaryWindow(DateOnly StartDate, DateOnly EndDate);

    private sealed record SummaryWindowReadResult(bool Succeeded, SummaryWindow? Window, Dictionary<string, string[]> Errors)
    {
        public static SummaryWindowReadResult Success(SummaryWindow window)
        {
            return new SummaryWindowReadResult(true, window, []);
        }

        public static SummaryWindowReadResult Failed(Dictionary<string, string[]> errors)
        {
            return new SummaryWindowReadResult(false, null, errors);
        }
    }
}
