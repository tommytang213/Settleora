using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class AuthMiddlewareAuthorizationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string CurrentUserPath = "/api/v1/auth/current-user";
    private const string HealthPath = "/health";
    private const string SignInPath = "/api/v1/auth/sign-in";
    private const string RefreshPath = "/api/v1/auth/refresh";
    private const string VisibleBearerToken = "visible-anonymous-endpoint-bearer-token";
    private const string VisiblePasswordMaterial = "visible-password-material";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 3, 20, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 3, 20, 5, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public AuthMiddlewareAuthorizationTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task ValidBearerTokenAuthenticatesCurrentActorAndRolePoliciesFromSystemRoleAssignments()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(
            testFactory,
            testContext.TimeProvider,
            roles:
            [
                SystemRoles.User,
                SystemRoles.Owner
            ]);

        using var scope = testFactory.Services.CreateScope();
        var httpContext = new DefaultHttpContext
        {
            RequestServices = scope.ServiceProvider
        };
        httpContext.Request.Headers.Authorization = $"Bearer {seededSession.RawSessionToken}";

        var authenticationService = scope.ServiceProvider.GetRequiredService<IAuthenticationService>();
        var authenticationResult = await authenticationService.AuthenticateAsync(
            httpContext,
            SettleoraSessionAuthenticationDefaults.AuthenticationScheme);

        Assert.True(authenticationResult.Succeeded);
        Assert.NotNull(authenticationResult.Principal);
        httpContext.User = authenticationResult.Principal!;
        scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext = httpContext;

        var actorAccessor = scope.ServiceProvider.GetRequiredService<ICurrentActorAccessor>();
        Assert.True(actorAccessor.TryGetCurrentActor(out var actor));
        Assert.Equal(seededSession.AuthAccountId, actor.AuthAccountId);
        Assert.Equal(seededSession.UserProfileId, actor.UserProfileId);
        Assert.Equal(seededSession.AuthSessionId, actor.AuthSessionId);
        Assert.Equal(seededSession.SessionExpiresAtUtc, actor.SessionExpiresAtUtc);
        Assert.Equal([SystemRoles.Owner, SystemRoles.User], actor.SystemRoles);

        var roleClaims = httpContext.User.FindAll(ClaimTypes.Role)
            .Select(claim => claim.Value)
            .ToArray();
        Assert.Equal([SystemRoles.Owner, SystemRoles.User], roleClaims);

        var authorizationService = scope.ServiceProvider.GetRequiredService<IAuthorizationService>();
        Assert.True((await authorizationService.AuthorizeAsync(
            httpContext.User,
            resource: null,
            SettleoraAuthorizationPolicies.AuthenticatedUser)).Succeeded);
        Assert.True((await authorizationService.AuthorizeAsync(
            httpContext.User,
            resource: null,
            SettleoraAuthorizationPolicies.SystemRoleOwner)).Succeeded);
        Assert.False((await authorizationService.AuthorizeAsync(
            httpContext.User,
            resource: null,
            SettleoraAuthorizationPolicies.SystemRoleAdmin)).Succeeded);
        Assert.True((await authorizationService.AuthorizeAsync(
            httpContext.User,
            resource: null,
            SettleoraAuthorizationPolicies.SystemRoleOwnerOrAdmin)).Succeeded);
        Assert.True((await authorizationService.AuthorizeAsync(
            httpContext.User,
            resource: null,
            SettleoraAuthorizationPolicies.SystemRoleUser)).Succeeded);

        var allClaimValues = httpContext.User.Claims.Select(claim => claim.Value).ToArray();
        Assert.DoesNotContain(seededSession.RawSessionToken, allClaimValues);
        Assert.DoesNotContain(seededSession.SessionTokenHash, allClaimValues);
        Assert.DoesNotContain(VisiblePasswordMaterial, allClaimValues);
    }

    [Fact]
    public async Task ProtectedEndpointChallengesUniformlyWithoutLeakingMalformedOrInvalidBearerMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, CurrentUserPath);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {VisibleBearerToken}");

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(VisibleBearerToken, content);
        Assert.DoesNotContain("SessionUnavailable", content);
        Assert.DoesNotContain("token", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("hash", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("password", content, StringComparison.OrdinalIgnoreCase);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Authentication is required to access this resource.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task HealthSignInAndRefreshRemainAnonymousAndDoNotValidateBearerSessions()
    {
        var recordingSessionRuntimeService = new RecordingAuthSessionRuntimeService();
        var testContext = CreateFactory(recordingSessionRuntimeService);
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var healthRequest = CreateBearerRequest(HttpMethod.Get, HealthPath);
        using var healthResponse = await client.SendAsync(healthRequest);
        Assert.Equal(HttpStatusCode.OK, healthResponse.StatusCode);

        using var signInRequest = CreateBearerRequest(HttpMethod.Post, SignInPath);
        signInRequest.Content = new StringContent("not-json", Encoding.UTF8, "text/plain");
        using var signInResponse = await client.SendAsync(signInRequest);
        await AssertProblemTitleAsync(signInResponse, HttpStatusCode.Unauthorized, "Sign-in failed");

        using var refreshRequest = CreateBearerRequest(HttpMethod.Post, RefreshPath);
        refreshRequest.Content = new StringContent("not-json", Encoding.UTF8, "text/plain");
        using var refreshResponse = await client.SendAsync(refreshRequest);
        await AssertProblemTitleAsync(refreshResponse, HttpStatusCode.Unauthorized, "Refresh failed");

        Assert.Empty(recordingSessionRuntimeService.ValidationTokens);
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

    private static async Task<SeededSession> SeedValidSessionAsync(
        WebApplicationFactory<Program> testFactory,
        EndpointTestTimeProvider timeProvider,
        IReadOnlyList<string> roles)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Auth Middleware Test User",
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

        foreach (var role in roles)
        {
            dbContext.Set<SystemRoleAssignment>().Add(new SystemRoleAssignment
            {
                AuthAccountId = authAccountId,
                Role = role,
                AssignedAtUtc = InitialTimestamp
            });
        }

        await dbContext.SaveChangesAsync();

        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                authAccountId,
                DeviceLabel: "Auth middleware test",
                UserAgentSummary: "Auth middleware test user agent",
                NetworkAddressHash: "auth-middleware-test-network",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        var sessionTokenHash = await dbContext.Set<AuthSession>()
            .Where(session => session.Id == sessionCreationResult.AuthSessionId.Value)
            .Select(session => session.SessionTokenHash)
            .SingleAsync();

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededSession(
            authAccountId,
            userProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            sessionCreationResult.SessionExpiresAtUtc.Value,
            sessionTokenHash);
    }

    private static HttpRequestMessage CreateBearerRequest(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {VisibleBearerToken}");
        return request;
    }

    private static async Task AssertProblemTitleAsync(
        HttpResponseMessage response,
        HttpStatusCode expectedStatusCode,
        string expectedTitle)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(expectedStatusCode, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain(VisibleBearerToken, content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal(expectedTitle, payload.RootElement.GetProperty("title").GetString());
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        EndpointTestTimeProvider TimeProvider);

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset SessionExpiresAtUtc,
        string SessionTokenHash);

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

    private sealed class RecordingAuthSessionRuntimeService : IAuthSessionRuntimeService
    {
        public List<string?> ValidationTokens { get; } = [];

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
            return Task.FromResult(AuthSessionValidationResult.Failure(
                AuthSessionValidationStatus.SessionUnavailable));
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
            throw new NotSupportedException();
        }
    }
}
