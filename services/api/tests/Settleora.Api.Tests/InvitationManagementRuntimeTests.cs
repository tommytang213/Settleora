using System.Net;
using System.Net.Http.Headers;
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
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class InvitationManagementRuntimeTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string InvitationsPath = "/api/v1/admin/auth/invitations";
    private const string WrongRawToken = "wrong-visible-invitation-management-session-token";
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 7, 8, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = InitialTimestamp.AddMinutes(10);
    private static readonly DateTimeOffset MutationTimestamp = InitialTimestamp.AddMinutes(20);

    private readonly WebApplicationFactory<Program> factory;

    public InvitationManagementRuntimeTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task OwnerCanCreateListAndGetInvitationWithoutRawSecretExposure()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        using var client = testFactory.CreateClient();

        testContext.TimeProvider.SetUtcNow(MutationTimestamp);
        using var createRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        createRequest.Content = JsonContent(
            """{"contactIdentifierKind":"email","contactIdentifier":"  New.User@Example.COM  ","targetSystemRole":"user"}""");
        using var createResponse = await client.SendAsync(createRequest);
        var createContent = await createResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        AssertSafeInvitationContent(createContent);
        using var createPayload = JsonDocument.Parse(createContent);
        var createdInvitation = createPayload.RootElement.GetProperty("invitation");
        var invitationId = createdInvitation.GetProperty("id").GetGuid();
        Assert.Equal("pending", createdInvitation.GetProperty("status").GetString());
        Assert.Equal("email", createdInvitation.GetProperty("contactIdentifierKind").GetString());
        Assert.Equal("email:***", createdInvitation.GetProperty("contactDisplay").GetString());
        Assert.Equal("user", createdInvitation.GetProperty("targetSystemRole").GetString());
        Assert.Equal("provider_unconfigured", createdInvitation.GetProperty("deliveryState").GetString());
        Assert.Equal(session.AuthAccountId, createdInvitation.GetProperty("invitedByAuthAccountId").GetGuid());
        Assert.Equal(session.UserProfileId, createdInvitation.GetProperty("invitedByUserProfileId").GetGuid());

        using var listRequest = CreateBearerRequest(HttpMethod.Get, InvitationsPath, session.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        var listContent = await listResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        AssertSafeInvitationContent(listContent);
        using (var listPayload = JsonDocument.Parse(listContent))
        {
            var listedInvitation = Assert.Single(listPayload.RootElement.GetProperty("invitations").EnumerateArray());
            Assert.Equal(invitationId, listedInvitation.GetProperty("id").GetGuid());
            Assert.Equal("unknown", listedInvitation.GetProperty("deliveryState").GetString());
        }

        using var getRequest = CreateBearerRequest(HttpMethod.Get, $"{InvitationsPath}/{invitationId:D}", session.RawSessionToken);
        using var getResponse = await client.SendAsync(getRequest);
        var getContent = await getResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);
        AssertSafeInvitationContent(getContent);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var invitation = await dbContext.Set<AuthInvitation>().SingleAsync();
        Assert.Equal("new.user@example.com", invitation.ContactIdentifierNormalized);
        Assert.StartsWith("auth-invitation-sha256:v1:", invitation.InvitationSecretHash, StringComparison.Ordinal);
        Assert.Equal("sha256-v1", invitation.InvitationSecretHashVersion);
        Assert.DoesNotContain("New.User@Example.COM", invitation.InvitationSecretHash, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("raw", invitation.InvitationSecretHash, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task NormalUserAndAnonymousCallersCannotAccessAdminInvitationManagement()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.User], "Normal User");
        using var client = testFactory.CreateClient();

        using var anonymousList = await client.GetAsync(InvitationsPath);
        using var invalidTokenList = await client.SendAsync(CreateBearerRequest(HttpMethod.Get, InvitationsPath, WrongRawToken));
        using var userList = await client.SendAsync(CreateBearerRequest(HttpMethod.Get, InvitationsPath, session.RawSessionToken));
        using var userCreateRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        userCreateRequest.Content = JsonContent(
            """{"contactIdentifierKind":"email","contactIdentifier":"blocked@example.com","targetSystemRole":"user"}""");
        using var userCreate = await client.SendAsync(userCreateRequest);

        Assert.Equal(HttpStatusCode.Unauthorized, anonymousList.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, invalidTokenList.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, userList.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, userCreate.StatusCode);
    }

    [Fact]
    public async Task DefaultOffPolicyBlocksCreateAndResendButDoesNotBlockRevoke()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Admin], "Admin Actor");
        var invitationId = await SeedPendingInvitationAsync(testFactory, session, "pending@example.com");
        using var client = testFactory.CreateClient();

        using var createRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        createRequest.Content = JsonContent(
            """{"contactIdentifierKind":"email","contactIdentifier":"blocked@example.com","targetSystemRole":"user"}""");
        using var createResponse = await client.SendAsync(createRequest);
        using var resendRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/resend", session.RawSessionToken);
        resendRequest.Content = JsonContent("""{}""");
        using var resendResponse = await client.SendAsync(resendRequest);
        using var revokeRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/revoke", session.RawSessionToken);
        revokeRequest.Content = JsonContent("""{"reason":"admin_requested"}""");
        using var revokeResponse = await client.SendAsync(revokeRequest);

        Assert.Equal(HttpStatusCode.Forbidden, createResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, resendResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, revokeResponse.StatusCode);
    }

    [Theory]
    [InlineData("sms", "invitee@example.com", "user")]
    [InlineData("email", "invitee@example.com", "admin")]
    [InlineData("email", "not-an-email", "user")]
    public async Task CreateRejectsUnsupportedContactKindTargetRoleAndInvalidEmail(
        string contactIdentifierKind,
        string contactIdentifier,
        string targetRole)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        using var client = testFactory.CreateClient();

        using var createRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
        createRequest.Content = JsonContent(
            $$"""{"contactIdentifierKind":"{{contactIdentifierKind}}","contactIdentifier":"{{contactIdentifier}}","targetSystemRole":"{{targetRole}}"}""");
        using var createResponse = await client.SendAsync(createRequest);
        var content = await createResponse.Content.ReadAsStringAsync();

        Assert.True(
            createResponse.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Conflict,
            $"Unexpected status: {createResponse.StatusCode}");
        AssertSafeInvitationContent(content);
    }

    [Fact]
    public async Task DuplicatePendingInvitationReturnsConflict()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        using var client = testFactory.CreateClient();

        for (var index = 0; index < 2; index++)
        {
            using var createRequest = CreateBearerRequest(HttpMethod.Post, InvitationsPath, session.RawSessionToken);
            createRequest.Content = JsonContent(
                """{"contactIdentifierKind":"email","contactIdentifier":"duplicate@example.com","targetSystemRole":"user"}""");
            using var response = await client.SendAsync(createRequest);
            Assert.Equal(index == 0 ? HttpStatusCode.Created : HttpStatusCode.Conflict, response.StatusCode);
        }
    }

    [Fact]
    public async Task RevokePendingInvitationWritesBoundedAuditAndRejectsRepeatedTerminalRevoke()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Owner Actor");
        var invitationId = await SeedPendingInvitationAsync(testFactory, session, "revoke@example.com");
        using var client = testFactory.CreateClient();

        using var revokeRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/revoke", session.RawSessionToken);
        revokeRequest.Content = JsonContent("""{"reason":"admin_requested"}""");
        using var revokeResponse = await client.SendAsync(revokeRequest);
        var revokeContent = await revokeResponse.Content.ReadAsStringAsync();
        using var repeatRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/revoke", session.RawSessionToken);
        repeatRequest.Content = JsonContent("""{}""");
        using var repeatResponse = await client.SendAsync(repeatRequest);

        Assert.Equal(HttpStatusCode.OK, revokeResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, repeatResponse.StatusCode);
        AssertSafeInvitationContent(revokeContent);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var invitation = await dbContext.Set<AuthInvitation>().SingleAsync(invitation => invitation.Id == invitationId);
        var audit = await dbContext.Set<AuthAuditEvent>().SingleAsync(audit => audit.Action == "invitation.revoked");
        Assert.Equal(AuthInvitationStatuses.Revoked, invitation.Status);
        Assert.Equal(session.AuthAccountId, invitation.RevokedByAuthAccountId);
        Assert.Equal(session.AuthAccountId, audit.ActorAuthAccountId);
        Assert.Null(audit.SubjectAuthAccountId);
        AssertSafeInvitationContent(audit.SafeMetadataJson ?? string.Empty);
        Assert.Contains(invitationId.ToString("D"), audit.SafeMetadataJson, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ResendDoesNotFakeDeliverySuccessOrLeakSecretMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Admin], "Admin Actor");
        await EnableInvitationPolicyAsync(testFactory, session.AuthAccountId);
        var invitationId = await SeedPendingInvitationAsync(testFactory, session, "resend@example.com");
        using var client = testFactory.CreateClient();

        using var resendRequest = CreateBearerRequest(HttpMethod.Post, $"{InvitationsPath}/{invitationId:D}/resend", session.RawSessionToken);
        resendRequest.Content = JsonContent("""{"deliveryRequested":true}""");
        using var resendResponse = await client.SendAsync(resendRequest);
        var resendContent = await resendResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Accepted, resendResponse.StatusCode);
        AssertSafeInvitationContent(resendContent);
        using var payload = JsonDocument.Parse(resendContent);
        Assert.Equal(
            "provider_unconfigured",
            payload.RootElement.GetProperty("invitation").GetProperty("deliveryState").GetString());
        Assert.NotEqual(
            "sent",
            payload.RootElement.GetProperty("invitation").GetProperty("deliveryState").GetString());

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var audit = await dbContext.Set<AuthAuditEvent>().SingleAsync(audit => audit.Action == "invitation.resend_requested");
        AssertSafeInvitationContent(audit.SafeMetadataJson ?? string.Empty);
        Assert.Contains("provider_unconfigured", audit.SafeMetadataJson, StringComparison.Ordinal);
    }

    private FactoryTestContext CreateFactory()
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new InvitationManagementTestTimeProvider(InitialTimestamp);
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
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task EnableInvitationPolicyAsync(
        WebApplicationFactory<Program> testFactory,
        Guid actorAuthAccountId)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        dbContext.Set<AuthInvitationPolicy>().Add(new AuthInvitationPolicy
        {
            Id = Guid.NewGuid(),
            PolicyVersion = 1,
            Status = AuthInvitationPolicyStatuses.Active,
            CapabilityState = AuthInvitationCapabilityStates.Enabled,
            PendingInviteGraceWhenDisabled = false,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            ChangedByAuthAccountId = actorAuthAccountId
        });
        await dbContext.SaveChangesAsync();
    }

    private static async Task<Guid> SeedPendingInvitationAsync(
        WebApplicationFactory<Program> testFactory,
        SeededSession actor,
        string normalizedEmail)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var invitationId = Guid.NewGuid();
        dbContext.Set<AuthInvitation>().Add(new AuthInvitation
        {
            Id = invitationId,
            Status = AuthInvitationStatuses.Pending,
            ContactIdentifierKind = AuthInvitationContactIdentifierKinds.Email,
            ContactIdentifierNormalized = normalizedEmail,
            InvitationSecretHash = $"test-auth-invitation-sha256:v1:{Guid.NewGuid():N}",
            InvitationSecretHashVersion = "sha256-v1",
            TargetSystemRole = SystemRoles.User,
            InvitedByAuthAccountId = actor.AuthAccountId,
            InvitedByUserProfileId = actor.UserProfileId,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            ExpiresAtUtc = InitialTimestamp.AddDays(7)
        });
        await dbContext.SaveChangesAsync();
        return invitationId;
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        InvitationManagementTestTimeProvider timeProvider,
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
                DeviceLabel: "Invitation management test",
                UserAgentSummary: "Invitation management test agent",
                NetworkAddressHash: "invitation-management-test-network",
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

    private static void AssertSafeInvitationContent(string content)
    {
        var forbiddenFragments = new[]
        {
            "raw",
            "secret",
            "link",
            "token",
            "password",
            "credential",
            "requestBody",
            "providerPayload",
            "providerDiagnostics",
            "smtp",
            "sessionToken",
            "refresh",
            "New.User@Example.COM",
            "new.user@example.com",
            "duplicate@example.com",
            "revoke@example.com",
            "resend@example.com"
        };

        foreach (var fragment in forbiddenFragments)
        {
            Assert.DoesNotContain(fragment, content, StringComparison.OrdinalIgnoreCase);
        }
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        InvitationManagementTestTimeProvider TimeProvider);

    private sealed record SeededAccount(Guid AuthAccountId, Guid UserProfileId);

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset ExpiresAtUtc);

    private sealed class InvitationManagementTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public InvitationManagementTestTimeProvider(DateTimeOffset utcNow)
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
