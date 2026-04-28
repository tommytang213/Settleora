using Settleora.Api.Configuration;
using Settleora.Api.Health;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<DatabaseOptions>(
    builder.Configuration.GetSection(DatabaseOptions.SectionName));
builder.Services.Configure<RabbitMqOptions>(
    builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.Configure<StorageOptions>(
    builder.Configuration.GetSection(StorageOptions.SectionName));
builder.Services.AddSingleton<IDatabaseReadinessCheck, NpgsqlDatabaseReadinessCheck>();

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "settleora-api"
}));

app.MapGet("/health/ready", async (
    IDatabaseReadinessCheck databaseReadinessCheck,
    CancellationToken cancellationToken) =>
{
    bool postgresIsReady;
    try
    {
        postgresIsReady = await databaseReadinessCheck.IsReadyAsync(cancellationToken);
    }
    catch (Exception exception) when (exception is not OperationCanceledException)
    {
        postgresIsReady = false;
    }

    var response = new
    {
        status = postgresIsReady ? "ready" : "unready",
        service = "settleora-api",
        checks = new
        {
            postgres = postgresIsReady ? "ok" : "failed"
        }
    };

    return postgresIsReady
        ? Results.Ok(response)
        : Results.Json(response, statusCode: StatusCodes.Status503ServiceUnavailable);
});

app.Run();

public partial class Program { }
