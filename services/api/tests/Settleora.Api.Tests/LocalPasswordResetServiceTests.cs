using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.PasswordHashing;
using Settleora.Api.Auth.PasswordReset;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class LocalPasswordResetServiceTests
{
    private const string SubmittedIdentifier = "  reset-local-subject  ";
    private const string NormalizedIdentifier = "reset-local-subject";
    private const string MissingIdentifier = "missing-reset-subject";
    private const string CurrentSecretInput = "current-reset-input-value";
    private const string NewSecretInput = "new-reset-input-value";
    private const string SourceBucket = "src.local";
    private const string CorrelationId = "corr.reset";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 7, 6, 7, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task RequestResetReturnsSameAcceptedResultAndCreatesNoMaterialWhenProviderUnavailable()
    {
        using var dbContext = CreateDbContext();
        var localAccount = await SeedLocalAccountAsync(dbContext, NormalizedIdentifier);
        await SeedLocalAccountAsync(dbContext, "disabled-reset-subject", disabled: true);
        await SeedOidcOnlyAccountAsync(dbContext);
        await SeedCredentialAsync(dbContext, localAccount.AuthAccountId, CurrentSecretInput);
        var service = CreateService(dbContext);

        var existing = await service.RequestResetAsync(CreateRequest(SubmittedIdentifier));
        var missing = await service.RequestResetAsync(CreateRequest(MissingIdentifier));
        var oidcOnly = await service.RequestResetAsync(CreateRequest("oidc-reset-subject"));
        var disabled = await service.RequestResetAsync(CreateRequest("disabled-reset-subject"));

        Assert.Equal(LocalPasswordResetRequestStatus.Accepted, existing.Status);
        Assert.Equal(existing.Status, missing.Status);
        Assert.Equal(existing.Status, oidcOnly.Status);
        Assert.Equal(existing.Status, disabled.Status);
        Assert.Empty(await dbContext.Set<AuthPasswordResetRequest>().ToListAsync());

        var audits = await dbContext.Set<AuthAuditEvent>().ToListAsync();
        Assert.All(audits, audit => AssertSafeAuditContent(audit, SubmittedIdentifier.Trim(), NormalizedIdentifier, MissingIdentifier, CurrentSecretInput));
    }

    [Fact]
    public async Task IssueMaterialStoresOnlyLookupHashAndRevokesOlderOutstandingMaterial()
    {
        using var dbContext = CreateDbContext();
        var localAccount = await SeedLocalAccountAsync(dbContext, NormalizedIdentifier);
        await SeedCredentialAsync(dbContext, localAccount.AuthAccountId, CurrentSecretInput);
        var service = CreateService(dbContext);

        var first = await service.IssueMaterialAsync(CreateIssueRequest());
        var second = await service.IssueMaterialAsync(CreateIssueRequest());

        Assert.True(first.Succeeded);
        Assert.True(second.Succeeded);
        Assert.NotEqual(first.RawResetMaterial, second.RawResetMaterial);
        Assert.DoesNotContain(first.RawResetMaterial!, first.ToString());
        Assert.DoesNotContain(second.RawResetMaterial!, second.ToString());

        var resetRequests = await dbContext.Set<AuthPasswordResetRequest>()
            .OrderBy(request => request.CreatedAtUtc)
            .ToListAsync();
        Assert.Equal(2, resetRequests.Count);

        var oldRequest = resetRequests[0];
        var newestRequest = resetRequests[1];
        Assert.Equal(AuthPasswordResetRequestStatuses.Revoked, oldRequest.Status);
        Assert.Equal(AuthPasswordResetRevocationReasons.ReplacedByNewerMaterial, oldRequest.RevocationReason);
        Assert.Equal(newestRequest.Id, oldRequest.ReplacedByResetRequestId);
        Assert.Equal(AuthPasswordResetRequestStatuses.Pending, newestRequest.Status);
        Assert.StartsWith("pwd-reset-sha256:v1:", newestRequest.ResetMaterialHash, StringComparison.Ordinal);
        Assert.DoesNotContain(second.RawResetMaterial!, newestRequest.ResetMaterialHash!);
        Assert.DoesNotContain(CurrentSecretInput, newestRequest.ResetMaterialHash!);
        Assert.Null(newestRequest.SuspiciousReplayAtUtc);
    }

    [Fact]
    public async Task IssueMaterialDoesNotPersistIdentifierOrPlainSha256IdentifierBuckets()
    {
        const string submittedEmailIdentifier = "  Reset.User+Case@Example.COM  ";
        const string normalizedEmailIdentifier = "reset.user+case@example.com";
        using var dbContext = CreateDbContext();
        var localAccount = await SeedLocalAccountAsync(dbContext, normalizedEmailIdentifier);
        await SeedCredentialAsync(dbContext, localAccount.AuthAccountId, CurrentSecretInput);
        var service = CreateService(dbContext);
        var oldIdentifierBucket = DeriveFormerPlainSha256Bucket(
            "reset-id-sha256:",
            "local-password-reset-id:" + normalizedEmailIdentifier);
        var oldCombinedBucket = DeriveFormerPlainSha256Bucket(
            "reset-combined-sha256:",
            "local-password-reset-combined:" + SourceBucket + ":" + normalizedEmailIdentifier);

        var issued = await service.IssueMaterialAsync(new LocalPasswordResetMaterialIssueRequest(
            submittedEmailIdentifier,
            AuthPasswordResetMaterialScopes.EmailLink,
            TimeSpan.FromMinutes(60),
            SourceBucket,
            CorrelationId));

        Assert.True(issued.Succeeded);
        var resetRequest = await dbContext.Set<AuthPasswordResetRequest>().SingleAsync();
        Assert.Equal(SourceBucket, resetRequest.RequestSourceBucketRef);
        Assert.Null(resetRequest.IdentifierBucketRef);
        Assert.Null(resetRequest.CombinedBucketRef);
        Assert.Null(resetRequest.GlobalBucketRef);
        Assert.Null(resetRequest.ProviderSendBucketRef);

        var persistedResetContent = string.Join(
            " ",
            resetRequest.RequestSourceBucketRef,
            resetRequest.IdentifierBucketRef,
            resetRequest.CombinedBucketRef,
            resetRequest.GlobalBucketRef,
            resetRequest.ProviderSendBucketRef,
            resetRequest.RequestCorrelationId,
            resetRequest.AuditCorrelationId,
            resetRequest.DeliveryCategory,
            resetRequest.ProviderSendCategory,
            resetRequest.ResetMaterialHash,
            resetRequest.ResetMaterialHashVersion,
            resetRequest.ResetMaterialScope);

        Assert.DoesNotContain(submittedEmailIdentifier.Trim(), persistedResetContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(normalizedEmailIdentifier, persistedResetContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(oldIdentifierBucket, persistedResetContent, StringComparison.Ordinal);
        Assert.DoesNotContain(oldCombinedBucket, persistedResetContent, StringComparison.Ordinal);

        var audits = await dbContext.Set<AuthAuditEvent>().ToListAsync();
        Assert.All(audits, audit => AssertSafeAuditContent(
            audit,
            submittedEmailIdentifier.Trim(),
            normalizedEmailIdentifier,
            oldIdentifierBucket,
            oldCombinedBucket,
            CurrentSecretInput));
    }

    [Fact]
    public async Task CompleteResetSucceedsOnceReplacesCredentialAndRevokesSessionsAndRefreshFamilies()
    {
        using var dbContext = CreateDbContext();
        var localAccount = await SeedLocalAccountAsync(dbContext, NormalizedIdentifier);
        await SeedCredentialAsync(dbContext, localAccount.AuthAccountId, CurrentSecretInput);
        await SeedActiveSessionFamilyAsync(dbContext, localAccount.AuthAccountId);
        await SeedActiveSessionFamilyAsync(dbContext, localAccount.AuthAccountId);
        var passwordHashingService = new FakePasswordHashingService();
        var service = CreateService(dbContext, passwordHashingService);
        var issued = await service.IssueMaterialAsync(CreateIssueRequest());

        var completed = await service.CompleteResetAsync(new LocalPasswordResetCompleteRequest(
            issued.RawResetMaterial,
            NewSecretInput,
            CorrelationId));
        var replayed = await service.CompleteResetAsync(new LocalPasswordResetCompleteRequest(
            issued.RawResetMaterial,
            "replay-reset-input-value",
            CorrelationId));

        Assert.True(completed.Succeeded);
        Assert.Equal(LocalPasswordResetCompleteStatus.Completed, completed.Status);
        Assert.False(replayed.Succeeded);
        Assert.Equal(LocalPasswordResetCompleteStatus.InvalidOrUnavailable, replayed.Status);

        var credential = await dbContext.Set<LocalPasswordCredential>().SingleAsync();
        Assert.Equal(FakePasswordHashingService.HashFor(NewSecretInput), credential.PasswordHash);
        Assert.Equal(1, passwordHashingService.HashPasswordCallCount);

        var resetRequest = await dbContext.Set<AuthPasswordResetRequest>().SingleAsync();
        Assert.Equal(AuthPasswordResetRequestStatuses.SuspiciousReplay, resetRequest.Status);
        Assert.NotNull(resetRequest.ConsumedAtUtc);
        Assert.NotNull(resetRequest.SuspiciousReplayAtUtc);
        Assert.DoesNotContain(issued.RawResetMaterial!, resetRequest.ResetMaterialHash!);

        var sessions = await dbContext.Set<AuthSession>().ToListAsync();
        Assert.All(sessions, session =>
        {
            Assert.Equal(AuthSessionStatuses.Revoked, session.Status);
            Assert.Equal("password_reset", session.RevocationReason);
        });

        var families = await dbContext.Set<AuthSessionFamily>().ToListAsync();
        Assert.All(families, family =>
        {
            Assert.Equal(AuthSessionFamilyStatuses.Revoked, family.Status);
            Assert.Equal("password_reset", family.RevocationReason);
        });

        var refreshCredentials = await dbContext.Set<AuthRefreshCredential>().ToListAsync();
        Assert.All(refreshCredentials, credential =>
        {
            Assert.Equal(AuthRefreshCredentialStatuses.Revoked, credential.Status);
            Assert.Equal("password_reset", credential.RevocationReason);
        });

        var audits = await dbContext.Set<AuthAuditEvent>().ToListAsync();
        Assert.Contains(audits, audit => audit.Action == "credential.password_reset" && audit.Outcome == AuthAuditOutcomes.Success);
        Assert.Contains(audits, audit => audit.Action == "password_reset.consumed" && audit.Outcome == AuthAuditOutcomes.Success);
        Assert.Contains(audits, audit => audit.Action == "password_reset.sessions_revoked" && audit.Outcome == AuthAuditOutcomes.Revoked);
        Assert.Contains(audits, audit => audit.Action == "password_reset.replay_suspicious");
        Assert.All(audits, audit => AssertSafeAuditContent(
            audit,
            issued.RawResetMaterial!,
            CurrentSecretInput,
            NewSecretInput,
            "replay-reset-input-value",
            FakePasswordHashingService.HashFor(CurrentSecretInput),
            FakePasswordHashingService.HashFor(NewSecretInput)));
    }

    private static LocalPasswordResetRequest CreateRequest(string identifier)
    {
        return new LocalPasswordResetRequest(identifier, SourceBucket, CorrelationId);
    }

    private static LocalPasswordResetMaterialIssueRequest CreateIssueRequest()
    {
        return new LocalPasswordResetMaterialIssueRequest(
            SubmittedIdentifier,
            AuthPasswordResetMaterialScopes.EmailLink,
            TimeSpan.FromMinutes(60),
            SourceBucket,
            CorrelationId);
    }

    private static LocalPasswordResetService CreateService(
        SettleoraDbContext dbContext,
        FakePasswordHashingService? passwordHashingService = null,
        TestTimeProvider? timeProvider = null)
    {
        var effectiveTimeProvider = timeProvider ?? new TestTimeProvider(InitialTimestamp);
        var credentialWorkflow = new AuthCredentialWorkflowService(
            dbContext,
            passwordHashingService ?? new FakePasswordHashingService(),
            new EfAuthCredentialAuditWriter(dbContext),
            effectiveTimeProvider);
        var sessionRuntime = new AuthSessionRuntimeService(
            dbContext,
            new EfAuthSessionAuditWriter(dbContext),
            effectiveTimeProvider,
            Options.Create(new AuthSessionPolicyOptions()));

        return new LocalPasswordResetService(
            dbContext,
            new PasswordResetMaterialService(),
            credentialWorkflow,
            sessionRuntime,
            new EfPasswordResetAuditWriter(dbContext),
            effectiveTimeProvider);
    }

    private static SettleoraDbContext CreateDbContext()
    {
        return new SettleoraDbContext(
            new DbContextOptionsBuilder<SettleoraDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options);
    }

    private static async Task<SeededAccount> SeedLocalAccountAsync(
        SettleoraDbContext dbContext,
        string normalizedIdentifier,
        bool disabled = false)
    {
        var profileId = Guid.NewGuid();
        var accountId = Guid.NewGuid();
        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = profileId,
            DisplayName = "Reset User",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = accountId,
            UserProfileId = profileId,
            Status = disabled ? AuthAccountStatuses.Disabled : AuthAccountStatuses.Active,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            DisabledAtUtc = disabled ? InitialTimestamp : null
        });
        dbContext.Set<AuthIdentity>().Add(new AuthIdentity
        {
            Id = Guid.NewGuid(),
            AuthAccountId = accountId,
            ProviderType = AuthIdentityProviderTypes.Local,
            ProviderName = AuthIdentityProviderTypes.Local,
            ProviderSubject = normalizedIdentifier,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        await dbContext.SaveChangesAsync();
        return new SeededAccount(accountId, profileId);
    }

    private static async Task SeedOidcOnlyAccountAsync(SettleoraDbContext dbContext)
    {
        var profileId = Guid.NewGuid();
        var accountId = Guid.NewGuid();
        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = profileId,
            DisplayName = "OIDC Reset User",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = accountId,
            UserProfileId = profileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<AuthIdentity>().Add(new AuthIdentity
        {
            Id = Guid.NewGuid(),
            AuthAccountId = accountId,
            ProviderType = AuthIdentityProviderTypes.Oidc,
            ProviderName = "oidc-provider",
            ProviderSubject = "oidc-reset-subject",
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        await dbContext.SaveChangesAsync();
    }

    private static async Task SeedCredentialAsync(
        SettleoraDbContext dbContext,
        Guid authAccountId,
        string password)
    {
        dbContext.Set<LocalPasswordCredential>().Add(new LocalPasswordCredential
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            PasswordHash = FakePasswordHashingService.HashFor(password),
            PasswordHashAlgorithm = FakePasswordHashingService.Algorithm,
            PasswordHashAlgorithmVersion = FakePasswordHashingService.PolicyVersion,
            PasswordHashParameters = FakePasswordHashingService.ParametersJson,
            Status = LocalPasswordCredentialStatuses.Active,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        await dbContext.SaveChangesAsync();
    }

    private static async Task SeedActiveSessionFamilyAsync(
        SettleoraDbContext dbContext,
        Guid authAccountId)
    {
        var sessionId = Guid.NewGuid();
        var familyId = Guid.NewGuid();
        dbContext.Set<AuthSession>().Add(new AuthSession
        {
            Id = sessionId,
            AuthAccountId = authAccountId,
            SessionTokenHash = "sha256:" + Guid.NewGuid().ToString("N"),
            Status = AuthSessionStatuses.Active,
            IssuedAtUtc = InitialTimestamp,
            ExpiresAtUtc = InitialTimestamp.AddHours(1),
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<AuthSessionFamily>().Add(new AuthSessionFamily
        {
            Id = familyId,
            AuthAccountId = authAccountId,
            Status = AuthSessionFamilyStatuses.Active,
            AbsoluteExpiresAtUtc = InitialTimestamp.AddDays(30),
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<AuthRefreshCredential>().Add(new AuthRefreshCredential
        {
            Id = Guid.NewGuid(),
            AuthSessionFamilyId = familyId,
            AuthSessionId = sessionId,
            RefreshTokenHash = "refresh-sha256:" + Guid.NewGuid().ToString("N"),
            Status = AuthRefreshCredentialStatuses.Active,
            IssuedAtUtc = InitialTimestamp,
            IdleExpiresAtUtc = InitialTimestamp.AddDays(7),
            AbsoluteExpiresAtUtc = InitialTimestamp.AddDays(30),
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        await dbContext.SaveChangesAsync();
    }

    private static void AssertSafeAuditContent(AuthAuditEvent audit, params string[] forbiddenFragments)
    {
        var combined = string.Join(
            " ",
            audit.Action,
            audit.Outcome,
            audit.CorrelationId,
            audit.RequestId,
            audit.SafeMetadataJson);
        foreach (var fragment in forbiddenFragments.Where(fragment => !string.IsNullOrWhiteSpace(fragment)))
        {
            Assert.DoesNotContain(fragment, combined, StringComparison.Ordinal);
        }
    }

    private static string DeriveFormerPlainSha256Bucket(string prefix, string payload)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(payload));
        return prefix + Microsoft.AspNetCore.WebUtilities.WebEncoders.Base64UrlEncode(hash);
    }

    private sealed record SeededAccount(Guid AuthAccountId, Guid UserProfileId);

    private sealed class TestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public TestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }
    }

    private sealed class FakePasswordHashingService : IPasswordHashingService
    {
        public const string Algorithm = "fake";
        public const string PolicyVersion = "test-v1";
        public const string ParametersJson = "{\"profile\":\"test\"}";

        public int HashPasswordCallCount { get; private set; }

        public static string HashFor(string password)
        {
            return $"fake-hash:{password}";
        }

        public PasswordHashResult HashPassword(string plaintextPassword)
        {
            HashPasswordCallCount++;
            return PasswordHashResult.Success(
                HashFor(plaintextPassword),
                Algorithm,
                PolicyVersion,
                ParametersJson);
        }

        public PasswordVerificationResult VerifyPassword(
            string submittedPassword,
            StoredPasswordHash storedHash)
        {
            return StringComparer.Ordinal.Equals(storedHash.Verifier, HashFor(submittedPassword))
                ? PasswordVerificationResult.Verified(PasswordRehashDecision.NotRequired)
                : PasswordVerificationResult.Failure(PasswordVerificationStatus.WrongPassword);
        }

        public PasswordRehashDecision CheckRehashRequired(StoredPasswordHash storedHash)
        {
            return PasswordRehashDecision.NotRequired;
        }
    }
}

public sealed class LocalPasswordResetRouteExposureTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly string[] PasswordResetPaths =
    [
        "/api/v1/auth/password-reset/request",
        "/api/v1/auth/password-reset/complete"
    ];

    private readonly WebApplicationFactory<Program> factory;

    public LocalPasswordResetRouteExposureTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public void PasswordResetOpenApiPathsAreNotMappedInRuntimeEndpointDataSources()
    {
        using var testFactory = CreateFactory();
        var routePatterns = testFactory.Services
            .GetRequiredService<IEnumerable<EndpointDataSource>>()
            .SelectMany(dataSource => dataSource.Endpoints)
            .OfType<RouteEndpoint>()
            .Select(endpoint => NormalizeRoutePattern(endpoint.RoutePattern.RawText ?? endpoint.RoutePattern.ToString()))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var path in PasswordResetPaths)
        {
            Assert.DoesNotContain(path, routePatterns);
        }
    }

    [Theory]
    [InlineData("/api/v1/auth/password-reset/request")]
    [InlineData("/api/v1/auth/password-reset/complete")]
    public async Task PasswordResetOpenApiPathsAreNotReachableOverHttp(string path)
    {
        using var testFactory = CreateFactory();
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(path, new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private WebApplicationFactory<Program> CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        return factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<SettleoraDbContext>();
                services.RemoveAll<DbContextOptions>();
                services.RemoveAll<DbContextOptions<SettleoraDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<SettleoraDbContext>>();
                services.AddDbContext<SettleoraDbContext>(options =>
                {
                    options.UseInMemoryDatabase(databaseName);
                });
            });
        });
    }

    private static string NormalizeRoutePattern(string? routePattern)
    {
        if (string.IsNullOrWhiteSpace(routePattern))
        {
            return string.Empty;
        }

        return routePattern.StartsWith("/", StringComparison.Ordinal)
            ? routePattern
            : "/" + routePattern;
    }
}
