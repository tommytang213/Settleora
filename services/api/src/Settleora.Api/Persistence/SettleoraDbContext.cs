using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Expenses;
using Settleora.Api.Domain.Files;
using Settleora.Api.Domain.Finance;
using Settleora.Api.Domain.Notifications;
using Settleora.Api.Domain.RecurringBills;
using Settleora.Api.Domain.Settlements;
using Settleora.Api.Domain.Sync;
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
    private const int AuthPasskeyCredentialIdHashMaxLength = 256;
    private const int AuthPasskeyCredentialPublicKeyCoseMaxLength = 8192;
    private const int AuthPasskeyCredentialUserHandleHashMaxLength = 128;
    private const int AuthPasskeyCredentialTransportsMaxLength = 256;
    private const int AuthPasskeyCredentialAttestationPolicyResultMaxLength = 64;
    private const int AuthPasskeyCredentialDisplayLabelMaxLength = 120;
    private const int AuthPasskeyCredentialStatusMaxLength = 16;
    private const int AuthPasskeyCredentialStatusReasonMaxLength = 120;
    private const int AuthMfaFactorTypeMaxLength = 32;
    private const int AuthMfaFactorStatusMaxLength = 16;
    private const int AuthMfaFactorDisplayLabelMaxLength = 120;
    private const int AuthMfaFactorTotpSecretStorageKindMaxLength = 32;
    private const int AuthMfaFactorTotpProtectedSecretReferenceMaxLength = 256;
    private const int AuthMfaFactorTotpEncryptedSecretPayloadMaxLength = 8192;
    private const int AuthMfaFactorTotpIssuerMaxLength = 120;
    private const int AuthMfaFactorTotpAccountLabelMaxLength = 320;
    private const int AuthMfaFactorTotpAlgorithmMaxLength = 32;
    private const int AuthMfaFactorPolicyVersionMaxLength = 32;
    private const int AuthMfaFactorStatusReasonMaxLength = 120;
    private const int AuthRecoveryCodeBatchStatusMaxLength = 16;
    private const int AuthRecoveryCodeBatchPolicyVersionMaxLength = 32;
    private const int AuthRecoveryCodeBatchStatusReasonMaxLength = 120;
    private const int AuthRecoveryCodeVerifierHashMaxLength = 256;
    private const int AuthRecoveryCodeVerifierSaltMaxLength = 128;
    private const int AuthRecoveryCodeVerifierAlgorithmMaxLength = 64;
    private const int AuthRecoveryCodeVerifierParametersMaxLength = 1024;
    private const int AuthRecoveryCodeVerifierStatusMaxLength = 16;
    private const int AuthChallengePurposeMaxLength = 32;
    private const int AuthChallengeFactorTypeMaxLength = 32;
    private const int AuthChallengeStatusMaxLength = 32;
    private const int AuthChallengeVerifierHashMaxLength = 256;
    private const int AuthChallengeVerifierAlgorithmMaxLength = 64;
    private const int AuthChallengeBoundRpIdMaxLength = 255;
    private const int AuthChallengeBoundOriginMaxLength = 512;
    private const int AuthChallengeRequestContextHashMaxLength = 128;
    private const int AuthChallengeFailureCategoryMaxLength = 120;
    private const int AuthSecurityPolicyStatusMaxLength = 16;
    private const int AuthSecurityPolicySupportModeMaxLength = 32;
    private const int AuthSecurityPolicyEnforcementModeMaxLength = 32;
    private const int AuthSecurityPolicyChangeReasonCategoryMaxLength = 120;
    private const int BillCsvImportSessionScopeMaxLength = 16;
    private const int BillCsvImportSessionStatusMaxLength = 32;
    private const int BillCsvImportSessionPayloadDigestMaxLength = 96;
    private const int BillCsvImportSessionTokenMaxLength = 64;

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
        modelBuilder.Entity<BillCsvImportSession>(ConfigureBillCsvImportSession);
        modelBuilder.Entity<ExpenseBillAttachment>(ConfigureExpenseBillAttachment);
        modelBuilder.Entity<ReceiptOcrReview>(ConfigureReceiptOcrReview);
        modelBuilder.Entity<ReceiptOcrReviewAssignment>(ConfigureReceiptOcrReviewAssignment);
        modelBuilder.Entity<ReceiptOcrReviewLine>(ConfigureReceiptOcrReviewLine);
        modelBuilder.Entity<ManualFinancialAccount>(ConfigureManualFinancialAccount);
        modelBuilder.Entity<ManualIncomeSource>(ConfigureManualIncomeSource);
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
        modelBuilder.Entity<AuthPasskeyCredential>(ConfigureAuthPasskeyCredential);
        modelBuilder.Entity<AuthMfaFactor>(ConfigureAuthMfaFactor);
        modelBuilder.Entity<AuthRecoveryCodeBatch>(ConfigureAuthRecoveryCodeBatch);
        modelBuilder.Entity<AuthRecoveryCodeVerifier>(ConfigureAuthRecoveryCodeVerifier);
        modelBuilder.Entity<AuthChallenge>(ConfigureAuthChallenge);
        modelBuilder.Entity<AuthSecurityPolicy>(ConfigureAuthSecurityPolicy);
        modelBuilder.Entity<SystemRoleAssignment>(ConfigureSystemRoleAssignment);
        modelBuilder.Entity<FileObject>(ConfigureFileObject);
        modelBuilder.Entity<InAppNotification>(ConfigureInAppNotification);
        modelBuilder.Entity<NotificationDeliveryAttempt>(ConfigureNotificationDeliveryAttempt);
        modelBuilder.Entity<UserNotificationPreference>(ConfigureUserNotificationPreference);
        modelBuilder.Entity<SyncOperation>(ConfigureSyncOperation);
        modelBuilder.Entity<SyncResourceVersion>(ConfigureSyncResourceVersion);
    }

    private static void ConfigureBillCsvImportSession(EntityTypeBuilder<BillCsvImportSession> entity)
    {
        entity.ToTable("bill_csv_import_sessions", table =>
        {
            table.HasCheckConstraint(
                "ck_bill_csv_import_sessions_scope",
                "scope IN ('personal', 'group')");
            table.HasCheckConstraint(
                "ck_bill_csv_import_sessions_status",
                "status IN ('needs_correction', 'ready_for_confirmation', 'confirmed', 'discarded', 'expired')");
            table.HasCheckConstraint(
                "ck_bill_csv_import_sessions_group_scope",
                "(scope = 'group') = (group_id IS NOT NULL)");
            table.HasCheckConstraint(
                "ck_bill_csv_import_sessions_row_counts",
                "row_count >= 0 AND accepted_row_count >= 0 AND warning_row_count >= 0 AND rejected_row_count >= 0 AND duplicate_candidate_row_count >= 0");
        });

        entity.HasKey(session => session.Id);

        entity.Property(session => session.Id)
            .HasColumnName("id");

        entity.Property(session => session.AuthAccountId)
            .HasColumnName("auth_account_id")
            .IsRequired();

        entity.Property(session => session.AuthSessionId)
            .HasColumnName("auth_session_id")
            .IsRequired();

        entity.Property(session => session.ActorUserProfileId)
            .HasColumnName("actor_user_profile_id")
            .IsRequired();

        entity.Property(session => session.Scope)
            .HasColumnName("scope")
            .HasMaxLength(BillCsvImportSessionScopeMaxLength)
            .IsRequired();

        entity.Property(session => session.GroupId)
            .HasColumnName("group_id");

        entity.Property(session => session.Status)
            .HasColumnName("status")
            .HasMaxLength(BillCsvImportSessionStatusMaxLength)
            .IsRequired();

        entity.Property(session => session.PayloadDigest)
            .HasColumnName("payload_digest")
            .HasMaxLength(BillCsvImportSessionPayloadDigestMaxLength)
            .IsRequired();

        entity.Property(session => session.PreflightResultVersion)
            .HasColumnName("preflight_result_version")
            .HasMaxLength(BillCsvImportSessionTokenMaxLength)
            .IsRequired();

        entity.Property(session => session.ConfirmationChallengeId)
            .HasColumnName("confirmation_challenge_id")
            .HasMaxLength(BillCsvImportSessionTokenMaxLength)
            .IsRequired();

        entity.Property(session => session.ReviewJson)
            .HasColumnName("review_json")
            .HasColumnType("jsonb")
            .IsRequired();

        entity.Property(session => session.CandidateJson)
            .HasColumnName("candidate_json")
            .HasColumnType("jsonb")
            .IsRequired();

        entity.Property(session => session.RowCount)
            .HasColumnName("row_count")
            .IsRequired();

        entity.Property(session => session.AcceptedRowCount)
            .HasColumnName("accepted_row_count")
            .IsRequired();

        entity.Property(session => session.WarningRowCount)
            .HasColumnName("warning_row_count")
            .IsRequired();

        entity.Property(session => session.RejectedRowCount)
            .HasColumnName("rejected_row_count")
            .IsRequired();

        entity.Property(session => session.DuplicateCandidateRowCount)
            .HasColumnName("duplicate_candidate_row_count")
            .IsRequired();

        entity.Property(session => session.ExpiresAtUtc)
            .HasColumnName("expires_at_utc")
            .IsRequired();

        entity.Property(session => session.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(session => session.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(session => session.ConfirmedAtUtc)
            .HasColumnName("confirmed_at_utc");

        entity.Property(session => session.DiscardedAtUtc)
            .HasColumnName("discarded_at_utc");

        entity.HasIndex(session => session.ActorUserProfileId)
            .HasDatabaseName("ix_bill_csv_import_sessions_actor_user_profile_id");

        entity.HasIndex(session => session.AuthSessionId)
            .HasDatabaseName("ix_bill_csv_import_sessions_auth_session_id");

        entity.HasIndex(session => session.GroupId)
            .HasDatabaseName("ix_bill_csv_import_sessions_group_id");

        entity.HasIndex(session => new { session.ActorUserProfileId, session.Status, session.ExpiresAtUtc })
            .HasDatabaseName("ix_bill_csv_import_sessions_actor_status_expires");

        entity.HasOne(session => session.AuthAccount)
            .WithMany()
            .HasForeignKey(session => session.AuthAccountId)
            .HasConstraintName("fk_bill_csv_import_sessions_auth_accounts")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(session => session.AuthSession)
            .WithMany()
            .HasForeignKey(session => session.AuthSessionId)
            .HasConstraintName("fk_bill_csv_import_sessions_auth_sessions")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(session => session.ActorUserProfile)
            .WithMany()
            .HasForeignKey(session => session.ActorUserProfileId)
            .HasConstraintName("fk_bill_csv_import_sessions_actor_user_profiles")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(session => session.Group)
            .WithMany()
            .HasForeignKey(session => session.GroupId)
            .HasConstraintName("fk_bill_csv_import_sessions_user_groups")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureUserNotificationPreference(EntityTypeBuilder<UserNotificationPreference> entity)
    {
        entity.ToTable("user_notification_preferences", table =>
        {
            table.HasCheckConstraint(
                "ck_user_notification_preferences_delivery_timing",
                "delivery_timing IN ('immediate', 'digest_readout')");
            table.HasCheckConstraint(
                "ck_user_notification_preferences_quiet_start_hour",
                "quiet_hours_start_hour >= 0 AND quiet_hours_start_hour <= 23");
            table.HasCheckConstraint(
                "ck_user_notification_preferences_quiet_end_hour",
                "quiet_hours_end_hour >= 0 AND quiet_hours_end_hour <= 23");
            table.HasCheckConstraint(
                "ck_user_notification_preferences_sync_security_required",
                "sync_security_enabled = TRUE");
        });

        entity.HasKey(preference => preference.UserProfileId);

        entity.Property(preference => preference.UserProfileId)
            .HasColumnName("user_profile_id");

        entity.Property(preference => preference.InAppEnabled)
            .HasColumnName("in_app_enabled")
            .IsRequired();

        entity.Property(preference => preference.BillsEnabled)
            .HasColumnName("bills_enabled")
            .IsRequired();

        entity.Property(preference => preference.SettlementsEnabled)
            .HasColumnName("settlements_enabled")
            .IsRequired();

        entity.Property(preference => preference.RecurringEnabled)
            .HasColumnName("recurring_enabled")
            .IsRequired();

        entity.Property(preference => preference.SyncSecurityEnabled)
            .HasColumnName("sync_security_enabled")
            .IsRequired();

        entity.Property(preference => preference.QuietHoursEnabled)
            .HasColumnName("quiet_hours_enabled")
            .IsRequired();

        entity.Property(preference => preference.QuietHoursStartHour)
            .HasColumnName("quiet_hours_start_hour")
            .IsRequired();

        entity.Property(preference => preference.QuietHoursEndHour)
            .HasColumnName("quiet_hours_end_hour")
            .IsRequired();

        entity.Property(preference => preference.DeliveryTiming)
            .HasColumnName("delivery_timing")
            .HasMaxLength(NotificationPreferenceConstraints.DeliveryTimingMaxLength)
            .IsRequired();

        entity.Property(preference => preference.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(preference => preference.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasOne(preference => preference.UserProfile)
            .WithMany()
            .HasForeignKey(preference => preference.UserProfileId)
            .HasConstraintName("fk_user_notification_preferences_user_profiles")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureManualFinancialAccount(EntityTypeBuilder<ManualFinancialAccount> entity)
    {
        entity.ToTable("manual_financial_accounts", table =>
        {
            table.HasCheckConstraint(
                "ck_manual_financial_accounts_account_type",
                "account_type IN ('cash', 'bank_account', 'stored_value', 'other')");
            table.HasCheckConstraint(
                "ck_manual_financial_accounts_status",
                "status IN ('active', 'archived')");
            table.HasCheckConstraint(
                "ck_manual_financial_accounts_currency_upper",
                "current_balance_currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_manual_financial_accounts_display_name_not_blank",
                "length(btrim(display_name)) > 0");
            table.HasCheckConstraint(
                "ck_manual_financial_accounts_archived_status_pair",
                "(status = 'archived') = (archived_at_utc IS NOT NULL)");
        });

        entity.HasKey(account => account.Id);

        entity.Property(account => account.Id)
            .HasColumnName("id");

        entity.Property(account => account.OwnerUserProfileId)
            .HasColumnName("owner_user_profile_id");

        entity.Property(account => account.DisplayName)
            .HasColumnName("display_name")
            .HasMaxLength(ManualFinanceConstraints.DisplayNameMaxLength)
            .IsRequired();

        entity.Property(account => account.AccountType)
            .HasColumnName("account_type")
            .HasMaxLength(ManualFinanceConstraints.AccountTypeMaxLength)
            .IsRequired();

        entity.Property(account => account.CurrentBalanceAmount)
            .HasColumnName("current_balance_amount")
            .HasPrecision(ManualFinanceConstraints.MoneyAmountPrecision, ManualFinanceConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(account => account.CurrentBalanceCurrency)
            .HasColumnName("current_balance_currency")
            .HasMaxLength(ManualFinanceConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(account => account.BalanceAsOfDate)
            .HasColumnName("balance_as_of_date")
            .IsRequired();

        entity.Property(account => account.Note)
            .HasColumnName("note")
            .HasMaxLength(ManualFinanceConstraints.NoteMaxLength);

        entity.Property(account => account.Status)
            .HasColumnName("status")
            .HasMaxLength(ManualFinanceConstraints.AccountStatusMaxLength)
            .IsRequired();

        entity.Property(account => account.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(account => account.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(account => account.ArchivedAtUtc)
            .HasColumnName("archived_at_utc");

        entity.HasIndex(account => new
            {
                account.OwnerUserProfileId,
                account.Status,
                account.DisplayName
            })
            .HasDatabaseName("ix_manual_financial_accounts_owner_status_name");

        entity.HasOne(account => account.OwnerUserProfile)
            .WithMany()
            .HasForeignKey(account => account.OwnerUserProfileId)
            .HasConstraintName("fk_manual_financial_accounts_owner_user_profiles")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureManualIncomeSource(EntityTypeBuilder<ManualIncomeSource> entity)
    {
        entity.ToTable("manual_income_sources", table =>
        {
            table.HasCheckConstraint(
                "ck_manual_income_sources_cadence",
                "cadence IN ('one_time', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')");
            table.HasCheckConstraint(
                "ck_manual_income_sources_status",
                "status IN ('active', 'archived')");
            table.HasCheckConstraint(
                "ck_manual_income_sources_currency_upper",
                "currency ~ '^[A-Z]{3}$'");
            table.HasCheckConstraint(
                "ck_manual_income_sources_display_name_not_blank",
                "length(btrim(display_name)) > 0");
            table.HasCheckConstraint(
                "ck_manual_income_sources_end_date_order",
                "end_date IS NULL OR end_date >= next_expected_date");
            table.HasCheckConstraint(
                "ck_manual_income_sources_archived_status_pair",
                "(status = 'archived') = (archived_at_utc IS NOT NULL)");
        });

        entity.HasKey(income => income.Id);

        entity.Property(income => income.Id)
            .HasColumnName("id");

        entity.Property(income => income.OwnerUserProfileId)
            .HasColumnName("owner_user_profile_id");

        entity.Property(income => income.ManualFinancialAccountId)
            .HasColumnName("manual_financial_account_id");

        entity.Property(income => income.DisplayName)
            .HasColumnName("display_name")
            .HasMaxLength(ManualFinanceConstraints.DisplayNameMaxLength)
            .IsRequired();

        entity.Property(income => income.Amount)
            .HasColumnName("amount")
            .HasPrecision(ManualFinanceConstraints.MoneyAmountPrecision, ManualFinanceConstraints.MoneyAmountScale)
            .IsRequired();

        entity.Property(income => income.Currency)
            .HasColumnName("currency")
            .HasMaxLength(ManualFinanceConstraints.CurrencyMaxLength)
            .IsRequired();

        entity.Property(income => income.Cadence)
            .HasColumnName("cadence")
            .HasMaxLength(ManualFinanceConstraints.IncomeCadenceMaxLength)
            .IsRequired();

        entity.Property(income => income.NextExpectedDate)
            .HasColumnName("next_expected_date")
            .IsRequired();

        entity.Property(income => income.EndDate)
            .HasColumnName("end_date");

        entity.Property(income => income.Note)
            .HasColumnName("note")
            .HasMaxLength(ManualFinanceConstraints.NoteMaxLength);

        entity.Property(income => income.Status)
            .HasColumnName("status")
            .HasMaxLength(ManualFinanceConstraints.IncomeStatusMaxLength)
            .IsRequired();

        entity.Property(income => income.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(income => income.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(income => income.ArchivedAtUtc)
            .HasColumnName("archived_at_utc");

        entity.HasIndex(income => new
            {
                income.OwnerUserProfileId,
                income.Status,
                income.NextExpectedDate
            })
            .HasDatabaseName("ix_manual_income_sources_owner_status_next");

        entity.HasIndex(income => income.ManualFinancialAccountId)
            .HasDatabaseName("ix_manual_income_sources_manual_financial_account_id");

        entity.HasOne(income => income.OwnerUserProfile)
            .WithMany()
            .HasForeignKey(income => income.OwnerUserProfileId)
            .HasConstraintName("fk_manual_income_sources_owner_user_profiles")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(income => income.ManualFinancialAccount)
            .WithMany()
            .HasForeignKey(income => income.ManualFinancialAccountId)
            .HasConstraintName("fk_manual_income_sources_manual_financial_accounts")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSyncOperation(EntityTypeBuilder<SyncOperation> entity)
    {
        entity.ToTable("sync_operations", table =>
        {
            table.HasCheckConstraint(
                "ck_sync_operations_idempotency_key_not_blank",
                "length(btrim(idempotency_key)) > 0");
            table.HasCheckConstraint(
                "ck_sync_operations_payload_hash_lower_hex",
                "request_payload_hash ~ '^[a-f0-9]{64}$'");
            table.HasCheckConstraint(
                "ck_sync_operations_operation_type",
                "operation_type IN ('bill_archive', 'bill_restore')");
            table.HasCheckConstraint(
                "ck_sync_operations_resource_type",
                "resource_type IN ('expense_bill')");
            table.HasCheckConstraint(
                "ck_sync_operations_status",
                "status IN ('accepted', 'rejected', 'conflict')");
            table.HasCheckConstraint(
                "ck_sync_operations_base_version_non_negative",
                "base_version IS NULL OR base_version >= 0");
            table.HasCheckConstraint(
                "ck_sync_operations_result_version_positive",
                "result_version IS NULL OR result_version > 0");
            table.HasCheckConstraint(
                "ck_sync_operations_safe_error_code_not_blank",
                "safe_error_code IS NULL OR length(btrim(safe_error_code)) > 0");
            table.HasCheckConstraint(
                "ck_sync_operations_result_pair",
                "((status = 'accepted' AND result_resource_id IS NOT NULL AND result_version IS NOT NULL AND safe_error_code IS NULL) OR (status <> 'accepted'))");
        });

        entity.HasKey(operation => operation.Id);

        entity.Property(operation => operation.Id)
            .HasColumnName("id");

        entity.Property(operation => operation.ActorUserProfileId)
            .HasColumnName("actor_user_profile_id");

        entity.Property(operation => operation.IdempotencyKey)
            .HasColumnName("idempotency_key")
            .HasMaxLength(SyncConstraints.IdempotencyKeyMaxLength)
            .IsRequired();

        entity.Property(operation => operation.RequestPayloadHash)
            .HasColumnName("request_payload_hash")
            .HasMaxLength(SyncConstraints.RequestPayloadHashMaxLength)
            .IsRequired();

        entity.Property(operation => operation.OperationType)
            .HasColumnName("operation_type")
            .HasMaxLength(SyncConstraints.OperationTypeMaxLength)
            .IsRequired();

        entity.Property(operation => operation.ResourceType)
            .HasColumnName("resource_type")
            .HasMaxLength(SyncConstraints.ResourceTypeMaxLength)
            .IsRequired();

        entity.Property(operation => operation.ResourceId)
            .HasColumnName("resource_id");

        entity.Property(operation => operation.BaseVersion)
            .HasColumnName("base_version");

        entity.Property(operation => operation.Status)
            .HasColumnName("status")
            .HasMaxLength(SyncConstraints.OperationStatusMaxLength)
            .IsRequired();

        entity.Property(operation => operation.ResultResourceId)
            .HasColumnName("result_resource_id");

        entity.Property(operation => operation.ResultVersion)
            .HasColumnName("result_version");

        entity.Property(operation => operation.SafeErrorCode)
            .HasColumnName("safe_error_code")
            .HasMaxLength(SyncConstraints.SafeErrorCodeMaxLength);

        entity.Property(operation => operation.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(operation => operation.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.HasIndex(operation => new
            {
                operation.ActorUserProfileId,
                operation.IdempotencyKey
            })
            .IsUnique()
            .HasDatabaseName("ux_sync_operations_actor_idempotency_key");

        entity.HasIndex(operation => new
            {
                operation.ActorUserProfileId,
                operation.Status,
                operation.CreatedAtUtc
            })
            .HasDatabaseName("ix_sync_operations_actor_status_created");

        entity.HasIndex(operation => new
            {
                operation.ResourceType,
                operation.ResourceId
            })
            .HasDatabaseName("ix_sync_operations_resource");

        entity.HasOne(operation => operation.ActorUserProfile)
            .WithMany()
            .HasForeignKey(operation => operation.ActorUserProfileId)
            .HasConstraintName("fk_sync_operations_actor_user_profiles")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSyncResourceVersion(EntityTypeBuilder<SyncResourceVersion> entity)
    {
        entity.ToTable("sync_resource_versions", table =>
        {
            table.HasCheckConstraint(
                "ck_sync_resource_versions_resource_type",
                "resource_type IN ('expense_bill')");
            table.HasCheckConstraint(
                "ck_sync_resource_versions_version_positive",
                "version > 0");
            table.HasCheckConstraint(
                "ck_sync_resource_versions_change_kind",
                "change_kind IN ('updated', 'archived', 'restored')");
            table.HasCheckConstraint(
                "ck_sync_resource_versions_visibility_scope",
                "owner_user_profile_id IS NOT NULL OR group_id IS NOT NULL");
        });

        entity.HasKey(version => version.Id);

        entity.Property(version => version.Id)
            .HasColumnName("id");

        entity.Property(version => version.ResourceType)
            .HasColumnName("resource_type")
            .HasMaxLength(SyncConstraints.ResourceTypeMaxLength)
            .IsRequired();

        entity.Property(version => version.ResourceId)
            .HasColumnName("resource_id");

        entity.Property(version => version.Version)
            .HasColumnName("version")
            .IsRequired();

        entity.Property(version => version.ChangeKind)
            .HasColumnName("change_kind")
            .HasMaxLength(SyncConstraints.ChangeKindMaxLength)
            .IsRequired();

        entity.Property(version => version.ChangedAtUtc)
            .HasColumnName("changed_at_utc")
            .IsRequired();

        entity.Property(version => version.ChangedByUserProfileId)
            .HasColumnName("changed_by_user_profile_id");

        entity.Property(version => version.OwnerUserProfileId)
            .HasColumnName("owner_user_profile_id");

        entity.Property(version => version.GroupId)
            .HasColumnName("group_id");

        entity.Property(version => version.IsArchived)
            .HasColumnName("is_archived")
            .IsRequired();

        entity.HasIndex(version => new
            {
                version.ResourceType,
                version.ResourceId
            })
            .IsUnique()
            .HasDatabaseName("ux_sync_resource_versions_resource");

        entity.HasIndex(version => version.Version)
            .IsUnique()
            .HasDatabaseName("ux_sync_resource_versions_version");

        entity.HasIndex(version => new
            {
                version.ResourceType,
                version.Version
            })
            .HasDatabaseName("ix_sync_resource_versions_resource_type_version");

        entity.HasIndex(version => new
            {
                version.OwnerUserProfileId,
                version.Version
            })
            .HasDatabaseName("ix_sync_resource_versions_owner_version");

        entity.HasIndex(version => new
            {
                version.GroupId,
                version.Version
            })
            .HasDatabaseName("ix_sync_resource_versions_group_version");

        entity.HasOne(version => version.ChangedByUserProfile)
            .WithMany()
            .HasForeignKey(version => version.ChangedByUserProfileId)
            .HasConstraintName("fk_sync_resource_versions_changed_by_user_profiles")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(version => version.OwnerUserProfile)
            .WithMany()
            .HasForeignKey(version => version.OwnerUserProfileId)
            .HasConstraintName("fk_sync_resource_versions_owner_user_profiles")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(version => version.Group)
            .WithMany()
            .HasForeignKey(version => version.GroupId)
            .HasConstraintName("fk_sync_resource_versions_user_groups_group_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureInAppNotification(EntityTypeBuilder<InAppNotification> entity)
    {
        entity.ToTable("user_notifications", table =>
        {
            table.HasCheckConstraint(
                "ck_user_notifications_event_type",
                "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'bill.revision_proposed', 'bill.revision_resubmitted', 'bill.revision_submitted', 'bill.revision_withdrawn', 'bill.revision_approved', 'bill.revision_rejected', 'bill.revision_payer_confirmed', 'bill.revision_applied', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'recurring_bill.due_soon', 'recurring_bill.draft_generated', 'sync.conflict_detected', 'ocr.needs_review')");
            table.HasCheckConstraint(
                "ck_user_notifications_status",
                "status IN ('unread', 'read', 'archived')");
            table.HasCheckConstraint(
                "ck_user_notifications_priority",
                "priority IN ('normal', 'attention', 'urgent')");
            table.HasCheckConstraint(
                "ck_user_notifications_subject_type",
                "subject_type IN ('expense_bill', 'settlement_request', 'settlement_payment', 'recurring_bill_occurrence', 'sync_operation', 'receipt_ocr_review')");
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

        entity.Property(notification => notification.ReceiptOcrReviewId)
            .HasColumnName("receipt_ocr_review_id");

        entity.Property(notification => notification.ReceiptAttachmentFileId)
            .HasColumnName("receipt_attachment_file_id");

        entity.Property(notification => notification.SyncOperationId)
            .HasColumnName("sync_operation_id");

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

        entity.HasIndex(notification => notification.ReceiptOcrReviewId)
            .HasDatabaseName("ix_user_notifications_receipt_ocr_review_id");

        entity.HasIndex(notification => notification.ReceiptAttachmentFileId)
            .HasDatabaseName("ix_user_notifications_receipt_attachment_file_id");

        entity.HasIndex(notification => notification.SyncOperationId)
            .HasDatabaseName("ix_user_notifications_sync_operation_id");

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

        entity.HasOne(notification => notification.ReceiptOcrReview)
            .WithMany()
            .HasForeignKey(notification => notification.ReceiptOcrReviewId)
            .HasConstraintName("fk_user_notifications_receipt_ocr_reviews_review_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(notification => notification.ReceiptAttachmentFile)
            .WithMany()
            .HasForeignKey(notification => notification.ReceiptAttachmentFileId)
            .HasConstraintName("fk_user_notifications_file_objects_receipt_attachment_file_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(notification => notification.SyncOperation)
            .WithMany()
            .HasForeignKey(notification => notification.SyncOperationId)
            .HasConstraintName("fk_user_notifications_sync_operations_operation_id")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureNotificationDeliveryAttempt(EntityTypeBuilder<NotificationDeliveryAttempt> entity)
    {
        entity.ToTable("notification_delivery_attempts", table =>
        {
            table.HasCheckConstraint(
                "ck_notification_delivery_attempts_channel",
                "channel IN ('email', 'mobile_push')");
            table.HasCheckConstraint(
                "ck_notification_delivery_attempts_status",
                "status IN ('not_applicable', 'disabled', 'unconfigured', 'deferred', 'queued', 'suppressed', 'cancelled', 'expired')");
            table.HasCheckConstraint(
                "ck_notification_delivery_attempts_status_reason",
                "status_reason IN ('future_provider_eligible', 'required_bypass_policy_not_configured', 'channel_unsupported_for_event', 'disabled_by_policy', 'disabled_by_user_preference', 'provider_unconfigured', 'device_availability_unconfigured', 'quiet_hours_deferred', 'digest_readout_deferred', 'unsafe_external_content', 'recipient_unauthorized', 'event_type_unsupported', 'subject_type_unsupported', 'unsafe_notification_content', 'source_domain_ineligible', 'recipient_profile_unavailable', 'unsafe_delivery_attempt_request')");
            table.HasCheckConstraint(
                "ck_notification_delivery_attempts_event_type",
                "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'bill.revision_proposed', 'bill.revision_resubmitted', 'bill.revision_submitted', 'bill.revision_withdrawn', 'bill.revision_approved', 'bill.revision_rejected', 'bill.revision_payer_confirmed', 'bill.revision_applied', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'recurring_bill.due_soon', 'recurring_bill.draft_generated', 'sync.conflict_detected', 'ocr.needs_review')");
            table.HasCheckConstraint(
                "ck_notification_delivery_attempts_subject_type",
                "subject_type IN ('expense_bill', 'settlement_request', 'settlement_payment', 'recurring_bill_occurrence', 'sync_operation', 'receipt_ocr_review')");
            table.HasCheckConstraint(
                "ck_notification_delivery_attempts_idempotency_key_not_blank",
                "length(btrim(idempotency_key)) > 0");
            table.HasCheckConstraint(
                "ck_notification_delivery_attempts_source_correlation_not_blank",
                "source_correlation_id IS NULL OR length(btrim(source_correlation_id)) > 0");
            table.HasCheckConstraint(
                "ck_notification_delivery_attempts_attempt_count_non_negative",
                "attempt_count >= 0");
            table.HasCheckConstraint(
                "ck_notification_delivery_attempts_no_provider_runtime_status",
                "status NOT IN ('attempting', 'sent', 'failed_transient', 'failed_permanent', 'delivered')");
            table.HasCheckConstraint(
                "ck_notification_delivery_attempts_provider_result_completion",
                "redacted_provider_result_category IS NULL OR completed_at_utc IS NOT NULL");
            table.HasCheckConstraint(
                "ck_notification_delivery_attempts_provider_result_not_blank",
                "redacted_provider_result_category IS NULL OR length(btrim(redacted_provider_result_category)) > 0");
        });

        entity.HasKey(attempt => attempt.Id);

        entity.Property(attempt => attempt.Id)
            .HasColumnName("id");

        entity.Property(attempt => attempt.InAppNotificationId)
            .HasColumnName("in_app_notification_id");

        entity.Property(attempt => attempt.RecipientUserProfileId)
            .HasColumnName("recipient_user_profile_id")
            .IsRequired();

        entity.Property(attempt => attempt.ActorUserProfileId)
            .HasColumnName("actor_user_profile_id");

        entity.Property(attempt => attempt.EventType)
            .HasColumnName("event_type")
            .HasMaxLength(InAppNotificationConstraints.EventTypeMaxLength)
            .IsRequired();

        entity.Property(attempt => attempt.SubjectType)
            .HasColumnName("subject_type")
            .HasMaxLength(InAppNotificationConstraints.SubjectTypeMaxLength)
            .IsRequired();

        entity.Property(attempt => attempt.Channel)
            .HasColumnName("channel")
            .HasMaxLength(NotificationDeliveryAttemptConstraints.ChannelMaxLength)
            .IsRequired();

        entity.Property(attempt => attempt.Status)
            .HasColumnName("status")
            .HasMaxLength(NotificationDeliveryAttemptConstraints.StatusMaxLength)
            .IsRequired();

        entity.Property(attempt => attempt.StatusReason)
            .HasColumnName("status_reason")
            .HasMaxLength(NotificationDeliveryAttemptConstraints.StatusReasonMaxLength)
            .IsRequired();

        entity.Property(attempt => attempt.IdempotencyKey)
            .HasColumnName("idempotency_key")
            .HasMaxLength(NotificationDeliveryAttemptConstraints.IdempotencyKeyMaxLength)
            .IsRequired();

        entity.Property(attempt => attempt.SourceCorrelationId)
            .HasColumnName("source_correlation_id")
            .HasMaxLength(NotificationDeliveryAttemptConstraints.SourceCorrelationIdMaxLength);

        entity.Property(attempt => attempt.AttemptCount)
            .HasColumnName("attempt_count")
            .IsRequired();

        entity.Property(attempt => attempt.NextAttemptAtUtc)
            .HasColumnName("next_attempt_at_utc");

        entity.Property(attempt => attempt.ExpiresAtUtc)
            .HasColumnName("expires_at_utc");

        entity.Property(attempt => attempt.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(attempt => attempt.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(attempt => attempt.CompletedAtUtc)
            .HasColumnName("completed_at_utc");

        entity.Property(attempt => attempt.RedactedProviderResultCategory)
            .HasColumnName("redacted_provider_result_category")
            .HasMaxLength(NotificationDeliveryAttemptConstraints.RedactedProviderResultCategoryMaxLength);

        entity.Property(attempt => attempt.GroupId)
            .HasColumnName("group_id");

        entity.Property(attempt => attempt.ExpenseBillId)
            .HasColumnName("expense_bill_id");

        entity.Property(attempt => attempt.ExpenseBillRevisionId)
            .HasColumnName("expense_bill_revision_id");

        entity.Property(attempt => attempt.SettlementRequestId)
            .HasColumnName("settlement_request_id");

        entity.Property(attempt => attempt.SettlementPaymentId)
            .HasColumnName("settlement_payment_id");

        entity.Property(attempt => attempt.RecurringBillTemplateId)
            .HasColumnName("recurring_bill_template_id");

        entity.Property(attempt => attempt.RecurringBillOccurrenceId)
            .HasColumnName("recurring_bill_occurrence_id");

        entity.Property(attempt => attempt.ReceiptOcrReviewId)
            .HasColumnName("receipt_ocr_review_id");

        entity.Property(attempt => attempt.ReceiptAttachmentFileId)
            .HasColumnName("receipt_attachment_file_id");

        entity.Property(attempt => attempt.SyncOperationId)
            .HasColumnName("sync_operation_id");

        entity.HasIndex(attempt => attempt.IdempotencyKey)
            .IsUnique()
            .HasDatabaseName("ux_notification_delivery_attempts_idempotency_key");

        entity.HasIndex(attempt => new
            {
                attempt.RecipientUserProfileId,
                attempt.Channel,
                attempt.Status,
                attempt.CreatedAtUtc
            })
            .HasDatabaseName("ix_notification_delivery_attempts_recipient_channel_status");

        entity.HasIndex(attempt => new
            {
                attempt.Channel,
                attempt.Status,
                attempt.NextAttemptAtUtc
            })
            .HasDatabaseName("ix_notification_delivery_attempts_channel_status_next_attempt");

        entity.HasIndex(attempt => attempt.InAppNotificationId)
            .HasDatabaseName("ix_notification_delivery_attempts_in_app_notification_id");

        entity.HasIndex(attempt => attempt.RecipientUserProfileId)
            .HasDatabaseName("ix_notification_delivery_attempts_recipient_user_profile_id");

        entity.HasIndex(attempt => attempt.ActorUserProfileId)
            .HasDatabaseName("ix_notification_delivery_attempts_actor_user_profile_id");

        entity.HasIndex(attempt => attempt.GroupId)
            .HasDatabaseName("ix_notification_delivery_attempts_group_id");

        entity.HasIndex(attempt => attempt.ExpenseBillId)
            .HasDatabaseName("ix_notification_delivery_attempts_expense_bill_id");

        entity.HasIndex(attempt => attempt.ExpenseBillRevisionId)
            .HasDatabaseName("ix_notification_delivery_attempts_expense_bill_revision_id");

        entity.HasIndex(attempt => attempt.SettlementRequestId)
            .HasDatabaseName("ix_notification_delivery_attempts_settlement_request_id");

        entity.HasIndex(attempt => attempt.SettlementPaymentId)
            .HasDatabaseName("ix_notification_delivery_attempts_settlement_payment_id");

        entity.HasIndex(attempt => attempt.RecurringBillTemplateId)
            .HasDatabaseName("ix_notification_delivery_attempts_recurring_bill_template_id");

        entity.HasIndex(attempt => attempt.RecurringBillOccurrenceId)
            .HasDatabaseName("ix_notification_delivery_attempts_recurring_bill_occurrence_id");

        entity.HasIndex(attempt => attempt.ReceiptOcrReviewId)
            .HasDatabaseName("ix_notification_delivery_attempts_receipt_ocr_review_id");

        entity.HasIndex(attempt => attempt.ReceiptAttachmentFileId)
            .HasDatabaseName("ix_notification_delivery_attempts_receipt_attachment_file_id");

        entity.HasIndex(attempt => attempt.SyncOperationId)
            .HasDatabaseName("ix_notification_delivery_attempts_sync_operation_id");

        entity.HasOne(attempt => attempt.InAppNotification)
            .WithMany()
            .HasForeignKey(attempt => attempt.InAppNotificationId)
            .HasConstraintName("fk_notification_delivery_attempts_user_notifications")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attempt => attempt.RecipientUserProfile)
            .WithMany()
            .HasForeignKey(attempt => attempt.RecipientUserProfileId)
            .HasConstraintName("fk_notification_delivery_attempts_recipient_user_profiles")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attempt => attempt.ActorUserProfile)
            .WithMany()
            .HasForeignKey(attempt => attempt.ActorUserProfileId)
            .HasConstraintName("fk_notification_delivery_attempts_actor_user_profiles")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attempt => attempt.Group)
            .WithMany()
            .HasForeignKey(attempt => attempt.GroupId)
            .HasConstraintName("fk_notification_delivery_attempts_user_groups_group_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attempt => attempt.ExpenseBill)
            .WithMany()
            .HasForeignKey(attempt => attempt.ExpenseBillId)
            .HasConstraintName("fk_notification_delivery_attempts_expense_bills_expense_bill_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attempt => attempt.ExpenseBillRevision)
            .WithMany()
            .HasForeignKey(attempt => attempt.ExpenseBillRevisionId)
            .HasConstraintName("fk_notification_delivery_attempts_expense_bill_revisions")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attempt => attempt.SettlementRequest)
            .WithMany()
            .HasForeignKey(attempt => attempt.SettlementRequestId)
            .HasConstraintName("fk_notification_delivery_attempts_settlement_requests")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attempt => attempt.SettlementPayment)
            .WithMany()
            .HasForeignKey(attempt => attempt.SettlementPaymentId)
            .HasConstraintName("fk_notification_delivery_attempts_settlement_payments")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attempt => attempt.RecurringBillTemplate)
            .WithMany()
            .HasForeignKey(attempt => attempt.RecurringBillTemplateId)
            .HasConstraintName("fk_notification_delivery_attempts_recurring_templates")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attempt => attempt.RecurringBillOccurrence)
            .WithMany()
            .HasForeignKey(attempt => attempt.RecurringBillOccurrenceId)
            .HasConstraintName("fk_notification_delivery_attempts_recurring_occurrences")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attempt => attempt.ReceiptOcrReview)
            .WithMany()
            .HasForeignKey(attempt => attempt.ReceiptOcrReviewId)
            .HasConstraintName("fk_notification_delivery_attempts_receipt_ocr_reviews_review_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attempt => attempt.ReceiptAttachmentFile)
            .WithMany()
            .HasForeignKey(attempt => attempt.ReceiptAttachmentFileId)
            .HasConstraintName("fk_notification_delivery_attempts_file_objects_receipt")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(attempt => attempt.SyncOperation)
            .WithMany()
            .HasForeignKey(attempt => attempt.SyncOperationId)
            .HasConstraintName("fk_notification_delivery_attempts_sync_operations_operation_id")
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
                "ck_expense_bills_reconciliation_status",
                "reconciliation_status IN ('unreconciled', 'reconciled', 'ignored')");
            table.HasCheckConstraint(
                "ck_expense_bills_reconciliation_note_not_blank",
                "reconciliation_note IS NULL OR length(btrim(reconciliation_note)) > 0");
            table.HasCheckConstraint(
                "ck_expense_bills_reconciliation_update_actor_pair",
                "((reconciliation_updated_at_utc IS NULL AND reconciliation_updated_by_user_profile_id IS NULL) OR (reconciliation_updated_at_utc IS NOT NULL AND reconciliation_updated_by_user_profile_id IS NOT NULL))");
            table.HasCheckConstraint(
                "ck_expense_bills_reconciled_at_matches_status",
                "((reconciliation_status = 'reconciled' AND reconciled_at_utc IS NOT NULL) OR (reconciliation_status <> 'reconciled' AND reconciled_at_utc IS NULL))");
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

        entity.Property(bill => bill.ReconciliationStatus)
            .HasColumnName("reconciliation_status")
            .HasMaxLength(ExpenseBillConstraints.BillReconciliationStatusMaxLength)
            .HasDefaultValue(ExpenseBillReconciliationStatuses.Unreconciled)
            .IsRequired();

        entity.Property(bill => bill.ReconciliationUpdatedAtUtc)
            .HasColumnName("reconciliation_updated_at_utc");

        entity.Property(bill => bill.ReconciliationUpdatedByUserProfileId)
            .HasColumnName("reconciliation_updated_by_user_profile_id");

        entity.Property(bill => bill.ReconciledAtUtc)
            .HasColumnName("reconciled_at_utc");

        entity.Property(bill => bill.ReconciliationNote)
            .HasColumnName("reconciliation_note")
            .HasMaxLength(ExpenseBillConstraints.BillReconciliationNoteMaxLength);

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

        entity.HasIndex(bill => bill.ReconciliationStatus)
            .HasDatabaseName("ix_expense_bills_reconciliation_status");

        entity.HasIndex(bill => bill.ReconciliationUpdatedByUserProfileId)
            .HasDatabaseName("ix_expense_bills_reconciliation_updated_by_user_profile_id");

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

        entity.HasOne(bill => bill.ReconciliationUpdatedByUserProfile)
            .WithMany()
            .HasForeignKey(bill => bill.ReconciliationUpdatedByUserProfileId)
            .HasConstraintName("fk_expense_bills_reconciliation_updated_by_user_profiles")
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

    private static void ConfigureReceiptOcrReviewAssignment(EntityTypeBuilder<ReceiptOcrReviewAssignment> entity)
    {
        entity.ToTable("receipt_ocr_review_assignments", table =>
        {
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_assignments_status",
                "assignment_status IN ('needs_review', 'reviewed', 'cancelled', 'superseded')");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_assignments_source",
                "assignment_source IN ('server_ocr_worker', 'server_mode_upload_handoff', 'manual_assignment', 'system_reassignment')");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_assignments_source_correlation_not_blank",
                "source_correlation_id IS NULL OR length(btrim(source_correlation_id)) > 0");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_assignments_completion_status_pair",
                "(assignment_status = 'reviewed') = (completed_at_utc IS NOT NULL)");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_assignments_cancel_status_pair",
                "(assignment_status = 'cancelled') = (cancelled_at_utc IS NOT NULL)");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_assignments_supersede_status_pair",
                "(assignment_status = 'superseded') = (superseded_at_utc IS NOT NULL)");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_assignments_terminal_timestamps_exclusive",
                "((completed_at_utc IS NOT NULL)::int + (cancelled_at_utc IS NOT NULL)::int + (superseded_at_utc IS NOT NULL)::int) <= 1");
            table.HasCheckConstraint(
                "ck_receipt_ocr_review_assignments_manual_source_actor",
                "(assignment_source <> 'manual_assignment' OR (assigned_by_user_profile_id IS NOT NULL AND source_actor_user_profile_id IS NOT NULL))");
        });

        entity.HasKey(assignment => assignment.Id);

        entity.Property(assignment => assignment.Id)
            .HasColumnName("id");

        entity.Property(assignment => assignment.ReceiptOcrReviewId)
            .HasColumnName("receipt_ocr_review_id");

        entity.Property(assignment => assignment.ExpenseBillId)
            .HasColumnName("expense_bill_id");

        entity.Property(assignment => assignment.FileObjectId)
            .HasColumnName("file_object_id");

        entity.Property(assignment => assignment.GroupId)
            .HasColumnName("group_id");

        entity.Property(assignment => assignment.AssignmentStatus)
            .HasColumnName("assignment_status")
            .HasMaxLength(ReceiptOcrReviewAssignmentConstraints.StatusMaxLength)
            .IsRequired();

        entity.Property(assignment => assignment.AssignedToUserProfileId)
            .HasColumnName("assigned_to_user_profile_id");

        entity.Property(assignment => assignment.AssignedByUserProfileId)
            .HasColumnName("assigned_by_user_profile_id");

        entity.Property(assignment => assignment.AssignmentSource)
            .HasColumnName("assignment_source")
            .HasMaxLength(ReceiptOcrReviewAssignmentConstraints.SourceMaxLength)
            .IsRequired();

        entity.Property(assignment => assignment.SourceActorUserProfileId)
            .HasColumnName("source_actor_user_profile_id");

        entity.Property(assignment => assignment.SourceCorrelationId)
            .HasColumnName("source_correlation_id")
            .HasMaxLength(ReceiptOcrReviewAssignmentConstraints.SourceCorrelationIdMaxLength);

        entity.Property(assignment => assignment.CreatedAtUtc)
            .HasColumnName("created_at_utc")
            .IsRequired();

        entity.Property(assignment => assignment.UpdatedAtUtc)
            .HasColumnName("updated_at_utc")
            .IsRequired();

        entity.Property(assignment => assignment.CompletedAtUtc)
            .HasColumnName("completed_at_utc");

        entity.Property(assignment => assignment.CancelledAtUtc)
            .HasColumnName("cancelled_at_utc");

        entity.Property(assignment => assignment.SupersededAtUtc)
            .HasColumnName("superseded_at_utc");

        entity.HasIndex(assignment => new
            {
                assignment.ReceiptOcrReviewId,
                assignment.AssignedToUserProfileId
            })
            .IsUnique()
            .HasFilter("assignment_status = 'needs_review'")
            .HasDatabaseName("ux_receipt_ocr_review_assignments_active_review_assignee");

        entity.HasIndex(assignment => assignment.ReceiptOcrReviewId)
            .IsUnique()
            .HasFilter("assignment_status = 'needs_review'")
            .HasDatabaseName("ux_receipt_ocr_review_assignments_active_review");

        entity.HasIndex(assignment => assignment.ExpenseBillId)
            .HasDatabaseName("ix_receipt_ocr_review_assignments_bill_id");

        entity.HasIndex(assignment => assignment.FileObjectId)
            .HasDatabaseName("ix_receipt_ocr_review_assignments_file_object_id");

        entity.HasIndex(assignment => new
            {
                assignment.ExpenseBillId,
                assignment.FileObjectId
            })
            .HasDatabaseName("ix_receipt_ocr_review_assignments_bill_file");

        entity.HasIndex(assignment => assignment.GroupId)
            .HasDatabaseName("ix_receipt_ocr_review_assignments_group_id");

        entity.HasIndex(assignment => assignment.AssignedToUserProfileId)
            .HasDatabaseName("ix_receipt_ocr_review_assignments_assigned_to");

        entity.HasIndex(assignment => assignment.AssignedByUserProfileId)
            .HasDatabaseName("ix_receipt_ocr_review_assignments_assigned_by");

        entity.HasIndex(assignment => assignment.SourceActorUserProfileId)
            .HasDatabaseName("ix_receipt_ocr_review_assignments_source_actor");

        entity.HasIndex(assignment => assignment.AssignmentStatus)
            .HasDatabaseName("ix_receipt_ocr_review_assignments_status");

        entity.HasOne(assignment => assignment.ReceiptOcrReview)
            .WithMany(review => review.Assignments)
            .HasForeignKey(assignment => assignment.ReceiptOcrReviewId)
            .HasConstraintName("fk_receipt_ocr_review_assignments_reviews_review_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne<ExpenseBill>()
            .WithMany()
            .HasForeignKey(assignment => assignment.ExpenseBillId)
            .HasConstraintName("fk_receipt_ocr_review_assignments_expense_bills_bill_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne<ExpenseBillAttachment>()
            .WithMany()
            .HasForeignKey(assignment => new
            {
                assignment.ExpenseBillId,
                assignment.FileObjectId
            })
            .HasConstraintName("fk_receipt_ocr_review_assignments_expense_bill_attachments_bill_file")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(assignment => assignment.Group)
            .WithMany()
            .HasForeignKey(assignment => assignment.GroupId)
            .HasConstraintName("fk_receipt_ocr_review_assignments_user_groups_group_id")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(assignment => assignment.AssignedToUserProfile)
            .WithMany()
            .HasForeignKey(assignment => assignment.AssignedToUserProfileId)
            .HasConstraintName("fk_receipt_ocr_review_assignments_user_profiles_assigned_to")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(assignment => assignment.AssignedByUserProfile)
            .WithMany()
            .HasForeignKey(assignment => assignment.AssignedByUserProfileId)
            .HasConstraintName("fk_receipt_ocr_review_assignments_user_profiles_assigned_by")
            .OnDelete(DeleteBehavior.Restrict);

        entity.HasOne(assignment => assignment.SourceActorUserProfile)
            .WithMany()
            .HasForeignKey(assignment => assignment.SourceActorUserProfileId)
            .HasConstraintName("fk_receipt_ocr_review_assignments_user_profiles_source_actor")
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
            table.HasCheckConstraint(
                "ck_expense_bill_revisions_revision_sequence_positive",
                "revision_sequence > 0");
            table.HasCheckConstraint(
                "ck_expense_bill_revisions_snapshot_schema_version_not_blank",
                "length(btrim(snapshot_schema_version)) > 0");
            table.HasCheckConstraint(
                "ck_expense_bill_revisions_money_policy_version_not_blank",
                "length(btrim(money_policy_version)) > 0");
            table.HasCheckConstraint(
                "ck_expense_bill_revisions_rounding_policy_version_not_blank",
                "length(btrim(rounding_policy_version)) > 0");
            table.HasCheckConstraint(
                "ck_expense_bill_revisions_baseline_snapshot_json_object",
                "jsonb_typeof(baseline_snapshot_json) = 'object'");
            table.HasCheckConstraint(
                "ck_expense_bill_revisions_proposed_snapshot_json_object",
                "jsonb_typeof(proposed_snapshot_json) = 'object'");
            table.HasCheckConstraint(
                "ck_expense_bill_revisions_affected_user_ids_json_array",
                "jsonb_typeof(affected_user_ids_json) = 'array'");
            table.HasCheckConstraint(
                "ck_expense_bill_revisions_payer_ids_json_array",
                "jsonb_typeof(payer_confirmation_user_ids_json) = 'array'");
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

        entity.Property(revision => revision.RevisionSequence)
            .HasColumnName("revision_sequence")
            .IsRequired();

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

        entity.Property(revision => revision.SnapshotSchemaVersion)
            .HasColumnName("snapshot_schema_version")
            .HasMaxLength(ExpenseBillConstraints.BillRevisionPolicyVersionMaxLength)
            .IsRequired();

        entity.Property(revision => revision.MoneyPolicyVersion)
            .HasColumnName("money_policy_version")
            .HasMaxLength(ExpenseBillConstraints.BillRevisionPolicyVersionMaxLength)
            .IsRequired();

        entity.Property(revision => revision.RoundingPolicyVersion)
            .HasColumnName("rounding_policy_version")
            .HasMaxLength(ExpenseBillConstraints.BillRevisionPolicyVersionMaxLength)
            .IsRequired();

        entity.Property(revision => revision.BaselineSnapshotJson)
            .HasColumnName("baseline_snapshot_json")
            .HasColumnType("jsonb")
            .IsRequired();

        entity.Property(revision => revision.ProposedSnapshotJson)
            .HasColumnName("proposed_snapshot_json")
            .HasColumnType("jsonb")
            .IsRequired();

        entity.Property(revision => revision.AffectedUserSetHash)
            .HasColumnName("affected_user_set_hash")
            .HasMaxLength(ExpenseBillConstraints.BillRevisionCalculationHashMaxLength)
            .IsRequired();

        entity.Property(revision => revision.AffectedUserIdsJson)
            .HasColumnName("affected_user_ids_json")
            .HasColumnType("jsonb")
            .IsRequired();

        entity.Property(revision => revision.PayerConfirmationBasisHash)
            .HasColumnName("payer_confirmation_basis_hash")
            .HasMaxLength(ExpenseBillConstraints.BillRevisionCalculationHashMaxLength)
            .IsRequired();

        entity.Property(revision => revision.PayerConfirmationUserIdsJson)
            .HasColumnName("payer_confirmation_user_ids_json")
            .HasColumnType("jsonb")
            .IsRequired();

        entity.Property(revision => revision.UnsupportedDetailReason)
            .HasColumnName("unsupported_detail_reason")
            .HasMaxLength(ExpenseBillConstraints.BillRevisionUnsupportedDetailReasonMaxLength);

        entity.Property(revision => revision.RequestId)
            .HasColumnName("request_id")
            .HasMaxLength(ExpenseBillConstraints.BillRevisionRequestMetadataMaxLength);

        entity.Property(revision => revision.CorrelationId)
            .HasColumnName("correlation_id")
            .HasMaxLength(ExpenseBillConstraints.BillRevisionRequestMetadataMaxLength);

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

        entity.HasIndex(revision => new
            {
                revision.ExpenseBillId,
                revision.RevisionSequence
            })
            .IsUnique()
            .HasDatabaseName("ux_expense_bill_revisions_bill_sequence");

        entity.HasIndex(revision => revision.CalculationHash)
            .HasDatabaseName("ix_expense_bill_revisions_calculation_hash");

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

    private static void ConfigureAuthPasskeyCredential(EntityTypeBuilder<AuthPasskeyCredential> entity)
    {
        entity.ToTable("auth_passkey_credentials", table =>
        {
            table.HasCheckConstraint(
                "ck_auth_passkey_credentials_status",
                "status IN ('pending', 'enrolled', 'disabled', 'revoked')");
            table.HasCheckConstraint(
                "ck_auth_passkey_credentials_credential_hash_not_blank",
                "length(btrim(credential_id_hash)) > 0");
            table.HasCheckConstraint(
                "ck_auth_passkey_credentials_public_key_not_blank",
                "length(btrim(public_key_cose)) > 0");
            table.HasCheckConstraint(
                "ck_auth_passkey_credentials_user_handle_hash_not_blank",
                "user_handle_hash IS NULL OR length(btrim(user_handle_hash)) > 0");
            table.HasCheckConstraint(
                "ck_auth_passkey_credentials_status_reason_not_blank",
                "status_reason IS NULL OR length(btrim(status_reason)) > 0");
            table.HasCheckConstraint(
                "ck_auth_passkey_credentials_last_status_correlation_not_blank",
                "last_status_change_correlation_id IS NULL OR length(btrim(last_status_change_correlation_id)) > 0");
        });

        entity.HasKey(credential => credential.Id);

        entity.Property(credential => credential.Id).HasColumnName("id");
        entity.Property(credential => credential.AuthAccountId).HasColumnName("auth_account_id");
        entity.Property(credential => credential.CredentialIdHash)
            .HasColumnName("credential_id_hash")
            .HasMaxLength(AuthPasskeyCredentialIdHashMaxLength)
            .IsRequired();
        entity.Property(credential => credential.PublicKeyCose)
            .HasColumnName("public_key_cose")
            .HasMaxLength(AuthPasskeyCredentialPublicKeyCoseMaxLength)
            .IsRequired();
        entity.Property(credential => credential.UserHandleHash)
            .HasColumnName("user_handle_hash")
            .HasMaxLength(AuthPasskeyCredentialUserHandleHashMaxLength);
        entity.Property(credential => credential.SignatureCounter).HasColumnName("signature_counter");
        entity.Property(credential => credential.BackupEligible).HasColumnName("backup_eligible").IsRequired();
        entity.Property(credential => credential.BackupState).HasColumnName("backup_state").IsRequired();
        entity.Property(credential => credential.Transports)
            .HasColumnName("transports")
            .HasMaxLength(AuthPasskeyCredentialTransportsMaxLength);
        entity.Property(credential => credential.AttestationPolicyResult)
            .HasColumnName("attestation_policy_result")
            .HasMaxLength(AuthPasskeyCredentialAttestationPolicyResultMaxLength);
        entity.Property(credential => credential.DisplayLabel)
            .HasColumnName("display_label")
            .HasMaxLength(AuthPasskeyCredentialDisplayLabelMaxLength);
        entity.Property(credential => credential.Status)
            .HasColumnName("status")
            .HasMaxLength(AuthPasskeyCredentialStatusMaxLength)
            .IsRequired();
        entity.Property(credential => credential.CreatedAtUtc).HasColumnName("created_at_utc").IsRequired();
        entity.Property(credential => credential.UpdatedAtUtc).HasColumnName("updated_at_utc").IsRequired();
        entity.Property(credential => credential.EnrolledAtUtc).HasColumnName("enrolled_at_utc");
        entity.Property(credential => credential.LastUsedAtUtc).HasColumnName("last_used_at_utc");
        entity.Property(credential => credential.DisabledAtUtc).HasColumnName("disabled_at_utc");
        entity.Property(credential => credential.RevokedAtUtc).HasColumnName("revoked_at_utc");
        entity.Property(credential => credential.LastReplaySuspectedAtUtc)
            .HasColumnName("last_replay_suspected_at_utc");
        entity.Property(credential => credential.StatusReason)
            .HasColumnName("status_reason")
            .HasMaxLength(AuthPasskeyCredentialStatusReasonMaxLength);
        entity.Property(credential => credential.LastStatusChangedByAuthAccountId)
            .HasColumnName("last_status_changed_by_auth_account_id");
        entity.Property(credential => credential.LastStatusChangeCorrelationId)
            .HasColumnName("last_status_change_correlation_id")
            .HasMaxLength(AuthAuditCorrelationIdMaxLength);

        entity.HasIndex(credential => credential.AuthAccountId)
            .HasDatabaseName("ix_auth_passkey_credentials_auth_account_id");
        entity.HasIndex(credential => new { credential.AuthAccountId, credential.Status })
            .HasDatabaseName("ix_auth_passkey_credentials_account_status");
        entity.HasIndex(credential => credential.CredentialIdHash)
            .IsUnique()
            .HasDatabaseName("ux_auth_passkey_credentials_credential_id_hash");
        entity.HasIndex(credential => credential.LastStatusChangedByAuthAccountId)
            .HasDatabaseName("ix_auth_passkey_credentials_status_actor_id");

        entity.HasOne(credential => credential.AuthAccount)
            .WithMany(account => account.PasskeyCredentials)
            .HasForeignKey(credential => credential.AuthAccountId)
            .HasConstraintName("fk_auth_passkey_credentials_auth_accounts")
            .OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(credential => credential.LastStatusChangedByAuthAccount)
            .WithMany(account => account.ChangedPasskeyCredentialStatuses)
            .HasForeignKey(credential => credential.LastStatusChangedByAuthAccountId)
            .HasConstraintName("fk_auth_passkey_credentials_status_actor")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureAuthMfaFactor(EntityTypeBuilder<AuthMfaFactor> entity)
    {
        entity.ToTable("auth_mfa_factors", table =>
        {
            table.HasCheckConstraint("ck_auth_mfa_factors_factor_type", "factor_type IN ('totp')");
            table.HasCheckConstraint(
                "ck_auth_mfa_factors_status",
                "status IN ('pending', 'enrolled', 'disabled', 'revoked', 'expired')");
            table.HasCheckConstraint(
                "ck_auth_mfa_factors_secret_storage_kind",
                "totp_secret_storage_kind IS NULL OR totp_secret_storage_kind IN ('none', 'protected_reference', 'encrypted_payload')");
            table.HasCheckConstraint(
                "ck_auth_mfa_factors_totp_digits",
                "totp_digits IS NULL OR totp_digits BETWEEN 6 AND 8");
            table.HasCheckConstraint(
                "ck_auth_mfa_factors_totp_period_seconds",
                "totp_period_seconds IS NULL OR totp_period_seconds BETWEEN 15 AND 120");
            table.HasCheckConstraint(
                "ck_auth_mfa_factors_totp_secret_reference_not_blank",
                "totp_protected_secret_reference IS NULL OR length(btrim(totp_protected_secret_reference)) > 0");
            table.HasCheckConstraint(
                "ck_auth_mfa_factors_totp_encrypted_payload_not_blank",
                "totp_encrypted_secret_payload IS NULL OR length(btrim(totp_encrypted_secret_payload)) > 0");
            table.HasCheckConstraint(
                "ck_auth_mfa_factors_no_plaintext_totp_secret_pair",
                "(totp_secret_storage_kind = 'protected_reference' AND totp_protected_secret_reference IS NOT NULL AND totp_encrypted_secret_payload IS NULL) OR (totp_secret_storage_kind = 'encrypted_payload' AND totp_encrypted_secret_payload IS NOT NULL AND totp_protected_secret_reference IS NULL) OR ((totp_secret_storage_kind IS NULL OR totp_secret_storage_kind = 'none') AND totp_protected_secret_reference IS NULL AND totp_encrypted_secret_payload IS NULL)");
            table.HasCheckConstraint(
                "ck_auth_mfa_factors_status_reason_not_blank",
                "status_reason IS NULL OR length(btrim(status_reason)) > 0");
        });

        entity.HasKey(factor => factor.Id);

        entity.Property(factor => factor.Id).HasColumnName("id");
        entity.Property(factor => factor.AuthAccountId).HasColumnName("auth_account_id");
        entity.Property(factor => factor.FactorType)
            .HasColumnName("factor_type")
            .HasMaxLength(AuthMfaFactorTypeMaxLength)
            .IsRequired();
        entity.Property(factor => factor.Status)
            .HasColumnName("status")
            .HasMaxLength(AuthMfaFactorStatusMaxLength)
            .IsRequired();
        entity.Property(factor => factor.DisplayLabel)
            .HasColumnName("display_label")
            .HasMaxLength(AuthMfaFactorDisplayLabelMaxLength);
        entity.Property(factor => factor.TotpSecretStorageKind)
            .HasColumnName("totp_secret_storage_kind")
            .HasMaxLength(AuthMfaFactorTotpSecretStorageKindMaxLength);
        entity.Property(factor => factor.TotpProtectedSecretReference)
            .HasColumnName("totp_protected_secret_reference")
            .HasMaxLength(AuthMfaFactorTotpProtectedSecretReferenceMaxLength);
        entity.Property(factor => factor.TotpEncryptedSecretPayload)
            .HasColumnName("totp_encrypted_secret_payload")
            .HasMaxLength(AuthMfaFactorTotpEncryptedSecretPayloadMaxLength);
        entity.Property(factor => factor.TotpIssuer)
            .HasColumnName("totp_issuer")
            .HasMaxLength(AuthMfaFactorTotpIssuerMaxLength);
        entity.Property(factor => factor.TotpAccountLabel)
            .HasColumnName("totp_account_label")
            .HasMaxLength(AuthMfaFactorTotpAccountLabelMaxLength);
        entity.Property(factor => factor.TotpAlgorithm)
            .HasColumnName("totp_algorithm")
            .HasMaxLength(AuthMfaFactorTotpAlgorithmMaxLength);
        entity.Property(factor => factor.TotpDigits).HasColumnName("totp_digits");
        entity.Property(factor => factor.TotpPeriodSeconds).HasColumnName("totp_period_seconds");
        entity.Property(factor => factor.PolicyVersion)
            .HasColumnName("policy_version")
            .HasMaxLength(AuthMfaFactorPolicyVersionMaxLength);
        entity.Property(factor => factor.CreatedAtUtc).HasColumnName("created_at_utc").IsRequired();
        entity.Property(factor => factor.UpdatedAtUtc).HasColumnName("updated_at_utc").IsRequired();
        entity.Property(factor => factor.VerifiedAtUtc).HasColumnName("verified_at_utc");
        entity.Property(factor => factor.LastUsedAtUtc).HasColumnName("last_used_at_utc");
        entity.Property(factor => factor.DisabledAtUtc).HasColumnName("disabled_at_utc");
        entity.Property(factor => factor.RevokedAtUtc).HasColumnName("revoked_at_utc");
        entity.Property(factor => factor.RotatedAtUtc).HasColumnName("rotated_at_utc");
        entity.Property(factor => factor.ExpiresAtUtc).HasColumnName("expires_at_utc");
        entity.Property(factor => factor.StatusReason)
            .HasColumnName("status_reason")
            .HasMaxLength(AuthMfaFactorStatusReasonMaxLength);
        entity.Property(factor => factor.LastStatusChangedByAuthAccountId)
            .HasColumnName("last_status_changed_by_auth_account_id");
        entity.Property(factor => factor.LastStatusChangeCorrelationId)
            .HasColumnName("last_status_change_correlation_id")
            .HasMaxLength(AuthAuditCorrelationIdMaxLength);

        entity.HasIndex(factor => factor.AuthAccountId).HasDatabaseName("ix_auth_mfa_factors_auth_account_id");
        entity.HasIndex(factor => new { factor.AuthAccountId, factor.FactorType, factor.Status })
            .HasDatabaseName("ix_auth_mfa_factors_account_type_status");
        entity.HasIndex(factor => factor.ExpiresAtUtc).HasDatabaseName("ix_auth_mfa_factors_expires_at_utc");
        entity.HasIndex(factor => factor.LastStatusChangedByAuthAccountId)
            .HasDatabaseName("ix_auth_mfa_factors_status_actor_id");

        entity.HasOne(factor => factor.AuthAccount)
            .WithMany(account => account.MfaFactors)
            .HasForeignKey(factor => factor.AuthAccountId)
            .HasConstraintName("fk_auth_mfa_factors_auth_accounts")
            .OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(factor => factor.LastStatusChangedByAuthAccount)
            .WithMany(account => account.ChangedMfaFactorStatuses)
            .HasForeignKey(factor => factor.LastStatusChangedByAuthAccountId)
            .HasConstraintName("fk_auth_mfa_factors_status_actor")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureAuthRecoveryCodeBatch(EntityTypeBuilder<AuthRecoveryCodeBatch> entity)
    {
        entity.ToTable("auth_recovery_code_batches", table =>
        {
            table.HasCheckConstraint(
                "ck_auth_recovery_code_batches_status",
                "status IN ('active', 'replaced', 'revoked', 'expired')");
            table.HasCheckConstraint(
                "ck_auth_recovery_code_batches_counts",
                "total_generated_count >= 0 AND remaining_unused_count >= 0 AND used_count >= 0 AND remaining_unused_count + used_count <= total_generated_count");
            table.HasCheckConstraint(
                "ck_auth_recovery_code_batches_status_reason_not_blank",
                "status_reason IS NULL OR length(btrim(status_reason)) > 0");
            table.HasCheckConstraint(
                "ck_auth_recovery_code_batches_created_correlation_not_blank",
                "created_correlation_id IS NULL OR length(btrim(created_correlation_id)) > 0");
        });

        entity.HasKey(batch => batch.Id);

        entity.Property(batch => batch.Id).HasColumnName("id");
        entity.Property(batch => batch.AuthAccountId).HasColumnName("auth_account_id");
        entity.Property(batch => batch.Status)
            .HasColumnName("status")
            .HasMaxLength(AuthRecoveryCodeBatchStatusMaxLength)
            .IsRequired();
        entity.Property(batch => batch.PolicyVersion)
            .HasColumnName("policy_version")
            .HasMaxLength(AuthRecoveryCodeBatchPolicyVersionMaxLength);
        entity.Property(batch => batch.TotalGeneratedCount).HasColumnName("total_generated_count").IsRequired();
        entity.Property(batch => batch.RemainingUnusedCount).HasColumnName("remaining_unused_count").IsRequired();
        entity.Property(batch => batch.UsedCount).HasColumnName("used_count").IsRequired();
        entity.Property(batch => batch.GeneratedAtUtc).HasColumnName("generated_at_utc").IsRequired();
        entity.Property(batch => batch.DisplayedAtUtc).HasColumnName("displayed_at_utc");
        entity.Property(batch => batch.LastUsedAtUtc).HasColumnName("last_used_at_utc");
        entity.Property(batch => batch.ReplacedAtUtc).HasColumnName("replaced_at_utc");
        entity.Property(batch => batch.RevokedAtUtc).HasColumnName("revoked_at_utc");
        entity.Property(batch => batch.CreatedAtUtc).HasColumnName("created_at_utc").IsRequired();
        entity.Property(batch => batch.UpdatedAtUtc).HasColumnName("updated_at_utc").IsRequired();
        entity.Property(batch => batch.StatusReason)
            .HasColumnName("status_reason")
            .HasMaxLength(AuthRecoveryCodeBatchStatusReasonMaxLength);
        entity.Property(batch => batch.CreatedByAuthAccountId).HasColumnName("created_by_auth_account_id");
        entity.Property(batch => batch.CreatedCorrelationId)
            .HasColumnName("created_correlation_id")
            .HasMaxLength(AuthAuditCorrelationIdMaxLength);

        entity.HasIndex(batch => batch.AuthAccountId)
            .HasDatabaseName("ix_auth_recovery_code_batches_auth_account_id");
        entity.HasIndex(batch => new { batch.AuthAccountId, batch.Status })
            .HasDatabaseName("ix_auth_recovery_code_batches_account_status");
        entity.HasIndex(batch => batch.CreatedByAuthAccountId)
            .HasDatabaseName("ix_auth_recovery_code_batches_created_by_id");

        entity.HasOne(batch => batch.AuthAccount)
            .WithMany(account => account.RecoveryCodeBatches)
            .HasForeignKey(batch => batch.AuthAccountId)
            .HasConstraintName("fk_auth_recovery_code_batches_auth_accounts")
            .OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(batch => batch.CreatedByAuthAccount)
            .WithMany(account => account.CreatedRecoveryCodeBatches)
            .HasForeignKey(batch => batch.CreatedByAuthAccountId)
            .HasConstraintName("fk_auth_recovery_code_batches_created_by")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureAuthRecoveryCodeVerifier(EntityTypeBuilder<AuthRecoveryCodeVerifier> entity)
    {
        entity.ToTable("auth_recovery_code_verifiers", table =>
        {
            table.HasCheckConstraint(
                "ck_auth_recovery_code_verifiers_status",
                "status IN ('unused', 'consumed', 'revoked', 'replaced', 'expired')");
            table.HasCheckConstraint("ck_auth_recovery_code_verifiers_hash_not_blank", "length(btrim(verifier_hash)) > 0");
            table.HasCheckConstraint("ck_auth_recovery_code_verifiers_salt_not_blank", "length(btrim(verifier_salt)) > 0");
            table.HasCheckConstraint(
                "ck_auth_recovery_code_verifiers_algorithm_not_blank",
                "length(btrim(verifier_algorithm)) > 0");
            table.HasCheckConstraint(
                "ck_auth_recovery_code_verifiers_parameters_not_blank",
                "length(btrim(verifier_parameters)) > 0");
            table.HasCheckConstraint(
                "ck_auth_recovery_code_verifiers_use_correlation_not_blank",
                "use_correlation_id IS NULL OR length(btrim(use_correlation_id)) > 0");
        });

        entity.HasKey(verifier => verifier.Id);

        entity.Property(verifier => verifier.Id).HasColumnName("id");
        entity.Property(verifier => verifier.AuthRecoveryCodeBatchId).HasColumnName("auth_recovery_code_batch_id");
        entity.Property(verifier => verifier.AuthAccountId).HasColumnName("auth_account_id");
        entity.Property(verifier => verifier.VerifierHash)
            .HasColumnName("verifier_hash")
            .HasMaxLength(AuthRecoveryCodeVerifierHashMaxLength)
            .IsRequired();
        entity.Property(verifier => verifier.VerifierSalt)
            .HasColumnName("verifier_salt")
            .HasMaxLength(AuthRecoveryCodeVerifierSaltMaxLength)
            .IsRequired();
        entity.Property(verifier => verifier.VerifierAlgorithm)
            .HasColumnName("verifier_algorithm")
            .HasMaxLength(AuthRecoveryCodeVerifierAlgorithmMaxLength)
            .IsRequired();
        entity.Property(verifier => verifier.VerifierParameters)
            .HasColumnName("verifier_parameters")
            .HasMaxLength(AuthRecoveryCodeVerifierParametersMaxLength)
            .IsRequired();
        entity.Property(verifier => verifier.Status)
            .HasColumnName("status")
            .HasMaxLength(AuthRecoveryCodeVerifierStatusMaxLength)
            .IsRequired();
        entity.Property(verifier => verifier.GeneratedAtUtc).HasColumnName("generated_at_utc").IsRequired();
        entity.Property(verifier => verifier.ConsumedAtUtc).HasColumnName("consumed_at_utc");
        entity.Property(verifier => verifier.RevokedAtUtc).HasColumnName("revoked_at_utc");
        entity.Property(verifier => verifier.ReplacedAtUtc).HasColumnName("replaced_at_utc");
        entity.Property(verifier => verifier.CreatedAtUtc).HasColumnName("created_at_utc").IsRequired();
        entity.Property(verifier => verifier.UpdatedAtUtc).HasColumnName("updated_at_utc").IsRequired();
        entity.Property(verifier => verifier.ConsumedByAuthChallengeId).HasColumnName("consumed_by_auth_challenge_id");
        entity.Property(verifier => verifier.UseCorrelationId)
            .HasColumnName("use_correlation_id")
            .HasMaxLength(AuthAuditCorrelationIdMaxLength);

        entity.HasIndex(verifier => verifier.AuthRecoveryCodeBatchId)
            .HasDatabaseName("ix_auth_recovery_code_verifiers_batch_id");
        entity.HasIndex(verifier => verifier.AuthAccountId)
            .HasDatabaseName("ix_auth_recovery_code_verifiers_auth_account_id");
        entity.HasIndex(verifier => new { verifier.AuthRecoveryCodeBatchId, verifier.Status })
            .HasDatabaseName("ix_auth_recovery_code_verifiers_batch_status");
        entity.HasIndex(verifier => verifier.VerifierHash)
            .IsUnique()
            .HasDatabaseName("ux_auth_recovery_code_verifiers_hash");
        entity.HasIndex(verifier => verifier.ConsumedByAuthChallengeId)
            .HasDatabaseName("ix_auth_recovery_code_verifiers_consumed_challenge_id");

        entity.HasOne(verifier => verifier.Batch)
            .WithMany(batch => batch.Verifiers)
            .HasForeignKey(verifier => verifier.AuthRecoveryCodeBatchId)
            .HasConstraintName("fk_auth_recovery_code_verifiers_batches")
            .OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(verifier => verifier.AuthAccount)
            .WithMany(account => account.RecoveryCodeVerifiers)
            .HasForeignKey(verifier => verifier.AuthAccountId)
            .HasConstraintName("fk_auth_recovery_code_verifiers_auth_accounts")
            .OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(verifier => verifier.ConsumedByAuthChallenge)
            .WithMany()
            .HasForeignKey(verifier => verifier.ConsumedByAuthChallengeId)
            .HasConstraintName("fk_auth_recovery_code_verifiers_consumed_challenge")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureAuthChallenge(EntityTypeBuilder<AuthChallenge> entity)
    {
        entity.ToTable("auth_challenges", table =>
        {
            table.HasCheckConstraint(
                "ck_auth_challenges_purpose",
                "purpose IN ('passkey_enrollment', 'passkey_sign_in', 'passkey_step_up', 'totp_enrollment', 'sign_in', 'step_up', 'recovery')");
            table.HasCheckConstraint(
                "ck_auth_challenges_factor_type",
                "factor_type IN ('passkey', 'totp', 'recovery_code', 'mfa')");
            table.HasCheckConstraint(
                "ck_auth_challenges_status",
                "status IN ('pending', 'consumed', 'verified', 'expired', 'failed', 'blocked', 'cancelled', 'replay_detected')");
            table.HasCheckConstraint("ck_auth_challenges_verifier_hash_not_blank", "length(btrim(challenge_verifier_hash)) > 0");
            table.HasCheckConstraint(
                "ck_auth_challenges_attempt_counts",
                "attempt_count >= 0 AND max_attempt_count >= 0 AND attempt_count <= max_attempt_count");
            table.HasCheckConstraint("ck_auth_challenges_expiry_after_created", "expires_at_utc > created_at_utc");
            table.HasCheckConstraint("ck_auth_challenges_bound_origin_not_blank", "bound_origin IS NULL OR length(btrim(bound_origin)) > 0");
            table.HasCheckConstraint("ck_auth_challenges_bound_rp_id_not_blank", "bound_rp_id IS NULL OR length(btrim(bound_rp_id)) > 0");
            table.HasCheckConstraint("ck_auth_challenges_failure_category_not_blank", "failure_category IS NULL OR length(btrim(failure_category)) > 0");
        });

        entity.HasKey(challenge => challenge.Id);

        entity.Property(challenge => challenge.Id).HasColumnName("id");
        entity.Property(challenge => challenge.AuthAccountId).HasColumnName("auth_account_id");
        entity.Property(challenge => challenge.AuthSessionId).HasColumnName("auth_session_id");
        entity.Property(challenge => challenge.AuthMfaFactorId).HasColumnName("auth_mfa_factor_id");
        entity.Property(challenge => challenge.AuthPasskeyCredentialId).HasColumnName("auth_passkey_credential_id");
        entity.Property(challenge => challenge.Purpose)
            .HasColumnName("purpose")
            .HasMaxLength(AuthChallengePurposeMaxLength)
            .IsRequired();
        entity.Property(challenge => challenge.FactorType)
            .HasColumnName("factor_type")
            .HasMaxLength(AuthChallengeFactorTypeMaxLength)
            .IsRequired();
        entity.Property(challenge => challenge.Status)
            .HasColumnName("status")
            .HasMaxLength(AuthChallengeStatusMaxLength)
            .IsRequired();
        entity.Property(challenge => challenge.ChallengeVerifierHash)
            .HasColumnName("challenge_verifier_hash")
            .HasMaxLength(AuthChallengeVerifierHashMaxLength)
            .IsRequired();
        entity.Property(challenge => challenge.ChallengeVerifierAlgorithm)
            .HasColumnName("challenge_verifier_algorithm")
            .HasMaxLength(AuthChallengeVerifierAlgorithmMaxLength);
        entity.Property(challenge => challenge.BoundRpId)
            .HasColumnName("bound_rp_id")
            .HasMaxLength(AuthChallengeBoundRpIdMaxLength);
        entity.Property(challenge => challenge.BoundOrigin)
            .HasColumnName("bound_origin")
            .HasMaxLength(AuthChallengeBoundOriginMaxLength);
        entity.Property(challenge => challenge.RequestContextHash)
            .HasColumnName("request_context_hash")
            .HasMaxLength(AuthChallengeRequestContextHashMaxLength);
        entity.Property(challenge => challenge.CorrelationId)
            .HasColumnName("correlation_id")
            .HasMaxLength(AuthAuditCorrelationIdMaxLength);
        entity.Property(challenge => challenge.AttemptCount).HasColumnName("attempt_count").IsRequired();
        entity.Property(challenge => challenge.MaxAttemptCount).HasColumnName("max_attempt_count").IsRequired();
        entity.Property(challenge => challenge.FailureCategory)
            .HasColumnName("failure_category")
            .HasMaxLength(AuthChallengeFailureCategoryMaxLength);
        entity.Property(challenge => challenge.CreatedAtUtc).HasColumnName("created_at_utc").IsRequired();
        entity.Property(challenge => challenge.UpdatedAtUtc).HasColumnName("updated_at_utc").IsRequired();
        entity.Property(challenge => challenge.ExpiresAtUtc).HasColumnName("expires_at_utc").IsRequired();
        entity.Property(challenge => challenge.ConsumedAtUtc).HasColumnName("consumed_at_utc");
        entity.Property(challenge => challenge.FailedAtUtc).HasColumnName("failed_at_utc");
        entity.Property(challenge => challenge.BlockedAtUtc).HasColumnName("blocked_at_utc");
        entity.Property(challenge => challenge.ReplayDetectedAtUtc).HasColumnName("replay_detected_at_utc");

        entity.HasIndex(challenge => challenge.AuthAccountId).HasDatabaseName("ix_auth_challenges_auth_account_id");
        entity.HasIndex(challenge => challenge.AuthSessionId).HasDatabaseName("ix_auth_challenges_auth_session_id");
        entity.HasIndex(challenge => challenge.AuthMfaFactorId)
            .HasDatabaseName("ix_auth_challenges_auth_mfa_factor_id");
        entity.HasIndex(challenge => challenge.AuthPasskeyCredentialId)
            .HasDatabaseName("ix_auth_challenges_auth_passkey_credential_id");
        entity.HasIndex(challenge => new { challenge.Purpose, challenge.Status, challenge.ExpiresAtUtc })
            .HasDatabaseName("ix_auth_challenges_purpose_status_expires");
        entity.HasIndex(challenge => challenge.ExpiresAtUtc).HasDatabaseName("ix_auth_challenges_expires_at_utc");

        entity.HasOne(challenge => challenge.AuthAccount)
            .WithMany(account => account.Challenges)
            .HasForeignKey(challenge => challenge.AuthAccountId)
            .HasConstraintName("fk_auth_challenges_auth_accounts")
            .OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(challenge => challenge.AuthSession)
            .WithMany()
            .HasForeignKey(challenge => challenge.AuthSessionId)
            .HasConstraintName("fk_auth_challenges_auth_sessions")
            .OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(challenge => challenge.AuthMfaFactor)
            .WithMany()
            .HasForeignKey(challenge => challenge.AuthMfaFactorId)
            .HasConstraintName("fk_auth_challenges_auth_mfa_factors")
            .OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(challenge => challenge.AuthPasskeyCredential)
            .WithMany()
            .HasForeignKey(challenge => challenge.AuthPasskeyCredentialId)
            .HasConstraintName("fk_auth_challenges_auth_passkey_credentials")
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureAuthSecurityPolicy(EntityTypeBuilder<AuthSecurityPolicy> entity)
    {
        entity.ToTable("auth_security_policies", table =>
        {
            table.HasCheckConstraint("ck_auth_security_policies_status", "status IN ('draft', 'active', 'retired')");
            table.HasCheckConstraint(
                "ck_auth_security_policies_support_modes",
                "passkey_support_mode IN ('disabled', 'optional', 'required_for_admins', 'required_for_all_users', 'policy_pending_enrollment') AND totp_support_mode IN ('disabled', 'optional', 'required_for_admins', 'required_for_all_users', 'policy_pending_enrollment') AND recovery_code_support_mode IN ('disabled', 'optional', 'required_for_admins', 'required_for_all_users', 'policy_pending_enrollment')");
            table.HasCheckConstraint(
                "ck_auth_security_policies_enforcement_modes",
                "owner_admin_mfa_mode IN ('optional', 'blocking_warning', 'required') AND user_mfa_mode IN ('optional', 'blocking_warning', 'required')");
            table.HasCheckConstraint(
                "ck_auth_security_policies_positive_limits",
                "policy_version > 0 AND challenge_expiry_seconds > 0 AND challenge_max_attempt_count > 0 AND recovery_code_count >= 0 AND recovery_code_minimum_remaining_warning_count >= 0");
            table.HasCheckConstraint(
                "ck_auth_security_policies_change_reason_not_blank",
                "change_reason_category IS NULL OR length(btrim(change_reason_category)) > 0");
            table.HasCheckConstraint(
                "ck_auth_security_policies_change_correlation_not_blank",
                "change_correlation_id IS NULL OR length(btrim(change_correlation_id)) > 0");
        });

        entity.HasKey(policy => policy.Id);

        entity.Property(policy => policy.Id).HasColumnName("id");
        entity.Property(policy => policy.PolicyVersion).HasColumnName("policy_version").IsRequired();
        entity.Property(policy => policy.Status)
            .HasColumnName("status")
            .HasMaxLength(AuthSecurityPolicyStatusMaxLength)
            .IsRequired();
        entity.Property(policy => policy.PasskeySupportMode)
            .HasColumnName("passkey_support_mode")
            .HasMaxLength(AuthSecurityPolicySupportModeMaxLength)
            .IsRequired();
        entity.Property(policy => policy.TotpSupportMode)
            .HasColumnName("totp_support_mode")
            .HasMaxLength(AuthSecurityPolicySupportModeMaxLength)
            .IsRequired();
        entity.Property(policy => policy.RecoveryCodeSupportMode)
            .HasColumnName("recovery_code_support_mode")
            .HasMaxLength(AuthSecurityPolicySupportModeMaxLength)
            .IsRequired();
        entity.Property(policy => policy.OwnerAdminMfaMode)
            .HasColumnName("owner_admin_mfa_mode")
            .HasMaxLength(AuthSecurityPolicyEnforcementModeMaxLength)
            .IsRequired();
        entity.Property(policy => policy.UserMfaMode)
            .HasColumnName("user_mfa_mode")
            .HasMaxLength(AuthSecurityPolicyEnforcementModeMaxLength)
            .IsRequired();
        entity.Property(policy => policy.ChallengeExpirySeconds).HasColumnName("challenge_expiry_seconds").IsRequired();
        entity.Property(policy => policy.ChallengeMaxAttemptCount).HasColumnName("challenge_max_attempt_count").IsRequired();
        entity.Property(policy => policy.RecoveryCodeCount).HasColumnName("recovery_code_count").IsRequired();
        entity.Property(policy => policy.RecoveryCodeMinimumRemainingWarningCount)
            .HasColumnName("recovery_code_minimum_remaining_warning_count")
            .IsRequired();
        entity.Property(policy => policy.CreatedAtUtc).HasColumnName("created_at_utc").IsRequired();
        entity.Property(policy => policy.UpdatedAtUtc).HasColumnName("updated_at_utc").IsRequired();
        entity.Property(policy => policy.EffectiveFromUtc).HasColumnName("effective_from_utc");
        entity.Property(policy => policy.RetiredAtUtc).HasColumnName("retired_at_utc");
        entity.Property(policy => policy.ChangedByAuthAccountId).HasColumnName("changed_by_auth_account_id");
        entity.Property(policy => policy.ChangeReasonCategory)
            .HasColumnName("change_reason_category")
            .HasMaxLength(AuthSecurityPolicyChangeReasonCategoryMaxLength);
        entity.Property(policy => policy.ChangeCorrelationId)
            .HasColumnName("change_correlation_id")
            .HasMaxLength(AuthAuditCorrelationIdMaxLength);

        entity.HasIndex(policy => policy.PolicyVersion)
            .IsUnique()
            .HasDatabaseName("ux_auth_security_policies_policy_version");
        entity.HasIndex(policy => policy.Status).HasDatabaseName("ix_auth_security_policies_status");
        entity.HasIndex(policy => policy.EffectiveFromUtc).HasDatabaseName("ix_auth_security_policies_effective_from_utc");
        entity.HasIndex(policy => policy.ChangedByAuthAccountId)
            .HasDatabaseName("ix_auth_security_policies_changed_by_id");

        entity.HasOne(policy => policy.ChangedByAuthAccount)
            .WithMany(account => account.ChangedSecurityPolicies)
            .HasForeignKey(policy => policy.ChangedByAuthAccountId)
            .HasConstraintName("fk_auth_security_policies_changed_by")
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
