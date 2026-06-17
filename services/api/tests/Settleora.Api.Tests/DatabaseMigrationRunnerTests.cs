using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.MigrationRunner;

namespace Settleora.Api.Tests;

public sealed class DatabaseMigrationRunnerTests
{
    [Theory]
    [InlineData("managed-auto", 0)]
    [InlineData("apply-safe", 1)]
    [InlineData("manual", 2)]
    [InlineData("check-only", 3)]
    [InlineData("validate-only", 4)]
    [InlineData("force-allow-destructive", 5)]
    public void ParsesDocumentedMigrationModes(
        string value,
        int expectedMode)
    {
        var actualMode = DatabaseMigrationCommandLine.ParseMode(value);

        Assert.Equal((DatabaseMigrationMode)expectedMode, actualMode);
    }

    [Fact]
    public void CheckOnlyModeDoesNotApplyMigrations()
    {
        var command = new DatabaseMigrationCommand(DatabaseMigrationMode.CheckOnly);

        Assert.False(command.AppliesMigrations);
        Assert.False(command.RequiresSafetyCheck);
    }

    [Fact]
    public void ManagedAutoModeAppliesOnlyAfterSafetyCheck()
    {
        var command = new DatabaseMigrationCommand(DatabaseMigrationMode.ManagedAuto);

        Assert.True(command.AppliesMigrations);
        Assert.True(command.RequiresSafetyCheck);
    }

    [Fact]
    public void ForceAllowDestructiveModeAppliesWithoutSafetyCheck()
    {
        var command = new DatabaseMigrationCommand(DatabaseMigrationMode.ForceAllowDestructive);

        Assert.True(command.AppliesMigrations);
        Assert.False(command.RequiresSafetyCheck);
    }

    [Fact]
    public void SafetyPolicyBlocksDropColumnByDefault()
    {
        var policy = new MigrationSafetyPolicy();

        var assessment = policy.Assess(
            "20260617000000_UnsafeDrop",
            new MigrationOperation[]
            {
                new DropColumnOperation
                {
                    Table = "expense_bills",
                    Name = "merchant_name"
                }
            });

        Assert.False(assessment.IsSafe);
        Assert.Contains(assessment.Reasons, reason => reason.Contains("DropColumnOperation", StringComparison.Ordinal));
    }

    [Fact]
    public void SafetyPolicyBlocksUnsafeSqlByDefault()
    {
        var policy = new MigrationSafetyPolicy();

        var assessment = policy.Assess(
            "20260617000001_UnsafeSql",
            new MigrationOperation[]
            {
                new SqlOperation
                {
                    Sql = "DELETE FROM auth_sessions;"
                }
            });

        Assert.False(assessment.IsSafe);
        Assert.Contains(assessment.Reasons, reason => reason.Contains("SqlOperation", StringComparison.Ordinal));
    }

    [Fact]
    public void SafetyPolicyAllowsCurrentRepositoryMigrationUpOperations()
    {
        using var dbContext = CreateDbContext();
        var migrationsAssembly = dbContext.GetService<IMigrationsAssembly>();
        var policy = new MigrationSafetyPolicy();
        var activeProvider = dbContext.Database.ProviderName
            ?? throw new InvalidOperationException("Provider name is required for migration creation.");

        foreach (var (migrationId, migrationType) in migrationsAssembly.Migrations)
        {
            var migration = migrationsAssembly.CreateMigration(
                migrationType,
                activeProvider);
            var assessment = policy.Assess(migrationId, migration.UpOperations);

            Assert.True(
                assessment.IsSafe,
                $"{migrationId} should be safe for managed-auto mode. Reasons: {string.Join(" | ", assessment.Reasons)}");
        }
    }

    private static SettleoraDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseNpgsql("Host=127.0.0.1;Database=settleora_migration_policy_tests;Username=settleora;Password=not-used")
            .Options;

        return new SettleoraDbContext(options);
    }
}
