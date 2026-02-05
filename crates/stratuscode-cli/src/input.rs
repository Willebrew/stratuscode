use std::sync::{Arc, Mutex};

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use base64::Engine;
use serde_json::json;

use crate::app::{
    collect_answers, ensure_file_index, file_query_from_input, insert_file_mention, select_option,
    selected_index, App, UiMode,
};
use crate::backend::BackendClient;
use crate::commands::{commands_list, execute_command, filter_commands, filter_models, parse_command, sort_models_by_provider};
use crate::constants::{IMAGE_MARKER, PASTE_CHAR_THRESHOLD, PASTE_LINE_THRESHOLD, PASTE_END, PASTE_START};

pub fn handle_paste(app: &mut App, text: String) {
    if matches!(app.mode, UiMode::Normal) {
        let line_count = text.lines().count();
        let is_large = line_count >= PASTE_LINE_THRESHOLD || text.len() >= PASTE_CHAR_THRESHOLD;
        if is_large {
            let insertion = format!("{}{}{}", PASTE_START, text, PASTE_END);
            app.input.insert_str(app.cursor, &insertion);
            app.cursor += insertion.len();
        } else {
            app.input.insert_str(app.cursor, &text);
            app.cursor += text.len();
        }
        app.mark_dirty();
    }
}

