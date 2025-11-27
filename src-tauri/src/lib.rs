mod bridges;
mod error;

use bridges::{govee::{GoveeSender, GoveeCloudClient}};
use tauri::Manager;



#[tauri::command]
async fn govee_send(
    state: tauri::State<'_, GoveeSender>,
    host: String,
    port: Option<u16>,
    body: serde_json::Value,
) -> Result<(), String> {
    state
        .send(&host, port, &body)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn govee_discover(timeout_ms: Option<u64>) -> Result<Vec<serde_json::Value>, String> {
    bridges::govee::discover(timeout_ms)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn govee_status(host: String, port: Option<u16>) -> Result<bridges::govee::GoveeStatus, String> {
    bridges::govee::get_status(&host, port)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn govee_cloud_devices(
    state: tauri::State<'_, GoveeCloudClient>,
    api_key: String,
) -> Result<serde_json::Value, String> {
    state
        .get_devices(api_key)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn govee_cloud_control(
    state: tauri::State<'_, GoveeCloudClient>,
    api_key: String,
    device: String,
    model: String,
    cmd: serde_json::Value,
) -> Result<serde_json::Value, String> {
    state
        .send_command(api_key, device, model, cmd)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn govee_cloud_state(
    state: tauri::State<'_, GoveeCloudClient>,
    api_key: String,
    device: String,
    model: String,
) -> Result<serde_json::Value, String> {
    state
        .get_device_state(api_key, device, model)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn roomsense_scan(timeout_ms: Option<u64>) -> Result<Vec<serde_json::Value>, String> {
    bridges::roomsense::scan(timeout_ms)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn is_wifi_connected() -> Result<bool, String> {
    bridges::network::is_connected_to_wifi()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_blec::init())
        .setup(|app| {

            app.manage(GoveeSender::default());
            app.manage(GoveeCloudClient::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![

            govee_send,
            govee_discover,
            govee_status,
            govee_cloud_devices,
            govee_cloud_control,
            govee_cloud_state,
            roomsense_scan,
            is_wifi_connected
        ])
        .run(tauri::generate_context!())
        .expect("error while running Toddler Lights");
}
