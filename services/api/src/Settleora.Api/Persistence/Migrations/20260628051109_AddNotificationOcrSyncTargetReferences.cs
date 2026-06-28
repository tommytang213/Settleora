using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationOcrSyncTargetReferences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "receipt_attachment_file_id",
                table: "user_notifications",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "receipt_ocr_review_id",
                table: "user_notifications",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "sync_operation_id",
                table: "user_notifications",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_notifications_receipt_attachment_file_id",
                table: "user_notifications",
                column: "receipt_attachment_file_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_notifications_receipt_ocr_review_id",
                table: "user_notifications",
                column: "receipt_ocr_review_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_notifications_sync_operation_id",
                table: "user_notifications",
                column: "sync_operation_id");

            migrationBuilder.AddForeignKey(
                name: "fk_user_notifications_file_objects_receipt_attachment_file_id",
                table: "user_notifications",
                column: "receipt_attachment_file_id",
                principalTable: "file_objects",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_user_notifications_receipt_ocr_reviews_review_id",
                table: "user_notifications",
                column: "receipt_ocr_review_id",
                principalTable: "receipt_ocr_reviews",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_user_notifications_sync_operations_operation_id",
                table: "user_notifications",
                column: "sync_operation_id",
                principalTable: "sync_operations",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_user_notifications_file_objects_receipt_attachment_file_id",
                table: "user_notifications");

            migrationBuilder.DropForeignKey(
                name: "fk_user_notifications_receipt_ocr_reviews_review_id",
                table: "user_notifications");

            migrationBuilder.DropForeignKey(
                name: "fk_user_notifications_sync_operations_operation_id",
                table: "user_notifications");

            migrationBuilder.DropIndex(
                name: "ix_user_notifications_receipt_attachment_file_id",
                table: "user_notifications");

            migrationBuilder.DropIndex(
                name: "ix_user_notifications_receipt_ocr_review_id",
                table: "user_notifications");

            migrationBuilder.DropIndex(
                name: "ix_user_notifications_sync_operation_id",
                table: "user_notifications");

            migrationBuilder.DropColumn(
                name: "receipt_attachment_file_id",
                table: "user_notifications");

            migrationBuilder.DropColumn(
                name: "receipt_ocr_review_id",
                table: "user_notifications");

            migrationBuilder.DropColumn(
                name: "sync_operation_id",
                table: "user_notifications");
        }
    }
}
