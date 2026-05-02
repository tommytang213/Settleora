namespace Settleora.Api.Auth.Credentials;

internal enum CredentialCreationStatus
{
    Created,
    AccountUnavailable,
    CredentialAlreadyExists,
    UnsupportedAlgorithm,
    InvalidConfiguration,
    HashingFailed,
    PersistenceFailed
}
