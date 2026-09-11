using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace MarkLauncher
{
    static class Program
    {
        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        private const int SW_RESTORE = 9;

        private static NotifyIcon _trayIcon;
        private static ContextMenuStrip _trayMenu;
        private static Process _nodeProcess;
        private static readonly int ServerPort = 3000;
        private static string _appDirectory;
        private static string _iconPath;

        [STAThread]
        static void Main(string[] args)
        {
            // Cegah multiple instance launcher
            bool createdNew;
            using (Mutex mutex = new Mutex(true, "MARK_AI_OS_COMPANION_MUTEX", out createdNew))
            {
                if (!createdNew)
                {
                    // Jika sudah berjalan, buka jendela UI
                    OpenOrFocusUI();
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                _appDirectory = AppDomain.CurrentDomain.BaseDirectory;
                _iconPath = Path.Combine(_appDirectory, "resources", "icon.ico");

                InitializeTray();
                StartNodeServer();

                // Buka UI otomatis saat pertama kali start
                Task.Run(async () =>
                {
                    await WaitForServerReadyAsync();
                    OpenOrFocusUI();
                });

                Application.Run();
            }
        }

        private static void InitializeTray()
        {
            _trayMenu = new ContextMenuStrip();

            var itemOpen = new ToolStripMenuItem("Buka MARK", null, (s, e) => OpenOrFocusUI());
            itemOpen.Font = new Font(itemOpen.Font, FontStyle.Bold);
            _trayMenu.Items.Add(itemOpen);

            _trayMenu.Items.Add("Buka di Browser", null, (s, e) => OpenInDefaultBrowser());
            _trayMenu.Items.Add("Restart Server", null, (s, e) => RestartNodeServer());
            _trayMenu.Items.Add(new ToolStripSeparator());
            _trayMenu.Items.Add("Keluar", null, (s, e) => ExitApplication());

            _trayIcon = new NotifyIcon
            {
                Text = "Mark Agent",
                ContextMenuStrip = _trayMenu,
                Visible = true
            };

            // Load Custom Icon
            if (File.Exists(_iconPath))
            {
                try
                {
                    _trayIcon.Icon = new Icon(_iconPath);
                }
                catch
                {
                    _trayIcon.Icon = SystemIcons.Application;
                }
            }
            else
            {
                _trayIcon.Icon = SystemIcons.Application;
            }

            _trayIcon.DoubleClick += (s, e) => OpenOrFocusUI();
        }

        private static void StartNodeServer()
        {
            try
            {
                // Prioritaskan node runtime lokal jika ada di folder ./node/node.exe, atau gunakan global node
                string localNode = Path.Combine(_appDirectory, "node", "node.exe");
                string nodeExe = File.Exists(localNode) ? localNode : "node.exe";
                string scriptPath = Path.Combine(_appDirectory, "bin", "mark.js");

                if (!File.Exists(scriptPath))
                {
                    scriptPath = Path.Combine(_appDirectory, "src", "server", "index.js");
                }

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = string.Format("\"{0}\" --headless", scriptPath),
                    WorkingDirectory = _appDirectory,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = false,
                    RedirectStandardError = false
                };

                _nodeProcess = Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Gagal menjalankan server MARK: " + ex.Message, "MARK Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static async Task WaitForServerReadyAsync()
        {
            using (HttpClient client = new HttpClient())
            {
                client.Timeout = TimeSpan.FromSeconds(2);
                for (int i = 0; i < 30; i++)
                {
                    try
                    {
                        var res = await client.GetAsync(string.Format("http://localhost:{0}/api/health", ServerPort));
                        if (res.IsSuccessStatusCode) return;
                    }
                    catch
                    {
                        // Server belum siap
                    }
                    await Task.Delay(500);
                }
            }
        }

        private static void OpenOrFocusUI()
        {
            string url = string.Format("http://localhost:{0}", ServerPort);
            string profileDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "mark-agent", "ui-profile");

            try
            {
                // Luncurkan Microsoft Edge dalam mode App dengan profil terisolasi MARK
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "msedge.exe",
                    Arguments = string.Format("--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1280,800 --app-id=mark-ai-companion", url, profileDir),
                    UseShellExecute = true
                };
                Process.Start(psi);
            }
            catch
            {
                // Fallback ke default browser
                OpenInDefaultBrowser();
            }
        }

        private static void OpenInDefaultBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo(string.Format("http://localhost:{0}", ServerPort)) { UseShellExecute = true });
            }
            catch { }
        }

        private static void RestartNodeServer()
        {
            KillNodeProcess();
            Thread.Sleep(500);
            StartNodeServer();
            _trayIcon.ShowBalloonTip(2000, "MARK AI", "Server berhasil direstart.", ToolTipIcon.Info);
        }

        private static void KillNodeProcess()
        {
            try
            {
                if (_nodeProcess != null && !_nodeProcess.HasExited)
                {
                    _nodeProcess.Kill();
                    _nodeProcess.Dispose();
                    _nodeProcess = null;
                }
            }
            catch { }
        }

        private static void ExitApplication()
        {
            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
            }

            KillNodeProcess();
            Application.Exit();
            Environment.Exit(0);
        }
    }
}
