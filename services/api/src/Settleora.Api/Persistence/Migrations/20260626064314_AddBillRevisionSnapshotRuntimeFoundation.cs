using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBillRevisionSnapshotRuntimeFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "affected_user_ids_json",
                table: "expense_bill_revisions",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "affected_user_set_hash",
                table: "expense_bill_revisions",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "baseline_snapshot_json",
                table: "expense_bill_revisions",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "correlation_id",
                table: "expense_bill_revisions",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "money_policy_version",
                table: "expense_bill_revisions",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "payer_confirmation_basis_hash",
                table: "expense_bill_revisions",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "payer_confirmation_user_ids_json",
                table: "expense_bill_revisions",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "proposed_snapshot_json",
                table: "expense_bill_revisions",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "request_id",
                table: "expense_bill_revisions",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "revision_sequence",
                table: "expense_bill_revisions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "rounding_policy_version",
                table: "expense_bill_revisions",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "snapshot_schema_version",
                table: "expense_bill_revisions",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "unsupported_detail_reason",
                table: "expense_bill_revisions",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.Sql(
                """
                WITH ranked AS (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY expense_bill_id
                            ORDER BY created_at_utc, id
                        ) AS revision_sequence
                    FROM expense_bill_revisions
                ),
                affected AS (
                    SELECT
                        expense_bill_revision_id,
                        COALESCE(
                            jsonb_agg(user_profile_id ORDER BY user_profile_id)
                                FILTER (WHERE affected_by_revision),
                            '[]'::jsonb
                        ) AS affected_user_ids_json
                    FROM expense_bill_revision_participants
                    GROUP BY expense_bill_revision_id
                ),
                payer_confirmation AS (
                    SELECT
                        expense_bill_revision_id,
                        COALESCE(
                            jsonb_agg(user_profile_id ORDER BY user_profile_id)
                                FILTER (WHERE requires_payer_confirmation),
                            '[]'::jsonb
                        ) AS payer_confirmation_user_ids_json
                    FROM expense_bill_revision_payers
                    GROUP BY expense_bill_revision_id
                )
                UPDATE expense_bill_revisions revision
                SET
                    revision_sequence = ranked.revision_sequence,
                    snapshot_schema_version = 'bill-revision-snapshot.v1',
                    money_policy_version = 'money-policy.v1',
                    rounding_policy_version = 'rounding-policy.v1',
                    baseline_snapshot_json = jsonb_build_object(
                        'snapshotSchemaVersion', 'bill-revision-snapshot.v1',
                        'moneyPolicyVersion', 'money-policy.v1',
                        'roundingPolicyVersion', 'rounding-policy.v1',
                        'snapshotRole', 'legacyBaseline',
                        'expenseBillRevisionId', revision.id,
                        'totalAmount', to_char(revision.total_amount, 'FM9999999999999999990.0000'),
                        'totalCurrency', revision.total_currency,
                        'participants', '[]'::jsonb,
                        'payers', '[]'::jsonb,
                        'attachmentFileIds', '[]'::jsonb,
                        'receiptOcrReviewIds', '[]'::jsonb
                    ),
                    proposed_snapshot_json = jsonb_build_object(
                        'snapshotSchemaVersion', 'bill-revision-snapshot.v1',
                        'moneyPolicyVersion', 'money-policy.v1',
                        'roundingPolicyVersion', 'rounding-policy.v1',
                        'snapshotRole', 'legacyProposed',
                        'expenseBillRevisionId', revision.id,
                        'totalAmount', to_char(revision.total_amount, 'FM9999999999999999990.0000'),
                        'totalCurrency', revision.total_currency,
                        'participants', '[]'::jsonb,
                        'payers', '[]'::jsonb,
                        'attachmentFileIds', '[]'::jsonb,
                        'receiptOcrReviewIds', '[]'::jsonb
                    ),
                    affected_user_ids_json = COALESCE(affected.affected_user_ids_json, '[]'::jsonb),
                    payer_confirmation_user_ids_json = COALESCE(
                        payer_confirmation.payer_confirmation_user_ids_json,
                        '[]'::jsonb
                    ),
                    affected_user_set_hash = revision.calculation_hash,
                    payer_confirmation_basis_hash = revision.calculation_hash,
                    unsupported_detail_reason = COALESCE(
                        revision.unsupported_detail_reason,
                        'legacy_snapshot_detail_unavailable'
                    )
                FROM ranked
                LEFT JOIN affected
                    ON affected.expense_bill_revision_id = ranked.id
                LEFT JOIN payer_confirmation
                    ON payer_confirmation.expense_bill_revision_id = ranked.id
                WHERE ranked.id = revision.id;
                """);

            migrationBuilder.AlterColumn<int>(
                name: "revision_sequence",
                table: "expense_bill_revisions",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "snapshot_schema_version",
                table: "expense_bill_revisions",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "money_policy_version",
                table: "expense_bill_revisions",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "rounding_policy_version",
                table: "expense_bill_revisions",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "baseline_snapshot_json",
                table: "expense_bill_revisions",
                type: "jsonb",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "jsonb",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "proposed_snapshot_json",
                table: "expense_bill_revisions",
                type: "jsonb",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "jsonb",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "affected_user_ids_json",
                table: "expense_bill_revisions",
                type: "jsonb",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "jsonb",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "affected_user_set_hash",
                table: "expense_bill_revisions",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "payer_confirmation_user_ids_json",
                table: "expense_bill_revisions",
                type: "jsonb",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "jsonb",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "payer_confirmation_basis_hash",
                table: "expense_bill_revisions",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(128)",
                oldMaxLength: 128,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_expense_bill_revisions_calculation_hash",
                table: "expense_bill_revisions",
                column: "calculation_hash");

            migrationBuilder.CreateIndex(
                name: "ux_expense_bill_revisions_bill_sequence",
                table: "expense_bill_revisions",
                columns: new[] { "expense_bill_id", "revision_sequence" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bill_revisions_affected_user_ids_json_array",
                table: "expense_bill_revisions",
                sql: "jsonb_typeof(affected_user_ids_json) = 'array'");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bill_revisions_baseline_snapshot_json_object",
                table: "expense_bill_revisions",
                sql: "jsonb_typeof(baseline_snapshot_json) = 'object'");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bill_revisions_money_policy_version_not_blank",
                table: "expense_bill_revisions",
                sql: "length(btrim(money_policy_version)) > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bill_revisions_payer_ids_json_array",
                table: "expense_bill_revisions",
                sql: "jsonb_typeof(payer_confirmation_user_ids_json) = 'array'");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bill_revisions_proposed_snapshot_json_object",
                table: "expense_bill_revisions",
                sql: "jsonb_typeof(proposed_snapshot_json) = 'object'");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bill_revisions_revision_sequence_positive",
                table: "expense_bill_revisions",
                sql: "revision_sequence > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bill_revisions_rounding_policy_version_not_blank",
                table: "expense_bill_revisions",
                sql: "length(btrim(rounding_policy_version)) > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_expense_bill_revisions_snapshot_schema_version_not_blank",
                table: "expense_bill_revisions",
                sql: "length(btrim(snapshot_schema_version)) > 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_expense_bill_revisions_calculation_hash",
                table: "expense_bill_revisions");

            migrationBuilder.DropIndex(
                name: "ux_expense_bill_revisions_bill_sequence",
                table: "expense_bill_revisions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bill_revisions_affected_user_ids_json_array",
                table: "expense_bill_revisions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bill_revisions_baseline_snapshot_json_object",
                table: "expense_bill_revisions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bill_revisions_money_policy_version_not_blank",
                table: "expense_bill_revisions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bill_revisions_payer_ids_json_array",
                table: "expense_bill_revisions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bill_revisions_proposed_snapshot_json_object",
                table: "expense_bill_revisions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bill_revisions_revision_sequence_positive",
                table: "expense_bill_revisions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bill_revisions_rounding_policy_version_not_blank",
                table: "expense_bill_revisions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_expense_bill_revisions_snapshot_schema_version_not_blank",
                table: "expense_bill_revisions");

            migrationBuilder.DropColumn(
                name: "affected_user_ids_json",
                table: "expense_bill_revisions");

            migrationBuilder.DropColumn(
                name: "affected_user_set_hash",
                table: "expense_bill_revisions");

            migrationBuilder.DropColumn(
                name: "baseline_snapshot_json",
                table: "expense_bill_revisions");

            migrationBuilder.DropColumn(
                name: "correlation_id",
                table: "expense_bill_revisions");

            migrationBuilder.DropColumn(
                name: "money_policy_version",
                table: "expense_bill_revisions");

            migrationBuilder.DropColumn(
                name: "payer_confirmation_basis_hash",
                table: "expense_bill_revisions");

            migrationBuilder.DropColumn(
                name: "payer_confirmation_user_ids_json",
                table: "expense_bill_revisions");

            migrationBuilder.DropColumn(
                name: "proposed_snapshot_json",
                table: "expense_bill_revisions");

            migrationBuilder.DropColumn(
                name: "request_id",
                table: "expense_bill_revisions");

            migrationBuilder.DropColumn(
                name: "revision_sequence",
                table: "expense_bill_revisions");

            migrationBuilder.DropColumn(
                name: "rounding_policy_version",
                table: "expense_bill_revisions");

            migrationBuilder.DropColumn(
                name: "snapshot_schema_version",
                table: "expense_bill_revisions");

            migrationBuilder.DropColumn(
                name: "unsupported_detail_reason",
                table: "expense_bill_revisions");
        }
    }
}
