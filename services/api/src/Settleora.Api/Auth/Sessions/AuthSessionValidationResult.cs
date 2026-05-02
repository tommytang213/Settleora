namespace Settleora.Api.Auth.Sessions;

internal sealed class AuthSessionValidationResult
{
    private AuthSessionValidationResult(
        AuthSessionValidationStatus status,
        AuthenticatedSessionActor? actor)
    {
        Status = status;
        Actor = actor;
    }

    public bool Succeeded => Status is AuthSessionValidationStatus.Validated;

    public AuthSessionValidationStatus Status { get; }

    public AuthenticatedSessionActor? Actor { get; }

    public static AuthSessionValidationResult Validated(AuthenticatedSessionActor actor)
    {
        return new AuthSessionValidationResult(AuthSessionValidationStatus.Validated, actor);
    }

    public static AuthSessionValidationResult Failure(AuthSessionValidationStatus status)
    {
        return new AuthSessionValidationResult(status, null);
    }

    public override string ToString()
    {
        return $"AuthSessionValidationResult {{ Succeeded = {Succeeded}, Status = {Status}, Actor = {(Actor is null ? "None" : "Resolved")} }}";
    }
}
