using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.Users;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class NotificationDeliveryAttemptRecorderTests
{
    private static readonly DateTimeOffset EvaluationTime = new(2026, 7, 1, 4, 55, 0, TimeSpan.Zero);

    private readonly NotificationDecisionEnvelopeResolver resolver = new();

    [Theory]
    [InlineData(NotificationChannels.Email)]
    [InlineData(NotificationChannels.MobilePush)]
    public async Task RecorderPersistsEligibleExternalAttemptWithProviderNeutralSafeFields(string channel)
    {
        await using var dbContext = CreateDbContext();
        var recipientId = await SeedUserProfileAsync(dbContext, "Recipient");
        var actorId = await SeedUserProfileAsync(dbContext, "Actor");
        var groupId = await SeedGroupAsync(dbContext, actorId);
        var recorder = new EfNotificationDeliveryAttemptRecorder(dbContext);
        var envelope = CreateEligibleEnvelope(recipientId, actorId, groupId, channel);

        var result = await recorder.RecordAsync(new NotificationDeliveryAttemptRecordRequest(
            envelope,
            channel,
            $"notification-attempt:{channel}:bill-submitted:1",
            EvaluationTime,
            SourceDomainEligible: true,
            SourceCorrelationId: "source-correlation-1",
            NextAttemptAtUtc: EvaluationTime.AddMinutes(5),
            ExpiresAtUtc: EvaluationTime.AddHours(1),
            ExpenseBillId: Guid.Parse("11111111-1111-1111-1111-111111111111")));
        await dbContext.SaveChangesAsync();

        Assert.True(result.Created);
        Assert.False(result.Duplicate);
        Assert.Equal(NotificationDeliveryAttemptStatuses.Queued, result.Status);
        Assert.Equal(NotificationChannelDecisionReasons.FutureProviderEligible, result.Reason);

        var attempt = Assert.Single(await dbContext.Set<NotificationDeliveryAttempt>().AsNoTracking().ToListAsync());
        Assert.Equal(result.DeliveryAttemptId, attempt.Id);
        Assert.Equal(recipientId, attempt.RecipientUserProfileId);
        Assert.Equal(actorId, attempt.ActorUserProfileId);
        Assert.Equal(groupId, attempt.GroupId);
        Assert.Equal(channel, attempt.Channel);
        Assert.Equal(NotificationDeliveryAttemptStatuses.Queued, attempt.Status);
        Assert.Equal(NotificationChannelDecisionReasons.FutureProviderEligible, attempt.StatusReason);
        Assert.Equal(0, attempt.AttemptCount);
        Assert.Equal(EvaluationTime.AddMinutes(5), attempt.NextAttemptAtUtc);
        Assert.Equal(EvaluationTime.AddHours(1), attempt.ExpiresAtUtc);
        Assert.Null(attempt.CompletedAtUtc);
        Assert.Null(attempt.RedactedProviderResultCategory);
        Assert.False(NotificationDeliveryAttemptStatuses.IsProviderRuntimeStatus(attempt.Status));
        Assert.Equal(InAppNotificationEventTypes.BillSubmitted, attempt.EventType);
        Assert.Equal(InAppNotificationSubjectTypes.ExpenseBill, attempt.SubjectType);
        Assert.Equal(Guid.Parse("11111111-1111-1111-1111-111111111111"), attempt.ExpenseBillId);
    }

    [Fact]
    public async Task RecorderSkipsDisabledUnconfiguredDeferredAndUnsafeDecisionsWithoutFakeProviderSuccess()
    {
        await using var dbContext = CreateDbContext();
        var recipientId = await SeedUserProfileAsync(dbContext, "Recipient");
        var actorId = await SeedUserProfileAsync(dbContext, "Actor");
        var recorder = new EfNotificationDeliveryAttemptRecorder(dbContext);
        var cases = new[]
        {
            CreateEnvelope(recipientId, actorId, emailPolicy: new NotificationDecisionChannelPolicy(AllowedByPolicy: false)),
            CreateEnvelope(recipientId, actorId),
            CreateEnvelope(
                recipientId,
                actorId,
                preference: CreatePreference(preference =>
                    preference.DeliveryTiming = NotificationPreferenceDeliveryTimings.DigestReadout),
                emailPolicy: new NotificationDecisionChannelPolicy(ProviderConfigured: true)),
            CreateEnvelope(
                recipientId,
                actorId,
                externalContentSafe: false,
                emailPolicy: new NotificationDecisionChannelPolicy(ProviderConfigured: true))
        };

        foreach (var envelope in cases)
        {
            var result = await recorder.RecordAsync(new NotificationDeliveryAttemptRecordRequest(
                envelope,
                NotificationChannels.Email,
                $"notification-attempt:{Guid.NewGuid()}",
                EvaluationTime,
                SourceDomainEligible: true));

            Assert.False(result.Created);
            Assert.False(result.Duplicate);
            Assert.Null(result.DeliveryAttemptId);
            Assert.False(NotificationChannelDecisionStates.IsTerminalProviderSuccess(result.Status));
            Assert.False(NotificationDeliveryAttemptStatuses.IsProviderRuntimeStatus(result.Status));
        }

        await dbContext.SaveChangesAsync();
        Assert.Empty(await dbContext.Set<NotificationDeliveryAttempt>().AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task RecorderRequiresSourceDomainEligibilityAndRecipientProfile()
    {
        await using var dbContext = CreateDbContext();
        var recipientId = await SeedUserProfileAsync(dbContext, "Recipient");
        var actorId = await SeedUserProfileAsync(dbContext, "Actor");
        var recorder = new EfNotificationDeliveryAttemptRecorder(dbContext);
        var envelope = CreateEligibleEnvelope(recipientId, actorId, groupId: null, NotificationChannels.Email);

        var sourceIneligible = await recorder.RecordAsync(new NotificationDeliveryAttemptRecordRequest(
            envelope,
            NotificationChannels.Email,
            "notification-attempt:source-ineligible",
            EvaluationTime,
            SourceDomainEligible: false));
        var missingRecipientEnvelope = CreateEligibleEnvelope(Guid.NewGuid(), actorId, groupId: null, NotificationChannels.Email);
        var missingRecipient = await recorder.RecordAsync(new NotificationDeliveryAttemptRecordRequest(
            missingRecipientEnvelope,
            NotificationChannels.Email,
            "notification-attempt:missing-recipient",
            EvaluationTime,
            SourceDomainEligible: true));

        await dbContext.SaveChangesAsync();

        Assert.False(sourceIneligible.Created);
        Assert.Equal(NotificationDeliveryAttemptStatuses.Suppressed, sourceIneligible.Status);
        Assert.Equal("source_domain_ineligible", sourceIneligible.Reason);
        Assert.False(missingRecipient.Created);
        Assert.Equal(NotificationDeliveryAttemptStatuses.Suppressed, missingRecipient.Status);
        Assert.Equal("recipient_profile_unavailable", missingRecipient.Reason);
        Assert.Empty(await dbContext.Set<NotificationDeliveryAttempt>().AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task RecorderUsesIdempotencyKeyToAvoidDuplicateAttemptRows()
    {
        await using var dbContext = CreateDbContext();
        var recipientId = await SeedUserProfileAsync(dbContext, "Recipient");
        var actorId = await SeedUserProfileAsync(dbContext, "Actor");
        var recorder = new EfNotificationDeliveryAttemptRecorder(dbContext);
        var envelope = CreateEligibleEnvelope(recipientId, actorId, groupId: null, NotificationChannels.Email);
        var request = new NotificationDeliveryAttemptRecordRequest(
            envelope,
            NotificationChannels.Email,
            "notification-attempt:idempotent-email-1",
            EvaluationTime,
            SourceDomainEligible: true);

        var first = await recorder.RecordAsync(request);
        await dbContext.SaveChangesAsync();
        var second = await recorder.RecordAsync(request);
        await dbContext.SaveChangesAsync();

        Assert.True(first.Created);
        Assert.False(second.Created);
        Assert.True(second.Duplicate);
        Assert.Equal(first.DeliveryAttemptId, second.DeliveryAttemptId);
        Assert.Single(await dbContext.Set<NotificationDeliveryAttempt>().AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task RecorderDoesNotMutateInAppInboxOrSourceBusinessState()
    {
        await using var dbContext = CreateDbContext();
        var recipientId = await SeedUserProfileAsync(dbContext, "Recipient");
        var actorId = await SeedUserProfileAsync(dbContext, "Actor");
        var groupId = await SeedGroupAsync(dbContext, actorId);
        var inAppNotificationId = Guid.NewGuid();
        dbContext.Set<InAppNotification>().Add(new InAppNotification
        {
            Id = inAppNotificationId,
            RecipientUserProfileId = recipientId,
            ActorUserProfileId = actorId,
            EventType = InAppNotificationEventTypes.BillSubmitted,
            Status = InAppNotificationStatuses.Unread,
            Priority = InAppNotificationPriorities.Attention,
            SubjectType = InAppNotificationSubjectTypes.ExpenseBill,
            TitleKey = "notifications.bill.submitted.title",
            MessageKey = "notifications.bill.submitted.message",
            GroupId = groupId,
            CreatedAtUtc = EvaluationTime
        });
        await dbContext.SaveChangesAsync();

        var recorder = new EfNotificationDeliveryAttemptRecorder(dbContext);
        var envelope = CreateEligibleEnvelope(recipientId, actorId, groupId, NotificationChannels.Email);
        var result = await recorder.RecordAsync(new NotificationDeliveryAttemptRecordRequest(
            envelope,
            NotificationChannels.Email,
            "notification-attempt:no-source-mutation",
            EvaluationTime,
            SourceDomainEligible: true,
            InAppNotificationId: inAppNotificationId,
            GroupId: groupId));
        await dbContext.SaveChangesAsync();

        Assert.True(result.Created);
        var notification = Assert.Single(await dbContext.Set<InAppNotification>().AsNoTracking().ToListAsync());
        Assert.Equal(InAppNotificationStatuses.Unread, notification.Status);
        Assert.Null(notification.ReadAtUtc);
        Assert.Null(notification.ArchivedAtUtc);

        var group = Assert.Single(await dbContext.Set<UserGroup>().AsNoTracking().ToListAsync());
        Assert.Equal("Shared Dinner", group.Name);
        Assert.Equal(EvaluationTime, group.CreatedAtUtc);
        Assert.Equal(EvaluationTime, group.UpdatedAtUtc);
        Assert.Null(group.DeletedAtUtc);
    }

    [Fact]
    public void RecorderHasNoProviderRuntimeOrDeviceTokenDependencies()
    {
        var constructor = Assert.Single(typeof(EfNotificationDeliveryAttemptRecorder).GetConstructors());
        var parameter = Assert.Single(constructor.GetParameters());

        Assert.Equal(typeof(SettleoraDbContext), parameter.ParameterType);
        Assert.DoesNotContain(
            typeof(EfNotificationDeliveryAttemptRecorder).Assembly.GetTypes().Select(type => type.Name),
            name => name.Contains("Smtp", StringComparison.OrdinalIgnoreCase)
                || name.Contains("PushProvider", StringComparison.OrdinalIgnoreCase)
                || name.Contains("DeviceToken", StringComparison.OrdinalIgnoreCase));
    }

    private NotificationDecisionEnvelope CreateEligibleEnvelope(
        Guid recipientId,
        Guid? actorId,
        Guid? groupId,
        string channel)
    {
        var emailPolicy = channel == NotificationChannels.Email
            ? new NotificationDecisionChannelPolicy(ProviderConfigured: true)
            : null;
        var mobilePushPolicy = channel == NotificationChannels.MobilePush
            ? new NotificationDecisionChannelPolicy(ProviderConfigured: true, RecipientDeviceAvailable: true)
            : null;

        return CreateEnvelope(
            recipientId,
            actorId,
            groupId,
            emailPolicy: emailPolicy,
            mobilePushPolicy: mobilePushPolicy);
    }

    private NotificationDecisionEnvelope CreateEnvelope(
        Guid recipientId,
        Guid? actorId,
        Guid? groupId = null,
        UserNotificationPreference? preference = null,
        bool externalContentSafe = true,
        NotificationDecisionChannelPolicy? emailPolicy = null,
        NotificationDecisionChannelPolicy? mobilePushPolicy = null)
    {
        return resolver.Resolve(new NotificationDecisionEnvelopeRequest(
            InAppNotificationEventTypes.BillSubmitted,
            InAppNotificationSubjectTypes.ExpenseBill,
            recipientId,
            actorId,
            groupId,
            new NotificationDecisionTimingContext(EvaluationTime, RecipientLocalHour: 12),
            preference,
            ExternalContentSafe: externalContentSafe,
            EmailPolicy: emailPolicy,
            MobilePushPolicy: mobilePushPolicy));
    }

    private static UserNotificationPreference CreatePreference(Action<UserNotificationPreference>? configure = null)
    {
        var preference = new UserNotificationPreference
        {
            UserProfileId = Guid.NewGuid(),
            InAppEnabled = true,
            BillsEnabled = true,
            SettlementsEnabled = true,
            RecurringEnabled = true,
            SyncSecurityEnabled = true,
            QuietHoursEnabled = false,
            QuietHoursStartHour = 22,
            QuietHoursEndHour = 7,
            DeliveryTiming = NotificationPreferenceDeliveryTimings.Immediate,
            CreatedAtUtc = EvaluationTime,
            UpdatedAtUtc = EvaluationTime
        };
        configure?.Invoke(preference);

        return preference;
    }

    private static SettleoraDbContext CreateDbContext()
    {
        return new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
    }

    private static async Task<Guid> SeedUserProfileAsync(SettleoraDbContext dbContext, string displayName)
    {
        var userProfileId = Guid.NewGuid();
        dbContext.Set<UserProfile>().Add(new UserProfile
        {
            Id = userProfileId,
            DisplayName = displayName,
            DefaultCurrency = "USD",
            CreatedAtUtc = EvaluationTime,
            UpdatedAtUtc = EvaluationTime
        });
        await dbContext.SaveChangesAsync();

        return userProfileId;
    }

    private static async Task<Guid> SeedGroupAsync(SettleoraDbContext dbContext, Guid createdByUserProfileId)
    {
        var groupId = Guid.NewGuid();
        dbContext.Set<UserGroup>().Add(new UserGroup
        {
            Id = groupId,
            Name = "Shared Dinner",
            CreatedByUserProfileId = createdByUserProfileId,
            CreatedAtUtc = EvaluationTime,
            UpdatedAtUtc = EvaluationTime
        });
        await dbContext.SaveChangesAsync();

        return groupId;
    }
}
