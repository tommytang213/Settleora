using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSettlementBasketResidualSchemaFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "settlement_request_lines",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    settlement_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_expense_bill_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_candidate_key = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: true),
                    exact_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    allocation_order = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_settlement_request_lines", x => x.id);
                    table.CheckConstraint("ck_settlement_request_lines_allocation_order_non_negative", "allocation_order >= 0");
                    table.CheckConstraint("ck_settlement_request_lines_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_settlement_request_lines_exact_amount_positive", "exact_amount > 0");
                    table.CheckConstraint("ck_settlement_request_lines_exact_amount_upper_bound", "exact_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_settlement_request_lines_source_candidate_key_not_blank", "source_candidate_key IS NULL OR length(btrim(source_candidate_key)) > 0");
                    table.CheckConstraint("ck_settlement_request_lines_status", "status IN ('open', 'partially_cleared', 'cleared', 'waived', 'disputed', 'cancelled')");
                    table.ForeignKey(
                        name: "fk_settlement_request_lines_expense_bills_source_bill_id",
                        column: x => x.source_expense_bill_id,
                        principalTable: "expense_bills",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_request_lines_settlement_requests_request_id",
                        column: x => x.settlement_request_id,
                        principalTable: "settlement_requests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "settlement_residuals",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    settlement_payment_id = table.Column<Guid>(type: "uuid", nullable: true),
                    settlement_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    debtor_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    creditor_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    direction = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    policy = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    resolved_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_settlement_residuals", x => x.id);
                    table.CheckConstraint("ck_settlement_residuals_amount_positive", "amount > 0");
                    table.CheckConstraint("ck_settlement_residuals_amount_upper_bound", "amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_settlement_residuals_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_settlement_residuals_debtor_creditor_distinct", "debtor_user_profile_id <> creditor_user_profile_id");
                    table.CheckConstraint("ck_settlement_residuals_direction", "direction IN ('underpayment', 'overpayment')");
                    table.CheckConstraint("ck_settlement_residuals_payment_or_request_present", "settlement_payment_id IS NOT NULL OR settlement_request_id IS NOT NULL");
                    table.CheckConstraint("ck_settlement_residuals_policy", "policy IN ('remaining_balance', 'carried_forward', 'waived', 'credit_forward', 'waived_by_payer', 'applied_to_other_line')");
                    table.CheckConstraint("ck_settlement_residuals_reason_not_blank", "reason IS NULL OR length(btrim(reason)) > 0");
                    table.CheckConstraint("ck_settlement_residuals_status", "status IN ('pending_receiver_confirmation', 'confirmed', 'carried_forward', 'waived', 'credited', 'disputed', 'cancelled')");
                    table.ForeignKey(
                        name: "fk_settlement_residuals_payments_payment_id",
                        column: x => x.settlement_payment_id,
                        principalTable: "settlement_payments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_residuals_requests_request_id",
                        column: x => x.settlement_request_id,
                        principalTable: "settlement_requests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_residuals_user_profiles_creditor_id",
                        column: x => x.creditor_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_residuals_user_profiles_debtor_id",
                        column: x => x.debtor_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "settlement_payment_allocations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    settlement_payment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    settlement_request_line_id = table.Column<Guid>(type: "uuid", nullable: false),
                    cleared_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    allocation_order = table.Column<int>(type: "integer", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_settlement_payment_allocations", x => x.id);
                    table.CheckConstraint("ck_settlement_payment_allocations_allocation_order_non_negative", "allocation_order >= 0");
                    table.CheckConstraint("ck_settlement_payment_allocations_cleared_amount_positive", "cleared_amount > 0");
                    table.CheckConstraint("ck_settlement_payment_allocations_cleared_amount_upper_bound", "cleared_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_settlement_payment_allocations_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
                    table.ForeignKey(
                        name: "fk_settlement_payment_allocations_payments_payment_id",
                        column: x => x.settlement_payment_id,
                        principalTable: "settlement_payments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_payment_allocations_request_lines_line_id",
                        column: x => x.settlement_request_line_id,
                        principalTable: "settlement_request_lines",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_settlement_payment_allocations_payment_order",
                table: "settlement_payment_allocations",
                columns: new[] { "settlement_payment_id", "allocation_order" });

            migrationBuilder.CreateIndex(
                name: "ix_settlement_payment_allocations_request_line_id",
                table: "settlement_payment_allocations",
                column: "settlement_request_line_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_payment_allocations_settlement_payment_id",
                table: "settlement_payment_allocations",
                column: "settlement_payment_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_request_lines_request_order",
                table: "settlement_request_lines",
                columns: new[] { "settlement_request_id", "allocation_order" });

            migrationBuilder.CreateIndex(
                name: "ix_settlement_request_lines_request_status",
                table: "settlement_request_lines",
                columns: new[] { "settlement_request_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_settlement_request_lines_settlement_request_id",
                table: "settlement_request_lines",
                column: "settlement_request_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_request_lines_source_expense_bill_id",
                table: "settlement_request_lines",
                column: "source_expense_bill_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_request_lines_status",
                table: "settlement_request_lines",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_residuals_counterparty_currency_status",
                table: "settlement_residuals",
                columns: new[] { "debtor_user_profile_id", "creditor_user_profile_id", "currency", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_settlement_residuals_created_at_utc",
                table: "settlement_residuals",
                column: "created_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_residuals_creditor_user_profile_id",
                table: "settlement_residuals",
                column: "creditor_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_residuals_debtor_user_profile_id",
                table: "settlement_residuals",
                column: "debtor_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_residuals_resolved_at_utc",
                table: "settlement_residuals",
                column: "resolved_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_residuals_settlement_payment_id",
                table: "settlement_residuals",
                column: "settlement_payment_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_residuals_settlement_request_id",
                table: "settlement_residuals",
                column: "settlement_request_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_residuals_status",
                table: "settlement_residuals",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "settlement_payment_allocations");

            migrationBuilder.DropTable(
                name: "settlement_residuals");

            migrationBuilder.DropTable(
                name: "settlement_request_lines");
        }
    }
}
