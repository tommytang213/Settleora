namespace Settleora.Api.Auth.PasswordHashing;

internal enum PasswordVerificationStatus
{
    Verified,
    WrongPassword,
    MalformedVerifier,
    UnsupportedAlgorithm,
    InvalidConfiguration
}
