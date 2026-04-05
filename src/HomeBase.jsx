import { useState, useEffect } from "react";

const GAS   = "https://script.google.com/macros/s/AKfycbwMgO1moxl7GgsKr7jzfLGXztXrZZGGYI6DNFPj6knE35K11Yza2fcfm0wY9EMuHUDv/exec";
const PROXY = "/api/sheets"; // Vercel serverless proxy — same origin, no CORS

// ── SHEETS API ─────────────────────────────────────────────────────────────
// Reads: browser → GAS directly (GET has no CORS restriction)
// Writes: browser → /api/sheets (same-origin) → GAS server-side
async function sheetsRead(sheet) {
  const r = await fetch(`${GAS}?action=read&sheet=${encodeURIComponent(sheet)}`);
  const j = await r.json();
  if (!j.success) throw new Error(j.error);
  return j.data;
}
async function sheetsWrite(action, sheet, extra = {}) {
  const r = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, sheet, ...extra }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(j.error);
  return j.data;
}
async function sheetsAppend(sheet, row) {
  return sheetsWrite("appendRow", sheet, { data: JSON.stringify(row) });
}
async function sheetsUpdate(sheet, col, val, row) {
  return sheetsWrite("updateRow", sheet, { matchCol: col, matchVal: String(val), data: JSON.stringify(row) });
}
async function sheetsDelete(sheet, col, val) {
  return sheetsWrite("deleteRow", sheet, { matchCol: col, matchVal: String(val) });
}
async function sheetsUpsert(sheet, col, val, row) {
  const res = await sheetsUpdate(sheet, col, val, row);
  if (!res.updated) await sheetsAppend(sheet, row);
}

// ── COLOR THEMES ────────────────────────────────────────────────────────────
const THEMES = {
  red: {
    name:"Red",
    // Bordeaux — deep wine, jewel-toned, never alarm-red
    accent:"#8b1a3a", accentBright:"#ab2249",
    accentGlow:"rgba(139,26,58,0.22)", accentBorder:"rgba(139,26,58,0.58)",
    accentSoft:"rgba(139,26,58,0.13)", accentText:"#f0b8cc",
    bg:"linear-gradient(135deg,#0e0507 0%,#180810 50%,#110608 100%)",
    titleGrad:"linear-gradient(90deg,#ab2249,#f0b8cc)",
  },
  green: {
    name:"Green",
    // Forest — rich deep green
    accent:"#1a6b4a", accentBright:"#22885f",
    accentGlow:"rgba(26,107,74,0.2)", accentBorder:"rgba(26,107,74,0.5)",
    accentSoft:"rgba(26,107,74,0.12)", accentText:"#a7f3d0",
    bg:"linear-gradient(135deg,#0a1628 0%,#0a1c12 50%,#0f1c14 100%)",
    titleGrad:"linear-gradient(90deg,#22885f,#a7f3d0)",
  },
  blue: {
    name:"Blue",
    // Slate — deep indigo
    accent:"#3b5bdb", accentBright:"#4c6ef5",
    accentGlow:"rgba(59,91,219,0.2)", accentBorder:"rgba(59,91,219,0.5)",
    accentSoft:"rgba(59,91,219,0.12)", accentText:"#bac8ff",
    bg:"linear-gradient(135deg,#080d1a 0%,#0d1230 50%,#080d1a 100%)",
    titleGrad:"linear-gradient(90deg,#4c6ef5,#bac8ff)",
  },
  silver: {
    name:"Silver",
    // Cool platinum — elegant, neutral luxury
    accent:"#7a8fa6", accentBright:"#96aec8",
    accentGlow:"rgba(122,143,166,0.18)", accentBorder:"rgba(122,143,166,0.45)",
    accentSoft:"rgba(122,143,166,0.1)", accentText:"#d4e4f0",
    bg:"linear-gradient(135deg,#0a0c10 0%,#10141a 50%,#0c0f14 100%)",
    titleGrad:"linear-gradient(90deg,#96aec8,#d4e4f0)",
  },
};

// ── UTILS ─────────────────────────────────────────────────────────────────────
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DEFAULT_TYPES = ["Local","Trip","Outdoor","Entertainment","Food","Other"];

function localFmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function todayStr() { return localFmt(new Date()); }
function parseDS(ds) { const [y,m,d]=ds.split("-").map(Number); return new Date(y,m-1,d); }

// Month grid Sun-start
function monthDates(year, month) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month+1, 0);
  const days  = Array(first.getDay()).fill(null); // Sun=0
  for (let d=1; d<=last.getDate(); d++) days.push(new Date(year,month,d));
  return days;
}
// Current week Sun→Sat
function weekDates() {
  const now=new Date(), dow=now.getDay();
  return Array.from({length:7},(_,i)=>{ const d=new Date(now); d.setDate(now.getDate()-dow+i); return d; });
}
function dateLabel(ds, opts) { return ds ? parseDS(ds).toLocaleDateString("en-US",opts) : ""; }

// ── DESIGN TOKENS (theme-reactive) ────────────────────────────────────────────
// C is rebuilt from the active theme each render via useTheme()
function buildC(t) {
  return {
    accent:      t.accent,
    accentBright:t.accentBright,
    accentGlow:  t.accentGlow,
    accentBorder:t.accentBorder,
    accentSoft:  t.accentSoft,
    accentText:  t.accentText,
    matt:    "#93c5fd",
    alice:   "#f9a8d4",
    dinner:  "#fcd34d",
    appt:    "#fb923c",
    text:    "#f0e6d3",
    muted:   "#9ca3af",
    dim:     "#6b7280",
    faint:   "#4b5563",
    card:    "rgba(255,255,255,0.05)",
    cardHi:  "rgba(255,255,255,0.08)",
    border:  "rgba(255,255,255,0.09)",
    borderHi:"rgba(255,255,255,0.15)",
  };
}
// Fallback C for module-level style objects (overridden per-component via useC)
let C = buildC(THEMES.red);

// Style helpers — call with current C from useC()
const mkPB  = C => ({background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:13});
const mkGB  = C => ({background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13});
const mkNB  = C => ({background:"rgba(255,255,255,0.07)",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,width:30,height:30,cursor:"pointer",fontSize:18,padding:0,lineHeight:"30px",textAlign:"center"});
const mkINP = C => ({background:"rgba(255,255,255,0.08)",border:`1px solid ${C.border}`,borderRadius:7,color:C.text,padding:"8px 11px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"});
const mkSEL = C => ({width:"100%",background:"#1f2937",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:"7px 10px",fontSize:13,outline:"none"});
const mkH2  = C => ({color:C.text,fontFamily:"'Playfair Display',serif",margin:"0 0 14px",fontSize:20});
// Shorthands used inline — these use the module-level C which gets overridden per-app-render
// Components call useC() to get theme-aware versions
const PB  = mkPB(C);
const GB  = mkGB(C);
const NB  = mkNB(C);
const INP = mkINP(C);
const SEL = mkSEL(C);
const H2  = mkH2(C);

function SaveBadge({saving,saved,error}) {
  if (saving) return <span style={{fontSize:11,color:C.muted}}>Saving…</span>;
  if (error)  return <span style={{fontSize:11,color:"#f87171"}}>⚠ Failed — check console</span>;
  if (saved)  return <span style={{fontSize:11,color:C.accentText}}>✓ Saved</span>;
  return null;
}

function Sparkline({data,color}) {
  const col = color || C.accent;
  if (!data||data.length<2) return <div style={{height:34,color:C.faint,fontSize:10,display:"flex",alignItems:"center"}}>no data yet</div>;
  const min=Math.min(...data),max=Math.max(...data),range=max-min||1,w=110,h=34;
  const pts=data.map((v,i)=>`${((i/(data.length-1))*w).toFixed(1)},${(h-((v-min)/range)*(h-8)-4).toFixed(1)}`).join(" ");
  const lp=pts.split(" ").at(-1).split(",");
  return <svg width={w} height={h}><polyline points={pts} fill="none" stroke={col} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx={lp[0]} cy={lp[1]} r="3.5" fill={col}/></svg>;
}

