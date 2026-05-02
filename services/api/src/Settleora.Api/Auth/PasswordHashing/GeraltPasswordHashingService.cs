using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Geralt;
using Microsoft.Extensions.Options;
using Settleora.Api.Configuration;

namespace Settleora.Api.Auth.PasswordHashing;

internal sealed class GeraltPasswordHashingService : IPasswordHashingService
{
    private const string VerifierFormat = "libsodium-argon2id-encoded";
    private const string LibraryName = "Geralt";
    private const string UnicodeNormalizationForm = "NFC";

    private static readonly JsonSerializerOptions ParameterJsonOptions = new(JsonSerializerDefaults.Web);

    private readonly PasswordHashingOptions options;

    public GeraltPasswordHashingService(IOptions<PasswordHashingOptions> options)
    {
        this.options = options.Value;
    }

    public PasswordHashResult HashPassword(string plaintextPassword)
    {
        if (!IsCurrentAlgorithmSupported())
        {
            return PasswordHashResult.Failure(PasswordHashFailureReason.UnsupportedAlgorithm);
        }

        if (!HasValidArgon2idConfiguration())
        {
            return PasswordHashResult.Failure(PasswordHashFailureReason.InvalidConfiguration);
        }

        byte[] passwordBytes = EncodePassword(plaintextPassword);
        Span<char> verifierBuffer = stackalloc char[Argon2id.HashSize];

        try
        {
            Argon2id.ComputeHash(
                verifierBuffer,
                passwordBytes,
                options.Argon2idIterations,
                options.Argon2idMemorySizeBytes);

            var verifier = new string(verifierBuffer).TrimEnd('\0');
            if (verifier.Length is 0 || verifier.Length > options.VerifierMaxLength)
            {
                return PasswordHashResult.Failure(PasswordHashFailureReason.HashingFailed);
            }

            var parametersJson = CreateParametersJson();
            if (parametersJson.Length > options.ParametersMaxLength)
            {
                return PasswordHashResult.Failure(PasswordHashFailureReason.HashingFailed);
            }

            return PasswordHashResult.Success(
                verifier,
                PasswordHashingAlgorithms.Argon2id,
                options.PolicyVersion,
                parametersJson);
        }
        catch (ArgumentOutOfRangeException)
        {
            return PasswordHashResult.Failure(PasswordHashFailureReason.InvalidConfiguration);
        }
        catch (InsufficientMemoryException)
        {
            return PasswordHashResult.Failure(PasswordHashFailureReason.HashingFailed);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(passwordBytes);
            verifierBuffer.Clear();
        }
    }

    public PasswordVerificationResult VerifyPassword(string submittedPassword, StoredPasswordHash storedHash)
    {
        if (!IsCurrentAlgorithmSupported() || !IsSupportedStoredAlgorithm(storedHash))
        {
            return PasswordVerificationResult.Failure(PasswordVerificationStatus.UnsupportedAlgorithm);
        }

        if (!HasValidArgon2idConfiguration())
        {
            return PasswordVerificationResult.Failure(PasswordVerificationStatus.InvalidConfiguration);
        }

        byte[] passwordBytes = EncodePassword(submittedPassword);

        try
        {
            var verified = Argon2id.VerifyHash(storedHash.Verifier, passwordBytes);
            if (!verified)
            {
                return PasswordVerificationResult.Failure(PasswordVerificationStatus.WrongPassword);
            }

            return PasswordVerificationResult.Verified(CheckRehashRequired(storedHash));
        }
        catch (ArgumentOutOfRangeException)
        {
            return PasswordVerificationResult.Failure(PasswordVerificationStatus.MalformedVerifier);
        }
        catch (FormatException)
        {
            return PasswordVerificationResult.Failure(PasswordVerificationStatus.MalformedVerifier);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(passwordBytes);
        }
    }

    public PasswordRehashDecision CheckRehashRequired(StoredPasswordHash storedHash)
    {
        if (!IsCurrentAlgorithmSupported() || !IsSupportedStoredAlgorithm(storedHash) || !HasValidArgon2idConfiguration())
        {
            return PasswordRehashDecision.NotRequired;
        }

        PasswordRehashReason reason = PasswordRehashReason.None;
        if (storedHash.RequiresRehash)
        {
            reason |= PasswordRehashReason.ExplicitCredentialFlag;
        }

        if (!StringComparer.Ordinal.Equals(storedHash.AlgorithmVersion, options.PolicyVersion))
        {
            reason |= PasswordRehashReason.PolicyVersionMismatch;
        }

        try
        {
            if (Argon2id.NeedsRehash(
                    storedHash.Verifier,
                    options.Argon2idIterations,
                    options.Argon2idMemorySizeBytes))
            {
                reason |= PasswordRehashReason.WorkFactorMismatch;
            }
        }
        catch (ArgumentOutOfRangeException)
        {
            reason |= PasswordRehashReason.ParameterMetadataMismatch;
        }
        catch (FormatException)
        {
            reason |= PasswordRehashReason.ParameterMetadataMismatch;
        }

        if (!HasCurrentParameterMetadata(storedHash.ParametersJson))
        {
            reason |= PasswordRehashReason.ParameterMetadataMismatch;
        }

        return PasswordRehashDecision.RequiredFor(reason);
    }

    private bool IsCurrentAlgorithmSupported()
    {
        return StringComparer.Ordinal.Equals(options.Algorithm, PasswordHashingAlgorithms.Argon2id);
    }

    private static bool IsSupportedStoredAlgorithm(StoredPasswordHash storedHash)
    {
        return StringComparer.Ordinal.Equals(storedHash.Algorithm, PasswordHashingAlgorithms.Argon2id);
    }

    private bool HasValidArgon2idConfiguration()
    {
        return options.Argon2idIterations >= Argon2id.MinIterations
            && options.Argon2idMemorySizeBytes >= Argon2id.MinMemorySize
            && options.VerifierMaxLength > 0
            && options.ParametersMaxLength > 0
            && !string.IsNullOrWhiteSpace(options.PolicyVersion);
    }

    private string CreateParametersJson()
    {
        var metadata = new PasswordHashParameterMetadata(
            VerifierFormat,
            LibraryName,
            typeof(Argon2id).Assembly.GetName().Version?.ToString() ?? "unknown",
            options.Argon2idIterations,
            options.Argon2idMemorySizeBytes,
            1,
            Argon2id.SaltSize,
            Argon2id.HashSize,
            UnicodeNormalizationForm);

        return JsonSerializer.Serialize(metadata, ParameterJsonOptions);
    }

    private bool HasCurrentParameterMetadata(string parametersJson)
    {
        try
        {
            var metadata = JsonSerializer.Deserialize<PasswordHashParameterMetadata>(
                parametersJson,
                ParameterJsonOptions);

            return metadata is not null
                && StringComparer.Ordinal.Equals(metadata.Format, VerifierFormat)
                && StringComparer.Ordinal.Equals(metadata.Library, LibraryName)
                && metadata.Iterations == options.Argon2idIterations
                && metadata.MemorySizeBytes == options.Argon2idMemorySizeBytes
                && metadata.Parallelism == 1
                && metadata.SaltLengthBytes == Argon2id.SaltSize
                && metadata.EncodedVerifierMaxLength == Argon2id.HashSize
                && StringComparer.Ordinal.Equals(metadata.UnicodeNormalization, UnicodeNormalizationForm);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static byte[] EncodePassword(string password)
    {
        return Encoding.UTF8.GetBytes(password.Normalize(NormalizationForm.FormC));
    }
}
