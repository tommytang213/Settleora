namespace Settleora.Api.Users.PaymentDetails;

internal sealed record PaymentDetailsAuditEvent(
    string Action,
    Guid ActorAuthAccountId,
    Guid SubjectAuthAccountId,
    Guid? PaymentProfileId,
    bool RowCreated,
    IReadOnlyList<string> FieldsChanged,
    string? PreviousVisibility,
    string? NewVisibility,
    DateTimeOffset OccurredAtUtc,
    Guid? QrFileObjectId = null,
    string? ChangeCategory = null,
    string WorkflowName = "payment_details_self_profile",
    Guid? SettlementRequestId = null,
    Guid? ActorUserProfileId = null,
    Guid? TargetUserProfileId = null,
    Guid? GroupId = null,
    string? GroupMode = null,
    string? Relationship = null,
    bool? IsConfigured = null);
