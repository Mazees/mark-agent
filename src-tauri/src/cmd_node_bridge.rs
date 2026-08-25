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

        // Tunggu hingga Node.js engine siap (maksimal 15 detik saat boot awal / auto-restart)
        let mut stdin_acquired = false;
        let start_time = std::time::Instant::now();
        while start_time.elapsed() < Duration::from_secs(15) {
            {
                let mut writer_lock = self.stdin_writer.lock().await;
                if let Some(ref mut stdin) = *writer_lock {
                    if let Err(e) = stdin.write_all(request_str.as_bytes()).await {
                        let mut map = self.pending_requests.lock().unwrap();
                        map.remove(&req_id);
                        return Err(format!("Gagal menulis ke Node engine: {}", e));
                    }
                    if let Err(e) = stdin.flush().await {
                        let mut map = self.pending_requests.lock().unwrap();
                        map.remove(&req_id);
                        return Err(format!("Gagal flush ke Node engine: {}", e));
                    }
                    stdin_acquired = true;
                    break;
                }
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        if !stdin_acquired {
            let mut map = self.pending_requests.lock().unwrap();
            map.remove(&req_id);
            return Err("Node.js engine tidak aktif (timeout menunggu inisialisasi)".to_string());
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

fn find_node_executable() -> String {
    let standard_paths = [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
        r"C:\ProgramData\chocolatey\bin\node.exe",
    ];
    for path in &standard_paths {
        if std::path::Path::new(path).exists() {
            return path.to_string();
        }
    }
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let scoop1 = std::path::Path::new(&user_profile).join(r"scoop\apps\nodejs\current\node.exe");
        if scoop1.exists() { return scoop1.to_string_lossy().to_string(); }
        let scoop2 = std::path::Path::new(&user_profile).join(r"scoop\shims\node.exe");
        if scoop2.exists() { return scoop2.to_string_lossy().to_string(); }
    }
    if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
        let fnm = std::path::Path::new(&local_app).join(r"fnm_multishells\current\node.exe");
        if fnm.exists() {
            return fnm.to_string_lossy().to_string();
        }
        let volta = std::path::Path::new(&local_app).join(r"Volta\bin\node.exe");
        if volta.exists() {
            return volta.to_string_lossy().to_string();
        }
        let programs = std::path::Path::new(&local_app).join(r"Programs\node\node.exe");
        if programs.exists() {
            return programs.to_string_lossy().to_string();
        }
    }
    if let Ok(app_data) = std::env::var("APPDATA") {
        let nvm = std::path::Path::new(&app_data).join(r"nvm\current\node.exe");
        if nvm.exists() {
            return nvm.to_string_lossy().to_string();
        }
        let npm = std::path::Path::new(&app_data).join(r"npm\node.exe");
        if npm.exists() {
            return npm.to_string_lossy().to_string();
        }
    }
    "node".to_string()
}

fn strip_unc_prefix(path: &std::path::Path) -> std::path::PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        std::path::PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

fn find_node_modules(start: &std::path::Path) -> std::path::PathBuf {
    let mut cur = Some(start);
    while let Some(dir) = cur {
        let candidate = dir.join("node_modules");
        if candidate.is_dir() {
            return candidate;
        }
        let backend_candidate = dir.join("backend").join("node_modules");
        if backend_candidate.is_dir() {
            return backend_candidate;
        }
        cur = dir.parent();
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut cur = exe.parent();
        while let Some(dir) = cur {
            let candidate = dir.join("node_modules");
            if candidate.is_dir() {
                return candidate;
            }
            let backend_candidate = dir.join("backend").join("node_modules");
            if backend_candidate.is_dir() {
                return backend_candidate;
            }
            cur = dir.parent();
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        let mut cur = Some(cwd.as_path());
        while let Some(dir) = cur {
            let candidate = dir.join("node_modules");
            if candidate.is_dir() {
                return candidate;
            }
            let backend_candidate = dir.join("backend").join("node_modules");
            if backend_candidate.is_dir() {
                return backend_candidate;
            }
            cur = dir.parent();
        }
    }
    start.join("node_modules")
}

fn resolve_engine_and_working_dir(app: &AppHandle) -> (std::path::PathBuf, std::path::PathBuf, std::path::PathBuf) {
    // 1. Di mode development (debug assertions), prioritaskan workspace root CWD
    if cfg!(debug_assertions) {
        if let Ok(cwd) = std::env::current_dir() {
            let mut cur = Some(cwd.as_path());
            while let Some(dir) = cur {
                for sub in &[
                    "out/backend/engine.mjs",
                    "backend/engine.js",
                    "backend/engine.mjs",
                ] {
                    let candidate = dir.join(sub);
                    if candidate.exists() {
                        let modules = find_node_modules(dir);
                        return (
                            strip_unc_prefix(&candidate),
                            strip_unc_prefix(dir),
                            strip_unc_prefix(&modules),
                        );
                    }
                }
                cur = dir.parent();
            }
        }
    }

    // 2. Cek dari app resource_dir (mode installed / packaged)
    if let Ok(res_dir) = app.path().resource_dir() {
        let candidates = [
            res_dir.join("backend").join("engine.mjs"),
            res_dir.join("resources").join("backend").join("engine.mjs"),
            res_dir.join("backend").join("engine.js"),
            res_dir.join("resources").join("backend").join("engine.js"),
            res_dir.join("_up_").join("backend").join("engine.mjs"),
            res_dir.join("_up_").join("backend").join("engine.js"),
        ];
        for candidate in &candidates {
            if candidate.exists() {
                let working_dir = candidate
                    .parent()
                    .unwrap_or(&res_dir)
                    .to_path_buf();
                let modules_dir = find_node_modules(&working_dir);
                return (
                    strip_unc_prefix(candidate),
                    strip_unc_prefix(&working_dir),
                    strip_unc_prefix(&modules_dir),
                );
            }
        }
    }

    // 3. Cek dari direktori executable saat ini
    if let Ok(exe_path) = std::env::current_exe() {
        let mut cur = exe_path.parent();
        while let Some(dir) = cur {
            for sub in &[
                "out/backend/engine.mjs",
                "backend/engine.mjs",
                "resources/backend/engine.mjs",
                "backend/engine.js",
                "resources/backend/engine.js",
            ] {
                let candidate = dir.join(sub);
                if candidate.exists() {
                    let modules = find_node_modules(dir);
                    return (
                        strip_unc_prefix(&candidate),
                        strip_unc_prefix(dir),
                        strip_unc_prefix(&modules),
                    );
                }
            }
            cur = dir.parent();
        }
    }

    // 4. Cek dari Current Working Directory
    if let Ok(cwd) = std::env::current_dir() {
        let mut cur = Some(cwd.as_path());
        while let Some(dir) = cur {
            for sub in &[
                "out/backend/engine.mjs",
                "backend/engine.mjs",
                "resources/backend/engine.mjs",
                "backend/engine.js",
                "resources/backend/engine.js",
            ] {
                let candidate = dir.join(sub);
                if candidate.exists() {
                    let modules = find_node_modules(dir);
                    return (
                        strip_unc_prefix(&candidate),
                        strip_unc_prefix(dir),
                        strip_unc_prefix(&modules),
                    );
                }
            }
            cur = dir.parent();
        }
    }

    // Fallback ke bundled mjs
    let fallback_working = strip_unc_prefix(&std::path::PathBuf::from("."));
    let fallback_modules = find_node_modules(&fallback_working);
    (
        strip_unc_prefix(&std::path::PathBuf::from("out/backend/engine.mjs")),
        fallback_working,
        strip_unc_prefix(&fallback_modules),
    )
}

pub async fn start_node_engine(app: AppHandle, state: Arc<NodeBridgeState>) {
    let mut retry_delay = 1;
    loop {
        let (engine_path, working_dir, node_modules_dir) = resolve_engine_and_working_dir(&app);
        let node_bin = find_node_executable();

        log::info!(
            "[NodeBridge] Memulai Node.js engine ({}) di: {:?}, cwd: {:?}, node_modules: {:?}",
            node_bin,
            engine_path,
            working_dir,
            node_modules_dir
        );
        eprintln!(
            "[NodeBridge] Memulai Node.js engine ({}) di: {:?}, cwd: {:?}, node_modules: {:?}",
            node_bin,
            engine_path,
            working_dir,
            node_modules_dir
        );

        let mut cmd = Command::new(&node_bin);
        cmd.current_dir(&working_dir);
        cmd.env("NODE_PATH", &node_modules_dir);

        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        // Di mode development (debug build), aktifkan flag --watch bawaan Node.js jika menggunakan source js mentah
        if cfg!(debug_assertions) && engine_path.to_string_lossy().ends_with(".js") {
            cmd.arg("--watch");
        }

        match cmd
            .arg(&engine_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(mut child) => {
                let stdout = child.stdout.take();
                let stdin = child.stdin.take();
                let stderr = child.stderr.take();

                if let Some(stderr) = stderr {
                    let mut err_reader = BufReader::new(stderr).lines();
                    tokio::spawn(async move {
                        while let Ok(Some(line)) = err_reader.next_line().await {
                            log::warn!("[NodeEngine Stderr] {}", line);
                            eprintln!("[NodeEngine Stderr] {}", line);
                        }
                    });
                }

                let stdin_holder: Arc<tokio::sync::Mutex<Option<ChildStdin>>> =
                    Arc::new(tokio::sync::Mutex::new(stdin));

                let pending = state.pending_requests.clone();
                let app_handle = app.clone();
                let stdin_for_listener = stdin_holder.clone();
                let state_for_listener = state.clone();

                if let Some(stdout) = stdout {
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

                                    // Aktifkan stdin_writer HANYA setelah engine-ready diterima
                                    if event_name == "engine-ready" {
                                        let taken_stdin = stdin_for_listener.lock().await.take();
                                        if let Some(s) = taken_stdin {
                                            let mut writer_lock = state_for_listener.stdin_writer.lock().await;
                                            *writer_lock = Some(s);
                                            log::info!("[NodeBridge] engine-ready diterima, stdin_writer diaktifkan.");
                                            eprintln!("[NodeBridge] engine-ready diterima, stdin_writer diaktifkan.");
                                        }
                                    }
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
                    });
                }

                // Fallback timer: Jika engine-ready tidak terpancing dalam 3 detik, aktifkan stdin_writer secara otomatis
                let stdin_fallback = stdin_holder.clone();
                let state_fallback = state.clone();
                tokio::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    let taken = stdin_fallback.lock().await.take();
                    if let Some(s) = taken {
                        let mut writer_lock = state_fallback.stdin_writer.lock().await;
                        if writer_lock.is_none() {
                            *writer_lock = Some(s);
                            log::info!("[NodeBridge] stdin_writer diaktifkan via fallback timer (3s).");
                            eprintln!("[NodeBridge] stdin_writer diaktifkan via fallback timer (3s).");
                        }
                    }
                });

                retry_delay = 1;

                // Tunggu process child selesai jika terjadi crash
                match child.wait().await {
                    Ok(exit_status) => {
                        log::error!(
                            "[NodeBridge] Node.js engine berhenti (status: {:?}). Menghidupkan ulang dalam {} detik...",
                            exit_status,
                            retry_delay
                        );
                    }
                    Err(e) => {
                        log::error!(
                            "[NodeBridge] Node.js engine error: {:?}. Menghidupkan ulang dalam {} detik...",
                            e,
                            retry_delay
                        );
                    }
                }

                {
                    let mut writer_lock = state.stdin_writer.lock().await;
                    *writer_lock = None;
                }
            }
            Err(e) => {
                log::error!(
                    "[NodeBridge] Gagal spawn Node engine: {}. Mencoba lagi dalam {} detik...",
                    e,
                    retry_delay
                );
            }
        }

        tokio::time::sleep(Duration::from_secs(retry_delay)).await;
        retry_delay = (retry_delay * 2).min(10);
    }
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
