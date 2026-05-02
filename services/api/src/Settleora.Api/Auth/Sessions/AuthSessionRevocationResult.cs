namespace Settleora.Api.Auth.Sessions;

internal sealed class AuthSessionRevocationResult
{
    private AuthSessionRevocationResult(
        AuthSessionRevocationStatus status,
        Guid? authSessionId)
    {
        Status = status;
        AuthSessionId = authSessionId;
    }

    public bool Succeeded => Status is AuthSessionRevocationStatus.Revoked;

    public AuthSessionRevocationStatus Status { get; }

    public Guid? AuthSessionId { get; }

    public static AuthSessionRevocationResult Revoked(Guid authSessionId)
    {
        return new AuthSessionRevocationResult(AuthSessionRevocationStatus.Revoked, authSessionId);
    }

    public static AuthSessionRevocationResult Failure(
        AuthSessionRevocationStatus status,
        Guid? authSessionId = null)
    {
        return new AuthSessionRevocationResult(status, authSessionId);
    }

    public override string ToString()
    {
        return $"AuthSessionRevocationResult {{ Succeeded = {Succeeded}, Status = {Status}, AuthSessionId = {AuthSessionId?.ToString() ?? "None"} }}";
    }
}
