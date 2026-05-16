using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.RecurringBills;
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
        modelBuilder.Entity<ReceiptOcrReview>(ConfigureReceiptOcrReview);
        modelBuilder.Entity<ReceiptOcrReviewLine>(ConfigureReceiptOcrReviewLine);
        modelBuilder.Entity<RecurringBillTemplate>(ConfigureRecurringBillTemplate);
        modelBuilder.Entity<RecurringBillOccurrence>(ConfigureRecurringBillOccurrence);
        modelBuilder.Entity<ExpenseBillRevision>(ConfigureExpenseBillRevision);
        modelBuilder.Entity<ExpenseBillRevisionParticipant>(ConfigureExpenseBillRevisionParticipant);
        modelBuilder.Entity<ExpenseBillRevisionPayer>(ConfigureExpenseBillRevisionPayer);
        modelBuilder.Entity<ExpenseBillRevisionApproval>(ConfigureExpenseBillRevisionApproval);
        modelBuilder.Entity<SettlementRequest>(ConfigureSettlementRequest);
        modelBuilder.Entity<SettlementRequestLine>(ConfigureSettlementRequestLine);
        modelBuilder.Entity<SettlementPayment>(ConfigureSettlementPayment);
        modelBuilder.Entity<SettlementPaymentAllocation>(ConfigureSettlementPaymentAllocation);
        modelBuilder.Entity<SettlementResidual>(ConfigureSettlementResidual);
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
        modelBuilder.Entity<InAppNotification>(ConfigureInAppNotification);
    }

    private static void ConfigureInAppNotification(EntityTypeBuilder<InAppNotification> entity)
    {
        entity.ToTable("user_notifications", table =>
        {
            table.HasCheckConstraint(
                "ck_user_notifications_event_type",
                "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'recurring_bill.draft_generated')");
            table.HasCheckConstraint(
                "ck_user_notifications_status",
                "status IN ('unread', 'read', 'archived')");
            table.HasCheckConstraint(
                "ck_user_notifications_priority",
                "priority IN ('normal', 'attention', 'urgent')");
            table.HasCheckConstraint(
                "ck_user_notifications_subject_type",
                "subject_type IN ('expense_bill', 'settlement_request', 'settlement_payment', 'recurring_bill_occurrence')");
            table.HasCheckConstraint(
                "ck_user_notifications_title_key_not_blank",
                "length(btrim(title_key)) > 0");
            table.HasCheckConstraint(
                "ck_user_notifications_message_key_not_blank",
                "length(btrim(message_key)) > 0");
            table.HasCheckConstraint(
                "ck_user_notifications_safe_summary_not_blank",
                "safe_summary IS NULL OR length(btrim(safe_summary)) > 0");
            table.HasCheckConstraint(
                "ck_user_notifications_action_url_route_like",
                "action_url IS NULL OR (action_url LIKE '/api/v1/%' AND action_url NOT LIKE '%://%' AND action_url NOT LIKE '%\\\\%')");
        });

        entity.HasKey(notification => notification.Id);

        entity.Property(notification => notification.Id)
            .HasColumnName("id");

        entity.Property(notification => notification.RecipientUserProfileId)
            .HasColumnName("recipient_user_profile_id");

        entity.Property(notification => notification.ActorUserProfileId)
            .HasColumnName("actor_user_profile_id");

        entity.Property(notification => notification.EventType)
            .HasColumnName("event_type")
            .HasMaxLength(InAppNotificationConstraints.EventTypeMaxLength)
            .IsRequired();

        entity.Property(notification => notification.Status)
            .HasColumnName("status")
            .HasMaxLength(InAppNotificationConstraints.StatusMaxLength)
            .IsRequired();

        entity.Property(notification => notification.Priority)
            .HasColumnName("priority")
            .HasMaxLength(InAppNotificationConstraints.PriorityMaxLength)
            .IsRequired();

        entity.Property(notification => notification.SubjectType)
            .HasColumnName("subject_type")
            .HasMaxLength(InAppNotificationConstraints.SubjectTypeMaxLength)
            .IsRequired();

        entity.Property(notification => notification.TitleKey)
            .HasColumnName("title_key")
            .HasMaxLength(InAppNotificationConstraints.TemplateKeyMaxLength)
            .IsRequired();

        entity.Property(notification => notification.MessageKey)
            .HasColumnName("message_key")
            .HasMaxLength(InAppNotificationConstraints.TemplateKeyMaxLength)
            .IsRequired();

        entity.Property(notification => notification.SafeSummary)
            .HasColumnName("safe_summary")
            .HasMaxLength(InAppNotificationConstraints.SafeSummaryMaxLength);

        entity.Property(notification => notification.ActionUrl)
            .HasColumnName("action_url")
            .HasMaxLength(InAppNotificationConstraints.ActionUrlMaxLength);

        entity.Property(notification => notification.GroupId)
            .HasColumnName("group_id");

        entity.Property(notification => notification.ExpenseBillId)
            .HasColumnName("expense_bill_id");

        entity.Property(notification => notification.ExpenseBillRevisionId)
            .HasColumnName("expense_bill_revision_id");

        entity.Property(notification => notification.SettlementRequestId)
            .HasColumnName("settlement_request_id");

        entity.Property(notification => notification.SettlementPaymentId)
            .HasColumnName("settlement_payment_id");

        entity.Property(notification => notification.RecurringBillTemplateId)
            .HasColumnName("recurring_bill_template_id");

        entity.Property(notification => notification.RecurringBillOccurrenceId)
            .HasColumnName("recurring_bill_occurrence_id");

        entity.Property(notification => notification.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(notification => notification.ReadAtUtc)
            .HasColumnName("read_at_utc");

        entity.Property(notification => notification.ArchivedAtUtc)
            .HasColumnName("archived_at_utc");

        entity.HasIndex(notification => new
            {
                notification.RecipientUserProfileId,
                notification.Status,
                notification.CreatedAtUtc
            })
            .HasDatabaseName("ix_user_notifications_recipient_status_created");

        entity.HasIndex(notification => notification.RecipientUserProfileId)
            .HasDatabaseName("ix_user_notifications_recipient_user_profile_id");

        entity.HasIndex(notification => notification.ActorUserProfileId)
            .HasDatabaseName("ix_user_notifications_actor_user_profile_id");

        entity.HasIndex(notification => notification.GroupId)
            .HasDatabaseName("ix_user_notifications_group_id");

        entity.HasIndex(notification => notification.ExpenseBillId)
            .HasDatabaseName("ix_user_notifications_expense_bill_id");

        entity.HasIndex(notification => notification.ExpenseBillRevisionId)
            .HasDatabaseName("ix_user_notifications_expense_bill_revision_id");

        entity.HasIndex(notification => notification.SettlementRequestId)
            .HasDatabaseName("ix_user_notifications_settlement_request_id");

        entity.HasIndex(notification => notification.SettlementPaymentId)
            .HasDatabaseName("ix_user_notifications_settlement_payment_id");

        entity.HasIndex(notification => notification.RecurringBillTemplateId)
            .HasDatabaseName("ix_user_notifications_recurring_bill_template_id");

        entity.HasIndex(notification => notification.RecurringBillOccurrenceId)
            .HasDatabaseName("ix_user_notifications_recurring_bill_occurrence_id");

        entity.HasOne(notification => notification.RecipientUserProfile)
            .WithMany()
            .HasForeignKey(notification => notification.RecipientUserProfileId)
            .HasConstraintName("fk_user_notifications_recipient_user_profiles")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(notification => notification.ActorUserProfile)
            .WithMany()
            .HasForeignKey(notification => notification.ActorUserProfileId)
            .HasConstraintName("fk_user_notifications_actor_user_profiles")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(notification => notification.Group)
            .WithMany()
            .HasForeignKey(notification => notification.GroupId)
            .HasConstraintName("fk_user_notifications_user_groups_group_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(notification => notification.ExpenseBill)
            .WithMany()
            .HasForeignKey(notification => notification.ExpenseBillId)
            .HasConstraintName("fk_user_notifications_expense_bills_expense_bill_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(notification => notification.ExpenseBillRevision)
            .WithMany()
            .HasForeignKey(notification => notification.ExpenseBillRevisionId)
            .HasConstraintName("fk_user_notifications_expense_bill_revisions_revision_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(notification => notification.SettlementRequest)
            .WithMany()
            .HasForeignKey(notification => notification.SettlementRequestId)
            .HasConstraintName("fk_user_notifications_settlement_requests_request_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(notification => notification.SettlementPayment)
            .WithMany()
            .HasForeignKey(notification => notification.SettlementPaymentId)
            .HasConstraintName("fk_user_notifications_settlement_payments_payment_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(notification => notification.RecurringBillTemplate)
            .WithMany()
            .HasForeignKey(notification => notification.RecurringBillTemplateId)
            .HasConstraintName("fk_user_notifications_recurring_bill_templates_template_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(notification => notification.RecurringBillOccurrence)
            .WithMany()
            .HasForeignKey(notification => notification.RecurringBillOccurrenceId)
            .HasConstraintName("fk_user_notifications_recurring_bill_occurrences_occurrence_id")
            .OnDelete(DeleteBehavior.Restrict);
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

        entity.Property(bill => bill.BillOwnerUserProfileId)
            .HasColumnName("bill_owner_user_profile_id");

        entity.Property(bill => bill.ActiveAcceptedBillRevisionId)
            .HasColumnName("active_accepted_bill_revision_id");

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

        entity.HasIndex(bill => bill.BillOwnerUserProfileId)
            .HasDatabaseName("ix_expense_bills_bill_owner_user_profile_id");

        entity.HasIndex(bill => bill.ActiveAcceptedBillRevisionId)
            .HasDatabaseName("ix_expense_bills_active_accepted_revision_id");

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

        entity.HasOne(bill => bill.BillOwnerUserProfile)
            .WithMany()
            .HasForeignKey(bill => bill.BillOwnerUserProfileId)
            .HasConstraintName("fk_expense_bills_user_profiles_bill_owner_user_profile_id")
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
            table.HasCheckConstraint(
                "ck_expense_bill_items_source_kind",
                "source_kind IS NULL OR source_kind IN ('receipt_ocr_review_apply')");
            table.HasCheckConstraint(
                "ck_expense_bill_items_ocr_source_complete",
                "((source_kind IS NULL AND source_receipt_ocr_review_id IS NULL AND source_receipt_ocr_review_line_id IS NULL) OR (source_kind = 'receipt_ocr_review_apply' AND source_receipt_ocr_review_id IS NOT NULL AND source_receipt_ocr_review_line_id IS NOT NULL))");
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

        entity.Property(item => item.SourceKind)
            .HasColumnName("source_kind")
            .HasMaxLength(ExpenseBillConstraints.ItemSourceKindMaxLength);

        entity.Property(item => item.SourceReceiptOcrReviewId)
            .HasColumnName("source_receipt_ocr_review_id");

        entity.Property(item => item.SourceReceiptOcrReviewLineId)
            .HasColumnName("source_receipt_ocr_review_line_id");

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

        entity.HasIndex(item => item.SourceReceiptOcrReviewId)
            .HasDatabaseName("ix_expense_bill_items_source_review_id");

        entity.HasIndex(item => new
            {
                item.ExpenseBillId,
                item.SourceKind,
                item.SourceReceiptOcrReviewId
            })
            .HasDatabaseName("ix_expense_bill_items_bill_source_review");

        entity.HasIndex(item => item.SourceReceiptOcrReviewLineId)
            .HasDatabaseName("ix_expense_bill_items_source_review_line_id");

        entity.HasOne(item => item.ExpenseBill)
            .WithMany(bill => bill.Items)
            .HasForeignKey(item => item.ExpenseBillId)
            .HasConstraintName("fk_expense_bill_items_expense_bills_expense_bill_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne<ReceiptOcrReview>()
            .WithMany()
            .HasForeignKey(item => item.SourceReceiptOcrReviewId)
            .HasConstraintName("fk_expense_bill_items_receipt_ocr_reviews_source_review_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne<ReceiptOcrReviewLine>()
            .WithMany()
            .HasForeignKey(item => item.SourceReceiptOcrReviewLineId)
            .HasConstraintName("fk_expense_bill_items_receipt_ocr_review_lines_source_line_id")
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
            table.HasCheckConstraint(
                "ck_expense_bill_payers_confirmation_status",
                "payer_confirmation_status IN ('pending_confirmation', 'confirmed', 'rejected')");
        });

        entity.HasKey(payer => payer.Id);

        entity.Property(payer => payer.Id)
            .HasColumnName("id");

        entity.Property(payer => payer.ExpenseBillId)
            .HasColumnName("expense_bill_id");

        entity.Property(payer => payer.UserProfileId)
            .HasColumnName("user_profile_id");

        entity.Property(payer => payer.PayerFactsCreatedByUserProfileId)
            .HasColumnName("payer_facts_created_by_user_profile_id");

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

        entity.Property(payer => payer.PayerConfirmationStatus)
            .HasColumnName("payer_confirmation_status")
            .HasMaxLength(ExpenseBillConstraints.PayerConfirmationStatusMaxLength)
            .IsRequired();

        entity.Property(payer => payer.PayerConfirmedAtUtc)
            .HasColumnName("payer_confirmed_at_utc");

        entity.Property(payer => payer.PayerRejectedAtUtc)
            .HasColumnName("payer_rejected_at_utc");

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

        entity.HasIndex(payer => payer.PayerFactsCreatedByUserProfileId)
            .HasDatabaseName("ix_expense_bill_payers_facts_created_by_user_profile_id");

        entity.HasIndex(payer => payer.PayerConfirmationStatus)
            .HasDatabaseName("ix_expense_bill_payers_confirmation_status");

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

        entity.HasOne(payer => payer.PayerFactsCreatedByUserProfile)
            .WithMany()
            .HasForeignKey(payer => payer.PayerFactsCreatedByUserProfileId)
            .HasConstraintName("fk_expense_bill_payers_user_profiles_facts_created_by_user_profile_id")
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

    private static void ConfigureReceiptOcrReview(EntityTypeBuilder<ReceiptOcrReview> entity)
    {
        entity.ToTable("receipt_ocr_reviews", table =>
        {
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_status",
                "status IN ('provisional', 'reviewed')");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_source",
                "source IN ('on_device', 'manual_entry', 'imported_reviewed_data')");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_merchant_text_not_blank",
                "merchant_text IS NULL OR length(btrim(merchant_text)) > 0");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_currency_uppercase_iso",
                "currency IS NULL OR currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_amounts_require_currency",
                "(currency IS NOT NULL OR (subtotal_amount IS NULL AND tax_amount IS NULL AND service_charge_amount IS NULL AND discount_amount IS NULL AND grand_total_amount IS NULL))");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_subtotal_amount_non_negative",
                "subtotal_amount IS NULL OR subtotal_amount >= 0");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_tax_amount_non_negative",
                "tax_amount IS NULL OR tax_amount >= 0");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_service_charge_amount_non_negative",
                "service_charge_amount IS NULL OR service_charge_amount >= 0");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_discount_amount_non_negative",
                "discount_amount IS NULL OR discount_amount >= 0");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_grand_total_amount_non_negative",
                "grand_total_amount IS NULL OR grand_total_amount >= 0");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_subtotal_amount_upper_bound",
                "subtotal_amount IS NULL OR subtotal_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_tax_amount_upper_bound",
                "tax_amount IS NULL OR tax_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_service_charge_amount_upper_bound",
                "service_charge_amount IS NULL OR service_charge_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_discount_amount_upper_bound",
                "discount_amount IS NULL OR discount_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_receipt_ocr_reviews_grand_total_amount_upper_bound",
                "grand_total_amount IS NULL OR grand_total_amount <= 999999999999999.9999");
        });

        entity.HasKey(review => review.Id);

        entity.Property(review => review.Id)
            .HasColumnName("id");

        entity.Property(review => review.ExpenseBillId)
            .HasColumnName("expense_bill_id");

        entity.Property(review => review.FileObjectId)
            .HasColumnName("file_object_id");

        entity.Property(review => review.CreatedByUserProfileId)
            .HasColumnName("created_by_user_profile_id");

        entity.Property(review => review.GroupId)
            .HasColumnName("group_id");

        entity.Property(review => review.Status)
            .HasColumnName("status")
            .HasMaxLength(ReceiptOcrReviewConstraints.StatusMaxLength)
            .IsRequired();

        entity.Property(review => review.Source)
            .HasColumnName("source")
            .HasMaxLength(ReceiptOcrReviewConstraints.SourceMaxLength)
            .IsRequired();

        entity.Property(review => review.MerchantText)
            .HasColumnName("merchant_text")
            .HasMaxLength(ReceiptOcrReviewConstraints.MerchantTextMaxLength);

        entity.Property(review => review.ReceiptIssuedAtUtc)
            .HasColumnName("receipt_issued_at_utc");

        entity.Property(review => review.Currency)
            .HasColumnName("currency")
            .HasMaxLength(ReceiptOcrReviewConstraints.CurrencyMaxLength);

        entity.Property(review => review.SubtotalAmount)
            .HasColumnName("subtotal_amount")
            .HasPrecision(
                ReceiptOcrReviewConstraints.MoneyAmountPrecision,
                ReceiptOcrReviewConstraints.MoneyAmountScale);

        entity.Property(review => review.TaxAmount)
            .HasColumnName("tax_amount")
            .HasPrecision(
                ReceiptOcrReviewConstraints.MoneyAmountPrecision,
                ReceiptOcrReviewConstraints.MoneyAmountScale);

        entity.Property(review => review.ServiceChargeAmount)
            .HasColumnName("service_charge_amount")
            .HasPrecision(
                ReceiptOcrReviewConstraints.MoneyAmountPrecision,
                ReceiptOcrReviewConstraints.MoneyAmountScale);

        entity.Property(review => review.DiscountAmount)
            .HasColumnName("discount_amount")
            .HasPrecision(
                ReceiptOcrReviewConstraints.MoneyAmountPrecision,
                ReceiptOcrReviewConstraints.MoneyAmountScale);

        entity.Property(review => review.GrandTotalAmount)
            .HasColumnName("grand_total_amount")
            .HasPrecision(
                ReceiptOcrReviewConstraints.MoneyAmountPrecision,
                ReceiptOcrReviewConstraints.MoneyAmountScale);

        entity.Property(review => review.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(review => review.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(review => review.RemovedAtUtc)
            .HasColumnName("removed_at_utc");

        entity.HasIndex(review => new
            {
                review.ExpenseBillId,
                review.FileObjectId
            })
            .IsUnique()
            .HasFilter("removed_at_utc IS NULL")
            .HasDatabaseName("ux_receipt_ocr_reviews_active_bill_file");

        entity.HasIndex(review => review.FileObjectId)
            .HasDatabaseName("ix_receipt_ocr_reviews_file_object_id");

        entity.HasIndex(review => review.CreatedByUserProfileId)
            .HasDatabaseName("ix_receipt_ocr_reviews_created_by_profile_id");

        entity.HasIndex(review => review.GroupId)
            .HasDatabaseName("ix_receipt_ocr_reviews_group_id");

        entity.HasIndex(review => review.Status)
            .HasDatabaseName("ix_receipt_ocr_reviews_status");

        entity.HasIndex(review => review.RemovedAtUtc)
            .HasDatabaseName("ix_receipt_ocr_reviews_removed_at_utc");

        entity.HasOne(review => review.Attachment)
            .WithMany()
            .HasForeignKey(review => new
            {
                review.ExpenseBillId,
                review.FileObjectId
            })
            .HasConstraintName("fk_receipt_ocr_reviews_expense_bill_attachments_bill_file")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne<ExpenseBill>()
            .WithMany(bill => bill.ReceiptOcrReviews)
            .HasForeignKey(review => review.ExpenseBillId)
            .HasConstraintName("fk_receipt_ocr_reviews_expense_bills_bill_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(review => review.CreatedByUserProfile)
            .WithMany()
            .HasForeignKey(review => review.CreatedByUserProfileId)
            .HasConstraintName("fk_receipt_ocr_reviews_user_profiles_created_by")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(review => review.Group)
            .WithMany()
            .HasForeignKey(review => review.GroupId)
            .HasConstraintName("fk_receipt_ocr_reviews_user_groups_group_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureRecurringBillTemplate(EntityTypeBuilder<RecurringBillTemplate> entity)
    {
        entity.ToTable("recurring_bill_templates", table =>
        {
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_status",
                "status IN ('active', 'paused', 'archived')");
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_schedule_type",
                "schedule_type IN ('weekly', 'monthly', 'yearly', 'custom_interval_days')");
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_interval_count_positive",
                "interval_count IS NULL OR interval_count > 0");
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_interval_days_positive",
                "interval_days IS NULL OR interval_days > 0");
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_interval_shape",
                "(schedule_type = 'custom_interval_days' AND interval_days IS NOT NULL AND interval_count IS NULL) OR (schedule_type <> 'custom_interval_days' AND interval_count IS NOT NULL AND interval_days IS NULL)");
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_end_date_after_start",
                "end_date IS NULL OR end_date >= start_date");
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_due_offset_range",
                "due_offset_days IS NULL OR (due_offset_days >= -365 AND due_offset_days <= 365)");
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_payload_version_positive",
                "payload_version > 0");
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_payload_json_not_blank",
                "length(btrim(payload_json)) > 0");
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_forecast_amount_non_negative",
                "forecast_amount >= 0");
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_forecast_amount_upper_bound",
                "forecast_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_forecast_currency_iso",
                "forecast_currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_merchant_name_not_blank",
                "merchant_name IS NULL OR length(btrim(merchant_name)) > 0");
            table.HasCheckConstraint(
                "ck_recurring_bill_templates_description_not_blank",
                "description IS NULL OR length(btrim(description)) > 0");
        });

        entity.HasKey(template => template.Id);

        entity.Property(template => template.Id)
            .HasColumnName("id");

        entity.Property(template => template.OwnerUserProfileId)
            .HasColumnName("owner_user_profile_id");

        entity.Property(template => template.CreatedByUserProfileId)
            .HasColumnName("created_by_user_profile_id");

        entity.Property(template => template.GroupId)
            .HasColumnName("group_id");

        entity.Property(template => template.MerchantName)
            .HasColumnName("merchant_name")
            .HasMaxLength(RecurringBillConstraints.MerchantNameMaxLength);

        entity.Property(template => template.Description)
            .HasColumnName("description")
            .HasMaxLength(RecurringBillConstraints.DescriptionMaxLength);

        entity.Property(template => template.ScheduleType)
            .HasColumnName("schedule_type")
            .HasMaxLength(RecurringBillConstraints.ScheduleTypeMaxLength)
            .IsRequired();

        entity.Property(template => template.IntervalCount)
            .HasColumnName("interval_count");

        entity.Property(template => template.IntervalDays)
            .HasColumnName("interval_days");

        entity.Property(template => template.StartDate)
            .HasColumnName("start_date")
            .IsRequired();

        entity.Property(template => template.EndDate)
            .HasColumnName("end_date");

        entity.Property(template => template.DueOffsetDays)
            .HasColumnName("due_offset_days");

        entity.Property(template => template.NextOccurrenceDate)
            .HasColumnName("next_occurrence_date");

        entity.Property(template => template.Status)
            .HasColumnName("status")
            .HasMaxLength(RecurringBillConstraints.TemplateStatusMaxLength)
            .IsRequired();

        entity.Property(template => template.PayloadVersion)
            .HasColumnName("payload_version")
            .IsRequired();

        entity.Property(template => template.PayloadJson)
            .HasColumnName("payload_json")
            .HasMaxLength(RecurringBillConstraints.PayloadJsonMaxLength)
            .IsRequired();

        entity.Property(template => template.ForecastAmount)
            .HasColumnName("forecast_amount")
            .HasPrecision(
                RecurringBillConstraints.MoneyAmountPrecision,
                RecurringBillConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(template => template.ForecastCurrency)
            .HasColumnName("forecast_currency")
            .HasMaxLength(RecurringBillConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(template => template.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(template => template.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(template => template.ArchivedAtUtc)
            .HasColumnName("archived_at_utc");

        entity.HasIndex(template => template.OwnerUserProfileId)
            .HasDatabaseName("ix_recurring_bill_templates_owner_user_profile_id");

        entity.HasIndex(template => template.CreatedByUserProfileId)
            .HasDatabaseName("ix_recurring_bill_templates_created_by_profile_id");

        entity.HasIndex(template => template.GroupId)
            .HasDatabaseName("ix_recurring_bill_templates_group_id");

        entity.HasIndex(template => template.Status)
            .HasDatabaseName("ix_recurring_bill_templates_status");

        entity.HasIndex(template => template.NextOccurrenceDate)
            .HasDatabaseName("ix_recurring_bill_templates_next_occurrence_date");

        entity.HasIndex(template => new
            {
                template.OwnerUserProfileId,
                template.Status,
                template.NextOccurrenceDate
            })
            .HasDatabaseName("ix_recurring_bill_templates_owner_status_next");

        entity.HasOne(template => template.OwnerUserProfile)
            .WithMany()
            .HasForeignKey(template => template.OwnerUserProfileId)
            .HasConstraintName("fk_recurring_bill_templates_user_profiles_owner_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(template => template.CreatedByUserProfile)
            .WithMany()
            .HasForeignKey(template => template.CreatedByUserProfileId)
            .HasConstraintName("fk_recurring_bill_templates_user_profiles_created_by_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(template => template.Group)
            .WithMany()
            .HasForeignKey(template => template.GroupId)
            .HasConstraintName("fk_recurring_bill_templates_user_groups_group_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureRecurringBillOccurrence(EntityTypeBuilder<RecurringBillOccurrence> entity)
    {
        entity.ToTable("recurring_bill_occurrences", table =>
        {
            table.HasCheckConstraint(
                "ck_recurring_bill_occurrences_status",
                "status IN ('forecasted', 'draft_generated', 'skipped', 'cancelled')");
            table.HasCheckConstraint(
                "ck_recurring_bill_occurrences_generated_shape",
                "(status = 'draft_generated' AND generated_expense_bill_id IS NOT NULL AND generated_by_user_profile_id IS NOT NULL AND generated_at_utc IS NOT NULL) OR (status <> 'draft_generated')");
        });

        entity.HasKey(occurrence => occurrence.Id);

        entity.Property(occurrence => occurrence.Id)
            .HasColumnName("id");

        entity.Property(occurrence => occurrence.RecurringBillTemplateId)
            .HasColumnName("recurring_bill_template_id");

        entity.Property(occurrence => occurrence.OccurrenceDate)
            .HasColumnName("occurrence_date")
            .IsRequired();

        entity.Property(occurrence => occurrence.DueDate)
            .HasColumnName("due_date");

        entity.Property(occurrence => occurrence.Status)
            .HasColumnName("status")
            .HasMaxLength(RecurringBillConstraints.OccurrenceStatusMaxLength)
            .IsRequired();

        entity.Property(occurrence => occurrence.GeneratedExpenseBillId)
            .HasColumnName("generated_expense_bill_id");

        entity.Property(occurrence => occurrence.GeneratedByUserProfileId)
            .HasColumnName("generated_by_user_profile_id");

        entity.Property(occurrence => occurrence.GeneratedAtUtc)
            .HasColumnName("generated_at_utc");

        entity.Property(occurrence => occurrence.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(occurrence => occurrence.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(occurrence => occurrence.RecurringBillTemplateId)
            .HasDatabaseName("ix_recurring_bill_occurrences_template_id");

        entity.HasIndex(occurrence => occurrence.OccurrenceDate)
            .HasDatabaseName("ix_recurring_bill_occurrences_occurrence_date");

        entity.HasIndex(occurrence => occurrence.GeneratedExpenseBillId)
            .HasDatabaseName("ix_recurring_bill_occurrences_generated_bill_id");

        entity.HasIndex(occurrence => occurrence.GeneratedByUserProfileId)
            .HasDatabaseName("ix_recurring_bill_occurrences_generated_by_profile_id");

        entity.HasIndex(occurrence => new
            {
                occurrence.RecurringBillTemplateId,
                occurrence.OccurrenceDate
            })
            .IsUnique()
            .HasDatabaseName("ux_recurring_bill_occurrences_template_date");

        entity.HasOne(occurrence => occurrence.RecurringBillTemplate)
            .WithMany(template => template.Occurrences)
            .HasForeignKey(occurrence => occurrence.RecurringBillTemplateId)
            .HasConstraintName("fk_recurring_bill_occurrences_templates_template_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(occurrence => occurrence.GeneratedExpenseBill)
            .WithMany()
            .HasForeignKey(occurrence => occurrence.GeneratedExpenseBillId)
            .HasConstraintName("fk_recurring_bill_occurrences_expense_bills_generated_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(occurrence => occurrence.GeneratedByUserProfile)
            .WithMany()
            .HasForeignKey(occurrence => occurrence.GeneratedByUserProfileId)
            .HasConstraintName("fk_recurring_bill_occurrences_user_profiles_generated_by_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureReceiptOcrReviewLine(EntityTypeBuilder<ReceiptOcrReviewLine> entity)
    {
        entity.ToTable("receipt_ocr_review_lines", table =>
        {
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_lines_sort_order_non_negative",
                "sort_order >= 0");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_lines_text_not_blank",
                "length(btrim(text)) > 0");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_lines_quantity_positive",
                "quantity IS NULL OR quantity > 0");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_lines_quantity_upper_bound",
                "quantity IS NULL OR quantity <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_lines_unit_price_non_negative",
                "unit_price_amount IS NULL OR unit_price_amount >= 0");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_lines_line_total_non_negative",
                "line_total_amount IS NULL OR line_total_amount >= 0");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_lines_unit_price_upper_bound",
                "unit_price_amount IS NULL OR unit_price_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_lines_line_total_upper_bound",
                "line_total_amount IS NULL OR line_total_amount <= 999999999999999.9999");
        });

        entity.HasKey(line => line.Id);

        entity.Property(line => line.Id)
            .HasColumnName("id");

        entity.Property(line => line.ReceiptOcrReviewId)
            .HasColumnName("receipt_ocr_review_id");

        entity.Property(line => line.SortOrder)
            .HasColumnName("sort_order")
            .IsRequired();

        entity.Property(line => line.Text)
            .HasColumnName("text")
            .HasMaxLength(ReceiptOcrReviewConstraints.LineTextMaxLength)
            .IsRequired();

        entity.Property(line => line.Quantity)
            .HasColumnName("quantity")
            .HasPrecision(
                ReceiptOcrReviewConstraints.QuantityPrecision,
                ReceiptOcrReviewConstraints.QuantityScale);

        entity.Property(line => line.UnitPriceAmount)
            .HasColumnName("unit_price_amount")
            .HasPrecision(
                ReceiptOcrReviewConstraints.MoneyAmountPrecision,
                ReceiptOcrReviewConstraints.MoneyAmountScale);

        entity.Property(line => line.LineTotalAmount)
            .HasColumnName("line_total_amount")
            .HasPrecision(
                ReceiptOcrReviewConstraints.MoneyAmountPrecision,
                ReceiptOcrReviewConstraints.MoneyAmountScale);

        entity.Property(line => line.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(line => line.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(line => line.ReceiptOcrReviewId)
            .HasDatabaseName("ix_receipt_ocr_review_lines_review_id");

        entity.HasIndex(line => new
            {
                line.ReceiptOcrReviewId,
                line.SortOrder
            })
            .IsUnique()
            .HasDatabaseName("ux_receipt_ocr_review_lines_review_sort_order");

        entity.HasOne(line => line.ReceiptOcrReview)
            .WithMany(review => review.Lines)
            .HasForeignKey(line => line.ReceiptOcrReviewId)
            .HasConstraintName("fk_receipt_ocr_review_lines_reviews_review_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureExpenseBillRevision(EntityTypeBuilder<ExpenseBillRevision> entity)
    {
        entity.ToTable("expense_bill_revisions", table =>
        {
            table.HasCheckConstraint(
                "ck_expense_bill_revisions_status",
                "status IN ('draft_revision', 'submitted_for_review', 'withdrawn_by_proposer', 'superseded_by_resubmission', 'rejected', 'accepted_applied', 'cancelled_by_authorized_editor')");
            table.HasCheckConstraint(
                "ck_expense_bill_revisions_total_amount_non_negative",
                "total_amount >= 0");
            table.HasCheckConstraint(
                "ck_expense_bill_revisions_total_amount_upper_bound",
                "total_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_expense_bill_revisions_total_currency_uppercase_iso",
                "total_currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_expense_bill_revisions_calculation_hash_not_blank",
                "length(btrim(calculation_hash)) > 0");
        });

        entity.HasKey(revision => revision.Id);

        entity.Property(revision => revision.Id)
            .HasColumnName("id");

        entity.Property(revision => revision.ExpenseBillId)
            .HasColumnName("expense_bill_id");

        entity.Property(revision => revision.ProposalCreatorUserProfileId)
            .HasColumnName("proposal_creator_user_profile_id");

        entity.Property(revision => revision.SupersedesExpenseBillRevisionId)
            .HasColumnName("supersedes_expense_bill_revision_id");

        entity.Property(revision => revision.SupersededByExpenseBillRevisionId)
            .HasColumnName("superseded_by_expense_bill_revision_id");

        entity.Property(revision => revision.Status)
            .HasColumnName("status")
            .HasMaxLength(ExpenseBillConstraints.BillRevisionStatusMaxLength)
            .IsRequired();

        entity.Property(revision => revision.TotalAmount)
            .HasColumnName("total_amount")
            .HasPrecision(
                ExpenseBillConstraints.MoneyAmountPrecision,
                ExpenseBillConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(revision => revision.TotalCurrency)
            .HasColumnName("total_currency")
            .HasMaxLength(ExpenseBillConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(revision => revision.CalculationHash)
            .HasColumnName("calculation_hash")
            .HasMaxLength(ExpenseBillConstraints.BillRevisionCalculationHashMaxLength)
            .IsRequired();

        entity.Property(revision => revision.SubmittedAtUtc)
            .HasColumnName("submitted_at_utc");

        entity.Property(revision => revision.WithdrawnAtUtc)
            .HasColumnName("withdrawn_at_utc");

        entity.Property(revision => revision.SupersededAtUtc)
            .HasColumnName("superseded_at_utc");

        entity.Property(revision => revision.RejectedAtUtc)
            .HasColumnName("rejected_at_utc");

        entity.Property(revision => revision.AppliedAtUtc)
            .HasColumnName("applied_at_utc");

        entity.Property(revision => revision.CancelledAtUtc)
            .HasColumnName("cancelled_at_utc");

        entity.Property(revision => revision.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(revision => revision.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(revision => revision.ProposalCreatorUserProfileId)
            .HasDatabaseName("ix_expense_bill_revisions_creator_user_profile_id");

        entity.HasIndex(revision => revision.Status)
            .HasDatabaseName("ix_expense_bill_revisions_status");

        entity.HasIndex(revision => revision.ExpenseBillId)
            .IsUnique()
            .HasFilter("status IN ('draft_revision', 'submitted_for_review')")
            .HasDatabaseName("ux_expense_bill_revisions_one_active_pending_per_bill");

        entity.HasOne(revision => revision.ExpenseBill)
            .WithMany(bill => bill.Revisions)
            .HasForeignKey(revision => revision.ExpenseBillId)
            .HasConstraintName("fk_expense_bill_revisions_expense_bills_bill_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(revision => revision.ProposalCreatorUserProfile)
            .WithMany()
            .HasForeignKey(revision => revision.ProposalCreatorUserProfileId)
            .HasConstraintName("fk_expense_bill_revisions_user_profiles_creator_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureExpenseBillRevisionParticipant(EntityTypeBuilder<ExpenseBillRevisionParticipant> entity)
    {
        entity.ToTable("expense_bill_revision_participants", table =>
        {
            table.HasCheckConstraint(
                "ck_expense_bill_revision_participants_share_amount_non_negative",
                "resolved_share_amount >= 0");
            table.HasCheckConstraint(
                "ck_expense_bill_revision_participants_share_amount_upper_bound",
                "resolved_share_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_expense_bill_revision_participants_share_currency_iso",
                "resolved_share_currency ~ '^[A-Z]{3}$'");
        });

        entity.HasKey(participant => new
        {
            participant.ExpenseBillRevisionId,
            participant.UserProfileId
        });

        entity.Property(participant => participant.ExpenseBillRevisionId)
            .HasColumnName("expense_bill_revision_id");

        entity.Property(participant => participant.UserProfileId)
            .HasColumnName("user_profile_id");

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

        entity.Property(participant => participant.AffectedByRevision)
            .HasColumnName("affected_by_revision")
            .IsRequired();

        entity.Property(participant => participant.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(participant => participant.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(participant => participant.UserProfileId)
            .HasDatabaseName("ix_expense_bill_revision_participants_user_profile_id");

        entity.HasIndex(participant => participant.AffectedByRevision)
            .HasDatabaseName("ix_expense_bill_revision_participants_affected");

        entity.HasOne(participant => participant.ExpenseBillRevision)
            .WithMany(revision => revision.Participants)
            .HasForeignKey(participant => participant.ExpenseBillRevisionId)
            .HasConstraintName("fk_expense_bill_revision_participants_revisions_revision_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(participant => participant.UserProfile)
            .WithMany()
            .HasForeignKey(participant => participant.UserProfileId)
            .HasConstraintName("fk_expense_bill_revision_participants_user_profiles_user_profile_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureExpenseBillRevisionPayer(EntityTypeBuilder<ExpenseBillRevisionPayer> entity)
    {
        entity.ToTable("expense_bill_revision_payers", table =>
        {
            table.HasCheckConstraint(
                "ck_expense_bill_revision_payers_amount_non_negative",
                "amount >= 0");
            table.HasCheckConstraint(
                "ck_expense_bill_revision_payers_amount_upper_bound",
                "amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_expense_bill_revision_payers_currency_uppercase_iso",
                "currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_expense_bill_revision_payers_confirmation_status",
                "payer_confirmation_status IN ('pending_confirmation', 'confirmed', 'rejected')");
        });

        entity.HasKey(payer => new
        {
            payer.ExpenseBillRevisionId,
            payer.UserProfileId
        });

        entity.Property(payer => payer.ExpenseBillRevisionId)
            .HasColumnName("expense_bill_revision_id");

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

        entity.Property(payer => payer.RequiresPayerConfirmation)
            .HasColumnName("requires_payer_confirmation")
            .IsRequired();

        entity.Property(payer => payer.PayerConfirmationStatus)
            .HasColumnName("payer_confirmation_status")
            .HasMaxLength(ExpenseBillConstraints.PayerConfirmationStatusMaxLength)
            .IsRequired();

        entity.Property(payer => payer.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(payer => payer.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(payer => payer.UserProfileId)
            .HasDatabaseName("ix_expense_bill_revision_payers_user_profile_id");

        entity.HasIndex(payer => payer.RequiresPayerConfirmation)
            .HasDatabaseName("ix_expense_bill_revision_payers_requires_confirmation");

        entity.HasOne(payer => payer.ExpenseBillRevision)
            .WithMany(revision => revision.Payers)
            .HasForeignKey(payer => payer.ExpenseBillRevisionId)
            .HasConstraintName("fk_expense_bill_revision_payers_revisions_revision_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(payer => payer.UserProfile)
            .WithMany()
            .HasForeignKey(payer => payer.UserProfileId)
            .HasConstraintName("fk_expense_bill_revision_payers_user_profiles_user_profile_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureExpenseBillRevisionApproval(EntityTypeBuilder<ExpenseBillRevisionApproval> entity)
    {
        entity.ToTable("expense_bill_revision_approvals", table =>
        {
            table.HasCheckConstraint(
                "ck_expense_bill_revision_approvals_status",
                "status IN ('pending_review', 'approved', 'rejected', 'invalidated_by_supersession')");
            table.HasCheckConstraint(
                "ck_expense_bill_revision_approvals_accepted_amount_non_negative",
                "accepted_amount >= 0");
            table.HasCheckConstraint(
                "ck_expense_bill_revision_approvals_accepted_amount_upper_bound",
                "accepted_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_expense_bill_revision_approvals_currency_uppercase_iso",
                "currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_expense_bill_revision_approvals_calculation_hash_not_blank",
                "length(btrim(calculation_hash)) > 0");
        });

        entity.HasKey(approval => approval.Id);

        entity.Property(approval => approval.Id)
            .HasColumnName("id");

        entity.Property(approval => approval.ExpenseBillRevisionId)
            .HasColumnName("expense_bill_revision_id");

        entity.Property(approval => approval.ParticipantUserProfileId)
            .HasColumnName("participant_user_profile_id");

        entity.Property(approval => approval.AcceptedAmount)
            .HasColumnName("accepted_amount")
            .HasPrecision(
                ExpenseBillConstraints.MoneyAmountPrecision,
                ExpenseBillConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(approval => approval.Currency)
            .HasColumnName("currency")
            .HasMaxLength(ExpenseBillConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(approval => approval.CalculationHash)
            .HasColumnName("calculation_hash")
            .HasMaxLength(ExpenseBillConstraints.BillRevisionCalculationHashMaxLength)
            .IsRequired();

        entity.Property(approval => approval.Status)
            .HasColumnName("status")
            .HasMaxLength(ExpenseBillConstraints.BillRevisionApprovalStatusMaxLength)
            .IsRequired();

        entity.Property(approval => approval.ApprovedAtUtc)
            .HasColumnName("approved_at_utc");

        entity.Property(approval => approval.RejectedAtUtc)
            .HasColumnName("rejected_at_utc");

        entity.Property(approval => approval.InvalidatedAtUtc)
            .HasColumnName("invalidated_at_utc");

        entity.Property(approval => approval.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(approval => approval.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(approval => approval.ExpenseBillRevisionId)
            .HasDatabaseName("ix_expense_bill_revision_approvals_revision_id");

        entity.HasIndex(approval => approval.ParticipantUserProfileId)
            .HasDatabaseName("ix_expense_bill_revision_approvals_participant_user_profile_id");

        entity.HasIndex(approval => approval.Status)
            .HasDatabaseName("ix_expense_bill_revision_approvals_status");

        entity.HasIndex(approval => new
            {
                approval.ExpenseBillRevisionId,
                approval.ParticipantUserProfileId
            })
            .IsUnique()
            .HasDatabaseName("ux_expense_bill_revision_approvals_revision_participant");

        entity.HasOne(approval => approval.ExpenseBillRevision)
            .WithMany(revision => revision.Approvals)
            .HasForeignKey(approval => approval.ExpenseBillRevisionId)
            .HasConstraintName("fk_expense_bill_revision_approvals_revisions_revision_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(approval => approval.ParticipantUserProfile)
            .WithMany()
            .HasForeignKey(approval => approval.ParticipantUserProfileId)
            .HasConstraintName("fk_expense_bill_revision_approvals_user_profiles_participant_id")
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

    private static void ConfigureSettlementRequestLine(EntityTypeBuilder<SettlementRequestLine> entity)
    {
        entity.ToTable("settlement_request_lines", table =>
        {
            table.HasCheckConstraint(
                "ck_settlement_request_lines_status",
                "status IN ('open', 'partially_cleared', 'cleared', 'waived', 'disputed', 'cancelled')");
            table.HasCheckConstraint(
                "ck_settlement_request_lines_exact_amount_positive",
                "exact_amount > 0");
            table.HasCheckConstraint(
                "ck_settlement_request_lines_exact_amount_upper_bound",
                "exact_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_settlement_request_lines_currency_uppercase_iso",
                "currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_settlement_request_lines_allocation_order_non_negative",
                "allocation_order >= 0");
            table.HasCheckConstraint(
                "ck_settlement_request_lines_source_candidate_key_not_blank",
                "source_candidate_key IS NULL OR length(btrim(source_candidate_key)) > 0");
        });

        entity.HasKey(line => line.Id);

        entity.Property(line => line.Id)
            .HasColumnName("id");

        entity.Property(line => line.SettlementRequestId)
            .HasColumnName("settlement_request_id");

        entity.Property(line => line.SourceExpenseBillId)
            .HasColumnName("source_expense_bill_id");

        entity.Property(line => line.SourceBillRevisionId)
            .HasColumnName("source_bill_revision_id");

        entity.Property(line => line.SourceCandidateKey)
            .HasColumnName("source_candidate_key")
            .HasMaxLength(SettlementConstraints.SourceCandidateKeyMaxLength);

        entity.Property(line => line.ExactAmount)
            .HasColumnName("exact_amount")
            .HasPrecision(
                SettlementConstraints.MoneyAmountPrecision,
                SettlementConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(line => line.Currency)
            .HasColumnName("currency")
            .HasMaxLength(SettlementConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(line => line.AllocationOrder)
            .HasColumnName("allocation_order")
            .IsRequired();

        entity.Property(line => line.Status)
            .HasColumnName("status")
            .HasMaxLength(SettlementConstraints.RequestLineStatusMaxLength)
            .IsRequired();

        entity.Property(line => line.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(line => line.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(line => line.SettlementRequestId)
            .HasDatabaseName("ix_settlement_request_lines_settlement_request_id");

        entity.HasIndex(line => line.SourceExpenseBillId)
            .HasDatabaseName("ix_settlement_request_lines_source_expense_bill_id");

        entity.HasIndex(line => line.SourceBillRevisionId)
            .HasDatabaseName("ix_settlement_request_lines_source_bill_revision_id");

        entity.HasIndex(line => line.Status)
            .HasDatabaseName("ix_settlement_request_lines_status");

        entity.HasIndex(line => new
            {
                line.SettlementRequestId,
                line.AllocationOrder
            })
            .HasDatabaseName("ix_settlement_request_lines_request_order");

        entity.HasIndex(line => new
            {
                line.SettlementRequestId,
                line.Status
            })
            .HasDatabaseName("ix_settlement_request_lines_request_status");

        entity.HasOne(line => line.SettlementRequest)
            .WithMany(request => request.Lines)
            .HasForeignKey(line => line.SettlementRequestId)
            .HasConstraintName("fk_settlement_request_lines_settlement_requests_request_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(line => line.SourceExpenseBill)
            .WithMany()
            .HasForeignKey(line => line.SourceExpenseBillId)
            .HasConstraintName("fk_settlement_request_lines_expense_bills_source_bill_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(line => line.SourceBillRevision)
            .WithMany()
            .HasForeignKey(line => line.SourceBillRevisionId)
            .HasConstraintName("fk_settlement_request_lines_expense_bill_revisions_source_revision_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSettlementPaymentAllocation(EntityTypeBuilder<SettlementPaymentAllocation> entity)
    {
        entity.ToTable("settlement_payment_allocations", table =>
        {
            table.HasCheckConstraint(
                "ck_settlement_payment_allocations_cleared_amount_positive",
                "cleared_amount > 0");
            table.HasCheckConstraint(
                "ck_settlement_payment_allocations_cleared_amount_upper_bound",
                "cleared_amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_settlement_payment_allocations_currency_uppercase_iso",
                "currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_settlement_payment_allocations_allocation_order_non_negative",
                "allocation_order >= 0");
        });

        entity.HasKey(allocation => allocation.Id);

        entity.Property(allocation => allocation.Id)
            .HasColumnName("id");

        entity.Property(allocation => allocation.SettlementPaymentId)
            .HasColumnName("settlement_payment_id");

        entity.Property(allocation => allocation.SettlementRequestLineId)
            .HasColumnName("settlement_request_line_id");

        entity.Property(allocation => allocation.ClearedAmount)
            .HasColumnName("cleared_amount")
            .HasPrecision(
                SettlementConstraints.MoneyAmountPrecision,
                SettlementConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(allocation => allocation.Currency)
            .HasColumnName("currency")
            .HasMaxLength(SettlementConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(allocation => allocation.AllocationOrder)
            .HasColumnName("allocation_order")
            .IsRequired();

        entity.Property(allocation => allocation.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.HasIndex(allocation => allocation.SettlementPaymentId)
            .HasDatabaseName("ix_settlement_payment_allocations_settlement_payment_id");

        entity.HasIndex(allocation => allocation.SettlementRequestLineId)
            .HasDatabaseName("ix_settlement_payment_allocations_request_line_id");

        entity.HasIndex(allocation => new
            {
                allocation.SettlementPaymentId,
                allocation.AllocationOrder
            })
            .HasDatabaseName("ix_settlement_payment_allocations_payment_order");

        entity.HasOne(allocation => allocation.SettlementPayment)
            .WithMany(payment => payment.Allocations)
            .HasForeignKey(allocation => allocation.SettlementPaymentId)
            .HasConstraintName("fk_settlement_payment_allocations_payments_payment_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(allocation => allocation.SettlementRequestLine)
            .WithMany(line => line.PaymentAllocations)
            .HasForeignKey(allocation => allocation.SettlementRequestLineId)
            .HasConstraintName("fk_settlement_payment_allocations_request_lines_line_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSettlementResidual(EntityTypeBuilder<SettlementResidual> entity)
    {
        entity.ToTable("settlement_residuals", table =>
        {
            table.HasCheckConstraint(
                "ck_settlement_residuals_direction",
                "direction IN ('underpayment', 'overpayment')");
            table.HasCheckConstraint(
                "ck_settlement_residuals_policy",
                "policy IN ('remaining_balance', 'carried_forward', 'waived', 'credit_forward', 'waived_by_payer', 'applied_to_other_line')");
            table.HasCheckConstraint(
                "ck_settlement_residuals_status",
                "status IN ('pending_receiver_confirmation', 'confirmed', 'carried_forward', 'waived', 'credited', 'disputed', 'cancelled')");
            table.HasCheckConstraint(
                "ck_settlement_residuals_amount_positive",
                "amount > 0");
            table.HasCheckConstraint(
                "ck_settlement_residuals_amount_upper_bound",
                "amount <= 999999999999999.9999");
            table.HasCheckConstraint(
                "ck_settlement_residuals_currency_uppercase_iso",
                "currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_settlement_residuals_debtor_creditor_distinct",
                "debtor_user_profile_id <> creditor_user_profile_id");
            table.HasCheckConstraint(
                "ck_settlement_residuals_payment_or_request_present",
                "settlement_payment_id IS NOT NULL OR settlement_request_id IS NOT NULL");
            table.HasCheckConstraint(
                "ck_settlement_residuals_reason_not_blank",
                "reason IS NULL OR length(btrim(reason)) > 0");
        });

        entity.HasKey(residual => residual.Id);

        entity.Property(residual => residual.Id)
            .HasColumnName("id");

        entity.Property(residual => residual.SettlementPaymentId)
            .HasColumnName("settlement_payment_id");

        entity.Property(residual => residual.SettlementRequestId)
            .HasColumnName("settlement_request_id");

        entity.Property(residual => residual.DebtorUserProfileId)
            .HasColumnName("debtor_user_profile_id");

        entity.Property(residual => residual.CreditorUserProfileId)
            .HasColumnName("creditor_user_profile_id");

        entity.Property(residual => residual.Direction)
            .HasColumnName("direction")
            .HasMaxLength(SettlementConstraints.ResidualDirectionMaxLength)
            .IsRequired();

        entity.Property(residual => residual.Amount)
            .HasColumnName("amount")
            .HasPrecision(
                SettlementConstraints.MoneyAmountPrecision,
                SettlementConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(residual => residual.Currency)
            .HasColumnName("currency")
            .HasMaxLength(SettlementConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(residual => residual.Policy)
            .HasColumnName("policy")
            .HasMaxLength(SettlementConstraints.ResidualPolicyMaxLength)
            .IsRequired();

        entity.Property(residual => residual.Status)
            .HasColumnName("status")
            .HasMaxLength(SettlementConstraints.ResidualStatusMaxLength)
            .IsRequired();

        entity.Property(residual => residual.Reason)
            .HasColumnName("reason")
            .HasMaxLength(SettlementConstraints.ResidualReasonMaxLength);

        entity.Property(residual => residual.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(residual => residual.ResolvedAtUtc)
            .HasColumnName("resolved_at_utc");

        entity.HasIndex(residual => residual.SettlementPaymentId)
            .HasDatabaseName("ix_settlement_residuals_settlement_payment_id");

        entity.HasIndex(residual => residual.SettlementRequestId)
            .HasDatabaseName("ix_settlement_residuals_settlement_request_id");

        entity.HasIndex(residual => residual.DebtorUserProfileId)
            .HasDatabaseName("ix_settlement_residuals_debtor_user_profile_id");

        entity.HasIndex(residual => residual.CreditorUserProfileId)
            .HasDatabaseName("ix_settlement_residuals_creditor_user_profile_id");

        entity.HasIndex(residual => residual.Status)
            .HasDatabaseName("ix_settlement_residuals_status");

        entity.HasIndex(residual => new
            {
                residual.DebtorUserProfileId,
                residual.CreditorUserProfileId,
                residual.Currency,
                residual.Status
            })
            .HasDatabaseName("ix_settlement_residuals_counterparty_currency_status");

        entity.HasIndex(residual => residual.CreatedAtUtc)
            .HasDatabaseName("ix_settlement_residuals_created_at_utc");

        entity.HasIndex(residual => residual.ResolvedAtUtc)
            .HasDatabaseName("ix_settlement_residuals_resolved_at_utc");

        entity.HasOne(residual => residual.SettlementPayment)
            .WithMany(payment => payment.Residuals)
            .HasForeignKey(residual => residual.SettlementPaymentId)
            .HasConstraintName("fk_settlement_residuals_payments_payment_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(residual => residual.SettlementRequest)
            .WithMany(request => request.Residuals)
            .HasForeignKey(residual => residual.SettlementRequestId)
            .HasConstraintName("fk_settlement_residuals_requests_request_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(residual => residual.DebtorUserProfile)
            .WithMany()
            .HasForeignKey(residual => residual.DebtorUserProfileId)
            .HasConstraintName("fk_settlement_residuals_user_profiles_debtor_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(residual => residual.CreditorUserProfile)
            .WithMany()
            .HasForeignKey(residual => residual.CreditorUserProfileId)
            .HasConstraintName("fk_settlement_residuals_user_profiles_creditor_id")
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
