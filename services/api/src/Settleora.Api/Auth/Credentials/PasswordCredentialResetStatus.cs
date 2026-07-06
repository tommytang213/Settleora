namespace Settleora.Api.Auth.Credentials;

internal enum PasswordCredentialResetStatus
{
    Reset,
    AccountUnavailable,
    CredentialUnavailable,
    CredentialDisabled,
    CredentialRevoked,
    SamePassword,
    HashingFailed,
    PersistenceFailed
}
