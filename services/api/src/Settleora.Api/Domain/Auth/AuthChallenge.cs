namespace Settleora.Api.Domain.Auth;

public sealed class AuthChallenge
{
    public Guid Id { get; set; }

    public Guid? AuthAccountId { get; set; }

    public AuthAccount? AuthAccount { get; set; }

    public Guid? AuthSessionId { get; set; }

    public AuthSession? AuthSession { get; set; }

    public Guid? AuthMfaFactorId { get; set; }

    public AuthMfaFactor? AuthMfaFactor { get; set; }

    public Guid? AuthPasskeyCredentialId { get; set; }

    public AuthPasskeyCredential? AuthPasskeyCredential { get; set; }

    public string Purpose { get; set; } = AuthChallengePurposes.SignIn;

    public string FactorType { get; set; } = AuthChallengeFactorTypes.Mfa;

    public string Status { get; set; } = AuthChallengeStatuses.Pending;

    public string ChallengeVerifierHash { get; set; } = string.Empty;

    public string? ChallengeVerifierAlgorithm { get; set; }

    public string? BoundRpId { get; set; }

    public string? BoundOrigin { get; set; }

    public string? RequestContextHash { get; set; }

    public string? CorrelationId { get; set; }

    public int AttemptCount { get; set; }

    public int MaxAttemptCount { get; set; }

    public string? FailureCategory { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset ExpiresAtUtc { get; set; }

    public DateTimeOffset? ConsumedAtUtc { get; set; }

    public DateTimeOffset? FailedAtUtc { get; set; }

    public DateTimeOffset? BlockedAtUtc { get; set; }

    public DateTimeOffset? ReplayDetectedAtUtc { get; set; }
}
