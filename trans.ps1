param(
  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$Args
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
node "$ScriptDir/trans.mjs" @Args
