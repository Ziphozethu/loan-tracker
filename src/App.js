import React, { useState, useEffect, useCallback, useRef } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";

// ── Environment Variables ─────────────────────────────────────────────────────
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("⚠️ Missing Supabase env vars. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_KEY in .env.local");
}

const ADMIN_PIN = process.env.REACT_APP_ADMIN_PIN || "1234";
const VIEWER_PASSWORD = process.env.REACT_APP_VIEWER_PASSWORD || "Zesuliwe";

// ── Supabase REST helper ──────────────────────────────────────────────────────
async function sb(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  if (method === "DELETE" || method === "PATCH") return true;
  const t = await res.text();
  return t ? JSON.parse(t) : [];
}

// ── Local Storage helpers ─────────────────────────────────────────────────────
const ls = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const getSettings = () => ls.get("lt_settings", { rate: 30, type: "compound" });
const saveSettings = (s) => ls.set("lt_settings", s);
const getBalance = () => ls.get("lt_balance", 0);
const saveBalance = (b) => ls.set("lt_balance", b);

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n).toLocaleString("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

const formatPhoneZA = (phone) => {
  const d = phone.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("27") && d.length >= 11) return `+27 ${d.slice(2,5)} ${d.slice(5,8)} ${d.slice(8)}`;
  if (d.length === 10 && d.startsWith("0")) { const n = d.slice(1); return `+27 ${n.slice(0,3)} ${n.slice(3,6)} ${n.slice(6)}`; }
  return phone;
};

const monthsBetween = (from, to) => {
  const a = new Date(from), b = new Date(to);
  return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
};

const getPrincipal = (amount, rate) => amount / (1 + rate / 100);

const calcInterest = (principal, rate, months, type) => {
  if (months <= 0) return 0;
  if (type === "simple") return principal * (rate / 100) * months;
  return principal * (Math.pow(1 + rate / 100, months) - 1);
};

const daysLeft = (due) => Math.ceil((new Date(due) - new Date()) / 86400000);

const statusLabel = (loan) => {
  if (loan.status === "paid") return { text: "Paid", color: "#16a34a" };
  const d = daysLeft(loan.due_date);
  if (d < 0) return { text: `Overdue ${Math.abs(d)}d`, color: "#dc2626" };
  if (d === 0) return { text: "Due Today", color: "#ea580c" };
  if (d <= 7) return { text: `Due in ${d}d`, color: "#d97706" };
  return { text: `${d}d left`, color: "#2563eb" };
};

