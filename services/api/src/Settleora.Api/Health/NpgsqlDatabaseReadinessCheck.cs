using System.Globalization;
using Microsoft.Extensions.Options;
using Npgsql;
using Settleora.Api.Configuration;

namespace Settleora.Api.Health;

internal sealed class NpgsqlDatabaseReadinessCheck : IDatabaseReadinessCheck
{
    private const string ReadinessQuery = "SELECT 1";

    private readonly IOptions<DatabaseOptions> _databaseOptions;

    public NpgsqlDatabaseReadinessCheck(IOptions<DatabaseOptions> databaseOptions)
    {
        _databaseOptions = databaseOptions;
    }

    public async Task<bool> IsReadyAsync(CancellationToken cancellationToken)
    {
        var connectionString = _databaseOptions.Value.ConnectionString;
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return false;
        }

        try
        {
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync(cancellationToken);

            await using var command = new NpgsqlCommand(ReadinessQuery, connection);
            var result = await command.ExecuteScalarAsync(cancellationToken);

            return string.Equals(
                Convert.ToString(result, CultureInfo.InvariantCulture),
                "1",
                StringComparison.Ordinal);
        }
        catch (Exception exception) when (IsReadinessFailure(exception))
        {
            return false;
        }
    }

    private static bool IsReadinessFailure(Exception exception)
    {
        return exception is NpgsqlException
            or InvalidOperationException
            or TimeoutException
            or ArgumentException
            or FormatException;
    }
}
