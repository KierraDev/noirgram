use std::collections::HashMap;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use serde_json::json;
use tauri::{Emitter, LogicalPosition, Manager, webview::DownloadEvent};
use url::Url;
use uuid::Uuid;

mod deeplink;
use deeplink::Deeplink;

mod tray;
mod window;
use crate::window::{WINDOW_STATES, WindowState};

#[cfg(target_os = "macos")]
mod mac;

#[derive(Debug)]
pub struct AppStateStruct {
  pub notification_count: i32,
  pub is_muted: bool,
}

impl Default for AppStateStruct {
  fn default() -> Self {
    Self {
      notification_count: 0,
      is_muted: false,
    }
  }
}

pub type AppState = Mutex<AppStateStruct>;

pub const TRAFFIC_LIGHT_POSITION_OVERLAY_LEGACY: LogicalPosition<f64> = LogicalPosition::new(26.0, 46.0);
pub const TRAFFIC_LIGHT_POSITION_OVERLAY_26: LogicalPosition<f64> = LogicalPosition::new(26.0, 50.0);
pub const TRAFFIC_LIGHT_POSITION_OVERLAY_MOBILE_LEGACY: LogicalPosition<f64> = LogicalPosition::new(16.0, 30.0);
pub const TRAFFIC_LIGHT_POSITION_OVERLAY_MOBILE_26: LogicalPosition<f64> = LogicalPosition::new(16.0, 34.0);
pub const TRAFFIC_LIGHT_POSITION_DEFAULT: LogicalPosition<f64> = LogicalPosition::new(14.0, 19.0);

pub static TRAFFIC_LIGHT_POSITION_OVERLAY: LazyLock<LogicalPosition<f64>> = LazyLock::new(|| {
  if let tauri_plugin_os::Version::Semantic(major, _, _) = tauri_plugin_os::version() {
      if major >= 26 {
          return TRAFFIC_LIGHT_POSITION_OVERLAY_26;
      }
  }
  TRAFFIC_LIGHT_POSITION_OVERLAY_LEGACY
});

pub static TRAFFIC_LIGHT_POSITION_OVERLAY_MOBILE: LazyLock<LogicalPosition<f64>> = LazyLock::new(|| {
  if let tauri_plugin_os::Version::Semantic(major, _, _) = tauri_plugin_os::version() {
      if major >= 26 {
          return TRAFFIC_LIGHT_POSITION_OVERLAY_MOBILE_26;
      }
  }
  TRAFFIC_LIGHT_POSITION_OVERLAY_MOBILE_LEGACY
});

// Every webview shares one WebView2 environment, so all windows must use the same arguments.
// Tauri's default `--disable-features` list is kept, GPU raster is forced on, and background
// throttling is off so the MTProto connection and timers stay alive while the window is hidden to tray.
const BROWSER_ARGS: &str = "--autoplay-policy=no-user-gesture-required \
  --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion \
  --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist \
  --disable-background-timer-throttling --disable-renderer-backgrounding \
  --disable-backgrounding-occluded-windows";

const MINI_APP_LABEL_PREFIX: &str = "miniapp-";
const MINI_APP_BRIDGE_SCRIPT: &str = include_str!("mini_app_bridge.js");
const DOWNLOADS_SUBDIRECTORY: &str = "Noirgram";

// Mini app window label -> label of the app window that opened it
static MINI_APP_OWNERS: LazyLock<Mutex<HashMap<String, String>>> =
  LazyLock::new(|| Mutex::new(HashMap::new()));

pub const WINDOW_WIDTH: f64 = 1088.0;
pub const WINDOW_HEIGHT: f64 = 700.0;
pub const WINDOW_MIN_WIDTH: f64 = 360.0;
pub const WINDOW_MIN_HEIGHT: f64 = 200.0;

const MINI_APP_WIDTH: f64 = 420.0;
const MINI_APP_HEIGHT: f64 = 720.0;
const MINI_APP_MIN_WIDTH: f64 = 320.0;
const MINI_APP_MIN_HEIGHT: f64 = 400.0;

pub static LAST_URL: LazyLock<std::sync::Mutex<String>> =
  LazyLock::new(|| std::sync::Mutex::new(BASE_URL.to_string()));

pub const DEFAULT_WINDOW_TITLE: &str = match std::option_env!("APP_TITLE") {
  Some(title) => title,
  None => "Noirgram",
};

pub const BASE_URL: &str = match std::option_env!("BASE_URL") {
  Some(url) => url,
  None => "http://localhost:1234",
};

pub const WITH_UPDATER: &str = match std::option_env!("WITH_UPDATER") {
  Some(str) => str,
  None => "false",
};

