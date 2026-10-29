# Chrome Bridge

Chrome Bridge is a bundled MARK add-on for controlling one user-selected tab in Google Chrome on Windows. The Chrome extension is named **Mark Agent Bridge** and uses MARK's existing icon. The engine plugin and tool group remain **`chrome-use`**. General browser requests continue to use `browser_use`.

## Installation

1. Open **Add-ons → Chrome Bridge** (`/addons/chrome-bridge`) and choose **Install**.
2. If an existing unmanaged `chrome-use` plugin is found, confirm replacement. MARK copies the entire previous directory into its add-on backup directory before replacing it. Failed installation restores the previous files and configuration.
3. In Google Chrome 116 or newer, open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
4. Select the extension directory displayed by MARK. Use **Buka folder ekstensi** or **Salin lokasi** to find it.
5. Open the page to control, open **Mark Agent Bridge**, and choose **Hubungkan tab ini**.

MARK ships all required files. Installation does not download dependencies, run npm, launch a second Node process, or use the old VBS launcher. The original extension source outside the installed add-on is left untouched.

## Files and packaging

| Purpose                      | Location                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| Authoritative bundled source | `src/main/addons/chrome-bridge/bundle/`                            |
| Installed engine             | `%USERPROFILE%\Documents\Mark Plugins\chrome-use`                  |
| Installed extension          | `%USERPROFILE%\.config\mark-agent\addons\chrome-bridge\extension`  |
| Private installation state   | `%USERPROFILE%\.config\mark-agent\addons\chrome-bridge\state.json` |
| Complete plugin backups      | `%USERPROFILE%\.config\mark-agent\addons\chrome-bridge\backups`    |
| Screenshot artifacts         | `%USERPROFILE%\.config\mark-agent\temp-uploads`                    |

The add-on service creates separate random tokens for the plugin HTTP client and extension WebSocket client. Generated `connection.json` files are installation-specific and are never included in the bundled source. Do not commit, log, or pass their contents to the AI. Installation state is separate from the generic application config API.

`installed` is persisted in `state.json` after the files have been placed. The server reads this state through `createChromeBridge()`; the UI obtains it from the status endpoint. The presence of an old unmanaged plugin is reported separately as `legacyPlugin`, not as a successful add-on installation.

The root npm package includes `src`; `build/package-release.ps1` also copies `src`. Both therefore include the add-on and extension sources without a separate distribution pipeline. Increment `CHROME_BRIDGE_VERSION`, engine manifest/package version, extension manifest version, and the content-script handshake version together when changing this protocol or releasing an updated bundle. Updates replace the installed files at the same extension path. Users reload the extension in `chrome://extensions` after updating; socket reconnection alone does not load new extension code.

## Lifecycle and protocol

`service.js` owns the HTTP/WebSocket listener inside the MARK process at `127.0.0.1:8765`. MARK starts it only for an installed add-on and stops it on shutdown. A port conflict reports an error and leaves the other process running. **Hubungkan ulang** retries the connection.

The engine sends authenticated `POST /rpc` requests using its Bearer token. The extension connects to `/ws`, authenticates in its first message, and sends version and selected-tab state. The server requires a Chrome-extension origin, a matching token and version, and at most one authenticated extension. Heartbeats detect stale connections. Public status responses contain no tokens or tool results.

| MARK endpoint                           | Method | Purpose                                                                                |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `/api/addons/chrome-bridge/status`      | GET    | Installation, connection, version, selected tab, pause state, setup path and errors    |
| `/api/addons/chrome-bridge/install`     | POST   | Install/update; `replaceExisting: true` confirms legacy replacement                    |
| `/api/addons/chrome-bridge/uninstall`   | POST   | Stop bridge, revoke tokens, cancel work, remove managed engine and extension directory |
| `/api/addons/chrome-bridge/reconnect`   | POST   | Restart MARK's listener without touching unrelated processes                           |
| `/api/addons/chrome-bridge/open-folder` | POST   | Open the fixed installed extension directory in Explorer                               |

Status values are `not-installed`, `waiting-extension`, `select-tab`, `connected`, `paused`, `disconnected`, and `error`. Plugin reload events update tool availability after install/uninstall; add-on status events update the catalog and detail page.

The plugin loader retains the engine for tool execution, but rejects generic save, toggle and delete requests for managed plugins. Plugin Hub displays these entries and links to their add-on for management. The bundled `chrome-use` manifest also sets `editable: false`; missing `editable` defaults to `true` for other plugins. This flag blocks definition changes without removing tools or tags.

