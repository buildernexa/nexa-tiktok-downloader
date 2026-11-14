#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;

use chrono::{Local, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex, RwLock};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("I/O error: {0}")] Io(#[from] std::io::Error),
    #[error("yt-dlp error: {0}")] YtDlp(String),
    #[error("ffmpeg error: {0}")] Ffmpeg(String),
    #[error("not found: {0}")] NotFound(String),
    #[error("invalid: {0}")] Invalid(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Format {
    #[serde(rename = "formatId")] format_id: String,
    ext: String,
    resolution: Option<String>,
    #[serde(rename = "formatNote")] format_note: String,
    #[serde(rename = "hasDrm")] has_drm: bool,
    filesize: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Analysis {
    url: String,
    title: String,
    uploader: String,
    duration: f64,
    thumbnail: Option<String>,
    formats: Vec<Format>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Task {
    id: String,
    url: String,
    title: String,
    thumbnail: Option<String>,
    #[serde(rename = "formatId")] format_id: String,
    progress: f64,
    speed: Option<String>,
    eta: Option<String>,
    status: String,
    path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Settings {
    language: String,
    #[serde(rename = "downloadDir")] download_dir: String,
    parallel: u32,
    #[serde(rename = "autoStart")] auto_start: bool,
    #[serde(rename = "clipboardWatch")] clipboard_watch: bool,
}

impl Default for Settings {
    fn default() -> Self {
        let dir = dirs_download();
        Self {
            language: "id".into(),
            download_dir: dir,
            parallel: 2,
            auto_start: false,
            clipboard_watch: true,
        }
    }
}

fn dirs_download() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(|h| format!("{}/Downloads", h))
        .unwrap_or_else(|_| ".".into())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LibItem {
    id: String,
    title: String,
    path: String,
    thumbnail: Option<String>,
    kind: String,
    #[serde(rename = "sizeMb")] size_mb: f64,
    ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DailyStat { date: String, count: i64 }

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Stats { total: i64, #[serde(rename = "sizeMb")] size_mb: f64, week: i64, daily: Vec<DailyStat> }

#[derive(Debug, Clone, Serialize)]
struct LogEntry { ts: String, level: String, message: String }

struct Runtime {
    tasks: Arc<RwLock<HashMap<String, Task>>>,
    cancellations: Arc<Mutex<HashMap<String, CancellationToken>>>,
    library: Arc<RwLock<Vec<LibItem>>>,
    settings: Arc<RwLock<Settings>>,
}

fn emit_log(app: &AppHandle, level: &str, message: &str) {
    let entry = LogEntry {
        ts: Local::now().format("%H:%M:%S").to_string(),
        level: level.into(),
        message: message.into(),
    };
    let _ = app.emit("log", entry);
}

fn sidecar_path(app: &AppHandle, name: &str) -> Result<PathBuf, AppError> {
    let resource_dir = app.path().resource_dir().map_err(|e| AppError::NotFound(e.to_string()))?;
    let candidate = resource_dir.join("binaries").join(name);
    if candidate.exists() { return Ok(candidate); }
    // Fallback untuk dev
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries").join(name);
    if dev.exists() { return Ok(dev); }
    Err(AppError::NotFound(format!("sidecar {} not found", name)))
}

#[tauri::command]
async fn analyze_url(app: AppHandle, url: String) -> Result<Analysis, AppError> {
    let ytdlp = sidecar_path(&app, if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" })?;
    let mut cmd = Command::new(&ytdlp);
    cmd.args(["-J", "--no-warnings", "--no-playlist", "--skip-download", &url]);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    if cfg!(windows) { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }
    let out = cmd.output().await?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).to_string();
        return Err(AppError::YtDlp(err));
    }
    let json: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| AppError::YtDlp(e.to_string()))?;

    let mut formats = Vec::new();
    if let Some(arr) = json.get("formats").and_then(|v| v.as_array()) {
        for f in arr {
            let fid = f.get("format_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if fid.is_empty() { continue; }
            formats.push(Format {
                format_id: fid,
                ext: f.get("ext").and_then(|v| v.as_str()).unwrap_or("mp4").to_string(),
                resolution: f.get("resolution").and_then(|v| v.as_str()).map(|s| s.to_string())
                    .or_else(|| f.get("height").and_then(|v| v.as_i64()).map(|h| format!("{}p", h))),
                format_note: f.get("format_note").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                has_drm: f.get("has_drm").and_then(|v| v.as_bool()).unwrap_or(false),
                filesize: f.get("filesize").and_then(|v| v.as_u64()),
            });
        }
    }

    Ok(Analysis {
        url,
        title: json.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled").into(),
        uploader: json.get("uploader").and_then(|v| v.as_str()).unwrap_or("").into(),
        duration: json.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0),
        thumbnail: json.get("thumbnail").and_then(|v| v.as_str()).map(|s| s.to_string()),
        formats,
    })
}

#[tauri::command]
async fn start_download(
    app: AppHandle,
    rt: State<'_, Runtime>,
    url: String,
    format_id: String,
    title: String,
    thumbnail: String,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();
    let settings = rt.settings.read().await.clone();
    let dir = PathBuf::from(&settings.download_dir);
    tokio::fs::create_dir_all(&dir).await?;

    let task = Task {
        id: id.clone(),
        url: url.clone(),
        title: title.clone(),
        thumbnail: if thumbnail.is_empty() { None } else { Some(thumbnail.clone()) },
        format_id: format_id.clone(),
        progress: 0.0,
        speed: None,
        eta: None,
        status: "queued".into(),
        path: None,
    };
    rt.tasks.write().await.insert(id.clone(), task.clone());
    let _ = app.emit("task-update", &task);

    let cancel = CancellationToken::new();
    rt.cancellations.lock().await.insert(id.clone(), cancel.clone());

    let tasks_arc = rt.tasks.clone();
    let lib_arc = rt.library.clone();
    let app_clone = app.clone();
    let id_clone = id.clone();
    let dir_clone = dir.clone();

    tokio::spawn(async move {
        {
            let mut t = tasks_arc.write().await;
            if let Some(tk) = t.get_mut(&id_clone) {
                tk.status = "running".into();
                let _ = app_clone.emit("task-update", tk.clone());
            }
        }

        let ytdlp = match sidecar_path(&app_clone, if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" }) {
            Ok(p) => p, Err(e) => {
                let mut t = tasks_arc.write().await;
                if let Some(tk) = t.get_mut(&id_clone) { tk.status = "failed".into(); let _ = app_clone.emit("task-update", tk.clone()); }
                emit_log(&app_clone, "error", &format!("yt-dlp path: {}", e));
                return;
            }
        };

        let output_template = dir_clone.join("%(title)s.%(ext)s").to_string_lossy().to_string();

        let mut cmd = Command::new(&ytdlp);
        cmd.args([
            "-f", &format_id,
            "--merge-output-format", "mp4",
            "--no-playlist",
            "--newline",
            "--progress",
            "--continue",
            "--retries", "10",
            "--progress-template",
            "download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s",
            "-o", &output_template,
            &url,
        ]);
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        if cfg!(windows) { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let mut t = tasks_arc.write().await;
                if let Some(tk) = t.get_mut(&id_clone) { tk.status = "failed".into(); let _ = app_clone.emit("task-update", tk.clone()); }
                emit_log(&app_clone, "error", &format!("spawn: {}", e));
                return;
            }
        };

        let stdout = child.stdout.take().unwrap();
        let mut reader = BufReader::new(stdout).lines();
        let mut final_path: Option<String> = None;

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    let _ = child.kill().await;
                    let mut t = tasks_arc.write().await;
                    if let Some(tk) = t.get_mut(&id_clone) { tk.status = "paused".into(); let _ = app_clone.emit("task-update", tk.clone()); }
                    return;
                }
                line = reader.next_line() => {
                    match line {
                        Ok(Some(l)) => {
                            if l.starts_with("download:") {
                                let payload = l.trim_start_matches("download:");
                                let parts: Vec<&str> = payload.split('|').collect();
                                if parts.len() >= 3 {
                                    let pct = parts[0].trim().trim_end_matches('%').parse::<f64>().unwrap_or(0.0);
                                    let mut t = tasks_arc.write().await;
                                    if let Some(tk) = t.get_mut(&id_clone) {
                                        tk.progress = pct;
                                        tk.speed = Some(parts[1].trim().to_string());
                                        tk.eta = Some(parts[2].trim().to_string());
                                        let _ = app_clone.emit("task-update", tk.clone());
                                    }
                                }
                            } else if l.contains("[download] Destination:") {
                                final_path = l.split("Destination:").nth(1).map(|s| s.trim().to_string());
                            } else if l.contains("has already been downloaded") {
                                final_path = l.split_whitespace().next().map(|s| s.to_string());
                            }
                        }
                        _ => break,
                    }
                }
            }
        }

        let _ = child.wait().await;

        let mut t = tasks_arc.write().await;
        if let Some(tk) = t.get_mut(&id_clone) {
            tk.status = "done".into();
            tk.progress = 100.0;
            tk.path = final_path.clone();
            let _ = app_clone.emit("task-update", tk.clone());
        }
        drop(t);

        if let Some(p) = final_path {
            let size = tokio::fs::metadata(&p).await.map(|m| m.len()).unwrap_or(0);
            let kind = if p.ends_with(".mp3") || p.ends_with(".m4a") || p.ends_with(".opus") || p.ends_with(".flac") { "audio" } else { "video" };
            let item = LibItem {
                id: id_clone.clone(),
                title: title.clone(),
                path: p,
                thumbnail: if thumbnail.is_empty() { None } else { Some(thumbnail) },
                kind: kind.into(),
                size_mb: size as f64 / 1_048_576.0,
                ts: Utc::now().timestamp(),
            };
            lib_arc.write().await.push(item);
            emit_log(&app_clone, "info", "download finished");
        }
    });

    Ok(id)
}

