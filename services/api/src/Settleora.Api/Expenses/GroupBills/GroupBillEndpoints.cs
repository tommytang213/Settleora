using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Users;
using Settleora.Api.Expenses.BillSearch;
using Settleora.Api.Expenses.Reconciliation;
using Settleora.Api.Money;
using Settleora.Api.Persistence;

namespace Settleora.Api.Expenses.GroupBills;

internal static class GroupBillEndpoints
{
    private const string UnauthenticatedTitle = "Unauthenticated";
    private const string UnauthenticatedDetail = "Authentication is required to access this resource.";
    private const string GroupBillUnavailableTitle = "Group bill unavailable";
    private const string GroupBillUnavailableDetail = "The requested group bill is unavailable.";
    private const string InvalidGroupBillRequestTitle = "Invalid group bill request";
    private const string InvalidGroupBillRequestDetail = "The submitted group bill request is invalid.";
    private const string GroupBillWriteFailedTitle = "Group bill write failed";
    private const string GroupBillWriteFailedDetail = "Unable to complete group bill write.";
    private const string GroupBillReadFailedTitle = "Group bill read failed";
    private const string GroupBillReadFailedDetail = "Unable to read group bill calculation data.";
    private const string BillCreatedAction = "bill.created";
    private const string GroupMode = "group";

    public static WebApplication MapGroupBillEndpoints(this WebApplication app)
    {
        var groupBills = app.MapGroup("/api/v1/groups/{groupId:guid}/bills")
            .RequireAuthorization(SettleoraAuthorizationPolicies.AuthenticatedUser);

        groupBills.MapPost("", CreateGroupBillAsync);
        groupBills.MapGet("", ListGroupBillsAsync);
        groupBills.MapGet("/{billId:guid}", GetGroupBillAsync);

        return app;
    }

    private static async Task<IResult> CreateGroupBillAsync(
        Guid groupId,
        HttpRequest request,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        IGroupBillAuditWriter auditWriter,
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
            return InvalidGroupBillRequest(readResult.Errors);
        }

        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var activeMemberIds = await LoadActiveGroupMemberIdsAsync(
            dbContext,
            groupId,
            cancellationToken);
        if (!activeMemberIds.Contains(actor.UserProfileId)
            || !AllSubmittedMembersAreActive(readResult.Request, activeMemberIds))
        {
            return GroupBillUnavailable();
        }

        var now = timeProvider.GetUtcNow();
        var createRequest = readResult.Request;
        var bill = CreateDraftBill(
            groupId,
            actor.UserProfileId,
            createRequest,
            now);

        var initialCalculation = calculationService.Calculate(bill);
        if (!initialCalculation.Succeeded)
        {
            return InvalidGroupBillRequest(initialCalculation.Failure!);
        }

        ApplyCalculation(bill, initialCalculation);
        if (createRequest.Payers.Count == 0)
        {
            var payer = new ExpenseBillPayer
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = bill.Id,
                UserProfileId = actor.UserProfileId,
                Amount = initialCalculation.BillTotal!.Amount,
                Currency = initialCalculation.BillTotal.Currency.Value,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            ExpenseBillPayerConfirmationPolicy.ApplyCreatedBy(payer, actor.UserProfileId, now);
            bill.Payers.Add(payer);
        }
        else
        {
            foreach (var payerRequest in createRequest.Payers)
            {
                var payer = new ExpenseBillPayer
                {
                    Id = Guid.NewGuid(),
                    ExpenseBillId = bill.Id,
                    UserProfileId = payerRequest.UserProfileId,
                    Amount = payerRequest.Amount,
                    Currency = payerRequest.Currency,
                    PaymentMethodLabelSnapshot = payerRequest.PaymentMethodLabelSnapshot,
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now
                };
                ExpenseBillPayerConfirmationPolicy.ApplyCreatedBy(payer, actor.UserProfileId, now);
                bill.Payers.Add(payer);
            }
        }

