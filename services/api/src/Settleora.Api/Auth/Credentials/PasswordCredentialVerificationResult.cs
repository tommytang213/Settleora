using Settleora.Api.Auth.PasswordHashing;

namespace Settleora.Api.Auth.Credentials;

internal sealed class PasswordCredentialVerificationResult
{
    private PasswordCredentialVerificationResult(
        PasswordCredentialVerificationStatus status,
        bool rehashAttempted,
        bool rehashed,
        PasswordHashFailureReason? rehashFailureReason)
    {
        Status = status;
        RehashAttempted = rehashAttempted;
        Rehashed = rehashed;
        RehashFailureReason = rehashFailureReason;
    }

    public bool Succeeded => Status is PasswordCredentialVerificationStatus.Verified;

    public PasswordCredentialVerificationStatus Status { get; }

    public bool RehashAttempted { get; }

    public bool Rehashed { get; }

    public PasswordHashFailureReason? RehashFailureReason { get; }

    public static PasswordCredentialVerificationResult Verified(
        bool rehashAttempted = false,
        bool rehashed = false,
        PasswordHashFailureReason? rehashFailureReason = null)
    {
        return new PasswordCredentialVerificationResult(
            PasswordCredentialVerificationStatus.Verified,
            rehashAttempted,
            rehashed,
            rehashFailureReason);
    }

    public static PasswordCredentialVerificationResult Failure(PasswordCredentialVerificationStatus status)
    {
        return new PasswordCredentialVerificationResult(status, false, false, null);
    }

    public override string ToString()
    {
        return $"PasswordCredentialVerificationResult {{ Succeeded = {Succeeded}, Status = {Status}, RehashAttempted = {RehashAttempted}, Rehashed = {Rehashed}, RehashFailureReason = {RehashFailureReason?.ToString() ?? "None"} }}";
    }
}
