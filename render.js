const I18N={"zh-CN":{allNormal:"系统一切正常",partialDown:"部分服务故障",allDown:"全部服务离线",lastUpdated:"最后更新于",secondsAgo:"{n}秒前",minutesAgo:"{n}分钟前",hoursAgo:"{n}小时前",online:"在线",uptime:"可用率",responseTime:"响应时间",sslExpiry:"SSL 剩余",days:"天",operational:"正常运行",degraded:"性能降级",down:"服务离线",serviceStatus:"服务状态总览",autoRefresh:"每60秒自动刷新",poweredBy:"自动监测 · 每5分钟刷新",loading:"加载中...",errorLoad:"数据加载失败",noData:"暂无数据",ms:"ms"},"en-US":{allNormal:"All Systems Operational",partialDown:"Partial Outage",allDown:"All Systems Down",lastUpdated:"Last updated",secondsAgo:"{n}s ago",minutesAgo:"{n}m ago",hoursAgo:"{n}h ago",online:"online",uptime:"Uptime",responseTime:"Response",sslExpiry:"SSL",days:"days",operational:"Operational",degraded:"Degraded",down:"Down",serviceStatus:"Service Status",autoRefresh:"Auto-refresh 60s",poweredBy:"Auto-refresh every 5min",loading:"Loading...",errorLoad:"Failed to load",noData:"No data",ms:"ms"},"ja-JP":{allNormal:"全システム正常",partialDown:"一部障害",allDown:"全サービス停止",lastUpdated:"最終更新",secondsAgo:"{n}秒前",minutesAgo:"{n}分前",hoursAgo:"{n}時間前",online:"オンライン",uptime:"稼働率",responseTime:"レスポンス",sslExpiry:"SSL 残り",days:"日",operational:"正常",degraded:"低下",down:"停止",serviceStatus:"サービス一覧",autoRefresh:"60秒自動更新",poweredBy:"5分ごとに自動更新",loading:"読み込み中...",errorLoad:"読み込み失敗",noData:"データなし",ms:"ms"},"ko-KR":{allNormal:"모든 시스템 정상",partialDown:"일부 장애",allDown:"모든 서비스 중단",lastUpdated:"마지막 업데이트",secondsAgo:"{n}초 전",minutesAgo:"{n}분 전",hoursAgo:"{n}시간 전",online:"온라인",uptime:"가동률",responseTime:"응답",sslExpiry:"SSL 남은",days:"일",operational:"정상",degraded:"저하",down:"중단",serviceStatus:"서비스 현황",autoRefresh:"60초 자동 새로고침",poweredBy:"5분 자동 갱신",loading:"로딩...",errorLoad:"로딩 실패",noData:"데이터 없음",ms:"ms"}};

let lang="zh-CN",statusData=null,historyData=null,timer=null,dark=false;

function detectLang(){const s=localStorage.getItem("sl");if(s&&I18N[s])return s;const b=navigator.language||"zh-CN";if(I18N[b])return b;const p=b.split("-")[0];for(const k of Object.keys(I18N))if(k.startsWith(p))return k;return"zh-CN"}
function t(k,p={}){let s=(I18N[lang]&&I18N[lang][k])||k;for(const[a,v]of Object.entries(p))s=s.replace(`{${a}}`,v);return s}
function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML}

function applyI18n(){
  document.querySelectorAll("[data-i18n]").forEach(el=>{const k=el.getAttribute("data-i18n");const v=t(k);if(v!==k)el.textContent=v});
  if(typeof CONFIG!=="undefined"&&CONFIG.pageTitle){document.title=CONFIG.pageTitle;const el=document.getElementById("pageTitle");if(el)el.textContent=CONFIG.pageTitle}
}

function ago(iso){
  if(!iso)return"";const d=Math.floor((Date.now()-new Date(iso).getTime())/1000);
  if(d<0)return t("secondsAgo",{n:0});if(d<60)return t("secondsAgo",{n:d});
  if(d<3600)return t("minutesAgo",{n:Math.floor(d/60)});return t("hoursAgo",{n:Math.floor(d/3600)})
}
function clock(iso){
  if(!iso)return"--:--:--";return new Date(iso).toLocaleTimeString(lang.replace("_","-"),{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})
}
function upLvl(v){if(v==null)return"none";if(v>=99.5)return"good";if(v>=95)return"fair";if(v>=90)return"warn";return"bad"}
function stIcon(s){return s==="operational"?"check_circle":s==="degraded"?"warning":"cancel"}

