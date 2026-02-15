param(
  [string]$TaskName = "DiscordTransBot",
  [string]$RepoPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoPath)) {
  $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

if (-not (Test-Path (Join-Path $RepoPath "trans.cmd"))) {
  throw "trans.cmd not found in repo path: $RepoPath"
}

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c cd /d `"$RepoPath`" && trans.cmd start"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive -RunLevel LeastPrivilege
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Autostart Discord Translation Bot via trans.cmd start"

Start-ScheduledTask -TaskName $TaskName

Write-Host "Created scheduled task: $TaskName"
Write-Host "Repo path: $RepoPath"
Write-Host "Use this to verify:"
Write-Host "  schtasks /Query /TN `"$TaskName`" /V /FO LIST"
