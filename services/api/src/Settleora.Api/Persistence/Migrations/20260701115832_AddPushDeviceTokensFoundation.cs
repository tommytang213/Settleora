using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPushDeviceTokensFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "push_device_tokens",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    device_installation_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    platform = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    provider = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    app_build_environment = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    token_fingerprint = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    protected_token_blob = table.Column<string>(type: "character varying(8192)", maxLength: 8192, nullable: false),
                    protection_key_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    protection_purpose = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    token_version = table.Column<int>(type: "integer", nullable: false),
                    permission_state = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status_reason = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    last_seen_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    registered_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    rotated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    superseded_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    stale_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    provider_feedback_category = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    failure_count = table.Column<int>(type: "integer", nullable: false),
                    last_failure_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    client_observed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_push_device_tokens", x => x.id);
                    table.CheckConstraint("ck_push_device_tokens_app_build_environment", "app_build_environment IN ('development', 'staging', 'production')");
                    table.CheckConstraint("ck_push_device_tokens_device_installation_hash_not_blank", "length(btrim(device_installation_hash)) > 0");
                    table.CheckConstraint("ck_push_device_tokens_failure_count_non_negative", "failure_count >= 0");
                    table.CheckConstraint("ck_push_device_tokens_fingerprint_not_blank", "length(btrim(token_fingerprint)) > 0");
                    table.CheckConstraint("ck_push_device_tokens_permission_state", "permission_state IN ('authorized', 'provisional', 'denied', 'not_determined')");
                    table.CheckConstraint("ck_push_device_tokens_platform", "platform IN ('ios', 'android')");
                    table.CheckConstraint("ck_push_device_tokens_protected_blob_not_blank", "length(btrim(protected_token_blob)) > 0");
                    table.CheckConstraint("ck_push_device_tokens_protection_key_id_not_blank", "length(btrim(protection_key_id)) > 0");
                    table.CheckConstraint("ck_push_device_tokens_protection_purpose_not_blank", "length(btrim(protection_purpose)) > 0");
                    table.CheckConstraint("ck_push_device_tokens_provider", "provider IN ('apns', 'fcm')");
                    table.CheckConstraint("ck_push_device_tokens_provider_feedback_not_blank", "provider_feedback_category IS NULL OR length(btrim(provider_feedback_category)) > 0");
                    table.CheckConstraint("ck_push_device_tokens_status", "status IN ('active', 'revoked', 'superseded', 'stale', 'provider_invalid')");
                    table.CheckConstraint("ck_push_device_tokens_token_version_positive", "token_version > 0");
                    table.ForeignKey(
                        name: "fk_push_device_tokens_auth_accounts",
                        column: x => x.auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_push_device_tokens_auth_sessions",
                        column: x => x.auth_session_id,
                        principalTable: "auth_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_push_device_tokens_user_profiles",
                        column: x => x.user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_push_device_tokens_auth_account_id",
                table: "push_device_tokens",
                column: "auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_push_device_tokens_auth_session_status",
                table: "push_device_tokens",
                columns: new[] { "auth_session_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_push_device_tokens_revoked_at_utc",
                table: "push_device_tokens",
                column: "revoked_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_push_device_tokens_status_stale_at",
                table: "push_device_tokens",
                columns: new[] { "status", "stale_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_push_device_tokens_user_status_last_seen",
                table: "push_device_tokens",
                columns: new[] { "user_profile_id", "status", "last_seen_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ux_push_device_tokens_active_fingerprint_provider_env",
                table: "push_device_tokens",
                columns: new[] { "token_fingerprint", "provider", "app_build_environment" },
                unique: true,
                filter: "status = 'active'");

            migrationBuilder.CreateIndex(
                name: "ux_push_device_tokens_active_user_device_provider_env",
                table: "push_device_tokens",
                columns: new[] { "user_profile_id", "platform", "provider", "device_installation_hash", "app_build_environment" },
                unique: true,
                filter: "status = 'active'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "push_device_tokens");
        }
    }
}
