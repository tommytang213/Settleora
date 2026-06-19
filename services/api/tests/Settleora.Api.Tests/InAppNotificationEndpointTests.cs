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
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class InAppNotificationEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string NotificationsPath = "/api/v1/notifications";
    private const string WrongRawToken = "visible-wrong-notification-session-token";

    private static readonly DateTimeOffset InitialTimestamp = new(2026, 5, 16, 15, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset ValidationTimestamp = new(2026, 5, 16, 15, 5, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset WriteTimestamp = new(2026, 5, 16, 15, 30, 0, TimeSpan.Zero);

    private readonly WebApplicationFactory<Program> factory;

    public InAppNotificationEndpointTests(WebApplicationFactory<Program> factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task NotificationEndpointsRequireBearerSessionAndDoNotLeakRejectedBearerMaterial()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        using var client = testFactory.CreateClient();
        var notificationId = Guid.NewGuid();

        using var missingListResponse = await client.GetAsync(NotificationsPath);
        await AssertUnauthenticatedProblemAsync(missingListResponse);

        using var invalidListRequest = CreateBearerRequest(HttpMethod.Get, NotificationsPath, WrongRawToken);
        using var invalidListResponse = await client.SendAsync(invalidListRequest);
        await AssertUnauthenticatedProblemAsync(invalidListResponse, WrongRawToken);

        foreach (var (method, path) in new[]
        {
            (HttpMethod.Get, $"{NotificationsPath}/summary"),
            (HttpMethod.Post, $"{NotificationsPath}/read"),
            (HttpMethod.Post, $"{NotificationsPath}/{notificationId:D}/read"),
            (HttpMethod.Post, $"{NotificationsPath}/{notificationId:D}/archive")
        })
        {
            using var request = CreateBearerRequest(method, path, WrongRawToken);
            using var response = await client.SendAsync(request);
            await AssertUnauthenticatedProblemAsync(response, WrongRawToken);
        }
    }

    [Fact]
    public async Task CurrentUserInboxListsOnlyOwnNotificationsAndReturnsSafeFields()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Notification Inbox Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Hidden Other Notification User");
        var visibleUnreadId = await SeedNotificationAsync(
            testFactory,
            actor.UserProfileId,
            other.UserProfileId,
            InAppNotificationEventTypes.BillSubmitted,
            InAppNotificationPriorities.Attention,
            InAppNotificationSubjectTypes.ExpenseBill,
            InitialTimestamp.AddMinutes(1),
            safeSummary: "bounded attention summary",
            actionUrl: "/api/v1/bills/11111111-1111-1111-1111-111111111111");
        var visibleReadId = await SeedNotificationAsync(
            testFactory,
            actor.UserProfileId,
            other.UserProfileId,
            InAppNotificationEventTypes.SettlementPaymentConfirmed,
            InAppNotificationPriorities.Normal,
            InAppNotificationSubjectTypes.SettlementPayment,
            InitialTimestamp.AddMinutes(2),
            status: InAppNotificationStatuses.Read,
            readAtUtc: InitialTimestamp.AddMinutes(3));
        await SeedNotificationAsync(
            testFactory,
            actor.UserProfileId,
            other.UserProfileId,
            InAppNotificationEventTypes.SettlementRequestCancelled,
            InAppNotificationPriorities.Urgent,
            InAppNotificationSubjectTypes.SettlementRequest,
            InitialTimestamp.AddMinutes(4),
            status: InAppNotificationStatuses.Archived,
            readAtUtc: InitialTimestamp.AddMinutes(5),
            archivedAtUtc: InitialTimestamp.AddMinutes(6));
        var hiddenOtherNotificationId = await SeedNotificationAsync(
            testFactory,
            other.UserProfileId,
            actor.UserProfileId,
            InAppNotificationEventTypes.BillParticipantRejected,
            InAppNotificationPriorities.Urgent,
            InAppNotificationSubjectTypes.ExpenseBill,
            InitialTimestamp.AddMinutes(7),
            safeSummary: "hidden cross-user summary");

        using var client = testFactory.CreateClient();
        using var listRequest = CreateBearerRequest(HttpMethod.Get, NotificationsPath, actor.RawSessionToken);
        using var listResponse = await client.SendAsync(listRequest);
        var listContent = await listResponse.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        AssertSafeNotificationResponseContent(
            listContent,
            actor.RawSessionToken,
            other.RawSessionToken,
            actor.AuthAccountId.ToString("D"),
            other.AuthAccountId.ToString("D"),
            actor.UserProfileId.ToString("D"),
            other.UserProfileId.ToString("D"),
            hiddenOtherNotificationId.ToString("D"),
            "Hidden Other Notification User",
            "hidden cross-user summary");
        using var listPayload = JsonDocument.Parse(listContent);
        var notifications = listPayload.RootElement.GetProperty("notifications").EnumerateArray().ToArray();
        Assert.Equal(2, notifications.Length);
        Assert.Equal(visibleReadId, notifications[0].GetProperty("id").GetGuid());
        Assert.Equal(visibleUnreadId, notifications[1].GetProperty("id").GetGuid());
        Assert.All(notifications, AssertNotificationResponseShape);
        Assert.Equal(InAppNotificationEventTypes.SettlementPaymentConfirmed, notifications[0].GetProperty("eventType").GetString());
        Assert.Equal(InAppNotificationStatuses.Read, notifications[0].GetProperty("status").GetString());
        Assert.Equal(InAppNotificationEventTypes.BillSubmitted, notifications[1].GetProperty("eventType").GetString());
        Assert.Equal("bounded attention summary", notifications[1].GetProperty("safeSummary").GetString());

        using var summaryRequest = CreateBearerRequest(HttpMethod.Get, $"{NotificationsPath}/summary", actor.RawSessionToken);
        using var summaryResponse = await client.SendAsync(summaryRequest);
        using var summaryPayload = JsonDocument.Parse(await summaryResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, summaryResponse.StatusCode);
        Assert.Equal(1, summaryPayload.RootElement.GetProperty("unreadCount").GetInt32());
        Assert.Equal(1, summaryPayload.RootElement.GetProperty("attentionCount").GetInt32());
        Assert.Equal(0, summaryPayload.RootElement.GetProperty("urgentCount").GetInt32());
    }

    [Fact]
    public async Task NotificationReadoutsRejectUnsupportedQueryAndBodiesWithoutSideEffectsOrLeaks()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Notification Readout Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Notification Readout Other");
        var actorNotificationId = await SeedNotificationAsync(
            testFactory,
            actor.UserProfileId,
            other.UserProfileId,
            InAppNotificationEventTypes.BillSubmitted,
            InAppNotificationPriorities.Attention,
            InAppNotificationSubjectTypes.ExpenseBill,
            InitialTimestamp.AddMinutes(1),
            safeSummary: "visible notification summary");
        var otherNotificationId = await SeedNotificationAsync(
            testFactory,
            other.UserProfileId,
            actor.UserProfileId,
            InAppNotificationEventTypes.SettlementPaymentConfirmed,
            InAppNotificationPriorities.Normal,
            InAppNotificationSubjectTypes.SettlementPayment,
            InitialTimestamp.AddMinutes(2),
            safeSummary: "hidden notification summary");
        using var client = testFactory.CreateClient();

        using var unsupportedListRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{NotificationsPath}?ownerUserProfileId={other.UserProfileId:D}&notificationId={otherNotificationId:D}",
            actor.RawSessionToken);
        using var unsupportedListResponse = await client.SendAsync(unsupportedListRequest);
        await AssertInvalidNotificationRequestProblemAsync(
            unsupportedListResponse,
            other.UserProfileId.ToString("D"),
            otherNotificationId.ToString("D"),
            "hidden notification summary");

        using var listBodyRequest = CreateJsonBearerRequest(
            HttpMethod.Get,
            NotificationsPath,
            actor.RawSessionToken,
            $$"""
            {
              "accountId": "{{other.AuthAccountId:D}}",
              "notificationId": "{{otherNotificationId:D}}",
              "ownerUserProfileId": "{{other.UserProfileId:D}}"
            }
            """);
        using var listBodyResponse = await client.SendAsync(listBodyRequest);
        await AssertInvalidNotificationRequestProblemAsync(
            listBodyResponse,
            other.AuthAccountId.ToString("D"),
            other.UserProfileId.ToString("D"),
            otherNotificationId.ToString("D"),
            "hidden notification summary");

        using var unsupportedSummaryRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{NotificationsPath}/summary?paymentId={Guid.NewGuid():D}",
            actor.RawSessionToken);
        using var unsupportedSummaryResponse = await client.SendAsync(unsupportedSummaryRequest);
        await AssertInvalidNotificationRequestProblemAsync(unsupportedSummaryResponse, "paymentId");

        using var summaryBodyRequest = CreateJsonBearerRequest(
            HttpMethod.Get,
            $"{NotificationsPath}/summary",
            actor.RawSessionToken,
            $$"""
            {
              "userProfileId": "{{other.UserProfileId:D}}"
            }
            """);
        using var summaryBodyResponse = await client.SendAsync(summaryBodyRequest);
        await AssertInvalidNotificationRequestProblemAsync(summaryBodyResponse, other.UserProfileId.ToString("D"));

        var actorNotification = await ReadNotificationAsync(testFactory, actorNotificationId);
        Assert.Equal(InAppNotificationStatuses.Unread, actorNotification.Status);
        Assert.Null(actorNotification.ReadAtUtc);
        Assert.Null(actorNotification.ArchivedAtUtc);

        var otherNotification = await ReadNotificationAsync(testFactory, otherNotificationId);
        Assert.Equal(InAppNotificationStatuses.Unread, otherNotification.Status);
        Assert.Null(otherNotification.ReadAtUtc);
        Assert.Null(otherNotification.ArchivedAtUtc);
    }

    [Fact]
    public async Task NotificationListRejectsDuplicateAndInvalidSupportedQueryValuesWithoutEchoingRawValues()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Notification Query Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Notification Query Other");
        var notificationId = await SeedNotificationAsync(
            testFactory,
            actor.UserProfileId,
            other.UserProfileId,
            InAppNotificationEventTypes.SettlementRequestCreated,
            InAppNotificationPriorities.Attention,
            InAppNotificationSubjectTypes.SettlementRequest,
            InitialTimestamp.AddMinutes(1),
            safeSummary: "query visible summary");
        using var client = testFactory.CreateClient();

        using var duplicateRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{NotificationsPath}?status=unread&status=read&limit=10&limit=20&before=2026-05-16T15%3A00%3A00Z&before=2026-05-16T16%3A00%3A00Z",
            actor.RawSessionToken);
        using var duplicateResponse = await client.SendAsync(duplicateRequest);
        await AssertInvalidNotificationRequestProblemAsync(duplicateResponse, "query visible summary");

        using var invalidRequest = CreateBearerRequest(
            HttpMethod.Get,
            $"{NotificationsPath}?status=smuggled-status-value&limit=smuggled-limit-value&before=smuggled-before-value",
            actor.RawSessionToken);
        using var invalidResponse = await client.SendAsync(invalidRequest);
        await AssertInvalidNotificationRequestProblemAsync(
            invalidResponse,
            "smuggled-status-value",
            "smuggled-limit-value",
            "smuggled-before-value",
            "query visible summary");

        var notification = await ReadNotificationAsync(testFactory, notificationId);
        Assert.Equal(InAppNotificationStatuses.Unread, notification.Status);
        Assert.Null(notification.ReadAtUtc);
        Assert.Null(notification.ArchivedAtUtc);
    }

    [Fact]
    public async Task NotificationListPreservesValidSupportedFilters()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Notification Valid Filter Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Notification Valid Filter Other");
        var olderUnreadId = await SeedNotificationAsync(
            testFactory,
            actor.UserProfileId,
            other.UserProfileId,
            InAppNotificationEventTypes.BillSubmitted,
            InAppNotificationPriorities.Attention,
            InAppNotificationSubjectTypes.ExpenseBill,
            InitialTimestamp.AddMinutes(1));
        await SeedNotificationAsync(
            testFactory,
            actor.UserProfileId,
            other.UserProfileId,
            InAppNotificationEventTypes.SettlementPaymentConfirmed,
            InAppNotificationPriorities.Normal,
            InAppNotificationSubjectTypes.SettlementPayment,
            InitialTimestamp.AddMinutes(2),
            status: InAppNotificationStatuses.Read,
            readAtUtc: InitialTimestamp.AddMinutes(3));
        await SeedNotificationAsync(
            testFactory,
            actor.UserProfileId,
            other.UserProfileId,
            InAppNotificationEventTypes.SettlementRequestCancelled,
            InAppNotificationPriorities.Urgent,
            InAppNotificationSubjectTypes.SettlementRequest,
            InitialTimestamp.AddMinutes(4),
            status: InAppNotificationStatuses.Archived,
            readAtUtc: InitialTimestamp.AddMinutes(5),
            archivedAtUtc: InitialTimestamp.AddMinutes(6));
        using var client = testFactory.CreateClient();

        using var request = CreateBearerRequest(
            HttpMethod.Get,
            $"{NotificationsPath}?status=unread&limit=1&before=2026-05-16T15%3A02%3A00Z",
            actor.RawSessionToken);
        using var response = await client.SendAsync(request);
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var notifications = payload.RootElement.GetProperty("notifications").EnumerateArray().ToArray();
        var notification = Assert.Single(notifications);
        Assert.Equal(olderUnreadId, notification.GetProperty("id").GetGuid());
        Assert.Equal(InAppNotificationStatuses.Unread, notification.GetProperty("status").GetString());
    }

    [Fact]
    public async Task ReadAndArchiveActionsAreCurrentUserScopedAndIdempotent()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Notification Action Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Notification Action Other");
        var notificationId = await SeedNotificationAsync(
            testFactory,
            actor.UserProfileId,
            other.UserProfileId,
            InAppNotificationEventTypes.SettlementRequestCreated,
            InAppNotificationPriorities.Attention,
            InAppNotificationSubjectTypes.SettlementRequest,
            InitialTimestamp.AddMinutes(1));
        var crossUserNotificationId = await SeedNotificationAsync(
            testFactory,
            other.UserProfileId,
            actor.UserProfileId,
            InAppNotificationEventTypes.SettlementRequestCreated,
            InAppNotificationPriorities.Attention,
            InAppNotificationSubjectTypes.SettlementRequest,
            InitialTimestamp.AddMinutes(2));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using var crossUserReadRequest = CreateBearerRequest(
            HttpMethod.Post,
            $"{NotificationsPath}/{crossUserNotificationId:D}/read",
            actor.RawSessionToken);
        using var crossUserReadResponse = await client.SendAsync(crossUserReadRequest);
        await AssertNotificationUnavailableProblemAsync(crossUserReadResponse);

        using var readRequest = CreateBearerRequest(
            HttpMethod.Post,
            $"{NotificationsPath}/{notificationId:D}/read",
            actor.RawSessionToken);
        using var readResponse = await client.SendAsync(readRequest);
        using var readPayload = JsonDocument.Parse(await readResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, readResponse.StatusCode);
        Assert.Equal(InAppNotificationStatuses.Read, readPayload.RootElement.GetProperty("status").GetString());
        Assert.Equal(WriteTimestamp, readPayload.RootElement.GetProperty("readAtUtc").GetDateTimeOffset());

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(10));
        using var secondReadRequest = CreateBearerRequest(
            HttpMethod.Post,
            $"{NotificationsPath}/{notificationId:D}/read",
            actor.RawSessionToken);
        using var secondReadResponse = await client.SendAsync(secondReadRequest);
        using var secondReadPayload = JsonDocument.Parse(await secondReadResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, secondReadResponse.StatusCode);
        Assert.Equal(WriteTimestamp, secondReadPayload.RootElement.GetProperty("readAtUtc").GetDateTimeOffset());

        using var archiveRequest = CreateBearerRequest(
            HttpMethod.Post,
            $"{NotificationsPath}/{notificationId:D}/archive",
            actor.RawSessionToken);
        using var archiveResponse = await client.SendAsync(archiveRequest);
        using var archivePayload = JsonDocument.Parse(await archiveResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, archiveResponse.StatusCode);
        Assert.Equal(InAppNotificationStatuses.Archived, archivePayload.RootElement.GetProperty("status").GetString());
        Assert.Equal(WriteTimestamp.AddMinutes(10), archivePayload.RootElement.GetProperty("archivedAtUtc").GetDateTimeOffset());

        testContext.TimeProvider.SetUtcNow(WriteTimestamp.AddMinutes(20));
        using var secondArchiveRequest = CreateBearerRequest(
            HttpMethod.Post,
            $"{NotificationsPath}/{notificationId:D}/archive",
            actor.RawSessionToken);
        using var secondArchiveResponse = await client.SendAsync(secondArchiveRequest);
        using var secondArchivePayload = JsonDocument.Parse(await secondArchiveResponse.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, secondArchiveResponse.StatusCode);
        Assert.Equal(WriteTimestamp.AddMinutes(10), secondArchivePayload.RootElement.GetProperty("archivedAtUtc").GetDateTimeOffset());

        var persistedNotification = await ReadNotificationAsync(testFactory, notificationId);
        Assert.Equal(InAppNotificationStatuses.Archived, persistedNotification.Status);
        Assert.Equal(WriteTimestamp, persistedNotification.ReadAtUtc);
        Assert.Equal(WriteTimestamp.AddMinutes(10), persistedNotification.ArchivedAtUtc);
        Assert.Equal(InAppNotificationStatuses.Unread, (await ReadNotificationAsync(testFactory, crossUserNotificationId)).Status);
    }

    [Fact]
    public async Task BatchReadMarksOnlyVisibleUnreadCurrentUserNotifications()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Batch Read Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Batch Read Other");
        var firstId = await SeedNotificationAsync(
            testFactory,
            actor.UserProfileId,
            other.UserProfileId,
            InAppNotificationEventTypes.BillSubmitted,
            InAppNotificationPriorities.Attention,
            InAppNotificationSubjectTypes.ExpenseBill,
            InitialTimestamp.AddMinutes(1));
        var secondId = await SeedNotificationAsync(
            testFactory,
            actor.UserProfileId,
            other.UserProfileId,
            InAppNotificationEventTypes.SettlementPaymentDisputed,
            InAppNotificationPriorities.Urgent,
            InAppNotificationSubjectTypes.SettlementPayment,
            InitialTimestamp.AddMinutes(2));
        var otherId = await SeedNotificationAsync(
            testFactory,
            other.UserProfileId,
            actor.UserProfileId,
            InAppNotificationEventTypes.BillSubmitted,
            InAppNotificationPriorities.Attention,
            InAppNotificationSubjectTypes.ExpenseBill,
            InitialTimestamp.AddMinutes(3));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();
        using var request = CreateBearerRequest(HttpMethod.Post, $"{NotificationsPath}/read", actor.RawSessionToken);

        using var response = await client.SendAsync(request);
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(0, payload.RootElement.GetProperty("unreadCount").GetInt32());
        Assert.Equal(0, payload.RootElement.GetProperty("attentionCount").GetInt32());
        Assert.Equal(0, payload.RootElement.GetProperty("urgentCount").GetInt32());
        Assert.Equal(InAppNotificationStatuses.Read, (await ReadNotificationAsync(testFactory, firstId)).Status);
        Assert.Equal(InAppNotificationStatuses.Read, (await ReadNotificationAsync(testFactory, secondId)).Status);
        Assert.Equal(InAppNotificationStatuses.Unread, (await ReadNotificationAsync(testFactory, otherId)).Status);
    }

    [Fact]
    public async Task ReadAndArchiveRejectBodySmuggledIdsWithoutSideEffects()
    {
        var testContext = CreateFactory();
        using var testFactory = testContext.Factory;
        var actor = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Notification Body Actor");
        var other = await SeedSessionActorAsync(testFactory, testContext.TimeProvider, "Notification Body Other");
        var actorNotificationId = await SeedNotificationAsync(
            testFactory,
            actor.UserProfileId,
            other.UserProfileId,
            InAppNotificationEventTypes.SettlementRequestCreated,
            InAppNotificationPriorities.Attention,
            InAppNotificationSubjectTypes.SettlementRequest,
            InitialTimestamp.AddMinutes(1));
        var otherNotificationId = await SeedNotificationAsync(
            testFactory,
            other.UserProfileId,
            actor.UserProfileId,
            InAppNotificationEventTypes.SettlementPaymentConfirmed,
            InAppNotificationPriorities.Normal,
            InAppNotificationSubjectTypes.SettlementPayment,
            InitialTimestamp.AddMinutes(2));
        testContext.TimeProvider.SetUtcNow(WriteTimestamp);
        using var client = testFactory.CreateClient();

        using var markOneRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            $"{NotificationsPath}/{actorNotificationId:D}/read",
            actor.RawSessionToken,
            $$"""
            {
              "notificationId": "{{otherNotificationId:D}}",
              "recipientId": "{{other.UserProfileId:D}}",
              "userProfileId": "{{other.UserProfileId:D}}"
            }
            """);
        using var markOneResponse = await client.SendAsync(markOneRequest);
        await AssertInvalidNoBodyProblemAsync(markOneResponse, otherNotificationId.ToString("D"), other.UserProfileId.ToString("D"));

        using var markAllRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            $"{NotificationsPath}/read",
            actor.RawSessionToken,
            $$"""
            {
              "ownerUserProfileId": "{{other.UserProfileId:D}}",
              "accountId": "{{other.AuthAccountId:D}}"
            }
            """);
        using var markAllResponse = await client.SendAsync(markAllRequest);
        await AssertInvalidNoBodyProblemAsync(markAllResponse, other.UserProfileId.ToString("D"), other.AuthAccountId.ToString("D"));

        using var archiveRequest = CreateJsonBearerRequest(
            HttpMethod.Post,
            $"{NotificationsPath}/{actorNotificationId:D}/archive",
            actor.RawSessionToken,
            $$"""
            {
              "notificationId": "{{otherNotificationId:D}}",
              "recipientId": "{{other.UserProfileId:D}}"
            }
            """);
        using var archiveResponse = await client.SendAsync(archiveRequest);
        await AssertInvalidNoBodyProblemAsync(archiveResponse, otherNotificationId.ToString("D"), other.UserProfileId.ToString("D"));

        var actorNotification = await ReadNotificationAsync(testFactory, actorNotificationId);
        Assert.Equal(InAppNotificationStatuses.Unread, actorNotification.Status);
        Assert.Null(actorNotification.ReadAtUtc);
        Assert.Null(actorNotification.ArchivedAtUtc);

        var otherNotification = await ReadNotificationAsync(testFactory, otherNotificationId);
        Assert.Equal(InAppNotificationStatuses.Unread, otherNotification.Status);
        Assert.Null(otherNotification.ReadAtUtc);
        Assert.Null(otherNotification.ArchivedAtUtc);
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
            });
        });

        return new FactoryTestContext(testFactory, timeProvider);
    }

    private static async Task<SeededSession> SeedSessionActorAsync(
        WebApplicationFactory<Program> testFactory,
        EndpointTestTimeProvider timeProvider,
        string displayName)
    {
        timeProvider.SetUtcNow(InitialTimestamp);
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
        dbContext.Set<SystemRoleAssignment>().Add(new SystemRoleAssignment
        {
            AuthAccountId = authAccountId,
            Role = SystemRoles.User,
            AssignedAtUtc = InitialTimestamp
        });
        await dbContext.SaveChangesAsync();

        var sessionRuntimeService = scope.ServiceProvider.GetRequiredService<IAuthSessionRuntimeService>();
        var sessionCreationResult = await sessionRuntimeService.CreateSessionAsync(
            new AuthSessionCreationRequest(
                authAccountId,
                DeviceLabel: "Notification endpoint test",
                UserAgentSummary: "Notification endpoint test user agent",
                NetworkAddressHash: "notification-endpoint-test-network",
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

    private static async Task<Guid> SeedNotificationAsync(
        WebApplicationFactory<Program> testFactory,
        Guid recipientUserProfileId,
        Guid? actorUserProfileId,
        string eventType,
        string priority,
        string subjectType,
        DateTimeOffset createdAtUtc,
        string status = InAppNotificationStatuses.Unread,
        DateTimeOffset? readAtUtc = null,
        DateTimeOffset? archivedAtUtc = null,
        string? safeSummary = null,
        string? actionUrl = null)
    {
        using var scope = testFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();
        var notificationId = Guid.NewGuid();
        dbContext.Set<InAppNotification>().Add(new InAppNotification
        {
            Id = notificationId,
            RecipientUserProfileId = recipientUserProfileId,
            ActorUserProfileId = actorUserProfileId,
            EventType = eventType,
            Status = status,
            Priority = priority,
            SubjectType = subjectType,
            TitleKey = $"notifications.{eventType}.title",
            MessageKey = $"notifications.{eventType}.message",
            SafeSummary = safeSummary,
            ActionUrl = actionUrl,
            CreatedAtUtc = createdAtUtc,
            ReadAtUtc = readAtUtc,
            ArchivedAtUtc = archivedAtUtc
        });
        await dbContext.SaveChangesAsync();

        return notificationId;
    }

    private static async Task<InAppNotification> ReadNotificationAsync(
        WebApplicationFactory<Program> testFactory,
        Guid notificationId)
    {
        using var scope = testFactory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<SettleoraDbContext>()
            .Set<InAppNotification>()
            .SingleAsync(notification => notification.Id == notificationId);
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

    private static HttpRequestMessage CreateJsonBearerRequest(
        HttpMethod method,
        string path,
        string rawSessionToken,
        string json)
    {
        var request = CreateBearerRequest(method, path, rawSessionToken);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        return request;
    }

    private static async Task AssertUnauthenticatedProblemAsync(
        HttpResponseMessage response,
        string? unexpectedResponseText = null)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("token", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("hash", content, StringComparison.OrdinalIgnoreCase);
        if (unexpectedResponseText is not null)
        {
            Assert.DoesNotContain(unexpectedResponseText, content);
        }

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Unauthenticated", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(401, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task AssertNotificationUnavailableProblemAsync(HttpResponseMessage response)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("auth", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("session", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", content, StringComparison.OrdinalIgnoreCase);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Notification unavailable", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task AssertInvalidNoBodyProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("auth", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("session", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("recipient", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("owner", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("account", content, StringComparison.OrdinalIgnoreCase);
        foreach (var unexpectedText in unexpectedResponseText)
        {
            Assert.DoesNotContain(unexpectedText, content);
        }

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid notification request", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal("This notification action does not accept a request body.", payload.RootElement.GetProperty("detail").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static async Task AssertInvalidNotificationRequestProblemAsync(
        HttpResponseMessage response,
        params string[] unexpectedResponseText)
    {
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("auth", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("session", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("recipient", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("owner", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("account", content, StringComparison.OrdinalIgnoreCase);
        foreach (var unexpectedText in unexpectedResponseText)
        {
            Assert.DoesNotContain(unexpectedText, content);
        }

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("Invalid notification request", payload.RootElement.GetProperty("title").GetString());
        Assert.Equal(400, payload.RootElement.GetProperty("status").GetInt32());
    }

    private static void AssertNotificationResponseShape(JsonElement response)
    {
        Assert.Equal(
            [
                "actionUrl",
                "archivedAtUtc",
                "createdAtUtc",
                "eventType",
                "expenseBillId",
                "expenseBillRevisionId",
                "groupId",
                "id",
                "messageKey",
                "priority",
                "readAtUtc",
                "recurringBillOccurrenceId",
                "recurringBillTemplateId",
                "safeSummary",
                "settlementPaymentId",
                "settlementRequestId",
                "status",
                "subjectType",
                "titleKey"
            ],
            response.EnumerateObject()
                .Select(property => property.Name)
                .Order(StringComparer.Ordinal)
                .ToArray());
    }

    private static void AssertSafeNotificationResponseContent(
        string content,
        params string[] forbiddenValues)
    {
        var lowerContent = content.ToLowerInvariant();
        foreach (var forbiddenValue in forbiddenValues)
        {
            Assert.DoesNotContain(forbiddenValue, content);
        }

        Assert.DoesNotContain("recipientuserprofileid", lowerContent);
        Assert.DoesNotContain("actoruserprofileid", lowerContent);
        Assert.DoesNotContain("authaccount", lowerContent);
        Assert.DoesNotContain("session", lowerContent);
        Assert.DoesNotContain("credential", lowerContent);
        Assert.DoesNotContain("token", lowerContent);
        Assert.DoesNotContain("hash", lowerContent);
        Assert.DoesNotContain("password", lowerContent);
        Assert.DoesNotContain("provider", lowerContent);
        Assert.DoesNotContain("objectkey", lowerContent);
        Assert.DoesNotContain("storage", lowerContent);
        Assert.DoesNotContain("paymenthandle", lowerContent);
        Assert.DoesNotContain("paymentnote", lowerContent);
        Assert.DoesNotContain("ocr", lowerContent);
    }

    private sealed record FactoryTestContext(
        WebApplicationFactory<Program> Factory,
        EndpointTestTimeProvider TimeProvider);

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
