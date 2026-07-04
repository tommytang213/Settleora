using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Notifications;

internal sealed class AdminNotificationPolicyReadoutService : IAdminNotificationPolicyReadoutService
{
    private const string DefaultSource = "default";
    private const string PersistedSource = "persisted";
    private const string DefaultPolicyVersion = "default-v1";

    private readonly SettleoraDbContext dbContext;

    public AdminNotificationPolicyReadoutService(SettleoraDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public async Task<AdminNotificationPolicyReadoutResponse> GetReadoutAsync(CancellationToken cancellationToken)
    {
        var policy = await dbContext.Set<NotificationGlobalPolicy>()
            .AsNoTracking()
            .Include(candidate => candidate.EventOverrides)
            .Where(candidate => candidate.Status == NotificationPolicyStatuses.Active)
            .OrderByDescending(candidate => candidate.EffectiveAtUtc ?? candidate.UpdatedAtUtc)
            .ThenByDescending(candidate => candidate.UpdatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        return policy is null
            ? DefaultReadout()
            : FromPolicy(policy);
    }

    private static AdminNotificationPolicyReadoutResponse DefaultReadout()
    {
        return new AdminNotificationPolicyReadoutResponse(
            DefaultPolicyVersion,
            DefaultSource,
            EffectiveAtUtc: null,
            UpdatedAtUtc: null,
            PersistedSchemaReady: true,
            ServerAuthoritative: true,
            Channels:
            [
                new AdminNotificationPolicyChannelReadout(
                    NotificationPolicyChannels.InApp,
                    NotificationPolicyChannelCaps.Enabled,
                    NotificationPolicyReadinessStates.Configured,
                    NotificationPolicyReadoutCategories.Available,
                    ExternalProviderAttemptAllowed: false),
                new AdminNotificationPolicyChannelReadout(
                    NotificationPolicyChannels.Email,
                    NotificationPolicyChannelCaps.Disabled,
                    NotificationPolicyReadinessStates.Unconfigured,
                    NotificationPolicyReadoutCategories.DisabledByAdmin,
                    ExternalProviderAttemptAllowed: false),
                new AdminNotificationPolicyChannelReadout(
                    NotificationPolicyChannels.MobilePush,
                    NotificationPolicyChannelCaps.Disabled,
                    NotificationPolicyReadinessStates.Unconfigured,
                    NotificationPolicyReadoutCategories.DisabledByAdmin,
                    ExternalProviderAttemptAllowed: false)
            ],
            EventFamilies: NotificationPolicyEventFamilies.DefaultReadoutFamilies
                .Select(family => DefaultFamily(family))
                .ToArray(),
            RequiredRules: new AdminNotificationPolicyRequiredRulesReadout(
                RequiredInAppEnabled: true,
                OrdinaryMuteMaySuppressRequired: false,
                QuietHoursMayDeferRequired: false,
                NotificationPolicyContentClasses.GenericExternalOnly,
                NotificationPolicyTimingModes.Disabled,
                NotificationPolicyTimingModes.Disabled));
    }

    private static AdminNotificationPolicyReadoutResponse FromPolicy(NotificationGlobalPolicy policy)
    {
        var inAppCap = NotificationPolicyReadoutRedactor.SafeChannelCap(policy.InAppChannelCap);
        var emailCap = NotificationPolicyReadoutRedactor.SafeChannelCap(policy.EmailChannelCap);
        var pushCap = NotificationPolicyReadoutRedactor.SafeChannelCap(policy.MobilePushChannelCap);
        var emailReadiness = NotificationPolicyReadoutRedactor.SafeReadiness(policy.EmailProviderReadiness);
        var pushReadiness = NotificationPolicyReadoutRedactor.SafeReadiness(policy.MobilePushProviderReadiness);

        return new AdminNotificationPolicyReadoutResponse(
            string.IsNullOrWhiteSpace(policy.PolicyVersion) ? DefaultPolicyVersion : policy.PolicyVersion,
            PersistedSource,
            policy.EffectiveAtUtc,
            policy.UpdatedAtUtc,
            PersistedSchemaReady: true,
            ServerAuthoritative: true,
            Channels:
            [
                new AdminNotificationPolicyChannelReadout(
                    NotificationPolicyChannels.InApp,
                    inAppCap,
                    NotificationPolicyReadinessStates.Configured,
                    inAppCap == NotificationPolicyChannelCaps.Enabled
                        ? NotificationPolicyReadoutCategories.Available
                        : NotificationPolicyReadoutCategories.DisabledByAdmin,
                    ExternalProviderAttemptAllowed: false),
                new AdminNotificationPolicyChannelReadout(
                    NotificationPolicyChannels.Email,
                    emailCap,
                    emailReadiness,
                    NotificationPolicyReadoutRedactor.ReadoutCategoryForExternal(emailCap, emailReadiness),
                    ExternalProviderAttemptAllowed: false),
                new AdminNotificationPolicyChannelReadout(
                    NotificationPolicyChannels.MobilePush,
                    pushCap,
                    pushReadiness,
                    NotificationPolicyReadoutRedactor.ReadoutCategoryForExternal(pushCap, pushReadiness),
                    ExternalProviderAttemptAllowed: false)
            ],
            EventFamilies: BuildEventFamilies(policy, inAppCap, emailCap, pushCap),
            RequiredRules: new AdminNotificationPolicyRequiredRulesReadout(
                policy.RequiredInAppEnabled,
                policy.OrdinaryMuteMaySuppressRequired,
                policy.QuietHoursMayDeferRequired,
                NotificationPolicyReadoutRedactor.SafeContentClass(policy.ExternalSensitiveContentClass),
                NotificationPolicyReadoutRedactor.SafeTimingMode(policy.QuietHoursDefaultMode),
                NotificationPolicyReadoutRedactor.SafeTimingMode(policy.DigestDefaultMode)));
    }

    private static AdminNotificationPolicyEventFamilyReadout[] BuildEventFamilies(
        NotificationGlobalPolicy policy,
        string defaultInAppCap,
        string defaultEmailCap,
        string defaultPushCap)
    {
        var overrides = policy.EventOverrides
            .GroupBy(candidate => candidate.EventFamily, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);

        return NotificationPolicyEventFamilies.DefaultReadoutFamilies
            .Select(family => overrides.TryGetValue(family, out var policyOverride)
                ? FromOverride(policyOverride)
                : DefaultFamily(family, defaultInAppCap, defaultEmailCap, defaultPushCap))
            .ToArray();
    }

    private static AdminNotificationPolicyEventFamilyReadout DefaultFamily(
        string family,
        string inAppCap = NotificationPolicyChannelCaps.Enabled,
        string emailCap = NotificationPolicyChannelCaps.Disabled,
        string pushCap = NotificationPolicyChannelCaps.Disabled)
    {
        return new AdminNotificationPolicyEventFamilyReadout(
            family,
            inAppCap,
            emailCap,
            pushCap,
            NotificationPolicyContentClasses.GenericExternalOnly,
            RequiredInApp: true,
            DigestEligible: false,
            QuietHoursEligible: false);
    }

    private static AdminNotificationPolicyEventFamilyReadout FromOverride(NotificationEventPolicyOverride policyOverride)
    {
        return new AdminNotificationPolicyEventFamilyReadout(
            NotificationPolicyReadoutRedactor.SafeEventFamily(policyOverride.EventFamily),
            NotificationPolicyReadoutRedactor.SafeChannelCap(policyOverride.InAppChannelCap),
            NotificationPolicyReadoutRedactor.SafeChannelCap(policyOverride.EmailChannelCap),
            NotificationPolicyReadoutRedactor.SafeChannelCap(policyOverride.MobilePushChannelCap),
            NotificationPolicyReadoutRedactor.SafeContentClass(policyOverride.ExternalContentClass),
            policyOverride.RequiredInApp,
            policyOverride.DigestEligible,
            policyOverride.QuietHoursEligible);
    }
}
