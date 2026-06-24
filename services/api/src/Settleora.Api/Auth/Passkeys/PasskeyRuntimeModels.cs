using System.Text.Json;
using Settleora.Api.Auth.CurrentUser;

namespace Settleora.Api.Auth.Passkeys;

internal sealed record PasskeyPolicyReadoutResponse(PasskeyPolicyReadout Policy);

internal sealed record PasskeyPolicyReadout(
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

internal sealed record PasskeyCredentialSummary(
    Guid Id,
    string? DisplayLabel,
    string Status,
    bool BackupEligible,
    bool BackupState,
    IReadOnlyList<string> TransportHints,
    string? AttestationPolicyResult,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? EnrolledAtUtc,
    DateTimeOffset? LastUsedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? DisabledAtUtc,
    DateTimeOffset? RevokedAtUtc);

internal sealed record PasskeyCredentialResponse(
    PasskeyCredentialSummary Passkey,
    PasskeyPolicyReadout Policy);

internal sealed record PasskeyCredentialListResponse(
    IReadOnlyList<PasskeyCredentialSummary> Passkeys,
    PasskeyPolicyReadout Policy);

internal sealed record PasskeyEnrollmentOptionsRequest(
    string? DisplayLabel,
    string? AttestationPreference);

internal sealed record PasskeyEnrollmentCompleteRequest(
    Guid PasskeyChallengeId,
    JsonElement Credential,
    string? DisplayLabel);

internal sealed record PasskeyCredentialUpdateRequest(string? DisplayLabel);

internal sealed record PasskeySignInOptionsRequest(
    string? IdentifierHint,
    string? UserVerification);

internal sealed record PasskeySignInCompleteRequest(
    Guid PasskeyChallengeId,
    JsonElement Credential,
    string? DeviceLabel);

internal sealed record PasskeyStepUpOptionsRequest(string OperationCategory);

internal sealed record PasskeyStepUpCompleteRequest(
    Guid PasskeyChallengeId,
    JsonElement Credential);

internal sealed record PasskeyEnrollmentOptionsResponse(
    Guid PasskeyChallengeId,
    object PublicKeyCredentialCreationOptions,
    DateTimeOffset ExpiresAtUtc,
    PasskeyPolicyReadout Policy);

internal sealed record PasskeySignInOptionsResponse(
    Guid PasskeyChallengeId,
    object PublicKeyCredentialRequestOptions,
    DateTimeOffset ExpiresAtUtc);

internal sealed record PasskeySignInCompleteResponse(
    string Status,
    CurrentUserResponse? CurrentUser,
    object? MfaChallenge);

internal sealed record PasskeyStepUpOptionsResponse(
    Guid PasskeyChallengeId,
    string OperationCategory,
    object PublicKeyCredentialRequestOptions,
    DateTimeOffset ExpiresAtUtc,
    PasskeyPolicyReadout Policy);

internal sealed record PasskeyStepUpCompleteResponse(
    string Status,
    string OperationCategory,
    DateTimeOffset SatisfiedAtUtc,
    DateTimeOffset FreshUntilUtc,
    string? PolicyVersion);
