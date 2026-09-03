/* Football CEO core controller
   Current shared gameplay controller.
   Transfer/contract logic has now been extracted to transfers.js.
   Other systems will be moved out gradually and tested after each extraction.
*/

const LEGACY_STORAGE_KEY="footballCEO2526";
const SAVE_MANIFEST_KEY="footballCEO_saves_v1";
const SAVE_SLOT_PREFIX="footballCEO_save_";
const MAX_LOCAL_SAVES=5;
const SAVE_FORMAT_VERSION=1;
let activeSaveId=null;
let lastSaveTimestamp=null;

const BASE_PLAYER_SNAPSHOT=DB.players.map(p=>({...p}));

function resetWorldDatabase(){
  // Restore the shared in-memory database to its pristine starting state.
  // Every career then reapplies only its own saved world overrides.
  DB.players.length=0;
  BASE_PLAYER_SNAPSHOT.forEach(p=>DB.players.push({...p}));
}


const MANAGER_POOL = [
  {name:"Mikel Arteta",rating:89},{name:"Unai Emery",rating:88},{name:"Andoni Iraola",rating:83},
  {name:"Keith Andrews",rating:72},{name:"Fabian Hürzeler",rating:80},{name:"Scott Parker",rating:75},
  {name:"Enzo Maresca",rating:84},{name:"Oliver Glasner",rating:82},{name:"David Moyes",rating:79},
  {name:"Marco Silva",rating:82},{name:"Daniel Farke",rating:76},{name:"Arne Slot",rating:90},
  {name:"Pep Guardiola",rating:94},{name:"Ruben Amorim",rating:84},{name:"Eddie Howe",rating:84},
  {name:"Nuno Espírito Santo",rating:80},{name:"Régis Le Bris",rating:74},{name:"Thomas Frank",rating:84},
  {name:"Graham Potter",rating:80},{name:"Vítor Pereira",rating:78},
  {name:"Xavi",rating:85},{name:"Roberto De Zerbi",rating:83},{name:"Maurizio Sarri",rating:82},
  {name:"Edin Terzić",rating:81},{name:"Gareth Southgate",rating:79}
];

const DOF_POOL = [
  {name:"Andrea Berta",rating:90},{name:"Monchi",rating:88},{name:"Michael Edwards",rating:92},
  {name:"Paul Mitchell",rating:86},{name:"Dan Ashworth",rating:87},{name:"Txiki Begiristain",rating:93},
  {name:"Dougie Freedman",rating:84},{name:"Richard Hughes",rating:85},{name:"Roberto Olabe",rating:88},
  {name:"Johannes Spors",rating:82},{name:"Lee Congerton",rating:79},{name:"Tiago Pinto",rating:84},
  {name:"Ramon Planes",rating:83},{name:"Victor Orta",rating:78},{name:"Javier Ribalta",rating:80},
  {name:"Simon Rolfes",rating:89},{name:"Sven Mislintat",rating:85},{name:"Markus Krösche",rating:91}
];

const PHYSIO_POOL = [
  {name:"Gary Lewin",rating:91},{name:"Dave Fevre",rating:89},{name:"Chris Morgan",rating:86},
  {name:"Steve Allen",rating:84},{name:"Andrew Rolls",rating:88},{name:"Rob Price",rating:87},
  {name:"Adam Brett",rating:82},{name:"Matt Konopinski",rating:90},{name:"Steve Kemp",rating:85},
  {name:"John Fearn",rating:83},{name:"Robin Sadler",rating:88},{name:"Nick Court",rating:80},
  {name:"Tom Allen",rating:78},{name:"Paul Catterson",rating:81},{name:"Mark Leather",rating:79},
  {name:"Ben Rosenblatt",rating:86},{name:"Craig Purdham",rating:84},{name:"Chris Neville",rating:82}
];

function managerClub(name){
  const c=DB.clubs.find(x=>(state?.staffAssignments?.managers?.[x.name] || x.manager)===name);
  return c ? c.name : null;
}

function managerCompensation(candidate){
  const currentClub=managerClub(candidate.name);
  if(!currentClub) return 0;
  const clubRep=byClub(currentClub)?.reputation || 70;
  const base=(candidate.rating-65)*650000;
  const repPremium=Math.max(0,(clubRep-70))*180000;
  return Math.max(1_000_000,Math.round((base+repPremium)/250000)*250000);
}

function staffSalary(role,rating){
  const bases={manager:18000,dof:12000,physio:7000};
  const slopes={manager:5200,dof:3600,physio:2100};
  return Math.round((bases[role]+Math.max(0,rating-65)*slopes[role])/1000)*1000;
}

function dofNegotiationModifier(){
  const r=state?.staff?.dof?.rating || 65;
  // 95 => 20% cheaper; 85 => ~13% cheaper; 75 => ~5% cheaper;
  // below 70 starts making elite players more expensive.
  if(r>=75) return clamp(1 - ((r-70)/25)*0.20,0.80,0.96);
  return clamp(1 + ((70-r)/20)*0.12,1.00,1.12);
}

function physioInjuryChanceModifier(){
  const r=state?.staff?.physio?.rating || 65;
  return clamp(1.20 - (r-60)*0.012,0.62,1.20);
}

function physioRecoveryModifier(){
  const r=state?.staff?.physio?.rating || 65;
  return clamp(1.18 - (r-60)*0.011,0.68,1.18);
}

function staffInitialForClub(club){
  const managerName=byClub(club).manager;
  const mgr=MANAGER_POOL.find(x=>x.name===managerName) || {name:managerName,rating:78};
  const seed=byClub(club).reputation;
  const dofRating=clamp(Math.round(seed-4),68,89);
  const physioRating=clamp(Math.round(seed-7),66,87);
  return {
    manager:{...mgr,wage:staffSalary("manager",mgr.rating)},
    dof:{name:`${club} Football Director`,rating:dofRating,wage:staffSalary("dof",dofRating)},
    physio:{name:`${club} Head Physio`,rating:physioRating,wage:staffSalary("physio",physioRating)}
  };
}



function ensurePlayerState(){
  ensureContractState();
  if(!state.playerStats) state.playerStats={};
  if(!state.playerMorale) state.playerMorale={};
  squad(state.club).forEach(p=>{
    if(!state.playerStats[p.id]) state.playerStats[p.id]={appearances:0,starts:0,goals:0,assists:0,ratingTotal:0,ratedApps:0,lastRating:null};
    const ps=state.playerStats[p.id];
    if(ps.starts==null) ps.starts=0;
    if(ps.assists==null) ps.assists=0;
    if(ps.ratingTotal==null) ps.ratingTotal=0;
    if(ps.ratedApps==null) ps.ratedApps=0;
    if(ps.lastRating===undefined) ps.lastRating=null;
    if(!state.playerMorale[p.id]) state.playerMorale[p.id]="Content";
  });
}


/* --------------------------------------------------------------------------
   SQUAD CONDITION & WORKLOAD — v0.17.2
   -------------------------------------------------------------------------- */
function ensureFitnessState(){
  if(!state.playerCondition) state.playerCondition={};
  if(!state.playerMinuteLog) state.playerMinuteLog={};
  if(state._fitnessInitialized) return;
  const activeClubNames=new Set((DB.clubs||[]).map(c=>c.name));
  DB.players.forEach(p=>{
    if(!activeClubNames.has(p.club)) return;
    if(state.playerCondition[p.id]==null){
      const seed=((String(p.id).split("").reduce((s,c)=>s+c.charCodeAt(0),0)%5));
      state.playerCondition[p.id]=96+seed;
    }
    if(!state.playerMinuteLog[p.id]) state.playerMinuteLog[p.id]=[];
  });
  state._fitnessInitialized=true;
}

function playerCondition(pOrId){
  ensureFitnessState();
  const id=typeof pOrId==="object"?pOrId.id:pOrId;
  return clamp(Number(state.playerCondition[id]??100),20,100);
}

function workloadMinutes(pOrId,days=14){
  ensureFitnessState();
  const id=typeof pOrId==="object"?pOrId.id:pOrId;
  const today=typeof currentCareerDay==="function"?currentCareerDay():0;
  return (state.playerMinuteLog[id]||[])
    .filter(x=>today-(x.day??today)<=days)
    .reduce((s,x)=>s+(x.minutes||0),0);
}

function playerWorkloadLabel(pOrId){
  const mins=workloadMinutes(pOrId,14);
  if(mins>=360) return "Very heavy";
  if(mins>=250) return "Heavy";
  if(mins>=120) return "Normal";
  return "Light";
}

function playerConditionLabel(pOrId){
  const c=playerCondition(pOrId);
  if(c>=90) return "Fresh";
  if(c>=75) return "Good";
  if(c>=60) return "Tired";
  if(c>=45) return "Fatigued";
  return "High risk";
}

function playerConditionClass(pOrId){
  const c=playerCondition(pOrId);
  if(c>=75) return "good";
  if(c>=60) return "warn";
  return "bad";
}

function conditionPerformanceMultiplier(condition){
  const c=clamp(Number(condition||100),20,100);
  if(c>=90) return 1;
  if(c>=80) return 0.99;
  if(c>=70) return 0.965;
  if(c>=60) return 0.93;
  if(c>=50) return 0.885;
  if(c>=40) return 0.82;
  return 0.74;
}

function recordPlayerMinutes(player,minutes,club=player?.club){
  if(!player || minutes<=0) return;
  ensureFitnessState();
  if(state.playerCondition[player.id]==null) state.playerCondition[player.id]=100;
  if(!state.playerMinuteLog[player.id]) state.playerMinuteLog[player.id]=[];
  const day=typeof currentCareerDay==="function"?currentCareerDay():0;
  state.playerMinuteLog[player.id].push({day,minutes,club});
  state.playerMinuteLog[player.id]=state.playerMinuteLog[player.id]
    .filter(x=>day-(x.day??day)<=21)
    .slice(-12);

  const profile=typeof managerProfileForClub==="function"?managerProfileForClub(club):null;
  const intensity=profile
    ? 0.94+((profile.pressing||65)-65)*0.0022+((profile.verticality||65)-65)*0.0008
    : 1;
  const age=player.age||25;
  const ageMult=age>=32?1.10:age>=29?1.05:age<=22?0.96:1;
  const loss=(4.5+minutes*0.155)*intensity*ageMult;
  state.playerCondition[player.id]=clamp(playerCondition(player)-loss,20,100);
}

function processDailyConditionRecovery(){
  ensureFitnessState();
  const medical=typeof facilityRating==="function"?facilityRating("medical"):70;
  const physio=state.staff?.physio?.rating||70;
  const activeClubNames=new Set((DB.clubs||[]).map(c=>c.name));

  DB.players.forEach(p=>{
    if(!activeClubNames.has(p.club)) return;
    const current=Number(state.playerCondition[p.id]??100);
    const age=p.age||25;
    let recovery=5.0;
    if(age<=23) recovery+=0.5;
    if(age>=30) recovery-=0.45;
    if(age>=33) recovery-=0.35;

    if(p.club===state.club){
      recovery+=(medical-70)*0.018+(physio-70)*0.012;
    }
    if(state.injuries?.[p.id]) recovery*=0.75;

    state.playerCondition[p.id]=clamp(current+recovery,20,100);
  });
}

function fatigueInjuryRiskMultiplier(player){
  const c=playerCondition(player);
  if(c>=70) return 1;
  if(c>=60) return 1.15;
  if(c>=50) return 1.45;
  if(c>=40) return 1.9;
  return 2.5;
}

function playerMoraleClass(m){
  if(m==="Happy") return "morale-happy";
  if(m==="Content") return "morale-content";
  if(m==="Unhappy") return "morale-unhappy";
  return "morale-leave";
}

function updateIndividualMorale(){
  ensurePlayerState();
  const teamMood=state.happiness?.players ?? 70;
  const mgrChanges=state.managerChangesThisSeason||0;
  const trainingStandard=facilityRating("training");
  squad(state.club).forEach(p=>{
    let score=teamMood;
    if(state.injuries?.[p.id]) score-=4;
    if(mgrChanges>=2) score-=8;
    if(p.overall>=82 && trainingStandard<72) score-=6;
    else if(p.overall>=78 && trainingStandard<65) score-=4;
    else if(trainingStandard>=88) score+=2;
    const pos=clubLeaguePosition(state.club), target=byClub(state.club).target||10;
    if(state.week>=8 && p.overall>=82 && pos>=target+4) score-=7;
    if(score>=80) state.playerMorale[p.id]="Happy";
    else if(score>=58) state.playerMorale[p.id]="Content";
    else if(score>=38) state.playerMorale[p.id]="Unhappy";
    else state.playerMorale[p.id]="Wants to leave";
  });
}


function playerAverageRating(pOrId){
  const id=typeof pOrId==="object"?pOrId.id:pOrId;
  const s=state.playerStats?.[id];
  if(!s || !s.ratedApps) return null;
  return s.ratingTotal/s.ratedApps;
}

function selectMatchSquad(){
  ensurePlayerState();
  const healthy=squad(state.club).filter(p=>!state.injuries?.[p.id]).sort((a,b)=>b.overall-a.overall);
  return healthy.slice(0,11);
}

function weightedPick(players,weightFn,excludeIds=new Set()){
  const usable=players.filter(p=>!excludeIds.has(String(p.id)));
  if(!usable.length) return null;
  const weights=usable.map(p=>Math.max(0.1,weightFn(p)));
  const total=weights.reduce((a,b)=>a+b,0);
  let r=Math.random()*total;
  for(let i=0;i<usable.length;i++){
    r-=weights[i];
    if(r<=0) return usable[i];
  }
  return usable[usable.length-1];
}

function trackPlayerMatchStats(myGoals,oppGoals=0,matchSelection=null,matchFlow={}){
  ensurePlayerState();

  const selection=matchSelection || (typeof managerSelectMatchdaySquad==="function"
    ? managerSelectMatchdaySquad(state.club)
    : {formation:"4-2-3-1",xi:selectMatchSquad().map((p,i)=>({slot:"",slotIndex:i,player:p,playerId:p.id,suitability:100})),bench:[]});

  const usage=matchFlow.usage||buildMatchUsage(selection,matchFlow.substitutions||[]);
  const substitutions=matchFlow.substitutions||[];

  const participantEntries=[];
  const seen=new Set();

  selection.xi.forEach(x=>{
    if(!x.player) return;
    const mins=usage.minutes?.[x.player.id]??90;
    participantEntries.push({...x,minutes:mins,started:true});
    seen.add(String(x.player.id));
  });

  (selection.bench||[]).forEach(p=>{
    const mins=usage.minutes?.[p.id]||0;
    if(mins<=0 || seen.has(String(p.id))) return;
    const slot=usage.slots?.[p.id]||"CM";
    participantEntries.push({
      player:p,playerId:p.id,slot,slotIndex:null,
      suitability:typeof positionSuitability==="function"?positionSuitability(p,slot):100,
      minutes:mins,started:false
    });
    seen.add(String(p.id));
  });

  participantEntries.forEach(x=>{
    const p=x.player;
    if(!state.playerStats[p.id]) state.playerStats[p.id]={appearances:0,starts:0,goals:0,assists:0};
    const s=state.playerStats[p.id];
    if(x.minutes>0) s.appearances=(s.appearances||0)+1;
    if(x.started) s.starts=(s.starts||0)+1;
    s.minutes=(s.minutes||0)+x.minutes;
  });

  const goalsByPlayer={};
  const assistsByPlayer={};
  const goalEvents=[];

  const weightedLineupPick=(entries,weightFn,excludeIds=new Set())=>{
    const usable=entries.filter(x=>x.player && x.minutes>0 && !excludeIds.has(String(x.player.id)));
    if(!usable.length) return null;
    const weights=usable.map(x=>Math.max(0.001,weightFn(x)));
    const total=weights.reduce((a,b)=>a+b,0);
    let r=Math.random()*total;
    for(let i=0;i<usable.length;i++){
      r-=weights[i];
      if(r<=0) return usable[i];
    }
    return usable[usable.length-1];
  };

  const qualityMultiplier=x=>{
    const p=x.player;
    const ability=Math.pow(1.05,clamp((p.overall||72)-75,-15,15));
    const suitability=0.78+0.22*clamp(Number(x.suitability??100),0,100)/100;
    const minuteShare=clamp((x.minutes||0)/90,0.08,1);
    const fitness=conditionPerformanceMultiplier(playerCondition(p));
    return ability*suitability*Math.sqrt(minuteShare)*fitness;
  };

  const openPlayScorerBase={
    ST:8.0,RW:5.2,LW:5.2,AM:4.5,RM:3.4,LM:3.4,
    CM:1.8,DM:0.82,RB:0.38,LB:0.38,CB:0.13,GK:0.005
  };
  const setPieceScorerBase={
    ST:4.2,RW:2.1,LW:2.1,AM:2.5,RM:2.0,LM:2.0,
    CM:2.0,DM:1.8,RB:0.95,LB:0.95,CB:2.25,GK:0.01
  };
  const penaltyScorerBase={
    ST:7.0,RW:4.0,LW:4.0,AM:5.0,RM:3.5,LM:3.5,
    CM:3.0,DM:1.6,RB:0.45,LB:0.45,CB:0.30,GK:0.01
  };
  const assistBase={
    ST:2.6,RW:5.0,LW:5.0,AM:5.5,RM:4.2,LM:4.2,
    CM:3.8,DM:1.8,RB:2.7,LB:2.7,CB:0.45,GK:0.04
  };

  for(let i=0;i<myGoals;i++){
    const roll=Math.random();
    const goalType=roll<0.08?"penalty":roll<0.22?"set-piece":"open-play";
    const scorerMap=goalType==="penalty"?penaltyScorerBase:goalType==="set-piece"?setPieceScorerBase:openPlayScorerBase;

    const scorerEntry=weightedLineupPick(participantEntries,x=>(scorerMap[x.slot]??0.9)*qualityMultiplier(x));
    if(!scorerEntry) break;
    const scorer=scorerEntry.player;

    state.playerStats[scorer.id].goals=(state.playerStats[scorer.id].goals||0)+1;
    goalsByPlayer[scorer.id]=(goalsByPlayer[scorer.id]||0)+1;

    let assisterEntry=null;
    if(goalType!=="penalty" && Math.random()<0.80){
      assisterEntry=weightedLineupPick(
        participantEntries,
        x=>(assistBase[x.slot]??1.0)*qualityMultiplier(x),
        new Set([String(scorer.id)])
      );
      if(assisterEntry){
        const assister=assisterEntry.player;
        state.playerStats[assister.id].assists=(state.playerStats[assister.id].assists||0)+1;
        assistsByPlayer[assister.id]=(assistsByPlayer[assister.id]||0)+1;
      }
    }

    goalEvents.push({
      scorerId:scorer.id,
      scorerName:scorer.name,
      scorerSlot:scorerEntry.slot,
      assisterId:assisterEntry?.player?.id||null,
      assisterName:assisterEntry?.player?.name||null,
      assisterSlot:assisterEntry?.slot||null,
      type:goalType
    });
  }

  const resultBase=myGoals>oppGoals?0.45:myGoals===oppGoals?0.05:-0.35;
  const playerMatchData={};

  participantEntries.forEach(x=>{
    const p=x.player;
    if(!p || x.minutes<=0) return;

    const quality=((p.overall||75)-75)*0.018;
    const goalBonus=(goalsByPlayer[p.id]||0)*0.70;
    const assistBonus=(assistsByPlayer[p.id]||0)*0.38;
    const minutesFactor=x.minutes<30?-0.05:x.minutes<60?0:0.04;
    const variance=(Math.random()-.5)*0.95;
    let rating=6.40+resultBase+quality+goalBonus+assistBonus+minutesFactor+variance;

    if(x.slot==="GK" && oppGoals===0) rating+=0.35;
    if((x.slot==="CB"||x.slot==="LB"||x.slot==="RB") && oppGoals===0) rating+=0.22;
    if((x.slot==="DM"||x.slot==="CM") && oppGoals===0) rating+=0.10;

    rating=clamp(Math.round(rating*10)/10,4.0,10.0);
    const s=state.playerStats[p.id];
    s.lastRating=rating;
    s.ratingTotal=(s.ratingTotal||0)+rating;
    s.ratedApps=(s.ratedApps||0)+1;

    playerMatchData[p.id]={
      playerId:p.id,name:p.name,slot:x.slot,slotIndex:x.slotIndex,
      rating,goals:goalsByPlayer[p.id]||0,assists:assistsByPlayer[p.id]||0,
      overall:p.overall||0,suitability:x.suitability??100,
      minutes:x.minutes,
      started:x.started
    };
  });

  return {
    formation:selection.formation,
    lineup:selection.xi.map(x=>x.player ? playerMatchData[x.player.id] : {
      playerId:null,name:"Vacant",slot:x.slot,slotIndex:x.slotIndex,rating:null,goals:0,assists:0,suitability:0,minutes:0
    }),
    bench:(selection.bench||[]).map(p=>({
      playerId:p.id,name:p.name,overall:p.overall||0,
      minutes:usage.minutes?.[p.id]||0,
      rating:playerMatchData[p.id]?.rating??null,
      goals:goalsByPlayer[p.id]||0,
      assists:assistsByPlayer[p.id]||0
    })),
    substitutions,
    goalEvents
  };
}


// v0.18 overrides the legacy ui.js database renderer so recruitment browsing
// can expose market value, expected cost and AI availability without changing
// the older shared UI module.


function openPlayerProfile(id){
  ensurePlayerState();
  const p=DB.players.find(x=>String(x.id)===String(id));
  if(!p) return;
  const stats=state.playerStats[p.id]||{appearances:0,goals:0};
  const morale=state.playerMorale[p.id]||"Content";

  q("profileName").textContent=p.name;
  const isStar=typeof isClubStarPlayer==="function" && p.club===state.club && isClubStarPlayer(p,state.club);
  const activeLoan=typeof activeLoanForPlayer==="function"?activeLoanForPlayer(p):null;
  const loanStatus=activeLoan?(activeLoan.parentClub===state.club?` • On loan at ${activeLoan.loanClub}`:activeLoan.loanClub===state.club?` • On loan from ${activeLoan.parentClub}`:""):"";
  q("profileSubtitle").innerHTML=`${p.retired?"Retired":p.club} • ${p.positions}${loanStatus}${isStar?` <span class="star-player-badge profile-star-badge">★ STAR PLAYER</span>`:""}`;
  const ovrChange=playerSeasonOverallChange(p);
  q("profileOverall").textContent=`${p.overall}${ovrChange?` (${ovrChange>0?"+":""}${ovrChange})`:""}`;
  q("profileMorale").textContent=morale;
  q("profileMorale").className="v "+playerMoraleClass(morale);
  q("profileApps").textContent=stats.appearances||0;
  if(q("profileStarts")) q("profileStarts").textContent=stats.starts||0;
  q("profileGoals").textContent=stats.goals||0;
  if(q("profileAssists")) q("profileAssists").textContent=stats.assists||0;
  if(q("profileAvgRating")) q("profileAvgRating").textContent=playerAverageRating(p.id)?.toFixed(2)||"—";
  q("profileJoined").textContent=p.joined || "Unknown";
  q("profileAge").textContent=p.age;
  q("profileNationality").textContent=p.nationality;
  const contract=state.playerContracts[p.id]||{wage:p.wage,endYear:p.contract};
  q("profileContract").textContent=contract.endYear;
  q("profilePosition").textContent=p.positions;
  if(typeof recalculateAllPlayerMarketValues==="function") recalculateAllPlayerMarketValues();
  q("profileValue").textContent=money(typeof dynamicPlayerMarketValue==="function"?dynamicPlayerMarketValue(p):p.value);
  if(q("profileDevelopment")) q("profileDevelopment").innerHTML=`${playerDevelopmentStatus(p)}<br><span class="muted small">${playerSeasonOverallChange(p)>0?"+":""}${playerSeasonOverallChange(p)} OVR this season</span>`;
  q("profileWage").textContent=money(contract.wage)+"/wk";
  if(q("profileManagerRole")) q("profileManagerRole").textContent=typeof managerInternalSquadRole==="function"?managerInternalSquadRole(p,state.club):"—";
  q("profileAvailability").innerHTML=p.retired
    ? `<span class="muted"><b>Retired from professional football</b></span>`
    : state.injuries?.[p.id]
      ? `<span class="bad">Injured — ${state.injuries[p.id].daysRemaining??state.injuries[p.id].weeksLeft*7} day${(state.injuries[p.id].daysRemaining??state.injuries[p.id].weeksLeft*7)===1?"":"s"} remaining</span>`
      : `<span class="${playerConditionClass(p)}">${Math.round(playerCondition(p))}% • ${playerConditionLabel(p)}</span><br><span class="muted small">Workload: ${playerWorkloadLabel(p)} • ${workloadMinutes(p,14)} mins / 14 days</span>`;

  const listStatus=state.playerListStatus[p.id]||"None";
  if(q("profileSupporterStatus")){
    q("profileSupporterStatus").innerHTML=isStar
      ? `<span class="star-player-warning">★ Star player — selling may cause supporter unrest</span>`
      : `<span class="muted">No special star-player sale penalty</span>`;
  }

  q("profileListStatus").innerHTML=listStatus==="Transfer"
    ? `<span class="listed-badge listed-transfer">Transfer listed</span>`
    : listStatus==="Loan"
      ? `<span class="listed-badge listed-loan">Loan listed</span>`
      : "Not listed";

  q("negotiateContractBtn").dataset.playerId=p.id;
  q("transferListBtn").dataset.playerId=p.id;
  q("loanListBtn").dataset.playerId=p.id;
  const incomingLoan=Boolean(activeLoan&&activeLoan.loanClub===state.club&&activeLoan.parentClub!==state.club);
  const recallableLoan=Boolean(activeLoan&&activeLoan.parentClub===state.club&&activeLoan.recallAllowed);
  q("negotiateContractBtn").disabled=Boolean(p.retired||incomingLoan);
  q("transferListBtn").disabled=Boolean(p.retired||activeLoan);
  q("loanListBtn").disabled=Boolean(p.retired||(activeLoan&&!recallableLoan));
  q("transferListBtn").textContent=listStatus==="Transfer"?"Remove from transfer list":"Add to transfer list";
  q("loanListBtn").textContent=recallableLoan?"Recall from loan":listStatus==="Loan"?"Remove from loan list":"Add to loan list";
  q("contractNegotiation")?.classList.add("hide");

  q("playerModal").classList.remove("hide");
}


function closePlayerProfile(){
  q("playerModal")?.classList.add("hide");
}

function ensureStaffState(){
  if(!state.staff) state.staff=staffInitialForClub(state.club);
  if(!state.staffAssignments){
    state.staffAssignments={managers:{}};
    DB.clubs.forEach(c=>state.staffAssignments.managers[c.name]=c.manager);
    state.staffAssignments.managers[state.club]=state.staff.manager.name;
  }
  if(!state.injuries) state.injuries={};
  if(state.staffSpend==null) state.staffSpend=0;
}

function injuryBaseDuration(){
  const roll=Math.random();
  if(roll<0.55) return 2+Math.floor(Math.random()*3);
  if(roll<0.85) return 5+Math.floor(Math.random()*5);
  return 10+Math.floor(Math.random()*9);
}

function processInjuries(){
  ensureStaffState();
  ensureCalendarState();

  const medical=typeof facilityRating==="function" ? facilityRating("medical") : 70;
  const medicalModifier=clamp(1-(medical-50)*0.006,0.65,1.18);

  // Existing injuries recover every calendar day.
  Object.keys(state.injuries).forEach(pid=>{
    const injury=state.injuries[pid];
    if(injury.daysRemaining==null) injury.daysRemaining=Math.max(1,(injury.weeksLeft||1)*7);

    injury.daysRemaining-=1;
    if(medical>=85 && injury.daysRemaining>2 && Math.random()<0.20/7){
      injury.daysRemaining-=1;
    }
    injury.weeksLeft=Math.max(0,Math.ceil(injury.daysRemaining/7));

    if(injury.daysRemaining<=0){
      const p=DB.players.find(x=>String(x.id)===String(pid));
      if(p) addNews(`${p.name} has returned to full training.`);
      delete state.injuries[pid];
      scheduleManagerReassessment(1);
    }
  });

  // Convert old weekly ~0.55% per-player risk to an equivalent daily probability.
  const healthy=squad(state.club).filter(p=>!state.injuries[p.id]);
  const weeklyChance=0.0055*physioInjuryChanceModifier()*medicalModifier;
  const dailyChance=1-Math.pow(1-weeklyChance,1/7);

  healthy.forEach(p=>{
    const fatigueRisk=typeof fatigueInjuryRiskMultiplier==="function"?fatigueInjuryRiskMultiplier(p):1;
    if(Math.random()<dailyChance*fatigueRisk){
      const rawWeeks=injuryBaseDuration();
      const facilityRecovery=clamp(1-(medical-70)*0.004,0.86,1.08);
      const days=Math.max(3,Math.round(rawWeeks*7*physioRecoveryModifier()*facilityRecovery));
      state.injuries[p.id]={
        daysRemaining:days,totalDays:days,
        weeksLeft:Math.ceil(days/7),totalWeeks:Math.ceil(days/7)
      };
      if(typeof ensurePlayerMarketState==="function"){
        ensurePlayerMarketState();
        const market=state.playerMarket[String(p.id)];
        market.injuryDaysCareer=(market.injuryDaysCareer||0)+days;
        if(days>=90) market.longInjuries=(market.longInjuries||0)+1;
        if(days>=105) market.severeInjuriesThisSeason=(market.severeInjuriesThisSeason||0)+1;
      }
      addNews(`${p.name} has suffered an injury and is expected to miss around ${days} day${days===1?"":"s"}.`);
      if(days>=14){
        if(typeof primaryRecruitmentGroup==="function" && typeof markManagerRecruitmentMaterialChange==="function"){
          const group=primaryRecruitmentGroup(p);
          if(group) markManagerRecruitmentMaterialChange(group);
        }else{
          scheduleManagerReassessment(1);
        }
      }
    }
  });
}

let state=null;
let squadView="stats";

const STADIUMS={
  "Arsenal":{name:"Emirates Stadium",capacity:60704},
  "Aston Villa":{name:"Villa Park",capacity:42657},
  "Bournemouth":{name:"Vitality Stadium",capacity:11307},
  "Brentford":{name:"Gtech Community Stadium",capacity:17250},
  "Brighton":{name:"Amex Stadium",capacity:31876},
  "Burnley":{name:"Turf Moor",capacity:21944},
  "Chelsea":{name:"Stamford Bridge",capacity:40341},
  "Crystal Palace":{name:"Selhurst Park",capacity:25486},
  "Everton":{name:"Hill Dickinson Stadium",capacity:52888},
  "Fulham":{name:"Craven Cottage",capacity:29600},
  "Leeds United":{name:"Elland Road",capacity:37645},
  "Liverpool":{name:"Anfield",capacity:61276},
  "Manchester City":{name:"Etihad Stadium",capacity:53400},
  "Manchester United":{name:"Old Trafford",capacity:74310},
  "Newcastle United":{name:"St James' Park",capacity:52305},
  "Nottingham Forest":{name:"City Ground",capacity:30404},
  "Sunderland":{name:"Stadium of Light",capacity:49000},
  "Tottenham Hotspur":{name:"Tottenham Hotspur Stadium",capacity:62850},
  "West Ham United":{name:"London Stadium",capacity:62500},
  "Wolverhampton Wanderers":{name:"Molineux",capacity:31750}
};

function defaultPricing(club){
  const rep=byClub(club).reputation;
  return {
    ticket: Math.round(22 + rep*0.30),
    concession: Math.round(10 + rep*0.14),
    hospitality: Math.round(110 + rep*2.1),
    food: Math.round((4.5 + rep*0.065)*2)/2
  };
}

function recommendedPricing(club){
  return defaultPricing(club);
}

function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }


function clubLeaguePosition(club){
  if(!state?.table) return byClub(club).target || 10;
  const arr=Object.entries(state.table).map(([name,x])=>({name,...x,gd:x.gf-x.ga}))
    .sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf);
  const idx=arr.findIndex(x=>x.name===club);
  return idx>=0 ? idx+1 : (byClub(club).target||10);
}

function recentPointsPerGame(){
  const f=state?.form||[];
  if(!f.length) return 0;
  const pts=f.reduce((s,r)=>s+(r==="W"?3:r==="D"?1:0),0);
  return pts/f.length;
}

function pricingPressure(){
  const rec=recommendedPricing(state.club),p=state.pricing;
  const weighted=(p.ticket/rec.ticket)*0.62+(p.concession/rec.concession)*0.18+(p.food/rec.food)*0.12+(p.hospitality/rec.hospitality)*0.08;
  return weighted-1;
}

function squadWageFairness(){
  const sq=squad(state.club);
  if(!sq.length) return 0;
  // Simplified wage fairness: compare actual wage rank with overall rank.
  const byOvr=[...sq].sort((a,b)=>b.overall-a.overall);
  const byWage=[...sq].sort((a,b)=>(b.wage||0)-(a.wage||0));
  let mismatch=0, considered=0;
  byOvr.slice(0,15).forEach((p,i)=>{
    const wr=byWage.findIndex(x=>x.id===p.id);
    if(wr>=0){ mismatch+=Math.abs(wr-i); considered++; }
  });
  const avg=considered?mismatch/considered:0;
  return clamp(1-avg/10,0,1);
}


