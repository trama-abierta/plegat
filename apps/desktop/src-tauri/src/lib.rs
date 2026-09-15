use std::sync::Mutex;
use std::fs::OpenOptions;
use std::io::Write;
use tauri::{menu::{Menu, MenuItem, PredefinedMenuItem}, tray::{TrayIcon, TrayIconBuilder}, Emitter, Manager, State, WindowEvent, Wry};
use tauri_plugin_deep_link::DeepLinkExt;

const KEYRING_SERVICE: &str = "plegat-desktop";
const KEYRING_ACCOUNT: &str = "refresh-token";

#[derive(Default)]
struct OAuthState(Mutex<Option<(String, String)>>);

#[derive(Default)]
struct PendingDeepLinks(Mutex<Vec<String>>);

#[derive(Default)]
struct TrayState(Mutex<TrayData>);

#[derive(Default)]
struct TrayData {
    title: Option<MenuItem<Wry>>,
    tray: Option<TrayIcon<Wry>>,
}

fn tray_icon_for_status(status: &str) -> tauri::image::Image<'static> {
    let (bytes, width, height) = if status.contains("pausa") {
        (include_bytes!("../icons/tray-break.rgba").as_slice(), 64, 46)
    } else if status.contains("Trabajando") {
        (include_bytes!("../icons/tray-working.rgba").as_slice(), 64, 46)
    } else {
        (include_bytes!("../icons/tray-idle.rgba").as_slice(), 64, 46)
    };
    tauri::image::Image::new_owned(bytes.to_vec(), width, height)
}

#[tauri::command]
fn update_tray_status(state: State<'_, TrayState>, status: String) -> Result<(), String> {
    let data = state.0.lock().map_err(|_| "No se pudo actualizar el tray".to_string())?;
    if let Some(item) = data.title.as_ref() { item.set_text(format!("Plegat · {status}")).map_err(|e| e.to_string())?; }
    if let Some(tray) = data.tray.as_ref() { tray.set_icon(Some(tray_icon_for_status(&status))).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
fn save_oauth_state(state: State<'_, OAuthState>, state_value: String, verifier: String) -> Result<(), String> {
    *state.0.lock().map_err(|_| "No se pudo guardar el estado OAuth".to_string())? = Some((state_value, verifier));
    Ok(())
}

#[tauri::command]
fn take_oauth_state(state: State<'_, OAuthState>) -> Result<Option<serde_json::Value>, String> {
    let value = state.0.lock().map_err(|_| "No se pudo leer el estado OAuth".to_string())?.take();
    Ok(value.map(|(state, verifier)| serde_json::json!({ "state": state, "verifier": verifier })))
}

#[tauri::command]
fn take_pending_deep_links(state: State<'_, PendingDeepLinks>) -> Result<Vec<String>, String> {
    Ok(state.0.lock().map_err(|_| "No se pudieron leer los enlaces pendientes".to_string())?.drain(..).collect())
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_refresh_token(token: String) -> Result<(), String> { keyring_entry()?.set_password(&token).map_err(|error| error.to_string()) }

#[tauri::command]
fn load_refresh_token() -> Result<Option<String>, String> {
    match keyring_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn delete_refresh_token() -> Result<(), String> {
    match keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OAuthState::default())
        .manage(PendingDeepLinks::default())
        .manage(TrayState::default())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Closing the window keeps the tray client alive. The tray's
                // "Salir" action remains the explicit way to terminate it.
                api.prevent_close();
                let _ = window.hide();
            }
        })
        // Must be registered first: secondary launches (including deep-link
        // callbacks) are forwarded to the already running process.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            #[cfg(debug_assertions)]
            eprintln!("single-instance argv: {:?}", argv);
            #[cfg(target_os = "linux")]
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open("/tmp/plegat-deeplink.log") {
                let _ = writeln!(file, "argv={:?}", argv);
            }
            let urls: Vec<String> = argv.into_iter().filter(|value| value.starts_with("plegat://")).collect();
            if !urls.is_empty() {
                if let Some(pending) = app.try_state::<PendingDeepLinks>() {
                    if let Ok(mut queue) = pending.0.lock() { queue.extend(urls.iter().cloned()); }
                }
                let _ = app.emit("deep-link://new-url", urls);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.unmaximize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // Register the protocol in the per-user desktop entry. This makes
            // the browser callback work for both the .deb and AppImage builds.
            #[cfg(target_os = "linux")]
            app.deep_link().register("plegat")?;
            let show = MenuItem::with_id(app, "show", "Abrir Plegat", true, None::<&str>)?;
            let logout = MenuItem::with_id(app, "logout", "Cerrar sesión", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let title = MenuItem::with_id(app, "title", "Plegat", false, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&title, &separator, &show, &logout, &quit])?;
            if let Ok(mut tray_status) = app.state::<TrayState>().0.lock() { tray_status.title = Some(title.clone()); }
            // Tauri expects raw RGBA pixels for tray icons. The file is generated
            // from the canonical PNG icon during development/build preparation.
            let tray_icon = tauri::image::Image::new_owned(
                include_bytes!("../icons/tray-idle.rgba").to_vec(),
                64,
                46,
            );
            let tray = TrayIconBuilder::new().icon(tray_icon).menu(&menu).on_menu_event(|app, event| match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.unmaximize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "logout" => { let _ = app.emit("tray://logout", ()); }
                "quit" => app.exit(0),
                _ => {}
            }).build(app)?;
            if let Ok(mut tray_status) = app.state::<TrayState>().0.lock() { tray_status.tray = Some(tray); }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![save_oauth_state, take_oauth_state, take_pending_deep_links, update_tray_status, save_refresh_token, load_refresh_token, delete_refresh_token])
        .run(tauri::generate_context!())
        .expect("error while running Plegat desktop");
}
