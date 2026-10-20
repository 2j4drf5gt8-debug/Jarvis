/* Jarvis – persönliche Trainings- und Ernährungs-App */
(async () => {
"use strict";
const $ = id => document.getElementById(id);
const VERSION = 4;
const DEFAULT_SETTINGS = {
  supplements:["Kreatin (5 g)"], cycle:["U1","U2","Pause"], restSeconds:150,
  proteinTarget:160, favorites:[], plan:{U1:[],U2:[]},
  reminders:{kreatin:{on:true,time:"21:00"},training:{on:true,time:"17:00"}},
  goalDate:"2027-01-31", goalLabel:"Ende des Auslandssemesters", playlistUrl:"", soundcloudUrl:"", autoMusic:"soundcloud", startSound:true
};
const iso = d => d.toLocaleDateString("sv-SE");
const TODAY = () => iso(new Date());
const shift = (s,n) => { const d=new Date(s+"T12:00:00"); d.setDate(d.getDate()+n); return iso(d); };
const dLabel = ds => `${ds.slice(8)}.${ds.slice(5,7)}.`;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const r = n => Math.round(Number(n)||0);
const de = (n,d=1) => { const v=Math.round((Number(n)||0)*10**d)/10**d; return String(v).replace(".",","); };
const fmtKg = k => k==null ? "KG" : de(k);
const e1 = (kg,reps) => kg*(1+reps/30);
const nowTime = () => new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});

let tab = "heute", cur = TODAY(), settings = structuredClone(DEFAULT_SETTINGS);
let unit = null, unitManual = false, selEx = null, selMeas = "biceps";
const days = new Map();
let reports = [];
const notes = new Map();
let noteQ = "", noteTag = "";
let sb = null, session = null;
const extraRows = {};

/* ---------------- storage + offline queue ---------------- */
const LS = {get:k=>{try{return JSON.parse(localStorage.getItem(k));}catch(e){return null;}}, set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
let pending = LS.get("jv-pending") || {};
const setStatus = t => { $("status").textContent = t; };
const cacheAll = () => LS.set("jv-cache",{settings,days:[...days.values()],reports,notes:[...notes.values()]});
let flushing=false;
async function flush(){
  if(flushing||!sb||!session) return; flushing=true;
  try{
    for(const [path,data] of Object.entries(pending)){
      const [table,id]=path.split("/");
      const {error}= data===null ? await sb.from(table).delete().eq("id",id) : await sb.from(table).upsert({id,data,updated_at:new Date().toISOString()});
      if(error) throw error;
      delete pending[path]; LS.set("jv-pending",pending);
    }
    setStatus("Synchronisiert");
  }catch(e){ setStatus(navigator.onLine?"Speichern fehlgeschlagen, neuer Versuch folgt":"Offline – wird später gespeichert"); }
  flushing=false;
}
function write(path,data){ pending[path]=data; LS.set("jv-pending",pending); cacheAll(); return flush(); }
const emptyDay = date => ({date, meals:[], supps:{}, training:{type:"",sets:[]}, weight:null, waist:null});
const getDay = date => { const d=structuredClone(days.get(date)||emptyDay(date)); d.meals=d.meals||[]; d.supps=d.supps||{}; d.training=d.training||{type:"",sets:[]}; d.training.sets=d.training.sets||[]; return d; };
const saveDay = d => { days.set(d.date,d); render(); return write("days/"+d.date,d); };
const saveSettings = s => { settings=s; render(); return write("settings/main",s); };
const sorted = () => [...days.values()].sort((a,b)=>a.date<b.date?-1:1);
const totals = d => (d.meals||[]).reduce((a,m)=>({kcal:a.kcal+(+m.kcal||0),carbs:a.carbs+(+m.carbs||0),protein:a.protein+(+m.protein||0),fat:a.fat+(+m.fat||0)}),{kcal:0,carbs:0,protein:0,fat:0});

/* ---------------- ui helpers ---------------- */
let toastT=null;
function toast(msg,cls=""){ const t=$("toast"); t.textContent=msg; t.className="toast "+cls; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,2600); }
function openSheet(html,onMount){
  const host=$("sheethost");
  host.innerHTML=`<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
  $("scrim").addEventListener("click",e=>{ if(e.target.id==="scrim") closeSheet(); });
  onMount && onMount(host.querySelector(".sheet"));
}
function closeSheet(){ stopScan(); $("sheethost").innerHTML=""; }
const ICON = {
  check:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  plus:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  star:'<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  music:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  camera:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
};

/* ---------------- training logic ---------------- */
function history(name){
  const out=[]; sorted().forEach(d=>{ const s=(d.training?.sets||[]).find(x=>x.name===name); if(s&&s.detail?.length) out.push({date:d.date,detail:s.detail}); }); return out;
}
// bester Satz = höchstes Gewicht, bei Gleichstand mehr Wiederholungen (echte Werte, keine Schätzung)
function bestSet(detail){ return detail.reduce((b,x)=>better(x,b)?x:b,null); }
function better(a,b){ if(!a) return false; if(!b) return true; const ak=a.kg||0, bk=b.kg||0; return ak>bk || (ak===bk && (a.reps||0)>(b.reps||0)); }
const fmtSet = x => x ? (x.kg ? `${fmtKg(x.kg)} kg × ${x.reps}` : `${x.reps} Wdh`) : "–";
function bestEver(h){ return h.reduce((b,x)=>{ const c=bestSet(x.detail); return better(c,b)?c:b; },null); }
const step = kg => kg>=40?5:kg>=20?2:1;
function suggestion(p,last){
  const [lo,hi]=p.reps;
  if(!last) return {text:`${p.sets} × ${lo}–${hi} Wdh, Gewicht frei wählen`,kg:null,reps:lo};
  const d=last.detail, top=Math.max(0,...d.map(x=>x.kg||0)), bw=!top;
  const atTop=d.length>=p.sets && d.slice(0,p.sets).every(x=>x.reps>=hi);
  if(bw){
    if(atTop) return {text:`Alle Sätze ${hi}+ → mit Zusatzgewicht starten (z. B. 5 kg)`,kg:5,reps:lo,up:true};
    const g=Math.min(hi,Math.max(...d.map(x=>x.reps))+1); return {text:`Körpergewicht, Ziel ${g}+ Wdh im ersten Satz`,kg:null,reps:g};
  }
  if(atTop){ const nk=Math.round((top+step(top))*10)/10; return {text:`Steigern auf ca. ${fmtKg(nk)} kg × ${lo}+`,kg:nk,reps:lo,up:true}; }
  const g=Math.min(hi,(d[0]?.reps||lo)+1);
  return {text:`${fmtKg(top)} kg halten · Ziel ${g} Wdh im ersten Satz`,kg:top,reps:g};
}
function nextDue(){
  const cyc=settings.cycle||["U1","U2","Pause"], t=TODAY(), tt=days.get(t)?.training?.type;
  if(tt && cyc.includes(tt) && tt!=="Pause") return {unit:tt,today:true};
  const past=sorted().filter(d=>d.date<t && ["U1","U2"].includes(d.training?.type) && (d.training.sets||[]).length).pop();
  if(!past) return {unit:"U1"};
  const i=cyc.indexOf(past.training.type), gap=Math.round((new Date(t)-new Date(past.date))/864e5);
  let u=cyc[(i+1)%cyc.length]; if(u==="Pause" && gap>=2) u=cyc[(i+2)%cyc.length];
  return {unit:u,gap,last:past};
}
function progressData(){
  const ex=new Map();
  sorted().forEach(d=>(d.training?.sets||[]).forEach(s=>{
    const det=s.detail||[]; if(!det.length) return; const b=bestSet(det); if(!b) return;
    const e=ex.get(s.name)||{name:s.name,bw:!b.kg,pts:[]};
    e.pts.push({date:d.date,kg:b.kg||null,reps:b.reps,v:b.kg||b.reps}); ex.set(s.name,e);
  }));
  return [...ex.values()];
}
function classify(e){
  const P=e.pts, f=P[0], l=P[P.length-1];
  const bestBefore=P.slice(0,-1).reduce((b,x)=>better(x,b)?x:b,null);
  const before3=P.slice(0,-3).reduce((b,x)=>better(x,b)?x:b,null);
  let st="stabil";
  if(P.length<3) st="wenig";
  else if(better(l,bestBefore)) st="best";
  else if(P.length>=4 && !P.slice(-3).some(x=>better(x,before3))) st="stagniert";
  const dKg=(l.kg||0)-(f.kg||0), dR=l.reps-f.reps;
  const delta = e.bw ? `${dR>=0?"+":""}${dR} Wdh` : dKg!==0 ? `${dKg>0?"+":""}${de(dKg)} kg` : `${dR>=0?"+":""}${dR} Wdh`;
  const up = e.bw ? dR>=0 : (dKg>0 || (dKg===0 && dR>=0));
  return {f,l,st,delta,up,dropped:!e.bw && l.kg<f.kg};
}
const stChip = st => ({best:'<span class="chip pr">Bestwert</span>',stagniert:'<span class="chip warn">stagniert</span>',wenig:'<span class="chip">wenig Daten</span>',stabil:'<span class="chip">stabil</span>'}[st]);

/* ---------------- streaks ---------------- */
function streaks(){
  const t=TODAY(), pt=+settings.proteinTarget||0;
  const sess=sorted().filter(d=>(d.training?.sets||[]).some(s=>(s.detail||[]).length)).map(d=>d.date);
  let train=0;
  if(sess.length && Math.round((new Date(t)-new Date(sess[sess.length-1]))/864e5)<=2){
    train=1; for(let i=sess.length-1;i>0;i--){ const g=Math.round((new Date(sess[i])-new Date(sess[i-1]))/864e5); if(g<=2) train++; else break; } }
  let prot=0; if(pt){ let day=t; if(totals(days.get(day)||emptyDay(day)).protein<pt) day=shift(day,-1); while(totals(days.get(day)||emptyDay(day)).protein>=pt){prot++;day=shift(day,-1);} }
  const kre=settings.supplements.find(s=>/kreatin/i.test(s)); let k=0;
  if(kre){ let day=t; if(!days.get(day)?.supps?.[kre]) day=shift(day,-1); while(days.get(day)?.supps?.[kre]){k++;day=shift(day,-1);} }
  const left=Math.max(0,Math.ceil((new Date((settings.goalDate||"2027-01-31")+"T12:00:00")-new Date(t+"T12:00:00"))/864e5));
  return {train,prot,kre:k,hasKre:!!kre,left,pt};
}

/* ---------------- charts ---------------- */
function lineChart(pts,{W=360,H=190,label="",avg=null}={}){
  if(!pts.length) return "";
  const pad={l:36,r:20,t:label?26:12,b:22}, vs=pts.map(p=>p.v).concat(avg?avg.map(p=>p.v):[]);
  let lo=Math.min(...vs), hi=Math.max(...vs); const span=(hi-lo)||Math.max(1,hi*0.05); lo-=span*0.15; hi+=span*0.15;
  const x=i=>pad.l+(pts.length===1?0.5:i/(pts.length-1))*(W-pad.l-pad.r), y=v=>pad.t+(H-pad.t-pad.b)*(1-(v-lo)/(hi-lo));
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}">`;
  if(label) s+=`<text x="${pad.l}" y="15" style="fill:var(--fg2);font-weight:500">${esc(label)}</text>`;
  [lo+(hi-lo)*0.15,(lo+hi)/2,hi-(hi-lo)*0.15].forEach(v=>{ s+=`<line x1="${pad.l}" x2="${W-pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pad.l-6}" y="${y(v)+4}" text-anchor="end">${de(v)}</text>`; });
  const line=pts.map((p,i)=>`${x(i)},${y(p.v)}`).join(" ");
  s+=`<defs><linearGradient id="gfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
  if(pts.length>1) s+=`<polygon points="${x(0)},${H-pad.b} ${line} ${x(pts.length-1)},${H-pad.b}" fill="url(#gfill)"/><polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round"/>`;
  if(avg && avg.length>1){ const al=avg.map((p,i)=>`${x(i)},${y(p.v)}`).join(" "); s+=`<polyline points="${al}" fill="none" stroke="var(--pr)" stroke-width="2" stroke-dasharray="5 4"/>`; }
  const every=Math.ceil(pts.length/7);
  pts.forEach((p,i)=>{ s+=`<circle cx="${x(i)}" cy="${y(p.v)}" r="${i===pts.length-1?5:2.8}" fill="var(--accent)"/>`; if(i%every===0||i===pts.length-1) s+=`<text x="${x(i)}" y="${H-6}" text-anchor="middle">${dLabel(p.date)}</text>`; });
  const lv=pts[pts.length-1].v; s+=`<text x="${x(pts.length-1)}" y="${y(lv)-10}" text-anchor="end" style="fill:var(--fg);font-weight:600">${de(lv)}</text>`;
  return s+"</svg>";
}
function barChart(list,{W=360,H=160}={}){
  const pad={l:30,r:4,t:16,b:22}, max=Math.max(1000,...list.map(x=>x.v))*1.15, bw=(W-pad.l-pad.r)/list.length;
  const y=v=>pad.t+(H-pad.t-pad.b)*(1-v/max);
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Kalorien der letzten 7 Tage">`;
  [1000,2000,3000,4000].filter(v=>v<max).forEach(v=>{ s+=`<line x1="${pad.l}" x2="${W-pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pad.l-5}" y="${y(v)+4}" text-anchor="end">${v/1000}k</text>`; });
  list.forEach((d,i)=>{ const bx=pad.l+i*bw+bw*.2,w=bw*.6,h=Math.max(0,H-pad.b-y(d.v));
    s+=`<rect x="${bx}" y="${H-pad.b-h}" width="${w}" height="${h}" rx="5" fill="${d.hl?"var(--accent)":"var(--line2)"}"/><text x="${bx+w/2}" y="${H-7}" text-anchor="middle">${esc(d.l)}</text>`;
    if(d.v) s+=`<text x="${bx+w/2}" y="${H-pad.b-h-5}" text-anchor="middle">${r(d.v)}</text>`; });
  return s+"</svg>";
}