const STAKEHOLDER_GROUPS=["fans","owners","players","manager","sponsors"];
const STAKEHOLDER_LABELS={fans:"Fans",owners:"Owners",players:"Players",manager:"Manager",sponsors:"Sponsors"};
const STAKEHOLDER_THRESHOLDS=[
  {min:80,key:"veryHappy",label:"Very happy"},
  {min:60,key:"happy",label:"Happy"},
  {min:40,key:"neutral",label:"Neutral"},
  {min:25,key:"unhappy",label:"Unhappy"},
  {min:10,key:"veryUnhappy",label:"Very unhappy"},
  {min:0,key:"crisis",label:"Crisis"}
];

function stakeholderBand(score){
  const v=clamp(Number(score??70),0,100);
  return STAKEHOLDER_THRESHOLDS.find(x=>v>=x.min)||STAKEHOLDER_THRESHOLDS[STAKEHOLDER_THRESHOLDS.length-1];
}

function ensureStakeholderState(){
  if(!state) return;
  if(!state.happiness) state.happiness={};
  const defaults={fans:74,owners:72,players:76,manager:80,sponsors:70};
  STAKEHOLDER_GROUPS.forEach(key=>{
    if(state.happiness[key]==null) state.happiness[key]=defaults[key];
    // Stakeholder scores are whole-number percentages. Older saves may contain
    // fractional values from the previous high/low-score damping model.
    state.happiness[key]=clamp(Math.round(Number(state.happiness[key]??defaults[key])),0,100);
  });

  if(!state.happinessDrivers) state.happinessDrivers={};
  STAKEHOLDER_GROUPS.forEach(key=>{
    if(!Array.isArray(state.happinessDrivers[key])) state.happinessDrivers[key]=[];
  });

  if(!state.stakeholderHistory) state.stakeholderHistory={};
  STAKEHOLDER_GROUPS.forEach(key=>{
    if(!Array.isArray(state.stakeholderHistory[key])) state.stakeholderHistory[key]=[];
    // One-time compatibility cleanup for v0.24.1 saves that recorded values such
    // as +1.2000000000000028 in the relationship history.
    state.stakeholderHistory[key]=state.stakeholderHistory[key]
      .map(entry=>({...entry,delta:Math.round(Number(entry?.delta||0))}))
      .filter(entry=>entry.delta!==0)
      .slice(0,12);
  });

  if(!state.stakeholderThresholdState) state.stakeholderThresholdState={};
  STAKEHOLDER_GROUPS.forEach(key=>{
    if(!state.stakeholderThresholdState[key]) state.stakeholderThresholdState[key]=stakeholderBand(state.happiness[key]).key;
  });

  if(!state.stakeholderMeta) state.stakeholderMeta={};
  if(state.stakeholderMeta.fanProtests==null) state.stakeholderMeta.fanProtests=0;
  if(state.stakeholderMeta.lastFanProtestDate===undefined) state.stakeholderMeta.lastFanProtestDate=null;
  if(state.stakeholderMeta.lastFanProtestWeek!==undefined && !state.stakeholderMeta.lastFanProtestDate){
    // Old package compatibility: don't try to convert old matchweek exactly.
    delete state.stakeholderMeta.lastFanProtestWeek;
  }
  if(state.stakeholderMeta.sponsorTerminationRisk==null) state.stakeholderMeta.sponsorTerminationRisk=false;
  if(!state.stakeholderMeta.ceoJobStatus) state.stakeholderMeta.ceoJobStatus="Secure";
  if(state.stakeholderMeta.managerResignationRisk==null) state.stakeholderMeta.managerResignationRisk=false;
  if(state.stakeholderMeta.playerUnrestRisk==null) state.stakeholderMeta.playerUnrestRisk=false;

  if(!state.clubReputationOverrides) state.clubReputationOverrides={};
}

function stakeholderValue(key){
  ensureStakeholderState();
  return clamp(Number(state.happiness?.[key]??70),0,100);
}

function addStakeholderHistory(key,delta,reason,kind="change"){
  ensureStakeholderState();
  const wholeDelta=Math.round(Number(delta||0));
  if(!wholeDelta || !state.stakeholderHistory[key]) return;
  state.stakeholderHistory[key].unshift({
    date:typeof currentGameDateISO==="function"?currentGameDateISO():state.calendar?.date||null,
    week:state.week||0,
    delta:wholeDelta,
    reason:reason||"Club events and stakeholder pressure",
    kind
  });
  state.stakeholderHistory[key]=state.stakeholderHistory[key].slice(0,12);
}

function strongestStakeholderDriver(key){
  const drivers=state.happinessDrivers?.[key]||[];
  if(!drivers.length) return "Club events and stakeholder pressure";
  return [...drivers].sort((a,b)=>Math.abs(b.value||0)-Math.abs(a.value||0))[0].label;
}

function updateStakeholderMeta(){
  ensureStakeholderState();
  const owners=stakeholderValue("owners");
  state.stakeholderMeta.ceoJobStatus=
    owners>=80?"Untouchable":
    owners>=60?"Secure":
    owners>=40?"Stable":
    owners>=25?"Under pressure":
    owners>=10?"At risk":"Critical";
  state.stakeholderMeta.sponsorTerminationRisk=stakeholderValue("sponsors")<10;
  state.stakeholderMeta.managerResignationRisk=stakeholderValue("manager")<10;
  state.stakeholderMeta.playerUnrestRisk=stakeholderValue("players")<25;
}

function notifyStakeholderThresholdChange(key,previousScore=null){
  ensureStakeholderState();
  const now=stakeholderValue(key);
  const current=stakeholderBand(now);
  const previousKey=previousScore==null
    ? state.stakeholderThresholdState[key]
    : stakeholderBand(previousScore).key;

  if(previousKey===current.key){
    state.stakeholderThresholdState[key]=current.key;
    return;
  }

  const old=STAKEHOLDER_THRESHOLDS.find(x=>x.key===previousKey);
  state.stakeholderThresholdState[key]=current.key;
  const worsened=old ? current.min<old.min : false;
  const improved=old ? current.min>old.min : false;

  if(worsened){
    const messages={
      fans:{
        unhappy:"SUPPORTER CONCERN: Fan happiness has fallen below 40%. Home attendance is now likely to decline.",
        veryUnhappy:"SUPPORTER UNREST: Fan happiness has fallen below 25%. Home-match protests are now possible.",
        crisis:"SUPPORTER CRISIS: Fan happiness is below 10%. Severe attendance and reputation damage are possible."
      },
      owners:{
        unhappy:"BOARD SCRUTINY: Owner confidence has fallen below 40%. The board is increasing scrutiny of the CEO.",
        veryUnhappy:"CEO UNDER PRESSURE: Owner confidence is below 25%. Your position is now at risk.",
        crisis:"CEO CRISIS: Owner confidence is below 10%. Dismissal is a serious future risk."
      },
      players:{
        unhappy:"DRESSING-ROOM CONCERN: Squad happiness has fallen below 40%. Individual unrest is more likely.",
        veryUnhappy:"DRESSING-ROOM UNREST: Squad happiness is below 25%. Player exit requests may become more common.",
        crisis:"DRESSING-ROOM CRISIS: Squad happiness is below 10%."
      },
      manager:{
        unhappy:"MANAGER FRUSTRATION: Your relationship with the manager has fallen below 40%.",
        veryUnhappy:"MANAGER FUTURE: Manager happiness is below 25%. They may begin to question their future.",
        crisis:"MANAGER RELATIONSHIP CRISIS: Happiness is below 10%. A resignation risk is now active."
      },
      sponsors:{
        unhappy:"SPONSOR CONCERN: Sponsor happiness has fallen below 40%. Future renewal terms may suffer.",
        veryUnhappy:"COMMERCIAL WARNING: Sponsor happiness is below 25%. Extra commercial opportunities may be withdrawn.",
        crisis:"SPONSOR CRISIS: Sponsor happiness is below 10%. Early termination risk is now active."
      }
    };
    const msg=messages[key]?.[current.key];
    if(msg) addNews(msg);
  }else if(improved && current.min>=40){
    addNews(`${STAKEHOLDER_LABELS[key].toUpperCase()}: Relationship has recovered to ${current.label.toLowerCase()} (${Math.round(now)}%).`);
  }
}

function stakeholderChange(key,delta,reason,{notify=true,save=false,render=false}={}){
  ensureStakeholderState();
  if(!STAKEHOLDER_GROUPS.includes(key)) return null;
  const before=stakeholderValue(key);
  // Relationship movements are deliberately discrete. Routine decisions should
  // normally sit inside -3..+3; exceptional sporting/club events can still call
  // this function with larger integer values.
  const wholeDelta=Math.round(Number(delta||0));
  const after=clamp(before+wholeDelta,0,100);
  state.happiness[key]=Math.round(after);
  const actual=after-before;
  if(actual) addStakeholderHistory(key,actual,reason,"decision");
  updateStakeholderMeta();
  if(notify) notifyStakeholderThresholdChange(key,before);
  if(save && typeof saveGame==="function") saveGame(false);
  if(render && typeof renderDashboard==="function") renderDashboard();
  return after;
}

function stakeholderDecision(effects,reason,options={}){
  Object.entries(effects||{}).forEach(([key,delta])=>stakeholderChange(key,delta,reason,{...options,save:false,render:false}));
  updateStakeholderMeta();
  if(options.save && typeof saveGame==="function") saveGame(false);
  if(options.render && typeof renderDashboard==="function") renderDashboard();
}

function averageHomeOccupancy(){
  const stats=state.matchdayStats;
  const capacity=typeof currentOperationalCapacity==="function"?currentOperationalCapacity():STADIUMS?.[state.club]?.capacity;
  if(!stats?.homeGames || !capacity) return null;
  return (stats.attendance/stats.homeGames)/capacity;
}

function recentFanProtest(){
  ensureStakeholderState();
  const date=state.stakeholderMeta.lastFanProtestDate;
  if(!date) return false;
  return dateDiffDays(date,currentGameDateISO())<=60;
}

function fanAttendanceMultiplier(){
  const fans=stakeholderValue("fans");
  if(fans>=40) return 1;
  if(fans>=25) return 0.90+((fans-25)/15)*0.09;
  if(fans>=10) return 0.78+((fans-10)/15)*0.11;
  return 0.62+(fans/10)*0.16;
}

function savedClubReputation(club=state.club){
  ensureStakeholderState();
  return state.clubReputationOverrides?.[club] ?? byClub(club)?.reputation ?? 70;
}

function setSavedClubReputation(value,club=state.club){
  ensureStakeholderState();
  const v=clamp(Math.round(value),50,99);
  state.clubReputationOverrides[club]=v;
  const c=byClub(club);
  if(c) c.reputation=v;
  return v;
}

function applySavedClubReputations(){
  if(!state?.clubReputationOverrides) return;
  Object.entries(state.clubReputationOverrides).forEach(([club,rep])=>{
    const c=byClub(club);
    if(c) c.reputation=rep;
  });
}

function processFanProtestAfterHomeMatch(matchDate=currentGameDateISO()){
  ensureStakeholderState();
  const fans=stakeholderValue("fans");
  if(fans>=25) return false;

  const last=state.stakeholderMeta.lastFanProtestDate;
  if(last && dateDiffDays(last,matchDate)<21) return false;

  const chance=fans<10?0.50:0.22;
  if(Math.random()>=chance) return false;

  state.stakeholderMeta.lastFanProtestDate=matchDate;
  state.stakeholderMeta.fanProtests=(state.stakeholderMeta.fanProtests||0)+1;
  setSavedClubReputation(savedClubReputation()-1);
  stakeholderDecision({
    sponsors:-6,
    owners:-4,
    players:-1
  },"Supporter protest at a home match",{notify:true});

  addNews("SUPPORTER PROTEST: Fans protested against the club's leadership at the home match. Club reputation has fallen and commercial partners are unhappy.");
  return true;
}

function stakeholderMoodExplanation(key,score){
  const band=stakeholderBand(score);
  const copy={
    fans:{
      veryHappy:"Support is strong and demand is resilient.",
      happy:"Supporters are broadly positive.",
      neutral:"Support is mixed; no major behavioural effect.",
      unhappy:"Attendances begin to soften and criticism increases.",
      veryUnhappy:"Protests can occur and commercial partners become concerned.",
      crisis:"Hostile supporter mood; severe attendance and reputation risk."
    },
    owners:{
      veryHappy:"The CEO has strong board backing.",
      happy:"The board is broadly satisfied.",
      neutral:"The board is monitoring performance.",
      unhappy:"Scrutiny is increasing.",
      veryUnhappy:"The CEO is under serious pressure.",
      crisis:"The CEO's position is in immediate danger."
    },
    players:{
      veryHappy:"Dressing-room morale is excellent.",
      happy:"The squad is settled.",
      neutral:"Morale is mixed but manageable.",
      unhappy:"Individual dissatisfaction becomes more likely.",
      veryUnhappy:"Player unrest and exit requests become much more likely.",
      crisis:"The dressing room is in crisis."
    },
    manager:{
      veryHappy:"The manager strongly supports club leadership.",
      happy:"The working relationship is healthy.",
      neutral:"The relationship is functional.",
      unhappy:"The manager is frustrated with club leadership.",
      veryUnhappy:"The manager may question their future.",
      crisis:"A breakdown in the relationship is possible."
    },
    sponsors:{
      veryHappy:"Commercial partners are enthusiastic about the relationship.",
      happy:"The sponsor relationship is healthy.",
      neutral:"The relationship is stable.",
      unhappy:"Future renewal value may weaken.",
      veryUnhappy:"Commercial warnings and fewer extra opportunities are likely.",
      crisis:"Early termination risk is active if poor conditions persist."
    }
  };
  return copy[key]?.[band.key]||band.label;
}

// Public foundation for later decision/random-event systems.
globalThis.FootballCEOStakeholders={
  groups:[...STAKEHOLDER_GROUPS],
  thresholds:STAKEHOLDER_THRESHOLDS.map(x=>({...x})),
  ensure:ensureStakeholderState,
  getValue:stakeholderValue,
  getBand:key=>stakeholderBand(stakeholderValue(key)),
  change:stakeholderChange,
  decision:stakeholderDecision,
  attendanceMultiplier:fanAttendanceMultiplier
};

function ownerFootballExpectationTarget(club=state?.club){
  const c=typeof byClub==="function"?byClub(club):null;
  return clamp(Number(c?.target||10),1,20);
}

function ownerFootballPerformanceDriver(position,target=ownerFootballExpectationTarget()){
  if(!Number.isFinite(position)) return null;
  const gap=position-target;
  // Persistent weekly factors use the normal -3..+3 relationship scale.
  // Exceptional season-end achievements are handled separately below.
  if(gap<=-4) return {label:"Football performance well above expectations",value:3};
  if(gap<=-2) return {label:"Football performance above expectations",value:2};
  if(gap<=0) return {label:"Meeting league expectations",value:1};
  if(gap===1) return {label:"Slightly below league expectations",value:-1};
  if(gap<=3) return {label:"Below league expectations",value:-2};
  return {label:"Severe football underperformance",value:-3};
}

function processOwnerSeasonFootballAssessment(finish){
  ensureStakeholderState();
  state.ownerSeasonAssessments=state.ownerSeasonAssessments||{};
  const key=String(currentSeasonStartYear());
  if(state.ownerSeasonAssessments[key]) return state.ownerSeasonAssessments[key];
  const target=ownerFootballExpectationTarget();
  const gap=Number(finish)-target;

  // Routine season outcomes stay close to the normal -3..+3 scale. Genuine
  // major success/failure can move a relationship by 5–8 points at once.
  let delta=0;
  if(finish===1) delta=8;
  else if(gap<=-4) delta=5;
  else if(gap<=-2) delta=3;
  else if(gap===-1) delta=2;
  else if(gap===0) delta=1;
  else if(gap===1) delta=-1;
  else if(gap<=3) delta=-3;
  else if(gap<=5) delta=-5;
  else delta=-8;
  if((target<=4 && finish>=8) || (target<=6 && finish>=10)) delta=Math.min(delta,-8);

  const reason=finish===1
    ? "Premier League title won"
    : delta>=0
      ? `League finish of ${ordinal(finish)} met or exceeded the board's ${ordinal(target)}-place expectation`
      : `League finish of ${ordinal(finish)} fell short of the board's ${ordinal(target)}-place expectation`;
  stakeholderChange("owners",delta,reason,{notify:true});

  // A league title is the clearest current example of an exceptional sporting
  // event: supporters and commercial partners should feel it immediately.
  if(finish===1){
    stakeholderChange("fans",8,"Premier League title won",{notify:true});
    stakeholderChange("sponsors",5,"Premier League title won",{notify:true});
  }

  const assessment={season:currentSeasonLabel(),finish,target,delta,ownerHappiness:stakeholderValue("owners")};
  state.ownerSeasonAssessments[key]=assessment;
  if(typeof addNews==="function") addNews(`BOARD FOOTBALL REVIEW: ${ordinal(finish)} in the Premier League against a ${ordinal(target)}-place expectation. Owner confidence ${delta>0?`rose by ${delta}`:delta<0?`fell by ${Math.abs(delta)}`:"was unchanged"} point${Math.abs(delta)===1?"":"s"}.`);
  return assessment;
}

function updateStakeholderDrivers(){
  if(!state) return;
  ensureStakeholderState();

  const pos=clubLeaguePosition(state.club);
  const target=byClub(state.club).target||10;
  const ppg=recentPointsPerGame();
  const priceP=pricingPressure();

  const fans=[];
  if(state.form?.length){
    if(ppg>=2.2) fans.push({label:"Excellent recent form",value:3});
    else if(ppg>=1.6) fans.push({label:"Positive recent form",value:2});
    else if(ppg<=0.8) fans.push({label:"Poor recent form",value:-3});
    else if(ppg<=1.2) fans.push({label:"Underwhelming recent form",value:-2});
  }
  if(state.week>=5){
    if(pos<=Math.max(1,target-2)) fans.push({label:"Above league expectation",value:3});
    else if(pos>=Math.min(20,target+4)) fans.push({label:"Below league expectation",value:-3});
  }
  if(priceP>0.22){
    fans.push({label:"Very high supporter pricing",value:ppg>=2.0?-1:-3});
  }else if(priceP>0.10){
    fans.push({label:"High supporter pricing",value:ppg>=2.0?0:ppg>=1.3?-2:-3});
  }else if(priceP<-0.12){
    fans.push({label:"Supporter-friendly pricing",value:2});
  }
  if(state.sponsorship?.fanOpposed) fans.push({label:"Controversial sponsorship",value:-3});
  (state.transferSentiment?.fans||[]).slice(-2).forEach(x=>fans.push(x));
  if(typeof stadiumStakeholderDriver==="function"){ const stadiumDriver=stadiumStakeholderDriver(); if(stadiumDriver) fans.push(stadiumDriver); }
  state.happinessDrivers.fans=fans;

  const owners=[];
  const seasonPL=state.seasonPL||0;
  const expectedTolerance=state.ownerProfile?.lossTolerance??15_000_000;
  if(seasonPL>5_000_000) owners.push({label:"Healthy season profit",value:3});
  else if(seasonPL>0) owners.push({label:"Club in profit",value:2});
  else if(seasonPL<-expectedTolerance*1.5) owners.push({label:"Losses exceed owner tolerance",value:-3});
  else if(seasonPL<-expectedTolerance) owners.push({label:"Financial losses",value:-3});
  else if(seasonPL<0) owners.push({label:"Manageable operating loss",value:-1});
  if((state.staffSpend||0)>10_000_000) owners.push({label:"High staff compensation costs",value:-2});
  if(state.week>=4){
    const footballDriver=ownerFootballPerformanceDriver(pos,target);
    if(footballDriver) owners.push(footballDriver);
  }
  (state.transferSentiment?.owners||[]).slice(-2).forEach(x=>owners.push(x));
  state.happinessDrivers.owners=owners;

  const players=[];
  const wageFairness=squadWageFairness();
  if(wageFairness>0.82) players.push({label:"Fair wage structure",value:3});
  else if(wageFairness<0.55) players.push({label:"Perceived wage unfairness",value:-3});
  const managerChanges=state.managerChangesThisSeason||0;
  if(managerChanges===0) players.push({label:"Managerial stability",value:2});
  else if(managerChanges===1) players.push({label:"Recent manager change",value:-2});
  else players.push({label:"Managerial instability",value:-3});
  const trainingRating=typeof facilityRating==="function"?facilityRating("training"):Math.round(byClub(state.club).reputation-4);
  const squadStandard=Math.round(strength(state.club));
  const facilityGap=trainingRating-squadStandard;
  if(facilityGap>=3) players.push({label:"Excellent training facilities",value:2});
  else if(facilityGap<=-8) players.push({label:"Training facilities below squad standard",value:-3});
  else if(facilityGap<=-4) players.push({label:"Training facilities need improvement",value:-2});
  state.happinessDrivers.players=players;

  const manager=[];
  const backing=state.managerBacking??70;
  if(backing>=80) manager.push({label:"Strong board backing",value:3});
  else if(backing>=65) manager.push({label:"Board support",value:2});
  else if(backing<45) manager.push({label:"Feels unsupported",value:-3});
  else if(backing<60) manager.push({label:"Wants more backing",value:-2});
  const offPitchFanNeg=fans.filter(x=>["Very high supporter pricing","High supporter pricing","Controversial sponsorship"].includes(x.label)).reduce((s,x)=>s+x.value,0);
  if(offPitchFanNeg<=-6) manager.push({label:"Fan anger creating pressure",value:-3});
  else if(offPitchFanNeg<=-3) manager.push({label:"Supporter tension",value:-1});
  if(state.week>=6 && pos>=target+5 && ppg<1.1) manager.push({label:"Under pressure from supporters",value:-3});
  (state.transferSentiment?.manager||[]).slice(-2).forEach(x=>manager.push(x));
  state.happinessDrivers.manager=manager;

  const sponsors=[];
  if(!state.sponsorship){
    sponsors.push({label:"No active main sponsor",value:-1});
  }else{
    if(state.sponsorship.fanOpposed) sponsors.push({label:"Sponsor unpopular with supporters",value:-3});
    else sponsors.push({label:"Sponsor accepted by supporters",value:1});

    if(state.week>=5){
      if(pos<=Math.max(1,target-2)) sponsors.push({label:"Strong league exposure",value:3});
      else if(pos>=Math.min(20,target+4)) sponsors.push({label:"Poor league performance",value:-3});
    }

    const rep=savedClubReputation();
    if(rep>=88) sponsors.push({label:"Elite club profile",value:2});
    else if(rep<72) sponsors.push({label:"Limited national profile",value:-1});

    const occupancy=averageHomeOccupancy();
    if(occupancy!=null){
      if(occupancy>=0.95) sponsors.push({label:"Excellent home attendances",value:2});
      else if(occupancy<0.75) sponsors.push({label:"Weak home attendances",value:-3});
      else if(occupancy<0.85) sponsors.push({label:"Soft home attendances",value:-1});
    }

    if(recentFanProtest()) sponsors.push({label:"Recent supporter protest",value:-3});
  }
  state.happinessDrivers.sponsors=sponsors;

  // Cross-stakeholder relationships. These are pressures, not immediate jumps.
  const fanScore=stakeholderValue("fans");
  const ownerScore=stakeholderValue("owners");
  const playerScore=stakeholderValue("players");
  const managerScore=stakeholderValue("manager");
  const sponsorScore=stakeholderValue("sponsors");

  if(fanScore<25){
    state.happinessDrivers.sponsors.push({label:"Severe supporter unrest",value:-3});
    state.happinessDrivers.owners.push({label:"Supporter unrest",value:-3});
  }else if(fanScore<40){
    state.happinessDrivers.sponsors.push({label:"Weak supporter sentiment",value:-3});
    state.happinessDrivers.owners.push({label:"Supporter dissatisfaction",value:-1});
  }else if(fanScore>=80){
    state.happinessDrivers.sponsors.push({label:"Strong supporter sentiment",value:2});
  }

  if(managerScore<25) state.happinessDrivers.players.push({label:"Unsettled manager relationship",value:-3});
  else if(managerScore>=80) state.happinessDrivers.players.push({label:"Stable football leadership",value:1});

  if(playerScore<25) state.happinessDrivers.manager.push({label:"Dressing-room unrest",value:-3});

  if(sponsorScore<25) state.happinessDrivers.owners.push({label:"Commercial partner concern",value:-2});
  else if(sponsorScore>=80) state.happinessDrivers.owners.push({label:"Strong commercial relationships",value:1});

  if(ownerScore<25) state.happinessDrivers.manager.push({label:"Board instability",value:-2});
}


function applyHappinessDelta(current,delta){
  // Extreme values should be difficult to reach and maintain, but relationship
  // scores and the visible history must remain whole numbers. Damping therefore
  // changes whether a point is gained/lost rather than storing fractional points.
  let adjusted=Number(delta||0);
  if(adjusted>0 && current>=90) adjusted*=0.35;
  else if(adjusted>0 && current>=80) adjusted*=0.60;
  if(adjusted<0 && current<=15) adjusted*=0.40;
  else if(adjusted<0 && current<=25) adjusted*=0.65;
  return clamp(Math.round(current+adjusted),0,100);
}

function applyStakeholderHappiness(){
  ensureStakeholderState();
  updateStakeholderDrivers();
  const before={};
  STAKEHOLDER_GROUPS.forEach(key=>before[key]=stakeholderValue(key));

  STAKEHOLDER_GROUPS.forEach(key=>{
    const total=(state.happinessDrivers[key]||[]).reduce((s,d)=>s+(d.value||0),0);

    // Persistent drivers now define a relationship equilibrium rather than
    // subtracting the same point forever every Sunday.
    //
    // Example: an unpopular sponsor (-3) settles around the low 60s if nothing
    // else is wrong. If circumstances improve, happiness gradually recovers.
    const target=clamp(70+(total*3),10,92);
    const current=stakeholderValue(key);
    const gap=target-current;

    let delta=0;
    if(gap>=8) delta=2;
    else if(gap>=2) delta=1;
    else if(gap<=-8) delta=-2;
    else if(gap<=-2) delta=-1;

    if(delta) state.happiness[key]=applyHappinessDelta(current,delta);
  });

  STAKEHOLDER_GROUPS.forEach(key=>{
    const delta=stakeholderValue(key)-before[key];
    if(delta) addStakeholderHistory(key,delta,strongestStakeholderDriver(key),"weekly pressure");
    notifyStakeholderThresholdChange(key,before[key]);
  });
  updateStakeholderMeta();

  const pos=clubLeaguePosition(state.club);
  const target=byClub(state.club).target||10;
  if(state.week>=8 && pos>=target+5 && state.happiness.fans<55 && state.staff?.manager){
    if(!state.managerPressureNotified){
      addNews(`Supporters are beginning to call for ${state.staff.manager.name} to be sacked.`);
      state.managerPressureNotified=true;
    }
  }else if(pos<=target+2){
    state.managerPressureNotified=false;
  }
}

// Future transfer-system hooks.
function pricingDemand(){
  const rec=recommendedPricing(state.club), p=state.pricing;
  // Standard tickets matter most; concessions and food have smaller sentiment/demand effects.
  const ticketRatio=p.ticket/rec.ticket;
  const concessionRatio=p.concession/rec.concession;
  const foodRatio=p.food/rec.food;

  let demand=1.04;
  demand -= Math.max(0,ticketRatio-0.90)*0.55;
  demand -= Math.max(0,concessionRatio-0.90)*0.12;
  demand -= Math.max(0,foodRatio-0.95)*0.07;

  // Club reputation and performance provide a small demand buffer.
  const repBoost=(byClub(state.club).reputation-75)/500;
  const formBoost=(state.form||[]).reduce((s,r)=>s+(r==="W"?0.012:r==="L"?-0.01:0),0);
  return clamp(demand+repBoost+formBoost,0.58,1);
}

function projectedMatchday(){
  ensureStakeholderState();
  if(typeof projectedMatchdayV21==="function") return projectedMatchdayV21();
  const stadium={capacity:typeof currentOperationalCapacity==="function"?currentOperationalCapacity():STADIUMS[state.club].capacity};
  const pricingOnlyDemand=pricingDemand();
  const fanMultiplier=fanAttendanceMultiplier();
  const demand=clamp(pricingOnlyDemand*fanMultiplier,0,1);
  const attendance=Math.round(stadium.capacity*demand);
  const hospitalitySold=Math.round(stadium.capacity*0.045);
  const revenue=Math.round(attendance*state.pricing.ticket);
  return {demand,pricingOnlyDemand,fanHappinessAttendanceMultiplier:fanMultiplier,attendance,revenue,hospitalitySold};
}


function recentPerformanceScore(club){
  const c=byClub(club);
  const finishes=(state && state.clubHistory && state.clubHistory.recentFinishes) ? state.clubHistory.recentFinishes : [c.target+1,c.target];
  const avg=finishes.reduce((a,b)=>a+b,0)/finishes.length;
  const tableScore=clamp((21-avg)/20,0.08,1);
  const repScore=c.reputation/100;
  return 0.58*tableScore+0.42*repScore;
}

const SPONSOR_NAMES=[
  {name:"Northstar Telecom",controversial:false},
  {name:"Apex Motors",controversial:false},
  {name:"Vertex Energy",controversial:false},
  {name:"CrownBet",controversial:true},
  {name:"Global Tourism Board",controversial:true},
  {name:"Pioneer Finance",controversial:false},
  {name:"Redwood Airlines",controversial:false},
  {name:"Titan Digital",controversial:false},
  {name:"Frontier Mining",controversial:true},
  {name:"Summit Sportswear",controversial:false}
];

function generateSponsorOffers(club){
  const c=byClub(club);
  const perf=recentPerformanceScore(club);
  const base=4_000_000 + c.reputation*150_000 + perf*10_000_000;

  const templates=[
    {mult:0.78,years:1,controversial:false},
    {mult:0.98,years:2,controversial:false},
    {mult:1.18,years:3,controversial:true},
    {mult:1.07,years:5,controversial:false}
  ];

  const pool=[...SPONSOR_NAMES].sort(()=>Math.random()-0.5);
  return templates.map((t,i)=>{
    const name=pool[i];
    const opposed=t.controversial || name.controversial;
    const premium=opposed?1.16:1;
    const annual=Math.round((base*t.mult*premium)/250000)*250000;
    return {
      id:"s"+i,
      name:name.name,
      annualValue:annual,
      years:t.years,
      totalValue:annual*t.years,
      fanOpposed:opposed
    };
  });
}


function pricingFanEffect(){
  const rec=recommendedPricing(state.club),p=state.pricing;
  const weighted=(p.ticket/rec.ticket)*0.6+(p.concession/rec.concession)*0.2+(p.food/rec.food)*0.2;
  if(weighted>1.25) return -2;
  if(weighted>1.10) return -1;
  if(weighted<0.88) return 1;
  return 0;
}


const q=id=>document.getElementById(id);
const money=n=>{
  const sign=n<0?"-":"";
  n=Math.abs(Number(n)||0);
  if(n>=1000000) return sign+"£"+(n/1000000).toFixed(n>=100000000?0:1)+"m";
  if(n>=1000) return sign+"£"+Math.round(n/1000)+"k";
  return sign+"£"+Math.round(n);
};
const byClub=name=>(typeof worldClubByName==="function"?worldClubByName(name):DB.clubs.find(c=>c.name===name));
const squad=name=>DB.players.filter(p=>p.club===name);
const strength=name=>{
  const a=squad(name).map(p=>p.overall).sort((a,b)=>b-a).slice(0,16);
  return a.length ? a.reduce((x,y)=>x+y,0)/a.length : 70;
};

function createEmptyMonthlyFinance(){
  return {
    matchdayRevenue:0,
    commercialIncome:0,
    sponsorIncome:0,
    leagueIncome:0,
    playerWages:0,
    staffWages:0,
    operatingCosts:0,
    transferSpent:0,
    transferReceived:0,
    debtInterest:0,
    debtPrincipal:0
  };
}

function resetMonthlyTracker(){
  state.monthlyFinance=createEmptyMonthlyFinance();
  state.monthlyResults=[];
  state.monthlyPlayerSnapshot={};

  if(state?.playerStats){
    Object.entries(state.playerStats).forEach(([id,s])=>{
      state.monthlyPlayerSnapshot[id]={
        appearances:s.appearances||0,
        starts:s.starts||0,
        goals:s.goals||0,
        assists:s.assists||0,
        ratingTotal:s.ratingTotal||0,
        ratedApps:s.ratedApps||0
      };
    });
  }
}

function monthlyPlayerPerformance(id){
  const now=state.playerStats?.[id]||{};
  const before=state.monthlyPlayerSnapshot?.[id]||{};
  const apps=(now.appearances||0)-(before.appearances||0);
  const starts=(now.starts||0)-(before.starts||0);
  const goals=(now.goals||0)-(before.goals||0);
  const assists=(now.assists||0)-(before.assists||0);
  const ratedApps=(now.ratedApps||0)-(before.ratedApps||0);
  const ratingTotal=(now.ratingTotal||0)-(before.ratingTotal||0);
  return {apps,starts,goals,assists,ratedApps,avgRating:ratedApps>0?ratingTotal/ratedApps:null};
}

function monthlyPlayerOfPeriod(){
  return squad(state.club)
    .map(p=>({player:p,...monthlyPlayerPerformance(p.id)}))
    .filter(x=>x.apps>0)
    .sort((a,b)=>{
      const scoreA=(a.avgRating||0)*10+a.goals*2.4+a.apps*.12;
      const scoreB=(b.avgRating||0)*10+b.goals*2.4+b.apps*.12;
      return scoreB-scoreA;
    })[0]||null;
}

