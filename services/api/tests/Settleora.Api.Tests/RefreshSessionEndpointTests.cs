using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class RefreshSessionEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string RefreshPath = "/api/v1/auth/refresh";
    private const string UnknownRefreshCredential = "visible-unknown-refresh-credential";
    private const string MalformedJsonRefreshCredential = "visible-malformed-refresh-credential";
    private const string FormRefreshCredential = "visible-form-refresh-credential";
    private const string NestedRefreshCredential = "visible-nested-refresh-credential";
    private const string ForbiddenAccountId = "11111111-1111-1111-1111-111111111111";
    private const string ForbiddenSessionFamilyId = "22222222-2222-2222-2222-222222222222";
    private const string ForbiddenRefreshCredentialId = "33333333-3333-3333-3333-333333333333";
    private const string ForbiddenSourceKey = "visible-client-source-key";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 3, 16, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset RotationTimestamp = new(2026, 5, 3, 16, 10, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ExpiredTimestamp = new(2026, 5, 10, 16, 3, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public RefreshSessionEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task ValidRefreshCredentialReturnsMinimalContinuationPayload()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedRefreshSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            RefreshPath,
            CreateJsonContent(new
            {
                refreshCredential = seededSession.RawRefreshCredential,
                deviceLabel = "  Refreshed endpoint device  "
            }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var root = payload.RootElement;

        Assert.Equal(2, root.EnumerateObject().Count());
        var session = root.GetProperty("session");
        Assert.Equal(3, session.EnumerateObject().Count());
        var sessionId = session.GetProperty("id").GetGuid();
        var rawAccessToken = session.GetProperty("token").GetString();
        Assert.NotEqual(Guid.Empty, sessionId);
        Assert.False(string.IsNullOrWhiteSpace(rawAccessToken));
        Assert.NotEqual(seededSession.RawAccessSessionToken, rawAccessToken);
        Assert.Equal(
            RotationTimestamp.AddMinutes(15),
            session.GetProperty("expiresAtUtc").GetDateTimeOffset());

        var refreshCredential = root.GetProperty("refreshCredential");
        Assert.Equal(3, refreshCredential.EnumerateObject().Count());
        var rawRefreshCredential = refreshCredential.GetProperty("token").GetString();
        Assert.False(string.IsNullOrWhiteSpace(rawRefreshCredential));
        Assert.NotEqual(seededSession.RawRefreshCredential, rawRefreshCredential);
        Assert.Equal(
            RotationTimestamp.AddDays(7),
            refreshCredential.GetProperty("idleExpiresAtUtc").GetDateTimeOffset());
        Assert.Equal(
            InitialTimestamp.AddDays(30),
            refreshCredential.GetProperty("absoluteExpiresAtUtc").GetDateTimeOffset());

        var oldCredential = await ReadRefreshCredentialAsync(
            testFactory,
            seededSession.AuthRefreshCredentialId);
        Assert.Equal(AuthRefreshCredentialStatuses.Rotated, oldCredential.Status);
        Assert.Equal(RotationTimestamp, oldCredential.ConsumedAtUtc);
        Assert.NotNull(oldCredential.ReplacedByRefreshCredentialId);

        var replacementSession = await ReadSessionAsync(testFactory, sessionId);
        Assert.Equal(AuthSessionStatuses.Active, replacementSession.Status);
        Assert.Equal("Refreshed endpoint device", replacementSession.DeviceLabel);
        Assert.Equal(RotationTimestamp.AddMinutes(15), replacementSession.ExpiresAtUtc);
    }

    [Fact]
    public async Task OldRefreshCredentialIsConsumedAndCannotBeReused()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedRefreshSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();

        using var firstResponse = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(seededSession.RawRefreshCredential));
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);

        var oldCredential = await ReadRefreshCredentialAsync(
            testFactory,
            seededSession.AuthRefreshCredentialId);
        Assert.Equal(AuthRefreshCredentialStatuses.Rotated, oldCredential.Status);
        Assert.NotNull(oldCredential.ConsumedAtUtc);

        using var secondResponse = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(seededSession.RawRefreshCredential));

        await AssertRefreshFailedProblemAsync(
            secondResponse,
            seededSession.RawRefreshCredential);
    }

    [Fact]
    public async Task MissingAndBlankRefreshCredentialReturnSameUniformFailure()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var missingResponse = await client.PostAsync(
            RefreshPath,
            CreateJsonContent(new { deviceLabel = "No credential" }));
        using var blankResponse = await client.PostAsync(
            RefreshPath,
            CreateJsonContent(new { refreshCredential = "   " }));

        var missingProblem = await ReadRefreshFailedProblemSnapshotAsync(missingResponse);
        var blankProblem = await ReadRefreshFailedProblemSnapshotAsync(blankResponse);
        Assert.Equal(missingProblem, blankProblem);
    }

    [Fact]
    public async Task UnknownRefreshCredentialReturnsUniformFailure()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(UnknownRefreshCredential));

        await AssertRefreshFailedProblemAsync(response, UnknownRefreshCredential);
    }

    [Fact]
    public async Task ReusedRotatedRefreshCredentialReturnsUniformFailureWithoutReplayOrFamilyState()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedRefreshSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();

        using var unknownResponse = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(UnknownRefreshCredential));
        var unknownProblem = await ReadRefreshFailedProblemSnapshotAsync(unknownResponse);

        using var firstResponse = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(seededSession.RawRefreshCredential));
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);

        using var replayResponse = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(seededSession.RawRefreshCredential));
        var replayProblem = await ReadRefreshFailedProblemSnapshotAsync(
            replayResponse,
            seededSession.RawRefreshCredential,
            "replay",
            "family",
            "revoked",
            "rotated");

        Assert.Equal(unknownProblem, replayProblem);
    }

    [Fact]
    public async Task ExpiredRefreshCredentialReturnsUniformFailure()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedRefreshSessionAsync(testFactory, testContext.TimeProvider);
        testContext.TimeProvider.SetUtcNow(ExpiredTimestamp);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(seededSession.RawRefreshCredential));

        await AssertRefreshFailedProblemAsync(
            response,
            seededSession.RawRefreshCredential,
            "expired",
            "family");
    }

    [Theory]
    [InlineData(AuthSessionFamilyStatuses.Revoked)]
    [InlineData(AuthSessionFamilyStatuses.Replayed)]
    public async Task RevokedOrReplayedFamilyReturnsUniformFailure(string familyStatus)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedRefreshSessionAsync(testFactory, testContext.TimeProvider);
        await MarkFamilyUnavailableAsync(testFactory, seededSession.AuthSessionFamilyId, familyStatus);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(seededSession.RawRefreshCredential));

        await AssertRefreshFailedProblemAsync(
            response,
            seededSession.RawRefreshCredential,
            familyStatus,
            "family",
            "revoked",
            "replayed");
    }

    [Theory]
    [InlineData("disabled")]
    [InlineData("deleted")]
    public async Task DisabledOrDeletedAccountReturnsUniformFailure(string accountState)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedRefreshSessionAsync(testFactory, testContext.TimeProvider);
        await MarkAccountUnavailableAsync(testFactory, seededSession.AuthAccountId, accountState);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(seededSession.RawRefreshCredential));

        await AssertRefreshFailedProblemAsync(
            response,
            seededSession.RawRefreshCredential,
            accountState,
            "account");
    }

    [Fact]
    public async Task PersistenceFailureReturnsGenericServerProblem()
    {
        var databaseName = Guid.NewGuid().ToString();
        var databaseRoot = new InMemoryDatabaseRoot();
        var timeProvider = new EndpointTestTimeProvider(RotationTimestamp);
        SeededRefreshSession seededSession;
        await using (var dbContext = CreateDbContext(databaseName, databaseRoot))
        {
            seededSession = await SeedRefreshSessionAsync(dbContext, InitialTimestamp);
        }

        var testContext = CreateFactory(
            databaseName,
            databaseRoot,
            timeProvider,
            new ThrowingSaveChangesInterceptor());
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(seededSession.RawRefreshCredential));

        await AssertRefreshUnavailableProblemAsync(
            response,
            seededSession.RawRefreshCredential,
            "hash",
            "token",
            "account",
            "family",
            "credential");
    }

    [Theory]
    [InlineData("{\"refreshCredential\":\"visible-malformed-refresh-credential\"", "application/json", MalformedJsonRefreshCredential)]
    [InlineData("refreshCredential=visible-form-refresh-credential", "application/x-www-form-urlencoded", FormRefreshCredential)]
    [InlineData("{\"refreshCredential\":{\"value\":\"visible-nested-refresh-credential\"}}", "application/json", NestedRefreshCredential)]
    public async Task InvalidRequestShapesReturnSafeUniformFailure(
        string body,
        string contentType,
        string unexpectedResponseText)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var content = new StringContent(body, Encoding.UTF8, contentType);

        using var response = await client.PostAsync(RefreshPath, content);

        await AssertRefreshFailedProblemAsync(response, unexpectedResponseText);
    }

    [Fact]
    public async Task UnknownPolicyFieldsAreIgnoredAndDoNotLeakIntoSuccessResponse()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedRefreshSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            RefreshPath,
            CreateJsonContent(new
            {
                refreshCredential = seededSession.RawRefreshCredential,
                deviceLabel = "Endpoint device",
                authAccountId = ForbiddenAccountId,
                userProfileId = "visible-user-profile-id",
                sessionId = "visible-submitted-session-id",
                sessionFamilyId = ForbiddenSessionFamilyId,
                refreshCredentialId = ForbiddenRefreshCredentialId,
                status = "visible-submitted-status",
                expiresAtUtc = "2099-01-01T00:00:00Z",
                sourceKey = ForbiddenSourceKey,
                revoked = true
            }));

        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(ForbiddenAccountId, content);
        Assert.DoesNotContain(ForbiddenSessionFamilyId, content);
        Assert.DoesNotContain(ForbiddenRefreshCredentialId, content);
        Assert.DoesNotContain(ForbiddenSourceKey, content);
        Assert.DoesNotContain("visible-user-profile-id", content);
        Assert.DoesNotContain("visible-submitted-session-id", content);
        Assert.DoesNotContain("visible-submitted-status", content);
        Assert.DoesNotContain("2099-01-01", content);
    }

    [Fact]
    public async Task SuccessResponseDoesNotExposeOldCredentialHashesFamilyStateAuditOrProviderMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededSession = await SeedRefreshSessionAsync(testFactory, testContext.TimeProvider);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(seededSession.RawRefreshCredential));
        var content = await response.Content.ReadAsStringAsync();
        var lowerContent = content.ToLowerInvariant();
        var persistedSecrets = await ReadPersistedSecretValuesAsync(testFactory);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(seededSession.RawAccessSessionToken, content);
        Assert.DoesNotContain(seededSession.RawRefreshCredential, content);
        Assert.DoesNotContain(seededSession.AuthAccountId.ToString(), content);
        Assert.DoesNotContain(seededSession.UserProfileId.ToString(), content);
        Assert.DoesNotContain(seededSession.AuthSessionFamilyId.ToString(), content);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("metadata", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("status", lowerContent);
        Assert.DoesNotContain("revoked", lowerContent);
        Assert.DoesNotContain("replay", lowerContent);
        Assert.DoesNotContain("disabled", lowerContent);
        Assert.DoesNotContain("deleted", lowerContent);

        foreach (var persistedSecret in persistedSecrets)
        {
            Assert.DoesNotContain(persistedSecret, content);
        }
    }

    [Fact]
    public void OpenApiContractIncludesRefreshEndpointAndSchemas()
    {
        var openApiPath = FindRepoFile("packages/contracts/openapi/settleora.v1.yaml");
        var openApi = File.ReadAllText(openApiPath);

        Assert.Contains("/api/v1/auth/refresh:", openApi);
        Assert.Contains("operationId: refreshSession", openApi);
        Assert.Contains("security: []", openApi);
        Assert.Contains("RefreshSessionRequest:", openApi);
        Assert.Contains("RefreshSessionResponse:", openApi);
        Assert.Contains("RefreshSessionAccessSession:", openApi);
        Assert.Contains("RefreshSessionCredential:", openApi);
        Assert.DoesNotContain("packages/client-web/src/generated", openApi);
        Assert.DoesNotContain("packages/client-dart/generated", openApi);
    }

    private FactoryTestContext CreateFactory()
    {
        return CreateFactory(
            Guid.NewGuid().ToString(),
            databaseRoot: null,
            new EndpointTestTimeProvider(InitialTimestamp),
            saveChangesInterceptor: null);
    }

    private FactoryTestContext CreateFactory(
        string databaseName,
        InMemoryDatabaseRoot? databaseRoot,
        EndpointTestTimeProvider timeProvider,
        SaveChangesInterceptor? saveChangesInterceptor)
    {
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
                    if (databaseRoot is null)
                    {
                        options.UseInMemoryDatabase(databaseName);
                    }
                    else
                    {
                        options.UseInMemoryDatabase(databaseName, databaseRoot);
                    }

                    if (saveChangesInterceptor is not null)
                    {
                        options.AddInterceptors(saveChangesInterceptor);
                    }
                });

                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(timeProvider);
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededRefreshSession> SeedRefreshSessionAsync(
        WebApplicationFactory<Program> testFactory,
        EndpointTestTimeProvider timeProvider)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        var seededSession = await SeedRefreshSessionAsync(dbContext, InitialTimestamp);
        timeProvider.SetUtcNow(RotationTimestamp);

        return seededSession;
    }

    private static async Task<SeededRefreshSession> SeedRefreshSessionAsync(
        SettleoraDbContext dbContext,
        DateTimeOffset utcNow)
    {
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Refresh Endpoint Test User",
            DefaultCurrency = "USD",
            CreatedAtUtc = utcNow,
            UpdatedAtUtc = utcNow
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = utcNow,
            UpdatedAtUtc = utcNow
        });

        await dbContext.SaveChangesAsync();

        var refreshSessionRuntimeService = CreateRefreshSessionRuntimeService(dbContext, utcNow);
        var createResult = await refreshSessionRuntimeService.CreateRefreshSessionAsync(
            new AuthRefreshSessionCreationRequest(
                authAccountId,
                DeviceLabel: "Initial refresh endpoint device"));

        Assert.True(createResult.Succeeded);
        Assert.NotNull(createResult.AuthSessionId);
        Assert.NotNull(createResult.AuthSessionFamilyId);
        Assert.NotNull(createResult.AuthRefreshCredentialId);
        Assert.NotNull(createResult.RawAccessSessionToken);
        Assert.NotNull(createResult.RawRefreshCredential);

        await ClearAuditEventsAsync(dbContext);
        return new SeededRefreshSession(
            authAccountId,
            userProfileId,
            createResult.AuthSessionId.Value,
            createResult.AuthSessionFamilyId.Value,
            createResult.AuthRefreshCredentialId.Value,
            createResult.RawAccessSessionToken,
            createResult.RawRefreshCredential);
    }

    private static AuthRefreshSessionRuntimeService CreateRefreshSessionRuntimeService(
        SettleoraDbContext dbContext,
        DateTimeOffset utcNow)
    {
        return new AuthRefreshSessionRuntimeService(
            dbContext,
            new EfAuthSessionAuditWriter(dbContext),
            new FixedTimeProvider(utcNow),
            Options.Create(new AuthSessionPolicyOptions()));
    }

    private static SettleoraDbContext CreateDbContext(
        string databaseName,
        InMemoryDatabaseRoot databaseRoot)
    {
        var options = new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(databaseName, databaseRoot)
            .Options;

        return new SettleoraDbContext(options);
    }

    private static async Task ClearAuditEventsAsync(SettleoraDbContext dbContext)
    {
        var auditEvents = await dbContext.Set<AuthAuditEvent>().ToListAsync();
        dbContext.Set<AuthAuditEvent>().RemoveRange(auditEvents);
        await dbContext.SaveChangesAsync();
    }

    private static async Task<AuthRefreshCredential> ReadRefreshCredentialAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authRefreshCredentialId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthRefreshCredential>()
            .AsNoTracking()
            .SingleAsync(credential => credential.Id == authRefreshCredentialId);
    }

    private static async Task<AuthSession> ReadSessionAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthSession>()
            .AsNoTracking()
            .SingleAsync(session => session.Id == authSessionId);
    }

    private static async Task MarkFamilyUnavailableAsync(
        WebApplicationFactory<Program> testFactory,
        Guid sessionFamilyId,
        string familyStatus)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var sessionFamily = await dbContext.Set<AuthSessionFamily>().SingleAsync(
            family => family.Id == sessionFamilyId);

        sessionFamily.Status = familyStatus;
        sessionFamily.RevokedAtUtc = RotationTimestamp.AddMinutes(-1);
        sessionFamily.RevocationReason = $"seeded_{familyStatus}_family";
        sessionFamily.UpdatedAtUtc = RotationTimestamp.AddMinutes(-1);
        await dbContext.SaveChangesAsync();
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
            account.DisabledAtUtc = RotationTimestamp.AddMinutes(-1);
        }
        else
        {
            account.DeletedAtUtc = RotationTimestamp.AddMinutes(-1);
        }

        account.UpdatedAtUtc = RotationTimestamp.AddMinutes(-1);
        await dbContext.SaveChangesAsync();
    }

    private static async Task<IReadOnlyList<string>> ReadPersistedSecretValuesAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        var sessionHashes = await dbContext.Set<AuthSession>()
            .AsNoTracking()
            .Select(session => session.SessionTokenHash)
            .ToListAsync();
        var refreshHashes = await dbContext.Set<AuthRefreshCredential>()
            .AsNoTracking()
            .Select(credential => credential.RefreshTokenHash)
            .ToListAsync();

        return sessionHashes.Concat(refreshHashes).ToArray();
    }

    private static StringContent CreateRefreshContent(string? refreshCredential)
    {
        return CreateJsonContent(new
        {
            refreshCredential,
            deviceLabel = "Refresh endpoint device"
        });
    }

    private static StringContent CreateJsonContent<T>(T value)
    {
        return new StringContent(
            JsonSerializer.Serialize(value),
            Encoding.UTF8,
            "application/json");
    }

    private static async Task<ProblemSnapshot> ReadRefreshFailedProblemSnapshotAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Refresh failed", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Unable to refresh with the submitted information.",
            payload.RootElement.GetProperty("detail").GetString());

        return new ProblemSnapshot(
            response.StatusCode,
            response.Content.Headers.ContentType?.MediaType,
            payload.RootElement.GetProperty("title").GetString(),
            payload.RootElement.GetProperty("status").GetInt32(),
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertRefreshFailedProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        await ReadRefreshFailedProblemSnapshotAsync(response, unexpectedResponseText);
    }

    private static async Task AssertRefreshUnavailableProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Refresh unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(500, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Unable to complete refresh.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static void AssertSafeProblemContent(
        string content,
        IReadOnlyList<string> unexpectedResponseText)
    {
        var lowerContent = content.ToLowerInvariant();

        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("account", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("family", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("metadata", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("secret", lowerContent);
        Assert.DoesNotContain("replay", lowerContent);
        Assert.DoesNotContain("rotated", lowerContent);
        Assert.DoesNotContain("revoked", lowerContent);
        Assert.DoesNotContain("expired", lowerContent);
        Assert.DoesNotContain("disabled", lowerContent);
        Assert.DoesNotContain("deleted", lowerContent);

        foreach (var unexpected in unexpectedResponseText)
        {
            Assert.DoesNotContain(unexpected, content, StringComparison.OrdinalIgnoreCase);
        }
    }

    private static string FindRepoFile(string relativePath)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var candidate = Path.Combine(directory.FullName, relativePath);
            if (File.Exists(candidate))
            {
                return candidate;
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException($"Could not find {relativePath} from {AppContext.BaseDirectory}.");
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        EndpointTestTimeProvider TimeProvider);

    private sealed record SeededRefreshSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        Guid AuthSessionFamilyId,
        Guid AuthRefreshCredentialId,
        string RawAccessSessionToken,
        string RawRefreshCredential);

    private sealed record ProblemSnapshot(
        HttpStatusCode HttpStatusCode,
        string? MediaType,
        string? Title,
        int Status,
        string? Detail);

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

    private sealed class FixedTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset utcNow;

        public FixedTimeProvider(DateTimeOffset utcNow)
        {
            this.utcNow = utcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }
    }

    private sealed class ThrowingSaveChangesInterceptor : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            throw new DbUpdateException("Simulated persistence failure.", (Exception?)null);
        }
    }
}
