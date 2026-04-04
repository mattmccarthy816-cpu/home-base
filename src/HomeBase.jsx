import { useState, useEffect, useCallback } from "react";

// ── CONFIG ──────────────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwMgO1moxl7GgsKr7jzfLGXztXrZZGGYI6DNFPj6knE35K11Yza2fcfm0wY9EMuHUDv/exec";
const GOOGLE_PLACES_API_KEY = "YOUR_PLACES_API_KEY_HERE";

// ── SHEETS API HELPERS ────────────────────────────────────────────────────────
async function sheetsRead(sheetName) {
  const res = await fetch(`${APPS_SCRIPT_URL}?action=read&sheet=${sheetName}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function sheetsAppend(sheetName, rowData) {
  const url = `${APPS_SCRIPT_URL}?action=appendRow&sheet=${sheetName}&data=${encodeURIComponent(JSON.stringify(rowData))}`;
  const r = await fetch(url);
  const json = await r.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function sheetsUpdate(sheetName, matchCol, matchVal, newData) {
  const url = `${APPS_SCRIPT_URL}?action=updateRow&sheet=${sheetName}` +
    `&matchCol=${matchCol}&matchVal=${encodeURIComponent(String(matchVal))}` +
    `&data=${encodeURIComponent(JSON.stringify(newData))}`;
  const r = await fetch(url);
  const json = await r.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function sheetsDelete(sheetName, matchCol, matchVal) {
  const url = `${APPS_SCRIPT_URL}?action=deleteRow&sheet=${sheetName}` +
    `&matchCol=${matchCol}&matchVal=${encodeURIComponent(String(matchVal))}`;
  const r = await fetch(url);
  const json = await r.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0];
const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const fullDayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function getWeekDates() {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// Mock data for demo (replace with Sheets calls)
const MOCK = {
  weeklyPlan: {
    "2025-01-06": { work: "Home", meals: "Oatmeal / Salad / Pasta", appts: "" },
    "2025-01-07": { work: "Office", meals: "Yogurt / Sandwich / Chicken", appts: "Dr. Smith 2pm" },
    "2025-01-08": { work: "Home", meals: "Eggs / Soup / Pizza", appts: "" },
    "2025-01-09": { work: "Client Site", meals: "Smoothie / Tacos / Steak", appts: "" },
    "2025-01-10": { work: "Home", meals: "Cereal / Leftovers / Sushi", appts: "Dentist 10am" },
    "2025-01-11": { work: "—", meals: "Brunch / —  / Burgers", appts: "" },
    "2025-01-12": { work: "—", meals: "— / — / Family dinner", appts: "" },
  },
  todos: [
    { id: 1, text: "Call insurance company", done: false, date: today() },
    { id: 2, text: "Pick up dry cleaning", done: true, date: today() },
    { id: 3, text: "Schedule car service", done: false, date: today() },
    { id: 4, text: "Pay electric bill", done: false, date: today() },
  ],
  fitness: [
    { day: "Monday", group: "Chest & Triceps", exercises: "Bench Press, Push-ups, Tricep Dips" },
    { day: "Tuesday", group: "Back & Biceps", exercises: "Pull-ups, Rows, Curls" },
    { day: "Wednesday", group: "Legs", exercises: "Squats, Lunges, Calf Raises" },
    { day: "Thursday", group: "Shoulders", exercises: "OHP, Lateral Raises, Face Pulls" },
    { day: "Friday", group: "Core & Cardio", exercises: "Planks, Run 20min, Ab Wheel" },
    { day: "Saturday", group: "Full Body", exercises: "Deadlifts, Pull-ups, Dips" },
    { day: "Sunday", group: "Rest / Stretch", exercises: "Yoga, Walk, Foam Roll" },
  ],
  meds: { am: "Vitamin D, Fish Oil, Magnesium", pm: "Melatonin 5mg" },
  healthLog: [
    { date: "2025-01-01", weight: 185, bpSys: 122, bpDia: 78 },
    { date: "2025-01-05", weight: 184, bpSys: 118, bpDia: 76 },
    { date: "2025-01-10", weight: 183, bpSys: 120, bpDia: 75 },
    { date: "2025-01-15", weight: 182, bpSys: 116, bpDia: 74 },
  ],
  habits: [
    { id: 1, name: "8 glasses of water", icon: "💧", done: false },
    { id: 2, name: "30 min exercise", icon: "🏃", done: false },
    { id: 3, name: "Read 20 min", icon: "📖", done: true },
    { id: 4, name: "No alcohol", icon: "🚫", done: true },
    { id: 5, name: "Sleep by 11pm", icon: "😴", done: false },
    { id: 6, name: "Meditate", icon: "🧘", done: false },
    { id: 7, name: "Vitamins taken", icon: "💊", done: true },
  ],
  restaurants: [
    { name: "Carmine's", cuisine: "Italian", zip: "10036", rating: 4.5, notes: "Great for groups" },
    { name: "Xi'an Famous Foods", cuisine: "Chinese", zip: "10013", rating: 4.7, notes: "Get the lamb noodles" },
    { name: "Los Tacos No. 1", cuisine: "Mexican", zip: "10036", rating: 4.8, notes: "Cash only" },
    { name: "Peter Luger", cuisine: "Steakhouse", zip: "11211", rating: 4.6, notes: "Reserve weeks ahead" },
  ],
  movies: [
    { title: "Dune: Part Two", genre: "Sci-Fi", where: "Max", status: "Watched", rating: 5 },
    { title: "Past Lives", genre: "Drama", where: "Paramount+", status: "Watched", rating: 5 },
    { title: "Oppenheimer", genre: "Drama", where: "Peacock", status: "Want to watch", rating: null },
    { title: "The Holdovers", genre: "Comedy", where: "Peacock", status: "Want to watch", rating: null },
    { title: "Poor Things", genre: "Drama", where: "Hulu", status: "Want to watch", rating: null },
  ],
  books: [
    { title: "Atomic Habits", author: "James Clear", category: "Self-Help", status: "Read" },
    { title: "The Road", author: "Cormac McCarthy", category: "Fiction", status: "Reading" },
    { title: "Meditations", author: "Marcus Aurelius", category: "Philosophy", status: "Read" },
    { title: "4000 Weeks", author: "Oliver Burkeman", category: "Self-Help", status: "Want to Read" },
    { title: "Sapiens", author: "Yuval Noah Harari", category: "Non-Fiction", status: "Want to Read" },
  ],
  activities: [
    { name: "Weekend in Hudson Valley", type: "Trip", status: "Planned", date: "Spring 2025" },
    { name: "Natural History Museum", type: "Local", status: "Want to do", date: "" },
    { name: "Kayaking on the Hudson", type: "Outdoor", status: "Want to do", date: "" },
    { name: "Broadway show", type: "Entertainment", status: "Planned", date: "Feb 2025" },
    { name: "Bike the High Line", type: "Outdoor", status: "Done", date: "Oct 2024" },
  ],
};

// ── NAV TABS ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: "weekly",      label: "Weekly",      icon: "📅" },
  { id: "todos",       label: "To-Do",       icon: "✅" },
  { id: "fitness",     label: "Fitness",     icon: "💪" },
  { id: "habits",      label: "Habits",      icon: "💚" },
  { id: "restaurants", label: "Food",        icon: "🍽️" },
  { id: "movies",      label: "Movies",      icon: "🎬" },
  { id: "books",       label: "Books",       icon: "📚" },
  { id: "activities",  label: "Activities",  icon: "🗺️" },
];

// ── MINI SPARKLINE ────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#6ee7b7" }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 120, h = 36;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts.split(" ").at(-1).split(",")[0]} cy={pts.split(" ").at(-1).split(",")[1]} r="3" fill={color} />
    </svg>
  );
}

// ── WEEKLY PLAN ───────────────────────────────────────────────────────────────
function WeeklyPlan() {
  const weekDates = getWeekDates();
  const todayStr = today();
  const [plan, setPlan] = useState({});
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sheetsRead("WeeklyPlan").then(rows => {
      const map = {};
      rows.forEach(r => {
        map[r.Date] = { work: r.WorkLocation || "", meals: r.Meals || "", appts: r.Appointments || "" };
      });
      setPlan(map);
    }).catch(() => setPlan(MOCK.weeklyPlan)).finally(() => setLoading(false));
  }, []);

  const saveDay = async (ds) => {
    const entry = plan[ds] || {};
    const row = { Date: ds, WorkLocation: entry.work || "", Meals: entry.meals || "", Appointments: entry.appts || "" };
    try {
      const updated = await sheetsUpdate("WeeklyPlan", "Date", ds, row);
      if (!updated.updated) await sheetsAppend("WeeklyPlan", row);
    } catch (e) { console.error("Save failed", e); }
    setEditing(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ color: "#f0e6d3", fontFamily: "'Playfair Display', serif", margin: 0, fontSize: 22 }}>
        Week at a Glance
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
        {weekDates.map((d, i) => {
          const ds = d.toISOString().split("T")[0];
          const isToday = ds === todayStr;
          const entry = plan[ds] || { work: "", meals: "", appts: "" };
          return (
            <div key={ds} onClick={() => setEditing(editing === ds ? null : ds)}
              style={{
                background: isToday ? "rgba(110,231,183,0.15)" : "rgba(255,255,255,0.04)",
                border: isToday ? "1px solid rgba(110,231,183,0.5)" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10, padding: "8px 6px", cursor: "pointer",
                transition: "all 0.2s",
              }}>
              <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: isToday ? "#6ee7b7" : "#f0e6d3", lineHeight: 1.2 }}>
                {d.getDate()}
              </div>
              <div style={{ fontSize: 10, marginTop: 4, color: "#d1d5db" }}>
                {entry.work && <div>🏢 {entry.work}</div>}
                {entry.appts && <div style={{ color: "#fbbf24" }}>📌 {entry.appts}</div>}
                {entry.meals && <div style={{ color: "#9ca3af", marginTop: 2, fontSize: 9 }}>{entry.meals}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 16, marginTop: 4 }}>
          <div style={{ color: "#f0e6d3", fontWeight: 600, marginBottom: 10, fontSize: 14 }}>
            Edit — {new Date(editing + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </div>
          {["work","meals","appts"].map(field => (
            <div key={field} style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 3, textTransform: "capitalize" }}>
                {field === "appts" ? "Appointments" : field === "meals" ? "Meals (B/L/D)" : "Work Location"}
              </label>
              <input
                value={(plan[editing] || {})[field] || ""}
                onChange={e => setPlan(p => ({ ...p, [editing]: { ...(p[editing] || {}), [field]: e.target.value } }))}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6, color: "#f0e6d3", padding: "6px 10px", fontSize: 13, boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>
          ))}
          <button onClick={() => saveDay(editing)}
            style={{ marginTop: 4, background: "#6ee7b7", color: "#0f1c14", border: "none", borderRadius: 6,
              padding: "7px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
            Save
          </button>
        </div>
      )}
    </div>
  );
}

// ── TO-DO ─────────────────────────────────────────────────────────────────────
function Todos() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sheetsRead("Todos").then(rows => {
      setTodos(rows.map(r => ({ id: String(r.ID), text: r.Text, done: r.Done === true || r.Done === "TRUE", date: r.Date })));
    }).catch(() => setTodos(MOCK.todos)).finally(() => setLoading(false));
  }, []);

  const toggle = async (id) => {
    const todo = todos.find(t => t.id === id);
    const newDone = !todo.done;
    setTodos(t => t.map(x => x.id === id ? { ...x, done: newDone } : x));
    try { await sheetsUpdate("Todos", "ID", id, { Done: newDone ? "TRUE" : "FALSE" }); }
    catch (e) { console.error(e); }
  };

  const add = async () => {
    if (!input.trim()) return;
    const newTodo = { id: String(Date.now()), text: input.trim(), done: false, date: today() };
    setTodos(t => [...t, newTodo]);
    setInput("");
    try { await sheetsAppend("Todos", { ID: newTodo.id, Text: newTodo.text, Done: "FALSE", Date: newTodo.date }); }
    catch (e) { console.error(e); }
  };

  const remove = async (id) => {
    setTodos(t => t.filter(x => x.id !== id));
    try { await sheetsDelete("Todos", "ID", id); }
    catch (e) { console.error(e); }
  };

  const pending = todos.filter(t => !t.done);
  const done = todos.filter(t => t.done);

  return (
    <div>
      <h2 style={{ color: "#f0e6d3", fontFamily: "'Playfair Display', serif", margin: "0 0 14px", fontSize: 22 }}>
        Today's Tasks
      </h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Add a task..."
          style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, color: "#f0e6d3", padding: "9px 13px", fontSize: 14, outline: "none" }} />
        <button onClick={add}
          style={{ background: "#6ee7b7", color: "#0f1c14", border: "none", borderRadius: 8,
            padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
          Add
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pending.map(t => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10,
            background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "10px 13px" }}>
            <div onClick={() => toggle(t.id)}
              style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #6ee7b7",
                cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }} />
            <span style={{ flex: 1, color: "#f0e6d3", fontSize: 14 }}>{t.text}</span>
            <span onClick={() => remove(t.id)}
              style={{ color: "#6b7280", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</span>
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Completed ({done.length})
          </div>
          {done.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10,
              background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "8px 13px", marginBottom: 5 }}>
              <div onClick={() => toggle(t.id)}
                style={{ width: 20, height: 20, borderRadius: "50%", background: "#6ee7b7",
                  cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, color: "#0f1c14", fontWeight: 700 }}>✓</div>
              <span style={{ flex: 1, color: "#6b7280", fontSize: 14, textDecoration: "line-through" }}>{t.text}</span>
              <span onClick={() => remove(t.id)}
                style={{ color: "#6b7280", cursor: "pointer", fontSize: 16 }}>×</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FITNESS ───────────────────────────────────────────────────────────────────
function Fitness() {
  const todayName = fullDayNames[new Date().getDay()];
  const [log, setLog] = useState({ weight: "", bpSys: "", bpDia: "" });
  const [history, setHistory] = useState([]);
  const [fitnessData, setFitnessData] = useState(MOCK.fitness);
  const [meds, setMeds] = useState(MOCK.meds);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sheetsRead("HealthLog").then(rows => {
      setHistory(rows.map(r => ({ date: r.Date, weight: parseFloat(r.Weight) || null, bpSys: parseInt(r.BPSystolic) || null, bpDia: parseInt(r.BPDiastolic) || null })));
    }).catch(() => setHistory(MOCK.healthLog));
    sheetsRead("Fitness").then(rows => {
      if (rows.length) {
        setFitnessData(rows.map(r => ({ day: r.Day, group: r.MuscleGroup, exercises: r.Exercises })));
        const monRow = rows.find(r => r.Day === "Monday");
        if (monRow) setMeds({ am: monRow.AMmeds || "", pm: monRow.PMmeds || "" });
      }
    }).catch(() => {});
  }, []);

  const saveLog = async () => {
    if (!log.weight && !log.bpSys) return;
    const entry = { date: today(), weight: parseFloat(log.weight) || null, bpSys: parseInt(log.bpSys) || null, bpDia: parseInt(log.bpDia) || null };
    setHistory(h => [...h, entry]);
    setLog({ weight: "", bpSys: "", bpDia: "" });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    try {
      await sheetsAppend("HealthLog", { Date: entry.date, Weight: entry.weight || "", BPSystolic: entry.bpSys || "", BPDiastolic: entry.bpDia || "" });
    } catch (e) { console.error(e); }
  };

  const todayFitness = fitnessData.find(f => f.day === todayName) || fitnessData[0];

  const weights = history.filter(h => h.weight).map(h => h.weight);
  const bpSysData = history.filter(h => h.bpSys).map(h => h.bpSys);

  return (
    <div>
      <h2 style={{ color: "#f0e6d3", fontFamily: "'Playfair Display', serif", margin: "0 0 14px", fontSize: 22 }}>
        Fitness & Health
      </h2>

      {/* Today's workout */}
      <div style={{ background: "rgba(110,231,183,0.1)", border: "1px solid rgba(110,231,183,0.25)",
        borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#6ee7b7", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
          Today — {todayName}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#f0e6d3", marginBottom: 4 }}>{todayFitness.group}</div>
        <div style={{ fontSize: 13, color: "#9ca3af" }}>{todayFitness.exercises}</div>
      </div>

      {/* Full week */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5, marginBottom: 16 }}>
      {fitnessData.map((f, i) => {
          const isToday = f.day === todayName;
          return (
            <div key={i} style={{ background: isToday ? "rgba(110,231,183,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${isToday ? "rgba(110,231,183,0.4)" : "rgba(255,255,255,0.07)"}`,
              borderRadius: 8, padding: "7px 5px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {f.day.slice(0, 3)}
              </div>
              <div style={{ fontSize: 10, color: isToday ? "#6ee7b7" : "#d1d5db", marginTop: 3, fontWeight: 600 }}>
                {f.group.split(" ")[0]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Meds */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[["☀️ AM", meds.am], ["🌙 PM", meds.pm]].map(([label, med]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#fbbf24", marginBottom: 5, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 12, color: "#d1d5db" }}>{med}</div>
          </div>
        ))}
      </div>

      {/* Log entry */}
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#f0e6d3", marginBottom: 10 }}>Log Today's Measurements</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          {[["Weight (lbs)", "weight"], ["BP Systolic", "bpSys"], ["BP Diastolic", "bpDia"]].map(([label, key]) => (
            <div key={key}>
              <label style={{ fontSize: 10, color: "#6b7280", display: "block", marginBottom: 3 }}>{label}</label>
              <input type="number" value={log[key]} onChange={e => setLog(l => ({ ...l, [key]: e.target.value }))}
                style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6, color: "#f0e6d3", padding: "7px 8px", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}
        </div>
        <button onClick={saveLog}
          style={{ background: saved ? "#34d399" : "#6ee7b7", color: "#0f1c14", border: "none", borderRadius: 7,
            padding: "8px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13, transition: "background 0.3s" }}>
          {saved ? "✓ Saved!" : "Save Entry"}
        </button>
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[["⚖️ Weight", weights, "#6ee7b7", "lbs"], ["❤️ BP (Sys)", bpSysData, "#f87171", "mmHg"]].map(([label, data, color, unit]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color, marginBottom: 4 }}>
              {data.at(-1) ?? "—"} <span style={{ fontSize: 11, color: "#6b7280" }}>{unit}</span>
            </div>
            <Sparkline data={data} color={color} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HABITS ────────────────────────────────────────────────────────────────────
function Habits() {
  const [habits, setHabits] = useState([]);
  const [newHabit, setNewHabit] = useState("");

  useEffect(() => {
    sheetsRead("Habits").then(rows => {
      setHabits(rows.map(r => ({ id: String(r.ID), name: r.Name, icon: r.Icon || "⭐", done: r.Done === true || r.Done === "TRUE" })));
    }).catch(() => setHabits(MOCK.habits));
  }, []);

  const toggle = async (id) => {
    const habit = habits.find(h => h.id === id);
    const newDone = !habit.done;
    setHabits(h => h.map(x => x.id === id ? { ...x, done: newDone } : x));
    try { await sheetsUpdate("Habits", "ID", id, { Done: newDone ? "TRUE" : "FALSE" }); }
    catch (e) { console.error(e); }
  };

  const add = async () => {
    if (!newHabit.trim()) return;
    const h = { id: String(Date.now()), name: newHabit.trim(), icon: "⭐", done: false };
    setHabits(hs => [...hs, h]);
    setNewHabit("");
    try { await sheetsAppend("Habits", { ID: h.id, Name: h.name, Icon: h.icon, Done: "FALSE" }); }
    catch (e) { console.error(e); }
  };

  const done = habits.filter(h => h.done).length;
  const pct = Math.round((done / habits.length) * 100);

  return (
    <div>
      <h2 style={{ color: "#f0e6d3", fontFamily: "'Playfair Display', serif", margin: "0 0 14px", fontSize: 22 }}>
        Daily Habits
      </h2>

      {/* Progress ring */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18,
        background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "12px 16px" }}>
        <svg width={64} height={64} style={{ flexShrink: 0 }}>
          <circle cx={32} cy={32} r={26} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
          <circle cx={32} cy={32} r={26} fill="none" stroke="#6ee7b7" strokeWidth={6}
            strokeDasharray={`${2 * Math.PI * 26}`}
            strokeDashoffset={`${2 * Math.PI * 26 * (1 - pct / 100)}`}
            strokeLinecap="round" transform="rotate(-90 32 32)"
            style={{ transition: "stroke-dashoffset 0.5s ease" }} />
          <text x={32} y={37} textAnchor="middle" fill="#6ee7b7" fontSize={14} fontWeight={700}>{pct}%</text>
        </svg>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#f0e6d3" }}>{done} / {habits.length}</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>habits completed today</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {habits.map(h => (
          <div key={h.id} onClick={() => toggle(h.id)}
            style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
              background: h.done ? "rgba(110,231,183,0.1)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${h.done ? "rgba(110,231,183,0.3)" : "rgba(255,255,255,0.07)"}`,
              borderRadius: 10, padding: "11px 14px", transition: "all 0.2s" }}>
            <span style={{ fontSize: 20 }}>{h.icon}</span>
            <span style={{ flex: 1, fontSize: 14, color: h.done ? "#6ee7b7" : "#d1d5db",
              textDecoration: h.done ? "none" : "none" }}>{h.name}</span>
            <div style={{ width: 22, height: 22, borderRadius: "50%",
              background: h.done ? "#6ee7b7" : "transparent",
              border: `2px solid ${h.done ? "#6ee7b7" : "rgba(255,255,255,0.2)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, color: "#0f1c14", fontWeight: 700, transition: "all 0.2s" }}>
              {h.done ? "✓" : ""}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input value={newHabit} onChange={e => setNewHabit(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()} placeholder="Add a habit..."
          style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, color: "#f0e6d3", padding: "9px 13px", fontSize: 14, outline: "none" }} />
        <button onClick={add}
          style={{ background: "#6ee7b7", color: "#0f1c14", border: "none", borderRadius: 8,
            padding: "9px 16px", cursor: "pointer", fontWeight: 700 }}>Add</button>
      </div>
    </div>
  );
}

// ── RESTAURANTS ───────────────────────────────────────────────────────────────
function Restaurants() {
  const [saved, setSaved] = useState([]);
  const [zip, setZip] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    sheetsRead("Restaurants").then(rows => {
      setSaved(rows.map(r => ({ name: r.Name, cuisine: r.Cuisine, zip: r.Zip, rating: r.Rating, notes: r.Notes })));
    }).catch(() => setSaved(MOCK.restaurants));
  }, []);

  const cuisines = ["All", ...new Set(saved.map(r => r.cuisine))];

  const search = async () => {
    setSearching(true);
    // With real API key, you'd call Google Places Text Search here
    // For now, simulate
    await new Promise(r => setTimeout(r, 1000));
    setResults([
      { name: "Demo Restaurant 1", cuisine, zip, rating: 4.3, notes: "Live search result" },
      { name: "Demo Restaurant 2", cuisine, zip, rating: 4.6, notes: "Live search result" },
    ]);
    setSearching(false);
  };

  const filtered = filter === "All" ? saved : saved.filter(r => r.cuisine === filter);

  return (
    <div>
      <h2 style={{ color: "#f0e6d3", fontFamily: "'Playfair Display', serif", margin: "0 0 14px", fontSize: 22 }}>
        Restaurants
      </h2>

      {/* Search */}
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>🔍 Find New Places</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input value={zip} onChange={e => setZip(e.target.value)} placeholder="ZIP code"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 7, color: "#f0e6d3", padding: "8px 11px", fontSize: 13, outline: "none" }} />
          <input value={cuisine} onChange={e => setCuisine(e.target.value)} placeholder="Cuisine type"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 7, color: "#f0e6d3", padding: "8px 11px", fontSize: 13, outline: "none" }} />
        </div>
        <button onClick={search} disabled={searching}
          style={{ background: searching ? "#374151" : "#6ee7b7", color: searching ? "#9ca3af" : "#0f1c14",
            border: "none", borderRadius: 7, padding: "8px 16px", cursor: searching ? "default" : "pointer",
            fontWeight: 700, fontSize: 13, width: "100%" }}>
          {searching ? "Searching..." : "Search Google Places"}
        </button>
        {results.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {results.map((r, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 10, marginBottom: 6 }}>
                <div style={{ fontWeight: 600, color: "#f0e6d3", fontSize: 14 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>⭐ {r.rating} · {r.cuisine}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {cuisines.map(c => (
          <button key={c} onClick={() => setFilter(c)}
            style={{ background: filter === c ? "#6ee7b7" : "rgba(255,255,255,0.07)",
              color: filter === c ? "#0f1c14" : "#9ca3af", border: "none", borderRadius: 20,
              padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: filter === c ? 700 : 400 }}>
            {c}
          </button>
        ))}
      </div>

      {/* Saved */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((r, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 600, color: "#f0e6d3", fontSize: 15 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                  {r.cuisine} · {r.zip} · ⭐ {r.rating}
                </div>
                {r.notes && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3, fontStyle: "italic" }}>{r.notes}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MOVIES ────────────────────────────────────────────────────────────────────
function Movies() {
  const [movies, setMovies] = useState([]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiRecs, setAiRecs] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    sheetsRead("Movies").then(rows => {
      setMovies(rows.map(r => ({ title: r.Title, genre: r.Genre, where: r.Where, status: r.Status, rating: r.Rating || null })));
    }).catch(() => setMovies(MOCK.movies));
  }, []);

  const getAiRecs = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const watched = movies.filter(m => m.status === "Watched").map(m => m.title).join(", ");
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `You are a movie recommendation assistant. The user has watched: ${watched || "various films"}. 
They want: "${aiPrompt}". 
Respond ONLY with a JSON array of 4 movie objects, no markdown, no backticks, just raw JSON:
[{"title":"...","genre":"...","where":"Netflix/Hulu/etc","reason":"one sentence why they'd like it"}]`
          }]
        })
      });
      const data = await response.json();
      const text = data.content.map(c => c.text || "").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setAiRecs(parsed);
    } catch (e) {
      setAiRecs([{ title: "Error", genre: "", where: "", reason: "Could not fetch recommendations." }]);
    }
    setAiLoading(false);
  };

  const statuses = ["All", "Want to watch", "Watched"];
  const filtered = filter === "All" ? movies : movies.filter(m => m.status === filter);

  return (
    <div>
      <h2 style={{ color: "#f0e6d3", fontFamily: "'Playfair Display', serif", margin: "0 0 14px", fontSize: 22 }}>
        Movies
      </h2>

      {/* AI recs */}
      <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)",
        borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#a78bfa", marginBottom: 8 }}>✨ AI Recommendations</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && getAiRecs()}
            placeholder="e.g. 'something funny' or 'like Dune'"
            style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 7, color: "#f0e6d3", padding: "8px 11px", fontSize: 13, outline: "none" }} />
          <button onClick={getAiRecs} disabled={aiLoading}
            style={{ background: aiLoading ? "#374151" : "#8b5cf6", color: "#fff", border: "none",
              borderRadius: 7, padding: "8px 14px", cursor: aiLoading ? "default" : "pointer",
              fontWeight: 700, fontSize: 13 }}>
            {aiLoading ? "..." : "Go"}
          </button>
        </div>
        {aiRecs.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
            {aiRecs.map((r, i) => (
              <div key={i} style={{ background: "rgba(139,92,246,0.15)", borderRadius: 8, padding: "9px 12px" }}>
                <div style={{ fontWeight: 600, color: "#f0e6d3", fontSize: 14 }}>{r.title}</div>
                <div style={{ fontSize: 11, color: "#a78bfa" }}>{r.genre} · {r.where}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{r.reason}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ background: filter === s ? "#6ee7b7" : "rgba(255,255,255,0.07)",
              color: filter === s ? "#0f1c14" : "#9ca3af", border: "none", borderRadius: 20,
              padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: filter === s ? 700 : 400 }}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {filtered.map((m, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "11px 14px",
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, color: "#f0e6d3", fontSize: 14 }}>{m.title}</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{m.genre} · {m.where}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20,
                background: m.status === "Watched" ? "rgba(110,231,183,0.15)" : "rgba(251,191,36,0.15)",
                color: m.status === "Watched" ? "#6ee7b7" : "#fbbf24" }}>{m.status}</div>
              {m.rating && <div style={{ fontSize: 13, marginTop: 4 }}>{"⭐".repeat(m.rating)}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BOOKS ─────────────────────────────────────────────────────────────────────
function Books() {
  const [books, setBooks] = useState([]);
  const [filter, setFilter] = useState("All");
  const [adding, setAdding] = useState(false);
  const [newBook, setNewBook] = useState({ title: "", author: "", category: "", status: "Want to Read" });
  const statuses = ["Want to Read", "Reading", "Read"];
  const statusColor = { "Read": "#6ee7b7", "Reading": "#fbbf24", "Want to Read": "#9ca3af" };

  useEffect(() => {
    sheetsRead("Books").then(rows => {
      setBooks(rows.map(r => ({ title: r.Title, author: r.Author, category: r.Category, status: r.Status })));
    }).catch(() => setBooks(MOCK.books));
  }, []);

  const add = async () => {
    if (!newBook.title.trim()) return;
    const book = { ...newBook };
    setBooks(b => [...b, book]);
    setNewBook({ title: "", author: "", category: "", status: "Want to Read" });
    setAdding(false);
    try { await sheetsAppend("Books", { Title: book.title, Author: book.author, Category: book.category, Status: book.status }); }
    catch (e) { console.error(e); }
  };

  const filtered = filter === "All" ? books : books.filter(b => b.category === filter || b.status === filter);

  return (
    <div>
      <h2 style={{ color: "#f0e6d3", fontFamily: "'Playfair Display', serif", margin: "0 0 14px", fontSize: 22 }}>
        Books
      </h2>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
        {statuses.map(s => (
          <div key={s} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: statusColor[s] }}>
              {books.filter(b => b.status === s).length}
            </div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{s}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
        {["All", ...statuses, ...new Set(books.map(b => b.category))].filter((v, i, a) => a.indexOf(v) === i).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ background: filter === f ? "#6ee7b7" : "rgba(255,255,255,0.07)",
              color: filter === f ? "#0f1c14" : "#9ca3af", border: "none", borderRadius: 20,
              padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: filter === f ? 700 : 400 }}>
            {f}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {filtered.map((b, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "11px 14px",
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, color: "#f0e6d3", fontSize: 14 }}>{b.title}</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{b.author} · {b.category}</div>
            </div>
            <div style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20,
              background: `${statusColor[b.status]}22`, color: statusColor[b.status], whiteSpace: "nowrap" }}>
              {b.status}
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 14, marginTop: 12 }}>
          {[["Title", "title"], ["Author", "author"], ["Category", "category"]].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>{label}</label>
              <input value={newBook[key]} onChange={e => setNewBook(n => ({ ...n, [key]: e.target.value }))}
                style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6, color: "#f0e6d3", padding: "7px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>Status</label>
            <select value={newBook.status} onChange={e => setNewBook(n => ({ ...n, status: e.target.value }))}
              style={{ width: "100%", background: "#1f2937", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6, color: "#f0e6d3", padding: "7px 10px", fontSize: 13, outline: "none" }}>
              {statuses.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={add} style={{ background: "#6ee7b7", color: "#0f1c14", border: "none", borderRadius: 7,
              padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Add</button>
            <button onClick={() => setAdding(false)} style={{ background: "transparent", color: "#6b7280",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ marginTop: 12, width: "100%", background: "rgba(255,255,255,0.05)",
            border: "1px dashed rgba(255,255,255,0.15)", borderRadius: 10, color: "#6b7280",
            padding: "10px", cursor: "pointer", fontSize: 13 }}>
          + Add Book
        </button>
      )}
    </div>
  );
}

// ── ACTIVITIES ────────────────────────────────────────────────────────────────
function Activities() {
  const [activities, setActivities] = useState([]);
  const [filter, setFilter] = useState("All");
  const [adding, setAdding] = useState(false);
  const [newAct, setNewAct] = useState({ name: "", type: "Local", status: "Want to do", date: "" });

  useEffect(() => {
    sheetsRead("Activities").then(rows => {
      setActivities(rows.map(r => ({ name: r.Name, type: r.Type, status: r.Status, date: r.Date || "" })));
    }).catch(() => setActivities(MOCK.activities));
  }, []);

  const statuses = ["Want to do", "Planned", "Done"];
  const statusColor = { "Done": "#6ee7b7", "Planned": "#fbbf24", "Want to do": "#9ca3af" };
  const filtered = filter === "All" ? activities : activities.filter(a => a.type === filter || a.status === filter);

  const add = async () => {
    if (!newAct.name.trim()) return;
    const act = { ...newAct };
    setActivities(a => [...a, act]);
    setNewAct({ name: "", type: "Local", status: "Want to do", date: "" });
    setAdding(false);
    try { await sheetsAppend("Activities", { Name: act.name, Type: act.type, Status: act.status, Date: act.date }); }
    catch (e) { console.error(e); }
  };

  return (
    <div>
      <h2 style={{ color: "#f0e6d3", fontFamily: "'Playfair Display', serif", margin: "0 0 14px", fontSize: 22 }}>
        Activities & Trips
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
        {statuses.map(s => (
          <div key={s} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: statusColor[s] }}>
              {activities.filter(a => a.status === s).length}
            </div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{s}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
        {["All", ...statuses, ...new Set(activities.map(a => a.type))].filter((v, i, a) => a.indexOf(v) === i).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ background: filter === f ? "#6ee7b7" : "rgba(255,255,255,0.07)",
              color: filter === f ? "#0f1c14" : "#9ca3af", border: "none", borderRadius: 20,
              padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: filter === f ? 700 : 400 }}>
            {f}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {filtered.map((a, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "11px 14px",
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, color: "#f0e6d3", fontSize: 14 }}>{a.name}</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                {a.type}{a.date ? ` · ${a.date}` : ""}
              </div>
            </div>
            <div style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20,
              background: `${statusColor[a.status]}22`, color: statusColor[a.status], whiteSpace: "nowrap" }}>
              {a.status}
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 14, marginTop: 12 }}>
          {[["Activity Name", "name"], ["Date (optional)", "date"]].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>{label}</label>
              <input value={newAct[key]} onChange={e => setNewAct(n => ({ ...n, [key]: e.target.value }))}
                style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6, color: "#f0e6d3", padding: "7px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}
          {[["Type", "type", ["Local","Trip","Outdoor","Entertainment","Food","Other"]],
            ["Status", "status", statuses]].map(([label, key, opts]) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>{label}</label>
              <select value={newAct[key]} onChange={e => setNewAct(n => ({ ...n, [key]: e.target.value }))}
                style={{ width: "100%", background: "#1f2937", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6, color: "#f0e6d3", padding: "7px 10px", fontSize: 13, outline: "none" }}>
                {opts.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={add} style={{ background: "#6ee7b7", color: "#0f1c14", border: "none", borderRadius: 7,
              padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Add</button>
            <button onClick={() => setAdding(false)} style={{ background: "transparent", color: "#6b7280",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ marginTop: 12, width: "100%", background: "rgba(255,255,255,0.05)",
            border: "1px dashed rgba(255,255,255,0.15)", borderRadius: 10, color: "#6b7280",
            padding: "10px", cursor: "pointer", fontSize: 13 }}>
          + Add Activity
        </button>
      )}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
const SECTION_MAP = {
  weekly: WeeklyPlan,
  todos: Todos,
  fitness: Fitness,
  habits: Habits,
  restaurants: Restaurants,
  movies: Movies,
  books: Books,
  activities: Activities,
};

export default function HomeBase() {
  const [activeTab, setActiveTab] = useState("weekly");
  const ActiveSection = SECTION_MAP[activeTab];
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a1628 0%, #0f1c14 50%, #150f1c 100%)",
      fontFamily: "'DM Sans', sans-serif",
      color: "#f0e6d3",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        padding: "18px 20px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.2)",
        backdropFilter: "blur(10px)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Playfair Display', serif",
              background: "linear-gradient(90deg, #6ee7b7, #a78bfa)", WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent", lineHeight: 1 }}>
              Home Base
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{todayLabel}</div>
          </div>
          <div style={{ fontSize: 11, color: "#374151", background: "rgba(255,255,255,0.05)",
            padding: "4px 10px", borderRadius: 20 }}>
            Matt & Alice
          </div>
        </div>

        {/* Nav — 4×2 compact grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{
                  background: isActive
                    ? "linear-gradient(135deg, rgba(110,231,183,0.25), rgba(167,139,250,0.15))"
                    : "rgba(255,255,255,0.04)",
                  border: isActive ? "1px solid rgba(110,231,183,0.4)" : "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 10,
                  padding: "8px 4px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  transition: "all 0.18s ease",
                  transform: isActive ? "scale(1.03)" : "scale(1)",
                }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{tab.icon}</span>
                <span style={{
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 400,
                  color: isActive ? "#6ee7b7" : "#6b7280",
                  letterSpacing: 0.3,
                }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 16px 40px", maxWidth: 800, margin: "0 auto" }}>
        <ActiveSection />
      </div>
    </div>
  );
}
