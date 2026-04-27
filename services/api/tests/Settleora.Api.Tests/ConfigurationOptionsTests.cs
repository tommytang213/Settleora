using Microsoft.Extensions.Configuration;
using Settleora.Api.Configuration;

namespace Settleora.Api.Tests;

public sealed class ConfigurationOptionsTests
{
    [Fact]
    public void RuntimeOptionsBindFromConfiguration()
    {
        Dictionary<string, string?> values = new()
        {
            ["Settleora:Database:ConnectionString"] = "Host=postgres;Database=settleora",
            ["Settleora:RabbitMq:HostName"] = "rabbitmq",
            ["Settleora:RabbitMq:Port"] = "5673",
            ["Settleora:RabbitMq:UserName"] = "worker",
            ["Settleora:RabbitMq:Password"] = "example-password",
            ["Settleora:RabbitMq:VirtualHost"] = "/settleora",
            ["Settleora:Storage:Provider"] = "Local",
            ["Settleora:Storage:RootPath"] = "/var/lib/settleora/storage"
        };

        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        var database = configuration.GetSection(DatabaseOptions.SectionName).Get<DatabaseOptions>();
        var rabbitMq = configuration.GetSection(RabbitMqOptions.SectionName).Get<RabbitMqOptions>();
        var storage = configuration.GetSection(StorageOptions.SectionName).Get<StorageOptions>();

        Assert.NotNull(database);
        Assert.NotNull(rabbitMq);
        Assert.NotNull(storage);
        Assert.Equal("Host=postgres;Database=settleora", database.ConnectionString);
        Assert.Equal("rabbitmq", rabbitMq.HostName);
        Assert.Equal(5673, rabbitMq.Port);
        Assert.Equal("worker", rabbitMq.UserName);
        Assert.Equal("example-password", rabbitMq.Password);
        Assert.Equal("/settleora", rabbitMq.VirtualHost);
        Assert.Equal("Local", storage.Provider);
        Assert.Equal("/var/lib/settleora/storage", storage.RootPath);
    }
}
