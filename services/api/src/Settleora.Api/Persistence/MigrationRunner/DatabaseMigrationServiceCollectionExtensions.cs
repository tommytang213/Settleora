namespace Settleora.Api.Persistence.MigrationRunner;

internal static class DatabaseMigrationServiceCollectionExtensions
{
    public static IServiceCollection AddDatabaseMigrationRunner(
        this IServiceCollection services)
    {
        services.AddSingleton<MigrationSafetyPolicy>();
        services.AddScoped<DatabaseMigrationRunner>();

        return services;
    }
}
