# Hide any console/terminal window immediately
Add-Type -Name Win32Modern -Namespace DisCRust -MemberDefinition '
    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool ReleaseCapture();
    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);
    [DllImport("dwmapi.dll")]
    public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateRoundRectRgn(int x1, int y1, int x2, int y2, int cx, int cy);
    [DllImport("user32.dll")]
    public static extern int SetWindowRgn(IntPtr hWnd, IntPtr hRgn, bool bRedraw);
' -ErrorAction SilentlyContinue
try {
    $cHwnd = [DisCRust.Win32Modern]::GetConsoleWindow()
    if ($cHwnd -ne [IntPtr]::Zero) {
        [void][DisCRust.Win32Modern]::ShowWindow($cHwnd, 0)
    }
} catch {}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.Windows.Forms.Application]::EnableVisualStyles()

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
Set-Location -Path $ScriptDir

$DefaultDataDir = Join-Path $env:LOCALAPPDATA "DisLiteRust01"
if (-not (Test-Path $DefaultDataDir)) { New-Item -ItemType Directory -Path $DefaultDataDir -Force | Out-Null }

$InitialInstallDir = $DefaultDataDir
$SavedCustomFile = Join-Path $DefaultDataDir "custom_install_dir.txt"
if (Test-Path $SavedCustomFile) {
    $SavedPath = (Get-Content -Path $SavedCustomFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($SavedPath -and $SavedPath.Trim().Length -gt 0) {
        $InitialInstallDir = $SavedPath.Trim()
    }
}

function Start-HiddenProcess([string]$FileName, [string]$Arguments, [string]$WorkDir = $ScriptDir, [bool]$Wait = $false) {
    $Psi = New-Object System.Diagnostics.ProcessStartInfo
    $Psi.FileName = $FileName
    $Psi.Arguments = $Arguments
    $Psi.WorkingDirectory = $WorkDir
    $Psi.UseShellExecute = $false
    $Psi.CreateNoWindow = $true
    $Psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $P = [System.Diagnostics.Process]::Start($Psi)
    if ($Wait -and $P) {
        while (-not $P.HasExited) {
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 50
        }
    }
    return $P
}

function New-RoundedRectPath([int]$X, [int]$Y, [int]$W, [int]$H, [int]$Radius) {
    $Path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $D = $Radius * 2
    $Path.AddArc($X, $Y, $D, $D, 180, 90)
    $Path.AddArc($X + $W - $D, $Y, $D, $D, 270, 90)
    $Path.AddArc($X + $W - $D, $Y + $H - $D, $D, $D, 0, 90)
    $Path.AddArc($X, $Y + $H - $D, $D, $D, 90, 90)
    $Path.CloseFigure()
    return $Path
}

function Apply-ModernRoundedCorners([System.Windows.Forms.Form]$TargetForm) {
    try {
        $hwnd = $TargetForm.Handle
        $dark = 1
        [void][DisCRust.Win32Modern]::DwmSetWindowAttribute($hwnd, 20, [ref]$dark, 4)
        $roundPref = 2 # DWMWCP_ROUND (Windows 11 native hardware anti-aliased rounded corners)
        $hr = [DisCRust.Win32Modern]::DwmSetWindowAttribute($hwnd, 33, [ref]$roundPref, 4)
        $borderCol = 0x00383432
        [void][DisCRust.Win32Modern]::DwmSetWindowAttribute($hwnd, 34, [ref]$borderCol, 4)
        if ($hr -ne 0) {
            # Fallback rounded region for Windows 10
            $rgn = [DisCRust.Win32Modern]::CreateRoundRectRgn(0, 0, $TargetForm.Width + 1, $TargetForm.Height + 1, 18, 18)
            if ($rgn -ne [IntPtr]::Zero) {
                [void][DisCRust.Win32Modern]::SetWindowRgn($hwnd, $rgn, $true)
            }
        }
    } catch {}
}

# Modern Rounded-Corner Setup Form (510 x 412)
$Form = New-Object System.Windows.Forms.Form
$Form.Text = "DisCRust v0.6.6 Setup"
$Form.ClientSize = New-Object System.Drawing.Size(510, 412)
$Form.StartPosition = "CenterScreen"
$Form.FormBorderStyle = "None"
$Form.MaximizeBox = $false
$Form.TopMost = $true
$Form.BackColor = [System.Drawing.Color]::FromArgb(30, 31, 34)
$Form.ForeColor = [System.Drawing.Color]::FromArgb(219, 222, 225)
$Form.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)

$IcoFile = Join-Path $ScriptDir "discrust.ico"
if (-not (Test-Path $IcoFile)) { $IcoFile = Join-Path $ScriptDir "dislite.ico" }
if (Test-Path $IcoFile) {
    try { $Form.Icon = New-Object System.Drawing.Icon($IcoFile) } catch {}
}

$PngFile = Join-Path $ScriptDir "discrust.png"
if (-not (Test-Path $PngFile)) { $PngFile = Join-Path $ScriptDir "dislite.png" }
$BrandImage = $null
if (Test-Path $PngFile) {
    try { $BrandImage = [System.Drawing.Image]::FromFile($PngFile) } catch {}
}

$Form.Add_HandleCreated({
    Apply-ModernRoundedCorners $Form
})

