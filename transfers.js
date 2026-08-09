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
  ensureTransferMarketState();
  if(!state.playerContracts) state.playerContracts={};
  if(!state.playerListStatus) state.playerListStatus={};
  if(!state.managerRequests) state.managerRequests=[];
  if(!state.managerRequestCooldowns) state.managerRequestCooldowns={};
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


function primaryRecruitmentGroup(p){
  const tokens=playerPositionTokens(p);
  return Object.keys(TRANSFER_POSITION_GROUPS).find(group=>
    (TRANSFER_POSITION_GROUPS[group]||[]).some(pos=>tokens.includes(pos))
  ) || null;
}

function registerManagerSquadVacancy(p,oldClub){
  if(oldClub!==state.club || !p) return;
  ensureTransferMarketState();

  // Losing a regular/high-quality first-team player should force the manager
  // to reassess that exact role, even if generic depth scoring is borderline.
  const group=primaryRecruitmentGroup(p);
  if(!group) return;

  const clubRep=byClub(state.club)?.reputation||72;
  const firstTeamThreshold=clamp(Math.round(65+(clubRep-65)*0.42),70,84);
  if((p.overall||0)<firstTeamThreshold) return;

  const existing=state.managerSquadVacancies.find(v=>v.position===group && !v.filled);
  if(existing){
    existing.priority=Math.max(existing.priority||0,p.overall||0);
    existing.week=state.week;
  }else{
    state.managerSquadVacancies.push({
      position:group,
      soldPlayerId:p.id,
      soldPlayerName:p.name,
      soldOverall:p.overall||0,
      week:state.week,
      filled:false,
      priority:p.overall||0
    });
  }
}


function realisticManagerTargetPool(position,limit=18){
  const club=state.club;
  const userRep=byClub(club)?.reputation||70;
  const current=clubSquadPlayers(club).filter(p=>playsPositionGroup(p,position)).sort((a,b)=>b.overall-a.overall);
  const starter=current[0]?.overall||65;

  return DB.players
    .filter(p=>p.club!==club && p.club!=="Free Agent" && playsPositionGroup(p,position))
    .map(p=>{
      const sellingRep=byClub(p.club)?.reputation||68;
      const asking=estimatedAskingPrice(p,club);
      const interest=playerInterestScore(p,club);
      const eliteBlock=p.overall>=88 && sellingRep-userRep>=4 && userRep<90;
      const prestigeBlock=sellingRep-userRep>=8 && interest<58;
      const budgetBlock=asking>Math.max((state.budget||0)*1.35,25_000_000);
      return {player:p,asking,interest,starter,attainable:!eliteBlock&&!prestigeBlock&&!budgetBlock};
    })
    .filter(x=>x.attainable)
    .sort((a,b)=>((b.player.overall*.55)+(b.interest*.25)-(b.asking/1e6*.10))-((a.player.overall*.55)+(a.interest*.25)-(a.asking/1e6*.10)))
    .slice(0,limit);
}

function buildManagerShortlist(position){
  const pool=realisticManagerTargetPool(position,24);
  if(!pool.length) return [];
  const starter=clubSquadPlayers(state.club).filter(p=>playsPositionGroup(p,position)).sort((a,b)=>b.overall-a.overall)[0]?.overall||68;

  const ideal=pool.filter(x=>x.player.overall>=starter-1)
    .sort((a,b)=>((b.player.overall*.65)+(b.interest*.20)-(b.asking/1e6*.05))-((a.player.overall*.65)+(a.interest*.20)-(a.asking/1e6*.05)))[0] || pool[0];

  const cheaper=pool.filter(x=>x.player.id!==ideal.player.id && x.asking<=ideal.asking*.72 && x.player.overall>=Math.max(starter-4,72))
    .sort((a,b)=>((b.player.overall*2)-(b.asking/1e6))-((a.player.overall*2)-(a.asking/1e6)))[0]
    || pool.find(x=>x.player.id!==ideal.player.id);

  const used=new Set([ideal?.player.id,cheaper?.player.id].filter(Boolean));
  const prospect=pool.filter(x=>!used.has(x.player.id) && x.player.age<=22 && (x.player.potential||x.player.overall)>=starter+1)
    .sort((a,b)=>((b.player.potential||b.player.overall)+(b.interest*.08)-(b.asking/1e6*.03))-((a.player.potential||a.player.overall)+(a.interest*.08)-(a.asking/1e6*.03)))[0]
    || pool.find(x=>!used.has(x.player.id) && x.player.age<=24)
    || pool.find(x=>!used.has(x.player.id));

  const out=[];
  if(ideal) out.push({...ideal,role:"Ideal target"});
  if(cheaper&&!out.some(x=>x.player.id===cheaper.player.id)) out.push({...cheaper,role:"Cheaper alternative"});
  if(prospect&&!out.some(x=>x.player.id===prospect.player.id)) out.push({...prospect,role:"Young prospect"});
  return out.slice(0,3);
}

function managerShortlistForRequest(req){
  return (req.shortlist||[]).map(x=>{
    const p=DB.players.find(pl=>String(pl.id)===String(x.playerId));
    return p?{...x,player:p}:null;
  }).filter(Boolean);
}

