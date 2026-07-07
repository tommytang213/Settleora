using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Metadata;
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
    private const string ResetRequestPath = "/api/v1/auth/password-reset/request";
    private const string ResetCompletePath = "/api/v1/auth/password-reset/complete";
    private const string SubmittedIdentifier = "route.reset@example.com";
    private const string CurrentSecretInput = "current-route-reset-password";
    private const string NewSecretInput = "new-route-reset-password";
    private const string SourceBucket = "src:local-single-node";

    private static readonly string[] PasswordResetPaths =
    [
        ResetRequestPath,
        ResetCompletePath
    ];
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 7, 7, 13, 20, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public LocalPasswordResetRouteExposureTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public void PasswordResetOpenApiPathsAreMappedOnlyForApprovedPostRoutes()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var passwordResetRoutes = testFactory.Services
            .GetRequiredService<IEnumerable<EndpointDataSource>>()
            .SelectMany(dataSource => dataSource.Endpoints)
            .OfType<RouteEndpoint>()
            .Select(endpoint => new
            {
                Path = NormalizeRoutePattern(endpoint.RoutePattern.RawText ?? endpoint.RoutePattern.ToString()),
                Methods = endpoint.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods ?? []
            })
            .Where(endpoint => endpoint.Path.StartsWith("/api/v1/auth/password-reset", StringComparison.OrdinalIgnoreCase))
            .OrderBy(endpoint => endpoint.Path, StringComparer.OrdinalIgnoreCase)
            .ThenBy(endpoint => string.Join(",", endpoint.Methods), StringComparer.OrdinalIgnoreCase)
            .ToList();

        Assert.Equal(
            PasswordResetPaths.Order(StringComparer.OrdinalIgnoreCase).ToArray(),
            passwordResetRoutes.Select(endpoint => endpoint.Path).Order(StringComparer.OrdinalIgnoreCase).ToArray());
        Assert.All(passwordResetRoutes, endpoint => Assert.Equal(["POST"], endpoint.Methods));
    }

    [Fact]
    public async Task PasswordResetRequestReturnsAcceptedNoBodyAndNoRetryAfter()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            ResetRequestPath,
            CreateJsonContent(new
            {
                resetIdentifier = SubmittedIdentifier
            }));

        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Equal(string.Empty, content);
        Assert.False(response.Headers.Contains("Retry-After"));
    }

    [Fact]
    public async Task PasswordResetCompleteReturnsNoContentNoBodyAndNoCredentialsForValidMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededAccount = await SeedLocalAccountAsync(testFactory);
        var rawResetMaterial = await IssueResetMaterialAsync(testFactory);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            ResetCompletePath,
            CreateJsonContent(new
            {
                resetMaterial = rawResetMaterial,
                newPassword = NewSecretInput
            }));

        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(string.Empty, content);
        Assert.DoesNotContain("access", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("refresh", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(rawResetMaterial, content, StringComparison.Ordinal);
        await AssertCredentialVerifierAsync(
            testFactory,
            seededAccount.AuthAccountId,
            TestPasswordHashingService.HashFor(NewSecretInput));
    }

    [Fact]
    public async Task PasswordResetCompleteInvalidOrUnavailableMaterialReturnsGenericBoundedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        const string submittedMaterial = "unknown-route-reset-material";

        using var response = await client.PostAsync(
            ResetCompletePath,
            CreateJsonContent(new
            {
                resetMaterial = submittedMaterial,
                newPassword = NewSecretInput
            }));

        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Password reset failed", content, StringComparison.Ordinal);
        Assert.Contains("Unable to complete password reset with the submitted information.", content, StringComparison.Ordinal);
        Assert.DoesNotContain(submittedMaterial, content, StringComparison.Ordinal);
        Assert.DoesNotContain(NewSecretInput, content, StringComparison.Ordinal);
        Assert.DoesNotContain("expired", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("consumed", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("revoked", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("replay", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("unknown", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("oidc", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("credential", content, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PasswordResetEndpointsRejectUnsupportedFieldsWithoutLeakingSubmittedSecrets()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        var smuggledAccountId = Guid.NewGuid().ToString("D");

        using var response = await client.PostAsync(
            ResetCompletePath,
            CreateJsonContent(new
            {
                resetMaterial = "visible-reset-material",
                newPassword = NewSecretInput,
                authAccountId = smuggledAccountId
            }));

        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Unsupported fields are not allowed.", content, StringComparison.Ordinal);
        Assert.DoesNotContain("visible-reset-material", content, StringComparison.Ordinal);
        Assert.DoesNotContain(NewSecretInput, content, StringComparison.Ordinal);
        Assert.DoesNotContain(smuggledAccountId, content, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("/api/v1/auth/password-reset")]
    [InlineData("/api/v1/auth/password-reset/status")]
    [InlineData("/api/v1/auth/password-reset/token")]
    public async Task PasswordResetRouteExposureDoesNotAddUnapprovedEndpoints(string path)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(path, CreateJsonContent(new { }));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData(ResetRequestPath)]
    [InlineData(ResetCompletePath)]
    public async Task PasswordResetOpenApiPathsAreReachableOverHttp(string path)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(path, new StringContent("{}", Encoding.UTF8, "application/json"));

        Assert.NotEqual(HttpStatusCode.NotFound, response.StatusCode);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new EndpointTestTimeProvider(InitialTimestamp);
        var testFactory = factory.WithWebHostBuilder(builder =>
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

                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(timeProvider);

                services.RemoveAll<IPasswordHashingService>();
                services.AddSingleton<IPasswordHashingService, TestPasswordHashingService>();
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededAccount> SeedLocalAccountAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var userProfileId = Guid.NewGuid();
        var authAccountId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Route Reset User",
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
        dbContext.Set<AuthIdentity>().Add(new AuthIdentity
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            ProviderType = AuthIdentityProviderTypes.Local,
            ProviderName = AuthIdentityProviderTypes.Local,
            ProviderSubject = SubmittedIdentifier,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<LocalPasswordCredential>().Add(new LocalPasswordCredential
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            PasswordHash = TestPasswordHashingService.HashFor(CurrentSecretInput),
            PasswordHashAlgorithm = TestPasswordHashingService.Algorithm,
            PasswordHashAlgorithmVersion = TestPasswordHashingService.PolicyVersion,
            PasswordHashParameters = TestPasswordHashingService.ParametersJson,
            Status = LocalPasswordCredentialStatuses.Active,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });

        await dbContext.SaveChangesAsync();
        return new SeededAccount(authAccountId, userProfileId);
    }

    private static async Task<string> IssueResetMaterialAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var resetService = scope.ServiceProvider.GetRequiredService<ILocalPasswordResetService>();
        var issued = await resetService.IssueMaterialAsync(new LocalPasswordResetMaterialIssueRequest(
            SubmittedIdentifier,
            AuthPasswordResetMaterialScopes.EmailLink,
            TimeSpan.FromMinutes(60),
            SourceBucket));

        Assert.True(issued.Succeeded);
        Assert.False(string.IsNullOrWhiteSpace(issued.RawResetMaterial));
        return issued.RawResetMaterial!;
    }

    private static async Task AssertCredentialVerifierAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authAccountId,
        string expectedVerifier)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var credential = await dbContext.Set<LocalPasswordCredential>()
            .AsNoTracking()
            .SingleAsync(credential => credential.AuthAccountId == authAccountId);

        Assert.Equal(expectedVerifier, credential.PasswordHash);
        Assert.Equal(TestPasswordHashingService.Algorithm, credential.PasswordHashAlgorithm);
        Assert.Equal(TestPasswordHashingService.PolicyVersion, credential.PasswordHashAlgorithmVersion);
        Assert.Equal(TestPasswordHashingService.ParametersJson, credential.PasswordHashParameters);
        Assert.Equal(LocalPasswordCredentialStatuses.Active, credential.Status);
    }

    private static StringContent CreateJsonContent(object value)
    {
        return new StringContent(
            JsonSerializer.Serialize(value),
            Encoding.UTF8,
            "application/json");
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

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        EndpointTestTimeProvider TimeProvider);

    private sealed record SeededAccount(Guid AuthAccountId, Guid UserProfileId);

    private sealed class EndpointTestTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset utcNow;

        public EndpointTestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }
    }

    private sealed class TestPasswordHashingService : IPasswordHashingService
    {
        public const string Algorithm = "fake";
        public const string PolicyVersion = "test-v1";
        public const string ParametersJson = "{\"profile\":\"test\"}";

        public static string HashFor(string password)
        {
            return $"fake-hash:{password}";
        }

        public PasswordHashResult HashPassword(string plaintextPassword)
        {
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
