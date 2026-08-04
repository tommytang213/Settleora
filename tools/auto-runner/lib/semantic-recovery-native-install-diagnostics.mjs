const rootFailureReasons = [
  "native_install_root_authority_drift",
  "native_install_root_authority_evidence_refused",
  "native_install_root_authority_reader_blocked",
  "native_install_root_authority_reader_failed",
  "native_install_root_authority_reader_process_unavailable",
  "native_install_root_authority_reader_stderr_refused",
  "native_install_root_authority_reader_timeout",
  "native_install_root_github_pagination_unsupported",
  "native_install_root_github_process_failed",
  "native_install_root_github_process_unavailable",
  "native_install_root_github_rate_budget_refused",
  "native_install_root_github_request_invalid",
  "native_install_root_github_response_oversized",
  "native_install_root_github_response_refused",
  "native_install_root_github_route_invalid",
  "native_install_root_github_stderr_refused",
  "native_install_root_github_timeout",
  "native_install_root_independent_reader_mismatch",
  "native_install_root_operation_blocked",
  "native_install_root_persisted_package_mismatch",
  "native_install_root_plan_derivation_blocked",
  "native_install_root_protected_publication_helper_blocked",
  "native_install_root_publication_authority_drift",
  "native_install_root_publication_blocked",
  "native_install_root_result_completion_failed",
  "native_install_root_result_publication_failed",
  "native_install_root_result_readback_failed",
  "native_install_root_source_authentication_blocked",
];

export const nativeInstallRootFailureReasonCodes = Object.freeze([...rootFailureReasons]);
const rootFailureReasonSet = new Set(nativeInstallRootFailureReasonCodes);

export function isNativeInstallRootFailureReasonCode(value) {
  return typeof value === "string" && rootFailureReasonSet.has(value);
}

export function classifyNativeInstallRootFailure(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (isNativeInstallRootFailureReasonCode(message)) return message;
  const exact = new Map([
    ["semantic_native_public_github_rate_budget_refused", "native_install_root_github_rate_budget_refused"],
    ["semantic_native_public_github_response_refused", "native_install_root_github_response_refused"],
    ["semantic_native_public_github_response_oversized", "native_install_root_github_response_oversized"],
    ["semantic_native_public_github_request_invalid", "native_install_root_github_request_invalid"],
    ["semantic_native_public_github_route_invalid", "native_install_root_github_route_invalid"],
    ["semantic_native_public_github_timeout", "native_install_root_github_timeout"],
    ["semantic_native_public_github_process_unavailable", "native_install_root_github_process_unavailable"],
    ["semantic_native_public_github_process_failed", "native_install_root_github_process_failed"],
    ["semantic_native_public_github_stderr_refused", "native_install_root_github_stderr_refused"],
    ["semantic native public GitHub paginated snapshot unsupported", "native_install_root_github_pagination_unsupported"],
    ["semantic native authority changed between independent reads", "native_install_root_authority_drift"],
    ["native install independent planner/verifier mismatch", "native_install_root_independent_reader_mismatch"],
    ["native install persisted package no longer corroborated", "native_install_root_persisted_package_mismatch"],
    ["native install final source authority changed at publication edge", "native_install_root_publication_authority_drift"],
    ["native install source authority reader blocked", "native_install_root_authority_reader_blocked"],
    ["native install rename_noreplace helper blocked", "native_install_root_protected_publication_helper_blocked"],
    ["native install root result readback failed", "native_install_root_result_readback_failed"],
    ["native install root result no-clobber publication failed", "native_install_root_result_publication_failed"],
    ["native install root result no-clobber readback failed", "native_install_root_result_readback_failed"],
    ["native install root result no-clobber completion failed", "native_install_root_result_completion_failed"],
  ]);
  if (exact.has(message)) return exact.get(message);
  if (message.startsWith("semantic extraction ") || message.startsWith("semantic recovery ")) {
    return "native_install_root_authority_evidence_refused";
  }
  if (message.startsWith("semantic native ")) return "native_install_root_plan_derivation_blocked";
  if (message.startsWith("native install Git ") || message.startsWith("native install authenticated ")
      || message.startsWith("native install materialized ") || message.startsWith("native install repository ")) {
    return "native_install_root_source_authentication_blocked";
  }
  if (message.includes("publication")) return "native_install_root_publication_blocked";
  return "native_install_root_operation_blocked";
}

export function classifyNativeInstallRootReaderProcess(child) {
  if (child?.error?.code === "ETIMEDOUT") return "native_install_root_authority_reader_timeout";
  if (!child || child.error || child.signal) return "native_install_root_authority_reader_process_unavailable";
  const stderr = typeof child.stderr === "string" && Buffer.byteLength(child.stderr) <= 64 * 1024 ? child.stderr : "";
  const match = /^native installation blocked: ([a-z0-9_]+)\n$/u.exec(stderr);
  if (match && isNativeInstallRootFailureReasonCode(match[1])) return match[1];
  if (child.status !== 0) return "native_install_root_authority_reader_failed";
  if (stderr !== "") return "native_install_root_authority_reader_stderr_refused";
  return null;
}
