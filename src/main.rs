#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use image::{DynamicImage, ImageBuffer, ImageOutputFormat, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::env;
use std::ffi::c_void;
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tao::{
    dpi::LogicalSize,
    event::{Event, StartCause, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy},
    window::{Icon, ResizeDirection, WindowBuilder},
};
use wry::WebViewBuilder;

pub const DEFAULT_APP_NAME: &str = "DisCRust";
pub const APP_VERSION: &str = "0.6.6";
pub const FULL_SEMVER: &str = "0.6.6";
pub const INSTALLER_VERSION: &str = "6.6.0";
pub const EXPLICIT_APP_USER_MODEL_ID: &str = "VoxMortis.DisCRust.Client.v066";

pub const VENCORD_JS_URL: &str = "https://raw.githubusercontent.com/Vencord/builds/main/browser.js";
pub const VENCORD_CSS_URL: &str = "https://raw.githubusercontent.com/Vencord/builds/main/browser.css";

const INJECTED_ENGINE_TEMPLATE: &str = include_str!("injected_engine.js");
const EMBEDDED_ICON_PNG: &[u8] = include_bytes!("../discrust.png");
const EMBEDDED_ICON_ICO: &[u8] = include_bytes!("../discrust.ico");

static MAIN_HWND: AtomicIsize = AtomicIsize::new(0);
static TRAY_HWND: AtomicIsize = AtomicIsize::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct TaskbarBadgeState {
    pub mentions: u32,
    pub unread: bool,
    pub muted: bool,
    pub deafened: bool,
    pub streaming: bool,
    pub voice_connected: bool,
}

#[cfg(target_os = "windows")]
mod win32 {
    use std::ffi::c_void;

    #[repr(C)]
    pub struct PROCESS_MEMORY_COUNTERS {
        pub cb: u32,
        pub page_fault_count: u32,
        pub peak_working_set_size: usize,
        pub working_set_size: usize,
        pub quota_peak_paged_pool_usage: usize,
        pub quota_paged_pool_usage: usize,
        pub quota_peak_non_paged_pool_usage: usize,
        pub quota_non_paged_pool_usage: usize,
        pub pagefile_usage: usize,
        pub peak_pagefile_usage: usize,
    }

    #[repr(C)]
    pub struct PROCESSENTRY32W {
        pub dw_size: u32,
        pub cnt_usage: u32,
        pub th32_process_id: u32,
        pub th32_default_heap_id: usize,
        pub th32_module_id: u32,
        pub cnt_threads: u32,
        pub th32_parent_process_id: u32,
        pub pc_pri_class_base: i32,
        pub dw_flags: u32,
        pub sz_exe_file: [u16; 260],
    }

    #[repr(C)]
    pub struct RECT {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    pub struct POINT {
        pub x: i32,
        pub y: i32,
    }

    #[repr(C)]
    pub struct MSG {
        pub hwnd: isize,
        pub message: u32,
        pub w_param: usize,
        pub l_param: isize,
        pub time: u32,
        pub pt: POINT,
    }

    #[repr(C)]
    pub struct WNDCLASSEXW {
        pub cb_size: u32,
        pub style: u32,
        pub lpfn_wnd_proc: Option<unsafe extern "system" fn(isize, u32, usize, isize) -> isize>,
        pub cb_cls_extra: i32,
        pub cb_wnd_extra: i32,
        pub h_instance: isize,
        pub h_icon: isize,
        pub h_cursor: isize,
        pub hbr_background: isize,
        pub lpsz_menu_name: *const u16,
        pub lpsz_class_name: *const u16,
        pub h_icon_sm: isize,
    }

    #[repr(C)]
    pub struct NOTIFYICONDATAW {
        pub cb_size: u32,
        pub h_wnd: isize,
        pub u_id: u32,
        pub u_flags: u32,
        pub u_callback_message: u32,
        pub h_icon: isize,
        pub sz_tip: [u16; 128],
        pub dw_state: u32,
        pub dw_state_mask: u32,
        pub sz_info: [u16; 256],
        pub u_timeout_or_version: u32,
        pub sz_info_title: [u16; 64],
        pub dw_info_flags: u32,
        pub guid_item: [u8; 16],
        pub h_balloon_icon: isize,
    }

    pub const TH32CS_SNAPPROCESS: u32 = 0x00000002;
    pub const PROCESS_QUERY_INFORMATION: u32 = 0x0400;
    pub const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    pub const PROCESS_SET_QUOTA: u32 = 0x0100;
    pub const PROCESS_VM_READ: u32 = 0x0010;

    pub const SW_HIDE: i32 = 0;
    pub const SW_SHOW: i32 = 5;
    pub const SW_RESTORE: i32 = 9;
    pub const GWL_EXSTYLE: i32 = -20;
    pub const WS_EX_TOPMOST: isize = 0x00000008;
    pub const WS_EX_TOOLWINDOW: isize = 0x00000080;
    pub const SWP_NOSIZE: u32 = 0x0001;
    pub const SWP_NOMOVE: u32 = 0x0002;
    pub const SWP_NOZORDER: u32 = 0x0004;
    pub const SPI_GETWORKAREA: u32 = 0x0030;
    pub const SWP_NOACTIVATE: u32 = 0x0010;

    pub const WM_DESTROY: u32 = 0x0002;
    pub const WM_CLOSE: u32 = 0x0010;
    pub const WM_SETICON: u32 = 0x0080;
    pub const WM_COMMAND: u32 = 0x0111;
    pub const WM_USER: u32 = 0x0400;
    pub const WM_TRAYICON: u32 = WM_USER + 100;
    pub const WM_LBUTTONUP: u32 = 0x0202;
    pub const WM_LBUTTONDBLCLK: u32 = 0x0203;
    pub const WM_RBUTTONUP: u32 = 0x0205;
    pub const WM_CONTEXTMENU: u32 = 0x007B;

    pub const NIM_ADD: u32 = 0x00000000;
    pub const NIM_MODIFY: u32 = 0x00000001;
    pub const NIM_DELETE: u32 = 0x00000002;
    pub const NIF_MESSAGE: u32 = 0x00000001;
    pub const NIF_ICON: u32 = 0x00000002;
    pub const NIF_TIP: u32 = 0x00000004;
    pub const NIF_INFO: u32 = 0x00000010;
    pub const NIIF_INFO: u32 = 0x00000001;
    pub const NIIF_USER: u32 = 0x00000004;
    pub const NIIF_LARGE_ICON: u32 = 0x00000020;
    pub const NIN_BALLOONUSERCLICK: u32 = WM_USER + 5;

    pub const IMAGE_ICON: u32 = 1;
    pub const LR_LOADFROMFILE: u32 = 0x00000010;
    pub const LR_DEFAULTSIZE: u32 = 0x00000040;

    pub const MF_STRING: u32 = 0x00000000;
    pub const MF_SEPARATOR: u32 = 0x00000800;
    pub const TPM_BOTTOMALIGN: u32 = 0x0020;
    pub const TPM_LEFTALIGN: u32 = 0x0000;
    pub const TPM_RIGHTBUTTON: u32 = 0x0002;

    pub type WNDENUMPROC = unsafe extern "system" fn(hwnd: isize, lparam: isize) -> i32;

    #[link(name = "shell32")]
    extern "system" {
        pub fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
        pub fn Shell_NotifyIconW(dw_message: u32, lp_data: *mut NOTIFYICONDATAW) -> i32;
        pub fn SHQueryUserNotificationState(pquns: *mut i32) -> i32;
    }

    #[repr(C)]
    pub struct GUID {
        pub data1: u32,
        pub data2: u16,
        pub data3: u16,
        pub data4: [u8; 8],
    }

    pub const CLSID_TASKBAR_LIST: GUID = GUID {
        data1: 0x56FDF344,
        data2: 0xFD6D,
        data3: 0x11D0,
        data4: [0x95, 0x8A, 0x00, 0x60, 0x97, 0xC9, 0xA0, 0x90],
    };

    pub const IID_ITASKBAR_LIST3: GUID = GUID {
        data1: 0xEA1AFB91,
        data2: 0x9E28,
        data3: 0x4B86,
        data4: [0x90, 0xE9, 0x9E, 0x9F, 0x8A, 0x5E, 0xEF, 0xAF],
    };

    pub const CLSCTX_INPROC_SERVER: u32 = 0x1;

    #[repr(C)]
    pub struct ITaskbarList3Vtbl {
        pub query_interface: Option<unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32>,
        pub add_ref: Option<unsafe extern "system" fn(*mut c_void) -> u32>,
        pub release: Option<unsafe extern "system" fn(*mut c_void) -> u32>,
        pub hr_init: Option<unsafe extern "system" fn(*mut c_void) -> i32>,
        pub add_tab: Option<unsafe extern "system" fn(*mut c_void, isize) -> i32>,
        pub delete_tab: Option<unsafe extern "system" fn(*mut c_void, isize) -> i32>,
        pub activate_tab: Option<unsafe extern "system" fn(*mut c_void, isize) -> i32>,
        pub set_active_alt: Option<unsafe extern "system" fn(*mut c_void, isize) -> i32>,
        pub mark_fullscreen_window: Option<unsafe extern "system" fn(*mut c_void, isize, i32) -> i32>,
        pub set_progress_value: Option<unsafe extern "system" fn(*mut c_void, isize, u64, u64) -> i32>,
        pub set_progress_state: Option<unsafe extern "system" fn(*mut c_void, isize, u32) -> i32>,
        pub register_tab: Option<unsafe extern "system" fn(*mut c_void, isize, isize) -> i32>,
        pub unregister_tab: Option<unsafe extern "system" fn(*mut c_void, isize, isize) -> i32>,
        pub set_tab_order: Option<unsafe extern "system" fn(*mut c_void, isize, isize) -> i32>,
        pub set_tab_active: Option<unsafe extern "system" fn(*mut c_void, isize, isize, u32) -> i32>,
        pub thumb_bar_add_buttons: Option<unsafe extern "system" fn(*mut c_void, isize, u32, *const c_void) -> i32>,
        pub thumb_bar_update_buttons: Option<unsafe extern "system" fn(*mut c_void, isize, u32, *const c_void) -> i32>,
        pub thumb_bar_set_image_list: Option<unsafe extern "system" fn(*mut c_void, isize, isize) -> i32>,
        pub set_overlay_icon: Option<unsafe extern "system" fn(*mut c_void, isize, isize, *const u16) -> i32>,
    }

    #[repr(C)]
    pub struct ITaskbarList3 {
        pub lp_vtbl: *const ITaskbarList3Vtbl,
    }

    #[link(name = "ole32")]
    extern "system" {
        pub fn CoInitializeEx(pv_reserved: *const c_void, dw_co_init: u32) -> i32;
        pub fn CoCreateInstance(
            rclsid: *const GUID,
            p_unk_outer: *mut c_void,
            dw_cls_context: u32,
            riid: *const GUID,
            ppv: *mut *mut c_void,
        ) -> i32;
    }

    #[link(name = "dwmapi")]
    extern "system" {
        pub fn DwmSetWindowAttribute(
            hwnd: isize,
            dw_attribute: u32,
            pv_attribute: *const c_void,
            cb_attribute: u32,
        ) -> i32;
    }

    #[link(name = "user32")]
    extern "system" {
        pub fn GetActiveWindow() -> isize;
        pub fn GetForegroundWindow() -> isize;
        pub fn SetForegroundWindow(hwnd: isize) -> i32;
        pub fn FlashWindow(hwnd: isize, b_invert: i32) -> i32;
        pub fn EnumWindows(lp_enum_func: WNDENUMPROC, lparam: isize) -> i32;
        pub fn EnumChildWindows(hwnd_parent: isize, lp_enum_func: WNDENUMPROC, lparam: isize) -> i32;
        pub fn IsWindow(hwnd: isize) -> i32;
        pub fn IsWindowVisible(hwnd: isize) -> i32;
        pub fn IsIconic(hwnd: isize) -> i32;
        pub fn GetWindowTextW(hwnd: isize, lp_string: *mut u16, n_max_count: i32) -> i32;
        pub fn SetWindowTextW(hwnd: isize, lp_string: *const u16) -> i32;
        pub fn GetClassNameW(hwnd: isize, lp_class_name: *mut u16, n_max_count: i32) -> i32;
        pub fn GetWindowRect(hwnd: isize, lp_rect: *mut RECT) -> i32;
        pub fn SystemParametersInfoW(ui_action: u32, ui_param: u32, pv_param: *mut c_void, f_win_ini: u32) -> i32;
        pub fn GetWindowLongPtrW(hwnd: isize, n_index: i32) -> isize;
        pub fn SetWindowLongPtrW(hwnd: isize, n_index: i32, dw_new_long: isize) -> isize;
        pub fn SetClassLongPtrW(hwnd: isize, n_index: i32, dw_new_long: isize) -> usize;
        pub fn ShowWindow(hwnd: isize, n_cmd_show: i32) -> i32;
        pub fn SetWindowPos(
            hwnd: isize,
            hwnd_insert_after: isize,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            u_flags: u32,
        ) -> i32;
        pub fn RegisterClassExW(lpwcx: *const WNDCLASSEXW) -> u16;
        pub fn CreateWindowExW(
            dw_ex_style: u32,
            lp_class_name: *const u16,
            lp_window_name: *const u16,
            dw_style: u32,
            x: i32,
            y: i32,
            n_width: i32,
            n_height: i32,
            h_wnd_parent: isize,
            h_menu: isize,
            h_instance: isize,
            lp_param: *const c_void,
        ) -> isize;
        pub fn DefWindowProcW(hwnd: isize, msg: u32, w_param: usize, l_param: isize) -> isize;
        pub fn GetMessageW(
            lp_msg: *mut MSG,
            h_wnd: isize,
            w_msg_filter_min: u32,
            w_msg_filter_max: u32,
        ) -> i32;
        pub fn TranslateMessage(lp_msg: *const MSG) -> i32;
        pub fn DispatchMessageW(lp_msg: *const MSG) -> isize;
        pub fn PostMessageW(hwnd: isize, msg: u32, w_param: usize, l_param: isize) -> i32;
        pub fn SendMessageW(hwnd: isize, msg: u32, w_param: usize, l_param: isize) -> isize;
        pub fn LoadImageW(
            h_inst: isize,
            name: *const u16,
            type_: u32,
            cx: i32,
            cy: i32,
            fu_load: u32,
        ) -> isize;
        pub fn DestroyIcon(h_icon: isize) -> i32;
        pub fn CreatePopupMenu() -> isize;
        pub fn AppendMenuW(
            h_menu: isize,
            u_flags: u32,
            u_id_new_item: usize,
            lp_new_item: *const u16,
        ) -> i32;
        pub fn TrackPopupMenu(
            h_menu: isize,
            u_flags: u32,
            x: i32,
            y: i32,
            n_reserved: i32,
            h_wnd: isize,
            prc_rect: *const RECT,
        ) -> i32;
        pub fn DestroyMenu(h_menu: isize) -> i32;
        pub fn GetCursorPos(lp_point: *mut POINT) -> i32;
        pub fn GetWindowThreadProcessId(hwnd: isize, lpdw_process_id: *mut u32) -> u32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        pub fn GetModuleHandleW(lp_module_name: *const u16) -> isize;
        pub fn LoadLibraryA(lp_lib_file_name: *const u8) -> *mut c_void;
        pub fn GetProcAddress(h_module: *mut c_void, lp_proc_name: *const u8) -> *mut c_void;
        pub fn GetCurrentProcess() -> *mut c_void;
        pub fn GetCurrentProcessId() -> u32;
        pub fn OpenProcess(desired_access: u32, inherit_handle: i32, process_id: u32) -> *mut c_void;
        pub fn CloseHandle(object: *mut c_void) -> i32;
        pub fn SetProcessWorkingSetSize(
            process: *mut c_void,
            min_working_set_size: usize,
            max_working_set_size: usize,
        ) -> i32;
        pub fn CreateToolhelp32Snapshot(flags: u32, process_id: u32) -> *mut c_void;
        pub fn Process32FirstW(snapshot: *mut c_void, lppe: *mut PROCESSENTRY32W) -> i32;
        pub fn Process32NextW(snapshot: *mut c_void, lppe: *mut PROCESSENTRY32W) -> i32;
        pub fn QueryFullProcessImageNameW(
            h_process: *mut c_void,
            dw_flags: u32,
            lp_exe_name: *mut u16,
            lpdw_size: *mut u32,
        ) -> i32;
        pub fn K32EmptyWorkingSet(process: *mut c_void) -> i32;
        pub fn K32GetProcessMemoryInfo(
            process: *mut c_void,
            ppsmem_counters: *mut PROCESS_MEMORY_COUNTERS,
            cb: u32,
        ) -> i32;
        pub fn TerminateProcess(h_process: *mut c_void, u_exit_code: u32) -> i32;
        pub fn GetCurrentThreadId() -> u32;
    }

    pub const PROCESS_TERMINATE: u32 = 0x0001;
    pub const HKEY_CURRENT_USER: isize = -2147483647i32 as isize; // 0x80000001
    pub const KEY_WRITE: u32 = 0x00020006;
    pub const REG_SZ: u32 = 1;
    pub const REG_DWORD: u32 = 4;

    #[link(name = "user32")]
    extern "system" {
        pub fn AttachThreadInput(id_attach: u32, id_attach_to: u32, f_attach: i32) -> i32;
        pub fn BringWindowToTop(hwnd: isize) -> i32;
    }

