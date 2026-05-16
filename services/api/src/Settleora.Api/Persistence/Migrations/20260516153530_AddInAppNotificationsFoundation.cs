using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInAppNotificationsFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "user_notifications",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    recipient_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    actor_user_profile_id = table.Column<Guid>(type: "uuid", nullable: true),
                    event_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    priority = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    subject_type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    title_key = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    message_key = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    safe_summary = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: true),
                    action_url = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: true),
                    group_id = table.Column<Guid>(type: "uuid", nullable: true),
                    expense_bill_id = table.Column<Guid>(type: "uuid", nullable: true),
                    expense_bill_revision_id = table.Column<Guid>(type: "uuid", nullable: true),
                    settlement_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    settlement_payment_id = table.Column<Guid>(type: "uuid", nullable: true),
                    recurring_bill_template_id = table.Column<Guid>(type: "uuid", nullable: true),
                    recurring_bill_occurrence_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    read_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    archived_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_notifications", x => x.id);
                    table.CheckConstraint("ck_user_notifications_action_url_route_like", "action_url IS NULL OR (action_url LIKE '/api/v1/%' AND action_url NOT LIKE '%://%' AND action_url NOT LIKE '%\\\\%')");
                    table.CheckConstraint("ck_user_notifications_event_type", "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'recurring_bill.draft_generated')");
                    table.CheckConstraint("ck_user_notifications_message_key_not_blank", "length(btrim(message_key)) > 0");
                    table.CheckConstraint("ck_user_notifications_priority", "priority IN ('normal', 'attention', 'urgent')");
                    table.CheckConstraint("ck_user_notifications_safe_summary_not_blank", "safe_summary IS NULL OR length(btrim(safe_summary)) > 0");
                    table.CheckConstraint("ck_user_notifications_status", "status IN ('unread', 'read', 'archived')");
                    table.CheckConstraint("ck_user_notifications_subject_type", "subject_type IN ('expense_bill', 'settlement_request', 'settlement_payment', 'recurring_bill_occurrence')");
                    table.CheckConstraint("ck_user_notifications_title_key_not_blank", "length(btrim(title_key)) > 0");
                    table.ForeignKey(
                        name: "fk_user_notifications_actor_user_profiles",
                        column: x => x.actor_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_user_notifications_expense_bill_revisions_revision_id",
                        column: x => x.expense_bill_revision_id,
                        principalTable: "expense_bill_revisions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_user_notifications_expense_bills_expense_bill_id",
                        column: x => x.expense_bill_id,
                        principalTable: "expense_bills",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_user_notifications_recipient_user_profiles",
                        column: x => x.recipient_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_user_notifications_recurring_bill_occurrences_occurrence_id",
                        column: x => x.recurring_bill_occurrence_id,
                        principalTable: "recurring_bill_occurrences",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_user_notifications_recurring_bill_templates_template_id",
                        column: x => x.recurring_bill_template_id,
                        principalTable: "recurring_bill_templates",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_user_notifications_settlement_payments_payment_id",
                        column: x => x.settlement_payment_id,
                        principalTable: "settlement_payments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_user_notifications_settlement_requests_request_id",
                        column: x => x.settlement_request_id,
                        principalTable: "settlement_requests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_user_notifications_user_groups_group_id",
                        column: x => x.group_id,
                        principalTable: "user_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_user_notifications_actor_user_profile_id",
                table: "user_notifications",
                column: "actor_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_notifications_expense_bill_id",
                table: "user_notifications",
                column: "expense_bill_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_notifications_expense_bill_revision_id",
                table: "user_notifications",
                column: "expense_bill_revision_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_notifications_group_id",
                table: "user_notifications",
                column: "group_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_notifications_recipient_status_created",
                table: "user_notifications",
                columns: new[] { "recipient_user_profile_id", "status", "created_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_user_notifications_recipient_user_profile_id",
                table: "user_notifications",
                column: "recipient_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_notifications_recurring_bill_occurrence_id",
                table: "user_notifications",
                column: "recurring_bill_occurrence_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_notifications_recurring_bill_template_id",
                table: "user_notifications",
                column: "recurring_bill_template_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_notifications_settlement_payment_id",
                table: "user_notifications",
                column: "settlement_payment_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_notifications_settlement_request_id",
                table: "user_notifications",
                column: "settlement_request_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_notifications");
        }
    }
}