function maybeGenerateManagerSquadRequest(){
  ensureContractState();
  if(!state.staff?.manager) return;

  const manager=state.staff.manager;
  const sq=squad(state.club);
  const options=[];
  const needs=evaluateSquadNeeds(state.club);

  // A recent sale of a first-team player creates an explicit vacancy.
  // This prevents a Watkins/Maatsen-type sale being missed by generic depth scoring.
  (state.managerSquadVacancies||[]).filter(v=>!v.filled).forEach(v=>{
    const shortlist=buildManagerShortlist(v.position);
    if(shortlist.length){
      options.push({
        type:"sign",position:v.position,playerId:shortlist[0].player.id,priority:12,
        alternatives:shortlist.slice(1).map(x=>x.player.id),
        shortlist:shortlist.map(x=>({playerId:x.player.id,role:x.role,asking:x.asking,interest:x.interest})),
        urgency:"critical",vacancy:true
      });
    }
  });

  // Weekly review: major holes generate reliable recruitment requests.
  needs.forEach(need=>{
    if(need.score>=72){
      const shortlist=buildManagerShortlist(need.position);
      if(shortlist.length){
        options.push({
          type:"sign",position:need.position,playerId:shortlist[0].player.id,priority:10,
          alternatives:shortlist.slice(1).map(x=>x.player.id),
          shortlist:shortlist.map(x=>({playerId:x.player.id,role:x.role,asking:x.asking,interest:x.interest})),
          urgency:"critical"
        });
      }
    }else if(need.score>=56){
      const shortlist=buildManagerShortlist(need.position);
      if(shortlist.length){
        options.push({
          type:"sign",position:need.position,playerId:shortlist[0].player.id,priority:5,
          alternatives:shortlist.slice(1).map(x=>x.player.id),
          shortlist:shortlist.map(x=>({playerId:x.player.id,role:x.role,asking:x.asking,interest:x.interest})),
          urgency:"important"
        });
      }
    }
  });

  sq.forEach(p=>{
    const c=state.playerContracts[p.id];
    if(c && c.endYear<=currentContractSeasonEndYear() && p.overall>=78) options.push({type:"renew",playerId:p.id,priority:3});
    if(p.age>=29 && p.overall<=74) options.push({type:"transfer",playerId:p.id,priority:2});
    if(p.age<=21 && p.overall<=72) options.push({type:"loan",playerId:p.id,priority:2});
  });

  if(!options.length) return;

  // Never create a duplicate open request for the same action/position.
  const openRequests=state.managerRequests.filter(r=>!r.resolved);
  const available=options.filter(o=>!openRequests.some(r=>
    o.type==="sign"
      ? (r.type==="sign" && r.position===o.position)
      : (r.type===o.type && String(r.playerId)===String(o.playerId))
  ));
  if(!available.length) return;

  const critical=available.filter(o=>o.type==="sign" && o.urgency==="critical");
  const importantSignings=available.filter(o=>o.type==="sign" && o.urgency==="important");
  let pick;
  if(critical.length){
    pick=critical.sort((a,b)=>{
      const na=needs.find(n=>n.position===a.position)?.score||0;
      const nb=needs.find(n=>n.position===b.position)?.score||0;
      return nb-na;
    })[0];
  }else if(importantSignings.length){
    // Genuine squad weaknesses take precedence over admin requests.
    pick=importantSignings.sort((a,b)=>{
      const na=needs.find(n=>n.position===a.position)?.score||0;
      const nb=needs.find(n=>n.position===b.position)?.score||0;
      return nb-na;
    })[0];
  }else{
    const weighted=[];
    available.forEach(o=>{for(let i=0;i<o.priority;i++) weighted.push(o)});
    pick=weighted[Math.floor(Math.random()*weighted.length)];
  }

  const p=DB.players.find(x=>String(x.id)===String(pick.playerId));
  if(!p) return;

  if(!state.managerRequestCooldowns) state.managerRequestCooldowns={};
  const cooldownKey=pick.type==="sign" ? `sign-${pick.position}` : `${pick.type}-${p.id}`;
  const lastWeek=state.managerRequestCooldowns[cooldownKey];
  if(lastWeek!=null && state.week-lastWeek<2) return;
  state.managerRequestCooldowns[cooldownKey]=state.week;

  const id="mr"+Date.now()+Math.floor(Math.random()*1000);
  const req={
    id,type:pick.type,playerId:p.id,position:pick.position||null,
    alternatives:pick.alternatives||[],shortlist:pick.shortlist||[],urgency:pick.urgency||null,
    resolved:false,manager:manager.name
  };
  state.managerRequests.push(req);

  const wording = pick.type==="sign"
    ? `${manager.name} has reviewed the squad and wants a new ${positionLabel(pick.position)}${pick.urgency==="critical"?" urgently":""}. A three-player shortlist is ready for your review.`
    : pick.type==="renew"
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
    if(req.type!=="sign") state.managerBacking=clamp((state.managerBacking||70)+3,0,100);
    if(req.type==="transfer") setPlayerListStatus(p.id,"Transfer","Manager");
    else if(req.type==="loan") setPlayerListStatus(p.id,"Loan","Manager");
    else if(req.type==="sign"){
      req.resolved=false;
      openManagerShortlist(req.id);
      saveGame(false);
      renderInbox();
      return;
    }else{
      addNews(`You agreed with ${req.manager} to begin contract talks with ${p.name}.`);
      openPlayerProfile(p.id);
      q("contractNegotiation")?.classList.remove("hide");
    }
  }else{
    if(req.type!=="sign") state.managerBacking=clamp((state.managerBacking||70)-3,0,100);
    if(req.type==="sign") recordManagerTransferChoice(false);
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
      endYear:currentSeasonStartYear()+years
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




/* --------------------------------------------------------------------------
   AI club finance engine — v0.14
   -------------------------------------------------------------------------- */

function deterministicClubNumber(club,salt="finance"){
  const str=String(club)+salt;
  let h=2166136261;
  for(let i=0;i<str.length;i++) h=Math.imul(h^str.charCodeAt(i),16777619);
  return ((h>>>0)%10000)/9999;
}

function estimateClubFootballRevenue(club){
  const c=byClub(club);
  const rep=c?.reputation||70;
  const ratings=DB.players.filter(p=>p.club===club).map(p=>p.overall).sort((a,b)=>b-a).slice(0,16);
  const squadStrength=ratings.length?ratings.reduce((x,y)=>x+y,0)/ratings.length:70;
  const variance=0.92+deterministicClubNumber(club,"revenue")*0.16;
  const base=55_000_000;
  const reputationValue=Math.max(0,rep-65)*8_250_000;
  const strengthValue=Math.max(0,squadStrength-70)*3_000_000;
  let finishFactor=1;
  if(club===state?.club && state?.careerHistory?.seasons?.length){ const last=state.careerHistory.seasons[state.careerHistory.seasons.length-1]; finishFactor=last.leagueFinish<=4?1.12:last.leagueFinish<=7?1.07:last.leagueFinish<=12?1:last.leagueFinish<=16?.95:.90; }
  return Math.round((base+reputationValue+strengthValue)*variance*finishFactor/1_000_000)*1_000_000;
}

function currentClubWeeklyPlayerWages(club){
  return DB.players.filter(p=>p.club===club).reduce((sum,p)=>{
    if(club===state.club) return sum+(state.playerContracts?.[p.id]?.wage??p.wage??0);
    return sum+(p.wage||0);
  },0);
}

function aiOwnerProfile(club){
  const roll=deterministicClubNumber(club,"owner");
  const rep=byClub(club)?.reputation||70;
  if(roll>0.82) return {type:"Ambitious",reinvestment:0.95,budgetAggression:1.15,scrComfort:0.97};
  if(roll<0.18) return {type:"Conservative",reinvestment:0.70,budgetAggression:0.82,scrComfort:0.86};
  if(rep>=88) return {type:"Elite",reinvestment:0.90,budgetAggression:1.08,scrComfort:0.94};
  return {type:"Balanced",reinvestment:0.82,budgetAggression:1.00,scrComfort:0.90};
}

function initialAITransferBudget(club,revenue){
  const c=byClub(club);
  const owner=aiOwnerProfile(club);
  const configured=c?.transferBudget||0;
  const revenueFloor=revenue*(0.10+Math.max(0,(c?.reputation||70)-70)*0.0025);
  return Math.round(Math.max(configured,revenueFloor)*owner.budgetAggression/250000)*250000;
}

function initialAIWageBudget(club,revenue){
  const c=byClub(club);
  if(c?.wageBudget) return c.wageBudget;
  return Math.round((revenue*0.48/52)/1000)*1000;
}

function ensureAIClubFinances(){
  if(!state) return;
  if(!state.aiClubFinances) state.aiClubFinances={};

  DB.clubs.forEach(c=>{
    if(c.name===state.club) return;

    if(!state.aiClubFinances[c.name]){
      const revenue=estimateClubFootballRevenue(c.name);
      const liveWages=currentClubWeeklyPlayerWages(c.name);
      const owner=aiOwnerProfile(c.name);

      state.aiClubFinances[c.name]={
        club:c.name,
        footballRevenue:revenue,
        transferBudget:initialAITransferBudget(c.name,revenue),
        wageBudget:Math.max(initialAIWageBudget(c.name,revenue),Math.round(liveWages*1.08/1000)*1000),
        weeklyWages:liveWages,
        transferSpent:0,
        transferReceived:0,
        ownerType:owner.type,
        reinvestmentRate:owner.reinvestment,
        scrComfort:owner.scrComfort
      };
    }else{
      state.aiClubFinances[c.name].weeklyWages=currentClubWeeklyPlayerWages(c.name);
    }
  });
}

function aiFinance(club){
  ensureAIClubFinances();
  return state.aiClubFinances?.[club]||null;
}

function aiNetTransferSpend(club){
  const f=aiFinance(club);
  return f?(f.transferSpent||0)-(f.transferReceived||0):0;
}

function aiProjectedSquadCost(club,extraFee=0,extraWeeklyWage=0){
  const f=aiFinance(club);
  if(!f) return Infinity;

  const annualWages=(f.weeklyWages+extraWeeklyWage)*52;

  // Casual-player abstraction of transfer cost for SCR.
  // No amortisation/book-value concepts are exposed in the game.
  const positiveNetSpend=Math.max(0,aiNetTransferSpend(club)+extraFee);
  const transferCommitment=positiveNetSpend*0.20;

  return annualWages+transferCommitment;
}

function aiSCRRatio(club,extraFee=0,extraWeeklyWage=0){
  const f=aiFinance(club);
  if(!f || !f.footballRevenue) return 9.99;
  return aiProjectedSquadCost(club,extraFee,extraWeeklyWage)/f.footballRevenue;
}

function aiSCRStatus(club,extraFee=0,extraWeeklyWage=0){
  const ratio=aiSCRRatio(club,extraFee,extraWeeklyWage);
  if(ratio<=0.85) return "Green";
  if(ratio<=1.15) return "Amber";
  return "Red";
}

function aiSCRHeadroom(club){
  const f=aiFinance(club);
  if(!f) return 0;
  return Math.max(0,f.footballRevenue*0.85-aiProjectedSquadCost(club));
}

function aiCanAffordTransfer(club,fee,weeklyWage){
  const f=aiFinance(club);
  if(!f) return {ok:false,reason:"No finance data"};

  if(f.transferBudget<fee) return {ok:false,reason:"Transfer budget"};
  if(f.weeklyWages+weeklyWage>f.wageBudget) return {ok:false,reason:"Wage budget"};

  const projectedRatio=aiSCRRatio(club,fee,weeklyWage);
  if(projectedRatio>1.15) return {ok:false,reason:"SCR red zone"};
  if(projectedRatio>f.scrComfort) return {ok:false,reason:"Owner SCR tolerance"};

  return {ok:true,reason:"Affordable",projectedSCR:projectedRatio};
}

function aiFinancialPressure(club){
  const f=aiFinance(club);
  if(!f) return "Unknown";

  const scr=aiSCRRatio(club);
  const wageUse=f.weeklyWages/Math.max(1,f.wageBudget);
  const startingBudget=Math.max(1,initialAITransferBudget(club,f.footballRevenue));
  const budgetLeft=f.transferBudget/startingBudget;

  if(scr>1.05 || wageUse>1.00) return "Critical";
  if(scr>0.92 || wageUse>0.95 || budgetLeft<0.10) return "Pressure";
  if(scr>0.82 || wageUse>0.88 || budgetLeft<0.25) return "Watch";
  return "Comfortable";
}

function aiSaleWillingnessModifier(club){
  const pressure=aiFinancialPressure(club);
  if(pressure==="Critical") return 0.90;
  if(pressure==="Pressure") return 0.95;
  if(pressure==="Watch") return 0.99;
  return 1.04;
}

function applyAITransferPurchase(club,fee,weeklyWage){
  const f=aiFinance(club);
  if(!f) return;
  f.transferBudget=Math.max(0,f.transferBudget-fee);
  f.transferSpent+=fee;
  f.weeklyWages+=weeklyWage;
}

function applyAITransferSale(club,fee,weeklyWageSaved=0){
  const f=aiFinance(club);
  if(!f) return;
  f.transferReceived+=fee;
  f.transferBudget+=fee*f.reinvestmentRate;
  f.weeklyWages=Math.max(0,f.weeklyWages-weeklyWageSaved);
}

function refreshAIClubFinance(club){
  const f=aiFinance(club);
  if(f) f.weeklyWages=currentClubWeeklyPlayerWages(club);
}


function userFootballRevenue(){
  return estimateClubFootballRevenue(state.club);
}

function userProjectedSquadCost(){
  const sq=DB.players.filter(p=>p.club===state.club);
  const weeklyPlayerWages=sq.reduce((sum,p)=>sum+(state.playerContracts?.[p.id]?.wage??p.wage??0),0);
  const managerWage=state.staff?.manager?.wage||0;
  const annualFootballWages=(weeklyPlayerWages+managerWage)*52;
  const netSpend=Math.max(0,(state.transferFinance?.spent||0)-(state.transferFinance?.received||0));
  const transferCommitment=netSpend*0.20;
  return annualFootballWages+transferCommitment;
}

function userSCRSnapshot(){
  const revenue=userFootballRevenue();
  const squadCost=userProjectedSquadCost();
  const ratio=revenue>0?squadCost/revenue:0;
  const greenLimit=revenue*0.85;
  const maxLimit=revenue*1.15;
  return {
    revenue,squadCost,ratio,
    status:ratio<=0.85?"Green":ratio<=1.15?"Amber":"Red",
    greenHeadroom:greenLimit-squadCost,
    maximumHeadroom:maxLimit-squadCost
  };
}

function aiFinanceSnapshot(club){
  const f=aiFinance(club);
  if(!f) return null;
  return {
    club,
    revenue:f.footballRevenue,
    transferBudget:f.transferBudget,
    wageBudget:f.wageBudget,
    weeklyWages:f.weeklyWages,
    transferSpent:f.transferSpent,
    transferReceived:f.transferReceived,
    netSpend:aiNetTransferSpend(club),
    scrRatio:aiSCRRatio(club),
    scrStatus:aiSCRStatus(club),
    scrHeadroom:aiSCRHeadroom(club),
    pressure:aiFinancialPressure(club),
    ownerType:f.ownerType
  };
}


/* --------------------------------------------------------------------------
   Transfer market engine
   -------------------------------------------------------------------------- */


// 2025/26 Premier League transfer-window model.
// The game currently advances by matchweek rather than calendar date, so the
// real windows are represented by matchweek bands:
//   Summer: pre-season + MW1–MW3 (real window closes 1 September 2025)
//   Winter: MW19–MW23 (real window closes 2 February 2026)
// When a proper calendar is added these helpers can be switched to exact dates
// without changing the rest of the transfer engine.
function transferWindowStatus(week=state?.week??0){
  if(week<=3){
    return {open:true,key:"summer-2025",name:"Summer transfer window",deadline:"1 September 2025",next:"January 2026"};
  }
  if(week>=19 && week<=23){
    return {open:true,key:"winter-2026",name:"January transfer window",deadline:"2 February 2026",next:"Summer 2026"};
  }
  if(week<19){
    return {open:false,key:"closed-autumn",name:"Transfer window closed",deadline:null,next:"January 2026"};
  }
  return {open:false,key:"closed-spring",name:"Transfer window closed",deadline:null,next:"Summer 2026"};
}

function isTransferWindowOpen(week=state?.week??0){
  return transferWindowStatus(week).open;
}

function transferWindowStatusHTML(){
  const w=transferWindowStatus();
  return `<div class="transfer-box" style="border:1px solid ${w.open?"#b7e3c4":"#e5c2c2"}"><b>${w.open?"TRANSFER WINDOW OPEN":"TRANSFER WINDOW CLOSED"}</b><br><span class="muted small">${w.open?`${w.name} • Deadline: ${w.deadline}`:`Next window: ${w.next}`}</span></div>`;
}

function blockClosedWindow(action="complete this transfer"){
  const w=transferWindowStatus();
  if(w.open) return false;
  addNews(`The transfer window is closed. ${action.charAt(0).toUpperCase()+action.slice(1)} is unavailable until ${w.next}.`);
  return true;
}

const TRANSFER_POSITION_GROUPS={
  GK:["GK"],
  RB:["RB","RWB"],
  CB:["CB"],
  LB:["LB","LWB"],
  DM:["CDM","DM"],
  CM:["CM"],
  AM:["CAM","AM"],
  RW:["RW","RM"],
  ST:["ST","CF"],
  LW:["LW","LM"]
};

function ensureTransferMarketState(){
  if(!state) return;
  if(!state.playerClubOverrides) state.playerClubOverrides={}; // legacy compatibility
  if(!state.playerWorldOverrides) state.playerWorldOverrides={};
  if(!state.transferLedger) state.transferLedger=[];
  if(!state.transferNegotiations) state.transferNegotiations={};
  if(!state.incomingTransferOffers) state.incomingTransferOffers=[];
  if(!state.aiTransferPlans) state.aiTransferPlans={};
  if(!state.transferReviewsRun) state.transferReviewsRun={};
  if(!state.managerSquadVacancies) state.managerSquadVacancies=[];

  // Re-apply this career's dynamic player-world changes.
  Object.entries(state.playerClubOverrides).forEach(([pid,club])=>{
    if(!state.playerWorldOverrides[pid]) state.playerWorldOverrides[pid]={club};
  });
  Object.entries(state.playerWorldOverrides).forEach(([pid,changes])=>{
    const p=DB.players.find(x=>String(x.id)===String(pid));
    if(p) Object.assign(p,changes);
  });
}

function playerPositionTokens(p){
  return String(p?.positions||"").toUpperCase().split(/[^A-Z]+/).filter(Boolean);
}

function playsPositionGroup(p,group){
  const wanted=TRANSFER_POSITION_GROUPS[group]||[group];
  const tokens=playerPositionTokens(p);
  return wanted.some(pos=>tokens.includes(pos));
}

function positionLabel(group){
  return ({GK:"goalkeeper",RB:"right-back",CB:"centre-back",LB:"left-back",DM:"defensive midfielder",CM:"central midfielder",AM:"attacking midfielder",RW:"right winger",ST:"striker",LW:"left winger"})[group] || group;
}

function stablePlayerTrait(p,salt="trait"){
  const str=String(p?.id??p?.name??"")+salt;
  let h=2166136261;
  for(let i=0;i<str.length;i++) h=Math.imul(h^str.charCodeAt(i),16777619);
  return ((h>>>0)%1000)/999;
}

function clubSquadPlayers(club){
  ensureTransferMarketState();
  return DB.players.filter(p=>p.club===club);
}

function evaluateSquadNeeds(club){
  const c=byClub(club);
  const rep=c?.reputation||72;
  const expectedStarter=clamp(Math.round(66+(rep-65)*0.38),68,86);
  const groups=Object.keys(TRANSFER_POSITION_GROUPS);

  return groups.map(position=>{
    const players=clubSquadPlayers(club).filter(p=>playsPositionGroup(p,position)).sort((a,b)=>b.overall-a.overall);
    const starter=players[0]?.overall||55;
    const backup=players[1]?.overall||50;
    const depth=players.length;
    let score=0;
    score += Math.max(0,expectedStarter-starter)*5.2;
    score += Math.max(0,(expectedStarter-7)-backup)*2.8;
    if(depth===0) score+=45;
    else if(depth===1) score+=24;
    else if(depth===2) score+=7;

    const oldCore=players.slice(0,2).filter(p=>p.age>=31).length;
    score+=oldCore*7;

    // Contract risk matters for the user's club because live contract state exists.
    if(club===state.club){
      players.slice(0,2).forEach(p=>{
        const end=state.playerContracts?.[p.id]?.endYear ?? p.contract;
        if(end && end<=2026) score+=8;
      });
      players.slice(0,2).forEach(p=>{if(state.injuries?.[p.id]?.weeksLeft>=8) score+=10;});
    }

    return {position,score:clamp(Math.round(score),0,100),starter,backup,depth,expectedStarter};
  }).sort((a,b)=>b.score-a.score);
}

function playerInterestScore(p,buyingClub=state.club){
  const buyer=byClub(buyingClub);
  const seller=byClub(p.club);
  const buyerRep=buyer?.reputation||70;
  const sellerRep=seller?.reputation||70;
  const ambition=stablePlayerTrait(p,"ambition");
  const age=p.age||25;

  let score=52+(buyerRep-sellerRep)*2.4;
  // Ambitious players care more about an upward move; less ambitious players are
  // somewhat more open to sideways moves.
  score+=(ambition-0.5)*(buyerRep>=sellerRep?14:-18);
  if(age<=23 && buyerRep>=80) score+=5;
  if(p.club===buyingClub) score=100;
  return clamp(Math.round(score),0,100);
}

function interestLabel(score){
  if(score>=82) return "Very high";
  if(score>=68) return "High";
  if(score>=50) return "Moderate";
  if(score>=33) return "Low";
  return "Very low";
}

function wageInterestMultiplier(score){
  if(score>=82) return 1.00;
  if(score>=68) return 1.04;
  if(score>=50) return 1.10;
  if(score>=33) return 1.22;
  return 1.40;
}

function managerInterestScore(p){
  if(!state?.club) return 50;
  const needs=evaluateSquadNeeds(state.club);
  const matching=needs.filter(n=>playsPositionGroup(p,n.position));
  const need=matching.length?matching[0].score:20;
  const team=strength(state.club);
  let score=28+need*0.48+(p.overall-team)*5.5;
  if(p.age>=32) score-=8;
  if(p.age<=24 && p.potential>=p.overall+4) score+=5;
  return clamp(Math.round(score),0,100);
}

function dofInterestScore(p){
  const matching=evaluateSquadNeeds(state.club).filter(n=>playsPositionGroup(p,n.position));
  const need=matching.length?matching[0].score:20;
  const value=Math.max(1,p.value||1);
  const upside=Math.max(0,(p.potential||p.overall)-p.overall);
  let score=30+need*0.34+(p.overall-strength(state.club))*3.0+upside*3.2;
  if(p.age<=23) score+=9;
  if(p.age>=29) score-=Math.min(22,(p.age-28)*5);
  // Expensive players need to be correspondingly excellent.
  const valueMillions=value/1_000_000;
  if(valueMillions>70 && p.overall<84) score-=10;
  if(valueMillions<35 && p.overall>=80) score+=8;
  return clamp(Math.round(score),0,100);
}

function staffInterestLabel(score){
  if(score>=80) return "Very interested";
  if(score>=63) return "Interested";
  if(score>=45) return "Open to deal";
  if(score>=28) return "Low interest";
  return "Not interested";
}

function estimatedAskingPrice(p,buyingClub=state.club){
  const value=Math.max(250000,p.value||0);
  const sellerRep=byClub(p.club)?.reputation||70;
  const buyerRep=byClub(buyingClub)?.reputation||70;
  const contractYear=state.playerContracts?.[p.id]?.endYear ?? p.contract ?? 2028;
  const years=Math.max(0,contractYear-2025);
  let mult=1.08;
  if(years>=4) mult+=0.14;
  else if(years<=1) mult-=0.17;
  if(p.age<=23 && (p.potential||p.overall)>=p.overall+4) mult+=0.14;
  if(p.overall>=84) mult+=0.10;
  if(buyerRep>sellerRep+8) mult+=0.05;
  // Deterministic club-specific variance avoids every deal being value × same number.
  mult+=((stablePlayerTrait(p,"ask")-0.5)*0.12);
  if(p.club!==state.club && state.aiClubFinances?.[p.club]){
    mult*=aiSaleWillingnessModifier(p.club);
  }
  return Math.max(value,Math.round((value*mult)/250000)*250000);
}

function expectedTransferWage(p,buyingClub=state.club){
  const current=Math.max(1000,state.playerContracts?.[p.id]?.wage ?? p.wage ?? 1000);
  const interest=playerInterestScore(p,buyingClub);
  let demand=current*wageInterestMultiplier(interest);
  if((p.overall||0)>=84) demand*=1.08;
  if((p.overall||0)>=88) demand*=1.08;
  const step=demand>=100000?5000:demand>=50000?2500:1000;
  return Math.round(demand/step)*step;
}

function findTransferTargets(club,position,limit=6){
  const rep=byClub(club)?.reputation||70;
  const budget=club===state.club
    ? (state.budget||0)
    : (aiFinance(club)?.transferBudget||Math.max(15_000_000,(rep-65)*4_000_000));
  const currentStrength=club===state.club?strength(club):(()=>{
    const arr=clubSquadPlayers(club).map(p=>p.overall).sort((a,b)=>b-a).slice(0,16);
    return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:70;
  })();

  return DB.players
    .filter(p=>p.club!==club && playsPositionGroup(p,position))
    .map(player=>{
      const interest=playerInterestScore(player,club);
      const asking=estimatedAskingPrice(player,club);
      const abilityFit=(player.overall-currentStrength)*8;
      const upside=Math.max(0,(player.potential||player.overall)-player.overall)*2;
      const affordability=asking<=budget*1.15?12:asking<=budget*1.6?0:-18;
      const score=50+abilityFit+upside+interest*0.18+affordability-(player.age>=31?10:0);
      return {player,score,asking,interest};
    })
    .filter(x=>x.player.overall>=Math.max(68,currentStrength-5))
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit);
}