function dotStatus(site){
  if(site.status==="down")return"err";
  if(site.responseTime>1000)return"warn";
  return"ok";
}
function dotHTML(site,cls){
  const s=dotStatus(site);
  if(s==="ok")return`<span class="st-dot st-ok ${cls||""}"></span>`;
  if(s==="warn")return`<span class="st-dot st-warn ${cls||""}">△</span>`;
  return`<span class="st-dot st-err ${cls||""}">×</span>`;
}
function dotLabel(site){
  const s=dotStatus(site);
  if(s==="ok")return t("operational");
  if(s==="warn")return t("degraded");
  return t("down");
}

async function loadData(){
  const cb=`?t=${Date.now()}`;
  try{
    const[mr,sr]=await Promise.all([fetch("data/manifest.json"+cb).catch(()=>null),fetch("data/status.json"+cb)]);
    if(sr&&sr.ok)statusData=await sr.json();
    let files=["history.json"];
    if(mr&&mr.ok){const m=await mr.json();if(m.files&&m.files.length)files=[...m.files,"history.json"]}
    const resps=await Promise.all(files.map(f=>fetch("data/"+f+cb).catch(()=>null)));
    const mg={daily:{},incidents:[],responseTimeHistory:{}};
    for(const r of resps){
      if(!r||!r.ok)continue;const d=await r.json();
      if(d.daily)for(const[date,v]of Object.entries(d.daily)){
        if(!mg.daily[date])mg.daily[date]=v;else{for(const[site,st]of Object.entries(v.sites||{})){
          if(!mg.daily[date].sites[site])mg.daily[date].sites[site]=st;else{const tgt=mg.daily[date].sites[site];
          tgt.checks+=st.checks||0;tgt.upChecks+=st.upChecks||0;tgt.downChecks+=st.downChecks||0;
          tgt.totalResponseTime=(tgt.totalResponseTime||0)+(st.totalResponseTime||0);
          tgt.avgResponseTime=tgt.upChecks>0?Math.round(tgt.totalResponseTime/tgt.upChecks):0}}
        }}
      if(d.incidents)mg.incidents.push(...d.incidents);
      if(d.responseTimeHistory)for(const[site,pts]of Object.entries(d.responseTimeHistory)){
        if(!mg.responseTimeHistory[site])mg.responseTimeHistory[site]=[];mg.responseTimeHistory[site].push(...pts)}
      if(d.lastUpdate&&(!mg.lastUpdate||d.lastUpdate>mg.lastUpdate))mg.lastUpdate=d.lastUpdate
    }
    for(const s of Object.keys(mg.responseTimeHistory)){mg.responseTimeHistory[s].sort((a,b)=>new Date(a.time)-new Date(b.time));if(mg.responseTimeHistory[s].length>500)mg.responseTimeHistory[s]=mg.responseTimeHistory[s].slice(-500)}
    mg.incidents.sort((a,b)=>new Date(b.time)-new Date(a.time));
    historyData=mg
  }catch(e){console.error("load fail:",e)}
}

function renderHero(){
  const c=document.getElementById("globalStatusCard"),ic=document.getElementById("globalStatusIcon"),
    tx=document.getElementById("globalStatusText"),ti=document.getElementById("lastUpdateTime"),
    ag=document.getElementById("lastUpdateAgo");
  if(!statusData){c.setAttribute("data-status","down");ic.querySelector(".material-symbols-outlined").textContent="cloud_off";tx.textContent=t("errorLoad");return}
  const g=statusData.globalStatus||"operational";c.setAttribute("data-status",g);
  ic.querySelector(".material-symbols-outlined").textContent=stIcon(g);
  tx.textContent=g==="operational"?t("allNormal"):g==="degraded"?t("partialDown"):t("allDown");
  ti.textContent=clock(statusData.lastUpdate);ag.textContent=" · "+ago(statusData.lastUpdate)
}

