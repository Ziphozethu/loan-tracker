import React, { useState, useEffect, useCallback, useRef } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";

// ── Env vars — set these in .env.local and in Vercel dashboard ────────────────
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY || "";
const ADMIN_PIN       = process.env.REACT_APP_ADMIN_PIN       || "1234";
const VIEWER_PASSWORD = process.env.REACT_APP_VIEWER_PASSWORD || "Zesuliwe";

// ── Supabase REST ─────────────────────────────────────────────────────────────
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

// ── Image compression — shrinks phone photos to ~150KB before upload ──────────
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

// ── Supabase Storage upload — only URL stored in DB, never base64 ─────────────
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

// ── Local storage (non-sensitive only) ───────────────────────────────────────
const ls = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const getSettings  = ()  => ls.get("lt_settings", { rate: 30, type: "compound" });
const saveSettings = (s) => ls.set("lt_settings", s);
const getBalance   = ()  => ls.get("lt_balance", 0);
const saveBalance  = (b) => ls.set("lt_balance", b);

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) =>
  Number(n).toLocaleString("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

const formatPhoneZA = (phone = "") => {
  const d = phone.replace(/\D/g, "");
  if (!d) return phone;
  if (d.startsWith("27") && d.length >= 11)
    return `+27 ${d.slice(2,5)} ${d.slice(5,8)} ${d.slice(8)}`;
  if (d.length === 10 && d.startsWith("0")) {
    const n = d.slice(1);
    return `+27 ${n.slice(0,3)} ${n.slice(3,6)} ${n.slice(6)}`;
  }
  return phone;
};

const monthsBetween = (from, to) => {
  const a = new Date(from), b = new Date(to);
  return Math.max(1, (b.getFullYear()-a.getFullYear())*12 + (b.getMonth()-a.getMonth()));
};
const getPrincipal  = (amount, rate) => amount / (1 + rate / 100);
const calcInterest  = (p, rate, months, type) =>
  months <= 0 ? 0 : type === "simple"
    ? p * (rate/100) * months
    : p * (Math.pow(1 + rate/100, months) - 1);
const daysLeft = (due) => Math.ceil((new Date(due) - new Date()) / 86400000);
const statusLabel = (loan) => {
  if (loan.status === "paid") return { text: "Paid", color: "#16a34a" };
  const d = daysLeft(loan.due_date);
  if (d < 0)   return { text: `Overdue ${Math.abs(d)}d`, color: "#dc2626" };
  if (d === 0) return { text: "Due Today", color: "#ea580c" };
  if (d <= 7)  return { text: `Due in ${d}d`, color: "#d97706" };
  return { text: `${d}d left`, color: "#2563eb" };
};
const buildWhatsAppMessage = (loan) => {
  const due = new Date(loan.due_date).toLocaleDateString("en-ZA", { day:"numeric", month:"long", year:"numeric" });
  return `Dear ${loan.borrower_name},\n\nThis is a formal reminder regarding your outstanding loan of ${fmt(loan.amount)}.\n\nDue Date: ${due}\n\nKindly ensure payment is made on or before the due date to avoid any penalties.\n\nThank you.`;
};

// ── Charts ────────────────────────────────────────────────────────────────────
function PieChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div style={{ textAlign:"center", color:"#7a746c", padding:20, fontSize:13 }}>No data yet</div>;
  let cum = 0;
  const r = 60, cx = 80, cy = 80;
  const slices = data.map((d) => {
    const pct = d.value / total;
    const s = cum; cum += pct;
    const a1 = s*2*Math.PI - Math.PI/2, a2 = cum*2*Math.PI - Math.PI/2;
    const x1 = cx+r*Math.cos(a1), y1 = cy+r*Math.sin(a1);
    const x2 = cx+r*Math.cos(a2), y2 = cy+r*Math.sin(a2);
    const path = pct === 1
      ? `M ${cx} ${cy} m -${r} 0 a ${r} ${r} 0 1 0 ${r*2} 0 a ${r} ${r} 0 1 0 -${r*2} 0`
      : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${pct>.5?1:0} 1 ${x2} ${y2} Z`;
    return { ...d, path, pct };
  });
  return (
    <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
      <svg width={160} height={160} viewBox="0 0 160 160">
        {slices.map((s,i) => <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth={2} />)}
      </svg>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {slices.map((s,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:12, height:12, borderRadius:3, background:s.color, flexShrink:0 }} />
            <span style={{ fontSize:12 }}>{s.label}: <strong>{s.value}</strong> ({Math.round(s.pct*100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function BarChart({ data }) {
  if (!data.length) return <div style={{ textAlign:"center", color:"#7a746c", padding:20, fontSize:13 }}>No data yet</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:110, padding:"0 4px" }}>
      {data.map((d,i) => (
        <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
          <span style={{ fontSize:9, color:"#7a746c" }}>{d.value > 0 ? fmt(d.value).replace("R\u00a0","R").slice(0,6) : ""}</span>
          <div style={{ width:"100%", background:"#1a3a2a", borderRadius:"4px 4px 0 0", height:`${(d.value/max)*72}px`, minHeight:d.value>0?4:0 }} />
          <span style={{ fontSize:9, color:"#7a746c", whiteSpace:"nowrap" }}>{d.label}</span>
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
    --bg:#f5f3ef; --surface:#fff; --border:#e2ddd6; --text:#1a1714; --muted:#7a746c;
    --accent:#1a3a2a; --accent-light:#e8f0eb; --danger:#7f1d1d; --danger-light:#fef2f2;
    --gold:#92722a; --blue:#1d4ed8; --radius:12px;
    --shadow:0 2px 12px rgba(0,0,0,0.07); --shadow-lg:0 8px 32px rgba(0,0,0,0.12);
  }
  html { -webkit-text-size-adjust:100%; }
  body { background:var(--bg); font-family:'DM Sans',sans-serif; color:var(--text); min-height:100vh; overflow-x:hidden; }
  .app { width:100%; max-width:1200px; margin:0 auto; padding:16px 12px 80px; }
  .header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid var(--border); gap:12px; flex-wrap:wrap; }
  .header-left h1 { font-family:'Playfair Display',serif; font-size:22px; color:var(--accent); }
  .header-left p { font-size:12px; color:var(--muted); margin-top:2px; }
  .header-right { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .role-badge { font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; padding:4px 10px; border-radius:20px; background:var(--accent-light); color:var(--accent); }
  .tabs { display:flex; gap:2px; margin-bottom:20px; border-bottom:2px solid var(--border); flex-wrap:wrap; }
  .tab { padding:10px 16px; font-size:13px; font-weight:500; color:var(--muted); cursor:pointer; border:none; background:none; border-bottom:2px solid transparent; margin-bottom:-2px; transition:all 0.15s; white-space:nowrap; font-family:'DM Sans',sans-serif; position:relative; }
  .tab.active { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }
  .tab-badge { position:absolute; top:-6px; right:4px; background:#dc2626; color:#fff; border-radius:50%; width:17px; height:17px; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; }
  .btn { display:inline-flex; align-items:center; gap:6px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; padding:9px 16px; border-radius:8px; border:none; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
  .btn-primary { background:var(--accent); color:#fff; }
  .btn-primary:hover { background:#0f2418; }
  .btn-ghost { background:transparent; color:var(--muted); border:1px solid var(--border); }
  .btn-ghost:hover { background:var(--border); color:var(--text); }
  .btn-danger { background:var(--danger-light); color:var(--danger); border:1px solid #fecaca; }
  .btn-danger:hover { background:#fee2e2; }
  .btn-warning { background:#fff7ed; color:#92400e; border:1px solid #fed7aa; }
  .btn-sm { padding:6px 10px; font-size:12px; }
  .stats { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:20px; }
  .stat-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:16px; position:relative; }
  .stat-card .label { font-size:10px; font-weight:600; letter-spacing:0.8px; text-transform:uppercase; color:var(--muted); margin-bottom:4px; }
  .stat-card .value { font-family:'Playfair Display',serif; font-size:20px; }
  .stat-card .sub { font-size:11px; color:var(--muted); margin-top:4px; }
  .stat-card .edit-btn { position:absolute; top:10px; right:10px; font-size:11px; color:var(--muted); background:none; border:none; cursor:pointer; padding:2px 8px; border-radius:4px; font-family:'DM Sans',sans-serif; }
  .stat-card .edit-btn:hover { background:var(--border); }
  .net-card { background:var(--accent-light); border:2px solid var(--accent)!important; }
  .net-card .label { color:var(--accent)!important; }
  .net-card .value { color:var(--accent); }
  .fin-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:20px; }
  .toolbar { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; align-items:center; }
  .filter-btn { font-size:12px; font-weight:500; padding:6px 12px; border-radius:20px; border:1px solid var(--border); background:var(--surface); color:var(--muted); cursor:pointer; transition:all 0.15s; }
  .filter-btn.active { background:var(--accent); color:#fff; border-color:var(--accent); }
  .search-input { flex:1; min-width:140px; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-family:'DM Sans',sans-serif; font-size:13px; background:var(--surface); color:var(--text); outline:none; }
  .search-input:focus { border-color:var(--accent); }
  .table-wrap { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); overflow-x:auto; box-shadow:var(--shadow); -webkit-overflow-scrolling:touch; }
  table { width:100%; min-width:600px; border-collapse:collapse; }
  th { font-size:10px; font-weight:600; letter-spacing:0.8px; text-transform:uppercase; color:var(--muted); padding:12px 14px; text-align:left; background:#faf9f7; border-bottom:1px solid var(--border); white-space:nowrap; }
  td { padding:10px 14px; font-size:13px; border-bottom:1px solid #f0ece6; vertical-align:middle; }
  tr:last-child td { border-bottom:none; }
  tr:hover td { background:#faf9f7; }
  .name-cell { font-weight:600; font-size:13px; }
  .phone-cell { color:var(--muted); font-size:12px; margin-top:2px; }
  .borrower-photos { display:flex; gap:6px; margin-top:6px; flex-wrap:wrap; }
  .borrower-photo { width:38px; height:38px; border-radius:6px; object-fit:cover; border:1px solid var(--border); cursor:pointer; transition:transform 0.1s; }
  .borrower-photo:hover { transform:scale(1.08); }
  .photo-label { font-size:9px; color:var(--muted); text-align:center; margin-top:2px; }
  .amount-cell { font-family:'Playfair Display',serif; font-size:14px; white-space:nowrap; }
  .status-pill { display:inline-block; font-size:10px; font-weight:600; padding:3px 8px; border-radius:20px; white-space:nowrap; }
  .actions { display:flex; gap:4px; flex-wrap:wrap; }
  .section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
  .section-header h2 { font-family:'Playfair Display',serif; font-size:18px; color:var(--accent); }
  .chart-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:20px; }
  .chart-card h3 { font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.6px; margin-bottom:16px; }
  .charts-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:20px; }
  .profit-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:20px; margin-bottom:20px; }
  .profit-card h2 { font-family:'Playfair Display',serif; font-size:18px; color:var(--accent); margin-bottom:16px; }
  .profit-row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border); }
  .profit-row:last-child { border-bottom:none; }
  .profit-row .plabel { font-size:13px; color:var(--muted); }
  .profit-row .pval { font-family:'Playfair Display',serif; font-size:16px; font-weight:600; }
  .rate-controls { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:16px; padding:14px; background:var(--accent-light); border-radius:10px; }
  .rate-controls label { font-size:12px; font-weight:600; color:var(--accent); }
  .rate-controls input, .rate-controls select { padding:6px 10px; border:1px solid var(--border); border-radius:6px; font-family:'DM Sans',sans-serif; font-size:13px; background:#fff; }
  .overdue-prompt { background:#fff7ed; border:1px solid #fed7aa; border-radius:10px; padding:14px; margin-bottom:16px; }
  .overdue-prompt strong { color:#92400e; display:block; margin-bottom:6px; font-size:14px; }
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index:100; padding:12px; overflow-y:auto; }
  .modal { background:var(--surface); border-radius:16px; width:100%; max-width:500px; box-shadow:var(--shadow-lg); overflow:hidden; margin:auto; }
  .modal-header { padding:18px 20px 14px; border-bottom:1px solid var(--border); }
  .modal-header h2 { font-family:'Playfair Display',serif; font-size:18px; color:var(--accent); }
  .modal-body { padding:18px 20px; display:flex; flex-direction:column; gap:14px; max-height:72vh; overflow-y:auto; }
  .modal-footer { padding:14px 20px 18px; display:flex; gap:8px; justify-content:flex-end; border-top:1px solid var(--border); }
  .form-group { display:flex; flex-direction:column; gap:5px; }
  .form-group label { font-size:11px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:var(--muted); }
  .form-group input, .form-group select { padding:10px 12px; border:1px solid var(--border); border-radius:8px; font-family:'DM Sans',sans-serif; font-size:14px; color:var(--text); background:#fff; outline:none; transition:border 0.15s; width:100%; }
  .form-group input:focus, .form-group select:focus { border-color:var(--accent); }
  .form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .img-upload-box { border:2px dashed var(--border); border-radius:8px; padding:12px; text-align:center; cursor:pointer; transition:border 0.15s; }
  .img-upload-box:hover { border-color:var(--accent); }
  .img-upload-box p { font-size:11px; color:var(--muted); margin-top:4px; }
  .img-preview { width:100%; max-height:120px; object-fit:cover; border-radius:6px; margin-top:6px; }
  .login-wrap { display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px; }
  .login-card { background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:32px 28px; width:100%; max-width:420px; box-shadow:var(--shadow-lg); }
  .login-card h1 { font-family:'Playfair Display',serif; font-size:26px; color:var(--accent); margin-bottom:4px; }
  .login-card > p { color:var(--muted); font-size:13px; margin-bottom:24px; }
  .role-select { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:18px; }
  .role-option { border:2px solid var(--border); border-radius:10px; padding:14px 12px; cursor:pointer; transition:all 0.15s; text-align:center; }
  .role-option.selected { border-color:var(--accent); background:var(--accent-light); }
  .role-option h3 { font-size:13px; font-weight:600; margin-bottom:3px; }
  .role-option p { font-size:11px; color:var(--muted); margin:0; }
  .lightbox { position:fixed; inset:0; background:rgba(0,0,0,0.9); display:flex; align-items:center; justify-content:center; z-index:300; padding:16px; }
  .lightbox img { max-width:100%; max-height:90vh; border-radius:8px; }
  .lightbox-close { position:absolute; top:16px; right:20px; color:#fff; font-size:28px; cursor:pointer; background:none; border:none; }
  .empty { text-align:center; padding:48px 20px; color:var(--muted); }
  .empty h3 { font-family:'Playfair Display',serif; font-size:18px; margin-bottom:6px; color:var(--text); }
  .toast { position:fixed; bottom:20px; right:16px; left:16px; background:var(--accent); color:#fff; padding:12px 18px; border-radius:10px; font-size:13px; font-weight:500; box-shadow:var(--shadow-lg); z-index:200; animation:slideIn 0.2s ease; text-align:center; }
  @keyframes slideIn { from { transform:translateY(20px); opacity:0; } to { transform:translateY(0); opacity:1; } }
  .loading { text-align:center; padding:48px; color:var(--muted); font-size:14px; }
  .info-text { font-size:12px; color:var(--muted); }
  .app-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:16px; margin-bottom:14px; }
  .app-photos { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; }
  .app-photo { width:100%; aspect-ratio:4/3; border-radius:8px; object-fit:cover; border:1px solid var(--border); cursor:pointer; }
  .app-actions { display:flex; gap:8px; margin-top:14px; }
  .apply-wrap { display:flex; justify-content:center; min-height:100vh; padding:20px 16px; background:var(--bg); }
  .apply-card { background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:28px 24px; width:100%; max-width:480px; box-shadow:var(--shadow-lg); height:fit-content; }
  .apply-card h1 { font-family:'Playfair Display',serif; font-size:22px; color:var(--accent); margin-bottom:4px; }
  .apply-card > p { color:var(--muted); font-size:13px; margin-bottom:20px; }
  @media (min-width:768px) {
    .app { padding:24px 20px 80px; }
    .stats { grid-template-columns:repeat(4,1fr); }
    .fin-grid { grid-template-columns:repeat(4,1fr); }
    .stat-card .value { font-size:22px; }
    .header-left h1 { font-size:26px; }
    .toast { left:auto; max-width:380px; text-align:left; }
    .modal-body { max-height:75vh; }
  }
  @media (max-width:520px) {
    .charts-grid { grid-template-columns:1fr; }
    .form-row { grid-template-columns:1fr; }
  }
`;

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [role, setRole] = useState("viewer");
  const [pin, setPin]   = useState("");
  const [err, setErr]   = useState("");
  const go = () => {
    const ok = role === "admin" ? pin === ADMIN_PIN : pin === VIEWER_PASSWORD;
    if (ok) onLogin(role); else setErr("Incorrect password.");
  };
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>LoanTrack</h1>
        <p>Professional Loan Management System</p>
        <div className="role-select">
          <div className={`role-option ${role==="admin"?"selected":""}`} onClick={() => { setRole("admin"); setPin(""); setErr(""); }}>
            <h3>Administrator</h3><p>Full access</p>
          </div>
          <div className={`role-option ${role==="viewer"?"selected":""}`} onClick={() => { setRole("viewer"); setPin(""); setErr(""); }}>
            <h3>Viewer</h3><p>View & remind</p>
          </div>
        </div>
        <div className="form-group" style={{ marginBottom:16 }}>
          <label>{role==="admin" ? "Admin PIN" : "Viewer Password"}</label>
          <input type="password" placeholder="Enter password" value={pin}
            onChange={(e) => { setPin(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key==="Enter" && go()} />
          {err && <span style={{ color:"var(--danger)", fontSize:12 }}>{err}</span>}
        </div>
        <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center" }} onClick={go}>
          Login as {role==="admin" ? "Administrator" : "Viewer"}
        </button>
      </div>
    </div>
  );
}

// ── Image upload box (passes File object up, shows local preview) ─────────────
function ImageUpload({ label, preview, onChange }) {
  const ref = useRef();
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="img-upload-box" onClick={() => ref.current.click()}>
        <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display:"none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f); }} />
        {preview ? <img src={preview} alt="preview" className="img-preview" /> : <p>📷 Tap to capture or upload</p>}
      </div>
    </div>
  );
}

// ── QR Code Modal ─────────────────────────────────────────────────────────────
function QRModal({ onClose }) {
  const applyUrl = `${window.location.origin}/apply`;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(applyUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>📱 Client Application QR</h2></div>
        <div className="modal-body" style={{ alignItems:"center", textAlign:"center" }}>
          <p style={{ fontSize:12, color:"var(--muted)" }}>
            Show or print this QR for your client to scan. They fill in their details and upload their photos directly — no login needed.
          </p>
          <div style={{ padding:16, background:"#fff", borderRadius:12, display:"inline-block", border:"1px solid var(--border)" }}>
            <QRCodeCanvas value={applyUrl} size={200} level="H" includeMargin={false} />
          </div>
          <p style={{ fontSize:11, color:"var(--muted)", wordBreak:"break-all" }}>{applyUrl}</p>
          <button className="btn btn-ghost btn-sm" onClick={copy}>{copied ? "✓ Copied!" : "Copy Link"}</button>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Loan Modal (Add / Edit) ───────────────────────────────────────────────────
function LoanModal({ loan, onSave, onClose, deleteLoan }) {
  const [form, setForm] = useState({
    borrower_name:   loan?.borrower_name   || "",
    phone:           loan?.phone           || "",
    amount:          loan?.amount          || "",
    loan_date:       loan?.loan_date       || new Date().toISOString().split("T")[0],
    due_date:        loan?.due_date        || "",
    notes:           loan?.notes           || "",
    status:          loan?.status          || "active",
    bank_name:       loan?.bank_name       || "",
    account_number:  loan?.account_number  || "",
    residency_place: loan?.residency_place || "",
    image1:          loan?.image1          || "",
    image2:          loan?.image2          || "",
  });
  const [file1, setFile1]       = useState(null);
  const [file2, setFile2]       = useState(null);
  const [prev1, setPrev1]       = useState(loan?.image1 || "");
  const [prev2, setPrev2]       = useState(loan?.image2 || "");
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const handleSave = async () => {
    if (!form.borrower_name.trim()) return setErr("Name required.");
    if (!form.phone.trim())         return setErr("Phone required.");
    if (!form.amount)               return setErr("Amount required.");
    if (!form.due_date)             return setErr("Due date required.");
    setSaving(true); setErr("");
    try {
      const data   = { ...form };
      const folder = loan?.id ? `loan-${loan.id}` : `loan-new-${Date.now()}`;
      if (file1) data.image1 = await uploadImage(file1, folder, "photo1");
      if (file2) data.image2 = await uploadImage(file2, folder, "photo2");
      await onSave(data);
      onClose();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>{loan ? "Edit Loan" : "Add Loan"}</h2></div>
        <div className="modal-body">
          <div className="form-group">
            <label>Borrower Name</label>
            <input value={form.borrower_name} onChange={(e) => set("borrower_name", e.target.value)} placeholder="Full name" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0812345678" />
            </div>
            <div className="form-group">
              <label>Amount (ZAR)</label>
              <input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Loan Date</label>
              <input type="date" value={form.loan_date} onChange={(e) => set("loan_date", e.target.value)} />
            </div>
            <div className="form-group">
              <label>Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Bank Name</label>
              <input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="e.g. Capitec" />
            </div>
            <div className="form-group">
              <label>Account Number</label>
              <input value={form.account_number} onChange={(e) => set("account_number", e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Residency / Area</label>
            <input value={form.residency_place} onChange={(e) => set("residency_place", e.target.value)} placeholder="Town or area" />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="active">Active</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div className="form-row">
            <ImageUpload label="📸 Selfie / Profile"
              preview={prev1}
              onChange={(f) => { setFile1(f); setPrev1(URL.createObjectURL(f)); }} />
            <ImageUpload label="🪪 Student Card"
              preview={prev2}
              onChange={(f) => { setFile2(f); setPrev2(URL.createObjectURL(f)); }} />
          </div>
          <p style={{ fontSize:11, color:"var(--muted)" }}>Photos are compressed and stored securely. Only URLs saved in database.</p>
          {err && <p style={{ color:"var(--danger)", fontSize:13 }}>{err}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {loan && (
            <button className="btn btn-danger" onClick={() => { onClose(); deleteLoan(loan); }}>Delete</button>
          )}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onClose, confirmLabel="Confirm", confirmClass="btn-danger" }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Confirm</h2></div>
        <div className="modal-body"><p style={{ fontSize:14 }}>{message}</p></div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`btn ${confirmClass}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Liability Modal ───────────────────────────────────────────────────────────
function LiabilityModal({ liab, onSave, onClose }) {
  const [form, setForm] = useState({ name:liab?.name||"", amount:liab?.amount||"", team_member:liab?.team_member||"" });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));
  const go = async () => {
    if (!form.name.trim() || !form.amount) return;
    setSaving(true);
    await onSave(form);
    onClose();
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>{liab ? "Edit Liability" : "Add Liability"}</h2></div>
        <div className="modal-body">
          <div className="form-group"><label>Name</label><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Person or company" /></div>
          <div className="form-group"><label>Amount (ZAR)</label><input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></div>
          <div className="form-group"><label>Team Member</label><input value={form.team_member} onChange={(e) => set("team_member", e.target.value)} /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={go} disabled={saving}>{saving?"Saving…":"Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Pending Application Card ──────────────────────────────────────────────────
function PendingCard({ app, onApprove, onReject }) {
  const [lb, setLb] = useState(null);
  return (
    <>
      <div className="app-card">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <h3 style={{ fontSize:15, fontWeight:600 }}>{app.borrower_name}</h3>
            <p style={{ fontSize:12, color:"var(--muted)", marginTop:2 }}>{app.phone}</p>
          </div>
          <span className="status-pill" style={{ background:"#fef3c7", color:"#92400e" }}>Pending</span>
        </div>
        <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid var(--border)", fontSize:12, lineHeight:1.7 }}>
          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <span style={{ color:"var(--muted)" }}>Amount:</span>
            <strong style={{ fontFamily:"'Playfair Display',serif" }}>{fmt(app.amount)}</strong>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <span style={{ color:"var(--muted)" }}>Due:</span>
            <span>{new Date(app.due_date).toLocaleDateString("en-ZA")}</span>
          </div>
          {app.bank_name && <div style={{ display:"flex", justifyContent:"space-between" }}>
            <span style={{ color:"var(--muted)" }}>Bank:</span><span>{app.bank_name}</span>
          </div>}
          {app.account_number && <div style={{ display:"flex", justifyContent:"space-between" }}>
            <span style={{ color:"var(--muted)" }}>Account:</span><span>{app.account_number}</span>
          </div>}
          {app.residency_place && <div style={{ display:"flex", justifyContent:"space-between" }}>
            <span style={{ color:"var(--muted)" }}>Area:</span><span>{app.residency_place}</span>
          </div>}
        </div>
        {(app.image1 || app.image2) && (
          <div className="app-photos">
            {app.image1 && <img src={app.image1} alt="Selfie" className="app-photo" onClick={() => setLb(app.image1)} />}
            {app.image2 && <img src={app.image2} alt="Card"   className="app-photo" onClick={() => setLb(app.image2)} />}
          </div>
        )}
        <div className="app-actions">
          <button className="btn btn-primary" style={{ flex:1 }} onClick={() => onApprove(app)}>✅ Accept</button>
          <button className="btn btn-danger"  style={{ flex:1 }} onClick={() => onReject(app.id)}>❌ Reject</button>
        </div>
      </div>
      {lb && <div className="lightbox" onClick={() => setLb(null)}>
        <button className="lightbox-close" onClick={() => setLb(null)}>✕</button>
        <img src={lb} alt="Full size" />
      </div>}
    </>
  );
}

// ── Client Application Form (PUBLIC — no login) ───────────────────────────────
function ApplicationForm() {
  const [form, setForm] = useState({
    borrower_name:"", phone:"", residency_place:"",
    bank_name:"", account_number:"", amount:"", due_date:"",
  });
  const [file1, setFile1]   = useState(null);
  const [file2, setFile2]   = useState(null);
  const [prev1, setPrev1]   = useState("");
  const [prev2, setPrev2]   = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");
  const [done, setDone]       = useState(false);

  const handleImg = (slot, file) => {
    const url = URL.createObjectURL(file);
    if (slot===1) { setFile1(file); setPrev1(url); }
    else          { setFile2(file); setPrev2(url); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.borrower_name||!form.phone||!form.amount||!form.due_date)
      return setErr("Please fill all required fields.");
    if (!file1||!file2)
      return setErr("Please take both a selfie and a student card photo.");
    setLoading(true); setErr("");
    try {
      const folder = `apply-${Date.now()}`;
      const [url1, url2] = await Promise.all([
        uploadImage(file1, folder, "selfie"),
        uploadImage(file2, folder, "card"),
      ]);
      await sb("POST", "/pending_applications", {
        ...form, amount:Number(form.amount),
        image1:url1, image2:url2, status:"pending",
      });
      setDone(true);
    } catch (e) { setErr("Submission failed: " + e.message); }
    setLoading(false);
  };

  if (done) return (
    <div className="apply-wrap">
      <div className="apply-card" style={{ textAlign:"center", padding:"48px 24px" }}>
        <div style={{ fontSize:52, marginBottom:12 }}>✅</div>
        <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:"var(--accent)", marginBottom:8 }}>Application Submitted!</h1>
        <p style={{ color:"var(--muted)" }}>Your application has been received. We will contact you on WhatsApp shortly.</p>
      </div>
    </div>
  );

  return (
    <div className="apply-wrap">
      <div className="apply-card">
        <h1>Loan Application</h1>
        <p>Fill in your details below. Your information is sent securely to our team.</p>
        <form onSubmit={submit}>
          <div className="form-group" style={{ marginBottom:14 }}>
            <label>Full Name *</label>
            <input placeholder="Your full name" value={form.borrower_name} onChange={(e) => setForm({...form, borrower_name:e.target.value})} />
          </div>
          <div className="form-group" style={{ marginBottom:14 }}>
            <label>WhatsApp Number *</label>
            <input type="tel" placeholder="0812345678" value={form.phone} onChange={(e) => setForm({...form, phone:e.target.value})} />
          </div>
          <div className="form-group" style={{ marginBottom:14 }}>
            <label>Residency / Area</label>
            <input placeholder="Your town or area" value={form.residency_place} onChange={(e) => setForm({...form, residency_place:e.target.value})} />
          </div>
          <div className="form-row" style={{ marginBottom:14 }}>
            <div className="form-group">
              <label>Bank Name</label>
              <input placeholder="e.g. Capitec" value={form.bank_name} onChange={(e) => setForm({...form, bank_name:e.target.value})} />
            </div>
            <div className="form-group">
              <label>Account Number</label>
              <input value={form.account_number} onChange={(e) => setForm({...form, account_number:e.target.value})} />
            </div>
          </div>
          <div className="form-row" style={{ marginBottom:14 }}>
            <div className="form-group">
              <label>Loan Amount (ZAR) *</label>
              <input type="number" placeholder="5000" value={form.amount} onChange={(e) => setForm({...form, amount:e.target.value})} />
            </div>
            <div className="form-group">
              <label>Repayment Date *</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({...form, due_date:e.target.value})} />
            </div>
          </div>
          <div className="form-row" style={{ marginBottom:14 }}>
            <ImageUpload label="📸 Selfie *"       preview={prev1} onChange={(f) => handleImg(1,f)} />
            <ImageUpload label="🪪 Student Card *" preview={prev2} onChange={(f) => handleImg(2,f)} />
          </div>
          {err && <div style={{ color:"var(--danger)", fontSize:12, padding:10, background:"var(--danger-light)", borderRadius:8, marginBottom:12 }}>{err}</div>}
          <button type="submit" className="btn btn-primary" style={{ width:"100%", justifyContent:"center" }} disabled={loading}>
            {loading ? "Uploading & Submitting…" : "Submit Application"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
function MainApp({ role, onLogout }) {
  const [tab, setTab]           = useState("loans");
  const [loans, setLoans]       = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [pending, setPending]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState("all");
  const [search, setSearch]     = useState("");
  const [modal, setModal]       = useState(null);   // "add"|"edit"|"confirm"|"liability"|"qr"
  const [editLoan, setEditLoan] = useState(null);
  const [editLiab, setEditLiab] = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const [toast, setToast]       = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [balance, setBalance]   = useState(getBalance());
  const [settings, setSettings] = useState(getSettings());
  const [overduePrompt, setOverduePrompt] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3200); };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [l, li, p] = await Promise.all([
        sb("GET", "/loans?order=created_at.desc"),
        sb("GET", "/liabilities?order=created_at.desc").catch(() => []),
        sb("GET", "/pending_applications?status=eq.pending&order=created_at.desc").catch(() => []),
      ]);
      setLoans(Array.isArray(l) ? l : []);
      setLiabilities(Array.isArray(li) ? li : []);
      setPending(Array.isArray(p) ? p : []);
    } catch (e) { showToast("Load error: " + e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!loans.length) return;
    const ol = loans.find(l => l.status==="active" && daysLeft(l.due_date)<-28 && !l.interest_prompted);
    if (ol && !overduePrompt) setOverduePrompt(ol);
  }, [loans, overduePrompt]);

  const { rate, type } = settings;
  const active   = loans.filter(l => l.status==="active");
  const paid     = loans.filter(l => l.status==="paid");
  const overdue  = active.filter(l => daysLeft(l.due_date)<0);
  const totalOut = active.reduce((s,l) => s+Number(l.amount), 0);
  const totalInv = active.reduce((s,l) => s+getPrincipal(Number(l.amount),rate), 0);
  const totalLib = liabilities.reduce((s,l) => s+Number(l.amount), 0);
  const netPos   = balance + totalOut - totalLib;
  const totalInt = active.reduce((s,l) => {
    const p = getPrincipal(Number(l.amount), rate);
    const m = monthsBetween(l.loan_date||l.created_at, l.due_date);
    return s + calcInterest(p, rate, m, type);
  }, 0);

  const pieData = [
    { label:"Active",  value:active.length-overdue.length, color:"#2563eb" },
    { label:"Overdue", value:overdue.length,               color:"#dc2626" },
    { label:"Paid",    value:paid.length,                  color:"#16a34a" },
  ].filter(d => d.value>0);

  const now = new Date();
  const barData = Array.from({ length:6 }, (_,i) => {
    const d = new Date(now.getFullYear(), now.getMonth()-(5-i), 1);
    const value = paid.filter(l => {
      const pd = new Date(l.updated_at||l.created_at);
      return pd.getMonth()===d.getMonth() && pd.getFullYear()===d.getFullYear();
    }).reduce((s,l) => s+Number(l.amount), 0);
    return { label:d.toLocaleDateString("en-ZA",{month:"short"}), value };
  });

  const filtered = loans.filter(l => {
    const mf = filter==="all" ? true
      : filter==="active"  ? l.status==="active"
      : filter==="overdue" ? (l.status==="active" && daysLeft(l.due_date)<0)
      : l.status==="paid";
    const ms = (l.borrower_name||"").toLowerCase().includes(search.toLowerCase())
            || (l.phone||"").includes(search);
    return mf && ms;
  });

  const saveLoan = async (form) => {
    if (editLoan) {
      await sb("PATCH", `/loans?id=eq.${editLoan.id}`, form);
      showToast("Loan updated.");
    } else {
      await sb("POST", "/loans", form);
      const p = getPrincipal(Number(form.amount), rate);
      const nb = balance - p; setBalance(nb); saveBalance(nb);
      showToast(`Loan added. Balance reduced by ${fmt(p)}.`);
    }
    await fetchAll(); setEditLoan(null);
  };

  const deleteLoan = (loan) => {
    setConfirmData({
      message: `Delete loan for ${loan.borrower_name}? Cannot be undone.`,
      onConfirm: async () => {
        setLoans(prev => prev.filter(l => l.id!==loan.id));
        setModal(null);
        try { await sb("DELETE", `/loans?id=eq.${loan.id}`); showToast("Deleted."); }
        catch { showToast("Delete failed."); await fetchAll(); }
      },
    });
    setModal("confirm");
  };

  const markPaid = (loan) => {
    setConfirmData({
      message: `Mark ${loan.borrower_name}'s loan of ${fmt(loan.amount)} as paid?`,
      confirmLabel:"Mark as Paid", confirmClass:"btn-primary",
      onConfirm: async () => {
        await sb("PATCH", `/loans?id=eq.${loan.id}`, { status:"paid" });
        const nb = balance+Number(loan.amount); setBalance(nb); saveBalance(nb);
        showToast(`${fmt(loan.amount)} added to balance.`);
        await fetchAll(); setModal(null);
      },
    });
    setModal("confirm");
  };

  const approvePending = (app) => {
    setConfirmData({
      message: `Approve loan for ${app.borrower_name} — ${fmt(app.amount)}?`,
      confirmLabel:"Approve", confirmClass:"btn-primary",
      onConfirm: async () => {
        try {
          await sb("POST", "/loans", {
            borrower_name:app.borrower_name, phone:app.phone,
            amount:app.amount, loan_date:new Date().toISOString().split("T")[0],
            due_date:app.due_date, notes:"Via QR application", status:"active",
            bank_name:app.bank_name, account_number:app.account_number,
            residency_place:app.residency_place, image1:app.image1, image2:app.image2,
          });
          await sb("PATCH", `/pending_applications?id=eq.${app.id}`, { status:"approved" });
          const p = getPrincipal(app.amount, rate);
          const nb = balance-p; setBalance(nb); saveBalance(nb);
          await fetchAll(); setModal(null);
          showToast("Approved and added to loans!");
        } catch(e) { showToast("Failed: "+e.message); }
      },
    });
    setModal("confirm");
  };

  const rejectPending = (appId) => {
    setConfirmData({
      message:"Reject this application? Cannot be undone.",
      confirmLabel:"Reject", confirmClass:"btn-danger",
      onConfirm: async () => {
        try {
          await sb("DELETE", `/pending_applications?id=eq.${appId}`);
          await fetchAll(); setModal(null); showToast("Rejected.");
        } catch(e) { showToast("Failed: "+e.message); }
      },
    });
    setModal("confirm");
  };

  const applyInterest = async (loan, apply) => {
    if (apply) {
      const months = Math.max(1, Math.abs(Math.floor(daysLeft(loan.due_date)/30)));
      const p = getPrincipal(Number(loan.amount), rate);
      const na = Math.round(p * Math.pow(1+rate/100, months));
      await sb("PATCH", `/loans?id=eq.${loan.id}`, { amount:na, interest_prompted:true });
      showToast(`Interest applied. New: ${fmt(na)}`);
    } else {
      await sb("PATCH", `/loans?id=eq.${loan.id}`, { interest_prompted:true });
      showToast("Kept as is.");
    }
    setOverduePrompt(null); await fetchAll();
  };

  const sendReminder = (loan) => {
    const msg = buildWhatsAppMessage(loan);
    const ph  = (loan.phone||"").replace(/\D/g,"");
    const num = ph.startsWith("27") ? ph : ph.startsWith("0") ? "27"+ph.slice(1) : ph;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const saveLiability = async (form) => {
    if (editLiab) { await sb("PATCH", `/liabilities?id=eq.${editLiab.id}`, form); showToast("Updated."); }
    else          { await sb("POST",  "/liabilities", form); showToast("Added."); }
    await fetchAll(); setEditLiab(null);
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
          {role==="admin" && tab==="loans" && <>
            <button className="btn btn-ghost btn-sm" onClick={() => setModal("qr")}>📱 Client QR</button>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditLoan(null); setModal("add"); }}>+ Add Loan</button>
          </>}
          {role==="admin" && tab==="liabilities" &&
            <button className="btn btn-primary btn-sm" onClick={() => { setEditLiab(null); setModal("liability"); }}>+ Add Liability</button>}
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>Logout</button>
        </div>
      </div>

      {/* Overdue prompt */}
      {overduePrompt && role==="admin" && (
        <div className="overdue-prompt">
          <strong>⚠️ Overdue: {overduePrompt.borrower_name}</strong>
          <p style={{ fontSize:12, margin:"4px 0 10px" }}>
            {fmt(overduePrompt.amount)} overdue by {Math.abs(daysLeft(overduePrompt.due_date))} days. Apply {rate}% {type} interest?
          </p>
          <div style={{ display:"flex", gap:8 }}>
            <button className="btn btn-sm btn-warning" onClick={() => applyInterest(overduePrompt, true)}>Apply Interest</button>
            <button className="btn btn-sm btn-ghost"   onClick={() => applyInterest(overduePrompt, false)}>Skip</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab==="loans"?"active":""}`}       onClick={() => setTab("loans")}>💰 Loans ({loans.length})</button>
        <button className={`tab ${tab==="pending"?"active":""}`}     onClick={() => setTab("pending")}>
          📥 Applications {pending.length>0 && <span className="tab-badge">{pending.length}</span>}
        </button>
        <button className={`tab ${tab==="liabilities"?"active":""}`} onClick={() => setTab("liabilities")}>📊 Liabilities</button>
        <button className={`tab ${tab==="finance"?"active":""}`}     onClick={() => setTab("finance")}>📈 Finance</button>
      </div>

      {/* ── LOANS TAB ── */}
      {tab==="loans" && (
        <>
          <div className="stats">
            <div className="stat-card"><div className="label">Active</div><div className="value">{active.length}</div><div className="sub">{fmt(totalOut)} out</div></div>
            <div className="stat-card"><div className="label">Overdue</div><div className="value" style={{ color:"#dc2626" }}>{overdue.length}</div></div>
            <div className="stat-card"><div className="label">Paid</div><div className="value" style={{ color:"#16a34a" }}>{paid.length}</div></div>
            <div className="stat-card net-card"><div className="label">Net Position</div><div className="value">{fmt(netPos)}</div></div>
          </div>
          <div className="toolbar">
            {["all","active","overdue","paid"].map(f => (
              <button key={f} className={`filter-btn ${filter===f?"active":""}`} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase()+f.slice(1)}
              </button>
            ))}
            <input className="search-input" placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="table-wrap">
            {loading ? <div className="loading">Loading…</div> : (
              <table>
                <thead>
                  <tr>
                    <th>Borrower</th>
                    <th>Amount</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length===0
                    ? <tr><td colSpan="5" style={{ textAlign:"center", color:"var(--muted)", padding:32 }}>No loans found</td></tr>
                    : filtered.map(l => {
                        const s = statusLabel(l);
                        return (
                          <tr key={l.id}>
                            <td>
                              <div className="name-cell">{l.borrower_name}</div>
                              <div className="phone-cell">{formatPhoneZA(l.phone)}</div>
                              {(l.image1||l.image2) && (
                                <div className="borrower-photos">
                                  {l.image1 && (
                                    <div>
                                      <img src={l.image1} alt="Selfie" className="borrower-photo" onClick={() => setLightbox(l.image1)} />
                                      <div className="photo-label">Selfie</div>
                                    </div>
                                  )}
                                  {l.image2 && (
                                    <div>
                                      <img src={l.image2} alt="Card" className="borrower-photo" onClick={() => setLightbox(l.image2)} />
                                      <div className="photo-label">Card</div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="amount-cell">{fmt(l.amount)}</td>
                            <td style={{ whiteSpace:"nowrap", color:"var(--muted)" }}>{new Date(l.due_date).toLocaleDateString("en-ZA",{day:"numeric",month:"short",year:"numeric"})}</td>
                            <td><span className="status-pill" style={{ background:s.color+"20", color:s.color }}>{s.text}</span></td>
                            <td>
                              <div className="actions">
                                {l.status==="active" && <>
                                  <button className="btn btn-sm btn-primary" onClick={() => markPaid(l)}>✓ Paid</button>
                                  <button className="btn btn-sm btn-ghost"   onClick={() => sendReminder(l)}>💬</button>
                                </>}
                                {role==="admin" && (
                                  <button className="btn btn-sm btn-ghost" onClick={() => { setEditLoan(l); setModal("edit"); }}>✏️</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                  }
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── PENDING TAB ── */}
      {tab==="pending" && (
        <>
          <div className="section-header"><h2>Pending Applications</h2></div>
          {loading ? <div className="loading">Loading…</div>
          : pending.length===0
            ? <div className="empty"><h3>No pending applications</h3><p>Client QR submissions appear here for review.</p></div>
            : pending.map(app => (
                <PendingCard key={app.id} app={app} onApprove={approvePending} onReject={rejectPending} />
              ))
          }
        </>
      )}

      {/* ── LIABILITIES TAB ── */}
      {tab==="liabilities" && (
        <>
          <div className="stat-card" style={{ marginBottom:16 }}>
            <div className="label">Total Liabilities</div>
            <div className="value" style={{ color:"#dc2626" }}>{fmt(totalLib)}</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Amount</th><th>Team Member</th>{role==="admin"&&<th>Actions</th>}</tr></thead>
              <tbody>
                {liabilities.length===0
                  ? <tr><td colSpan="4" style={{ textAlign:"center", color:"var(--muted)", padding:32 }}>No liabilities</td></tr>
                  : liabilities.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontWeight:600 }}>{l.name}</td>
                      <td className="amount-cell">{fmt(l.amount)}</td>
                      <td style={{ color:"var(--muted)" }}>{l.team_member||"—"}</td>
                      {role==="admin" && <td>
                        <div className="actions">
                          <button className="btn btn-sm btn-ghost" onClick={() => { setEditLiab(l); setModal("liability"); }}>✏️ Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => {
                            setConfirmData({ message:`Delete liability for ${l.name}?`, onConfirm: async () => {
                              await sb("DELETE", `/liabilities?id=eq.${l.id}`);
                              showToast("Deleted."); await fetchAll(); setModal(null);
                            }});
                            setModal("confirm");
                          }}>Del</button>
                        </div>
                      </td>}
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── FINANCE TAB ── */}
      {tab==="finance" && (
        <>
          <div className="profit-card">
            <h2>Financial Summary</h2>
            <div className="profit-row"><span className="plabel">Cash Balance</span><span className="pval" style={{ color:"var(--gold)" }}>{fmt(balance)}</span></div>
            <div className="profit-row"><span className="plabel">Total Outstanding</span><span className="pval">{fmt(totalOut)}</span></div>
            <div className="profit-row"><span className="plabel">Principal Invested</span><span className="pval" style={{ color:"var(--blue)" }}>{fmt(totalInv)}</span></div>
            <div className="profit-row"><span className="plabel">Estimated Interest</span><span className="pval" style={{ color:"var(--gold)" }}>{fmt(totalInt)}</span></div>
            <div className="profit-row"><span className="plabel">Total Liabilities</span><span className="pval" style={{ color:"#dc2626" }}>-{fmt(totalLib)}</span></div>
            <div className="profit-row">
              <span className="plabel" style={{ fontWeight:600, fontSize:14 }}>Net Position</span>
              <span className="pval" style={{ fontSize:18, color:netPos>=0?"#16a34a":"#dc2626" }}>{fmt(netPos)}</span>
            </div>
          </div>
          {role==="admin" && (
            <div className="rate-controls">
              <label>Rate (%/month)</label>
              <input type="number" value={rate} style={{ width:70 }}
                onChange={(e) => { const s={...settings,rate:Number(e.target.value)}; setSettings(s); saveSettings(s); }} />
              <label>Type</label>
              <select value={type} onChange={(e) => { const s={...settings,type:e.target.value}; setSettings(s); saveSettings(s); }}>
                <option value="simple">Simple</option>
                <option value="compound">Compound</option>
              </select>
            </div>
          )}
          <div className="charts-grid">
            <div className="chart-card"><h3>Loan Status</h3><PieChart data={pieData} /></div>
            <div className="chart-card"><h3>Monthly Collections</h3><BarChart data={barData} /></div>
          </div>
        </>
      )}

      {/* Modals */}
      {(modal==="add"||modal==="edit") && (
        <LoanModal
          loan={modal==="edit" ? editLoan : null}
          onSave={saveLoan}
          onClose={() => { setModal(null); setEditLoan(null); }}
          deleteLoan={deleteLoan}
        />
      )}
      {modal==="confirm" && confirmData && (
        <ConfirmModal
          message={confirmData.message}
          confirmLabel={confirmData.confirmLabel}
          confirmClass={confirmData.confirmClass}
          onConfirm={async () => { await confirmData.onConfirm(); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal==="liability" && (
        <LiabilityModal liab={editLiab} onSave={saveLiability} onClose={() => { setModal(null); setEditLiab(null); }} />
      )}
      {modal==="qr" && <QRModal onClose={() => setModal(null)} />}

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button className="lightbox-close" onClick={() => setLightbox(null)}>✕</button>
          <img src={lightbox} alt="Full size" />
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ── Router — /apply is PUBLIC, dashboard requires login ───────────────────────
function AppRouter() {
  const [role, setRole] = useState(null);
  return (
    <Router>
      <Routes>
        {/* Public: clients scan QR and land here — no login */}
        <Route path="/apply" element={<><style>{css}</style><ApplicationForm /></>} />
        {/* Protected dashboard */}
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