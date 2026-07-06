using Settleora.Api.Auth.PasswordHashing;

namespace Settleora.Api.Auth.Credentials;

internal sealed record PasswordCredentialResetResult(
    PasswordCredentialResetStatus Status,
    PasswordHashFailureReason? HashFailureReason = null)
{
    public bool Succeeded => Status == PasswordCredentialResetStatus.Reset;

    public static PasswordCredentialResetResult Reset()
    {
        return new PasswordCredentialResetResult(PasswordCredentialResetStatus.Reset);
    }

    public static PasswordCredentialResetResult Failure(PasswordCredentialResetStatus status)
    {
        return new PasswordCredentialResetResult(status);
    }

    public static PasswordCredentialResetResult HashFailure(PasswordHashFailureReason failureReason)
    {
        return new PasswordCredentialResetResult(
            PasswordCredentialResetStatus.HashingFailed,
            failureReason);
    }
}
