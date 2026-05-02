namespace Settleora.Api.Auth.SignIn;

internal enum SignInAttemptOutcome
{
    Succeeded,
    Failed,
    Throttled,
    BlockedByPolicy
}
