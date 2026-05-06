using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentProfileQrFileReference : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "qr_file_object_id",
                table: "user_payment_profiles",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_payment_profiles_qr_file_object_id",
                table: "user_payment_profiles",
                column: "qr_file_object_id");

            migrationBuilder.AddForeignKey(
                name: "fk_user_payment_profiles_file_objects_qr_file_object_id",
                table: "user_payment_profiles",
                column: "qr_file_object_id",
                principalTable: "file_objects",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_user_payment_profiles_file_objects_qr_file_object_id",
                table: "user_payment_profiles");

            migrationBuilder.DropIndex(
                name: "ix_user_payment_profiles_qr_file_object_id",
                table: "user_payment_profiles");

            migrationBuilder.DropColumn(
                name: "qr_file_object_id",
                table: "user_payment_profiles");
        }
    }
}