#[tauri::command]
async fn pause_task(rt: State<'_, Runtime>, id: String) -> Result<(), AppError> {
    if let Some(c) = rt.cancellations.lock().await.get(&id) { c.cancel(); }
    Ok(())
}

#[tauri::command]
async fn resume_task(app: AppHandle, rt: State<'_, Runtime>, id: String) -> Result<(), AppError> {
    let task = { rt.tasks.read().await.get(&id).cloned() };
    if let Some(t) = task {
        start_download(app, rt, t.url, t.format_id, t.title, t.thumbnail.unwrap_or_default()).await?;
    }
    Ok(())
}

#[tauri::command]
async fn cancel_task(rt: State<'_, Runtime>, id: String) -> Result<(), AppError> {
    if let Some(c) = rt.cancellations.lock().await.get(&id) { c.cancel(); }
    let mut t = rt.tasks.write().await;
    if let Some(tk) = t.get_mut(&id) { tk.status = "failed".into(); }
    Ok(())
}

#[tauri::command]
async fn remove_task(rt: State<'_, Runtime>, id: String) -> Result<(), AppError> {
    rt.tasks.write().await.remove(&id);
    rt.cancellations.lock().await.remove(&id);
    Ok(())
}

#[tauri::command]
async fn list_tasks(rt: State<'_, Runtime>) -> Result<Vec<Task>, AppError> {
    let map = rt.tasks.read().await;
    Ok(map.values().cloned().collect())
}