function renderGroups(){
  const box=document.getElementById("groupsContainer");box.innerHTML="";
  if(!statusData||!statusData.groups)return;
  const th=typeof CONFIG!=="undefined"&&CONFIG.theme?CONFIG.theme:{};
  statusData.groups.forEach((g,idx)=>{
    const allUp=g.online===g.total,allDown=g.online===0;
    let bc="",bt=`${g.online}/${g.total} ${t("online")}`;
    if(!allUp&&!allDown)bc="partial";if(allDown)bc="offline";

    const card=document.createElement("div");card.className="card grp";card.style.animationDelay=`${idx*.06}s`;
    const hd=document.createElement("div");hd.className="grp-hd";
    hd.innerHTML=`<div class="grp-hd-l"><span class="material-symbols-outlined">${gIcon(g.name)}</span><span class="grp-name">${esc(g.name)}</span></div><div class="grp-hd-r"><span class="grp-badge ${bc}">${bt}</span><span class="material-symbols-outlined grp-arrow">expand_more</span></div>`;
    const body=document.createElement("div");body.className="grp-body";

    g.sites.forEach(s=>{
      const el=document.createElement("div");el.className="site";
      el.innerHTML=`<div class="site-row"><div class="site-l">${dotHTML(s)}<span class="site-name">${esc(s.name)}</span></div><span class="site-up">${(s.uptime||0).toFixed(2)}%</span></div>`;
      const blk=document.createElement("div");blk.className="blocks";mkBlocks(blk,s.name);
      const ch=document.createElement("div");ch.className="chart";const cv=document.createElement("canvas");ch.appendChild(cv);
      const meta=document.createElement("div");meta.className="site-meta";
      meta.innerHTML=`<i><span class="material-symbols-outlined">speed</span>${t("responseTime")}: ${s.status==="up"?s.responseTime+" "+t("ms"):"—"}</i><i><span class="material-symbols-outlined">lock</span>${t("sslExpiry")}: ${s.sslDaysLeft>0?s.sslDaysLeft+" "+t("days"):"—"}</i>`;
      el.appendChild(blk);el.appendChild(ch);el.appendChild(meta);body.appendChild(el);
      requestAnimationFrame(()=>drawChart(cv,s.name,th))
    });

    hd.addEventListener("click",()=>{
      if(body.classList.contains("collapsed")){body.classList.remove("collapsed");body.style.maxHeight=body.scrollHeight+"px";hd.classList.remove("collapsed")}
      else{body.style.maxHeight=body.scrollHeight+"px";requestAnimationFrame(()=>{body.classList.add("collapsed");hd.classList.add("collapsed")})}
    });
    card.appendChild(hd);card.appendChild(body);box.appendChild(card);
    requestAnimationFrame(()=>{body.style.maxHeight=body.scrollHeight+"px"})
  })
}

function gIcon(n){if(typeof CONFIG!=="undefined"&&CONFIG.groups){const g=CONFIG.groups.find(x=>x.name===n);if(g&&g.icon)return g.icon}return"folder"}

function mkBlocks(el,name){
  el.innerHTML="";const today=new Date();
  for(let i=29;i>=0;i--){
    const d=new Date(today);d.setDate(d.getDate()-i);const dk=d.toISOString().split("T")[0];
    let up=null;if(historyData&&historyData.daily&&historyData.daily[dk]){const dd=historyData.daily[dk];if(dd.sites&&dd.sites[name]){const s=dd.sites[name];if(s.checks>0)up=Math.round(s.upChecks/s.checks*10000)/100}}
    const b=document.createElement("div");b.className="blk";b.setAttribute("data-l",upLvl(up));
    const tip=document.createElement("div");tip.className="blk-tip";tip.textContent=`${dk}: ${up!==null?up+"%":t("noData")}`;b.appendChild(tip);el.appendChild(b)
  }
}

function drawChart(cv,name,th){
  const box=cv.parentElement,dpr=window.devicePixelRatio||1,r=box.getBoundingClientRect();
  cv.width=r.width*dpr;cv.height=r.height*dpr;cv.style.width=r.width+"px";cv.style.height=r.height+"px";
  const ctx=cv.getContext("2d");ctx.scale(dpr,dpr);
  const W=r.width,H=r.height,pad={t:8,r:8,b:20,l:36},cW=W-pad.l-pad.r,cH=H-pad.t-pad.b;
  let pts=[];if(historyData&&historyData.responseTimeHistory&&historyData.responseTimeHistory[name])pts=historyData.responseTimeHistory[name].slice(-80);
  if(pts.length<2){ctx.fillStyle=dark?"#555":"#aaa";ctx.font="11px 'Noto Sans SC'";ctx.textAlign="center";ctx.fillText(t("noData"),W/2,H/2+4);return}
  const vals=pts.map(p=>p.value);let mx=Math.max(...vals),mn=0;
  if(mx===mn)mx=mx*1.5||100;mx=Math.ceil(mx*1.2/50)*50;
  const gc=dark?"rgba(173,20,87,.18)":"rgba(248,187,208,.22)",tc=dark?"#555":"#aaa";
  ctx.strokeStyle=gc;ctx.lineWidth=.5;ctx.fillStyle=tc;ctx.font="9px 'Noto Sans SC'";ctx.textAlign="right";
  for(let i=0;i<=4;i++){const y=pad.t+cH/4*i;const v=Math.round(mx-mx/4*i);ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();ctx.fillText(v,pad.l-5,y+3)}
  ctx.textAlign="center";const ft=new Date(pts[0].time),lt=new Date(pts[pts.length-1].time);
  for(let i=0;i<=4;i++){const x=pad.l+cW/4*i;const tt=new Date(ft.getTime()+(lt.getTime()-ft.getTime())/4*i);
  ctx.fillText(tt.toLocaleTimeString(lang.replace("_","-"),{hour:"2-digit",minute:"2-digit",hour12:false}),x,H-3)}
  const co=pts.map((p,i)=>({x:pad.l+i/(pts.length-1)*cW,y:pad.t+cH-(p.value-mn)/(mx-mn)*cH}));
  const lc=th.chartLine||"#F48FB1";
  const grd=ctx.createLinearGradient(0,pad.t,0,pad.t+cH);grd.addColorStop(0,lc+"35");grd.addColorStop(1,lc+"05");
  ctx.beginPath();ctx.moveTo(co[0].x,pad.t+cH);co.forEach(c=>ctx.lineTo(c.x,c.y));ctx.lineTo(co[co.length-1].x,pad.t+cH);ctx.closePath();ctx.fillStyle=grd;ctx.fill();
  ctx.beginPath();ctx.strokeStyle=lc;ctx.lineWidth=1.8;ctx.lineJoin="round";ctx.lineCap="round";
  co.forEach((c,i)=>{if(i===0)ctx.moveTo(c.x,c.y);else ctx.lineTo(c.x,c.y)});ctx.stroke()
}