function monthlyInjurySnapshot(){
  return squad(state.club)
    .filter(p=>state.injuries?.[p.id])
    .map(p=>({
      id:p.id,
      name:p.name,
      weeksLeft:state.injuries[p.id].weeksLeft,
      daysRemaining:state.injuries[p.id].daysRemaining??state.injuries[p.id].weeksLeft*7
    }))
    .sort((a,b)=>b.weeksLeft-a.weeksLeft);
}

function monthlyOperatingPL(finance){
  const income=finance.matchdayRevenue+finance.commercialIncome+finance.sponsorIncome+(finance.leagueIncome||0);
  const expenses=finance.playerWages+finance.staffWages+finance.operatingCosts+(finance.debtInterest||0);
  return income-expenses;
}

function buildMonthlySummary(monthKey=state.calendar?.monthlyMonthKey||currentGameDateISO().slice(0,7)){
  const f={...state.monthlyFinance};
  const player=monthlyPlayerOfPeriod();
  const injuries=monthlyInjurySnapshot();
  const operatingPL=monthlyOperatingPL(f);
  const transferPL=(f.transferReceived||0)-(f.transferSpent||0);
  const results=[...(state.monthlyResults||[])];

  const w=results.filter(x=>x.outcome==="W").length;
  const d=results.filter(x=>x.outcome==="D").length;
  const l=results.filter(x=>x.outcome==="L").length;

  return {
    season:currentSeasonLabel(),
    monthKey,
    monthLabel:monthLabelFromKey(monthKey),
    finance:f,operatingPL,transferPL,results,record:{w,d,l},injuries,
    playerOfMonth:player?{
      id:player.player.id,name:player.player.name,apps:player.apps,starts:player.starts,goals:player.goals,assists:player.assists,avgRating:player.avgRating
    }:null
  };
}

function archiveMonthlySummary(monthKey=state.calendar?.monthlyMonthKey){
  const summary=buildMonthlySummary(monthKey);
  if(!state.monthlyHistory) state.monthlyHistory=[];
  state.monthlyHistory.push(summary);
  return summary;
}

function renderMonthlySummary(summary=null){
  if(!q("monthlySummary")) return;
  summary=summary||state.monthlyHistory?.[state.monthlyHistory.length-1];
  if(!summary) return;

  const f=summary.finance;
  const totalIncome=f.matchdayRevenue+f.commercialIncome+f.sponsorIncome;
  const totalExpenses=f.playerWages+f.staffWages+f.operatingCosts+(f.debtInterest||0);

  q("monthlySummaryTitle").textContent=summary.monthLabel || monthLabelFromKey(summary.monthKey);
  q("monthlySummaryRecord").textContent=`${summary.record.w}W • ${summary.record.d}D • ${summary.record.l}L`;
  q("monthlySummaryPL").textContent=money(summary.operatingPL);
  q("monthlySummaryPL").className="v "+(summary.operatingPL>0?"good":summary.operatingPL<0?"bad":"");
  q("monthlySummaryTransferPL").textContent=money(summary.transferPL);
  q("monthlySummaryTransferPL").className="v "+(summary.transferPL>0?"good":summary.transferPL<0?"bad":"");

  q("monthlyFinanceBreakdown").innerHTML=`
    <div class="monthly-finance-row"><span>Matchday revenue</span><b class="good">${money(f.matchdayRevenue)}</b></div>
    <div class="monthly-finance-row"><span>Commercial income</span><b class="good">${money(f.commercialIncome)}</b></div>
    <div class="monthly-finance-row"><span>Sponsorship income</span><b class="good">${money(f.sponsorIncome)}</b></div>
    <div class="monthly-finance-row monthly-total"><span>Total operating income</span><b>${money(totalIncome)}</b></div>
    <div class="monthly-finance-row"><span>Player wages</span><b class="bad">-${money(f.playerWages)}</b></div>
    <div class="monthly-finance-row"><span>Senior staff wages</span><b class="bad">-${money(f.staffWages)}</b></div>
    <div class="monthly-finance-row"><span>Club & facility operating costs</span><b class="bad">-${money(f.operatingCosts)}</b></div>
    ${(f.debtInterest||0)?`<div class="monthly-finance-row"><span>Debt interest</span><b class="bad">-${money(f.debtInterest)}</b></div>`:""}
    ${(f.debtPrincipal||0)?`<div class="monthly-finance-row"><span>Debt principal repaid</span><b>-${money(f.debtPrincipal)}</b><span class="muted tiny">cash flow, not operating expense</span></div>`:""}
    <div class="monthly-finance-row monthly-total"><span>Total operating expenses</span><b>-${money(totalExpenses)}</b></div>
    <div class="monthly-finance-row"><span>Transfer income</span><b>${money(f.transferReceived)}</b></div>
    <div class="monthly-finance-row"><span>Transfer spending</span><b>-${money(f.transferSpent)}</b></div>
  `;

  q("monthlyResultsList").innerHTML=summary.results.length
    ? summary.results.map(r=>`<div class="monthly-result-row">
        <span class="form-chip ${r.outcome}">${r.outcome}</span>
        <span>${r.home?"vs":"at"} ${r.opponent}</span>
        <b>${r.goalsFor}–${r.goalsAgainst}</b>
      </div>`).join("")
    : `<div class="muted">No matches played.</div>`;

  q("monthlyInjuriesList").innerHTML=summary.injuries.length
    ? summary.injuries.map(i=>`<div class="monthly-injury-row"><span>${i.name}</span><b>${i.daysRemaining} day${i.daysRemaining===1?"":"s"} remaining</b></div>`).join("")
    : `<div class="good">No current first-team injuries.</div>`;

  q("monthlyPOTM").innerHTML=summary.playerOfMonth
    ? `<div class="monthly-potm-name">${summary.playerOfMonth.name}</div>
       <div class="muted">${summary.playerOfMonth.apps} apps • ${summary.playerOfMonth.goals} goals • ${summary.playerOfMonth.assists||0} assists • ${summary.playerOfMonth.avgRating?.toFixed(2)||"—"} AVG</div>`
    : `<div class="muted">No player qualified.</div>`;

  q("monthlySummary").classList.remove("hide");
  setModalScrollLock(true);
}


function setModalScrollLock(locked){
  document.documentElement.classList.toggle("modal-open",!!locked);
  document.body.classList.toggle("modal-open",!!locked);
}

function closeMonthlySummary(){
  q("monthlySummary")?.classList.add("hide");
  setModalScrollLock(false);
}


/* --------------------------------------------------------------------------
   Daily calendar engine — v0.15
   -------------------------------------------------------------------------- */

function isoDateUTC(date){
  return date.toISOString().slice(0,10);
}
function parseISODate(iso){
  return new Date(`${iso}T12:00:00Z`);
}
function addCalendarDays(iso,days){
  const d=parseISODate(iso);
  d.setUTCDate(d.getUTCDate()+days);
  return isoDateUTC(d);
}
function dateDiffDays(a,b){
  return Math.round((parseISODate(b)-parseISODate(a))/86400000);
}
function dayOfWeekISO(iso){
  return parseISODate(iso).getUTCDay(); // 0 Sun ... 6 Sat
}
function sameCalendarMonth(a,b){
  return String(a).slice(0,7)===String(b).slice(0,7);
}
function monthLabelFromKey(key){
  const [y,m]=key.split("-").map(Number);
  return new Date(Date.UTC(y,m-1,1)).toLocaleDateString("en-GB",{month:"long",year:"numeric",timeZone:"UTC"});
}
function formatGameDate(iso=currentGameDateISO(),opts={}){
  return parseISODate(iso).toLocaleDateString("en-GB",{
    weekday:opts.weekday===false?undefined:"long",
    day:"numeric",month:"long",year:"numeric",timeZone:"UTC"
  });
}
function shortGameDate(iso=currentGameDateISO()){
  return parseISODate(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
}
function currentGameDateISO(){
  return state?.calendar?.date || `${state?.season?.year||2025}-08-01`;
}
function currentCareerDay(){
  return state?.calendar?.careerDay||0;
}
function currentCalendarWeekKey(){
  const d=parseISODate(currentGameDateISO());
  const daysFromMonday=(d.getUTCDay()+6)%7;
  d.setUTCDate(d.getUTCDate()-daysFromMonday);
  return isoDateUTC(d);
}
function isMonday(iso=currentGameDateISO()){ return dayOfWeekISO(iso)===1; }
function isSunday(iso=currentGameDateISO()){ return dayOfWeekISO(iso)===0; }

function seasonOpeningDate(year){
  // First Saturday on/after 10 August. Dates naturally move each season:
  // e.g. 2025-08-16, 2026-08-15, 2027-08-14, 2028-08-12.
  let d=new Date(Date.UTC(year,7,10));
  while(d.getUTCDay()!==6) d.setUTCDate(d.getUTCDate()+1);
  return isoDateUTC(d);
}

function generateLeagueRoundDates(year){
  const dates=[];
  let current=seasonOpeningDate(year);

  // Midweek rounds create congestion; scheduled breaks keep the campaign
  // running into May. All dates are regenerated from the calendar each season.
  const midweekAfter=new Set([5,12,18,21,28,32]);
  const breakAfter=new Set([3,7,10,14,25,29,34,35,36]);

  for(let i=0;i<38;i++){
    if(i===0){
      dates.push(current);
      continue;
    }
    const previousRound=i-1;
    if(midweekAfter.has(previousRound)){
      current=addCalendarDays(current,4); // Saturday -> Wednesday
    }else if(dayOfWeekISO(current)===3){
      current=addCalendarDays(current,3); // Wednesday -> Saturday
    }else if(breakAfter.has(previousRound)){
      current=addCalendarDays(current,14);
    }else{
      current=addCalendarDays(current,7);
    }
    dates.push(current);
  }
  return dates;
}

function ensureFixtureDates(fixtures,seasonYear=currentSeasonStartYear()){
  if(!fixtures?.length) return fixtures;
  const dates=generateLeagueRoundDates(seasonYear);
  fixtures.forEach((round,i)=>{
    round.week=i+1;
    if(!round.date) round.date=dates[i];
  });
  return fixtures;
}

function nextUserFixture(){
  if(!state?.fixtures?.length) return null;
  const today=currentGameDateISO();
  for(const round of state.fixtures){
    if(round.date<today) continue;
    const game=round.games.find(g=>g.home===state.club||g.away===state.club);
    if(game) return {round,game};
  }
  return null;
}

function fixtureRoundOnDate(iso=currentGameDateISO()){
  return state.fixtures?.find(r=>r.date===iso)||null;
}

function ensureCalendarState(){
  if(!state) return;
  if(!state.calendar){
    const y=state.season?.year||2025;
    const opening=seasonOpeningDate(y);
    // Old weekly saves migrate to approximately one week before/after their next round.
    let inferred=addCalendarDays(opening,-8);
    if((state.week||0)>0){
      const dates=generateLeagueRoundDates(y);
      inferred=dates[Math.min(state.week,dates.length-1)] || inferred;
    }
    state.calendar={
      date:inferred,
      careerDay:Math.max(0,dateDiffDays(`${y}-08-01`,inferred)),
      lastWeeklyProcess:null,
      monthlyMonthKey:inferred.slice(0,7),
      managerReassessOn:null
    };
  }
  if(state.calendar.careerDay==null) state.calendar.careerDay=0;
  if(!state.calendar.monthlyMonthKey) state.calendar.monthlyMonthKey=state.calendar.date.slice(0,7);
  state.fixtures=ensureFixtureDates(state.fixtures,state.season?.year||2025);

  // Injury migration: old week-based injuries remain valid.
  Object.values(state.injuries||{}).forEach(injury=>{
    if(injury.daysRemaining==null){
      injury.daysRemaining=Math.max(1,(injury.weeksLeft||1)*7);
      injury.totalDays=Math.max(injury.daysRemaining,(injury.totalWeeks||injury.weeksLeft||1)*7);
    }
    injury.weeksLeft=Math.max(1,Math.ceil(injury.daysRemaining/7));
  });
}

function scheduleManagerReassessment(daysFromNow=1){
  ensureCalendarState();
  const proposed=addCalendarDays(currentGameDateISO(),daysFromNow);
  if(!state.calendar.managerReassessOn || proposed<state.calendar.managerReassessOn){
    state.calendar.managerReassessOn=proposed;
  }
}

function startOfNextSeasonYearDate(year){
  return `${year}-06-01`;
}

function currentSeasonStartYear(){ return state?.season?.year ?? 2025; }
function currentSeasonLabel(){ const y=currentSeasonStartYear(); return `${y}/${String((y+1)%100).padStart(2,"0")}`; }
function currentContractSeasonEndYear(){ return currentSeasonStartYear()+1; }
function seasonDisplayNumber(){ return state?.season?.number ?? 1; }

const ordinal=n=>{
  const s=["th","st","nd","rd"],v=n%100;
  return n+(s[(v-20)%10]||s[v]||s[0]);
};

function generateFixtures(names,seasonYear=(state?.season?.year||2025)){
  let arr=[...names], rounds=[];
  for(let r=0;r<19;r++){
    let games=[];
    for(let i=0;i<10;i++){
      let a=arr[i],b=arr[19-i];
      games.push(r%2===0?{home:a,away:b}:{home:b,away:a});
    }
    rounds.push(games);
    arr=[arr[0],arr[19],...arr.slice(1,19)];
  }
  const second=rounds.map(x=>x.map(g=>({home:g.away,away:g.home})));
  const dates=generateLeagueRoundDates(seasonYear);
  return [...rounds,...second].map((games,i)=>({week:i+1,date:dates[i],games}));
}

function blankTable(){
  const table={};
  DB.clubs.forEach(c=>table[c.name]={p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0});
  return table;
}

function createCareer(club){
  if(getSaveManifest().length>=MAX_LOCAL_SAVES){
    alert(`You already have ${MAX_LOCAL_SAVES} local careers. Delete a save before starting another.`);
    renderSavedCareers();
    return;
  }

  resetWorldDatabase();
  const c=byClub(club);
  if(!c) return;

  activeSaveId=generateSaveId();
  state={
    club,
    saveId:activeSaveId,
    worldSeed:typeof generateCareerWorldSeed==="function"?generateCareerWorldSeed():(Math.floor(Math.random()*4294967296)>>>0),
    season:{year:2025,label:"2025/26",number:1,phase:"preseason"},
    calendar:{date:"2025-08-01",careerDay:0,lastWeeklyProcess:null,monthlyMonthKey:"2025-08",managerReassessOn:null},
    week:0,
    budget:c.transferBudget,
    wageBudget:c.wageBudget,
    happiness:{fans:74,owners:72,players:76,manager:80,sponsors:70},
    staff:staffInitialForClub(club),
    staffAssignments:null,
    injuries:{},
    playerStats:{},
    playerMorale:{},
    playerContracts:{},
    playerListStatus:{},
    managerRequests:[],
    staffSpend:0,
    ownerProfile:{lossTolerance:15_000_000},
    managerBacking:70,
    managerChangesThisSeason:0,
    recentlyDismissedManagers:{},
    facilities:{
      training:clamp(Math.round(c.reputation-3),55,94),
      medical:clamp(Math.round(c.reputation-5),52,92),
      academy:clamp(Math.round(c.reputation-7),48,93),
      recruitment:clamp(Math.round(c.reputation-4),52,94)
    },
    transferSentiment:{fans:[],owners:[],players:[],manager:[]},
    transferFinance:{spent:0,received:0},
    aiClubFinances:{},
    happinessDrivers:{fans:[],owners:[],players:[],manager:[],sponsors:[]},
    stakeholderHistory:{fans:[],owners:[],players:[],manager:[],sponsors:[]},
    stakeholderThresholdState:{fans:"happy",owners:"happy",players:"happy",manager:"veryHappy",sponsors:"happy"},
    stakeholderMeta:{fanProtests:0,lastFanProtestDate:null,sponsorTerminationRisk:false,managerResignationRisk:false,playerUnrestRisk:false,ceoJobStatus:"Secure"},
    clubReputationOverrides:{},
    seasonPL:0,
    pricing:defaultPricing(club),
    seasonTicketDiscount:15,
    pricingLocked:false,
    tutorialSeen:false,
    sponsorship:null,
    sponsorOffers:[],
    clubHistory:{recentFinishes:[Math.min(20,c.target+1),c.target]},
    careerHistory:{seasons:[]},
    scrHistory:[],
    seasonComplete:false,
    seasonSummaryViewed:false,
    matchdayStats:{revenue:0,attendance:0,homeGames:0},
    form:[],
    fixtures:generateFixtures(DB.clubs.map(x=>x.name),2025),
    table:blankTable(),
    results:{},
    news:[{week:0,date:"2025-08-01",text:`You have been appointed CEO of ${club}. ${c.manager} remains in charge of first-team football.`}]
  };
  if(typeof ensureFootballCEOFeatureState==="function") ensureFootballCEOFeatureState();
  if(typeof ensurePlayerLifecycleState==="function") ensurePlayerLifecycleState();
  if(typeof ensureFinancialRegulationState==="function") ensureFinancialRegulationState();
  // The manager begins every career with a full-squad review rather than waiting
  // for the first individual departure to expose a depth problem.
  if(typeof managerSummerSquadReview==="function") managerSummerSquadReview(state.club,{notify:true});
  // Build the initial recruitment picture before the first matchweek so the
  // manager and AI clubs enter the season with real squad priorities.
  if(typeof ensureChampionshipState==="function") ensureChampionshipState();
  if(typeof runAITransferReview==="function") runAITransferReview();
  enterGame();
  saveGame(false);
}

function enterGame(){
  if(!activeSaveId) activeSaveId=state?.saveId||null;
  if(activeSaveId && state) state.saveId=activeSaveId;
  ensureStaffState();
  ensurePlayerState();
  updateIndividualMorale();
  if(!state.ownerProfile) state.ownerProfile={lossTolerance:15_000_000};
  if(state.managerBacking==null) state.managerBacking=70;
  if(state.managerChangesThisSeason==null) state.managerChangesThisSeason=0;
  if(!state.recentlyDismissedManagers) state.recentlyDismissedManagers={};
  if(!state.facilities){
    const rep=byClub(state.club)?.reputation||72;
    state.facilities={
      training:clamp(Math.round(rep-3),55,94),
      medical:clamp(Math.round(rep-5),52,92),
      academy:clamp(Math.round(rep-7),48,93),
      recruitment:clamp(Math.round(rep-4),52,94)
    };
  }
  // Legacy migration
  if(state.trainingFacilities?.rating!=null && !state.facilities.training){
    state.facilities.training=state.trainingFacilities.rating;
  }
  delete state.trainingFacilities;
  if(!state.transferSentiment) state.transferSentiment={fans:[],owners:[],players:[],manager:[]};
  if(!state.transferFinance) state.transferFinance={spent:0,received:0};
  if(!state.aiClubFinances) state.aiClubFinances={};
  if(typeof ensureCareerWorldSeed==="function") ensureCareerWorldSeed();
  if(typeof ensureFootballCEOFeatureState==="function") ensureFootballCEOFeatureState();
  if(typeof ensureFinancialRegulationState==="function") ensureFinancialRegulationState();
  if(typeof ensureAIClubFinances==="function") ensureAIClubFinances();
  ensureStakeholderState();
  if(!state.pricing) state.pricing=defaultPricing(state.club);
  if(state.seasonTicketDiscount==null) state.seasonTicketDiscount=15;
  if(state.pricingLocked==null) state.pricingLocked=false;
  if(state.tutorialSeen==null) state.tutorialSeen=true;
  if(!state.matchdayStats) state.matchdayStats={revenue:0,attendance:0,homeGames:0};
  if(!state.season) state.season={year:2025,label:"2025/26",number:1,phase:"preseason"};
  if(!state.season.phase) state.season.phase=state.seasonComplete?"complete":(state.week>0?"season":"preseason");
  if(!state.season.label) state.season.label=`${state.season.year}/${String((state.season.year+1)%100).padStart(2,"0")}`;
  ensureCalendarState();
  ensureStakeholderState();
  applySavedClubReputations();
  updateStakeholderMeta();
  if(!state.careerHistory) state.careerHistory={seasons:[]};
  if(!state.scrHistory) state.scrHistory=[];
  if(state.seasonComplete==null) state.seasonComplete=false;
  if(state.seasonSummaryViewed==null) state.seasonSummaryViewed=false;
  if(!state.clubHistory) state.clubHistory={recentFinishes:[byClub(state.club).target+1,byClub(state.club).target]};
  if(!state.sponsorOffers) state.sponsorOffers=[];
  if(state.sponsorship && state.sponsorship.seasonsRemaining==null) state.sponsorship.seasonsRemaining=state.sponsorship.years||1;
  q("startScreen").classList.add("hide");
  q("game").classList.remove("hide");
  showTab("dashboard");
  renderAll();
  updateSaveStatus();
  if(!state.pricingLocked){
    if(state.tutorialSeen===false) openTutorial(true);
    else openSeasonSetup();
  }
}

let storageAvailable=true;


function storageWorks(){
  try{
    if(!window.localStorage) return false;
    const key="__football_ceo_storage_test__";
    window.localStorage.setItem(key,"1");
    window.localStorage.removeItem(key);
    storageAvailable=true;
    return true;
  }catch(e){
    storageAvailable=false;
    return false;
  }
}

function getSaveManifest(){
  if(!storageWorks()) return [];
  try{
    const raw=window.localStorage.getItem(SAVE_MANIFEST_KEY);
    const manifest=raw?JSON.parse(raw):[];
    return Array.isArray(manifest)?manifest:[];
  }catch(e){
    console.error("Save manifest could not be read",e);
    return [];
  }
}

function setSaveManifest(manifest){
  if(!storageWorks()) return false;
  try{
    window.localStorage.setItem(SAVE_MANIFEST_KEY,JSON.stringify(manifest.slice(0,MAX_LOCAL_SAVES)));
    return true;
  }catch(e){
    storageAvailable=false;
    return false;
  }
}

function saveSlotKey(id){
  return `${SAVE_SLOT_PREFIX}${id}`;
}

function generateSaveId(){
  return `save_${Date.now()}_${Math.floor(Math.random()*100000)}`;
}

function saveMetadataFromState(id=activeSaveId,savedAt=new Date().toISOString()){
  return {
    id,
    club:state?.club||"Unknown club",
    season:state?.season?.label||"—",
    seasonNumber:state?.season?.number||1,
    gameDate:typeof currentGameDateISO==="function"?currentGameDateISO():(state?.calendar?.date||null),
    week:state?.week||0,
    savedAt,
    version:SAVE_FORMAT_VERSION
  };
}

function writeSaveSlot(id,saveState=state){
  if(!id || !saveState || !storageWorks()) return false;
  try{
    const savedAt=new Date().toISOString();
    window.localStorage.setItem(saveSlotKey(id),JSON.stringify(saveState));

    let manifest=getSaveManifest().filter(x=>x.id!==id);
    const originalState=state;
    if(saveState!==state) state=saveState;
    const meta=saveMetadataFromState(id,savedAt);
    if(saveState!==originalState) state=originalState;

    manifest.unshift(meta);
    if(!setSaveManifest(manifest)) throw new Error("Could not update save index");

    activeSaveId=id;
    lastSaveTimestamp=savedAt;
    updateSaveStatus();
    renderSaveManager();
    return true;
  }catch(e){
    console.error("Save failed",e);
    storageAvailable=false;
    updateSaveStatus("Save failed");
    return false;
  }
}

function safeSetSave(){
  if(!state) return false;
  if(!activeSaveId){
    activeSaveId=state.saveId || generateSaveId();
    state.saveId=activeSaveId;
  }
  return writeSaveSlot(activeSaveId,state);
}

function safeGetSave(id=activeSaveId){
  if(!id || !storageWorks()) return null;
  try{
    return window.localStorage.getItem(saveSlotKey(id));
  }catch(e){
    storageAvailable=false;
    return null;
  }
}

function saveGame(show=true){
  const saved=safeSetSave();
  if(saved){
    if(show) addNews("Career saved locally on this device.");
  }else if(show){
    addNews("Save failed. Export this career as a backup before closing the browser.");
  }
  updateSaveStatus();
}

function loadSaveById(id){
  try{
    const raw=safeGetSave(id);
    if(!raw) throw new Error("Save data is missing");
    const loaded=JSON.parse(raw);
    if(!loaded?.club) throw new Error("Invalid career data");

    activeSaveId=id;
    loaded.saveId=id;
    state=loaded;

    const meta=getSaveManifest().find(x=>x.id===id);
    lastSaveTimestamp=meta?.savedAt||null;

    resetWorldDatabase();
    enterGame();
    updateSaveStatus();
  }catch(e){
    console.error(e);
    alert("The save could not be loaded. If you exported a backup, you can import it from the start screen.");
  }
}

function loadGame(){
  const saves=getSaveManifest();
  if(saves.length) loadSaveById(saves[0].id);
}

function deleteSaveById(id){
  const meta=getSaveManifest().find(x=>x.id===id);
  const label=meta?`${meta.club} • ${meta.season}`:"this career";
  if(!confirm(`Delete ${label}? This cannot be undone unless you exported a backup.`)) return;

  try{
    window.localStorage?.removeItem(saveSlotKey(id));
    setSaveManifest(getSaveManifest().filter(x=>x.id!==id));
  }catch(e){}

  if(activeSaveId===id){
    activeSaveId=null;
    state=null;
    q("game")?.classList.add("hide");
    q("startScreen")?.classList.remove("hide");
  }
  renderSavedCareers();
  renderSaveManager();
}

function newCareer(){
  // Do not delete the current career. Autosave it, then return to club selection.
  if(state) saveGame(false);
  activeSaveId=null;
  state=null;
  q("game").classList.add("hide");
  q("startScreen").classList.remove("hide");
  q("seasonSetup")?.classList.add("hide");
  q("playerModal")?.classList.add("hide");
  renderSavedCareers();
}

function formatSavedAt(iso){
  if(!iso) return "Not saved yet";
  try{
    return new Date(iso).toLocaleString("en-GB",{
      day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"
    });
  }catch(e){ return "Saved"; }
}

function updateSaveStatus(forcedText=null){
  const el=q("saveStatus");
  if(!el) return;
  if(forcedText){
    el.textContent=forcedText;
    return;
  }
  if(!storageAvailable){
    el.textContent="Browser storage unavailable • export a backup";
    el.classList.add("bad");
    return;
  }
  el.classList.remove("bad");
  el.textContent=lastSaveTimestamp
    ? `Autosaved • ${formatSavedAt(lastSaveTimestamp)}`
    : "Autosave enabled";
}

function renderSavedCareers(){
  const wrap=q("savedCareersList");
  const section=q("savedCareersSection");
  if(!wrap || !section) return;

  const saves=getSaveManifest();
  section.classList.toggle("hide",saves.length===0);

  wrap.innerHTML=saves.map(meta=>`
    <div class="save-card">
      <button class="save-card-main load-save-btn" data-save-id="${meta.id}" type="button">
        <div>
          <b>${meta.club}</b>
          <div class="muted small">${meta.season} • ${meta.gameDate?shortGameDate(meta.gameDate):`After MW ${meta.week||0}`}</div>
        </div>
        <span>Load →</span>
      </button>
      <div class="save-card-footer">
        <span class="muted small">Saved ${formatSavedAt(meta.savedAt)}</span>
        <div>
          <button class="btn secondary export-slot-btn" data-save-id="${meta.id}" type="button">Export</button>
          <button class="btn danger delete-slot-btn" data-save-id="${meta.id}" type="button">Delete</button>
        </div>
      </div>
    </div>
  `).join("");

  document.querySelectorAll(".load-save-btn").forEach(btn=>btn.addEventListener("click",()=>loadSaveById(btn.dataset.saveId)));
  document.querySelectorAll(".export-slot-btn").forEach(btn=>btn.addEventListener("click",()=>exportSaveById(btn.dataset.saveId)));
  document.querySelectorAll(".delete-slot-btn").forEach(btn=>btn.addEventListener("click",()=>deleteSaveById(btn.dataset.saveId)));

  const count=q("saveSlotCount");
  if(count) count.textContent=`${saves.length}/${MAX_LOCAL_SAVES} local saves`;
}

function renderSaveManager(){
  const list=q("saveManagerList");
  if(!list) return;
  const saves=getSaveManifest();

  list.innerHTML=saves.map(meta=>`
    <div class="save-manager-row ${meta.id===activeSaveId?"active":""}">
      <div>
        <b>${meta.club}</b>
        <div class="muted small">${meta.season} • ${meta.gameDate?shortGameDate(meta.gameDate):"—"}</div>
        <div class="muted tiny">Saved ${formatSavedAt(meta.savedAt)}</div>
      </div>
      <div class="save-manager-actions">
        ${meta.id!==activeSaveId?`<button class="btn secondary load-save-btn" data-save-id="${meta.id}">Load</button>`:`<span class="pill">Current</span>`}
        <button class="btn secondary export-slot-btn" data-save-id="${meta.id}">Export</button>
        <button class="btn danger delete-slot-btn" data-save-id="${meta.id}">Delete</button>
      </div>
    </div>
  `).join("") || `<p class="muted">No local careers found.</p>`;

  list.querySelectorAll(".load-save-btn").forEach(btn=>btn.addEventListener("click",()=>{closeSaveManager();loadSaveById(btn.dataset.saveId);}));
  list.querySelectorAll(".export-slot-btn").forEach(btn=>btn.addEventListener("click",()=>exportSaveById(btn.dataset.saveId)));
  list.querySelectorAll(".delete-slot-btn").forEach(btn=>btn.addEventListener("click",()=>deleteSaveById(btn.dataset.saveId)));
}

function openSaveManager(){
  if(state) saveGame(false);
  renderSaveManager();
  q("saveManagerModal")?.classList.remove("hide");
  setModalScrollLock(true);
}

function closeSaveManager(){
  q("saveManagerModal")?.classList.add("hide");
  setModalScrollLock(false);
}

function exportedCareerPayload(saveState,id){
  return {
    game:"Football CEO",
    formatVersion:SAVE_FORMAT_VERSION,
    exportedAt:new Date().toISOString(),
    metadata:{
      club:saveState.club,
      season:saveState.season?.label,
      gameDate:saveState.calendar?.date,
      sourceSaveId:id
    },
    state:saveState
  };
}

function downloadJSON(data,filename){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function exportSaveById(id=activeSaveId){
  try{
    let saveState;
    if(id===activeSaveId && state){
      saveGame(false);
      saveState=state;
    }else{
      const raw=safeGetSave(id);
      if(!raw) throw new Error("Save data missing");
      saveState=JSON.parse(raw);
    }
    const safeClub=String(saveState.club||"career").replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"");
    const safeDate=saveState.calendar?.date||"save";
    downloadJSON(exportedCareerPayload(saveState,id),`football-ceo-${safeClub}-${safeDate}.json`);
  }catch(e){
    console.error(e);
    alert("The save could not be exported.");
  }
}

function exportCurrentSave(){
  if(!state) return;
  exportSaveById(activeSaveId);
}

function triggerImportSave(){
  q("importSaveInput")?.click();
}

function validateImportedState(candidate){
  if(!candidate || typeof candidate!=="object") return false;
  if(!candidate.club || !candidate.season) return false;
  if(!DB.clubs.some(c=>c.name===candidate.club)) return false;
  return true;
}

function importSaveFile(file){
  if(!file) return;
  if(getSaveManifest().length>=MAX_LOCAL_SAVES){
    alert(`You already have ${MAX_LOCAL_SAVES} local careers. Delete one before importing another.`);
    return;
  }

  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const parsed=JSON.parse(String(reader.result||""));
      const imported=parsed?.state||parsed;
      if(!validateImportedState(imported)) throw new Error("Invalid Football CEO save");

      const id=generateSaveId();
      imported.saveId=id;

      // Imported saves can be from older builds. enterGame performs migrations.
      const previousState=state;
      const previousId=activeSaveId;
      state=imported;
      activeSaveId=id;
      resetWorldDatabase();
      ensureCalendarState();
      if(!writeSaveSlot(id,state)) throw new Error("Could not write imported save");

      state=previousState;
      activeSaveId=previousId;

      renderSavedCareers();
      renderSaveManager();
      alert(`${imported.club} career imported successfully.`);
    }catch(e){
      console.error(e);
      alert("That file could not be imported as a Football CEO save.");
    }finally{
      if(q("importSaveInput")) q("importSaveInput").value="";
    }
  };
  reader.readAsText(file);
}

function migrateLegacySave(){
  if(!storageWorks()) return;
  try{
    if(getSaveManifest().length) return;
    const raw=window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if(!raw) return;

    const legacy=JSON.parse(raw);
    if(!validateImportedState(legacy)) return;

    const id=generateSaveId();
    legacy.saveId=id;
    const previousState=state;
    const previousId=activeSaveId;
    state=legacy;
    activeSaveId=id;
    writeSaveSlot(id,legacy);
    state=previousState;
    activeSaveId=previousId;

    // Keep the legacy key as an emergency backup for now.
  }catch(e){
    console.error("Legacy save migration failed",e);
  }
}

function addNews(text){
  state.news.unshift({week:state.week,date:currentGameDateISO(),text});
  state.news=state.news.slice(0,20);
  renderInbox();
}

