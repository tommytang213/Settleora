using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptOcrReviewDraftApplyItemSource : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "source_kind",
                table: "expense_bill_items",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "source_receipt_ocr_review_id",
                table: "expense_bill_items",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "source_receipt_ocr_review_line_id",
                table: "expense_bill_items",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_items_bill_source_review",
                table: "expense_bill_items",
                columns: new[] { "expense_bill_id", "source_kind", "source_receipt_ocr_review_id" });

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_items_source_review_id",
                table: "expense_bill_items",
                column: "source_receipt_ocr_review_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_items_source_review_line_id",
                table: "expense_bill_items",
                column: "source_receipt_ocr_review_line_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bill_items_ocr_source_complete",
                table: "expense_bill_items",
                sql: "((source_kind IS NULL AND source_receipt_ocr_review_id IS NULL AND source_receipt_ocr_review_line_id IS NULL) OR (source_kind = 'receipt_ocr_review_apply' AND source_receipt_ocr_review_id IS NOT NULL AND source_receipt_ocr_review_line_id IS NOT NULL))");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bill_items_source_kind",
                table: "expense_bill_items",
                sql: "source_kind IS NULL OR source_kind IN ('receipt_ocr_review_apply')");

            migrationBuilder.AddForeignKey(
                name: "fk_expense_bill_items_receipt_ocr_review_lines_source_line_id",
                table: "expense_bill_items",
                column: "source_receipt_ocr_review_line_id",
                principalTable: "receipt_ocr_review_lines",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_expense_bill_items_receipt_ocr_reviews_source_review_id",
                table: "expense_bill_items",
                column: "source_receipt_ocr_review_id",
                principalTable: "receipt_ocr_reviews",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_expense_bill_items_receipt_ocr_review_lines_source_line_id",
                table: "expense_bill_items");

            migrationBuilder.DropForeignKey(
                name: "fk_expense_bill_items_receipt_ocr_reviews_source_review_id",
                table: "expense_bill_items");

            migrationBuilder.DropIndex(
                name: "ix_expense_bill_items_bill_source_review",
                table: "expense_bill_items");

            migrationBuilder.DropIndex(
                name: "ix_expense_bill_items_source_review_id",
                table: "expense_bill_items");

            migrationBuilder.DropIndex(
                name: "ix_expense_bill_items_source_review_line_id",
                table: "expense_bill_items");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bill_items_ocr_source_complete",
                table: "expense_bill_items");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bill_items_source_kind",
                table: "expense_bill_items");

            migrationBuilder.DropColumn(
                name: "source_kind",
                table: "expense_bill_items");

            migrationBuilder.DropColumn(
                name: "source_receipt_ocr_review_id",
                table: "expense_bill_items");

            migrationBuilder.DropColumn(
                name: "source_receipt_ocr_review_line_id",
                table: "expense_bill_items");
        }
    }
}