pub fn handle_key(app: &mut App, key: KeyEvent, client: &Arc<Mutex<BackendClient>>) {
    if handle_overlay_keys(app, key, client) {
        return;
    }

    app.pending_gg = false;

    match key.code {
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            if app.state.is_loading {
                let _ = client.lock().unwrap().call("abort", json!({}));
            } else {
                app.should_quit = true;
            }
        }
        KeyCode::Char('i') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.show_telemetry_details = !app.show_telemetry_details;
            app.mark_dirty();
        }
        KeyCode::Char('l') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            let _ = client.lock().unwrap().call("clear", json!({}));
            app.show_splash = true;
            app.needs_clear = true;
            app.input.clear();
            app.cursor = 0;
            app.attachments.clear();
            app.mark_dirty();
        }
        KeyCode::Char('n') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            let _ = client.lock().unwrap().call("clear", json!({}));
            app.show_splash = true;
            app.needs_clear = true;
            app.input.clear();
            app.cursor = 0;
            app.attachments.clear();
            app.mark_dirty();
        }
        KeyCode::Char('u') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.input.clear();
            app.cursor = 0;
            app.attachments.clear();
            app.mark_dirty();
        }
        KeyCode::Char('w') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            if app.cursor > 0 {
                let before = app.input[..app.cursor].trim_end();
                let last_space = before.rfind(' ').map(|i| i + 1).unwrap_or(0);
                let after = app.input[app.cursor..].to_string();
                app.input = format!("{}{}", &before[..last_space], after);
                app.cursor = last_space;
                app.mark_dirty();
            }
        }
        KeyCode::Char('a') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.cursor = 0;
            app.mark_dirty();
        }
        KeyCode::Char('e') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.cursor = app.input.len();
            app.mark_dirty();
        }
        KeyCode::Char('r') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            let next = match app.reasoning_effort.as_str() {
                "off" => "low",
                "low" => "medium",
                "medium" => "high",
                _ => "off",
            };
            app.reasoning_effort = next.to_string();
            let _ = client.lock().unwrap().call("set_reasoning_effort", json!({ "reasoningEffort": next }));
            app.set_toast(format!("Reasoning: {}", next));
        }
        KeyCode::Char('t') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.todos_expanded = !app.todos_expanded;
            app.mark_dirty();
            crate::app::refresh_todos(app, client);
        }
        KeyCode::Tab => {
            let next = if app.state.agent == "build" { "plan" } else { "build" };
            app.state.agent = next.to_string();
            let _ = client.lock().unwrap().call("set_agent", json!({ "agent": next }));
            app.mark_dirty();
        }
        KeyCode::Char('/') if app.input.is_empty() => {
            app.mode = UiMode::CommandPalette;
            app.command_query.clear();
            app.command_selected = 0;
            app.command_offset = 0;
            app.mark_dirty();
        }
        KeyCode::Up if app.mode == UiMode::Normal && app.input.is_empty() => {
            app.scroll_from_bottom = app.scroll_from_bottom.saturating_add(1);
            app.auto_scroll = false;
            app.mark_dirty();
        }
        KeyCode::Down if app.mode == UiMode::Normal && app.input.is_empty() => {
            app.scroll_from_bottom = app.scroll_from_bottom.saturating_sub(1);
            if app.scroll_from_bottom == 0 {
                app.auto_scroll = true;
            }
            app.mark_dirty();
        }
        KeyCode::PageUp if app.mode == UiMode::Normal && app.input.is_empty() => {
            app.scroll_from_bottom = app.scroll_from_bottom.saturating_add(10);
            app.auto_scroll = false;
            app.mark_dirty();
        }
        KeyCode::PageDown if app.mode == UiMode::Normal && app.input.is_empty() => {
            app.scroll_from_bottom = app.scroll_from_bottom.saturating_sub(10);
            if app.scroll_from_bottom == 0 {
                app.auto_scroll = true;
            }
            app.mark_dirty();
        }
        KeyCode::Home if app.mode == UiMode::Normal && app.input.is_empty() => {
            app.scroll_from_bottom = usize::MAX;
            app.auto_scroll = false;
            app.mark_dirty();
        }
        KeyCode::End if app.mode == UiMode::Normal && app.input.is_empty() => {
            app.scroll_from_bottom = 0;
            app.auto_scroll = true;
            app.mark_dirty();
        }
        KeyCode::Enter => {
            let content = app.input.trim().to_string();
            if content.starts_with('/') {
                if let Some((cmd, arg)) = parse_command(&content) {
                    execute_command(app, client, &cmd, arg);
                } else {
                    app.set_toast("Unknown command".to_string());
                }
                app.input.clear();
                app.cursor = 0;
                app.attachments.clear();
                app.mark_dirty();
                return;
            }
            if !content.is_empty() || !app.attachments.is_empty() {
                let text_content = app
                    .input
                    .replace(PASTE_START, "")
                    .replace(PASTE_END, "")
                    .replace(IMAGE_MARKER, "");
                let attachments = if app.attachments.is_empty() {
                    json!(null)
                } else {
                    json!(app.attachments.iter().map(|a| json!({
                        "type": "image",
                        "data": a.data,
                        "mime": a.mime
                    })).collect::<Vec<_>>())
                };
                let payload = json!({ "content": text_content, "attachments": attachments });
                app.input.clear();
                app.cursor = 0;
                app.attachments.clear();
                app.show_splash = false;
                app.auto_scroll = true;
                app.scroll_from_bottom = 0;
                app.mark_dirty();
                let client = client.clone();
                std::thread::spawn(move || {
                    let _ = client.lock().unwrap().call("send_message", payload);
                });
            }
        }
        KeyCode::Backspace => {
            if app.cursor > 0 {
                let removed = app.input.chars().nth(app.cursor - 1);
                app.input.remove(app.cursor - 1);
                app.cursor -= 1;
                if removed == Some(IMAGE_MARKER) {
                    let mut idx = 0usize;
                    for ch in app.input.chars().take(app.cursor) {
                        if ch == IMAGE_MARKER {
                            idx += 1;
                        }
                    }
                    if idx < app.attachments.len() {
                        app.attachments.remove(idx);
                    }
                }
                app.mark_dirty();
            }
        }
        KeyCode::Left => {
            if app.cursor > 0 {
                app.cursor -= 1;
                app.mark_dirty();
            }
        }
        KeyCode::Right => {
            if app.cursor < app.input.len() {
                app.cursor += 1;
                app.mark_dirty();
            }
        }
        KeyCode::Char('v') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            if let Some(data) = read_clipboard_image_base64() {
                app.input.insert(app.cursor, IMAGE_MARKER);
                app.cursor += 1;
                app.attachments.push(crate::app::AttachmentUpload { data, mime: "image/png".to_string() });
                app.set_toast("Image attached".to_string());
                app.mark_dirty();
            }
        }
        KeyCode::Char(ch) => {
            if !key.modifiers.contains(KeyModifiers::CONTROL) && !key.modifiers.contains(KeyModifiers::ALT) {
                app.input.insert(app.cursor, ch);
                app.cursor += 1;
                app.mark_dirty();
                if ch == '@' && !app.input.starts_with('/') {
                    app.mode = UiMode::FileMention;
                    app.file_selected = 0;
                    ensure_file_index(app);
                    app.mark_dirty();
                }
            }
        }
        KeyCode::Esc => {
            if app.state.is_loading {
                let _ = client.lock().unwrap().call("abort", json!({}));
            }
        }
        _ => {}
    }
}

