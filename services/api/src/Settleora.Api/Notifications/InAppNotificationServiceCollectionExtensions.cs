using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Notifications;

internal static class InAppNotificationServiceCollectionExtensions
{
    public static IServiceCollection AddInAppNotifications(this IServiceCollection services)
    {
        services.TryAddScoped<IInAppNotificationWriter, EfInAppNotificationWriter>();
        services.TryAddScoped<INotificationDeliveryAttemptRecorder, EfNotificationDeliveryAttemptRecorder>();
        services.TryAddSingleton<INotificationDecisionEnvelopeResolver, NotificationDecisionEnvelopeResolver>();
        return services;
    }
}
