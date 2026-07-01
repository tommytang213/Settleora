using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationDeliveryOutboxLeaseFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "last_attempted_at_utc",
                table: "notification_delivery_attempts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "lease_expires_at_utc",
                table: "notification_delivery_attempts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "lease_owner",
                table: "notification_delivery_attempts",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_notification_delivery_attempts_channel_status_lease_expires",
                table: "notification_delivery_attempts",
                columns: new[] { "channel", "status", "lease_expires_at_utc" });

            migrationBuilder.AddCheckConstraint(
                name: "ck_notification_delivery_attempts_lease_owner_not_blank",
                table: "notification_delivery_attempts",
                sql: "lease_owner IS NULL OR length(btrim(lease_owner)) > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_notification_delivery_attempts_lease_pair",
                table: "notification_delivery_attempts",
                sql: "(lease_owner IS NULL) = (lease_expires_at_utc IS NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_notification_delivery_attempts_channel_status_lease_expires",
                table: "notification_delivery_attempts");

            migrationBuilder.DropCheckConstraint(
                name: "ck_notification_delivery_attempts_lease_owner_not_blank",
                table: "notification_delivery_attempts");

            migrationBuilder.DropCheckConstraint(
                name: "ck_notification_delivery_attempts_lease_pair",
                table: "notification_delivery_attempts");

            migrationBuilder.DropColumn(
                name: "last_attempted_at_utc",
                table: "notification_delivery_attempts");

            migrationBuilder.DropColumn(
                name: "lease_expires_at_utc",
                table: "notification_delivery_attempts");

            migrationBuilder.DropColumn(
                name: "lease_owner",
                table: "notification_delivery_attempts");
        }
    }
}
