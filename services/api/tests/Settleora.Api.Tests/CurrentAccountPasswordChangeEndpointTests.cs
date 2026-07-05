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

public sealed class CurrentAccountPasswordChangeEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string SignInPath = "/api/v1/auth/sign-in";
    private const string RefreshPath = "/api/v1/auth/refresh";
    private const string CurrentUserPath = "/api/v1/auth/current-user";
    private const string PasswordChangePath = "/api/v1/auth/password/change";
    private const string SubmittedIdentifier = "password.change@example.com";
    private const string CurrentPassword = "visible-current-password";
    private const string NewPassword = "visible-new-password";
    private const string WrongPassword = "visible-wrong-password";
    private const string WeakNewPassword = "too-short";
    private const string RawRefreshCredentialFragment = "visible-refresh-credential";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 7, 5, 16, 0, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public CurrentAccountPasswordChangeEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task MissingAuthorizationHeaderReturnsUnauthenticatedProblem()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var response = await client.PostAsync(
            PasswordChangePath,
            CreatePasswordChangeContent());

        await AssertUnauthenticatedProblemAsync(response, CurrentPassword, NewPassword);
    }

    [Fact]
    public async Task UnsupportedFieldsReturnBadRequestWithoutChangingCredentialOrRevokingSessions()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedLocalAccountAsync(testFactory);
        using var client = testFactory.CreateClient();
        var currentSignIn = await SignInAsync(client, CurrentPassword);
        var otherSignIn = await SignInAsync(client, CurrentPassword);
        var smuggledAccountId = Guid.NewGuid().ToString("D");

        using var request = CreateBearerRequest(currentSignIn.RawSessionToken);
        request.Content = CreateJsonContent(new
        {
            currentPassword = CurrentPassword,
            newPassword = NewPassword,
            authAccountId = smuggledAccountId,
            sessionId = otherSignIn.AuthSessionId
        });
        using var response = await client.SendAsync(request);

        await AssertInvalidAuthRequestProblemAsync(
            response,
            CurrentPassword,
            NewPassword,
            smuggledAccountId,
            otherSignIn.AuthSessionId.ToString("D"));
        await AssertCredentialVerifierAsync(testFactory, FakePasswordHashingService.HashFor(CurrentPassword));
        await AssertSessionStatusAsync(testFactory, currentSignIn.AuthSessionId, AuthSessionStatuses.Active);
        await AssertSessionStatusAsync(testFactory, otherSignIn.AuthSessionId, AuthSessionStatuses.Active);
    }

    [Theory]
    [InlineData(null, NewPassword)]
    [InlineData(CurrentPassword, null)]
    public async Task MissingRequiredPasswordFieldsReturnBadRequest(string? currentPassword, string? newPassword)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedLocalAccountAsync(testFactory);
        using var client = testFactory.CreateClient();
        var currentSignIn = await SignInAsync(client, CurrentPassword);

        using var request = CreateBearerRequest(currentSignIn.RawSessionToken);
        request.Content = CreateJsonContent(new
        {
            currentPassword,
            newPassword
        });
        using var response = await client.SendAsync(request);

        await AssertInvalidAuthRequestProblemAsync(response, CurrentPassword, NewPassword);
        await AssertCredentialVerifierAsync(testFactory, FakePasswordHashingService.HashFor(CurrentPassword));
    }

    [Fact]
    public async Task InvalidNewPasswordPolicyReturnsBadRequestWithoutChangingCredential()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedLocalAccountAsync(testFactory);
        using var client = testFactory.CreateClient();
        var currentSignIn = await SignInAsync(client, CurrentPassword);

        using var response = await client.SendAsync(CreatePasswordChangeRequest(
            currentSignIn.RawSessionToken,
            CurrentPassword,
            WeakNewPassword));

        await AssertInvalidAuthRequestProblemAsync(response, CurrentPassword, WeakNewPassword);
        await AssertCredentialVerifierAsync(testFactory, FakePasswordHashingService.HashFor(CurrentPassword));
    }

    [Fact]
    public async Task SamePasswordReturnsBadRequestWithoutChangingCredentialOrRevokingSessions()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedLocalAccountAsync(testFactory);
        using var client = testFactory.CreateClient();
        var currentSignIn = await SignInAsync(client, CurrentPassword);
        var otherSignIn = await SignInAsync(client, CurrentPassword);

        using var response = await client.SendAsync(CreatePasswordChangeRequest(
            currentSignIn.RawSessionToken,
            CurrentPassword,
            CurrentPassword));

        await AssertInvalidAuthRequestProblemAsync(response, CurrentPassword);
        await AssertCredentialVerifierAsync(testFactory, FakePasswordHashingService.HashFor(CurrentPassword));
        await AssertSessionStatusAsync(testFactory, currentSignIn.AuthSessionId, AuthSessionStatuses.Active);
        await AssertSessionStatusAsync(testFactory, otherSignIn.AuthSessionId, AuthSessionStatuses.Active);
    }

    [Fact]
    public async Task WrongCurrentPasswordReturnsUnauthorizedWithoutChangingCredentialOrRevokingSessions()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedLocalAccountAsync(testFactory);
        using var client = testFactory.CreateClient();
        var currentSignIn = await SignInAsync(client, CurrentPassword);
        var otherSignIn = await SignInAsync(client, CurrentPassword);

        using var response = await client.SendAsync(CreatePasswordChangeRequest(
            currentSignIn.RawSessionToken,
            WrongPassword,
            NewPassword));

        await AssertUnauthenticatedProblemAsync(response, WrongPassword, NewPassword);
        await AssertCredentialVerifierAsync(testFactory, FakePasswordHashingService.HashFor(CurrentPassword));
        await AssertSessionStatusAsync(testFactory, currentSignIn.AuthSessionId, AuthSessionStatuses.Active);
        await AssertSessionStatusAsync(testFactory, otherSignIn.AuthSessionId, AuthSessionStatuses.Active);
    }

    [Fact]
    public async Task ReplacementHashFailureReturnsPasswordChangeFailedWithoutChangingCredentialOrRevokingSessions()
    {
        var testContext = CreateFactory(new FakePasswordHashingService(NewPassword));
        using var testFactory = testContext.Factory;
        await SeedLocalAccountAsync(testFactory);
        using var client = testFactory.CreateClient();
        var currentSignIn = await SignInAsync(client, CurrentPassword);
        var otherSignIn = await SignInAsync(client, CurrentPassword);

        using var response = await client.SendAsync(CreatePasswordChangeRequest(
            currentSignIn.RawSessionToken,
            CurrentPassword,
            NewPassword));

        await AssertPasswordChangeFailedProblemAsync(response, CurrentPassword, NewPassword);
        await AssertCredentialVerifierAsync(testFactory, FakePasswordHashingService.HashFor(CurrentPassword));
        await AssertSessionStatusAsync(testFactory, currentSignIn.AuthSessionId, AuthSessionStatuses.Active);
        await AssertSessionStatusAsync(testFactory, otherSignIn.AuthSessionId, AuthSessionStatuses.Active);
        await AssertRefreshStateAsync(
            testFactory,
            currentSignIn.AuthSessionId,
            AuthSessionFamilyStatuses.Active,
            AuthRefreshCredentialStatuses.Active,
            expectedRevocationReason: null);
        await AssertRefreshStateAsync(
            testFactory,
            otherSignIn.AuthSessionId,
            AuthSessionFamilyStatuses.Active,
            AuthRefreshCredentialStatuses.Active,
            expectedRevocationReason: null);

        using var currentUserRequest = CreateCurrentUserRequest(currentSignIn.RawSessionToken);
        using var currentUserResponse = await client.SendAsync(currentUserRequest);
        Assert.Equal(HttpStatusCode.OK, currentUserResponse.StatusCode);

        using var otherCurrentUserRequest = CreateCurrentUserRequest(otherSignIn.RawSessionToken);
        using var otherCurrentUserResponse = await client.SendAsync(otherCurrentUserRequest);
        Assert.Equal(HttpStatusCode.OK, otherCurrentUserResponse.StatusCode);

        using var otherRefreshResponse = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(otherSignIn.RawRefreshCredential));
        Assert.Equal(HttpStatusCode.OK, otherRefreshResponse.StatusCode);

        var audits = await ReadAuthAuditEventsAsync(testFactory);
        Assert.Contains(audits, audit => audit.Action == "credential.verification" && audit.Outcome == AuthAuditOutcomes.Success);
        Assert.Contains(audits, audit => audit.Action == "credential.password_changed" && audit.Outcome == AuthAuditOutcomes.Failure);
        Assert.DoesNotContain(audits, audit => audit.Action == "session.revoked");
        Assert.DoesNotContain(audits, audit => audit.Action == "session_family.revoked");

        foreach (var audit in audits)
        {
            AssertSafeAuditContent(
                audit,
                CurrentPassword,
                NewPassword,
                FakePasswordHashingService.HashFor(CurrentPassword),
                FakePasswordHashingService.HashFor(NewPassword),
                currentSignIn.RawSessionToken,
                currentSignIn.RawRefreshCredential,
                otherSignIn.RawSessionToken,
                otherSignIn.RawRefreshCredential,
                RawRefreshCredentialFragment);
        }
    }

    [Fact]
    public async Task SuccessfulPasswordChangeRotatesVerifierKeepsCurrentSessionAndRevokesOtherSessionsAndRefresh()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedLocalAccountAsync(testFactory);
        using var client = testFactory.CreateClient();
        var currentSignIn = await SignInAsync(client, CurrentPassword);
        var otherSignIn = await SignInAsync(client, CurrentPassword);

        using var response = await client.SendAsync(CreatePasswordChangeRequest(
            currentSignIn.RawSessionToken,
            CurrentPassword,
            NewPassword));

        await AssertNoContentAsync(response);
        await AssertCredentialVerifierAsync(testFactory, FakePasswordHashingService.HashFor(NewPassword));

        using var oldPasswordResponse = await client.PostAsync(SignInPath, CreateSignInContent(CurrentPassword));
        await AssertSignInFailedProblemAsync(oldPasswordResponse, CurrentPassword);

        var newPasswordSignIn = await SignInAsync(client, NewPassword);
        Assert.NotEqual(currentSignIn.AuthSessionId, newPasswordSignIn.AuthSessionId);

        using var currentUserRequest = CreateCurrentUserRequest(currentSignIn.RawSessionToken);
        using var currentUserResponse = await client.SendAsync(currentUserRequest);
        Assert.Equal(HttpStatusCode.OK, currentUserResponse.StatusCode);

        using var otherCurrentUserRequest = CreateCurrentUserRequest(otherSignIn.RawSessionToken);
        using var otherCurrentUserResponse = await client.SendAsync(otherCurrentUserRequest);
        await AssertUnauthenticatedProblemAsync(otherCurrentUserResponse, otherSignIn.RawSessionToken);

        using var currentRefreshResponse = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(currentSignIn.RawRefreshCredential));
        Assert.Equal(HttpStatusCode.OK, currentRefreshResponse.StatusCode);

        await AssertRefreshStateAsync(
            testFactory,
            otherSignIn.AuthSessionId,
            AuthSessionFamilyStatuses.Revoked,
            AuthRefreshCredentialStatuses.Revoked);

        using var otherRefreshResponse = await client.PostAsync(
            RefreshPath,
            CreateRefreshContent(otherSignIn.RawRefreshCredential));
        await AssertRefreshFailedProblemAsync(otherRefreshResponse, otherSignIn.RawRefreshCredential);

        await AssertSessionStatusAsync(testFactory, currentSignIn.AuthSessionId, AuthSessionStatuses.Active);
        await AssertSessionStatusAsync(testFactory, otherSignIn.AuthSessionId, AuthSessionStatuses.Revoked);
    }

    [Fact]
    public async Task PasswordChangeResponseAndAuditDoNotExposeSecretMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedLocalAccountAsync(testFactory);
        using var client = testFactory.CreateClient();
        var currentSignIn = await SignInAsync(client, CurrentPassword);
        var otherSignIn = await SignInAsync(client, CurrentPassword);

        using var response = await client.SendAsync(CreatePasswordChangeRequest(
            currentSignIn.RawSessionToken,
            CurrentPassword,
            NewPassword));

        await AssertNoContentAsync(response);
        var audits = await ReadAuthAuditEventsAsync(testFactory);
        Assert.Contains(audits, audit => audit.Action == "credential.verification" && audit.Outcome == AuthAuditOutcomes.Success);
        Assert.Contains(audits, audit => audit.Action == "credential.password_changed" && audit.Outcome == AuthAuditOutcomes.Success);
        Assert.Contains(audits, audit => audit.Action == "session.revoked" && audit.Outcome == AuthAuditOutcomes.Revoked);
        Assert.Contains(audits, audit => audit.Action == "session_family.revoked" && audit.Outcome == AuthAuditOutcomes.Revoked);

        foreach (var audit in audits)
        {
            AssertSafeAuditContent(
                audit,
                CurrentPassword,
                NewPassword,
                WrongPassword,
                FakePasswordHashingService.HashFor(CurrentPassword),
                FakePasswordHashingService.HashFor(NewPassword),
                currentSignIn.RawSessionToken,
                currentSignIn.RawRefreshCredential,
                otherSignIn.RawSessionToken,
                otherSignIn.RawRefreshCredential,
                RawRefreshCredentialFragment);
        }
    }

    [Fact]
    public void OpenApiContractIncludesCurrentAccountPasswordChangeOperation()
    {
        var openApiPath = FindRepoFile("packages/contracts/openapi/settleora.v1.yaml");
        var openApi = File.ReadAllText(openApiPath);
        var pathBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/auth/password/change:");
        var requestSchema = ExtractOpenApiSchemaBlock(openApi, "CurrentAccountPasswordChangeRequest:");

        Assert.Contains("operationId: changeCurrentAccountPassword", pathBlock);
        Assert.Contains("SessionBearerAuth", pathBlock);
        Assert.Contains("\"204\":", pathBlock);
        Assert.Contains("\"400\":", pathBlock);
        Assert.Contains("\"401\":", pathBlock);
        Assert.Contains("currentPassword:", requestSchema);
        Assert.Contains("newPassword:", requestSchema);
        Assert.Contains("additionalProperties: false", requestSchema);
        Assert.Contains("writeOnly: true", requestSchema);
        Assert.DoesNotContain("authAccountId", requestSchema);
        Assert.DoesNotContain("sessionId", requestSchema);
    }

    private FactoryTestContext CreateFactory(IPasswordHashingService? passwordHashingService = null)
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
                services.AddSingleton(passwordHashingService ?? new FakePasswordHashingService());
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededAccount> SeedLocalAccountAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var userProfileId = Guid.NewGuid();
        var authAccountId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = "Password Change Test User",
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
            ProviderSubject = SubmittedIdentifier,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp
        });
        dbContext.Set<SystemRoleAssignment>().Add(new SystemRoleAssignment
        {
            AuthAccountId = authAccountId,
            Role = SystemRoles.User,
            AssignedAtUtc = InitialTimestamp
        });
        dbContext.Set<LocalPasswordCredential>().Add(new LocalPasswordCredential
        {
            Id = Guid.NewGuid(),
            AuthAccountId = authAccountId,
            PasswordHash = FakePasswordHashingService.HashFor(CurrentPassword),
            PasswordHashAlgorithm = PasswordHashingAlgorithms.Argon2id,
            PasswordHashAlgorithmVersion = FakePasswordHashingService.CurrentPolicyVersion,
            PasswordHashParameters = FakePasswordHashingService.CurrentParametersJson,
            Status = LocalPasswordCredentialStatuses.Active,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            RequiresRehash = false
        });

        await dbContext.SaveChangesAsync();
        return new SeededAccount(authAccountId, userProfileId);
    }

    private static async Task<SignInResult> SignInAsync(HttpClient client, string password)
    {
        using var response = await client.PostAsync(SignInPath, CreateSignInContent(password));
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(content);
        var session = payload.RootElement.GetProperty("session");
        var refreshCredential = payload.RootElement.GetProperty("refreshCredential");
        return new SignInResult(
            session.GetProperty("id").GetGuid(),
            session.GetProperty("token").GetString()!,
            refreshCredential.GetProperty("token").GetString()!);
    }

    private static async Task AssertCredentialVerifierAsync(
        WebApplicationFactory<Program> testFactory,
        string expectedVerifier)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var credential = await dbContext.Set<LocalPasswordCredential>().SingleAsync();

        Assert.Equal(expectedVerifier, credential.PasswordHash);
        Assert.Equal(PasswordHashingAlgorithms.Argon2id, credential.PasswordHashAlgorithm);
        Assert.Equal(FakePasswordHashingService.CurrentPolicyVersion, credential.PasswordHashAlgorithmVersion);
        Assert.Equal(FakePasswordHashingService.CurrentParametersJson, credential.PasswordHashParameters);
        Assert.Equal(LocalPasswordCredentialStatuses.Active, credential.Status);
        Assert.False(credential.RequiresRehash);
    }

    private static async Task AssertSessionStatusAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId,
        string expectedStatus)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var session = await dbContext.Set<AuthSession>()
            .AsNoTracking()
            .SingleAsync(session => session.Id == authSessionId);

        Assert.Equal(expectedStatus, session.Status);
    }

    private static async Task AssertRefreshStateAsync(
        WebApplicationFactory<Program> testFactory,
        Guid authSessionId,
        string expectedFamilyStatus,
        string expectedCredentialStatus,
        string? expectedRevocationReason = "password_changed")
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var credential = await dbContext.Set<AuthRefreshCredential>()
            .AsNoTracking()
            .Include(credential => credential.SessionFamily)
            .SingleAsync(credential => credential.AuthSessionId == authSessionId);

        Assert.Equal(expectedCredentialStatus, credential.Status);
        Assert.Equal(expectedFamilyStatus, credential.SessionFamily.Status);
        Assert.Equal(expectedRevocationReason, credential.RevocationReason);
        Assert.Equal(expectedRevocationReason, credential.SessionFamily.RevocationReason);
    }

    private static async Task<IReadOnlyList<AuthAuditEvent>> ReadAuthAuditEventsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
            .ThenBy(auditEvent => auditEvent.Action)
            .ToListAsync();
    }

    private static HttpRequestMessage CreatePasswordChangeRequest(
        string rawSessionToken,
        string currentPassword,
        string newPassword)
    {
        var request = CreateBearerRequest(rawSessionToken);
        request.Content = CreatePasswordChangeContent(currentPassword, newPassword);
        return request;
    }

    private static HttpRequestMessage CreateBearerRequest(string rawSessionToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, PasswordChangePath);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");
        return request;
    }

    private static HttpRequestMessage CreateCurrentUserRequest(string rawSessionToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, CurrentUserPath);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");
        return request;
    }

    private static StringContent CreatePasswordChangeContent(
        string currentPassword = CurrentPassword,
        string newPassword = NewPassword)
    {
        return CreateJsonContent(new
        {
            currentPassword,
            newPassword
        });
    }

    private static StringContent CreateSignInContent(string password)
    {
        return CreateJsonContent(new
        {
            identifier = SubmittedIdentifier,
            password,
            deviceLabel = "Password change test device"
        });
    }

    private static StringContent CreateRefreshContent(string? refreshCredential)
    {
        return CreateJsonContent(new
        {
            refreshCredential,
            deviceLabel = "Password change refresh test device"
        });
    }

    private static StringContent CreateJsonContent(object value)
    {
        return new StringContent(
            JsonSerializer.Serialize(value),
            Encoding.UTF8,
            "application/json");
    }

    private static async Task AssertNoContentAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(string.Empty, content);
    }

    private static async Task AssertInvalidAuthRequestProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Invalid auth request", content);
        AssertNoUnexpectedResponseText(content, unexpectedResponseText);
    }

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("Unauthenticated", content);
        AssertNoUnexpectedResponseText(content, unexpectedResponseText);
    }

    private static async Task AssertPasswordChangeFailedProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Contains("Password change failed", content);
        AssertNoUnexpectedResponseText(content, unexpectedResponseText);
    }

    private static async Task AssertSignInFailedProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("Sign-in failed", content);
        AssertNoUnexpectedResponseText(content, unexpectedResponseText);
    }

    private static async Task AssertRefreshFailedProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains("Refresh failed", content);
        AssertNoUnexpectedResponseText(content, unexpectedResponseText);
    }

    private static void AssertNoUnexpectedResponseText(string content, params string[] unexpectedResponseText)
    {
        foreach (var unexpected in unexpectedResponseText.Where(value => !string.IsNullOrWhiteSpace(value)))
        {
            Assert.DoesNotContain(unexpected, content, StringComparison.Ordinal);
        }

        var lowerContent = content.ToLowerInvariant();
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("verifier", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
    }

    private static void AssertSafeAuditContent(AuthAuditEvent auditEvent, params string[] forbiddenValues)
    {
        var auditText = string.Join(
            "|",
            auditEvent.Action,
            auditEvent.Outcome,
            auditEvent.SafeMetadataJson ?? string.Empty);
        var lowerAuditText = auditText.ToLowerInvariant();

        foreach (var forbiddenValue in forbiddenValues.Where(value => !string.IsNullOrWhiteSpace(value)))
        {
            Assert.DoesNotContain(forbiddenValue, auditText, StringComparison.Ordinal);
        }

        Assert.DoesNotContain("visible-", auditText, StringComparison.Ordinal);
        Assert.DoesNotContain("verifier", lowerAuditText);
        Assert.DoesNotContain("hash:", lowerAuditText);
        Assert.DoesNotContain("token", lowerAuditText);
        Assert.DoesNotContain("refreshcredential", lowerAuditText);
        Assert.NotNull(auditEvent.SafeMetadataJson);
        Assert.True(auditEvent.SafeMetadataJson!.Length <= 4096);
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

        throw new FileNotFoundException($"Unable to locate repository file '{relativePath}'.");
    }

    private static string ExtractOpenApiPathBlock(string openApi, string pathMarker)
    {
        var start = openApi.IndexOf($"  {pathMarker}", StringComparison.Ordinal);
        Assert.True(start >= 0, $"Missing OpenAPI path marker {pathMarker}.");
        var nextPath = openApi.IndexOf("\n  /", start + pathMarker.Length, StringComparison.Ordinal);
        return nextPath > start ? openApi[start..nextPath] : openApi[start..];
    }

    private static string ExtractOpenApiSchemaBlock(string openApi, string schemaMarker)
    {
        var start = openApi.IndexOf($"    {schemaMarker}", StringComparison.Ordinal);
        Assert.True(start >= 0, $"Missing OpenAPI schema marker {schemaMarker}.");
        var nextSchema = openApi.IndexOf("\n    ", start + schemaMarker.Length, StringComparison.Ordinal);
        while (nextSchema > start && nextSchema + 5 < openApi.Length && openApi[nextSchema + 5] == ' ')
        {
            nextSchema = openApi.IndexOf("\n    ", nextSchema + 1, StringComparison.Ordinal);
        }

        return nextSchema > start ? openApi[start..nextSchema] : openApi[start..];
    }

    private sealed class FakePasswordHashingService : IPasswordHashingService
    {
        public const string CurrentPolicyVersion = "argon2id-test-v1";
        public const string CurrentParametersJson = """{"format":"fake-current"}""";

        private readonly string? passwordToFailHashing;

        public FakePasswordHashingService()
        {
        }

        public FakePasswordHashingService(string passwordToFailHashing)
        {
            this.passwordToFailHashing = passwordToFailHashing;
        }

        public static string HashFor(string plaintextPassword)
        {
            return $"hash:{plaintextPassword}";
        }

        public PasswordHashResult HashPassword(string plaintextPassword)
        {
            if (StringComparer.Ordinal.Equals(plaintextPassword, passwordToFailHashing))
            {
                return PasswordHashResult.Failure(PasswordHashFailureReason.HashingFailed);
            }

            return PasswordHashResult.Success(
                HashFor(plaintextPassword),
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

            return StringComparer.Ordinal.Equals(storedHash.Verifier, HashFor(submittedPassword))
                ? PasswordVerificationResult.Verified(PasswordRehashDecision.NotRequired)
                : PasswordVerificationResult.Failure(PasswordVerificationStatus.WrongPassword);
        }

        public PasswordRehashDecision CheckRehashRequired(StoredPasswordHash storedHash)
        {
            return PasswordRehashDecision.NotRequired;
        }
    }

    private sealed class EndpointTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public EndpointTestTimeProvider(DateTimeOffset initialUtcNow)
        {
            utcNow = initialUtcNow;
        }

        public override DateTimeOffset GetUtcNow()
        {
            return utcNow;
        }
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        EndpointTestTimeProvider TimeProvider);

    private sealed record SeededAccount(
        Guid AuthAccountId,
        Guid UserProfileId);

    private sealed record SignInResult(
        Guid AuthSessionId,
        string RawSessionToken,
        string RawRefreshCredential);
}