function buildWhatsAppMessage(loan) {
  const due = new Date(loan.due_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  return `Dear ${loan.borrower_name},\n\nThis is a formal reminder regarding your outstanding loan of ${fmt(loan.amount)}.\n\nDue Date: ${due}\n${loan.notes ? `Reference: ${loan.notes}\n\n` : "\n"}Kindly ensure payment is made on or before the due date to avoid any penalties.\n\nThank you for your prompt attention to this matter.`;
}

// ── Charts ────────────────────────────────────────────────────────────────────
function PieChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ textAlign: "center", color: "#7a746c", padding: 20, fontSize: 13 }}>No data yet</div>;
  let cum = 0;
  const r = 60, cx = 80, cy = 80;
  const slices = data.map((d) => {
    const pct = d.value / total;
    const s = cum; cum += pct;
    const a1 = s * 2 * Math.PI - Math.PI / 2;
    const a2 = cum * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const lg = pct > 0.5 ? 1 : 0;
    const path = pct === 1
      ? `M ${cx} ${cy} m -${r} 0 a ${r} ${r} 0 1 0 ${r*2} 0 a ${r} ${r} 0 1 0 -${r*2} 0`
      : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${lg} 1 ${x2} ${y2} Z`;
    return { ...d, path, pct };
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <svg width={160} height={160} viewBox="0 0 160 160">
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth={2} />)}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12 }}>{s.label}: <strong>{s.value}</strong> ({Math.round(s.pct * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data }) {
  if (!data.length) return <div style={{ textAlign: "center", color: "#7a746c", padding: 20, fontSize: 13 }}>No data yet</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110, padding: "0 4px" }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 9, color: "#7a746c" }}>{d.value > 0 ? fmt(d.value).replace("R\u00a0","R").slice(0,6) : ""}</span>
          <div style={{ width: "100%", background: "#1a3a2a", borderRadius: "4px 4px 0 0", height: `${(d.value / max) * 72}px`, minHeight: d.value > 0 ? 4 : 0 }} />
          <span style={{ fontSize: 9, color: "#7a746c", whiteSpace: "nowrap" }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #f5f3ef; --surface: #fff; --border: #e2ddd6; --text: #1a1714; --muted: #7a746c;
    --accent: #1a3a2a; --accent-light: #e8f0eb; --danger: #7f1d1d; --danger-light: #fef2f2;
    --gold: #92722a; --blue: #1d4ed8; --radius: 12px;
    --shadow: 0 2px 12px rgba(0,0,0,0.07); --shadow-lg: 0 8px 32px rgba(0,0,0,0.12);
  }
  html { -webkit-text-size-adjust: 100%; }
  body { background: var(--bg); font-family: 'DM Sans', sans-serif; color: var(--text); min-height: 100vh; overflow-x: hidden; }
  .app { width: 100%; max-width: 1200px; margin: 0 auto; padding: 16px 12px 80px; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border); gap: 12px; flex-wrap: wrap; }
  .header-left h1 { font-family: 'Playfair Display', serif; font-size: 22px; color: var(--accent); }
  .header-left p { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .header-right { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .role-badge { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; background: var(--accent-light); color: var(--accent); }
  .badge-red { background: #fef2f2; color: #7f1d1d; }
  .tabs { display: flex; gap: 2px; margin-bottom: 20px; border-bottom: 2px solid var(--border); flex-wrap: wrap; }
  .tab { padding: 10px 16px; font-size: 13px; font-weight: 500; color: var(--muted); cursor: pointer; border: none; background: none; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s; white-space: nowrap; font-family: 'DM Sans', sans-serif; position: relative; }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
  .tab-badge { position: absolute; top: -8px; right: 8px; background: #dc2626; color: #fff; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; }
  .btn { display: inline-flex; align-items: center; gap: 6px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: #0f2418; }
  .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  .btn-ghost:hover { background: var(--border); color: var(--text); }
  .btn-danger { background: var(--danger-light); color: var(--danger); border: 1px solid #fecaca; }
  .btn-danger:hover { background: #fee2e2; }
  .btn-warning { background: #fff7ed; color: #92400e; border: 1px solid #fed7aa; }
  .btn-sm { padding: 6px 10px; font-size: 12px; }
  .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; position: relative; }
  .stat-card .label { font-size: 10px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
  .stat-card .value { font-family: 'Playfair Display', serif; font-size: 20px; }
  .stat-card .sub { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .fin-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .filter-btn { font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; transition: all 0.15s; }
  .filter-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .search-input { flex: 1; min-width: 140px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 13px; background: var(--surface); color: var(--text); outline: none; }
  .search-input:focus { border-color: var(--accent); }
  .table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow-x: auto; box-shadow: var(--shadow); -webkit-overflow-scrolling: touch; }
  table { width: 100%; min-width: 680px; border-collapse: collapse; }
  th { font-size: 10px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: var(--muted); padding: 12px 14px; text-align: left; background: #faf9f7; border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 12px 14px; font-size: 13px; border-bottom: 1px solid #f0ece6; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #faf9f7; }
  .name-cell { font-weight: 600; font-size: 13px; }
  .phone-cell { color: var(--muted); font-size: 12px; }
  .amount-cell { font-family: 'Playfair Display', serif; font-size: 14px; white-space: nowrap; }
  .status-pill { display: inline-block; font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 20px; white-space: nowrap; }
  .actions { display: flex; gap: 4px; flex-wrap: wrap; }
  .borrower-photos { display: flex; gap: 4px; margin-top: 6px; }
  .borrower-photo { width: 34px; height: 34px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border); cursor: pointer; }
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .section-header h2 { font-family: 'Playfair Display', serif; font-size: 18px; color: var(--accent); }
  .chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
  .chart-card h3 { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 16px; }
  .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
  .profit-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 20px; }
  .profit-card h2 { font-family: 'Playfair Display', serif; font-size: 18px; color: var(--accent); margin-bottom: 16px; }
  .profit-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .profit-row:last-child { border-bottom: none; }
  .profit-row .plabel { font-size: 13px; color: var(--muted); }
  .profit-row .pval { font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 600; }
  .rate-controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; padding: 14px; background: var(--accent-light); border-radius: 10px; }
  .rate-controls label { font-size: 12px; font-weight: 600; color: var(--accent); }
  .rate-controls input, .rate-controls select { padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-family: 'DM Sans', sans-serif; font-size: 13px; background: #fff; }
  .overdue-prompt { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 14px; margin-bottom: 16px; }
  .overdue-prompt strong { color: #92400e; display: block; margin-bottom: 6px; font-size: 14px; }
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 12px; overflow-y: auto; }
  .modal { background: var(--surface); border-radius: 16px; width: 100%; max-width: 500px; box-shadow: var(--shadow-lg); overflow: hidden; margin: auto; }
  .modal-header { padding: 18px 20px 14px; border-bottom: 1px solid var(--border); }
  .modal-header h2 { font-family: 'Playfair Display', serif; font-size: 18px; color: var(--accent); }
  .modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; max-height: 72vh; overflow-y: auto; }
  .modal-footer { padding: 14px 20px 18px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--border); }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-group label { font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: var(--muted); }
  .form-group input, .form-group select { padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 14px; color: var(--text); background: #fff; outline: none; transition: border 0.15s; width: 100%; }
  .form-group input:focus, .form-group select:focus { border-color: var(--accent); }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .img-upload-box { border: 2px dashed var(--border); border-radius: 8px; padding: 12px; text-align: center; cursor: pointer; transition: border 0.15s; }
  .img-upload-box:hover { border-color: var(--accent); }
  .img-upload-box p { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .img-preview { width: 100%; max-height: 130px; object-fit: cover; border-radius: 6px; margin-top: 8px; }
  .login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
  .login-card { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 32px 28px; width: 100%; max-width: 420px; box-shadow: var(--shadow-lg); }
  .login-card h1 { font-family: 'Playfair Display', serif; font-size: 26px; color: var(--accent); margin-bottom: 4px; }
  .login-card > p { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
  .role-select { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
  .role-option { border: 2px solid var(--border); border-radius: 10px; padding: 14px 12px; cursor: pointer; transition: all 0.15s; text-align: center; }
  .role-option.selected { border-color: var(--accent); background: var(--accent-light); }
  .role-option h3 { font-size: 13px; font-weight: 600; margin-bottom: 3px; }
  .role-option p { font-size: 11px; color: var(--muted); margin: 0; }
  .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.88); display: flex; align-items: center; justify-content: center; z-index: 300; padding: 16px; }
  .lightbox img { max-width: 100%; max-height: 90vh; border-radius: 8px; }
  .lightbox-close { position: absolute; top: 16px; right: 20px; color: #fff; font-size: 28px; cursor: pointer; background: none; border: none; }
  .empty { text-align: center; padding: 48px 20px; color: var(--muted); }
  .empty h3 { font-family: 'Playfair Display', serif; font-size: 18px; margin-bottom: 6px; color: var(--text); }
  .toast { position: fixed; bottom: 20px; right: 16px; left: 16px; background: var(--accent); color: #fff; padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 500; box-shadow: var(--shadow-lg); z-index: 200; animation: slideIn 0.2s ease; text-align: center; }
  @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .loading { text-align: center; padding: 48px; color: var(--muted); font-size: 14px; }
  .info-text { font-size: 12px; color: var(--muted); }
  .net-card { background: var(--accent-light); border: 2px solid var(--accent); border-radius: var(--radius); padding: 16px; }
  .net-card .label { font-size: 10px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: var(--accent); margin-bottom: 4px; }
  .net-card .value { font-family: 'Playfair Display', serif; font-size: 24px; color: var(--accent); }
  .net-card .sub { font-size: 11px; color: var(--accent); margin-top: 4px; opacity: 0.7; }
  .app-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 16px; }
  .app-photos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
  .app-photo { width: 100%; aspect-ratio: 3/4; border-radius: 8px; object-fit: cover; border: 1px solid var(--border); }
  .app-actions { display: flex; gap: 8px; margin-top: 14px; }
  @media (min-width: 768px) {
    .app { padding: 24px 20px 80px; }
    .stats { grid-template-columns: repeat(4, 1fr); }
    .fin-grid { grid-template-columns: repeat(4, 1fr); }
    .stat-card .value { font-size: 22px; }
    .header-left h1 { font-size: 26px; }
    .toast { left: auto; max-width: 380px; text-align: left; }
    .modal-body { max-height: 75vh; }
  }
  @media (max-width: 480px) {
    .charts-grid { grid-template-columns: 1fr; }
  }
`;

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [role, setRole] = useState("viewer");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const handleLogin = () => {
    if (role === "admin") { if (pin === ADMIN_PIN) onLogin("admin"); else setError("Incorrect PIN."); }
    else { if (pin === VIEWER_PASSWORD) onLogin("viewer"); else setError("Incorrect password."); }
  };
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>LoanTrack</h1>
        <p>Professional Loan Management System</p>
        <div className="role-select">
          <div className={`role-option ${role === "admin" ? "selected" : ""}`} onClick={() => { setRole("admin"); setPin(""); setError(""); }}>
            <h3>Administrator</h3><p>Full access</p>
          </div>
          <div className={`role-option ${role === "viewer" ? "selected" : ""}`} onClick={() => { setRole("viewer"); setPin(""); setError(""); }}>
            <h3>Viewer</h3><p>View, mark paid, remind</p>
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>{role === "admin" ? "Admin PIN" : "Viewer Password"}</label>
          <input type="password" placeholder={role === "admin" ? "Enter PIN" : "Enter password"} value={pin}
            onChange={(e) => { setPin(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
          {error && <span style={{ color: "var(--danger)", fontSize: 12 }}>{error}</span>}
        </div>
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleLogin}>
          {role === "admin" ? "Login as Administrator" : "Login as Viewer"}
        </button>
      </div>
    </div>
  );
}

// ── Image compression + Supabase Storage upload ───────────────────────────────
function compressImage(file, maxPx = 800, quality = 0.72) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale  = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(new File([blob], "photo.jpg", { type: "image/jpeg" })),
        "image/jpeg", quality
      );
    };
    img.src = url;
  });
}

