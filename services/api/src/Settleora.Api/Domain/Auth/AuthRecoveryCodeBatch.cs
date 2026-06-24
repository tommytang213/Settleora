namespace Settleora.Api.Domain.Auth;

public sealed class AuthRecoveryCodeBatch
{
    public Guid Id { get; set; }

    public Guid AuthAccountId { get; set; }

    public AuthAccount AuthAccount { get; set; } = null!;

    public string Status { get; set; } = AuthRecoveryCodeBatchStatuses.Active;

    public string? PolicyVersion { get; set; }

    public int TotalGeneratedCount { get; set; }

    public int RemainingUnusedCount { get; set; }

    public int UsedCount { get; set; }

    public DateTimeOffset GeneratedAtUtc { get; set; }

    public DateTimeOffset? DisplayedAtUtc { get; set; }

    public DateTimeOffset? LastUsedAtUtc { get; set; }

    public DateTimeOffset? ReplacedAtUtc { get; set; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public string? StatusReason { get; set; }

    public Guid? CreatedByAuthAccountId { get; set; }

    public AuthAccount? CreatedByAuthAccount { get; set; }

    public string? CreatedCorrelationId { get; set; }

    public ICollection<AuthRecoveryCodeVerifier> Verifiers { get; } = new List<AuthRecoveryCodeVerifier>();
}
