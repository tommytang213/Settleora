using Settleora.Api.Domain.Notifications;

namespace Settleora.Api.Notifications;

internal sealed class NotificationDecisionEnvelopeResolver : INotificationDecisionEnvelopeResolver
{
    private static readonly NotificationDecisionChannelPolicy DefaultExternalPolicy = new();

    public NotificationDecisionEnvelope Resolve(NotificationDecisionEnvelopeRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var inApp = ResolveInApp(request);
        var email = ResolveExternal(
            request,
            NotificationChannels.Email,
            request.EmailPolicy ?? DefaultExternalPolicy,
            requiresDevice: false);
        var mobilePush = ResolveExternal(
            request,
            NotificationChannels.MobilePush,
            request.MobilePushPolicy ?? DefaultExternalPolicy,
            requiresDevice: true);

        return new NotificationDecisionEnvelope(
            request.EventType,
            request.SubjectType,
            request.RecipientUserProfileId,
            request.ActorUserProfileId,
            request.GroupId,
            request.Timing.EvaluationTimeUtc,
            [inApp, email, mobilePush]);
    }

    private static NotificationDecisionChannel ResolveInApp(NotificationDecisionEnvelopeRequest request)
    {
        var baseDecision = ResolveBaseEligibility(request);
        if (baseDecision is not null)
        {
            return baseDecision with
            {
                Channel = NotificationChannels.InApp
            };
        }

        var state = request.InAppBaselineAlreadyCreated
            ? NotificationChannelDecisionStates.BaselineCreated
            : NotificationChannelDecisionStates.Eligible;
        var reason = request.InAppBaselineAlreadyCreated
            ? NotificationChannelDecisionReasons.InAppBaselineAlreadyCreated
            : NotificationChannelDecisionReasons.InAppBaselineEligible;

        return new NotificationDecisionChannel(
            NotificationChannels.InApp,
            state,
            reason,
            MayWriteInApp: !request.InAppBaselineAlreadyCreated,
            MayAttemptExternalProvider: false);
    }

    private static NotificationDecisionChannel ResolveExternal(
        NotificationDecisionEnvelopeRequest request,
        string channel,
        NotificationDecisionChannelPolicy policy,
        bool requiresDevice)
    {
        var baseDecision = ResolveBaseEligibility(request);
        if (baseDecision is not null)
        {
            return baseDecision with
            {
                Channel = channel
            };
        }

        if (!request.ExternalContentSafe)
        {
            return ExternalDecision(
                channel,
                NotificationChannelDecisionStates.Skipped,
                NotificationChannelDecisionReasons.UnsafeExternalContent);
        }

        if (!policy.SupportedForEvent)
        {
            return ExternalDecision(
                channel,
                NotificationChannelDecisionStates.Unsupported,
                NotificationChannelDecisionReasons.ChannelUnsupportedForEvent);
        }

        if (!policy.AllowedByPolicy)
        {
            return ExternalDecision(
                channel,
                NotificationChannelDecisionStates.Disabled,
                NotificationChannelDecisionReasons.DisabledByPolicy);
        }

        if (IsDisabledByRecipientPreference(request))
        {
            return ExternalDecision(
                channel,
                NotificationChannelDecisionStates.Disabled,
                NotificationChannelDecisionReasons.DisabledByUserPreference);
        }

        var deferredReason = ResolveDeferredReason(request);
        if (deferredReason is not null)
        {
            return ExternalDecision(channel, NotificationChannelDecisionStates.Deferred, deferredReason);
        }

        if (!policy.ProviderConfigured)
        {
            return ExternalDecision(
                channel,
                NotificationChannelDecisionStates.Unconfigured,
                NotificationChannelDecisionReasons.ProviderUnconfigured);
        }

        if (requiresDevice && !policy.RecipientDeviceAvailable)
        {
            return ExternalDecision(
                channel,
                NotificationChannelDecisionStates.Unconfigured,
                NotificationChannelDecisionReasons.DeviceAvailabilityUnconfigured);
        }

        var reason = request.RequiredOrSecurityImpactful && !request.RequiredBypassPolicyReviewed
            ? NotificationChannelDecisionReasons.RequiredBypassPolicyNotConfigured
            : NotificationChannelDecisionReasons.FutureProviderEligible;

        return ExternalDecision(
            channel,
            NotificationChannelDecisionStates.EligibleForFutureProvider,
            reason,
            mayAttemptExternalProvider: false);
    }

