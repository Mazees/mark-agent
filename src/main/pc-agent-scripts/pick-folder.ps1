[CmdletBinding()]
param(
    [string]$Title = "Pilih Folder Workspace Proyek"
)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms

# Gunakan Form TopMost sebagai Owner agar dialog pasti muncul di paling depan
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$owner.Width = 0
$owner.Height = 0
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
$owner.Show()
$owner.Activate()

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = $Title
$dialog.ShowNewFolderButton = $true

$res = $dialog.ShowDialog($owner)

if ($res -eq [System.Windows.Forms.DialogResult]::OK -and -not [string]::IsNullOrWhiteSpace($dialog.SelectedPath)) {
    [Console]::Out.Write($dialog.SelectedPath)
}

$owner.Close()
$owner.Dispose()
