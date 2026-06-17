namespace Settleora.Api.Persistence.MigrationRunner;

internal enum DatabaseMigrationMode
{
    ManagedAuto,
    ApplySafe,
    Manual,
    CheckOnly,
    ValidateOnly,
    ForceAllowDestructive
}
