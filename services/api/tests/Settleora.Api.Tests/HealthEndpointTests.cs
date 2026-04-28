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
    public async Task GetReadyReturnsOkWhenDatabaseReadinessSucceeds()
    {
        using var factory = CreateFactoryWithDatabaseReadiness(isReady: true);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);

        Assert.Equal("ready", payload.RootElement.GetProperty("status").GetString());
        Assert.Equal("settleora-api", payload.RootElement.GetProperty("service").GetString());
        Assert.Equal("ok", payload.RootElement.GetProperty("checks").GetProperty("postgres").GetString());
    }

    [Fact]
    public async Task GetReadyReturnsServiceUnavailableWhenDatabaseReadinessFails()
    {
        using var factory = CreateFactoryWithDatabaseReadiness(isReady: false);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);

        await using var responseStream = await response.Content.ReadAsStreamAsync();
        using var payload = await JsonDocument.ParseAsync(responseStream);

        Assert.Equal("unready", payload.RootElement.GetProperty("status").GetString());
        Assert.Equal("settleora-api", payload.RootElement.GetProperty("service").GetString());
        Assert.Equal("failed", payload.RootElement.GetProperty("checks").GetProperty("postgres").GetString());
    }

    [Fact]
    public async Task GetReadyDoesNotExposeDatabaseConnectionDetails()
    {
        const string connectionString = "Host=secret-host;Port=5432;Database=secret-db;Username=secret-user;Password=secret-password";
        Dictionary<string, string?> configuration = new()
        {
            ["Settleora:Database:ConnectionString"] = connectionString
        };

        using var factory = CreateFactoryWithDatabaseReadiness(isReady: false, configuration: configuration);
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
    public async Task GetReadyReturnsServiceUnavailableWhenDatabaseReadinessThrows()
    {
        const string exceptionMessage = "database failure with sensitive details";
        using var factory = CreateFactoryWithDatabaseReadiness(exception: new InvalidOperationException(exceptionMessage));
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health/ready");
        var content = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.DoesNotContain(exceptionMessage, content);

        using var payload = JsonDocument.Parse(content);
        Assert.Equal("unready", payload.RootElement.GetProperty("status").GetString());
        Assert.Equal("settleora-api", payload.RootElement.GetProperty("service").GetString());
        Assert.Equal("failed", payload.RootElement.GetProperty("checks").GetProperty("postgres").GetString());
    }

    private WebApplicationFactory<Program> CreateFactoryWithDatabaseReadiness(
        bool isReady = false,
        Exception? exception = null,
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
                    services.AddSingleton<IDatabaseReadinessCheck>(new FakeDatabaseReadinessCheck(isReady, exception));
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
}
