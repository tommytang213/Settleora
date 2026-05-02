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

public sealed class CurrentUserEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string CurrentUserPath = "/api/v1/auth/current-user";
    private const string WrongRawToken = "visible-wrong-session-token";
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 2, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 2, 12, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset RevocationTimestamp = new(2026, 5, 2, 12, 20, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public CurrentUserEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task MissingAuthorizationHeaderReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.GetAsync(CurrentUserPath);

        await AssertUnauthenticatedProblemAsync(response);
    }

    [Fact]
    public async Task NonBearerAuthorizationHeaderReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, CurrentUserPath);
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
        using var request = new HttpRequestMessage(HttpMethod.Get, CurrentUserPath);
        request.Headers.TryAddWithoutValidation("Authorization", "Bearer ");

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response);
    }

    [Fact]
    public async Task WrongBearerTokenReturnsUnauthenticatedProblemWithoutLeakingTokenText()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreateCurrentUserRequest(WrongRawToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, WrongRawToken);
    }

    [Fact]
    public async Task MultipleAuthorizationHeadersReturnUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, CurrentUserPath);
        request.Headers.TryAddWithoutValidation("Authorization", ["Bearer first-token", "Bearer second-token"]);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response);
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
        using var request = CreateCurrentUserRequest(seededSession.RawSessionToken);

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
        using var request = CreateCurrentUserRequest(seededSession.RawSessionToken);

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
        using var request = CreateCurrentUserRequest(seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, seededSession.RawSessionToken);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("deleted")]
    public async Task UnavailableProfileBehindValidSessionReturnsUnauthenticatedProblem(string profileState)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        await MarkProfileUnavailableAsync(testFactory, seededSession.UserProfileId, profileState);
        using var client = testFactory.CreateClient();
        using var request = CreateCurrentUserRequest(seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertUnauthenticatedProblemAsync(response, seededSession.RawSessionToken);
    }

    [Fact]
    public async Task ValidSessionTokenReturnsMinimalCurrentUserResponseWithSystemRoles()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(
            testFactory,
            testContext.TimeProvider,
            roles:
            [
                SystemRoles.Admin,
                SystemRoles.User,
                SystemRoles.Owner
            ]);
        using var client = testFactory.CreateClient();
        using var request = CreateCurrentUserRequest(seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var root = payload.RootElement;

        Assert.Equal(4, root.EnumerateObject().Count());
        Assert.Equal(seededSession.AuthAccountId, root.GetProperty("authAccountId").GetGuid());

        var userProfile = root.GetProperty("userProfile");
        Assert.Equal(3, userProfile.EnumerateObject().Count());
        Assert.Equal(seededSession.UserProfileId, userProfile.GetProperty("id").GetGuid());
        Assert.Equal("Current User Test", userProfile.GetProperty("displayName").GetString());
        Assert.Equal("USD", userProfile.GetProperty("defaultCurrency").GetString());

        var session = root.GetProperty("session");
        Assert.Equal(2, session.EnumerateObject().Count());
        Assert.Equal(seededSession.AuthSessionId, session.GetProperty("id").GetGuid());
        Assert.Equal(seededSession.SessionExpiresAtUtc, session.GetProperty("expiresAtUtc").GetDateTimeOffset());

        var roles = root.GetProperty("roles").EnumerateArray()
            .Select(role => role.GetString() ?? throw new InvalidOperationException("Expected a role string."))
            .ToArray();
        Assert.Equal([SystemRoles.Owner, SystemRoles.Admin, SystemRoles.User], roles);
    }

    [Fact]
    public async Task ValidSessionResponseDoesNotExposeTokenCredentialOrAuditMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, seededSession.AuthSessionId);
        using var client = testFactory.CreateClient();
        using var request = CreateCurrentUserRequest(seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        var lowerContent = content.ToLowerInvariant();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(seededSession.RawSessionToken, content);
        Assert.DoesNotContain(sessionTokenHash, content);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("verifier", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("revoked", lowerContent);
        Assert.DoesNotContain("lastseen", lowerContent);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new CurrentUserTestTimeProvider(InitialTimestamp);
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

    private static async Task<SeededCurrentUserSession> SeedValidSessionAsync(
        WebApplicationFactory<Program> testFactory,
        CurrentUserTestTimeProvider timeProvider,
        TimeSpan? lifetime = null,
        IReadOnlyList<string>? roles = null)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Current User Test",
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

        if (roles is not null)
        {
            foreach (var role in roles)
            {
                dbContext.Set<SystemRoleAssignment>().Add(new SystemRoleAssignment
                {
                    AuthAccountId = authAccountId,
                    Role = role,
                    AssignedAtUtc = InitialTimestamp
                });
            }
        }

        await dbContext.SaveChangesAsync();

        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                authAccountId,
                DeviceLabel: "Endpoint test",
                UserAgentSummary: "Endpoint test user agent",
                NetworkAddressHash: "endpoint-test-network",
                RequestedLifetime: lifetime ?? TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededCurrentUserSession(
            authAccountId,
            userProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            sessionCreationResult.SessionExpiresAtUtc.Value);
    }

    private static async Task RevokeSessionAsync(
        WebApplicationFactory<Program> testFactory,
        CurrentUserTestTimeProvider timeProvider,
        SeededCurrentUserSession seededSession)
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

    private static async Task MarkProfileUnavailableAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId,
        string profileState)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var userProfile = await dbContext.Set<UserProfile>().SingleAsync(
            profile => profile.Id == userProfileId);

        if (profileState == "missing")
        {
            dbContext.Set<UserProfile>().Remove(userProfile);
        }
        else
        {
            userProfile.DeletedAtUtc = ValidationTimestamp;
            userProfile.UpdatedAtUtc = ValidationTimestamp;
        }

        await dbContext.SaveChangesAsync();
    }

    private static async Task<string> ReadSessionTokenHashAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthSession>()
            .Where(session => session.Id == authSessionId)
            .Select(session => session.SessionTokenHash)
            .SingleAsync();
    }

    private static HttpRequestMessage CreateCurrentUserRequest(string rawSessionToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, CurrentUserPath);
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
        CurrentUserTestTimeProvider TimeProvider);

    private sealed record SeededCurrentUserSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset SessionExpiresAtUtc);

    private sealed class CurrentUserTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public CurrentUserTestTimeProvider(DateTimeOffset utcNow)
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
