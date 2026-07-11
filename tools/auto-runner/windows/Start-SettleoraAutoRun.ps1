param(
  [string]$SshTarget = $env:SETTLEORA_DEVBOX_SSH_TARGET,
  [int]$MaxTasks = 1,
  [string]$MaxRuntime = "3h",
  [string]$Profile = "default"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SshTarget)) {
  throw "SshTarget is required. Set SETTLEORA_DEVBOX_SSH_TARGET or pass -SshTarget."
}
if ($MaxTasks -lt 1 -or $MaxTasks -gt 500) {
  throw "MaxTasks must be in the range 1..500."
}
if ($MaxRuntime -notmatch '^\d+(m|h|d)$') {
  throw "MaxRuntime must use bounded duration syntax such as 3h, 8h, or 1d."
}
if ($Profile -notmatch '^[A-Za-z0-9_.-]{1,64}$') {
  throw "Profile contains unsupported characters."
}

$remoteRepo = "/workspace/repos/Settleora"
$remoteArgs = @(
  "cd", $remoteRepo, "&&",
  "node", "tools/auto-runner/settleora-auto-runnerctl.mjs",
  "submit",
  "--profile", $Profile,
  "--max-tasks", "$MaxTasks",
  "--max-runtime", $MaxRuntime,
  "--json"
)

$json = & ssh.exe $SshTarget -- $remoteArgs
if ($LASTEXITCODE -ne 0) {
  throw "Remote supervisor submit failed with exit code $LASTEXITCODE."
}

$result = $json | ConvertFrom-Json
if (-not $result.ok) {
  throw "Remote supervisor submit was not accepted: $($result.state)"
}

$result
