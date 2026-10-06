using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RetainAppliedReceiptOcrReviewLines : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_receipt_ocr_review_lines_review_sort_order",
                table: "receipt_ocr_review_lines");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "superseded_at_utc",
                table: "receipt_ocr_review_lines",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ux_receipt_ocr_review_lines_review_sort_order",
                table: "receipt_ocr_review_lines",
                columns: new[] { "receipt_ocr_review_id", "sort_order" },
                unique: true,
                filter: "superseded_at_utc IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Refuse before any destructive DDL: old runtimes cannot safely
            // distinguish retained historical lines from active review lines.
            // Wait for existing writers before checking, then exclude new
            // retirements until the migration transaction finishes.
            migrationBuilder.Sql("LOCK TABLE receipt_ocr_review_lines IN ACCESS EXCLUSIVE MODE;");

            migrationBuilder.Sql("""
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM receipt_ocr_review_lines WHERE superseded_at_utc IS NOT NULL) THEN
                        RAISE EXCEPTION 'Cannot roll back RetainAppliedReceiptOcrReviewLines while referenced historical lines exist.';
                    END IF;
                END $$;
                """);

            migrationBuilder.DropIndex(
                name: "ux_receipt_ocr_review_lines_review_sort_order",
                table: "receipt_ocr_review_lines");

            migrationBuilder.DropColumn(
                name: "superseded_at_utc",
                table: "receipt_ocr_review_lines");

            migrationBuilder.CreateIndex(
                name: "ux_receipt_ocr_review_lines_review_sort_order",
                table: "receipt_ocr_review_lines",
                columns: new[] { "receipt_ocr_review_id", "sort_order" },
                unique: true);
        }
    }
}
