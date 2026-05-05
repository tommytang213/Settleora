namespace Settleora.Api.Users.PaymentDetails;

internal sealed record PaymentDetailsAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid SubjectAuthAccountId,
    Guid PaymentProfileId,
    bool RowCreated,
    IReadOnlyList<string> FieldsChanged,
    string? PreviousVisibility,
    string? NewVisibility,
    DateTimeOffset OccurredAtUtc);