$Form.Add_Paint({
    param($s, $e)
    $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(52, 54, 60), 1)
    $e.Graphics.DrawRectangle($pen, 0, 0, $Form.ClientSize.Width - 1, $Form.ClientSize.Height - 1)
    $pen.Dispose()
})

$Form.Add_Shown({
    Apply-ModernRoundedCorners $Form
    $Form.Activate()
    $Form.BringToFront()
    $Form.TopMost = $false
})

# Minimal 40px Title Bar (#18191c) with subtle DisCRust icon & title
$TitleBar = New-Object System.Windows.Forms.Panel
$TitleBar.Location = New-Object System.Drawing.Point(1, 1)
$TitleBar.Size = New-Object System.Drawing.Size(508, 40)
$TitleBar.BackColor = [System.Drawing.Color]::FromArgb(24, 25, 28)
$Form.Controls.Add($TitleBar)

$DragHandler = {
    if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        [void][DisCRust.Win32Modern]::ReleaseCapture()
        [void][DisCRust.Win32Modern]::SendMessage($Form.Handle, 0xA1, 0x2, 0)
    }
}
$TitleBar.Add_MouseDown($DragHandler)

if ($BrandImage) {
    $TbIcon = New-Object System.Windows.Forms.PictureBox
    $TbIcon.Image = $BrandImage
    $TbIcon.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
    $TbIcon.Location = New-Object System.Drawing.Point(16, 11)
    $TbIcon.Size = New-Object System.Drawing.Size(18, 18)
    $TbIcon.Add_MouseDown($DragHandler)
    $TitleBar.Controls.Add($TbIcon)
}

$TbTitle = New-Object System.Windows.Forms.Label
$TbTitle.Text = "DisCRust Setup"
$TbTitle.UseMnemonic = $false
$TbTitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9.5, [System.Drawing.FontStyle]::Bold)
$TbTitle.ForeColor = [System.Drawing.Color]::FromArgb(242, 243, 245)
$TbTitle.Location = New-Object System.Drawing.Point(40, 11)
$TbTitle.AutoSize = $true
$TbTitle.Add_MouseDown($DragHandler)
$TitleBar.Controls.Add($TbTitle)

$MinBtn = New-Object System.Windows.Forms.Button
$MinBtn.Text = "-"
$MinBtn.Font = New-Object System.Drawing.Font("Segoe UI", 11)
$MinBtn.FlatStyle = "Flat"
$MinBtn.FlatAppearance.BorderSize = 0
$MinBtn.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(43, 45, 49)
$MinBtn.BackColor = [System.Drawing.Color]::FromArgb(24, 25, 28)
$MinBtn.ForeColor = [System.Drawing.Color]::FromArgb(181, 186, 193)
$MinBtn.Location = New-Object System.Drawing.Point(428, 0)
$MinBtn.Size = New-Object System.Drawing.Size(40, 40)
$MinBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$MinBtn.Add_Click({ $Form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized })
$TitleBar.Controls.Add($MinBtn)

$TopCloseBtn = New-Object System.Windows.Forms.Button
$TopCloseBtn.Text = "X"
$TopCloseBtn.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9.5, [System.Drawing.FontStyle]::Bold)
$TopCloseBtn.FlatStyle = "Flat"
$TopCloseBtn.FlatAppearance.BorderSize = 0
$TopCloseBtn.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(218, 55, 60)
$TopCloseBtn.BackColor = [System.Drawing.Color]::FromArgb(24, 25, 28)
$TopCloseBtn.ForeColor = [System.Drawing.Color]::FromArgb(181, 186, 193)
$TopCloseBtn.Location = New-Object System.Drawing.Point(468, 0)
$TopCloseBtn.Size = New-Object System.Drawing.Size(40, 40)
$TopCloseBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$TopCloseBtn.Add_Click({ $Form.Close() })
$TitleBar.Controls.Add($TopCloseBtn)

# Main Content Area
$ContentArea = New-Object System.Windows.Forms.Panel
$ContentArea.Location = New-Object System.Drawing.Point(1, 41)
$ContentArea.Size = New-Object System.Drawing.Size(508, 316)
$ContentArea.BackColor = [System.Drawing.Color]::FromArgb(30, 31, 34)
$Form.Controls.Add($ContentArea)

# Bottom Footer (#18191c)
$Footer = New-Object System.Windows.Forms.Panel
$Footer.Location = New-Object System.Drawing.Point(1, 357)
$Footer.Size = New-Object System.Drawing.Size(508, 54)
$Footer.BackColor = [System.Drawing.Color]::FromArgb(24, 25, 28)
$Form.Controls.Add($Footer)

$StepHintLbl = New-Object System.Windows.Forms.Label
$StepHintLbl.Text = "DisCRust v0.6.6  •  Installer v6.6.0"
$StepHintLbl.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$StepHintLbl.ForeColor = [System.Drawing.Color]::FromArgb(128, 132, 142)
$StepHintLbl.Location = New-Object System.Drawing.Point(22, 19)
$StepHintLbl.AutoSize = $true
$Footer.Controls.Add($StepHintLbl)

