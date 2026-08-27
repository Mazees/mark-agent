Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$cSharpCode = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Windows.Forms;

public class MarkPcOverlayForm : Form {
    private const int WH_MOUSE_LL = 14;
    private const int WH_KEYBOARD_LL = 13;
    private const uint LLMHF_INJECTED = 0x01;
    private const uint LLMHF_LOWER_IL_INJECTED = 0x02;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;

    private const int VK_S = 0x53;
    private const int VK_CONTROL = 0x11;
    private const int VK_SHIFT = 0x10;
    private const int VK_LCONTROL = 0xA2;
    private const int VK_RCONTROL = 0xA3;
    private const int VK_LSHIFT = 0xA0;
    private const int VK_RSHIFT = 0xA1;

    [StructLayout(LayoutKind.Sequential)]
    private struct MSLLHOOKSTRUCT {
        public int x;
        public int y;
        public uint mouseData;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    private delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    private static IntPtr _mouseHook = IntPtr.Zero;
    private static IntPtr _kbdHook = IntPtr.Zero;
    private static HookProc _mouseProc = MouseHookCallback;
    private static HookProc _kbdProc = KbdHookCallback;

    public static MarkPcOverlayForm Instance = null;
    public static bool IsAborted = false;

    private Timer pulseTimer;
    private int pulseAlpha = 255;
    private bool pulseDec = true;

    public MarkPcOverlayForm() {
        this.FormBorderStyle = FormBorderStyle.None;
        this.StartPosition = FormStartPosition.Manual;
        this.TopMost = true;
        this.ShowInTaskbar = false;
        this.Size = new Size(510, 36);
        this.BackColor = Color.FromArgb(15, 23, 21); // #0f1715 Mark Theme Base
        this.Opacity = 0.98;

        this.SetStyle(ControlStyles.AllPaintingInWmPaint |
                      ControlStyles.UserPaint |
                      ControlStyles.OptimizedDoubleBuffer |
                      ControlStyles.ResizeRedraw, true);

        Rectangle primary = Screen.PrimaryScreen.Bounds;
        int x = (primary.Width - this.Width) / 2;
        int y = 16;
        this.Location = new Point(x, y);

        pulseTimer = new Timer();
        pulseTimer.Interval = 40;
        pulseTimer.Tick += (s, e) => {
            if (pulseDec) {
                pulseAlpha -= 14;
                if (pulseAlpha <= 100) pulseDec = false;
            } else {
                pulseAlpha += 14;
                if (pulseAlpha >= 255) pulseDec = true;
            }
            this.Invalidate();
        };
        pulseTimer.Start();

        Instance = this;
        InitHooks();
    }

    public static void InitHooks() {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            IntPtr hModule = GetModuleHandle(curModule.ModuleName);
            _mouseHook = SetWindowsHookEx(WH_MOUSE_LL, _mouseProc, hModule, 0);
            _kbdHook = SetWindowsHookEx(WH_KEYBOARD_LL, _kbdProc, hModule, 0);
        }

        AppDomain.CurrentDomain.ProcessExit += (s, e) => {
            CleanupHooks();
        };
    }

    public static void CleanupHooks() {
        if (_mouseHook != IntPtr.Zero) {
            UnhookWindowsHookEx(_mouseHook);
            _mouseHook = IntPtr.Zero;
        }
        if (_kbdHook != IntPtr.Zero) {
            UnhookWindowsHookEx(_kbdHook);
            _kbdHook = IntPtr.Zero;
        }
    }

    public static void TriggerAbort() {
        if (IsAborted) return;
        IsAborted = true;
        Console.WriteLine("{\"event\":\"abort\"}");
        CleanupHooks();
        if (Instance != null && !Instance.IsDisposed) {
            try {
                Instance.BeginInvoke(new Action(() => {
                    Instance.Close();
                }));
            } catch {}
        }
    }