/* ---------------- skyline (eigene, generische Nachtstadt) ---------------- */
const SKYLINE=(()=>{ let seed=7; const rnd=()=>{ seed=(seed*9301+49297)%233280; return seed/233280; };
  const W=400,H=130; let x=0, shapes="", wins="";
  while(x<W){ const w=14+rnd()*26, h=35+rnd()*80, y=H-h;
    shapes+=`M${x},${H}V${y}H${x+w}V${H}Z`;
    if(rnd()>.55){ const cx=x+w/2, sh=10+rnd()*26; shapes+=`M${x+w*.25},${y}L${cx},${y-sh}L${x+w*.75},${y}Z`; }
    for(let wy=y+6; wy<H-6; wy+=9) for(let wx=x+4; wx<x+w-4; wx+=6) if(rnd()>.9) wins+=`<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="2" height="3" fill="#E3A73B" opacity="${(0.35+rnd()*.5).toFixed(2)}"/>`;
    x+=w+1+rnd()*3; }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs><linearGradient id="skyf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#323B47"/><stop offset="1" stop-color="#14181D"/></linearGradient></defs><path d="${shapes}" fill="url(#skyf)"/>${wins}</svg>`; })();

/* ---------------- render ---------------- */
function render(){
  const dt=new Date(cur+"T12:00:00");
  $("dtitle").textContent = {heute:cur===TODAY()?"Heute":dt.toLocaleDateString("de-DE",{day:"numeric",month:"long"}),training:"Training",fortschritt:"Fortschritt",koerper:"Körper",notizen:"Notizen"}[tab];
  $("wday").textContent = cur===TODAY()?dt.toLocaleDateString("de-DE",{weekday:"long"}):dt.toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"short"});
  $("datenav").hidden = !(tab==="heute"||tab==="koerper");
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===tab));
  const v=$("view"); const y=window.scrollY; const ae=document.activeElement?.id;
  const keep={}; v.querySelectorAll("input[id]:not([readonly])").forEach(i=>{ if(i.type!=="file"&&i.value!==""&&i.dataset.dirty) keep[i.id]=i.value; });
  v.innerHTML = ({heute:viewHeute,training:viewTraining,fortschritt:viewFortschritt,koerper:viewKoerper,notizen:viewNotizen})[tab]();
  Object.entries(keep).forEach(([id,val])=>{ const el=$(id); if(el && !el.readOnly){ el.value=val; el.dataset.dirty="1"; } });
  if(ae && $(ae) && $(ae).tagName==="INPUT") { $(ae).focus(); }
  window.scrollTo(0,y);
  if(tab==="koerper") loadPhotos();
}

function viewHeute(){
  const d=getDay(cur), t=totals(d), due=nextDue(), pt=+settings.proteinTarget||0;
  const pct=pt?Math.min(1,t.protein/pt):0, C=2*Math.PI*50;
  const ek={c:t.carbs*4,p:t.protein*4,f:t.fat*9}, es=ek.c+ek.p+ek.f||1;
  const recent=[]; const seen=new Set();
  sorted().reverse().forEach(day=>(day.meals||[]).forEach(m=>{ if(!seen.has(m.name)&&recent.length<8){seen.add(m.name);recent.push(m);} }));
  const favs=settings.favorites||[];
  const quick=[...favs.map(f=>({...f,fav:true})),...recent.filter(m=>!favs.some(f=>f.name===m.name))].slice(0,10);
  const wk=[...Array(7)].map((_,i)=>{const ds=shift(TODAY(),i-6);return{ds,l:new Date(ds+"T12:00:00").toLocaleDateString("de-DE",{weekday:"short"}).slice(0,2),v:totals(days.get(ds)||emptyDay(ds)).kcal,hl:ds===cur};});
  return `
  ${cur===TODAY()?`<section class="card hero"><div class="beam b1"></div><div class="beam b2"></div><div class="fog"></div><div class="sky">${SKYLINE}</div>
    ${(()=>{ const j=jarvisState(); return `<div class="hjar" data-act="jarvis" role="button" tabindex="0" aria-label="Jarvis antippen"><div class="halo"></div><div class="jav">${batSVG(j.mood,118)}</div></div>`; })()}
    <div class="row between"><span class="lbl">Laut Rhythmus heute</span>${due.today&&(getDay(TODAY()).training.sets||[]).length?'<span class="chip" style="color:#fff;border-color:rgba(255,255,255,.35)">läuft</span>':""}</div>
    <div class="row between" style="align-items:flex-end"><div><b>${due.unit==="Pause"?"Pause":due.unit}</b>
      <div class="sub">${due.unit==="Pause"?"Erholung. Morgen geht’s weiter.":(()=>{const pl=settings.plan?.[due.unit]||[];return `${pl.length} Übungen · ${pl.reduce((a,p)=>a+p.sets,0)} Sätze`;})()}${due.last&&!due.today?`<br><span class="muted">Zuletzt ${esc(due.last.training.type)} am ${dLabel(due.last.date)}</span>`:""}</div></div>
      </div>
    ${(()=>{ const j=jarvisState(); return `<div class="hbub"><span class="lbl">Jarvis</span><p id="jline">${esc(j.line)}</p><a class="chatlink" href="${CHAT_URL}" target="_blank" rel="noopener" data-noprop="1">💬 Reden</a></div>`; })()}
    <div class="row" style="gap:6px;justify-content:flex-end">${settings.playlistUrl||settings.soundcloudUrl?`<a class="btn" href="${esc(settings.playlistUrl||settings.soundcloudUrl)}" ${settings.playlistUrl&&settings.soundcloudUrl?'data-act="music"':""} target="_blank" rel="noopener" aria-label="Gym-Playlist öffnen" style="background:rgba(0,0,0,.45);border-color:rgba(255,255,255,.18);color:#fff;padding:10px 12px">${ICON.music}</a>`:""}${due.unit!=="Pause"?`<button class="btn go" data-go="training">Starten</button>`:""}</div>
  </section>`:""}
  ${(()=>{ const st=streaks(); return `<section class="card" style="padding:12px 14px"><div class="streaks">
    <div class="sk big"><b class="num">${st.left}</b><span>Tage bis ${dLabel(settings.goalDate||"2027-01-31")}</span></div>
    <div class="sk"><b class="num">${st.train}</b><span>Einheiten im Rhythmus</span></div>
    ${st.pt?`<div class="sk"><b class="num">${st.prot}</b><span>Tage Eiweißziel</span></div>`:""}
    ${st.hasKre?`<div class="sk"><b class="num">${st.kre}</b><span>Tage Kreatin</span></div>`:""}
  </div></section>`; })()}
  <section class="card">
    <div class="nutri">
      <div class="ring">${pt?`<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" stroke-width="11"/><circle cx="60" cy="60" r="50" fill="none" stroke="var(--prot)" stroke-width="11" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-pct)}"/></svg>`:""}
        <div class="in"><b class="num">${r(t.protein)}</b><span>${pt?`/ ${pt} g`:"g"}<br>Eiweiß</span></div></div>
      <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
        <div class="kcal"><span class="lbl">Kalorien</span><div><b class="num">${r(t.kcal)}</b> <span class="muted">kcal</span></div></div>
        <div class="split" aria-hidden="true"><i style="width:${ek.c/es*100}%;background:var(--carb)"></i><i style="width:${ek.p/es*100}%;background:var(--prot)"></i><i style="width:${ek.f/es*100}%;background:var(--fat)"></i></div>
        <div class="macros3">
          <div><span class="lbl"><i class="dot" style="background:var(--carb)"></i>KH</span><b>${r(t.carbs)} g</b></div>
          <div><span class="lbl"><i class="dot" style="background:var(--prot)"></i>Eiweiß</span><b>${r(t.protein)} g</b></div>
          <div><span class="lbl"><i class="dot" style="background:var(--fat)"></i>Fett</span><b>${r(t.fat)} g</b></div>
        </div>
      </div>
    </div>
    ${pt?`<p class="hint">${t.protein>=pt?"Eiweißziel erreicht.":`Noch ${r(pt-t.protein)} g Eiweiß bis zum Ziel.`}</p>`:""}
  </section>

  <section class="card">
    <div class="row between"><h2>Essen</h2><div class="row" style="gap:6px"><button class="btn sm" data-act="addfood">${ICON.plus}</button>${settings.aiPhoto?`<button class="btn pri sm" data-act="photofood">${ICON.camera}Foto</button>`:`<a class="btn pri sm" href="https://claude.ai/artifact/VZ8JNe1oJvXiYRyhixfAWD" target="_blank" rel="noopener">${ICON.camera}Foto</a>`}</div></div>
    ${quick.length?`<div><div class="lbl" style="margin-bottom:8px">Mit einem Tipp</div><div class="pills">${quick.map((m,i)=>`<button class="pill" data-quick="${i}">${m.fav?'<b style="color:var(--accent)">★</b>':""}<span class="nm">${esc(m.name.replace(/ \(.*?\)/g,""))}</span><span>${r(m.kcal)}</span></button>`).join("")}</div></div>`:""}
    <div>${d.meals.length?d.meals.map((m,i)=>`<div class="meal"><div class="nm" data-edit-meal="${i}" role="button" tabindex="0" aria-label="Mahlzeit bearbeiten"><div>${esc(m.name)}</div><div class="mm">${m.time?esc(m.time)+" · ":""}KH ${r(m.carbs)} · E ${r(m.protein)} · F ${r(m.fat)} <span class="edh">✎</span></div></div>
      <span class="kc">${r(m.kcal)}</span><button class="x" data-fav="${i}" aria-label="Als Favorit speichern" title="Favorit" style="color:${(settings.favorites||[]).some(f=>f.name===m.name)?"var(--pr)":"var(--muted)"}">★</button><button class="x" data-del-meal="${i}" aria-label="Löschen">×</button></div>`).join("")
      :`<p class="empty">Noch nichts eingetragen. Tipp oben auf einen Favoriten, scanne einen Barcode oder schreib Claude, was du gegessen hast.</p>`}</div>
  </section>

  <section class="card" style="padding:12px 14px">
    <div class="row between wrapf"><span class="lbl">Supplements</span><div class="pills">${settings.supplements.map(s=>`<button class="pill ${d.supps[s]?"on":""}" data-supp="${esc(s)}"><span class="ckd">${d.supps[s]?ICON.check:""}</span>${esc(s)}</button>`).join("")||'<span class="hint">Keine angelegt (Einstellungen)</span>'}</div></div>
  </section>

  <section class="card">
    <div class="row between"><h2>Kalorien · 7 Tage</h2><span class="hint">${(()=>{const l=wk.filter(x=>x.v&&countsForAvg(x.ds));return l.length?`Ø ${r(l.reduce((a,x)=>a+x.v,0)/l.length)} kcal (${l.length} ${l.length===1?"Tag":"Tage"})`:"";})()}</span></div>
    ${barChart(wk)}
  </section>`;
}

function viewTraining(){
  const due=nextDue();
  if(!unitManual) unit = due.unit==="Pause" ? (due.last?.training?.type==="U1"?"U2":"U1") : due.unit;
  const today=getDay(TODAY()), plan=settings.plan?.[unit]||[], names=new Set(plan.map(p=>p.name));
  const extra=today.training.sets.filter(s=>!names.has(s.name)).map(s=>({name:s.name,sets:Math.max(2,(s.detail||[]).length),reps:[6,10],free:true}));
  const items=[...plan,...extra];
  const doneSets=today.training.sets.reduce((a,s)=>a+(s.detail||[]).length,0), planSets=items.reduce((a,p)=>a+p.sets,0);
  return `
  ${(()=>{ const st=sessionState(); const tdy=getDay(TODAY()), hasSets=(tdy.training.sets||[]).some(x=>(x.detail||[]).length), done=(tdy.training.sessions||[]).length;
    if(!st) return `<section class="card sessbar idle"><div><div class="lbl">Workout-Timer</div><b class="sess-time num" style="color:var(--fg2)">0:00</b>${done?`<div class="hint">Heute schon ${tdy.training.minutes||0} min trainiert</div>`:""}${hasSets?`<button class="linkbtn" data-act="reset-day" id="reset-day">Training zurücksetzen</button>`:""}</div><button class="btn pri" data-act="sess-start">▶ Start</button></section>`;
    return `<section class="card sessbar live ${st.paused?"paused":""}"><div><div class="lbl"><span class="dotlive"></span>${st.paused?"Pausiert":"Training läuft"}</div><b class="sess-time num">${fmtDur(elapsed(st))}</b></div>
      <div class="row" style="gap:6px"><button class="btn" data-act="sess-pause" aria-label="${st.paused?"Weiter":"Stopp"}">${st.paused?"▶ Weiter":"❚❚ Stopp"}</button><button class="btn" data-act="sess-end" id="sess-end">■ Beenden</button></div></section>`; })()}
  <section class="card">
    <div class="row between"><div class="row" style="gap:8px"><div class="unitsw" role="group" aria-label="Einheit">${["U1","U2"].map(u=>`<button data-unit="${u}" aria-pressed="${u===unit}">${u}</button>`).join("")}</div>${settings.playlistUrl?`<a class="btn sm" href="${esc(settings.playlistUrl)}" target="_blank" rel="noopener">${ICON.music}Spotify</a>`:""}${settings.soundcloudUrl?`<a class="btn sm" href="${esc(settings.soundcloudUrl)}" target="_blank" rel="noopener">${ICON.music}SoundCloud</a>`:""}</div>
      <span class="chip ${doneSets>=planSets&&planSets?"good":"acc"}">${doneSets}/${planSets} Sätze</span></div>
    <div class="prog" aria-hidden="true"><i style="width:${planSets?Math.min(100,doneSets/planSets*100):0}%"></i></div>
    <p class="hint">${due.unit==="Pause"&&!due.today?"Laut Rhythmus ist heute Pause. Du kannst trotzdem loggen.":"Ziele aus deiner letzten Einheit: erst Wiederholungen steigern, dann Gewicht."}</p>
  </section>
  ${items.map((p,idx)=>exCard(p,idx,today)).join("")}
  <section class="card">
    <h3>Übung hinzufügen</h3>
    <form class="row" data-form="free"><input class="field" id="free-name" placeholder="Name der Übung" required><button class="btn" type="submit">${ICON.plus}</button></form>
  </section>`;
}
function exCard(p,idx,today){
  const h=history(p.name).filter(x=>x.date<TODAY()), last=h[h.length-1], sg=suggestion(p,last);
  const logged=today.training.sets.find(s=>s.name===p.name)?.detail||[];
  const n=Math.max(p.sets+(extraRows[p.name]||0),logged.length);
  const allBest=bestEver(h);
  let rows="";
  for(let i=0;i<n;i++){
    const L=logged[i], prev=last?.detail?.[i];
    const kgVal = L ? (L.kg??"") : (logged[i-1]?.kg ?? sg.kg ?? prev?.kg ?? "");
    rows+=`<div class="i">${i+1}</div><div class="prev">${prev?`${fmtKg(prev.kg)}×${prev.reps}`:"–"}</div>
      <input id="kg-${idx}-${i}" type="number" step="0.1" inputmode="decimal" value="${kgVal}" placeholder="KG" ${L?"readonly":""} class="${L?"done-row":""}">
      <input id="rp-${idx}-${i}" type="number" inputmode="numeric" value="${L?L.reps:""}" placeholder="${i===0?sg.reps:(prev?.reps||sg.reps)}" ${L?"readonly":""}>
      <button class="ok ${L?"on":""}" data-set="${idx}-${i}" aria-label="${L?"Satz entfernen":"Satz speichern"}">${ICON.check}</button>`;
    if(L){
      let cls="eq", txt="gleich wie letztes Mal";
      const isPR = !!allBest && better(L,allBest);
      if(isPR){ cls="pr"; txt="★ Neuer Bestwert"; }
      else if(prev){ const dk=(L.kg||0)-(prev.kg||0), dr=L.reps-prev.reps;
        if(dk>0||(dk===0&&dr>0)){cls="up"; txt=dk>0?`+${de(dk)} kg`:`+${dr} Wdh`;} else if(dk<0||dr<0){cls="down"; txt=dk<0?`${de(dk)} kg`:`${dr} Wdh`;} }
      else { cls="eq"; txt=""; }
      if(txt) rows+=`<div></div><div class="delta ${cls}">${txt}${cls!=="pr"&&prev?" vs. letztes Mal":""}</div>`;
    }
  }
  return `<article class="card ex ${logged.length>=p.sets?"done":""}" data-ex="${esc(p.name)}" data-idx="${idx}">
    <div class="head"><div><div class="name">${esc(p.name)}</div><div class="target">${esc(sg.text)}</div></div>
      <div class="row" style="gap:4px;flex-direction:column;align-items:flex-end">${sg.up?'<span class="chip good">steigern</span>':""}${p.isNew?'<span class="chip acc">neu</span>':""}<span class="chip">${p.sets} × ${p.reps[0]}–${p.reps[1]}</span></div></div>
    ${p.note?`<p class="hint">${esc(p.note)}</p>`:""}
    <div class="sets"><div class="h">#</div><div class="h">Zuletzt</div><div class="h" style="text-align:center">kg</div><div class="h" style="text-align:center">Wdh</div><div></div>${rows}</div>
    <button class="btn ghost sm" data-addset="${idx}">${ICON.plus}Satz</button>
  </article>`;
}

/* Ernährungs-Schnitt: nur abgeschlossene Tage ab Tracking-Start (heute zählt erst ab morgen) */
const trackStart=()=>settings.trackStart||"2026-10-19";
const countsForAvg=ds=>ds>=trackStart()&&ds<TODAY();
function viewFortschritt(){
  const list=progressData();
  if(!selEx||!list.find(e=>e.name===selEx)) selEx=list[0]?.name;
  const e=list.find(x=>x.name===selEx);
  // weekly comparison
  const wkStart=ds=>{const d=new Date(ds+"T12:00:00"); const wd=(d.getDay()+6)%7; d.setDate(d.getDate()-wd); return iso(d);};
  const thisW=wkStart(TODAY()), lastW=shift(thisW,-7);
  const wstat=start=>{ let sess=0,sets=0,kc=[],pr=[],kre=0; const kreN=settings.supplements.find(s=>/kreatin/i.test(s));
    for(let i=0;i<7;i++){ const ds=shift(start,i); const d=days.get(ds); if(!d) continue; const n=(d.training?.sets||[]).reduce((a,s)=>a+(s.detail||[]).length,0); if(n){sess++;sets+=n;} const t=totals(d); if(t.kcal&&countsForAvg(ds)){kc.push(t);} if(kreN&&d.supps?.[kreN]) kre++; }
    return {sess,sets,n:kc.length,kcal:kc.length?kc.reduce((a,t)=>a+t.kcal,0)/kc.length:null,prot:kc.length?kc.reduce((a,t)=>a+t.protein,0)/kc.length:null,kre}; };
  const A=wstat(thisW),B=wstat(lastW);
  const prs=list.filter(x=>{const P=x.pts,last=P[P.length-1]; return last.date>=thisW && P.length>1 && better(last,P.slice(0,-1).reduce((b,y)=>better(y,b)?y:b,null));}).map(x=>x.name);
  const dlt=(a,b,u="")=>b==null?'<span class="d muted">Vorwoche –</span>':`<span class="d" style="color:${a==null?"var(--muted)":a>=b?"var(--good)":"var(--warn)"}">Vorwoche ${r(b)}${u}</span>`;
  const ndlt=(a,b,k,u)=>b.n>=3?dlt(a[k],b[k],u):`<span class="d muted">${a.n?`aus ${a.n} ${a.n===1?"Tag":"Tagen"}`:"ab morgen"}</span>`;
  const rep=reports.slice().sort((a,b)=>a.id<b.id?1:-1)[0];
  return `
  <section class="card">
    <div class="row between"><h2>Diese Woche</h2><span class="hint">ab ${dLabel(thisW)}</span></div>
    <div class="stats">
      <div class="stat"><span class="lbl">Einheiten</span><b class="num">${A.sess}</b>${dlt(A.sess,B.sess)}</div>
      <div class="stat"><span class="lbl">Sätze</span><b class="num">${A.sets}</b>${dlt(A.sets,B.sets)}</div>
      <div class="stat"><span class="lbl">Kreatin</span><b class="num">${A.kre}/7</b><span class="d muted">Tage</span></div>
      <div class="stat"><span class="lbl">Ø kcal</span><b class="num">${A.kcal==null?"–":r(A.kcal)}</b>${ndlt(A,B,"kcal","")}</div>
      <div class="stat"><span class="lbl">Ø Eiweiß</span><b class="num">${A.prot==null?"–":r(A.prot)}</b>${ndlt(A,B,"prot"," g")}</div>
      <div class="stat"><span class="lbl">Bestwerte</span><b class="num" style="color:var(--pr)">${prs.length}</b><span class="d muted">diese Woche</span></div>
    </div>
    ${prs.length?`<p class="hint">★ ${prs.map(esc).join(", ")}</p>`:""}
  </section>
  ${rep?`<section class="card"><div class="row between"><h2>Wochenbericht von Claude</h2><span class="hint">${esc(rep.data.title||rep.id)}</span></div><div class="report">${esc(rep.data.text||"")}</div></section>`:""}
  <section class="card">
    <h2>Kraftentwicklung</h2>
    ${list.length?`<div class="exchips">${list.map(x=>`<button data-ex-sel="${esc(x.name)}" aria-pressed="${x.name===selEx}">${esc(x.name.replace(/ \(.*\)/,""))}</button>`).join("")}</div>
    <div style="overflow-x:auto">${lineChart(e.pts,{label:`${e.name} · ${e.bw?"Wiederholungen":"bestes Arbeitsgewicht (kg)"}`})}</div>
    <div class="list">${e.pts.slice().reverse().slice(0,6).map(p=>`<div class="it"><span class="muted num">${dLabel(p.date)}</span><span class="num">${fmtSet(p)}</span></div>`).join("")}</div>`:'<p class="empty">Noch keine Trainingsdaten.</p>'}
  </section>
  <section class="card">
    <h2>Analyse</h2>
    <div class="list">${list.map(x=>{const c=classify(x),p=[...(settings.plan?.U1||[]),...(settings.plan?.U2||[])].find(q=>q.name===x.name)||{sets:2,reps:[6,10]},h=history(x.name),sg=suggestion(p,h[h.length-1]);
      return `<div class="it"><div class="t"><div>${esc(x.name)}</div><div class="hint num">Bester Satz: ${fmtSet(c.f)} → ${fmtSet(c.l)}${c.dropped?" · Gewicht gesunken":""}</div><div class="target" style="font-size:.84rem">${esc(sg.text)}</div></div>
      <div style="text-align:right;flex:none"><div class="num" style="color:${c.up?"var(--good)":"var(--warn)"};font-weight:600">${c.delta}</div>${stChip(c.st)}</div></div>`;}).join("")||'<p class="empty">Noch keine Daten.</p>'}</div>
    <p class="hint">Verglichen wird jeweils dein bester Satz pro Einheit: höchstes Gewicht, bei gleichem Gewicht mehr Wiederholungen. Erste gegen letzte Einheit. Unter drei Einheiten ist die Aussage unsicher.</p>
  </section>`;
}

function viewKoerper(){
  const d=getDay(cur);
  const pts=sorted().filter(x=>x.weight).map(x=>({date:x.date,v:x.weight}));
  const avg=pts.map((p,i)=>{ const from=shift(p.date,-6); const w=pts.filter(q=>q.date>=from&&q.date<=p.date); return {date:p.date,v:w.reduce((a,q)=>a+q.v,0)/w.length}; });
  const MEAS=[["waist","Taille"],["biceps","Bizeps"],["shoulders","Schultern"],["chest","Brust"]];
  const mval=(x,k)=>k==="waist"?x.waist:x.measures?.[k];
  if(!MEAS.some(m=>m[0]===selMeas)) selMeas="biceps";
  const mpts=sorted().filter(x=>mval(x,selMeas)).map(x=>({date:x.date,v:mval(x,selMeas)}));
  const mrows=MEAS.map(([k,l])=>{ const p=sorted().filter(x=>mval(x,k)); if(!p.length) return null; const f=mval(p[0],k), la=mval(p[p.length-1],k);
    return `<div class="it"><div class="t"><div>${l}</div><div class="hint num">seit ${dLabel(p[0].date)}</div></div><div class="num" style="text-align:right"><b>${de(la)} cm</b><div style="font-size:.8rem;color:${(k==="waist"?la<=f:la>=f)?"var(--good)":"var(--warn)"}">${la-f>=0?"+":""}${de(la-f)} cm</div></div></div>`; }).filter(Boolean);
  const last=pts[pts.length-1], lastAvg=avg[avg.length-1];
  const weekAgo=avg.filter(a=>a.date<=shift(TODAY(),-7)).pop();
  return `
  <section class="card">
    <div class="row between"><h2>Gewicht</h2>${lastAvg?`<span class="chip acc">Ø 7 Tage ${de(lastAvg.v)} kg</span>`:""}</div>
    <div class="grid2">
      <div><label class="lbl" for="w-kg">Gewicht (${cur===TODAY()?"heute":dLabel(cur)})</label><input class="field num" id="w-kg" type="number" step="0.1" inputmode="decimal" placeholder="kg" value="${d.weight??""}"></div>
    </div>
    ${pts.length?`<div style="overflow-x:auto">${lineChart(pts,{label:"Gewicht (kg) · gestrichelt: 7-Tage-Schnitt",avg})}</div>
      <p class="hint">${weekAgo&&lastAvg?`Trend: ${lastAvg.v-weekAgo.v>=0?"+":""}${de(lastAvg.v-weekAgo.v)} kg Durchschnitt gegenüber vor einer Woche. `:""}Wieg dich am besten morgens nach dem Aufstehen. Der Durchschnitt zählt mehr als einzelne Tage.</p>`
      :'<p class="empty">Noch keine Gewichtseinträge.</p>'}
  </section>
  <section class="card">
    <div class="row between"><h2>Maße</h2><span class="hint">${cur===TODAY()?"heute":dLabel(cur)} · cm</span></div>
    <div class="grid4">${MEAS.map(([k,l])=>`<div><label class="lbl" for="m-${k}">${l}</label><input class="field num" id="m-${k}" data-meas="${k}" type="number" step="0.5" inputmode="decimal" placeholder="–" value="${(k==="waist"?d.waist:d.measures?.[k])??""}"></div>`).join("")}</div>
    <p class="hint">Bizeps angespannt an der dicksten Stelle, Schultern über die breiteste Stelle, Taille auf Nabelhöhe. Alle 1–2 Wochen messen, morgens.</p>
    ${mrows.length?`<div class="list">${mrows.join("")}</div>
      <div class="exchips">${MEAS.map(([k,l])=>`<button data-meas-sel="${k}" aria-pressed="${k===selMeas}">${l}</button>`).join("")}</div>
      ${mpts.length>1?`<div style="overflow-x:auto">${lineChart(mpts,{label:`${MEAS.find(m=>m[0]===selMeas)[1]} (cm)`,H:170})}</div>`:`<p class="empty">Für einen Verlauf braucht es mindestens zwei Messungen.</p>`}`:'<p class="empty">Noch keine Maße eingetragen.</p>'}
  </section>
  <section class="card">
    <div class="row between"><h2>Fortschrittsfotos</h2>
      <label class="btn pri sm" for="photo-in">${ICON.camera}Foto</label><input id="photo-in" type="file" accept="image/*" hidden></div>
    <div class="photos" id="photos"><p class="empty">Lade Fotos …</p></div>
    <div id="compare"></div>
    <p class="hint">Gleiches Licht, gleiche Pose, gleiche Uhrzeit, etwa alle 2 Wochen. Die Fotos sind privat in deiner Datenbank gespeichert.</p>
  </section>`;
}

/* ---------------- notes ---------------- */
const NCOL={"":"transparent",amber:"#E3A73B",steel:"#8FB8D8",green:"#5FC48E",red:"#E5635A",violet:"#A98BC9"};
const nid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const tagsOf=t=>[...new Set((t.match(/#[\wäöüÄÖÜß-]+/g)||[]).map(x=>x.toLowerCase()))];
function noteHTML(text,limit){
  const lines=String(text||"").split("\n"); const out=[]; let n=0;
  lines.forEach((ln,idx)=>{ if(limit && n>=limit) return; const t=esc(ln).replace(/(#[\wäöüÄÖÜß-]+)/g,'<span class="tag">$1</span>');
    let m;
    if((m=ln.match(/^\s*[-*] \[( |x|X)\] ?(.*)$/))){ const done=m[1]!==" "; out.push(`<div class="ck ${done?"done":""}" data-cki="${idx}"><i>${done?"✓":""}</i><span>${esc(m[2]).replace(/(#[\wäöüÄÖÜß-]+)/g,'<span class="tag">$1</span>')}</span></div>`); }
    else if(/^#\s/.test(ln)) out.push(`<b>${esc(ln.replace(/^#\s*/,""))}</b>`);
    else if(/^\s*[-*] /.test(ln)) out.push(`<div>• ${t.replace(/^\s*[-*] /,"")}</div>`);
    else if(ln.trim()) out.push(`<div>${t}</div>`);
    else return;
    n++; });
  if(limit && lines.filter(l=>l.trim()).length>limit) out.push('<div class="muted">…</div>');
  return out.join("");
}
function saveNote(n){ n.updated=Date.now(); notes.set(n.id,n); write("notes/"+n.id,n); }
function viewNotizen(){
  let list=[...notes.values()];
  const allTags=[...new Set(list.flatMap(n=>tagsOf((n.title||"")+" "+(n.text||""))))].slice(0,12);
  if(noteTag) list=list.filter(n=>tagsOf((n.title||"")+" "+(n.text||"")).includes(noteTag));
  if(noteQ){ const q=noteQ.toLowerCase(); list=list.filter(n=>((n.title||"")+" "+(n.text||"")).toLowerCase().includes(q)); }
  list.sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||b.updated-a.updated);
  const ago=ts=>{ const d=new Date(ts); return iso(d)===TODAY()?d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}):d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"}); };
  return `
  <section class="card nquick">
    <textarea class="field" id="nq-text" rows="2" placeholder="Schnell notieren … (#tag für Kategorien, - [ ] für Checklisten)"></textarea>
    <div class="row between wrapf"><div class="pills">
      <button class="pill" data-tpl="training">Trainingsnotiz</button><button class="pill" data-tpl="einkauf">Einkaufsliste</button><button class="pill" data-tpl="idee">Idee</button></div>
      <button class="btn pri sm" data-act="nq-save">${ICON.plus}Speichern</button></div>
  </section>
  ${notes.size?`<div class="row" style="gap:8px"><input class="field" id="note-q" placeholder="Suchen …" value="${esc(noteQ)}" style="flex:1"></div>`:""}
  ${allTags.length?`<div class="exchips"><button data-ntag="" aria-pressed="${!noteTag}">Alle</button>${allTags.map(t=>`<button data-ntag="${esc(t)}" aria-pressed="${t===noteTag}">${esc(t)}</button>`).join("")}</div>`:""}
  ${list.length?`<div class="ngrid">${list.map(n=>`<article class="note" data-note="${esc(n.id)}" style="--nc:${NCOL[n.color||""]}" tabindex="0">
      ${n.title?`<h4>${n.pinned?'<span style="color:var(--accent)">📌 </span>':""}${esc(n.title)}</h4>`:(n.pinned?'<h4 style="color:var(--accent)">📌</h4>':"")}
      <div class="nb">${noteHTML(n.text,9)}</div>
      <div class="meta"><span>${ago(n.updated)}</span>${(n.text||"").match(/\[[ xX]\]/g)?`<span>${((n.text||"").match(/\[[xX]\]/g)||[]).length}/${(n.text||"").match(/\[[ xX]\]/g).length}</span>`:""}</div>
    </article>`).join("")}</div>`
    :`<p class="empty" style="text-align:center;padding:24px 0">${notes.size?"Nichts gefunden.":"Noch keine Notizen. Schreib oben einfach los."}</p>`}`;
}
const TPL={
  training:()=>({title:`Training ${dLabel(TODAY())}`,text:`Einheit: ${nextDue().unit}\nGefühl (1–5): \nSchlaf: \n\n# Notizen\n- \n\n#training`}),
  einkauf:()=>({title:"Einkaufsliste",text:"- [ ] Skyr / Quark\n- [ ] Hähnchenbrust\n- [ ] Reis\n- [ ] Eier\n- [ ] \n\n#einkauf",color:"steel"}),
  idee:()=>({title:"Idee",text:"",color:"violet"})
};
function noteEditor(id){
  const n=structuredClone(notes.get(id)); if(!n) return;
  let t=null, confirmDel=false;
  openSheet(`<div class="row between"><div class="ndots" role="group" aria-label="Farbe">${Object.keys(NCOL).map(c=>`<button data-col="${c}" aria-pressed="${(n.color||"")===c}" aria-label="Farbe ${c||"keine"}" style="background:${c?NCOL[c]:"var(--raise)"}"></button>`).join("")}</div>
      <div class="row" style="gap:4px"><button class="btn sm ${n.pinned?"pri":""}" id="ne-pin">📌</button><button class="x" data-close aria-label="Schließen">×</button></div></div>
    <div class="neditor" style="display:flex;flex-direction:column;gap:8px">
      <input class="ntitle" id="ne-title" placeholder="Titel" value="${esc(n.title||"")}">
      <textarea class="field" id="ne-text" placeholder="Notiz …">${esc(n.text||"")}</textarea>
      <div class="row wrapf" style="gap:6px"><button class="btn sm" data-ins="- [ ] ">☐ Checkliste</button><button class="btn sm" data-ins="- ">• Liste</button><button class="btn sm" data-ins="# ">Überschrift</button><button class="btn sm" data-ins="#">#Tag</button></div>
      <div class="row between"><span class="hint" id="ne-st">Wird automatisch gespeichert</span><button class="btn ghost sm" id="ne-del" style="color:var(--warn)">Löschen</button></div>
    </div>`, sh=>{
      const ta=sh.querySelector("#ne-text"), ti=sh.querySelector("#ne-title");
      const grow=()=>{ ta.style.height="auto"; ta.style.height=Math.max(window.innerHeight*0.42,ta.scrollHeight)+"px"; }; grow();
      const persist=()=>{ clearTimeout(t); t=setTimeout(()=>{ n.title=ti.value.trim(); n.text=ta.value; saveNote(n); sh.querySelector("#ne-st").textContent="Gespeichert"; },450); };
      ta.oninput=()=>{grow();persist();}; ti.oninput=persist;
      sh.addEventListener("click",e=>{
        if(e.target.closest("[data-close]")){ n.title=ti.value.trim(); n.text=ta.value; if(n.title||n.text.trim()) saveNote(n); closeSheet(); render(); return; }
        const c=e.target.closest("[data-col]"); if(c){ n.color=c.dataset.col; sh.querySelectorAll("[data-col]").forEach(b=>b.setAttribute("aria-pressed",b===c)); persist(); }
        if(e.target.closest("#ne-pin")){ n.pinned=!n.pinned; e.target.closest("#ne-pin").classList.toggle("pri",n.pinned); persist(); }
        const ins=e.target.closest("[data-ins]"); if(ins){ const v=ins.dataset.ins, p=ta.selectionStart??ta.value.length; const before=ta.value.slice(0,p), nl=before&&!before.endsWith("\n")&&v!=="#"?"\n":"";
          ta.value=before+nl+v+ta.value.slice(p); const np=(before+nl+v).length; ta.focus(); ta.setSelectionRange(np,np); grow(); persist(); }
        if(e.target.closest("#ne-del")){ const b=sh.querySelector("#ne-del"); if(!confirmDel){ confirmDel=true; b.textContent="Wirklich löschen?"; return; }
          clearTimeout(t); notes.delete(n.id); write("notes/"+n.id,null); closeSheet(); render(); toast("Notiz gelöscht"); }
      });
    });
}

/* ---------------- photos ---------------- */
let photoCache=null;
async function loadPhotos(force){
  const el=$("photos"); if(!el) return;
  if(!sb||!session){ el.innerHTML='<p class="empty">Nur online verfügbar.</p>'; return; }
  if(photoCache && !force){ paintPhotos(photoCache); return; }
  const {data,error}=await sb.storage.from("photos").list("",{limit:200,sortBy:{column:"name",order:"desc"}});
  if(error){ el.innerHTML='<p class="empty">Fotos konnten nicht geladen werden.</p>'; return; }
  const files=(data||[]).filter(f=>f.name.endsWith(".jpg"));
  if(!files.length){ photoCache=[]; paintPhotos([]); return; }
  const {data:urls}=await sb.storage.from("photos").createSignedUrls(files.map(f=>f.name),3600);
  photoCache=(urls||[]).map((u,i)=>({url:u.signedUrl,name:files[i].name})); paintPhotos(photoCache);
}
let cmpA=null, cmpB=null;
function paintCompare(list){
  const el=$("compare"); if(!el) return; if(list.length<2){ el.innerHTML=""; return; }
  const asc=list.slice().sort((a,b)=>a.name<b.name?-1:1);
  if(!asc.find(p=>p.name===cmpA)) cmpA=asc[0].name; if(!asc.find(p=>p.name===cmpB)) cmpB=asc[asc.length-1].name;
  const A=asc.find(p=>p.name===cmpA), B=asc.find(p=>p.name===cmpB);
  const opt=sel=>asc.map(p=>`<option value="${esc(p.name)}" ${p.name===sel?"selected":""}>${dLabel(p.name.slice(0,10))}${p.name.slice(2,4)}</option>`).join("");
  el.innerHTML=`<div class="lbl" style="margin:6px 0">Vorher / Nachher</div>
    <div class="grid2"><select class="field" id="cmp-a" aria-label="Vorher-Foto">${opt(cmpA)}</select><select class="field" id="cmp-b" aria-label="Nachher-Foto">${opt(cmpB)}</select></div>
    <div class="cmp" id="cmpbox"><img src="${esc(B.url)}" alt="Nachher"><img class="top" id="cmptop" src="${esc(A.url)}" alt="Vorher"><div class="cmpline" id="cmpline"></div>
      <span class="cmptag l">Vorher</span><span class="cmptag r">Nachher</span></div>
    <input type="range" id="cmp-r" min="0" max="100" value="50" aria-label="Vergleich verschieben" style="width:100%">`;
  const upd=v=>{ $("cmptop").style.clipPath=`inset(0 ${100-v}% 0 0)`; $("cmpline").style.left=v+"%"; };
  upd(50); $("cmp-r").oninput=e=>upd(+e.target.value);
  $("cmp-a").onchange=e=>{cmpA=e.target.value;paintCompare(list);}; $("cmp-b").onchange=e=>{cmpB=e.target.value;paintCompare(list);};
}
function paintPhotos(list){ const el=$("photos"); if(!el) return; paintCompare(list);
  el.innerHTML=list.length?list.map(p=>`<figure><img src="${esc(p.url)}" alt="Fortschrittsfoto ${esc(p.name.slice(0,10))}" loading="lazy"><figcaption>${dLabel(p.name.slice(0,10))}${p.name.slice(2,4)}</figcaption></figure>`).join(""):'<p class="empty">Noch keine Fotos.</p>'; }
async function uploadPhoto(file){
  if(!sb||!session){ toast("Fotos gehen nur online."); return; }
  toast("Foto wird hochgeladen …");
  const img=await createImageBitmap(file); const s=Math.min(1,1400/Math.max(img.width,img.height));
  const c=document.createElement("canvas"); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s);
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  const blob=await new Promise(res=>c.toBlob(res,"image/jpeg",0.85));
  const name=`${TODAY()}-${Date.now()}.jpg`;
  const {error}=await sb.storage.from("photos").upload(name,blob,{contentType:"image/jpeg"});
  if(error){ toast("Upload fehlgeschlagen."); return; }
  toast("Foto gespeichert"); loadPhotos(true);
}

