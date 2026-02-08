use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use crossterm::event::{self, Event, EnableBracketedPaste, DisableBracketedPaste};
use crossterm::terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen};
use crossterm::execute;
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;
use serde_json::json;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

mod backend;
mod constants;
mod app;
mod commands;
mod input;
mod ui;

use backend::{BackendClient, ChatState, TimelineEvent};
use constants::SPINNER_FRAMES;
use app::{App, PendingQuestion, QuestionState, SessionInfo, TodoCounts, TodoItem, UiMode};
use input::{handle_key, handle_paste};
use ui::{extract_diff_summary, format_tool_args, render_ui, tool_icon};

enum UiUpdate {
    Todos { list: Vec<TodoItem>, counts: TodoCounts },
    Question(QuestionState),
    QuestionNone,
}

#[derive(Parser, Debug)]
#[command(name = "stratuscode", version = env!("CARGO_PKG_VERSION"))]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    #[arg(short, long, default_value = ".")]
    dir: String,

    #[arg(short, long, default_value = "build")]
    agent: String,

    #[arg(long)]
    prompt: Option<String>,

    #[arg(long)]
    model: Option<String>,

    #[arg(long)]
    provider: Option<String>,
}

#[derive(Subcommand, Debug)]
enum Commands {
    Auth {
        key: Option<String>,
        #[arg(long)]
        show: bool,
        #[arg(long)]
        provider: Option<String>,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .unwrap()
        .to_path_buf();

    if let Some(Commands::Auth { key, show, provider }) = cli.command {
        return run_auth(&root, key, show, provider);
    }

    if let Some(prompt) = cli.prompt.clone() {
        return run_non_interactive(&root, &cli, &prompt);
    }

    run_interactive(&root, &cli)
}

fn run_auth(root: &Path, key: Option<String>, show: bool, provider: Option<String>) -> Result<()> {
    let primary = root.join("packages/tui/dist/auth.js");
    let fallback = root.join("packages/tui/src/auth.ts");
    let auth_path = if primary.exists() { primary } else if fallback.exists() { fallback } else {
        return Err(anyhow!("Auth script not found: {}", primary.display()));
    };

    let mut args = vec![auth_path.to_string_lossy().to_string()];
    if let Some(k) = key {
        args.push(k);
    }
    if show {
        args.push("--show".to_string());
    }
    if let Some(p) = provider {
        args.push("--provider".to_string());
        args.push(p);
    }

    let status = std::process::Command::new("bun").args(args).status()?;
    if !status.success() {
        return Err(anyhow!("Auth command failed"));
    }
    Ok(())
}

fn run_interactive(root: &Path, cli: &Cli) -> Result<()> {
    let primary_backend = root.join("packages/tui/dist/backend/server.js");
    let fallback_backend = root.join("packages/tui/dist/backend.js");
    let backend_path = if primary_backend.exists() {
        primary_backend
    } else if fallback_backend.exists() {
        fallback_backend
    } else {
        return Err(anyhow!("Backend build not found: {}", primary_backend.display()));
    };

    let args = vec![backend_path.to_string_lossy().to_string()];
    let (client, notify_rx) = BackendClient::spawn("bun", &args)?;
    let client = Arc::new(Mutex::new(client));

    let project_dir = std::fs::canonicalize(&cli.dir)
        .or_else(|_| std::env::current_dir().map(|cwd| cwd.join(&cli.dir)))
        .unwrap_or_else(|_| PathBuf::from(&cli.dir));
    let project_dir_str = project_dir.to_string_lossy().to_string();

    let init_payload = json!({
        "projectDir": project_dir_str,
        "agent": cli.agent,
        "model": cli.model,
        "provider": cli.provider,
    });

    let init_result = client.lock().unwrap().call("initialize", init_payload)?;
    let state: ChatState = serde_json::from_value(init_result.get("state").cloned().unwrap_or_default())
        .map_err(|e| anyhow!("Failed to parse state: {e}"))?;
    let base_model = init_result
        .get("baseModel")
        .and_then(|v| v.as_str())
        .unwrap_or("default")
        .to_string();

    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableBracketedPaste)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut app = App::new(state, project_dir_str, base_model);
    let mut last_tick = Instant::now();
    let (ui_tx, ui_rx) = std::sync::mpsc::channel::<UiUpdate>();