function showTab(id){
  document.querySelectorAll(".tab").forEach(x=>x.classList.add("hide"));
  const el=q(id); if(el) el.classList.remove("hide");
  document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("active",x.dataset.tab===id));

  const navKey=id==="dashboard"?"home":id==="squad"?"squad":id==="database"?"transfers":id==="inboxTab"?"inbox":"more";
  document.querySelectorAll(".mobile-nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.navKey===navKey));

  if(id==="squad") renderSquad();
  if(id==="database") renderDatabase();
  if(id==="fixtures") renderFixtures();
  if(id==="table") renderTable();
  if(id==="finances") renderFinances();
  if(id==="matchday") renderMatchday();
  if(id==="stadium" && typeof renderStadium==="function") renderStadium();
  if(id==="staff") renderStaff();
  if(id==="inboxTab") renderInbox();

  if(typeof window!=="undefined" && !document.documentElement.classList.contains("modal-open")){
    window.scrollTo({top:0,left:0,behavior:"auto"});
  }
}


let pendingMonthlyAfterMatch=null;
let pendingSeasonAfterMatch=false;

async function advanceDay(){
  ensureCalendarState();

  // Season review must be acknowledged before time moves again.
  if(state.seasonComplete){
    renderSeasonSummary();
    return;
  }

  const previousDate=currentGameDateISO();
  const nextDate=addCalendarDays(previousDate,1);
  const previousMonth=previousDate.slice(0,7);
  const nextMonth=nextDate.slice(0,7);

  let completedMonthlySummary=null;
  if(previousMonth!==nextMonth && (state.monthlyResults?.length || monthlyOperatingPL(state.monthlyFinance||createEmptyMonthlyFinance())!==0)){
    completedMonthlySummary=archiveMonthlySummary(previousMonth);
    resetMonthlyTracker();
  }

  state.calendar.date=nextDate;
  state.calendar.careerDay=(state.calendar.careerDay||0)+1;
  state.calendar.monthlyMonthKey=nextMonth;
  if(previousMonth!==nextMonth && typeof processMonthlyDebtPayments==="function") processMonthlyDebtPayments(nextDate);
  if(typeof processDueTransferInstallments==="function") processDueTransferInstallments(nextDate);
  if(typeof protectClubLiquidity==="function" && typeof clubCash==="function" && clubCash()<0) protectClubLiquidity("scheduled financial commitments");
  if(typeof processStadiumDay==="function") processStadiumDay(nextDate);
  if(typeof processRetirementAnnouncements==="function") processRetirementAnnouncements(nextDate);

  // Development is visible through the season rather than arriving only as
  // one arbitrary June roll. Three checkpoints allow realistic +1/-1 steps.
  if(/-(10|01|04)-0[1-7]$/.test(nextDate)){
    processPlayerDevelopmentCheckpoint(nextDate);
  }

  // Off-season rolls into the next football year on 1 June, but remains a
  // playable pre-season until the opening league fixture in August.
  if(state.season.phase==="offseason" &&
     nextDate>=startOfNextSeasonYearDate(currentSeasonStartYear()+1) &&
     !completedMonthlySummary){
    await performSeasonRollover();
    return;
  }

  // Fitness recovers on the daily calendar before injury/recovery processing.
  processDailyConditionRecovery();

  // Injuries/recovery and transfer-market activity live on the daily clock.
  processInjuries();
  if(typeof checkManagerDepthComplaints==="function") checkManagerDepthComplaints();
  if(typeof processTransferDay==="function") processTransferDay();
  if(typeof processLoanDay==="function") processLoanDay(nextDate);
  if(typeof processScheduledWorldMarketUpdate==="function") processScheduledWorldMarketUpdate(nextDate);
  if(typeof runScheduledAIClubReview==="function" && isTransferWindowOpen()) runScheduledAIClubReview(nextDate);
  if(typeof processChampionshipDay==="function") processChampionshipDay(nextDate);

  // Event-triggered manager reassessment happens the day after a significant
  // sale/injury; normal squad reviews happen once a week on Monday.
  let managerReviewed=false;
  if(state.calendar.managerReassessOn && nextDate>=state.calendar.managerReassessOn){
    state.calendar.managerReassessOn=null;
    if(typeof maybeGenerateManagerSquadRequest==="function"){
      maybeGenerateManagerSquadRequest();
      managerReviewed=true;
    }
  }

  if(isMonday(nextDate)){
    if(!managerReviewed && typeof maybeGenerateManagerSquadRequest==="function") maybeGenerateManagerSquadRequest();
  }

  if(isSunday(nextDate)){
    processWeeklyClubCycle();
  }

  // Fixtures are attached to real dates, independent of the Continue cadence.
  const round=fixtureRoundOnDate(nextDate);
  let todaysMatchReport=null;
  if(round){
    todaysMatchReport=simulateFixtureRound(round);

    if(round.week>=38){
      if(typeof settlePremierLeagueRevenue==="function") settlePremierLeagueRevenue(seasonTableFinish(state.club));
      if(typeof processOwnerSeasonFootballAssessment==="function") processOwnerSeasonFootballAssessment(seasonTableFinish(state.club));
      // The Premier League can finish before other domestic leagues.
      // Record that our league is done, but keep the calendar running until
      // 1 June so every background league can complete naturally.
      state.leagueSeasonFinished=true;
      state.season.phase="postseason";
    }
  }

  // 1 June is the hard football-season boundary. By this point the configured
  // background leagues have finished, so the CEO receives one consolidated
  // season review rather than ending the world on the PL's final matchday.
  const seasonReviewDate=`${currentSeasonStartYear()+1}-06-01`;
  if(state.leagueSeasonFinished && nextDate>=seasonReviewDate && !state.seasonComplete){
    state.seasonComplete=true;
    state.season.phase="complete";
    archiveCurrentSeason();
  }

  saveGame(false);
  renderAll();

  // Every user match opens its stored lineup report first. Any season/monthly
  // report waits until the user closes the match report.
  if(todaysMatchReport){
    pendingMonthlyAfterMatch=completedMonthlySummary;
    pendingSeasonAfterMatch=state.seasonComplete;
    renderMatchReport(todaysMatchReport);
  }else if(state.seasonComplete){
    renderSeasonSummary();
  }else if(completedMonthlySummary){
    renderMonthlySummary(completedMonthlySummary);
  }
}

function renderAll(){
  ensurePlayerDevelopmentState();
  if(typeof ensurePlayerMarketState==="function") ensurePlayerMarketState();
  const c=byClub(state.club);
  q("clubTitle").textContent=state.club;
  q("subTitle").textContent=`CEO • ${state.staff.manager.name} • ${currentSeasonLabel()} • ${formatGameDate(currentGameDateISO(),{weekday:false})}` + (storageAvailable ? "" : " • Session save only");
  renderDashboard();
  renderInbox();
  renderSquad();
  renderTable();
  renderFacilities();
  renderFinances();
  renderMatchday();
  if(typeof renderStadium==="function") renderStadium();
  renderStaff();
}

function footballClubInitials(name){
  const ignore=new Set(["FC","AFC","UNITED","CITY","TOWN","CLUB"]);
  const words=String(name||"FC").replace(/[^A-Za-z0-9 ]/g," ").split(/\s+/).filter(Boolean);
  const meaningful=words.filter(w=>!ignore.has(w.toUpperCase()));
  const use=meaningful.length?meaningful:words;
  if(use.length===1) return use[0].slice(0,2).toUpperCase();
  return use.slice(0,2).map(w=>w[0]).join("").toUpperCase();
}

function stakeholderStatusNotes(key){
  ensureStakeholderState();
  updateStakeholderMeta();
  const v=stakeholderValue(key);
  const notes=[];
  if(key==="fans"){
    if(v<10) notes.push("Supporter crisis: severe attendance and reputation consequences are possible.");
    else if(v<25) notes.push("Supporter unrest: matchday protests are possible.");
    else if(v<40) notes.push("Fan dissatisfaction is reducing expected attendance.");
    else notes.push("No active supporter-risk threshold.");
  }
  if(key==="owners") notes.push(`CEO status: ${state.stakeholderMeta.ceoJobStatus}.`);
  if(key==="players" && state.stakeholderMeta.playerUnrestRisk) notes.push("Dressing-room unrest risk is active.");
  if(key==="manager" && state.stakeholderMeta.managerResignationRisk) notes.push("Manager resignation risk is active.");
  if(key==="sponsors" && state.stakeholderMeta.sponsorTerminationRisk) notes.push("Early sponsorship termination risk is active.");
  return notes;
}

function renderStakeholderDetail(key){
  if(!STAKEHOLDER_GROUPS.includes(key)) return;
  updateStakeholderDrivers();
  ensureStakeholderState();
  updateStakeholderMeta();
  const value=stakeholderValue(key);
  const band=stakeholderBand(value);
  const drivers=state.happinessDrivers?.[key]||[];
  const history=state.stakeholderHistory?.[key]||[];
  const notes=stakeholderStatusNotes(key);

  q("stakeholderDetailTitle").textContent=STAKEHOLDER_LABELS[key]||key;
  q("stakeholderDetailMood").textContent=band.label;
  q("stakeholderDetailScore").textContent=`${Math.round(value)}%`;
  q("stakeholderDetailBar").style.width=`${value}%`;
  q("stakeholderDetailExplanation").textContent=stakeholderMoodExplanation(key,value);
  q("stakeholderDetailDrivers").innerHTML=drivers.length
    ?drivers.map(d=>`<div class="stakeholder-detail-row"><span>${d.label}</span><b class="delta ${d.value>0?"pos":d.value<0?"neg":"neu"}">${d.value>0?"+":""}${d.value}</b></div>`).join("")
    :`<div class="muted small">No major current pressure.</div>`;
  q("stakeholderDetailHistory").innerHTML=history.length
    ?history.slice(0,10).map(h=>`<div class="stakeholder-detail-row"><span><b>${h.date?shortGameDate(h.date):`MW ${h.week||0}`}</b><small>${h.reason}</small></span><b class="delta ${h.delta>0?"pos":"neg"}">${h.delta>0?"+":""}${Math.round(h.delta)}</b></div>`).join("")
    :`<div class="muted small">No relationship changes recorded yet.</div>`;

  const status=q("stakeholderDetailStatus");
  if(notes.length){
    status.classList.remove("hide");
    status.innerHTML=notes.map(x=>`<div>${x}</div>`).join("");
  }else status.classList.add("hide");
}

function openStakeholderDetail(key){
  renderStakeholderDetail(key);
  q("stakeholderDetailModal")?.classList.remove("hide");
  setModalScrollLock(true);
}

function closeStakeholderDetail(){
  q("stakeholderDetailModal")?.classList.add("hide");
  setModalScrollLock(false);
}

function renderDashboard(){
  updateStakeholderDrivers();

  q("dashboardWeek").textContent=state.season?.phase==="offseason"
    ? `Off-season • ${formatGameDate(currentGameDateISO(),{weekday:false})}`
    : `${formatGameDate(currentGameDateISO())}${state.week?` • After MW ${state.week}`:" • Pre-season"}`;

  ensureStakeholderState();
  updateStakeholderMeta();
  const people=[
    ["Fans","fans"],["Owners","owners"],["Players","players"],["Manager","manager"],["Sponsors","sponsors"]
  ];
  q("happinessCards").innerHTML=people.map(([label,key])=>{
    const v=stakeholderValue(key);
    const band=stakeholderBand(v);
    return `<button class="happy-card stakeholder-summary-card" data-stakeholder-key="${key}" type="button">
      <span class="stakeholder-summary-label">${label}</span>
      <strong class="happy-value">${Math.round(v)}%</strong>
      <span class="stakeholder-mood">${band.label}</span>
      <span class="happy-bar"><span style="width:${v}%"></span></span>
    </button>`;
  }).join("");
  q("happinessCards")?.querySelectorAll("[data-stakeholder-key]").forEach(btn=>{
    btn.addEventListener("click",()=>openStakeholderDetail(btn.dataset.stakeholderKey));
  });

  if(q("homeClubName")) q("homeClubName").textContent=state.club;
  if(q("homeClubMark")) q("homeClubMark").textContent=footballClubInitials(state.club);
  if(q("dashboardBudgetMetric")) q("dashboardBudgetMetric").textContent=money(state.budget||0);

  if(q("leaguePositionMetric")){
    const pos=clubLeaguePosition(state.club);
    q("leaguePositionMetric").textContent=ordinal(pos);
  }

  const pl=q("seasonPL");
  if(pl){
    pl.textContent=money(state.seasonPL);
    pl.className=(state.seasonPL>0?"good":state.seasonPL<0?"bad":"");
  }

  if(q("dashboardSCRMetric")){
    const scr=userSCRSnapshot();
    q("dashboardSCRMetric").textContent=`${(scr.ratio*100).toFixed(1)}%`;
    q("dashboardSCRMetric").className=scr.ratio>scr.limit?"bad":scr.ratio>0.60?"warn":"good";
    q("dashboardSCRStatus").textContent=`${scr.status} • ${Math.round(scr.limit*100)}% limit`;
  }

  if(q("formStrip")){
    q("formStrip").innerHTML=[...state.form.slice(-5),...Array(Math.max(0,5-state.form.length)).fill("")].map(x=>
      `<div class="form-chip ${x||"empty"}">${x||"—"}</div>`
    ).join("");
  }

  if(q("dashboardNextFixture")){
    if(state.season?.phase==="offseason"){
      const next=nextUserFixture();
      if(next){
        q("dashboardNextFixture").innerHTML=`<div class="fixture"><div class="muted small">OFF-SEASON • OPENING FIXTURE ${shortGameDate(next.round.date).toUpperCase()}</div><div class="teams">${next.game.home} <span class="muted">vs</span> ${next.game.away}</div></div>`;
      }else{
        q("dashboardNextFixture").innerHTML=`<div class="fixture"><div class="muted small">OFF-SEASON</div><div class="teams">Next season fixtures pending</div></div>`;
      }
    }else{
      const next=nextUserFixture();
      if(!next){
        q("dashboardNextFixture").innerHTML=`<div class="fixture"><div class="teams">No upcoming league fixture</div></div>`;
      }else{
        const {round:r,game:g}=next;
        const days=Math.max(0,dateDiffDays(currentGameDateISO(),r.date));
        const opponent=g.home===state.club?g.away:g.home;
        const venue=g.home===state.club?"Home":"Away";
        q("dashboardNextFixture").innerHTML=`<div class="fixture home-fixture">
          <div class="home-fixture-meta">${shortGameDate(r.date).toUpperCase()} • MW ${r.week} • ${venue.toUpperCase()}${days?` • ${days} DAY${days===1?"":"S"}`:" • TODAY"}</div>
          <div class="home-fixture-matchup">
            <div class="home-fixture-team"><span class="home-fixture-mark">${footballClubInitials(state.club)}</span><b>${state.club}</b></div>
            <div class="home-fixture-vs"><strong>${venue==="Home"?"VS":"AT"}</strong><span>${venue}</span></div>
            <div class="home-fixture-team"><span class="home-fixture-mark opponent">${footballClubInitials(opponent)}</span><b>${opponent}</b></div>
          </div>
        </div>`;
      }
    }
  }

  renderDashboardInboxPreview();
}

function renderDashboardInboxPreview(){
  const preview=q("dashboardInboxPreview");
  const count=q("dashboardInboxCount");
  if(!preview || !count) return;

  const actionable=(state.news||[]).filter(n=>{
    if(n.requestId){
      const req=state.managerRequests?.find(r=>r.id===n.requestId);
      return req && !req.resolved;
    }
    if(n.incomingOfferId){
      const offer=state.incomingTransferOffers?.find(o=>o.id===n.incomingOfferId);
      return offer && offer.status==="pending";
    }
    if(n.loanOfferId){const offer=state.incomingLoanOffers?.find(o=>o.id===n.loanOfferId);return offer&&offer.status==="pending";}
    return false;
  });

  const display=(actionable.length?actionable:state.news||[]).slice(0,3);
  count.textContent=String(actionable.length);
  if(q("inboxPageCount")) q("inboxPageCount").textContent=String(actionable.length);
  const mobileBadge=q("mobileInboxBadge");
  if(mobileBadge){
    mobileBadge.textContent=String(actionable.length);
    mobileBadge.classList.toggle("hide",actionable.length===0);
  }

  preview.innerHTML=display.length
    ? display.map(n=>`<button class="inbox-preview-item inbox-preview-open" type="button"><span class="pill">${n.date?shortGameDate(n.date):`MW ${n.week}`}</span><span>${n.text}</span><strong>›</strong></button>`).join("")
    : `<div class="muted small">No messages requiring your attention.</div>`;
  preview.querySelectorAll(".inbox-preview-open").forEach(btn=>btn.addEventListener("click",()=>showTab("inboxTab")));
}


/* --------------------------------------------------------------------------
   MANAGER DEPTH COMPLAINTS — v0.17.2
   -------------------------------------------------------------------------- */
function managerDepthAvailablePlayers(position){
  const players=squad(state.club).filter(p=>!state.injuries?.[p.id]);
  return players.filter(p=>{
    const suitability=typeof positionSuitability==="function"?positionSuitability(p,position):0;
    const condition=typeof playerCondition==="function"?playerCondition(p):100;
    return suitability>=70 && condition>=52;
  });
}

function managerDepthRequiredCount(position){
  if(typeof managerFormationForClub!=="function" || typeof MANAGER_FORMATIONS==="undefined") return 1;
  const formation=managerFormationForClub(state.club);
  const slots=MANAGER_FORMATIONS[formation]?.slots||[];
  const exact=slots.filter(x=>x===position).length;
  return Math.max(1,exact);
}

function managerDepthCrisis(position){
  const available=managerDepthAvailablePlayers(position);
  const required=managerDepthRequiredCount(position);
  return {
    crisis:available.length<required,
    available,
    required
  };
}

function checkManagerDepthComplaints(){
  if(!state.managerDepthRequestRejections?.length) return;
  if(!state.managerDepthComplaints) state.managerDepthComplaints=[];

  const today=currentCareerDay();
  state.managerDepthRequestRejections.forEach(rejection=>{
    if(rejection.complaintRaised) return;
    if(today-(rejection.rejectedDay||0)<5) return;

    const crisis=managerDepthCrisis(rejection.position);
    if(!crisis.crisis) return;

    const duplicate=state.managerDepthComplaints.some(c=>
      !c.resolved && c.position===rejection.position
    );
    if(duplicate) return;

    const id=`mdc${Date.now()}${Math.floor(Math.random()*1000)}`;
    const manager=state.staff?.manager?.name||rejection.manager||"The manager";
    const role=positionLabel(rejection.position);

    const complaint={
      id,
      rejectionId:rejection.id,
      position:rejection.position,
      originalRole:rejection.squadRole||"backup",
      manager,
      createdDay:today,
      resolved:false
    };
    state.managerDepthComplaints.push(complaint);
    rejection.complaintRaised=true;

    state.news.unshift({
      week:state.week,
      date:currentGameDateISO(),
      managerComplaintId:id,
      text:`${manager}: “I raised the need for another ${role} earlier. We now don't have enough fit options there and it is restricting how I can manage the team.”`
    });

    if(typeof stakeholderChange==="function"){
      stakeholderChange("manager",-2,`Squad-depth problem at ${role} after rejected recruitment request`,{notify:true});
    }
  });
}

function resolveManagerDepthComplaint(id,response){
  const complaint=state.managerDepthComplaints?.find(c=>c.id===id);
  if(!complaint || complaint.resolved) return;
  complaint.resolved=true;

  const manager=complaint.manager;
  const role=positionLabel(complaint.position);
  if(response==="back"){
    if(typeof stakeholderChange==="function"){
      stakeholderChange("manager",+3,`CEO promises to address ${role} depth`,{notify:true});
    }
    state.managerBacking=clamp((state.managerBacking??70)+4,0,100);

    if(!state.managerSquadVacancies) state.managerSquadVacancies=[];
    const existing=state.managerSquadVacancies.find(v=>!v.filled && v.position===complaint.position);
    if(!existing){
      state.managerSquadVacancies.push({
        id:`depth-${complaint.position}-${Date.now()}`,
        position:complaint.position,
        role:"backup",
        filled:false,
        soldPlayerName:"the earlier rejected depth request",
        createdDay:currentCareerDay(),
        reason:"CEO promised to address a manager depth complaint"
      });
    }
    if(state.managerRequestCooldowns){
      delete state.managerRequestCooldowns[`sign-${complaint.position}-backup`];
      delete state.managerRequestCooldowns[`sign-${complaint.position}-competition`];
    }
    if(typeof scheduleManagerReassessment==="function") scheduleManagerReassessment(1);
    addNews(`You told ${manager} that the club will address the shortage at ${role}. Recruitment will reassess the role.`);
  }else if(response==="defend"){
    if(typeof stakeholderChange==="function"){
      stakeholderChange("manager",-3,`CEO defended earlier ${role} recruitment decision`,{notify:true});
    }
    state.managerBacking=clamp((state.managerBacking??70)-4,0,100);
    addNews(`You defended the earlier decision not to add another ${role}. ${manager} remains dissatisfied with the available depth.`);
  }else{
    const youthTrust=typeof managerProfileForClub==="function"
      ? managerProfileForClub(state.club).youthTrust||60
      : 60;
    const delta=youthTrust>=78?0:youthTrust>=60?-1:-2;
    if(delta && typeof stakeholderChange==="function"){
      stakeholderChange("manager",delta,`Asked manager to solve ${role} shortage internally`,{notify:true});
    }
    addNews(`You asked ${manager} to solve the ${role} shortage using the existing squad${youthTrust>=78?" and younger options":""}.`);
  }

  saveGame(false);
  renderInbox();
  renderDashboard();
}

function renderInbox(){
  const inboxEl=q("inbox");
  if(!inboxEl) return;
  inboxEl.innerHTML=state.news.map(n=>{
    let actions="";
    if(n.requestId){
      const req=state.managerRequests?.find(r=>r.id===n.requestId);
      if(req && !req.resolved){
        actions=req.type==="sign"
          ? `<div class="inbox-action">
              <button class="btn primary manager-request-btn" data-request-id="${req.id}" data-accept="1">Review suggestions</button>
              ${req.outgoingRecommendation&&state.playerListStatus?.[req.outgoingRecommendation.playerId]!=="Transfer"
                ?`<button class="btn secondary manager-list-outgoing-btn" data-request-id="${req.id}">List recommended outgoing</button>`:""}
              <button class="btn secondary manager-request-btn" data-request-id="${req.id}" data-accept="0">${req.reminder?"Decline again":"Decline for now"}</button>
              <button class="btn secondary manager-close-window-btn" data-request-id="${req.id}">Close until next window</button>
            </div>`
          : `<div class="inbox-action">
              <button class="btn primary manager-request-btn" data-request-id="${req.id}" data-accept="1">Approve</button>
              <button class="btn secondary manager-request-btn" data-request-id="${req.id}" data-accept="0">Reject</button>
            </div>`;
      }
    }
    if(n.incomingOfferId){
      const offer=state.incomingTransferOffers?.find(o=>o.id===n.incomingOfferId);
      if(offer && offer.status==="pending"){
        actions=`<div class="inbox-action"><button class="btn primary incoming-offer-btn" data-offer-id="${offer.id}">Review offer</button></div>`;
      }
    }
    if(n.loanOfferId){const offer=state.incomingLoanOffers?.find(o=>o.id===n.loanOfferId);if(offer&&offer.status==="pending")actions=`<div class="inbox-action"><button class="btn primary loan-offer-btn" data-loan-offer-id="${offer.id}">Review loan offer</button></div>`;}
    if(n.loanReviewId){actions=`<div class="inbox-action"><button class="btn primary loan-review-btn" data-loan-review-id="${n.loanReviewId}">View loan review</button></div>`;}
    if(n.developmentReviewId){
      actions=`<div class="inbox-action"><button class="btn primary development-review-btn" data-review-id="${n.developmentReviewId}">View development review</button></div>`;
    }
    if(n.managerComplaintId){
      const complaint=state.managerDepthComplaints?.find(c=>c.id===n.managerComplaintId);
      if(complaint && !complaint.resolved){
        actions=`<div class="inbox-action manager-complaint-actions">
          <button class="btn primary manager-complaint-btn" data-complaint-id="${complaint.id}" data-response="back">Back manager</button>
          <button class="btn secondary manager-complaint-btn" data-complaint-id="${complaint.id}" data-response="defend">Defend decision</button>
          <button class="btn secondary manager-complaint-btn" data-complaint-id="${complaint.id}" data-response="squad">Use the squad</button>
        </div>`;
      }
    }
    const when=n.date?shortGameDate(n.date):`MW ${n.week}`;
    return `<div class="news"><span class="pill">${when}</span> &nbsp; ${n.text}${actions}</div>`;
  }).join("")||`<p class="muted">No messages.</p>`;

  document.querySelectorAll(".manager-request-btn").forEach(btn=>{
    btn.addEventListener("click",()=>resolveManagerRequest(btn.dataset.requestId,btn.dataset.accept==="1"));
  });
  document.querySelectorAll(".manager-close-window-btn").forEach(btn=>{
    btn.addEventListener("click",()=>closeManagerRecruitmentRequestUntilNextWindow(btn.dataset.requestId));
  });
  document.querySelectorAll(".manager-list-outgoing-btn").forEach(btn=>{
    btn.addEventListener("click",()=>approveManagerOutgoingRecommendation(btn.dataset.requestId));
  });
  document.querySelectorAll(".loan-offer-btn").forEach(btn=>btn.addEventListener("click",()=>openLoanOffer(btn.dataset.loanOfferId)));
  document.querySelectorAll(".loan-review-btn").forEach(btn=>btn.addEventListener("click",()=>openLoanReview(btn.dataset.loanReviewId)));
  document.querySelectorAll(".development-review-btn").forEach(btn=>btn.addEventListener("click",()=>openDevelopmentReview(btn.dataset.reviewId)));
  document.querySelectorAll(".manager-complaint-btn").forEach(btn=>{
    btn.addEventListener("click",()=>resolveManagerDepthComplaint(btn.dataset.complaintId,btn.dataset.response));
  });
  renderDashboardInboxPreview();
}


const SQUAD_POSITION_ORDER=["GK","RB","CB","LB","RM","CDM","CM","LM","CAM","RW","ST","LW"];

function primarySquadPosition(p){
  const tokens=String(p?.positions||"")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);

  if(tokens.length && SQUAD_POSITION_ORDER.includes(tokens[0])) return tokens[0];
  return SQUAD_POSITION_ORDER.find(pos=>tokens.includes(pos)) || "OTHER";
}

function squadPositionRank(p){
  const pos=primarySquadPosition(p);
  const i=SQUAD_POSITION_ORDER.indexOf(pos);
  return i===-1 ? SQUAD_POSITION_ORDER.length : i;
}

function renderSquad(){
  ensurePlayerState();
  const search=q("squadSearch");
  const query=(search?.value||"").toLowerCase();
  const fullSquad=squad(state.club);
  const arr=fullSquad
    .filter(p=>(p.name+" "+p.positions+" "+p.nationality).toLowerCase().includes(query))
    .sort((a,b)=>{
      const posDiff=squadPositionRank(a)-squadPositionRank(b);
      if(posDiff!==0) return posDiff;
      const ratingDiff=(b.overall||0)-(a.overall||0);
      if(ratingDiff!==0) return ratingDiff;
      return String(a.name).localeCompare(String(b.name));
    });

  if(q("squadTitle")) q("squadTitle").textContent=state.club+" squad";
  if(q("squadCount")) q("squadCount").textContent=fullSquad.length+" players";

  // Whole-squad metrics use the full squad, not the current search results.
  const squadValue=fullSquad.reduce((sum,p)=>sum+(p.value||0),0);
  const avgWage=fullSquad.length
    ? fullSquad.reduce((sum,p)=>sum+(state.playerContracts?.[p.id]?.wage??p.wage??0),0)/fullSquad.length
    : 0;
  const avgAge=fullSquad.length
    ? fullSquad.reduce((sum,p)=>sum+(p.age||0),0)/fullSquad.length
    : 0;

  if(q("squadValueMetric")) q("squadValueMetric").textContent=money(squadValue);
  if(q("squadAvgWageMetric")) q("squadAvgWageMetric").textContent=money(avgWage)+"/wk";
  if(q("squadAvgAgeMetric")) q("squadAvgAgeMetric").textContent=avgAge.toFixed(1);

  document.querySelectorAll(".squad-view-btn").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.squadView===squadView);
  });

  if(q("squadHead")){
    q("squadHead").innerHTML=squadView==="stats"
      ? `<tr><th>Player</th><th>Pos</th><th>OVR</th><th>Morale</th><th class="num">Apps</th><th class="num">Starts</th><th class="num">G</th><th class="num">A</th><th class="num">AVG</th></tr>`
      : `<tr><th>Player</th><th>Age</th><th>Value</th><th>Wage</th><th>Contract</th><th>Status</th></tr>`;
  }

  if(q("squadRows")){
    q("squadRows").innerHTML=arr.map(p=>{
      const star=typeof isClubStarPlayer==="function" && isClubStarPlayer(p,state.club);
      const playerCell=`<td class="squad-player-cell"><div class="squad-player-name-row"><button type="button" class="player-link" data-player-id="${p.id}">${p.name}</button>${star?`<span class="star-player-badge" title="Star player — selling may upset supporters">★ STAR</span>`:""}</div><div class="muted small">${p.nationality}</div></td>`;
      if(squadView==="stats"){
        return `<tr>
          ${playerCell}
          <td>${primarySquadPosition(p)==="OTHER"?p.positions:primarySquadPosition(p)}</td>
          <td><span class="rating">${p.overall}</span></td>
          <td class="${playerMoraleClass(state.playerMorale[p.id])}">${state.playerMorale[p.id]}</td>
          <td class="num">${state.playerStats[p.id]?.appearances||0}</td>
          <td class="num">${state.playerStats[p.id]?.starts||0}</td>
          <td class="num">${state.playerStats[p.id]?.goals||0}</td>
          <td class="num">${state.playerStats[p.id]?.assists||0}</td>
          <td class="num">${playerAverageRating(p.id)?.toFixed(2)||"—"}</td>
        </tr>`;
      }

      const status=state.playerListStatus[p.id]==="Transfer"
        ? `<span class="listed-badge listed-transfer">Transfer</span>`
        : state.playerListStatus[p.id]==="Loan"
          ? `<span class="listed-badge listed-loan">Loan</span>`
          : state.injuries?.[p.id]
            ? `<span class="injury-chip">${state.injuries[p.id].weeksLeft}w</span>`
            : `<span class="status-fit ${playerConditionClass(p)}">${Math.round(playerCondition(p))}% • ${playerConditionLabel(p)}</span>`;

      return `<tr>
        ${playerCell}
        <td>${p.age}</td>
        <td>${money(p.value)}</td>
        <td>${money(state.playerContracts[p.id]?.wage??p.wage)}/wk</td>
        <td>${state.playerContracts[p.id]?.endYear??p.contract}</td>
        <td>${status}</td>
      </tr>`;
    }).join("");
  }

  document.querySelectorAll(".player-link").forEach(btn=>{
    btn.addEventListener("click",()=>openPlayerProfile(btn.dataset.playerId));
  });
}

function renderDatabase(){
  if(!q("dbRows")) return;
  if(typeof recalculateAllPlayerMarketValues==="function") recalculateAllPlayerMarketValues();
  if(typeof refreshAIPlayerAvailability==="function" && isTransferWindowOpen()) refreshAIPlayerAvailability();

  const query=(q("dbSearch")?.value||"").toLowerCase();
  const availability=q("dbAvailability")?.value||"all";
  const sort=q("dbSort")?.value||"ovr";

  let arr=DB.players
    .filter(p=>!p.retired && p.club!=="Retired" && p.club!==state.club && p.club!=="Free Agent")
    .filter(p=>(`${p.name} ${p.club} ${p.nationality} ${p.positions}`).toLowerCase().includes(query))
    .map(p=>{
      const mv=typeof dynamicPlayerMarketValue==="function"?dynamicPlayerMarketValue(p):p.value;
      const cost=typeof expectedTransferCost==="function"?expectedTransferCost(p,state.club):{mid:p.value,low:p.value,high:p.value,status:"Not for sale"};
      const status=typeof aiAvailabilityStatus==="function"?aiAvailabilityStatus(p):"Not for sale";
      return {p,mv,cost,status};
    })
    .filter(x=>availability==="all" || x.status===availability);

  arr.sort((a,b)=>{
    if(sort==="cost") return a.cost.mid-b.cost.mid;
    if(sort==="value") return a.mv-b.mv;
    if(sort==="discount") return (a.cost.mid/a.mv)-(b.cost.mid/b.mv);
    if(sort==="age") return (a.p.age||99)-(b.p.age||99);
    return (b.p.overall||0)-(a.p.overall||0);
  });

  q("dbRows").innerHTML=arr.map(x=>{
    const p=x.p;
    const opp=typeof valueOpportunityLabel==="function"?valueOpportunityLabel(p,state.club):"";
    return `<tr>
      <td><button class="player-link database-player-link" data-player-id="${p.id}" type="button">${p.name}</button>${opp?`<div class="market-opportunity">${opp}</div>`:""}</td>
      <td>${p.club}</td>
      <td>${p.positions}</td>
      <td><span class="rating">${p.overall}</span></td>
      <td>${p.potential||p.overall}</td>
      <td>${p.age}</td>
      <td>${money(x.mv)}</td>
      <td><b>${money(x.cost.low)}–${money(x.cost.high)}</b></td>
      <td><span class="availability-chip ${x.status==="Transfer listed"?"listed":x.status==="Open to offers"?"open":""}">${x.status}</span></td>
    </tr>`;
  }).join("");
}

function poisson(lambda){
  let L=Math.exp(-lambda),k=0,p=1;
  do{k++;p*=Math.random()}while(p>L);
  return k-1;
}

