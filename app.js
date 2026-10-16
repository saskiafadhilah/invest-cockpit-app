/* Investment Cockpit — phone app. Loads data.enc, decrypts with the PIN (AES-256-GCM, PBKDF2), renders tabs. */
const $ = s => document.querySelector(s);
let D = null, fx = 17600;
const idr = x => x==null ? "n/a" : "Rp " + Math.round(x).toLocaleString("en-US");
const idrM = x => x==null ? "n/a" : (Math.abs(x) >= 1e9 ? "Rp " + (x/1e9).toFixed(2) + "B" : "Rp " + (x/1e6).toFixed(1) + "M");
const usd = (x,d=2) => x==null ? "n/a" : "$" + x.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const pct = (x,d=1,sign=true) => x==null||isNaN(x) ? "n/a" : ((sign&&x>0?"+":"")+(x*100).toFixed(d)+"%");
const num = (x,d=1) => x==null||isNaN(x) ? "n/a" : Number(x).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const px = (x,m) => x==null ? "n/a" : (m==="ID" ? "Rp "+Math.round(x).toLocaleString("en-US") : "$"+num(x,2));
const cls = x => x==null ? "" : (x>0?"pos":(x<0?"neg":""));
const chip = a => `<span class="chip ${a}">${a}</span>`;
const halal = u => u.halal==="yes" ? `<span class="chip ok">halal</span>` : u.halal==="no" ? `<span class="chip no">not halal</span>` : `<span class="chip">unverified</span>`;
const trendTxt = t => t ? t.replace(/_/g," ") : "";
const PILL = [["quality","Quality",20,"--s1"],["growth","Growth",20,"--s2"],["valuation","Valuation",15,"--s3"],["momentum","Momentum",15,"--s4"],["catalyst","Catalyst",10,"--s5"],["risk","Risk",10,"--s6"],["regime","Regime",10,"--s7"]];
const bar = (u,pre="s_") => `<div class="bar">${PILL.map(([k,l,m,c])=>`<i style="width:${u[pre+k]||0}%;background:var(${c})"></i>`).join("")}</div>`;
const pills = (u,pre="s_") => PILL.map(([k,l,m])=>`${l} ${num(u[pre+k],0)}/${m}`).join(" &#183; ");
const toast = m => { const t=$("#toast"); t.textContent=m; t.classList.add("on"); setTimeout(()=>t.classList.remove("on"),2200); };

// ---------- crypto
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function decrypt(blob, pin){
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({name:"PBKDF2", salt:b64(blob.salt), iterations:blob.iter, hash:"SHA-256"}, km, {name:"AES-GCM", length:256}, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({name:"AES-GCM", iv:b64(blob.iv)}, key, b64(blob.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function load(pin){
  const r = await fetch("data.enc?ts=" + Date.now(), {cache:"no-store"});
  if(!r.ok) throw new Error("data not available (" + r.status + ")");
  return decrypt(await r.json(), pin);
}
let PIN = null;
try { PIN = localStorage.getItem("cockpit_pin"); } catch(e) {}
$("#lockForm").addEventListener("submit", async e => {
  e.preventDefault(); const pin = $("#pin").value.trim(); $("#lockErr").textContent = "";
  try { D = await load(pin); PIN = pin; if($("#remember").checked){ try{ localStorage.setItem("cockpit_pin", pin);}catch(x){} } $("#lock").style.display="none"; render(); }
  catch(err){ $("#lockErr").textContent = /decrypt|OperationError/i.test(String(err)) ? "Wrong PIN" : String(err.message||err); }
});
$("#refresh").addEventListener("click", async () => { if(!PIN) return; $("#refresh").textContent="…"; try { D = await load(PIN); render(); toast("Updated " + (D.built_at||"").replace("T"," ").slice(0,16) + " UTC"); } catch(e){ toast("Refresh failed: " + e.message); } $("#refresh").textContent="Refresh"; });
(async () => { if(PIN){ try { D = await load(PIN); $("#lock").style.display="none"; render(); return; } catch(e){ try{localStorage.removeItem("cockpit_pin");}catch(x){} PIN=null; } } })();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});

// ---------- tabs
$("#nav").addEventListener("click", e => { const b = e.target.closest("button"); if(!b) return; show(b.dataset.t); });
function show(t){ document.querySelectorAll("section").forEach(s => s.classList.toggle("on", s.id===t)); document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.t===t)); window.scrollTo(0,0); try{localStorage.setItem("cockpit_tab",t);}catch(e){} }

