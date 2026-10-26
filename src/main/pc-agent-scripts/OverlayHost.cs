using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Forms = System.Windows.Forms;

internal sealed class OverlayHost : Window {
    WebView2CompositionControl view;
    Process guard;
    readonly DispatcherTimer timer = new DispatcherTimer();
    readonly string htmlPath, profile;
    readonly int parent;
    long pulse = Environment.TickCount;
    IntPtr handle;
    string controlId = "", pendingControl = "";
    bool documentReady, guardReady, cursorVisible, scriptBusy, shuttingDown, captureExcluded;
    int lastRender = Environment.TickCount;
    readonly System.Drawing.Rectangle bounds;

    internal OverlayHost(string html, string userData, int parentId) {
        htmlPath = Path.GetFullPath(html); profile = userData; parent = parentId;
        bounds = Forms.SystemInformation.VirtualScreen;
        Title = "Mark Computer Use Overlay";
        WindowStyle = WindowStyle.None; AllowsTransparency = true; Background = Brushes.Transparent;
        ShowInTaskbar = false; ShowActivated = false; Topmost = true; ResizeMode = ResizeMode.NoResize;
        Left = bounds.Left; Top = bounds.Top; Width = bounds.Width; Height = bounds.Height;
        view = new WebView2CompositionControl { DefaultBackgroundColor = System.Drawing.Color.Transparent, IsHitTestVisible = false, Focusable = false };
        Content = view;
        SourceInitialized += (sender, args) => {
            handle = new WindowInteropHelper(this).Handle;
            int style = OverlayNative.GetWindowLong(handle, -20);
            OverlayNative.SetWindowLong(handle, -20, style | OverlayNative.Transparent | OverlayNative.NoActivate | OverlayNative.ToolWindow | OverlayNative.Layered);
            OverlayNative.SetWindowPos(handle, new IntPtr(-1), bounds.Left, bounds.Top, bounds.Width, bounds.Height, 0x10 | 0x40);
            captureExcluded = OverlayNative.SetWindowDisplayAffinity(handle, 0x11);
            HwndSource.FromHwnd(handle).AddHook(WindowMessage);
        };
        Loaded += async (sender, args) => {
            try {
                var environment = await CoreWebView2Environment.CreateAsync(null, profile, new CoreWebView2EnvironmentOptions("--disable-background-networking --disable-extensions --no-first-run"));
                await view.EnsureCoreWebView2Async(environment);
                view.CoreWebView2.Settings.AreDevToolsEnabled = false;
                view.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                view.CoreWebView2.Settings.IsStatusBarEnabled = false;
                view.CoreWebView2.Settings.IsZoomControlEnabled = false;
                view.CoreWebView2.SetVirtualHostNameToFolderMapping("mark-overlay.local", Path.GetDirectoryName(htmlPath), CoreWebView2HostResourceAccessKind.DenyCors);
                view.CoreWebView2.NavigationStarting += (s, e) => { if (e.Uri != "https://mark-overlay.local/overlay-hud.html") e.Cancel = true; };
                view.CoreWebView2.NewWindowRequested += (s, e) => e.Handled = true;
                view.CoreWebView2.PermissionRequested += (s, e) => e.State = CoreWebView2PermissionState.Deny;
                view.CoreWebView2.ProcessFailed += (s, e) => Fail("Renderer overlay terputus.");
                view.CoreWebView2.WebMessageReceived += OnWebMessage;
                view.Source = new Uri("https://mark-overlay.local/overlay-hud.html");
            } catch (Exception error) { Fail("Overlay HTML gagal dimulai: " + error.Message); }
        };
        Closed += (sender, args) => Cleanup();
        timer.Interval = TimeSpan.FromMilliseconds(33);
        timer.Tick += Tick;
        timer.Start();
        StartGuard();
        new Thread(Read) { IsBackground = true }.Start();
    }

    IntPtr WindowMessage(IntPtr hwnd, int message, IntPtr wparam, IntPtr lparam, ref bool handled) {
        if (message == 0x84) { handled = true; return new IntPtr(-1); }
        if (message == 0x21) { handled = true; return new IntPtr(3); }
        if (message == 0x7E || message == 0x2E0) Fail("Konfigurasi monitor berubah. Ambil observasi baru.");
        return IntPtr.Zero;
    }

