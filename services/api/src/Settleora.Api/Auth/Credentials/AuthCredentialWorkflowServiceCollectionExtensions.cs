using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Auth.Credentials;

internal static class AuthCredentialWorkflowServiceCollectionExtensions
{
    public static IServiceCollection AddAuthCredentialWorkflow(this IServiceCollection services)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddScoped<IAuthCredentialAuditWriter, EfAuthCredentialAuditWriter>();
        services.AddScoped<IAuthCredentialWorkflowService, AuthCredentialWorkflowService>();

        return services;
    }
}