#[tauri::command]
async fn list_library(rt: State<'_, Runtime>) -> Result<Vec<LibItem>, AppError> {
    Ok(rt.library.read().await.clone())
}

#[tauri::command]
async fn delete_library_item(rt: State<'_, Runtime>, id: String) -> Result<(), AppError> {
    let mut lib = rt.library.write().await;
    if let Some(pos) = lib.iter().position(|i| i.id == id) {
        let path = lib[pos].path.clone();
        let _ = tokio::fs::remove_file(&path).await;
        lib.remove(pos);
    }
    Ok(())
}

#[tauri::command]
async fn open_in_folder(app: AppHandle, path: String) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;
    let p = Path::new(&path);
    let parent = p.parent().map(|x| x.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
    app.opener().open_path(parent.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::NotFound(e.to_string()))?;
    Ok(())
}

#[tauri::command]
async fn run_ffmpeg(
    app: AppHandle,
    tool: String,
    input: String,
    output: String,
    param: String,
) -> Result<(), AppError> {
    let ff = sidecar_path(&app, if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" })?;
    let mut cmd = Command::new(&ff);
    cmd.arg("-y");
    match tool.as_str() {
        "convert" => { cmd.args(["-i", &input, &output]); }
        "extract" => {
            cmd.args(["-i", &input, "-vn"]);
            if output.ends_with(".mp3") { cmd.args(["-codec:a", "libmp3lame", "-b:a", if param.is_empty() { "192k" } else { &param }]); }
            else { cmd.args(["-codec:a", "aac"]); }
            cmd.arg(&output);
        }
        "compress" => { cmd.args(["-i", &input, "-vcodec", "libx264", "-crf", if param.is_empty() { "28" } else { &param }, &output]); }
        "trim" => {
            let (start, dur) = param.split_once('-').unwrap_or(("00:00:00", "00:00:10"));
            cmd.args(["-ss", start, "-t", dur, "-i", &input, "-c", "copy", &output]);
        }
        "merge" => {
            let list = input.replace(';', "\n");
            let tmp = std::env::temp_dir().join("nexa_merge.txt");
            tokio::fs::write(&tmp, list).await?;
            cmd.args(["-f", "concat", "-safe", "0", "-i", tmp.to_string_lossy().as_ref(), "-c", "copy", &output]);
        }
        other => return Err(AppError::Invalid(format!("unknown tool: {}", other))),
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    if cfg!(windows) { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }
    let out = cmd.output().await?;
    if !out.status.success() {
        return Err(AppError::Ffmpeg(String::from_utf8_lossy(&out.stderr).to_string()));
    }
    emit_log(&app, "info", &format!("ffmpeg {} ok", tool));
    Ok(())
}

#[tauri::command]
async fn get_settings(rt: State<'_, Runtime>) -> Result<Settings, AppError> {
    Ok(rt.settings.read().await.clone())
}

#[tauri::command]
async fn save_settings(rt: State<'_, Runtime>, settings: Settings) -> Result<(), AppError> {
    *rt.settings.write().await = settings;
    Ok(())
}

#[tauri::command]
async fn get_stats(rt: State<'_, Runtime>) -> Result<Stats, AppError> {
    let lib = rt.library.read().await;
    let now = Utc::now().timestamp();
    let week_ago = now - 7 * 86400;
    let mut by_day: HashMap<String, i64> = HashMap::new();
    let mut size_mb = 0.0;
    let mut week = 0;
    for item in lib.iter() {
        size_mb += item.size_mb;
        if item.ts >= week_ago { week += 1; }
        let d = chrono::DateTime::<Utc>::from_timestamp(item.ts, 0)
            .map(|dt| dt.format("%m-%d").to_string())
            .unwrap_or_default();
        *by_day.entry(d).or_insert(0) += 1;
    }
    let mut daily: Vec<DailyStat> = by_day.into_iter().map(|(date, count)| DailyStat { date, count }).collect();
    daily.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(Stats { total: lib.len() as i64, size_mb, week, daily })
}

#[tauri::command]
async fn export_backup(app: AppHandle, rt: State<'_, Runtime>) -> Result<(), AppError> {
    let lib = rt.library.read().await.clone();
    let settings = rt.settings.read().await.clone();
    let payload = serde_json::json!({ "library": lib, "settings": settings });
    let json = serde_json::to_string_pretty(&payload).map_err(|e| AppError::Invalid(e.to_string()))?;
    use tauri_plugin_dialog::DialogExt;
    let path = app.dialog().file().add_filter("JSON", &["json"]).blocking_save_file();
    if let Some(p) = path {
        let p = p.into_path().map_err(|e| AppError::Invalid(e.to_string()))?;
        tokio::fs::write(p, json).await?;
        emit_log(&app, "info", "backup exported");
    }
    Ok(())
}

#[tauri::command]
async fn import_backup(app: AppHandle, rt: State<'_, Runtime>) -> Result<(), AppError> {
    use tauri_plugin_dialog::DialogExt;
    let path = app.dialog().file().add_filter("JSON", &["json"]).blocking_pick_file();
    if let Some(p) = path {
        let p = p.into_path().map_err(|e| AppError::Invalid(e.to_string()))?;
        let data = tokio::fs::read_to_string(p).await?;
        let v: serde_json::Value = serde_json::from_str(&data).map_err(|e| AppError::Invalid(e.to_string()))?;
        if let Some(lib) = v.get("library") {
            if let Ok(items) = serde_json::from_value::<Vec<LibItem>>(lib.clone()) {
                *rt.library.write().await = items;
            }
        }
        if let Some(s) = v.get("settings") {
            if let Ok(st) = serde_json::from_value::<Settings>(s.clone()) {
                *rt.settings.write().await = st;
            }
        }
        emit_log(&app, "info", "backup imported");
    }
    Ok(())
}

fn main() {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let runtime = Runtime {
        tasks: Arc::new(RwLock::new(HashMap::new())),
        cancellations: Arc::new(Mutex::new(HashMap::new())),
        library: Arc::new(RwLock::new(Vec::new())),
        settings: Arc::new(RwLock::new(Settings::default())),
    };

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(runtime)
        .invoke_handler(tauri::generate_handler![
            analyze_url,
            start_download,
            pause_task,
            resume_task,
            cancel_task,
            remove_task,
            list_tasks,
            list_library,
            delete_library_item,
            open_in_folder,
            run_ffmpeg,
            get_settings,
            save_settings,
            get_stats,
            export_backup,
            import_backup,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("Fatal: {}", e);
    }
}