function currentGameMonthYear(){
  const start=new Date(Date.UTC(currentSeasonStartYear(),7,11));
  start.setUTCDate(start.getUTCDate()+(state?.week||0)*7);
  return start.toLocaleDateString("en-GB",{month:"short",year:"numeric",timeZone:"UTC"});
}

function transferPlayerToClub(p,newClub,fee,fromClub=p.club,details={}){
  ensureTransferMarketState();
  const oldClub=fromClub;
  const joined=currentGameMonthYear();

  state.playerWorldOverrides[p.id]={
    ...(state.playerWorldOverrides[p.id]||{}),
    club:newClub,
    joined
  };
  state.playerClubOverrides[p.id]=newClub;
  p.club=newClub;
  p.joined=joined;

  state.transferLedger.push({
    id:"tx"+Date.now()+Math.floor(Math.random()*1000),week:state.week,playerId:p.id,playerName:p.name,
    fromClub:oldClub,toClub:newClub,fee,kind:details.kind||"permanent",joined,season:currentSeasonLabel()
  });
  state.transferLedger=state.transferLedger.slice(-120);
}

function transferDossier(p){
  const interest=playerInterestScore(p,state.club);
  const manager=managerInterestScore(p);
  const dof=dofInterestScore(p);
  const asking=estimatedAskingPrice(p,state.club);
  const wage=expectedTransferWage(p,state.club);
  return {interest,manager,dof,asking,wage};
}