$CancelBtn = New-Object System.Windows.Forms.Button
$CancelBtn.Text = "Cancel"
$CancelBtn.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9.25)
$CancelBtn.BackColor = [System.Drawing.Color]::FromArgb(43, 45, 49)
$CancelBtn.ForeColor = [System.Drawing.Color]::FromArgb(219, 222, 225)
$CancelBtn.FlatStyle = "Flat"
$CancelBtn.FlatAppearance.BorderSize = 0
$CancelBtn.Location = New-Object System.Drawing.Point(280, 10)
$CancelBtn.Size = New-Object System.Drawing.Size(92, 34)
$CancelBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$CancelBtn.Add_Click({ $Form.Close() })
$Footer.Controls.Add($CancelBtn)

$ActionBtn = New-Object System.Windows.Forms.Button
$ActionBtn.Text = "Install"
$ActionBtn.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9.5, [System.Drawing.FontStyle]::Bold)
$ActionBtn.BackColor = [System.Drawing.Color]::FromArgb(88, 101, 242)
$ActionBtn.ForeColor = [System.Drawing.Color]::White
$ActionBtn.FlatStyle = "Flat"
$ActionBtn.FlatAppearance.BorderSize = 0
$ActionBtn.Location = New-Object System.Drawing.Point(382, 10)
$ActionBtn.Size = New-Object System.Drawing.Size(104, 34)
$ActionBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$Footer.Controls.Add($ActionBtn)

# ==================== STEP 1: MINIMAL BRAND HEADER + LOCATION & OPTIONS ====================
$PageSetup = New-Object System.Windows.Forms.Panel
$PageSetup.Dock = "Fill"
$ContentArea.Controls.Add($PageSetup)

# Clean, Uncluttered Brand Header
if ($BrandImage) {
    $HeroIcon = New-Object System.Windows.Forms.PictureBox
    $HeroIcon.Image = $BrandImage
    $HeroIcon.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
    $HeroIcon.Location = New-Object System.Drawing.Point(22, 14)
    $HeroIcon.Size = New-Object System.Drawing.Size(34, 34)
    $PageSetup.Controls.Add($HeroIcon)
}

$HeroTitle = New-Object System.Windows.Forms.Label
$HeroTitle.Text = "DisCRust v0.6.6"
$HeroTitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 12, [System.Drawing.FontStyle]::Bold)
$HeroTitle.ForeColor = [System.Drawing.Color]::FromArgb(242, 243, 245)
$HeroTitle.Location = New-Object System.Drawing.Point(64, 12)
$HeroTitle.AutoSize = $true
$PageSetup.Controls.Add($HeroTitle)

$HeroSub = New-Object System.Windows.Forms.Label
$HeroSub.Text = "Lightweight Native Rust Client for Discord"
$HeroSub.Font = New-Object System.Drawing.Font("Segoe UI", 8.75)
$HeroSub.ForeColor = [System.Drawing.Color]::FromArgb(148, 155, 164)
$HeroSub.Location = New-Object System.Drawing.Point(64, 32)
$HeroSub.AutoSize = $true
$PageSetup.Controls.Add($HeroSub)

$LocLabel = New-Object System.Windows.Forms.Label
$LocLabel.Text = "INSTALL LOCATION"
$LocLabel.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 8, [System.Drawing.FontStyle]::Bold)
$LocLabel.ForeColor = [System.Drawing.Color]::FromArgb(148, 155, 164)
$LocLabel.Location = New-Object System.Drawing.Point(22, 60)
$LocLabel.AutoSize = $true
$PageSetup.Controls.Add($LocLabel)

$LocCard = New-Object System.Windows.Forms.Panel
$LocCard.Location = New-Object System.Drawing.Point(20, 78)
$LocCard.Size = New-Object System.Drawing.Size(468, 46)
$LocCard.BackColor = [System.Drawing.Color]::FromArgb(38, 40, 45)
$PageSetup.Controls.Add($LocCard)

$PathBox = New-Object System.Windows.Forms.TextBox
$PathBox.Text = $InitialInstallDir
$PathBox.Font = New-Object System.Drawing.Font("Segoe UI", 9.25)
$PathBox.BackColor = [System.Drawing.Color]::FromArgb(24, 25, 28)
$PathBox.ForeColor = [System.Drawing.Color]::FromArgb(219, 222, 225)
$PathBox.BorderStyle = "FixedSingle"
$PathBox.Location = New-Object System.Drawing.Point(10, 11)
$PathBox.Size = New-Object System.Drawing.Size(358, 24)
$LocCard.Controls.Add($PathBox)

$BrowseBtn = New-Object System.Windows.Forms.Button
$BrowseBtn.Text = "Browse..."
$BrowseBtn.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 8.75)
$BrowseBtn.BackColor = [System.Drawing.Color]::FromArgb(53, 55, 60)
$BrowseBtn.ForeColor = [System.Drawing.Color]::FromArgb(242, 243, 245)
$BrowseBtn.FlatStyle = "Flat"
$BrowseBtn.FlatAppearance.BorderSize = 0
$BrowseBtn.Location = New-Object System.Drawing.Point(376, 9)
$BrowseBtn.Size = New-Object System.Drawing.Size(82, 28)
$BrowseBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$BrowseBtn.Add_Click({
    $FolderDlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $FolderDlg.Description = "Select the folder where DisCRust v0.6.6 should be installed:"
    $FolderDlg.ShowNewFolderButton = $true
    if (Test-Path $PathBox.Text) {
        $FolderDlg.SelectedPath = $PathBox.Text
    }
    if ($FolderDlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK -and $FolderDlg.SelectedPath) {
        $Chosen = $FolderDlg.SelectedPath
        if (-not ($Chosen.EndsWith("DisLiteRust", [System.StringComparison]::OrdinalIgnoreCase) -or $Chosen.EndsWith("DisLiteRust01", [System.StringComparison]::OrdinalIgnoreCase))) {
            $Chosen = Join-Path $Chosen "DisLiteRust"
        }
        $PathBox.Text = $Chosen
    }
})
$LocCard.Controls.Add($BrowseBtn)

