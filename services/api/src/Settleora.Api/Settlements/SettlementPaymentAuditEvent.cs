namespace Settleora.Api.Settlements;

internal sealed record SettlementPaymentAuditEvent(
    string WorkflowName,
    string Action,
    Guid ActorAuthAccountId,
    Guid SubjectAuthAccountId,
    Guid SettlementRequestId,
    Guid SettlementPaymentId,
    Guid SourceExpenseBillId,
    Guid? GroupId,
    string GroupMode,
    Guid DebtorUserProfileId,
    Guid CreditorUserProfileId,
    string PreviousRequestStatus,
    string NewRequestStatus,
    string PaymentStatus,
    decimal PaymentAmount,
    decimal ActivePaymentCoverageAmount,
    decimal RequestAmount,
    string Currency,
    DateOnly PaymentDate,
    DateTimeOffset OccurredAtUtc);
