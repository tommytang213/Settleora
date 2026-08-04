import {
  isNativeInstallRootFailureReasonCode,
  nativeInstallRootFailureReasonCodes,
} from "./semantic-recovery-native-install-diagnostics.mjs";

const reasonPattern = /^[a-z0-9][a-z0-9_]{2,127}$/u;

export const nativeInstallHandoffControllerReasons = Object.freeze({
  prepare: Object.freeze(["native_install_awaiting_fixed_root_bootstrap_handoff"]),
  arm: Object.freeze([
    "native_install_interactive_handoff_completed",
    "native_install_interactive_handoff_requires_readback",
  ]),
  resume: Object.freeze([
    "native_install_result_requires_readback",
    "native_install_root_result_blocked",
    "native_install_root_result_requires_recovery",
  ]),
});

export function decideNativeInstallHandoffControllerStep({ mode, result } = {}) {
  if (!Object.hasOwn(nativeInstallHandoffControllerReasons, mode)
      || !result || typeof result !== "object" || Array.isArray(result)
      || !reasonPattern.test(String(result.reasonCode || ""))) {
    throw new Error("native install handoff controller output invalid");
  }
  if (!nativeInstallHandoffControllerReasons[mode].includes(result.reasonCode)) {
    throw new Error("native install handoff controller reason mismatch");
  }
  if (mode === "prepare") {
    return Object.freeze({ action: "arm_interactive_sudo_once", sudoAllowed: true, terminal: false });
  }
  if (mode === "arm") {
    if (result.sudoAttemptCount !== 1) throw new Error("native install handoff sudo attempt identity invalid");
    return Object.freeze({ action: "resume_readback_only", sudoAllowed: false, terminal: false });
  }
  if (result.sudoAttemptCount !== 1) throw new Error("native install handoff sudo attempt identity invalid");
  if (result.reasonCode === "native_install_result_requires_readback") {
    return Object.freeze({ action: "validate_installed_readback", sudoAllowed: false, terminal: false });
  }
  if (!isNativeInstallRootFailureReasonCode(result.rootFailureReasonCode)) {
    throw new Error("native install handoff root failure reason invalid");
  }
  return Object.freeze({
    action: result.reasonCode === "native_install_root_result_requires_recovery" ? "manual_recovery_gate" : "block",
    sudoAllowed: false,
    terminal: true,
    rootFailureReasonCode: result.rootFailureReasonCode,
  });
}

export function renderNativeInstallWindowsSshCoordinatorSource() {
  return String.raw`function New-SshProcessStartInfo {
    param(
        [Parameter(Mandatory = $true)][psobject]$TrustedLocations,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][bool]$CaptureOutput
    )
    foreach ($argument in $Arguments) { Assert-SafeAsciiScalar $argument }
    $info = [Activator]::CreateInstance([Diagnostics.ProcessStartInfo])
    $info.FileName = $TrustedLocations.SshExecutable
    $info.Arguments = [string]::Join(' ', $Arguments)
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $false
    $info.RedirectStandardInput = $false
    $info.RedirectStandardOutput = $CaptureOutput
    $info.RedirectStandardError = $CaptureOutput
    $userProfile = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
    $temporary = [IO.Path]::GetTempPath().TrimEnd('\')
    $programData = [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonApplicationData)
    if ([string]::IsNullOrWhiteSpace($userProfile) -or [string]::IsNullOrWhiteSpace($temporary) -or [string]::IsNullOrWhiteSpace($programData)) {
        throw 'ssh_environment_path_unavailable'
    }
    $programData = ConvertTo-CanonicalTrustedDrivePath $programData 'ssh_programdata'
    Assert-CanonicalDirectoryComponent $programData 'ssh_programdata'
    $info.EnvironmentVariables.Clear()
    $info.EnvironmentVariables['SystemRoot'] = $TrustedLocations.WindowsRoot
    $info.EnvironmentVariables['WINDIR'] = $TrustedLocations.WindowsRoot
    $info.EnvironmentVariables['USERPROFILE'] = $userProfile
    $info.EnvironmentVariables['HOME'] = $userProfile
    $info.EnvironmentVariables['TEMP'] = $temporary
    $info.EnvironmentVariables['TMP'] = $temporary
    $info.EnvironmentVariables['ProgramData'] = $programData
    $info.EnvironmentVariables['PATH'] = ($TrustedLocations.OpenSshDirectory + ';' + $TrustedLocations.SystemDirectory + ';' + $TrustedLocations.WindowsRoot)
    return $info
}

function Start-SshPreflightProcess {
    param([Parameter(Mandatory = $true)][Diagnostics.Process]$Process)
    $Process.StartInfo.RedirectStandardInput = $true
    if (-not $Process.Start()) { throw 'preflight_process_start_failed' }
    $Process.StandardInput.Close()
}

function Assert-SshExecuteRemainsInteractive {
    param([Parameter(Mandatory = $true)][Diagnostics.Process]$Process)
    if ($Process.StartInfo.RedirectStandardInput) { throw 'execute_stdin_must_remain_interactive' }
}`;
}

