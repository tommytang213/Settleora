using System.Reflection;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;
using Settleora.Api.Persistence;

var migrationBase = typeof(Migration);
var migrations = typeof(SettleoraDbContext).Assembly
    .GetTypes()
    .Where(type => !type.IsAbstract && migrationBase.IsAssignableFrom(type))
    .Select(type => new
    {
        Type = type.FullName ?? throw new InvalidOperationException("Migration type has no full name."),
        Attribute = type.GetCustomAttribute<MigrationAttribute>(inherit: false),
    })
    .Select(item => new
    {
        item.Type,
        Id = item.Attribute?.Id ?? throw new InvalidOperationException($"Migration {item.Type} has no EF MigrationAttribute."),
    })
    .OrderBy(item => item.Id, StringComparer.Ordinal)
    .ToArray();

if (migrations.Length == 0 || migrations.Select(item => item.Id).Distinct(StringComparer.Ordinal).Count() != migrations.Length)
{
    throw new InvalidOperationException("Compiled EF migration IDs are empty or duplicated.");
}

Console.WriteLine($"SETTLEORA_MIGRATIONS_JSON:{JsonSerializer.Serialize(migrations)}");
