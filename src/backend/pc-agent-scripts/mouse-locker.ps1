Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Windows.Forms;

public class MouseBlocker {
    private const int WH_MOUSE_LL = 14;
    private const uint LLMHF_INJECTED = 0x01;
    private const uint LLMHF_LOWER_IL_INJECTED = 0x02;
    
    [StructLayout(LayoutKind.Sequential)]
    private struct MSLLHOOKSTRUCT {
        public int x;
        public int y;
        public uint mouseData;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }
    
    private delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);
    
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);
    
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool UnhookWindowsHookEx(IntPtr hhk);
    
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);
    
    private static IntPtr _hookID = IntPtr.Zero;
    private static LowLevelMouseProc _proc = HookCallback;
    
    public static void Start() {
        _hookID = SetHook(_proc);
        AppDomain.CurrentDomain.ProcessExit += (s, e) => {
            if (_hookID != IntPtr.Zero) {
                UnhookWindowsHookEx(_hookID);
                _hookID = IntPtr.Zero;
            }
        };
        Console.WriteLine("LOCKED");
        Application.Run();
    }
    
    private static IntPtr SetHook(LowLevelMouseProc proc) {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            return SetWindowsHookEx(WH_MOUSE_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
        }
    }
    
    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            MSLLHOOKSTRUCT hookStruct = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
            
            // Allow injected events (AI automation) to pass, block physical events
            bool isInjected = (hookStruct.flags & LLMHF_INJECTED) != 0 || 
                              (hookStruct.flags & LLMHF_LOWER_IL_INJECTED) != 0;
            
            if (!isInjected) {
                return (IntPtr)1; // Block event
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }
}
"@ -ReferencedAssemblies "System.Windows.Forms"

[MouseBlocker]::Start()
