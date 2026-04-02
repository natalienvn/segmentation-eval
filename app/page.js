"use client";
import { useState, useRef, useCallback } from "react";

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

function pct(n, d) { return d === 0 ? "—" : (n / d * 100).toFixed(1) + "%"; }

function parseCSV(text) {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = [];
  let hdr = lines[0], cur = "", inQ = false;
  for (let i = 0; i < hdr.length; i++) {
    const ch = hdr[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { headers.push(cur.trim().replace(/^"|"$/g, "")); cur = ""; }
    else cur += ch;
  }
  headers.push(cur.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    const vals = []; let c = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { vals.push(c.trim().replace(/^"|"$/g, "")); c = ""; }
      else c += ch;
    }
    vals.push(c.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return row;
  });
  return { headers, rows };
}

function parseModelResponse(raw) {
  if (!raw) return { classification: null, reasoning: null };
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      const cls = (obj.classification || "").toUpperCase().trim();
      return {
        classification: cls.includes("ACTIONABLE") ? "ACTIONABLE" : "GENERAL",
        reasoning: obj.reasoning || null,
      };
    }
  } catch (e) {}
  const upper = raw.toUpperCase();
  return {
    classification: upper.includes("ACTIONABLE") ? "ACTIONABLE" : "GENERAL",
    reasoning: null,
  };
}

function parseConversationMessages(text) {
  if (!text) return [{ role: "user", text }];
  const lines = text.split("\n").filter(l => l.trim());
  const messages = [];
  let currentRole = null;
  let currentText = "";
  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    let detectedRole = null;
    let content = line;
    if (/^(user|customer|client|human)\s*[:|-]/i.test(lower)) {
      detectedRole = "user";
      content = line.replace(/^(user|customer|client|human)\s*[:|-]\s*/i, "");
    } else if (/^(bot|assistant|agent|ai|system|lawyer|expert)\s*[:|-]/i.test(lower)) {
      detectedRole = "bot";
      content = line.replace(/^(bot|assistant|agent|ai|system|lawyer|expert)\s*[:|-]\s*/i, "");
    }
    if (detectedRole) {
      if (currentRole && currentText.trim()) messages.push({ role: currentRole, text: currentText.trim() });
      currentRole = detectedRole;
      currentText = content;
    } else {
      if (!currentRole) currentRole = "user";
      currentText += "\n" + line;
    }
  }
  if (currentRole && currentText.trim()) messages.push({ role: currentRole, text: currentText.trim() });
  if (messages.length === 0) messages.push({ role: "user", text });
  return messages;
}

async function callClassify(prompt, conversation) {
  const resp = await fetch("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages: [{ role: "user", content: `${prompt}\n\n--- CONVERSATION ---\n${conversation}` }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `API error ${resp.status}`);
  }
  return resp.json();
}

// ── Small Components ──────────────────────────────────────────

function Label({ children }) {
  return <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 8 }}>{children}</div>;
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 5,
      padding: "6px 10px", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", minWidth: 160,
    }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Card({ children, style: sx }) {
  return <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, ...sx }}>{children}</div>;
}

