using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Money;

namespace Settleora.Api.Expenses.RecurringBills;

internal sealed record RecurringBillTemplatePayload(
    string Currency,
    IReadOnlyList<RecurringBillTemplatePayloadItem> Items,
    IReadOnlyList<RecurringBillTemplatePayloadAdjustment> Adjustments,
    IReadOnlyList<RecurringBillTemplatePayloadPayer> Payers);

internal sealed record RecurringBillTemplatePayloadItem(
    string Name,
    string? Note,
    decimal Amount,
    string Currency,
    IReadOnlyList<RecurringBillTemplatePayloadItemSplit> Splits);

internal sealed record RecurringBillTemplatePayloadItemSplit(
    Guid UserProfileId,
    string SplitMethod,
    decimal? BasisValue,
    int AllocationOrder);

internal sealed record RecurringBillTemplatePayloadAdjustment(
    string Type,
    string Direction,
    string AllocationMethod,
    decimal Amount,
    string Currency,
    string? ReasonNote);

internal sealed record RecurringBillTemplatePayloadPayer(
    Guid UserProfileId,
    decimal Amount,
    string Currency,
    string? PaymentMethodLabelSnapshot);

internal static class RecurringBillTemplatePayloadCodec
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public static string Serialize(RecurringBillTemplatePayload payload)
    {
        return JsonSerializer.Serialize(payload, JsonOptions);
    }

    public static RecurringBillTemplatePayload? Deserialize(string payloadJson)
    {
        try
        {
            return JsonSerializer.Deserialize<RecurringBillTemplatePayload>(payloadJson, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

internal sealed class RecurringBillTemplatePayloadReadResult
{
    private RecurringBillTemplatePayloadReadResult(
        RecurringBillTemplatePayload? payload,
        IDictionary<string, string[]> errors)
    {
        Payload = payload;
        Errors = errors;
    }

    public bool Succeeded => Errors.Count == 0;

    public RecurringBillTemplatePayload? Payload { get; }

    public IDictionary<string, string[]> Errors { get; }

    public static RecurringBillTemplatePayloadReadResult Valid(RecurringBillTemplatePayload payload)
    {
        return new RecurringBillTemplatePayloadReadResult(
            payload,
            new Dictionary<string, string[]>(StringComparer.Ordinal));
    }

    public static RecurringBillTemplatePayloadReadResult Invalid(IDictionary<string, string[]> errors)
    {
        return new RecurringBillTemplatePayloadReadResult(null, errors);
    }
}

internal static class RecurringBillTemplatePayloadReader
{
    public static RecurringBillTemplatePayloadReadResult Read(
        JsonElement value,
        bool isGroupTemplate,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.Object)
        {
            AddError(errors, "billPayload", "Bill payload must be an object.");
            return RecurringBillTemplatePayloadReadResult.Invalid(ToErrorDictionary(errors));
        }

        string? currency = value.TryGetProperty("currency", out var currencyElement)
            ? ReadCurrency(currencyElement, "billPayload.currency", errors)
            : null;
        List<RecurringBillTemplatePayloadItem>? items = null;
        var adjustments = new List<RecurringBillTemplatePayloadAdjustment>();
        var payers = new List<RecurringBillTemplatePayloadPayer>();

        foreach (var property in value.EnumerateObject())
        {
            switch (property.Name)
            {
                case "currency":
                    break;
                case "items":
                    items = ReadItems(property.Value, currency, isGroupTemplate, errors);
                    break;
                case "adjustments":
                    adjustments = ReadAdjustments(property.Value, currency, errors);
                    break;
                case "payers":
                    payers = ReadPayers(property.Value, currency, errors);
                    break;
                default:
                    AddUnsupportedFieldError(errors);
                    break;
            }
        }

        if (currency is null)
        {
            AddError(errors, "billPayload.currency", "Currency is required.");
        }

        if (items is null)
        {
            AddError(errors, "billPayload.items", "At least one bill item is required.");
        }
        else if (items.Count == 0)
        {
            AddError(errors, "billPayload.items", "At least one bill item is required.");
        }

        return errors.Count == 0
            ? RecurringBillTemplatePayloadReadResult.Valid(new RecurringBillTemplatePayload(
                currency!,
                items!,
                adjustments,
                payers))
            : RecurringBillTemplatePayloadReadResult.Invalid(ToErrorDictionary(errors));
    }

    private static List<RecurringBillTemplatePayloadItem> ReadItems(
        JsonElement value,
        string? billCurrency,
        bool isGroupTemplate,
        Dictionary<string, List<string>> errors)
    {
        var items = new List<RecurringBillTemplatePayloadItem>();
        if (value.ValueKind is not JsonValueKind.Array)
        {
            AddError(errors, "billPayload.items", "Items must be an array.");
            return items;
        }

        var index = 0;
        foreach (var itemElement in value.EnumerateArray())
        {
            var item = ReadItem(itemElement, billCurrency, isGroupTemplate, index, errors);
            if (item is not null)
            {
                items.Add(item);
            }

            index++;
        }

        return items;
    }

    private static RecurringBillTemplatePayloadItem? ReadItem(
        JsonElement value,
        string? billCurrency,
        bool isGroupTemplate,
        int index,
        Dictionary<string, List<string>> errors)
    {
        var fieldPrefix = $"billPayload.items[{index}]";
        if (value.ValueKind is not JsonValueKind.Object)
        {
            AddError(errors, "billPayload.items", "Each item must be an object.");
            return null;
        }

        string? name = null;
        string? note = null;
        decimal? amount = null;
        string? currency = null;
        List<RecurringBillTemplatePayloadItemSplit>? splits = null;

        foreach (var property in value.EnumerateObject())
        {
            switch (property.Name)
            {
                case "name":
                    name = ReadRequiredText(
                        property.Value,
                        $"{fieldPrefix}.name",
                        "Item name",
                        ExpenseBillConstraints.ItemNameMaxLength,
                        errors);
                    break;
                case "note":
                    note = ReadNullableText(
                        property.Value,
                        $"{fieldPrefix}.note",
                        "Item note",
                        ExpenseBillConstraints.NoteMaxLength,
                        errors);
                    break;
                case "amount":
                    amount = ReadMoneyAmount(
                        property.Value,
                        billCurrency,
                        $"{fieldPrefix}.amount",
                        $"{fieldPrefix}.currency",
                        errors);
                    break;
                case "currency":
                    currency = ReadCurrency(property.Value, $"{fieldPrefix}.currency", errors);
                    break;
                case "splits":
                    splits = ReadSplits(property.Value, fieldPrefix, errors);
                    break;
                default:
                    AddUnsupportedFieldError(errors);
                    break;
            }
        }

        if (name is null)
        {
            AddError(errors, $"{fieldPrefix}.name", "Item name is required.");
        }

        if (amount is null)
        {
            AddError(errors, $"{fieldPrefix}.amount", "Item amount is required.");
        }

        currency ??= billCurrency;
        splits ??= [];
        if (isGroupTemplate && splits.Count == 0)
        {
            AddError(errors, $"{fieldPrefix}.splits", "Item splits are required for group recurring bill templates.");
        }

        return name is not null && amount is not null && currency is not null
            ? new RecurringBillTemplatePayloadItem(name, note, amount.Value, currency, splits)
            : null;
    }

    private static List<RecurringBillTemplatePayloadItemSplit> ReadSplits(
        JsonElement value,
        string fieldPrefix,
        Dictionary<string, List<string>> errors)
    {
        var splits = new List<RecurringBillTemplatePayloadItemSplit>();
        if (value.ValueKind is not JsonValueKind.Array)
        {
            AddError(errors, $"{fieldPrefix}.splits", "Item splits must be an array.");
            return splits;
        }

        var index = 0;
        foreach (var splitElement in value.EnumerateArray())
        {
            var split = ReadSplit(splitElement, $"{fieldPrefix}.splits[{index}]", errors);
            if (split is not null)
            {
                splits.Add(split);
            }

            index++;
        }

        return splits;
    }

    private static RecurringBillTemplatePayloadItemSplit? ReadSplit(
        JsonElement value,
        string fieldPrefix,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.Object)
        {
            AddError(errors, fieldPrefix, "Each item split must be an object.");
            return null;
        }

        Guid? userProfileId = null;
        string? splitMethod = null;
        decimal? basisValue = null;
        var hasBasisValue = false;
        var allocationOrder = 0;

        foreach (var property in value.EnumerateObject())
        {
            switch (property.Name)
            {
                case "userProfileId":
                    userProfileId = ReadGuid(property.Value, $"{fieldPrefix}.userProfileId", "User profile ID", errors);
                    break;
                case "splitMethod":
                    splitMethod = ReadSplitMethod(property.Value, $"{fieldPrefix}.splitMethod", errors);
                    break;
                case "basisValue":
                    hasBasisValue = true;
                    basisValue = ReadBasisValue(property.Value, $"{fieldPrefix}.basisValue", errors);
                    break;
                case "allocationOrder":
                    allocationOrder = ReadNonNegativeInt(property.Value, $"{fieldPrefix}.allocationOrder", errors);
                    break;
                default:
                    AddUnsupportedFieldError(errors);
                    break;
            }
        }

        if (userProfileId is null)
        {
            AddError(errors, $"{fieldPrefix}.userProfileId", "User profile ID is required.");
        }

        if (splitMethod is null)
        {
            AddError(errors, $"{fieldPrefix}.splitMethod", "Split method is required.");
        }

        if (RequiresSplitBasis(splitMethod) && !hasBasisValue)
        {
            AddError(errors, $"{fieldPrefix}.basisValue", "Split basis value is required for this split method.");
        }

        return userProfileId is not null && splitMethod is not null
            ? new RecurringBillTemplatePayloadItemSplit(
                userProfileId.Value,
                splitMethod,
                basisValue,
                allocationOrder)
            : null;
    }

    private static List<RecurringBillTemplatePayloadAdjustment> ReadAdjustments(
        JsonElement value,
        string? billCurrency,
        Dictionary<string, List<string>> errors)
    {
        var adjustments = new List<RecurringBillTemplatePayloadAdjustment>();
        if (value.ValueKind is JsonValueKind.Null)
        {
            return adjustments;
        }

        if (value.ValueKind is not JsonValueKind.Array)
        {
            AddError(errors, "billPayload.adjustments", "Adjustments must be an array when supplied.");
            return adjustments;
        }

        var index = 0;
        foreach (var adjustmentElement in value.EnumerateArray())
        {
            var adjustment = ReadAdjustment(adjustmentElement, billCurrency, index, errors);
            if (adjustment is not null)
            {
                adjustments.Add(adjustment);
            }

            index++;
        }

        return adjustments;
    }

    private static RecurringBillTemplatePayloadAdjustment? ReadAdjustment(
        JsonElement value,
        string? billCurrency,
        int index,
        Dictionary<string, List<string>> errors)
    {
        var fieldPrefix = $"billPayload.adjustments[{index}]";
        if (value.ValueKind is not JsonValueKind.Object)
        {
            AddError(errors, "billPayload.adjustments", "Each adjustment must be an object.");
            return null;
        }

        string? type = null;
        string? direction = null;
        string? allocationMethod = null;
        decimal? amount = null;
        string? currency = null;
        string? reasonNote = null;

        foreach (var property in value.EnumerateObject())
        {
            switch (property.Name)
            {
                case "type":
                    type = ReadAdjustmentType(property.Value, $"{fieldPrefix}.type", errors);
                    break;
                case "direction":
                    direction = ReadAdjustmentDirection(property.Value, $"{fieldPrefix}.direction", errors);
                    break;
                case "allocationMethod":
                    allocationMethod = ReadAdjustmentAllocationMethod(property.Value, $"{fieldPrefix}.allocationMethod", errors);
                    break;
                case "amount":
                    amount = ReadMoneyAmount(
                        property.Value,
                        billCurrency,
                        $"{fieldPrefix}.amount",
                        $"{fieldPrefix}.currency",
                        errors);
                    break;
                case "currency":
                    currency = ReadCurrency(property.Value, $"{fieldPrefix}.currency", errors);
                    break;
                case "reasonNote":
                    reasonNote = ReadNullableText(
                        property.Value,
                        $"{fieldPrefix}.reasonNote",
                        "Reason note",
                        ExpenseBillConstraints.NoteMaxLength,
                        errors);
                    break;
                default:
                    AddUnsupportedFieldError(errors);
                    break;
            }
        }

        if (type is null)
        {
            AddError(errors, $"{fieldPrefix}.type", "Adjustment type is required.");
        }

        if (direction is null)
        {
            AddError(errors, $"{fieldPrefix}.direction", "Adjustment direction is required.");
        }

        if (allocationMethod is null)
        {
            AddError(errors, $"{fieldPrefix}.allocationMethod", "Adjustment allocation method is required.");
        }

        if (amount is null)
        {
            AddError(errors, $"{fieldPrefix}.amount", "Adjustment amount is required.");
        }

        currency ??= billCurrency;
        return type is not null
            && direction is not null
            && allocationMethod is not null
            && amount is not null
            && currency is not null
            ? new RecurringBillTemplatePayloadAdjustment(
                type,
                direction,
                allocationMethod,
                amount.Value,
                currency,
                reasonNote)
            : null;
    }

    private static List<RecurringBillTemplatePayloadPayer> ReadPayers(
        JsonElement value,
        string? billCurrency,
        Dictionary<string, List<string>> errors)
    {
        var payers = new List<RecurringBillTemplatePayloadPayer>();
        if (value.ValueKind is JsonValueKind.Null)
        {
            return payers;
        }

        if (value.ValueKind is not JsonValueKind.Array)
        {
            AddError(errors, "billPayload.payers", "Payers must be an array when supplied.");
            return payers;
        }

        var index = 0;
        foreach (var payerElement in value.EnumerateArray())
        {
            var payer = ReadPayer(payerElement, billCurrency, index, errors);
            if (payer is not null)
            {
                payers.Add(payer);
            }

            index++;
        }

        return payers;
    }

    private static RecurringBillTemplatePayloadPayer? ReadPayer(
        JsonElement value,
        string? billCurrency,
        int index,
        Dictionary<string, List<string>> errors)
    {
        var fieldPrefix = $"billPayload.payers[{index}]";
        if (value.ValueKind is not JsonValueKind.Object)
        {
            AddError(errors, "billPayload.payers", "Each payer must be an object.");
            return null;
        }

        Guid? userProfileId = null;
        decimal? amount = null;
        string? currency = null;
        string? paymentMethodLabelSnapshot = null;

        foreach (var property in value.EnumerateObject())
        {
            switch (property.Name)
            {
                case "userProfileId":
                    userProfileId = ReadGuid(property.Value, $"{fieldPrefix}.userProfileId", "User profile ID", errors);
                    break;
                case "amount":
                    amount = ReadMoneyAmount(
                        property.Value,
                        billCurrency,
                        $"{fieldPrefix}.amount",
                        $"{fieldPrefix}.currency",
                        errors);
                    break;
                case "currency":
                    currency = ReadCurrency(property.Value, $"{fieldPrefix}.currency", errors);
                    break;
                case "paymentMethodLabelSnapshot":
                    paymentMethodLabelSnapshot = ReadNullableText(
                        property.Value,
                        $"{fieldPrefix}.paymentMethodLabelSnapshot",
                        "Payer payment method label snapshot",
                        ExpenseBillConstraints.PayerPaymentMethodLabelSnapshotMaxLength,
                        errors);
                    break;
                default:
                    AddUnsupportedFieldError(errors);
                    break;
            }
        }

        if (userProfileId is null)
        {
            AddError(errors, $"{fieldPrefix}.userProfileId", "User profile ID is required.");
        }

        if (amount is null)
        {
            AddError(errors, $"{fieldPrefix}.amount", "Payer amount is required.");
        }

        currency ??= billCurrency;
        return userProfileId is not null && amount is not null && currency is not null
            ? new RecurringBillTemplatePayloadPayer(
                userProfileId.Value,
                amount.Value,
                currency,
                paymentMethodLabelSnapshot)
            : null;
    }

    private static Guid? ReadGuid(
        JsonElement value,
        string errorKey,
        string label,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String
            || !Guid.TryParse(value.GetString(), out var parsed)
            || parsed == Guid.Empty)
        {
            AddError(errors, errorKey, $"{label} must be a valid non-empty GUID string.");
            return null;
        }

        return parsed;
    }

    private static string? ReadCurrency(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, "Currency must be an uppercase three-letter code.");
            return null;
        }

        var currency = value.GetString();
        if (!CurrencyCode.TryCreate(currency, out var currencyCode))
        {
            AddError(errors, errorKey, "Currency must be an uppercase three-letter code.");
            return null;
        }

        var supportedResult = SupportedCurrencyPolicy.Default.ValidateSupported(currencyCode, errorKey);
        if (!supportedResult.Succeeded)
        {
            AddError(errors, errorKey, supportedResult.Message);
            return null;
        }

        return currency;
    }

    private static decimal? ReadMoneyAmount(
        JsonElement value,
        string? currency,
        string amountField,
        string currencyField,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, amountField, "Amount must be a plain base-10 decimal string.");
            return null;
        }

        if (!CurrencyCode.TryCreate(currency, out var currencyCode))
        {
            return null;
        }

        var validationResult = MoneyAmount.TryParse(
            value.GetString(),
            currencyCode,
            MoneyValidationOptions.Default with
            {
                AmountField = amountField,
                CurrencyField = currencyField
            },
            SupportedCurrencyPolicy.Default,
            out var moneyAmount);
        if (!validationResult.Succeeded)
        {
            AddError(errors, validationResult.Field, validationResult.Message);
            return null;
        }

        return moneyAmount.Amount;
    }

    private static decimal? ReadBasisValue(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String
            || !IsPlainDecimalString(value.GetString() ?? string.Empty)
            || !decimal.TryParse(
                value.GetString(),
                NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture,
                out var basisValue)
            || basisValue < 0m
            || basisValue > ExpenseBillConstraints.MoneyAmountMaxValue)
        {
            AddError(errors, errorKey, "Split basis value must be a non-negative plain base-10 decimal string.");
            return null;
        }

        return basisValue;
    }

    private static int ReadNonNegativeInt(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.Number
            || !value.TryGetInt32(out var parsed)
            || parsed < 0)
        {
            AddError(errors, errorKey, "Allocation order must be a non-negative integer.");
            return 0;
        }

        return parsed;
    }

    private static string? ReadSplitMethod(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, "Split method is not supported.");
            return null;
        }

        var splitMethod = value.GetString();
        if (!ExpenseBillItemSplitMethods.IsSupported(splitMethod))
        {
            AddError(errors, errorKey, "Split method is not supported.");
            return null;
        }

        return splitMethod;
    }

    private static string? ReadAdjustmentType(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, "Adjustment type is not supported.");
            return null;
        }

        var type = value.GetString();
        if (!ExpenseBillAdjustmentTypes.IsSupported(type))
        {
            AddError(errors, errorKey, "Adjustment type is not supported.");
            return null;
        }

        return type;
    }

    private static string? ReadAdjustmentDirection(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, "Adjustment direction is not supported.");
            return null;
        }

        var direction = value.GetString();
        if (!ExpenseBillAdjustmentDirections.IsSupported(direction))
        {
            AddError(errors, errorKey, "Adjustment direction is not supported.");
            return null;
        }

        return direction;
    }

    private static string? ReadAdjustmentAllocationMethod(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, "Adjustment allocation method is not supported.");
            return null;
        }

        var allocationMethod = value.GetString();
        if (allocationMethod is ExpenseBillAdjustmentAllocationMethods.Manual)
        {
            AddError(errors, errorKey, "Manual adjustment allocation is intentionally unsupported in this service slice.");
            return null;
        }

        if (allocationMethod is not (ExpenseBillAdjustmentAllocationMethods.Equal
            or ExpenseBillAdjustmentAllocationMethods.ProportionalByItemSubtotal))
        {
            AddError(errors, errorKey, "Adjustment allocation method is not supported.");
            return null;
        }

        return allocationMethod;
    }

    private static string? ReadRequiredText(
        JsonElement value,
        string errorKey,
        string label,
        int maxLength,
        Dictionary<string, List<string>> errors)
    {
        var text = ReadNullableText(value, errorKey, label, maxLength, errors);
        if (text is null)
        {
            AddError(errors, errorKey, $"{label} is required.");
        }

        return text;
    }

    private static string? ReadNullableText(
        JsonElement value,
        string errorKey,
        string label,
        int maxLength,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, $"{label} must be a string.");
            return null;
        }

        var trimmed = value.GetString()?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            AddError(errors, errorKey, $"{label} must not be blank when supplied.");
            return null;
        }

        if (trimmed.Length > maxLength)
        {
            AddError(errors, errorKey, $"{label} is too long.");
            return null;
        }

        return trimmed;
    }

    private static bool RequiresSplitBasis(string? splitMethod)
    {
        return splitMethod is ExpenseBillItemSplitMethods.ExactAmount
            or ExpenseBillItemSplitMethods.Percentage
            or ExpenseBillItemSplitMethods.Ratio
            or ExpenseBillItemSplitMethods.ShareWeight;
    }

    private static bool IsPlainDecimalString(string value)
    {
        var index = 0;
        if (value.Length == 0)
        {
            return false;
        }

        if (value[0] is '-')
        {
            index = 1;
            if (index == value.Length)
            {
                return false;
            }
        }

        var integerDigits = 0;
        var fractionalDigits = 0;
        var decimalPointSeen = false;

        for (; index < value.Length; index++)
        {
            var character = value[index];
            if (character is >= '0' and <= '9')
            {
                if (decimalPointSeen)
                {
                    fractionalDigits++;
                }
                else
                {
                    integerDigits++;
                }

                continue;
            }

            if (character is '.' && !decimalPointSeen)
            {
                decimalPointSeen = true;
                continue;
            }

            return false;
        }

        return integerDigits > 0 && (!decimalPointSeen || fractionalDigits > 0);
    }

    private static void AddUnsupportedFieldError(Dictionary<string, List<string>> errors)
    {
        AddError(errors, "body", "Unsupported fields are not allowed.");
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
