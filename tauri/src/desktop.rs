// Desktop-only settings kept by the shell: close to tray, launch at startup, proxy.
// They live outside the web app because they apply before any webview exists.

use std::path::PathBuf;
use std::sync::{LazyLock, Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_autostart::ManagerExt;

const SETTINGS_FILE: &str = "desktop-settings.json";

// Passed by the autostart entry, so the app starts hidden in the tray like Telegram Desktop
pub const MINIMIZED_ARG: &str = "--minimized";

// Tauri's default `--disable-features` list is kept, GPU raster is forced on, and background
// throttling is off so the MTProto connection and timers stay alive while the window is hidden to tray.
const BASE_BROWSER_ARGS: &str = "--autoplay-policy=no-user-gesture-required \
  --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion \
  --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist \
  --disable-background-timer-throttling --disable-renderer-backgrounding \
  --disable-backgrounding-occluded-windows";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProxyKind {
  Socks5,
  Http,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxySettings {
  pub is_enabled: bool,
  pub kind: ProxyKind,
  pub host: String,
  pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DesktopSettings {
  pub should_close_to_tray: bool,
  pub proxy: Option<ProxySettings>,
}

impl Default for DesktopSettings {
  fn default() -> Self {
    Self {
      should_close_to_tray: true,
      proxy: None,
    }
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSettingsInfo {
  should_close_to_tray: bool,
  should_launch_at_startup: bool,
  proxy: Option<ProxySettings>,
  // The proxy the running WebView2 environment was started with; it changes only after a restart
  active_proxy: Option<String>,
}

static SETTINGS: LazyLock<Mutex<DesktopSettings>> = LazyLock::new(|| Mutex::new(DesktopSettings::default()));

// Every webview shares one WebView2 environment, so all windows must use the same arguments.
// They are fixed at the first window, and proxy changes apply after a restart.
static BROWSER_ARGS: OnceLock<String> = OnceLock::new();
static ACTIVE_PROXY: OnceLock<Option<String>> = OnceLock::new();

pub fn init(app: &tauri::AppHandle) {
  let settings = get_settings_path(app)
    .and_then(|path| std::fs::read(path).ok())
    .and_then(|data| serde_json::from_slice(&data).ok())
    .unwrap_or_default();

  if let Ok(mut current) = SETTINGS.lock() {
    *current = settings;
  }
}

pub fn read() -> DesktopSettings {
  SETTINGS.lock().map(|settings| settings.clone()).unwrap_or_default()
}

pub fn should_start_minimized() -> bool {
  std::env::args().any(|arg| arg == MINIMIZED_ARG)
}

pub fn get_browser_args() -> &'static str {
  BROWSER_ARGS.get_or_init(|| {
    let proxy = get_active_proxy();
    match proxy {
      Some(proxy) => format!("{BASE_BROWSER_ARGS} --proxy-server={proxy}"),
      None => BASE_BROWSER_ARGS.to_string(),
    }
  })
}

fn get_active_proxy() -> Option<String> {
  ACTIVE_PROXY
    .get_or_init(|| read().proxy.filter(|proxy| proxy.is_enabled).and_then(|proxy| build_proxy_url(&proxy)))
    .clone()
}

// Only plain hosts and ports reach the command line, never arbitrary text
fn build_proxy_url(proxy: &ProxySettings) -> Option<String> {
  let host = proxy.host.trim();
  let is_valid_host = !host.is_empty()
    && host.len() <= 253
    && host
      .chars()
      .all(|char| char.is_ascii_alphanumeric() || matches!(char, '.' | '-' | ':' | '[' | ']'));
  if !is_valid_host || proxy.port == 0 {
    return None;
  }

  let scheme = match proxy.kind {
    ProxyKind::Socks5 => "socks5",
    ProxyKind::Http => "http",
  };
  Some(format!("{scheme}://{host}:{}", proxy.port))
}

fn get_settings_path(app: &tauri::AppHandle) -> Option<PathBuf> {
  app.path().app_config_dir().ok().map(|dir| dir.join(SETTINGS_FILE))
}

fn update(app: &tauri::AppHandle, update: impl FnOnce(&mut DesktopSettings)) -> Result<(), String> {
  let settings = {
    let mut settings = SETTINGS.lock().map_err(|err| err.to_string())?;
    update(&mut settings);
    settings.clone()
  };

  let path = get_settings_path(app).ok_or("Config folder is unavailable")?;
  if let Some(dir) = path.parent() {
    std::fs::create_dir_all(dir).map_err(|err| err.to_string())?;
  }
  let data = serde_json::to_vec_pretty(&settings).map_err(|err| err.to_string())?;
  std::fs::write(path, data).map_err(|err| err.to_string())
}

fn get_info(app: &tauri::AppHandle) -> DesktopSettingsInfo {
  let settings = read();

  DesktopSettingsInfo {
    should_close_to_tray: settings.should_close_to_tray,
    should_launch_at_startup: app.autolaunch().is_enabled().unwrap_or(false),
    proxy: settings.proxy,
    active_proxy: get_active_proxy(),
  }
}

#[tauri::command]
pub fn get_desktop_settings(app: tauri::AppHandle) -> DesktopSettingsInfo {
  get_info(&app)
}

#[tauri::command]
pub fn set_close_to_tray(app: tauri::AppHandle, should_close_to_tray: bool) -> Result<DesktopSettingsInfo, String> {
  update(&app, |settings| settings.should_close_to_tray = should_close_to_tray)?;
  Ok(get_info(&app))
}

#[tauri::command]
pub fn set_launch_at_startup(
  app: tauri::AppHandle,
  should_launch_at_startup: bool,
) -> Result<DesktopSettingsInfo, String> {
  let autolaunch = app.autolaunch();
  let result = if should_launch_at_startup {
    autolaunch.enable()
  } else {
    autolaunch.disable()
  };
  result.map_err(|err| err.to_string())?;

  Ok(get_info(&app))
}

#[tauri::command]
pub fn set_proxy(app: tauri::AppHandle, proxy: Option<ProxySettings>) -> Result<DesktopSettingsInfo, String> {
  if let Some(proxy) = proxy.as_ref().filter(|proxy| proxy.is_enabled) {
    build_proxy_url(proxy).ok_or("Invalid proxy address")?;
  }

  update(&app, |settings| settings.proxy = proxy)?;
  Ok(get_info(&app))
}
