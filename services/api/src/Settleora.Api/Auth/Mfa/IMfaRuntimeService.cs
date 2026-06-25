using Settleora.Api.Auth.Authorization;

namespace Settleora.Api.Auth.Mfa;

internal interface IMfaRuntimeService
{
    Task<TotpEnrollmentStartServiceResult> StartTotpEnrollmentAsync(
        AuthenticatedActor actor,
        TotpEnrollmentStartRequest request,
        CancellationToken cancellationToken);

    Task<MfaFactorServiceResult> VerifyTotpEnrollmentAsync(
        AuthenticatedActor actor,
        Guid totpEnrollmentId,
        TotpEnrollmentVerifyRequest request,
        CancellationToken cancellationToken);

    Task<MfaMutationResult> CancelTotpEnrollmentAsync(
        AuthenticatedActor actor,
        Guid totpEnrollmentId,
        CancellationToken cancellationToken);

    Task<MfaFactorListResponse> ListFactorsAsync(
        AuthenticatedActor actor,
        CancellationToken cancellationToken);

    Task<MfaFactorServiceResult> UpdateFactorAsync(
        AuthenticatedActor actor,
        Guid mfaFactorId,
        MfaFactorUpdateRequest request,
        CancellationToken cancellationToken);

    Task<MfaMutationResult> RevokeFactorAsync(
        AuthenticatedActor actor,
        Guid mfaFactorId,
        CancellationToken cancellationToken);

    Task<MfaChallengeServiceResult> CreateChallengeAsync(
        AuthenticatedActor? actor,
        MfaChallengeCreateRequest request,
        CancellationToken cancellationToken);

    Task<MfaChallengeVerifyServiceResult> VerifyTotpChallengeAsync(
        AuthenticatedActor? actor,
        Guid mfaChallengeId,
        MfaTotpVerifyRequest request,
        CancellationToken cancellationToken);

    Task<MfaChallengeVerifyServiceResult> VerifyRecoveryCodeChallengeAsync(
        AuthenticatedActor? actor,
        Guid mfaChallengeId,
        MfaRecoveryCodeVerifyRequest request,
        CancellationToken cancellationToken);

    Task<RecoveryCodeBatchGenerateServiceResult> GenerateRecoveryCodesAsync(
        AuthenticatedActor actor,
        RecoveryCodeBatchGenerateRequest request,
        CancellationToken cancellationToken);

    Task<RecoveryCodeBatchListResponse> ListRecoveryCodeBatchesAsync(
        AuthenticatedActor actor,
        CancellationToken cancellationToken);

    Task<MfaMutationResult> RevokeRecoveryCodeBatchAsync(
        AuthenticatedActor actor,
        Guid recoveryCodeBatchId,
        CancellationToken cancellationToken);
}

internal enum MfaServiceStatus
{
    Succeeded,
    InvalidRequest,
    Denied,
    NotFound,
    Conflict,
    VerificationFailed,
    PersistenceFailed
}

internal sealed record TotpEnrollmentStartServiceResult(
    MfaServiceStatus Status,
    TotpEnrollmentStartResponse? Response = null);

internal sealed record MfaFactorServiceResult(
    MfaServiceStatus Status,
    MfaFactorResponse? Response = null);

internal sealed record MfaMutationResult(MfaServiceStatus Status);

internal sealed record MfaChallengeServiceResult(
    MfaServiceStatus Status,
    MfaChallengeResponse? Response = null);

internal sealed record MfaChallengeVerifyServiceResult(
    MfaServiceStatus Status,
    MfaChallengeVerifyResponse? Response = null);

internal sealed record RecoveryCodeBatchGenerateServiceResult(
    MfaServiceStatus Status,
    RecoveryCodeBatchGenerateResponse? Response = null);