/* ---------------- food sheet: search, barcode, favorites, manual ---------------- */
let scanStream=null, scanReader=null;
function stopScan(){ try{scanReader&&scanReader.reset();}catch(e){} scanReader=null; if(scanStream){scanStream.getTracks().forEach(t=>t.stop()); scanStream=null;} }
const rd1=v=>Math.round((+v||0)*10)/10;
function addMeal(m){ const d=getDay(cur);
  const e={name:m.name,kcal:r(m.kcal),carbs:rd1(m.carbs),protein:rd1(m.protein),fat:rd1(m.fat),time:nowTime()};
  if(m.per100) e.per100=m.per100; if(m.grams) e.grams=r(m.grams); if(m.base) e.base=m.base;
  if(m.items?.length) e.items=m.items.map(i=>({name:i.name,grams:r(i.grams),kcal:r(i.kcal),carbs:rd1(i.carbs),protein:rd1(i.protein),fat:rd1(i.fat)}));
  d.meals.push(e); saveDay(d); toast(`${m.name.slice(0,40)} eingetragen`); }
/* Grundnahrungsmittel: Durchschnittswerte pro 100 g (Richtwerte, v. a. nach USDA/üblichen Packungsangaben) */
const BASICS=[
 ["Hähnchenbrust, roh","pollo pechuga chicken huhn hähnchen hühnerbrust",120,0,22.5,2.6],
 ["Hähnchenbrust, gegart","pollo pechuga chicken huhn hähnchen gebraten",165,0,31,3.6],
 ["Reis, roh (weiß)","arroz rice basmati",360,79,7,0.6],
 ["Reis, gekocht (weiß)","arroz rice basmati",130,28,2.7,0.3],
 ["Nudeln, roh","pasta spaghetti macarrones penne",355,72,12.5,1.5],
 ["Nudeln, gekocht","pasta spaghetti macarrones penne",158,31,5.8,0.9],
 ["Haferflocken","avena oats copos",372,58.7,13.5,7],
 ["Ei (1 Stück ≈ 60 g)","huevo egg eier",143,0.7,12.6,9.5],
 ["Milch 3,5 %","leche entera milk vollmilch",64,4.8,3.3,3.5],
 ["Milch 1,5 %","leche semidesnatada milk fettarm",47,4.9,3.4,1.5],
 ["Magerquark","quark queso batido desnatado",67,4,12,0.3],
 ["Skyr natur","skyr yogur",63,4,11,0.2],
 ["Hüttenkäse","körniger frischkäse cottage queso fresco",98,3.4,11,4.3],
 ["Banane","plátano platano banana",89,22.8,1.1,0.3],
 ["Apfel","manzana apple",52,13.8,0.3,0.2],
 ["Heidelbeeren","arándanos blueberries blaubeeren",57,14.5,0.7,0.3],
 ["Kartoffeln, roh","patata papa potato",77,17,2,0.1],
 ["Süßkartoffel, roh","boniato batata sweet potato",86,20,1.6,0.1],
 ["Thunfisch im eigenen Saft, abgetropft","atún atun tuna",116,0,25.5,0.8],
 ["Lachs, roh","salmón salmon",208,0,20,13],
 ["Rinderhack 20 % Fett, roh","carne picada ternera hackfleisch beef",254,0,17,20],
 ["Toastbrot","pan de molde toast weißbrot",265,49,8,3.5],
 ["Erdnussbutter","crema de cacahuete peanut butter",588,20,25,50],
 ["Olivenöl","aceite de oliva oil öl",884,0,0,100],
 ["Butter","mantequilla",717,0.1,0.9,81],
 ["Brokkoli","brócoli broccoli",34,7,2.8,0.4],
 ["Tomate","tomate tomato",18,3.9,0.9,0.2],
 ["Avocado","aguacate",160,8.5,2,15],
 ["Kichererbsen, gekocht","garbanzos chickpeas",164,27,8.9,2.6],
 ["Linsen, gekocht","lentejas lentils",116,20,9,0.4],
 ["Gouda","queso gouda käse",356,2.2,25,27],
 ["Mandeln","almendras almonds",579,22,21,50],
 ["Walnüsse","nueces walnuts",654,14,15,65],
 ["Honig","miel honey",304,82,0.3,0],
 ["Orangensaft","zumo de naranja orange juice o-saft",45,10.4,0.7,0.2],
 ["Cola","coca cola refresco",42,10.6,0,0],
].map(([name,alias,kcal,carbs,protein,fat])=>({name,alias,basic:true,per100:{kcal,carbs,protein,fat}}));
const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/ß/g,"ss");
const matches=(q,txt)=>{ const t=norm(txt); return norm(q).split(/\s+/).filter(Boolean).every(w=>t.includes(w)); };
function eatenHistory(){ const seen=new Map();
  (settings.favorites||[]).forEach(f=>seen.set(f.name,{...f,fav:true}));
  sorted().reverse().forEach(day=>(day.meals||[]).forEach(m=>{ if(!seen.has(m.name)) seen.set(m.name,m); }));
  return [...seen.values()]; }
