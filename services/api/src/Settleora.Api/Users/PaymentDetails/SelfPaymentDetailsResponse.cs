namespace Settleora.Api.Users.PaymentDetails;

internal sealed record SelfPaymentDetailsResponse(
    bool IsConfigured,
    Guid? Id,
    string? PreferredMethodLabel,
    string? PaymentHandle,
    string? PaymentNote,
    string Visibility,
    SelfPaymentDetailsQrFileResponse? QrFile,
    DateTimeOffset? CreatedAtUtc,
    DateTimeOffset? UpdatedAtUtc);

internal sealed record SelfPaymentDetailsQrFileResponse(
    Guid Id,
    string ContentType,
    long SizeBytes,
    DateTimeOffset UpdatedAtUtc);
