using Microsoft.EntityFrameworkCore;
using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.PasswordHashing;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class AuthCredentialWorkflowServiceTests
{
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 2, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset VerificationTimestamp = new(2026, 5, 2, 10, 15, 0, TimeSpan.Zero);

    [Fact]
    public async Task CreateLocalPasswordCredentialForExistingAccountStoresActiveVerifierMetadata()
    {
        const string plaintextPassword = "visible-create-password";
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var passwordHashingService = new FakePasswordHashingService();
        var service = CreateService(dbContext, passwordHashingService, InitialTimestamp);

        var result = await service.CreateLocalPasswordCredentialAsync(authAccountId, plaintextPassword);

        Assert.True(result.Succeeded);
        Assert.Equal(CredentialCreationStatus.Created, result.Status);
        Assert.Equal(1, passwordHashingService.HashPasswordCallCount);

        var credential = await dbContext.Set<LocalPasswordCredential>().SingleAsync();
        Assert.Equal(authAccountId, credential.AuthAccountId);
        Assert.Equal(FakePasswordHashingService.CurrentVerifier, credential.PasswordHash);
        Assert.Equal(PasswordHashingAlgorithms.Argon2id, credential.PasswordHashAlgorithm);
        Assert.Equal(FakePasswordHashingService.CurrentPolicyVersion, credential.PasswordHashAlgorithmVersion);
        Assert.Equal(FakePasswordHashingService.CurrentParametersJson, credential.PasswordHashParameters);
        Assert.Equal(LocalPasswordCredentialStatuses.Active, credential.Status);
        Assert.Equal(InitialTimestamp, credential.CreatedAtUtc);
        Assert.Equal(InitialTimestamp, credential.UpdatedAtUtc);
        Assert.Null(credential.LastVerifiedAtUtc);
        Assert.Null(credential.RevokedAtUtc);
        Assert.False(credential.RequiresRehash);
    }

    [Fact]
    public async Task CreateSecondCredentialForSameAccountIsRejectedSafely()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        await SeedCredentialAsync(dbContext, authAccountId);
        var passwordHashingService = new FakePasswordHashingService();
        var service = CreateService(dbContext, passwordHashingService, InitialTimestamp);

        var result = await service.CreateLocalPasswordCredentialAsync(authAccountId, "new password");

        Assert.False(result.Succeeded);
        Assert.Equal(CredentialCreationStatus.CredentialAlreadyExists, result.Status);
        Assert.Equal(0, passwordHashingService.HashPasswordCallCount);
        Assert.Equal(1, await dbContext.Set<LocalPasswordCredential>().CountAsync());
    }

    [Fact]
    public async Task CreateCredentialForMissingAccountIsRejectedWithoutHashing()
    {
        using var dbContext = CreateDbContext();
        var passwordHashingService = new FakePasswordHashingService();
        var service = CreateService(dbContext, passwordHashingService, InitialTimestamp);

        var result = await service.CreateLocalPasswordCredentialAsync(
            Guid.NewGuid(),
            "new password");

        Assert.False(result.Succeeded);
        Assert.Equal(CredentialCreationStatus.AccountUnavailable, result.Status);
        Assert.Equal(0, passwordHashingService.HashPasswordCallCount);
        Assert.Empty(await dbContext.Set<LocalPasswordCredential>().ToListAsync());
    }

    [Fact]
    public async Task SuccessfulVerificationUpdatesLastVerifiedTimestamp()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        await SeedCredentialAsync(dbContext, authAccountId);
        var service = CreateService(dbContext, new FakePasswordHashingService(), VerificationTimestamp);

        var result = await service.VerifyLocalPasswordAsync(
            authAccountId,
            FakePasswordHashingService.CorrectPassword);

        Assert.True(result.Succeeded);
        Assert.Equal(PasswordCredentialVerificationStatus.Verified, result.Status);
        Assert.False(result.RehashAttempted);

        var credential = await dbContext.Set<LocalPasswordCredential>().SingleAsync();
        Assert.Equal(VerificationTimestamp, credential.LastVerifiedAtUtc);
        Assert.Equal(VerificationTimestamp, credential.UpdatedAtUtc);
    }

    [Fact]
    public async Task WrongPasswordDoesNotUpdateCredentialFields()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var credentialId = await SeedCredentialAsync(dbContext, authAccountId);
        var passwordHashingService = new FakePasswordHashingService();
        var service = CreateService(dbContext, passwordHashingService, VerificationTimestamp);

        var result = await service.VerifyLocalPasswordAsync(authAccountId, "wrong password");

        Assert.False(result.Succeeded);
        Assert.Equal(PasswordCredentialVerificationStatus.WrongPassword, result.Status);

        var credential = await dbContext.Set<LocalPasswordCredential>().SingleAsync(
            credential => credential.Id == credentialId);
        Assert.Equal(FakePasswordHashingService.CurrentVerifier, credential.PasswordHash);
        Assert.Equal(FakePasswordHashingService.CurrentPolicyVersion, credential.PasswordHashAlgorithmVersion);
        Assert.Equal(FakePasswordHashingService.CurrentParametersJson, credential.PasswordHashParameters);
        Assert.Equal(InitialTimestamp, credential.UpdatedAtUtc);
        Assert.Null(credential.LastVerifiedAtUtc);
        Assert.False(credential.RequiresRehash);
    }

    [Theory]
    [InlineData(LocalPasswordCredentialStatuses.Disabled, nameof(PasswordCredentialVerificationStatus.CredentialDisabled))]
    [InlineData(LocalPasswordCredentialStatuses.Revoked, nameof(PasswordCredentialVerificationStatus.CredentialRevoked))]
    public async Task DisabledOrRevokedCredentialDoesNotVerify(string status, string expectedStatusName)
    {
        var expectedStatus = Enum.Parse<PasswordCredentialVerificationStatus>(expectedStatusName);
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        await SeedCredentialAsync(
            dbContext,
            authAccountId,
            status: status,
            revokedAtUtc: status == LocalPasswordCredentialStatuses.Revoked ? InitialTimestamp : null);
        var passwordHashingService = new FakePasswordHashingService();
        var service = CreateService(dbContext, passwordHashingService, VerificationTimestamp);

        var result = await service.VerifyLocalPasswordAsync(
            authAccountId,
            FakePasswordHashingService.CorrectPassword);

        Assert.False(result.Succeeded);
        Assert.Equal(expectedStatus, result.Status);
        Assert.Equal(0, passwordHashingService.VerifyPasswordCallCount);

        var credential = await dbContext.Set<LocalPasswordCredential>().SingleAsync();
        Assert.Null(credential.LastVerifiedAtUtc);
        Assert.Equal(InitialTimestamp, credential.UpdatedAtUtc);
    }

    [Fact]
    public async Task MalformedVerifierFailsSafelyWithoutUpdatingCredential()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        await SeedCredentialAsync(dbContext, authAccountId, verifier: FakePasswordHashingService.MalformedVerifier);
        var service = CreateService(dbContext, new FakePasswordHashingService(), VerificationTimestamp);

        var result = await service.VerifyLocalPasswordAsync(
            authAccountId,
            FakePasswordHashingService.CorrectPassword);

        Assert.False(result.Succeeded);
        Assert.Equal(PasswordCredentialVerificationStatus.MalformedCredential, result.Status);

        var credential = await dbContext.Set<LocalPasswordCredential>().SingleAsync();
        Assert.Null(credential.LastVerifiedAtUtc);
        Assert.Equal(InitialTimestamp, credential.UpdatedAtUtc);
        Assert.Equal(FakePasswordHashingService.MalformedVerifier, credential.PasswordHash);
    }

    [Fact]
    public async Task UnsupportedAlgorithmFailsSafelyWithoutUpdatingCredential()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        await SeedCredentialAsync(
            dbContext,
            authAccountId,
            algorithm: PasswordHashingAlgorithms.Pbkdf2HmacSha256);
        var service = CreateService(dbContext, new FakePasswordHashingService(), VerificationTimestamp);

        var result = await service.VerifyLocalPasswordAsync(
            authAccountId,
            FakePasswordHashingService.CorrectPassword);

        Assert.False(result.Succeeded);
        Assert.Equal(PasswordCredentialVerificationStatus.UnsupportedAlgorithm, result.Status);

        var credential = await dbContext.Set<LocalPasswordCredential>().SingleAsync();
        Assert.Null(credential.LastVerifiedAtUtc);
        Assert.Equal(InitialTimestamp, credential.UpdatedAtUtc);
        Assert.Equal(PasswordHashingAlgorithms.Pbkdf2HmacSha256, credential.PasswordHashAlgorithm);
    }

    [Fact]
    public async Task InvalidHashingConfigurationFailsSafelyWithoutUpdatingCredential()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        await SeedCredentialAsync(
            dbContext,
            authAccountId,
            verifier: FakePasswordHashingService.InvalidConfigurationVerifier);
        var service = CreateService(dbContext, new FakePasswordHashingService(), VerificationTimestamp);

        var result = await service.VerifyLocalPasswordAsync(
            authAccountId,
            FakePasswordHashingService.CorrectPassword);

        Assert.False(result.Succeeded);
        Assert.Equal(PasswordCredentialVerificationStatus.InvalidConfiguration, result.Status);

        var credential = await dbContext.Set<LocalPasswordCredential>().SingleAsync();
        Assert.Null(credential.LastVerifiedAtUtc);
        Assert.Equal(InitialTimestamp, credential.UpdatedAtUtc);
        Assert.Equal(FakePasswordHashingService.InvalidConfigurationVerifier, credential.PasswordHash);
    }

    [Fact]
    public async Task ExplicitRequiresRehashRehashesAfterSuccessfulVerificationAndClearsFlag()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        await SeedCredentialAsync(dbContext, authAccountId, requiresRehash: true);
        var passwordHashingService = new FakePasswordHashingService
        {
            NextVerifier = FakePasswordHashingService.RehashedVerifier,
            NextPolicyVersion = FakePasswordHashingService.RehashedPolicyVersion,
            NextParametersJson = FakePasswordHashingService.RehashedParametersJson
        };
        var service = CreateService(dbContext, passwordHashingService, VerificationTimestamp);

        var result = await service.VerifyLocalPasswordAsync(
            authAccountId,
            FakePasswordHashingService.CorrectPassword);

        Assert.True(result.Succeeded);
        Assert.True(result.RehashAttempted);
        Assert.True(result.Rehashed);
        Assert.Equal(1, passwordHashingService.HashPasswordCallCount);

        var credential = await dbContext.Set<LocalPasswordCredential>().SingleAsync();
        Assert.Equal(FakePasswordHashingService.RehashedVerifier, credential.PasswordHash);
        Assert.Equal(FakePasswordHashingService.RehashedPolicyVersion, credential.PasswordHashAlgorithmVersion);
        Assert.Equal(FakePasswordHashingService.RehashedParametersJson, credential.PasswordHashParameters);
        Assert.False(credential.RequiresRehash);
        Assert.Equal(VerificationTimestamp, credential.LastVerifiedAtUtc);
        Assert.Equal(VerificationTimestamp, credential.UpdatedAtUtc);
    }

    [Fact]
    public async Task RehashIsNotAttemptedAfterWrongPassword()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        await SeedCredentialAsync(dbContext, authAccountId, requiresRehash: true);
        var passwordHashingService = new FakePasswordHashingService();
        var service = CreateService(dbContext, passwordHashingService, VerificationTimestamp);

        var result = await service.VerifyLocalPasswordAsync(authAccountId, "wrong password");

        Assert.False(result.Succeeded);
        Assert.Equal(PasswordCredentialVerificationStatus.WrongPassword, result.Status);
        Assert.Equal(0, passwordHashingService.HashPasswordCallCount);

        var credential = await dbContext.Set<LocalPasswordCredential>().SingleAsync();
        Assert.True(credential.RequiresRehash);
        Assert.Equal(FakePasswordHashingService.CurrentVerifier, credential.PasswordHash);
        Assert.Null(credential.LastVerifiedAtUtc);
        Assert.Equal(InitialTimestamp, credential.UpdatedAtUtc);
    }

    [Fact]
    public async Task MissingCredentialReturnsSafeFailure()
    {
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var passwordHashingService = new FakePasswordHashingService();
        var service = CreateService(dbContext, passwordHashingService, VerificationTimestamp);

        var result = await service.VerifyLocalPasswordAsync(
            authAccountId,
            FakePasswordHashingService.CorrectPassword);

        Assert.False(result.Succeeded);
        Assert.Equal(PasswordCredentialVerificationStatus.CredentialUnavailable, result.Status);
        Assert.Equal(0, passwordHashingService.VerifyPasswordCallCount);
        Assert.Equal(0, passwordHashingService.HashPasswordCallCount);
    }

    [Fact]
    public async Task ResultStringsDoNotExposePlaintextPasswordOrVerifierStrings()
    {
        const string plaintextPassword = "visible-result-password";
        const string verifier = "visible-result-verifier";
        using var dbContext = CreateDbContext();
        var authAccountId = await SeedAuthAccountAsync(dbContext);
        var passwordHashingService = new FakePasswordHashingService
        {
            NextVerifier = verifier
        };
        var service = CreateService(dbContext, passwordHashingService, InitialTimestamp);

        var creationResult = await service.CreateLocalPasswordCredentialAsync(
            authAccountId,
            plaintextPassword);
        var verificationResult = await service.VerifyLocalPasswordAsync(
            authAccountId,
            "wrong password");

        Assert.DoesNotContain(plaintextPassword, creationResult.ToString());
        Assert.DoesNotContain(verifier, creationResult.ToString());
        Assert.DoesNotContain(plaintextPassword, verificationResult.ToString());
        Assert.DoesNotContain(verifier, verificationResult.ToString());
    }

    private static AuthCredentialWorkflowService CreateService(
        SettleoraDbContext dbContext,
        FakePasswordHashingService passwordHashingService,
        DateTimeOffset utcNow)
    {
        return new AuthCredentialWorkflowService(
            dbContext,
            passwordHashingService,
            new FakeAuthCredentialAuditWriter(),
            new FixedTimeProvider(utcNow));
    }

    private static SettleoraDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SettleoraDbContext(options);
    }

    private static async Task<Guid> SeedAuthAccountAsync(SettleoraDbContext dbContext)
    {
        var userProfileId = Guid.NewGuid();
        var authAccountId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Workflow Test User",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });

        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });

        await dbContext.SaveChangesAsync();
        return authAccountId;
    }

    private static async Task<Guid> SeedCredentialAsync(
        SettleoraDbContext dbContext,
        Guid authAccountId,
        string verifier = FakePasswordHashingService.CurrentVerifier,
        string algorithm = PasswordHashingAlgorithms.Argon2id,
        string status = LocalPasswordCredentialStatuses.Active,
        bool requiresRehash = false,
        DateTimeOffset? revokedAtUtc = null)
    {
        var credentialId = Guid.NewGuid();
        dbContext.Set<LocalPasswordCredential>().Add(new LocalPasswordCredential
        {
            Id = credentialId,
            AuthAccountId = authAccountId,
            PasswordHash = verifier,
            PasswordHashAlgorithm = algorithm,
            PasswordHashAlgorithmVersion = FakePasswordHashingService.CurrentPolicyVersion,
            PasswordHashParameters = FakePasswordHashingService.CurrentParametersJson,
            Status = status,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            LastVerifiedAtUtc = null,
            RevokedAtUtc = revokedAtUtc,
            RequiresRehash = requiresRehash
        });

        await dbContext.SaveChangesAsync();
        return credentialId;
    }

    private sealed class FakePasswordHashingService : IPasswordHashingService
    {
        public const string CorrectPassword = "correct workflow password";
        public const string CurrentVerifier = "fake-current-verifier";
        public const string CurrentPolicyVersion = "argon2id-test-v1";
        public const string CurrentParametersJson = """{"format":"fake-current"}""";
        public const string MalformedVerifier = "fake-malformed-verifier";
        public const string InvalidConfigurationVerifier = "fake-invalid-configuration-verifier";
        public const string RehashedVerifier = "fake-rehashed-verifier";
        public const string RehashedPolicyVersion = "argon2id-test-v2";
        public const string RehashedParametersJson = """{"format":"fake-rehashed"}""";

        public string NextVerifier { get; init; } = CurrentVerifier;

        public string NextPolicyVersion { get; init; } = CurrentPolicyVersion;

        public string NextParametersJson { get; init; } = CurrentParametersJson;

        public int HashPasswordCallCount { get; private set; }

        public int VerifyPasswordCallCount { get; private set; }

        public PasswordHashResult HashPassword(string plaintextPassword)
        {
            HashPasswordCallCount++;
            return PasswordHashResult.Success(
                NextVerifier,
                PasswordHashingAlgorithms.Argon2id,
                NextPolicyVersion,
                NextParametersJson);
        }

        public PasswordVerificationResult VerifyPassword(
            string submittedPassword,
            StoredPasswordHash storedHash)
        {
            VerifyPasswordCallCount++;

            if (StringComparer.Ordinal.Equals(storedHash.Verifier, MalformedVerifier))
            {
                return PasswordVerificationResult.Failure(PasswordVerificationStatus.MalformedVerifier);
            }

            if (StringComparer.Ordinal.Equals(storedHash.Verifier, InvalidConfigurationVerifier))
            {
                return PasswordVerificationResult.Failure(PasswordVerificationStatus.InvalidConfiguration);
            }

            if (!StringComparer.Ordinal.Equals(storedHash.Algorithm, PasswordHashingAlgorithms.Argon2id))
            {
                return PasswordVerificationResult.Failure(PasswordVerificationStatus.UnsupportedAlgorithm);
            }

            if (!StringComparer.Ordinal.Equals(submittedPassword, CorrectPassword))
            {
                return PasswordVerificationResult.Failure(PasswordVerificationStatus.WrongPassword);
            }

            var rehashDecision = storedHash.RequiresRehash
                ? PasswordRehashDecision.RequiredFor(PasswordRehashReason.ExplicitCredentialFlag)
                : PasswordRehashDecision.NotRequired;

            return PasswordVerificationResult.Verified(rehashDecision);
        }

        public PasswordRehashDecision CheckRehashRequired(StoredPasswordHash storedHash)
        {
            return storedHash.RequiresRehash
                ? PasswordRehashDecision.RequiredFor(PasswordRehashReason.ExplicitCredentialFlag)
                : PasswordRehashDecision.NotRequired;
        }
    }

    private sealed class FakeAuthCredentialAuditWriter : IAuthCredentialAuditWriter
    {
        public ValueTask WriteAsync(AuthCredentialAuditEvent auditEvent, CancellationToken cancellationToken)
        {
            return ValueTask.CompletedTask;
        }
    }

    private sealed class FixedTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset utcNow;

        public FixedTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }
    }
}
