using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAuthInvitationPolicyRuntime : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "auth_invitation_policies",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    policy_version = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    capability_state = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    pending_invite_grace_when_disabled = table.Column<bool>(type: "boolean", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    retired_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    changed_by_auth_account_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_invitation_policies", x => x.id);
                    table.CheckConstraint("ck_auth_invitation_policies_active_not_retired", "(status = 'active' AND retired_at_utc IS NULL) OR (status = 'retired' AND retired_at_utc IS NOT NULL)");
                    table.CheckConstraint("ck_auth_invitation_policies_capability_state", "capability_state IN ('disabled', 'enabled')");
                    table.CheckConstraint("ck_auth_invitation_policies_positive_version", "policy_version > 0");
                    table.CheckConstraint("ck_auth_invitation_policies_status", "status IN ('active', 'retired')");
                    table.ForeignKey(
                        name: "fk_auth_invitation_policies_changed_by_auth_accounts",
                        column: x => x.changed_by_auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_auth_invitation_policies_changed_by_auth_account_id",
                table: "auth_invitation_policies",
                column: "changed_by_auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ux_auth_invitation_policies_active",
                table: "auth_invitation_policies",
                column: "status",
                unique: true,
                filter: "status = 'active'");

            migrationBuilder.CreateIndex(
                name: "ux_auth_invitation_policies_policy_version",
                table: "auth_invitation_policies",
                column: "policy_version",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "auth_invitation_policies");
        }
    }
}
