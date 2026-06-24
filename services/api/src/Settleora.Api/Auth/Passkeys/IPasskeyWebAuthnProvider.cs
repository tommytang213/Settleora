using System.Text.Json;
using Settleora.Api.Domain.Auth;

namespace Settleora.Api.Auth.Passkeys;

internal interface IPasskeyWebAuthnProvider
{
    PasskeyCreationOptionsResult CreateCredentialOptions(PasskeyCreationOptionsRequest request);

    PasskeyAssertionOptionsResult CreateAssertionOptions(PasskeyAssertionOptionsRequest request);

    Task<PasskeyCredentialVerificationResult> VerifyCredentialAsync(
        PasskeyCredentialVerificationRequest request,
        CancellationToken cancellationToken);

    Task<PasskeyAssertionVerificationResult> VerifyAssertionAsync(
        PasskeyAssertionVerificationRequest request,
        CancellationToken cancellationToken);

    bool TryExtractChallenge(JsonElement credential, out byte[] challenge);

    bool TryExtractCredentialId(JsonElement credential, out byte[] credentialId);
}

internal sealed record PasskeyCreationOptionsRequest(
    Guid AuthAccountId,
    Guid UserProfileId,
    string DisplayName,
    string? AttestationPreference,
    IReadOnlyList<AuthPasskeyCredential> ExistingCredentials);

internal sealed record PasskeyCreationOptionsResult(
    object Options,
    byte[] Challenge);

internal sealed record PasskeyAssertionOptionsRequest(
    IReadOnlyList<AuthPasskeyCredential> AllowedCredentials,
    string? UserVerification);

internal sealed record PasskeyAssertionOptionsResult(
    object Options,
    byte[] Challenge);

internal sealed record PasskeyCredentialVerificationRequest(
    JsonElement Credential,
    byte[] VerifiedChallenge,
    PasskeyCreationOptionsRequest OriginalRequest,
    IReadOnlyList<AuthPasskeyCredential> ExistingCredentials);

internal sealed record PasskeyCredentialVerificationResult(
    byte[] CredentialId,
    byte[] PublicKeyCose,
    long SignatureCounter,
    bool BackupEligible,
    bool BackupState,
    IReadOnlyList<string> Transports,
    string AttestationPolicyResult);

internal sealed record PasskeyAssertionVerificationRequest(
    JsonElement Credential,
    byte[] VerifiedChallenge,
    AuthPasskeyCredential StoredCredential,
    IReadOnlyList<AuthPasskeyCredential> AllowedCredentials,
    string? UserVerification);

internal sealed record PasskeyAssertionVerificationResult(
    long SignatureCounter,
    bool BackupState);
