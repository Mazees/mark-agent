# win-action.ps1
# Native Windows Win32 action executor for MARK PC Automation
# Supports: click, type, key, scroll, open, list-windows, focus-window

param(
    [string]$Action,
    [int]$X = 0,
    [int]$Y = 0,
    [string]$Text = "",
    [string]$Combo = "",
    [string]$Direction = "down",
    [int]$Amount = 3,
    [string]$Target = ""
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class Win32 {
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
        if (lower == "mark" || lower.StartsWith("mark -") || lower.StartsWith("mark_pc_stop") || lower.StartsWith("mark_unblock") || lower.Contains("mark agent") || lower.Contains("mark pc automation")) {
            return true;
        }
        return false;
    }

    public static void EnsureTargetWindowFocused() {
        IntPtr fg = GetForegroundWindow();
        string fgTitle = "";
        int fgLen = GetWindowTextLength(fg);
        if (fgLen > 0) {
            StringBuilder fgSb = new StringBuilder(fgLen + 1);
            GetWindowText(fg, fgSb, fgSb.Capacity);
            fgTitle = fgSb.ToString();
        }

        if (!IsMarkWindow(fgTitle)) {
            return;
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
            System.Threading.Thread.Sleep(200);
        }
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

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    public const int INPUT_KEYBOARD = 1;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint KEYEVENTF_UNICODE = 0x0004;
    public const ushort VK_RETURN = 0x0D;

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

function Execute-Click {
    [Win32]::SetCursorPos($X, $Y) | Out-Null
    Start-Sleep -Milliseconds 50
    [Win32]::mouse_event([Win32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 30
    [Win32]::mouse_event([Win32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    Write-Output "({`"status`":`"success`",`"action`":`"click`",`"x`":$X,`"y`":$Y})".Trim("()")
}

function Execute-DoubleClick {
    [Win32]::SetCursorPos($X, $Y) | Out-Null
    Start-Sleep -Milliseconds 50
    [Win32]::mouse_event([Win32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 30
    [Win32]::mouse_event([Win32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 50
    [Win32]::mouse_event([Win32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 30
    [Win32]::mouse_event([Win32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    Write-Output "({`"status`":`"success`",`"action`":`"doubleclick`",`"x`":$X,`"y`":$Y})".Trim("()")
}

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

function Execute-Type {
    [Win32]::EnsureTargetWindowFocused()
    if (-not [string]::IsNullOrEmpty($Text)) {
        $escaped = Escape-SendKeys -str $Text
        try {
            [System.Windows.Forms.SendKeys]::SendWait($escaped)
            Write-Output "({`"status`":`"success`",`"action`":`"type`",`"text`":`"$Text`"})".Trim("()")
        } catch {
            Write-Output '{"status":"error","message":"SendKeys failed for type"}'
        }
    } else {
        Write-Output '{"status":"error","message":"Empty text"}'
    }
}

function Execute-Key {
    [Win32]::EnsureTargetWindowFocused()
    if (-not [string]::IsNullOrEmpty($Combo)) {
        $keys = $Combo.ToLower().Trim()
        $sendStr = ""
        
        # Convert common key combos to SendKeys format
        $keys = $keys -replace 'ctrl\+', '^'
        $keys = $keys -replace 'alt\+', '%'
        $keys = $keys -replace 'shift\+', '+'
        
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
            [Win32]::keybd_event([Win32]::VK_LWIN, 0, 0, 0)
            Start-Sleep -Milliseconds 20
            [Win32]::keybd_event([Win32]::VK_LWIN, 0, [Win32]::KEYEVENTF_KEYUP, 0)
            Write-Output "({`"status`":`"success`",`"action`":`"key`",`"combo`":`"$Combo`"})".Trim("()")
            return
        }

        if ($specialMap.ContainsKey($keys)) {
            $sendStr = $specialMap[$keys]
        } else {
            $sendStr = $keys
        }

        try {
            [System.Windows.Forms.SendKeys]::SendWait($sendStr)
            Write-Output "({`"status`":`"success`",`"action`":`"key`",`"combo`":`"$Combo`"})".Trim("()")
        } catch {
            Write-Output "({`"status`":`"error`",`"message`":`"Invalid key combo: $Combo`"})".Trim("()")
        }
    } else {
        Write-Output '{"status":"error","message":"Empty combo"}'
    }
}

function Execute-Scroll {
    $delta = 120 * $Amount
    if ($Direction -eq "down") {
        $delta = -$delta
    }
    [Win32]::mouse_event([Win32]::MOUSEEVENTF_WHEEL, 0, 0, $delta, 0)
    Write-Output "({`"status`":`"success`",`"action`":`"scroll`",`"direction`":`"$Direction`",`"amount`":$Amount})".Trim("()")
}

function Execute-Open {
    if (-not [string]::IsNullOrEmpty($Target)) {
        try {
            Start-Process -FilePath $Target
            Write-Output "({`"status`":`"success`",`"action`":`"open`",`"target`":`"$Target`"})".Trim("()")
        } catch {
            Write-Output "({`"status`":`"error`",`"message`":`"Failed to open app: $Target`"})".Trim("()")
        }
    } else {
        Write-Output '{"status":"error","message":"Empty target"}'
    }
}

function Execute-ListWindows {
    $res = [Win32]::ListWindowsJson()
    Write-Output $res
}

function Execute-FocusWindow {
    if (-not [string]::IsNullOrEmpty($Target)) {
        $res = [Win32]::FocusWindowByTitle($Target)
        Write-Output $res
    } else {
        Write-Output '{"status":"error","message":"Empty target"}'
    }
}

switch ($Action.ToLower()) {
    "click" { Execute-Click }
    "doubleclick" { Execute-DoubleClick }
    "type" { Execute-Type }
    "key" { Execute-Key }
    "scroll" { Execute-Scroll }
    "open" { Execute-Open }
    "list-windows" { Execute-ListWindows }
    "focus-window" { Execute-FocusWindow }
    default { Write-Output '{"status":"error","message":"Unknown action: ' + $Action + '"}' }
}
