namespace Settleora.Api.Auth.Sessions;

internal interface IAuthSessionRuntimeService
{
    Task<AuthSessionCreationResult> CreateSessionAsync(
        AuthSessionCreationRequest request,
        CancellationToken cancellationToken = default);

    Task<AuthSessionValidationResult> ValidateSessionAsync(
        string? rawSessionToken,
        CancellationToken cancellationToken = default);

    Task<AuthSessionRevocationResult> RevokeSessionAsync(
        AuthSessionRevocationRequest request,
        CancellationToken cancellationToken = default);
}
