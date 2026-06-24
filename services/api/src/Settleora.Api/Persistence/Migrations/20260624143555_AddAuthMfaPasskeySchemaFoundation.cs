using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Settleora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAuthMfaPasskeySchemaFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "auth_mfa_factors",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    factor_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    display_label = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    totp_secret_storage_kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    totp_protected_secret_reference = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    totp_encrypted_secret_payload = table.Column<string>(type: "character varying(8192)", maxLength: 8192, nullable: true),
                    totp_issuer = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    totp_account_label = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    totp_algorithm = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    totp_digits = table.Column<int>(type: "integer", nullable: true),
                    totp_period_seconds = table.Column<int>(type: "integer", nullable: true),
                    policy_version = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    verified_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_used_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    disabled_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    rotated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    expires_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    status_reason = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    last_status_changed_by_auth_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    last_status_change_correlation_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_mfa_factors", x => x.id);
                    table.CheckConstraint("ck_auth_mfa_factors_factor_type", "factor_type IN ('totp')");
                    table.CheckConstraint("ck_auth_mfa_factors_no_plaintext_totp_secret_pair", "(totp_secret_storage_kind = 'protected_reference' AND totp_protected_secret_reference IS NOT NULL AND totp_encrypted_secret_payload IS NULL) OR (totp_secret_storage_kind = 'encrypted_payload' AND totp_encrypted_secret_payload IS NOT NULL AND totp_protected_secret_reference IS NULL) OR ((totp_secret_storage_kind IS NULL OR totp_secret_storage_kind = 'none') AND totp_protected_secret_reference IS NULL AND totp_encrypted_secret_payload IS NULL)");
                    table.CheckConstraint("ck_auth_mfa_factors_secret_storage_kind", "totp_secret_storage_kind IS NULL OR totp_secret_storage_kind IN ('none', 'protected_reference', 'encrypted_payload')");
                    table.CheckConstraint("ck_auth_mfa_factors_status", "status IN ('pending', 'enrolled', 'disabled', 'revoked', 'expired')");
                    table.CheckConstraint("ck_auth_mfa_factors_status_reason_not_blank", "status_reason IS NULL OR length(btrim(status_reason)) > 0");
                    table.CheckConstraint("ck_auth_mfa_factors_totp_digits", "totp_digits IS NULL OR totp_digits BETWEEN 6 AND 8");
                    table.CheckConstraint("ck_auth_mfa_factors_totp_encrypted_payload_not_blank", "totp_encrypted_secret_payload IS NULL OR length(btrim(totp_encrypted_secret_payload)) > 0");
                    table.CheckConstraint("ck_auth_mfa_factors_totp_period_seconds", "totp_period_seconds IS NULL OR totp_period_seconds BETWEEN 15 AND 120");
                    table.CheckConstraint("ck_auth_mfa_factors_totp_secret_reference_not_blank", "totp_protected_secret_reference IS NULL OR length(btrim(totp_protected_secret_reference)) > 0");
                    table.ForeignKey(
                        name: "fk_auth_mfa_factors_auth_accounts",
                        column: x => x.auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_mfa_factors_status_actor",
                        column: x => x.last_status_changed_by_auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "auth_passkey_credentials",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    credential_id_hash = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    public_key_cose = table.Column<string>(type: "character varying(8192)", maxLength: 8192, nullable: false),
                    user_handle_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    signature_counter = table.Column<long>(type: "bigint", nullable: true),
                    backup_eligible = table.Column<bool>(type: "boolean", nullable: false),
                    backup_state = table.Column<bool>(type: "boolean", nullable: false),
                    transports = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    attestation_policy_result = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    display_label = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    enrolled_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_used_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    disabled_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_replay_suspected_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    status_reason = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    last_status_changed_by_auth_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    last_status_change_correlation_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_passkey_credentials", x => x.id);
                    table.CheckConstraint("ck_auth_passkey_credentials_credential_hash_not_blank", "length(btrim(credential_id_hash)) > 0");
                    table.CheckConstraint("ck_auth_passkey_credentials_last_status_correlation_not_blank", "last_status_change_correlation_id IS NULL OR length(btrim(last_status_change_correlation_id)) > 0");
                    table.CheckConstraint("ck_auth_passkey_credentials_public_key_not_blank", "length(btrim(public_key_cose)) > 0");
                    table.CheckConstraint("ck_auth_passkey_credentials_status", "status IN ('pending', 'enrolled', 'disabled', 'revoked')");
                    table.CheckConstraint("ck_auth_passkey_credentials_status_reason_not_blank", "status_reason IS NULL OR length(btrim(status_reason)) > 0");
                    table.CheckConstraint("ck_auth_passkey_credentials_user_handle_hash_not_blank", "user_handle_hash IS NULL OR length(btrim(user_handle_hash)) > 0");
                    table.ForeignKey(
                        name: "fk_auth_passkey_credentials_auth_accounts",
                        column: x => x.auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_passkey_credentials_status_actor",
                        column: x => x.last_status_changed_by_auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "auth_recovery_code_batches",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    policy_version = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    total_generated_count = table.Column<int>(type: "integer", nullable: false),
                    remaining_unused_count = table.Column<int>(type: "integer", nullable: false),
                    used_count = table.Column<int>(type: "integer", nullable: false),
                    generated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    displayed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    last_used_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    replaced_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    status_reason = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    created_by_auth_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_correlation_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_recovery_code_batches", x => x.id);
                    table.CheckConstraint("ck_auth_recovery_code_batches_counts", "total_generated_count >= 0 AND remaining_unused_count >= 0 AND used_count >= 0 AND remaining_unused_count + used_count <= total_generated_count");
                    table.CheckConstraint("ck_auth_recovery_code_batches_created_correlation_not_blank", "created_correlation_id IS NULL OR length(btrim(created_correlation_id)) > 0");
                    table.CheckConstraint("ck_auth_recovery_code_batches_status", "status IN ('active', 'replaced', 'revoked', 'expired')");
                    table.CheckConstraint("ck_auth_recovery_code_batches_status_reason_not_blank", "status_reason IS NULL OR length(btrim(status_reason)) > 0");
                    table.ForeignKey(
                        name: "fk_auth_recovery_code_batches_auth_accounts",
                        column: x => x.auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_recovery_code_batches_created_by",
                        column: x => x.created_by_auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "auth_security_policies",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    policy_version = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    passkey_support_mode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    totp_support_mode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    recovery_code_support_mode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    owner_admin_mfa_mode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    user_mfa_mode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    challenge_expiry_seconds = table.Column<int>(type: "integer", nullable: false),
                    challenge_max_attempt_count = table.Column<int>(type: "integer", nullable: false),
                    recovery_code_count = table.Column<int>(type: "integer", nullable: false),
                    recovery_code_minimum_remaining_warning_count = table.Column<int>(type: "integer", nullable: false),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    effective_from_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    retired_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    changed_by_auth_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    change_reason_category = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    change_correlation_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_security_policies", x => x.id);
                    table.CheckConstraint("ck_auth_security_policies_change_correlation_not_blank", "change_correlation_id IS NULL OR length(btrim(change_correlation_id)) > 0");
                    table.CheckConstraint("ck_auth_security_policies_change_reason_not_blank", "change_reason_category IS NULL OR length(btrim(change_reason_category)) > 0");
                    table.CheckConstraint("ck_auth_security_policies_enforcement_modes", "owner_admin_mfa_mode IN ('optional', 'blocking_warning', 'required') AND user_mfa_mode IN ('optional', 'blocking_warning', 'required')");
                    table.CheckConstraint("ck_auth_security_policies_positive_limits", "policy_version > 0 AND challenge_expiry_seconds > 0 AND challenge_max_attempt_count > 0 AND recovery_code_count >= 0 AND recovery_code_minimum_remaining_warning_count >= 0");
                    table.CheckConstraint("ck_auth_security_policies_status", "status IN ('draft', 'active', 'retired')");
                    table.CheckConstraint("ck_auth_security_policies_support_modes", "passkey_support_mode IN ('disabled', 'optional', 'required_for_admins', 'required_for_all_users', 'policy_pending_enrollment') AND totp_support_mode IN ('disabled', 'optional', 'required_for_admins', 'required_for_all_users', 'policy_pending_enrollment') AND recovery_code_support_mode IN ('disabled', 'optional', 'required_for_admins', 'required_for_all_users', 'policy_pending_enrollment')");
                    table.ForeignKey(
                        name: "fk_auth_security_policies_changed_by",
                        column: x => x.changed_by_auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "auth_challenges",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    auth_session_id = table.Column<Guid>(type: "uuid", nullable: true),
                    auth_mfa_factor_id = table.Column<Guid>(type: "uuid", nullable: true),
                    auth_passkey_credential_id = table.Column<Guid>(type: "uuid", nullable: true),
                    purpose = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    factor_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    challenge_verifier_hash = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    challenge_verifier_algorithm = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    bound_rp_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    bound_origin = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    request_context_hash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    correlation_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    attempt_count = table.Column<int>(type: "integer", nullable: false),
                    max_attempt_count = table.Column<int>(type: "integer", nullable: false),
                    failure_category = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    consumed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    failed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    blocked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    replay_detected_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_challenges", x => x.id);
                    table.CheckConstraint("ck_auth_challenges_attempt_counts", "attempt_count >= 0 AND max_attempt_count >= 0 AND attempt_count <= max_attempt_count");
                    table.CheckConstraint("ck_auth_challenges_bound_origin_not_blank", "bound_origin IS NULL OR length(btrim(bound_origin)) > 0");
                    table.CheckConstraint("ck_auth_challenges_bound_rp_id_not_blank", "bound_rp_id IS NULL OR length(btrim(bound_rp_id)) > 0");
                    table.CheckConstraint("ck_auth_challenges_expiry_after_created", "expires_at_utc > created_at_utc");
                    table.CheckConstraint("ck_auth_challenges_factor_type", "factor_type IN ('passkey', 'totp', 'recovery_code', 'mfa')");
                    table.CheckConstraint("ck_auth_challenges_failure_category_not_blank", "failure_category IS NULL OR length(btrim(failure_category)) > 0");
                    table.CheckConstraint("ck_auth_challenges_purpose", "purpose IN ('passkey_enrollment', 'passkey_sign_in', 'passkey_step_up', 'totp_enrollment', 'sign_in', 'step_up', 'recovery')");
                    table.CheckConstraint("ck_auth_challenges_status", "status IN ('pending', 'consumed', 'verified', 'expired', 'failed', 'blocked', 'cancelled', 'replay_detected')");
                    table.CheckConstraint("ck_auth_challenges_verifier_hash_not_blank", "length(btrim(challenge_verifier_hash)) > 0");
                    table.ForeignKey(
                        name: "fk_auth_challenges_auth_accounts",
                        column: x => x.auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_challenges_auth_mfa_factors",
                        column: x => x.auth_mfa_factor_id,
                        principalTable: "auth_mfa_factors",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_challenges_auth_passkey_credentials",
                        column: x => x.auth_passkey_credential_id,
                        principalTable: "auth_passkey_credentials",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_challenges_auth_sessions",
                        column: x => x.auth_session_id,
                        principalTable: "auth_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "auth_recovery_code_verifiers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_recovery_code_batch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    auth_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    verifier_hash = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    verifier_salt = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    verifier_algorithm = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    verifier_parameters = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    generated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    consumed_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    replaced_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    consumed_by_auth_challenge_id = table.Column<Guid>(type: "uuid", nullable: true),
                    use_correlation_id = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_recovery_code_verifiers", x => x.id);
                    table.CheckConstraint("ck_auth_recovery_code_verifiers_algorithm_not_blank", "length(btrim(verifier_algorithm)) > 0");
                    table.CheckConstraint("ck_auth_recovery_code_verifiers_hash_not_blank", "length(btrim(verifier_hash)) > 0");
                    table.CheckConstraint("ck_auth_recovery_code_verifiers_parameters_not_blank", "length(btrim(verifier_parameters)) > 0");
                    table.CheckConstraint("ck_auth_recovery_code_verifiers_salt_not_blank", "length(btrim(verifier_salt)) > 0");
                    table.CheckConstraint("ck_auth_recovery_code_verifiers_status", "status IN ('unused', 'consumed', 'revoked', 'replaced', 'expired')");
                    table.CheckConstraint("ck_auth_recovery_code_verifiers_use_correlation_not_blank", "use_correlation_id IS NULL OR length(btrim(use_correlation_id)) > 0");
                    table.ForeignKey(
                        name: "fk_auth_recovery_code_verifiers_auth_accounts",
                        column: x => x.auth_account_id,
                        principalTable: "auth_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_recovery_code_verifiers_batches",
                        column: x => x.auth_recovery_code_batch_id,
                        principalTable: "auth_recovery_code_batches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auth_recovery_code_verifiers_consumed_challenge",
                        column: x => x.consumed_by_auth_challenge_id,
                        principalTable: "auth_challenges",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_auth_challenges_auth_account_id",
                table: "auth_challenges",
                column: "auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_challenges_auth_mfa_factor_id",
                table: "auth_challenges",
                column: "auth_mfa_factor_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_challenges_auth_passkey_credential_id",
                table: "auth_challenges",
                column: "auth_passkey_credential_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_challenges_auth_session_id",
                table: "auth_challenges",
                column: "auth_session_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_challenges_expires_at_utc",
                table: "auth_challenges",
                column: "expires_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_auth_challenges_purpose_status_expires",
                table: "auth_challenges",
                columns: new[] { "purpose", "status", "expires_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_auth_mfa_factors_account_type_status",
                table: "auth_mfa_factors",
                columns: new[] { "auth_account_id", "factor_type", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_auth_mfa_factors_auth_account_id",
                table: "auth_mfa_factors",
                column: "auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_mfa_factors_expires_at_utc",
                table: "auth_mfa_factors",
                column: "expires_at_utc");

            migrationBuilder.CreateIndex(
                name: "ix_auth_mfa_factors_status_actor_id",
                table: "auth_mfa_factors",
                column: "last_status_changed_by_auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_passkey_credentials_account_status",
                table: "auth_passkey_credentials",
                columns: new[] { "auth_account_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_auth_passkey_credentials_auth_account_id",
                table: "auth_passkey_credentials",
                column: "auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_passkey_credentials_status_actor_id",
                table: "auth_passkey_credentials",
                column: "last_status_changed_by_auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ux_auth_passkey_credentials_credential_id_hash",
                table: "auth_passkey_credentials",
                column: "credential_id_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_auth_recovery_code_batches_account_status",
                table: "auth_recovery_code_batches",
                columns: new[] { "auth_account_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_auth_recovery_code_batches_auth_account_id",
                table: "auth_recovery_code_batches",
                column: "auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_recovery_code_batches_created_by_id",
                table: "auth_recovery_code_batches",
                column: "created_by_auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_recovery_code_verifiers_auth_account_id",
                table: "auth_recovery_code_verifiers",
                column: "auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_recovery_code_verifiers_batch_id",
                table: "auth_recovery_code_verifiers",
                column: "auth_recovery_code_batch_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_recovery_code_verifiers_batch_status",
                table: "auth_recovery_code_verifiers",
                columns: new[] { "auth_recovery_code_batch_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_auth_recovery_code_verifiers_consumed_challenge_id",
                table: "auth_recovery_code_verifiers",
                column: "consumed_by_auth_challenge_id");

            migrationBuilder.CreateIndex(
                name: "ux_auth_recovery_code_verifiers_hash",
                table: "auth_recovery_code_verifiers",
                column: "verifier_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_auth_security_policies_changed_by_id",
                table: "auth_security_policies",
                column: "changed_by_auth_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_auth_security_policies_effective_from_utc",
                table: "auth_security_policies",
                column: "effective_from_utc");

            migrationBuilder.CreateIndex(
                name: "ix_auth_security_policies_status",
                table: "auth_security_policies",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "ux_auth_security_policies_policy_version",
                table: "auth_security_policies",
                column: "policy_version",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "auth_recovery_code_verifiers");

            migrationBuilder.DropTable(
                name: "auth_security_policies");

            migrationBuilder.DropTable(
                name: "auth_recovery_code_batches");

            migrationBuilder.DropTable(
                name: "auth_challenges");

            migrationBuilder.DropTable(
                name: "auth_mfa_factors");

            migrationBuilder.DropTable(
                name: "auth_passkey_credentials");
        }
    }
}
