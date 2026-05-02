using Settleora.Api.Auth.Credentials;
using Settleora.Api.Auth.PasswordHashing;
using Settleora.Api.Configuration;
using Settleora.Api.Health;
using Settleora.Api.Persistence;
using Settleora.Api.Storage;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSettleoraPersistence(builder.Configuration);
builder.Services.AddPasswordHashing(builder.Configuration);
builder.Services.AddAuthCredentialWorkflow();
builder.Services.Configure<RabbitMqOptions>(
    builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.Configure<StorageOptions>(
    builder.Configuration.GetSection(StorageOptions.SectionName));
builder.Services.AddSingleton<IDatabaseReadinessCheck, NpgsqlDatabaseReadinessCheck>();
builder.Services.AddSingleton<IRabbitMqReadinessCheck, RabbitMqReadinessCheck>();
builder.Services.AddSingleton<IStorageReadinessCheck, LocalStorageReadinessCheck>();

var app = builder.Build();

app.MapHealthEndpoints();

app.Run();

public partial class Program { }
