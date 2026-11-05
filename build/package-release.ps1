# ==============================================================================
# Script Build Distribusi Rilis MARK V5 (Portable & Installer Package)
# ==============================================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $ProjectRoot
$ReleaseVersion = (Get-Content -Raw -LiteralPath (Join-Path $ProjectRoot "package.json") | ConvertFrom-Json).version
$DistDir = Join-Path $ProjectRoot "dist-release"
$AppDir = Join-Path $DistDir "MARK"

Write-Host ">>> Menyiapkan Git bawaan..." -ForegroundColor Cyan
npm run prepare:git
if ($LASTEXITCODE -ne 0) { throw "Persiapan Git bawaan gagal." }

npm run prepare:office
if ($LASTEXITCODE -ne 0) { throw "Persiapan renderer dokumen gagal." }

Write-Host ">>> [1/6] Membersihkan direktori rilis lama..." -ForegroundColor Cyan
if (Test-Path $DistDir) {
    $ResolvedDist = (Resolve-Path -LiteralPath $DistDir).Path
    if ($ResolvedDist -ne [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot "dist-release"))) {
        throw "Direktori rilis berada di luar target yang ditentukan."
    }
    Remove-Item -Recurse -Force -LiteralPath $ResolvedDist
}
New-Item -ItemType Directory -Force $AppDir | Out-Null

Write-Host ">>> [2/6] Mem-build React WebUI (Vite)..." -ForegroundColor Cyan
npm run build:ui
if ($LASTEXITCODE -ne 0) { throw "Build UI gagal." }

Write-Host ">>> [3/6] Meng-compile Launcher Native C# (MARK.exe)..." -ForegroundColor Cyan
$CscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $CscPath /target:winexe /win32icon:resources\icon.ico /out:"$AppDir\MARK.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll src\launcher\MarkTray.cs
if ($LASTEXITCODE -ne 0) { throw "Build launcher gagal." }

Write-Host ">>> [4/6] Menyalin aset dan source server..." -ForegroundColor Cyan
Copy-Item -Path "package.json" -Destination $AppDir
Copy-Item -LiteralPath "THIRD-PARTY-NOTICES.md" -Destination $AppDir
Copy-Item -LiteralPath "LICENSE" -Destination $AppDir
Copy-Item -Recurse -LiteralPath "docs" -Destination $AppDir
Copy-Item -Recurse -Path "bin" -Destination $AppDir
Copy-Item -Recurse -Path "src" -Destination $AppDir
Copy-Item -Recurse -Path "out" -Destination $AppDir
Copy-Item -Recurse -Path "resources" -Destination $AppDir

Write-Host ">>> [5/6] Mengunduh/Menyalin Node.js Windows Portable Runtime..." -ForegroundColor Cyan
$NodeDestDir = Join-Path $AppDir "node"
New-Item -ItemType Directory -Force $NodeDestDir | Out-Null

# Salin node.exe dari environment lokal
$CurrentNode = (Get-Command node).Source
Copy-Item -Path $CurrentNode -Destination "$NodeDestDir\node.exe"

Write-Host ">>> [6/6] Mengemas dependensi node_modules ke bundle..." -ForegroundColor Cyan
# Salin node_modules production
Copy-Item -Recurse -Path "node_modules" -Destination $AppDir

Write-Host ">>> Membuat arsip ZIP rilis portabel..." -ForegroundColor Cyan
$ZipPath = Join-Path $DistDir "MARK-v$ReleaseVersion-windows-x64.zip"
Compress-Archive -Path "$AppDir\*" -DestinationPath $ZipPath -CompressionLevel Optimal

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host " SUKSES! Paket Rilis MARK v$ReleaseVersion Selesai Dibuat." -ForegroundColor Green
Write-Host " Folder App: $AppDir" -ForegroundColor White
Write-Host " File ZIP:   $ZipPath" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Green
