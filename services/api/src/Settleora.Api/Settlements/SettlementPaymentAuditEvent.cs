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
    DateTimeOffset OccurredAtUtc,
    Guid? FileObjectId = null,
    string? ActionCategory = null)
{
    public string? PreviousPaymentStatus { get; init; }

    public string? NewPaymentStatus { get; init; }

    public Guid? SettlementResidualId { get; init; }

    public string? ResidualDirection { get; init; }

    public string? ResidualPolicy { get; init; }

    public string? PreviousResidualStatus { get; init; }

    public string? NewResidualStatus { get; init; }

    public decimal? ResidualAmount { get; init; }
}
