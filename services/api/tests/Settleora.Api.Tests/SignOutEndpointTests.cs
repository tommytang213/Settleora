using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.PasswordHashing;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Auth.SignIn;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class SignOutEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string SignOutPath = "/api/v1/auth/sign-out";
    private const string SignInPath = "/api/v1/auth/sign-in";
    private const string CurrentUserPath = "/api/v1/auth/current-user";
    private const string WrongRawToken = "visible-wrong-session-token";
    private const string SubmittedIdentifier = "  LOCAL.User@Example.COM  ";
    private const string NormalizedIdentifier = "local.user@example.com";
    private const string SubmittedPassword = "visible-local-sign-in-password";
    private const string VerifierFragment = "visible-password-verifier";
    private const string SourceKey = "src:local-single-node";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 3, 13, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset RevocationTimestamp = new(2026, 5, 3, 13, 10, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 3, 13, 15, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public SignOutEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task MissingAuthorizationHeaderReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(SignOutPath, content: null);

        await AssertUnauthenticatedProblemAsync(response);
    }

    [Fact]
    public async Task NonBearerAuthorizationHeaderReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, SignOutPath);
        request.Headers.TryAddWithoutValidation("Authorization", "Basic abc123");

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response);
    }

    [Fact]
    public async Task EmptyBearerTokenReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, SignOutPath);
        request.Headers.TryAddWithoutValidation("Authorization", "Bearer ");

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response);
    }

    [Fact]
    public async Task WrongBearerTokenReturnsUnauthenticatedProblemWithoutLeakingTokenText()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutRequest(WrongRawToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, WrongRawToken);
        await AssertSessionStatusAsync(testFactory, seededSession.AuthSessionId, AuthSessionStatuses.Active);
    }

    [Fact]
    public async Task ExpiredSessionTokenReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(
            testFactory,
            testContext.TimeProvider,
            lifetime: TimeSpan.FromMinutes(5));
        testContext.TimeProvider.SetUtcNow(InitialTimestamp.AddMinutes(6));
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutRequest(seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, seededSession.RawSessionToken);
    }

    [Fact]
    public async Task RevokedSessionTokenReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        await RevokeSessionAsync(testFactory, testContext.TimeProvider, seededSession);
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutRequest(seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, seededSession.RawSessionToken);
    }

    [Theory]
    [InlineData("disabled")]
    [InlineData("deleted")]
    public async Task UnavailableAccountBehindValidSessionReturnsUnauthenticatedProblem(string accountState)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        await MarkAccountUnavailableAsync(testFactory, seededSession.AuthAccountId, accountState);
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutRequest(seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, seededSession.RawSessionToken);
    }

    [Fact]
    public async Task ValidSessionTokenReturnsNoContentAndMarksSessionRevoked()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutRequest(seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertNoContentAsync(response);

        var session = await ReadSessionAsync(testFactory, seededSession.AuthSessionId);
        Assert.Equal(AuthSessionStatuses.Revoked, session.Status);
        Assert.Equal(ValidationTimestamp, session.RevokedAtUtc);
        Assert.Equal(ValidationTimestamp, session.UpdatedAtUtc);
        Assert.Equal("user_sign_out", session.RevocationReason);
    }

    [Fact]
    public async Task RevokedSessionCannotReadCurrentUserAfterSignOut()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();

        using var signOutRequest = CreateSignOutRequest(seededSession.RawSessionToken);
        using var signOutResponse = await client.SendAsync(signOutRequest);
        await AssertNoContentAsync(signOutResponse);

        using var currentUserRequest = CreateCurrentUserRequest(seededSession.RawSessionToken);
        using var currentUserResponse = await client.SendAsync(currentUserRequest);

        await AssertUnauthenticatedProblemAsync(currentUserResponse, seededSession.RawSessionToken);
    }

    [Fact]
    public async Task SignOutResponseDoesNotExposeTokenCredentialAuditSourceProviderOrStorageMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, seededSession.AuthSessionId);
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutRequest(seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        var lowerContent = content.ToLowerInvariant();

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(string.Empty, content);
        Assert.DoesNotContain(seededSession.RawSessionToken, content);
        Assert.DoesNotContain(sessionTokenHash, content);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("verifier", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("source", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain(VerifierFragment, content);
        Assert.DoesNotContain(SourceKey, content);
    }

    [Fact]
    public async Task ReturnedTokenFromSignInCanSignOutThenCurrentUserFails()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedLocalSignInAccountAsync(testFactory);
        using var client = testFactory.CreateClient();

        using var signInResponse = await client.PostAsync(SignInPath, CreateSignInContent());
        Assert.Equal(HttpStatusCode.OK, signInResponse.StatusCode);
        var rawSessionToken = await ReadSignInSessionTokenAsync(signInResponse);

        using var signOutRequest = CreateSignOutRequest(rawSessionToken);
        using var signOutResponse = await client.SendAsync(signOutRequest);
        await AssertNoContentAsync(signOutResponse);

        using var currentUserRequest = CreateCurrentUserRequest(rawSessionToken);
        using var currentUserResponse = await client.SendAsync(currentUserRequest);

        await AssertUnauthenticatedProblemAsync(currentUserResponse, rawSessionToken);
    }

    [Fact]
    public async Task AlreadyRevokedRaceAfterValidationReturnsNoContent()
    {
        var actor = new AuthenticatedSessionActor(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            ValidationTimestamp.AddHours(1));
        var fakeSessionRuntimeService = new FakeAuthSessionRuntimeService(
            AuthSessionValidationResult.Validated(actor),
            AuthSessionRevocationResult.Failure(
                AuthSessionRevocationStatus.AlreadyRevoked,
                actor.AuthSessionId));
        var testContext = CreateFactory(fakeSessionRuntimeService);
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutRequest("race-session-token");

        using var response = await client.SendAsync(request);

        await AssertNoContentAsync(response);
        var revocationRequest = Assert.Single(fakeSessionRuntimeService.RevocationRequests);
        Assert.Equal(actor.AuthAccountId, revocationRequest.AuthAccountId);
        Assert.Equal(actor.AuthSessionId, revocationRequest.AuthSessionId);
        Assert.Equal("user_sign_out", revocationRequest.RevocationReason);
    }

    [Fact]
    public async Task RevocationPersistenceFailureReturnsSafeServerProblemWithoutLeakingToken()
    {
        var actor = new AuthenticatedSessionActor(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            ValidationTimestamp.AddHours(1));
        var fakeSessionRuntimeService = new FakeAuthSessionRuntimeService(
            AuthSessionValidationResult.Validated(actor),
            AuthSessionRevocationResult.Failure(
                AuthSessionRevocationStatus.PersistenceFailed,
                actor.AuthSessionId));
        var testContext = CreateFactory(fakeSessionRuntimeService);
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutRequest("visible-persistence-failure-token");

        using var response = await client.SendAsync(request);

        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("visible-persistence-failure-token", content);
        Assert.DoesNotContain("PersistenceFailed", content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Sign-out failed", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(500, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("Unable to complete sign-out.", payload.RootElement.GetProperty("detail").GetString());
    }

    private FactoryTestContext CreateFactory(IAuthSessionRuntimeService? sessionRuntimeService = null)
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
                services.AddSingleton<IPasswordHashingService, FakePasswordHashingService>();

                if (sessionRuntimeService is not null)
                {
                    services.RemoveAll<IAuthSessionRuntimeService>();
                    services.AddSingleton(sessionRuntimeService);
                }
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededSignOutSession> SeedValidSessionAsync(
        WebApplicationFactory<Program> testFactory,
        EndpointTestTimeProvider timeProvider,
        TimeSpan? lifetime = null)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Sign-Out Endpoint Test User",
            DefaultCurrency = "USD",
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

        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                authAccountId,
                DeviceLabel: "Sign-out endpoint test",
                UserAgentSummary: "Sign-out endpoint test user agent",
                NetworkAddressHash: "sign-out-endpoint-test-network",
                RequestedLifetime: lifetime ?? TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededSignOutSession(
            authAccountId,
            userProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            sessionCreationResult.SessionExpiresAtUtc.Value);
    }

    private static async Task RevokeSessionAsync(
        WebApplicationFactory<Program> testFactory,
        EndpointTestTimeProvider timeProvider,
        SeededSignOutSession seededSession)
    {
        timeProvider.SetUtcNow(RevocationTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var revocationResult = await sessionRuntimeService.RevokeSessionAsync(
            new AuthSessionRevocationRequest(
                seededSession.AuthAccountId,
                seededSession.AuthSessionId,
                "endpoint_test_revocation"));

        Assert.True(revocationResult.Succeeded);
        timeProvider.SetUtcNow(ValidationTimestamp);
    }

    private static async Task MarkAccountUnavailableAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authAccountId,
        string accountState)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var account = await dbContext.Set<AuthAccount>().SingleAsync(
            authAccount => authAccount.Id == authAccountId);

        if (accountState == "disabled")
        {
            account.Status = AuthAccountStatuses.Disabled;
            account.DisabledAtUtc = ValidationTimestamp;
        }
        else
        {
            account.DeletedAtUtc = ValidationTimestamp;
        }

        account.UpdatedAtUtc = ValidationTimestamp;
        await dbContext.SaveChangesAsync();
    }

    private static async Task SeedLocalSignInAccountAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var userProfileId = Guid.NewGuid();
        var authAccountId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Sign-Out Local Sign-In Test User",
            DefaultCurrency = "USD",
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
            ProviderName = LocalSignInService.LocalProviderName,
            ProviderSubject = NormalizedIdentifier,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<LocalPasswordCredential>().Add(new LocalPasswordCredential
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            PasswordHash = FakePasswordHashingService.CurrentVerifier,
            PasswordHashAlgorithm = PasswordHashingAlgorithms.Argon2id,
            PasswordHashAlgorithmVersion = FakePasswordHashingService.CurrentPolicyVersion,
            PasswordHashParameters = FakePasswordHashingService.CurrentParametersJson,
            Status = LocalPasswordCredentialStatuses.Active,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            RequiresRehash = false
        });

        await dbContext.SaveChangesAsync();
    }

    private static async Task<AuthSession> ReadSessionAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthSession>().SingleAsync(session => session.Id == authSessionId);
    }

    private static async Task<string> ReadSessionTokenHashAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        var session = await ReadSessionAsync(testFactory, authSessionId);
        return session.SessionTokenHash;
    }

    private static async Task AssertSessionStatusAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId,
        string expectedStatus)
    {
        var session = await ReadSessionAsync(testFactory, authSessionId);
        Assert.Equal(expectedStatus, session.Status);
    }

    private static HttpRequestMessage CreateSignOutRequest(string rawSessionToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, SignOutPath);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreateCurrentUserRequest(string rawSessionToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, CurrentUserPath);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static StringContent CreateSignInContent()
    {
        return new StringContent(
            JsonSerializer.Serialize(new
            {
                identifier = SubmittedIdentifier,
                password = SubmittedPassword,
                deviceLabel = "Sign-out endpoint test device",
                requestedSessionLifetimeMinutes = 45
            }),
            Encoding.UTF8,
            "application/json");
    }

    private static async Task<string> ReadSignInSessionTokenAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        using var payload = JsonDocument.Parse(content);
        var rawSessionToken = payload.RootElement
            .GetProperty("session")
            .GetProperty("token")
            .GetString();

        Assert.False(string.IsNullOrWhiteSpace(rawSessionToken));
        return rawSessionToken!;
    }

    private static async Task AssertNoContentAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(string.Empty, content);
    }

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(WrongRawToken, content);
        Assert.DoesNotContain("revoked", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("expired", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("disabled", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("deleted", content, StringComparison.OrdinalIgnoreCase);
        if (unexpectedResponseText is not null)
        {
            Assert.DoesNotContain(unexpectedResponseText, content);
        }

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Authentication is required to access this resource.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        EndpointTestTimeProvider TimeProvider);

    private sealed record SeededSignOutSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset SessionExpiresAtUtc);

    private sealed class EndpointTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public EndpointTestTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }

        public void SetUtcNow(DateTimeOffset value)
        {
            utcNow = value;
        }
    }

    private sealed class FakePasswordHashingService : IPasswordHashingService
    {
        public const string CurrentVerifier = VerifierFragment;
        public const string CurrentPolicyVersion = "argon2id-test-v1";
        public const string CurrentParametersJson = """{"format":"fake-current"}""";

        public PasswordHashResult HashPassword(string plaintextPassword)
        {
            return PasswordHashResult.Success(
                CurrentVerifier,
                PasswordHashingAlgorithms.Argon2id,
                CurrentPolicyVersion,
                CurrentParametersJson);
        }

        public PasswordVerificationResult VerifyPassword(
            string submittedPassword,
            StoredPasswordHash storedHash)
        {
            if (!StringComparer.Ordinal.Equals(storedHash.Algorithm, PasswordHashingAlgorithms.Argon2id))
            {
                return PasswordVerificationResult.Failure(PasswordVerificationStatus.UnsupportedAlgorithm);
            }

            return StringComparer.Ordinal.Equals(submittedPassword, SubmittedPassword)
                ? PasswordVerificationResult.Verified(PasswordRehashDecision.NotRequired)
                : PasswordVerificationResult.Failure(PasswordVerificationStatus.WrongPassword);
        }

        public PasswordRehashDecision CheckRehashRequired(StoredPasswordHash storedHash)
        {
            return PasswordRehashDecision.NotRequired;
        }
    }

    private sealed class FakeAuthSessionRuntimeService : IAuthSessionRuntimeService
    {
        private readonly AuthSessionValidationResult validationResult;
        private readonly AuthSessionRevocationResult revocationResult;

        public FakeAuthSessionRuntimeService(
            AuthSessionValidationResult validationResult,
            AuthSessionRevocationResult revocationResult)
        {
            this.validationResult = validationResult;
            this.revocationResult = revocationResult;
        }

        public List<AuthSessionRevocationRequest> RevocationRequests { get; } = [];

        public Task<AuthSessionCreationResult> CreateSessionAsync(
            AuthSessionCreationRequest request,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }

        public Task<AuthSessionValidationResult> ValidateSessionAsync(
            string? rawSessionToken,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(validationResult);
        }

        public Task<AuthSessionRevocationResult> RevokeSessionAsync(
            AuthSessionRevocationRequest request,
            CancellationToken cancellationToken = default)
        {
            RevocationRequests.Add(request);
            return Task.FromResult(revocationResult);
        }
    }
}
