using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class SignOutAllEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string SignOutAllPath = "/api/v1/auth/sign-out-all";
    private const string CurrentUserPath = "/api/v1/auth/current-user";
    private const string SessionsPath = "/api/v1/auth/sessions";
    private const string WrongRawToken = "visible-wrong-session-token";
    private const string PersistenceFailureToken = "visible-persistence-failure-token";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 3, 18, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset RevocationTimestamp = new(2026, 5, 3, 18, 10, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 3, 18, 20, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public SignOutAllEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task MissingAuthorizationHeaderReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(SignOutAllPath, content: null);

        await AssertUnauthenticatedProblemAsync(response);
    }

    [Theory]
    [InlineData("Basic abc123")]
    [InlineData("Bearer ")]
    public async Task NonBearerOrEmptyBearerReturnsUnauthenticatedProblem(string authorizationHeader)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, SignOutAllPath);
        request.Headers.TryAddWithoutValidation("Authorization", authorizationHeader);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response);
    }

    [Fact]
    public async Task WrongBearerTokenReturnsUnauthenticatedProblemAndDoesNotRevokeSessions()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId);
        var otherOwnedSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            issuedAtUtc: InitialTimestamp.AddMinutes(1));
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutAllRequest(WrongRawToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, WrongRawToken);
        await AssertSessionStatusAsync(testFactory, currentSession.AuthSessionId, AuthSessionStatuses.Active);
        await AssertSessionStatusAsync(testFactory, otherOwnedSession.AuthSessionId, AuthSessionStatuses.Active);
    }

    [Fact]
    public async Task ExpiredCurrentSessionReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var expiredSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            lifetime: TimeSpan.FromMinutes(5));
        testContext.TimeProvider.SetUtcNow(InitialTimestamp.AddMinutes(6));
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutAllRequest(expiredSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, expiredSession.RawSessionToken);
    }

    [Fact]
    public async Task RevokedCurrentSessionReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var revokedSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId);
        await RevokeSessionAsync(testFactory, testContext.TimeProvider, revokedSession);
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutAllRequest(revokedSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, revokedSession.RawSessionToken);
    }

    [Theory]
    [InlineData("disabled")]
    [InlineData("deleted")]
    public async Task UnavailableAccountBehindCurrentSessionReturnsUnauthenticatedProblem(string accountState)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId);
        await MarkAccountUnavailableAsync(testFactory, account.AuthAccountId, accountState);
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutAllRequest(currentSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, currentSession.RawSessionToken);
    }

    [Fact]
    public async Task ValidCurrentSessionRevokesAllActiveSessionsForSameAccountIncludingCurrent()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var otherAccount = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            deviceLabel: "Current device");
        var otherOwnedSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            issuedAtUtc: InitialTimestamp.AddMinutes(1),
            deviceLabel: "Second owned device");
        var otherAccountSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            otherAccount.AuthAccountId,
            issuedAtUtc: InitialTimestamp.AddMinutes(2),
            deviceLabel: "Other account device");
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutAllRequest(currentSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertNoContentAsync(response);

        await AssertRevokedBySignOutAllAsync(testFactory, currentSession.AuthSessionId);
        await AssertRevokedBySignOutAllAsync(testFactory, otherOwnedSession.AuthSessionId);
        await AssertSessionStatusAsync(testFactory, otherAccountSession.AuthSessionId, AuthSessionStatuses.Active);
    }

    [Fact]
    public async Task AfterSignOutAllOldCurrentTokenCannotCallCurrentUser()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var signOutAllRequest = CreateSignOutAllRequest(currentSession.RawSessionToken);
        using var signOutAllResponse = await client.SendAsync(signOutAllRequest);
        await AssertNoContentAsync(signOutAllResponse);

        using var currentUserRequest = CreateCurrentUserRequest(currentSession.RawSessionToken);
        using var currentUserResponse = await client.SendAsync(currentUserRequest);

        await AssertUnauthenticatedProblemAsync(currentUserResponse, currentSession.RawSessionToken);
    }

    [Fact]
    public async Task AfterSignOutAllOldCurrentTokenCannotListSessions()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var signOutAllRequest = CreateSignOutAllRequest(currentSession.RawSessionToken);
        using var signOutAllResponse = await client.SendAsync(signOutAllRequest);
        await AssertNoContentAsync(signOutAllResponse);

        using var sessionsRequest = CreateSessionListRequest(currentSession.RawSessionToken);
        using var sessionsResponse = await client.SendAsync(sessionsRequest);

        await AssertUnauthenticatedProblemAsync(sessionsResponse, currentSession.RawSessionToken);
    }

    [Fact]
    public async Task AfterSignOutAllOldCurrentTokenCannotRevokeSessions()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId);
        var otherOwnedSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            issuedAtUtc: InitialTimestamp.AddMinutes(1));
        using var client = testFactory.CreateClient();

        using var signOutAllRequest = CreateSignOutAllRequest(currentSession.RawSessionToken);
        using var signOutAllResponse = await client.SendAsync(signOutAllRequest);
        await AssertNoContentAsync(signOutAllResponse);

        using var revokeRequest = CreateSessionRevocationRequest(
            currentSession.RawSessionToken,
            otherOwnedSession.AuthSessionId);
        using var revokeResponse = await client.SendAsync(revokeRequest);

        await AssertUnauthenticatedProblemAsync(revokeResponse, currentSession.RawSessionToken);
    }

    [Fact]
    public async Task PersistenceFailureReturnsSafeServerProblemWithoutLeakingToken()
    {
        var actor = new AuthenticatedSessionActor(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            ValidationTimestamp.AddHours(1));
        var fakeSessionRuntimeService = new FakeAuthSessionRuntimeService(
            AuthSessionValidationResult.Validated(actor),
            AuthAccountSessionRevocationResult.Failure(
                AuthAccountSessionRevocationStatus.PersistenceFailed));
        var testContext = CreateFactory(fakeSessionRuntimeService);
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var request = CreateSignOutAllRequest(PersistenceFailureToken);

        using var response = await client.SendAsync(request);

        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(PersistenceFailureToken, content);
        Assert.DoesNotContain("PersistenceFailed", content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Sign-out-all failed", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(500, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("Unable to complete sign-out-all.", payload.RootElement.GetProperty("detail").GetString());

        var revocationRequest = Assert.Single(fakeSessionRuntimeService.AccountRevocationRequests);
        Assert.Equal(actor.AuthAccountId, revocationRequest.AuthAccountId);
        Assert.Equal("user_sign_out_all", revocationRequest.RevocationReason);
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

                if (sessionRuntimeService is not null)
                {
                    services.RemoveAll<IAuthSessionRuntimeService>();
                    services.AddSingleton(sessionRuntimeService);
                }
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededAccount> SeedAuthAccountAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var userProfileId = Guid.NewGuid();
        var authAccountId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Sign-Out-All Endpoint Test User",
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
        return new SeededAccount(authAccountId, userProfileId);
    }

    private static async Task<SeededSession> CreateSessionAsync(
        WebApplicationFactory<Program> testFactory,
        EndpointTestTimeProvider timeProvider,
        Guid authAccountId,
        DateTimeOffset? issuedAtUtc = null,
        TimeSpan? lifetime = null,
        string? deviceLabel = "Sign-out-all endpoint test",
        string? userAgentSummary = "Sign-out-all endpoint test user agent",
        string? networkAddressHash = "sign-out-all-endpoint-test-network")
    {
        var issuedAt = issuedAtUtc ?? InitialTimestamp;
        timeProvider.SetUtcNow(issuedAt);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                authAccountId,
                DeviceLabel: deviceLabel,
                UserAgentSummary: userAgentSummary,
                NetworkAddressHash: networkAddressHash,
                RequestedLifetime: lifetime ?? TimeSpan.FromHours(4)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededSession(
            authAccountId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            issuedAt,
            sessionCreationResult.SessionExpiresAtUtc.Value);
    }

    private static async Task RevokeSessionAsync(
        WebApplicationFactory<Program> testFactory,
        EndpointTestTimeProvider timeProvider,
        SeededSession seededSession)
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

    private static async Task<AuthSession> ReadSessionAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthSession>().SingleAsync(session => session.Id == authSessionId);
    }

    private static async Task AssertSessionStatusAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId,
        string expectedStatus)
    {
        var session = await ReadSessionAsync(testFactory, authSessionId);
        Assert.Equal(expectedStatus, session.Status);
    }

    private static async Task AssertRevokedBySignOutAllAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        var session = await ReadSessionAsync(testFactory, authSessionId);
        Assert.Equal(AuthSessionStatuses.Revoked, session.Status);
        Assert.Equal(ValidationTimestamp, session.RevokedAtUtc);
        Assert.Equal(ValidationTimestamp, session.UpdatedAtUtc);
        Assert.Equal("user_sign_out_all", session.RevocationReason);
    }

    private static HttpRequestMessage CreateSignOutAllRequest(string rawSessionToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, SignOutAllPath);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreateCurrentUserRequest(string rawSessionToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, CurrentUserPath);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreateSessionListRequest(string rawSessionToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, SessionsPath);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreateSessionRevocationRequest(
        string rawSessionToken,
        Guid sessionId)
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, $"{SessionsPath}/{sessionId:D}");
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
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

    private sealed record SeededAccount(
        Guid AuthAccountId,
        Guid UserProfileId);

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset IssuedAtUtc,
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

    private sealed class FakeAuthSessionRuntimeService : IAuthSessionRuntimeService
    {
        private readonly AuthSessionValidationResult validationResult;
        private readonly AuthAccountSessionRevocationResult accountRevocationResult;

        public FakeAuthSessionRuntimeService(
            AuthSessionValidationResult validationResult,
            AuthAccountSessionRevocationResult accountRevocationResult)
        {
            this.validationResult = validationResult;
            this.accountRevocationResult = accountRevocationResult;
        }

        public List<AuthAccountSessionRevocationRequest> AccountRevocationRequests { get; } = [];

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
            throw new NotSupportedException();
        }

        public Task<AuthAccountSessionRevocationResult> RevokeActiveSessionsForAccountAsync(
            AuthAccountSessionRevocationRequest request,
            CancellationToken cancellationToken = default)
        {
            AccountRevocationRequests.Add(request);
            return Task.FromResult(accountRevocationResult);
        }
    }
}
