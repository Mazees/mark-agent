# pc-daemon.ps1
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
}

[StructLayout(LayoutKind.Sequential)]
public struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
}

[StructLayout(LayoutKind.Sequential)]
public struct INPUT {
    public int type;
    public KEYBDINPUT ki;
}

public class MarkWin32 {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, int dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    public const int INPUT_KEYBOARD = 1;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint KEYEVENTF_UNICODE = 0x0004;
    public const ushort VK_RETURN = 0x0D;
    
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    public const int KEYEVENTF_EXTENDEDKEY = 0x0001;
    public const byte VK_LWIN = 0x5B;

    public static string ListWindowsJson() {
        StringBuilder json = new StringBuilder();
        json.Append("[");
        bool first = true;
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            int len = GetWindowTextLength(hWnd);
            if (len > 0) {
                StringBuilder sb = new StringBuilder(len + 1);
                GetWindowText(hWnd, sb, sb.Capacity);
                string title = sb.ToString();
                if (!string.IsNullOrWhiteSpace(title) && title != "Program Manager" && title != "Default IME" && !title.StartsWith("MSCTFIME")) {
                    if (!first) json.Append(",");
                    first = false;
                    json.Append("{\"hwnd\":").Append(hWnd.ToInt64()).Append(",\"title\":\"").Append(title.Replace("\\", "\\\\").Replace("\"", "\\\"")).Append("\"}");
                }
            }
            return true;
        }, IntPtr.Zero);
        json.Append("]");
        return json.ToString();
    }

    public static string FocusWindowByTitle(string target) {
        string lowerTarget = target.ToLower();
        bool found = false;
        string foundTitle = "";
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            int len = GetWindowTextLength(hWnd);
            if (len > 0) {
                StringBuilder sb = new StringBuilder(len + 1);
                GetWindowText(hWnd, sb, sb.Capacity);
                string title = sb.ToString();
                if (title.ToLower().Contains(lowerTarget)) {
                    ShowWindow(hWnd, 9); // SW_RESTORE = 9
                    SetForegroundWindow(hWnd);
                    found = true;
                    foundTitle = title;
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);
        if (found) {
            return "{\"status\":\"success\",\"action\":\"focus-window\",\"title\":\"" + foundTitle.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}";
        }
        return "{\"status\":\"error\",\"message\":\"Window not found: " + target.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}";
    }

    public static bool IsMarkWindow(string title) {
        if (string.IsNullOrWhiteSpace(title)) return true;
        string t = title.Trim();
        if (t == "Program Manager" || t == "Default IME" || t.StartsWith("MSCTFIME")) return true;
        string lower = t.ToLower();
        if (lower == "mark" || lower.StartsWith("mark -") || lower.StartsWith("mark_pc_stop") || lower.StartsWith("mark_pc_abort") || lower.StartsWith("mark_unblock") || lower.Contains("mark agent") || lower.Contains("mark pc automation")) {
            return true;
        }
        return false;
    }

    public static IntPtr GetTargetWindow() {
        IntPtr fg = GetForegroundWindow();
        string fgTitle = "";
        int fgLen = GetWindowTextLength(fg);
        if (fgLen > 0) {
            StringBuilder fgSb = new StringBuilder(fgLen + 1);
            GetWindowText(fg, fgSb, fgSb.Capacity);
            fgTitle = fgSb.ToString();
        }

        if (!IsMarkWindow(fgTitle)) {
            return fg;
        }

        IntPtr target = IntPtr.Zero;
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            if (!IsWindowVisible(hWnd) || IsIconic(hWnd)) return true;
            int len = GetWindowTextLength(hWnd);
            if (len <= 0) return true;
            StringBuilder sb = new StringBuilder(len + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            string title = sb.ToString();

            if (!IsMarkWindow(title)) {
                target = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        if (target != IntPtr.Zero) {
            SetForegroundWindow(target);
            return target;
        }
        return fg;
    }

    public static void EnsureTargetWindowFocused() {
        IntPtr target = GetTargetWindow();
        if (target != IntPtr.Zero) {
            SetForegroundWindow(target);
            System.Threading.Thread.Sleep(200);
        }
    }

    public static string TypeTextUnicode(string text) {
        string normalized = text.Replace("\r\n", "\n").Replace("\r", "\n");
        foreach (char c in normalized) {
            if (c == '\n') {
                INPUT[] inputs = new INPUT[2];
                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].ki.wVk = VK_RETURN;
                inputs[0].ki.wScan = 0;
                inputs[0].ki.dwFlags = 0;

                inputs[1].type = INPUT_KEYBOARD;
                inputs[1].ki.wVk = VK_RETURN;
                inputs[1].ki.wScan = 0;
                inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;

                SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
                System.Threading.Thread.Sleep(15);
            } else {
                INPUT[] inputs = new INPUT[2];
                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].ki.wVk = 0;
                inputs[0].ki.wScan = (ushort)c;
                inputs[0].ki.dwFlags = KEYEVENTF_UNICODE;

                inputs[1].type = INPUT_KEYBOARD;
                inputs[1].ki.wVk = 0;
                inputs[1].ki.wScan = (ushort)c;
                inputs[1].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

                SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
                System.Threading.Thread.Sleep(8);
            }
        }
        return "{\"status\":\"success\",\"action\":\"type\",\"text\":\"" + text.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n") + "\"}";
    }
}
"@
Add-Type -TypeDefinition $code -Language CSharp

