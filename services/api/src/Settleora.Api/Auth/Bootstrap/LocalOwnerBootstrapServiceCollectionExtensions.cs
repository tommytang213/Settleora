namespace Settleora.Api.Auth.Bootstrap;

internal static class LocalOwnerBootstrapServiceCollectionExtensions
{
    public static IServiceCollection AddLocalOwnerBootstrap(this IServiceCollection services)
    {
        services.AddScoped<ILocalOwnerBootstrapService, LocalOwnerBootstrapService>();
        return services;
    }
}
