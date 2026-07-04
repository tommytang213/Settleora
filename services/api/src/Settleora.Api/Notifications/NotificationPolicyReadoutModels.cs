namespace Settleora.Api.Notifications;

internal sealed record AdminNotificationPolicyReadoutResponse(
    string PolicyVersion,
    string Source,
    DateTimeOffset? EffectiveAtUtc,
    DateTimeOffset? UpdatedAtUtc,
    bool PersistedSchemaReady,
    bool ServerAuthoritative,
    IReadOnlyList<AdminNotificationPolicyChannelReadout> Channels,
    IReadOnlyList<AdminNotificationPolicyEventFamilyReadout> EventFamilies,
    AdminNotificationPolicyRequiredRulesReadout RequiredRules);

internal sealed record AdminNotificationPolicyChannelReadout(
    string Channel,
    string ChannelCap,
    string Readiness,
    string ReadoutCategory,
    bool ExternalProviderAttemptAllowed);

internal sealed record AdminNotificationPolicyEventFamilyReadout(
    string EventFamily,
    string InAppChannelCap,
    string EmailChannelCap,
    string MobilePushChannelCap,
    string ExternalContentClass,
    bool RequiredInApp,
    bool DigestEligible,
    bool QuietHoursEligible);

internal sealed record AdminNotificationPolicyRequiredRulesReadout(
    bool RequiredInAppEnabled,
    bool OrdinaryMuteMaySuppressRequired,
    bool QuietHoursMayDeferRequired,
    string ExternalSensitiveContentClass,
    string QuietHoursDefaultMode,
    string DigestDefaultMode);