    private static IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            MSLLHOOKSTRUCT hookStruct = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));

            // Allow injected events (AI automation) to pass, block physical user movements
            bool isInjected = (hookStruct.flags & LLMHF_INJECTED) != 0 ||
                              (hookStruct.flags & LLMHF_LOWER_IL_INJECTED) != 0;

            if (!isInjected) {
                return (IntPtr)1; // Block physical mouse movement 100%
            }
        }
        return CallNextHookEx(_mouseHook, nCode, wParam, lParam);
    }

    private static IntPtr KbdHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN)) {
            KBDLLHOOKSTRUCT kb = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            if (kb.vkCode == VK_S) {
                bool isCtrl = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0 ||
                              (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0 ||
                              (GetAsyncKeyState(VK_RCONTROL) & 0x8000) != 0;
                bool isShift = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0 ||
                               (GetAsyncKeyState(VK_LSHIFT) & 0x8000) != 0 ||
                               (GetAsyncKeyState(VK_RSHIFT) & 0x8000) != 0;

                if (isCtrl && isShift) {
                    TriggerAbort();
                    return (IntPtr)1; // Block key
                }
            }
        }
        return CallNextHookEx(_kbdHook, nCode, wParam, lParam);
    }

    protected override void OnPaint(PaintEventArgs e) {
        base.OnPaint(e);
        Graphics g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

        // Background Dark Ground (#0f1715)
        using (SolidBrush bgBrush = new SolidBrush(Color.FromArgb(15, 23, 21))) {
            g.FillRectangle(bgBrush, 0, 0, this.Width, this.Height);
        }

        // Animated Pulsing Red Dot (Recording / Locked state indicator)
        using (SolidBrush dotBrush = new SolidBrush(Color.FromArgb(pulseAlpha, 239, 68, 68))) {
            g.FillEllipse(dotBrush, 14, (this.Height - 8) / 2, 8, 8);
        }

        // Fonts & Typography
        using (Font fontBold = new Font("Segoe UI", 9.0f, FontStyle.Bold))
        using (Font fontRegular = new Font("Segoe UI", 9.0f, FontStyle.Regular))
        using (SolidBrush textGreen = new SolidBrush(Color.FromArgb(31, 184, 84))) // #1fb854 Mark Green
        using (SolidBrush textWhite = new SolidBrush(Color.FromArgb(240, 240, 240)))
        using (SolidBrush textMuted = new SolidBrush(Color.FromArgb(150, 165, 158)))
        using (Pen divPen = new Pen(Color.FromArgb(35, 75, 60), 1.0f))
        {
            float curX = 30;
            float textY = (this.Height - fontRegular.Height) / 2.0f;

            // [MARK PC AUTOMATION]
            string tag = "MARK PC AUTOMATION";
            g.DrawString(tag, fontBold, textGreen, curX, textY);
            curX += g.MeasureString(tag, fontBold).Width + 10;

            // Divider Line 1
            g.DrawLine(divPen, curX, 8, curX, this.Height - 8);
            curX += 10;

            // Hotkey Instruction Text
            string cancelPrefix = "Buka Kunci Mouse: ";
            g.DrawString(cancelPrefix, fontRegular, textMuted, curX, textY);
            curX += g.MeasureString(cancelPrefix, fontRegular).Width;

            string hotkey = "Ctrl + Shift + S";
            g.DrawString(hotkey, fontBold, textGreen, curX, textY);
        }
    }

    protected override void Dispose(bool disposing) {
        if (disposing) {
            CleanupHooks();
            if (pulseTimer != null) {
                pulseTimer.Stop();
                pulseTimer.Dispose();
            }
        }
        base.Dispose(disposing);
    }
}
"@

Add-Type -TypeDefinition $cSharpCode -ReferencedAssemblies "System.Windows.Forms", "System.Drawing"

[System.Windows.Forms.Application]::EnableVisualStyles()

$overlay = New-Object MarkPcOverlayForm
[System.Console]::WriteLine("READY")
[System.Windows.Forms.Application]::Run($overlay)