    loop {
        let tick_rate = if app.state.is_loading { Duration::from_millis(80) } else { Duration::from_millis(220) };
        if app.dirty || last_tick.elapsed() >= tick_rate {
            if app.state.is_loading {
                app.spinner_index = (app.spinner_index + 1) % SPINNER_FRAMES.len();
                app.mark_dirty();
            }
            if app.needs_clear {
                let _ = terminal.clear();
                app.needs_clear = false;
            }
            render_ui(&mut terminal, &mut app)?;
            app.dirty = false;
            last_tick = Instant::now();
        }

        while let Ok(notif) = notify_rx.try_recv() {
            app.handle_notification(notif);
        }

        while let Ok(update) = ui_rx.try_recv() {
            match update {
                UiUpdate::Todos { list, counts } => {
                    app.todos = list;
                    app.todo_counts = counts;
                    app.todos_request_inflight = false;
                    app.mark_dirty();
                }
                UiUpdate::Question(question) => {
                    let replace = match &app.question {
                        None => true,
                        Some(existing) => existing.id != question.id,
                    };
                    if replace {
                        app.question = Some(question);
                        app.mode = UiMode::QuestionPrompt;
                        app.mark_dirty();
                    }
                    app.question_request_inflight = false;
                }
                UiUpdate::QuestionNone => {
                    app.question_request_inflight = false;
                }
            }
        }

        if app.history_needs_refresh && matches!(app.mode, UiMode::SessionHistory) {
            if let Ok(resp) = client.lock().unwrap().call("list_sessions", json!({ "projectDir": app.project_dir, "limit": 20, "currentSessionId": app.state.session_id })) {
                if let Ok(list) = serde_json::from_value::<Vec<SessionInfo>>(resp) {
                    app.session_list = list;
                    if app.session_selected >= app.session_list.len() && !app.session_list.is_empty() {
                        app.session_selected = app.session_list.len() - 1;
                    }
                }
            }
            app.history_needs_refresh = false;
            app.mark_dirty();
        }

        let timeout = Duration::from_millis(10);
        if event::poll(timeout)? {
            match event::read()? {
                Event::Key(key) => handle_key(&mut app, key, &client),
                Event::Paste(text) => handle_paste(&mut app, text),
                _ => {}
            }
        }

        if app.should_quit {
            break;
        }

        let todo_refresh = if app.state.is_loading { Duration::from_millis(750) } else { Duration::from_secs(3) };
        if (app.todos_expanded || !app.todos.is_empty())
            && app.last_todos_refresh.elapsed() > todo_refresh
            && !app.todos_request_inflight
        {
            if let Some(session_id) = app.state.session_id.clone() {
                app.todos_request_inflight = true;
                app.last_todos_refresh = Instant::now();
                let client = client.clone();
                let tx = ui_tx.clone();
                std::thread::spawn(move || {
                    let mut list = Vec::new();
                    let mut counts = TodoCounts { pending: 0, in_progress: 0, completed: 0, total: 0 };
                    if let Ok(resp) = client.lock().unwrap().call("list_todos", json!({ "sessionId": session_id })) {
                        if let Some(list_val) = resp.get("list") {
                            if let Ok(parsed) = serde_json::from_value::<Vec<TodoItem>>(list_val.clone()) {
                                list = parsed;
                            }
                        }
                        if let Some(counts_val) = resp.get("counts") {
                            if let Ok(parsed) = serde_json::from_value::<TodoCounts>(counts_val.clone()) {
                                counts = parsed;
                            }
                        }
                    }
                    let _ = tx.send(UiUpdate::Todos { list, counts });
                });
            }
        }

        if app.last_question_poll.elapsed() > Duration::from_millis(500) && !app.question_request_inflight {
            if let Some(session_id) = app.state.session_id.clone() {
                app.question_request_inflight = true;
                app.last_question_poll = Instant::now();
                let client = client.clone();
                let tx = ui_tx.clone();
                std::thread::spawn(move || {
                    if let Ok(resp) = client.lock().unwrap().call("get_pending_question", json!({ "sessionId": session_id })) {
                        if let Ok(list) = serde_json::from_value::<Vec<PendingQuestion>>(resp) {
                            if let Some(pending) = list.first() {
                                if let Some(item) = pending.questions.first() {
                                    let options = item.options.clone();
                                    let mut selected = vec![false; options.len()];
                                    if !selected.is_empty() {
                                        selected[0] = true;
                                    }
                                    let q = QuestionState {
                                        id: pending.id.clone(),
                                        question: item.question.clone(),
                                        header: item.header.clone(),
                                        options,
                                        allow_multiple: item.allow_multiple.unwrap_or(false),
                                        allow_custom: item.allow_custom.unwrap_or(false),
                                        selected,
                                        focused_index: 0,
                                        custom_input: String::new(),
                                        custom_active: false,
                                    };
                                    let _ = tx.send(UiUpdate::Question(q));
                                    return;
                                }
                            }
                        }
                    }
                    let _ = tx.send(UiUpdate::QuestionNone);
                });
            }
        }

        if let Some((_, at)) = app.toast {
            if at.elapsed() > Duration::from_secs(5) {
                app.toast = None;
                app.mark_dirty();
            }
        }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), DisableBracketedPaste, LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    client.lock().unwrap().shutdown();

