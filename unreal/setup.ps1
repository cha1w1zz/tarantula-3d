# บึ้งไทย 3D → Unreal: ติดตั้งทุกอย่างในครั้งเดียว (Windows)
# วิธีใช้: เปิด PowerShell แล้ววางบรรทัดนี้
#   irm https://raw.githubusercontent.com/cha1w1zz/tarantula-3d/claude/affectionate-allen-nu113x/unreal/setup.ps1 -OutFile $env:TEMP\t3d.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\t3d.ps1
# ทำให้: Git → Claude Code → โหลดเกมมาไว้ที่ %USERPROFILE%\tarantula-3d → ปลั๊กอิน Unreal MCP ของ Claude → เปิด Unreal + Claude

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Repo   = 'https://github.com/cha1w1zz/tarantula-3d.git'
$Branch = 'claude/affectionate-allen-nu113x'
$Dir    = Join-Path $env:USERPROFILE 'tarantula-3d'

function Step($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "  OK $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  ! $t" -ForegroundColor Yellow }
function RefreshPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
              (Join-Path $env:USERPROFILE '.local\bin')
}

Step '1/5 Git'
if (Get-Command git -ErrorAction SilentlyContinue) { Ok 'มีอยู่แล้ว' }
else {
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
  RefreshPath
  if (Get-Command git -ErrorAction SilentlyContinue) { Ok 'ลงเสร็จ' } else { Warn 'ลง Git ไม่สำเร็จ: โหลดเองที่ https://git-scm.com แล้วรันสคริปต์นี้ใหม่'; return }
}

Step '2/5 Claude Code'
if (Get-Command claude -ErrorAction SilentlyContinue) { Ok 'มีอยู่แล้ว' }
else {
  Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
  RefreshPath
  if (Get-Command claude -ErrorAction SilentlyContinue) { Ok 'ลงเสร็จ' } else { Warn 'ลง Claude Code ไม่สำเร็จ: ปิด/เปิด PowerShell ใหม่แล้วรันสคริปต์นี้อีกครั้ง'; return }
}

Step '3/5 โหลดเกมบึ้งไทย 3D'
if (Test-Path (Join-Path $Dir '.git')) {
  git -C $Dir fetch origin $Branch; git -C $Dir checkout $Branch; git -C $Dir pull --ff-only origin $Branch
} else { git clone -b $Branch $Repo $Dir }
if (Test-Path (Join-Path $Dir 'unreal\TarantulaUE\TarantulaUE.uproject')) { Ok $Dir } else { Warn 'โหลดไม่สำเร็จ'; return }

Step '4/5 ปลั๊กอิน Unreal MCP ของ Claude (จาก Epic)'
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin install unreal-engine-skills-for-claude-code@claude-plugins-official
if ($LASTEXITCODE -eq 0) { Ok 'ติดตั้งแล้ว' } else { Warn 'ติดตั้งอัตโนมัติไม่ได้ — Claude จะช่วยลงให้ตอนเปิด' }

Step '5/5 เปิด Unreal + เกม + Claude'
Start-Process (Join-Path $Dir 'unreal\TarantulaUE\TarantulaUE.uproject')
Start-Process (Join-Path $Dir 'index.html')
Ok 'Unreal กำลังเปิด (ครั้งแรกอาจนาน 5-15 นาที) · ในเกมกด ⚙ → 📦 ส่งออกไป Unreal'
Set-Location $Dir
claude 'Read CLAUDE.md and unreal/README.md first. Task: keep porting this game to Unreal Engine. 1) If /mcp has no unreal-mcp, run: claude plugin install unreal-engine-skills-for-claude-code@claude-plugins-official, then tell me to restart claude. 2) Wait for the Unreal editor to finish opening, then test by listing the actors in the level. 3) Continue with the next step of the plan in unreal/README.md. Always answer me in short, simple Thai.'