    #[link(name = "advapi32")]
    extern "system" {
        pub fn RegCreateKeyExW(
            h_key: isize,
            lp_sub_key: *const u16,
            reserved: u32,
            lp_class: *const u16,
            dw_options: u32,
            sam_desired: u32,
            lp_security_attributes: *const c_void,
            phk_result: *mut isize,
            lpdw_disposition: *mut u32,
        ) -> i32;
        pub fn RegSetValueExW(
            h_key: isize,
            lp_value_name: *const u16,
            reserved: u32,
            dw_type: u32,
            lp_data: *const u8,
            cb_data: u32,
        ) -> i32;
        pub fn RegCloseKey(h_key: isize) -> i32;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SavedDiscordAccount {
    pub user_id: String,
    pub username: String,
    pub global_name: String,
    pub avatar_url: String,
    pub token: String,
    pub available_quests_count: i32,
    pub last_updated_utc: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase", default)]
pub struct AppConfig {
    pub config_version: i32,
    pub app_version: String,
    pub installer_version: String,
    pub quest_completer_installed: bool,
    pub vencord_installed: bool,
    pub game_activity_enabled: bool,
    pub custom_install_dir: String,
    pub reduce_motion_enabled: bool,
    pub eco_mode_enabled: bool,
    pub auto_trim_ram_enabled: bool,
    pub ultra_low_ram_cdp_purge: bool,
    pub show_title_bar_ram: bool,
    pub krisp_chrome_spoof_enabled: bool,
    pub vencord_enabled: bool,
    pub quest_helper_enabled: bool,
    pub quest_auto_open_on_startup: bool,
    pub quest_auto_scan: bool,
    pub quest_auto_start: bool,
    pub quest_desktop_by_default: bool,
    pub quest_refresh_interval_sec: i32,
    pub quest_cooldown_delay_sec: i32,
    pub quest_auto_collapse_fab: bool,
    pub quest_purge_video_ram: bool,
    pub quest_filter_orbs: bool,
    pub quest_filter_frames: bool,
    pub quest_filter_ads: bool,
    pub quest_filter_codes: bool,
    pub quest_filter_nitro: bool,
    pub privacy_hide_name: bool,
    pub privacy_hide_user_id: bool,
    pub privacy_hide_profile: bool,
    pub last_discord_path: String,
    pub has_saved_voice_prefs: bool,
    pub saved_mic_muted: bool,
    pub saved_deafened: bool,
    pub has_saved_member_list_pref: bool,
    pub saved_member_list_open: bool,
    pub desktop_notifications_enabled: bool,
    pub follow_discord_theme: bool,
    pub rounded_menu_corners: bool,
    pub discord_ui_scale_step: i32,
    pub show_title_bar_config_btn: bool,
    pub config_icon_style: String,
    pub custom_config_icon_data_uri: String,
    pub app_icon_preview_data_uri: String,
    pub menu_keymap: String,
    pub quest_hud_left: i32,
    pub quest_hud_top: i32,
    pub desktop_shortcut_enabled: bool,
    pub start_menu_shortcut_enabled: bool,
    pub run_on_windows_startup: bool,
    pub use_canary_channel: bool,
    pub custom_icon_path: String,
    pub custom_app_name: String,
    pub startup_launch_mode: String,
    pub quest_only_mode_active: bool,
    pub session_launch_prompt_shown: bool,
    pub left_accounts_panel_width: i32,
    pub right_quest_panel_width: i32,
    pub quest_hud_list_height: i32,
    pub auto_update_all_enabled: bool,
    pub auto_update_quest_engine: bool,
    pub quest_engine_version: String,
    pub last_update_check_utc: String,
    pub saved_accounts: Vec<SavedDiscordAccount>,
    #[serde(default = "default_win_width")]
    pub saved_window_width: u32,
    #[serde(default = "default_win_height")]
    pub saved_window_height: u32,
    #[serde(default)]
    pub saved_window_maximized: bool,
    #[serde(default = "default_true_bool")]
    pub show_title_bar_page_title: bool,
    #[serde(default = "default_true_bool")]
    pub show_title_bar_quest_btn: bool,
    #[serde(default = "default_true_bool")]
    pub show_title_bar_shortcuts_btn: bool,
    #[serde(default)]
    pub shortcuts_json: String,
    #[serde(default = "default_ota_url")]
    pub ota_manifest_url: String,
}

fn default_ota_url() -> String {
    "https://raw.githubusercontent.com/VoxMortis/DisCRust/main/ota_manifest.json".to_string()
}

fn default_true_bool() -> bool {
    true
}

fn default_win_width() -> u32 {
    1280
}

fn default_win_height() -> u32 {
    800
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            config_version: 43,
            app_version: FULL_SEMVER.to_string(),
            installer_version: INSTALLER_VERSION.to_string(),
            quest_completer_installed: true,
            vencord_installed: true,
            game_activity_enabled: true,
            custom_install_dir: String::new(),
            reduce_motion_enabled: false,
            eco_mode_enabled: true,
            auto_trim_ram_enabled: true,
            ultra_low_ram_cdp_purge: true,
            show_title_bar_ram: true,
            krisp_chrome_spoof_enabled: true,
            vencord_enabled: false,
            quest_helper_enabled: false,
            quest_auto_open_on_startup: false,
            quest_auto_scan: true,
            quest_auto_start: false,
            quest_desktop_by_default: true,
            quest_refresh_interval_sec: 5,
            quest_cooldown_delay_sec: 10,
            quest_auto_collapse_fab: false,
            quest_purge_video_ram: true,
            quest_filter_orbs: true,
            quest_filter_frames: true,
            quest_filter_ads: true,
            quest_filter_codes: true,
            quest_filter_nitro: true,
            privacy_hide_name: false,
            privacy_hide_user_id: false,
            privacy_hide_profile: false,
            last_discord_path: "/app".to_string(),
            has_saved_voice_prefs: false,
            saved_mic_muted: false,
            saved_deafened: false,
            has_saved_member_list_pref: false,
            saved_member_list_open: true,
            desktop_notifications_enabled: true,
            follow_discord_theme: true,
            rounded_menu_corners: true,
            discord_ui_scale_step: 0,
            show_title_bar_config_btn: true,
            config_icon_style: "Sliders".to_string(),
            custom_config_icon_data_uri: String::new(),
            app_icon_preview_data_uri: String::new(),
            menu_keymap: "Alt+C".to_string(),
            quest_hud_left: -1,
            quest_hud_top: -1,
            desktop_shortcut_enabled: true,
            start_menu_shortcut_enabled: true,
            run_on_windows_startup: false,
            use_canary_channel: false,
            custom_icon_path: String::new(),
            custom_app_name: DEFAULT_APP_NAME.to_string(),
            startup_launch_mode: "Ask".to_string(),
            quest_only_mode_active: false,
            session_launch_prompt_shown: false,
            left_accounts_panel_width: 240,
            right_quest_panel_width: 352,
            quest_hud_list_height: 170,
            auto_update_all_enabled: true,
            auto_update_quest_engine: true,
            quest_engine_version: "0.6.6-rust".to_string(),
            last_update_check_utc: String::new(),
            saved_accounts: Vec::new(),
            saved_window_width: 1280,
            saved_window_height: 800,
            saved_window_maximized: false,
            show_title_bar_page_title: true,
            show_title_bar_quest_btn: true,
            show_title_bar_shortcuts_btn: true,
            shortcuts_json: String::new(),
            ota_manifest_url: default_ota_url(),
        }
    }
}

#[derive(Debug, Clone)]
enum UserEvent {
    IpcMessage(String),
    PeriodicTick,
    SyncConfig,
    UpdateWindowIcon,
    TrayCommand(u32),
    NavigateToRoute(String),
    PushLoopbackAudioB64(String),
    EvalScript(String),
}

fn is_reserved_discord_name(name: &str) -> bool {
    let trimmed = name.trim().to_ascii_lowercase();
    matches!(
        trimmed.as_str(),
        "discord"
            | "discord ptb"
            | "discord canary"
            | "discord.exe"
            | "discord inc"
            | "dislite"
            | "dislite rust"
            | "disliterust"
            | "litecord"
    )
}

fn get_effective_app_name(cfg: &AppConfig) -> String {
    let raw = cfg.custom_app_name.trim();
    if raw.is_empty() || is_reserved_discord_name(raw) {
        return DEFAULT_APP_NAME.to_string();
    }
    let cleaned: String = raw
        .chars()
        .filter(|c| !['<', '>', ':', '"', '/', '\\', '|', '?', '*'].contains(c))
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() || is_reserved_discord_name(trimmed) {
        DEFAULT_APP_NAME.to_string()
    } else {
        trimmed.to_string()
    }
}

fn get_app_data_root() -> PathBuf {
    let local_app_data = env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string());
    let dir = PathBuf::from(&local_app_data).join("DisLiteRust01");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn get_vencord_dir() -> PathBuf {
    let dir = get_app_data_root().join("Vencord");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn get_userscripts_dir() -> PathBuf {
    let dir = get_app_data_root().join("Userscripts");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn ensure_embedded_default_icon_on_disk() -> PathBuf {
    let root = get_app_data_root();
    let ico_path = root.join("discrust.ico");
    let _ = fs::write(&ico_path, EMBEDDED_ICON_ICO);
    let _ = fs::write(root.join("dislite.ico"), EMBEDDED_ICON_ICO);
    let png_path = root.join("discrust.png");
    let _ = fs::write(&png_path, EMBEDDED_ICON_PNG);
    let _ = fs::write(root.join("dislite.png"), EMBEDDED_ICON_PNG);
    ico_path
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn process_and_apply_custom_icon_file(src_path: &Path, cfg: &mut AppConfig) -> bool {
    if !src_path.exists() {
        return false;
    }
    let root = get_app_data_root();
    let dest_ico = root.join("custom_app.ico");
    let ext = src_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if let Ok(bytes) = fs::read(src_path) {
        if let Ok(img) = image::load_from_memory(&bytes) {
            let resized_png = img.resize_exact(64, 64, image::imageops::FilterType::Lanczos3);
            let mut png_buf = Vec::new();
            if resized_png
                .write_to(&mut Cursor::new(&mut png_buf), ImageOutputFormat::Png)
                .is_ok()
            {
                let b64 = encode_base64(&png_buf);
                cfg.app_icon_preview_data_uri = format!("data:image/png;base64,{}", b64);
                cfg.custom_config_icon_data_uri = cfg.app_icon_preview_data_uri.clone();
            }

            if ext == "ico" {
                let _ = fs::write(&dest_ico, &bytes);
            } else {
                let ico_img = img.resize_exact(128, 128, image::imageops::FilterType::Lanczos3);
                let mut ico_buf = Vec::new();
                if ico_img
                    .write_to(&mut Cursor::new(&mut ico_buf), ImageOutputFormat::Ico)
                    .is_ok()
                {
                    let _ = fs::write(&dest_ico, &ico_buf);
                }
            }
            if dest_ico.exists() {
                cfg.custom_icon_path = dest_ico.display().to_string();
                return true;
            }
        } else if ext == "ico" {
            if fs::write(&dest_ico, &bytes).is_ok() {
                cfg.custom_icon_path = dest_ico.display().to_string();
                return true;
            }
        }
    }
    false
}

fn load_base_rgba64(cfg: &AppConfig) -> RgbaImage {
    if !cfg.custom_icon_path.is_empty() && Path::new(&cfg.custom_icon_path).exists() {
        if let Ok(bytes) = fs::read(&cfg.custom_icon_path) {
            if let Ok(img) = image::load_from_memory(&bytes) {
                return img
                    .resize_exact(64, 64, image::imageops::FilterType::Lanczos3)
                    .into_rgba8();
            }
        }
    }
    if let Ok(img) = image::load_from_memory(EMBEDDED_ICON_PNG) {
        return img
            .resize_exact(64, 64, image::imageops::FilterType::Lanczos3)
            .into_rgba8();
    }
    ImageBuffer::from_pixel(64, 64, Rgba([88, 101, 242, 255]))
}

fn draw_filled_circle(img: &mut RgbaImage, cx: i32, cy: i32, r: i32, col: Rgba<u8>) {
    let r2 = r * r;
    for y in (cy - r).max(0)..=(cy + r).min(63) {
        for x in (cx - r).max(0)..=(cx + r).min(63) {
            let dx = x - cx;
            let dy = y - cy;
            if dx * dx + dy * dy <= r2 {
                img.put_pixel(x as u32, y as u32, col);
            }
        }
    }
}

fn draw_pixel_bitmap_3x5(img: &mut RgbaImage, x0: i32, y0: i32, scale: i32, rows: [u8; 5], col: Rgba<u8>) {
    for (ry, row_bits) in rows.iter().enumerate() {
        for rx in 0..3 {
            if (row_bits >> (2 - rx)) & 1 == 1 {
                for sy in 0..scale {
                    for sx in 0..scale {
                        let px = x0 + (rx as i32) * scale + sx;
                        let py = y0 + (ry as i32) * scale + sy;
                        if (0..64).contains(&px) && (0..64).contains(&py) {
                            img.put_pixel(px as u32, py as u32, col);
                        }
                    }
                }
            }
        }
    }
}

fn digit_bitmap(ch: char) -> [u8; 5] {
    match ch {
        '0' => [0b111, 0b101, 0b101, 0b101, 0b111],
        '1' => [0b010, 0b110, 0b010, 0b010, 0b111],
        '2' => [0b111, 0b001, 0b111, 0b100, 0b111],
        '3' => [0b111, 0b001, 0b111, 0b001, 0b111],
        '4' => [0b101, 0b101, 0b111, 0b001, 0b001],
        '5' => [0b111, 0b100, 0b111, 0b001, 0b111],
        '6' => [0b111, 0b100, 0b111, 0b101, 0b111],
        '7' => [0b111, 0b001, 0b010, 0b010, 0b010],
        '8' => [0b111, 0b101, 0b111, 0b101, 0b111],
        '9' => [0b111, 0b101, 0b111, 0b001, 0b111],
        '+' => [0b000, 0b010, 0b111, 0b010, 0b000],
        _ => [0b000, 0b000, 0b000, 0b000, 0b000],
    }
}

fn draw_filled_circle_sized(img: &mut RgbaImage, cx: i32, cy: i32, r: i32, col: Rgba<u8>) {
    let (w, h) = img.dimensions();
    let max_x = (w as i32) - 1;
    let max_y = (h as i32) - 1;
    let r2 = r * r;
    for y in (cy - r).max(0)..=(cy + r).min(max_y) {
        for x in (cx - r).max(0)..=(cx + r).min(max_x) {
            let dx = x - cx;
            let dy = y - cy;
            if dx * dx + dy * dy <= r2 {
                img.put_pixel(x as u32, y as u32, col);
            }
        }
    }
}

fn draw_pixel_bitmap_3x5_sized(img: &mut RgbaImage, x0: i32, y0: i32, scale: i32, rows: [u8; 5], col: Rgba<u8>) {
    let (w, h) = img.dimensions();
    for (ry, row_bits) in rows.iter().enumerate() {
        for rx in 0..3 {
            if (row_bits >> (2 - rx)) & 1 == 1 {
                for sy in 0..scale {
                    for sx in 0..scale {
                        let px = x0 + (rx as i32) * scale + sx;
                        let py = y0 + (ry as i32) * scale + sy;
                        if px >= 0 && px < (w as i32) && py >= 0 && py < (h as i32) {
                            img.put_pixel(px as u32, py as u32, col);
                        }
                    }
                }
            }
        }
    }
}

// Helper: point-to-segment distance squared for crisp 4x super-sampled vector icons
fn dist_to_segment_sq(px: f32, py: f32, x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
    let vx = x2 - x1;
    let vy = y2 - y1;
    let wx = px - x1;
    let wy = py - y1;
    let c1 = vx * wx + vy * wy;
    if c1 <= 0.0 {
        return (px - x1) * (px - x1) + (py - y1) * (py - y1);
    }
    let c2 = vx * vx + vy * vy;
    if c2 <= c1 {
        return (px - x2) * (px - x2) + (py - y2) * (py - y2);
    }
    let b = c1 / c2;
    let bx = x1 + b * vx;
    let by = y1 + b * vy;
    (px - bx) * (px - bx) + (py - by) * (py - by)
}

// Renders crystal-clear, 4x super-sampled anti-aliased vector glyph for Muted, Deafened, Streaming, or Voice Connected
fn draw_crisp_status_glyph_32(ov: &mut RgbaImage, kind: &str, bg_col: Rgba<u8>) {
    let cx = 16.0f32;
    let cy = 16.0f32;

    // 1. Draw anti-aliased outer dark border (r=15.2) and inner colored badge circle (r=13.2)
    for y in 0..32 {
        for x in 0..32 {
            let mut cov_outer = 0.0f32;
            let mut cov_inner = 0.0f32;
            let mut cov_white = 0.0f32;
            let mut cov_knockout = 0.0f32;

            for sy in 0..4 {
                for sx in 0..4 {
                    let px = (x as f32) + ((sx as f32) + 0.5) * 0.25;
                    let py = (y as f32) + ((sy as f32) + 0.5) * 0.25;
                    let dx = px - cx;
                    let dy = py - cy;
                    let d = (dx * dx + dy * dy).sqrt();

                    if d <= 15.3 {
                        cov_outer += 1.0;
                    }
                    if d <= 13.2 {
                        cov_inner += 1.0;
                    }

                    match kind {
                        "muted" => {
                            // Crisp Microphone:
                            // 1) Capsule body from (16, 9.2) to (16, 15.2), radius 2.9
                            let cap_d = dist_to_segment_sq(px, py, 16.0, 9.2, 16.0, 15.2).sqrt();
                            let in_cap = cap_d <= 2.9;
                            // 2) U-shaped cradle arc around (16, 14.8), radius 5.4, thickness 1.8 (for py >= 14.2)
                            let arc_r = ((px - 16.0).powi(2) + (py - 14.8).powi(2)).sqrt();
                            let in_arc = py >= 14.0 && (arc_r - 5.4).abs() <= 1.05;
                            // 3) Stand stem from (16, 20.2) to (16, 23.2) + base (12.5, 23.2)..(19.5, 23.2)
                            let in_stem = dist_to_segment_sq(px, py, 16.0, 20.0, 16.0, 23.2).sqrt() <= 1.05;
                            let in_base = dist_to_segment_sq(px, py, 12.6, 23.2, 19.4, 23.2).sqrt() <= 1.05;

                            if in_cap || in_arc || in_stem || in_base {
                                cov_white += 1.0;
                            }

                            // Diagonal mute slash from (8.8, 8.8) to (23.2, 23.2) with knockout border
                            let slash_d = dist_to_segment_sq(px, py, 8.8, 8.8, 23.2, 23.2).sqrt();
                            if slash_d <= 1.35 {
                                cov_white += 1.0;
                                cov_knockout = 0.0;
                            } else if slash_d <= 2.85 {
                                cov_knockout += 1.0;
                            }
                        }
                        "deafened" => {
                            // Crisp Headphones:
                            // 1) Upper headband arch centered at (16, 16.2), radius 6.8, thickness 2.1 (for py <= 16.5)
                            let arch_r = ((px - 16.0).powi(2) + (py - 16.2).powi(2)).sqrt();
                            let in_arch = py <= 16.5 && (arch_r - 6.8).abs() <= 1.15;
                            // 2) Left & right earcups at x=9.5 and x=22.5, y=15.0..20.8, radius 2.2
                            let left_cup = dist_to_segment_sq(px, py, 9.5, 15.2, 9.5, 20.6).sqrt() <= 2.15;
                            let right_cup = dist_to_segment_sq(px, py, 22.5, 15.2, 22.5, 20.6).sqrt() <= 2.15;

                            if in_arch || left_cup || right_cup {
                                cov_white += 1.0;
                            }

                            // Diagonal deafen slash from (8.8, 8.8) to (23.2, 23.2) with knockout border
                            let slash_d = dist_to_segment_sq(px, py, 8.8, 8.8, 23.2, 23.2).sqrt();
                            if slash_d <= 1.35 {
                                cov_white += 1.0;
                                cov_knockout = 0.0;
                            } else if slash_d <= 2.85 {
                                cov_knockout += 1.0;
                            }
                        }
                        "streaming" => {
                            // Crisp Screen / Live Play triangle centered at (16.5, 16):
                            // Vertices: (12.2, 9.8), (12.2, 22.2), (22.8, 16.0)
                            if px >= 12.0 && px <= 22.8 {
                                let t = (px - 12.0) / (22.8 - 12.0);
                                let half_h = 6.2 * (1.0 - t);
                                if (py - 16.0).abs() <= half_h {
                                    cov_white += 1.0;
                                }
                            }
                        }
                        "voice" => {
                            // Crisp Speaker + Sound Waves:
                            // 1) Speaker body box x=8.5..12.0, y=13.2..18.8 + cone to x=16.2, y=10.0..22.0
                            let in_box = px >= 8.5 && px <= 12.0 && (py - 16.0).abs() <= 2.8;
                            let in_cone = px >= 11.2 && px <= 16.0 && (py - 16.0).abs() <= (2.8 + (px - 11.2) * 0.68);
                            // 2) Two sound wave arcs on right centered at (15.5, 16.0), r=4.6 and r=7.8, for px >= 17.0 and |py-16| <= (px-14.5)
                            let wr = ((px - 15.2).powi(2) + (py - 16.0).powi(2)).sqrt();
                            let in_angle = px >= 16.8 && (py - 16.0).abs() <= (px - 14.2) * 0.92;
                            let wave1 = in_angle && (wr - 4.4).abs() <= 1.0;
                            let wave2 = in_angle && (wr - 7.6).abs() <= 1.0;

                            if in_box || in_cone || wave1 || wave2 {
                                cov_white += 1.0;
                            }
                        }
                        _ => {}
                    }
                }
            }

            if cov_outer > 0.0 {
                let outer_a = (cov_outer / 16.0).clamp(0.0, 1.0);
                let inner_a = (cov_inner / 16.0).clamp(0.0, 1.0);
                let mut r = 17.0 * (1.0 - inner_a) + (bg_col[0] as f32) * inner_a;
                let mut g = 18.0 * (1.0 - inner_a) + (bg_col[1] as f32) * inner_a;
                let mut b = 20.0 * (1.0 - inner_a) + (bg_col[2] as f32) * inner_a;

                if cov_inner > 0.0 {
                    let ko_a = (cov_knockout / 16.0).clamp(0.0, 1.0);
                    let w_a = ((cov_white / 16.0) * (1.0 - ko_a)).clamp(0.0, 1.0);
                    r = r * (1.0 - w_a) + 255.0 * w_a;
                    g = g * (1.0 - w_a) + 255.0 * w_a;
                    b = b * (1.0 - w_a) + 255.0 * w_a;
                }

                let a_u8 = (outer_a * 255.0).round() as u8;
                ov.put_pixel(x, y, Rgba([r.round() as u8, g.round() as u8, b.round() as u8, a_u8]));
            }
        }
    }
}

// Builds a 32x32 standalone transparent overlay badge icon for Windows ITaskbarList3::SetOverlayIcon
// Cross-checked with official Discord.exe:
// - Voice/Mute/Deafen/Streaming badges ONLY appear when connected to a voice channel/call (state.voice_connected == true)
// - The 1..9+ mention counter is preserved exactly as before!
fn build_taskbar_overlay_ico(state: TaskbarBadgeState) -> Option<PathBuf> {
    let active_voice_state = state.voice_connected;
    if state.mentions == 0 && !state.unread && !active_voice_state {
        return None;
    }

    let mut ov = ImageBuffer::from_pixel(32, 32, Rgba([0, 0, 0, 0]));
    let dark_outline = Rgba([17, 18, 20, 255]);
    let white = Rgba([255, 255, 255, 255]);
    let red_badge = Rgba([242, 63, 67, 255]);
    let green_badge = Rgba([35, 165, 90, 255]);
    let purple_badge = Rgba([145, 70, 255, 255]);

    let cx = 16;
    let cy = 16;

    // In official Discord, active voice/mute/deafen/streaming overlay takes priority when in a call, or mention count when not in a call (or if mentions > 0 and not in voice)
    if active_voice_state && state.deafened {
        draw_crisp_status_glyph_32(&mut ov, "deafened", red_badge);
    } else if active_voice_state && state.muted {
        draw_crisp_status_glyph_32(&mut ov, "muted", red_badge);
    } else if active_voice_state && state.streaming {
        draw_crisp_status_glyph_32(&mut ov, "streaming", purple_badge);
    } else if state.mentions > 0 {
        // Keep the exact 1..9+ counter that the user confirmed is perfect!
        draw_filled_circle_sized(&mut ov, cx, cy, 15, dark_outline);
        draw_filled_circle_sized(&mut ov, cx, cy, 13, red_badge);
        let text = if state.mentions > 9 {
            "9+".to_string()
        } else {
            state.mentions.to_string()
        };
        let chars: Vec<char> = text.chars().collect();
        if chars.len() == 1 {
            draw_pixel_bitmap_3x5_sized(&mut ov, cx - 4, cy - 7, 3, digit_bitmap(chars[0]), white);
        } else if chars.len() == 2 {
            draw_pixel_bitmap_3x5_sized(&mut ov, cx - 7, cy - 5, 2, digit_bitmap(chars[0]), white);
            draw_pixel_bitmap_3x5_sized(&mut ov, cx + 1, cy - 5, 2, digit_bitmap(chars[1]), white);
        }
    } else if active_voice_state {
        draw_crisp_status_glyph_32(&mut ov, "voice", green_badge);
    } else if state.unread {
        draw_filled_circle_sized(&mut ov, 18, 18, 13, dark_outline);
        draw_filled_circle_sized(&mut ov, 18, 18, 10, red_badge);
    }

    let overlay_path = get_app_data_root().join("taskbar_overlay.ico");
    let dyn_ov = DynamicImage::ImageRgba8(ov);
    let mut buf = Vec::new();
    if dyn_ov.write_to(&mut Cursor::new(&mut buf), ImageOutputFormat::Ico).is_ok() {
        let _ = fs::write(&overlay_path, &buf);
        return Some(overlay_path);
    }
    None
}

// Dynamically composites large high-contrast Discord badges onto the 64x64 System Tray icon
fn compose_badged_rgba_icon(cfg: &AppConfig, state: TaskbarBadgeState) -> RgbaImage {
    let mut img = load_base_rgba64(cfg);
    let dark_outline = Rgba([17, 18, 20, 255]);
    let white = Rgba([255, 255, 255, 255]);
    let red_badge = Rgba([242, 63, 67, 255]);
    let green_badge = Rgba([35, 165, 90, 255]);
    let purple_badge = Rgba([145, 70, 255, 255]);

    if state.mentions > 0 {
        let cx = 44;
        let cy = 44;
        draw_filled_circle(&mut img, cx, cy, 19, dark_outline);
        draw_filled_circle(&mut img, cx, cy, 16, red_badge);
        let text = if state.mentions > 9 {
            "9+".to_string()
        } else {
            state.mentions.to_string()
        };
        let chars: Vec<char> = text.chars().collect();
        if chars.len() == 1 {
            draw_pixel_bitmap_3x5(&mut img, cx - 4, cy - 7, 3, digit_bitmap(chars[0]), white);
        } else if chars.len() == 2 {
            draw_pixel_bitmap_3x5(&mut img, cx - 7, cy - 5, 2, digit_bitmap(chars[0]), white);
            draw_pixel_bitmap_3x5(&mut img, cx + 1, cy - 5, 2, digit_bitmap(chars[1]), white);
        }
    } else if state.unread {
        let cx = 46;
        let cy = 46;
        draw_filled_circle(&mut img, cx, cy, 17, dark_outline);
        draw_filled_circle(&mut img, cx, cy, 14, red_badge);
    } else if state.voice_connected && (state.deafened || state.muted) {
        let cx = 46;
        let cy = 46;
        draw_filled_circle(&mut img, cx, cy, 17, dark_outline);
        draw_filled_circle(&mut img, cx, cy, 14, red_badge);
        for d in -6..=6 {
            let sx = cx + d;
            let sy = cy + d;
            if (0..64).contains(&sx) && (0..64).contains(&sy) {
                img.put_pixel(sx as u32, sy as u32, white);
                if (0..64).contains(&(sx + 1)) {
                    img.put_pixel((sx + 1) as u32, sy as u32, white);
                }
            }
        }
    } else if state.voice_connected && state.streaming {
        let cx = 46;
        let cy = 46;
        draw_filled_circle(&mut img, cx, cy, 17, dark_outline);
        draw_filled_circle(&mut img, cx, cy, 14, purple_badge);
        draw_filled_circle(&mut img, cx, cy, 5, white);
    } else if state.voice_connected {
        let cx = 46;
        let cy = 46;
        draw_filled_circle(&mut img, cx, cy, 17, dark_outline);
        draw_filled_circle(&mut img, cx, cy, 14, green_badge);
        draw_filled_circle(&mut img, cx, cy, 5, white);
    }

    img
}

fn build_tao_and_win32_icons(cfg: &AppConfig, state: TaskbarBadgeState) -> (Option<Icon>, PathBuf) {
    let base_rgba = load_base_rgba64(cfg);
    let badged_rgba = compose_badged_rgba_icon(cfg, state);
    let root = get_app_data_root();

    // Also write custom_app_icon.ico (unbadged base icon) for main window class & PE resource sync
    let base_ico_path = root.join("custom_app_icon.ico");
    let base_dyn = DynamicImage::ImageRgba8(base_rgba.clone());
    let mut base_ico_buf = Vec::new();
    if base_dyn
        .write_to(&mut Cursor::new(&mut base_ico_buf), ImageOutputFormat::Ico)
        .is_ok()
    {
        let _ = fs::write(&base_ico_path, &base_ico_buf);
    }

    let live_ico_path = root.join("live_state.ico");
    let dyn_img = DynamicImage::ImageRgba8(badged_rgba);
    let mut ico_buf = Vec::new();
    if dyn_img
        .write_to(&mut Cursor::new(&mut ico_buf), ImageOutputFormat::Ico)
        .is_ok()
    {
        let _ = fs::write(&live_ico_path, &ico_buf);
    }
    let (w, h) = base_rgba.dimensions();
    let tao_icon = Icon::from_rgba(base_rgba.into_raw(), w, h).ok();
    (tao_icon, live_ico_path)
}

#[cfg(target_os = "windows")]
fn apply_taskbar_overlay_badge(main_h: isize, state: TaskbarBadgeState) {
    if main_h == 0 {
        return;
    }
    unsafe {
        let _ = win32::CoInitializeEx(std::ptr::null(), 2); // COINIT_APARTMENTTHREADED = 2
        let mut taskbar_ptr: *mut c_void = std::ptr::null_mut();
        let hr = win32::CoCreateInstance(
            &win32::CLSID_TASKBAR_LIST,
            std::ptr::null_mut(),
            win32::CLSCTX_INPROC_SERVER,
            &win32::IID_ITASKBAR_LIST3,
            &mut taskbar_ptr,
        );
        if hr >= 0 && !taskbar_ptr.is_null() {
            let tb = taskbar_ptr as *mut win32::ITaskbarList3;
            let vtbl = &*(*tb).lp_vtbl;
            if let Some(hr_init) = vtbl.hr_init {
                let _ = hr_init(taskbar_ptr);
            }
            if let Some(set_overlay) = vtbl.set_overlay_icon {
                if let Some(ov_path) = build_taskbar_overlay_ico(state) {
                    let mut wide_ov: Vec<u16> = ov_path.display().to_string().encode_utf16().collect();
                    wide_ov.push(0);
                    let hov = win32::LoadImageW(
                        0,
                        wide_ov.as_ptr(),
                        win32::IMAGE_ICON,
                        32,
                        32,
                        win32::LR_LOADFROMFILE,
                    );
                    let mut desc: Vec<u16> = "DisCRust Status Badge\0".encode_utf16().collect();
                    let _ = set_overlay(taskbar_ptr, main_h, 0, std::ptr::null());
                    let _ = set_overlay(taskbar_ptr, main_h, hov, desc.as_mut_ptr());
                    if hov != 0 {
                        let _ = win32::DestroyIcon(hov);
                    }
                } else {
                    let _ = set_overlay(taskbar_ptr, main_h, 0, std::ptr::null());
                }
            }
            if let Some(release) = vtbl.release {
                let _ = release(taskbar_ptr);
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn apply_win32_hwnd_and_tray_icon(ico_path: &Path, tooltip: &str, state: TaskbarBadgeState, clean_app_name: &str) {
    unsafe {
        let mut wide_path: Vec<u16> = ico_path.display().to_string().encode_utf16().collect();
        wide_path.push(0);
        let hicon_small = win32::LoadImageW(
            0,
            wide_path.as_ptr(),
            win32::IMAGE_ICON,
            16,
            16,
            win32::LR_LOADFROMFILE,
        );

        let base_ico_path = get_app_data_root().join("custom_app_icon.ico");
        let base_p = if base_ico_path.exists() { base_ico_path.as_path() } else { ico_path };
        let mut wide_base: Vec<u16> = base_p.display().to_string().encode_utf16().collect();
        wide_base.push(0);
        let hicon_win_small = win32::LoadImageW(
            0,
            wide_base.as_ptr(),
            win32::IMAGE_ICON,
            16,
            16,
            win32::LR_LOADFROMFILE,
        );
        let hicon_win_big = win32::LoadImageW(
            0,
            wide_base.as_ptr(),
            win32::IMAGE_ICON,
            32,
            32,
            win32::LR_LOADFROMFILE,
        );

        let main_h = resolve_main_hwnd();
        if main_h != 0 {
            // Set exact custom app name on the Win32 HWND so Windows Task Manager ("Processes -> Apps") displays it!
            let mut wide_title: Vec<u16> = clean_app_name.encode_utf16().collect();
            wide_title.push(0);
            let _ = win32::SetWindowTextW(main_h, wide_title.as_ptr());

            // Set both instance (WM_SETICON) and class (GCLP_HICON / GCLP_HICONSM) icons on MAIN_HWND for Task Manager & Alt+Tab
            if hicon_win_small != 0 {
                let _ = win32::SendMessageW(main_h, win32::WM_SETICON, 0, hicon_win_small);
                let _ = win32::SetClassLongPtrW(main_h, -34, hicon_win_small);
            }
            if hicon_win_big != 0 {
                let _ = win32::SendMessageW(main_h, win32::WM_SETICON, 1, hicon_win_big);
                let _ = win32::SetClassLongPtrW(main_h, -14, hicon_win_big);
            }
            apply_taskbar_overlay_badge(main_h, state);
        }

        let tray_h = TRAY_HWND.load(Ordering::Relaxed);
        if tray_h != 0 && hicon_small != 0 {
            let mut nid: win32::NOTIFYICONDATAW = std::mem::zeroed();
            nid.cb_size = std::mem::size_of::<win32::NOTIFYICONDATAW>() as u32;
            nid.h_wnd = tray_h;
            nid.u_id = 1;
            nid.u_flags = win32::NIF_ICON | win32::NIF_TIP | win32::NIF_MESSAGE;
            nid.u_callback_message = win32::WM_TRAYICON;
            nid.h_icon = hicon_small;
            let tip_utf16: Vec<u16> = tooltip.encode_utf16().take(120).collect();
            for (i, &ch) in tip_utf16.iter().enumerate() {
                nid.sz_tip[i] = ch;
            }
            let _ = win32::Shell_NotifyIconW(win32::NIM_MODIFY, &mut nid);
        }
    }
}

#[cfg(target_os = "windows")]
static mut GLOBAL_TRAY_PROXY: Option<EventLoopProxy<UserEvent>> = None;
#[cfg(target_os = "windows")]
static mut LAST_NOTIF_ROUTE: Option<String> = None;

#[cfg(target_os = "windows")]
unsafe extern "system" fn tray_wnd_proc(
    hwnd: isize,
    msg: u32,
    w_param: usize,
    l_param: isize,
) -> isize {
    if msg == win32::WM_TRAYICON {
        let ev = (l_param as u32) & 0xFFFF;
        if ev == win32::NIN_BALLOONUSERCLICK {
            focus_main_window_without_resizing();
            if let Some(ref proxy) = GLOBAL_TRAY_PROXY {
                let r = LAST_NOTIF_ROUTE.clone().unwrap_or_else(|| "/channels/@me".to_string());
                let _ = proxy.send_event(UserEvent::NavigateToRoute(r));
            }
            return 0;
        } else if ev == win32::WM_LBUTTONUP || ev == win32::WM_LBUTTONDBLCLK {
            focus_main_window_without_resizing();
            if let Some(ref proxy) = GLOBAL_TRAY_PROXY {
                let _ = proxy.send_event(UserEvent::TrayCommand(1001));
            }
            return 0;
        } else if ev == win32::WM_RBUTTONUP || ev == win32::WM_CONTEXTMENU {
            let hmenu = win32::CreatePopupMenu();
            if hmenu != 0 {
                let add_item = |id: usize, label: &str| {
                    let mut w: Vec<u16> = label.encode_utf16().collect();
                    w.push(0);
                    let _ = win32::AppendMenuW(hmenu, win32::MF_STRING, id, w.as_ptr());
                };
                add_item(1001, "Open DisLite Rust");
                let _ = win32::AppendMenuW(hmenu, win32::MF_SEPARATOR, 0, std::ptr::null());
                add_item(1002, "Toggle Mute");
                add_item(1003, "Toggle Deafen");
                add_item(1004, "Switch Workspace (Discord / Quests)");
                add_item(1005, "Open Configurations");
                let _ = win32::AppendMenuW(hmenu, win32::MF_SEPARATOR, 0, std::ptr::null());
                add_item(1006, "Restart DisLite Rust");
                add_item(1007, "Quit DisLite Rust");

                let mut pt = win32::POINT { x: 0, y: 0 };
                let _ = win32::GetCursorPos(&mut pt);
                let _ = win32::SetForegroundWindow(hwnd);
                let _ = win32::TrackPopupMenu(
                    hmenu,
                    win32::TPM_BOTTOMALIGN | win32::TPM_LEFTALIGN | win32::TPM_RIGHTBUTTON,
                    pt.x,
                    pt.y,
                    0,
                    hwnd,
                    std::ptr::null(),
                );
                let _ = win32::DestroyMenu(hmenu);
            }
            return 0;
        }
    } else if msg == win32::WM_COMMAND {
        let cmd_id = (w_param & 0xFFFF) as u32;
        if let Some(ref proxy) = GLOBAL_TRAY_PROXY {
            let _ = proxy.send_event(UserEvent::TrayCommand(cmd_id));
        }
        return 0;
    }
    win32::DefWindowProcW(hwnd, msg, w_param, l_param)
}

#[cfg(target_os = "windows")]
fn spawn_system_tray_thread(proxy: EventLoopProxy<UserEvent>, initial_ico_path: PathBuf, app_title: String) {
    thread::spawn(move || unsafe {
        GLOBAL_TRAY_PROXY = Some(proxy);
        let h_inst = win32::GetModuleHandleW(std::ptr::null());
        let class_name: Vec<u16> = "DisLiteRustTrayHiddenWndClass\0".encode_utf16().collect();
        let wc = win32::WNDCLASSEXW {
            cb_size: std::mem::size_of::<win32::WNDCLASSEXW>() as u32,
            style: 0,
            lpfn_wnd_proc: Some(tray_wnd_proc),
            cb_cls_extra: 0,
            cb_wnd_extra: 0,
            h_instance: h_inst,
            h_icon: 0,
            h_cursor: 0,
            hbr_background: 0,
            lpsz_menu_name: std::ptr::null(),
            lpsz_class_name: class_name.as_ptr(),
            h_icon_sm: 0,
        };
        let _ = win32::RegisterClassExW(&wc);

        let hwnd = win32::CreateWindowExW(
            0,
            class_name.as_ptr(),
            class_name.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            h_inst,
            std::ptr::null(),
        );
        if hwnd == 0 {
            return;
        }
        TRAY_HWND.store(hwnd, Ordering::Relaxed);

        let mut wide_ico: Vec<u16> = initial_ico_path.display().to_string().encode_utf16().collect();
        wide_ico.push(0);
        let hicon = win32::LoadImageW(
            0,
            wide_ico.as_ptr(),
            win32::IMAGE_ICON,
            16,
            16,
            win32::LR_LOADFROMFILE,
        );

        let mut nid: win32::NOTIFYICONDATAW = std::mem::zeroed();
        nid.cb_size = std::mem::size_of::<win32::NOTIFYICONDATAW>() as u32;
        nid.h_wnd = hwnd;
        nid.u_id = 1;
        nid.u_flags = win32::NIF_MESSAGE | win32::NIF_ICON | win32::NIF_TIP;
        nid.u_callback_message = win32::WM_TRAYICON;
        nid.h_icon = hicon;
        let tip: Vec<u16> = app_title.encode_utf16().take(120).collect();
        for (i, &c) in tip.iter().enumerate() {
            nid.sz_tip[i] = c;
        }
        let _ = win32::Shell_NotifyIconW(win32::NIM_ADD, &mut nid);

        let mut msg: win32::MSG = std::mem::zeroed();
        while win32::GetMessageW(&mut msg, 0, 0, 0) > 0 {
            let _ = win32::TranslateMessage(&msg);
            let _ = win32::DispatchMessageW(&msg);
        }

        let _ = win32::Shell_NotifyIconW(win32::NIM_DELETE, &mut nid);
    });
}

#[cfg(target_os = "windows")]
fn remove_system_tray_icon() {
    unsafe {
        let tray_h = TRAY_HWND.load(Ordering::Relaxed);
        if tray_h != 0 {
            let mut nid: win32::NOTIFYICONDATAW = std::mem::zeroed();
            nid.cb_size = std::mem::size_of::<win32::NOTIFYICONDATAW>() as u32;
            nid.h_wnd = tray_h;
            nid.u_id = 1;
            let _ = win32::Shell_NotifyIconW(win32::NIM_DELETE, &mut nid);
        }
    }
}

// Checks Windows System Focus Assist / Quiet Hours / Do Not Disturb state via SHQueryUserNotificationState
fn is_windows_system_dnd_active() -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        let mut state: i32 = 5;
        if win32::SHQueryUserNotificationState(&mut state) == 0 {
            // Note: Windows returns QUNS_BUSY (2) whenever ANY maximized or frameless window is on screen!
            // Only QUNS_PRESENTATION_MODE (4) and QUNS_QUIET_TIME (6) represent true system Do Not Disturb / Quiet Hours.
            if matches!(state, 4 | 6) {
                return true;
            }
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    false
}

fn write_runtime_install_metadata(cfg: &AppConfig) {
    let root = get_app_data_root();
    let meta_path = root.join("install_metadata.json");
    let meta_json = serde_json::json!({
        "package_name": "DisLite Rust",
        "version": FULL_SEMVER,
        "short_version": APP_VERSION,
        "installer_version": INSTALLER_VERSION,
        "quest_engine_version": "0.6.6-rust",
        "quest_completer_installed": cfg.quest_completer_installed,
        "vencord_installed": cfg.vencord_installed,
        "app_user_model_id": EXPLICIT_APP_USER_MODEL_ID,
        "channel": "stable"
    });
    if let Ok(pretty) = serde_json::to_string_pretty(&meta_json) {
        let _ = fs::write(meta_path, pretty);
    }
}

fn load_config() -> AppConfig {
    let root = get_app_data_root();
    let path = root.join("config.json");
    let meta_path = root.join("install_metadata.json");

    let mut meta_quests_installed: Option<bool> = None;
    let mut meta_vencord_installed: Option<bool> = None;
    if meta_path.exists() {
        if let Ok(mtext) = fs::read_to_string(&meta_path) {
            if let Ok(mv) = serde_json::from_str::<serde_json::Value>(&mtext) {
                meta_quests_installed = mv.get("quest_completer_installed").and_then(|x| x.as_bool());
                meta_vencord_installed = mv.get("vencord_installed").and_then(|x| x.as_bool());
            }
        }
    }

    if path.exists() {
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(mut cfg) = serde_json::from_str::<AppConfig>(&text) {
                if is_reserved_discord_name(&cfg.custom_app_name) {
                    cfg.custom_app_name = DEFAULT_APP_NAME.to_string();
                }
                if cfg.config_version < 41 {
                    cfg.vencord_enabled = false;
                }
                if cfg.config_version < 46 {
                    cfg.reduce_motion_enabled = false;
                }
                if cfg.saved_window_width < 720 {
                    cfg.saved_window_width = 1280;
                }
                if cfg.saved_window_height < 480 {
                    cfg.saved_window_height = 800;
                }
                cfg.config_version = 50;
                cfg.app_version = FULL_SEMVER.to_string();
                cfg.installer_version = INSTALLER_VERSION.to_string();
                cfg.session_launch_prompt_shown = false;
                cfg.quest_engine_version = "0.6.6-rust".to_string();
                if let Some(qi) = meta_quests_installed {
                    cfg.quest_completer_installed = qi;
                    if !qi {
                        cfg.quest_helper_enabled = false;
                        cfg.quest_only_mode_active = false;
                    }
                }
                if let Some(vi) = meta_vencord_installed {
                    cfg.vencord_installed = vi;
                    if !vi {
                        cfg.vencord_enabled = false;
                    }
                }
                if cfg.startup_launch_mode.eq_ignore_ascii_case("Discord") {
                    cfg.quest_only_mode_active = false;
                } else if cfg.startup_launch_mode.eq_ignore_ascii_case("QuestOnly") && cfg.quest_completer_installed {
                    cfg.quest_only_mode_active = true;
                }
                return cfg;
            }
        }
    }

    let mut default_cfg = AppConfig::default();
    if let Some(qi) = meta_quests_installed {
        default_cfg.quest_completer_installed = qi;
        if !qi {
            default_cfg.quest_helper_enabled = false;
            default_cfg.quest_only_mode_active = false;
            default_cfg.startup_launch_mode = "Discord".to_string();
        }
    }
    if let Some(vi) = meta_vencord_installed {
        default_cfg.vencord_installed = vi;
    }

    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        for prev_folder in ["LiteCord10Stable", "LiteCordBuild3"] {
            let prev_cfg_path = PathBuf::from(&local_app_data).join(prev_folder).join("config.json");
            if prev_cfg_path.exists() {
                if let Ok(text) = fs::read_to_string(&prev_cfg_path) {
                    if let Ok(prev_cfg) = serde_json::from_str::<AppConfig>(&text) {
                        if !prev_cfg.saved_accounts.is_empty() {
                            default_cfg.saved_accounts = prev_cfg.saved_accounts;
                            break;
                        }
                    }
                }
            }
        }
    }
    save_config(&default_cfg);
    default_cfg
}

fn save_config(cfg: &AppConfig) {
    let path = get_app_data_root().join("config.json");
    if let Ok(json) = serde_json::to_string_pretty(cfg) {
        let _ = fs::write(path, json);
    }
}

fn load_storage_mirror_json() -> String {
    let root = get_app_data_root();
    let path = root.join("discord_storage_mirror.json");
    if path.exists() {
        if let Ok(text) = fs::read_to_string(&path) {
            if !text.trim().is_empty() {
                return text;
            }
        }
    }
    "{}".to_string()
}

fn save_storage_mirror_json(raw_json: &str) {
    let path = get_app_data_root().join("discord_storage_mirror.json");
    let _ = fs::write(path, raw_json);
}

#[cfg(target_os = "windows")]
unsafe fn write_hkcu_reg_sz(hkey: isize, val_name: &str, val_data: &str) {
    let mut wn: Vec<u16> = val_name.encode_utf16().collect();
    wn.push(0);
    let mut wd: Vec<u16> = val_data.encode_utf16().collect();
    wd.push(0);
    let _ = win32::RegSetValueExW(
        hkey,
        wn.as_ptr(),
        0,
        win32::REG_SZ,
        wd.as_ptr() as *const u8,
        (wd.len() * 2) as u32,
    );
}

#[cfg(target_os = "windows")]
unsafe fn write_hkcu_reg_dword(hkey: isize, val_name: &str, val_dword: u32) {
    let mut wn: Vec<u16> = val_name.encode_utf16().collect();
    wn.push(0);
    let bytes = val_dword.to_le_bytes();
    let _ = win32::RegSetValueExW(
        hkey,
        wn.as_ptr(),
        0,
        win32::REG_DWORD,
        bytes.as_ptr(),
        4,
    );
}

#[cfg(target_os = "windows")]
unsafe fn open_or_create_hkcu_key(subkey: &str) -> isize {
    let mut wide_subkey: Vec<u16> = subkey.encode_utf16().collect();
    wide_subkey.push(0);
    let mut hkey: isize = 0;
    let mut disp: u32 = 0;
    let rc = win32::RegCreateKeyExW(
        win32::HKEY_CURRENT_USER,
        wide_subkey.as_ptr(),
        0,
        std::ptr::null(),
        0,
        win32::KEY_WRITE,
        std::ptr::null(),
        &mut hkey,
        &mut disp,
    );
    if rc == 0 { hkey } else { 0 }
}

fn preseed_webview2_media_permissions() {
    let root = get_app_data_root();
    let default_dir = root.join("DisLiteRust.exe.WebView2").join("EBWebView").join("Default");
    let alt_dir = root.join("EBWebView").join("Default");
    for dir in [default_dir, alt_dir] {
        let _ = fs::create_dir_all(&dir);
        let pref_path = dir.join("Preferences");
        let mut pref_val: serde_json::Value = if pref_path.exists() {
            fs::read_to_string(&pref_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_else(|| serde_json::json!({}))
        } else {
            serde_json::json!({})
        };
        if let Some(obj) = pref_val.as_object_mut() {
            let profile = obj.entry("profile").or_insert_with(|| serde_json::json!({}));
            if let Some(p_obj) = profile.as_object_mut() {
                let cs = p_obj.entry("content_settings").or_insert_with(|| serde_json::json!({}));
                if let Some(cs_obj) = cs.as_object_mut() {
                    let exc = cs_obj.entry("exceptions").or_insert_with(|| serde_json::json!({}));
                    if let Some(exc_obj) = exc.as_object_mut() {
                        for perm_key in ["media_stream_mic", "media_stream_camera", "notifications"] {
                            let p_map = exc_obj.entry(perm_key).or_insert_with(|| serde_json::json!({}));
                            if let Some(pm) = p_map.as_object_mut() {
                                for origin in ["https://discord.com:443,*", "https://canary.discord.com:443,*", "https://ptb.discord.com:443,*"] {
                                    pm.insert(origin.to_string(), serde_json::json!({ "setting": 1, "last_modified": "13380000000000000" }));
                                }
                            }
                        }
                    }
                }
            }
        }
        if let Ok(serialized) = serde_json::to_string(&pref_val) {
            let _ = fs::write(&pref_path, serialized);
        }
    }
}

fn register_aumid_in_hkcu_registry(display_name: &str, icon_path: &Path) {
    preseed_webview2_media_permissions();
    #[cfg(target_os = "windows")]
    unsafe {
        // 1. Register AppUserModelId for Windows 10/11 Notification Center
        let aumid_key = format!("Software\\Classes\\AppUserModelId\\{}", EXPLICIT_APP_USER_MODEL_ID);
        let hk_aumid = open_or_create_hkcu_key(&aumid_key);
        if hk_aumid != 0 {
            write_hkcu_reg_sz(hk_aumid, "DisplayName", display_name);
            write_hkcu_reg_sz(hk_aumid, "IconUri", &icon_path.display().to_string());
            write_hkcu_reg_sz(hk_aumid, "IconBackgroundColor", "FF1E1F22");
            let _ = win32::RegCloseKey(hk_aumid);
        }

        // 2. Register in Windows "Installed Apps" / "Apps & Features" (HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DisLiteRust)
        let root_dir = get_app_data_root();
        let exe_path = env::current_exe().unwrap_or_else(|_| root_dir.join("DisLiteRust.exe"));
        let uninstall_key = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DisLiteRust";
        let hk_uninst = open_or_create_hkcu_key(uninstall_key);
        if hk_uninst != 0 {
            write_hkcu_reg_sz(hk_uninst, "DisplayName", display_name);
            write_hkcu_reg_sz(hk_uninst, "DisplayVersion", APP_VERSION);
            write_hkcu_reg_sz(hk_uninst, "Publisher", "DisLite Project");
            write_hkcu_reg_sz(hk_uninst, "DisplayIcon", &format!("{},0", icon_path.display()));
            write_hkcu_reg_sz(hk_uninst, "InstallLocation", &root_dir.display().to_string());
            write_hkcu_reg_sz(
                hk_uninst,
                "UninstallString",
                &format!("cmd.exe /c taskkill /F /IM DisLiteRust.exe & rmdir /s /q \"{}\"", root_dir.display()),
            );
            write_hkcu_reg_dword(hk_uninst, "NoModify", 1);
            write_hkcu_reg_dword(hk_uninst, "NoRepair", 1);
            write_hkcu_reg_dword(hk_uninst, "EstimatedSize", 18432);
            let _ = win32::RegCloseKey(hk_uninst);
        }

        // 3. Register in Windows Privacy & Security -> Microphone & Camera ConsentStore (NonPackaged desktop apps)
        let escaped_exe = exe_path.display().to_string().replace('\\', "#");
        for cap in ["microphone", "webcam"] {
            let cap_key = format!(
                "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\{}\\NonPackaged\\{}",
                cap, escaped_exe
            );
            let hk_cap = open_or_create_hkcu_key(&cap_key);
            if hk_cap != 0 {
                write_hkcu_reg_sz(hk_cap, "Value", "Allow");
                let _ = win32::RegCloseKey(hk_cap);
            }
        }
    }
}

fn terminate_stale_dislite_instances() {
    #[cfg(target_os = "windows")]
    unsafe {
        let my_pid = win32::GetCurrentProcessId();
        let snap = win32::CreateToolhelp32Snapshot(win32::TH32CS_SNAPPROCESS, 0);
        if snap.is_null() || (snap as isize) == -1 {
            return;
        }
        let mut pe: win32::PROCESSENTRY32W = std::mem::zeroed();
        pe.dw_size = std::mem::size_of::<win32::PROCESSENTRY32W>() as u32;
        if win32::Process32FirstW(snap, &mut pe) != 0 {
            loop {
                let pid = pe.th32_process_id;
                if pid != 0 && pid != my_pid {
                    let len = pe.sz_exe_file.iter().position(|&c| c == 0).unwrap_or(0);
                    let exe_name = String::from_utf16_lossy(&pe.sz_exe_file[..len]).to_ascii_lowercase();
                    if exe_name == "disliterust.exe" || exe_name == "dislite_rust.exe" || exe_name == "litecord_rust.exe" {
                        let hp = win32::OpenProcess(win32::PROCESS_TERMINATE, 0, pid);
                        if !hp.is_null() {
                            let _ = win32::TerminateProcess(hp, 0);
                            let _ = win32::CloseHandle(hp);
                        }
                    }
                }
                if win32::Process32NextW(snap, &mut pe) == 0 {
                    break;
                }
            }
        }
        let _ = win32::CloseHandle(snap);
    }
}

fn set_explicit_app_user_model_id() {
    #[cfg(target_os = "windows")]
    unsafe {
        let default_png = get_app_data_root().join("dislite.png");
        if !default_png.exists() {
            let _ = fs::write(&default_png, EMBEDDED_ICON_PNG);
        }
        register_aumid_in_hkcu_registry(DEFAULT_APP_NAME, &default_png);
        let mut wide: Vec<u16> = EXPLICIT_APP_USER_MODEL_ID.encode_utf16().collect();
        wide.push(0);
        let _ = win32::SetCurrentProcessExplicitAppUserModelID(wide.as_ptr());
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn enum_hide_screenshare_bar_cb(hwnd: isize, _lparam: isize) -> i32 {
    let main_h = MAIN_HWND.load(Ordering::Relaxed);
    if hwnd == 0 || hwnd == main_h {
        return 1;
    }
    if win32::IsWindowVisible(hwnd) == 0 {
        return 1;
    }

    let mut class_buf = [0u16; 128];
    let class_len = win32::GetClassNameW(hwnd, class_buf.as_mut_ptr(), 127);
    if class_len <= 0 {
        return 1;
    }
    let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);
    if !class_name.starts_with("Chrome_WidgetWin_") {
        return 1;
    }

    let mut title_buf = [0u16; 256];
    let title_len = win32::GetWindowTextW(hwnd, title_buf.as_mut_ptr(), 255);
    let title_lower = if title_len > 0 {
        String::from_utf16_lossy(&title_buf[..title_len as usize]).to_ascii_lowercase()
    } else {
        String::new()
    };

    let mut rect = win32::RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let _ = win32::GetWindowRect(hwnd, &mut rect);
    let w = (rect.right - rect.left).abs();
    let h = (rect.bottom - rect.top).abs();
    let ex_style = win32::GetWindowLongPtrW(hwnd, win32::GWL_EXSTYLE);
    let is_topmost = (ex_style & win32::WS_EX_TOPMOST) != 0;

    let is_sharing_title = title_lower.contains("is sharing your screen")
        || title_lower.contains("is sharing a window")
        || title_lower.contains("is sharing a tab")
        || title_lower.contains("is sharing your")
        || title_lower.contains("screen sharing")
        || title_lower.contains("sharing audio");

    let is_floating_share_banner = is_topmost
        && w > 120
        && w <= 760
        && h >= 24
        && h <= 125
        && (is_sharing_title || title_lower.contains("discord.com"));

    if is_sharing_title || is_floating_share_banner {
        let _ = win32::SetWindowLongPtrW(
            hwnd,
            win32::GWL_EXSTYLE,
            (ex_style | win32::WS_EX_TOOLWINDOW) & !win32::WS_EX_TOPMOST,
        );
        let _ = win32::SetWindowPos(
            hwnd,
            0,
            -32000,
            -32000,
            0,
            0,
            win32::SWP_NOSIZE | win32::SWP_NOZORDER | win32::SWP_NOACTIVATE,
        );
        let _ = win32::ShowWindow(hwnd, win32::SW_HIDE);
    }

    1
}


static AUDIO_LOOPBACK_ACTIVE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[cfg(target_os = "windows")]
unsafe extern "system" fn enum_prepare_picker_windows_cb(hwnd: isize, _lparam: isize) -> i32 {
    let main_h = MAIN_HWND.load(Ordering::Relaxed);
    if hwnd == 0 || hwnd == main_h {
        return 1;
    }
    if win32::IsWindowVisible(hwnd) == 0 {
        return 1;
    }

    let mut class_buf = [0u16; 128];
    let class_len = win32::GetClassNameW(hwnd, class_buf.as_mut_ptr(), 127);
    let class_name = if class_len > 0 {
        String::from_utf16_lossy(&class_buf[..class_len as usize])
    } else {
        String::new()
    };
    let class_lower = class_name.to_ascii_lowercase();

    let ex_style = win32::GetWindowLongPtrW(hwnd, win32::GWL_EXSTYLE);
    const WS_EX_APPWINDOW: isize = 0x00040000;
    const SW_SHOWNOACTIVATE: i32 = 4;
    const HWND_BOTTOM: isize = 1;

    let mut title_buf = [0u16; 256];
    let title_len = win32::GetWindowTextW(hwnd, title_buf.as_mut_ptr(), 255);
    let title_lower = if title_len > 0 {
        String::from_utf16_lossy(&title_buf[..title_len as usize]).to_ascii_lowercase()
    } else {
        String::new()
    };

    let mut rect = win32::RECT { left: 0, top: 0, right: 0, bottom: 0 };
    let _ = win32::GetWindowRect(hwnd, &mut rect);
    let w = (rect.right - rect.left).abs();
    let h = (rect.bottom - rect.top).abs();
    let style = win32::GetWindowLongPtrW(hwnd, -16); // GWL_STYLE

    // 1. Hide Rainmeter widgets, RzMonitorForegroundWindow, Razer background monitors, and small desktop gadgets
    //    by marking them as WS_EX_TOOLWINDOW (Chromium's GetWindowList skips WS_EX_TOOLWINDOW!)
    let is_borderless_layered_gadget = (style & 0x00C00000) == 0
        && ((ex_style & 0x08000000) != 0 || (ex_style & 0x00000020) != 0 || (ex_style & 0x00080000) != 0);

    let is_widget_or_monitor = title_len == 0
        || is_borderless_layered_gadget
        || class_lower.contains("rainmeter")
        || class_lower.contains("meterwindow")
        || class_lower.contains("rzmonitor")
        || class_lower.contains("razer")
        || class_lower == "workerw"
        || class_lower == "progman"
        || class_lower == "syndicate"
        || class_lower == "applicationframewindow" && title_lower.is_empty()
        || class_lower.contains("desktopcapture")
        || title_lower.contains("rzmonitor")
        || title_lower.contains("rainmeter")
        || title_lower.contains("razer")
        || title_lower.contains("synapse")
        || title_lower.contains("nvidia geforce overlay")
        || title_lower.contains("windows input experience")
        || title_lower.contains("program manager")
        || (w > 0 && h > 0 && (w < 260 || h < 180) && win32::IsIconic(hwnd) == 0);

    if is_widget_or_monitor {
        if (ex_style & win32::WS_EX_TOOLWINDOW) == 0 {
            let _ = win32::SetWindowLongPtrW(
                hwnd,
                win32::GWL_EXSTYLE,
                (ex_style | win32::WS_EX_TOOLWINDOW) & !WS_EX_APPWINDOW,
            );
        }
        return 1;
    }

    // 2. Only un-minimize genuine taskbar desktop applications (has WS_SYSMENU 0x80000 & WS_MINIMIZEBOX 0x20000)
    if title_len > 0
        && (ex_style & win32::WS_EX_TOOLWINDOW) == 0
        && (style & 0x00080000) != 0
        && (style & 0x00020000) != 0
        && win32::IsIconic(hwnd) != 0
    {
        let _ = win32::ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        let _ = win32::SetWindowPos(
            hwnd,
            HWND_BOTTOM,
            0,
            0,
            0,
            0,
            win32::SWP_NOMOVE | win32::SWP_NOSIZE | win32::SWP_NOACTIVATE,
        );
    }

    1
}

fn prepare_windows_for_screenshare_picker() {
    #[cfg(target_os = "windows")]
    unsafe {
        let _ = win32::EnumWindows(enum_prepare_picker_windows_cb, 0);
        let mh = resolve_main_hwnd();
        if mh != 0 {
            let _ = win32::SetForegroundWindow(mh);
        }
    }
}

#[cfg(target_os = "windows")]
mod wasapi_hybrid_audio {
    use super::win32::{CoCreateInstance, CoInitializeEx, GUID};
    use std::collections::VecDeque;
    use std::ffi::c_void;
    use std::ptr;
    use std::thread;
    use std::time::Duration;

    pub const CLSCTX_ALL: u32 = 23;
    pub const AUDCLNT_SHAREMODE_SHARED: u32 = 0;
    pub const AUDCLNT_STREAMFLAGS_LOOPBACK: u32 = 0x00020000;
    pub const AUDCLNT_BUFFERFLAGS_SILENT: u32 = 2;

    pub const CLSID_MMDEVICE_ENUMERATOR: GUID = GUID {
        data1: 0xBCDE0395,
        data2: 0xE52F,
        data3: 0x467C,
        data4: [0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E],
    };
    pub const IID_IMMDEVICE_ENUMERATOR: GUID = GUID {
        data1: 0xA95664D2,
        data2: 0x9614,
        data3: 0x4F35,
        data4: [0xA7, 0x46, 0xDE, 0x8D, 0xB6, 0x36, 0x17, 0xE6],
    };
    pub const IID_IAUDIO_METER_INFORMATION: GUID = GUID {
        data1: 0xC02216F6,
        data2: 0x8C67,
        data3: 0x4B5B,
        data4: [0x9D, 0x00, 0xD0, 0x08, 0xE7, 0x3E, 0x00, 0x64],
    };
    pub const CLSID_POLICY_CONFIG_CLIENT: GUID = GUID {
        data1: 0x870AF99C,
        data2: 0x171D,
        data3: 0x4F9E,
        data4: [0xAF, 0x0D, 0xE6, 0x3D, 0xF4, 0x0C, 0x2B, 0xC9],
    };
    pub const IID_IPOLICY_CONFIG_WIN10: GUID = GUID {
        data1: 0xF8679F50,
        data2: 0x850A,
        data3: 0x41CF,
        data4: [0x9C, 0x72, 0x43, 0x0F, 0x29, 0x02, 0x90, 0xC8],
    };
    pub const IID_IPOLICY_CONFIG_VISTA: GUID = GUID {
        data1: 0x568B9108,
        data2: 0x44BF,
        data3: 0x40B4,
        data4: [0x90, 0x06, 0x86, 0xAF, 0xE5, 0xB5, 0xA6, 0x20],
    };
    pub const IID_IAUDIO_CLIENT: GUID = GUID {
        data1: 0x1CB9AD4C,
        data2: 0xDBFA,
        data3: 0x4C32,
        data4: [0xB1, 0x78, 0xC2, 0xF5, 0x68, 0xA7, 0x03, 0xB2],
    };
    pub const IID_IAUDIO_CAPTURE_CLIENT: GUID = GUID {
        data1: 0xC8ADBD64,
        data2: 0xE71E,
        data3: 0x48A0,
        data4: [0xA4, 0xDE, 0x18, 0x5C, 0x39, 0x5C, 0xD3, 0x17],
    };

    #[repr(C)]
    pub struct IMMDeviceEnumeratorVtbl {
        pub query_interface: usize,
        pub add_ref: usize,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub enum_audio_endpoints: unsafe extern "system" fn(*mut c_void, u32, u32, *mut *mut c_void) -> i32,
        pub get_default_audio_endpoint: unsafe extern "system" fn(*mut c_void, u32, u32, *mut *mut c_void) -> i32,
    }
    #[repr(C)]
    pub struct IMMDeviceEnumerator {
        pub lp_vtbl: *const IMMDeviceEnumeratorVtbl,
    }

    #[repr(C)]
    pub struct IMMDeviceCollectionVtbl {
        pub query_interface: usize,
        pub add_ref: usize,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub get_count: unsafe extern "system" fn(*mut c_void, *mut u32) -> i32,
        pub item: unsafe extern "system" fn(*mut c_void, u32, *mut *mut c_void) -> i32,
    }
    #[repr(C)]
    pub struct IMMDeviceCollection {
        pub lp_vtbl: *const IMMDeviceCollectionVtbl,
    }

    #[repr(C)]
    pub struct IMMDeviceVtbl {
        pub query_interface: usize,
        pub add_ref: usize,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub activate: unsafe extern "system" fn(*mut c_void, *const GUID, u32, *const c_void, *mut *mut c_void) -> i32,
        pub open_property_store: usize,
        pub get_id: unsafe extern "system" fn(*mut c_void, *mut *mut u16) -> i32,
        pub get_state: usize,
    }
    #[repr(C)]
    pub struct IMMDevice {
        pub lp_vtbl: *const IMMDeviceVtbl,
    }

    #[repr(C)]
    pub struct IAudioMeterInformationVtbl {
        pub query_interface: usize,
        pub add_ref: usize,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub get_peak_value: unsafe extern "system" fn(*mut c_void, *mut f32) -> i32,
    }
    #[repr(C)]
    pub struct IAudioMeterInformation {
        pub lp_vtbl: *const IAudioMeterInformationVtbl,
    }

    #[repr(C)]
    pub struct IPolicyConfigVtbl {
        pub query_interface: usize,
        pub add_ref: usize,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub get_mix_format: usize,
        pub get_device_format: usize,
        pub reset_device_format: usize,
        pub set_device_format: usize,
        pub get_processing_period: usize,
        pub set_processing_period: usize,
        pub get_share_mode: usize,
        pub set_share_mode: usize,
        pub get_property_value: usize,
        pub set_property_value: usize,
        pub set_default_endpoint: unsafe extern "system" fn(*mut c_void, *const u16, u32) -> i32,
    }
    #[repr(C)]
    pub struct IPolicyConfig {
        pub lp_vtbl: *const IPolicyConfigVtbl,
    }

    #[repr(C)]
    pub struct IAudioClientVtbl {
        pub query_interface: usize,
        pub add_ref: usize,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub initialize: unsafe extern "system" fn(*mut c_void, u32, u32, i64, i64, *const u8, *const c_void) -> i32,
        pub get_buffer_size: usize,
        pub get_stream_latency: usize,
        pub get_current_padding: usize,
        pub is_format_supported: usize,
        pub get_mix_format: unsafe extern "system" fn(*mut c_void, *mut *mut u8) -> i32,
        pub get_device_period: usize,
        pub start: unsafe extern "system" fn(*mut c_void) -> i32,
        pub stop: unsafe extern "system" fn(*mut c_void) -> i32,
        pub reset: usize,
        pub set_event_handle: usize,
        pub get_service: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
    }
    #[repr(C)]
    pub struct IAudioClient {
        pub lp_vtbl: *const IAudioClientVtbl,
    }

    #[repr(C)]
    pub struct IAudioCaptureClientVtbl {
        pub query_interface: usize,
        pub add_ref: usize,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub get_buffer: unsafe extern "system" fn(*mut c_void, *mut *mut u8, *mut u32, *mut u32, *mut u64, *mut u64) -> i32,
        pub release_buffer: unsafe extern "system" fn(*mut c_void, u32) -> i32,
        pub get_next_packet_size: unsafe extern "system" fn(*mut c_void, *mut u32) -> i32,
    }
    #[repr(C)]
    pub struct IAudioCaptureClient {
        pub lp_vtbl: *const IAudioCaptureClientVtbl,
    }

    unsafe fn get_device_peak(dev_ptr: *mut c_void) -> f32 {
        if dev_ptr.is_null() {
            return 0.0;
        }
        let dev = &*(dev_ptr as *mut IMMDevice);
        let mut meter_ptr: *mut c_void = ptr::null_mut();
        if ((*dev.lp_vtbl).activate)(
            dev_ptr,
            &IID_IAUDIO_METER_INFORMATION,
            CLSCTX_ALL,
            ptr::null(),
            &mut meter_ptr,
        ) < 0
            || meter_ptr.is_null()
        {
            return 0.0;
        }
        let meter = &*(meter_ptr as *mut IAudioMeterInformation);
        let mut max_peak: f32 = 0.0;
        for _ in 0..3 {
            let mut p: f32 = 0.0;
            if ((*meter.lp_vtbl).get_peak_value)(meter_ptr, &mut p) >= 0 && p > max_peak {
                max_peak = p;
            }
            thread::sleep(Duration::from_millis(6));
        }
        ((*meter.lp_vtbl).release)(meter_ptr);
        max_peak
    }

    unsafe fn set_all_roles_to_device_id(dev_id_ptr: *const u16) {
        if dev_id_ptr.is_null() {
            return;
        }
        for iid in [&IID_IPOLICY_CONFIG_WIN10, &IID_IPOLICY_CONFIG_VISTA] {
            let mut pc_ptr: *mut c_void = ptr::null_mut();
            if CoCreateInstance(
                &CLSID_POLICY_CONFIG_CLIENT,
                ptr::null_mut(),
                CLSCTX_ALL,
                iid,
                &mut pc_ptr,
            ) >= 0
                && !pc_ptr.is_null()
            {
                let pc = &*(pc_ptr as *mut IPolicyConfig);
                let _ = ((*pc.lp_vtbl).set_default_endpoint)(pc_ptr, dev_id_ptr, 0);
                let _ = ((*pc.lp_vtbl).set_default_endpoint)(pc_ptr, dev_id_ptr, 1);
                let _ = ((*pc.lp_vtbl).set_default_endpoint)(pc_ptr, dev_id_ptr, 2);
                ((*pc.lp_vtbl).release)(pc_ptr);
                break;
            }
        }
    }

    pub unsafe fn unify_active_windows_output_endpoints() {
        let _ = CoInitializeEx(ptr::null(), 0);
        let mut enum_ptr: *mut c_void = ptr::null_mut();
        if CoCreateInstance(
            &CLSID_MMDEVICE_ENUMERATOR,
            ptr::null_mut(),
            CLSCTX_ALL,
            &IID_IMMDEVICE_ENUMERATOR,
            &mut enum_ptr,
        ) < 0
            || enum_ptr.is_null()
        {
            return;
        }
        let enumerator = &*(enum_ptr as *mut IMMDeviceEnumerator);

        let mut best_dev_ptr: *mut c_void = ptr::null_mut();
        let mut best_peak: f32 = 0.0005;

        let mut coll_ptr: *mut c_void = ptr::null_mut();
        if ((*enumerator.lp_vtbl).enum_audio_endpoints)(enum_ptr, 0, 1, &mut coll_ptr) >= 0
            && !coll_ptr.is_null()
        {
            let coll = &*(coll_ptr as *mut IMMDeviceCollection);
            let mut count: u32 = 0;
            if ((*coll.lp_vtbl).get_count)(coll_ptr, &mut count) >= 0 {
                for idx in 0..count {
                    let mut dev_ptr: *mut c_void = ptr::null_mut();
                    if ((*coll.lp_vtbl).item)(coll_ptr, idx, &mut dev_ptr) >= 0 && !dev_ptr.is_null() {
                        let pk = get_device_peak(dev_ptr);
                        if pk > best_peak {
                            if !best_dev_ptr.is_null() {
                                let old_d = &*(best_dev_ptr as *mut IMMDevice);
                                ((*old_d.lp_vtbl).release)(best_dev_ptr);
                            }
                            best_peak = pk;
                            best_dev_ptr = dev_ptr;
                        } else {
                            let d = &*(dev_ptr as *mut IMMDevice);
                            ((*d.lp_vtbl).release)(dev_ptr);
                        }
                    }
                }
            }
            ((*coll.lp_vtbl).release)(coll_ptr);
        }

        if best_dev_ptr.is_null() {
            let mut def_console: *mut c_void = ptr::null_mut();
            if ((*enumerator.lp_vtbl).get_default_audio_endpoint)(enum_ptr, 0, 0, &mut def_console) >= 0
                && !def_console.is_null()
            {
                best_dev_ptr = def_console;
            }
        }

        if !best_dev_ptr.is_null() {
            let best_dev = &*(best_dev_ptr as *mut IMMDevice);
            let mut id_ptr: *mut u16 = ptr::null_mut();
            if ((*best_dev.lp_vtbl).get_id)(best_dev_ptr, &mut id_ptr) >= 0 && !id_ptr.is_null() {
                set_all_roles_to_device_id(id_ptr);
            }
            ((*best_dev.lp_vtbl).release)(best_dev_ptr);
        }

        ((*enumerator.lp_vtbl).release)(enum_ptr);
    }

    pub struct EndpointLoopbackCapturer {
        pub audio_client: *mut c_void,
        pub capture_client: *mut c_void,
        pub channels: usize,
        pub sample_rate: u32,
        pub block_align: usize,
        pub bits_per_sample: u16,
        pub is_float: bool,
        pub resample_accum: f64,
        pub sample_fifo: VecDeque<i16>,
    }

    impl EndpointLoopbackCapturer {
        pub unsafe fn from_device(dev_ptr: *mut c_void) -> Option<Self> {
            if dev_ptr.is_null() {
                return None;
            }
            let dev = &*(dev_ptr as *mut IMMDevice);
            let mut client_ptr: *mut c_void = ptr::null_mut();
            if ((*dev.lp_vtbl).activate)(
                dev_ptr,
                &IID_IAUDIO_CLIENT,
                CLSCTX_ALL,
                ptr::null(),
                &mut client_ptr,
            ) < 0
                || client_ptr.is_null()
            {
                return None;
            }
            let client = &*(client_ptr as *mut IAudioClient);

            let pcm48k_fmt: [u8; 18] = [
                1, 0,             // wFormatTag = WAVE_FORMAT_PCM (1)
                2, 0,             // nChannels = 2
                0x80, 0xBB, 0, 0, // nSamplesPerSec = 48000
                0x00, 0xEE, 2, 0, // nAvgBytesPerSec = 192000
                4, 0,             // nBlockAlign = 4
                16, 0,            // wBitsPerSample = 16
                0, 0,             // cbSize = 0
            ];
            if ((*client.lp_vtbl).initialize)(
                client_ptr,
                AUDCLNT_SHAREMODE_SHARED,
                0x88020000,
                2_500_000,
                0,
                pcm48k_fmt.as_ptr(),
                ptr::null(),
            ) >= 0
            {
                let mut cap_ptr: *mut c_void = ptr::null_mut();
                if ((*client.lp_vtbl).get_service)(
                    client_ptr,
                    &IID_IAUDIO_CAPTURE_CLIENT,
                    &mut cap_ptr,
                ) >= 0
                    && !cap_ptr.is_null()
                {
                    if ((*client.lp_vtbl).start)(client_ptr) >= 0 {
                        return Some(Self {
                            audio_client: client_ptr,
                            capture_client: cap_ptr,
                            channels: 2,
                            sample_rate: 48000,
                            block_align: 4,
                            bits_per_sample: 16,
                            is_float: false,
                            resample_accum: 0.0,
                            sample_fifo: VecDeque::with_capacity(24000),
                        });
                    }
                    let cap = &*(cap_ptr as *mut IAudioCaptureClient);
                    ((*cap.lp_vtbl).release)(cap_ptr);
                }
            }

            let mut mix_fmt_ptr: *mut u8 = ptr::null_mut();
            if ((*client.lp_vtbl).get_mix_format)(client_ptr, &mut mix_fmt_ptr) < 0 || mix_fmt_ptr.is_null() {
                ((*client.lp_vtbl).release)(client_ptr);
                return None;
            }

            let hdr = std::slice::from_raw_parts(mix_fmt_ptr, 18);
            let format_tag = u16::from_le_bytes([hdr[0], hdr[1]]);
            let channels = (u16::from_le_bytes([hdr[2], hdr[3]]) as usize).max(1);
            let sample_rate = u32::from_le_bytes([hdr[4], hdr[5], hdr[6], hdr[7]]).max(8000);
            let block_align = (u16::from_le_bytes([hdr[12], hdr[13]]) as usize).max(2);
            let bits_per_sample = u16::from_le_bytes([hdr[14], hdr[15]]);
            let cb_size = u16::from_le_bytes([hdr[16], hdr[17]]);

            let is_float = if format_tag == 3 {
                true
            } else if format_tag == 0xFFFE && cb_size >= 22 {
                let ext = std::slice::from_raw_parts(mix_fmt_ptr, 40);
                let sub_d1 = u32::from_le_bytes([ext[24], ext[25], ext[26], ext[27]]);
                sub_d1 == 3
            } else {
                bits_per_sample == 32
            };

            if ((*client.lp_vtbl).initialize)(
                client_ptr,
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                5_000_000,
                0,
                mix_fmt_ptr,
                ptr::null(),
            ) < 0
            {
                ((*client.lp_vtbl).release)(client_ptr);
                return None;
            }

            let mut cap_ptr: *mut c_void = ptr::null_mut();
            if ((*client.lp_vtbl).get_service)(
                client_ptr,
                &IID_IAUDIO_CAPTURE_CLIENT,
                &mut cap_ptr,
            ) < 0
                || cap_ptr.is_null()
            {
                ((*client.lp_vtbl).release)(client_ptr);
                return None;
            }

            if ((*client.lp_vtbl).start)(client_ptr) < 0 {
                let cap = &*(cap_ptr as *mut IAudioCaptureClient);
                ((*cap.lp_vtbl).release)(cap_ptr);
                ((*client.lp_vtbl).release)(client_ptr);
                return None;
            }

            Some(Self {
                audio_client: client_ptr,
                capture_client: cap_ptr,
                channels,
                sample_rate,
                block_align,
                bits_per_sample,
                is_float,
                resample_accum: 0.0,
                sample_fifo: VecDeque::with_capacity(19200),
            })
        }

        pub unsafe fn drain_packets(&mut self) -> bool {
            if self.capture_client.is_null() {
                return false;
            }
            let cap = &*(self.capture_client as *mut IAudioCaptureClient);
            let mut safety_guard: i32 = 250;
            while safety_guard > 0 {
                safety_guard -= 1;
                let mut packet_len: u32 = 0;
                let hr_next = ((*cap.lp_vtbl).get_next_packet_size)(self.capture_client, &mut packet_len);
                if hr_next < 0 {
                    return false;
                }
                if packet_len == 0 {
                    break;
                }
                let mut data_ptr: *mut u8 = ptr::null_mut();
                let mut frames_to_read: u32 = 0;
                let mut flags: u32 = 0;
                let mut dev_pos: u64 = 0;
                let mut qpc_pos: u64 = 0;
                let hr_buf = ((*cap.lp_vtbl).get_buffer)(
                    self.capture_client,
                    &mut data_ptr,
                    &mut frames_to_read,
                    &mut flags,
                    &mut dev_pos,
                    &mut qpc_pos,
                );
                if hr_buf < 0 {
                    return false;
                }
                if frames_to_read == 0 {
                    break;
                }
                if frames_to_read > 0 && !data_ptr.is_null() && (flags & AUDCLNT_BUFFERFLAGS_SILENT) == 0 {
                    let ratio = 48000.0 / (self.sample_rate as f64);
                    for f in 0..(frames_to_read as usize) {
                        let f_ptr = data_ptr.add(f * self.block_align);
                        let (mut l_f32, mut r_f32) = if self.is_float && self.bits_per_sample == 32 {
                            let s0 = ptr::read_unaligned(f_ptr as *const f32);
                            let s1 = if self.channels >= 2 {
                                ptr::read_unaligned((f_ptr as *const f32).add(1))
                            } else {
                                s0
                            };
                            let mut l = if s0.is_finite() { s0 } else { 0.0 };
                            let mut r = if s1.is_finite() { s1 } else { 0.0 };
                            if self.channels >= 6 {
                                let c = ptr::read_unaligned((f_ptr as *const f32).add(2));
                                let bl = ptr::read_unaligned((f_ptr as *const f32).add(4));
                                let br = ptr::read_unaligned((f_ptr as *const f32).add(5));
                                if c.is_finite() {
                                    l += c * 0.7071;
                                    r += c * 0.7071;
                                }
                                if bl.is_finite() {
                                    l += bl * 0.7071;
                                }
                                if br.is_finite() {
                                    r += br * 0.7071;
                                }
                            }
                            (l, r)
                        } else if self.bits_per_sample == 16 {
                            let s0 = ptr::read_unaligned(f_ptr as *const i16) as f32 / 32768.0;
                            let s1 = if self.channels >= 2 {
                                ptr::read_unaligned((f_ptr as *const i16).add(1)) as f32 / 32768.0
                            } else {
                                s0
                            };
                            (s0, s1)
                        } else if self.bits_per_sample == 32 {
                            let s0 = (ptr::read_unaligned(f_ptr as *const i32) as f64 / 2147483648.0) as f32;
                            let s1 = if self.channels >= 2 {
                                (ptr::read_unaligned((f_ptr as *const i32).add(1)) as f64 / 2147483648.0) as f32
                            } else {
                                s0
                            };
                            (s0, s1)
                        } else {
                            (0.0, 0.0)
                        };

                        l_f32 = l_f32.clamp(-1.0, 1.0);
                        r_f32 = r_f32.clamp(-1.0, 1.0);
                        let l_i16 = (l_f32 * 32767.0) as i16;
                        let r_i16 = (r_f32 * 32767.0) as i16;

                        self.resample_accum += ratio;
                        while self.resample_accum >= 1.0 {
                            self.resample_accum -= 1.0;
                            if self.sample_fifo.len() >= 24000 {
                                self.sample_fifo.pop_front();
                                self.sample_fifo.pop_front();
                            }
                            self.sample_fifo.push_back(l_i16);
                            self.sample_fifo.push_back(r_i16);
                        }
                    }
                }
                let _ = ((*cap.lp_vtbl).release_buffer)(self.capture_client, frames_to_read);
            }
            true
        }

        pub unsafe fn cleanup(&mut self) {
            if !self.capture_client.is_null() {
                let cap = &*(self.capture_client as *mut IAudioCaptureClient);
                ((*cap.lp_vtbl).release)(self.capture_client);
                self.capture_client = ptr::null_mut();
            }
            if !self.audio_client.is_null() {
                let client = &*(self.audio_client as *mut IAudioClient);
                let _ = ((*client.lp_vtbl).stop)(self.audio_client);
                ((*client.lp_vtbl).release)(self.audio_client);
                self.audio_client = ptr::null_mut();
            }
        }
    }

    #[repr(C)]
    pub struct AudioClientActivationParams {
        pub activation_type: u32,       // 1 = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
        pub target_process_id: u32,     // targetPid
        pub process_loopback_mode: u32, // 0 = INCLUDE_TARGET_PROCESS_TREE, 1 = EXCLUDE_TARGET_PROCESS_TREE
    }

    #[repr(C)]
    pub struct PropVariantBlob {
        pub vt: u16,          // 65 = VT_BLOB
        pub w_reserved1: u16,
        pub w_reserved2: u16,
        pub w_reserved3: u16,
        pub cb_size: u32,     // 12
        pub _pad: u32,
        pub p_blob_data: *const AudioClientActivationParams,
    }

    #[repr(C)]
    pub struct IActivateAudioInterfaceAsyncOperationVtbl {
        pub query_interface: usize,
        pub add_ref: usize,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub get_activate_result: unsafe extern "system" fn(*mut c_void, *mut i32, *mut *mut c_void) -> i32,
    }

    #[repr(C)]
    pub struct IActivateAudioInterfaceAsyncOperation {
        pub lp_vtbl: *const IActivateAudioInterfaceAsyncOperationVtbl,
    }

    #[repr(C)]
    pub struct IActivateAudioInterfaceCompletionHandlerVtbl {
        pub query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
        pub add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub activate_completed: unsafe extern "system" fn(*mut c_void, *mut c_void) -> i32,
    }

    #[repr(C)]
    pub struct CompletionHandlerComObject {
        pub lp_vtbl: *const IActivateAudioInterfaceCompletionHandlerVtbl,
        pub ref_count: std::sync::atomic::AtomicU32,
        pub done_flag: std::sync::atomic::AtomicBool,
        pub hr_result: std::sync::atomic::AtomicI32,
        pub activated_client: std::sync::atomic::AtomicPtr<c_void>,
    }

    pub const IID_IUNKNOWN: GUID = GUID {
        data1: 0x00000000,
        data2: 0x0000,
        data3: 0x0000,
        data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
    };
    pub const IID_IACTIVATE_COMPLETION_HANDLER: GUID = GUID {
        data1: 0x41D949AB,
        data2: 0x9862,
        data3: 0x444A,
        data4: [0x80, 0xF6, 0xC2, 0x61, 0x33, 0x4D, 0xA5, 0xEB],
    };
    pub const IID_IAGILE_OBJECT: GUID = GUID {
        data1: 0x94EA2B94,
        data2: 0xE9CC,
        data3: 0x49E0,
        data4: [0xC0, 0xFF, 0xEE, 0x64, 0xCA, 0x8F, 0x5B, 0x90],
    };

    unsafe fn guid_eq(a: &GUID, b: &GUID) -> bool {
        a.data1 == b.data1 && a.data2 == b.data2 && a.data3 == b.data3 && a.data4 == b.data4
    }

    unsafe extern "system" fn ch_query_interface(this: *mut c_void, riid: *const GUID, ppv: *mut *mut c_void) -> i32 {
        if ppv.is_null() || riid.is_null() {
            return -2147467261;
        }
        let g = &*riid;
        if guid_eq(g, &IID_IUNKNOWN) || guid_eq(g, &IID_IACTIVATE_COMPLETION_HANDLER) || guid_eq(g, &IID_IAGILE_OBJECT) {
            *ppv = this;
            ch_add_ref(this);
            0
        } else {
            *ppv = ptr::null_mut();
            -2147467262
        }
    }

    unsafe extern "system" fn ch_add_ref(this: *mut c_void) -> u32 {
        let obj = &*(this as *mut CompletionHandlerComObject);
        obj.ref_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1
    }

    unsafe extern "system" fn ch_release(this: *mut c_void) -> u32 {
        let obj = &*(this as *mut CompletionHandlerComObject);
        let prev = obj.ref_count.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
        let rem = prev.saturating_sub(1);
        if rem == 0 {
            let _ = Box::from_raw(this as *mut CompletionHandlerComObject);
        }
        rem
    }

    unsafe extern "system" fn ch_activate_completed(this: *mut c_void, op_ptr: *mut c_void) -> i32 {
        let obj = &*(this as *mut CompletionHandlerComObject);
        if !op_ptr.is_null() {
            let op = &*(op_ptr as *mut IActivateAudioInterfaceAsyncOperation);
            let mut hr_act: i32 = -1;
            let mut unk_ptr: *mut c_void = ptr::null_mut();
            let _ = ((*op.lp_vtbl).get_activate_result)(op_ptr, &mut hr_act, &mut unk_ptr);
            obj.hr_result.store(hr_act, std::sync::atomic::Ordering::SeqCst);
            obj.activated_client.store(unk_ptr, std::sync::atomic::Ordering::SeqCst);
        }
        obj.done_flag.store(true, std::sync::atomic::Ordering::SeqCst);
        0
    }

    static CH_VTBL: IActivateAudioInterfaceCompletionHandlerVtbl = IActivateAudioInterfaceCompletionHandlerVtbl {
        query_interface: ch_query_interface,
        add_ref: ch_add_ref,
        release: ch_release,
        activate_completed: ch_activate_completed,
    };

    type ActivateAudioInterfaceAsyncFn = unsafe extern "system" fn(
        *const u16,
        *const GUID,
        *const PropVariantBlob,
        *mut c_void,
        *mut *mut c_void,
    ) -> i32;

    unsafe fn call_activate_audio_interface_async(
        device_interface_path: *const u16,
        riid: *const GUID,
        activation_params: *const PropVariantBlob,
        completion_handler: *mut c_void,
        activation_operation: *mut *mut c_void,
    ) -> i32 {
        let h_mod = super::win32::LoadLibraryA(b"Mmdevapi.dll\0".as_ptr());
        if h_mod.is_null() {
            return -2147467259;
        }
        let proc_addr = super::win32::GetProcAddress(h_mod, b"ActivateAudioInterfaceAsync\0".as_ptr());
        if proc_addr.is_null() {
            return -2147467259;
        }
        let func: ActivateAudioInterfaceAsyncFn = std::mem::transmute(proc_addr);
        func(
            device_interface_path,
            riid,
            activation_params,
            completion_handler,
            activation_operation,
        )
    }

    // IAudioSessionManager2 / IAudioSessionEnumerator / IAudioSessionControl2 for active audio PID discovery
    pub const IID_IAUDIO_SESSION_MANAGER2: GUID = GUID {
        data1: 0x77AA99A0,
        data2: 0x1BD6,
        data3: 0x484F,
        data4: [0x8B, 0xC7, 0x2C, 0x65, 0x4C, 0x9A, 0x9B, 0x6F],
    };
    pub const IID_IAUDIO_SESSION_CONTROL2: GUID = GUID {
        data1: 0xBFB7FF88,
        data2: 0x7239,
        data3: 0x4FC9,
        data4: [0x8F, 0xA2, 0x07, 0xC9, 0x50, 0xBE, 0x9C, 0x6D],
    };

    #[repr(C)]
    pub struct IAudioSessionManager2Vtbl {
        pub query_interface: usize,
        pub add_ref: usize,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub get_audio_session_control: usize,
        pub get_simple_audio_volume: usize,
        pub get_session_enumerator: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> i32,
    }
    #[repr(C)]
    pub struct IAudioSessionManager2 {
        pub lp_vtbl: *const IAudioSessionManager2Vtbl,
    }

    #[repr(C)]
    pub struct IAudioSessionEnumeratorVtbl {
        pub query_interface: usize,
        pub add_ref: usize,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub get_count: unsafe extern "system" fn(*mut c_void, *mut i32) -> i32,
        pub get_session: unsafe extern "system" fn(*mut c_void, i32, *mut *mut c_void) -> i32,
    }
    #[repr(C)]
    pub struct IAudioSessionEnumerator {
        pub lp_vtbl: *const IAudioSessionEnumeratorVtbl,
    }

    #[repr(C)]
    pub struct IAudioSessionControl2Vtbl {
        pub query_interface: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32,
        pub add_ref: usize,
        pub release: unsafe extern "system" fn(*mut c_void) -> u32,
        pub get_state: unsafe extern "system" fn(*mut c_void, *mut i32) -> i32,
        pub get_display_name: usize,
        pub set_display_name: usize,
        pub get_icon_path: usize,
        pub set_icon_path: usize,
        pub get_grouping_param: usize,
        pub set_grouping_param: usize,
        pub register_notification: usize,
        pub unregister_notification: usize,
        pub get_session_identifier: usize,
        pub get_session_instance_identifier: usize,
        pub get_process_id: unsafe extern "system" fn(*mut c_void, *mut u32) -> i32,
    }
    #[repr(C)]
    pub struct IAudioSessionControl2 {
        pub lp_vtbl: *const IAudioSessionControl2Vtbl,
    }

    pub unsafe fn get_active_audio_session_pids() -> std::collections::HashSet<u32> {
        let mut active = std::collections::HashSet::new();
        let _ = CoInitializeEx(ptr::null(), 0);
        let mut enum_ptr: *mut c_void = ptr::null_mut();
        if CoCreateInstance(
            &CLSID_MMDEVICE_ENUMERATOR,
            ptr::null_mut(),
            CLSCTX_ALL,
            &IID_IMMDEVICE_ENUMERATOR,
            &mut enum_ptr,
        ) < 0
            || enum_ptr.is_null()
        {
            return active;
        }
        let enumerator = &*(enum_ptr as *mut IMMDeviceEnumerator);
        let mut coll_ptr: *mut c_void = ptr::null_mut();
        if ((*enumerator.lp_vtbl).enum_audio_endpoints)(enum_ptr, 0, 1, &mut coll_ptr) >= 0
            && !coll_ptr.is_null()
        {
            let coll = &*(coll_ptr as *mut IMMDeviceCollection);
            let mut count: u32 = 0;
            if ((*coll.lp_vtbl).get_count)(coll_ptr, &mut count) >= 0 {
                for idx in 0..count {
                    let mut dev_ptr: *mut c_void = ptr::null_mut();
                    if ((*coll.lp_vtbl).item)(coll_ptr, idx, &mut dev_ptr) >= 0 && !dev_ptr.is_null() {
                        let dev = &*(dev_ptr as *mut IMMDevice);
                        let mut mgr_ptr: *mut c_void = ptr::null_mut();
                        if ((*dev.lp_vtbl).activate)(
                            dev_ptr,
                            &IID_IAUDIO_SESSION_MANAGER2,
                            CLSCTX_ALL,
                            ptr::null(),
                            &mut mgr_ptr,
                        ) >= 0
                            && !mgr_ptr.is_null()
                        {
                            let mgr = &*(mgr_ptr as *mut IAudioSessionManager2);
                            let mut ses_enum_ptr: *mut c_void = ptr::null_mut();
                            if ((*mgr.lp_vtbl).get_session_enumerator)(mgr_ptr, &mut ses_enum_ptr) >= 0
                                && !ses_enum_ptr.is_null()
                            {
                                let ses_enum = &*(ses_enum_ptr as *mut IAudioSessionEnumerator);
                                let mut ses_count: i32 = 0;
                                if ((*ses_enum.lp_vtbl).get_count)(ses_enum_ptr, &mut ses_count) >= 0 {
                                    for s_idx in 0..ses_count {
                                        let mut ctrl_ptr: *mut c_void = ptr::null_mut();
                                        if ((*ses_enum.lp_vtbl).get_session)(ses_enum_ptr, s_idx, &mut ctrl_ptr) >= 0
                                            && !ctrl_ptr.is_null()
                                        {
                                            let ctrl = &*(ctrl_ptr as *mut IAudioSessionControl2);
                                            let mut state: i32 = 0;
                                            let _ = ((*ctrl.lp_vtbl).get_state)(ctrl_ptr, &mut state);
                                            let mut ctrl2_ptr: *mut c_void = ptr::null_mut();
                                            if ((*ctrl.lp_vtbl).query_interface)(
                                                ctrl_ptr,
                                                &IID_IAUDIO_SESSION_CONTROL2,
                                                &mut ctrl2_ptr,
                                            ) >= 0
                                                && !ctrl2_ptr.is_null()
                                            {
                                                let ctrl2 = &*(ctrl2_ptr as *mut IAudioSessionControl2);
                                                let mut s_pid: u32 = 0;
                                                if ((*ctrl2.lp_vtbl).get_process_id)(ctrl2_ptr, &mut s_pid) >= 0
                                                    && s_pid != 0
                                                    && state == 1
                                                {
                                                    active.insert(s_pid);
                                                }
                                                ((*ctrl2.lp_vtbl).release)(ctrl2_ptr);
                                            }
                                            ((*ctrl.lp_vtbl).release)(ctrl_ptr);
                                        }
                                    }
                                }
                                ((*ses_enum.lp_vtbl).release)(ses_enum_ptr);
                            }
                            ((*mgr.lp_vtbl).release)(mgr_ptr);
                        }
                        ((*dev.lp_vtbl).release)(dev_ptr);
                    }
                }
            }
            ((*coll.lp_vtbl).release)(coll_ptr);
        }
        ((*enumerator.lp_vtbl).release)(enum_ptr);
        active
    }

    impl EndpointLoopbackCapturer {
        pub unsafe fn from_process_loopback(target_pid: u32, include_tree: bool) -> Option<Self> {
            if target_pid == 0 {
                return None;
            }
            let _ = CoInitializeEx(ptr::null(), 0);
            let params = Box::new(AudioClientActivationParams {
                activation_type: 1,
                target_process_id: target_pid,
                process_loopback_mode: if include_tree { 0 } else { 1 },
            });
            let params_ptr = Box::into_raw(params);

            let prop_var = Box::new(PropVariantBlob {
                vt: 65,
                w_reserved1: 0,
                w_reserved2: 0,
                w_reserved3: 0,
                cb_size: std::mem::size_of::<AudioClientActivationParams>() as u32,
                _pad: 0,
                p_blob_data: params_ptr,
            });
            let prop_var_ptr = Box::into_raw(prop_var);

            // Start with ref_count = 1 for our local pointer; COM AddRef/Release manages the rest!
            let handler = Box::new(CompletionHandlerComObject {
                lp_vtbl: &CH_VTBL,
                ref_count: std::sync::atomic::AtomicU32::new(1),
                done_flag: std::sync::atomic::AtomicBool::new(false),
                hr_result: std::sync::atomic::AtomicI32::new(-1),
                activated_client: std::sync::atomic::AtomicPtr::new(ptr::null_mut()),
            });
            let handler_ptr = Box::into_raw(handler);

            let path_w: Vec<u16> = "VAD\\Process_Loopback"
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();

            let mut async_op: *mut c_void = ptr::null_mut();
            let hr = call_activate_audio_interface_async(
                path_w.as_ptr(),
                &IID_IAUDIO_CLIENT,
                prop_var_ptr,
                handler_ptr as *mut c_void,
                &mut async_op,
            );

            if hr < 0 {
                let _ = Box::from_raw(prop_var_ptr);
                let _ = Box::from_raw(params_ptr);
                ch_release(handler_ptr as *mut c_void);
                return None;
            }

            for _ in 0..150 {
                if (*handler_ptr).done_flag.load(std::sync::atomic::Ordering::SeqCst) {
                    break;
                }
                thread::sleep(Duration::from_millis(10));
            }

            let client_ptr = (*handler_ptr).activated_client.load(std::sync::atomic::Ordering::SeqCst);
            let act_hr = (*handler_ptr).hr_result.load(std::sync::atomic::Ordering::SeqCst);

            if !async_op.is_null() {
                let op = &*(async_op as *mut IActivateAudioInterfaceAsyncOperation);
                ((*op.lp_vtbl).release)(async_op);
            }
            let _ = Box::from_raw(prop_var_ptr);
            let _ = Box::from_raw(params_ptr);
            ch_release(handler_ptr as *mut c_void);

            if act_hr < 0 || client_ptr.is_null() {
                return None;
            }

            let client = &*(client_ptr as *mut IAudioClient);
            let pcm48k_fmt: [u8; 18] = [
                1, 0,             // wFormatTag = WAVE_FORMAT_PCM (1)
                2, 0,             // nChannels = 2
                0x80, 0xBB, 0, 0, // nSamplesPerSec = 48000
                0x00, 0xEE, 2, 0, // nAvgBytesPerSec = 192000
                4, 0,             // nBlockAlign = 4
                16, 0,            // wBitsPerSample = 16
                0, 0,             // cbSize = 0
            ];

            // Use 5_000_000 (500ms) buffer duration so WASAPI capture buffer never overflows!
            if ((*client.lp_vtbl).initialize)(
                client_ptr,
                AUDCLNT_SHAREMODE_SHARED,
                0x88020000,
                5_000_000,
                0,
                pcm48k_fmt.as_ptr(),
                ptr::null(),
            ) < 0
            {
                ((*client.lp_vtbl).release)(client_ptr);
                return None;
            }

            let mut cap_ptr: *mut c_void = ptr::null_mut();
            if ((*client.lp_vtbl).get_service)(
                client_ptr,
                &IID_IAUDIO_CAPTURE_CLIENT,
                &mut cap_ptr,
            ) < 0
                || cap_ptr.is_null()
            {
                ((*client.lp_vtbl).release)(client_ptr);
                return None;
            }

            if ((*client.lp_vtbl).start)(client_ptr) < 0 {
                let cap = &*(cap_ptr as *mut IAudioCaptureClient);
                ((*cap.lp_vtbl).release)(cap_ptr);
                ((*client.lp_vtbl).release)(client_ptr);
                return None;
            }

            Some(Self {
                audio_client: client_ptr,
                capture_client: cap_ptr,
                channels: 2,
                sample_rate: 48000,
                block_align: 4,
                bits_per_sample: 16,
                is_float: false,
                resample_accum: 0.0,
                sample_fifo: VecDeque::with_capacity(24000),
            })
        }
    }
}

static LOOPBACK_SESSION_ID: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

#[derive(Clone, Serialize)]
struct CapturableWinInfo {
    hwnd: isize,
    pid: u32,
    #[serde(rename = "rootPid")]
    root_pid: u32,
    title: String,
    exe: String,
    width: i32,
    height: i32,
    #[serde(rename = "hasAudio")]
    has_audio: bool,
}

#[cfg(target_os = "windows")]
fn get_system_process_table() -> std::collections::HashMap<u32, (u32, String)> {
    let mut map = std::collections::HashMap::new();
    unsafe {
        let snap = win32::CreateToolhelp32Snapshot(win32::TH32CS_SNAPPROCESS, 0);
        if snap.is_null() || snap == (-1isize as *mut c_void) {
            return map;
        }
        let mut pe: win32::PROCESSENTRY32W = std::mem::zeroed();
        pe.dw_size = std::mem::size_of::<win32::PROCESSENTRY32W>() as u32;
        if win32::Process32FirstW(snap, &mut pe) != 0 {
            loop {
                let len = pe.sz_exe_file.iter().position(|&c| c == 0).unwrap_or(pe.sz_exe_file.len());
                let exe = String::from_utf16_lossy(&pe.sz_exe_file[..len]).trim().to_string();
                map.insert(pe.th32_process_id, (pe.th32_parent_process_id, exe));
                if win32::Process32NextW(snap, &mut pe) == 0 {
                    break;
                }
            }
        }
        let _ = win32::CloseHandle(snap);
    }
    map
}

#[cfg(target_os = "windows")]
fn resolve_root_pid_for_same_exe(pid: u32, proc_map: &std::collections::HashMap<u32, (u32, String)>) -> (u32, String) {
    if pid == 0 {
        return (0, String::new());
    }
    let Some((_, exe)) = proc_map.get(&pid) else {
        return (pid, String::new());
    };
    let target_exe_lower = exe.to_ascii_lowercase();
    let mut cur = pid;
    for _ in 0..16 {
        let Some((parent_pid, _)) = proc_map.get(&cur) else { break };
        if *parent_pid == 0 || *parent_pid == cur {
            break;
        }
        let Some((_, parent_exe)) = proc_map.get(parent_pid) else { break };
        if parent_exe.to_ascii_lowercase() == target_exe_lower && !target_exe_lower.is_empty() {
            cur = *parent_pid;
        } else {
            break;
        }
    }
    (cur, exe.clone())
}

#[cfg(target_os = "windows")]
unsafe fn unwrap_window_pid(hwnd: isize, proc_map: &std::collections::HashMap<u32, (u32, String)>) -> u32 {
    if hwnd == 0 {
        return 0;
    }
    let mut pid: u32 = 0;
    win32::GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == 0 {
        return 0;
    }
    if let Some((_, exe)) = proc_map.get(&pid) {
        if exe.eq_ignore_ascii_case("applicationframehost.exe") {
            unsafe extern "system" fn child_cb(ch: isize, lparam: isize) -> i32 {
                if lparam == 0 {
                    return 0;
                }
                let pair_ptr = lparam as *mut (u32, u32);
                let host_pid = (*pair_ptr).0;
                let mut c_pid: u32 = 0;
                win32::GetWindowThreadProcessId(ch, &mut c_pid);
                if c_pid != 0 && c_pid != host_pid {
                    (*pair_ptr).1 = c_pid;
                    return 0;
                }
                1
            }
            let mut pair: (u32, u32) = (pid, 0);
            let _ = win32::EnumChildWindows(hwnd, child_cb, (&mut pair as *mut (u32, u32)) as isize);
            if pair.1 != 0 {
                return pair.1;
            }
        }
    }
    pid
}

#[cfg(target_os = "windows")]
fn scan_capturable_application_windows() -> Vec<CapturableWinInfo> {
    unsafe extern "system" fn enum_scan_cb(hwnd: isize, lparam: isize) -> i32 {
        if lparam == 0 {
            return 1;
        }
        let main_h = MAIN_HWND.load(Ordering::Relaxed);
        if hwnd == 0 || hwnd == main_h || win32::IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let ex_style = win32::GetWindowLongPtrW(hwnd, win32::GWL_EXSTYLE);
        if (ex_style & win32::WS_EX_TOOLWINDOW) != 0 {
            return 1;
        }
        let mut class_buf = [0u16; 128];
        let class_len = win32::GetClassNameW(hwnd, class_buf.as_mut_ptr(), 127);
        if class_len <= 0 {
            return 1;
        }
        let cls_lower = String::from_utf16_lossy(&class_buf[..class_len as usize]).to_ascii_lowercase();
        if cls_lower == "progman" || cls_lower == "workerw" || cls_lower == "shell_traywnd"
            || cls_lower.contains("rainmeter") || cls_lower.contains("meterwindow") || cls_lower.contains("rzmonitor")
        {
            return 1;
        }
        let mut title_buf = [0u16; 256];
        let title_len = win32::GetWindowTextW(hwnd, title_buf.as_mut_ptr(), 255);
        if title_len <= 0 {
            return 1;
        }
        let title = String::from_utf16_lossy(&title_buf[..title_len as usize]).trim().to_string();
        if title.is_empty() {
            return 1;
        }
        let title_lower = title.to_ascii_lowercase();
        if title_lower == "program manager" || title_lower == "windows input experience"
            || title_lower == "nvidia geforce overlay" || title_lower.contains("is sharing a window")
            || title_lower.contains("is sharing your screen")
        {
            return 1;
        }
        let mut r = win32::RECT { left: 0, top: 0, right: 0, bottom: 0 };
        let _ = win32::GetWindowRect(hwnd, &mut r);
        let w = (r.right - r.left).abs();
        let h = (r.bottom - r.top).abs();
        if win32::IsIconic(hwnd) == 0 && (w < 200 || h < 120) {
            return 1;
        }
        let mut pid: u32 = 0;
        win32::GetWindowThreadProcessId(hwnd, &mut pid);
        let my_pid = win32::GetCurrentProcessId();
        if pid == 0 || pid == my_pid {
            return 1;
        }
        let vec_ptr = lparam as *mut Vec<CapturableWinInfo>;
        (*vec_ptr).push(CapturableWinInfo {
            hwnd,
            pid,
            root_pid: pid,
            title,
            exe: String::new(),
            width: w,
            height: h,
            has_audio: false,
        });
        1
    }

    let proc_map = get_system_process_table();
    let active_audio_pids = unsafe { wasapi_hybrid_audio::get_active_audio_session_pids() };
    let mut active_root_pids = active_audio_pids.clone();
    let mut active_exes = std::collections::HashSet::new();
    for &apid in &active_audio_pids {
        let (r_pid, a_exe) = resolve_root_pid_for_same_exe(apid, &proc_map);
        if r_pid != 0 {
            active_root_pids.insert(r_pid);
        }
        if !a_exe.is_empty() {
            active_exes.insert(a_exe.to_ascii_lowercase());
        }
    }

    let mut raw_wins: Vec<CapturableWinInfo> = Vec::new();
    unsafe {
        let _ = win32::EnumWindows(enum_scan_cb, (&mut raw_wins as *mut Vec<CapturableWinInfo>) as isize);
    }
    let mut out = Vec::new();
    for item in raw_wins.iter() {
        let real_pid = unsafe { unwrap_window_pid(item.hwnd, &proc_map) };
        let (root_pid, exe) = resolve_root_pid_for_same_exe(real_pid, &proc_map);
        let exe_name = if exe.is_empty() { "Application.exe".to_string() } else { exe };
        let exe_lower = exe_name.to_ascii_lowercase();
        if exe_lower == "discrust.exe" || exe_lower == "disliterust.exe" {
            continue;
        }
        let eff_root = if root_pid != 0 { root_pid } else { real_pid };
        let has_audio = active_root_pids.contains(&eff_root)
            || active_root_pids.contains(&real_pid)
            || active_exes.contains(&exe_lower);
        out.push(CapturableWinInfo {
            hwnd: item.hwnd,
            pid: real_pid,
            root_pid: eff_root,
            title: item.title.clone(),
            exe: exe_name,
            width: item.width,
            height: item.height,
            has_audio,
        });
    }
    out
}

fn push_capturable_windows_to_webview(proxy: EventLoopProxy<UserEvent>) {
    #[cfg(target_os = "windows")]
    thread::spawn(move || {
        let wins = scan_capturable_application_windows();
        if let Ok(json) = serde_json::to_string(&wins) {
            let script = format!(
                "window.__lcUpdateCapturableWindows&&window.__lcUpdateCapturableWindows({});",
                json
            );
            let _ = proxy.send_event(UserEvent::EvalScript(script));
        }
    });
}

#[cfg(target_os = "windows")]
unsafe fn open_targeted_capturers(target_spec_json: &str) -> (Vec<wasapi_hybrid_audio::EndpointLoopbackCapturer>, String, u32, bool) {
    let mut list = Vec::new();
    let my_pid = win32::GetCurrentProcessId();
    let proc_map = get_system_process_table();
    let active_audio_pids = wasapi_hybrid_audio::get_active_audio_session_pids();
    let wins = scan_capturable_application_windows();

    let mut surface = "window".to_string();
    let mut device_id = String::new();
    let mut label = String::new();
    let mut width: i32 = 0;
    let mut height: i32 = 0;
    let mut explicit_pid: i64 = 0;

    if !target_spec_json.is_empty() {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(target_spec_json) {
            if let Some(s) = val.get("surface").and_then(|v| v.as_str()) {
                surface = s.trim().to_ascii_lowercase();
            }
            if let Some(d) = val.get("deviceId").and_then(|v| v.as_str()) {
                device_id = d.trim().to_string();
            }
            if let Some(l) = val.get("label").and_then(|v| v.as_str()) {
                label = l.trim().to_string();
            }
            if let Some(w) = val.get("width").and_then(|v| v.as_i64()) {
                width = w as i32;
            }
            if let Some(h) = val.get("height").and_then(|v| v.as_i64()) {
                height = h as i32;
            }
            if let Some(p) = val.get("explicitPid").and_then(|v| v.as_i64()) {
                explicit_pid = p;
            }
        }
    }

    let is_monitor = explicit_pid == -1
        || surface == "monitor"
        || device_id.to_ascii_lowercase().starts_with("screen:")
        || label.to_ascii_lowercase().starts_with("screen:");

    if is_monitor && explicit_pid <= 0 {
        if let Some(cap) = wasapi_hybrid_audio::EndpointLoopbackCapturer::from_process_loopback(my_pid, false) {
            list.push(cap);
        }
        return (list, "Entire Screen".to_string(), my_pid, true);
    }

    let mut resolved_pid: u32 = 0;
    if explicit_pid > 0 {
        resolved_pid = explicit_pid as u32;
    }

    if resolved_pid == 0 {
        for cand in [&device_id, &label] {
            if let Some(idx) = cand.to_ascii_lowercase().find("window:") {
                let tail = &cand[idx + 7..];
                let digits: String = tail.chars().take_while(|c| c.is_ascii_digit()).collect();
                if let Ok(hwnd_val) = digits.parse::<isize>() {
                    if hwnd_val != 0 && win32::IsWindow(hwnd_val) != 0 {
                        let w_pid = unwrap_window_pid(hwnd_val, &proc_map);
                        if w_pid != 0 && w_pid != my_pid {
                            resolved_pid = w_pid;
                            break;
                        }
                    }
                }
            }
        }
    }

    if resolved_pid == 0 && !label.is_empty() && !label.to_ascii_lowercase().starts_with("window") {
        let lbl_low = label.to_ascii_lowercase();
        for w in &wins {
            if w.title.to_ascii_lowercase() == lbl_low || w.exe.to_ascii_lowercase() == lbl_low {
                resolved_pid = w.root_pid;
                break;
            }
        }
        if resolved_pid == 0 {
            for w in &wins {
                let t_low = w.title.to_ascii_lowercase();
                if t_low.contains(&lbl_low) || lbl_low.contains(&t_low) {
                    resolved_pid = w.root_pid;
                    break;
                }
            }
        }
    }

    if resolved_pid == 0 && width > 100 && height > 100 {
        let mut best_score = i32::MAX;
        for w in &wins {
            let diff = (w.width - width).abs() + (w.height - height).abs();
            if diff <= 48 {
                let score = diff - if w.has_audio { 200 } else { 0 };
                if score < best_score {
                    best_score = score;
                    resolved_pid = w.root_pid;
                }
            }
        }
    }

    if resolved_pid == 0 {
        for w in &wins {
            if w.has_audio {
                resolved_pid = w.root_pid;
                break;
            }
        }
    }

    if resolved_pid == 0 {
        if let Some(first_w) = wins.first() {
            resolved_pid = first_w.root_pid;
        }
    }

    if resolved_pid != 0 && resolved_pid != my_pid {
        let (mut root_pid, target_exe) = resolve_root_pid_for_same_exe(resolved_pid, &proc_map);
        if root_pid == 0 {
            root_pid = resolved_pid;
        }
        let locked_label = if !target_exe.is_empty() {
            target_exe.clone()
        } else {
            format!("PID {}", root_pid)
        };

        let mut pids_to_cap = Vec::new();
        if !target_exe.is_empty() {
            let t_low = target_exe.to_ascii_lowercase();
            if t_low != "discrust.exe" && t_low != "disliterust.exe" && t_low != "explorer.exe" && t_low != "svchost.exe" {
                for &apid in &active_audio_pids {
                    if let Some((_, a_exe)) = proc_map.get(&apid) {
                        if a_exe.eq_ignore_ascii_case(&target_exe) {
                            let (a_root, _) = resolve_root_pid_for_same_exe(apid, &proc_map);
                            let eff = if a_root != 0 { a_root } else { apid };
                            if eff != 0 && eff != my_pid && !pids_to_cap.contains(&eff) {
                                pids_to_cap.push(eff);
                            }
                        }
                    }
                }
            }
        }
        if !pids_to_cap.contains(&root_pid) {
            pids_to_cap.insert(0, root_pid);
        }
        pids_to_cap.truncate(2);

        for p in pids_to_cap {
            if let Some(cap) = wasapi_hybrid_audio::EndpointLoopbackCapturer::from_process_loopback(p, true) {
                list.push(cap);
            }
        }
        return (list, locked_label, root_pid, false);
    }

    (list, "Auto".to_string(), 0, false)
}

fn start_targeted_wasapi_loopback(proxy: EventLoopProxy<UserEvent>, target_spec_json: String) {
    prepare_windows_for_screenshare_picker();
    let session_id = LOOPBACK_SESSION_ID.fetch_add(1, Ordering::SeqCst) + 1;
    AUDIO_LOOPBACK_ACTIVE.store(true, Ordering::SeqCst);

    #[cfg(target_os = "windows")]
    thread::spawn(move || unsafe {
        let (mut capturers, locked_label, locked_pid, _is_monitor) = open_targeted_capturers(&target_spec_json);
        let safe_lbl = serde_json::to_string(&locked_label).unwrap_or_else(|_| "\"Auto\"".to_string());
        let _ = proxy.send_event(UserEvent::EvalScript(format!(
            "window.__lcOnStreamAudioTargetLocked&&window.__lcOnStreamAudioTargetLocked({},{});",
            safe_lbl, locked_pid
        )));

        let mut ticks: u32 = 0;
        let mut silent_ticks: u32 = 0;
        const CHUNK_SAMPLES: usize = 4800; // 2400 stereo frames = 50ms @ 48kHz (smooth, low IPC overhead)

        while AUDIO_LOOPBACK_ACTIVE.load(Ordering::SeqCst)
            && LOOPBACK_SESSION_ID.load(Ordering::SeqCst) == session_id
        {
            thread::sleep(Duration::from_millis(15));
            ticks = ticks.wrapping_add(1);

            let mut any_failed = false;
            for c in &mut capturers {
                if !c.drain_packets() {
                    any_failed = true;
                }
            }

            let has_buffered = capturers.iter().any(|c| !c.sample_fifo.is_empty());
            if has_buffered {
                silent_ticks = 0;
            } else {
                silent_ticks = silent_ticks.saturating_add(1);
            }

            if any_failed || (capturers.is_empty() && ticks % 100 == 0) || (silent_ticks >= 200 && ticks % 200 == 0) {
                for c in &mut capturers {
                    c.cleanup();
                }
                capturers.clear();
                silent_ticks = 0;
                let (retry_caps, new_lbl, new_pid, _) = open_targeted_capturers(&target_spec_json);
                if !retry_caps.is_empty() {
                    capturers = retry_caps;
                    let s_lbl = serde_json::to_string(&new_lbl).unwrap_or_else(|_| "\"Auto\"".to_string());
                    let _ = proxy.send_event(UserEvent::EvalScript(format!(
                        "window.__lcOnStreamAudioTargetLocked&&window.__lcOnStreamAudioTargetLocked({},{});",
                        s_lbl, new_pid
                    )));
                }
            }

            let mut chunks_sent = 0;
            while capturers.iter().any(|c| c.sample_fifo.len() >= CHUNK_SAMPLES) && chunks_sent < 4 {
                chunks_sent += 1;
                let mut mix_i32 = [0i32; CHUNK_SAMPLES];
                for c in &mut capturers {
                    if c.sample_fifo.len() >= CHUNK_SAMPLES {
                        for i in 0..CHUNK_SAMPLES {
                            if let Some(s) = c.sample_fifo.pop_front() {
                                mix_i32[i] += s as i32;
                            }
                        }
                    }
                }
                let mut pcm_bytes = Vec::with_capacity(CHUNK_SAMPLES * 2);
                let mut max_abs: i32 = 0;
                for &val in &mix_i32 {
                    let clamped = val.clamp(i16::MIN as i32, i16::MAX as i32) as i16;
                    let a = (clamped as i32).abs();
                    if a > max_abs {
                        max_abs = a;
                    }
                    let le = clamped.to_le_bytes();
                    pcm_bytes.push(le[0]);
                    pcm_bytes.push(le[1]);
                }
                if max_abs > 1 {
                    let b64 = encode_base64(&pcm_bytes);
                    let _ = proxy.send_event(UserEvent::PushLoopbackAudioB64(b64));
                }
            }
        }

        for c in &mut capturers {
            c.cleanup();
        }
    });
}

fn stop_multi_device_wasapi_loopback() {
    AUDIO_LOOPBACK_ACTIVE.store(false, Ordering::SeqCst);
    LOOPBACK_SESSION_ID.fetch_add(1, Ordering::SeqCst);
}

fn suppress_webview_screenshare_popups() {
    #[cfg(target_os = "windows")]
    unsafe {
        let _ = win32::EnumWindows(enum_hide_screenshare_bar_cb, 0);
    }
}

static NOTIF_ICO_SEQ: AtomicIsize = AtomicIsize::new(0);

fn decode_base64_payload(input: &str) -> Option<Vec<u8>> {
    let raw = if let Some(idx) = input.find("base64,") {
        &input[idx + 7..]
    } else {
        input
    };
    let mut out = Vec::with_capacity(raw.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits: u8 = 0;
    for b in raw.bytes() {
        let val = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => break,
            b' ' | b'\r' | b'\n' | b'\t' => continue,
            _ => return None,
        };
        buf = (buf << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buf >> bits) & 0xFF) as u8);
        }
    }
    if out.is_empty() { None } else { Some(out) }
}

fn normalize_discord_cdn_avatar_url(raw_url: &str) -> String {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.contains("discordapp.com/") || trimmed.contains("discordapp.net/") {
        let base_part = trimmed.split('?').next().unwrap_or(trimmed);
        if base_part.ends_with(".webp") || base_part.ends_with(".gif") {
            let dot_pos = base_part.rfind('.').unwrap_or(base_part.len());
            return format!("{}.png?size=128", &base_part[..dot_pos]);
        }
    }
    trimmed.to_string()
}

// Decodes pre-rendered base64 PNG from WebView2 or downloads sender's avatar URL with Chrome User-Agent,
// then crops it into a crisp circular 64x64 .ico with a subtle dark ring border matching DisLite's UI design language.
fn build_circular_notification_avatar_ico(avatar_url: &str, icon_data_uri: &str) -> PathBuf {
    let root = get_app_data_root();
    let seq = (NOTIF_ICO_SEQ.fetch_add(1, Ordering::Relaxed) as usize) % 8;
    let out_ico = root.join(format!("notif_avatar_{}.ico", seq));

    let mut base_img: Option<RgbaImage> = None;

    // 1. Try pre-rendered base64 PNG from WebView2 canvas first (instant, supports .webp/.png/.gif/.jpg)
    if !icon_data_uri.trim().is_empty() {
        if let Some(bytes) = decode_base64_payload(icon_data_uri.trim()) {
            if let Ok(decoded) = image::load_from_memory(&bytes) {
                base_img = Some(
                    decoded
                        .resize_exact(64, 64, image::imageops::FilterType::Lanczos3)
                        .into_rgba8(),
                );
            }
        }
    }

    // 2. Fallback: Download directly via ureq with a browser User-Agent and .webp -> .png normalization
    if base_img.is_none() {
        let norm_url = normalize_discord_cdn_avatar_url(avatar_url);
        if norm_url.starts_with("http://") || norm_url.starts_with("https://") {
            let agent = ureq::AgentBuilder::new()
                .timeout_connect(Duration::from_millis(2000))
                .timeout(Duration::from_millis(3000))
                .build();
            if let Ok(resp) = agent
                .get(&norm_url)
                .set(
                    "User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                )
                .set("Accept", "image/png,image/jpeg,image/ico,*/*;q=0.8")
                .call()
            {
                let mut bytes: Vec<u8> = Vec::with_capacity(65536);
                if resp.into_reader().take(2 * 1024 * 1024).read_to_end(&mut bytes).is_ok() {
                    if let Ok(decoded) = image::load_from_memory(&bytes) {
                        base_img = Some(
                            decoded
                                .resize_exact(64, 64, image::imageops::FilterType::Lanczos3)
                                .into_rgba8(),
                        );
                    }
                }
            }
        }
    }

    let mut rgba = base_img.unwrap_or_else(|| {
        if let Ok(decoded) = image::load_from_memory(EMBEDDED_ICON_PNG) {
            decoded
                .resize_exact(64, 64, image::imageops::FilterType::Lanczos3)
                .into_rgba8()
        } else {
            ImageBuffer::from_pixel(64, 64, Rgba([88, 101, 242, 255]))
        }
    });

    // Apply anti-aliased circular mask + subtle dark slate ring border (#2b2d31) to match DisLite UI design language
    for y in 0..64 {
        for x in 0..64 {
            let dx = (x as f32) - 31.5;
            let dy = (y as f32) - 31.5;
            let d = (dx * dx + dy * dy).sqrt();
            if d > 31.4 {
                rgba.put_pixel(x, y, Rgba([0, 0, 0, 0]));
            } else if d > 29.8 {
                let outer_alpha = ((31.4 - d) / 1.0).clamp(0.0, 1.0);
                let ring_mix = ((d - 29.8) / 1.2).clamp(0.0, 1.0);
                let px = *rgba.get_pixel(x, y);
                let r = ((px[0] as f32) * (1.0 - ring_mix) + 43.0 * ring_mix).round() as u8;
                let g = ((px[1] as f32) * (1.0 - ring_mix) + 45.0 * ring_mix).round() as u8;
                let b = ((px[2] as f32) * (1.0 - ring_mix) + 49.0 * ring_mix).round() as u8;
                let a = (255.0 * outer_alpha).round() as u8;
                rgba.put_pixel(x, y, Rgba([r, g, b, a]));
            }
        }
    }

    let dyn_img = DynamicImage::ImageRgba8(rgba);
    let mut buf = Vec::new();
    if dyn_img
        .write_to(&mut Cursor::new(&mut buf), ImageOutputFormat::Ico)
        .is_ok()
    {
        let _ = fs::write(&out_ico, &buf);
        return out_ico;
    }

    ensure_embedded_default_icon_on_disk()
}

// Rich Native Windows Toast Dispatcher with Circular Profile Picture, Chat/Server Name, Google Emojis, DND Respect, and Click-to-Chat Redirect
fn trigger_native_windows_notification(
    sender_title: &str,
    context_sub: &str,
    body: &str,
    avatar_url: &str,
    icon_data_uri: &str,
    route: &str,
    app_name: &str,
    _proxy: EventLoopProxy<UserEvent>,
) {
    if is_windows_system_dnd_active() {
        return;
    }

    #[cfg(target_os = "windows")]
    {
        let s_title = sender_title.trim().to_string();
        let s_sub = context_sub.trim().to_string();
        let s_body = body.trim().to_string();
        let s_av = avatar_url.trim().to_string();
        let s_data_uri = icon_data_uri.trim().to_string();
        let s_route = route.trim().to_string();
        let s_app = app_name.trim().to_string();

        thread::spawn(move || unsafe {
            if !s_route.is_empty() {
                LAST_NOTIF_ROUTE = Some(s_route);
            }
            let main_h = resolve_main_hwnd();
            let fg_h = win32::GetForegroundWindow();
            if main_h != 0 && main_h != fg_h {
                let _ = win32::FlashWindow(main_h, 1);
            }

            let avatar_ico_path = build_circular_notification_avatar_ico(&s_av, &s_data_uri);
            let mut wide_ico: Vec<u16> = avatar_ico_path.display().to_string().encode_utf16().collect();
            wide_ico.push(0);
            let h_balloon_ico = win32::LoadImageW(
                0,
                wide_ico.as_ptr(),
                win32::IMAGE_ICON,
                64,
                64,
                win32::LR_LOADFROMFILE,
            );

            let tray_h = TRAY_HWND.load(Ordering::Relaxed);
            if tray_h != 0 {
                let mut nid: win32::NOTIFYICONDATAW = std::mem::zeroed();
                nid.cb_size = std::mem::size_of::<win32::NOTIFYICONDATAW>() as u32;
                nid.h_wnd = tray_h;
                nid.u_id = 1;
                nid.u_flags = win32::NIF_INFO | win32::NIF_MESSAGE;
                nid.u_callback_message = win32::WM_TRAYICON;
                if h_balloon_ico != 0 {
                    nid.dw_info_flags = win32::NIIF_USER | win32::NIIF_LARGE_ICON;
                    nid.h_balloon_icon = h_balloon_ico;
                } else {
                    nid.dw_info_flags = win32::NIIF_INFO;
                }

                // Format header cleanly like official Discord desktop notifications:
                // "Sender Name (#channel, Server Name)" for server chats, or "Sender Name" for DMs
                let full_title = if !s_sub.is_empty() && s_sub != "Direct Message" {
                    format!("{} ({})", s_title, s_sub)
                } else if !s_title.is_empty() {
                    s_title
                } else {
                    s_app.clone()
                };
                let full_body = if !s_body.is_empty() {
                    s_body
                } else {
                    format!("Sent a message in {}", s_app)
                };

                for (i, ch) in full_title.encode_utf16().take(62).enumerate() {
                    nid.sz_info_title[i] = ch;
                }
                for (i, ch) in full_body.encode_utf16().take(254).enumerate() {
                    nid.sz_info[i] = ch;
                }
                let _ = win32::Shell_NotifyIconW(win32::NIM_MODIFY, &mut nid);
            }
        });
    }
}

fn update_isolated_shortcuts_and_repair_discord(cfg: &AppConfig) {
    #[cfg(target_os = "windows")]
    {
        let default_ico = ensure_embedded_default_icon_on_disk();
        let exe_path = env::current_exe().unwrap_or_default();
        let exe_dir = exe_path.parent().unwrap_or_else(|| Path::new(".")).to_path_buf();
        let ico_path = if !cfg.custom_icon_path.is_empty() && Path::new(&cfg.custom_icon_path).exists() {
            PathBuf::from(&cfg.custom_icon_path)
        } else {
            let candidate = exe_dir.join("dislite.ico");
            if candidate.exists() {
                candidate
            } else {
                default_ico
            }
        };

        let effective_name = get_effective_app_name(cfg);
        register_aumid_in_hkcu_registry(&effective_name, &ico_path);
        let shortcut_filename = format!("{} v{}.lnk", effective_name, APP_VERSION);

        let ps_script = format!(
            r#"
$ErrorActionPreference = 'SilentlyContinue'
$WshShell = New-Object -ComObject WScript.Shell
$DesktopDir = [Environment]::GetFolderPath('Desktop')
$ProgramsDir = [Environment]::GetFolderPath('Programs')
$StartMenuDir = [Environment]::GetFolderPath('StartMenu')
$LocalAppData = $env:LOCALAPPDATA
$OfficialUpdateExe = Join-Path $LocalAppData 'Discord\Update.exe'
$OfficialDiscordDir = Join-Path $LocalAppData 'Discord'
$OfficialIco = Join-Path $OfficialDiscordDir 'app.ico'
$TargetExe = '{exe}'
$WorkDir = '{workdir}'
$IconLoc = '{ico},0'
$ShortcutName = '{shortcut_filename}'

foreach ($dir in @($DesktopDir, $ProgramsDir, $StartMenuDir)) {{
    if (-not $dir) {{ continue }}
    $discordLnk = Join-Path $dir 'Discord.lnk'
    if (Test-Path $discordLnk) {{
        $sc = $WshShell.CreateShortcut($discordLnk)
        if ($sc.TargetPath -match 'LiteCord|DisLite') {{
            if (Test-Path $OfficialUpdateExe) {{
                $sc.TargetPath = $OfficialUpdateExe
                $sc.Arguments = '--processStart Discord.exe'
                $sc.WorkingDirectory = $OfficialDiscordDir
                if (Test-Path $OfficialIco) {{ $sc.IconLocation = "$OfficialIco,0" }}
                $sc.Description = 'Discord'
                $sc.Save()
            }} else {{
                Remove-Item $discordLnk -Force
            }}
        }}
    }}
    Get-ChildItem -Path $dir -Filter '*.lnk' | ForEach-Object {{
        $s = $WshShell.CreateShortcut($_.FullName)
        if (($s.TargetPath -eq $TargetExe -or $_.Name -match '^DisLite Rust') -and $_.Name -ne $ShortcutName) {{
            Remove-Item $_.FullName -Force
        }}
    }}
}}

$DeskLnk = Join-Path $DesktopDir $ShortcutName
if (${create_desk}) {{
    $sc = $WshShell.CreateShortcut($DeskLnk)
    $sc.TargetPath = $TargetExe
    $sc.WorkingDirectory = $WorkDir
    $sc.IconLocation = $IconLoc
    $sc.Description = '{effective_name} v{ver} (Installer v{inst_ver})'
    $sc.Save()
}} else {{
    if (Test-Path $DeskLnk) {{ Remove-Item $DeskLnk -Force }}
}}

$StartLnk = Join-Path $ProgramsDir $ShortcutName
$RootStartLnk = Join-Path $StartMenuDir $ShortcutName
if (${create_start}) {{
    foreach ($p in @($StartLnk, $RootStartLnk)) {{
        $sc = $WshShell.CreateShortcut($p)
        $sc.TargetPath = $TargetExe
        $sc.WorkingDirectory = $WorkDir
        $sc.IconLocation = $IconLoc
        $sc.Description = '{effective_name} v{ver} (Installer v{inst_ver})'
        $sc.Save()
    }}
}} else {{
    if (Test-Path $StartLnk) {{ Remove-Item $StartLnk -Force }}
    if (Test-Path $RootStartLnk) {{ Remove-Item $RootStartLnk -Force }}
}}

$RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (${run_startup}) {{
    Set-ItemProperty -Path $RunKey -Name 'DisLiteRust' -Value "`"$TargetExe`""
}} else {{
    Remove-ItemProperty -Path $RunKey -Name 'DisLiteRust' -ErrorAction SilentlyContinue
}}
"#,
            shortcut_filename = shortcut_filename.replace('\'', ""),
            effective_name = effective_name.replace('\'', ""),
            ver = FULL_SEMVER,
            inst_ver = INSTALLER_VERSION,
            exe = exe_path.display().to_string().replace('\'', "''"),
            workdir = exe_dir.display().to_string().replace('\'', "''"),
            ico = ico_path.display().to_string().replace('\'', "''"),
            create_desk = if cfg.desktop_shortcut_enabled { "$true" } else { "$false" },
            create_start = if cfg.start_menu_shortcut_enabled { "$true" } else { "$false" },
            run_startup = if cfg.run_on_windows_startup { "$true" } else { "$false" },
        );

        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-Command",
                &ps_script,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn enum_find_main_hwnd_cb(hwnd: isize, _lparam: isize) -> i32 {
    if hwnd == 0 || hwnd == TRAY_HWND.load(Ordering::Relaxed) {
        return 1;
    }
    if win32::IsWindowVisible(hwnd) == 0 {
        return 1;
    }
    let mut pid: u32 = 0;
    win32::GetWindowThreadProcessId(hwnd, &mut pid);
    if pid != win32::GetCurrentProcessId() {
        return 1;
    }
    let mut class_buf = [0u16; 128];
    let len = win32::GetClassNameW(hwnd, class_buf.as_mut_ptr(), 127);
    if len > 0 {
        let cname = String::from_utf16_lossy(&class_buf[..len as usize]);
        if cname.contains("Tao") || cname.contains("Window") {
            MAIN_HWND.store(hwnd, Ordering::Relaxed);
            return 0;
        }
    }
    1
}

#[cfg(target_os = "windows")]
fn focus_main_window_without_resizing() {
    unsafe {
        let main_h = resolve_main_hwnd();
        if main_h != 0 {
            let fg_h = win32::GetForegroundWindow();
            let mut dummy_pid: u32 = 0;
            let fg_tid = if fg_h != 0 {
                win32::GetWindowThreadProcessId(fg_h, &mut dummy_pid)
            } else {
                0
            };
            let cur_tid = win32::GetCurrentThreadId();
            if fg_tid != 0 && fg_tid != cur_tid {
                let _ = win32::AttachThreadInput(fg_tid, cur_tid, 1);
            }
            // Only call ShowWindow(SW_RESTORE) if the window is genuinely minimized (IsIconic != 0).
            // Never call ShowWindow when the window is already visible/maximized, as Win32 resets borderless window rects!
            if win32::IsIconic(main_h) != 0 {
                let _ = win32::ShowWindow(main_h, win32::SW_RESTORE);
            }
            let _ = win32::BringWindowToTop(main_h);
            let _ = win32::SetForegroundWindow(main_h);
            if fg_tid != 0 && fg_tid != cur_tid {
                let _ = win32::AttachThreadInput(fg_tid, cur_tid, 0);
            }
        }
    }
}


static WORKAREA_MAXIMIZED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static PRE_MAX_RECT: std::sync::Mutex<Option<(i32, i32, i32, i32)>> = std::sync::Mutex::new(None);

fn set_workarea_maximized(window: &tao::window::Window, target_max: bool) {
    #[cfg(target_os = "windows")]
    unsafe {
        let mh = resolve_main_hwnd();
        if mh != 0 {
            if target_max {
                if !WORKAREA_MAXIMIZED.load(Ordering::SeqCst) {
                    let mut cur = win32::RECT { left: 0, top: 0, right: 0, bottom: 0 };
                    if win32::GetWindowRect(mh, &mut cur) != 0 {
                        let cw = (cur.right - cur.left).max(800);
                        let ch = (cur.bottom - cur.top).max(540);
                        if let Ok(mut g) = PRE_MAX_RECT.lock() {
                            *g = Some((cur.left, cur.top, cw, ch));
                        }
                    }
                }
                let mut wa = win32::RECT { left: 0, top: 0, right: 1920, bottom: 1040 };
                let _ = win32::SystemParametersInfoW(
                    win32::SPI_GETWORKAREA,
                    0,
                    &mut wa as *mut win32::RECT as *mut std::ffi::c_void,
                    0,
                );
                let ww = (wa.right - wa.left).max(800);
                let wh = (wa.bottom - wa.top).max(540);
                WORKAREA_MAXIMIZED.store(true, Ordering::SeqCst);
                update_window_rounded_corners(mh, true);
                let _ = win32::SetWindowPos(mh, 0, wa.left, wa.top, ww, wh, win32::SWP_NOZORDER);
                return;
            } else {
                WORKAREA_MAXIMIZED.store(false, Ordering::SeqCst);
                update_window_rounded_corners(mh, false);
                let saved = PRE_MAX_RECT.lock().ok().and_then(|g| *g);
                let (rx, ry, rw, rh) = saved.unwrap_or((120, 80, 1360, 860));
                let _ = win32::SetWindowPos(mh, 0, rx, ry, rw, rh, win32::SWP_NOZORDER);
                return;
            }
        }
    }
    window.set_maximized(target_max);
}

fn restore_and_focus_window(window: &tao::window::Window, cfg: &Arc<Mutex<AppConfig>>) {
    let (want_max, want_w, want_h) = {
        let c = cfg.lock().unwrap();
        (c.saved_window_maximized, c.saved_window_width.max(720), c.saved_window_height.max(480))
    };
    if window.is_minimized() {
        window.set_minimized(false);
    }
    #[cfg(target_os = "windows")]
    focus_main_window_without_resizing();
    if want_max {
        if !WORKAREA_MAXIMIZED.load(Ordering::SeqCst) {
            set_workarea_maximized(window, true);
        }
    } else {
        let scale = window.scale_factor();
        let cur_sz = window.inner_size();
        let cur_w = ((cur_sz.width as f64) / scale).round() as u32;
        let cur_h = ((cur_sz.height as f64) / scale).round() as u32;
        if (cur_w as i32 - want_w as i32).abs() > 16 || (cur_h as i32 - want_h as i32).abs() > 16 {
            window.set_inner_size(LogicalSize::new(want_w as f64, want_h as f64));
        }
    }
}

fn resolve_main_hwnd() -> isize {
    #[cfg(target_os = "windows")]
    unsafe {
        let cached = MAIN_HWND.load(Ordering::Relaxed);
        if cached != 0 {
            return cached;
        }
        let _ = win32::EnumWindows(enum_find_main_hwnd_cb, 0);
        let found = MAIN_HWND.load(Ordering::Relaxed);
        if found != 0 {
            return found;
        }
        let h = win32::GetActiveWindow();
        if h != 0 && h != TRAY_HWND.load(Ordering::Relaxed) {
            MAIN_HWND.store(h, Ordering::Relaxed);
            return h;
        }
        0
    }
    #[cfg(not(target_os = "windows"))]
    0
}

fn update_window_rounded_corners(hwnd: isize, is_max_or_full: bool) {
    #[cfg(target_os = "windows")]
    unsafe {
        if hwnd == 0 {
            return;
        }
        // DWMWA_WINDOW_CORNER_PREFERENCE = 33: 2 = DWMWCP_ROUND (windowed), 1 = DWMWCP_DONOTROUND (maximized/fullscreen)
        let round_pref: i32 = if is_max_or_full { 1 } else { 2 };
        let _ = win32::DwmSetWindowAttribute(
            hwnd,
            33,
            &round_pref as *const _ as *const c_void,
            std::mem::size_of::<i32>() as u32,
        );
        let border_col: u32 = if is_max_or_full { 0xFFFFFFFE } else { 0x00383432 };
        let _ = win32::DwmSetWindowAttribute(
            hwnd,
            34,
            &border_col as *const _ as *const c_void,
            std::mem::size_of::<u32>() as u32,
        );
    }
}

fn apply_adaptive_titlebar_color(r: u8, g: u8, b: u8, is_light: bool) {
    #[cfg(target_os = "windows")]
    unsafe {
        let hwnd = resolve_main_hwnd();
        if hwnd == 0 {
            return;
        }
        let dark_mode: i32 = if is_light { 0 } else { 1 };
        let _ = win32::DwmSetWindowAttribute(
            hwnd,
            20,
            &dark_mode as *const _ as *const c_void,
            std::mem::size_of::<i32>() as u32,
        );
        let is_max = WORKAREA_MAXIMIZED.load(Ordering::SeqCst);
        update_window_rounded_corners(hwnd, is_max);
        let colorref: u32 = (r as u32) | ((g as u32) << 8) | ((b as u32) << 16);
        let _ = win32::DwmSetWindowAttribute(
            hwnd,
            35,
            &colorref as *const _ as *const c_void,
            std::mem::size_of::<u32>() as u32,
        );
    }
}

// Trims working sets AND harvests running user process executable paths for real Discord Game Activity detection!
fn trim_memory_and_scan_running_processes() -> (u64, u64, Vec<(u32, String, String)>) {
    #[cfg(target_os = "windows")]
    unsafe {
        let is_streaming_now = AUDIO_LOOPBACK_ACTIVE.load(Ordering::SeqCst);
        let self_pid = win32::GetCurrentProcessId();
        let self_handle = win32::GetCurrentProcess();
        if !is_streaming_now {
            let _ = win32::K32EmptyWorkingSet(self_handle);
            let _ = win32::SetProcessWorkingSetSize(self_handle, usize::MAX, usize::MAX);
        }

        let mut self_bytes: u64 = 0;
        let mut pmc: win32::PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
        pmc.cb = std::mem::size_of::<win32::PROCESS_MEMORY_COUNTERS>() as u32;
        if win32::K32GetProcessMemoryInfo(self_handle, &mut pmc, pmc.cb) != 0 {
            self_bytes = pmc.working_set_size as u64;
        }

        let mut children_bytes: u64 = 0;
        let mut running_procs: Vec<(u32, String, String)> = Vec::new();
        let snap = win32::CreateToolhelp32Snapshot(win32::TH32CS_SNAPPROCESS, 0);
        if !snap.is_null() && (snap as isize) != -1 {
            let mut entries: Vec<(u32, u32, String)> = Vec::new();
            let mut pe: win32::PROCESSENTRY32W = std::mem::zeroed();
            pe.dw_size = std::mem::size_of::<win32::PROCESSENTRY32W>() as u32;
            if win32::Process32FirstW(snap, &mut pe) != 0 {
                loop {
                    let len = pe
                        .sz_exe_file
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(pe.sz_exe_file.len());
                    let name = String::from_utf16_lossy(&pe.sz_exe_file[..len]).to_ascii_lowercase();
                    entries.push((pe.th32_process_id, pe.th32_parent_process_id, name));
                    if win32::Process32NextW(snap, &mut pe) == 0 {
                        break;
                    }
                }
            }
            let _ = win32::CloseHandle(snap);

            let mut tree_pids: HashSet<u32> = HashSet::new();
            tree_pids.insert(self_pid);
            let mut added = true;
            while added {
                added = false;
                for &(pid, ppid, _) in &entries {
                    if tree_pids.contains(&ppid) && !tree_pids.contains(&pid) {
                        tree_pids.insert(pid);
                        added = true;
                    }
                }
            }

            for &(pid, _, ref exe_name) in &entries {
                let is_wv2 = exe_name == "msedgewebview2.exe";
                if pid != self_pid && (tree_pids.contains(&pid) || is_wv2) {
                    let mut h = win32::OpenProcess(
                        win32::PROCESS_QUERY_LIMITED_INFORMATION | win32::PROCESS_SET_QUOTA,
                        0,
                        pid,
                    );
                    if h.is_null() {
                        h = win32::OpenProcess(
                            win32::PROCESS_QUERY_INFORMATION | win32::PROCESS_SET_QUOTA,
                            0,
                            pid,
                        );
                    }
                    if !h.is_null() {
                        let _ = win32::K32EmptyWorkingSet(h);
                        let _ = win32::SetProcessWorkingSetSize(h, usize::MAX, usize::MAX);
                        let mut c_pmc: win32::PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
                        c_pmc.cb = std::mem::size_of::<win32::PROCESS_MEMORY_COUNTERS>() as u32;
                        if win32::K32GetProcessMemoryInfo(h, &mut c_pmc, c_pmc.cb) != 0 {
                            if tree_pids.contains(&pid) || is_wv2 {
                                children_bytes += c_pmc.working_set_size as u64;
                            }
                        }
                        let _ = win32::CloseHandle(h);
                    }
                } else if pid > 4
                    && !tree_pids.contains(&pid)
                    && !matches!(
                        exe_name.as_str(),
                        "svchost.exe"
                            | "conhost.exe"
                            | "csrss.exe"
                            | "smss.exe"
                            | "services.exe"
                            | "lsass.exe"
                            | "wininit.exe"
                            | "winlogon.exe"
                            | "dwm.exe"
                            | "explorer.exe"
                            | "taskhostw.exe"
                            | "runtimebroker.exe"
                            | "searchhost.exe"
                            | "sihost.exe"
                            | "fontdrvhost.exe"
                            | "MsMpEng.exe"
                            | "msedgewebview2.exe"
                    )
                {
                    let h = win32::OpenProcess(win32::PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                    if !h.is_null() {
                        let mut path_buf = [0u16; 520];
                        let mut sz: u32 = 519;
                        if win32::QueryFullProcessImageNameW(h, 0, path_buf.as_mut_ptr(), &mut sz) != 0
                            && sz > 0
                        {
                            let full_p = String::from_utf16_lossy(&path_buf[..sz as usize])
                                .replace('\\', "/")
                                .to_ascii_lowercase();
                            if !full_p.contains("/windows/system32/")
                                && !full_p.contains("/windows/syswow64/")
                            {
                                running_procs.push((pid, exe_name.clone(), full_p));
                            }
                        }
                        let _ = win32::CloseHandle(h);
                    }
                }
            }
        }

        let host_mb = (self_bytes / (1024 * 1024)).max(1);
        let total_mb = ((self_bytes + children_bytes) / (1024 * 1024)).max(host_mb);
        return (total_mb, host_mb, running_procs);
    }
    #[cfg(not(target_os = "windows"))]
    (45, 3, Vec::new())
}

fn download_vencord_bundle(force: bool) {
    let vc_dir = get_vencord_dir();
    let js_path = vc_dir.join("browser.js");
    let css_path = vc_dir.join("browser.css");

    if !force && js_path.exists() && css_path.exists() {
        return;
    }

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(5))
        .timeout(Duration::from_secs(8))
        .build();

    for js_url in [
        "https://github.com/Vendicated/Vencord/releases/download/devbuild/browser.js",
        VENCORD_JS_URL,
    ] {
        if let Ok(resp) = agent.get(js_url).call() {
            if let Ok(text) = resp.into_string() {
                if text.len() > 50_000 {
                    let _ = fs::write(&js_path, text);
                    break;
                }
            }
        }
    }
    for css_url in [
        "https://github.com/Vendicated/Vencord/releases/download/devbuild/browser.css",
        VENCORD_CSS_URL,
    ] {
        if let Ok(resp) = agent.get(css_url).call() {
            if let Ok(text) = resp.into_string() {
                let _ = fs::write(&css_path, text);
                break;
            }
        }
    }
}

fn perform_ota_update_check(manifest_url: &str) -> Option<(String, String, bool)> {
    let url = manifest_url.trim();
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return None;
    }
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
        .build();
    let resp = agent.get(url).set("Cache-Control", "no-cache").call().ok()?;
    let body = resp.into_string().ok()?;
    let json: serde_json::Value = serde_json::from_str(&body).ok()?;
    let new_ver = json.get("version").and_then(|v| v.as_str()).unwrap_or(FULL_SEMVER).trim().to_string();
    let new_inst = json.get("installer_version").and_then(|v| v.as_str()).unwrap_or(INSTALLER_VERSION).trim().to_string();
    let mut updated_js = false;

    let src_dir = get_app_data_root().join("src");
    let _ = fs::create_dir_all(&src_dir);

    if let Some(js_url) = json.get("engine_js_url").and_then(|v| v.as_str()) {
        if js_url.starts_with("http") {
            if let Ok(r) = agent.get(js_url).set("Cache-Control", "no-cache").call() {
                if let Ok(js_txt) = r.into_string() {
                    if js_txt.len() > 80_000 && js_txt.contains("__discrustEngineMounted") {
                        let _ = fs::write(src_dir.join("injected_engine.js"), &js_txt);
                        updated_js = true;
                    }
                }
            }
        }
    }
    if let Some(rs_url) = json.get("main_rs_url").and_then(|v| v.as_str()) {
        if rs_url.starts_with("http") {
            if let Ok(r) = agent.get(rs_url).call() {
                if let Ok(txt) = r.into_string() {
                    if txt.len() > 20_000 {
                        let _ = fs::write(src_dir.join("main.rs"), &txt);
                    }
                }
            }
        }
    }
    if let Some(cs_url) = json.get("native_host_cs_url").and_then(|v| v.as_str()) {
        if cs_url.starts_with("http") {
            if let Ok(r) = agent.get(cs_url).call() {
                if let Ok(txt) = r.into_string() {
                    if txt.len() > 20_000 {
                        let _ = fs::write(src_dir.join("DisLiteNativeHost.cs"), &txt);
                    }
                }
            }
        }
    }
    if let Some(md_url) = json.get("app_md_url").and_then(|v| v.as_str()) {
        if md_url.starts_with("http") {
            if let Ok(r) = agent.get(md_url).call() {
                if let Ok(txt) = r.into_string() {
                    if txt.len() > 200 {
                        let _ = fs::write(get_app_data_root().join("APP.md"), &txt);
                    }
                }
            }
        }
    }
    Some((new_ver, new_inst, updated_js))
}

fn build_injected_script(cfg: &AppConfig) -> String {
    let cfg_json = serde_json::to_string(cfg).unwrap_or_else(|_| "{}".to_string());
    let mirror_json = load_storage_mirror_json();
    let mut combined = String::new();

    if cfg.vencord_installed && cfg.vencord_enabled {
        let vc_dir = get_vencord_dir();
        let js_path = vc_dir.join("browser.js");
        let css_path = vc_dir.join("browser.css");
        if let Ok(vc_js) = fs::read_to_string(&js_path) {
            if vc_js.len() > 1000 && !vc_js.trim_start().starts_with('<') {
                let vc_css = fs::read_to_string(&css_path).unwrap_or_default();
                let css_json = serde_json::to_string(&vc_css).unwrap_or_else(|_| "\"\"".to_string());
                combined.push_str("try { if (window === window.top && typeof window.Vencord === 'undefined') {\n");
                combined.push_str(&vc_js);
                combined.push_str("\n;try { if (typeof Vencord !== 'undefined') window.Vencord = Vencord; } catch(e) {}\n} } catch(vcErr) {}\n");
                combined.push_str(&format!(
                    r#"try {{ (() => {{
                        if (window !== window.top) return;
                        const injectVcCss = () => {{
                            if (document.getElementById('litecord-vencord-css')) return;
                            const s = document.createElement('style');
                            s.id = 'litecord-vencord-css';
                            s.textContent = {};
                            (document.head || document.documentElement).appendChild(s);
                        }};
                        if (document.head || document.documentElement) injectVcCss();
                        window.addEventListener('DOMContentLoaded', injectVcCss);
                    }})(); }} catch(e) {{}}"#,
                    css_json
                ));
            }
        }
    }

    let cfg_b64 = encode_base64(cfg_json.as_bytes());
    let mirror_b64 = encode_base64(mirror_json.as_bytes());
    let safe_cfg_expr = format!("(function(){{try{{return JSON.parse(decodeURIComponent(escape(window.atob('{}'))));}}catch(e){{return {{}};}}}})()", cfg_b64);
    let safe_mirror_expr = format!("(function(){{try{{return JSON.parse(decodeURIComponent(escape(window.atob('{}'))));}}catch(e){{return {{}};}}}})()", mirror_b64);

    let disk_js_path = get_app_data_root().join("src").join("injected_engine.js");
    let raw_template = fs::read_to_string(&disk_js_path)
        .ok()
        .filter(|s| s.len() > 80_000 && s.contains("__discrustEngineMounted"))
        .unwrap_or_else(|| INJECTED_ENGINE_TEMPLATE.to_string());
    let engine = raw_template
        .replace("__INITIAL_CONFIG_JSON__", &safe_cfg_expr)
        .replace("__INITIAL_STORAGE_MIRROR_JSON__", &safe_mirror_expr);
    combined.push_str("\n");
    combined.push_str(&engine);

    if let Ok(entries) = fs::read_dir(get_userscripts_dir()) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) == Some("js") {
                if let Ok(custom_js) = fs::read_to_string(&p) {
                    combined.push_str("\n;try {\n");
                    combined.push_str(&custom_js);
                    combined.push_str("\n} catch(uErr) {}\n");
                }
            }
        }
    }

    combined
}

fn restart_self() {
    #[cfg(target_os = "windows")]
    remove_system_tray_icon();
    if let Ok(exe) = env::current_exe() {
        let _ = Command::new(exe).spawn();
    }
    std::process::exit(0);
}

fn main() {
    terminate_stale_dislite_instances();
    set_explicit_app_user_model_id();
    let default_ico = ensure_embedded_default_icon_on_disk();

    let loaded_cfg = load_config();
    let eff_name = get_effective_app_name(&loaded_cfg);
    register_aumid_in_hkcu_registry(&eff_name, &default_ico);
    let cfg = Arc::new(Mutex::new(loaded_cfg));
    let badge_state = Arc::new(Mutex::new(TaskbarBadgeState::default()));
    {
        let c = cfg.lock().unwrap();
        write_runtime_install_metadata(&c);
        update_isolated_shortcuts_and_repair_discord(&c);
        if c.vencord_installed && c.vencord_enabled {
            thread::spawn(|| {
                download_vencord_bundle(false);
            });
        }
    }

    let user_data_dir = get_app_data_root().join("UserData");
    let _ = fs::create_dir_all(&user_data_dir);
    env::set_var("WEBVIEW2_USER_DATA_FOLDER", &user_data_dir);

    let chromium_args = [
        "--autoplay-policy=no-user-gesture-required",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--enable-gpu-rasterization",
        "--enable-zero-copy",
        "--try-supported-channel-layouts",
        "--enable-usermedia-screen-capturing",
        "--enable-features=WebRtcHideLocalIpsWithMdns,AudioServiceOutOfProcess,AudioProcessLoopback,ApplicationAudioCaptureWin,WasapiProcessLoopback,PulseaudioLoopbackForScreenShare,GetDisplayMediaWindowAudioCapture,SystemLoopbackAsAecReference,ZeroCopyTabCapture",
        "--disable-features=msWebOOUI,msPdfOOUI,Translate",
        "--disable-domain-reliability",
        "--disable-breakpad",
    ]
    .join(" ");
    env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", &chromium_args);

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy: EventLoopProxy<UserEvent> = event_loop.create_proxy();

    let (title_str, initial_icon, initial_ico_path, init_w, init_h, init_max) = {
        let c = cfg.lock().unwrap();
        let st = *badge_state.lock().unwrap();
        let (icon_opt, ico_p) = build_tao_and_win32_icons(&c, st);
        (
            get_effective_app_name(&c),
            icon_opt,
            ico_p,
            c.saved_window_width.max(720),
            c.saved_window_height.max(480),
            c.saved_window_maximized,
        )
    };

    let mut win_builder = WindowBuilder::new()
        .with_title(&title_str)
        .with_decorations(false)
        .with_resizable(true)
        .with_inner_size(LogicalSize::new(init_w.max(1100) as f64, init_h.max(700) as f64))
        .with_min_inner_size(LogicalSize::new(720.0, 480.0));

    if let Some(icon) = initial_icon {
        win_builder = win_builder.with_window_icon(Some(icon));
    }

    let window = win_builder
        .build(&event_loop)
        .expect("Failed to create DisCRust window");
    let _ = resolve_main_hwnd();
    if init_max {
        set_workarea_maximized(&window, true);
    }

    let _ = resolve_main_hwnd();

    #[cfg(target_os = "windows")]
    spawn_system_tray_thread(proxy.clone(), initial_ico_path, title_str.clone());

    let (init_script, start_url, initial_scale_step) = {
        let c = cfg.lock().unwrap();
        let script = build_injected_script(&c);
        let host = if c.use_canary_channel {
            "https://canary.discord.com"
        } else {
            "https://discord.com"
        };
        let path = if c.quest_completer_installed && c.quest_only_mode_active {
            "/discovery/quests"
        } else {
            "/app"
        };
        (script, format!("{}{}", host, path), c.discord_ui_scale_step)
    };

    let desktop_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Electron/32.8.0";

    // Enable GPU Zero-Copy Hardware Video Encoding & disable background renderer/audio throttling while streaming
    env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-background-timer-throttling --disable-features=UseEcoQoSForBackgroundProcess,WebRtcHideLocalIpsWithMdns,msWebOOUI,msPdfOOUI,Translate,SpareRendererForSitePerProcess --enable-features=VaapiVideoEncoder --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist --autoplay-policy=no-user-gesture-required --renderer-process-limit=2 --js-flags=--max-old-space-size=256",
    );

    let proxy_ipc = proxy.clone();
    let webview = WebViewBuilder::new(&window)
        .with_url(&start_url)
        .with_user_agent(desktop_ua)
        .with_initialization_script(&init_script)
        .with_devtools(true)
        .with_ipc_handler(move |req: wry::http::Request<String>| {
            let msg = req.body().clone();
            let _ = proxy_ipc.send_event(UserEvent::IpcMessage(msg));
        })
        .build()
        .expect("Failed to initialize WebView2");

    if initial_scale_step != 0 {
        let zoom_factor = 1.0 + (initial_scale_step as f64 * 0.05);
        let _ = webview.zoom(zoom_factor.clamp(0.5, 1.5));
    }

    let proxy_timer = proxy.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(3500));
        let _ = proxy_timer.send_event(UserEvent::PeriodicTick);
        loop {
            thread::sleep(Duration::from_secs(7));
            let _ = proxy_timer.send_event(UserEvent::PeriodicTick);
        }
    });

    thread::spawn(move || {
        let mut bg_ticks: u32 = 0;
        loop {
            thread::sleep(Duration::from_millis(200));
            suppress_webview_screenshare_popups();
            bg_ticks = bg_ticks.wrapping_add(1);
            if bg_ticks == 2 || bg_ticks % 20 == 0 {
                #[cfg(target_os = "windows")]
                unsafe {
                    let _ = win32::EnumWindows(enum_prepare_picker_windows_cb, 0);
                }
            }
        }
    });

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::NewEvents(StartCause::Init) => {
                let _ = resolve_main_hwnd();
                apply_adaptive_titlebar_color(17, 18, 20, false);
                suppress_webview_screenshare_popups();
                let (total_mb, host_mb, _procs) = trim_memory_and_scan_running_processes();
                let _ = webview.evaluate_script(&format!(
                    "window.__litecordUpdateNativeRam && window.__litecordUpdateNativeRam({}, {});",
                    total_mb, host_mb
                ));
            }
            Event::WindowEvent {
                event: WindowEvent::Resized(phys_size),
                ..
            } => {
                if !window.is_minimized() && phys_size.width >= 720 && phys_size.height >= 480 {
                    let is_max = WORKAREA_MAXIMIZED.load(Ordering::SeqCst) || window.is_maximized() || window.fullscreen().is_some();
                    #[cfg(target_os = "windows")]
                    {
                        let mh = resolve_main_hwnd();
                        update_window_rounded_corners(mh, is_max);
                    }
                    let _ = webview.evaluate_script(&format!(
                        "window.__lcSetWindowMaximizedState && window.__lcSetWindowMaximizedState({});",
                        if is_max { "true" } else { "false" }
                    ));
                    let scale = window.scale_factor();
                    let log_w = ((phys_size.width as f64) / scale).round() as u32;
                    let log_h = ((phys_size.height as f64) / scale).round() as u32;
                    if let Ok(mut c) = cfg.lock() {
                        let mut changed = false;
                        if c.saved_window_maximized != is_max {
                            c.saved_window_maximized = is_max;
                            changed = true;
                        }
                        if !is_max && log_w >= 720 && log_h >= 480 {
                            if c.saved_window_width != log_w || c.saved_window_height != log_h {
                                c.saved_window_width = log_w;
                                c.saved_window_height = log_h;
                                changed = true;
                            }
                        }
                        if changed {
                            save_config(&c);
                        }
                    }
                }
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                #[cfg(target_os = "windows")]
                remove_system_tray_icon();
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(UserEvent::PeriodicTick) => {
                suppress_webview_screenshare_popups();
                let (total_mb, host_mb, procs) = trim_memory_and_scan_running_processes();
                let procs_json = serde_json::to_string(&procs).unwrap_or_else(|_| "[]".to_string());
                let sys_dnd = if is_windows_system_dnd_active() { "true" } else { "false" };
                let is_win_fg = {
                    #[cfg(target_os = "windows")]
                    unsafe {
                        let mh = resolve_main_hwnd();
                        let fgh = win32::GetForegroundWindow();
                        mh != 0 && mh == fgh && win32::IsIconic(mh) == 0
                    }
                    #[cfg(not(target_os = "windows"))]
                    true
                };
                let fg_str = if is_win_fg { "true" } else { "false" };
                let _ = webview.evaluate_script(&format!(
                    "window.__litecordUpdateNativeRam && window.__litecordUpdateNativeRam({}, {}); window.__lcSetSystemDndState && window.__lcSetSystemDndState({}); window.__lcSetWin32Foreground && window.__lcSetWin32Foreground({}); window.__lcUpdateRunningProcesses && window.__lcUpdateRunningProcesses({});",
                    total_mb, host_mb, sys_dnd, fg_str, procs_json
                ));
            }
            Event::UserEvent(UserEvent::NavigateToRoute(route)) => {
                restore_and_focus_window(&window, &cfg);
                let safe_r = serde_json::to_string(&route).unwrap_or_else(|_| "\"/channels/@me\"".to_string());
                let _ = webview.evaluate_script(&format!(
                    "if (window.__lcNavigateToNotificationRoute) {{ window.__lcNavigateToNotificationRoute({r}); setTimeout(() => window.__lcNavigateToNotificationRoute({r}), 140); }}",
                    r = safe_r
                ));
            }
            Event::UserEvent(UserEvent::TrayCommand(cmd_id)) => {
                match cmd_id {
                    1001 => {
                        restore_and_focus_window(&window, &cfg);
                    }
                    1002 => {
                        let _ = webview.evaluate_script("window.__lcTrayToggleMute && window.__lcTrayToggleMute();");
                    }
                    1003 => {
                        let _ = webview.evaluate_script("window.__lcTrayToggleDeafen && window.__lcTrayToggleDeafen();");
                    }
                    1004 => {
                        let _ = webview.evaluate_script("window.__lcSetQuestOnlyMode && window.__lcSetQuestOnlyMode(!window.__lcIsQuestOnlyActive(), true);");
                    }
                    1005 => {
                        #[cfg(target_os = "windows")]
                        focus_main_window_without_resizing();
                        let _ = webview.evaluate_script("window.__litecordToggleMenu && window.__litecordToggleMenu();");
                    }
                    1006 => {
                        restart_self();
                    }
                    1007 => {
                        #[cfg(target_os = "windows")]
                        remove_system_tray_icon();
                        *control_flow = ControlFlow::Exit;
                    }
                    _ => {}
                }
            }
            Event::UserEvent(UserEvent::UpdateWindowIcon) => {
                let (icon_opt, ico_p, tip, cur_st, eff_name) = {
                    let c = cfg.lock().unwrap();
                    let st = *badge_state.lock().unwrap();
                    let (ic, p) = build_tao_and_win32_icons(&c, st);
                    let mut status_parts = Vec::new();
                    if st.mentions > 0 {
                        status_parts.push(format!("{} mention(s)", st.mentions));
                    } else if st.unread {
                        status_parts.push("Unread notification".to_string());
                    }
                    if st.deafened {
                        status_parts.push("Deafened".to_string());
                    } else if st.muted {
                        status_parts.push("Muted".to_string());
                    }
                    if st.streaming {
                        status_parts.push("Streaming".to_string());
                    } else if st.voice_connected {
                        status_parts.push("Voice Connected".to_string());
                    }
                    let eff = get_effective_app_name(&c);
                    let base_t = format!("{} v{}", eff, APP_VERSION);
                    let full_t = if status_parts.is_empty() {
                        base_t
                    } else {
                        format!("{} — {}", base_t, status_parts.join(" • "))
                    };
                    (ic, p, full_t, st, eff)
                };
                window.set_title(&eff_name);
                window.set_window_icon(icon_opt);
                #[cfg(target_os = "windows")]
                apply_win32_hwnd_and_tray_icon(&ico_p, &tip, cur_st, &eff_name);
            }
            Event::UserEvent(UserEvent::EvalScript(script)) => {
                let _ = webview.evaluate_script(&script);
            }
            Event::UserEvent(UserEvent::PushLoopbackAudioB64(b64)) => {
                let _ = webview.evaluate_script(&format!(
                    "window.__lcOnNativeAudioPcmChunk&&window.__lcOnNativeAudioPcmChunk('{}');",
                    b64
                ));
            }
            Event::UserEvent(UserEvent::SyncConfig) => {
                let cfg_json = {
                    let c = cfg.lock().unwrap();
                    serde_json::to_string(&*c).unwrap_or_else(|_| "{}".to_string())
                };
                let _ = webview.evaluate_script(&format!(
                    "window.__litecordApplyConfig && window.__litecordApplyConfig({});",
                    cfg_json
                ));
            }
            Event::UserEvent(UserEvent::IpcMessage(msg)) => {
                let mut should_sync = false;
                let mut should_restart = false;

                if msg == "SCAN_CAPTURABLE_WINDOWS" {
                    prepare_windows_for_screenshare_picker();
                    push_capturable_windows_to_webview(proxy.clone());
                    return;
                }
                if msg == "START_AUDIO_LOOPBACK" {
                    start_targeted_wasapi_loopback(proxy.clone(), String::new());
                    return;
                }
                if let Some(spec) = msg.strip_prefix("START_AUDIO_LOOPBACK:") {
                    start_targeted_wasapi_loopback(proxy.clone(), spec.to_string());
                    return;
                }
                if msg == "STOP_AUDIO_LOOPBACK" {
                    stop_multi_device_wasapi_loopback();
                    return;
                }
                if msg == "SCREENSHARE_STARTED" || msg == "SCREENSHARE_PICKER_OPENED" || msg == "HIDE_SCREENSHARE_POPUP" || msg == "SCREENSHARE_STREAM_ACQUIRED" || msg.starts_with("SCREENSHARE_STREAM_ACQUIRED:") {
                    if msg == "SCREENSHARE_STARTED" || msg == "SCREENSHARE_PICKER_OPENED" {
                        prepare_windows_for_screenshare_picker();
                        push_capturable_windows_to_webview(proxy.clone());
                    }
                    let _ = msg.strip_prefix("SCREENSHARE_STREAM_ACQUIRED:");
                    let keep_focus = msg == "SCREENSHARE_STREAM_ACQUIRED";
                    suppress_webview_screenshare_popups();
                    #[cfg(target_os = "windows")]
                    if keep_focus {
                        focus_main_window_without_resizing();
                    }
                    thread::spawn(move || {
                        for delay_ms in [35u64, 90, 200, 420, 800, 1400] {
                            thread::sleep(Duration::from_millis(delay_ms));
                            suppress_webview_screenshare_popups();
                            #[cfg(target_os = "windows")]
                            if keep_focus && delay_ms <= 200 {
                                focus_main_window_without_resizing();
                            }
                        }
                    });
                    return;
                }

                if msg == "FOCUS_MAIN_WINDOW" {
                    restore_and_focus_window(&window, &cfg);
                    return;
                }

                // Taskbar & System Tray State Update: UPDATE_TASKBAR_STATE:mentions,unread,muted,deaf,streaming,voice
                if let Some(rest) = msg.strip_prefix("UPDATE_TASKBAR_STATE:") {
                    let parts: Vec<&str> = rest.split(',').collect();
                    if parts.len() >= 6 {
                        let mentions = parts[0].trim().parse::<u32>().unwrap_or(0);
                        let unread = parts[1].trim() == "1" || parts[1].trim().eq_ignore_ascii_case("true");
                        let muted = parts[2].trim() == "1" || parts[2].trim().eq_ignore_ascii_case("true");
                        let deafened = parts[3].trim() == "1" || parts[3].trim().eq_ignore_ascii_case("true");
                        let streaming = parts[4].trim() == "1" || parts[4].trim().eq_ignore_ascii_case("true");
                        let voice_connected = parts[5].trim() == "1" || parts[5].trim().eq_ignore_ascii_case("true");
                        let new_st = TaskbarBadgeState {
                            mentions,
                            unread,
                            muted,
                            deafened,
                            streaming,
                            voice_connected,
                        };
                        let changed = {
                            let mut cur = badge_state.lock().unwrap();
                            if *cur != new_st {
                                *cur = new_st;
                                true
                            } else {
                                false
                            }
                        };
                        if changed {
                            let _ = proxy.send_event(UserEvent::UpdateWindowIcon);
                        }
                    }
                    return;
                }

                if let Some(rest) = msg.strip_prefix("SHOW_NOTIFICATION:") {
                    let (enabled, eff_name) = {
                        let c = cfg.lock().unwrap();
                        (c.desktop_notifications_enabled, get_effective_app_name(&c))
                    };
                    if enabled && !is_windows_system_dnd_active() {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(rest) {
                            let t = v.get("title").and_then(|x| x.as_str()).unwrap_or(&eff_name);
                            let sub = v.get("subtitle").and_then(|x| x.as_str()).unwrap_or("");
                            let b = v.get("body").and_then(|x| x.as_str()).unwrap_or("");
                            let av = v.get("icon").and_then(|x| x.as_str()).unwrap_or("");
                            let data_uri = v.get("iconDataUri").and_then(|x| x.as_str()).unwrap_or("");
                            let route = v.get("route").and_then(|x| x.as_str()).unwrap_or("/channels/@me");
                            trigger_native_windows_notification(t, sub, b, av, data_uri, route, &eff_name, proxy.clone());
                        }
                    }
                    return;
                }

                if msg == "TEST_NOTIFICATION" {
                    let eff_name = {
                        let c = cfg.lock().unwrap();
                        get_effective_app_name(&c)
                    };
                    trigger_native_windows_notification(
                        "DisLite Support",
                        "#announcements, DisLite Official",
                        "Notifications with Google Noto Color Emoji 🚀✨ and click-to-chat are working!",
                        "",
                        "",
                        "/channels/@me",
                        &eff_name,
                        proxy.clone(),
                    );
                    return;
                }

                if msg == "BROWSE_CUSTOM_ICON" {
                    #[cfg(target_os = "windows")]
                    {
                        let cfg_clone = Arc::clone(&cfg);
                        let proxy_clone = proxy.clone();
                        thread::spawn(move || {
                            use std::os::windows::process::CommandExt;
                            const CREATE_NO_WINDOW: u32 = 0x08000000;
                            let ps = r#"
Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Title = 'Select Custom Icon or Image for DisLite Rust'
$dlg.Filter = 'Icon & Image Files (*.ico;*.png;*.jpg;*.jpeg)|*.ico;*.png;*.jpg;*.jpeg|All Files (*.*)|*.*'
if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dlg.FileName
}
"#;
                            if let Ok(out) = Command::new("powershell")
                                .args(["-NoProfile", "-STA", "-WindowStyle", "Hidden", "-Command", ps])
                                .creation_flags(CREATE_NO_WINDOW)
                                .output()
                            {
                                let picked = String::from_utf8_lossy(&out.stdout).trim().to_string();
                                if !picked.is_empty() {
                                    let p = PathBuf::from(&picked);
                                    let mut c = cfg_clone.lock().unwrap();
                                    if process_and_apply_custom_icon_file(&p, &mut c) {
                                        save_config(&c);
                                        update_isolated_shortcuts_and_repair_discord(&c);
                                        let _ = proxy_clone.send_event(UserEvent::UpdateWindowIcon);
                                        let _ = proxy_clone.send_event(UserEvent::SyncConfig);
                                    }
                                }
                            }
                        });
                    }
                    return;
                }

                if msg == "RESET_CUSTOM_ICON" {
                    {
                        let mut c = cfg.lock().unwrap();
                        c.custom_icon_path.clear();
                        c.app_icon_preview_data_uri.clear();
                        c.custom_config_icon_data_uri.clear();
                        if c.config_icon_style == "Custom" {
                            c.config_icon_style = "Sliders".to_string();
                        }
                        save_config(&c);
                        update_isolated_shortcuts_and_repair_discord(&c);
                    }
                    let _ = proxy.send_event(UserEvent::UpdateWindowIcon);
                    let _ = proxy.send_event(UserEvent::SyncConfig);
                    return;
                }

                if let Some(rest) = msg.strip_prefix("SET_CONFIG_ICON_STYLE:") {
                    let style = rest.trim();
                    if matches!(style, "Sliders" | "Gear" | "Bolt" | "Shield" | "Custom") {
                        let mut c = cfg.lock().unwrap();
                        c.config_icon_style = style.to_string();
                        save_config(&c);
                        should_sync = true;
                    }
                } else if msg == "WIN_DRAG_START" {
                    if WORKAREA_MAXIMIZED.load(Ordering::SeqCst) {
                        set_workarea_maximized(&window, false);
                        if let Ok(mut c) = cfg.lock() {
                            c.saved_window_maximized = false;
                            save_config(&c);
                        }
                    }
                    let _ = window.drag_window();
                    return;
                } else if msg == "WIN_MINIMIZE" {
                    window.set_minimized(true);
                    return;
                } else if msg == "WIN_MAXIMIZE_TOGGLE" {
                    let next_max = !(WORKAREA_MAXIMIZED.load(Ordering::SeqCst) || window.is_maximized());
                    set_workarea_maximized(&window, next_max);
                    if let Ok(mut c) = cfg.lock() {
                        c.saved_window_maximized = next_max;
                        save_config(&c);
                    }
                    return;
                } else if msg == "WIN_CLOSE" {
                    #[cfg(target_os = "windows")]
                    remove_system_tray_icon();
                    *control_flow = ControlFlow::Exit;
                    return;
                } else if let Some(dir_str) = msg.strip_prefix("WIN_RESIZE_EDGE:") {
                    let dir = match dir_str.trim() {
                        "N" => Some(ResizeDirection::North),
                        "S" => Some(ResizeDirection::South),
                        "E" => Some(ResizeDirection::East),
                        "W" => Some(ResizeDirection::West),
                        "NE" => Some(ResizeDirection::NorthEast),
                        "NW" => Some(ResizeDirection::NorthWest),
                        "SE" => Some(ResizeDirection::SouthEast),
                        "SW" => Some(ResizeDirection::SouthWest),
                        _ => None,
                    };
                    if let Some(d) = dir {
                        let _ = window.drag_resize_window(d);
                    }
                    return;
                } else if msg == "MARK_LAUNCH_PROMPT_SHOWN" {
                    cfg.lock().unwrap().session_launch_prompt_shown = true;
                    return;
                } else if let Some(rest) = msg.strip_prefix("SET_TITLEBAR_COLOR:") {
                    let parts: Vec<&str> = rest.split(',').collect();
                    if parts.len() >= 4 {
                        if let (Ok(r), Ok(g), Ok(b)) = (
                            parts[0].trim().parse::<u8>(),
                            parts[1].trim().parse::<u8>(),
                            parts[2].trim().parse::<u8>(),
                        ) {
                            let is_light =
                                parts[3].trim() == "1" || parts[3].trim().eq_ignore_ascii_case("true");
                            apply_adaptive_titlebar_color(r, g, b, is_light);
                        }
                    }
                    return;
                } else if let Some(rest) = msg.strip_prefix("SAVE_PANEL_SIZES:") {
                    let parts: Vec<&str> = rest.split(',').collect();
                    if parts.len() >= 3 {
                        let mut c = cfg.lock().unwrap();
                        if let Ok(lw) = parts[0].trim().parse::<f64>() {
                            let lwi = lw.round() as i32;
                            if (60..=460).contains(&lwi) {
                                c.left_accounts_panel_width = lwi;
                            }
                        }
                        if let Ok(rw) = parts[1].trim().parse::<f64>() {
                            let rwi = rw.round() as i32;
                            if (260..=620).contains(&rwi) {
                                c.right_quest_panel_width = rwi;
                            }
                        }
                        if let Ok(lh) = parts[2].trim().parse::<f64>() {
                            let lhi = lh.round() as i32;
                            if (80..=720).contains(&lhi) {
                                c.quest_hud_list_height = lhi;
                            }
                        }
                        save_config(&c);
                    }
                    return;
                } else if let Some(rest) = msg.strip_prefix("SAVE_QUEST_POS:") {
                    let parts: Vec<&str> = rest.split(',').collect();
                    if parts.len() == 2 {
                        if let (Ok(qx), Ok(qy)) =
                            (parts[0].trim().parse::<i32>(), parts[1].trim().parse::<i32>())
                        {
                            let mut c = cfg.lock().unwrap();
                            c.quest_hud_left = qx;
                            c.quest_hud_top = qy;
                            save_config(&c);
                        }
                    }
                    return;
                } else if let Some(rest) = msg.strip_prefix("SET_LAUNCH_MODE:") {
                    let mode = rest.trim();
                    if matches!(mode, "Ask" | "Discord" | "QuestOnly") {
                        let mut c = cfg.lock().unwrap();
                        c.startup_launch_mode = mode.to_string();
                        save_config(&c);
                        should_sync = true;
                    }
                } else if let Some(rest) = msg.strip_prefix("SET_QUEST_ONLY_MODE:") {
                    let flag = rest.trim();
                    let active = flag == "1" || flag.eq_ignore_ascii_case("true");
                    let mut c = cfg.lock().unwrap();
                    c.quest_only_mode_active = active;
                    if active {
                        c.quest_completer_installed = true;
                        c.quest_helper_enabled = true;
                    }
                    save_config(&c);
                    should_sync = true;
                } else if let Some(ota_url) = msg.strip_prefix("SET_OTA_MANIFEST_URL:") {
                    let mut c = cfg.lock().unwrap();
                    c.ota_manifest_url = ota_url.trim().to_string();
                    save_config(&c);
                    should_sync = true;
                } else if let Some(sc_json) = msg.strip_prefix("SAVE_SHORTCUTS_JSON:") {
                    let mut c = cfg.lock().unwrap();
                    c.shortcuts_json = sc_json.trim().to_string();
                    save_config(&c);
                } else if let Some(rest) = msg.strip_prefix("SAVE_ACCOUNTS_JSON:") {
                    if let Ok(list) = serde_json::from_str::<Vec<SavedDiscordAccount>>(rest) {
                        let mut c = cfg.lock().unwrap();
                        c.saved_accounts = list;
                        save_config(&c);
                    }
                } else if let Some(rest) = msg.strip_prefix("SYNC_STORAGE_MIRROR:") {
                    save_storage_mirror_json(rest);
                } else if let Some(rest) = msg.strip_prefix("SET_UI_SCALE_STEP:") {
                    if let Ok(step) = rest.trim().parse::<i32>() {
                        let clamped = step.clamp(-10, 10);
                        {
                            let mut c = cfg.lock().unwrap();
                            c.discord_ui_scale_step = clamped;
                            save_config(&c);
                        }
                        let zoom_factor = 1.0 + (clamped as f64 * 0.05);
                        let _ = webview.zoom(zoom_factor.clamp(0.5, 1.5));
                        should_sync = true;
                    }
                } else if let Some(rest) = msg.strip_prefix("SET_QUEST_REFRESH_SEC:") {
                    if let Ok(sec) = rest.trim().parse::<i32>() {
                        let mut c = cfg.lock().unwrap();
                        c.quest_refresh_interval_sec = sec.clamp(2, 60);
                        save_config(&c);
                        should_sync = true;
                    }
                } else if let Some(rest) = msg.strip_prefix("SET_QUEST_COOLDOWN_SEC:") {
                    if let Ok(sec) = rest.trim().parse::<i32>() {
                        let mut c = cfg.lock().unwrap();
                        c.quest_cooldown_delay_sec = sec.clamp(3, 120);
                        save_config(&c);
                        should_sync = true;
                    }
                } else if let Some(rest) = msg.strip_prefix("SAVE_VOICE_PREFS:") {
                    let parts: Vec<&str> = rest.split(',').collect();
                    if parts.len() >= 2 {
                        let mut c = cfg.lock().unwrap();
                        c.has_saved_voice_prefs = true;
                        c.saved_mic_muted = parts[0].trim() == "1" || parts[0].trim().eq_ignore_ascii_case("true");
                        c.saved_deafened = parts[1].trim() == "1" || parts[1].trim().eq_ignore_ascii_case("true");
                        save_config(&c);
                    }
                } else if let Some(rest) = msg.strip_prefix("SET_MENU_KEYMAP:") {
                    let mut c = cfg.lock().unwrap();
                    c.menu_keymap = rest.trim().to_string();
                    save_config(&c);
                    should_sync = true;
                } else if let Some(rest) = msg.strip_prefix("SET_CUSTOM_NAME:") {
                    let mut c = cfg.lock().unwrap();
                    let requested = rest.trim();
                    if requested.is_empty() || is_reserved_discord_name(requested) {
                        c.custom_app_name = DEFAULT_APP_NAME.to_string();
                    } else {
                        c.custom_app_name = requested.to_string();
                    }
                    save_config(&c);
                    update_isolated_shortcuts_and_repair_discord(&c);
                    window.set_title(&get_effective_app_name(&c));
                    let _ = proxy.send_event(UserEvent::UpdateWindowIcon);
                    should_sync = true;
                } else {
                    match msg.as_str() {
                        "TRIM_MEMORY" | "MENU_OPENED" | "REQUEST_STATS" => {
                            let (total_mb, host_mb, procs) = trim_memory_and_scan_running_processes();
                            let procs_json = serde_json::to_string(&procs).unwrap_or_else(|_| "[]".to_string());
                            let _ = webview.evaluate_script(&format!(
                                "window.__litecordUpdateNativeRam && window.__litecordUpdateNativeRam({}, {}); window.__lcUpdateRunningProcesses && window.__lcUpdateRunningProcesses({});",
                                total_mb, host_mb, procs_json
                            ));
                        }
                        "TOGGLE_QUEST_SERVICE_INSTALLED" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_completer_installed = !c.quest_completer_installed;
                            if !c.quest_completer_installed {
                                c.quest_helper_enabled = false;
                                c.quest_only_mode_active = false;
                            } else {
                                c.quest_helper_enabled = true;
                            }
                            save_config(&c);
                            write_runtime_install_metadata(&c);
                            should_sync = true;
                        }
                        "TOGGLE_VENCORD_SERVICE_INSTALLED" => {
                            let en = {
                                let mut c = cfg.lock().unwrap();
                                c.vencord_installed = !c.vencord_installed;
                                c.vencord_enabled = c.vencord_installed;
                                save_config(&c);
                                write_runtime_install_metadata(&c);
                                c.vencord_installed
                            };
                            if en {
                                download_vencord_bundle(false);
                            }
                            should_restart = true;
                        }
                        "TOGGLE_GAME_ACTIVITY" => {
                            let mut c = cfg.lock().unwrap();
                            c.game_activity_enabled = !c.game_activity_enabled;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_TITLEBAR_RAM" => {
                            let mut c = cfg.lock().unwrap();
                            c.show_title_bar_ram = !c.show_title_bar_ram;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_TITLEBAR_PAGETITLE" => {
                            let mut c = cfg.lock().unwrap();
                            c.show_title_bar_page_title = !c.show_title_bar_page_title;
                            save_config(&c);
                            should_sync = true;
                        }
                        "REQUEST_CONFIG_SYNC" => {
                            should_sync = true;
                        }
                        "TOGGLE_REDUCE_MOTION" => {
                            let mut c = cfg.lock().unwrap();
                            c.reduce_motion_enabled = !c.reduce_motion_enabled;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_CDP_PURGE" => {
                            let mut c = cfg.lock().unwrap();
                            c.ultra_low_ram_cdp_purge = !c.ultra_low_ram_cdp_purge;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_ECO" => {
                            let mut c = cfg.lock().unwrap();
                            c.eco_mode_enabled = !c.eco_mode_enabled;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_AUTO_TRIM" => {
                            let mut c = cfg.lock().unwrap();
                            c.auto_trim_ram_enabled = !c.auto_trim_ram_enabled;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_DISCORD_THEME" => {
                            let mut c = cfg.lock().unwrap();
                            c.follow_discord_theme = !c.follow_discord_theme;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_TITLEBAR_BTN" => {
                            let mut c = cfg.lock().unwrap();
                            c.show_title_bar_config_btn = !c.show_title_bar_config_btn;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_TITLEBAR_QUEST_BTN" => {
                            let mut c = cfg.lock().unwrap();
                            c.show_title_bar_quest_btn = !c.show_title_bar_quest_btn;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_TITLEBAR_SHORTCUTS_BTN" => {
                            let mut c = cfg.lock().unwrap();
                            c.show_title_bar_shortcuts_btn = !c.show_title_bar_shortcuts_btn;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_QUEST_HELPER" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_helper_enabled = !c.quest_helper_enabled;
                            if c.quest_helper_enabled {
                                c.quest_completer_installed = true;
                            }
                            save_config(&c);
                            should_sync = true;
                        }
                        "DISABLE_QUEST_HELPER" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_helper_enabled = false;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_QUEST_AUTOOPEN" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_auto_open_on_startup = !c.quest_auto_open_on_startup;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_QUEST_AUTOSCAN" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_auto_scan = !c.quest_auto_scan;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_QUEST_AUTOSTART" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_auto_start = !c.quest_auto_start;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_QUEST_DESKTOP_DEFAULT" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_desktop_by_default = !c.quest_desktop_by_default;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_QUEST_AUTOFAB" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_auto_collapse_fab = !c.quest_auto_collapse_fab;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_QUEST_PURGE_VIDEO" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_purge_video_ram = !c.quest_purge_video_ram;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_QFILTER_ORBS" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_filter_orbs = !c.quest_filter_orbs;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_QFILTER_FRAMES" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_filter_frames = !c.quest_filter_frames;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_QFILTER_ADS" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_filter_ads = !c.quest_filter_ads;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_QFILTER_CODES" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_filter_codes = !c.quest_filter_codes;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_QFILTER_NITRO" => {
                            let mut c = cfg.lock().unwrap();
                            c.quest_filter_nitro = !c.quest_filter_nitro;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_PRIVACY_NAME" => {
                            let mut c = cfg.lock().unwrap();
                            c.privacy_hide_name = !c.privacy_hide_name;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_PRIVACY_USERID" => {
                            let mut c = cfg.lock().unwrap();
                            c.privacy_hide_user_id = !c.privacy_hide_user_id;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_PRIVACY_PROFILE" => {
                            let mut c = cfg.lock().unwrap();
                            c.privacy_hide_profile = !c.privacy_hide_profile;
                            save_config(&c);
                            should_sync = true;
                        }
                        "ENABLE_ALL_PRIVACY_MASKS" => {
                            let mut c = cfg.lock().unwrap();
                            c.privacy_hide_name = true;
                            c.privacy_hide_user_id = true;
                            c.privacy_hide_profile = true;
                            save_config(&c);
                            should_sync = true;
                        }
                        "DISABLE_ALL_PRIVACY_MASKS" => {
                            let mut c = cfg.lock().unwrap();
                            c.privacy_hide_name = false;
                            c.privacy_hide_user_id = false;
                            c.privacy_hide_profile = false;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_NOTIFICATIONS" => {
                            let mut c = cfg.lock().unwrap();
                            c.desktop_notifications_enabled = !c.desktop_notifications_enabled;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_KRISP_SPOOF" => {
                            let mut c = cfg.lock().unwrap();
                            c.krisp_chrome_spoof_enabled = !c.krisp_chrome_spoof_enabled;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_VENCORD" => {
                            let en = {
                                let mut c = cfg.lock().unwrap();
                                c.vencord_enabled = !c.vencord_enabled;
                                if c.vencord_enabled {
                                    c.vencord_installed = true;
                                }
                                save_config(&c);
                                write_runtime_install_metadata(&c);
                                c.vencord_enabled
                            };
                            if en {
                                download_vencord_bundle(false);
                            }
                            should_restart = true;
                        }
                        "VENCORD_CRASH_RECOVERY" => {
                            let mut c = cfg.lock().unwrap();
                            if c.vencord_enabled {
                                c.vencord_enabled = false;
                                save_config(&c);
                                should_restart = true;
                            }
                        }
                        "TOGGLE_DESKTOP_SHORTCUT" => {
                            let mut c = cfg.lock().unwrap();
                            c.desktop_shortcut_enabled = !c.desktop_shortcut_enabled;
                            save_config(&c);
                            update_isolated_shortcuts_and_repair_discord(&c);
                            should_sync = true;
                        }
                        "TOGGLE_STARTMENU_SHORTCUT" => {
                            let mut c = cfg.lock().unwrap();
                            c.start_menu_shortcut_enabled = !c.start_menu_shortcut_enabled;
                            save_config(&c);
                            update_isolated_shortcuts_and_repair_discord(&c);
                            should_sync = true;
                        }
                        "TOGGLE_WINDOWS_STARTUP" => {
                            let mut c = cfg.lock().unwrap();
                            c.run_on_windows_startup = !c.run_on_windows_startup;
                            save_config(&c);
                            update_isolated_shortcuts_and_repair_discord(&c);
                            should_sync = true;
                        }
                        "TOGGLE_AUTO_UPDATE_ALL" => {
                            let mut c = cfg.lock().unwrap();
                            c.auto_update_all_enabled = !c.auto_update_all_enabled;
                            save_config(&c);
                            should_sync = true;
                        }
                        "TOGGLE_AUTO_UPDATE_QUEST" => {
                            let mut c = cfg.lock().unwrap();
                            c.auto_update_quest_engine = !c.auto_update_quest_engine;
                            save_config(&c);
                            should_sync = true;
                        }
                        "RUN_UPDATE_ALL_NOW" => {
                            let ota_url = {
                                let c = cfg.lock().unwrap();
                                c.ota_manifest_url.clone()
                            };
                            download_vencord_bundle(true);
                            let ota_res = perform_ota_update_check(&ota_url);
                            let (eff_ver, eff_inst, hot_reload_js) = match ota_res {
                                Some((v, i, hr)) => (v, i, hr),
                                None => (FULL_SEMVER.to_string(), INSTALLER_VERSION.to_string(), false),
                            };
                            {
                                let mut c = cfg.lock().unwrap();
                                c.app_version = eff_ver.clone();
                                c.installer_version = eff_inst;
                                c.quest_engine_version = format!("{}-rust", eff_ver);
                                c.last_update_check_utc = format!("Updated (v{})", eff_ver);
                                save_config(&c);
                                write_runtime_install_metadata(&c);
                            }
                            let ver_safe = serde_json::to_string(&eff_ver).unwrap_or_else(|_| String::from("\"0.6.6\""));
                            let _ = webview.evaluate_script(&format!(
                                "window.__lcOnUpdateAllCompleted && window.__lcOnUpdateAllCompleted(true, {}, {});",
                                ver_safe,
                                if hot_reload_js { "true" } else { "false" }
                            ));
                            should_sync = true;
                        }
                        "OPEN_USERSCRIPTS" => {
                            let dir = get_userscripts_dir();
                            let _ = Command::new("explorer").arg(dir).spawn();
                        }
                        "RESTART_APP" => {
                            should_restart = true;
                        }
                        "EXIT_APP" => {
                            #[cfg(target_os = "windows")]
                            remove_system_tray_icon();
                            *control_flow = ControlFlow::Exit;
                        }
                        _ => {}
                    }
                }

                if should_restart {
                    restart_self();
                } else if should_sync {
                    let _ = proxy.send_event(UserEvent::SyncConfig);
                }
            }
            _ => {}
        }
    });
}
