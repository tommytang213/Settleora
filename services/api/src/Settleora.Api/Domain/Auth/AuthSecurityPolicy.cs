namespace Settleora.Api.Domain.Auth;

public sealed class AuthSecurityPolicy
{
    public Guid Id { get; set; }

    public int PolicyVersion { get; set; }

    public string Status { get; set; } = AuthSecurityPolicyStatuses.Draft;

    public string PasskeySupportMode { get; set; } = AuthSecurityPolicySupportModes.Disabled;

    public string TotpSupportMode { get; set; } = AuthSecurityPolicySupportModes.Disabled;

    public string RecoveryCodeSupportMode { get; set; } = AuthSecurityPolicySupportModes.Disabled;

    public string OwnerAdminMfaMode { get; set; } = AuthSecurityPolicyEnforcementModes.BlockingWarning;

    public string UserMfaMode { get; set; } = AuthSecurityPolicyEnforcementModes.Optional;

    public int ChallengeExpirySeconds { get; set; }

    public int ChallengeMaxAttemptCount { get; set; }

    public int RecoveryCodeCount { get; set; }

    public int RecoveryCodeMinimumRemainingWarningCount { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }

    public DateTimeOffset? EffectiveFromUtc { get; set; }

    public DateTimeOffset? RetiredAtUtc { get; set; }

    public Guid? ChangedByAuthAccountId { get; set; }

    public AuthAccount? ChangedByAuthAccount { get; set; }

    public string? ChangeReasonCategory { get; set; }

    public string? ChangeCorrelationId { get; set; }
}
