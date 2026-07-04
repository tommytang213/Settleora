using System.Net;
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
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Users;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class AdminNotificationPolicyEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string AdminNotificationPolicyPath = "/api/v1/admin/notification-policy";
    private const string WrongRawToken = "visible-wrong-notification-policy-session-token";
    private static readonly DateTimeOffset InitialTimestamp = new(2026, 7, 4, 13, 50, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = InitialTimestamp.AddMinutes(15);
    private static readonly DateTimeOffset PolicyTimestamp = InitialTimestamp.AddMinutes(30);

    private readonly WebApplicationFactory<Program> factory;

    public AdminNotificationPolicyEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Theory]
    [InlineData(SystemRoles.Owner)]
    [InlineData(SystemRoles.Admin)]
    public async Task OwnerOrAdminCanReadDefaultNotificationPolicyWithoutPersistedRow(string role)
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [role], $"{role} Actor");
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(session.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        AssertSafePolicyReadoutContent(content);

        using var payload = JsonDocument.Parse(content);
        var root = payload.RootElement;
        Assert.Equal("default-v1", root.GetProperty("policyVersion").GetString());
        Assert.Equal("default", root.GetProperty("source").GetString());
        Assert.True(root.GetProperty("persistedSchemaReady").GetBoolean());
        Assert.True(root.GetProperty("serverAuthoritative").GetBoolean());

        var channels = root.GetProperty("channels").EnumerateArray().ToArray();
        Assert.Equal(3, channels.Length);
        Assert.Contains(
            channels,
            channel => channel.GetProperty("channel").GetString() == NotificationPolicyChannels.InApp
                && channel.GetProperty("readoutCategory").GetString() == NotificationPolicyReadoutCategories.Available
                && !channel.GetProperty("externalProviderAttemptAllowed").GetBoolean());
        Assert.Contains(
            channels,
            channel => channel.GetProperty("channel").GetString() == NotificationPolicyChannels.Email
                && channel.GetProperty("channelCap").GetString() == NotificationPolicyChannelCaps.Disabled
                && channel.GetProperty("readiness").GetString() == NotificationPolicyReadinessStates.Unconfigured
                && channel.GetProperty("readoutCategory").GetString() == NotificationPolicyReadoutCategories.DisabledByAdmin
                && !channel.GetProperty("externalProviderAttemptAllowed").GetBoolean());
        Assert.Contains(
            channels,
            channel => channel.GetProperty("channel").GetString() == NotificationPolicyChannels.MobilePush
                && channel.GetProperty("channelCap").GetString() == NotificationPolicyChannelCaps.Disabled
                && channel.GetProperty("readiness").GetString() == NotificationPolicyReadinessStates.Unconfigured
                && channel.GetProperty("readoutCategory").GetString() == NotificationPolicyReadoutCategories.DisabledByAdmin
                && !channel.GetProperty("externalProviderAttemptAllowed").GetBoolean());

        Assert.All(
            channels,
            channel => Assert.True(
                NotificationPolicyReadoutCategories.IsSupported(channel.GetProperty("readoutCategory").GetString())));

        var families = root.GetProperty("eventFamilies").EnumerateArray().ToArray();
        Assert.Equal(NotificationPolicyEventFamilies.DefaultReadoutFamilies.Length, families.Length);
        Assert.Contains(
            families,
            family => family.GetProperty("eventFamily").GetString() == NotificationPolicyEventFamilies.AuthSecurity
                && family.GetProperty("requiredInApp").GetBoolean());
        Assert.True(root.GetProperty("requiredRules").GetProperty("requiredInAppEnabled").GetBoolean());
    }

    [Fact]
    public async Task PersistedPolicyReadoutUsesSafeCategoriesWithoutAllowingProviderAttempts()
    {
        var testContext = CreateFactory(new NotificationProviderReadinessSnapshot(
            NotificationPolicyReadinessStates.Configured,
            NotificationPolicyReadinessStates.Unconfigured));
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Policy Owner");
        await SeedPersistedPolicyAsync(testFactory, session.AuthAccountId);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(session.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafePolicyReadoutContent(content);
        using var payload = JsonDocument.Parse(content);
        Assert.Equal("policy-v2", payload.RootElement.GetProperty("policyVersion").GetString());
        Assert.Equal("persisted", payload.RootElement.GetProperty("source").GetString());
        Assert.Equal(PolicyTimestamp, payload.RootElement.GetProperty("updatedAtUtc").GetDateTimeOffset());

        var email = payload.RootElement.GetProperty("channels")
            .EnumerateArray()
            .Single(channel => channel.GetProperty("channel").GetString() == NotificationPolicyChannels.Email);
        Assert.Equal(NotificationPolicyChannelCaps.GenericExternalOnly, email.GetProperty("channelCap").GetString());
        Assert.Equal(NotificationPolicyReadinessStates.Configured, email.GetProperty("readiness").GetString());
        Assert.Equal(NotificationPolicyReadoutCategories.Limited, email.GetProperty("readoutCategory").GetString());
        Assert.False(email.GetProperty("externalProviderAttemptAllowed").GetBoolean());

        var recurring = payload.RootElement.GetProperty("eventFamilies")
            .EnumerateArray()
            .Single(family => family.GetProperty("eventFamily").GetString() == NotificationPolicyEventFamilies.Recurring);
        Assert.Equal(NotificationPolicyChannelCaps.GenericExternalOnly, recurring.GetProperty("emailChannelCap").GetString());
        Assert.Equal(NotificationPolicyContentClasses.SafeSummaryAllowed, recurring.GetProperty("externalContentClass").GetString());
        Assert.True(recurring.GetProperty("digestEligible").GetBoolean());
    }

    [Fact]
    public async Task ProviderReadinessCategoriesAreReadOnlyInputsWhenPolicyAllowsExternalChannels()
    {
        var testContext = CreateFactory(new NotificationProviderReadinessSnapshot(
            NotificationPolicyReadinessStates.Invalid,
            NotificationPolicyReadinessStates.Unsupported));
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Policy Owner");
        await SeedPersistedPolicyAsync(
            testFactory,
            session.AuthAccountId,
            emailCap: NotificationPolicyChannelCaps.GenericExternalOnly,
            mobilePushCap: NotificationPolicyChannelCaps.GenericExternalOnly);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(session.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafePolicyReadoutContent(content);
        using var payload = JsonDocument.Parse(content);

        var email = payload.RootElement.GetProperty("channels")
            .EnumerateArray()
            .Single(channel => channel.GetProperty("channel").GetString() == NotificationPolicyChannels.Email);
        Assert.Equal(NotificationPolicyChannelCaps.GenericExternalOnly, email.GetProperty("channelCap").GetString());
        Assert.Equal(NotificationPolicyReadinessStates.Invalid, email.GetProperty("readiness").GetString());
        Assert.Equal(NotificationPolicyReadoutCategories.ProviderInvalid, email.GetProperty("readoutCategory").GetString());
        Assert.False(email.GetProperty("externalProviderAttemptAllowed").GetBoolean());

        var mobilePush = payload.RootElement.GetProperty("channels")
            .EnumerateArray()
            .Single(channel => channel.GetProperty("channel").GetString() == NotificationPolicyChannels.MobilePush);
        Assert.Equal(NotificationPolicyChannelCaps.GenericExternalOnly, mobilePush.GetProperty("channelCap").GetString());
        Assert.Equal(NotificationPolicyReadinessStates.Unsupported, mobilePush.GetProperty("readiness").GetString());
        Assert.Equal(NotificationPolicyReadoutCategories.UnsupportedByDeployment, mobilePush.GetProperty("readoutCategory").GetString());
        Assert.False(mobilePush.GetProperty("externalProviderAttemptAllowed").GetBoolean());
    }

    [Fact]
    public async Task ProviderReadinessSnapshotValuesAreNormalizedBeforeReadout()
    {
        var testContext = CreateFactory(new NotificationProviderReadinessSnapshot(
            "smtp.internal.example:2525;username=smtp-user-placeholder;password=smtp-password-placeholder",
            "apnsCredential=<redacted>;deviceToken=visible-device-token;providerPayload=visible-provider-payload"));
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Policy Owner");
        await SeedPersistedPolicyAsync(
            testFactory,
            session.AuthAccountId,
            emailCap: NotificationPolicyChannelCaps.GenericExternalOnly,
            mobilePushCap: NotificationPolicyChannelCaps.GenericExternalOnly);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(session.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafePolicyReadoutContent(content);
        using var payload = JsonDocument.Parse(content);
        var channels = payload.RootElement.GetProperty("channels").EnumerateArray().ToArray();

        Assert.All(
            channels.Where(channel => channel.GetProperty("channel").GetString() is
                NotificationPolicyChannels.Email or NotificationPolicyChannels.MobilePush),
            channel =>
            {
                Assert.Equal(NotificationPolicyReadinessStates.Unknown, channel.GetProperty("readiness").GetString());
                Assert.Equal(NotificationPolicyReadoutCategories.ProviderUnknown, channel.GetProperty("readoutCategory").GetString());
                Assert.False(channel.GetProperty("externalProviderAttemptAllowed").GetBoolean());
            });
    }

    [Fact]
    public async Task AdminDisabledChannelRemainsDisabledEvenWhenProviderReadinessIsConfigured()
    {
        var testContext = CreateFactory(new NotificationProviderReadinessSnapshot(
            NotificationPolicyReadinessStates.Configured,
            NotificationPolicyReadinessStates.Configured));
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Policy Owner");
        await SeedPersistedPolicyAsync(
            testFactory,
            session.AuthAccountId,
            emailCap: NotificationPolicyChannelCaps.Disabled,
            mobilePushCap: NotificationPolicyChannelCaps.Disabled);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(session.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafePolicyReadoutContent(content);
        using var payload = JsonDocument.Parse(content);
        var channels = payload.RootElement.GetProperty("channels").EnumerateArray().ToArray();

        Assert.All(
            channels.Where(channel => channel.GetProperty("channel").GetString() is
                NotificationPolicyChannels.Email or NotificationPolicyChannels.MobilePush),
            channel =>
            {
                Assert.Equal(NotificationPolicyChannelCaps.Disabled, channel.GetProperty("channelCap").GetString());
                Assert.Equal(NotificationPolicyReadinessStates.Configured, channel.GetProperty("readiness").GetString());
                Assert.Equal(NotificationPolicyReadoutCategories.DisabledByAdmin, channel.GetProperty("readoutCategory").GetString());
                Assert.False(channel.GetProperty("externalProviderAttemptAllowed").GetBoolean());
            });
    }

    [Fact]
    public async Task ReadOnlyAdminPolicyReadoutDoesNotCreatePolicyAuditRowsUntilPolicyAuditIsApproved()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Owner], "Policy Owner");
        using var client = testFactory.CreateClient();
        var beforeCount = await CountNotificationPolicyAuditEventsAsync(testFactory);
        using var request = CreateBearerRequest(session.RawSessionToken);

        using var response = await client.SendAsync(request);
        var content = await response.Content.ReadAsStringAsync();
        var afterCount = await CountNotificationPolicyAuditEventsAsync(testFactory);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertSafePolicyReadoutContent(content);
        Assert.Equal(beforeCount, afterCount);
    }

    [Fact]
    public async Task NormalUserCannotReadAdminNotificationPolicy()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.User], "Normal User");
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(session.RawSessionToken);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        AssertSafePolicyReadoutContent(await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AdminNotificationPolicyReadoutRequiresBearerSession()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();

        using var missingResponse = await client.GetAsync(AdminNotificationPolicyPath);
        Assert.Equal(HttpStatusCode.Unauthorized, missingResponse.StatusCode);
        AssertSafePolicyReadoutContent(await missingResponse.Content.ReadAsStringAsync());

        using var invalidRequest = CreateBearerRequest(WrongRawToken);
        using var invalidResponse = await client.SendAsync(invalidRequest);
        Assert.Equal(HttpStatusCode.Unauthorized, invalidResponse.StatusCode);
        var invalidContent = await invalidResponse.Content.ReadAsStringAsync();
        AssertSafePolicyReadoutContent(invalidContent);
        Assert.DoesNotContain(WrongRawToken, invalidContent);
    }

    [Fact]
    public async Task ReadoutRejectsQueryAndRequestBodyWithoutUnsafeEcho()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var session = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, [SystemRoles.Admin], "Admin Actor");
        using var client = testFactory.CreateClient();

        using var queryRequest = CreateBearerRequest(session.RawSessionToken, $"{AdminNotificationPolicyPath}?smtpPassword=visible-secret");
        using var queryResponse = await client.SendAsync(queryRequest);
        var queryContent = await queryResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, queryResponse.StatusCode);
        AssertSafePolicyReadoutContent(queryContent);
        Assert.DoesNotContain("visible-secret", queryContent);

        using var bodyRequest = CreateBearerRequest(session.RawSessionToken);
        bodyRequest.Content = new StringContent(
            "{\"providerPayload\":\"visible-provider-payload\"}",
            Encoding.UTF8,
            "application/json");
        using var bodyResponse = await client.SendAsync(bodyRequest);
        var bodyContent = await bodyResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, bodyResponse.StatusCode);
        AssertSafePolicyReadoutContent(bodyContent);
        Assert.DoesNotContain("visible-provider-payload", bodyContent);
    }

    [Fact]
    public void OpenApiContractDefinesReadOnlyAdminNotificationPolicyReadout()
    {
        var openApi = File.ReadAllText(FindRepoFile("packages/contracts/openapi/settleora.v1.yaml"));
        var pathBlock = ExtractOpenApiPathBlock(openApi, "/api/v1/admin/notification-policy:");
        var responseSchema = ExtractOpenApiSchemaBlock(openApi, "AdminNotificationPolicyReadoutResponse:");

        Assert.Contains("operationId: getAdminNotificationPolicyReadout", pathBlock);
        Assert.Contains("SessionBearerAuth", pathBlock);
        Assert.Contains("AdminNotificationPolicyReadoutResponse", pathBlock);
        Assert.Contains("\"403\":", pathBlock);
        Assert.DoesNotContain("put:", pathBlock);
        Assert.DoesNotContain("patch:", pathBlock);
        Assert.DoesNotContain("post:", pathBlock);
        Assert.DoesNotContain("security: []", pathBlock);
        Assert.Contains("serverAuthoritative", responseSchema);
        Assert.Contains("persistedSchemaReady", responseSchema);
        Assert.DoesNotContain("smtp", responseSchema, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", responseSchema, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("secret", responseSchema, StringComparison.OrdinalIgnoreCase);
    }

    private FactoryTestContext CreateFactory(NotificationProviderReadinessSnapshot? providerReadiness = null)
    {
        var databaseName = Guid.NewGuid().ToString();
        var timeProvider = new EndpointTestTimeProvider(InitialTimestamp);
        providerReadiness ??= NotificationProviderReadinessSnapshot.ConservativeDefault();
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

                services.RemoveAll<INotificationProviderReadinessService>();
                services.AddSingleton<INotificationProviderReadinessService>(
                    new FakeNotificationProviderReadinessService(providerReadiness));
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        EndpointTestTimeProvider timeProvider,
        IReadOnlyList<string> roles,
        string displayName)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
        var authAccountId = Guid.NewGuid();
        var userProfileId = Guid.NewGuid();
        using (var scope = testFactory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
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
        }

        using var sessionScope = testFactory.Services.CreateScope();
        var sessionRuntimeService = sessionScope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                authAccountId,
                DeviceLabel: "Notification policy endpoint test",
                UserAgentSummary: "Notification policy endpoint user agent",
                NetworkAddressHash: "notification-policy-network",
                RequestedLifetime: TimeSpan.FromHours(1)));

        Assert.True(sessionCreationResult.Succeeded);
        Assert.NotNull(sessionCreationResult.AuthSessionId);
        Assert.NotNull(sessionCreationResult.RawSessionToken);
        Assert.NotNull(sessionCreationResult.SessionExpiresAtUtc);

        timeProvider.SetUtcNow(ValidationTimestamp);
        return new SeededSession(
            authAccountId,
            userProfileId,
            sessionCreationResult.AuthSessionId.Value,
            sessionCreationResult.RawSessionToken,
            sessionCreationResult.SessionExpiresAtUtc.Value);
    }

    private static async Task SeedPersistedPolicyAsync(
        WebApplicationFactory<Program> testFactory,
        Guid actorAuthAccountId,
        string emailCap = NotificationPolicyChannelCaps.GenericExternalOnly,
        string mobilePushCap = NotificationPolicyChannelCaps.Disabled)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var policyId = Guid.NewGuid();
        dbContext.Set<NotificationGlobalPolicy>().Add(new NotificationGlobalPolicy
        {
            Id = policyId,
            PolicyVersion = "policy-v2",
            Status = NotificationPolicyStatuses.Active,
            InAppChannelCap = NotificationPolicyChannelCaps.Enabled,
            EmailChannelCap = emailCap,
            MobilePushChannelCap = mobilePushCap,
            EmailProviderReadiness = NotificationPolicyReadinessStates.Configured,
            MobilePushProviderReadiness = NotificationPolicyReadinessStates.Unconfigured,
            RequiredInAppEnabled = true,
            OrdinaryMuteMaySuppressRequired = false,
            QuietHoursMayDeferRequired = false,
            ExternalSensitiveContentClass = NotificationPolicyContentClasses.GenericExternalOnly,
            QuietHoursDefaultMode = NotificationPolicyTimingModes.Disabled,
            DigestDefaultMode = NotificationPolicyTimingModes.DigestReadout,
            EffectiveAtUtc = PolicyTimestamp,
            CreatedAtUtc = PolicyTimestamp,
            UpdatedAtUtc = PolicyTimestamp,
            CreatedByAuthAccountId = actorAuthAccountId,
            UpdatedByAuthAccountId = actorAuthAccountId
        });
        dbContext.Set<NotificationEventPolicyOverride>().Add(new NotificationEventPolicyOverride
        {
            Id = Guid.NewGuid(),
            NotificationGlobalPolicyId = policyId,
            EventFamily = NotificationPolicyEventFamilies.Recurring,
            InAppChannelCap = NotificationPolicyChannelCaps.Enabled,
            EmailChannelCap = emailCap,
            MobilePushChannelCap = mobilePushCap,
            ExternalContentClass = NotificationPolicyContentClasses.SafeSummaryAllowed,
            RequiredInApp = true,
            DigestEligible = true,
            QuietHoursEligible = false,
            CreatedAtUtc = PolicyTimestamp,
            UpdatedAtUtc = PolicyTimestamp
        });

        await dbContext.SaveChangesAsync();
    }

    private static async Task<int> CountNotificationPolicyAuditEventsAsync(WebApplicationFactory<Program> testFactory)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        return await dbContext.Set<AuthAuditEvent>()
            .CountAsync(auditEvent =>
                auditEvent.Action.Contains("notification_policy")
                || auditEvent.Action.Contains("notification.policy")
                || auditEvent.Action.Contains("admin.notification"));
    }

    private static HttpRequestMessage CreateBearerRequest(string rawSessionToken, string path = AdminNotificationPolicyPath)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {rawSessionToken}");
        return request;
    }

    private static void AssertSafePolicyReadoutContent(string content)
    {
        string[] forbidden =
        [
            "smtpPassword",
            "smtp_user",
            "smtp-user-placeholder",
            "smtp.internal.example",
            "from-address-placeholder",
            "smtp_port",
            "api_key",
            "secret",
            "credential",
            "apns",
            "fcm",
            "providerPayload",
            "provider-payload",
            "provider_request_id",
            "deviceToken",
            "device-token",
            "tokenFingerprint",
            "token-fingerprint",
            "protectedTokenBlob",
            "protected-token-blob",
            "installation_hash",
            "session-token",
            "object_key",
            "storage_path",
            "signed_url",
            "ocr_text",
            "receipt text",
            "payment_handle",
            "qr_contents",
            "private_note",
            "hidden_bill",
            "refreshCredential",
            "refresh-token",
            "passwordHash",
            "passkey",
            "mfa",
            "bearer"
        ];

        foreach (var text in forbidden)
        {
            Assert.DoesNotContain(text, content, StringComparison.OrdinalIgnoreCase);
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

        throw new FileNotFoundException($"Unable to locate {relativePath} from {AppContext.BaseDirectory}.");
    }

    private static string ExtractOpenApiPathBlock(string openApi, string pathHeader)
    {
        var start = openApi.IndexOf($"  {pathHeader}", StringComparison.Ordinal);
        Assert.True(start >= 0, $"Missing OpenAPI path {pathHeader}");
        var next = openApi.IndexOf("\n  /", start + 1, StringComparison.Ordinal);
        return next < 0 ? openApi[start..] : openApi[start..next];
    }

    private static string ExtractOpenApiSchemaBlock(string openApi, string schemaHeader)
    {
        var start = openApi.IndexOf($"    {schemaHeader}", StringComparison.Ordinal);
        Assert.True(start >= 0, $"Missing OpenAPI schema {schemaHeader}");
        var next = openApi.IndexOf("\n    ", start + 1, StringComparison.Ordinal);
        while (next >= 0 && next + 5 < openApi.Length && openApi[next + 5] == ' ')
        {
            next = openApi.IndexOf("\n    ", next + 1, StringComparison.Ordinal);
        }

        return next < 0 ? openApi[start..] : openApi[start..next];
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        EndpointTestTimeProvider TimeProvider);

    private sealed class FakeNotificationProviderReadinessService : INotificationProviderReadinessService
    {
        private readonly NotificationProviderReadinessSnapshot snapshot;

        public FakeNotificationProviderReadinessService(NotificationProviderReadinessSnapshot snapshot)
        {
            this.snapshot = snapshot;
        }

        public NotificationProviderReadinessSnapshot GetSnapshot()
        {
            return snapshot;
        }
    }

    private sealed record SeededSession(
        Guid AuthAccountId,
        Guid UserProfileId,
        Guid AuthSessionId,
        string RawSessionToken,
        DateTimeOffset SessionExpiresAtUtc);

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
}
