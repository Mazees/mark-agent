mod cmd_node_bridge;
mod cmd_screenshot;
mod cmd_window;

use std::sync::Arc;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let node_state = Arc::new(cmd_node_bridge::NodeBridgeState::new());

    tauri::Builder::default()
        .manage(node_state.clone())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            cmd_window::window_minimize,
            cmd_window::window_maximize,
            cmd_window::window_close,
            cmd_window::get_documents_path,
            cmd_window::open_external,
            cmd_window::show_notification,
            cmd_window::sync_config,
            cmd_screenshot::take_screenshot,
            cmd_node_bridge::node_invoke,
        ])
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Start Node.js background engine
            let app_handle_for_node = app.handle().clone();
            let node_state_for_spawner = node_state.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) =
                    cmd_node_bridge::start_node_engine(app_handle_for_node, node_state_for_spawner).await
                {
                    log::error!("[NodeBridge] Gagal memulai Node engine: {}", e);
                }
            });

            // Setup System Tray Menu
            let handle = app.handle();
            let open_item = MenuItemBuilder::with_id("open", "Buka Mark").build(handle)?;
            let audio_item =
                MenuItemBuilder::with_id("live_audio", "Ngobrol Sekarang (Live Audio)").build(handle)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Keluar").build(handle)?;

            let tray_menu = MenuBuilder::new(handle)
                .item(&open_item)
                .item(&audio_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("Mark AI Assistant")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "live_audio" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("trigger-live-audio", ());
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(handle)?;

            // Register Global Shortcut Ctrl+Alt+M
            let shortcut: Shortcut = "Ctrl+Alt+M".parse().unwrap();
            let app_handle = app.handle().clone();
            app.global_shortcut()
                .on_shortcut(shortcut, move |_app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("trigger-live-audio", ());
                        }
                    }
                })?;

            // Listen to window state changes (maximize/unmaximize)
            if let Some(window) = app.get_webview_window("main") {
                let win_clone = window.clone();
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::Resized(_) => {
                        let is_max = win_clone.is_maximized().unwrap_or(false);
                        let _ = win_clone.emit("window-maximized", is_max);
                    }
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        // Prevent close, hide to tray instead
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                    _ => {}
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
