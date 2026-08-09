/* Football CEO — Transfers & Contracts module
   Extracted from game.js without intended gameplay changes.

   Owns:
   - contract renewals
   - wage demands / acceptance
   - transfer & loan listing
   - manager squad-management requests
   - transfer-related stakeholder hooks

   This file is loaded before game.js, so these functions are available globally.
*/

function ensureContractState(){
  if(!state.playerContracts) state.playerContracts={};
  if(!state.playerListStatus) state.playerListStatus={};
  if(!state.managerRequests) state.managerRequests=[];
  squad(state.club).forEach(p=>{
    if(!state.playerContracts[p.id]){
      state.playerContracts[p.id]={
        wage:p.wage||0,
        endYear:p.contract||2026
      };
    }
    if(!state.playerListStatus[p.id]) state.playerListStatus[p.id]="None";
  });
}

function playerContractDemand(p){
  ensureContractState();

  const current=state.playerContracts[p.id] || {wage:p.wage||0,endYear:p.contract||2026};
  const currentWage=Math.max(1000,current.wage||p.wage||1000);
  const morale=state.playerMorale?.[p.id]||"Content";
  const stats=state.playerStats?.[p.id]||{appearances:0,goals:0};

  // 1) Rating / status premium.
  // Low-rated squad players generally ask for modest rises;
  // elite players can command significantly more.
  let ratingFactor=1;
  if(p.overall>=88) ratingFactor=1.20;
  else if(p.overall>=85) ratingFactor=1.15;
  else if(p.overall>=82) ratingFactor=1.11;
  else if(p.overall>=79) ratingFactor=1.08;
  else if(p.overall>=76) ratingFactor=1.06;
  else if(p.overall>=73) ratingFactor=1.04;
  else ratingFactor=1.02;

  // 2) Morale.
  // Happy players are easier to renew; unhappy players demand a premium.
  let moraleFactor=1;
  if(morale==="Happy") moraleFactor=0.96;
  else if(morale==="Content") moraleFactor=1.00;
  else if(morale==="Unhappy") moraleFactor=1.10;
  else if(morale==="Wants to leave") moraleFactor=1.22;

  // 3) Individual season performance.
  // At GW0 this is neutral. Once games are played, regular starters and
  // productive attackers earn stronger negotiating leverage.
  let performanceFactor=1;
  if(state.week>0){
    const appearanceRate=stats.appearances/Math.max(1,state.week);
    const goalRate=stats.goals/Math.max(1,stats.appearances);

    if(appearanceRate>=0.85) performanceFactor+=0.04;
    else if(appearanceRate<=0.35) performanceFactor-=0.03;

    const pos=String(p.positions||"");
    const attacking=pos.includes("ST")||pos.includes("CF")||pos.includes("LW")||pos.includes("RW")||
                    pos.includes("CAM")||pos.includes("LM")||pos.includes("RM");

    if(attacking){
      if(goalRate>=0.60) performanceFactor+=0.10;
      else if(goalRate>=0.35) performanceFactor+=0.06;
      else if(goalRate>=0.18) performanceFactor+=0.03;
      else if(stats.appearances>=8 && goalRate<0.08) performanceFactor-=0.03;
    }else{
      // Non-attackers gain leverage mainly from being regular starters.
      if(appearanceRate>=0.90 && stats.appearances>=6) performanceFactor+=0.03;
    }
  }

  // 4) Contract leverage.
  // Players close to expiry know the club has less control.
  const yearsLeft=Math.max(0,(current.endYear||2026)-2025);
  let contractFactor=1;
  if(yearsLeft<=1) contractFactor=1.05;
  else if(yearsLeft>=4) contractFactor=0.98;

  let demand=currentWage*ratingFactor*moraleFactor*performanceFactor*contractFactor;

  // Nobody asks for a pay cut in a normal renewal unless they are already
  // substantially overpaid relative to their level.
  const floor=currentWage*(p.overall<=72 ? 0.98 : 1.01);
  demand=Math.max(floor,demand);

  // Round naturally by salary band rather than forcing everyone to the same step.
  let step=1000;
  if(demand>=100000) step=5000;
  else if(demand>=50000) step=2500;

  return Math.round(demand/step)*step;
}

