using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Notifications;

internal static class InAppNotificationServiceCollectionExtensions
{
    public static IServiceCollection AddInAppNotifications(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<SmtpEmailNotificationOptions>(
            configuration.GetSection(SmtpEmailNotificationOptions.SectionName));
        services.TryAddScoped<IInAppNotificationWriter, EfInAppNotificationWriter>();
        services.TryAddScoped<INotificationDeliveryAttemptRecorder, EfNotificationDeliveryAttemptRecorder>();
        services.TryAddScoped<INotificationDeliveryAttemptLeaseService, EfNotificationDeliveryAttemptLeaseService>();
        services.TryAddScoped<INotificationDeliveryOutboxProcessor, NotificationDeliveryOutboxProcessor>();
        services.TryAddScoped<ISmtpEmailTransport, SmtpEmailTransport>();
        services.TryAddScoped<ISmtpEmailNotificationSender, SmtpEmailNotificationSender>();
        services.TryAddSingleton<INotificationDecisionEnvelopeResolver, NotificationDecisionEnvelopeResolver>();
        return services;
    }
}
