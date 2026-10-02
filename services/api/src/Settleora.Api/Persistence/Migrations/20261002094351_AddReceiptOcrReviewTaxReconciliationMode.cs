using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptOcrReviewTaxReconciliationMode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "tax_reconciliation_mode",
                table: "receipt_ocr_reviews",
                type: "character varying(24)",
                maxLength: 24,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_receipt_ocr_reviews_tax_reconciliation_mode",
                table: "receipt_ocr_reviews",
                sql: "tax_reconciliation_mode IS NULL OR tax_reconciliation_mode IN ('add_to_base', 'already_in_base', 'unresolved')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_receipt_ocr_reviews_tax_reconciliation_mode",
                table: "receipt_ocr_reviews");

            migrationBuilder.DropColumn(
                name: "tax_reconciliation_mode",
                table: "receipt_ocr_reviews");
        }
    }
}
