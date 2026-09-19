$ErrorActionPreference = 'Stop'
$proj = 'C:\Users\Techenzo\Desktop\mentor-platform'
$root = 'C:\Users\Techenzo\pgsql'
New-Item -ItemType Directory -Force -Path $root | Out-Null

# 1. Move downloaded jar and extract the inner .txz (jar = zip, txz = xz'd tar) via Python
if (Test-Path "$proj\pg-zonky.jar") { Move-Item "$proj\pg-zonky.jar" "$root\pg.jar" -Force }
if (-not (Test-Path "$root\pg.jar")) { throw 'pg.jar not found' }
$jarDir = Join-Path $root '_jar'
New-Item -ItemType Directory -Force -Path $jarDir | Out-Null
& python -c 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$root\pg.jar" $jarDir
if ($LASTEXITCODE -ne 0) { throw 'jar extraction failed' }
$txz = (Get-ChildItem $jarDir -Filter '*.txz' | Select-Object -First 1).FullName
if (-not $txz) { throw 'txz not found inside jar' }
& python -c 'import tarfile,sys; tarfile.open(sys.argv[1]).extractall(sys.argv[2])' $txz $root
if ($LASTEXITCODE -ne 0) { throw 'txz extraction failed' }
Remove-Item $jarDir -Recurse -Force

$initdb = Join-Path $root 'bin\initdb.exe'
if (-not (Test-Path $initdb)) { throw 'initdb.exe missing after extraction' }

# 2. Initialize data directory (superuser: postgres / postgres)
Set-Content -Path "$root\pwfile.txt" -Value 'postgres' -NoNewline
if (Test-Path "$root\data") { Remove-Item "$root\data" -Recurse -Force }
& $initdb -D "$root\data" -U postgres -E UTF8 --locale=C -A scram-sha-256 --pwfile="$root\pwfile.txt"
if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
Remove-Item "$root\pwfile.txt" -Force

# 3. Ensure port and start PostgreSQL (detached; keeps running after this script)
Add-Content -Path "$root\data\postgresql.conf" -Value "`nport = 5432"
$pgctl = Join-Path $root 'bin\pg_ctl.exe'
& $pgctl -D "$root\data" -l "$root\pg.log" start
if ($LASTEXITCODE -ne 0) { throw 'pg_ctl start failed' }

# 4. Wait until ready
$env:PGPASSWORD = 'postgres'
$env:PGCLIENTENCODING = 'UTF8'
$psql = Join-Path $root 'bin\psql.exe'
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    & $psql -U postgres -h localhost -p 5432 -d postgres -c 'SELECT 1' 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
}
if (-not $ready) { throw 'postgres did not become ready; check pg.log' }

# 5. Create mentorconnect database (ignore "already exists")
& (Join-Path $root 'bin\createdb.exe') -U postgres -h localhost -p 5432 mentorconnect 2>$null

# 6. Load schema
& $psql -U postgres -h localhost -p 5432 -d mentorconnect -v ON_ERROR_STOP=1 -f "$proj\db\schema.sql"
if ($LASTEXITCODE -ne 0) { throw 'schema load failed' }

Write-Host '=== TABLES ==='
& $psql -U postgres -h localhost -p 5432 -d mentorconnect -c '\dt'
Write-Host 'SETUP COMPLETE'
