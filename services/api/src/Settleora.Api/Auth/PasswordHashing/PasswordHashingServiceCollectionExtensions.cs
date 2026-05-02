using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Settleora.Api.Configuration;

namespace Settleora.Api.Auth.PasswordHashing;

internal static class PasswordHashingServiceCollectionExtensions
{
    public static IServiceCollection AddPasswordHashing(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<PasswordHashingOptions>(
            configuration.GetSection(PasswordHashingOptions.SectionName));
        services.AddSingleton<IPasswordHashingService, GeraltPasswordHashingService>();

        return services;
    }
}
