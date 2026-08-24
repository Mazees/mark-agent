use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::oneshot;

static NEXT_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

type PendingRequests = Arc<Mutex<HashMap<u64, oneshot::Sender<serde_json::Value>>>>;

pub struct NodeBridgeState {
    stdin_writer: Arc<tokio::sync::Mutex<Option<ChildStdin>>>,
    pending_requests: PendingRequests,
}

impl NodeBridgeState {
    pub fn new() -> Self {
        Self {
            stdin_writer: Arc::new(tokio::sync::Mutex::new(None)),
            pending_requests: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn send_request(
        &self,
        action: &str,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let req_id = NEXT_REQUEST_ID.fetch_add(1, Ordering::SeqCst);

        let (tx, rx) = oneshot::channel();
        {
            let mut map = self.pending_requests.lock().unwrap();
            map.insert(req_id, tx);
        }

        let request_json = serde_json::json!({
            "id": req_id,
            "action": action,
            "payload": payload
        });

        let mut request_str = request_json.to_string();
        request_str.push('\n');

        {
            let mut writer_lock = self.stdin_writer.lock().await;
            if let Some(ref mut stdin) = *writer_lock {
                stdin
                    .write_all(request_str.as_bytes())
                    .await
                    .map_err(|e| format!("Gagal menulis ke Node engine: {}", e))?;
                stdin
                    .flush()
                    .await
                    .map_err(|e| format!("Gagal flush ke Node engine: {}", e))?;
            } else {
                return Err("Node.js engine tidak aktif".to_string());
            }
        }

        match tokio::time::timeout(Duration::from_secs(180), rx).await {
            Ok(Ok(response_json)) => Ok(response_json),
            Ok(Err(_)) => Err("Koneksi channel Node engine terputus".to_string()),
            Err(_) => {
                let mut map = self.pending_requests.lock().unwrap();
                map.remove(&req_id);
                Err(format!("Request timeout untuk aksi '{}'", action))
            }
        }
    }
}

#[derive(Serialize)]
pub struct NodeResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

pub async fn start_node_engine(app: AppHandle, state: Arc<NodeBridgeState>) -> Result<(), String> {
    let engine_path = if std::path::Path::new("backend/engine.js").exists() {
        "backend/engine.js".to_string()
    } else if std::path::Path::new("../backend/engine.js").exists() {
        "../backend/engine.js".to_string()
    } else if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("backend/engine.js");
        if bundled.exists() {
            bundled.to_string_lossy().to_string()
        } else {
            "backend/engine.js".to_string()
        }
    } else {
        "backend/engine.js".to_string()
    };

    log::info!("[NodeBridge] Memulai Node.js backend engine di path: {}", engine_path);

    let mut cmd = Command::new("node");

    // Di mode development (debug build), aktifkan flag --watch bawaan Node.js
    // sehingga setiap perubahan di folder backend/ akan otomatis me-reload engine tanpa restart aplikasi.
    if cfg!(debug_assertions) {
        cmd.arg("--watch");
    }

    let mut child = cmd
        .arg(&engine_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Gagal menjalankan Node.js engine: {}. Pastikan Node.js terinstall.", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Gagal mengambil stdout Node.js engine".to_string())?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Gagal mengambil stdin Node.js engine".to_string())?;

    {
        let mut writer_lock = state.stdin_writer.lock().await;
        *writer_lock = Some(stdin);
    }

    let pending = state.pending_requests.clone();
    let app_handle = app.clone();

    // Background listener for Node.js stdout
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
                // Check if this is an event
                if let Some(event_name) = json.get("event").and_then(|v| v.as_str()) {
                    let payload = json.get("payload").unwrap_or(&serde_json::Value::Null);
                    let _ = app_handle.emit(event_name, payload);
                    continue;
                }

                // Check if this is a response to a pending request
                if let Some(id) = json.get("id").and_then(|v| v.as_u64()) {
                    let sender_opt = {
                        let mut map = pending.lock().unwrap();
                        map.remove(&id)
                    };

                    if let Some(sender) = sender_opt {
                        let _ = sender.send(json);
                    }
                }
            }
        }
        log::warn!("[NodeBridge] Node.js engine stdout closed");
    });

    Ok(())
}

#[tauri::command]
pub async fn node_invoke(
    app: AppHandle,
    action: String,
    payload: Option<serde_json::Value>,
) -> Result<NodeResponse, String> {
    let state = app.state::<Arc<NodeBridgeState>>();
    let response_json = state
        .send_request(&action, payload.unwrap_or(serde_json::Value::Null))
        .await?;

    let success = response_json
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let data = response_json.get("data").cloned();
    let error = response_json
        .get("error")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok(NodeResponse {
        success,
        data,
        error,
    })
}
