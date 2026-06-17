namespace Settleora.Api.Persistence.MigrationRunner;

internal sealed record DatabaseMigrationCommand(DatabaseMigrationMode Mode)
{
    public bool AppliesMigrations =>
        Mode is DatabaseMigrationMode.ManagedAuto
            or DatabaseMigrationMode.ApplySafe
            or DatabaseMigrationMode.ForceAllowDestructive;

    public bool RequiresSafetyCheck =>
        Mode is DatabaseMigrationMode.ManagedAuto
            or DatabaseMigrationMode.ApplySafe;
}
