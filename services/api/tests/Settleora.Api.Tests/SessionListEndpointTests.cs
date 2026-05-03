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

public sealed class SessionListEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string SessionsPath = "/api/v1/auth/sessions";
    private const string WrongRawToken = "visible-wrong-session-token";
    private const int ExpectedSessionListCap = 50;
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 3, 14, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset RevocationTimestamp = new(2026, 5, 3, 14, 30, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 3, 15, 30, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public SessionListEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task MissingAuthorizationHeaderReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.GetAsync(SessionsPath);

        await AssertUnauthenticatedProblemAsync(response);
    }

    [Fact]
    public async Task NonBearerAuthorizationHeaderReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, SessionsPath);
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
        using var request = new HttpRequestMessage(HttpMethod.Get, SessionsPath);
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
        await CreateSessionAsync(testFactory, testContext.TimeProvider, account.AuthAccountId);
        using var client = testFactory.CreateClient();
        using var request = CreateSessionListRequest(WrongRawToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, WrongRawToken);
    }

    [Fact]
    public async Task ExpiredSessionTokenReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var expiredSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            lifetime: TimeSpan.FromMinutes(5));
        testContext.TimeProvider.SetUtcNow(ValidationTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateSessionListRequest(expiredSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, expiredSession.RawSessionToken);
    }

    [Fact]
    public async Task RevokedSessionTokenReturnsUnauthenticatedProblem()
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
        using var request = CreateSessionListRequest(revokedSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, revokedSession.RawSessionToken);
    }

    [Theory]
    [InlineData("disabled")]
    [InlineData("deleted")]
    public async Task UnavailableAccountBehindValidSessionReturnsUnauthenticatedProblem(string accountState)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var session = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId);
        await MarkAccountUnavailableAsync(testFactory, account.AuthAccountId, accountState);
        using var client = testFactory.CreateClient();
        using var request = CreateSessionListRequest(session.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, session.RawSessionToken);
    }

    [Fact]
    public async Task ValidSessionReturnsOnlyAuthenticatedAccountActiveSessionsAndMarksCurrent()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
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
        var otherAccount = await SeedAuthAccountAsync(testFactory);
        var unrelatedSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            otherAccount.AuthAccountId,
            issuedAtUtc: InitialTimestamp.AddMinutes(2),
            deviceLabel: "Other account device");
        using var client = testFactory.CreateClient();
        using var request = CreateSessionListRequest(currentSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var root = payload.RootElement;

        Assert.Equal("sessions", Assert.Single(root.EnumerateObject()).Name);
        var sessions = root.GetProperty("sessions").EnumerateArray().ToArray();
        Assert.Equal(2, sessions.Length);
        Assert.Contains(sessions, session => session.GetProperty("id").GetGuid() == currentSession.AuthSessionId);
        Assert.Contains(sessions, session => session.GetProperty("id").GetGuid() == otherOwnedSession.AuthSessionId);
        Assert.DoesNotContain(sessions, session => session.GetProperty("id").GetGuid() == unrelatedSession.AuthSessionId);

        var currentSessionResponse = sessions.Single(
            session => session.GetProperty("id").GetGuid() == currentSession.AuthSessionId);
        Assert.True(currentSessionResponse.GetProperty("isCurrent").GetBoolean());
        Assert.Equal(AuthSessionStatuses.Active, currentSessionResponse.GetProperty("status").GetString());
        Assert.Equal(currentSession.IssuedAtUtc, currentSessionResponse.GetProperty("issuedAtUtc").GetDateTimeOffset());
        Assert.Equal(currentSession.SessionExpiresAtUtc, currentSessionResponse.GetProperty("expiresAtUtc").GetDateTimeOffset());
        Assert.Equal(ValidationTimestamp, currentSessionResponse.GetProperty("lastSeenAtUtc").GetDateTimeOffset());
        Assert.Equal("Current device", currentSessionResponse.GetProperty("deviceLabel").GetString());

        var otherOwnedSessionResponse = sessions.Single(
            session => session.GetProperty("id").GetGuid() == otherOwnedSession.AuthSessionId);
        Assert.False(otherOwnedSessionResponse.GetProperty("isCurrent").GetBoolean());
    }

    [Fact]
    public async Task ExpiredAndRevokedSessionsAreExcludedFromValidList()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            deviceLabel: "Current active device");
        var activeSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            issuedAtUtc: InitialTimestamp.AddMinutes(1),
            deviceLabel: "Other active device");
        var expiredSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            issuedAtUtc: InitialTimestamp.AddMinutes(2),
            lifetime: TimeSpan.FromMinutes(5),
            deviceLabel: "Expired device");
        var revokedSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            issuedAtUtc: InitialTimestamp.AddMinutes(3),
            deviceLabel: "Revoked device");
        await RevokeSessionAsync(testFactory, testContext.TimeProvider, revokedSession);
        using var client = testFactory.CreateClient();
        using var request = CreateSessionListRequest(currentSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var sessionIds = payload.RootElement.GetProperty("sessions").EnumerateArray()
            .Select(session => session.GetProperty("id").GetGuid())
            .ToArray();

        Assert.Contains(currentSession.AuthSessionId, sessionIds);
        Assert.Contains(activeSession.AuthSessionId, sessionIds);
        Assert.DoesNotContain(expiredSession.AuthSessionId, sessionIds);
        Assert.DoesNotContain(revokedSession.AuthSessionId, sessionIds);
    }

    [Fact]
    public async Task SessionListIsCappedAndStillIncludesCurrentSession()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        SeededSession? currentSession = null;

        for (var index = 0; index < 55; index++)
        {
            var session = await CreateSessionAsync(
                testFactory,
                testContext.TimeProvider,
                account.AuthAccountId,
                issuedAtUtc: InitialTimestamp.AddMinutes(index),
                lifetime: TimeSpan.FromHours(4),
                deviceLabel: $"Device {index:00}");
            currentSession ??= session;
        }

        Assert.NotNull(currentSession);
        using var client = testFactory.CreateClient();
        using var request = CreateSessionListRequest(currentSession!.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var sessions = payload.RootElement.GetProperty("sessions").EnumerateArray().ToArray();

        Assert.Equal(ExpectedSessionListCap, sessions.Length);
        Assert.Contains(
            sessions,
            session => session.GetProperty("id").GetGuid() == currentSession.AuthSessionId
                && session.GetProperty("isCurrent").GetBoolean());
    }

    [Fact]
    public async Task SessionListResponseDoesNotExposeSecretOrOperationalSessionMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var account = await SeedAuthAccountAsync(testFactory);
        var currentSession = await CreateSessionAsync(
            testFactory,
            testContext.TimeProvider,
            account.AuthAccountId,
            deviceLabel: "Visible safe device label",
            userAgentSummary: "visible-user-agent-summary",
            networkAddressHash: "visible-network-address-hash");
        var session = await ReadSessionAsync(testFactory, currentSession.AuthSessionId);
        session.RefreshTokenHash = "visible-refresh-token-hash";
        await SaveSessionAsync(testFactory, session);
        using var client = testFactory.CreateClient();
        using var request = CreateSessionListRequest(currentSession.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        var lowerContent = content.ToLowerInvariant();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(currentSession.RawSessionToken, content);
        Assert.DoesNotContain(session.SessionTokenHash, content);
        Assert.DoesNotContain("visible-refresh-token-hash", content);
        Assert.DoesNotContain("visible-user-agent-summary", content);
        Assert.DoesNotContain("visible-network-address-hash", content);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("useragent", lowerContent);
        Assert.DoesNotContain("network", lowerContent);
        Assert.DoesNotContain("revocation", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("source", lowerContent);

        using var payload = JsonDocument.Parse(content);
        var sessionResponse = payload.RootElement.GetProperty("sessions").EnumerateArray().Single();
        Assert.Equal(7, sessionResponse.EnumerateObject().Count());
        Assert.True(sessionResponse.TryGetProperty("id", out _));
        Assert.True(sessionResponse.TryGetProperty("isCurrent", out _));
        Assert.True(sessionResponse.TryGetProperty("status", out _));
        Assert.True(sessionResponse.TryGetProperty("issuedAtUtc", out _));
        Assert.True(sessionResponse.TryGetProperty("expiresAtUtc", out _));
        Assert.True(sessionResponse.TryGetProperty("lastSeenAtUtc", out _));
        Assert.True(sessionResponse.TryGetProperty("deviceLabel", out _));
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
            DisplayName = "Session List Endpoint Test User",
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
        string? deviceLabel = "Session list endpoint test",
        string? userAgentSummary = "Session list endpoint test user agent",
        string? networkAddressHash = "session-list-endpoint-test-network")
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

    private static async Task SaveSessionAsync(
        WebApplicationFactory<Program> testFactory,
        AuthSession session)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        dbContext.Set<AuthSession>().Update(session);
        await dbContext.SaveChangesAsync();
    }

    private static HttpRequestMessage CreateSessionListRequest(string rawSessionToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, SessionsPath);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
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
}
