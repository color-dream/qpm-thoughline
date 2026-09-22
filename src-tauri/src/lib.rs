use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

static QUITTING: AtomicBool = AtomicBool::new(false);

const HOTKEY: &str = "Ctrl+Shift+Space";

fn open_capture(app: &AppHandle) {
    eprintln!("[qpm-thoughtline] open_capture via {HOTKEY}");
    if let Some(win) = app.get_webview_window("capture") {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.unminimize();
    }
    // Also notify main window (if visible) so canvas can pulse later
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("qpm-thoughtline://open-capture", ());
    }
}

fn hide_capture(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("capture") {
        let _ = win.hide();
    }
}

#[tauri::command]
fn hide_capture_window(app: AppHandle) {
    hide_capture(&app);
}

#[tauri::command]
fn open_capture_window(app: AppHandle) {
    open_capture(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.unminimize();
                let _ = main.show();
                let _ = main.set_focus();
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:qpm-thoughtline.db",
                    vec![
                        tauri_plugin_sql::Migration {
                            version: 1,
                            description: "init graph tables",
                            sql: "
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'running',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  ref_id TEXT,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL,
  height REAL,
  collapsed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS thoughts (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  content_text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'idea',
  origin TEXT NOT NULL DEFAULT 'hotkey',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'related',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_ref ON nodes(ref_id);
CREATE INDEX IF NOT EXISTS idx_thoughts_task ON thoughts(task_id);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
",
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        // v1 wrote thought rows keyed by task id, so all ideas
                        // under one task collapsed into a single row. Re-key
                        // content rows by node id; keeps the newest row per task
                        // (content was overwritten anyway) as a lossy best-effort.
                        tauri_plugin_sql::Migration {
                            version: 2,
                            description: "re-key thoughts by node id",
                            sql: "
UPDATE thoughts SET id = 'migrated_v1'
WHERE id IN (
  SELECT DISTINCT n.ref_id FROM nodes n
  WHERE n.kind IN ('thought','ai','free') AND n.ref_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM nodes n2 WHERE n2.id = n.ref_id)
);
UPDATE thoughts
  SET id = (
    SELECT n.id FROM nodes n
    WHERE n.kind IN ('thought','ai','free')
      AND (CASE WHEN n.kind = 'free' THEN n.id ELSE n.ref_id END) = thoughts.id
    ORDER BY n.updated_at DESC LIMIT 1
  )
WHERE EXISTS (
  SELECT 1 FROM nodes n
  WHERE n.kind IN ('thought','ai','free')
    AND (CASE WHEN n.kind = 'free' THEN n.id ELSE n.ref_id END) = thoughts.id
    AND thoughts.id != n.id
);
",
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![hide_capture_window, open_capture_window])
        .setup(|app| {
            let handle = app.handle().clone();

            // Tray menu
            let open_mi = MenuItem::with_id(app, "open", "打开主界面", true, None::<&str>)?;
            let capture_mi = MenuItem::with_id(app, "capture", "快速记想法", true, None::<&str>)?;
            let quit_mi = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_mi, &capture_mi, &quit_mi])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().expect("tray icon"))
                .menu(&menu)
                .tooltip("念头")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(main) = app.get_webview_window("main") {
                            let _ = main.show();
                            let _ = main.unminimize();
                            let _ = main.set_focus();
                        }
                    }
                    "capture" => open_capture(app),
                    "quit" => {
                        QUITTING.store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|_tray, _event| {
                    // left click: optional open — skip for M0
                })
                .build(app)?;

            // Global shortcut: Ctrl+Shift+Space
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
            let hs = handle.clone();
            handle
                .global_shortcut()
                .on_shortcut(shortcut, move |_app, _sc, event| {
                    if event.state == ShortcutState::Pressed {
                        open_capture(&hs);
                    }
                })?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "capture" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    // hide instead of destroy so hotkey can reopen
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    // M0: close to tray — hide main, keep app alive
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                if !QUITTING.load(Ordering::SeqCst) {
                    // keep running when windows hide to tray
                    api.prevent_exit();
                }
            }
        });
}
