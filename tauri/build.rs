fn main() {
  tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
    tauri_build::AppManifest::new().commands(&[
      "mark_title_bar_overlay",
      "set_notifications_count",
      "set_window_title",
      "open_new_window_cmd",
      "save_current_url",
      "set_menu_translations",
      "reveal_download",
      "open_downloads_folder",
      "open_mini_app_window",
      "close_mini_app_window",
      "mini_app_send_event",
      "mini_app_post_event",
    ]),
  ))
  .expect("Failed to build Tauri application")
}
