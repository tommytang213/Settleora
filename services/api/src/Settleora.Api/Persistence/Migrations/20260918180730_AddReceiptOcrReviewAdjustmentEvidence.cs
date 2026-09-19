using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptOcrReviewAdjustmentEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "receipt_ocr_review_adjustments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    receipt_ocr_review_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    kind = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    original_label = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    direction = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_ocr_review_adjustments", x => x.id);
                    table.CheckConstraint("ck_receipt_ocr_review_adjustments_amount_positive", "amount > 0");
                    table.CheckConstraint("ck_receipt_ocr_review_adjustments_amount_upper_bound", "amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_receipt_ocr_review_adjustments_credit_kind_direction", "kind <> 'credit' OR direction = 'credit'");
                    table.CheckConstraint("ck_receipt_ocr_review_adjustments_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_receipt_ocr_review_adjustments_direction", "direction IN ('charge', 'credit')");
                    table.CheckConstraint("ck_receipt_ocr_review_adjustments_kind", "kind IN ('tip', 'shipping', 'fee', 'surcharge', 'deposit', 'credit', 'other')");
                    table.CheckConstraint("ck_receipt_ocr_review_adjustments_original_label_not_blank", "length(btrim(original_label)) > 0");
                    table.CheckConstraint("ck_receipt_ocr_review_adjustments_sort_order_non_negative", "sort_order >= 0");
                    table.ForeignKey(
                        name: "fk_receipt_ocr_review_adjustments_reviews_review_id",
                        column: x => x.receipt_ocr_review_id,
                        principalTable: "receipt_ocr_reviews",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_review_adjustments_review_id",
                table: "receipt_ocr_review_adjustments",
                column: "receipt_ocr_review_id");

            migrationBuilder.CreateIndex(
                name: "ux_receipt_ocr_review_adjustments_review_sort_order",
                table: "receipt_ocr_review_adjustments",
                columns: new[] { "receipt_ocr_review_id", "sort_order" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "receipt_ocr_review_adjustments");
        }
    }
}
