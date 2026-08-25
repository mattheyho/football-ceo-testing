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
  repairFalseRejectedSaleStakeholderReactions();
  if(!state.playerContracts) state.playerContracts={};
  if(!state.playerListStatus) state.playerListStatus={};
  if(!state.managerRequests) state.managerRequests=[];
  if(!state.managerRequestCooldowns) state.managerRequestCooldowns={};
  if(!state.managerRequestRejections) state.managerRequestRejections={};
  if(!state.managerRoleFulfilledUntil) state.managerRoleFulfilledUntil={};
  if(!state.managerTactics) state.managerTactics={};
  if(!state.contractNegotiations) state.contractNegotiations={};
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
  const yearsLeft=Math.max(0,(current.endYear||currentContractSeasonEndYear())-currentSeasonStartYear());
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
  if(tokens.includes("GK")) return "GK";
  if(tokens.includes("RB")||tokens.includes("RWB")) return "RB";
  if(tokens.includes("LB")||tokens.includes("LWB")) return "LB";
  if(tokens.includes("CB")) return "CB";
  if(tokens.includes("CDM")||tokens.includes("DM")) return "DM";
  if(tokens.includes("CAM")||tokens.includes("AM")) return "AM";
  if(tokens.includes("CM")) return "CM";
  if(tokens.includes("RW")||tokens.includes("RM")) return "RW";
  if(tokens.includes("LW")||tokens.includes("LM")) return "LW";
  if(tokens.includes("ST")||tokens.includes("CF")) return "ST";
  return null;
}

function registerManagerSquadVacancy(p,oldClub){
  if(oldClub!==state.club || !p) return;
  ensureTransferMarketState();

  const group=primaryRecruitmentGroup(p);
  if(!group) return;

  const before=clubSquadPlayers(state.club)
    .filter(x=>playsPositionGroup(x,group))
    .sort((a,b)=>(b.overall||0)-(a.overall||0));

  const wasRank=before.findIndex(x=>String(x.id)===String(p.id));

  let requestedRole="backup";
  if(wasRank===0) requestedRole="starter";
  else if(wasRank===1) requestedRole="competition";

  const clubRep=byClub(state.club)?.reputation||72;
  const firstTeamThreshold=clamp(Math.round(65+(clubRep-65)*0.42),70,84);
  if((p.overall||0)<firstTeamThreshold && requestedRole!=="backup") return;

  if(state.managerRoleFulfilledUntil){
    delete state.managerRoleFulfilledUntil[`${group}-${requestedRole}`];
  }

  const existing=state.managerSquadVacancies.find(v=>v.position===group && !v.filled);
  if(existing){
    existing.priority=Math.max(existing.priority||0,p.overall||0);
    existing.week=state.week;
    existing.role=requestedRole;
  }else{
    state.managerSquadVacancies.push({
      position:group,
      role:requestedRole,
      soldPlayerId:p.id,
      soldPlayerName:p.name,
      soldOverall:p.overall||0,
      week:state.week,
      filled:false,
      priority:p.overall||0
    });
  }

  if(typeof scheduleManagerReassessment==="function") scheduleManagerReassessment(1);
}


function managerPositionStandard(position){
  const players=clubSquadPlayers(state.club)
    .filter(p=>playsPositionGroup(p,position))
    .sort((a,b)=>b.overall-a.overall);
  const starter=players[0]?.overall||68;
  const second=players[1]?.overall||Math.max(62,starter-8);
  const clubRep=byClub(state.club)?.reputation||70;

  // The manager's expected first-team standard is anchored to BOTH
  // current squad quality and club reputation.
  const reputationStandard=clamp(Math.round(68+(clubRep-70)*0.42),70,87);
  return {
    starter,
    second,
    expectedStarter:Math.max(starter,reputationStandard),
    expectedDepth:Math.max(second,reputationStandard-6)
  };
}

function realisticManagerTargetPool(position,limit=30){
  const club=state.club;
  const userRep=byClub(club)?.reputation||70;
  const standard=managerPositionStandard(position);

  return DB.players
    .filter(p=>p.club!==club && p.club!=="Free Agent" && playsPositionGroup(p,position))
    .map(p=>{
      const sellingRep=byClub(p.club)?.reputation||68;
      const asking=estimatedAskingPrice(p,club);
      const interest=playerInterestScore(p,club);
      const overall=p.overall||0;
      const potential=p.potential||overall;

      // Hard realism filters.
      const eliteBlock=(overall>=88 && userRep<88 && sellingRep>=userRep+2);
      const prestigeBlock=(sellingRep>=userRep+8 && interest<62);
      const interestBlock=(interest<38);
      const affordabilityCeiling=Math.max((state.budget||0)*1.20,30_000_000);
      const budgetBlock=asking>affordabilityCeiling;

      // A normal first-team recommendation cannot be dramatically below
      // the club's current standard.
      const qualityBlock=overall<standard.expectedStarter-5 && potential<standard.expectedStarter+1;

      return {
        player:p,asking,interest,overall,potential,sellingRep,
        attainable:!eliteBlock&&!prestigeBlock&&!interestBlock&&!budgetBlock&&!qualityBlock
      };
    })
    .filter(x=>x.attainable)
    .sort((a,b)=>{
      const sa=(a.overall*2.2)+(a.interest*.22)+(a.potential*.30)-(a.asking/1_000_000*.10);
      const sb=(b.overall*2.2)+(b.interest*.22)+(b.potential*.30)-(b.asking/1_000_000*.10);
      return sb-sa;
    })
    .slice(0,limit);
}


function recruitmentOpenNeeds(){
  try{
    return evaluateSquadNeeds(state.club).filter(n=>n.role!=="none");
  }catch(e){
    return [];
  }
}

function recruitmentBudgetPerNeed(position){
  const budget=Math.max(0,state.budget||0);
  const needs=recruitmentOpenNeeds();
  const meaningful=Math.max(1,Math.min(4,needs.length||1));
  const base=budget/meaningful;
  const profile=managerProfileForClub(state.club);
  const aggression=(profile?.recruitmentAggression??70)/100;
  // Manager can push above an equal share for a priority position, but should
  // not treat the whole budget as one signing by default.
  return Math.min(budget,base*(1.05+aggression*.35));
}

function recruitmentFinancialFit(option,position){
  const p=option.player;
  const asking=option.asking||0;
  const wage=expectedTransferWage(p,state.club);
  const perNeed=Math.max(1,recruitmentBudgetPerNeed(position));
  const dofRating=state.staff?.dof?.rating||65;
  const dofWeight=clamp((dofRating-60)/35,0.15,1);
  const current=typeof userSCRSnapshot==="function"?userSCRSnapshot():null;
  const projected=current&&typeof projectSCRAfterSigning==="function"
    ?projectSCRAfterSigning(p,asking,wage,4)
    :null;

  let score=0;

  // Budget planning: small premium for staying near/below the position's share;
  // increasingly strong penalty for consuming multiple positions' budget.
  const budgetRatio=asking/perNeed;
  if(budgetRatio<=0.75) score+=5;
  else if(budgetRatio<=1.05) score+=2;
  else score-=Math.min(22,(budgetRatio-1)*15);

  if(projected&&current){
    const worsening=(projected.ratio-current.ratio)*100;
    if(projected.ratio>current.limit){
      score-=Math.max(3,worsening*(1.3+2.2*dofWeight));
    }else if(projected.headroom>=0){
      score+=2*dofWeight;
    }

    // When already in breach the DoF strongly favours lower annual-cost,
    // higher-upside investments. The manager still cares more about immediate level.
    if(current.ratio>current.limit){
      score-=Math.max(0,worsening)*(1+2.5*dofWeight);
      if(p.age<=23 && (p.potential||p.overall)>p.overall) score+=4*dofWeight;
    }
  }

  if(p.age<=22 && (p.potential||0)>=p.overall+4) score+=2.5*dofWeight;
  return score;
}

function buildManagerShortlist(position,role="starter"){
  const rawPool=realisticManagerTargetPool(position,40);
  if(!rawPool.length) return [];
  const affordable=rawPool.filter(x=>(x.asking||0)<=Math.max(0,state.budget||0));
  if(!affordable.length) return [];
  const pool=affordable;

  const need=evaluateSquadNeeds(state.club).find(n=>n.position===position);
  const standards=need?.standards || managerPositionStandard(position);
  const currentStarter=need?.starter||standards.starter||70;

  const roleFloor =
    role==="starter" ? Math.max(currentStarter-1,standards.starter-2) :
    role==="competition" ? Math.max(standards.competition-3,currentStarter-5) :
    role==="prospect" ? 58 :
    Math.max(standards.backup-4,64);

  const roleCeiling =
    role==="prospect" ? Math.max(72,currentStarter-5) :
    role==="backup" ? Math.max(roleFloor+8,currentStarter-2) :
    role==="competition" ? Math.max(roleFloor+6,currentStarter+1) :
    99;

  const rolePool=pool.filter(x=>{
    const o=x.player.overall||0;
    if(role==="starter") return o>=roleFloor;
    if(role==="competition") return o>=roleFloor && o<=roleCeiling;
    if(role==="prospect"){
      const potential=x.player.potential||o;
      return x.player.age<=22 && o>=roleFloor && o<=roleCeiling && potential>=Math.max(standards.competition,currentStarter-2);
    }
    return o>=roleFloor && o<=roleCeiling;
  });

  const usable=rolePool.length?rolePool:pool;

  // Option 1: ideal for the REQUESTED ROLE, not simply best player available.
  const ideal=[...usable].sort((a,b)=>{
    const oa=a.player.overall||0, ob=b.player.overall||0;
    let scoreA=(oa*2.5)+(a.interest*.18)+(a.player.potential||oa)*.18-(a.asking/1e6*.08)+recruitmentFinancialFit(a,position);
    let scoreB=(ob*2.5)+(b.interest*.18)+(b.player.potential||ob)*.18-(b.asking/1e6*.08)+recruitmentFinancialFit(b,position);

    // Backups should not be overqualified; prospects are scored primarily on upside.
    if(role==="backup"){
      scoreA-=Math.max(0,oa-currentStarter+1)*1.4;
      scoreB-=Math.max(0,ob-currentStarter+1)*1.4;
    }
    if(role==="prospect"){
      scoreA+=(a.player.potential||oa)*1.5-a.player.age*1.2;
      scoreB+=(b.player.potential||ob)*1.5-b.player.age*1.2;
    }
    return scoreB-scoreA;
  })[0];

  // Option 2: cheaper alternative, still role-appropriate.
  const cheaper=usable
    .filter(x=>x.player.id!==ideal?.player.id)
    .filter(x=>x.asking<=ideal.asking*.78)
    .sort((a,b)=>{
      const oa=a.player.overall||0, ob=b.player.overall||0;
      return ((ob*2)-(b.asking/1e6*.28)+recruitmentFinancialFit(b,position))-((oa*2)-(a.asking/1e6*.28)+recruitmentFinancialFit(a,position));
    })[0]
    || usable.find(x=>x.player.id!==ideal?.player.id);

  // Option 3: prospect. This can sit below immediate role standard if upside is strong.
  const used=new Set([ideal?.player.id,cheaper?.player.id].filter(Boolean));
  const prospect=pool
    .filter(x=>!used.has(x.player.id))
    .filter(x=>x.player.age<=22)
    .filter(x=>(x.player.potential||x.player.overall)>=Math.max(standards.competition,currentStarter))
    .sort((a,b)=>{
      const pa=a.player.potential||a.player.overall;
      const pb=b.player.potential||b.player.overall;
      return ((pb*2.5)+(b.interest*.15)-(b.asking/1e6*.08)+recruitmentFinancialFit(b,position))-((pa*2.5)+(a.interest*.15)-(a.asking/1e6*.08)+recruitmentFinancialFit(a,position));
    })[0]
    || pool.find(x=>!used.has(x.player.id) && x.player.age<=23);

  const out=[];
  if(ideal) out.push({...ideal,role:role==="prospect"?"Best prospect":"Ideal target"});
  if(cheaper&&!out.some(x=>x.player.id===cheaper.player.id)) out.push({...cheaper,role:role==="prospect"?"Value prospect":"Cheaper alternative"});
  if(prospect&&!out.some(x=>x.player.id===prospect.player.id)) out.push({...prospect,role:"Young prospect"});
  return out.slice(0,3);
}

function managerShortlistForRequest(req){
  return (req.shortlist||[]).map(x=>{
    const p=DB.players.find(pl=>String(pl.id)===String(x.playerId));
    return p?{...x,player:p}:null;
  }).filter(Boolean);
}


function managerPerformanceRecruitmentPressure(){
  if(state.week<8) return 0;
  const pos=typeof clubLeaguePosition==="function"?clubLeaguePosition(state.club):10;
  const target=byClub(state.club)?.target||10;
  const gap=pos-target;

  let pressure=0;
  if(gap>=7) pressure=3;
  else if(gap>=5) pressure=2;
  else if(gap>=3) pressure=1;

  // No transfer spending while badly underperforming increases the manager's
  // sense that the squad needs reinforcement.
  const spent=state.transferFinance?.spent||0;
  if(state.week>=12 && spent<5_000_000 && gap>=4) pressure+=1;

  return pressure;
}

