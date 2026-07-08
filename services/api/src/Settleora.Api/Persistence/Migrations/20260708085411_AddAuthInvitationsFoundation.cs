using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAuthInvitationsFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "auth_invitations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    contact_identifier_kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    contact_identifier_normalized = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    invitation_secret_hash = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    invitation_secret_hash_version = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    target_system_role = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    invited_by_auth_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    invited_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    revoked_by_auth_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    accepted_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    expired_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    cleanup_eligible_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_invitations", x => x.id);
                    table.CheckConstraint("ck_auth_invitations_contact_identifier_kind", "contact_identifier_kind IN ('email')");
                    table.CheckConstraint("ck_auth_invitations_contact_identifier_not_blank", "length(btrim(contact_identifier_normalized)) > 0");
                    table.CheckConstraint("ck_auth_invitations_expiry_after_created", "expires_at_utc > created_at_utc");
                    table.CheckConstraint("ck_auth_invitations_revoker_timestamp", "(revoked_by_auth_account_id IS NULL AND revoked_at_utc IS NULL) OR (revoked_by_auth_account_id IS NOT NULL AND revoked_at_utc IS NOT NULL)");
                    table.CheckConstraint("ck_auth_invitations_secret_hash_not_blank", "length(btrim(invitation_secret_hash)) > 0");
                    table.CheckConstraint("ck_auth_invitations_secret_hash_version_not_blank", "length(btrim(invitation_secret_hash_version)) > 0");
                    table.CheckConstraint("ck_auth_invitations_status", "status IN ('pending', 'accepted', 'revoked', 'expired')");
                    table.CheckConstraint("ck_auth_invitations_status_timestamp", "(status = 'pending' AND accepted_at_utc IS NULL AND revoked_at_utc IS NULL AND expired_at_utc IS NULL) OR (status = 'accepted' AND accepted_at_utc IS NOT NULL AND revoked_at_utc IS NULL) OR (status = 'revoked' AND revoked_at_utc IS NOT NULL AND accepted_at_utc IS NULL) OR (status = 'expired' AND expired_at_utc IS NOT NULL AND accepted_at_utc IS NULL AND revoked_at_utc IS NULL)");
                    table.CheckConstraint("ck_auth_invitations_target_system_role_user_only", "target_system_role = 'user'");
                    table.ForeignKey(
                        name: "fk_auth_invitations_invited_by_auth_accounts",
                        column: x => x.invited_by_auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_invitations_invited_by_user_profiles",
                        column: x => x.invited_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_invitations_revoked_by_auth_accounts",
                        column: x => x.revoked_by_auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_auth_invitations_cleanup_eligible_at_utc",
                table: "auth_invitations",
                column: "cleanup_eligible_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_auth_invitations_invited_by_auth_account_id",
                table: "auth_invitations",
                column: "invited_by_auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_invitations_invited_by_user_profile_id",
                table: "auth_invitations",
                column: "invited_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_invitations_revoked_by_auth_account_id",
                table: "auth_invitations",
                column: "revoked_by_auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_invitations_status_expires_at_utc",
                table: "auth_invitations",
                columns: new[] { "status", "expires_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ux_auth_invitations_pending_contact_identifier",
                table: "auth_invitations",
                columns: new[] { "contact_identifier_kind", "contact_identifier_normalized" },
                unique: true,
                filter: "status = 'pending'");

            migrationBuilder.CreateIndex(
                name: "ux_auth_invitations_secret_hash",
                table: "auth_invitations",
                column: "invitation_secret_hash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "auth_invitations");
        }
    }
}
