namespace Settleora.Api.Domain.Auth;

public sealed class AuthRecoveryCodeVerifier
{
    public Guid Id { get; set; }

    public Guid AuthRecoveryCodeBatchId { get; set; }

    public AuthRecoveryCodeBatch Batch { get; set; } = null!;

    public Guid AuthAccountId { get; set; }

    public AuthAccount AuthAccount { get; set; } = null!;

    public string VerifierHash { get; set; } = string.Empty;

    public string VerifierSalt { get; set; } = string.Empty;

    public string VerifierAlgorithm { get; set; } = string.Empty;

    public string VerifierParameters { get; set; } = string.Empty;

    public string Status { get; set; } = AuthRecoveryCodeVerifierStatuses.Unused;

    public DateTimeOffset GeneratedAtUtc { get; set; }

    public DateTimeOffset? ConsumedAtUtc { get; set; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public DateTimeOffset? ReplacedAtUtc { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public Guid? ConsumedByAuthChallengeId { get; set; }

    public AuthChallenge? ConsumedByAuthChallenge { get; set; }

    public string? UseCorrelationId { get; set; }
}