pub(crate) fn strip_hash_from_url(url: &str) -> String {
  if let Ok(mut parsed_url) = Url::parse(url) {
    parsed_url.set_fragment(None);
    parsed_url.to_string()
  } else {
    url.to_string()
  }
}

pub(crate) fn save_window_url(app: &tauri::AppHandle, window_label: &str) {
  if let Some(webview_window) = app.get_webview_window(window_label) {
    if let Ok(current_url) = webview_window.url() {
      let url_without_hash = strip_hash_from_url(current_url.as_str());
      if let Ok(mut last_url) = LAST_URL.lock() {
        *last_url = url_without_hash;
      }
    }
  }
}

pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      let active_windows = app.windows();
      if active_windows.len() >= 1 {
        let window = active_windows.values().next().unwrap();
        window.set_focus().unwrap_or_default();
      } else {
        open_new_window(app.clone(), BASE_URL.to_string()).unwrap();
      }
    }))
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_process::init());

  let app = app.on_window_event(|window, event| match event {
    tauri::WindowEvent::CloseRequested { api, .. } => {
      if is_mini_app_label(window.label()) {
        return;
      }

      let app_windows_count = window
        .app_handle()
        .windows()
        .keys()
        .filter(|label| !is_mini_app_label(label))
        .count();

      if app_windows_count == 1 {
        // Save current URL before hiding the last window
        save_window_url(&window.app_handle(), window.label());

        #[cfg(target_os = "macos")]
        window.app_handle().hide().unwrap_or_default();
        #[cfg(not(target_os = "macos"))]
        window.hide().unwrap_or_default();
        api.prevent_close();
      }
    }
    tauri::WindowEvent::ThemeChanged(_) => {
      #[cfg(target_os = "macos")]
      if let Some(base_window) = window.app_handle().get_window(window.label()) {
        if let Ok(mut states) = WINDOW_STATES.lock() {
          if let Some(state) = states.get_mut(window.label()) {
            let title = if state.is_overlay {
              "".to_string()
            } else {
              state.title.clone()
            };
            let traffic_position = if state.is_overlay {
              if state.is_mobile {
                *TRAFFIC_LIGHT_POSITION_OVERLAY_MOBILE
              } else {
                *TRAFFIC_LIGHT_POSITION_OVERLAY
              }
            } else {
              TRAFFIC_LIGHT_POSITION_DEFAULT
            };
            mac::update_window_title(base_window.clone(), title, traffic_position);
          }
        }
      }
    }
    tauri::WindowEvent::Destroyed => {
      if let Ok(mut states) = WINDOW_STATES.lock() {
        states.remove(window.label());
      }

      if is_mini_app_label(window.label()) {
        let owner = MINI_APP_OWNERS
          .lock()
          .ok()
          .and_then(|mut owners| owners.remove(window.label()));
        if let Some(owner) = owner {
          window
            .emit_to(owner.as_str(), "mini-app-closed", json!({ "label": window.label() }))
            .unwrap_or_default();
        }
      }
    }
    _ => {}
  });

  let app = app.setup(|app| {
    // Manage app state
    app.manage(AppState::new(AppStateStruct::default()));

    let _main_window = open_new_window(app.handle().clone(), BASE_URL.to_string())
      .expect("Failed to open main window");

    let deeplink = Deeplink::init();
    if let Err(err) = deeplink.setup(app.handle()) {
      log::error!("Failed to setup deeplink: {:?}", err);
    }

    if WITH_UPDATER == "true" {
      app
        .handle()
        .plugin(tauri_plugin_updater::Builder::new().build())?;
    }

    crate::tray::TrayManager::init(app.handle().clone())?;

    Ok(())
  });

  let app = app.invoke_handler(tauri::generate_handler![
    mark_title_bar_overlay,
    set_notifications_count,
    set_window_title,
    open_new_window_cmd,
    save_current_url,
    set_menu_translations,
    reveal_download,
    open_downloads_folder,
    open_mini_app_window,
    close_mini_app_window,
    mini_app_send_event,
    mini_app_post_event
  ]);

  app
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
#[cfg(target_os = "macos")]
fn mark_title_bar_overlay(window: tauri::WebviewWindow, is_overlay: bool, is_mobile: Option<bool>) {
  use crate::mac;

  let mut is_mobile_val = false;

  if let Ok(mut states) = WINDOW_STATES.lock() {
    if let Some(state) = states.get_mut(window.label()) {
      state.is_overlay = is_overlay;
      // Only `Some` updates the stored flag; `None` keeps the previous value
      if let Some(mobile) = is_mobile {
        state.is_mobile = mobile;
      }
      is_mobile_val = state.is_mobile;
    }
  }

  if is_overlay {
    let position = if is_mobile_val {
      *TRAFFIC_LIGHT_POSITION_OVERLAY_MOBILE
    } else {
      *TRAFFIC_LIGHT_POSITION_OVERLAY
    };

    window
      .set_title_bar_style(tauri::utils::TitleBarStyle::Overlay)
      .unwrap_or_default();

    if let Some(base_window) = window.app_handle().get_window(window.label()) {
      mac::update_window_title(
        base_window.clone(),
        "".to_string(),
        position,
      );
    }
  } else {
    window
      .set_title_bar_style(tauri::utils::TitleBarStyle::Visible)
      .unwrap_or_default();

    // Determine the title we should restore.
    let mut title_to_set = DEFAULT_WINDOW_TITLE.to_string();
    if let Ok(states) = WINDOW_STATES.lock() {
      if let Some(state) = states.get(window.label()) {
        title_to_set = state.title.clone();
      }
    }

    if let Some(base_window) = window.app_handle().get_window(window.label()) {
      mac::update_window_title(
        base_window.clone(),
        title_to_set,
        TRAFFIC_LIGHT_POSITION_DEFAULT,
      );
    }
  }
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
#[allow(unused_variables)]
fn mark_title_bar_overlay(window: tauri::WebviewWindow, is_overlay: bool, is_mobile: Option<bool>) {
  // noop
}

#[tauri::command]
fn set_notifications_count(
  window: tauri::WebviewWindow,
  amount: i32,
  is_muted: bool,
  state: tauri::State<'_, AppState>,
) {
  // Update app state
  if let Ok(mut app_state) = state.lock() {
    app_state.notification_count = amount;
    app_state.is_muted = is_muted;
  }

  crate::tray::set_notifications_count(&window, amount, is_muted);
}

#[tauri::command]
fn set_menu_translations(translations: HashMap<String, String>) {
  crate::tray::set_menu_translations(translations);
}

#[tauri::command]
fn set_window_title(window: tauri::WebviewWindow, title: String) {
  if let Ok(mut states) = WINDOW_STATES.lock() {
    if let Some(state) = states.get_mut(window.label()) {
      state.title = title.clone();
      if !state.is_overlay {
        window.set_title(&title).unwrap_or_default();
      }
    }
  }
}

#[tauri::command]
async fn open_new_window_cmd(app: tauri::AppHandle, url: String) -> bool {
  open_new_window(app, url).is_ok()
}

#[tauri::command]
fn save_current_url(window: tauri::WebviewWindow) {
  if let Ok(current_url) = window.url() {
    let url_without_hash = strip_hash_from_url(current_url.as_str());
    if let Ok(mut last_url) = LAST_URL.lock() {
      *last_url = url_without_hash;
    }
  }
}

pub(crate) fn open_new_window(
  app: tauri::AppHandle,
  url: String,
) -> Result<tauri::WebviewWindow, String> {
  let base_url = Url::parse(BASE_URL).map_err(|err| format!("Invalid base URL: {err}"))?;
  let url = resolve_app_url(&url, &base_url).ok_or_else(|| format!("Disallowed app URL: {url}"))?;
  let window_label = Uuid::new_v4().to_string();
  let new_window_builder = tauri::WebviewWindowBuilder::new(
    &app,
    window_label.clone(),
    tauri::WebviewUrl::App(url.to_string().into()),
  )
  .additional_browser_args(BROWSER_ARGS)
  .fullscreen(false)
  .resizable(true)
  .title(DEFAULT_WINDOW_TITLE)
  .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
  .min_inner_size(WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT)
  .disable_drag_drop_handler() // Required for Drag & Drop on Windows
  .initialization_script(&format!(
    "window.tauri = {{ version: '{}' }};",
    env!("CARGO_PKG_VERSION")
  ))
  .on_navigation(move |url| is_allowed_app_url(url, &base_url))
  .on_download(|window, event| {
    match event {
      // Saved silently into `Downloads/Noirgram`; the web app shows where the file went
      DownloadEvent::Requested { destination, .. } => {
        if let (Some(filename), Some(downloads_dir)) = (
          destination.file_name().map(|name| name.to_os_string()),
          get_downloads_dir(window.app_handle()),
        ) {
          if std::fs::create_dir_all(&downloads_dir).is_ok() {
            *destination = get_unique_path(&downloads_dir, &filename);
          }
        }
      }
      DownloadEvent::Finished { url, path, success } => {
        window
          .emit_to(
            window.label(),
            "download-finished",
            json!({
              "url": url.to_string(),
              "success": success,
              "path": path.map(|path| path.to_string_lossy().into_owned()),
            }),
          )
          .unwrap_or_default();
      }
      _ => {}
    };
    true
  });

  if let Ok(mut states) = WINDOW_STATES.lock() {
    let new_state = WindowState {
      title: DEFAULT_WINDOW_TITLE.to_string(),
      is_overlay: cfg!(target_os = "macos"),
      is_mobile: false,
    };
    states.insert(window_label.to_string(), new_state);
  }

  // The web app draws its own title bar with window controls on Windows and Linux
  #[cfg(not(target_os = "macos"))]
  let new_window_builder = new_window_builder.decorations(false).shadow(true);

  #[cfg(target_os = "macos")]
  let new_window_builder = new_window_builder.title_bar_style(tauri::TitleBarStyle::Overlay);
  #[cfg(target_os = "macos")]
  let new_window_builder = new_window_builder.title("");

  let window = new_window_builder.build().map_err(|err| err.to_string())?;

  #[cfg(target_os = "macos")]
  if let Some(base_window) = app.get_window(&window_label) {
    mac::setup_traffic_light_positioner(&base_window, *TRAFFIC_LIGHT_POSITION_OVERLAY);
  }

  // Apply stored notification count to the new window
  if let Some(state) = app.try_state::<AppState>() {
    if let Ok(app_state) = state.lock() {
      crate::tray::set_notifications_count(
        &window,
        app_state.notification_count,
        app_state.is_muted,
      );
    }
  }

  Ok(window)
}

fn get_downloads_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
  app
    .path()
    .download_dir()
    .ok()
    .map(|dir| dir.join(DOWNLOADS_SUBDIRECTORY))
}

