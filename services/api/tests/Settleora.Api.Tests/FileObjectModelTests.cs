using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.Configuration;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Users;
using Settleora.Api.Persistence;
using Settleora.Api.Persistence.Migrations;
using Settleora.Api.Storage;

namespace Settleora.Api.Tests;

public sealed class FileObjectModelTests
{
    [Fact]
    public void FileObjectConstantsRepresentApprovedCategories()
    {
        Assert.Equal(40, FileObjectConstraints.PurposeMaxLength);
        Assert.Equal(32, FileObjectConstraints.StatusMaxLength);
        Assert.Equal(120, FileObjectConstraints.ContentTypeMaxLength);
        Assert.Equal(255, FileObjectConstraints.OriginalFilenameMaxLength);
        Assert.Equal(64, FileObjectConstraints.Sha256HashMaxLength);
        Assert.Equal(40, FileObjectConstraints.StorageProviderMaxLength);
        Assert.Equal(512, FileObjectConstraints.StorageObjectKeyMaxLength);
        Assert.Equal(40, FileObjectConstraints.EncryptionModeMaxLength);
        Assert.Equal(255, FileObjectConstraints.VaultKeyRefMaxLength);
        Assert.Equal(120, FileObjectConstraints.RetentionPolicyMaxLength);

        Assert.True(FileObjectPurposes.IsSupported(FileObjectPurposes.ReceiptImage));
        Assert.True(FileObjectPurposes.IsSupported(FileObjectPurposes.OcrSource));
        Assert.True(FileObjectPurposes.IsSupported(FileObjectPurposes.SettlementProof));
        Assert.True(FileObjectPurposes.IsSupported(FileObjectPurposes.PaymentQr));
        Assert.True(FileObjectPurposes.IsSupported(FileObjectPurposes.StatementUpload));
        Assert.True(FileObjectPurposes.IsSupported(FileObjectPurposes.ExportFile));
        Assert.True(FileObjectPurposes.IsSupported(FileObjectPurposes.SupportingAttachment));
        Assert.False(FileObjectPurposes.IsSupported("public_avatar"));

        Assert.True(FileObjectStatuses.IsSupported(FileObjectStatuses.Pending));
        Assert.True(FileObjectStatuses.IsSupported(FileObjectStatuses.Active));
        Assert.True(FileObjectStatuses.IsSupported(FileObjectStatuses.Quarantined));
        Assert.True(FileObjectStatuses.IsSupported(FileObjectStatuses.Deleted));
        Assert.True(FileObjectStatuses.IsSupported(FileObjectStatuses.Purged));
        Assert.True(FileObjectStatuses.IsSupported(FileObjectStatuses.UploadFailed));
        Assert.False(FileObjectStatuses.IsSupported("visible"));

        Assert.True(FileObjectEncryptionModes.IsSupported(FileObjectEncryptionModes.ServerManaged));
        Assert.True(FileObjectEncryptionModes.IsSupported(FileObjectEncryptionModes.RecoverableUserVault));
        Assert.True(FileObjectEncryptionModes.IsSupported(FileObjectEncryptionModes.StrictUserVaultFuture));
        Assert.False(FileObjectEncryptionModes.IsSupported("client_path"));
    }

    [Fact]
    public void FileObjectModelUsesBoundedMetadataTableAndRestrictiveDeleteBehavior()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<FileObject>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("file_objects", null);

        Assert.Equal("file_objects", entity.GetTableName());
        Assert.Equal(["Id"], entity.FindPrimaryKey()!.Properties.Select(property => property.Name));

