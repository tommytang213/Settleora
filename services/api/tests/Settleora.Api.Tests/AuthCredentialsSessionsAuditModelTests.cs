using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.Configuration;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class AuthCredentialsSessionsAuditModelTests
{
    private static readonly Type[] NewAuthSchemaEntityTypes =
    [
        typeof(LocalPasswordCredential),
        typeof(AuthSession),
        typeof(AuthSessionFamily),
        typeof(AuthRefreshCredential),
        typeof(AuthAuditEvent)
    ];

    [Fact]
    public void LocalPasswordCredentialModelUsesAccountScopedHashMetadataAndRestrictiveDeleteBehavior()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<LocalPasswordCredential>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("local_password_credentials", null);

        Assert.Equal("local_password_credentials", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "AuthAccountId", "auth_account_id", isNullable: false);
        AssertColumn(entity, storeObject, "PasswordHash", "password_hash", isNullable: false, maxLength: 512);
        AssertColumn(entity, storeObject, "PasswordHashAlgorithm", "password_hash_algorithm", isNullable: false, maxLength: 64);
        AssertColumn(entity, storeObject, "PasswordHashAlgorithmVersion", "password_hash_algorithm_version", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "PasswordHashParameters", "password_hash_parameters", isNullable: false, maxLength: 1024);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 16);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "LastVerifiedAtUtc", "last_verified_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "RevokedAtUtc", "revoked_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "RequiresRehash", "requires_rehash", isNullable: false);

        AssertIndex(
            entity,
            "ux_local_password_credentials_auth_account_id",
            ["AuthAccountId"],
            isUnique: true);

        AssertForeignKey(
            entity,
            typeof(AuthAccount),
            ["AuthAccountId"],
            DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_local_password_credentials_status",
            "status IN ('active', 'disabled', 'revoked')");
        AssertCheckConstraint(
            entity,
            "ck_local_password_credentials_hash_not_blank",
            "length(btrim(password_hash)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_local_password_credentials_hash_algorithm_not_blank",
            "length(btrim(password_hash_algorithm)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_local_password_credentials_hash_algorithm_version_not_blank",
            "length(btrim(password_hash_algorithm_version)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_local_password_credentials_hash_parameters_not_blank",
            "length(btrim(password_hash_parameters)) > 0");
    }

    [Fact]
    public void AuthSessionModelUsesHashedTokenStateAndRestrictiveDeleteBehavior()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<AuthSession>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("auth_sessions", null);

        Assert.Equal("auth_sessions", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "AuthAccountId", "auth_account_id", isNullable: false);
        AssertColumn(entity, storeObject, "SessionTokenHash", "session_token_hash", isNullable: false, maxLength: 128);
        AssertColumn(entity, storeObject, "RefreshTokenHash", "refresh_token_hash", isNullable: true, maxLength: 128);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 16);
        AssertColumn(entity, storeObject, "IssuedAtUtc", "issued_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "ExpiresAtUtc", "expires_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "LastSeenAtUtc", "last_seen_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "RevokedAtUtc", "revoked_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "RevocationReason", "revocation_reason", isNullable: true, maxLength: 120);
        AssertColumn(entity, storeObject, "DeviceLabel", "device_label", isNullable: true, maxLength: 120);
        AssertColumn(entity, storeObject, "UserAgentSummary", "user_agent_summary", isNullable: true, maxLength: 320);
        AssertColumn(entity, storeObject, "NetworkAddressHash", "network_address_hash", isNullable: true, maxLength: 128);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);

        AssertIndex(
            entity,
            "ix_auth_sessions_auth_account_id",
            ["AuthAccountId"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_auth_sessions_expires_at_utc",
            ["ExpiresAtUtc"],
            isUnique: false);
        AssertIndex(
            entity,
            "ux_auth_sessions_session_token_hash",
            ["SessionTokenHash"],
            isUnique: true);
        var refreshTokenHashIndex = AssertIndex(
            entity,
            "ux_auth_sessions_refresh_token_hash",
            ["RefreshTokenHash"],
            isUnique: true);
        Assert.Equal("refresh_token_hash IS NOT NULL", refreshTokenHashIndex.GetFilter());

        AssertForeignKey(
            entity,
            typeof(AuthAccount),
            ["AuthAccountId"],
            DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_auth_sessions_status",
            "status IN ('active', 'revoked', 'expired')");
        AssertCheckConstraint(
            entity,
            "ck_auth_sessions_session_token_hash_not_blank",
            "length(btrim(session_token_hash)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_auth_sessions_refresh_token_hash_not_blank",
            "refresh_token_hash IS NULL OR length(btrim(refresh_token_hash)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_auth_sessions_network_address_hash_not_blank",
            "network_address_hash IS NULL OR length(btrim(network_address_hash)) > 0");
    }

    [Fact]
    public void AuthAuditEventModelUsesBoundedSafeMetadataAndRestrictiveDeleteBehavior()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<AuthAuditEvent>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("auth_audit_events", null);

        Assert.Equal("auth_audit_events", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "ActorAuthAccountId", "actor_auth_account_id", isNullable: true);
        AssertColumn(entity, storeObject, "SubjectAuthAccountId", "subject_auth_account_id", isNullable: true);
        AssertColumn(entity, storeObject, "Action", "action", isNullable: false, maxLength: 120);
        AssertColumn(entity, storeObject, "Outcome", "outcome", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "OccurredAtUtc", "occurred_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "CorrelationId", "correlation_id", isNullable: true, maxLength: 120);
        AssertColumn(entity, storeObject, "RequestId", "request_id", isNullable: true, maxLength: 120);
        AssertColumn(entity, storeObject, "SafeMetadataJson", "safe_metadata_json", isNullable: true, maxLength: 4096);

        AssertIndex(
            entity,
            "ix_auth_audit_events_occurred_at_utc",
            ["OccurredAtUtc"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_auth_audit_events_actor_auth_account_id",
            ["ActorAuthAccountId"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_auth_audit_events_subject_auth_account_id",
            ["SubjectAuthAccountId"],
            isUnique: false);

        AssertForeignKey(
            entity,
            typeof(AuthAccount),
            ["ActorAuthAccountId"],
            DeleteBehavior.Restrict);
        AssertForeignKey(
            entity,
            typeof(AuthAccount),
            ["SubjectAuthAccountId"],
            DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_auth_audit_events_outcome",
            "outcome IN ('success', 'failure', 'denied', 'revoked', 'expired', 'blocked_by_policy')");
        AssertCheckConstraint(
            entity,
            "ck_auth_audit_events_action_not_blank",
            "length(btrim(action)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_auth_audit_events_safe_metadata_json_not_blank",
            "safe_metadata_json IS NULL OR length(btrim(safe_metadata_json)) > 0");
    }

    [Fact]
    public void AuthSessionFamilyModelUsesAccountScopedRefreshLineageAndRestrictiveDeleteBehavior()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<AuthSessionFamily>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("auth_session_families", null);

        Assert.Equal("auth_session_families", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "AuthAccountId", "auth_account_id", isNullable: false);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 16);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "AbsoluteExpiresAtUtc", "absolute_expires_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "LastRotatedAtUtc", "last_rotated_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "RevokedAtUtc", "revoked_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "RevocationReason", "revocation_reason", isNullable: true, maxLength: 120);

        AssertIndex(
            entity,
            "ix_auth_session_families_auth_account_id",
            ["AuthAccountId"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_auth_session_families_status",
            ["Status"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_auth_session_families_absolute_expires_at_utc",
            ["AbsoluteExpiresAtUtc"],
            isUnique: false);

        AssertForeignKey(
            entity,
            typeof(AuthAccount),
            ["AuthAccountId"],
            DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_auth_session_families_status",
            "status IN ('active', 'revoked', 'expired', 'replayed')");
        AssertCheckConstraint(
            entity,
            "ck_auth_session_families_revocation_reason_not_blank",
            "revocation_reason IS NULL OR length(btrim(revocation_reason)) > 0");
    }

    [Fact]
    public void AuthRefreshCredentialModelUsesHashedHistoryAndRestrictiveDeleteBehavior()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<AuthRefreshCredential>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("auth_refresh_credentials", null);

        Assert.Equal("auth_refresh_credentials", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "AuthSessionFamilyId", "auth_session_family_id", isNullable: false);
        AssertColumn(entity, storeObject, "AuthSessionId", "auth_session_id", isNullable: true);
        AssertColumn(entity, storeObject, "RefreshTokenHash", "refresh_token_hash", isNullable: false, maxLength: 128);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 16);
        AssertColumn(entity, storeObject, "IssuedAtUtc", "issued_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "IdleExpiresAtUtc", "idle_expires_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "AbsoluteExpiresAtUtc", "absolute_expires_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "ConsumedAtUtc", "consumed_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "RevokedAtUtc", "revoked_at_utc", isNullable: true);
        AssertColumn(
            entity,
            storeObject,
            "ReplacedByRefreshCredentialId",
            "replaced_by_refresh_credential_id",
            isNullable: true);
        AssertColumn(entity, storeObject, "RevocationReason", "revocation_reason", isNullable: true, maxLength: 120);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);

        AssertIndex(
            entity,
            "ix_auth_refresh_credentials_auth_session_family_id",
            ["AuthSessionFamilyId"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_auth_refresh_credentials_auth_session_id",
            ["AuthSessionId"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_auth_refresh_credentials_family_status",
            ["AuthSessionFamilyId", "Status"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_auth_refresh_credentials_idle_expires_at_utc",
            ["IdleExpiresAtUtc"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_auth_refresh_credentials_absolute_expires_at_utc",
            ["AbsoluteExpiresAtUtc"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_auth_refresh_credentials_consumed_at_utc",
            ["ConsumedAtUtc"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_auth_refresh_credentials_replaced_by_id",
            ["ReplacedByRefreshCredentialId"],
            isUnique: false);
        AssertIndex(
            entity,
            "ux_auth_refresh_credentials_refresh_token_hash",
            ["RefreshTokenHash"],
            isUnique: true);

        AssertForeignKey(
            entity,
            typeof(AuthSessionFamily),
            ["AuthSessionFamilyId"],
            DeleteBehavior.Restrict);
        AssertForeignKey(
            entity,
            typeof(AuthSession),
            ["AuthSessionId"],
            DeleteBehavior.Restrict);
        AssertForeignKey(
            entity,
            typeof(AuthRefreshCredential),
            ["ReplacedByRefreshCredentialId"],
            DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_auth_refresh_credentials_status",
            "status IN ('active', 'rotated', 'revoked', 'expired', 'replayed')");
        AssertCheckConstraint(
            entity,
            "ck_auth_refresh_credentials_hash_not_blank",
            "length(btrim(refresh_token_hash)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_auth_refresh_credentials_revocation_reason_not_blank",
            "revocation_reason IS NULL OR length(btrim(revocation_reason)) > 0");
    }

    [Fact]
    public void AuthCredentialsSessionsAuditMigrationCreatesReviewableSchemaOperations()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith(
                "_AddAuthCredentialsSessionsAuditSchemaFoundation",
                StringComparison.Ordinal));

        var migration = new AddAuthCredentialsSessionsAuditSchemaFoundation();
        var createTables = migration.UpOperations
            .OfType<CreateTableOperation>()
            .Where(operation => operation.Name is
                "local_password_credentials" or
                "auth_sessions" or
                "auth_audit_events")
            .ToList();

        Assert.Equal(
            ["auth_audit_events", "auth_sessions", "local_password_credentials"],
            createTables.Select(operation => operation.Name).Order());

        var localPasswordCredentials = Assert.Single(
            createTables,
            table => table.Name == "local_password_credentials");
        Assert.Equal(["id"], localPasswordCredentials.PrimaryKey!.Columns);
        Assert.Contains(
            localPasswordCredentials.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "auth_accounts"
                && foreignKey.Columns.SequenceEqual(["auth_account_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);

        var authSessions = Assert.Single(createTables, table => table.Name == "auth_sessions");
        Assert.Equal(["id"], authSessions.PrimaryKey!.Columns);
        Assert.Contains(
            authSessions.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "auth_accounts"
                && foreignKey.Columns.SequenceEqual(["auth_account_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);

        var auditEvents = Assert.Single(createTables, table => table.Name == "auth_audit_events");
        Assert.Equal(["id"], auditEvents.PrimaryKey!.Columns);
        Assert.All(
            auditEvents.ForeignKeys,
            foreignKey => Assert.Equal(ReferentialAction.Restrict, foreignKey.OnDelete));
        Assert.Contains(
            auditEvents.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "auth_accounts"
                && foreignKey.Columns.SequenceEqual(["actor_auth_account_id"]));
        Assert.Contains(
            auditEvents.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "auth_accounts"
                && foreignKey.Columns.SequenceEqual(["subject_auth_account_id"]));

        Assert.All(
            createTables.SelectMany(table => table.Columns).Where(column => column.ClrType == typeof(string)),
            column => Assert.NotNull(column.MaxLength));

        var indexes = migration.UpOperations.OfType<CreateIndexOperation>();
        Assert.Contains(
            indexes,
            index => index.Table == "local_password_credentials"
                && index.Name == "ux_local_password_credentials_auth_account_id"
                && index.IsUnique
                && index.Columns.SequenceEqual(["auth_account_id"]));
        Assert.Contains(
            indexes,
            index => index.Table == "auth_sessions"
                && index.Name == "ux_auth_sessions_session_token_hash"
                && index.IsUnique
                && index.Columns.SequenceEqual(["session_token_hash"]));
        Assert.Contains(
            indexes,
            index => index.Table == "auth_sessions"
                && index.Name == "ux_auth_sessions_refresh_token_hash"
                && index.IsUnique
                && index.Filter == "refresh_token_hash IS NOT NULL"
                && index.Columns.SequenceEqual(["refresh_token_hash"]));
        Assert.Contains(
            indexes,
            index => index.Table == "auth_audit_events"
                && index.Name == "ix_auth_audit_events_occurred_at_utc"
                && !index.IsUnique
                && index.Columns.SequenceEqual(["occurred_at_utc"]));
    }

    [Fact]
    public void RefreshSessionFamilyMigrationCreatesReviewableSchemaOperations()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith(
                "_AddRefreshSessionFamilySchemaFoundation",
                StringComparison.Ordinal));

        var migration = new AddRefreshSessionFamilySchemaFoundation();

        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropIndexOperation
                or DropForeignKeyOperation
                or AlterColumnOperation
                or SqlOperation);

        var createTables = migration.UpOperations
            .OfType<CreateTableOperation>()
            .Where(operation => operation.Name is "auth_session_families" or "auth_refresh_credentials")
            .ToList();

        Assert.Equal(
            ["auth_refresh_credentials", "auth_session_families"],
            createTables.Select(operation => operation.Name).Order());

        var sessionFamilies = Assert.Single(createTables, table => table.Name == "auth_session_families");
        Assert.Equal(["id"], sessionFamilies.PrimaryKey!.Columns);
        Assert.Contains(
            sessionFamilies.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "auth_accounts"
                && foreignKey.Columns.SequenceEqual(["auth_account_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);

        var refreshCredentials = Assert.Single(createTables, table => table.Name == "auth_refresh_credentials");
        Assert.Equal(["id"], refreshCredentials.PrimaryKey!.Columns);
        Assert.Contains(
            refreshCredentials.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "auth_session_families"
                && foreignKey.Columns.SequenceEqual(["auth_session_family_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(
            refreshCredentials.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "auth_sessions"
                && foreignKey.Columns.SequenceEqual(["auth_session_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(
            refreshCredentials.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "auth_refresh_credentials"
                && foreignKey.Columns.SequenceEqual(["replaced_by_refresh_credential_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);

        Assert.All(
            createTables.SelectMany(table => table.Columns).Where(column => column.ClrType == typeof(string)),
            column => Assert.NotNull(column.MaxLength));

        var indexes = migration.UpOperations.OfType<CreateIndexOperation>();
        Assert.Contains(
            indexes,
            index => index.Table == "auth_refresh_credentials"
                && index.Name == "ux_auth_refresh_credentials_refresh_token_hash"
                && index.IsUnique
                && index.Columns.SequenceEqual(["refresh_token_hash"]));
        Assert.Contains(
            indexes,
            index => index.Table == "auth_refresh_credentials"
                && index.Name == "ix_auth_refresh_credentials_family_status"
                && !index.IsUnique
                && index.Columns.SequenceEqual(["auth_session_family_id", "status"]));
        Assert.Contains(
            indexes,
            index => index.Table == "auth_refresh_credentials"
                && index.Name == "ix_auth_refresh_credentials_consumed_at_utc"
                && !index.IsUnique
                && index.Columns.SequenceEqual(["consumed_at_utc"]));
        Assert.Contains(
            indexes,
            index => index.Table == "auth_session_families"
                && index.Name == "ix_auth_session_families_auth_account_id"
                && !index.IsUnique
                && index.Columns.SequenceEqual(["auth_account_id"]));
    }

    [Fact]
    public void AuthCredentialsSessionsAuditSchemaKeepsSecretSafetyBoundaries()
    {
        using var dbContext = CreateDbContext();

        var modelColumnNames = NewAuthSchemaEntityTypes.SelectMany(entityType =>
        {
            var entity = FindEntityType(dbContext, entityType);
            var storeObject = StoreObjectIdentifier.Table(entity.GetTableName()!, entity.GetSchema());

            return entity.GetProperties()
                .Select(property => property.GetColumnName(storeObject) ?? property.Name);
        });

        AssertSecretSafetyColumns(modelColumnNames);

        var migration = new AddAuthCredentialsSessionsAuditSchemaFoundation();
        var migrationColumnNames = migration.UpOperations
            .OfType<CreateTableOperation>()
            .Where(operation => operation.Name is
                "local_password_credentials" or
                "auth_sessions" or
                "auth_audit_events")
            .SelectMany(operation => operation.Columns.Select(column => column.Name));

        AssertSecretSafetyColumns(migrationColumnNames);

        var auditColumnNames = GetColumnNames<AuthAuditEvent>(dbContext);
        Assert.DoesNotContain(
            auditColumnNames,
            columnName => columnName.Contains("password", StringComparison.OrdinalIgnoreCase)
                || columnName.Contains("hash", StringComparison.OrdinalIgnoreCase)
                || columnName.Contains("token", StringComparison.OrdinalIgnoreCase)
                || columnName.Contains("secret", StringComparison.OrdinalIgnoreCase)
                || columnName.Contains("passkey", StringComparison.OrdinalIgnoreCase)
                || columnName.Contains("mfa", StringComparison.OrdinalIgnoreCase));
    }

    private static SettleoraDbContext CreateDbContext()
    {
        Dictionary<string, string?> values = new()
        {
            ["Settleora:Database:ConnectionString"] =
                "Host=localhost;Port=5432;Database=settleora;Username=settleora;Password=settleora_dev_password"
        };

        IConfiguration configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        return SettleoraDbContextDesignTimeFactory.CreateDbContext(configuration);
    }

    private static IEntityType FindEntityType<TEntity>(SettleoraDbContext dbContext)
    {
        return FindEntityType(dbContext, typeof(TEntity));
    }

    private static IEntityType FindEntityType(SettleoraDbContext dbContext, Type entityType)
    {
        var entity = dbContext.GetService<IDesignTimeModel>()
            .Model
            .FindEntityType(entityType);

        Assert.NotNull(entity);
        return entity!;
    }

    private static string[] GetColumnNames<TEntity>(SettleoraDbContext dbContext)
    {
        var entity = FindEntityType<TEntity>(dbContext);
        var storeObject = StoreObjectIdentifier.Table(entity.GetTableName()!, entity.GetSchema());

        return entity.GetProperties()
            .Select(property => property.GetColumnName(storeObject) ?? property.Name)
            .ToArray();
    }

    private static void AssertColumn(
        IEntityType entity,
        StoreObjectIdentifier storeObject,
        string propertyName,
        string columnName,
        bool isNullable,
        int? maxLength = null)
    {
        var property = entity.FindProperty(propertyName);

        Assert.NotNull(property);
        Assert.Equal(columnName, property!.GetColumnName(storeObject));
        Assert.Equal(isNullable, property.IsNullable);
        Assert.Equal(maxLength, property.GetMaxLength());
    }

    private static IIndex AssertIndex(
        IEntityType entity,
        string indexName,
        string[] propertyNames,
        bool isUnique)
    {
        var index = Assert.Single(
            entity.GetIndexes(),
            index => index.GetDatabaseName() == indexName);

        Assert.Equal(propertyNames, index.Properties.Select(property => property.Name));
        Assert.Equal(isUnique, index.IsUnique);
        return index;
    }

    private static void AssertForeignKey(
        IEntityType entity,
        Type principalType,
        string[] propertyNames,
        DeleteBehavior deleteBehavior)
    {
        var foreignKey = Assert.Single(
            entity.GetForeignKeys(),
            foreignKey => foreignKey.PrincipalEntityType.ClrType == principalType
                && foreignKey.Properties.Select(property => property.Name).SequenceEqual(propertyNames));

        Assert.Equal(deleteBehavior, foreignKey.DeleteBehavior);
    }

    private static void AssertCheckConstraint(
        IEntityType entity,
        string constraintName,
        string sql)
    {
        var constraint = Assert.Single(
            entity.GetCheckConstraints(),
            checkConstraint => checkConstraint.Name == constraintName);

        Assert.Equal(sql, constraint.Sql);
    }

    private static void AssertSecretSafetyColumns(IEnumerable<string> columnNames)
    {
        var columns = columnNames.ToArray();

        Assert.DoesNotContain(
            columns,
            columnName => columnName.Contains("plaintext", StringComparison.OrdinalIgnoreCase)
                || columnName.Contains("raw_", StringComparison.OrdinalIgnoreCase)
                || columnName.Contains("bearer", StringComparison.OrdinalIgnoreCase)
                || columnName.Contains("secret", StringComparison.OrdinalIgnoreCase)
                || columnName.Contains("passkey", StringComparison.OrdinalIgnoreCase)
                || columnName.Contains("mfa", StringComparison.OrdinalIgnoreCase)
                || columnName.Contains("recovery_code", StringComparison.OrdinalIgnoreCase)
                || columnName.Contains("reset_token", StringComparison.OrdinalIgnoreCase)
                || columnName.Contains("provider_payload", StringComparison.OrdinalIgnoreCase));

        var passwordColumns = columns
            .Where(columnName => columnName.Contains("password", StringComparison.OrdinalIgnoreCase))
            .Order()
            .ToArray();
        Assert.Equal(
            ["password_hash", "password_hash_algorithm", "password_hash_algorithm_version", "password_hash_parameters"],
            passwordColumns);

        var tokenColumns = columns
            .Where(columnName => columnName.Contains("token", StringComparison.OrdinalIgnoreCase))
            .ToArray();
        Assert.All(
            tokenColumns,
            columnName => Assert.EndsWith("_token_hash", columnName, StringComparison.Ordinal));
    }
}
