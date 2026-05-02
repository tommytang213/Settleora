using System.Text.Json;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.PasswordHashing;
using Settleora.Api.Configuration;

namespace Settleora.Api.Tests;

public sealed class PasswordHashingServiceTests
{
    private const string CurrentPolicyVersion = "argon2id-test-v2";
    private const int CurrentMemorySizeBytes = 16_384;
    private const int FastMemorySizeBytes = 8_192;
    private const int Iterations = 1;

    [Fact]
    public void HashPasswordCreatesVerifierAndMetadataWithinCredentialColumnLimits()
    {
        var service = CreateService();

        var result = service.HashPassword("correct horse battery staple");

        Assert.True(result.Succeeded);
        Assert.NotEmpty(result.Verifier);
        Assert.Equal(PasswordHashingAlgorithms.Argon2id, result.Algorithm);
        Assert.Equal(CurrentPolicyVersion, result.AlgorithmVersion);
        Assert.NotEmpty(result.ParametersJson);
        Assert.True(result.Verifier.Length <= 512);
        Assert.True(result.ParametersJson.Length <= 1024);
        Assert.DoesNotContain(result.Verifier, result.ToString());

        using var parameters = JsonDocument.Parse(result.ParametersJson);
        var root = parameters.RootElement;
        Assert.Equal("libsodium-argon2id-encoded", root.GetProperty("format").GetString());
        Assert.Equal("Geralt", root.GetProperty("library").GetString());
        Assert.Equal(Iterations, root.GetProperty("iterations").GetInt32());
        Assert.Equal(CurrentMemorySizeBytes, root.GetProperty("memorySizeBytes").GetInt32());
        Assert.Equal(1, root.GetProperty("parallelism").GetInt32());
    }

    [Fact]
    public void VerifyPasswordSucceedsForCorrectPassword()
    {
        const string password = "this is the submitted password";
        var service = CreateService();
        var hash = AssertHashCreated(service.HashPassword(password));

        var result = service.VerifyPassword(password, hash.ToStoredHash());

        Assert.True(result.Succeeded);
        Assert.Equal(PasswordVerificationStatus.Verified, result.Status);
    }

    [Fact]
    public void VerifyPasswordFailsSafelyForWrongPassword()
    {
        var service = CreateService();
        var hash = AssertHashCreated(service.HashPassword("expected password"));

        var result = service.VerifyPassword("wrong password", hash.ToStoredHash());

        Assert.False(result.Succeeded);
        Assert.Equal(PasswordVerificationStatus.WrongPassword, result.Status);
        Assert.False(result.RequiresRehash);
    }

    [Fact]
    public void VerifyPasswordFailsSafelyForMalformedVerifier()
    {
        var service = CreateService();
        var storedHash = new StoredPasswordHash(
            "not-a-geralt-verifier",
            PasswordHashingAlgorithms.Argon2id,
            CurrentPolicyVersion,
            "{}");

        var result = service.VerifyPassword("submitted password", storedHash);

        Assert.False(result.Succeeded);
        Assert.Equal(PasswordVerificationStatus.MalformedVerifier, result.Status);
        Assert.False(result.RequiresRehash);
    }

    [Fact]
    public void CurrentPolicyVerifierDoesNotRequireRehash()
    {
        const string password = "current policy password";
        var service = CreateService();
        var hash = AssertHashCreated(service.HashPassword(password));

        var result = service.VerifyPassword(password, hash.ToStoredHash());
        var decision = service.CheckRehashRequired(hash.ToStoredHash());

        Assert.True(result.Succeeded);
        Assert.False(result.RequiresRehash);
        Assert.False(decision.Required);
        Assert.Equal(PasswordRehashReason.None, result.RehashDecision.Reason);
    }

    [Fact]
    public void OlderPolicyVersionRequiresRehashAfterSuccessfulVerification()
    {
        const string password = "older policy password";
        var oldPolicyService = CreateService(policyVersion: "argon2id-test-v1");
        var currentPolicyService = CreateService(policyVersion: CurrentPolicyVersion);
        var hash = AssertHashCreated(oldPolicyService.HashPassword(password));

        var result = currentPolicyService.VerifyPassword(password, hash.ToStoredHash());

        Assert.True(result.Succeeded);
        Assert.True(result.RequiresRehash);
        Assert.True(result.RehashDecision.Reason.HasFlag(PasswordRehashReason.PolicyVersionMismatch));
    }

