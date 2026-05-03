namespace Settleora.Api.Auth.Sessions;

internal enum AuthRefreshSessionRotationStatus
{
    Rotated,
    CredentialUnavailable,
    CredentialExpired,
    CredentialRevoked,
    CredentialReplayed,
    CredentialInactive,
    SessionFamilyExpired,
    SessionFamilyRevoked,
    SessionFamilyReplayed,
    SessionFamilyInactive,
    AccountUnavailable,
    PersistenceFailed
}