function playerContractDemandBreakdown(p){
  ensureContractState();
  const current=state.playerContracts[p.id] || {wage:p.wage||0,endYear:p.contract||2026};
  const stats=state.playerStats?.[p.id]||{appearances:0,goals:0};
  const morale=state.playerMorale?.[p.id]||"Content";
  const demand=playerContractDemand(p);

  const reasons=[];
  reasons.push(`Current wage ${money(current.wage||p.wage||0)}/wk`);
  reasons.push(`${p.overall} OVR`);
  reasons.push(`${morale.toLowerCase()} morale`);

  if(state.week>0){
    reasons.push(`${stats.appearances} apps`);
    if(stats.goals>0) reasons.push(`${stats.goals} goals`);
  }

  return {demand,reasons};
}

function contractAcceptanceChance(p,offerWage,years){
  const demand=playerContractDemand(p);
  let chance=0.40 + (offerWage/demand-1)*1.4;
  if(years>=4 && p.age<=28) chance+=0.08;
  if(years>=4 && p.age>=31) chance-=0.06;
  const morale=state.playerMorale?.[p.id]||"Content";
  if(morale==="Happy") chance+=0.08;
  if(morale==="Unhappy") chance-=0.10;
  if(morale==="Wants to leave") chance-=0.20;
  return clamp(chance,0.05,0.95);
}

function setPlayerListStatus(id,status,source="CEO"){
  ensureContractState();
  state.playerListStatus[id]=status;
  const p=DB.players.find(x=>String(x.id)===String(id));
  if(!p) return;
  if(status==="Transfer"){
    state.playerMorale[id]=state.playerMorale[id]==="Happy"?"Content":state.playerMorale[id];
    addNews(`${p.name} has been added to the transfer list${source==="Manager"?" at the manager's request":""}.`);
  }else if(status==="Loan"){
    addNews(`${p.name} has been added to the loan list${source==="Manager"?" at the manager's request":""}.`);
  }else{
    addNews(`${p.name} has been removed from all outgoing lists.`);
  }
}

function maybeGenerateManagerSquadRequest(){
  ensureContractState();
  if(!state.staff?.manager || state.week<1) return;
  if(Math.random()>0.22) return;
  if(state.managerRequests.some(r=>!r.resolved)) return;

  const sq=squad(state.club);
  const manager=state.staff.manager;
  const options=[];

  // Renewal candidates: key players with <=1 year left.
  sq.forEach(p=>{
    const c=state.playerContracts[p.id];
    if(c && c.endYear<=2026 && p.overall>=78){
      options.push({type:"renew",playerId:p.id,priority:3});
    }
  });

  // Transfer-list candidates: older/low-rated fringe players.
  sq.forEach(p=>{
    if(p.age>=29 && p.overall<=74){
      options.push({type:"transfer",playerId:p.id,priority:2});
    }
  });

  // Loan-list candidates: young players below first-team standard.
  sq.forEach(p=>{
    if(p.age<=21 && p.overall<=72){
      options.push({type:"loan",playerId:p.id,priority:2});
    }
  });

  if(!options.length) return;
  const weighted=[];
  options.forEach(o=>{for(let i=0;i<o.priority;i++) weighted.push(o)});
  const pick=weighted[Math.floor(Math.random()*weighted.length)];
  const p=DB.players.find(x=>x.id===pick.playerId);
  const id="mr"+Date.now()+Math.floor(Math.random()*1000);
  const req={id,type:pick.type,playerId:p.id,resolved:false,manager:manager.name};
  state.managerRequests.push(req);

  const wording = pick.type==="renew"
    ? `${manager.name} wants the club to open contract talks with ${p.name}.`
    : pick.type==="transfer"
      ? `${manager.name} recommends placing ${p.name} on the transfer list.`
      : `${manager.name} recommends making ${p.name} available for loan.`;

  state.news.unshift({week:state.week,text:wording,requestId:id});
}

