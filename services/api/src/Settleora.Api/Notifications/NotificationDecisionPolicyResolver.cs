using Microsoft.EntityFrameworkCore;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Persistence;

namespace Settleora.Api.Notifications;

internal sealed class NotificationDecisionPolicyResolver : INotificationDecisionPolicyResolver
{
    private readonly SettleoraDbContext dbContext;
    private readonly INotificationProviderReadinessService providerReadinessService;
    private readonly INotificationDecisionEnvelopeResolver envelopeResolver;

    public NotificationDecisionPolicyResolver(
        SettleoraDbContext dbContext,
        INotificationProviderReadinessService providerReadinessService,
        INotificationDecisionEnvelopeResolver envelopeResolver)
    {
        this.dbContext = dbContext;
        this.providerReadinessService = providerReadinessService;
        this.envelopeResolver = envelopeResolver;
    }

    public async Task<NotificationDecisionEnvelope> ResolveAsync(
        NotificationDecisionEnvelopeRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var policy = await dbContext.Set<NotificationGlobalPolicy>()
            .AsNoTracking()
            .Include(candidate => candidate.EventOverrides)
            .Where(candidate => candidate.Status == NotificationPolicyStatuses.Active)
            .OrderByDescending(candidate => candidate.EffectiveAtUtc ?? candidate.UpdatedAtUtc)
            .ThenByDescending(candidate => candidate.UpdatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        var providerReadiness = providerReadinessService.GetSnapshot();
        var policyRequest = ApplyPolicy(request, policy, providerReadiness);

        return envelopeResolver.Resolve(policyRequest);
    }

    private static NotificationDecisionEnvelopeRequest ApplyPolicy(
        NotificationDecisionEnvelopeRequest request,
        NotificationGlobalPolicy? policy,
        NotificationProviderReadinessSnapshot providerReadiness)
    {
        var eventFamily = EventFamilyFor(request.EventType);
        var familyOverride = policy?.EventOverrides.FirstOrDefault(candidate =>
            string.Equals(candidate.EventFamily, eventFamily, StringComparison.Ordinal));

        var emailCap = EffectiveExternalCap(
            familyOverride?.EmailChannelCap,
            policy?.EmailChannelCap,
            defaultCap: NotificationPolicyChannelCaps.Disabled);
        var pushCap = EffectiveExternalCap(
            familyOverride?.MobilePushChannelCap,
            policy?.MobilePushChannelCap,
            defaultCap: NotificationPolicyChannelCaps.Disabled);
        var externalContentClass = NotificationPolicyReadoutRedactor.SafeContentClass(
            familyOverride?.ExternalContentClass
                ?? policy?.ExternalSensitiveContentClass
                ?? NotificationPolicyContentClasses.GenericExternalOnly);

        return request with
        {
            ExternalContentSafe = request.ExternalContentSafe
                && !string.Equals(externalContentClass, NotificationPolicyContentClasses.InAppOnly, StringComparison.Ordinal),
            EmailPolicy = MergePolicy(
                request.EmailPolicy,
                emailCap,
                providerReadiness.Email,
                recipientDeviceAvailable: true),
            MobilePushPolicy = MergePolicy(
                request.MobilePushPolicy,
                pushCap,
                providerReadiness.MobilePush,
                request.MobilePushPolicy?.RecipientDeviceAvailable ?? false)
        };
    }

    private static NotificationDecisionChannelPolicy MergePolicy(
        NotificationDecisionChannelPolicy? requestPolicy,
        string channelCap,
        string providerReadiness,
        bool recipientDeviceAvailable)
    {
        var safeCap = NotificationPolicyReadoutRedactor.SafeChannelCap(channelCap);
        var safeReadiness = NotificationPolicyReadoutRedactor.SafeReadiness(providerReadiness);
        var basePolicy = requestPolicy ?? new NotificationDecisionChannelPolicy();

        return basePolicy with
        {
            SupportedForEvent = basePolicy.SupportedForEvent && IsSupportedByCap(safeCap, safeReadiness),
            AllowedByPolicy = basePolicy.AllowedByPolicy && IsAllowedByCap(safeCap, safeReadiness),
            ProviderConfigured = IsProviderConfigured(safeReadiness),
            RecipientDeviceAvailable = recipientDeviceAvailable
        };
    }

    private static string EffectiveExternalCap(string? familyCap, string? globalCap, string defaultCap)
    {
        var safeFamilyCap = familyCap is null ? null : NotificationPolicyReadoutRedactor.SafeChannelCap(familyCap);
        if (safeFamilyCap is not null)
        {
            return safeFamilyCap;
        }

        return NotificationPolicyReadoutRedactor.SafeChannelCap(globalCap ?? defaultCap);
    }

    private static bool IsSupportedByCap(string channelCap, string readiness)
    {
        return !string.Equals(channelCap, NotificationPolicyChannelCaps.Unsupported, StringComparison.Ordinal)
            && !string.Equals(readiness, NotificationPolicyReadinessStates.Unsupported, StringComparison.Ordinal);
    }

    private static bool IsAllowedByCap(string channelCap, string readiness)
    {
        if (readiness is NotificationPolicyReadinessStates.Disabled)
        {
            return false;
        }

        return channelCap is NotificationPolicyChannelCaps.Enabled
            or NotificationPolicyChannelCaps.ImmediateAllowed
            or NotificationPolicyChannelCaps.DigestOnly
            or NotificationPolicyChannelCaps.GenericExternalOnly;
    }

    private static bool IsProviderConfigured(string readiness)
    {
        return readiness is NotificationPolicyReadinessStates.Configured
            or NotificationPolicyReadinessStates.Limited;
    }

    private static string EventFamilyFor(string eventType)
    {
        if (eventType.StartsWith("bill.", StringComparison.Ordinal))
        {
            return NotificationPolicyEventFamilies.Bills;
        }

        if (eventType.StartsWith("settlement.", StringComparison.Ordinal))
        {
            return NotificationPolicyEventFamilies.Settlements;
        }

        if (eventType.StartsWith("recurring_bill.", StringComparison.Ordinal))
        {
            return NotificationPolicyEventFamilies.Recurring;
        }

        if (eventType.StartsWith("ocr.", StringComparison.Ordinal))
        {
            return NotificationPolicyEventFamilies.Ocr;
        }

        if (eventType.StartsWith("sync.", StringComparison.Ordinal))
        {
            return NotificationPolicyEventFamilies.Sync;
        }

        if (eventType.StartsWith("auth.", StringComparison.Ordinal)
            || eventType.StartsWith("security.", StringComparison.Ordinal))
        {
            return NotificationPolicyEventFamilies.AuthSecurity;
        }

        return NotificationPolicyEventFamilies.Bills;
    }
}
