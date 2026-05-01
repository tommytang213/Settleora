using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAuthIdentitySchemaFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "auth_accounts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    disabled_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    deleted_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_accounts", x => x.id);
                    table.CheckConstraint("ck_auth_accounts_status", "status IN ('active', 'disabled')");
                    table.ForeignKey(
                        name: "fk_auth_accounts_user_profiles_user_profile_id",
                        column: x => x.user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "auth_identities",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    provider_type = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    provider_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    provider_subject = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    disabled_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_identities", x => x.id);
                    table.CheckConstraint("ck_auth_identities_provider_name_not_blank", "length(btrim(provider_name)) > 0");
                    table.CheckConstraint("ck_auth_identities_provider_subject_not_blank", "length(btrim(provider_subject)) > 0");
                    table.CheckConstraint("ck_auth_identities_provider_type", "provider_type IN ('local', 'oidc')");
                    table.ForeignKey(
                        name: "fk_auth_identities_auth_accounts_auth_account_id",
                        column: x => x.auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "system_role_assignments",
                columns: table => new
                {
                    auth_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    assigned_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    assigned_by_auth_account_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_system_role_assignments", x => new { x.auth_account_id, x.role });
                    table.CheckConstraint("ck_system_role_assignments_role", "role IN ('owner', 'admin', 'user')");
                    table.ForeignKey(
                        name: "fk_system_role_assignments_assigned_by_auth_account",
                        column: x => x.assigned_by_auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_system_role_assignments_auth_account",
                        column: x => x.auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ux_auth_accounts_user_profile_id",
                table: "auth_accounts",
                column: "user_profile_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_auth_identities_auth_account_id",
                table: "auth_identities",
                column: "auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ux_auth_identities_provider_lookup",
                table: "auth_identities",
                columns: new[] { "provider_type", "provider_name", "provider_subject" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_system_role_assignments_assigned_by_auth_account_id",
                table: "system_role_assignments",
                column: "assigned_by_auth_account_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "auth_identities");

            migrationBuilder.DropTable(
                name: "system_role_assignments");

            migrationBuilder.DropTable(
                name: "auth_accounts");
        }
    }
}
