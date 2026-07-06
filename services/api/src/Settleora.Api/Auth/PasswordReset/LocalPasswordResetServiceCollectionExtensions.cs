namespace Settleora.Api.Auth.PasswordReset;

internal static class LocalPasswordResetServiceCollectionExtensions
{
    public static IServiceCollection AddLocalPasswordResetRuntime(this IServiceCollection services)
    {
        services.AddScoped<IPasswordResetMaterialService, PasswordResetMaterialService>();
        services.AddScoped<IPasswordResetAuditWriter, EfPasswordResetAuditWriter>();
        services.AddScoped<ILocalPasswordResetService, LocalPasswordResetService>();
        return services;
    }
}
