namespace Settleora.Api.Users.PaymentDetails;

internal sealed record SelfPaymentDetailsResponse(
    bool IsConfigured,
    Guid? Id,
    string? PreferredMethodLabel,
    string? PaymentHandle,
    string? PaymentNote,
    string Visibility,
    DateTimeOffset? CreatedAtUtc,
    DateTimeOffset? UpdatedAtUtc);
