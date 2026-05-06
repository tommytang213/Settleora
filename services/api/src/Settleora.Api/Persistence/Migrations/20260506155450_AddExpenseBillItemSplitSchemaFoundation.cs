using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddExpenseBillItemSplitSchemaFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "expense_bill_item_splits",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    expense_bill_item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    split_method = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    basis_value = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: true),
                    resolved_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    resolved_currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    allocation_order = table.Column<int>(type: "integer", nullable: false),
                    received_residual_minor_unit = table.Column<bool>(type: "boolean", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expense_bill_item_splits", x => x.id);
                    table.CheckConstraint("ck_expense_bill_item_splits_allocation_order_non_negative", "allocation_order >= 0");
                    table.CheckConstraint("ck_expense_bill_item_splits_basis_value_non_negative", "basis_value IS NULL OR basis_value >= 0");
                    table.CheckConstraint("ck_expense_bill_item_splits_basis_value_upper_bound", "basis_value IS NULL OR basis_value <= 999999999999999.9999");
                    table.CheckConstraint("ck_expense_bill_item_splits_resolved_amount_non_negative", "resolved_amount >= 0");
                    table.CheckConstraint("ck_expense_bill_item_splits_resolved_amount_upper_bound", "resolved_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_expense_bill_item_splits_resolved_currency_iso", "resolved_currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_expense_bill_item_splits_split_method", "split_method IN ('equal', 'exact_amount', 'percentage', 'ratio', 'share_weight')");
                    table.ForeignKey(
                        name: "fk_expense_bill_item_splits_expense_bill_items_item_id",
                        column: x => x.expense_bill_item_id,
                        principalTable: "expense_bill_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_expense_bill_item_splits_user_profiles_user_profile_id",
                        column: x => x.user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_item_splits_expense_bill_item_id",
                table: "expense_bill_item_splits",
                column: "expense_bill_item_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_item_splits_item_allocation_order",
                table: "expense_bill_item_splits",
                columns: new[] { "expense_bill_item_id", "allocation_order" });

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_item_splits_user_profile_id",
                table: "expense_bill_item_splits",
                column: "user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ux_expense_bill_item_splits_item_user_profile_id",
                table: "expense_bill_item_splits",
                columns: new[] { "expense_bill_item_id", "user_profile_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "expense_bill_item_splits");
        }
    }
}
