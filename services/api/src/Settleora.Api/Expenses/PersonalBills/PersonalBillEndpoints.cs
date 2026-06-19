using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Expenses.BillSearch;
using Settleora.Api.Expenses.BillRevisions;
using Settleora.Api.Expenses.Reconciliation;
using Settleora.Api.Money;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.PersonalBills;

internal static class PersonalBillEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string BillUnavailableTitle = "Bill unavailable";
    private const string BillUnavailableDetail = "The requested bill is unavailable.";
    private const string InvalidBillRequestTitle = "Invalid bill request";
    private const string InvalidBillRequestDetail = "The submitted bill request is invalid.";
    private const string BillWriteFailedTitle = "Bill write failed";
    private const string BillWriteFailedDetail = "Unable to complete bill write.";
    private const string BillReadFailedTitle = "Bill read failed";
    private const string BillReadFailedDetail = "Unable to read bill calculation data.";
    private const string BillListReadBodyMessage = "Bill list requests do not accept a body.";
    private const string BillReadBodyMessage = "Bill read requests do not accept a body.";
    private const string BillCreatedAction = "bill.created";
    private const string PersonalGroupMode = "personal";
    private static readonly HashSet<string> SupportedBillListQueryFields = new(StringComparer.Ordinal)
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

    public static WebApplication MapPersonalBillEndpoints(this WebApplication app)
    {
        var bills = app.MapGroup("/api/v1/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        bills.MapPost("", CreatePersonalBillAsync);
        bills.MapGet("", ListPersonalBillsAsync);
        bills.MapGet("/{billId:guid}", GetPersonalBillAsync);

        return app;
    }

    private static async Task<IResult> CreatePersonalBillAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IPersonalBillAuditWriter auditWriter,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readResult = await ReadCreateRequestAsync(request, cancellationToken);
        if (!readResult.Succeeded || readResult.Request is null)
        {
            return InvalidBillRequest(readResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var now = timeProvider.GetUtcNow();
        var createRequest = readResult.Request;
        var bill = new ExpenseBill
        {
            Id = Guid.NewGuid(),
            CreatedByUserProfileId = actor.UserProfileId,
            BillOwnerUserProfileId = actor.UserProfileId,
            GroupId = null,
            MerchantName = createRequest.MerchantName,
            BillDate = createRequest.BillDate,
            Status = ExpenseBillStatuses.Draft,
            TotalAmount = 0m,
            TotalCurrency = createRequest.Currency,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        bill.Participants.Add(new ExpenseBillParticipant
        {
            ExpenseBillId = bill.Id,
            UserProfileId = actor.UserProfileId,
            Status = ExpenseBillParticipantStatuses.PendingAcceptance,
            ResolvedShareAmount = 0m,
            ResolvedShareCurrency = createRequest.Currency,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        for (var index = 0; index < createRequest.Items.Count; index++)
        {
            var itemRequest = createRequest.Items[index];
            var item = new ExpenseBillItem
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = bill.Id,
                Name = itemRequest.Name,
                Note = itemRequest.Note,
                Amount = itemRequest.Amount,
                Currency = itemRequest.Currency,
                SortOrder = index,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            item.Splits.Add(new ExpenseBillItemSplit
            {
                Id = Guid.NewGuid(),
                ExpenseBillItemId = item.Id,
                UserProfileId = actor.UserProfileId,
                SplitMethod = ExpenseBillItemSplitMethods.ExactAmount,
                BasisValue = itemRequest.Amount,
                ResolvedAmount = 0m,
                ResolvedCurrency = itemRequest.Currency,
                AllocationOrder = 0,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });

            bill.Items.Add(item);
        }

        for (var index = 0; index < createRequest.Adjustments.Count; index++)
        {
            var adjustmentRequest = createRequest.Adjustments[index];
            bill.Adjustments.Add(new ExpenseBillAdjustment
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = bill.Id,
                Type = adjustmentRequest.Type,
                Direction = adjustmentRequest.Direction,
                AllocationMethod = adjustmentRequest.AllocationMethod,
                Amount = adjustmentRequest.Amount,
                Currency = adjustmentRequest.Currency,
                ReasonNote = adjustmentRequest.ReasonNote,
                SortOrder = index,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        var firstCalculation = calculationService.Calculate(bill);
        if (!firstCalculation.Succeeded)
        {
            return InvalidBillRequest(firstCalculation.Failure!);
        }

        ApplyCalculation(bill, firstCalculation);
        var payer = new ExpenseBillPayer
        {
            Id = Guid.NewGuid(),
            ExpenseBillId = bill.Id,
            UserProfileId = actor.UserProfileId,
            Amount = firstCalculation.BillTotal!.Amount,
            Currency = firstCalculation.BillTotal.Currency.Value,
            PaymentMethodLabelSnapshot = createRequest.PayerPaymentMethodLabelSnapshot,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        ExpenseBillPayerConfirmationPolicy.ApplyCreatedBy(payer, actor.UserProfileId, now);
        bill.Payers.Add(payer);

        var finalCalculation = calculationService.Calculate(bill);
        if (!finalCalculation.Succeeded)
        {
            return InvalidBillRequest(finalCalculation.Failure!);
        }

        ApplyCalculation(bill, finalCalculation);
        dbContext.Set<ExpenseBill>().Add(bill);
        await auditWriter.WriteAsync(
            new PersonalBillAuditEvent(
                BillCreatedAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                bill.Id,
                PersonalGroupMode,
                bill.Status,
                bill.Items.Count,
                bill.Adjustments.Count,
                bill.Participants.Count,
                bill.TotalCurrency,
                bill.TotalAmount,
                now),
            cancellationToken);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            dbContext.ChangeTracker.Clear();
            return BillWriteFailed();
        }

        return Results.Created(
            $"/api/v1/bills/{bill.Id:D}",
            MapResponse(bill, finalCalculation, actor.UserProfileId));
    }

    private static async Task<IResult> ListPersonalBillsAsync(
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var filterReadResult = ReadBillListFilter(request, BillListReadBodyMessage);
        if (!filterReadResult.Succeeded || filterReadResult.Filter is null)
        {
            return InvalidBillRequest(filterReadResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var filter = filterReadResult.Filter;
        var bills = await ExpenseBillSearchQueries.VisiblePersonalBillsIncludingArchived(dbContext, actor.UserProfileId)
            .ApplySearchFilter(filter)
            .WithBillDetails()
            .Include(bill => bill.Revisions)
            .OrderForList()
            .Take(filter.Limit)
            .ToListAsync(cancellationToken);
        var responses = new List<PersonalBillResponse>(bills.Count);

        foreach (var bill in bills)
        {
            var calculation = calculationService.Calculate(bill);
            if (!calculation.Succeeded)
            {
                return BillReadFailed();
            }

            responses.Add(MapResponse(bill, calculation, actor.UserProfileId));
        }

        return Results.Ok(new PersonalBillListResponse(responses));
    }

    private static async Task<IResult> GetPersonalBillAsync(
        Guid billId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out var actor))
        {
            return Unauthenticated();
        }

        var readoutReadResult = ReadBillReadoutRequest(request, BillReadBodyMessage);
        if (!readoutReadResult.Succeeded)
        {
            return InvalidBillRequest(readoutReadResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessProfileAsync(
            actor.UserProfileId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await PersonalBillsQuery(dbContext, actor.UserProfileId)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == billId,
                cancellationToken);
        if (bill is null)
        {
            return BillUnavailable();
        }

        var calculation = calculationService.Calculate(bill);
        return calculation.Succeeded
            ? Results.Ok(MapResponse(bill, calculation, actor.UserProfileId))
            : BillReadFailed();
    }

    private static IQueryable<ExpenseBill> PersonalBillsQuery(
        SettleoraDbContext dbContext,
        Guid userProfileId)
    {
        return ExpenseBillSearchQueries.VisiblePersonalBills(dbContext, userProfileId)
            .WithBillDetails()
            .Include(bill => bill.Revisions);
    }

    private static BillListFilterReadResult ReadBillListFilter(
        HttpRequest request,
        string bodyMessage)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        RejectBillReadRequestBody(request, bodyMessage, errors);
        RejectUnsupportedBillListQueryFields(request, errors);

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
            ? BillListFilterReadResult.Valid(filter!)
            : BillListFilterReadResult.Invalid(ToErrorDictionary(errors));
    }

    private static BillReadoutReadResult ReadBillReadoutRequest(
        HttpRequest request,
        string bodyMessage)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        RejectBillReadRequestBody(request, bodyMessage, errors);
        if (request.Query.Count > 0)
        {
            AddError(errors, "query", "Unsupported query fields are not allowed.");
        }

        return errors.Count == 0
            ? BillReadoutReadResult.Valid()
            : BillReadoutReadResult.Invalid(ToErrorDictionary(errors));
    }

    private static void RejectBillReadRequestBody(
        HttpRequest request,
        string message,
        Dictionary<string, List<string>> errors)
    {
        if (RequestHasBody(request))
        {
            AddError(errors, "body", message);
        }
    }

    private static void RejectUnsupportedBillListQueryFields(
        HttpRequest request,
        Dictionary<string, List<string>> errors)
    {
        foreach (var field in request.Query.Keys)
        {
            if (!SupportedBillListQueryFields.Contains(field))
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

    private static async Task<PersonalBillCreateReadResult> ReadCreateRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            AddError(errors, "body", "A JSON object body is required.");
            return PersonalBillCreateReadResult.Invalid(ToErrorDictionary(errors));
        }

        JsonDocument document;
        try
        {
            document = await JsonDocument.ParseAsync(
                request.Body,
                cancellationToken: cancellationToken);
        }
        catch (JsonException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return PersonalBillCreateReadResult.Invalid(ToErrorDictionary(errors));
        }
        catch (BadHttpRequestException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return PersonalBillCreateReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return PersonalBillCreateReadResult.Invalid(ToErrorDictionary(errors));
            }

            string? merchantName = null;
            DateOnly billDate = default;
            var hasBillDate = false;
            string? currency = document.RootElement.TryGetProperty("currency", out var currencyElement)
                ? ReadCurrency(currencyElement, "currency", errors)
                : null;
            List<PersonalBillCreateItem>? items = null;
            var adjustments = new List<PersonalBillCreateAdjustment>();
            string? payerPaymentMethodLabelSnapshot = null;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "merchantName":
                        merchantName = ReadNullableText(
                            property.Value,
                            "merchantName",
                            "Merchant name",
                            ExpenseBillConstraints.MerchantNameMaxLength,
                            errors);
                        break;
                    case "billDate":
                        hasBillDate = true;
                        billDate = ReadBillDate(property.Value, errors);
                        break;
                    case "currency":
                        break;
                    case "items":
                        items = ReadItems(property.Value, currency, errors);
                        break;
                    case "adjustments":
                        adjustments = ReadAdjustments(property.Value, currency, errors);
                        break;
                    case "payerPaymentMethodLabelSnapshot":
                        payerPaymentMethodLabelSnapshot = ReadNullableText(
                            property.Value,
                            "payerPaymentMethodLabelSnapshot",
                            "Payer payment method label snapshot",
                            ExpenseBillConstraints.PayerPaymentMethodLabelSnapshotMaxLength,
                            errors);
                        break;
                    default:
                        AddUnsupportedFieldError(errors);
                        break;
                }
            }

            if (!hasBillDate)
            {
                AddError(errors, "billDate", "Bill date is required.");
            }

            if (currency is null)
            {
                AddError(errors, "currency", "Currency is required.");
            }

            if (items is null)
            {
                AddError(errors, "items", "At least one bill item is required.");
            }
            else if (items.Count == 0)
            {
                AddError(errors, "items", "At least one bill item is required.");
            }

            return errors.Count == 0
                ? PersonalBillCreateReadResult.Valid(new PersonalBillCreateRequest(
                    merchantName,
                    billDate,
                    currency!,
                    items!,
                    adjustments,
                    payerPaymentMethodLabelSnapshot))
                : PersonalBillCreateReadResult.Invalid(ToErrorDictionary(errors));
        }
    }

    private static List<PersonalBillCreateItem> ReadItems(
        JsonElement value,
        string? billCurrency,
        Dictionary<string, List<string>> errors)
    {
        var items = new List<PersonalBillCreateItem>();
        if (value.ValueKind is not JsonValueKind.Array)
        {
            AddError(errors, "items", "Items must be an array.");
            return items;
        }

        var index = 0;
        foreach (var itemElement in value.EnumerateArray())
        {
            var item = ReadItem(itemElement, billCurrency, index, errors);
            if (item is not null)
            {
                items.Add(item);
            }

            index++;
        }

        return items;
    }

    private static PersonalBillCreateItem? ReadItem(
        JsonElement value,
        string? billCurrency,
        int index,
        Dictionary<string, List<string>> errors)
    {
        var fieldPrefix = $"items[{index}]";
        if (value.ValueKind is not JsonValueKind.Object)
        {
            AddError(errors, "items", "Each item must be an object.");
            return null;
        }

        string? name = null;
        string? note = null;
        decimal? amount = null;
        string? currency = null;

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
        return name is not null && amount is not null && currency is not null
            ? new PersonalBillCreateItem(name, note, amount.Value, currency)
            : null;
    }

    private static List<PersonalBillCreateAdjustment> ReadAdjustments(
        JsonElement value,
        string? billCurrency,
        Dictionary<string, List<string>> errors)
    {
        var adjustments = new List<PersonalBillCreateAdjustment>();
        if (value.ValueKind is JsonValueKind.Null)
        {
            return adjustments;
        }

        if (value.ValueKind is not JsonValueKind.Array)
        {
            AddError(errors, "adjustments", "Adjustments must be an array when supplied.");
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

    private static PersonalBillCreateAdjustment? ReadAdjustment(
        JsonElement value,
        string? billCurrency,
        int index,
        Dictionary<string, List<string>> errors)
    {
        var fieldPrefix = $"adjustments[{index}]";
        if (value.ValueKind is not JsonValueKind.Object)
        {
            AddError(errors, "adjustments", "Each adjustment must be an object.");
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
                    allocationMethod = ReadAdjustmentAllocationMethod(
                        property.Value,
                        $"{fieldPrefix}.allocationMethod",
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
                case "reasonNote":
                    reasonNote = ReadNullableText(
                        property.Value,
                        $"{fieldPrefix}.reasonNote",
                        "Adjustment reason note",
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
        return type is not null && direction is not null && allocationMethod is not null && amount is not null && currency is not null
            ? new PersonalBillCreateAdjustment(type, direction, allocationMethod, amount.Value, currency, reasonNote)
            : null;
    }

    private static string? ReadRequiredText(
        JsonElement value,
        string errorKey,
        string displayName,
        int maxLength,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, $"{displayName} must be a string.");
            return null;
        }

        var text = value.GetString()!.Trim();
        if (text.Length == 0)
        {
            AddError(errors, errorKey, $"{displayName} is required.");
            return null;
        }

        if (text.Length > maxLength)
        {
            AddError(errors, errorKey, $"{displayName} must be {maxLength} characters or fewer.");
            return null;
        }

        return text;
    }

    private static string? ReadNullableText(
        JsonElement value,
        string errorKey,
        string displayName,
        int maxLength,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, $"{displayName} must be a string or null.");
            return null;
        }

        var text = value.GetString()!.Trim();
        if (text.Length == 0)
        {
            return null;
        }

        if (text.Length > maxLength)
        {
            AddError(errors, errorKey, $"{displayName} must be {maxLength} characters or fewer.");
            return null;
        }

        return text;
    }

    private static DateOnly ReadBillDate(
        JsonElement value,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String
            || !DateOnly.TryParseExact(
                value.GetString(),
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var billDate))
        {
            AddError(errors, "billDate", "Bill date must be a yyyy-MM-dd date string.");
            return default;
        }

        return billDate;
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

    private static void ApplyCalculation(
        ExpenseBill bill,
        ExpenseBillCalculationResult calculation)
    {
        bill.TotalAmount = calculation.BillTotal!.Amount;
        bill.TotalCurrency = calculation.BillTotal.Currency.Value;

        var splitsById = bill.Items
            .SelectMany(item => item.Splits)
            .ToDictionary(split => split.Id);
        foreach (var calculatedSplit in calculation.ItemSplits)
        {
            var split = splitsById[calculatedSplit.ExpenseBillItemSplitId];
            split.ResolvedAmount = calculatedSplit.ResolvedAmount;
            split.ResolvedCurrency = calculatedSplit.ResolvedCurrency;
            split.ReceivedResidualMinorUnit = calculatedSplit.ReceivedResidualMinorUnit;
        }

        var participantsById = bill.Participants.ToDictionary(participant => participant.UserProfileId);
        foreach (var calculatedShare in calculation.ParticipantShares)
        {
            var participant = participantsById[calculatedShare.UserProfileId];
            participant.ResolvedShareAmount = calculatedShare.ResolvedShareAmount;
            participant.ResolvedShareCurrency = calculatedShare.ResolvedShareCurrency;
            participant.Status = calculatedShare.Status;
        }

        foreach (var payer in bill.Payers)
        {
            payer.Amount = calculation.BillTotal.Amount;
            payer.Currency = calculation.BillTotal.Currency.Value;
        }
    }

    private static PersonalBillResponse MapResponse(
        ExpenseBill bill,
        ExpenseBillCalculationResult calculation,
        Guid actorUserProfileId)
    {
        return new PersonalBillResponse(
            bill.Id,
            bill.MerchantName,
            bill.BillDate,
            bill.Status,
            ExpenseBillReconciliationEndpoints.MapReconciliationResponse(bill),
            ExpenseBillRevisionCreationCapabilityPolicy.Build(bill, actorUserProfileId),
            FormatAmount(bill.TotalAmount),
            bill.TotalCurrency,
            bill.CreatedAtUtc,
            bill.UpdatedAtUtc,
            bill.Items
                .Where(item => item.DeletedAtUtc is null)
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.Id)
                .Select(MapItemResponse)
                .ToArray(),
            bill.Participants
                .OrderBy(participant => participant.UserProfileId)
                .Select(participant => new PersonalBillParticipantResponse(
                    participant.UserProfileId,
                    participant.Status,
                    FormatAmount(participant.ResolvedShareAmount),
                    participant.ResolvedShareCurrency,
                    participant.RejectionReasonCode))
                .ToArray(),
            bill.Payers
                .OrderBy(payer => payer.CreatedAtUtc)
                .ThenBy(payer => payer.Id)
                .Select(payer => new PersonalBillPayerResponse(
                    payer.UserProfileId,
                    FormatAmount(payer.Amount),
                    payer.Currency,
                    payer.PaymentMethodLabelSnapshot))
                .ToArray(),
            bill.Adjustments
                .OrderBy(adjustment => adjustment.SortOrder)
                .ThenBy(adjustment => adjustment.Id)
                .Select(adjustment => new PersonalBillAdjustmentResponse(
                    adjustment.Id,
                    adjustment.Type,
                    adjustment.Direction,
                    adjustment.AllocationMethod,
                    FormatAmount(adjustment.Amount),
                    adjustment.Currency,
                    adjustment.ReasonNote,
                    adjustment.SortOrder))
                .ToArray(),
            calculation.AdjustmentAllocations
                .OrderBy(allocation => allocation.AllocationOrder)
                .ThenBy(allocation => allocation.ExpenseBillAdjustmentId)
                .ThenBy(allocation => allocation.UserProfileId)
                .Select(allocation => new PersonalBillCalculatedAdjustmentAllocationResponse(
                    allocation.ExpenseBillAdjustmentId,
                    allocation.UserProfileId,
                    allocation.Direction,
                    allocation.AllocationMethod,
                    FormatAmount(allocation.AllocatedAmount),
                    allocation.Currency,
                    allocation.AllocationOrder,
                    allocation.ReceivedResidualMinorUnit))
                .ToArray());
    }

    private static PersonalBillItemResponse MapItemResponse(ExpenseBillItem item)
    {
        return new PersonalBillItemResponse(
            item.Id,
            item.Name,
            item.Note,
            FormatAmount(item.Amount),
            item.Currency,
            item.SortOrder,
            item.Splits
                .OrderBy(split => split.AllocationOrder)
                .ThenBy(split => split.UserProfileId)
                .ThenBy(split => split.Id)
                .Select(split => new PersonalBillItemSplitResponse(
                    split.UserProfileId,
                    split.SplitMethod,
                    split.BasisValue is null ? null : FormatAmount(split.BasisValue.Value),
                    FormatAmount(split.ResolvedAmount),
                    split.ResolvedCurrency,
                    split.AllocationOrder,
                    split.ReceivedResidualMinorUnit))
                .ToArray());
    }

    private static IResult MapAuthorizationFailure(BusinessAuthorizationResult authorizationResult)
    {
        return authorizationResult.FailureReason is BusinessAuthorizationFailureReason.DeniedUnauthenticated
            ? Unauthenticated()
            : BillUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult BillUnavailable()
    {
        return Results.Problem(
            title: BillUnavailableTitle,
            detail: BillUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidBillRequest(ExpenseBillCalculationFailure failure)
    {
        return InvalidBillRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            [NormalizeCalculationField(failure.Field)] = [failure.Message]
        });
    }

    private static IResult InvalidBillRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidBillRequestTitle,
            detail: InvalidBillRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult BillWriteFailed()
    {
        return Results.Problem(
            title: BillWriteFailedTitle,
            detail: BillWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static IResult BillReadFailed()
    {
        return Results.Problem(
            title: BillReadFailedTitle,
            detail: BillReadFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static string NormalizeCalculationField(string field)
    {
        return field switch
        {
            "bill.currency" => "currency",
            "items.amount" => "items.amount",
            "items.currency" => "items.currency",
            "items.splits.basis_value" => "items.amount",
            "adjustments.amount" => "adjustments.amount",
            "adjustments.currency" => "adjustments.currency",
            "adjustments.allocation_method" => "adjustments.allocationMethod",
            "payers.amount" => "payerPaymentMethodLabelSnapshot",
            "payers.currency" => "currency",
            _ => field
        };
    }

    private static bool TryReadReconciliationStatusFilter(
        string? submittedStatus,
        out string? status,
        out IDictionary<string, string[]> errors)
    {
        status = null;
        errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        if (submittedStatus is null)
        {
            return true;
        }

        var trimmedStatus = submittedStatus.Trim();
        if (ExpenseBillReconciliationStatuses.IsSupported(trimmedStatus))
        {
            status = trimmedStatus;
            return true;
        }

        errors = new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["reconciliationStatus"] = ["Reconciliation status is not supported."]
        };
        return false;
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

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private sealed record PersonalBillCreateRequest(
        string? MerchantName,
        DateOnly BillDate,
        string Currency,
        IReadOnlyList<PersonalBillCreateItem> Items,
        IReadOnlyList<PersonalBillCreateAdjustment> Adjustments,
        string? PayerPaymentMethodLabelSnapshot);

    private sealed record PersonalBillCreateItem(
        string Name,
        string? Note,
        decimal Amount,
        string Currency);

    private sealed record PersonalBillCreateAdjustment(
        string Type,
        string Direction,
        string AllocationMethod,
        decimal Amount,
        string Currency,
        string? ReasonNote);

    private sealed class BillListFilterReadResult
    {
        private BillListFilterReadResult(
            ExpenseBillSearchFilter? filter,
            IDictionary<string, string[]> errors)
        {
            Filter = filter;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public ExpenseBillSearchFilter? Filter { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static BillListFilterReadResult Valid(ExpenseBillSearchFilter filter)
        {
            return new BillListFilterReadResult(
                filter,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static BillListFilterReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new BillListFilterReadResult(null, errors);
        }
    }

    private sealed class BillReadoutReadResult
    {
        private BillReadoutReadResult(IDictionary<string, string[]> errors)
        {
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public IDictionary<string, string[]> Errors { get; }

        public static BillReadoutReadResult Valid()
        {
            return new BillReadoutReadResult(new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static BillReadoutReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new BillReadoutReadResult(errors);
        }
    }

    private sealed class PersonalBillCreateReadResult
    {
        private PersonalBillCreateReadResult(
            PersonalBillCreateRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public PersonalBillCreateRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static PersonalBillCreateReadResult Valid(PersonalBillCreateRequest request)
        {
            return new PersonalBillCreateReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static PersonalBillCreateReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new PersonalBillCreateReadResult(null, errors);
        }
    }
}
