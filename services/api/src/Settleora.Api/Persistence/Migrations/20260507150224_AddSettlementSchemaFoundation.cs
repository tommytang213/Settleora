using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSettlementSchemaFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "settlement_requests",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: true),
                    source_expense_bill_id = table.Column<Guid>(type: "uuid", nullable: true),
                    debtor_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    creditor_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    requested_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    requested_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    confirmed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    disputed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    cancelled_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    archived_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_settlement_requests", x => x.id);
                    table.CheckConstraint("ck_settlement_requests_amount_positive", "amount > 0");
                    table.CheckConstraint("ck_settlement_requests_amount_upper_bound", "amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_settlement_requests_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_settlement_requests_debtor_creditor_distinct", "debtor_user_profile_id <> creditor_user_profile_id");
                    table.CheckConstraint("ck_settlement_requests_status", "status IN ('requested', 'partially_paid', 'marked_paid', 'confirmed', 'disputed', 'cancelled')");
                    table.ForeignKey(
                        name: "fk_settlement_requests_expense_bills_source_bill_id",
                        column: x => x.source_expense_bill_id,
                        principalTable: "expense_bills",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_requests_user_groups_group_id",
                        column: x => x.group_id,
                        principalTable: "user_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_requests_user_profiles_creditor_id",
                        column: x => x.creditor_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_requests_user_profiles_debtor_id",
                        column: x => x.debtor_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_requests_user_profiles_requested_by_id",
                        column: x => x.requested_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "settlement_payments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    settlement_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    paid_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    received_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    payment_date = table.Column<DateOnly>(type: "date", nullable: false),
                    note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    created_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    claimed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    confirmed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    disputed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    cancelled_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_settlement_payments", x => x.id);
                    table.CheckConstraint("ck_settlement_payments_amount_positive", "amount > 0");
                    table.CheckConstraint("ck_settlement_payments_amount_upper_bound", "amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_settlement_payments_currency_uppercase_iso", "currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_settlement_payments_note_not_blank", "note IS NULL OR length(btrim(note)) > 0");
                    table.CheckConstraint("ck_settlement_payments_payer_receiver_distinct", "paid_by_user_profile_id <> received_by_user_profile_id");
                    table.CheckConstraint("ck_settlement_payments_status", "status IN ('marked_paid', 'confirmed', 'disputed', 'cancelled')");
                    table.ForeignKey(
                        name: "fk_settlement_payments_settlement_requests_request_id",
                        column: x => x.settlement_request_id,
                        principalTable: "settlement_requests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_payments_user_profiles_created_by_id",
                        column: x => x.created_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_payments_user_profiles_paid_by_id",
                        column: x => x.paid_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_payments_user_profiles_received_by_id",
                        column: x => x.received_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "settlement_proof_attachments",
                columns: table => new
                {
                    settlement_payment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_object_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    removed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_settlement_proof_attachments", x => new { x.settlement_payment_id, x.file_object_id });
                    table.ForeignKey(
                        name: "fk_settlement_proof_attachments_file_objects_file_id",
                        column: x => x.file_object_id,
                        principalTable: "file_objects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_proof_attachments_payments_payment_id",
                        column: x => x.settlement_payment_id,
                        principalTable: "settlement_payments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_settlement_proof_attachments_user_profiles_created_by",
                        column: x => x.created_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_settlement_payments_created_by_user_profile_id",
                table: "settlement_payments",
                column: "created_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_payments_paid_by_user_profile_id",
                table: "settlement_payments",
                column: "paid_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_payments_payment_date",
                table: "settlement_payments",
                column: "payment_date");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_payments_received_by_user_profile_id",
                table: "settlement_payments",
                column: "received_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_payments_settlement_request_id",
                table: "settlement_payments",
                column: "settlement_request_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_payments_status",
                table: "settlement_payments",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_proof_attachments_created_by_profile_id",
                table: "settlement_proof_attachments",
                column: "created_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_proof_attachments_file_object_id",
                table: "settlement_proof_attachments",
                column: "file_object_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_requests_archived_at_utc",
                table: "settlement_requests",
                column: "archived_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_requests_created_at_utc",
                table: "settlement_requests",
                column: "created_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_requests_creditor_user_profile_id",
                table: "settlement_requests",
                column: "creditor_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_requests_debtor_user_profile_id",
                table: "settlement_requests",
                column: "debtor_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_requests_group_id",
                table: "settlement_requests",
                column: "group_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_requests_requested_at_utc",
                table: "settlement_requests",
                column: "requested_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_requests_requested_by_user_profile_id",
                table: "settlement_requests",
                column: "requested_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_requests_source_expense_bill_id",
                table: "settlement_requests",
                column: "source_expense_bill_id");

            migrationBuilder.CreateIndex(
                name: "ix_settlement_requests_status",
                table: "settlement_requests",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "settlement_proof_attachments");

            migrationBuilder.DropTable(
                name: "settlement_payments");

            migrationBuilder.DropTable(
                name: "settlement_requests");
        }
    }
}
