(function(){
'use strict';
const YR=31557600000,clamp=(x,a,b)=>x<a?a:x>b?b:x,sum=a=>a.reduce((s,v)=>s+v,0);
function quant(a,q){const s=a.slice().sort((x,y)=>x-y),h=(s.length-1)*q,i=Math.floor(h);return s[i]+(s[Math.min(i+1,s.length-1)]-s[i])*(h-i)}
const med=a=>quant(a,.5),X=v=>Math.exp(v);
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function solve(A,b){const n=b.length;A=A.map(r=>r.slice());b=b.slice();for(let i=0;i<n;i++){let m=i;for(let k=i+1;k<n;k++)if(Math.abs(A[k][i])>Math.abs(A[m][i]))m=k;[A[i],A[m]]=[A[m],A[i]];[b[i],b[m]]=[b[m],b[i]];for(let k=i+1;k<n;k++){const f=A[k][i]/A[i][i];if(f)for(let j=i;j<n;j++)A[k][j]-=f*A[i][j];b[k]-=f*b[i]}}const x=new Array(n).fill(0);for(let i=n-1;i>=0;i--){let t=b[i];for(let j=i+1;j<n;j++)t-=A[i][j]*x[j];x[i]=t/A[i][i]}return x}
const dot=(r,b)=>{let t=0;for(let j=0;j<r.length;j++)t+=r[j]*b[j];return t};

// ---------- ledger(): every protocol in exactly one group ----------
const SET_ASIDE=[[/bridge/i,'bridge'],[/liquid (re)?staking|^restaking$/i,'liquid staking'],[/^cex$/i,'exchange']];
const MARK=/\b(wrapped|staked)\b|\sv\d+(\.\d+)?$/i,first=n=>n.toLowerCase().split(/[\s\-_.]/)[0];
function prep(snap){
  const asof=Date.parse(snap.as_of),W=new Set(snap.watchlist);
  const ages=snap.protocols.filter(p=>p.listed_at).map(p=>(asof-Date.parse(p.listed_at))/YR),ageMed=med(ages);
  return snap.protocols.map(p=>{const g=p.change_7d==null?0:clamp(p.change_7d/100,-.25,.25);
    const age=p.listed_at?(asof-Date.parse(p.listed_at))/YR:ageMed;
    return {...p,w:W.has(p.slug),token:!!(p.gecko_id||p.symbol||p.mcap_usd!=null),priced:p.mcap_usd>0,g,age,dated:!!p.listed_at,fam:p.category||'Other'}});
}
function ledger(snap,P){
  P=P||prep(snap);const tokFirst=new Set(P.filter(p=>p.token).map(p=>first(p.name))),big={};P.forEach(p=>{if(!p.token){const k=first(p.name);if(!big[k]||p.tvl_usd>big[k].tvl_usd)big[k]=p}});
  const product=p=>{const k=first(p.name);return k.length>2&&(tokFirst.has(k)||MARK.test(p.name)&&big[k]!==p)};
  const G={watch:'Ranked · watchlist',early:'Ranked · early, below the floor',off:'Ranked · off-list, above the floor',peer:'Token trades · priced peer',nocap:'Token recorded · no usable cap',bridge:'Set aside · bridge',lst:'Set aside · liquid staking / restaking',cex:'Set aside · exchange',ver:'Set aside · product of a parent (shared name / version)'};
  for(const p of P){const sa=SET_ASIDE.find(r=>r[0].test(p.category||''));
    p.grp=p.w?'watch':sa?['bridge','lst','cex'][SET_ASIDE.indexOf(sa)]:p.priced?'peer':p.token?'nocap':product(p)?'ver':p.tvl_usd<snap.floor_usd?'early':'off';
    p.ranked=p.grp==='watch'||p.grp==='early'||p.grp==='off';p.setAside=/^(bridge|lst|cex|ver)$/.test(p.grp);}
  const counts={};for(const k in G)counts[k]=0;P.forEach(p=>counts[p.grp]++);
  return {P,names:G,counts,total:P.length};
}

// ---------- shared design: features standardised on all protocols (no outcome used) ----------
const TERMS={
  size:{s:'size, log TVL',label:'size, log TVL',f:p=>Math.log(p.tvl_usd)},
  carry:{s:'7-day carry of TVL',label:'7-day carry, log TVL × (1+7d)',f:p=>Math.log(p.tvl_usd*(1+p.g))},
  chains:{s:'chain count, log',label:'chain count, log',f:p=>Math.log(p.chains.length||1)},
  age:{s:'years listed',label:'years listed',f:p=>p.age},
  growth:{s:'7-day growth',label:'7-day TVL growth',f:p=>p.g},
  fam:{s:'category effect',label:'category effect · ridge',cat:true}
};
function design(P,terms,fams){
  const st={};for(const t of terms)if(!TERMS[t].cat){const v=P.map(TERMS[t].f),m=sum(v)/v.length,s=Math.sqrt(sum(v.map(x=>(x-m)*(x-m)))/v.length)||1;st[t]=[m,s]}
  const row=p=>{const r=[1];for(const t of terms){if(TERMS[t].cat)for(const f of fams)r.push(p.fam===f?1:0);else r.push((TERMS[t].f(p)-st[t][0])/st[t][1])}return r};
  return {row,st,cols:['intercept'].concat(...terms.map(t=>TERMS[t].cat?fams.map(f=>'family: '+f):[t]))};
}
function families(list,minN){const c={};list.forEach(p=>c[p.category||'Other']=(c[p.category||'Other']||0)+1);return Object.keys(c).filter(k=>c[k]>=minN).sort()}
function famOf(fams){return p=>{p.fam=fams.includes(p.category||'Other')?(p.category||'Other'):'pooled'}}

// ---------- fitValue(): robust ridge (Huber IRLS) of log cap ----------
function huber(R,y,pen,lam,c,it){
  const k=R[0].length,n=R.length;let w=new Array(n).fill(1),b;
  for(let t=0;t<it;t++){const A=Array.from({length:k},()=>new Array(k).fill(0)),v=new Array(k).fill(0);
    for(let i=0;i<n;i++){const r=R[i],wi=w[i];for(let a=0;a<k;a++){const ra=wi*r[a];if(!ra)continue;v[a]+=ra*y[i];for(let d=a;d<k;d++)A[a][d]+=ra*r[d]}}
    for(let a=0;a<k;a++){for(let d=0;d<a;d++)A[a][d]=A[d][a];A[a][a]+=lam*pen[a]}
    b=solve(A,v);const e=R.map((r,i)=>y[i]-dot(r,b)),s=med(e.map(Math.abs))/0.6745||1,h=c*s;w=e.map(x=>Math.abs(x)<=h?1:h/Math.abs(x));}
  return b;
}
function valueFitter(peers,terms,opt){
  const fams=opt.fams,D=design(opt.all,terms,fams),R=peers.map(D.row),y=peers.map(p=>Math.log(p.mcap_usd));
  const pen=[0];for(const t of terms){if(TERMS[t].cat)fams.forEach(()=>pen.push(opt.catRidge));else pen.push(1)}
  const lt=peers.map(p=>Math.log(p.tvl_usd)),fit=(idx,lam)=>{let yy=idx.map(i=>y[i]);if(opt.wins){const r=idx.map(i=>y[i]-lt[i]),lo=quant(r,opt.wins),hi=quant(r,1-opt.wins);yy=idx.map((i,q)=>lt[i]+clamp(r[q],lo,hi))}return huber(idx.map(i=>R[i]),yy,pen,lam,opt.c,opt.it)};
  const pickLam=idx=>{let best=opt.lams[0],bm=1e9;for(const lam of opt.lams){if(opt.lams.length<2){best=lam;break}const e=[];for(let f=0;f<4;f++){const tr=idx.filter((_,q)=>q%4!==f),b=fit(tr,lam);idx.forEach((i,q)=>{if(q%4===f)e.push(Math.abs(y[i]-dot(R[i],b)))})}const m=med(e);if(m<bm-1e-12){bm=m;best=lam}}return best};
  return {D,R,y,pen,fit,pickLam};
}
function wfFolds(list,K){const o=list.map((p,i)=>i).sort((a,b)=>(list[a].listed_at||'0000').localeCompare(list[b].listed_at||'0000')||(list[a].slug<list[b].slug?-1:1)),n=o.length,out=[];
  for(let f=1;f<K;f++)out.push({train:o.slice(0,Math.floor(n*f/K)),test:o.slice(Math.floor(n*f/K),Math.floor(n*(f+1)/K))});return out}
function heldOut(peers,terms,opt){
  const V=valueFitter(peers,terms,opt),n=peers.length,all=peers.map((_,i)=>i),loo=new Array(n),wf=[];
  for(let i=0;i<n;i++){const tr=all.filter(j=>j!==i),b=V.fit(tr,V.pickLam(tr));loo[i]=V.y[i]-dot(V.R[i],b)}
  for(const F of wfFolds(peers,6)){const b=V.fit(F.train,V.pickLam(F.train));F.test.forEach(i=>wf.push({i,e:V.y[i]-dot(V.R[i],b)}))}
  return {loo,wf,looX:X(med(loo.map(Math.abs))),wfX:X(med(wf.map(o=>Math.abs(o.e))))};
}
function flatHeldOut(peers){const r=peers.map(p=>Math.log(p.mcap_usd/p.tvl_usd)),all=r.map((_,i)=>i);
  const loo=all.map(i=>Math.abs(r[i]-med(r.filter((_,j)=>j!==i)))),wf=[];
  for(const F of wfFolds(peers,6)){const m=med(F.train.map(i=>r[i]));F.test.forEach(i=>wf.push(Math.abs(r[i]-m)))}
  return {looX:X(med(loo)),wfX:X(med(wf)),mult:X(med(r))}}
function fitValue(L,opt){
  opt=Object.assign({c:.3,it:12,catRidge:8,minFam:5,lams:[3],wins:.05},opt||{});
  const peers=L.P.filter(p=>p.grp==='peer');opt.fams=families(peers,opt.minFam);L.P.forEach(famOf(opt.fams));opt.all=L.P;
  const flat=flatHeldOut(peers),steps=[{term:'flat',s:'flat median cap/TVL',label:'flat median cap/TVL',looX:flat.looX,wfX:flat.wfX,kept:'baseline'}];
  let terms=['size'],cur=heldOut(peers,terms,opt);steps.push({term:'size',s:TERMS.size.s,label:TERMS.size.label,looX:cur.looX,wfX:cur.wfX,kept:cur.looX<flat.looX&&cur.wfX<flat.wfX?'kept':'base'});
  let pool=opt.pool||['chains','age','fam','growth','carry'];const tried={};
  for(;;){let best=null;
    for(const t of pool){const ts=t==='carry'?terms.map(x=>x==='size'?'carry':x):terms.concat(t),h=heldOut(peers,ts,opt);tried[t]=h;
      if(h.looX<cur.looX&&h.wfX<cur.wfX&&(!best||Math.log(h.looX)+Math.log(h.wfX)<Math.log(best.h.looX)+Math.log(best.h.wfX)))best={t,ts,h}}
    if(!best)break;terms=best.ts;cur=best.h;pool=pool.filter(x=>x!==best.t&&!(best.t==='growth'&&x==='carry')&&!(best.t==='carry'&&x==='growth'));
    steps.push({term:best.t,s:TERMS[best.t].s,label:TERMS[best.t].label,looX:cur.looX,wfX:cur.wfX,kept:'kept'})}
  for(const t of pool)steps.push({term:t,s:TERMS[t].s,label:TERMS[t].label,looX:tried[t].looX,wfX:tried[t].wfX,kept:'tested, not kept'});
  const V=valueFitter(peers,terms,opt),all=peers.map((_,i)=>i),lam=V.pickLam(all),beta=V.fit(all,lam);
  return {terms,steps,flat,held:cur,peers,beta,lam,D:V.D,V,opt,predict:p=>dot(V.D.row(p),beta)};
}

// ---------- fitOdds(): L2 logistic (Newton) of "records a token" ----------
function logit(R,y,lam,it){const k=R[0].length;let b=new Array(k).fill(0);
  for(let t=0;t<it;t++){const A=Array.from({length:k},()=>new Array(k).fill(0)),g=new Array(k).fill(0);
    for(let i=0;i<R.length;i++){const r=R[i],p=1/(1+Math.exp(-dot(r,b))),w=p*(1-p),e=y[i]-p;for(let a=0;a<k;a++){if(!r[a])continue;g[a]+=e*r[a];const wa=w*r[a];for(let d=a;d<k;d++)A[a][d]+=wa*r[d]}}
    for(let a=0;a<k;a++){for(let d=0;d<a;d++)A[a][d]=A[d][a];if(a){A[a][a]+=lam;g[a]-=lam*b[a]}}
    const s=solve(A,g);b=b.map((v,j)=>v+s[j])}
  return b}
const sig=z=>1/(1+Math.exp(-z));
function oddsHeld(pool,terms,fams,lam,all){
  const D=design(all,terms,fams),R=pool.map(D.row),y=pool.map(p=>p.token?1:0),ord=pool.map((_,i)=>i).sort((a,b)=>pool[a].slug<pool[b].slug?-1:1);
  let tf=0;for(let f=0;f<10;f++){const te=ord.filter((_,q)=>q%10===f),tr=ord.filter((_,q)=>q%10!==f),b=logit(tr.map(i=>R[i]),tr.map(i=>y[i]),lam,8);te.forEach(i=>{const e=y[i]-sig(dot(R[i],b));tf+=e*e})}
  let wf=0,wn=0,base=0;for(const F of wfFolds(pool,6)){const b=logit(F.train.map(i=>R[i]),F.train.map(i=>y[i]),lam,8);const br=sum(F.train.map(i=>y[i]))/F.train.length;F.test.forEach(i=>{const e=y[i]-sig(dot(R[i],b));wf+=e*e;base+=(y[i]-br)*(y[i]-br);wn++})}
  return {ten:tf/pool.length,wf:wf/wn,wfBase:base/wn,D,R,y};
}
function fitOdds(L,opt){
  opt=Object.assign({lam:1,minFam:8},opt||{});
  const pool=L.P.filter(p=>!p.setAside),fams=families(pool,opt.minFam),famMap=p=>fams.includes(p.category||'Other')?(p.category||'Other'):'pooled';
  const P2=L.P.map(p=>Object.assign({},p,{fam:famMap(p)})),pool2=P2.filter(p=>!p.setAside);
  const y=pool2.map(p=>p.token?1:0),rate=sum(y)/y.length,ord=pool2.map((_,i)=>i).sort((a,b)=>pool2[a].slug<pool2[b].slug?-1:1);
  let tb=0;for(let f=0;f<10;f++){const tr=ord.filter((_,q)=>q%10!==f),r=sum(tr.map(i=>y[i]))/tr.length;ord.forEach((i,q)=>{if(q%10===f)tb+=(y[i]-r)*(y[i]-r)})}
  const h0=oddsHeld(pool2,[],fams,opt.lam,P2);
  const steps=[{term:'base',s:'base rate',label:'base rate of peers',ten:tb/y.length,wf:h0.wfBase,kept:'baseline',rate}];
  let terms=[],cur={ten:tb/y.length,wf:h0.wfBase},cand=['age','size','growth','chains','fam'];const tried={};
  for(;;){let best=null;for(const t of cand){const h=oddsHeld(pool2,terms.concat(t),fams,opt.lam,P2);tried[t]=h;if(h.ten<cur.ten&&h.wf<cur.wf&&(!best||h.ten+h.wf<best.h.ten+best.h.wf))best={t,h}}
    if(!best)break;terms=terms.concat(best.t);cur=best.h;cand=cand.filter(x=>x!==best.t);steps.push({term:best.t,s:TERMS[best.t].s,label:TERMS[best.t].label,ten:cur.ten,wf:cur.wf,kept:'kept'})}
  for(const t of cand)steps.push({term:t,s:TERMS[t].s,label:TERMS[t].label,ten:tried[t].ten,wf:tried[t].wf,kept:'tested, not kept'});
  const D=design(P2,terms,fams),R=pool2.map(D.row),beta=logit(R,y,opt.lam,12),fm={};P2.forEach(p=>fm[p.slug]=p.fam);
  const map=p=>Object.assign({},p,{fam:fm[p.slug]||famMap(p)});
  return {map,terms,steps,fams,beta,D,R,y,rate,n:pool2.length,lam:opt.lam,brier:cur,predict:p=>sig(dot(D.row(Object.assign({},p,{fam:fm[p.slug]||famMap(p)})),beta))};
}

// ---------- calibrate(): bands from held-out residuals, coverage scored on the other half ----------
function calibrate(VF){
  const r=VF.held.loo,idx=VF.peers.map((_,i)=>i).sort((a,b)=>VF.peers[a].slug<VF.peers[b].slug?-1:1),A=idx.filter((_,q)=>q%2===0),B=idx.filter((_,q)=>q%2===1);
  const bands=s=>({q10:quant(s,.1),q25:quant(s,.25),q75:quant(s,.75),q90:quant(s,.9)});
  const cov=(bd,ix)=>{const v=ix.map(i=>r[i]);return {in50:v.filter(e=>e>=bd.q25&&e<=bd.q75).length/v.length,in80:v.filter(e=>e>=bd.q10&&e<=bd.q90).length/v.length,x3:v.filter(e=>Math.abs(e)<=Math.log(3)).length/v.length}};
  const cA=cov(bands(A.map(i=>r[i])),B),cB=cov(bands(B.map(i=>r[i])),A),full=bands(r),w=VF.held.wf.map(o=>o.e);
  const wv={in50:w.filter(e=>e>=full.q25&&e<=full.q75).length/w.length,in80:w.filter(e=>e>=full.q10&&e<=full.q90).length/w.length,x3:w.filter(e=>Math.abs(e)<=Math.log(3)).length/w.length};
  return {bands:full,split:{in50:(cA.in50+cB.in50)/2,in80:(cA.in80+cB.in80)/2,x3:(cA.x3+cB.x3)/2},wf:wv,n:r.length,nwf:w.length};
}
function impliedValue(p,VF,OF,cal){const lv=X(VF.predict(p)),od=OF.predict(p),b=cal.bands;
  return {lv,odds:od,implied:Math.max(1,Math.round(lv*od)),p10:lv*od*X(b.q10),p25:lv*od*X(b.q25),p75:lv*od*X(b.q75),p90:lv*od*X(b.q90)}}
function bootstrap(L,VF,OF,rows,B){
  const rnd=mulberry32(20261114),pe=VF.peers,n=pe.length,m=OF.R.length,coefV=[],coefO=[],ranks=rows.map(()=>[]);
  const RV=rows.map(p=>VF.D.row(p)),RO=rows.map(p=>OF.D.row(Object.assign({},p,{fam:OF.fams.includes(p.category||'Other')?(p.category||'Other'):'pooled'})));
  for(let t=0;t<B;t++){const iv=[],io=[];for(let i=0;i<n;i++)iv.push(Math.floor(rnd()*n));for(let i=0;i<m;i++)io.push(Math.floor(rnd()*m));
    const bv=huber(iv.map(i=>VF.V.R[i]),iv.map(i=>VF.V.y[i]),VF.V.pen,VF.lam,VF.opt.c,6),bo=logit(io.map(i=>OF.R[i]),io.map(i=>OF.y[i]),OF.lam,6);coefV.push(bv);coefO.push(bo);
    const val=rows.map((p,j)=>dot(RV[j],bv)+Math.log(sig(dot(RO[j],bo)))),o=val.map((v,j)=>j).sort((a,b)=>val[b]-val[a]||(rows[a].slug<rows[b].slug?-1:1));o.forEach((j,q)=>ranks[j].push(q+1))}
  const se=C=>C[0].map((_,j)=>{const v=C.map(c=>c[j]),mu=sum(v)/v.length;return Math.sqrt(sum(v.map(x=>(x-mu)*(x-mu)))/(v.length-1))});
  return {ranks,seV:se(coefV),seO:se(coefO),rankLo:ranks.map(r=>Math.round(quant(r,.1))),rankHi:ranks.map(r=>Math.round(quant(r,.9))),B};
}

// ---------- farm plan ----------
const GAS={Ethereum:1.5,Bitcoin:2,Tron:.6,Arbitrum:.1,Base:.08,Optimism:.1,Solana:.05,Binance:.1,Polygon:.05,Avalanche:.15,Sui:.05,Aptos:.05,Sonic:.05,Hyperliquid:.05,'Hyperliquid L1':.05,Monad:.05,Plasma:.05,Mantle:.08,Linea:.1,Scroll:.1};
const DEF={share:.07,weeks:12,tbill:.04,hourly:25,ladder:[250,500,1000,2500,5000,10000,25000,50000]};
function cheapChain(p){let best=p.chains[0]||'Ethereum',g=GAS[best]??.2;for(const c of p.chains){const v=GAS[c]??.2;if(v<g){g=v;best=c}}return {chain:best,gas:g}}
function action(p,c,d){const n=p.name,k=(p.category||'').toLowerCase(),$=fmt$(d);
  if(/lending|cdp|credit/.test(k))return [`supply ${$} of USDC to ${n}'s largest stablecoin market on ${c}; if you borrow at all, stay at or under 30% LTV`,2];
  if(/dex|liquidity|amm/.test(k))return [`add ${$} to ${n}'s deepest USDC/USDT pool on ${c} with a wide range, then swap ${fmt$(d/4)} through it and back once for volume`,4];
  if(/deriv|perp|option|prediction/.test(k))return [`deposit ${$} USDC margin on ${n} (${c}) and put it in its liquidity vault or a paired long/short of equal size, 1x`,3];
  if(/rwa/.test(k))return [`pass ${n}'s identity checks (1–3 days), then subscribe ${$} USDC to its tokenised asset on ${c}; hold it, do not lend it`,2];
  if(/staking|collateral|restak|bitcoin|btc/.test(k))return [`stake or delegate ${$} through ${n}'s own pool on ${c} and keep the receipt token in the same wallet`,2];
  if(/curator|allocator|yield|vault|farm|index/.test(k))return [`deposit ${$} USDC into ${n}'s largest stablecoin vault on ${c}; read its curator, fee and withdrawal-queue terms first`,2];
  if(/^chain$|payment/.test(k))return [`bridge ${$} USDC onto ${n} and keep it working in its largest native stablecoin pool, one payment or swap a week`,3];
  if(/basis|synthetic|stable/.test(k))return [`mint or buy ${$} of ${n}'s synthetic dollar on ${c} at par and stake it in ${n}'s own staking contract`,3];
  return [`deposit ${$} USDC into ${n}'s largest stablecoin vault on ${c} (curated / yield vaults: pick the one with the most TVL)`,2]}
function fmt$(v){const a=Math.abs(v),s=v<0?'-$':'$';return a>=1e9?s+(a/1e9).toFixed(2)+'B':a>=1e6?s+(a/1e6).toFixed(1)+'M':a>=1e4?s+(a/1e3).toFixed(1)+'K':a>=100?s+Math.round(a).toLocaleString('en-US'):s+a.toFixed(2)}
function farmPlan(r,o){
  o=Object.assign({},DEF,o||{});const d=o.deposit||minDeposit(r,o).deposit,{chain,gas}=cheapChain(r),eth=chain==='Ethereum',wk=o.weeks,N=wk*7;
  const bridge=eth?0:2+.0005*d,yieldLost=d*o.tbill*wk/52,[act,atx]=action(r,chain,d),exitPct=o.exitPct||12;
  const S=[];const add=(day,txt,tx,min,extra)=>S.push({day,txt,tx,cost:+(tx*gas+(extra||0)).toFixed(2),min});
  add('Day 0',`Verify: open ${r.name}'s official docs from its DefiLlama page and match every contract address on ${chain}; never sign an approval sent by DM, ad or reply`,0,15);
  add('Day 0',`Fund: move ${fmt$(d)} USDC to a fresh wallet on ${chain}${eth?'':' (one bridge in, '+fmt$(bridge/2)+')'}`,1,15,bridge/2);
  add('Day 0',`Enter: ${act}`,atx,15);
  add('Day 0',`Record: log date, amount, tx hashes and wallet in a sheet so any drop and the tax lot can be traced`,0,10);
  add('Day 1',`Risk: cap the position at ${fmt$(d)}; ${r.name} records no token on DefiLlama, so any drop is this model's estimate, not a promise; smart-contract and depeg risk stay with you`,0,5);
  add(`Weekly ×${wk}`,`Monitor: check the position and ${r.name}'s TVL (${fmt$(r.tvl_usd)} today); one claim or touch transaction a week`,wk,wk*5);
  add('Any day',`Exit rule: if ${r.name}'s TVL falls more than ${exitPct}% in one week (worse than 9 in 10 protocols this week), withdraw that day`,0,5);
  add(`Day ${N}`,`Exit: withdraw, ${eth?'send USDC back to the exchange':'bridge back ('+fmt$(bridge/2)+')'} and close the sheet with the final balance`,2,20,bridge/2);
  const gasT=sum(S.map(s=>s.tx))*gas,cost=gasT+bridge+yieldLost,drop=r.implied*o.share*d/(r.tvl_usd+d),net=drop-cost,min=sum(S.map(s=>s.min)),h=min/60,nh=net/h;
  const verdict=net>0&&nh>=o.hourly?'FARM':net>0?'MARGINAL':'SKIP';
  add('Budget',`All in: ${S.length} steps over ${N} days on ${fmt$(d)}: gas ${fmt$(gasT)} + bridge ${fmt$(bridge)} + forgone T-bill ${fmt$(yieldLost)} (${o.tbill*100}%, ${wk} wk) = ${fmt$(cost)}; modelled drop ${fmt$(drop)} (${Math.round(o.share*100)}% of ${fmt$(r.implied)} × your share of TVL); net ${fmt$(net)}, ${h.toFixed(1)} h, ${fmt$(nh)}/h → ${verdict}`,0,0);
  Object.assign(S[S.length-1],{cost:+cost.toFixed(2),min,b:1});
  return {deposit:d,chain,gas,bridge,yieldLost,gasT,cost,drop,net,hours:h,nethour:nh,days:N,verdict,steps:S};
}
function minDeposit(r,o){o=Object.assign({},DEF,o||{});let best=null;
  for(const d of o.ladder){const f=farmPlan(r,Object.assign({},o,{deposit:d}));if(f.net>0&&f.nethour>=o.hourly)return {deposit:d,why:'smallest that clears $'+o.hourly+'/h'};if(!best||f.nethour>best.nh)best={deposit:d,nh:f.nethour}}
  return {deposit:best.deposit,why:'best $/h on the ladder'}}
const stepText=s=>`${s.day} · ${s.txt}. Cost: ${fmt$(s.cost)} · Time: ${s.min} min`;

// ---------- board ----------
function checksum(rows){let h=0x811c9dc5;const s=rows.map(r=>r.slug+'|'+r.rank+'|'+r.implied_value_usd).join('\n');for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}
function run(snap,o){
  o=Object.assign({},DEF,o||{});const L=ledger(snap),VF=fitValue(L),OF=fitOdds(L),cal=calibrate(VF);
  o.exitPct=Math.round(-quant(L.P.filter(p=>p.change_7d!=null).map(p=>p.change_7d),.1));
  const rows=L.P.filter(p=>p.ranked).map(p=>Object.assign(p,impliedValue(p,VF,OF,cal)));
  rows.sort((a,b)=>b.implied-a.implied||(a.slug<b.slug?-1:1));rows.forEach((r,i)=>{r.rank=i+1;if(i&&r.implied>rows[i-1].implied)r.implied=rows[i-1].implied});
  const BS=bootstrap(L,VF,OF,rows,o.boot||200);rows.forEach((r,i)=>{r.rlo=Math.min(BS.rankLo[i],r.rank);r.rhi=Math.max(BS.rankHi[i],r.rank);r.bootRanks=BS.ranks[i];r.plan=farmPlan(r,o)});
  L.P.filter(p=>p.grp==='peer').forEach((p,i)=>{p.model=X(VF.predict(p));p.miss=X(VF.held.loo[i])});
  const board=rows.map(r=>({slug:r.slug,name:r.name,rank:r.rank,implied_value_usd:r.implied,tier:r.grp,launch_value_usd:Math.round(r.lv),launch_odds:+r.odds.toFixed(4),p25_usd:Math.round(r.p25),p75_usd:Math.round(r.p75),rank_range:[r.rlo,r.rhi],deposit_usd:r.plan.deposit,net_usd:+r.plan.net.toFixed(2),net_per_hour_usd:+r.plan.nethour.toFixed(2),verdict:r.plan.verdict,farm_steps:r.plan.steps.map(stepText)}));
  return {L,VF,OF,cal,BS,rows,board,opts:o,sum:checksum(board)};
}
// buildUp(): per-term log contributions against a stated reference protocol ($100M TVL, 1 chain, 0 years, flat week, no family)
const REF={size:Math.log(1e8),carry:Math.log(1e8),chains:0,age:0,growth:0};
function buildUp(F,p){const q=F.map?F.map(p):p,st=F.D.st,b=F.beta;let j=1,base=b[0];const parts=[];
  for(const t of F.terms){if(TERMS[t].cat){let c=0;for(const fm of F.fams||F.opt.fams){if(q.fam===fm)c=b[j];j++}parts.push({t,label:'family: '+q.fam,c})}else{const[m,sd]=st[t],x=TERMS[t].f(q);base+=b[j]*(REF[t]-m)/sd;parts.push({t,label:TERMS[t].label,x,c:b[j]*(x-REF[t])/sd,slope:b[j]/sd});j++}}
  return {base,parts}}
const api={buildUp,REF,prep,ledger,fitValue,fitOdds,heldOut,calibrate,impliedValue,bootstrap,farmPlan,minDeposit,stepText,checksum,run,quant,med,fmt$,TERMS,DEF,cheapChain};
if(typeof window!=='undefined')window.Radar=api;
if(typeof module!=='undefined')module.exports=api;
})();
