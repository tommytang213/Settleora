using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAuthCredentialsSessionsAuditSchemaFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "auth_audit_events",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    actor_auth_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    subject_auth_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    action = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    outcome = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    occurred_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    correlation_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    request_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    safe_metadata_json = table.Column<string>(type: "character varying(4096)", maxLength: 4096, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_audit_events", x => x.id);
                    table.CheckConstraint("ck_auth_audit_events_action_not_blank", "length(btrim(action)) > 0");
                    table.CheckConstraint("ck_auth_audit_events_correlation_id_not_blank", "correlation_id IS NULL OR length(btrim(correlation_id)) > 0");
                    table.CheckConstraint("ck_auth_audit_events_outcome", "outcome IN ('success', 'failure', 'denied', 'revoked', 'expired', 'blocked_by_policy')");
                    table.CheckConstraint("ck_auth_audit_events_request_id_not_blank", "request_id IS NULL OR length(btrim(request_id)) > 0");
                    table.CheckConstraint("ck_auth_audit_events_safe_metadata_json_not_blank", "safe_metadata_json IS NULL OR length(btrim(safe_metadata_json)) > 0");
                    table.ForeignKey(
                        name: "fk_auth_audit_events_actor_auth_account",
                        column: x => x.actor_auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_audit_events_subject_auth_account",
                        column: x => x.subject_auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "auth_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    session_token_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    refresh_token_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    issued_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_seen_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revocation_reason = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    device_label = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    user_agent_summary = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    network_address_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_sessions", x => x.id);
                    table.CheckConstraint("ck_auth_sessions_device_label_not_blank", "device_label IS NULL OR length(btrim(device_label)) > 0");
                    table.CheckConstraint("ck_auth_sessions_network_address_hash_not_blank", "network_address_hash IS NULL OR length(btrim(network_address_hash)) > 0");
                    table.CheckConstraint("ck_auth_sessions_refresh_token_hash_not_blank", "refresh_token_hash IS NULL OR length(btrim(refresh_token_hash)) > 0");
                    table.CheckConstraint("ck_auth_sessions_revocation_reason_not_blank", "revocation_reason IS NULL OR length(btrim(revocation_reason)) > 0");
                    table.CheckConstraint("ck_auth_sessions_session_token_hash_not_blank", "length(btrim(session_token_hash)) > 0");
                    table.CheckConstraint("ck_auth_sessions_status", "status IN ('active', 'revoked', 'expired')");
                    table.CheckConstraint("ck_auth_sessions_user_agent_summary_not_blank", "user_agent_summary IS NULL OR length(btrim(user_agent_summary)) > 0");
                    table.ForeignKey(
                        name: "fk_auth_sessions_auth_accounts_auth_account_id",
                        column: x => x.auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "local_password_credentials",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    password_hash = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    password_hash_algorithm = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    password_hash_algorithm_version = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    password_hash_parameters = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_verified_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    requires_rehash = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_local_password_credentials", x => x.id);
                    table.CheckConstraint("ck_local_password_credentials_hash_algorithm_not_blank", "length(btrim(password_hash_algorithm)) > 0");
                    table.CheckConstraint("ck_local_password_credentials_hash_algorithm_version_not_blank", "length(btrim(password_hash_algorithm_version)) > 0");
                    table.CheckConstraint("ck_local_password_credentials_hash_not_blank", "length(btrim(password_hash)) > 0");
                    table.CheckConstraint("ck_local_password_credentials_hash_parameters_not_blank", "length(btrim(password_hash_parameters)) > 0");
                    table.CheckConstraint("ck_local_password_credentials_status", "status IN ('active', 'disabled', 'revoked')");
                    table.ForeignKey(
                        name: "fk_local_password_credentials_auth_accounts_auth_account_id",
                        column: x => x.auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_auth_audit_events_actor_auth_account_id",
                table: "auth_audit_events",
                column: "actor_auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_audit_events_occurred_at_utc",
                table: "auth_audit_events",
                column: "occurred_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_auth_audit_events_subject_auth_account_id",
                table: "auth_audit_events",
                column: "subject_auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_sessions_auth_account_id",
                table: "auth_sessions",
                column: "auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_sessions_expires_at_utc",
                table: "auth_sessions",
                column: "expires_at_utc");

            migrationBuilder.CreateIndex(
                name: "ux_auth_sessions_refresh_token_hash",
                table: "auth_sessions",
                column: "refresh_token_hash",
                unique: true,
                filter: "refresh_token_hash IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ux_auth_sessions_session_token_hash",
                table: "auth_sessions",
                column: "session_token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_local_password_credentials_auth_account_id",
                table: "local_password_credentials",
                column: "auth_account_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "auth_audit_events");

            migrationBuilder.DropTable(
                name: "auth_sessions");

            migrationBuilder.DropTable(
                name: "local_password_credentials");
        }
    }
}