## Selected-tab behavior

- Only the tab explicitly selected through the popup receives actions. Switching the active tab or window never changes the target. `urlPattern` checks the selected tab and never searches for another tab.
- Navigation retains the tab selection but creates a new document and element registry. Content injection is idempotent. Removed DOM nodes cannot be used through stale element references.
- Selection is stored in Chrome's `storage.session`, allowing recovery after a service-worker restart while requiring selection again after a browser restart.
- Closing the selected tab releases control. **Putuskan** releases control without closing the tab. **Jeda** cancels pending requests and refuses new actions until resumed.
- Popup reconnection recreates the WebSocket and ignores callbacks from superseded sockets. It does not reload the extension.
- Normal requests time out after 30 seconds; help requests after five minutes. Timeout, user abort, selection change, pause, disconnection and uninstall cancel outstanding work. Mutating actions are never automatically retried. Already executed page changes cannot be undone by cancelling the request.
- Requests are serialized. Pending and queued requests from an earlier control state cannot execute after a selection change or cancellation.

## Engine tools

All ten public tool names and legacy string query formats are retained. Multiple values can be supplied through a JSON string.

| Tool                | Query                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| `chrome-navigate`   | URL, or `{ "url": "https://example.com" }`                                   |
| `chrome-read`       | Optional description; returns DOM element IDs                                |
| `chrome-click`      | Element ID, or `{ "element_id": 1 }`                                         |
| `chrome-type`       | `1 text`, or `{ "element_id": 1, "text": "text" }`                           |
| `chrome-extract`    | CSS selector, or `{ "selector": "h1", "urlPattern": "example.com" }`         |
| `chrome-script`     | JavaScript, or `{ "script": "document.title", "urlPattern": "example.com" }` |
| `chrome-scroll`     | `up` or `down`                                                               |
| `chrome-screenshot` | Optional artifact filename                                                   |
| `chrome-ask-user`   | Help message                                                                 |
| `chrome-close`      | Optional reason                                                              |

Input uses native setters and bubbling events for React-controlled inputs and contenteditable. Scripts run through `chrome.debugger`; attachment or evaluation errors are returned as failures. The extension detaches only debugger sessions it successfully attached itself. There is no success fallback for scripts that did not execute.

Screenshots use the selected tab's debugger target, not the active tab's viewport. The engine writes a PNG artifact and returns Markdown using `/api/chat/temp-file/<filename>`, which MARK can display in chat.

Help appears in a small non-modal panel on the selected page. The user can continue interacting with the page and choose **Lanjutkan** or **Batal**. Cancelling the request removes the panel.

Uninstall removes only the add-on-managed engine, retains backups, and explains that **Mark Agent Bridge** must also be removed through Chrome's extension manager. The initial implementation does not use Native Messaging or the Chrome Web Store.

## Verification

Run from the repository root:

```powershell
node --test scripts/chrome-bridge.test.mjs
node --test scripts/chrome-bridge-browser.test.mjs
node --test scripts/chrome-bridge-ui.test.mjs
npm run lint
npm run build:ui
npm pack --dry-run --json
graphify update .
```

The service tests use temporary homes and ports. They cover clean/repeated installation, complete legacy backup, port-conflict rollback, restart, ownership guards, authentication, all engine tools, screenshot artifacts, cancellation and routes.

The browser suite loads the real extension into an isolated headless Google Chrome profile. It checks selected-tab isolation, focus changes, React/contenteditable input, navigation, script errors, screenshot pixels/artifacts, non-blocking help, pause, reconnect, service-worker restart, tab closure and browser restart. Set `CHROME_BRIDGE_TEST_BROWSER` to an alternate Chrome executable if needed; browser suites skip explicitly when the executable is unavailable.

`AddonDetail.jsx` is the shared template for the header, management actions, feedback and example prompts. Each integration supplies its own status, action callbacks and content as children below the examples. Example prompts live in `addonRegistry.js`; selecting one only drafts a chat message. Google Workspace, Telegram and Chrome Bridge all use this template.

The UI suite renders the actual add-on components and tests status labels, legacy replacement and uninstall dialogs, keyboard cancellation, long text and narrow layouts. It also checks that all three integrations use a single template and that Telegram's shared action buttons submit its settings form. Set `CHROME_BRIDGE_SCREENSHOT_DIR` to save its preview. This fixture supplies simulated statuses and intercepts config requests; it never installs into the user's real plugin directory.
