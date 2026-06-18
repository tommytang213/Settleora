using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddManualFinanceAccountIncomeFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "manual_financial_accounts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    display_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    account_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    current_balance_amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    current_balance_currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    balance_as_of_date = table.Column<DateOnly>(type: "date", nullable: false),
                    note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    archived_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_manual_financial_accounts", x => x.id);
                    table.CheckConstraint("ck_manual_financial_accounts_account_type", "account_type IN ('cash', 'bank_account', 'stored_value', 'other')");
                    table.CheckConstraint("ck_manual_financial_accounts_archived_status_pair", "(status = 'archived') = (archived_at_utc IS NOT NULL)");
                    table.CheckConstraint("ck_manual_financial_accounts_currency_upper", "current_balance_currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_manual_financial_accounts_display_name_not_blank", "length(btrim(display_name)) > 0");
                    table.CheckConstraint("ck_manual_financial_accounts_status", "status IN ('active', 'archived')");
                    table.ForeignKey(
                        name: "fk_manual_financial_accounts_owner_user_profiles",
                        column: x => x.owner_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "manual_income_sources",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    manual_financial_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    display_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(19,4)", precision: 19, scale: 4, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    cadence = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    next_expected_date = table.Column<DateOnly>(type: "date", nullable: false),
                    end_date = table.Column<DateOnly>(type: "date", nullable: true),
                    note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    archived_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_manual_income_sources", x => x.id);
                    table.CheckConstraint("ck_manual_income_sources_archived_status_pair", "(status = 'archived') = (archived_at_utc IS NOT NULL)");
                    table.CheckConstraint("ck_manual_income_sources_cadence", "cadence IN ('one_time', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')");
                    table.CheckConstraint("ck_manual_income_sources_currency_upper", "currency ~ '^[A-Z]{3}$'");
                    table.CheckConstraint("ck_manual_income_sources_display_name_not_blank", "length(btrim(display_name)) > 0");
                    table.CheckConstraint("ck_manual_income_sources_end_date_order", "end_date IS NULL OR end_date >= next_expected_date");
                    table.CheckConstraint("ck_manual_income_sources_status", "status IN ('active', 'archived')");
                    table.ForeignKey(
                        name: "fk_manual_income_sources_manual_financial_accounts",
                        column: x => x.manual_financial_account_id,
                        principalTable: "manual_financial_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_manual_income_sources_owner_user_profiles",
                        column: x => x.owner_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_manual_financial_accounts_owner_status_name",
                table: "manual_financial_accounts",
                columns: new[] { "owner_user_profile_id", "status", "display_name" });

            migrationBuilder.CreateIndex(
                name: "ix_manual_income_sources_manual_financial_account_id",
                table: "manual_income_sources",
                column: "manual_financial_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_manual_income_sources_owner_status_next",
                table: "manual_income_sources",
                columns: new[] { "owner_user_profile_id", "status", "next_expected_date" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "manual_income_sources");

            migrationBuilder.DropTable(
                name: "manual_financial_accounts");
        }
    }
}