// BoundedSparkline: y-axis fixed to first value ± 20 units
// so small fluctuations are visible and the line doesn't flatline
function BoundedSparkline({data, color}) {
  const col = color || C.accent;
  if (!data||data.length<1) return <div style={{height:44,color:C.faint,fontSize:10,display:"flex",alignItems:"center"}}>no data yet</div>;
  if (data.length<2) return (
    <div style={{height:44,color:C.faint,fontSize:10,display:"flex",alignItems:"center"}}>
      <span style={{color:col}}>●</span>&nbsp;1 entry
    </div>
  );
  const baseline = data[0];
  const yMin = baseline - 20;
  const yMax = baseline + 20;
  const range = yMax - yMin; // always 40
  const w=110, h=44;
  // Clamp values to the window so outliers don't break the scale
  const clamp = v => Math.max(yMin, Math.min(yMax, v));
  const pts = data.map((v,i)=>{
    const x = ((i/(data.length-1))*w).toFixed(1);
    const y = (h - ((clamp(v)-yMin)/range)*(h-8) - 4).toFixed(1);
    return `${x},${y}`;
  }).join(" ");
  const lp = pts.split(" ").at(-1).split(",");
  // Draw midline (baseline) as subtle reference
  const midY = (h - ((baseline-yMin)/range)*(h-8) - 4).toFixed(1);
  return (
    <svg width={w} height={h}>
      <line x1="0" y1={midY} x2={w} y2={midY} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3,3"/>
      <polyline points={pts} fill="none" stroke={col} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={lp[0]} cy={lp[1]} r="3.5" fill={col}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════════════════════════════════════════
function WeeklyPlan() {
  const now=new Date();
  const [year,setYear]=useState(now.getFullYear());
  const [month,setMonth]=useState(now.getMonth());
  const [plan,setPlan]=useState({});
  const [sel,setSel]=useState(localFmt(now));
  const [editing,setEditing]=useState(false);
  const [sv,setSv]=useState({saving:false,saved:false,error:false});

  useEffect(()=>{
    sheetsRead("WeeklyPlan").then(rows=>{
      const map={};
      rows.forEach(r=>{ if(r.Date) map[String(r.Date).trim()]={mattLoc:r.MattLocation||"",aliceLoc:r.AliceLocation||"",dinner:r.Dinner||"",appts:r.Appointments||""}; });
      setPlan(map);
    }).catch(e=>console.error("Calendar load:",e));
  },[]);

  const days=monthDates(year,month);
  const todayDS=todayStr();
  const locIcon=loc=>loc==="Office"?"🏢":loc==="Home"?"🏠":"";
  const entry=plan[sel]||{mattLoc:"",aliceLoc:"",dinner:"",appts:""};
  const monthLabel=new Date(year,month,1).toLocaleDateString("en-US",{month:"long",year:"numeric"});
  const selLabel=dateLabel(sel,{weekday:"long",month:"long",day:"numeric"});

  const prevMonth=()=>{if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1);};
  const nextMonth=()=>{if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1);};
  const selectDay=ds=>{ if(sel===ds){setEditing(e=>!e);}else{setSel(ds);setEditing(false);} };
  const setField=(key,val)=>setPlan(p=>({...p,[sel]:{...(p[sel]||{}),[key]:val}}));

  // Multiple appointments stored as newline-separated
  const apptList = (entry.appts||"").split("\n").filter(Boolean);
  const addAppt = () => {
    const cur = (entry.appts||"").trim();
    const next = cur ? cur+"\n" : "";
    setField("appts", next);
  };
  const updateAppt = (i, val) => {
    const arr = (entry.appts||"").split("\n");
    arr[i] = val;
    setField("appts", arr.join("\n"));
  };
  const removeAppt = i => {
    const arr = (entry.appts||"").split("\n").filter((_,idx)=>idx!==i);
    setField("appts", arr.join("\n"));
  };

  const saveDay=async()=>{
    const e=plan[sel]||{};
    const row={Date:sel,MattLocation:e.mattLoc||"",AliceLocation:e.aliceLoc||"",Dinner:e.dinner||"",Appointments:e.appts||""};
    setSv({saving:true,saved:false,error:false});
    try{
      await sheetsUpsert("WeeklyPlan","Date",sel,row);
      setSv({saving:false,saved:true,error:false});
      setTimeout(()=>setSv(s=>({...s,saved:false})),2500);
      setEditing(false);
    }catch(err){console.error("Calendar save:",err);setSv({saving:false,saved:false,error:true});}
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <h2 style={{...H2,margin:0}}>Calendar</h2>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={prevMonth} style={NB}>‹</button>
          <span style={{color:C.text,fontSize:13,fontWeight:600,minWidth:130,textAlign:"center"}}>{monthLabel}</span>
          <button onClick={nextMonth} style={NB}>›</button>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:2}}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} style={{textAlign:"center",fontSize:9,color:C.dim,paddingBottom:3}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:12}}>
        {days.map((d,i)=>{
          if(!d)return<div key={`e${i}`}/>;
          const ds=localFmt(d),isToday=ds===todayDS,isSel=ds===sel,e=plan[ds]||{};
          return(
            <div key={ds} onClick={()=>selectDay(ds)} style={{
              background:isSel?C.accentGlow:isToday?"rgba(255,255,255,0.07)":C.card,
              border:`1px solid ${isSel?C.accentBorder:isToday?C.borderHi:C.border}`,
              borderRadius:7,padding:"5px 4px",cursor:"pointer",minHeight:72,transition:"all 0.12s"}}>
              <div style={{fontSize:12,fontWeight:700,color:isSel?C.accentText:isToday?"#fff":C.text,marginBottom:2}}>{d.getDate()}</div>
              {e.appts    && <div style={{fontSize:8,color:C.appt,lineHeight:1.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📌 {e.appts.split("\n")[0]}</div>}
              {e.mattLoc  && <div style={{fontSize:8,color:C.matt,lineHeight:1.5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{locIcon(e.mattLoc)} Matt {e.mattLoc}</div>}
              {e.aliceLoc && <div style={{fontSize:8,color:C.alice,lineHeight:1.5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{locIcon(e.aliceLoc)} Alice {e.aliceLoc}</div>}
              {e.dinner   && <div style={{fontSize:8,color:C.dinner,lineHeight:1.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🍽 {e.dinner}</div>}
            </div>
          );
        })}
      </div>

      <div style={{background:C.card,border:`1px solid ${editing?C.accentBorder:C.border}`,borderRadius:14,overflow:"hidden",transition:"border-color 0.2s"}}>
        <div style={{padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>{selLabel}</div>
            {!editing&&(
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {/* Appointments first */}
                {apptList.length>0 && apptList.map((a,i)=><span key={i} style={{fontSize:13,color:C.appt}}>📌 {a}</span>)}
                {entry.mattLoc  && <span style={{fontSize:13,color:C.matt}}>{locIcon(entry.mattLoc)} Matt {entry.mattLoc}</span>}
                {entry.aliceLoc && <span style={{fontSize:13,color:C.alice}}>{locIcon(entry.aliceLoc)} Alice {entry.aliceLoc}</span>}
                {entry.dinner   && <span style={{fontSize:13,color:C.dinner}}>🍽 {entry.dinner}</span>}
                {!entry.mattLoc&&!entry.aliceLoc&&!entry.dinner&&!entry.appts&&
                  <span style={{fontSize:12,color:C.faint,fontStyle:"italic"}}>Nothing planned — tap Edit to add</span>}
              </div>
            )}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,marginLeft:12}}>
            {editing&&<SaveBadge {...sv}/>}
            <button onClick={()=>setEditing(e=>!e)} style={{...GB,fontSize:11,padding:"6px 12px"}}>
              {editing?"✕ Close":"✏️ Edit"}
            </button>
          </div>
        </div>

        {editing&&(
          <div style={{borderTop:`1px solid ${C.border}`,padding:"14px 16px"}}>
            {/* 1. Appointments (multiple) */}
            <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <label style={{fontSize:11,color:C.appt,fontWeight:600}}>📌 Appointments</label>
                <button onClick={addAppt} style={{...GB,fontSize:10,padding:"3px 9px"}}>+ Add</button>
              </div>
              {apptList.length===0&&(
                <input value="" onChange={e=>{if(e.target.value)setField("appts",e.target.value);}}
                  placeholder="e.g. Dr. Smith 2pm" style={INP}/>
              )}
              {apptList.map((a,i)=>(
                <div key={i} style={{display:"flex",gap:6,marginBottom:6}}>
                  <input value={a} onChange={e=>updateAppt(i,e.target.value)} style={{...INP,flex:1}}/>
                  <button onClick={()=>removeAppt(i)} style={{...GB,padding:"0 10px",fontSize:16,flexShrink:0}}>×</button>
                </div>
              ))}
            </div>

            {/* 2. Work locations */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              {[["Matt","mattLoc",C.matt],["Alice","aliceLoc",C.alice]].map(([name,key,color])=>(
                <div key={key}>
                  <div style={{fontSize:11,color,fontWeight:600,marginBottom:6}}>{name}'s Location</div>
                  <div style={{display:"flex",gap:5}}>
                    {[["🏢","Office"],["🏠","Home"]].map(([icon,val])=>{
                      const active=entry[key]===val;
                      return(
                        <button key={val} onClick={()=>setField(key,active?"":val)}
                          style={{flex:1,background:active?`${color}22`:"rgba(255,255,255,0.06)",
                            border:`1px solid ${active?color:C.border}`,borderRadius:8,
                            color:active?color:C.dim,padding:"9px 0",cursor:"pointer",
                            fontSize:13,fontWeight:active?700:400,transition:"all 0.15s"}}>
                          {icon} {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* 3. Dinner */}
            <div style={{marginBottom:12}}>
              <label style={{fontSize:11,color:C.dinner,fontWeight:600,display:"block",marginBottom:4}}>🍽 Dinner</label>
              <input value={entry.dinner||""} onChange={e=>setField("dinner",e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&saveDay()} placeholder="e.g. Pasta night" style={INP}/>
            </div>

            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={saveDay} style={{...PB,flex:1}}>{sv.saving?"Saving…":"Save Day"}</button>
              <SaveBadge {...sv}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TO-DO
// ═══════════════════════════════════════════════════════════════════════════════
function Todos() {
  const [todos,setTodos]=useState([]);
  const [input,setInput]=useState("");
  useEffect(()=>{sheetsRead("Todos").then(rows=>setTodos(rows.map(r=>({id:String(r.ID),text:r.Text,done:r.Done===true||r.Done==="TRUE",date:r.Date})))).catch(e=>console.error(e));},[]);
  const toggle=async id=>{const t=todos.find(x=>x.id===id),nd=!t.done;setTodos(ts=>ts.map(x=>x.id===id?{...x,done:nd}:x));try{await sheetsUpdate("Todos","ID",id,{Done:nd?"TRUE":"FALSE"});}catch(e){console.error(e);}};
  const add=async()=>{if(!input.trim())return;const nt={id:String(Date.now()),text:input.trim(),done:false,date:todayStr()};setTodos(ts=>[...ts,nt]);setInput("");try{await sheetsAppend("Todos",{ID:nt.id,Text:nt.text,Done:"FALSE",Date:nt.date});}catch(e){console.error(e);}};
  const remove=async id=>{setTodos(ts=>ts.filter(x=>x.id!==id));try{await sheetsDelete("Todos","ID",id);}catch(e){console.error(e);}};
  const pending=todos.filter(t=>!t.done),done=todos.filter(t=>t.done);
  return(
    <div>
      <h2 style={H2}>Today's Tasks</h2>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Add a task…" style={{...INP,flex:1}}/>
        <button onClick={add} style={PB}>Add</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {pending.map(t=>(
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,background:C.card,borderRadius:8,padding:"10px 13px"}}>
            <div onClick={()=>toggle(t.id)} style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${C.accent}`,cursor:"pointer",flexShrink:0}}/>
            <span style={{flex:1,color:C.text,fontSize:14}}>{t.text}</span>
            <span onClick={()=>remove(t.id)} style={{color:C.dim,cursor:"pointer",fontSize:18,lineHeight:1}}>×</span>
          </div>
        ))}
      </div>
      {done.length>0&&<div style={{marginTop:16}}>
        <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Completed ({done.length})</div>
        {done.map(t=>(
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,0.02)",borderRadius:8,padding:"8px 13px",marginBottom:5}}>
            <div onClick={()=>toggle(t.id)} style={{width:20,height:20,borderRadius:"50%",background:C.accent,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700}}>✓</div>
            <span style={{flex:1,color:C.dim,fontSize:14,textDecoration:"line-through"}}>{t.text}</span>
            <span onClick={()=>remove(t.id)} style={{color:C.dim,cursor:"pointer",fontSize:18}}>×</span>
          </div>
        ))}
      </div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FITNESS
// ═══════════════════════════════════════════════════════════════════════════════
function Fitness() {
  const now=new Date(),todayDS=todayStr(),todayName=DAYS[now.getDay()];
  const [meds,setMeds]=useState({am:"",pm:""});
  const [editingMeds,setEditingMeds]=useState(false);
  const [medsForm,setMedsForm]=useState({am:"",pm:""});
  const [medsSv,setMedsSv]=useState({saving:false,saved:false,error:false});
  const [fitnessData,setFitnessData]=useState([
    {day:"Monday",group:"Chest & Triceps",exercises:"Bench Press, Push-ups, Tricep Dips"},
    {day:"Tuesday",group:"Back & Biceps",exercises:"Pull-ups, Rows, Curls"},
    {day:"Wednesday",group:"Legs",exercises:"Squats, Lunges, Calf Raises"},
    {day:"Thursday",group:"Shoulders",exercises:"OHP, Lateral Raises, Face Pulls"},
    {day:"Friday",group:"Core & Cardio",exercises:"Planks, Run 20min, Ab Wheel"},
    {day:"Saturday",group:"Full Body",exercises:"Deadlifts, Pull-ups, Dips"},
    {day:"Sunday",group:"Rest / Stretch",exercises:"Yoga, Walk, Foam Roll"},
  ]);
  const [healthLog,setHealthLog]=useState([]);
  const [selDay,setSelDay]=useState(todayDS);
  const [logForm,setLogForm]=useState({mattWeight:"",mattBPSys:"",mattBPDia:"",aliceBPSys:"",aliceBPDia:""});
  const [editingWkt,setEditingWkt]=useState(null);
  const [wktForm,setWktForm]=useState({group:"",exercises:""});
  const [sv,setSv]=useState({saving:false,saved:false,error:false});
  const [wktSv,setWktSv]=useState({saving:false,saved:false,error:false});

  useEffect(()=>{
    sheetsRead("Fitness").then(rows=>{
      if(rows.length){
        setFitnessData(rows.map(r=>({day:r.Day,group:r.MuscleGroup||"",exercises:r.Exercises||""})));
        const mon=rows.find(r=>r.Day==="Monday");
        if(mon){setMeds({am:mon.AMmeds||"",pm:mon.PMmeds||""});setMedsForm({am:mon.AMmeds||"",pm:mon.PMmeds||""});}
      }
    }).catch(e=>console.error("Fitness load:",e));
    sheetsRead("HealthLog").then(rows=>setHealthLog(rows.map(r=>({date:r.Date,mattWeight:parseFloat(r.MattWeight)||null,mattBPSys:parseInt(r.MattBPSys)||null,mattBPDia:parseInt(r.MattBPDia)||null,aliceBPSys:parseInt(r.AliceBPSys)||null,aliceBPDia:parseInt(r.AliceBPDia)||null})))).catch(e=>console.error("HealthLog load:",e));
  },[]);

  const week=weekDates();
  const openDay=ds=>{setSelDay(ds);const ex=healthLog.find(h=>h.date===ds)||{};setLogForm({mattWeight:ex.mattWeight||"",mattBPSys:ex.mattBPSys||"",mattBPDia:ex.mattBPDia||"",aliceBPSys:ex.aliceBPSys||"",aliceBPDia:ex.aliceBPDia||""});setEditingWkt(null);};

  const saveMeds=async()=>{
    setMeds({...medsForm});
    setMedsSv({saving:true,saved:false,error:false});
    try{
      const fd=fitnessData.find(f=>f.day==="Monday")||{};
      await sheetsUpsert("Fitness","Day","Monday",{Day:"Monday",MuscleGroup:fd.group||"",Exercises:fd.exercises||"",AMmeds:medsForm.am,PMmeds:medsForm.pm});
      setMedsSv({saving:false,saved:true,error:false});setTimeout(()=>setMedsSv(s=>({...s,saved:false})),2500);
      setEditingMeds(false);
    }catch(e){console.error("Meds save:",e);setMedsSv({saving:false,saved:false,error:true});}
  };

  const saveLog=async()=>{
    const entry={date:selDay,mattWeight:parseFloat(logForm.mattWeight)||null,mattBPSys:parseInt(logForm.mattBPSys)||null,mattBPDia:parseInt(logForm.mattBPDia)||null,aliceBPSys:parseInt(logForm.aliceBPSys)||null,aliceBPDia:parseInt(logForm.aliceBPDia)||null};
    setHealthLog(h=>{const i=h.findIndex(x=>x.date===selDay);if(i>=0){const n=[...h];n[i]=entry;return n;}return[...h,entry].sort((a,b)=>a.date.localeCompare(b.date));});
    setSv({saving:true,saved:false,error:false});
    try{
      const row={Date:entry.date,MattWeight:entry.mattWeight||"",MattBPSys:entry.mattBPSys||"",MattBPDia:entry.mattBPDia||"",AliceBPSys:entry.aliceBPSys||"",AliceBPDia:entry.aliceBPDia||""};
      await sheetsUpsert("HealthLog","Date",selDay,row);
      setSv({saving:false,saved:true,error:false});setTimeout(()=>setSv(s=>({...s,saved:false})),2500);
    }catch(e){console.error("HealthLog save:",e);setSv({saving:false,saved:false,error:true});}
  };

  const startWktEdit=dayName=>{const fd=fitnessData.find(f=>f.day===dayName)||{group:"",exercises:""};setWktForm({group:fd.group,exercises:fd.exercises});setEditingWkt(dayName);};
  const saveWkt=async()=>{
    setFitnessData(fd=>fd.map(f=>f.day===editingWkt?{...f,...wktForm}:f));
    setWktSv({saving:true,saved:false,error:false});
    try{
      const monRow=fitnessData.find(f=>f.day==="Monday")||{};
      const row={Day:editingWkt,MuscleGroup:wktForm.group,Exercises:wktForm.exercises,AMmeds:editingWkt==="Monday"?meds.am:"",PMmeds:editingWkt==="Monday"?meds.pm:""};
      await sheetsUpsert("Fitness","Day",editingWkt,row);
      setWktSv({saving:false,saved:true,error:false});setTimeout(()=>setWktSv(s=>({...s,saved:false})),2500);
    }catch(e){console.error("Workout save:",e);setWktSv({saving:false,saved:false,error:true});}
    setEditingWkt(null);
  };

  const mw=healthLog.filter(h=>h.mattWeight).map(h=>h.mattWeight);
  const ms=healthLog.filter(h=>h.mattBPSys).map(h=>h.mattBPSys);
  const md=healthLog.filter(h=>h.mattBPDia).map(h=>h.mattBPDia);
  const as_=healthLog.filter(h=>h.aliceBPSys).map(h=>h.aliceBPSys);
  const ad=healthLog.filter(h=>h.aliceBPDia).map(h=>h.aliceBPDia);
  const selDayName=DAYS[parseDS(selDay).getDay()];
  const selFitness=fitnessData.find(f=>f.day===selDayName)||{group:"Rest",exercises:""};
  const selEntry=healthLog.find(h=>h.date===selDay)||{};
  const hasLog=ds=>healthLog.some(h=>h.date===ds&&(h.mattWeight||h.mattBPSys||h.aliceBPSys));

  // Meds displayed as lines (support newline-separated multiple items)
  const medLines = s => (s||"").split(/[,\n]/).map(x=>x.trim()).filter(Boolean);

  return(
    <div>
      <h2 style={H2}>Fitness & Health</h2>

      {/* MEDS */}
      <div style={{background:C.card,border:`1px solid rgba(251,191,36,0.25)`,borderRadius:12,padding:14,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:editingMeds?12:0}}>
          <div style={{fontSize:12,color:"#fbbf24",fontWeight:700}}>💊 Medications & Supplements</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {editingMeds&&<SaveBadge {...medsSv}/>}
            <button onClick={()=>{if(!editingMeds)setMedsForm({...meds});setEditingMeds(e=>!e);}} style={{...GB,fontSize:11,padding:"5px 10px"}}>{editingMeds?"✕ Cancel":"✏️ Edit"}</button>
          </div>
        </div>
        {editingMeds?(
          <div>
            {[["☀️ AM","am"],["🌙 PM","pm"]].map(([label,key])=>(
              <div key={key} style={{marginBottom:10}}>
                <label style={{fontSize:11,color:C.muted,display:"block",marginBottom:4}}>{label} — separate multiple with commas or new lines</label>
                <textarea value={medsForm[key]} onChange={e=>setMedsForm(f=>({...f,[key]:e.target.value}))}
                  placeholder={`${label} medications…`} rows={2}
                  style={{...INP,resize:"vertical",lineHeight:1.5}}/>
              </div>
            ))}
            <button onClick={saveMeds} style={{...PB,width:"100%"}}>{medsSv.saving?"Saving…":"Save Medications"}</button>
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
            {[["☀️ AM",meds.am],["🌙 PM",meds.pm]].map(([l,v])=>(
              <div key={l}>
                <div style={{fontSize:10,color:"#fbbf24",marginBottom:4,fontWeight:600}}>{l}</div>
                {medLines(v).length>0
                  ? medLines(v).map((m,i)=><div key={i} style={{fontSize:12,color:"#d1d5db",marginBottom:2}}>• {m}</div>)
                  : <div style={{fontSize:12,color:C.faint,fontStyle:"italic"}}>Not set</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* WEEKLY STRIP */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:C.muted,marginBottom:7,textTransform:"uppercase",letterSpacing:.8}}>This Week — tap to log</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {week.map(d=>{
            const ds=localFmt(d),dn=DAYS[d.getDay()],isToday=ds===todayDS,isSel=ds===selDay,logged=hasLog(ds);
            const fd=fitnessData.find(f=>f.day===dn)||{group:"—"};
            return(
              <div key={ds} onClick={()=>openDay(ds)} style={{
                background:isSel?C.accentGlow:isToday?"rgba(255,255,255,0.07)":C.card,
                border:`1px solid ${isSel?C.accentBorder:isToday?C.borderHi:C.border}`,
                borderRadius:9,padding:"8px 3px",textAlign:"center",cursor:"pointer",transition:"all 0.12s"}}>
                <div style={{fontSize:9,color:C.dim,textTransform:"uppercase"}}>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]}</div>
                <div style={{fontSize:14,fontWeight:700,color:isToday?"#fff":C.text,margin:"3px 0"}}>{d.getDate()}</div>
                <div style={{fontSize:8,color:isSel?C.accentText:C.muted,lineHeight:1.3}}>{fd.group.split(" ")[0]}</div>
                {logged&&<div style={{fontSize:7,color:C.accent,marginTop:2}}>●</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* SELECTED DAY */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:15,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontSize:11,color:C.accentText,textTransform:"uppercase",letterSpacing:.8,marginBottom:2}}>{selDayName} · {dateLabel(selDay,{month:"short",day:"numeric"})}</div>
            <div style={{fontSize:16,fontWeight:700,color:C.text}}>{selFitness.group}</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>{selFitness.exercises}</div>
          </div>
          <button onClick={()=>editingWkt===selDayName?setEditingWkt(null):startWktEdit(selDayName)}
            style={{...GB,fontSize:11,padding:"5px 10px",flexShrink:0,marginLeft:10}}>
            {editingWkt===selDayName?"Cancel":"✏️ Edit"}
          </button>
        </div>
        {editingWkt===selDayName&&(
          <div style={{background:C.cardHi,borderRadius:10,padding:12,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{fontSize:12,color:C.muted}}>Edit {selDayName}</span><SaveBadge {...wktSv}/>
            </div>
            <div style={{marginBottom:8}}><label style={{fontSize:10,color:C.dim,display:"block",marginBottom:3}}>Muscle Group</label><input value={wktForm.group} onChange={e=>setWktForm(f=>({...f,group:e.target.value}))} style={INP}/></div>
            <div style={{marginBottom:10}}><label style={{fontSize:10,color:C.dim,display:"block",marginBottom:3}}>Exercises</label><input value={wktForm.exercises} onChange={e=>setWktForm(f=>({...f,exercises:e.target.value}))} style={INP}/></div>
            <button onClick={saveWkt} style={PB}>Save Workout</button>
          </div>
        )}
        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:C.muted,fontWeight:600}}>Log Measurements</div><SaveBadge {...sv}/>
          </div>
          <div style={{fontSize:12,color:C.matt,fontWeight:600,marginBottom:6}}>Matt</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:12}}>
            {[["Weight (lbs)","mattWeight"],["BP Sys","mattBPSys"],["BP Dia","mattBPDia"]].map(([l,k])=>(
              <div key={k}><label style={{fontSize:10,color:C.dim,display:"block",marginBottom:3}}>{l}</label>
              <input type="number" value={logForm[k]} onChange={e=>setLogForm(f=>({...f,[k]:e.target.value}))} placeholder={String(selEntry[k]||"")} style={INP}/></div>
            ))}
          </div>
          <div style={{fontSize:12,color:C.alice,fontWeight:600,marginBottom:6}}>Alice</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:12}}>
            {[["BP Sys","aliceBPSys"],["BP Dia","aliceBPDia"]].map(([l,k])=>(
              <div key={k}><label style={{fontSize:10,color:C.dim,display:"block",marginBottom:3}}>{l}</label>
              <input type="number" value={logForm[k]} onChange={e=>setLogForm(f=>({...f,[k]:e.target.value}))} placeholder={String(selEntry[k]||"")} style={INP}/></div>
            ))}
          </div>
          <button onClick={saveLog} style={{...PB,width:"100%"}}>{sv.saving?"Saving…":"Save Entry"}</button>
        </div>
      </div>

      {/* TRENDS — Matt strictly left, Alice strictly right, row by row */}
      <div style={{fontSize:11,color:C.muted,marginBottom:9,textTransform:"uppercase",letterSpacing:.8}}>All-Time Trends</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {/* Row 1: Matt Weight | Alice BP Sys */}
        {[
          {who:"Matt",label:"⚖️ Weight",    data:mw, color:C.accent,    unit:"lbs"},
          {who:"Alice",label:"❤️ BP Sys",   data:as_,color:C.alice,     unit:"mmHg"},
          {who:"Matt",label:"❤️ BP Sys",    data:ms, color:C.matt,      unit:"mmHg"},
          {who:"Alice",label:"🩺 BP Dia",   data:ad, color:"#e879f9",   unit:"mmHg"},
          {who:"Matt",label:"🩺 BP Dia",    data:md, color:"#fb923c",   unit:"mmHg"},
          {who:"",label:"",data:[],color:"",unit:""},
        ].map(({who,label,data,color,unit},i)=>(
          who===""
            ? <div key={i}/>
            : <div key={i} style={{background:C.card,borderRadius:10,padding:11}}>
                <div style={{fontSize:9,color:who==="Matt"?C.matt:C.alice,marginBottom:1,textTransform:"uppercase",letterSpacing:.5,fontWeight:700}}>{who}</div>
                <div style={{fontSize:10,color:C.muted,marginBottom:4}}>{label}</div>
                <div style={{fontSize:19,fontWeight:700,color,marginBottom:4}}>
                  {data.length?data.at(-1):<span style={{color:C.faint,fontSize:14}}>—</span>}
                  {data.length>0&&<span style={{fontSize:10,color:C.dim,marginLeft:3}}>{unit}</span>}
                </div>
                <BoundedSparkline data={data} color={color}/>
              </div>
        ))}
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
  useEffect(()=>{sheetsRead("Habits").then(rows=>setHabits(rows.map(r=>({id:String(r.ID),name:r.Name,icon:r.Icon||"⭐",done:r.Done===true||r.Done==="TRUE"})))).catch(e=>console.error(e));},[]);
  const toggle=async id=>{const h=habits.find(x=>x.id===id),nd=!h.done;setHabits(hs=>hs.map(x=>x.id===id?{...x,done:nd}:x));try{await sheetsUpdate("Habits","ID",id,{Done:nd?"TRUE":"FALSE"});}catch(e){console.error(e);}};
  const add=async()=>{if(!newHabit.trim())return;const h={id:String(Date.now()),name:newHabit.trim(),icon:"⭐",done:false};setHabits(hs=>[...hs,h]);setNewHabit("");try{await sheetsAppend("Habits",{ID:h.id,Name:h.name,Icon:h.icon,Done:"FALSE"});}catch(e){console.error(e);}};
  const remove=async id=>{setHabits(hs=>hs.filter(x=>x.id!==id));try{await sheetsDelete("Habits","ID",id);}catch(e){console.error(e);}};
  const done=habits.filter(h=>h.done).length,pct=habits.length?Math.round((done/habits.length)*100):0;
  return(
    <div>
      <h2 style={H2}>Daily Habits</h2>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18,background:C.card,borderRadius:12,padding:"12px 16px"}}>
        <svg width={60} height={60} style={{flexShrink:0}}>
          <circle cx={30} cy={30} r={24} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6}/>
          <circle cx={30} cy={30} r={24} fill="none" stroke={C.accent} strokeWidth={6}
            strokeDasharray={`${2*Math.PI*24}`} strokeDashoffset={`${2*Math.PI*24*(1-pct/100)}`}
            strokeLinecap="round" transform="rotate(-90 30 30)" style={{transition:"stroke-dashoffset 0.5s"}}/>
          <text x={30} y={35} textAnchor="middle" fill={C.accentText} fontSize={13} fontWeight={700}>{pct}%</text>
        </svg>
        <div><div style={{fontSize:18,fontWeight:700,color:C.text}}>{done} / {habits.length}</div><div style={{fontSize:12,color:C.muted}}>habits today</div></div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {habits.map(h=>(
          <div key={h.id} style={{display:"flex",alignItems:"center",gap:10,
            background:h.done?C.accentSoft:C.card,
            border:`1px solid ${h.done?C.accentBorder:C.border}`,
            borderRadius:10,padding:"10px 13px",transition:"all 0.2s"}}>
            <span style={{fontSize:18}}>{h.icon}</span>
            <span onClick={()=>toggle(h.id)} style={{flex:1,fontSize:14,color:h.done?C.accentText:C.text,cursor:"pointer"}}>{h.name}</span>
            <div onClick={()=>toggle(h.id)} style={{width:22,height:22,borderRadius:"50%",cursor:"pointer",
              background:h.done?C.accent:"transparent",
              border:`2px solid ${h.done?C.accent:"rgba(255,255,255,0.2)"}`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:11,color:"#fff",fontWeight:700,transition:"all 0.2s"}}>{h.done?"✓":""}</div>
            <span onClick={()=>remove(h.id)} style={{color:C.faint,cursor:"pointer",fontSize:16,marginLeft:4}}>×</span>
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
// RESTAURANTS — show saved favorites from sheet; search is placeholder until key added
// ═══════════════════════════════════════════════════════════════════════════════
function Restaurants() {
  const [saved,setSaved]=useState([]);
  const [zip,setZip]=useState(""), [cuisine,setCuisine]=useState("");
  const [results,setResults]=useState([]), [searching,setSearching]=useState(false);
  const [filter,setFilter]=useState("All");
  const [adding,setAdding]=useState(false);
  const [newR,setNewR]=useState({name:"",cuisine:"",zip:"",rating:"",notes:""});

  useEffect(()=>{sheetsRead("Restaurants").then(rows=>setSaved(rows.map(r=>({name:r.Name,cuisine:r.Cuisine,zip:r.Zip,rating:r.Rating,notes:r.Notes})))).catch(e=>console.error(e));},[]);

  const cuisines=["All",...new Set(saved.map(r=>r.cuisine).filter(Boolean))];
  const filtered=filter==="All"?saved:saved.filter(r=>r.cuisine===filter);

  // Real Places API search — replace PLACES_KEY with your actual key
  const PLACES_KEY = "YOUR_PLACES_API_KEY_HERE";
  const search=async()=>{
    if (!zip.trim()&&!cuisine.trim()) return;
    setSearching(true);
    try {
      if (PLACES_KEY === "YOUR_PLACES_API_KEY_HERE") {
        // Demo mode — show saved favorites filtered by cuisine input
        const q = cuisine.toLowerCase();
        const demo = saved.filter(r => !q || (r.cuisine||"").toLowerCase().includes(q) || (r.name||"").toLowerCase().includes(q));
        setResults(demo.length ? demo : [{name:"Add a Google Places API key to search live",cuisine,zip,rating:"",notes:""}]);
      } else {
        const res=await fetch(`https://places.googleapis.com/v1/places:searchText`,{
          method:"POST",
          headers:{"Content-Type":"application/json","X-Goog-Api-Key":PLACES_KEY,"X-Goog-FieldMask":"places.displayName,places.formattedAddress,places.rating"},
          body:JSON.stringify({textQuery:`${cuisine||"restaurant"} near ${zip}`,maxResultCount:6}),
        });
        const data=await res.json();
        setResults((data.places||[]).map(p=>({name:p.displayName?.text||"Unknown",cuisine,zip,rating:p.rating||"",notes:p.formattedAddress||""})));
      }
    } catch(e){console.error(e);}
    setSearching(false);
  };

  const saveToSheet=async r=>{setSaved(s=>[...s,r]);try{await sheetsAppend("Restaurants",{Name:r.name,Cuisine:r.cuisine,Zip:r.zip,Rating:r.rating,Notes:r.notes});}catch(e){console.error(e);}};

  const addManual=async()=>{
    if(!newR.name.trim())return;
    const r={...newR};setSaved(s=>[...s,r]);setNewR({name:"",cuisine:"",zip:"",rating:"",notes:""});setAdding(false);
    try{await sheetsAppend("Restaurants",{Name:r.name,Cuisine:r.cuisine,Zip:r.zip,Rating:r.rating,Notes:r.notes});}catch(e){console.error(e);}
  };

  return(
    <div>
      <h2 style={H2}>Restaurants</h2>
      <div style={{background:C.card,borderRadius:12,padding:14,marginBottom:16}}>
        <div style={{fontSize:12,color:C.muted,marginBottom:8}}>🔍 Search</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <input value={zip} onChange={e=>setZip(e.target.value)} placeholder="ZIP code" style={INP}/>
          <input value={cuisine} onChange={e=>setCuisine(e.target.value)} placeholder="Cuisine type" style={INP}/>
        </div>
        <button onClick={search} disabled={searching} style={{...PB,width:"100%",opacity:searching?0.6:1}}>{searching?"Searching…":"Search"}</button>
        {results.length>0&&<div style={{marginTop:10}}>{results.map((r,i)=>(
          <div key={i} style={{background:C.cardHi,borderRadius:8,padding:"9px 12px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:600,color:C.text,fontSize:14}}>{r.name}</div>
              <div style={{fontSize:11,color:C.muted}}>{r.rating?`⭐ ${r.rating} · `:""}{r.cuisine}</div>
            </div>
            <button onClick={()=>saveToSheet(r)} style={{...GB,fontSize:11,padding:"5px 10px"}}>+ Save</button>
          </div>
        ))}</div>}
      </div>

      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        {cuisines.map(c=><button key={c} onClick={()=>setFilter(c)} style={{background:filter===c?C.accent:"rgba(255,255,255,0.07)",color:filter===c?"#fff":C.muted,border:"none",borderRadius:20,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:filter===c?700:400}}>{c}</button>)}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.map((r,i)=>(
          <div key={i} style={{background:C.card,borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontWeight:600,color:C.text,fontSize:15}}>{r.name}</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>{[r.cuisine,r.zip,r.rating?`⭐ ${r.rating}`:null].filter(Boolean).join(" · ")}</div>
            {r.notes&&<div style={{fontSize:11,color:C.dim,marginTop:3,fontStyle:"italic"}}>{r.notes}</div>}
          </div>
        ))}
      </div>
      {adding?(
        <div style={{background:C.card,borderRadius:12,padding:14,marginTop:12}}>
          {[["Name","name"],["Cuisine","cuisine"],["ZIP","zip"],["Rating","rating"],["Notes","notes"]].map(([l,k])=>(
            <div key={k} style={{marginBottom:8}}><label style={{fontSize:11,color:C.dim,display:"block",marginBottom:3}}>{l}</label>
            <input value={newR[k]} onChange={e=>setNewR(n=>({...n,[k]:e.target.value}))} style={INP}/></div>
          ))}
          <div style={{display:"flex",gap:8}}><button onClick={addManual} style={PB}>Add</button><button onClick={()=>setAdding(false)} style={GB}>Cancel</button></div>
        </div>
      ):<button onClick={()=>setAdding(true)} style={{marginTop:12,width:"100%",background:"rgba(255,255,255,0.04)",border:`1px dashed ${C.border}`,borderRadius:10,color:C.dim,padding:"10px",cursor:"pointer",fontSize:13}}>+ Add Manually</button>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVIES — AI recs via Anthropic API (browser-accessible endpoint)
// ═══════════════════════════════════════════════════════════════════════════════
function Movies() {
  const [movies,setMovies]=useState([]);
  const [aiPrompt,setAiPrompt]=useState(""), [aiRecs,setAiRecs]=useState([]), [aiLoading,setAiLoading]=useState(false);
  const [aiError,setAiError]=useState("");
  const [filter,setFilter]=useState("All");
  useEffect(()=>{sheetsRead("Movies").then(rows=>setMovies(rows.map(r=>({title:r.Title,genre:r.Genre,where:r.Where,status:r.Status,rating:r.Rating||null})))).catch(e=>console.error(e));},[]);

  const getAiRecs=async()=>{
    if(!aiPrompt.trim())return;
    setAiLoading(true);setAiError("");setAiRecs([]);
    try{
      const watched=movies.filter(m=>m.status==="Watched").map(m=>m.title).join(", ")||"various films";
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",max_tokens:800,
          messages:[{role:"user",content:`You are a helpful movie recommendation assistant. The user has watched: ${watched}. They want: "${aiPrompt}". Reply ONLY with a valid JSON array (no markdown, no explanation) of exactly 4 objects: [{"title":"","genre":"","where":"Netflix/Hulu/Max/etc","reason":"one sentence"}]`}]
        }),
      });
      if(!res.ok){const t=await res.text();throw new Error(`API ${res.status}: ${t}`);}
      const data=await res.json();
      const text=data.content?.map(c=>c.text||"").join("")||"";
      const clean=text.replace(/```json|```/g,"").trim();
      setAiRecs(JSON.parse(clean));
    }catch(e){
      console.error("Movies AI error:",e);
      setAiError("AI recommendations unavailable — the app needs an Anthropic API key configured server-side for this feature.");
    }
    setAiLoading(false);
  };

  const addToList=async m=>{const e={title:m.title,genre:m.genre,where:m.where,status:"Want to watch",rating:null};setMovies(mv=>[...mv,e]);try{await sheetsAppend("Movies",{Title:e.title,Genre:e.genre,Where:e.where,Status:e.status,Rating:""});}catch(e){console.error(e);}};
  const statuses=["All","Want to watch","Watched"];
  const filtered=filter==="All"?movies:movies.filter(m=>m.status===filter);

  return(
    <div>
      <h2 style={H2}>Movies</h2>
      <div style={{background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.25)",borderRadius:12,padding:14,marginBottom:16}}>
        <div style={{fontSize:12,color:"#a78bfa",marginBottom:8}}>✨ AI Recommendations</div>
        <div style={{display:"flex",gap:8}}>
          <input value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&getAiRecs()} placeholder="e.g. 'funny' or 'like Dune'" style={{...INP,flex:1}}/>
          <button onClick={getAiRecs} disabled={aiLoading} style={{background:aiLoading?"#374151":"#8b5cf6",color:"#fff",border:"none",borderRadius:7,padding:"8px 14px",cursor:aiLoading?"default":"pointer",fontWeight:700}}>{aiLoading?"…":"Go"}</button>
        </div>
        {aiError&&<div style={{marginTop:8,fontSize:11,color:"#f87171"}}>{aiError}</div>}
        {aiRecs.length>0&&<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:7}}>{aiRecs.map((r,i)=>(
          <div key={i} style={{background:"rgba(139,92,246,0.15)",borderRadius:8,padding:"9px 12px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div><div style={{fontWeight:600,color:C.text,fontSize:14}}>{r.title}</div><div style={{fontSize:11,color:"#a78bfa"}}>{r.genre} · {r.where}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{r.reason}</div></div>
            <button onClick={()=>addToList(r)} style={{...GB,fontSize:11,padding:"4px 9px",marginLeft:8,flexShrink:0}}>+ Add</button>
          </div>
        ))}</div>}
      </div>
      <div style={{display:"flex",gap:6,marginBottom:12}}>{statuses.map(s=><button key={s} onClick={()=>setFilter(s)} style={{background:filter===s?C.accent:"rgba(255,255,255,0.07)",color:filter===s?"#fff":C.muted,border:"none",borderRadius:20,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:filter===s?700:400}}>{s}</button>)}</div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {filtered.map((m,i)=>(
          <div key={i} style={{background:C.card,borderRadius:10,padding:"11px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontWeight:600,color:C.text,fontSize:14}}>{m.title}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{m.genre} · {m.where}</div></div>
            <div style={{fontSize:11,padding:"3px 8px",borderRadius:20,background:m.status==="Watched"?C.accentSoft:"rgba(251,191,36,0.15)",color:m.status==="Watched"?C.accentText:"#fbbf24"}}>{m.status}</div>
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
  const statusColor={"Read":C.accent,"Reading":"#fbbf24","Want to Read":C.muted};
  useEffect(()=>{sheetsRead("Books").then(rows=>setBooks(rows.map(r=>({title:r.Title,author:r.Author,category:r.Category,status:r.Status})))).catch(e=>console.error(e));},[]);
  const add=async()=>{if(!newBook.title.trim())return;const b={...newBook};setBooks(bs=>[...bs,b]);setNewBook({title:"",author:"",category:"",status:"Want to Read"});setAdding(false);try{await sheetsAppend("Books",{Title:b.title,Author:b.author,Category:b.category,Status:b.status});}catch(e){console.error(e);}};
  const startEdit=i=>{setEditIdx(i);setEditBook({...books[i]});};
  const saveEdit=async()=>{const old=books[editIdx].title;setBooks(bs=>bs.map((b,i)=>i===editIdx?{...editBook}:b));setEditIdx(null);try{await sheetsUpdate("Books","Title",old,{Title:editBook.title,Author:editBook.author,Category:editBook.category,Status:editBook.status});}catch(e){console.error(e);}};
  const allFilters=["All",...statuses,...new Set(books.map(b=>b.category).filter(Boolean))].filter((v,i,a)=>a.indexOf(v)===i);
  const filtered=filter==="All"?books:books.filter(b=>b.category===filter||b.status===filter);
  return(
    <div>
      <h2 style={H2}>Books</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
        {statuses.map(s=><div key={s} style={{background:C.card,borderRadius:10,padding:"10px 12px",textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:statusColor[s]}}>{books.filter(b=>b.status===s).length}</div><div style={{fontSize:10,color:C.dim,marginTop:2}}>{s}</div></div>)}
      </div>
      <div style={{display:"flex",gap:5,marginBottom:12,flexWrap:"wrap"}}>{allFilters.map(f=><button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?C.accent:"rgba(255,255,255,0.07)",color:filter===f?"#fff":C.muted,border:"none",borderRadius:20,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:filter===f?700:400}}>{f}</button>)}</div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {filtered.map((b,i)=>{
          const ri=books.indexOf(b);
          if(editIdx===ri&&editBook)return(
            <div key={i} style={{background:C.cardHi,borderRadius:10,padding:"12px 14px"}}>
              {[["Title","title"],["Author","author"],["Category","category"]].map(([l,k])=>(<div key={k} style={{marginBottom:7}}><label style={{fontSize:10,color:C.dim,display:"block",marginBottom:2}}>{l}</label><input value={editBook[k]} onChange={e=>setEditBook(eb=>({...eb,[k]:e.target.value}))} style={INP}/></div>))}
              <div style={{marginBottom:10}}><label style={{fontSize:10,color:C.dim,display:"block",marginBottom:2}}>Status</label><select value={editBook.status} onChange={e=>setEditBook(eb=>({...eb,status:e.target.value}))} style={SEL}>{statuses.map(s=><option key={s}>{s}</option>)}</select></div>
              <div style={{display:"flex",gap:8}}><button onClick={saveEdit} style={PB}>Save</button><button onClick={()=>setEditIdx(null)} style={GB}>Cancel</button></div>
            </div>
          );
          return(
            <div key={i} style={{background:C.card,borderRadius:10,padding:"11px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{flex:1}}><div style={{fontWeight:600,color:C.text,fontSize:14}}>{b.title}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{b.author} · {b.category}</div></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:`${statusColor[b.status]}22`,color:statusColor[b.status],whiteSpace:"nowrap"}}>{b.status}</div>
                <button onClick={()=>startEdit(ri)} style={{background:"transparent",border:"none",color:C.dim,cursor:"pointer",fontSize:14,padding:"2px 4px"}}>✏️</button>
              </div>
            </div>
          );
        })}
      </div>
      {adding?(
        <div style={{background:C.card,borderRadius:12,padding:14,marginTop:12}}>
          {[["Title","title"],["Author","author"],["Category","category"]].map(([l,k])=>(<div key={k} style={{marginBottom:8}}><label style={{fontSize:11,color:C.dim,display:"block",marginBottom:3}}>{l}</label><input value={newBook[k]} onChange={e=>setNewBook(n=>({...n,[k]:e.target.value}))} style={INP}/></div>))}
          <div style={{marginBottom:10}}><label style={{fontSize:11,color:C.dim,display:"block",marginBottom:3}}>Status</label><select value={newBook.status} onChange={e=>setNewBook(n=>({...n,status:e.target.value}))} style={SEL}>{statuses.map(s=><option key={s}>{s}</option>)}</select></div>
          <div style={{display:"flex",gap:8}}><button onClick={add} style={PB}>Add</button><button onClick={()=>setAdding(false)} style={GB}>Cancel</button></div>
        </div>
      ):<button onClick={()=>setAdding(true)} style={{marginTop:12,width:"100%",background:"rgba(255,255,255,0.04)",border:`1px dashed ${C.border}`,borderRadius:10,color:C.dim,padding:"10px",cursor:"pointer",fontSize:13}}>+ Add Book</button>}
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
  const statusColor={"Done":C.accent,"Planned":"#fbbf24","Want to do":C.muted};
  useEffect(()=>{
    sheetsRead("Activities").then(rows=>setActivities(rows.map(r=>({name:r.Name,type:r.Type,status:r.Status,date:r.Date||""})))).catch(e=>console.error(e));
    sheetsRead("Config").then(rows=>{const tr=rows.find(r=>r.Key==="ActivityTypes");if(tr?.Value)setActTypes(tr.Value.split(",").map(t=>t.trim()).filter(Boolean));}).catch(()=>{});
  },[]);
  const saveTypes=async types=>{setActTypes(types);try{await sheetsUpsert("Config","Key","ActivityTypes",{Key:"ActivityTypes",Value:types.join(",")});}catch(e){console.error(e);}};
  const addType=async()=>{if(!newType.trim()||actTypes.includes(newType.trim()))return;await saveTypes([...actTypes,newType.trim()]);setNewType("");};
  const removeType=async t=>{await saveTypes(actTypes.filter(x=>x!==t));};
  const add=async()=>{if(!newAct.name.trim())return;const a={...newAct};setActivities(acts=>[...acts,a]);setNewAct({name:"",type:actTypes[0]||"Local",status:"Want to do",date:""});setAdding(false);try{await sheetsAppend("Activities",{Name:a.name,Type:a.type,Status:a.status,Date:a.date});}catch(e){console.error(e);}};
  const startEdit=i=>{setEditIdx(i);setEditAct({...activities[i]});};
  const saveEdit=async()=>{const old=activities[editIdx].name;setActivities(acts=>acts.map((a,i)=>i===editIdx?{...editAct}:a));setEditIdx(null);try{await sheetsUpdate("Activities","Name",old,{Name:editAct.name,Type:editAct.type,Status:editAct.status,Date:editAct.date});}catch(e){console.error(e);}};
  const allFilters=["All",...statuses,...actTypes].filter((v,i,a)=>a.indexOf(v)===i);
  const filtered=filter==="All"?activities:activities.filter(a=>a.type===filter||a.status===filter);
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h2 style={{...H2,margin:0}}>Activities & Trips</h2>
        <button onClick={()=>setManagingTypes(m=>!m)} style={{...GB,fontSize:11,padding:"5px 10px"}}>{managingTypes?"Done":"⚙ Types"}</button>
      </div>
      {managingTypes&&(<div style={{background:C.card,borderRadius:12,padding:14,marginBottom:14}}><div style={{fontSize:12,color:C.muted,marginBottom:10}}>Activity Types</div><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>{actTypes.map(t=><span key={t} style={{background:C.cardHi,borderRadius:20,padding:"4px 10px",fontSize:12,color:"#d1d5db",display:"flex",alignItems:"center",gap:6}}>{t}<span onClick={()=>removeType(t)} style={{cursor:"pointer",color:C.dim,fontSize:14}}>×</span></span>)}</div><div style={{display:"flex",gap:8}}><input value={newType} onChange={e=>setNewType(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addType()} placeholder="New type…" style={{...INP,flex:1}}/><button onClick={addType} style={PB}>Add</button></div></div>)}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>{statuses.map(s=><div key={s} style={{background:C.card,borderRadius:10,padding:"10px 12px",textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:statusColor[s]}}>{activities.filter(a=>a.status===s).length}</div><div style={{fontSize:10,color:C.dim,marginTop:2}}>{s}</div></div>)}</div>
      <div style={{display:"flex",gap:5,marginBottom:12,flexWrap:"wrap"}}>{allFilters.map(f=><button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?C.accent:"rgba(255,255,255,0.07)",color:filter===f?"#fff":C.muted,border:"none",borderRadius:20,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:filter===f?700:400}}>{f}</button>)}</div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {filtered.map((a,i)=>{
          const ri=activities.indexOf(a);
          if(editIdx===ri&&editAct)return(<div key={i} style={{background:C.cardHi,borderRadius:10,padding:"12px 14px"}}>{[["Name","name"],["Date","date"]].map(([l,k])=>(<div key={k} style={{marginBottom:7}}><label style={{fontSize:10,color:C.dim,display:"block",marginBottom:2}}>{l}</label><input value={editAct[k]} onChange={e=>setEditAct(ea=>({...ea,[k]:e.target.value}))} style={INP}/></div>))}{[["Type","type",actTypes],["Status","status",statuses]].map(([l,k,opts])=>(<div key={k} style={{marginBottom:8}}><label style={{fontSize:10,color:C.dim,display:"block",marginBottom:2}}>{l}</label><select value={editAct[k]} onChange={e=>setEditAct(ea=>({...ea,[k]:e.target.value}))} style={SEL}>{opts.map(o=><option key={o}>{o}</option>)}</select></div>))}<div style={{display:"flex",gap:8}}><button onClick={saveEdit} style={PB}>Save</button><button onClick={()=>setEditIdx(null)} style={GB}>Cancel</button></div></div>);
          return(<div key={i} style={{background:C.card,borderRadius:10,padding:"11px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{flex:1}}><div style={{fontWeight:600,color:C.text,fontSize:14}}>{a.name}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{a.type}{a.date?` · ${a.date}`:""}</div></div><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:`${statusColor[a.status]}22`,color:statusColor[a.status],whiteSpace:"nowrap"}}>{a.status}</div><button onClick={()=>startEdit(ri)} style={{background:"transparent",border:"none",color:C.dim,cursor:"pointer",fontSize:14,padding:"2px 4px"}}>✏️</button></div></div>);
        })}
      </div>
      {adding?(<div style={{background:C.card,borderRadius:12,padding:14,marginTop:12}}>{[["Name","name"],["Date (optional)","date"]].map(([l,k])=>(<div key={k} style={{marginBottom:8}}><label style={{fontSize:11,color:C.dim,display:"block",marginBottom:3}}>{l}</label><input value={newAct[k]} onChange={e=>setNewAct(n=>({...n,[k]:e.target.value}))} style={INP}/></div>))}{[["Type","type",actTypes],["Status","status",statuses]].map(([l,k,opts])=>(<div key={k} style={{marginBottom:8}}><label style={{fontSize:11,color:C.dim,display:"block",marginBottom:3}}>{l}</label><select value={newAct[k]} onChange={e=>setNewAct(n=>({...n,[k]:e.target.value}))} style={SEL}>{opts.map(o=><option key={o}>{o}</option>)}</select></div>))}<div style={{display:"flex",gap:8}}><button onClick={add} style={PB}>Add</button><button onClick={()=>setAdding(false)} style={GB}>Cancel</button></div></div>):<button onClick={()=>setAdding(true)} style={{marginTop:12,width:"100%",background:"rgba(255,255,255,0.04)",border:`1px dashed ${C.border}`,borderRadius:10,color:C.dim,padding:"10px",cursor:"pointer",fontSize:13}}>+ Add Activity</button>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP SHELL — with theme picker
// ═══════════════════════════════════════════════════════════════════════════════
const TABS=[{id:"weekly",label:"Calendar",icon:"📅"},{id:"todos",label:"To-Do",icon:"✅"},{id:"fitness",label:"Fitness",icon:"💪"},{id:"habits",label:"Habits",icon:"💚"},{id:"restaurants",label:"Food",icon:"🍽️"},{id:"movies",label:"Movies",icon:"🎬"},{id:"books",label:"Books",icon:"📚"},{id:"activities",label:"Activities",icon:"🗺️"}];
const SECTIONS={weekly:WeeklyPlan,todos:Todos,fitness:Fitness,habits:Habits,restaurants:Restaurants,movies:Movies,books:Books,activities:Activities};

// Theme context — simple module-level so all components see it
let _activeThemeKey = localStorage.getItem("hb-theme") || "red";

export default function HomeBase() {
  const [tab,setTab]=useState("weekly");
  const [themeKey,setThemeKey]=useState(_activeThemeKey);
  const [showThemes,setShowThemes]=useState(false);
  const theme = THEMES[themeKey] || THEMES.cerise;
  // Update module-level C so all child components pick it up
  C = buildC(theme);
  _activeThemeKey = themeKey;

  const Section=SECTIONS[tab];
  const todayLabel=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
  const pickTheme = key => { setThemeKey(key); localStorage.setItem("hb-theme",key); setShowThemes(false); };

  return(
    <div style={{minHeight:"100vh",background:theme.bg,fontFamily:"'DM Sans',sans-serif",color:C.text}}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
      <div style={{padding:"14px 14px 10px",borderBottom:`1px solid ${C.border}`,background:"rgba(0,0,0,0.3)",backdropFilter:"blur(12px)",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div>
            <div style={{fontSize:20,fontWeight:700,fontFamily:"'Playfair Display',serif",
              background:theme.titleGrad,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1}}>Home Base</div>
            <div style={{fontSize:10,color:C.dim,marginTop:1}}>{todayLabel}</div>
          </div>
          {/* Theme picker */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowThemes(s=>!s)}
              style={{background:C.accentGlow,border:`1px solid ${C.accentBorder}`,borderRadius:20,padding:"5px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:7}}>
              <span style={{width:12,height:12,borderRadius:"50%",background:theme.accent,display:"inline-block",flexShrink:0}}/>
              <span style={{fontSize:11,color:C.accentText,fontWeight:600}}>{theme.name}</span>
            </button>
            {showThemes&&(
              <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#1a0d10",border:`1px solid ${C.accentBorder}`,borderRadius:12,padding:10,minWidth:140,zIndex:100,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
                <div style={{fontSize:10,color:C.dim,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>Theme</div>
                {Object.entries(THEMES).map(([key,t])=>(
                  <button key={key} onClick={()=>pickTheme(key)}
                    style={{width:"100%",display:"flex",alignItems:"center",gap:10,background:themeKey===key?"rgba(255,255,255,0.08)":"transparent",border:"none",borderRadius:8,padding:"8px 10px",cursor:"pointer",marginBottom:3}}>
                    <span style={{width:14,height:14,borderRadius:"50%",background:t.accent,display:"inline-block",flexShrink:0,border:themeKey===key?"2px solid #fff":"2px solid transparent"}}/>
                    <span style={{fontSize:12,color:themeKey===key?"#fff":C.muted}}>{t.name}</span>
                    {themeKey===key&&<span style={{marginLeft:"auto",fontSize:10,color:C.accentText}}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
          {TABS.map(t=>{
            const active=tab===t.id;
            return <button key={t.id} onClick={()=>{setTab(t.id);setShowThemes(false);}}
              style={{background:active?C.accentGlow:"rgba(255,255,255,0.04)",
                border:`1px solid ${active?C.accentBorder:C.border}`,
                borderRadius:9,padding:"7px 4px",cursor:"pointer",
                display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                transition:"all 0.15s",transform:active?"scale(1.03)":"scale(1)"}}>
              <span style={{fontSize:17,lineHeight:1}}>{t.icon}</span>
              <span style={{fontSize:10,fontWeight:active?700:400,color:active?C.accentText:C.dim}}>{t.label}</span>
            </button>;
          })}
        </div>
      </div>
      <div style={{padding:"16px 14px 48px",maxWidth:820,margin:"0 auto"}}><Section key={themeKey}/></div>
    </div>
  );
}
