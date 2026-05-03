namespace Settleora.Api.Auth.Sessions;

internal sealed class AuthAccountSessionRevocationResult
{
    private AuthAccountSessionRevocationResult(AuthAccountSessionRevocationStatus status)
    {
        Status = status;
    }

    public bool Succeeded => Status is AuthAccountSessionRevocationStatus.Revoked;

    public AuthAccountSessionRevocationStatus Status { get; }

    public static AuthAccountSessionRevocationResult Revoked()
    {
        return new AuthAccountSessionRevocationResult(AuthAccountSessionRevocationStatus.Revoked);
    }

    public static AuthAccountSessionRevocationResult Failure(AuthAccountSessionRevocationStatus status)
    {
        return new AuthAccountSessionRevocationResult(status);
    }

    public override string ToString()
    {
        return $"AuthAccountSessionRevocationResult {{ Succeeded = {Succeeded}, Status = {Status} }}";
    }
}
