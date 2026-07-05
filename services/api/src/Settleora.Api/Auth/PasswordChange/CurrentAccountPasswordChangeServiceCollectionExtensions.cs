namespace Settleora.Api.Auth.PasswordChange;

internal static class CurrentAccountPasswordChangeServiceCollectionExtensions
{
    public static IServiceCollection AddCurrentAccountPasswordChange(this IServiceCollection services)
    {
        services.AddScoped<ICurrentAccountPasswordChangeService, CurrentAccountPasswordChangeService>();
        return services;
    }
}
