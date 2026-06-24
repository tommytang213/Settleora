using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;

namespace Settleora.Api.Tests;

public sealed class AuthMfaPasskeySchemaFoundationTests
{
    [Fact]
    public void PasskeyCredentialModelUsesAccountScopedPublicKeyMaterialAndSafeLifecycleState()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<AuthPasskeyCredential>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("auth_passkey_credentials", null);

        Assert.Equal("auth_passkey_credentials", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "AuthAccountId", "auth_account_id", isNullable: false);
        AssertColumn(entity, storeObject, "CredentialIdHash", "credential_id_hash", isNullable: false, maxLength: 256);
        AssertColumn(entity, storeObject, "PublicKeyCose", "public_key_cose", isNullable: false, maxLength: 8192);
        AssertColumn(entity, storeObject, "UserHandleHash", "user_handle_hash", isNullable: true, maxLength: 128);
        AssertColumn(entity, storeObject, "SignatureCounter", "signature_counter", isNullable: true);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 16);
        AssertColumn(entity, storeObject, "LastReplaySuspectedAtUtc", "last_replay_suspected_at_utc", isNullable: true);
        AssertColumn(entity, storeObject, "LastStatusChangeCorrelationId", "last_status_change_correlation_id", isNullable: true, maxLength: 120);

        AssertIndex(entity, "ux_auth_passkey_credentials_credential_id_hash", ["CredentialIdHash"], isUnique: true);
        AssertIndex(entity, "ix_auth_passkey_credentials_account_status", ["AuthAccountId", "Status"], isUnique: false);
        AssertForeignKey(entity, typeof(AuthAccount), ["AuthAccountId"], DeleteBehavior.Restrict);
        AssertForeignKey(entity, typeof(AuthAccount), ["LastStatusChangedByAuthAccountId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_auth_passkey_credentials_status",
            "status IN ('pending', 'enrolled', 'disabled', 'revoked')");
        AssertCheckConstraint(
            entity,
            "ck_auth_passkey_credentials_credential_hash_not_blank",
            "length(btrim(credential_id_hash)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_auth_passkey_credentials_public_key_not_blank",
            "length(btrim(public_key_cose)) > 0");
    }

    [Fact]
    public void MfaFactorModelUsesProtectedTotpSecretBoundaryMetadataWithoutPlaintextColumn()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<AuthMfaFactor>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("auth_mfa_factors", null);

        Assert.Equal("auth_mfa_factors", entity.GetTableName());

        AssertColumn(entity, storeObject, "AuthAccountId", "auth_account_id", isNullable: false);
        AssertColumn(entity, storeObject, "FactorType", "factor_type", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 16);
        AssertColumn(entity, storeObject, "TotpSecretStorageKind", "totp_secret_storage_kind", isNullable: true, maxLength: 32);
        AssertColumn(
            entity,
            storeObject,
            "TotpProtectedSecretReference",
            "totp_protected_secret_reference",
            isNullable: true,
            maxLength: 256);
        AssertColumn(
            entity,
            storeObject,
            "TotpEncryptedSecretPayload",
            "totp_encrypted_secret_payload",
            isNullable: true,
            maxLength: 8192);
        AssertColumn(entity, storeObject, "TotpDigits", "totp_digits", isNullable: true);
        AssertColumn(entity, storeObject, "TotpPeriodSeconds", "totp_period_seconds", isNullable: true);

        Assert.DoesNotContain(
            entity.GetProperties(),
            property => property.GetColumnName(storeObject)!.Contains("plaintext", StringComparison.OrdinalIgnoreCase)
                || property.GetColumnName(storeObject)!.Equals("totp_secret", StringComparison.OrdinalIgnoreCase));

        AssertIndex(entity, "ix_auth_mfa_factors_account_type_status", ["AuthAccountId", "FactorType", "Status"], isUnique: false);
        AssertForeignKey(entity, typeof(AuthAccount), ["AuthAccountId"], DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_auth_mfa_factors_no_plaintext_totp_secret_pair",
            "(totp_secret_storage_kind = 'protected_reference' AND totp_protected_secret_reference IS NOT NULL AND totp_encrypted_secret_payload IS NULL) OR (totp_secret_storage_kind = 'encrypted_payload' AND totp_encrypted_secret_payload IS NOT NULL AND totp_protected_secret_reference IS NULL) OR ((totp_secret_storage_kind IS NULL OR totp_secret_storage_kind = 'none') AND totp_protected_secret_reference IS NULL AND totp_encrypted_secret_payload IS NULL)");
    }

    [Fact]
    public void RecoveryChallengeAndPolicyModelsUseVerifierOnlyAndRestrictiveRelationships()
    {
        using var dbContext = CreateDbContext();

        var verifier = FindEntityType<AuthRecoveryCodeVerifier>(dbContext);
        var verifierStoreObject = StoreObjectIdentifier.Table("auth_recovery_code_verifiers", null);
        AssertColumn(verifier, verifierStoreObject, "VerifierHash", "verifier_hash", isNullable: false, maxLength: 256);
        AssertColumn(verifier, verifierStoreObject, "VerifierSalt", "verifier_salt", isNullable: false, maxLength: 128);
        Assert.DoesNotContain(
            verifier.GetProperties(),
            property => property.GetColumnName(verifierStoreObject)!.Contains("raw", StringComparison.OrdinalIgnoreCase)
                || property.GetColumnName(verifierStoreObject)!.Contains("code_text", StringComparison.OrdinalIgnoreCase));
        AssertForeignKey(verifier, typeof(AuthRecoveryCodeBatch), ["AuthRecoveryCodeBatchId"], DeleteBehavior.Restrict);
        AssertForeignKey(verifier, typeof(AuthAccount), ["AuthAccountId"], DeleteBehavior.Restrict);
        AssertForeignKey(verifier, typeof(AuthChallenge), ["ConsumedByAuthChallengeId"], DeleteBehavior.Restrict);

        var challenge = FindEntityType<AuthChallenge>(dbContext);
        var challengeStoreObject = StoreObjectIdentifier.Table("auth_challenges", null);
        AssertColumn(challenge, challengeStoreObject, "ChallengeVerifierHash", "challenge_verifier_hash", isNullable: false, maxLength: 256);
        AssertColumn(challenge, challengeStoreObject, "ExpiresAtUtc", "expires_at_utc", isNullable: false);
        AssertColumn(challenge, challengeStoreObject, "ReplayDetectedAtUtc", "replay_detected_at_utc", isNullable: true);
        AssertCheckConstraint(
            challenge,
            "ck_auth_challenges_expiry_after_created",
            "expires_at_utc > created_at_utc");

        var policy = FindEntityType<AuthSecurityPolicy>(dbContext);
        AssertIndex(policy, "ux_auth_security_policies_policy_version", ["PolicyVersion"], isUnique: true);
        AssertForeignKey(policy, typeof(AuthAccount), ["ChangedByAuthAccountId"], DeleteBehavior.Restrict);
    }

    [Fact]
    public void AuthMfaPasskeyMigrationCreatesOnlyAdditiveAuthSchemaOperations()
    {
        using var dbContext = CreateDbContext();
        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddAuthMfaPasskeySchemaFoundation", StringComparison.Ordinal));

        var migration = new AddAuthMfaPasskeySchemaFoundation();

        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropForeignKeyOperation
                or DropIndexOperation
                or AlterColumnOperation
                or SqlOperation);

        var createTables = migration.UpOperations.OfType<CreateTableOperation>().ToArray();
        Assert.Equal(
            [
                "auth_challenges",
                "auth_mfa_factors",
                "auth_passkey_credentials",
                "auth_recovery_code_batches",
                "auth_recovery_code_verifiers",
                "auth_security_policies"
            ],
            createTables.Select(table => table.Name).Order().ToArray());

        Assert.All(
            createTables.SelectMany(table => table.Columns).Where(column => column.ClrType == typeof(string)),
            column => Assert.NotNull(column.MaxLength));

        Assert.Contains(
            migration.UpOperations.OfType<CreateIndexOperation>(),
            index => index.Table == "auth_recovery_code_verifiers"
                && index.Name == "ux_auth_recovery_code_verifiers_hash"
                && index.IsUnique
                && index.Columns.SequenceEqual(["verifier_hash"]));
    }

    private static SettleoraDbContext CreateDbContext()
    {
        return new SettleoraDbContext(new DbContextOptionsBuilder<SettleoraDbContext>()
            .UseNpgsql("Host=localhost;Database=settleora_schema_test;Username=settleora;Password=settleora")
            .Options);
    }

    private static IEntityType FindEntityType<TEntity>(SettleoraDbContext dbContext)
    {
        var entity = dbContext.GetService<IDesignTimeModel>().Model.FindEntityType(typeof(TEntity));
        Assert.NotNull(entity);
        return entity;
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
        Assert.Equal(columnName, property.GetColumnName(storeObject));
        Assert.Equal(isNullable, property.IsColumnNullable(storeObject));
        Assert.Equal(maxLength, property.GetMaxLength());
    }

    private static void AssertIndex(
        IEntityType entity,
        string databaseName,
        IReadOnlyList<string> propertyNames,
        bool isUnique)
    {
        var index = Assert.Single(
            entity.GetIndexes(),
            index => index.GetDatabaseName() == databaseName
                && index.Properties.Select(property => property.Name).SequenceEqual(propertyNames));
        Assert.Equal(isUnique, index.IsUnique);
    }

    private static void AssertForeignKey(
        IEntityType entity,
        Type principalType,
        IReadOnlyList<string> propertyNames,
        DeleteBehavior deleteBehavior)
    {
        var foreignKey = Assert.Single(
            entity.GetForeignKeys(),
            key => key.PrincipalEntityType.ClrType == principalType
                && key.Properties.Select(property => property.Name).SequenceEqual(propertyNames));
        Assert.Equal(deleteBehavior, foreignKey.DeleteBehavior);
    }

    private static void AssertCheckConstraint(IEntityType entity, string name, string sql)
    {
        var checkConstraint = Assert.Single(entity.GetCheckConstraints(), constraint => constraint.Name == name);
        Assert.Equal(sql, checkConstraint.Sql);
    }
}