$OptLabel = New-Object System.Windows.Forms.Label
$OptLabel.Text = "OPTIONS"
$OptLabel.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 8, [System.Drawing.FontStyle]::Bold)
$OptLabel.ForeColor = [System.Drawing.Color]::FromArgb(148, 155, 164)
$OptLabel.Location = New-Object System.Drawing.Point(22, 138)
$OptLabel.AutoSize = $true
$PageSetup.Controls.Add($OptLabel)

$OptsCard = New-Object System.Windows.Forms.Panel
$OptsCard.Location = New-Object System.Drawing.Point(20, 156)
$OptsCard.Size = New-Object System.Drawing.Size(468, 138)
$OptsCard.BackColor = [System.Drawing.Color]::FromArgb(38, 40, 45)
$PageSetup.Controls.Add($OptsCard)

$ToggleStates = @{
    Bundles   = $true
    Desktop   = $true
    StartMenu = $true
}

function Add-CleanToggleRow([int]$Index, [string]$Key, [string]$TitleText) {
    $RowY = $Index * 46
    $Row = New-Object System.Windows.Forms.Panel
    $Row.Location = New-Object System.Drawing.Point(0, $RowY)
    $Row.Size = New-Object System.Drawing.Size(468, 46)
    $Row.BackColor = [System.Drawing.Color]::FromArgb(38, 40, 45)
    $Row.Cursor = [System.Windows.Forms.Cursors]::Hand

    $Lbl = New-Object System.Windows.Forms.Label
    $Lbl.Text = $TitleText
    $Lbl.UseMnemonic = $false
    $Lbl.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9.5)
    $Lbl.ForeColor = [System.Drawing.Color]::FromArgb(219, 222, 225)
    $Lbl.Location = New-Object System.Drawing.Point(14, 13)
    $Lbl.AutoSize = $true
    $Row.Controls.Add($Lbl)

    $Row.Add_Paint({
        param($s, $e)
        $g = $e.Graphics
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $isOn = [bool]$ToggleStates[$Key]
        $trackColor = if ($isOn) { [System.Drawing.Color]::FromArgb(88, 101, 242) } else { [System.Drawing.Color]::FromArgb(63, 65, 71) }
        $brush = New-Object System.Drawing.SolidBrush($trackColor)
        $swX = 418
        $swY = 14
        $g.FillEllipse($brush, $swX, $swY, 18, 18)
        $g.FillEllipse($brush, $swX + 16, $swY, 18, 18)
        $g.FillRectangle($brush, $swX + 9, $swY, 16, 18)
        $brush.Dispose()

        $knobBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $knobX = if ($isOn) { $swX + 18 } else { $swX + 3 }
        $g.FillEllipse($knobBrush, $knobX, $swY + 3, 12, 12)
        $knobBrush.Dispose()

        if ($Index -lt 2) {
            $divPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(46, 48, 54), 1)
            $g.DrawLine($divPen, 14, 45, 454, 45)
            $divPen.Dispose()
        }
    }.GetNewClosure())

    $ClickAct = {
        $ToggleStates[$Key] = -not [bool]$ToggleStates[$Key]
        $Row.Invalidate()
    }.GetNewClosure()

    $Row.Add_Click($ClickAct)
    $Lbl.Add_Click($ClickAct)
    $OptsCard.Controls.Add($Row)
}

Add-CleanToggleRow 0 "Bundles"   "Include Quest Completer & Vencord Bundle"
Add-CleanToggleRow 1 "Desktop"   "Create Desktop Shortcut"
Add-CleanToggleRow 2 "StartMenu" "Add to Start Menu & Windows Installed Apps"

# ==================== STEP 2: INSTALLING ====================
$PageInstall = New-Object System.Windows.Forms.Panel
$PageInstall.Dock = "Fill"
$PageInstall.Visible = $false
$ContentArea.Controls.Add($PageInstall)

$InstTitle = New-Object System.Windows.Forms.Label
$InstTitle.Text = "Installing DisCRust v0.6.6"
$InstTitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 13, [System.Drawing.FontStyle]::Bold)
$InstTitle.ForeColor = [System.Drawing.Color]::FromArgb(242, 243, 245)
$InstTitle.Location = New-Object System.Drawing.Point(22, 24)
$InstTitle.AutoSize = $true
$PageInstall.Controls.Add($InstTitle)

$StatusLbl = New-Object System.Windows.Forms.Label
$StatusLbl.Text = "Preparing files..."
$StatusLbl.UseMnemonic = $false
$StatusLbl.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$StatusLbl.ForeColor = [System.Drawing.Color]::FromArgb(181, 186, 193)
$StatusLbl.Location = New-Object System.Drawing.Point(22, 58)
$StatusLbl.Size = New-Object System.Drawing.Size(400, 20)
$PageInstall.Controls.Add($StatusLbl)