// `photo.jpg` -> `photo (1).jpg` when the name is taken, like browsers do
fn get_unique_path(dir: &Path, filename: &OsStr) -> PathBuf {
  let candidate = dir.join(filename);
  if !candidate.exists() {
    return candidate;
  }

  let filename = Path::new(filename);
  let stem = filename
    .file_stem()
    .map(|stem| stem.to_string_lossy().into_owned())
    .unwrap_or_default();
  let extension = filename
    .extension()
    .map(|extension| extension.to_string_lossy().into_owned());

  for index in 1..10_000 {
    let name = match &extension {
      Some(extension) => format!("{stem} ({index}).{extension}"),
      None => format!("{stem} ({index})"),
    };
    let candidate = dir.join(name);
    if !candidate.exists() {
      return candidate;
    }
  }

  candidate
}

fn open_in_file_manager(path: &Path, should_select: bool) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  let result = {
    use std::os::windows::process::CommandExt;

    let mut command = std::process::Command::new("explorer.exe");
    if should_select {
      command.raw_arg(format!("/select,\"{}\"", path.display()));
    } else {
      command.arg(path);
    }
    command.spawn()
  };

  #[cfg(target_os = "macos")]
  let result = {
    let mut command = std::process::Command::new("open");
    if should_select {
      command.arg("-R");
    }
    command.arg(path).spawn()
  };

  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  let result = {
    let target = if should_select {
      path.parent().unwrap_or(path)
    } else {
      path
    };
    std::process::Command::new("xdg-open").arg(target).spawn()
  };

  result.map(|_| ()).map_err(|err| err.to_string())
}