async function searchProducts(q){
  if(sb&&session){ try{ const {data,error}=await sb.functions.invoke("food-search",{body:{q}}); if(!error&&data?.items) return data.items; }catch(e){} }
  for(const host of ["es.openfoodfacts.org","de.openfoodfacts.org"]){
    try{ const ctl=new AbortController(); const tm=setTimeout(()=>ctl.abort(),8000);
      const j=await (await fetch(`https://${host}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=25&fields=code,product_name,product_name_de,product_name_es,brands,nutriments,serving_quantity,serving_size`,{signal:ctl.signal})).json(); clearTimeout(tm);
      return (j.products||[]).map(offToItem).filter(Boolean); }catch(e){} }
  throw new Error("offline");
}
function offToItem(p){ const n=p.nutriments||{}; if(n["energy-kcal_100g"]==null) return null;
  return {code:p.code,name:p.product_name_de||p.product_name||p.product_name_es||"Produkt",brand:String(p.brands||"").split(",")[0].trim(),
    kcal:+n["energy-kcal_100g"]||0,carbs:+n.carbohydrates_100g||0,protein:+n.proteins_100g||0,fat:+n.fat_100g||0,serving_g:+p.serving_quantity||null,serving:p.serving_size||""}; }
const itemToFood=it=>({name:[it.name,it.brand?`(${it.brand})`:""].join(" ").trim(),per100:{kcal:it.kcal,carbs:it.carbs,protein:it.protein,fat:it.fat},serving_g:it.serving_g,serving:it.serving});
function searchMode(body){
  body.innerHTML=`<form class="row" id="sform"><input class="field" id="sq" type="search" enterkeyhint="search" placeholder="z. B. Skyr, Hähnchenbrust, avena" autocomplete="off"><button class="btn pri" type="submit">Suchen</button></form><div id="sres"></div>`;
  const res=body.querySelector("#sres"), inp=body.querySelector("#sq");
  let local=[], prods=null, status="", seq=0, tmr=null, hist=eatenHistory();
  const row=(attr,title,sub,right)=>`<button class="prod" ${attr}><div class="t" style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis">${title}</div><div class="hint">${sub}</div></div><div class="num muted" style="flex:none;text-align:right">${right}</div></button>`;
  const paint=()=>{ const q=inp.value.trim();
    if(q.length<2){ res.innerHTML=`<p class="hint">Tippe los – Treffer erscheinen sofort. Zuerst deine eigenen Mahlzeiten und Grundnahrungsmittel, darunter Produkte aus Open Food Facts.</p>
      ${hist.length?`<div class="lbl" style="margin:10px 0 4px">Zuletzt gegessen</div>${hist.slice(0,8).map((m,i)=>row(`data-h="${i}"`,esc(m.name),`KH ${r(m.carbs)} · E ${r(m.protein)} · F ${r(m.fat)}`,`${r(m.kcal)} kcal`)).join("")}`:""}`; return; }
    const H=hist.map((m,i)=>({m,i})).filter(x=>matches(q,x.m.name)).slice(0,6);
    const B=BASICS.map((b,i)=>({b,i})).filter(x=>matches(q,x.b.name+" "+x.b.alias)).slice(0,6);
    let html="";
    if(H.length) html+=`<div class="lbl" style="margin:10px 0 4px">Schon gegessen</div>`+H.map(x=>row(`data-h="${x.i}"`,`${x.m.fav?'<b style="color:var(--accent)">★</b> ':""}${esc(x.m.name)}`,`KH ${r(x.m.carbs)} · E ${r(x.m.protein)} · F ${r(x.m.fat)}`,`${r(x.m.kcal)} kcal`)).join("");
    if(B.length) html+=`<div class="lbl" style="margin:10px 0 4px">Grundnahrungsmittel <span class="hint">· Ø-Werte</span></div>`+B.map(x=>row(`data-b="${x.i}"`,esc(x.b.name),`pro 100 g: E ${de(x.b.per100.protein)} · KH ${de(x.b.per100.carbs)} · F ${de(x.b.per100.fat)}`,`${r(x.b.per100.kcal)}<br><span style="font-size:.72rem">kcal/100 g</span>`)).join("");
    html+=`<div class="lbl" style="margin:10px 0 4px">Produkte</div>`;
    if(prods===null) html+=`<p class="hint">${status||"Suche …"}</p>`;
    else if(!prods.length) html+=`<p class="empty">${status||"Keine Produkte gefunden. Anderen Begriff, Marke dazuschreiben (z. B. „skyr lidl“) oder manuell eintragen."}</p>`;
    else html+=prods.map((p,i)=>row(`data-p="${i}"`,esc(p.name),`${esc(p.brand||"")}${p.brand?" · ":""}E ${de(p.protein)} g/100 g`,`${r(p.kcal)}<br><span style="font-size:.72rem">kcal/100 g</span>`)).join("");
    html+=`<p class="hint" style="margin-top:10px">Produktdaten von Open Food Facts – Werte können Fehler haben, im Zweifel Packung prüfen.</p>`;
    res.innerHTML=html; };
  const run=async()=>{ const q=inp.value.trim(); const my=++seq; prods=null; status=""; paint(); if(q.length<2) return;
    try{ const items=await searchProducts(q); if(my!==seq) return; prods=items; }
    catch(e){ if(my!==seq) return; prods=[]; status="Produktsuche gerade nicht erreichbar. Grundnahrungsmittel oben gehen trotzdem – oder Barcode scannen."; }
    paint(); };
  inp.oninput=()=>{ clearTimeout(tmr); prods=null; paint(); tmr=setTimeout(run,450); };
  body.querySelector("#sform").onsubmit=e=>{ e.preventDefault(); clearTimeout(tmr); inp.blur(); run(); };
  res.onclick=e=>{ const p=e.target.closest("[data-p]"); if(p) return portionSheet(itemToFood(prods[+p.dataset.p]));
    const b=e.target.closest("[data-b]"); if(b) return portionSheet(BASICS[+b.dataset.b]);
    const h=e.target.closest("[data-h]"); if(h){ const m=hist[+h.dataset.h];
      if(m.per100) return portionSheet({name:m.base||m.name.replace(/, \d+ g$/,""),per100:m.per100,grams:m.grams});
      const {fav,...clean}=m; addMeal(clean); closeSheet(); } };
  paint(); setTimeout(()=>inp.focus(),50);
}
function foodSheet(mode="foto"){
  const favs=settings.favorites||[];
  openSheet(`<div class="row between"><h2>Essen hinzufügen</h2><button class="x" data-close>×</button></div>
    <div class="seg" id="fseg">${[["foto","Foto"],["suche","Suche"],["scan","Code"],["fav","Favs"],["manuell","Manuell"]].map(([k,l])=>`<button data-fmode="${k}" aria-pressed="${k===mode}">${l}</button>`).join("")}</div>
    <div id="fbody"></div>`, sh=>{
      sh.addEventListener("click",e=>{ if(e.target.closest("[data-close]")) closeSheet(); const m=e.target.closest("[data-fmode]"); if(m) foodSheet(m.dataset.fmode); });
      const body=sh.querySelector("#fbody");
      if(mode==="foto") photoMode(body);
      if(mode==="suche") searchMode(body);
      if(mode==="scan"){
        body.innerHTML=`<div class="video"><video id="vid" playsinline muted></video></div><p class="hint" id="scanmsg">Halte den Barcode in den Rahmen.</p>
          <form class="row" id="codeform"><input class="field num" id="code" inputmode="numeric" placeholder="oder Barcode-Nummer eintippen"><button class="btn" type="submit">Los</button></form>`;
        const lookup=async code=>{ const msg=body.querySelector("#scanmsg"); msg.textContent=`Suche ${code} …`;
          try{ const j=await (await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_de,product_name_es,brands,nutriments,serving_quantity,serving_size`)).json();
            if(j.status===1 && j.product?.nutriments?.["energy-kcal_100g"]!=null){ stopScan(); portionSheet(offToFood(j.product)); }
            else msg.textContent="Produkt nicht gefunden oder ohne Nährwerte. Trag es manuell ein.";
          }catch(e){ msg.textContent="Abfrage fehlgeschlagen. Bist du online?"; } };
        body.querySelector("#codeform").onsubmit=e=>{e.preventDefault(); const c=body.querySelector("#code").value.trim(); if(c) lookup(c);};
        startScan(body.querySelector("#vid"), lookup, body.querySelector("#scanmsg"));
      }
      if(mode==="fav"){
        body.innerHTML=favs.length?`<div class="list">${favs.map((f,i)=>`<div class="it"><div class="t"><div>${esc(f.name)}</div><div class="hint num">${r(f.kcal)} kcal · KH ${r(f.carbs)} · E ${r(f.protein)} · F ${r(f.fat)}</div></div><div class="row" style="flex:none"><button class="x" data-delfav="${i}" aria-label="Favorit entfernen">×</button><button class="btn pri sm" data-addfav="${i}">${ICON.plus}</button></div></div>`).join("")}</div>`
          :'<p class="empty">Noch keine Favoriten. Tipp bei einer Mahlzeit auf ★, um sie zu speichern.</p>';
        body.onclick=e=>{ const a=e.target.closest("[data-addfav]"); if(a){ addMeal(favs[+a.dataset.addfav]); closeSheet(); }
          const dl=e.target.closest("[data-delfav]"); if(dl){ const s=structuredClone(settings); s.favorites.splice(+dl.dataset.delfav,1); saveSettings(s); foodSheet("fav"); } };
      }
      if(mode==="manuell"){
        body.innerHTML=`<form id="mform" style="display:flex;flex-direction:column;gap:8px"><input class="field" id="m-name" placeholder="Name, z. B. Hähnchen mit Reis" required>
          <div class="grid4"><input class="field num" id="m-kcal" type="number" inputmode="decimal" placeholder="kcal" required><input class="field num" id="m-c" type="number" inputmode="decimal" placeholder="KH g"><input class="field num" id="m-p" type="number" inputmode="decimal" placeholder="Eiw. g"><input class="field num" id="m-f" type="number" inputmode="decimal" placeholder="Fett g"></div>
          <label class="row"><input type="checkbox" id="m-fav"> <span>Als Favorit speichern</span></label>
          <button class="btn pri block" type="submit">Eintragen</button></form>`;
        body.querySelector("#mform").onsubmit=e=>{ e.preventDefault(); const m={name:$("m-name").value.trim(),kcal:+$("m-kcal").value||0,carbs:+$("m-c").value||0,protein:+$("m-p").value||0,fat:+$("m-f").value||0};
          if($("m-fav").checked){ const s=structuredClone(settings); s.favorites=[...(s.favorites||[]),m]; saveSettings(s); }
          addMeal(m); closeSheet(); };
      }
    });
}
/* ---------------- AI photo tracking ---------------- */
async function fileToJpegB64(file,max=1024){
  const img=await createImageBitmap(file); const s=Math.min(1,max/Math.max(img.width,img.height));
  const c=document.createElement("canvas"); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s);
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  const url=c.toDataURL("image/jpeg",0.82); return {url,b64:url.split(",")[1]};
}
function photoMode(body){
  if(!settings.aiPhoto){
    body.innerHTML=`<div class="photo-cta">${ICON.camera.replace('class="icon"','class="icon" style="width:34px;height:34px;color:var(--accent)"')}<b>Foto-Scanner öffnen</b>
      <span class="hint">Der Scanner läuft in der Claude-App über dein Abo: Foto rein, Werte prüfen, speichern – der Eintrag erscheint danach automatisch hier.</span>
      <a class="btn pri" href="https://claude.ai/artifact/VZ8JNe1oJvXiYRyhixfAWD" target="_blank" rel="noopener">Scanner öffnen</a></div>
      <p class="hint">Alternativ: Foto einfach Claude im Chat schicken.</p>
      <p class="hint">Für genaue Werte lieber Barcode scannen, suchen oder Gramm manuell eintragen.</p>`;
    return;
  }
  body.innerHTML=`<label class="photo-cta" for="ph-in">${ICON.camera.replace('class="icon"','class="icon" style="width:34px;height:34px;color:var(--accent)"')}<b>Foto aufnehmen oder auswählen</b><span class="hint">Die KI schätzt Gericht, Menge und Nährwerte. Du kannst alles vor dem Speichern korrigieren.</span></label>
    <input id="ph-in" type="file" accept="image/*" hidden><div id="ph-out"></div>`;
  body.querySelector("#ph-in").onchange=async e=>{ const f=e.target.files[0]; if(!f) return;
    const out=body.querySelector("#ph-out"); const {url,b64}=await fileToJpegB64(f);
    body.querySelector(".photo-cta").hidden=true;
    out.innerHTML=`<img class="photo-prev" src="${url}" alt="Dein Essen"><input class="field" id="ph-hint" placeholder="Hinweis (optional), z. B. „ca. 200 g Reis, in Öl gebraten“" style="margin-top:10px">
      <div class="row" style="margin-top:10px"><label class="btn" for="ph-in">Anderes Foto</label><button class="btn pri" id="ph-go" style="flex:1">Analysieren</button></div><div id="ph-res"></div>`;
    out.querySelector("#ph-go").onclick=()=>analyze(b64,out);
  };
}
async function analyze(b64,out){
  const res=out.querySelector("#ph-res"), go=out.querySelector("#ph-go");
  if(!sb||!session){ res.innerHTML='<p class="empty">Die Foto-Analyse geht nur online und angemeldet.</p>'; return; }
  go.disabled=true; go.textContent="Analysiere …"; res.innerHTML='<div style="margin-top:12px"><div class="scanline"></div><p class="hint" style="margin-top:8px">Jarvis sieht sich dein Essen an …</p></div>';
  try{
    const {data,error}=await sb.functions.invoke("food-photo",{body:{image:b64,mediaType:"image/jpeg",hint:out.querySelector("#ph-hint").value.trim()}});
    if(error){ let code=""; try{ code=(await error.context.json()).error; }catch(_){}
      res.innerHTML=`<p class="empty">${code==="not_configured"?"Die Foto-KI ist noch nicht freigeschaltet: Der API-Schlüssel fehlt noch. Frag Claude im Chat danach.":"Analyse fehlgeschlagen. Versuch es gleich noch einmal oder trag es manuell ein."}</p>`; return; }
    if(!data.items?.length){ res.innerHTML=`<p class="empty">${esc(data.note||"Kein Essen erkannt.")}</p>`; return; }
    aiResult(data,res);
  }catch(e){ res.innerHTML='<p class="empty">Analyse fehlgeschlagen. Bist du online?</p>'; }
  finally{ go.disabled=false; go.textContent="Neu analysieren"; }
}
function aiResult(data,res){
  const base=data.items.map(i=>({...i,base:{...i}}));
  const conf={hoch:"good",mittel:"acc",niedrig:"warn"}[data.confidence]||"acc";
  const paint=()=>{
    const tot=base.reduce((a,i)=>({kcal:a.kcal+i.kcal,carbs:a.carbs+i.carbs,protein:a.protein+i.protein,fat:a.fat+i.fat}),{kcal:0,carbs:0,protein:0,fat:0});
    res.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
      <div class="row between"><b style="font-size:1.05rem">${esc(data.title||"Mahlzeit")}</b><span class="chip ${conf}">Sicherheit: ${esc(data.confidence||"–")}</span></div>
      ${data.note?`<p class="hint">${esc(data.note)}</p>`:""}
      <div>${base.map((i,k)=>`<div class="ai-item"><div style="min-width:0"><div style="font-weight:600">${esc(i.name)}</div><div class="mm">${r(i.kcal)} kcal · KH ${r(i.carbs)} · E ${r(i.protein)} · F ${r(i.fat)}</div></div>
        <div class="row" style="gap:4px"><input class="field num" data-g="${k}" type="number" inputmode="decimal" value="${r(i.grams)}"><span class="muted">g</span></div><button class="x" data-rm="${k}" aria-label="Entfernen">×</button></div>`).join("")}</div>
      <div class="stat"><span class="lbl">Gesamt</span><b class="num">${r(tot.kcal)} kcal</b><span class="d muted">KH ${r(tot.carbs)} g · E ${r(tot.protein)} g · F ${r(tot.fat)} g</span></div>
      <label class="row"><input type="checkbox" id="ai-fav"> <span>Als Favorit speichern</span></label>
      <button class="btn pri block" id="ai-add">Eintragen</button>
      <p class="hint">Schätzung per KI. Bei Öl, Soßen und Portionsgröße lieber nachkorrigieren.</p></div>`;
    res.querySelectorAll("[data-g]").forEach(inp=>inp.onchange=()=>{ const i=base[+inp.dataset.g], g=+inp.value||0, f=i.base.grams?g/i.base.grams:0;
      Object.assign(i,{grams:g,kcal:i.base.kcal*f,carbs:i.base.carbs*f,protein:i.base.protein*f,fat:i.base.fat*f}); paint(); });
    res.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{ base.splice(+b.dataset.rm,1); if(!base.length){ res.innerHTML='<p class="empty">Alles entfernt.</p>'; return;} paint(); });
    res.querySelector("#ai-add").onclick=()=>{ const m={name:`${data.title||"Mahlzeit"} (Foto)`,...tot,items:base.map(({base:_b,...i})=>i)};
      if(res.querySelector("#ai-fav").checked){ const s=structuredClone(settings); s.favorites=[...(s.favorites||[]),{name:data.title||"Mahlzeit",kcal:r(tot.kcal),carbs:r(tot.carbs),protein:r(tot.protein),fat:r(tot.fat)}]; saveSettings(s); }
      addMeal(m); closeSheet(); };
  };
  paint();
}

function offToFood(p){ const it=offToItem(p); return it?itemToFood(it):{name:"Produkt",per100:{kcal:0,carbs:0,protein:0,fat:0}}; }
function portionSheet(food){
  const g0=food.grams||food.serving_g||100;
  const presets=[...(food.serving_g?[[food.serving_g,`1 Portion (${r(food.serving_g)} g)`]]:[]),...[30,50,100,150,200,250].map(g=>[g,`${g} g`])];
  openSheet(`<div class="row between"><h2>Menge</h2><button class="x" data-close>×</button></div>
    <div style="font-weight:600">${esc(food.name)}</div>
    <p class="hint num">pro 100 g: ${r(food.per100.kcal)} kcal · KH ${de(food.per100.carbs)} · E ${de(food.per100.protein)} · F ${de(food.per100.fat)}${food.basic?" · Durchschnittswert":""}</p>
    <div class="row"><input class="field num" id="grams" type="number" inputmode="decimal" value="${r(g0)}" style="font-size:1.3rem"><span class="muted">g</span></div>
    <div class="row wrapf">${presets.map(([g,l])=>`<button class="btn sm" data-g="${g}">${esc(l)}</button>`).join("")}</div>
    <div class="stat" id="psum"></div>
    <label class="row"><input type="checkbox" id="p-fav"> <span>Diese Portion als Favorit speichern</span></label>
    <button class="btn pri block" id="padd">Eintragen</button>`, sh=>{
      const calc=()=>{ const g=+sh.querySelector("#grams").value||0, f=g/100; return {name:`${food.name}, ${r(g)} g`,base:food.name,grams:g,per100:food.per100,kcal:food.per100.kcal*f,carbs:food.per100.carbs*f,protein:food.per100.protein*f,fat:food.per100.fat*f}; };
      const paint=()=>{ const m=calc(); sh.querySelector("#psum").innerHTML=`<span class="lbl">Ergibt</span><b class="num">${r(m.kcal)} kcal</b><span class="d muted">KH ${de(m.carbs)} g · E ${de(m.protein)} g · F ${de(m.fat)} g</span>`; };
      sh.querySelector("#grams").oninput=paint; paint();
      sh.addEventListener("click",e=>{ if(e.target.closest("[data-close]")) closeSheet(); const g=e.target.closest("[data-g]"); if(g){ sh.querySelector("#grams").value=g.dataset.g; paint(); } });
      sh.querySelector("#padd").onclick=()=>{ const m=calc(); if(sh.querySelector("#p-fav").checked){ const s=structuredClone(settings); s.favorites=[...(s.favorites||[]),{...m,kcal:r(m.kcal)}]; saveSettings(s);} addMeal(m); closeSheet(); };
    });
}
/* ---------------- Mahlzeit bearbeiten ---------------- */
function mealSheet(idx){
  const d=getDay(cur); const orig=d.meals[idx]; if(!orig) return;
  const m=structuredClone(orig);
  const items=(m.items||[]).map(i=>({...i,b:{...i}}));
  const hasItems=items.length>0, hasPer100=!hasItems&&m.per100&&m.grams;
  const sumItems=()=>items.reduce((a,i)=>({kcal:a.kcal+i.kcal,carbs:a.carbs+i.carbs,protein:a.protein+i.protein,fat:a.fat+i.fat}),{kcal:0,carbs:0,protein:0,fat:0});
  openSheet(`<div class="row between"><h2>Mahlzeit bearbeiten</h2><button class="x" data-close>×</button></div>
    <div class="row"><input class="field" id="e-name" value="${esc(m.name)}" style="flex:1"><input class="field num" id="e-time" type="time" value="${esc(m.time||"")}" style="width:110px;flex:none"></div>
    ${hasItems?`<div class="lbl" style="margin-top:4px">Bestandteile – Gramm ändern rechnet automatisch um</div><div id="e-items"></div>`:""}
    ${hasPer100?`<div class="lbl" style="margin-top:4px">Menge</div><div class="row"><input class="field num" id="e-grams" type="number" inputmode="decimal" value="${r(m.grams)}" style="font-size:1.2rem"><span class="muted">g</span><span class="hint" style="margin-left:auto">${r(m.per100.kcal)} kcal/100 g</span></div>`:""}
    <div class="lbl" style="margin-top:4px">Portion anpassen</div>
    <div class="row wrapf">${[[0.5,"½"],[0.75,"¾"],[1.25,"1¼"],[1.5,"1½"],[2,"2×"]].map(([f,l])=>`<button class="btn sm" data-mul="${f}">${l}</button>`).join("")}</div>
    <div class="lbl" style="margin-top:4px">Nährwerte</div>
    <div class="grid4"><label class="nf"><span>kcal</span><input class="field num" id="e-kcal" type="number" inputmode="decimal"></label><label class="nf"><span>KH g</span><input class="field num" id="e-c" type="number" inputmode="decimal"></label><label class="nf"><span>Eiw. g</span><input class="field num" id="e-p" type="number" inputmode="decimal"></label><label class="nf"><span>Fett g</span><input class="field num" id="e-f" type="number" inputmode="decimal"></label></div>
    <p class="hint" id="e-check"></p>
    <button class="btn pri block" id="e-save">Speichern</button>
    <div class="row"><button class="btn" id="e-dup" style="flex:1">Nochmal eintragen</button><button class="btn" id="e-del" style="flex:1;color:var(--warn)">Löschen</button></div>`, sh=>{
      const $e=id=>sh.querySelector("#"+id);
      const setVals=v=>{ $e("e-kcal").value=r(v.kcal); $e("e-c").value=rd1(v.carbs); $e("e-p").value=rd1(v.protein); $e("e-f").value=rd1(v.fat); check(); };
      const vals=()=>({kcal:+$e("e-kcal").value||0,carbs:+$e("e-c").value||0,protein:+$e("e-p").value||0,fat:+$e("e-f").value||0});
      const check=()=>{ const v=vals(), calc=v.carbs*4+v.protein*4+v.fat*9; const off=v.kcal&&Math.abs(calc-v.kcal)/v.kcal>0.2;
        $e("e-check").textContent=off?`Hinweis: Aus den Makros ergeben sich ca. ${r(calc)} kcal – passt das?`:""; };
      const paintItems=()=>{ if(!hasItems) return;
        $e("e-items").innerHTML=items.map((i,k)=>`<div class="ai-item"><div style="min-width:0"><div style="font-weight:600">${esc(i.name)}</div><div class="mm">${r(i.kcal)} kcal · KH ${r(i.carbs)} · E ${r(i.protein)} · F ${r(i.fat)}</div></div>
          <div class="row" style="gap:4px"><input class="field num" data-ig="${k}" type="number" inputmode="decimal" value="${r(i.grams)}"><span class="muted">g</span></div><button class="x" data-irm="${k}" aria-label="Bestandteil entfernen">×</button></div>`).join("")||'<p class="hint">Keine Bestandteile mehr.</p>'; };
      const scaleItem=(i,g)=>{ const f=i.b.grams?g/i.b.grams:0; Object.assign(i,{grams:g,kcal:i.b.kcal*f,carbs:i.b.carbs*f,protein:i.b.protein*f,fat:i.b.fat*f}); };
      paintItems(); setVals(m);
      ["e-kcal","e-c","e-p","e-f"].forEach(id=>$e(id).oninput=check);
      if(hasPer100) $e("e-grams").oninput=()=>{ const f=(+$e("e-grams").value||0)/100; setVals({kcal:m.per100.kcal*f,carbs:m.per100.carbs*f,protein:m.per100.protein*f,fat:m.per100.fat*f}); };
      sh.addEventListener("input",e=>{ const ig=e.target.closest("[data-ig]"); if(ig){ scaleItem(items[+ig.dataset.ig],+ig.value||0); const ae=document.activeElement; paintItems(); setVals(sumItems()); const n=sh.querySelector(`[data-ig="${ig.dataset.ig}"]`); if(ae===ig&&n){ n.focus(); try{n.setSelectionRange(n.value.length,n.value.length);}catch(_){} } } });
      sh.addEventListener("click",e=>{
        if(e.target.closest("[data-close]")) return closeSheet();
        const rm=e.target.closest("[data-irm]"); if(rm){ items.splice(+rm.dataset.irm,1); paintItems(); setVals(sumItems()); return; }
        const mu=e.target.closest("[data-mul]"); if(mu){ const f=+mu.dataset.mul;
          if(hasItems){ items.forEach(i=>scaleItem(i,i.grams*f)); paintItems(); setVals(sumItems()); }
          else if(hasPer100){ $e("e-grams").value=r((+$e("e-grams").value||0)*f); $e("e-grams").oninput(); }
          else { const v=vals(); setVals({kcal:v.kcal*f,carbs:v.carbs*f,protein:v.protein*f,fat:v.fat*f}); }
          toast(`Portion ${mu.textContent}`); } });
      const build=()=>{ const v=vals(); let name=$e("e-name").value.trim()||"Mahlzeit";
        const out={...orig,name,time:$e("e-time").value||orig.time||"",kcal:r(v.kcal),carbs:rd1(v.carbs),protein:rd1(v.protein),fat:rd1(v.fat)};
        if(hasPer100){ const g=+$e("e-grams").value||0; out.grams=r(g); if(name===orig.name&&orig.base) out.name=`${orig.base}, ${r(g)} g`; }
        if(hasItems) out.items=items.map(({b,...i})=>({...i,grams:r(i.grams),kcal:r(i.kcal),carbs:rd1(i.carbs),protein:rd1(i.protein),fat:rd1(i.fat)}));
        return out; };
      $e("e-save").onclick=()=>{ const dd=getDay(cur); dd.meals[idx]=build(); saveDay(dd); closeSheet(); toast("Gespeichert"); };
      $e("e-dup").onclick=()=>{ const n=build(); delete n.time; addMeal(n); closeSheet(); };
      $e("e-del").onclick=()=>{ const dd=getDay(cur); dd.meals.splice(idx,1); saveDay(dd); closeSheet(); toast("Gelöscht"); };
    });
}
async function startScan(video,onCode,msg){
  try{
    scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:1280},height:{ideal:720}},audio:false});
    video.srcObject=scanStream; await video.play();
    if("BarcodeDetector" in window){
      const det=new BarcodeDetector({formats:["ean_13","ean_8","upc_a","upc_e"]});
      const loop=async()=>{ if(!scanStream) return; try{ const c=await det.detect(video); if(c[0]){ onCode(c[0].rawValue); return; } }catch(e){} requestAnimationFrame(loop); }; loop();
    } else if(window.ZXing){ startZX(video,onCode); }
    else { await loadScript("zxing.min.js"); startZX(video,onCode); }
  }catch(e){ msg.textContent="Kamera nicht verfügbar. Erlaube den Kamerazugriff oder tipp die Nummer unten ein."; }
}
function startZX(video,onCode){
  const hints=new Map(); hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.EAN_8,ZXing.BarcodeFormat.UPC_A,ZXing.BarcodeFormat.UPC_E]);
  const reader=new ZXing.MultiFormatReader(); reader.setHints(hints);
  const c=document.createElement("canvas"), ctx=c.getContext("2d",{willReadFrequently:true});
  const tick=()=>{ if(!scanStream) return;
    if(video.videoWidth){ c.width=video.videoWidth; c.height=video.videoHeight; ctx.drawImage(video,0,0);
      try{ const lum=new ZXing.HTMLCanvasElementLuminanceSource(c); const bmp=new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum)); const res=reader.decode(bmp); if(res){ onCode(res.getText()); return; } }catch(e){} }
    setTimeout(tick,180); };
  tick();
}
const loadScript=src=>new Promise((res,rej)=>{const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});

