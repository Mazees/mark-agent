# pc-daemon.ps1
$ErrorActionPreference = 'Stop'
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
public struct POINT {
    public int X;
    public int Y;
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
    public INPUTUNION data;
}

[StructLayout(LayoutKind.Explicit)]
public struct INPUTUNION {
    [FieldOffset(0)] public KEYBDINPUT ki;
    [FieldOffset(0)] public MOUSEINPUT mi;
}

[StructLayout(LayoutKind.Sequential)]
public struct MOUSEINPUT {
    public int dx, dy;
    public uint mouseData, flags, time;
    public IntPtr extra;
}

[StructLayout(LayoutKind.Sequential)]
public struct CURSORINFO {
    public int cbSize;
    public int flags;
    public IntPtr hCursor;
    public POINT ptScreenPos;
}

[StructLayout(LayoutKind.Sequential)]
public struct ICONINFO {
    public bool fIcon;
    public int xHotspot;
    public int yHotspot;
    public IntPtr hbmMask;
    public IntPtr hbmColor;
}

public class MarkWin32 {
    public const int InputTag = 0x4D41524B;
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    public static void InitDpi() { try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch {} SetProcessDPIAware(); }
    public static IntPtr ExpectedWindow = IntPtr.Zero;
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint source, uint target, bool attach);

    public static void MoveCursor(int x, int y, int duration = 120) {
        POINT initial; GetCursorPos(out initial);
        int steps = duration <= 0 ? 1 : Math.Max(1, duration / 15);
        int left = GetSystemMetrics(76), top = GetSystemMetrics(77);
        int width = GetSystemMetrics(78), height = GetSystemMetrics(79);
        for (int i = 1; i <= steps; i++) {
            double t = (double)i / steps;
            double eased = t * t * (3 - 2 * t);
            int nextX = (int)Math.Round(initial.X + (x - initial.X) * eased);
            int nextY = (int)Math.Round(initial.Y + (y - initial.Y) * eased);
            uint nx = (uint)Math.Max(0, Math.Min(65535, Math.Round((nextX - left) * 65535.0 / Math.Max(1, width - 1))));
            uint ny = (uint)Math.Max(0, Math.Min(65535, Math.Round((nextY - top) * 65535.0 / Math.Max(1, height - 1))));
            mouse_event(0x0001 | 0x8000 | 0x4000, nx, ny, 0, InputTag);
            if (steps > 1) System.Threading.Thread.Sleep(Math.Max(1, duration / steps));
        }
    }
    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hObjectSource, int nXSrc, int nYSrc, int dwRop);

    public const int SRCCOPY = 0x00CC0020;

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetCursorInfo(out CURSORINFO pci);

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetIconInfo(IntPtr hIcon, out ICONINFO piconinfo);

    [DllImport("user32.dll")]
    public static extern bool DrawIconEx(IntPtr hdc, int xLeft, int yTop, IntPtr hIcon, int cxWidth, int cyHeight, uint istepIfAniCur, IntPtr hbrFlickerFreeDraw, uint diFlags);

    [DllImport("gdi32.dll")]
    public static extern bool DeleteObject(IntPtr hObject);

    public const int CURSOR_SHOWING = 0x00000001;
    public const uint DI_NORMAL = 0x0003;

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

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

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

    [DllImport("user32.dll")]
    public static extern IntPtr WindowFromPoint(POINT Point);

    [DllImport("user32.dll")]
    public static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd, uint command);
    public const uint GA_ROOT = 2;

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public const uint MOUSEEVENTF_MOVE = 0x0001;
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
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

    public static IntPtr LastFocusedHwnd = IntPtr.Zero;

    public static string GetWindowTitle(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return "";
        int len = GetWindowTextLength(hWnd);
        if (len <= 0) return "";
        StringBuilder sb = new StringBuilder(len + 1);
        GetWindowText(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }

    public static bool IsIgnoredWindow(string title) {
        if (string.IsNullOrWhiteSpace(title)) return true;
        string t = title.Trim();
        if (t == "Program Manager" || t == "Default IME" || t.StartsWith("MSCTFIME")) return true;
        if (t.StartsWith("GDI+ Window") || t.StartsWith("Shell Handwriting") || t == "Task Switching" ||
            t == "System tray overflow window." || t == "Battery Meter" || t.StartsWith(".NET-BroadcastEventWindow") ||
            t == "NvSvc" || t == "UxdService" || t == "Task Host Window" || t.StartsWith("DesktopWindowXamlSource") ||
            t.StartsWith("DDE Server") || t == "WISPTIS" || t == "EXPLORER" || t == "Hidden Window" ||
            t == "SystemResourceNotifyWindow" || t == "Windows Input Experience" || t == "MediaContextNotificationWindow" ||
            t.StartsWith("Cua.") || t == "Temp Window" || t == "MainWindow" || t == "AsHDRControl" || t == "AsHotplugCtr" ||
            t.StartsWith("ATKOSD") || t.StartsWith("Armoury") || t == "MacroKey Hidden Wnd") return true;

        string lower = t.ToLower();
        if (lower == "mark" || lower.StartsWith("mark -") || lower.StartsWith("mark_pc_stop") ||
            lower.StartsWith("mark_pc_abort") || lower.StartsWith("mark_unblock") ||
            lower.Contains("mark agent") || lower.Contains("mark pc automation") || lower.Contains("mark-overlay") || lower.Contains("mark computer use overlay")) {
            return true;
        }
        return false;
    }

    public static string ListWindowsJson() {
        StringBuilder json = new StringBuilder();
        json.Append("[");
        bool first = true;
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            if (!IsWindowVisible(hWnd) || IsIconic(hWnd)) return true;
            string title = GetWindowTitle(hWnd);
            if (!IsIgnoredWindow(title)) {
                if (!first) json.Append(",");
                first = false;
                uint pid; GetWindowThreadProcessId(hWnd, out pid);
                json.Append("{\"window_id\":\"").Append(hWnd.ToInt64()).Append("\",\"hwnd\":").Append(hWnd.ToInt64()).Append(",\"process_id\":").Append(pid).Append(",\"title\":\"").Append(title.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ")).Append("\"}");
            }
            return true;
        }, IntPtr.Zero);
        json.Append("]");
        return json.ToString();
    }

    public static string FocusWindowByTitle(string target, bool maximize = true) {
        string lowerTarget = target.ToLower();
        bool found = false;
        string foundTitle = "";
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            string title = GetWindowTitle(hWnd);
            if (title.ToLower().Contains(lowerTarget)) {
                if (maximize) {
                    ShowWindow(hWnd, 3); // SW_MAXIMIZE = 3 (Maximize & Activate)
                } else {
                    ShowWindow(hWnd, 9); // SW_RESTORE = 9
                }
                BringWindowToTop(hWnd);
                SetForegroundWindow(hWnd);
                found = true;
                foundTitle = title;
                LastFocusedHwnd = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        if (found) {
            return "{\"status\":\"success\",\"action\":\"focus-window\",\"title\":\"" + foundTitle.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}";
        }
        return "{\"status\":\"error\",\"message\":\"Window not found: " + target.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}";
    }

    public static void FocusWindowById(long id, bool maximize) {
        IntPtr window = new IntPtr(id);
        if (!IsWindow(window) || !IsWindowVisible(window)) throw new InvalidOperationException("Jendela target sudah ditutup.");
        if (maximize || IsIconic(window)) ShowWindow(window, maximize ? 3 : 9);
        IntPtr previous = GetForegroundWindow();
        uint ignored;
        uint foregroundThread = GetWindowThreadProcessId(previous, out ignored);
        uint currentThread = GetCurrentThreadId();
        bool attached = currentThread != foregroundThread && AttachThreadInput(currentThread, foregroundThread, true);
        try { BringWindowToTop(window); SetForegroundWindow(window); }
        finally { if (attached) AttachThreadInput(currentThread, foregroundThread, false); }
        System.Threading.Thread.Sleep(80);
        if (GetForegroundWindow() != window) throw new InvalidOperationException("Windows menolak aktivasi target. Pilih jendelanya lalu ambil screenshot baru.");
        LastFocusedHwnd = window;
    }

    public static void FocusWindowAtPoint(int x, int y) {
        POINT pt = new POINT { X = x, Y = y };
        IntPtr w = WindowFromPoint(pt);
        if (w != IntPtr.Zero) {
            IntPtr root = GetAncestor(w, GA_ROOT);
            if (root == IntPtr.Zero) root = w;
            if (ExpectedWindow != IntPtr.Zero && root != ExpectedWindow) {
                uint ownerPid, targetPid;
                GetWindowThreadProcessId(root, out ownerPid);
                GetWindowThreadProcessId(ExpectedWindow, out targetPid);
                if (ownerPid != targetPid) throw new InvalidOperationException("Koordinat berada pada aplikasi lain. Ambil screenshot baru.");
            }
            string title = GetWindowTitle(root);
            if (!IsIgnoredWindow(title)) {
                LastFocusedHwnd = root;
                if (GetForegroundWindow() != root) {
                    BringWindowToTop(root);
                    SetForegroundWindow(root);
                    System.Threading.Thread.Sleep(60);
                }
                return;
            }
        }
        EnsureTargetWindowFocused();
    }

    public static void EnsureTargetWindowFocused() {
        IntPtr target = GetTargetWindow();
        if (target != IntPtr.Zero && GetForegroundWindow() != target) {
            BringWindowToTop(target);
            SetForegroundWindow(target);
            System.Threading.Thread.Sleep(80);
        }
    }

    public static IntPtr GetTargetWindow() {
        IntPtr fg = GetForegroundWindow();
        string fgTitle = GetWindowTitle(fg);
        if (!IsIgnoredWindow(fgTitle)) {
            LastFocusedHwnd = fg;
            return fg;
        }

        return fg;
    }

    public static string TypeTextUnicode(string text) {
        string normalized = text.Replace("\r\n", "\n").Replace("\r", "\n");
        foreach (char c in normalized) {
            if (c == '\n') {
                INPUT[] inputs = new INPUT[2];
                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].data.ki.wVk = VK_RETURN;
                inputs[0].data.ki.wScan = 0;
                inputs[0].data.ki.dwFlags = 0;
                inputs[0].data.ki.dwExtraInfo = new IntPtr(InputTag);

                inputs[1].type = INPUT_KEYBOARD;
                inputs[1].data.ki.wVk = VK_RETURN;
                inputs[1].data.ki.wScan = 0;
                inputs[1].data.ki.dwFlags = KEYEVENTF_KEYUP;
                inputs[1].data.ki.dwExtraInfo = new IntPtr(InputTag);

                if (SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT))) != 2) throw new InvalidOperationException("Windows menolak input keyboard.");
                System.Threading.Thread.Sleep(15);
            } else {
                INPUT[] inputs = new INPUT[2];
                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].data.ki.wVk = 0;
                inputs[0].data.ki.wScan = (ushort)c;
                inputs[0].data.ki.dwFlags = KEYEVENTF_UNICODE;
                inputs[0].data.ki.dwExtraInfo = new IntPtr(InputTag);

                inputs[1].type = INPUT_KEYBOARD;
                inputs[1].data.ki.wVk = 0;
                inputs[1].data.ki.wScan = (ushort)c;
                inputs[1].data.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                inputs[1].data.ki.dwExtraInfo = new IntPtr(InputTag);

                if (SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT))) != 2) throw new InvalidOperationException("Windows menolak input keyboard.");
                System.Threading.Thread.Sleep(8);
            }
        }
        return "{\"status\":\"success\",\"action\":\"type\",\"text\":\"" + text.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n") + "\"}";
    }

    public static bool DrawCursor(IntPtr hdc, int screenLeft, int screenTop, out int cursorX, out int cursorY, out bool drawn) {
        cursorX = 0;
        cursorY = 0;
        drawn = false;
        try {
            CURSORINFO pci = new CURSORINFO();
            pci.cbSize = Marshal.SizeOf(typeof(CURSORINFO));
            bool ok = GetCursorInfo(out pci);
            POINT pt = new POINT();
            if (ok && (pci.flags & CURSOR_SHOWING) != 0) {
                pt = pci.ptScreenPos;
            } else {
                GetCursorPos(out pt);
            }
            cursorX = pt.X;
            cursorY = pt.Y;

            int relX = pt.X - screenLeft;
            int relY = pt.Y - screenTop;

            if (ok && (pci.flags & CURSOR_SHOWING) != 0 && pci.hCursor != IntPtr.Zero) {
                ICONINFO info;
                int drawX = relX;
                int drawY = relY;
                if (GetIconInfo(pci.hCursor, out info)) {
                    drawX -= info.xHotspot;
                    drawY -= info.yHotspot;
                    if (info.hbmColor != IntPtr.Zero) DeleteObject(info.hbmColor);
                    if (info.hbmMask != IntPtr.Zero) DeleteObject(info.hbmMask);
                }
                DrawIconEx(hdc, drawX, drawY, pci.hCursor, 0, 0, 0, IntPtr.Zero, DI_NORMAL);
                drawn = true;
            }
            return true;
        } catch {
            return false;
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    public static int GetIdleSeconds() {
        LASTINPUTINFO lii = new LASTINPUTINFO();
        lii.cbSize = (uint)Marshal.SizeOf(lii);
        if (GetLastInputInfo(ref lii)) {
            uint idleMs = (uint)Environment.TickCount - lii.dwTime;
            return (int)(idleMs / 1000);
        }
        return 0;
    }
}
"@
Add-Type -TypeDefinition $code -Language CSharp
try { [MarkWin32]::InitDpi() } catch {}

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

function Get-VirtualKeyCode {
    param([string]$keyName)
    if ([string]::IsNullOrWhiteSpace($keyName)) { return [byte]0 }
    $k = $keyName.ToLower().Trim()
    $vkMap = @{
        "enter" = 0x0D; "return" = 0x0D; "tab" = 0x09; "space" = 0x20
        "esc" = 0x1B; "escape" = 0x1B; "backspace" = 0x08; "del" = 0x2E; "delete" = 0x2E
        "shift" = 0x10; "ctrl" = 0x11; "control" = 0x11; "alt" = 0x12; "win" = 0x5B
        "up" = 0x26; "down" = 0x28; "left" = 0x25; "right" = 0x27
        "home" = 0x24; "end" = 0x23; "pageup" = 0x21; "pagedown" = 0x22
        "f1" = 0x70; "f2" = 0x71; "f3" = 0x72; "f4" = 0x73; "f5" = 0x74; "f6" = 0x75
        "f7" = 0x76; "f8" = 0x77; "f9" = 0x78; "f10" = 0x79; "f11" = 0x7A; "f12" = 0x7B
    }
    if ($vkMap.ContainsKey($k)) {
        return [byte]$vkMap[$k]
    }
    if ($k.Length -eq 1) {
        $c = [char]$k.ToUpper()[0]
        if (($c -ge 'A' -and $c -le 'Z') -or ($c -ge '0' -and $c -le '9')) {
            return [byte][int]$c
        }
    }
    return [byte]0
}

function Get-DesktopGeometry {
    $hwnd = [MarkWin32]::GetForegroundWindow()
    if ($hwnd -eq [IntPtr]::Zero) { throw 'Tidak ada jendela aktif untuk diamati.' }
    $screen = [System.Windows.Forms.Screen]::FromHandle($hwnd)
    $rect = New-Object RECT
    [MarkWin32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
    [uint32]$targetProcessId = 0
    [MarkWin32]::GetWindowThreadProcessId($hwnd, [ref]$targetProcessId) | Out-Null
    $processStarted = ''
    try { $processStarted = (Get-Process -Id $targetProcessId).StartTime.ToUniversalTime().ToString('o') } catch {}
    $owners = @()
    $owner = [MarkWin32]::GetWindow($hwnd, 4)
    while ($owner -ne [IntPtr]::Zero -and $owners.Count -lt 10) {
        $owners += $owner.ToInt64().ToString()
        $owner = [MarkWin32]::GetWindow($owner, 4)
    }
    return @{
        status = 'success'; window_id = $hwnd.ToInt64().ToString(); foreground_window_id = $hwnd.ToInt64().ToString()
        window_title = [MarkWin32]::GetWindowTitle($hwnd); process_id = $targetProcessId; process_started_at = $processStarted
        owner_window_ids = @($owners)
        window_rect = @($rect.Left, $rect.Top, ($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top))
        screen_x = $screen.Bounds.X; screen_y = $screen.Bounds.Y; host_width = $screen.Bounds.Width; host_height = $screen.Bounds.Height
        canonical_width = 1280; canonical_height = 720
    }
}

function Capture-ScreenJpeg {
    param(
        [int]$targetWidth = 1280,
        [int]$targetHeight = 720,
        [int]$quality = 75,
        [bool]$showRuler = $true
    )
    $bmp = $null
    $graphics = $null
    $scaled = $null
    $gScaled = $null
    $ms = $null

    try {
        $geometry = Get-DesktopGeometry
        $bounds = New-Object System.Drawing.Rectangle($geometry.screen_x, $geometry.screen_y, $geometry.host_width, $geometry.host_height)
        $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bmp)

        # Render screen and system cursor directly using Win32 BitBlt (zero copy handle dependency)
        $cursorHostX = 0
        $cursorHostY = 0
        $cursorDrawn = $false
        $hdcSrc = [MarkWin32]::GetDC([IntPtr]::Zero)
        if ($hdcSrc -ne [IntPtr]::Zero) {
            $hdcDest = [IntPtr]::Zero
            try {
                $hdcDest = $graphics.GetHdc()
                [MarkWin32]::BitBlt($hdcDest, 0, 0, $bounds.Width, $bounds.Height, $hdcSrc, $bounds.X, $bounds.Y, [MarkWin32]::SRCCOPY) | Out-Null
            } finally {
                if ($hdcDest -ne [IntPtr]::Zero) {
                    try { $graphics.ReleaseHdc($hdcDest) } catch {}
                }
                [MarkWin32]::ReleaseDC([IntPtr]::Zero, $hdcSrc) | Out-Null
            }
        } else {
            $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)
            $hdc = [IntPtr]::Zero
            try {
                $hdc = $graphics.GetHdc()
            } catch {} finally {
                if ($hdc -ne [IntPtr]::Zero) {
                    try { $graphics.ReleaseHdc($hdc) } catch {}
                }
            }
        }

        $cursorPosition = New-Object POINT
        [MarkWin32]::GetCursorPos([ref]$cursorPosition) | Out-Null
        $cursorHostX = $cursorPosition.X
        $cursorHostY = $cursorPosition.Y

        $canonicalX = [Math]::Round(($cursorHostX - $bounds.X) * $targetWidth / [Math]::Max(1, $bounds.Width))
        $canonicalY = [Math]::Round(($cursorHostY - $bounds.Y) * $targetHeight / [Math]::Max(1, $bounds.Height))

        $scaled = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight)
        $gScaled = [System.Drawing.Graphics]::FromImage($scaled)
        $gScaled.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $gScaled.DrawImage($bmp, 0, 0, $targetWidth, $targetHeight)
        if ($canonicalX -ge 0 -and $canonicalX -lt $targetWidth -and $canonicalY -ge 0 -and $canonicalY -lt $targetHeight) {
            $cursorPath = New-Object System.Drawing.Drawing2D.GraphicsPath
            $points = [System.Drawing.PointF[]]@(
                (New-Object System.Drawing.PointF($canonicalX, $canonicalY)),
                (New-Object System.Drawing.PointF(($canonicalX + 18), ($canonicalY + 11))),
                (New-Object System.Drawing.PointF(($canonicalX + 10), ($canonicalY + 13))),
                (New-Object System.Drawing.PointF(($canonicalX + 6), ($canonicalY + 21)))
            )
            $cursorPath.AddPolygon($points)
            $cursorPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 1.7)
            $cursorGlow = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(65, 34, 197, 94), 6)
            $gScaled.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $gScaled.DrawPath($cursorGlow, $cursorPath)
            $gScaled.FillPath([System.Drawing.Brushes]::Black, $cursorPath)
            $gScaled.DrawPath($cursorPen, $cursorPath)
            $cursorGlow.Dispose(); $cursorPen.Dispose(); $cursorPath.Dispose()
        }

        # Render precision coordinate rulers and guide grid along edges for AI grounding
        if ($showRuler) {
            try {
                $gScaled.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
                $gScaled.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

                $rulerFont = New-Object System.Drawing.Font("Consolas", 7.5, [System.Drawing.FontStyle]::Bold)
                $rulerBgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 15, 23, 42)) # Slate 900
                $rulerTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 56, 189, 248)) # Cyan 400
                $rulerBorderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 56, 189, 248), 1)
                $rulerGridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(35, 56, 189, 248), 1)
                $rulerGridPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash

                $rulerH = 14
                $rulerW = 28

                # Top ruler bar (Sumbu X)
                $gScaled.FillRectangle($rulerBgBrush, 0, 0, $targetWidth, $rulerH)
                $gScaled.DrawLine($rulerBorderPen, 0, $rulerH, $targetWidth, $rulerH)

                # Left ruler bar (Sumbu Y)
                $gScaled.FillRectangle($rulerBgBrush, 0, 0, $rulerW, $targetHeight)
                $gScaled.DrawLine($rulerBorderPen, $rulerW, 0, $rulerW, $targetHeight)

                # Origin label (0,0)
                $gScaled.DrawString("0,0", $rulerFont, $rulerTextBrush, 2, 1)

                # Sumbu X ticks & labels every 100px
                for ($rx = 100; $rx -lt $targetWidth; $rx += 100) {
                    $gScaled.DrawLine($rulerGridPen, $rx, $rulerH, $rx, $targetHeight)
                    $gScaled.DrawLine($rulerBorderPen, $rx, 0, $rx, $rulerH)
                    $rxStr = $rx.ToString()
                    $gScaled.DrawString($rxStr, $rulerFont, $rulerTextBrush, ($rx - 10), 1)
                }

                # Sumbu Y ticks & labels every 100px
                for ($ry = 100; $ry -lt $targetHeight; $ry += 100) {
                    $gScaled.DrawLine($rulerGridPen, $rulerW, $ry, $targetWidth, $ry)
                    $gScaled.DrawLine($rulerBorderPen, 0, $ry, $rulerW, $ry)
                    $ryStr = $ry.ToString()
                    $gScaled.DrawString($ryStr, $rulerFont, $rulerTextBrush, 2, ($ry - 6))
                }

                $rulerFont.Dispose()
                $rulerBgBrush.Dispose()
                $rulerTextBrush.Dispose()
                $rulerBorderPen.Dispose()
                $rulerGridPen.Dispose()
            } catch {}
        }

        $ms = New-Object System.IO.MemoryStream
        $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
        $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
        $scaled.Save($ms, $codec, $encoderParams)

        $bytes = $ms.ToArray()
        $base64 = [Convert]::ToBase64String($bytes)

        $after = Get-DesktopGeometry
        if (($geometry | ConvertTo-Json -Compress) -ne ($after | ConvertTo-Json -Compress)) { throw 'Jendela berubah selama capture. Ambil observasi baru.' }
        $geometry += @{
            image = "data:image/jpeg;base64,$base64"
            cursor = @($canonicalX, $canonicalY)
            cursor_host = @($cursorHostX, $cursorHostY)
        }
        return $geometry
    } catch {
        return @{
            status = "error"
            message = $_.Exception.Message
        }
    } finally {
        if ($gScaled -ne $null) { try { $gScaled.Dispose() } catch {} }
        if ($scaled -ne $null) { try { $scaled.Dispose() } catch {} }
        if ($graphics -ne $null) { try { $graphics.Dispose() } catch {} }
        if ($bmp -ne $null) { try { $bmp.Dispose() } catch {} }
        if ($ms -ne $null) { try { $ms.Dispose() } catch {} }
    }
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

        [MarkWin32]::ExpectedWindow = [IntPtr]::Zero
        if ($cmdObj.expectedWindowId -and $cmd -notin @('capture-screen', 'get-screen-info', 'list-windows', 'focus-window', 'open', 'get-active-window', 'get-idle', 'read-ui')) {
            $expected = [IntPtr][long]$cmdObj.expectedWindowId
            [uint32]$actualProcess = 0
            [MarkWin32]::GetWindowThreadProcessId($expected, [ref]$actualProcess) | Out-Null
            if (-not [MarkWin32]::IsWindow($expected) -or [MarkWin32]::GetForegroundWindow() -ne $expected -or $actualProcess -ne [uint32]$cmdObj.expectedProcessId) {
                throw 'Target berubah sebelum aksi dijalankan. Ambil screenshot baru.'
            }
            [MarkWin32]::ExpectedWindow = $expected
        }

        switch ($cmd) {
            "get-idle" {
                $idle = [MarkWin32]::GetIdleSeconds()
                Write-Output (@{ status="success"; idleSeconds=$idle } | ConvertTo-Json -Compress)
            }
            "get-active-window" {
                $hwnd = [MarkWin32]::GetForegroundWindow()
                $titleBuilder = New-Object System.Text.StringBuilder 512
                [MarkWin32]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
                $windowTitle = $titleBuilder.ToString()
                
                $processId = 0
                [MarkWin32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
                $procName = "Windows App"
                if ($processId -gt 0) {
                    try {
                        $p = Get-Process -Id $processId -ErrorAction SilentlyContinue
                        if ($p) { $procName = $p.ProcessName }
                    } catch {}
                }
                Write-Output (@{ status="success"; title=$windowTitle; process=$procName } | ConvertTo-Json -Compress)
            }
            "read-focus" {
                $global:ElementCache.Clear()
                $hwnd = [MarkWin32]::GetForegroundWindow()
                $titleBuilder = New-Object System.Text.StringBuilder 512
                [MarkWin32]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
                $windowTitle = $titleBuilder.ToString()
                
                $processId = 0
                [MarkWin32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
                $procName = "Windows App"
                if ($processId -gt 0) {
                    try {
                        $p = Get-Process -Id $processId -ErrorAction SilentlyContinue
                        if ($p) { $procName = $p.ProcessName }
                    } catch {}
                }

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
                    process = $procName
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

                $hdcSrc = [MarkWin32]::GetDC([IntPtr]::Zero)
                if ($hdcSrc -ne [IntPtr]::Zero) {
                    $hdcDest = $graphics.GetHdc()
                    [MarkWin32]::BitBlt($hdcDest, 0, 0, $width, $height, $hdcSrc, $rect.Left, $rect.Top, [MarkWin32]::SRCCOPY) | Out-Null
                    $graphics.ReleaseHdc($hdcDest)
                    [MarkWin32]::ReleaseDC([IntPtr]::Zero, $hdcSrc) | Out-Null
                } else {
                    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
                }
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
                                [MarkWin32]::MoveCursor($x, $y) | Out-Null
                                Start-Sleep -Milliseconds 20
                                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [MarkWin32]::InputTag)
                                Start-Sleep -Milliseconds 20
                                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [MarkWin32]::InputTag)
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
                $x = [int]$cmdObj.x
                $y = [int]$cmdObj.y
                [MarkWin32]::FocusWindowAtPoint($x, $y)
                [MarkWin32]::MoveCursor($x, $y) | Out-Null
                Start-Sleep -Milliseconds 40
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [MarkWin32]::InputTag)
                Start-Sleep -Milliseconds 60
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [MarkWin32]::InputTag)
                
                Write-Output (@{ status="success"; action="click"; x=$x; y=$y } | ConvertTo-Json -Compress)
            }
            "double-click" {
                $x = [int]$cmdObj.x
                $y = [int]$cmdObj.y
                [MarkWin32]::FocusWindowAtPoint($x, $y)
                [MarkWin32]::MoveCursor($x, $y) | Out-Null
                Start-Sleep -Milliseconds 40
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [MarkWin32]::InputTag)
                Start-Sleep -Milliseconds 60
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [MarkWin32]::InputTag)
                Start-Sleep -Milliseconds 60
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [MarkWin32]::InputTag)
                Start-Sleep -Milliseconds 60
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [MarkWin32]::InputTag)
                
                Write-Output (@{ status="success"; action="double-click"; x=$x; y=$y } | ConvertTo-Json -Compress)
            }
            "type" {
                [MarkWin32]::EnsureTargetWindowFocused()
                $text = $cmdObj.text
                if (-not [string]::IsNullOrEmpty($text)) {
                    Write-Output ([MarkWin32]::TypeTextUnicode($text))
                } else {
                    Write-Output (@{ status="error"; message="Empty text" } | ConvertTo-Json -Compress)
                }
            }
            "key" {
                [MarkWin32]::EnsureTargetWindowFocused()
                $combo = $cmdObj.combo
                $keys = @($combo -split '\+' | ForEach-Object { Get-VirtualKeyCode -keyName $_ })
                if ($keys.Count -eq 0 -or $keys -contains 0) { throw 'Kombinasi tombol tidak didukung.' }
                $pressed = @()
                try {
                    foreach ($key in $keys) {
                        [MarkWin32]::keybd_event($key, 0, 0, [MarkWin32]::InputTag)
                        $pressed += $key
                    }
                } finally {
                    [array]::Reverse($pressed)
                    foreach ($key in $pressed) { [MarkWin32]::keybd_event($key, 0, 2, [MarkWin32]::InputTag) }
                }
                Write-Output (@{ status='success'; action='key'; combo=$combo } | ConvertTo-Json -Compress)
            }
            "scroll" {
                [MarkWin32]::EnsureTargetWindowFocused()
                $direction = if ($cmdObj.direction) { $cmdObj.direction } else { "down" }
                $amount = if ($cmdObj.amount) { [int]$cmdObj.amount } else { 3 }
                
                $delta = 120 * $amount
                if ($direction -eq "down") {
                    $delta = -$delta
                }
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_WHEEL, 0, 0, $delta, [MarkWin32]::InputTag)
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
                $maximize = if ($null -ne $cmdObj.maximize) { [bool]$cmdObj.maximize } else { $true }
                $windowId = $cmdObj.windowId
                if (-not $windowId) {
                    $matches = @(([MarkWin32]::ListWindowsJson() | ConvertFrom-Json) | Where-Object { $_.title.IndexOf($title, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
                    if ([string]::IsNullOrWhiteSpace($title) -or $matches.Count -ne 1) { throw 'Target tidak unik. Gunakan window_id dari list_windows.' }
                    $windowId = $matches[0].window_id
                }
                [MarkWin32]::FocusWindowById([long]$windowId, $maximize)
                Write-Output (@{ status='success'; action='focus-window'; window_id=$windowId } | ConvertTo-Json -Compress)
            }
            "maximize-window" {
                $title = $cmdObj.title
                if (-not [string]::IsNullOrEmpty($title)) {
                    $res = [MarkWin32]::FocusWindowByTitle($title, $true)
                    Write-Output $res
                } else {
                    $hwnd = [MarkWin32]::GetForegroundWindow()
                    if ($hwnd -ne [IntPtr]::Zero) {
                        [MarkWin32]::ShowWindow($hwnd, 3)
                        [MarkWin32]::BringWindowToTop($hwnd)
                        [MarkWin32]::SetForegroundWindow($hwnd)
                        Write-Output (@{ status="success"; action="maximize-window" } | ConvertTo-Json -Compress)
                    } else {
                        Write-Output (@{ status="error"; message="No active window to maximize" } | ConvertTo-Json -Compress)
                    }
                }
            }
            "capture-screen" {
                $w = if ($cmdObj.width) { [int]$cmdObj.width } else { 1280 }
                $h = if ($cmdObj.height) { [int]$cmdObj.height } else { 720 }
                $q = if ($cmdObj.quality) { [int]$cmdObj.quality } else { 75 }
                $ruler = if ($cmdObj.show_ruler -ne $null) { [bool]$cmdObj.show_ruler } else { $true }
                $captureResult = Capture-ScreenJpeg -targetWidth $w -targetHeight $h -quality $q -showRuler $ruler
                Write-Output ($captureResult | ConvertTo-Json -Compress)
            }
            "get-screen-info" {
                Write-Output ((Get-DesktopGeometry) | ConvertTo-Json -Compress)
            }
            "move" {
                $x = [int]$cmdObj.x
                $y = [int]$cmdObj.y
                [MarkWin32]::MoveCursor($x, $y) | Out-Null
                Write-Output (@{ status="success"; action="move"; x=$x; y=$y } | ConvertTo-Json -Compress)
            }
            "mouse-down" {
                $btn = if ($cmdObj.button) { $cmdObj.button.ToLower() } else { "left" }
                if ($cmdObj.x -ne $null -and $cmdObj.y -ne $null) {
                    [MarkWin32]::MoveCursor([int]$cmdObj.x, [int]$cmdObj.y) | Out-Null
                }
                $flag = if ($btn -eq "right") { [MarkWin32]::MOUSEEVENTF_RIGHTDOWN } elseif ($btn -eq "middle") { [MarkWin32]::MOUSEEVENTF_MIDDLEDOWN } else { [MarkWin32]::MOUSEEVENTF_LEFTDOWN }
                [MarkWin32]::mouse_event($flag, 0, 0, 0, [MarkWin32]::InputTag)
                Write-Output (@{ status="success"; action="mouse-down"; button=$btn } | ConvertTo-Json -Compress)
            }
            "mouse-up" {
                $btn = if ($cmdObj.button) { $cmdObj.button.ToLower() } else { "left" }
                if ($cmdObj.x -ne $null -and $cmdObj.y -ne $null) {
                    [MarkWin32]::MoveCursor([int]$cmdObj.x, [int]$cmdObj.y) | Out-Null
                }
                $flag = if ($btn -eq "right") { [MarkWin32]::MOUSEEVENTF_RIGHTUP } elseif ($btn -eq "middle") { [MarkWin32]::MOUSEEVENTF_MIDDLEUP } else { [MarkWin32]::MOUSEEVENTF_LEFTUP }
                [MarkWin32]::mouse_event($flag, 0, 0, 0, [MarkWin32]::InputTag)
                Write-Output (@{ status="success"; action="mouse-up"; button=$btn } | ConvertTo-Json -Compress)
            }
            "right-click" {
                $x = [int]$cmdObj.x
                $y = [int]$cmdObj.y
                [MarkWin32]::FocusWindowAtPoint($x, $y)
                [MarkWin32]::MoveCursor($x, $y) | Out-Null
                Start-Sleep -Milliseconds 40
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, [MarkWin32]::InputTag)
                Start-Sleep -Milliseconds 60
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_RIGHTUP, 0, 0, 0, [MarkWin32]::InputTag)
                Write-Output (@{ status="success"; action="right-click"; x=$x; y=$y } | ConvertTo-Json -Compress)
            }
            "middle-click" {
                $x = [int]$cmdObj.x
                $y = [int]$cmdObj.y
                [MarkWin32]::FocusWindowAtPoint($x, $y)
                [MarkWin32]::MoveCursor($x, $y) | Out-Null
                Start-Sleep -Milliseconds 40
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, [MarkWin32]::InputTag)
                Start-Sleep -Milliseconds 60
                [MarkWin32]::mouse_event([MarkWin32]::MOUSEEVENTF_MIDDLEUP, 0, 0, 0, [MarkWin32]::InputTag)
                Write-Output (@{ status="success"; action="middle-click"; x=$x; y=$y } | ConvertTo-Json -Compress)
            }
            "burst-click" {
                $x = [int]$cmdObj.x
                $y = [int]$cmdObj.y
                [MarkWin32]::FocusWindowAtPoint($x, $y)
                $count = if ($cmdObj.count) { [int]$cmdObj.count } else { 5 }
                $interval = if ($cmdObj.interval_ms) { [int]$cmdObj.interval_ms } else { 20 }
                $btn = if ($cmdObj.button) { $cmdObj.button.ToLower() } else { "left" }
                if ($count -gt 100) { $count = 100 }
                if ($interval -lt 2) { $interval = 2 }

                [MarkWin32]::MoveCursor($x, $y) | Out-Null
                Start-Sleep -Milliseconds 40

                $downFlag = if ($btn -eq "right") { [MarkWin32]::MOUSEEVENTF_RIGHTDOWN } elseif ($btn -eq "middle") { [MarkWin32]::MOUSEEVENTF_MIDDLEDOWN } else { [MarkWin32]::MOUSEEVENTF_LEFTDOWN }
                $upFlag = if ($btn -eq "right") { [MarkWin32]::MOUSEEVENTF_RIGHTUP } elseif ($btn -eq "middle") { [MarkWin32]::MOUSEEVENTF_MIDDLEUP } else { [MarkWin32]::MOUSEEVENTF_LEFTUP }

                for ($i = 0; $i -lt $count; $i++) {
                    [MarkWin32]::mouse_event($downFlag, 0, 0, 0, [MarkWin32]::InputTag)
                    [MarkWin32]::mouse_event($upFlag, 0, 0, 0, [MarkWin32]::InputTag)
                    if ($interval -gt 0) { Start-Sleep -Milliseconds $interval }
                }

                Write-Output (@{ status="success"; action="burst-click"; x=$x; y=$y; count=$count; interval_ms=$interval } | ConvertTo-Json -Compress)
            }
            "drag" {
                [MarkWin32]::EnsureTargetWindowFocused()
                $x1 = [int]$cmdObj.start_x
                $y1 = [int]$cmdObj.start_y
                $x2 = [int]$cmdObj.end_x
                $y2 = [int]$cmdObj.end_y
                $dur = if ($cmdObj.duration_ms) { [int]$cmdObj.duration_ms } else { 300 }
                $btn = if ($cmdObj.button) { $cmdObj.button.ToLower() } else { "left" }

                $downFlag = if ($btn -eq "right") { [MarkWin32]::MOUSEEVENTF_RIGHTDOWN } elseif ($btn -eq "middle") { [MarkWin32]::MOUSEEVENTF_MIDDLEDOWN } else { [MarkWin32]::MOUSEEVENTF_LEFTDOWN }
                $upFlag = if ($btn -eq "right") { [MarkWin32]::MOUSEEVENTF_RIGHTUP } elseif ($btn -eq "middle") { [MarkWin32]::MOUSEEVENTF_MIDDLEUP } else { [MarkWin32]::MOUSEEVENTF_LEFTUP }

                [MarkWin32]::MoveCursor($x1, $y1) | Out-Null
                Start-Sleep -Milliseconds 40
                [MarkWin32]::mouse_event($downFlag, 0, 0, 0, [MarkWin32]::InputTag)
                Start-Sleep -Milliseconds 30

                $steps = [Math]::Max(10, [int]($dur / 15))
                $sleepPerStep = [Math]::Max(5, [int]($dur / $steps))
                for ($s = 1; $s -le $steps; $s++) {
                    $curX = [int]($x1 + (($x2 - $x1) * ($s / $steps)))
                    $curY = [int]($y1 + (($y2 - $y1) * ($s / $steps)))
                    [MarkWin32]::MoveCursor($curX, $curY, 0) | Out-Null
                    Start-Sleep -Milliseconds $sleepPerStep
                }
                Start-Sleep -Milliseconds 30
                [MarkWin32]::mouse_event($upFlag, 0, 0, 0, [MarkWin32]::InputTag)

                Write-Output (@{ status="success"; action="drag"; start_x=$x1; start_y=$y1; end_x=$x2; end_y=$y2 } | ConvertTo-Json -Compress)
            }
            "key-down" {
                $keyName = $cmdObj.key
                $dur = if ($cmdObj.duration_ms) { [int]$cmdObj.duration_ms } else { 0 }
                $vk = Get-VirtualKeyCode -keyName $keyName
                if ($vk -gt 0) {
                    [MarkWin32]::keybd_event($vk, 0, 0, [MarkWin32]::InputTag)
                    if ($dur -gt 0) {
                        Start-Sleep -Milliseconds $dur
                        [MarkWin32]::keybd_event($vk, 0, [MarkWin32]::KEYEVENTF_KEYUP, [MarkWin32]::InputTag)
                    }
                    Write-Output (@{ status="success"; action="key-down"; key=$keyName; vk=$vk; duration_ms=$dur } | ConvertTo-Json -Compress)
                } else {
                    Write-Output (@{ status="error"; message="Unsupported key: $keyName" } | ConvertTo-Json -Compress)
                }
            }
            "key-up" {
                $keyName = $cmdObj.key
                $vk = Get-VirtualKeyCode -keyName $keyName
                if ($vk -gt 0) {
                    [MarkWin32]::keybd_event($vk, 0, [MarkWin32]::KEYEVENTF_KEYUP, [MarkWin32]::InputTag)
                    Write-Output (@{ status="success"; action="key-up"; key=$keyName; vk=$vk } | ConvertTo-Json -Compress)
                } else {
                    Write-Output (@{ status="error"; message="Unsupported key: $keyName" } | ConvertTo-Json -Compress)
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

    Write-Output "---MARK_DONE:$($cmdObj.requestId)---"
    [Console]::Out.Flush()
}