// Only files that we saved ourselves can be revealed, never arbitrary paths from the web app
#[tauri::command]
fn reveal_download(app: tauri::AppHandle, path: String) -> Result<(), String> {
  let downloads_dir = get_downloads_dir(&app)
    .and_then(|dir| dir.canonicalize().ok())
    .ok_or("Downloads folder is unavailable")?;
  let path = Path::new(&path).canonicalize().map_err(|err| err.to_string())?;

  if !path.starts_with(&downloads_dir) {
    return Err("Path is outside of the downloads folder".into());
  }

  open_in_file_manager(&dunce_path(&path), true)
}

#[tauri::command]
fn open_downloads_folder(app: tauri::AppHandle) -> Result<(), String> {
  let downloads_dir = get_downloads_dir(&app).ok_or("Downloads folder is unavailable")?;
  std::fs::create_dir_all(&downloads_dir).map_err(|err| err.to_string())?;

  open_in_file_manager(&downloads_dir, false)
}

// `canonicalize` returns `\\?\C:\...` on Windows, which Explorer does not understand
fn dunce_path(path: &Path) -> PathBuf {
  let raw = path.to_string_lossy();
  match raw.strip_prefix(r"\\?\") {
    Some(stripped) if !stripped.starts_with("UNC\\") => PathBuf::from(stripped),
    _ => path.to_path_buf(),
  }
}

