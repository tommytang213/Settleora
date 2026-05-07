using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Users;
using Settleora.Api.Storage;

namespace Settleora.Api.Persistence;

public sealed class SettleoraDbContext : DbContext
{
    private const int MembershipRoleMaxLength = 16;
    private const int MembershipStatusMaxLength = 16;
    private const int AuthAccountStatusMaxLength = 16;
    private const int AuthIdentityProviderTypeMaxLength = 16;
    private const int AuthIdentityProviderNameMaxLength = 120;
    private const int AuthIdentityProviderSubjectMaxLength = 320;
    private const int SystemRoleMaxLength = 16;
    private const int LocalPasswordCredentialPasswordHashMaxLength = 512;
    private const int LocalPasswordCredentialPasswordHashAlgorithmMaxLength = 64;
    private const int LocalPasswordCredentialPasswordHashAlgorithmVersionMaxLength = 32;
    private const int LocalPasswordCredentialPasswordHashParametersMaxLength = 1024;
    private const int LocalPasswordCredentialStatusMaxLength = 16;
    private const int AuthSessionTokenHashMaxLength = 128;
    private const int AuthSessionStatusMaxLength = 16;
    private const int AuthSessionRevocationReasonMaxLength = 120;
    private const int AuthSessionDeviceLabelMaxLength = 120;
    private const int AuthSessionUserAgentSummaryMaxLength = 320;
    private const int AuthSessionNetworkAddressHashMaxLength = 128;
    private const int AuthSessionFamilyStatusMaxLength = 16;
    private const int AuthSessionFamilyRevocationReasonMaxLength = 120;
    private const int AuthRefreshCredentialTokenHashMaxLength = 128;
    private const int AuthRefreshCredentialStatusMaxLength = 16;
    private const int AuthRefreshCredentialRevocationReasonMaxLength = 120;
    private const int AuthAuditActionMaxLength = 120;
    private const int AuthAuditOutcomeMaxLength = 32;
    private const int AuthAuditCorrelationIdMaxLength = 120;
    private const int AuthAuditRequestIdMaxLength = 120;
    private const int AuthAuditSafeMetadataJsonMaxLength = 4096;