$PctLbl = New-Object System.Windows.Forms.Label
$PctLbl.Text = "0%"
$PctLbl.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9.5, [System.Drawing.FontStyle]::Bold)
$PctLbl.ForeColor = [System.Drawing.Color]::FromArgb(165, 180, 252)
$PctLbl.Location = New-Object System.Drawing.Point(430, 58)
$PctLbl.Size = New-Object System.Drawing.Size(58, 20)
$PctLbl.TextAlign = [System.Drawing.ContentAlignment]::MiddleRight
$PageInstall.Controls.Add($PctLbl)

$CurrentProgressPct = 0
$ProgPanel = New-Object System.Windows.Forms.Panel
$ProgPanel.Location = New-Object System.Drawing.Point(22, 86)
$ProgPanel.Size = New-Object System.Drawing.Size(466, 10)
$ProgPanel.BackColor = [System.Drawing.Color]::FromArgb(20, 21, 24)
$ProgPanel.Add_Paint({
    param($s, $e)
    $pct = [Math]::Min(100, [Math]::Max(0, $script:CurrentProgressPct))
    if ($pct -gt 0) {
        $fillW = [int][Math]::Round(($ProgPanel.Width * $pct) / 100.0)
        if ($fillW -gt 0) {
            $b = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(88, 101, 242))
            $e.Graphics.FillRectangle($b, 0, 0, $fillW, $ProgPanel.Height)
            $b.Dispose()
        }
    }
})
$PageInstall.Controls.Add($ProgPanel)

$LogBox = New-Object System.Windows.Forms.TextBox
$LogBox.Multiline = $true
$LogBox.ScrollBars = "Vertical"
$LogBox.ReadOnly = $true
$LogBox.BackColor = [System.Drawing.Color]::FromArgb(24, 25, 28)
$LogBox.ForeColor = [System.Drawing.Color]::FromArgb(148, 155, 164)
$LogBox.Font = New-Object System.Drawing.Font("Consolas", 8.5)
$LogBox.BorderStyle = "FixedSingle"
$LogBox.Location = New-Object System.Drawing.Point(22, 112)
$LogBox.Size = New-Object System.Drawing.Size(466, 178)
$PageInstall.Controls.Add($LogBox)

# ==================== STEP 3: COMPLETE ====================
$PageComplete = New-Object System.Windows.Forms.Panel
$PageComplete.Dock = "Fill"
$PageComplete.Visible = $false
$ContentArea.Controls.Add($PageComplete)

$CompTitle = New-Object System.Windows.Forms.Label
$CompTitle.Text = "Installation Complete"
$CompTitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 14, [System.Drawing.FontStyle]::Bold)
$CompTitle.ForeColor = [System.Drawing.Color]::FromArgb(35, 165, 90)
$CompTitle.Location = New-Object System.Drawing.Point(22, 34)
$CompTitle.AutoSize = $true
$PageComplete.Controls.Add($CompTitle)

$CompSub = New-Object System.Windows.Forms.Label
$CompSub.Text = "DisCRust v0.6.6 is ready to use."
$CompSub.Font = New-Object System.Drawing.Font("Segoe UI", 9.75)
$CompSub.ForeColor = [System.Drawing.Color]::FromArgb(219, 222, 225)
$CompSub.Location = New-Object System.Drawing.Point(22, 68)
$CompSub.Size = New-Object System.Drawing.Size(466, 42)
$PageComplete.Controls.Add($CompSub)

$LaunchChk = New-Object System.Windows.Forms.CheckBox
$LaunchChk.Text = "Launch DisCRust v0.6.6 now"
$LaunchChk.Checked = $true
$LaunchChk.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
$LaunchChk.ForeColor = [System.Drawing.Color]::FromArgb(242, 243, 245)
$LaunchChk.Location = New-Object System.Drawing.Point(24, 128)
$LaunchChk.AutoSize = $true
$PageComplete.Controls.Add($LaunchChk)

function Append-Log([string]$Text) {
    $LogBox.AppendText("$Text`r`n")
    $LogBox.SelectionStart = $LogBox.Text.Length
    $LogBox.ScrollToCaret()
    [System.Windows.Forms.Application]::DoEvents()
}

function Set-Step([int]$Pct, [string]$Msg) {
    $script:CurrentProgressPct = [Math]::Min(100, [Math]::Max(0, $Pct))
    $PctLbl.Text = "$($script:CurrentProgressPct)%"
    $ProgPanel.Invalidate()
    $StatusLbl.Text = $Msg
    Append-Log $Msg
}

$CurrentStep = 0
$TargetExeFinal = ""
$InstallDir = $InitialInstallDir

