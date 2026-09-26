# Build a playable Windows copy of the game into unreal\Build\Windows\TarantulaUE.exe (Blueprint-only: no Visual Studio needed)
#   powershell -ExecutionPolicy Bypass -File unreal\tools\package.ps1
# UE 5.8 bug: staging crashes on the FileOpenOrder logs the cook writes, so: cook -> move those logs away -> stage/pak/archive
$ErrorActionPreference = 'Stop'
$ue = 'C:\Program Files\Epic Games\UE_5.8'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$proj = Join-Path $root 'unreal\TarantulaUE\TarantulaUE.uproject'
$out = Join-Path $root 'unreal\Build'
$uat = Join-Path $ue 'Engine\Build\BatchFiles\RunUAT.bat'
$common = @('BuildCookRun', "-project=$proj", '-noP4', '-platform=Win64', '-clientconfig=Shipping', '-installed', '-nocompile',
            '-nocompileeditor', '-nocompileuat', '-unrealexe=UnrealEditor-Cmd.exe', '-unattended', '-utf8output')
New-Item -ItemType Directory -Force $out | Out-Null
& $uat @common -cook *> (Join-Path $out 'cook.log')
if ($LASTEXITCODE -ne 0) { Write-Host "cook failed - see $out\cook.log"; exit 1 }
$order = Join-Path $root 'unreal\TarantulaUE\Build\Windows\FileOpenOrder'
if (Test-Path $order) { Remove-Item (Join-Path $order '*.log') -Force }
& $uat @common -skipcook -stage -pak -compressed -archive "-archivedirectory=$out" *> (Join-Path $out 'package.log')
if ($LASTEXITCODE -ne 0) { Write-Host "packaging failed - see $out\package.log"; exit 1 }
Write-Host "done: $out\Windows\TarantulaUE.exe"
