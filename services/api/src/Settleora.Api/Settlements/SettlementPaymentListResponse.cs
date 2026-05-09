namespace Settleora.Api.Settlements;

internal sealed record SettlementPaymentListResponse(
    IReadOnlyList<SettlementPaymentResponse> Payments);
