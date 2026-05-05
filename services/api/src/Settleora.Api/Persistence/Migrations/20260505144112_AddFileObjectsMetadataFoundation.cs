using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFileObjectsMetadataFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "file_objects",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_by_user_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    purpose = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    content_type = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    original_filename = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    sha256_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    storage_provider = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    storage_object_key = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    encryption_mode = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    vault_key_ref = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    retention_policy = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    deleted_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_file_objects", x => x.id);
                    table.CheckConstraint("ck_file_objects_content_type_not_blank", "length(btrim(content_type)) > 0");
                    table.CheckConstraint("ck_file_objects_encryption_mode", "encryption_mode IN ('server_managed', 'recoverable_user_vault', 'strict_user_vault_future')");
                    table.CheckConstraint("ck_file_objects_original_filename_not_blank", "original_filename IS NULL OR length(btrim(original_filename)) > 0");
                    table.CheckConstraint("ck_file_objects_purpose", "purpose IN ('receipt_image', 'ocr_source', 'settlement_proof', 'payment_qr', 'statement_upload', 'export_file', 'supporting_attachment')");
                    table.CheckConstraint("ck_file_objects_retention_policy_not_blank", "retention_policy IS NULL OR length(btrim(retention_policy)) > 0");
                    table.CheckConstraint("ck_file_objects_sha256_hash_lower_hex", "sha256_hash IS NULL OR sha256_hash ~ '^[a-f0-9]{64}$'");
                    table.CheckConstraint("ck_file_objects_size_bytes_non_negative", "size_bytes >= 0");
                    table.CheckConstraint("ck_file_objects_status", "status IN ('pending', 'active', 'quarantined', 'deleted', 'purged', 'upload_failed')");
                    table.CheckConstraint("ck_file_objects_storage_object_key_not_blank", "length(btrim(storage_object_key)) > 0");
                    table.CheckConstraint("ck_file_objects_storage_provider", "storage_provider IN ('local')");
                    table.CheckConstraint("ck_file_objects_vault_key_ref_not_blank", "vault_key_ref IS NULL OR length(btrim(vault_key_ref)) > 0");
                    table.ForeignKey(
                        name: "fk_file_objects_created_by_user_profiles_created_by_user_profile_id",
                        column: x => x.created_by_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_file_objects_owner_user_profiles_owner_user_profile_id",
                        column: x => x.owner_user_profile_id,
                        principalTable: "user_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_file_objects_created_at_utc",
                table: "file_objects",
                column: "created_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_file_objects_created_by_user_profile_id",
                table: "file_objects",
                column: "created_by_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_file_objects_deleted_at_utc",
                table: "file_objects",
                column: "deleted_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_file_objects_owner_user_profile_id",
                table: "file_objects",
                column: "owner_user_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_file_objects_purpose_status",
                table: "file_objects",
                columns: new[] { "purpose", "status" });

            migrationBuilder.CreateIndex(
                name: "ux_file_objects_storage_provider_object_key",
                table: "file_objects",
                columns: new[] { "storage_provider", "storage_object_key" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "file_objects");
        }
    }
}
