using Settleora.Api.Domain.Notifications;

namespace Settleora.Api.Notifications;

internal static class NotificationChannels
{
    public const string InApp = "in_app";
    public const string Email = "email";
    public const string MobilePush = "mobile_push";
}

internal static class NotificationChannelDecisionStates
{
    public const string Eligible = "eligible";
    public const string BaselineCreated = "baseline_created";
    public const string EligibleForFutureProvider = "eligible_for_future_provider";
    public const string Unsupported = "unsupported";
    public const string Unconfigured = "unconfigured";
    public const string Disabled = "disabled";
    public const string Muted = "muted";
    public const string Deferred = "deferred";
    public const string Skipped = "skipped";

    public static bool IsTerminalProviderSuccess(string state)
    {
        return string.Equals(state, "sent", StringComparison.Ordinal)
            || string.Equals(state, "delivered", StringComparison.Ordinal)
            || string.Equals(state, "provider_success", StringComparison.Ordinal);
    }
}

internal static class NotificationChannelDecisionReasons
{
    public const string InAppBaselineEligible = "in_app_baseline_eligible";
    public const string InAppBaselineAlreadyCreated = "in_app_baseline_already_created";
    public const string EventTypeUnsupported = "event_type_unsupported";
    public const string SubjectTypeUnsupported = "subject_type_unsupported";
    public const string RecipientUnauthorized = "recipient_unauthorized";
    public const string UnsafeNotificationContent = "unsafe_notification_content";
    public const string UnsafeExternalContent = "unsafe_external_content";
    public const string ChannelUnsupportedForEvent = "channel_unsupported_for_event";
    public const string DisabledByPolicy = "disabled_by_policy";
    public const string DisabledByUserPreference = "disabled_by_user_preference";
    public const string ProviderUnconfigured = "provider_unconfigured";
    public const string DeviceAvailabilityUnconfigured = "device_availability_unconfigured";
    public const string GroupMuteNotConfigured = "group_mute_not_configured";
    public const string QuietHoursDeferred = "quiet_hours_deferred";
    public const string DigestReadoutDeferred = "digest_readout_deferred";
    public const string RequiredBypassPolicyNotConfigured = "required_bypass_policy_not_configured";
    public const string FutureProviderEligible = "future_provider_eligible";
}

internal sealed record NotificationDecisionTimingContext(
    DateTimeOffset EvaluationTimeUtc,
    int? RecipientLocalHour = null);

internal sealed record NotificationDecisionChannelPolicy(
    bool SupportedForEvent = true,
    bool AllowedByPolicy = true,
    bool ProviderConfigured = false,
    bool RecipientDeviceAvailable = false);

internal sealed record NotificationDecisionEnvelopeRequest(
    string EventType,
    string SubjectType,
    Guid RecipientUserProfileId,
    Guid? ActorUserProfileId,
    Guid? GroupId,
    NotificationDecisionTimingContext Timing,
    UserNotificationPreference? RecipientPreference = null,
    bool SourceRecipientAuthorized = true,
    bool NotificationContentSafe = true,
    bool ExternalContentSafe = true,
    bool InAppBaselineAlreadyCreated = false,
    bool RequiredOrSecurityImpactful = false,
    bool RequiredBypassPolicyReviewed = false,
    NotificationDecisionChannelPolicy? EmailPolicy = null,
    NotificationDecisionChannelPolicy? MobilePushPolicy = null);

internal sealed record NotificationDecisionChannel(
    string Channel,
    string State,
    string Reason,
    bool MayWriteInApp,
    bool MayAttemptExternalProvider);

internal sealed record NotificationDecisionEnvelope(
    string EventType,
    string SubjectType,
    Guid RecipientUserProfileId,
    Guid? ActorUserProfileId,
    Guid? GroupId,
    DateTimeOffset EvaluatedAtUtc,
    IReadOnlyList<NotificationDecisionChannel> Channels)
{
    public NotificationDecisionChannel InApp => GetChannel(NotificationChannels.InApp);

    public NotificationDecisionChannel Email => GetChannel(NotificationChannels.Email);

    public NotificationDecisionChannel MobilePush => GetChannel(NotificationChannels.MobilePush);

    private NotificationDecisionChannel GetChannel(string channel)
    {
        return Channels.Single(decision => string.Equals(decision.Channel, channel, StringComparison.Ordinal));
    }
}

