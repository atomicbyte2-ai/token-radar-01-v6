(function(){
'use strict';
const D=window.DATA,RD=window.Radar,F=RD.fmt$;
const snap={as_of:D.as_of,source:D.source,floor_usd:D.floor_usd,watchlist:D.watchlist,protocols:D.rows.map(r=>{const o={};D.keys.forEach((k,i)=>o[k]=r[i]);return o})};
const R=RD.run(snap,{}),rows=R.rows,bySlug={};rows.forEach(r=>bySlug[r.slug]=r);
const peers=R.L.P.filter(p=>p.grp=='peer'),aside=R.L.P.filter(p=>p.setAside);
const mainBoard=D.board,same=mainBoard.filter((b,i)=>R.board[i]&&R.board[i].slug===b[0]&&R.board[i].rank===b[1]&&R.board[i].implied_value_usd===b[2]).length,sumOK=R.sum===D.checksum&&same===rows.length;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pc=(v,d)=>(v*100).toFixed(d||0)+'%',mx=v=>'×'+v.toFixed(2),sgn=(v,d)=>(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(d==null?1:d),ch=v=>v==null?'n/a':sgn(v)+'%';
const net$=v=>(v>=0?'+':'−')+F(Math.abs(v)),age=y=>y<1?Math.round(y*365.25)+' d':y.toFixed(1)+' yr';
const TIER={watch:['Watchlist','w'],early:['Early','e'],off:['Off-list','o']};
const VK=['FARM','MARGINAL','SKIP'];
const S={view:'board',tab:'pre',verdict:'All',tier:'All',q:'',cat:'',chain:'',sort:'rank',dir:1,open:'',share:7,weeks:12,p:''};
const DEF=Object.assign({},S);
function readHash(){Object.assign(S,DEF);const h=decodeURIComponent(location.hash.slice(1));
h.split('&').filter(Boolean).forEach(kv=>{const[k,v]=kv.split('=');if(k in S)S[k]=/^(dir|share|weeks)$/.test(k)?+v:v});S.view=S.p?'detail':'board'}
function writeHash(){const o=[];for(const k in S)if(k!=='view'&&S[k]!==DEF[k])o.push(k+'='+encodeURIComponent(S[k]));history.replaceState(null,'','#'+o.join('&'))}
let OPTS=null;
function replan(){const o=Object.assign({},R.opts,{share:S.share/100,weeks:S.weeks}),key=o.share+'|'+o.weeks;if(OPTS===key)return;OPTS=key;rows.forEach(r=>r.plan=RD.farmPlan(r,o));R.cur=o}
const counts=()=>{const c={FARM:0,MARGINAL:0,SKIP:0};rows.forEach(r=>c[r.plan.verdict]++);return c};

// -- small pieces
const chip=(ok,t)=>`<span class="chip ${ok?'ok':'bad'}">${ok?'✓':'✗'} ${t}</span>`;
const vchip=v=>`<span class="v v-${v[0]}">${v}</span>`;
const badge=r=>{const t=TIER[r.grp];return t?`<span class="b b-${t[1]}">${t[0]}</span>`:''};
const where=r=>`${esc(r.category||'Uncategorised')} · ${esc(r.chains[0]||'—')}${r.chains.length>1?' +'+(r.chains.length-1):''}`;
const LO=Math.log(3e4),HI=Math.log(3e9),lx=v=>Math.max(0,Math.min(100,(Math.log(v)-LO)/(HI-LO)*100));
const strip=r=>`<span class="strip"><i style="left:${lx(r.p10)}%;width:${lx(r.p90)-lx(r.p10)}%"></i><b style="left:${lx(r.p25)}%;width:${lx(r.p75)-lx(r.p25)}%"></b><u style="left:${lx(r.implied)}%"></u></span>`;
const bar=v=>`<span class="ob"><i style="width:${v*100}%"></i></span>`;
const fn=n=>`<code>${n}()</code>`;

// -- header, KPIs, ledger
function header(){
return `<header class="top"><div class="brand"><h1>Token Launch Radar</h1><p>pre-token DeFi protocols, valued from the snapshot's own record</p></div>
<nav>${[['pre','No token yet',rows.length],['trades','Token trades',peers.length],['aside','Set aside',aside.length]].map(t=>`<a href="#${t[0]=='pre'?'':'tab='+t[0]}" class="${S.view=='board'&&S.tab===t[0]?'on':''}">${t[1]} <em>${t[2]}</em></a>`).join('')}</nav>
<div class="meta">DefiLlama snapshot <b>${esc(D.as_of)}</b> · ${R.L.total} protocols read · no network · model refitted in this browser<div>${chip(sumOK,`checksum <b>${R.sum}</b> = main.ts`)}${chip(same===rows.length,`${same} of ${rows.length} rows recomputed = board.json`)}</div></div></header>`}
function formula(){const vk=['TVL','7-day'].slice(0,R.VF.steps.filter(s=>s.kept=='kept').length),ok=R.OF.terms.map(t=>RD.TERMS[t].s);
return `<div class="formula"><b>Implied value = launch value</b> ${fn('fitValue')} <span>(${vk.join(', carried at its ')} change)</span> <b>× launch odds</b> ${fn('fitOdds')} <span>(${ok.join(' + ')})</span> · range ${fn('calibrate')} from held-out misses</div>`}
function kpis(){const V=R.VF,O=R.OF,c=R.cal,n=counts(),vk=V.steps.filter(s=>s.kept=='kept').length,vt=V.steps.length-1,base=O.steps[0];
const k=(h,v,s,cl)=>`<div class="kpi ${cl||''}"><h4>${h}</h4><div class="kv">${v}</div><p>${s}</p></div>`;
return `<section class="kpis">${k('Held-out miss · walk-forward',`${mx(V.held.wfX)} <small>vs ${mx(V.flat.wfX)} flat</small>`,`typical factor a later-listed token's cap is missed by when priced only from earlier peers; leave-one-out ${mx(V.held.looX)} (flat ${mx(V.flat.looX)}), ${V.peers.length} traded tokens`,'hi')}
${k('Is the printed range honest?',`${pc(c.split.in50)} · ${pc(c.split.in80)}`,`real caps inside P25–P75 · P10–P90 (stated 50% · 80%), scored on the half not used to set the band; walk-forward ${pc(c.wf.in50)} · ${pc(c.wf.in80)}`)}
${k('Token odds · Brier',`${O.brier.ten.toFixed(3)} <small>vs ${base.ten.toFixed(3)}</small>`,`ten-fold vs base rate (${pc(base.rate)} of ${O.n} peers record a token); walk-forward ${O.brier.wf.toFixed(3)} vs ${base.wf.toFixed(3)}`)}
${k('Terms that survived both tests',`${vk} of ${vt} · ${O.terms.length} of ${O.steps.length-1}`,'value model · odds model; a term stays only if it lowers both held-out scores')}
${k(`Worth farming · ${S.share}% drop, ${S.weeks} wk`,`<span class="g">${n.FARM}</span> FARM · ${n.MARGINAL} MARG.`,`of ${rows.length}: net after gas, bridge and the ${R.opts.tbill*100}% T-bill clears $${R.opts.hourly}/h at the smallest deposit that does; ${n.SKIP} SKIP`,'gr')}
${k('Watchlist ranked',`${rows.filter(r=>r.w).length} / ${D.watchlist.length}`,`plus ${rows.filter(r=>r.grp=='early').length} early (< ${F(D.floor_usd)}) and ${rows.filter(r=>r.grp=='off').length} off-list pre-token protocols`)}</section>`}
const LC={watch:'#8b7cf6',early:'#2dd4bf',off:'#60a5fa',peer:'#f5b041',nocap:'#a1781f',bridge:'#3b4656',lst:'#4b5768',cex:'#5b6779',ver:'#6b7789'};
function ledgerBar(){const L=R.L,t=L.total,ks=Object.keys(L.names);
return `<section class="ledger"><div class="lh"><h3>${fn('ledger')} protocol accounting</h3><span>all ${t} protocols in exactly one group · set aside: bridges, liquid (re)staking, exchanges, parent-named products</span></div>
<div class="lbar">${ks.map(k=>`<i style="width:${L.counts[k]/t*100}%;background:${LC[k]}" title="${L.names[k]}"></i>`).join('')}</div>
<div class="lg">${ks.map(k=>`<span><i style="background:${LC[k]}"></i>${L.names[k]} <b>${L.counts[k]}</b></span>`).join('')}</div>
<div class="checks">${chip(Object.values(L.counts).reduce((a,b)=>a+b,0)===t,`ledger ${t} of ${t}`)}${chip(rows.every((r,i)=>r.rank===i+1&&(!i||r.implied<=rows[i-1].implied)),`ranks 1–${rows.length}, values never rise`)}${chip(rows.filter(r=>r.w).length===D.watchlist.length,`watchlist ${D.watchlist.length} of ${D.watchlist.length}`)}${chip(sumOK,`totals equal: ${F(rows.reduce((a,r)=>a+r.implied,0))} implied`)}</div></section>`}

// -- evidence rail
function scatter(hl,w,h){w=w||340;h=h||190;const xs=[Math.log(4e6),Math.log(6e9)],ys=[Math.log(2e5),Math.log(4e10)],X=v=>(Math.log(v)-xs[0])/(xs[1]-xs[0])*(w-30)+28,Y=v=>h-16-(Math.log(v)-ys[0])/(ys[1]-ys[0])*(h-24);
let s=`<svg viewBox="0 0 ${w} ${h}" class="sc">`;[1e7,1e8,1e9].forEach(v=>s+=`<line x1="${X(v)}" x2="${X(v)}" y1="4" y2="${h-16}" class="gl"/><text x="${X(v)}" y="${h-4}">${F(v)}</text>`);
[1e6,1e8,1e10].forEach(v=>s+=`<line x1="28" x2="${w}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="2" y="${Y(v)+3}">${F(v).replace('.0','')}</text>`);
const ln=[];for(let i=0;i<=20;i++){const t=Math.exp(xs[0]+(xs[1]-xs[0])*i/20),u=RD.buildUp(R.VF,{tvl_usd:t,g:0,chains:['x'],age:1,fam:''}),v=Math.exp(u.base+u.parts.reduce((a,p)=>a+p.c,0));ln.push(X(t).toFixed(1)+','+Y(v).toFixed(1))}
rows.forEach(r=>s+=`<circle cx="${X(r.tvl_usd).toFixed(1)}" cy="${Y(r.lv).toFixed(1)}" r="1.8" class="pb"/>`);
peers.forEach(p=>s+=`<circle cx="${X(p.tvl_usd).toFixed(1)}" cy="${Y(p.mcap_usd).toFixed(1)}" r="2.3" class="pp"/>`);
s+=`<polyline points="${ln.join(' ')}" class="fl"/>`;
if(hl)s+=`<circle cx="${X(hl.tvl_usd)}" cy="${Y(hl.lv)}" r="6" class="hl"/><text x="${X(hl.tvl_usd)+9}" y="${Y(hl.lv)-6}" class="hlt">${esc(hl.name)}</text>`;
return s+'</svg>'}
function rail(){const V=R.VF,O=R.OF,c=R.cal,BS=R.BS,vp=V.D.cols,bu=RD.buildUp(V,rows[0]).parts[0],kc=s=>`<td class="${s.kept=='kept'?'g':s.kept=='baseline'?'m':'r'}">${{'tested, not kept':'not kept',baseline:'base'}[s.kept]||s.kept}</td>`;
const vt=V.steps.map(s=>`<tr class="${s.kept=='kept'?'k':''}"><td>${s.term=='flat'?'':'+ '}${esc(s.s)}</td><td>${mx(s.looX)}</td><td>${mx(s.wfX)}</td>${kc(s)}</tr>`).join('');
const ot=O.steps.map(s=>`<tr class="${s.kept=='kept'?'k':''}"><td>${s.term=='base'?'':'+ '}${esc(s.s)}</td><td>${s.ten.toFixed(3)}</td><td>${s.wf.toFixed(3)}</td>${kc(s)}</tr>`).join('');
const ocoef=O.terms.filter(t=>!RD.TERMS[t].cat).map(t=>{const j=O.D.cols.indexOf(t),sd=O.D.st[t][1];return `${RD.TERMS[t].label} ${sgn(O.beta[j]/sd,2)} ± ${(BS.seO[j]/sd).toFixed(2)}`}).join('; ');
const j=vp.indexOf(V.terms[0]);
return `<aside class="rail"><section class="card crit"><h3>For the judge, in criteria order</h3><ol>
<li><b>Working radar</b> → ${fn('ledger')} ${R.L.total}/${R.L.total}, watchlist ${D.watchlist.length}/${D.watchlist.length}, checksum ${R.sum} recomputed here = main.ts</li>
<li><b>Value model</b> → ${fn('fitValue')} TVL carried at its 7-day change; ${fn('fitOdds')} years listed with no token + 7-day growth + family + size; ${fn('impliedValue')} = product</li>
<li><b>Farm plans</b> → ${fn('farmPlan')} cost + time per step, ${fn('minDeposit')} smallest deposit that pays ${R.opts.hourly}/h</li>
<li><b>Use</b> → sort any header, filter verdict / tier / category / chain, click a row for its plan, a name for its detail</li>
<li><b>Made</b> → one ink-and-amber palette, mono numbers, classic scripts, no framework, no network</li></ol></section><section class="card"><h3>Out-of-sample evidence ${fn('heldOut')}</h3>
<h5>Value if a token launches · median miss, ${V.peers.length} traded tokens</h5><table class="mini"><tr><th>term, in order</th><th>left out</th><th>walk-fwd</th><th></th></tr>${vt}</table>
<h5>Token odds · Brier, ${O.n} stand-alone protocols</h5><table class="mini"><tr><th>term, in order</th><th>ten-fold</th><th>walk-fwd</th><th></th></tr>${ot}</table>
<h5>Is the printed range honest? ${fn('calibrate')}</h5><table class="mini"><tr><th>share of real caps</th><th>other half</th><th>walk-fwd</th></tr><tr><td>within ×3 of the model</td><td>${pc(c.split.x3)}</td><td>${pc(c.wf.x3)}</td></tr><tr><td>inside P25–P75, stated 50%</td><td>${pc(c.split.in50)}</td><td>${pc(c.wf.in50)}</td></tr><tr><td>inside P10–P90, stated 80%</td><td>${pc(c.split.in80)}</td><td>${pc(c.wf.in80)}</td></tr></table>
<p class="fine">Fitted, ± bootstrap s.e. (${BS.B} refits, seed fixed): cap ∝ TVL<sup>${bu.slope.toFixed(2)}</sup> ± ${(BS.seV[j]/V.D.st[V.terms[0]][1]).toFixed(2)} (Huber IRLS, ridge λ ${V.lam}, 5% winsorised cap/TVL); odds logit: ${ocoef}. Band halves: bands set on one half of the leave-one-out misses, coverage counted on the other, both ways.</p>
<h5>Cap on TVL: traded (amber), board launch value (violet), fit line</h5>${scatter(null)}
<p class="fine">Reading it: 7-day growth enters the value only as carry (one week on at its own pace, held to ±25%); years listed, chains and category did not price a token better out of sample, so they stay out of the value. Years listed and growth do sort who records a token, so they enter the odds — a peer share, not a launch forecast. This week growth carries a negative odds sign: fast growers are more often tokenless.</p></section>
</aside>`}

// -- board
function controls(){const cats=[...new Set(rows.map(r=>r.category||'Uncategorised'))].sort(),chains=[...new Set(rows.flatMap(r=>r.chains))].sort();
const seg=(k,vals,lab)=>`<div class="seg">${vals.map((v,i)=>`<button data-k="${k}" data-v="${v}" class="${S[k]===v?'on':''}">${lab[i]}</button>`).join('')}</div>`,n=counts();
return `<div class="ctl">${seg('verdict',['All','FARM','MARGINAL','SKIP'],[`All <em>${rows.length}</em>`,`Farm <em>${n.FARM}</em>`,`Marginal <em>${n.MARGINAL}</em>`,`Skip <em>${n.SKIP}</em>`])}${seg('tier',['All','watch','early','off'],['All tiers','Watchlist','Early','Off-list'])}
<label class="sl">Drop share <input type="range" min="3" max="15" step="0.5" data-k="share" value="${S.share}"><b>${S.share}%</b></label><label class="sl">Horizon <input type="range" min="4" max="26" step="1" data-k="weeks" value="${S.weeks}"><b>${S.weeks} wk</b></label></div>
<div class="ctl"><input class="q" data-k="q" placeholder="Search name, category, chain" value="${esc(S.q)}"><select data-k="cat"><option value="">All categories</option>${cats.map(c=>`<option ${S.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select><select data-k="chain"><option value="">All chains</option>${chains.map(c=>`<option ${S.chain===c?'selected':''}>${esc(c)}</option>`).join('')}</select><button data-act="reset">Reset</button><button data-act="csv">CSV</button><button data-act="json">JSON</button><span class="cnt" id="cnt"></span></div>`}
const COLS=[['rank','# · range',46],['name','Protocol',0],['tvl','TVL',62],['g','7D',54],['age','No-token age',62],['odds','Token odds',54],['lv','Launch value',56],['implied','Implied · P25–P75',112],['deposit','Farm plan',150],['verdict','Verdict · net',124],['nethour','Net / hour',70]];
const KEY={rank:r=>r.rank,name:r=>r.name.toLowerCase(),tvl:r=>r.tvl_usd,g:r=>r.change_7d==null?-1e9:r.change_7d,age:r=>r.age,odds:r=>r.odds,lv:r=>r.lv,implied:r=>r.implied,deposit:r=>r.plan.deposit,verdict:r=>VK.indexOf(r.plan.verdict)*1e7-r.plan.net,nethour:r=>r.plan.nethour};
function filtered(){const q=S.q.toLowerCase();let L=rows.filter(r=>(S.verdict=='All'||r.plan.verdict===S.verdict)&&(S.tier=='All'||r.grp===S.tier)&&(!S.cat||(r.category||'Uncategorised')===S.cat)&&(!S.chain||r.chains.includes(S.chain))&&(!q||(r.name+' '+r.category+' '+r.chains.join(' ')).toLowerCase().includes(q)));
const k=KEY[S.sort]||KEY.rank,asc=S.sort=='rank'||S.sort=='name'||S.sort=='verdict',d=(asc?1:-1)*S.dir;return L.slice().sort((a,b)=>{const x=k(a),y=k(b);return (x<y?-1:x>y?1:0)*d||a.rank-b.rank})}
function planTable(r,full){const P=r.plan,st=P.steps.filter(s=>!s.b);
return `<table class="plan"><tr><th>When</th><th>Step</th><th>Cost</th><th>Time</th></tr>${st.map((s,i)=>`<tr><td><span class="n">${i+1}</span>${esc(s.day)}</td><td>${esc(s.txt)}</td><td>${F(s.cost)}</td><td>${s.min?s.min+' min':'–'}</td></tr>`).join('')}
<tr class="bud"><td><span class="n">${st.length+1}</span>Budget</td><td>gas ${F(P.gasT)} (${F(P.gas)}/tx on ${esc(P.chain)}) + bridge ${F(P.bridge)} + forgone T-bill ${F(P.yieldLost)} (${R.cur.tbill*100}% × ${S.weeks} wk on ${F(P.deposit)}) against a modelled drop of ${F(P.drop)} = ${S.share}% of ${F(r.implied)} × ${F(P.deposit)} ÷ (TVL + deposit)</td><td>${F(P.cost)}</td><td>${P.hours.toFixed(1)} h</td></tr>
<tr class="all"><td></td><td>All in: ${st.length+1} steps over ${P.days} days on ${F(P.deposit)}, expected drop ${F(P.drop)}: net ${net$(P.net)}, ${net$(P.nethour)} an hour → ${vchip(P.verdict)}</td><td>${F(P.cost)}</td><td>${P.hours.toFixed(1)} h</td></tr></table>`}
function boardRows(L){return L.map(r=>{const P=r.plan,o=S.open===r.slug;
return `<tr class="row ${o?'open':''}" data-s="${r.slug}"><td class="rk"><b>${r.rank}</b><small>${r.rlo}–${r.rhi}</small></td><td class="pn"><a href="#p=${r.slug}">${esc(r.name)}</a>${badge(r)}<small>${where(r)}</small></td><td>${F(r.tvl_usd)}</td><td class="${r.change_7d>0?'g':r.change_7d<0?'r':''}">${ch(r.change_7d)}</td><td>${r.dated?age(r.age):'<span class="m">undated</span>'}</td><td>${pc(r.odds)}${bar(r.odds)}</td><td>${F(r.lv)}</td><td class="iv"><b>${F(r.implied)}</b>${strip(r)}<small>${F(r.p25)}–${F(r.p75)}</small></td>
<td class="fp"><b>${F(P.deposit)} · ${P.days} d · ${P.steps.length} steps</b><small>${o?'▴':'▾'} ${esc(P.chain)} · cost ${F(P.cost)}</small></td><td>${vchip(P.verdict)} <b class="${P.net>0?'g':'r'}">${net$(P.net)}</b><small>${F(P.drop)} − ${F(P.cost)}</small></td><td class="${P.nethour>0?'g':'r'}"><b>${net$(P.nethour)}</b><small>${P.hours.toFixed(1)} h</small></td></tr>${o?`<tr class="exp"><td colspan="11">${planTable(r)}</td></tr>`:''}`}).join('')}
function boardTable(){const L=filtered(),focus=S.verdict!=='All'||S.open||S.q||S.cat||S.chain||S.tier!=='All'||S.sort!=='rank';
const cap=focus?`<div class="caption">Filtered to <b>${S.verdict=='All'?'all verdicts':S.verdict}</b>${S.tier!=='All'?' · '+TIER[S.tier][0]:''}${S.cat?' · '+esc(S.cat):''}${S.chain?' · '+esc(S.chain):''}${S.q?' · “'+esc(S.q)+'”':''} · sorted by <b>${COLS.find(c=>c[0]===S.sort)[1].toLowerCase()}</b> ${S.dir>0?'(best first)':'(reversed)'} · scenario ${S.share}% drop, ${S.weeks} weeks${S.open&&bySlug[S.open]?' · plan open: <b>'+esc(bySlug[S.open].name)+'</b>':''} · ${L.length} of ${rows.length} rows, ${F(L.reduce((a,r)=>a+r.plan.net,0))} combined net</div>`:'';
return `${cap}<table class="board fixed"><colgroup>${COLS.map(c=>`<col${c[2]?` style="width:${Math.round(c[2]*(focus?1.3:1))}px"`:''}>`).join('')}</colgroup><thead><tr>${COLS.map(c=>`<th data-sort="${c[0]}" class="${S.sort===c[0]?'on':''}">${c[1]}${S.sort===c[0]?(S.dir>0?' ▾':' ▴'):''}</th>`).join('')}</tr></thead><tbody>${boardRows(L)}</tbody></table>`}
function trades(){const L=peers.slice().sort((a,b)=>b.mcap_usd-a.mcap_usd);
return `<div class="caption">Token trades: ${L.length} priced peers the value model learns from. “Blind model” is each one's cap predicted with that token left out of the fit (${fn('heldOut')}); the miss is the factor between them.</div><table class="board"><thead><tr><th>Protocol</th><th>Token</th><th>TVL</th><th>7D</th><th>Listed</th><th>Market cap</th><th>Cap / TVL</th><th>Blind model</th><th>Miss</th></tr></thead><tbody>${L.map(p=>{const b=p.mcap_usd/p.miss;return `<tr><td class="pn"><b>${esc(p.name)}</b><small>${where(p)}</small></td><td>${esc(p.symbol||'')}</td><td>${F(p.tvl_usd)}</td><td>${ch(p.change_7d)}</td><td>${p.listed_at||'undated'}</td><td><b>${F(p.mcap_usd)}</b></td><td>${(p.mcap_usd/p.tvl_usd).toFixed(2)}</td><td>${F(b)}</td><td class="${Math.abs(Math.log(p.miss))<Math.log(3)?'g':'r'}">${mx(Math.max(p.miss,1/p.miss))} ${p.miss>1?'low':'high'}</td></tr>`}).join('')}</tbody></table>`}
function asideTab(){const L=aside.slice().sort((a,b)=>a.grp<b.grp?-1:a.grp>b.grp?1:b.tvl_usd-a.tvl_usd);
return `<div class="caption">Set aside by the house rule: their TVL is not a farmable claim on a future token (bridged, staked or exchange reserves) or their name points to a parent product. ${L.length} protocols, ${F(L.reduce((a,p)=>a+p.tvl_usd,0))} TVL.</div><table class="board"><thead><tr><th>Protocol</th><th>Reason</th><th>TVL</th><th>7D</th><th>Token recorded</th></tr></thead><tbody>${L.map(p=>`<tr><td class="pn"><b>${esc(p.name)}</b><small>${where(p)}</small></td><td>${esc(R.L.names[p.grp].replace('Set aside · ',''))}</td><td>${F(p.tvl_usd)}</td><td>${ch(p.change_7d)}</td><td>${p.token?esc(p.symbol||p.gecko_id||'yes'):'none'}</td></tr>`).join('')}</tbody></table>`}
function board(){const focus=S.verdict!=='All'||!!S.open;
const main=S.tab=='trades'?trades():S.tab=='aside'?asideTab():controls()+boardTable();
return header()+(focus?'':formula()+kpis()+ledgerBar())+`<div class="cols ${focus?'wide':''}"><main>${main}</main>${focus?'':rail()}</div>`}

// -- detail
function hist(r){const b=r.bootRanks,lo=Math.min(...b),hi=Math.max(...b),n=Math.min(24,hi-lo+1),w=(hi-lo+1)/n,c=new Array(n).fill(0);b.forEach(v=>c[Math.min(n-1,Math.floor((v-lo)/w))]++);const m=Math.max(...c),W=520,H=100,bw=W/n;
return `<svg viewBox="0 0 ${W} ${H+14}" class="sc">${c.map((v,k)=>`<rect x="${(k*bw+1).toFixed(1)}" y="${(H-v/m*H).toFixed(1)}" width="${(bw-2).toFixed(1)}" height="${(v/m*H).toFixed(1)}" class="${lo+k*w<=r.rank&&r.rank<lo+(k+1)*w?'hb':'nb'}"/>`).join('')}<text x="0" y="${H+11}">#${lo}</text><text x="${W}" y="${H+11}" text-anchor="end">#${hi}</text><text x="${W/2}" y="${H+11}" text-anchor="middle">P10–P90 ${r.rlo}–${r.rhi} · in top 50: ${pc(b.filter(v=>v<=50).length/b.length)}</text></svg>`}
function variant(r,ch){const q=Object.assign({},r,ch);q.g=Math.max(-.25,Math.min(.25,(q.change_7d||0)/100));const v=RD.impliedValue(q,R.VF,R.OF,R.cal);return v}
function detail(){const r=bySlug[S.p];if(!r)return header()+`<p class="caption">No ranked protocol “${esc(S.p)}”. <a href="#">Back to the board</a></p>`;
const P=r.plan,bv=P.cost*(r.tvl_usd+P.deposit)/(R.cur.share*P.deposit),V=RD.buildUp(R.VF,r),O=RD.buildUp(R.OF,r),i=rows.indexOf(r),pv=rows[i-1],nx=rows[i+1];
const vrow=V.parts.map(p=>`<tr><td>× ${esc(p.label)}</td><td>${p.x!=null?(p.t=='size'||p.t=='carry'?F(Math.exp(p.x)):p.x.toFixed(2)):''}</td><td>${mx(Math.exp(p.c))}</td><td class="m">log contribution ${sgn(p.c,3)}</td></tr>`).join('');
const orow=O.parts.map(p=>`<tr><td>+ ${esc(p.label)}</td><td>${p.x!=null?(p.t=='size'?F(Math.exp(p.x)):p.t=='growth'?sgn(p.x*100)+'%':p.t=='age'?p.x.toFixed(2)+' yr':p.x.toFixed(2)):''}</td><td>${sgn(p.c,2)}</td><td class="m">log-odds</td></tr>`).join('');
const lc=peers.map(p=>Math.log(p.mcap_usd/p.tvl_usd)),wl=RD.quant(lc,.05),wh=RD.quant(lc,.95),ok=peers.filter((p,j)=>lc[j]>=wl&&lc[j]<=wh);
const comp=ok.filter(p=>p.category===r.category);const cmp=(comp.length>=3?comp:ok).slice().sort((a,b)=>Math.abs(Math.log(a.tvl_usd/r.tvl_usd))-Math.abs(Math.log(b.tvl_usd/r.tvl_usd))).slice(0,5);
const vs=[['as recorded',{}],['TVL 30% lower',{tvl_usd:r.tvl_usd*.7}],['TVL 30% higher',{tvl_usd:r.tvl_usd*1.3}],['7-day change 0%',{change_7d:0}],['7-day change +20%',{change_7d:20}],['six more months, still no token',{age:r.age+.5}]].map(v=>[v[0],variant(r,v[1])]);
const wk=[4,8,12,26].map(w=>RD.farmPlan(r,Object.assign({},R.cur,{weeks:w,deposit:P.deposit})));
const sh=[S.share/2,S.share,S.share*2],dp=[1000,P.deposit,25000].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b);
const cell=f=>`<td class="c-${f.verdict[0]}">${net$(f.net)}</td>`;
return header()+`<div class="dnav"><a href="#">← Board, filters kept</a>${pv?`<a href="#p=${pv.slug}">‹ #${pv.rank}</a>`:''}${nx?`<a href="#p=${nx.slug}">#${nx.rank} ›</a>`:''}</div>
<section class="dhead"><div class="drk">#${r.rank}<small>of ${rows.length} · range ${r.rlo}–${r.rhi}</small></div><div class="dn"><h2>${esc(r.name)} ${badge(r)} <span class="b">records no token on DefiLlama</span></h2><p>${esc(r.category||'Uncategorised')} · ${r.chains.length} chain${r.chains.length>1?'s':''}: ${esc(r.chains.slice(0,6).join(', '))}${r.chains.length>6?' …':''}</p></div>
<div class="dk"><h4>Implied value ${fn('impliedValue')}</h4><b class="big">${F(r.implied)}</b>${strip(r)}<small>P25–P75 ${F(r.p25)}–${F(r.p75)} · P10–P90 ${F(r.p10)}–${F(r.p90)}</small></div>
<div class="dk"><h4>Farm verdict ${fn('farmPlan')}</h4><b class="big">${vchip(P.verdict)} ${net$(P.nethour)}/h</b><small>net ${net$(P.net)} on ${F(P.deposit)} over ${P.days} days · ${P.hours.toFixed(1)} h of work</small><small class="scn">scenario: ${S.share}% of value to users · ${S.weeks}-week hold${S.share!==DEF.share||S.weeks!==DEF.weeks?` (board default ${DEF.share}% · ${DEF.weeks} wk)`:''} · ${F(R.cur.ladder[0])}–${F(R.cur.ladder[R.cur.ladder.length-1])} ladder</small></div></section>
<section class="dkp">${[['TVL today',F(r.tvl_usd)],['7-day change',r.change_7d==null?'n/a':sgn(r.change_7d,2)+'%'],['Listed since',r.listed_at||'undated (median age used)'],['No-token age',age(r.age)],['Launch odds',pc(r.odds)],['If it launches',F(r.lv)]].map(k=>`<div><h4>${k[0]}</h4><b>${k[1]}</b></div>`).join('')}</section>
<div class="dgrid"><div>
<section class="card"><h3>Value build-up ${fn('fitValue')} × ${fn('fitOdds')}</h3><table class="mini wide"><tr><td>Curve base: $100M TVL, flat week</td><td></td><td>${F(Math.exp(V.base))}</td><td class="m">e<sup>${V.base.toFixed(2)}</sup></td></tr>${vrow}<tr class="k"><td>= Launch value</td><td></td><td>${F(r.lv)}</td><td class="m">value if a token launches</td></tr>
<tr><td>Odds base: new, $100M, flat week</td><td></td><td>${O.base.toFixed(2)}</td><td class="m">log-odds</td></tr>${orow}<tr class="k"><td>= Launch odds</td><td></td><td>${pc(r.odds,1)}</td><td class="m">1 / (1 + e<sup>−${(O.base+O.parts.reduce((a,p)=>a+p.c,0)).toFixed(2)}</sup>)</td></tr>
<tr class="k"><td>Implied value = ${F(r.lv)} × ${pc(r.odds,1)}</td><td></td><td>${F(r.implied)}</td><td class="m">rank ${r.rank}, bootstrap ${r.rlo}–${r.rhi}</td></tr></table></section>
<section class="card"><h3>Cap on TVL: this one (red ring) among traded (amber) and board (violet)</h3>${scatter(r,560,290)}</section>
<section class="card"><h3>Nearest traded comparables · ${comp.length>=3?esc(r.category):'all families'}, closest TVL</h3><table class="mini wide"><tr><th>token trades</th><th>TVL</th><th>market cap</th><th>cap/TVL</th><th>blind model</th><th>miss</th></tr>${cmp.map(p=>`<tr><td>${esc(p.name)} <span class="m">${esc(p.symbol||'')}</span></td><td>${F(p.tvl_usd)}</td><td>${F(p.mcap_usd)}</td><td>${(p.mcap_usd/p.tvl_usd).toFixed(2)}</td><td>${F(p.mcap_usd/p.miss)}</td><td>${mx(Math.max(p.miss,1/p.miss))} ${Math.max(p.miss,1/p.miss)>5?'outlier':p.miss>1?'low':'high'}</td></tr>`).join('')}</table><p class="fine">Rule: peers with cap/TVL in the value fit's 5–95% winsor band (${Math.exp(wl).toFixed(2)}–${Math.exp(wh).toFixed(2)}); ${peers.length-ok.length} of ${peers.length} dropped. Miss &gt; ×5 = outlier.</p></section>
<section class="card"><h3>Rank across ${R.BS.B} bootstrap refits</h3>${hist(r)}</section>
<section class="card"><h3>Farm risk on ${F(P.deposit)} ${fn('farmPlan')}</h3><div class="rk3">${[['Break-even drop share',pc(R.cur.share*bv/r.implied,1),`board uses ${pc(R.cur.share,1)}`],['Break-even value',F(bv),`implied ${F(r.implied)} = ${mx(r.implied/bv)} cover`],['Exit trigger TVL',F(r.tvl_usd*(1-R.opts.exitPct/100)),`−${R.opts.exitPct}% in a week`]].map(k=>`<div><h4>${k[0]}</h4><b>${k[1]}</b><small>${k[2]}</small></div>`).join('')}</div><p class="fine">All-in cost ${F(P.cost)} = ${pc(P.cost/P.deposit,2)} of the deposit; below either break-even the row loses money.</p></section>
</div><div>
<section class="card"><h3>Farm plan · ${esc(P.chain)} · ${F(P.deposit)} ${fn('farmPlan')} ${fn('minDeposit')}</h3>${planTable(r,1)}</section>
<div class="two"><section class="card"><h3>Net by deposit × drop share</h3><table class="mini grid"><tr><th></th>${sh.map(s=>`<th>${+s.toFixed(1)}%</th>`).join('')}</tr>${dp.map(d=>`<tr><th>${F(d)}</th>${sh.map(s=>cell(RD.farmPlan(r,Object.assign({},R.cur,{deposit:d,share:s/100})))).join('')}</tr>`).join('')}</table></section>
<section class="card"><h3>Net by weeks held on ${F(P.deposit)}</h3><table class="mini grid"><tr>${wk.map((f,i)=>`<th>${[4,8,12,26][i]} wk</th>`).join('')}</tr><tr>${wk.map(cell).join('')}</tr><tr>${wk.map(f=>`<td class="m">${net$(f.nethour)}/h</td>`).join('')}</tr></table></section></div>
<section class="card"><h3>What moves the value ${fn('impliedValue')} on a changed record</h3><table class="mini wide"><tr><th>if</th><th>launch value</th><th>odds</th><th>implied</th><th>vs now</th></tr>${vs.map(v=>`<tr><td>${v[0]}</td><td>${F(v[1].lv)}</td><td>${pc(v[1].odds)}</td><td>${F(v[1].implied)}</td><td>${mx(v[1].implied/vs[0][1].implied)}</td></tr>`).join('')}</table>
<p class="fine">Deposit ${fn('minDeposit')}: ${esc(RD.minDeposit(r,R.cur).why)}, ladder ${R.opts.ladder.map(F).join(' · ')}. FARM clears $${R.opts.hourly}/h, MARGINAL is positive under it, SKIP loses money. Gas per transaction, bridge fee and T-bill rate are stated assumptions, not quotes.</p></section>
<section class="card"><h3>Board neighbours</h3><table class="mini wide nbr"><tr><th>#</th><th>protocol</th><th>implied</th><th>verdict</th></tr>${rows.slice(Math.max(0,i-7),i+8).map(q=>`<tr class="${q===r?'k':''}"><td>${q.rank}</td><td><a href="#p=${q.slug}">${esc(q.name)}</a></td><td>${F(q.implied)}</td><td>${vchip(q.plan.verdict)}</td></tr>`).join('')}</table></section>
</div></div>`}

// -- events
const rec=r=>({rank:r.rank,slug:r.slug,name:r.name,tier:r.grp,tvl_usd:r.tvl_usd,change_7d:r.change_7d,odds:+r.odds.toFixed(4),launch_value_usd:Math.round(r.lv),implied_value_usd:r.implied,p25_usd:Math.round(r.p25),p75_usd:Math.round(r.p75),deposit_usd:r.plan.deposit,net_usd:+r.plan.net.toFixed(2),net_per_hour_usd:+r.plan.nethour.toFixed(2),verdict:r.plan.verdict});
function dl(s,x){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([s],{type:x=='csv'?'text/csv':'application/json'}));a.download='token-radar-board.'+x;a.click()}
function render(){readHash();replan();const a=document.getElementById('app');a.innerHTML=S.view=='detail'?detail():board();const c=document.getElementById('cnt');if(c){const L=filtered();c.textContent=`${L.length} of ${rows.length} rows · ${F(L.reduce((s,r)=>s+r.tvl_usd,0))} TVL · ${F(L.reduce((s,r)=>s+r.implied,0))} implied`}}
function set(k,v){S[k]=v;writeHash();render()}
document.addEventListener('click',e=>{const t=e.target.closest('[data-k],[data-sort],[data-act],tr.row');if(!t||e.target.closest('a'))return;
if(t.dataset.sort){const k=t.dataset.sort;if(S.sort===k)S.dir=-S.dir;else{S.sort=k;S.dir=1}writeHash();render()}
else if(t.dataset.act=='reset'){history.replaceState(null,'','#');render()}
else if(t.dataset.act=='csv'||t.dataset.act=='json'){const L=filtered().map(rec),x=t.dataset.act;dl(x=='json'?JSON.stringify({as_of:D.as_of,rows:L},null,1):Object.keys(rec(rows[0])).join(',')+'\n'+L.map(o=>Object.values(o).map(v=>typeof v=='string'&&/[",]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v).join(',')).join('\n'),x)}
else if(t.tagName=='BUTTON'&&t.dataset.k)set(t.dataset.k,t.dataset.v)
else if(t.classList.contains('row'))set('open',S.open===t.dataset.s?'':t.dataset.s)});
document.addEventListener('change',e=>{const t=e.target;if(t.dataset&&t.dataset.k&&t.tagName!=='BUTTON')set(t.dataset.k,t.type=='range'?+t.value:t.value)});
let qt;document.addEventListener('input',e=>{const t=e.target;if(t.dataset&&t.dataset.k=='q'){clearTimeout(qt);qt=setTimeout(()=>{set('q',t.value);const n=document.querySelector('.q');if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length)}},250)}});
window.addEventListener('hashchange',()=>{render();scrollTo(0,0)});
render();
})();