async function uploadImage(file, folder, slot) {
  const compressed = await compressImage(file);
  const path   = `${folder}/${slot}-${Date.now()}.jpg`;
  const bucket = "loan-images";
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "image/jpeg",
    },
    body: compressed,
  });
  if (!res.ok) throw new Error("Upload failed: " + (await res.text()));
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

// ── Image Upload — no capture attr (prevents mobile losing form state) ────────
function ImageUpload({ label, preview, onChange }) {
  const ref = useRef();
  return (
    <div className="form-group" style={{ marginBottom: 14 }}>
      <label>{label}</label>
      <div className="img-upload-box" onClick={() => ref.current.click()}>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onChange(file);
          }}
        />
        {preview
          ? <img src={preview} alt="preview" className="img-preview" />
          : <p>📷 Tap to take or upload photo</p>}
      </div>
    </div>
  );
}

// ── QR Code Modal ─────────────────────────────────────────────────────────────
function QRModal({ onClose }) {
  const qrRef = useRef();
  const applURL = `${window.location.origin}/apply`;
  
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📱 Client QR Code</h2>
        </div>
        <div className="modal-body" style={{ alignItems: "center" }}>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>Share this QR code with clients to apply for loans</p>
          <div ref={qrRef} style={{ padding: 16, background: "#fff", borderRadius: 12 }}>
            <QRCodeCanvas value={applURL} size={200} level="H" />
          </div>
          <p style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>URL: {applURL}</p>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => {
            const canvas = qrRef.current.querySelector("canvas");
            const link = document.createElement("a");
            link.href = canvas.toDataURL();
            link.download = "loan-qr-code.png";
            link.click();
          }}>
            📥 Download QR Code
          </button>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Application Form (Client QR) — PUBLIC, no login needed ───────────────────