function ensureTransferPlayerModal(){
  if(document.getElementById("transferPlayerModal")) return;
  const style=document.createElement("style");
  style.textContent=`
    #transferPlayerModal{position:fixed;inset:0;background:rgba(8,12,20,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px}
    #transferPlayerModal.hide{display:none}
    #transferPlayerModal .transfer-sheet{width:min(760px,100%);max-height:92vh;overflow:auto;background:#fff;color:#18202b;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.35)}
    #transferPlayerModal .transfer-head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start;margin-bottom:16px}
    #transferPlayerModal .transfer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}
    #transferPlayerModal .transfer-metric{border:1px solid #e4e8ee;border-radius:10px;padding:12px}
    #transferPlayerModal .transfer-metric span{display:block;font-size:12px;color:#667085;margin-bottom:4px}
    #transferPlayerModal .transfer-metric b{font-size:16px}
    #transferPlayerModal .transfer-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
    #transferPlayerModal .transfer-box{background:#f6f8fb;border-radius:10px;padding:13px;margin-top:14px}
    #transferPlayerModal input,#transferPlayerModal select{padding:9px;border:1px solid #cfd5df;border-radius:8px;max-width:180px}
    #transferPlayerModal button{cursor:pointer}
    @media(max-width:600px){#transferPlayerModal .transfer-grid{grid-template-columns:1fr}.transfer-sheet{padding:16px!important}}
  `;
  document.head.appendChild(style);

  const modal=document.createElement("div");
  modal.id="transferPlayerModal";
  modal.className="hide";
  modal.innerHTML=`<div class="transfer-sheet">
    <div class="transfer-head"><div><h2 id="transferFileName" style="margin:0"></h2><div id="transferFileSub" class="muted"></div></div><button class="btn secondary" id="closeTransferFile">Close</button></div>
    <div id="transferFileBody"></div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click",e=>{if(e.target===modal) closeTransferPlayerFile();});
  modal.querySelector("#closeTransferFile").addEventListener("click",closeTransferPlayerFile);
}

function openTransferPlayerFile(id,context={}){
  ensureContractState();
  const p=DB.players.find(x=>String(x.id)===String(id));
  if(!p) return;
  if(p.club===state.club && typeof openPlayerProfile==="function"){
    openPlayerProfile(p.id);
    return;
  }
  ensureTransferPlayerModal();
  const d=transferDossier(p);
  const joined=p.joined||"Unknown";
  const contract=state.playerContracts?.[p.id]?.endYear ?? p.contract ?? "Unknown";
  const active=state.transferNegotiations?.[p.id];

  q("transferFileName").textContent=p.name;
  q("transferFileSub").textContent=`${p.club} • ${p.positions} • ${p.age} • ${p.nationality}`;
  q("transferFileBody").innerHTML=`
    <div class="transfer-grid">
      <div class="transfer-metric"><span>Joined current club</span><b>${joined}</b></div>
      <div class="transfer-metric"><span>Transfer market value</span><b>${money(p.value)}</b></div>
      <div class="transfer-metric"><span>Current wage</span><b>${money(p.wage||0)}/wk</b></div>
      <div class="transfer-metric"><span>Contract</span><b>${contract}</b></div>
      <div class="transfer-metric"><span>Interest in joining ${state.club}</span><b>${interestLabel(d.interest)}</b></div>
      <div class="transfer-metric"><span>Manager interest</span><b>${staffInterestLabel(d.manager)}</b></div>
      <div class="transfer-metric"><span>Director of Football interest</span><b>${staffInterestLabel(d.dof)}</b></div>
      <div class="transfer-metric"><span>Recruitment estimate</span><b>${money(Math.round(d.asking*.92/250000)*250000)}–${money(Math.round(d.asking*1.08/250000)*250000)}</b></div>
    </div>
    <div class="transfer-box">
      <b>Recruitment view</b><br>
      <span class="muted small">Expected wage demand: around ${money(d.wage)}/wk. Lower player interest increases the wage premium needed to complete a deal.</span>
    </div>
    ${transferWindowStatusHTML()}
    <div id="transferNegotiationArea"></div>
    <div class="transfer-actions">
      <button class="btn primary" id="authoriseTransferApproach" ${isTransferWindowOpen()?"":"disabled"}>${isTransferWindowOpen()?(active?"Continue negotiation":"Authorise approach"):"Window closed"}</button>
    </div>`;
  q("authoriseTransferApproach").addEventListener("click",()=>beginTransferApproach(p.id,context));
  q("transferPlayerModal").classList.remove("hide");
  if(active) renderTransferNegotiation(p.id);
}

function closeTransferPlayerFile(){
  q("transferPlayerModal")?.classList.add("hide");
}

function beginTransferApproach(id,context={}){
  ensureContractState();
  if(blockClosedWindow("authorise an approach")) return;
  const p=DB.players.find(x=>String(x.id)===String(id));
  if(!p || p.club===state.club) return;
  if(!state.transferNegotiations[p.id]){
    const asking=estimatedAskingPrice(p,state.club);
    const suggested=Math.round((asking*.82)/250000)*250000;
    state.transferNegotiations[p.id]={
      playerId:p.id,sellingClub:p.club,buyingClub:state.club,askingPrice:asking,
      latestOffer:suggested,round:0,status:"negotiating",managerRequestId:context.managerRequestId||null
    };
  }
  renderTransferNegotiation(p.id);
}

function renderTransferNegotiation(id){
  const p=DB.players.find(x=>String(x.id)===String(id));
  const n=state.transferNegotiations?.[id];
  const area=q("transferNegotiationArea");
  if(!p||!n||!area) return;

  if(n.status==="clubAccepted" || n.status==="terms"){
    const demand=expectedTransferWage(p,state.club);
    area.innerHTML=`<div class="transfer-box"><b>${n.sellingClub} accepted ${money(n.agreedFee)}.</b><br><span class="muted small">You can now agree terms with ${p.name}.</span>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;align-items:center">
        <label>Weekly wage <input id="newSigningWage" type="number" step="1000" value="${demand}"></label>
        <label>Contract <select id="newSigningYears"><option>3</option><option selected>4</option><option>5</option></select> years</label>
        <button class="btn primary" id="submitSigningTerms">Offer contract</button>
      </div>
      <div class="muted small" style="margin-top:8px">Agent expectation: around ${money(demand)}/wk • Player interest: ${interestLabel(playerInterestScore(p,state.club))}.</div>
    </div>`;
    q("submitSigningTerms").addEventListener("click",()=>submitNewSigningTerms(p.id));
    return;
  }

  if(n.status==="rejected"){
    area.innerHTML=`<div class="transfer-box"><b>Approach ended.</b><br><span class="muted small">${n.sellingClub} rejected the negotiation.</span></div>`;
    return;
  }

  area.innerHTML=`<div class="transfer-box">
    <b>Club negotiation — ${n.sellingClub}</b><br>
    <span class="muted small">Recruitment estimates the player may cost around ${money(Math.round(n.askingPrice*.92/250000)*250000)}–${money(Math.round(n.askingPrice*1.08/250000)*250000)}.</span>
    ${n.message?`<div style="margin-top:8px">${n.message}</div>`:""}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;align-items:center">
      <label>Transfer fee <input id="transferFeeOffer" type="number" step="250000" value="${n.latestOffer}"></label>
      <button class="btn primary" id="submitTransferBid">Submit bid</button>
      <button class="btn secondary" id="walkAwayTransfer">Walk away</button>
    </div>
  </div>`;
  q("submitTransferBid").addEventListener("click",()=>submitTransferBid(p.id,Number(q("transferFeeOffer").value||0)));
  q("walkAwayTransfer").addEventListener("click",()=>{n.status="rejected";n.message="You ended negotiations.";saveGame(false);renderTransferNegotiation(p.id);});
}

function submitTransferBid(id,fee){
  if(blockClosedWindow("submit a transfer bid")) return;
  const p=DB.players.find(x=>String(x.id)===String(id));
  const n=state.transferNegotiations?.[id];
  if(!p||!n||fee<=0) return;
  n.round=(n.round||0)+1;
  n.latestOffer=Math.round(fee/250000)*250000;

  // A stronger DOF effectively lowers the price at which the selling club can be
  // persuaded to close. This reuses the existing staff mechanic rather than
  // creating a disconnected transfer-only rating.
  const effectiveAsk=n.askingPrice*dofNegotiationModifier();
  const ratio=n.latestOffer/effectiveAsk;

  if(ratio>=0.985){
    n.status="clubAccepted";
    n.agreedFee=n.latestOffer;
    n.message=`${n.sellingClub} accepted your offer.`;
    addNews(`${n.sellingClub} have accepted ${state.club}'s ${money(n.agreedFee)} offer for ${p.name}.`);
  }else if(ratio>=0.84){
    const counter=Math.round((effectiveAsk*(0.985-(n.round-1)*0.018))/250000)*250000;
    n.message=`${n.sellingClub} rejected the bid and countered at ${money(counter)}.`;
    n.latestOffer=Math.max(n.latestOffer,counter);
    if(n.round>=4 && ratio<0.92){
      n.status="rejected";
      n.message=`${n.sellingClub} have ended negotiations after repeated bids below their valuation.`;
    }
  }else{
    n.message=`${n.sellingClub} rejected the bid as well below their valuation.`;
    if(n.round>=3){
      n.status="rejected";
      n.message=`${n.sellingClub} have ended negotiations.`;
    }
  }
  saveGame(false);
  renderTransferNegotiation(p.id);
}

