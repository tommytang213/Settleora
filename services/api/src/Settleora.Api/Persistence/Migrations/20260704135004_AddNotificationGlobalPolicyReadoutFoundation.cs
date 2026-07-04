using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationGlobalPolicyReadoutFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "notification_global_policies",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    policy_version = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    in_app_channel_cap = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    email_channel_cap = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    mobile_push_channel_cap = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    email_provider_readiness = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    mobile_push_provider_readiness = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    required_in_app_enabled = table.Column<bool>(type: "boolean", nullable: false),
                    ordinary_mute_may_suppress_required = table.Column<bool>(type: "boolean", nullable: false),
                    quiet_hours_may_defer_required = table.Column<bool>(type: "boolean", nullable: false),
                    external_sensitive_content_class = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    quiet_hours_default_mode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    digest_default_mode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    effective_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_by_auth_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    updated_by_auth_account_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notification_global_policies", x => x.id);
                    table.CheckConstraint("ck_notification_global_policies_digest_default_mode", "digest_default_mode IN ('immediate', 'digest_readout', 'deferred', 'disabled')");
                    table.CheckConstraint("ck_notification_global_policies_email_channel_cap", "email_channel_cap IN ('enabled', 'disabled', 'unsupported', 'digest_only', 'immediate_allowed', 'generic_external_only', 'in_app_only')");
                    table.CheckConstraint("ck_notification_global_policies_email_provider_readiness", "email_provider_readiness IN ('unsupported', 'unconfigured', 'configured', 'invalid', 'disabled', 'limited', 'unknown')");
                    table.CheckConstraint("ck_notification_global_policies_external_sensitive_content_cla~", "external_sensitive_content_class IN ('in_app_only', 'generic_external_only', 'safe_summary_allowed')");
                    table.CheckConstraint("ck_notification_global_policies_in_app_channel_cap", "in_app_channel_cap IN ('enabled', 'disabled', 'unsupported', 'digest_only', 'immediate_allowed', 'generic_external_only', 'in_app_only')");
                    table.CheckConstraint("ck_notification_global_policies_mobile_push_channel_cap", "mobile_push_channel_cap IN ('enabled', 'disabled', 'unsupported', 'digest_only', 'immediate_allowed', 'generic_external_only', 'in_app_only')");
                    table.CheckConstraint("ck_notification_global_policies_mobile_push_provider_readiness", "mobile_push_provider_readiness IN ('unsupported', 'unconfigured', 'configured', 'invalid', 'disabled', 'limited', 'unknown')");
                    table.CheckConstraint("ck_notification_global_policies_policy_version_not_blank", "length(btrim(policy_version)) > 0");
                    table.CheckConstraint("ck_notification_global_policies_quiet_hours_default_mode", "quiet_hours_default_mode IN ('immediate', 'digest_readout', 'deferred', 'disabled')");
                    table.CheckConstraint("ck_notification_global_policies_required_in_app_enabled", "required_in_app_enabled = TRUE");
                    table.CheckConstraint("ck_notification_global_policies_status", "status IN ('active', 'draft', 'disabled', 'superseded')");
                    table.ForeignKey(
                        name: "fk_notification_global_policies_created_by_auth_accounts",
                        column: x => x.created_by_auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notification_global_policies_updated_by_auth_accounts",
                        column: x => x.updated_by_auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "notification_event_policy_overrides",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    notification_global_policy_id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_family = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    in_app_channel_cap = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    email_channel_cap = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    mobile_push_channel_cap = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    external_content_class = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    required_in_app = table.Column<bool>(type: "boolean", nullable: false),
                    digest_eligible = table.Column<bool>(type: "boolean", nullable: false),
                    quiet_hours_eligible = table.Column<bool>(type: "boolean", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notification_event_policy_overrides", x => x.id);
                    table.CheckConstraint("ck_notification_event_policy_overrides_email_channel_cap", "email_channel_cap IN ('enabled', 'disabled', 'unsupported', 'digest_only', 'immediate_allowed', 'generic_external_only', 'in_app_only')");
                    table.CheckConstraint("ck_notification_event_policy_overrides_event_family", "event_family IN ('bills', 'settlements', 'recurring', 'ocr', 'sync', 'auth_security')");
                    table.CheckConstraint("ck_notification_event_policy_overrides_external_content_class", "external_content_class IN ('in_app_only', 'generic_external_only', 'safe_summary_allowed')");
                    table.CheckConstraint("ck_notification_event_policy_overrides_in_app_channel_cap", "in_app_channel_cap IN ('enabled', 'disabled', 'unsupported', 'digest_only', 'immediate_allowed', 'generic_external_only', 'in_app_only')");
                    table.CheckConstraint("ck_notification_event_policy_overrides_mobile_push_channel_cap", "mobile_push_channel_cap IN ('enabled', 'disabled', 'unsupported', 'digest_only', 'immediate_allowed', 'generic_external_only', 'in_app_only')");
                    table.CheckConstraint("ck_notification_event_policy_overrides_required_in_app", "required_in_app = TRUE");
                    table.ForeignKey(
                        name: "fk_notification_event_policy_overrides_global_policies",
                        column: x => x.notification_global_policy_id,
                        principalTable: "notification_global_policies",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ux_notification_event_policy_overrides_policy_family",
                table: "notification_event_policy_overrides",
                columns: new[] { "notification_global_policy_id", "event_family" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_notification_global_policies_created_by_auth_account_id",
                table: "notification_global_policies",
                column: "created_by_auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_global_policies_status_effective_updated",
                table: "notification_global_policies",
                columns: new[] { "status", "effective_at_utc", "updated_at_utc" });

            migrationBuilder.CreateIndex(
                name: "IX_notification_global_policies_updated_by_auth_account_id",
                table: "notification_global_policies",
                column: "updated_by_auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ux_notification_global_policies_policy_version",
                table: "notification_global_policies",
                column: "policy_version",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notification_event_policy_overrides");

            migrationBuilder.DropTable(
                name: "notification_global_policies");
        }
    }
}
