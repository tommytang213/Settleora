using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddExpenseBillParticipantRejectionReasonCode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "rejection_reason_code",
                table: "expense_bill_participants",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bill_participants_rejection_reason_code",
                table: "expense_bill_participants",
                sql: "rejection_reason_code IS NULL OR rejection_reason_code IN ('wrong_amount', 'wrong_items', 'wrong_split', 'duplicate', 'not_mine', 'other')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bill_participants_rejection_reason_code",
                table: "expense_bill_participants");

            migrationBuilder.DropColumn(
                name: "rejection_reason_code",
                table: "expense_bill_participants");
        }
    }
}
