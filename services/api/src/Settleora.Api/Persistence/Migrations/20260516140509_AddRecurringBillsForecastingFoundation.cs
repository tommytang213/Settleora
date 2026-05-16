using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRecurringBillsForecastingFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "recurring_bill_templates",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: true),
                    merchant_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    schedule_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    interval_count = table.Column<int>(type: "integer", nullable: true),
                    interval_days = table.Column<int>(type: "integer", nullable: true),
                    start_date = table.Column<DateOnly>(type: "date", nullable: false),
                    end_date = table.Column<DateOnly>(type: "date", nullable: true),
                    due_offset_days = table.Column<int>(type: "integer", nullable: true),
                    next_occurrence_date = table.Column<DateOnly>(type: "date", nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    payload_version = table.Column<int>(type: "integer", nullable: false),
                    payload_json = table.Column<string>(type: "character varying(32000)", maxLength: 32000, nullable: false),
                    forecast_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    forecast_currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    archived_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_recurring_bill_templates", x => x.id);
                    table.CheckConstraint("ck_recurring_bill_templates_description_not_blank", "description IS NULL OR length(btrim(description)) > 0");
                    table.CheckConstraint("ck_recurring_bill_templates_due_offset_range", "due_offset_days IS NULL OR (due_offset_days >= -365 AND due_offset_days <= 365)");
                    table.CheckConstraint("ck_recurring_bill_templates_end_date_after_start", "end_date IS NULL OR end_date >= start_date");
                    table.CheckConstraint("ck_recurring_bill_templates_forecast_amount_non_negative", "forecast_amount >= 0");
                    table.CheckConstraint("ck_recurring_bill_templates_forecast_amount_upper_bound", "forecast_amount <= 999999999999999.9999");
                    table.CheckConstraint("ck_recurring_bill_templates_forecast_currency_iso", "forecast_currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_recurring_bill_templates_interval_count_positive", "interval_count IS NULL OR interval_count > 0");
                    table.CheckConstraint("ck_recurring_bill_templates_interval_days_positive", "interval_days IS NULL OR interval_days > 0");
                    table.CheckConstraint("ck_recurring_bill_templates_interval_shape", "(schedule_type = 'custom_interval_days' AND interval_days IS NOT NULL AND interval_count IS NULL) OR (schedule_type <> 'custom_interval_days' AND interval_count IS NOT NULL AND interval_days IS NULL)");
                    table.CheckConstraint("ck_recurring_bill_templates_merchant_name_not_blank", "merchant_name IS NULL OR length(btrim(merchant_name)) > 0");
                    table.CheckConstraint("ck_recurring_bill_templates_payload_json_not_blank", "length(btrim(payload_json)) > 0");
                    table.CheckConstraint("ck_recurring_bill_templates_payload_version_positive", "payload_version > 0");
                    table.CheckConstraint("ck_recurring_bill_templates_schedule_type", "schedule_type IN ('weekly', 'monthly', 'yearly', 'custom_interval_days')");
                    table.CheckConstraint("ck_recurring_bill_templates_status", "status IN ('active', 'paused', 'archived')");
                    table.ForeignKey(
                        name: "fk_recurring_bill_templates_user_groups_group_id",
                        column: x => x.group_id,
                        principalTable: "user_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_recurring_bill_templates_user_profiles_created_by_id",
                        column: x => x.created_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_recurring_bill_templates_user_profiles_owner_id",
                        column: x => x.owner_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "recurring_bill_occurrences",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    recurring_bill_template_id = table.Column<Guid>(type: "uuid", nullable: false),
                    occurrence_date = table.Column<DateOnly>(type: "date", nullable: false),
                    due_date = table.Column<DateOnly>(type: "date", nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    generated_expense_bill_id = table.Column<Guid>(type: "uuid", nullable: true),
                    generated_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: true),
                    generated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_recurring_bill_occurrences", x => x.id);
                    table.CheckConstraint("ck_recurring_bill_occurrences_generated_shape", "(status = 'draft_generated' AND generated_expense_bill_id IS NOT NULL AND generated_by_user_profile_id IS NOT NULL AND generated_at_utc IS NOT NULL) OR (status <> 'draft_generated')");
                    table.CheckConstraint("ck_recurring_bill_occurrences_status", "status IN ('forecasted', 'draft_generated', 'skipped', 'cancelled')");
                    table.ForeignKey(
                        name: "fk_recurring_bill_occurrences_expense_bills_generated_id",
                        column: x => x.generated_expense_bill_id,
                        principalTable: "expense_bills",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_recurring_bill_occurrences_templates_template_id",
                        column: x => x.recurring_bill_template_id,
                        principalTable: "recurring_bill_templates",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_recurring_bill_occurrences_user_profiles_generated_by_id",
                        column: x => x.generated_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_recurring_bill_occurrences_generated_bill_id",
                table: "recurring_bill_occurrences",
                column: "generated_expense_bill_id");

            migrationBuilder.CreateIndex(
                name: "ix_recurring_bill_occurrences_generated_by_profile_id",
                table: "recurring_bill_occurrences",
                column: "generated_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_recurring_bill_occurrences_occurrence_date",
                table: "recurring_bill_occurrences",
                column: "occurrence_date");

            migrationBuilder.CreateIndex(
                name: "ix_recurring_bill_occurrences_template_id",
                table: "recurring_bill_occurrences",
                column: "recurring_bill_template_id");

            migrationBuilder.CreateIndex(
                name: "ux_recurring_bill_occurrences_template_date",
                table: "recurring_bill_occurrences",
                columns: new[] { "recurring_bill_template_id", "occurrence_date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_recurring_bill_templates_created_by_profile_id",
                table: "recurring_bill_templates",
                column: "created_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_recurring_bill_templates_group_id",
                table: "recurring_bill_templates",
                column: "group_id");

            migrationBuilder.CreateIndex(
                name: "ix_recurring_bill_templates_next_occurrence_date",
                table: "recurring_bill_templates",
                column: "next_occurrence_date");

            migrationBuilder.CreateIndex(
                name: "ix_recurring_bill_templates_owner_status_next",
                table: "recurring_bill_templates",
                columns: new[] { "owner_user_profile_id", "status", "next_occurrence_date" });

            migrationBuilder.CreateIndex(
                name: "ix_recurring_bill_templates_owner_user_profile_id",
                table: "recurring_bill_templates",
                column: "owner_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_recurring_bill_templates_status",
                table: "recurring_bill_templates",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "recurring_bill_occurrences");

            migrationBuilder.DropTable(
                name: "recurring_bill_templates");
        }
    }
}
