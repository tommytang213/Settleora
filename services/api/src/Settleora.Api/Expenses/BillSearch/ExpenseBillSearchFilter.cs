using System.Globalization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Money;

namespace Settleora.Api.Expenses.BillSearch;

internal sealed record ExpenseBillSearchFilter(
    DateOnly? FromDate,
    DateOnly? ToDate,
    string? Status,
    string? ReconciliationStatus,
    string? Currency,
    string? Merchant,
    string? Search,
    string ArchiveState,
    int Limit)
{
    public const int DefaultLimit = 50;
    public const int MaxLimit = 200;
    public const int TextFilterMaxLength = 120;

    public static bool TryRead(
        string? fromDate,
        string? toDate,
        string? status,
        string? reconciliationStatus,
        string? currency,
        string? merchant,
        string? search,
        string? archiveState,
        string? limit,
        out ExpenseBillSearchFilter filter,
        out IDictionary<string, string[]> errors)
    {
        var errorBuilder = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        var parsedFromDate = ReadDate(fromDate, "fromDate", "From date", errorBuilder);
        var parsedToDate = ReadDate(toDate, "toDate", "To date", errorBuilder);
        if (parsedFromDate is not null
            && parsedToDate is not null
            && parsedFromDate.Value > parsedToDate.Value)
        {
            AddError(errorBuilder, "toDate", "To date must be on or after from date.");
        }

        var parsedStatus = ReadStatus(status, errorBuilder);
        var parsedReconciliationStatus = ReadReconciliationStatus(reconciliationStatus, errorBuilder);
        var parsedCurrency = ReadCurrency(currency, errorBuilder);
        var parsedMerchant = ReadTextFilter(merchant, "merchant", "Merchant filter", errorBuilder);
        var parsedSearch = ReadTextFilter(search, "search", "Search filter", errorBuilder);
        var parsedArchiveState = ReadArchiveState(archiveState, errorBuilder);
        var parsedLimit = ReadLimit(limit, errorBuilder);

        errors = ToErrorDictionary(errorBuilder);
        filter = errors.Count == 0
            ? new ExpenseBillSearchFilter(
                parsedFromDate,
                parsedToDate,
                parsedStatus,
                parsedReconciliationStatus,
                parsedCurrency,
                parsedMerchant,
                parsedSearch,
                parsedArchiveState,
                parsedLimit)
            : new ExpenseBillSearchFilter(
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                ExpenseBillArchiveStates.Active,
                DefaultLimit);

        return errors.Count == 0;
    }

    private static string ReadArchiveState(
        string? submittedArchiveState,
        Dictionary<string, List<string>> errors)
    {
        if (submittedArchiveState is null)
        {
            return ExpenseBillArchiveStates.Active;
        }

        var trimmedArchiveState = submittedArchiveState.Trim();
        if (ExpenseBillArchiveStates.IsSupported(trimmedArchiveState))
        {
            return trimmedArchiveState;
        }

        AddError(errors, "archiveState", "Archive state is not supported.");
        return ExpenseBillArchiveStates.Active;
    }

    private static DateOnly? ReadDate(
        string? submittedDate,
        string key,
        string displayName,
        Dictionary<string, List<string>> errors)
    {
        if (submittedDate is null)
        {
            return null;
        }

        if (DateOnly.TryParseExact(
            submittedDate.Trim(),
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var parsedDate))
        {
            return parsedDate;
        }

        AddError(errors, key, $"{displayName} must be a yyyy-MM-dd date string.");
        return null;
    }

    private static string? ReadStatus(
        string? submittedStatus,
        Dictionary<string, List<string>> errors)
    {
        if (submittedStatus is null)
        {
            return null;
        }

        var trimmedStatus = submittedStatus.Trim();
        if (ExpenseBillStatuses.IsSupported(trimmedStatus))
        {
            return trimmedStatus;
        }

        AddError(errors, "status", "Bill status is not supported.");
        return null;
    }

    private static string? ReadReconciliationStatus(
        string? submittedStatus,
        Dictionary<string, List<string>> errors)
    {
        if (submittedStatus is null)
        {
            return null;
        }

        var trimmedStatus = submittedStatus.Trim();
        if (ExpenseBillReconciliationStatuses.IsSupported(trimmedStatus))
        {
            return trimmedStatus;
        }

        AddError(errors, "reconciliationStatus", "Reconciliation status is not supported.");
        return null;
    }

    private static string? ReadCurrency(
        string? submittedCurrency,
        Dictionary<string, List<string>> errors)
    {
        if (submittedCurrency is null)
        {
            return null;
        }

        var trimmedCurrency = submittedCurrency.Trim();
        if (!CurrencyCode.TryCreate(trimmedCurrency, out var currencyCode))
        {
            AddError(errors, "currency", "Currency must be an uppercase three-letter code.");
            return null;
        }

        var supportedResult = SupportedCurrencyPolicy.Default.ValidateSupported(currencyCode);
        if (!supportedResult.Succeeded)
        {
            AddError(errors, "currency", supportedResult.Message);
            return null;
        }

        return trimmedCurrency;
    }

    private static string? ReadTextFilter(
        string? submittedText,
        string key,
        string displayName,
        Dictionary<string, List<string>> errors)
    {
        if (submittedText is null)
        {
            return null;
        }

        var trimmedText = submittedText.Trim();
        if (trimmedText.Length == 0)
        {
            return null;
        }

        if (trimmedText.Length > TextFilterMaxLength)
        {
            AddError(errors, key, $"{displayName} must be {TextFilterMaxLength} characters or fewer.");
            return null;
        }

        return trimmedText;
    }

    private static int ReadLimit(
        string? submittedLimit,
        Dictionary<string, List<string>> errors)
    {
        if (submittedLimit is null)
        {
            return DefaultLimit;
        }

        if (int.TryParse(
            submittedLimit.Trim(),
            NumberStyles.None,
            CultureInfo.InvariantCulture,
            out var parsedLimit)
            && parsedLimit is >= 1 and <= MaxLimit)
        {
            return parsedLimit;
        }

        AddError(errors, "limit", $"Limit must be between 1 and {MaxLimit}.");
        return DefaultLimit;
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
}

internal static class ExpenseBillArchiveStates
{
    public const string Active = "active";
    public const string Archived = "archived";
    public const string All = "all";

    public static bool IsSupported(string? value)
    {
        return value is Active or Archived or All;
    }
}
