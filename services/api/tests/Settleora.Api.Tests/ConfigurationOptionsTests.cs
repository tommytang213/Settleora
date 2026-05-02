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
            ["Settleora:Storage:RootPath"] = "/var/lib/settleora/storage",
            ["Settleora:Auth:PasswordHashing:Algorithm"] = "argon2id",
            ["Settleora:Auth:PasswordHashing:PolicyVersion"] = "argon2id-v1",
            ["Settleora:Auth:PasswordHashing:Argon2idIterations"] = "3",
            ["Settleora:Auth:PasswordHashing:Argon2idMemorySizeBytes"] = "67108864",
            ["Settleora:Auth:PasswordHashing:VerifierMaxLength"] = "512",
            ["Settleora:Auth:PasswordHashing:ParametersMaxLength"] = "1024"
        };

        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        var database = configuration.GetSection(DatabaseOptions.SectionName).Get<DatabaseOptions>();
        var rabbitMq = configuration.GetSection(RabbitMqOptions.SectionName).Get<RabbitMqOptions>();
        var storage = configuration.GetSection(StorageOptions.SectionName).Get<StorageOptions>();
        var passwordHashing = configuration.GetSection(PasswordHashingOptions.SectionName).Get<PasswordHashingOptions>();

        Assert.NotNull(database);
        Assert.NotNull(rabbitMq);
        Assert.NotNull(storage);
        Assert.NotNull(passwordHashing);
        Assert.Equal("Host=postgres;Database=settleora", database.ConnectionString);
        Assert.Equal("rabbitmq", rabbitMq.HostName);
        Assert.Equal(5673, rabbitMq.Port);
        Assert.Equal("worker", rabbitMq.UserName);
        Assert.Equal("example-password", rabbitMq.Password);
        Assert.Equal("/settleora", rabbitMq.VirtualHost);
        Assert.Equal("Local", storage.Provider);
        Assert.Equal("/var/lib/settleora/storage", storage.RootPath);
        Assert.Equal("argon2id", passwordHashing.Algorithm);
        Assert.Equal("argon2id-v1", passwordHashing.PolicyVersion);
        Assert.Equal(3, passwordHashing.Argon2idIterations);
        Assert.Equal(67_108_864, passwordHashing.Argon2idMemorySizeBytes);
        Assert.Equal(512, passwordHashing.VerifierMaxLength);
        Assert.Equal(1024, passwordHashing.ParametersMaxLength);
    }
}