// ---------- render
function render(){
  fx = D.summary.fx_usdidr; const S = D.summary, L = D.rules.limits, TH = D.rules.thresholds;
  $("#stamp").textContent = `Prices ${D.day} · built ${(D.built_at||"").replace("T"," ").slice(0,16)} UTC · USD/IDR ${Math.round(fx).toLocaleString()}`;
  const reserve = S.total_idr * L.min_cash_pct/100;
  const uni = Object.fromEntries(D.universe.map(u=>[u.ticker,u]));
  const byAct = {BUY:[],HOLD:[],TRIM:[],SELL:[]}; D.holdings.forEach(h => (byAct[h.action]||byAct.HOLD).push(h));
  // TODAY
  const verdict = D.buys.length ? `${D.buys.length} BUY-eligible` : "NO TRADE";
  $("#today").innerHTML = `<div class="tiles">
   <div class="tile wide"><div class="k">Total wealth</div><div class="v mono">${idr(S.total_idr)}</div><div class="s">≈ ${usd(S.total_usd,0)} · equities ${pct(S.invested_idr/S.total_idr,0,false)} · gold ${pct(S.gold_pct,0,false)} · cash ${pct(S.cash_pct,1,false)}</div></div>
   <div class="tile"><div class="k">Today</div><div class="v mono ${cls(S.pnl_1d_idr)}">${idrM(S.pnl_1d_idr)}</div><div class="s">week <span class="${cls(S.pnl_1w_idr)}">${idrM(S.pnl_1w_idr)}</span></div></div>
   <div class="tile"><div class="k">Month</div><div class="v mono ${cls(S.pnl_1m_idr)}">${idrM(S.pnl_1m_idr)}</div><div class="s">unrealized <span class="${cls(S.unrealized_pnl_idr)}">${idrM(S.unrealized_pnl_idr)}</span></div></div>
   <div class="tile"><div class="k">Cash in brokers</div><div class="v mono">${idrM(S.cash_idr)}</div><div class="s">reserve ${idrM(reserve)} · free ${idrM(Math.max(0,S.cash_idr-reserve))}</div></div>
   <div class="tile"><div class="k">Verdict</div><div class="v">${verdict}</div><div class="s">${byAct.SELL.length} sell · ${byAct.TRIM.length} trim · ${byAct.HOLD.length} hold</div></div>
   <div class="tile wide"><div class="k">Regime</div><div class="v" style="font-size:15px">US ${D.regime.us_regime.replace("_"," ")} · Indonesia ${D.regime.id_regime}</div><div class="s">S&P vs 200d ${pct((D.regime.indices.spx||{}).pct_above_200,1)} · IDX vs 200d ${pct((D.regime.indices.jkse||{}).pct_above_200,1)} · VIX ${num(D.regime.vix,1)}</div></div>
  </div>
  ${D.note ? `<h2>Strategist reading</h2><div class="note">${D.note}</div>` : ""}
  <h2>Top of scan</h2><div class="list">${D.universe.filter(u=>u.s_total!=null).slice(0,6).map(u=>`<div class="item"><span class="l">${u.ticker} <span class="tiny">${u.market}</span></span><span class="r mono">${num(u.s_total,0)}</span><span class="sub">${trendTxt(u.trend)} · ${u.gate==="BUY"?"buy-eligible":u.gate==="HELD"?"held":(u.gate_note||"").slice(0,60)}</span></div>`).join("")}</div>`;
  // ACTIONS
  const buyCard = b => { const u=uni[b.ticker]||{}, m=b.market, s=b.scores; return `<div class="card stripe BUY"><div class="row"><span class="t">${b.ticker} <span class="tiny">${m}</span></span>${chip("BUY")}</div><div class="small">${b.name||""}</div>
    ${bar({s_quality:s.quality,s_growth:s.growth,s_valuation:s.valuation,s_momentum:s.momentum,s_catalyst:s.catalyst,s_risk:s.risk,s_regime:s.regime})}<div class="tiny" style="margin-top:4px">Score <b>${num(s.total,0)}</b> · ${pills({s_quality:s.quality,s_growth:s.growth,s_valuation:s.valuation,s_momentum:s.momentum,s_catalyst:s.catalyst,s_risk:s.risk,s_regime:s.regime})}</div>
    <dl class="kv"><dt>Price</dt><dd class="mono">${px(b.price,m)} <span class="tiny">${b.asof}</span></dd>
    <dt>Fair value</dt><dd class="mono">${b.fv_base?`${px(b.fv_bear,m)} / <b>${px(b.fv_base,m)}</b> / ${px(b.fv_bull,m)} · ${pct(b.upside,0)}`:"fund: n/a"}</dd>
    <dt>When</dt><dd><b>${(b.entry_setup||"").replace("_"," ")}</b> — ${b.entry_note}</dd>
    <dt>Zone</dt><dd class="mono">${px(b.entry_zone[0],m)} – ${px(b.entry_zone[1],m)}</dd>
    <dt>Size now</dt><dd>${b.tranche_idr>0?`${idrM(b.tranche_idr)} (≈ ${m==="ID"?idr(b.tranche_local):usd(b.tranche_local,0)}), tranche 1/4 → ${b.target_alloc_pct}%`:`no free cash · next contribution`}</dd>
    <dt>Invalidation</dt><dd class="mono">${px(b.invalidation,m)} <span class="tiny">review, not auto-sell</span></dd>
    <dt>Halal</dt><dd>${halal(u)} <span class="tiny">${u.halal_note||""}</span></dd>
    <dt>Catalyst</dt><dd>${b.catalyst_note||""}</dd></dl></div>`; };
  const hCard = (h,a) => `<div class="card stripe ${a}"><div class="row"><span class="t">${h.ticker}</span>${chip(a)}</div><div class="small mono">weight ${num(h.weight_pct,1)}% · P/L <span class="${cls(h.pnl_pct)}">${pct(h.pnl_pct,1)}</span> · score ${num(h.score,0)} · ${trendTxt(h.trend)}</div><div class="small" style="margin-top:4px">${h.reason}</div></div>`;
  $("#actions").innerHTML = `<h2>Buy ${D.buys.length?`(${D.buys.length})`:"— NO TRADE"}</h2>${D.buys.length?D.buys.map(buyCard).join(""):`<div class="card small">No candidate passed every gate today.</div>`}
   ${["SELL","TRIM","HOLD"].map(a=>`<h2>${a} (${byAct[a].length})</h2>${byAct[a].length?byAct[a].map(h=>hCard(h,a)).join(""):`<div class="card small">none</div>`}`).join("")}
   <h2>Watchlist</h2><div class="list">${D.watch.slice(0,15).map(w=>`<div class="item"><span class="l">${w.ticker}</span><span class="r mono">${num(w.score,0)}</span><span class="sub">${w.why_not_yet}</span></div>`).join("")}</div>`;
  // HOLDINGS
  const P = D.positions.slice().sort((a,b)=>b.weight-a.weight); const eq = P.reduce((a,p)=>a+p.value_idr,0);
  const sec = {}; P.forEach(p=>{const k=p.sector||"?"; sec[k]=(sec[k]||0)+p.value_idr;});
  $("#holdings").innerHTML = `<h2>Positions (${P.length})</h2><div class="list">${P.map(p=>{const cap=p.kind==="ETF"?L.max_single_etf_pct:L.max_single_stock_pct, w=p.weight*100; return `<div class="item tap" onclick="this.classList.toggle('open')"><span class="l">${p.ticker} <span class="tiny">${p.broker}</span> ${p.action?chip(p.action):""}</span><span class="r mono ${cls(p.pnl_pct)}">${pct(p.pnl_pct,1)}</span><span class="sub mono">${idrM(p.value_idr)} · ${num(w,1)}% · day <span class="${cls(p.ret_1d)}">${pct(p.ret_1d,1)}</span> · ${trendTxt(p.trend)}</span><div class="wbar" style="grid-column:1/-1"><i class="${w>cap?"over":""}" style="width:${Math.min(100,w/60*100)}%"></i><b style="left:${cap/60*100}%"></b></div><div class="det"><dl class="kv"><dt>Qty</dt><dd class="mono">${p.market==="ID"?Math.round(p.qty).toLocaleString():num(p.qty,4)}</dd><dt>Avg cost</dt><dd class="mono">${px(p.avg_cost,p.market)}</dd><dt>Price</dt><dd class="mono">${px(p.price,p.market)} <span class="tiny">${p.asof}</span></dd><dt>Score</dt><dd>${num(p.score,0)}</dd><dt>Halal</dt><dd>${halal(uni[p.ticker]||{})}</dd><dt>Flag</dt><dd>${p.reason||"—"}</dd></dl></div></div>`;}).join("")}</div>
   <h2>Exposure</h2><div class="card"><dl class="kv" style="margin:0"><dt>Market</dt><dd>US ${pct((S.by_market||{}).US,0,false)} · ID ${pct((S.by_market||{}).ID,0,false)} · cash ${pct(S.cash_pct,0,false)} · gold ${pct(S.gold_pct,0,false)}</dd><dt>Sectors</dt><dd>${Object.entries(sec).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${pct(v/eq,0,false)}`).join(" · ")}</dd><dt>Top 2</dt><dd>${P.length>1?pct(P[0].weight+P[1].weight,0,false)+" in "+P[0].ticker+" + "+P[1].ticker:"—"}</dd></dl></div>
   <h2>Stress test</h2><div class="list">${D.stress.map(s=>`<div class="item"><span class="l" style="font-weight:500">${s.scenario}</span><span class="r mono ${cls(s.pnl_pct)}">${pct(s.pnl_pct,1)}</span><span class="sub mono">${idrM(s.pnl_idr)}</span></div>`).join("")}</div>`;
  // MARKET
  const R = D.regime, IX=[["spx","S&P 500"],["ndx","Nasdaq-100"],["rut","Russell 2000"],["jkse","IDX Composite"],["vix","VIX"],["tnx","US 10y %"],["dxy","Dollar index"],["usdidr","USD/IDR"],["gld","Gold"],["uso","Oil"],["copper","Copper"]];
  $("#market").innerHTML = `<div class="tiles"><div class="tile"><div class="k">United States</div><div class="v">${R.us_regime.replace("_"," ")}</div><div class="s">VIX ${num(R.vix,1)} · 10y ${num(R.us10y,2)}% · growth−value 3m ${pct(R.growth_minus_value_3m,1)}</div></div><div class="tile"><div class="k">Indonesia</div><div class="v">${R.id_regime}</div><div class="s">IDX vs 200d ${pct((R.indices.jkse||{}).pct_above_200,1)} · USD/IDR ${Math.round(R.usdidr||0).toLocaleString()}</div></div></div>
   <div class="tiny" style="margin:8px 0">${R.id_regime==="bear"?"Rule: no adding to Indonesian names while IDX is below its 200-day average.":"Indonesian buys allowed by the regime rule."}</div>
   <h2>Indices</h2><div class="list">${IX.map(([k,l])=>{const i=R.indices[k]||{}; if(i.price==null) return ""; return `<div class="item"><span class="l" style="font-weight:500">${l}</span><span class="r mono">${num(i.price,2)}</span><span class="sub mono">${trendTxt(i.trend)} · vs 200d <span class="${cls(i.pct_above_200)}">${pct(i.pct_above_200,1)}</span> · 1m <span class="${cls(i.ret_1m)}">${pct(i.ret_1m,1)}</span> · 12m <span class="${cls(i.ret_12m)}">${pct(i.ret_12m,1)}</span></span></div>`;}).join("")}</div>
   <h2>Factor tilts</h2><div class="card" style="display:flex;flex-wrap:wrap;gap:6px">${Object.entries(R.tilts||{}).map(([k,v])=>`<span class="chip ${v>0?"ok":v<0?"no":""}">${k} ${v>0?"+":v<0?"−":"0"}</span>`).join("")}</div>`;
  // SCAN
  renderScan();
  // RULES
  const W=D.rules.score_weights, E=D.rules.entry;
  $("#rules").innerHTML = `<details open><summary>Score (0–100)</summary><ul>${PILL.map(([k,l,m,c])=>`<li><span style="color:var(${c})">■</span> <b>${l}</b> ${m} pts</li>`).join("")}<li class="tiny">Quality: ROE, ROA, margins, FCF margin, liquidity, net debt. Growth: revenue/EPS growth and acceleration, FCF growth, fwd vs trailing EPS. Valuation: fwd/trailing PE, PEG, EV/EBITDA, FCF yield, EV/Sales. Momentum: 3/6/12m returns, relative strength, moving averages, 52w distance, RSI penalty. Catalyst: hand-entered from filings. Risk: leverage, volatility, liquidity, beta, country. Regime: fit to current factor tilts.</li></ul></details>
   <details><summary>Shariah screen</summary><ul><li>Indonesia: must be on the OJK Daftar Efek Syariah (official; refreshed 1 Jun / 1 Dec)</li><li>US: must be in the S&amp;P 500 Shariah index (SPUS holdings; AAOIFI screens)</li><li>Funds: SPUS, HLAL, SPTE only</li><li>Unverified names cannot be bought until checked in Zoya or Musaffa</li><li>Non-compliant holdings are flagged "mandate exit": staged sale, purify impure income</li></ul></details>
   <details><summary>Gates a BUY must pass</summary><ul><li>Score ≥ ${TH.buy_min_score} (stock) / ${TH.etf_buy_min_score} (fund); 60–69 = watchlist</li><li>Data confidence ≥ ${Math.round(TH.min_data_confidence*100)}%</li><li>Above 200-day average; not more than ${E.max_pct_above_50dma}% above the 50-day</li><li>Upside to base fair value ≥ 5% (stocks)</li><li>Caps: ${L.max_single_stock_pct}% per stock, ${L.max_single_etf_pct}% per fund, ${L.max_sector_pct}% per sector, ${L.max_positions} positions, cash ≥ ${L.min_cash_pct}%</li><li>Regime: no Indonesian buys while IDX is below its 200-day average</li></ul></details>
   <details><summary>When to buy</summary><ul><li><b>A Accumulate</b>: trend up, not extended → 4 tranches of 25%</li><li><b>B Pullback</b>: within 3% of 50-day average, RSI ≤ ${E.max_rsi_for_pullback}</li><li><b>C Breakout</b>: 60-day resistance on ≥ ${E.breakout_volume_ratio}× volume</li><li><b>D Deep value</b>: below 200-day, oversold, fundamentals intact — manual</li></ul></details>
   <details><summary>Hold · Trim · Sell</summary><ul><li>HOLD while score, trend and weight are within limits</li><li>TRIM review: weight > ${L.trim_trigger_pct}%, score < ${TH.trim_score}, price > 30% above fair value, or +30% with stretched valuation</li><li>SELL review: score < ${TH.sell_score}, or mandate exit. Classes: thesis · valuation · technical+fundamental break · opportunity cost · risk · target reached</li><li>Never sell only because the price fell</li></ul></details>
   <details><summary>Guardrails</summary><ul><li>Wedding (~$15k, Sep 2027): withdraw from weakest positions first; convert in tranches from Jun 2027</li><li>Circuit breaker: equities below Rp 150M → new savings go to cash</li><li>New money diversifies until no stock exceeds 20%</li><li>Daily = monitor · weekly = decide · monthly = deploy and review</li></ul></details>
   <details><summary>Goal plan</summary>${Object.entries(D.plans||{}).map(([n,rows])=>`<div class="small" style="margin-top:8px"><b>Plan ${n}</b></div><table><tr><th>Return</th><th class="n">After wedding</th><th class="n">2y</th><th class="n">3y</th><th class="n">5y</th></tr>${rows.map(r=>`<tr><td>${Math.round(r.cagr*100)}%</td><td class="n mono">${usd(r.y1,0)}</td><td class="n mono">${usd(r.y2,0)}</td><td class="n mono">${usd(r.y3,0)}</td><td class="n mono">${usd(r.y5,0)}</td></tr>`).join("")}</table>`).join("")}<div class="tiny" style="margin-top:6px">Model, not a forecast. Not investment advice; the engine computes, you decide.</div></details>`;
  let t = "today"; try { t = localStorage.getItem("cockpit_tab") || "today"; } catch(e) {} show(t);
}
let F = {market:"ALL", kind:"ALL", elig:false};
function renderScan(){
  const rows = D.universe.filter(u=>u.s_total!=null && (F.market==="ALL"||u.market===F.market) && (F.kind==="ALL"||u.kind===F.kind) && (!F.elig||u.gate==="BUY"));
  const fb = [["market","ALL","All"],["market","US","US"],["market","ID","Indonesia"],["kind","STOCK","Stocks"],["kind","ETF","Funds"],["elig",true,"Buy-eligible"]];
  $("#scan").innerHTML = `<div class="chips">${fb.map(([k,v,l])=>`<button data-k="${k}" data-v="${v}" class="${String(F[k])===String(v)?"on":""}">${l}</button>`).join("")}</div>
   <div class="legend">${PILL.map(([k,l,m,c])=>`<span style="--c:var(${c})">${l}</span>`).join("")}</div>
   <div class="list">${rows.map(u=>`<div class="item tap" onclick="this.classList.toggle('open')"><span class="l">${u.ticker} <span class="tiny">${u.market}</span> ${u.gate==="BUY"?chip("BUY"):""}</span><span class="r mono">${num(u.s_total,0)}</span><span class="sub" style="grid-column:1/-1">${bar(u)}</span><span class="sub">${trendTxt(u.trend)} · RSI ${num(u.rsi,0)} · vs 50d ${pct(u.pct_above_50,1)} · ${u.kind==="ETF"?"fund":"upside "+pct(u.upside,0)} ${halal(u)}</span>
    <div class="det"><div>${pills(u)}</div><dl class="kv"><dt>Name</dt><dd>${u.name||""}</dd><dt>Price</dt><dd class="mono">${px(u.price,u.market)} (${u.asof})</dd><dt>Fwd/trail PE</dt><dd class="mono">${num(u.fwd_pe,1)} / ${num(u.pe,1)}</dd><dt>ROE · FCF yld</dt><dd class="mono">${pct(u.roe,0,false)} · ${pct(u.fcf_yield,1,false)}</dd><dt>Rev / EPS g</dt><dd class="mono">${pct(u.rev_g,0)} / ${pct(u.eps_g,0)}</dd><dt>Fair value</dt><dd class="mono">${u.fv_base?`${px(u.fv_bear,u.market)} / <b>${px(u.fv_base,u.market)}</b> / ${px(u.fv_bull,u.market)}`:"n/a"}</dd><dt>50d / 200d</dt><dd class="mono">${px(u.sma50,u.market)} / ${px(u.sma200,u.market)}</dd><dt>Entry</dt><dd>${u.entry_setup?"<b>"+u.entry_setup.replace("_"," ")+"</b> — ":""}${u.entry_note||""}</dd><dt>Gate</dt><dd>${u.gate==="BUY"?"passes every gate":(u.gate_note||(u.gate==="HELD"?"held":"below watch threshold"))}</dd><dt>Halal</dt><dd>${u.halal_note||""}</dd></dl></div></div>`).join("")}</div>`;
  $("#scan .chips").addEventListener("click", e => { const b=e.target.closest("button"); if(!b) return; if(b.dataset.k==="elig") F.elig=!F.elig; else F[b.dataset.k] = (F[b.dataset.k]===b.dataset.v && b.dataset.k==="kind") ? "ALL" : b.dataset.v; renderScan(); });
}
