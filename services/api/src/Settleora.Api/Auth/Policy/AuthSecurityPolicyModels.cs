using Settleora.Api.Domain.Auth;

namespace Settleora.Api.Auth.Policy;

internal sealed record AuthSecurityPolicyDecision(
    string PolicyVersion,
    string PasskeySupportMode,
    string TotpSupportMode,
    string RecoveryCodeSupportMode,
    string OwnerAdminMfaMode,
    string UserMfaMode,
    int ChallengeExpirySeconds,
    int ChallengeMaxAttemptCount,
    int RecoveryCodeCount,
    int RecoveryCodeMinimumRemainingWarningCount,
    bool IsDefault);

internal sealed record AuthSecurityPolicyReadout(
    string PolicyVersion,
    string PasskeySupportMode,
    string TotpSupportMode,
    string RecoveryCodeSupportMode,
    string EnforcementMode,
    string AccountCompliance,
    bool RequiresEnrollment,
    bool RequiresFreshStepUp,
    bool RecoveryCodesLow,
    bool ServerAuthoritative);

internal sealed record StepUpFreshnessRequest(
    Guid AuthAccountId,
    Guid AuthSessionId,
    string OperationCategory);

internal sealed record StepUpFreshnessResult(
    StepUpFreshnessStatus Status,
    Guid? ChallengeId = null,
    string? FactorType = null,
    DateTimeOffset? SatisfiedAtUtc = null,
    DateTimeOffset? FreshUntilUtc = null,
    string ReasonCategory = "unspecified")
{
    public bool Satisfied => Status == StepUpFreshnessStatus.Satisfied;
}

internal enum StepUpFreshnessStatus
{
    Satisfied,
    Missing,
    Expired,
    Mismatched,
    InvalidOperation
}

internal static class AuthSecurityPolicyOperations
{
    public const string SecuritySettings = "security_settings";
    public const string PasskeyCredentialManagement = "passkey_credential_management";
    public const string MfaFactorManagement = "mfa_factor_management";
    public const string RecoveryCodeManagement = "recovery_code_management";

    public static string Normalize(string? operationCategory)
    {
        if (string.IsNullOrWhiteSpace(operationCategory))
        {
            return SecuritySettings;
        }

        var trimmed = operationCategory.Trim();
        return trimmed.Length <= 120 ? trimmed : trimmed[..120];
    }
}
