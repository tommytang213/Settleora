using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddExpenseBillSchemaFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "expense_bills",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: true),
                    merchant_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    bill_date = table.Column<DateOnly>(type: "date", nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    total_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    total_currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    archived_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expense_bills", x => x.id);
                    table.CheckConstraint("ck_expense_bills_merchant_name_not_blank", "merchant_name IS NULL OR length(btrim(merchant_name)) > 0");
                    table.CheckConstraint("ck_expense_bills_status", "status IN ('draft', 'pending_confirmation', 'confirmed', 'rejected', 'cancelled', 'finalized', 'archived')");
                    table.CheckConstraint("ck_expense_bills_total_amount_non_negative", "total_amount >= 0");
                    table.CheckConstraint("ck_expense_bills_total_amount_upper_bound", "total_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_expense_bills_total_currency_uppercase_iso", "total_currency ~ '^[A-Z]{3}$'");
                    table.ForeignKey(
                        name: "fk_expense_bills_user_groups_group_id",
                        column: x => x.group_id,
                        principalTable: "user_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_expense_bills_user_profiles_created_by_user_profile_id",
                        column: x => x.created_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "expense_bill_adjustments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    expense_bill_id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    direction = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    allocation_method = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    reason_note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expense_bill_adjustments", x => x.id);
                    table.CheckConstraint("ck_expense_bill_adjustments_allocation_method", "allocation_method IN ('equal', 'proportional_by_item_subtotal', 'manual')");
                    table.CheckConstraint("ck_expense_bill_adjustments_amount_non_negative", "amount >= 0");
                    table.CheckConstraint("ck_expense_bill_adjustments_amount_upper_bound", "amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_expense_bill_adjustments_currency_iso", "currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_expense_bill_adjustments_direction", "direction IN ('charge', 'credit')");
                    table.CheckConstraint("ck_expense_bill_adjustments_reason_note_not_blank", "reason_note IS NULL OR length(btrim(reason_note)) > 0");
                    table.CheckConstraint("ck_expense_bill_adjustments_type", "type IN ('tax', 'service_charge', 'discount', 'manual_adjustment', 'credit')");
                    table.ForeignKey(
                        name: "fk_expense_bill_adjustments_expense_bills_bill_id",
                        column: x => x.expense_bill_id,
                        principalTable: "expense_bills",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "expense_bill_attachments",
                columns: table => new
                {
                    expense_bill_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_object_id = table.Column<Guid>(type: "uuid", nullable: false),
                    purpose = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    removed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expense_bill_attachments", x => new { x.expense_bill_id, x.file_object_id });
                    table.CheckConstraint("ck_expense_bill_attachments_purpose", "purpose IN ('receipt', 'supporting_attachment')");
                    table.ForeignKey(
                        name: "fk_expense_bill_attachments_expense_bills_bill_id",
                        column: x => x.expense_bill_id,
                        principalTable: "expense_bills",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_expense_bill_attachments_file_objects_file_object_id",
                        column: x => x.file_object_id,
                        principalTable: "file_objects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_expense_bill_attachments_user_profiles_created_by",
                        column: x => x.created_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "expense_bill_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    expense_bill_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    deleted_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expense_bill_items", x => x.id);
                    table.CheckConstraint("ck_expense_bill_items_amount_non_negative", "amount >= 0");
                    table.CheckConstraint("ck_expense_bill_items_amount_upper_bound", "amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_expense_bill_items_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_expense_bill_items_name_not_blank", "length(btrim(name)) > 0");
                    table.CheckConstraint("ck_expense_bill_items_note_not_blank", "note IS NULL OR length(btrim(note)) > 0");
                    table.CheckConstraint("ck_expense_bill_items_quantity_positive", "quantity IS NULL OR quantity > 0");
                    table.ForeignKey(
                        name: "fk_expense_bill_items_expense_bills_expense_bill_id",
                        column: x => x.expense_bill_id,
                        principalTable: "expense_bills",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "expense_bill_participants",
                columns: table => new
                {
                    expense_bill_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    resolved_share_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    resolved_share_currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    accepted_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    rejected_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    settled_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expense_bill_participants", x => new { x.expense_bill_id, x.user_profile_id });
                    table.CheckConstraint("ck_expense_bill_participants_share_amount_non_negative", "resolved_share_amount >= 0");
                    table.CheckConstraint("ck_expense_bill_participants_share_amount_upper_bound", "resolved_share_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_expense_bill_participants_share_currency_iso", "resolved_share_currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_expense_bill_participants_status", "status IN ('pending_acceptance', 'accepted', 'rejected', 'partially_settled', 'settled', 'waived', 'claimed_paid', 'confirmed_paid')");
                    table.ForeignKey(
                        name: "fk_expense_bill_participants_expense_bills_bill_id",
                        column: x => x.expense_bill_id,
                        principalTable: "expense_bills",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_expense_bill_participants_user_profiles_user_profile_id",
                        column: x => x.user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "expense_bill_payers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    expense_bill_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    payment_method_label_snapshot = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expense_bill_payers", x => x.id);
                    table.CheckConstraint("ck_expense_bill_payers_amount_non_negative", "amount >= 0");
                    table.CheckConstraint("ck_expense_bill_payers_amount_upper_bound", "amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_expense_bill_payers_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_expense_bill_payers_method_label_not_blank", "payment_method_label_snapshot IS NULL OR length(btrim(payment_method_label_snapshot)) > 0");
                    table.ForeignKey(
                        name: "fk_expense_bill_payers_expense_bills_expense_bill_id",
                        column: x => x.expense_bill_id,
                        principalTable: "expense_bills",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_expense_bill_payers_user_profiles_user_profile_id",
                        column: x => x.user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_adjustments_bill_sort_order",
                table: "expense_bill_adjustments",
                columns: new[] { "expense_bill_id", "sort_order" });

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_adjustments_expense_bill_id",
                table: "expense_bill_adjustments",
                column: "expense_bill_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_attachments_created_by_profile_id",
                table: "expense_bill_attachments",
                column: "created_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_attachments_file_object_id",
                table: "expense_bill_attachments",
                column: "file_object_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_items_bill_sort_order",
                table: "expense_bill_items",
                columns: new[] { "expense_bill_id", "sort_order" });

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_items_deleted_at_utc",
                table: "expense_bill_items",
                column: "deleted_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_items_expense_bill_id",
                table: "expense_bill_items",
                column: "expense_bill_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_participants_user_profile_id",
                table: "expense_bill_participants",
                column: "user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_payers_bill_user_profile_id",
                table: "expense_bill_payers",
                columns: new[] { "expense_bill_id", "user_profile_id" });

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_payers_expense_bill_id",
                table: "expense_bill_payers",
                column: "expense_bill_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_payers_user_profile_id",
                table: "expense_bill_payers",
                column: "user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bills_archived_at_utc",
                table: "expense_bills",
                column: "archived_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bills_bill_date",
                table: "expense_bills",
                column: "bill_date");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bills_created_by_user_profile_id",
                table: "expense_bills",
                column: "created_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bills_group_id",
                table: "expense_bills",
                column: "group_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bills_status",
                table: "expense_bills",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "expense_bill_adjustments");

            migrationBuilder.DropTable(
                name: "expense_bill_attachments");

            migrationBuilder.DropTable(
                name: "expense_bill_items");

            migrationBuilder.DropTable(
                name: "expense_bill_participants");

            migrationBuilder.DropTable(
                name: "expense_bill_payers");

            migrationBuilder.DropTable(
                name: "expense_bills");
        }
    }
}
