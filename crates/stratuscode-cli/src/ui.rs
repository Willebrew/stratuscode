use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, Borders, BorderType, Paragraph, Wrap};
use ratatui::{Frame, Terminal};
use ratatui::backend::CrosstermBackend;

use pulldown_cmark::{Event as MdEvent, Options as MdOptions, Parser as MdParser, Tag as MdTag};
use unicode_width::{UnicodeWidthChar, UnicodeWidthStr};
use textwrap::wrap;

use crate::app::{App, UiMode};
use crate::commands::{commands_list, filter_commands, filter_models, sort_models_by_provider};
use crate::app::{file_query_from_input, filter_files};
use crate::constants::*;

pub fn render_ui(terminal: &mut Terminal<CrosstermBackend<std::io::Stdout>>, app: &mut App) -> anyhow::Result<()> {
    terminal.draw(|frame| {
        let size = frame.size();
        let base = Block::default().style(Style::default().bg(COLOR_BG));
        frame.render_widget(base, size);

        let inner_width = size.width.saturating_sub(2) as usize;
        let overlay = build_inline_overlay(app, inner_width);
        let overlay_lines = overlay.as_ref().map(|o| o.lines.clone()).unwrap_or_default();

        let show_todo_strip = app.todos_expanded || !app.todos.is_empty();
        let mut todo_lines = if show_todo_strip {
            build_todo_strip(app, inner_width)
        } else {
            Vec::new()
        };

        let status_lines = format_status_lines(app, inner_width);
        let (display_input, cursor_display_idx) = compute_display_input_with_cursor(&app.input, app.cursor);
        let input_placeholder = if app.input.trim().is_empty() {
            Some("Type / for commands")
        } else {
            None
        };

        let max_input_lines = 3usize;
        let input_content_width = inner_width.saturating_sub(4).max(8);
        let mut input_lines = wrap_plain_lines(&display_input, input_content_width);
        if input_lines.is_empty() {
            input_lines.push(String::new());
        }
        if app.input.trim().is_empty() {
            input_lines.clear();
        }
        let input_start = input_lines.len().saturating_sub(max_input_lines);
        let visible_input_lines = input_lines[input_start..].to_vec();

        let overlay_lines_count = if overlay.is_some() {
            ((overlay_lines.len() as u16) + 1).max(6)
        } else {
            0
        };
        let input_count = (visible_input_lines.len() as u16).max(1);
        let mut unified_height =
            overlay_lines_count + (todo_lines.len() as u16) + input_count + (status_lines.len() as u16) + 2;
        unified_height = unified_height.min(size.height.saturating_sub(3)).max(8);

        let timeline_height = size.height.saturating_sub(unified_height);
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(timeline_height),
                Constraint::Length(unified_height),
            ])
            .split(size);

        let timeline_area = chunks[0];
        let input_area = chunks[1];

        let timeline_lines = build_timeline_lines_cached(app, timeline_area.width as usize);
        let view_height = timeline_area.height as usize;
        let total_lines = timeline_lines.len();
        let max_scroll = total_lines.saturating_sub(view_height);
        if app.scroll_from_bottom > max_scroll {
            app.scroll_from_bottom = max_scroll;
        }
        let scroll_from_bottom = app.scroll_from_bottom;
        let start = total_lines.saturating_sub(view_height + scroll_from_bottom);
        let slice = if total_lines <= view_height {
            &timeline_lines[..]
        } else {
            &timeline_lines[start..start + view_height]
        };
        let timeline_text = Text::from(slice.iter().cloned().collect::<Vec<Line>>());

        if app.show_splash && app.state.timeline_events.is_empty() && matches!(app.mode, UiMode::Normal) && !app.state.is_loading {
            render_splash(frame, timeline_area, app);
        } else {
            let title = Line::from(vec![
                Span::styled("Stratus", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
                Span::styled("Code", Style::default().fg(COLOR_CODE).add_modifier(Modifier::BOLD)),
            ]);
            let timeline = Paragraph::new(timeline_text)
                .block(
                    Block::default()
                        .borders(Borders::ALL)
                        .border_type(BorderType::Rounded)
                        .border_style(Style::default().fg(COLOR_BORDER))
                        .title(title)
                        .style(Style::default().bg(COLOR_BG_ALT)),
                )
                .wrap(Wrap { trim: false });
            frame.render_widget(timeline, timeline_area);
        }

        render_unified_input_box(
            frame,
            input_area,
            app,
            input_placeholder,
            visible_input_lines,
            input_start,
            &display_input,
            cursor_display_idx,
            input_content_width,
            overlay,
            overlay_lines,
            &mut todo_lines,
            status_lines,
        );

        render_overlay(frame, size, app);
    })?;
    Ok(())
}

pub fn build_timeline_lines_cached(app: &mut App, width: usize) -> Vec<Line<'static>> {
    if app.state.is_loading {
        return build_timeline_lines(&app.state, app.compact_view, width, app.spinner_index);
    }
    if app.timeline_cache_rev == app.timeline_revision
        && app.timeline_cache_width == width
        && app.timeline_cache_compact == app.compact_view
    {
        return app.timeline_cache.clone();
    }
    let lines = build_timeline_lines(&app.state, app.compact_view, width, app.spinner_index);
    app.timeline_cache = lines.clone();
    app.timeline_cache_rev = app.timeline_revision;
    app.timeline_cache_width = width;
    app.timeline_cache_compact = app.compact_view;
    lines
}

