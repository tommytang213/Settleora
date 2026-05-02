namespace Settleora.Api.Auth.SignIn;

internal interface ISignInAbusePolicyService
{
    SignInAbusePreCheckResult CheckPreVerification(SignInAbusePolicyRequest request);

    void RecordAttempt(SignInAttemptRecord attempt);
}
