use serde_json::json;
use std::sync::{Arc, Mutex};

use crate::app::refresh_todos;
use crate::app::{App, CommandItem, ModelEntry, SessionInfo, UiMode};
use crate::backend::BackendClient;

pub fn commands_list() -> Vec<CommandItem> {
    vec![
        CommandItem {
            name: "new",
            shortcut: Some("n"),
            description: "Start a new session",
            action: "session:new",
        },
        CommandItem {
            name: "clear",
            shortcut: Some("c"),
            description: "Clear current conversation",
            action: "session:clear",
        },
        CommandItem {
            name: "history",
            shortcut: Some("h"),
            description: "View session history",
            action: "session:history",
        },
        CommandItem {
            name: "plan",
            shortcut: Some("p"),
            description: "Enter plan mode",
            action: "mode:plan",
        },
        CommandItem {
            name: "build",
            shortcut: Some("b"),
            description: "Exit plan mode and start building",
            action: "mode:build",
        },
        CommandItem {
            name: "reindex",
            shortcut: None,
            description: "Reindex codebase for search",
            action: "tool:reindex",
        },
        CommandItem {
            name: "todos",
            shortcut: Some("t"),
            description: "Show todo list",
            action: "tool:todos",
        },
        CommandItem {
            name: "revert",
            shortcut: Some("r"),
            description: "Revert files to previous state",
            action: "tool:revert",
        },
        CommandItem {
            name: "models",
            shortcut: Some("m"),
            description: "Change AI model",
            action: "settings:model",
        },
        CommandItem {
            name: "about",
            shortcut: None,
            description: "About StratusCode",
            action: "help:about",
        },
    ]
}

pub fn filter_commands(commands: &[CommandItem], query: &str) -> Vec<CommandItem> {
    if query.trim().is_empty() {
        return commands.to_vec();
    }
    let q = query.trim().to_lowercase();
    commands
        .iter()
        .filter(|c| {
            c.name.starts_with(&q)
                || c.description.to_lowercase().contains(&q)
                || c.shortcut.map(|s| s.starts_with(&q)).unwrap_or(false)
        })
        .cloned()
        .collect()
}

pub fn parse_command(input: &str) -> Option<(CommandItem, Option<String>)> {
    if !input.starts_with('/') {
        return None;
    }
    let trimmed = input.trim();
    let mut parts = trimmed[1..].splitn(2, ' ');
    let name = parts.next()?.to_lowercase();
    let arg = parts.next().map(|s| s.to_string());
    let commands = commands_list();
    let found = commands
        .into_iter()
        .find(|c| c.name == name || c.shortcut == Some(name.as_str()));
    found.map(|c| (c, arg))
}

pub fn execute_command(
    app: &mut App,
    client: &Arc<Mutex<BackendClient>>,
    cmd: &CommandItem,
    _arg: Option<String>,
) {
    match cmd.action {
        "session:new" | "session:clear" => {
            let _ = client.lock().unwrap().call("clear", json!({}));
            app.show_splash = true;
            app.needs_clear = true;
            app.input.clear();
            app.cursor = 0;
            app.attachments.clear();
        }
        "session:history" => {
            if let Ok(resp) = client.lock().unwrap().call("list_sessions", json!({ "projectDir": app.project_dir, "limit": 20, "currentSessionId": app.state.session_id })) {
                if let Ok(list) = serde_json::from_value::<Vec<SessionInfo>>(resp) {
                    app.session_list = list;
                    app.session_selected = 0;
                    app.mode = UiMode::SessionHistory;
                } else {
                    app.set_toast("Failed to parse sessions".to_string());
                }
            } else {
                app.set_toast("Failed to load sessions".to_string());
            }
        }
        "mode:plan" => {
            let _ = client.lock().unwrap().call("set_agent", json!({ "agent": "plan" }));
            app.state.agent = "plan".to_string();
        }
        "mode:build" => {
            let _ = client.lock().unwrap().call("set_agent", json!({ "agent": "build" }));
            app.state.agent = "build".to_string();
        }
        "tool:reindex" => {
            app.file_index.clear();
            app.reindex_inflight = true;
            app.set_toast("Reindexing...".to_string());
            let _ = client.lock().unwrap().call("execute_tool", json!({ "name": "codesearch", "args": { "query": "__reindex__", "reindex": true } }));
        }
        "tool:todos" => {
            app.todos_expanded = !app.todos_expanded;
            refresh_todos(app, client);
        }
        "tool:revert" => {
            let _ = client.lock().unwrap().call("execute_tool", json!({ "name": "revert", "args": {} }));
        }
        "settings:model" => {
            match client.lock().unwrap().call("list_models", json!({})) {
                Ok(resp) => {
                    if let Some(entries_val) = resp.get("entries") {
                        if let Ok(entries) = serde_json::from_value::<Vec<ModelEntry>>(entries_val.clone()) {
                            app.model_entries = entries;
                            app.model_query.clear();
                            app.model_selected = 0;
                            app.model_offset = 0;
                            app.mode = UiMode::ModelPicker;
                        } else {
                            app.set_toast("Failed to parse model list".to_string());
                        }
                    } else {
                        app.set_toast("Model list unavailable".to_string());
                    }
                }
                Err(_) => {
                    app.set_toast("Failed to load models".to_string());
                }
            }
        }
        "help:about" => {
            app.mode = UiMode::HelpAbout;
        }
        _ => {}
    }
    app.mark_dirty();
}

pub fn filter_models(entries: &[ModelEntry], query: &str) -> Vec<ModelEntry> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return entries.to_vec();
    }
    entries
        .iter()
        .filter(|e| {
            e.name.to_lowercase().contains(&q)
                || e.id.to_lowercase().contains(&q)
                || e.group.to_lowercase().contains(&q)
                || e.provider_key
                    .as_ref()
                    .map(|p| p.to_lowercase().contains(&q))
                    .unwrap_or(false)
        })
        .cloned()
        .collect()
}

pub fn sort_models_by_provider(entries: &[ModelEntry]) -> Vec<ModelEntry> {
    let mut groups: std::collections::BTreeMap<String, Vec<ModelEntry>> =
        std::collections::BTreeMap::new();
    for entry in entries {
        groups
            .entry(entry.group.clone())
            .or_default()
            .push(entry.clone());
    }

    let mut ordered_groups: Vec<(String, Vec<ModelEntry>)> = groups.into_iter().collect();
    ordered_groups.sort_by(|(a, _), (b, _)| {
        let a_is_openai = a.to_lowercase() == "openai";
        let b_is_openai = b.to_lowercase() == "openai";
        if a_is_openai && !b_is_openai {
            std::cmp::Ordering::Less
        } else if !a_is_openai && b_is_openai {
            std::cmp::Ordering::Greater
        } else {
            a.cmp(b)
        }
    });

    let mut sorted = Vec::new();
    for (_group, mut items) in ordered_groups {
        items.sort_by(|a, b| a.name.cmp(&b.name));
        sorted.extend(items);
    }
    sorted
}
