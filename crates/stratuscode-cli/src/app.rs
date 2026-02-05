use serde::Deserialize;
use serde_json::json;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use walkdir::WalkDir;

use ratatui::text::Line;

use crate::backend::{BackendClient, BackendNotification, ChatState, TimelineEvent};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UiMode {
    Normal,
    CommandPalette,
    FileMention,
    ModelPicker,
    SessionHistory,
    QuestionPrompt,
    PlanActions,
    HelpAbout,
}

#[derive(Debug, Clone)]
pub struct CommandItem {
    pub name: &'static str,
    pub shortcut: Option<&'static str>,
    pub description: &'static str,
    pub action: &'static str,
}

#[derive(Debug, Clone)]
pub struct FileResult {
    pub relative_path: String,
    pub is_dir: bool,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    pub id: String,
    pub name: String,
    pub free: Option<bool>,
    pub provider_key: Option<String>,
    pub group: String,
    pub reasoning: Option<bool>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub message_count: Option<u64>,
    pub first_message: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    pub id: String,
    pub content: String,
    pub status: String,
    pub priority: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoCounts {
    pub pending: u64,
    pub in_progress: u64,
    pub completed: u64,
    pub total: u64,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOption {
    pub label: String,
    pub description: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionInfo {
    pub id: String,
    pub question: String,
    pub header: Option<String>,
    pub options: Vec<QuestionOption>,
    pub allow_multiple: Option<bool>,
    pub allow_custom: Option<bool>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingQuestion {
    pub id: String,
    pub session_id: String,
    pub questions: Vec<QuestionInfo>,
}

#[derive(Debug, Clone)]
pub struct QuestionState {
    pub id: String,
    pub question: String,
    pub header: Option<String>,
    pub options: Vec<QuestionOption>,
    pub allow_multiple: bool,
    pub allow_custom: bool,
    pub selected: Vec<bool>,
    pub focused_index: usize,
    pub custom_input: String,
    pub custom_active: bool,
}

#[derive(Debug, Clone)]
pub struct AttachmentUpload {
    pub data: String,
    pub mime: String,
}

pub struct App {
    pub state: ChatState,
    pub input: String,
    pub cursor: usize,
    pub should_quit: bool,
    pub reasoning_effort: String,
    pub mode: UiMode,
    pub command_query: String,
    pub command_selected: usize,
    pub command_offset: usize,
    pub file_selected: usize,
    pub model_query: String,
    pub model_selected: usize,
    pub model_offset: usize,
    pub model_entries: Vec<ModelEntry>,
    pub custom_model_mode: bool,
    pub custom_model_input: String,
    pub session_list: Vec<SessionInfo>,
    pub session_selected: usize,
    pub history_needs_refresh: bool,
    pub question: Option<QuestionState>,
    pub todos: Vec<TodoItem>,
    pub todo_counts: TodoCounts,
    pub compact_view: bool,
    pub scroll_from_bottom: usize,
    pub dirty: bool,
    pub toast: Option<(String, Instant)>,
    pub last_todos_refresh: Instant,
    pub last_question_poll: Instant,
    pub project_dir: String,
    pub pending_gg: bool,
    pub attachments: Vec<AttachmentUpload>,
    pub file_index: Vec<FileResult>,
    pub show_splash: bool,
    pub show_telemetry_details: bool,
    pub needs_clear: bool,
    pub timeline_revision: u64,
    pub timeline_cache_rev: u64,
    pub timeline_cache_width: usize,
    pub timeline_cache_compact: bool,
    pub timeline_cache: Vec<Line<'static>>,
    pub base_model: String,
    pub spinner_index: usize,
    pub todos_expanded: bool,
    pub todos_request_inflight: bool,
    pub question_request_inflight: bool,
    pub auto_scroll: bool,
    pub reindex_inflight: bool,
}

impl App {
    pub fn new(state: ChatState, project_dir: String, base_model: String) -> Self {
        let show_splash = state.timeline_events.is_empty();
        let reasoning_effort = state
            .reasoning_effort_override
            .clone()
            .unwrap_or_else(|| "off".to_string());
        Self {
            state,
            input: String::new(),
            cursor: 0,
            should_quit: false,
            reasoning_effort,
            mode: UiMode::Normal,
            command_query: String::new(),
            command_selected: 0,
            command_offset: 0,
            file_selected: 0,
            model_query: String::new(),
            model_selected: 0,
            model_offset: 0,
            model_entries: Vec::new(),
            custom_model_mode: false,
            custom_model_input: String::new(),
            session_list: Vec::new(),
            session_selected: 0,
            history_needs_refresh: false,
            question: None,
            todos: Vec::new(),
            todo_counts: TodoCounts { pending: 0, in_progress: 0, completed: 0, total: 0 },
            compact_view: false,
            scroll_from_bottom: 0,
            dirty: true,
            toast: None,
            last_todos_refresh: Instant::now(),
            last_question_poll: Instant::now(),
            project_dir,
            pending_gg: false,
            attachments: Vec::new(),
            file_index: Vec::new(),
            show_splash,
            show_telemetry_details: false,
            needs_clear: false,
            timeline_revision: 0,
            timeline_cache_rev: 0,
            timeline_cache_width: 0,
            timeline_cache_compact: false,
            timeline_cache: Vec::new(),
            base_model,
            spinner_index: 0,
            todos_expanded: false,
            todos_request_inflight: false,
            question_request_inflight: false,
            auto_scroll: true,
            reindex_inflight: false,
        }
    }

    pub fn mark_dirty(&mut self) {
        self.dirty = true;
    }

    pub fn set_toast(&mut self, msg: impl Into<String>) {
        self.toast = Some((msg.into(), Instant::now()));
        self.mark_dirty();
    }

    pub fn update_state(&mut self, next: ChatState) {
        let was_loading = self.state.is_loading;
        self.state = next;
        if let Some(re) = &self.state.reasoning_effort_override {
            self.reasoning_effort = re.clone();
        }
        if !self.state.timeline_events.is_empty() {
            self.show_splash = false;
        }
        if !was_loading && self.state.is_loading {
            self.auto_scroll = true;
            self.scroll_from_bottom = 0;
        }
        if self.auto_scroll {
            self.scroll_from_bottom = 0;
        }
        if matches!(self.mode, UiMode::SessionHistory) {
            self.history_needs_refresh = true;
        }
        self.timeline_revision = self.timeline_revision.saturating_add(1);
        self.mark_dirty();
    }

    pub fn upsert_timeline(&mut self, event: TimelineEvent) {
        if let Some(idx) = self.state.timeline_events.iter().position(|e| e.id == event.id) {
            self.state.timeline_events[idx] = event;
        } else {
            self.state.timeline_events.push(event);
        }
        self.show_splash = false;
        self.timeline_revision = self.timeline_revision.saturating_add(1);
        if self.auto_scroll {
            self.scroll_from_bottom = 0;
        }
        if matches!(self.mode, UiMode::SessionHistory) {
            self.history_needs_refresh = true;
        }
        self.mark_dirty();
    }

    pub fn handle_notification(&mut self, notif: BackendNotification) {
        match notif.method.as_str() {
            "state" => {
                if let Ok(next) = serde_json::from_value::<ChatState>(notif.params) {
                    self.update_state(next);
                }
            }
            "timeline_event" => {
                if let Ok(event) = serde_json::from_value::<TimelineEvent>(notif.params) {
                    if self.reindex_inflight
                        && event.kind == "tool_result"
                        && event.tool_name.as_deref() == Some("codesearch")
                    {
                        self.reindex_inflight = false;
                        self.set_toast("Reindex complete".to_string());
                    }
                    self.upsert_timeline(event);
                }
            }
            "tokens_update" => {
                if let Ok(update) = serde_json::from_value::<serde_json::Value>(notif.params) {
                    if let Some(tokens) = update.get("tokens") {
                        if let Ok(t) = serde_json::from_value(tokens.clone()) {
                            self.state.tokens = t;
                        }
                    }
                    if let Some(session_tokens) = update.get("sessionTokens") {
                        if let Ok(t) = serde_json::from_value(session_tokens.clone()) {
                            self.state.session_tokens = Some(t);
                        }
                    }
                    if let Some(context_usage) = update.get("contextUsage") {
                        if let Ok(c) = serde_json::from_value(context_usage.clone()) {
                            self.state.context_usage = c;
                        }
                    }
                    self.mark_dirty();
                }
            }
            "context_status" => {
                if let Ok(status) = serde_json::from_value::<String>(notif.params) {
                    self.state.context_status = Some(status);
                    self.mark_dirty();
                }
            }
            "plan_exit_proposed" => {
                if let Some(flag) = notif.params.as_bool() {
                    if flag && self.state.agent == "plan" {
                        self.mode = UiMode::PlanActions;
                    }
                }
                self.mark_dirty();
            }
            "session_changed" => {
                if let Some(id) = notif.params.as_str() {
                    self.state.session_id = Some(id.to_string());
                }
                if matches!(self.mode, UiMode::SessionHistory) {
                    self.history_needs_refresh = true;
                }
                self.mark_dirty();
            }
            "error" => {
                if let Some(s) = notif.params.as_str() {
                    self.set_toast(s.to_string());
                }
            }
            _ => {}
        }
    }
}

pub fn build_file_index(project_dir: &Path) -> Vec<FileResult> {
    let mut index = Vec::new();
    let excludes = [
        "node_modules", ".git", "dist", "build", ".next", ".cache", ".turbo", ".output",
        ".nuxt", "coverage", "__pycache__", ".stratuscode", ".vscode", ".idea",
    ];

    for entry in WalkDir::new(project_dir)
        .follow_links(false)
        .max_depth(6)
        .into_iter()
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            if name.starts_with('.') {
                return false;
            }
            if excludes.iter().any(|e| name == *e) {
                return false;
            }
            true
        })
        .filter_map(Result::ok)
    {
        let path = entry.path();
        let rel = match path.strip_prefix(project_dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let rel_str = rel.to_string_lossy().to_string();
        index.push(FileResult {
            relative_path: rel_str,
            is_dir: entry.file_type().is_dir(),
        });
    }

    index.sort_by(|a, b| {
        let a_depth = a.relative_path.matches('/').count();
        let b_depth = b.relative_path.matches('/').count();
        if a_depth != b_depth {
            a_depth.cmp(&b_depth)
        } else {
            a.relative_path.cmp(&b.relative_path)
        }
    });

    index
}

pub fn filter_files(index: &[FileResult], query: &str, max_results: usize) -> Vec<FileResult> {
    let lower = query.to_lowercase();
    let mut results = Vec::new();
    for item in index.iter() {
        if !lower.is_empty() && !item.relative_path.to_lowercase().contains(&lower) {
            continue;
        }
        results.push(item.clone());
        if results.len() >= max_results {
            break;
        }
    }
    results
}

pub fn ensure_file_index(app: &mut App) {
    if app.file_index.is_empty() {
        let index = build_file_index(Path::new(&app.project_dir));
        app.file_index = index;
    }
}

pub fn file_query_from_input(input: &str, cursor: usize) -> String {
    let upto = &input[..cursor.min(input.len())];
    if let Some(idx) = upto.rfind('@') {
        return upto[idx + 1..].to_string();
    }
    String::new()
}

pub fn insert_file_mention(app: &mut App, path: &str) {
    let upto = &app.input[..app.cursor];
    if let Some(idx) = upto.rfind('@') {
        let before = app.input[..idx + 1].to_string();
        let after = app.input[app.cursor..].to_string();
        app.input = format!("{}{} {}", before, path, after);
        app.cursor = before.len() + path.len() + 1;
    }
}

pub fn selected_index(selected: Vec<bool>) -> usize {
    selected.iter().position(|v| *v).unwrap_or(0)
}

pub fn select_option(q: &mut QuestionState, idx: usize) {
    if q.options.is_empty() {
        return;
    }
    if q.allow_multiple {
        if let Some(v) = q.selected.get_mut(idx) {
            *v = !*v;
        }
    } else {
        for v in q.selected.iter_mut() {
            *v = false;
        }
        if let Some(v) = q.selected.get_mut(idx) {
            *v = true;
        }
    }
}

pub fn collect_answers(q: &QuestionState) -> Vec<String> {
    let mut answers = Vec::new();
    for (i, opt) in q.options.iter().enumerate() {
        if *q.selected.get(i).unwrap_or(&false) {
            answers.push(opt.label.clone());
        }
    }
    if q.allow_custom && !q.custom_input.trim().is_empty() {
        answers.push(q.custom_input.trim().to_string());
    }
    answers
}

pub fn refresh_todos(app: &mut App, client: &Arc<Mutex<BackendClient>>) {
    if let Some(session_id) = &app.state.session_id {
        if let Ok(resp) = client.lock().unwrap().call("list_todos", json!({ "sessionId": session_id })) {
            if let Some(list_val) = resp.get("list") {
                if let Ok(list) = serde_json::from_value::<Vec<TodoItem>>(list_val.clone()) {
                    app.todos = list;
                }
            }
            if let Some(counts_val) = resp.get("counts") {
                if let Ok(counts) = serde_json::from_value::<TodoCounts>(counts_val.clone()) {
                    app.todo_counts = counts;
                }
            }
            app.mark_dirty();
        }
    }
}
