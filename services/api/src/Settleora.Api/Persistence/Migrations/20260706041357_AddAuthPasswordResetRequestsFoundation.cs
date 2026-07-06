using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAuthPasswordResetRequestsFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "auth_password_reset_requests",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    purpose = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    auth_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    local_password_credential_id = table.Column<Guid>(type: "uuid", nullable: true),
                    reset_material_hash = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    reset_material_hash_version = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    reset_material_scope = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    issued_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    expires_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    consumed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    replaced_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    suspicious_replay_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_checked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    replaced_by_reset_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    revocation_reason = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    delivery_category = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    provider_send_category = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    request_source_bucket_ref = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    identifier_bucket_ref = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    combined_bucket_ref = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    global_bucket_ref = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    provider_send_bucket_ref = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    request_correlation_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    audit_correlation_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    cleanup_eligible_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_password_reset_requests", x => x.id);
                    table.CheckConstraint("ck_auth_password_reset_requests_audit_correlation_not_blank", "audit_correlation_id IS NULL OR length(btrim(audit_correlation_id)) > 0");
                    table.CheckConstraint("ck_auth_password_reset_requests_combined_bucket_not_blank", "combined_bucket_ref IS NULL OR length(btrim(combined_bucket_ref)) > 0");
                    table.CheckConstraint("ck_auth_password_reset_requests_delivery_category", "delivery_category IN ('email_link', 'admin_delivered_future_gate', 'provider_skipped', 'provider_unavailable')");
                    table.CheckConstraint("ck_auth_password_reset_requests_expiry_after_issued", "issued_at_utc IS NULL OR expires_at_utc IS NULL OR expires_at_utc > issued_at_utc");
                    table.CheckConstraint("ck_auth_password_reset_requests_global_bucket_not_blank", "global_bucket_ref IS NULL OR length(btrim(global_bucket_ref)) > 0");
                    table.CheckConstraint("ck_auth_password_reset_requests_identifier_bucket_not_blank", "identifier_bucket_ref IS NULL OR length(btrim(identifier_bucket_ref)) > 0");
                    table.CheckConstraint("ck_auth_password_reset_requests_material_complete", "(reset_material_hash IS NULL AND reset_material_hash_version IS NULL AND reset_material_scope IS NULL AND issued_at_utc IS NULL AND expires_at_utc IS NULL) OR (reset_material_hash IS NOT NULL AND reset_material_hash_version IS NOT NULL AND reset_material_scope IS NOT NULL AND issued_at_utc IS NOT NULL AND expires_at_utc IS NOT NULL)");
                    table.CheckConstraint("ck_auth_password_reset_requests_material_hash_not_blank", "reset_material_hash IS NULL OR length(btrim(reset_material_hash)) > 0");
                    table.CheckConstraint("ck_auth_password_reset_requests_material_scope", "reset_material_scope IS NULL OR reset_material_scope IN ('email_link', 'typed_code')");
                    table.CheckConstraint("ck_auth_password_reset_requests_material_version_not_blank", "reset_material_hash_version IS NULL OR length(btrim(reset_material_hash_version)) > 0");
                    table.CheckConstraint("ck_auth_password_reset_requests_provider_bucket_not_blank", "provider_send_bucket_ref IS NULL OR length(btrim(provider_send_bucket_ref)) > 0");
                    table.CheckConstraint("ck_auth_password_reset_requests_provider_send_category", "provider_send_category IN ('not_attempted', 'queued_or_sent', 'skipped_by_policy', 'throttled', 'failed_safe', 'provider_disabled')");
                    table.CheckConstraint("ck_auth_password_reset_requests_purpose", "purpose IN ('local_password_reset')");
                    table.CheckConstraint("ck_auth_password_reset_requests_request_correlation_not_blank", "request_correlation_id IS NULL OR length(btrim(request_correlation_id)) > 0");
                    table.CheckConstraint("ck_auth_password_reset_requests_revocation_reason", "revocation_reason IS NULL OR revocation_reason IN ('replaced_by_newer_material', 'successful_reset', 'policy_blocked', 'account_disabled', 'provider_unavailable', 'cleanup_expired')");
                    table.CheckConstraint("ck_auth_password_reset_requests_source_bucket_not_blank", "request_source_bucket_ref IS NULL OR length(btrim(request_source_bucket_ref)) > 0");
                    table.CheckConstraint("ck_auth_password_reset_requests_status", "status IN ('pending', 'consumed', 'expired', 'revoked', 'suspicious_replay')");
                    table.ForeignKey(
                        name: "fk_auth_password_reset_requests_auth_accounts",
                        column: x => x.auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_password_reset_requests_local_password_credentials",
                        column: x => x.local_password_credential_id,
                        principalTable: "local_password_credentials",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_password_reset_requests_replaced_by_reset_request",
                        column: x => x.replaced_by_reset_request_id,
                        principalTable: "auth_password_reset_requests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_auth_password_reset_requests_account_purpose_status_expires",
                table: "auth_password_reset_requests",
                columns: new[] { "auth_account_id", "purpose", "status", "expires_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_auth_password_reset_requests_cleanup_eligible_at_utc",
                table: "auth_password_reset_requests",
                column: "cleanup_eligible_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_auth_password_reset_requests_expires_at_utc",
                table: "auth_password_reset_requests",
                column: "expires_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_auth_password_reset_requests_local_password_credential_id",
                table: "auth_password_reset_requests",
                column: "local_password_credential_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_password_reset_requests_pending_account_purpose",
                table: "auth_password_reset_requests",
                columns: new[] { "auth_account_id", "purpose", "status" },
                filter: "status = 'pending' AND auth_account_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_auth_password_reset_requests_replaced_by_id",
                table: "auth_password_reset_requests",
                column: "replaced_by_reset_request_id");

            migrationBuilder.CreateIndex(
                name: "ux_auth_password_reset_requests_material_hash",
                table: "auth_password_reset_requests",
                column: "reset_material_hash",
                unique: true,
                filter: "reset_material_hash IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "auth_password_reset_requests");
        }
    }
}
