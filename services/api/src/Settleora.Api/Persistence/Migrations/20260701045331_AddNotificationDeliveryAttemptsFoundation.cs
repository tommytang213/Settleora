using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationDeliveryAttemptsFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "notification_delivery_attempts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    in_app_notification_id = table.Column<Guid>(type: "uuid", nullable: true),
                    recipient_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    actor_user_profile_id = table.Column<Guid>(type: "uuid", nullable: true),
                    event_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    subject_type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    channel = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status_reason = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    idempotency_key = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    source_correlation_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    attempt_count = table.Column<int>(type: "integer", nullable: false),
                    next_attempt_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    expires_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    completed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    redacted_provider_result_category = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    group_id = table.Column<Guid>(type: "uuid", nullable: true),
                    expense_bill_id = table.Column<Guid>(type: "uuid", nullable: true),
                    expense_bill_revision_id = table.Column<Guid>(type: "uuid", nullable: true),
                    settlement_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    settlement_payment_id = table.Column<Guid>(type: "uuid", nullable: true),
                    recurring_bill_template_id = table.Column<Guid>(type: "uuid", nullable: true),
                    recurring_bill_occurrence_id = table.Column<Guid>(type: "uuid", nullable: true),
                    receipt_ocr_review_id = table.Column<Guid>(type: "uuid", nullable: true),
                    receipt_attachment_file_id = table.Column<Guid>(type: "uuid", nullable: true),
                    sync_operation_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notification_delivery_attempts", x => x.id);
                    table.CheckConstraint("ck_notification_delivery_attempts_attempt_count_non_negative", "attempt_count >= 0");
                    table.CheckConstraint("ck_notification_delivery_attempts_channel", "channel IN ('email', 'mobile_push')");
                    table.CheckConstraint("ck_notification_delivery_attempts_event_type", "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'bill.revision_proposed', 'bill.revision_resubmitted', 'bill.revision_submitted', 'bill.revision_withdrawn', 'bill.revision_approved', 'bill.revision_rejected', 'bill.revision_payer_confirmed', 'bill.revision_applied', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'recurring_bill.due_soon', 'recurring_bill.draft_generated', 'sync.conflict_detected', 'ocr.needs_review')");
                    table.CheckConstraint("ck_notification_delivery_attempts_idempotency_key_not_blank", "length(btrim(idempotency_key)) > 0");
                    table.CheckConstraint("ck_notification_delivery_attempts_no_provider_runtime_status", "status NOT IN ('attempting', 'sent', 'failed_transient', 'failed_permanent', 'delivered')");
                    table.CheckConstraint("ck_notification_delivery_attempts_provider_result_completion", "redacted_provider_result_category IS NULL OR completed_at_utc IS NOT NULL");
                    table.CheckConstraint("ck_notification_delivery_attempts_provider_result_not_blank", "redacted_provider_result_category IS NULL OR length(btrim(redacted_provider_result_category)) > 0");
                    table.CheckConstraint("ck_notification_delivery_attempts_source_correlation_not_blank", "source_correlation_id IS NULL OR length(btrim(source_correlation_id)) > 0");
                    table.CheckConstraint("ck_notification_delivery_attempts_status", "status IN ('not_applicable', 'disabled', 'unconfigured', 'deferred', 'queued', 'suppressed', 'cancelled', 'expired')");
                    table.CheckConstraint("ck_notification_delivery_attempts_status_reason", "status_reason IN ('future_provider_eligible', 'required_bypass_policy_not_configured', 'channel_unsupported_for_event', 'disabled_by_policy', 'disabled_by_user_preference', 'provider_unconfigured', 'device_availability_unconfigured', 'quiet_hours_deferred', 'digest_readout_deferred', 'unsafe_external_content', 'recipient_unauthorized', 'event_type_unsupported', 'subject_type_unsupported', 'unsafe_notification_content', 'source_domain_ineligible', 'recipient_profile_unavailable', 'unsafe_delivery_attempt_request')");
                    table.CheckConstraint("ck_notification_delivery_attempts_subject_type", "subject_type IN ('expense_bill', 'settlement_request', 'settlement_payment', 'recurring_bill_occurrence', 'sync_operation', 'receipt_ocr_review')");
                    table.ForeignKey(
                        name: "fk_notification_delivery_attempts_actor_user_profiles",
                        column: x => x.actor_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notification_delivery_attempts_expense_bill_revisions",
                        column: x => x.expense_bill_revision_id,
                        principalTable: "expense_bill_revisions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notification_delivery_attempts_expense_bills_expense_bill_id",
                        column: x => x.expense_bill_id,
                        principalTable: "expense_bills",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notification_delivery_attempts_file_objects_receipt",
                        column: x => x.receipt_attachment_file_id,
                        principalTable: "file_objects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notification_delivery_attempts_receipt_ocr_reviews_review_id",
                        column: x => x.receipt_ocr_review_id,
                        principalTable: "receipt_ocr_reviews",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notification_delivery_attempts_recipient_user_profiles",
                        column: x => x.recipient_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notification_delivery_attempts_recurring_occurrences",
                        column: x => x.recurring_bill_occurrence_id,
                        principalTable: "recurring_bill_occurrences",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notification_delivery_attempts_recurring_templates",
                        column: x => x.recurring_bill_template_id,
                        principalTable: "recurring_bill_templates",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notification_delivery_attempts_settlement_payments",
                        column: x => x.settlement_payment_id,
                        principalTable: "settlement_payments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notification_delivery_attempts_settlement_requests",
                        column: x => x.settlement_request_id,
                        principalTable: "settlement_requests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notification_delivery_attempts_sync_operations_operation_id",
                        column: x => x.sync_operation_id,
                        principalTable: "sync_operations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notification_delivery_attempts_user_groups_group_id",
                        column: x => x.group_id,
                        principalTable: "user_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_notification_delivery_attempts_user_notifications",
                        column: x => x.in_app_notification_id,
                        principalTable: "user_notifications",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_actor_user_profile_id",
                table: "notification_delivery_attempts",
                column: "actor_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_channel_status_next_attempt",
                table: "notification_delivery_attempts",
                columns: new[] { "channel", "status", "next_attempt_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_expense_bill_id",
                table: "notification_delivery_attempts",
                column: "expense_bill_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_expense_bill_revision_id",
                table: "notification_delivery_attempts",
                column: "expense_bill_revision_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_group_id",
                table: "notification_delivery_attempts",
                column: "group_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_in_app_notification_id",
                table: "notification_delivery_attempts",
                column: "in_app_notification_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_receipt_attachment_file_id",
                table: "notification_delivery_attempts",
                column: "receipt_attachment_file_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_receipt_ocr_review_id",
                table: "notification_delivery_attempts",
                column: "receipt_ocr_review_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_recipient_channel_status",
                table: "notification_delivery_attempts",
                columns: new[] { "recipient_user_profile_id", "channel", "status", "created_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_recipient_user_profile_id",
                table: "notification_delivery_attempts",
                column: "recipient_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_recurring_bill_occurrence_id",
                table: "notification_delivery_attempts",
                column: "recurring_bill_occurrence_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_recurring_bill_template_id",
                table: "notification_delivery_attempts",
                column: "recurring_bill_template_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_settlement_payment_id",
                table: "notification_delivery_attempts",
                column: "settlement_payment_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_settlement_request_id",
                table: "notification_delivery_attempts",
                column: "settlement_request_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_sync_operation_id",
                table: "notification_delivery_attempts",
                column: "sync_operation_id");

            migrationBuilder.CreateIndex(
                name: "ux_notification_delivery_attempts_idempotency_key",
                table: "notification_delivery_attempts",
                column: "idempotency_key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notification_delivery_attempts");
        }
    }
}
