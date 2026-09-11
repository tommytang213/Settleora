using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Settleora.Api.Persistence;

var options = new DbContextOptionsBuilder<SettleoraDbContext>()
    .UseNpgsql("Host=127.0.0.1;Database=settleora_release_identity;Username=settleora;Password=not-used")
    .Options;
using var dbContext = new SettleoraDbContext(options);
var runtimeMigrations = dbContext.GetService<IMigrationsAssembly>().Migrations;
var migrations = runtimeMigrations
    .Select(item => new
    {
        Type = item.Value.AsType().FullName ?? throw new InvalidOperationException("Migration type has no full name."),
        Id = item.Key,
    })
    .OrderBy(item => item.Id, StringComparer.Ordinal)
    .ToArray();

if (migrations.Length == 0 || migrations.Select(item => item.Id).Distinct(StringComparer.Ordinal).Count() != migrations.Length)
{
    throw new InvalidOperationException("Compiled EF migration IDs are empty or duplicated.");
}

Console.WriteLine($"SETTLEORA_MIGRATIONS_JSON:{JsonSerializer.Serialize(migrations)}");