    [Fact]
    public void OlderWorkFactorRequiresRehashAfterSuccessfulVerification()
    {
        const string password = "older work factor password";
        var oldPolicyService = CreateService(memorySizeBytes: FastMemorySizeBytes);
        var currentPolicyService = CreateService(memorySizeBytes: CurrentMemorySizeBytes);
        var hash = AssertHashCreated(oldPolicyService.HashPassword(password));

        var result = currentPolicyService.VerifyPassword(password, hash.ToStoredHash());

        Assert.True(result.Succeeded);
        Assert.True(result.RequiresRehash);
        Assert.True(result.RehashDecision.Reason.HasFlag(PasswordRehashReason.WorkFactorMismatch));
        Assert.True(result.RehashDecision.Reason.HasFlag(PasswordRehashReason.ParameterMetadataMismatch));
    }

    [Fact]
    public void ExplicitCredentialFlagRequiresRehashAfterSuccessfulVerification()
    {
        const string password = "flagged credential password";
        var service = CreateService();
        var hash = AssertHashCreated(service.HashPassword(password));

        var result = service.VerifyPassword(password, hash.ToStoredHash(requiresRehash: true));

        Assert.True(result.Succeeded);
        Assert.True(result.RequiresRehash);
        Assert.True(result.RehashDecision.Reason.HasFlag(PasswordRehashReason.ExplicitCredentialFlag));
    }

    [Fact]
    public void UnsupportedStoredAlgorithmReturnsSafeUnsupportedResult()
    {
        var service = CreateService();
        var storedHash = new StoredPasswordHash(
            "pbkdf2-verifier-placeholder",
            PasswordHashingAlgorithms.Pbkdf2HmacSha256,
            "pbkdf2-v1",
            "{}");

        var result = service.VerifyPassword("submitted password", storedHash);

        Assert.False(result.Succeeded);
        Assert.Equal(PasswordVerificationStatus.UnsupportedAlgorithm, result.Status);
        Assert.False(result.RequiresRehash);
    }

    [Fact]
    public void Pbkdf2ConfigurationIsRejectedWithoutDowngradingFromArgon2id()
    {
        var service = CreateService(algorithm: PasswordHashingAlgorithms.Pbkdf2HmacSha256);

        var result = service.HashPassword("password for explicit fips mode");

        Assert.False(result.Succeeded);
        Assert.Equal(PasswordHashFailureReason.UnsupportedAlgorithm, result.FailureReason);
        Assert.Empty(result.Verifier);
    }

    [Fact]
    public void FailureResultsDoNotExposePasswordMaterialOrVerifierStrings()
    {
        const string plaintextPassword = "visible-test-password-material";
        var service = CreateService();
        var hash = AssertHashCreated(service.HashPassword(plaintextPassword));
        var malformedResult = service.VerifyPassword(
            plaintextPassword,
            new StoredPasswordHash(
                "not-a-geralt-verifier",
                PasswordHashingAlgorithms.Argon2id,
                CurrentPolicyVersion,
                "{}"));
        var unsupportedResult = CreateService(algorithm: PasswordHashingAlgorithms.Pbkdf2HmacSha256)
            .HashPassword(plaintextPassword);

        Assert.DoesNotContain(plaintextPassword, malformedResult.ToString());
        Assert.DoesNotContain(plaintextPassword, unsupportedResult.ToString());
        Assert.DoesNotContain(hash.Verifier, hash.ToString());
        Assert.DoesNotContain(hash.Verifier, hash.ToStoredHash().ToString());
    }

    private static GeraltPasswordHashingService CreateService(
        string algorithm = PasswordHashingAlgorithms.Argon2id,
        string policyVersion = CurrentPolicyVersion,
        int memorySizeBytes = CurrentMemorySizeBytes)
    {
        return new GeraltPasswordHashingService(Options.Create(new PasswordHashingOptions
        {
            Algorithm = algorithm,
            PolicyVersion = policyVersion,
            Argon2idIterations = Iterations,
            Argon2idMemorySizeBytes = memorySizeBytes,
            VerifierMaxLength = 512,
            ParametersMaxLength = 1024
        }));
    }

    private static PasswordHashResult AssertHashCreated(PasswordHashResult result)
    {
        Assert.True(result.Succeeded);
        return result;
    }
}