/* --------------------------------------------------------------------------
   MATCH ENGINE 2.0 — v0.17
   --------------------------------------------------------------------------
   The engine works from explicit match selections rather than generic squad
   strength. That is deliberate groundwork for fitness, rotation and in-match
   substitutions: a future update can alter the active XI / fitness multipliers
   without replacing the result model again.
   -------------------------------------------------------------------------- */

function ensureMatchEngineState(){
  if(!state.matchEngine) state.matchEngine={};
  if(!state.matchEngine.form) state.matchEngine.form={};
}

function recordMatchEngineForm(club,result){
  ensureMatchEngineState();
  if(!state.matchEngine.form[club]) state.matchEngine.form[club]=[];
  state.matchEngine.form[club].push(result);
  state.matchEngine.form[club]=state.matchEngine.form[club].slice(-5);
}

function clubMatchEngineFormModifier(club){
  ensureMatchEngineState();
  const form=state.matchEngine.form[club]||[];
  if(!form.length) return 0;
  const points=form.reduce((sum,r)=>sum+(r==="W"?3:r==="D"?1:0),0);
  const perGame=points/form.length;
  // Form matters, but is deliberately capped so momentum cannot overwhelm
  // squad quality and create runaway seasons.
  return clamp((perGame-1.35)*0.035,-0.055,0.055);
}

function matchPlayerFitnessMultiplier(player,club,matchContext={}){
  ensureFitnessState();
  let condition=playerCondition(player);

  // Later match phases are played at a lower effective condition even before
  // the post-match condition deduction is applied.
  const phaseMinute=Number(matchContext.phaseMinute||0);
  if(phaseMinute>0){
    const profile=typeof managerProfileForClub==="function"?managerProfileForClub(club):null;
    const intensity=profile?1+((profile.pressing||65)-65)*0.002:1;
    condition-=phaseMinute*0.065*intensity;
  }

  let mult=conditionPerformanceMultiplier(condition);
  if(typeof globalThis.FootballCEOFitnessMultiplier==="function"){
    mult*=clamp(Number(globalThis.FootballCEOFitnessMultiplier(player,club,matchContext))||1,0.75,1.05);
  }
  return clamp(mult,0.55,1.05);
}

function fallbackMatchSelection(club){
  const players=squad(club).slice().sort((a,b)=>(b.overall||0)-(a.overall||0)).slice(0,11);
  return {
    formation:"4-2-3-1",
    xi:players.map((p,i)=>({
      player:p,playerId:p.id,slot:["GK","RB","CB","CB","LB","DM","DM","RW","AM","LW","ST"][i]||"CM",
      slotIndex:i,suitability:100
    })),
    bench:[]
  };
}

function matchSelectionForClub(club,provided=null){
  if(provided) return provided;
  if(typeof managerSelectMatchdaySquad==="function") return managerSelectMatchdaySquad(club);
  return fallbackMatchSelection(club);
}

function matchSlotWeights(slot){
  const map={
    GK:{attack:0.02,defence:0.25,control:0.10,gk:1.00},
    RB:{attack:0.45,defence:1.00,control:0.55,gk:0},
    LB:{attack:0.45,defence:1.00,control:0.55,gk:0},
    CB:{attack:0.12,defence:1.35,control:0.28,gk:0},
    DM:{attack:0.42,defence:1.05,control:1.10,gk:0},
    CM:{attack:0.72,defence:0.67,control:1.25,gk:0},
    RM:{attack:1.02,defence:0.43,control:0.82,gk:0},
    LM:{attack:1.02,defence:0.43,control:0.82,gk:0},
    RW:{attack:1.28,defence:0.25,control:0.72,gk:0},
    LW:{attack:1.28,defence:0.25,control:0.72,gk:0},
    AM:{attack:1.22,defence:0.28,control:1.02,gk:0},
    ST:{attack:1.55,defence:0.12,control:0.35,gk:0}
  };
  return map[slot]||{attack:0.65,defence:0.65,control:0.65,gk:0};
}

function managerMatchProfile(club){
  if(typeof managerProfileForClub==="function"){
    const p=managerProfileForClub(club);
    if(p) return p;
  }
  return {possession:65,pressing:65,verticality:65,flexibility:65};
}

function buildMatchTeamContext(club,selection=null,matchContext={}){
  const selected=matchSelectionForClub(club,selection);
  const profile=managerMatchProfile(club);
  const entries=(selected.xi||[]).map(x=>{
    const p=x.player;
    if(!p) return {...x,effectiveOverall:50,fitness:1};
    const suitability=clamp(Number(x.suitability??(typeof positionSuitability==="function"?positionSuitability(p,x.slot):100)),0,100);
    const positionFactor=0.82+0.18*(suitability/100);
    const fitness=matchPlayerFitnessMultiplier(p,club,{...matchContext,slot:x.slot,selection:selected});
    return {
      ...x,
      suitability,
      fitness,
      effectiveOverall:(p.overall||65)*positionFactor*fitness
    };
  });

  const weightedAverage=(key)=>{
    let total=0,weight=0;
    entries.forEach(x=>{
      const w=matchSlotWeights(x.slot)[key]||0;
      if(w<=0) return;
      total+=x.effectiveOverall*w;
      weight+=w;
    });
    return weight?total/weight:65;
  };

  let attack=weightedAverage("attack");
  let defence=weightedAverage("defence");
  let control=weightedAverage("control");
  let goalkeeper=weightedAverage("gk");
  const filled=entries.filter(x=>x.player).length;
  const xiOverall=entries.length
    ? entries.reduce((s,x)=>s+x.effectiveOverall,0)/entries.length
    : 60;

  // Manager identity now matters. Effects are intentionally a few rating
  // points rather than giant multipliers: players remain the main driver.
  attack+=(profile.verticality-65)*0.025+(profile.pressing-65)*0.014+(profile.possession-65)*0.010;
  defence+=(profile.possession-65)*0.018+(profile.pressing-65)*0.020-(profile.verticality-65)*0.008;
  control+=(profile.possession-65)*0.030+(profile.pressing-65)*0.012;

  // Vacant formation slots should hurt badly rather than being silently ignored.
  const vacancyPenalty=Math.max(0,11-filled);
  attack-=vacancyPenalty*2.2;
  defence-=vacancyPenalty*2.8;
  control-=vacancyPenalty*2.4;

  return {
    club,
    formation:selected.formation||"Unknown",
    selection:selected,
    entries,
    profile,
    attack:clamp(attack,50,96),
    defence:clamp(defence,50,96),
    control:clamp(control,50,96),
    goalkeeper:clamp(goalkeeper,45,96),
    overall:clamp(xiOverall,50,96),
    formModifier:clubMatchEngineFormModifier(club),
    vacancyPenalty
  };
}

function matchTacticalModifier(team,opponent){
  const flexibilityEdge=(team.profile.flexibility-opponent.profile.flexibility)/100;
  const controlEdge=(team.control-opponent.control)/20;
  const directness=(team.profile.verticality-65)/100;

  // Flexible/control-heavy sides gain a small consistency edge; vertical sides
  // trade some control for attacking threat. Capped tightly.
  return clamp(
    flexibilityEdge*0.045+
    controlEdge*0.035+
    directness*0.030,
    -0.09,0.09
  );
}

function expectedGoalsForMatch(homeCtx,awayCtx){
  const qualityEdge=homeCtx.overall-awayCtx.overall;
  const homeTactic=matchTacticalModifier(homeCtx,awayCtx);
  const awayTactic=matchTacticalModifier(awayCtx,homeCtx);

  // Calibrated around a roughly 2.6–2.9 goal Premier League environment.
  // Attack/defence/GK quality and the actual selected XI have much more
  // explanatory power than the old best-16 squad average.
  let homeXG=
    1.36+
    (homeCtx.attack-76)*0.036-
    (awayCtx.defence-76)*0.027-
    (awayCtx.goalkeeper-76)*0.012+
    qualityEdge*0.018+
    homeTactic;

  let awayXG=
    1.10+
    (awayCtx.attack-76)*0.036-
    (homeCtx.defence-76)*0.027-
    (homeCtx.goalkeeper-76)*0.012-
    qualityEdge*0.018+
    awayTactic;

  homeXG*=1+homeCtx.formModifier-awayCtx.formModifier*0.45;
  awayXG*=1+awayCtx.formModifier-homeCtx.formModifier*0.45;

  // Small match-day variance keeps football unpredictable without letting
  // randomness dominate the season.
  homeXG*=0.94+Math.random()*0.12;
  awayXG*=0.94+Math.random()*0.12;

  return {
    homeXG:clamp(homeXG,0.22,3.35),
    awayXG:clamp(awayXG,0.18,3.10)
  };
}

function simulateMatchPhase(homeContext,awayContext,share=1){
  share=clamp(Number(share||1),0.05,1);
  const xg=expectedGoalsForMatch(homeContext,awayContext);
  const homeXG=xg.homeXG*share;
  const awayXG=xg.awayXG*share;
  return {
    share,
    homeXG,
    awayXG,
    hg:Math.min(7,poisson(homeXG)),
    ag:Math.min(7,poisson(awayXG))
  };
}


function cloneMatchSelection(selection){
  return {
    ...selection,
    xi:(selection.xi||[]).map(x=>({...x})),
    bench:[...(selection.bench||[])]
  };
}

function effectiveConditionAtMinute(player,club,minute){
  const base=typeof playerCondition==="function"?playerCondition(player):100;
  const profile=typeof managerProfileForClub==="function"?managerProfileForClub(club):null;
  const intensity=profile?1+((profile.pressing||65)-65)*0.002:1;
  return clamp(base-minute*0.065*intensity,20,100);
}

function managerSubstitutionScore(entry,club,minute,scoreDiff,importance=60){
  if(!entry?.player) return -999;
  const condition=effectiveConditionAtMinute(entry.player,club,minute);
  let need=(78-condition)*0.35;
  need+=minute>=72?7.0:minute>=58?4.5:0;
  if(condition<65) need+=3;
  if(condition<55) need+=5;
  if(condition<45) need+=8;

  // Managers are more proactive when chasing, and protect attacking players
  // slightly earlier when leading.
  if(scoreDiff>0 && ["ST","RW","LW","AM"].includes(entry.slot)) need+=1.8;
  if(scoreDiff<0 && ["DM","CB","RB","LB"].includes(entry.slot)) need+=2.6;
  if(scoreDiff<0 && ["ST","RW","LW","AM"].includes(entry.slot)) need+=1.2;
  need+=(100-importance)*0.018;
  return need;
}

function managerMakeSubstitutions(club,selection,scoreDiff,minute,maxChanges=3,alreadyUsed=new Set(),context={}){
  const current=cloneMatchSelection(selection);
  const changes=[];
  const profile=typeof managerProfileForClub==="function"?managerProfileForClub(club):null;
  const importance=Number(context.importance||60);
  const rotation=typeof managerRotationTendency==="function"?managerRotationTendency(club):55;

  const outgoing=current.xi
    .filter(x=>x.player && !x.cameOn)
    .map(x=>({x,need:managerSubstitutionScore(x,club,minute,scoreDiff,importance)}))
    .sort((a,b)=>b.need-a.need);

  for(const candidate of outgoing){
    if(changes.length>=maxChanges) break;
    if(candidate.need<3.5 && minute<72) continue;
    if(candidate.need<1.5 && minute>=72 && scoreDiff===0) continue;

    const out=candidate.x;
    const alternatives=current.bench
      .filter(p=>p && !alreadyUsed.has(String(p.id)))
      .map(p=>{
        const suitability=typeof positionSuitability==="function"?positionSuitability(p,out.slot):0;
        const condition=typeof playerCondition==="function"?playerCondition(p):100;
        let tactical=0;

        if(scoreDiff<0 && ["ST","RW","LW","AM","RM","LM"].some(pos=>String(p.positions||"").includes(pos))) tactical+=2.0;
        if(scoreDiff>0 && ["CB","DM","CDM","RB","LB"].some(pos=>String(p.positions||"").includes(pos))) tactical+=1.3;

        const usage=typeof managerUsageSelectionAdjustment==="function"
          ? managerUsageSelectionAdjustment(p,club,{importance,substitution:true})
          : 0;
        const score=(p.overall||0)*0.66+suitability*0.23+condition*0.11+tactical+usage;
        return {p,suitability,condition,score};
      })
      .filter(x=>x.suitability>=55 && x.condition>=48)
      .sort((a,b)=>b.score-a.score);

    const best=alternatives[0];
    if(!best) continue;

    const outCondition=effectiveConditionAtMinute(out.player,club,minute);
    const outScore=(out.player.overall||0)*0.69+(out.suitability??100)*0.23+outCondition*0.08;
    const threshold=scoreDiff<0?outScore-1.5:outScore-0.5;
    const managerWillingness=(rotation-50)*0.025+(minute>=72?1.2:0);

    if(best.score+managerWillingness<threshold && outCondition>=60) continue;

    const replacement={
      slot:out.slot,
      slotIndex:out.slotIndex,
      player:best.p,
      playerId:best.p.id,
      overall:best.p.overall||0,
      suitability:best.suitability,
      condition:best.condition,
      cameOn:true,
      cameOnMinute:minute
    };

    const idx=current.xi.findIndex(x=>x.slotIndex===out.slotIndex);
    current.xi[idx]=replacement;
    alreadyUsed.add(String(best.p.id));
    changes.push({
      minute,
      playerOutId:out.player.id,
      playerOutName:out.player.name,
      playerInId:best.p.id,
      playerInName:best.p.name,
      slot:out.slot,
      reason:outCondition<58?"fatigue":scoreDiff<0?"chasing game":scoreDiff>0?"protecting lead":"fresh legs"
    });
  }

  return {selection:current,changes,alreadyUsed};
}

function buildMatchUsage(initialSelection,substitutions){
  const minutes={};
  const slots={};
  (initialSelection.xi||[]).forEach(x=>{
    if(!x.player) return;
    minutes[x.player.id]=90;
    slots[x.player.id]=x.slot;
  });

  substitutions.slice().sort((a,b)=>a.minute-b.minute).forEach(s=>{
    if(minutes[s.playerOutId]!=null){
      minutes[s.playerOutId]=Math.min(minutes[s.playerOutId],s.minute);
    }
    minutes[s.playerInId]=Math.max(minutes[s.playerInId]||0,90-s.minute);
    slots[s.playerInId]=s.slot;
  });

  return {minutes,slots};
}

function simulateGameWithManagerSubs(home,away,options={}){
  const homeInitial=cloneMatchSelection(options.homeSelection||matchSelectionForClub(home));
  const awayInitial=cloneMatchSelection(options.awaySelection||matchSelectionForClub(away));
  let homeActive=cloneMatchSelection(homeInitial);
  let awayActive=cloneMatchSelection(awayInitial);
  const homeSubs=[],awaySubs=[];
  const homeUsed=new Set(),awayUsed=new Set();

  let hg=0,ag=0,totalHomeXG=0,totalAwayXG=0;
  const phases=[];

  const playPhase=(share,minute)=>{
    const hc=buildMatchTeamContext(home,homeActive,{home:true,opponent:away,phaseMinute:minute});
    const ac=buildMatchTeamContext(away,awayActive,{home:false,opponent:home,phaseMinute:minute});
    const phase=simulateMatchPhase(hc,ac,share);
    hg+=phase.hg;ag+=phase.ag;
    totalHomeXG+=phase.homeXG;totalAwayXG+=phase.awayXG;
    phases.push({...phase,startMinute:minute,homeContext:hc,awayContext:ac});
  };

  playPhase(0.66,0);

  let hs=managerMakeSubstitutions(home,homeActive,hg-ag,60,3,homeUsed,{
    importance:options.homeImportance||60
  });
  homeActive=hs.selection;homeSubs.push(...hs.changes);

  let as=managerMakeSubstitutions(away,awayActive,ag-hg,60,3,awayUsed,{
    importance:options.awayImportance||60
  });
  awayActive=as.selection;awaySubs.push(...as.changes);

  playPhase(0.17,60);

  hs=managerMakeSubstitutions(home,homeActive,hg-ag,75,Math.max(0,5-homeSubs.length),homeUsed,{
    importance:options.homeImportance||60
  });
  homeActive=hs.selection;homeSubs.push(...hs.changes);

  as=managerMakeSubstitutions(away,awayActive,ag-hg,75,Math.max(0,5-awaySubs.length),awayUsed,{
    importance:options.awayImportance||60
  });
  awayActive=as.selection;awaySubs.push(...as.changes);

  playPhase(0.17,75);

  return {
    hg,ag,
    homeXG:totalHomeXG,
    awayXG:totalAwayXG,
    homeContext:phases[phases.length-1].homeContext,
    awayContext:phases[phases.length-1].awayContext,
    homeInitial,awayInitial,
    homeFinal:homeActive,awayFinal:awayActive,
    homeSubs,awaySubs,
    homeUsage:buildMatchUsage(homeInitial,homeSubs),
    awayUsage:buildMatchUsage(awayInitial,awaySubs),
    phases
  };
}

function applyMatchUsageCondition(club,selection,usage){
  const allPlayers=new Map();
  (selection.xi||[]).forEach(x=>{if(x.player)allPlayers.set(String(x.player.id),x.player);});
  (selection.bench||[]).forEach(p=>{if(p)allPlayers.set(String(p.id),p);});

  Object.entries(usage?.minutes||{}).forEach(([id,mins])=>{
    const p=allPlayers.get(String(id))||DB.players.find(x=>String(x.id)===String(id));
    if(p && mins>0) recordPlayerMinutes(p,mins,club);
  });
}

function simulateGameDetailed(home,away,options={}){
  const homeContext=buildMatchTeamContext(home,options.homeSelection||null,{home:true,opponent:away,phase:"full"});
  const awayContext=buildMatchTeamContext(away,options.awaySelection||null,{home:false,opponent:home,phase:"full"});

  // v0.17 is one 90-minute phase. v0.18 can split this into e.g. 0–60 and
  // 60–90 phases, rebuild either context after substitutions, and reuse the
  // same simulation model without changing the engine's core maths.
  const phase=simulateMatchPhase(homeContext,awayContext,1);

  return {
    hg:phase.hg,
    ag:phase.ag,
    homeXG:phase.homeXG,
    awayXG:phase.awayXG,
    homeContext,
    awayContext,
    phases:[phase]
  };
}

function simulateGame(home,away,options={}){
  const result=simulateGameDetailed(home,away,options);
  // Backward-compatible tuple for any older call sites.
  return [result.hg,result.ag];
}

function applyResult(home,away,hg,ag){
  const h=state.table[home],a=state.table[away];
  h.p++;a.p++;h.gf+=hg;h.ga+=ag;a.gf+=ag;a.ga+=hg;

  let homeOutcome="D",awayOutcome="D";
  if(hg>ag){
    h.w++;h.pts+=3;a.l++;
    homeOutcome="W";awayOutcome="L";
  }else if(hg<ag){
    a.w++;a.pts+=3;h.l++;
    homeOutcome="L";awayOutcome="W";
  }else{
    h.d++;a.d++;h.pts++;a.pts++;
  }

  recordMatchEngineForm(home,homeOutcome);
  recordMatchEngineForm(away,awayOutcome);
}


function clubScaleFactor(club=state.club){
  const c=byClub(club);
  const rep=c?.reputation||70;
  return clamp((rep-60)/35,0.20,1.10);
}


const FACILITY_TYPES={
  training:{
    label:"Training facilities",
    description:"Affects player development and player satisfaction with the club's football environment."
  },
  medical:{
    label:"Medical facilities",
    description:"Works alongside the Head Physio to reduce injury frequency and improve recovery."
  },
  academy:{
    label:"Academy",
    description:"Will drive youth intake quality and long-term player development as the academy system expands."
  },
  recruitment:{
    label:"Recruitment network",
    description:"Improves transfer intelligence and supports the Director of Football."
  }
};

function facilityRating(type){
  if(!state.facilities){
    const rep=byClub(state.club)?.reputation||72;
    state.facilities={
      training:clamp(Math.round(rep-3),55,94),
      medical:clamp(Math.round(rep-5),52,92),
      academy:clamp(Math.round(rep-7),48,93),
      recruitment:clamp(Math.round(rep-4),52,94)
    };
  }
  return clamp(Number(state.facilities?.[type]??50),0,100);
}

function facilityAnnualRunningCost(type,rating=facilityRating(type)){
  // Costs rise non-linearly: elite facilities are disproportionately expensive.
  const r=clamp(rating,0,100)/100;
  const scales={
    training:[1_200_000,17_000_000],
    medical:[850_000,11_000_000],
    academy:[1_000_000,15_000_000],
    recruitment:[700_000,10_000_000]
  };
  const [floor,ceiling]=scales[type]||[750_000,10_000_000];
  return Math.round((floor+(ceiling-floor)*Math.pow(r,1.75))/250000)*250000;
}

function facilityUpgradeCost(type,points=5){
  const current=facilityRating(type);
  const target=clamp(current+points,0,100);
  if(target<=current) return 0;

  // Every point gets more expensive as the facility becomes elite.
  let cost=0;
  for(let r=current;r<target;r++){
    const basePerPoint={
      training:650_000,
      medical:500_000,
      academy:575_000,
      recruitment:475_000
    }[type]||500_000;
    const eliteMult=1+Math.pow(r/100,2.2)*3.2;
    cost+=basePerPoint*eliteMult;
  }
  return Math.round(cost/250000)*250000;
}

function totalFacilityAnnualCost(){
  return Object.keys(FACILITY_TYPES).reduce((sum,type)=>sum+facilityAnnualRunningCost(type),0);
}

function facilityEffectText(type){
  const r=facilityRating(type);
  if(type==="training"){
    const dev=Math.round((r-50)/12);
    return `${dev>=0?"+":""}${dev}% development modifier`;
  }
  if(type==="medical"){
    const injury=Math.round((r-50)*0.18);
    return `${Math.max(0,injury)}% injury-prevention effect`;
  }
  if(type==="academy"){
    return r>=85?"Elite youth pathway":r>=70?"Strong youth pathway":r>=55?"Average youth pathway":"Below PL standard";
  }
  if(type==="recruitment"){
    const intel=Math.round((r-50)*0.22);
    return `${Math.max(0,intel)}% recruitment intelligence bonus`;
  }
  return "";
}

function approveFacilityUpgrade(type,points=5){
  if(!FACILITY_TYPES[type]) return;
  const current=facilityRating(type);
  if(current>=100) return;
  const actualPoints=Math.min(points,100-current);
  const cost=facilityUpgradeCost(type,actualPoints);

  if(typeof canClubAfford==="function" && !canClubAfford(cost)){
    addNews(`The board could not approve the ${FACILITY_TYPES[type].label.toLowerCase()} upgrade because club cash is insufficient.`);
    return;
  }

  if(typeof spendClubCapital==="function") spendClubCapital(cost,`${FACILITY_TYPES[type].label} upgrade`);
  state.facilities[type]=clamp(current+actualPoints,0,100);
  addNews(`${FACILITY_TYPES[type].label} upgraded from ${current} to ${state.facilities[type]} for ${money(cost)}.`);
  saveGame(false);
  renderFacilities();
  renderFinances();
  renderDashboard();
}

function renderFacilities(){
  const wrap=q("facilitiesGrid");
  if(!wrap) return;

  wrap.innerHTML=Object.entries(FACILITY_TYPES).map(([type,meta])=>{
    const rating=facilityRating(type);
    const upgrade=Math.min(5,100-rating);
    const cost=upgrade>0?facilityUpgradeCost(type,upgrade):0;
    return `<div class="facility-card">
      <div class="facility-card-top">
        <div>
          <div class="k">${meta.label}</div>
          <div class="facility-rating">${rating}</div>
        </div>
        <span class="pill">${facilityEffectText(type)}</span>
      </div>
      <div class="progress"><span style="width:${rating}%"></span></div>
      <p class="muted small">${meta.description}</p>
      <div class="facility-cost-row"><span>Annual running cost</span><b>${money(facilityAnnualRunningCost(type))}</b></div>
      ${upgrade>0?`<button class="btn secondary facility-upgrade-btn" data-facility="${type}">Upgrade +${upgrade} • ${money(cost)}</button>`:`<div class="good small"><b>Maximum standard reached</b></div>`}
    </div>`;
  }).join("");

  document.querySelectorAll(".facility-upgrade-btn").forEach(btn=>{
    btn.addEventListener("click",()=>approveFacilityUpgrade(btn.dataset.facility,5));
  });

  if(q("facilityAnnualTotal")) q("facilityAnnualTotal").textContent=money(totalFacilityAnnualCost());
}

function weeklyClubOperatingCosts(){
  const scale=clubScaleFactor();
  const squadSize=Math.max(18,squad(state.club).length);

  // Core club overheads separate from football facilities.
  const stadiumOperations=350_000+scale*620_000;
  const nonFootballStaff=520_000+scale*1_050_000;   // admin, marketing, finance, HR, IT
  const matchdayStaff=0;
  const travelAndLogistics=110_000+scale*280_000;
  const insurance=95_000+scale*210_000;
  const generalOverheads=180_000+scale*400_000;
  const squadSupport=Math.max(0,squadSize-22)*8_000;

  const facilityRunning=totalFacilityAnnualCost()/52;

  return {
    stadiumOperations,
    nonFootballStaff,
    matchdayStaff,
    travelAndLogistics,
    insurance,
    generalOverheads,
    squadSupport,
    facilityRunning,
    total:stadiumOperations+nonFootballStaff+matchdayStaff+
      travelAndLogistics+insurance+generalOverheads+squadSupport+facilityRunning
  };
}

function annualisedOperatingCosts(){
  const weekly=weeklyClubOperatingCosts();
  return weekly.total*52 + weeklyMatchdayStaffCost()*19;
}


function weeklyMatchdayStaffCost(){
  const scale=clubScaleFactor();
  return 145_000+scale*260_000;
}

function processWeeklyClubCycle(){
  const date=currentGameDateISO();
  if(state.calendar.lastWeeklyProcess===date) return;
  state.calendar.lastWeeklyProcess=date;

  const playerWages=squad(state.club).reduce((s,p)=>s+(state.playerContracts?.[p.id]?.wage??p.wage??0),0)+(typeof userLoanWeeklyWageAdjustment==="function"?userLoanWeeklyWageAdjustment():0);
  const staffWeekly=(state.staff?.manager?.wage||0)+(state.staff?.dof?.wage||0)+(state.staff?.physio?.wage||0);
  const operatingCosts=weeklyClubOperatingCosts();

  const coreIncome=typeof processWeeklyCoreRevenue==="function"
    ?processWeeklyCoreRevenue()
    :{commercial:byClub(state.club).reputation*65000*(38/52),sponsor:state.sponsorship?state.sponsorship.annualValue/52:0,leagueIncome:0};
  const commercialIncome=coreIncome.commercial||0;
  const sponsorIncome=coreIncome.sponsor||0;
  const leagueIncome=coreIncome.leagueIncome||0;

  if(!state.monthlyFinance) state.monthlyFinance=createEmptyMonthlyFinance();
  state.monthlyFinance.commercialIncome+=commercialIncome;
  state.monthlyFinance.sponsorIncome+=sponsorIncome;
  state.monthlyFinance.leagueIncome=(state.monthlyFinance.leagueIncome||0)+leagueIncome;
  state.monthlyFinance.playerWages+=playerWages;
  state.monthlyFinance.staffWages+=staffWeekly;
  state.monthlyFinance.operatingCosts+=operatingCosts.total;

  const netOperating=leagueIncome+commercialIncome+sponsorIncome-playerWages-staffWeekly-operatingCosts.total;
  state.seasonPL += netOperating;
  if(typeof recordClubCash==="function") recordClubCash(netOperating,"Weekly club operating cash flow","operating");
  if(typeof ensureClubFinanceState==="function"){
    const cf=ensureClubFinanceState();
    cf.seasonCosts.playerWages=(cf.seasonCosts.playerWages||0)+playerWages;
    cf.seasonCosts.staffWages=(cf.seasonCosts.staffWages||0)+staffWeekly;
    cf.seasonCosts.operating=(cf.seasonCosts.operating||0)+operatingCosts.total;
  }
  if(typeof protectClubLiquidity==="function" && typeof clubCash==="function" && clubCash()<0) protectClubLiquidity("weekly operating costs");
  if(typeof updateSupporterDemandWeekly==="function") updateSupporterDemandWeekly();

  applyStakeholderHappiness();
  updateIndividualMorale();
}

function simulateFixtureRound(round){
  if(!round) return null;

  const mine=round.games.find(game=>game.home===state.club||game.away===state.club);
  const userOpponent=mine ? (mine.home===state.club?mine.away:mine.home) : null;
  const userImportance=typeof managerFixtureImportance==="function"
    ? managerFixtureImportance(state.club,userOpponent)
    : 60;

  const matchSelection=typeof managerSelectMatchdaySquad==="function"
    ? managerSelectMatchdaySquad(state.club,{opponent:userOpponent,importance:userImportance})
    : null;

  round.games.forEach(game=>{
    const homeImportance=typeof managerFixtureImportance==="function"?managerFixtureImportance(game.home,game.away):60;
    const awayImportance=typeof managerFixtureImportance==="function"?managerFixtureImportance(game.away,game.home):60;

    const homeSelection=game.home===state.club
      ? matchSelection
      : (typeof managerSelectMatchdaySquad==="function"?managerSelectMatchdaySquad(game.home,{opponent:game.away,importance:homeImportance}):null);
    const awaySelection=game.away===state.club
      ? matchSelection
      : (typeof managerSelectMatchdaySquad==="function"?managerSelectMatchdaySquad(game.away,{opponent:game.home,importance:awayImportance}):null);

    const sim=simulateGameWithManagerSubs(game.home,game.away,{
      homeSelection,awaySelection,homeImportance,awayImportance
    });

    applyMatchUsageCondition(game.home,sim.homeInitial,sim.homeUsage);
    applyMatchUsageCondition(game.away,sim.awayInitial,sim.awayUsage);

    state.results[`${round.week}-${game.home}-${game.away}`]={
      hg:sim.hg,
      ag:sim.ag,
      date:round.date,
      engine:{
        version:"2.1",
        homeXG:Math.round(sim.homeXG*100)/100,
        awayXG:Math.round(sim.awayXG*100)/100,
        home:{
          formation:sim.homeInitial.formation,
          overall:Math.round(sim.homeContext.overall*10)/10,
          attack:Math.round(sim.homeContext.attack*10)/10,
          defence:Math.round(sim.homeContext.defence*10)/10,
          goalkeeper:Math.round(sim.homeContext.goalkeeper*10)/10,
          control:Math.round(sim.homeContext.control*10)/10
        },
        away:{
          formation:sim.awayInitial.formation,
          overall:Math.round(sim.awayContext.overall*10)/10,
          attack:Math.round(sim.awayContext.attack*10)/10,
          defence:Math.round(sim.awayContext.defence*10)/10,
          goalkeeper:Math.round(sim.awayContext.goalkeeper*10)/10,
          control:Math.round(sim.awayContext.control*10)/10
        }
      },
      substitutions:{
        home:sim.homeSubs,
        away:sim.awaySubs
      },
      usage:{
        home:sim.homeUsage,
        away:sim.awayUsage
      }
    };
    applyResult(game.home,game.away,sim.hg,sim.ag);
  });

  if(!mine) return;
  const res=state.results[`${round.week}-${mine.home}-${mine.away}`];
  const myGoals=mine.home===state.club?res.hg:res.ag;
  const opGoals=mine.home===state.club?res.ag:res.hg;
  const opp=mine.home===state.club?mine.away:mine.home;
  const outcome=myGoals>opGoals?"W":myGoals===opGoals?"D":"L";
  const myUsage=mine.home===state.club?res.usage.home:res.usage.away;
  const mySubs=mine.home===state.club?res.substitutions.home:res.substitutions.away;

  const matchReport=trackPlayerMatchStats(myGoals,opGoals,matchSelection,{usage:myUsage,substitutions:mySubs});
  res.matchReport={
    ...matchReport,
    engine:res.engine,
    date:round.date,
    week:round.week,
    home:mine.home,
    away:mine.away,
    userClub:state.club,
    opponent:opp,
    userHome:mine.home===state.club,
    goalsFor:myGoals,
    goalsAgainst:opGoals,
    outcome
  };
  state.form.push(outcome);
  state.form=state.form.slice(-5);

  if(mine.home===state.club){
    const md=projectedMatchday();
    const matchdayCost=weeklyMatchdayStaffCost();
    const recognisedRevenue=md.accountingRevenue??md.revenue;
    const netHomeIncome=recognisedRevenue-matchdayCost;

    state.matchdayStats.revenue+=recognisedRevenue;
    state.matchdayStats.attendance+=md.attendance;
    state.matchdayStats.homeGames+=1;

    if(!state.monthlyFinance) state.monthlyFinance=createEmptyMonthlyFinance();
    state.monthlyFinance.matchdayRevenue+=recognisedRevenue;
    state.monthlyFinance.operatingCosts+=matchdayCost;
    state.seasonPL+=netHomeIncome;
    if(typeof recordClubCash==="function") recordClubCash(md.revenue-matchdayCost,"Home match net cash","matchday",{attendance:md.attendance});
    if(typeof ensureClubFinanceState==="function"){const cf=ensureClubFinanceState();cf.seasonRevenue.matchday=(cf.seasonRevenue.matchday||0)+recognisedRevenue;cf.seasonCosts.matchday=(cf.seasonCosts.matchday||0)+matchdayCost;}
    if(typeof protectClubLiquidity==="function" && typeof clubCash==="function" && clubCash()<0) protectClubLiquidity("matchday operations");

    const fanPriceEffect=pricingFanEffect();
    if(fanPriceEffect) stakeholderChange("fans",fanPriceEffect,"Matchday pricing experience",{notify:true});
    addNews(`${md.attendance.toLocaleString("en-GB")} supporters attended the home match, generating ${money(md.revenue)} in matchday revenue.`);
    processFanProtestAfterHomeMatch(round.date);
  }

  if(!state.monthlyResults) state.monthlyResults=[];
  state.monthlyResults.push({
    week:round.week,date:round.date,opponent:opp,home:mine.home===state.club,
    goalsFor:myGoals,goalsAgainst:opGoals,outcome
  });

  state.week=Math.max(state.week,round.week);
  state.season.phase="season";
  addNews(`${state.club} ${myGoals}–${opGoals} ${opp}.`);

  if(typeof checkManagerDepthComplaints==="function") checkManagerDepthComplaints();

  return res.matchReport;
}

