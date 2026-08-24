# ocr-region.ps1
# 100% Offline Windows Runtime OCR fallback for MARK PC Automation
# Zero Vision Tokens: Converts screen region to JSON text coordinates (~300-500 tokens)

$ErrorActionPreference = "SilentlyContinue"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Runtime.WindowsRuntime

# Win32 API to get foreground window title & bounding rect
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

public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

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

$rect = New-Object RECT
[Win32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null

$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top

if ($width -le 0 -or $height -le 0) {
    # Fallback to primary screen bounds if window rect is invalid
    $width = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width
    $height = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height
    $rect.Left = 0
    $rect.Top = 0
}

# Capture screen region
$bmp = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
$tempPath = [System.IO.Path]::Combine($env:TEMP, "mark_ocr_temp_$([Guid]::NewGuid().ToString('N')).png")
$bmp.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bmp.Dispose()

# Run WinRT OCR
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
            
            # Compute bounding box of entire line in screen coordinates
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
    # If OCR fails, return empty detected_text
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

$json = $output | ConvertTo-Json -Depth 5 -Compress
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output $json