/* ---------------- settings sheet: protein, supplements, reminders, plan ---------------- */
function settingsSheet(){
  const s=settings, rem=s.reminders||DEFAULT_SETTINGS.reminders;
  const planRows=u=>(s.plan?.[u]||[]).map((p,i)=>`<div class="planrow" data-u="${u}" data-i="${i}">
      <input class="field n" data-k="name" value="${esc(p.name)}" aria-label="Übung"><input class="field num" data-k="sets" type="number" inputmode="numeric" value="${p.sets}" aria-label="Sätze">
      <input class="field num" data-k="lo" type="number" inputmode="numeric" value="${p.reps[0]}" aria-label="Wdh von"><input class="field num" data-k="hi" type="number" inputmode="numeric" value="${p.reps[1]}" aria-label="Wdh bis">
      <button class="x" data-delex="${u}-${i}" aria-label="Übung entfernen">×</button></div>`).join("");
  openSheet(`<div class="row between"><h2>Einstellungen</h2><button class="x" data-close>×</button></div>
    <div class="card"><h3>Eiweißziel</h3><div class="row"><input class="field num" id="st-prot" type="number" inputmode="numeric" value="${s.proteinTarget||""}" placeholder="aus"><span class="muted">g pro Tag</span></div><p class="hint">Leer lassen, um den Ring auszublenden.</p></div>
    <div class="card"><h3>Ernährungs-Schnitt</h3><label class="lbl" for="st-ts">Zählt ab</label><input class="field num" id="st-ts" type="date" value="${s.trackStart||"2026-10-19"}"><p class="hint">Durchschnitte nutzen nur abgeschlossene Tage ab diesem Datum. Der laufende Tag zählt erst ab morgen mit.</p></div>
    <div class="card"><h3>Ziel-Countdown</h3><div class="grid2"><div><label class="lbl" for="st-gd">Datum</label><input class="field num" id="st-gd" type="date" value="${s.goalDate||"2027-01-31"}"></div><div><label class="lbl" for="st-gl">Bezeichnung</label><input class="field" id="st-gl" value="${esc(s.goalLabel||"")}" placeholder="z. B. Ende Auslandssemester"></div></div></div>
    <div class="card"><h3>Musik</h3>
      <label class="lbl" for="st-sp">Spotify-Playlist (Link)</label><input class="field" id="st-sp" value="${esc(s.playlistUrl||"")}" placeholder="https://open.spotify.com/playlist/…">
      <label class="lbl" for="st-sc">SoundCloud (Link zu Playlist oder Profil)</label><input class="field" id="st-sc" value="${esc(s.soundcloudUrl||"")}" placeholder="https://soundcloud.com/…">
      <p class="hint">In SoundCloud: Playlist öffnen → Teilen → Link kopieren → hier einfügen.</p>
      <label class="row" style="justify-content:space-between"><span>Jarvis fliegt herum</span><span class="switch"><input type="checkbox" id="st-fly" ${s.jarvisFly!==false?"checked":""}><span></span></span></label>
      <label class="row" style="justify-content:space-between"><span>Sound beim Start</span><span class="switch"><input type="checkbox" id="st-snd" ${s.startSound!==false?"checked":""}><span></span></span></label>
      <label class="lbl" for="st-am">Beim Tipp auf „Starten“ automatisch öffnen</label>
      <select class="field" id="st-am">${[["soundcloud","SoundCloud"],["spotify","Spotify-Playlist"],["off","Nichts öffnen"]].map(([v,l])=>`<option value="${v}" ${(s.autoMusic||"soundcloud")===v?"selected":""}>${l}</option>`).join("")}</select></div>
    <div class="card"><h3>Erinnerungen</h3>
      <div class="row between"><div><div style="font-weight:600">Kreatin</div><div class="hint">nur wenn noch nicht abgehakt</div></div><div class="row"><input class="field num" id="st-kt" type="time" value="${rem.kreatin.time}" style="width:110px"><label class="switch"><input type="checkbox" id="st-ko" ${rem.kreatin.on?"checked":""}><span></span></label></div></div>
      <div class="row between"><div><div style="font-weight:600">Trainingstag</div><div class="hint">„Heute ist U1/U2 dran“</div></div><div class="row"><input class="field num" id="st-tt" type="time" value="${rem.training.time}" style="width:110px"><label class="switch"><input type="checkbox" id="st-to" ${rem.training.on?"checked":""}><span></span></label></div></div>
      <button class="btn block" id="st-push">Mitteilungen auf diesem iPhone erlauben</button>
      <p class="hint" id="st-pushmsg">Funktioniert nur, wenn Jarvis über „Zum Home-Bildschirm“ installiert ist.</p></div>
    <div class="card"><h3>Supplements</h3><p class="hint">Eins pro Zeile.</p><textarea class="field" id="st-supps" rows="3">${esc(s.supplements.join("\n"))}</textarea></div>
    <div class="card"><h3>Trainingsplan</h3><p class="hint">Übung · Sätze · Wdh von · bis</p>
      ${["U1","U2"].map(u=>`<div class="lbl" style="margin-top:4px">${u}</div><div style="display:flex;flex-direction:column;gap:6px" id="plan-${u}">${planRows(u)}</div><button class="btn ghost sm" data-addex="${u}">${ICON.plus}Übung zu ${u}</button>`).join("")}
      <div class="row"><span class="lbl">Pause zwischen Sätzen</span><input class="field num" id="st-rest" type="number" inputmode="numeric" value="${s.restSeconds||150}" style="width:90px"><span class="muted">s</span></div></div>
    <button class="btn pri block" id="st-save">Speichern</button>
    <button class="btn ghost block" id="st-logout">Abmelden</button>`, sh=>{
      sh.addEventListener("click",e=>{
        if(e.target.closest("[data-close]")) closeSheet();
        const add=e.target.closest("[data-addex]"); if(add){ const u=add.dataset.addex; const box=sh.querySelector("#plan-"+u); const i=box.children.length;
          box.insertAdjacentHTML("beforeend",`<div class="planrow" data-u="${u}" data-i="${i}"><input class="field n" data-k="name" placeholder="Neue Übung"><input class="field num" data-k="sets" type="number" value="2"><input class="field num" data-k="lo" type="number" value="6"><input class="field num" data-k="hi" type="number" value="10"><button class="x" data-delex="${u}-${i}">×</button></div>`); }
        const del=e.target.closest("[data-delex]"); if(del) del.closest(".planrow").remove();
      });
      sh.querySelector("#st-push").onclick=()=>enablePush(sh.querySelector("#st-pushmsg"));
      sh.querySelector("#st-logout").onclick=async()=>{ await sb?.auth.signOut(); session=null; closeSheet(); $("login").hidden=false; };
      sh.querySelector("#st-save").onclick=()=>{
        const n=structuredClone(settings);
        n.proteinTarget = +sh.querySelector("#st-prot").value || 0;
        n.reminders={kreatin:{on:sh.querySelector("#st-ko").checked,time:sh.querySelector("#st-kt").value||"21:00"},training:{on:sh.querySelector("#st-to").checked,time:sh.querySelector("#st-tt").value||"17:00"}};
        n.supplements=sh.querySelector("#st-supps").value.split("\n").map(x=>x.trim()).filter(Boolean);
        n.restSeconds=+sh.querySelector("#st-rest").value||150;
        const okUrl=(v,host)=>{ v=v.trim(); try{ const u=new URL(v); return u.protocol==="https:"&&u.hostname.endsWith(host)?v:""; }catch(_){ return ""; } };
        n.playlistUrl=okUrl(sh.querySelector("#st-sp").value,"spotify.com"); n.soundcloudUrl=okUrl(sh.querySelector("#st-sc").value,"soundcloud.com");
        n.autoMusic=sh.querySelector("#st-am").value; n.startSound=sh.querySelector("#st-snd").checked; n.jarvisFly=sh.querySelector("#st-fly").checked;
        n.trackStart=sh.querySelector("#st-ts").value||"2026-10-19"; n.goalDate=sh.querySelector("#st-gd").value||"2027-01-31"; n.goalLabel=sh.querySelector("#st-gl").value.trim();
        ["U1","U2"].forEach(u=>{ const old=settings.plan?.[u]||[];
          n.plan[u]=[...sh.querySelectorAll(`#plan-${u} .planrow`)].map(row=>{ const g=k=>row.querySelector(`[data-k="${k}"]`).value; const name=g("name").trim(); if(!name) return null;
            const prev=old.find(o=>o.name===name)||{}; const lo=Math.max(1,+g("lo")||6), hi=Math.max(lo,+g("hi")||lo);
            return {...prev,name,sets:Math.max(1,+g("sets")||2),reps:[lo,hi]}; }).filter(Boolean); });
        saveSettings(n); closeSheet(); toast("Gespeichert");
      };
    });
}

