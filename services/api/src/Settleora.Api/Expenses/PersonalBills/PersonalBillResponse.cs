namespace Settleora.Api.Expenses.PersonalBills;

internal sealed record PersonalBillListResponse(
    IReadOnlyList<PersonalBillResponse> Bills);

internal sealed record PersonalBillResponse(
    Guid Id,
    string? MerchantName,
    DateOnly BillDate,
    string Status,
    string TotalAmount,
    string TotalCurrency,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    IReadOnlyList<PersonalBillItemResponse> Items,
    IReadOnlyList<PersonalBillParticipantResponse> Participants,
    IReadOnlyList<PersonalBillPayerResponse> Payers,
    IReadOnlyList<PersonalBillAdjustmentResponse> Adjustments,
    IReadOnlyList<PersonalBillCalculatedAdjustmentAllocationResponse> CalculatedAdjustmentAllocations);

internal sealed record PersonalBillItemResponse(
    Guid Id,
    string Name,
    string? Note,
    string Amount,
    string Currency,
    int SortOrder,
    IReadOnlyList<PersonalBillItemSplitResponse> Splits);

internal sealed record PersonalBillItemSplitResponse(
    Guid UserProfileId,
    string SplitMethod,
    string? BasisValue,
    string ResolvedAmount,
    string ResolvedCurrency,
    int AllocationOrder,
    bool ReceivedResidualMinorUnit);

internal sealed record PersonalBillParticipantResponse(
    Guid UserProfileId,
    string Status,
    string ResolvedShareAmount,
    string ResolvedShareCurrency);

internal sealed record PersonalBillPayerResponse(
    Guid UserProfileId,
    string Amount,
    string Currency,
    string? PaymentMethodLabelSnapshot);

internal sealed record PersonalBillAdjustmentResponse(
    Guid Id,
    string Type,
    string Direction,
    string AllocationMethod,
    string Amount,
    string Currency,
    string? ReasonNote,
    int SortOrder);

internal sealed record PersonalBillCalculatedAdjustmentAllocationResponse(
    Guid ExpenseBillAdjustmentId,
    Guid UserProfileId,
    string Direction,
    string AllocationMethod,
    string AllocatedAmount,
    string Currency,
    int AllocationOrder,
    bool ReceivedResidualMinorUnit);
