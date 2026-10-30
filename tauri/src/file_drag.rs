// Dragging media and files out of a chat into Explorer or another app, like in Telegram Desktop.
// The web app hands over the file bytes while the mouse button is still down, the file lands in a
// temp folder, and a native drag starts from there. Drop targets may copy the file after the drop,
// so temp files are only cleaned up on the next launch.

use std::io::Cursor;
use std::path::{Path, PathBuf};

use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, WebviewWindow};
use uuid::Uuid;

const TEMP_DIRECTORY: &str = "Noirgram Drag";
const FILENAME_HEADER: &str = "x-noirgram-filename";
const MAX_FILENAME_LENGTH: usize = 180;
const PREVIEW_SIZE: u32 = 96;
const FALLBACK_PREVIEW: &[u8] = include_bytes!("../icons/64x64.png");

fn get_temp_root() -> PathBuf {
  std::env::temp_dir().join(TEMP_DIRECTORY)
}

pub fn init() {
  std::fs::remove_dir_all(get_temp_root()).unwrap_or_default();
}

// Percent-decoded (headers are ASCII), reduced to a plain file name that Windows accepts
fn sanitize_filename(raw: &str) -> String {
  let decoded = percent_decode(raw);
  let name = Path::new(&decoded)
    .file_name()
    .map(|name| name.to_string_lossy().into_owned())
    .unwrap_or_default();

  let mut sanitized: String = name
    .chars()
    .map(|char| match char {
      '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
      char if char.is_control() => '_',
      char => char,
    })
    .collect();

  sanitized = sanitized.trim_end_matches(['.', ' ']).trim_start().to_string();
  if sanitized.chars().count() > MAX_FILENAME_LENGTH {
    let extension = Path::new(&sanitized)
      .extension()
      .map(|extension| format!(".{}", extension.to_string_lossy()))
      .filter(|extension| extension.chars().count() < 16)
      .unwrap_or_default();
    let stem: String = sanitized.chars().take(MAX_FILENAME_LENGTH - extension.chars().count()).collect();
    sanitized = format!("{stem}{extension}");
  }

  if sanitized.is_empty() {
    "file".into()
  } else {
    sanitized
  }
}

fn percent_decode(raw: &str) -> String {
  let bytes = raw.as_bytes();
  let mut decoded = Vec::with_capacity(bytes.len());
  let mut index = 0;
  while index < bytes.len() {
    if bytes[index] == b'%' && index + 2 < bytes.len() {
      let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or_default();
      if let Ok(byte) = u8::from_str_radix(hex, 16) {
        decoded.push(byte);
        index += 3;
        continue;
      }
    }
    decoded.push(bytes[index]);
    index += 1;
  }
  String::from_utf8_lossy(&decoded).into_owned()
}

// A small preview under the cursor: the picture itself for images, the app icon for anything else
fn get_preview(bytes: &[u8]) -> Vec<u8> {
  image::load_from_memory(bytes)
    .ok()
    .and_then(|picture| {
      let mut preview = Vec::new();
      picture
        .thumbnail(PREVIEW_SIZE, PREVIEW_SIZE)
        .write_to(&mut Cursor::new(&mut preview), image::ImageFormat::Png)
        .ok()?;
      Some(preview)
    })
    .unwrap_or_else(|| FALLBACK_PREVIEW.to_vec())
}

#[cfg(windows)]
fn is_primary_button_pressed() -> bool {
  use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
  use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_SWAPBUTTON};

  // SAFETY: plain state queries without pointers
  unsafe {
    let button = if GetSystemMetrics(SM_SWAPBUTTON) != 0 { VK_RBUTTON } else { VK_LBUTTON };
    (GetAsyncKeyState(i32::from(button.0)) as u16 & 0x8000) != 0
  }
}

#[cfg(not(windows))]
fn is_primary_button_pressed() -> bool {
  true
}

#[tauri::command]
pub async fn start_file_drag(app: AppHandle, window: WebviewWindow, request: Request<'_>) -> Result<(), String> {
  let InvokeBody::Raw(bytes) = request.body() else {
    return Err("Expected file bytes".into());
  };
  let filename = request
    .headers()
    .get(FILENAME_HEADER)
    .and_then(|value| value.to_str().ok())
    .map(sanitize_filename)
    .unwrap_or_else(|| "file".into());

  let dir = get_temp_root().join(Uuid::new_v4().to_string());
  std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
  let path = dir.join(filename);
  std::fs::write(&path, bytes).map_err(|err| err.to_string())?;

  let preview = get_preview(bytes);

  #[cfg(target_os = "linux")]
  {
    let _ = (app, window, preview);
    return Err("File drag is not supported".into());
  }

  // The OLE drag loop belongs to the window's thread
  #[cfg(not(target_os = "linux"))]
  app
    .run_on_main_thread(move || {
      // Released while the file was being prepared: a drag now would drop it right under the cursor
      if !is_primary_button_pressed() {
        return;
      }

      let result = drag::start_drag(
        &window,
        drag::DragItem::Files(vec![path]),
        drag::Image::Raw(preview),
        |_, _| {},
        drag::Options {
          skip_animatation_on_cancel_or_failure: true,
          ..Default::default()
        },
      );

      if let Err(err) = result {
        log::error!("Failed to start file drag: {err}");
      }
    })
    .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
  use super::sanitize_filename;

  #[test]
  fn sanitizes_filenames() {
    assert_eq!(sanitize_filename("photo.jpg"), "photo.jpg");
    assert_eq!(sanitize_filename("%D1%84%D0%BE%D1%82%D0%BE.jpg"), "фото.jpg");
    assert_eq!(sanitize_filename("..%2F..%2Fevil.exe"), "evil.exe");
    assert_eq!(sanitize_filename("a|b?.txt"), "a_b_.txt");
    assert_eq!(sanitize_filename("name. . "), "name");
    assert_eq!(sanitize_filename(""), "file");
    assert_eq!(sanitize_filename("%"), "%");
  }
}