/* ---------------- push ---------------- */
const b64ToU8=s=>{ const p="=".repeat((4-s.length%4)%4), b=atob((s+p).replace(/-/g,"+").replace(/_/g,"/")); return Uint8Array.from([...b].map(c=>c.charCodeAt(0))); };
async function enablePush(msg){
  try{
    if(!("serviceWorker" in navigator)||!("PushManager" in window)){ msg.textContent="Mitteilungen gehen nur, wenn Jarvis über „Teilen → Zum Home-Bildschirm“ installiert ist und von dort geöffnet wird."; return; }
    const perm=await Notification.requestPermission(); if(perm!=="granted"){ msg.textContent="Mitteilungen wurden nicht erlaubt. Du kannst das in den iPhone-Einstellungen unter Mitteilungen → Jarvis ändern."; return; }
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToU8(window.COACH_CONFIG.vapidPublic)});
    const j=sub.toJSON(); const {error}=await sb.from("push_subscriptions").upsert({endpoint:j.endpoint,sub:j});
    if(error) throw error;
    msg.textContent="Erledigt. Du bekommst die Erinnerungen zu den eingestellten Zeiten."; toast("Mitteilungen aktiviert");
  }catch(e){ msg.textContent="Aktivieren fehlgeschlagen. Öffne Jarvis vom Home-Bildschirm und versuch es noch einmal."; }
}

/* ---------------- start sequence (eigene Animation) ---------------- */
const BAT_PATH="M50 30 C47 30 46 27 45.5 22 L44 26 C40 24 36 23 32 23 C22 23 12 27 2 34 C8 36 12 40 14 46 C18 42 23 40 28 41 C31 42 34 46 36 52 C39 47 43 45 47 46 C48.5 50 49.3 54 50 58 C50.7 54 51.5 50 53 46 C57 45 61 47 64 52 C66 46 69 42 72 41 C77 40 82 42 86 46 C88 40 92 36 98 34 C88 27 78 23 68 23 C64 23 60 24 56 26 L54.5 22 C54 27 53 30 50 30 Z";
/* eigener Synth-Sound: Woosh + Einschlag + metallischer Nachklang.
   Wird einmal per OfflineAudioContext zu WAV gerendert und über <audio> abgespielt (zuverlässiger auf iOS). */
