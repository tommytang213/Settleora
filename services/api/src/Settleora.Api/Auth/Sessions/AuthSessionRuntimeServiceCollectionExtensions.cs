using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Settleora.Api.Auth.Sessions;

internal static class AuthSessionRuntimeServiceCollectionExtensions
{
    public static IServiceCollection AddAuthSessionRuntime(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services
            .AddOptions<AuthSessionPolicyOptions>()
            .Bind(configuration.GetSection(AuthSessionPolicyOptions.SectionName))
            .ValidateOnStart();
        services.TryAddEnumerable(ServiceDescriptor.Singleton<
            IValidateOptions<AuthSessionPolicyOptions>,
            AuthSessionPolicyOptionsValidator>());
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddScoped<IAuthSessionAuditWriter, EfAuthSessionAuditWriter>();
        services.AddScoped<IAuthSessionRuntimeService, AuthSessionRuntimeService>();

        return services;
    }
}
