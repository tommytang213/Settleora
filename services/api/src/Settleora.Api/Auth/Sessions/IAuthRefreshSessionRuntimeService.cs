namespace Settleora.Api.Auth.Sessions;

internal interface IAuthRefreshSessionRuntimeService
{
    Task<AuthRefreshSessionCreationResult> CreateRefreshSessionAsync(
        AuthRefreshSessionCreationRequest request,
        CancellationToken cancellationToken = default);

    Task<AuthRefreshSessionRotationResult> RotateRefreshCredentialAsync(
        AuthRefreshSessionRotationRequest request,
        CancellationToken cancellationToken = default);
}