function Run-Install {
    $ChosenDir = $PathBox.Text.Trim()
    if (-not $ChosenDir) { $ChosenDir = $DefaultDataDir }
    $script:InstallDir = $ChosenDir
    $VencordDir = Join-Path $script:InstallDir "Vencord"

    $script:CurrentStep = 1
    $PageSetup.Visible = $false
    $PageInstall.Visible = $true
    $ActionBtn.Enabled = $false
    $CancelBtn.Enabled = $false

    try {
        if (-not (Test-Path $script:InstallDir)) { New-Item -ItemType Directory -Path $script:InstallDir -Force | Out-Null }
        if (-not (Test-Path $VencordDir)) { New-Item -ItemType Directory -Path $VencordDir -Force | Out-Null }
        $DefaultVencordDir = Join-Path $DefaultDataDir "Vencord"
        if (-not (Test-Path $DefaultVencordDir)) { New-Item -ItemType Directory -Path $DefaultVencordDir -Force | Out-Null }
        if (Test-Path $SavedCustomFile) { Remove-Item $SavedCustomFile -Force -ErrorAction SilentlyContinue }

        [void](Start-HiddenProcess "taskkill.exe" "/F /IM vs_BuildTools.exe" $ScriptDir $true)
        [void](Start-HiddenProcess "taskkill.exe" "/F /T /IM DisCRust.exe" $ScriptDir $true)
        [void](Start-HiddenProcess "taskkill.exe" "/F /T /IM discrust.exe" $ScriptDir $true)
        [void](Start-HiddenProcess "taskkill.exe" "/F /T /IM DisLiteRust.exe" $ScriptDir $true)
        [void](Start-HiddenProcess "taskkill.exe" "/F /T /IM dislite_rust.exe" $ScriptDir $true)

        Set-Step 15 "Writing configuration & AppMD (v0.6.6)..."
        $MetaObj = @{
            package_name = "DisCRust"
            version = "0.6.6"
            file_version = "0.6.6.0"
            installer_version = "6.6.0"
            quest_engine_version = "0.6.6-rust"
            install_location = $script:InstallDir
            quest_completer_installed = [bool]$ToggleStates["Bundles"]
            vencord_installed = [bool]$ToggleStates["Bundles"]
            channel = "stable"
            updated_at = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        }
        $MetaJson = $MetaObj | ConvertTo-Json -Depth 4
        $MetaJson | Set-Content -Path (Join-Path $script:InstallDir "install_metadata.json") -Encoding UTF8
        $MetaJson | Set-Content -Path (Join-Path $DefaultDataDir "install_metadata.json") -Encoding UTF8

        $TargetSrcDir = Join-Path $script:InstallDir "src"
        $DefSrcDir = Join-Path $DefaultDataDir "src"
        if (-not (Test-Path $TargetSrcDir)) { New-Item -ItemType Directory -Path $TargetSrcDir -Force | Out-Null }
        if (-not (Test-Path $DefSrcDir)) { New-Item -ItemType Directory -Path $DefSrcDir -Force | Out-Null }
        foreach ($f in @("src\injected_engine.js", "src\main.rs", "src\DisLiteNativeHost.cs")) {
            $sf = Join-Path $ScriptDir $f
            if (Test-Path $sf) {
                Copy-Item -Path $sf -Destination (Join-Path $script:InstallDir $f) -Force
                Copy-Item -Path $sf -Destination (Join-Path $DefaultDataDir $f) -Force -ErrorAction SilentlyContinue
            }
        }
        foreach ($cfgDir in @($DefaultDataDir, $script:InstallDir, (Join-Path $env:LOCALAPPDATA "DisLite"))) {
            $cfgFile = Join-Path $cfgDir "config.json"
            if (Test-Path $cfgFile) {
                try {
                    $rawCfg = Get-Content -Path $cfgFile -Raw -Encoding UTF8
                    $_ = $rawCfg | ConvertFrom-Json -ErrorAction Stop
                } catch {
                    "{}" | Set-Content -Path $cfgFile -Encoding UTF8
                }
            }
        }
        foreach ($Asset in @("discrust.ico", "discrust.png", "dislite.ico", "litecord.ico", "dislite.png", "APP.md", "DisCRust_Setup_Guide.md", "ota_manifest.json", "ota_publish.ps1", "Publish_OTA_Update.bat")) {
            $SrcAsset = Join-Path $ScriptDir $Asset
            if (Test-Path $SrcAsset) { Copy-Item -Path $SrcAsset -Destination (Join-Path $script:InstallDir $Asset) -Force }
        }

        Set-Step 32 "Verifying Microsoft Edge WebView2 Runtime..."
        $Wv1 = Test-Path "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
        $Wv2 = Test-Path "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
        if (-not ($Wv1 -or $Wv2)) {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $WvSetup = Join-Path $env:TEMP "MicrosoftEdgeWebview2Setup.exe"
            Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile $WvSetup -UseBasicParsing
            [void](Start-HiddenProcess $WvSetup "/silent /install" $ScriptDir $true)
        }

        if ([bool]$ToggleStates["Bundles"]) {
            Set-Step 48 "Syncing Vencord & Quest Completer bundle..."
            $AltDataDir = Join-Path $env:LOCALAPPDATA "DisLite"
            $AltVencordDir = Join-Path $AltDataDir "Vencord"
            foreach ($vd in @($DefaultVencordDir, $AltVencordDir, $VencordDir)) {
                if (-not (Test-Path $vd)) { New-Item -ItemType Directory -Path $vd -Force | Out-Null }
            }
            try {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                $VJsOut = Join-Path $DefaultVencordDir "browser.js"
                $VCssOut = Join-Path $DefaultVencordDir "browser.css"
                try {
                    Invoke-WebRequest -Uri "https://github.com/Vendicated/Vencord/releases/download/devbuild/browser.js" -OutFile $VJsOut -UseBasicParsing -TimeoutSec 8
                    Invoke-WebRequest -Uri "https://github.com/Vendicated/Vencord/releases/download/devbuild/browser.css" -OutFile $VCssOut -UseBasicParsing -TimeoutSec 8
                } catch {
                    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Vencord/builds/main/browser.js" -OutFile $VJsOut -UseBasicParsing -TimeoutSec 8
                    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Vencord/builds/main/browser.css" -OutFile $VCssOut -UseBasicParsing -TimeoutSec 8
                }
                if (Test-Path $VJsOut) {
                    Copy-Item -Path $VJsOut -Destination (Join-Path $AltVencordDir "browser.js") -Force -ErrorAction SilentlyContinue
                    Copy-Item -Path $VJsOut -Destination (Join-Path $VencordDir "browser.js") -Force -ErrorAction SilentlyContinue
                }
                if (Test-Path $VCssOut) {
                    Copy-Item -Path $VCssOut -Destination (Join-Path $AltVencordDir "browser.css") -Force -ErrorAction SilentlyContinue
                    Copy-Item -Path $VCssOut -Destination (Join-Path $VencordDir "browser.css") -Force -ErrorAction SilentlyContinue
                }
            } catch {}
        }

        Set-Step 68 "Building DisCRust v0.6.6 executable..."
        $script:TargetExeFinal = Join-Path $script:InstallDir "DisCRust.exe"
        $CompatExeFinal = Join-Path $script:InstallDir "DisLiteRust.exe"
        $CargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
        if (Test-Path (Join-Path $CargoBin "cargo.exe")) { $env:PATH = "$CargoBin;$env:PATH" }

        $BuiltSuccessfully = $false
        $BuiltExe = Join-Path $ScriptDir "target\release\discrust.exe"

        if (Get-Command "cargo" -ErrorAction SilentlyContinue) {
            Append-Log "Compiling native Rust client (cargo build --release)..."
            $BuildLogFile = Join-Path $env:TEMP "discrust_v066_build.log"
            if (Test-Path $BuildLogFile) { Remove-Item $BuildLogFile -Force -ErrorAction SilentlyContinue }
            $Proc = Start-HiddenProcess "cmd.exe" "/c cargo build --release > `"$BuildLogFile`" 2>&1" $ScriptDir $false
            $LastLineCount = 0
            while (-not $Proc.HasExited) {
                if (Test-Path $BuildLogFile) {
                    $Lines = @(Get-Content -Path $BuildLogFile -ErrorAction SilentlyContinue)
                    if ($Lines.Count -gt $LastLineCount) {
                        for ($i = $LastLineCount; $i -lt $Lines.Count; $i++) {
                            $ln = $Lines[$i]
                            if ($ln) { Append-Log "  $ln" }
                        }
                        $LastLineCount = $Lines.Count
                    }
                }
                [System.Windows.Forms.Application]::DoEvents()
                Start-Sleep -Milliseconds 90
            }
            if (Test-Path $BuildLogFile) {
                $Lines = @(Get-Content -Path $BuildLogFile -ErrorAction SilentlyContinue)
                if ($Lines.Count -gt $LastLineCount) {
                    for ($i = $LastLineCount; $i -lt $Lines.Count; $i++) {
                        $ln = $Lines[$i]
                        if ($ln) { Append-Log "  $ln" }
                    }
                }
            }
            if ($Proc.ExitCode -eq 0 -and (Test-Path $BuiltExe)) {
                Copy-Item -Path $BuiltExe -Destination $script:TargetExeFinal -Force
                Copy-Item -Path $BuiltExe -Destination $CompatExeFinal -Force -ErrorAction SilentlyContinue
                $DefaultExe = Join-Path $DefaultDataDir "DisCRust.exe"
                if ($script:TargetExeFinal -ne $DefaultExe) {
                    Copy-Item -Path $BuiltExe -Destination $DefaultExe -Force -ErrorAction SilentlyContinue
                }
                $BuiltSuccessfully = $true
                Append-Log "Native DisCRust binary compiled and deployed."
            }
        }

        if (-not $BuiltSuccessfully) {
            $WvSdkDir = Join-Path $DefaultDataDir "wv2_sdk"
            $CoreDll = Join-Path $WvSdkDir "lib\net462\Microsoft.Web.WebView2.Core.dll"
            $WinFormsDll = Join-Path $WvSdkDir "lib\net462\Microsoft.Web.WebView2.WinForms.dll"
            $NativeLoader = Join-Path $WvSdkDir "runtimes\win-x64\native\WebView2Loader.dll"

            if (-not (Test-Path $CoreDll)) {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                $NupkgPath = Join-Path $env:TEMP "wv2_sdk.zip"
                Invoke-WebRequest -Uri "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/1.0.2792.45" -OutFile $NupkgPath -UseBasicParsing
                if (Test-Path $WvSdkDir) { Remove-Item $WvSdkDir -Recurse -Force -ErrorAction SilentlyContinue }
                [System.IO.Compression.ZipFile]::ExtractToDirectory($NupkgPath, $WvSdkDir)
            }

            Copy-Item -Path $CoreDll -Destination (Join-Path $script:InstallDir "Microsoft.Web.WebView2.Core.dll") -Force
            Copy-Item -Path $WinFormsDll -Destination (Join-Path $script:InstallDir "Microsoft.Web.WebView2.WinForms.dll") -Force
            Copy-Item -Path $NativeLoader -Destination (Join-Path $script:InstallDir "WebView2Loader.dll") -Force

            $CscExe = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
            $CsSrc = Join-Path $ScriptDir "src\DisLiteNativeHost.cs"
            $IconArg = if (Test-Path $IcoFile) { "/win32icon:`"$IcoFile`"" } else { "" }
            $JsResFile = Join-Path $ScriptDir "src\injected_engine.js"
            $ResArg = if (Test-Path $JsResFile) { "/resource:`"$JsResFile`",injected_engine.js" } else { "" }
            $CscArgs = "/nologo /target:winexe /platform:x64 /optimize+ /out:`"$($script:TargetExeFinal)`" $IconArg $ResArg /r:`"$CoreDll`" /r:`"$WinFormsDll`" /r:System.Windows.Forms.dll /r:System.Drawing.dll `"$CsSrc`""
            $CscProc = Start-HiddenProcess $CscExe $CscArgs $ScriptDir $true
            if ($CscProc.ExitCode -eq 0 -and (Test-Path $script:TargetExeFinal)) {
                Copy-Item -Path $script:TargetExeFinal -Destination $CompatExeFinal -Force -ErrorAction SilentlyContinue
                $BuiltSuccessfully = $true
            } else {
                throw "Failed to build DisCRust.exe."
            }
        }

        Set-Step 86 "Registering app permissions & shortcuts..."
        $RegUninstall = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DisLiteRust"
        if (-not (Test-Path $RegUninstall)) { New-Item -Path $RegUninstall -Force | Out-Null }
        Set-ItemProperty -Path $RegUninstall -Name "DisplayName" -Value "DisCRust"
        Set-ItemProperty -Path $RegUninstall -Name "DisplayVersion" -Value "0.6.6"
        Set-ItemProperty -Path $RegUninstall -Name "Publisher" -Value "VoxMortis"
        Set-ItemProperty -Path $RegUninstall -Name "InstallLocation" -Value $script:InstallDir
        Set-ItemProperty -Path $RegUninstall -Name "DisplayIcon" -Value "$($script:TargetExeFinal),0"
        Set-ItemProperty -Path $RegUninstall -Name "UninstallString" -Value "cmd.exe /c rmdir /s /q `"$($script:InstallDir)`""
        Set-ItemProperty -Path $RegUninstall -Name "NoModify" -Value 1 -Type DWord
        Set-ItemProperty -Path $RegUninstall -Name "NoRepair" -Value 1 -Type DWord
        Set-ItemProperty -Path $RegUninstall -Name "EstimatedSize" -Value 18432 -Type DWord

        $NonPkgKey = $script:TargetExeFinal.Replace('\', '#')
        foreach ($Cap in @("microphone", "webcam")) {
            $CapPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\$Cap\NonPackaged\$NonPkgKey"
            if (-not (Test-Path $CapPath)) { New-Item -Path $CapPath -Force | Out-Null }
            Set-ItemProperty -Path $CapPath -Name "Value" -Value "Allow"
        }

        $WshShell = New-Object -ComObject WScript.Shell
        $Desk = [Environment]::GetFolderPath('Desktop')
        $Prog = [Environment]::GetFolderPath('Programs')
        $StartRoot = [Environment]::GetFolderPath('StartMenu')
        foreach ($d in @($Desk, $Prog, $StartRoot)) {
            if (-not $d) { continue }
            Get-ChildItem -Path $d -Filter "DisLite*.lnk" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
            Get-ChildItem -Path $d -Filter "DisCRust*.lnk" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
        }
        if ([bool]$ToggleStates["Desktop"] -and $Desk) {
            $lnk = $WshShell.CreateShortcut((Join-Path $Desk 'DisCRust v0.6.6.lnk'))
            $lnk.TargetPath = $script:TargetExeFinal
            $lnk.WorkingDirectory = $script:InstallDir
            $lnk.IconLocation = "$($script:InstallDir)\discrust.ico,0"
            $lnk.Description = "DisCRust v0.6.6"
            $lnk.Save()
        }
        if ([bool]$ToggleStates["StartMenu"]) {
            foreach ($sd in @($Prog, $StartRoot)) {
                if (-not $sd) { continue }
                $lnk = $WshShell.CreateShortcut((Join-Path $sd 'DisCRust v0.6.6.lnk'))
                $lnk.TargetPath = $script:TargetExeFinal
                $lnk.WorkingDirectory = $script:InstallDir
                $lnk.IconLocation = "$($script:InstallDir)\discrust.ico,0"
                $lnk.Description = "DisCRust v0.6.6"
                $lnk.Save()
            }
        }

        Set-Step 100 "Completed!"
        Start-Sleep -Milliseconds 250

        $script:CurrentStep = 2
        $CompSub.Text = "Installed to:`r`n$($script:InstallDir)"
        $PageInstall.Visible = $false
        $PageComplete.Visible = $true
        $CancelBtn.Visible = $false
        $ActionBtn.Text = "Finish"
        $ActionBtn.Enabled = $true
    } catch {
        $StatusLbl.ForeColor = [System.Drawing.Color]::FromArgb(242, 63, 67)
        Append-Log "[ERROR] $($_.Exception.Message)"
        $CancelBtn.Enabled = $true
    }
}

$ActionBtn.Add_Click({
    if ($script:CurrentStep -eq 0) {
        Run-Install
    } elseif ($script:CurrentStep -eq 2) {
        if ($LaunchChk.Checked -and (Test-Path $script:TargetExeFinal)) {
            Start-Process -FilePath $script:TargetExeFinal -WorkingDirectory $script:InstallDir
        }
        $Form.Close()
    }
})

[void]$Form.ShowDialog()
