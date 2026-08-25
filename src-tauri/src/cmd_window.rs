use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_maximize(window: WebviewWindow) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_close(window: WebviewWindow) -> Result<(), String> {
    // Hide to system tray instead of destroying
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_documents_path(app: AppHandle) -> Result<String, String> {
    app.path()
        .document_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn show_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_global_shortcut(app: AppHandle, shortcut_str: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    let normalized = shortcut_str
        .replace("CommandOrControl", "Ctrl")
        .replace("CmdOrCtrl", "Ctrl");

    let parsed_shortcut: Shortcut = match normalized.parse() {
        Ok(s) => s,
        Err(e) => return Err(e.to_string()),
    };

    let global_shortcut = app.global_shortcut();
    let _ = global_shortcut.unregister_all();

    let app_handle = app.clone();
    let _ = global_shortcut.on_shortcut(parsed_shortcut, move |_app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("trigger-live-audio", ());
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn sync_config(app: AppHandle, config: serde_json::Value) -> Result<(), String> {
    if let Some(shortcut_val) = config.get("shortcutKey").and_then(|v| v.as_str()) {
        if !shortcut_val.trim().is_empty() {
            let _ = update_global_shortcut(app.clone(), shortcut_val.to_string());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn show_pc_overlay_window(
    app: AppHandle,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pc-overlay") {
        if let (Some(w), Some(h)) = (width, height) {
            let _ = window.set_size(tauri::LogicalSize::new(w, h));
        }
        let _ = window.show();
        let _ = window.set_always_on_top(true);
    }
    Ok(())
}

#[tauri::command]
pub fn hide_pc_overlay_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pc-overlay") {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn resize_pc_overlay_window(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pc-overlay") {
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_devtools(window: WebviewWindow) -> Result<(), String> {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
    Ok(())
}
