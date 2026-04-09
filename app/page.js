"use client";
import { useState, useRef, useCallback, useEffect } from "react";

const C = {
  bg: "#0a0c10", surface: "#12151c", surfaceHover: "#1a1e28",
  border: "#1e2330", borderActive: "#3b82f6",
  text: "#e2e8f0", textMuted: "#64748b", textDim: "#475569",
  accent: "#3b82f6", accentDim: "#1e3a5f",
  green: "#10b981", greenDim: "#064e3b",
  red: "#ef4444", redDim: "#7f1d1d",
  amber: "#f59e0b", amberDim: "#78350f",
  cyan: "#06b6d4",
  purple: "#a78bfa", purpleDim: "#2e1065",
};

function pct(n, d) { return d === 0 ? "\u2014" : (n / d * 100).toFixed(1) + "%"; }

function parseCSV(text) {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  function parseLine(line) {
    const vals = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ""; }
      else if (ch === '\r') {}
      else cur += ch;
    }
    vals.push(cur.trim());
    return vals;
  }
  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    if (vals.length < 2) continue;
    const row = {};
    headers.forEach((h, j) => { row[h] = vals[j] || ""; });
    rows.push(row);
  }
  return { headers, rows };
}

function parseConversationMessages(text) {
  if (!text || !text.trim()) return [{ role: "user", text: text || "" }];
  const lines = text.split("\n").filter(l => l.trim());
  const messages = [];
  let currentRole = null, currentText = "";
  for (const line of lines) {
    let detectedRole = null, content = line;
    if (/^(user|customer|client|human)\s*[:|-]/i.test(line.trim())) {
      detectedRole = "user"; content = line.replace(/^(user|customer|client|human)\s*[:|-]\s*/i, "");
    } else if (/^(bot|assistant|agent|ai|system|lawyer|expert)\s*[:|-]/i.test(line.trim())) {
      detectedRole = "bot"; content = line.replace(/^(bot|assistant|agent|ai|system|lawyer|expert)\s*[:|-]\s*/i, "");
    }
    if (detectedRole) {
      if (currentRole && currentText.trim()) messages.push({ role: currentRole, text: currentText.trim() });
      currentRole = detectedRole; currentText = content;
    } else {
      if (!currentRole) currentRole = "user";
      currentText += "\n" + line;
    }
  }
  if (currentRole && currentText.trim()) messages.push({ role: currentRole, text: currentText.trim() });
  if (messages.length === 0) messages.push({ role: "user", text });
  return messages;
}

function parseModelResponse(raw) {
  if (!raw) return { classification: null, reasoning: null };
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      const cls = (obj.classification || "").trim().toLowerCase();
      if (cls === "yes" || cls === "\"yes\"") return { classification: "YES", reasoning: obj.reasoning || null };
      if (cls === "no" || cls === "\"no\"") return { classification: "NO", reasoning: obj.reasoning || null };
      if (cls.includes("actionable") || cls.includes("action")) return { classification: "NO", reasoning: obj.reasoning || null };
      if (cls.includes("general")) return { classification: "YES", reasoning: obj.reasoning || null };
      return { classification: "YES", reasoning: obj.reasoning || null };
    }
  } catch (e) {}
  const lower = raw.toLowerCase().trim();
  if (lower.startsWith("no") || lower.includes('"no"') || lower.includes("actionable")) return { classification: "NO", reasoning: null };
  return { classification: "YES", reasoning: null };
}

async function callClassify(prompt, text) {
  const resp = await fetch("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 200, messages: [{ role: "user", content: prompt + "\n\n--- CONVERSATION ---\n" + text }] }),
  });
  if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error || "API error " + resp.status); }
  return resp.json();
}

// ── Components ────────────────────────────────────────────────

function Label({ children }) { return <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 8 }}>{children}</div>; }
function Card({ children, style: sx }) { return <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 10, padding: 20, ...sx }}>{children}</div>; }
function Pill({ label, color, bg }) { return <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color, border: "1px solid " + color + "33", whiteSpace: "nowrap" }}>{label}</span>; }