function Escape-SendKeys {
    param([string]$str)
    if ([string]::IsNullOrEmpty($str)) { return "" }
    $res = ""
    foreach ($char in $str.ToCharArray()) {
        if ("+^%~(){}[]".Contains($char.ToString())) {
            $res += "{$char}"
        } elseif ($char -eq "`n" -or $char -eq "`r") {
            $res += "{ENTER}"
        } else {
            $res += $char
        }
    }
    return $res
}

Write-Output '{"status":"ready"}'
Write-Output "---MARK_DONE---"
[Console]::Out.Flush()

$global:ElementCache = @{}

while ($true) {
    $line = [Console]::ReadLine()
    if ($null -eq $line) { break }
    $line = $line.Trim()
    if ($line -eq "") { continue }

    try {
        $cmdObj = $line | ConvertFrom-Json
        $cmd = $cmdObj.cmd

        if ($cmd -eq "exit") { break }

        switch ($cmd) {
            "read-focus" {
                $global:ElementCache.Clear()
                $hwnd = [MarkWin32]::GetTargetWindow()
                $titleBuilder = New-Object System.Text.StringBuilder 512
                [MarkWin32]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
                $windowTitle = $titleBuilder.ToString()
                
                $elements = @()
                try {
                    $el = [System.Windows.Automation.AutomationElement]::FocusedElement
                    if ($el) {
                        $role = $el.Current.ControlType.ProgrammaticName.Replace("ControlType.", "")
                        $name = $el.Current.Name
                        $autoId = $el.Current.AutomationId
                        $rect = $el.Current.BoundingRectangle
                        
                        $val = ""
                        try {
                            $valuePattern = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                            if ($valuePattern) { $val = $valuePattern.Current.Value }
                        } catch {}
                        
                        $elementObj = @{
                            id = 1
                            name = if ($name) { $name } else { $autoId }
                            role = $role
                            rect = @([int]$rect.X, [int]$rect.Y, [int]$rect.Width, [int]$rect.Height)
                        }
                        if ($val) { $elementObj["value"] = $val }
                        
                        $global:ElementCache[1] = $el
                        $elements += $elementObj
                    }
                } catch {}
                
                $output = @{
                    window = $windowTitle
                    process = "focused"
                    elements = $elements
                    element_count = $elements.Count
                    method = "uiautomation-focus"
                }
                Write-Output ($output | ConvertTo-Json -Depth 5 -Compress)
            }
            "read-ui" {
                $global:ElementCache.Clear()
                $maxElements = if ($cmdObj.maxElements) { [int]$cmdObj.maxElements } else { 300 }
                $filterRoles = $cmdObj.roles

                $hwnd = [MarkWin32]::GetTargetWindow()
                $titleBuilder = New-Object System.Text.StringBuilder 512
                [MarkWin32]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
                $windowTitle = $titleBuilder.ToString()

                $processId = 0
                [MarkWin32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
                $processName = "unknown"
                if ($processId -gt 0) {
                    try {
                        $proc = Get-Process -Id $processId
                        $processName = $proc.ProcessName + ".exe"
                    } catch {}
                }

                $elements = @()
                $idCounter = 1

                try {
                    $windowElement = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
                    if ($windowElement) {
                        $condition = [System.Windows.Automation.Condition]::TrueCondition
                        
                        $allControls = $windowElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
                        
                        foreach ($el in $allControls) {
                            if ($idCounter -gt $maxElements) { break }
                            
                            $enabled = $el.Current.IsEnabled
                            $offscreen = $el.Current.IsOffscreen
                            if (-not $enabled -or $offscreen) { continue }

                            $role = $el.Current.ControlType.ProgrammaticName.Replace("ControlType.", "")
                            
                            if ($filterRoles) {
                                if ($filterRoles -notcontains $role) { continue }
                            } else {
                                $interactiveRoles = @("Button", "Edit", "MenuItem", "TabItem", "ComboBox", "CheckBox", "RadioButton", "Hyperlink", "ListItem", "TreeItem", "DataItem", "Text")
                                if ($interactiveRoles -notcontains $role) { continue }
                            }

                            $name = $el.Current.Name
                            $autoId = $el.Current.AutomationId
                            $rect = $el.Current.BoundingRectangle

                            if ([string]::IsNullOrWhiteSpace($name) -and [string]::IsNullOrWhiteSpace($autoId) -and $role -ne "Edit") {
                                continue
                            }

                            $val = ""
                            if ($role -eq "Edit") {
                                try {
                                    $valuePattern = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                                    if ($valuePattern) { $val = $valuePattern.Current.Value }
                                } catch {}
                            }

                            $elementObj = @{
                                id = $idCounter
                                name = if ($name) { $name } else { $autoId }
                                role = $role
                                rect = @([int]$rect.X, [int]$rect.Y, [int]$rect.Width, [int]$rect.Height)
                            }
                            if ($val) {
                                $elementObj["value"] = $val
                            }

                            $global:ElementCache[$idCounter] = $el
                            $elements += $elementObj
                            $idCounter++
                        }
                    }
                } catch {
                }

                $output = @{
                    window = $windowTitle
                    process = $processName
                    elements = $elements
                    element_count = $elements.Count
                    method = "uiautomation"
                }
                Write-Output ($output | ConvertTo-Json -Depth 5 -Compress)
            }
            "ocr" {
                $hwnd = [MarkWin32]::GetTargetWindow()
                $titleBuilder = New-Object System.Text.StringBuilder 512
                [MarkWin32]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
                $windowTitle = $titleBuilder.ToString()

                $rect = New-Object RECT
                [MarkWin32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null

                $width = $rect.Right - $rect.Left
                $height = $rect.Bottom - $rect.Top

                if ($width -le 0 -or $height -le 0) {
                    $width = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width
                    $height = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height
                    $rect.Left = 0
                    $rect.Top = 0
                }

                $bmp = New-Object System.Drawing.Bitmap($width, $height)
                $graphics = [System.Drawing.Graphics]::FromImage($bmp)
                $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
                $tempPath = [System.IO.Path]::Combine($env:TEMP, "mark_ocr_temp_$([Guid]::NewGuid().ToString('N')).png")
                $bmp.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
                $graphics.Dispose()
                $bmp.Dispose()

                $detectedText = @()
                try {
                    $ocrEngine = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]::TryCreateFromUserProfileLanguages()
                    if ($ocrEngine) {
                        $file = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]::GetFileFromPathAsync($tempPath).GetAwaiter().GetResult()
                        $stream = $file.OpenAsync([Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]::Read).GetAwaiter().GetResult()
                        $decoder = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]::CreateAsync($stream).GetAwaiter().GetResult()
                        $bitmap = $decoder.GetSoftwareBitmapAsync().GetAwaiter().GetResult()

                        $result = $ocrEngine.RecognizeAsync($bitmap).GetAwaiter().GetResult()

                        $idCounter = 1
                        foreach ($line in $result.Lines) {
                            $lineText = $line.Text
                            if ([string]::IsNullOrWhiteSpace($lineText)) { continue }
                            
                            $firstWord = $line.Words[0]
                            $lastWord = $line.Words[$line.Words.Count - 1]

                            $lineX = $rect.Left + [int]$firstWord.BoundingRect.X
                            $lineY = $rect.Top + [int]$firstWord.BoundingRect.Y
                            $lineW = [int]($lastWord.BoundingRect.X + $lastWord.BoundingRect.Width - $firstWord.BoundingRect.X)
                            $lineH = [int]$firstWord.BoundingRect.Height

                            $detectedText += @{
                                id = $idCounter
                                text = $lineText
                                rect = @($lineX, $lineY, $lineW, $lineH)
                            }
                            $idCounter++
                            if ($idCounter -gt 60) { break }
                        }
                    }
                } catch {
                } finally {
                    if (Test-Path $tempPath) {
                        Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
                    }
                }

                $output = @{
                    window = $windowTitle
                    method = "ocr"
                    elements = $detectedText
                    element_count = $detectedText.Count
                }
                Write-Output ($output | ConvertTo-Json -Depth 5 -Compress)
            }
            "native-invoke" {
                $id = [int]$cmdObj.id
                $element = $global:ElementCache[$id]
                if ($element -ne $null) {
                    $success = $false
                    try {
                        $invokePattern = $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
                        $invokePattern.Invoke()
                        $success = $true
                        Write-Output (@{ status="success"; action="native-invoke"; id=$id } | ConvertTo-Json -Compress)
                    } catch {
                        try {
                            $togglePattern = $element.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
                            $togglePattern.Toggle()
                            $success = $true
                            Write-Output (@{ status="success"; action="native-invoke-toggle"; id=$id } | ConvertTo-Json -Compress)
                        } catch {}
                    }
                    
                    if (-not $success) {
                        try {
                            $rect = $element.Current.BoundingRectangle
                            if ($rect.Width -gt 0 -and $rect.Height -gt 0) {
                                $x = [int]($rect.X + ($rect.Width / 2))
                                $y = [int]($rect.Y + ($rect.Height / 2))
                                [MarkWin32]::EnsureTargetWindowFocused()
                                [MarkWin32]::SetCursorPos($x, $y) | Out-Null
                                Start-Sleep -Milliseconds 20
                                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
                                Start-Sleep -Milliseconds 20
                                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
                                Write-Output (@{ status="success"; action="native-invoke-fallback-click"; id=$id; x=$x; y=$y } | ConvertTo-Json -Compress)
                            } else {
                                Write-Output (@{ status="error"; message="Elemen tidak memiliki InvokePattern dan tidak terlihat di layar (BoundingRect kosong)" } | ConvertTo-Json -Compress)
                            }
                        } catch {
                            Write-Output (@{ status="error"; message="Elemen tidak memiliki InvokePattern dan gagal fallback klik fisik" } | ConvertTo-Json -Compress)
                        }
                    }
                } else {
                    Write-Output (@{ status="error"; message="ID Elemen tidak ditemukan di cache (Mungkin kadaluarsa, lakukan os-read ulang)" } | ConvertTo-Json -Compress)
                }
            }
            "click" {
                [MarkWin32]::EnsureTargetWindowFocused()
                $x = [int]$cmdObj.x
                $y = [int]$cmdObj.y
                [MarkWin32]::SetCursorPos($x, $y) | Out-Null
                Start-Sleep -Milliseconds 50
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
                Start-Sleep -Milliseconds 30
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
                
                Write-Output (@{ status="success"; action="click"; x=$x; y=$y } | ConvertTo-Json -Compress)
            }
            "double-click" {
                [MarkWin32]::EnsureTargetWindowFocused()
                $x = [int]$cmdObj.x
                $y = [int]$cmdObj.y
                [MarkWin32]::SetCursorPos($x, $y) | Out-Null
                Start-Sleep -Milliseconds 50
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
                Start-Sleep -Milliseconds 30
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
                Start-Sleep -Milliseconds 50
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
                Start-Sleep -Milliseconds 30
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
                
                Write-Output (@{ status="success"; action="double-click"; x=$x; y=$y } | ConvertTo-Json -Compress)
            }
            "type" {
                [MarkWin32]::EnsureTargetWindowFocused()
                $text = $cmdObj.text
                if (-not [string]::IsNullOrEmpty($text)) {
                    $escaped = Escape-SendKeys -str $text
                    try {
                        [System.Windows.Forms.SendKeys]::SendWait($escaped)
                        Write-Output (@{ status="success"; action="type"; text=$text } | ConvertTo-Json -Compress)
                    } catch {
                        Write-Output (@{ status="error"; message="SendKeys failed for type" } | ConvertTo-Json -Compress)
                    }
                } else {
                    Write-Output (@{ status="error"; message="Empty text" } | ConvertTo-Json -Compress)
                }
            }
            "key" {
                [MarkWin32]::EnsureTargetWindowFocused()
                $combo = $cmdObj.combo
                if (-not [string]::IsNullOrEmpty($combo)) {
                    $keys = $combo.ToLower().Trim()
                    $modifiers = ""
                    
                    if ($keys -match "ctrl\+") { $modifiers += "^"; $keys = $keys -replace "ctrl\+", "" }
                    if ($keys -match "alt\+") { $modifiers += "%"; $keys = $keys -replace "alt\+", "" }
                    if ($keys -match "shift\+") { $modifiers += "+"; $keys = $keys -replace "shift\+", "" }
                    if ($keys -match "win\+") { $keys = $keys -replace "win\+", "" } # SendKeys doesn't support Win key combo directly, but we strip it
                    
                    $specialMap = @{
                        "enter" = "{ENTER}"
                        "tab" = "{TAB}"
                        "esc" = "{ESC}"
                        "escape" = "{ESC}"
                        "backspace" = "{BACKSPACE}"
                        "del" = "{DELETE}"
                        "delete" = "{DELETE}"
                        "up" = "{UP}"
                        "down" = "{DOWN}"
                        "left" = "{LEFT}"
                        "right" = "{RIGHT}"
                        "home" = "{HOME}"
                        "end" = "{END}"
                        "space" = " "
                    }

                    if ($keys -eq "win") {
                        [MarkWin32]::keybd_event([MarkWin32]::VK_LWIN, 0, 0, 0)
                        Start-Sleep -Milliseconds 20
                        [MarkWin32]::keybd_event([MarkWin32]::VK_LWIN, 0, [MarkWin32]::KEYEVENTF_KEYUP, 0)
                        Write-Output (@{ status="success"; action="key"; combo=$combo } | ConvertTo-Json -Compress)
                        continue
                    }

                    if ($specialMap.ContainsKey($keys)) {
                        $sendStr = $modifiers + $specialMap[$keys]
                    } else {
                        if ($keys.Length -eq 1) {
                            $sendStr = $modifiers + $keys
                        } else {
                            $sendStr = $modifiers + "{" + $keys + "}"
                        }
                    }

                    try {
                        [System.Windows.Forms.SendKeys]::SendWait($sendStr)
                        Write-Output (@{ status="success"; action="key"; combo=$combo } | ConvertTo-Json -Compress)
                    } catch {
                        Write-Output (@{ status="error"; message="Invalid key combo: $combo" } | ConvertTo-Json -Compress)
                    }
                } else {
                    Write-Output (@{ status="error"; message="Empty combo" } | ConvertTo-Json -Compress)
                }
            }
            "scroll" {
                [MarkWin32]::EnsureTargetWindowFocused()
                $direction = if ($cmdObj.direction) { $cmdObj.direction } else { "down" }
                $amount = if ($cmdObj.amount) { [int]$cmdObj.amount } else { 3 }
                
                $delta = 120 * $amount
                if ($direction -eq "down") {
                    $delta = -$delta
                }
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_WHEEL, 0, 0, $delta, 0)
                Write-Output (@{ status="success"; action="scroll"; direction=$direction; amount=$amount } | ConvertTo-Json -Compress)
            }
            "open" {
                $target = $cmdObj.target
                if (-not [string]::IsNullOrEmpty($target)) {
                    try {
                        Start-Process -FilePath $target
                        Write-Output (@{ status="success"; action="open"; target=$target } | ConvertTo-Json -Compress)
                    } catch {
                        Write-Output (@{ status="error"; message="Failed to open app: $target" } | ConvertTo-Json -Compress)
                    }
                } else {
                    Write-Output (@{ status="error"; message="Empty target" } | ConvertTo-Json -Compress)
                }
            }
            "list-windows" {
                $res = [MarkWin32]::ListWindowsJson()
                Write-Output $res
            }
            "focus-window" {
                $title = $cmdObj.title
                if (-not [string]::IsNullOrEmpty($title)) {
                    $res = [MarkWin32]::FocusWindowByTitle($title)
                    Write-Output $res
                } else {
                    Write-Output (@{ status="error"; message="Empty title" } | ConvertTo-Json -Compress)
                }
            }
            "ping" {
                Write-Output (@{ status="alive" } | ConvertTo-Json -Compress)
            }
            default {
                Write-Output (@{ status="error"; message="Unknown command: $cmd" } | ConvertTo-Json -Compress)
            }
        }
    } catch {
        $err = @{ status = "error"; message = $_.Exception.Message }
        Write-Output ($err | ConvertTo-Json -Compress)
    }

    Write-Output "---MARK_DONE---"
    [Console]::Out.Flush()
}
