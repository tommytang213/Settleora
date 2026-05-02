namespace Settleora.Api.Auth.Sessions;

internal enum AuthSessionValidationStatus
{
    Validated,
    SessionUnavailable,
    SessionExpired,
    SessionRevoked,
    SessionInactive,
    AccountUnavailable,
    PersistenceFailed
}
