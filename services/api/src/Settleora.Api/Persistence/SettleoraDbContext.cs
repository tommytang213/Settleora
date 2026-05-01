using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Settleora.Api.Domain.Users;

namespace Settleora.Api.Persistence;

public sealed class SettleoraDbContext : DbContext
{
    private const int UserDisplayNameMaxLength = 160;
    private const int UserDefaultCurrencyMaxLength = 3;
    private const int GroupNameMaxLength = 160;
    private const int MembershipRoleMaxLength = 16;
    private const int MembershipStatusMaxLength = 16;

    public SettleoraDbContext(DbContextOptions<SettleoraDbContext> options)
        : base(options)
    {
    }

    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();

    public DbSet<UserGroup> UserGroups => Set<UserGroup>();

    public DbSet<GroupMembership> GroupMemberships => Set<GroupMembership>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<UserProfile>(ConfigureUserProfile);
        modelBuilder.Entity<UserGroup>(ConfigureUserGroup);
        modelBuilder.Entity<GroupMembership>(ConfigureGroupMembership);
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
}
