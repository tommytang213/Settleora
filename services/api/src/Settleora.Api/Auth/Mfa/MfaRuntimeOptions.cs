namespace Settleora.Api.Auth.Mfa;

internal sealed class MfaRuntimeOptions
{
    public const string SectionName = "Auth:Mfa";

    public string TotpIssuer { get; set; } = "Settleora";

    public int TotpSecretBytes { get; set; } = 20;

    public int TotpDigits { get; set; } = 6;

    public int TotpPeriodSeconds { get; set; } = 30;

    public int TotpAllowedDriftPeriods { get; set; } = 1;

    public int EnrollmentExpirySeconds { get; set; } = 600;

    public int ChallengeExpirySeconds { get; set; } = 300;

    public int ChallengeMaxAttemptCount { get; set; } = 5;

    public int StepUpFreshnessSeconds { get; set; } = 300;

    public int RecoveryCodeCount { get; set; } = 10;
}
