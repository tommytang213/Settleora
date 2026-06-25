using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Settleora.Api.Auth.Mfa;

internal static class MfaRuntimeServiceCollectionExtensions
{
    public static IServiceCollection AddMfaRuntime(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDataProtection();
        services.Configure<MfaRuntimeOptions>(configuration.GetSection(MfaRuntimeOptions.SectionName));
        services.TryAddScoped<ITotpSecretProtector, DataProtectionTotpSecretProtector>();
        services.TryAddScoped<ITotpCodeService, TotpCodeService>();
        services.TryAddScoped<IRecoveryCodeHasher, RecoveryCodeHasher>();
        services.TryAddScoped<IMfaAuditWriter, EfMfaAuditWriter>();
        services.TryAddScoped<IMfaRuntimeService, MfaRuntimeService>();
        return services;
    }
}
