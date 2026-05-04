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

public sealed class LocalOwnerBootstrapEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string StatusPath = "/api/v1/auth/bootstrap/status";
    private const string LocalOwnerPath = "/api/v1/auth/bootstrap/local-owner";
    private const string SignInPath = "/api/v1/auth/sign-in";
    private const string RefreshPath = "/api/v1/auth/refresh";
    private const string CurrentUserPath = "/api/v1/auth/current-user";
    private const string SelfProfilePath = "/api/v1/users/me/profile";
    private const string HealthPath = "/health";
    private const string SubmittedIdentifier = "  OWNER.User@Example.COM  ";
    private const string NormalizedIdentifier = "owner.user@example.com";
    private const string SubmittedPassword = "visible-bootstrap-password";
    private const string ShortPassword = "too-short";
    private const string DisplayName = "  First Local Owner  ";
    private const string TrimmedDisplayName = "First Local Owner";
    private const string VerifierFragment = "visible-bootstrap-verifier";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 4, 12, 0, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public LocalOwnerBootstrapEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task BootstrapStatusReturnsRequiredWhenNoAuthAccountsExist()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.GetAsync(StatusPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        var root = payload.RootElement;

        Assert.Single(root.EnumerateObject());
        Assert.True(root.GetProperty("bootstrapRequired").GetBoolean());
        AssertNoSetupInternals(root.GetRawText());
    }

    [Fact]
    public async Task BootstrapStatusReturnsUnavailableAfterAnyAuthAccountExists()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedExistingAuthAccountAsync(testFactory);
        using var client = testFactory.CreateClient();

        using var response = await client.GetAsync(StatusPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);

        Assert.False(payload.RootElement.GetProperty("bootstrapRequired").GetBoolean());
        AssertNoSetupInternals(payload.RootElement.GetRawText());
    }

    [Fact]
    public async Task BootstrapCreatesFirstLocalOwnerAccountProfileIdentityCredentialAndRoles()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            LocalOwnerPath,
            CreateBootstrapContent());

        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        Assert.Equal(2, root.EnumerateObject().Count());

        var userProfile = root.GetProperty("userProfile");
        Assert.Equal(5, userProfile.EnumerateObject().Count());
        var userProfileId = userProfile.GetProperty("id").GetGuid();
        Assert.Equal(TrimmedDisplayName, userProfile.GetProperty("displayName").GetString());
        Assert.Equal("HKD", userProfile.GetProperty("defaultCurrency").GetString());
        Assert.Equal(InitialTimestamp, userProfile.GetProperty("createdAtUtc").GetDateTimeOffset());
        Assert.Equal(InitialTimestamp, userProfile.GetProperty("updatedAtUtc").GetDateTimeOffset());

        var roles = root.GetProperty("roles").EnumerateArray()
            .Select(role => role.GetString()!)
            .ToArray();
        Assert.Equal(["owner", "admin", "user"], roles);

        var persisted = await ReadBootstrapRowsAsync(testFactory);
        Assert.Equal(userProfileId, persisted.UserProfile.Id);
        Assert.Equal(TrimmedDisplayName, persisted.UserProfile.DisplayName);
        Assert.Equal("HKD", persisted.UserProfile.DefaultCurrency);
        Assert.Equal(userProfileId, persisted.AuthAccount.UserProfileId);
        Assert.Equal(AuthAccountStatuses.Active, persisted.AuthAccount.Status);
        Assert.Equal(AuthIdentityProviderTypes.Local, persisted.AuthIdentity.ProviderType);
        Assert.Equal(LocalSignInService.LocalProviderName, persisted.AuthIdentity.ProviderName);
        Assert.Equal(NormalizedIdentifier, persisted.AuthIdentity.ProviderSubject);
        Assert.Equal(VerifierFragment, persisted.LocalPasswordCredential.PasswordHash);
        Assert.NotEqual(SubmittedPassword, persisted.LocalPasswordCredential.PasswordHash);
        Assert.Equal(AuthAccountStatuses.Active, persisted.AuthAccount.Status);
        Assert.Equal(["owner", "admin", "user"], persisted.Roles);

        using var statusResponse = await client.GetAsync(StatusPath);
        await AssertBootstrapRequiredAsync(statusResponse, expected: false);
    }

    [Fact]
    public async Task BootstrappedAccountCanSignInRefreshAndAccessCurrentUserAndSelfProfile()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var bootstrapResponse = await client.PostAsync(
            LocalOwnerPath,
            CreateBootstrapContent(defaultCurrency: null));
        Assert.Equal(HttpStatusCode.OK, bootstrapResponse.StatusCode);

        using var signInResponse = await client.PostAsync(
            SignInPath,
            CreateJsonContent(new
            {
                identifier = SubmittedIdentifier,
                password = SubmittedPassword,
                deviceLabel = "Bootstrap endpoint test sign-in"
            }));
        Assert.Equal(HttpStatusCode.OK, signInResponse.StatusCode);

        var signInContent = await signInResponse.Content.ReadAsStringAsync();
        using var signInPayload = JsonDocument.Parse(signInContent);
        var accessToken = signInPayload.RootElement
            .GetProperty("session")
            .GetProperty("token")
            .GetString();
        var refreshCredential = signInPayload.RootElement
            .GetProperty("refreshCredential")
            .GetProperty("token")
            .GetString();
        Assert.False(string.IsNullOrWhiteSpace(accessToken));
        Assert.False(string.IsNullOrWhiteSpace(refreshCredential));

        using var currentUserRequest = CreateBearerRequest(HttpMethod.Get, CurrentUserPath, accessToken!);
        using var currentUserResponse = await client.SendAsync(currentUserRequest);
        Assert.Equal(HttpStatusCode.OK, currentUserResponse.StatusCode);
        var currentUserContent = await currentUserResponse.Content.ReadAsStringAsync();
        using var currentUserPayload = JsonDocument.Parse(currentUserContent);
        Assert.Equal(TrimmedDisplayName, currentUserPayload.RootElement.GetProperty("userProfile").GetProperty("displayName").GetString());
        Assert.Equal(JsonValueKind.Null, currentUserPayload.RootElement.GetProperty("userProfile").GetProperty("defaultCurrency").ValueKind);
        Assert.Equal(["owner", "admin", "user"], currentUserPayload.RootElement.GetProperty("roles").EnumerateArray().Select(role => role.GetString()!).ToArray());

        using var selfProfileRequest = CreateBearerRequest(HttpMethod.Get, SelfProfilePath, accessToken!);
        using var selfProfileResponse = await client.SendAsync(selfProfileRequest);
        Assert.Equal(HttpStatusCode.OK, selfProfileResponse.StatusCode);

        using var refreshResponse = await client.PostAsync(
            RefreshPath,
            CreateJsonContent(new
            {
                refreshCredential,
                deviceLabel = "Bootstrap endpoint test refresh"
            }));
        Assert.Equal(HttpStatusCode.OK, refreshResponse.StatusCode);

        using var healthResponse = await client.GetAsync(HealthPath);
        Assert.Equal(HttpStatusCode.OK, healthResponse.StatusCode);
    }

    [Fact]
    public async Task BootstrapCannotRunAfterAuthAccountAlreadyExists()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedExistingAuthAccountAsync(testFactory);
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            LocalOwnerPath,
            CreateBootstrapContent());

        await AssertBootstrapUnavailableProblemAsync(
            response,
            SubmittedIdentifier.Trim(),
            NormalizedIdentifier,
            SubmittedPassword);
    }

    [Fact]
    public async Task DuplicateBootstrapAttemptFailsSafelyWithoutExtraRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var firstResponse = await client.PostAsync(
            LocalOwnerPath,
            CreateBootstrapContent());
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);

        using var secondResponse = await client.PostAsync(
            LocalOwnerPath,
            CreateBootstrapContent(
                identifier: "second.owner@example.com",
                password: "visible-second-bootstrap-password",
                displayName: "Second Owner",
                defaultCurrency: "USD"));

        await AssertBootstrapUnavailableProblemAsync(
            secondResponse,
            "second.owner@example.com",
            "visible-second-bootstrap-password");

        var counts = await ReadBootstrapRowCountsAsync(testFactory);
        Assert.Equal(new BootstrapRowCounts(
            UserProfiles: 1,
            AuthAccounts: 1,
            AuthIdentities: 1,
            LocalPasswordCredentials: 1,
            SystemRoleAssignments: 3),
            counts);
    }

    [Fact]
    public async Task BlankIdentifierIsRejectedWithoutCreatingRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            LocalOwnerPath,
            CreateBootstrapContent(identifier: "   "));

        await AssertInvalidBootstrapProblemAsync(response);
        await AssertNoBootstrapRowsAsync(testFactory);
    }

    [Fact]
    public async Task OverlongIdentifierIsRejectedWithoutCreatingRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            LocalOwnerPath,
            CreateBootstrapContent(identifier: new string('a', LocalAccountIdentifier.MaxLength + 1)));

        await AssertInvalidBootstrapProblemAsync(response);
        await AssertNoBootstrapRowsAsync(testFactory);
    }

    [Theory]
    [InlineData("   ")]
    [InlineData(ShortPassword)]
    public async Task BlankOrShortPasswordIsRejectedWithoutCreatingRows(string submittedPassword)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            LocalOwnerPath,
            CreateBootstrapContent(password: submittedPassword));

        await AssertInvalidBootstrapProblemAsync(response, submittedPassword);
        await AssertNoBootstrapRowsAsync(testFactory);
    }

    [Fact]
    public async Task BlankDisplayNameIsRejectedWithoutCreatingRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            LocalOwnerPath,
            CreateBootstrapContent(displayName: "   "));

        await AssertInvalidBootstrapProblemAsync(response);
        await AssertNoBootstrapRowsAsync(testFactory);
    }

    [Fact]
    public async Task OverlongDisplayNameIsRejectedWithoutCreatingRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            LocalOwnerPath,
            CreateBootstrapContent(displayName: new string('A', UserProfileConstraints.DisplayNameMaxLength + 1)));

        await AssertInvalidBootstrapProblemAsync(response);
        await AssertNoBootstrapRowsAsync(testFactory);
    }

    [Theory]
    [InlineData("usd")]
    [InlineData("US1")]
    [InlineData("USDX")]
    public async Task InvalidDefaultCurrencyIsRejectedWithoutCreatingRows(string submittedCurrency)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            LocalOwnerPath,
            CreateBootstrapContent(defaultCurrency: submittedCurrency));

        await AssertInvalidBootstrapProblemAsync(response, submittedCurrency);
        await AssertNoBootstrapRowsAsync(testFactory);
    }

    [Fact]
    public async Task ExplicitNullDefaultCurrencyIsAccepted()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            LocalOwnerPath,
            CreateBootstrapContent(defaultCurrency: null));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var content = await response.Content.ReadAsStringAsync();
        using var payload = JsonDocument.Parse(content);
        Assert.Equal(JsonValueKind.Null, payload.RootElement.GetProperty("userProfile").GetProperty("defaultCurrency").ValueKind);

        var persisted = await ReadBootstrapRowsAsync(testFactory);
        Assert.Null(persisted.UserProfile.DefaultCurrency);
    }

    [Fact]
    public async Task BootstrapResponseDoesNotExposeCredentialProviderAuditTokenOrStorageMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            LocalOwnerPath,
            CreateBootstrapContent());

        var content = await response.Content.ReadAsStringAsync();
        var persisted = await ReadBootstrapRowsAsync(testFactory);
        var lowerContent = content.ToLowerInvariant();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(SubmittedIdentifier.Trim(), content);
        Assert.DoesNotContain(NormalizedIdentifier, content);
        Assert.DoesNotContain(SubmittedPassword, content);
        Assert.DoesNotContain(VerifierFragment, content);
        Assert.DoesNotContain(persisted.AuthAccount.Id.ToString(), content);
        Assert.DoesNotContain(persisted.AuthIdentity.Id.ToString(), content);
        Assert.DoesNotContain(persisted.LocalPasswordCredential.Id.ToString(), content);
        Assert.DoesNotContain("auth", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("verifier", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("metadata", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
    }

    [Fact]
    public void OpenApiContractDefinesBootstrapOnlyAnonymousAccountCreation()
    {
        var openApiPath = FindRepoFile("packages/contracts/openapi/settleora.v1.yaml");
        var openApi = File.ReadAllText(openApiPath);
        var statusPathBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/auth/bootstrap/status:");
        var ownerPathBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/auth/bootstrap/local-owner:");
        var requestSchema = ExtractOpenApiSchemaBlock(openApi, "BootstrapLocalOwnerRequest:");
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "BootstrapLocalOwnerResponse:");
        var statusSchema = ExtractOpenApiSchemaBlock(openApi, "BootstrapStatusResponse:");

        Assert.Contains("operationId: getAuthBootstrapStatus", statusPathBlock);
        Assert.Contains("security: []", statusPathBlock);
        Assert.Contains("bootstrapRequired:", statusSchema);
        Assert.DoesNotContain("accountCount:", statusSchema);
        Assert.DoesNotContain("authAccountId:", statusSchema);

        Assert.Contains("operationId: bootstrapLocalOwner", ownerPathBlock);
        Assert.Contains("security: []", ownerPathBlock);
        Assert.Contains("\"409\":", ownerPathBlock);
        Assert.Contains("identifier:", requestSchema);
        Assert.Contains("password:", requestSchema);
        Assert.Contains("minLength: 12", requestSchema);
        Assert.Contains("displayName:", requestSchema);
        Assert.Contains("defaultCurrency:", requestSchema);
        Assert.Contains("userProfile:", responseSchema);
        Assert.Contains("roles:", responseSchema);
        Assert.DoesNotContain("session:", responseSchema);
        Assert.DoesNotContain("refreshCredential:", responseSchema);
        Assert.DoesNotContain("authAccountId:", responseSchema);
        Assert.DoesNotContain("providerSubject:", responseSchema);
        Assert.DoesNotContain("passwordHash:", responseSchema);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new BootstrapTestTimeProvider(InitialTimestamp);
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

    private static async Task SeedExistingAuthAccountAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var userProfileId = Guid.NewGuid();
        var authAccountId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Existing Bootstrap Test Account",
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
    }

    private static async Task<BootstrapRows> ReadBootstrapRowsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccount = await dbContext.Set<AuthAccount>().AsNoTracking().SingleAsync();
        var userProfile = await dbContext.Set<UserProfile>().AsNoTracking().SingleAsync();
        var authIdentity = await dbContext.Set<AuthIdentity>().AsNoTracking().SingleAsync();
        var localPasswordCredential = await dbContext.Set<LocalPasswordCredential>().AsNoTracking().SingleAsync();
        var roles = await dbContext.Set<SystemRoleAssignment>()
            .AsNoTracking()
            .OrderBy(assignment => assignment.Role == SystemRoles.Owner ? 0 : assignment.Role == SystemRoles.Admin ? 1 : 2)
            .Select(assignment => assignment.Role)
            .ToArrayAsync();

        return new BootstrapRows(
            userProfile,
            authAccount,
            authIdentity,
            localPasswordCredential,
            roles);
    }

    private static async Task<BootstrapRowCounts> ReadBootstrapRowCountsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new BootstrapRowCounts(
            await dbContext.Set<UserProfile>().CountAsync(),
            await dbContext.Set<AuthAccount>().CountAsync(),
            await dbContext.Set<AuthIdentity>().CountAsync(),
            await dbContext.Set<LocalPasswordCredential>().CountAsync(),
            await dbContext.Set<SystemRoleAssignment>().CountAsync());
    }

    private static async Task AssertNoBootstrapRowsAsync(WebApplicationFactory<Program> testFactory)
    {
        Assert.Equal(new BootstrapRowCounts(0, 0, 0, 0, 0), await ReadBootstrapRowCountsAsync(testFactory));
    }

    private static StringContent CreateBootstrapContent(
        string? identifier = SubmittedIdentifier,
        string? password = SubmittedPassword,
        string? displayName = DisplayName,
        string? defaultCurrency = "HKD")
    {
        return CreateJsonContent(new
        {
            identifier,
            password,
            displayName,
            defaultCurrency
        });
    }

    private static StringContent CreateJsonContent<T>(T value)
    {
        return new StringContent(
            JsonSerializer.Serialize(value),
            Encoding.UTF8,
            "application/json");
    }

    private static HttpRequestMessage CreateBearerRequest(
        HttpMethod method,
        string path,
        string rawSessionToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");

        return request;
    }

    private static async Task AssertBootstrapRequiredAsync(
        HttpResponseMessage response,
        bool expected)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);
        Assert.Equal(expected, payload.RootElement.GetProperty("bootstrapRequired").GetBoolean());
    }

    private static async Task AssertBootstrapUnavailableProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Bootstrap unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Local owner bootstrap is unavailable for this deployment state.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertInvalidBootstrapProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid bootstrap request", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted bootstrap request is invalid.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static void AssertSafeProblemContent(
        string content,
        IReadOnlyList<string> unexpectedResponseText)
    {
        var lowerContent = content.ToLowerInvariant();

        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("verifier", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("metadata", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);

        foreach (var unexpected in unexpectedResponseText)
        {
            Assert.DoesNotContain(unexpected, content);
        }
    }

    private static void AssertNoSetupInternals(string content)
    {
        var lowerContent = content.ToLowerInvariant();

        Assert.DoesNotContain("count", lowerContent);
        Assert.DoesNotContain("id", lowerContent);
        Assert.DoesNotContain("email", lowerContent);
        Assert.DoesNotContain("identifier", lowerContent);
        Assert.DoesNotContain("role", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
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

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        BootstrapTestTimeProvider TimeProvider);

    private sealed record BootstrapRows(
        UserProfile UserProfile,
        AuthAccount AuthAccount,
        AuthIdentity AuthIdentity,
        LocalPasswordCredential LocalPasswordCredential,
        IReadOnlyList<string> Roles);

    private sealed record BootstrapRowCounts(
        int UserProfiles,
        int AuthAccounts,
        int AuthIdentities,
        int LocalPasswordCredentials,
        int SystemRoleAssignments);

    private sealed class BootstrapTestTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset utcNow;

        public BootstrapTestTimeProvider(DateTimeOffset utcNow)
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
        public const string CurrentPolicyVersion = "argon2id-bootstrap-test-v1";
        public const string CurrentParametersJson = """{"format":"fake-bootstrap-current"}""";

        public PasswordHashResult HashPassword(string plaintextPassword)
        {
            Assert.DoesNotContain(plaintextPassword, CurrentVerifier);

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
