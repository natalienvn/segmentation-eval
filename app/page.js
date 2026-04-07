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
  cyan: "#06b6d4", cyanDim: "#0e3a42",
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
    if (vals.length < headers.length / 2) continue;
    const row = {};
    headers.forEach((h, j) => { row[h] = vals[j] || ""; });
    rows.push(row);
  }
  return { headers, rows };
}

function stitchConversation(row) {
  const messages = [];
  for (let i = 1; i <= 10; i++) {
    const text = (row["Message_No_" + i] || "").trim();
    if (!text) continue;
    messages.push({ role: i % 2 === 1 ? "bot" : "user", text });
  }
  return messages;
}

function conversationToString(messages) {
  return messages.map(m => (m.role === "user" ? "Customer" : "Bot") + ": " + m.text).join("\n");
}

function parseModelResponse(raw) {
  if (!raw) return { classification: null, reasoning: null };
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      const cls = (obj.classification || "").trim().toLowerCase();
      if (cls === "yes" || cls === "\"yes\"") return { classification: "GENERAL", reasoning: obj.reasoning || null };
      if (cls === "no" || cls === "\"no\"") return { classification: "ACTIONABLE", reasoning: obj.reasoning || null };
      if (cls.includes("actionable") || cls.includes("action")) return { classification: "ACTIONABLE", reasoning: obj.reasoning || null };
      if (cls.includes("general")) return { classification: "GENERAL", reasoning: obj.reasoning || null };
      return { classification: "GENERAL", reasoning: obj.reasoning || null };
    }
  } catch (e) {}
  const lower = raw.toLowerCase().trim();
  if (lower.startsWith("no") || lower.includes('"no"') || lower.includes("actionable")) return { classification: "ACTIONABLE", reasoning: null };
  return { classification: "GENERAL", reasoning: null };
}

async function callClassify(prompt, conversation) {
  const resp = await fetch("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 200, messages: [{ role: "user", content: prompt + "\n\n--- CONVERSATION ---\n" + conversation }] }),
  });
  if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error || "API error " + resp.status); }
  return resp.json();
}

// ── Components ────────────────────────────────────────────────

function Label({ children }) { return <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 8 }}>{children}</div>; }
function Card({ children, style: sx }) { return <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 10, padding: 20, ...sx }}>{children}</div>; }
function Pill({ label, color, bg }) { return <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color, border: "1px solid " + color + "33", whiteSpace: "nowrap" }}>{label}</span>; }

