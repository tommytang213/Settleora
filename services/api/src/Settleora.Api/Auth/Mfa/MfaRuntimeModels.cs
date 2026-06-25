using Settleora.Api.Auth.CurrentUser;

namespace Settleora.Api.Auth.Mfa;

internal sealed record MfaPolicyReadout(
    string? PolicyVersion,
    string PasskeySupportMode,
    string TotpSupportMode,
    string RecoveryCodeSupportMode,
    string EnforcementMode,
    string AccountCompliance,
    bool RequiresEnrollment,
    bool RequiresFreshStepUp,
    bool RecoveryCodesLow,
    bool ServerAuthoritative);

internal sealed record TotpEnrollmentStartRequest(string? DisplayLabel);

internal sealed record TotpEnrollmentSetup(
    string Issuer,
    string AccountLabel,
    string Algorithm,
    int Digits,
    int PeriodSeconds,
    string? ProvisioningUri,
    string? ManualEntryKey);

internal sealed record TotpEnrollmentStartResponse(
    Guid TotpEnrollmentId,
    TotpEnrollmentSetup Setup,
    MfaFactorSummary Factor,
    DateTimeOffset ExpiresAtUtc,
    MfaPolicyReadout Policy);

internal sealed record TotpEnrollmentVerifyRequest(string Code);

internal sealed record TotpEnrollmentResponse(
    MfaFactorSummary Factor,
    MfaPolicyReadout Policy);

internal sealed record MfaFactorListResponse(
    IReadOnlyList<MfaFactorSummary> Factors,
    MfaPolicyReadout Policy);

internal sealed record MfaFactorResponse(
    MfaFactorSummary Factor,
    MfaPolicyReadout Policy);

internal sealed record MfaFactorSummary(
    Guid Id,
    string FactorType,
    string Status,
    string? DisplayLabel,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? VerifiedAtUtc,
    DateTimeOffset? LastUsedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? DisabledAtUtc,
    DateTimeOffset? RevokedAtUtc,
    DateTimeOffset? ExpiresAtUtc,
    string? PolicyVersion,
    TotpFactorMetadata? Totp);

internal sealed record TotpFactorMetadata(
    string Issuer,
    string AccountLabel,
    string Algorithm,
    int Digits,
    int PeriodSeconds);

internal sealed record MfaFactorUpdateRequest(string? DisplayLabel);

internal sealed record MfaChallengeCreateRequest(
    string? Purpose,
    string? PreferredFactorType,
    Guid? PendingAuthFlowId,
    string? OperationCategory);

internal sealed record MfaChallengeResponse(
    Guid MfaChallengeId,
    string Purpose,
    string Status,
    IReadOnlyList<string> AllowedFactorTypes,
    IReadOnlyList<MfaChallengeFactorChoice> FactorChoices,
    DateTimeOffset ExpiresAtUtc,
    int? RemainingAttempts,
    string? OperationCategory,
    MfaPolicyReadout Policy);

internal sealed record MfaChallengeFactorChoice(
    string FactorType,
    Guid? MfaFactorId,
    string? DisplayLabel,
    string? MaskedDisplay);

internal sealed record MfaTotpVerifyRequest(string Code);

internal sealed record MfaRecoveryCodeVerifyRequest(string RecoveryCode);

internal sealed record MfaChallengeVerifyResponse(
    string Status,
    Guid MfaChallengeId,
    DateTimeOffset VerifiedAtUtc,
    DateTimeOffset? FreshUntilUtc,
    CurrentUserResponse? CurrentUser,
    RecoveryCodeBatchSummary? RecoveryCodeBatch);

internal sealed record RecoveryCodeBatchGenerateRequest(
    string? ReasonCategory,
    bool? ReplaceExisting);

internal sealed record RecoveryCodeBatchGenerateResponse(
    RecoveryCodeBatchSummary Batch,
    IReadOnlyList<string> RecoveryCodes,
    bool DisplayOnce,
    MfaPolicyReadout Policy);

internal sealed record RecoveryCodeBatchListResponse(
    IReadOnlyList<RecoveryCodeBatchSummary> Batches,
    MfaPolicyReadout Policy);

internal sealed record RecoveryCodeBatchResponse(
    RecoveryCodeBatchSummary Batch,
    MfaPolicyReadout Policy);

internal sealed record RecoveryCodeBatchSummary(
    Guid Id,
    string Status,
    int TotalGenerated,
    int RemainingUnused,
    int UsedCount,
    bool DisplayedOnce,
    DateTimeOffset GeneratedAtUtc,
    DateTimeOffset? LastUsedAtUtc,
    DateTimeOffset? ReplacedAtUtc,
    DateTimeOffset? RevokedAtUtc,
    DateTimeOffset? ExpiresAtUtc,
    string? PolicyVersion);