function ApplicationForm() {
  const [form, setForm] = useState({
    borrower_name: "", phone: "", residency_place: "",
    bank_name: "", account_number: "", amount: "", due_date: "",
  });
  const [file1, setFile1]     = useState(null);
  const [file2, setFile2]     = useState(null);
  const [prev1, setPrev1]     = useState("");
  const [prev2, setPrev2]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState(false);

  const handleImg = (slot, file) => {
    const url = URL.createObjectURL(file);
    if (slot === 1) { setFile1(file); setPrev1(url); }
    else            { setFile2(file); setPrev2(url); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.borrower_name || !form.phone || !form.amount || !form.due_date)
      return setError("Please fill in all required fields.");
    if (!file1 || !file2)
      return setError("Please upload both your selfie and student card photo.");
    setLoading(true); setError("");
    try {
      const folder = `apply-${Date.now()}`;
      const [url1, url2] = await Promise.all([
        uploadImage(file1, folder, "selfie"),
        uploadImage(file2, folder, "card"),
      ]);
      await sb("POST", "/pending_applications", {
        ...form, amount: Number(form.amount),
        image1: url1, image2: url2, status: "pending",
      });
      setSuccess(true);
    } catch (err) {
      setError("Submission failed: " + err.message);
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: "var(--accent)", marginBottom: 8 }}>Application Submitted!</h1>
          <p style={{ color: "var(--muted)" }}>Your loan application has been received. We will contact you on WhatsApp shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "24px 16px" }}>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: "var(--accent)", marginBottom: 4 }}>Loan Application</h1>
        <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 24 }}>Fill in your details to apply for a loan</p>
        <form onSubmit={handleSubmit} style={{ background: "var(--surface)", borderRadius: "var(--radius)", padding: "22px 20px", border: "1px solid var(--border)" }}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Full Name *</label>
            <input type="text" placeholder="Your full name" value={form.borrower_name} onChange={(e) => setForm({...form, borrower_name: e.target.value})} />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>WhatsApp Number *</label>
            <input type="tel" placeholder="0812345678" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Residency / Area</label>
            <input type="text" placeholder="Your town or area" value={form.residency_place} onChange={(e) => setForm({...form, residency_place: e.target.value})} />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Bank Name</label>
            <input type="text" placeholder="e.g. Capitec, FNB" value={form.bank_name} onChange={(e) => setForm({...form, bank_name: e.target.value})} />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Account Number</label>
            <input type="text" placeholder="Your bank account number" value={form.account_number} onChange={(e) => setForm({...form, account_number: e.target.value})} />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Loan Amount (ZAR) *</label>
            <input type="number" placeholder="5000" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})} />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Repayment Date *</label>
            <input type="date" value={form.due_date} onChange={(e) => setForm({...form, due_date: e.target.value})} />
          </div>
          <ImageUpload label="📸 Selfie Photo *"       preview={prev1} onChange={(f) => handleImg(1, f)} />
          <ImageUpload label="🪪 Student Card Photo *" preview={prev2} onChange={(f) => handleImg(2, f)} />
          {error && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 8, padding: 12, background: "var(--danger-light)", borderRadius: 8 }}>{error}</div>}
          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 20 }} disabled={loading}>
            {loading ? "Uploading & Submitting…" : "Submit Application"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Pending Applications Card ─────────────────────────────────────────────────
function PendingApplicationCard({ app, onApprove, onReject }) {
  const [lightboxImg, setLightboxImg] = useState(null);

  return (
    <>
      <div className="app-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{app.borrower_name}</h3>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>{app.phone}</p>
          </div>
          <span className="status-pill" style={{ background: "#fef3c7", color: "#92400e" }}>Pending</span>
        </div>

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 12, lineHeight: 1.6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "var(--muted)" }}>Loan Amount:</span>
            <span style={{ fontWeight: 600, fontFamily: "'Playfair Display', serif" }}>{fmt(app.amount)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "var(--muted)" }}>Due Date:</span>
            <span>{new Date(app.due_date).toLocaleDateString("en-ZA")}</span>
          </div>
          {app.bank_name && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "var(--muted)" }}>Bank:</span>
            <span>{app.bank_name}</span>
          </div>}
          {app.residency_place && <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--muted)" }}>Address:</span>
            <span>{app.residency_place}</span>
          </div>}
        </div>

        {(app.image1 || app.image2) && (
          <div className="app-photos">
            {app.image1 && <img src={app.image1} alt="Selfie" className="app-photo" onClick={() => setLightboxImg(app.image1)} style={{ cursor: "pointer" }} />}
            {app.image2 && <img src={app.image2} alt="Document" className="app-photo" onClick={() => setLightboxImg(app.image2)} style={{ cursor: "pointer" }} />}
          </div>
        )}

        <div className="app-actions">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onApprove(app)}>✅ Accept</button>
          <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => onReject(app.id)}>❌ Reject</button>
        </div>
      </div>

      {lightboxImg && <div className="lightbox" onClick={() => setLightboxImg(null)}>
        <img src={lightboxImg} alt="Full size" />
        <button className="lightbox-close" onClick={() => setLightboxImg(null)}>✕</button>
      </div>}
    </>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
