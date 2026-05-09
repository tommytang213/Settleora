using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBillRevisionProposalFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "active_accepted_bill_revision_id",
                table: "expense_bills",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "bill_owner_user_profile_id",
                table: "expense_bills",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "payer_confirmation_status",
                table: "expense_bill_payers",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "payer_confirmed_at_utc",
                table: "expense_bill_payers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "payer_facts_created_by_user_profile_id",
                table: "expense_bill_payers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "payer_rejected_at_utc",
                table: "expense_bill_payers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "source_bill_revision_id",
                table: "settlement_request_lines",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE expense_bills
                SET bill_owner_user_profile_id = created_by_user_profile_id
                WHERE bill_owner_user_profile_id IS NULL;
                """);

            migrationBuilder.Sql(
                """
                UPDATE expense_bill_payers AS payer
                SET payer_facts_created_by_user_profile_id = bill.created_by_user_profile_id,
                    payer_confirmation_status = CASE
                        WHEN payer.user_profile_id = bill.created_by_user_profile_id THEN 'confirmed'
                        ELSE 'pending_confirmation'
                    END,
                    payer_confirmed_at_utc = CASE
                        WHEN payer.user_profile_id = bill.created_by_user_profile_id THEN payer.created_at_utc
                        ELSE NULL
                    END
                FROM expense_bills AS bill
                WHERE payer.expense_bill_id = bill.id;
                """);

            migrationBuilder.AlterColumn<Guid>(
                name: "bill_owner_user_profile_id",
                table: "expense_bills",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "payer_confirmation_status",
                table: "expense_bill_payers",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "payer_facts_created_by_user_profile_id",
                table: "expense_bill_payers",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateTable(
                name: "expense_bill_revisions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    expense_bill_id = table.Column<Guid>(type: "uuid", nullable: false),
                    proposal_creator_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    supersedes_expense_bill_revision_id = table.Column<Guid>(type: "uuid", nullable: true),
                    superseded_by_expense_bill_revision_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    total_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    total_currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    calculation_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    submitted_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    withdrawn_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    superseded_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    rejected_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    applied_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    cancelled_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expense_bill_revisions", x => x.id);
                    table.CheckConstraint("ck_expense_bill_revisions_calculation_hash_not_blank", "length(btrim(calculation_hash)) > 0");
                    table.CheckConstraint("ck_expense_bill_revisions_status", "status IN ('draft_revision', 'submitted_for_review', 'withdrawn_by_proposer', 'superseded_by_resubmission', 'rejected', 'accepted_applied', 'cancelled_by_authorized_editor')");
                    table.CheckConstraint("ck_expense_bill_revisions_total_amount_non_negative", "total_amount >= 0");
                    table.CheckConstraint("ck_expense_bill_revisions_total_amount_upper_bound", "total_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_expense_bill_revisions_total_currency_uppercase_iso", "total_currency ~ '^[A-Z]{3}$'");
                    table.ForeignKey(
                        name: "fk_expense_bill_revisions_expense_bills_bill_id",
                        column: x => x.expense_bill_id,
                        principalTable: "expense_bills",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_expense_bill_revisions_user_profiles_creator_id",
                        column: x => x.proposal_creator_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "expense_bill_revision_approvals",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    expense_bill_revision_id = table.Column<Guid>(type: "uuid", nullable: false),
                    participant_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    accepted_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    calculation_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    approved_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    rejected_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    invalidated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expense_bill_revision_approvals", x => x.id);
                    table.CheckConstraint("ck_expense_bill_revision_approvals_accepted_amount_non_negative", "accepted_amount >= 0");
                    table.CheckConstraint("ck_expense_bill_revision_approvals_accepted_amount_upper_bound", "accepted_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_expense_bill_revision_approvals_calculation_hash_not_blank", "length(btrim(calculation_hash)) > 0");
                    table.CheckConstraint("ck_expense_bill_revision_approvals_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_expense_bill_revision_approvals_status", "status IN ('pending_review', 'approved', 'rejected', 'invalidated_by_supersession')");
                    table.ForeignKey(
                        name: "fk_expense_bill_revision_approvals_revisions_revision_id",
                        column: x => x.expense_bill_revision_id,
                        principalTable: "expense_bill_revisions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_expense_bill_revision_approvals_user_profiles_participant_id",
                        column: x => x.participant_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "expense_bill_revision_participants",
                columns: table => new
                {
                    expense_bill_revision_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    resolved_share_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    resolved_share_currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    affected_by_revision = table.Column<bool>(type: "boolean", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expense_bill_revision_participants", x => new { x.expense_bill_revision_id, x.user_profile_id });
                    table.CheckConstraint("ck_expense_bill_revision_participants_share_amount_non_negative", "resolved_share_amount >= 0");
                    table.CheckConstraint("ck_expense_bill_revision_participants_share_amount_upper_bound", "resolved_share_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_expense_bill_revision_participants_share_currency_iso", "resolved_share_currency ~ '^[A-Z]{3}$'");
                    table.ForeignKey(
                        name: "fk_expense_bill_revision_participants_revisions_revision_id",
                        column: x => x.expense_bill_revision_id,
                        principalTable: "expense_bill_revisions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_expense_bill_revision_participants_user_profiles_user_profile_id",
                        column: x => x.user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "expense_bill_revision_payers",
                columns: table => new
                {
                    expense_bill_revision_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    requires_payer_confirmation = table.Column<bool>(type: "boolean", nullable: false),
                    payer_confirmation_status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expense_bill_revision_payers", x => new { x.expense_bill_revision_id, x.user_profile_id });
                    table.CheckConstraint("ck_expense_bill_revision_payers_amount_non_negative", "amount >= 0");
                    table.CheckConstraint("ck_expense_bill_revision_payers_amount_upper_bound", "amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_expense_bill_revision_payers_confirmation_status", "payer_confirmation_status IN ('pending_confirmation', 'confirmed', 'rejected')");
                    table.CheckConstraint("ck_expense_bill_revision_payers_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
                    table.ForeignKey(
                        name: "fk_expense_bill_revision_payers_revisions_revision_id",
                        column: x => x.expense_bill_revision_id,
                        principalTable: "expense_bill_revisions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_expense_bill_revision_payers_user_profiles_user_profile_id",
                        column: x => x.user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_expense_bills_active_accepted_revision_id",
                table: "expense_bills",
                column: "active_accepted_bill_revision_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bills_bill_owner_user_profile_id",
                table: "expense_bills",
                column: "bill_owner_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_payers_confirmation_status",
                table: "expense_bill_payers",
                column: "payer_confirmation_status");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_payers_facts_created_by_user_profile_id",
                table: "expense_bill_payers",
                column: "payer_facts_created_by_user_profile_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bill_payers_confirmation_status",
                table: "expense_bill_payers",
                sql: "payer_confirmation_status IN ('pending_confirmation', 'confirmed', 'rejected')");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_revision_approvals_participant_user_profile_id",
                table: "expense_bill_revision_approvals",
                column: "participant_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_revision_approvals_revision_id",
                table: "expense_bill_revision_approvals",
                column: "expense_bill_revision_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_revision_approvals_status",
                table: "expense_bill_revision_approvals",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ux_expense_bill_revision_approvals_revision_participant",
                table: "expense_bill_revision_approvals",
                columns: new[] { "expense_bill_revision_id", "participant_user_profile_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_revision_participants_affected",
                table: "expense_bill_revision_participants",
                column: "affected_by_revision");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_revision_participants_user_profile_id",
                table: "expense_bill_revision_participants",
                column: "user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_revision_payers_requires_confirmation",
                table: "expense_bill_revision_payers",
                column: "requires_payer_confirmation");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_revision_payers_user_profile_id",
                table: "expense_bill_revision_payers",
                column: "user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_revisions_creator_user_profile_id",
                table: "expense_bill_revisions",
                column: "proposal_creator_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_revisions_status",
                table: "expense_bill_revisions",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ux_expense_bill_revisions_one_active_pending_per_bill",
                table: "expense_bill_revisions",
                column: "expense_bill_id",
                unique: true,
                filter: "status IN ('draft_revision', 'submitted_for_review')");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_request_lines_source_bill_revision_id",
                table: "settlement_request_lines",
                column: "source_bill_revision_id");

            migrationBuilder.AddForeignKey(
                name: "fk_expense_bill_payers_user_profiles_facts_created_by_user_profile_id",
                table: "expense_bill_payers",
                column: "payer_facts_created_by_user_profile_id",
                principalTable: "user_profiles",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_expense_bills_user_profiles_bill_owner_user_profile_id",
                table: "expense_bills",
                column: "bill_owner_user_profile_id",
                principalTable: "user_profiles",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_settlement_request_lines_expense_bill_revisions_source_revision_id",
                table: "settlement_request_lines",
                column: "source_bill_revision_id",
                principalTable: "expense_bill_revisions",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_expense_bill_payers_user_profiles_facts_created_by_user_profile_id",
                table: "expense_bill_payers");

            migrationBuilder.DropForeignKey(
                name: "fk_expense_bills_user_profiles_bill_owner_user_profile_id",
                table: "expense_bills");

            migrationBuilder.DropForeignKey(
                name: "fk_settlement_request_lines_expense_bill_revisions_source_revision_id",
                table: "settlement_request_lines");

            migrationBuilder.DropTable(
                name: "expense_bill_revision_approvals");

            migrationBuilder.DropTable(
                name: "expense_bill_revision_participants");

            migrationBuilder.DropTable(
                name: "expense_bill_revision_payers");

            migrationBuilder.DropTable(
                name: "expense_bill_revisions");

            migrationBuilder.DropIndex(
                name: "ix_expense_bills_active_accepted_revision_id",
                table: "expense_bills");

            migrationBuilder.DropIndex(
                name: "ix_expense_bills_bill_owner_user_profile_id",
                table: "expense_bills");

            migrationBuilder.DropIndex(
                name: "ix_expense_bill_payers_confirmation_status",
                table: "expense_bill_payers");

            migrationBuilder.DropIndex(
                name: "ix_expense_bill_payers_facts_created_by_user_profile_id",
                table: "expense_bill_payers");

            migrationBuilder.DropIndex(
                name: "ix_settlement_request_lines_source_bill_revision_id",
                table: "settlement_request_lines");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bill_payers_confirmation_status",
                table: "expense_bill_payers");

            migrationBuilder.DropColumn(
                name: "active_accepted_bill_revision_id",
                table: "expense_bills");

            migrationBuilder.DropColumn(
                name: "bill_owner_user_profile_id",
                table: "expense_bills");

            migrationBuilder.DropColumn(
                name: "payer_confirmation_status",
                table: "expense_bill_payers");

            migrationBuilder.DropColumn(
                name: "payer_confirmed_at_utc",
                table: "expense_bill_payers");

            migrationBuilder.DropColumn(
                name: "payer_facts_created_by_user_profile_id",
                table: "expense_bill_payers");

            migrationBuilder.DropColumn(
                name: "payer_rejected_at_utc",
                table: "expense_bill_payers");

            migrationBuilder.DropColumn(
                name: "source_bill_revision_id",
                table: "settlement_request_lines");
        }
    }
}