function Select({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: C.bg, color: C.text, border: "1px solid " + C.border, borderRadius: 5,
      padding: "6px 10px", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", minWidth: 160,
    }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function MetricCard({ label, value, color, sub }) {
  return (
    <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 8, padding: "14px 18px", flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || C.text, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textDim, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function ChatModal({ item, onClose }) {
  if (!item) return null;
  const messages = parseConversationMessages(item.text);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: C.bg, border: "1px solid " + C.border, borderRadius: 14, width: "100%", maxWidth: 700, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid " + C.border, display: "flex", justifyContent: "space-between", alignItems: "start", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Row #{item.index + 1}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>Classification:</span>
              <Pill label={item.predicted === "NO" ? "No (Actionable)" : "Yes (General)"} color={item.predicted === "NO" ? C.accent : C.green} bg={item.predicted === "NO" ? C.accentDim : C.greenDim} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.textMuted, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>{"\u00d7"}</button>
        </div>
        {item.reasoning && (
          <div style={{ padding: "12px 20px", borderBottom: "1px solid " + C.border, flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: C.accent, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 600 }}>Reasoning</div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, fontStyle: "italic" }}>{item.reasoning}</div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "80%", padding: "10px 14px", borderRadius: 12,
                  background: msg.role === "user" ? C.accentDim : C.surface,
                  border: "1px solid " + (msg.role === "user" ? C.accent + "33" : C.border),
                  borderBottomRightRadius: msg.role === "user" ? 4 : 12,
                  borderBottomLeftRadius: msg.role === "user" ? 12 : 4,
                }}>
                  <div style={{ fontSize: 10, color: msg.role === "user" ? C.accent : C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 600 }}>{msg.role === "user" ? "Customer" : "Bot"}</div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{msg.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RunHistory({ runs, activeRunId, onSelectRun, onDeleteRun, loading }) {
  if (loading) return <div style={{ fontSize: 12, color: C.textDim, padding: 12 }}>Loading runs...</div>;
  if (runs.length === 0) return <div style={{ fontSize: 12, color: C.textDim, padding: 12 }}>No saved runs yet.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {runs.map(r => (
        <div key={r.id} onClick={() => onSelectRun(r.id)}
          style={{
            padding: "10px 14px", borderRadius: 8, cursor: "pointer",
            background: activeRunId === r.id ? C.accentDim : C.bg,
            border: "1px solid " + (activeRunId === r.id ? C.accent : C.border),
          }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: activeRunId === r.id ? C.accent : C.text, marginBottom: 4 }}>{r.name}</div>
            <button onClick={e => { e.stopPropagation(); onDeleteRun(r.id); }}
              style={{ background: "transparent", border: "none", color: C.textDim, fontSize: 14, cursor: "pointer", padding: "0 2px" }}>{"\u00d7"}</button>
          </div>
          <div style={{ fontSize: 10, color: C.textDim, fontFamily: "'JetBrains Mono'" }}>
            {new Date(r.timestamp).toLocaleDateString()} {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {" \u00b7 "}{r.total} convos
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
            Yes: {r.yesCount || 0} {" \u00b7 "} No: {r.noCount || 0}
          </div>
        </div>
      ))}
    </div>
  );
}

const DEFAULT_PROMPT = `You are a classifier that determines whether a customer has a general legal question OR an actionable legal need.

** RULES **
ASSUME that the inquiry is a general legal question UNLESS the user clearly needs a lawyer to take action on their behalf.

Classify as an Actionable Legal Need IF the user:
- Explicitly asks for documents drafted, reviewed, or filed
- Explicitly asks for representation from a lawyer
- Explicitly asks for contracts to be written, negotiated, or executed
- Says they need or want a lawyer/attorney for their situation
- Has a court date, hearing, or legal deadline they mention
- Is actively involved in a legal proceeding (custody battle, lawsuit, criminal charge, etc.)
- Asks how to get or find a lawyer for their case
- Describes an active dispute where the other party has legal representation
- Is asking how to take a specific legal step (file, respond, petition, appeal) in a situation where legal action has already begun \u2014 NOT simply asking how to handle a situation that hasn\u2019t reached a legal process yet

The following are still NOT actionable legal needs:
- Asking a general legal question, even if the situation sounds serious
- Asking hypothetical or informational questions about the law
- Describing a situation and only asking what their options are or what something means
- Severity alone \u2014 a serious situation is NOT actionable unless the person is actively seeking legal help, not just information
- Needing help with a situation that has not entered any legal process yet, even if they say "I need help"

** GUIDELINES **
- Assess the conversation based on whether the user needs a lawyer to act on their behalf \u2014 NOT based on the severity of the case alone.
- Pay attention to the user\u2019s intent, not just their exact words. Someone describing a court date and asking for help clearly needs a lawyer even if they don\u2019t say "I need representation."
- You must state your reasoning behind your decision in 10 words or less.

** Output Format **
- Output "Yes" if the customer has a General Legal Question (they would be well-served by general advice).
- Output "No" if the customer has an Actionable Legal Need (they need a lawyer to take action on their behalf).

** Example Output Format **
json{
  "classification": "Yes" or "No"
  "reasoning": "<1-2 sentence explanation>"
}`;

// ── Main ──────────────────────────────────────────────────────

export default function Page() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [csvData, setCsvData] = useState(null);
  const [textCol, setTextCol] = useState("");
  const [sampleSize, setSampleSize] = useState(50);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState(null);
  const [detailFilter, setDetailFilter] = useState("all");
  const [chatItem, setChatItem] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef(false);

  const [savedRuns, setSavedRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [activeRunId, setActiveRunId] = useState(null);
  const [runName, setRunName] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [savingRun, setSavingRun] = useState(false);

  useEffect(() => {
    fetch("/api/runs").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setSavedRuns(data);
      setRunsLoading(false);
    }).catch(() => setRunsLoading(false));
  }, []);

  const loadRun = useCallback(async (id) => {
    try {
      const resp = await fetch("/api/runs?id=" + id);
      const data = await resp.json();
      if (data.evaluated) {
        setResults({ evaluated: data.evaluated, total: data.total, yesCount: data.yesCount, noCount: data.noCount, errors: data.errors });
        setPrompt(data.prompt || DEFAULT_PROMPT);
        setActiveRunId(id);
        setStatus("done");
        setDetailFilter("all");
      }
    } catch (e) { setErrorMsg("Failed to load run"); }
  }, []);

  const saveRun = useCallback(async () => {
    if (!results || !runName.trim()) return;
    setSavingRun(true);
    try {
      const payload = {
        id: Date.now().toString(),
        name: runName.trim(),
        timestamp: new Date().toISOString(),
        prompt, sampleSize,
        evaluated: results.evaluated,
        total: results.total, yesCount: results.yesCount, noCount: results.noCount, errors: results.errors,
      };
      const resp = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await resp.json();
      if (data.id) {
        setSavedRuns(prev => [{ id: data.id, name: runName.trim(), timestamp: payload.timestamp, total: results.total, yesCount: results.yesCount, noCount: results.noCount }, ...prev]);
        setActiveRunId(data.id);
        setRunName("");
      }
    } catch (e) { setErrorMsg("Failed to save run"); }
    setSavingRun(false);
  }, [results, runName, prompt, sampleSize]);

  const deleteRun = useCallback(async (id) => {
    try {
      await fetch("/api/runs?id=" + id, { method: "DELETE" });
      setSavedRuns(prev => prev.filter(r => r.id !== id));
      if (activeRunId === id) setActiveRunId(null);
    } catch (e) {}
  }, [activeRunId]);

  const handleFile = useCallback((e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      setCsvData(parsed);
      setTextCol(parsed.headers[0] || "");
      setResults(null); setStatus("idle"); setErrorMsg(""); setActiveRunId(null);
    };
    reader.readAsText(file);
  }, []);

  const runEval = useCallback(async () => {
    if (!csvData || !textCol) return;
    abortRef.current = false; setStatus("running"); setErrorMsg(""); setResults(null); setActiveRunId(null);

    const allRows = csvData.rows.filter(r => (r[textCol] || "").trim().length > 0);
    const sample = sampleSize >= allRows.length ? [...allRows] : [...allRows].sort(() => Math.random() - 0.5).slice(0, sampleSize);

    setProgress({ done: 0, total: sample.length });

    const evaluated = sample.map((row, i) => ({
      index: i, text: row[textCol] || "", predicted: null, reasoning: null, error: null,
    }));

    for (let i = 0; i < evaluated.length; i++) {
      if (abortRef.current) break;
      try {
        const data = await callClassify(prompt, evaluated[i].text);
        const raw = data.content?.[0]?.text || "";
        const parsed = parseModelResponse(raw);
        evaluated[i].predicted = parsed.classification;
        evaluated[i].reasoning = parsed.reasoning;
      } catch (err) { evaluated[i].error = err.message; }
      setProgress({ done: i + 1, total: sample.length });
      if (i < evaluated.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    if (abortRef.current) { setStatus("idle"); return; }

    let yesCount = 0, noCount = 0, errors = 0;
    for (const r of evaluated) {
      if (r.error) { errors++; continue; }
      if (r.predicted === "YES") yesCount++;
      else noCount++;
    }

    setResults({ evaluated, total: evaluated.length, yesCount, noCount, errors });
    setStatus("done");
  }, [csvData, textCol, prompt, sampleSize]);

  const filteredRows = results?.evaluated?.filter(r => {
    if (detailFilter === "all") return true;
    if (detailFilter === "yes") return r.predicted === "YES";
    if (detailFilter === "no") return r.predicted === "NO";
    if (detailFilter === "error") return !!r.error;
    return true;
  }) || [];

  const exportCSV = useCallback(() => {
    if (!results) return;
    const header = ["Index", "Classification", "Reasoning", "Text"];
    const rows = results.evaluated.map(r => [
      r.index + 1,
      r.predicted || "ERROR",
      '"' + (r.reasoning || "").replace(/"/g, '""') + '"',
      '"' + (r.text || "").slice(0, 1000).replace(/"/g, '""') + '"',
    ]);
    const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "eval_results.csv"; a.click(); URL.revokeObjectURL(url);
  }, [results]);

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: C.bg, color: C.text, minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <ChatModal item={chatItem} onClose={() => setChatItem(null)} />

      {/* Header */}
      <div style={{ borderBottom: "1px solid " + C.border, padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, fontFamily: "'JetBrains Mono'", color: C.accent, fontWeight: 600 }}>{"\u25b8"}</span>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>Prompt Eval</h1>
          </div>
          <p style={{ margin: "3px 0 0 22px", fontSize: 12, color: C.textMuted }}>Test prompt output against conversation data</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => setShowHistory(!showHistory)} style={{
            background: showHistory ? C.purpleDim : "transparent", color: showHistory ? C.purple : C.textDim,
            border: "1px solid " + (showHistory ? C.purple + "44" : C.border),
            borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>History ({savedRuns.length})</button>
          {results && <button onClick={exportCSV} style={{ background: "transparent", color: C.cyan, border: "1px solid " + C.cyan + "44", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Export CSV</button>}
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: status === "running" ? C.accent : status === "done" ? C.green : C.textDim, background: status === "running" ? C.accentDim : status === "done" ? C.greenDim : "transparent", padding: "3px 10px", borderRadius: 4, border: "1px solid " + (status === "running" ? C.accent : status === "done" ? C.green : C.textDim) + "33" }}>{status === "running" ? "Running" : status === "done" ? "Complete" : "Idle"}</span>
        </div>
      </div>

      <div style={{ display: "flex" }}>
        {showHistory && (
          <div style={{ width: 280, minWidth: 280, borderRight: "1px solid " + C.border, padding: 16, overflowY: "auto", maxHeight: "calc(100vh - 70px)" }}>
            <Label>Saved Runs</Label>
            <RunHistory runs={savedRuns} activeRunId={activeRunId} onSelectRun={loadRun} onDeleteRun={deleteRun} loading={runsLoading} />
          </div>
        )}

        <div style={{ flex: 1, padding: "20px 28px", maxWidth: 1100 }}>

          {/* Prompt */}
          <Card style={{ marginBottom: 18 }}>
            <Label>Prompt</Label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={6} style={{
              width: "100%", boxSizing: "border-box", background: C.bg, border: "1px solid " + C.border,
              borderRadius: 6, color: C.text, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
              padding: 12, resize: "vertical", lineHeight: 1.5, outline: "none",
            }} onFocus={e => e.target.style.borderColor = C.accent} onBlur={e => e.target.style.borderColor = C.border} />
          </Card>

          {/* Upload + config */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
            <Card>
              <Label>Data (CSV)</Label>
              <input type="file" accept=".csv" onChange={handleFile} style={{ fontSize: 12, color: C.text, marginBottom: 10 }} />
              {csvData && (
                <>
                  <div style={{ fontSize: 11, color: C.green, fontFamily: "'JetBrains Mono'", marginBottom: 10 }}>{"\u2713"} {csvData.rows.length} rows {"\u00b7"} {csvData.headers.length} columns</div>
                  <div>
                    <span style={{ fontSize: 11, color: C.textDim, marginRight: 8 }}>Column to classify:</span>
                    <Select value={textCol} onChange={setTextCol} options={csvData.headers} />
                  </div>
                </>
              )}
            </Card>
            <Card>
              <Label>Sample Size</Label>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>Start small to test, scale up when confident.</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {[25, 50, 100, 200].map(n => <button key={n} onClick={() => setSampleSize(n)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: sampleSize === n ? C.accentDim : C.bg, border: "1px solid " + (sampleSize === n ? C.accent : C.border), color: sampleSize === n ? C.accent : C.textDim }}>{n}</button>)}
                <button onClick={() => setSampleSize(csvData?.rows?.length || 0)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: sampleSize >= (csvData?.rows?.length || 999999) ? C.accentDim : C.bg, border: "1px solid " + (sampleSize >= (csvData?.rows?.length || 999999) ? C.accent : C.border), color: sampleSize >= (csvData?.rows?.length || 999999) ? C.accent : C.textDim }}>All</button>
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>~{Math.ceil(sampleSize * 0.4 / 60)} min {"\u00b7"} {sampleSize} API calls</div>
            </Card>
          </div>

          {/* Run + save */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={runEval} disabled={status === "running" || !csvData || !textCol} style={{
              background: status === "running" ? C.textDim : C.accent, color: "#fff", border: "none",
              borderRadius: 8, padding: "10px 28px", fontSize: 13, fontWeight: 600,
              cursor: status === "running" || !csvData || !textCol ? "not-allowed" : "pointer",
              opacity: (!csvData || !textCol) && status !== "running" ? 0.4 : 1,
            }}>
              {status === "running" ? "Processing " + progress.done + "/" + progress.total + "..." : "Run (" + sampleSize + " rows)"}
            </button>
            {status === "running" && <button onClick={() => { abortRef.current = true; }} style={{ background: C.redDim, color: C.red, border: "1px solid " + C.red + "44", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Stop</button>}
            {status === "done" && !activeRunId && (
              <>
                <input value={runName} onChange={e => setRunName(e.target.value)} placeholder="Name this run..." style={{ background: C.bg, color: C.text, border: "1px solid " + C.border, borderRadius: 6, padding: "8px 12px", fontSize: 13, width: 200 }} />
                <button onClick={saveRun} disabled={!runName.trim() || savingRun} style={{ background: C.greenDim, color: C.green, border: "1px solid " + C.green + "44", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: !runName.trim() ? "not-allowed" : "pointer", opacity: !runName.trim() ? 0.4 : 1 }}>
                  {savingRun ? "Saving..." : "Save Run"}
                </button>
              </>
            )}
            {activeRunId && <span style={{ fontSize: 12, color: C.purple }}>Viewing saved run</span>}
            {errorMsg && <span style={{ fontSize: 12, color: C.red }}>{errorMsg}</span>}
          </div>

          {status === "running" && <div style={{ marginBottom: 24 }}><div style={{ background: C.surface, borderRadius: 6, height: 6, overflow: "hidden", border: "1px solid " + C.border }}><div style={{ width: (progress.total > 0 ? (progress.done / progress.total * 100) : 0) + "%", height: "100%", background: C.accent, borderRadius: 6, transition: "width 0.3s ease" }} /></div></div>}

          {/* Results */}
          {results && (<>
            <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
              <MetricCard label='Said "Yes" (General)' value={results.yesCount} color={C.green} sub={pct(results.yesCount, results.total - results.errors) + " of total"} />
              <MetricCard label='Said "No" (Actionable)' value={results.noCount} color={C.accent} sub={pct(results.noCount, results.total - results.errors) + " of total"} />
              <MetricCard label="Total" value={results.total} color={C.text} sub={results.errors > 0 ? results.errors + " errors" : "0 errors"} />
            </div>

            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <Label>Results ({filteredRows.length})</Label>
                <div style={{ display: "flex", gap: 4 }}>
                  {[
                    { key: "all", label: "All", color: C.text },
                    { key: "yes", label: 'Said "Yes"', color: C.green },
                    { key: "no", label: 'Said "No"', color: C.accent },
                    ...(results.errors > 0 ? [{ key: "error", label: "Errors", color: C.red }] : []),
                  ].map(f => (
                    <button key={f.key} onClick={() => setDetailFilter(f.key)} style={{ background: detailFilter === f.key ? f.color + "22" : "transparent", color: detailFilter === f.key ? f.color : C.textDim, border: "1px solid " + (detailFilter === f.key ? f.color + "44" : C.border), borderRadius: 5, padding: "3px 9px", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "'JetBrains Mono'" }}>{f.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ maxHeight: 500, overflowY: "auto", borderRadius: 6, border: "1px solid " + C.border }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ position: "sticky", top: 0, background: C.bg, zIndex: 1 }}>
                    {["#", "Result", "Reasoning", "Text"].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid " + C.border, fontWeight: 600 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {filteredRows.slice(0, 200).map((r, i) => (
                      <tr key={r.index} onClick={() => setChatItem(r)} style={{ borderBottom: "1px solid " + C.border, cursor: "pointer", background: i % 2 === 0 ? "transparent" : C.bg + "80" }} onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover} onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : C.bg + "80"}>
                        <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono'", color: C.textDim, fontSize: 11 }}>{r.index + 1}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <Pill label={r.error ? "ERR" : r.predicted === "NO" ? "No" : "Yes"} color={r.error ? C.red : r.predicted === "NO" ? C.accent : C.green} bg={r.error ? C.redDim : r.predicted === "NO" ? C.accentDim : C.greenDim} />
                        </td>
                        <td style={{ padding: "8px 10px", color: C.textDim, fontSize: 11, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reasoning || r.error || ""}</td>
                        <td style={{ padding: "8px 10px", color: C.textDim, fontSize: 11, fontFamily: "'IBM Plex Mono'", maxWidth: 350, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.text?.slice(0, 150)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > 200 && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, textAlign: "center" }}>Showing 200 of {filteredRows.length}</div>}
            </Card>
          </>)}

          {status === "idle" && !results && <div style={{ textAlign: "center", padding: "40px 20px", color: C.textDim }}><div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>{"\u25b8"}</div><div style={{ fontSize: 13, marginBottom: 4 }}>Upload a CSV, pick the column to classify, and run</div><div style={{ fontSize: 12 }}>One prompt {"\u00b7"} Any data {"\u00b7"} See every result</div></div>}
        </div>
      </div>
    </div>
  );
}