function MetricCard({ label, value, color, sub }) {
  return (
    <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 8, padding: "14px 18px", flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || C.text, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textDim, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function CorrelationBar({ label, bounced, converted, total, color }) {
  const bPct = total > 0 ? (bounced / total * 100) : 0;
  const cPct = total > 0 ? (converted / total * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: C.text, fontWeight: 600 }}>{label}</span>
        <span style={{ color: C.textDim }}>{total} convos</span>
      </div>
      <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", border: "1px solid " + C.border }}>
        <div style={{ width: bPct + "%", background: color || C.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {bPct > 12 && <span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>{bPct.toFixed(0)}% Didn't Conv.</span>}
        </div>
        <div style={{ width: cPct + "%", background: C.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {cPct > 12 && <span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>{cPct.toFixed(0)}% Converted</span>}
        </div>
      </div>
    </div>
  );
}

function ChatModal({ item, onClose, promptLabels }) {
  if (!item) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: C.bg, border: "1px solid " + C.border, borderRadius: 14, width: "100%", maxWidth: 700, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid " + C.border, display: "flex", justifyContent: "space-between", alignItems: "start", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Conversation #{item.index + 1}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>JA:</span>
              <Pill label={item.isConverted === "Yes" ? "Converted" : "Didn't Convert"} color={item.isConverted === "Yes" ? C.green : C.amber} bg={item.isConverted === "Yes" ? C.greenDim : C.amberDim} />
              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>{promptLabels[0]}:</span>
              <Pill label={item.p1Predicted === "ACTIONABLE" ? "No (Actionable)" : "Yes (General)"} color={item.p1Predicted === "ACTIONABLE" ? C.accent : C.green} bg={item.p1Predicted === "ACTIONABLE" ? C.accentDim : C.greenDim} />
              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>{promptLabels[1]}:</span>
              <Pill label={item.p2Predicted === "ACTIONABLE" ? "No (Actionable)" : "Yes (General)"} color={item.p2Predicted === "ACTIONABLE" ? C.purple : C.green} bg={item.p2Predicted === "ACTIONABLE" ? C.purpleDim : C.greenDim} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.textMuted, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>{"\u00d7"}</button>
        </div>
        {(item.p1Reasoning || item.p2Reasoning) && (
          <div style={{ padding: "12px 20px", borderBottom: "1px solid " + C.border, display: "flex", gap: 16, flexShrink: 0 }}>
            {item.p1Reasoning && <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: C.accent, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 600 }}>{promptLabels[0]} reasoning</div><div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, fontStyle: "italic" }}>{item.p1Reasoning}</div></div>}
            {item.p2Reasoning && <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: C.purple, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 600 }}>{promptLabels[1]} reasoning</div><div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, fontStyle: "italic" }}>{item.p2Reasoning}</div></div>}
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(item.messages || []).map((msg, i) => (
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

// ── Run History Sidebar ───────────────────────────────────────

function RunHistory({ runs, activeRunId, onSelectRun, onDeleteRun, loading }) {
  if (loading) return <div style={{ fontSize: 12, color: C.textDim, padding: 12 }}>Loading runs...</div>;
  if (runs.length === 0) return <div style={{ fontSize: 12, color: C.textDim, padding: 12 }}>No saved runs yet. Run an eval and save it.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {runs.map(r => (
        <div key={r.id} onClick={() => onSelectRun(r.id)}
          style={{
            padding: "10px 14px", borderRadius: 8, cursor: "pointer",
            background: activeRunId === r.id ? C.accentDim : C.bg,
            border: "1px solid " + (activeRunId === r.id ? C.accent : C.border),
            transition: "all 0.15s",
          }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: activeRunId === r.id ? C.accent : C.text, marginBottom: 4 }}>{r.name}</div>
            <button onClick={e => { e.stopPropagation(); onDeleteRun(r.id); }}
              style={{ background: "transparent", border: "none", color: C.textDim, fontSize: 14, cursor: "pointer", padding: "0 2px" }}>{"\u00d7"}</button>
          </div>
          <div style={{ fontSize: 10, color: C.textDim, fontFamily: "'JetBrains Mono'" }}>
            {new Date(r.timestamp).toLocaleDateString()} {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {" \u00b7 "}{r.sampleSize || r.total} convos
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
            {r.prompt1Label}: {r.s1?.actionable || 0} actionable {" \u00b7 "} {r.prompt2Label}: {r.s2?.actionable || 0} actionable
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Default Prompts ───────────────────────────────────────────

const DEFAULT_PROMPT_1 = `You are a classifier that determines whether a customer has a general legal question OR an actionable legal need.
**Definitions** 
General Legal Question: The customer is seeking information, explanation, or general guidance. They want to understand something about the law, their rights, or a legal concept. No attorney action is required beyond providing information.
Actionable Legal Need: The customer explicitly asks for a lawyer to do something on their behalf \u2014 like representation, document preparation, document review, legal filings, negotiation, or other concrete legal services.
**Classification Guidelines** 
Consider as an Actionable Legal Need if the customer:
- Asks for documents drafted, reviewed, or filed
- Is facing court proceedings, litigation, or formal disputes
- Requests representation or someone to act on their behalf
- Asks for contracts to be written, negotiated, or executed
Consider as a General Legal Question if the customer:
- Wants to understand their rights or options
- Is asking "what does X mean" or "is this legal"
- Is exploring whether they even have a case
- Wants general advice before deciding next steps
- Is asking hypothetical or informational questions
**Guidelines**
- Assess the conversation ONLY off of whether the user explicitly requests legal assistance or not \u2014 NOT off of the severity of the case. 
- Do NOT make assumptions. Classify as Actionable Legal Need ONLY if the user explicitly requests legal assistance from a lawyer. 
- You must state your reasoning behind your decision in 10 words or less. 
**Output Format**
- Output "Yes" if the customer has a General Legal Question (they would be well-served by general advice).
- Output "No" if the customer has an Actionable Legal Need (they need a lawyer to take action on their behalf).
Example Output Format:
json{
  "classification": "Yes" or "No"
  "reasoning": "<1-2 sentence explanation>"
}`;

const DEFAULT_PROMPT_2 = `You are a classifier that determines whether a customer has a general legal question OR an actionable legal need.

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

// ── Main App ──────────────────────────────────────────────────

export default function Page() {
  const [prompt1, setPrompt1] = useState(DEFAULT_PROMPT_1);
  const [prompt2, setPrompt2] = useState(DEFAULT_PROMPT_2);
  const [prompt1Label, setPrompt1Label] = useState("Balanced");
  const [prompt2Label, setPrompt2Label] = useState("Strict (Loosened)");
  const [csvData, setCsvData] = useState(null);
  const [sampleSize, setSampleSize] = useState(50);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0, phase: "" });
  const [results, setResults] = useState(null);
  const [detailFilter, setDetailFilter] = useState("all");
  const [chatItem, setChatItem] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef(false);

  // Run history
  const [savedRuns, setSavedRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [activeRunId, setActiveRunId] = useState(null);
  const [runName, setRunName] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [savingRun, setSavingRun] = useState(false);

  // Load saved runs on mount
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
        setResults({ evaluated: data.evaluated, s1: data.s1, s2: data.s2, total: data.total, disagreeCount: data.disagreeCount });
        setPrompt1(data.prompt1 || DEFAULT_PROMPT_1);
        setPrompt2(data.prompt2 || DEFAULT_PROMPT_2);
        setPrompt1Label(data.prompt1Label || "Balanced");
        setPrompt2Label(data.prompt2Label || "Strict");
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
        prompt1, prompt2, prompt1Label, prompt2Label,
        sampleSize,
        evaluated: results.evaluated,
        s1: results.s1, s2: results.s2,
        total: results.total, disagreeCount: results.disagreeCount,
      };
      const resp = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await resp.json();
      if (data.id) {
        setSavedRuns(prev => [{ id: data.id, name: runName.trim(), timestamp: payload.timestamp, sampleSize, prompt1Label, prompt2Label, s1: results.s1, s2: results.s2, total: results.total, disagreeCount: results.disagreeCount }, ...prev]);
        setActiveRunId(data.id);
        setRunName("");
      }
    } catch (e) { setErrorMsg("Failed to save run"); }
    setSavingRun(false);
  }, [results, runName, prompt1, prompt2, prompt1Label, prompt2Label, sampleSize]);

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
    reader.onload = (ev) => { setCsvData(parseCSV(ev.target.result)); setResults(null); setStatus("idle"); setErrorMsg(""); setActiveRunId(null); };
    reader.readAsText(file);
  }, []);

  const runEval = useCallback(async () => {
    if (!csvData) return;
    abortRef.current = false; setStatus("running"); setErrorMsg(""); setResults(null); setActiveRunId(null);
    const allRows = csvData.rows.filter(r => r.IsConverted === "Yes" || r.IsConverted === "No");
    const sample = sampleSize >= allRows.length ? [...allRows] : [...allRows].sort(() => Math.random() - 0.5).slice(0, sampleSize);
    const totalCalls = sample.length * 2;
    let callsDone = 0;
    setProgress({ done: 0, total: totalCalls, phase: "Running Prompt 1" });
    const evaluated = sample.map((row, i) => {
      const messages = stitchConversation(row);
      return { index: i, id: row.VAChat_SKEY || "row-" + i, messages, conversation: conversationToString(messages), isConverted: (row.IsConverted || "").trim(), expectedLabel: (row.IsConverted || "").trim() === "Yes" ? "GENERAL" : "ACTIONABLE", pkw: row.pkw || "", p1Predicted: null, p1Reasoning: null, p1Error: null, p2Predicted: null, p2Reasoning: null, p2Error: null };
    });
    for (let i = 0; i < evaluated.length; i++) {
      if (abortRef.current) break;
      try { const data = await callClassify(prompt1, evaluated[i].conversation); const raw = data.content?.[0]?.text || ""; const parsed = parseModelResponse(raw); evaluated[i].p1Predicted = parsed.classification; evaluated[i].p1Reasoning = parsed.reasoning; } catch (err) { evaluated[i].p1Error = err.message; }
      callsDone++; setProgress({ done: callsDone, total: totalCalls, phase: "Prompt 1: " + (i + 1) + "/" + evaluated.length });
      if (i < evaluated.length - 1) await new Promise(r => setTimeout(r, 300));
    }
    if (abortRef.current) { setStatus("idle"); return; }
    setProgress(p => ({ ...p, phase: "Running Prompt 2" }));
    for (let i = 0; i < evaluated.length; i++) {
      if (abortRef.current) break;
      try { const data = await callClassify(prompt2, evaluated[i].conversation); const raw = data.content?.[0]?.text || ""; const parsed = parseModelResponse(raw); evaluated[i].p2Predicted = parsed.classification; evaluated[i].p2Reasoning = parsed.reasoning; } catch (err) { evaluated[i].p2Error = err.message; }
      callsDone++; setProgress({ done: callsDone, total: totalCalls, phase: "Prompt 2: " + (i + 1) + "/" + evaluated.length });
      if (i < evaluated.length - 1) await new Promise(r => setTimeout(r, 300));
    }
    if (abortRef.current) { setStatus("idle"); return; }
    const computeStats = (key) => {
      let actionable = 0, general = 0, errors = 0, actionable_converted = 0, actionable_notConverted = 0, general_converted = 0, general_notConverted = 0, matchesExpected = 0;
      for (const r of evaluated) {
        const pred = r[key + "Predicted"]; if (r[key + "Error"] || !pred) { errors++; continue; }
        if (pred === "ACTIONABLE") { actionable++; if (r.isConverted === "Yes") actionable_converted++; else actionable_notConverted++; }
        else { general++; if (r.isConverted === "Yes") general_converted++; else general_notConverted++; }
        if (pred === r.expectedLabel) matchesExpected++;
      }
      const valid = evaluated.length - errors;
      return { actionable, general, errors, actionable_converted, actionable_notConverted, general_converted, general_notConverted, matchesExpected, valid };
    };
    setResults({ evaluated, s1: computeStats("p1"), s2: computeStats("p2"), total: evaluated.length, disagreeCount: evaluated.filter(r => r.p1Predicted && r.p2Predicted && r.p1Predicted !== r.p2Predicted).length });
    setStatus("done");
  }, [csvData, prompt1, prompt2, sampleSize]);

  const filteredRows = results?.evaluated?.filter(r => {
    if (detailFilter === "all") return true;
    if (detailFilter === "disagree") return r.p1Predicted && r.p2Predicted && r.p1Predicted !== r.p2Predicted;
    if (detailFilter === "both_actionable") return r.p1Predicted === "ACTIONABLE" && r.p2Predicted === "ACTIONABLE";
    if (detailFilter === "both_general") return r.p1Predicted === "GENERAL" && r.p2Predicted === "GENERAL";
    if (detailFilter === "converted") return r.isConverted === "Yes";
    if (detailFilter === "didnt_convert") return r.isConverted === "No";
    return true;
  }) || [];

  const exportCSV = useCallback(() => {
    if (!results) return;
    const header = ["ID", "IsConverted", "Expected", prompt1Label, prompt1Label + " Reasoning", prompt2Label, prompt2Label + " Reasoning", "Agree", "Conversation"];
    const rows = results.evaluated.map(r => [r.id, r.isConverted, r.expectedLabel, r.p1Predicted || "ERROR", '"' + (r.p1Reasoning || "").replace(/"/g, '""') + '"', r.p2Predicted || "ERROR", '"' + (r.p2Reasoning || "").replace(/"/g, '""') + '"', r.p1Predicted === r.p2Predicted ? "Yes" : "No", '"' + (r.conversation || "").slice(0, 500).replace(/"/g, '""') + '"']);
    const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "eval_results.csv"; a.click(); URL.revokeObjectURL(url);
  }, [results, prompt1Label, prompt2Label]);

  const s1 = results?.s1, s2 = results?.s2;
  const convertedCount = csvData?.rows?.filter(r => r.IsConverted === "Yes").length || 0;
  const notConvertedCount = csvData?.rows?.filter(r => r.IsConverted === "No").length || 0;

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: C.bg, color: C.text, minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <ChatModal item={chatItem} onClose={() => setChatItem(null)} promptLabels={[prompt1Label, prompt2Label]} />

      {/* Header */}
      <div style={{ borderBottom: "1px solid " + C.border, padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, fontFamily: "'JetBrains Mono'", color: C.accent, fontWeight: 600 }}>{"\u25b8"}</span>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>Segmentation Eval</h1>
          </div>
          <p style={{ margin: "3px 0 0 22px", fontSize: 12, color: C.textMuted }}>JustAnswer {"\u2194"} Fount routing {"\u00b7"} prompt comparison</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => setShowHistory(!showHistory)} style={{
            background: showHistory ? C.purpleDim : "transparent", color: showHistory ? C.purple : C.textDim,
            border: "1px solid " + (showHistory ? C.purple + "44" : C.border),
            borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Run History ({savedRuns.length})</button>
          {results && <button onClick={exportCSV} style={{ background: "transparent", color: C.cyan, border: "1px solid " + C.cyan + "44", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Export CSV</button>}
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: status === "running" ? C.accent : status === "done" ? C.green : C.textDim, background: status === "running" ? C.accentDim : status === "done" ? C.greenDim : "transparent", padding: "3px 10px", borderRadius: 4, border: "1px solid " + (status === "running" ? C.accent : status === "done" ? C.green : C.textDim) + "33" }}>{status === "running" ? "Running" : status === "done" ? "Complete" : "Idle"}</span>
        </div>
      </div>

      <div style={{ display: "flex" }}>
        {/* History sidebar */}
        {showHistory && (
          <div style={{ width: 280, minWidth: 280, borderRight: "1px solid " + C.border, padding: 16, overflowY: "auto", maxHeight: "calc(100vh - 70px)" }}>
            <Label>Saved Runs</Label>
            <RunHistory runs={savedRuns} activeRunId={activeRunId} onSelectRun={loadRun} onDeleteRun={deleteRun} loading={runsLoading} />
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, padding: "20px 28px", maxWidth: 1300 }}>

          {/* Prompts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
            {[[prompt1, setPrompt1, prompt1Label, setPrompt1Label, C.accent], [prompt2, setPrompt2, prompt2Label, setPrompt2Label, C.purple]].map(([p, setP, lbl, setLbl, clr], idx) => (
              <Card key={idx}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: clr }} />
                  <Label>Prompt {idx + 1}</Label>
                  <input value={lbl} onChange={e => setLbl(e.target.value)} style={{ background: C.bg, color: clr, border: "1px solid " + C.border, borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 600, width: 120, marginLeft: "auto" }} />
                </div>
                <textarea value={p} onChange={e => setP(e.target.value)} rows={5} style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: "1px solid " + C.border, borderRadius: 6, color: C.text, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", padding: 12, resize: "vertical", lineHeight: 1.5, outline: "none" }} onFocus={e => e.target.style.borderColor = clr} onBlur={e => e.target.style.borderColor = C.border} />
              </Card>
            ))}
          </div>

          {/* Upload + sample */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
            <Card>
              <Label>Conversation Log (CSV)</Label>
              <input type="file" accept=".csv" onChange={handleFile} style={{ fontSize: 12, color: C.text, marginBottom: 10 }} />
              {csvData && <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono'", lineHeight: 1.8 }}><span style={{ color: C.green }}>{"\u2713"} {csvData.rows.length} conversations loaded</span><br /><span style={{ color: C.textDim }}>Converted (JA): {convertedCount} {"\u00b7"} Didn't Convert: {notConvertedCount}</span></div>}
            </Card>
            <Card>
              <Label>Sample Size</Label>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>Start with a sample to test before running all conversations.</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {[25, 50, 100, 200].map(n => <button key={n} onClick={() => setSampleSize(n)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: sampleSize === n ? C.accentDim : C.bg, border: "1px solid " + (sampleSize === n ? C.accent : C.border), color: sampleSize === n ? C.accent : C.textDim }}>{n}</button>)}
                <button onClick={() => setSampleSize(csvData?.rows?.length || 0)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: sampleSize >= (csvData?.rows?.length || 999999) ? C.accentDim : C.bg, border: "1px solid " + (sampleSize >= (csvData?.rows?.length || 999999) ? C.accent : C.border), color: sampleSize >= (csvData?.rows?.length || 999999) ? C.accent : C.textDim }}>All</button>
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>~{Math.ceil(sampleSize * 2 * 0.4 / 60)} min estimated {"\u00b7"} {sampleSize * 2} API calls</div>
            </Card>
          </div>

          {/* Run + save */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={runEval} disabled={status === "running" || !csvData} style={{ background: status === "running" ? C.textDim : C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 28px", fontSize: 13, fontWeight: 600, cursor: status === "running" || !csvData ? "not-allowed" : "pointer", opacity: !csvData && status !== "running" ? 0.4 : 1 }}>
              {status === "running" ? progress.phase + " (" + progress.done + "/" + progress.total + ")" : "Run Both Prompts (" + sampleSize + " convos)"}
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

          {status === "running" && <div style={{ marginBottom: 24 }}><div style={{ background: C.surface, borderRadius: 6, height: 6, overflow: "hidden", border: "1px solid " + C.border }}><div style={{ width: (progress.total > 0 ? (progress.done / progress.total * 100) : 0) + "%", height: "100%", background: "linear-gradient(90deg, " + C.accent + ", " + C.purple + ")", borderRadius: 6, transition: "width 0.3s ease" }} /></div></div>}

          {/* Results */}
          {results && s1 && s2 && (<>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
              {[[s1, prompt1Label, C.accent], [s2, prompt2Label, C.purple]].map(([s, lbl, clr], idx) => (
                <Card key={idx}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: clr }} /><div style={{ fontSize: 13, fontWeight: 600 }}>{lbl}</div></div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    <MetricCard label='Said "No" (Actionable)' value={s.actionable} color={clr} sub={pct(s.actionable, s.valid) + " of total"} />
                    <MetricCard label='Said "Yes" (General)' value={s.general} color={C.textMuted} sub={pct(s.general, s.valid) + " of total"} />
                    <MetricCard label="Alignment" value={pct(s.matchesExpected, s.valid)} color={C.amber} sub={s.matchesExpected + " of " + s.valid + " match"} />
                  </div>
                  <Label>Conversion correlation</Label>
                  <CorrelationBar label={'Said "No" (Actionable)'} bounced={s.actionable_notConverted} converted={s.actionable_converted} total={s.actionable} color={clr} />
                  <div style={{ fontSize: 10, color: C.textDim, marginBottom: 12, marginTop: -8 }}>{s.actionable_notConverted} didn't convert (expected) {"\u00b7"} {s.actionable_converted} converted on JA (surprise)</div>
                  <CorrelationBar label={'Said "Yes" (General)'} bounced={s.general_notConverted} converted={s.general_converted} total={s.general} color={C.green} />
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: -8 }}>{s.general_converted} converted (expected) {"\u00b7"} {s.general_notConverted} didn't convert (surprise)</div>
                </Card>
              ))}
            </div>

            <Card style={{ marginBottom: 18, borderColor: C.purple + "44" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><span style={{ fontSize: 28, fontWeight: 700, color: C.purple, fontFamily: "'JetBrains Mono'" }}>{results.disagreeCount}</span><span style={{ fontSize: 13, color: C.textMuted, marginLeft: 10 }}>conversations where prompts disagree</span><span style={{ fontSize: 12, color: C.textDim, marginLeft: 6 }}>({pct(results.disagreeCount, results.total)})</span></div>
                <button onClick={() => setDetailFilter("disagree")} style={{ background: C.purpleDim, color: C.purple, border: "1px solid " + C.purple + "44", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>View Disagreements</button>
              </div>
            </Card>

            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <Label>Results ({filteredRows.length})</Label>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {[
                    { key: "all", label: "All", color: C.text },
                    { key: "disagree", label: "Disagree", color: C.purple },
                    { key: "both_actionable", label: 'Both "No"', color: C.accent },
                    { key: "both_general", label: 'Both "Yes"', color: C.green },
                    { key: "didnt_convert", label: "Didn't Convert", color: C.amber },
                    { key: "converted", label: "Converted", color: C.green },
                  ].map(f => (
                    <button key={f.key} onClick={() => setDetailFilter(f.key)} style={{ background: detailFilter === f.key ? f.color + "22" : "transparent", color: detailFilter === f.key ? f.color : C.textDim, border: "1px solid " + (detailFilter === f.key ? f.color + "44" : C.border), borderRadius: 5, padding: "3px 9px", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "'JetBrains Mono'" }}>{f.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ maxHeight: 500, overflowY: "auto", borderRadius: 6, border: "1px solid " + C.border }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ position: "sticky", top: 0, background: C.bg, zIndex: 1 }}>
                    {["#", prompt1Label, prompt2Label, "JA", "Agree?", "Conversation"].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid " + C.border, fontWeight: 600 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {filteredRows.slice(0, 200).map((r, i) => {
                      const agree = r.p1Predicted === r.p2Predicted;
                      return (<tr key={r.index} onClick={() => setChatItem(r)} style={{ borderBottom: "1px solid " + C.border, cursor: "pointer", background: i % 2 === 0 ? "transparent" : C.bg + "80" }} onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover} onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : C.bg + "80"}>
                        <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono'", color: C.textDim, fontSize: 11 }}>{r.index + 1}</td>
                        <td style={{ padding: "8px 10px" }}><Pill label={r.p1Predicted === "ACTIONABLE" ? "No" : "Yes"} color={r.p1Error ? C.red : r.p1Predicted === "ACTIONABLE" ? C.accent : C.green} bg={r.p1Error ? C.redDim : r.p1Predicted === "ACTIONABLE" ? C.accentDim : C.greenDim} /></td>
                        <td style={{ padding: "8px 10px" }}><Pill label={r.p2Predicted === "ACTIONABLE" ? "No" : "Yes"} color={r.p2Error ? C.red : r.p2Predicted === "ACTIONABLE" ? C.purple : C.green} bg={r.p2Error ? C.redDim : r.p2Predicted === "ACTIONABLE" ? C.purpleDim : C.greenDim} /></td>
                        <td style={{ padding: "8px 10px" }}><Pill label={r.isConverted === "Yes" ? "Conv." : "Didn't Conv."} color={r.isConverted === "Yes" ? C.green : C.amber} bg={r.isConverted === "Yes" ? C.greenDim : C.amberDim} /></td>
                        <td style={{ padding: "8px 10px", fontSize: 13 }}>{agree ? <span style={{ color: C.green }}>{"\u2713"}</span> : <span style={{ color: C.purple }}>{"\u2717"}</span>}</td>
                        <td style={{ padding: "8px 10px", color: C.textDim, fontSize: 11, fontFamily: "'IBM Plex Mono'", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.conversation?.slice(0, 150)}</td>
                      </tr>);
                    })}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > 200 && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, textAlign: "center" }}>Showing 200 of {filteredRows.length}</div>}
            </Card>
          </>)}

          {status === "idle" && !results && <div style={{ textAlign: "center", padding: "40px 20px", color: C.textDim }}><div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>{"\u25b8 \u25b8"}</div><div style={{ fontSize: 13, marginBottom: 4 }}>Upload your conversation log, pick a sample size, and run</div><div style={{ fontSize: 12 }}>Prompts output Yes (general) or No (actionable) {"\u00b7"} compared against IsConverted</div></div>}
        </div>
      </div>
    </div>
  );
}