function MainApp({ role, onLogout }) {
  const [tab, setTab] = useState("loans");
  const [loans, setLoans] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editingLiab, setEditingLiab] = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const [toast, setToast] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [balance, setBalance] = useState(getBalance());
  const [settings, setSettings] = useState(getSettings());
  const [overduePrompt, setOverduePrompt] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3200); };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [l, li, p] = await Promise.all([
        sb("GET", "/loans?order=created_at.desc"),
        sb("GET", "/liabilities?order=created_at.desc").catch(() => []),
        sb("GET", "/pending_applications?status=eq.pending&order=created_at.desc").catch(() => []),
      ]);
      setLoans(l);
      setLiabilities(li);
      setPending(p);
    } catch (err) { 
      console.error("Error loading data:", err);
      showToast("Error: " + (err.message || "Failed to load data")); 
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (role) fetchAll(); }, [role, fetchAll]);

  useEffect(() => {
    if (!role || !loans.length) return;
    const overdueLoan = loans.find(l => l.status === "active" && daysLeft(l.due_date) < -28 && !l.interest_prompted);
    if (overdueLoan && !overduePrompt) setOverduePrompt(overdueLoan);
  }, [loans, role, overduePrompt]);

  const { rate, type } = settings;
  const active = loans.filter(l => l.status === "active");
  const paid = loans.filter(l => l.status === "paid");
  const overdue = active.filter(l => daysLeft(l.due_date) < 0);
  const totalOutstanding = active.reduce((s, l) => s + Number(l.amount), 0);
  const totalInvested = active.reduce((s, l) => s + getPrincipal(Number(l.amount), rate), 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + Number(l.amount), 0);
  const netPosition = balance + totalOutstanding - totalLiabilities;
  const totalEstimatedInterest = active.reduce((s, l) => {
    const principal = getPrincipal(Number(l.amount), rate);
    const months = monthsBetween(l.loan_date || l.created_at, l.due_date);
    return s + calcInterest(principal, rate, months, type);
  }, 0);

  const pieData = [
    { label: "Active", value: active.length - overdue.length, color: "#2563eb" },
    { label: "Overdue", value: overdue.length, color: "#dc2626" },
    { label: "Paid", value: paid.length, color: "#16a34a" },
  ].filter(d => d.value > 0);

  const now = new Date();
  const barData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const value = paid.filter(l => {
      const pd = new Date(l.updated_at || l.created_at);
      return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear();
    }).reduce((s, l) => s + Number(l.amount), 0);
    return { label: d.toLocaleDateString("en-ZA", { month: "short" }), value };
  });

  const filtered = loans.filter(l => {
    const mf = filter === "all" ? true : filter === "active" ? l.status === "active" : filter === "overdue" ? (l.status === "active" && daysLeft(l.due_date) < 0) : l.status === "paid";
    const ms = l.borrower_name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search);
    return mf && ms;
  });

  const saveLoan = async (form) => {
    const amt = Number(form.amount);
    if (editing) {
      await sb("PATCH", `/loans?id=eq.${editing.id}`, form);
      showToast("Loan updated.");
    } else {
      await sb("POST", "/loans", form);
      const principal = getPrincipal(amt, rate);
      const newBal = balance - principal;
      setBalance(newBal); saveBalance(newBal);
      showToast(`Loan added. Balance reduced by ${fmt(principal)}.`);
    }
    await fetchAll(); setEditing(null); setModal(null);
  };

  const deleteLoan = (loan) => {
    setConfirmData({
      message: `Delete loan for ${loan.borrower_name}? This cannot be undone.`,
      onConfirm: async () => {
        setLoans(prev => prev.filter(l => l.id !== loan.id));
        if (loan.status === "active") {
          const principal = getPrincipal(Number(loan.amount), rate);
          const newBal = balance + principal;
          setBalance(newBal); saveBalance(newBal);
        }
        setModal(null);
        try { await sb("DELETE", `/loans?id=eq.${loan.id}`); showToast("Loan deleted. Balance restored."); }
        catch { showToast("Delete failed."); await fetchAll(); }
      },
    });
    setModal("confirm");
  };

  const markPaid = (loan) => {
    setConfirmData({
      message: `Mark ${loan.borrower_name}'s loan of ${fmt(loan.amount)} as paid?`,
      confirmLabel: "Mark as Paid", confirmClass: "btn-primary",
      onConfirm: async () => {
        await sb("PATCH", `/loans?id=eq.${loan.id}`, { status: "paid" });
        const newBal = balance + Number(loan.amount);
        setBalance(newBal); saveBalance(newBal);
        showToast(`${fmt(loan.amount)} added to balance.`);
        await fetchAll(); setModal(null);
      },
    });
    setModal("confirm");
  };

  const approvePendingApplication = async (app) => {
    setConfirmData({
      message: `Approve loan application for ${app.borrower_name} (${fmt(app.amount)})?`,
      confirmLabel: "Approve", confirmClass: "btn-primary",
      onConfirm: async () => {
        try {
          const loanData = {
            borrower_name: app.borrower_name,
            phone: app.phone,
            amount: app.amount,
            loan_date: new Date().toISOString().split('T')[0],
            due_date: app.due_date,
            notes: "Approved from QR application",
            status: "active",
            bank_name: app.bank_name,
            account_number: app.account_number,
            residency_place: app.residency_place,
            image1: app.image1,
            image2: app.image2,
          };
          
          await sb("POST", "/loans", loanData);
          await sb("PATCH", `/pending_applications?id=eq.${app.id}`, { status: "approved" });
          
          const principal = getPrincipal(app.amount, rate);
          const newBal = balance - principal;
          setBalance(newBal);
          saveBalance(newBal);
          
          await fetchAll();
          setModal(null);
          showToast("Application approved and added to loans!");
        } catch (err) {
          showToast("Failed to approve: " + err.message);
        }
      },
    });
    setModal("confirm");
  };

  const rejectPendingApplication = async (appId) => {
    setConfirmData({
      message: "Reject this application? This cannot be undone.",
      confirmLabel: "Reject", confirmClass: "btn-danger",
      onConfirm: async () => {
        try {
          await sb("DELETE", `/pending_applications?id=eq.${appId}`);
          await fetchAll();
          setModal(null);
          showToast("Application rejected.");
        } catch (err) {
          showToast("Failed to reject: " + err.message);
        }
      },
    });
    setModal("confirm");
  };

  const applyOverdueInterest = async (loan, apply) => {
    if (apply) {
      const months = Math.max(1, Math.abs(Math.floor(daysLeft(loan.due_date) / 30)));
      const principal = getPrincipal(Number(loan.amount), rate);
      const newAmount = Math.round(principal * Math.pow(1 + rate / 100, months));
      await sb("PATCH", `/loans?id=eq.${loan.id}`, { amount: newAmount, interest_prompted: true });
      showToast(`Interest applied. New amount: ${fmt(newAmount)}`);
    } else {
      await sb("PATCH", `/loans?id=eq.${loan.id}`, { interest_prompted: true });
      showToast("Loan kept as is.");
    }
    setOverduePrompt(null);
    await fetchAll();
  };

  const sendReminder = (loan) => {
    const msg = buildWhatsAppMessage(loan);
    const whatsappUrl = `https://wa.me/${loan.phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
    window.open(whatsappUrl, "_blank");
  };

  const LoanModal = () => {
    const [form, setForm] = useState(editing || { borrower_name: "", phone: "", amount: "", loan_date: new Date().toISOString().split('T')[0], due_date: "", notes: "", status: "active", bank_name: "", account_number: "", residency_place: "" });

    return (
      <div className="overlay" onClick={() => setModal(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header"><h2>{editing ? "Edit Loan" : "Add Loan"}</h2></div>
          <div className="modal-body">
            <div className="form-group">
              <label>Borrower Name</label>
              <input type="text" value={form.borrower_name} onChange={(e) => setForm({...form, borrower_name: e.target.value})} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Amount (ZAR)</label>
                <input type="number" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Loan Date</label>
                <input type="date" value={form.loan_date} onChange={(e) => setForm({...form, loan_date: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input type="date" value={form.due_date} onChange={(e) => setForm({...form, due_date: e.target.value})} />
              </div>
            </div>
            <div className="form-group">
              <label>Bank Name</label>
              <input type="text" value={form.bank_name} onChange={(e) => setForm({...form, bank_name: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Account Number</label>
              <input type="text" value={form.account_number} onChange={(e) => setForm({...form, account_number: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Residency Place</label>
              <input type="text" value={form.residency_place} onChange={(e) => setForm({...form, residency_place: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input type="text" value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}>
                <option value="active">Active</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => saveLoan(form)}>Save</button>
            {editing && <button className="btn btn-danger" onClick={() => deleteLoan(editing)}>Delete</button>}
          </div>
        </div>
      </div>
    );
  };

  const LiabilityModal = () => {
    const [form, setForm] = useState(editingLiab || { name: "", amount: "", team_member: "" });

    return (
      <div className="overlay" onClick={() => setModal(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header"><h2>{editingLiab ? "Edit Liability" : "Add Liability"}</h2></div>
          <div className="modal-body">
            <div className="form-group">
              <label>Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Amount (ZAR)</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Team Member</label>
              <input type="text" value={form.team_member} onChange={(e) => setForm({...form, team_member: e.target.value})} />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={async () => {
              const path = editingLiab ? `/liabilities?id=eq.${editingLiab.id}` : "/liabilities";
              const method = editingLiab ? "PATCH" : "POST";
              await sb(method, path, form);
              showToast(editingLiab ? "Liability updated." : "Liability added.");
              await fetchAll(); setEditingLiab(null); setModal(null);
            }}>Save</button>
            {editingLiab && <button className="btn btn-danger" onClick={async () => {
              await sb("DELETE", `/liabilities?id=eq.${editingLiab.id}`);
              showToast("Liability deleted.");
              await fetchAll(); setEditingLiab(null); setModal(null);
            }}>Delete</button>}
          </div>
        </div>
      </div>
    );
  };

  const ConfirmModal = () => {
    return (
      <div className="overlay" onClick={() => setModal(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header"><h2>Confirm Action</h2></div>
          <div className="modal-body"><p>{confirmData.message}</p></div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className={`btn ${confirmData.confirmClass || "btn-primary"}`} onClick={() => confirmData.onConfirm()}>
              {confirmData.confirmLabel || "Confirm"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      <style>{css}</style>

      {/* Header */}
      <div className="header">
        <div className="header-left">
          <h1>LoanTrack</h1>
          <p>Professional Loan Management System</p>
        </div>
        <div className="header-right">
          <span className="role-badge">{role?.toUpperCase()}</span>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>Logout</button>
        </div>
      </div>

      {/* Overdue Prompt */}
      {overduePrompt && (
        <div className="overdue-prompt">
          <strong>⚠️ Overdue Loan: {overduePrompt.borrower_name}</strong>
          <p style={{ fontSize: 12, margin: "6px 0 12px" }}>Loan amount {fmt(overduePrompt.amount)} is overdue by {Math.abs(daysLeft(overduePrompt.due_date))} days</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={() => applyOverdueInterest(overduePrompt, true)}>Apply Interest</button>
            <button className="btn btn-sm btn-ghost" onClick={() => applyOverdueInterest(overduePrompt, false)}>Skip</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === "loans" ? "active" : ""}`} onClick={() => setTab("loans")}>
          💰 Loans {loans.length > 0 && `(${loans.length})`}
        </button>
        <button className={`tab ${tab === "pending" ? "active" : ""}`} onClick={() => setTab("pending")}>
          📥 Applications
          {pending.length > 0 && <span className="tab-badge">{pending.length}</span>}
        </button>
        <button className={`tab ${tab === "liabilities" ? "active" : ""}`} onClick={() => setTab("liabilities")}>
          📊 Liabilities
        </button>
        <button className={`tab ${tab === "finance" ? "active" : ""}`} onClick={() => setTab("finance")}>
          📈 Finance
        </button>
      </div>

      {/* Loans Tab */}
      {tab === "loans" && (
        <>
          <div className="section-header">
            <h2>Loan Portfolio</h2>
            {role === "admin" && <button className="btn btn-primary btn-sm" onClick={() => setShowQRModal(true)}>📱 Client QR</button>}
          </div>

          <div className="stats">
            <div className="stat-card">
              <div className="label">Total Active</div>
              <div className="value">{active.length}</div>
              <div className="sub">{fmt(totalOutstanding)} outstanding</div>
            </div>
            <div className="stat-card">
              <div className="label">Overdue</div>
              <div className="value" style={{ color: "#dc2626" }}>{overdue.length}</div>
            </div>
            <div className="stat-card">
              <div className="label">Paid</div>
              <div className="value" style={{ color: "#16a34a" }}>{paid.length}</div>
            </div>
            <div className="stat-card net-card">
              <div className="label">Net Position</div>
              <div className="value">{fmt(netPosition)}</div>
            </div>
          </div>

          <div className="toolbar">
            <button className={`filter-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All</button>
            <button className={`filter-btn ${filter === "active" ? "active" : ""}`} onClick={() => setFilter("active")}>Active</button>
            <button className={`filter-btn ${filter === "overdue" ? "active" : ""}`} onClick={() => setFilter("overdue")}>Overdue</button>
            <button className={`filter-btn ${filter === "paid" ? "active" : ""}`} onClick={() => setFilter("paid")}>Paid</button>
            <input type="text" className="search-input" placeholder="Search name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
            {role === "admin" && <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setModal("loan"); }}>+ Add Loan</button>}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Borrower</th>
                  <th style={{ minWidth: 120 }}>Residence</th>
                  <th style={{ minWidth: 100 }}>Amount</th>
                  <th style={{ minWidth: 100 }}>Due Date</th>
                  <th style={{ minWidth: 90 }}>Status</th>
                  <th style={{ minWidth: 150 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: "center", color: "var(--muted)", padding: "32px" }}>No loans found</td></tr>
                ) : filtered.map(l => (
                  <tr key={l.id}>
                    <td>
                      <div className="name-cell">{l.borrower_name}</div>
                      <div className="phone-cell">{formatPhoneZA(l.phone)}</div>
                      {(l.image1 || l.image2) && (
                        <div className="borrower-photos">
                          {l.image1 && (
                            <div style={{ textAlign: "center" }}>
                              <img src={l.image1} alt="Selfie" className="borrower-photo" onClick={() => setLightbox(l.image1)} />
                              <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>Selfie</div>
                            </div>
                          )}
                          {l.image2 && (
                            <div style={{ textAlign: "center" }}>
                              <img src={l.image2} alt="Card" className="borrower-photo" onClick={() => setLightbox(l.image2)} />
                              <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>Card</div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: 12 }}>{l.residency_place || "—"}</td>
                    <td className="amount-cell">{fmt(l.amount)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(l.due_date).toLocaleDateString("en-ZA")}</td>
                    <td><span className="status-pill" style={{ background: statusLabel(l).color + "20", color: statusLabel(l).color }}>{statusLabel(l).text}</span></td>
                    <td className="actions">
                      {l.status === "active" && <button className="btn btn-sm btn-primary" onClick={() => markPaid(l)}>✓ Mark Paid</button>}
                      {l.status === "active" && <button className="btn btn-sm btn-ghost" onClick={() => sendReminder(l)}>💬 Remind</button>}
                      {role === "admin" && <button className="btn btn-sm btn-ghost" onClick={() => { setEditing(l); setModal("loan"); }}>✏️ Edit</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Pending Applications Tab */}
      {tab === "pending" && (
        <>
          <div className="section-header"><h2>Pending Applications</h2></div>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : pending.length === 0 ? (
            <div className="empty"><h3>No Pending Applications</h3><p>Client applications will appear here</p></div>
          ) : (
            <div>
              {pending.map(app => (
                <PendingApplicationCard 
                  key={app.id} 
                  app={app} 
                  onApprove={approvePendingApplication}
                  onReject={rejectPendingApplication}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Liabilities Tab */}
      {tab === "liabilities" && (
        <>
          <div className="section-header">
            <h2>Liabilities</h2>
            {role === "admin" && <button className="btn btn-primary btn-sm" onClick={() => { setEditingLiab(null); setModal("liability"); }}>+ Add Liability</button>}
          </div>

          <div className="stats">
            <div className="stat-card">
              <div className="label">Total Liabilities</div>
              <div className="value" style={{ color: "#dc2626" }}>{fmt(totalLiabilities)}</div>
            </div>
            <div className="stat-card">
              <div className="label">Balance</div>
              <div className="value">{fmt(balance)}</div>
            </div>
            <div className="stat-card">
              <div className="label">Net Position</div>
              <div className="value" style={{ color: netPosition >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(netPosition)}</div>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Amount</th>
                  <th>Team Member</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {liabilities.length === 0 ? (
                  <tr><td colSpan="4" style={{ textAlign: "center", color: "var(--muted)", padding: "32px" }}>No liabilities</td></tr>
                ) : liabilities.map(l => (
                  <tr key={l.id}>
                    <td className="name-cell">{l.name}</td>
                    <td className="amount-cell">{fmt(l.amount)}</td>
                    <td>{l.team_member}</td>
                    <td className="actions">
                      {role === "admin" && <button className="btn btn-sm btn-ghost" onClick={() => { setEditingLiab(l); setModal("liability"); }}>✏️ Edit</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Finance Tab */}
      {tab === "finance" && (
        <>
          <div className="section-header"><h2>Financial Overview</h2></div>

          <div className="profit-card">
            <h2>Summary</h2>
            <div className="profit-row">
              <span className="plabel">Balance</span>
              <span className="pval">{fmt(balance)}</span>
            </div>
            <div className="profit-row">
              <span className="plabel">Total Outstanding</span>
              <span className="pval">{fmt(totalOutstanding)}</span>
            </div>
            <div className="profit-row">
              <span className="plabel">Total Invested (Principal)</span>
              <span className="pval">{fmt(totalInvested)}</span>
            </div>
            <div className="profit-row">
              <span className="plabel">Estimated Interest</span>
              <span className="pval">{fmt(totalEstimatedInterest)}</span>
            </div>
            <div className="profit-row">
              <span className="plabel">Total Liabilities</span>
              <span className="pval" style={{ color: "#dc2626" }}>-{fmt(totalLiabilities)}</span>
            </div>
            <div className="profit-row" style={{ borderBottom: "2px solid var(--accent)", paddingTop: 12, marginTop: 12 }}>
              <span className="plabel" style={{ fontSize: 14, fontWeight: 600 }}>Net Position</span>
              <span className="pval" style={{ fontSize: 18, color: netPosition >= 0 ? "#16a34a" : "#dc2626" }}>{fmt(netPosition)}</span>
            </div>
          </div>

          <div className="rate-controls">
            <label>Interest Rate: {rate}% ({type})</label>
            {role === "admin" && (
              <>
                <input type="number" value={rate} onChange={(e) => { const s = {...settings, rate: Number(e.target.value)}; setSettings(s); saveSettings(s); }} style={{ width: 80 }} />
                <select value={type} onChange={(e) => { const s = {...settings, type: e.target.value}; setSettings(s); saveSettings(s); }}>
                  <option value="simple">Simple</option>
                  <option value="compound">Compound</option>
                </select>
              </>
            )}
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <h3>Loan Status Distribution</h3>
              <PieChart data={pieData} />
            </div>
            <div className="chart-card">
              <h3>Monthly Collections</h3>
              <BarChart data={barData} />
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {modal === "loan" && <LoanModal />}
      {modal === "liability" && <LiabilityModal />}
      {modal === "confirm" && <ConfirmModal />}
      {showQRModal && <QRModal onClose={() => setShowQRModal(false)} />}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}

      {/* Lightbox */}
      {lightbox && <div className="lightbox" onClick={() => setLightbox(null)}>
        <img src={lightbox} alt="Full size" />
        <button className="lightbox-close" onClick={() => setLightbox(null)}>✕</button>
      </div>}
    </div>
  );
}

// ── Router — /apply is PUBLIC, dashboard requires login ───────────────────────
function AppRouter() {
  const [role, setRole] = useState(null);
  return (
    <Router>
      <Routes>
        <Route path="/apply" element={<><style>{css}</style><ApplicationForm /></>} />
        <Route path="/*" element={
          role
            ? <MainApp role={role} onLogout={() => setRole(null)} />
            : <><style>{css}</style><LoginScreen onLogin={setRole} /></>
        } />
      </Routes>
    </Router>
  );
}

export default AppRouter;