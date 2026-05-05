using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUserPaymentProfilesFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "user_payment_profiles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    preferred_method_label = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    payment_handle = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    payment_note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    visibility = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    deleted_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_payment_profiles", x => x.id);
                    table.CheckConstraint("ck_user_payment_profiles_payment_handle_not_blank", "payment_handle IS NULL OR length(btrim(payment_handle)) > 0");
                    table.CheckConstraint("ck_user_payment_profiles_payment_note_not_blank", "payment_note IS NULL OR length(btrim(payment_note)) > 0");
                    table.CheckConstraint("ck_user_payment_profiles_preferred_method_label_not_blank", "preferred_method_label IS NULL OR length(btrim(preferred_method_label)) > 0");
                    table.CheckConstraint("ck_user_payment_profiles_visibility", "visibility IN ('private', 'settlement_counterparties_only', 'group_members_when_shared')");
                    table.ForeignKey(
                        name: "fk_user_payment_profiles_user_profiles_user_profile_id",
                        column: x => x.user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ux_user_payment_profiles_active_user_profile_id",
                table: "user_payment_profiles",
                column: "user_profile_id",
                unique: true,
                filter: "deleted_at_utc IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_payment_profiles");
        }
    }
}