    void Read() {
        string line;
        try {
            if (Environment.OSVersion.Version.Major < 10 || Environment.OSVersion.Version.Build < 19041) throw new PlatformNotSupportedException("Overlay Computer Use memerlukan Windows 10 versi 2004 atau Windows 11.");
            while ((line = Console.ReadLine()) != null) {
                var message = OverlayNative.Json.Deserialize<Dictionary<string, object>>(line);
                if (OverlayNative.Text(message, "cmd") == "pulse") { Interlocked.Exchange(ref pulse, Environment.TickCount); continue; }
                Dispatcher.BeginInvoke(new Action(() => Handle(message)));
            }
        } catch { }
        Dispatcher.BeginInvoke(new Action(Close));
    }

    async void Handle(Dictionary<string, object> message) {
        string cmd = OverlayNative.Text(message, "cmd"), request = OverlayNative.Text(message, "requestId");
        try {
            if (cmd == "control") {
                if (!documentReady) throw new InvalidOperationException("Tampilan overlay belum siap.");
                if (controlId != "") throw new InvalidOperationException("Overlay sedang digunakan sesi lain.");
                StartGuard();
                controlId = OverlayNative.Text(message, "controlId"); pendingControl = request;
                await view.ExecuteScriptAsync("window.markOverlay.control(true)");
            } else if (cmd == "release") {
                if (OverlayNative.Text(message, "controlId") != "" && OverlayNative.Text(message, "controlId") != controlId) { Ack(request); return; }
                cursorVisible = false; controlId = "";
                if (documentReady) await view.ExecuteScriptAsync("window.markOverlay.control(false)");
                SendGuard(new { cmd = "restore", requestId = request });
                if (guard == null || guard.HasExited) Ack(request);
            } else if (cmd == "capture-hide") {
                if (!captureExcluded) throw new InvalidOperationException("Windows tidak mendukung pengecualian overlay dari screenshot.");
                OverlayNative.DwmFlush(); Ack(request);
            } else if (cmd == "capture-show") {
                // Capture exclusion keeps the overlay visible for the entire session.
            } else if (cmd == "status") {
                if (documentReady) await view.ExecuteScriptAsync("window.markOverlay.update(" + OverlayNative.Json.Serialize(message) + ")");
            } else if (cmd == "probe") {
                var testPoint = new OverlayNative.Point { X = Forms.Screen.PrimaryScreen.WorkingArea.Left + Forms.Screen.PrimaryScreen.WorkingArea.Width / 2, Y = Forms.Screen.PrimaryScreen.WorkingArea.Top + 35 };
                OverlayNative.Emit(new { type = "ack", requestId = request, success = true, styles = OverlayNative.GetWindowLong(handle, -20), windowId = handle.ToInt64().ToString(), foregroundWindowId = OverlayNative.GetForegroundWindow().ToInt64().ToString(), clickThrough = OverlayNative.WindowFromPoint(testPoint) != handle, width = bounds.Width, height = bounds.Height, documentReady, cursorVisible, captureExcluded, visible = IsVisible });
            } else if (cmd == "stop") Close();
        } catch (Exception error) { OverlayNative.Emit(new { type = "ack", requestId = request, success = false, message = error.Message }); }
    }

