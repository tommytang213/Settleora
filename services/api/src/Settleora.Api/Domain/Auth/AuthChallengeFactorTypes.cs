namespace Settleora.Api.Domain.Auth;

public static class AuthChallengeFactorTypes
{
    public const string Passkey = "passkey";
    public const string Totp = "totp";
    public const string RecoveryCode = "recovery_code";
    public const string Mfa = "mfa";
}
