fn main() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo::rustc-check-cfg=cfg(mobile)");
    tauri_build::build();
}