function advanceMatchweek(){
  if(typeof simulateChampionshipWeek==="function") simulateChampionshipWeek((state?.week||0)+1);
  // Backwards-compatible alias used by older UI code/saves.
  return advanceDay();
}


function seasonTableFinish(club){
  const arr=tableArray();
  const i=arr.findIndex(x=>x.name===club);
  return i>=0?i+1:20;
}
function clubSeasonRecord(club){
  const t=state.table?.[club];
  return t?{w:t.w||0,d:t.d||0,l:t.l||0}:{w:0,d:0,l:0};
}
function seasonTopScorer(){
  const sq=squad(state.club);
  return [...sq].sort((a,b)=>{
    const gb=state.playerStats?.[b.id]?.goals||0,ga=state.playerStats?.[a.id]?.goals||0;
    if(gb!==ga)return gb-ga;
    return (state.playerStats?.[b.id]?.appearances||0)-(state.playerStats?.[a.id]?.appearances||0);
  })[0]||null;
}
function buildSeasonArchive(){
  const finish=seasonTableFinish(state.club);
  const record=clubSeasonRecord(state.club);
  const transferPL=(state.transferFinance?.received||0)-(state.transferFinance?.spent||0);
  const scr=typeof userSCRSnapshot==="function"?userSCRSnapshot():null;
  const top=seasonTopScorer();
  const playerStats={};
  squad(state.club).forEach(p=>{
    const s=state.playerStats?.[p.id]||{};
    playerStats[p.id]={
      name:p.name,club:state.club,appearances:s.appearances||0,starts:s.starts||0,
      minutes:s.minutes||0,goals:s.goals||0,assists:s.assists||0,
      avgRating:(s.ratedApps||0)>0?(s.ratingTotal||0)/s.ratedApps:null,
      overall:p.overall
    };
  });
  return {season:currentSeasonLabel(),year:currentSeasonStartYear(),seasonNumber:seasonDisplayNumber(),club:state.club,leagueFinish:finish,record,seasonProfitLoss:state.seasonPL||0,transferPL,transferSpent:state.transferFinance?.spent||0,transferReceived:state.transferFinance?.received||0,scr:scr?{ratio:scr.ratio,status:scr.status,revenue:scr.revenue,squadCost:scr.squadCost}:null,stakeholders:{...state.happiness},topScorer:top?{id:top.id,name:top.name,goals:state.playerStats?.[top.id]?.goals||0}:null,stadium:typeof buildStadiumHistorySnapshot==="function"?buildStadiumHistorySnapshot():null,clubCash:typeof clubCash==="function"?clubCash():null,totalDebt:typeof totalClubDebt==="function"?totalClubDebt():null,premierLeagueRevenue:typeof premierLeagueSeasonState==="function"?(premierLeagueSeasonState()?.settlement||null):null,finance:typeof clubFinanceSeasonSnapshot==="function"?clubFinanceSeasonSnapshot():null,playerStats};
}
function archiveCurrentSeason(){
  if(!state.careerHistory)state.careerHistory={seasons:[]};
  const existing=state.careerHistory.seasons.find(x=>x.year===currentSeasonStartYear());
  if(existing)return existing;
  const archive=buildSeasonArchive();
  state.careerHistory.seasons.push(archive);
  if(!state.scrHistory)state.scrHistory=[];
  if(archive.scr)state.scrHistory.push({season:archive.season,year:archive.year,revenue:archive.scr.revenue,squadCost:archive.scr.squadCost,ratio:archive.scr.ratio,status:archive.scr.status});
  state.clubHistory.recentFinishes=([...(state.clubHistory.recentFinishes||[]),archive.leagueFinish]).slice(-3);
  return archive;
}
function renderSeasonSummary(){
  if(!q("seasonSummary"))return;
  const a=archiveCurrentSeason();
  q("summarySeasonTitle").textContent=`${a.season} Season Review`; q("summaryClubName").textContent=a.club; q("summaryFinish").textContent=ordinal(a.leagueFinish); q("summaryLeagueFinish").textContent=ordinal(a.leagueFinish);
  q("summaryRecord").textContent=`${a.record.w}W • ${a.record.d}D • ${a.record.l}L`; q("summaryProfitLoss").textContent=money(a.seasonProfitLoss); q("summaryProfitLoss").className="v "+(a.seasonProfitLoss>0?"good":a.seasonProfitLoss<0?"bad":"");
  q("summaryTransferPL").textContent=money(a.transferPL); q("summaryTransferPL").className="v "+(a.transferPL>0?"good":a.transferPL<0?"bad":""); q("summarySCR").textContent=a.scr?`${(a.scr.ratio*100).toFixed(1)}% ${a.scr.status}`:"—"; q("summaryTopScorer").textContent=a.topScorer?`${a.topScorer.name} • ${a.topScorer.goals}`:"—";
  q("summaryStakeholders").innerHTML=[["Fans",a.stakeholders.fans],["Owners",a.stakeholders.owners],["Players",a.stakeholders.players],["Manager",a.stakeholders.manager],["Sponsors",a.stakeholders.sponsors??70]].map(([label,value])=>`<div class="summary-stakeholder"><div style="display:flex;justify-content:space-between"><span>${label}</span><b>${Math.round(value)}%</b></div><div class="happy-bar"><span style="width:${Math.max(0,Math.min(100,value))}%"></span></div></div>`).join("");
  q("summarySeasonNumber").textContent=`Season ${a.seasonNumber}`; q("summarySeasonNotes").innerHTML=`<div class="notice"><b>League:</b> ${ordinal(a.leagueFinish)} place.</div><div class="notice"><b>Financial:</b> ${money(a.seasonProfitLoss)} season P/L; ${money(a.transferPL)} transfer P/L.</div><div class="notice"><b>SCR:</b> ${a.scr?`${(a.scr.ratio*100).toFixed(1)}% — ${a.scr.status}`:"Unavailable"}.</div>`;
  q("seasonSummary").classList.remove("hide"); state.seasonSummaryViewed=true; saveGame(false);
}
function stakeholderSummerReset(v){ return Math.round(v*.70+70*.30); }

/* --------------------------------------------------------------------------
   PLAYER DEVELOPMENT & CAREER CURVES — v0.18
   -------------------------------------------------------------------------- */
function ensurePlayerDevelopmentState(){
  if(!state) return;
  if(!state.playerDevelopment) state.playerDevelopment={};
  if(state._developmentKnownCount===DB.players.length) return;
  DB.players.forEach(p=>{
    const key=String(p.id);
    if(!state.playerDevelopment[key]){
      state.playerDevelopment[key]={
        seasonStartOverall:p.overall||0,
        careerStartOverall:p.overall||0,
        lastSeasonChange:0,
        status:"Stable",
        history:[]
      };
    }
  });
  state._developmentKnownCount=DB.players.length;
}

function playerDevelopmentStatus(p){
  ensurePlayerDevelopmentState();
  return state.playerDevelopment?.[p.id]?.status||"Stable";
}

function playerSeasonOverallChange(p){
  ensurePlayerDevelopmentState();
  const d=state.playerDevelopment?.[p.id];
  return (p.overall||0)-(d?.seasonStartOverall??p.overall??0);
}

function developmentAgeOpportunity(age,p=null){
  // v0.24.5: late-20s growth tapers sharply and normal outfield potential growth
  // ends at 30. Goalkeepers retain a small later-maturation window.
  if(typeof ageingDevelopmentOpportunity==="function") return ageingDevelopmentOpportunity(age,p);
  if(age<=18) return 1.00;
  if(age<=21) return 0.94;
  if(age<=24) return 0.82;
  if(age===25) return 0.50;
  if(age===26) return 0.35;
  if(age===27) return 0.20;
  if(age===28) return 0.08;
  if(age===29) return 0.03;
  return 0;
}

function developmentDeclinePressure(age,p=null){
  // Compatibility helper for UI/diagnostics. Actual biological decline is now
  // determined once per season by ageing.js and applied at year-end.
  if(p && typeof playerExpectedAnnualAgeDecline==="function")
    return clamp(playerExpectedAnnualAgeDecline(p,{age,projectedMinutes:1800,performanceFactor:1})/3,0,1);
  const effective=age-(p&&String(p.positions||"").toUpperCase().includes("GK")?3:0);
  return effective<31?0:clamp((effective-30)*.08,0,.80);
}

function playerSeasonMinutes(p){
  const liveLoan=typeof activeLoanForPlayer==="function"?activeLoanForPlayer(p):null;
  if(liveLoan&&liveLoan.loanClub!==state.club&&typeof loanEstimatedMinutesToDate==="function") return loanEstimatedMinutesToDate(liveLoan);
  const loanMinutes=typeof loanSeasonMinutesForPlayer==="function"?loanSeasonMinutesForPlayer(p):0;
  if(p.club===state.club){
    const s=state.playerStats?.[p.id]||{};
    return (s.minutes||((s.starts||0)*75+(Math.max(0,(s.appearances||0)-(s.starts||0))*24)))+loanMinutes;
  }

  // AI clubs do not yet store individual match minutes. Estimate a season role
  // from positional depth so their players develop/decline alongside the user world.
  if(typeof primaryRecruitmentGroup==="function" && p.club && p.club!=="Free Agent" && p.club!=="Retired"){
    const group=primaryRecruitmentGroup(p);
    if(group){
      const clubPlayers=typeof clubSquadPlayers==="function"?clubSquadPlayers(p.club):DB.players.filter(x=>x.club===p.club);
      const peers=clubPlayers.filter(x=>playsPositionGroup(x,group))
        .sort((a,b)=>(b.overall||0)-(a.overall||0));
      const rank=peers.findIndex(x=>String(x.id)===String(p.id));
      const progress=clamp((state.week||0)/38,0,1);
      if(rank===0) return Math.round(2850*progress);
      if(rank===1) return Math.round(1750*progress);
      if(rank===2) return Math.round(850*progress);
      return Math.round(300*progress);
    }
  }
  return Math.round(900*clamp((state.week||0)/38,0,1));
}

function developmentEnvironmentFactor(p){
  let f=1;
  if(p.club===state.club){
    const training=typeof facilityRating==="function"?facilityRating("training"):70;
    f*=clamp(0.88+(training-60)*0.007,0.82,1.18);
    const youth=typeof managerProfileForClub==="function"?(managerProfileForClub(state.club)?.youthTrust||60):60;
    if((p.age||25)<=24) f*=clamp(0.92+(youth-50)*0.003,0.88,1.10);
  }
  if(typeof loanSeasonEnvironmentFactorForPlayer==="function") f*=loanSeasonEnvironmentFactorForPlayer(p);
  return f;
}

function projectedSeasonMinutes(p){
  const mins=playerSeasonMinutes(p);
  const progress=clamp((state.week||0)/38,0.10,1);
  return progress<1?mins/progress:mins;
}

function developmentPlayingTimeFactor(p){
  // Minutes are now the main practical development lever. Zero/very-low
  // involvement should not deliver the same growth as 30 first-team starts.
  const projected=projectedSeasonMinutes(p);
  if(projected<=0) return (p.age||25)<=20?0.18:(p.age||25)<=23?0.10:0;
  if(projected<300) return 0.22;
  if(projected<700) return 0.34;
  if(projected<1200) return 0.50;
  if(projected<1800) return 0.72;
  if(projected<2400) return 0.92;
  if(projected<3000) return 1.05;
  return 1.14;
}

function developmentPerformanceFactor(p){
  if(p.club!==state.club) return 1;
  const apps=state.playerStats?.[p.id]?.appearances||0;
  const avg=typeof playerAverageRating==="function"?playerAverageRating(p.id):null;
  if(avg==null || apps<5) return 0.88;
  if(avg<6.20) return 0.62;
  if(avg<6.40) return 0.78;
  if(avg<6.60) return 0.92;
  if(avg<6.80) return 1.03;
  if(avg<7.00) return 1.12;
  if(avg<7.20) return 1.22;
  return 1.32;
}

function longInjuryDevelopmentPenalty(p){
  const m=state.playerMarket?.[String(p.id)]||{};
  const longs=m.longInjuries||0;
  return Math.min(0.34,longs*0.09);
}

function passiveYouthDevelopmentFloor(p,seasonChange=0){
  const age=p.age||25,overall=p.overall||0,potential=Math.max(overall,p.potential??overall),gap=potential-overall;
  if(gap<=0||seasonChange>0||age>24) return 0;
  const market=state.playerMarket?.[String(p.id)]||{};
  if((market.severeInjuriesThisSeason||0)>=2) return 0;
  if(age<=20 && gap>=3) return 1;
  let chance=age===21?.84:age===22?.68:age===23?.44:.24;
  chance*=clamp(gap/5,.45,1);
  if(p.club===state.club){
    const training=typeof facilityRating==="function"?facilityRating("training"):70;
    chance*=clamp(.78+(training-60)*.006,.72,1.08);
  }
  const roll=typeof stablePlayerTrait==="function"?stablePlayerTrait(p,`passive-floor-${currentSeasonStartYear()}`):Math.random();
  return roll<chance?1:0;
}

function calculatePlayerYearEndChange(p){
  const age=p.age||25;
  const potential=Math.max(p.overall||0,p.potential??p.overall??0);
  const gap=Math.max(0,potential-(p.overall||0));
  const opportunity=developmentAgeOpportunity(age,p);
  const env=developmentEnvironmentFactor(p);
  const minutes=developmentPlayingTimeFactor(p);
  const perf=developmentPerformanceFactor(p);
  const injuryPenalty=longInjuryDevelopmentPenalty(p);
  const trait=0.82+(typeof stablePlayerTrait==="function"?stablePlayerTrait(p,`development-${currentSeasonStartYear()}`):Math.random())*0.38;

  // Potential defines the ceiling; minutes are the main route to reaching it;
  // performance determines whether those minutes are genuinely productive.
  let growthScore=opportunity*env*minutes*perf*trait*(1-injuryPenalty);
  growthScore*=Math.min(1,gap/4);

  let delta=0;
  if(gap>0 && growthScore>=0.90) delta=3;
  else if(gap>0 && growthScore>=0.58) delta=2;
  else if(gap>0 && growthScore>=0.30) delta=1;

  // Reserve-only youngsters still develop more slowly, but very young players
  // now have a passive maturation floor so no-minutes does not mean no growth
  // for five straight seasons. Minutes remain the main accelerator.
  if(playerSeasonMinutes(p)<200 && delta>0) delta=Math.min(delta,1);
  if(delta===0){
    const seasonChange=(p.overall||0)-(state.playerDevelopment?.[String(p.id)]?.seasonStartOverall??p.overall??0);
    delta=Math.max(delta,passiveYouthDevelopmentFloor(p,seasonChange));
  }
  // A genuinely productive development loan can accelerate a high-upside
  // youngster beyond passive maturation, but never beyond +3 in one season.
  // Minutes, destination suitability and remaining potential all matter.
  if(typeof loanDevelopmentBonus==="function" && delta>=0){
    delta+=loanDevelopmentBonus(p,delta);
    delta=Math.min(delta,3,gap);
  }

  // Growth and ageing no longer fight each other. Once a player has entered
  // their save-specific decline phase, normal potential growth is disabled.
  if(typeof playerInAgeDeclinePhase==="function" && playerInAgeDeclinePhase(p) && delta>0) delta=0;

  // Biological decline is calculated once at year-end. Longevity is fixed for
  // the career, while playing time, performance and injuries affect how much of
  // that underlying curve is realised this season.
  if(typeof playerAnnualAgeDeclineTarget==="function") {
    const projected=projectedSeasonMinutes(p);
    const performance=developmentPerformanceFactor(p);
    const ageDrop=playerAnnualAgeDeclineTarget(p,{
      age,seasonYear:currentSeasonStartYear(),projectedMinutes:projected,
      performanceFactor:performance,injuryPenalty
    });
    delta-=ageDrop;
  } else {
    const decline=developmentDeclinePressure(age,p);
    const declineRoll=typeof stablePlayerTrait==="function"?stablePlayerTrait(p,`decline-${currentSeasonStartYear()}`):Math.random();
    if(declineRoll<decline) delta-=1;
  }

  // Serious long-term injuries remain capable of reducing ability separately.
  const market=state.playerMarket?.[String(p.id)]||{};
  const severeInjuries=(market.severeInjuriesThisSeason||0);
  if(severeInjuries>0){
    const risk=clamp(0.14+severeInjuries*0.11+(age>=32?0.10:0),0.14,0.50);
    const injuryRoll=typeof stablePlayerTrait==="function"?stablePlayerTrait(p,`injury-ability-${currentSeasonStartYear()}`):Math.random();
    if(injuryRoll<risk) delta-=injuryRoll<risk*0.16?2:1;
  }

  return clamp(delta,-3,4);
}

function developmentLabelFromChange(delta,age){
  if(delta>=3) return "Developing rapidly";
  if(delta>=1) return "Progressing";
  if(delta===0 && age<=25) return "Stagnating";
  if(delta===0) return "Stable";
  return "Declining";
}


function developmentCheckpointKey(dateISO=currentGameDateISO()){
  const md=dateISO.slice(5);const label=md.startsWith('10-')?'Autumn':md.startsWith('01-')?'Mid-season':'Spring';
  return `${currentSeasonLabel()}-${label}`;
}
function developmentWorldBucketForPlayer(p){
  const club=String(p.club||'Free Agent');let h=0;for(const c of club)h=(h+c.charCodeAt(0))%997;return 2+(h%6);
}
function lightweightBackgroundDevelopmentStep(p){
  const d=state.playerDevelopment[String(p.id)],before=p.overall||0,gap=Math.max(0,(p.potential??before)-before),age=p.age||25;
  const trait=typeof stablePlayerTrait==='function'?stablePlayerTrait(p,`checkpoint-${developmentCheckpointKey()}`):Math.random();
  const minutes=developmentPlayingTimeFactor(p);
  let step=0;
  const opportunity=developmentAgeOpportunity(age,p);
  const declining=typeof playerInAgeDeclinePhase==="function"?playerInAgeDeclinePhase(p):age>=31;
  if(!declining&&opportunity>0&&gap>0){
    const chance=.38*opportunity*Math.min(1,gap/4)*minutes;
    if(trait<chance)step=1;
  }
  // v0.24.5: age-related negative changes are deliberately NOT applied at the
  // three checkpoints. All biological decline is resolved once at year-end,
  // preventing checkpoint multiplication and allowing full-season performance
  // to protect a veteran appropriately.
  const seasonChange=before-(d?.seasonStartOverall??before);
  if(step>0&&seasonChange>=3)step=0;
  return step;
}

function applyDevelopmentCheckpointToPlayers(players,{userReport=false}={}){
  ensurePlayerDevelopmentState();if(typeof ensurePlayerMarketState==='function')ensurePlayerMarketState();const changes=[];
  (players||[]).forEach(p=>{
    const d=state.playerDevelopment[String(p.id)];if(!d)return;const before=p.overall||0,seasonChange=before-(d.seasonStartOverall??before);
    let step=0;
    if(p.club===state.club){
      const projected=calculatePlayerYearEndChange(p);
      const checkpointTrait=typeof stablePlayerTrait==="function"?stablePlayerTrait(p,`user-checkpoint-${developmentCheckpointKey()}`):Math.random();
      const minutesFactor=developmentPlayingTimeFactor(p);
      const perfFactor=developmentPerformanceFactor(p);
      const declining=typeof playerInAgeDeclinePhase==="function"?playerInAgeDeclinePhase(p):(p.age||25)>=31;
      if(!declining&&projected>0&&seasonChange<3&&before<(p.potential??before)){
        // A season-level positive projection is not an automatic +1 at every
        // checkpoint. Playing time + performance determine whether this window
        // actually converts into a rating gain.
        const chance=clamp(0.18+minutesFactor*.34+Math.max(0,perfFactor-.85)*.45,0.08,0.82);
        if(checkpointTrait<chance) step=1;
      }
    }else step=lightweightBackgroundDevelopmentStep(p);
    if(step){const ceiling=Math.max(before,p.potential??before);p.overall=clamp(before+step,55,ceiling);const actual=p.overall-before;if(actual){d.status=developmentLabelFromChange(actual,p.age||25);state.playerWorldOverrides=state.playerWorldOverrides||{};state.playerWorldOverrides[p.id]={...(state.playerWorldOverrides[p.id]||{}),overall:p.overall};if(typeof updatePlayerStoredMarketValue==='function')updatePlayerStoredMarketValue(p);changes.push({playerId:p.id,name:p.name,age:p.age,before,after:p.overall,change:actual,potential:p.potential??p.overall});}}
    else d.status=seasonChange>0?'Progressing':seasonChange<0?'Declining':((p.age||25)<=25?'Stagnating':'Stable');
  });
  if(userReport&&changes.length)createDevelopmentReview(changes);
  return changes;
}
function createDevelopmentReview(changes){
  state.developmentReviews=state.developmentReviews||[];const date=currentGameDateISO(),key=developmentCheckpointKey(date);const id=`dev-${Date.now()}-${Math.floor(Math.random()*1000)}`;
  const sorted=[...changes].sort((a,b)=>b.change-a.change||b.after-a.after);const best=sorted[0],decline=sorted.find(x=>x.change<0);const manager=state.staff?.manager?.name||'The manager';
  const report={id,key,date,season:currentSeasonLabel(),manager,changes:sorted};state.developmentReviews.unshift(report);state.developmentReviews=state.developmentReviews.slice(0,12);
  let summary=`${changes.length} player${changes.length===1?' has':'s have'} changed overall rating in the latest squad development review.`;
  if(best?.change>=2)summary+=` ${best.name} has made the strongest progress (+${best.change}).`;else if(best?.change>0)summary+=` ${best.name} showed the strongest progress.`;
  if(decline)summary+=` ${decline.name} has shown signs of decline.`;
  state.news.unshift({week:state.week,date,developmentReviewId:id,text:`${manager}: Squad Development Update — ${summary}`});
}
function openDevelopmentReview(id){
  const report=state.developmentReviews?.find(r=>r.id===id);if(!report)return;const modal=q('developmentReviewModal');if(!modal)return;
  q('developmentReviewTitle').textContent=`${report.key} Development Review`;q('developmentReviewMeta').textContent=`${report.manager} • ${formatGameDate(report.date,{weekday:false})}`;
  const positives=report.changes.filter(x=>x.change>0).length,declines=report.changes.filter(x=>x.change<0).length;
  q('developmentReviewSummary').textContent=`${positives} improved • ${declines} declined • ${report.changes.length} rating changes`;
  q('developmentReviewRows').innerHTML=report.changes.map(x=>`<tr><td><b>${x.name}</b></td><td>${x.age}</td><td>${x.potential??'—'}</td><td>${x.before}</td><td><span class="rating">${x.after}</span></td><td class="${x.change>0?'good':'bad'}"><b>${x.change>0?'+':''}${x.change}</b>${x.change>=2?' <span class="breakthrough-badge">★ Breakthrough</span>':''}</td></tr>`).join('');
  modal.classList.remove('hide');setModalScrollLock(true);
}
function closeDevelopmentReview(){q('developmentReviewModal')?.classList.add('hide');setModalScrollLock(false);}
function processPlayerDevelopmentCheckpoint(dateISO=currentGameDateISO()){
  if(!/-(10|01|04)-0[1-7]$/.test(dateISO))return;state.developmentWindows=state.developmentWindows||{};const key=developmentCheckpointKey(dateISO);const w=state.developmentWindows[key]||(state.developmentWindows[key]={user:false,buckets:[]});const day=Number(dateISO.slice(8,10));
  if(day===1&&!w.user){applyDevelopmentCheckpointToPlayers(squad(state.club),{userReport:true});w.user=true;return;}
  if(day>=2&&day<=7&&!w.buckets.includes(day)){const players=DB.players.filter(p=>!p.retired&&p.club!==state.club&&developmentWorldBucketForPlayer(p)===day);applyDevelopmentCheckpointToPlayers(players);w.buckets.push(day);}
}

function processPlayerYearEnd(players=DB.players){
  ensurePlayerDevelopmentState();if(typeof ensurePlayerMarketState==='function')ensurePlayerMarketState();
  (players||[]).forEach(p=>{
    if(p.retired)return;
    const before=p.overall||0,d=state.playerDevelopment[String(p.id)];if(!d)return;
    const seasonSoFar=before-(d.seasonStartOverall??before);
    // v0.24.5: user and AI players now share the same career-curve engine. AI
    // players use estimated role/minutes and neutral performance, while user
    // players use their real minutes/ratings. Biological ageing is identical.
    const desiredAnnual=calculatePlayerYearEndChange(p);
    let delta;
    if(desiredAnnual>=0){
      // Checkpoint growth can realise some/all of the annual improvement early.
      // Never reverse a genuine checkpoint gain merely because the final target
      // was lower; simply stop adding more.
      delta=Math.max(0,desiredAnnual-Math.max(0,seasonSoFar));
      delta=Math.min(delta,3-Math.max(0,seasonSoFar));
    }else{
      // No age decline is applied at checkpoints, so the year-end target is the
      // complete biological loss. Any unusual positive change is preserved and
      // the decline is then applied from the player's current level.
      delta=desiredAnnual;
    }
    delta=clamp(delta,-3,3);
    const potential=Math.max(before,p.potential??before);
    p.overall=clamp(before+delta,55,Math.max(potential,before));
    const actual=p.overall-before;
    d.lastSeasonChange=seasonSoFar+actual;
    d.status=developmentLabelFromChange(actual,p.age||25);
    d.history=(d.history||[]).slice(-7);
    d.history.push({season:currentSeasonLabel(),start:d.seasonStartOverall,end:p.overall,change:seasonSoFar+actual,minutes:p.club===state.club?playerSeasonMinutes(p):null});
    state.playerWorldOverrides=state.playerWorldOverrides||{};
    p.age=(p.age||0)+1;
    state.playerWorldOverrides[p.id]={...(state.playerWorldOverrides[p.id]||{}),overall:p.overall,age:p.age};
    d.seasonStartOverall=p.overall;
    if(state.playerMarket?.[String(p.id)]){
      state.playerMarket[String(p.id)].severeInjuriesThisSeason=0;
      state.playerMarket[String(p.id)].seasonStartValue=p.value||0;
    }
  });
}

function resetSeasonPlayerStats(){ state.playerStats={}; state.playerMorale={}; ensurePlayerState(); }
function expireContractsAndHandleFreeAgents(){
  const newYear=currentSeasonStartYear()+1;
  Object.entries(state.playerContracts||{}).forEach(([pid,c])=>{
    if((c.endYear||9999)<=newYear){ const p=DB.players.find(x=>String(x.id)===String(pid)); if(!p)return; if(p.club===state.club){ state.playerWorldOverrides=state.playerWorldOverrides||{}; state.playerWorldOverrides[p.id]={...(state.playerWorldOverrides[p.id]||{}),club:"Free Agent"}; state.playerClubOverrides[p.id]="Free Agent"; p.club="Free Agent"; addNews(`${p.name} has left the club after their contract expired.`);} delete state.playerContracts[pid]; }
  });
}
function nextSeasonBudgetForUser(a){
  const c=byClub(state.club),base=c?.transferBudget||40000000,finish=a.leagueFinish;
  const mult=finish<=4?1.35:finish<=7?1.18:finish<=12?1:finish<=16?.88:.76;
  const financeBonus=Math.max(-20000000,Math.min(25000000,(a.seasonProfitLoss||0)*.30));
  const carry=Math.max(0,state.budget||0)*.25;
  return Math.max(8000000,Math.round((base*mult+financeBonus+carry)/250000)*250000);
}
function resetAIClubFinancesForNewSeason(){
  if(typeof ensureAIClubFinances!=="function")return; const old=state.aiClubFinances||{}; state.aiClubFinances={}; ensureAIClubFinances(); Object.entries(state.aiClubFinances).forEach(([club,f])=>{const prev=old[club];if(prev)f.transferBudget+=Math.max(0,prev.transferBudget||0)*.15;});
}
function updateReputationFromSeason(finish){
  const c=byClub(state.club);
  if(!c)return;
  const target=c.target||10;
  const d=finish<=target-3?2:finish<=target-1?1:finish>=target+5?-2:finish>=target+3?-1:0;
  setSavedClubReputation(savedClubReputation()+d);
}

function processFacilityYearEnd(){
  if(!state.facilities) return;
  Object.keys(FACILITY_TYPES).forEach(type=>{
    const r=facilityRating(type);
    if(r<70) return;

    // Elite facilities need reinvestment to remain elite.
    const deteriorationChance=clamp(0.10+(r-70)*0.008,0.10,0.34);
    if(Math.random()<deteriorationChance){
      state.facilities[type]=Math.max(0,r-1);
      addNews(`${FACILITY_TYPES[type].label} have slipped slightly in standard and are now rated ${state.facilities[type]}. Continued investment will be needed to maintain elite infrastructure.`);
    }
  });
}

function beginNextSeason(){
  // The season review no longer teleports straight to MW1.
  // Closing it enters a playable off-season on the current calendar.
  archiveCurrentSeason();
  state.season.phase="offseason";
  state.seasonComplete=false;
  state.seasonSummaryViewed=true;
  q("seasonSummary")?.classList.add("hide");
  setModalScrollLock(false);
  addNews(`The ${currentSeasonLabel()} season is complete. The club has entered the off-season.`);
  saveGame(false);
  renderAll();
}

