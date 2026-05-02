namespace Settleora.Api.Auth.SignIn;

internal enum LocalSignInStatus
{
    SignedIn,
    InvalidCredentials,
    Throttled,
    BlockedByPolicy,
    SessionCreationFailed,
    InvalidRequest
}