function submitNewSigningTerms(id){
  if(blockClosedWindow("complete a permanent transfer")) return;
  const p=DB.players.find(x=>String(x.id)===String(id));
  const n=state.transferNegotiations?.[id];
  if(!p||!n||n.status!=="clubAccepted") return;
  const wage=Math.max(1000,Number(q("newSigningWage")?.value||0));
  const years=Math.max(1,Number(q("newSigningYears")?.value||4));
  const demand=expectedTransferWage(p,state.club);
  const interest=playerInterestScore(p,state.club);

  let chance=0.36+(wage/demand-1)*1.7+(interest-50)/180;
  if(years>=4 && p.age<=29) chance+=0.06;
  chance=clamp(chance,0.04,0.96);

  if(Math.random()>chance){
    n.status="clubAccepted";
    addNews(`${p.name}'s representatives rejected ${state.club}'s contract offer.`);
    const area=q("transferNegotiationArea");
    if(area){
      const old=area.querySelector(".transfer-box");
      if(old) old.insertAdjacentHTML("afterbegin",`<div class="bad" style="margin-bottom:8px"><b>Contract offer rejected.</b></div>`);
    }
    return;
  }

  if((state.budget||0)<n.agreedFee){
    addNews(`The ${p.name} deal could not be completed because the transfer budget is insufficient.`);
    return;
  }

  const oldClub=p.club;
  const oldAIWage=p.wage||0;
  state.budget-=n.agreedFee;
  if(state.transferFinance) state.transferFinance.spent=(state.transferFinance.spent||0)+n.agreedFee;
  if(oldClub!==state.club && aiFinance(oldClub)){
    applyAITransferSale(oldClub,n.agreedFee,oldAIWage);
  }
  transferPlayerToClub(p,state.club,n.agreedFee,oldClub);
  state.playerContracts[p.id]={wage,endYear:currentSeasonStartYear()+years};
  p.wage=wage;
  state.playerMorale[p.id]="Happy";
  if(!state.playerStats[p.id]) state.playerStats[p.id]={appearances:0,goals:0};
  state.playerListStatus[p.id]="None";
  n.status="completed";
  if(p.overall>=82 || n.agreedFee>=40_000_000) recordMarqueeSigning(p);
  state.transferSentiment.owners.push({label:`Transfer spending on ${p.name}`,value:n.agreedFee>(p.value||0)*1.25?-3:1});
  addNews(`${state.club} have signed ${p.name} from ${oldClub} for ${money(n.agreedFee)}. ${p.name} has agreed a ${years}-year contract worth ${money(wage)}/week.`);
  saveGame(false);
  closeTransferPlayerFile();
  renderAll();
}

