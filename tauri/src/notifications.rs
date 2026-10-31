use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewWindow};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeNotification {
  chat_id: String,
  message_id: Option<i64>,
  title: String,
  body: String,
  icon_key: Option<String>,
  is_silent: bool,
  reply_placeholder: Option<String>,
  reply_label: Option<String>,
  read_label: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationAction {
  action: &'static str,
  chat_id: String,
  message_id: Option<i64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  text: Option<String>,
}

fn is_valid_key(key: &str) -> bool {
  !key.is_empty()
    && key.len() <= 96
    && key.chars().all(|char| char.is_ascii_alphanumeric() || matches!(char, '-' | '_' | '.'))
    && !key.starts_with('.')
}

#[cfg(windows)]
mod imp {
  use std::collections::VecDeque;
  use std::path::PathBuf;
  use std::sync::{LazyLock, Mutex};

  use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
  use windows::{
    core::{IInspectable, Interface, HSTRING},
    Data::Xml::Dom::XmlDocument,
    Foundation::{IPropertyValue, TypedEventHandler},
    UI::Notifications::{ToastActivatedEventArgs, ToastNotification, ToastNotificationManager},
  };

  use super::{is_valid_key, NativeNotification, NotificationAction};

  const ICONS_DIRECTORY: &str = "notification-icons";
  const APP_ICON_FILE: &str = "notification-app-icon.png";
  const APP_ICON: &[u8] = include_bytes!("../icons/128x128@2x.png");
  const REPLY_INPUT_ID: &str = "reply";
  const MAX_ALIVE_TOASTS: usize = 64;

  struct AliveToast {
    chat_id: String,
    _toast: ToastNotification,
  }

  unsafe impl Send for AliveToast {}

  static ALIVE_TOASTS: LazyLock<Mutex<VecDeque<AliveToast>>> = LazyLock::new(|| Mutex::new(VecDeque::new()));

  fn get_app_id(app: &AppHandle) -> HSTRING {
    HSTRING::from(app.config().identifier.as_str())
  }

  pub fn init(app: &AppHandle) {
    let identifier = app.config().identifier.clone();
    let display_name = app.package_info().name.clone();

    let icon_path = app.path().app_data_dir().ok().and_then(|dir| {
      std::fs::create_dir_all(&dir).ok()?;
      let path = dir.join(APP_ICON_FILE);
      std::fs::write(&path, APP_ICON).ok()?;
      Some(path)
    });

    let result = windows_registry::CURRENT_USER
      .create(format!(r"Software\Classes\AppUserModelId\{identifier}"))
      .and_then(|key| {
        key.set_string("DisplayName", &display_name)?;
        if let Some(icon_path) = &icon_path {
          key.set_string("IconUri", icon_path.to_string_lossy())?;
        }
        Ok(())
      });

    if let Err(err) = result {
      log::error!("Failed to register the notification app id: {err}");
    }
  }

  fn escape_xml(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());
    for char in text.chars() {
      match char {
        '&' => escaped.push_str("&amp;"),
        '<' => escaped.push_str("&lt;"),
        '>' => escaped.push_str("&gt;"),
        '"' => escaped.push_str("&quot;"),
        '\'' => escaped.push_str("&apos;"),
        '\t' | '\n' | '\r' => escaped.push(char),
        char if char < ' ' => {}
        char => escaped.push(char),
      }
    }
    escaped
  }

  fn get_icon_path(app: &AppHandle, icon_key: Option<&str>, icon: Option<Vec<u8>>) -> Option<PathBuf> {
    let icon_key = icon_key.filter(|key| is_valid_key(key))?;
    let dir = app.path().app_cache_dir().ok()?.join(ICONS_DIRECTORY);
    let path = dir.join(icon_key);

    if let Some(icon) = icon {
      std::fs::create_dir_all(&dir).ok()?;
      std::fs::write(&path, icon).ok()?;
    }

    path.is_file().then_some(path)
  }

  fn build_xml(notification: &NativeNotification, icon_path: Option<&PathBuf>) -> String {
    let image = icon_path
      .and_then(|path| url::Url::from_file_path(path).ok())
      .map(|uri| {
        format!(
          r#"<image placement="appLogoOverride" hint-crop="circle" src="{}"/>"#,
          escape_xml(uri.as_str())
        )
      })
      .unwrap_or_default();

    let mut actions = String::new();
    if notification.message_id.is_some() {
      if let (Some(placeholder), Some(reply_label)) = (&notification.reply_placeholder, &notification.reply_label) {
        actions.push_str(&format!(
          r#"<input id="{REPLY_INPUT_ID}" type="text" placeHolderContent="{}"/><action content="{}" arguments="reply" hint-inputId="{REPLY_INPUT_ID}" activationType="foreground"/>"#,
          escape_xml(placeholder),
          escape_xml(reply_label),
        ));
      }
      if let Some(read_label) = &notification.read_label {
        actions.push_str(&format!(
          r#"<action content="{}" arguments="read" activationType="foreground"/>"#,
          escape_xml(read_label),
        ));
      }
    }
    if !actions.is_empty() {
      actions = format!("<actions>{actions}</actions>");
    }

    let audio = if notification.is_silent {
      r#"<audio silent="true"/>"#
    } else {
      ""
    };

    format!(
      r#"<toast launch="open" activationType="foreground"><visual><binding template="ToastGeneric"><text hint-maxLines="1">{}</text><text>{}</text>{image}</binding></visual>{actions}{audio}</toast>"#,
      escape_xml(&notification.title),
      escape_xml(&notification.body),
    )
  }

  fn get_reply_text(args: &ToastActivatedEventArgs) -> Option<String> {
    let value = args.UserInput().ok()?.Lookup(&HSTRING::from(REPLY_INPUT_ID)).ok()?;
    let text = value.cast::<IPropertyValue>().ok()?.GetString().ok()?.to_string();
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_string())
  }

  fn find_app_window(app: &AppHandle, preferred_label: &str) -> Option<WebviewWindow> {
    app.get_webview_window(preferred_label).or_else(|| {
      app
        .webview_windows()
        .into_iter()
        .find(|(label, _)| !crate::is_auxiliary_label(label))
        .map(|(_, window)| window)
    })
  }

  fn handle_activation(
    app: &AppHandle,
    window_label: &str,
    chat_id: &str,
    message_id: Option<i64>,
    args: Option<&IInspectable>,
  ) {
    let args = args.and_then(|args| args.cast::<ToastActivatedEventArgs>().ok());
    let arguments = args
      .as_ref()
      .and_then(|args| args.Arguments().ok())
      .map(|arguments| arguments.to_string())
      .unwrap_or_default();

    let (action, text) = match arguments.as_str() {
      "reply" => match args.as_ref().and_then(get_reply_text) {
        Some(text) => ("reply", Some(text)),
        None => ("open", None),
      },
      "read" => ("read", None),
      _ => ("open", None),
    };

    let Some(window) = find_app_window(app, window_label) else {
      return;
    };

    if action == "open" {
      window.unminimize().unwrap_or_default();
      window.show().unwrap_or_default();
      window.set_focus().unwrap_or_default();
    }

    window
      .emit_to(
        window.label(),
        "notification-action",
        NotificationAction {
          action,
          chat_id: chat_id.to_string(),
          message_id,
          text,
        },
      )
      .unwrap_or_default();
  }

  pub fn show(
    app: &AppHandle,
    window: &WebviewWindow,
    notification: NativeNotification,
    icon: Option<Vec<u8>>,
  ) -> Result<(), String> {
    let icon_path = get_icon_path(app, notification.icon_key.as_deref(), icon);
    let xml = build_xml(&notification, icon_path.as_ref());

    let document = XmlDocument::new().map_err(|err| err.to_string())?;
    document.LoadXml(&HSTRING::from(xml)).map_err(|err| err.to_string())?;
    let toast = ToastNotification::CreateToastNotification(&document).map_err(|err| err.to_string())?;

    toast.SetGroup(&HSTRING::from(notification.chat_id.as_str())).map_err(|err| err.to_string())?;
    if let Some(message_id) = notification.message_id {
      toast.SetTag(&HSTRING::from(message_id.to_string())).map_err(|err| err.to_string())?;
    }

    let handler_app = app.clone();
    let window_label = window.label().to_string();
    let chat_id = notification.chat_id.clone();
    let message_id = notification.message_id;
    toast
      .Activated(&TypedEventHandler::new(move |_, args: windows::core::Ref<'_, IInspectable>| {
        handle_activation(&handler_app, &window_label, &chat_id, message_id, (*args).as_ref());
        Ok(())
      }))
      .map_err(|err| err.to_string())?;

    ToastNotificationManager::CreateToastNotifierWithId(&get_app_id(app))
      .and_then(|notifier| notifier.Show(&toast))
      .map_err(|err| err.to_string())?;

    if let Ok(mut alive) = ALIVE_TOASTS.lock() {
      alive.push_back(AliveToast {
        chat_id: notification.chat_id,
        _toast: toast,
      });
      while alive.len() > MAX_ALIVE_TOASTS {
        alive.pop_front();
      }
    }

    Ok(())
  }

  pub fn get_setting(app: &AppHandle) -> &'static str {
    use windows::UI::Notifications::NotificationSetting;

    match ToastNotificationManager::CreateToastNotifierWithId(&get_app_id(app)).and_then(|notifier| notifier.Setting()) {
      Ok(NotificationSetting::Enabled) => "enabled",
      Ok(NotificationSetting::DisabledByGroupPolicy) => "disabledByPolicy",
      Ok(_) => "disabled",
      Err(_) => "unknown",
    }
  }

  pub fn clear_all(app: &AppHandle) {
    if let Ok(mut alive) = ALIVE_TOASTS.lock() {
      alive.clear();
    }

    ToastNotificationManager::History()
      .and_then(|history| history.ClearWithId(&get_app_id(app)))
      .unwrap_or_default();
  }

  pub fn close_chat(app: &AppHandle, chat_id: &str) -> Result<(), String> {
    if let Ok(mut alive) = ALIVE_TOASTS.lock() {
      alive.retain(|toast| toast.chat_id != chat_id);
    }

    ToastNotificationManager::History()
      .and_then(|history| history.RemoveGroupWithId(&HSTRING::from(chat_id), &get_app_id(app)))
      .map_err(|err| err.to_string())
  }

  #[cfg(test)]
  mod tests {
    use super::*;

    fn notification(title: &str, body: &str) -> NativeNotification {
      NativeNotification {
        chat_id: "-100123".into(),
        message_id: Some(42),
        title: title.into(),
        body: body.into(),
        icon_key: None,
        is_silent: false,
        reply_placeholder: Some("Напишите ответ…".into()),
        reply_label: Some("Send".into()),
        read_label: Some("Mark as read".into()),
      }
    }

    #[test]
    fn builds_valid_toast_xml_from_any_text() {
      let tricky = "<b>\"Tom & Jerry's\"</b>\u{0}\u{7}\n🙂 ]]> <!-- x -->";
      let xml = build_xml(&notification(tricky, tricky), Some(&PathBuf::from(r"C:\Users\A B\icon.jpg")));

      let document = XmlDocument::new().unwrap();
      document.LoadXml(&HSTRING::from(xml.as_str())).unwrap();
      let texts = document.GetElementsByTagName(&HSTRING::from("text")).unwrap();
      assert_eq!(texts.Length().unwrap(), 2);
      assert_eq!(
        texts.Item(0).unwrap().InnerText().unwrap().to_string(),
        "<b>\"Tom & Jerry's\"</b>\n🙂 ]]> <!-- x -->"
      );
      assert!(xml.contains(r#"hint-inputId="reply""#));
      assert!(xml.contains(r#"arguments="read""#));
      assert!(xml.contains("file:///C:/Users/A%20B/icon.jpg"));
    }

    #[test]
    fn toasts_without_labels_or_message_have_no_actions() {
      let mut call = notification("Incoming call", "Alice");
      call.message_id = None;
      assert!(!build_xml(&call, None).contains("<actions>"));

      let mut reaction = notification("Chat", "Alice reacted");
      reaction.reply_placeholder = None;
      reaction.reply_label = None;
      reaction.read_label = None;
      assert!(!build_xml(&reaction, None).contains("<actions>"));
    }
  }
}

pub fn init(#[allow(unused_variables)] app: &AppHandle) {
  #[cfg(windows)]
  imp::init(app);
}

pub fn clear_all(#[allow(unused_variables)] app: &AppHandle) {
  #[cfg(windows)]
  imp::clear_all(app);
}

#[tauri::command]
pub fn is_native_notifications_supported() -> bool {
  cfg!(windows)
}

#[tauri::command]
#[allow(unused_variables)]
pub fn get_native_notifications_setting(app: AppHandle) -> &'static str {
  #[cfg(windows)]
  return imp::get_setting(&app);

  #[cfg(not(windows))]
  "unknown"
}

#[tauri::command]
#[allow(unused_variables)]
pub fn show_native_notification(
  app: AppHandle,
  window: WebviewWindow,
  notification: NativeNotification,
  icon: Option<Vec<u8>>,
) -> Result<(), String> {
  #[cfg(windows)]
  return imp::show(&app, &window, notification, icon);

  #[cfg(not(windows))]
  Err("Native notifications are not supported".into())
}

#[tauri::command]
#[allow(unused_variables)]
pub fn close_native_notifications(app: AppHandle, chat_id: String) -> Result<(), String> {
  #[cfg(windows)]
  return imp::close_chat(&app, &chat_id);

  #[cfg(not(windows))]
  Ok(())
}
