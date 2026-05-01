using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Settleora.Api.Persistence;
using Settleora.Api.Domain.Users;

namespace Settleora.Api.Tests;

public sealed class PersistenceRegistrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public PersistenceRegistrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public void SettleoraDbContextIsRegisteredWithPostgreSqlProvider()
    {
        const string connectionString =
            "Host=postgres;Port=5432;Database=settleora;Username=settleora;Password=settleora_dev_password";

        using var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, configurationBuilder) =>
            {
                configurationBuilder.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Settleora:Database:ConnectionString"] = connectionString
                });
            });
        });

        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        Assert.Equal("Npgsql.EntityFrameworkCore.PostgreSQL", dbContext.Database.ProviderName);
        Assert.Equal(connectionString, dbContext.Database.GetConnectionString());
    }

    [Fact]
    public void SettleoraDbContextDefinesUsersGroupsSchemaFoundation()
    {
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SettleoraDbContext>();

        Assert.NotNull(dbContext.Model.FindEntityType(typeof(UserProfile)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(UserGroup)));
        Assert.NotNull(dbContext.Model.FindEntityType(typeof(GroupMembership)));
    }
}
