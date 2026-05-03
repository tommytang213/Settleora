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

public sealed class LocalSignInEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string SignInPath = "/api/v1/auth/sign-in";
    private const string RefreshPath = "/api/v1/auth/refresh";
    private const string CurrentUserPath = "/api/v1/auth/current-user";
    private const string SubmittedIdentifier = "  LOCAL.User@Example.COM  ";
    private const string NormalizedIdentifier = "local.user@example.com";
    private const string MissingIdentifier = "missing.user@example.com";
    private const string SubmittedPassword = "visible-local-sign-in-password";
    private const string WrongPassword = "visible-wrong-local-sign-in-password";
    private const string RawRefreshCredentialFragment = "visible-refresh-credential";
    private const string SourceKey = "src:local-single-node";
    private const string VerifierFragment = "visible-password-verifier";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 3, 12, 0, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public LocalSignInEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task MissingRequestBodyReturnsSafeFailure()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(SignInPath, content: null);

        await AssertSignInFailedProblemAsync(response);
    }

    [Fact]
    public async Task InvalidRequestBodyReturnsSafeFailureWithoutLeakingDetails()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var content = new StringContent(
            "{\"identifier\":\"invalid.body@example.com\",\"password\":\"visible-invalid-json-secret\"",
            Encoding.UTF8,
            "application/json");

        using var response = await client.PostAsync(SignInPath, content);

        await AssertSignInFailedProblemAsync(
            response,
            "invalid.body@example.com",
            "visible-invalid-json-secret");
    }

    [Fact]
    public async Task NonJsonRequestBodyReturnsSafeFailure()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        using var content = new StringContent(
            "identifier=local.user@example.com&password=visible-form-secret",
            Encoding.UTF8,
            "application/x-www-form-urlencoded");

        using var response = await client.PostAsync(SignInPath, content);

        await AssertSignInFailedProblemAsync(
            response,
            "local.user@example.com",
            "visible-form-secret");
    }

    [Fact]
    public async Task MissingIdentifierReturnsGenericFailureWithoutLeakingPassword()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            SignInPath,
            CreateJsonContent(new
            {
                password = SubmittedPassword
            }));

        await AssertSignInFailedProblemAsync(response, SubmittedPassword);
    }

    [Fact]
    public async Task MissingPasswordReturnsGenericFailureWithoutLeakingIdentifier()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            SignInPath,
            CreateJsonContent(new
            {
                identifier = SubmittedIdentifier
            }));

        await AssertSignInFailedProblemAsync(response, SubmittedIdentifier.Trim(), NormalizedIdentifier);
    }

    [Fact]
    public async Task WrongPasswordReturnsUniformFailureWithoutLeakingAccountState()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededAccount = await SeedLocalSignInAccountAsync(testFactory);
        await SeedCredentialAsync(testFactory, seededAccount.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            SignInPath,
            CreateSignInContent(password: WrongPassword));

        await AssertSignInFailedProblemAsync(
            response,
            SubmittedIdentifier.Trim(),
            NormalizedIdentifier,
            WrongPassword,
            "wrong",
            "active",
            "credential");
    }

    [Fact]
    public async Task MissingIdentityReturnsSameUniformFailureAsWrongPassword()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededAccount = await SeedLocalSignInAccountAsync(testFactory);
        await SeedCredentialAsync(testFactory, seededAccount.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var wrongPasswordResponse = await client.PostAsync(
            SignInPath,
            CreateSignInContent(password: WrongPassword));
        using var missingIdentityResponse = await client.PostAsync(
            SignInPath,
            CreateSignInContent(identifier: MissingIdentifier));

        var wrongPasswordProblem = await ReadProblemSnapshotAsync(wrongPasswordResponse);
        var missingIdentityProblem = await ReadProblemSnapshotAsync(missingIdentityResponse);
        Assert.Equal(wrongPasswordProblem, missingIdentityProblem);
        await AssertSignInFailedProblemAsync(missingIdentityResponse, MissingIdentifier);
    }

    [Fact]
    public async Task MissingLocalPasswordCredentialReturnsSameUniformFailureAsWrongPassword()
    {
        var wrongPasswordContext = CreateFactory();
        using var wrongPasswordFactory = wrongPasswordContext.Factory;
        var wrongPasswordAccount = await SeedLocalSignInAccountAsync(wrongPasswordFactory);
        await SeedCredentialAsync(wrongPasswordFactory, wrongPasswordAccount.AuthAccountId);
        using var wrongPasswordClient = wrongPasswordFactory.CreateClient();

        var missingCredentialContext = CreateFactory();
        using var missingCredentialFactory = missingCredentialContext.Factory;
        await SeedLocalSignInAccountAsync(missingCredentialFactory);
        using var missingCredentialClient = missingCredentialFactory.CreateClient();

        using var wrongPasswordResponse = await wrongPasswordClient.PostAsync(
            SignInPath,
            CreateSignInContent(password: WrongPassword));
        using var missingCredentialResponse = await missingCredentialClient.PostAsync(
            SignInPath,
            CreateSignInContent());

        var wrongPasswordProblem = await ReadProblemSnapshotAsync(wrongPasswordResponse);
        var missingCredentialProblem = await ReadProblemSnapshotAsync(missingCredentialResponse);
        Assert.Equal(wrongPasswordProblem, missingCredentialProblem);
        await AssertSignInFailedProblemAsync(
            missingCredentialResponse,
            SubmittedIdentifier.Trim(),
            NormalizedIdentifier,
            SubmittedPassword,
            "credential");
    }

    [Theory]
    [InlineData("disabled")]
    [InlineData("deleted")]
    public async Task DisabledOrDeletedAccountReturnsSameUniformFailureAsWrongPassword(
        string accountState)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededAccount = await SeedLocalSignInAccountAsync(testFactory);
        await SeedCredentialAsync(testFactory, seededAccount.AuthAccountId);
        await MarkAccountUnavailableAsync(testFactory, seededAccount.AuthAccountId, accountState);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(SignInPath, CreateSignInContent());

        await AssertSignInFailedProblemAsync(
            response,
            SubmittedIdentifier.Trim(),
            NormalizedIdentifier,
            SubmittedPassword,
            accountState,
            "account",
            "credential");
    }

    [Fact]
    public async Task ThrottledSignInReturnsGenericTooManyAttemptsProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededAccount = await SeedLocalSignInAccountAsync(testFactory);
        await SeedCredentialAsync(testFactory, seededAccount.AuthAccountId);
        using var client = testFactory.CreateClient();

        for (var attempt = 0; attempt < 5; attempt++)
        {
            using var failedResponse = await client.PostAsync(
                SignInPath,
                CreateSignInContent(password: WrongPassword));
            await AssertSignInFailedProblemAsync(failedResponse, WrongPassword);
        }

        using var response = await client.PostAsync(
            SignInPath,
            CreateSignInContent(password: WrongPassword));

        await AssertTooManyAttemptsProblemAsync(
            response,
            SubmittedIdentifier.Trim(),
            NormalizedIdentifier,
            WrongPassword,
            SourceKey,
            "bucket",
            "policy",
            "ThrottledBy");
    }

    [Fact]
    public async Task RefreshSessionCreationFailureReturnsGenericSignInFailure()
    {
        var fakeRefreshSessionRuntimeService = new FakeRefreshSessionRuntimeService(
            AuthRefreshSessionCreationResult.Failure(AuthRefreshSessionCreationStatus.PersistenceFailed));
        var testContext = CreateFactory(fakeRefreshSessionRuntimeService);
        using var testFactory = testContext.Factory;
        var seededAccount = await SeedLocalSignInAccountAsync(testFactory);
        await SeedCredentialAsync(testFactory, seededAccount.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var wrongPasswordResponse = await client.PostAsync(
            SignInPath,
            CreateSignInContent(password: WrongPassword));
        using var response = await client.PostAsync(SignInPath, CreateSignInContent());

        var wrongPasswordProblem = await ReadProblemSnapshotAsync(wrongPasswordResponse);
        var sessionFailureProblem = await ReadProblemSnapshotAsync(response);
        Assert.Equal(wrongPasswordProblem, sessionFailureProblem);
        Assert.Equal(1, fakeRefreshSessionRuntimeService.CreateCallCount);
        await AssertSignInFailedProblemAsync(
            response,
            SubmittedIdentifier.Trim(),
            NormalizedIdentifier,
            SubmittedPassword,
            "session",
            "family",
            "credential",
            "persistence");
    }

    [Fact]
    public async Task ValidSignInReturnsRefreshCapableCredentialEnvelope()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededAccount = await SeedLocalSignInAccountAsync(testFactory);
        await SeedCredentialAsync(testFactory, seededAccount.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(SignInPath, CreateSignInContent());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var root = payload.RootElement;

        Assert.Equal(2, root.EnumerateObject().Count());
        Assert.False(root.TryGetProperty("authAccountId", out _));
        Assert.False(root.TryGetProperty("userProfileId", out _));

        var session = root.GetProperty("session");
        Assert.Equal(3, session.EnumerateObject().Count());
        var sessionId = session.GetProperty("id").GetGuid();
        Assert.NotEqual(Guid.Empty, sessionId);
        Assert.False(string.IsNullOrWhiteSpace(session.GetProperty("token").GetString()));
        Assert.Equal(
            InitialTimestamp.AddMinutes(15),
            session.GetProperty("expiresAtUtc").GetDateTimeOffset());

        var refreshCredential = root.GetProperty("refreshCredential");
        Assert.Equal(3, refreshCredential.EnumerateObject().Count());
        Assert.False(string.IsNullOrWhiteSpace(refreshCredential.GetProperty("token").GetString()));
        Assert.Equal(
            InitialTimestamp.AddDays(7),
            refreshCredential.GetProperty("idleExpiresAtUtc").GetDateTimeOffset());
        Assert.Equal(
            InitialTimestamp.AddDays(30),
            refreshCredential.GetProperty("absoluteExpiresAtUtc").GetDateTimeOffset());

        var sessionRow = await ReadSessionAsync(testFactory, sessionId);
        Assert.Equal(AuthSessionStatuses.Active, sessionRow.Status);
        Assert.Equal(InitialTimestamp.AddMinutes(15), sessionRow.ExpiresAtUtc);
    }

    [Fact]
    public async Task SuccessResponseDoesNotExposeCredentialAuditPolicyOrProviderMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededAccount = await SeedLocalSignInAccountAsync(testFactory);
        await SeedCredentialAsync(testFactory, seededAccount.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(SignInPath, CreateSignInContent());
        var content = await response.Content.ReadAsStringAsync();
        using var payload = JsonDocument.Parse(content);
        var sessionId = payload.RootElement.GetProperty("session").GetProperty("id").GetGuid();
        var rawToken = payload.RootElement.GetProperty("session").GetProperty("token").GetString();
        var rawRefreshCredential = payload.RootElement
            .GetProperty("refreshCredential")
            .GetProperty("token")
            .GetString();
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, sessionId);
        var refreshCredentialHash = await ReadRefreshCredentialHashAsync(testFactory, sessionId);
        var lowerContent = content.ToLowerInvariant();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace(rawToken));
        Assert.False(string.IsNullOrWhiteSpace(rawRefreshCredential));
        Assert.DoesNotContain(sessionTokenHash, content);
        Assert.DoesNotContain(refreshCredentialHash, content);
        Assert.DoesNotContain("tokenhash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("verifier", lowerContent);
        Assert.DoesNotContain("credentialid", lowerContent);
        Assert.DoesNotContain("credentialstatus", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("source", lowerContent);
        Assert.DoesNotContain("policy", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("metadata", lowerContent);
        Assert.DoesNotContain("status", lowerContent);
        Assert.DoesNotContain("family", lowerContent);
        Assert.DoesNotContain("replay", lowerContent);
        Assert.DoesNotContain("revocation", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain(VerifierFragment, content);
        Assert.DoesNotContain(SourceKey, content);
        Assert.DoesNotContain(SubmittedPassword, content);
        Assert.DoesNotContain(seededAccount.AuthAccountId.ToString(), content);
        Assert.DoesNotContain(seededAccount.UserProfileId.ToString(), content);
    }

    [Fact]
    public async Task ValidSignInPersistsSessionFamilyAndRefreshCredentialHashesOnly()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededAccount = await SeedLocalSignInAccountAsync(testFactory);
        await SeedCredentialAsync(testFactory, seededAccount.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(SignInPath, CreateSignInContent());
        var content = await response.Content.ReadAsStringAsync();
        using var payload = JsonDocument.Parse(content);
        var sessionId = payload.RootElement.GetProperty("session").GetProperty("id").GetGuid();
        var rawAccessToken = payload.RootElement.GetProperty("session").GetProperty("token").GetString();
        var rawRefreshCredential = payload.RootElement.GetProperty("refreshCredential").GetProperty("token").GetString();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace(rawAccessToken));
        Assert.False(string.IsNullOrWhiteSpace(rawRefreshCredential));

        var persistedRows = await ReadPersistedSignInCredentialRowsAsync(testFactory, sessionId);
        Assert.StartsWith("sha256:", persistedRows.Session.SessionTokenHash, StringComparison.Ordinal);
        Assert.NotEqual(rawAccessToken, persistedRows.Session.SessionTokenHash);
        Assert.DoesNotContain(rawAccessToken!, persistedRows.Session.SessionTokenHash);
        Assert.Null(persistedRows.Session.RefreshTokenHash);
        Assert.Equal(seededAccount.AuthAccountId, persistedRows.SessionFamily.AuthAccountId);
        Assert.Equal(AuthSessionFamilyStatuses.Active, persistedRows.SessionFamily.Status);
        Assert.StartsWith("refresh-sha256:", persistedRows.RefreshCredential.RefreshTokenHash, StringComparison.Ordinal);
        Assert.NotEqual(rawRefreshCredential, persistedRows.RefreshCredential.RefreshTokenHash);
        Assert.DoesNotContain(rawRefreshCredential!, persistedRows.RefreshCredential.RefreshTokenHash);
        Assert.Equal(AuthRefreshCredentialStatuses.Active, persistedRows.RefreshCredential.Status);
    }

    [Fact]
    public async Task ReturnedRefreshCredentialCanRotateOnceAndOldCredentialCannotBeReused()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededAccount = await SeedLocalSignInAccountAsync(testFactory);
        await SeedCredentialAsync(testFactory, seededAccount.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var signInResponse = await client.PostAsync(SignInPath, CreateSignInContent());
        var signInContent = await signInResponse.Content.ReadAsStringAsync();
        using var signInPayload = JsonDocument.Parse(signInContent);
        var oldRefreshCredential = signInPayload.RootElement
            .GetProperty("refreshCredential")
            .GetProperty("token")
            .GetString();
        Assert.False(string.IsNullOrWhiteSpace(oldRefreshCredential));

        using var refreshResponse = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(oldRefreshCredential));
        var refreshContent = await refreshResponse.Content.ReadAsStringAsync();
        using var refreshPayload = JsonDocument.Parse(refreshContent);
        var replacementRefreshCredential = refreshPayload.RootElement
            .GetProperty("refreshCredential")
            .GetProperty("token")
            .GetString();

        Assert.Equal(HttpStatusCode.OK, refreshResponse.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace(replacementRefreshCredential));
        Assert.NotEqual(oldRefreshCredential, replacementRefreshCredential);
        Assert.DoesNotContain(oldRefreshCredential!, refreshContent);

        using var replayResponse = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(oldRefreshCredential));
        await AssertRefreshFailedProblemAsync(replayResponse, oldRefreshCredential!);
    }

    [Fact]
    public async Task RequestedSessionLifetimeMinutesIsIgnoredAndCannotLengthenRefreshAccessSession()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededAccount = await SeedLocalSignInAccountAsync(testFactory);
        await SeedCredentialAsync(testFactory, seededAccount.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            SignInPath,
            CreateSignInContent(requestedSessionLifetimeMinutes: 43_200));
        var content = await response.Content.ReadAsStringAsync();
        using var payload = JsonDocument.Parse(content);
        var session = payload.RootElement.GetProperty("session");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(
            InitialTimestamp.AddMinutes(15),
            session.GetProperty("expiresAtUtc").GetDateTimeOffset());
    }

    [Fact]
    public async Task ReturnedTokenCanReadCurrentUser()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var seededAccount = await SeedLocalSignInAccountAsync(testFactory);
        await SeedCredentialAsync(testFactory, seededAccount.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var signInResponse = await client.PostAsync(SignInPath, CreateSignInContent());
        var signInContent = await signInResponse.Content.ReadAsStringAsync();
        using var signInPayload = JsonDocument.Parse(signInContent);
        var rawSessionToken = signInPayload.RootElement
            .GetProperty("session")
            .GetProperty("token")
            .GetString();
        using var currentUserRequest = new HttpRequestMessage(HttpMethod.Get, CurrentUserPath);
        currentUserRequest.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        using var currentUserResponse = await client.SendAsync(currentUserRequest);

        Assert.Equal(HttpStatusCode.OK, currentUserResponse.StatusCode);
        await using var currentUserStream = await currentUserResponse.Content.ReadAsStreamAsync();
        using var currentUserPayload = await JsonDocument.ParseAsync(currentUserStream);
        var root = currentUserPayload.RootElement;

        Assert.Equal(seededAccount.AuthAccountId, root.GetProperty("authAccountId").GetGuid());
        Assert.Equal(seededAccount.UserProfileId, root.GetProperty("userProfile").GetProperty("id").GetGuid());
        Assert.Equal("Local Sign-In Endpoint Test User", root.GetProperty("userProfile").GetProperty("displayName").GetString());
        Assert.Equal("USD", root.GetProperty("userProfile").GetProperty("defaultCurrency").GetString());
    }

    [Fact]
    public void OpenApiContractUsesRefreshCapableLocalSignInSchema()
    {
        var openApiPath = FindRepoFile("packages/contracts/openapi/settleora.v1.yaml");
        var openApi = File.ReadAllText(openApiPath);
        var requestSchema = ExtractOpenApiSchemaBlock(openApi, "LocalSignInRequest:");
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "LocalSignInResponse:");

        Assert.Contains("/api/v1/auth/sign-in:", openApi);
        Assert.Contains("operationId: signInLocal", openApi);
        Assert.Contains("security: []", ExtractOpenApiPathBlock(openApi, "/api/v1/auth/sign-in:"));
        Assert.Contains("identifier:", requestSchema);
        Assert.Contains("password:", requestSchema);
        Assert.Contains("deviceLabel:", requestSchema);
        Assert.DoesNotContain("requestedSessionLifetimeMinutes", requestSchema);
        Assert.DoesNotContain("requestedSessionLifetimeMinutes", openApi);
        Assert.Contains("session:", responseSchema);
        Assert.Contains("refreshCredential:", responseSchema);
        Assert.Contains("#/components/schemas/RefreshSessionAccessSession", responseSchema);
        Assert.Contains("#/components/schemas/RefreshSessionCredential", responseSchema);
        Assert.DoesNotContain("authAccountId", responseSchema);
        Assert.DoesNotContain("userProfileId", responseSchema);
        Assert.Contains("/api/v1/auth/refresh:", openApi);
        Assert.Contains("RefreshSessionResponse:", openApi);
    }

    private FactoryTestContext CreateFactory(
        IAuthRefreshSessionRuntimeService? refreshSessionRuntimeService = null)
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

                if (refreshSessionRuntimeService is not null)
                {
                    services.RemoveAll<IAuthRefreshSessionRuntimeService>();
                    services.AddSingleton(refreshSessionRuntimeService);
                }
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededSignInAccount> SeedLocalSignInAccountAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var userProfileId = Guid.NewGuid();
        var authAccountId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Local Sign-In Endpoint Test User",
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

        await dbContext.SaveChangesAsync();
        return new SeededSignInAccount(authAccountId, userProfileId);
    }

    private static async Task SeedCredentialAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authAccountId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

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
            account.DisabledAtUtc = InitialTimestamp;
        }
        else
        {
            account.DeletedAtUtc = InitialTimestamp;
        }

        account.UpdatedAtUtc = InitialTimestamp;
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

    private static async Task<string> ReadRefreshCredentialHashAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthRefreshCredential>()
            .Where(credential => credential.AuthSessionId == authSessionId)
            .Select(credential => credential.RefreshTokenHash)
            .SingleAsync();
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

    private static async Task<PersistedSignInCredentialRows> ReadPersistedSignInCredentialRowsAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        var session = await dbContext.Set<AuthSession>()
            .AsNoTracking()
            .SingleAsync(session => session.Id == authSessionId);
        var refreshCredential = await dbContext.Set<AuthRefreshCredential>()
            .AsNoTracking()
            .SingleAsync(credential => credential.AuthSessionId == authSessionId);
        var sessionFamily = await dbContext.Set<AuthSessionFamily>()
            .AsNoTracking()
            .SingleAsync(family => family.Id == refreshCredential.AuthSessionFamilyId);

        return new PersistedSignInCredentialRows(session, sessionFamily, refreshCredential);
    }

    private static StringContent CreateSignInContent(
        string? identifier = SubmittedIdentifier,
        string? password = SubmittedPassword,
        int? requestedSessionLifetimeMinutes = null)
    {
        var value = new Dictionary<string, object?>
        {
            ["identifier"] = identifier,
            ["password"] = password,
            ["deviceLabel"] = "Local sign-in endpoint test device"
        };

        if (requestedSessionLifetimeMinutes is not null)
        {
            value["requestedSessionLifetimeMinutes"] = requestedSessionLifetimeMinutes;
        }

        return CreateJsonContent(value);
    }

    private static StringContent CreateRefreshContent(string? refreshCredential)
    {
        return CreateJsonContent(new
        {
            refreshCredential,
            deviceLabel = "Refresh from sign-in endpoint test device"
        });
    }

    private static StringContent CreateJsonContent<T>(T value)
    {
        return new StringContent(
            JsonSerializer.Serialize(value),
            Encoding.UTF8,
            "application/json");
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

    private static string ExtractOpenApiPathBlock(string openApi, string pathHeader)
    {
        var start = openApi.IndexOf(pathHeader, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Could not find OpenAPI path block {pathHeader}.");

        var nextPath = openApi.IndexOf("\n  /", start + pathHeader.Length, StringComparison.Ordinal);
        return nextPath < 0
            ? openApi[start..]
            : openApi[start..nextPath];
    }

    private static string ExtractOpenApiSchemaBlock(string openApi, string schemaHeader)
    {
        var start = openApi.IndexOf($"    {schemaHeader}", StringComparison.Ordinal);
        Assert.True(start >= 0, $"Could not find OpenAPI schema block {schemaHeader}.");

        var nextSchema = openApi.IndexOf("\n    ", start + schemaHeader.Length + 4, StringComparison.Ordinal);
        while (nextSchema >= 0
            && openApi.Length > nextSchema + 5
            && openApi[nextSchema + 5] is ' ')
        {
            nextSchema = openApi.IndexOf("\n    ", nextSchema + 1, StringComparison.Ordinal);
        }

        return nextSchema < 0
            ? openApi[start..]
            : openApi[start..nextSchema];
    }

    private static async Task AssertSignInFailedProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Sign-in failed", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Unable to sign in with the submitted information.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertTooManyAttemptsProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Too many sign-in attempts", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(429, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Too many sign-in attempts. Try again later.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertRefreshFailedProblemAsync(
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
    }

    private static void AssertSafeProblemContent(
        string content,
        IReadOnlyList<string> unexpectedResponseText)
    {
        var lowerContent = content.ToLowerInvariant();

        Assert.DoesNotContain(SourceKey, content);
        Assert.DoesNotContain("local-id-sha256", content);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("verifier", lowerContent);
        Assert.DoesNotContain("source", lowerContent);
        Assert.DoesNotContain("bucket", lowerContent);
        Assert.DoesNotContain("policy", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("disabled", lowerContent);
        Assert.DoesNotContain("deleted", lowerContent);

        foreach (var unexpected in unexpectedResponseText)
        {
            Assert.DoesNotContain(unexpected, content);
        }
    }

    private static async Task<ProblemSnapshot> ReadProblemSnapshotAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;

        return new ProblemSnapshot(
            response.StatusCode,
            response.Content.Headers.ContentType?.MediaType,
            root.GetProperty("title").GetString(),
            root.GetProperty("status").GetInt32(),
            root.GetProperty("detail").GetString());
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        EndpointTestTimeProvider TimeProvider);

    private sealed record SeededSignInAccount(
        Guid AuthAccountId,
        Guid UserProfileId);

    private sealed record PersistedSignInCredentialRows(
        AuthSession Session,
        AuthSessionFamily SessionFamily,
        AuthRefreshCredential RefreshCredential);

    private sealed record ProblemSnapshot(
        HttpStatusCode HttpStatusCode,
        string? MediaType,
        string? Title,
        int Status,
        string? Detail);

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

    private sealed class FakeRefreshSessionRuntimeService : IAuthRefreshSessionRuntimeService
    {
        private readonly AuthRefreshSessionCreationResult creationResult;

        public FakeRefreshSessionRuntimeService(AuthRefreshSessionCreationResult creationResult)
        {
            this.creationResult = creationResult;
        }

        public int CreateCallCount { get; private set; }

        public Task<AuthRefreshSessionCreationResult> CreateRefreshSessionAsync(
            AuthRefreshSessionCreationRequest request,
            CancellationToken cancellationToken = default)
        {
            CreateCallCount++;
            return Task.FromResult(creationResult);
        }

        public Task<AuthRefreshSessionRotationResult> RotateRefreshCredentialAsync(
            AuthRefreshSessionRotationRequest request,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
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
}
