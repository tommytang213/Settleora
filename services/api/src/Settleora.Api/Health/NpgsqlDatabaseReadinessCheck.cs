using System.Globalization;
using Microsoft.Extensions.Options;
using Npgsql;
using Settleora.Api.Configuration;

namespace Settleora.Api.Health;

internal sealed class NpgsqlDatabaseReadinessCheck : IDatabaseReadinessCheck
{
    private static readonly TimeSpan ReadinessTimeout = TimeSpan.FromSeconds(2);

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
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(ReadinessTimeout);

            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync(timeout.Token);

            await using var command = new NpgsqlCommand(ReadinessQuery, connection);
            var result = await command.ExecuteScalarAsync(timeout.Token);

            return string.Equals(
                Convert.ToString(result, CultureInfo.InvariantCulture),
                "1",
                StringComparison.Ordinal);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return false;
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
