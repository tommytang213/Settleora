using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUserNotificationPreferences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "user_notification_preferences",
                columns: table => new
                {
                    user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    in_app_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    bills_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    settlements_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    recurring_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    sync_security_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    quiet_hours_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    quiet_hours_start_hour = table.Column<int>(type: "integer", nullable: false),
                    quiet_hours_end_hour = table.Column<int>(type: "integer", nullable: false),
                    delivery_timing = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_notification_preferences", x => x.user_profile_id);
                    table.CheckConstraint("ck_user_notification_preferences_delivery_timing", "delivery_timing IN ('immediate', 'digest_readout')");
                    table.CheckConstraint("ck_user_notification_preferences_quiet_end_hour", "quiet_hours_end_hour >= 0 AND quiet_hours_end_hour <= 23");
                    table.CheckConstraint("ck_user_notification_preferences_quiet_start_hour", "quiet_hours_start_hour >= 0 AND quiet_hours_start_hour <= 23");
                    table.CheckConstraint("ck_user_notification_preferences_sync_security_required", "sync_security_enabled = TRUE");
                    table.ForeignKey(
                        name: "fk_user_notification_preferences_user_profiles",
                        column: x => x.user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_notification_preferences");
        }
    }
}
