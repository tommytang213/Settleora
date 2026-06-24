namespace Settleora.Api.Auth.Passkeys;

internal sealed class PasskeyWebAuthnOptions
{
    public const string SectionName = "Auth:Passkeys";

    public string RelyingPartyId { get; set; } = "localhost";

    public string RelyingPartyName { get; set; } = "Settleora";

    public string[] AllowedOrigins { get; set; } =
    [
        "http://localhost",
        "http://localhost:5173",
        "http://localhost:8080",
        "https://localhost"
    ];

    public int ChallengeExpirySeconds { get; set; } = 300;

    public int ChallengeMaxAttemptCount { get; set; } = 5;

    public int StepUpFreshnessSeconds { get; set; } = 300;
}