function maybeGenerateManagerSquadRequest(){
  ensureContractState();
  if(!state.staff?.manager) return;

  const manager=state.staff.manager;
  const sq=squad(state.club);
  const needs=evaluateSquadNeeds(state.club);
  const transferWindowOpen=isTransferWindowOpen();
  const performancePressure=managerPerformanceRecruitmentPressure();

  if(!state.managerRequestsByWeek) state.managerRequestsByWeek={};
  const weekKey=typeof currentCalendarWeekKey==="function"?currentCalendarWeekKey():String(state.week);
  const alreadyThisWeek=state.managerRequestsByWeek[weekKey]||0;
  const remainingSlots=Math.max(0,2-alreadyThisWeek);
  if(remainingSlots<=0) return;

  let options=[];

  // Explicit vacancies from sales.
  if(transferWindowOpen){
    (state.managerSquadVacancies||[]).filter(v=>!v.filled).forEach(v=>{
      const shortlist=buildManagerShortlist(v.position,v.role||"starter");
      if(shortlist.length){
        options.push({
          type:"sign",
          position:v.position,
          squadRole:v.role||"starter",
          playerId:shortlist[0].player.id,
          priority:14,
          alternatives:shortlist.slice(1).map(x=>x.player.id),
          shortlist:shortlist.map(x=>({
            playerId:x.player.id,role:x.role,asking:x.asking,interest:x.interest
          })),
          urgency:"critical",
          vacancy:true,
          reason:`A ${v.role||"starter"} replacement is needed after ${v.soldPlayerName}'s departure.`
        });
      }
    });
  }

  // Normal squad assessment.
  if(transferWindowOpen){
    needs.filter(n=>n.role!=="none").forEach(need=>{
      const shortlist=buildManagerShortlist(need.position,need.role);
      if(!shortlist.length) return;

      let priority=
        need.role==="starter" ? 10 :
        need.role==="competition" ? 7 : 4;

      if(need.score>=75) priority+=2;
      if(performancePressure>=2 && need.role!=="backup") priority+=2;

      options.push({
        type:"sign",
        position:need.position,
        squadRole:need.role,
        playerId:shortlist[0].player.id,
        priority,
        alternatives:shortlist.slice(1).map(x=>x.player.id),
        shortlist:shortlist.map(x=>({
          playerId:x.player.id,role:x.role,asking:x.asking,interest:x.interest
        })),
        urgency:need.score>=72?"critical":need.score>=50?"important":"normal",
        reason:need.reason
      });
    });
  }

  // Contract / list-management requests.
  sq.forEach(p=>{
    const c=state.playerContracts[p.id];

    const renewRejectedDay=state.managerRequestRejections?.[`renew-${p.id}`];
    const renewCooling=renewRejectedDay!=null && currentCareerDay()-renewRejectedDay<84;
    if(c && c.endYear<=currentContractSeasonEndYear() && p.overall>=78 && !renewCooling){
      options.push({type:"renew",playerId:p.id,priority:3});
    }

    if(p.age>=29 && p.overall<=74 && state.playerListStatus?.[p.id]!=="Transfer"){
      options.push({type:"transfer",playerId:p.id,priority:2});
    }
  });

  // A recently fulfilled recruitment role is suppressed for 12 weeks unless
  // a fresh explicit vacancy is created later.
  options=options.filter(o=>{
    if(o.type!=="sign") return true;
    const key=`${o.position}-${o.squadRole||"starter"}`;
    const until=state.managerRoleFulfilledUntil?.[key];
    return until==null || currentCareerDay()>=until;
  });

  // Remove duplicate open requests.
  const openRequests=state.managerRequests.filter(r=>!r.resolved);
  options=options.filter(o=>!openRequests.some(r=>{
    if(o.type==="sign"){
      return r.type==="sign" && r.position===o.position && (r.squadRole||"starter")===(o.squadRole||"starter");
    }
    return r.type===o.type && String(r.playerId)===String(o.playerId);
  }));

  const requestThreshold=managerProfileForClub(state.club).recruitmentAggression>=80 ? 22 :
    managerProfileForClub(state.club).recruitmentAggression>=65 ? 28 : 34;
  options=options.filter(o=>o.type!=="sign" || o.priority>=requestThreshold/4 || o.vacancy);

  if(!options.length) return;

  // Deterministic manager appetite: some weeks one request, some weeks two.
  // Aggressive/high-pressure situations make two more likely.
  const managerProfile=managerProfileForClub(state.club);
  let maxRequests=managerProfile.recruitmentAggression>=82 ? 2 : 1;
  const unresolvedRecruitment=openRequests.filter(r=>r.type==="sign").length;
  const majorNeeds=needs.filter(n=>n.role==="starter" && n.score>=60).length;
  const overhaulPressure=performancePressure>=2 || majorNeeds>=2 || (state.managerSquadVacancies||[]).filter(v=>!v.filled).length>=2;

  if(overhaulPressure && remainingSlots>=2){
    maxRequests=2;
  }else if(remainingSlots>=2 && Math.random()<0.28){
    maxRequests=2;
  }

  maxRequests=Math.min(maxRequests,remainingSlots);

  for(let requestIndex=0;requestIndex<maxRequests;requestIndex++){
    if(!options.length) break;

    // Prioritise starter > competition > backup when scores are comparable.
    options.sort((a,b)=>{
      const roleWeight=r=>r==="starter"?12:r==="competition"?7:r==="backup"?3:0;
      const scoreA=(a.priority||0)+roleWeight(a.squadRole);
      const scoreB=(b.priority||0)+roleWeight(b.squadRole);
      return scoreB-scoreA;
    });

    const pick=options.shift();
    const p=DB.players.find(x=>String(x.id)===String(pick.playerId));
    if(!p) continue;

    if(!state.managerRequestCooldowns) state.managerRequestCooldowns={};
    const cooldownKey=pick.type==="sign"
      ? `sign-${pick.position}-${pick.squadRole||"starter"}`
      : `${pick.type}-${p.id}`;

    const lastDay=state.managerRequestCooldowns[cooldownKey];
    if(lastDay!=null && currentCareerDay()-lastDay<14) continue;
    state.managerRequestCooldowns[cooldownKey]=currentCareerDay();

    const id="mr"+Date.now()+Math.floor(Math.random()*1000)+requestIndex;
    const req={
      id,
      type:pick.type,
      playerId:p.id,
      position:pick.position||null,
      squadRole:pick.squadRole||null,
      alternatives:pick.alternatives||[],
      shortlist:pick.shortlist||[],
      urgency:pick.urgency||null,
      reason:pick.reason||null,
      resolved:false,
      manager:manager.name
    };

    state.managerRequests.push(req);
    state.managerRequestsByWeek[weekKey]=(state.managerRequestsByWeek[weekKey]||0)+1;

    let wording;
    if(pick.type==="sign"){
      const roleLabel={
        starter:"new starting",
        competition:"new first-team competition",
        backup:"new backup",
        prospect:"young prospect"
      }[pick.squadRole] || "new";

      wording=`${manager.name} wants a ${roleLabel} ${positionLabel(pick.position)} for the ${managerFormationForClub(state.club)}. A three-player shortlist is ready for review.${pick.reason?` ${pick.reason}`:""}`;
    }else if(pick.type==="renew"){
      wording=`${manager.name} wants the club to open contract talks with ${p.name}.`;
    }else if(pick.type==="transfer"){
      wording=`${manager.name} recommends placing ${p.name} on the transfer list.`;
    }else{
      wording=`${manager.name} recommends making ${p.name} available for loan.`;
    }

    state.news.unshift({week:state.week,date:currentGameDateISO(),text:wording,requestId:id});

    // Prevent a second request for the exact same positional role in same week.
    options=options.filter(o=>!(
      o.type==="sign" &&
      o.position===pick.position &&
      (o.squadRole||"starter")===(pick.squadRole||"starter")
    ));
  }
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
    if(req.type==="renew"){
      if(!state.managerRequestRejections) state.managerRequestRejections={};
      state.managerRequestRejections[`renew-${req.playerId}`]=currentCareerDay();
    }
    if(req.type!=="sign") state.managerBacking=clamp((state.managerBacking||70)-3,0,100);
    if(req.type==="sign"){
      recordManagerTransferChoice(false);
      if(!state.managerDepthRequestRejections) state.managerDepthRequestRejections=[];
      state.managerDepthRequestRejections.push({
        id:`mdr${Date.now()}${Math.floor(Math.random()*1000)}`,
        requestId:req.id,
        position:req.position,
        squadRole:req.squadRole||"backup",
        manager:req.manager,
        rejectedDay:currentCareerDay(),
        complaintRaised:false
      });
      state.managerDepthRequestRejections=state.managerDepthRequestRejections.slice(-20);
    }
    addNews(`You rejected ${req.manager}'s recommendation regarding ${p.name}.`);
  }

  saveGame(false);
  renderInbox();
  renderDashboard();
}


function clubStarPlayers(club=state.club){
  return squad(club)
    .slice()
    .sort((a,b)=>(b.overall||0)-(a.overall||0) || (b.value||0)-(a.value||0))
    .slice(0,5);
}

function isClubStarPlayer(player,club=state.club){
  if(!player) return false;
  return clubStarPlayers(club).some(p=>String(p.id)===String(player.id));
}

function recordStarSale(player,fee,fairValue,yearsAtClub=1,context={}){
  const wasStar=context.wasStar ?? isClubStarPlayer(player,state.club);
  if(!wasStar) return;

  let fanHit=-3;
  if(yearsAtClub>=4) fanHit-=2;
  if(fee<fairValue*0.9) fanHit-=3;
  else if(fee>=fairValue*1.15) fanHit+=2;

  const current=context.currentSCR ?? (typeof userSCRSnapshot==="function"?userSCRSnapshot():null);
  const projected=context.projectedSCR ?? (current&&typeof projectSCRAfterSale==="function"?projectSCRAfterSale(player,fee):null);
  const forcedByRegulation=Boolean(
    current && projected &&
    current.ratio>current.limit &&
    projected.ratio<current.ratio-0.005
  );

  if(forcedByRegulation){
    // Fans and manager remain disappointed, but understand that the CEO is
    // solving a genuine regulatory problem rather than selling by choice.
    fanHit=Math.max(-2,Math.round(fanHit*0.35));
  }

  if(typeof stakeholderChange==="function"){
    stakeholderChange("fans",fanHit,
      forcedByRegulation?`Necessary SCR-driven sale of star player ${player.name}`:`Sale of star player ${player.name}`,
      {notify:true}
    );

    if(forcedByRegulation){
      stakeholderChange("manager",-1,`Key player ${player.name} sold to improve SCR compliance`,{notify:true});
      stakeholderChange("owners",projected.ratio<=current.limit?+5:+3,`Sale of ${player.name} improves financial compliance`,{notify:true});
      addNews(`FINANCIAL CONTEXT: Supporters and the manager are disappointed to lose ${player.name}, but recognise that the sale materially improves the club's SCR position.`);
    }else{
      if(fee>=fairValue*1.15) stakeholderChange("owners",1,`Strong fee received for ${player.name}`,{notify:true});
      else if(fee<fairValue*0.9) stakeholderChange("owners",-2,`Poor value received for ${player.name}`,{notify:true});
    }
  }else{
    if(!state.transferSentiment) state.transferSentiment={fans:[],owners:[],players:[],manager:[]};
    state.transferSentiment.fans.push({label:`Sale of star player ${player.name}`,value:fanHit});
  }
}

function recordMarqueeSigning(player){
  if(typeof stakeholderDecision==="function"){
    stakeholderDecision({fans:5,players:1},`Marquee signing: ${player.name}`,{notify:true});
  }else{
    if(!state.transferSentiment) state.transferSentiment={fans:[],owners:[],players:[],manager:[]};
    state.transferSentiment.fans.push({label:`Marquee signing: ${player.name}`,value:5});
  }
}

function recordManagerTransferChoice(backedManager){
  const scr=typeof userSCRSnapshot==="function"?userSCRSnapshot():null;
  const constrained=Boolean(scr && scr.ratio>scr.limit);
  const backingDelta=backedManager?8:(constrained?-2:-6);
  state.managerBacking=clamp((state.managerBacking??70)+backingDelta,0,100);

  if(typeof stakeholderChange==="function"){
    stakeholderChange(
      "manager",
      backedManager?4:(constrained?-1:-4),
      backedManager
        ?"Backed manager's transfer target"
        :constrained
          ?"Transfer target rejected because of SCR pressure"
          :"Rejected manager's preferred target",
      {notify:true}
    );
  }else{
    if(!state.transferSentiment) state.transferSentiment={fans:[],owners:[],players:[],manager:[]};
    state.transferSentiment.manager.push({
      label:backedManager?"Backed manager's transfer target":"Rejected manager's preferred target",
      value:backedManager?4:(constrained?-1:-4)
    });
  }
}


function contractNegotiationKey(playerId,type="renewal"){
  return `${type}-${playerId}`;
}

function initialiseContractNegotiation(player,type="renewal",baseDemand=null){
  ensureContractState();
  const key=contractNegotiationKey(player.id,type);
  const existing=state.contractNegotiations[key];
  if(existing?.active) return existing;

  const demand=Math.max(1000,baseDemand??(
    type==="renewal"?playerContractDemand(player):expectedTransferWage(player,state.club)
  ));

  const negotiation={
    active:true,
    type,
    playerId:player.id,
    openingDemand:demand,
    currentDemand:demand,
    minimumAcceptable:Math.round((demand*(0.96+stablePlayerTrait(player,`contract-floor-${type}`)*0.025))/1000)*1000,
    preferredYears:type==="renewal"
      ? ((player.age||25)<=28?4:(player.age||25)>=31?2:3)
      : ((player.age||25)<=29?4:3),
    lastOfferWage:null,
    lastOfferYears:null,
    rejectedOffers:[],
    round:0
  };

  state.contractNegotiations[key]=negotiation;
  return negotiation;
}

function getContractNegotiation(player,type="renewal"){
  return state.contractNegotiations?.[contractNegotiationKey(player.id,type)]||null;
}

function clearContractNegotiation(player,type="renewal"){
  if(state.contractNegotiations) delete state.contractNegotiations[contractNegotiationKey(player.id,type)];
}

function contractTermsDecision(player,wage,years,type="renewal"){
  const baseDemand=type==="renewal"?playerContractDemand(player):expectedTransferWage(player,state.club);
  const n=initialiseContractNegotiation(player,type,baseDemand);
  wage=Math.max(1000,Number(wage||0));
  years=Math.max(1,Number(years||1));

  const sameRejected=n.rejectedOffers.some(x=>x.wage===wage && x.years===years);
  if(sameRejected){
    return {
      accepted:false,
      repeated:true,
      demand:n.currentDemand,
      message:`These exact terms have already been rejected. The player's position has not changed.`
    };
  }

  n.round+=1;
  n.lastOfferWage=wage;
  n.lastOfferYears=years;

  const age=player.age||25;
  let required=n.currentDemand;

  // The displayed demand is now a genuine demand. If the CEO meets it on the
  // player's preferred term, the deal is accepted — no hidden dice roll.
  // Contract length can trade against salary in a predictable way.
  if(years>n.preferredYears && age<=29) required*=0.97;
  else if(years>n.preferredYears && age>=31) required*=1.035;
  else if(years<n.preferredYears && age<=28) required*=1.025;

  required=Math.max(n.minimumAcceptable,Math.round(required/1000)*1000);

  // Once the user meets the current genuine demand, acceptance is deterministic.
  if(wage>=required){
    return {
      accepted:true,
      demand:required,
      message:`Terms accepted at ${money(wage)}/wk for ${years} year${years===1?"":"s"}.`
    };
  }

  n.rejectedOffers.push({wage,years,round:n.round});
  n.rejectedOffers=n.rejectedOffers.slice(-8);

  // The agent counters logically. A good offer can narrow the gap slightly;
  // repeated low offers do not randomly improve the user's chances.
  const gap=Math.max(0,required-wage);
  const closeOffer=wage>=required*0.93;
  const concession=closeOffer?Math.min(gap*.25,required*.0125):0;
  let counter=Math.max(n.minimumAcceptable,required-concession);
  counter=Math.round(counter/1000)*1000;
  n.currentDemand=Math.max(n.minimumAcceptable,counter);

  return {
    accepted:false,
    repeated:false,
    demand:n.currentDemand,
    message:closeOffer
      ? `Offer rejected. The agent has moved slightly and now wants ${money(n.currentDemand)}/wk.`
      : `Offer rejected. The agent is holding at around ${money(n.currentDemand)}/wk.`
  };
}

function beginContractNegotiation(id){
  ensureContractState();
  const p=DB.players.find(x=>String(x.id)===String(id));
  if(!p) return;
  const current=state.playerContracts[p.id];
  const breakdown=playerContractDemandBreakdown(p);
  const n=initialiseContractNegotiation(p,"renewal",breakdown.demand);
  const demand=n.currentDemand;

  q("contractWageInput").value=Math.max(current.wage,demand);
  q("contractYearsInput").value=String(n.preferredYears||3);
  q("contractDemandText").textContent=`Agent demand: ${money(demand)}/wk • Preferred term: ${n.preferredYears} year${n.preferredYears===1?"":"s"} • ${breakdown.reasons.join(" • ")}.`;
  q("contractNegotiation").dataset.playerId=p.id;
  q("contractNegotiation").classList.remove("hide");
  renderContractSCRPreview(p);
}

function submitContractOffer(){
  const id=q("contractNegotiation")?.dataset.playerId;
  const p=DB.players.find(x=>String(x.id)===String(id));
  if(!p) return;

  const wage=Number(q("contractWageInput").value||0);
  const years=Number(q("contractYearsInput").value||1);
  const decision=contractTermsDecision(p,wage,years,"renewal");

  if(decision.accepted){
    state.playerContracts[p.id]={
      wage,
      endYear:currentSeasonStartYear()+years
    };
    if(typeof restructureRegulatedAcquisitionOnExtension==="function") restructureRegulatedAcquisitionOnExtension(p,years);
    state.playerMorale[p.id]=state.playerMorale[p.id]==="Wants to leave"?"Unhappy":"Happy";
    clearContractNegotiation(p,"renewal");
    addNews(`${p.name} has signed a new ${years}-year contract worth ${money(wage)}/week.`);
    q("contractNegotiation").classList.add("hide");
    saveGame(false);
    openPlayerProfile(p.id);
    renderSquad();
    renderFinances();
  }else{
    addNews(`${p.name}'s representatives rejected your contract offer.`);
    q("contractDemandText").textContent=`${decision.message} Repeating rejected terms will not change the player's decision.`;
    renderContractSCRPreview(p);
    saveGame(false);
  }
}

function toggleTransferList(id){
  ensureContractState();
  if(!state.transferListingMeta) state.transferListingMeta={};

  const current=state.playerListStatus[id]||"None";
  const listing=current!=="Transfer";
  setPlayerListStatus(id,listing?"Transfer":"None");

  if(listing){
    state.transferListingMeta[id]={
      listedDay:typeof currentCareerDay==="function"?currentCareerDay():0,
      lastMarketCheckDay:null,
      failedChecks:0
    };
    const p=DB.players.find(x=>String(x.id)===String(id));
    if(p) addNews(`${p.name} has been placed on the transfer list. Recruitment staff will actively circulate his availability to other clubs.`);
  }else{
    delete state.transferListingMeta[id];
  }

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
  return financialProfileForClub(club).revenue;
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

  // AI clubs use an abstract annual acquisition cost. User-club accounting is
  // more detailed, but AI clubs still face the same broad regulatory pressure.
  const positiveNetSpend=Math.max(0,aiNetTransferSpend(club)+extraFee);
  const transferCommitment=positiveNetSpend*0.20;
  const inheritedBurden=(financialProfileForClub(club).revenue*financialProfileForClub(club).startingRatio)-annualWages;
  return annualWages+Math.max(0,inheritedBurden)+transferCommitment;
}

