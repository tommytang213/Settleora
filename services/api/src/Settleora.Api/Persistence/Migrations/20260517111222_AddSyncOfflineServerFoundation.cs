using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSyncOfflineServerFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "sync_operations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    actor_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    idempotency_key = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    request_payload_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    operation_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    resource_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    resource_id = table.Column<Guid>(type: "uuid", nullable: true),
                    base_version = table.Column<long>(type: "bigint", nullable: true),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    result_resource_id = table.Column<Guid>(type: "uuid", nullable: true),
                    result_version = table.Column<long>(type: "bigint", nullable: true),
                    safe_error_code = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sync_operations", x => x.id);
                    table.CheckConstraint("ck_sync_operations_base_version_non_negative", "base_version IS NULL OR base_version >= 0");
                    table.CheckConstraint("ck_sync_operations_idempotency_key_not_blank", "length(btrim(idempotency_key)) > 0");
                    table.CheckConstraint("ck_sync_operations_operation_type", "operation_type IN ('bill_archive', 'bill_restore')");
                    table.CheckConstraint("ck_sync_operations_payload_hash_lower_hex", "request_payload_hash ~ '^[a-f0-9]{64}$'");
                    table.CheckConstraint("ck_sync_operations_resource_type", "resource_type IN ('expense_bill')");
                    table.CheckConstraint("ck_sync_operations_result_pair", "((status = 'accepted' AND result_resource_id IS NOT NULL AND result_version IS NOT NULL AND safe_error_code IS NULL) OR (status <> 'accepted'))");
                    table.CheckConstraint("ck_sync_operations_result_version_positive", "result_version IS NULL OR result_version > 0");
                    table.CheckConstraint("ck_sync_operations_safe_error_code_not_blank", "safe_error_code IS NULL OR length(btrim(safe_error_code)) > 0");
                    table.CheckConstraint("ck_sync_operations_status", "status IN ('accepted', 'rejected', 'conflict')");
                    table.ForeignKey(
                        name: "fk_sync_operations_actor_user_profiles",
                        column: x => x.actor_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "sync_resource_versions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    resource_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    resource_id = table.Column<Guid>(type: "uuid", nullable: false),
                    version = table.Column<long>(type: "bigint", nullable: false),
                    change_kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    changed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    changed_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: true),
                    owner_user_profile_id = table.Column<Guid>(type: "uuid", nullable: true),
                    group_id = table.Column<Guid>(type: "uuid", nullable: true),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sync_resource_versions", x => x.id);
                    table.CheckConstraint("ck_sync_resource_versions_change_kind", "change_kind IN ('updated', 'archived', 'restored')");
                    table.CheckConstraint("ck_sync_resource_versions_resource_type", "resource_type IN ('expense_bill')");
                    table.CheckConstraint("ck_sync_resource_versions_version_positive", "version > 0");
                    table.CheckConstraint("ck_sync_resource_versions_visibility_scope", "owner_user_profile_id IS NOT NULL OR group_id IS NOT NULL");
                    table.ForeignKey(
                        name: "fk_sync_resource_versions_changed_by_user_profiles",
                        column: x => x.changed_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_sync_resource_versions_owner_user_profiles",
                        column: x => x.owner_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_sync_resource_versions_user_groups_group_id",
                        column: x => x.group_id,
                        principalTable: "user_groups",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_sync_operations_actor_status_created",
                table: "sync_operations",
                columns: new[] { "actor_user_profile_id", "status", "created_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_sync_operations_resource",
                table: "sync_operations",
                columns: new[] { "resource_type", "resource_id" });

            migrationBuilder.CreateIndex(
                name: "ux_sync_operations_actor_idempotency_key",
                table: "sync_operations",
                columns: new[] { "actor_user_profile_id", "idempotency_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_sync_resource_versions_changed_by_user_profile_id",
                table: "sync_resource_versions",
                column: "changed_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_sync_resource_versions_group_version",
                table: "sync_resource_versions",
                columns: new[] { "group_id", "version" });

            migrationBuilder.CreateIndex(
                name: "ix_sync_resource_versions_owner_version",
                table: "sync_resource_versions",
                columns: new[] { "owner_user_profile_id", "version" });

            migrationBuilder.CreateIndex(
                name: "ix_sync_resource_versions_resource_type_version",
                table: "sync_resource_versions",
                columns: new[] { "resource_type", "version" });

            migrationBuilder.CreateIndex(
                name: "ux_sync_resource_versions_resource",
                table: "sync_resource_versions",
                columns: new[] { "resource_type", "resource_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ux_sync_resource_versions_version",
                table: "sync_resource_versions",
                column: "version",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "sync_operations");

            migrationBuilder.DropTable(
                name: "sync_resource_versions");
        }
    }
}
