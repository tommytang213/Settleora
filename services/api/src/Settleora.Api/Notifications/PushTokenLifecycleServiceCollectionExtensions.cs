using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Notifications;

internal static class PushTokenLifecycleServiceCollectionExtensions
{
    public static IServiceCollection AddPushTokenLifecycle(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDataProtection();
        services.Configure<PushTokenProtectionOptions>(
            configuration.GetSection(PushTokenProtectionOptions.SectionName));
        services.TryAddScoped<IPushTokenProtector, PushTokenProtector>();
        services.TryAddScoped<IPushTokenFingerprintService, HmacPushTokenFingerprintService>();
        return services;
    }
}
