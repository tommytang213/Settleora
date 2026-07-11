param(
  [string]$SshTarget = $env:SETTLEORA_DEVBOX_SSH_TARGET,
  [Parameter(Mandatory = $true)][string]$RunId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SshTarget)) {
  throw "SshTarget is required. Set SETTLEORA_DEVBOX_SSH_TARGET or pass -SshTarget."
}
if ($RunId -notmatch '^supervised-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$') {
  throw "RunId is invalid."
}

$remoteRepo = "/workspace/repos/Settleora"
$remoteArgs = @(
  "cd", $remoteRepo, "&&",
  "node", "tools/auto-runner/settleora-auto-runnerctl.mjs",
  "stop-after-current",
  "--run", $RunId,
  "--json"
)
$json = & ssh.exe $SshTarget -- $remoteArgs
if ($LASTEXITCODE -ne 0) { throw "Remote stop-after-current failed with exit code $LASTEXITCODE." }
$json | ConvertFrom-Json
