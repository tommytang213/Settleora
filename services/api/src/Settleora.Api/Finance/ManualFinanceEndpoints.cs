using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Finance;
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

        return app;
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

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken);
        if (!authorization.Allowed)
        {
            return MapAccountAuthorizationFailure(authorization);
        }

        var includeArchived = ReadBoolQuery(request, "includeArchived");
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
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
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

        var authorization = await businessAuthorizationService.CanAccessProfileAsync(actor.UserProfileId, cancellationToken);
        if (!authorization.Allowed)
        {
            return MapIncomeAuthorizationFailure(authorization);
        }

        var includeArchived = ReadBoolQuery(request, "includeArchived");
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
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        SettleoraDbContext dbContext,
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

    private static async Task<RequestReadResult<AccountCreateRequest>> ReadAccountCreateRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        using var document = await JsonDocument.ParseAsync(request.Body, cancellationToken: cancellationToken);
        var root = document.RootElement;
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
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

    private static bool ReadBoolQuery(HttpRequest request, string name)
    {
        return bool.TryParse(request.Query[name], out var value) && value;
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

    private static IResult InvalidIncome(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidManualIncomeTitle,
            detail: "The submitted manual income source request is invalid.",
            statusCode: StatusCodes.Status400BadRequest);
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
}
