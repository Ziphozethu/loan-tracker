import React, { useState, useEffect, useCallback } from "react";

// ── Supabase config ──────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "https://fdsqwpgwhcpceiptamfy.supabase.co";
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY || "sb_publishable_umuFeOvqGzD1PJCFAWLjNQ_NKK78-Aj";

async function supabase(method, path, body) {
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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  if (method === "DELETE" || method === "PATCH") return true;
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// ── Passwords (stored in localStorage so admin can change them) ───────────────
const getPasswords = () => {
  try {
    const stored = localStorage.getItem("loantrack_passwords");
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return { admin: "1234", viewer: "Zesuliwe" };
};

const savePasswords = (passwords) => {
  localStorage.setItem("loantrack_passwords", JSON.stringify(passwords));
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) =>
  Number(n).toLocaleString("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

const formatPhoneZA = (phone) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("27") && digits.length >= 11) {
    return `+27 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    const noZero = digits.slice(1);
    return `+27 ${noZero.slice(0, 3)} ${noZero.slice(3, 6)} ${noZero.slice(6)}`;
  }
  return phone;
};

const daysLeft = (due) => {
  const diff = new Date(due) - new Date();
  return Math.ceil(diff / 86400000);
};

const statusLabel = (loan) => {
  if (loan.status === "paid") return { text: "Paid", color: "#16a34a" };
  const d = daysLeft(loan.due_date);
  if (d < 0) return { text: `Overdue ${Math.abs(d)}d`, color: "#dc2626" };
  if (d === 0) return { text: "Due Today", color: "#ea580c" };
  if (d <= 7) return { text: `Due in ${d}d`, color: "#d97706" };
  return { text: `${d}d left`, color: "#2563eb" };
};

function buildWhatsAppMessage(loan) {
  const due = new Date(loan.due_date).toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  });
  return (
    `Dear ${loan.borrower_name},\n\n` +
    `This is a formal reminder regarding your outstanding loan of ${fmt(loan.amount)}.\n\n` +
    `Due Date: ${due}\n` +
    (loan.notes ? `Reference: ${loan.notes}\n\n` : "\n") +
    `Kindly ensure payment is made on or before the due date to avoid any penalties.\n\n` +
    `Thank you for your prompt attention to this matter.`
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #f5f3ef;
    --surface: #ffffff;
    --border: #e2ddd6;
    --text: #1a1714;
    --muted: #7a746c;
    --accent: #1a3a2a;
    --accent-light: #e8f0eb;
    --danger: #7f1d1d;
    --danger-light: #fef2f2;
    --gold: #92722a;
    --radius: 12px;
    --shadow: 0 2px 12px rgba(0,0,0,0.07);
    --shadow-lg: 0 8px 32px rgba(0,0,0,0.12);
  }

  html { -webkit-text-size-adjust: 100%; }
  body { background: var(--bg); font-family: 'DM Sans', sans-serif; color: var(--text); min-height: 100vh; overflow-x: hidden; }

  .app { width: 100%; max-width: 1200px; margin: 0 auto; padding: 16px 12px 60px; overflow-x: auto; }

  /* Header */
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); gap: 12px; flex-wrap: wrap; }
  .header-left h1 { font-family: 'Playfair Display', serif; font-size: 22px; color: var(--accent); letter-spacing: -0.5px; }
  .header-left p { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .header-right { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .role-badge { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; background: var(--accent-light); color: var(--accent); white-space: nowrap; }

  /* Buttons */
  .btn { display: inline-flex; align-items: center; gap: 6px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: #0f2418; }
  .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  .btn-ghost:hover { background: var(--border); color: var(--text); }
  .btn-danger { background: var(--danger-light); color: var(--danger); border: 1px solid #fecaca; }
  .btn-danger:hover { background: #fee2e2; }
  .btn-sm { padding: 6px 10px; font-size: 12px; }

  /* Stats */
  .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
  .stat-card .label { font-size: 10px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
  .stat-card .value { font-family: 'Playfair Display', serif; font-size: 20px; color: var(--text); }
  .stat-card .value.danger { color: var(--danger); }
  .stat-card .value.gold { color: var(--gold); }

  /* Filters */
  .toolbar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .filter-btn { font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; transition: all 0.15s; }
  .filter-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .search-input { flex: 1; min-width: 140px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 13px; background: var(--surface); color: var(--text); outline: none; }
  .search-input:focus { border-color: var(--accent); }

  /* Table wrapper — scrollable on mobile */
  .table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow-x: auto; overflow-y: visible; box-shadow: var(--shadow); -webkit-overflow-scrolling: touch; }
  table { width: 100%; min-width: 700px; border-collapse: collapse; }
  th { font-size: 10px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: var(--muted); padding: 12px 14px; text-align: left; background: #faf9f7; border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 12px 14px; font-size: 13px; border-bottom: 1px solid #f0ece6; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #faf9f7; }
  .name-cell { font-weight: 600; color: var(--text); font-size: 13px; }
  .phone-cell { color: var(--muted); font-size: 12px; }
  .amount-cell { font-family: 'Playfair Display', serif; font-size: 14px; white-space: nowrap; }
  .status-pill { display: inline-block; font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 20px; white-space: nowrap; }
  .actions { display: flex; gap: 4px; flex-wrap: wrap; }

  /* Borrower photos in table */
  .borrower-photos { display: flex; gap: 4px; margin-top: 6px; }
  .borrower-photo { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border); cursor: pointer; }

  /* Lightbox */
  .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 300; padding: 16px; }
  .lightbox img { max-width: 100%; max-height: 90vh; border-radius: 8px; }
  .lightbox-close { position: absolute; top: 16px; right: 20px; color: #fff; font-size: 28px; cursor: pointer; background: none; border: none; }

  /* Modal */
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 12px; overflow-y: auto; }
  .modal { background: var(--surface); border-radius: 16px; width: 100%; max-width: 500px; box-shadow: var(--shadow-lg); overflow: hidden; margin: auto; }
  .modal-header { padding: 18px 20px 14px; border-bottom: 1px solid var(--border); }
  .modal-header h2 { font-family: 'Playfair Display', serif; font-size: 18px; color: var(--accent); }
  .modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; max-height: 70vh; overflow-y: auto; }
  .modal-footer { padding: 14px 20px 18px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--border); }

  /* Form */
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-group label { font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: var(--muted); }
  .form-group input, .form-group textarea, .form-group select { padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 14px; color: var(--text); background: var(--surface); outline: none; transition: border 0.15s; width: 100%; }
  .form-group input:focus, .form-group textarea:focus, .form-group select:focus { border-color: var(--accent); }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  /* Image upload */
  .img-upload-box { border: 2px dashed var(--border); border-radius: 8px; padding: 12px; text-align: center; cursor: pointer; transition: border 0.15s; }
  .img-upload-box:hover { border-color: var(--accent); }
  .img-upload-box input { display: none; }
  .img-upload-box p { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .img-preview { width: 100%; max-height: 140px; object-fit: cover; border-radius: 6px; margin-top: 8px; }

  /* Login */
  .login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
  .login-card { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 32px 28px; width: 100%; max-width: 420px; box-shadow: var(--shadow-lg); }
  .login-card h1 { font-family: 'Playfair Display', serif; font-size: 26px; color: var(--accent); margin-bottom: 4px; }
  .login-card > p { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
  .role-select { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
  .role-option { border: 2px solid var(--border); border-radius: 10px; padding: 14px 12px; cursor: pointer; transition: all 0.15s; text-align: center; }
  .role-option.selected { border-color: var(--accent); background: var(--accent-light); }
  .role-option h3 { font-size: 13px; font-weight: 600; margin-bottom: 3px; }
  .role-option p { font-size: 11px; color: var(--muted); margin: 0; }

  /* Empty */
  .empty { text-align: center; padding: 48px 20px; color: var(--muted); }
  .empty h3 { font-family: 'Playfair Display', serif; font-size: 18px; margin-bottom: 6px; color: var(--text); }

  /* Toast */
  .toast { position: fixed; bottom: 20px; right: 16px; left: 16px; background: var(--accent); color: #fff; padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 500; box-shadow: var(--shadow-lg); z-index: 200; animation: slideIn 0.2s ease; text-align: center; }
  @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .loading { text-align: center; padding: 48px; color: var(--muted); font-size: 14px; }

  /* Settings modal */
  .settings-section { border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
  .settings-section h3 { font-size: 13px; font-weight: 600; margin-bottom: 12px; color: var(--accent); }

  /* Desktop enhancements */
  @media (min-width: 768px) {
    .app { padding: 24px 20px 60px; }
    .stats { grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
    .stat-card .value { font-size: 24px; }
    .header-left h1 { font-size: 26px; }
    .toast { left: auto; max-width: 360px; text-align: left; }
    .modal-body { max-height: 75vh; }
  }
`;

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [role, setRole] = useState("viewer");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    const passwords = getPasswords();
    if (role === "admin") {
      if (pin === passwords.admin) {
        onLogin("admin");
      } else {
        setError("Incorrect PIN. Please try again.");
      }
    } else {
      if (pin === passwords.viewer) {
        onLogin("viewer");
      } else {
        setError("Incorrect viewer password. Please try again.");
      }
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>LoanTrack</h1>
        <p>Professional Loan Management System</p>

        <div className="role-select">
          <div className={`role-option ${role === "admin" ? "selected" : ""}`} onClick={() => { setRole("admin"); setPin(""); setError(""); }}>
            <h3>Administrator</h3>
            <p>Full access — add, edit, delete, manage all loans</p>
          </div>
          <div className={`role-option ${role === "viewer" ? "selected" : ""}`} onClick={() => { setRole("viewer"); setPin(""); setError(""); }}>
            <h3>Viewer</h3>
            <p>View loans, mark paid, send reminders</p>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>{role === "admin" ? "Admin PIN" : "Viewer Password"}</label>
          <input
            type="password"
            placeholder={role === "admin" ? "Enter admin PIN" : "Enter viewer password"}
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          {error && <span style={{ color: "var(--danger)", fontSize: 12 }}>{error}</span>}
        </div>

        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleLogin}>
          {role === "admin" ? "Login as Administrator" : "Login as Viewer"}
        </button>
      </div>
    </div>
  );
}

// ── Image Upload Box ──────────────────────────────────────────────────────────
function ImageUpload({ label, preview, onChange }) {
  const inputRef = React.useRef();
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="img-upload-box" onClick={() => inputRef.current.click()}>
        <input ref={inputRef} type="file" accept="image/*" onChange={(e) => onChange(e.target.files?.[0])} />
        {preview ? (
          <img src={preview} alt="preview" className="img-preview" />
        ) : (
          <p>Tap to upload photo</p>
        )}
      </div>
    </div>
  );
}

