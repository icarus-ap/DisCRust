Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
Set-Location -Path $ScriptDir

$ManifestPath = Join-Path $ScriptDir "ota_manifest.json"
$CurVer = "0.6.6"
$CurBaseUrl = "https://raw.githubusercontent.com/VoxMortis/DisCRust/main"
$CurNotes = "Performance & stability improvements."

if (Test-Path $ManifestPath) {
    try {
        $m = Get-Content -Path $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($m.version) { $CurVer = $m.version }
        if ($m.notes) { $CurNotes = $m.notes }
        if ($m.engine_js_url -match "^(https?://.+)/src/injected_engine\.js$") {
            $CurBaseUrl = $Matches[1]
        }
    } catch {}
}

$Form = New-Object System.Windows.Forms.Form
$Form.Text = "DisCRust — 1-Click OTA Update Publisher"
$Form.ClientSize = New-Object System.Drawing.Size(490, 340)
$Form.StartPosition = "CenterScreen"
$Form.FormBorderStyle = "FixedDialog"
$Form.MaximizeBox = $false
$Form.BackColor = [System.Drawing.Color]::FromArgb(30, 31, 34)
$Form.ForeColor = [System.Drawing.Color]::FromArgb(219, 222, 225)
$Form.Font = New-Object System.Drawing.Font("Segoe UI", 9.25)

$IcoFile = Join-Path $ScriptDir "discrust.ico"
if (Test-Path $IcoFile) { try { $Form.Icon = New-Object System.Drawing.Icon($IcoFile) } catch {} }

$Hdr = New-Object System.Windows.Forms.Label
$Hdr.Text = "Publish Direct OTA Update to Users"
$Hdr.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 12, [System.Drawing.FontStyle]::Bold)
$Hdr.ForeColor = [System.Drawing.Color]::FromArgb(242, 243, 245)
$Hdr.Location = New-Object System.Drawing.Point(20, 16)
$Hdr.AutoSize = $true
$Form.Controls.Add($Hdr)

$Sub = New-Object System.Windows.Forms.Label
$Sub.Text = "Updates ota_manifest.json, stamps default OTA URLs, and pushes via Git if connected."
$Sub.ForeColor = [System.Drawing.Color]::FromArgb(148, 155, 164)
$Sub.Location = New-Object System.Drawing.Point(20, 40)
$Sub.AutoSize = $true
$Form.Controls.Add($Sub)

$LblRepo = New-Object System.Windows.Forms.Label
$LblRepo.Text = "RAW REPOSITORY BASE URL (OR GITHUB USER/REPO):"
$LblRepo.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 8, [System.Drawing.FontStyle]::Bold)
$LblRepo.ForeColor = [System.Drawing.Color]::FromArgb(148, 155, 164)
$LblRepo.Location = New-Object System.Drawing.Point(20, 74)
$LblRepo.AutoSize = $true
$Form.Controls.Add($LblRepo)

$BoxRepo = New-Object System.Windows.Forms.TextBox
$BoxRepo.Text = $CurBaseUrl
$BoxRepo.BackColor = [System.Drawing.Color]::FromArgb(20, 21, 24)
$BoxRepo.ForeColor = [System.Drawing.Color]::White
$BoxRepo.BorderStyle = "FixedSingle"
$BoxRepo.Location = New-Object System.Drawing.Point(20, 94)
$BoxRepo.Size = New-Object System.Drawing.Size(450, 24)
$Form.Controls.Add($BoxRepo)

$LblVer = New-Object System.Windows.Forms.Label
$LblVer.Text = "NEW VERSION (e.g. 0.6.7):"
$LblVer.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 8, [System.Drawing.FontStyle]::Bold)
$LblVer.ForeColor = [System.Drawing.Color]::FromArgb(148, 155, 164)
$LblVer.Location = New-Object System.Drawing.Point(20, 130)
$LblVer.AutoSize = $true
$Form.Controls.Add($LblVer)

$BoxVer = New-Object System.Windows.Forms.TextBox
$BoxVer.Text = $CurVer
$BoxVer.BackColor = [System.Drawing.Color]::FromArgb(20, 21, 24)
$BoxVer.ForeColor = [System.Drawing.Color]::White
$BoxVer.BorderStyle = "FixedSingle"
$BoxVer.Location = New-Object System.Drawing.Point(20, 150)
$BoxVer.Size = New-Object System.Drawing.Size(160, 24)
$Form.Controls.Add($BoxVer)