    public SettleoraDbContext(DbContextOptions<SettleoraDbContext> options)
        : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<UserProfile>(ConfigureUserProfile);
        modelBuilder.Entity<UserPaymentProfile>(ConfigureUserPaymentProfile);
        modelBuilder.Entity<UserGroup>(ConfigureUserGroup);
        modelBuilder.Entity<GroupMembership>(ConfigureGroupMembership);
        modelBuilder.Entity<ExpenseBill>(ConfigureExpenseBill);
        modelBuilder.Entity<ExpenseBillItem>(ConfigureExpenseBillItem);
        modelBuilder.Entity<ExpenseBillItemSplit>(ConfigureExpenseBillItemSplit);
        modelBuilder.Entity<ExpenseBillParticipant>(ConfigureExpenseBillParticipant);
        modelBuilder.Entity<ExpenseBillPayer>(ConfigureExpenseBillPayer);
        modelBuilder.Entity<ExpenseBillAdjustment>(ConfigureExpenseBillAdjustment);
        modelBuilder.Entity<ExpenseBillAttachment>(ConfigureExpenseBillAttachment);
        modelBuilder.Entity<SettlementRequest>(ConfigureSettlementRequest);
        modelBuilder.Entity<SettlementPayment>(ConfigureSettlementPayment);
        modelBuilder.Entity<SettlementProofAttachment>(ConfigureSettlementProofAttachment);
        modelBuilder.Entity<AuthAccount>(ConfigureAuthAccount);
        modelBuilder.Entity<AuthIdentity>(ConfigureAuthIdentity);
        modelBuilder.Entity<LocalPasswordCredential>(ConfigureLocalPasswordCredential);
        modelBuilder.Entity<AuthSession>(ConfigureAuthSession);
        modelBuilder.Entity<AuthSessionFamily>(ConfigureAuthSessionFamily);
        modelBuilder.Entity<AuthRefreshCredential>(ConfigureAuthRefreshCredential);
        modelBuilder.Entity<AuthAuditEvent>(ConfigureAuthAuditEvent);
        modelBuilder.Entity<SystemRoleAssignment>(ConfigureSystemRoleAssignment);
        modelBuilder.Entity<FileObject>(ConfigureFileObject);
    }

    private static void ConfigureFileObject(EntityTypeBuilder<FileObject> entity)
    {
        entity.ToTable("file_objects", table =>
        {
            table.HasCheckConstraint(
                "ck_file_objects_purpose",
                "purpose IN ('receipt_image', 'ocr_source', 'settlement_proof', 'payment_qr', 'statement_upload', 'export_file', 'supporting_attachment')");
            table.HasCheckConstraint(
                "ck_file_objects_status",
                "status IN ('pending', 'active', 'quarantined', 'deleted', 'purged', 'upload_failed')");
            table.HasCheckConstraint(
                "ck_file_objects_encryption_mode",
                "encryption_mode IN ('server_managed', 'recoverable_user_vault', 'strict_user_vault_future')");
            table.HasCheckConstraint(
                "ck_file_objects_storage_provider",
                "storage_provider IN ('local')");
            table.HasCheckConstraint(
                "ck_file_objects_content_type_not_blank",
                "length(btrim(content_type)) > 0");
            table.HasCheckConstraint(
                "ck_file_objects_original_filename_not_blank",
                "original_filename IS NULL OR length(btrim(original_filename)) > 0");
            table.HasCheckConstraint(
                "ck_file_objects_storage_object_key_not_blank",
                "length(btrim(storage_object_key)) > 0");
            table.HasCheckConstraint(
                "ck_file_objects_vault_key_ref_not_blank",
                "vault_key_ref IS NULL OR length(btrim(vault_key_ref)) > 0");
            table.HasCheckConstraint(
                "ck_file_objects_retention_policy_not_blank",
                "retention_policy IS NULL OR length(btrim(retention_policy)) > 0");
            table.HasCheckConstraint(
                "ck_file_objects_size_bytes_non_negative",
                "size_bytes >= 0");
            table.HasCheckConstraint(
                "ck_file_objects_sha256_hash_lower_hex",
                "sha256_hash IS NULL OR sha256_hash ~ '^[a-f0-9]{64}$'");
        });

        entity.HasKey(fileObject => fileObject.Id);

        entity.Property(fileObject => fileObject.Id)
            .HasColumnName("id");

        entity.Property(fileObject => fileObject.OwnerUserProfileId)
            .HasColumnName("owner_user_profile_id");

        entity.Property(fileObject => fileObject.CreatedByUserProfileId)
            .HasColumnName("created_by_user_profile_id");

        entity.Property(fileObject => fileObject.Purpose)
            .HasColumnName("purpose")
            .HasMaxLength(FileObjectConstraints.PurposeMaxLength)
            .IsRequired();

        entity.Property(fileObject => fileObject.Status)
            .HasColumnName("status")
            .HasMaxLength(FileObjectConstraints.StatusMaxLength)
            .IsRequired();

        entity.Property(fileObject => fileObject.ContentType)
            .HasColumnName("content_type")
            .HasMaxLength(FileObjectConstraints.ContentTypeMaxLength)
            .IsRequired();

        entity.Property(fileObject => fileObject.OriginalFilename)
            .HasColumnName("original_filename")
            .HasMaxLength(FileObjectConstraints.OriginalFilenameMaxLength);

        entity.Property(fileObject => fileObject.SizeBytes)
            .HasColumnName("size_bytes")
            .IsRequired();

        entity.Property(fileObject => fileObject.Sha256Hash)
            .HasColumnName("sha256_hash")
            .HasMaxLength(FileObjectConstraints.Sha256HashMaxLength);

        entity.Property(fileObject => fileObject.StorageProvider)
            .HasColumnName("storage_provider")
            .HasMaxLength(FileObjectConstraints.StorageProviderMaxLength)
            .IsRequired();

        entity.Property(fileObject => fileObject.StorageObjectKey)
            .HasColumnName("storage_object_key")
            .HasMaxLength(FileObjectConstraints.StorageObjectKeyMaxLength)
            .IsRequired();

        entity.Property(fileObject => fileObject.EncryptionMode)
            .HasColumnName("encryption_mode")
            .HasMaxLength(FileObjectConstraints.EncryptionModeMaxLength)
            .IsRequired();

        entity.Property(fileObject => fileObject.VaultKeyRef)
            .HasColumnName("vault_key_ref")
            .HasMaxLength(FileObjectConstraints.VaultKeyRefMaxLength);

        entity.Property(fileObject => fileObject.RetentionPolicy)
            .HasColumnName("retention_policy")
            .HasMaxLength(FileObjectConstraints.RetentionPolicyMaxLength);

        entity.Property(fileObject => fileObject.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(fileObject => fileObject.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(fileObject => fileObject.DeletedAtUtc)
            .HasColumnName("deleted_at_utc");

        entity.HasIndex(fileObject => fileObject.OwnerUserProfileId)
            .HasDatabaseName("ix_file_objects_owner_user_profile_id");

        entity.HasIndex(fileObject => fileObject.CreatedByUserProfileId)
            .HasDatabaseName("ix_file_objects_created_by_user_profile_id");

        entity.HasIndex(fileObject => new
            {
                fileObject.Purpose,
                fileObject.Status
            })
            .HasDatabaseName("ix_file_objects_purpose_status");

        entity.HasIndex(fileObject => fileObject.CreatedAtUtc)
            .HasDatabaseName("ix_file_objects_created_at_utc");

        entity.HasIndex(fileObject => fileObject.DeletedAtUtc)
            .HasDatabaseName("ix_file_objects_deleted_at_utc");

        entity.HasIndex(fileObject => new
            {
                fileObject.StorageProvider,
                fileObject.StorageObjectKey
            })
            .IsUnique()
            .HasDatabaseName("ux_file_objects_storage_provider_object_key");

        entity.HasOne(fileObject => fileObject.OwnerUserProfile)
            .WithMany(userProfile => userProfile.OwnedFileObjects)
            .HasForeignKey(fileObject => fileObject.OwnerUserProfileId)
            .HasConstraintName("fk_file_objects_owner_user_profiles_owner_user_profile_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(fileObject => fileObject.CreatedByUserProfile)
            .WithMany(userProfile => userProfile.CreatedFileObjects)
            .HasForeignKey(fileObject => fileObject.CreatedByUserProfileId)
            .HasConstraintName("fk_file_objects_created_by_user_profiles_created_by_user_profile_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureUserProfile(EntityTypeBuilder<UserProfile> entity)
    {
        entity.ToTable("user_profiles", table =>
        {
            table.HasCheckConstraint(
                "ck_user_profiles_display_name_not_blank",
                "length(btrim(display_name)) > 0");
            table.HasCheckConstraint(
                "ck_user_profiles_default_currency_uppercase_iso",
                "default_currency IS NULL OR default_currency ~ '^[A-Z]{3}$'");
        });

        entity.HasKey(userProfile => userProfile.Id);

        entity.Property(userProfile => userProfile.Id)
            .HasColumnName("id");

        entity.Property(userProfile => userProfile.DisplayName)
            .HasColumnName("display_name")
            .HasMaxLength(UserProfileConstraints.DisplayNameMaxLength)
            .IsRequired();

        entity.Property(userProfile => userProfile.DefaultCurrency)
            .HasColumnName("default_currency")
            .HasMaxLength(UserProfileConstraints.DefaultCurrencyMaxLength);

        entity.Property(userProfile => userProfile.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(userProfile => userProfile.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(userProfile => userProfile.DeletedAtUtc)
            .HasColumnName("deleted_at_utc");
    }

    private static void ConfigureUserGroup(EntityTypeBuilder<UserGroup> entity)
    {
        entity.ToTable("user_groups", table =>
        {
            table.HasCheckConstraint(
                "ck_user_groups_name_not_blank",
                "length(btrim(name)) > 0");
        });

        entity.HasKey(group => group.Id);

        entity.Property(group => group.Id)
            .HasColumnName("id");

        entity.Property(group => group.Name)
            .HasColumnName("name")
            .HasMaxLength(UserGroupConstraints.NameMaxLength)
            .IsRequired();

        entity.Property(group => group.CreatedByUserProfileId)
            .HasColumnName("created_by_user_profile_id");

        entity.Property(group => group.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(group => group.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(group => group.DeletedAtUtc)
            .HasColumnName("deleted_at_utc");

        entity.HasIndex(group => group.CreatedByUserProfileId)
            .HasDatabaseName("ix_user_groups_created_by_user_profile_id");

        entity.HasOne(group => group.CreatedByUserProfile)
            .WithMany(userProfile => userProfile.CreatedGroups)
            .HasForeignKey(group => group.CreatedByUserProfileId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureUserPaymentProfile(EntityTypeBuilder<UserPaymentProfile> entity)
    {
        entity.ToTable("user_payment_profiles", table =>
        {
            table.HasCheckConstraint(
                "ck_user_payment_profiles_preferred_method_label_not_blank",
                "preferred_method_label IS NULL OR length(btrim(preferred_method_label)) > 0");
            table.HasCheckConstraint(
                "ck_user_payment_profiles_payment_handle_not_blank",
                "payment_handle IS NULL OR length(btrim(payment_handle)) > 0");
            table.HasCheckConstraint(
                "ck_user_payment_profiles_payment_note_not_blank",
                "payment_note IS NULL OR length(btrim(payment_note)) > 0");
            table.HasCheckConstraint(
                "ck_user_payment_profiles_visibility",
                "visibility IN ('private', 'settlement_counterparties_only', 'group_members_when_shared')");
        });

        entity.HasKey(paymentProfile => paymentProfile.Id);

        entity.Property(paymentProfile => paymentProfile.Id)
            .HasColumnName("id");

        entity.Property(paymentProfile => paymentProfile.UserProfileId)
            .HasColumnName("user_profile_id");

        entity.Property(paymentProfile => paymentProfile.PreferredMethodLabel)
            .HasColumnName("preferred_method_label")
            .HasMaxLength(UserPaymentProfileConstraints.PreferredMethodLabelMaxLength);

        entity.Property(paymentProfile => paymentProfile.PaymentHandle)
            .HasColumnName("payment_handle")
            .HasMaxLength(UserPaymentProfileConstraints.PaymentHandleMaxLength);

        entity.Property(paymentProfile => paymentProfile.PaymentNote)
            .HasColumnName("payment_note")
            .HasMaxLength(UserPaymentProfileConstraints.PaymentNoteMaxLength);

        entity.Property(paymentProfile => paymentProfile.Visibility)
            .HasColumnName("visibility")
            .HasMaxLength(UserPaymentProfileConstraints.VisibilityMaxLength)
            .IsRequired();

        entity.Property(paymentProfile => paymentProfile.QrFileObjectId)
            .HasColumnName("qr_file_object_id");

        entity.Property(paymentProfile => paymentProfile.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(paymentProfile => paymentProfile.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(paymentProfile => paymentProfile.DeletedAtUtc)
            .HasColumnName("deleted_at_utc");

        entity.HasIndex(paymentProfile => paymentProfile.UserProfileId)
            .IsUnique()
            .HasDatabaseName("ux_user_payment_profiles_active_user_profile_id")
            .HasFilter("deleted_at_utc IS NULL");

        entity.HasIndex(paymentProfile => paymentProfile.QrFileObjectId)
            .HasDatabaseName("ix_user_payment_profiles_qr_file_object_id");

        entity.HasOne(paymentProfile => paymentProfile.UserProfile)
            .WithMany(userProfile => userProfile.PaymentProfiles)
            .HasForeignKey(paymentProfile => paymentProfile.UserProfileId)
            .HasConstraintName("fk_user_payment_profiles_user_profiles_user_profile_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(paymentProfile => paymentProfile.QrFileObject)
            .WithMany()
            .HasForeignKey(paymentProfile => paymentProfile.QrFileObjectId)
            .HasConstraintName("fk_user_payment_profiles_file_objects_qr_file_object_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureGroupMembership(EntityTypeBuilder<GroupMembership> entity)
    {
        entity.ToTable("group_memberships", table =>
        {
            table.HasCheckConstraint(
                "ck_group_memberships_role",
                "role IN ('owner', 'member')");
            table.HasCheckConstraint(
                "ck_group_memberships_status",
                "status IN ('active', 'removed')");
        });

        entity.HasKey(membership => new
        {
            membership.GroupId,
            membership.UserProfileId
        });

        entity.Property(membership => membership.GroupId)
            .HasColumnName("group_id");

        entity.Property(membership => membership.UserProfileId)
            .HasColumnName("user_profile_id");

        entity.Property(membership => membership.Role)
            .HasColumnName("role")
            .HasMaxLength(MembershipRoleMaxLength)
            .IsRequired();

        entity.Property(membership => membership.Status)
            .HasColumnName("status")
            .HasMaxLength(MembershipStatusMaxLength)
            .IsRequired();

        entity.Property(membership => membership.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(membership => membership.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(membership => membership.UserProfileId)
            .HasDatabaseName("ix_group_memberships_user_profile_id");

        entity.HasOne(membership => membership.Group)
            .WithMany(group => group.Memberships)
            .HasForeignKey(membership => membership.GroupId)
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(membership => membership.UserProfile)
            .WithMany(userProfile => userProfile.GroupMemberships)
            .HasForeignKey(membership => membership.UserProfileId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureExpenseBill(EntityTypeBuilder<ExpenseBill> entity)
    {
        entity.ToTable("expense_bills", table =>
        {
            table.HasCheckConstraint(
                "ck_expense_bills_merchant_name_not_blank",
                "merchant_name IS NULL OR length(btrim(merchant_name)) > 0");
            table.HasCheckConstraint(
                "ck_expense_bills_status",
                "status IN ('draft', 'pending_confirmation', 'confirmed', 'rejected', 'cancelled', 'finalized', 'archived')");
            table.HasCheckConstraint(
                "ck_expense_bills_total_amount_non_negative",
                "total_amount >= 0");
            table.HasCheckConstraint(
                "ck_expense_bills_total_amount_upper_bound",
                "total_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_expense_bills_total_currency_uppercase_iso",
                "total_currency ~ '^[A-Z]{3}$'");
        });

        entity.HasKey(bill => bill.Id);

        entity.Property(bill => bill.Id)
            .HasColumnName("id");

        entity.Property(bill => bill.CreatedByUserProfileId)
            .HasColumnName("created_by_user_profile_id");

        entity.Property(bill => bill.GroupId)
            .HasColumnName("group_id");

        entity.Property(bill => bill.MerchantName)
            .HasColumnName("merchant_name")
            .HasMaxLength(ExpenseBillConstraints.MerchantNameMaxLength);

        entity.Property(bill => bill.BillDate)
            .HasColumnName("bill_date")
            .HasColumnType("date")
            .IsRequired();

        entity.Property(bill => bill.Status)
            .HasColumnName("status")
            .HasMaxLength(ExpenseBillConstraints.BillStatusMaxLength)
            .IsRequired();

        entity.Property(bill => bill.TotalAmount)
            .HasColumnName("total_amount")
            .HasPrecision(
                ExpenseBillConstraints.MoneyAmountPrecision,
                ExpenseBillConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(bill => bill.TotalCurrency)
            .HasColumnName("total_currency")
            .HasMaxLength(ExpenseBillConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(bill => bill.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(bill => bill.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(bill => bill.ArchivedAtUtc)
            .HasColumnName("archived_at_utc");

        entity.HasIndex(bill => bill.CreatedByUserProfileId)
            .HasDatabaseName("ix_expense_bills_created_by_user_profile_id");

        entity.HasIndex(bill => bill.GroupId)
            .HasDatabaseName("ix_expense_bills_group_id");

        entity.HasIndex(bill => bill.Status)
            .HasDatabaseName("ix_expense_bills_status");

        entity.HasIndex(bill => bill.BillDate)
            .HasDatabaseName("ix_expense_bills_bill_date");

        entity.HasIndex(bill => bill.ArchivedAtUtc)
            .HasDatabaseName("ix_expense_bills_archived_at_utc");

        entity.HasOne(bill => bill.CreatedByUserProfile)
            .WithMany()
            .HasForeignKey(bill => bill.CreatedByUserProfileId)
            .HasConstraintName("fk_expense_bills_user_profiles_created_by_user_profile_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(bill => bill.Group)
            .WithMany()
            .HasForeignKey(bill => bill.GroupId)
            .HasConstraintName("fk_expense_bills_user_groups_group_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureExpenseBillItem(EntityTypeBuilder<ExpenseBillItem> entity)
    {
        entity.ToTable("expense_bill_items", table =>
        {
            table.HasCheckConstraint(
                "ck_expense_bill_items_name_not_blank",
                "length(btrim(name)) > 0");
            table.HasCheckConstraint(
                "ck_expense_bill_items_note_not_blank",
                "note IS NULL OR length(btrim(note)) > 0");
            table.HasCheckConstraint(
                "ck_expense_bill_items_quantity_positive",
                "quantity IS NULL OR quantity > 0");
            table.HasCheckConstraint(
                "ck_expense_bill_items_amount_non_negative",
                "amount >= 0");
            table.HasCheckConstraint(
                "ck_expense_bill_items_amount_upper_bound",
                "amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_expense_bill_items_currency_uppercase_iso",
                "currency ~ '^[A-Z]{3}$'");
        });

        entity.HasKey(item => item.Id);

        entity.Property(item => item.Id)
            .HasColumnName("id");

        entity.Property(item => item.ExpenseBillId)
            .HasColumnName("expense_bill_id");

        entity.Property(item => item.Name)
            .HasColumnName("name")
            .HasMaxLength(ExpenseBillConstraints.ItemNameMaxLength)
            .IsRequired();

        entity.Property(item => item.Note)
            .HasColumnName("note")
            .HasMaxLength(ExpenseBillConstraints.NoteMaxLength);

        entity.Property(item => item.Quantity)
            .HasColumnName("quantity")
            .HasPrecision(18, 4);

        entity.Property(item => item.Amount)
            .HasColumnName("amount")
            .HasPrecision(
                ExpenseBillConstraints.MoneyAmountPrecision,
                ExpenseBillConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(item => item.Currency)
            .HasColumnName("currency")
            .HasMaxLength(ExpenseBillConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(item => item.SortOrder)
            .HasColumnName("sort_order")
            .IsRequired();

        entity.Property(item => item.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(item => item.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(item => item.DeletedAtUtc)
            .HasColumnName("deleted_at_utc");

        entity.HasIndex(item => item.ExpenseBillId)
            .HasDatabaseName("ix_expense_bill_items_expense_bill_id");

        entity.HasIndex(item => new
            {
                item.ExpenseBillId,
                item.SortOrder
            })
            .HasDatabaseName("ix_expense_bill_items_bill_sort_order");

        entity.HasIndex(item => item.DeletedAtUtc)
            .HasDatabaseName("ix_expense_bill_items_deleted_at_utc");

        entity.HasOne(item => item.ExpenseBill)
            .WithMany(bill => bill.Items)
            .HasForeignKey(item => item.ExpenseBillId)
            .HasConstraintName("fk_expense_bill_items_expense_bills_expense_bill_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureExpenseBillParticipant(EntityTypeBuilder<ExpenseBillParticipant> entity)
    {
        entity.ToTable("expense_bill_participants", table =>
        {
            table.HasCheckConstraint(
                "ck_expense_bill_participants_status",
                "status IN ('pending_acceptance', 'accepted', 'rejected', 'partially_settled', 'settled', 'waived', 'claimed_paid', 'confirmed_paid')");
            table.HasCheckConstraint(
                "ck_expense_bill_participants_rejection_reason_code",
                "rejection_reason_code IS NULL OR rejection_reason_code IN ('wrong_amount', 'wrong_items', 'wrong_split', 'duplicate', 'not_mine', 'other')");
            table.HasCheckConstraint(
                "ck_expense_bill_participants_share_amount_non_negative",
                "resolved_share_amount >= 0");
            table.HasCheckConstraint(
                "ck_expense_bill_participants_share_amount_upper_bound",
                "resolved_share_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_expense_bill_participants_share_currency_iso",
                "resolved_share_currency ~ '^[A-Z]{3}$'");
        });

        entity.HasKey(participant => new
        {
            participant.ExpenseBillId,
            participant.UserProfileId
        });

        entity.Property(participant => participant.ExpenseBillId)
            .HasColumnName("expense_bill_id");

        entity.Property(participant => participant.UserProfileId)
            .HasColumnName("user_profile_id");

        entity.Property(participant => participant.Status)
            .HasColumnName("status")
            .HasMaxLength(ExpenseBillConstraints.ParticipantStatusMaxLength)
            .IsRequired();

        entity.Property(participant => participant.ResolvedShareAmount)
            .HasColumnName("resolved_share_amount")
            .HasPrecision(
                ExpenseBillConstraints.MoneyAmountPrecision,
                ExpenseBillConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(participant => participant.ResolvedShareCurrency)
            .HasColumnName("resolved_share_currency")
            .HasMaxLength(ExpenseBillConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(participant => participant.AcceptedAtUtc)
            .HasColumnName("accepted_at_utc");

        entity.Property(participant => participant.RejectedAtUtc)
            .HasColumnName("rejected_at_utc");

        entity.Property(participant => participant.RejectionReasonCode)
            .HasColumnName("rejection_reason_code")
            .HasMaxLength(ExpenseBillConstraints.ParticipantRejectionReasonCodeMaxLength);

        entity.Property(participant => participant.SettledAtUtc)
            .HasColumnName("settled_at_utc");

        entity.Property(participant => participant.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(participant => participant.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(participant => participant.UserProfileId)
            .HasDatabaseName("ix_expense_bill_participants_user_profile_id");

        entity.HasOne(participant => participant.ExpenseBill)
            .WithMany(bill => bill.Participants)
            .HasForeignKey(participant => participant.ExpenseBillId)
            .HasConstraintName("fk_expense_bill_participants_expense_bills_bill_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(participant => participant.UserProfile)
            .WithMany()
            .HasForeignKey(participant => participant.UserProfileId)
            .HasConstraintName("fk_expense_bill_participants_user_profiles_user_profile_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureExpenseBillItemSplit(EntityTypeBuilder<ExpenseBillItemSplit> entity)
    {
        entity.ToTable("expense_bill_item_splits", table =>
        {
            table.HasCheckConstraint(
                "ck_expense_bill_item_splits_split_method",
                "split_method IN ('equal', 'exact_amount', 'percentage', 'ratio', 'share_weight')");
            table.HasCheckConstraint(
                "ck_expense_bill_item_splits_basis_value_non_negative",
                "basis_value IS NULL OR basis_value >= 0");
            table.HasCheckConstraint(
                "ck_expense_bill_item_splits_basis_value_upper_bound",
                "basis_value IS NULL OR basis_value <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_expense_bill_item_splits_resolved_amount_non_negative",
                "resolved_amount >= 0");
            table.HasCheckConstraint(
                "ck_expense_bill_item_splits_resolved_amount_upper_bound",
                "resolved_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_expense_bill_item_splits_resolved_currency_iso",
                "resolved_currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_expense_bill_item_splits_allocation_order_non_negative",
                "allocation_order >= 0");
        });

        entity.HasKey(split => split.Id);

        entity.Property(split => split.Id)
            .HasColumnName("id");

        entity.Property(split => split.ExpenseBillItemId)
            .HasColumnName("expense_bill_item_id");

        entity.Property(split => split.UserProfileId)
            .HasColumnName("user_profile_id");

        entity.Property(split => split.SplitMethod)
            .HasColumnName("split_method")
            .HasMaxLength(ExpenseBillConstraints.ItemSplitMethodMaxLength)
            .IsRequired();

        entity.Property(split => split.BasisValue)
            .HasColumnName("basis_value")
            .HasPrecision(
                ExpenseBillConstraints.MoneyAmountPrecision,
                ExpenseBillConstraints.MoneyAmountScale);

        entity.Property(split => split.ResolvedAmount)
            .HasColumnName("resolved_amount")
            .HasPrecision(
                ExpenseBillConstraints.MoneyAmountPrecision,
                ExpenseBillConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(split => split.ResolvedCurrency)
            .HasColumnName("resolved_currency")
            .HasMaxLength(ExpenseBillConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(split => split.AllocationOrder)
            .HasColumnName("allocation_order")
            .IsRequired();

        entity.Property(split => split.ReceivedResidualMinorUnit)
            .HasColumnName("received_residual_minor_unit")
            .IsRequired();

        entity.Property(split => split.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(split => split.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(split => split.ExpenseBillItemId)
            .HasDatabaseName("ix_expense_bill_item_splits_expense_bill_item_id");

        entity.HasIndex(split => split.UserProfileId)
            .HasDatabaseName("ix_expense_bill_item_splits_user_profile_id");

        entity.HasIndex(split => new
            {
                split.ExpenseBillItemId,
                split.AllocationOrder
            })
            .HasDatabaseName("ix_expense_bill_item_splits_item_allocation_order");

        entity.HasIndex(split => new
            {
                split.ExpenseBillItemId,
                split.UserProfileId
            })
            .IsUnique()
            .HasDatabaseName("ux_expense_bill_item_splits_item_user_profile_id");

        entity.HasOne(split => split.ExpenseBillItem)
            .WithMany(item => item.Splits)
            .HasForeignKey(split => split.ExpenseBillItemId)
            .HasConstraintName("fk_expense_bill_item_splits_expense_bill_items_item_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(split => split.UserProfile)
            .WithMany()
            .HasForeignKey(split => split.UserProfileId)
            .HasConstraintName("fk_expense_bill_item_splits_user_profiles_user_profile_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureExpenseBillPayer(EntityTypeBuilder<ExpenseBillPayer> entity)
    {
        entity.ToTable("expense_bill_payers", table =>
        {
            table.HasCheckConstraint(
                "ck_expense_bill_payers_amount_non_negative",
                "amount >= 0");
            table.HasCheckConstraint(
                "ck_expense_bill_payers_amount_upper_bound",
                "amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_expense_bill_payers_currency_uppercase_iso",
                "currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_expense_bill_payers_method_label_not_blank",
                "payment_method_label_snapshot IS NULL OR length(btrim(payment_method_label_snapshot)) > 0");
        });

        entity.HasKey(payer => payer.Id);

        entity.Property(payer => payer.Id)
            .HasColumnName("id");

        entity.Property(payer => payer.ExpenseBillId)
            .HasColumnName("expense_bill_id");

        entity.Property(payer => payer.UserProfileId)
            .HasColumnName("user_profile_id");

        entity.Property(payer => payer.Amount)
            .HasColumnName("amount")
            .HasPrecision(
                ExpenseBillConstraints.MoneyAmountPrecision,
                ExpenseBillConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(payer => payer.Currency)
            .HasColumnName("currency")
            .HasMaxLength(ExpenseBillConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(payer => payer.PaymentMethodLabelSnapshot)
            .HasColumnName("payment_method_label_snapshot")
            .HasMaxLength(ExpenseBillConstraints.PayerPaymentMethodLabelSnapshotMaxLength);

        entity.Property(payer => payer.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(payer => payer.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(payer => payer.ExpenseBillId)
            .HasDatabaseName("ix_expense_bill_payers_expense_bill_id");

        entity.HasIndex(payer => payer.UserProfileId)
            .HasDatabaseName("ix_expense_bill_payers_user_profile_id");

        entity.HasIndex(payer => new
            {
                payer.ExpenseBillId,
                payer.UserProfileId
            })
            .HasDatabaseName("ix_expense_bill_payers_bill_user_profile_id");

        entity.HasOne(payer => payer.ExpenseBill)
            .WithMany(bill => bill.Payers)
            .HasForeignKey(payer => payer.ExpenseBillId)
            .HasConstraintName("fk_expense_bill_payers_expense_bills_expense_bill_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(payer => payer.UserProfile)
            .WithMany()
            .HasForeignKey(payer => payer.UserProfileId)
            .HasConstraintName("fk_expense_bill_payers_user_profiles_user_profile_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureExpenseBillAdjustment(EntityTypeBuilder<ExpenseBillAdjustment> entity)
    {
        entity.ToTable("expense_bill_adjustments", table =>
        {
            table.HasCheckConstraint(
                "ck_expense_bill_adjustments_type",
                "type IN ('tax', 'service_charge', 'discount', 'manual_adjustment', 'credit')");
            table.HasCheckConstraint(
                "ck_expense_bill_adjustments_direction",
                "direction IN ('charge', 'credit')");
            table.HasCheckConstraint(
                "ck_expense_bill_adjustments_allocation_method",
                "allocation_method IN ('equal', 'proportional_by_item_subtotal', 'manual')");
            table.HasCheckConstraint(
                "ck_expense_bill_adjustments_amount_non_negative",
                "amount >= 0");
            table.HasCheckConstraint(
                "ck_expense_bill_adjustments_amount_upper_bound",
                "amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_expense_bill_adjustments_currency_iso",
                "currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_expense_bill_adjustments_reason_note_not_blank",
                "reason_note IS NULL OR length(btrim(reason_note)) > 0");
        });

        entity.HasKey(adjustment => adjustment.Id);

        entity.Property(adjustment => adjustment.Id)
            .HasColumnName("id");

        entity.Property(adjustment => adjustment.ExpenseBillId)
            .HasColumnName("expense_bill_id");

        entity.Property(adjustment => adjustment.Type)
            .HasColumnName("type")
            .HasMaxLength(ExpenseBillConstraints.AdjustmentTypeMaxLength)
            .IsRequired();

        entity.Property(adjustment => adjustment.Direction)
            .HasColumnName("direction")
            .HasMaxLength(ExpenseBillConstraints.AdjustmentDirectionMaxLength)
            .IsRequired();

        entity.Property(adjustment => adjustment.AllocationMethod)
            .HasColumnName("allocation_method")
            .HasMaxLength(ExpenseBillConstraints.AdjustmentAllocationMethodMaxLength)
            .IsRequired();

        entity.Property(adjustment => adjustment.Amount)
            .HasColumnName("amount")
            .HasPrecision(
                ExpenseBillConstraints.MoneyAmountPrecision,
                ExpenseBillConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(adjustment => adjustment.Currency)
            .HasColumnName("currency")
            .HasMaxLength(ExpenseBillConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(adjustment => adjustment.ReasonNote)
            .HasColumnName("reason_note")
            .HasMaxLength(ExpenseBillConstraints.NoteMaxLength);

        entity.Property(adjustment => adjustment.SortOrder)
            .HasColumnName("sort_order")
            .IsRequired();

        entity.Property(adjustment => adjustment.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(adjustment => adjustment.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(adjustment => adjustment.ExpenseBillId)
            .HasDatabaseName("ix_expense_bill_adjustments_expense_bill_id");

        entity.HasIndex(adjustment => new
            {
                adjustment.ExpenseBillId,
                adjustment.SortOrder
            })
            .HasDatabaseName("ix_expense_bill_adjustments_bill_sort_order");

        entity.HasOne(adjustment => adjustment.ExpenseBill)
            .WithMany(bill => bill.Adjustments)
            .HasForeignKey(adjustment => adjustment.ExpenseBillId)
            .HasConstraintName("fk_expense_bill_adjustments_expense_bills_bill_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureExpenseBillAttachment(EntityTypeBuilder<ExpenseBillAttachment> entity)
    {
        entity.ToTable("expense_bill_attachments", table =>
        {
            table.HasCheckConstraint(
                "ck_expense_bill_attachments_purpose",
                "purpose IN ('receipt', 'supporting_attachment')");
        });

        entity.HasKey(attachment => new
        {
            attachment.ExpenseBillId,
            attachment.FileObjectId
        });

        entity.Property(attachment => attachment.ExpenseBillId)
            .HasColumnName("expense_bill_id");

        entity.Property(attachment => attachment.FileObjectId)
            .HasColumnName("file_object_id");

        entity.Property(attachment => attachment.Purpose)
            .HasColumnName("purpose")
            .HasMaxLength(ExpenseBillConstraints.AttachmentPurposeMaxLength)
            .IsRequired();

        entity.Property(attachment => attachment.CreatedByUserProfileId)
            .HasColumnName("created_by_user_profile_id");

        entity.Property(attachment => attachment.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(attachment => attachment.RemovedAtUtc)
            .HasColumnName("removed_at_utc");

        entity.HasIndex(attachment => attachment.FileObjectId)
            .HasDatabaseName("ix_expense_bill_attachments_file_object_id");

        entity.HasIndex(attachment => attachment.CreatedByUserProfileId)
            .HasDatabaseName("ix_expense_bill_attachments_created_by_profile_id");

        entity.HasOne(attachment => attachment.ExpenseBill)
            .WithMany(bill => bill.Attachments)
            .HasForeignKey(attachment => attachment.ExpenseBillId)
            .HasConstraintName("fk_expense_bill_attachments_expense_bills_bill_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attachment => attachment.FileObject)
            .WithMany()
            .HasForeignKey(attachment => attachment.FileObjectId)
            .HasConstraintName("fk_expense_bill_attachments_file_objects_file_object_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attachment => attachment.CreatedByUserProfile)
            .WithMany()
            .HasForeignKey(attachment => attachment.CreatedByUserProfileId)
            .HasConstraintName("fk_expense_bill_attachments_user_profiles_created_by")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSettlementRequest(EntityTypeBuilder<SettlementRequest> entity)
    {
        entity.ToTable("settlement_requests", table =>
        {
            table.HasCheckConstraint(
                "ck_settlement_requests_status",
                "status IN ('requested', 'partially_paid', 'marked_paid', 'confirmed', 'disputed', 'cancelled')");
            table.HasCheckConstraint(
                "ck_settlement_requests_amount_positive",
                "amount > 0");
            table.HasCheckConstraint(
                "ck_settlement_requests_amount_upper_bound",
                "amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_settlement_requests_currency_uppercase_iso",
                "currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_settlement_requests_debtor_creditor_distinct",
                "debtor_user_profile_id <> creditor_user_profile_id");
        });

        entity.HasKey(request => request.Id);

        entity.Property(request => request.Id)
            .HasColumnName("id");

        entity.Property(request => request.GroupId)
            .HasColumnName("group_id");

        entity.Property(request => request.SourceExpenseBillId)
            .HasColumnName("source_expense_bill_id");

        entity.Property(request => request.DebtorUserProfileId)
            .HasColumnName("debtor_user_profile_id");

        entity.Property(request => request.CreditorUserProfileId)
            .HasColumnName("creditor_user_profile_id");

        entity.Property(request => request.Amount)
            .HasColumnName("amount")
            .HasPrecision(
                SettlementConstraints.MoneyAmountPrecision,
                SettlementConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(request => request.Currency)
            .HasColumnName("currency")
            .HasMaxLength(SettlementConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(request => request.Status)
            .HasColumnName("status")
            .HasMaxLength(SettlementConstraints.RequestStatusMaxLength)
            .IsRequired();

        entity.Property(request => request.RequestedByUserProfileId)
            .HasColumnName("requested_by_user_profile_id");

        entity.Property(request => request.RequestedAtUtc)
            .HasColumnName("requested_at_utc")
            .IsRequired();

        entity.Property(request => request.ConfirmedAtUtc)
            .HasColumnName("confirmed_at_utc");

        entity.Property(request => request.DisputedAtUtc)
            .HasColumnName("disputed_at_utc");

        entity.Property(request => request.CancelledAtUtc)
            .HasColumnName("cancelled_at_utc");

        entity.Property(request => request.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(request => request.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(request => request.ArchivedAtUtc)
            .HasColumnName("archived_at_utc");

        entity.HasIndex(request => request.DebtorUserProfileId)
            .HasDatabaseName("ix_settlement_requests_debtor_user_profile_id");

        entity.HasIndex(request => request.CreditorUserProfileId)
            .HasDatabaseName("ix_settlement_requests_creditor_user_profile_id");

        entity.HasIndex(request => request.GroupId)
            .HasDatabaseName("ix_settlement_requests_group_id");

        entity.HasIndex(request => request.SourceExpenseBillId)
            .HasDatabaseName("ix_settlement_requests_source_expense_bill_id");

        entity.HasIndex(request => request.Status)
            .HasDatabaseName("ix_settlement_requests_status");

        entity.HasIndex(request => request.RequestedByUserProfileId)
            .HasDatabaseName("ix_settlement_requests_requested_by_user_profile_id");

        entity.HasIndex(request => request.RequestedAtUtc)
            .HasDatabaseName("ix_settlement_requests_requested_at_utc");

        entity.HasIndex(request => request.CreatedAtUtc)
            .HasDatabaseName("ix_settlement_requests_created_at_utc");

        entity.HasIndex(request => request.ArchivedAtUtc)
            .HasDatabaseName("ix_settlement_requests_archived_at_utc");

        entity.HasOne(request => request.Group)
            .WithMany()
            .HasForeignKey(request => request.GroupId)
            .HasConstraintName("fk_settlement_requests_user_groups_group_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(request => request.SourceExpenseBill)
            .WithMany()
            .HasForeignKey(request => request.SourceExpenseBillId)
            .HasConstraintName("fk_settlement_requests_expense_bills_source_bill_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(request => request.DebtorUserProfile)
            .WithMany()
            .HasForeignKey(request => request.DebtorUserProfileId)
            .HasConstraintName("fk_settlement_requests_user_profiles_debtor_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(request => request.CreditorUserProfile)
            .WithMany()
            .HasForeignKey(request => request.CreditorUserProfileId)
            .HasConstraintName("fk_settlement_requests_user_profiles_creditor_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(request => request.RequestedByUserProfile)
            .WithMany()
            .HasForeignKey(request => request.RequestedByUserProfileId)
            .HasConstraintName("fk_settlement_requests_user_profiles_requested_by_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSettlementPayment(EntityTypeBuilder<SettlementPayment> entity)
    {
        entity.ToTable("settlement_payments", table =>
        {
            table.HasCheckConstraint(
                "ck_settlement_payments_status",
                "status IN ('marked_paid', 'confirmed', 'disputed', 'cancelled')");
            table.HasCheckConstraint(
                "ck_settlement_payments_amount_positive",
                "amount > 0");
            table.HasCheckConstraint(
                "ck_settlement_payments_amount_upper_bound",
                "amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_settlement_payments_currency_uppercase_iso",
                "currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_settlement_payments_payer_receiver_distinct",
                "paid_by_user_profile_id <> received_by_user_profile_id");
            table.HasCheckConstraint(
                "ck_settlement_payments_note_not_blank",
                "note IS NULL OR length(btrim(note)) > 0");
        });

        entity.HasKey(payment => payment.Id);

        entity.Property(payment => payment.Id)
            .HasColumnName("id");

        entity.Property(payment => payment.SettlementRequestId)
            .HasColumnName("settlement_request_id");

        entity.Property(payment => payment.PaidByUserProfileId)
            .HasColumnName("paid_by_user_profile_id");

        entity.Property(payment => payment.ReceivedByUserProfileId)
            .HasColumnName("received_by_user_profile_id");

        entity.Property(payment => payment.Amount)
            .HasColumnName("amount")
            .HasPrecision(
                SettlementConstraints.MoneyAmountPrecision,
                SettlementConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(payment => payment.Currency)
            .HasColumnName("currency")
            .HasMaxLength(SettlementConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(payment => payment.Status)
            .HasColumnName("status")
            .HasMaxLength(SettlementConstraints.PaymentStatusMaxLength)
            .IsRequired();

        entity.Property(payment => payment.PaymentDate)
            .HasColumnName("payment_date")
            .HasColumnType("date")
            .IsRequired();

        entity.Property(payment => payment.Note)
            .HasColumnName("note")
            .HasMaxLength(SettlementConstraints.NoteMaxLength);

        entity.Property(payment => payment.CreatedByUserProfileId)
            .HasColumnName("created_by_user_profile_id");

        entity.Property(payment => payment.ClaimedAtUtc)
            .HasColumnName("claimed_at_utc")
            .IsRequired();

        entity.Property(payment => payment.ConfirmedAtUtc)
            .HasColumnName("confirmed_at_utc");

        entity.Property(payment => payment.DisputedAtUtc)
            .HasColumnName("disputed_at_utc");

        entity.Property(payment => payment.CancelledAtUtc)
            .HasColumnName("cancelled_at_utc");

        entity.Property(payment => payment.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(payment => payment.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(payment => payment.SettlementRequestId)
            .HasDatabaseName("ix_settlement_payments_settlement_request_id");

        entity.HasIndex(payment => payment.PaidByUserProfileId)
            .HasDatabaseName("ix_settlement_payments_paid_by_user_profile_id");

        entity.HasIndex(payment => payment.ReceivedByUserProfileId)
            .HasDatabaseName("ix_settlement_payments_received_by_user_profile_id");

        entity.HasIndex(payment => payment.CreatedByUserProfileId)
            .HasDatabaseName("ix_settlement_payments_created_by_user_profile_id");

        entity.HasIndex(payment => payment.Status)
            .HasDatabaseName("ix_settlement_payments_status");

        entity.HasIndex(payment => payment.PaymentDate)
            .HasDatabaseName("ix_settlement_payments_payment_date");

        entity.HasOne(payment => payment.SettlementRequest)
            .WithMany(request => request.Payments)
            .HasForeignKey(payment => payment.SettlementRequestId)
            .HasConstraintName("fk_settlement_payments_settlement_requests_request_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(payment => payment.PaidByUserProfile)
            .WithMany()
            .HasForeignKey(payment => payment.PaidByUserProfileId)
            .HasConstraintName("fk_settlement_payments_user_profiles_paid_by_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(payment => payment.ReceivedByUserProfile)
            .WithMany()
            .HasForeignKey(payment => payment.ReceivedByUserProfileId)
            .HasConstraintName("fk_settlement_payments_user_profiles_received_by_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(payment => payment.CreatedByUserProfile)
            .WithMany()
            .HasForeignKey(payment => payment.CreatedByUserProfileId)
            .HasConstraintName("fk_settlement_payments_user_profiles_created_by_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSettlementProofAttachment(EntityTypeBuilder<SettlementProofAttachment> entity)
    {
        entity.ToTable("settlement_proof_attachments");

        entity.HasKey(attachment => new
        {
            attachment.SettlementPaymentId,
            attachment.FileObjectId
        });

        entity.Property(attachment => attachment.SettlementPaymentId)
            .HasColumnName("settlement_payment_id");

        entity.Property(attachment => attachment.FileObjectId)
            .HasColumnName("file_object_id");

        entity.Property(attachment => attachment.CreatedByUserProfileId)
            .HasColumnName("created_by_user_profile_id");

        entity.Property(attachment => attachment.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(attachment => attachment.RemovedAtUtc)
            .HasColumnName("removed_at_utc");

        entity.HasIndex(attachment => attachment.FileObjectId)
            .HasDatabaseName("ix_settlement_proof_attachments_file_object_id");

        entity.HasIndex(attachment => attachment.CreatedByUserProfileId)
            .HasDatabaseName("ix_settlement_proof_attachments_created_by_profile_id");

        entity.HasOne(attachment => attachment.SettlementPayment)
            .WithMany(payment => payment.ProofAttachments)
            .HasForeignKey(attachment => attachment.SettlementPaymentId)
            .HasConstraintName("fk_settlement_proof_attachments_payments_payment_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attachment => attachment.FileObject)
            .WithMany()
            .HasForeignKey(attachment => attachment.FileObjectId)
            .HasConstraintName("fk_settlement_proof_attachments_file_objects_file_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attachment => attachment.CreatedByUserProfile)
            .WithMany()
            .HasForeignKey(attachment => attachment.CreatedByUserProfileId)
            .HasConstraintName("fk_settlement_proof_attachments_user_profiles_created_by")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureAuthAccount(EntityTypeBuilder<AuthAccount> entity)
    {
        entity.ToTable("auth_accounts", table =>
        {
            table.HasCheckConstraint(
                "ck_auth_accounts_status",
                "status IN ('active', 'disabled')");
        });

        entity.HasKey(account => account.Id);

        entity.Property(account => account.Id)
            .HasColumnName("id");

        entity.Property(account => account.UserProfileId)
            .HasColumnName("user_profile_id");

        entity.Property(account => account.Status)
            .HasColumnName("status")
            .HasMaxLength(AuthAccountStatusMaxLength)
            .IsRequired();

        entity.Property(account => account.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(account => account.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(account => account.DisabledAtUtc)
            .HasColumnName("disabled_at_utc");

        entity.Property(account => account.DeletedAtUtc)
            .HasColumnName("deleted_at_utc");

        entity.HasIndex(account => account.UserProfileId)
            .IsUnique()
            .HasDatabaseName("ux_auth_accounts_user_profile_id");

        entity.HasOne(account => account.UserProfile)
            .WithOne()
            .HasForeignKey<AuthAccount>(account => account.UserProfileId)
            .HasConstraintName("fk_auth_accounts_user_profiles_user_profile_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureAuthIdentity(EntityTypeBuilder<AuthIdentity> entity)
    {
        entity.ToTable("auth_identities", table =>
        {
            table.HasCheckConstraint(
                "ck_auth_identities_provider_type",
                "provider_type IN ('local', 'oidc')");
            table.HasCheckConstraint(
                "ck_auth_identities_provider_name_not_blank",
                "length(btrim(provider_name)) > 0");
            table.HasCheckConstraint(
                "ck_auth_identities_provider_subject_not_blank",
                "length(btrim(provider_subject)) > 0");
        });

        entity.HasKey(identity => identity.Id);

        entity.Property(identity => identity.Id)
            .HasColumnName("id");

        entity.Property(identity => identity.AuthAccountId)
            .HasColumnName("auth_account_id");

        entity.Property(identity => identity.ProviderType)
            .HasColumnName("provider_type")
            .HasMaxLength(AuthIdentityProviderTypeMaxLength)
            .IsRequired();

        entity.Property(identity => identity.ProviderName)
            .HasColumnName("provider_name")
            .HasMaxLength(AuthIdentityProviderNameMaxLength)
            .IsRequired();

        entity.Property(identity => identity.ProviderSubject)
            .HasColumnName("provider_subject")
            .HasMaxLength(AuthIdentityProviderSubjectMaxLength)
            .IsRequired();

        entity.Property(identity => identity.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(identity => identity.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(identity => identity.DisabledAtUtc)
            .HasColumnName("disabled_at_utc");

        entity.HasIndex(identity => identity.AuthAccountId)
            .HasDatabaseName("ix_auth_identities_auth_account_id");

        entity.HasIndex(identity => new
            {
                identity.ProviderType,
                identity.ProviderName,
                identity.ProviderSubject
            })
            .IsUnique()
            .HasDatabaseName("ux_auth_identities_provider_lookup");

        entity.HasOne(identity => identity.AuthAccount)
            .WithMany(account => account.Identities)
            .HasForeignKey(identity => identity.AuthAccountId)
            .HasConstraintName("fk_auth_identities_auth_accounts_auth_account_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureLocalPasswordCredential(EntityTypeBuilder<LocalPasswordCredential> entity)
    {
        entity.ToTable("local_password_credentials", table =>
        {
            table.HasCheckConstraint(
                "ck_local_password_credentials_status",
                "status IN ('active', 'disabled', 'revoked')");
            table.HasCheckConstraint(
                "ck_local_password_credentials_hash_not_blank",
                "length(btrim(password_hash)) > 0");
            table.HasCheckConstraint(
                "ck_local_password_credentials_hash_algorithm_not_blank",
                "length(btrim(password_hash_algorithm)) > 0");
            table.HasCheckConstraint(
                "ck_local_password_credentials_hash_algorithm_version_not_blank",
                "length(btrim(password_hash_algorithm_version)) > 0");
            table.HasCheckConstraint(
                "ck_local_password_credentials_hash_parameters_not_blank",
                "length(btrim(password_hash_parameters)) > 0");
        });

        entity.HasKey(credential => credential.Id);

        entity.Property(credential => credential.Id)
            .HasColumnName("id");

        entity.Property(credential => credential.AuthAccountId)
            .HasColumnName("auth_account_id");

        entity.Property(credential => credential.PasswordHash)
            .HasColumnName("password_hash")
            .HasMaxLength(LocalPasswordCredentialPasswordHashMaxLength)
            .IsRequired();

        entity.Property(credential => credential.PasswordHashAlgorithm)
            .HasColumnName("password_hash_algorithm")
            .HasMaxLength(LocalPasswordCredentialPasswordHashAlgorithmMaxLength)
            .IsRequired();

        entity.Property(credential => credential.PasswordHashAlgorithmVersion)
            .HasColumnName("password_hash_algorithm_version")
            .HasMaxLength(LocalPasswordCredentialPasswordHashAlgorithmVersionMaxLength)
            .IsRequired();

        entity.Property(credential => credential.PasswordHashParameters)
            .HasColumnName("password_hash_parameters")
            .HasMaxLength(LocalPasswordCredentialPasswordHashParametersMaxLength)
            .IsRequired();

        entity.Property(credential => credential.Status)
            .HasColumnName("status")
            .HasMaxLength(LocalPasswordCredentialStatusMaxLength)
            .IsRequired();

        entity.Property(credential => credential.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(credential => credential.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(credential => credential.LastVerifiedAtUtc)
            .HasColumnName("last_verified_at_utc");

        entity.Property(credential => credential.RevokedAtUtc)
            .HasColumnName("revoked_at_utc");

        entity.Property(credential => credential.RequiresRehash)
            .HasColumnName("requires_rehash")
            .IsRequired();

        entity.HasIndex(credential => credential.AuthAccountId)
            .IsUnique()
            .HasDatabaseName("ux_local_password_credentials_auth_account_id");

        entity.HasOne(credential => credential.AuthAccount)
            .WithMany(account => account.LocalPasswordCredentials)
            .HasForeignKey(credential => credential.AuthAccountId)
            .HasConstraintName("fk_local_password_credentials_auth_accounts_auth_account_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureAuthSession(EntityTypeBuilder<AuthSession> entity)
    {
        entity.ToTable("auth_sessions", table =>
        {
            table.HasCheckConstraint(
                "ck_auth_sessions_status",
                "status IN ('active', 'revoked', 'expired')");
            table.HasCheckConstraint(
                "ck_auth_sessions_session_token_hash_not_blank",
                "length(btrim(session_token_hash)) > 0");
            table.HasCheckConstraint(
                "ck_auth_sessions_refresh_token_hash_not_blank",
                "refresh_token_hash IS NULL OR length(btrim(refresh_token_hash)) > 0");
            table.HasCheckConstraint(
                "ck_auth_sessions_revocation_reason_not_blank",
                "revocation_reason IS NULL OR length(btrim(revocation_reason)) > 0");
            table.HasCheckConstraint(
                "ck_auth_sessions_device_label_not_blank",
                "device_label IS NULL OR length(btrim(device_label)) > 0");
            table.HasCheckConstraint(
                "ck_auth_sessions_user_agent_summary_not_blank",
                "user_agent_summary IS NULL OR length(btrim(user_agent_summary)) > 0");
            table.HasCheckConstraint(
                "ck_auth_sessions_network_address_hash_not_blank",
                "network_address_hash IS NULL OR length(btrim(network_address_hash)) > 0");
        });

        entity.HasKey(session => session.Id);

        entity.Property(session => session.Id)
            .HasColumnName("id");

        entity.Property(session => session.AuthAccountId)
            .HasColumnName("auth_account_id");

        entity.Property(session => session.SessionTokenHash)
            .HasColumnName("session_token_hash")
            .HasMaxLength(AuthSessionTokenHashMaxLength)
            .IsRequired();

        entity.Property(session => session.RefreshTokenHash)
            .HasColumnName("refresh_token_hash")
            .HasMaxLength(AuthSessionTokenHashMaxLength);

        entity.Property(session => session.Status)
            .HasColumnName("status")
            .HasMaxLength(AuthSessionStatusMaxLength)
            .IsRequired();

        entity.Property(session => session.IssuedAtUtc)
            .HasColumnName("issued_at_utc")
            .IsRequired();

        entity.Property(session => session.ExpiresAtUtc)
            .HasColumnName("expires_at_utc")
            .IsRequired();

        entity.Property(session => session.LastSeenAtUtc)
            .HasColumnName("last_seen_at_utc");

        entity.Property(session => session.RevokedAtUtc)
            .HasColumnName("revoked_at_utc");

        entity.Property(session => session.RevocationReason)
            .HasColumnName("revocation_reason")
            .HasMaxLength(AuthSessionRevocationReasonMaxLength);

        entity.Property(session => session.DeviceLabel)
            .HasColumnName("device_label")
            .HasMaxLength(AuthSessionDeviceLabelMaxLength);

        entity.Property(session => session.UserAgentSummary)
            .HasColumnName("user_agent_summary")
            .HasMaxLength(AuthSessionUserAgentSummaryMaxLength);

        entity.Property(session => session.NetworkAddressHash)
            .HasColumnName("network_address_hash")
            .HasMaxLength(AuthSessionNetworkAddressHashMaxLength);

        entity.Property(session => session.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(session => session.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(session => session.AuthAccountId)
            .HasDatabaseName("ix_auth_sessions_auth_account_id");

        entity.HasIndex(session => session.ExpiresAtUtc)
            .HasDatabaseName("ix_auth_sessions_expires_at_utc");

        entity.HasIndex(session => session.SessionTokenHash)
            .IsUnique()
            .HasDatabaseName("ux_auth_sessions_session_token_hash");

        entity.HasIndex(session => session.RefreshTokenHash)
            .IsUnique()
            .HasDatabaseName("ux_auth_sessions_refresh_token_hash")
            .HasFilter("refresh_token_hash IS NOT NULL");

        entity.HasOne(session => session.AuthAccount)
            .WithMany(account => account.Sessions)
            .HasForeignKey(session => session.AuthAccountId)
            .HasConstraintName("fk_auth_sessions_auth_accounts_auth_account_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureAuthAuditEvent(EntityTypeBuilder<AuthAuditEvent> entity)
    {
        entity.ToTable("auth_audit_events", table =>
        {
            table.HasCheckConstraint(
                "ck_auth_audit_events_outcome",
                "outcome IN ('success', 'failure', 'denied', 'revoked', 'expired', 'blocked_by_policy')");
            table.HasCheckConstraint(
                "ck_auth_audit_events_action_not_blank",
                "length(btrim(action)) > 0");
            table.HasCheckConstraint(
                "ck_auth_audit_events_correlation_id_not_blank",
                "correlation_id IS NULL OR length(btrim(correlation_id)) > 0");
            table.HasCheckConstraint(
                "ck_auth_audit_events_request_id_not_blank",
                "request_id IS NULL OR length(btrim(request_id)) > 0");
            table.HasCheckConstraint(
                "ck_auth_audit_events_safe_metadata_json_not_blank",
                "safe_metadata_json IS NULL OR length(btrim(safe_metadata_json)) > 0");
        });

        entity.HasKey(auditEvent => auditEvent.Id);

        entity.Property(auditEvent => auditEvent.Id)
            .HasColumnName("id");

        entity.Property(auditEvent => auditEvent.ActorAuthAccountId)
            .HasColumnName("actor_auth_account_id");

        entity.Property(auditEvent => auditEvent.SubjectAuthAccountId)
            .HasColumnName("subject_auth_account_id");

        entity.Property(auditEvent => auditEvent.Action)
            .HasColumnName("action")
            .HasMaxLength(AuthAuditActionMaxLength)
            .IsRequired();

        entity.Property(auditEvent => auditEvent.Outcome)
            .HasColumnName("outcome")
            .HasMaxLength(AuthAuditOutcomeMaxLength)
            .IsRequired();

        entity.Property(auditEvent => auditEvent.OccurredAtUtc)
            .HasColumnName("occurred_at_utc")
            .IsRequired();

        entity.Property(auditEvent => auditEvent.CorrelationId)
            .HasColumnName("correlation_id")
            .HasMaxLength(AuthAuditCorrelationIdMaxLength);

        entity.Property(auditEvent => auditEvent.RequestId)
            .HasColumnName("request_id")
            .HasMaxLength(AuthAuditRequestIdMaxLength);

        entity.Property(auditEvent => auditEvent.SafeMetadataJson)
            .HasColumnName("safe_metadata_json")
            .HasMaxLength(AuthAuditSafeMetadataJsonMaxLength);

        entity.HasIndex(auditEvent => auditEvent.OccurredAtUtc)
            .HasDatabaseName("ix_auth_audit_events_occurred_at_utc");

        entity.HasIndex(auditEvent => auditEvent.ActorAuthAccountId)
            .HasDatabaseName("ix_auth_audit_events_actor_auth_account_id");

        entity.HasIndex(auditEvent => auditEvent.SubjectAuthAccountId)
            .HasDatabaseName("ix_auth_audit_events_subject_auth_account_id");

        entity.HasOne(auditEvent => auditEvent.ActorAuthAccount)
            .WithMany(account => account.ActorAuditEvents)
            .HasForeignKey(auditEvent => auditEvent.ActorAuthAccountId)
            .HasConstraintName("fk_auth_audit_events_actor_auth_account")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(auditEvent => auditEvent.SubjectAuthAccount)
            .WithMany(account => account.SubjectAuditEvents)
            .HasForeignKey(auditEvent => auditEvent.SubjectAuthAccountId)
            .HasConstraintName("fk_auth_audit_events_subject_auth_account")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureAuthSessionFamily(EntityTypeBuilder<AuthSessionFamily> entity)
    {
        entity.ToTable("auth_session_families", table =>
        {
            table.HasCheckConstraint(
                "ck_auth_session_families_status",
                "status IN ('active', 'revoked', 'expired', 'replayed')");
            table.HasCheckConstraint(
                "ck_auth_session_families_revocation_reason_not_blank",
                "revocation_reason IS NULL OR length(btrim(revocation_reason)) > 0");
        });

        entity.HasKey(sessionFamily => sessionFamily.Id);

        entity.Property(sessionFamily => sessionFamily.Id)
            .HasColumnName("id");

        entity.Property(sessionFamily => sessionFamily.AuthAccountId)
            .HasColumnName("auth_account_id");

        entity.Property(sessionFamily => sessionFamily.Status)
            .HasColumnName("status")
            .HasMaxLength(AuthSessionFamilyStatusMaxLength)
            .IsRequired();

        entity.Property(sessionFamily => sessionFamily.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(sessionFamily => sessionFamily.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(sessionFamily => sessionFamily.AbsoluteExpiresAtUtc)
            .HasColumnName("absolute_expires_at_utc")
            .IsRequired();

        entity.Property(sessionFamily => sessionFamily.LastRotatedAtUtc)
            .HasColumnName("last_rotated_at_utc");

        entity.Property(sessionFamily => sessionFamily.RevokedAtUtc)
            .HasColumnName("revoked_at_utc");

        entity.Property(sessionFamily => sessionFamily.RevocationReason)
            .HasColumnName("revocation_reason")
            .HasMaxLength(AuthSessionFamilyRevocationReasonMaxLength);

        entity.HasIndex(sessionFamily => sessionFamily.AuthAccountId)
            .HasDatabaseName("ix_auth_session_families_auth_account_id");

        entity.HasIndex(sessionFamily => sessionFamily.Status)
            .HasDatabaseName("ix_auth_session_families_status");

        entity.HasIndex(sessionFamily => sessionFamily.AbsoluteExpiresAtUtc)
            .HasDatabaseName("ix_auth_session_families_absolute_expires_at_utc");

        entity.HasOne(sessionFamily => sessionFamily.AuthAccount)
            .WithMany(account => account.SessionFamilies)
            .HasForeignKey(sessionFamily => sessionFamily.AuthAccountId)
            .HasConstraintName("fk_auth_session_families_auth_accounts_auth_account_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureAuthRefreshCredential(EntityTypeBuilder<AuthRefreshCredential> entity)
    {
        entity.ToTable("auth_refresh_credentials", table =>
        {
            table.HasCheckConstraint(
                "ck_auth_refresh_credentials_status",
                "status IN ('active', 'rotated', 'revoked', 'expired', 'replayed')");
            table.HasCheckConstraint(
                "ck_auth_refresh_credentials_hash_not_blank",
                "length(btrim(refresh_token_hash)) > 0");
            table.HasCheckConstraint(
                "ck_auth_refresh_credentials_revocation_reason_not_blank",
                "revocation_reason IS NULL OR length(btrim(revocation_reason)) > 0");
        });

        entity.HasKey(credential => credential.Id);

        entity.Property(credential => credential.Id)
            .HasColumnName("id");

        entity.Property(credential => credential.AuthSessionFamilyId)
            .HasColumnName("auth_session_family_id");

        entity.Property(credential => credential.AuthSessionId)
            .HasColumnName("auth_session_id");

        entity.Property(credential => credential.RefreshTokenHash)
            .HasColumnName("refresh_token_hash")
            .HasMaxLength(AuthRefreshCredentialTokenHashMaxLength)
            .IsRequired();

        entity.Property(credential => credential.Status)
            .HasColumnName("status")
            .HasMaxLength(AuthRefreshCredentialStatusMaxLength)
            .IsRequired();

        entity.Property(credential => credential.IssuedAtUtc)
            .HasColumnName("issued_at_utc")
            .IsRequired();

        entity.Property(credential => credential.IdleExpiresAtUtc)
            .HasColumnName("idle_expires_at_utc")
            .IsRequired();

        entity.Property(credential => credential.AbsoluteExpiresAtUtc)
            .HasColumnName("absolute_expires_at_utc")
            .IsRequired();

        entity.Property(credential => credential.ConsumedAtUtc)
            .HasColumnName("consumed_at_utc");

        entity.Property(credential => credential.RevokedAtUtc)
            .HasColumnName("revoked_at_utc");

        entity.Property(credential => credential.ReplacedByRefreshCredentialId)
            .HasColumnName("replaced_by_refresh_credential_id");

        entity.Property(credential => credential.RevocationReason)
            .HasColumnName("revocation_reason")
            .HasMaxLength(AuthRefreshCredentialRevocationReasonMaxLength);

        entity.Property(credential => credential.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(credential => credential.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(credential => credential.AuthSessionFamilyId)
            .HasDatabaseName("ix_auth_refresh_credentials_auth_session_family_id");

        entity.HasIndex(credential => credential.AuthSessionId)
            .HasDatabaseName("ix_auth_refresh_credentials_auth_session_id");

        entity.HasIndex(credential => new
            {
                credential.AuthSessionFamilyId,
                credential.Status
            })
            .HasDatabaseName("ix_auth_refresh_credentials_family_status");

        entity.HasIndex(credential => credential.IdleExpiresAtUtc)
            .HasDatabaseName("ix_auth_refresh_credentials_idle_expires_at_utc");

        entity.HasIndex(credential => credential.AbsoluteExpiresAtUtc)
            .HasDatabaseName("ix_auth_refresh_credentials_absolute_expires_at_utc");

        entity.HasIndex(credential => credential.ConsumedAtUtc)
            .HasDatabaseName("ix_auth_refresh_credentials_consumed_at_utc");

        entity.HasIndex(credential => credential.ReplacedByRefreshCredentialId)
            .HasDatabaseName("ix_auth_refresh_credentials_replaced_by_id");

        entity.HasIndex(credential => credential.RefreshTokenHash)
            .IsUnique()
            .HasDatabaseName("ux_auth_refresh_credentials_refresh_token_hash");

        entity.HasOne(credential => credential.SessionFamily)
            .WithMany(sessionFamily => sessionFamily.RefreshCredentials)
            .HasForeignKey(credential => credential.AuthSessionFamilyId)
            .HasConstraintName("fk_auth_refresh_credentials_session_families_family_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(credential => credential.AuthSession)
            .WithMany(session => session.RefreshCredentials)
            .HasForeignKey(credential => credential.AuthSessionId)
            .HasConstraintName("fk_auth_refresh_credentials_auth_sessions_auth_session_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(credential => credential.ReplacedByRefreshCredential)
            .WithMany(credential => credential.ReplacedRefreshCredentials)
            .HasForeignKey(credential => credential.ReplacedByRefreshCredentialId)
            .HasConstraintName("fk_auth_refresh_credentials_replaced_by_refresh_credential_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSystemRoleAssignment(EntityTypeBuilder<SystemRoleAssignment> entity)
    {
        entity.ToTable("system_role_assignments", table =>
        {
            table.HasCheckConstraint(
                "ck_system_role_assignments_role",
                "role IN ('owner', 'admin', 'user')");
        });

        entity.HasKey(assignment => new
        {
            assignment.AuthAccountId,
            assignment.Role
        });

        entity.Property(assignment => assignment.AuthAccountId)
            .HasColumnName("auth_account_id");

        entity.Property(assignment => assignment.Role)
            .HasColumnName("role")
            .HasMaxLength(SystemRoleMaxLength)
            .IsRequired();

        entity.Property(assignment => assignment.AssignedAtUtc)
            .HasColumnName("assigned_at_utc")
            .IsRequired();

        entity.Property(assignment => assignment.AssignedByAuthAccountId)
            .HasColumnName("assigned_by_auth_account_id");

        entity.HasIndex(assignment => assignment.AssignedByAuthAccountId)
            .HasDatabaseName("ix_system_role_assignments_assigned_by_auth_account_id");

        entity.HasOne(assignment => assignment.AuthAccount)
            .WithMany(account => account.RoleAssignments)
            .HasForeignKey(assignment => assignment.AuthAccountId)
            .HasConstraintName("fk_system_role_assignments_auth_account")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(assignment => assignment.AssignedByAuthAccount)
            .WithMany(account => account.AssignedRoleAssignments)
            .HasForeignKey(assignment => assignment.AssignedByAuthAccountId)
            .HasConstraintName("fk_system_role_assignments_assigned_by_auth_account")
            .OnDelete(DeleteBehavior.Restrict);
    }
}
