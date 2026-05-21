# sync-migrations.ps1
# Copy SQL files from backend/db/v3-migrations/ into supabase/migrations/
# with the timestamp-prefixed names the Supabase CLI expects.
#
# Supabase migration filenames must match: <14-digit-timestamp>_<name>.sql
# We map our numeric prefix (001, 002, 010, ...) to ascending timestamps
# starting from 2026-01-01 00:00:00 so the CLI applies them in the same
# order as our README run-order.
#
# Usage:
#   pwsh ./supabase/sync-migrations.ps1

$ErrorActionPreference = "Stop"

$repoRoot   = Resolve-Path "$PSScriptRoot/.."
$src        = Join-Path $repoRoot "backend/db/v3-migrations"
$dst        = Join-Path $repoRoot "supabase/migrations"

if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }

# Wipe existing CLI-format migrations
Get-ChildItem $dst -Filter "*.sql" | Remove-Item -Force

# Walk sources in their natural prefix order; emit timestamps with 1-minute gaps
$base = Get-Date -Year 2026 -Month 1 -Day 1 -Hour 0 -Minute 0 -Second 0
$idx = 0

Get-ChildItem $src -Filter "*.sql" |
  Sort-Object Name |
  ForEach-Object {
    $ts   = $base.AddMinutes($idx).ToString("yyyyMMddHHmmss")
    $name = $_.Name -replace '^\d+_', ''        # strip our "010_" / "032_" / ... prefix
    $dest = Join-Path $dst "${ts}_${name}"
    Copy-Item $_.FullName $dest -Force
    Write-Host ("  {0} -> {1}" -f $_.Name, (Split-Path $dest -Leaf))
    $idx++
  }

Write-Host ""
Write-Host ("Synced {0} migration files to {1}" -f $idx, $dst) -ForegroundColor Green
