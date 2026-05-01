using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Settleora.Api.Configuration;

namespace Settleora.Api.Persistence;

internal static class PersistenceServiceCollectionExtensions
{
    public static IServiceCollection AddSettleoraPersistence(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<DatabaseOptions>(
            configuration.GetSection(DatabaseOptions.SectionName));

        services.AddDbContext<SettleoraDbContext>((serviceProvider, options) =>
        {
            var databaseOptions = serviceProvider
                .GetRequiredService<IOptions<DatabaseOptions>>()
                .Value;

            options.UseNpgsql(databaseOptions.ConnectionString);
        });

        return services;
    }
}
