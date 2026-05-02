using Settleora.Api.Auth.PasswordHashing;

namespace Settleora.Api.Auth.Credentials;

internal sealed class CredentialCreationResult
{
    private CredentialCreationResult(
        CredentialCreationStatus status,
        PasswordHashFailureReason? hashFailureReason)
    {
        Status = status;
        HashFailureReason = hashFailureReason;
    }

    public bool Succeeded => Status is CredentialCreationStatus.Created;

    public CredentialCreationStatus Status { get; }

    public PasswordHashFailureReason? HashFailureReason { get; }

    public static CredentialCreationResult Created()
    {
        return new CredentialCreationResult(CredentialCreationStatus.Created, null);
    }

    public static CredentialCreationResult Failure(CredentialCreationStatus status)
    {
        return new CredentialCreationResult(status, null);
    }

    public static CredentialCreationResult HashFailure(PasswordHashFailureReason failureReason)
    {
        return new CredentialCreationResult(MapHashFailure(failureReason), failureReason);
    }

    public override string ToString()
    {
        return $"CredentialCreationResult {{ Succeeded = {Succeeded}, Status = {Status}, HashFailureReason = {HashFailureReason?.ToString() ?? "None"} }}";
    }

    private static CredentialCreationStatus MapHashFailure(PasswordHashFailureReason failureReason)
    {
        return failureReason switch
        {
            PasswordHashFailureReason.UnsupportedAlgorithm => CredentialCreationStatus.UnsupportedAlgorithm,
            PasswordHashFailureReason.InvalidConfiguration => CredentialCreationStatus.InvalidConfiguration,
            _ => CredentialCreationStatus.HashingFailed
        };
    }
}
