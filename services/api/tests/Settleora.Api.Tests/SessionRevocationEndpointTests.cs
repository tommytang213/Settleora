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

public sealed class SessionRevocationEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string SessionsPath = "/api/v1/auth/sessions";
    private const string CurrentUserPath = "/api/v1/auth/current-user";
    private const string WrongRawToken = "visible-wrong-session-token";
    private const string PersistenceFailureToken = "visible-persistence-failure-token";
    private const string TargetRefreshHash = "visible-target-refresh-token-hash";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 3, 16, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset RevocationTimestamp = new(2026, 5, 3, 16, 10, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 3, 16, 20, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public SessionRevocationEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task MissingAuthorizationHeaderReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.DeleteAsync(CreateSessionRevocationPath(Guid.NewGuid()));

        await AssertUnauthenticatedProblemAsync(response);
    }

    [Fact]
    public async Task NonBearerAuthorizationHeaderReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Delete, CreateSessionRevocationPath(Guid.NewGuid()));
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
        using var request = new HttpRequestMessage(HttpMethod.Delete, CreateSessionRevocationPath(Guid.NewGuid()));
        request.Headers.TryAddWithoutValidation("Authorization", "Bearer ");

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response);
    }

    [Fact]
    public async Task WrongBearerTokenReturnsUnauthenticatedProblemWithoutLeakingTokenText()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var targetSession = await CreateSessionAsync(testFactory, testContext.TimeProvider, account.AuthAccountId);
        using var client = testFactory.CreateClient();
        using var request = CreateSessionRevocationRequest(WrongRawToken, targetSession.AuthSessionId);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, WrongRawToken);
        await AssertSessionStatusAsync(testFactory, targetSession.AuthSessionId, AuthSessionStatuses.Active);
    }

    [Fact]
    public async Task ExpiredCurrentSessionTokenReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            lifetime: TimeSpan.FromMinutes(5));
        testContext.TimeProvider.SetUtcNow(InitialTimestamp.AddMinutes(6));
        using var client = testFactory.CreateClient();
        using var request = CreateSessionRevocationRequest(
            currentSession.RawSessionToken,
            currentSession.AuthSessionId);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, currentSession.RawSessionToken);
    }

    [Fact]
    public async Task RevokedCurrentSessionTokenReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(testFactory, testContext.TimeProvider, account.AuthAccountId);
        await RevokeSessionAsync(testFactory, testContext.TimeProvider, currentSession);
        using var client = testFactory.CreateClient();
        using var request = CreateSessionRevocationRequest(
            currentSession.RawSessionToken,
            currentSession.AuthSessionId);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, currentSession.RawSessionToken);
    }

    [Theory]
    [InlineData("disabled")]
    [InlineData("deleted")]
    public async Task UnavailableAccountBehindCurrentSessionReturnsUnauthenticatedProblem(string accountState)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(testFactory, testContext.TimeProvider, account.AuthAccountId);
        await MarkAccountUnavailableAsync(testFactory, account.AuthAccountId, accountState);
        using var client = testFactory.CreateClient();
        using var request = CreateSessionRevocationRequest(
            currentSession.RawSessionToken,
            currentSession.AuthSessionId);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, currentSession.RawSessionToken);
    }

    [Fact]
    public async Task ValidCurrentSessionCanRevokeAnotherOwnedActiveSession()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(testFactory, testContext.TimeProvider, account.AuthAccountId);
        var targetSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            issuedAtUtc: InitialTimestamp.AddMinutes(1),
            deviceLabel: "Target owned device");
        using var client = testFactory.CreateClient();
        using var request = CreateSessionRevocationRequest(
            currentSession.RawSessionToken,
            targetSession.AuthSessionId);

        using var response = await client.SendAsync(request);

        await AssertNoContentAsync(response);

        var session = await ReadSessionAsync(testFactory, targetSession.AuthSessionId);
        Assert.Equal(AuthSessionStatuses.Revoked, session.Status);
        Assert.Equal(ValidationTimestamp, session.RevokedAtUtc);
        Assert.Equal(ValidationTimestamp, session.UpdatedAtUtc);
        Assert.Equal("user_session_revoke", session.RevocationReason);
    }

    [Fact]
    public async Task RevokedTargetDisappearsFromCurrentAccountSessionList()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(testFactory, testContext.TimeProvider, account.AuthAccountId);
        var targetSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            issuedAtUtc: InitialTimestamp.AddMinutes(1));
        using var client = testFactory.CreateClient();

        using var revokeRequest = CreateSessionRevocationRequest(
            currentSession.RawSessionToken,
            targetSession.AuthSessionId);
        using var revokeResponse = await client.SendAsync(revokeRequest);
        await AssertNoContentAsync(revokeResponse);

        using var listRequest = CreateSessionListRequest(currentSession.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);

        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        await using var responseStream = await listResponse.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var sessionIds = payload.RootElement.GetProperty("sessions").EnumerateArray()
            .Select(session => session.GetProperty("id").GetGuid())
            .ToArray();

        Assert.Contains(currentSession.AuthSessionId, sessionIds);
        Assert.DoesNotContain(targetSession.AuthSessionId, sessionIds);
    }

    [Fact]
    public async Task OtherAccountSessionCannotBeRevokedAndRemainsActive()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var otherAccount = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(testFactory, testContext.TimeProvider, account.AuthAccountId);
        var otherAccountSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            otherAccount.AuthAccountId);
        using var client = testFactory.CreateClient();
        using var request = CreateSessionRevocationRequest(
            currentSession.RawSessionToken,
            otherAccountSession.AuthSessionId);

        using var response = await client.SendAsync(request);

        await AssertSessionUnavailableProblemAsync(response);
        await AssertSessionStatusAsync(testFactory, otherAccountSession.AuthSessionId, AuthSessionStatuses.Active);
    }

    [Fact]
    public async Task MissingRandomSessionIdReturnsSafeUnavailableProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(testFactory, testContext.TimeProvider, account.AuthAccountId);
        var randomSessionId = Guid.NewGuid();
        using var client = testFactory.CreateClient();
        using var request = CreateSessionRevocationRequest(currentSession.RawSessionToken, randomSessionId);

        using var response = await client.SendAsync(request);

        await AssertSessionUnavailableProblemAsync(response);
    }

    [Fact]
    public async Task AlreadyRevokedTargetReturnsSafeUnavailableProblemAndDoesNotMutateTarget()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(testFactory, testContext.TimeProvider, account.AuthAccountId);
        var targetSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            issuedAtUtc: InitialTimestamp.AddMinutes(1));
        await RevokeSessionAsync(testFactory, testContext.TimeProvider, targetSession);
        var previousSession = await ReadSessionAsync(testFactory, targetSession.AuthSessionId);
        using var client = testFactory.CreateClient();
        using var request = CreateSessionRevocationRequest(
            currentSession.RawSessionToken,
            targetSession.AuthSessionId);

        using var response = await client.SendAsync(request);

        var content = await response.Content.ReadAsStringAsync();
        await AssertSessionUnavailableProblemAsync(response, content);
        Assert.DoesNotContain("revoked", content, StringComparison.OrdinalIgnoreCase);

        var session = await ReadSessionAsync(testFactory, targetSession.AuthSessionId);
        Assert.Equal(AuthSessionStatuses.Revoked, session.Status);
        Assert.Equal(previousSession.RevokedAtUtc, session.RevokedAtUtc);
        Assert.Equal(previousSession.UpdatedAtUtc, session.UpdatedAtUtc);
        Assert.Equal("endpoint_test_revocation", session.RevocationReason);
    }

    [Fact]
    public async Task InactiveTargetReturnsSafeUnavailableProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(testFactory, testContext.TimeProvider, account.AuthAccountId);
        var targetSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            issuedAtUtc: InitialTimestamp.AddMinutes(1));
        await MarkSessionExpiredAsync(testFactory, targetSession.AuthSessionId);
        using var client = testFactory.CreateClient();
        using var request = CreateSessionRevocationRequest(
            currentSession.RawSessionToken,
            targetSession.AuthSessionId);

        using var response = await client.SendAsync(request);

        await AssertSessionUnavailableProblemAsync(response);
        await AssertSessionStatusAsync(testFactory, targetSession.AuthSessionId, AuthSessionStatuses.Expired);
    }

    [Fact]
    public async Task CurrentSessionCanBeRevokedThroughSessionRevocationEndpoint()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(testFactory, testContext.TimeProvider, account.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var revokeRequest = CreateSessionRevocationRequest(
            currentSession.RawSessionToken,
            currentSession.AuthSessionId);
        using var revokeResponse = await client.SendAsync(revokeRequest);
        await AssertNoContentAsync(revokeResponse);

        var session = await ReadSessionAsync(testFactory, currentSession.AuthSessionId);
        Assert.Equal(AuthSessionStatuses.Revoked, session.Status);
        Assert.Equal("user_session_revoke", session.RevocationReason);

        using var currentUserRequest = CreateCurrentUserRequest(currentSession.RawSessionToken);
        using var currentUserResponse = await client.SendAsync(currentUserRequest);
        await AssertUnauthenticatedProblemAsync(currentUserResponse, currentSession.RawSessionToken);
    }

    [Fact]
    public async Task TargetFailureResponseDoesNotExposeSensitiveOrOwnershipMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var otherAccount = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(testFactory, testContext.TimeProvider, account.AuthAccountId);
        var targetSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            otherAccount.AuthAccountId,
            userAgentSummary: "visible-target-user-agent-summary",
            networkAddressHash: "visible-target-network-address-hash");
        var target = await ReadSessionAsync(testFactory, targetSession.AuthSessionId);
        target.RefreshTokenHash = TargetRefreshHash;
        await SaveSessionAsync(testFactory, target);
        using var client = testFactory.CreateClient();
        using var request = CreateSessionRevocationRequest(
            currentSession.RawSessionToken,
            targetSession.AuthSessionId);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        await AssertSessionUnavailableProblemAsync(response, content);
        AssertFailureDoesNotLeakSensitiveMaterial(
            content,
            currentSession.RawSessionToken,
            targetSession.RawSessionToken,
            target.SessionTokenHash,
            TargetRefreshHash,
            targetSession.AuthSessionId.ToString());
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
            AuthSessionRevocationResult.Failure(
                AuthSessionRevocationStatus.PersistenceFailed,
                Guid.NewGuid()));
        var testContext = CreateFactory(fakeSessionRuntimeService);
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var request = CreateSessionRevocationRequest(PersistenceFailureToken, Guid.NewGuid());

        using var response = await client.SendAsync(request);

        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(PersistenceFailureToken, content);
        Assert.DoesNotContain("PersistenceFailed", content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Session revocation failed", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(500, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("Unable to complete session revocation.", payload.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task InvalidSessionIdRouteDoesNotHitEndpointAndReturnsNotFound()
    {
        var actor = new AuthenticatedSessionActor(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            ValidationTimestamp.AddHours(1));
        var fakeSessionRuntimeService = new FakeAuthSessionRuntimeService(
            AuthSessionValidationResult.Validated(actor),
            AuthSessionRevocationResult.Revoked(Guid.NewGuid()));
        var testContext = CreateFactory(fakeSessionRuntimeService);
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Delete, $"{SessionsPath}/not-a-guid");
        request.Headers.TryAddWithoutValidation("Authorization", "Bearer visible-route-token");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Empty(fakeSessionRuntimeService.ValidationTokens);
        Assert.Empty(fakeSessionRuntimeService.RevocationRequests);
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
            DisplayName = "Session Revocation Endpoint Test User",
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
        string? deviceLabel = "Session revocation endpoint test",
        string? userAgentSummary = "Session revocation endpoint test user agent",
        string? networkAddressHash = "session-revocation-endpoint-test-network")
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

    private static async Task MarkSessionExpiredAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        var session = await ReadSessionAsync(testFactory, authSessionId);
        session.Status = AuthSessionStatuses.Expired;
        session.UpdatedAtUtc = ValidationTimestamp;
        await SaveSessionAsync(testFactory, session);
    }

    private static async Task<AuthSession> ReadSessionAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthSession>().SingleAsync(session => session.Id == authSessionId);
    }

    private static async Task SaveSessionAsync(
        WebApplicationFactory<Program> testFactory,
        AuthSession session)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        dbContext.Set<AuthSession>().Update(session);
        await dbContext.SaveChangesAsync();
    }

    private static async Task AssertSessionStatusAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId,
        string expectedStatus)
    {
        var session = await ReadSessionAsync(testFactory, authSessionId);
        Assert.Equal(expectedStatus, session.Status);
    }

    private static HttpRequestMessage CreateSessionRevocationRequest(
        string rawSessionToken,
        Guid sessionId)
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, CreateSessionRevocationPath(sessionId));
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreateSessionListRequest(string rawSessionToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, SessionsPath);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreateCurrentUserRequest(string rawSessionToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, CurrentUserPath);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static string CreateSessionRevocationPath(Guid sessionId)
    {
        return $"{SessionsPath}/{sessionId:D}";
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

    private static async Task AssertSessionUnavailableProblemAsync(
        HttpResponseMessage response,
        string? content = null)
    {
        content ??= await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("revoked", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("inactive", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("owned", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("belongs", content, StringComparison.OrdinalIgnoreCase);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Session unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("The requested session is unavailable.", payload.RootElement.GetProperty("detail").GetString());
    }

    private static void AssertFailureDoesNotLeakSensitiveMaterial(
        string content,
        params string[] unexpectedValues)
    {
        var lowerContent = content.ToLowerInvariant();

        foreach (var unexpectedValue in unexpectedValues)
        {
            Assert.DoesNotContain(unexpectedValue, content);
        }

        Assert.DoesNotContain("refresh", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("verifier", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("source", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("user-agent", lowerContent);
        Assert.DoesNotContain("network", lowerContent);
        Assert.DoesNotContain("owner", lowerContent);
        Assert.DoesNotContain("owned", lowerContent);
        Assert.DoesNotContain("belongs", lowerContent);
        Assert.DoesNotContain("account", lowerContent);
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
        private readonly AuthSessionRevocationResult revocationResult;

        public FakeAuthSessionRuntimeService(
            AuthSessionValidationResult validationResult,
            AuthSessionRevocationResult revocationResult)
        {
            this.validationResult = validationResult;
            this.revocationResult = revocationResult;
        }

        public List<string?> ValidationTokens { get; } = [];

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
            ValidationTokens.Add(rawSessionToken);
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
