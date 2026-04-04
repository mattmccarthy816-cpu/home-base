import { useState, useEffect } from "react";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwMgO1moxl7GgsKr7jzfLGXztXrZZGGYI6DNFPj6knE35K11Yza2fcfm0wY9EMuHUDv/exec";

// ── SHEETS HELPERS ────────────────────────────────────────────────────────────
async function sheetsRead(sheet) {
  const r = await fetch(`${APPS_SCRIPT_URL}?action=read&sheet=${encodeURIComponent(sheet)}`);
  const j = await r.json(); if (!j.success) throw new Error(j.error); return j.data;
}
async function sheetsAppend(sheet, data) {
  const r = await fetch(`${APPS_SCRIPT_URL}?action=appendRow&sheet=${encodeURIComponent(sheet)}&data=${encodeURIComponent(JSON.stringify(data))}`);
  const j = await r.json(); if (!j.success) throw new Error(j.error); return j.data;
}
async function sheetsUpdate(sheet, col, val, data) {
  const r = await fetch(`${APPS_SCRIPT_URL}?action=updateRow&sheet=${encodeURIComponent(sheet)}&matchCol=${encodeURIComponent(col)}&matchVal=${encodeURIComponent(String(val))}&data=${encodeURIComponent(JSON.stringify(data))}`);
  const j = await r.json(); if (!j.success) throw new Error(j.error); return j.data;
}
async function sheetsDelete(sheet, col, val) {
  const r = await fetch(`${APPS_SCRIPT_URL}?action=deleteRow&sheet=${encodeURIComponent(sheet)}&matchCol=${encodeURIComponent(col)}&matchVal=${encodeURIComponent(String(val))}`);
  const j = await r.json(); if (!j.success) throw new Error(j.error); return j.data;
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DEFAULT_TYPES = ["Local","Trip","Outdoor","Entertainment","Food","Other"];

// Returns YYYY-MM-DD for a local Date object (no timezone shift)
function localFmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
// Today string in local time
function todayStr() { return localFmt(new Date()); }

// Build array of Date objects for a full month; nulls for leading empty cells (Mon-start)
function monthDates(year, month) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const pad   = (first.getDay() + 6) % 7; // Mon=0
  const days  = Array(pad).fill(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

// Build 7-day week array starting Monday containing today
function weekDates() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Mon=0
  return Array.from({length:7}, (_,i) => {
    const d = new Date(now); d.setDate(now.getDate() - dow + i); return d;
  });
}

// Safe label for a date string "YYYY-MM-DD" — avoids Invalid Date from timezone issues
function dateLabel(ds, opts) {
  if (!ds) return "";
  const [y,m,d] = ds.split("-").map(Number);
  return new Date(y, m-1, d).toLocaleDateString("en-US", opts);
}

// ── SHARED STYLE TOKENS ───────────────────────────────────────────────────────
const PB  = { background:"#6ee7b7",color:"#0f1c14",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:13 };
const GB  = { background:"transparent",color:"#9ca3af",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13 };
const NB  = { background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,color:"#f0e6d3",width:30,height:30,cursor:"pointer",fontSize:18,padding:0,lineHeight:"30px",textAlign:"center" };
const INP = { background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:7,color:"#f0e6d3",padding:"8px 11px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" };
const SEL = { width:"100%",background:"#1f2937",border:"1px solid rgba(255,255,255,0.12)",borderRadius:6,color:"#f0e6d3",padding:"7px 10px",fontSize:13,outline:"none" };
const H2  = { color:"#f0e6d3",fontFamily:"'Playfair Display',serif",margin:"0 0 14px",fontSize:20 };

function SaveBadge({saving,saved,error}) {
  if (saving) return <span style={{fontSize:11,color:"#9ca3af"}}>Saving…</span>;
  if (error)  return <span style={{fontSize:11,color:"#f87171"}}>⚠ Failed</span>;
  if (saved)  return <span style={{fontSize:11,color:"#6ee7b7"}}>✓ Saved</span>;
  return null;
}

function Sparkline({data, color="#6ee7b7"}) {
  if (!data || data.length < 2) return <div style={{height:34,color:"#4b5563",fontSize:10,display:"flex",alignItems:"center"}}>no data</div>;
  const min=Math.min(...data), max=Math.max(...data), range=max-min||1, w=110, h=34;
  const pts = data.map((v,i)=>`${((i/(data.length-1))*w).toFixed(1)},${(h-((v-min)/range)*(h-8)-4).toFixed(1)}`).join(" ");
  const lp  = pts.split(" ").at(-1).split(",");
  return <svg width={w} height={h}><polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx={lp[0]} cy={lp[1]} r="3.5" fill={color}/></svg>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEEKLY PLAN — always-on full month, edit panel below, kiosk-style
// ═══════════════════════════════════════════════════════════════════════════════
function WeeklyPlan() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [plan,  setPlan]  = useState({});
  const [sel,   setSel]   = useState(localFmt(now)); // always has a selected day
  const [sv,    setSv]    = useState({saving:false,saved:false,error:false});

  useEffect(() => {
    sheetsRead("WeeklyPlan").then(rows => {
      const map = {};
      rows.forEach(r => {
        if (r.Date) map[r.Date] = {
          mattLoc:  r.MattLocation  || "",
          aliceLoc: r.AliceLocation || "",
          dinner:   r.Dinner        || "",
          appts:    r.Appointments  || "",
        };
      });
      setPlan(map);
    }).catch(() => {});
  }, []);

  const days = monthDates(year, month);
  const todayDS = todayStr();
  const locIcon = loc => loc === "Office" ? "🏢" : loc === "Home" ? "🏠" : "";
  const entry   = plan[sel] || { mattLoc:"", aliceLoc:"", dinner:"", appts:"" };

  const prevMonth = () => {
    if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y+1); setMonth(0); } else setMonth(m => m+1);
  };

  const setField = (key, val) =>
    setPlan(p => ({ ...p, [sel]: { ...(p[sel]||{}), [key]: val } }));

  const saveDay = async () => {
    const e = plan[sel] || {};
    const row = { Date:sel, MattLocation:e.mattLoc||"", AliceLocation:e.aliceLoc||"", Dinner:e.dinner||"", Appointments:e.appts||"" };
    setSv({saving:true,saved:false,error:false});
    try {
      const res = await sheetsUpdate("WeeklyPlan","Date",sel,row);
      if (!res.updated) await sheetsAppend("WeeklyPlan", row);
      setSv({saving:false,saved:true,error:false});
      setTimeout(() => setSv(s=>({...s,saved:false})), 2500);
    } catch(e) { console.error(e); setSv({saving:false,saved:false,error:true}); }
  };

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US",{month:"long",year:"numeric"});
  const selLabel   = dateLabel(sel, {weekday:"long",month:"long",day:"numeric"});

  return (
    <div>
      {/* Month nav */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <h2 style={{...H2,margin:0}}>Monthly Plan</h2>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={prevMonth} style={NB}>‹</button>
          <span style={{color:"#f0e6d3",fontSize:13,fontWeight:600,minWidth:130,textAlign:"center"}}>{monthLabel}</span>
          <button onClick={nextMonth} style={NB}>›</button>
        </div>
      </div>

      {/* Day headers */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:2}}>
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d =>
          <div key={d} style={{textAlign:"center",fontSize:9,color:"#6b7280",paddingBottom:3,letterSpacing:.5}}>{d}</div>
        )}
      </div>

      {/* Calendar grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:14}}>
        {days.map((d,i) => {
          if (!d) return <div key={`e${i}`} />;
          const ds      = localFmt(d);
          const isToday = ds === todayDS;
          const isSel   = ds === sel;
          const e       = plan[ds] || {};
          return (
            <div key={ds} onClick={() => setSel(ds)}
              style={{
                background: isSel ? "rgba(110,231,183,0.22)" : isToday ? "rgba(110,231,183,0.1)" : "rgba(255,255,255,0.04)",
                border:`1px solid ${isSel ? "rgba(110,231,183,0.8)" : isToday ? "rgba(110,231,183,0.4)" : "rgba(255,255,255,0.07)"}`,
                borderRadius:7, padding:"5px 4px", cursor:"pointer", minHeight:68, transition:"all 0.12s",
              }}>
              <div style={{fontSize:13,fontWeight:700,color:isSel?"#6ee7b7":isToday?"#a7f3d0":"#f0e6d3",marginBottom:2}}>{d.getDate()}</div>
              {e.mattLoc  && <div style={{fontSize:8,color:"#93c5fd",lineHeight:1.4}}>{locIcon(e.mattLoc)} M</div>}
              {e.aliceLoc && <div style={{fontSize:8,color:"#f9a8d4",lineHeight:1.4}}>{locIcon(e.aliceLoc)} A</div>}
              {e.dinner   && <div style={{fontSize:8,color:"#fcd34d",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.4}}>🍽 {e.dinner}</div>}
              {e.appts    && <div style={{fontSize:8,color:"#fb923c",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.4}}>📌 {e.appts}</div>}
            </div>
          );
        })}
      </div>

      {/* Always-visible edit panel */}
      <div style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(110,231,183,0.2)",borderRadius:14,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <span style={{color:"#f0e6d3",fontWeight:700,fontSize:15}}>{selLabel}</span>
          <SaveBadge {...sv}/>
        </div>

        {/* Location toggles */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {[["Matt","mattLoc","#93c5fd"],["Alice","aliceLoc","#f9a8d4"]].map(([name,key,color]) => (
            <div key={key}>
              <div style={{fontSize:11,color,fontWeight:600,marginBottom:6}}>{name}</div>
              <div style={{display:"flex",gap:5}}>
                {[["🏢","Office"],["🏠","Home"]].map(([icon,val]) => {
                  const active = entry[key] === val;
                  return (
                    <button key={val} onClick={() => setField(key, active ? "" : val)}
                      style={{flex:1,background:active?`${color}25`:"rgba(255,255,255,0.06)",
                        border:`1px solid ${active?color:"rgba(255,255,255,0.1)"}`,
                        borderRadius:8,color:active?color:"#6b7280",padding:"9px 0",
                        cursor:"pointer",fontSize:13,fontWeight:active?700:400,transition:"all 0.15s"}}>
                      {icon} {val}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Dinner + Appointments */}
        {[["🍽  Dinner","dinner","e.g. Pasta night"],["📌  Appointments","appts","e.g. Dr. Smith 2pm"]].map(([label,key,ph]) => (
          <div key={key} style={{marginBottom:10}}>
            <label style={{fontSize:11,color:"#9ca3af",display:"block",marginBottom:4}}>{label}</label>
            <input value={entry[key]||""} onChange={e => setField(key, e.target.value)}
              onKeyDown={e => e.key==="Enter" && saveDay()}
              placeholder={ph} style={INP}/>
          </div>
        ))}

        <button onClick={saveDay} style={{...PB,width:"100%",marginTop:2}}>Save Day</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TO-DO
// ═══════════════════════════════════════════════════════════════════════════════
function Todos() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState("");
  useEffect(() => { sheetsRead("Todos").then(rows => setTodos(rows.map(r => ({id:String(r.ID),text:r.Text,done:r.Done===true||r.Done==="TRUE",date:r.Date})))).catch(()=>{}); }, []);
  const toggle = async id => { const t=todos.find(x=>x.id===id), nd=!t.done; setTodos(ts=>ts.map(x=>x.id===id?{...x,done:nd}:x)); try{await sheetsUpdate("Todos","ID",id,{Done:nd?"TRUE":"FALSE"});}catch(e){console.error(e);} };
  const add    = async () => { if(!input.trim())return; const nt={id:String(Date.now()),text:input.trim(),done:false,date:todayStr()}; setTodos(ts=>[...ts,nt]); setInput(""); try{await sheetsAppend("Todos",{ID:nt.id,Text:nt.text,Done:"FALSE",Date:nt.date});}catch(e){console.error(e);} };
  const remove = async id => { setTodos(ts=>ts.filter(x=>x.id!==id)); try{await sheetsDelete("Todos","ID",id);}catch(e){console.error(e);} };
  const pending = todos.filter(t=>!t.done), done = todos.filter(t=>t.done);
  return (
    <div>
      <h2 style={H2}>Today's Tasks</h2>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Add a task…" style={{...INP,flex:1}}/>
        <button onClick={add} style={PB}>Add</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {pending.map(t=>(
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,0.05)",borderRadius:8,padding:"10px 13px"}}>
            <div onClick={()=>toggle(t.id)} style={{width:20,height:20,borderRadius:"50%",border:"2px solid #6ee7b7",cursor:"pointer",flexShrink:0}}/>
            <span style={{flex:1,color:"#f0e6d3",fontSize:14}}>{t.text}</span>
            <span onClick={()=>remove(t.id)} style={{color:"#6b7280",cursor:"pointer",fontSize:18,lineHeight:1}}>×</span>
          </div>
        ))}
      </div>
      {done.length>0&&<div style={{marginTop:16}}>
        <div style={{fontSize:11,color:"#6b7280",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Completed ({done.length})</div>
        {done.map(t=>(
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,0.02)",borderRadius:8,padding:"8px 13px",marginBottom:5}}>
            <div onClick={()=>toggle(t.id)} style={{width:20,height:20,borderRadius:"50%",background:"#6ee7b7",cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#0f1c14",fontWeight:700}}>✓</div>
            <span style={{flex:1,color:"#6b7280",fontSize:14,textDecoration:"line-through"}}>{t.text}</span>
            <span onClick={()=>remove(t.id)} style={{color:"#6b7280",cursor:"pointer",fontSize:18}}>×</span>
          </div>
        ))}
      </div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FITNESS — meds at top, weekly workout view (tap day to log or edit workout),
//           forever trend sparklines, inline workout editor per day
// ═══════════════════════════════════════════════════════════════════════════════
function Fitness() {
  const now      = new Date();
  const todayDS  = todayStr();
  const todayName = DAY_NAMES[now.getDay()];

  const [meds,        setMeds]        = useState({am:"",pm:""});
  const [fitnessData, setFitnessData] = useState([
    {day:"Monday",group:"Chest & Triceps",exercises:"Bench Press, Push-ups, Tricep Dips"},
    {day:"Tuesday",group:"Back & Biceps",exercises:"Pull-ups, Rows, Curls"},
    {day:"Wednesday",group:"Legs",exercises:"Squats, Lunges, Calf Raises"},
    {day:"Thursday",group:"Shoulders",exercises:"OHP, Lateral Raises, Face Pulls"},
    {day:"Friday",group:"Core & Cardio",exercises:"Planks, Run 20min, Ab Wheel"},
    {day:"Saturday",group:"Full Body",exercises:"Deadlifts, Pull-ups, Dips"},
    {day:"Sunday",group:"Rest / Stretch",exercises:"Yoga, Walk, Foam Roll"},
  ]);
  const [healthLog,   setHealthLog]   = useState([]);
  const [selDay,      setSelDay]      = useState(todayDS);  // selected date string
  const [logForm,     setLogForm]     = useState({mattWeight:"",mattBPSys:"",mattBPDia:"",aliceBPSys:"",aliceBPDia:""});
  const [editingWkt,  setEditingWkt]  = useState(null); // day name being edited
  const [wktForm,     setWktForm]     = useState({group:"",exercises:""});
  const [sv,          setSv]          = useState({saving:false,saved:false,error:false});
  const [wktSv,       setWktSv]       = useState({saving:false,saved:false,error:false});

  useEffect(() => {
    sheetsRead("Fitness").then(rows => {
      if (rows.length) {
        setFitnessData(rows.map(r => ({day:r.Day,group:r.MuscleGroup||"",exercises:r.Exercises||""})));
        const mon = rows.find(r => r.Day==="Monday");
        if (mon) setMeds({am:mon.AMmeds||"",pm:mon.PMmeds||""});
      }
    }).catch(()=>{});
    sheetsRead("HealthLog").then(rows =>
      setHealthLog(rows.map(r => ({
        date:r.Date, mattWeight:parseFloat(r.MattWeight)||null,
        mattBPSys:parseInt(r.MattBPSys)||null, mattBPDia:parseInt(r.MattBPDia)||null,
        aliceBPSys:parseInt(r.AliceBPSys)||null, aliceBPDia:parseInt(r.AliceBPDia)||null,
      })))
    ).catch(()=>{});
  }, []);

  // Build the current week Mon→Sun
  const week = weekDates();

  const openDay = ds => {
    setSelDay(ds);
    const ex = healthLog.find(h => h.date===ds) || {};
    setLogForm({
      mattWeight:  ex.mattWeight  || "",
      mattBPSys:   ex.mattBPSys   || "",
      mattBPDia:   ex.mattBPDia   || "",
      aliceBPSys:  ex.aliceBPSys  || "",
      aliceBPDia:  ex.aliceBPDia  || "",
    });
    setEditingWkt(null);
  };

  const saveLog = async () => {
    const entry = {
      date:selDay,
      mattWeight:  parseFloat(logForm.mattWeight)||null,
      mattBPSys:   parseInt(logForm.mattBPSys)||null,
      mattBPDia:   parseInt(logForm.mattBPDia)||null,
      aliceBPSys:  parseInt(logForm.aliceBPSys)||null,
      aliceBPDia:  parseInt(logForm.aliceBPDia)||null,
    };
    setHealthLog(h => {
      const i = h.findIndex(x => x.date===selDay);
      if (i>=0) { const n=[...h]; n[i]=entry; return n; }
      return [...h,entry].sort((a,b)=>a.date.localeCompare(b.date));
    });
    setSv({saving:true,saved:false,error:false});
    try {
      const row = {Date:entry.date,MattWeight:entry.mattWeight||"",MattBPSys:entry.mattBPSys||"",MattBPDia:entry.mattBPDia||"",AliceBPSys:entry.aliceBPSys||"",AliceBPDia:entry.aliceBPDia||""};
      const res = await sheetsUpdate("HealthLog","Date",selDay,row);
      if (!res.updated) await sheetsAppend("HealthLog",row);
      setSv({saving:false,saved:true,error:false});
      setTimeout(()=>setSv(s=>({...s,saved:false})),2500);
    } catch(e){ console.error(e); setSv({saving:false,saved:false,error:true}); }
  };

  // Workout edit
  const startWktEdit = dayName => {
    const fd = fitnessData.find(f=>f.day===dayName)||{group:"",exercises:""};
    setWktForm({group:fd.group,exercises:fd.exercises});
    setEditingWkt(dayName);
  };
  const saveWkt = async () => {
    setFitnessData(fd => fd.map(f => f.day===editingWkt ? {...f,...wktForm} : f));
    setWktSv({saving:true,saved:false,error:false});
    try {
      await sheetsUpdate("Fitness","Day",editingWkt,{Day:editingWkt,MuscleGroup:wktForm.group,Exercises:wktForm.exercises});
      setWktSv({saving:false,saved:true,error:false});
      setTimeout(()=>setWktSv(s=>({...s,saved:false})),2500);
    } catch(e){ console.error(e); setWktSv({saving:false,saved:false,error:true}); }
    setEditingWkt(null);
  };

  // Sparkline data (all time)
  const mw=healthLog.filter(h=>h.mattWeight).map(h=>h.mattWeight);
  const ms=healthLog.filter(h=>h.mattBPSys).map(h=>h.mattBPSys);
  const md=healthLog.filter(h=>h.mattBPDia).map(h=>h.mattBPDia);
  const as_=healthLog.filter(h=>h.aliceBPSys).map(h=>h.aliceBPSys);
  const ad=healthLog.filter(h=>h.aliceBPDia).map(h=>h.aliceBPDia);

  // Selected day info
  const [sy,sm,sd_] = selDay.split("-").map(Number);
  const selDayName  = DAY_NAMES[new Date(sy,sm-1,sd_).getDay()];
  const selFitness  = fitnessData.find(f=>f.day===selDayName) || {group:"Rest",exercises:""};
  const selEntry    = healthLog.find(h=>h.date===selDay) || {};
  const hasLog      = ds => healthLog.some(h=>h.date===ds&&(h.mattWeight||h.mattBPSys||h.aliceBPSys));

  return (
    <div>
      <h2 style={H2}>Fitness & Health</h2>

      {/* ── MEDS at top ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
        {[["☀️ AM",meds.am],["🌙 PM",meds.pm]].map(([l,v])=>(
          <div key={l} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,193,7,0.2)",borderRadius:10,padding:"10px 13px"}}>
            <div style={{fontSize:11,color:"#fbbf24",marginBottom:4,fontWeight:700}}>{l}</div>
            <div style={{fontSize:12,color:"#d1d5db"}}>{v||<span style={{color:"#4b5563"}}>—</span>}</div>
          </div>
        ))}
      </div>

      {/* ── WEEKLY workout strip ── */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:"#9ca3af",marginBottom:7,textTransform:"uppercase",letterSpacing:.8}}>This Week — tap to log or edit</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {week.map(d => {
            const ds       = localFmt(d);
            const dayName  = DAY_NAMES[d.getDay()];
            const fd       = fitnessData.find(f=>f.day===dayName)||{group:"—"};
            const isToday  = ds===todayDS;
            const isSel    = ds===selDay;
            const logged   = hasLog(ds);
            return (
              <div key={ds} onClick={()=>openDay(ds)}
                style={{background:isSel?"rgba(110,231,183,0.2)":isToday?"rgba(110,231,183,0.08)":"rgba(255,255,255,0.04)",
                  border:`1px solid ${isSel?"rgba(110,231,183,0.7)":isToday?"rgba(110,231,183,0.35)":"rgba(255,255,255,0.07)"}`,
                  borderRadius:9,padding:"8px 4px",textAlign:"center",cursor:"pointer",transition:"all 0.12s"}}>
                <div style={{fontSize:9,color:"#6b7280",textTransform:"uppercase",letterSpacing:.5}}>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][(d.getDay()+6)%7]}</div>
                <div style={{fontSize:14,fontWeight:700,color:isToday?"#6ee7b7":"#f0e6d3",margin:"3px 0"}}>{d.getDate()}</div>
                <div style={{fontSize:8,color:isSel?"#6ee7b7":"#9ca3af",lineHeight:1.3}}>{fd.group.split(" ")[0]}</div>
                {logged && <div style={{fontSize:7,color:"#6ee7b7",marginTop:3}}>●</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Selected day panel ── */}
      <div style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:15,marginBottom:16}}>
        {/* Workout header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontSize:11,color:"#6ee7b7",textTransform:"uppercase",letterSpacing:.8,marginBottom:2}}>{selDayName} · {dateLabel(selDay,{month:"short",day:"numeric"})}</div>
            <div style={{fontSize:16,fontWeight:700,color:"#f0e6d3"}}>{selFitness.group}</div>
            <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{selFitness.exercises}</div>
          </div>
          <button onClick={()=>editingWkt===selDayName?setEditingWkt(null):startWktEdit(selDayName)}
            style={{...GB,fontSize:11,padding:"5px 10px",flexShrink:0,marginLeft:10}}>
            {editingWkt===selDayName?"Cancel":"✏️ Edit"}
          </button>
        </div>

        {/* Workout edit form */}
        {editingWkt===selDayName && (
          <div style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:12,color:"#9ca3af"}}>Edit {selDayName}</span>
              <SaveBadge {...wktSv}/>
            </div>
            <div style={{marginBottom:8}}>
              <label style={{fontSize:10,color:"#6b7280",display:"block",marginBottom:3}}>Muscle Group</label>
              <input value={wktForm.group} onChange={e=>setWktForm(f=>({...f,group:e.target.value}))} style={INP}/>
            </div>
            <div style={{marginBottom:10}}>
              <label style={{fontSize:10,color:"#6b7280",display:"block",marginBottom:3}}>Exercises (comma separated)</label>
              <input value={wktForm.exercises} onChange={e=>setWktForm(f=>({...f,exercises:e.target.value}))} style={INP}/>
            </div>
            <button onClick={saveWkt} style={PB}>Save Workout</button>
          </div>
        )}

        {/* Log measurements */}
        <div style={{borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:"#9ca3af",fontWeight:600}}>Log Measurements</div>
            <SaveBadge {...sv}/>
          </div>
          <div style={{fontSize:12,color:"#93c5fd",fontWeight:600,marginBottom:6}}>Matt</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:12}}>
            {[["Weight","mattWeight","lbs"],["BP Sys","mattBPSys",""],["BP Dia","mattBPDia",""]].map(([l,k,u])=>(
              <div key={k}>
                <label style={{fontSize:10,color:"#6b7280",display:"block",marginBottom:3}}>{l}{u&&<span style={{color:"#4b5563"}}> ({u})</span>}</label>
                <input type="number" value={logForm[k]} onChange={e=>setLogForm(f=>({...f,[k]:e.target.value}))} style={INP}
                  placeholder={selEntry[k]||""}/>
              </div>
            ))}
          </div>
          <div style={{fontSize:12,color:"#f9a8d4",fontWeight:600,marginBottom:6}}>Alice</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:12}}>
            {[["BP Sys","aliceBPSys"],["BP Dia","aliceBPDia"]].map(([l,k])=>(
              <div key={k}>
                <label style={{fontSize:10,color:"#6b7280",display:"block",marginBottom:3}}>{l}</label>
                <input type="number" value={logForm[k]} onChange={e=>setLogForm(f=>({...f,[k]:e.target.value}))} style={INP}
                  placeholder={selEntry[k]||""}/>
              </div>
            ))}
          </div>
          <button onClick={saveLog} style={PB}>Save Entry</button>
        </div>
      </div>

      {/* ── Trend sparklines (all time) ── */}
      <div>
        <div style={{fontSize:11,color:"#9ca3af",marginBottom:9,textTransform:"uppercase",letterSpacing:.8}}>All-Time Trends</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[
            ["⚖️ Matt Weight", mw,  "#6ee7b7","lbs"],
            ["❤️ Matt BP Sys", ms,  "#f87171","mmHg"],
            ["🩺 Matt BP Dia", md,  "#fb923c","mmHg"],
            ["❤️ Alice BP Sys",as_, "#f9a8d4","mmHg"],
            ["🩺 Alice BP Dia",ad,  "#e879f9","mmHg"],
          ].map(([label,data,color,unit])=>(
            <div key={label} style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:11}}>
              <div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>{label}</div>
              <div style={{fontSize:19,fontWeight:700,color,marginBottom:4}}>
                {data.length ? data.at(-1) : <span style={{color:"#4b5563",fontSize:14}}>—</span>}
                {data.length>0 && <span style={{fontSize:10,color:"#6b7280",marginLeft:3}}>{unit}</span>}
              </div>
              <Sparkline data={data} color={color}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HABITS
// ═══════════════════════════════════════════════════════════════════════════════
function Habits() {
  const [habits,setHabits]=useState([]);
  const [newHabit,setNewHabit]=useState("");
  useEffect(()=>{sheetsRead("Habits").then(rows=>setHabits(rows.map(r=>({id:String(r.ID),name:r.Name,icon:r.Icon||"⭐",done:r.Done===true||r.Done==="TRUE"})))).catch(()=>{});},[]);
  const toggle=async id=>{const h=habits.find(x=>x.id===id),nd=!h.done;setHabits(hs=>hs.map(x=>x.id===id?{...x,done:nd}:x));try{await sheetsUpdate("Habits","ID",id,{Done:nd?"TRUE":"FALSE"});}catch(e){console.error(e);}};
  const add=async()=>{if(!newHabit.trim())return;const h={id:String(Date.now()),name:newHabit.trim(),icon:"⭐",done:false};setHabits(hs=>[...hs,h]);setNewHabit("");try{await sheetsAppend("Habits",{ID:h.id,Name:h.name,Icon:h.icon,Done:"FALSE"});}catch(e){console.error(e);}};
  const remove=async id=>{setHabits(hs=>hs.filter(x=>x.id!==id));try{await sheetsDelete("Habits","ID",id);}catch(e){console.error(e);}};
  const done=habits.filter(h=>h.done).length,pct=habits.length?Math.round((done/habits.length)*100):0;
  return (
    <div>
      <h2 style={H2}>Daily Habits</h2>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18,background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"12px 16px"}}>
        <svg width={60} height={60} style={{flexShrink:0}}>
          <circle cx={30} cy={30} r={24} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6}/>
          <circle cx={30} cy={30} r={24} fill="none" stroke="#6ee7b7" strokeWidth={6}
            strokeDasharray={`${2*Math.PI*24}`} strokeDashoffset={`${2*Math.PI*24*(1-pct/100)}`}
            strokeLinecap="round" transform="rotate(-90 30 30)" style={{transition:"stroke-dashoffset 0.5s"}}/>
          <text x={30} y={35} textAnchor="middle" fill="#6ee7b7" fontSize={13} fontWeight={700}>{pct}%</text>
        </svg>
        <div><div style={{fontSize:18,fontWeight:700,color:"#f0e6d3"}}>{done} / {habits.length}</div><div style={{fontSize:12,color:"#9ca3af"}}>habits today</div></div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {habits.map(h=>(
          <div key={h.id} style={{display:"flex",alignItems:"center",gap:10,background:h.done?"rgba(110,231,183,0.08)":"rgba(255,255,255,0.04)",border:`1px solid ${h.done?"rgba(110,231,183,0.3)":"rgba(255,255,255,0.07)"}`,borderRadius:10,padding:"10px 13px",transition:"all 0.2s"}}>
            <span style={{fontSize:18}}>{h.icon}</span>
            <span onClick={()=>toggle(h.id)} style={{flex:1,fontSize:14,color:h.done?"#6ee7b7":"#d1d5db",cursor:"pointer"}}>{h.name}</span>
            <div onClick={()=>toggle(h.id)} style={{width:22,height:22,borderRadius:"50%",cursor:"pointer",background:h.done?"#6ee7b7":"transparent",border:`2px solid ${h.done?"#6ee7b7":"rgba(255,255,255,0.2)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#0f1c14",fontWeight:700,transition:"all 0.2s"}}>{h.done?"✓":""}</div>
            <span onClick={()=>remove(h.id)} style={{color:"#4b5563",cursor:"pointer",fontSize:16,marginLeft:4}}>×</span>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,marginTop:14}}>
        <input value={newHabit} onChange={e=>setNewHabit(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Add a habit…" style={{...INP,flex:1}}/>
        <button onClick={add} style={PB}>Add</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESTAURANTS
// ═══════════════════════════════════════════════════════════════════════════════
function Restaurants() {
  const [saved,setSaved]=useState([]);
  const [zip,setZip]=useState(""), [cuisine,setCuisine]=useState("");
  const [results,setResults]=useState([]), [searching,setSearching]=useState(false);
  const [filter,setFilter]=useState("All");
  useEffect(()=>{sheetsRead("Restaurants").then(rows=>setSaved(rows.map(r=>({name:r.Name,cuisine:r.Cuisine,zip:r.Zip,rating:r.Rating,notes:r.Notes})))).catch(()=>{});},[]);
  const cuisines=["All",...new Set(saved.map(r=>r.cuisine).filter(Boolean))];
  const filtered=filter==="All"?saved:saved.filter(r=>r.cuisine===filter);
  const search=async()=>{setSearching(true);await new Promise(r=>setTimeout(r,900));setResults([{name:"Result 1 — add Places API key",cuisine,zip,rating:4.3,notes:""},{name:"Result 2 — add Places API key",cuisine,zip,rating:4.6,notes:""}]);setSearching(false);};
  const saveToSheet=async r=>{setSaved(s=>[...s,r]);try{await sheetsAppend("Restaurants",{Name:r.name,Cuisine:r.cuisine,Zip:r.zip,Rating:r.rating,Notes:r.notes});}catch(e){console.error(e);}};
  return (
    <div>
      <h2 style={H2}>Restaurants</h2>
      <div style={{background:"rgba(255,255,255,0.04)",borderRadius:12,padding:14,marginBottom:16}}>
        <div style={{fontSize:12,color:"#9ca3af",marginBottom:8}}>🔍 Find New Places</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <input value={zip} onChange={e=>setZip(e.target.value)} placeholder="ZIP code" style={INP}/>
          <input value={cuisine} onChange={e=>setCuisine(e.target.value)} placeholder="Cuisine type" style={INP}/>
        </div>
        <button onClick={search} disabled={searching} style={{...PB,width:"100%",opacity:searching?0.6:1}}>{searching?"Searching…":"Search Google Places"}</button>
        {results.length>0&&<div style={{marginTop:10}}>{results.map((r,i)=>(
          <div key={i} style={{background:"rgba(255,255,255,0.06)",borderRadius:8,padding:"9px 12px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontWeight:600,color:"#f0e6d3",fontSize:14}}>{r.name}</div><div style={{fontSize:11,color:"#9ca3af"}}>⭐ {r.rating} · {r.cuisine}</div></div>
            <button onClick={()=>saveToSheet(r)} style={{...GB,fontSize:11,padding:"5px 10px"}}>+ Save</button>
          </div>
        ))}</div>}
      </div>
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        {cuisines.map(c=><button key={c} onClick={()=>setFilter(c)} style={{background:filter===c?"#6ee7b7":"rgba(255,255,255,0.07)",color:filter===c?"#0f1c14":"#9ca3af",border:"none",borderRadius:20,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:filter===c?700:400}}>{c}</button>)}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map((r,i)=>(
          <div key={i} style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontWeight:600,color:"#f0e6d3",fontSize:15}}>{r.name}</div>
            <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{r.cuisine} · {r.zip} · ⭐ {r.rating}</div>
            {r.notes&&<div style={{fontSize:11,color:"#6b7280",marginTop:3,fontStyle:"italic"}}>{r.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVIES
// ═══════════════════════════════════════════════════════════════════════════════
function Movies() {
  const [movies,setMovies]=useState([]);
  const [aiPrompt,setAiPrompt]=useState(""), [aiRecs,setAiRecs]=useState([]), [aiLoading,setAiLoading]=useState(false);
  const [filter,setFilter]=useState("All");
  useEffect(()=>{sheetsRead("Movies").then(rows=>setMovies(rows.map(r=>({title:r.Title,genre:r.Genre,where:r.Where,status:r.Status,rating:r.Rating||null})))).catch(()=>{});},[]);
  const getAiRecs=async()=>{
    if(!aiPrompt.trim())return;setAiLoading(true);
    try{
      const watched=movies.filter(m=>m.status==="Watched").map(m=>m.title).join(", ");
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:`Movie recs. Watched: ${watched||"various"}. Want: "${aiPrompt}". Respond ONLY raw JSON array of 4: [{"title":"","genre":"","where":"Netflix/etc","reason":""}]`}]})});
      const data=await res.json();const text=data.content.map(c=>c.text||"").join("");
      setAiRecs(JSON.parse(text.replace(/```json|```/g,"").trim()));
    }catch(e){setAiRecs([{title:"Error",genre:"",where:"",reason:"Could not fetch."}]);}
    setAiLoading(false);
  };
  const addToList=async m=>{const e={title:m.title,genre:m.genre,where:m.where,status:"Want to watch",rating:null};setMovies(mv=>[...mv,e]);try{await sheetsAppend("Movies",{Title:e.title,Genre:e.genre,Where:e.where,Status:e.status,Rating:""});}catch(e){console.error(e);}};
  const statuses=["All","Want to watch","Watched"];
  const filtered=filter==="All"?movies:movies.filter(m=>m.status===filter);
  return (
    <div>
      <h2 style={H2}>Movies</h2>
      <div style={{background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.25)",borderRadius:12,padding:14,marginBottom:16}}>
        <div style={{fontSize:12,color:"#a78bfa",marginBottom:8}}>✨ AI Recommendations</div>
        <div style={{display:"flex",gap:8}}>
          <input value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&getAiRecs()} placeholder="e.g. 'funny' or 'like Dune'" style={{...INP,flex:1}}/>
          <button onClick={getAiRecs} disabled={aiLoading} style={{background:aiLoading?"#374151":"#8b5cf6",color:"#fff",border:"none",borderRadius:7,padding:"8px 14px",cursor:aiLoading?"default":"pointer",fontWeight:700}}>{aiLoading?"…":"Go"}</button>
        </div>
        {aiRecs.length>0&&<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:7}}>{aiRecs.map((r,i)=>(
          <div key={i} style={{background:"rgba(139,92,246,0.15)",borderRadius:8,padding:"9px 12px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div><div style={{fontWeight:600,color:"#f0e6d3",fontSize:14}}>{r.title}</div><div style={{fontSize:11,color:"#a78bfa"}}>{r.genre} · {r.where}</div><div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>{r.reason}</div></div>
            <button onClick={()=>addToList(r)} style={{...GB,fontSize:11,padding:"4px 9px",marginLeft:8,flexShrink:0}}>+ Add</button>
          </div>
        ))}</div>}
      </div>
      <div style={{display:"flex",gap:6,marginBottom:12}}>{statuses.map(s=><button key={s} onClick={()=>setFilter(s)} style={{background:filter===s?"#6ee7b7":"rgba(255,255,255,0.07)",color:filter===s?"#0f1c14":"#9ca3af",border:"none",borderRadius:20,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:filter===s?700:400}}>{s}</button>)}</div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {filtered.map((m,i)=>(
          <div key={i} style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"11px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontWeight:600,color:"#f0e6d3",fontSize:14}}>{m.title}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{m.genre} · {m.where}</div></div>
            <div style={{fontSize:11,padding:"3px 8px",borderRadius:20,background:m.status==="Watched"?"rgba(110,231,183,0.15)":"rgba(251,191,36,0.15)",color:m.status==="Watched"?"#6ee7b7":"#fbbf24"}}>{m.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOKS
// ═══════════════════════════════════════════════════════════════════════════════
function Books() {
  const [books,setBooks]=useState([]);
  const [filter,setFilter]=useState("All");
  const [adding,setAdding]=useState(false), [editIdx,setEditIdx]=useState(null);
  const [newBook,setNewBook]=useState({title:"",author:"",category:"",status:"Want to Read"});
  const [editBook,setEditBook]=useState(null);
  const statuses=["Want to Read","Reading","Read"];
  const statusColor={"Read":"#6ee7b7","Reading":"#fbbf24","Want to Read":"#9ca3af"};
  useEffect(()=>{sheetsRead("Books").then(rows=>setBooks(rows.map(r=>({title:r.Title,author:r.Author,category:r.Category,status:r.Status})))).catch(()=>{});},[]);
  const add=async()=>{if(!newBook.title.trim())return;const b={...newBook};setBooks(bs=>[...bs,b]);setNewBook({title:"",author:"",category:"",status:"Want to Read"});setAdding(false);try{await sheetsAppend("Books",{Title:b.title,Author:b.author,Category:b.category,Status:b.status});}catch(e){console.error(e);}};
  const startEdit=i=>{setEditIdx(i);setEditBook({...books[i]});};
  const saveEdit=async()=>{const old=books[editIdx].title;setBooks(bs=>bs.map((b,i)=>i===editIdx?{...editBook}:b));setEditIdx(null);try{await sheetsUpdate("Books","Title",old,{Title:editBook.title,Author:editBook.author,Category:editBook.category,Status:editBook.status});}catch(e){console.error(e);}};
  const allFilters=["All",...statuses,...new Set(books.map(b=>b.category).filter(Boolean))].filter((v,i,a)=>a.indexOf(v)===i);
  const filtered=filter==="All"?books:books.filter(b=>b.category===filter||b.status===filter);
  return (
    <div>
      <h2 style={H2}>Books</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
        {statuses.map(s=><div key={s} style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"10px 12px",textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:statusColor[s]}}>{books.filter(b=>b.status===s).length}</div><div style={{fontSize:10,color:"#6b7280",marginTop:2}}>{s}</div></div>)}
      </div>
      <div style={{display:"flex",gap:5,marginBottom:12,flexWrap:"wrap"}}>{allFilters.map(f=><button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?"#6ee7b7":"rgba(255,255,255,0.07)",color:filter===f?"#0f1c14":"#9ca3af",border:"none",borderRadius:20,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:filter===f?700:400}}>{f}</button>)}</div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {filtered.map((b,i)=>{
          const ri=books.indexOf(b);
          if(editIdx===ri&&editBook)return(
            <div key={i} style={{background:"rgba(255,255,255,0.07)",borderRadius:10,padding:"12px 14px"}}>
              {[["Title","title"],["Author","author"],["Category","category"]].map(([l,k])=>(
                <div key={k} style={{marginBottom:7}}><label style={{fontSize:10,color:"#6b7280",display:"block",marginBottom:2}}>{l}</label>
                <input value={editBook[k]} onChange={e=>setEditBook(eb=>({...eb,[k]:e.target.value}))} style={INP}/></div>
              ))}
              <div style={{marginBottom:10}}><label style={{fontSize:10,color:"#6b7280",display:"block",marginBottom:2}}>Status</label>
              <select value={editBook.status} onChange={e=>setEditBook(eb=>({...eb,status:e.target.value}))} style={SEL}>{statuses.map(s=><option key={s}>{s}</option>)}</select></div>
              <div style={{display:"flex",gap:8}}><button onClick={saveEdit} style={PB}>Save</button><button onClick={()=>setEditIdx(null)} style={GB}>Cancel</button></div>
            </div>
          );
          return(
            <div key={i} style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"11px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{flex:1}}><div style={{fontWeight:600,color:"#f0e6d3",fontSize:14}}>{b.title}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{b.author} · {b.category}</div></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:`${statusColor[b.status]}22`,color:statusColor[b.status],whiteSpace:"nowrap"}}>{b.status}</div>
                <button onClick={()=>startEdit(ri)} style={{background:"transparent",border:"none",color:"#6b7280",cursor:"pointer",fontSize:14,padding:"2px 4px"}}>✏️</button>
              </div>
            </div>
          );
        })}
      </div>
      {adding?(
        <div style={{background:"rgba(255,255,255,0.05)",borderRadius:12,padding:14,marginTop:12}}>
          {[["Title","title"],["Author","author"],["Category","category"]].map(([l,k])=>(
            <div key={k} style={{marginBottom:8}}><label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:3}}>{l}</label>
            <input value={newBook[k]} onChange={e=>setNewBook(n=>({...n,[k]:e.target.value}))} style={INP}/></div>
          ))}
          <div style={{marginBottom:10}}><label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:3}}>Status</label>
          <select value={newBook.status} onChange={e=>setNewBook(n=>({...n,status:e.target.value}))} style={SEL}>{statuses.map(s=><option key={s}>{s}</option>)}</select></div>
          <div style={{display:"flex",gap:8}}><button onClick={add} style={PB}>Add</button><button onClick={()=>setAdding(false)} style={GB}>Cancel</button></div>
        </div>
      ):<button onClick={()=>setAdding(true)} style={{marginTop:12,width:"100%",background:"rgba(255,255,255,0.04)",border:"1px dashed rgba(255,255,255,0.15)",borderRadius:10,color:"#6b7280",padding:"10px",cursor:"pointer",fontSize:13}}>+ Add Book</button>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITIES
// ═══════════════════════════════════════════════════════════════════════════════
function Activities() {
  const [activities,setActivities]=useState([]);
  const [actTypes,setActTypes]=useState(DEFAULT_TYPES);
  const [filter,setFilter]=useState("All");
  const [adding,setAdding]=useState(false), [editIdx,setEditIdx]=useState(null);
  const [newAct,setNewAct]=useState({name:"",type:"Local",status:"Want to do",date:""});
  const [editAct,setEditAct]=useState(null);
  const [managingTypes,setManagingTypes]=useState(false), [newType,setNewType]=useState("");
  const statuses=["Want to do","Planned","Done"];
  const statusColor={"Done":"#6ee7b7","Planned":"#fbbf24","Want to do":"#9ca3af"};
  useEffect(()=>{
    sheetsRead("Activities").then(rows=>setActivities(rows.map(r=>({name:r.Name,type:r.Type,status:r.Status,date:r.Date||""})))).catch(()=>{});
    sheetsRead("Config").then(rows=>{const tr=rows.find(r=>r.Key==="ActivityTypes");if(tr?.Value)setActTypes(tr.Value.split(",").map(t=>t.trim()).filter(Boolean));}).catch(()=>{});
  },[]);
  const saveTypes=async types=>{setActTypes(types);try{const res=await sheetsUpdate("Config","Key","ActivityTypes",{Key:"ActivityTypes",Value:types.join(",")});if(!res.updated)await sheetsAppend("Config",{Key:"ActivityTypes",Value:types.join(",")});}catch(e){console.error(e);}};
  const addType=async()=>{if(!newType.trim()||actTypes.includes(newType.trim()))return;await saveTypes([...actTypes,newType.trim()]);setNewType("");};
  const removeType=async t=>{await saveTypes(actTypes.filter(x=>x!==t));};
  const add=async()=>{if(!newAct.name.trim())return;const a={...newAct};setActivities(acts=>[...acts,a]);setNewAct({name:"",type:actTypes[0]||"Local",status:"Want to do",date:""});setAdding(false);try{await sheetsAppend("Activities",{Name:a.name,Type:a.type,Status:a.status,Date:a.date});}catch(e){console.error(e);}};
  const startEdit=i=>{setEditIdx(i);setEditAct({...activities[i]});};
  const saveEdit=async()=>{const old=activities[editIdx].name;setActivities(acts=>acts.map((a,i)=>i===editIdx?{...editAct}:a));setEditIdx(null);try{await sheetsUpdate("Activities","Name",old,{Name:editAct.name,Type:editAct.type,Status:editAct.status,Date:editAct.date});}catch(e){console.error(e);}};
  const allFilters=["All",...statuses,...actTypes].filter((v,i,a)=>a.indexOf(v)===i);
  const filtered=filter==="All"?activities:activities.filter(a=>a.type===filter||a.status===filter);
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h2 style={{...H2,margin:0}}>Activities & Trips</h2>
        <button onClick={()=>setManagingTypes(m=>!m)} style={{...GB,fontSize:11,padding:"5px 10px"}}>{managingTypes?"Done":"⚙ Types"}</button>
      </div>
      {managingTypes&&(
        <div style={{background:"rgba(255,255,255,0.05)",borderRadius:12,padding:14,marginBottom:14}}>
          <div style={{fontSize:12,color:"#9ca3af",marginBottom:10}}>Activity Types</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>{actTypes.map(t=><span key={t} style={{background:"rgba(255,255,255,0.08)",borderRadius:20,padding:"4px 10px",fontSize:12,color:"#d1d5db",display:"flex",alignItems:"center",gap:6}}>{t}<span onClick={()=>removeType(t)} style={{cursor:"pointer",color:"#6b7280",fontSize:14}}>×</span></span>)}</div>
          <div style={{display:"flex",gap:8}}><input value={newType} onChange={e=>setNewType(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addType()} placeholder="New type…" style={{...INP,flex:1}}/><button onClick={addType} style={PB}>Add</button></div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>{statuses.map(s=><div key={s} style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"10px 12px",textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:statusColor[s]}}>{activities.filter(a=>a.status===s).length}</div><div style={{fontSize:10,color:"#6b7280",marginTop:2}}>{s}</div></div>)}</div>
      <div style={{display:"flex",gap:5,marginBottom:12,flexWrap:"wrap"}}>{allFilters.map(f=><button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?"#6ee7b7":"rgba(255,255,255,0.07)",color:filter===f?"#0f1c14":"#9ca3af",border:"none",borderRadius:20,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:filter===f?700:400}}>{f}</button>)}</div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {filtered.map((a,i)=>{
          const ri=activities.indexOf(a);
          if(editIdx===ri&&editAct)return(
            <div key={i} style={{background:"rgba(255,255,255,0.07)",borderRadius:10,padding:"12px 14px"}}>
              {[["Name","name"],["Date","date"]].map(([l,k])=>(<div key={k} style={{marginBottom:7}}><label style={{fontSize:10,color:"#6b7280",display:"block",marginBottom:2}}>{l}</label><input value={editAct[k]} onChange={e=>setEditAct(ea=>({...ea,[k]:e.target.value}))} style={INP}/></div>))}
              {[["Type","type",actTypes],["Status","status",statuses]].map(([l,k,opts])=>(<div key={k} style={{marginBottom:8}}><label style={{fontSize:10,color:"#6b7280",display:"block",marginBottom:2}}>{l}</label><select value={editAct[k]} onChange={e=>setEditAct(ea=>({...ea,[k]:e.target.value}))} style={SEL}>{opts.map(o=><option key={o}>{o}</option>)}</select></div>))}
              <div style={{display:"flex",gap:8}}><button onClick={saveEdit} style={PB}>Save</button><button onClick={()=>setEditIdx(null)} style={GB}>Cancel</button></div>
            </div>
          );
          return(
            <div key={i} style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"11px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{flex:1}}><div style={{fontWeight:600,color:"#f0e6d3",fontSize:14}}>{a.name}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{a.type}{a.date?` · ${a.date}`:""}</div></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:`${statusColor[a.status]}22`,color:statusColor[a.status],whiteSpace:"nowrap"}}>{a.status}</div>
                <button onClick={()=>startEdit(ri)} style={{background:"transparent",border:"none",color:"#6b7280",cursor:"pointer",fontSize:14,padding:"2px 4px"}}>✏️</button>
              </div>
            </div>
          );
        })}
      </div>
      {adding?(
        <div style={{background:"rgba(255,255,255,0.05)",borderRadius:12,padding:14,marginTop:12}}>
          {[["Name","name"],["Date (optional)","date"]].map(([l,k])=>(<div key={k} style={{marginBottom:8}}><label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:3}}>{l}</label><input value={newAct[k]} onChange={e=>setNewAct(n=>({...n,[k]:e.target.value}))} style={INP}/></div>))}
          {[["Type","type",actTypes],["Status","status",statuses]].map(([l,k,opts])=>(<div key={k} style={{marginBottom:8}}><label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:3}}>{l}</label><select value={newAct[k]} onChange={e=>setNewAct(n=>({...n,[k]:e.target.value}))} style={SEL}>{opts.map(o=><option key={o}>{o}</option>)}</select></div>))}
          <div style={{display:"flex",gap:8}}><button onClick={add} style={PB}>Add</button><button onClick={()=>setAdding(false)} style={GB}>Cancel</button></div>
        </div>
      ):<button onClick={()=>setAdding(true)} style={{marginTop:12,width:"100%",background:"rgba(255,255,255,0.04)",border:"1px dashed rgba(255,255,255,0.15)",borderRadius:10,color:"#6b7280",padding:"10px",cursor:"pointer",fontSize:13}}>+ Add Activity</button>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP SHELL
// ═══════════════════════════════════════════════════════════════════════════════
const TABS=[{id:"weekly",label:"Weekly",icon:"📅"},{id:"todos",label:"To-Do",icon:"✅"},{id:"fitness",label:"Fitness",icon:"💪"},{id:"habits",label:"Habits",icon:"💚"},{id:"restaurants",label:"Food",icon:"🍽️"},{id:"movies",label:"Movies",icon:"🎬"},{id:"books",label:"Books",icon:"📚"},{id:"activities",label:"Activities",icon:"🗺️"}];
const SECTIONS={weekly:WeeklyPlan,todos:Todos,fitness:Fitness,habits:Habits,restaurants:Restaurants,movies:Movies,books:Books,activities:Activities};

export default function HomeBase() {
  const [tab,setTab]=useState("weekly");
  const Section=SECTIONS[tab];
  const todayLabel=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1628 0%,#0f1c14 50%,#150f1c 100%)",fontFamily:"'DM Sans',sans-serif",color:"#f0e6d3"}}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
      <div style={{padding:"14px 14px 10px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.25)",backdropFilter:"blur(10px)",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div>
            <div style={{fontSize:20,fontWeight:700,fontFamily:"'Playfair Display',serif",background:"linear-gradient(90deg,#6ee7b7,#a78bfa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1}}>Home Base</div>
            <div style={{fontSize:10,color:"#6b7280",marginTop:1}}>{todayLabel}</div>
          </div>
          <div style={{fontSize:11,color:"#374151",background:"rgba(255,255,255,0.05)",padding:"4px 10px",borderRadius:20}}>Matt & Alice</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
          {TABS.map(t=>{
            const active=tab===t.id;
            return <button key={t.id} onClick={()=>setTab(t.id)}
              style={{background:active?"linear-gradient(135deg,rgba(110,231,183,0.25),rgba(167,139,250,0.15))":"rgba(255,255,255,0.04)",border:active?"1px solid rgba(110,231,183,0.4)":"1px solid rgba(255,255,255,0.07)",borderRadius:9,padding:"7px 4px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,transition:"all 0.15s",transform:active?"scale(1.03)":"scale(1)"}}>
              <span style={{fontSize:17,lineHeight:1}}>{t.icon}</span>
              <span style={{fontSize:10,fontWeight:active?700:400,color:active?"#6ee7b7":"#6b7280"}}>{t.label}</span>
            </button>;
          })}
        </div>
      </div>
      <div style={{padding:"16px 14px 48px",maxWidth:820,margin:"0 auto"}}><Section/></div>
    </div>
  );
}
