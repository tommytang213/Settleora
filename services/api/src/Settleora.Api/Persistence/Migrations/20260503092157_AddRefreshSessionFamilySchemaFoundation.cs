using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRefreshSessionFamilySchemaFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "auth_session_families",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    absolute_expires_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_rotated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revocation_reason = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_session_families", x => x.id);
                    table.CheckConstraint("ck_auth_session_families_revocation_reason_not_blank", "revocation_reason IS NULL OR length(btrim(revocation_reason)) > 0");
                    table.CheckConstraint("ck_auth_session_families_status", "status IN ('active', 'revoked', 'expired', 'replayed')");
                    table.ForeignKey(
                        name: "fk_auth_session_families_auth_accounts_auth_account_id",
                        column: x => x.auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "auth_refresh_credentials",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_session_family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_session_id = table.Column<Guid>(type: "uuid", nullable: true),
                    refresh_token_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    issued_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    idle_expires_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    absolute_expires_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    consumed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    replaced_by_refresh_credential_id = table.Column<Guid>(type: "uuid", nullable: true),
                    revocation_reason = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_refresh_credentials", x => x.id);
                    table.CheckConstraint("ck_auth_refresh_credentials_hash_not_blank", "length(btrim(refresh_token_hash)) > 0");
                    table.CheckConstraint("ck_auth_refresh_credentials_revocation_reason_not_blank", "revocation_reason IS NULL OR length(btrim(revocation_reason)) > 0");
                    table.CheckConstraint("ck_auth_refresh_credentials_status", "status IN ('active', 'rotated', 'revoked', 'expired', 'replayed')");
                    table.ForeignKey(
                        name: "fk_auth_refresh_credentials_auth_sessions_auth_session_id",
                        column: x => x.auth_session_id,
                        principalTable: "auth_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_refresh_credentials_replaced_by_refresh_credential_id",
                        column: x => x.replaced_by_refresh_credential_id,
                        principalTable: "auth_refresh_credentials",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_refresh_credentials_session_families_family_id",
                        column: x => x.auth_session_family_id,
                        principalTable: "auth_session_families",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_auth_refresh_credentials_absolute_expires_at_utc",
                table: "auth_refresh_credentials",
                column: "absolute_expires_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_auth_refresh_credentials_auth_session_family_id",
                table: "auth_refresh_credentials",
                column: "auth_session_family_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_refresh_credentials_auth_session_id",
                table: "auth_refresh_credentials",
                column: "auth_session_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_refresh_credentials_consumed_at_utc",
                table: "auth_refresh_credentials",
                column: "consumed_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_auth_refresh_credentials_family_status",
                table: "auth_refresh_credentials",
                columns: new[] { "auth_session_family_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_auth_refresh_credentials_idle_expires_at_utc",
                table: "auth_refresh_credentials",
                column: "idle_expires_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_auth_refresh_credentials_replaced_by_id",
                table: "auth_refresh_credentials",
                column: "replaced_by_refresh_credential_id");

            migrationBuilder.CreateIndex(
                name: "ux_auth_refresh_credentials_refresh_token_hash",
                table: "auth_refresh_credentials",
                column: "refresh_token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_auth_session_families_absolute_expires_at_utc",
                table: "auth_session_families",
                column: "absolute_expires_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_auth_session_families_auth_account_id",
                table: "auth_session_families",
                column: "auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_session_families_status",
                table: "auth_session_families",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "auth_refresh_credentials");

            migrationBuilder.DropTable(
                name: "auth_session_families");
        }
    }
}
