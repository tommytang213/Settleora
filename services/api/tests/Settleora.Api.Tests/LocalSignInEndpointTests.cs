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
using Settleora.Api.Auth.SignIn;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class LocalSignInEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string SignInPath = "/api/v1/auth/sign-in";
    private const string CurrentUserPath = "/api/v1/auth/current-user";
    private const string SubmittedIdentifier = "  LOCAL.User@Example.COM  ";
    private const string NormalizedIdentifier = "local.user@example.com";
    private const string MissingIdentifier = "missing.user@example.com";
    private const string SubmittedPassword = "visible-local-sign-in-password";
    private const string WrongPassword = "visible-wrong-local-sign-in-password";
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
    public async Task ValidSignInReturnsMinimalSessionResponse()
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

        Assert.Equal(3, root.EnumerateObject().Count());
        Assert.Equal(seededAccount.AuthAccountId, root.GetProperty("authAccountId").GetGuid());
        Assert.Equal(seededAccount.UserProfileId, root.GetProperty("userProfileId").GetGuid());

        var session = root.GetProperty("session");
        Assert.Equal(3, session.EnumerateObject().Count());
        Assert.NotEqual(Guid.Empty, session.GetProperty("id").GetGuid());
        Assert.False(string.IsNullOrWhiteSpace(session.GetProperty("token").GetString()));
        Assert.Equal(
            InitialTimestamp.AddMinutes(45),
            session.GetProperty("expiresAtUtc").GetDateTimeOffset());
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
        var sessionTokenHash = await ReadSessionTokenHashAsync(testFactory, sessionId);
        var lowerContent = content.ToLowerInvariant();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace(rawToken));
        Assert.DoesNotContain(sessionTokenHash, content);
        Assert.DoesNotContain("tokenhash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("verifier", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("source", lowerContent);
        Assert.DoesNotContain("policy", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("metadata", lowerContent);
        Assert.DoesNotContain("status", lowerContent);
        Assert.DoesNotContain(VerifierFragment, content);
        Assert.DoesNotContain(SourceKey, content);
        Assert.DoesNotContain(SubmittedPassword, content);
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

                services.RemoveAll<IPasswordHashingService>();
                services.AddSingleton<IPasswordHashingService, FakePasswordHashingService>();
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

    private static StringContent CreateSignInContent(
        string? identifier = SubmittedIdentifier,
        string? password = SubmittedPassword)
    {
        return CreateJsonContent(new
        {
            identifier,
            password,
            deviceLabel = "Local sign-in endpoint test device",
            requestedSessionLifetimeMinutes = 45
        });
    }

    private static StringContent CreateJsonContent<T>(T value)
    {
        return new StringContent(
            JsonSerializer.Serialize(value),
            Encoding.UTF8,
            "application/json");
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
