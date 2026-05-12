using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptOcrReviewIntakeFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "receipt_ocr_reviews",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    expense_bill_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_object_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    source = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    merchant_text = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    receipt_issued_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: true),
                    subtotal_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: true),
                    tax_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: true),
                    service_charge_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: true),
                    discount_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: true),
                    grand_total_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    removed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_ocr_reviews", x => x.id);
                    table.CheckConstraint("ck_receipt_ocr_reviews_amounts_require_currency", "(currency IS NOT NULL OR (subtotal_amount IS NULL AND tax_amount IS NULL AND service_charge_amount IS NULL AND discount_amount IS NULL AND grand_total_amount IS NULL))");
                    table.CheckConstraint("ck_receipt_ocr_reviews_currency_uppercase_iso", "currency IS NULL OR currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_receipt_ocr_reviews_discount_amount_non_negative", "discount_amount IS NULL OR discount_amount >= 0");
                    table.CheckConstraint("ck_receipt_ocr_reviews_discount_amount_upper_bound", "discount_amount IS NULL OR discount_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_receipt_ocr_reviews_grand_total_amount_non_negative", "grand_total_amount IS NULL OR grand_total_amount >= 0");
                    table.CheckConstraint("ck_receipt_ocr_reviews_grand_total_amount_upper_bound", "grand_total_amount IS NULL OR grand_total_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_receipt_ocr_reviews_merchant_text_not_blank", "merchant_text IS NULL OR length(btrim(merchant_text)) > 0");
                    table.CheckConstraint("ck_receipt_ocr_reviews_service_charge_amount_non_negative", "service_charge_amount IS NULL OR service_charge_amount >= 0");
                    table.CheckConstraint("ck_receipt_ocr_reviews_service_charge_amount_upper_bound", "service_charge_amount IS NULL OR service_charge_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_receipt_ocr_reviews_source", "source IN ('on_device', 'manual_entry', 'imported_reviewed_data')");
                    table.CheckConstraint("ck_receipt_ocr_reviews_status", "status IN ('provisional', 'reviewed')");
                    table.CheckConstraint("ck_receipt_ocr_reviews_subtotal_amount_non_negative", "subtotal_amount IS NULL OR subtotal_amount >= 0");
                    table.CheckConstraint("ck_receipt_ocr_reviews_subtotal_amount_upper_bound", "subtotal_amount IS NULL OR subtotal_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_receipt_ocr_reviews_tax_amount_non_negative", "tax_amount IS NULL OR tax_amount >= 0");
                    table.CheckConstraint("ck_receipt_ocr_reviews_tax_amount_upper_bound", "tax_amount IS NULL OR tax_amount <= 999999999999999.9999");
                    table.ForeignKey(
                        name: "fk_receipt_ocr_reviews_expense_bill_attachments_bill_file",
                        columns: x => new { x.expense_bill_id, x.file_object_id },
                        principalTable: "expense_bill_attachments",
                        principalColumns: new[] { "expense_bill_id", "file_object_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_receipt_ocr_reviews_expense_bills_bill_id",
                        column: x => x.expense_bill_id,
                        principalTable: "expense_bills",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_receipt_ocr_reviews_user_groups_group_id",
                        column: x => x.group_id,
                        principalTable: "user_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_receipt_ocr_reviews_user_profiles_created_by",
                        column: x => x.created_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "receipt_ocr_review_lines",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    receipt_ocr_review_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    text = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    unit_price_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: true),
                    line_total_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_ocr_review_lines", x => x.id);
                    table.CheckConstraint("ck_receipt_ocr_review_lines_line_total_non_negative", "line_total_amount IS NULL OR line_total_amount >= 0");
                    table.CheckConstraint("ck_receipt_ocr_review_lines_line_total_upper_bound", "line_total_amount IS NULL OR line_total_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_receipt_ocr_review_lines_quantity_positive", "quantity IS NULL OR quantity > 0");
                    table.CheckConstraint("ck_receipt_ocr_review_lines_quantity_upper_bound", "quantity IS NULL OR quantity <= 999999999999999.9999");
                    table.CheckConstraint("ck_receipt_ocr_review_lines_sort_order_non_negative", "sort_order >= 0");
                    table.CheckConstraint("ck_receipt_ocr_review_lines_text_not_blank", "length(btrim(text)) > 0");
                    table.CheckConstraint("ck_receipt_ocr_review_lines_unit_price_non_negative", "unit_price_amount IS NULL OR unit_price_amount >= 0");
                    table.CheckConstraint("ck_receipt_ocr_review_lines_unit_price_upper_bound", "unit_price_amount IS NULL OR unit_price_amount <= 999999999999999.9999");
                    table.ForeignKey(
                        name: "fk_receipt_ocr_review_lines_reviews_review_id",
                        column: x => x.receipt_ocr_review_id,
                        principalTable: "receipt_ocr_reviews",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_review_lines_review_id",
                table: "receipt_ocr_review_lines",
                column: "receipt_ocr_review_id");

            migrationBuilder.CreateIndex(
                name: "ux_receipt_ocr_review_lines_review_sort_order",
                table: "receipt_ocr_review_lines",
                columns: new[] { "receipt_ocr_review_id", "sort_order" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_reviews_created_by_profile_id",
                table: "receipt_ocr_reviews",
                column: "created_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_reviews_file_object_id",
                table: "receipt_ocr_reviews",
                column: "file_object_id");

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_reviews_group_id",
                table: "receipt_ocr_reviews",
                column: "group_id");

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_reviews_removed_at_utc",
                table: "receipt_ocr_reviews",
                column: "removed_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_reviews_status",
                table: "receipt_ocr_reviews",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ux_receipt_ocr_reviews_active_bill_file",
                table: "receipt_ocr_reviews",
                columns: new[] { "expense_bill_id", "file_object_id" },
                unique: true,
                filter: "removed_at_utc IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "receipt_ocr_review_lines");

            migrationBuilder.DropTable(
                name: "receipt_ocr_reviews");
        }
    }
}
