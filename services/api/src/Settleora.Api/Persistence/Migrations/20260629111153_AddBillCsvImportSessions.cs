using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBillCsvImportSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "bill_csv_import_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    actor_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    scope = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    payload_digest = table.Column<string>(type: "character varying(96)", maxLength: 96, nullable: false),
                    preflight_result_version = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    confirmation_challenge_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    review_json = table.Column<string>(type: "jsonb", nullable: false),
                    candidate_json = table.Column<string>(type: "jsonb", nullable: false),
                    row_count = table.Column<int>(type: "integer", nullable: false),
                    accepted_row_count = table.Column<int>(type: "integer", nullable: false),
                    warning_row_count = table.Column<int>(type: "integer", nullable: false),
                    rejected_row_count = table.Column<int>(type: "integer", nullable: false),
                    duplicate_candidate_row_count = table.Column<int>(type: "integer", nullable: false),
                    expires_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    confirmed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    discarded_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bill_csv_import_sessions", x => x.id);
                    table.CheckConstraint("ck_bill_csv_import_sessions_group_scope", "(scope = 'group') = (group_id IS NOT NULL)");
                    table.CheckConstraint("ck_bill_csv_import_sessions_row_counts", "row_count >= 0 AND accepted_row_count >= 0 AND warning_row_count >= 0 AND rejected_row_count >= 0 AND duplicate_candidate_row_count >= 0");
                    table.CheckConstraint("ck_bill_csv_import_sessions_scope", "scope IN ('personal', 'group')");
                    table.CheckConstraint("ck_bill_csv_import_sessions_status", "status IN ('needs_correction', 'ready_for_confirmation', 'confirmed', 'discarded', 'expired')");
                    table.ForeignKey(
                        name: "fk_bill_csv_import_sessions_actor_user_profiles",
                        column: x => x.actor_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_bill_csv_import_sessions_auth_accounts",
                        column: x => x.auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_bill_csv_import_sessions_auth_sessions",
                        column: x => x.auth_session_id,
                        principalTable: "auth_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_bill_csv_import_sessions_user_groups",
                        column: x => x.group_id,
                        principalTable: "user_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_bill_csv_import_sessions_actor_status_expires",
                table: "bill_csv_import_sessions",
                columns: new[] { "actor_user_profile_id", "status", "expires_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_bill_csv_import_sessions_actor_user_profile_id",
                table: "bill_csv_import_sessions",
                column: "actor_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "IX_bill_csv_import_sessions_auth_account_id",
                table: "bill_csv_import_sessions",
                column: "auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_bill_csv_import_sessions_auth_session_id",
                table: "bill_csv_import_sessions",
                column: "auth_session_id");

            migrationBuilder.CreateIndex(
                name: "ix_bill_csv_import_sessions_group_id",
                table: "bill_csv_import_sessions",
                column: "group_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "bill_csv_import_sessions");
        }
    }
}
