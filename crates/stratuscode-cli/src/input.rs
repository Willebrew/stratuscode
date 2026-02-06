use std::sync::{Arc, Mutex};

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use base64::Engine;
use serde_json::json;

use crate::app::{
    collect_answers, ensure_file_index, file_query_from_input, insert_file_mention, select_option,
    App, UiMode,
};
use crate::backend::BackendClient;
use crate::commands::{commands_list, execute_command, filter_commands, filter_models, parse_command, sort_models_by_provider};
use crate::constants::{IMAGE_MARKER, PASTE_END, PASTE_START};

pub fn clamp_cursor(value: &str, cursor: usize) -> usize {
    let mut idx = cursor.min(value.len());
    while idx > 0 && !value.is_char_boundary(idx) {
        idx -= 1;
    }
    idx
}

fn prev_char_start(value: &str, cursor: usize) -> Option<usize> {
    let cursor = clamp_cursor(value, cursor);
    if cursor == 0 {
        return None;
    }
    value[..cursor].char_indices().last().map(|(i, _)| i)
}

fn char_at(value: &str, cursor: usize) -> Option<char> {
    let cursor = clamp_cursor(value, cursor);
    if cursor >= value.len() {
        return None;
    }
    value[cursor..].chars().next()
}

fn cursor_left(value: &str, cursor: usize) -> usize {
    let cursor = clamp_cursor(value, cursor);
    let Some(prev) = prev_char_start(value, cursor) else {
        return 0;
    };
    if value[prev..].chars().next() == Some(PASTE_END) {
        if let Some(start) = value[..prev].rfind(PASTE_START) {
            return start;
        }
    }
    prev
}

fn cursor_right(value: &str, cursor: usize) -> usize {
    let cursor = clamp_cursor(value, cursor);
    let Some(ch) = char_at(value, cursor) else {
        return value.len();
    };
    if ch == PASTE_START {
        let start_next = cursor + ch.len_utf8();
        if let Some(rel_end) = value[start_next..].find(PASTE_END) {
            return start_next + rel_end + PASTE_END.len_utf8();
        }
    }
    if ch == IMAGE_MARKER {
        return cursor + IMAGE_MARKER.len_utf8();
    }
    cursor + ch.len_utf8()
}

fn handle_backspace(value: &str, cursor: usize) -> Option<(String, usize)> {
    let cursor = clamp_cursor(value, cursor);
    let prev = prev_char_start(value, cursor)?;
    let prev_ch = value[prev..].chars().next()?;

    if prev_ch == PASTE_END {
        if let Some(start) = value[..prev].rfind(PASTE_START) {
            let new_value = format!("{}{}", &value[..start], &value[cursor..]);
            return Some((new_value, start));
        }
    }

    if prev_ch == IMAGE_MARKER {
        let new_value = format!("{}{}", &value[..prev], &value[cursor..]);
        return Some((new_value, prev));
    }

    let new_value = format!("{}{}", &value[..prev], &value[cursor..]);
    Some((new_value, prev))
}

pub fn handle_paste(app: &mut App, text: String) {
    if matches!(app.mode, UiMode::Normal) {
        if text.is_empty() {
            return;
        }
        let cursor = clamp_cursor(&app.input, app.cursor);
        let insertion = format!("{}{}{}", PASTE_START, text, PASTE_END);
        let prev = prev_char_start(&app.input, cursor).and_then(|i| app.input[i..].chars().next());
        let next = char_at(&app.input, cursor);

        if prev == Some(PASTE_END) {
            let before_end = cursor.saturating_sub(PASTE_END.len_utf8());
            app.input.insert_str(before_end, &text);
            app.cursor = before_end + text.len() + PASTE_END.len_utf8();
        } else if next == Some(PASTE_START) {
            let start_len = PASTE_START.len_utf8();
            let insert_at = cursor + start_len;
            app.input.insert_str(insert_at, &text);
            app.cursor = insert_at + text.len();
        } else {
            app.input.insert_str(cursor, &insertion);
            app.cursor = cursor + insertion.len();
        }
        app.mark_dirty();
    }
}

