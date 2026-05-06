using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Persistence;

namespace Settleora.Api.Tests;

public sealed class SettleoraDbContextDesignTimeFactoryTests
{
    [Fact]
    public void DesignTimeFactoryBuildsPostgreSqlContextWithSchemaFoundationModel()
    {
        const string connectionString =
            "Host=localhost;Port=5432;Database=settleora;Username=settleora;Password=settleora_dev_password";

        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Settleora:Database:ConnectionString"] = connectionString
            })
            .Build();

        using var dbContext = SettleoraDbContextDesignTimeFactory.CreateDbContext(configuration);

        Assert.Equal("Npgsql.EntityFrameworkCore.PostgreSQL", dbContext.Database.ProviderName);
        Assert.Equal(connectionString, dbContext.Database.GetConnectionString());
        Assert.Equal(20, dbContext.Model.GetEntityTypes().Count());
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(FileObject)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(ExpenseBill)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(ExpenseBillItemSplit)));
    }

    [Fact]
    public void DesignTimeFactoryRequiresConfiguredConnectionString()
    {
        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        var exception = Assert.Throws<InvalidOperationException>(
            () => SettleoraDbContextDesignTimeFactory.CreateDbContext(configuration));

        Assert.Contains("Settleora:Database:ConnectionString", exception.Message);
    }
}
