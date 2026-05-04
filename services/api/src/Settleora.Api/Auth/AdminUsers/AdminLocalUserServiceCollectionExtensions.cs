namespace Settleora.Api.Auth.AdminUsers;

internal static class AdminLocalUserServiceCollectionExtensions
{
    public static IServiceCollection AddAdminLocalUsers(this IServiceCollection services)
    {
        services.AddScoped<IAdminLocalUserService, AdminLocalUserService>();

        return services;
    }
}