function Pill({ label, color, bg }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: bg, color, border: `1px solid ${color}33`, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function MetricCard({ label, value, color, sub }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 18px", flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || C.text, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textDim, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function ConfusionCell({ value, total, label, bgColor, textColor }) {
  return (
    <div style={{
      background: bgColor, borderRadius: 8, padding: 12, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", minHeight: 70, border: `1px solid ${textColor}22`,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: textColor, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 9, color: textColor, opacity: 0.7, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 10, color: textColor, opacity: 0.5, marginTop: 1 }}>{pct(value, total)}</div>
    </div>
  );
}

function ConfusionMatrix({ m, total, label }) {
  const valid = total - (m.errors || 0);
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gridTemplateRows: "auto 1fr 1fr", gap: 6, maxWidth: 340 }}>
        <div />
        <div style={{ textAlign: "center", fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", padding: "6px 0" }}>Converted</div>
        <div style={{ textAlign: "center", fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", padding: "6px 0" }}>Didn&apos;t</div>
        <div style={{ writingMode: "vertical-lr", transform: "rotate(180deg)", fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>Actionable</div>
        <ConfusionCell value={m.tp} total={valid} label="TP" bgColor={C.greenDim} textColor={C.green} />
        <ConfusionCell value={m.fp} total={valid} label="FP" bgColor={C.redDim} textColor={C.red} />
        <div style={{ writingMode: "vertical-lr", transform: "rotate(180deg)", fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>General</div>
        <ConfusionCell value={m.fn} total={valid} label="FN" bgColor={C.amberDim} textColor={C.amber} />
        <ConfusionCell value={m.tn} total={valid} label="TN" bgColor="#0f172a" textColor={C.accent} />
      </div>
    </div>
  );
}

// ── Chat Viewer Modal ─────────────────────────────────────────

function ChatModal({ item, onClose, promptLabels }) {
  if (!item) return null;
  const messages = parseConversationMessages(item.conversation);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14,
        width: "100%", maxWidth: 700, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "start", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Conversation #{item.index + 1}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, color: C.textMuted }}>Ground Truth:</div>
              <Pill label={item.groundTruth} color={item.groundTruth === "ACTIONABLE" ? C.green : C.textDim} bg={item.groundTruth === "ACTIONABLE" ? C.greenDim : C.surface} />
              <div style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>{promptLabels[0]}:</div>
              <Pill label={item.p1Predicted || "—"} color={item.p1Predicted === "ACTIONABLE" ? C.accent : C.textDim} bg={item.p1Predicted === "ACTIONABLE" ? C.accentDim : C.surface} />
              <div style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>{promptLabels[1]}:</div>
              <Pill label={item.p2Predicted || "—"} color={item.p2Predicted === "ACTIONABLE" ? C.purple : C.textDim} bg={item.p2Predicted === "ACTIONABLE" ? C.purpleDim : C.surface} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.textMuted, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>×</button>
        </div>
        {(item.p1Reasoning || item.p2Reasoning) && (
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 16, flexShrink: 0 }}>
            {item.p1Reasoning && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: C.accent, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 600 }}>{promptLabels[0]} reasoning</div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, fontStyle: "italic" }}>{item.p1Reasoning}</div>
              </div>
            )}
            {item.p2Reasoning && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: C.purple, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 600 }}>{promptLabels[1]} reasoning</div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, fontStyle: "italic" }}>{item.p2Reasoning}</div>
              </div>
            )}
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "80%", padding: "10px 14px", borderRadius: 12,
                  background: msg.role === "user" ? C.accentDim : C.surface,
                  border: `1px solid ${msg.role === "user" ? C.accent + "33" : C.border}`,
                  borderBottomRightRadius: msg.role === "user" ? 4 : 12,
                  borderBottomLeftRadius: msg.role === "user" ? 12 : 4,
                }}>
                  <div style={{ fontSize: 10, color: msg.role === "user" ? C.accent : C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 600 }}>
                    {msg.role === "user" ? "Customer" : "Bot"}
                  </div>
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

// ── Main App ──────────────────────────────────────────────────