        var finalCalculation = calculationService.Calculate(bill);
        if (!finalCalculation.Succeeded)
        {
            return InvalidGroupBillRequest(finalCalculation.Failure!);
        }

        ApplyCalculation(bill, finalCalculation);
        dbContext.Set<ExpenseBill>().Add(bill);
        await auditWriter.WriteAsync(
            new GroupBillAuditEvent(
                BillCreatedAction,
                actor.AuthAccountId,
                actor.AuthAccountId,
                bill.Id,
                groupId,
                GroupMode,
                bill.Status,
                bill.Items.Count,
                bill.Adjustments.Count,
                bill.Participants.Count,
                bill.Payers.Count,
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
            return GroupBillWriteFailed();
        }

        return Results.Created(
            $"/api/v1/groups/{groupId:D}/bills/{bill.Id:D}",
            MapResponse(bill, finalCalculation));
    }

    private static async Task<IResult> ListGroupBillsAsync(
        Guid groupId,
        string? fromDate,
        string? toDate,
        string? status,
        string? reconciliationStatus,
        string? currency,
        string? merchant,
        string? search,
        string? limit,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out _))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        if (!ExpenseBillSearchFilter.TryRead(
            fromDate,
            toDate,
            status,
            reconciliationStatus,
            currency,
            merchant,
            search,
            limit,
            out var filter,
            out var filterErrors))
        {
            return InvalidGroupBillRequest(filterErrors);
        }

        var bills = await ExpenseBillSearchQueries.VisibleGroupBills(dbContext, groupId)
            .ApplySearchFilter(filter)
            .WithBillDetails()
            .OrderForList()
            .Take(filter.Limit)
            .ToListAsync(cancellationToken);
        var responses = new List<GroupBillResponse>(bills.Count);

        foreach (var bill in bills)
        {
            var calculation = calculationService.Calculate(bill);
            if (!calculation.Succeeded)
            {
                return GroupBillReadFailed();
            }

            responses.Add(MapResponse(bill, calculation));
        }

        return Results.Ok(new GroupBillListResponse(responses));
    }

    private static async Task<IResult> GetGroupBillAsync(
        Guid groupId,
        Guid billId,
        ICurrentActorAccessor currentActorAccessor,
        IBusinessAuthorizationService businessAuthorizationService,
        ExpenseBillCalculationService calculationService,
        SettleoraDbContext dbContext,
        CancellationToken cancellationToken)
    {
        if (!currentActorAccessor.TryGetCurrentActor(out _))
        {
            return Unauthenticated();
        }

        var authorizationResult = await businessAuthorizationService.CanAccessGroupAsync(
            groupId,
            cancellationToken);
        if (!authorizationResult.Allowed)
        {
            return MapAuthorizationFailure(authorizationResult);
        }

        var bill = await GroupBillsQuery(dbContext, groupId)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == billId,
                cancellationToken);
        if (bill is null)
        {
            return GroupBillUnavailable();
        }

        var calculation = calculationService.Calculate(bill);
        return calculation.Succeeded
            ? Results.Ok(MapResponse(bill, calculation))
            : GroupBillReadFailed();
    }

    private static IQueryable<ExpenseBill> GroupBillsQuery(
        SettleoraDbContext dbContext,
        Guid groupId)
    {
        return ExpenseBillSearchQueries.VisibleGroupBills(dbContext, groupId)
            .WithBillDetails();
    }

    private static async Task<HashSet<Guid>> LoadActiveGroupMemberIdsAsync(
        SettleoraDbContext dbContext,
        Guid groupId,
        CancellationToken cancellationToken)
    {
        return await dbContext.Set<GroupMembership>()
            .AsNoTracking()
            .Where(membership => membership.GroupId == groupId
                && membership.Status == GroupMembershipStatuses.Active
                && membership.Group.DeletedAtUtc == null
                && membership.UserProfile.DeletedAtUtc == null)
            .Select(membership => membership.UserProfileId)
            .ToHashSetAsync(cancellationToken);
    }

    private static bool AllSubmittedMembersAreActive(
        GroupBillCreateRequest createRequest,
        IReadOnlySet<Guid> activeMemberIds)
    {
        foreach (var split in createRequest.Items.SelectMany(item => item.Splits))
        {
            if (!activeMemberIds.Contains(split.UserProfileId))
            {
                return false;
            }
        }

        foreach (var payer in createRequest.Payers)
        {
            if (!activeMemberIds.Contains(payer.UserProfileId))
            {
                return false;
            }
        }

        return true;
    }

    private static ExpenseBill CreateDraftBill(
        Guid groupId,
        Guid actorUserProfileId,
        GroupBillCreateRequest createRequest,
        DateTimeOffset now)
    {
        var bill = new ExpenseBill
        {
            Id = Guid.NewGuid(),
            CreatedByUserProfileId = actorUserProfileId,
            BillOwnerUserProfileId = actorUserProfileId,
            GroupId = groupId,
            MerchantName = createRequest.MerchantName,
            BillDate = createRequest.BillDate,
            Status = ExpenseBillStatuses.Draft,
            TotalAmount = 0m,
            TotalCurrency = createRequest.Currency,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        foreach (var participantId in ResolveParticipantIds(createRequest, actorUserProfileId))
        {
            bill.Participants.Add(new ExpenseBillParticipant
            {
                ExpenseBillId = bill.Id,
                UserProfileId = participantId,
                Status = ExpenseBillParticipantStatuses.PendingAcceptance,
                ResolvedShareAmount = 0m,
                ResolvedShareCurrency = createRequest.Currency,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        for (var itemIndex = 0; itemIndex < createRequest.Items.Count; itemIndex++)
        {
            var itemRequest = createRequest.Items[itemIndex];
            var item = new ExpenseBillItem
            {
                Id = Guid.NewGuid(),
                ExpenseBillId = bill.Id,
                Name = itemRequest.Name,
                Note = itemRequest.Note,
                Amount = itemRequest.Amount,
                Currency = itemRequest.Currency,
                SortOrder = itemIndex,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            foreach (var splitRequest in itemRequest.Splits)
            {
                item.Splits.Add(new ExpenseBillItemSplit
                {
                    Id = Guid.NewGuid(),
                    ExpenseBillItemId = item.Id,
                    UserProfileId = splitRequest.UserProfileId,
                    SplitMethod = splitRequest.SplitMethod,
                    BasisValue = splitRequest.BasisValue,
                    ResolvedAmount = 0m,
                    ResolvedCurrency = itemRequest.Currency,
                    AllocationOrder = splitRequest.AllocationOrder,
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now
                });
            }

            bill.Items.Add(item);
        }

        for (var adjustmentIndex = 0; adjustmentIndex < createRequest.Adjustments.Count; adjustmentIndex++)
        {
            var adjustmentRequest = createRequest.Adjustments[adjustmentIndex];
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
                SortOrder = adjustmentIndex,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        return bill;
    }

    private static IReadOnlyList<Guid> ResolveParticipantIds(
        GroupBillCreateRequest createRequest,
        Guid actorUserProfileId)
    {
        var participantIds = new List<Guid>();
        foreach (var split in createRequest.Items.SelectMany(item => item.Splits))
        {
            AddParticipantId(participantIds, split.UserProfileId);
        }

        if (createRequest.Payers.Count == 0)
        {
            AddParticipantId(participantIds, actorUserProfileId);
        }
        else
        {
            foreach (var payer in createRequest.Payers)
            {
                AddParticipantId(participantIds, payer.UserProfileId);
            }
        }

        return participantIds;
    }

    private static void AddParticipantId(
        ICollection<Guid> participantIds,
        Guid participantId)
    {
        if (!participantIds.Contains(participantId))
        {
            participantIds.Add(participantId);
        }
    }

    private static async Task<GroupBillCreateReadResult> ReadCreateRequestAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (!request.HasJsonContentType())
        {
            AddError(errors, "body", "A JSON object body is required.");
            return GroupBillCreateReadResult.Invalid(ToErrorDictionary(errors));
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
            return GroupBillCreateReadResult.Invalid(ToErrorDictionary(errors));
        }
        catch (BadHttpRequestException)
        {
            AddError(errors, "body", "A JSON object body is required.");
            return GroupBillCreateReadResult.Invalid(ToErrorDictionary(errors));
        }

        using (document)
        {
            if (document.RootElement.ValueKind is not JsonValueKind.Object)
            {
                AddError(errors, "body", "A JSON object body is required.");
                return GroupBillCreateReadResult.Invalid(ToErrorDictionary(errors));
            }

            string? merchantName = null;
            DateOnly billDate = default;
            var hasBillDate = false;
            string? currency = document.RootElement.TryGetProperty("currency", out var currencyElement)
                ? ReadCurrency(currencyElement, "currency", errors)
                : null;
            List<GroupBillCreateItem>? items = null;
            var adjustments = new List<GroupBillCreateAdjustment>();
            var payers = new List<GroupBillCreatePayer>();

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
                    case "payers":
                        payers = ReadPayers(property.Value, currency, errors);
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
                ? GroupBillCreateReadResult.Valid(new GroupBillCreateRequest(
                    merchantName,
                    billDate,
                    currency!,
                    items!,
                    adjustments,
                    payers))
                : GroupBillCreateReadResult.Invalid(ToErrorDictionary(errors));
        }
    }

    private static List<GroupBillCreateItem> ReadItems(
        JsonElement value,
        string? billCurrency,
        Dictionary<string, List<string>> errors)
    {
        var items = new List<GroupBillCreateItem>();
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

    private static GroupBillCreateItem? ReadItem(
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

        string? itemCurrency = value.TryGetProperty("currency", out var currencyElement)
            ? ReadCurrency(currencyElement, $"{fieldPrefix}.currency", errors)
            : null;
        itemCurrency ??= billCurrency;

        string? name = null;
        string? note = null;
        decimal? amount = null;
        List<GroupBillCreateItemSplit>? splits = null;

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
                        itemCurrency,
                        $"{fieldPrefix}.amount",
                        $"{fieldPrefix}.currency",
                        errors);
                    break;
                case "currency":
                    break;
                case "splits":
                    splits = ReadItemSplits(property.Value, itemCurrency, index, errors);
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

        if (splits is null)
        {
            AddError(errors, $"{fieldPrefix}.splits", "At least one item split is required.");
        }
        else if (splits.Count == 0)
        {
            AddError(errors, $"{fieldPrefix}.splits", "At least one item split is required.");
        }

        return name is not null && amount is not null && itemCurrency is not null && splits is { Count: > 0 }
            ? new GroupBillCreateItem(name, note, amount.Value, itemCurrency, splits)
            : null;
    }

    private static List<GroupBillCreateItemSplit> ReadItemSplits(
        JsonElement value,
        string? itemCurrency,
        int itemIndex,
        Dictionary<string, List<string>> errors)
    {
        var splits = new List<GroupBillCreateItemSplit>();
        if (value.ValueKind is not JsonValueKind.Array)
        {
            AddError(errors, $"items[{itemIndex}].splits", "Item splits must be an array.");
            return splits;
        }

        var index = 0;
        foreach (var splitElement in value.EnumerateArray())
        {
            var split = ReadItemSplit(splitElement, itemCurrency, itemIndex, index, errors);
            if (split is not null)
            {
                splits.Add(split);
            }

            index++;
        }

        return splits;
    }

    private static GroupBillCreateItemSplit? ReadItemSplit(
        JsonElement value,
        string? itemCurrency,
        int itemIndex,
        int splitIndex,
        Dictionary<string, List<string>> errors)
    {
        var fieldPrefix = $"items[{itemIndex}].splits[{splitIndex}]";
        if (value.ValueKind is not JsonValueKind.Object)
        {
            AddError(errors, $"items[{itemIndex}].splits", "Each item split must be an object.");
            return null;
        }

        string? splitMethod = value.TryGetProperty("splitMethod", out var splitMethodElement)
            ? ReadSplitMethod(splitMethodElement, $"{fieldPrefix}.splitMethod", errors)
            : null;

        Guid? userProfileId = null;
        decimal? basisValue = null;
        var hasBasisValue = false;
        var allocationOrder = splitIndex;

        foreach (var property in value.EnumerateObject())
        {
            switch (property.Name)
            {
                case "userProfileId":
                    userProfileId = ReadUserProfileId(property.Value, $"{fieldPrefix}.userProfileId", errors);
                    break;
                case "splitMethod":
                    break;
                case "basisValue":
                    hasBasisValue = true;
                    basisValue = ReadSplitBasisValue(
                        property.Value,
                        splitMethod,
                        itemCurrency,
                        $"{fieldPrefix}.basisValue",
                        $"{fieldPrefix}.currency",
                        errors);
                    break;
                case "allocationOrder":
                    allocationOrder = ReadAllocationOrder(
                        property.Value,
                        $"{fieldPrefix}.allocationOrder",
                        splitIndex,
                        errors);
                    break;
                default:
                    AddUnsupportedFieldError(errors);
                    break;
            }
        }

        if (userProfileId is null)
        {
            AddError(errors, $"{fieldPrefix}.userProfileId", "Split user profile ID is required.");
        }

        if (splitMethod is null)
        {
            AddError(errors, $"{fieldPrefix}.splitMethod", "Split method is required.");
        }

        if (RequiresSplitBasis(splitMethod) && (!hasBasisValue || basisValue is null))
        {
            AddError(errors, $"{fieldPrefix}.basisValue", "Split basis value is required for this split method.");
        }

        return userProfileId is not null && splitMethod is not null
            && (!RequiresSplitBasis(splitMethod) || basisValue is not null)
            ? new GroupBillCreateItemSplit(userProfileId.Value, splitMethod, basisValue, allocationOrder)
            : null;
    }

    private static List<GroupBillCreateAdjustment> ReadAdjustments(
        JsonElement value,
        string? billCurrency,
        Dictionary<string, List<string>> errors)
    {
        var adjustments = new List<GroupBillCreateAdjustment>();
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

    private static GroupBillCreateAdjustment? ReadAdjustment(
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
        return type is not null && direction is not null && allocationMethod is not null
            && amount is not null && currency is not null
            ? new GroupBillCreateAdjustment(type, direction, allocationMethod, amount.Value, currency, reasonNote)
            : null;
    }

    private static List<GroupBillCreatePayer> ReadPayers(
        JsonElement value,
        string? billCurrency,
        Dictionary<string, List<string>> errors)
    {
        var payers = new List<GroupBillCreatePayer>();
        if (value.ValueKind is JsonValueKind.Null)
        {
            return payers;
        }

        if (value.ValueKind is not JsonValueKind.Array)
        {
            AddError(errors, "payers", "Payers must be an array when supplied.");
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

    private static GroupBillCreatePayer? ReadPayer(
        JsonElement value,
        string? billCurrency,
        int index,
        Dictionary<string, List<string>> errors)
    {
        var fieldPrefix = $"payers[{index}]";
        if (value.ValueKind is not JsonValueKind.Object)
        {
            AddError(errors, "payers", "Each payer must be an object.");
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
                    userProfileId = ReadUserProfileId(property.Value, $"{fieldPrefix}.userProfileId", errors);
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
            AddError(errors, $"{fieldPrefix}.userProfileId", "Payer user profile ID is required.");
        }

        if (amount is null)
        {
            AddError(errors, $"{fieldPrefix}.amount", "Payer amount is required.");
        }

        currency ??= billCurrency;
        return userProfileId is not null && amount is not null && currency is not null
            ? new GroupBillCreatePayer(
                userProfileId.Value,
                amount.Value,
                currency,
                paymentMethodLabelSnapshot)
            : null;
    }

    private static Guid? ReadUserProfileId(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String
            || !Guid.TryParse(value.GetString(), out var userProfileId))
        {
            AddError(errors, errorKey, "User profile ID must be a UUID string.");
            return null;
        }

        return userProfileId;
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

    private static decimal? ReadSplitBasisValue(
        JsonElement value,
        string? splitMethod,
        string? itemCurrency,
        string basisValueField,
        string itemCurrencyField,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is JsonValueKind.Null)
        {
            return null;
        }

        if (splitMethod is ExpenseBillItemSplitMethods.ExactAmount)
        {
            return ReadMoneyAmount(
                value,
                itemCurrency,
                basisValueField,
                itemCurrencyField,
                errors);
        }

        return ReadPlainDecimalBasisValue(value, basisValueField, errors);
    }

    private static decimal? ReadPlainDecimalBasisValue(
        JsonElement value,
        string errorKey,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.String)
        {
            AddError(errors, errorKey, "Basis value must be a plain base-10 decimal string.");
            return null;
        }

        var submittedValue = value.GetString();
        if (string.IsNullOrEmpty(submittedValue) || !IsPlainDecimalString(submittedValue))
        {
            AddError(errors, errorKey, "Basis value must be a plain base-10 decimal string.");
            return null;
        }

        if (!decimal.TryParse(
            submittedValue,
            NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
            CultureInfo.InvariantCulture,
            out var basisValue)
            || decimal.Abs(basisValue) > MoneyAmount.MaxAbsStorageAmount)
        {
            AddError(errors, errorKey, "Basis value exceeds the supported range.");
            return null;
        }

        return basisValue;
    }

    private static int ReadAllocationOrder(
        JsonElement value,
        string errorKey,
        int defaultValue,
        Dictionary<string, List<string>> errors)
    {
        if (value.ValueKind is not JsonValueKind.Number
            || !value.TryGetInt32(out var allocationOrder)
            || allocationOrder < 0)
        {
            AddError(errors, errorKey, "Allocation order must be a non-negative integer.");
            return defaultValue;
        }

        return allocationOrder;
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
    }

    private static GroupBillResponse MapResponse(
        ExpenseBill bill,
        ExpenseBillCalculationResult calculation)
    {
        return new GroupBillResponse(
            bill.Id,
            bill.GroupId!.Value,
            bill.MerchantName,
            bill.BillDate,
            bill.Status,
            ExpenseBillReconciliationEndpoints.MapReconciliationResponse(bill),
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
                .Select(participant => new GroupBillParticipantResponse(
                    participant.UserProfileId,
                    participant.Status,
                    FormatAmount(participant.ResolvedShareAmount),
                    participant.ResolvedShareCurrency,
                    participant.RejectionReasonCode))
                .ToArray(),
            bill.Payers
                .OrderBy(payer => payer.CreatedAtUtc)
                .ThenBy(payer => payer.Id)
                .Select(payer => new GroupBillPayerResponse(
                    payer.UserProfileId,
                    FormatAmount(payer.Amount),
                    payer.Currency,
                    payer.PaymentMethodLabelSnapshot))
                .ToArray(),
            bill.Adjustments
                .OrderBy(adjustment => adjustment.SortOrder)
                .ThenBy(adjustment => adjustment.Id)
                .Select(adjustment => new GroupBillAdjustmentResponse(
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
                .Select(allocation => new GroupBillCalculatedAdjustmentAllocationResponse(
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

    private static GroupBillItemResponse MapItemResponse(ExpenseBillItem item)
    {
        return new GroupBillItemResponse(
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
                .Select(split => new GroupBillItemSplitResponse(
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
            : GroupBillUnavailable();
    }

    private static IResult Unauthenticated()
    {
        return Results.Problem(
            title: UnauthenticatedTitle,
            detail: UnauthenticatedDetail,
            statusCode: StatusCodes.Status401Unauthorized);
    }

    private static IResult GroupBillUnavailable()
    {
        return Results.Problem(
            title: GroupBillUnavailableTitle,
            detail: GroupBillUnavailableDetail,
            statusCode: StatusCodes.Status404NotFound);
    }

    private static IResult InvalidGroupBillRequest(ExpenseBillCalculationFailure failure)
    {
        return InvalidGroupBillRequest(new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            [NormalizeCalculationField(failure.Field)] = [failure.Message]
        });
    }

    private static IResult InvalidGroupBillRequest(IDictionary<string, string[]> errors)
    {
        return Results.ValidationProblem(
            errors,
            title: InvalidGroupBillRequestTitle,
            detail: InvalidGroupBillRequestDetail,
            statusCode: StatusCodes.Status400BadRequest);
    }

    private static IResult GroupBillWriteFailed()
    {
        return Results.Problem(
            title: GroupBillWriteFailedTitle,
            detail: GroupBillWriteFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static IResult GroupBillReadFailed()
    {
        return Results.Problem(
            title: GroupBillReadFailedTitle,
            detail: GroupBillReadFailedDetail,
            statusCode: StatusCodes.Status500InternalServerError);
    }

    private static string NormalizeCalculationField(string field)
    {
        return field switch
        {
            "bill.currency" => "currency",
            "items.amount" => "items.amount",
            "items.currency" => "items.currency",
            "items.splits.basis_value" => "items.splits.basisValue",
            "items.splits.split_method" => "items.splits.splitMethod",
            "adjustments.amount" => "adjustments.amount",
            "adjustments.currency" => "adjustments.currency",
            "adjustments.allocation_method" => "adjustments.allocationMethod",
            "payers.amount" => "payers.amount",
            "payers.currency" => "payers.currency",
            "payers.user_profile_id" => "payers.userProfileId",
            "participants.user_profile_id" => "participants.userProfileId",
            _ => field
        };
    }

    private static bool RequiresSplitBasis(string? splitMethod)
    {
        return splitMethod is ExpenseBillItemSplitMethods.ExactAmount
            or ExpenseBillItemSplitMethods.Percentage
            or ExpenseBillItemSplitMethods.Ratio
            or ExpenseBillItemSplitMethods.ShareWeight;
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

    private static bool IsPlainDecimalString(string value)
    {
        var index = 0;
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

    private static string FormatAmount(decimal amount)
    {
        return amount.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private sealed record GroupBillCreateRequest(
        string? MerchantName,
        DateOnly BillDate,
        string Currency,
        IReadOnlyList<GroupBillCreateItem> Items,
        IReadOnlyList<GroupBillCreateAdjustment> Adjustments,
        IReadOnlyList<GroupBillCreatePayer> Payers);

    private sealed record GroupBillCreateItem(
        string Name,
        string? Note,
        decimal Amount,
        string Currency,
        IReadOnlyList<GroupBillCreateItemSplit> Splits);

    private sealed record GroupBillCreateItemSplit(
        Guid UserProfileId,
        string SplitMethod,
        decimal? BasisValue,
        int AllocationOrder);

    private sealed record GroupBillCreateAdjustment(
        string Type,
        string Direction,
        string AllocationMethod,
        decimal Amount,
        string Currency,
        string? ReasonNote);

    private sealed record GroupBillCreatePayer(
        Guid UserProfileId,
        decimal Amount,
        string Currency,
        string? PaymentMethodLabelSnapshot);

    private sealed class GroupBillCreateReadResult
    {
        private GroupBillCreateReadResult(
            GroupBillCreateRequest? request,
            IDictionary<string, string[]> errors)
        {
            Request = request;
            Errors = errors;
        }

        public bool Succeeded => Errors.Count == 0;

        public GroupBillCreateRequest? Request { get; }

        public IDictionary<string, string[]> Errors { get; }

        public static GroupBillCreateReadResult Valid(GroupBillCreateRequest request)
        {
            return new GroupBillCreateReadResult(
                request,
                new Dictionary<string, string[]>(StringComparer.Ordinal));
        }

        public static GroupBillCreateReadResult Invalid(IDictionary<string, string[]> errors)
        {
            return new GroupBillCreateReadResult(null, errors);
        }
    }
}
