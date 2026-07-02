using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSettlementResidualReviewNeededNotificationRuntime : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_user_notifications_event_type",
                table: "user_notifications");

            migrationBuilder.DropCheckConstraint(
                name: "ck_notification_delivery_attempts_event_type",
                table: "notification_delivery_attempts");

            migrationBuilder.AddCheckConstraint(
                name: "ck_user_notifications_event_type",
                table: "user_notifications",
                sql: "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'bill.revision_proposed', 'bill.revision_resubmitted', 'bill.revision_submitted', 'bill.revision_withdrawn', 'bill.revision_approved', 'bill.revision_rejected', 'bill.revision_payer_confirmed', 'bill.revision_applied', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'settlement.residual_review_needed', 'recurring_bill.due_soon', 'recurring_bill.draft_generated', 'sync.conflict_detected', 'sync.operation_failed', 'ocr.needs_review')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_notification_delivery_attempts_event_type",
                table: "notification_delivery_attempts",
                sql: "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'bill.revision_proposed', 'bill.revision_resubmitted', 'bill.revision_submitted', 'bill.revision_withdrawn', 'bill.revision_approved', 'bill.revision_rejected', 'bill.revision_payer_confirmed', 'bill.revision_applied', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'settlement.residual_review_needed', 'recurring_bill.due_soon', 'recurring_bill.draft_generated', 'sync.conflict_detected', 'sync.operation_failed', 'ocr.needs_review')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_user_notifications_event_type",
                table: "user_notifications");

            migrationBuilder.DropCheckConstraint(
                name: "ck_notification_delivery_attempts_event_type",
                table: "notification_delivery_attempts");

            migrationBuilder.AddCheckConstraint(
                name: "ck_user_notifications_event_type",
                table: "user_notifications",
                sql: "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'bill.revision_proposed', 'bill.revision_resubmitted', 'bill.revision_submitted', 'bill.revision_withdrawn', 'bill.revision_approved', 'bill.revision_rejected', 'bill.revision_payer_confirmed', 'bill.revision_applied', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'recurring_bill.due_soon', 'recurring_bill.draft_generated', 'sync.conflict_detected', 'sync.operation_failed', 'ocr.needs_review')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_notification_delivery_attempts_event_type",
                table: "notification_delivery_attempts",
                sql: "event_type IN ('bill.submitted', 'bill.participant_accepted', 'bill.participant_rejected', 'bill.confirmed', 'bill.revision_proposed', 'bill.revision_resubmitted', 'bill.revision_submitted', 'bill.revision_withdrawn', 'bill.revision_approved', 'bill.revision_rejected', 'bill.revision_payer_confirmed', 'bill.revision_applied', 'settlement.request_created', 'settlement.payment_marked_paid', 'settlement.payment_partially_paid', 'settlement.payment_confirmed', 'settlement.request_disputed', 'settlement.payment_disputed', 'settlement.request_cancelled', 'settlement.payment_cancelled', 'settlement.proof_attached', 'recurring_bill.due_soon', 'recurring_bill.draft_generated', 'sync.conflict_detected', 'sync.operation_failed', 'ocr.needs_review')");
        }
    }
}
