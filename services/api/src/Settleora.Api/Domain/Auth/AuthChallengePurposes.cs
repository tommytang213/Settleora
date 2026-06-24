namespace Settleora.Api.Domain.Auth;

public static class AuthChallengePurposes
{
    public const string PasskeyEnrollment = "passkey_enrollment";
    public const string PasskeySignIn = "passkey_sign_in";
    public const string PasskeyStepUp = "passkey_step_up";
    public const string TotpEnrollment = "totp_enrollment";
    public const string SignIn = "sign_in";
    public const string StepUp = "step_up";
    public const string Recovery = "recovery";
}
