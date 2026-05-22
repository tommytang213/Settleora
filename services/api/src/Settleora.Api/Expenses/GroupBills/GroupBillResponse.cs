using Settleora.Api.Expenses.Reconciliation;
using Settleora.Api.Expenses.BillRevisions;

namespace Settleora.Api.Expenses.GroupBills;

internal sealed record GroupBillListResponse(
    IReadOnlyList<GroupBillResponse> Bills);

internal sealed record GroupBillResponse(
    Guid Id,
    Guid GroupId,
    string? MerchantName,
    DateOnly BillDate,
    string Status,
    ExpenseBillReconciliationResponse Reconciliation,
    BillRevisionCreationActionsResponse RevisionCreationActions,
    string TotalAmount,
    string TotalCurrency,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    IReadOnlyList<GroupBillItemResponse> Items,
    IReadOnlyList<GroupBillParticipantResponse> Participants,
    IReadOnlyList<GroupBillPayerResponse> Payers,
    IReadOnlyList<GroupBillAdjustmentResponse> Adjustments,
    IReadOnlyList<GroupBillCalculatedAdjustmentAllocationResponse> CalculatedAdjustmentAllocations);

internal sealed record GroupBillItemResponse(
    Guid Id,
    string Name,
    string? Note,
    string Amount,
    string Currency,
    int SortOrder,
    IReadOnlyList<GroupBillItemSplitResponse> Splits);

internal sealed record GroupBillItemSplitResponse(
    Guid UserProfileId,
    string SplitMethod,
    string? BasisValue,
    string ResolvedAmount,
    string ResolvedCurrency,
    int AllocationOrder,
    bool ReceivedResidualMinorUnit);

internal sealed record GroupBillParticipantResponse(
    Guid UserProfileId,
    string Status,
    string ResolvedShareAmount,
    string ResolvedShareCurrency,
    string? RejectionReasonCode);

internal sealed record GroupBillPayerResponse(
    Guid UserProfileId,
    string Amount,
    string Currency,
    string? PaymentMethodLabelSnapshot);

internal sealed record GroupBillAdjustmentResponse(
    Guid Id,
    string Type,
    string Direction,
    string AllocationMethod,
    string Amount,
    string Currency,
    string? ReasonNote,
    int SortOrder);

internal sealed record GroupBillCalculatedAdjustmentAllocationResponse(
    Guid ExpenseBillAdjustmentId,
    Guid UserProfileId,
    string Direction,
    string AllocationMethod,
    string AllocatedAmount,
    string Currency,
    int AllocationOrder,
    bool ReceivedResidualMinorUnit);