    private static NotificationDecisionChannel? ResolveBaseEligibility(NotificationDecisionEnvelopeRequest request)
    {
        if (!request.SourceRecipientAuthorized || request.RecipientUserProfileId == Guid.Empty)
        {
            return Blocked(NotificationChannelDecisionStates.Skipped, NotificationChannelDecisionReasons.RecipientUnauthorized);
        }

        if (!InAppNotificationEventTypes.IsSupported(request.EventType))
        {
            return Blocked(NotificationChannelDecisionStates.Unsupported, NotificationChannelDecisionReasons.EventTypeUnsupported);
        }

        if (!InAppNotificationSubjectTypes.IsSupported(request.SubjectType))
        {
            return Blocked(NotificationChannelDecisionStates.Unsupported, NotificationChannelDecisionReasons.SubjectTypeUnsupported);
        }

        if (!request.NotificationContentSafe)
        {
            return Blocked(NotificationChannelDecisionStates.Skipped, NotificationChannelDecisionReasons.UnsafeNotificationContent);
        }

        return null;
    }

    private static NotificationDecisionChannel Blocked(string state, string reason)
    {
        return new NotificationDecisionChannel(
            string.Empty,
            state,
            reason,
            MayWriteInApp: false,
            MayAttemptExternalProvider: false);
    }

    private static NotificationDecisionChannel ExternalDecision(
        string channel,
        string state,
        string reason,
        bool mayAttemptExternalProvider = false)
    {
        return new NotificationDecisionChannel(
            channel,
            state,
            reason,
            MayWriteInApp: false,
            MayAttemptExternalProvider: mayAttemptExternalProvider);
    }

    private static bool IsDisabledByRecipientPreference(NotificationDecisionEnvelopeRequest request)
    {
        var preference = request.RecipientPreference;
        if (preference is null)
        {
            return false;
        }

        if (IsBillCategory(request.EventType))
        {
            return !preference.BillsEnabled;
        }

        if (IsSettlementCategory(request.EventType))
        {
            return !preference.SettlementsEnabled;
        }

        if (IsRecurringCategory(request.EventType))
        {
            return !preference.RecurringEnabled;
        }

        if (IsSyncOrSecurityCategory(request.EventType))
        {
            return !preference.SyncSecurityEnabled;
        }

        return false;
    }

    private static string? ResolveDeferredReason(NotificationDecisionEnvelopeRequest request)
    {
        var preference = request.RecipientPreference;
        if (preference is null)
        {
            return null;
        }

        if (string.Equals(preference.DeliveryTiming, NotificationPreferenceDeliveryTimings.DigestReadout, StringComparison.Ordinal))
        {
            return NotificationChannelDecisionReasons.DigestReadoutDeferred;
        }

        if (preference.QuietHoursEnabled
            && request.Timing.RecipientLocalHour is { } recipientLocalHour
            && IsQuietHour(recipientLocalHour, preference.QuietHoursStartHour, preference.QuietHoursEndHour))
        {
            return NotificationChannelDecisionReasons.QuietHoursDeferred;
        }

        return null;
    }

    private static bool IsQuietHour(int hour, int startHour, int endHour)
    {
        if (hour is < 0 or > 23)
        {
            return false;
        }

        return startHour == endHour
            || (startHour < endHour
                ? hour >= startHour && hour < endHour
                : hour >= startHour || hour < endHour);
    }

    private static bool IsBillCategory(string eventType)
    {
        return eventType.StartsWith("bill.", StringComparison.Ordinal)
            || eventType.StartsWith("ocr.", StringComparison.Ordinal);
    }

    private static bool IsSettlementCategory(string eventType)
    {
        return eventType.StartsWith("settlement.", StringComparison.Ordinal);
    }

    private static bool IsRecurringCategory(string eventType)
    {
        return eventType.StartsWith("recurring_bill.", StringComparison.Ordinal);
    }

    private static bool IsSyncOrSecurityCategory(string eventType)
    {
        return eventType.StartsWith("sync.", StringComparison.Ordinal)
            || eventType.StartsWith("security.", StringComparison.Ordinal)
            || eventType.StartsWith("auth.", StringComparison.Ordinal);
    }
}