function synthStart(c,t0,dest){
  const out=c.createGain(); out.gain.value=0.9; const comp=c.createDynamicsCompressor(); comp.threshold.value=-14; comp.ratio.value=4; out.connect(comp); comp.connect(dest);
  const noiseBuf=sec=>{ const bf=c.createBuffer(1,Math.floor(c.sampleRate*sec),c.sampleRate), d=bf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; return bf; };
  const wn=c.createBufferSource(); wn.buffer=noiseBuf(0.8);
  const bp=c.createBiquadFilter(); bp.type="bandpass"; bp.Q.value=1.4;
  bp.frequency.setValueAtTime(300,t0); bp.frequency.exponentialRampToValueAtTime(2600,t0+0.42); bp.frequency.exponentialRampToValueAtTime(500,t0+0.72);
  const wg=c.createGain(); wg.gain.setValueAtTime(0.0001,t0); wg.gain.exponentialRampToValueAtTime(0.6,t0+0.38); wg.gain.exponentialRampToValueAtTime(0.0001,t0+0.75);
  const pan=c.createStereoPanner?c.createStereoPanner():null; wn.connect(bp); bp.connect(wg);
  if(pan){ pan.pan.setValueAtTime(-0.8,t0); pan.pan.linearRampToValueAtTime(0.8,t0+0.7); wg.connect(pan); pan.connect(out); } else wg.connect(out);
  wn.start(t0); wn.stop(t0+0.8);
  const hit=t0+0.62;
  const o=c.createOscillator(); o.type="sine"; o.frequency.setValueAtTime(95,hit); o.frequency.exponentialRampToValueAtTime(32,hit+0.9);
  const og=c.createGain(); og.gain.setValueAtTime(0.0001,hit); og.gain.exponentialRampToValueAtTime(1.0,hit+0.012); og.gain.exponentialRampToValueAtTime(0.0001,hit+1.3);
  o.connect(og); og.connect(out); o.start(hit); o.stop(hit+1.35);
  // Oberton, damit der Einschlag auch auf iPhone-Lautsprechern hörbar ist
  const o2=c.createOscillator(); o2.type="triangle"; o2.frequency.setValueAtTime(190,hit); o2.frequency.exponentialRampToValueAtTime(70,hit+0.5);
  const og2=c.createGain(); og2.gain.setValueAtTime(0.0001,hit); og2.gain.exponentialRampToValueAtTime(0.45,hit+0.01); og2.gain.exponentialRampToValueAtTime(0.0001,hit+0.6);
  o2.connect(og2); og2.connect(out); o2.start(hit); o2.stop(hit+0.65);
  const hn=c.createBufferSource(); hn.buffer=noiseBuf(0.5); const lp=c.createBiquadFilter(); lp.type="lowpass"; lp.frequency.setValueAtTime(1400,hit); lp.frequency.exponentialRampToValueAtTime(150,hit+0.4);
  const hg=c.createGain(); hg.gain.setValueAtTime(0.6,hit); hg.gain.exponentialRampToValueAtTime(0.0001,hit+0.45);
  hn.connect(lp); lp.connect(hg); hg.connect(out); hn.start(hit); hn.stop(hit+0.5);
  [1840,2770,3910].forEach((f,i)=>{ const m=c.createOscillator(); m.type="triangle"; m.frequency.setValueAtTime(f,hit+0.02); m.detune.value=(i-1)*12;
    const mg=c.createGain(); mg.gain.setValueAtTime(0.0001,hit+0.02); mg.gain.exponentialRampToValueAtTime(0.1/(i+1),hit+0.03); mg.gain.exponentialRampToValueAtTime(0.0001,hit+0.9+i*0.15);
    m.connect(mg); mg.connect(out); m.start(hit+0.02); m.stop(hit+1.3); });
}
function synthCeleb(c,t0,dest,big){
  const out=c.createGain(); out.gain.value=0.6; out.connect(dest);
  (big?[392,523.25,659.25,783.99]:[523.25,783.99]).forEach((f,i)=>{ const o=c.createOscillator(); o.type="triangle"; o.frequency.value=f;
    const g=c.createGain(), st=t0+i*0.08; g.gain.setValueAtTime(0.0001,st); g.gain.exponentialRampToValueAtTime(0.4,st+0.015); g.gain.exponentialRampToValueAtTime(0.0001,st+(big?0.9:0.5));
    o.connect(g); g.connect(out); o.start(st); o.stop(st+1); });
  if(big){ const o=c.createOscillator(); o.type="sine"; o.frequency.setValueAtTime(110,t0); o.frequency.exponentialRampToValueAtTime(45,t0+0.5);
    const g=c.createGain(); g.gain.setValueAtTime(0.8,t0); g.gain.exponentialRampToValueAtTime(0.0001,t0+0.6); o.connect(g); g.connect(out); o.start(t0); o.stop(t0+0.65); }
}
function toWav(buf){
  const ch=buf.numberOfChannels, len=buf.length, sr=buf.sampleRate, bytes=len*ch*2, ab=new ArrayBuffer(44+bytes), v=new DataView(ab);
  const ws=(o,str)=>{ for(let i=0;i<str.length;i++) v.setUint8(o+i,str.charCodeAt(i)); };
  ws(0,"RIFF"); v.setUint32(4,36+bytes,true); ws(8,"WAVE"); ws(12,"fmt "); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,ch,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*ch*2,true); v.setUint16(32,ch*2,true); v.setUint16(34,16,true); ws(36,"data"); v.setUint32(40,bytes,true);
  const data=[...Array(ch)].map((_,k)=>buf.getChannelData(k)); let off=44;
  for(let i=0;i<len;i++) for(let k=0;k<ch;k++){ const x=Math.max(-1,Math.min(1,data[k][i])); v.setInt16(off,x<0?x*0x8000:x*0x7FFF,true); off+=2; }
  return URL.createObjectURL(new Blob([ab],{type:"audio/wav"}));
}
const SFX={};
/* iOS: "ambient" mischt sich mit Spotify/SoundCloud statt sie zu stoppen */
function audioAmbient(){ try{ if(navigator.audioSession) navigator.audioSession.type="ambient"; }catch(e){} }
let sfxReady=null;
function renderSfxOnce(){ if(!sfxReady){ audioAmbient(); sfxReady=renderSfx(); } return sfxReady; }
async function renderSfx(){
  try{
    const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext; if(!OAC) return;
    const mk=async(sec,fn)=>{ const c=new OAC(2,Math.floor(44100*sec),44100); fn(c,0,c.destination); return toWav(await c.startRendering()); };
    SFX.start=await mk(2.1,(c,t,d)=>synthStart(c,t,d));
    SFX.up=await mk(0.8,(c,t,d)=>synthCeleb(c,t,d,false));
    SFX.pr=await mk(1.3,(c,t,d)=>synthCeleb(c,t,d,true));
    Object.keys(SFX).forEach(k=>{ const a=new Audio(SFX[k]); a.preload="auto"; SFX[k+"El"]=a; });
  }catch(e){}
}
function playSfx(key){
  if(settings.startSound===false) return;
  audioAmbient(); renderSfxOnce();
  const el=SFX[key+"El"];
  if(el){ try{ el.currentTime=0; const p=el.play(); if(p&&p.catch) p.catch(()=>{}); }catch(e){} return; }
  // Fallback: live Web Audio
  try{ actx=actx||new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==="suspended") actx.resume();
    if(key==="start") synthStart(actx,actx.currentTime+0.02,actx.destination); else synthCeleb(actx,actx.currentTime+0.01,actx.destination,key==="pr"); }catch(e){}
}
let actx=null;
function playStartSound(){ playSfx("start"); }
function startSession(){
  const d=getDay(TODAY()); if(d.training.startedAt) return;
  d.training.startedAt=Date.now(); d.training.pausedMs=0; d.training.pausedAt=null; if(!d.training.type) d.training.type=unit||nextDue().unit; if(!d.training.start) d.training.start=nowTime();
  saveDay(d);
}
function startSequence(){
  playStartSound(); startSession();
  const reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const due=nextDue(); const u=due.unit==="Pause"?(due.last?.training?.type==="U1"?"U2":"U1"):due.unit;
  const ov=document.createElement("div"); ov.className="ignite"+(reduce?" reduce":"");
  ov.innerHTML=`<div class="ig-flash"></div><svg class="ig-bat" viewBox="0 0 100 64" aria-hidden="true"><path d="${BAT_PATH}"/></svg>
    <div class="ig-text"><span>Mission</span><b>${esc(u)}</b><i></i></div>`;
  document.body.appendChild(ov);
  try{ navigator.vibrate&&navigator.vibrate([30,40,60]); }catch(e){}
  setTimeout(()=>{ tab="training"; render(); window.scrollTo(0,0); try{localStorage.setItem("jv-tab",tab);}catch(e){} }, reduce?100:900);
  setTimeout(()=>autoOpenMusic(), reduce?150:950);
  setTimeout(()=>ov.classList.add("out"), reduce?200:1250);
  setTimeout(()=>ov.remove(), reduce?500:1800);
}

/* ---------------- Jarvis, das Fledermaus-Maskottchen ---------------- */
const CHAT_URL="https://claude.ai/artifact/E6ZAsUptXQd5cy6c6EzcQT";
let batN=0;
function batSVG(mood="neutral",size=110){
  batN++;
  const h=Math.round(size*796/896);
  const fx=mood==="excited"?`<svg class="spark" viewBox="0 0 100 100" aria-hidden="true"><path d="M10 8 l2.6 6.5 l6.5 2.6 l-6.5 2.6 l-2.6 6.5 l-2.6 -6.5 l-6.5 -2.6 l6.5 -2.6z" fill="#F0C25A"/><path d="M90 20 l1.8 4.5 l4.5 1.8 l-4.5 1.8 l-1.8 4.5 l-1.8 -4.5 l-4.5 -1.8 l4.5 -1.8z" fill="#F0C25A"/></svg>`
          :mood==="sleepy"?`<span class="zz">z</span><span class="zz z2">z</span>`:"";
  return `<div class="bat3 ${mood}" style="width:${size}px;height:${h}px" aria-hidden="true">
  <i class="shadow"></i><i class="perch"></i>
  <div class="hang"><div class="all">
    <img class="wl" src="jv-wl.webp" alt="" draggable="false" style="left:0;top:44.85%;width:35.94%">
    <img class="wr" src="jv-wr.webp" alt="" draggable="false" style="left:59.82%;top:56.41%;width:40.18%">
    <img class="bd" src="jv-body.webp" alt="" draggable="false" style="left:23.1%;top:5.9%;width:63.28%">
  </div></div>${fx}
</div>`;
}
function jarvisState(){
  const t=TODAY(), d=getDay(t), due=nextDue(), st=sessionState(), h=new Date().getHours();
  const trained=(d.training.sets||[]).some(x=>(x.detail||[]).length), tot=totals(d), pt=+settings.proteinTarget||0;
  const kre=settings.supplements.find(x=>/kreatin/i.test(x)), kreDone=kre&&d.supps?.[kre];
  const pick=a=>a[(new Date().getDate()+h)%a.length];
  if(st&&!st.end) return {mood:"excited",line:pick(["Wir sind drin. Jeder Satz zählt!","Ich schau zu. Mach mich stolz!","Fokus. Saubere Wiederholungen, keine Ausreden."])};
  if(trained) return {mood:"happy",line:pick([`Stark, ${d.training.type||"Training"} ist erledigt! Jetzt Eiweiß und Schlaf.`, "Du warst trainieren. Ich bin richtig stolz.", "Erledigt! Gotham… äh, deine Schultern danken dir."])+(pt&&tot.protein<pt?` Noch ${r(pt-tot.protein)} g Eiweiß.`:"")};
  if(due.unit==="Pause") return {mood:"sleepy",line:h>=21?"Pausentag. Früh ins Bett, morgen wird’s ernst.":"Heute ist Pause. Erholung gehört zum Plan."+(kre&&!kreDone?" Kreatin trotzdem nehmen!":"")};
  if(h>=17) return {mood:"sad",line:pick([`Du warst heute noch nicht trainieren… ${due.unit} wartet auf dich.`,`Es wird dunkel und ${due.unit} ist noch offen. Ich bin ein bisschen traurig.`,"Kein Training heute? Komm schon, ich glaub an dich."])};
  if(kre&&!kreDone&&h>=20) return {mood:"neutral",line:"Kreatin nicht vergessen!"};
  return {mood:"neutral",line:pick([`Heute ist ${due.unit} dran. Sag Bescheid, wenn’s losgeht.`,`Guten Tag! ${due.unit} steht an.`,`Bereit für ${due.unit}? Ich bin es.`])};
}
function jarvisCard(){
  const j=jarvisState();
  return `<section class="card jcard" data-act="jarvis">
    <div class="jav">${batSVG(j.mood,92)}</div>
    <div class="jbub"><div class="lbl">Jarvis</div><p>${esc(j.line)}</p>
      <a class="btn sm" href="${CHAT_URL}" target="_blank" rel="noopener" data-noprop="1">💬 Mit Jarvis reden</a></div>
  </section>`;
}
function jarvisSay(){
  const j=jarvisState(), el=document.querySelector(".hjar .jav"); if(!el) return;
  el.innerHTML=batSVG(j.mood==="sad"?"sad":"excited",118); el.classList.remove("poke"); void el.offsetWidth; el.classList.add("poke");
  const lines={sad:["Hey! Nicht pieksen, lieber trainieren!","Ich werd erst glücklich, wenn du gehst."],happy:["Hehe. Gut gemacht heute!","Noch ein Shake und ich bin komplett zufrieden."],excited:["Weiter! Nächster Satz!","Pause vorbei? Dann los!"],sleepy:["Zzz… Pausentag… lass mich schlafen."],neutral:["Ich bin Jarvis, dein Trainingsbegleiter.","Tipp auf Starten und ich flieg mit."]}[j.mood]||["Hi!"];
  const p=$("jline"); if(p) p.textContent=lines[Math.floor(Math.random()*lines.length)];
  setTimeout(()=>{ const e2=document.querySelector(".hjar .jav"); if(e2) e2.innerHTML=batSVG(jarvisState().mood,118); },1600);
}

