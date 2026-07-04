using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Notifications;

internal static class InAppNotificationServiceCollectionExtensions
{
    public static IServiceCollection AddInAppNotifications(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<SmtpEmailNotificationOptions>(
            configuration.GetSection(SmtpEmailNotificationOptions.SectionName));
        services.Configure<PushNotificationOptions>(
            configuration.GetSection(PushNotificationOptions.SectionName));
        services.TryAddScoped<IInAppNotificationWriter, EfInAppNotificationWriter>();
        services.TryAddScoped<INotificationDeliveryAttemptRecorder, EfNotificationDeliveryAttemptRecorder>();
        services.TryAddScoped<INotificationDeliveryAttemptLeaseService, EfNotificationDeliveryAttemptLeaseService>();
        services.TryAddScoped<INotificationDeliveryOutboxProcessor, NotificationDeliveryOutboxProcessor>();
        services.TryAddScoped<INotificationProviderReadinessService, NotificationProviderReadinessSnapshotService>();
        services.TryAddScoped<IAdminNotificationPolicyReadoutService, AdminNotificationPolicyReadoutService>();
        services.TryAddScoped<ISmtpEmailTransport, SmtpEmailTransport>();
        services.TryAddScoped<ISmtpEmailNotificationSender, SmtpEmailNotificationSender>();
        services.TryAddScoped<IPushNotificationProvider, DisabledPushNotificationProvider>();
        services.TryAddScoped<IPushNotificationSender, PushNotificationSender>();
        services.TryAddSingleton<INotificationDecisionEnvelopeResolver, NotificationDecisionEnvelopeResolver>();
        return services;
    }
}