function renderSvc(){
  const box=document.getElementById("serviceList");box.innerHTML="";
  if(!statusData||!statusData.groups)return;
  statusData.groups.forEach(g=>{
    g.sites.forEach(s=>{
      const el=document.createElement("div");el.className="svc-item";
      const ds=dotStatus(s);
      el.innerHTML=`<span class="svc-l">${dotHTML(s)}${esc(s.name)}</span><span class="svc-r ${ds==="ok"?"up":ds}"><span class="material-symbols-outlined">${ds==="ok"?"check_circle":ds==="warn"?"warning":"cancel"}</span>${dotLabel(s)}</span>`;
      box.appendChild(el)
    })
  })
}

function renderAll(){renderHero();renderGroups();renderSvc();if(typeof CONFIG!=="undefined"&&CONFIG.copyright){const e=document.getElementById("copyrightText");if(e)e.textContent=CONFIG.copyright}}

async function refresh(){
  const b=document.getElementById("refreshBtn");b.querySelector(".material-symbols-outlined").style.animation="spin .7s linear infinite";
  await loadData();renderAll();setTimeout(()=>{b.querySelector(".material-symbols-outlined").style.animation=""},700)
}

function initTheme(){
  const s=localStorage.getItem("st");if(s==="dark")setDark();else if(s==="light")setLight();
  else if(window.matchMedia&&window.matchMedia("(prefers-color-scheme:dark)").matches)setDark()
}
function setDark(){dark=true;document.documentElement.setAttribute("data-theme","dark");document.getElementById("themeIcon").textContent="light_mode";localStorage.setItem("st","dark");const l=document.getElementById("appBarLogo");if(l)l.src="logo-dark.webp"}
function setLight(){dark=false;document.documentElement.removeAttribute("data-theme");document.getElementById("themeIcon").textContent="dark_mode";localStorage.setItem("st","light");const l=document.getElementById("appBarLogo");if(l)l.src="logo.webp"}
function toggleTheme(){dark?setLight():setDark();if(statusData)document.querySelectorAll(".chart canvas").forEach(cv=>{const nm=cv.closest(".site").querySelector(".site-name").textContent;const th=typeof CONFIG!=="undefined"&&CONFIG.theme?CONFIG.theme:{};drawChart(cv,nm,th)})}

function initLang(){lang=localStorage.getItem("sl")||detectLang();applyI18n();document.querySelectorAll(".lang-opt").forEach(el=>el.classList.toggle("active",el.getAttribute("data-lang")===lang))}
function switchLang(l){if(!I18N[l])return;lang=l;localStorage.setItem("sl",l);applyI18n();document.querySelectorAll(".lang-opt").forEach(el=>el.classList.toggle("active",el.getAttribute("data-lang")===l));renderAll()}

async function initApp(){
  initTheme();initLang();await loadData();
  const lo=document.getElementById("loadingOverlay");if(lo)lo.classList.add("hidden");
  renderAll();
  document.getElementById("themeBtn").addEventListener("click",toggleTheme);
  document.getElementById("refreshBtn").addEventListener("click",refresh);
  const lb=document.getElementById("langBtn"),lm=document.getElementById("langMenu");
  lb.addEventListener("click",e=>{e.stopPropagation();lm.classList.toggle("show")});
  document.querySelectorAll(".lang-opt").forEach(el=>el.addEventListener("click",()=>{switchLang(el.getAttribute("data-lang"));lm.classList.remove("show")}));
  document.addEventListener("click",()=>lm.classList.remove("show"));
  timer=setInterval(refresh,60000)
}
initApp();
