namespace Settleora.Api.Auth.Sessions;

internal enum AuthSessionRevocationStatus
{
    Revoked,
    AlreadyRevoked,
    NotFound,
    AccountUnavailable,
    SessionInactive,
    PersistenceFailed
}