function seasonPrepShow(percent,status){const o=q('seasonPrepOverlay');if(!o)return;q('seasonPrepSeason').textContent=`Preparing the ${currentSeasonStartYear()+1}/${String((currentSeasonStartYear()+2)%100).padStart(2,'0')} season`;q('seasonPrepPercent').textContent=`${percent}%`;q('seasonPrepStatus').textContent=status;q('seasonPrepBar').style.width=`${percent}%`;o.classList.remove('hide');}
async function seasonPrepStage(percent,status,fn){seasonPrepShow(percent,status);await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));if(fn)await fn();await new Promise(r=>setTimeout(r,0));}
function seasonPrepHide(){q('seasonPrepOverlay')?.classList.add('hide');}
async function performSeasonRollover(){
  const archive=state.careerHistory?.seasons?.find(x=>x.year===currentSeasonStartYear())||archiveCurrentSeason();const oldYear=currentSeasonStartYear();
  await seasonPrepStage(5,'Closing the previous season',()=>{if(typeof processFinancialRegulationAssessment==='function')processFinancialRegulationAssessment();});
  const offSeasonCarryPL=(state.seasonPL||0)-(archive.seasonProfitLoss||0);
  const cohorts=[DB.players.filter(p=>!p.retired&&(p.club===state.club||p.leagueId==='premier-league')),DB.players.filter(p=>!p.retired&&p.leagueId==='championship'),DB.players.filter(p=>!p.retired&&['la-liga','bundesliga'].includes(p.leagueId)),DB.players.filter(p=>!p.retired&&['serie-a','ligue-1'].includes(p.leagueId)),DB.players.filter(p=>!p.retired&&p.leagueId==='saudi-pro-league')];
  const pct=[18,24,30,36,40];const labels=['Updating Premier League players','Updating Championship players','Updating La Liga & Bundesliga players','Updating Serie A & Ligue 1 players','Updating Saudi market players'];
  for(let i=0;i<cohorts.length;i++)await seasonPrepStage(pct[i],labels[i],()=>processPlayerYearEnd(cohorts[i]));
  await seasonPrepStage(45,'Updating player market values',()=>{if(typeof recalculateAllPlayerMarketValues==='function')recalculateAllPlayerMarketValues({recordHistory:true});});
  await seasonPrepStage(52,'Processing retirements, contracts and club infrastructure',()=>{if(typeof processPlayerLifecycleSeasonRollover==='function'){const lifecycle=processPlayerLifecycleSeasonRollover();if(lifecycle?.userIntake?.length&&typeof addNews==='function'){const rows=lifecycle.userIntake.map(p=>`${p.name} — ${p.age}, ${p.positions}, ${p.overall} OVR / ${p.potential} POT`).join('<br>');addNews(`<strong>ACADEMY INTAKE:</strong> ${lifecycle.userIntake.length} new prospects have joined the club for ${currentSeasonStartYear()+1}/${String((currentSeasonStartYear()+2)%100).padStart(2,'0')}.<br>${rows}`);}if(lifecycle?.generated?.length&&typeof addNews==='function'){const elite=lifecycle.generated.filter(p=>(p.potential||0)>=88).length;addNews(`PLAYER MARKET: ${lifecycle.generated.length} new young players have entered the global player database for ${currentSeasonStartYear()+1}/${String((currentSeasonStartYear()+2)%100).padStart(2,'0')}${elite?`, including ${elite} elite-potential prospect${elite===1?'':'s'}`:''}.`);}}if(typeof processFacilityYearEnd==='function')processFacilityYearEnd();if(typeof rollStadiumSeason==='function')rollStadiumSeason();expireContractsAndHandleFreeAgents();updateReputationFromSeason(archive.leagueFinish);});
  await seasonPrepStage(60,'Rebuilding club squads',()=>{if(typeof invalidateClubSquadCache==='function')invalidateClubSquadCache();if(typeof invalidateWorldStrengthCache==='function')invalidateWorldStrengthCache();});
  await seasonPrepStage(70,'Calculating background squad strengths',()=>{if(typeof worldMatchStrength==='function')(DB.worldClubs||[]).filter(c=>c.leagueId!=='saudi-pro-league').forEach(c=>worldMatchStrength(c.name));});
  state.season.year+=1;state.season.number+=1;state.season.label=`${state.season.year}/${String((state.season.year+1)%100).padStart(2,'0')}`;state.season.phase='preseason';state.week=0;state.seasonComplete=false;state.leagueSeasonFinished=false;state.seasonSummaryViewed=false;
  await seasonPrepStage(80,'Preparing league competitions',()=>{state.fixtures=generateFixtures(DB.clubs.map(x=>x.name),state.season.year);state.table=blankTable();if(typeof resetChampionshipCompetitionForSeason==='function')resetChampionshipCompetitionForSeason();state.results={};state.form=[];state.matchdayStats={revenue:0,attendance:0,homeGames:0};});
  await seasonPrepStage(86,'Resetting season records',()=>{state.seasonPL=offSeasonCarryPL;state.transferFinance={spent:0,received:0};if(typeof resetClubFinanceForNewSeason==='function')resetClubFinanceForNewSeason();if(typeof prepareTicketingForNewSeason==='function')prepareTicketingForNewSeason();state.managerChangesThisSeason=0;state.managerPressureNotified=false;state.managerRequests=[];state.managerRequestCooldowns={};state.managerRequestsByWeek={};state.managerRoleFulfilledUntil={};state.managerSquadVacancies=[];state.transferReviewsRun={};state.incomingTransferOffers=[];state.incomingLoanOffers=[];state.transferNegotiations={};state.aiTransferPlans={};state.developmentWindows={};state.saudiPremiumWindows={};resetSeasonPlayerStats();resetMonthlyTracker();state.calendar.monthlyMonthKey=currentGameDateISO().slice(0,7);Object.keys(state.happiness).forEach(k=>state.happiness[k]=stakeholderSummerReset(state.happiness[k]));});
  await seasonPrepStage(90,'Updating the transfer market',()=>{resetAIClubFinancesForNewSeason();if(typeof reviewAIClubs==='function')reviewAIClubs(DB.clubs.filter(c=>c.name!==state.club));});
  await seasonPrepStage(96,'Setting budgets and expectations',()=>{const fr=ensureFinancialRegulationState(),resources=typeof ceoPlayingBudgetResources==='function'?ceoPlayingBudgetResources():{maxAllocation:nextSeasonBudgetForUser(archive),selfFunded:nextSeasonBudgetForUser(archive)},sanctionMultiplier=fr.nextInvestmentMultiplier??1;fr.availableInvestment=Math.max(0,Math.round((resources.maxAllocation*sanctionMultiplier)/250000)*250000);const defaultAllocation=resources.distressed?Math.min(fr.availableInvestment,resources.selfFunded||0):Math.min(fr.availableInvestment,Math.max(5_000_000,resources.selfFunded||fr.availableInvestment*.65));fr.pendingTransferBudget=Math.max(0,Math.round(defaultAllocation/5_000_000)*5_000_000);fr.nextInvestmentMultiplier=1;state.budget=fr.pendingTransferBudget;if(resources.distressed&&typeof addNews==='function')addNews(`FINANCIAL CONTROL: New owner funding for player recruitment has been suspended while the club restores liquidity. You may only allocate genuinely self-funded resources.`);if(typeof rollFinancialRegulationsSeason==='function')rollFinancialRegulationsSeason();if(state.sponsorship){if(state.sponsorship.seasonsRemaining==null)state.sponsorship.seasonsRemaining=state.sponsorship.years||1;state.sponsorship.seasonsRemaining=Math.max(0,state.sponsorship.seasonsRemaining-1);if(state.sponsorship.seasonsRemaining<=0){addNews(`${state.sponsorship.name}'s sponsorship agreement has expired.`);state.sponsorship=null;state.sponsorOffers=[];}else{state.sponsorOffers=[];state.sponsorship.totalValue=state.sponsorship.annualValue*state.sponsorship.seasonsRemaining;}}else state.sponsorOffers=[];state.pricingLocked=false;if(!state.pricing)state.pricing=defaultPricing(state.club);state.managerBacking=Math.round((state.managerBacking||70)*.75+70*.25);});
  await seasonPrepStage(100,`${currentSeasonLabel()} ready`,()=>{addNews(`The ${currentSeasonLabel()} season has begun. You can allocate up to ${money(state.financialRegulations?.availableInvestment??state.budget??0)} to the playing budget from currently available club resources${typeof clubFinancialDistressStatus==='function'&&clubFinancialDistressStatus().distressed?' while financial controls remain active': ' and available owner funding'}.`);if(typeof managerSummerSquadReview==='function')managerSummerSquadReview(state.club,{notify:true});saveGame(false);});
  await new Promise(r=>setTimeout(r,180));seasonPrepHide();renderAll();openSeasonSetup();
}

function tableArray(){
  return Object.entries(state.table).map(([name,x])=>({name,...x,gd:x.gf-x.ga}))
    .sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf);
}
function renderTable(){
  if(!q("tableRows")) return;
  q("tableWeek").textContent=`After MW ${state.week}`;
  q("tableRows").innerHTML=tableArray().map((x,i)=>`<tr class="${i<4?"pos1":i>=17?"pos18":""}">
    <td>${i+1}</td><td><b>${x.name}</b></td><td>${x.p}</td><td>${x.w}</td><td>${x.d}</td>
    <td>${x.l}</td><td>${x.gf}</td><td>${x.ga}</td><td>${x.gd>0?"+":""}${x.gd}</td><td><b>${x.pts}</b></td>
  </tr>`).join("");
}

const FORMATION_PITCH_COORDS={
  "4-2-3-1":[
    [50,91],[14,74],[38,77],[62,77],[86,74],
    [38,58],[62,58],[18,38],[50,42],[82,38],[50,15]
  ],
  "4-3-3":[
    [50,91],[14,74],[38,77],[62,77],[86,74],
    [50,60],[32,48],[68,48],[18,25],[82,25],[50,14]
  ],
  "4-4-2":[
    [50,91],[14,74],[38,77],[62,77],[86,74],
    [14,50],[38,53],[62,53],[86,50],[37,20],[63,20]
  ],
  "4-2-2-2":[
    [50,91],[14,74],[38,77],[62,77],[86,74],
    [38,58],[62,58],[30,37],[70,37],[38,17],[62,17]
  ],
  "3-4-2-1":[
    [50,91],[25,76],[50,79],[75,76],
    [13,54],[39,57],[61,57],[87,54],[33,35],[67,35],[50,14]
  ],
  "3-4-3":[
    [50,91],[25,76],[50,79],[75,76],
    [13,54],[39,57],[61,57],[87,54],[18,25],[82,25],[50,14]
  ],
  "3-5-2":[
    [50,91],[25,76],[50,79],[75,76],
    [12,53],[36,57],[50,47],[64,57],[88,53],[37,18],[63,18]
  ]
};

function matchRatingClass(rating){
  if(rating==null) return "";
  if(rating>=8) return "excellent";
  if(rating>=7) return "good";
  if(rating<6) return "poor";
  return "";
}

function renderFormationPitch(report){
  const coords=FORMATION_PITCH_COORDS[report.formation]||FORMATION_PITCH_COORDS["4-2-3-1"];
  return `<div class="formation-pitch">
    <div class="pitch-centre-line"></div>
    <div class="pitch-centre-circle"></div>
    <div class="pitch-box pitch-box-top"></div>
    <div class="pitch-box pitch-box-bottom"></div>
    ${report.lineup.map((x,i)=>{
      const [rawLeft,top]=coords[i]||[50,50];
      // Formation coordinates were originally drawn from the opposite viewing
      // perspective. Mirror horizontally so RB/RM/RW display on the right and
      // LB/LM/LW display on the left when the team attacks up the screen.
      const left=100-rawLeft;
      const events=[
        x.goals?`<span title="${x.goals} goal${x.goals===1?"":"s"}">⚽${x.goals>1?`×${x.goals}`:""}</span>`:"",
        x.assists?`<span title="${x.assists} assist${x.assists===1?"":"s"}">🎯${x.assists>1?`×${x.assists}`:""}</span>`:""
      ].join("");
      return `<button class="pitch-player ${x.playerId?"":"vacant"}" type="button"
        style="left:${left}%;top:${top}%"
        ${x.playerId?`data-player-id="${x.playerId}"`:"disabled"}>
        <span class="pitch-player-slot">${x.slot||""}</span>
        <span class="pitch-player-name">${x.name}</span>
        <span class="pitch-player-overall">OVR ${x.overall ?? (x.playerId?DB.players.find(p=>String(p.id)===String(x.playerId))?.overall:"—") ?? "—"}</span>
        <span class="pitch-player-bottom">
          <b class="pitch-rating ${matchRatingClass(x.rating)}" title="Match rating">${x.rating?.toFixed(1)||"—"}</b>
          <span class="pitch-events">${events}</span>
        </span>
      </button>`;
    }).join("")}
  </div>`;
}

