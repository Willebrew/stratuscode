use ratatui::style::Color;

pub const PASTE_START: char = '\u{FFF0}';
pub const PASTE_END: char = '\u{FFF1}';
pub const IMAGE_MARKER: char = '\u{FFFC}';
pub const SPINNER_FRAMES: [&str; 4] = ["|", "/", "-", "\\"];

pub const PASTE_LINE_THRESHOLD: usize = 3;
pub const PASTE_CHAR_THRESHOLD: usize = 150;

pub const COLOR_PURPLE: Color = Color::Rgb(157, 124, 216);
pub const COLOR_GREEN: Color = Color::Rgb(127, 216, 143);
pub const COLOR_ORANGE: Color = Color::Rgb(245, 167, 66);
pub const COLOR_YELLOW: Color = Color::Rgb(229, 192, 123);
pub const COLOR_CYAN: Color = Color::Rgb(86, 182, 194);
pub const COLOR_MUTED: Color = Color::Rgb(128, 128, 128);
pub const COLOR_TEXT: Color = Color::Rgb(224, 224, 224);
pub const COLOR_CODE: Color = Color::Rgb(124, 58, 237);
pub const COLOR_TEXT_MUTED: Color = Color::Rgb(159, 179, 209);
pub const COLOR_TEXT_DIM: Color = Color::Rgb(111, 122, 143);
pub const COLOR_SUCCESS: Color = Color::Rgb(16, 185, 129);
pub const COLOR_WARNING: Color = Color::Rgb(245, 158, 11);
pub const COLOR_ERROR: Color = Color::Rgb(248, 113, 113);
pub const COLOR_BG: Color = Color::Rgb(10, 14, 20);
pub const COLOR_BG_ALT: Color = Color::Rgb(15, 22, 36);
pub const COLOR_BORDER: Color = Color::Rgb(27, 35, 51);

pub const STRATUS_LOGO: [&str; 6] = [
    " ███████╗████████╗██████╗  █████╗ ████████╗██╗   ██╗███████╗",
    " ██╔════╝╚══██╔══╝██╔══██╗██╔══██╗╚══██╔══╝██║   ██║██╔════╝",
    " ███████╗   ██║   ██████╔╝███████║   ██║   ██║   ██║███████╗",
    " ╚════██║   ██║   ██╔══██╗██╔══██║   ██║   ██║   ██║╚════██║",
    " ███████║   ██║   ██║  ██║██║  ██║   ██║   ╚██████╔╝███████║",
    " ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚══════╝",
];

pub const CODE_LOGO: [&str; 6] = [
    "  ██████╗ ██████╗ ██████╗ ███████╗",
    " ██╔════╝██╔═══██╗██╔══██╗██╔════╝",
    " ██║     ██║   ██║██║  ██║█████╗",
    " ██║     ██║   ██║██║  ██║██╔══╝",
    " ╚██████╗╚██████╔╝██████╔╝███████╗",
    "  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝",
];

pub const S_LOGO: [&str; 6] = [
    " ███████╗",
    " ██╔════╝",
    " ███████╗",
    " ╚════██║",
    " ███████║",
    " ╚══════╝",
];

pub const C_LOGO: [&str; 6] = [
    "  ██████╗",
    " ██╔════╝",
    " ██║",
    " ██║",
    " ╚██████╗",
    "  ╚═════╝",
];
