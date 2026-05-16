using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBillReconciliationReportingFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "reconciled_at_utc",
                table: "expense_bills",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "reconciliation_note",
                table: "expense_bills",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "reconciliation_status",
                table: "expense_bills",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "unreconciled");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "reconciliation_updated_at_utc",
                table: "expense_bills",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "reconciliation_updated_by_user_profile_id",
                table: "expense_bills",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_expense_bills_reconciliation_status",
                table: "expense_bills",
                column: "reconciliation_status");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bills_reconciliation_updated_by_user_profile_id",
                table: "expense_bills",
                column: "reconciliation_updated_by_user_profile_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bills_reconciled_at_matches_status",
                table: "expense_bills",
                sql: "((reconciliation_status = 'reconciled' AND reconciled_at_utc IS NOT NULL) OR (reconciliation_status <> 'reconciled' AND reconciled_at_utc IS NULL))");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bills_reconciliation_note_not_blank",
                table: "expense_bills",
                sql: "reconciliation_note IS NULL OR length(btrim(reconciliation_note)) > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bills_reconciliation_status",
                table: "expense_bills",
                sql: "reconciliation_status IN ('unreconciled', 'reconciled', 'ignored')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bills_reconciliation_update_actor_pair",
                table: "expense_bills",
                sql: "((reconciliation_updated_at_utc IS NULL AND reconciliation_updated_by_user_profile_id IS NULL) OR (reconciliation_updated_at_utc IS NOT NULL AND reconciliation_updated_by_user_profile_id IS NOT NULL))");

            migrationBuilder.AddForeignKey(
                name: "fk_expense_bills_reconciliation_updated_by_user_profiles",
                table: "expense_bills",
                column: "reconciliation_updated_by_user_profile_id",
                principalTable: "user_profiles",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_expense_bills_reconciliation_updated_by_user_profiles",
                table: "expense_bills");

            migrationBuilder.DropIndex(
                name: "ix_expense_bills_reconciliation_status",
                table: "expense_bills");

            migrationBuilder.DropIndex(
                name: "ix_expense_bills_reconciliation_updated_by_user_profile_id",
                table: "expense_bills");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bills_reconciled_at_matches_status",
                table: "expense_bills");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bills_reconciliation_note_not_blank",
                table: "expense_bills");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bills_reconciliation_status",
                table: "expense_bills");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bills_reconciliation_update_actor_pair",
                table: "expense_bills");

            migrationBuilder.DropColumn(
                name: "reconciled_at_utc",
                table: "expense_bills");

            migrationBuilder.DropColumn(
                name: "reconciliation_note",
                table: "expense_bills");

            migrationBuilder.DropColumn(
                name: "reconciliation_status",
                table: "expense_bills");

            migrationBuilder.DropColumn(
                name: "reconciliation_updated_at_utc",
                table: "expense_bills");

            migrationBuilder.DropColumn(
                name: "reconciliation_updated_by_user_profile_id",
                table: "expense_bills");
        }
    }
}
