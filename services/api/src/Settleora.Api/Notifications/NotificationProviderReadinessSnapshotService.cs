using Microsoft.Extensions.Options;
using Settleora.Api.Domain.Notifications;

namespace Settleora.Api.Notifications;

internal sealed class NotificationProviderReadinessSnapshotService : INotificationProviderReadinessService
{
    private readonly IOptionsMonitor<SmtpEmailNotificationOptions> smtpOptions;
    private readonly IOptionsMonitor<PushNotificationOptions> pushOptions;

    public NotificationProviderReadinessSnapshotService(
        IOptionsMonitor<SmtpEmailNotificationOptions> smtpOptions,
        IOptionsMonitor<PushNotificationOptions> pushOptions)
    {
        this.smtpOptions = smtpOptions;
        this.pushOptions = pushOptions;
    }

    public NotificationProviderReadinessSnapshot GetSnapshot()
    {
        return new NotificationProviderReadinessSnapshot(
            Email: ResolveEmailReadiness(smtpOptions.CurrentValue),
            MobilePush: ResolveMobilePushReadiness(pushOptions.CurrentValue));
    }

    private static string ResolveEmailReadiness(SmtpEmailNotificationOptions options)
    {
        if (!options.Enabled)
        {
            return NotificationPolicyReadinessStates.Disabled;
        }

        return options.HasRequiredConnectionFields()
            ? NotificationPolicyReadinessStates.Configured
            : NotificationPolicyReadinessStates.Unconfigured;
    }

    private static string ResolveMobilePushReadiness(PushNotificationOptions options)
    {
        if (!options.Enabled)
        {
            return NotificationPolicyReadinessStates.Disabled;
        }

        // The current push option shape has only a coarse enable switch and no
        // safe APNs/FCM provider configuration fields, so enabled push remains
        // readout-only and conservative until a later provider gate exists.
        return NotificationPolicyReadinessStates.Unconfigured;
    }
}
