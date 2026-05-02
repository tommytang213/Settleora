using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Auth.Sessions;

internal static class AuthSessionRuntimeServiceCollectionExtensions
{
    public static IServiceCollection AddAuthSessionRuntime(this IServiceCollection services)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddScoped<IAuthSessionAuditWriter, EfAuthSessionAuditWriter>();
        services.AddScoped<IAuthSessionRuntimeService, AuthSessionRuntimeService>();

        return services;
    }
}