function incomingOfferFairValue(p){
  return Math.round(estimatedAskingPrice(p,state.club)/250000)*250000;
}

function generateIncomingOffer(){
  ensureContractState();
  if(!isTransferWindowOpen()) return;
  const candidates=squad(state.club).filter(p=>{
    const listed=state.playerListStatus?.[p.id]==="Transfer";
    const strong=p.overall>=74;
    return listed || strong;
  });
  if(!candidates.length) return;

  // Listed players are much more likely to attract attention.
  const weighted=[];
  candidates.forEach(p=>{
    let w=1;
    if(state.playerListStatus?.[p.id]==="Transfer") w+=5;
    if(p.overall>=82) w+=2;
    for(let i=0;i<w;i++) weighted.push(p);
  });
  const p=weighted[Math.floor(Math.random()*weighted.length)];
  if(state.incomingTransferOffers.some(o=>o.playerId===p.id && o.status==="pending")) return;

  const interestedClubs=DB.clubs.filter(c=>c.name!==state.club).filter(c=>{
    const needs=evaluateSquadNeeds(c.name).slice(0,3);
    return needs.some(n=>playsPositionGroup(p,n.position));
  });
  if(!interestedClubs.length) return;
  const fair=incomingOfferFairValue(p);
  const affordableBuyers=interestedClubs.filter(c=>{
    const expectedWage=expectedTransferWage(p,c.name);
    return aiCanAffordTransfer(c.name,fair*.85,expectedWage).ok;
  });
  if(!affordableBuyers.length) return;

  const buyer=affordableBuyers[Math.floor(Math.random()*affordableBuyers.length)];
  const listed=state.playerListStatus?.[p.id]==="Transfer";
  const fee=Math.round((fair*(listed?0.82+Math.random()*.16:0.88+Math.random()*.22))/250000)*250000;
  const wage=expectedTransferWage(p,buyer.name);
  if(!aiCanAffordTransfer(buyer.name,fee,wage).ok) return;
  const offer={id:"io"+Date.now()+Math.floor(Math.random()*1000),playerId:p.id,buyingClub:buyer.name,fee,status:"pending",round:1,expectedWage:wage};
  state.incomingTransferOffers.push(offer);
  state.news.unshift({week:state.week,text:`${buyer.name} have submitted a ${money(fee)} offer for ${p.name}.`,incomingOfferId:offer.id});
}