    void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args) {
        if (args.Source != "https://mark-overlay.local/overlay-hud.html") return;
        string value = args.TryGetWebMessageAsString();
        if (value == "ready") { documentReady = true; if (guardReady) OverlayNative.Emit(new { type = "ready" }); }
        if (value == "cursor-ready" && controlId != "") SendGuard(new { cmd = "hide", requestId = pendingControl, controlId });
    }

    void StartGuard() {
        if (guard != null && !guard.HasExited) return;
        guard = new Process { StartInfo = new ProcessStartInfo {
            FileName = Process.GetCurrentProcess().MainModule.FileName, Arguments = "--guard " + Process.GetCurrentProcess().Id,
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true
        } };
        guard.OutputDataReceived += (sender, args) => {
            if (String.IsNullOrWhiteSpace(args.Data)) return;
            try {
                var message = OverlayNative.Json.Deserialize<Dictionary<string, object>>(args.Data);
                Dispatcher.BeginInvoke(new Action(() => GuardMessage(message)));
            } catch { }
        };
        guard.Start(); guard.BeginOutputReadLine(); guard.BeginErrorReadLine();
        guard.EnableRaisingEvents = true;
        guard.Exited += (sender, args) => Dispatcher.BeginInvoke(new Action(() => {
            if (controlId != "") { OverlayNative.RecoverCursor(); Fail("Penjaga cursor terputus."); }
        }));
    }

    async void GuardMessage(Dictionary<string, object> message) {
        string kind = OverlayNative.Text(message, "type"), request = OverlayNative.Text(message, "requestId");
        if (kind == "guard-ready") { guardReady = true; if (documentReady) OverlayNative.Emit(new { type = "ready" }); return; }
        if (kind == "hidden") { lastRender = Environment.TickCount; cursorVisible = true; pendingControl = ""; Ack(request); }
        if (kind == "restored") Ack(request);
        if (kind == "interrupted" || kind == "error" || kind == "cancelled") {
            string previous = controlId;
            cursorVisible = false; controlId = "";
            if (documentReady) await view.ExecuteScriptAsync("window.markOverlay.control(false)");
            OverlayNative.Emit(new { type = kind == "cancelled" ? "cancelled" : "interrupted", controlId = previous, reason = OverlayNative.Text(message, "reason", OverlayNative.Text(message, "message", "Kendali dihentikan.")) });
            if (pendingControl != "") { OverlayNative.Emit(new { type = "ack", requestId = pendingControl, success = false, message = "Cursor Mark tidak dapat diaktifkan." }); pendingControl = ""; }
            if (kind == "cancelled") Close();
        }
    }

    void SendGuard(object message) {
        if (guard != null && !guard.HasExited) { guard.StandardInput.WriteLine(OverlayNative.Json.Serialize(message)); guard.StandardInput.Flush(); }
    }

    async void Tick(object sender, EventArgs args) {
        if (shuttingDown) return;
        if (!OverlayNative.Alive(parent) || unchecked((uint)(Environment.TickCount - pulse)) > 2200) { Close(); return; }
        if (cursorVisible && unchecked((uint)(Environment.TickCount - lastRender)) > 1200) { Fail("Tampilan cursor berhenti merespons."); return; }
        SendGuard(new { cmd = "pulse" });
        if (!documentReady || scriptBusy || !IsVisible) return;
        OverlayNative.Point point;
        OverlayNative.GetCursorPos(out point);
        var monitor = Forms.Screen.FromPoint(new System.Drawing.Point(point.X, point.Y)).WorkingArea;
        scriptBusy = true;
        try {
            await view.ExecuteScriptAsync("window.markOverlay.position(" + OverlayNative.Json.Serialize(new { x = point.X - bounds.Left, y = point.Y - bounds.Top, width = bounds.Width, height = bounds.Height, monitorLeft = monitor.Left - bounds.Left, monitorTop = monitor.Top - bounds.Top, monitorWidth = monitor.Width, cursorVisible }) + ")");
            lastRender = Environment.TickCount;
        } catch { Fail("Cursor overlay tidak dapat diperbarui."); }
        finally { scriptBusy = false; }
    }

    void Ack(string request) { if (request != "") OverlayNative.Emit(new { type = "ack", requestId = request, success = true }); }
    void Fail(string reason) { if (shuttingDown) return; OverlayNative.Emit(new { type = "interrupted", controlId, reason }); Close(); }
    void Cleanup() {
        if (shuttingDown) return;
        shuttingDown = true; timer.Stop();
        try { SendGuard(new { cmd = "stop" }); guard.StandardInput.Close(); } catch { }
        try { view.Dispose(); } catch { }
    }
}

internal static class OverlayProgram {
    [STAThread] static int Main(string[] args) {
        Console.InputEncoding = System.Text.Encoding.UTF8;
        Console.OutputEncoding = new System.Text.UTF8Encoding(false);
        OverlayNative.InitDpi();
        try {
            if (args.Length == 2 && args[0] == "--guard") { Forms.Application.Run(new CursorGuard(Int32.Parse(args[1]))); return 0; }
            if (args.Length != 3) throw new ArgumentException("Argumen overlay tidak lengkap.");
            var app = new Application();
            app.Run(new OverlayHost(args[0], args[1], Int32.Parse(args[2])));
            return 0;
        } catch (Exception error) { OverlayNative.Emit(new { type = "error", message = error.Message }); return 1; }
    }
}
