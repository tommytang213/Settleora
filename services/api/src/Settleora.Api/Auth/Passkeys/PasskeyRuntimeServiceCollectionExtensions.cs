using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Auth.Passkeys;

internal static class PasskeyRuntimeServiceCollectionExtensions
{
    public static IServiceCollection AddPasskeyRuntime(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<PasskeyWebAuthnOptions>(
            configuration.GetSection(PasskeyWebAuthnOptions.SectionName));
        services.TryAddScoped<IPasskeyWebAuthnProvider, Fido2PasskeyWebAuthnProvider>();
        services.TryAddScoped<IPasskeyAuditWriter, EfPasskeyAuditWriter>();
        services.TryAddScoped<IPasskeyRuntimeService, PasskeyRuntimeService>();
        return services;
    }
}