function aiSCRRatio(club,extraFee=0,extraWeeklyWage=0){
  const f=aiFinance(club);
  if(!f || !f.footballRevenue) return 9.99;
  return aiProjectedSquadCost(club,extraFee,extraWeeklyWage)/f.footballRevenue;
}

function aiSCRStatus(club,extraFee=0,extraWeeklyWage=0){
  const ratio=aiSCRRatio(club,extraFee,extraWeeklyWage);
  if(ratio<=0.60) return "Healthy";
  if(ratio<=0.70) return "Tight";
  if(ratio<=0.80) return "Breach";
  return "Severe";
}

function aiSCRHeadroom(club){
  const f=aiFinance(club);
  if(!f) return 0;
  return Math.max(0,f.footballRevenue*0.70-aiProjectedSquadCost(club));
}

function aiCanAffordTransfer(club,fee,weeklyWage){
  const f=aiFinance(club);
  if(!f) return {ok:false,reason:"No finance data"};

  if(f.transferBudget<fee) return {ok:false,reason:"Transfer budget"};
  if(f.weeklyWages+weeklyWage>f.wageBudget) return {ok:false,reason:"Wage budget"};

  const projectedRatio=aiSCRRatio(club,fee,weeklyWage);
  if(projectedRatio>0.82) return {ok:false,reason:"Financial regulation breach"};
  const tolerance=Math.min(0.78,Math.max(0.68,f.scrComfort*0.78));
  if(projectedRatio>tolerance) return {ok:false,reason:"Owner financial-regulation tolerance"};

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



/* --------------------------------------------------------------------------
   Football CEO Financial Regulations — v0.16
   --------------------------------------------------------------------------
   A game-wide squad-cost framework inspired by real football regulation.
   It is intentionally not presented as UEFA/PSR accounting.

   Hybrid model:
   - every starting club has a calibrated starting ratio;
   - pre-save transfer/accounting commitments are represented by an inherited
     legacy burden distributed across the starting squad;
   - transfers completed after the save begins are tracked individually using
     fee + estimated agent cost spread over the player's contract;
   - annual wages remain live and therefore contract changes immediately affect SCR.
   -------------------------------------------------------------------------- */

const FINANCIAL_REGULATION_PROFILES={
  "Arsenal":{revenue:550_000_000,startingRatio:0.64,sponsorBaseline:40_000_000},
  "Aston Villa":{revenue:330_000_000,startingRatio:0.79,sponsorBaseline:28_000_000},
  "Bournemouth":{revenue:180_000_000,startingRatio:0.57,sponsorBaseline:13_000_000},
  "Brentford":{revenue:190_000_000,startingRatio:0.53,sponsorBaseline:15_000_000},
  "Brighton":{revenue:220_000_000,startingRatio:0.60,sponsorBaseline:18_000_000},
  "Burnley":{revenue:155_000_000,startingRatio:0.61,sponsorBaseline:11_000_000},
  "Chelsea":{revenue:500_000_000,startingRatio:0.73,sponsorBaseline:36_000_000},
  "Crystal Palace":{revenue:205_000_000,startingRatio:0.62,sponsorBaseline:17_000_000},
  "Everton":{revenue:230_000_000,startingRatio:0.68,sponsorBaseline:20_000_000},
  "Fulham":{revenue:210_000_000,startingRatio:0.59,sponsorBaseline:18_000_000},
  "Leeds United":{revenue:220_000_000,startingRatio:0.69,sponsorBaseline:18_000_000},
  "Liverpool":{revenue:620_000_000,startingRatio:0.61,sponsorBaseline:44_000_000},
  "Manchester City":{revenue:700_000_000,startingRatio:0.58,sponsorBaseline:52_000_000},
  "Manchester United":{revenue:650_000_000,startingRatio:0.69,sponsorBaseline:46_000_000},
  "Newcastle United":{revenue:380_000_000,startingRatio:0.78,sponsorBaseline:30_000_000},
  "Nottingham Forest":{revenue:230_000_000,startingRatio:0.71,sponsorBaseline:18_000_000},
  "Sunderland":{revenue:175_000_000,startingRatio:0.63,sponsorBaseline:13_000_000},
  "Tottenham Hotspur":{revenue:560_000_000,startingRatio:0.61,sponsorBaseline:40_000_000},
  "West Ham United":{revenue:290_000_000,startingRatio:0.66,sponsorBaseline:24_000_000},
  "Wolverhampton Wanderers":{revenue:210_000_000,startingRatio:0.69,sponsorBaseline:17_000_000}
};

function financialProfileForClub(club){
  const c=byClub(club);
  return FINANCIAL_REGULATION_PROFILES[club]||{
    revenue:Math.round((110_000_000+Math.max(0,(c?.reputation||70)-65)*7_000_000)/1_000_000)*1_000_000,
    startingRatio:0.64,
    sponsorBaseline:14_000_000
  };
}

function financialRegulationLimitForDivision(division="Premier League"){
  const d=String(division||"").toLowerCase();
  if(d.includes("champ")) return 0.80;
  if(d.includes("league one")||d.includes("league 1")) return 0.90;
  if(d.includes("league two")||d.includes("league 2")) return 0.90;
  return 0.70;
}

function regulatedAnnualPayroll(club=state.club){
  const players=DB.players.filter(p=>p.club===club);
  const playerWages=players.reduce((sum,p)=>{
    const weekly=club===state.club?(state.playerContracts?.[p.id]?.wage??p.wage??0):(p.wage||0);
    return sum+weekly*52;
  },0);

  if(club!==state.club) return playerWages;
  const footballStaff=[
    state.staff?.manager?.wage||0,
    state.staff?.dof?.wage||0,
    state.staff?.physio?.wage||0
  ].reduce((a,b)=>a+b,0)*52;
  return playerWages+footballStaff;
}

function distributeLegacyRegulatedCost(club,total){
  const players=DB.players.filter(p=>p.club===club);
  const weights=players.map(p=>{
    const annualWage=(state.playerContracts?.[p.id]?.wage??p.wage??0)*52;
    const value=p.value||0;
    return {id:p.id,weight:Math.max(1,value*.55+annualWage*2.5)};
  });
  const sum=weights.reduce((s,x)=>s+x.weight,0)||1;
  const out={};
  weights.forEach(x=>out[x.id]=Math.round(total*(x.weight/sum)));
  return out;
}

function ensureFinancialRegulationState(){
  if(!state) return null;
  const profile=financialProfileForClub(state.club);
  if(!state.financialRegulations){
    const c=byClub(state.club);
    const maxInvestment=Math.round(((c?.transferBudget||40_000_000)*1.25)/250000)*250000;
    state.financialRegulations={
      version:1,
      division:"Premier League",
      baseRevenue:profile.revenue,
      sponsorBaseline:profile.sponsorBaseline,
      startingRatio:profile.startingRatio,
      legacyPlayerCosts:{},
      newAcquisitions:{},
      availableInvestment:maxInvestment,
      pendingTransferBudget:Math.min(maxInvestment,state.budget??c?.transferBudget??maxInvestment),
      budgetPlanSeason:null,
      assessmentHistory:[],
      consecutiveBreaches:0,
      nextInvestmentMultiplier:1,
      transferBanSeason:null,
      calibrated:false
    };
  }

  const fr=state.financialRegulations;
  if(fr.version==null) fr.version=1;
  if(!fr.division) fr.division="Premier League";
  if(fr.baseRevenue==null) fr.baseRevenue=profile.revenue;
  if(fr.sponsorBaseline==null) fr.sponsorBaseline=profile.sponsorBaseline;
  if(fr.startingRatio==null) fr.startingRatio=profile.startingRatio;
  if(!fr.legacyPlayerCosts) fr.legacyPlayerCosts={};
  if(!fr.newAcquisitions) fr.newAcquisitions={};
  if(!Array.isArray(fr.assessmentHistory)) fr.assessmentHistory=[];
  if(fr.consecutiveBreaches==null) fr.consecutiveBreaches=0;
  if(fr.nextInvestmentMultiplier==null) fr.nextInvestmentMultiplier=1;
  if(fr.transferBanSeason===undefined) fr.transferBanSeason=null;

  if(fr.availableInvestment==null){
    const c=byClub(state.club);
    fr.availableInvestment=Math.round(((c?.transferBudget||40_000_000)*1.25)/250000)*250000;
  }
  if(fr.pendingTransferBudget==null) fr.pendingTransferBudget=Math.min(fr.availableInvestment,state.budget||fr.availableInvestment);

  if(!fr.calibrated){
    const targetCost=fr.baseRevenue*fr.startingRatio;
    const payroll=regulatedAnnualPayroll(state.club);
    const inherited=Math.max(0,targetCost-payroll);
    fr.legacyPlayerCosts=distributeLegacyRegulatedCost(state.club,inherited);
    fr.calibrated=true;
  }
  return fr;
}

function baselineSponsorForSCR(){
  const fr=ensureFinancialRegulationState();
  return fr?.sponsorBaseline||0;
}

function userFootballRevenue(){
  const fr=ensureFinancialRegulationState();
  if(!fr) return 1;

  // Base revenue represents the inherited football business at save start.
  // Sponsorship changes then move revenue relative to the club's calibrated baseline.
  const sponsorValue=state.sponsorship?.annualValue??fr.sponsorBaseline;
  const sponsorDelta=sponsorValue-fr.sponsorBaseline;

  // Matchday pricing/supporter sentiment can grow or shrink annual revenue.
  // The baseline is captured once from the starting pricing model.
  let matchdayDelta=0;
  if(typeof projectedMatchday==="function"){
    const annualProjected=projectedMatchday().revenue*19;
    if(fr.baselineMatchdayRevenue==null) fr.baselineMatchdayRevenue=annualProjected;
    matchdayDelta=annualProjected-fr.baselineMatchdayRevenue;
  }

  const competitionRevenue=fr.competitionRevenue||0; // future Europe/cups hook
  const otherAdjustments=fr.otherRevenueAdjustments||0;
  return Math.max(20_000_000,Math.round(fr.baseRevenue+sponsorDelta+matchdayDelta+competitionRevenue+otherAdjustments));
}

function userLegacyRegulatedCost(){
  const fr=ensureFinancialRegulationState();
  if(!fr) return 0;
  const currentIds=new Set(DB.players.filter(p=>p.club===state.club).map(p=>String(p.id)));
  return Object.entries(fr.legacyPlayerCosts||{}).reduce((sum,[id,cost])=>currentIds.has(String(id))?sum+(cost||0):sum,0);
}

function userNewAcquisitionCost(){
  const fr=ensureFinancialRegulationState();
  if(!fr) return 0;
  const currentIds=new Set(DB.players.filter(p=>p.club===state.club).map(p=>String(p.id)));
  return Object.entries(fr.newAcquisitions||{}).reduce((sum,[id,x])=>{
    if(!currentIds.has(String(id)) || (x.yearsRemaining??0)<=0) return sum;
    return sum+(x.annualAmortisation||0)+(x.annualAgentCost||0);
  },0);
}

function userProjectedSquadCost(){
  return regulatedAnnualPayroll(state.club)+userLegacyRegulatedCost()+userNewAcquisitionCost();
}

function financialRegulationStatus(ratio,limit=financialRegulationLimitForDivision(ensureFinancialRegulationState()?.division)){
  if(ratio<=0.60) return "Healthy";
  if(ratio<=limit) return "Tight";
  if(ratio<=0.80) return "Breach";
  return "Severe";
}

function userSCRSnapshot(){
  const fr=ensureFinancialRegulationState();
  const revenue=userFootballRevenue();
  const payroll=regulatedAnnualPayroll(state.club);
  const inherited=userLegacyRegulatedCost();
  const acquisitions=userNewAcquisitionCost();
  const squadCost=payroll+inherited+acquisitions;
  const ratio=revenue>0?squadCost/revenue:0;
  const limit=financialRegulationLimitForDivision(fr?.division);
  const headroom=revenue*limit-squadCost;

  return {
    revenue,squadCost,ratio,limit,
    status:financialRegulationStatus(ratio,limit),
    headroom,
    greenHeadroom:headroom, // backward-compatible property
    payroll,
    inherited,
    acquisitions,
    compliant:ratio<=limit
  };
}

function estimatedAgentCost(fee){
  return Math.round((Math.max(0,fee)*0.05)/250000)*250000;
}

function projectSCRAfterSigning(player,fee,weeklyWage,years=4){
  const current=userSCRSnapshot();
  years=Math.max(1,Number(years||4));
  const annualTransfer=(Math.max(0,fee)+estimatedAgentCost(fee))/years;
  const annualWage=Math.max(0,weeklyWage||0)*52;
  const squadCost=current.squadCost+annualTransfer+annualWage;
  return {
    ...current,
    currentRatio:current.ratio,
    ratio:squadCost/current.revenue,
    squadCost,
    annualImpact:annualTransfer+annualWage,
    annualTransfer,
    annualWage,
    status:financialRegulationStatus(squadCost/current.revenue,current.limit),
    headroom:current.revenue*current.limit-squadCost
  };
}

function regulatedPlayerAnnualCost(player){
  const fr=ensureFinancialRegulationState();
  if(!player||!fr) return 0;
  const wage=(state.playerContracts?.[player.id]?.wage??player.wage??0)*52;
  const legacy=fr.legacyPlayerCosts?.[player.id]||0;
  const acq=fr.newAcquisitions?.[player.id];
  const newCost=acq?(acq.annualAmortisation||0)+(acq.annualAgentCost||0):0;
  return wage+legacy+newCost;
}

function projectSCRAfterSale(player,fee=0){
  const current=userSCRSnapshot();
  const saving=regulatedPlayerAnnualCost(player);
  const squadCost=Math.max(0,current.squadCost-saving);
  return {
    ...current,
    currentRatio:current.ratio,
    ratio:squadCost/current.revenue,
    squadCost,
    annualSaving:saving,
    status:financialRegulationStatus(squadCost/current.revenue,current.limit),
    headroom:current.revenue*current.limit-squadCost
  };
}

function registerRegulatedSigning(player,fee,weeklyWage,years=4){
  const fr=ensureFinancialRegulationState();
  if(!fr||!player) return;
  years=Math.max(1,Number(years||4));
  const agentCost=estimatedAgentCost(fee);
  fr.newAcquisitions[player.id]={
    playerId:player.id,
    playerName:player.name,
    fee:Math.max(0,fee||0),
    agentCost,
    originalYears:years,
    yearsRemaining:years,
    annualAmortisation:Math.max(0,fee||0)/years,
    annualAgentCost:agentCost/years,
    signedSeason:typeof currentSeasonStartYear==="function"?currentSeasonStartYear():2025
  };
  delete fr.legacyPlayerCosts[player.id];
}

function registerRegulatedSale(player){
  const fr=ensureFinancialRegulationState();
  if(!fr||!player) return;
  delete fr.legacyPlayerCosts[player.id];
  delete fr.newAcquisitions[player.id];
}

function restructureRegulatedAcquisitionOnExtension(player,newYears){
  const fr=ensureFinancialRegulationState();
  const acq=fr?.newAcquisitions?.[player?.id];
  if(!acq) return;
  newYears=Math.max(1,Number(newYears||1));
  const remainingTransfer=(acq.annualAmortisation||0)*Math.max(1,acq.yearsRemaining||1);
  const remainingAgent=(acq.annualAgentCost||0)*Math.max(1,acq.yearsRemaining||1);
  acq.yearsRemaining=newYears;
  acq.annualAmortisation=remainingTransfer/newYears;
  acq.annualAgentCost=remainingAgent/newYears;
}

function projectSCRAfterContractRenewal(player,newWeeklyWage,newYears){
  const current=userSCRSnapshot();
  if(!player) return current;

  const oldWeekly=(state.playerContracts?.[player.id]?.wage??player.wage??0);
  const wageDelta=(Math.max(0,newWeeklyWage||0)-oldWeekly)*52;

  let acquisitionDelta=0;
  const fr=ensureFinancialRegulationState();
  const acq=fr?.newAcquisitions?.[player.id];
  if(acq){
    const years=Math.max(1,Number(newYears||1));
    const remainingTransfer=(acq.annualAmortisation||0)*Math.max(1,acq.yearsRemaining||1);
    const remainingAgent=(acq.annualAgentCost||0)*Math.max(1,acq.yearsRemaining||1);
    const currentAnnual=(acq.annualAmortisation||0)+(acq.annualAgentCost||0);
    const newAnnual=(remainingTransfer+remainingAgent)/years;
    acquisitionDelta=newAnnual-currentAnnual;
  }

  const squadCost=Math.max(0,current.squadCost+wageDelta+acquisitionDelta);
  const ratio=squadCost/current.revenue;
  return {
    ...current,
    currentRatio:current.ratio,
    ratio,
    squadCost,
    annualImpact:wageDelta+acquisitionDelta,
    wageDelta,
    acquisitionDelta,
    status:financialRegulationStatus(ratio,current.limit),
    headroom:current.revenue*current.limit-squadCost
  };
}

function renderContractSCRPreview(player){
  const box=q("contractSCRPreview");
  if(!box||!player) return;
  const wage=Number(q("contractWageInput")?.value||0);
  const years=Number(q("contractYearsInput")?.value||1);
  const current=userSCRSnapshot();
  const projected=projectSCRAfterContractRenewal(player,wage,years);
  const impact=projected.annualImpact||0;
  const improves=projected.ratio<current.ratio;

  box.innerHTML=`
    <div class="financial-regulation-preview-head">
      <b>Financial regulation impact</b>
      <span class="scr-mini-status ${projected.ratio<=current.limit?"good":"bad"}">${projected.status}</span>
    </div>
    <div class="financial-regulation-ratios">
      <span>Current <b>${(current.ratio*100).toFixed(1)}%</b></span>
      <span>→</span>
      <span>Projected <b>${(projected.ratio*100).toFixed(1)}%</b></span>
    </div>
    <div class="muted small">
      ${impact===0
        ?"No annual SCR change from these terms."
        :`${money(Math.abs(impact))} annual regulated cost ${impact>0?"added":"removed"}.`}
      ${projected.acquisitionDelta<0?" Longer terms spread the remaining acquisition cost over more years.":""}
      ${current.ratio>current.limit&&improves?" This renewal improves the club's compliance position.":""}
      • Limit: ${Math.round(current.limit*100)}%
    </div>`;
}



function financialTransferBanActive(){
  const fr=ensureFinancialRegulationState();
  if(!fr?.transferBanSeason) return false;
  const season=typeof currentSeasonStartYear==="function"?currentSeasonStartYear():2025;
  return Number(fr.transferBanSeason)===Number(season);
}

function rollFinancialRegulationsSeason(){
  const fr=ensureFinancialRegulationState();
  if(!fr) return;

  // Inherited commitments fade as pre-save contracts/amortisation run off.
  Object.keys(fr.legacyPlayerCosts||{}).forEach(id=>{
    fr.legacyPlayerCosts[id]=Math.round((fr.legacyPlayerCosts[id]||0)*0.76);
    if(fr.legacyPlayerCosts[id]<100_000) delete fr.legacyPlayerCosts[id];
  });

  Object.entries(fr.newAcquisitions||{}).forEach(([id,x])=>{
    x.yearsRemaining=Math.max(0,(x.yearsRemaining??1)-1);
    if(x.yearsRemaining<=0) delete fr.newAcquisitions[id];
  });

  fr.competitionRevenue=0;
  fr.otherRevenueAdjustments=0;
  fr.baselineMatchdayRevenue=null;
  fr.budgetPlanSeason=null;
}

function processFinancialRegulationAssessment(){
  const fr=ensureFinancialRegulationState();
  if(!fr) return null;
  const snap=userSCRSnapshot();
  const season=typeof currentSeasonLabel==="function"?currentSeasonLabel():"Season";
  const result={
    season,
    ratio:snap.ratio,
    limit:snap.limit,
    status:snap.status,
    fine:0,
    investmentMultiplier:1,
    transferBan:false
  };

  if(snap.ratio<=snap.limit){
    fr.consecutiveBreaches=0;
    fr.nextInvestmentMultiplier=1;
    addNews(`FINANCIAL REGULATIONS: ${state.club} passed the annual assessment at ${(snap.ratio*100).toFixed(1)}% against a ${(snap.limit*100).toFixed(0)}% limit.`);
  }else{
    fr.consecutiveBreaches=(fr.consecutiveBreaches||0)+1;
    const repeat=fr.consecutiveBreaches;
    const revenue=snap.revenue;

    if(snap.ratio<=0.75){
      result.status="Warning";
      result.fine=repeat>1?revenue*(0.004*repeat):0;
      result.investmentMultiplier=repeat>1?0.90:1;
    }else if(snap.ratio<=0.85){
      result.status="Breach";
      result.fine=revenue*(0.012+Math.max(0,repeat-1)*0.006);
      result.investmentMultiplier=repeat>=2?0.72:0.85;
      if(repeat>=3) result.transferBan=true;
    }else{
      result.status="Severe";
      result.fine=revenue*(0.025+Math.max(0,repeat-1)*0.010);
      result.investmentMultiplier=repeat>=2?0.55:0.68;
      if(repeat>=2 || snap.ratio>0.90) result.transferBan=true;
    }

    result.fine=Math.round(result.fine/250000)*250000;
    fr.nextInvestmentMultiplier=Math.min(fr.nextInvestmentMultiplier??1,result.investmentMultiplier);

    if(result.fine>0){
      state.seasonPL=(state.seasonPL||0)-result.fine;
    }
    if(result.transferBan){
      fr.transferBanSeason=(typeof currentSeasonStartYear==="function"?currentSeasonStartYear():2025)+1;
    }

    if(typeof stakeholderDecision==="function"){
      stakeholderDecision({
        owners:result.status==="Warning"?-2:result.status==="Breach"?-5:-8,
        sponsors:result.status==="Severe"?-3:result.status==="Breach"?-1:0
      },`Financial regulation ${result.status.toLowerCase()}`,{notify:true});
    }

    const sanctionBits=[
      result.fine?`${money(result.fine)} fine`:null,
      result.investmentMultiplier<1?`${Math.round((1-result.investmentMultiplier)*100)}% reduction to next season's available investment`:null,
      result.transferBan?"next-season transfer registration ban":null
    ].filter(Boolean);

    addNews(`FINANCIAL REGULATIONS: ${state.club} recorded ${(snap.ratio*100).toFixed(1)}% against the ${(snap.limit*100).toFixed(0)}% limit — ${result.status.toUpperCase()}.${sanctionBits.length?` Sanctions: ${sanctionBits.join(" • ")}.`:""}`);
  }

  fr.assessmentHistory.unshift(result);
  fr.assessmentHistory=fr.assessmentHistory.slice(0,8);
  return result;
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


// Calendar-based Premier League transfer-window model.
function transferWindowStatus(dateISO=(typeof currentGameDateISO==="function"?currentGameDateISO():"2025-08-08")){
  const d=parseISODate(dateISO);
  const y=d.getUTCFullYear();
  const md=dateISO.slice(5);

  // Premier League-style game windows. Exact future regulatory dates can be
  // updated later without altering the daily engine.
  const summerStart=`${y}-06-16`;
  const summerEnd=`${y}-09-01`;
  const winterStart=`${y}-01-01`;
  const winterEnd=`${y}-02-02`;

  if(dateISO>=summerStart && dateISO<=summerEnd){
    return {open:true,key:`summer-${y}`,name:"Summer transfer window",deadline:shortGameDate(summerEnd),next:`January ${y+1}`};
  }
  if(dateISO>=winterStart && dateISO<=winterEnd){
    return {open:true,key:`winter-${y}`,name:"January transfer window",deadline:shortGameDate(winterEnd),next:`Summer ${y}`};
  }

  if(md>"09-01"){
    return {open:false,key:`closed-autumn-${y}`,name:"Transfer window closed",deadline:null,next:`January ${y+1}`};
  }
  if(md<"06-16" && md>"02-02"){
    return {open:false,key:`closed-spring-${y}`,name:"Transfer window closed",deadline:null,next:`Summer ${y}`};
  }
  if(md<"01-01" || md>"09-01"){
    return {open:false,key:`closed-${y}`,name:"Transfer window closed",deadline:null,next:`January ${y+1}`};
  }
  return {open:false,key:`closed-${y}`,name:"Transfer window closed",deadline:null,next:`Summer ${y}`};
}

function isTransferWindowOpen(dateISO=(typeof currentGameDateISO==="function"?currentGameDateISO():undefined)){
  return transferWindowStatus(dateISO).open;
}

function transferWindowStatusHTML(){
  const w=transferWindowStatus();
  const banned=typeof financialTransferBanActive==="function" && financialTransferBanActive();
  if(banned) return `<div class="transfer-box" style="border:1px solid #e5c2c2"><b>TRANSFER REGISTRATION BAN</b><br><span class="muted small">Financial-regulation sanctions prevent permanent incoming transfers this season.</span></div>`;
  return `<div class="transfer-box" style="border:1px solid ${w.open?"#b7e3c4":"#e5c2c2"}"><b>${w.open?"TRANSFER WINDOW OPEN":"TRANSFER WINDOW CLOSED"}</b><br><span class="muted small">${w.open?`${w.name} • Deadline: ${w.deadline}`:`Next window: ${w.next}`}</span></div>`;
}

function blockClosedWindow(action="complete this transfer"){
  const incomingAction=!String(action).toLowerCase().includes("respond to");
  if(incomingAction && typeof financialTransferBanActive==="function" && financialTransferBanActive()){
    addNews(`FINANCIAL REGULATIONS: ${action.charAt(0).toUpperCase()+action.slice(1)} is blocked by the club's transfer registration ban.`);
    return true;
  }
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


const MANAGER_FORMATIONS={
  "4-2-3-1":{slots:["GK","RB","CB","CB","LB","DM","DM","RW","AM","LW","ST"]},
  "4-3-3":{slots:["GK","RB","CB","CB","LB","DM","CM","CM","RW","LW","ST"]},
  "4-4-2":{slots:["GK","RB","CB","CB","LB","RM","CM","CM","LM","ST","ST"]},
  "4-2-2-2":{slots:["GK","RB","CB","CB","LB","DM","DM","AM","AM","ST","ST"]},
  "3-4-2-1":{slots:["GK","CB","CB","CB","RM","CM","CM","LM","AM","AM","ST"]},
  "3-4-3":{slots:["GK","CB","CB","CB","RM","CM","CM","LM","RW","LW","ST"]},
  "3-5-2":{slots:["GK","CB","CB","CB","RM","CM","DM","CM","LM","ST","ST"]}
};

// Real-world-inspired manager profiles for the 20 managers in the 2025/26 database.
// Formation, recruitment aggression, youth trust and depth demand currently affect AI.
// Possession, pressing, verticality and flexibility are exposed to the user now and are
// deliberately stored for future player-style recruitment and tactical systems.
const MANAGER_PROFILES={
  "Mikel Arteta":{
    preferredFormation:"4-3-3",alternatives:["4-2-3-1"],
    possession:92,pressing:88,verticality:52,flexibility:78,
    recruitmentAggression:84,youthTrust:68,depthDemand:92,
    summary:"Positional, possession-dominant football with aggressive counter-pressing and elite depth expectations."
  },
  "Unai Emery":{
    preferredFormation:"4-2-3-1",alternatives:["4-4-2","4-2-2-2"],
    possession:68,pressing:74,verticality:76,flexibility:90,
    recruitmentAggression:80,youthTrust:58,depthDemand:82,
    summary:"Highly adaptable, detail-heavy coach who favours a back four, double pivot, central combinations and quick progression."
  },
  "Andoni Iraola":{
    preferredFormation:"4-2-3-1",alternatives:["4-4-2"],
    possession:58,pressing:96,verticality:90,flexibility:70,
    recruitmentAggression:72,youthTrust:72,depthDemand:72,
    summary:"Relentless front-foot pressing, athleticism and rapid vertical attacks."
  },
  "Keith Andrews":{
    preferredFormation:"4-2-3-1",alternatives:["4-4-2"],
    possession:58,pressing:70,verticality:82,flexibility:65,
    recruitmentAggression:65,youthTrust:58,depthDemand:72,
    summary:"Compact and pragmatic, mixing controlled build-up with direct transitions and counter-attacking."
  },
  "Fabian Hürzeler":{
    preferredFormation:"4-2-3-1",alternatives:["3-4-2-1","3-4-3"],
    possession:84,pressing:78,verticality:58,flexibility:90,
    recruitmentAggression:70,youthTrust:86,depthDemand:76,
    summary:"Progressive possession coach with complex rotations, flexible structures and strong trust in younger players."
  },
  "Scott Parker":{
    preferredFormation:"4-2-3-1",alternatives:["4-3-3"],
    possession:76,pressing:62,verticality:48,flexibility:40,
    recruitmentAggression:58,youthTrust:60,depthDemand:70,
    summary:"Structured and organised, favouring controlled possession and a stable double-pivot framework."
  },
  "Enzo Maresca":{
    preferredFormation:"4-3-3",alternatives:["4-2-3-1"],
    possession:94,pressing:84,verticality:42,flexibility:68,
    recruitmentAggression:84,youthTrust:76,depthDemand:92,
    summary:"Highly positional possession football with patient build-up, technical demands and strong squad-depth expectations."
  },
  "Oliver Glasner":{
    preferredFormation:"3-4-2-1",alternatives:["4-2-3-1"],
    possession:50,pressing:84,verticality:82,flexibility:58,
    recruitmentAggression:72,youthTrust:62,depthDemand:78,
    summary:"Back-three specialist built around duels, counter-pressing and incisive transition attacks."
  },
  "David Moyes":{
    preferredFormation:"4-2-3-1",alternatives:["4-3-3"],
    possession:42,pressing:48,verticality:84,flexibility:55,
    recruitmentAggression:65,youthTrust:35,depthDemand:60,
    summary:"Experienced and pragmatic, favouring physical reliability, direct progression and proven senior options."
  },
  "Marco Silva":{
    preferredFormation:"4-2-3-1",alternatives:["4-4-2"],
    possession:62,pressing:62,verticality:76,flexibility:68,
    recruitmentAggression:70,youthTrust:58,depthDemand:74,
    summary:"Purposeful 4-2-3-1 football with progressive passing, wide rotations and balanced pressing."
  },
  "Daniel Farke":{
    preferredFormation:"4-2-3-1",alternatives:["4-3-3"],
    possession:88,pressing:76,verticality:52,flexibility:58,
    recruitmentAggression:68,youthTrust:72,depthDemand:72,
    summary:"Possession-first coach who wants his side to control matches, build patiently and attack from positional superiority."
  },
  "Arne Slot":{
    preferredFormation:"4-2-3-1",alternatives:["4-3-3"],
    possession:80,pressing:84,verticality:74,flexibility:76,
    recruitmentAggression:68,youthTrust:72,depthDemand:86,
    summary:"Controlled possession combined with aggressive pressing and purposeful vertical progression."
  },
  "Pep Guardiola":{
    preferredFormation:"4-3-3",alternatives:["4-2-3-1"],
    possession:99,pressing:94,verticality:48,flexibility:100,
    recruitmentAggression:94,youthTrust:70,depthDemand:96,
    summary:"Extreme positional control, technical quality and tactical fluidity, with exceptionally high squad standards."
  },
  "Ruben Amorim":{
    preferredFormation:"3-4-2-1",alternatives:["3-4-3"],
    possession:82,pressing:90,verticality:64,flexibility:35,
    recruitmentAggression:86,youthTrust:84,depthDemand:84,
    summary:"Committed back-three coach with aggressive pressing, wing-back dependency and strong faith in young players."
  },
  "Eddie Howe":{
    preferredFormation:"4-3-3",alternatives:["4-2-3-1","4-4-2"],
    possession:64,pressing:92,verticality:86,flexibility:80,
    recruitmentAggression:82,youthTrust:66,depthDemand:88,
    summary:"High-intensity pressing and quick transitions, with strong athletic and squad-depth demands."
  },
  "Nuno Espírito Santo":{
    preferredFormation:"4-2-3-1",alternatives:["3-4-3","3-5-2"],
    possession:38,pressing:52,verticality:92,flexibility:72,
    recruitmentAggression:68,youthTrust:45,depthDemand:68,
    summary:"Compact defensive organisation and rapid counter-attacking, with flexibility between back-four and back-three systems."
  },
  "Régis Le Bris":{
    preferredFormation:"4-3-3",alternatives:["4-2-3-1","4-4-2"],
    possession:62,pressing:84,verticality:82,flexibility:84,
    recruitmentAggression:64,youthTrust:90,depthDemand:70,
    summary:"Youth-oriented, energetic and adaptable, using aggressive pressing and fast attacks after regains."
  },
  "Thomas Frank":{
    preferredFormation:"4-2-3-1",alternatives:["3-5-2","4-3-3"],
    possession:64,pressing:86,verticality:82,flexibility:94,
    recruitmentAggression:78,youthTrust:74,depthDemand:80,
    summary:"Highly adaptable opponent-specific coach who blends pressing, direct attacks and multiple structures."
  },
  "Graham Potter":{
    preferredFormation:"3-4-2-1",alternatives:["4-2-3-1","3-5-2"],
    possession:84,pressing:76,verticality:56,flexibility:100,
    recruitmentAggression:68,youthTrust:82,depthDemand:78,
    summary:"Exceptionally flexible possession coach who values rotations, multi-functional players and youth."
  },
  "Vítor Pereira":{
    preferredFormation:"3-4-2-1",alternatives:["3-4-3"],
    possession:50,pressing:68,verticality:72,flexibility:38,
    recruitmentAggression:70,youthTrust:48,depthDemand:70,
    summary:"Tactically stable back-three coach with direct progression and a strong preference for structural consistency."
  }
};

const DEFAULT_MANAGER_PROFILE={
  preferredFormation:"4-2-3-1",alternatives:["4-3-3"],
  possession:65,pressing:65,verticality:65,flexibility:60,
  recruitmentAggression:65,youthTrust:60,depthDemand:70,
  summary:"Balanced managerial profile. A bespoke profile has not yet been added for this coach."
};

function managerNameForClub(club){
  return club===state.club ? state.staff?.manager?.name : (byClub(club)?.manager||"");
}

function managerProfileByName(name){
  return MANAGER_PROFILES[name] || DEFAULT_MANAGER_PROFILE;
}

function managerProfileForClub(club){
  return managerProfileByName(managerNameForClub(club));
}


function managerFormationForClub(club){
  const managerName=managerNameForClub(club);
  const profile=managerProfileByName(managerName);
  if(!state.managerTactics) state.managerTactics={};

  // Migration: old saves may contain a randomly assigned formation. The manager
  // profile now takes precedence and overwrites that legacy random assignment.
  state.managerTactics[club]={
    managerName,
    formation:profile.preferredFormation,
    alternatives:[...(profile.alternatives||[])]
  };
  return profile.preferredFormation;
}

function formationSlotAliases(slot){
  return ({
    GK:["GK"], RB:["RB","RWB"], LB:["LB","LWB"], CB:["CB"],
    DM:["CDM","DM","CM"], CM:["CM","CDM","CAM"], AM:["CAM","AM","CM"],
    RM:["RM","RW","LM","LW","RWB"], LM:["LM","LW","RM","RW","LWB"],
    RW:["RW","RM","LW","LM"], LW:["LW","LM","RW","RM"], ST:["ST","CF"]
  })[slot]||[slot];
}

function positionSuitability(p,slot){
  const tokens=playerPositionTokens(p);
  const primary=tokens[0]||"";
  const has=(...positions)=>positions.some(x=>tokens.includes(x));
  const primaryIs=(...positions)=>positions.includes(primary);

  if(slot==="GK") return has("GK")?100:0;

  // Full-backs are side-specific AND primary-position aware.
  // A natural/primary full-back should beat a higher-rated player who merely
  // has the role as a secondary position in the database.
  if(slot==="RB"){
    if(primaryIs("RB","RWB")) return 100;
    if(has("RB","RWB")) return 78;
    if(primaryIs("CB","RM")) return 48;
    if(has("CB","RM")) return 38;
    if(primaryIs("LB","LWB")) return 14;
    if(has("LB","LWB")) return 10;
    return 0;
  }
  if(slot==="LB"){
    if(primaryIs("LB","LWB")) return 100;
    if(has("LB","LWB")) return 78;
    if(primaryIs("CB","LM")) return 48;
    if(has("CB","LM")) return 38;
    if(primaryIs("RB","RWB")) return 14;
    if(has("RB","RWB")) return 10;
    return 0;
  }

  if(slot==="CB"){
    if(primaryIs("CB")) return 100;
    if(has("CB")) return 88;
    if(has("RB","LB","RWB","LWB")) return 58;
    if(has("CDM","DM")) return 50;
    return 0;
  }

  if(slot==="DM"){
    if(primaryIs("CDM","DM")) return 100;
    if(has("CDM","DM")) return 92;
    if(primaryIs("CM")) return 86;
    if(has("CM")) return 80;
    if(has("CB")) return 72;
    if(has("CAM","AM")) return 55;
    return 0;
  }

  if(slot==="CM"){
    if(primaryIs("CM")) return 100;
    if(has("CM")) return 92;
    if(has("CDM","DM","CAM","AM")) return 86;
    if(has("RM","LM")) return 66;
    return 0;
  }

  if(slot==="AM"){
    if(primaryIs("CAM","AM")) return 100;
    if(has("CAM","AM")) return 94;
    if(has("CM")) return 88;
    if(has("RW","LW","RM","LM")) return 80;
    if(has("ST","CF")) return 65;
    return 0;
  }

  // Wide roles remain deliberately flexible across flanks.
  if(slot==="RM"){
    if(primaryIs("RM")) return 100;
    if(primaryIs("RW")) return 96;
    if(has("RM","RW")) return 92;
    if(primaryIs("LM","LW")) return 84;
    if(has("LM","LW")) return 82;
    if(has("RWB")) return 70;
    if(has("CAM","AM")) return 72;
    return 0;
  }
  if(slot==="LM"){
    if(primaryIs("LM")) return 100;
    if(primaryIs("LW")) return 96;
    if(has("LM","LW")) return 92;
    if(primaryIs("RM","RW")) return 84;
    if(has("RM","RW")) return 82;
    if(has("LWB")) return 70;
    if(has("CAM","AM")) return 72;
    return 0;
  }
  if(slot==="RW"){
    if(primaryIs("RW")) return 100;
    if(primaryIs("RM")) return 96;
    if(has("RW","RM")) return 92;
    if(primaryIs("LW","LM")) return 84;
    if(has("LW","LM")) return 82;
    if(has("CAM","AM")) return 74;
    return 0;
  }
  if(slot==="LW"){
    if(primaryIs("LW")) return 100;
    if(primaryIs("LM")) return 96;
    if(has("LW","LM")) return 92;
    if(primaryIs("RW","RM")) return 84;
    if(has("RW","RM")) return 82;
    if(has("CAM","AM")) return 74;
    return 0;
  }

  if(slot==="ST"){
    if(primaryIs("ST","CF")) return 100;
    if(has("ST","CF")) return 94;
    if(has("CAM","AM")) return 70;
    if(has("RW","LW","RM","LM")) return 64;
    return 0;
  }

  return tokens.includes(slot)?100:0;
}

function playerFitsFormationSlot(p,slot){
  return positionSuitability(p,slot)>0;
}


function managerRotationTendency(club){
  const p=managerProfileForClub(club);
  if(!p) return 55;
  // Depth-demanding / youth-trusting managers are more willing to use the squad.
  return clamp(
    42+
    ((p.depthDemand||70)-70)*0.45+
    ((p.youthTrust||60)-60)*0.22+
    ((p.pressing||65)-65)*0.18+
    ((p.flexibility||65)-65)*0.12,
    28,84
  );
}

function managerSelectionImportance(context={}){
  return clamp(Number(context.importance??60),30,100);
}

function managerConditionSelectionAdjustment(player,club,context={}){
  if(typeof playerCondition!=="function") return 0;
  const condition=playerCondition(player);
  const importance=managerSelectionImportance(context);
  const rotation=managerRotationTendency(club);

  // Big matches make managers more willing to risk a tired star. Rotation-heavy
  // managers penalise fatigue earlier.
  const toleranceBoost=(importance-60)*0.10;
  const rotationPenalty=(rotation-50)*0.035;
  const effectiveThreshold=75+toleranceBoost-rotationPenalty;

  if(condition>=90) return 1.5;
  if(condition>=80) return 0.5;
  if(condition>=effectiveThreshold) return -1;
  if(condition>=65) return -4-(effectiveThreshold-condition)*0.18;
  if(condition>=55) return -8-(65-condition)*0.32;
  if(condition>=45) return -13-(55-condition)*0.42;
  return -21;
}

function managerFixtureImportance(club,opponent=null){
  let importance=60;
  if(opponent){
    const own=byClub(club)?.reputation||70;
    const opp=byClub(opponent)?.reputation||70;
    if(opp>=88) importance+=12;
    else if(opp>=82) importance+=7;
    if(Math.abs(own-opp)<=3) importance+=3;
  }
  // Late-season league position pressure.
  if(state.week>=30){
    const pos=typeof clubLeaguePosition==="function"?clubLeaguePosition(club):10;
    if(pos<=5 || pos>=16) importance+=8;
  }
  return clamp(importance,40,92);
}

function managerSelectXI(club,context={}){
  const formation=managerFormationForClub(club);
  const shape=MANAGER_FORMATIONS[formation]||MANAGER_FORMATIONS["4-2-3-1"];
  const available=clubSquadPlayers(club)
    .filter(p=>!state.injuries?.[p.id]);

  const used=new Set();
  const xi=[];

  shape.slots.forEach((slot,slotIndex)=>{
    const candidates=available
      .filter(p=>!used.has(p.id))
      .map(p=>{
        const suitability=positionSuitability(p,slot);
        if(suitability<=0) return null;
        const stats=club===state.club ? state.playerStats?.[p.id] : null;
        const formBonus=stats?.lastRating ? (stats.lastRating-6.5)*0.8 : 0;
        const conditionAdj=managerConditionSelectionAdjustment(p,club,context);
        const workloadAdj=typeof workloadMinutes==="function" && workloadMinutes(p,14)>=320
          ? -(managerRotationTendency(club)/100)*2.4
          : 0;
        const score=(p.overall||0)*0.72+suitability*0.28+formBonus+conditionAdj+workloadAdj;
        return {p,suitability,score};
      })
      .filter(Boolean)
      .sort((a,b)=>b.score-a.score || (b.p.overall||0)-(a.p.overall||0));

    const chosen=candidates[0]?.p||null;
    if(chosen) used.add(chosen.id);
    xi.push({
      slot,slotIndex,playerId:chosen?.id||null,player:chosen||null,
      overall:chosen?.overall||0,
      suitability:chosen?positionSuitability(chosen,slot):0,
      condition:chosen&&typeof playerCondition==="function"?playerCondition(chosen):100
    });
  });

  return {formation,slots:shape.slots,xi,importance:managerSelectionImportance(context)};
}

function managerSelectMatchdaySquad(club,context={}){
  const selection=managerSelectXI(club,context);
  const used=new Set(selection.xi.filter(x=>x.playerId).map(x=>String(x.playerId)));
  const remaining=clubSquadPlayers(club)
    .filter(p=>!state.injuries?.[p.id])
    .filter(p=>!used.has(String(p.id)))
    .sort((a,b)=>{
      const ac=typeof playerCondition==="function"?playerCondition(a):100;
      const bc=typeof playerCondition==="function"?playerCondition(b):100;
      return ((b.overall||0)*0.86+bc*0.14)-((a.overall||0)*0.86+ac*0.14);
    });

  const bench=[];
  const wantedGroups=["GK","CB","RB","LB","DM","CM","AM","RW","LW","ST"];
  wantedGroups.forEach(slot=>{
    if(bench.length>=7) return;
    const best=remaining
      .filter(p=>!bench.some(b=>String(b.id)===String(p.id)))
      .map(p=>{
        const condition=typeof playerCondition==="function"?playerCondition(p):100;
        return {p,score:(p.overall||0)*0.67+positionSuitability(p,slot)*0.23+condition*0.10};
      })
      .filter(x=>positionSuitability(x.p,slot)>0)
      .sort((a,b)=>b.score-a.score)[0]?.p;
    if(best) bench.push(best);
  });
  remaining.forEach(p=>{if(bench.length<7 && !bench.some(b=>String(b.id)===String(p.id))) bench.push(p);});

  return {...selection,bench:bench.slice(0,7)};
}

function managerDepthChart(club){
  const selection=managerSelectXI(club);
  const chart={};
  selection.slots.forEach(slot=>{ if(!chart[slot]) chart[slot]={starters:[],backups:[]}; });
  selection.xi.forEach(x=>{ if(x.player) chart[x.slot].starters.push(x.player); });

  const startingIds=new Set(selection.xi.filter(x=>x.playerId).map(x=>String(x.playerId)));
  const remaining=clubSquadPlayers(club).filter(p=>!startingIds.has(String(p.id)));

  Object.keys(chart).forEach(slot=>{
    chart[slot].backups=remaining
      .map(p=>({p,suitability:positionSuitability(p,slot)}))
      .filter(x=>x.suitability>=40)
      .sort((a,b)=>{
        const scoreA=(a.p.overall||0)*0.72+a.suitability*0.28;
        const scoreB=(b.p.overall||0)*0.72+b.suitability*0.28;
        return scoreB-scoreA;
      })
      .slice(0,2)
      .map(x=>x.p);
  });
  return {formation:selection.formation,chart,xi:selection.xi};
}

function formationSlotToRecruitmentGroup(slot){
  return ({GK:"GK",RB:"RB",LB:"LB",CB:"CB",DM:"DM",CM:"CM",AM:"AM",RM:"RW",LM:"LW",RW:"RW",LW:"LW",ST:"ST"})[slot]||slot;
}

function managerSquadNeedsFromFormation(club){
  const depth=managerDepthChart(club);
  const rep=byClub(club)?.reputation||72;
  const profile=managerProfileForClub(club);

  const starterStandard=clamp(Math.round(70+(rep-70)*0.42),72,88);
  const competitionStandard=clamp(starterStandard-3,69,85);
  const backupStandard=clamp(starterStandard-8,64,81);
  const needs=[];

  [...new Set(depth.xi.map(x=>x.slot))].forEach(slot=>{
    const sameSlotXI=depth.xi.filter(x=>x.slot===slot);
    const starters=sameSlotXI.map(x=>x.player).filter(Boolean).sort((a,b)=>b.overall-a.overall);
    const backups=depth.chart[slot]?.backups||[];
    const requiredStarters=sameSlotXI.length;
    const filledStarters=starters.length;
    const weakestStarter=starters[starters.length-1]?.overall||0;
    const bestBackup=backups[0]?.overall||0;

    // One credible senior understudy is sufficient for a single GK slot.
    // Other positions scale depth expectations with how many slots the formation uses
    // and with the manager's profile.
    const seniorBackupsRequired = slot==="GK"
      ? 1
      : Math.max(1,Math.min(2,requiredStarters + (profile.depthDemand>=88?1:0)));

    const credibleSeniorBackups=backups.filter(p=>(p.overall||0)>=backupStandard-6).length;

    const prospectCandidates=clubSquadPlayers(club).filter(p=>{
      if(!playerFitsFormationSlot(p,slot)) return false;
      if(p.age>22) return false;
      const potential=p.potential||p.overall||0;
      return potential>=Math.max(competitionStandard,starterStandard-2);
    });

    let role="none",score=0,reason="";

    if(filledStarters<requiredStarters){
      role="starter"; score=92;
      reason=`The ${depth.formation} requires ${requiredStarters} ${slot} role${requiredStarters>1?"s":""}, but only ${filledStarters} is currently filled.`;
    }else if(weakestStarter<starterStandard-3){
      role="starter"; score=65+(starterStandard-weakestStarter)*5;
      reason=`The current ${slot} starter is below the level expected for this club.`;
    }else if(bestBackup<competitionStandard-5){
      role="competition"; score=46+(competitionStandard-bestBackup)*4;
      reason=`The manager wants stronger competition behind the ${slot} starter${requiredStarters>1?"s":""}.`;
    }else if(credibleSeniorBackups<seniorBackupsRequired){
      role="backup";
      score=26+(seniorBackupsRequired-credibleSeniorBackups)*10+(profile.depthDemand-70)*0.25;
      reason=`The ${slot} depth is below ${managerNameForClub(club)}'s preferred senior cover level.`;
    }else if(
      profile.youthTrust>=68 &&
      prospectCandidates.length===0 &&
      (slot==="GK" || profile.depthDemand>=78)
    ){
      role="prospect";
      score=20+(profile.youthTrust-60)*0.35+(profile.depthDemand-70)*0.15;
      reason=`Senior ${slot} cover is adequate, but ${managerNameForClub(club)} would like a young development option for the future.`;
    }

    needs.push({
      position:formationSlotToRecruitmentGroup(slot),
      tacticalSlot:slot,role,score:clamp(Math.round(score),0,100),reason,
      formation:depth.formation,
      starter:starters[0]?.overall||0,second:bestBackup,depth:starters.length+backups.length,
      standards:{starter:starterStandard,competition:competitionStandard,backup:backupStandard},
      managerProfile:profile
    });
  });

  const merged={};
  needs.forEach(n=>{ if(!merged[n.position] || n.score>merged[n.position].score) merged[n.position]=n; });
  return Object.values(merged).sort((a,b)=>b.score-a.score);
}

function evaluateSquadNeeds(club){
  return managerSquadNeedsFromFormation(club);
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
  if(buyingClub===state.club && typeof facilityRating==="function"){
    score+=(facilityRating("recruitment")-70)*0.08;
  }
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
  const years=Math.max(0,contractYear-currentSeasonStartYear());
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
    .filter(p=>p.club!==club && !isExternalTransferClub(p.club) && playsPositionGroup(p,position))
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
  return parseISODate(currentGameDateISO()).toLocaleDateString("en-GB",{month:"short",year:"numeric",timeZone:"UTC"});
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
    id:"tx"+Date.now()+Math.floor(Math.random()*1000),week:state.week,date:currentGameDateISO(),playerId:p.id,playerName:p.name,
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


function financialRegulationTransferPreviewHTML(player,fee,weeklyWage,years=4,mode="buy"){
  if(typeof userSCRSnapshot!=="function") return "";
  const current=userSCRSnapshot();
  const projected=mode==="sell"
    ? projectSCRAfterSale(player,fee)
    : projectSCRAfterSigning(player,fee,weeklyWage,years);

  const improves=projected.ratio<current.ratio;
  const delta=(projected.ratio-current.ratio)*100;
  const label=mode==="sell"?"Projected SCR after sale":"Projected SCR after signing";
  const annual=mode==="sell"
    ? `${money(projected.annualSaving||0)} annual regulated cost removed`
    : `${money(projected.annualImpact||0)} annual regulated cost added`;

  return `<div class="transfer-box financial-regulation-preview">
    <div class="financial-regulation-preview-head">
      <b>Financial regulation impact</b>
      <span class="scr-mini-status ${projected.ratio<=current.limit?"good":"bad"}">${projected.status}</span>
    </div>
    <div class="financial-regulation-ratios">
      <span>Current <b>${(current.ratio*100).toFixed(1)}%</b></span>
      <span>→</span>
      <span>${label.replace("Projected SCR ","")} <b>${(projected.ratio*100).toFixed(1)}%</b></span>
    </div>
    <div class="muted small">${annual} • Regulatory limit: ${Math.round(current.limit*100)}%${mode==="sell"&&current.ratio>current.limit&&improves?" • This sale helps restore compliance.":""}</div>
  </div>`;
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
  const externalOwned=isExternalTransferClub(p.club);

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
    ${financialRegulationTransferPreviewHTML(p,d.asking,d.wage,4,"buy")}
    ${transferWindowStatusHTML()}
    <div id="transferNegotiationArea"></div>
    ${externalOwned?`<div class="transfer-box"><b>External club</b><br><span class="muted small">This club exists as a transfer-market buyer only in v0.16.2. Recruitment from external/EFL clubs will be added when their player database is expanded.</span></div>`:""}
    <div class="transfer-actions">
      <button class="btn primary" id="authoriseTransferApproach" ${(isTransferWindowOpen()&&!externalOwned)?"":"disabled"}>${externalOwned?"External recruitment unavailable":isTransferWindowOpen()?(active?"Continue negotiation":"Authorise approach"):"Window closed"}</button>
    </div>`;
  q("authoriseTransferApproach").addEventListener("click",()=>{if(!externalOwned) beginTransferApproach(p.id,context);});
  q("transferPlayerModal").classList.remove("hide");
  if(active) renderTransferNegotiation(p.id);
}

function closeTransferPlayerFile(){
  q("transferPlayerModal")?.classList.add("hide");
}


function transferSellerReservationPrice(n){
  // The DoF should help, but not magically turn a £130m player into a £95m sale.
  // Translate the existing DoF modifier into a capped 0–8% negotiating advantage.
  const rawModifier=dofNegotiationModifier();
  const dofAdvantage=clamp((1-rawModifier)*0.40,-0.04,0.08);
  return Math.round((n.askingPrice*(0.97-dofAdvantage))/250000)*250000;
}

function initialSellerCounter(n){
  const reservation=transferSellerReservationPrice(n);
  const opening=Math.round((n.askingPrice*(1.00+stablePlayerTrait({id:n.playerId},"seller-counter")*0.035))/250000)*250000;
  return Math.max(reservation,opening);
}

function beginTransferApproach(id,context={}){
  ensureContractState();
  if(blockClosedWindow("authorise an approach")) return;
  const p=DB.players.find(x=>String(x.id)===String(id));
  if(!p || p.club===state.club) return;
  if(isExternalTransferClub(p.club)){
    addNews(`Recruitment from ${p.club} is not available yet because external clubs currently exist as buyer-only market actors.`);
    return;
  }
  if(!state.transferNegotiations[p.id]){
    const asking=estimatedAskingPrice(p,state.club);
    const suggested=Math.round((asking*.82)/250000)*250000;
    const negotiation={
      playerId:p.id,sellingClub:p.club,buyingClub:state.club,askingPrice:asking,
      latestOffer:suggested,round:0,status:"negotiating",managerRequestId:context.managerRequestId||null,
      previousUserOffer:0,lastCounter:null,stagnantRounds:0
    };
    negotiation.reservationPrice=transferSellerReservationPrice(negotiation);
    negotiation.lastCounter=initialSellerCounter(negotiation);
    state.transferNegotiations[p.id]=negotiation;
  }
  renderTransferNegotiation(p.id);
}


function withdrawTransferApproach(id,reason="You withdrew from negotiations."){
  const p=DB.players.find(x=>String(x.id)===String(id));
  const n=state.transferNegotiations?.[id];
  if(!n) return;
  n.status="withdrawn";
  n.message=reason;
  n.agreedFee=null;
  if(p) addNews(`${state.club} withdrew from transfer talks for ${p.name}.`);
  saveGame(false);
  renderTransferNegotiation(id);
}

function renderTransferNegotiation(id){
  const p=DB.players.find(x=>String(x.id)===String(id));
  const n=state.transferNegotiations?.[id];
  const area=q("transferNegotiationArea");
  if(!p||!n||!area) return;

  if(n.status==="clubAccepted" || n.status==="terms"){
    const contractN=initialiseContractNegotiation(p,"signing",expectedTransferWage(p,state.club));
    const demand=n.contractDemand||contractN.currentDemand;
    area.innerHTML=`<div class="transfer-box">
      <b>${n.sellingClub} accepted ${money(n.agreedFee)}.</b><br>
      <span class="muted small">You can now agree terms with ${p.name}, or withdraw before the transfer is completed.</span>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;align-items:center">
        <label>Weekly wage <input id="newSigningWage" type="number" step="1000" value="${demand}"></label>
        <label>Contract <select id="newSigningYears"><option>3</option><option selected>4</option><option>5</option></select> years</label>
        <button class="btn primary" id="submitSigningTerms">Offer contract</button>
        <button class="btn secondary" id="withdrawAcceptedTransfer">Withdraw transfer</button>
      </div>
      <div class="muted small" style="margin-top:8px">Agent demand: ${money(demand)}/wk • Preferred term: ${contractN.preferredYears} year${contractN.preferredYears===1?"":"s"} • Player interest: ${interestLabel(playerInterestScore(p,state.club))}. Repeating rejected terms will not improve your chances.</div>
      ${financialRegulationTransferPreviewHTML(p,n.agreedFee,demand,4,"buy")}
    </div>`;
    q("submitSigningTerms").addEventListener("click",()=>submitNewSigningTerms(p.id));
    q("withdrawAcceptedTransfer").addEventListener("click",()=>withdrawTransferApproach(p.id,"You withdrew after the selling club accepted the bid."));
    return;
  }

  if(n.status==="withdrawn"){
    area.innerHTML=`<div class="transfer-box"><b>Approach withdrawn.</b><br><span class="muted small">${n.message||"You ended the transfer talks."}</span><div style="margin-top:10px"><button class="btn secondary" id="restartTransferApproach">Start new approach</button></div></div>`;
    q("restartTransferApproach")?.addEventListener("click",()=>{
      delete state.transferNegotiations[p.id];
      beginTransferApproach(p.id);
    });
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
    ${n.lastCounter?`<div class="muted small" style="margin-top:6px">Current counter: ${money(n.lastCounter)} • Match this amount to accept.</div>`:""}
    <div id="transferBidWarning" class="transfer-bid-warning hide"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;align-items:center">
      <label>Transfer fee <input id="transferFeeOffer" type="number" step="250000" value="${n.latestOffer}"></label>
      <button class="btn primary" id="submitTransferBid">Submit bid</button>
      <button class="btn secondary" id="walkAwayTransfer">Walk away</button>
    </div>
  </div>`;

  const input=q("transferFeeOffer");
  const updateWarning=()=>{
    const fee=Number(input?.value||0);
    const estimateHigh=n.askingPrice*1.08;
    const warn=q("transferBidWarning");
    if(!warn) return;
    if(fee>estimateHigh*1.25){
      warn.classList.remove("hide");
      warn.innerHTML=`<b>Check this bid.</b> ${money(fee)} is far above the recruitment estimate for ${p.name}.`;
    }else{
      warn.classList.add("hide");
      warn.innerHTML="";
    }
  };
  input?.addEventListener("input",updateWarning);
  updateWarning();

  q("submitTransferBid").addEventListener("click",()=>submitTransferBid(p.id,Number(input?.value||0)));
  q("walkAwayTransfer").addEventListener("click",()=>withdrawTransferApproach(p.id));
}

function submitTransferBid(id,fee){
  if(blockClosedWindow("submit a transfer bid")) return;

  const p=DB.players.find(x=>String(x.id)===String(id));
  const n=state.transferNegotiations?.[id];
  if(!p||!n||fee<=0) return;

  const offer=Math.round(fee/250000)*250000;

  if(offer>(state.budget||0)){
    n.message=`Bid blocked: ${money(offer)} exceeds the remaining transfer budget of ${money(state.budget||0)}.`;
    renderTransferNegotiation(id);
    return;
  }

  // Typo protection. A bid far beyond the recruitment estimate needs an
  // explicit second confirmation before it can be submitted.
  const highEstimate=(n.askingPrice||0)*1.08;
  if(highEstimate>0 && offer>highEstimate*1.25){
    const multiple=offer/Math.max(1,n.askingPrice||highEstimate);
    const proceed=typeof window!=="undefined" && typeof window.confirm==="function"
      ? window.confirm(`This bid is ${money(offer)}, around ${multiple.toFixed(1)}× the recruitment valuation for ${p.name}. Submit it anyway?`)
      : false;
    if(!proceed){
      n.message=`Bid not submitted. Check the transfer fee and try again.`;
      renderTransferNegotiation(id);
      return;
    }
  }

  // Migrate older/in-progress negotiations safely.
  if(n.reservationPrice==null) n.reservationPrice=transferSellerReservationPrice(n);
  if(n.lastCounter==null) n.lastCounter=initialSellerCounter(n);
  if(n.previousUserOffer==null) n.previousUserOffer=0;
  if(n.stagnantRounds==null) n.stagnantRounds=0;

  const reservation=n.reservationPrice;
  const sellerCounter=n.lastCounter;
  const previousOffer=n.previousUserOffer;

  n.round=(n.round||0)+1;

  // ABSOLUTE RULE:
  // If the buyer meets or exceeds the seller's current counter, the deal is accepted.
  if(offer>=sellerCounter){
    n.status="clubAccepted";
    n.agreedFee=offer;
    n.latestOffer=offer;
    n.previousUserOffer=offer;
    n.message=`${n.sellingClub} accepted your offer of ${money(offer)}.`;
    addNews(`${n.sellingClub} have accepted ${state.club}'s ${money(offer)} offer for ${p.name}.`);
    saveGame(false);
    renderTransferNegotiation(p.id);
    return;
  }

  // Also accept if the bid reaches the seller's internal minimum.
  if(offer>=reservation){
    n.status="clubAccepted";
    n.agreedFee=offer;
    n.latestOffer=offer;
    n.previousUserOffer=offer;
    n.message=`${n.sellingClub} accepted your offer of ${money(offer)}.`;
    addNews(`${n.sellingClub} have accepted ${state.club}'s ${money(offer)} offer for ${p.name}.`);
    saveGame(false);
    renderTransferNegotiation(p.id);
    return;
  }

  const improvement=offer-previousOffer;

  // Same/lower bid: seller does not move at all.
  if(previousOffer>0 && improvement<=0){
    n.stagnantRounds+=1;
    n.previousUserOffer=offer;
    n.latestOffer=sellerCounter;

    if(n.stagnantRounds>=2 || n.round>=6){
      n.status="rejected";
      n.message=`${n.sellingClub} ended negotiations after you failed to improve your offer.`;
    }else{
      n.message=`${n.sellingClub} rejected the bid. Their counter remains ${money(sellerCounter)}.`;
    }

    saveGame(false);
    renderTransferNegotiation(p.id);
    return;
  }

  n.stagnantRounds=0;

  // Very low bids do not earn any seller concession.
  if(offer<reservation*0.82){
    n.previousUserOffer=offer;
    n.latestOffer=sellerCounter;
    n.message=`${n.sellingClub} rejected the bid as well below their valuation. Their counter remains ${money(sellerCounter)}.`;

    if(n.round>=3){
      n.status="rejected";
      n.message=`${n.sellingClub} have ended negotiations after repeated low offers.`;
    }

    saveGame(false);
    renderTransferNegotiation(p.id);
    return;
  }

  // Improved bids can earn a SMALL seller concession.
  // The seller never counters below:
  // 1) their reservation price
  // 2) the buyer's submitted offer + £250k
  // This prevents impossible "we counter below your offer but still reject it" states.
  const concession=Math.max(
    0,
    Math.min(
      sellerCounter-reservation,
      Math.round((Math.max(250000,improvement)*0.35)/250000)*250000
    )
  );

  let newCounter=Math.max(
    reservation,
    sellerCounter-concession,
    offer+250000
  );

  // Round safely
  newCounter=Math.round(newCounter/250000)*250000;

  // Defensive guarantee: if rounding somehow takes the counter to/below the offer,
  // accept the user's offer rather than creating a contradictory state.
  if(newCounter<=offer){
    n.status="clubAccepted";
    n.agreedFee=offer;
    n.latestOffer=offer;
    n.previousUserOffer=offer;
    n.lastCounter=offer;
    n.message=`${n.sellingClub} accepted your offer of ${money(offer)}.`;
    addNews(`${n.sellingClub} have accepted ${state.club}'s ${money(offer)} offer for ${p.name}.`);
  }else{
    n.previousUserOffer=offer;
    n.lastCounter=newCounter;
    n.latestOffer=newCounter;
    n.message=`${n.sellingClub} rejected the bid and countered at ${money(newCounter)}.`;

    if(n.round>=6 && offer<reservation*0.94){
      n.status="rejected";
      n.message=`${n.sellingClub} have ended negotiations because your offers remained below their valuation.`;
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
  const decision=contractTermsDecision(p,wage,years,"signing");

  if(!decision.accepted){
    n.status="clubAccepted";
    n.contractDemand=decision.demand;
    addNews(`${p.name}'s representatives rejected ${state.club}'s contract offer.`);
    const area=q("transferNegotiationArea");
    if(area){
      const old=area.querySelector(".transfer-box");
      if(old) old.insertAdjacentHTML("afterbegin",`<div class="bad" style="margin-bottom:8px"><b>Contract offer rejected.</b><br><span class="muted small">${decision.message} Repeating the same rejected offer will not work.</span></div>`);
    }
    saveGame(false);
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
  if(state.monthlyFinance) state.monthlyFinance.transferSpent=(state.monthlyFinance.transferSpent||0)+n.agreedFee;
  if(oldClub!==state.club && aiFinance(oldClub)){
    applyAITransferSale(oldClub,n.agreedFee,oldAIWage);
  }
  transferPlayerToClub(p,state.club,n.agreedFee,oldClub);

  // If this signing came from a manager request, satisfy that specific role and
  // stop the manager immediately asking for the same thing again.
  const req=n.managerRequestId ? state.managerRequests?.find(r=>r.id===n.managerRequestId) : null;
  if(req?.type==="sign"){
    const signedGroup=primaryRecruitmentGroup(p);

    (state.managerSquadVacancies||[])
      .filter(v=>!v.filled && v.position===req.position)
      .forEach(v=>{
        const need=evaluateSquadNeeds(state.club).find(x=>x.position===req.position);
        const standards=need?.standards||{};
        const ovr=p.overall||0;
        const threshold =
          v.role==="starter" ? (standards.starter||75)-3 :
          v.role==="competition" ? (standards.competition||72)-4 :
          (standards.backup||68)-5;

        if(ovr>=threshold) v.filled=true;
      });

    if(!state.managerRoleFulfilledUntil) state.managerRoleFulfilledUntil={};
    state.managerRoleFulfilledUntil[`${req.position}-${req.squadRole||"starter"}`]=currentCareerDay()+84;
  }

  state.playerContracts[p.id]={wage,endYear:currentSeasonStartYear()+years};
  p.wage=wage;
  if(typeof registerRegulatedSigning==="function") registerRegulatedSigning(p,n.agreedFee,wage,years);
  state.playerMorale[p.id]="Happy";
  if(!state.playerStats[p.id]) state.playerStats[p.id]={appearances:0,goals:0};
  state.playerListStatus[p.id]="None";
  n.status="completed";
  clearContractNegotiation(p,"signing");
  if(p.overall>=82 || n.agreedFee>=40_000_000) recordMarqueeSigning(p);
  state.transferSentiment.owners.push({label:`Transfer spending on ${p.name}`,value:n.agreedFee>(p.value||0)*1.25?-3:1});
  addNews(`${state.club} have signed ${p.name} from ${oldClub} for ${money(n.agreedFee)}. ${p.name} has agreed a ${years}-year contract worth ${money(wage)}/week.`);
  saveGame(false);
  closeTransferPlayerFile();
  renderAll();
}


function playerSaleDecisionStatsHTML(p){
  const s=state.playerStats?.[p.id]||{};
  const avg=typeof playerAverageRating==="function"?playerAverageRating(p.id):null;
  const star=typeof isClubStarPlayer==="function" && isClubStarPlayer(p,state.club);

  return `
    ${star?`<div class="sale-star-warning">
      <span class="star-player-badge">★ STAR PLAYER</span>
      <b>Selling ${p.name} may cause supporter unrest.</b>
    </div>`:""}
    <div class="sale-decision-stats">
      <div><span>Apps</span><b>${s.appearances||0}</b></div>
      <div><span>Starts</span><b>${s.starts||0}</b></div>
      <div><span>Goals</span><b>${s.goals||0}</b></div>
      <div><span>AVG rating</span><b>${avg!=null?avg.toFixed(2):"—"}</b></div>
    </div>`;
}

function incomingOfferFairValue(p){
  return Math.round(estimatedAskingPrice(p,state.club)/250000)*250000;
}


/* --------------------------------------------------------------------------
   External transfer market — v0.16.2
   --------------------------------------------------------------------------
   These clubs exist only as transfer-market actors. They do NOT have generated
   squads, fixtures or domestic-league simulation and are not browsable in the
   player database. This expands the selling market without expanding the full
   football-world database.
   -------------------------------------------------------------------------- */

const EXTERNAL_TRANSFER_CLUBS=[
  // Championship-level market
  {name:"Birmingham City",division:"Championship",country:"England",reputation:73,budget:38_000_000,maxWage:75_000,standard:73},
  {name:"Blackburn Rovers",division:"Championship",country:"England",reputation:70,budget:18_000_000,maxWage:45_000,standard:71},
  {name:"Bristol City",division:"Championship",country:"England",reputation:70,budget:20_000_000,maxWage:48_000,standard:71},
  {name:"Charlton Athletic",division:"Championship",country:"England",reputation:68,budget:14_000_000,maxWage:36_000,standard:69},
  {name:"Coventry City",division:"Championship",country:"England",reputation:72,budget:25_000_000,maxWage:55_000,standard:72},
  {name:"Derby County",division:"Championship",country:"England",reputation:71,budget:20_000_000,maxWage:48_000,standard:71},
  {name:"Hull City",division:"Championship",country:"England",reputation:69,budget:18_000_000,maxWage:43_000,standard:70},
  {name:"Ipswich Town",division:"Championship",country:"England",reputation:75,budget:45_000_000,maxWage:80_000,standard:74},
  {name:"Leicester City",division:"Championship",country:"England",reputation:78,budget:48_000_000,maxWage:95_000,standard:75},
  {name:"Middlesbrough",division:"Championship",country:"England",reputation:73,budget:30_000_000,maxWage:60_000,standard:73},
  {name:"Millwall",division:"Championship",country:"England",reputation:69,budget:16_000_000,maxWage:40_000,standard:70},
  {name:"Norwich City",division:"Championship",country:"England",reputation:73,budget:30_000_000,maxWage:62_000,standard:73},
  {name:"Oxford United",division:"Championship",country:"England",reputation:66,budget:10_000_000,maxWage:30_000,standard:68},
  {name:"Portsmouth",division:"Championship",country:"England",reputation:70,budget:17_000_000,maxWage:42_000,standard:70},
  {name:"Preston North End",division:"Championship",country:"England",reputation:68,budget:13_000_000,maxWage:34_000,standard:69},
  {name:"Queens Park Rangers",division:"Championship",country:"England",reputation:69,budget:16_000_000,maxWage:40_000,standard:70},
  {name:"Sheffield United",division:"Championship",country:"England",reputation:75,budget:38_000_000,maxWage:75_000,standard:74},
  {name:"Sheffield Wednesday",division:"Championship",country:"England",reputation:70,budget:15_000_000,maxWage:38_000,standard:70},
  {name:"Southampton",division:"Championship",country:"England",reputation:76,budget:45_000_000,maxWage:85_000,standard:75},
  {name:"Stoke City",division:"Championship",country:"England",reputation:71,budget:22_000_000,maxWage:50_000,standard:71},
  {name:"Swansea City",division:"Championship",country:"Wales",reputation:70,budget:18_000_000,maxWage:45_000,standard:71},
  {name:"Watford",division:"Championship",country:"England",reputation:72,budget:25_000_000,maxWage:55_000,standard:72},
  {name:"West Bromwich Albion",division:"Championship",country:"England",reputation:74,budget:30_000_000,maxWage:65_000,standard:73},
  {name:"Wrexham",division:"Championship",country:"Wales",reputation:72,budget:32_000_000,maxWage:60_000,standard:72},

  // Lower-EFL market — primarily fringe players, prospects and listed players
  {name:"Bolton Wanderers",division:"League One",country:"England",reputation:68,budget:8_000_000,maxWage:24_000,standard:67},
  {name:"Cardiff City",division:"League One",country:"Wales",reputation:69,budget:9_000_000,maxWage:26_000,standard:68},
  {name:"Exeter City",division:"League One",country:"England",reputation:61,budget:3_000_000,maxWage:12_000,standard:63},
  {name:"Huddersfield Town",division:"League One",country:"England",reputation:68,budget:8_000_000,maxWage:25_000,standard:67},
  {name:"Luton Town",division:"League One",country:"England",reputation:69,budget:9_000_000,maxWage:28_000,standard:68},
  {name:"Plymouth Argyle",division:"League One",country:"England",reputation:66,budget:6_000_000,maxWage:20_000,standard:66},
  {name:"Reading",division:"League One",country:"England",reputation:65,budget:5_000_000,maxWage:18_000,standard:65},
  {name:"Bradford City",division:"League Two",country:"England",reputation:61,budget:2_500_000,maxWage:10_000,standard:62},
  {name:"Notts County",division:"League Two",country:"England",reputation:61,budget:2_500_000,maxWage:10_000,standard:62},

  // Major European / overseas buyers
  {name:"Real Madrid",division:"La Liga",country:"Spain",reputation:99,budget:180_000_000,maxWage:400_000,standard:88},
  {name:"Barcelona",division:"La Liga",country:"Spain",reputation:98,budget:120_000_000,maxWage:350_000,standard:87},
  {name:"Atlético Madrid",division:"La Liga",country:"Spain",reputation:92,budget:90_000_000,maxWage:220_000,standard:84},
  {name:"Villarreal",division:"La Liga",country:"Spain",reputation:84,budget:45_000_000,maxWage:110_000,standard:80},
  {name:"Athletic Club",division:"La Liga",country:"Spain",reputation:85,budget:45_000_000,maxWage:115_000,standard:81},

  {name:"Bayern Munich",division:"Bundesliga",country:"Germany",reputation:97,budget:140_000_000,maxWage:320_000,standard:87},
  {name:"Borussia Dortmund",division:"Bundesliga",country:"Germany",reputation:91,budget:80_000_000,maxWage:180_000,standard:83},
  {name:"RB Leipzig",division:"Bundesliga",country:"Germany",reputation:86,budget:70_000_000,maxWage:145_000,standard:81},
  {name:"Bayer Leverkusen",division:"Bundesliga",country:"Germany",reputation:90,budget:85_000_000,maxWage:175_000,standard:83},
  {name:"Eintracht Frankfurt",division:"Bundesliga",country:"Germany",reputation:84,budget:50_000_000,maxWage:110_000,standard:80},

  {name:"Paris Saint-Germain",division:"Ligue 1",country:"France",reputation:97,budget:170_000_000,maxWage:380_000,standard:87},
  {name:"Marseille",division:"Ligue 1",country:"France",reputation:87,budget:65_000_000,maxWage:140_000,standard:81},
  {name:"Monaco",division:"Ligue 1",country:"France",reputation:85,budget:60_000_000,maxWage:130_000,standard:80},
  {name:"Lyon",division:"Ligue 1",country:"France",reputation:83,budget:45_000_000,maxWage:100_000,standard:79},
  {name:"Lille",division:"Ligue 1",country:"France",reputation:82,budget:42_000_000,maxWage:95_000,standard:79},

  {name:"Inter Milan",division:"Serie A",country:"Italy",reputation:93,budget:90_000_000,maxWage:210_000,standard:84},
  {name:"AC Milan",division:"Serie A",country:"Italy",reputation:92,budget:85_000_000,maxWage:200_000,standard:83},
  {name:"Juventus",division:"Serie A",country:"Italy",reputation:93,budget:95_000_000,maxWage:220_000,standard:84},
  {name:"Napoli",division:"Serie A",country:"Italy",reputation:89,budget:75_000_000,maxWage:170_000,standard:82},
  {name:"Roma",division:"Serie A",country:"Italy",reputation:87,budget:65_000_000,maxWage:150_000,standard:81},
  {name:"Atalanta",division:"Serie A",country:"Italy",reputation:86,budget:60_000_000,maxWage:135_000,standard:81},

  {name:"Benfica",division:"Primeira Liga",country:"Portugal",reputation:87,budget:65_000_000,maxWage:120_000,standard:81},
  {name:"Porto",division:"Primeira Liga",country:"Portugal",reputation:87,budget:60_000_000,maxWage:115_000,standard:81},
  {name:"Sporting CP",division:"Primeira Liga",country:"Portugal",reputation:87,budget:65_000_000,maxWage:125_000,standard:82},
  {name:"Ajax",division:"Eredivisie",country:"Netherlands",reputation:84,budget:50_000_000,maxWage:95_000,standard:79},
  {name:"PSV Eindhoven",division:"Eredivisie",country:"Netherlands",reputation:84,budget:50_000_000,maxWage:95_000,standard:80},
  {name:"Feyenoord",division:"Eredivisie",country:"Netherlands",reputation:83,budget:45_000_000,maxWage:90_000,standard:79},

  {name:"Galatasaray",division:"Süper Lig",country:"Turkey",reputation:85,budget:55_000_000,maxWage:140_000,standard:80},
  {name:"Fenerbahçe",division:"Süper Lig",country:"Turkey",reputation:85,budget:55_000_000,maxWage:145_000,standard:80},
  {name:"Beşiktaş",division:"Süper Lig",country:"Turkey",reputation:82,budget:40_000_000,maxWage:110_000,standard:78},
  {name:"Celtic",division:"Scottish Premiership",country:"Scotland",reputation:81,budget:35_000_000,maxWage:70_000,standard:77},
  {name:"Rangers",division:"Scottish Premiership",country:"Scotland",reputation:80,budget:30_000_000,maxWage:65_000,standard:76}
];

function externalTransferClub(name){
  return EXTERNAL_TRANSFER_CLUBS.find(c=>c.name===name)||null;
}

function isExternalTransferClub(name){
  return Boolean(externalTransferClub(name));
}

function ensureExternalTransferMarketState(){
  if(!state) return;
  if(!state.externalClubFinances) state.externalClubFinances={};
  const seasonKey=typeof currentSeasonStartYear==="function"?currentSeasonStartYear():2025;

  EXTERNAL_TRANSFER_CLUBS.forEach(c=>{
    const existing=state.externalClubFinances[c.name];
    if(!existing || existing.seasonKey!==seasonKey){
      // External clubs are deliberately abstract. Their market budget refreshes
      // each season rather than requiring full profit/loss simulation.
      const variance=0.90+stablePlayerTrait({id:c.name},"external-season-budget")*.20;
      state.externalClubFinances[c.name]={
        seasonKey,
        transferBudget:Math.round((c.budget*variance)/250000)*250000,
        maxWage:c.maxWage,
        spent:0,
        signed:0
      };
    }
  });
}

function externalClubBudgetLeft(club){
  ensureExternalTransferMarketState();
  const p=externalTransferClub(club);
  const f=state.externalClubFinances?.[club];
  if(!p||!f) return 0;
  return Math.max(0,(f.transferBudget??p.budget)-(f.spent||0));
}

function externalPlayerFitScore(p,club,listed=false){
  const c=typeof club==="string"?externalTransferClub(club):club;
  if(!c||!p) return -999;

  const overall=p.overall||0;
  const potential=p.potential||overall;
  const age=p.age||25;
  const currentWage=state.playerContracts?.[p.id]?.wage??p.wage??0;
  const value=p.value||0;

  let score=50;
  score+=(overall-c.standard)*7;
  score+=(potential-overall)*1.5;
  if(age<=23) score+=5;
  if(age>=31) score-=Math.min(15,(age-30)*4);

  // Lower divisions are mostly shopping for fringe players and prospects rather
  // than established Premier League stars.
  if(c.division==="Championship"){
    if(overall>=68 && overall<=79) score+=8;
    if(overall>=83) score-=18;
  }else if(c.division==="League One"||c.division==="League Two"){
    if(overall>=60 && overall<=72) score+=10;
    if(overall>=76) score-=28;
  }else{
    // Elite foreign clubs mainly chase high-end players; development clubs are
    // also interested in younger upside.
    if(c.reputation>=92 && overall<80) score-=18;
    if(c.reputation>=84 && age<=23 && potential>=82) score+=7;
  }

  if(listed) score+=10;
  if(value>c.budget*1.15) score-=30;
  if(currentWage>c.maxWage*1.20) score-=25;

  // Deterministic club/player variation stops every club evaluating the player
  // identically while remaining stable across re-renders.
  score+=(stablePlayerTrait(p,`external-${c.name}`)-0.5)*12;
  return score;
}

function externalExpectedWage(p,club){
  const c=externalTransferClub(club);
  if(!c) return expectedTransferWage(p,club);

  const current=Math.max(1000,state.playerContracts?.[p.id]?.wage??p.wage??1000);
  const sellerRep=byClub(state.club)?.reputation||80;
  const moveDelta=c.reputation-sellerRep;
  let target=current;

  if(moveDelta>=8) target*=1.03;
  else if(moveDelta>=0) target*=1.08;
  else if(moveDelta>=-8) target*=1.13;
  else target*=1.20;

  // Players will not normally move abroad/down the pyramid for a dramatic wage
  // cut simply because the buying club has a lower wage ceiling.
  target=Math.min(target,c.maxWage*1.15);
  const step=target>=100000?5000:target>=50000?2500:1000;
  return Math.max(1000,Math.round(target/step)*step);
}

function externalCanAffordTransfer(club,p,fee,weeklyWage){
  const c=externalTransferClub(club);
  if(!c) return {ok:false,reason:"Unknown external club"};
  const budget=externalClubBudgetLeft(club);
  if(fee>budget) return {ok:false,reason:"Transfer budget"};
  if(weeklyWage>c.maxWage*1.15) return {ok:false,reason:"Wage level"};
  if(externalPlayerFitScore(p,c,state.playerListStatus?.[p.id]==="Transfer")<35) return {ok:false,reason:"Squad fit"};
  return {ok:true,reason:"Affordable"};
}

function applyExternalTransferPurchase(club,fee){
  ensureExternalTransferMarketState();
  const f=state.externalClubFinances?.[club];
  if(!f) return;
  f.spent=(f.spent||0)+fee;
  f.signed=(f.signed||0)+1;
}

function externalMarketCandidatesForPlayer(p,{listed=false}={}){
  ensureExternalTransferMarketState();
  return EXTERNAL_TRANSFER_CLUBS
    .map(club=>({club,score:externalPlayerFitScore(p,club,listed)}))
    .filter(x=>x.score>=35)
    .filter(x=>{
      const wage=externalExpectedWage(p,x.club.name);
      const fair=incomingOfferFairValue(p);
      const testFee=fair*(listed?0.70:0.84);
      return externalCanAffordTransfer(x.club.name,p,testFee,wage).ok;
    })
    .sort((a,b)=>b.score-a.score)
    .slice(0,18)
    .map(x=>x.club);
}

function buyerCompetitionLabel(club){
  const ext=externalTransferClub(club);
  return ext?`${ext.division} • ${ext.country}`:"Premier League";
}


function transferBuyerExpectedWage(p,buyerName){
  return isExternalTransferClub(buyerName)
    ? externalExpectedWage(p,buyerName)
    : expectedTransferWage(p,buyerName);
}

function transferBuyerCanAfford(buyerName,p,fee,weeklyWage){
  return isExternalTransferClub(buyerName)
    ? externalCanAffordTransfer(buyerName,p,fee,weeklyWage)
    : aiCanAffordTransfer(buyerName,fee,weeklyWage);
}

function applyTransferBuyerPurchase(buyerName,fee,weeklyWage){
  if(isExternalTransferClub(buyerName)) applyExternalTransferPurchase(buyerName,fee);
  else applyAITransferPurchase(buyerName,fee,weeklyWage);
}

function chooseIncomingBuyer(p,plBuyers,externalBuyers,listed=false){
  // Keep the Premier League active, but make external/EFL bids common enough
  // to materially expand the market.
  if(!plBuyers.length) return externalBuyers[Math.floor(Math.random()*externalBuyers.length)]||null;
  if(!externalBuyers.length) return plBuyers[Math.floor(Math.random()*plBuyers.length)]||null;

  const overall=p.overall||0;
  let externalChance=listed?0.62:0.52;

  // Fringe players are especially likely to attract EFL / development markets;
  // stars still draw major foreign clubs but retain a strong domestic market.
  if(overall<=74) externalChance+=0.10;
  if(overall>=84) externalChance-=0.06;

  const useExternal=Math.random()<clamp(externalChance,0.35,0.75);
  const pool=useExternal?externalBuyers:plBuyers;
  return pool[Math.floor(Math.random()*pool.length)]||null;
}

function interestedBuyersForPlayer(p,{listed=false}={}){
  const needDepth=listed?7:3;
  const fair=incomingOfferFairValue(p);

  const premierLeague=DB.clubs
    .filter(c=>c.name!==state.club)
    .filter(c=>{
      const needs=evaluateSquadNeeds(c.name).slice(0,needDepth);
      return needs.some(n=>playsPositionGroup(p,n.position));
    })
    .filter(c=>{
      const wage=transferBuyerExpectedWage(p,c.name);
      const testFee=fair*(listed?0.72:0.85);
      return transferBuyerCanAfford(c.name,p,testFee,wage).ok;
    })
    .map(c=>({...c,marketType:"Premier League"}));

  const external=externalMarketCandidatesForPlayer(p,{listed})
    .map(c=>({...c,marketType:"External"}));

  return {premierLeague,external};
}

function createIncomingOfferForPlayer(p,{listed=false}={}){
  if(!p) return false;
  if(state.incomingTransferOffers.some(o=>String(o.playerId)===String(p.id) && o.status==="pending")) return false;

  const fair=incomingOfferFairValue(p);
  const pools=interestedBuyersForPlayer(p,{listed});
  const buyer=chooseIncomingBuyer(p,pools.premierLeague,pools.external,listed);
  if(!buyer) return false;

  const external=isExternalTransferClub(buyer.name);

  // Listed players invite value-seeking offers. External clubs use slightly
  // wider variance because financial power varies dramatically between the
  // Championship, lower EFL and Europe's elite.
  let feeFactor;
  if(external){
    if(buyer.division==="League One"||buyer.division==="League Two"){
      feeFactor=listed?0.68+Math.random()*0.18:0.76+Math.random()*0.18;
    }else if(buyer.division==="Championship"){
      feeFactor=listed?0.72+Math.random()*0.20:0.82+Math.random()*0.20;
    }else{
      feeFactor=listed?0.78+Math.random()*0.24:0.90+Math.random()*0.24;
    }
  }else{
    feeFactor=listed?0.76+Math.random()*0.20:0.88+Math.random()*0.22;
  }

  const fee=Math.max(250000,Math.round((fair*feeFactor)/250000)*250000);
  const wage=transferBuyerExpectedWage(p,buyer.name);

  if(!transferBuyerCanAfford(buyer.name,p,fee,wage).ok) return false;

  const offer={
    id:"io"+Date.now()+Math.floor(Math.random()*1000),
    playerId:p.id,
    buyingClub:buyer.name,
    buyerCompetition:buyerCompetitionLabel(buyer.name),
    externalBuyer:external,
    fee,
    status:"pending",
    round:1,
    expectedWage:wage,
    generatedFromListing:Boolean(listed)
  };

  state.incomingTransferOffers.push(offer);
  state.news.unshift({
    week:state.week,
    date:currentGameDateISO(),
    text:`${buyer.name} (${buyerCompetitionLabel(buyer.name)}) have submitted a ${money(fee)} offer for ${p.name}${listed?" after being alerted to his transfer-list availability":""}.`,
    incomingOfferId:offer.id
  });

  if(state.transferListingMeta?.[p.id]){
    state.transferListingMeta[p.id].failedChecks=0;
    state.transferListingMeta[p.id].lastMarketCheckDay=typeof currentCareerDay==="function"?currentCareerDay():0;
  }
  return true;
}

function generateIncomingOffer(options={}){
  ensureContractState();
  if(!isTransferWindowOpen()) return false;

  const listedOnly=Boolean(options.listedOnly);
  const requestedPlayer=options.player||null;

  if(requestedPlayer){
    return createIncomingOfferForPlayer(requestedPlayer,{listed:state.playerListStatus?.[requestedPlayer.id]==="Transfer"});
  }

  let candidates=squad(state.club).filter(p=>{
    const listed=state.playerListStatus?.[p.id]==="Transfer";
    const strong=p.overall>=74;
    return listedOnly?listed:(listed||strong);
  });
  if(!candidates.length) return false;

  // Transfer-listed players receive a much stronger market weighting.
  const weighted=[];
  candidates.forEach(p=>{
    let w=1;
    if(state.playerListStatus?.[p.id]==="Transfer") w+=12;
    if(p.overall>=82) w+=2;
    for(let i=0;i<w;i++) weighted.push(p);
  });

  // Try several candidates instead of abandoning the entire daily market event
  // because the first random player has no affordable interested club.
  const tried=new Set();
  while(tried.size<Math.min(candidates.length,6)){
    const p=weighted[Math.floor(Math.random()*weighted.length)];
    if(tried.has(String(p.id))) continue;
    tried.add(String(p.id));
    const listed=state.playerListStatus?.[p.id]==="Transfer";
    if(createIncomingOfferForPlayer(p,{listed})) return true;
  }
  return false;
}

function processTransferListedPlayerInterest(){
  if(!isTransferWindowOpen()) return;
  if(!state.transferListingMeta) state.transferListingMeta={};

  const day=typeof currentCareerDay==="function"?currentCareerDay():0;
  const listed=squad(state.club).filter(p=>state.playerListStatus?.[p.id]==="Transfer");
  listed.forEach(p=>{
    if(state.incomingTransferOffers.some(o=>String(o.playerId)===String(p.id) && o.status==="pending")) return;

    const meta=state.transferListingMeta[p.id]||(state.transferListingMeta[p.id]={
      listedDay:day,lastMarketCheckDay:null,failedChecks:0
    });
    const daysListed=Math.max(0,day-(meta.listedDay??day));
    const sinceCheck=meta.lastMarketCheckDay==null?99:day-meta.lastMarketCheckDay;
    if(sinceCheck<2) return;

    // Active marketing: roughly 16% daily initially, rising if the player
    // remains unsold. This is separate from normal unsolicited offers.
    const chance=clamp(0.16+(meta.failedChecks||0)*0.035+Math.min(0.10,daysListed*0.008),0.16,0.42);
    if(Math.random()<chance){
      const made=createIncomingOfferForPlayer(p,{listed:true});
      meta.lastMarketCheckDay=day;
      if(!made) meta.failedChecks=(meta.failedChecks||0)+1;
    }else if(sinceCheck>=3){
      meta.lastMarketCheckDay=day;
      meta.failedChecks=(meta.failedChecks||0)+1;
    }
  });
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
  q("transferFileSub").textContent=`${offer.buyingClub} • ${offer.buyerCompetition||buyerCompetitionLabel(offer.buyingClub)} → ${state.club}`;
  q("transferFileBody").innerHTML=`
    <div class="transfer-grid">
      <div class="transfer-metric"><span>Offer</span><b>${money(offer.fee)}</b></div>
      <div class="transfer-metric"><span>Buying club</span><b>${offer.buyingClub}</b><div class="muted small">${offer.buyerCompetition||buyerCompetitionLabel(offer.buyingClub)}</div></div>
      <div class="transfer-metric"><span>Market value</span><b>${money(v.p.value)}</b></div>
      <div class="transfer-metric"><span>Internal fair-value estimate</span><b>${money(v.fair)}</b></div>
      <div class="transfer-metric"><span>Player morale</span><b>${state.playerMorale?.[v.p.id]||"Content"}</b></div>
      <div class="transfer-metric"><span>Manager view</span><b>${v.manager}</b></div>
      <div class="transfer-metric"><span>DOF view</span><b>${v.dof}</b></div>
    </div>
    ${playerSaleDecisionStatsHTML(v.p)}
    ${financialRegulationTransferPreviewHTML(v.p,offer.fee,0,4,"sell")}
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

    // Capture the stakeholder/SCR context while the player is still ours, but
    // do not apply any reaction until the transfer has actually completed.
    const saleStakeholderContext={
      wasStar:isClubStarPlayer(p,oldClub),
      currentSCR:typeof userSCRSnapshot==="function"?userSCRSnapshot():null,
      projectedSCR:typeof projectSCRAfterSale==="function"?projectSCRAfterSale(p,offer.fee):null
    };

    const buyerWage=offer.expectedWage||transferBuyerExpectedWage(p,buyer);
    const affordability=transferBuyerCanAfford(buyer,p,offer.fee,buyerWage);
    if(!affordability.ok){
      offer.status="rejected";
      addNews(`${buyer} withdrew their offer for ${p.name} because they could no longer complete the deal within their financial limits.`);
      closeTransferPlayerFile();
      saveGame(false);
      renderAll();
      return;
    }

    registerManagerSquadVacancy(p,oldClub);
    if(typeof registerRegulatedSale==="function") registerRegulatedSale(p);
    state.budget+=offer.fee;
    if(state.transferFinance) state.transferFinance.received=(state.transferFinance.received||0)+offer.fee;
    if(state.monthlyFinance) state.monthlyFinance.transferReceived=(state.monthlyFinance.transferReceived||0)+offer.fee;
    applyTransferBuyerPurchase(buyer,offer.fee,buyerWage);
    p.wage=buyerWage;
    transferPlayerToClub(p,buyer,offer.fee,oldClub);
    offer.status="accepted";

    // Only now is the sale real. Stakeholders must never react to a rejected
    // counter-offer or a deal that collapses on affordability.
    recordStarSale(p,offer.fee,oldValue,yearsAtClub,saleStakeholderContext);

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


function repairFalseRejectedSaleStakeholderReactions(){
  if(!state || state.falseSaleReactionRepairV0162c) return;
  state.falseSaleReactionRepairV0162c=true;

  const rejected=(state.incomingTransferOffers||[]).filter(o=>o.status==="rejected");
  if(!rejected.length || !state.stakeholderHistory || !state.happiness) return;

  rejected.forEach(offer=>{
    const p=DB.players.find(x=>String(x.id)===String(offer.playerId));
    if(!p || p.club!==state.club) return;

    const reasons={
      fans:[
        `Necessary SCR-driven sale of star player ${p.name}`,
        `Sale of star player ${p.name}`
      ],
      manager:[
        `Key player ${p.name} sold to improve SCR compliance`
      ],
      owners:[
        `Sale of ${p.name} improves financial compliance`,
        `Strong fee received for ${p.name}`,
        `Poor value received for ${p.name}`
      ]
    };

    Object.entries(reasons).forEach(([group,labels])=>{
      const history=state.stakeholderHistory[group];
      if(!Array.isArray(history)) return;

      // Remove and reverse only the most recent matching false-sale entry for
      // this rejected offer. This keeps the migration deliberately narrow.
      for(let i=history.length-1;i>=0;i--){
        const h=history[i];
        if(labels.includes(h?.reason)){
          const delta=Number(h.delta||0);
          state.happiness[group]=clamp((state.happiness[group]??70)-delta,0,100);
          history.splice(i,1);
          break;
        }
      }
    });
  });
}

function runAITransferReview(){
  ensureTransferMarketState();
  const key=typeof currentCalendarWeekKey==="function"?currentCalendarWeekKey():String(state.week);
  if(state.transferReviewsRun[key]) return;
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

function processTransferDay(){
  ensureContractState();
  ensureAIClubFinances();

  const windowActive=isTransferWindowOpen();
  if(!windowActive) return;

  // Transfer-listed players are actively marketed every day, separately from
  // the normal unsolicited-offer market.
  processTransferListedPlayerInterest();

  // Convert the old weekly probabilities to daily probabilities.
  if(Math.random()<(1-Math.pow(1-0.24,1/7))) generateIncomingOffer();
  if(Math.random()<(1-Math.pow(1-0.34,1/7))) simulateOneAITransfer();
}

function processTransferWeek(){
  // Legacy alias retained for compatibility.
  return processTransferDay();
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

  const roleLabel={
    starter:"starting",
    competition:"first-team competition",
    backup:"backup"
  }[req.squadRole] || "";
  q("managerShortlistTitle").textContent=`New ${roleLabel} ${positionLabel(req.position)} shortlist`;
  q("managerShortlistIntro").textContent=`${req.manager} has presented three realistic approaches for this ${roleLabel||"squad"} role.${req.reason?` ${req.reason}`:""}`;
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

