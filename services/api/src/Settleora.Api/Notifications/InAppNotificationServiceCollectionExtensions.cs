using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Notifications;

internal static class InAppNotificationServiceCollectionExtensions
{
    public static IServiceCollection AddInAppNotifications(this IServiceCollection services)
    {
        services.TryAddScoped<IInAppNotificationWriter, EfInAppNotificationWriter>();
        return services;
    }
}
