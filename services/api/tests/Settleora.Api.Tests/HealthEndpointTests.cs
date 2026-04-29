using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Settleora.Api.Health;

namespace Settleora.Api.Tests;

public sealed class HealthEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public HealthEndpointTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetHealthReturnsOkPayload()
    {
        using var client = _factory.CreateClient();

        using var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);

        Assert.Equal(2, payload.RootElement.EnumerateObject().Count());
        Assert.Equal("ok", payload.RootElement.GetProperty("status").GetString());
        Assert.Equal("settleora-api", payload.RootElement.GetProperty("service").GetString());
    }

    [Fact]
    public async Task GetReadyReturnsOkWhenDatabaseAndRabbitMqReadinessSucceed()
    {
        using var factory = CreateFactoryWithReadiness(databaseIsReady: true, rabbitMqIsReady: true);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);

        Assert.Equal("ready", payload.RootElement.GetProperty("status").GetString());
        Assert.Equal("settleora-api", payload.RootElement.GetProperty("service").GetString());
        Assert.Equal("ok", payload.RootElement.GetProperty("checks").GetProperty("postgres").GetString());
        Assert.Equal("ok", payload.RootElement.GetProperty("checks").GetProperty("rabbitmq").GetString());
    }

    [Fact]
    public async Task GetReadyReturnsServiceUnavailableWhenDatabaseFailsAndRabbitMqSucceeds()
    {
        using var factory = CreateFactoryWithReadiness(databaseIsReady: false, rabbitMqIsReady: true);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);

        Assert.Equal("unready", payload.RootElement.GetProperty("status").GetString());
        Assert.Equal("settleora-api", payload.RootElement.GetProperty("service").GetString());
        Assert.Equal("failed", payload.RootElement.GetProperty("checks").GetProperty("postgres").GetString());
        Assert.Equal("ok", payload.RootElement.GetProperty("checks").GetProperty("rabbitmq").GetString());
    }

    [Fact]
    public async Task GetReadyReturnsServiceUnavailableWhenRabbitMqFailsAndDatabaseSucceeds()
    {
        using var factory = CreateFactoryWithReadiness(databaseIsReady: true, rabbitMqIsReady: false);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);

        Assert.Equal("unready", payload.RootElement.GetProperty("status").GetString());
        Assert.Equal("settleora-api", payload.RootElement.GetProperty("service").GetString());
        Assert.Equal("ok", payload.RootElement.GetProperty("checks").GetProperty("postgres").GetString());
        Assert.Equal("failed", payload.RootElement.GetProperty("checks").GetProperty("rabbitmq").GetString());
    }

    [Fact]
    public async Task GetReadyDoesNotExposeDatabaseConnectionDetails()
    {
        const string connectionString = "Host=secret-host;Port=5432;Database=secret-db;Username=secret-user;Password=secret-password";
        Dictionary<string, string?> configuration = new()
        {
            ["Settleora:Database:ConnectionString"] = connectionString
        };

        using var factory = CreateFactoryWithReadiness(
            databaseIsReady: false,
            rabbitMqIsReady: true,
            configuration: configuration);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health/ready");
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.DoesNotContain(connectionString, content);
        Assert.DoesNotContain("secret-host", content);
        Assert.DoesNotContain("secret-db", content);
        Assert.DoesNotContain("secret-user", content);
        Assert.DoesNotContain("secret-password", content);
        Assert.DoesNotContain("Host=", content);
        Assert.DoesNotContain("Username=", content);
        Assert.DoesNotContain("Password=", content);
    }

    [Fact]
    public async Task GetReadyDoesNotExposeRabbitMqConnectionDetails()
    {
        const string exceptionMessage = "rabbitmq failure with sensitive details";
        Dictionary<string, string?> configuration = new()
        {
            ["Settleora:RabbitMq:HostName"] = "secret-rabbitmq-host",
            ["Settleora:RabbitMq:Port"] = "5672",
            ["Settleora:RabbitMq:UserName"] = "secret-rabbitmq-user",
            ["Settleora:RabbitMq:Password"] = "secret-rabbitmq-password",
            ["Settleora:RabbitMq:VirtualHost"] = "/secret-vhost"
        };

        using var factory = CreateFactoryWithReadiness(
            databaseIsReady: true,
            rabbitMqException: new InvalidOperationException(exceptionMessage),
            configuration: configuration);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health/ready");
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.DoesNotContain(exceptionMessage, content);
        Assert.DoesNotContain("secret-rabbitmq-host", content);
        Assert.DoesNotContain("secret-rabbitmq-user", content);
        Assert.DoesNotContain("secret-rabbitmq-password", content);
        Assert.DoesNotContain("/secret-vhost", content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("unready", payload.RootElement.GetProperty("status").GetString());
        Assert.Equal("settleora-api", payload.RootElement.GetProperty("service").GetString());
        Assert.Equal("ok", payload.RootElement.GetProperty("checks").GetProperty("postgres").GetString());
        Assert.Equal("failed", payload.RootElement.GetProperty("checks").GetProperty("rabbitmq").GetString());
    }

    [Fact]
    public async Task GetReadyReturnsServiceUnavailableWhenDatabaseReadinessThrows()
    {
        const string exceptionMessage = "database failure with sensitive details";
        using var factory = CreateFactoryWithReadiness(
            databaseException: new InvalidOperationException(exceptionMessage),
            rabbitMqIsReady: true);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health/ready");
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.DoesNotContain(exceptionMessage, content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("unready", payload.RootElement.GetProperty("status").GetString());
        Assert.Equal("settleora-api", payload.RootElement.GetProperty("service").GetString());
        Assert.Equal("failed", payload.RootElement.GetProperty("checks").GetProperty("postgres").GetString());
        Assert.Equal("ok", payload.RootElement.GetProperty("checks").GetProperty("rabbitmq").GetString());
    }

    private WebApplicationFactory<Program> CreateFactoryWithReadiness(
        bool databaseIsReady = false,
        bool rabbitMqIsReady = false,
        Exception? databaseException = null,
        Exception? rabbitMqException = null,
        Dictionary<string, string?>? configuration = null)
    {
        return _factory
            .WithWebHostBuilder(builder =>
            {
                if (configuration is not null)
                {
                    builder.ConfigureAppConfiguration((_, configurationBuilder) =>
                    {
                        configurationBuilder.AddInMemoryCollection(configuration);
                    });
                }

                builder.ConfigureServices(services =>
                {
                    services.RemoveAll<IDatabaseReadinessCheck>();
                    services.RemoveAll<IRabbitMqReadinessCheck>();
                    services.AddSingleton<IDatabaseReadinessCheck>(
                        new FakeDatabaseReadinessCheck(databaseIsReady, databaseException));
                    services.AddSingleton<IRabbitMqReadinessCheck>(
                        new FakeRabbitMqReadinessCheck(rabbitMqIsReady, rabbitMqException));
                });
            });
    }

    private sealed class FakeDatabaseReadinessCheck : IDatabaseReadinessCheck
    {
        private readonly bool _isReady;
        private readonly Exception? _exception;

        public FakeDatabaseReadinessCheck(bool isReady, Exception? exception)
        {
            _isReady = isReady;
            _exception = exception;
        }

        public Task<bool> IsReadyAsync(CancellationToken cancellationToken)
        {
            if (_exception is not null)
            {
                throw _exception;
            }

            return Task.FromResult(_isReady);
        }
    }

    private sealed class FakeRabbitMqReadinessCheck : IRabbitMqReadinessCheck
    {
        private readonly bool _isReady;
        private readonly Exception? _exception;

        public FakeRabbitMqReadinessCheck(bool isReady, Exception? exception)
        {
            _isReady = isReady;
            _exception = exception;
        }

        public Task<bool> IsReadyAsync(CancellationToken cancellationToken)
        {
            if (_exception is not null)
            {
                throw _exception;
            }

            return Task.FromResult(_isReady);
        }
    }
}
