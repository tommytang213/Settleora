namespace Settleora.Api.Auth.PasswordHashing;

internal enum PasswordHashFailureReason
{
    UnsupportedAlgorithm,
    InvalidConfiguration,
    HashingFailed
}
