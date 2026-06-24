namespace Settleora.Api.Domain.Auth;

public sealed class AuthPasskeyCredential
{
    public Guid Id { get; set; }

    public Guid AuthAccountId { get; set; }

    public AuthAccount AuthAccount { get; set; } = null!;

    public string CredentialIdHash { get; set; } = string.Empty;

    public string PublicKeyCose { get; set; } = string.Empty;

    public string? UserHandleHash { get; set; }

    public long? SignatureCounter { get; set; }

    public bool BackupEligible { get; set; }

    public bool BackupState { get; set; }

    public string? Transports { get; set; }

    public string? AttestationPolicyResult { get; set; }

    public string? DisplayLabel { get; set; }

    public string Status { get; set; } = AuthPasskeyCredentialStatuses.Pending;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? EnrolledAtUtc { get; set; }

    public DateTimeOffset? LastUsedAtUtc { get; set; }

    public DateTimeOffset? DisabledAtUtc { get; set; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public DateTimeOffset? LastReplaySuspectedAtUtc { get; set; }

    public string? StatusReason { get; set; }

    public Guid? LastStatusChangedByAuthAccountId { get; set; }

    public AuthAccount? LastStatusChangedByAuthAccount { get; set; }

    public string? LastStatusChangeCorrelationId { get; set; }
}
