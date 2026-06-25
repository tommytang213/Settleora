using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Auth.Policy;

internal static class AuthSecurityPolicyServiceCollectionExtensions
{
    public static IServiceCollection AddAuthSecurityPolicyRuntime(this IServiceCollection services)
    {
        services.TryAddScoped<IAuthSecurityPolicyService, AuthSecurityPolicyService>();
        return services;
    }
}
