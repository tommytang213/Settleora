namespace Settleora.Api.Auth.SignIn;

internal enum SignInAbusePreCheckStatus
{
    Allowed,
    ThrottledBySource,
    ThrottledByIdentifier,
    ThrottledByCombined,
    ThrottledGlobally
}
