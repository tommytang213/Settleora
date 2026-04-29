using Settleora.Api.Storage;

namespace Settleora.Api.Health;

internal static class HealthEndpoints
{
    public static WebApplication MapHealthEndpoints(this WebApplication app)
    {
        app.MapGet("/health", () => Results.Ok(new HealthResponse(
            Status: "ok",
            Service: "settleora-api")));

        app.MapGet("/health/ready", GetReadinessAsync);

        return app;
    }

    private static async Task<IResult> GetReadinessAsync(
        IDatabaseReadinessCheck databaseReadinessCheck,
        IRabbitMqReadinessCheck rabbitMqReadinessCheck,
        IStorageReadinessCheck storageReadinessCheck,
        CancellationToken cancellationToken)
    {
        var postgresIsReady = await IsReadyAsync(databaseReadinessCheck, cancellationToken);
        var rabbitMqIsReady = await IsReadyAsync(rabbitMqReadinessCheck, cancellationToken);
        var storageIsReady = await IsReadyAsync(storageReadinessCheck, cancellationToken);

        var isReady = postgresIsReady && rabbitMqIsReady && storageIsReady;
        var response = new ReadinessResponse(
            Status: isReady ? "ready" : "unready",
            Service: "settleora-api",
            Checks: new ReadinessChecksResponse(
                Postgres: postgresIsReady ? "ok" : "failed",
                RabbitMq: rabbitMqIsReady ? "ok" : "failed",
                Storage: storageIsReady ? "ok" : "failed"));

        return isReady
            ? Results.Ok(response)
            : Results.Json(response, statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    private static async Task<bool> IsReadyAsync(
        IDatabaseReadinessCheck readinessCheck,
        CancellationToken cancellationToken)
    {
        try
        {
            return await readinessCheck.IsReadyAsync(cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return false;
        }
    }

    private static async Task<bool> IsReadyAsync(
        IRabbitMqReadinessCheck readinessCheck,
        CancellationToken cancellationToken)
    {
        try
        {
            return await readinessCheck.IsReadyAsync(cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return false;
        }
    }

    private static async Task<bool> IsReadyAsync(
        IStorageReadinessCheck readinessCheck,
        CancellationToken cancellationToken)
    {
        try
        {
            return await readinessCheck.IsReadyAsync(cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return false;
        }
    }
}
