using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using Forms = System.Windows.Forms;

internal static class OverlayNative {
    internal const int Tag = 0x4D41524B;
    internal const int Transparent = 0x20, Layered = 0x80000, NoActivate = 0x8000000, ToolWindow = 0x80;
    [StructLayout(LayoutKind.Sequential)] internal struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] internal struct MouseData { public Point pt; public uint mouseData, flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] internal struct KeyData { public uint key, scan, flags, time; public IntPtr extra; }
    internal delegate IntPtr Hook(int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")] internal static extern IntPtr SetWindowsHookEx(int kind, Hook callback, IntPtr module, uint thread);
    [DllImport("user32.dll")] internal static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] internal static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] internal static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] internal static extern IntPtr LoadCursor(IntPtr instance, IntPtr id);
    [DllImport("user32.dll")] internal static extern bool GetCursorPos(out Point position);
    [DllImport("user32.dll")] internal static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    internal static void InitDpi() { try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch { } SetProcessDPIAware(); }
    [DllImport("user32.dll")] internal static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll")] internal static extern int SetWindowLong(IntPtr window, int index, int value);
    [DllImport("user32.dll")] internal static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] internal static extern bool SetWindowDisplayAffinity(IntPtr window, uint affinity);
    [DllImport("dwmapi.dll")] internal static extern int DwmFlush();
    [DllImport("user32.dll")] internal static extern void mouse_event(uint flags, uint dx, uint dy, int data, int extra);
    [DllImport("user32.dll")] internal static extern void keybd_event(byte key, byte scan, uint flags, int extra);
    [DllImport("user32.dll")] internal static extern bool DrawIconEx(IntPtr dc, int x, int y, IntPtr cursor, int width, int height, uint step, IntPtr brush, uint flags);
    [DllImport("user32.dll")] internal static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] internal static extern short GetAsyncKeyState(int key);
    [DllImport("Magnification.dll")] internal static extern bool MagInitialize();
    [DllImport("Magnification.dll")] internal static extern bool MagUninitialize();
    [DllImport("Magnification.dll")] internal static extern bool MagShowSystemCursor(bool show);
    [StructLayout(LayoutKind.Sequential)] internal struct CursorInfo { public int size, flags; public IntPtr cursor; public Point position; }
    [DllImport("user32.dll")] internal static extern bool GetCursorInfo(ref CursorInfo info);
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    internal static void Emit(object value) { lock (Json) { Console.WriteLine(Json.Serialize(value)); Console.Out.Flush(); } }
    internal static string Text(IDictionary<string, object> message, string key, string fallback = "") { return message.ContainsKey(key) ? Convert.ToString(message[key]) : fallback; }
    internal static bool Alive(int id) { try { return !Process.GetProcessById(id).HasExited; } catch { return false; } }
    internal static void RecoverCursor() {
        using (var lease = new Mutex(false, "Local\\MarkComputerUseCursor")) {
            bool owned;
            try { owned = lease.WaitOne(0); } catch (AbandonedMutexException) { owned = true; }
            if (!owned) return;
            try { if (MagInitialize()) { MagShowSystemCursor(true); MagUninitialize(); } }
            finally { lease.ReleaseMutex(); }
        }
    }
}

// Cursor visibility and the input hook have a separate lease from the HTML renderer.
internal sealed class CursorGuard : Forms.ApplicationContext {
    readonly HashSet<byte> heldKeys = new HashSet<byte>();
    readonly HashSet<int> heldButtons = new HashSet<int>();
    readonly uint[] ids = { 32512, 32513, 32514, 32515, 32516, 32642, 32643, 32644, 32645, 32646, 32648, 32649, 32650, 32651 };
    readonly Forms.Control dispatcher = new Forms.Control();
    readonly Forms.Timer timer = new Forms.Timer();
    readonly OverlayNative.Hook mouseHook, keyHook;
    readonly int parent;
    readonly Mutex cursorLease = new Mutex(false, "Local\\MarkComputerUseCursor");
    bool ownsLease;
    IntPtr mouseHandle, keyHandle;
    bool active;
    string controlId = "";
    long pulse = Environment.TickCount;

    internal CursorGuard(int parentId) {
        parent = parentId;
        if (!OverlayNative.MagInitialize()) throw new InvalidOperationException("API visibilitas cursor Windows tidak tersedia.");
        dispatcher.CreateControl();
        mouseHook = OnMouse; keyHook = OnKey;
        mouseHandle = OverlayNative.SetWindowsHookEx(14, mouseHook, OverlayNative.GetModuleHandle(null), 0);
        keyHandle = OverlayNative.SetWindowsHookEx(13, keyHook, OverlayNative.GetModuleHandle(null), 0);
        if (mouseHandle == IntPtr.Zero || keyHandle == IntPtr.Zero) throw new InvalidOperationException("Pemantauan intervensi pengguna tidak tersedia.");
        timer.Interval = 100;
        timer.Tick += (sender, args) => {
            if (!OverlayNative.Alive(parent) || unchecked((uint)(Environment.TickCount - pulse)) > 1600) {
                Restore(); ExitThread();
            }
        };
        timer.Start();
        new Thread(Read) { IsBackground = true }.Start();
        OverlayNative.Emit(new { type = "guard-ready" });
    }

    void Read() {
        string line;
        try {
            while ((line = Console.ReadLine()) != null) {
                var message = OverlayNative.Json.Deserialize<Dictionary<string, object>>(line);
                if (OverlayNative.Text(message, "cmd") == "pulse") { Interlocked.Exchange(ref pulse, Environment.TickCount); continue; }
                dispatcher.BeginInvoke(new Action(() => Handle(message)));
            }
        } catch { }
        try { dispatcher.BeginInvoke(new Action(() => { Restore(); ExitThread(); })); } catch { }
    }

