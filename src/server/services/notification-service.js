import { exec } from 'child_process'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Mendapatkan absolute path icon MARK untuk Windows Toast
 */
function getNotificationIconPath() {
  const candidates = [
    path.resolve(__dirname, '../../../src/renderer/public/icon-256.png'),
    path.resolve(__dirname, '../../renderer/public/icon-256.png'),
    path.resolve(__dirname, '../../../out/renderer/icon-256.png'),
    path.resolve(__dirname, '../../out/renderer/icon-256.png')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

/**
 * Menampilkan notifikasi desktop native Windows (Toast Notification) tanpa izin WebUI.
 * Menggunakan Windows Runtime (WinRT) PowerShell yang terintegrasi langsung dengan Action Center Windows 10/11
 * dan menampilkan logo MARK secara native di samping teks.
 *
 * @param {string} title Judul notifikasi
 * @param {string} body Isi pesan notifikasi
 */
export function showNativeNotification(title = 'Mark', body = '') {
  const isWindows = os.platform() === 'win32'
  const safeTitle = (title || 'Mark').replace(/["`$\\]/g, ' ')
  const safeBody = (body || '').replace(/["`$\\]/g, ' ')
  const iconPath = getNotificationIconPath()

  if (!isWindows) {
    if (os.platform() === 'darwin') {
      exec(`osascript -e 'display notification "${safeBody}" with title "${safeTitle}"'`)
    } else {
      const iconArg = iconPath ? `-i "${iconPath}"` : ''
      exec(`notify-send ${iconArg} "${safeTitle}" "${safeBody}"`)
    }
    return
  }

  // Windows Toast Notification via PowerShell WindowsRuntime dengan icon & app id
  const hasIcon = Boolean(iconPath && fs.existsSync(iconPath))
  const templateType = hasIcon ? 'ToastImageAndText02' : 'ToastText02'
  const formattedIconUri = hasIcon ? 'file:///' + iconPath.replace(/\\/g, '/') : ''

  const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::${templateType})

${
  hasIcon
    ? `
$imageNodes = $template.GetElementsByTagName("image")
$imageNodes.Item(0).Attributes.GetNamedItem("src").NodeValue = "${formattedIconUri}"
`
    : ''
}

$textNodes = $template.GetElementsByTagName("text")
$textNodes.Item(0).AppendChild($template.CreateTextNode("${safeTitle}")) | Out-Null
$textNodes.Item(1).AppendChild($template.CreateTextNode("${safeBody}")) | Out-Null

$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("MARK Agent").Show($toast)
`.trim()

  const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64')
  exec(
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}`,
    {
      windowsHide: true
    },
    (err) => {
      if (err) {
        console.warn('[notification-service] Gagal memicu Windows Toast:', err.message)
      }
    }
  )
}