function incomingOfferViews(offer){
  const p=DB.players.find(x=>String(x.id)===String(offer.playerId));
  const fair=incomingOfferFairValue(p);
  const ratio=offer.fee/fair;
  const mgr=managerInterestScore(p);
  let manager= mgr>=70?"Keep — important to first-team plans":mgr>=50?"Open to sale at the right price":"Would sanction a sale";
  let dof=ratio>=1.08?"Recommend accepting — strong value":ratio>=0.94?"Fair offer — negotiate if possible":"Recommend rejecting — below valuation";
  return {p,fair,manager,dof};
}

function openIncomingTransferOffer(id){
  const offer=state.incomingTransferOffers?.find(o=>o.id===id);
  if(!offer||offer.status!=="pending") return;
  const v=incomingOfferViews(offer);
  ensureTransferPlayerModal();
  q("transferFileName").textContent=`Offer for ${v.p.name}`;
  q("transferFileSub").textContent=`${offer.buyingClub} → ${state.club}`;
  q("transferFileBody").innerHTML=`
    <div class="transfer-grid">
      <div class="transfer-metric"><span>Offer</span><b>${money(offer.fee)}</b></div>
      <div class="transfer-metric"><span>Market value</span><b>${money(v.p.value)}</b></div>
      <div class="transfer-metric"><span>Internal fair-value estimate</span><b>${money(v.fair)}</b></div>
      <div class="transfer-metric"><span>Player morale</span><b>${state.playerMorale?.[v.p.id]||"Content"}</b></div>
      <div class="transfer-metric"><span>Manager view</span><b>${v.manager}</b></div>
      <div class="transfer-metric"><span>DOF view</span><b>${v.dof}</b></div>
    </div>
    <div class="transfer-actions">
      <button class="btn primary" id="acceptIncomingOffer">Accept</button>
      <button class="btn secondary" id="rejectIncomingOffer">Reject</button>
      <label>Counter <input id="incomingCounterFee" type="number" step="250000" value="${Math.round(v.fair/250000)*250000}"></label>
      <button class="btn secondary" id="counterIncomingOffer">Negotiate</button>
    </div>`;
  q("acceptIncomingOffer").addEventListener("click",()=>resolveIncomingTransferOffer(id,"accept"));
  q("rejectIncomingOffer").addEventListener("click",()=>resolveIncomingTransferOffer(id,"reject"));
  q("counterIncomingOffer").addEventListener("click",()=>resolveIncomingTransferOffer(id,"counter",Number(q("incomingCounterFee").value||0)));
  q("transferPlayerModal").classList.remove("hide");
}

function resolveIncomingTransferOffer(id,action,counter=0){
  if(blockClosedWindow("respond to a permanent-transfer offer")) return;
  const offer=state.incomingTransferOffers?.find(o=>o.id===id);
  if(!offer||offer.status!=="pending") return;
  const p=DB.players.find(x=>String(x.id)===String(offer.playerId));
  if(!p) return;
  const fair=incomingOfferFairValue(p);

  if(action==="reject"){
    offer.status="rejected";
    addNews(`${state.club} rejected ${offer.buyingClub}'s ${money(offer.fee)} offer for ${p.name}.`);
    closeTransferPlayerFile();
  }else if(action==="counter"){
    counter=Math.round(counter/250000)*250000;
    const ceiling=fair*(0.98+stablePlayerTrait(p,offer.buyingClub)*0.20);
    if(counter<=ceiling){
      offer.fee=counter;
      action="accept";
    }else{
      offer.round++;
      if(offer.round>=3 || counter>ceiling*1.16){
        offer.status="rejected";
        addNews(`${offer.buyingClub} withdrew from talks for ${p.name} after rejecting ${state.club}'s ${money(counter)} asking price.`);
        closeTransferPlayerFile();
      }else{
        const revised=Math.round((ceiling*.97)/250000)*250000;
        offer.fee=revised;
        addNews(`${offer.buyingClub} have increased their offer for ${p.name} to ${money(revised)}.`);
        openIncomingTransferOffer(id);
      }
    }
  }

  if(action==="accept"){
    const oldValue=p.value||fair;
    const oldClub=state.club;
    const buyer=offer.buyingClub;
    const yearsAtClub=(()=>{
      const joined=parseInt(String(p.joined||"").match(/20\d{2}/)?.[0]||"2025",10);
      return Math.max(0,currentSeasonStartYear()-joined);
    })();
    recordStarSale(p,offer.fee,oldValue,yearsAtClub);
    const buyerWage=offer.expectedWage||expectedTransferWage(p,buyer);
    const affordability=aiCanAffordTransfer(buyer,offer.fee,buyerWage);
    if(!affordability.ok){
      offer.status="rejected";
      addNews(`${buyer} withdrew their offer for ${p.name} because they could no longer complete the deal within their financial limits.`);
      closeTransferPlayerFile();
      saveGame(false);
      renderAll();
      return;
    }

    registerManagerSquadVacancy(p,oldClub);
    state.budget+=offer.fee;
    if(state.transferFinance) state.transferFinance.received=(state.transferFinance.received||0)+offer.fee;
    applyAITransferPurchase(buyer,offer.fee,buyerWage);
    p.wage=buyerWage;
    transferPlayerToClub(p,buyer,offer.fee,oldClub);
    offer.status="accepted";
    delete state.playerContracts[p.id];
    delete state.playerStats[p.id];
    delete state.playerMorale[p.id];
    delete state.playerListStatus[p.id];
    addNews(`${p.name} has joined ${buyer} from ${oldClub} for ${money(offer.fee)}.`);
    closeTransferPlayerFile();
  }
  saveGame(false);
  renderAll();
}