pub fn build_timeline_lines(state: &crate::backend::ChatState, compact: bool, width: usize, spinner_index: usize) -> Vec<Line<'static>> {
    let mut lines: Vec<Line> = Vec::new();
    let content_width = width.saturating_sub(2).max(10);

    let is_blank = |line: &Line<'static>| line.spans.iter().all(|s| s.content.is_empty());
    let push_gap = |lines: &mut Vec<Line<'static>>, count: usize| {
        for _ in 0..count {
            if let Some(last) = lines.last() {
                if !is_blank(last) {
                    lines.push(Line::from(""));
                }
            }
        }
    };

    let mut in_assistant_block = false;
    for event in &state.timeline_events {
        if event.kind == "user" {
            in_assistant_block = false;
            push_gap(&mut lines, 3);
            lines.push(Line::from(vec![
                Span::styled("> ", Style::default().fg(COLOR_CODE).add_modifier(Modifier::BOLD)),
                Span::styled("You", Style::default().fg(COLOR_CODE).add_modifier(Modifier::BOLD)),
            ]));
            let mut body: Vec<Line> = wrap_plain_lines(&event.content, content_width)
                .into_iter()
                .map(|l| Line::from(l))
                .collect();
            if let Some(atts) = &event.attachments {
                if !atts.is_empty() {
                    body.push(Line::from(format!(
                        "[{} attachment{}]",
                        atts.len(),
                        if atts.len() == 1 { "" } else { "s" }
                    )));
                }
            }
            lines.extend(indent_lines(body, 2));
            continue;
        }

        if !in_assistant_block {
            push_gap(&mut lines, 3);
            lines.push(Line::from(vec![
                Span::styled("> ", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
                Span::styled("Stratus", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
                Span::styled("Code", Style::default().fg(COLOR_CODE).add_modifier(Modifier::BOLD)),
            ]));
            in_assistant_block = true;
        }

        match event.kind.as_str() {
            "assistant" => {
                let markdown_lines = if event.streaming.unwrap_or(false) {
                    wrap_plain_lines(&event.content, content_width)
                        .into_iter()
                        .map(Line::from)
                        .collect()
                } else {
                    render_markdown(&event.content, content_width)
                };
                lines.extend(indent_lines(markdown_lines, 2));
            }
            "reasoning" => {
                if compact {
                    continue;
                }
                lines.push(Line::from(vec![
                    Span::styled("~ Reasoning", Style::default().fg(COLOR_TEXT_DIM).add_modifier(Modifier::ITALIC)),
                ]));
                let body: Vec<Line> = wrap_plain_lines(&event.content, content_width)
                    .into_iter()
                    .map(|l| Line::from(vec![Span::styled(l, Style::default().fg(COLOR_TEXT_DIM).add_modifier(Modifier::ITALIC))]))
                    .collect();
                lines.extend(indent_lines(body, 2));
            }
            "tool_call" => {
                let label = event.tool_name.clone().unwrap_or_else(|| "tool".to_string());
                let info = tool_display(&label);
                let status_icon = match event.status.as_deref().unwrap_or("pending") {
                    "running" => "[.]",
                    "failed" => "[x]",
                    "completed" => "[ok]",
                    _ => "[ ]",
                };
                let args = format_tool_args(&event.content);
                let mut spans = vec![
                    Span::styled(status_icon, Style::default().fg(info.color)),
                    Span::raw(" "),
                    Span::styled(info.label, Style::default().fg(info.color).add_modifier(Modifier::BOLD)),
                ];
                if !args.is_empty() {
                    spans.push(Span::raw(" "));
                    spans.push(Span::styled(args, Style::default().fg(COLOR_TEXT_DIM)));
                }
                lines.push(Line::from(spans));
            }
            "tool_result" => {
                if !in_assistant_block {
                    lines.push(Line::from(vec![
                        Span::styled("> ", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
                        Span::styled("Stratus", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
                    ]));
                    in_assistant_block = true;
                }
                if let Some((summary, diff_lines)) = extract_diff_summary(&event.content, content_width) {
                    lines.push(Line::from(vec![
                        Span::styled("[ok]", Style::default().fg(COLOR_SUCCESS)),
                        Span::raw(" "),
                        Span::styled("Result", Style::default().fg(COLOR_SUCCESS).add_modifier(Modifier::BOLD)),
                        Span::raw(" "),
                        Span::styled(summary, Style::default().fg(COLOR_TEXT_DIM)),
                    ]));
                    lines.extend(indent_lines(diff_lines.into_iter().take(120).collect(), 2));
                }
            }
            "status" => {
                let is_error = event.content.to_lowercase().contains("error");
                let color = if is_error { COLOR_ERROR } else { COLOR_WARNING };
                lines.push(Line::from(vec![Span::styled(
                    format!("! {}", event.content),
                    Style::default().fg(color),
                )]));
            }
            _ => {
                lines.push(Line::from(event.content.clone()));
            }
        }
    }

    if !lines.is_empty() {
        lines.push(Line::from(""));
        lines.push(Line::from(""));
    }

    if state.is_loading {
        push_gap(&mut lines, 1);
        let spinner = SPINNER_FRAMES[spinner_index % SPINNER_FRAMES.len()];
        lines.push(Line::from(vec![
            Span::styled(spinner, Style::default().fg(COLOR_CODE)),
            Span::raw(" "),
            Span::styled("Thinking...", Style::default().fg(COLOR_TEXT_DIM).add_modifier(Modifier::ITALIC)),
        ]));
    }
    lines
}

pub fn render_unified_input_box(
    frame: &mut Frame,
    rect: Rect,
    app: &App,
    placeholder: Option<&str>,
    input_lines: Vec<String>,
    input_start: usize,
    display_input: &str,
    cursor_display_idx: usize,
    input_content_width: usize,
    overlay: Option<InlineOverlay>,
    mut overlay_lines: Vec<Line<'static>>,
    todo_lines: &mut Vec<Line<'static>>,
    status_lines: Vec<Line<'static>>,
) {
    let title = Line::from(vec![Span::styled("Input", Style::default().fg(COLOR_TEXT_DIM))]);
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(COLOR_BORDER))
        .title(title)
        .style(Style::default().bg(COLOR_BG_ALT));
    frame.render_widget(block.clone(), rect);
    let inner = block.inner(rect);
    let inner_width = inner.width.saturating_sub(2) as usize;

    let overlay_min_lines: u16 = if overlay.is_some() { 6 } else { 0 };
    let mut sections: Vec<(Vec<Line>, u16)> = Vec::new();
    let mut overlay_block: Option<Vec<Line>> = None;
    let mut overlay_index: Option<usize> = None;
    if !todo_lines.is_empty() {
        sections.push((todo_lines.clone(), todo_lines.len() as u16));
    }
    if let Some(overlay) = overlay {
        let mut lines = Vec::new();
        lines.push(Line::from(vec![
            Span::styled(overlay.title, Style::default().fg(COLOR_TEXT_DIM).add_modifier(Modifier::BOLD)),
        ]));
        lines.append(&mut overlay_lines);
        if lines.len() < overlay_min_lines as usize {
            let pad = overlay_min_lines as usize - lines.len();
            for _ in 0..pad {
                lines.push(Line::from(""));
            }
        }
        overlay_block = Some(lines);
    }

    let mut input_spans: Vec<Line> = Vec::new();
    if input_lines.is_empty() {
        let text = placeholder.unwrap_or("");
        input_spans.push(Line::from(vec![
            Span::styled("› ", Style::default().fg(COLOR_CODE).add_modifier(Modifier::BOLD)),
            Span::styled(text, Style::default().fg(COLOR_TEXT_DIM)),
        ]));
    } else {
        for (idx, line) in input_lines.iter().enumerate() {
            if idx == 0 {
                input_spans.push(Line::from(vec![
                    Span::styled("› ", Style::default().fg(COLOR_CODE).add_modifier(Modifier::BOLD)),
                    Span::styled(line.clone(), Style::default().fg(COLOR_TEXT)),
                ]));
            } else {
                input_spans.push(Line::from(vec![
                    Span::raw("  "),
                    Span::styled(line.clone(), Style::default().fg(COLOR_TEXT)),
                ]));
            }
        }
    }
    sections.push((input_spans.clone(), input_spans.len() as u16));
    sections.push((status_lines.clone(), status_lines.len() as u16));

    if let Some(block) = overlay_block.take() {
        let insert_at = sections.len().saturating_sub(2);
        sections.insert(insert_at, (block.clone(), block.len() as u16));
        overlay_index = Some(insert_at);
    }

    let mut total_height: u16 = sections.iter().map(|s| s.1).sum();
    let max_height = inner.height;
    if total_height > max_height {
        let mut remaining_overflow = total_height - max_height;
        // Prefer trimming todos, then overlay, then input (keep status intact).
        for idx in 0..sections.len() {
            if remaining_overflow == 0 {
                break;
            }
            let is_status = idx == sections.len().saturating_sub(1);
            if is_status {
                continue;
            }
            let (lines, height) = &mut sections[idx];
            if *height <= 1 {
                continue;
            }
            let min_height = if Some(idx) == overlay_index {
                overlay_min_lines.max(1)
            } else {
                1
            };
            if *height <= min_height {
                continue;
            }
            let shrink_by = remaining_overflow.min(*height - min_height);
            if shrink_by > 0 {
                let new_len = lines.len().saturating_sub(shrink_by as usize);
                lines.truncate(new_len);
                *height = lines.len() as u16;
                remaining_overflow -= shrink_by;
            }
        }
        total_height = sections.iter().map(|s| s.1).sum();
        if total_height > max_height {
            // If still too tall, clamp input section to at least 1 line.
            let input_idx = sections.len().saturating_sub(2);
            if let Some((lines, height)) = sections.get_mut(input_idx) {
                let overflow = total_height - max_height;
                let shrink_by = overflow.min(height.saturating_sub(1));
                if shrink_by > 0 {
                    let new_len = lines.len().saturating_sub(shrink_by as usize);
                    lines.truncate(new_len);
                    *height = lines.len() as u16;
                }
            }
        }
    }

    let constraints: Vec<Constraint> = sections.iter().map(|s| Constraint::Length(s.1)).collect();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints(constraints)
        .split(inner);

    for (idx, (lines, _)) in sections.iter().enumerate() {
        let para = Paragraph::new(Text::from(lines.clone()))
            .wrap(Wrap { trim: false })
            .style(Style::default().bg(COLOR_BG_ALT));
        frame.render_widget(para, chunks[idx]);
    }

    if matches!(app.mode, UiMode::Normal | UiMode::FileMention) {
        let input_chunk_index = sections.len().saturating_sub(2);
        if let Some(input_rect) = chunks.get(input_chunk_index) {
            let inner_x = input_rect.x.saturating_add(2);
            let inner_y = input_rect.y;
            let inner_height = input_rect.height as usize;
            if inner_width > 0 && inner_height > 0 {
                let (cur_row, cur_col) = compute_cursor_position(display_input, cursor_display_idx, input_content_width);
                let visible_row = cur_row.saturating_sub(input_start);
                if visible_row < inner_height {
                    frame.set_cursor(inner_x + cur_col as u16, inner_y + visible_row as u16);
                }
            }
        }
    }
}

pub fn render_overlay(frame: &mut Frame, rect: Rect, app: &App) {
    match app.mode {
        UiMode::HelpAbout => {
            let lines = vec![
                Line::from("StratusCode"),
                Line::from("Terminal-first AI coding agent."),
            ];
            render_modal(frame, rect, "About", lines);
        }
        UiMode::Normal => {
            if let Some((msg, _)) = &app.toast {
                let lines = vec![Line::from(msg.clone())];
                render_modal(frame, rect, "Info", lines);
            }
        }
        _ => {}
    }
}

pub fn render_splash(frame: &mut Frame, rect: Rect, app: &App) {
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(COLOR_BORDER))
        .title(Line::from(vec![
            Span::styled("Stratus", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
            Span::styled("Code", Style::default().fg(COLOR_CODE).add_modifier(Modifier::BOLD)),
        ]))
        .style(Style::default().bg(COLOR_BG_ALT));
    frame.render_widget(block.clone(), rect);
    let inner = block.inner(rect);
    let is_compact = inner.width < 100;

    let mut lines: Vec<Line> = Vec::new();
    if is_compact {
        for i in 0..S_LOGO.len() {
            let line = Line::from(vec![
                Span::styled(S_LOGO[i], Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
                Span::raw("  "),
                Span::styled(C_LOGO[i], Style::default().fg(COLOR_CODE).add_modifier(Modifier::BOLD)),
            ]);
            lines.push(line);
        }
    } else {
        for i in 0..STRATUS_LOGO.len() {
            let line = Line::from(vec![
                Span::styled(STRATUS_LOGO[i], Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
                Span::raw("    "),
                Span::styled(CODE_LOGO[i], Style::default().fg(COLOR_CODE).add_modifier(Modifier::BOLD)),
            ]);
            lines.push(line);
        }
    }

    lines.push(Line::from(""));

    let version = env!("CARGO_PKG_VERSION");
    let model = app
        .state
        .model_override
        .clone()
        .unwrap_or_else(|| app.base_model.clone());
    let mut display_path = app.project_dir.clone();
    let max_path = inner.width.saturating_sub(30) as usize;
    if display_path.len() > max_path && max_path > 6 {
        display_path = format!("...{}", &display_path[display_path.len() - (max_path - 3)..]);
    }

    if is_compact {
        lines.push(Line::from(vec![
            Span::styled(format!("v{} • {}", version, model), Style::default().fg(COLOR_TEXT_DIM)),
        ]));
        lines.push(Line::from(vec![
            Span::styled(display_path, Style::default().fg(COLOR_TEXT_MUTED)),
        ]));
    } else {
        lines.push(Line::from(vec![
            Span::styled("Version ", Style::default().fg(COLOR_TEXT_DIM)),
            Span::styled(version, Style::default().fg(COLOR_TEXT)),
            Span::styled("  •  Project ", Style::default().fg(COLOR_TEXT_DIM)),
            Span::styled(display_path, Style::default().fg(COLOR_TEXT)),
            Span::styled("  •  Model ", Style::default().fg(COLOR_TEXT_DIM)),
            Span::styled(model, Style::default().fg(COLOR_TEXT)),
        ]));
    }

    let width = lines
        .iter()
        .map(line_width)
        .max()
        .unwrap_or(1)
        .min(inner.width as usize) as u16;
    let height = lines.len().min(inner.height as usize) as u16;
    let area = centered_rect(width, height, inner);
    let para = Paragraph::new(lines);
    frame.render_widget(para, area);
}

fn render_modal(frame: &mut Frame, rect: Rect, title: &str, lines: Vec<Line>) {
    let width = rect.width.saturating_sub(6);
    let height = (lines.len() as u16 + 4).min(rect.height.saturating_sub(4));
    let area = centered_rect(width, height, rect);
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(COLOR_BORDER))
        .title(Span::styled(title, Style::default().fg(COLOR_TEXT_DIM)))
        .style(Style::default().bg(COLOR_BG_ALT));
    let para = Paragraph::new(lines)
        .block(block)
        .wrap(Wrap { trim: false })
        .style(Style::default().fg(COLOR_TEXT).bg(COLOR_BG_ALT));
    frame.render_widget(para, area);
}

fn centered_rect(width: u16, height: u16, rect: Rect) -> Rect {
    let x = rect.x + (rect.width.saturating_sub(width)) / 2;
    let y = rect.y + (rect.height.saturating_sub(height)) / 2;
    Rect { x, y, width, height }
}

fn line_width(line: &Line) -> usize {
    line.spans.iter().map(|s| UnicodeWidthStr::width(s.content.as_ref())).sum()
}

pub struct InlineOverlay {
    pub title: String,
    pub lines: Vec<Line<'static>>,
}

fn build_inline_overlay(app: &App, _width: usize) -> Option<InlineOverlay> {
    match app.mode {
        UiMode::CommandPalette => {
            let commands = filter_commands(&commands_list(), &app.command_query);
            let mut lines = Vec::new();
            lines.push(Line::from(vec![
                Span::styled("/", Style::default().fg(COLOR_PURPLE)),
                Span::styled(app.command_query.clone(), Style::default().fg(COLOR_TEXT)),
            ]));
            let max_items = 10usize;
            if commands.is_empty() {
                lines.push(Line::from(vec![
                    Span::styled("No commands found.", Style::default().fg(COLOR_TEXT_DIM)),
                ]));
                return Some(InlineOverlay { title: "Commands".to_string(), lines });
            }
            let selected = app.command_selected.min(commands.len().saturating_sub(1));
            let offset = app.command_offset.min(commands.len().saturating_sub(1));
            let end = (offset + max_items).min(commands.len());
            for (idx, cmd) in commands.iter().enumerate().skip(offset).take(end - offset) {
                let selected = idx == selected;
                let style = if selected {
                    Style::default().fg(Color::Black).bg(COLOR_CODE).add_modifier(Modifier::BOLD)
                } else {
                    Style::default().fg(COLOR_TEXT)
                };
                lines.push(Line::from(vec![
                    Span::styled(if selected { "› " } else { "  " }, style),
                    Span::styled(format!("/{:<10}", cmd.name), style),
                    Span::styled(cmd.description, style),
                ]));
            }
            if end < commands.len() {
                lines.push(Line::from(vec![
                    Span::styled("...", Style::default().fg(COLOR_TEXT_DIM)),
                ]));
            }
            Some(InlineOverlay { title: "Commands".to_string(), lines })
        }
        UiMode::FileMention => {
            let query = file_query_from_input(&app.input, app.cursor);
            let results = filter_files(&app.file_index, &query, 10);
            let mut lines = Vec::new();
            lines.push(Line::from(vec![
                Span::styled("Search: ", Style::default().fg(COLOR_TEXT_DIM)),
                Span::styled(query.clone(), Style::default().fg(COLOR_TEXT)),
            ]));
            if results.is_empty() {
                lines.push(Line::from(vec![
                    Span::styled("No files found. Run /reindex.", Style::default().fg(COLOR_TEXT_DIM)),
                ]));
                return Some(InlineOverlay { title: "File Mention".to_string(), lines });
            }
            for (i, file) in results.iter().enumerate() {
                let selected = i == app.file_selected;
                let style = if selected {
                    Style::default().fg(Color::Black).bg(COLOR_CODE).add_modifier(Modifier::BOLD)
                } else {
                    Style::default().fg(COLOR_TEXT)
                };
                lines.push(Line::from(vec![
                    Span::styled(if selected { "› " } else { "  " }, style),
                    Span::styled(
                        format!("{}{}", file.relative_path, if file.is_dir { "/" } else { "" }),
                        style,
                    ),
                ]));
            }
            Some(InlineOverlay { title: "File Mention".to_string(), lines })
        }
        UiMode::ModelPicker => {
            let filtered = filter_models(&app.model_entries, &app.model_query);
            let filtered = sort_models_by_provider(&filtered);
            let mut lines = Vec::new();
            lines.push(Line::from(vec![
                Span::styled("Search: ", Style::default().fg(COLOR_TEXT_DIM)),
                Span::styled(app.model_query.clone(), Style::default().fg(COLOR_TEXT)),
            ]));
            if filtered.is_empty() {
                lines.push(Line::from(vec![
                    Span::styled("No models found.", Style::default().fg(COLOR_TEXT_DIM)),
                ]));
            } else {
                let offset = app.model_offset.min(filtered.len());
                let end = (offset + 10).min(filtered.len());
                for (idx, entry) in filtered.iter().enumerate().skip(offset).take(end - offset) {
                    let selected = idx == app.model_selected;
                    let style = if selected {
                        Style::default().fg(Color::Black).bg(COLOR_CODE).add_modifier(Modifier::BOLD)
                    } else {
                        Style::default().fg(COLOR_TEXT)
                    };
                    lines.push(Line::from(vec![
                        Span::styled(if selected { "› " } else { "  " }, style),
                        Span::styled(entry.name.clone(), style),
                        Span::styled(format!(" ({})", entry.group), style),
                    ]));
                }
            }
            let custom_selected = app.model_selected == filtered.len();
            let custom_style = if custom_selected {
                Style::default().fg(Color::Black).bg(COLOR_CODE).add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(COLOR_TEXT)
            };
            lines.push(Line::from(vec![
                Span::styled(if custom_selected { "› " } else { "  " }, custom_style),
                Span::styled("Custom model...", custom_style),
            ]));
            if app.custom_model_mode {
                lines.push(Line::from(vec![
                    Span::styled("› ", Style::default().fg(COLOR_CODE)),
                    Span::styled(app.custom_model_input.clone(), Style::default().fg(COLOR_TEXT)),
                ]));
            }
            Some(InlineOverlay { title: "Model Picker".to_string(), lines })
        }
        UiMode::SessionHistory => {
            let mut lines = Vec::new();
            if app.session_list.is_empty() {
                lines.push(Line::from(vec![
                    Span::styled("No sessions yet.", Style::default().fg(COLOR_TEXT_DIM)),
                ]));
            } else {
                let offset = app.session_offset.min(app.session_list.len());
                let end = (offset + 10).min(app.session_list.len());
                for (i, sess) in app.session_list.iter().enumerate().skip(offset).take(end - offset) {
                    let selected = i == app.session_selected;
                    let style = if selected {
                        Style::default().fg(Color::Black).bg(COLOR_CODE).add_modifier(Modifier::BOLD)
                    } else {
                        Style::default().fg(COLOR_TEXT)
                    };
                    lines.push(Line::from(vec![
                        Span::styled(if selected { "› " } else { "  " }, style),
                        Span::styled(sess.title.clone(), style),
                    ]));
                }
                if end < app.session_list.len() {
                    lines.push(Line::from(vec![
                        Span::styled("...", Style::default().fg(COLOR_TEXT_DIM)),
                    ]));
                }
            }
            if app.session_rename_active {
                lines.push(Line::from(vec![
                    Span::styled("Rename: ", Style::default().fg(COLOR_TEXT_DIM)),
                    Span::styled(app.session_rename_input.clone(), Style::default().fg(COLOR_TEXT)),
                ]));
            } else {
                lines.push(Line::from(vec![
                    Span::styled("r rename  d delete  Enter open  Esc close", Style::default().fg(COLOR_TEXT_DIM)),
                ]));
            }
            Some(InlineOverlay { title: "Session History".to_string(), lines })
        }
        UiMode::QuestionPrompt => {
            if let Some(q) = &app.question {
                let mut lines = Vec::new();
                if let Some(header) = &q.header {
                    lines.push(Line::from(vec![
                        Span::styled(header.clone(), Style::default().fg(COLOR_TEXT)),
                    ]));
                }
                lines.push(Line::from(vec![
                    Span::styled(q.question.clone(), Style::default().fg(COLOR_TEXT)),
                ]));
                let mut total = q.options.len();
                if q.allow_custom {
                    total += 1;
                }
                for (i, opt) in q.options.iter().enumerate() {
                    let sel = q.selected.get(i).copied().unwrap_or(false);
                    let focused = q.focused_index == i && !q.custom_active;
                    let prefix = if q.allow_multiple {
                        if sel { "[x]" } else { "[ ]" }
                    } else {
                        "   "
                    };
                    let number = format!("{}.", i + 1);
                    let style = if focused {
                        Style::default().fg(Color::Black).bg(COLOR_CODE).add_modifier(Modifier::BOLD)
                    } else if sel {
                        Style::default().fg(COLOR_SUCCESS)
                    } else {
                        Style::default().fg(COLOR_TEXT)
                    };
                    lines.push(Line::from(vec![
                        Span::styled(number, Style::default().fg(COLOR_TEXT_DIM)),
                        Span::raw(" "),
                        Span::styled(if focused { "> " } else { "  " }, style),
                        Span::styled(prefix, style),
                        Span::raw(" "),
                        Span::styled(opt.label.clone(), style),
                        if let Some(desc) = &opt.description {
                            Span::styled(format!(" - {}", desc), Style::default().fg(COLOR_TEXT_DIM))
                        } else {
                            Span::raw("")
                        },
                    ]));
                }
                if q.allow_custom {
                    let custom_focused = q.focused_index == total.saturating_sub(1);
                    let border_style = if custom_focused || q.custom_active {
                        Style::default().fg(COLOR_CODE)
                    } else {
                        Style::default().fg(COLOR_TEXT_DIM)
                    };
                    let mut custom_line = Vec::new();
                    custom_line.push(Span::styled("Other: ", border_style));
                    if q.custom_active {
                        let mut text = q.custom_input.clone();
                        text.push('|');
                        custom_line.push(Span::styled(text, Style::default().fg(COLOR_TEXT)));
                    } else if custom_focused {
                        custom_line.push(Span::styled("Type custom answer... (Enter)", Style::default().fg(COLOR_TEXT_DIM)));
                    } else {
                        custom_line.push(Span::styled("Or type your own answer...", Style::default().fg(COLOR_TEXT_DIM)));
                    }
                    lines.push(Line::from(custom_line));
                }
                let hint = if q.allow_multiple {
                    "Up/Down move  Space toggle  Enter submit  Esc skip"
                } else {
                    "Up/Down move  Enter select  Esc skip"
                };
                lines.push(Line::from(vec![
                    Span::styled(hint, Style::default().fg(COLOR_TEXT_DIM)),
                ]));
                return Some(InlineOverlay { title: q.header.clone().unwrap_or_else(|| "Question".to_string()), lines });
            }
            None
        }
        UiMode::PlanActions => {
            let lines = vec![
                Line::from("Plan is ready."),
                Line::from("Enter = Accept and build"),
                Line::from("Esc = Keep planning"),
            ];
            Some(InlineOverlay { title: "Plan Actions".to_string(), lines })
        }
        _ => None,
    }
}

pub fn build_todo_strip(app: &App, width: usize) -> Vec<Line<'static>> {
    let summary = format!(
        "Todos: {} pending  {} in progress  {} done",
        app.todo_counts.pending,
        app.todo_counts.in_progress,
        app.todo_counts.completed
    );
    let line1 = Line::from(vec![
        Span::styled(summary, Style::default().fg(COLOR_TEXT_DIM)),
    ]);

    if app.todos_expanded {
        let mut lines = vec![line1, Line::from("")];
        if app.todos.is_empty() {
            lines.push(Line::from(vec![Span::styled("No todos yet.", Style::default().fg(COLOR_TEXT_DIM))]));
            return lines;
        }
        for todo in &app.todos {
            let (label, color) = match todo.status.as_str() {
                "completed" => ("[x]", COLOR_SUCCESS),
                "in_progress" => ("[~]", COLOR_WARNING),
                _ => ("[ ]", COLOR_TEXT_DIM),
            };
            lines.push(Line::from(vec![
                Span::styled(label, Style::default().fg(color)),
                Span::raw(" "),
                Span::styled(todo.content.clone(), Style::default().fg(COLOR_TEXT)),
            ]));
        }
        return lines;
    }

    let max_items = 3;
    let mut line2_spans: Vec<Span> = Vec::new();
    let mut shown = 0usize;
    for todo in app.todos.iter().take(max_items) {
        let status = match todo.status.as_str() {
            "completed" => ("[x]", COLOR_SUCCESS),
            "in_progress" => ("[~]", COLOR_WARNING),
            _ => ("[ ]", COLOR_TEXT_DIM),
        };
        let chunk = format!("{} {}  ", status.0, todo.content);
        if UnicodeWidthStr::width(chunk.as_str()) + line_width(&Line::from(line2_spans.clone())) > width {
            break;
        }
        line2_spans.push(Span::styled(status.0, Style::default().fg(status.1)));
        line2_spans.push(Span::raw(" "));
        line2_spans.push(Span::styled(truncate_text(&todo.content, 24), Style::default().fg(COLOR_TEXT)));
        line2_spans.push(Span::raw("  "));
        shown += 1;
    }

    if app.todos.len() > shown {
        line2_spans.push(Span::styled(
            format!("+{} more", app.todos.len().saturating_sub(shown)),
            Style::default().fg(COLOR_TEXT_DIM),
        ));
    }

    let line2 = if line2_spans.is_empty() {
        Line::from(vec![Span::styled("No todos yet.", Style::default().fg(COLOR_TEXT_DIM))])
    } else {
        Line::from(line2_spans)
    };

    vec![line1, line2]
}

fn truncate_text(text: &str, max_len: usize) -> String {
    if text.len() <= max_len {
        return text.to_string();
    }
    format!("{}…", &text[..max_len.saturating_sub(1)])
}

fn compute_display_input_with_cursor(value: &str, cursor: usize) -> (String, usize) {
    let cursor = clamp_cursor(value, cursor);
    let mut display = String::new();
    let mut cursor_display_index = 0usize;
    let mut cursor_set = false;
    let mut i = 0usize;

    while i < value.len() {
        if !cursor_set && i >= cursor {
            cursor_display_index = display.chars().count();
            cursor_set = true;
        }

        let Some(ch) = value[i..].chars().next() else {
            break;
        };

        if ch == PASTE_START {
            let start_next = i + PASTE_START.len_utf8();
            if let Some(rel_end) = value[start_next..].find(PASTE_END) {
                let end_idx = start_next + rel_end;
                let after_end = end_idx + PASTE_END.len_utf8();
                let paste_text = &value[start_next..end_idx];
                let line_count = paste_text.lines().count().max(1);
                let is_large = line_count >= PASTE_LINE_THRESHOLD || paste_text.len() >= PASTE_CHAR_THRESHOLD;
                let mut summary = if is_large {
                    format!("[Pasted ~{} lines]", line_count)
                } else {
                    paste_text.replace('\n', " ")
                };

                let next_char = if after_end < value.len() {
                    value[after_end..].chars().next()
                } else {
                    None
                };
                let last_display = display.chars().last();
                if is_large && last_display.is_some() && last_display != Some(' ') {
                    summary = format!(" {}", summary);
                }
                display.push_str(&summary);
                if is_large
                    && next_char.is_some()
                    && next_char != Some(' ')
                    && next_char != Some(PASTE_START)
                    && next_char != Some(IMAGE_MARKER)
                {
                    display.push(' ');
                }

                if !cursor_set && cursor > i && cursor <= after_end {
                    cursor_display_index = display.chars().count();
                    cursor_set = true;
                }

                i = after_end;
                continue;
            }
            i += ch.len_utf8();
            continue;
        }

        if ch == PASTE_END {
            i += PASTE_END.len_utf8();
            continue;
        }

        if ch == IMAGE_MARKER {
            let mut image_marker = String::new();
            let next_char = if i + IMAGE_MARKER.len_utf8() < value.len() {
                value[i + IMAGE_MARKER.len_utf8()..].chars().next()
            } else {
                None
            };
            if display.chars().last().is_some() && display.chars().last() != Some(' ') {
                image_marker.push(' ');
            }
            image_marker.push_str("[Image]");
            if next_char.is_some()
                && next_char != Some(' ')
                && next_char != Some(PASTE_START)
                && next_char != Some(IMAGE_MARKER)
                && next_char != Some(PASTE_END)
            {
                image_marker.push(' ');
            }
            display.push_str(&image_marker);
            i += IMAGE_MARKER.len_utf8();
            continue;
        }

        display.push(ch);
        i += ch.len_utf8();
    }

    if !cursor_set {
        cursor_display_index = display.chars().count();
    }

    (display, cursor_display_index)
}

fn clamp_cursor(value: &str, cursor: usize) -> usize {
    let mut idx = cursor.min(value.len());
    while idx > 0 && !value.is_char_boundary(idx) {
        idx -= 1;
    }
    idx
}

fn compute_cursor_position(display: &str, cursor_index: usize, width: usize) -> (usize, usize) {
    let mut row = 0usize;
    let mut col = 0usize;
    for (idx, ch) in display.chars().enumerate() {
        if idx >= cursor_index {
            break;
        }
        if ch == '\n' || col >= width {
            row += 1;
            col = 0;
            if ch == '\n' {
                continue;
            }
        }
        col += 1;
    }
    (row, col)
}

pub fn format_status_lines(app: &App, width: usize) -> Vec<Line<'static>> {
    let model = app
        .state
        .model_override
        .clone()
        .unwrap_or_else(|| app.base_model.clone());
    let agent = app.state.agent.clone();
    let agent_color = agent_color(&agent);
    let mode = agent.to_uppercase();
    let thinking_label = if app.reasoning_effort != "off" {
        format!("Thinking {}", app.reasoning_effort.to_uppercase())
    } else {
        String::new()
    };
    let tokens = format!(
        "{} in/{} out",
        format_number(app.state.tokens.input),
        format_number(app.state.tokens.output)
    );

    let mut line1: Vec<Span> = Vec::new();
    line1.push(Span::styled(
        format!(" {} ", mode),
        Style::default().fg(Color::Black).bg(agent_color).add_modifier(Modifier::BOLD),
    ));
    line1.push(Span::styled("|", Style::default().fg(COLOR_TEXT_DIM)));
    line1.push(Span::styled(model, Style::default().fg(COLOR_TEXT_MUTED)));
    if !thinking_label.is_empty() {
        line1.push(Span::styled("|", Style::default().fg(COLOR_TEXT_DIM)));
        line1.push(Span::styled(thinking_label, Style::default().fg(COLOR_PURPLE)));
    }
    line1.push(Span::styled("|", Style::default().fg(COLOR_TEXT_DIM)));
    line1.push(Span::styled(tokens, Style::default().fg(COLOR_TEXT_MUTED)));

    let bar_width = (width / 5).clamp(8, 20);
    let pct = app.state.context_usage.percent.min(100);
    let filled = ((pct as usize * bar_width) / 100).min(bar_width);
    let empty = bar_width.saturating_sub(filled);
    let bar_color = if pct > 90 {
        COLOR_ERROR
    } else if pct > 70 {
        COLOR_WARNING
    } else {
        COLOR_PURPLE
    };

    let mut line2: Vec<Span> = Vec::new();
    line2.push(Span::styled("Context ", Style::default().fg(COLOR_TEXT_DIM)));
    line2.push(Span::styled("=".repeat(filled), Style::default().fg(bar_color)));
    line2.push(Span::styled(".".repeat(empty), Style::default().fg(Color::Rgb(30, 41, 59))));
    line2.push(Span::styled(format!(" {}%", pct), Style::default().fg(COLOR_TEXT_DIM)));
    if let Some(status) = &app.state.context_status {
        line2.push(Span::styled(format!(" {}", status), Style::default().fg(COLOR_TEXT_DIM)));
    }

    vec![Line::from(line1), Line::from(line2)]
}

fn agent_color(agent: &str) -> Color {
    match agent {
        "plan" => COLOR_PURPLE,
        _ => COLOR_GREEN,
    }
}

fn format_number(value: u64) -> String {
    let s = value.to_string();
    let mut out = String::new();
    for (i, ch) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    out.chars().rev().collect()
}

fn wrap_plain_lines(text: &str, width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    for raw in text.split('\n') {
        if raw.is_empty() {
            lines.push(String::new());
            continue;
        }
        let wrapped = wrap(raw, width);
        for line in wrapped {
            lines.push(line.to_string());
        }
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

fn wrap_diff_content(text: &str, width: usize) -> Vec<String> {
    if UnicodeWidthStr::width(text) <= width {
        return vec![text.to_string()];
    }
    let mut lines = Vec::new();
    let mut current = String::new();
    let mut current_width = 0usize;
    for ch in text.chars() {
        let ch_width = UnicodeWidthChar::width(ch).unwrap_or(1);
        if current_width + ch_width > width && !current.is_empty() {
            lines.push(current);
            current = String::new();
            current_width = 0;
        }
        current.push(ch);
        current_width += ch_width;
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

fn indent_lines(lines: Vec<Line<'static>>, indent: usize) -> Vec<Line<'static>> {
    let prefix = Span::raw(" ".repeat(indent));
    lines
        .into_iter()
        .map(|line| {
            let mut spans = Vec::with_capacity(line.spans.len() + 1);
            spans.push(prefix.clone());
            spans.extend(line.spans);
            Line::from(spans)
        })
        .collect()
}

#[derive(Debug, Clone)]
struct DiffLine {
    kind: DiffKind,
    content: String,
    old_line: Option<usize>,
    new_line: Option<usize>,
}

#[derive(Debug, Clone, Copy)]
enum DiffKind {
    Header,
    Hunk,
    Add,
    Remove,
    Context,
}

fn parse_diff(diff: &str) -> (Vec<DiffLine>, usize, usize) {
    let mut lines = Vec::new();
    let mut additions = 0usize;
    let mut deletions = 0usize;
    let mut old_line = 0usize;
    let mut new_line = 0usize;

    for line in diff.lines() {
        if line.starts_with("--- ") || line.starts_with("+++ ") {
            lines.push(DiffLine { kind: DiffKind::Header, content: line.to_string(), old_line: None, new_line: None });
            continue;
        }
        if line.starts_with("@@") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                if let Some(old_part) = parts.get(1) {
                    if let Some(num) = old_part.trim_start_matches('-').split(',').next() {
                        old_line = num.parse::<usize>().unwrap_or(0);
                    }
                }
                if let Some(new_part) = parts.get(2) {
                    if let Some(num) = new_part.trim_start_matches('+').split(',').next() {
                        new_line = num.parse::<usize>().unwrap_or(0);
                    }
                }
            }
            lines.push(DiffLine { kind: DiffKind::Hunk, content: line.to_string(), old_line: None, new_line: None });
            continue;
        }

        if line.starts_with('+') {
            additions += 1;
            lines.push(DiffLine { kind: DiffKind::Add, content: line[1..].to_string(), old_line: None, new_line: Some(new_line) });
            new_line = new_line.saturating_add(1);
        } else if line.starts_with('-') {
            deletions += 1;
            lines.push(DiffLine { kind: DiffKind::Remove, content: line[1..].to_string(), old_line: Some(old_line), new_line: None });
            old_line = old_line.saturating_add(1);
        } else if line.starts_with(' ') {
            lines.push(DiffLine { kind: DiffKind::Context, content: line[1..].to_string(), old_line: Some(old_line), new_line: Some(new_line) });
            old_line = old_line.saturating_add(1);
            new_line = new_line.saturating_add(1);
        } else {
            lines.push(DiffLine { kind: DiffKind::Context, content: line.to_string(), old_line: None, new_line: None });
        }
    }

    (lines, additions, deletions)
}

pub fn extract_diff_summary(result: &str, width: usize) -> Option<(String, Vec<Line<'static>>)> {
    let parsed: serde_json::Value = serde_json::from_str(result).ok()?;
    let diff = parsed.get("diff")?.as_str()?.to_string();
    let (lines, additions, deletions) = parse_diff(&diff);
    let summary = format!("(+{} / -{})", additions, deletions);
    let formatted = format_diff_lines(lines, width);
    Some((summary, formatted))
}

fn format_diff_lines(lines: Vec<DiffLine>, width: usize) -> Vec<Line<'static>> {
    let mut out = Vec::new();
    let line_num_width = 4usize;
    let content_width = width.saturating_sub(line_num_width * 2 + 3).max(10);

    for line in lines {
        let (prefix, style) = match line.kind {
            DiffKind::Header => ("", Style::default().fg(COLOR_PURPLE)),
            DiffKind::Hunk => ("", Style::default().fg(COLOR_CYAN)),
            DiffKind::Add => ("+", Style::default().fg(COLOR_GREEN)),
            DiffKind::Remove => ("-", Style::default().fg(COLOR_ERROR)),
            DiffKind::Context => (" ", Style::default().fg(COLOR_TEXT_DIM)),
        };

        let num_left = line.old_line.map(|n| format!("{:>width$}", n, width = line_num_width)).unwrap_or_else(|| " ".repeat(line_num_width));
        let num_right = line.new_line.map(|n| format!("{:>width$}", n, width = line_num_width)).unwrap_or_else(|| " ".repeat(line_num_width));
        let mut content_lines = wrap_diff_content(&line.content, content_width);
        if content_lines.is_empty() {
            content_lines.push(String::new());
        }
        for (idx, content) in content_lines.into_iter().enumerate() {
            let nums = if matches!(line.kind, DiffKind::Add | DiffKind::Remove | DiffKind::Context) {
                if idx == 0 {
                    format!("{} {} ", num_left, num_right)
                } else {
                    " ".repeat(line_num_width * 2 + 2)
                }
            } else {
                String::new()
            };
            let mut spans = Vec::new();
            if !nums.is_empty() {
                spans.push(Span::styled(nums, Style::default().fg(COLOR_TEXT_DIM)));
            }
            spans.push(Span::styled(format!("{}{}", prefix, content), style));
            out.push(Line::from(spans));
        }
    }
    out
}

pub fn render_markdown(content: &str, width: usize) -> Vec<Line<'static>> {
    if content.trim().is_empty() {
        return vec![Line::from("")];
    }
    let mut renderer = MarkdownRenderer::new(width);
    renderer.render(content);
    renderer.finish()
}

#[derive(Debug, Clone)]
struct ListState {
    ordered: bool,
    index: usize,
}

struct MarkdownRenderer {
    width: usize,
    lines: Vec<Line<'static>>,
    current_spans: Vec<Span<'static>>,
    current_width: usize,
    pending_space: bool,
    line_prefix: Option<(String, Style)>,
    pending_item_prefix: Option<(String, Style)>,
    style_stack: Vec<Style>,
    list_stack: Vec<ListState>,
    in_code_block: bool,
}

impl MarkdownRenderer {
    fn new(width: usize) -> Self {
        Self {
            width: width.max(10),
            lines: Vec::new(),
            current_spans: Vec::new(),
            current_width: 0,
            pending_space: false,
            line_prefix: None,
            pending_item_prefix: None,
            style_stack: vec![Style::default().fg(COLOR_TEXT)],
            list_stack: Vec::new(),
            in_code_block: false,
        }
    }

    fn finish(mut self) -> Vec<Line<'static>> {
        self.flush_line();
        if self.lines.is_empty() {
            self.lines.push(Line::from(""));
        }
        self.lines
    }

    fn render(&mut self, content: &str) {
        let mut options = MdOptions::empty();
        options.insert(MdOptions::ENABLE_STRIKETHROUGH);
        options.insert(MdOptions::ENABLE_TABLES);
        options.insert(MdOptions::ENABLE_TASKLISTS);
        let parser = MdParser::new_ext(content, options);
        for event in parser {
            match event {
                MdEvent::Start(tag) => self.on_start(tag),
                MdEvent::End(tag) => self.on_end(tag),
                MdEvent::Text(text) => {
                    if self.in_code_block {
                        self.push_code_block_text(&text);
                    } else {
                        self.push_text(&text, self.current_style());
                    }
                }
                MdEvent::Code(text) => {
                    self.push_word(&text, Style::default().fg(COLOR_GREEN));
                }
                MdEvent::SoftBreak => {
                    if self.in_code_block {
                        self.new_line();
                    } else {
                        self.push_space();
                    }
                }
                MdEvent::HardBreak => self.new_line(),
                MdEvent::Rule => {
                    self.new_line();
                    let bar = "─".repeat(self.width.min(40));
                    self.push_span(&bar, Style::default().fg(COLOR_MUTED));
                    self.new_line();
                }
                _ => {}
            }
        }
    }

    fn on_start(&mut self, tag: MdTag) {
        match tag {
            MdTag::Heading(_level, ..) => {
                self.new_line();
                let style = Style::default().fg(COLOR_PURPLE).add_modifier(Modifier::BOLD);
                self.style_stack.push(self.current_style().patch(style));
            }
            MdTag::BlockQuote => {
                self.new_line();
                self.line_prefix = Some(("> ".to_string(), Style::default().fg(COLOR_YELLOW)));
                self.style_stack.push(self.current_style().patch(Style::default().fg(COLOR_YELLOW).add_modifier(Modifier::ITALIC)));
            }
            MdTag::List(start) => {
                let ordered = start.is_some();
                let index = start.unwrap_or(1) as usize;
                self.list_stack.push(ListState { ordered, index });
            }
            MdTag::Item => {
                self.new_line();
                if let Some(state) = self.list_stack.last_mut() {
                    let prefix = if state.ordered {
                        format!("{}. ", state.index)
                    } else {
                        "• ".to_string()
                    };
                    self.pending_item_prefix = Some((prefix, Style::default().fg(COLOR_TEXT)));
                }
            }
            MdTag::CodeBlock(_) => {
                self.new_line();
                self.in_code_block = true;
            }
            MdTag::Emphasis => {
                self.style_stack.push(self.current_style().patch(Style::default().fg(COLOR_YELLOW).add_modifier(Modifier::ITALIC)));
            }
            MdTag::Strong => {
                self.style_stack.push(self.current_style().patch(Style::default().fg(COLOR_ORANGE).add_modifier(Modifier::BOLD)));
            }
            MdTag::Strikethrough => {
                self.style_stack.push(self.current_style().patch(Style::default().fg(COLOR_MUTED).add_modifier(Modifier::CROSSED_OUT)));
            }
            MdTag::Link(_, _, _) => {
                self.style_stack.push(self.current_style().patch(Style::default().fg(COLOR_CYAN).add_modifier(Modifier::UNDERLINED)));
            }
            _ => {}
        }
    }

    fn on_end(&mut self, tag: MdTag) {
        match tag {
            MdTag::Heading(..) => {
                self.style_stack.pop();
                self.new_line();
            }
            MdTag::BlockQuote => {
                self.style_stack.pop();
                self.line_prefix = None;
                self.new_line();
            }
            MdTag::List(_) => {
                self.list_stack.pop();
                self.new_line();
            }
            MdTag::Item => {
                if let Some(state) = self.list_stack.last_mut() {
                    if state.ordered {
                        state.index += 1;
                    }
                }
                self.new_line();
            }
            MdTag::CodeBlock(_) => {
                self.in_code_block = false;
                self.new_line();
            }
            MdTag::Emphasis | MdTag::Strong | MdTag::Strikethrough | MdTag::Link(..) => {
                self.style_stack.pop();
            }
            MdTag::Paragraph => {
                self.new_line_if_content();
            }
            _ => {}
        }
    }

    fn current_style(&self) -> Style {
        self.style_stack.last().cloned().unwrap_or_else(|| Style::default().fg(COLOR_TEXT))
    }

    fn flush_line(&mut self) {
        if self.current_spans.is_empty() && self.lines.is_empty() {
            return;
        }
        if !self.current_spans.is_empty() || !self.lines.is_empty() {
            self.lines.push(Line::from(self.current_spans.clone()));
        }
        self.current_spans.clear();
        self.current_width = 0;
    }

    fn new_line(&mut self) {
        self.pending_space = false;
        self.flush_line();
    }

    fn new_line_if_content(&mut self) {
        if !self.current_spans.is_empty() {
            self.flush_line();
        }
    }

    fn ensure_line_prefix(&mut self) {
        if self.current_spans.is_empty() {
            if let Some((prefix, style)) = self.line_prefix.clone() {
                self.push_span(&prefix, style);
            }
            if let Some((prefix, style)) = self.pending_item_prefix.take() {
                self.push_span(&prefix, style);
            }
        }
    }

    fn push_span(&mut self, text: &str, style: Style) {
        if text.is_empty() {
            return;
        }
        self.ensure_line_prefix();
        self.current_spans.push(Span::styled(text.to_string(), style));
        self.current_width += UnicodeWidthStr::width(text);
    }

    fn push_space(&mut self) {
        self.pending_space = true;
    }

    fn push_word(&mut self, word: &str, style: Style) {
        let word_width = UnicodeWidthStr::width(word);
        if self.current_width > 0 && self.pending_space && self.current_width + 1 + word_width > self.width {
            self.new_line();
        } else if self.current_width > 0 && self.pending_space {
            self.push_span(" ", Style::default().fg(COLOR_TEXT));
        }
        self.pending_space = false;

        if word_width <= self.width {
            self.push_span(word, style);
            return;
        }

        let mut remaining = word;
        while !remaining.is_empty() {
            let mut take = remaining.len();
            while take > 0 && UnicodeWidthStr::width(&remaining[..take]) > self.width {
                take -= 1;
            }
            if take == 0 {
                break;
            }
            let chunk = &remaining[..take];
            self.push_span(chunk, style);
            remaining = &remaining[take..];
            if !remaining.is_empty() {
                self.new_line();
            }
        }
    }

    fn push_text(&mut self, text: &str, style: Style) {
        let mut token = String::new();
        let mut in_space = false;
        for ch in text.chars() {
            if ch == '\n' {
                self.flush_token(&token, in_space, style);
                token.clear();
                in_space = false;
                self.new_line();
                continue;
            }
            let is_space = ch.is_whitespace();
            if is_space != in_space && !token.is_empty() {
                self.flush_token(&token, in_space, style);
                token.clear();
            }
            in_space = is_space;
            if is_space {
                token.push(' ');
            } else {
                token.push(ch);
            }
        }
        self.flush_token(&token, in_space, style);
    }

    fn flush_token(&mut self, token: &str, is_space: bool, style: Style) {
        if token.is_empty() {
            return;
        }
        if is_space {
            self.push_space();
        } else {
            self.push_word(token, style);
        }
    }

    fn push_code_block_text(&mut self, text: &str) {
        for (idx, line) in text.lines().enumerate() {
            if idx > 0 {
                self.new_line();
            }
            self.push_span(line, Style::default().fg(COLOR_GREEN));
        }
    }
}

pub fn tool_icon(name: &str) -> &'static str {
    match name {
        "read" => "[R]",
        "write" => "[W]",
        "edit" => "[E]",
        "multi_edit" => "[E]",
        "bash" => "[$]",
        "grep" => "[?]",
        "glob" => "[G]",
        "ls" => "[L]",
        "task" => "[T]",
        "websearch" => "[S]",
        "webfetch" => "[F]",
        "apply_patch" => "[P]",
        "question" => "[Q]",
        "todoread" => "[>]",
        "todowrite" => "[>]",
        "codesearch" => "[C]",
        _ => "[*]",
    }
}

