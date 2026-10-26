import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {
  executeComputerUse,
  stopDaemon,
  focusWindow,
  computerUseSessionStatus
} from '../src/server/tools/pc-agent.js'
import { grantComputerUsePermission } from '../src/server/tools/computer-use-permissions.js'
import { probeHud } from '../src/server/tools/overlay-manager.js'

if (process.platform !== 'win32') throw new Error('Pemeriksaan ini memerlukan desktop Windows.')
const directory = path.resolve('.mark/computer-use-smoke')
await fs.mkdir(directory, { recursive: true })
const source = path.join(directory, 'Fixture.cs'),
  exe = path.join(directory, 'Fixture.exe')
const code = String.raw`
using System;
using System.Drawing;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;
using System.Threading;
class Fixture {
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, int extra);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, int data, int extra);
  static JavaScriptSerializer json = new JavaScriptSerializer();
  static void Emit(object value) { Console.WriteLine(json.Serialize(value)); Console.Out.Flush(); }
  [STAThread] static void Main() {
    var screen = Screen.PrimaryScreen.Bounds;
    var form = new Form { Text = "Mark Computer Use Fixture", FormBorderStyle = FormBorderStyle.None, StartPosition = FormStartPosition.Manual, Bounds = screen, BackColor = Color.FromArgb(245,248,246) };
    var heading = new Label { Text = "Pemeriksaan Computer Use Mark", Left = 160, Top = 70, Width = 700, Height = 50, Font = new Font("Segoe UI", 24), ForeColor = Color.FromArgb(17,45,28) };
    var button = new Button { Text = "Uji klik", Left = 160, Top = 160, Width = 230, Height = 55, Font = new Font("Segoe UI", 16) };
    var input = new TextBox { Left = 160, Top = 250, Width = 650, Height = 180, Multiline = true, Font = new Font("Segoe UI", 18) };
    var status = new Label { Text = "Klik: 0", Left = 430, Top = 170, Width = 300, Height = 40, Font = new Font("Segoe UI", 18) };
    int clicks = 0;
    button.MouseDown += (s,e) => Emit(new { type = "mouse-down", time = Environment.TickCount });
    button.MouseUp += (s,e) => Emit(new { type = "mouse-up", time = Environment.TickCount });
    button.Click += (s,e) => { status.Text = "Klik: " + ++clicks; Emit(new { type = "click", count = clicks, time = Environment.TickCount }); };
    input.TextChanged += (s,e) => Emit(new { type = "text", text = input.Text });
    form.Controls.AddRange(new Control[] { heading, button, input, status });
    form.Shown += (s,e) => { form.Activate(); Emit(new { type = "ready", windowId = form.Handle.ToInt64().ToString(), width = screen.Width, height = screen.Height }); };
    new Thread(() => {
      string command;
      while ((command = Console.ReadLine()) != null) {
        if (command == "mouse") { mouse_event(2,0,0,0,0); mouse_event(4,0,0,0,0); Emit(new { type = "blocked-mouse-sent" }); }
        if (command == "cancel") {
          keybd_event(0x11,0,0,0); keybd_event(0x10,0,0,0); keybd_event(0x52,0,0,0);
          Thread.Sleep(40);
          keybd_event(0x52,0,2,0); keybd_event(0x10,0,2,0); keybd_event(0x11,0,2,0);
        }
      }
    }) { IsBackground = true }.Start();
    Application.Run(form);
  }
}`
await fs.writeFile(source, code)
const compiler = spawn(
  path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
  [
    '/nologo',
    '/target:exe',
    '/out:' + exe,
    '/reference:System.Windows.Forms.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Web.Extensions.dll',
    source
  ],
  { windowsHide: true }
)
compiler.stdout.pipe(process.stdout)
compiler.stderr.pipe(process.stderr)
assert.equal((await once(compiler, 'exit'))[0], 0)
const fixture = spawn(exe, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
let buffer = '',
  currentText = '',
  clickCount = 0,
  ready
const readyPromise = new Promise((resolve) => {
  ready = resolve
})
fixture.stdout.setEncoding('utf8')
fixture.stdout.on('data', (chunk) => {
  buffer += chunk
  let newline
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    try {
      const event = JSON.parse(line)
      if (event.type === 'ready') ready(event)
      if (event.type === 'text') currentText = event.text
      if (event.type === 'click') clickCount = event.count
      if (process.env.MARK_SMOKE_DEBUG && ['click', 'mouse-down', 'mouse-up'].includes(event.type))
        console.log(event)
    } catch {
      /* Only the fixture's JSON events are relevant. */
    }
  }
})
try {
  const setup = await Promise.race([
    readyPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Fixture tidak siap.')), 5000))
  ])
  const sessionId = 'computer-use-native-fixture'
  const call = (args) => executeComputerUse({ sessionId, ...args })
  await focusWindow('', false, setup.windowId)
  const denied = await call({ action: 'screenshot', wait_ms: 0 })
  assert.equal(denied.success, false)
  assert.equal(denied.image, undefined)
  const unapproved = await call({ action: 'open_session', wait_ms: 0 })
  assert.equal(unapproved.success, false)
  assert.equal(computerUseSessionStatus().status, 'closed')
  const permission = () => grantComputerUsePermission({ sessionId, runId: sessionId })
  const opened = await call({ action: 'open_session', approvalToken: permission(), wait_ms: 0 })
  assert.equal(opened.success, true, opened.error)
  assert.equal(computerUseSessionStatus().status, 'active')
  await new Promise((resolve) => setTimeout(resolve, 1700))
  assert.equal((await probeHud()).cursorVisible, true, 'Sesi tidak boleh melepas mouse antaraksi.')
  const point = (x, y) => [
    Math.round((x * 1280) / setup.width),
    Math.round((y * 720) / setup.height)
  ]
  const focused = await call({ action: 'focus_window', window_id: setup.windowId, wait_ms: 0 })
  assert.equal(focused.success, true, focused.error)
  if (process.env.MARK_SMOKE_DEBUG) console.log('Sebelum klik:', clickCount)
  const initialClicks = clickCount
  const started = performance.now()
  const clicked = await call({
    action: 'click',
    coordinate: point(270, 185),
    observation_id: focused.observation.id,
    wait_ms: 5000
  })
  const elapsed = performance.now() - started
  assert.equal(clicked.success, true, clicked.error)
  assert.ok(elapsed >= 5000)
  assert.equal(clicked.wait_ms, 5000)
  assert.equal(clicked.captureStatus, 'captured')
  assert.equal(clicked.observation.window_id, setup.windowId)
  assert.equal(clickCount, initialClicks + 1)
  await fs.writeFile(
    path.join(directory, 'after-click.jpg'),
    Buffer.from(clicked.image.split(',')[1], 'base64')
  )
  console.log(
    'PASS: klik sekali, jeda lima detik, dan screenshot dalam satu hasil tool (' +
      Math.round(elapsed) +
      ' ms).'
  )
  const inputFocus = await call({ action: 'click', coordinate: point(300, 300), wait_ms: 0 })
  assert.equal(inputFocus.success, true, inputFocus.error)
  const typed = await call({ action: 'type', text: 'Café 日本語\nBaris kedua', wait_ms: 0 })
  assert.equal(typed.success, true, typed.error)
  assert.equal(currentText.replaceAll('\r\n', '\n'), 'Café 日本語\nBaris kedua')
  const failedBatch = await call({
    actions: [
      { action: 'key', key: 'not-a-real-key' },
      { action: 'type', text: 'JANGAN DIKETIK' }
    ],
    wait_ms: 0
  })
  assert.equal(failedBatch.success, false)
  assert.equal(failedBatch.count, 1)
  assert.equal(failedBatch.captureStatus, 'captured')
  assert.ok(!currentText.includes('JANGAN'))
  const stale = await call({
    action: 'click',
    coordinate: point(270, 185),
    observation_id: focused.observation.id,
    wait_ms: 0
  })
  assert.equal(stale.success, false)
  assert.equal(clickCount, initialClicks + 1)
  console.log(
    'PASS: input Unicode/multiline, berhenti pada error batch, dan penolakan observasi lama.'
  )
  const controller = new AbortController()
  const pending = call({
    action: 'click',
    coordinate: point(270, 185),
    wait_ms: 5000,
    signal: controller.signal
  })
  const deadline = performance.now() + 5000
  while (clickCount < initialClicks + 2 && performance.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(clickCount, initialClicks + 2)
  controller.abort()
  const cancelled = await pending
  assert.equal(cancelled.success, false)
  assert.equal(cancelled.executionStatus, 'cancelled')
  assert.equal(clickCount, initialClicks + 2)
  assert.equal(computerUseSessionStatus().status, 'closed')
  console.log('PASS: pembatalan saat menunggu tidak mengulang klik.')
  const reopened = await call({ action: 'open_session', approvalToken: permission(), wait_ms: 0 })
  assert.equal(reopened.success, true, reopened.error)
  const userCancelled = call({ action: 'click', coordinate: point(270, 185), wait_ms: 5000 })
  const userDeadline = performance.now() + 5000
  while (clickCount < initialClicks + 3 && performance.now() < userDeadline)
    await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(clickCount, initialClicks + 3)
  fixture.stdin.write('mouse\n')
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(
    clickCount,
    initialClicks + 3,
    'Klik di luar Mark harus ditahan ketika mouse dikunci.'
  )
  fixture.stdin.write('cancel\n')
  const cancelledByUser = await userCancelled
  assert.equal(cancelledByUser.success, false)
  assert.equal(cancelledByUser.cancelledBy, 'user')
  assert.match(cancelledByUser.error, /Ctrl\+Shift\+R/)
  const blocked = await call({ action: 'screenshot' })
  assert.equal(blocked.executionStatus, 'cancelled')
  const newTurn = await call({
    action: 'open_session',
    runId: 'new-user-turn',
    approvalToken: grantComputerUsePermission({ sessionId, runId: 'new-user-turn' }),
    wait_ms: 0
  })
  assert.equal(newTurn.success, true, newTurn.error)
  const closed = await call({ action: 'close', runId: 'new-user-turn' })
  assert.equal(closed.success, true)
  assert.equal(computerUseSessionStatus().status, 'closed')
  console.log(
    'PASS: mouse terkunci, Ctrl+Shift+R membatalkan dan memberi alasan ke AI; giliran lama diblokir, giliran baru dapat mengamati ulang.'
  )
} finally {
  stopDaemon()
  fixture.kill()
  await once(fixture, 'exit').catch(() => {})
  await fs.unlink(source).catch(() => {})
  await fs.unlink(exe).catch(() => {})
}
