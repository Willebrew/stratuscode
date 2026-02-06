use anyhow::{anyhow, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

#[derive(Debug, Clone)]
pub struct BackendNotification {
    pub method: String,
    pub params: Value,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub input: u64,
    pub output: u64,
    pub context: Option<u64>,
    pub model: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    pub id: String,
    pub session_id: String,
    pub created_at: i64,
    pub kind: String,
    pub content: String,
    pub tokens: Option<TokenUsage>,
    pub streaming: Option<bool>,
    pub tool_call_id: Option<String>,
    pub tool_name: Option<String>,
    pub status: Option<String>,
    pub attachments: Option<Vec<Attachment>>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub r#type: String,
    pub mime: Option<String>,
    pub line_count: Option<u64>,
    pub text: Option<String>,
    pub data: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatState {
    pub messages: Vec<Value>,
    pub is_loading: bool,
    pub error: Option<String>,
    pub timeline_events: Vec<TimelineEvent>,
    pub session_tokens: Option<TokenUsage>,
    pub context_usage: ContextUsage,
    pub context_status: Option<String>,
    pub tokens: TokenUsage,
    pub session_id: Option<String>,
    pub plan_exit_proposed: bool,
    pub agent: String,
    pub model_override: Option<String>,
    pub provider_override: Option<String>,
    pub reasoning_effort_override: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextUsage {
    pub used: u64,
    pub limit: u64,
    pub percent: u64,
}

pub struct BackendClient {
    child: Child,
    stdin: ChildStdin,
    pending: Arc<Mutex<HashMap<u64, Sender<Value>>>>,
    next_id: AtomicU64,
}

impl BackendClient {
    pub fn spawn(backend_cmd: &str, args: &[String]) -> Result<(Self, Receiver<BackendNotification>)> {
        let mut cmd = Command::new(backend_cmd);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        let mut child = cmd.spawn()?;
        let stdin = child.stdin.take().ok_or_else(|| anyhow!("Failed to open stdin"))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow!("Failed to open stdout"))?;

        let pending: Arc<Mutex<HashMap<u64, Sender<Value>>>> = Arc::new(Mutex::new(HashMap::new()));
        let (notify_tx, notify_rx) = mpsc::channel();

        Self::start_reader_thread(stdout, pending.clone(), notify_tx);

        Ok((Self {
            child,
            stdin,
            pending,
            next_id: AtomicU64::new(1),
        }, notify_rx))
    }

    fn start_reader_thread(stdout: ChildStdout, pending: Arc<Mutex<HashMap<u64, Sender<Value>>>>, notify_tx: Sender<BackendNotification>) {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let value: Value = match serde_json::from_str(trimmed) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                if let Some(id) = value.get("id").and_then(|v| v.as_u64()) {
                    let mut map = pending.lock().unwrap();
                    if let Some(tx) = map.remove(&id) {
                        let _ = tx.send(value);
                    }
                } else if let Some(method) = value.get("method").and_then(|v| v.as_str()) {
                    let params = value.get("params").cloned().unwrap_or(Value::Null);
                    let _ = notify_tx.send(BackendNotification {
                        method: method.to_string(),
                        params,
                    });
                }
            }
        });
    }

    pub fn call(&mut self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let request = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let mut line = serde_json::to_string(&request)?;
        line.push('\n');
        self.stdin.write_all(line.as_bytes())?;
        self.stdin.flush()?;

        let (tx, rx) = mpsc::channel();
        self.pending.lock().unwrap().insert(id, tx);
        let resp = rx.recv().map_err(|_| anyhow!("Backend closed"))?;

        if let Some(error) = resp.get("error") {
            return Err(anyhow!(error.to_string()));
        }
        Ok(resp.get("result").cloned().unwrap_or(Value::Null))
    }

    pub fn shutdown(&mut self) {
        let _ = self.child.kill();
    }
}
