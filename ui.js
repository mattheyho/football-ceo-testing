/* FOOTBALL CEO — UI MODULE v0.21
   Stadium development and support-growth presentation. */
(function(){
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fmt(v){return typeof money==='function'?money(v):`£${Math.round(v||0).toLocaleString('en-GB')}`;}
  function pct(v){return `${Math.round((Number(v)||0)*100)}%`;}
  function stageLabel(status){return ({review:'Review commissioned',consulted:'Consultation complete','owner-negotiation':'Owner negotiation','board-approved':'Board approved',planning:'Planning pending','planning-approved':'Planning approved',financing:'Financing',ready:'Fully funded',deferred:'Parked by CEO',construction:'Under construction',completed:'Completed'}[status]||status||'No active project');}

  function historySVG(rows){
    rows=(rows||[]).filter(x=>x.stadium&&Number.isFinite(Number(x.stadium.averageAttendance)));
    if(!rows.length) return `<div class="notice muted">Historical attendance will appear after your first completed season.</div>`;
    const W=720,H=250,padL=46,padR=18,padT=20,padB=42;
    const max=Math.max(1,...rows.flatMap(r=>[r.stadium.capacity||0,r.stadium.averageAttendance||0,r.stadium.waitingList||0]))*1.08;
    const x=i=>padL+(rows.length===1?(W-padL-padR)/2:i*(W-padL-padR)/(rows.length-1));
    const y=v=>padT+(H-padT-padB)*(1-(Number(v)||0)/max);
    const poly=key=>rows.map((r,i)=>`${x(i)},${y(r.stadium[key]||0)}`).join(' ');
    const labels=rows.map((r,i)=>`<text x="${x(i)}" y="${H-18}" text-anchor="middle">${esc(String(r.season).slice(2))}</text>`).join('');
    const dots=(key,cls)=>rows.map((r,i)=>`<circle class="${cls}" cx="${x(i)}" cy="${y(r.stadium[key]||0)}" r="3"><title>${esc(r.season)} — ${key==='averageAttendance'?'Avg attendance':key==='waitingList'?'ST waiting list':'Capacity'}: ${Number(r.stadium[key]||0).toLocaleString('en-GB')}</title></circle>`).join('');
    return `<div class="stadium-chart-wrap"><svg class="stadium-history-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Season by season stadium support growth">
      <line class="chart-axis" x1="${padL}" y1="${H-padB}" x2="${W-padR}" y2="${H-padB}" />
      <line class="chart-axis" x1="${padL}" y1="${padT}" x2="${padL}" y2="${H-padB}" />
      <text x="8" y="${padT+5}">${Math.round(max).toLocaleString('en-GB')}</text><text x="24" y="${H-padB+4}">0</text>
      <polyline class="chart-line capacity" points="${poly('capacity')}"/><polyline class="chart-line attendance" points="${poly('averageAttendance')}"/><polyline class="chart-line waiting" points="${poly('waitingList')}"/>
      ${dots('capacity','chart-dot capacity')}${dots('averageAttendance','chart-dot attendance')}${dots('waitingList','chart-dot waiting')}${labels}
    </svg></div>
    <div class="stadium-chart-legend"><span><i class="capacity"></i>Capacity</span><span><i class="attendance"></i>Average attendance</span><span><i class="waiting"></i>ST waiting list</span></div>`;
  }

  function selectedOption(project){return project?.options?.find(o=>o.id===project.selectedOptionId)||null;}

  function consultationBlock(p){
    if(!p.consultation) return `<div class="stadium-action-card"><h3>Supporter consultation</h3><p class="muted small">Ask supporters about expansion, redevelopment and moving ground. The result informs you; it does not bind the CEO.</p><button class="btn primary" id="stadiumConsultBtn">Hold fan consultation</button></div>`;
    return `<div class="stadium-action-card"><div class="sectiontitle"><h3>Supporter consultation</h3><span class="pill">Completed ${esc(p.consultation.date)}</span></div>
      <div class="consult-results">${p.options.map(o=>{const support=p.consultation.results[o.id]||0;return `<div class="consult-option"><div><b>${esc(o.label)}</b><div class="muted small">${o.capacity.toLocaleString('en-GB')} seats • ${fmt(o.cost)}</div></div><div class="consult-score ${support>=65?'good':support<45?'bad':''}">${support}%</div><div class="progress"><span style="width:${support}%"></span></div>${!p.selectedOptionId?`<button class="btn secondary stadium-select-option" data-option="${esc(o.id)}">Select plan</button>`:''}</div>`}).join('')}</div>
    </div>`;
  }

  function projectBlock(p){
    if(!p) return `<div class="stadium-action-card"><h3>No active development plan</h3><p class="muted small">Commission a review when you want the board to assess capacity, supporter demand and viable stadium options. A high pressure score is evidence that the club may be constrained.</p><button class="btn primary" id="commissionStadiumReviewBtn">Commission stadium review</button></div>`;
    const opt=selectedOption(p);
    const terms=p.ownerAgreement;
    const support=opt&&p.consultation?.results?.[opt.id];
    let actions='';
    if(p.status==='review') actions=consultationBlock(p);
    else if(p.status==='consulted'&&!p.selectedOptionId) actions=consultationBlock(p);
    else if(p.status==='owner-negotiation'&&opt){
      actions=`<div class="stadium-action-card"><h3>Agree the project with ownership</h3><p><b>${esc(opt.label)}</b> • ${opt.capacity.toLocaleString('en-GB')} seats • ${fmt(opt.cost)}</p><div class="grid3"><div class="metric"><div class="k">Owner funding</div><div class="v">${fmt(terms.ownerContribution)}</div></div><div class="metric"><div class="k">Max borrowing</div><div class="v">${fmt(terms.maxDebt)}</div></div><div class="metric"><div class="k">Club cash required</div><div class="v">${fmt(terms.clubContribution)}</div></div></div><div class="notice small muted" style="margin-top:10px">Supporter backing: <b>${support??'—'}%</b>. You can proceed even if fans oppose the move.</div><button class="btn primary" id="agreeStadiumPlanBtn">Agree plan with owners</button><button class="btn secondary" id="stadiumBackToOptionsBtn">Choose another option</button></div>`;
    }else if(['board-approved'].includes(p.status)){
      actions=`<div class="stadium-action-card"><h3>Board-approved masterplan</h3><p class="muted small">The size and funding envelope are agreed. You can submit planning now or park the plan and return to it later.</p><button class="btn primary" id="submitStadiumPlanningBtn">Submit planning application</button><button class="btn secondary" id="deferStadiumBtn">Park plan</button></div>`;
    }else if(p.status==='planning'){
      actions=`<div class="stadium-action-card"><h3>Planning application pending</h3><p>Decision expected by <b>${esc(p.planning?.decisionDate)}</b>.</p><p class="muted small">The calendar will process the planning decision automatically. You may park the capital decision while planning continues.</p><button class="btn secondary" id="deferStadiumBtn">Park capital decision</button></div>`;
    }else if(p.status==='planning-approved'||(p.status==='deferred'&&p.planning?.status==='approved'&&!p.financing?.acceptedOfferId)){
      actions=`<div class="stadium-action-card"><h3>${p.status==='deferred'?'Parked plan — planning secured':'Planning approved'}</h3><p>Permission valid until <b>${esc(p.planning?.expires||'—')}</b>. Arrange financing when you are ready to commit.</p><button class="btn primary" id="stadiumFinanceBtn">Arrange financing</button>${p.status!=='deferred'?'<button class="btn secondary" id="deferStadiumBtn">Park plan</button>':''}</div>`;
    }else if(p.status==='deferred'){
      const pending=p.planning?.status==='pending';
      actions=`<div class="stadium-action-card"><h3>Project parked</h3><p class="muted small">The plan is saved. ${pending?`Planning remains pending with a decision due ${esc(p.planning.decisionDate)}.`:'Resume whenever club finances and your football priorities allow.'}</p>${!p.planning?'<button class="btn primary" id="submitStadiumPlanningBtn">Resume & submit planning</button>':''}${p.financing?.acceptedOfferId?'<button class="btn primary" id="startStadiumBtn">Start construction</button>':''}</div>`;
    }else if(p.status==='financing'){
      actions=`<div class="stadium-action-card"><h3>Infrastructure financing offers</h3><div class="loan-offers">${(p.financing.offers||[]).map(o=>`<div class="loan-card"><div><b>${Math.round(o.termMonths/12)} years</b><div class="muted small">${(o.annualRate*100).toFixed(2)}% fixed • ${fmt(o.principal)} borrowed</div></div><div><b>${fmt(typeof amortisingMonthlyPayment==='function'?amortisingMonthlyPayment(o.principal,o.annualRate,o.termMonths):0)}/mo</b></div><button class="btn secondary stadium-loan-select" data-loan="${o.id}">Accept</button></div>`).join('')}</div></div>`;
    }else if(p.status==='ready'||(p.status==='deferred'&&p.financing?.acceptedOfferId)){
      actions=`<div class="stadium-action-card"><h3>Fully funded — CEO decision</h3><p class="muted small">Financing is agreed. Starting construction commits the club's cash contribution and begins the build. You can still prioritise the playing squad and leave this ready for later.</p><button class="btn primary" id="startStadiumBtn">Start construction</button><button class="btn secondary" id="deferStadiumBtn">Park project</button></div>`;
    }else if(p.status==='construction'){
      const pr=Math.round((p.construction?.progress||0)*100);
      actions=`<div class="stadium-action-card"><div class="sectiontitle"><h3>Construction underway</h3><span class="pill">${pr}%</span></div><div class="progress stadium-build-progress"><span style="width:${pr}%"></span></div><p class="muted small">Started ${esc(p.construction.start)} • Scheduled completion ${esc(p.construction.completionDate)}${opt?.type==='expand'?` • Temporary operating capacity ${currentOperationalCapacity().toLocaleString('en-GB')}`:''}</p></div>`;
    }else if(p.status==='completed'){
      actions=`<div class="stadium-action-card"><h3>Development completed</h3><p class="good"><b>${esc(currentStadiumName())}</b> now has ${currentStadiumCapacity().toLocaleString('en-GB')} seats.</p><p class="muted small">The completed season will retain this milestone in the club's stadium history.</p></div>`;
    }

    const summary=opt?`<div class="stadium-plan-summary"><div><span>Preferred plan</span><b>${esc(opt.label)}</b></div><div><span>Capacity</span><b>${opt.capacity.toLocaleString('en-GB')}</b></div><div><span>Estimate</span><b>${fmt(opt.cost)}</b></div><div><span>Fan support</span><b class="${support>=65?'good':support<45?'bad':''}">${support!=null?support+'%':'—'}</b></div></div>`:'';
    return `<div class="panel pad stadium-project-panel"><div class="sectiontitle"><div><div class="eyebrow">CAPITAL PROJECT</div><h2>Stadium development</h2></div><span class="pill">${esc(stageLabel(p.status))}</span></div>${summary}${p.status==='review'||p.status==='consulted'?consultationBlock(p):actions}</div>`;
  }

  window.renderStadium=function(){
    const root=document.getElementById('stadiumContent');if(!root||!state)return;
    ensureDynamicStadiumState();ensureTicketingState();ensureClubFinanceState();
    const s=state.stadium,st=state.seasonTickets,pressure=calculateCapacityPressure(),label=capacityPressureLabel(pressure);
    const avg=state.matchdayStats?.homeGames?Math.round(state.matchdayStats.attendance/state.matchdayStats.homeGames):0;
    const history=state.careerHistory?.seasons||[];
    const debts=(state.clubFinances?.debts||[]).filter(d=>d.status==='active');
    root.innerHTML=`
      <div class="stadium-hero panel pad"><div><div class="eyebrow">CLUB INFRASTRUCTURE</div><h2>${esc(s.name)}</h2><div class="muted small">Permanent stadium and supporter-demand management.</div></div><div class="stadium-capacity-big"><span>Capacity</span><b>${s.capacity.toLocaleString('en-GB')}</b>${s.operationalCapacity!==s.capacity?`<small>Operational ${s.operationalCapacity.toLocaleString('en-GB')}</small>`:''}</div></div>
      <div class="stadium-metrics-grid">
        <div class="metric"><div class="k">Avg attendance</div><div class="v">${avg?avg.toLocaleString('en-GB'):'—'}</div></div>
        <div class="metric"><div class="k">Season tickets</div><div class="v">${st.sold.toLocaleString('en-GB')} / ${st.allocation.toLocaleString('en-GB')}</div></div>
        <div class="metric"><div class="k">ST waiting list</div><div class="v">${st.waitingList.toLocaleString('en-GB')}</div></div>
        <div class="metric"><div class="k">Supporter demand</div><div class="v">${Math.round(state.supporters.demand).toLocaleString('en-GB')}</div></div>
        <div class="metric"><div class="k">Capacity pressure</div><div class="v ${pressure>=85?'bad':pressure>=68?'warn':''}">${pressure}/100</div><div class="muted small">${label}</div></div>
        <div class="metric"><div class="k">Club cash</div><div class="v">${fmt(clubCash())}</div><div class="muted small">Debt ${fmt(totalClubDebt())}</div></div>
      </div>
      ${projectBlock(s.project)}
      <div class="panel pad stadium-history-panel"><div class="sectiontitle"><div><h2>Support growth</h2><div class="muted small">Saved permanently at the end of every season.</div></div><span class="pill">${history.filter(x=>x.stadium).length} seasons</span></div>${historySVG(history)}</div>
      <div class="panel pad"><div class="sectiontitle"><h2>Infrastructure debt</h2><span class="pill">${debts.length} active</span></div>${debts.length?debts.map(d=>`<div class="stadium-debt-row"><div><b>${esc(d.label)}</b><div class="muted small">${(d.annualRate*100).toFixed(2)}% • ${d.termMonths-d.monthsPaid} months remaining</div></div><div><b>${fmt(d.outstanding)}</b><div class="muted small">${fmt(d.monthlyPayment)}/month</div></div></div>`).join(''):'<div class="notice muted">No active infrastructure debt.</div>'}</div>
      ${stadiumDevMode()?`<div class="panel pad stadium-test-lab"><div class="sectiontitle"><div><div class="eyebrow">TEST MODE</div><h2>Stadium Test Lab</h2></div><span class="pill">?dev=stadium</span></div><p class="muted small">Synthetic scenarios overwrite stadium/support state in this career for rapid QA. Use a disposable test save.</p><div class="test-lab-buttons"><button class="btn primary" id="stadiumSelfTestBtn">Run automated checks</button><button class="btn secondary stadium-test" data-scenario="bournemouth-pressure">Bournemouth pressure</button><button class="btn secondary stadium-test" data-scenario="villa-opposition">Villa opposition</button><button class="btn secondary stadium-test" data-scenario="construction">50% construction</button><button class="btn secondary stadium-test" data-scenario="completion">Completes tomorrow</button><button class="btn secondary stadium-test" data-scenario="history-15">15-year history</button></div><pre class="stadium-state-inspector">${esc(JSON.stringify({cash:clubCash(),transferBudget:state.budget,capacity:s.capacity,operationalCapacity:s.operationalCapacity,seasonTickets:st.sold,waitingList:st.waitingList,supporterDemand:state.supporters.demand,capacityPressure:pressure,projectStatus:s.project?.status||null,debt:totalClubDebt()},null,2))}</pre></div>`:''}`;

    document.getElementById('commissionStadiumReviewBtn')?.addEventListener('click',()=>{commissionStadiumReview();saveGame(false);renderStadium();});
    document.getElementById('stadiumConsultBtn')?.addEventListener('click',()=>{holdStadiumFanConsultation();saveGame(false);renderStadium();});
    root.querySelectorAll('.stadium-select-option').forEach(b=>b.addEventListener('click',()=>{selectStadiumOption(b.dataset.option);saveGame(false);renderStadium();}));
    document.getElementById('stadiumBackToOptionsBtn')?.addEventListener('click',()=>{const p=state.stadium.project;p.selectedOptionId=null;p.ownerAgreement=null;p.status='consulted';saveGame(false);renderStadium();});
    document.getElementById('agreeStadiumPlanBtn')?.addEventListener('click',()=>{agreeStadiumPlanWithOwners();saveGame(false);renderAll();renderStadium();});
    document.getElementById('submitStadiumPlanningBtn')?.addEventListener('click',()=>{submitStadiumPlanning();saveGame(false);renderStadium();});
    document.getElementById('deferStadiumBtn')?.addEventListener('click',()=>{deferStadiumProject();saveGame(false);renderStadium();});
    document.getElementById('stadiumFinanceBtn')?.addEventListener('click',()=>{generateStadiumLoanOffers();saveGame(false);renderStadium();});
    root.querySelectorAll('.stadium-loan-select').forEach(b=>b.addEventListener('click',()=>{acceptStadiumLoanOffer(b.dataset.loan);saveGame(false);renderAll();renderStadium();}));
    document.getElementById('startStadiumBtn')?.addEventListener('click',()=>{startStadiumConstruction();saveGame(false);renderAll();renderStadium();});
    document.getElementById('stadiumSelfTestBtn')?.addEventListener('click',()=>{
      const report=runStadiumSelfTest();
      renderStadium();
      const lab=document.querySelector('.stadium-test-lab');
      if(lab){const box=document.createElement('div');box.className=`notice ${report.passed?'good':'bad'}`;box.innerHTML=`<b>${report.passed?'AUTOMATED CHECKS PASSED':'AUTOMATED CHECKS FAILED'}</b><div class="small" style="margin-top:6px">${report.checks.map(c=>`${c.ok?'✓':'✕'} ${esc(c.name)}${c.detail?` — ${esc(c.detail)}`:''}`).join('<br>')}</div>`;lab.appendChild(box);}
    });
    root.querySelectorAll('.stadium-test').forEach(b=>b.addEventListener('click',()=>loadStadiumTestScenario(b.dataset.scenario)));
  };
})();
