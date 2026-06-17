using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Settleora.Api.Persistence.MigrationRunner;

internal sealed class DatabaseMigrationRunner
{
    private readonly SettleoraDbContext dbContext;
    private readonly MigrationSafetyPolicy safetyPolicy;
    private readonly ILogger<DatabaseMigrationRunner> logger;

    public DatabaseMigrationRunner(
        SettleoraDbContext dbContext,
        MigrationSafetyPolicy safetyPolicy,
        ILogger<DatabaseMigrationRunner> logger)
    {
        this.dbContext = dbContext;
        this.safetyPolicy = safetyPolicy;
        this.logger = logger;
    }

    public async Task<int> RunAsync(
        DatabaseMigrationCommand command,
        CancellationToken cancellationToken)
    {
        var stopwatch = Stopwatch.StartNew();

        logger.LogInformation(
            "Starting Settleora database migration command in {MigrationMode} mode.",
            command.Mode);

        if (!await dbContext.Database.CanConnectAsync(cancellationToken))
        {
            logger.LogError("Database migration command could not connect to PostgreSQL.");
            return DatabaseMigrationExitCode.Failure;
        }

        var appliedMigrations = await dbContext.Database
            .GetAppliedMigrationsAsync(cancellationToken);
        var pendingMigrations = (await dbContext.Database
                .GetPendingMigrationsAsync(cancellationToken))
            .ToArray();

        logger.LogInformation(
            "Database migration metadata read complete. AppliedCount={AppliedMigrationCount}; PendingCount={PendingMigrationCount}.",
            appliedMigrations.Count(),
            pendingMigrations.Length);

        if (pendingMigrations.Length > 0)
        {
            logger.LogWarning(
                "Pending database migrations: {PendingMigrations}",
                string.Join(", ", pendingMigrations));
        }

        if (command.Mode == DatabaseMigrationMode.ValidateOnly)
        {
            logger.LogInformation(
                "Database migration validate-only mode completed in {ElapsedMilliseconds} ms.",
                stopwatch.ElapsedMilliseconds);
            return DatabaseMigrationExitCode.Success;
        }

        if (!command.AppliesMigrations)
        {
            if (pendingMigrations.Length == 0)
            {
                logger.LogInformation(
                    "Database schema is up to date. Check-only mode completed in {ElapsedMilliseconds} ms.",
                    stopwatch.ElapsedMilliseconds);
                return DatabaseMigrationExitCode.Success;
            }

            logger.LogError(
                "Database schema has pending migrations and automatic application is disabled. Run migrate-database --mode=apply-safe or apply explicitly through the migration service.");
            return DatabaseMigrationExitCode.PendingMigrations;
        }

        if (pendingMigrations.Length == 0)
        {
            logger.LogInformation(
                "No pending database migrations. Apply mode completed in {ElapsedMilliseconds} ms.",
                stopwatch.ElapsedMilliseconds);
            return DatabaseMigrationExitCode.Success;
        }

        if (command.RequiresSafetyCheck)
        {
            var safetyAssessment = AssessPendingMigrations(pendingMigrations);
            if (!safetyAssessment.IsSafe)
            {
                logger.LogError(
                    "Database migration safety policy blocked automatic migration application. Reasons: {BlockedReasons}",
                    string.Join(" | ", safetyAssessment.Reasons));
                logger.LogError(
                    "Review the migration, take a backup, and rerun only with --mode=force-allow-destructive if the destructive schema change is explicitly accepted.");
                return DatabaseMigrationExitCode.UnsafeMigrationBlocked;
            }
        }
        else
        {
            logger.LogCritical(
                "Applying pending migrations with force-allow-destructive. This mode can run destructive schema changes and must only be used after explicit operator review and backup.");
        }

        logger.LogInformation(
            "Applying pending database migrations: {PendingMigrations}",
            string.Join(", ", pendingMigrations));

        await dbContext.Database.MigrateAsync(cancellationToken);

        logger.LogInformation(
            "Applied database migrations: {AppliedMigrations}",
            string.Join(", ", pendingMigrations));
        logger.LogInformation(
            "Database migration command completed successfully in {ElapsedMilliseconds} ms.",
            stopwatch.ElapsedMilliseconds);

        return DatabaseMigrationExitCode.Success;
    }

    private MigrationSafetyAssessment AssessPendingMigrations(
        IReadOnlyList<string> pendingMigrations)
    {
        var migrationsAssembly = dbContext.GetService<IMigrationsAssembly>();
        var activeProvider = dbContext.Database.ProviderName
            ?? throw new InvalidOperationException("EF Core provider name was unavailable.");
        var reasons = new List<string>();

        foreach (var migrationId in pendingMigrations)
        {
            if (!migrationsAssembly.Migrations.TryGetValue(migrationId, out var migrationType))
            {
                reasons.Add($"{migrationId}: migration type was not found in the API assembly.");
                continue;
            }

            var migration = migrationsAssembly.CreateMigration(
                migrationType,
                activeProvider);
            var assessment = safetyPolicy.Assess(migrationId, migration.UpOperations);

            if (!assessment.IsSafe)
            {
                reasons.AddRange(assessment.Reasons);
            }
        }

        return reasons.Count == 0
            ? MigrationSafetyAssessment.Safe
            : new MigrationSafetyAssessment(false, reasons);
    }
}
