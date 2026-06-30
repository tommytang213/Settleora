using Settleora.Api.Domain.Notifications;
using Settleora.Api.Notifications;

namespace Settleora.Api.Tests;

public sealed class NotificationDecisionEnvelopeResolverTests
{
    private static readonly DateTimeOffset EvaluationTime = new(2026, 6, 30, 15, 6, 0, TimeSpan.Zero);

    private readonly NotificationDecisionEnvelopeResolver resolver = new();

    [Fact]
    public void ResolveKeepsInAppEligibleForSupportedAuthorizedEvent()
    {
        var request = CreateRequest(
            InAppNotificationEventTypes.OcrNeedsReview,
            InAppNotificationSubjectTypes.ReceiptOcrReview);

        var envelope = resolver.Resolve(request);

        Assert.Equal(NotificationChannelDecisionStates.Eligible, envelope.InApp.State);
        Assert.Equal(NotificationChannelDecisionReasons.InAppBaselineEligible, envelope.InApp.Reason);
        Assert.True(envelope.InApp.MayWriteInApp);
        Assert.False(envelope.InApp.MayAttemptExternalProvider);
        Assert.Equal(NotificationChannelDecisionStates.Unconfigured, envelope.Email.State);
        Assert.Equal(NotificationChannelDecisionStates.Unconfigured, envelope.MobilePush.State);
    }

    [Fact]
    public void ResolveRepresentsExternalUnsupportedUnconfiguredAndDisabledWithoutProviderSuccess()
    {
        var unconfigured = resolver.Resolve(CreateRequest()).Email;
        var unsupported = resolver.Resolve(CreateRequest(
            emailPolicy: new NotificationDecisionChannelPolicy(SupportedForEvent: false))).Email;
        var disabled = resolver.Resolve(CreateRequest(
            emailPolicy: new NotificationDecisionChannelPolicy(AllowedByPolicy: false))).Email;
        var pushWithoutDevice = resolver.Resolve(CreateRequest(
            mobilePushPolicy: new NotificationDecisionChannelPolicy(
                ProviderConfigured: true,
                RecipientDeviceAvailable: false))).MobilePush;

        Assert.Equal(NotificationChannelDecisionStates.Unconfigured, unconfigured.State);
        Assert.Equal(NotificationChannelDecisionReasons.ProviderUnconfigured, unconfigured.Reason);
        Assert.Equal(NotificationChannelDecisionStates.Unsupported, unsupported.State);
        Assert.Equal(NotificationChannelDecisionStates.Disabled, disabled.State);
        Assert.Equal(NotificationChannelDecisionStates.Unconfigured, pushWithoutDevice.State);
        Assert.Equal(NotificationChannelDecisionReasons.DeviceAvailabilityUnconfigured, pushWithoutDevice.Reason);
        Assert.All(
            [unconfigured, unsupported, disabled, pushWithoutDevice],
            decision =>
            {
                Assert.False(NotificationChannelDecisionStates.IsTerminalProviderSuccess(decision.State));
                Assert.False(decision.MayAttemptExternalProvider);
            });
    }

    [Fact]
    public void ResolveLetsUserPreferenceDisableOptionalExternalChannelsWithoutDisablingInAppBaseline()
    {
        var preference = CreatePreference(preference => preference.BillsEnabled = false);

        var envelope = resolver.Resolve(CreateRequest(
            eventType: InAppNotificationEventTypes.BillSubmitted,
            subjectType: InAppNotificationSubjectTypes.ExpenseBill,
            preference: preference,
            emailPolicy: new NotificationDecisionChannelPolicy(ProviderConfigured: true),
            mobilePushPolicy: new NotificationDecisionChannelPolicy(
                ProviderConfigured: true,
                RecipientDeviceAvailable: true)));

        Assert.Equal(NotificationChannelDecisionStates.Eligible, envelope.InApp.State);
        Assert.True(envelope.InApp.MayWriteInApp);
        Assert.Equal(NotificationChannelDecisionStates.Disabled, envelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.DisabledByUserPreference, envelope.Email.Reason);
        Assert.Equal(NotificationChannelDecisionStates.Disabled, envelope.MobilePush.State);
        Assert.Equal(NotificationChannelDecisionReasons.DisabledByUserPreference, envelope.MobilePush.Reason);
    }

