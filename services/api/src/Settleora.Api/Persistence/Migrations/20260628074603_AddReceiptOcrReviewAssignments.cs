using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptOcrReviewAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "receipt_ocr_review_assignments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    receipt_ocr_review_id = table.Column<Guid>(type: "uuid", nullable: false),
                    expense_bill_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_object_id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: true),
                    assignment_status = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    assigned_to_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    assigned_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: true),
                    assignment_source = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    source_actor_user_profile_id = table.Column<Guid>(type: "uuid", nullable: true),
                    source_correlation_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    completed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    cancelled_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    superseded_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_ocr_review_assignments", x => x.id);
                    table.CheckConstraint("ck_receipt_ocr_review_assignments_cancel_status_pair", "(assignment_status = 'cancelled') = (cancelled_at_utc IS NOT NULL)");
                    table.CheckConstraint("ck_receipt_ocr_review_assignments_completion_status_pair", "(assignment_status = 'reviewed') = (completed_at_utc IS NOT NULL)");
                    table.CheckConstraint("ck_receipt_ocr_review_assignments_manual_source_actor", "(assignment_source <> 'manual_assignment' OR (assigned_by_user_profile_id IS NOT NULL AND source_actor_user_profile_id IS NOT NULL))");
                    table.CheckConstraint("ck_receipt_ocr_review_assignments_source", "assignment_source IN ('server_ocr_worker', 'server_mode_upload_handoff', 'manual_assignment', 'system_reassignment')");
                    table.CheckConstraint("ck_receipt_ocr_review_assignments_source_correlation_not_blank", "source_correlation_id IS NULL OR length(btrim(source_correlation_id)) > 0");
                    table.CheckConstraint("ck_receipt_ocr_review_assignments_status", "assignment_status IN ('needs_review', 'reviewed', 'cancelled', 'superseded')");
                    table.CheckConstraint("ck_receipt_ocr_review_assignments_supersede_status_pair", "(assignment_status = 'superseded') = (superseded_at_utc IS NOT NULL)");
                    table.CheckConstraint("ck_receipt_ocr_review_assignments_terminal_timestamps_exclusive", "((completed_at_utc IS NOT NULL)::int + (cancelled_at_utc IS NOT NULL)::int + (superseded_at_utc IS NOT NULL)::int) <= 1");
                    table.ForeignKey(
                        name: "fk_receipt_ocr_review_assignments_expense_bill_attachments_bill_file",
                        columns: x => new { x.expense_bill_id, x.file_object_id },
                        principalTable: "expense_bill_attachments",
                        principalColumns: new[] { "expense_bill_id", "file_object_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_receipt_ocr_review_assignments_expense_bills_bill_id",
                        column: x => x.expense_bill_id,
                        principalTable: "expense_bills",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_receipt_ocr_review_assignments_reviews_review_id",
                        column: x => x.receipt_ocr_review_id,
                        principalTable: "receipt_ocr_reviews",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_receipt_ocr_review_assignments_user_groups_group_id",
                        column: x => x.group_id,
                        principalTable: "user_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_receipt_ocr_review_assignments_user_profiles_assigned_by",
                        column: x => x.assigned_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_receipt_ocr_review_assignments_user_profiles_assigned_to",
                        column: x => x.assigned_to_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_receipt_ocr_review_assignments_user_profiles_source_actor",
                        column: x => x.source_actor_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_review_assignments_assigned_by",
                table: "receipt_ocr_review_assignments",
                column: "assigned_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_review_assignments_assigned_to",
                table: "receipt_ocr_review_assignments",
                column: "assigned_to_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_review_assignments_bill_file",
                table: "receipt_ocr_review_assignments",
                columns: new[] { "expense_bill_id", "file_object_id" });

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_review_assignments_bill_id",
                table: "receipt_ocr_review_assignments",
                column: "expense_bill_id");

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_review_assignments_file_object_id",
                table: "receipt_ocr_review_assignments",
                column: "file_object_id");

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_review_assignments_group_id",
                table: "receipt_ocr_review_assignments",
                column: "group_id");

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_review_assignments_source_actor",
                table: "receipt_ocr_review_assignments",
                column: "source_actor_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_receipt_ocr_review_assignments_status",
                table: "receipt_ocr_review_assignments",
                column: "assignment_status");

            migrationBuilder.CreateIndex(
                name: "ux_receipt_ocr_review_assignments_active_review",
                table: "receipt_ocr_review_assignments",
                column: "receipt_ocr_review_id",
                unique: true,
                filter: "assignment_status = 'needs_review'");

            migrationBuilder.CreateIndex(
                name: "ux_receipt_ocr_review_assignments_active_review_assignee",
                table: "receipt_ocr_review_assignments",
                columns: new[] { "receipt_ocr_review_id", "assigned_to_user_profile_id" },
                unique: true,
                filter: "assignment_status = 'needs_review'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "receipt_ocr_review_assignments");
        }
    }
}
