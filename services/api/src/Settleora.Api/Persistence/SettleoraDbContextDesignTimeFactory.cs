using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Settleora.Api.Configuration;

namespace Settleora.Api.Persistence;

public sealed class SettleoraDbContextDesignTimeFactory
    : IDesignTimeDbContextFactory<SettleoraDbContext>
{
    public SettleoraDbContext CreateDbContext(string[] args)
    {
        var configuration = BuildDesignTimeConfiguration();

        return CreateDbContext(configuration);
    }

    internal static SettleoraDbContext CreateDbContext(IConfiguration configuration)
    {
        var databaseOptions = configuration
            .GetSection(DatabaseOptions.SectionName)
            .Get<DatabaseOptions>();

        if (string.IsNullOrWhiteSpace(databaseOptions?.ConnectionString))
        {
            throw new InvalidOperationException(
                $"{DatabaseOptions.SectionName}:ConnectionString must be configured for EF Core design-time commands.");
        }

        var options = new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseNpgsql(databaseOptions.ConnectionString)
            .Options;

        return new SettleoraDbContext(options);
    }

    private static IConfigurationRoot BuildDesignTimeConfiguration()
    {
        var environmentName = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
            ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
            ?? "Development";

        return new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile($"appsettings.{environmentName}.json", optional: true)
            .AddEnvironmentVariables()
            .Build();
    }
}
