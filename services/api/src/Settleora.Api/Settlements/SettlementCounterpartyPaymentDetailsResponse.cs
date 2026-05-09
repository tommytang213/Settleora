namespace Settleora.Api.Settlements;

internal sealed record SettlementCounterpartyPaymentDetailsResponse(
    Guid UserProfileId,
    bool IsConfigured,
    string? PreferredMethodLabel,
    string? PaymentHandle,
    string? PaymentNote,
    string VisibilityApplied,
    SettlementCounterpartyPaymentDetailsQrFileResponse? QrFile);

internal sealed record SettlementCounterpartyPaymentDetailsQrFileResponse(
    Guid Id,
    string ContentType,
    long SizeBytes,
    DateTimeOffset UpdatedAtUtc);
