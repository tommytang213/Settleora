namespace Settleora.Api.Persistence.MigrationRunner;

internal static class DatabaseMigrationCommandLine
{
    private const string EnvironmentModeName = "SETTLEORA_DATABASE_MIGRATION_MODE";
    private const string ConfigurationModeName = "Settleora__Database__MigrationMode";

    public static DatabaseMigrationCommand? TryParse(
        string[] args,
        IConfiguration configuration)
    {
        if (args.Length == 0)
        {
            return null;
        }

        var commandOffset = args[0] switch
        {
            "migrate-database" => 1,
            "database" when args.Length > 1 && args[1] == "migrate" => 2,
            _ => -1
        };

        if (commandOffset < 0)
        {
            return null;
        }

        var modeValue = ReadModeArgument(args, commandOffset)
            ?? Environment.GetEnvironmentVariable(EnvironmentModeName)
            ?? configuration["Settleora:Database:MigrationMode"]
            ?? Environment.GetEnvironmentVariable(ConfigurationModeName)
            ?? "managed-auto";

        return new DatabaseMigrationCommand(ParseMode(modeValue));
    }

    internal static DatabaseMigrationMode ParseMode(string value)
    {
        return NormalizeMode(value) switch
        {
            "managedauto" => DatabaseMigrationMode.ManagedAuto,
            "applysafe" => DatabaseMigrationMode.ApplySafe,
            "manual" => DatabaseMigrationMode.Manual,
            "checkonly" => DatabaseMigrationMode.CheckOnly,
            "validateonly" => DatabaseMigrationMode.ValidateOnly,
            "forceallowdestructive" => DatabaseMigrationMode.ForceAllowDestructive,
            _ => throw new ArgumentException(
                "Migration mode must be one of managed-auto, apply-safe, manual, check-only, validate-only, or force-allow-destructive.",
                nameof(value))
        };
    }

    private static string? ReadModeArgument(string[] args, int commandOffset)
    {
        for (var index = commandOffset; index < args.Length; index++)
        {
            var argument = args[index];

            if (argument.StartsWith("--mode=", StringComparison.OrdinalIgnoreCase))
            {
                return argument["--mode=".Length..];
            }

            if (argument.Equals("--mode", StringComparison.OrdinalIgnoreCase)
                && index + 1 < args.Length)
            {
                return args[index + 1];
            }
        }

        return null;
    }

    private static string NormalizeMode(string value)
    {
        return value
            .Trim()
            .Replace("-", string.Empty, StringComparison.Ordinal)
            .Replace("_", string.Empty, StringComparison.Ordinal)
            .ToLowerInvariant();
    }
}
