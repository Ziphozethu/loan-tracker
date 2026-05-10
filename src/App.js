import React, { useState, useEffect, useCallback } from "react";

// ── Supabase config ──────────────────────────────────────────────────────────
const SUPABASE_URL = "https://fdsqwpgwhcpceiptamfy.supabase.co";
const SUPABASE_KEY = "sb_publishable_umuFeOvqGzD1PJCFAWLjNQ_NKK78-Aj";

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

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  Number(n).toLocaleString("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

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
  const due = new Date(loan.due_date).toLocaleDateString("en-NG", {
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

// ── Styles ───────────────────────────────────────────────────────────────────
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

  body { background: var(--bg); font-family: 'DM Sans', sans-serif; color: var(--text); min-height: 100vh; }

  .app { max-width: 1100px; margin: 0 auto; padding: 24px 16px 48px; }

  /* Header */
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
  .header-left h1 { font-family: 'Playfair Display', serif; font-size: 26px; color: var(--accent); letter-spacing: -0.5px; }
  .header-left p { font-size: 13px; color: var(--muted); margin-top: 2px; }
  .header-right { display: flex; gap: 10px; align-items: center; }
  .role-badge { font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; background: var(--accent-light); color: var(--accent); }

  /* Buttons */
  .btn { display: inline-flex; align-items: center; gap: 6px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; padding: 9px 18px; border-radius: 8px; border: none; cursor: pointer; transition: all 0.15s; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: #0f2418; }
  .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  .btn-ghost:hover { background: var(--border); color: var(--text); }
  .btn-danger { background: var(--danger-light); color: var(--danger); border: 1px solid #fecaca; }
  .btn-danger:hover { background: #fee2e2; }
  .btn-sm { padding: 6px 12px; font-size: 12px; }

  /* Stats */
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 28px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 22px; }
  .stat-card .label { font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
  .stat-card .value { font-family: 'Playfair Display', serif; font-size: 24px; color: var(--text); }
  .stat-card .value.danger { color: var(--danger); }
  .stat-card .value.gold { color: var(--gold); }

  /* Filters */
  .toolbar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
  .filter-btn { font-size: 12px; font-weight: 500; padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; transition: all 0.15s; }
  .filter-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .search-input { flex: 1; min-width: 180px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 13px; background: var(--surface); color: var(--text); outline: none; }
  .search-input:focus { border-color: var(--accent); }

  /* Table */
  .table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: var(--muted); padding: 14px 18px; text-align: left; background: #faf9f7; border-bottom: 1px solid var(--border); }
  td { padding: 15px 18px; font-size: 14px; border-bottom: 1px solid #f0ece6; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #faf9f7; }
  .name-cell { font-weight: 600; color: var(--text); }
  .phone-cell { color: var(--muted); font-size: 13px; }
  .amount-cell { font-family: 'Playfair Display', serif; font-size: 15px; }
  .status-pill { display: inline-block; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; }
  .actions { display: flex; gap: 6px; }

  /* Modal */
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
  .modal { background: var(--surface); border-radius: 16px; width: 100%; max-width: 480px; box-shadow: var(--shadow-lg); overflow: hidden; }
  .modal-header { padding: 22px 26px 16px; border-bottom: 1px solid var(--border); }
  .modal-header h2 { font-family: 'Playfair Display', serif; font-size: 20px; color: var(--accent); }
  .modal-body { padding: 22px 26px; display: flex; flex-direction: column; gap: 16px; }
  .modal-footer { padding: 16px 26px 22px; display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid var(--border); }

  /* Form */
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-group label { font-size: 12px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: var(--muted); }
  .form-group input, .form-group textarea, .form-group select { padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 14px; color: var(--text); background: var(--surface); outline: none; transition: border 0.15s; }
  .form-group input:focus, .form-group textarea:focus, .form-group select:focus { border-color: var(--accent); }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

  /* Login */
  .login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .login-card { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 40px; width: 100%; max-width: 400px; box-shadow: var(--shadow-lg); }
  .login-card h1 { font-family: 'Playfair Display', serif; font-size: 28px; color: var(--accent); margin-bottom: 6px; }
  .login-card p { color: var(--muted); font-size: 14px; margin-bottom: 28px; }
  .role-select { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .role-option { border: 2px solid var(--border); border-radius: 10px; padding: 16px 14px; cursor: pointer; transition: all 0.15s; text-align: center; }
  .role-option.selected { border-color: var(--accent); background: var(--accent-light); }
  .role-option h3 { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
  .role-option p { font-size: 11px; color: var(--muted); margin: 0; }

  /* Empty */
  .empty { text-align: center; padding: 60px 24px; color: var(--muted); }
  .empty h3 { font-family: 'Playfair Display', serif; font-size: 20px; margin-bottom: 6px; color: var(--text); }

  /* Toast */
  .toast { position: fixed; bottom: 24px; right: 24px; background: var(--accent); color: #fff; padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 500; box-shadow: var(--shadow-lg); z-index: 200; animation: slideIn 0.2s ease; }
  @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .loading { text-align: center; padding: 60px; color: var(--muted); font-size: 14px; }

  @media (max-width: 640px) {
    .stats { grid-template-columns: 1fr 1fr; }
    .form-row { grid-template-columns: 1fr; }
    th:nth-child(3), td:nth-child(3),
    th:nth-child(4), td:nth-child(4) { display: none; }
    .header-left h1 { font-size: 20px; }
  }
`;

// ── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [role, setRole] = useState("viewer");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const ADMIN_PIN = "1234"; // Change this to your preferred PIN

  const handleLogin = () => {
    if (role === "admin") {
      if (pin === ADMIN_PIN) {
        onLogin("admin");
      } else {
        setError("Incorrect PIN. Please try again.");
      }
    } else {
      onLogin("viewer");
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>LoanTrack</h1>
        <p>Professional Loan Management System</p>

        <div className="role-select">
          <div
            className={`role-option ${role === "admin" ? "selected" : ""}`}
            onClick={() => setRole("admin")}
          >
            <h3>Administrator</h3>
            <p>Full access — add, edit, delete, manage all loans</p>
          </div>
          <div
            className={`role-option ${role === "viewer" ? "selected" : ""}`}
            onClick={() => setRole("viewer")}
          >
            <h3>Viewer</h3>
            <p>View loans, mark paid, send reminders</p>
          </div>
        </div>

        {role === "admin" && (
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Admin PIN</label>
            <input
              type="password"
              placeholder="Enter PIN"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
            {error && <span style={{ color: "var(--danger)", fontSize: 12 }}>{error}</span>}
          </div>
        )}

        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleLogin}>
          {role === "admin" ? "Login as Administrator" : "Continue as Viewer"}
        </button>

        {role === "admin" && (
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 12, textAlign: "center" }}>
            Default PIN: 1234 — change it in the App.js file
          </p>
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
    amount: loan?.amount || "",
    loan_date: loan?.loan_date || new Date().toISOString().split("T")[0],
    due_date: loan?.due_date || "",
    notes: loan?.notes || "",
    status: loan?.status || "active",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
            <label>Borrower Name</label>
            <input value={form.borrower_name} onChange={(e) => set("borrower_name", e.target.value)} placeholder="Full name" />
          </div>
          <div className="form-group">
            <label>WhatsApp Number</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="e.g. 2348012345678" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Amount (NGN)</label>
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

// ── Main App ──────────────────────────────────────────────────────────────────
export default function LoanTracker() {
  const [role, setRole] = useState(null);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // null | "add" | "edit" | "confirm"
  const [editing, setEditing] = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const [toast, setToast] = useState("");

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

  // Stats
  const active = loans.filter((l) => l.status === "active");
  const paid = loans.filter((l) => l.status === "paid");
  const overdue = active.filter((l) => daysLeft(l.due_date) < 0);
  const totalOutstanding = active.reduce((s, l) => s + Number(l.amount), 0);

  // Filter
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

  // CRUD
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
        await supabase("DELETE", `/loans?id=eq.${loan.id}`);
        showToast("Loan deleted.");
        await fetchLoans();
        setModal(null);
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
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
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
              <button className="btn btn-primary" onClick={() => { setEditing(null); setModal("add"); }}>
                + Add Loan
              </button>
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
            placeholder="Search by name or phone..."
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
              <p>{role === "admin" ? "Click \"Add Loan\" to get started." : "No records match your filter."}</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Borrower</th>
                  <th>Amount</th>
                  <th>Due Date</th>
                  <th>Notes</th>
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
                        <div className="phone-cell">{loan.phone}</div>
                      </td>
                      <td className="amount-cell">{fmt(loan.amount)}</td>
                      <td style={{ fontSize: 13, color: "var(--muted)" }}>
                        {new Date(loan.due_date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td style={{ fontSize: 13, color: "var(--muted)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {loan.notes || "—"}
                      </td>
                      <td>
                        <span className="status-pill" style={{ background: s.color + "1a", color: s.color }}>
                          {s.text}
                        </span>
                      </td>
                      <td>
                        <div className="actions">
                          {loan.status === "active" && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => sendReminder(loan)} title="Send WhatsApp Reminder">
                                Remind
                              </button>
                              <button className="btn btn-ghost btn-sm" style={{ color: "#16a34a" }} onClick={() => markPaid(loan)}>
                                Paid
                              </button>
                            </>
                          )}
                          {role === "admin" && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(loan); setModal("edit"); }}>
                                Edit
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteLoan(loan)}>
                                Del
                              </button>
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

      {/* Modals */}
      {(modal === "add" || modal === "edit") && (
        <LoanModal
          loan={editing}
          onSave={saveLoan}
          onClose={() => { setModal(null); setEditing(null); }}
        />
      )}
      {modal === "confirm" && confirmData && (
        <ConfirmModal
          message={confirmData.message}
          onConfirm={async () => { await confirmData.onConfirm(); }}
          onClose={() => setModal(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