pub fn handle_overlay_keys(app: &mut App, key: KeyEvent, client: &Arc<Mutex<BackendClient>>) -> bool {
    match app.mode {
        UiMode::CommandPalette => {
            let commands = filter_commands(&commands_list(), &app.command_query);
            let page_size = 10usize;
            let max_index = commands.len().saturating_sub(1);
            match key.code {
                KeyCode::Esc => {
                    app.mode = UiMode::Normal;
                }
                KeyCode::Up | KeyCode::Char('k') => {
                    app.command_selected = app.command_selected.saturating_sub(1);
                }
                KeyCode::Down | KeyCode::Char('j') => {
                    if app.command_selected + 1 < commands.len() {
                        app.command_selected += 1;
                    }
                }
                KeyCode::PageUp => {
                    app.command_selected = app.command_selected.saturating_sub(page_size);
                }
                KeyCode::PageDown => {
                    app.command_selected = (app.command_selected + page_size).min(max_index);
                }
                KeyCode::Backspace => {
                    app.command_query.pop();
                    app.command_selected = 0;
                    app.command_offset = 0;
                }
                KeyCode::Enter => {
                    if let Some(cmd) = commands.get(app.command_selected) {
                        execute_command(app, client, cmd, None);
                    }
                    if matches!(app.mode, UiMode::CommandPalette) {
                        app.mode = UiMode::Normal;
                    }
                    app.command_query.clear();
                    app.command_offset = 0;
                }
                KeyCode::Char(ch) => {
                    if !key.modifiers.contains(KeyModifiers::CONTROL) && !key.modifiers.contains(KeyModifiers::ALT) {
                        app.command_query.push(ch);
                        app.command_selected = 0;
                        app.command_offset = 0;
                    }
                }
                _ => {}
            }
            if commands.is_empty() {
                app.command_selected = 0;
                app.command_offset = 0;
            } else {
                if app.command_selected >= commands.len() {
                    app.command_selected = commands.len().saturating_sub(1);
                }
                if app.command_selected < app.command_offset {
                    app.command_offset = app.command_selected;
                } else if app.command_selected >= app.command_offset + page_size {
                    app.command_offset = app.command_selected + 1 - page_size;
                }
            }
            app.mark_dirty();
            return true;
        }
        UiMode::FileMention => {
            let query = file_query_from_input(&app.input, app.cursor);
            ensure_file_index(app);
            let results = crate::app::filter_files(&app.file_index, &query, 10);
            match key.code {
                KeyCode::Esc => app.mode = UiMode::Normal,
                KeyCode::Up => app.file_selected = app.file_selected.saturating_sub(1),
                KeyCode::Down => {
                    if app.file_selected + 1 < results.len() {
                        app.file_selected += 1;
                    }
                }
                KeyCode::Tab | KeyCode::Enter => {
                    if let Some(file) = results.get(app.file_selected) {
                        insert_file_mention(app, &file.relative_path);
                    }
                    app.mode = UiMode::Normal;
                }
                KeyCode::Backspace => {
                    if app.cursor > 0 {
                        app.input.remove(app.cursor - 1);
                        app.cursor -= 1;
                    }
                    if !app.input.contains('@') {
                        app.mode = UiMode::Normal;
                    }
                }
                KeyCode::Char(ch) => {
                    if !key.modifiers.contains(KeyModifiers::CONTROL) && !key.modifiers.contains(KeyModifiers::ALT) {
                        app.input.insert(app.cursor, ch);
                        app.cursor += 1;
                    }
                }
                _ => {}
            }
            app.mark_dirty();
            return true;
        }
        UiMode::ModelPicker => {
            let filtered = filter_models(&app.model_entries, &app.model_query);
            let filtered = sort_models_by_provider(&filtered);
            let total = filtered.len() + 1; // custom row
            match key.code {
                KeyCode::Esc => {
                    app.mode = UiMode::Normal;
                    app.custom_model_mode = false;
                    app.custom_model_input.clear();
                }
                KeyCode::Up => app.model_selected = app.model_selected.saturating_sub(1),
                KeyCode::Down => {
                    if app.model_selected + 1 < total {
                        app.model_selected += 1;
                    }
                }
                KeyCode::PageUp => {
                    app.model_selected = app.model_selected.saturating_sub(10);
                }
                KeyCode::PageDown => {
                    app.model_selected = (app.model_selected + 10).min(total.saturating_sub(1));
                }
                KeyCode::Enter => {
                    if app.model_selected == filtered.len() {
                        app.custom_model_mode = true;
                    } else if let Some(entry) = filtered.get(app.model_selected) {
                        let _ = client.lock().unwrap().call("set_model", json!({ "model": entry.id }));
                        if let Some(provider) = &entry.provider_key {
                            let _ = client.lock().unwrap().call("set_provider", json!({ "provider": provider }));
                        } else {
                            let _ = client.lock().unwrap().call("set_provider", json!({ "provider": null }));
                        }
                        let next_reasoning = if entry.reasoning.unwrap_or(false) { "medium" } else { "off" };
                        app.reasoning_effort = next_reasoning.to_string();
                        let _ = client.lock().unwrap().call("set_reasoning_effort", json!({ "reasoningEffort": next_reasoning }));
                        app.mode = UiMode::Normal;
                    }
                }
                KeyCode::Backspace => {
                    if app.custom_model_mode {
                        app.custom_model_input.pop();
                    } else {
                        app.model_query.pop();
                    }
                }
                KeyCode::Char(ch) => {
                    if !key.modifiers.contains(KeyModifiers::CONTROL) && !key.modifiers.contains(KeyModifiers::ALT) {
                        if app.custom_model_mode {
                            app.custom_model_input.push(ch);
                        } else {
                            app.model_query.push(ch);
                            app.model_selected = 0;
                            app.model_offset = 0;
                        }
                    }
                }
                _ => {}
            }
            if app.model_selected < app.model_offset {
                app.model_offset = app.model_selected;
            } else if app.model_selected >= app.model_offset + 10 {
                app.model_offset = app.model_selected + 1 - 10;
            }
            if app.custom_model_mode && key.code == KeyCode::Enter {
                if !app.custom_model_input.trim().is_empty() {
                    let model = app.custom_model_input.trim();
                    let _ = client.lock().unwrap().call("set_model", json!({ "model": model }));
                    let _ = client.lock().unwrap().call("set_provider", json!({ "provider": null }));
                    app.reasoning_effort = "off".to_string();
                    let _ = client.lock().unwrap().call("set_reasoning_effort", json!({ "reasoningEffort": "off" }));
                    app.mode = UiMode::Normal;
                    app.custom_model_mode = false;
                    app.custom_model_input.clear();
                }
            }
            app.mark_dirty();
            return true;
        }
        UiMode::SessionHistory => {
            match key.code {
                KeyCode::Esc => app.mode = UiMode::Normal,
                KeyCode::Up => app.session_selected = app.session_selected.saturating_sub(1),
                KeyCode::Down => {
                    if app.session_selected + 1 < app.session_list.len() {
                        app.session_selected += 1;
                    }
                }
                KeyCode::Char('d') => {
                    if let Some(sess) = app.session_list.get(app.session_selected) {
                        let _ = client.lock().unwrap().call("delete_session", json!({ "sessionId": sess.id }));
                        app.session_list.remove(app.session_selected);
                        if app.session_selected >= app.session_list.len() && !app.session_list.is_empty() {
                            app.session_selected = app.session_list.len() - 1;
                        }
                        app.history_needs_refresh = true;
                    }
                }
                KeyCode::Enter => {
                    if let Some(sess) = app.session_list.get(app.session_selected) {
                        let _ = client.lock().unwrap().call("load_session", json!({ "sessionId": sess.id }));
                    }
                    app.mode = UiMode::Normal;
                }
                _ => {}
            }
            app.mark_dirty();
            return true;
        }
        UiMode::QuestionPrompt => {
            if let Some(q) = &mut app.question {
                let total_options = q.options.len() + if q.allow_custom { 1 } else { 0 };
                match key.code {
                    KeyCode::Esc => {
                        if q.custom_active {
                            q.custom_active = false;
                            q.custom_input.clear();
                        } else {
                            let _ = client.lock().unwrap().call("skip_question", json!({ "id": q.id }));
                            app.question = None;
                            app.mode = UiMode::Normal;
                        }
                    }
                    KeyCode::Up => {
                        if !q.custom_active {
                            q.focused_index = q.focused_index.saturating_sub(1);
                        }
                    }
                    KeyCode::Down => {
                        if !q.custom_active && total_options > 0 {
                            q.focused_index = (q.focused_index + 1).min(total_options.saturating_sub(1));
                        }
                    }
                    KeyCode::Char(' ') => {
                        if q.allow_multiple && !q.custom_active {
                            if q.focused_index < q.options.len() {
                                select_option(q, q.focused_index);
                            } else if q.allow_custom {
                                q.custom_active = true;
                            }
                        }
                    }
                    KeyCode::Enter => {
                        if q.custom_active {
                            if !q.custom_input.trim().is_empty() {
                                let _ = client.lock().unwrap().call("answer_question", json!({ "id": q.id, "answers": vec![q.custom_input.trim()] }));
                                app.question = None;
                                app.mode = UiMode::Normal;
                            }
                        } else if q.allow_custom && q.focused_index == q.options.len() {
                            q.custom_active = true;
                        } else if q.allow_multiple {
                            let answers = collect_answers(q);
                            if !answers.is_empty() {
                                let _ = client.lock().unwrap().call("answer_question", json!({ "id": q.id, "answers": answers }));
                                app.question = None;
                                app.mode = UiMode::Normal;
                            } else if q.focused_index < q.options.len() {
                                let answer = q.options[q.focused_index].label.clone();
                                let _ = client.lock().unwrap().call("answer_question", json!({ "id": q.id, "answers": vec![answer] }));
                                app.question = None;
                                app.mode = UiMode::Normal;
                            }
                        } else if q.focused_index < q.options.len() {
                            let answer = q.options[q.focused_index].label.clone();
                            let _ = client.lock().unwrap().call("answer_question", json!({ "id": q.id, "answers": vec![answer] }));
                            app.question = None;
                            app.mode = UiMode::Normal;
                        }
                    }
                    KeyCode::Backspace => {
                        if q.custom_active {
                            q.custom_input.pop();
                        }
                    }
                    KeyCode::Char(ch) => {
                        if q.custom_active {
                            if !key.modifiers.contains(KeyModifiers::CONTROL) && !key.modifiers.contains(KeyModifiers::ALT) {
                                q.custom_input.push(ch);
                            }
                        } else {
                            if let Some(d) = ch.to_digit(10) {
                                let idx = d.saturating_sub(1) as usize;
                                if idx < q.options.len() {
                                    let answer = q.options[idx].label.clone();
                                    let _ = client.lock().unwrap().call("answer_question", json!({ "id": q.id, "answers": vec![answer] }));
                                    app.question = None;
                                    app.mode = UiMode::Normal;
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            app.mark_dirty();
            return true;
        }
        UiMode::PlanActions => {
            match key.code {
                KeyCode::Enter => {
                    let _ = client.lock().unwrap().call("send_message", json!({ "content": "The plan is approved. Read the plan file and start implementing.", "agentOverride": "build", "options": { "buildSwitch": true } }));
                    app.mode = UiMode::Normal;
                }
                KeyCode::Esc => {
                    let _ = client.lock().unwrap().call("reset_plan_exit", json!({}));
                    app.mode = UiMode::Normal;
                }
                _ => {}
            }
            app.mark_dirty();
            return true;
        }
        UiMode::HelpAbout => {
            if matches!(key.code, KeyCode::Esc | KeyCode::Enter) {
                app.mode = UiMode::Normal;
                app.mark_dirty();
            }
            return true;
        }
        UiMode::Normal => {}
    }
    false
}

fn read_clipboard_image_base64() -> Option<String> {
    let mut clipboard = arboard::Clipboard::new().ok()?;
    let image = clipboard.get_image().ok()?;
    let bytes = image.bytes.into_owned();
    Some(base64::engine::general_purpose::STANDARD.encode(bytes))
}