export default function Page() {
  const [prompt1, setPrompt1] = useState(`You are a classifier that determines whether a customer has a general legal question OR an actionable legal need.
**Definitions** 
General Legal Question: The customer is seeking information, explanation, or general guidance. They want to understand something about the law, their rights, or a legal concept. No attorney action is required beyond providing information.
Actionable Legal Need: The customer explicitly asks for a lawyer to do something on their behalf — like representation, document preparation, document review, legal filings, negotiation, or other concrete legal services.
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
- Assess the conversation ONLY off of whether the user explicitly requests legal assistance or not — NOT off of the severity of the case. 
- Do NOT make assumptions. Classify as Actionable Legal Need ONLY if the user explicitly requests legal assistance from a lawyer. 
- You must state your reasoning behind your decision in 10 words or less. 
Example Output Format:
json{
  "classification": "<classification>" 
  "reasoning": "<1-2 sentence explanation>"
}`);

  const [prompt2, setPrompt2] = useState(`You are a classifier that determines whether a customer has a general legal question OR an actionable legal need. 
** RULES ** 
ASSUME that the inquiry is a general legal question UNLESS the user EXPLICITLY requests a lawyer in their inquiry for actionable help. 
ONLY classify as an Actionable Legal Need IF the user:
- explicitly asks for documents drafted, reviewed, or filed
- explicitly asks for representation from a lawyer
- explicitly asks for contracts to be written, negotiated, or executed
IF none of the above parameters fit the inquiry, you MUST classify the inquiry as a General Legal Question. 
The following are NOT actionable legal needs: 
- Wanting to speak to a lawyer
- Asking a lawyer for help 
- Has a severe, seemingly urgent inquiry. 
** GUIDELINES **
- Assess the conversation ONLY off of whether the user explicitly requests legal assistance or not — NOT off of the severity of the case. 
- Wanting to speak to a lawyer or providing contact information is NOT an actionable need. 
- Do NOT make assumptions. Classify as Actionable Legal Need ONLY if the user explicitly requests legal assistance from a lawyer. 
- You must state your reasoning behind your decision in 10 words or less. 
** Example Output Format ** 
json{
  "classification": "<classification>" 
  "reasoning": "<1-2 sentence explanation>"
}`);

  const [prompt1Label, setPrompt1Label] = useState("Balanced");
  const [prompt2Label, setPrompt2Label] = useState("Strict");

  const [convFile, setConvFile] = useState(null);
  const [convTextCol, setConvTextCol] = useState("");
  const [convKeyCol, setConvKeyCol] = useState("");

  const [truthFile, setTruthFile] = useState(null);
  const [truthOutcomeCol, setTruthOutcomeCol] = useState("");
  const [truthKeyCol, setTruthKeyCol] = useState("");
  const [truthActionableVal, setTruthActionableVal] = useState("");

  const [joinMode, setJoinMode] = useState("key");
  const [joinPreview, setJoinPreview] = useState(null);

  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0, phase: "" });
  const [results, setResults] = useState(null);
  const [detailFilter, setDetailFilter] = useState("all");
  const [chatItem, setChatItem] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef(false);

  const handleConvFile = useCallback((e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      setConvFile(parsed); setConvTextCol(parsed.headers[0] || ""); setConvKeyCol("");
      setResults(null); setJoinPreview(null); setStatus("idle");
    };
    reader.readAsText(file);
  }, []);

  const handleTruthFile = useCallback((e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      setTruthFile(parsed); setTruthOutcomeCol(parsed.headers[0] || ""); setTruthKeyCol("");
      setResults(null); setJoinPreview(null); setStatus("idle");
    };
    reader.readAsText(file);
  }, []);

  const buildJoinedData = useCallback(() => {
    if (!convFile || !truthFile) return null;
    let joined = [];
    if (joinMode === "row") {
      const len = Math.min(convFile.rows.length, truthFile.rows.length);
      for (let i = 0; i < len; i++) {
        const conv = convFile.rows[i][convTextCol] || "";
        const raw = (truthFile.rows[i][truthOutcomeCol] || "").trim().toLowerCase();
        const gt = raw === truthActionableVal.trim().toLowerCase() ? "ACTIONABLE" : "GENERAL";
        joined.push({ index: i, conversation: conv, groundTruth: gt, rowKey: `row-${i + 1}` });
      }
    } else {
      const truthMap = {};
      for (const row of truthFile.rows) {
        const key = (row[truthKeyCol] || "").trim().toLowerCase();
        if (key) truthMap[key] = row;
      }
      let idx = 0;
      for (const row of convFile.rows) {
        const key = (row[convKeyCol] || "").trim().toLowerCase();
        const match = truthMap[key];
        if (match) {
          const raw = (match[truthOutcomeCol] || "").trim().toLowerCase();
          const gt = raw === truthActionableVal.trim().toLowerCase() ? "ACTIONABLE" : "GENERAL";
          joined.push({ index: idx, conversation: row[convTextCol] || "", groundTruth: gt, rowKey: row[convKeyCol] || "" });
        }
        idx++;
      }
    }
    return joined;
  }, [convFile, truthFile, joinMode, convTextCol, convKeyCol, truthKeyCol, truthOutcomeCol, truthActionableVal]);

  const previewJoin = useCallback(() => {
    const data = buildJoinedData();
    if (!data) return;
    setJoinPreview({
      total: data.length,
      actionable: data.filter(d => d.groundTruth === "ACTIONABLE").length,
      general: data.filter(d => d.groundTruth === "GENERAL").length,
      unmatchedConv: joinMode === "key" ? convFile.rows.length - data.length : 0,
    });
    setErrorMsg("");
  }, [buildJoinedData, joinMode, convFile]);

  const runEval = useCallback(async () => {
    const joined = buildJoinedData();
    if (!joined || joined.length === 0) { setErrorMsg("No matched rows."); return; }
    abortRef.current = false;
    setStatus("running"); setErrorMsg(""); setResults(null);
    const totalCalls = joined.length * 2;
    let callsDone = 0;
    setProgress({ done: 0, total: totalCalls, phase: "Running Prompt 1" });

    const evaluated = joined.map(j => ({
      ...j,
      p1Predicted: null, p1Reasoning: null, p1Raw: null, p1Error: null,
      p2Predicted: null, p2Reasoning: null, p2Raw: null, p2Error: null,
    }));

    for (let i = 0; i < evaluated.length; i++) {
      if (abortRef.current) break;
      try {
        const data = await callClassify(prompt1, evaluated[i].conversation);
        const raw = data.content?.[0]?.text || "";
        const parsed = parseModelResponse(raw);
        evaluated[i].p1Predicted = parsed.classification;
        evaluated[i].p1Reasoning = parsed.reasoning;
        evaluated[i].p1Raw = raw;
      } catch (err) {
        evaluated[i].p1Error = err.message;
      }
      callsDone++;
      setProgress({ done: callsDone, total: totalCalls, phase: `Prompt 1: ${i + 1}/${evaluated.length}` });
      if (i < evaluated.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    if (abortRef.current) { setStatus("idle"); return; }
    setProgress(p => ({ ...p, phase: "Running Prompt 2" }));

    for (let i = 0; i < evaluated.length; i++) {
      if (abortRef.current) break;
      try {
        const data = await callClassify(prompt2, evaluated[i].conversation);
        const raw = data.content?.[0]?.text || "";
        const parsed = parseModelResponse(raw);
        evaluated[i].p2Predicted = parsed.classification;
        evaluated[i].p2Reasoning = parsed.reasoning;
        evaluated[i].p2Raw = raw;
      } catch (err) {
        evaluated[i].p2Error = err.message;
      }
      callsDone++;
      setProgress({ done: callsDone, total: totalCalls, phase: `Prompt 2: ${i + 1}/${evaluated.length}` });
      if (i < evaluated.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    if (abortRef.current) { setStatus("idle"); return; }

    const computeMatrix = (key) => {
      let tp = 0, fp = 0, fn = 0, tn = 0, errors = 0;
      for (const r of evaluated) {
        const pred = r[`${key}Predicted`];
        const err = r[`${key}Error`];
        if (err || !pred) { errors++; continue; }
        if (pred === "ACTIONABLE" && r.groundTruth === "ACTIONABLE") tp++;
        else if (pred === "ACTIONABLE" && r.groundTruth === "GENERAL") fp++;
        else if (pred === "GENERAL" && r.groundTruth === "ACTIONABLE") fn++;
        else tn++;
      }
      return { tp, fp, fn, tn, errors };
    };

    const m1 = computeMatrix("p1");
    const m2 = computeMatrix("p2");
    const disagreeCount = evaluated.filter(r => r.p1Predicted && r.p2Predicted && r.p1Predicted !== r.p2Predicted).length;

    setResults({ evaluated, m1, m2, total: evaluated.length, disagreeCount });
    setStatus("done");
  }, [buildJoinedData, prompt1, prompt2]);

  const canRun = convFile && truthFile && convTextCol && truthOutcomeCol && truthActionableVal &&
    (joinMode === "row" || (convKeyCol && truthKeyCol));

  const filteredRows = results?.evaluated?.filter(r => {
    if (detailFilter === "all") return true;
    if (detailFilter === "disagree") return r.p1Predicted && r.p2Predicted && r.p1Predicted !== r.p2Predicted;
    if (detailFilter === "agree_right") return r.p1Predicted === r.p2Predicted && r.p1Predicted === r.groundTruth;
    if (detailFilter === "agree_wrong") return r.p1Predicted === r.p2Predicted && r.p1Predicted !== r.groundTruth && r.p1Predicted && r.p2Predicted;
    if (detailFilter === "p1_fn") return r.p1Predicted === "GENERAL" && r.groundTruth === "ACTIONABLE";
    if (detailFilter === "p2_fn") return r.p2Predicted === "GENERAL" && r.groundTruth === "ACTIONABLE";
    return true;
  }) || [];

  const exportCSV = useCallback(() => {
    if (!results) return;
    const header = ["Index", "Ground Truth", `${prompt1Label} Predicted`, `${prompt1Label} Reasoning`, `${prompt2Label} Predicted`, `${prompt2Label} Reasoning`, "Prompts Agree", "Conversation Preview"];
    const rows = results.evaluated.map(r => [
      r.index + 1, r.groundTruth, r.p1Predicted || "ERROR", `"${(r.p1Reasoning || "").replace(/"/g, '""')}"`, r.p2Predicted || "ERROR", `"${(r.p2Reasoning || "").replace(/"/g, '""')}"`,
      r.p1Predicted === r.p2Predicted ? "Yes" : "No",
      `"${(r.conversation || "").slice(0, 300).replace(/"/g, '""')}"`,
    ]);
    const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "eval_results.csv"; a.click();
    URL.revokeObjectURL(url);
  }, [results, prompt1Label, prompt2Label]);

  const m1 = results?.m1;
  const m2 = results?.m2;

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: C.bg, color: C.text, minHeight: "100vh" }}>
      <ChatModal item={chatItem} onClose={() => setChatItem(null)} promptLabels={[prompt1Label, prompt2Label]} />

      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, fontFamily: "'JetBrains Mono'", color: C.accent, fontWeight: 600 }}>▸</span>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>Segmentation Eval</h1>
          </div>
          <p style={{ margin: "3px 0 0 22px", fontSize: 12, color: C.textMuted }}>Side-by-side prompt comparison · JustAnswer ↔ Fount</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {results && (
            <button onClick={exportCSV} style={{
              background: "transparent", color: C.cyan, border: `1px solid ${C.cyan}44`,
              borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>Export CSV</button>
          )}
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
            color: status === "running" ? C.accent : status === "done" ? C.green : C.textDim,
            background: status === "running" ? C.accentDim : status === "done" ? C.greenDim : "transparent",
            padding: "3px 10px", borderRadius: 4,
            border: `1px solid ${(status === "running" ? C.accent : status === "done" ? C.green : C.textDim) + "33"}`,
          }}>{status === "running" ? "Running" : status === "done" ? "Complete" : "Idle"}</span>
        </div>
      </div>

      <div style={{ padding: "20px 28px", maxWidth: 1300, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
          {[[prompt1, setPrompt1, prompt1Label, setPrompt1Label, C.accent], [prompt2, setPrompt2, prompt2Label, setPrompt2Label, C.purple]].map(([p, setP, lbl, setLbl, clr], idx) => (
            <Card key={idx}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: clr }} />
                <Label>Prompt {idx + 1}</Label>
                <input value={lbl} onChange={e => setLbl(e.target.value)} style={{
                  background: C.bg, color: clr, border: `1px solid ${C.border}`, borderRadius: 4,
                  padding: "2px 8px", fontSize: 12, fontWeight: 600, width: 100, marginLeft: "auto",
                }} />
              </div>
              <textarea value={p} onChange={e => setP(e.target.value)} rows={5} style={{
                width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 6, color: C.text, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
                padding: 12, resize: "vertical", lineHeight: 1.5, outline: "none",
              }} onFocus={e => e.target.style.borderColor = clr} onBlur={e => e.target.style.borderColor = C.border} />
            </Card>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
          <Card>
            <Label>Conversations CSV</Label>
            <input type="file" accept=".csv" onChange={handleConvFile} style={{ fontSize: 12, color: C.text, marginBottom: 8 }} />
            {convFile && (
              <>
                <div style={{ fontSize: 11, color: C.green, fontFamily: "'JetBrains Mono'", marginBottom: 10 }}>✓ {convFile.rows.length} rows</div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.textDim, marginRight: 6 }}>Text col:</span>
                  <Select value={convTextCol} onChange={setConvTextCol} options={convFile.headers} />
                </div>
                {joinMode === "key" && (
                  <div>
                    <span style={{ fontSize: 11, color: C.textDim, marginRight: 6 }}>Key col:</span>
                    <Select value={convKeyCol} onChange={setConvKeyCol} options={convFile.headers} placeholder="Select..." />
                  </div>
                )}
              </>
            )}
          </Card>
          <Card>
            <Label>Ground Truth CSV</Label>
            <input type="file" accept=".csv" onChange={handleTruthFile} style={{ fontSize: 12, color: C.text, marginBottom: 8 }} />
            {truthFile && (
              <>
                <div style={{ fontSize: 11, color: C.green, fontFamily: "'JetBrains Mono'", marginBottom: 10 }}>✓ {truthFile.rows.length} rows</div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.textDim, marginRight: 6 }}>Outcome col:</span>
                  <Select value={truthOutcomeCol} onChange={setTruthOutcomeCol} options={truthFile.headers} />
                </div>
                {joinMode === "key" && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: C.textDim, marginRight: 6 }}>Key col:</span>
                    <Select value={truthKeyCol} onChange={setTruthKeyCol} options={truthFile.headers} placeholder="Select..." />
                  </div>
                )}
                <div>
                  <span style={{ fontSize: 11, color: C.textDim, marginRight: 6 }}>Converted =</span>
                  <input type="text" placeholder={"\"yes\", \"1\""} value={truthActionableVal} onChange={e => setTruthActionableVal(e.target.value)}
                    style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 8px", fontSize: 12, width: 140 }} />
                </div>
              </>
            )}
          </Card>
        </div>

        {convFile && truthFile && (
          <Card style={{ marginBottom: 18 }}>
            <Label>Match rows between files</Label>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              {[
                { key: "key", label: "Join by shared ID" },
                { key: "row", label: "Match by row order" },
              ].map(opt => (
                <button key={opt.key} onClick={() => { setJoinMode(opt.key); setJoinPreview(null); }}
                  style={{
                    padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600,
                    background: joinMode === opt.key ? C.accentDim : C.bg,
                    border: `1px solid ${joinMode === opt.key ? C.accent : C.border}`, color: C.text,
                  }}>{opt.label}</button>
              ))}
              <button onClick={previewJoin} disabled={!canRun}
                style={{
                  background: "transparent", color: C.cyan, border: `1px solid ${C.cyan}44`, marginLeft: "auto",
                  borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 600,
                  cursor: canRun ? "pointer" : "not-allowed", opacity: canRun ? 1 : 0.4,
                }}>Preview</button>
            </div>
            {joinPreview && (
              <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "'JetBrains Mono'" }}>
                <span style={{ color: C.green }}>{joinPreview.total} matched</span>
                {" · "}<span style={{ color: C.accent }}>{joinPreview.actionable} actionable</span>
                {" · "}<span>{joinPreview.general} general</span>
                {joinPreview.unmatchedConv > 0 && <span style={{ color: C.amber }}>{" · "}{joinPreview.unmatchedConv} unmatched</span>}
              </div>
            )}
          </Card>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
          <button onClick={runEval} disabled={status === "running" || !canRun}
            style={{
              background: status === "running" ? C.textDim : C.accent, color: "#fff", border: "none",
              borderRadius: 8, padding: "10px 28px", fontSize: 13, fontWeight: 600,
              cursor: status === "running" || !canRun ? "not-allowed" : "pointer",
              opacity: !canRun && status !== "running" ? 0.4 : 1,
            }}>
            {status === "running" ? `${progress.phase} (${progress.done}/${progress.total})` : "Run Both Prompts"}
          </button>
          {status === "running" && (
            <button onClick={() => { abortRef.current = true; }} style={{
              background: C.redDim, color: C.red, border: `1px solid ${C.red}44`,
              borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>Stop</button>
          )}
          {errorMsg && <span style={{ fontSize: 12, color: C.red }}>{errorMsg}</span>}
        </div>

        {status === "running" && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ background: C.surface, borderRadius: 6, height: 6, overflow: "hidden", border: `1px solid ${C.border}` }}>
              <div style={{
                width: `${progress.total > 0 ? (progress.done / progress.total * 100) : 0}%`,
                height: "100%", background: `linear-gradient(90deg, ${C.accent}, ${C.purple})`,
                borderRadius: 6, transition: "width 0.3s ease",
              }} />
            </div>
          </div>
        )}

        {results && m1 && m2 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
              {[[m1, prompt1Label, C.accent], [m2, prompt2Label, C.purple]].map(([m, lbl, clr], idx) => {
                const valid = results.total - m.errors;
                return (
                  <Card key={idx}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: clr }} />
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{lbl}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                      <MetricCard label="Accuracy" value={pct(m.tp + m.tn, valid)} color={clr} />
                      <MetricCard label="Precision" value={pct(m.tp, m.tp + m.fp)} color={C.green} />
                      <MetricCard label="Recall" value={pct(m.tp, m.tp + m.fn)} color={C.cyan} />
                    </div>
                    <ConfusionMatrix m={m} total={results.total} label="Confusion Matrix" />
                    <div style={{ marginTop: 14, padding: 12, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, lineHeight: 1.6 }}>
                      <span style={{ color: C.red, fontWeight: 600 }}>Missed leads: </span>
                      <span>{m.fn} ({pct(m.fn, m.fn + m.tp)})</span>
                      <span style={{ color: C.textDim }}> · </span>
                      <span style={{ color: C.amber, fontWeight: 600 }}>Wasted routing: </span>
                      <span>{m.fp} ({pct(m.fp, m.fp + m.tn)})</span>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Card style={{ marginBottom: 18, borderColor: C.purple + "44" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontSize: 28, fontWeight: 700, color: C.purple, fontFamily: "'JetBrains Mono'" }}>{results.disagreeCount}</span>
                  <span style={{ fontSize: 13, color: C.textMuted, marginLeft: 10 }}>conversations where prompts disagree</span>
                  <span style={{ fontSize: 12, color: C.textDim, marginLeft: 6 }}>({pct(results.disagreeCount, results.total)} of total)</span>
                </div>
                <button onClick={() => setDetailFilter("disagree")} style={{
                  background: C.purpleDim, color: C.purple, border: `1px solid ${C.purple}44`,
                  borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>View Disagreements</button>
              </div>
            </Card>

            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <Label>Results ({filteredRows.length})</Label>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {[
                    { key: "all", label: "All", color: C.text },
                    { key: "disagree", label: "Disagree", color: C.purple },
                    { key: "agree_right", label: "Both Right", color: C.green },
                    { key: "agree_wrong", label: "Both Wrong", color: C.red },
                    { key: "p1_fn", label: `${prompt1Label} Missed`, color: C.accent },
                    { key: "p2_fn", label: `${prompt2Label} Missed`, color: C.purple },
                  ].map(f => (
                    <button key={f.key} onClick={() => setDetailFilter(f.key)} style={{
                      background: detailFilter === f.key ? f.color + "22" : "transparent",
                      color: detailFilter === f.key ? f.color : C.textDim,
                      border: `1px solid ${detailFilter === f.key ? f.color + "44" : C.border}`,
                      borderRadius: 5, padding: "3px 9px", fontSize: 10, fontWeight: 600, cursor: "pointer",
                      fontFamily: "'JetBrains Mono'",
                    }}>{f.label}</button>
                  ))}
                </div>
              </div>

              <div style={{ maxHeight: 500, overflowY: "auto", borderRadius: 6, border: `1px solid ${C.border}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ position: "sticky", top: 0, background: C.bg, zIndex: 1 }}>
                      {["#", prompt1Label, prompt2Label, "Actual", "Agree?", "Conversation"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, 200).map((r, i) => {
                      const agree = r.p1Predicted === r.p2Predicted;
                      return (
                        <tr key={r.index} onClick={() => setChatItem(r)}
                          style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: i % 2 === 0 ? "transparent" : C.bg + "80" }}
                          onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : C.bg + "80"}>
                          <td style={{ padding: "8px 10px", fontFamily: "'JetBrains Mono'", color: C.textDim, fontSize: 11 }}>{r.index + 1}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <Pill label={r.p1Predicted || "ERR"} color={r.p1Error ? C.red : r.p1Predicted === "ACTIONABLE" ? C.accent : C.textDim} bg={r.p1Error ? C.redDim : r.p1Predicted === "ACTIONABLE" ? C.accentDim : C.bg} />
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <Pill label={r.p2Predicted || "ERR"} color={r.p2Error ? C.red : r.p2Predicted === "ACTIONABLE" ? C.purple : C.textDim} bg={r.p2Error ? C.redDim : r.p2Predicted === "ACTIONABLE" ? C.purpleDim : C.bg} />
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <Pill label={r.groundTruth} color={r.groundTruth === "ACTIONABLE" ? C.green : C.textDim} bg={r.groundTruth === "ACTIONABLE" ? C.greenDim : C.bg} />
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 13 }}>
                            {agree ? <span style={{ color: C.green }}>✓</span> : <span style={{ color: C.purple }}>✗</span>}
                          </td>
                          <td style={{ padding: "8px 10px", color: C.textDim, fontSize: 11, fontFamily: "'IBM Plex Mono'", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.conversation?.slice(0, 150)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > 200 && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, textAlign: "center" }}>Showing 200 of {filteredRows.length}</div>}
            </Card>
          </>
        )}

        {status === "idle" && !results && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.textDim }}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>▸ ▸</div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Two prompts · Two files · One comparison</div>
            <div style={{ fontSize: 12 }}>Upload your conversations + conversion data, then run both prompts side by side</div>
          </div>
        )}
      </div>
    </div>
  );
}