function renderMatchReport(report){
  if(!report || !q("matchReportModal")) return;
  const score=report.userHome
    ? `${report.goalsFor}–${report.goalsAgainst}`
    : `${report.goalsAgainst}–${report.goalsFor}`;

  q("matchReportTitle").textContent=`${report.home} ${score} ${report.away}`;
  q("matchReportMeta").textContent=`${shortGameDate(report.date)} • MW ${report.week} • ${report.formation}`;
  q("matchReportPitch").innerHTML=renderFormationPitch(report);

  q("matchReportBench").innerHTML=report.bench?.length
    ? report.bench.map(p=>{
        const overall=p.overall ?? (p.playerId?DB.players.find(x=>String(x.id)===String(p.playerId))?.overall:null);
        return `<button class="bench-player player-link" data-player-id="${p.playerId}" type="button">
          <span>${p.name}${p.minutes?` <span class="muted small">(${p.minutes}')</span>`:""}</span>
          <span class="bench-player-values">
            <span class="bench-player-overall">OVR ${overall??"—"}</span>
            ${p.rating!=null?`<b title="Match rating">${p.rating.toFixed(1)}</b>`:""}
          </span>
        </button>`;
      }).join("")
    : `<span class="muted small">No bench stored.</span>`;

  const events=report.goalEvents||[];
  const subs=report.substitutions||[];
  const goalRows=events.map(e=>`<div class="match-event-row"><span>⚽ ${e.scorerName}</span><span class="muted">${e.assisterName?`🎯 ${e.assisterName}`:"Unassisted"}</span></div>`);
  const subRows=subs.map(s=>`<div class="match-event-row substitution-row"><span>🔄 ${s.minute}' ${s.playerInName}</span><span class="muted">for ${s.playerOutName} • ${s.reason}</span></div>`);
  q("matchReportEvents").innerHTML=(goalRows.length||subRows.length)
    ? [...goalRows,...subRows].join("")
    : `<span class="muted small">No goals or substitutions recorded for ${state.club}.</span>`;

  q("matchReportModal").classList.remove("hide");
  setModalScrollLock(true);

  q("matchReportModal").querySelectorAll("[data-player-id]").forEach(btn=>{
    btn.addEventListener("click",()=>openPlayerProfile(btn.dataset.playerId));
  });
}

function closeMatchReport(){
  q("matchReportModal")?.classList.add("hide");
  setModalScrollLock(false);

  if(pendingSeasonAfterMatch){
    pendingSeasonAfterMatch=false;
    const monthly=pendingMonthlyAfterMatch;
    pendingMonthlyAfterMatch=null;
    // Season review has precedence at MW38; monthly archive remains stored.
    renderSeasonSummary();
    return;
  }
  if(pendingMonthlyAfterMatch){
    const monthly=pendingMonthlyAfterMatch;
    pendingMonthlyAfterMatch=null;
    renderMonthlySummary(monthly);
  }
}

function openStoredMatchReport(week,home,away){
  const result=state.results?.[`${week}-${home}-${away}`];
  if(result?.matchReport) renderMatchReport(result.matchReport);
}

function renderFixtures(){
  q("fixturesList").innerHTML=state.fixtures.map(r=>`<div class="fixture">
    <div class="sectiontitle">
      <div><b>Matchweek ${r.week}</b><div class="muted small">${shortGameDate(r.date)}</div></div>
      <span class="pill">${r.week<=state.week?"Played":"Upcoming"}</span>
    </div>
    ${r.games.map(game=>{
      const z=state.results[`${r.week}-${game.home}-${game.away}`];
      const userMatch=game.home===state.club||game.away===state.club;
      return `<div class="fixture-result-row ${userMatch?"user-fixture":""}">
        <div class="fixture-scoreline">
          <span>${game.home}</span><b>${z?z.hg+" – "+z.ag:"vs"}</b><span>${game.away}</span>
        </div>
        ${z?.matchReport&&userMatch?`<button class="btn secondary lineup-history-btn" type="button"
          data-week="${r.week}" data-home="${game.home.replaceAll('"','&quot;')}" data-away="${game.away.replaceAll('"','&quot;')}">View lineup</button>`:""}
      </div>`;
    }).join("")}
  </div>`).join("");

  document.querySelectorAll(".lineup-history-btn").forEach(btn=>{
    btn.addEventListener("click",()=>openStoredMatchReport(Number(btn.dataset.week),btn.dataset.home,btn.dataset.away));
  });
}
function renderFinances(){
  if(!q("financeCards")) return;
  ensureFinancialRegulationState();
  const sq=squad(state.club);
  const wages=sq.reduce((s,p)=>s+(state.playerContracts?.[p.id]?.wage??p.wage??0),0)+(typeof userLoanWeeklyWageAdjustment==="function"?userLoanWeeklyWageAdjustment():0);
  const vals=sq.reduce((s,p)=>s+(p.value||0),0);
  const staffWages=(state.staff?.manager?.wage||0)+(state.staff?.dof?.wage||0)+(state.staff?.physio?.wage||0);
  const transferNet=(state.transferFinance?.received||0)-(state.transferFinance?.spent||0);
  const scr=userSCRSnapshot();
  const fr=state.financialRegulations;
  const playing=typeof playingBudgetStatus==="function"?playingBudgetStatus():{allocated:(state.transferFinance?.spent||0)+(state.budget||0),spent:state.transferFinance?.spent||0,remaining:state.budget||0,minAllocation:state.transferFinance?.spent||0,sustainableTotal:(state.transferFinance?.spent||0)+(fr.availableInvestment||state.budget||0),sliderMax:(state.transferFinance?.spent||0)+(fr.availableInvestment||state.budget||0),resources:{}};
  const pct=scr.ratio*100;
  const limitPct=scr.limit*100;
  const progress=Math.min(100,(scr.ratio/0.95)*100);
  const statusClass=scr.status.toLowerCase();
  const projectedSanction=typeof projectedFinancialRegulationAssessment==="function"
    ?projectedFinancialRegulationAssessment(scr)
    :null;
  const sanctionBits=projectedSanction&&scr.ratio>scr.limit?[
    projectedSanction.fine?`${money(projectedSanction.fine)} projected fine`:null,
    projectedSanction.investmentMultiplier<1?`${Math.round((1-projectedSanction.investmentMultiplier)*100)}% reduction to next season's available investment`:null,
    projectedSanction.transferBan?"next-season transfer registration ban":null
  ].filter(Boolean):[];

  q("financeCards").innerHTML=`
  <div class="scr-card scr-${statusClass}">
    <div class="sectiontitle">
      <div>
        <div class="k">Financial Regulations — Squad Cost Ratio</div>
        <div class="scr-value">${pct.toFixed(1)}%</div>
      </div>
      <span class="scr-status">${scr.status}</span>
    </div>
    <div class="progress scr-progress"><span style="width:${progress}%"></span></div>
    <div class="scr-scale"><span>0%</span><span>${Math.round(limitPct)}% regulatory limit</span><span>90%+</span></div>

    <div class="grid3 scr-metrics">
      <div><span>Football revenue</span><b>${money(scr.revenue)}</b></div>
      <div><span>Regulated squad cost</span><b>${money(scr.squadCost)}</b></div>
      <div><span>${scr.headroom>=0?"Headroom":"Reduction required"}</span><b class="${scr.headroom>=0?"good":"bad"}">${money(Math.abs(scr.headroom))}</b></div>
    </div>

    <div class="scr-breakdown">
      <div><span>Annual football payroll</span><b>${money(scr.payroll)}</b></div>
      <div><span>Inherited pre-save commitments</span><b>${money(scr.inherited)}</b></div>
      <div><span>Post-save transfer & agent costs</span><b>${money(scr.acquisitions)}</b></div>
    </div>

    <div class="muted small scr-rule-note">
      Healthy ≤60% • Tight 60–${Math.round(limitPct)}% • Warning ${Math.round(limitPct)}–90% • Breach 90–95% • Severe above 95%.
      Annual assessment sanctions escalate for repeat breaches.
    </div>
    ${projectedSanction&&scr.ratio>scr.limit?`
      <div class="scr-projected-sanction ${projectedSanction.status.toLowerCase()}">
        <b>If the season ended today — ${projectedSanction.status.toUpperCase()}</b>
        <div>${sanctionBits.length?sanctionBits.join(" • "):"Formal warning only — no fine or investment reduction on a first warning."}</div>
        <div class="muted small">Projected consecutive breach assessment: ${projectedSanction.repeat}. Final sanctions are calculated at the annual assessment.</div>
      </div>`:""}
    ${financialTransferBanActive()?`<div class="notice bad scr-sanction-note"><b>TRANSFER REGISTRATION BAN ACTIVE</b><br>Permanent incoming transfers cannot be registered this season.</div>`:""}
  </div>

  <div class="grid3 club-cash-grid">
    <div class="metric"><div class="k">Club cash</div><div class="v ${typeof clubCash==="function"&&clubCash()<0?"bad":""}">${typeof clubCash==="function"?money(clubCash()):"—"}</div><div class="muted small">Real liquid club funds</div></div>
    <div class="metric"><div class="k">Outstanding debt</div><div class="v">${typeof totalClubDebt==="function"?money(totalClubDebt()):"—"}</div><div class="muted small">Infrastructure & liquidity financing</div></div>
    <div class="metric"><div class="k">Capital spend</div><div class="v">${typeof ensureClubFinanceState==="function"?money(ensureClubFinanceState().capitalSpentThisSeason||0):"—"}</div><div class="muted small">Excluded from transfer allocation</div></div>
  </div>
  <div class="grid3" style="margin-top:10px">
    <div class="metric"><div class="k">Available transfer budget</div><div class="v">${money(state.budget)}</div><div class="muted small">From ${money(playing.allocated)} total playing allocation</div></div>
    <div class="metric"><div class="k">Future transfer payments</div><div class="v">${typeof futureTransferCommitments==="function"?money(futureTransferCommitments()):"—"}</div><div class="muted small">Agreed instalments still payable</div></div>
    <div class="metric"><div class="k">Future transfer income</div><div class="v">${typeof futureTransferReceivables==="function"?money(futureTransferReceivables()):"—"}</div><div class="muted small">Agreed instalments still receivable</div></div>
    <div class="metric"><div class="k">Squad value</div><div class="v">${money(vals)}</div></div>
    <div class="metric"><div class="k">Player wages</div><div class="v">${money(wages)}/wk</div></div>
    <div class="metric"><div class="k">Liquidity status</div><div class="v ${typeof clubFinancialDistressStatus==="function"&&clubFinancialDistressStatus().distressed?"bad":"good"}">${typeof clubFinancialDistressStatus==="function"?(clubFinancialDistressStatus().severe?"Severe pressure":clubFinancialDistressStatus().distressed?"Under pressure":"Healthy"):"—"}</div><div class="muted small">Affects available recruitment funding</div></div>
  </div>
  <div class="grid3" style="margin-top:10px">
    <div class="metric"><div class="k">Staff wages</div><div class="v">${money(staffWages)}/wk</div></div>
    <div class="metric"><div class="k">Staff compensation</div><div class="v">${money(state.staffSpend||0)}</div></div>
    <div class="metric"><div class="k">Season P/L</div><div class="v">${money(state.seasonPL)}</div></div>
    <div class="metric"><div class="k">Debt interest this season</div><div class="v">${typeof ensureClubFinanceState==="function"?money(ensureClubFinanceState().debtInterestThisSeason||0):"—"}</div></div>
    <div class="metric"><div class="k">Debt principal repaid</div><div class="v">${typeof ensureClubFinanceState==="function"?money(ensureClubFinanceState().debtPrincipalPaidThisSeason||0):"—"}</div></div>
    <div class="metric"><div class="k">Est. annual operating costs</div><div class="v">${money(annualisedOperatingCosts())}</div><div class="muted small">Stadium, admin, matchday staff & general overheads</div></div>
    <div class="metric"><div class="k">Facility running costs</div><div class="v">${money(totalFacilityAnnualCost())}</div><div class="muted small">Training, medical, academy & recruitment</div></div>
    <div class="metric"><div class="k">Transfer P/L</div><div class="v ${transferNet>0?"good":transferNet<0?"bad":""}">${money(transferNet)}</div><div class="muted small">${money(state.transferFinance?.received||0)} received • ${money(state.transferFinance?.spent||0)} spent</div></div>
  </div>
  <div class="playing-budget-control" style="margin-top:12px">
    <div class="sectiontitle"><div><div class="k">Playing Investment Allocation</div><div class="muted small">You can change this throughout the season. Player-sale proceeds remain in club finances unless you choose to reinvest them.</div></div><span class="pill">CEO CONTROL</span></div>
    <div class="grid3" style="margin-top:10px">
      <div class="metric"><div class="k">Total allocated</div><div class="v" id="playingBudgetAllocated">${money(playing.allocated)}</div></div>
      <div class="metric"><div class="k">Already committed</div><div class="v">${money(playing.spent)}</div><div class="muted small">Completed incoming transfers</div></div>
      <div class="metric"><div class="k">Available to spend</div><div class="v" id="playingBudgetRemaining">${money(playing.remaining)}</div></div>
    </div>
    <div class="budget-slider-row" style="margin-top:12px">
      <input id="livePlayingBudgetSlider" type="range" min="${playing.minAllocation}" max="${playing.sliderMax}" step="5000000" value="${playing.allocated}" aria-label="Playing investment allocation">
      <div class="budget-slider-summary"><b id="livePlayingBudgetPreview">${money(playing.allocated)}</b><button class="btn primary" id="applyLivePlayingBudget" type="button" disabled>Apply allocation</button></div>
    </div>
    <div id="livePlayingBudgetAdvice" class="muted small" style="margin-top:8px">Sustainable allocation today: ${money(playing.sustainableTotal)}. Minimum: ${money(playing.minAllocation)} already committed. Club cash: ${typeof clubCash==="function"?money(clubCash()):"—"}.</div>
  </div>`;

  const liveBudgetSlider=q("livePlayingBudgetSlider"),liveBudgetBtn=q("applyLivePlayingBudget"),livePreview=q("livePlayingBudgetPreview"),liveAdvice=q("livePlayingBudgetAdvice");
  const updateLiveBudgetPreview=()=>{
    if(!liveBudgetSlider)return;const raw=Number(liveBudgetSlider.value||playing.allocated),selected=Math.max(playing.minAllocation,playing.minAllocation+Math.round((raw-playing.minAllocation)/5_000_000)*5_000_000),delta=selected-playing.allocated;
    if(livePreview)livePreview.textContent=money(selected);if(liveBudgetBtn)liveBudgetBtn.disabled=Math.abs(delta)<250000;
    if(liveAdvice){
      const remaining=Math.max(0,selected-playing.spent);
      if(delta>0)liveAdvice.textContent=`Increase by ${money(delta)}. This would leave ${money(remaining)} available for incoming transfer fees. Sustainable allocation today: ${money(playing.sustainableTotal)}.`;
      else if(delta<0)liveAdvice.textContent=`Reduce by ${money(Math.abs(delta))}. This releases planned recruitment capacity back to general club resources; committed transfers cannot be reversed.`;
      else liveAdvice.textContent=`Sustainable allocation today: ${money(playing.sustainableTotal)}. Minimum: ${money(playing.minAllocation)} already committed. Club cash: ${typeof clubCash==="function"?money(clubCash()):"—"}.`;
    }
  };
  liveBudgetSlider?.addEventListener("input",updateLiveBudgetPreview);updateLiveBudgetPreview();
  liveBudgetBtn?.addEventListener("click",()=>{if(typeof applyPlayingBudgetAllocation!=="function")return;applyPlayingBudgetAllocation(Number(liveBudgetSlider.value||playing.allocated),{notify:true,source:"finance-screen"});saveGame(false);renderFinances();renderDashboard();});

  const top=[...sq].sort((a,b)=>(state.playerContracts?.[b.id]?.wage??b.wage)-(state.playerContracts?.[a.id]?.wage??a.wage)).slice(0,12);
  const max=(state.playerContracts?.[top[0]?.id]?.wage??top[0]?.wage)||1;
  q("wageList").innerHTML=top.map(p=>{
    const liveWage=state.playerContracts?.[p.id]?.wage??p.wage;
    return `<div style="margin:10px 0">
      <div style="display:flex;justify-content:space-between"><b>${p.name}</b><span>${money(liveWage)}/wk</span></div>
      <div class="progress"><span style="width:${liveWage/max*100}%"></span></div>
    </div>`;
  }).join("");
}


function updatePrice(key,step){
  if(!state || !state.pricing || state.pricingLocked) return;
  const limits={
    ticket:[10,120],
    concession:[5,60],
    hospitality:[75,1000],
    food:[2,30]
  };
  const [min,max]=limits[key];
  state.pricing[key]=Math.round(clamp(state.pricing[key]+step,min,max)*2)/2;
  saveGame(false);
  renderMatchday();
  renderDashboard();
}

function renderMatchday(){
  if(!state || !q("ticketPrice")) return;
  if(!state.pricing) state.pricing=defaultPricing(state.club);
  if(!state.matchdayStats) state.matchdayStats={revenue:0,attendance:0,homeGames:0};

  const p=state.pricing, rec=recommendedPricing(state.club), md=projectedMatchday();
  q("ticketPrice").textContent=money(p.ticket);
  q("concessionPrice").textContent=money(p.concession);
  q("hospitalityPrice").textContent=money(p.hospitality);
  q("foodPrice").textContent=money(p.food);
  q("seasonTicketDiscountDisplay").textContent=(state.seasonTicketDiscount||15)+"%";

  document.querySelectorAll("#matchday .step-btn").forEach(btn=>{
    btn.disabled=!!state.pricingLocked;
  });

  const pct=Math.round(md.demand*100);
  q("projectedAttendance").textContent=md.attendance.toLocaleString("en-GB");
  q("stadiumCapacity").textContent=(typeof currentOperationalCapacity==="function"?currentOperationalCapacity():STADIUMS[state.club].capacity).toLocaleString("en-GB");
  q("projectedMatchdayRevenue").textContent=money(md.accountingRevenue??md.revenue);
  q("demandPercent").textContent=pct+"%";
  q("demandBar").style.width=pct+"%";

  q("demandLabel").textContent=pct>=98?"Sell-out likely":pct>=90?"Very strong":pct>=80?"Good":pct>=70?"Soft demand":"Supporter resistance";
  q("homeGamesCount").textContent=state.matchdayStats.homeGames+" home games";
  q("matchdayRevenue").textContent=money(state.matchdayStats.revenue);
  q("averageAttendance").textContent=state.matchdayStats.homeGames ? Math.round(state.matchdayStats.attendance/state.matchdayStats.homeGames).toLocaleString("en-GB") : "—";
  q("averageOccupancy").textContent=state.matchdayStats.homeGames ? Math.round((state.matchdayStats.attendance/state.matchdayStats.homeGames)/(typeof currentStadiumCapacity==="function"?currentStadiumCapacity():STADIUMS[state.club].capacity)*100)+"%" : "—";
  if(q("seasonTicketsSold")){ const st=typeof ensureTicketingState==="function"?ensureTicketingState():null; q("seasonTicketsSold").textContent=st?`${st.sold.toLocaleString("en-GB")} / ${st.allocation.toLocaleString("en-GB")}`:"—"; q("seasonTicketWaitingList").textContent=st?st.waitingList.toLocaleString("en-GB"):"—"; q("supporterDemandMetric").textContent=state.supporters?.demand?.toLocaleString("en-GB")||"—"; }

  const ticketDiff=Math.round((p.ticket/rec.ticket-1)*100);
  let advice;
  if(ticketDiff>20) advice=`Tickets are ${ticketDiff}% above the board's market benchmark. Revenue per supporter is high, but demand and fan sentiment are at risk.`;
  else if(ticketDiff<-15) advice=`Tickets are ${Math.abs(ticketDiff)}% below the market benchmark. Fans will approve, although the club may be leaving significant revenue on the table.`;
  else advice=`Pricing is broadly in line with the club's market position. Recommended adult ticket benchmark: ${money(rec.ticket)}.`;
  q("pricingAdvice").textContent=(state.pricingLocked ? `Pricing is locked for the ${currentSeasonLabel()} season. ` : "")+advice;

  if(q("sponsorSummary")){
    if(state.sponsorship){
      q("sponsorTermBadge").textContent=state.sponsorship.years+" season"+(state.sponsorship.years===1?"":"s");
      q("sponsorSummary").innerHTML=`
        <div class="notice">
          <b>${state.sponsorship.name}</b><br>
          <span class="muted small">${money(state.sponsorship.annualValue)} per season • ${money(state.sponsorship.totalValue)} total contract value</span>
          ${state.sponsorship.fanOpposed?'<div class="sponsor-badge bad">FANS OPPOSE THIS</div>':'<div class="sponsor-badge good">FAN RESPONSE: NEUTRAL/POSITIVE</div>'}
        </div>`;
    }else{
      q("sponsorTermBadge").textContent="Not selected";
      q("sponsorSummary").innerHTML='<p class="muted">No sponsorship selected.</p>';
    }
  }
}


let selectedSponsorId=null;

function openSeasonSetup(){
  if(!state.sponsorship){
    if(!state.sponsorOffers || state.sponsorOffers.length===0) state.sponsorOffers=generateSponsorOffers(state.club);
    selectedSponsorId=null;
  }else{
    selectedSponsorId=state.sponsorship.id||"ACTIVE";
  }
  const seasonPill=q("seasonSetup")?.querySelector(".pill");
  if(seasonPill) seasonPill.textContent=currentSeasonLabel();
  q("seasonSetup").classList.remove("hide");
  q("seasonTicketDiscount").value=String(state.seasonTicketDiscount||15);
  if(q("foodPrice")) q("foodPrice").value=state.pricing?.food??defaultPricing(state.club).food;
  if(q("hospitalityPrice")) q("hospitalityPrice").value=state.pricing?.hospitality??defaultPricing(state.club).hospitality;
  if(q("ticketPrice")) q("ticketPrice").value=state.pricing?.ticket??defaultPricing(state.club).ticket;
  renderSeasonSetup();
}


function transferBudgetPlanBounds(){
  const fr=ensureFinancialRegulationState();
  const available=Math.max(0,fr?.availableInvestment??state.budget??0);
  return {min:0,max:available};
}

function setPendingTransferBudget(value){
  const fr=ensureFinancialRegulationState();
  const {min,max}=transferBudgetPlanBounds();
  value=Math.round(clamp(Number(value||0),min,max)/5_000_000)*5_000_000;
  fr.pendingTransferBudget=value;
  renderSeasonSetup();
}

function applyCEOTransferBudgetPlan(){
  const fr=ensureFinancialRegulationState();
  if(!fr) return;
  const seasonKey=currentSeasonLabel();
  const selected=Math.min(fr.availableInvestment||0,Math.max(0,fr.pendingTransferBudget??state.budget??0));
  state.budget=selected;
  if(typeof setInitialPlayingBudgetAllocation==="function") setInitialPlayingBudgetAllocation(selected);

  if(fr.budgetPlanSeason===seasonKey) return;
  fr.budgetPlanSeason=seasonKey;
  if(typeof ceoPlayingBudgetResources==="function" && typeof commitOwnerFootballFunding==="function"){
    const resources=ceoPlayingBudgetResources();
    const requiredOwner=Math.max(0,selected-resources.selfFunded);
    if(requiredOwner>0){const injected=commitOwnerFootballFunding(Math.min(requiredOwner,resources.ownerFunding));if(injected>0)addNews(`OWNER FUNDING: To support your ${money(selected)} playing-budget allocation, ownership injected ${money(injected)} of new equity into the club.`);}
  }

  const available=Math.max(1,fr.availableInvestment||selected||1);
  const share=selected/available;
  const scr=userSCRSnapshot();
  const underPressure=scr.ratio>scr.limit;

  if(share>=0.85){
    stakeholderDecision(
      {manager:+2,owners:underPressure?-3:-1},
      underPressure?"Aggressive transfer budget despite financial pressure":"Ambitious transfer budget",
      {notify:true}
    );
  }else if(share<=0.45){
    stakeholderDecision(
      {manager:underPressure?-1:-3,owners:underPressure?+3:+2},
      underPressure?"Conservative budget to restore financial compliance":"Conservative transfer budget",
      {notify:true}
    );
  }else if(share<0.65){
    stakeholderDecision(
      {manager:underPressure?0:-1,owners:+1},
      underPressure?"Controlled recruitment budget under financial pressure":"Cautious transfer budget",
      {notify:true}
    );
  }

  if(underPressure && share<0.70){
    addNews(`${state.staff?.manager?.name||"The manager"} accepts that the transfer budget has been constrained while the club works toward financial compliance.`);
  }else if(share>=0.85){
    addNews(`${state.staff?.manager?.name||"The manager"} has welcomed the club's ambitious recruitment budget of ${money(selected)}.`);
  }
}

function renderSeasonSetup(){
  if(!state) return;
  const p=state.pricing, rec=recommendedPricing(state.club);
  const fr=ensureFinancialRegulationState();
  const scr=userSCRSnapshot();
  q("setupTicketPrice").textContent=money(p.ticket);
  q("setupConcessionPrice").textContent=money(p.concession);
  q("setupHospitalityPrice").textContent=money(p.hospitality);
  q("setupFoodPrice").textContent=money(p.food);

  if(q("setupAvailableInvestment")) q("setupAvailableInvestment").textContent=money(fr.availableInvestment||0);
  if(q("setupTransferBudgetValue")) q("setupTransferBudgetValue").textContent=money(fr.pendingTransferBudget??state.budget??0);
  if(q("setupSCRValue")) q("setupSCRValue").textContent=`${(scr.ratio*100).toFixed(1)}%`;
  if(q("setupSCRLimit")) q("setupSCRLimit").textContent=`${Math.round(scr.limit*100)}% limit`;
  if(q("setupSCRHeadroom")){
    q("setupSCRHeadroom").textContent=`${scr.headroom>=0?"+":""}${money(scr.headroom)} annual headroom`;
    q("setupSCRHeadroom").className=`small ${scr.headroom>=0?"good":"bad"}`;
  }
  if(q("transferBudgetPlanInput")){
    const bounds=transferBudgetPlanBounds();
    q("transferBudgetPlanInput").min=String(bounds.min);
    q("transferBudgetPlanInput").max=String(bounds.max);
    q("transferBudgetPlanInput").value=String(fr.pendingTransferBudget??state.budget??bounds.max);
  }
  if(q("setupBudgetAdvice")){
    const share=(fr.pendingTransferBudget??state.budget??0)/Math.max(1,fr.availableInvestment||1);
    q("setupBudgetAdvice").textContent=scr.ratio>scr.limit
      ? `The club is currently above its financial-regulation limit. A conservative allocation will be better understood by the manager and owners.`
      : share>=0.85
        ? `An ambitious allocation gives recruitment staff significant freedom, but spending still needs to fit SCR.`
        : share<=0.45
          ? `A conservative allocation protects finances but may frustrate the manager if regulatory headroom is healthy.`
          : `A balanced allocation gives recruitment staff room to address several squad needs.`;
  }

  const projected=projectedMatchday();
  const capacity=typeof currentOperationalCapacity==="function"?currentOperationalCapacity():(STADIUMS[state.club]?.capacity||0);
  if(q("setupPredictedAttendance")) q("setupPredictedAttendance").textContent=projected.attendance.toLocaleString("en-GB");
  if(q("setupPredictedOccupancy")) q("setupPredictedOccupancy").textContent=capacity?`${Math.round(projected.attendance/capacity*100)}%`:"—";
  if(q("setupPredictedRevenue")) q("setupPredictedRevenue").textContent=money(projected.accountingRevenue??projected.revenue);
  if(q("setupDemandNote")){
    const fanNote=stakeholderValue("fans")<40
      ? ` Supporter unhappiness is currently reducing demand to ${Math.round(projected.fanHappinessAttendanceMultiplier*100)}% of its normal level.`
      : "";
    q("setupDemandNote").textContent=`Typical home-match projection based on current prices, supporter happiness and club demand.${fanNote}`;
  }
  if(typeof projectSeasonTicketSales==="function" && q("setupSTSales")){
    const stp=projectSeasonTicketSales();
    q("setupSTSales").textContent=`${stp.sold.toLocaleString("en-GB")} / ${stp.allocation.toLocaleString("en-GB")}`;
    q("setupSTWaiting").textContent=stp.waitingList.toLocaleString("en-GB");
    q("setupSTRevenue").textContent=money(stp.revenue);
  }

  const diff=Math.round((p.ticket/rec.ticket-1)*100);
  q("setupPricingAdvice").textContent =
    diff>20 ? `Adult tickets are ${diff}% above the club benchmark. Expect stronger fan resistance.` :
    diff<-15 ? `Adult tickets are ${Math.abs(diff)}% below the club benchmark. Demand should be strong, but revenue per seat is lower.` :
    `Pricing is broadly in line with the club benchmark. Adult ticket benchmark: ${money(rec.ticket)}.`;

  if(state.sponsorship){
    const remaining=state.sponsorship.seasonsRemaining??state.sponsorship.years??1;
    q("sponsorOptions").innerHTML=`
      <div class="sponsor-card selected">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div><b>${state.sponsorship.name}</b><div class="muted small">Current main sponsor</div></div>
          <div style="text-align:right"><b>${money(state.sponsorship.annualValue)}</b><div class="muted small">per season</div></div>
        </div>
        <div class="muted small" style="margin-top:8px">${remaining} season${remaining===1?"":"s"} remaining</div>
        ${state.sponsorship.fanOpposed?'<div class="sponsor-badge bad">FANS OPPOSE THIS</div>':'<div class="sponsor-badge good">ACTIVE CONTRACT</div>'}
      </div>`;
    q("confirmSeasonSetup").disabled=false;
  }else q("sponsorOptions").innerHTML=state.sponsorOffers.map(s=>`
    <div class="sponsor-card ${s.fanOpposed?"opposed":""} ${selectedSponsorId===s.id?"selected":""}" data-sponsor-id="${s.id}">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div><b>${s.name}</b><div class="muted small">${s.years} season${s.years===1?"":"s"}</div></div>
        <div style="text-align:right"><b>${money(s.annualValue)}</b><div class="muted small">per season</div></div>
      </div>
      <div class="muted small" style="margin-top:8px">Total value: ${money(s.totalValue)}</div>
      ${s.fanOpposed?'<div class="sponsor-badge bad">FANS OPPOSE THIS</div>':'<div class="sponsor-badge good">NO MAJOR FAN OPPOSITION</div>'}
    </div>
  `).join("");

  document.querySelectorAll(".sponsor-card").forEach(card=>{
    card.addEventListener("click",()=>{
      selectedSponsorId=card.dataset.sponsorId;
      renderSeasonSetup();
    });
  });

  q("confirmSeasonSetup").disabled=state.sponsorship?false:!selectedSponsorId;
}

function adjustSetupPrice(key,step){
  if(state.pricingLocked) return;
  const limits={ticket:[10,120],concession:[5,60],hospitality:[75,1000],food:[2,30]};
  const [min,max]=limits[key];
  state.pricing[key]=Math.round(clamp(state.pricing[key]+step,min,max)*2)/2;
  renderSeasonSetup();
}


function resetSponsorRelationshipForNewDeal(sponsor){
  ensureStakeholderState();
  if(!sponsor) return;

  // A sponsorship relationship belongs to the current sponsor, not to the slot.
  // When a new company signs, the previous company's happiness/history must not carry over.
  const initial=sponsor.fanOpposed?61:72;
  state.happiness.sponsors=initial;
  state.stakeholderHistory.sponsors=[];
  state.stakeholderThresholdState.sponsors=stakeholderBand(initial).key;
  state.stakeholderMeta.sponsorTerminationRisk=false;
}

function confirmSeasonSetup(){
  if(!selectedSponsorId) return;
  ensureStakeholderState();
  state.seasonTicketDiscount=Number(q("seasonTicketDiscount").value);
  const chosen=state.sponsorship?null:state.sponsorOffers.find(s=>s.id===selectedSponsorId);

  if(chosen){
    // New company = new relationship. Do this before assigning the deal so an
    // expired sponsor's score/history never carries over.
    resetSponsorRelationshipForNewDeal(chosen);
    state.sponsorship={...chosen,seasonsRemaining:chosen.years};

    if(chosen.fanOpposed){
      stakeholderChange("fans",-3,`Supporter opposition to new sponsor ${chosen.name}`,{notify:true});
      addNews(`Supporters have criticised the club's new sponsorship agreement with ${chosen.name}.`);
    }else{
      stakeholderChange("fans",+1,`Positive supporter response to new sponsor ${chosen.name}`,{notify:true});
      addNews(`${chosen.name} has been announced as the club's main sponsor.`);
    }

    const avgOffer=state.sponsorOffers.reduce((s,x)=>s+x.annualValue,0)/Math.max(1,state.sponsorOffers.length);
    if(chosen.annualValue>avgOffer*1.08){
      stakeholderChange("owners",+2,"Strong commercial value from new sponsorship",{notify:true});
    }
  }

  applyCEOTransferBudgetPlan();
  if(typeof processSeasonTicketSales==="function") processSeasonTicketSales();
  state.pricingLocked=true;
  updateStakeholderDrivers();
  updateStakeholderMeta();
  q("seasonSetup").classList.add("hide");
  saveGame(false);
  renderAll();
}


let currentStaffMarketRole=null;


function managerAttributeLabel(value){
  if(value>=90) return "Elite";
  if(value>=80) return "Very high";
  if(value>=70) return "High";
  if(value>=55) return "Balanced";
  if(value>=40) return "Low";
  return "Very low";
}

function renderManagerProfilePanel(manager){
  const el=q("managerProfilePanel");
  if(!el) return;
  if(!manager){
    el.innerHTML="";
    return;
  }
  const p=typeof managerProfileByName==="function" ? managerProfileByName(manager.name) : null;
  if(!p){
    el.innerHTML="";
    return;
  }

  const attrs=[
    ["Possession",p.possession],
    ["Pressing",p.pressing],
    ["Verticality",p.verticality],
    ["Flexibility",p.flexibility],
    ["Recruitment",p.recruitmentAggression],
    ["Youth trust",p.youthTrust],
    ["Depth demand",p.depthDemand]
  ];

  el.innerHTML=`
    <div class="manager-profile-head">
      <div>
        <div class="manager-profile-kicker">MANAGER PROFILE</div>
        <b>${p.preferredFormation}</b>
      </div>
      <span class="pill">${p.alternatives?.length?`Alternatives: ${p.alternatives.join(" / ")}`:"Fixed shape"}</span>
    </div>
    <p class="muted small manager-profile-summary">${p.summary}</p>
    <div class="manager-profile-attributes">
      ${attrs.map(([label,value])=>`
        <div class="manager-profile-row">
          <div class="manager-profile-label"><span>${label}</span><b>${value}</b></div>
          <div class="manager-profile-bar"><span style="width:${value}%"></span></div>
          <div class="muted tiny">${managerAttributeLabel(value)}</div>
        </div>
      `).join("")}
    </div>
    <div class="notice small muted manager-profile-note">
      Formation, recruitment appetite, youth trust and squad-depth demand currently affect manager AI. Tactical style ratings will also feed future player-profile recruitment.
    </div>
  `;
}

function renderStaff(){
  if(!state || !q("managerName")) return;
  ensureStaffState();

  const mgr=state.staff.manager;
  q("managerName").textContent=mgr?.name || "Vacant";
  q("managerRating").textContent=mgr?.rating ?? "—";
  const profile=typeof managerProfileByName==="function" && mgr ? managerProfileByName(mgr.name) : null;
  q("managerEffect").innerHTML=mgr
    ? `<b>Reputation ${mgr.rating}/100 • ${profile?.preferredFormation||"4-2-3-1"}</b><br><span class="muted small">Weekly wage: ${money(mgr.wage)}. Tactical and recruitment preferences now follow the manager's profile.</span>`
    : `<span class="bad"><b>Position vacant.</b></span><br><span class="muted small">The team is operating under a caretaker until you appoint a manager.</span>`;

  renderManagerProfilePanel(mgr);

  const dof=state.staff.dof;
  const mod=dofNegotiationModifier();
  const pct=Math.round(Math.abs(1-mod)*100);
  q("dofName").textContent=dof?.name || "Vacant";
  q("dofRating").textContent=dof?.rating ?? "—";
  q("dofEffect").innerHTML=dof
    ? `<b>${mod<=1 ? pct+"% negotiation advantage" : pct+"% negotiation penalty"}</b><br><span class="muted small">${mod<=1 ? "Expected transfer fees are reduced by your Director of Football's negotiating ability." : "Top players are likely to cost more because of weak negotiating leverage."} Weekly wage: ${money(dof.wage)}.</span>`
    : `<span class="bad"><b>No Director of Football.</b></span><br><span class="muted small">Transfer negotiations receive a 12% penalty until the role is filled.</span>`;

  const phys=state.staff.physio;
  const injuryReduction=Math.round((1-physioInjuryChanceModifier())*100);
  const recoveryReduction=Math.round((1-physioRecoveryModifier())*100);
  q("physioName").textContent=phys?.name || "Vacant";
  q("physioRating").textContent=phys?.rating ?? "—";
  q("physioEffect").innerHTML=phys
    ? `<b>${injuryReduction>=0?injuryReduction+"% lower":"Higher"} injury risk • ${recoveryReduction>=0?recoveryReduction+"% faster":"Slower"} recovery</b><br><span class="muted small">Weekly wage: ${money(phys.wage)}. Medical quality directly affects the injury engine.</span>`
    : `<span class="bad"><b>No Head Physio.</b></span><br><span class="muted small">Players face higher injury risk and slower recovery until the role is filled.</span>`;

  const injured=squad(state.club).filter(p=>state.injuries[p.id]);
  q("injuryCount").textContent=injured.length+" injur"+(injured.length===1?"y":"ies");
  q("injuryList").innerHTML=injured.length
    ? injured.map(p=>`<div class="notice"><b>${p.name}</b><br><span class="muted small">Expected return in ${state.injuries[p.id].weeksLeft} week${state.injuries[p.id].weeksLeft===1?"":"s"}</span></div>`).join("")
    : `<p class="muted">No injured players.</p>`;

  q("fireManagerBtn").disabled=!mgr;
  q("fireDofBtn").disabled=!dof;
  q("firePhysioBtn").disabled=!phys;
}

function openStaffMarket(role){
  currentStaffMarketRole=role;
  const labels={manager:"Managers",dof:"Directors of Football",physio:"Head Physios"};
  q("staffMarketRole").textContent=labels[role];

  let pool;
  if(role==="manager") pool=MANAGER_POOL;
  else if(role==="dof") pool=DOF_POOL;
  else pool=PHYSIO_POOL;

  const currentName=state.staff[role]?.name;
  const candidates=pool.filter(x=>{
    if(x.name===currentName) return false;
    if(role!=="manager") return true;
    const dismissedDay=state.recentlyDismissedManagers?.[x.name];
    return dismissedDay==null || currentCareerDay()-dismissedDay>=548; // ~18 months
  }).sort((a,b)=>b.rating-a.rating);

  q("staffMarket").innerHTML=candidates.map(c=>{
    const poachClub=role==="manager" ? managerClub(c.name) : null;
    const fee=role==="manager" ? managerCompensation(c) : 0;
    const wage=staffSalary(role,c.rating);
    const mp=role==="manager" && typeof managerProfileByName==="function" ? managerProfileByName(c.name) : null;
    return `<div class="candidate">
      <div>
        <b>${c.name}</b>
        <div class="muted small">${poachClub ? poachClub : "Available candidate"}</div>
        ${mp?`<div class="muted tiny">${mp.preferredFormation} • Press ${mp.pressing} • Youth ${mp.youthTrust} • Flex ${mp.flexibility}</div>`:""}
      </div>
      <div><span class="rating" title="Staff rating">${c.rating}</span></div>
      <div class="wage-mobile-hide">
        <b>${money(wage)}/wk</b>
        ${fee?`<div class="muted small">${money(fee)} compensation</div>`:""}
      </div>
      <button class="btn secondary hire-staff-btn" data-role="${role}" data-name="${c.name.replaceAll('"','&quot;')}">Hire</button>
    </div>`;
  }).join("");

  document.querySelectorAll(".hire-staff-btn").forEach(btn=>{
    btn.addEventListener("click",()=>hireStaff(btn.dataset.role,btn.dataset.name));
  });
}

function hireStaff(role,name){
  let pool=role==="manager"?MANAGER_POOL:role==="dof"?DOF_POOL:PHYSIO_POOL;
  const candidate=pool.find(x=>x.name===name);
  if(!candidate) return;
  if(role==="manager"){
    const dismissedDay=state.recentlyDismissedManagers?.[candidate.name];
    if(dismissedDay!=null && currentCareerDay()-dismissedDay<548){
      addNews(`${candidate.name} is not currently willing to return so soon after being dismissed by the club.`);
      return;
    }
  }

  let fee=0;
  if(role==="manager") fee=managerCompensation(candidate);

  const wage=staffSalary(role,candidate.rating);
  const old=state.staff[role];

  if(role==="manager"){
    const oldClub=managerClub(candidate.name);
    if(oldClub && oldClub!==state.club){
      state.staffAssignments.managers[oldClub]="Caretaker Manager";
    }
    state.staffAssignments.managers[state.club]=candidate.name;
    if(state.managerTactics) delete state.managerTactics[state.club];
  }

  state.staff[role]={...candidate,wage};
  state.staffSpend+=fee;
  state.seasonPL-=fee;
  if(fee&&typeof recordClubCash==="function") recordClubCash(-fee,`Staff compensation: ${candidate.name}`,"staff");

  if(role==="manager"){
    const oldManagerHappiness=stakeholderValue("manager");
    state.happiness.manager=75;
    addStakeholderHistory("manager",75-oldManagerHappiness,`Appointment of ${candidate.name}`,"decision");
    notifyStakeholderThresholdChange("manager",oldManagerHappiness);
    updateStakeholderMeta();
    state.managerBacking=70;
    state.managerChangesThisSeason=(state.managerChangesThisSeason||0)+1;
    if(candidate.rating-(old?.rating||70)>=5) stakeholderChange("players",2,"High-quality managerial appointment",{notify:true});
    addNews(`${candidate.name} has been appointed manager${fee?` after ${money(fee)} compensation was paid`:""}.`);
  }else if(role==="dof"){
    addNews(`${candidate.name} has joined as Director of Football.`);
  }else{
    addNews(`${candidate.name} has joined as Head Physio.`);
  }

  saveGame(false);
  renderStaff();
  renderDashboard();
  renderFinances();
  openStaffMarket(role);
}

function fireStaff(role){
  const person=state.staff[role];
  if(!person) return;
  const labels={manager:"manager",dof:"Director of Football",physio:"Head Physio"};
  if(!confirm(`Fire ${person.name} as ${labels[role]}?`)) return;

  const severance=Math.round((person.wage*20)/25000)*25000;
  state.staffSpend+=severance;
  state.seasonPL-=severance;
  if(typeof recordClubCash==="function") recordClubCash(-severance,`Staff severance: ${person.name}`,"staff");

  if(role==="manager"){
    state.recentlyDismissedManagers=state.recentlyDismissedManagers||{};
    state.recentlyDismissedManagers[person.name]=currentCareerDay();
    state.staffAssignments.managers[state.club]="Caretaker Manager";
    state.staff.manager=null;
    if(state.managerTactics) delete state.managerTactics[state.club];
    const oldManagerHappiness=stakeholderValue("manager");
    state.happiness.manager=35;
    addStakeholderHistory("manager",35-oldManagerHappiness,`Dismissal of ${person.name}`,"decision");
    notifyStakeholderThresholdChange("manager",oldManagerHappiness);
    updateStakeholderMeta();
    state.managerChangesThisSeason=(state.managerChangesThisSeason||0)+1;
    state.managerBacking=40;
    stakeholderDecision({players:-3,fans:-1},`Dismissal of ${person.name}`,{notify:true});
  }else{
    state.staff[role]=null;
  }

  addNews(`${person.name} has been dismissed. Severance cost: ${money(severance)}.`);
  saveGame(false);
  renderStaff();
  renderDashboard();
  renderFinances();
}



let tutorialPage=0;
let tutorialIsFirstRun=false;

const TUTORIAL_PAGES=[
  {
    kicker:"WELCOME TO THE BOARDROOM",
    title:"You are the CEO",
    icon:"CEO",
    body:`
      <p>You run the football club — but you are <b>not the manager</b>.</p>
      <div class="tutorial-rule-grid">
        <div class="tutorial-rule">
          <span class="tutorial-rule-head">You control</span>
          <b>Transfers, contracts, budgets, staff, facilities, pricing and sponsorship.</b>
        </div>
        <div class="tutorial-rule">
          <span class="tutorial-rule-head">The manager controls</span>
          <b>Tactics, formation and the team selected for every match.</b>
        </div>
      </div>
      <p class="tutorial-callout">Your job is to build a successful club around the manager — and decide when to back them, challenge them or replace them.</p>
    `
  },
  {
    kicker:"EVERY DECISION HAS A COST",
    title:"Keep five groups onside",
    icon:"5",
    body:`
      <p>Your decisions affect <b>Fans, Owners, Players, the Manager and Sponsors</b>.</p>
      <div class="tutorial-stakeholders">
        <span>Fans</span><span>Owners</span><span>Players</span><span>Manager</span><span>Sponsors</span>
      </div>
      <p>A choice can make one group happy and upset another. Selling a star may please the Owners financially but anger the Fans. A lucrative sponsor may damage supporter sentiment.</p>
      <p class="tutorial-callout"><b>Below 40%</b>, relationships begin to create problems. Severe fan unhappiness can reduce attendances and even trigger protests.</p>
    `
  },
  {
    kicker:"THE SEASON MOVES DAY BY DAY",
    title:"You make decisions. Time does the rest.",
    icon:"→",
    body:`
      <p><b>Continue</b> advances the calendar by one day. Transfers, injuries, finances, manager requests and fixtures all happen around that calendar.</p>
      <div class="tutorial-rule-grid">
        <div class="tutorial-rule">
          <span class="tutorial-rule-head">Matchday</span>
          <b>The manager chooses the XI automatically.</b>
        </div>
        <div class="tutorial-rule">
          <span class="tutorial-rule-head">After the match</span>
          <b>Review the formation, player ratings, goals and assists.</b>
        </div>
      </div>
      <p>Use those lineups and season stats to understand who the manager actually trusts before making decisions on contracts and transfers.</p>
    `
  },
  {
    kicker:"YOUR FIRST DECISION",
    title:"Set up the commercial side",
    icon:"£",
    body:`
      <p>Pre-season starts with three CEO decisions: <b>matchday pricing</b>, your club's <b>main sponsor</b> and how much available investment to allocate as the <b>transfer budget</b>.</p>
      <div class="tutorial-rule-grid">
        <div class="tutorial-rule">
          <span class="tutorial-rule-head">Pricing & sponsorship</span>
          <b>Grow revenue without losing the support of fans and commercial partners.</b>
        </div>
        <div class="tutorial-rule">
          <span class="tutorial-rule-head">Financial regulations</span>
          <b>Keep regulated squad costs within the club's SCR limit while building the team.</b>
        </div>
      </div>
      <p class="tutorial-callout">A large transfer budget gives the manager and DoF more recruitment freedom, but actual signings must still fit the club's financial-regulation position.</p>
    `
  }
];

function renderTutorialPage(){
  const page=TUTORIAL_PAGES[tutorialPage]||TUTORIAL_PAGES[0];
  if(q("tutorialKicker")) q("tutorialKicker").textContent=page.kicker;
  if(q("tutorialTitle")) q("tutorialTitle").textContent=page.title;
  if(q("tutorialIcon")) q("tutorialIcon").textContent=page.icon;
  if(q("tutorialBody")) q("tutorialBody").innerHTML=page.body;
  if(q("tutorialCounter")) q("tutorialCounter").textContent=`${tutorialPage+1} / ${TUTORIAL_PAGES.length}`;

  const dots=q("tutorialDots");
  if(dots){
    dots.innerHTML=TUTORIAL_PAGES.map((_,i)=>`<span class="${i===tutorialPage?"active":""}"></span>`).join("");
  }

  const back=q("tutorialBackBtn");
  if(back) back.disabled=tutorialPage===0;

  const next=q("tutorialNextBtn");
  if(next){
    const last=tutorialPage===TUTORIAL_PAGES.length-1;
    next.textContent=last?(tutorialIsFirstRun?"Start pre-season →":"Close"):"Next →";
  }

  const skip=q("tutorialSkipBtn");
  if(skip) skip.classList.toggle("hide",!tutorialIsFirstRun);
}

function openTutorial(firstRun=false){
  tutorialIsFirstRun=Boolean(firstRun);
  tutorialPage=0;

  // A new-career briefing must appear BEFORE commercial setup.
  if(firstRun) q("seasonSetup")?.classList.add("hide");

  renderTutorialPage();
  q("tutorialModal")?.classList.remove("hide");
  setModalScrollLock(true);
}

function closeTutorial({completeFirstRun=false}={}){
  q("tutorialModal")?.classList.add("hide");
  setModalScrollLock(false);

  if(completeFirstRun && state){
    state.tutorialSeen=true;
    saveGame(false);
    if(!state.pricingLocked) openSeasonSetup();
  }
  tutorialIsFirstRun=false;
}

function tutorialNext(){
  if(tutorialPage<TUTORIAL_PAGES.length-1){
    tutorialPage+=1;
    renderTutorialPage();
    return;
  }
  closeTutorial({completeFirstRun:tutorialIsFirstRun});
}

function tutorialBack(){
  if(tutorialPage<=0) return;
  tutorialPage-=1;
  renderTutorialPage();
}

function skipTutorial(){
  closeTutorial({completeFirstRun:true});
}

function init(){
  document.querySelectorAll(".club-card").forEach(card=>{
    card.addEventListener("click",()=>createCareer(card.dataset.club));
  });
  document.querySelectorAll("#tabs button").forEach(btn=>{
    btn.addEventListener("click",()=>showTab(btn.dataset.tab));
  });
  document.querySelectorAll("[data-go-tab]").forEach(btn=>{
    btn.addEventListener("click",()=>showTab(btn.dataset.goTab));
  });
  document.querySelectorAll(".home-dashboard-btn").forEach(btn=>{
    btn.addEventListener("click",()=>showTab("dashboard"));
  });
  q("helpBtn")?.addEventListener("click",()=>openTutorial(false));
  q("mobileHelpBtn")?.addEventListener("click",()=>openTutorial(false));
  q("mobileSaveBtn")?.addEventListener("click",()=>saveGame(true));
  q("mobileSaveManagerBtn")?.addEventListener("click",openSaveManager);
  q("mobileCareerBtn")?.addEventListener("click",newCareer);
  q("closeStakeholderDetailBtn")?.addEventListener("click",closeStakeholderDetail);
  q("stakeholderDetailModal")?.addEventListener("click",e=>{if(e.target===q("stakeholderDetailModal")) closeStakeholderDetail();});
  q("tutorialNextBtn")?.addEventListener("click",tutorialNext);
  q("tutorialBackBtn")?.addEventListener("click",tutorialBack);
  q("tutorialSkipBtn")?.addEventListener("click",skipTutorial);
  q("tutorialCloseBtn")?.addEventListener("click",()=>{
    if(tutorialIsFirstRun) skipTutorial();
    else closeTutorial();
  });

  document.querySelectorAll(".squad-view-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      squadView=btn.dataset.squadView||"stats";
      renderSquad();
    });
  });
  q("advanceBtn")?.addEventListener("click",async()=>{
    const btn=q("advanceBtn");
    if(!btn || btn.disabled) return;
    const original=btn.innerHTML;
    btn.disabled=true;
    btn.classList.add("is-processing");
    btn.innerHTML=`<span class="continue-processing"><span class="continue-spinner" aria-hidden="true"></span>Processing…</span><strong>•••</strong>`;

    // Give Safari/Chrome a frame to paint the loading state before the
    // synchronous simulation work begins. Two frames is more reliable on iOS.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

    try{
      await advanceDay();
    }catch(err){
      console.error("Continue failed:",err);
      addNews(`A simulation error prevented the calendar from advancing: ${err?.message||"Unknown error"}.`);
      saveGame(false);
      renderDashboard();
      renderInbox();
    }finally{
      btn.innerHTML=original;
      btn.classList.remove("is-processing");
      btn.disabled=false;
    }
  });
  q("importSaveStartBtn")?.addEventListener("click",triggerImportSave);
  q("importSaveManagerBtn")?.addEventListener("click",triggerImportSave);
  q("importSaveInput")?.addEventListener("change",e=>importSaveFile(e.target.files?.[0]));
  q("manualSaveBtn")?.addEventListener("click",()=>saveGame(true));
  q("exportCurrentSaveBtn")?.addEventListener("click",exportCurrentSave);
  q("closeSaveManagerBtn")?.addEventListener("click",closeSaveManager);
  q("closeDevelopmentReviewBtn")?.addEventListener("click",closeDevelopmentReview);
  q("saveManagerModal")?.addEventListener("click",e=>{if(e.target===q("saveManagerModal")) closeSaveManager();});
  document.querySelectorAll("#matchday .step-btn").forEach(btn=>{
    btn.addEventListener("click",()=>updatePrice(btn.dataset.price,Number(btn.dataset.step)));
  });
  document.querySelectorAll(".setup-step").forEach(btn=>{
    btn.addEventListener("click",()=>adjustSetupPrice(btn.dataset.price,Number(btn.dataset.step)));
  });
  q("seasonTicketDiscount")?.addEventListener("change",e=>{
    state.seasonTicketDiscount=Number(e.target.value);
    renderSeasonSetup();
  });
  q("transferBudgetPlanInput")?.addEventListener("input",e=>setPendingTransferBudget(Number(e.target.value)));
  q("confirmSeasonSetup")?.addEventListener("click",confirmSeasonSetup);
  q("browseManagersBtn")?.addEventListener("click",()=>openStaffMarket("manager"));
  q("browseDofBtn")?.addEventListener("click",()=>openStaffMarket("dof"));
  q("browsePhysioBtn")?.addEventListener("click",()=>openStaffMarket("physio"));
  q("fireManagerBtn")?.addEventListener("click",()=>fireStaff("manager"));
  q("fireDofBtn")?.addEventListener("click",()=>fireStaff("dof"));
  q("firePhysioBtn")?.addEventListener("click",()=>fireStaff("physio"));
  q("continueNextSeasonBtn")?.addEventListener("click",beginNextSeason);
  q("closeMatchReportBtn")?.addEventListener("click",closeMatchReport);
  q("continueMatchReportBtn")?.addEventListener("click",closeMatchReport);
  q("matchReportModal")?.addEventListener("click",e=>{if(e.target===q("matchReportModal")) closeMatchReport();});
  q("closeMonthlySummaryBtn")?.addEventListener("click",closeMonthlySummary);
  q("continueMonthlySummaryBtn")?.addEventListener("click",closeMonthlySummary);
  q("monthlySummary")?.addEventListener("click",e=>{if(e.target===q("monthlySummary")) closeMonthlySummary();});
  q("closeManagerShortlist")?.addEventListener("click",()=>q("managerShortlistModal")?.classList.add("hide"));
  q("managerShortlistModal")?.addEventListener("click",e=>{if(e.target===q("managerShortlistModal")) q("managerShortlistModal").classList.add("hide");});
  q("closePlayerModal")?.addEventListener("click",closePlayerProfile);
  q("playerModal")?.addEventListener("click",e=>{if(e.target===q("playerModal")) closePlayerProfile();});
  q("negotiateContractBtn")?.addEventListener("click",e=>beginContractNegotiation(e.currentTarget.dataset.playerId));
  q("contractWageInput")?.addEventListener("input",()=>{
    const id=q("contractNegotiation")?.dataset.playerId;
    const p=DB.players.find(x=>String(x.id)===String(id));
    if(p) renderContractSCRPreview(p);
  });
  q("contractYearsInput")?.addEventListener("change",()=>{
    const id=q("contractNegotiation")?.dataset.playerId;
    const p=DB.players.find(x=>String(x.id)===String(id));
    if(p) renderContractSCRPreview(p);
  });
  q("submitContractOfferBtn")?.addEventListener("click",submitContractOffer);
  q("cancelContractBtn")?.addEventListener("click",()=>q("contractNegotiation")?.classList.add("hide"));
  q("transferListBtn")?.addEventListener("click",e=>toggleTransferList(e.currentTarget.dataset.playerId));
  q("loanListBtn")?.addEventListener("click",e=>toggleLoanList(e.currentTarget.dataset.playerId));
  migrateLegacySave();
  renderSavedCareers();
  updateSaveStatus();
  if(typeof stadiumDevMode==="function" && stadiumDevMode()){
    const params=new URLSearchParams(window.location.search);
    if(params.get("stadiumSelfTest")==="1"){
      createCareer("Bournemouth");
      state.tutorialSeen=true;
      q("tutorialModal")?.classList.add("hide");
      q("seasonSetup")?.classList.add("hide");
      showTab("stadium");
      setTimeout(()=>{
        const report=typeof runStadiumSelfTest==="function"?runStadiumSelfTest():{passed:false,checks:[]};
        let out=q("stadiumAutoTestResult");
        if(!out){ out=document.createElement("pre");out.id="stadiumAutoTestResult";q("stadiumContent")?.prepend(out); }
        out.textContent=JSON.stringify(report,null,2);
        out.dataset.passed=report.passed?"1":"0";
      },50);
    }
  }
}
window.addEventListener("pagehide",()=>{ if(state && activeSaveId) safeSetSave(); });
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden" && state && activeSaveId) safeSetSave(); });
document.addEventListener("DOMContentLoaded",init);
