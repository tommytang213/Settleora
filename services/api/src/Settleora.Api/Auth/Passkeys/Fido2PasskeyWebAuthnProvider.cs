using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Fido2NetLib;
using Fido2NetLib.Objects;
using Fido2NetLib.Serialization;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;
using Settleora.Api.Domain.Auth;

namespace Settleora.Api.Auth.Passkeys;

internal sealed class Fido2PasskeyWebAuthnProvider : IPasskeyWebAuthnProvider
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly Fido2 fido2;
    private readonly PasskeyWebAuthnOptions options;

    public Fido2PasskeyWebAuthnProvider(IOptions<PasskeyWebAuthnOptions> options)
    {
        this.options = options.Value;
        var configuration = new Fido2Configuration
        {
            ServerDomain = this.options.RelyingPartyId,
            ServerName = this.options.RelyingPartyName,
            Origins = new HashSet<string>(this.options.AllowedOrigins, StringComparer.OrdinalIgnoreCase),
            Timeout = (uint)Math.Clamp(this.options.ChallengeExpirySeconds * 1000, 30_000, 600_000)
        };
        fido2 = new Fido2(configuration, metadataService: null!);
    }

    public PasskeyCreationOptionsResult CreateCredentialOptions(PasskeyCreationOptionsRequest request)
    {
        var creationOptions = fido2.RequestNewCredential(new RequestNewCredentialParams
        {
            User = CreateFidoUser(request.AuthAccountId, request.UserProfileId, request.DisplayName),
            ExcludeCredentials = request.ExistingCredentials
                .Select(ToCredentialDescriptor)
                .Where(descriptor => descriptor is not null)
                .Cast<PublicKeyCredentialDescriptor>()
                .ToArray(),
            AuthenticatorSelection = new AuthenticatorSelection
            {
                ResidentKey = ResidentKeyRequirement.Preferred,
                UserVerification = UserVerificationRequirement.Preferred
            },
            AttestationPreference = MapAttestationPreference(request.AttestationPreference)
        });

        return new PasskeyCreationOptionsResult(
            JsonSerializer.SerializeToElement(
                creationOptions,
                FidoModelSerializerContext.Default.CredentialCreateOptions),
            creationOptions.Challenge);
    }

    public PasskeyAssertionOptionsResult CreateAssertionOptions(PasskeyAssertionOptionsRequest request)
    {
        var assertionOptions = fido2.GetAssertionOptions(new GetAssertionOptionsParams
        {
            AllowedCredentials = request.AllowedCredentials
                .Select(ToCredentialDescriptor)
                .Where(descriptor => descriptor is not null)
                .Cast<PublicKeyCredentialDescriptor>()
                .ToArray(),
            UserVerification = MapUserVerification(request.UserVerification)
        });

        return new PasskeyAssertionOptionsResult(
            JsonSerializer.SerializeToElement(
                assertionOptions,
                FidoModelSerializerContext.Default.AssertionOptions),
            assertionOptions.Challenge);
    }

    public async Task<PasskeyCredentialVerificationResult> VerifyCredentialAsync(
        PasskeyCredentialVerificationRequest request,
        CancellationToken cancellationToken)
    {
        var rawResponse = request.Credential.Deserialize<AuthenticatorAttestationRawResponse>(
            FidoModelSerializerContext.Default.Options)
            ?? throw new InvalidOperationException("Invalid passkey credential response.");

        var originalOptions = new CredentialCreateOptions
        {
            Rp = new PublicKeyCredentialRpEntity(options.RelyingPartyId, options.RelyingPartyName, null!),
            User = CreateFidoUser(
                request.OriginalRequest.AuthAccountId,
                request.OriginalRequest.UserProfileId,
                request.OriginalRequest.DisplayName),
            Challenge = request.VerifiedChallenge,
            PubKeyCredParams = PubKeyCredParam.Defaults,
            Timeout = (ulong)Math.Clamp(options.ChallengeExpirySeconds * 1000, 30_000, 600_000),
            Attestation = MapAttestationPreference(request.OriginalRequest.AttestationPreference),
            AuthenticatorSelection = new AuthenticatorSelection
            {
                ResidentKey = ResidentKeyRequirement.Preferred,
                UserVerification = UserVerificationRequirement.Preferred
            },
            ExcludeCredentials = request.ExistingCredentials
                .Select(ToCredentialDescriptor)
                .Where(descriptor => descriptor is not null)
                .Cast<PublicKeyCredentialDescriptor>()
                .ToArray()
        };

        var result = await fido2.MakeNewCredentialAsync(
            new MakeNewCredentialParams
            {
                AttestationResponse = rawResponse,
                OriginalOptions = originalOptions,
                IsCredentialIdUniqueToUserCallback = (parameters, _) =>
                    Task.FromResult(!request.ExistingCredentials.Any(credential =>
                        CryptographicOperations.FixedTimeEquals(
                            Encoding.UTF8.GetBytes(HashCredentialId(parameters.CredentialId)),
                            Encoding.UTF8.GetBytes(credential.CredentialIdHash))))
            },
            cancellationToken);

        return new PasskeyCredentialVerificationResult(
            result.Id,
            result.PublicKey,
            result.SignCount,
            result.IsBackupEligible,
            result.IsBackedUp,
            result.Transports?.Select(transport => transport.ToString()).ToArray() ?? [],
            string.IsNullOrWhiteSpace(result.AttestationFormat) ? "none" : result.AttestationFormat);
    }

    public async Task<PasskeyAssertionVerificationResult> VerifyAssertionAsync(
        PasskeyAssertionVerificationRequest request,
        CancellationToken cancellationToken)
    {
        var rawResponse = request.Credential.Deserialize(
            FidoModelSerializerContext.Default.AuthenticatorAssertionRawResponse)
            ?? throw new InvalidOperationException("Invalid passkey assertion response.");

        var assertionOptions = new AssertionOptions
        {
            Challenge = request.VerifiedChallenge,
            RpId = options.RelyingPartyId,
            Timeout = (ulong)Math.Clamp(options.ChallengeExpirySeconds * 1000, 30_000, 600_000),
            AllowCredentials = request.AllowedCredentials
                .Select(ToCredentialDescriptor)
                .Where(descriptor => descriptor is not null)
                .Cast<PublicKeyCredentialDescriptor>()
                .ToArray(),
            UserVerification = MapUserVerification(request.UserVerification)
        };

        var result = await fido2.MakeAssertionAsync(
            new MakeAssertionParams
            {
                AssertionResponse = rawResponse,
                OriginalOptions = assertionOptions,
                StoredPublicKey = WebEncoders.Base64UrlDecode(request.StoredCredential.PublicKeyCose),
                StoredSignatureCounter = checked((uint)Math.Max(0, request.StoredCredential.SignatureCounter ?? 0)),
                IsUserHandleOwnerOfCredentialIdCallback = (parameters, _) =>
                {
                    var expectedUserHandle = Encoding.UTF8.GetBytes(HashUserHandle(request.StoredCredential.AuthAccountId));
                    return Task.FromResult(CryptographicOperations.FixedTimeEquals(
                        expectedUserHandle,
                        Encoding.UTF8.GetBytes("sha256:" + Convert.ToHexString(HashBytes(parameters.UserHandle ?? [])).ToLowerInvariant())));
                }
            },
            cancellationToken);

        return new PasskeyAssertionVerificationResult(result.SignCount, result.IsBackedUp);
    }

    public bool TryExtractChallenge(JsonElement credential, out byte[] challenge)
    {
        challenge = [];
        if (!TryGetNestedString(credential, "response", "clientDataJSON", out var encodedClientData)
            && !TryGetNestedString(credential, "response", "clientDataJson", out encodedClientData))
        {
            return false;
        }

        try
        {
            var clientDataJson = WebEncoders.Base64UrlDecode(encodedClientData);
            using var document = JsonDocument.Parse(clientDataJson);
            if (!document.RootElement.TryGetProperty("challenge", out var challengeElement)
                || challengeElement.ValueKind != JsonValueKind.String)
            {
                return false;
            }

            challenge = WebEncoders.Base64UrlDecode(challengeElement.GetString() ?? string.Empty);
            return challenge.Length > 0;
        }
        catch (Exception exception) when (exception is FormatException or JsonException or ArgumentException)
        {
            return false;
        }
    }

    public bool TryExtractCredentialId(JsonElement credential, out byte[] credentialId)
    {
        credentialId = [];
        if (!TryGetString(credential, "rawId", out var rawId)
            && !TryGetString(credential, "id", out rawId))
        {
            return false;
        }

        try
        {
            credentialId = WebEncoders.Base64UrlDecode(rawId);
            return credentialId.Length > 0;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    internal static string HashCredentialId(byte[] credentialId)
    {
        return "sha256:" + Convert.ToHexString(SHA256.HashData(credentialId)).ToLowerInvariant();
    }

    internal static string HashChallenge(byte[] challenge)
    {
        return "sha256:" + Convert.ToHexString(SHA256.HashData(challenge)).ToLowerInvariant();
    }

    internal static string HashUserHandle(Guid authAccountId)
    {
        return "sha256:" + Convert.ToHexString(HashUserHandleBytes(authAccountId)).ToLowerInvariant();
    }

    private static byte[] HashUserHandleBytes(Guid authAccountId)
    {
        return SHA256.HashData(authAccountId.ToByteArray());
    }

    private static byte[] HashBytes(byte[] value)
    {
        return SHA256.HashData(value);
    }

    private static Fido2User CreateFidoUser(Guid authAccountId, Guid userProfileId, string displayName)
    {
        return new Fido2User
        {
            Id = authAccountId.ToByteArray(),
            Name = userProfileId.ToString("D"),
            DisplayName = string.IsNullOrWhiteSpace(displayName) ? "Settleora user" : displayName
        };
    }

    private static PublicKeyCredentialDescriptor? ToCredentialDescriptor(AuthPasskeyCredential credential)
    {
        if (!TryDecodeStoredCredentialId(credential.CredentialIdHash, out var credentialId))
        {
            return null;
        }

        return new PublicKeyCredentialDescriptor(credentialId);
    }

    private static bool TryDecodeStoredCredentialId(string credentialIdHash, out byte[] credentialId)
    {
        credentialId = [];
        return false;
    }

    private static AttestationConveyancePreference MapAttestationPreference(string? value)
    {
        return value?.Trim().ToLowerInvariant() switch
        {
            "indirect" => AttestationConveyancePreference.Indirect,
            "direct" => AttestationConveyancePreference.Direct,
            "enterprise" => AttestationConveyancePreference.Enterprise,
            _ => AttestationConveyancePreference.None
        };
    }

    private static UserVerificationRequirement? MapUserVerification(string? value)
    {
        return value?.Trim().ToLowerInvariant() switch
        {
            "required" => UserVerificationRequirement.Required,
            "discouraged" => UserVerificationRequirement.Discouraged,
            "preferred" => UserVerificationRequirement.Preferred,
            _ => UserVerificationRequirement.Preferred
        };
    }

    private static bool TryGetNestedString(
        JsonElement element,
        string parentPropertyName,
        string childPropertyName,
        out string value)
    {
        value = string.Empty;
        return element.TryGetProperty(parentPropertyName, out var parent)
            && TryGetString(parent, childPropertyName, out value);
    }

    private static bool TryGetString(JsonElement element, string propertyName, out string value)
    {
        value = string.Empty;
        if (!element.TryGetProperty(propertyName, out var property)
            || property.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = property.GetString() ?? string.Empty;
        return !string.IsNullOrWhiteSpace(value);
    }
}
