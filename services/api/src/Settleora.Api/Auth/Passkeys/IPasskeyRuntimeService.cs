using Settleora.Api.Auth.Authorization;

namespace Settleora.Api.Auth.Passkeys;

internal interface IPasskeyRuntimeService
{
    Task<PasskeyEnrollmentOptionsServiceResult> CreateEnrollmentOptionsAsync(
        AuthenticatedActor actor,
        PasskeyEnrollmentOptionsRequest request,
        CancellationToken cancellationToken);

    Task<PasskeyCredentialServiceResult> CompleteEnrollmentAsync(
        AuthenticatedActor actor,
        PasskeyEnrollmentCompleteRequest request,
        CancellationToken cancellationToken);

    Task<PasskeyCredentialListResponse> ListCredentialsAsync(
        AuthenticatedActor actor,
        CancellationToken cancellationToken);

    Task<PasskeyCredentialServiceResult> UpdateCredentialAsync(
        AuthenticatedActor actor,
        Guid passkeyCredentialId,
        PasskeyCredentialUpdateRequest request,
        CancellationToken cancellationToken);

    Task<PasskeyCredentialMutationResult> RevokeCredentialAsync(
        AuthenticatedActor actor,
        Guid passkeyCredentialId,
        CancellationToken cancellationToken);

    Task<PasskeySignInOptionsServiceResult> CreateSignInOptionsAsync(
        PasskeySignInOptionsRequest request,
        CancellationToken cancellationToken);

    Task<PasskeySignInCompleteServiceResult> CompleteSignInAsync(
        PasskeySignInCompleteRequest request,
        CancellationToken cancellationToken);

    Task<PasskeyStepUpOptionsServiceResult> CreateStepUpOptionsAsync(
        AuthenticatedActor actor,
        PasskeyStepUpOptionsRequest request,
        CancellationToken cancellationToken);

    Task<PasskeyStepUpCompleteServiceResult> CompleteStepUpAsync(
        AuthenticatedActor actor,
        PasskeyStepUpCompleteRequest request,
        CancellationToken cancellationToken);
}

internal enum PasskeyServiceStatus
{
    Succeeded,
    InvalidRequest,
    Denied,
    NotFound,
    Conflict,
    VerificationFailed,
    PersistenceFailed
}

internal sealed record PasskeyEnrollmentOptionsServiceResult(
    PasskeyServiceStatus Status,
    PasskeyEnrollmentOptionsResponse? Response = null);

internal sealed record PasskeyCredentialServiceResult(
    PasskeyServiceStatus Status,
    PasskeyCredentialResponse? Response = null);

internal sealed record PasskeyCredentialMutationResult(PasskeyServiceStatus Status);

internal sealed record PasskeySignInOptionsServiceResult(
    PasskeyServiceStatus Status,
    PasskeySignInOptionsResponse? Response = null);

internal sealed record PasskeySignInCompleteServiceResult(
    PasskeyServiceStatus Status,
    PasskeySignInCompleteResponse? Response = null);

internal sealed record PasskeyStepUpOptionsServiceResult(
    PasskeyServiceStatus Status,
    PasskeyStepUpOptionsResponse? Response = null);

internal sealed record PasskeyStepUpCompleteServiceResult(
    PasskeyServiceStatus Status,
    PasskeyStepUpCompleteResponse? Response = null);
