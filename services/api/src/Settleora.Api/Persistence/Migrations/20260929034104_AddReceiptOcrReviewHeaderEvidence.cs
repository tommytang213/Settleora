using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptOcrReviewHeaderEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "receipt_ocr_review_header_evidence",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    receipt_ocr_review_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_ocr_review_header_evidence", x => x.id);
                    table.CheckConstraint("ck_receipt_ocr_review_header_evidence_amount", "amount >= 0 AND amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_receipt_ocr_review_header_evidence_currency", "currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_receipt_ocr_review_header_evidence_role", "role IN ('subtotal', 'tax', 'service_charge', 'discount')");
                    table.ForeignKey(
                        name: "fk_receipt_ocr_review_header_evidence_review_id",
                        column: x => x.receipt_ocr_review_id,
                        principalTable: "receipt_ocr_reviews",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ux_receipt_ocr_review_header_evidence_review_role",
                table: "receipt_ocr_review_header_evidence",
                columns: new[] { "receipt_ocr_review_id", "role" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "receipt_ocr_review_header_evidence");
        }
    }
}