struct ToolDisplay {
    label: String,
    color: Color,
}

fn tool_display(name: &str) -> ToolDisplay {
    match name {
        "read" => ToolDisplay { label: "Read".to_string(), color: COLOR_SUCCESS },
        "write" => ToolDisplay { label: "Write".to_string(), color: COLOR_ORANGE },
        "edit" => ToolDisplay { label: "Edit".to_string(), color: COLOR_ORANGE },
        "multi_edit" => ToolDisplay { label: "Multi Edit".to_string(), color: COLOR_ORANGE },
        "apply_patch" => ToolDisplay { label: "Patch".to_string(), color: COLOR_ORANGE },
        "bash" => ToolDisplay { label: "Terminal".to_string(), color: COLOR_CYAN },
        "grep" => ToolDisplay { label: "Search".to_string(), color: COLOR_PURPLE },
        "glob" => ToolDisplay { label: "Glob".to_string(), color: COLOR_PURPLE },
        "ls" => ToolDisplay { label: "List".to_string(), color: COLOR_PURPLE },
        "task" => ToolDisplay { label: "Task".to_string(), color: COLOR_WARNING },
        "websearch" => ToolDisplay { label: "Web Search".to_string(), color: COLOR_CYAN },
        "webfetch" => ToolDisplay { label: "Fetch".to_string(), color: COLOR_CYAN },
        "question" => ToolDisplay { label: "Question".to_string(), color: COLOR_WARNING },
        "todoread" => ToolDisplay { label: "Todos".to_string(), color: COLOR_WARNING },
        "todowrite" => ToolDisplay { label: "Todos".to_string(), color: COLOR_WARNING },
        "codesearch" => ToolDisplay { label: "Code Search".to_string(), color: COLOR_PURPLE },
        "lsp" => ToolDisplay { label: "LSP".to_string(), color: COLOR_PURPLE },
        "revert" => ToolDisplay { label: "Revert".to_string(), color: COLOR_ERROR },
        _ => ToolDisplay { label: name.to_string(), color: COLOR_TEXT_DIM },
    }
}

pub fn format_tool_args(args_json: &str) -> String {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(args_json) {
        if let Some(p) = value.get("file_path").and_then(|v| v.as_str()) {
            return p.to_string();
        }
        if let Some(cmd) = value.get("command").and_then(|v| v.as_str()) {
            return if cmd.len() > 60 { format!("{}...", &cmd[..60]) } else { cmd.to_string() };
        }
        if let Some(q) = value.get("query").and_then(|v| v.as_str()) {
            return format!("\"{}\"", q);
        }
        if let Some(pat) = value.get("pattern").and_then(|v| v.as_str()) {
            return pat.to_string();
        }
        if let Some(dir) = value.get("directory_path").and_then(|v| v.as_str()) {
            return dir.to_string();
        }
        if let Some(desc) = value.get("description").and_then(|v| v.as_str()) {
            return if desc.len() > 60 { format!("{}...", &desc[..60]) } else { desc.to_string() };
        }
        if let Some(url) = value.get("url").and_then(|v| v.as_str()) {
            return url.to_string();
        }
    }
    String::new()
}
