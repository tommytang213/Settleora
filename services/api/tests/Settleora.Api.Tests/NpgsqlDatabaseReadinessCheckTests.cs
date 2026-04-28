using Microsoft.Extensions.Options;
using Settleora.Api.Configuration;
using Settleora.Api.Health;

namespace Settleora.Api.Tests;

public sealed class NpgsqlDatabaseReadinessCheckTests
{
    [Fact]
    public async Task IsReadyAsyncReturnsFalseWhenConnectionStringIsEmpty()
    {
        var readinessCheck = CreateReadinessCheck(string.Empty);

        var isReady = await readinessCheck.IsReadyAsync(CancellationToken.None);

        Assert.False(isReady);
    }

    [Fact]
    public async Task IsReadyAsyncReturnsFalseWhenConnectionStringIsInvalid()
    {
        var readinessCheck = CreateReadinessCheck("NotAValidNpgsqlKeyword=value");

        var isReady = await readinessCheck.IsReadyAsync(CancellationToken.None);

        Assert.False(isReady);
    }

    private static NpgsqlDatabaseReadinessCheck CreateReadinessCheck(string connectionString)
    {
        return new NpgsqlDatabaseReadinessCheck(Options.Create(new DatabaseOptions
        {
            ConnectionString = connectionString
        }));
    }
}
