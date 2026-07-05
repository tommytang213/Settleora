using Settleora.Api.Auth.PasswordHashing;

namespace Settleora.Api.Auth.Credentials;

internal sealed class PasswordCredentialChangeResult
{
    private PasswordCredentialChangeResult(
        PasswordCredentialChangeStatus status,
        PasswordHashFailureReason? hashFailureReason)
    {
        Status = status;
        HashFailureReason = hashFailureReason;
    }

    public bool Succeeded => Status is PasswordCredentialChangeStatus.Changed;

    public PasswordCredentialChangeStatus Status { get; }

    public PasswordHashFailureReason? HashFailureReason { get; }

    public static PasswordCredentialChangeResult Changed()
    {
        return new PasswordCredentialChangeResult(PasswordCredentialChangeStatus.Changed, null);
    }

    public static PasswordCredentialChangeResult Failure(PasswordCredentialChangeStatus status)
    {
        return new PasswordCredentialChangeResult(status, null);
    }

    public static PasswordCredentialChangeResult HashFailure(PasswordHashFailureReason reason)
    {
        return new PasswordCredentialChangeResult(PasswordCredentialChangeStatus.HashingFailed, reason);
    }

    public override string ToString()
    {
        return $"PasswordCredentialChangeResult {{ Succeeded = {Succeeded}, Status = {Status}, HashFailureReason = {HashFailureReason?.ToString() ?? "None"} }}";
    }
}