pub fn handle_key(app: &mut App, key: KeyEvent, client: &Arc<Mutex<BackendClient>>) {
    // Ensure cursor is always on a valid char boundary before any operation.
    // This guards against corruption from paste events or other edge cases.
    app.cursor = clamp_cursor(&app.input, app.cursor);

    if matches!(key.code, KeyCode::Esc) {
        if app.state.is_loading {
            let client = client.clone();
            std::thread::spawn(move || {
                let _ = client.lock().unwrap().call("abort", json!({}));
            });
        }
        if !matches!(app.mode, UiMode::Normal) {
            app.mode = UiMode::Normal;
        }
        app.mark_dirty();
        return;
    }
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
            if let Some((new_value, new_cursor)) = handle_backspace(&app.input, app.cursor) {
                let removed_images = app.input.chars().filter(|&c| c == IMAGE_MARKER).count()
                    .saturating_sub(new_value.chars().filter(|&c| c == IMAGE_MARKER).count());
                app.input = new_value;
                app.cursor = new_cursor;
                if removed_images > 0 && !app.attachments.is_empty() {
                    for _ in 0..removed_images {
                        if !app.attachments.is_empty() {
                            app.attachments.pop();
                        }
                    }
                }
                app.mark_dirty();
            }
        }
        KeyCode::Left => {
            if app.cursor > 0 {
                app.cursor = cursor_left(&app.input, app.cursor);
                app.mark_dirty();
            }
        }
        KeyCode::Right => {
            if app.cursor < app.input.len() {
                app.cursor = cursor_right(&app.input, app.cursor);
                app.mark_dirty();
            }
        }
        KeyCode::Char('v') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            match read_clipboard_image() {
                ClipboardImageResult::Image(data) => {
                    app.input.insert(app.cursor, IMAGE_MARKER);
                    app.cursor += IMAGE_MARKER.len_utf8();
                    app.attachments.push(crate::app::AttachmentUpload { data, mime: "image/png".to_string() });
                    app.set_toast("Image attached".to_string());
                    app.mark_dirty();
                }
                ClipboardImageResult::TooLarge => {
                    app.set_toast("Image too large (max 50MB)".to_string());
                    app.mark_dirty();
                }
                ClipboardImageResult::ConversionError => {
                    app.set_toast("Failed to process clipboard image".to_string());
                    app.mark_dirty();
                }
                ClipboardImageResult::NotAvailable => {}
            }
        }
        KeyCode::Char(ch) => {
            if !key.modifiers.contains(KeyModifiers::CONTROL) && !key.modifiers.contains(KeyModifiers::ALT) {
                app.input.insert(app.cursor, ch);
                app.cursor += ch.len_utf8();
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
    app.cursor = clamp_cursor(&app.input, app.cursor);

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
                        let before = &app.input[..app.cursor];
                        if let Some(ch) = before.chars().last() {
                            let byte_len = ch.len_utf8();
                            app.input.remove(app.cursor - byte_len);
                            app.cursor -= byte_len;
                        }
                    }
                    if !app.input.contains('@') {
                        app.mode = UiMode::Normal;
                    }
                }
                KeyCode::Char(ch) => {
                    if !key.modifiers.contains(KeyModifiers::CONTROL) && !key.modifiers.contains(KeyModifiers::ALT) {
                        app.input.insert(app.cursor, ch);
                        app.cursor += ch.len_utf8();
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
            if app.session_rename_active {
                match key.code {
                    KeyCode::Esc => {
                        app.session_rename_active = false;
                        app.session_rename_input.clear();
                    }
                    KeyCode::Backspace => {
                        app.session_rename_input.pop();
                    }
                    KeyCode::Enter => {
                        if let Some(sess) = app.session_list.get_mut(app.session_selected) {
                            let name = app.session_rename_input.trim().to_string();
                            if !name.is_empty() {
                                let _ = client.lock().unwrap().call("rename_session", json!({ "sessionId": sess.id, "title": name }));
                                sess.title = app.session_rename_input.trim().to_string();
                            }
                        }
                        app.session_rename_active = false;
                        app.session_rename_input.clear();
                    }
                    KeyCode::Char(ch) => {
                        if !key.modifiers.contains(KeyModifiers::CONTROL) && !key.modifiers.contains(KeyModifiers::ALT) {
                            app.session_rename_input.push(ch);
                        }
                    }
                    _ => {}
                }
                app.mark_dirty();
                return true;
            }
            match key.code {
                KeyCode::Esc => app.mode = UiMode::Normal,
                KeyCode::Up => app.session_selected = app.session_selected.saturating_sub(1),
                KeyCode::Down => {
                    if app.session_selected + 1 < app.session_list.len() {
                        app.session_selected += 1;
                    }
                }
                KeyCode::PageUp => {
                    app.session_selected = app.session_selected.saturating_sub(10);
                }
                KeyCode::PageDown => {
                    app.session_selected = (app.session_selected + 10).min(app.session_list.len().saturating_sub(1));
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
                KeyCode::Char('r') => {
                    if let Some(sess) = app.session_list.get(app.session_selected) {
                        app.session_rename_active = true;
                        app.session_rename_input = sess.title.clone();
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
            if app.session_list.is_empty() {
                app.session_selected = 0;
                app.session_offset = 0;
            } else {
                if app.session_selected >= app.session_list.len() {
                    app.session_selected = app.session_list.len() - 1;
                }
                let page_size = 10usize;
                if app.session_selected < app.session_offset {
                    app.session_offset = app.session_selected;
                } else if app.session_selected >= app.session_offset + page_size {
                    app.session_offset = app.session_selected + 1 - page_size;
                }
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

const MAX_CLIPBOARD_IMAGE_BYTES: usize = 50 * 1024 * 1024; // 50MB

enum ClipboardImageResult {
    Image(String),
    TooLarge,
    NotAvailable,
    ConversionError,
}

fn read_clipboard_image() -> ClipboardImageResult {
    let mut clipboard = match arboard::Clipboard::new() {
        Ok(c) => c,
        Err(_) => return ClipboardImageResult::NotAvailable,
    };
    let img_data = match clipboard.get_image() {
        Ok(i) => i,
        Err(_) => return ClipboardImageResult::NotAvailable,
    };

    if img_data.bytes.len() > MAX_CLIPBOARD_IMAGE_BYTES {
        return ClipboardImageResult::TooLarge;
    }

    let rgba_img = match image::RgbaImage::from_raw(
        img_data.width as u32,
        img_data.height as u32,
        img_data.bytes.into_owned(),
    ) {
        Some(img) => img,
        None => return ClipboardImageResult::ConversionError,
    };

    let dynamic = image::DynamicImage::ImageRgba8(rgba_img);
    let mut buf = std::io::Cursor::new(Vec::new());
    if dynamic.write_to(&mut buf, image::ImageFormat::Png).is_err() {
        return ClipboardImageResult::ConversionError;
    }

    ClipboardImageResult::Image(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
}

#[cfg(test)]
mod tests {
    use crate::constants::IMAGE_MARKER;

    /// Simulate character insertion (mirrors fixed handle_key Char logic)
    fn insert_char(input: &mut String, cursor: &mut usize, ch: char) {
        input.insert(*cursor, ch);
        *cursor += ch.len_utf8();
    }

    /// Simulate backspace (mirrors fixed handle_key Backspace logic)
    fn backspace(input: &mut String, cursor: &mut usize) -> Option<char> {
        if *cursor == 0 {
            return None;
        }
        let before = &input[..*cursor];
        let ch = before.chars().last()?;
        let byte_len = ch.len_utf8();
        input.remove(*cursor - byte_len);
        *cursor -= byte_len;
        Some(ch)
    }

    /// Simulate left arrow (mirrors fixed handle_key Left logic)
    fn move_left(input: &str, cursor: &mut usize) {
        if *cursor > 0 {
            let before = &input[..*cursor];
            let prev_char = before.chars().last().unwrap();
            *cursor -= prev_char.len_utf8();
        }
    }

    /// Simulate right arrow (mirrors fixed handle_key Right logic)
    fn move_right(input: &str, cursor: &mut usize) {
        if *cursor < input.len() {
            let next_char = input[*cursor..].chars().next().unwrap();
            *cursor += next_char.len_utf8();
        }
    }

    // ── ASCII ───────────────────────────────────────────────

    #[test]
    fn test_cursor_ascii() {
        let mut input = String::new();
        let mut cursor = 0usize;

        insert_char(&mut input, &mut cursor, 'H');
        insert_char(&mut input, &mut cursor, 'i');

        assert_eq!(input, "Hi");
        assert_eq!(cursor, 2);
        assert!(input.is_char_boundary(cursor));
    }

    #[test]
    fn test_backspace_ascii() {
        let mut input = String::from("Hello");
        let mut cursor = 5;

        let removed = backspace(&mut input, &mut cursor);
        assert_eq!(removed, Some('o'));
        assert_eq!(input, "Hell");
        assert_eq!(cursor, 4);
        assert!(input.is_char_boundary(cursor));
    }

    // ── Emoji (4-byte UTF-8) ────────────────────────────────

    #[test]
    fn test_cursor_emoji() {
        let mut input = String::new();
        let mut cursor = 0usize;

        insert_char(&mut input, &mut cursor, '🎉');
        assert_eq!(cursor, 4);
        assert!(input.is_char_boundary(cursor));

        insert_char(&mut input, &mut cursor, '!');
        assert_eq!(input, "🎉!");
        assert_eq!(cursor, 5);
        assert!(input.is_char_boundary(cursor));
    }

    #[test]
    fn test_backspace_emoji() {
        let mut input = String::new();
        let mut cursor = 0usize;

        insert_char(&mut input, &mut cursor, 'T');
        insert_char(&mut input, &mut cursor, 'e');
        insert_char(&mut input, &mut cursor, 's');
        insert_char(&mut input, &mut cursor, 't');
        insert_char(&mut input, &mut cursor, '🎉');

        assert_eq!(input, "Test🎉");
        assert_eq!(cursor, 8);

        let removed = backspace(&mut input, &mut cursor);
        assert_eq!(removed, Some('🎉'));
        assert_eq!(input, "Test");
        assert_eq!(cursor, 4);
        assert!(input.is_char_boundary(cursor));
    }

    // ── CJK (3-byte UTF-8) ─────────────────────────────────

    #[test]
    fn test_cursor_cjk() {
        let mut input = String::new();
        let mut cursor = 0usize;

        insert_char(&mut input, &mut cursor, '世');
        assert_eq!(cursor, 3);
        assert!(input.is_char_boundary(cursor));

        insert_char(&mut input, &mut cursor, '界');
        assert_eq!(input, "世界");
        assert_eq!(cursor, 6);
        assert!(input.is_char_boundary(cursor));
    }

    #[test]
    fn test_backspace_cjk() {
        let mut input = String::new();
        let mut cursor = 0usize;

        insert_char(&mut input, &mut cursor, '世');
        insert_char(&mut input, &mut cursor, '界');

        let removed = backspace(&mut input, &mut cursor);
        assert_eq!(removed, Some('界'));
        assert_eq!(input, "世");
        assert_eq!(cursor, 3);
        assert!(input.is_char_boundary(cursor));
    }

    // ── Mixed content ───────────────────────────────────────

    #[test]
    fn test_cursor_mixed_ascii_emoji_cjk() {
        let mut input = String::new();
        let mut cursor = 0usize;

        insert_char(&mut input, &mut cursor, 'H');  // 1 byte
        insert_char(&mut input, &mut cursor, '🎉'); // 4 bytes
        insert_char(&mut input, &mut cursor, '世');  // 3 bytes
        insert_char(&mut input, &mut cursor, '!');   // 1 byte

        assert_eq!(input, "H🎉世!");
        assert_eq!(cursor, 9); // 1 + 4 + 3 + 1
        assert!(input.is_char_boundary(cursor));
    }

    #[test]
    fn test_backspace_mixed_content() {
        let mut input = String::new();
        let mut cursor = 0usize;

        insert_char(&mut input, &mut cursor, 'a');
        insert_char(&mut input, &mut cursor, '🎉');
        insert_char(&mut input, &mut cursor, 'b');

        // Delete 'b'
        backspace(&mut input, &mut cursor);
        assert_eq!(input, "a🎉");
        assert!(input.is_char_boundary(cursor));

        // Delete '🎉'
        backspace(&mut input, &mut cursor);
        assert_eq!(input, "a");
        assert_eq!(cursor, 1);
        assert!(input.is_char_boundary(cursor));

        // Delete 'a'
        backspace(&mut input, &mut cursor);
        assert_eq!(input, "");
        assert_eq!(cursor, 0);
    }

    // ── Arrow key navigation ────────────────────────────────

    #[test]
    fn test_left_right_with_unicode() {
        let mut input = String::new();
        let mut cursor = 0usize;

        insert_char(&mut input, &mut cursor, 'a');   // 1 byte
        insert_char(&mut input, &mut cursor, '🎉');  // 4 bytes
        insert_char(&mut input, &mut cursor, '世');   // 3 bytes
        // cursor at end = 8

        move_left(&input, &mut cursor);  // back over '世'
        assert_eq!(cursor, 5);
        assert!(input.is_char_boundary(cursor));

        move_left(&input, &mut cursor);  // back over '🎉'
        assert_eq!(cursor, 1);
        assert!(input.is_char_boundary(cursor));

        move_right(&input, &mut cursor); // forward over '🎉'
        assert_eq!(cursor, 5);
        assert!(input.is_char_boundary(cursor));
    }

    // ── Edge cases ──────────────────────────────────────────

    #[test]
    fn test_backspace_empty() {
        let mut input = String::new();
        let mut cursor = 0usize;

        let removed = backspace(&mut input, &mut cursor);
        assert_eq!(removed, None);
        assert_eq!(cursor, 0);
    }

    #[test]
    fn test_insert_delete_reinsert() {
        let mut input = String::new();
        let mut cursor = 0usize;

        insert_char(&mut input, &mut cursor, '🎉');
        backspace(&mut input, &mut cursor);
        insert_char(&mut input, &mut cursor, 'a');

        assert_eq!(input, "a");
        assert_eq!(cursor, 1);
        assert!(input.is_char_boundary(cursor));
    }

    #[test]
    fn test_image_marker_cursor() {
        let mut input = String::new();
        let mut cursor = 0usize;

        insert_char(&mut input, &mut cursor, IMAGE_MARKER);
        assert_eq!(cursor, IMAGE_MARKER.len_utf8()); // 3 bytes
        assert!(input.is_char_boundary(cursor));

        // Backspace should cleanly remove the marker
        let removed = backspace(&mut input, &mut cursor);
        assert_eq!(removed, Some(IMAGE_MARKER));
        assert_eq!(cursor, 0);
        assert!(input.is_empty());
    }

    #[test]
    fn test_paste_unicode_cursor() {
        let mut input = String::new();
        let mut cursor = 0usize;

        // Simulate paste (uses insert_str + text.len(), already correct)
        let text = "Hello 🌍!";
        input.insert_str(cursor, text);
        cursor += text.len();

        assert_eq!(cursor, 11); // "Hello " (6) + 🌍 (4) + "!" (1)
        assert!(input.is_char_boundary(cursor));
    }

    #[test]
    fn test_left_at_boundary_zero() {
        let input = String::from("abc");
        let mut cursor = 0usize;

        move_left(&input, &mut cursor);
        assert_eq!(cursor, 0); // stays at 0
    }

    #[test]
    fn test_right_at_end() {
        let input = String::from("abc");
        let mut cursor = 3usize;

        move_right(&input, &mut cursor);
        assert_eq!(cursor, 3); // stays at end
    }
}