// ── Loan Form Modal ───────────────────────────────────────────────────────────
function LoanModal({ loan, onSave, onClose }) {
  const [form, setForm] = useState({
    borrower_name: loan?.borrower_name || "",
    phone: loan?.phone || "",
    account_number: loan?.account_number || "",
    residency_place: loan?.residency_place || "",
    amount: loan?.amount || "",
    loan_date: loan?.loan_date || new Date().toISOString().split("T")[0],
    due_date: loan?.due_date || "",
    notes: loan?.notes || "",
    status: loan?.status || "active",
    image1: loan?.image1 || "",
    image2: loan?.image2 || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleImage = (key, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => set(key, e.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.borrower_name.trim()) return setErr("Borrower name is required.");
    if (!form.phone.trim()) return setErr("Phone number is required.");
    if (!form.amount || isNaN(form.amount)) return setErr("Enter a valid amount.");
    if (!form.due_date) return setErr("Due date is required.");
    setSaving(true);
    setErr("");
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setErr("Failed to save. " + e.message);
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{loan ? "Edit Loan" : "Add New Loan"}</h2>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Borrower Full Name</label>
            <input value={form.borrower_name} onChange={(e) => set("borrower_name", e.target.value)} placeholder="Full name" />
          </div>
          <div className="form-group">
            <label>WhatsApp Number</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="e.g. 0812345678 or +27812345678" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Account Number</label>
              <input value={form.account_number} onChange={(e) => set("account_number", e.target.value)} placeholder="Bank account" />
            </div>
            <div className="form-group">
              <label>Residency / Area</label>
              <input value={form.residency_place} onChange={(e) => set("residency_place", e.target.value)} placeholder="City or area" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Amount (ZAR)</label>
              <input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="active">Active</option>
                <option value="paid">Paid</option>
              </select>
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
          <div className="form-group">
            <label>Notes / Reference</label>
            <input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" />
          </div>
          <div className="form-row">
            <ImageUpload label="Photo 1 — ID / Profile" preview={form.image1} onChange={(f) => handleImage("image1", f)} />
            <ImageUpload label="Photo 2 — Residence Proof" preview={form.image2} onChange={(f) => handleImage("image2", f)} />
          </div>
          {err && <p style={{ color: "var(--danger)", fontSize: 13 }}>{err}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Loan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onClose }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>Confirm Action</h2></div>
        <div className="modal-body"><p style={{ fontSize: 14 }}>{message}</p></div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Yes, Proceed</button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Modal (Admin only) ───────────────────────────────────────────────
function SettingsModal({ onClose, showToast }) {
  const passwords = getPasswords();
  const [adminPin, setAdminPin] = useState(passwords.admin);
  const [viewerPass, setViewerPass] = useState(passwords.viewer);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!adminPin.trim() || !viewerPass.trim()) return;
    savePasswords({ admin: adminPin, viewer: viewerPass });
    setSaved(true);
    showToast("Passwords updated successfully.");
    setTimeout(() => onClose(), 1200);
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header"><h2>Settings</h2></div>
        <div className="modal-body">
          <div className="settings-section">
            <h3>Change Passwords</h3>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Admin PIN</label>
              <input type="password" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} placeholder="New admin PIN" />
            </div>
            <div className="form-group">
              <label>Viewer Password</label>
              <input type="password" value={viewerPass} onChange={(e) => setViewerPass(e.target.value)} placeholder="New viewer password" />
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            Passwords are saved on this device. Share the viewer password with people you want to give access to.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saved}>
            {saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function LoanTracker() {
  const [role, setRole] = useState(null);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const [toast, setToast] = useState("");
  const [lightbox, setLightbox] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supabase("GET", "/loans?order=created_at.desc");
      setLoans(data);
    } catch (e) {
      showToast("Error loading loans: " + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (role) fetchLoans();
  }, [role, fetchLoans]);

  if (!role) return (
    <>
      <style>{css}</style>
      <LoginScreen onLogin={setRole} />
    </>
  );

  const active = loans.filter((l) => l.status === "active");
  const paid = loans.filter((l) => l.status === "paid");
  const overdue = active.filter((l) => daysLeft(l.due_date) < 0);
  const totalOutstanding = active.reduce((s, l) => s + Number(l.amount), 0);

  const filtered = loans.filter((l) => {
    const matchFilter =
      filter === "all" ? true :
      filter === "active" ? l.status === "active" :
      filter === "overdue" ? (l.status === "active" && daysLeft(l.due_date) < 0) :
      l.status === "paid";
    const matchSearch =
      l.borrower_name.toLowerCase().includes(search.toLowerCase()) ||
      l.phone.includes(search);
    return matchFilter && matchSearch;
  });

  const saveLoan = async (form) => {
    if (editing) {
      await supabase("PATCH", `/loans?id=eq.${editing.id}`, form);
      showToast("Loan updated successfully.");
    } else {
      await supabase("POST", "/loans", form);
      showToast("Loan added successfully.");
    }
    await fetchLoans();
    setEditing(null);
  };

  const deleteLoan = (loan) => {
    setConfirmData({
      message: `Delete loan for ${loan.borrower_name}? This cannot be undone.`,
      onConfirm: async () => {
        // Remove from UI immediately so it disappears right away
        setLoans((prev) => prev.filter((l) => l.id !== loan.id));
        setModal(null);
        try {
          await supabase("DELETE", `/loans?id=eq.${loan.id}`);
          showToast("Loan deleted.");
        } catch (e) {
          // If delete fails, reload from database
          showToast("Delete failed. Please try again.");
          await fetchLoans();
        }
      },
    });
    setModal("confirm");
  };

  const markPaid = (loan) => {
    setConfirmData({
      message: `Mark loan for ${loan.borrower_name} (${fmt(loan.amount)}) as paid?`,
      onConfirm: async () => {
        await supabase("PATCH", `/loans?id=eq.${loan.id}`, { status: "paid" });
        showToast("Loan marked as paid.");
        await fetchLoans();
        setModal(null);
      },
    });
    setModal("confirm");
  };

  const sendReminder = (loan) => {
    const msg = buildWhatsAppMessage(loan);
    const phone = loan.phone.replace(/\D/g, "");
    const normalized = phone.startsWith("27") ? phone : phone.startsWith("0") ? "27" + phone.slice(1) : phone;
    const url = `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

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
            {role === "admin" && (
              <>
                <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setModal("add"); }}>
                  + Add Loan
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setModal("settings")}>
                  Settings
                </button>
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setRole(null)}>Logout</button>
          </div>
        </div>

        {/* Stats */}
        <div className="stats">
          <div className="stat-card">
            <div className="label">Total Loans</div>
            <div className="value">{loans.length}</div>
          </div>
          <div className="stat-card">
            <div className="label">Outstanding</div>
            <div className="value gold">{fmt(totalOutstanding)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Overdue</div>
            <div className="value danger">{overdue.length}</div>
          </div>
          <div className="stat-card">
            <div className="label">Recovered</div>
            <div className="value">{paid.length}</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          {["all", "active", "overdue", "paid"].map((f) => (
            <button key={f} className={`filter-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <input
            className="search-input"
            placeholder="Search name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="table-wrap">
          {loading ? (
            <div className="loading">Loading loans...</div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <h3>No loans found</h3>
              <p>{role === "admin" ? `Click "+ Add Loan" to get started.` : "No records match your filter."}</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th>Account</th>
                  <th>Amount</th>
                  <th>Due Date</th>
                  <th>Residency</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((loan) => {
                  const s = statusLabel(loan);
                  return (
                    <tr key={loan.id}>
                      <td>
                        <div className="name-cell">{loan.borrower_name}</div>
                        <div className="phone-cell">{formatPhoneZA(loan.phone)}</div>
                        {(loan.image1 || loan.image2) && (
                          <div className="borrower-photos">
                            {loan.image1 && (
                              <img src={loan.image1} alt="ID" className="borrower-photo" onClick={() => setLightbox(loan.image1)} title="Click to enlarge" />
                            )}
                            {loan.image2 && (
                              <img src={loan.image2} alt="Residence" className="borrower-photo" onClick={() => setLightbox(loan.image2)} title="Click to enlarge" />
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ color: "var(--muted)" }}>{loan.account_number || "—"}</td>
                      <td className="amount-cell">{fmt(loan.amount)}</td>
                      <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {new Date(loan.due_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td style={{ color: "var(--muted)" }}>{loan.residency_place || "—"}</td>
                      <td>
                        <span className="status-pill" style={{ background: s.color + "1a", color: s.color }}>
                          {s.text}
                        </span>
                      </td>
                      <td>
                        <div className="actions">
                          {loan.status === "active" && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => sendReminder(loan)}>Remind</button>
                              <button className="btn btn-ghost btn-sm" style={{ color: "#16a34a" }} onClick={() => markPaid(loan)}>Paid</button>
                            </>
                          )}
                          {role === "admin" && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(loan); setModal("edit"); }}>Edit</button>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteLoan(loan)}>Del</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button className="lightbox-close" onClick={() => setLightbox(null)}>✕</button>
          <img src={lightbox} alt="Enlarged" />
        </div>
      )}

      {/* Modals */}
      {(modal === "add" || modal === "edit") && (
        <LoanModal loan={editing} onSave={saveLoan} onClose={() => { setModal(null); setEditing(null); }} />
      )}
      {modal === "confirm" && confirmData && (
        <ConfirmModal message={confirmData.message} onConfirm={async () => { await confirmData.onConfirm(); }} onClose={() => setModal(null)} />
      )}
      {modal === "settings" && (
        <SettingsModal onClose={() => setModal(null)} showToast={showToast} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}