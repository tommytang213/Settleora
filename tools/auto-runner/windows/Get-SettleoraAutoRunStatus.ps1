param(
  [string]$SshTarget = $env:SETTLEORA_DEVBOX_SSH_TARGET,
  [string]$RunId,
  [switch]$Latest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SshTarget)) {
  throw "SshTarget is required. Set SETTLEORA_DEVBOX_SSH_TARGET or pass -SshTarget."
}
if (-not $Latest -and $RunId -notmatch '^supervised-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$') {
  throw "Pass -Latest or a valid supervisor RunId."
}

$remoteRepo = "/workspace/repos/Settleora"
$selector = if ($Latest) { @("--latest") } else { @("--run", $RunId) }
$remoteArgs = @("cd", $remoteRepo, "&&", "node", "tools/auto-runner/settleora-auto-runnerctl.mjs", "status") + $selector + @("--json")
$json = & ssh.exe $SshTarget -- $remoteArgs
if ($LASTEXITCODE -ne 0) { throw "Remote status failed with exit code $LASTEXITCODE." }
$json | ConvertFrom-Json