function resolveManagerRequest(id,accepted){
  ensureContractState();
  const req=state.managerRequests.find(r=>r.id===id);
  if(!req || req.resolved) return;
  req.resolved=true;
  const p=DB.players.find(x=>x.id===req.playerId);

  if(accepted){
    state.managerBacking=clamp((state.managerBacking||70)+3,0,100);
    if(req.type==="transfer") setPlayerListStatus(p.id,"Transfer","Manager");
    else if(req.type==="loan") setPlayerListStatus(p.id,"Loan","Manager");
    else{
      addNews(`You agreed with ${req.manager} to begin contract talks with ${p.name}.`);
      openPlayerProfile(p.id);
      q("contractNegotiation")?.classList.remove("hide");
    }
  }else{
    state.managerBacking=clamp((state.managerBacking||70)-3,0,100);
    addNews(`You rejected ${req.manager}'s recommendation regarding ${p.name}.`);
  }

  saveGame(false);
  renderInbox();
  renderDashboard();
}

function recordStarSale(player,fee,fairValue,yearsAtClub=1){
  if(!state.transferSentiment) state.transferSentiment={fans:[],owners:[],players:[],manager:[]};
  const topRatings=squad(state.club).map(p=>p.overall).sort((a,b)=>b-a).slice(0,5);
  const isStar=topRatings.includes(player.overall);
  if(!isStar) return;
  let fanHit=-3;
  if(yearsAtClub>=4) fanHit-=2;
  if(fee < fairValue*0.9) fanHit-=3;
  else if(fee >= fairValue*1.15) fanHit+=2;
  state.transferSentiment.fans.push({label:`Sale of star player ${player.name}`,value:fanHit});
}

function recordMarqueeSigning(player){
  if(!state.transferSentiment) state.transferSentiment={fans:[],owners:[],players:[],manager:[]};
  state.transferSentiment.fans.push({label:`Marquee signing: ${player.name}`,value:5});
}

function recordManagerTransferChoice(backedManager){
  if(!state.transferSentiment) state.transferSentiment={fans:[],owners:[],players:[],manager:[]};
  state.managerBacking=clamp((state.managerBacking??70)+(backedManager?8:-6),0,100);
  state.transferSentiment.manager.push({label:backedManager?"Backed manager's transfer target":"Rejected manager's preferred target",value:backedManager?4:-4});
}

function beginContractNegotiation(id){
  ensureContractState();
  const p=DB.players.find(x=>String(x.id)===String(id));
  if(!p) return;
  const current=state.playerContracts[p.id];
  const breakdown=playerContractDemandBreakdown(p);
  const demand=breakdown.demand;
  q("contractWageInput").value=Math.max(current.wage,demand);
  q("contractYearsInput").value="3";
  q("contractDemandText").textContent=`Agent expectation: around ${money(demand)}/wk • Based on ${breakdown.reasons.join(" • ")}.`;
  q("contractNegotiation").dataset.playerId=p.id;
  q("contractNegotiation").classList.remove("hide");
}

function submitContractOffer(){
  const id=q("contractNegotiation")?.dataset.playerId;
  const p=DB.players.find(x=>String(x.id)===String(id));
  if(!p) return;
  const wage=Number(q("contractWageInput").value||0);
  const years=Number(q("contractYearsInput").value||1);
  const chance=contractAcceptanceChance(p,wage,years);

  if(Math.random()<chance){
    state.playerContracts[p.id]={
      wage,
      endYear:2025+years
    };
    state.playerMorale[p.id]=state.playerMorale[p.id]==="Wants to leave"?"Unhappy":"Happy";
    addNews(`${p.name} has signed a new ${years}-year contract worth ${money(wage)}/week.`);
    q("contractNegotiation").classList.add("hide");
    saveGame(false);
    openPlayerProfile(p.id);
    renderSquad();
    renderFinances();
  }else{
    addNews(`${p.name}'s representatives rejected your contract offer.`);
    const revised=playerContractDemandBreakdown(p);
    q("contractDemandText").textContent=`Offer rejected. The player is looking for something closer to ${money(revised.demand)}/week • ${revised.reasons.join(" • ")}.`;
  }
}

function toggleTransferList(id){
  ensureContractState();
  const current=state.playerListStatus[id]||"None";
  setPlayerListStatus(id,current==="Transfer"?"None":"Transfer");
  saveGame(false);
  openPlayerProfile(id);
  renderSquad();
}

function toggleLoanList(id){
  ensureContractState();
  const current=state.playerListStatus[id]||"None";
  setPlayerListStatus(id,current==="Loan"?"None":"Loan");
  saveGame(false);
  openPlayerProfile(id);
  renderSquad();
}

