using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Settleora.Api.Domain.Auth;
using Settleora.Api.Domain.Users;

namespace Settleora.Api.Persistence;

public sealed class SettleoraDbContext : DbContext
{
    private const int UserDisplayNameMaxLength = 160;
    private const int UserDefaultCurrencyMaxLength = 3;
    private const int GroupNameMaxLength = 160;
    private const int MembershipRoleMaxLength = 16;
    private const int MembershipStatusMaxLength = 16;
    private const int AuthAccountStatusMaxLength = 16;
    private const int AuthIdentityProviderTypeMaxLength = 16;
    private const int AuthIdentityProviderNameMaxLength = 120;
    private const int AuthIdentityProviderSubjectMaxLength = 320;
    private const int SystemRoleMaxLength = 16;

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
            .HasMaxLength(UserDisplayNameMaxLength)
            .IsRequired();

        entity.Property(userProfile => userProfile.DefaultCurrency)
            .HasColumnName("default_currency")
            .HasMaxLength(UserDefaultCurrencyMaxLength);

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
            .HasMaxLength(GroupNameMaxLength)
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
