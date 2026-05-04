using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;

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
        modelBuilder.Entity<UserGroup>(ConfigureUserGroup);
        modelBuilder.Entity<GroupMembership>(ConfigureGroupMembership);
        modelBuilder.Entity<AuthAccount>(ConfigureAuthAccount);
        modelBuilder.Entity<AuthIdentity>(ConfigureAuthIdentity);
        modelBuilder.Entity<LocalPasswordCredential>(ConfigureLocalPasswordCredential);
        modelBuilder.Entity<AuthSession>(ConfigureAuthSession);
        modelBuilder.Entity<AuthSessionFamily>(ConfigureAuthSessionFamily);
        modelBuilder.Entity<AuthRefreshCredential>(ConfigureAuthRefreshCredential);
        modelBuilder.Entity<AuthAuditEvent>(ConfigureAuthAuditEvent);
        modelBuilder.Entity<SystemRoleAssignment>(ConfigureSystemRoleAssignment);
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
