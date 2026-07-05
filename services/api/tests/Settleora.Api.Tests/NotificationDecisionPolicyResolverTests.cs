using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class NotificationDecisionPolicyResolverTests
{
    private static readonly DateTimeOffset EvaluationTime = new(2026, 7, 5, 1, 30, 0, TimeSpan.Zero);

    [Fact]
    public async Task DefaultPolicyPreservesInAppBaselineAndKeepsExternalDisabled()
    {
        await using var dbContext = CreateDbContext();
        var service = CreateService(
            dbContext,
            new NotificationProviderReadinessSnapshot(
                NotificationPolicyReadinessStates.Configured,
                NotificationPolicyReadinessStates.Configured));

        var envelope = await service.ResolveAsync(CreateRequest(
            emailPolicy: new NotificationDecisionChannelPolicy(ProviderConfigured: true)), CancellationToken.None);

        Assert.Equal(NotificationChannelDecisionStates.Eligible, envelope.InApp.State);
        Assert.True(envelope.InApp.MayWriteInApp);
        Assert.Equal(NotificationChannelDecisionStates.Disabled, envelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.DisabledByPolicy, envelope.Email.Reason);
        Assert.Equal(NotificationChannelDecisionStates.Disabled, envelope.MobilePush.State);
        Assert.False(envelope.Email.MayAttemptExternalProvider);
        Assert.False(envelope.MobilePush.MayAttemptExternalProvider);
    }

    [Fact]
    public async Task EventFamilyUnsupportedCapShortCircuitsBeforeProviderReadiness()
    {
        await using var dbContext = CreateDbContext();
        await SeedPolicyAsync(
            dbContext,
            emailCap: NotificationPolicyChannelCaps.GenericExternalOnly,
            mobilePushCap: NotificationPolicyChannelCaps.GenericExternalOnly,
            recurringEmailCap: NotificationPolicyChannelCaps.Unsupported,
            recurringPushCap: NotificationPolicyChannelCaps.Unsupported);
        var service = CreateService(
            dbContext,
            new NotificationProviderReadinessSnapshot(
                NotificationPolicyReadinessStates.Configured,
                NotificationPolicyReadinessStates.Configured));

        var envelope = await service.ResolveAsync(CreateRequest(
            eventType: InAppNotificationEventTypes.RecurringBillDueSoon,
            subjectType: InAppNotificationSubjectTypes.RecurringBillOccurrence,
            mobilePushPolicy: new NotificationDecisionChannelPolicy(RecipientDeviceAvailable: true)), CancellationToken.None);

        Assert.Equal(NotificationChannelDecisionStates.Eligible, envelope.InApp.State);
        Assert.Equal(NotificationChannelDecisionStates.Unsupported, envelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.ChannelUnsupportedForEvent, envelope.Email.Reason);
        Assert.Equal(NotificationChannelDecisionStates.Unsupported, envelope.MobilePush.State);
        Assert.Equal(NotificationChannelDecisionReasons.ChannelUnsupportedForEvent, envelope.MobilePush.Reason);
    }

    [Fact]
    public async Task UnconfiguredProviderMapsToUnconfiguredAfterAdminPolicyAllowsChannel()
    {
        await using var dbContext = CreateDbContext();
        await SeedPolicyAsync(dbContext, emailCap: NotificationPolicyChannelCaps.GenericExternalOnly);
        var service = CreateService(
            dbContext,
            new NotificationProviderReadinessSnapshot(
                NotificationPolicyReadinessStates.Unconfigured,
                NotificationPolicyReadinessStates.Disabled));

        var envelope = await service.ResolveAsync(CreateRequest(
            emailPolicy: new NotificationDecisionChannelPolicy(ProviderConfigured: true)), CancellationToken.None);

        Assert.Equal(NotificationChannelDecisionStates.Unconfigured, envelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.ProviderUnconfigured, envelope.Email.Reason);
        Assert.False(envelope.Email.MayAttemptExternalProvider);
    }

    [Fact]
    public async Task AdminDisabledChannelWinsEvenWhenProviderReadinessIsConfigured()
    {
        await using var dbContext = CreateDbContext();
        await SeedPolicyAsync(
            dbContext,
            emailCap: NotificationPolicyChannelCaps.Disabled,
            mobilePushCap: NotificationPolicyChannelCaps.Disabled);
        var service = CreateService(
            dbContext,
            new NotificationProviderReadinessSnapshot(
                NotificationPolicyReadinessStates.Configured,
                NotificationPolicyReadinessStates.Configured));

        var envelope = await service.ResolveAsync(CreateRequest(
            mobilePushPolicy: new NotificationDecisionChannelPolicy(RecipientDeviceAvailable: true)), CancellationToken.None);

        Assert.Equal(NotificationChannelDecisionStates.Disabled, envelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.DisabledByPolicy, envelope.Email.Reason);
        Assert.Equal(NotificationChannelDecisionStates.Disabled, envelope.MobilePush.State);
        Assert.Equal(NotificationChannelDecisionReasons.DisabledByPolicy, envelope.MobilePush.Reason);
    }

    [Fact]
    public async Task UserPreferenceCanOnlyNarrowAllowedConfiguredExternalChannels()
    {
        await using var dbContext = CreateDbContext();
        await SeedPolicyAsync(
            dbContext,
            emailCap: NotificationPolicyChannelCaps.GenericExternalOnly,
            mobilePushCap: NotificationPolicyChannelCaps.GenericExternalOnly);
        var service = CreateService(
            dbContext,
            new NotificationProviderReadinessSnapshot(
                NotificationPolicyReadinessStates.Configured,
                NotificationPolicyReadinessStates.Configured));

        var envelope = await service.ResolveAsync(CreateRequest(
            preference: CreatePreference(preference => preference.BillsEnabled = false),
            mobilePushPolicy: new NotificationDecisionChannelPolicy(RecipientDeviceAvailable: true)), CancellationToken.None);

        Assert.Equal(NotificationChannelDecisionStates.Eligible, envelope.InApp.State);
        Assert.Equal(NotificationChannelDecisionStates.Disabled, envelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.DisabledByUserPreference, envelope.Email.Reason);
        Assert.Equal(NotificationChannelDecisionStates.Disabled, envelope.MobilePush.State);
        Assert.Equal(NotificationChannelDecisionReasons.DisabledByUserPreference, envelope.MobilePush.Reason);
    }

    [Fact]
    public async Task QuietHoursAndDigestDeferConfiguredAllowedExternalChannelsWithoutProviderAttempt()
    {
        await using var dbContext = CreateDbContext();
        await SeedPolicyAsync(dbContext, emailCap: NotificationPolicyChannelCaps.GenericExternalOnly);
        var service = CreateService(
            dbContext,
            new NotificationProviderReadinessSnapshot(
                NotificationPolicyReadinessStates.Configured,
                NotificationPolicyReadinessStates.Unconfigured));

        var quietEnvelope = await service.ResolveAsync(CreateRequest(
            preference: CreatePreference(preference =>
            {
                preference.QuietHoursEnabled = true;
                preference.QuietHoursStartHour = 22;
                preference.QuietHoursEndHour = 7;
            }),
            timing: new NotificationDecisionTimingContext(EvaluationTime, RecipientLocalHour: 23)), CancellationToken.None);
        var digestEnvelope = await service.ResolveAsync(CreateRequest(
            preference: CreatePreference(preference =>
                preference.DeliveryTiming = NotificationPreferenceDeliveryTimings.DigestReadout)), CancellationToken.None);

        Assert.Equal(NotificationChannelDecisionStates.Deferred, quietEnvelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.QuietHoursDeferred, quietEnvelope.Email.Reason);
        Assert.Equal(NotificationChannelDecisionStates.Deferred, digestEnvelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.DigestReadoutDeferred, digestEnvelope.Email.Reason);
        Assert.False(quietEnvelope.Email.MayAttemptExternalProvider);
        Assert.False(digestEnvelope.Email.MayAttemptExternalProvider);
    }

    [Fact]
    public async Task ConfiguredProviderCandidateStaysFutureProviderOnly()
    {
        await using var dbContext = CreateDbContext();
        await SeedPolicyAsync(
            dbContext,
            emailCap: NotificationPolicyChannelCaps.GenericExternalOnly,
            mobilePushCap: NotificationPolicyChannelCaps.GenericExternalOnly);
        var service = CreateService(
            dbContext,
            new NotificationProviderReadinessSnapshot(
                NotificationPolicyReadinessStates.Configured,
                NotificationPolicyReadinessStates.Configured));

        var envelope = await service.ResolveAsync(CreateRequest(
            mobilePushPolicy: new NotificationDecisionChannelPolicy(RecipientDeviceAvailable: true)), CancellationToken.None);

        Assert.Equal(NotificationChannelDecisionStates.EligibleForFutureProvider, envelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.FutureProviderEligible, envelope.Email.Reason);
        Assert.Equal(NotificationChannelDecisionStates.EligibleForFutureProvider, envelope.MobilePush.State);
        Assert.False(envelope.Email.MayAttemptExternalProvider);
        Assert.False(envelope.MobilePush.MayAttemptExternalProvider);
        Assert.DoesNotContain(envelope.Channels, decision =>
            decision.State is "queued" or "sent" or "failed" or "failed_transient" or "failed_permanent");
        Assert.True(NotificationDeliveryAttemptStatuses.IsSupported(NotificationDeliveryAttemptStatuses.Queued));
        Assert.True(NotificationDeliveryAttemptStatuses.IsProviderRuntimeStatus("sent"));
        Assert.True(NotificationDeliveryAttemptStatuses.IsProviderRuntimeStatus("failed_transient"));
    }

    [Fact]
    public async Task RequiredSecurityImpactfulInAppBaselineIsPreservedWithoutExternalBypass()
    {
        await using var dbContext = CreateDbContext();
        await SeedPolicyAsync(dbContext, emailCap: NotificationPolicyChannelCaps.GenericExternalOnly);
        var service = CreateService(
            dbContext,
            new NotificationProviderReadinessSnapshot(
                NotificationPolicyReadinessStates.Configured,
                NotificationPolicyReadinessStates.Unconfigured));

        var envelope = await service.ResolveAsync(CreateRequest(
            eventType: InAppNotificationEventTypes.SyncConflictDetected,
            subjectType: InAppNotificationSubjectTypes.SyncOperation,
            requiredOrSecurityImpactful: true), CancellationToken.None);

        Assert.Equal(NotificationChannelDecisionStates.Eligible, envelope.InApp.State);
        Assert.True(envelope.InApp.MayWriteInApp);
        Assert.Equal(NotificationChannelDecisionStates.EligibleForFutureProvider, envelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.RequiredBypassPolicyNotConfigured, envelope.Email.Reason);
        Assert.False(envelope.Email.MayAttemptExternalProvider);
    }

    private static NotificationDecisionPolicyResolver CreateService(
        SettleoraDbContext dbContext,
        NotificationProviderReadinessSnapshot providerReadiness)
    {
        return new NotificationDecisionPolicyResolver(
            dbContext,
            new FakeNotificationProviderReadinessService(providerReadiness),
            new NotificationDecisionEnvelopeResolver());
    }

    private static SettleoraDbContext CreateDbContext()
    {
        return new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
    }

    private static async Task SeedPolicyAsync(
        SettleoraDbContext dbContext,
        string emailCap,
        string mobilePushCap = NotificationPolicyChannelCaps.Disabled,
        string recurringEmailCap = NotificationPolicyChannelCaps.GenericExternalOnly,
        string recurringPushCap = NotificationPolicyChannelCaps.Disabled)
    {
        var policyId = Guid.NewGuid();
        dbContext.Set<NotificationGlobalPolicy>().Add(new NotificationGlobalPolicy
        {
            Id = policyId,
            PolicyVersion = "policy-v687",
            Status = NotificationPolicyStatuses.Active,
            InAppChannelCap = NotificationPolicyChannelCaps.Enabled,
            EmailChannelCap = emailCap,
            MobilePushChannelCap = mobilePushCap,
            EmailProviderReadiness = NotificationPolicyReadinessStates.Unconfigured,
            MobilePushProviderReadiness = NotificationPolicyReadinessStates.Unconfigured,
            RequiredInAppEnabled = true,
            OrdinaryMuteMaySuppressRequired = false,
            QuietHoursMayDeferRequired = false,
            ExternalSensitiveContentClass = NotificationPolicyContentClasses.GenericExternalOnly,
            QuietHoursDefaultMode = NotificationPolicyTimingModes.Disabled,
            DigestDefaultMode = NotificationPolicyTimingModes.Disabled,
            EffectiveAtUtc = EvaluationTime,
            CreatedAtUtc = EvaluationTime,
            UpdatedAtUtc = EvaluationTime
        });
        dbContext.Set<NotificationEventPolicyOverride>().Add(new NotificationEventPolicyOverride
        {
            Id = Guid.NewGuid(),
            NotificationGlobalPolicyId = policyId,
            EventFamily = NotificationPolicyEventFamilies.Recurring,
            InAppChannelCap = NotificationPolicyChannelCaps.Enabled,
            EmailChannelCap = recurringEmailCap,
            MobilePushChannelCap = recurringPushCap,
            ExternalContentClass = NotificationPolicyContentClasses.SafeSummaryAllowed,
            RequiredInApp = true,
            DigestEligible = true,
            QuietHoursEligible = true,
            CreatedAtUtc = EvaluationTime,
            UpdatedAtUtc = EvaluationTime
        });

        await dbContext.SaveChangesAsync();
    }

    private static NotificationDecisionEnvelopeRequest CreateRequest(
        string eventType = InAppNotificationEventTypes.BillSubmitted,
        string subjectType = InAppNotificationSubjectTypes.ExpenseBill,
        UserNotificationPreference? preference = null,
        NotificationDecisionTimingContext? timing = null,
        bool requiredOrSecurityImpactful = false,
        NotificationDecisionChannelPolicy? emailPolicy = null,
        NotificationDecisionChannelPolicy? mobilePushPolicy = null)
    {
        return new NotificationDecisionEnvelopeRequest(
            eventType,
            subjectType,
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            timing ?? new NotificationDecisionTimingContext(EvaluationTime, RecipientLocalHour: 12),
            preference,
            RequiredOrSecurityImpactful: requiredOrSecurityImpactful,
            EmailPolicy: emailPolicy,
            MobilePushPolicy: mobilePushPolicy);
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
}
