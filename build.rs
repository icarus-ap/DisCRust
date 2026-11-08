use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    #[cfg(target_os = "windows")]
    {
        let mut res = winres::WindowsResource::new();
        let mut custom_ico: Option<PathBuf> = None;

        if let Ok(local_appdata) = env::var("LOCALAPPDATA") {
            let cfg_path = Path::new(&local_appdata).join("DisCRust01").join("config.json");
            if let Ok(txt) = fs::read_to_string(&cfg_path) {
                if let Some(idx) = txt.find("\"CustomIconPath\"") {
                    let rest = &txt[idx..];
                    if let Some(colon) = rest.find(':') {
                        let after_colon = rest[colon + 1..].trim_start();
                        if after_colon.starts_with('"') {
                            let inner = &after_colon[1..];
                            if let Some(end_q) = inner.find('"') {
                                let raw_p = inner[..end_q].replace("\\\\", "\\");
                                let pb = PathBuf::from(&raw_p);
                                if pb.exists() && pb.extension().and_then(|e| e.to_str()).map(|s| s.eq_ignore_ascii_case("ico")).unwrap_or(false) {
                                    custom_ico = Some(pb);
                                }
                            }
                        }
                    }
                }
            }
            let cached_custom_ico = Path::new(&local_appdata).join("DisCRust01").join("custom_app_icon.ico");
            if custom_ico.is_none() && cached_custom_ico.exists() {
                custom_ico = Some(cached_custom_ico);
            }
        }

        if let Some(ref c_ico) = custom_ico {
            res.set_icon(&c_ico.display().to_string());
        } else if Path::new("discrust.ico").exists() {
            res.set_icon("discrust.ico");
        } else if Path::new("dislite.ico").exists() {
            res.set_icon("dislite.ico");
        } else if Path::new("litecord.ico").exists() {
            res.set_icon("litecord.ico");
        }

        // Leave FileDescription empty so Windows Task Manager ("Processes -> Apps")
        // always displays the live Win32 window title (Custom App Name) and live WM_SETICON!
        res.set("FileDescription", "");
        res.set("ProductName", "DisCRust");
        res.set("OriginalFilename", "DisCRust.exe");
        res.set("InternalName", "DisCRust");
        res.set("FileVersion", "0.6.6.0");
        res.set("ProductVersion", "0.6.6.0");
        let _ = res.compile();
    }
}
