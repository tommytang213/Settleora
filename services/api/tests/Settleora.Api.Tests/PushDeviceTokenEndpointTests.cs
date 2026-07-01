using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Users;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class PushDeviceTokenEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string CurrentTokenPath = "/api/v1/me/push-devices/current-token";
    private const string CurrentSessionPath = "/api/v1/me/push-devices/current-session";
    private const string RawTokenOne = "dummy-token-for-redaction-test-one";
    private const string RawTokenTwo = "dummy-token-for-redaction-test-two";
    private const string DeviceInstallationId = "test-installation-id";
    private const string WrongRawBearer = "visible-wrong-push-token-session";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 7, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 7, 1, 12, 5, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 7, 1, 12, 10, 0, TimeSpan.Zero);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly WebApplicationFactory<Program> factory;

    public PushDeviceTokenEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task PushTokenEndpointsRequireBearerSessionAndDoNotLeakRejectedBearerMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var missingRegisterResponse = await client.PutAsync(
            CurrentTokenPath,
            JsonContent(RegisterBody(RawTokenOne)));
        await AssertUnauthenticatedProblemAsync(missingRegisterResponse);

        using var invalidRegisterRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            CurrentTokenPath,
            WrongRawBearer,
            RegisterBody(RawTokenOne));
        using var invalidRegisterResponse = await client.SendAsync(invalidRegisterRequest);
        await AssertUnauthenticatedProblemAsync(invalidRegisterResponse, WrongRawBearer);

        using var invalidRevokeRequest = CreateJsonBearerRequest(
            HttpMethod.Delete,
            CurrentTokenPath,
            WrongRawBearer,
            RevokeBody(RawTokenOne));
        using var invalidRevokeResponse = await client.SendAsync(invalidRevokeRequest);
        await AssertUnauthenticatedProblemAsync(invalidRevokeResponse, WrongRawBearer);
    }

    [Fact]
    public async Task RegisterCurrentTokenStoresProtectedMaterialAndReturnsOnlySafeMetadata()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Push Token Actor");
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var request = CreateJsonBearerRequest(
            HttpMethod.Put,
            CurrentTokenPath,
            actor.RawSessionToken,
            RegisterBody(RawTokenOne));
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafePushTokenResponseContent(content);
        using var payload = JsonDocument.Parse(content);
        var tokenId = payload.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("ios", payload.RootElement.GetProperty("platform").GetString());
        Assert.Equal("apns", payload.RootElement.GetProperty("provider").GetString());
        Assert.Equal("production", payload.RootElement.GetProperty("appBuildEnvironment").GetString());
        Assert.Equal(PushDeviceTokenStatuses.Active, payload.RootElement.GetProperty("status").GetString());
        Assert.False(payload.RootElement.GetProperty("replacedPriorToken").GetBoolean());

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var token = await dbContext.Set<PushDeviceToken>().SingleAsync();
        Assert.Equal(tokenId, token.Id);
        Assert.Equal(actor.AuthAccountId, token.AuthAccountId);
        Assert.Equal(actor.UserProfileId, token.UserProfileId);
        Assert.Equal(actor.AuthSessionId, token.AuthSessionId);
        Assert.Equal(PushDeviceTokenStatuses.Active, token.Status);
        Assert.Equal(WriteTimestamp, token.RegisteredAtUtc);
        Assert.NotEqual(RawTokenOne, token.ProtectedTokenBlob);
        Assert.DoesNotContain(RawTokenOne, token.ProtectedTokenBlob, StringComparison.Ordinal);
        Assert.StartsWith("hmac-sha256:", token.TokenFingerprint, StringComparison.Ordinal);
        Assert.DoesNotContain(RawTokenOne, token.TokenFingerprint, StringComparison.Ordinal);
        Assert.DoesNotContain(DeviceInstallationId, token.DeviceInstallationHash, StringComparison.Ordinal);

        var protector = scope.ServiceProvider.GetRequiredService<IPushTokenProtector>();
        Assert.Equal(RawTokenOne, protector.Unprotect(token.ProtectedTokenBlob));
        Assert.Empty(await dbContext.Set<NotificationDeliveryAttempt>().ToListAsync());
    }

    [Fact]
    public async Task RegisterCurrentTokenIsIdempotentByCurrentUserDeviceAndFingerprint()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Push Token Idempotent Actor");
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var firstRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            CurrentTokenPath,
            actor.RawSessionToken,
            RegisterBody(RawTokenOne, permissionState: "authorized"));
        using var firstResponse = await client.SendAsync(firstRequest);
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(5));
        using var secondRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            CurrentTokenPath,
            actor.RawSessionToken,
            RegisterBody(RawTokenOne, permissionState: "provisional"));
        using var secondResponse = await client.SendAsync(secondRequest);
        var secondContent = await secondResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
        AssertSafePushTokenResponseContent(secondContent);
        using var secondPayload = JsonDocument.Parse(secondContent);
        Assert.False(secondPayload.RootElement.GetProperty("replacedPriorToken").GetBoolean());

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var token = await dbContext.Set<PushDeviceToken>().SingleAsync();
        Assert.Equal("provisional", token.PermissionState);
        Assert.Equal(WriteTimestamp.AddMinutes(5), token.LastSeenAtUtc);
        Assert.Equal(PushDeviceTokenStatuses.Active, token.Status);
    }

    [Fact]
    public async Task RegisterCurrentTokenSupersedesPriorCurrentDeviceTokenWithoutPlaintextExposure()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Push Token Rotation Actor");
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var firstRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            CurrentTokenPath,
            actor.RawSessionToken,
            RegisterBody(RawTokenOne));
        using var firstResponse = await client.SendAsync(firstRequest);
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(10));
        using var secondRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            CurrentTokenPath,
            actor.RawSessionToken,
            RegisterBody(RawTokenTwo));
        using var secondResponse = await client.SendAsync(secondRequest);
        var secondContent = await secondResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
        AssertSafePushTokenResponseContent(secondContent);
        using var secondPayload = JsonDocument.Parse(secondContent);
        Assert.True(secondPayload.RootElement.GetProperty("replacedPriorToken").GetBoolean());

        using var scope = testFactory.Services.CreateScope();
        var tokens = await scope.ServiceProvider
            .GetRequiredService<SettleoraDbContext>()
            .Set<PushDeviceToken>()
            .OrderBy(token => token.RegisteredAtUtc)
            .ToListAsync();
        Assert.Equal(2, tokens.Count);
        Assert.Equal(PushDeviceTokenStatuses.Superseded, tokens[0].Status);
        Assert.Equal(WriteTimestamp.AddMinutes(10), tokens[0].SupersededAtUtc);
        Assert.Equal(PushDeviceTokenStatuses.Active, tokens[1].Status);
        Assert.DoesNotContain(RawTokenOne, tokens[0].ProtectedTokenBlob, StringComparison.Ordinal);
        Assert.DoesNotContain(RawTokenTwo, tokens[1].ProtectedTokenBlob, StringComparison.Ordinal);
    }

    [Fact]
    public async Task RevokeCurrentTokenAndCurrentSessionAreIdempotentAndScopedToCurrentActor()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Push Token Revoke Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Push Token Other Actor");
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var registerRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            CurrentTokenPath,
            actor.RawSessionToken,
            RegisterBody(RawTokenOne));
        using var registerResponse = await client.SendAsync(registerRequest);
        Assert.Equal(HttpStatusCode.OK, registerResponse.StatusCode);

        using var otherRegisterRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            CurrentTokenPath,
            other.RawSessionToken,
            RegisterBody(RawTokenTwo, deviceInstallationId: "other-installation-id"));
        using var otherRegisterResponse = await client.SendAsync(otherRegisterRequest);
        Assert.Equal(HttpStatusCode.OK, otherRegisterResponse.StatusCode);

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(10));
        using var revokeRequest = CreateJsonBearerRequest(
            HttpMethod.Delete,
            CurrentTokenPath,
            actor.RawSessionToken,
            RevokeBody(RawTokenOne));
        using var revokeResponse = await client.SendAsync(revokeRequest);
        Assert.Equal(HttpStatusCode.NoContent, revokeResponse.StatusCode);

        using var duplicateRevokeRequest = CreateJsonBearerRequest(
            HttpMethod.Delete,
            CurrentTokenPath,
            actor.RawSessionToken,
            RevokeBody(RawTokenOne));
        using var duplicateRevokeResponse = await client.SendAsync(duplicateRevokeRequest);
        Assert.Equal(HttpStatusCode.NoContent, duplicateRevokeResponse.StatusCode);

        using var sessionRevokeRequest = CreateBearerRequest(HttpMethod.Delete, CurrentSessionPath, actor.RawSessionToken);
        using var sessionRevokeResponse = await client.SendAsync(sessionRevokeRequest);
        Assert.Equal(HttpStatusCode.NoContent, sessionRevokeResponse.StatusCode);

        using var scope = testFactory.Services.CreateScope();
        var tokens = await scope.ServiceProvider
            .GetRequiredService<SettleoraDbContext>()
            .Set<PushDeviceToken>()
            .OrderBy(token => token.UserProfileId)
            .ToListAsync();
        var actorToken = Assert.Single(tokens, token => token.UserProfileId == actor.UserProfileId);
        var otherToken = Assert.Single(tokens, token => token.UserProfileId == other.UserProfileId);
        Assert.Equal(PushDeviceTokenStatuses.Revoked, actorToken.Status);
        Assert.Equal("current_token_revoked", actorToken.StatusReason);
        Assert.Equal(WriteTimestamp.AddMinutes(10), actorToken.RevokedAtUtc);
        Assert.Equal(PushDeviceTokenStatuses.Active, otherToken.Status);
    }

    [Fact]
    public async Task SameTokenFingerprintForAnotherUserFailsClosedWithoutTokenEcho()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Push Token Conflict Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Push Token Conflict Other");
        using var client = testFactory.CreateClient();

        using var firstRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            CurrentTokenPath,
            actor.RawSessionToken,
            RegisterBody(RawTokenOne));
        using var firstResponse = await client.SendAsync(firstRequest);
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);

        using var conflictRequest = CreateJsonBearerRequest(
            HttpMethod.Put,
            CurrentTokenPath,
            other.RawSessionToken,
            RegisterBody(RawTokenOne, deviceInstallationId: "other-installation-id"));
        using var conflictResponse = await client.SendAsync(conflictRequest);
        var conflictContent = await conflictResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, conflictResponse.StatusCode);
        Assert.DoesNotContain(RawTokenOne, conflictContent, StringComparison.Ordinal);
        Assert.DoesNotContain("fingerprint", conflictContent, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("protected", conflictContent, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RegistrationFailsClosedWhenFingerprintKeyIsUnavailable()
    {
        var testContext = CreateFactory(configureFingerprintKey: false);
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Push Token Unavailable Actor");
        using var client = testFactory.CreateClient();

        using var request = CreateJsonBearerRequest(
            HttpMethod.Put,
            CurrentTokenPath,
            actor.RawSessionToken,
            RegisterBody(RawTokenOne));
        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.DoesNotContain(RawTokenOne, content, StringComparison.Ordinal);
        using var scope = testFactory.Services.CreateScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>().Set<PushDeviceToken>().ToListAsync());
    }

    private FactoryTestContext CreateFactory(bool configureFingerprintKey = true)
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

                if (configureFingerprintKey)
                {
                    services.Configure<PushTokenProtectionOptions>(options =>
                    {
                        options.FingerprintKeyBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes("0123456789abcdef0123456789abcdef"));
                        options.ProtectionKeyId = "test-data-protection";
                    });
                }
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        EndpointTestTimeProvider timeProvider,
        string displayName)
    {
        timeProvider.SetUtcNow(InitialTimestamp);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
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
        dbContext.Set<SystemRoleAssignment>().Add(new SystemRoleAssignment
        {
            AuthAccountId = authAccountId,
            Role = SystemRoles.User,
            AssignedAtUtc = InitialTimestamp
        });
        await dbContext.SaveChangesAsync();

        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                authAccountId,
                DeviceLabel: "Push token endpoint test",
                UserAgentSummary: "Push token endpoint test user agent",
                NetworkAddressHash: "push-token-endpoint-test-network",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededSession(
            authAccountId,
            userProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken);
    }

    private static object RegisterBody(
        string rawToken,
        string deviceInstallationId = DeviceInstallationId,
        string permissionState = "authorized")
    {
        return new
        {
            platform = "ios",
            provider = "apns",
            token = rawToken,
            deviceInstallationId,
            appBuildEnvironment = "production",
            permissionState,
            clientObservedAtUtc = WriteTimestamp
        };
    }

    private static object RevokeBody(string rawToken)
    {
        return new
        {
            platform = "ios",
            provider = "apns",
            token = rawToken,
            deviceInstallationId = DeviceInstallationId,
            appBuildEnvironment = "production"
        };
    }

    private static HttpRequestMessage CreateBearerRequest(HttpMethod method, string path, string rawSessionToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");
        return request;
    }

    private static HttpRequestMessage CreateJsonBearerRequest(
        HttpMethod method,
        string path,
        string rawSessionToken,
        object body)
    {
        var request = CreateBearerRequest(method, path, rawSessionToken);
        request.Content = JsonContent(body);
        return request;
    }

    private static StringContent JsonContent(object body)
    {
        return new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json");
    }

    private static async Task AssertUnauthenticatedProblemAsync(HttpResponseMessage response, params string[] forbiddenValues)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        foreach (var forbiddenValue in forbiddenValues)
        {
            Assert.DoesNotContain(forbiddenValue, content, StringComparison.Ordinal);
        }
        Assert.DoesNotContain("hash", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("password", content, StringComparison.OrdinalIgnoreCase);
    }

    private static void AssertSafePushTokenResponseContent(string content)
    {
        Assert.DoesNotContain(RawTokenOne, content, StringComparison.Ordinal);
        Assert.DoesNotContain(RawTokenTwo, content, StringComparison.Ordinal);
        Assert.DoesNotContain("protectedTokenBlob", content, StringComparison.Ordinal);
        Assert.DoesNotContain("protected_token_blob", content, StringComparison.Ordinal);
        Assert.DoesNotContain("tokenFingerprint", content, StringComparison.Ordinal);
        Assert.DoesNotContain("token_fingerprint", content, StringComparison.Ordinal);
        Assert.DoesNotContain("deviceInstallationHash", content, StringComparison.Ordinal);
        Assert.DoesNotContain(DeviceInstallationId, content, StringComparison.Ordinal);
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        EndpointTestTimeProvider TimeProvider);

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken);

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