export function renderNativeInstallRemoteControllerFlowSource() {
  const rootFailureCase = nativeInstallRootFailureReasonCodes.join("|");
  return String.raw`persist_bounded_root_failure() {
  local value="$1" root_reason
  root_reason=$(/usr/bin/printf '%s\n' "$value" | /usr/bin/jq -er .rootFailureReasonCode) || fail controller_output_root_failure_invalid
  case "$root_reason" in
    ${rootFailureCase}) ;;
    *) fail controller_output_root_failure_invalid ;;
  esac
  [ "$(/usr/bin/printf '%s\n' "$value" | /usr/bin/jq -er .sudoAttemptCount)" = 1 ] || fail controller_output_sudo_attempt_mismatch
  FAILURE_REASON="$root_reason"
  persist_result BLOCKED "$FAILURE_REASON" "$admin_outcome" "$resume_reason" false
}

prepare_status=0
prepare_result=$(run_immutable_controller --prepare 2>&1) || prepare_status=$?
verify_all_held_locks
if [ "$prepare_status" -ne 0 ]; then FAILURE_REASON=source_prepare_failed; persist_result BLOCKED "$FAILURE_REASON" "$admin_outcome" not_started false; return 1; fi
LAST_PROTECTED_OUTCOME='prepare_completed_output_unverified'
validate_controller_json "$prepare_result" native_install_awaiting_fixed_root_bootstrap_handoff
LAST_PROTECTED_OUTCOME='awaiting_interactive_sudo'
absence_gate_pre_arm
verify_all_held_locks

arm_status=0
arm_result=$(run_immutable_controller --arm-interactive-sudo 2>&1) || arm_status=$?
verify_all_held_locks
if [ "$arm_status" -ne 0 ]; then FAILURE_REASON=source_arm_failed_or_cancelled; persist_result BLOCKED "$FAILURE_REASON" "$admin_outcome" ambiguous false; return 1; fi
LAST_PROTECTED_OUTCOME='arm_completed_output_unverified'
arm_reason=$(/usr/bin/printf '%s\n' "$arm_result" | /usr/bin/jq -er .reasonCode) || fail controller_output_invalid
case "$arm_reason" in
  native_install_interactive_handoff_completed|native_install_interactive_handoff_requires_readback) ;;
  *) fail controller_output_reason_mismatch ;;
esac
validate_controller_json "$arm_result" "$arm_reason"
[ "$(/usr/bin/printf '%s\n' "$arm_result" | /usr/bin/jq -er .sudoAttemptCount)" = 1 ] || fail controller_output_sudo_attempt_mismatch
LAST_PROTECTED_OUTCOME='awaiting_readback_only_resume'

# Both accepted arm outcomes continue through readback-only resume. Never invoke
# --arm-interactive-sudo or sudo a second time after sudoAttemptCount reaches 1.
resume_status=0
resume_result=$(run_immutable_controller --resume 2>&1) || resume_status=$?
verify_all_held_locks
if [ "$resume_status" -ne 0 ]; then FAILURE_REASON=source_resume_failed; persist_result BLOCKED "$FAILURE_REASON" "$admin_outcome" ambiguous false; return 1; fi
LAST_PROTECTED_OUTCOME='resume_completed_output_unverified'
resume_reason=$(/usr/bin/printf '%s\n' "$resume_result" | /usr/bin/jq -er .reasonCode) || fail controller_output_invalid
case "$resume_reason" in
  native_install_result_requires_readback)
    validate_controller_json "$resume_result" "$resume_reason"
    [ "$(/usr/bin/printf '%s\n' "$resume_result" | /usr/bin/jq -er .sudoAttemptCount)" = 1 ] || fail controller_output_sudo_attempt_mismatch
    LAST_PROTECTED_OUTCOME='installed'
    validate_installed_readback
    ;;
  native_install_root_result_blocked|native_install_root_result_requires_recovery)
    validate_controller_json "$resume_result" "$resume_reason"
    [ "$(/usr/bin/printf '%s\n' "$resume_result" | /usr/bin/jq -er .sudoAttemptCount)" = 1 ] || fail controller_output_sudo_attempt_mismatch
    persist_bounded_root_failure "$resume_result"
    return 1
    ;;
  *) fail controller_output_reason_mismatch ;;
esac
verify_all_held_locks`;
}
