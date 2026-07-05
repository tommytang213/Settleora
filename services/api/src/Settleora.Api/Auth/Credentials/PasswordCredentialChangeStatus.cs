namespace Settleora.Api.Auth.Credentials;

internal enum PasswordCredentialChangeStatus
{
    Changed,
    AccountUnavailable,
    CredentialUnavailable,
    CredentialDisabled,
    CredentialRevoked,
    CurrentPasswordInvalid,
    SamePassword,
    MalformedCredential,
    UnsupportedAlgorithm,
    InvalidConfiguration,
    HashingFailed,
    PersistenceFailed
}
