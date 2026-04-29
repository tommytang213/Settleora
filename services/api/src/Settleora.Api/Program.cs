using Settleora.Api.Configuration;
using Settleora.Api.Health;
using Settleora.Api.Storage;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<DatabaseOptions>(
    builder.Configuration.GetSection(DatabaseOptions.SectionName));
builder.Services.Configure<RabbitMqOptions>(
    builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.Configure<StorageOptions>(
    builder.Configuration.GetSection(StorageOptions.SectionName));
builder.Services.AddSingleton<IDatabaseReadinessCheck, NpgsqlDatabaseReadinessCheck>();
builder.Services.AddSingleton<IRabbitMqReadinessCheck, RabbitMqReadinessCheck>();
builder.Services.AddSingleton<IStorageReadinessCheck, LocalStorageReadinessCheck>();

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "settleora-api"
}));

app.MapGet("/health/ready", async (
    IDatabaseReadinessCheck databaseReadinessCheck,
    IRabbitMqReadinessCheck rabbitMqReadinessCheck,
    IStorageReadinessCheck storageReadinessCheck,
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

    bool rabbitMqIsReady;
    try
    {
        rabbitMqIsReady = await rabbitMqReadinessCheck.IsReadyAsync(cancellationToken);
    }
    catch (Exception exception) when (exception is not OperationCanceledException)
    {
        rabbitMqIsReady = false;
    }

    bool storageIsReady;
    try
    {
        storageIsReady = await storageReadinessCheck.IsReadyAsync(cancellationToken);
    }
    catch (Exception exception) when (exception is not OperationCanceledException)
    {
        storageIsReady = false;
    }

    var isReady = postgresIsReady && rabbitMqIsReady && storageIsReady;
    var response = new
    {
        status = isReady ? "ready" : "unready",
        service = "settleora-api",
        checks = new
        {
            postgres = postgresIsReady ? "ok" : "failed",
            rabbitmq = rabbitMqIsReady ? "ok" : "failed",
            storage = storageIsReady ? "ok" : "failed"
        }
    };

    return isReady
        ? Results.Ok(response)
        : Results.Json(response, statusCode: StatusCodes.Status503ServiceUnavailable);
});

app.Run();

public partial class Program { }
