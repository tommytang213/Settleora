using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.Authorization;
using Settleora.Api.Auth.Invitations;
using Settleora.Api.Auth.Sessions;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class InvitationPolicyRuntimeTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string CapabilityPath = "/api/v1/auth/invitations/capability";
    private const string AdminPolicyPath = "/api/v1/admin/auth/invitation-policy";
    private const string WrongRawToken = "wrong-visible-invitation-policy-session-token";
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 7, 8, 10, 50, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = InitialTimestamp.AddMinutes(10);
    private static readonly DateTimeOffset UpdateTimestamp = InitialTimestamp.AddMinutes(20);

    private readonly WebApplicationFactory<Program> factory;

    public InvitationPolicyRuntimeTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task AuthenticatedCapabilityReadoutDefaultsOffAndDoesNotExposeSecrets()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.User], "Normal User");
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, CapabilityPath, session.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafeInvitationPolicyContent(content);

        using var payload = JsonDocument.Parse(content);
        var capability = payload.RootElement.GetProperty("capability");
        Assert.Equal("disabled", capability.GetProperty("capabilityState").GetString());
        Assert.Equal("disabled", capability.GetProperty("defaultState").GetString());
        Assert.False(capability.GetProperty("canCurrentActorManageInvitations").GetBoolean());
        Assert.False(capability.GetProperty("canCurrentActorCreateInvitations").GetBoolean());
        Assert.False(capability.GetProperty("canCurrentActorMutatePolicy").GetBoolean());
        Assert.False(capability.GetProperty("publicAcceptEnabled").GetBoolean());
        Assert.False(capability.GetProperty("pendingInviteGraceWhenDisabled").GetBoolean());
        Assert.Equal("unconfigured", capability.GetProperty("deliveryReadiness").GetString());
        Assert.Equal("default_disabled", capability.GetProperty("readoutCategory").GetString());
    }

    [Theory]
    [InlineData(SystemRoles.Owner)]
    [InlineData(SystemRoles.Admin)]
    public async Task OwnerOrAdminCanReadAndUpdatePolicy(string role)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [role], $"{role} Actor");
        using var client = testFactory.CreateClient();

        using var getRequest = CreateBearerRequest(HttpMethod.Get, AdminPolicyPath, session.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var defaultContent = await getResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        AssertSafeInvitationPolicyContent(defaultContent);
        using (var defaultPayload = JsonDocument.Parse(defaultContent))
        {
            Assert.Equal("default-v1", defaultPayload.RootElement.GetProperty("policyVersion").GetString());
            Assert.Equal("disabled", defaultPayload.RootElement.GetProperty("capability").GetProperty("capabilityState").GetString());
        }

        testContext.TimeProvider.SetUtcNow(UpdateTimestamp);
        using var patchRequest = CreateBearerRequest(HttpMethod.Patch, AdminPolicyPath, session.RawSessionToken);
        patchRequest.Content = JsonContent("""{"capabilityState":"enabled","pendingInviteGraceWhenDisabled":true}""");
        using var patchResponse = await client.SendAsync(patchRequest);
        var patchContent = await patchResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, patchResponse.StatusCode);
        AssertSafeInvitationPolicyContent(patchContent);
        using var patchPayload = JsonDocument.Parse(patchContent);
        var capability = patchPayload.RootElement.GetProperty("capability");
        Assert.Equal("policy-v1", patchPayload.RootElement.GetProperty("policyVersion").GetString());
        Assert.Equal(UpdateTimestamp, patchPayload.RootElement.GetProperty("updatedAtUtc").GetDateTimeOffset());
        Assert.Equal("enabled", capability.GetProperty("capabilityState").GetString());
        Assert.True(capability.GetProperty("canCurrentActorManageInvitations").GetBoolean());
        Assert.True(capability.GetProperty("canCurrentActorCreateInvitations").GetBoolean());
        Assert.True(capability.GetProperty("canCurrentActorMutatePolicy").GetBoolean());
        Assert.True(capability.GetProperty("publicAcceptEnabled").GetBoolean());
        Assert.True(capability.GetProperty("pendingInviteGraceWhenDisabled").GetBoolean());
        Assert.Equal("enabled_by_admin_policy", capability.GetProperty("readoutCategory").GetString());
    }

    [Fact]
    public async Task NormalUserAndAnonymousCallersCannotAccessAdminPolicyEndpoints()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.User], "Normal User");
        using var client = testFactory.CreateClient();

        using var anonymousGet = await client.GetAsync(AdminPolicyPath);
        using var anonymousPatch = await client.PatchAsync(AdminPolicyPath, JsonContent("""{"capabilityState":"enabled"}"""));
        using var invalidTokenGet = await client.SendAsync(CreateBearerRequest(HttpMethod.Get, AdminPolicyPath, WrongRawToken));
        using var userGetRequest = CreateBearerRequest(HttpMethod.Get, AdminPolicyPath, session.RawSessionToken);
        using var userGet = await client.SendAsync(userGetRequest);
        using var userPatchRequest = CreateBearerRequest(HttpMethod.Patch, AdminPolicyPath, session.RawSessionToken);
        userPatchRequest.Content = JsonContent("""{"capabilityState":"enabled"}""");
        using var userPatch = await client.SendAsync(userPatchRequest);

        Assert.Equal(HttpStatusCode.Unauthorized, anonymousGet.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousPatch.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, invalidTokenGet.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, userGet.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, userPatch.StatusCode);
    }

    [Theory]
    [InlineData(CapabilityPath)]
    [InlineData(AdminPolicyPath)]
    public async Task PolicyGetRequestsResolveCurrentActorBeforeRejectingRequestShape(string path)
    {
        var testContext = CreateFactory(services =>
        {
            services.RemoveAll<ICurrentActorAccessor>();
            services.AddScoped<ICurrentActorAccessor, NoCurrentActorAccessor>();
        });
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Policy Owner");
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, $"{path}?unexpected=true", session.RawSessionToken);
        request.Content = JsonContent("""{"unexpected":true}""");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(CapabilityPath)]
    [InlineData(AdminPolicyPath)]
    public async Task AuthenticatedPolicyGetRequestsRejectUnsupportedRequestShape(string path)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Policy Owner");
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Get, $"{path}?unexpected=true", session.RawSessionToken);
        request.Content = JsonContent("""{"unexpected":true}""");

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Invalid invitation policy request", content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PolicyChangesPersistAcrossScopesAndWriteSafeAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Policy Owner");
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(UpdateTimestamp);
        using var patchRequest = CreateBearerRequest(HttpMethod.Patch, AdminPolicyPath, session.RawSessionToken);
        patchRequest.Content = JsonContent("""{"capabilityState":"enabled"}""");
        using var patchResponse = await client.SendAsync(patchRequest);

        Assert.Equal(HttpStatusCode.OK, patchResponse.StatusCode);

        using (var scope = testFactory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
            var policy = await dbContext.Set<AuthInvitationPolicy>().AsNoTracking().SingleAsync();
            var audit = await dbContext.Set<AuthAuditEvent>().AsNoTracking()
                .SingleAsync(auditEvent => auditEvent.Action == "invitation.policy_changed");

            Assert.Equal(1, policy.PolicyVersion);
            Assert.Equal("active", policy.Status);
            Assert.Equal("enabled", policy.CapabilityState);
            Assert.False(policy.PendingInviteGraceWhenDisabled);
            Assert.Equal(session.AuthAccountId, policy.ChangedByAuthAccountId);
            Assert.Equal(session.AuthAccountId, audit.ActorAuthAccountId);
            Assert.Null(audit.SubjectAuthAccountId);
            Assert.Equal(AuthAuditOutcomes.Success, audit.Outcome);
            AssertSafeInvitationPolicyContent(audit.SafeMetadataJson ?? string.Empty);
            Assert.Contains("invitation_policy", audit.SafeMetadataJson, StringComparison.Ordinal);
            Assert.Contains("policy_changed", audit.SafeMetadataJson, StringComparison.Ordinal);
            Assert.Contains("priorCapabilityState", audit.SafeMetadataJson, StringComparison.Ordinal);
            Assert.Contains("newCapabilityState", audit.SafeMetadataJson, StringComparison.Ordinal);
        }

        using (var scope = testFactory.Services.CreateScope())
        {
            var service = scope.ServiceProvider.GetRequiredService<IInvitationPolicyService>();
            var readout = await service.GetAdminPolicyReadoutAsync(
                new Settleora.Api.Auth.Authorization.AuthenticatedActor(
                    session.AuthAccountId,
                    session.UserProfileId,
                    session.AuthSessionId,
                    session.ExpiresAtUtc,
                    [SystemRoles.Owner]),
                CancellationToken.None);

            Assert.Equal("policy-v1", readout.PolicyVersion);
            Assert.Equal("enabled", readout.Capability.CapabilityState);
            Assert.True(readout.Capability.CanCurrentActorCreateInvitations);
        }
    }

    [Fact]
    public async Task RepeatedIdempotentUpdateDoesNotWriteDuplicateAudit()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Admin], "Policy Admin");
        using var client = testFactory.CreateClient();

        for (var index = 0; index < 2; index++)
        {
            using var patchRequest = CreateBearerRequest(HttpMethod.Patch, AdminPolicyPath, session.RawSessionToken);
            patchRequest.Content = JsonContent("""{"capabilityState":"enabled"}""");
            using var patchResponse = await client.SendAsync(patchRequest);
            Assert.Equal(HttpStatusCode.OK, patchResponse.StatusCode);
        }

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        Assert.Equal(1, await dbContext.Set<AuthInvitationPolicy>().CountAsync());
        Assert.Equal(1, await dbContext.Set<AuthAuditEvent>()
            .CountAsync(auditEvent => auditEvent.Action == "invitation.policy_changed"));
    }

    [Fact]
    public async Task PolicyUpdateDoesNotMutateInvitationRowsPasswordResetRowsOrSessionCredentials()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Policy Owner");
        using var client = testFactory.CreateClient();

        using var patchRequest = CreateBearerRequest(HttpMethod.Patch, AdminPolicyPath, session.RawSessionToken);
        patchRequest.Content = JsonContent("""{"capabilityState":"enabled","pendingInviteGraceWhenDisabled":false}""");
        using var patchResponse = await client.SendAsync(patchRequest);

        Assert.Equal(HttpStatusCode.OK, patchResponse.StatusCode);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        Assert.Empty(await dbContext.Set<AuthInvitation>().ToListAsync());
        Assert.Empty(await dbContext.Set<AuthPasswordResetRequest>().ToListAsync());
        var authSession = await dbContext.Set<AuthSession>().SingleAsync(authSession => authSession.Id == session.AuthSessionId);
        Assert.Equal(AuthSessionStatuses.Active, authSession.Status);
        Assert.NotEmpty(authSession.SessionTokenHash);
        Assert.DoesNotContain(session.RawSessionToken, authSession.SessionTokenHash, StringComparison.Ordinal);
    }

    [Fact]
    public void InvitationPolicyMigrationIsAdditivePolicyStateOnly()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddAuthInvitationPolicyRuntime", StringComparison.Ordinal));

        var migration = new AddAuthInvitationPolicyRuntime();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation);

        var createTable = Assert.Single(migration.UpOperations.OfType<CreateTableOperation>());
        Assert.Equal("auth_invitation_policies", createTable.Name);
        Assert.Equal(["id"], createTable.PrimaryKey!.Columns);
        Assert.Contains(createTable.Columns, column => column.Name == "capability_state");
        Assert.Contains(createTable.Columns, column => column.Name == "pending_invite_grace_when_disabled");
        Assert.DoesNotContain(createTable.Columns, column => IsForbiddenColumn(column.Name));

        var affectedTables = migration.UpOperations
            .SelectMany(operation => operation switch
            {
                CreateTableOperation table => new[] { table.Name },
                CreateIndexOperation index => new[] { index.Table },
                _ => Array.Empty<string>()
            })
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        Assert.Equal(["auth_invitation_policies"], affectedTables);
    }

    private FactoryTestContext CreateFactory(Action<IServiceCollection>? configureServices = null)
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new InvitationPolicyTestTimeProvider(InitialTimestamp);
        var testFactory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<SettleoraDbContext>();
                services.RemoveAll<DbContextOptions>();
                services.RemoveAll<DbContextOptions<SettleoraDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<SettleoraDbContext>>();
                services.AddDbContext<SettleoraDbContext>(options => options.UseInMemoryDatabase(databaseName));

                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(timeProvider);

                configureServices?.Invoke(services);
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        InvitationPolicyTestTimeProvider timeProvider,
        IReadOnlyList<string> roles,
        string displayName)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
        var account = await SeedAccountAsync(testFactory, displayName, roles);

        using var scope = testFactory.Services.CreateScope();
        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                account.AuthAccountId,
                DeviceLabel: "Invitation policy test",
                UserAgentSummary: "Invitation policy test agent",
                NetworkAddressHash: "invitation-policy-test-network",
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
        IReadOnlyList<string> roles)
    {
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
        return new SeededAccount(authAccountId, userProfileId);
    }

    private static SettleoraDbContext CreateDbContext()
    {
        return new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseNpgsql("Host=localhost;Database=settleora_schema_test;Username=settleora;Password=settleora")
            .Options);
    }

    private static HttpRequestMessage CreateBearerRequest(HttpMethod method, string path, string rawSessionToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", rawSessionToken);
        return request;
    }

    private static StringContent JsonContent(string json)
    {
        return new StringContent(json, Encoding.UTF8, "application/json");
    }

    private static void AssertSafeInvitationPolicyContent(string content)
    {
        var forbiddenFragments = new[]
        {
            "raw",
            "secret",
            "hash",
            "token",
            "password",
            "credential",
            "requestBody",
            "email@",
            "smtp",
            "providerPayload",
            "providerDiagnostics",
            "link",
            "storage",
            "sessionToken",
            "refresh"
        };

        foreach (var fragment in forbiddenFragments)
        {
            Assert.DoesNotContain(fragment, content, StringComparison.OrdinalIgnoreCase);
        }
    }

    private static bool IsForbiddenColumn(string columnName)
    {
        return columnName.Contains("secret", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("hash", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("token", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("email", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("link", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("provider", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("password", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("session", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("money", StringComparison.OrdinalIgnoreCase)
            || columnName.Contains("storage", StringComparison.OrdinalIgnoreCase);
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        InvitationPolicyTestTimeProvider TimeProvider);

    private sealed record SeededAccount(Guid AuthAccountId, Guid UserProfileId);

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset ExpiresAtUtc);

    private sealed class InvitationPolicyTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public InvitationPolicyTestTimeProvider(DateTimeOffset utcNow)
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

    private sealed class NoCurrentActorAccessor : ICurrentActorAccessor
    {
        public bool TryGetCurrentActor(out AuthenticatedActor actor)
        {
            actor = default!;
            return false;
        }
    }
}