        AssertColumn(entity, storeObject, "Id", "id", isNullable: false);
        AssertColumn(entity, storeObject, "OwnerUserProfileId", "owner_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "CreatedByUserProfileId", "created_by_user_profile_id", isNullable: false);
        AssertColumn(entity, storeObject, "Purpose", "purpose", isNullable: false, maxLength: 40);
        AssertColumn(entity, storeObject, "Status", "status", isNullable: false, maxLength: 32);
        AssertColumn(entity, storeObject, "ContentType", "content_type", isNullable: false, maxLength: 120);
        AssertColumn(entity, storeObject, "OriginalFilename", "original_filename", isNullable: true, maxLength: 255);
        AssertColumn(entity, storeObject, "SizeBytes", "size_bytes", isNullable: false);
        AssertColumn(entity, storeObject, "Sha256Hash", "sha256_hash", isNullable: true, maxLength: 64);
        AssertColumn(entity, storeObject, "StorageProvider", "storage_provider", isNullable: false, maxLength: 40);
        AssertColumn(entity, storeObject, "StorageObjectKey", "storage_object_key", isNullable: false, maxLength: 512);
        AssertColumn(entity, storeObject, "EncryptionMode", "encryption_mode", isNullable: false, maxLength: 40);
        AssertColumn(entity, storeObject, "VaultKeyRef", "vault_key_ref", isNullable: true, maxLength: 255);
        AssertColumn(entity, storeObject, "RetentionPolicy", "retention_policy", isNullable: true, maxLength: 120);
        AssertColumn(entity, storeObject, "CreatedAtUtc", "created_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "UpdatedAtUtc", "updated_at_utc", isNullable: false);
        AssertColumn(entity, storeObject, "DeletedAtUtc", "deleted_at_utc", isNullable: true);

        AssertIndex(
            entity,
            "ix_file_objects_owner_user_profile_id",
            ["OwnerUserProfileId"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_file_objects_created_by_user_profile_id",
            ["CreatedByUserProfileId"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_file_objects_purpose_status",
            ["Purpose", "Status"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_file_objects_created_at_utc",
            ["CreatedAtUtc"],
            isUnique: false);
        AssertIndex(
            entity,
            "ix_file_objects_deleted_at_utc",
            ["DeletedAtUtc"],
            isUnique: false);
        AssertIndex(
            entity,
            "ux_file_objects_storage_provider_object_key",
            ["StorageProvider", "StorageObjectKey"],
            isUnique: true);

        AssertForeignKey(
            entity,
            typeof(UserProfile),
            ["OwnerUserProfileId"],
            DeleteBehavior.Restrict);
        AssertForeignKey(
            entity,
            typeof(UserProfile),
            ["CreatedByUserProfileId"],
            DeleteBehavior.Restrict);

        AssertCheckConstraint(
            entity,
            "ck_file_objects_purpose",
            "purpose IN ('receipt_image', 'ocr_source', 'settlement_proof', 'payment_qr', 'statement_upload', 'export_file', 'supporting_attachment')");
        AssertCheckConstraint(
            entity,
            "ck_file_objects_status",
            "status IN ('pending', 'active', 'quarantined', 'deleted', 'purged', 'upload_failed')");
        AssertCheckConstraint(
            entity,
            "ck_file_objects_encryption_mode",
            "encryption_mode IN ('server_managed', 'recoverable_user_vault', 'strict_user_vault_future')");
        AssertCheckConstraint(
            entity,
            "ck_file_objects_storage_provider",
            "storage_provider IN ('local')");
        AssertCheckConstraint(
            entity,
            "ck_file_objects_content_type_not_blank",
            "length(btrim(content_type)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_file_objects_original_filename_not_blank",
            "original_filename IS NULL OR length(btrim(original_filename)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_file_objects_storage_object_key_not_blank",
            "length(btrim(storage_object_key)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_file_objects_vault_key_ref_not_blank",
            "vault_key_ref IS NULL OR length(btrim(vault_key_ref)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_file_objects_retention_policy_not_blank",
            "retention_policy IS NULL OR length(btrim(retention_policy)) > 0");
        AssertCheckConstraint(
            entity,
            "ck_file_objects_size_bytes_non_negative",
            "size_bytes >= 0");
        AssertCheckConstraint(
            entity,
            "ck_file_objects_sha256_hash_lower_hex",
            "sha256_hash IS NULL OR sha256_hash ~ '^[a-f0-9]{64}$'");
    }

    [Fact]
    public void FileObjectMigrationIsRegisteredAndReviewable()
    {
        using var dbContext = CreateDbContext();

        Assert.Contains(
            dbContext.Database.GetMigrations(),
            migration => migration.EndsWith("_AddFileObjectsMetadataFoundation", StringComparison.Ordinal));

        var migration = new AddFileObjectsMetadataFoundation();
        Assert.DoesNotContain(
            migration.UpOperations,
            operation => operation is DropTableOperation
                or DropColumnOperation
                or DropIndexOperation
                or DropForeignKeyOperation
                or AlterColumnOperation
                or SqlOperation);

        var createTable = Assert.Single(
            migration.UpOperations.OfType<CreateTableOperation>(),
            table => table.Name == "file_objects");

        Assert.Equal(["id"], createTable.PrimaryKey!.Columns);
        Assert.All(
            createTable.Columns.Where(column => column.ClrType == typeof(string)),
            column => Assert.NotNull(column.MaxLength));

        Assert.Contains(
            createTable.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "user_profiles"
                && foreignKey.Columns.SequenceEqual(["owner_user_profile_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);
        Assert.Contains(
            createTable.ForeignKeys,
            foreignKey => foreignKey.PrincipalTable == "user_profiles"
                && foreignKey.Columns.SequenceEqual(["created_by_user_profile_id"])
                && foreignKey.OnDelete == ReferentialAction.Restrict);

        Assert.Contains(
            createTable.CheckConstraints,
            constraint => constraint.Name == "ck_file_objects_size_bytes_non_negative"
                && constraint.Sql == "size_bytes >= 0");
        Assert.Contains(
            createTable.CheckConstraints,
            constraint => constraint.Name == "ck_file_objects_sha256_hash_lower_hex"
                && constraint.Sql == "sha256_hash IS NULL OR sha256_hash ~ '^[a-f0-9]{64}$'");
        Assert.Contains(
            createTable.CheckConstraints,
            constraint => constraint.Name == "ck_file_objects_storage_object_key_not_blank"
                && constraint.Sql == "length(btrim(storage_object_key)) > 0");

        var indexes = migration.UpOperations.OfType<CreateIndexOperation>().ToArray();
        Assert.Contains(
            indexes,
            index => index.Table == "file_objects"
                && index.Name == "ix_file_objects_owner_user_profile_id"
                && !index.IsUnique
                && index.Columns.SequenceEqual(["owner_user_profile_id"]));
        Assert.Contains(
            indexes,
            index => index.Table == "file_objects"
                && index.Name == "ix_file_objects_created_by_user_profile_id"
                && !index.IsUnique
                && index.Columns.SequenceEqual(["created_by_user_profile_id"]));
        Assert.Contains(
            indexes,
            index => index.Table == "file_objects"
                && index.Name == "ix_file_objects_purpose_status"
                && !index.IsUnique
                && index.Columns.SequenceEqual(["purpose", "status"]));
        Assert.Contains(
            indexes,
            index => index.Table == "file_objects"
                && index.Name == "ix_file_objects_created_at_utc"
                && !index.IsUnique
                && index.Columns.SequenceEqual(["created_at_utc"]));
        Assert.Contains(
            indexes,
            index => index.Table == "file_objects"
                && index.Name == "ix_file_objects_deleted_at_utc"
                && !index.IsUnique
                && index.Columns.SequenceEqual(["deleted_at_utc"]));

        var objectKeyIndex = Assert.Single(
            indexes,
            index => index.Table == "file_objects"
                && index.Name == "ux_file_objects_storage_provider_object_key");
        Assert.True(objectKeyIndex.IsUnique);
        Assert.Equal(["storage_provider", "storage_object_key"], objectKeyIndex.Columns);
    }

    [Fact]
    public void FileObjectSchemaDoesNotAddPublicStoragePathsOrQrReferences()
    {
        using var dbContext = CreateDbContext();
        var entity = FindEntityType<FileObject>(dbContext);
        var storeObject = StoreObjectIdentifier.Table("file_objects", null);
        var columnNames = entity.GetProperties()
            .Select(property => property.GetColumnName(storeObject) ?? property.Name)
            .ToArray();

        Assert.DoesNotContain(columnNames, columnName => columnName.Contains("physical", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, columnName => columnName.Contains("absolute", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, columnName => columnName.Contains("root_path", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(columnNames, columnName => columnName.Contains("qr_file_id", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("storage_object_key", columnNames);
        Assert.Equal("local", StorageProviderNames.Local);
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
        var entity = dbContext.GetService<IDesignTimeModel>()
            .Model
            .FindEntityType(typeof(TEntity));

        Assert.NotNull(entity);
        return entity!;
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
}