fn is_mini_app_label(label: &str) -> bool {
  label.strip_prefix(MINI_APP_LABEL_PREFIX).is_some_and(|id| {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|char| char.is_ascii_alphanumeric() || char == '-')
  })
}

fn get_mini_app_owner(label: &str) -> Option<String> {
  MINI_APP_OWNERS
    .lock()
    .ok()
    .and_then(|owners| owners.get(label).cloned())
}

// Mini apps run in their own native window like in Telegram Desktop. Their remote pages are
// not embeddable into the app origin, and a window gives them real size and focus.
#[tauri::command]
async fn open_mini_app_window(
  app: tauri::AppHandle,
  window: tauri::WebviewWindow,
  label: String,
  url: String,
  title: String,
) -> Result<(), String> {
  if !is_mini_app_label(&label) {
    return Err("Invalid mini app label".into());
  }

  if let Some(existing) = app.get_webview_window(&label) {
    existing.unminimize().unwrap_or_default();
    existing.show().unwrap_or_default();
    existing.set_focus().unwrap_or_default();
    return Ok(());
  }

  let url = Url::parse(&url).map_err(|err| err.to_string())?;
  if !matches!(url.scheme(), "http" | "https") {
    return Err("Unsupported mini app URL".into());
  }

  if let Ok(mut owners) = MINI_APP_OWNERS.lock() {
    owners.insert(label.clone(), window.label().to_string());
  }

  let result = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(url))
    .title(title)
    .inner_size(MINI_APP_WIDTH, MINI_APP_HEIGHT)
    .min_inner_size(MINI_APP_MIN_WIDTH, MINI_APP_MIN_HEIGHT)
    .resizable(true)
    .center()
    .theme(Some(tauri::Theme::Dark))
    .additional_browser_args(BROWSER_ARGS)
    .initialization_script(MINI_APP_BRIDGE_SCRIPT)
    .on_navigation(|url| matches!(url.scheme(), "http" | "https"))
    .build();

  if let Err(err) = result {
    if let Ok(mut owners) = MINI_APP_OWNERS.lock() {
      owners.remove(&label);
    }
    return Err(err.to_string());
  }

  Ok(())
}

#[tauri::command]
fn close_mini_app_window(app: tauri::AppHandle, window: tauri::WebviewWindow, label: String) {
  if get_mini_app_owner(&label).as_deref() != Some(window.label()) {
    return;
  }

  if let Some(mini_app_window) = app.get_webview_window(&label) {
    mini_app_window.close().unwrap_or_default();
  }
}

// App window -> mini app: delivered through `Telegram.WebView.receiveEvent`
#[tauri::command]
fn mini_app_send_event(
  app: tauri::AppHandle,
  window: tauri::WebviewWindow,
  label: String,
  event_type: String,
  event_data: Option<serde_json::Value>,
) -> Result<(), String> {
  if get_mini_app_owner(&label).as_deref() != Some(window.label()) {
    return Err("Unknown mini app".into());
  }

  let mini_app_window = app.get_webview_window(&label).ok_or("Mini app window is closed")?;
  let event_type = serde_json::to_string(&event_type).map_err(|err| err.to_string())?;
  let event_data = serde_json::to_string(&event_data.unwrap_or(serde_json::Value::Null))
    .map_err(|err| err.to_string())?;

  mini_app_window
    .eval(format!(
      "window.__noirgramReceiveEvent && window.__noirgramReceiveEvent({event_type}, {event_data});"
    ))
    .map_err(|err| err.to_string())
}

// Mini app -> app window that owns it. The only command exposed to remote mini app pages.
#[tauri::command]
fn mini_app_post_event(window: tauri::WebviewWindow, event_type: String, event_data: Option<String>) {
  if !is_mini_app_label(window.label()) {
    return;
  }

  let Some(owner) = get_mini_app_owner(window.label()) else {
    return;
  };

  window
    .emit_to(
      owner.as_str(),
      "mini-app-event",
      json!({
        "label": window.label(),
        "eventType": event_type,
        "eventData": event_data.unwrap_or_default(),
      }),
    )
    .unwrap_or_default();
}

fn resolve_app_url(url: &str, base_url: &Url) -> Option<Url> {
  let url = base_url.join(url).ok()?;

  is_allowed_app_url(&url, base_url).then_some(url)
}

fn is_allowed_app_url(url: &Url, base_url: &Url) -> bool {
  matches!(url.scheme(), "http" | "https") && url.origin() == base_url.origin()
}
