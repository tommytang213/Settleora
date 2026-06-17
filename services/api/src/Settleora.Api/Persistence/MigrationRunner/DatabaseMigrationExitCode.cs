namespace Settleora.Api.Persistence.MigrationRunner;

internal static class DatabaseMigrationExitCode
{
    public const int Success = 0;
    public const int Failure = 1;
    public const int PendingMigrations = 2;
    public const int UnsafeMigrationBlocked = 3;
}