/* ---------------- Jarvis fliegt herum ---------------- */
let flying=false, lastFly=0;
function flyby(force){
  if(flying || settings.jarvisFly===false) return; if(window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if(!force && Date.now()-lastFly<45000) return; if($("sheethost").innerHTML) return;
  flying=true; lastFly=Date.now();
  const W=innerWidth, H=innerHeight, fromLeft=Math.random()<.5, y0=H*(.2+Math.random()*.45), y1=H*(.15+Math.random()*.5);
  const el=document.createElement("div"); el.className="flyer"; el.innerHTML=batSVG(jarvisState().mood==="sad"?"neutral":"excited",64);
  document.body.appendChild(el);
  const x0=fromLeft?-80:W+10, x1=fromLeft?W+10:-80, dur=3200+Math.random()*1200, t0=performance.now();
  el.style.setProperty("--flip",fromLeft?"1":"-1");
  el.onclick=()=>{ toast(["Huiii!","Ich pass auf dich auf.","Nicht fangen, trainieren!","Jarvis, auf Patrouille."][Math.floor(Math.random()*4)]); };
  const step=now=>{ const k=Math.min(1,(now-t0)/dur), e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
    const x=x0+(x1-x0)*e, y=y0+(y1-y0)*k+Math.sin(k*Math.PI*3)*28;
    el.style.transform=`translate(${x}px,${y}px) scaleX(var(--flip)) rotate(${Math.cos(k*Math.PI*3)*8}deg)`;
    if(k<1) requestAnimationFrame(step); else { el.remove(); flying=false; } };
  requestAnimationFrame(step);
}
setTimeout(()=>flyby(true),2500);
setInterval(()=>{ if(document.visibilityState==="visible" && Math.random()<.35) flyby(false); },30000);

/* ---------------- Steigerungs-Animation ---------------- */
function celebrateSound(big){ playSfx(big?"pr":"up"); }
function celebrate(type,big,sub){
  const reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll(".celeb").forEach(x=>x.remove());
  const el=document.createElement("div"); el.className=`celeb ${type}${reduce?" reduce":""}`; el.setAttribute("role","status");
  const sparks=reduce?"":[...Array(type==="pr"?18:10)].map((_,k)=>{ const a=(k/(type==="pr"?18:10))*Math.PI*2, dist=90+Math.random()*70; return `<i style="--x:${Math.cos(a)*dist}px;--y:${Math.sin(a)*dist}px;--d:${(Math.random()*0.15).toFixed(2)}s"></i>`; }).join("");
  el.innerHTML=`<div class="cb-ring"></div><div class="cb-sparks">${sparks}</div><div class="cb-box"><div class="cb-jarvis">${batSVG("excited",type==="pr"?96:76)}<div class="cb-say">${type==="pr"?"Jarvis: Unglaublich!":"Jarvis: Steigerung!"}</div></div><b>${esc(big)}</b><span>${esc(sub)}</span></div>`;
  document.body.appendChild(el);
  celebrateSound(type==="pr");
  try{ navigator.vibrate&&navigator.vibrate(type==="pr"?[40,60,40,60,120]:[50,40,50]); }catch(e){}
  setTimeout(()=>el.classList.add("out"), type==="pr"?1700:1100);
  setTimeout(()=>el.remove(), type==="pr"?2200:1500);
}

/* ---------------- Workout-Timer ---------------- */
const fmtDur=ms=>{ const s=Math.max(0,Math.floor(ms/1000)), h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60; return (h?h+":"+String(m).padStart(2,"0"):m)+":"+String(x).padStart(2,"0"); };
function sessionState(){ const tr=days.get(TODAY())?.training; return tr?.startedAt ? {start:tr.startedAt,end:null,paused:tr.pausedAt||null,pausedMs:tr.pausedMs||0} : null; }
function elapsed(st){ if(!st) return 0; const now=st.end||Date.now(); return now-st.start-(st.pausedMs||0)-(st.paused&&!st.end?now-st.paused:0); }
setInterval(()=>{
  const st=sessionState(), pill=$("sesspill");
  const running=st&&!st.end;
  document.querySelectorAll(".sess-time").forEach(e=>e.textContent=fmtDur(elapsed(st)));
  if(pill){ pill.hidden=!(running && tab!=="training"); if(running){ $("sesspilltime").textContent=fmtDur(elapsed(st)); pill.classList.toggle("paused",!!st.paused); } }
},1000);
function workoutStats(d){
  const sets=d.training.sets||[]; let n=0, vol=0, ups=0, prs=0;
  sets.forEach(s=>{ const h=history(s.name).filter(x=>x.date<d.date), last=h[h.length-1], best=bestEver(h);
    (s.detail||[]).forEach((x,i)=>{ n++; vol+=(x.kg||0)*x.reps; const pv=last?.detail?.[i]; if(best&&better(x,best)) prs++; else if(pv&&better(x,pv)) ups++; }); });
  return {n,vol,ups,prs,ex:sets.filter(s=>(s.detail||[]).length).length};
}
function endSession(){
  const d=getDay(TODAY()); const tr=d.training; if(!tr.startedAt) return;
  const now=Date.now(); const pm=(tr.pausedMs||0)+(tr.pausedAt?now-tr.pausedAt:0);
  const mins=Math.max(1,Math.round((now-tr.startedAt-pm)/60000));
  tr.sessions=[...(tr.sessions||[]),{startedAt:tr.startedAt,endedAt:now,pausedMs:pm,minutes:mins}];
  tr.minutes=tr.sessions.reduce((a,x)=>a+(x.minutes||0),0);
  delete tr.startedAt; delete tr.endedAt; delete tr.pausedAt; delete tr.pausedMs;   // Timer zurück auf 0:00
  saveDay(d); clearInterval(tInt); $("timer").hidden=true;
  const w=workoutStats(d);
  openSheet(`<div class="summary"><div class="lbl">Mission abgeschlossen</div><h2 style="font-size:2rem">${esc(d.training.type||"Training")}</h2>
    <div class="stats" style="margin-top:6px">
      <div class="stat"><span class="lbl">Dauer</span><b class="num">${mins}</b><span class="d muted">min</span></div>
      <div class="stat"><span class="lbl">Sätze</span><b class="num">${w.n}</b><span class="d muted">${w.ex} Übungen</span></div>
      <div class="stat"><span class="lbl">Volumen</span><b class="num">${w.vol>=1000?de(w.vol/1000)+"k":r(w.vol)}</b><span class="d muted">kg × Wdh</span></div>
      <div class="stat"><span class="lbl">Steigerungen</span><b class="num" style="color:var(--good)">${w.ups}</b><span class="d muted">vs. letztes Mal</span></div>
      <div class="stat"><span class="lbl">Bestwerte</span><b class="num" style="color:var(--pr)">${w.prs}</b><span class="d muted">neu</span></div>
      <div class="stat"><span class="lbl">Start</span><b class="num" style="font-size:1.3rem">${esc(d.training.start||"–")}</b><span class="d muted">Uhr</span></div>
    </div>
    <button class="btn pri block" data-close style="margin-top:12px">Fertig</button></div>`, sh=>sh.addEventListener("click",e=>{ if(e.target.closest("[data-close]")) closeSheet(); }));
  if(w.prs) setTimeout(()=>celebrate("pr",`${w.prs} Bestwert${w.prs>1?"e":""}`,"heute geknackt"),350);
}

/* ---------------- auto music on start ---------------- */
function autoOpenMusic(){
  const m=settings.autoMusic||"soundcloud"; if(m==="off") return;
  const url = m==="spotify" ? settings.playlistUrl : (settings.soundcloudUrl || "https://soundcloud.com/");
  if(!url) return;
  // muss synchron im Tipp passieren, sonst blockiert iOS das Öffnen
  const a=document.createElement("a"); a.href=url; a.target="_blank"; a.rel="noopener"; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------------- rest timer ---------------- */
let tInt=null, tLeft=0;
function startTimer(){ clearInterval(tInt); tLeft=settings.restSeconds||150; $("timer").hidden=false; paintT(); tInt=setInterval(()=>{ tLeft--; paintT(); if(tLeft<=0){ clearInterval(tInt); try{navigator.vibrate&&navigator.vibrate([200,100,200]);}catch(e){} setTimeout(()=>$("timer").hidden=true,6000);} },1000); }
const paintT=()=>{ $("timertxt").textContent= tLeft>0?`Pause ${Math.floor(tLeft/60)}:${String(tLeft%60).padStart(2,"0")}`:"Nächster Satz!"; };
$("sesspill").onclick=()=>{ tab="training"; render(); window.scrollTo(0,0); };
$("timerstop").onclick=()=>{ clearInterval(tInt); $("timer").hidden=true; };
$("timerplus").onclick=()=>{ tLeft+=30; paintT(); };

/* ---------------- events ---------------- */
document.querySelector("nav.tabs").onclick=e=>{ const b=e.target.closest("[data-tab]"); if(b){ tab=b.dataset.tab; if(tab!=="heute"&&tab!=="koerper") cur=TODAY(); if(tab!=="notizen") noteQ=""; if(Math.random()<.25) setTimeout(()=>flyby(false),400); render(); window.scrollTo(0,0); try{localStorage.setItem("jv-tab",tab);}catch(e){} } };
$("prev").onclick=()=>{cur=shift(cur,-1);render();};
$("next").onclick=()=>{cur=shift(cur,1);render();};
$("today").onclick=()=>{cur=TODAY();render();};
$("opensettings").onclick=settingsSheet;

$("view").addEventListener("click",e=>{
  const t=e.target;
  const go=t.closest("[data-go]"); if(go){ if(go.dataset.go==="training") return startSequence(); tab=go.dataset.go; render(); window.scrollTo(0,0); return; }
  if(t.closest("[data-act=music]")){ e.preventDefault(); return openSheet(`<div class="row between"><h2>Musik</h2><button class="x" data-close>×</button></div>
    <a class="btn pri block" href="${esc(settings.playlistUrl)}" target="_blank" rel="noopener">${ICON.music}Spotify-Playlist</a>
    <a class="btn block" href="${esc(settings.soundcloudUrl)}" target="_blank" rel="noopener">${ICON.music}SoundCloud</a>`, sh=>sh.addEventListener("click",ev=>{ if(ev.target.closest("[data-close]")||ev.target.closest("a")) closeSheet(); })); }
  if(t.closest("[data-act=addfood]")) return foodSheet("suche");
  if(t.closest("[data-act=photofood]")) return foodSheet("foto");
  const q=t.closest("[data-quick]"); if(q){
    const favs=settings.favorites||[]; const recent=[]; const seen=new Set();
    sorted().reverse().forEach(day=>(day.meals||[]).forEach(m=>{ if(!seen.has(m.name)&&recent.length<8){seen.add(m.name);recent.push(m);} }));
    const quick=[...favs,...recent.filter(m=>!favs.some(f=>f.name===m.name))].slice(0,10); addMeal(quick[+q.dataset.quick]); return; }
  const em=t.closest("[data-edit-meal]"); if(em){ mealSheet(+em.dataset.editMeal); return; }
  const dm=t.closest("[data-del-meal]"); if(dm){ const d=getDay(cur); d.meals.splice(+dm.dataset.delMeal,1); saveDay(d); return; }
  const fv=t.closest("[data-fav]"); if(fv){ const d=getDay(cur); const m=d.meals[+fv.dataset.fav]; const s=structuredClone(settings); s.favorites=s.favorites||[];
    const i=s.favorites.findIndex(f=>f.name===m.name); if(i>=0){ s.favorites.splice(i,1); toast("Aus Favoriten entfernt"); } else { s.favorites.push({name:m.name,kcal:m.kcal,carbs:m.carbs,protein:m.protein,fat:m.fat}); toast("Als Favorit gespeichert"); } saveSettings(s); return; }
  const sp=t.closest("[data-supp]"); if(sp){ const d=getDay(cur); const k=sp.dataset.supp; d.supps[k]=!d.supps[k]; saveDay(d); return; }
  const un=t.closest("[data-unit]"); if(un){ unit=un.dataset.unit; unitManual=true; render(); return; }
  const ok=t.closest("[data-set]"); if(ok){ logSet(ok.dataset.set); return; }
  const as=t.closest("[data-addset]"); if(as){ const name=as.closest("[data-ex]").dataset.ex; extraRows[name]=(extraRows[name]||0)+1; render(); return; }
  const ex=t.closest("[data-ex-sel]"); if(ex){ selEx=ex.dataset.exSel; render(); return; }
  if(t.closest("[data-noprop]")) return;
  if(t.closest("[data-act=jarvis]")){ jarvisSay(); return; }
  if(t.closest("[data-act=sess-start]")){ playStartSound(); startSession(); return; }
  if(t.closest("[data-act=sess-pause]")){ const d=getDay(TODAY()); const tr=d.training; if(!tr.startedAt) return;
    if(tr.pausedAt){ tr.pausedMs=(tr.pausedMs||0)+(Date.now()-tr.pausedAt); tr.pausedAt=null; } else tr.pausedAt=Date.now(); saveDay(d); return; }
  const rd=t.closest("[data-act=reset-day]"); if(rd){ if(!rd.dataset.armed){ rd.dataset.armed="1"; rd.textContent="Alle heutigen Sätze löschen? Nochmal tippen"; rd.classList.add("warn"); setTimeout(()=>{ if(document.body.contains(rd)){ delete rd.dataset.armed; rd.textContent="Training zurücksetzen"; rd.classList.remove("warn"); } },3500); return; }
    const d=getDay(TODAY()); d.training={type:"",sets:[]}; Object.keys(extraRows).forEach(k=>delete extraRows[k]); unitManual=false; saveDay(d); toast("Training zurückgesetzt"); return; }
  const se=t.closest("[data-act=sess-end]"); if(se){ if(!se.dataset.armed){ se.dataset.armed="1"; se.textContent="Sicher?"; se.classList.add("pri"); setTimeout(()=>{ if(document.body.contains(se)){ delete se.dataset.armed; se.textContent="■ Beenden"; se.classList.remove("pri"); } },3000); return; } endSession(); return; }
  const ms=t.closest("[data-meas-sel]"); if(ms){ selMeas=ms.dataset.measSel; render(); return; }
  if(t.closest("[data-act=nq-save]")){ const v=$("nq-text").value; if(!v.trim()) return; const lines=v.trim().split("\n"); const n={id:nid(),title:lines.length>1?lines[0].slice(0,80):"",text:lines.length>1?lines.slice(1).join("\n"):v.trim(),color:"",pinned:false,created:Date.now()}; saveNote(n); render(); toast("Notiz gespeichert"); return; }
  const tp=t.closest("[data-tpl]"); if(tp){ const base=TPL[tp.dataset.tpl](); const n={id:nid(),color:"",pinned:false,created:Date.now(),...base}; saveNote(n); render(); noteEditor(n.id); return; }
  const nt=t.closest("[data-ntag]"); if(nt){ noteTag=nt.dataset.ntag; render(); return; }
  const ck=t.closest(".note [data-cki]"); if(ck){ e.stopPropagation(); const card=ck.closest("[data-note]"); const n=structuredClone(notes.get(card.dataset.note)); const L=n.text.split("\n"); const i=+ck.dataset.cki;
    L[i]=/\[( )\]/.test(L[i])?L[i].replace("[ ]","[x]"):L[i].replace(/\[[xX]\]/,"[ ]"); n.text=L.join("\n"); saveNote(n); render(); return; }
  const no=t.closest("[data-note]"); if(no){ noteEditor(no.dataset.note); return; }
});
$("view").addEventListener("submit",e=>{
  if(e.target.dataset.form==="free"){ e.preventDefault(); const n=$("free-name").value.trim(); if(!n) return; const d=getDay(TODAY()); if(!d.training.type) d.training.type=unit;
    if(!d.training.sets.find(x=>x.name===n)) d.training.sets.push({name:n,sets:"",kg:null,detail:[]}); saveDay(d); }
});
$("view").addEventListener("input",e=>{ if(e.target.tagName==="INPUT") e.target.dataset.dirty="1";
  if(e.target.id==="note-q"){ noteQ=e.target.value; const pos=e.target.selectionStart; render(); const q=$("note-q"); if(q){ q.focus(); q.setSelectionRange(pos,pos);} } });
$("view").addEventListener("change",e=>{
  if(e.target.id==="w-kg"){ const d=getDay(cur); d.weight=e.target.value===""?null:+e.target.value; saveDay(d); toast("Gespeichert"); }
  const mk=e.target.dataset?.meas; if(mk){ const d=getDay(cur); const v=e.target.value===""?null:+e.target.value; if(mk==="waist") d.waist=v; else { d.measures=d.measures||{}; d.measures[mk]=v; } saveDay(d); toast("Gespeichert"); }
  if(e.target.id==="photo-in" && e.target.files[0]) uploadPhoto(e.target.files[0]);
});
function logSet(key){
  const [idx,i]=key.split("-").map(Number); const card=document.querySelector(`[data-idx="${idx}"]`); const name=card.dataset.ex;
  const d=getDay(TODAY()); if(!d.training.type) d.training.type=unit; if(!d.training.start) d.training.start=nowTime(); if(!d.training.startedAt) d.training.startedAt=Date.now(); if(d.training.pausedAt){ d.training.pausedMs=(d.training.pausedMs||0)+(Date.now()-d.training.pausedAt); d.training.pausedAt=null; }
  let s=d.training.sets.find(x=>x.name===name); if(!s){ s={name,sets:"",kg:null,detail:[]}; d.training.sets.push(s); } s.detail=s.detail||[];
  if(s.detail[i]){ s.detail.splice(i,1); }
  else {
    const kgRaw=$(`kg-${idx}-${i}`).value, rpEl=$(`rp-${idx}-${i}`); const reps=+rpEl.value || +rpEl.placeholder;
    if(!reps){ toast("Trag die Wiederholungen ein"); return; }
    const kg=kgRaw===""?null:+kgRaw;
    const h=history(name).filter(x=>x.date<TODAY()); const allBest=bestEver(h); const prev=h[h.length-1]?.detail?.[i];
    s.detail.push({kg,reps});
    const short=name.replace(/ \(.*\)/,"");
    if(allBest && better({kg,reps},allBest)) celebrate("pr","Neuer Bestwert",`${short} · ${fmtSet({kg,reps})}`);
    else if(prev && better({kg,reps},prev)){ const dk=(kg||0)-(prev.kg||0); celebrate("up", dk>0?`+${de(dk)} kg`:`+${reps-prev.reps} Wdh`, `${short} · vs. letztes Mal`); }
    startTimer();
  }
  if(!s.detail.length) d.training.sets=d.training.sets.filter(x=>x!==s); else { s.sets=s.detail.map(x=>x.reps).join(" · "); s.kg=Math.max(0,...s.detail.map(x=>x.kg||0))||null; }
  saveDay(d);
}

/* ---------------- boot ---------------- */
try{ const t=localStorage.getItem("jv-tab"); if(["heute","training","fortschritt","koerper","notizen"].includes(t)) tab=t; }catch(e){}
const cached=LS.get("jv-cache");
if(cached){ settings={...DEFAULT_SETTINGS,...(cached.settings||{})}; (cached.days||[]).forEach(d=>days.set(d.date,d)); reports=cached.reports||[]; (cached.notes||[]).forEach(n=>notes.set(n.id,n)); }
render();
audioAmbient();
addEventListener("pointerdown",()=>renderSfxOnce(),{once:true,passive:true});

if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>r.update()).catch(()=>{});
  let reloaded=false; navigator.serviceWorker.addEventListener("controllerchange",()=>{ if(!reloaded){ reloaded=true; location.reload(); } }); }

const cfg=window.COACH_CONFIG||{};
if(!window.supabase||!cfg.url){ setStatus("Offline-Modus"); return; }
sb=window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true}});
async function loadAll(){
  const [s,d,rp,nt]=await Promise.all([ sb.from("settings").select("data").eq("id","main").maybeSingle(), sb.from("days").select("id,data").order("id",{ascending:false}).limit(500), sb.from("reports").select("id,data").order("id",{ascending:false}).limit(8), sb.from("notes").select("id,data").limit(1000) ]);
  if(s.error||d.error){ setStatus("Laden fehlgeschlagen – zeige gespeicherte Daten"); return; }
  if(s.data) settings={...DEFAULT_SETTINGS,...s.data.data};
  days.clear(); d.data.forEach(row=>days.set(row.id,row.data)); reports=rp.data||[];
  if(!nt.error){ notes.clear(); (nt.data||[]).forEach(row=>notes.set(row.id,row.data)); }
  Object.entries(pending).forEach(([p,v])=>{ if(p.startsWith("days/")) days.set(v.date,v); else if(p==="settings/main") settings=v; else if(p.startsWith("notes/")){ const id=p.slice(6); if(v===null) notes.delete(id); else notes.set(id,v); } });
  cacheAll(); render(); setStatus("Synchronisiert");
}
function subscribe(){
  sb.channel("jarvis").on("postgres_changes",{event:"*",schema:"public",table:"days"},p=>{ const row=p.new; if(row?.id&&!pending["days/"+row.id]){ days.set(row.id,row.data); cacheAll(); render(); } })
    .on("postgres_changes",{event:"*",schema:"public",table:"settings"},p=>{ if(p.new?.id==="main"&&!pending["settings/main"]){ settings={...DEFAULT_SETTINGS,...p.new.data}; cacheAll(); render(); } })
    .on("postgres_changes",{event:"*",schema:"public",table:"reports"},()=>loadAll())
    .on("postgres_changes",{event:"*",schema:"public",table:"notes"},p=>{ if(p.eventType==="DELETE"){ if(p.old?.id&&!pending["notes/"+p.old.id]){ notes.delete(p.old.id); cacheAll(); if(tab==="notizen"&&!$("sheethost").innerHTML) render(); } return; }
      const row=p.new; if(row?.id&&!pending["notes/"+row.id]){ notes.set(row.id,row.data); cacheAll(); if(tab==="notizen"&&!$("sheethost").innerHTML) render(); } }).subscribe();
}
async function start(){ await flush(); await loadAll(); subscribe(); }
({data:{session}}=await sb.auth.getSession());
if(session) start(); else { $("login").hidden=false; setStatus("Bitte anmelden"); }
$("loginform").onsubmit=async e=>{ e.preventDefault(); $("loginerr").textContent="";
  const {data,error}=await sb.auth.signInWithPassword({email:$("li-mail").value.trim(),password:$("li-pw").value});
  if(error){ $("loginerr").textContent="Anmeldung fehlgeschlagen. Prüfe E-Mail und Passwort."; return; }
  session=data.session; $("login").hidden=true; start(); };
window.addEventListener("online",()=>{flush();loadAll();});
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"&&session){ flush(); loadAll(); } });
})();
