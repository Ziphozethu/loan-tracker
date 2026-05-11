import React, { useState, useEffect, useCallback, useRef } from "react";

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "https://fdsqwpgwhcpceiptamfy.supabase.co";
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY || "sb_publishable_umuFeOvqGzD1PJCFAWLjNQ_NKK78-Aj";

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

// ── Local storage ─────────────────────────────────────────────────────────────
const ls = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const getPasswords = () => ls.get("lt_passwords", { admin: "1234", viewer: "Zesuliwe" });
const savePasswords = (p) => ls.set("lt_passwords", p);
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
  .tabs { display: flex; gap: 2px; margin-bottom: 20px; border-bottom: 2px solid var(--border); flex-wrap: wrap; }
  .tab { padding: 10px 16px; font-size: 13px; font-weight: 500; color: var(--muted); cursor: pointer; border: none; background: none; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s; white-space: nowrap; font-family: 'DM Sans', sans-serif; }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
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
  .stat-card .edit-btn { position: absolute; top: 10px; right: 10px; font-size: 11px; color: var(--muted); background: none; border: none; cursor: pointer; padding: 2px 8px; border-radius: 4px; font-family: 'DM Sans', sans-serif; }
  .stat-card .edit-btn:hover { background: var(--border); }
  .fin-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .filter-btn { font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; transition: all 0.15s; }
  .filter-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .search-input { flex: 1; min-width: 140px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 13px; background: var(--surface); color: var(--text); outline: none; }
  .search-input:focus { border-color: var(--accent); }
  .table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow-x: auto; box-shadow: var(--shadow); -webkit-overflow-scrolling: touch; }
  table { width: 100%; min-width: 680px; border-collapse: collapse; }
  th { font-size: 10px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: var(--muted); padding: 12px 14px; text-align: left; background: #faf9f7; border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 12px 14px; font-size: 13px; border-bottom: 1px solid #f0ece6; vertical-align: middle; }
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

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [role, setRole] = useState("viewer");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const handleLogin = () => {
    const p = getPasswords();
    if (role === "admin") { if (pin === p.admin) onLogin("admin"); else setError("Incorrect PIN."); }
    else { if (pin === p.viewer) onLogin("viewer"); else setError("Incorrect password."); }
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

// ── Image Upload ──────────────────────────────────────────────────────────────
function ImageUpload({ label, preview, onChange }) {
  const ref = useRef();
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="img-upload-box" onClick={() => ref.current.click()}>
        <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onChange(e.target.files?.[0])} />
        {preview ? <img src={preview} alt="preview" className="img-preview" /> : <p>Tap to upload</p>}
      </div>
    </div>
  );
}