    void Handle(Dictionary<string, object> message) {
        string cmd = OverlayNative.Text(message, "cmd"), request = OverlayNative.Text(message, "requestId");
        try {
            if (cmd == "probe") {
                var signatures = new Dictionary<string, string>();
                foreach (uint id in ids) {
                    using (var bitmap = new System.Drawing.Bitmap(64, 64)) {
                        using (var graphics = System.Drawing.Graphics.FromImage(bitmap)) {
                            IntPtr dc = graphics.GetHdc();
                            try { OverlayNative.DrawIconEx(dc, 0, 0, OverlayNative.LoadCursor(IntPtr.Zero, new IntPtr(id)), 32, 32, 0, IntPtr.Zero, 3); }
                            finally { graphics.ReleaseHdc(dc); }
                        }
                        using (var memory = new System.IO.MemoryStream()) {
                            bitmap.Save(memory, System.Drawing.Imaging.ImageFormat.Png);
                            using (var sha = System.Security.Cryptography.SHA256.Create()) signatures[id.ToString()] = Convert.ToBase64String(sha.ComputeHash(memory.ToArray()));
                        }
                    }
                }
                var info = new OverlayNative.CursorInfo { size = Marshal.SizeOf(typeof(OverlayNative.CursorInfo)) };
                OverlayNative.GetCursorInfo(ref info);
                OverlayNative.Emit(new { type = "probe", requestId = request, active, signatures, cursorFlags = info.flags });
            } else if (cmd == "hide") {
                Restore();
                controlId = OverlayNative.Text(message, "controlId");
                foreach (int key in new int[] { 1, 2, 4, 0x10, 0x11, 0x12, 0x5B, 0x5C })
                    if ((OverlayNative.GetAsyncKeyState(key) & 0x8000) != 0) throw new InvalidOperationException("Lepaskan tombol mouse atau modifier keyboard sebelum Mark mengambil kendali.");
                try { ownsLease = cursorLease.WaitOne(0); } catch (AbandonedMutexException) { ownsLease = true; }
                if (!ownsLease) throw new InvalidOperationException("Computer Use sedang digunakan proses Mark lain.");
                active = true;
                if (!OverlayNative.MagShowSystemCursor(false)) throw new InvalidOperationException("Cursor Windows tidak dapat disembunyikan.");
                Interlocked.Exchange(ref pulse, Environment.TickCount);
                OverlayNative.Emit(new { type = "hidden", requestId = request, controlId });
            } else {
                Restore();
                OverlayNative.Emit(new { type = "restored", requestId = request });
                if (cmd == "stop") ExitThread();
            }
        } catch (Exception error) {
            Restore();
            OverlayNative.Emit(new { type = "error", requestId = request, message = error.Message });
        }
    }

    IntPtr OnMouse(int code, IntPtr message, IntPtr data) {
        if (code >= 0 && active) {
            var value = (OverlayNative.MouseData)Marshal.PtrToStructure(data, typeof(OverlayNative.MouseData));
            if (value.extra.ToInt64() != OverlayNative.Tag) return new IntPtr(1);
            else if (value.extra.ToInt64() == OverlayNative.Tag) {
                int msg = message.ToInt32();
                if (msg == 0x201 || msg == 0x204 || msg == 0x207) heldButtons.Add(msg);
                if (msg == 0x202 || msg == 0x205 || msg == 0x208) heldButtons.Remove(msg - 1);
            }
        }
        return OverlayNative.CallNextHookEx(mouseHandle, code, message, data);
    }

    IntPtr OnKey(int code, IntPtr message, IntPtr data) {
        if (code >= 0) {
            var value = (OverlayNative.KeyData)Marshal.PtrToStructure(data, typeof(OverlayNative.KeyData));
            if (value.extra.ToInt64() != OverlayNative.Tag && value.key == 0x52 && (value.flags & 128) == 0 &&
                (OverlayNative.GetAsyncKeyState(0x11) & 0x8000) != 0 && (OverlayNative.GetAsyncKeyState(0x10) & 0x8000) != 0) {
                string previous = controlId;
                Restore();
                OverlayNative.Emit(new { type = "cancelled", controlId = previous, reason = "Pengguna membatalkan Computer Use dengan Ctrl+Shift+R." });
                return new IntPtr(1);
            } else if (active && value.extra.ToInt64() == OverlayNative.Tag) {
                if ((value.flags & 128) == 0) heldKeys.Add((byte)value.key);
                else heldKeys.Remove((byte)value.key);
            }
        }
        return OverlayNative.CallNextHookEx(keyHandle, code, message, data);
    }

    void Restore() {
        active = false;
        foreach (byte key in heldKeys) OverlayNative.keybd_event(key, 0, 2, OverlayNative.Tag);
        heldKeys.Clear();
        foreach (int button in heldButtons) OverlayNative.mouse_event(button == 0x201 ? 4u : button == 0x204 ? 16u : 64u, 0, 0, 0, OverlayNative.Tag);
        heldButtons.Clear();
        if (ownsLease) {
            OverlayNative.MagShowSystemCursor(true);
            cursorLease.ReleaseMutex();
            ownsLease = false;
        }
        controlId = "";
    }

    protected override void ExitThreadCore() {
        Restore(); timer.Stop();
        if (mouseHandle != IntPtr.Zero) OverlayNative.UnhookWindowsHookEx(mouseHandle);
        if (keyHandle != IntPtr.Zero) OverlayNative.UnhookWindowsHookEx(keyHandle);
        OverlayNative.MagUninitialize(); cursorLease.Dispose();
        dispatcher.Dispose(); base.ExitThreadCore();
    }
}