$LblNotes = New-Object System.Windows.Forms.Label
$LblNotes.Text = "RELEASE NOTES:"
$LblNotes.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 8, [System.Drawing.FontStyle]::Bold)
$LblNotes.ForeColor = [System.Drawing.Color]::FromArgb(148, 155, 164)
$LblNotes.Location = New-Object System.Drawing.Point(20, 186)
$LblNotes.AutoSize = $true
$Form.Controls.Add($LblNotes)

$BoxNotes = New-Object System.Windows.Forms.TextBox
$BoxNotes.Text = $CurNotes
$BoxNotes.Multiline = $true
$BoxNotes.BackColor = [System.Drawing.Color]::FromArgb(20, 21, 24)
$BoxNotes.ForeColor = [System.Drawing.Color]::White
$BoxNotes.BorderStyle = "FixedSingle"
$BoxNotes.Location = New-Object System.Drawing.Point(20, 206)
$BoxNotes.Size = New-Object System.Drawing.Size(450, 62)
$Form.Controls.Add($BoxNotes)

$StatusLbl = New-Object System.Windows.Forms.Label
$StatusLbl.Text = "Ready."
$StatusLbl.ForeColor = [System.Drawing.Color]::FromArgb(87, 227, 137)
$StatusLbl.Location = New-Object System.Drawing.Point(20, 286)
$StatusLbl.Size = New-Object System.Drawing.Size(290, 36)
$Form.Controls.Add($StatusLbl)

$PubBtn = New-Object System.Windows.Forms.Button
$PubBtn.Text = "Generate & Push OTA"
$PubBtn.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9.5, [System.Drawing.FontStyle]::Bold)
$PubBtn.BackColor = [System.Drawing.Color]::FromArgb(88, 101, 242)
$PubBtn.ForeColor = [System.Drawing.Color]::White
$PubBtn.FlatStyle = "Flat"
$PubBtn.FlatAppearance.BorderSize = 0
$PubBtn.Location = New-Object System.Drawing.Point(322, 284)
$PubBtn.Size = New-Object System.Drawing.Size(148, 36)
$Form.Controls.Add($PubBtn)

$PubBtn.Add_Click({
    $RawBase = $BoxRepo.Text.Trim().TrimEnd('/')
    if ($RawBase -notmatch "^https?://") {
        # Convert User/Repo shorthand to raw.githubusercontent.com URL
        $RawBase = "https://raw.githubusercontent.com/$RawBase/main"
        $BoxRepo.Text = $RawBase
    }
    $Ver = $BoxVer.Text.Trim()
    if (-not $Ver) { $Ver = "0.6.6" }

    $ManifestObj = [ordered]@{
        package_name       = "DisCRust"
        version            = $Ver
        installer_version  = "6.6.0"
        engine_version     = "$Ver-rust"
        published_at       = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        notes              = $BoxNotes.Text.Trim()
        engine_js_url      = "$RawBase/src/injected_engine.js"
        main_rs_url        = "$RawBase/src/main.rs"
        native_host_cs_url = "$RawBase/src/DisLiteNativeHost.cs"
        app_md_url         = "$RawBase/APP.md"
    }
    $ManifestJson = $ManifestObj | ConvertTo-Json -Depth 4
    $ManifestJson | Set-Content -Path $ManifestPath -Encoding UTF8

    # Also update default OTA URL inside src files if repo changed
    $NewManifestUrl = "$RawBase/ota_manifest.json"
    foreach ($f in @("src\injected_engine.js", "src\main.rs", "src\DisLiteNativeHost.cs")) {
        $fp = Join-Path $ScriptDir $f
        if (Test-Path $fp) {
            $txt = Get-Content -Path $fp -Raw -Encoding UTF8
            $txt = [Regex]::Replace($txt, "https://raw\.githubusercontent\.com/[^""'\s]+/ota_manifest\.json", $NewManifestUrl)
            $txt | Set-Content -Path $fp -Encoding UTF8
        }
    }

    if (Test-Path (Join-Path $ScriptDir ".git")) {
        $StatusLbl.Text = "Pushing OTA update via git..."
        [System.Windows.Forms.Application]::DoEvents()
        cmd.exe /c "git add -A && git commit -m `"OTA Update v$Ver`" && git push" | Out-Null
        $StatusLbl.Text = "Published v$Ver & pushed to Git! Manifest: $NewManifestUrl"
    } else {
        $StatusLbl.Text = "Generated ota_manifest.json (v$Ver)! Upload folder to your GitHub repo."
    }
})

[void]$Form.ShowDialog()