// ── Loan Modal ────────────────────────────────────────────────────────────────
function LoanModal({ loan, onSave, onClose }) {
  const [form, setForm] = useState({
    borrower_name: loan?.borrower_name || "", phone: loan?.phone || "",
    account_number: loan?.account_number || "", residency_place: loan?.residency_place || "",
    amount: loan?.amount || "", loan_date: loan?.loan_date || new Date().toISOString().split("T")[0],
    due_date: loan?.due_date || "", notes: loan?.notes || "", status: loan?.status || "active",
    image1: loan?.image1 || "", image2: loan?.image2 || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleImg = (key, file) => { if (!file) return; const r = new FileReader(); r.onload = (e) => set(key, e.target.result); r.readAsDataURL(file); };
  const handleSave = async () => {
    if (!form.borrower_name.trim()) return setErr("Name required.");
    if (!form.phone.trim()) return setErr("Phone required.");
    if (!form.amount || isNaN(form.amount)) return setErr("Valid amount required.");
    if (!form.due_date) return setErr("Due date required.");
    setSaving(true); setErr("");
    try { await onSave(form); onClose(); }
    catch (e) { setErr("Save failed: " + e.message); setSaving(false); }
  };
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>{loan ? "Edit Loan" : "Add New Loan"}</h2></div>
        <div className="modal-body">
          <div className="form-group"><label>Borrower Full Name</label><input value={form.borrower_name} onChange={(e) => set("borrower_name", e.target.value)} placeholder="Full name" /></div>
          <div className="form-group"><label>WhatsApp Number</label><input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="e.g. 0812345678" /></div>
          <div className="form-row">
            <div className="form-group"><label>Account Number</label><input value={form.account_number} onChange={(e) => set("account_number", e.target.value)} placeholder="Bank account" /></div>
            <div className="form-group"><label>Residency / Area</label><input value={form.residency_place} onChange={(e) => set("residency_place", e.target.value)} placeholder="City or area" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Amount (ZAR)</label><input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" /></div>
            <div className="form-group"><label>Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="active">Active</option><option value="paid">Paid</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Loan Date</label><input type="date" value={form.loan_date} onChange={(e) => set("loan_date", e.target.value)} /></div>
            <div className="form-group"><label>Due Date</label><input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
          </div>
          <div className="form-group"><label>Notes / Reference</label><input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" /></div>
          <div className="form-row">
            <ImageUpload label="Photo 1 — ID / Profile" preview={form.image1} onChange={(f) => handleImg("image1", f)} />
            <ImageUpload label="Photo 2 — Residence" preview={form.image2} onChange={(f) => handleImg("image2", f)} />
          </div>
          {err && <p style={{ color: "var(--danger)", fontSize: 13 }}>{err}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Loan"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onClose, confirmLabel = "Yes, Proceed", confirmClass = "btn-danger" }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>Confirm</h2></div>
        <div className="modal-body"><p style={{ fontSize: 14 }}>{message}</p></div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`btn ${confirmClass}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Liability Modal ───────────────────────────────────────────────────────────
function LiabilityModal({ liability, onSave, onClose }) {
  const [form, setForm] = useState({ name: liability?.name || "", amount: liability?.amount || "", team_member: liability?.team_member || "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const handleSave = async () => {
    if (!form.name.trim()) return setErr("Name required.");
    if (!form.amount || isNaN(form.amount)) return setErr("Valid amount required.");
    setSaving(true); setErr("");
    try { await onSave(form); onClose(); }
    catch { setErr("Save failed."); setSaving(false); }
  };
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>{liability ? "Edit Liability" : "Add Liability"}</h2></div>
        <div className="modal-body">
          <div className="form-group"><label>Person / Company Name</label><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Who lent us money" /></div>
          <div className="form-group"><label>Amount (ZAR)</label><input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" /></div>
          <div className="form-group"><label>Team Member (who found them)</label><input value={form.team_member} onChange={(e) => set("team_member", e.target.value)} placeholder="Team member name" /></div>
          {err && <p style={{ color: "var(--danger)", fontSize: 13 }}>{err}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Modal ────────────────────────────────────────────────────────────
function SettingsModal({ onClose, showToast }) {
  const p = getPasswords();
  const [adminPin, setAdminPin] = useState(p.admin);
  const [viewerPass, setViewerPass] = useState(p.viewer);
  const handleSave = () => {
    if (!adminPin.trim() || !viewerPass.trim()) return;
    savePasswords({ admin: adminPin, viewer: viewerPass });
    showToast("Passwords updated.");
    setTimeout(onClose, 800);
  };
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>Settings — Change Passwords</h2></div>
        <div className="modal-body">
          <div className="form-group"><label>Admin PIN</label><input type="password" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} /></div>
          <div className="form-group"><label>Viewer Password</label><input type="password" value={viewerPass} onChange={(e) => setViewerPass(e.target.value)} /></div>
          <p className="info-text">Share the viewer password with people you want to give access to.</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ── Balance Modal ─────────────────────────────────────────────────────────────
function BalanceModal({ current, onSave, onClose }) {
  const [val, setVal] = useState(current);
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>Edit Available Balance</h2></div>
        <div className="modal-body">
          <div className="form-group"><label>Balance (ZAR)</label><input type="number" value={val} onChange={(e) => setVal(e.target.value)} /></div>
          <p className="info-text">Your cash on hand available to lend. Decreases when loans are added, increases when loans are repaid.</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { onSave(Number(val)); onClose(); }}>Save Balance</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function LoanTracker() {
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState("loans");
  const [loans, setLoans] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
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

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3200); };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [l, li] = await Promise.all([
        sb("GET", "/loans?order=created_at.desc"),
        sb("GET", "/liabilities?order=created_at.desc").catch(() => []),
      ]);
      setLoans(l);
      setLiabilities(li);
    } catch { showToast("Error loading data."); }
    setLoading(false);
  }, []);

  useEffect(() => { if (role) fetchAll(); }, [role, fetchAll]);

  useEffect(() => {
    if (!role || !loans.length) return;
    const overdueLoan = loans.find(l => l.status === "active" && daysLeft(l.due_date) < -28 && !l.interest_prompted);
    if (overdueLoan && !overduePrompt) setOverduePrompt(overdueLoan);
  }, [loans, role]);

  if (!role) return (<><style>{css}</style><LoginScreen onLogin={setRole} /></>);

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
    await fetchAll(); setEditing(null);
  };

  const deleteLoan = (loan) => {
    setConfirmData({
      message: `Delete loan for ${loan.borrower_name}? This cannot be undone.`,
      onConfirm: async () => {
        setLoans(prev => prev.filter(l => l.id !== loan.id));
        setModal(null);
        try { await sb("DELETE", `/loans?id=eq.${loan.id}`); showToast("Loan deleted."); }
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
    const phone = loan.phone.replace(/\D/g, "");
    const normalized = phone.startsWith("27") ? phone : phone.startsWith("0") ? "27" + phone.slice(1) : phone;
    window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const saveLiability = async (form) => {
    if (editingLiab) { await sb("PATCH", `/liabilities?id=eq.${editingLiab.id}`, form); showToast("Updated."); }
    else { await sb("POST", "/liabilities", form); showToast("Liability added."); }
    await fetchAll(); setEditingLiab(null);
  };

  const deleteLiability = (liab) => {
    setConfirmData({
      message: `Delete liability for ${liab.name}?`,
      onConfirm: async () => {
        setLiabilities(prev => prev.filter(l => l.id !== liab.id));
        setModal(null);
        try { await sb("DELETE", `/liabilities?id=eq.${liab.id}`); showToast("Deleted."); }
        catch { showToast("Delete failed."); await fetchAll(); }
      },
    });
    setModal("confirm");
  };

  const updateSettings = (s) => { setSettings(s); saveSettings(s); };

  return (
    <>
      <style>{css}</style>
      <div className="app">

        {/* Header */}
        <div className="header">
          <div className="header-left">
            <h1>LoanTrack</h1>
            <p>Professional Loan Management Dashboard</p>
          </div>
          <div className="header-right">
            <span className="role-badge">{role}</span>
            {role === "admin" && tab === "loans" && <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setModal("add"); }}>+ Add Loan</button>}
            {role === "admin" && tab === "liabilities" && <button className="btn btn-primary btn-sm" onClick={() => { setEditingLiab(null); setModal("liability"); }}>+ Add Liability</button>}
            {role === "admin" && <button className="btn btn-ghost btn-sm" onClick={() => setModal("settings")}>Settings</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => setRole(null)}>Logout</button>
          </div>
        </div>

        {/* Overdue interest prompt */}
        {overduePrompt && role === "admin" && (
          <div className="overdue-prompt">
            <strong>Overdue Loan — {overduePrompt.borrower_name}</strong>
            <div style={{ fontSize: 13, color: "#92400e" }}>
              Overdue by {Math.abs(Math.floor(daysLeft(overduePrompt.due_date) / 30))} month(s).
              Current amount: <strong>{fmt(overduePrompt.amount)}</strong>.
              Apply {rate}% {type} interest?
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn btn-warning btn-sm" onClick={() => applyOverdueInterest(overduePrompt, true)}>Apply Interest</button>
              <button className="btn btn-ghost btn-sm" onClick={() => applyOverdueInterest(overduePrompt, false)}>Leave As Is</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs">
          {[["loans","Loans"],["finance","Finance"],["liabilities","Liabilities"],["performance","Performance"]].map(([t, label]) => (
            <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>

        {/* ── LOANS TAB ── */}
        {tab === "loans" && (
          <>
            <div className="stats">
              <div className="stat-card"><div className="label">Total Loans</div><div className="value">{loans.length}</div></div>
              <div className="stat-card"><div className="label">Outstanding</div><div className="value" style={{ color: "var(--gold)" }}>{fmt(totalOutstanding)}</div></div>
              <div className="stat-card"><div className="label">Overdue</div><div className="value" style={{ color: "var(--danger)" }}>{overdue.length}</div></div>
              <div className="stat-card"><div className="label">Recovered</div><div className="value" style={{ color: "#16a34a" }}>{paid.length}</div></div>
            </div>
            <div className="toolbar">
              {["all","active","overdue","paid"].map(f => (
                <button key={f} className={`filter-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
              ))}
              <input className="search-input" placeholder="Search name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="table-wrap">
              {loading ? <div className="loading">Loading...</div> : filtered.length === 0 ? (
                <div className="empty"><h3>No loans found</h3><p>{role === "admin" ? 'Click "+ Add Loan" to get started.' : "No records match."}</p></div>
              ) : (
                <table>
                  <thead><tr><th>Borrower</th><th>Account</th><th>Amount</th><th>Due Date</th><th>Residency</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filtered.map(loan => {
                      const s = statusLabel(loan);
                      return (
                        <tr key={loan.id}>
                          <td>
                            <div className="name-cell">{loan.borrower_name}</div>
                            <div className="phone-cell">{formatPhoneZA(loan.phone)}</div>
                            {(loan.image1 || loan.image2) && (
                              <div className="borrower-photos">
                                {loan.image1 && <img src={loan.image1} alt="ID" className="borrower-photo" onClick={() => setLightbox(loan.image1)} />}
                                {loan.image2 && <img src={loan.image2} alt="Res" className="borrower-photo" onClick={() => setLightbox(loan.image2)} />}
                              </div>
                            )}
                          </td>
                          <td style={{ color: "var(--muted)" }}>{loan.account_number || "—"}</td>
                          <td className="amount-cell">{fmt(loan.amount)}</td>
                          <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{new Date(loan.due_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</td>
                          <td style={{ color: "var(--muted)" }}>{loan.residency_place || "—"}</td>
                          <td><span className="status-pill" style={{ background: s.color + "1a", color: s.color }}>{s.text}</span></td>
                          <td>
                            <div className="actions">
                              {loan.status === "active" && (<>
                                <button className="btn btn-ghost btn-sm" onClick={() => sendReminder(loan)}>Remind</button>
                                <button className="btn btn-ghost btn-sm" style={{ color: "#16a34a" }} onClick={() => markPaid(loan)}>Paid</button>
                              </>)}
                              {role === "admin" && (<>
                                <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(loan); setModal("edit"); }}>Edit</button>
                                <button className="btn btn-danger btn-sm" onClick={() => deleteLoan(loan)}>Del</button>
                              </>)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── FINANCE TAB ── */}
        {tab === "finance" && (
          <>
            <div className="fin-grid">
              <div className="stat-card">
                <div className="label">Available Balance</div>
                <div className="value" style={{ color: "var(--gold)" }}>{fmt(balance)}</div>
                <div className="sub">Cash ready to lend out</div>
                {role === "admin" && <button className="edit-btn" onClick={() => setModal("balance")}>Edit</button>}
              </div>
              <div className="stat-card">
                <div className="label">Invested Amount</div>
                <div className="value" style={{ color: "var(--blue)" }}>{fmt(totalInvested)}</div>
                <div className="sub">Principal currently out</div>
              </div>
              <div className="stat-card">
                <div className="label">Total Liabilities</div>
                <div className="value" style={{ color: "var(--danger)" }}>{fmt(totalLiabilities)}</div>
                <div className="sub">Money we owe others</div>
              </div>
              <div className="net-card">
                <div className="label">Net Position</div>
                <div className="value" style={{ color: netPosition >= 0 ? "#16a34a" : "var(--danger)" }}>{fmt(netPosition)}</div>
                <div className="sub">Balance + Loans − Liabilities</div>
              </div>
            </div>

            {role === "admin" && (
              <div className="profit-card">
                <h2>Profit Estimator</h2>
                <div className="rate-controls">
                  <label>Interest Rate (%/month)</label>
                  <input type="number" value={settings.rate} style={{ width: 70 }} onChange={(e) => updateSettings({ ...settings, rate: Number(e.target.value) })} />
                  <label>Interest Type</label>
                  <select value={settings.type} onChange={(e) => updateSettings({ ...settings, type: e.target.value })}>
                    <option value="simple">Simple Interest</option>
                    <option value="compound">Compound Interest</option>
                  </select>
                </div>
                <div className="profit-row">
                  <span className="plabel">Principal invested (money sent out)</span>
                  <span className="pval" style={{ color: "var(--blue)" }}>{fmt(totalInvested)}</span>
                </div>
                <div className="profit-row">
                  <span className="plabel">Total to be repaid (loan amounts)</span>
                  <span className="pval">{fmt(totalOutstanding)}</span>
                </div>
                <div className="profit-row">
                  <span className="plabel">Estimated Total Interest / Profit</span>
                  <span className="pval" style={{ color: "var(--gold)" }}>{fmt(totalEstimatedInterest)}</span>
                </div>
                <div className="profit-row" style={{ background: "var(--accent-light)", borderRadius: 8, padding: "12px 14px", margin: "8px -4px 0" }}>
                  <span className="plabel" style={{ color: "var(--accent)", fontWeight: 600 }}>Total Return (principal + interest)</span>
                  <span className="pval" style={{ color: "var(--accent)" }}>{fmt(totalInvested + totalEstimatedInterest)}</span>
                </div>
                <p className="info-text" style={{ marginTop: 12 }}>
                  {type === "compound"
                    ? "Compound: interest stacks monthly. If unpaid, next month's interest is calculated on previous balance + interest."
                    : "Simple: interest calculated on original principal only, regardless of months overdue."}
                </p>
              </div>
            )}
          </>
        )}

        {/* ── LIABILITIES TAB ── */}
        {tab === "liabilities" && (
          <>
            <div className="stat-card" style={{ marginBottom: 16 }}>
              <div className="label">Total We Owe</div>
              <div className="value" style={{ color: "var(--danger)" }}>{fmt(totalLiabilities)}</div>
            </div>
            <div className="table-wrap">
              {liabilities.length === 0 ? (
                <div className="empty"><h3>No liabilities recorded</h3><p>{role === "admin" ? 'Click "+ Add Liability" to record.' : "Nothing here yet."}</p></div>
              ) : (
                <table>
                  <thead>
                    <tr><th>Name</th><th>Amount</th><th>Found By</th>{role === "admin" && <th>Actions</th>}</tr>
                  </thead>
                  <tbody>
                    {liabilities.map(liab => (
                      <tr key={liab.id}>
                        <td style={{ fontWeight: 600 }}>{liab.name}</td>
                        <td className="amount-cell">{fmt(liab.amount)}</td>
                        <td style={{ color: "var(--muted)" }}>{liab.team_member || "—"}</td>
                        {role === "admin" && (
                          <td>
                            <div className="actions">
                              <button className="btn btn-ghost btn-sm" onClick={() => { setEditingLiab(liab); setModal("liability"); }}>Edit</button>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteLiability(liab)}>Del</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── PERFORMANCE TAB ── */}
        {tab === "performance" && (
          <>
            <div className="stats" style={{ marginBottom: 20 }}>
              <div className="stat-card"><div className="label">Total Loans</div><div className="value">{loans.length}</div></div>
              <div className="stat-card"><div className="label">Recovery Rate</div><div className="value" style={{ color: "#16a34a" }}>{loans.length ? Math.round((paid.length / loans.length) * 100) : 0}%</div></div>
              <div className="stat-card"><div className="label">Overdue Rate</div><div className="value" style={{ color: "var(--danger)" }}>{active.length ? Math.round((overdue.length / active.length) * 100) : 0}%</div></div>
              <div className="stat-card"><div className="label">Est. Profit</div><div className="value" style={{ color: "var(--gold)" }}>{fmt(totalEstimatedInterest)}</div></div>
            </div>
            <div className="charts-grid">
              <div className="chart-card">
                <h3>Loan Status Breakdown</h3>
                <PieChart data={pieData} />
              </div>
              <div className="chart-card">
                <h3>Monthly Collections (Last 6 Months)</h3>
                <BarChart data={barData} />
              </div>
            </div>
          </>
        )}

      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button className="lightbox-close" onClick={() => setLightbox(null)}>✕</button>
          <img src={lightbox} alt="Enlarged" />
        </div>
      )}

      {(modal === "add" || modal === "edit") && <LoanModal loan={editing} onSave={saveLoan} onClose={() => { setModal(null); setEditing(null); }} />}
      {modal === "confirm" && confirmData && <ConfirmModal message={confirmData.message} confirmLabel={confirmData.confirmLabel} confirmClass={confirmData.confirmClass} onConfirm={async () => { await confirmData.onConfirm(); }} onClose={() => setModal(null)} />}
      {modal === "liability" && <LiabilityModal liability={editingLiab} onSave={saveLiability} onClose={() => { setModal(null); setEditingLiab(null); }} />}
      {modal === "settings" && <SettingsModal onClose={() => setModal(null)} showToast={showToast} />}
      {modal === "balance" && <BalanceModal current={balance} onSave={(v) => { setBalance(v); saveBalance(v); showToast("Balance updated."); }} onClose={() => setModal(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}