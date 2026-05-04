using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
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

public sealed class SelfUserProfileEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string ProfilePath = "/api/v1/users/me/profile";
    private const string WrongRawToken = "visible-wrong-profile-session-token";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 4, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 4, 10, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset UpdateTimestamp = new(2026, 5, 4, 10, 30, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public SelfUserProfileEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task GetSelfProfileSucceedsForValidBearerSession()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var root = payload.RootElement;

        Assert.Equal(5, root.EnumerateObject().Count());
        Assert.Equal(seededSession.UserProfileId, root.GetProperty("id").GetGuid());
        Assert.Equal("Self Profile Test", root.GetProperty("displayName").GetString());
        Assert.Equal("USD", root.GetProperty("defaultCurrency").GetString());
        Assert.Equal(InitialTimestamp, root.GetProperty("createdAtUtc").GetDateTimeOffset());
        Assert.Equal(InitialTimestamp, root.GetProperty("updatedAtUtc").GetDateTimeOffset());
    }

    [Fact]
    public async Task GetSelfProfileResponseDoesNotExposeAuthSessionCredentialTokenOrUnrelatedFields()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, seededSession.AuthSessionId);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        var lowerContent = content.ToLowerInvariant();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(seededSession.RawSessionToken, content);
        Assert.DoesNotContain(sessionTokenHash, content);
        Assert.DoesNotContain("auth", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("group", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
    }

    [Fact]
    public async Task PatchSelfProfileUpdatesDisplayNameAndDefaultCurrency()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        testContext.TimeProvider.SetUtcNow(UpdateTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            seededSession.RawSessionToken,
            "{\"displayName\":\"  Updated Self Profile  \",\"defaultCurrency\":\"HKD\"}");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await AssertProfileResponseAsync(
            response,
            seededSession.UserProfileId,
            "Updated Self Profile",
            "HKD",
            InitialTimestamp,
            UpdateTimestamp);

        var profile = await ReadProfileAsync(testFactory, seededSession.UserProfileId);
        Assert.Equal("Updated Self Profile", profile.DisplayName);
        Assert.Equal("HKD", profile.DefaultCurrency);
        Assert.Equal(UpdateTimestamp, profile.UpdatedAtUtc);
    }

    [Fact]
    public async Task PatchSelfProfileCanClearDefaultCurrencyWhenNullIsExplicitlySupplied()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        testContext.TimeProvider.SetUtcNow(UpdateTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            seededSession.RawSessionToken,
            "{\"defaultCurrency\":null}");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await AssertProfileResponseAsync(
            response,
            seededSession.UserProfileId,
            "Self Profile Test",
            null,
            InitialTimestamp,
            UpdateTimestamp);

        var profile = await ReadProfileAsync(testFactory, seededSession.UserProfileId);
        Assert.Null(profile.DefaultCurrency);
        Assert.Equal(UpdateTimestamp, profile.UpdatedAtUtc);
    }

    [Fact]
    public async Task PatchSelfProfileRejectsBlankDisplayName()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            seededSession.RawSessionToken,
            "{\"displayName\":\"   \"}");

        using var response = await client.SendAsync(request);

        await AssertInvalidProfileUpdateProblemAsync(response);
        await AssertProfileUnchangedAsync(testFactory, seededSession.UserProfileId);
    }

    [Theory]
    [InlineData("usd")]
    [InlineData("US1")]
    [InlineData("USDX")]
    public async Task PatchSelfProfileRejectsInvalidCurrency(string submittedCurrency)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            seededSession.RawSessionToken,
            $"{{\"defaultCurrency\":\"{submittedCurrency}\"}}");

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        await AssertInvalidProfileUpdateProblemAsync(response, content);
        Assert.DoesNotContain(submittedCurrency, content);
        await AssertProfileUnchangedAsync(testFactory, seededSession.UserProfileId);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"unknown\":\"value\"}")]
    public async Task PatchSelfProfileRejectsEmptyBodyOrNoRecognizedFields(string body)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(seededSession.RawSessionToken, body);

        using var response = await client.SendAsync(request);

        await AssertInvalidProfileUpdateProblemAsync(response);
        await AssertProfileUnchangedAsync(testFactory, seededSession.UserProfileId);
    }

    [Fact]
    public async Task PatchSelfProfileRejectsMissingRequestBody()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Patch, seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertInvalidProfileUpdateProblemAsync(response);
        await AssertProfileUnchangedAsync(testFactory, seededSession.UserProfileId);
    }

    [Fact]
    public async Task PatchSelfProfileRejectsClientSubmittedProfileIds()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreatePatchRequest(
            seededSession.RawSessionToken,
            $"{{\"id\":\"{Guid.NewGuid():D}\",\"displayName\":\"Should Not Apply\"}}");

        using var response = await client.SendAsync(request);

        await AssertInvalidProfileUpdateProblemAsync(response);
        await AssertProfileUnchangedAsync(testFactory, seededSession.UserProfileId);
    }

    [Fact]
    public async Task MissingOrInvalidSessionReturnsUniformUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();

        using var missingResponse = await client.GetAsync(ProfilePath);
        await AssertUnauthenticatedProblemAsync(missingResponse);

        using var invalidRequest = CreateBearerRequest(HttpMethod.Get, WrongRawToken);
        using var invalidResponse = await client.SendAsync(invalidRequest);
        await AssertUnauthenticatedProblemAsync(invalidResponse, WrongRawToken);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("deleted")]
    public async Task DeletedOrMissingProfileFailsClosedWithNotFound(string profileState)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        await MarkProfileUnavailableAsync(testFactory, seededSession.UserProfileId, profileState);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertProfileUnavailableProblemAsync(response);
    }

    [Fact]
    public async Task BusinessAuthorizationDeniedFailsClosedWithNotFound()
    {
        var testContext = CreateFactory(new DenyingBusinessAuthorizationService());
        using var testFactory = testContext.Factory;
        var seededSession = await SeedValidSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, seededSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertProfileUnavailableProblemAsync(response);
    }

    private FactoryTestContext CreateFactory(
        IBusinessAuthorizationService? businessAuthorizationService = null)
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new SelfProfileTestTimeProvider(InitialTimestamp);
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

                if (businessAuthorizationService is not null)
                {
                    services.RemoveAll<IBusinessAuthorizationService>();
                    services.AddSingleton(businessAuthorizationService);
                }
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededSelfProfileSession> SeedValidSessionAsync(
        WebApplicationFactory<Program> testFactory,
        SelfProfileTestTimeProvider timeProvider,
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
            DisplayName = "Self Profile Test",
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
                DeviceLabel: "Self profile endpoint test",
                UserAgentSummary: "Self profile endpoint test user agent",
                NetworkAddressHash: "self-profile-endpoint-test-network",
                RequestedLifetime: lifetime ?? TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededSelfProfileSession(
            authAccountId,
            userProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            sessionCreationResult.SessionExpiresAtUtc.Value);
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

    private static async Task<UserProfile> ReadProfileAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<UserProfile>().SingleAsync(
            profile => profile.Id == userProfileId);
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

    private static HttpRequestMessage CreateBearerRequest(HttpMethod method, string rawSessionToken)
    {
        var request = new HttpRequestMessage(method, ProfilePath);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static HttpRequestMessage CreatePatchRequest(string rawSessionToken, string json)
    {
        var request = CreateBearerRequest(HttpMethod.Patch, rawSessionToken);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        return request;
    }

    private static async Task AssertProfileResponseAsync(
        HttpResponseMessage response,
        Guid expectedProfileId,
        string expectedDisplayName,
        string? expectedDefaultCurrency,
        DateTimeOffset expectedCreatedAtUtc,
        DateTimeOffset expectedUpdatedAtUtc)
    {
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var root = payload.RootElement;

        Assert.Equal(5, root.EnumerateObject().Count());
        Assert.Equal(expectedProfileId, root.GetProperty("id").GetGuid());
        Assert.Equal(expectedDisplayName, root.GetProperty("displayName").GetString());
        if (expectedDefaultCurrency is null)
        {
            Assert.Equal(JsonValueKind.Null, root.GetProperty("defaultCurrency").ValueKind);
        }
        else
        {
            Assert.Equal(expectedDefaultCurrency, root.GetProperty("defaultCurrency").GetString());
        }

        Assert.Equal(expectedCreatedAtUtc, root.GetProperty("createdAtUtc").GetDateTimeOffset());
        Assert.Equal(expectedUpdatedAtUtc, root.GetProperty("updatedAtUtc").GetDateTimeOffset());
    }

    private static async Task AssertProfileUnchangedAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId)
    {
        var profile = await ReadProfileAsync(testFactory, userProfileId);
        Assert.Equal("Self Profile Test", profile.DisplayName);
        Assert.Equal("USD", profile.DefaultCurrency);
        Assert.Equal(InitialTimestamp, profile.UpdatedAtUtc);
    }

    private static async Task AssertInvalidProfileUpdateProblemAsync(
        HttpResponseMessage response,
        string? content = null)
    {
        content ??= await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid profile update", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted profile update is invalid.",
            payload.RootElement.GetProperty("detail").GetString());
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

    private static async Task AssertProfileUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Profile unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested profile is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        SelfProfileTestTimeProvider TimeProvider);

    private sealed record SeededSelfProfileSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset SessionExpiresAtUtc);

    private sealed class SelfProfileTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public SelfProfileTestTimeProvider(DateTimeOffset utcNow)
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

    private sealed class DenyingBusinessAuthorizationService : IBusinessAuthorizationService
    {
        public Task<BusinessAuthorizationResult> CanAccessProfileAsync(
            Guid userProfileId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(BusinessAuthorizationResult.Deny(
                BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed));
        }

        public Task<BusinessAuthorizationResult> CanAccessGroupAsync(
            Guid groupId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(BusinessAuthorizationResult.Deny(
                BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed));
        }

        public Task<BusinessAuthorizationResult> CanManageGroupMembershipAsync(
            Guid groupId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(BusinessAuthorizationResult.Deny(
                BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed));
        }

        public Task<BusinessAuthorizationResult> CanManageGroupSettingsAsync(
            Guid groupId,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(BusinessAuthorizationResult.Deny(
                BusinessAuthorizationFailureReason.DeniedNotFoundOrNotAllowed));
        }

        public BusinessAuthorizationResult HasSystemRole(string systemRole)
        {
            return BusinessAuthorizationResult.Deny(
                BusinessAuthorizationFailureReason.DeniedInsufficientRole);
        }
    }
}