    [Fact]
    public void ResolveDefersQuietHoursAndDigestWithoutMutatingInboxOrSourceState()
    {
        var preference = CreatePreference(preference =>
        {
            preference.QuietHoursEnabled = true;
            preference.QuietHoursStartHour = 22;
            preference.QuietHoursEndHour = 7;
            preference.DeliveryTiming = NotificationPreferenceDeliveryTimings.Immediate;
        });
        var notification = new InAppNotification
        {
            Id = Guid.NewGuid(),
            RecipientUserProfileId = Guid.NewGuid(),
            EventType = InAppNotificationEventTypes.SettlementRequestCreated,
            Status = InAppNotificationStatuses.Unread,
            Priority = InAppNotificationPriorities.Attention,
            SubjectType = InAppNotificationSubjectTypes.SettlementRequest,
            TitleKey = "notifications.settlement.request_created.title",
            MessageKey = "notifications.settlement.request_created.message",
            CreatedAtUtc = EvaluationTime
        };

        var quietEnvelope = resolver.Resolve(CreateRequest(
            eventType: InAppNotificationEventTypes.SettlementRequestCreated,
            subjectType: InAppNotificationSubjectTypes.SettlementRequest,
            preference: preference,
            timing: new NotificationDecisionTimingContext(EvaluationTime, RecipientLocalHour: 23),
            emailPolicy: new NotificationDecisionChannelPolicy(ProviderConfigured: true)));
        var digestEnvelope = resolver.Resolve(CreateRequest(
            eventType: InAppNotificationEventTypes.SettlementRequestCreated,
            subjectType: InAppNotificationSubjectTypes.SettlementRequest,
            preference: CreatePreference(preference =>
                preference.DeliveryTiming = NotificationPreferenceDeliveryTimings.DigestReadout),
            timing: new NotificationDecisionTimingContext(EvaluationTime, RecipientLocalHour: 12),
            emailPolicy: new NotificationDecisionChannelPolicy(ProviderConfigured: true)));

        Assert.Equal(NotificationChannelDecisionStates.Deferred, quietEnvelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.QuietHoursDeferred, quietEnvelope.Email.Reason);
        Assert.Equal(NotificationChannelDecisionStates.Deferred, digestEnvelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.DigestReadoutDeferred, digestEnvelope.Email.Reason);
        Assert.Equal(InAppNotificationStatuses.Unread, notification.Status);
        Assert.Null(notification.ReadAtUtc);
        Assert.Null(notification.ArchivedAtUtc);
        Assert.Equal(NotificationPreferenceDeliveryTimings.Immediate, preference.DeliveryTiming);
    }

    [Fact]
    public void ResolveDoesNotInventRequiredSecurityBypassPolicy()
    {
        var envelope = resolver.Resolve(CreateRequest(
            eventType: InAppNotificationEventTypes.SyncConflictDetected,
            subjectType: InAppNotificationSubjectTypes.SyncOperation,
            preference: CreatePreference(),
            requiredOrSecurityImpactful: true,
            emailPolicy: new NotificationDecisionChannelPolicy(ProviderConfigured: true),
            mobilePushPolicy: new NotificationDecisionChannelPolicy(
                ProviderConfigured: true,
                RecipientDeviceAvailable: true)));

        Assert.Equal(NotificationChannelDecisionStates.Eligible, envelope.InApp.State);
        Assert.Equal(NotificationChannelDecisionStates.EligibleForFutureProvider, envelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.RequiredBypassPolicyNotConfigured, envelope.Email.Reason);
        Assert.False(envelope.Email.MayAttemptExternalProvider);
        Assert.Equal(NotificationChannelDecisionReasons.RequiredBypassPolicyNotConfigured, envelope.MobilePush.Reason);
        Assert.False(envelope.MobilePush.MayAttemptExternalProvider);
    }

    [Fact]
    public void ResolveSkipsUnsafeExternalContentWithBoundedRedactedVocabulary()
    {
        var envelope = resolver.Resolve(CreateRequest(
            externalContentSafe: false,
            emailPolicy: new NotificationDecisionChannelPolicy(ProviderConfigured: true),
            mobilePushPolicy: new NotificationDecisionChannelPolicy(
                ProviderConfigured: true,
                RecipientDeviceAvailable: true)));

        Assert.Equal(NotificationChannelDecisionStates.Eligible, envelope.InApp.State);
        Assert.Equal(NotificationChannelDecisionStates.Skipped, envelope.Email.State);
        Assert.Equal(NotificationChannelDecisionReasons.UnsafeExternalContent, envelope.Email.Reason);
        Assert.Equal(NotificationChannelDecisionStates.Skipped, envelope.MobilePush.State);
        Assert.Equal(NotificationChannelDecisionReasons.UnsafeExternalContent, envelope.MobilePush.Reason);

        var strings = envelope.Channels
            .SelectMany(decision => new[] { decision.Channel, decision.State, decision.Reason })
            .Append(envelope.EventType)
            .Append(envelope.SubjectType)
            .ToArray();
        Assert.DoesNotContain(strings, value => value.Contains("token", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(strings, value => value.Contains("password", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(strings, value => value.Contains("smtp", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(strings, value => value.Contains("object_key", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(strings, value => value.Contains("ocr_text", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(strings, value => value.Contains("payment_handle", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ResolverDoesNotRequireProviderWriterOrDeviceTokenDependencies()
    {
        var constructors = typeof(NotificationDecisionEnvelopeResolver).GetConstructors();
        var constructor = Assert.Single(constructors);
        Assert.Empty(constructor.GetParameters());

        var envelope = resolver.Resolve(CreateRequest(
            emailPolicy: new NotificationDecisionChannelPolicy(ProviderConfigured: true),
            mobilePushPolicy: new NotificationDecisionChannelPolicy(
                ProviderConfigured: true,
                RecipientDeviceAvailable: true)));

        Assert.All(
            envelope.Channels,
            decision =>
            {
                Assert.False(NotificationChannelDecisionStates.IsTerminalProviderSuccess(decision.State));
                Assert.False(decision.MayAttemptExternalProvider);
            });
    }

    private static NotificationDecisionEnvelopeRequest CreateRequest(
        string eventType = InAppNotificationEventTypes.BillSubmitted,
        string subjectType = InAppNotificationSubjectTypes.ExpenseBill,
        UserNotificationPreference? preference = null,
        NotificationDecisionTimingContext? timing = null,
        bool externalContentSafe = true,
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
            ExternalContentSafe: externalContentSafe,
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
}
