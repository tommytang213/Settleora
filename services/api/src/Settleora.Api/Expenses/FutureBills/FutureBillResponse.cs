using Settleora.Api.Expenses.RecurringBills;

namespace Settleora.Api.Expenses.FutureBills;

internal sealed record FutureBillListResponse(
    IReadOnlyList<FutureBillResponse> FutureBills);

internal sealed record FutureBillResponse(
    Guid Id,
    Guid OwnerUserProfileId,
    Guid? GroupId,
    string? MerchantName,
    DateOnly DueDate,
    string Status,
    bool SettlementEffective,
    string TotalAmount,
    string TotalCurrency,
    RecurringBillTemplatePayloadResponse BillPayload,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? ArchivedAtUtc);
