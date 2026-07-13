using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.Invitations;
using Settleora.Api.Auth.SignIn;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class InvitationAcceptanceRuntimeTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string AcceptPath = "/api/v1/auth/invitations/accept";
    private const string SignInPath = "/api/v1/auth/sign-in";
    private const string RawInvitationSecret = "test-visible-invitation-acceptance-material";
    private const string LocalPassword = "correct horse battery staple";
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 7, 8, 13, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset AcceptanceTimestamp = InitialTimestamp.AddMinutes(15);

    private readonly WebApplicationFactory<Program> factory;

    public InvitationAcceptanceRuntimeTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public void InvitationAcceptanceClientUsesHttpsBaseAddressForRelativeInMemoryRequests()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = CreateSecureTestClient(testFactory);
        var baseAddress = client.BaseAddress ?? throw new Xunit.Sdk.XunitException("Expected HTTPS test client base address.");

        Assert.Equal(Uri.UriSchemeHttps, baseAddress.Scheme);
        Assert.Equal("localhost", baseAddress.Host);
        Assert.DoesNotContain("://", AcceptPath, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PublicValidPendingInvitationAcceptsCreatesUserOnlyLocalAccountAndRequiresSignIn()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var inviter = await SeedAccountAsync(testFactory, "Inviting Admin", [SystemRoles.Admin]);
        await EnableInvitationPolicyAsync(testFactory, inviter.AuthAccountId);
        var invitationId = await SeedInvitationAsync(testFactory, inviter, RawInvitationSecret, "Invitee@Example.COM");
        using var client = CreateSecureTestClient(testFactory);

        testContext.TimeProvider.SetUtcNow(AcceptanceTimestamp);
        using var response = await client.PostAsync(
            AcceptPath,
            JsonContent(CreateAcceptJson(RawInvitationSecret, "  Invited User  ", LocalPassword)));
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafePublicContent(content);
        using (var payload = JsonDocument.Parse(content))
        {
            Assert.Equal("accepted_sign_in_required", payload.RootElement.GetProperty("result").GetString());
            Assert.True(payload.RootElement.GetProperty("signInRequired").GetBoolean());
            Assert.False(payload.RootElement.TryGetProperty("session", out _));
            Assert.False(payload.RootElement.TryGetProperty("refreshCredential", out _));
        }

        using (var scope = testFactory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
            var invitation = await dbContext.Set<AuthInvitation>().SingleAsync(invitation => invitation.Id == invitationId);
            var account = await dbContext.Set<AuthAccount>()
                .Include(account => account.UserProfile)
                .Include(account => account.Identities)
                .Include(account => account.RoleAssignments)
                .SingleAsync(account => account.UserProfile.DisplayName == "Invited User");
            var credential = await dbContext.Set<LocalPasswordCredential>()
                .SingleAsync(credential => credential.AuthAccountId == account.Id);
            var audit = await dbContext.Set<AuthAuditEvent>()
                .SingleAsync(audit => audit.Action == "invitation.accepted");

            Assert.Equal(AuthInvitationStatuses.Accepted, invitation.Status);
            Assert.Equal(AcceptanceTimestamp, invitation.AcceptedAtUtc);
            Assert.Equal("invitee@example.com", account.Identities.Single().ProviderSubject);
            Assert.Equal(LocalPasswordCredentialStatuses.Active, credential.Status);
            Assert.Equal([SystemRoles.User], account.RoleAssignments.Select(role => role.Role).ToArray());
            Assert.Equal(inviter.AuthAccountId, audit.ActorAuthAccountId);
            Assert.Equal(account.Id, audit.SubjectAuthAccountId);
            Assert.Contains(invitationId.ToString("D"), audit.SafeMetadataJson, StringComparison.Ordinal);
            Assert.Contains(account.Id.ToString("D"), audit.SafeMetadataJson, StringComparison.Ordinal);
            Assert.Contains(account.UserProfileId.ToString("D"), audit.SafeMetadataJson, StringComparison.Ordinal);
            AssertSafePublicContent(audit.SafeMetadataJson ?? string.Empty);
        }

        using var signInResponse = await client.PostAsync(
            SignInPath,
            JsonContent($$"""{"identifier":"invitee@example.com","password":"{{LocalPassword}}"}"""));
        var signInContent = await signInResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, signInResponse.StatusCode);
        Assert.Contains("session", signInContent, StringComparison.Ordinal);
        Assert.Contains("refreshCredential", signInContent, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("\"not-an-object\"")]
    [InlineData("{")]
    [InlineData("""{"invitationSecret":"x","displayName":"User","localPassword":"valid password","extra":true}""")]
    [InlineData("""{"displayName":"User","localPassword":"valid password"}""")]
    [InlineData("""{"invitationSecret":"","displayName":"User","localPassword":"valid password"}""")]
    [InlineData("""{"invitationSecret":"x","displayName":"","localPassword":"valid password"}""")]
    [InlineData("""{"invitationSecret":"x","displayName":"User","localPassword":"short"}""")]
    public async Task InvalidRequestShapesAreRejectedSafely(string json)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = CreateSecureTestClient(testFactory);

        using var response = await client.PostAsync(AcceptPath, JsonContent(json));
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        AssertSafePublicContent(content);
    }

    [Fact]
    public async Task UnknownRevokedExpiredAcceptedAndDisabledCasesUseGenericPublicFailure()
    {
        var unknown = await TryAcceptAsync(RawInvitationSecret);
        var revoked = await TryAcceptSeededAsync(AuthInvitationStatuses.Revoked, revokedAtUtc: InitialTimestamp);
        var expired = await TryAcceptSeededAsync(AuthInvitationStatuses.Pending, expiresAtUtc: InitialTimestamp.AddMinutes(-1));
        var accepted = await TryAcceptSeededAsync(AuthInvitationStatuses.Accepted, acceptedAtUtc: InitialTimestamp);
        var disabled = await TryAcceptSeededAsync(AuthInvitationStatuses.Pending, enablePolicy: false);

        foreach (var result in new[] { unknown, revoked, expired, accepted, disabled })
        {
            Assert.Equal(HttpStatusCode.BadRequest, result.StatusCode);
            Assert.Contains("Invitation acceptance failed", result.Content, StringComparison.Ordinal);
            AssertSafePublicContent(result.Content);
        }

        Assert.All(
            new[] { unknown.Content, revoked.Content, expired.Content, accepted.Content, disabled.Content },
            content =>
            {
                Assert.Contains("Unable to accept the submitted invitation.", content, StringComparison.Ordinal);
                Assert.DoesNotContain("expired", content, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("revoked", content, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("accepted", content, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain("disabled", content, StringComparison.OrdinalIgnoreCase);
            });
    }

    [Fact]
    public async Task AcceptedInvitationCannotBeAcceptedAgainAndDoesNotCreateSecondAccount()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var inviter = await SeedAccountAsync(testFactory, "Inviting Admin", [SystemRoles.Admin]);
        await EnableInvitationPolicyAsync(testFactory, inviter.AuthAccountId);
        await SeedInvitationAsync(testFactory, inviter, RawInvitationSecret, "replay@example.com");
        using var client = CreateSecureTestClient(testFactory);

        using var first = await client.PostAsync(
            AcceptPath,
            JsonContent(CreateAcceptJson(RawInvitationSecret, "Replay User", LocalPassword)));
        using var second = await client.PostAsync(
            AcceptPath,
            JsonContent(CreateAcceptJson(RawInvitationSecret, "Replay User 2", LocalPassword)));
        var secondContent = await second.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
        AssertSafePublicContent(secondContent);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        Assert.Equal(2, await dbContext.Set<AuthAccount>().CountAsync());
        Assert.Equal(1, await dbContext.Set<AuthInvitation>().CountAsync(invitation => invitation.Status == AuthInvitationStatuses.Accepted));
    }

    [Fact]
    public async Task ExpiredPendingInvitationIsLazilyMarkedExpiredWithoutRedeeming()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var inviter = await SeedAccountAsync(testFactory, "Inviting Admin", [SystemRoles.Admin]);
        await EnableInvitationPolicyAsync(testFactory, inviter.AuthAccountId);
        var invitationId = await SeedInvitationAsync(
            testFactory,
            inviter,
            RawInvitationSecret,
            "expired@example.com",
            expiresAtUtc: InitialTimestamp.AddMinutes(-1));
        using var client = CreateSecureTestClient(testFactory);

        using var response = await client.PostAsync(
            AcceptPath,
            JsonContent(CreateAcceptJson(RawInvitationSecret, "Expired User", LocalPassword)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var invitation = await dbContext.Set<AuthInvitation>().SingleAsync(invitation => invitation.Id == invitationId);
        Assert.Equal(AuthInvitationStatuses.Expired, invitation.Status);
        Assert.NotNull(invitation.ExpiredAtUtc);
        Assert.Equal(InitialTimestamp.AddDays(90), invitation.CleanupEligibleAtUtc);
        Assert.Equal(1, await dbContext.Set<AuthAccount>().CountAsync());
    }

    [Fact]
    public async Task RawInvitationMaterialIsNotPersistedReturnedOrAudited()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var inviter = await SeedAccountAsync(testFactory, "Inviting Admin", [SystemRoles.Admin]);
        await EnableInvitationPolicyAsync(testFactory, inviter.AuthAccountId);
        await SeedInvitationAsync(testFactory, inviter, RawInvitationSecret, "redacted@example.com");
        using var client = CreateSecureTestClient(testFactory);

        using var response = await client.PostAsync(
            AcceptPath,
            JsonContent(CreateAcceptJson(RawInvitationSecret, "Redacted User", LocalPassword)));
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertDoesNotContainSensitiveFragment(content, "raw invitation material", RawInvitationSecret);

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var invitation = await dbContext.Set<AuthInvitation>().SingleAsync();
        var audits = await dbContext.Set<AuthAuditEvent>()
            .Where(audit => audit.Action == "invitation.accepted"
                || audit.Action == "invitation.accept_failed")
            .ToListAsync();
        AssertDoesNotContainSensitiveFragment(invitation.InvitationSecretHash, "raw invitation material", RawInvitationSecret);
        AssertDoesNotContainSensitiveFragment(invitation.InvitationSecretHash, "full contact identifier", "redacted@example.com");
        Assert.All(audits, audit => AssertSafePublicContent(audit.SafeMetadataJson ?? string.Empty));
    }

    [Fact]
    public async Task CredentialCreationFailureDoesNotLeaveAcceptedInvitationOrCreatedAccount()
    {
        var testContext = CreateFactory(services =>
        {
            services.RemoveAll<IAuthCredentialWorkflowService>();
            services.AddScoped<IAuthCredentialWorkflowService, FailingCredentialWorkflowService>();
        });
        using var testFactory = testContext.Factory;
        var inviter = await SeedAccountAsync(testFactory, "Inviting Admin", [SystemRoles.Admin]);
        await EnableInvitationPolicyAsync(testFactory, inviter.AuthAccountId);
        var invitationId = await SeedInvitationAsync(testFactory, inviter, RawInvitationSecret, "rollback@example.com");
        using var client = CreateSecureTestClient(testFactory);

        using var response = await client.PostAsync(
            AcceptPath,
            JsonContent(CreateAcceptJson(RawInvitationSecret, "Rollback User", LocalPassword)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var invitation = await dbContext.Set<AuthInvitation>().SingleAsync(invitation => invitation.Id == invitationId);
        Assert.Equal(AuthInvitationStatuses.Pending, invitation.Status);
        Assert.Null(invitation.AcceptedAtUtc);
        Assert.Equal(1, await dbContext.Set<AuthAccount>().CountAsync());
        Assert.Empty(await dbContext.Set<AuthIdentity>()
            .Where(identity => identity.ProviderSubject == "rollback@example.com")
            .ToListAsync());
    }

    [Fact]
    public async Task PublicAcceptThrottlingStaysGenericAndDoesNotCreateAccount()
    {
        var testContext = CreateFactory(services =>
        {
            services.AddSingleton(CreateStrictInvitationAbuseOptions());
        });
        using var testFactory = testContext.Factory;
        var inviter = await SeedAccountAsync(testFactory, "Inviting Admin", [SystemRoles.Admin]);
        await EnableInvitationPolicyAsync(testFactory, inviter.AuthAccountId);
        await SeedInvitationAsync(testFactory, inviter, RawInvitationSecret, "throttled.accept@example.com");
        using var client = CreateSecureTestClient(testFactory);

        using var firstResponse = await client.PostAsync(
            AcceptPath,
            JsonContent(CreateAcceptJson("unknown-material-for-throttle", "Unknown User", LocalPassword)));
        using var throttledResponse = await client.PostAsync(
            AcceptPath,
            JsonContent(CreateAcceptJson("unknown-material-for-throttle", "Throttled User", LocalPassword)));
        var throttledContent = await throttledResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, firstResponse.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, throttledResponse.StatusCode);
        Assert.Contains("Too many invitation acceptance attempts", throttledContent, StringComparison.Ordinal);
        AssertSafePublicContent(throttledContent);
        AssertDoesNotContainSensitiveFragment(throttledContent, "throttled raw invitation material", "unknown-material-for-throttle");

        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        Assert.Equal(1, await dbContext.Set<AuthAccount>().CountAsync());
        Assert.Empty(await dbContext.Set<AuthIdentity>()
            .Where(identity => identity.ProviderSubject == "throttled.accept@example.com")
            .ToListAsync());
        var throttledAudits = await dbContext.Set<AuthAuditEvent>()
            .Where(audit => audit.Action == "invitation.accept_failed"
                && audit.Outcome == AuthAuditOutcomes.BlockedByPolicy)
            .ToListAsync();
        var throttledAudit = Assert.Single(
            throttledAudits,
            audit => audit.SafeMetadataJson?.Contains("throttled", StringComparison.Ordinal) == true);
        AssertSafePublicContent(throttledAudit.SafeMetadataJson ?? string.Empty);
    }

    [Fact]
    public void InvitationAbusePolicyRequestDebugStringsDoNotEchoRawMaterialOrContact()
    {
        var request = new InvitationAbusePolicyRequest(
            InvitationAbusePolicyOperations.Accept,
            ActorBucketRef: "raw.actor@example.com",
            SubjectBucketRef: RawInvitationSecret,
            SourceBucketRef: "forwarded-for:203.0.113.25");

        var text = request.ToString();
        AssertDoesNotContainSensitiveFragment(text, "raw invitation material", RawInvitationSecret);
        AssertDoesNotContainSensitiveFragment(text, "raw actor contact", "raw.actor@example.com");
        AssertDoesNotContainSensitiveFragment(text, "raw source address", "203.0.113.25");
    }

    private async Task<FailureAttemptResult> TryAcceptAsync(string rawSecret)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var inviter = await SeedAccountAsync(testFactory, "Inviting Admin", [SystemRoles.Admin]);
        await EnableInvitationPolicyAsync(testFactory, inviter.AuthAccountId);
        using var client = CreateSecureTestClient(testFactory);
        using var response = await client.PostAsync(
            AcceptPath,
            JsonContent(CreateAcceptJson(rawSecret, "Unknown User", LocalPassword)));
        return new FailureAttemptResult(response.StatusCode, await response.Content.ReadAsStringAsync());
    }

    private async Task<FailureAttemptResult> TryAcceptSeededAsync(
        string status,
        bool enablePolicy = true,
        DateTimeOffset? expiresAtUtc = null,
        DateTimeOffset? acceptedAtUtc = null,
        DateTimeOffset? revokedAtUtc = null)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var inviter = await SeedAccountAsync(testFactory, "Inviting Admin", [SystemRoles.Admin]);
        if (enablePolicy)
        {
            await EnableInvitationPolicyAsync(testFactory, inviter.AuthAccountId);
        }

        await SeedInvitationAsync(
            testFactory,
            inviter,
            RawInvitationSecret,
            $"{status}@example.com",
            status,
            expiresAtUtc,
            acceptedAtUtc,
            revokedAtUtc);
        using var client = CreateSecureTestClient(testFactory);
        using var response = await client.PostAsync(
            AcceptPath,
            JsonContent(CreateAcceptJson(RawInvitationSecret, "Failure User", LocalPassword)));
        return new FailureAttemptResult(response.StatusCode, await response.Content.ReadAsStringAsync());
    }

    private FactoryTestContext CreateFactory(Action<IServiceCollection>? configureServices = null)
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new InvitationAcceptanceTestTimeProvider(InitialTimestamp);
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

    private static HttpClient CreateSecureTestClient(WebApplicationFactory<Program> testFactory)
    {
        return testFactory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost")
        });
    }

    private static InvitationAbusePolicyOptions CreateStrictInvitationAbuseOptions()
    {
        return new InvitationAbusePolicyOptions
        {
            Window = TimeSpan.FromMinutes(15),
            ThrottleDuration = TimeSpan.FromMinutes(5),
            EntryRetention = TimeSpan.FromHours(1),
            SourceLimit = 10,
            ActorLimit = 10,
            SubjectLimit = 1,
            ActorSubjectLimit = 1,
            GlobalLimit = 100
        };
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

    private static async Task<Guid> SeedInvitationAsync(
        WebApplicationFactory<Program> testFactory,
        SeededAccount inviter,
        string rawSecret,
        string contactIdentifier,
        string status = AuthInvitationStatuses.Pending,
        DateTimeOffset? expiresAtUtc = null,
        DateTimeOffset? acceptedAtUtc = null,
        DateTimeOffset? revokedAtUtc = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var invitationId = Guid.NewGuid();
        dbContext.Set<AuthInvitation>().Add(new AuthInvitation
        {
            Id = invitationId,
            Status = status,
            ContactIdentifierKind = AuthInvitationContactIdentifierKinds.Email,
            ContactIdentifierNormalized = contactIdentifier.Trim().ToLowerInvariant(),
            InvitationSecretHash = InvitationSecretHasher.DeriveInvitationSecretHash(rawSecret),
            InvitationSecretHashVersion = InvitationSecretHasher.HashVersion,
            TargetSystemRole = SystemRoles.User,
            InvitedByAuthAccountId = inviter.AuthAccountId,
            InvitedByUserProfileId = inviter.UserProfileId,
            CreatedAtUtc = InitialTimestamp,
            UpdatedAtUtc = InitialTimestamp,
            ExpiresAtUtc = expiresAtUtc ?? InitialTimestamp.AddDays(7),
            AcceptedAtUtc = acceptedAtUtc,
            RevokedAtUtc = revokedAtUtc
        });
        await dbContext.SaveChangesAsync();
        return invitationId;
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

    private static string CreateAcceptJson(string rawSecret, string displayName, string password)
    {
        return $$"""
            {"invitationSecret":"{{rawSecret}}","displayName":"{{displayName}}","localPassword":"{{password}}"}
            """;
    }

    private static StringContent JsonContent(string json)
    {
        return new StringContent(json, Encoding.UTF8, "application/json");
    }

    private static void AssertSafePublicContent(string content)
    {
        var forbiddenFragments = new[]
        {
            ("raw invitation material", RawInvitationSecret),
            ("raw invitation material literal", "test-visible-invitation-acceptance-material"),
            ("raw secret wording", "secret"),
            ("raw link wording", "link"),
            ("raw token wording", "token"),
            ("password wording", "password"),
            ("credential wording", "credential"),
            ("refresh credential wording", "refresh"),
            ("mixed-case full contact identifier", "Invitee@Example.COM"),
            ("normalized full contact identifier", "invitee@example.com"),
            ("audit full contact identifier", "redacted@example.com"),
            ("rollback full contact identifier", "rollback@example.com"),
            ("throttled full contact identifier", "throttled.accept@example.com"),
            ("provider payload marker", "providerPayload"),
            ("request body marker", "requestBody"),
            ("SMTP marker", "smtp")
        };

        foreach (var (safeLabel, fragment) in forbiddenFragments)
        {
            AssertDoesNotContainSensitiveFragment(content, safeLabel, fragment);
        }
    }

    private static void AssertDoesNotContainSensitiveFragment(string content, string safeLabel, string fragment)
    {
        // Avoid xUnit string containment assertions here because failure output can echo the checked secret.
        if (content.Contains(fragment, StringComparison.OrdinalIgnoreCase))
        {
            throw new Xunit.Sdk.XunitException($"Redaction check failed for {safeLabel}.");
        }
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        InvitationAcceptanceTestTimeProvider TimeProvider);

    private sealed record SeededAccount(Guid AuthAccountId, Guid UserProfileId);

    private sealed record FailureAttemptResult(HttpStatusCode StatusCode, string Content);

    private sealed class InvitationAcceptanceTestTimeProvider : TimeProvider
    {
        private DateTimeOffset utcNow;

        public InvitationAcceptanceTestTimeProvider(DateTimeOffset utcNow)
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

    private sealed class FailingCredentialWorkflowService : IAuthCredentialWorkflowService
    {
        public Task<CredentialCreationResult> CreateLocalPasswordCredentialAsync(
            Guid authAccountId,
            string plaintextPassword,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult(CredentialCreationResult.Failure(CredentialCreationStatus.PersistenceFailed));
        }

        public Task<PasswordCredentialVerificationResult> VerifyLocalPasswordAsync(
            Guid authAccountId,
            string submittedPassword,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }

        public Task<PasswordCredentialChangeResult> ChangeLocalPasswordAsync(
            Guid authAccountId,
            string currentPassword,
            string newPassword,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }

        public Task<PasswordCredentialResetResult> ResetLocalPasswordAsync(
            Guid authAccountId,
            string newPassword,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }
    }
}