    Ok(())
}

fn run_non_interactive(root: &Path, cli: &Cli, prompt: &str) -> Result<()> {
    let primary_backend = root.join("packages/tui/dist/backend/server.js");
    let fallback_backend = root.join("packages/tui/dist/backend.js");
    let backend_path = if primary_backend.exists() {
        primary_backend
    } else if fallback_backend.exists() {
        fallback_backend
    } else {
        return Err(anyhow!("Backend build not found: {}", primary_backend.display()));
    };
    let args = vec![backend_path.to_string_lossy().to_string()];
    let (client, notify_rx) = BackendClient::spawn("bun", &args)?;
    let mut client = client;

    let notify_handle = thread::spawn(move || {
        for notif in notify_rx.iter() {
            if notif.method == "timeline_event" {
                if let Ok(event) = serde_json::from_value::<TimelineEvent>(notif.params) {
                    if event.kind == "tool_call" {
                        let icon = tool_icon(event.tool_name.as_deref().unwrap_or(""));
                        println!("\n{} {}", icon, event.tool_name.unwrap_or_else(|| "tool".to_string()));
                        if !event.content.is_empty() {
                            println!("   {}", format_tool_args(&event.content));
                        }
                    }
                    if event.kind == "tool_result" {
                        if let Some((_summary, diff_lines)) = extract_diff_summary(&event.content, 120) {
                            for line in diff_lines.into_iter().take(120) {
                                let mut out = String::new();
                                for span in line.spans {
                                    out.push_str(span.content.as_ref());
                                }
                                if !out.is_empty() {
                                    println!("   {}", out);
                                }
                            }
                        } else {
                            // no output for non-diff tool results
                        }
                    }
                }
            }
        }
    });

    println!("\n> Running with agent: {}", cli.agent);
    println!("> Project: {}", cli.dir);
    println!("\n> You: {}\n", prompt);

    let project_dir = std::fs::canonicalize(&cli.dir)
        .or_else(|_| std::env::current_dir().map(|cwd| cwd.join(&cli.dir)))
        .unwrap_or_else(|_| PathBuf::from(&cli.dir));
    let project_dir_str = project_dir.to_string_lossy().to_string();

    let init_payload = json!({
        "projectDir": project_dir_str,
        "agent": cli.agent,
        "model": cli.model,
        "provider": cli.provider,
    });
    let init_result = client.call("initialize", init_payload)?;
    let _state: ChatState = serde_json::from_value(init_result.get("state").cloned().unwrap_or_default())
        .map_err(|e| anyhow!("Failed to parse state: {e}"))?;

    client.call("send_message", json!({ "content": prompt }))?;
    let state_value = client.call("get_state", json!({}))?;
    let state: ChatState = serde_json::from_value(state_value).map_err(|e| anyhow!("Failed to parse state: {e}"))?;

    if let Some(last) = state.timeline_events.iter().rev().find(|e| e.kind == "assistant") {
        println!("{}", last.content);
    }
    println!("\nTokens: {} in / {} out", state.tokens.input, state.tokens.output);
    client.shutdown();
    let _ = notify_handle.join();
    Ok(())
}