function runAITransferReview(){
  ensureTransferMarketState();
  const key=String(state.week);
  if(state.transferReviewsRun[key]) return;
  const reviewWeeks=[0,18,37];
  if(!reviewWeeks.includes(state.week)) return;
  state.transferReviewsRun[key]=true;

  DB.clubs.filter(c=>c.name!==state.club).forEach(c=>{
    const pressure=aiFinancialPressure(c.name);
    state.aiTransferPlans[c.name]=evaluateSquadNeeds(c.name).slice(0,3).map(n=>({...n,financialPressure:pressure}));
  });
}

function simulateOneAITransfer(){
  ensureTransferMarketState();
  ensureAIClubFinances();
  if(!isTransferWindowOpen()) return;

  const clubs=DB.clubs.filter(c=>c.name!==state.club);
  const buyerPool=clubs.filter(c=>{
    const pressure=aiFinancialPressure(c.name);
    return pressure==="Comfortable" || pressure==="Watch";
  });
  if(!buyerPool.length) return;

  const buyer=buyerPool[Math.floor(Math.random()*buyerPool.length)];
  const needs=state.aiTransferPlans[buyer.name]||evaluateSquadNeeds(buyer.name).slice(0,3);
  const need=needs.find(n=>n.score>=48);
  if(!need) return;

  const targets=findTransferTargets(buyer.name,need.position,10)
    .filter(x=>x.player.club!==state.club)
    .filter(x=>{
      const wage=expectedTransferWage(x.player,buyer.name);
      return aiCanAffordTransfer(buyer.name,x.asking,wage).ok;
    });

  if(!targets.length) return;

  const target=targets[Math.floor(Math.random()*Math.min(3,targets.length))];
  const p=target.player;
  const seller=p.club;
  const sellerOldWage=p.wage||0;
  const newWage=expectedTransferWage(p,buyer.name);
  const fee=Math.round((target.asking*(0.91+Math.random()*.11))/250000)*250000;

  if(!aiCanAffordTransfer(buyer.name,fee,newWage).ok) return;

  applyAITransferPurchase(buyer.name,fee,newWage);
  if(aiFinance(seller)) applyAITransferSale(seller,fee,sellerOldWage);

  p.wage=newWage;
  transferPlayerToClub(p,buyer.name,fee,seller,{kind:"ai"});
  refreshAIClubFinance(buyer.name);
  if(aiFinance(seller)) refreshAIClubFinance(seller);

  if((p.overall||0)>=80 || fee>=35_000_000){
    addNews(`${buyer.name} have signed ${p.name} from ${seller} for ${money(fee)}.`);
  }
}

function processTransferWeek(){
  ensureContractState();
  ensureAIClubFinances();
  runAITransferReview();

  // Buying and selling only happens while the 2025/26 PL window is open.
  // Squad reviews and planning can still occur while the market is closed.
  const windowActive=isTransferWindowOpen();
  if(windowActive && Math.random()<0.24) generateIncomingOffer();

  // AI-to-AI activity keeps the market alive without attempting dozens of deals
  // every matchweek.
  if(windowActive && Math.random()<0.34) simulateOneAITransfer();
}

function attachTransferDatabaseDelegation(){
  document.addEventListener("click",e=>{
    const btn=e.target.closest?.(".database-player-link");
    if(btn) openTransferPlayerFile(btn.dataset.playerId);

    const offerBtn=e.target.closest?.(".incoming-offer-btn");
    if(offerBtn) openIncomingTransferOffer(offerBtn.dataset.offerId);
  });
}

document.addEventListener("DOMContentLoaded",attachTransferDatabaseDelegation);


function allAIClubFinanceSnapshots(){
  ensureAIClubFinances();
  return DB.clubs
    .filter(c=>c.name!==state.club)
    .map(c=>aiFinanceSnapshot(c.name))
    .filter(Boolean)
    .sort((a,b)=>b.scrRatio-a.scrRatio);
}


function openManagerShortlist(requestId){
  const req=state.managerRequests?.find(r=>r.id===requestId);
  if(!req||req.type!=="sign") return;
  const shortlist=managerShortlistForRequest(req);
  if(!shortlist.length) return;

  q("managerShortlistTitle").textContent=`New ${positionLabel(req.position)} shortlist`;
  q("managerShortlistIntro").textContent=`${req.manager} has presented three realistic approaches to solve this squad need.`;
  q("managerShortlistOptions").innerHTML=shortlist.map((x,i)=>{
    const p=x.player, tag=x.role||["Ideal target","Cheaper alternative","Young prospect"][i];
    return `<div class="manager-shortlist-option">
      <div class="manager-shortlist-top">
        <div><span class="shortlist-role">${tag}</span><h3>${p.name}</h3><div class="muted small">${p.club} • ${p.age} yrs • ${p.positions}</div></div>
        <div class="rating">${p.overall}</div>
      </div>
      <div class="shortlist-metrics">
        <div><span>Potential</span><b>${p.potential||p.overall}</b></div>
        <div><span>Est. price</span><b>${money(x.asking||estimatedAskingPrice(p,state.club))}</b></div>
        <div><span>Interest</span><b>${Math.round(x.interest??playerInterestScore(p,state.club))}%</b></div>
      </div>
      <button class="btn ${i===0?"primary":"secondary"} pursue-shortlist-btn" data-request-id="${req.id}" data-player-id="${p.id}" data-role="${tag}">Pursue ${tag.toLowerCase()}</button>
    </div>`;
  }).join("");

  document.querySelectorAll(".pursue-shortlist-btn").forEach(btn=>btn.addEventListener("click",()=>pursueManagerShortlistTarget(btn.dataset.requestId,btn.dataset.playerId,btn.dataset.role)));
  q("managerShortlistModal").classList.remove("hide");
}

function pursueManagerShortlistTarget(requestId,playerId,role){
  const req=state.managerRequests?.find(r=>r.id===requestId);
  const p=DB.players.find(x=>String(x.id)===String(playerId));
  if(!req||!p) return;
  req.resolved=true;
  req.selectedPlayerId=p.id;
  req.selectedRole=role;
  state.managerBacking=clamp((state.managerBacking||70)+(role==="Ideal target"?4:role==="Cheaper alternative"?2:1),0,100);
  addNews(`You selected ${p.name} as the ${role.toLowerCase()} for ${req.manager}'s ${positionLabel(req.position)} request.`);
  q("managerShortlistModal").classList.add("hide");
  saveGame(false);
  openTransferPlayerFile(p.id,{managerRequestId:req.id});
  renderInbox();
  renderDashboard();
}

