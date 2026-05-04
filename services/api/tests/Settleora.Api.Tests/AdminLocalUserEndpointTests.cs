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
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class AdminLocalUserEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string AdminUsersPath = "/api/v1/admin/users";
    private const string AdminLocalUsersPath = "/api/v1/admin/users/local";
    private const string SignInPath = "/api/v1/auth/sign-in";
    private const string SubmittedIdentifier = "  New.Local.User@Example.COM  ";
    private const string NormalizedIdentifier = "new.local.user@example.com";
    private const string SubmittedPassword = "visible-admin-created-password";
    private const string ShortPassword = "too-short";
    private const string DisplayName = "  Admin Created User  ";
    private const string TrimmedDisplayName = "Admin Created User";
    private const string VerifierFragment = "visible-admin-user-verifier";
    private const string WrongRawToken = "visible-wrong-admin-user-session-token";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 4, 13, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 4, 13, 15, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 4, 13, 30, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public AdminLocalUserEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    public static TheoryData<string?> InvalidPasswords => new()
    {
        "   ",
        ShortPassword,
        new string('p', 4097)
    };

    [Fact]
    public async Task OwnerCanListUsers()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        var olderUser = await SeedAccountAsync(
            testFactory,
            "Older User",
            InitialTimestamp.AddMinutes(1),
            roles: [SystemRoles.User]);
        var newerUser = await SeedAccountAsync(
            testFactory,
            "Newer User",
            InitialTimestamp.AddMinutes(2),
            roles: [SystemRoles.Admin, SystemRoles.User]);
        await SeedAccountAsync(
            testFactory,
            "Deleted Profile",
            InitialTimestamp.AddMinutes(3),
            roles: [SystemRoles.User],
            deletedProfileAtUtc: ValidationTimestamp);
        await SeedAccountAsync(
            testFactory,
            "Deleted Account",
            InitialTimestamp.AddMinutes(4),
            roles: [SystemRoles.User],
            deletedAccountAtUtc: ValidationTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, AdminUsersPath, ownerSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var users = payload.RootElement.GetProperty("users")
            .EnumerateArray()
            .Select(ReadAdminUserSummary)
            .ToArray();

        Assert.Equal(
            [ownerSession.UserProfileId, olderUser.UserProfileId, newerUser.UserProfileId],
            users.Select(user => user.UserProfileId).ToArray());
        Assert.Equal(
            ["Owner Actor", "Older User", "Newer User"],
            users.Select(user => user.DisplayName).ToArray());
        Assert.Equal([SystemRoles.Admin, SystemRoles.User], users[2].Roles);
    }

    [Fact]
    public async Task AdminCanListUsers()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var adminSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Admin],
            "Admin Actor",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, AdminUsersPath, adminSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Single(payload.RootElement.GetProperty("users").EnumerateArray());
    }

    [Fact]
    public async Task NormalUserCannotListUsers()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var userSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.User],
            "Normal User",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, AdminUsersPath, userSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertForbiddenProblemAsync(response);
    }

    [Fact]
    public async Task UnauthenticatedRequestReturnsUniformUnauthorized()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var missingResponse = await client.GetAsync(AdminUsersPath);
        await AssertUnauthenticatedProblemAsync(missingResponse);

        using var invalidRequest = CreateBearerRequest(HttpMethod.Get, AdminUsersPath, WrongRawToken);
        using var invalidResponse = await client.SendAsync(invalidRequest);
        await AssertUnauthenticatedProblemAsync(invalidResponse, WrongRawToken);
    }

    [Theory]
    [InlineData(SystemRoles.Owner)]
    [InlineData(SystemRoles.Admin)]
    public async Task OwnerOrAdminCanCreateLocalUserWithUserRoleOnly(string actorRole)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actorSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [actorRole],
            $"{actorRole} Actor",
            InitialTimestamp);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            AdminLocalUsersPath,
            actorSession.RawSessionToken,
            CreateLocalUserContent());

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        using var payload = JsonDocument.Parse(content);
        var user = ReadAdminUserSummary(payload.RootElement);
        Assert.Equal(TrimmedDisplayName, user.DisplayName);
        Assert.Equal("HKD", user.DefaultCurrency);
        Assert.Equal(AuthAccountStatuses.Active, user.AccountStatus);
        Assert.Equal([SystemRoles.User], user.Roles);
        Assert.Equal(WriteTimestamp, user.CreatedAtUtc);
        Assert.Equal(WriteTimestamp, user.UpdatedAtUtc);
        Assert.Equal($"/api/v1/admin/users/{user.UserProfileId:D}", response.Headers.Location?.OriginalString);

        var rows = await ReadCreatedLocalUserRowsAsync(testFactory, user.UserProfileId);
        Assert.Equal(user.AuthAccountId, rows.AuthAccount.Id);
        Assert.Equal(NormalizedIdentifier, rows.AuthIdentity.ProviderSubject);
        Assert.Equal(VerifierFragment, rows.LocalPasswordCredential.PasswordHash);
        Assert.Equal([SystemRoles.User], rows.Roles);
        Assert.Equal(actorSession.AuthAccountId, rows.RoleAssignment.AssignedByAuthAccountId);
        Assert.Contains(
            rows.AuditEvents,
            auditEvent => auditEvent.ActorAuthAccountId == actorSession.AuthAccountId
                && auditEvent.SubjectAuthAccountId == user.AuthAccountId
                && auditEvent.Action == "admin.local_user.created"
                && auditEvent.Outcome == AuthAuditOutcomes.Success);
    }

    [Fact]
    public async Task CreatedLocalUserCanSignInThroughExistingLocalSignInEndpoint()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            AdminLocalUsersPath,
            ownerSession.RawSessionToken,
            CreateLocalUserContent(defaultCurrency: null));

        using var createResponse = await client.SendAsync(createRequest);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        using var signInResponse = await client.PostAsync(
            SignInPath,
            CreateJsonContent(new
            {
                identifier = SubmittedIdentifier,
                password = SubmittedPassword,
                deviceLabel = "Admin-created user sign-in"
            }));

        Assert.Equal(HttpStatusCode.OK, signInResponse.StatusCode);
        using var payload = JsonDocument.Parse(await signInResponse.Content.ReadAsStringAsync());
        Assert.False(string.IsNullOrWhiteSpace(payload.RootElement.GetProperty("session").GetProperty("token").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(payload.RootElement.GetProperty("refreshCredential").GetProperty("token").GetString()));
    }

    [Fact]
    public async Task DuplicateIdentifierReturnsConflictWithoutPartialDuplicateRows()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        using var client = testFactory.CreateClient();

        using var firstRequest = CreateJsonRequest(
            HttpMethod.Post,
            AdminLocalUsersPath,
            ownerSession.RawSessionToken,
            CreateLocalUserContent());
        using var firstResponse = await client.SendAsync(firstRequest);
        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);

        using var duplicateRequest = CreateJsonRequest(
            HttpMethod.Post,
            AdminLocalUsersPath,
            ownerSession.RawSessionToken,
            CreateLocalUserContent(
                identifier: "new.local.user@example.com",
                password: "visible-second-password",
                displayName: "Second Duplicate"));
        using var duplicateResponse = await client.SendAsync(duplicateRequest);

        await AssertConflictProblemAsync(
            duplicateResponse,
            "new.local.user@example.com",
            "visible-second-password",
            "Second Duplicate");
        Assert.Equal(new RowCounts(2, 2, 1, 1, 2), await ReadRowCountsAsync(testFactory));
    }

    [Theory]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task InvalidIdentifierIsRejected(string? submittedIdentifier)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            AdminLocalUsersPath,
            ownerSession.RawSessionToken,
            CreateLocalUserContent(identifier: submittedIdentifier));

        using var response = await client.SendAsync(request);

        await AssertInvalidAdminUserRequestProblemAsync(response);
        Assert.Equal(new RowCounts(1, 1, 0, 0, 1), await ReadRowCountsAsync(testFactory));
    }

    [Fact]
    public async Task OverlongIdentifierIsRejected()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            AdminLocalUsersPath,
            ownerSession.RawSessionToken,
            CreateLocalUserContent(identifier: new string('a', LocalAccountIdentifier.MaxLength + 1)));

        using var response = await client.SendAsync(request);

        await AssertInvalidAdminUserRequestProblemAsync(response);
        Assert.Equal(new RowCounts(1, 1, 0, 0, 1), await ReadRowCountsAsync(testFactory));
    }

    [Theory]
    [MemberData(nameof(InvalidPasswords))]
    public async Task InvalidPasswordIsRejected(string? submittedPassword)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            AdminLocalUsersPath,
            ownerSession.RawSessionToken,
            CreateLocalUserContent(password: submittedPassword));

        using var response = await client.SendAsync(request);

        await AssertInvalidAdminUserRequestProblemAsync(response, submittedPassword ?? string.Empty);
        Assert.Equal(new RowCounts(1, 1, 0, 0, 1), await ReadRowCountsAsync(testFactory));
    }

    [Theory]
    [InlineData("   ")]
    public async Task BlankDisplayNameIsRejected(string submittedDisplayName)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            AdminLocalUsersPath,
            ownerSession.RawSessionToken,
            CreateLocalUserContent(displayName: submittedDisplayName));

        using var response = await client.SendAsync(request);

        await AssertInvalidAdminUserRequestProblemAsync(response);
        Assert.Equal(new RowCounts(1, 1, 0, 0, 1), await ReadRowCountsAsync(testFactory));
    }

    [Fact]
    public async Task OverlongDisplayNameIsRejected()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            AdminLocalUsersPath,
            ownerSession.RawSessionToken,
            CreateLocalUserContent(displayName: new string('d', UserProfileConstraints.DisplayNameMaxLength + 1)));

        using var response = await client.SendAsync(request);

        await AssertInvalidAdminUserRequestProblemAsync(response);
        Assert.Equal(new RowCounts(1, 1, 0, 0, 1), await ReadRowCountsAsync(testFactory));
    }

    [Theory]
    [InlineData("usd")]
    [InlineData("US1")]
    [InlineData("USDX")]
    public async Task InvalidDefaultCurrencyIsRejected(string submittedCurrency)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            AdminLocalUsersPath,
            ownerSession.RawSessionToken,
            CreateLocalUserContent(defaultCurrency: submittedCurrency));

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        await AssertInvalidAdminUserRequestProblemAsync(response, content);
        Assert.DoesNotContain(submittedCurrency, content);
        Assert.Equal(new RowCounts(1, 1, 0, 0, 1), await ReadRowCountsAsync(testFactory));
    }

    [Fact]
    public async Task ExplicitNullDefaultCurrencyIsAccepted()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            AdminLocalUsersPath,
            ownerSession.RawSessionToken,
            CreateLocalUserContent(defaultCurrency: null));

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Null, payload.RootElement.GetProperty("defaultCurrency").ValueKind);

        var userProfileId = payload.RootElement.GetProperty("userProfileId").GetGuid();
        var rows = await ReadCreatedLocalUserRowsAsync(testFactory, userProfileId);
        Assert.Null(rows.UserProfile.DefaultCurrency);
    }

    [Fact]
    public async Task ClientSubmittedRoleFieldsAreRejected()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateJsonRequest(
            HttpMethod.Post,
            AdminLocalUsersPath,
            ownerSession.RawSessionToken,
            JsonSerializer.Serialize(new
            {
                identifier = SubmittedIdentifier,
                password = SubmittedPassword,
                displayName = DisplayName,
                roles = new[] { SystemRoles.Owner, SystemRoles.Admin }
            }));

        using var response = await client.SendAsync(request);

        await AssertInvalidAdminUserRequestProblemAsync(response);
        Assert.Equal(new RowCounts(1, 1, 0, 0, 1), await ReadRowCountsAsync(testFactory));
    }

    [Fact]
    public async Task GetByProfileIdReturnsSafeSummary()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        var targetUser = await SeedAccountAsync(
            testFactory,
            "Target User",
            InitialTimestamp.AddMinutes(1),
            roles: [SystemRoles.User],
            defaultCurrency: null);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            $"{AdminUsersPath}/{targetUser.UserProfileId:D}",
            ownerSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var content = await response.Content.ReadAsStringAsync();
        using var payload = JsonDocument.Parse(content);
        var user = ReadAdminUserSummary(payload.RootElement);
        Assert.Equal(targetUser.UserProfileId, user.UserProfileId);
        Assert.Equal(targetUser.AuthAccountId, user.AuthAccountId);
        Assert.Equal("Target User", user.DisplayName);
        Assert.Null(user.DefaultCurrency);
        AssertSafeAdminUserResponseContent(content);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("deleted-profile")]
    [InlineData("missing-account")]
    [InlineData("deleted-account")]
    public async Task GetMissingOrDeletedProfileReturnsSafeNotFound(string state)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        var requestedProfileId = await SeedUnavailableProfileAsync(testFactory, state);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(
            HttpMethod.Get,
            $"{AdminUsersPath}/{requestedProfileId:D}",
            ownerSession.RawSessionToken);

        using var response = await client.SendAsync(request);

        await AssertUserUnavailableProblemAsync(response);
    }

    [Fact]
    public async Task AdminUserResponsesExcludeSecretsProviderPayloadsSessionRowsAuditMetadataAndStoragePaths()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var ownerSession = await SeedSessionActorAsync(
            testFactory,
            testContext.TimeProvider,
            [SystemRoles.Owner],
            "Owner Actor",
            InitialTimestamp);
        using var client = testFactory.CreateClient();
        using var createRequest = CreateJsonRequest(
            HttpMethod.Post,
            AdminLocalUsersPath,
            ownerSession.RawSessionToken,
            CreateLocalUserContent());

        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        AssertSafeAdminUserResponseContent(createContent);
        Assert.DoesNotContain(SubmittedIdentifier.Trim(), createContent);
        Assert.DoesNotContain(NormalizedIdentifier, createContent);
        Assert.DoesNotContain(SubmittedPassword, createContent);
        Assert.DoesNotContain(VerifierFragment, createContent);

        using var payload = JsonDocument.Parse(createContent);
        var userProfileId = payload.RootElement.GetProperty("userProfileId").GetGuid();
        using var getRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{AdminUsersPath}/{userProfileId:D}",
            ownerSession.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        AssertSafeAdminUserResponseContent(await getResponse.Content.ReadAsStringAsync());

        using var listRequest = CreateBearerRequest(HttpMethod.Get, AdminUsersPath, ownerSession.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        AssertSafeAdminUserResponseContent(await listResponse.Content.ReadAsStringAsync());
    }

    [Fact]
    public void OpenApiContractDefinesGuardedAdminLocalUserFoundation()
    {
        var openApiPath = FindRepoFile("packages/contracts/openapi/settleora.v1.yaml");
        var openApi = File.ReadAllText(openApiPath);
        var listPathBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/admin/users:");
        var getPathBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/admin/users/{userProfileId}:");
        var createPathBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/admin/users/local:");
        var createRequestSchema = ExtractOpenApiSchemaBlock(openApi, "CreateLocalUserRequest:");
        var summarySchema = ExtractOpenApiSchemaBlock(openApi, "AdminUserSummaryResponse:");

        Assert.Contains("operationId: listAdminUsers", listPathBlock);
        Assert.Contains("SessionBearerAuth", listPathBlock);
        Assert.Contains("operationId: getAdminUser", getPathBlock);
        Assert.Contains("userProfileId", getPathBlock);
        Assert.Contains("operationId: createAdminLocalUser", createPathBlock);
        Assert.Contains("\"409\":", createPathBlock);
        Assert.DoesNotContain("security: []", listPathBlock);
        Assert.DoesNotContain("security: []", getPathBlock);
        Assert.DoesNotContain("security: []", createPathBlock);
        Assert.Contains("identifier:", createRequestSchema);
        Assert.Contains("password:", createRequestSchema);
        Assert.Contains("minLength: 12", createRequestSchema);
        Assert.Contains("displayName:", createRequestSchema);
        Assert.Contains("defaultCurrency:", createRequestSchema);
        Assert.DoesNotContain("roles:", createRequestSchema);
        Assert.Contains("userProfileId:", summarySchema);
        Assert.Contains("authAccountId:", summarySchema);
        Assert.Contains("accountStatus:", summarySchema);
        Assert.Contains("roles:", summarySchema);
        Assert.DoesNotContain("identifier:", summarySchema);
        Assert.DoesNotContain("providerSubject:", summarySchema);
        Assert.DoesNotContain("passwordHash:", summarySchema);
        Assert.DoesNotContain("session:", summarySchema);
        Assert.DoesNotContain("refreshCredential:", summarySchema);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new AdminUserTestTimeProvider(InitialTimestamp);
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

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        AdminUserTestTimeProvider timeProvider,
        IReadOnlyList<string> roles,
        string displayName,
        DateTimeOffset createdAtUtc)
    {
        timeProvider.SetUtcNow(createdAtUtc);
        var account = await SeedAccountAsync(
            testFactory,
            displayName,
            createdAtUtc,
            roles);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Admin user endpoint test",
                UserAgentSummary: "Admin user endpoint test user agent",
                NetworkAddressHash: "admin-user-endpoint-test-network",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededSession(
            account.AuthAccountId,
            account.UserProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            sessionCreationResult.SessionExpiresAtUtc.Value);
    }

    private static async Task<SeededAccount> SeedAccountAsync(
        WebApplicationFactory<Program> testFactory,
        string displayName,
        DateTimeOffset createdAtUtc,
        IReadOnlyList<string> roles,
        string? defaultCurrency = "USD",
        DateTimeOffset? deletedProfileAtUtc = null,
        DateTimeOffset? deletedAccountAtUtc = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();

        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
            DefaultCurrency = defaultCurrency,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            DeletedAtUtc = deletedProfileAtUtc
        });
        dbContext.Set<AuthAccount>().Add(new AuthAccount
        {
            Id = authAccountId,
            UserProfileId = userProfileId,
            Status = AuthAccountStatuses.Active,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = createdAtUtc,
            DeletedAtUtc = deletedAccountAtUtc
        });

        foreach (var role in roles)
        {
            dbContext.Set<SystemRoleAssignment>().Add(new SystemRoleAssignment
            {
                AuthAccountId = authAccountId,
                Role = role,
                AssignedAtUtc = createdAtUtc
            });
        }

        await dbContext.SaveChangesAsync();
        return new SeededAccount(authAccountId, userProfileId);
    }

    private static async Task<Guid> SeedUnavailableProfileAsync(
        WebApplicationFactory<Program> testFactory,
        string state)
    {
        if (state == "missing")
        {
            return Guid.NewGuid();
        }

        if (state == "missing-account")
        {
            using var scope = testFactory.Services.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
            var userProfileId = Guid.NewGuid();
            dbContext.Set<UserProfile>().Add(new UserProfile
            {
                Id = userProfileId,
                DisplayName = "Profile Without Account",
                DefaultCurrency = "USD",
                CreatedAtUtc = InitialTimestamp,
                UpdatedAtUtc = InitialTimestamp
            });

            await dbContext.SaveChangesAsync();
            return userProfileId;
        }

        var account = await SeedAccountAsync(
            testFactory,
            "Unavailable User",
            InitialTimestamp,
            roles: [SystemRoles.User],
            deletedProfileAtUtc: state == "deleted-profile" ? ValidationTimestamp : null,
            deletedAccountAtUtc: state == "deleted-account" ? ValidationTimestamp : null);
        return account.UserProfileId;
    }

    private static async Task<CreatedLocalUserRows> ReadCreatedLocalUserRowsAsync(
        WebApplicationFactory<Program> testFactory,
        Guid userProfileId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var authAccount = await dbContext.Set<AuthAccount>()
            .AsNoTracking()
            .SingleAsync(account => account.UserProfileId == userProfileId);
        var userProfile = await dbContext.Set<UserProfile>()
            .AsNoTracking()
            .SingleAsync(profile => profile.Id == userProfileId);
        var authIdentity = await dbContext.Set<AuthIdentity>()
            .AsNoTracking()
            .SingleAsync(identity => identity.AuthAccountId == authAccount.Id);
        var localPasswordCredential = await dbContext.Set<LocalPasswordCredential>()
            .AsNoTracking()
            .SingleAsync(credential => credential.AuthAccountId == authAccount.Id);
        var roleAssignment = await dbContext.Set<SystemRoleAssignment>()
            .AsNoTracking()
            .SingleAsync(role => role.AuthAccountId == authAccount.Id);
        var roles = await dbContext.Set<SystemRoleAssignment>()
            .AsNoTracking()
            .Where(role => role.AuthAccountId == authAccount.Id)
            .Select(role => role.Role)
            .ToArrayAsync();
        var auditEvents = await dbContext.Set<AuthAuditEvent>()
            .AsNoTracking()
            .Where(auditEvent => auditEvent.SubjectAuthAccountId == authAccount.Id)
            .ToArrayAsync();

        return new CreatedLocalUserRows(
            userProfile,
            authAccount,
            authIdentity,
            localPasswordCredential,
            roleAssignment,
            roles,
            auditEvents);
    }

    private static async Task<RowCounts> ReadRowCountsAsync(
        WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        return new RowCounts(
            await dbContext.Set<UserProfile>().CountAsync(),
            await dbContext.Set<AuthAccount>().CountAsync(),
            await dbContext.Set<AuthIdentity>().CountAsync(),
            await dbContext.Set<LocalPasswordCredential>().CountAsync(),
            await dbContext.Set<SystemRoleAssignment>().CountAsync());
    }

    private static string CreateLocalUserContent(
        string? identifier = SubmittedIdentifier,
        string? password = SubmittedPassword,
        string? displayName = DisplayName,
        string? defaultCurrency = "HKD")
    {
        return JsonSerializer.Serialize(new
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

    private static HttpRequestMessage CreateJsonRequest(
        HttpMethod method,
        string path,
        string rawSessionToken,
        string json)
    {
        var request = CreateBearerRequest(method, path, rawSessionToken);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        return request;
    }

    private static AdminUserPayload ReadAdminUserSummary(JsonElement root)
    {
        Assert.Equal(8, root.EnumerateObject().Count());

        return new AdminUserPayload(
            root.GetProperty("userProfileId").GetGuid(),
            root.GetProperty("authAccountId").GetGuid(),
            root.GetProperty("displayName").GetString()!,
            root.GetProperty("defaultCurrency").ValueKind is JsonValueKind.Null
                ? null
                : root.GetProperty("defaultCurrency").GetString(),
            root.GetProperty("accountStatus").GetString()!,
            root.GetProperty("roles").EnumerateArray().Select(role => role.GetString()!).ToArray(),
            root.GetProperty("createdAtUtc").GetDateTimeOffset(),
            root.GetProperty("updatedAtUtc").GetDateTimeOffset());
    }

    private static async Task AssertInvalidAdminUserRequestProblemAsync(
        HttpResponseMessage response,
        string? content = null)
    {
        content = content is not null && content.StartsWith('{')
            ? content
            : await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid admin user request", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The submitted admin user request is invalid.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertConflictProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content, unexpectedResponseText);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Admin user conflict", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(409, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "Unable to create local user with the submitted information.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);
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

    private static async Task AssertForbiddenProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Forbidden", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(403, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The authenticated actor is not allowed to access this resource.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static async Task AssertUserUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafeProblemContent(content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Admin user unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(
            "The requested user is unavailable.",
            payload.RootElement.GetProperty("detail").GetString());
    }

    private static void AssertSafeProblemContent(
        string content,
        params string[] unexpectedResponseText)
    {
        var lowerContent = content.ToLowerInvariant();

        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("verifier", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("metadata", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("path", lowerContent);
        Assert.DoesNotContain(VerifierFragment, content);
        Assert.DoesNotContain(SubmittedPassword, content);

        foreach (var unexpected in unexpectedResponseText)
        {
            Assert.DoesNotContain(unexpected, content);
        }
    }

    private static void AssertSafeAdminUserResponseContent(string content)
    {
        var lowerContent = content.ToLowerInvariant();

        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("verifier", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("payload", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("refresh", lowerContent);
        Assert.DoesNotContain("audit", lowerContent);
        Assert.DoesNotContain("metadata", lowerContent);
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
        AdminUserTestTimeProvider TimeProvider);

    private sealed record SeededAccount(
        Guid AuthAccountId,
        Guid UserProfileId);

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset SessionExpiresAtUtc);

    private sealed record CreatedLocalUserRows(
        UserProfile UserProfile,
        AuthAccount AuthAccount,
        AuthIdentity AuthIdentity,
        LocalPasswordCredential LocalPasswordCredential,
        SystemRoleAssignment RoleAssignment,
        IReadOnlyList<string> Roles,
        IReadOnlyList<AuthAuditEvent> AuditEvents);

    private sealed record RowCounts(
        int UserProfiles,
        int AuthAccounts,
        int AuthIdentities,
        int LocalPasswordCredentials,
        int SystemRoleAssignments);

    private sealed record AdminUserPayload(
        Guid UserProfileId,
        Guid AuthAccountId,
        string DisplayName,
        string? DefaultCurrency,
        string AccountStatus,
        IReadOnlyList<string> Roles,
        DateTimeOffset CreatedAtUtc,
        DateTimeOffset UpdatedAtUtc);

    private sealed class AdminUserTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public AdminUserTestTimeProvider(DateTimeOffset utcNow)
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

    private sealed class FakePasswordHashingService : IPasswordHashingService
    {
        public const string CurrentPolicyVersion = "argon2id-admin-user-test-v1";
        public const string CurrentParametersJson = """{"format":"fake-admin-user-current"}""";

        public PasswordHashResult HashPassword(string plaintextPassword)
        {
            Assert.DoesNotContain(plaintextPassword, VerifierFragment);

            return PasswordHashResult.Success(
                VerifierFragment,
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
