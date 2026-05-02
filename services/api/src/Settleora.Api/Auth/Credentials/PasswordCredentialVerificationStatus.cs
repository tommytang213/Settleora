namespace Settleora.Api.Auth.Credentials;

internal enum PasswordCredentialVerificationStatus
{
    Verified,
    AccountUnavailable,
    CredentialUnavailable,
    CredentialDisabled,
    CredentialRevoked,
    WrongPassword,
    MalformedCredential,
    UnsupportedAlgorithm,
    InvalidConfiguration,
    PersistenceFailed
}
