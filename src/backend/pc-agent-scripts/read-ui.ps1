# read-ui.ps1
# Windows UIAutomation Accessibility Tree reader for MARK PC Automation
# Zero Vision Cost: Extracts interactive GUI elements as JSON text (~200-400 tokens)

$ErrorActionPreference = "SilentlyContinue"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

# Get foreground window handle
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

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
}
"@
Add-Type -TypeDefinition $code -Language CSharp

$hwnd = [Win32]::GetTargetWindow()
$titleBuilder = New-Object System.Text.StringBuilder 512
[Win32]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
$windowTitle = $titleBuilder.ToString()

$processId = 0
[Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
$processName = "unknown"
if ($processId -gt 0) {
    try {
        $proc = Get-Process -Id $processId
        $processName = $proc.ProcessName + ".exe"
    } catch {}
}

# Traverse Accessibility Tree of Foreground Window
$elements = @()
$idCounter = 1

try {
    $windowElement = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
    if ($windowElement) {
        $condition = [System.Windows.Automation.Condition]::TrueCondition
        $treeWalker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
        
        # We search descendants using FindAll with TrueCondition, limited to top 60 interactive elements
        $allControls = $windowElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
        
        foreach ($el in $allControls) {
            if ($idCounter -gt 60) { break }
            
            # Check if element is enabled and offscreen=false
            $enabled = $el.Current.IsEnabled
            $offscreen = $el.Current.IsOffscreen
            if (-not $enabled -or $offscreen) { continue }

            $role = $el.Current.ControlType.ProgrammaticName.Replace("ControlType.", "")
            $interactiveRoles = @("Button", "Edit", "MenuItem", "TabItem", "ComboBox", "CheckBox", "RadioButton", "Hyperlink", "ListItem", "TreeItem", "DataItem", "Text")
            if ($interactiveRoles -notcontains $role) { continue }

            $name = $el.Current.Name
            $autoId = $el.Current.AutomationId
            $rect = $el.Current.BoundingRectangle

            # Skip elements with empty name & empty autoId unless it's an Edit control
            if ([string]::IsNullOrWhiteSpace($name) -and [string]::IsNullOrWhiteSpace($autoId) -and $role -ne "Edit") {
                continue
            }

            # Extract Value if Edit
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

            $elements += $elementObj
            $idCounter++
        }
    }
} catch {
    # If error reading Accessibility Tree, return empty elements array so caller can fallback to OCR
}

$output = @{
    window = $windowTitle
    process = $processName
    elements = $elements
    element_count = $elements.Count
    method = "uiautomation"
}

$json = $output | ConvertTo-Json -Depth 5 -Compress
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output $json
