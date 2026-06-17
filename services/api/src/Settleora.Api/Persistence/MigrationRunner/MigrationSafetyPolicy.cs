using Microsoft.EntityFrameworkCore.Migrations.Operations;

namespace Settleora.Api.Persistence.MigrationRunner;

internal sealed class MigrationSafetyPolicy
{
    private static readonly string[] UnsafeSqlTokens =
    [
        " drop ",
        " drop\n",
        "\ndrop ",
        " truncate ",
        "\ntruncate ",
        " delete ",
        "\ndelete ",
        " alter table ",
        "\nalter table "
    ];

    public MigrationSafetyAssessment Assess(
        string migrationId,
        IReadOnlyList<MigrationOperation> operations)
    {
        var reasons = new List<string>();

        foreach (var operation in operations)
        {
            var operationName = operation.GetType().Name;

            switch (operation)
            {
                case DropTableOperation dropTable:
                    reasons.Add($"{migrationId}: DropTableOperation on table '{dropTable.Name}' is destructive.");
                    break;
                case DropColumnOperation dropColumn:
                    reasons.Add($"{migrationId}: DropColumnOperation on column '{dropColumn.Table}.{dropColumn.Name}' is destructive.");
                    break;
                case SqlOperation sqlOperation when ContainsUnsafeSql(sqlOperation.Sql):
                    reasons.Add($"{migrationId}: SqlOperation contains destructive or unclassified SQL and is blocked by managed mode.");
                    break;
                case AlterColumnOperation alterColumn when alterColumn.IsDestructiveChange:
                    reasons.Add($"{migrationId}: AlterColumnOperation on column '{alterColumn.Table}.{alterColumn.Name}' is marked destructive by EF Core.");
                    break;
                default:
                    if (operation.IsDestructiveChange)
                    {
                        reasons.Add($"{migrationId}: {operationName} is marked destructive by EF Core.");
                    }

                    break;
            }
        }

        return reasons.Count == 0
            ? MigrationSafetyAssessment.Safe
            : new MigrationSafetyAssessment(false, reasons);
    }

    private static bool ContainsUnsafeSql(string sql)
    {
        var normalized = $" {sql.Trim().ToLowerInvariant()} ";

        return UnsafeSqlTokens.Any(normalized.Contains);
    }
}
