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
    if(!state.playerStats[p.id]) state.playerStats[p.id]={appearances:0,goals:0,ratingTotal:0,ratedApps:0,lastRating:null};
    const ps=state.playerStats[p.id];
    if(ps.ratingTotal==null) ps.ratingTotal=0;
    if(ps.ratedApps==null) ps.ratedApps=0;
    if(ps.lastRating===undefined) ps.lastRating=null;
    if(!state.playerMorale[p.id]) state.playerMorale[p.id]="Content";
  });
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

function trackPlayerMatchStats(myGoals,oppGoals=0){
  ensurePlayerState();
  const starters=selectMatchSquad();
  starters.forEach(p=>state.playerStats[p.id].appearances+=1);

  const scorers=starters.filter(p=>!String(p.positions).includes("GK"));
  const goalsByPlayer={};

  for(let g=0;g<myGoals;g++){
    if(!scorers.length) break;
    const weights=scorers.map(p=>{
      let w=Math.max(1,(p.overall||70)-55);
      const pos=String(p.positions);
      if(pos.includes("ST")||pos.includes("CF")||pos.includes("LW")||pos.includes("RW")) w*=1.8;
      else if(pos.includes("CAM")||pos.includes("LM")||pos.includes("RM")) w*=1.35;
      else if(pos.includes("CB")||pos.includes("LB")||pos.includes("RB")) w*=0.45;
      return w;
    });
    const total=weights.reduce((a,b)=>a+b,0);
    let r=Math.random()*total, chosen=scorers[0];
    for(let i=0;i<scorers.length;i++){
      r-=weights[i];
      if(r<=0){chosen=scorers[i];break;}
    }
    state.playerStats[chosen.id].goals+=1;
    goalsByPlayer[chosen.id]=(goalsByPlayer[chosen.id]||0)+1;
  }

  // Match ratings: base performance is influenced by result, player quality,
  // goals and small match-to-match variance. Kept in a familiar 4–10 range.
  const resultBase=myGoals>oppGoals?0.45:myGoals===oppGoals?0.05:-0.35;
  starters.forEach(p=>{
    const quality=((p.overall||75)-75)*0.018;
    const goalBonus=(goalsByPlayer[p.id]||0)*0.70;
    const variance=(Math.random()-.5)*1.15;
    let rating=6.45+resultBase+quality+goalBonus+variance;

    const pos=String(p.positions);
    if(pos.includes("GK") && oppGoals===0) rating+=0.30;
    if((pos.includes("CB")||pos.includes("LB")||pos.includes("RB")) && oppGoals===0) rating+=0.20;

    rating=clamp(Math.round(rating*10)/10,4.0,10.0);
    const s=state.playerStats[p.id];
    s.lastRating=rating;
    s.ratingTotal=(s.ratingTotal||0)+rating;
    s.ratedApps=(s.ratedApps||0)+1;
  });
}

function openPlayerProfile(id){
  ensurePlayerState();
  const p=DB.players.find(x=>String(x.id)===String(id));
  if(!p) return;
  const stats=state.playerStats[p.id]||{appearances:0,goals:0};
  const morale=state.playerMorale[p.id]||"Content";

  q("profileName").textContent=p.name;
  q("profileSubtitle").textContent=`${p.club} • ${p.positions}`;
  q("profileOverall").textContent=p.overall;
  q("profileMorale").textContent=morale;
  q("profileMorale").className="v "+playerMoraleClass(morale);
  q("profileApps").textContent=stats.appearances;
  q("profileGoals").textContent=stats.goals;
  if(q("profileAvgRating")) q("profileAvgRating").textContent=playerAverageRating(p.id)?.toFixed(2)||"—";
  q("profileJoined").textContent=p.joined || "Unknown";
  q("profileAge").textContent=p.age;
  q("profileNationality").textContent=p.nationality;
  const contract=state.playerContracts[p.id]||{wage:p.wage,endYear:p.contract};
  q("profileContract").textContent=contract.endYear;
  q("profilePosition").textContent=p.positions;
  q("profileValue").textContent=money(p.value);
  q("profileWage").textContent=money(contract.wage)+"/wk";
  q("profileAvailability").innerHTML=state.injuries?.[p.id]
    ? `<span class="bad">Injured — ${state.injuries[p.id].daysRemaining??state.injuries[p.id].weeksLeft*7} day${(state.injuries[p.id].daysRemaining??state.injuries[p.id].weeksLeft*7)===1?"":"s"} remaining</span>`
    : `<span class="good">Fit</span>`;

  const listStatus=state.playerListStatus[p.id]||"None";
  q("profileListStatus").innerHTML=listStatus==="Transfer"
    ? `<span class="listed-badge listed-transfer">Transfer listed</span>`
    : listStatus==="Loan"
      ? `<span class="listed-badge listed-loan">Loan listed</span>`
      : "Not listed";

  q("negotiateContractBtn").dataset.playerId=p.id;
  q("transferListBtn").dataset.playerId=p.id;
  q("loanListBtn").dataset.playerId=p.id;
  q("transferListBtn").textContent=listStatus==="Transfer"?"Remove from transfer list":"Add to transfer list";
  q("loanListBtn").textContent=listStatus==="Loan"?"Remove from loan list":"Add to loan list";
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
    if(Math.random()<dailyChance){
      const rawWeeks=injuryBaseDuration();
      const facilityRecovery=clamp(1-(medical-70)*0.004,0.86,1.08);
      const days=Math.max(3,Math.round(rawWeeks*7*physioRecoveryModifier()*facilityRecovery));
      state.injuries[p.id]={
        daysRemaining:days,totalDays:days,
        weeksLeft:Math.ceil(days/7),totalWeeks:Math.ceil(days/7)
      };
      addNews(`${p.name} has suffered an injury and is expected to miss around ${days} day${days===1?"":"s"}.`);
      if(days>=14) scheduleManagerReassessment(1);
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

function updateStakeholderDrivers(){
  if(!state) return;
  if(!state.happinessDrivers) state.happinessDrivers={fans:[],owners:[],players:[],manager:[]};
  const pos=clubLeaguePosition(state.club);
  const target=byClub(state.club).target||10;
  const ppg=recentPointsPerGame();
  const priceP=pricingPressure();

  // FANS
  const fans=[];
  if(state.form?.length){
    if(ppg>=2.2) fans.push({label:"Excellent recent form",value:4});
    else if(ppg>=1.6) fans.push({label:"Positive recent form",value:2});
    else if(ppg<=0.8) fans.push({label:"Poor recent form",value:-4});
    else if(ppg<=1.2) fans.push({label:"Underwhelming recent form",value:-2});
  }

  if(state.week>=5){
    if(pos<=Math.max(1,target-2)) fans.push({label:"Above league expectation",value:3});
    else if(pos>=Math.min(20,target+4)) fans.push({label:"Below league expectation",value:-4});
  }

  // High prices are tolerated more when results are strong, but backlash accelerates when form drops.
  if(priceP>0.22){
    const v=ppg>=2.0?-1:ppg>=1.4?-3:-6;
    fans.push({label:"Very high supporter pricing",value:v});
  }else if(priceP>0.10){
    const v=ppg>=2.0?0:ppg>=1.3?-2:-4;
    fans.push({label:"High supporter pricing",value:v});
  }else if(priceP<-0.12){
    fans.push({label:"Supporter-friendly pricing",value:2});
  }

  if(state.sponsorship?.fanOpposed) fans.push({label:"Controversial sponsorship",value:-4});

  // Transfer hooks already work if future transfer code records events here.
  (state.transferSentiment?.fans||[]).slice(-2).forEach(x=>fans.push(x));
  state.happinessDrivers.fans=fans;

  // OWNERS
  const owners=[];
  const seasonPL=state.seasonPL||0;
  const expectedTolerance=state.ownerProfile?.lossTolerance ?? 15_000_000;
  if(seasonPL>5_000_000) owners.push({label:"Healthy season profit",value:4});
  else if(seasonPL>0) owners.push({label:"Club in profit",value:2});
  else if(seasonPL < -expectedTolerance*1.5) owners.push({label:"Losses exceed owner tolerance",value:-6});
  else if(seasonPL < -expectedTolerance) owners.push({label:"Financial losses",value:-4});
  else if(seasonPL < 0) owners.push({label:"Manageable operating loss",value:-1});

  if((state.staffSpend||0)>10_000_000) owners.push({label:"High staff compensation costs",value:-2});
  (state.transferSentiment?.owners||[]).slice(-2).forEach(x=>owners.push(x));
  state.happinessDrivers.owners=owners;

  // PLAYERS
  const players=[];
  const wageFairness=squadWageFairness();
  if(wageFairness>0.82) players.push({label:"Fair wage structure",value:3});
  else if(wageFairness<0.55) players.push({label:"Perceived wage unfairness",value:-4});

  const managerChanges=state.managerChangesThisSeason||0;
  if(managerChanges===0) players.push({label:"Managerial stability",value:2});
  else if(managerChanges===1) players.push({label:"Recent manager change",value:-2});
  else players.push({label:"Managerial instability",value:-5});

  const trainingRating=typeof facilityRating==="function" ? facilityRating("training") : Math.round(byClub(state.club).reputation-4);
  const squadStandard=Math.round(strength(state.club));
  const facilityGap=trainingRating-squadStandard;
  if(facilityGap>=3) players.push({label:"Excellent training facilities",value:2});
  else if(facilityGap<=-8) players.push({label:"Training facilities below squad standard",value:-4});
  else if(facilityGap<=-4) players.push({label:"Training facilities need improvement",value:-2});

  state.happinessDrivers.players=players;

  // MANAGER
  const manager=[];
  const backing=state.managerBacking ?? 70;
  if(backing>=80) manager.push({label:"Strong board backing",value:4});
  else if(backing>=65) manager.push({label:"Board support",value:2});
  else if(backing<45) manager.push({label:"Feels unsupported",value:-5});
  else if(backing<60) manager.push({label:"Wants more backing",value:-2});

  // Off-pitch fan anger bleeds into manager relationship.
  const offPitchFanNeg=fans.filter(x=>["Very high supporter pricing","High supporter pricing","Controversial sponsorship"].includes(x.label)).reduce((s,x)=>s+x.value,0);
  if(offPitchFanNeg<=-6) manager.push({label:"Fan anger creating pressure",value:-3});
  else if(offPitchFanNeg<=-3) manager.push({label:"Supporter tension",value:-1});

  // Underperformance makes supporters want manager out; this creates an opposite pressure on CEO/manager relationship.
  if(state.week>=6 && pos>=target+5 && ppg<1.1){
    manager.push({label:"Under pressure from supporters",value:-3});
  }

  (state.transferSentiment?.manager||[]).slice(-2).forEach(x=>manager.push(x));
  state.happinessDrivers.manager=manager;
}


function applyHappinessDelta(current,delta){
  // Extreme values should be difficult to reach and maintain.
  if(delta>0 && current>=90) delta*=0.35;
  else if(delta>0 && current>=80) delta*=0.60;
  if(delta<0 && current<=15) delta*=0.40;
  else if(delta<0 && current<=25) delta*=0.65;
  return clamp(current+delta,0,100);
}

function applyStakeholderHappiness(){
  updateStakeholderDrivers();
  const groups=["fans","owners","players","manager"];
  groups.forEach(key=>{
    const drivers=state.happinessDrivers[key]||[];
    let total=drivers.reduce((s,d)=>s+d.value,0);

    // Happiness moves gradually toward pressure rather than jumping wildly every week.
    let delta=0;
    if(total>=6) delta=2;
    else if(total>=2) delta=1;
    else if(total<=-6) delta=-2;
    else if(total<=-2) delta=-1;

    state.happiness[key]=clamp((state.happiness[key]??70)+delta,0,100);
  });

  // Fan dissatisfaction with football performance can create sack pressure.
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
  return clamp(demand+repBoost+formBoost+seasonTicketDemandModifier(),0.58,1);
}

function projectedMatchday(){
  const stadium=STADIUMS[state.club];
  const demand=pricingDemand();
  const attendance=Math.round(stadium.capacity*demand);

  // Simplified crowd composition.
  const adult=Math.round(attendance*0.76);
  const concessions=attendance-adult;
  const hospitalitySeats=Math.round(stadium.capacity*0.045);
  const hospitalitySold=Math.min(hospitalitySeats,Math.round(hospitalitySeats*clamp(1.06-(state.pricing.hospitality/recommendedPricing(state.club).hospitality-1)*0.45,0.55,1)));
  const generalAttendance=Math.max(0,attendance-hospitalitySold);

  const ticketRevenue=(Math.round(generalAttendance*0.76)*state.pricing.ticket)+
                      (Math.round(generalAttendance*0.24)*state.pricing.concession);
  const hospitalityRevenue=hospitalitySold*state.pricing.hospitality;
  const foodTake=attendance*state.pricing.food*0.68; // not every attendee buys a full basket
  const revenue=Math.round(ticketRevenue+hospitalityRevenue+foodTake);

  return {demand,attendance,revenue,hospitalitySold};
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

function seasonTicketDemandModifier(){
  const d=state.seasonTicketDiscount||15;
  if(d>=25) return 0.05;
  if(d>=20) return 0.035;
  if(d>=15) return 0.02;
  if(d>=10) return 0.005;
  return -0.015;
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
const byClub=name=>DB.clubs.find(c=>c.name===name);
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
    playerWages:0,
    staffWages:0,
    operatingCosts:0,
    transferSpent:0,
    transferReceived:0
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
        goals:s.goals||0,
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
  const goals=(now.goals||0)-(before.goals||0);
  const ratedApps=(now.ratedApps||0)-(before.ratedApps||0);
  const ratingTotal=(now.ratingTotal||0)-(before.ratingTotal||0);
  return {
    apps,
    goals,
    ratedApps,
    avgRating:ratedApps>0?ratingTotal/ratedApps:null
  };
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
  const income=finance.matchdayRevenue+finance.commercialIncome+finance.sponsorIncome;
  const expenses=finance.playerWages+finance.staffWages+finance.operatingCosts;
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
      id:player.player.id,name:player.player.name,apps:player.apps,goals:player.goals,avgRating:player.avgRating
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
  const totalExpenses=f.playerWages+f.staffWages+f.operatingCosts;

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
       <div class="muted">${summary.playerOfMonth.apps} apps • ${summary.playerOfMonth.goals} goals • ${summary.playerOfMonth.avgRating?.toFixed(2)||"—"} AVG</div>`
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
    season:{year:2025,label:"2025/26",number:1,phase:"preseason"},
    calendar:{date:"2025-08-01",careerDay:0,lastWeeklyProcess:null,monthlyMonthKey:"2025-08",managerReassessOn:null},
    week:0,
    budget:c.transferBudget,
    wageBudget:c.wageBudget,
    happiness:{fans:74,owners:72,players:76,manager:80},
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
    facilities:{
      training:clamp(Math.round(c.reputation-3),55,94),
      medical:clamp(Math.round(c.reputation-5),52,92),
      academy:clamp(Math.round(c.reputation-7),48,93),
      recruitment:clamp(Math.round(c.reputation-4),52,94)
    },
    transferSentiment:{fans:[],owners:[],players:[],manager:[]},
    transferFinance:{spent:0,received:0},
    aiClubFinances:{},
    happinessDrivers:{fans:[],owners:[],players:[],manager:[]},
    seasonPL:0,
    pricing:defaultPricing(club),
    seasonTicketDiscount:15,
    pricingLocked:false,
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
  // Build the initial recruitment picture before the first matchweek so the
  // manager and AI clubs enter the season with real squad priorities.
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
  if(typeof ensureAIClubFinances==="function") ensureAIClubFinances();
  if(!state.happinessDrivers) state.happinessDrivers={fans:[],owners:[],players:[],manager:[]};
  if(!state.pricing) state.pricing=defaultPricing(state.club);
  if(state.seasonTicketDiscount==null) state.seasonTicketDiscount=15;
  if(state.pricingLocked==null) state.pricingLocked=false;
  if(!state.matchdayStats) state.matchdayStats={revenue:0,attendance:0,homeGames:0};
  if(!state.season) state.season={year:2025,label:"2025/26",number:1,phase:"preseason"};
  if(!state.season.phase) state.season.phase=state.seasonComplete?"complete":(state.week>0?"season":"preseason");
  if(!state.season.label) state.season.label=`${state.season.year}/${String((state.season.year+1)%100).padStart(2,"0")}`;
  ensureCalendarState();
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
  if(!state.pricingLocked) openSeasonSetup();
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
  if(id==="squad") renderSquad();
  if(id==="database") renderDatabase();
  if(id==="fixtures") renderFixtures();
  if(id==="table") renderTable();
  if(id==="finances") renderFinances();
  if(id==="matchday") renderMatchday();
  if(id==="staff") renderStaff();
}


function advanceDay(){
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

  // Off-season rolls into the next football year on 1 June, but remains a
  // playable pre-season until the opening league fixture in August.
  if(state.season.phase==="offseason" &&
     nextDate>=startOfNextSeasonYearDate(currentSeasonStartYear()+1) &&
     !completedMonthlySummary){
    performSeasonRollover();
  }

  // Injuries/recovery and transfer-market activity live on the daily clock.
  processInjuries();
  if(typeof processTransferDay==="function") processTransferDay();

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
    if(typeof runAITransferReview==="function") runAITransferReview();
    if(!managerReviewed && typeof maybeGenerateManagerSquadRequest==="function") maybeGenerateManagerSquadRequest();
  }

  if(isSunday(nextDate)){
    processWeeklyClubCycle();
  }

  // Fixtures are attached to real dates, independent of the Continue cadence.
  const round=fixtureRoundOnDate(nextDate);
  if(round){
    simulateFixtureRound(round);

    if(round.week>=38){
      state.seasonComplete=true;
      state.season.phase="complete";
      archiveCurrentSeason();
    }
  }

  saveGame(false);
  renderAll();

  // Season review takes precedence over monthly reporting if both occur together.
  if(state.seasonComplete) renderSeasonSummary();
  else if(completedMonthlySummary) renderMonthlySummary(completedMonthlySummary);
}

function renderAll(){
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
  renderStaff();
}

function renderDashboard(){
  updateStakeholderDrivers();

  q("dashboardWeek").textContent=state.season?.phase==="offseason"
    ? `Off-season • ${formatGameDate(currentGameDateISO(),{weekday:false})}`
    : `${formatGameDate(currentGameDateISO())}${state.week?` • After MW ${state.week}`:" • Pre-season"}`;

  const people=[
    ["Fans","fans"],["Owners","owners"],["Players","players"],["Manager","manager"]
  ];
  q("happinessCards").innerHTML=people.map(([label,key])=>{
    const v=Math.max(0,Math.min(100,state.happiness[key]));
    return `<div class="happy-card">
      <div class="happy-top"><span>${label}</span><span class="happy-value">${v}%</span></div>
      <div class="happy-bar"><span style="width:${v}%"></span></div>
    </div>`;
  }).join("");

  if(q("leaguePositionMetric")){
    const pos=clubLeaguePosition(state.club);
    q("leaguePositionMetric").textContent=ordinal(pos);
  }

  const pl=q("seasonPL");
  if(pl){
    pl.textContent=money(state.seasonPL);
    pl.className=(state.seasonPL>0?"good":state.seasonPL<0?"bad":"");
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
        q("dashboardNextFixture").innerHTML=`<div class="fixture">
          <div class="muted small">${shortGameDate(r.date).toUpperCase()} • MW ${r.week} • ${g.home===state.club?"HOME":"AWAY"}${days?` • ${days} DAY${days===1?"":"S"}`:" • TODAY"}</div>
          <div class="teams">${g.home} <span class="muted">vs</span> ${g.away}</div>
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
    return false;
  });

  const display=(actionable.length?actionable:state.news||[]).slice(0,3);
  count.textContent=String(actionable.length);

  preview.innerHTML=display.length
    ? display.map(n=>`<div class="inbox-preview-item"><span class="pill">${n.date?shortGameDate(n.date):`MW ${n.week}`}</span>${n.text}</div>`).join("")
    : `<div class="muted small">No messages requiring your attention.</div>`;
}

function renderInbox(){
  q("inbox").innerHTML=state.news.map(n=>{
    let actions="";
    if(n.requestId){
      const req=state.managerRequests?.find(r=>r.id===n.requestId);
      if(req && !req.resolved){
        actions=`<div class="inbox-action">
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
    const when=n.date?shortGameDate(n.date):`MW ${n.week}`;
    return `<div class="news"><span class="pill">${when}</span> &nbsp; ${n.text}${actions}</div>`;
  }).join("")||`<p class="muted">No messages.</p>`;

  document.querySelectorAll(".manager-request-btn").forEach(btn=>{
    btn.addEventListener("click",()=>resolveManagerRequest(btn.dataset.requestId,btn.dataset.accept==="1"));
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
      ? `<tr><th>Player</th><th>Pos</th><th>OVR</th><th>Morale</th><th class="num">Apps</th><th class="num">Goals</th><th class="num">AVG</th></tr>`
      : `<tr><th>Player</th><th>Age</th><th>Value</th><th>Wage</th><th>Contract</th><th>Status</th></tr>`;
  }

  if(q("squadRows")){
    q("squadRows").innerHTML=arr.map(p=>{
      const playerCell=`<td class="squad-player-cell"><button type="button" class="player-link" data-player-id="${p.id}">${p.name}</button><div class="muted small">${p.nationality}</div></td>`;
      if(squadView==="stats"){
        return `<tr>
          ${playerCell}
          <td>${primarySquadPosition(p)==="OTHER"?p.positions:primarySquadPosition(p)}</td>
          <td><span class="rating">${p.overall}</span></td>
          <td class="${playerMoraleClass(state.playerMorale[p.id])}">${state.playerMorale[p.id]}</td>
          <td class="num">${state.playerStats[p.id]?.appearances||0}</td>
          <td class="num">${state.playerStats[p.id]?.goals||0}</td>
          <td class="num">${playerAverageRating(p.id)?.toFixed(2)||"—"}</td>
        </tr>`;
      }

      const status=state.playerListStatus[p.id]==="Transfer"
        ? `<span class="listed-badge listed-transfer">Transfer</span>`
        : state.playerListStatus[p.id]==="Loan"
          ? `<span class="listed-badge listed-loan">Loan</span>`
          : state.injuries?.[p.id]
            ? `<span class="injury-chip">${state.injuries[p.id].weeksLeft}w</span>`
            : `<span class="status-fit">Fit</span>`;

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
  const query=(q("dbSearch")?.value||"").toLowerCase();
  const arr=DB.players.filter(p=>(p.name+" "+p.club+" "+p.nationality+" "+p.positions).toLowerCase().includes(query))
    .sort((a,b)=>b.overall-a.overall).slice(0,300);
  q("dbRows").innerHTML=arr.map(p=>`<tr>
    <td><button type="button" class="player-link database-player-link" data-player-id="${p.id}">${p.name}</button></td><td>${p.club}</td><td>${p.positions}</td>
    <td><span class="rating">${p.overall}</span></td><td>${p.potential}</td><td>${p.age}</td><td>${money(p.value)}</td>
  </tr>`).join("");
}

function poisson(lambda){
  let L=Math.exp(-lambda),k=0,p=1;
  do{k++;p*=Math.random()}while(p>L);
  return k-1;
}
function simulateGame(home,away){
  const hs=strength(home),as=strength(away),diff=(hs-as)/8;
  const hx=Math.max(.35,1.35+diff*.42+.23);
  const ax=Math.max(.25,1.12-diff*.42);
  return [Math.min(6,poisson(hx)),Math.min(6,poisson(ax))];
}
function applyResult(home,away,hg,ag){
  const h=state.table[home],a=state.table[away];
  h.p++;a.p++;h.gf+=hg;h.ga+=ag;a.gf+=ag;a.ga+=hg;
  if(hg>ag){h.w++;h.pts+=3;a.l++}
  else if(hg<ag){a.w++;a.pts+=3;h.l++}
  else{h.d++;a.d++;h.pts++;a.pts++}
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

  if((state.budget||0)<cost){
    addNews(`The board could not approve the ${FACILITY_TYPES[type].label.toLowerCase()} upgrade because available funds are insufficient.`);
    return;
  }

  state.budget-=cost;
  state.facilities[type]=clamp(current+actualPoints,0,100);
  state.seasonPL-=cost;
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

  const playerWages=squad(state.club).reduce((s,p)=>s+(state.playerContracts?.[p.id]?.wage??p.wage??0),0);
  const staffWeekly=(state.staff?.manager?.wage||0)+(state.staff?.dof?.wage||0)+(state.staff?.physio?.wage||0);
  const operatingCosts=weeklyClubOperatingCosts();

  // Previous model was calibrated over 38 matchweeks. Scale recurring commercial
  // income to a 52-week calendar so annual revenue does not jump simply because time is daily.
  const commercialIncome=byClub(state.club).reputation*65000*(38/52);
  const sponsorIncome=state.sponsorship ? state.sponsorship.annualValue/52 : 0;

  if(!state.monthlyFinance) state.monthlyFinance=createEmptyMonthlyFinance();
  state.monthlyFinance.commercialIncome+=commercialIncome;
  state.monthlyFinance.sponsorIncome+=sponsorIncome;
  state.monthlyFinance.playerWages+=playerWages;
  state.monthlyFinance.staffWages+=staffWeekly;
  state.monthlyFinance.operatingCosts+=operatingCosts.total;

  state.seasonPL += commercialIncome+sponsorIncome-playerWages-staffWeekly-operatingCosts.total;

  applyStakeholderHappiness();
  updateIndividualMorale();
}

function simulateFixtureRound(round){
  if(!round) return;

  round.games.forEach(g=>{
    const [hg,ag]=simulateGame(g.home,g.away);
    state.results[`${round.week}-${g.home}-${g.away}`]={hg,ag,date:round.date};
    applyResult(g.home,g.away,hg,ag);
  });

  const mine=round.games.find(g=>g.home===state.club||g.away===state.club);
  if(!mine) return;
  const res=state.results[`${round.week}-${mine.home}-${mine.away}`];
  const myGoals=mine.home===state.club?res.hg:res.ag;
  const opGoals=mine.home===state.club?res.ag:res.hg;
  const opp=mine.home===state.club?mine.away:mine.home;
  const outcome=myGoals>opGoals?"W":myGoals===opGoals?"D":"L";

  trackPlayerMatchStats(myGoals,opGoals);
  state.form.push(outcome);
  state.form=state.form.slice(-5);

  if(mine.home===state.club){
    const md=projectedMatchday();
    const matchdayCost=weeklyMatchdayStaffCost();
    const netHomeIncome=Math.max(0,md.revenue-matchdayCost);

    state.matchdayStats.revenue+=md.revenue;
    state.matchdayStats.attendance+=md.attendance;
    state.matchdayStats.homeGames+=1;

    if(!state.monthlyFinance) state.monthlyFinance=createEmptyMonthlyFinance();
    state.monthlyFinance.matchdayRevenue+=md.revenue;
    state.monthlyFinance.operatingCosts+=matchdayCost;
    state.seasonPL+=netHomeIncome;

    const fanPriceEffect=pricingFanEffect();
    state.happiness.fans=clamp(state.happiness.fans+fanPriceEffect,0,100);
    addNews(`${md.attendance.toLocaleString("en-GB")} supporters attended the home match, generating ${money(md.revenue)} in matchday revenue.`);
  }

  if(!state.monthlyResults) state.monthlyResults=[];
  state.monthlyResults.push({
    week:round.week,date:round.date,opponent:opp,home:mine.home===state.club,
    goalsFor:myGoals,goalsAgainst:opGoals,outcome
  });

  state.week=Math.max(state.week,round.week);
  state.season.phase="season";
  addNews(`${state.club} ${myGoals}–${opGoals} ${opp}.`);
}

function advanceMatchweek(){
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
  squad(state.club).forEach(p=>playerStats[p.id]={name:p.name,club:state.club,appearances:state.playerStats?.[p.id]?.appearances||0,goals:state.playerStats?.[p.id]?.goals||0,overall:p.overall});
  return {season:currentSeasonLabel(),year:currentSeasonStartYear(),seasonNumber:seasonDisplayNumber(),club:state.club,leagueFinish:finish,record,seasonProfitLoss:state.seasonPL||0,transferPL,transferSpent:state.transferFinance?.spent||0,transferReceived:state.transferFinance?.received||0,scr:scr?{ratio:scr.ratio,status:scr.status,revenue:scr.revenue,squadCost:scr.squadCost}:null,stakeholders:{...state.happiness},topScorer:top?{id:top.id,name:top.name,goals:state.playerStats?.[top.id]?.goals||0}:null,playerStats};
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
  q("summaryStakeholders").innerHTML=[["Fans",a.stakeholders.fans],["Owners",a.stakeholders.owners],["Players",a.stakeholders.players],["Manager",a.stakeholders.manager]].map(([label,value])=>`<div class="summary-stakeholder"><div style="display:flex;justify-content:space-between"><span>${label}</span><b>${Math.round(value)}%</b></div><div class="happy-bar"><span style="width:${Math.max(0,Math.min(100,value))}%"></span></div></div>`).join("");
  q("summarySeasonNumber").textContent=`Season ${a.seasonNumber}`; q("summarySeasonNotes").innerHTML=`<div class="notice"><b>League:</b> ${ordinal(a.leagueFinish)} place.</div><div class="notice"><b>Financial:</b> ${money(a.seasonProfitLoss)} season P/L; ${money(a.transferPL)} transfer P/L.</div><div class="notice"><b>SCR:</b> ${a.scr?`${(a.scr.ratio*100).toFixed(1)}% — ${a.scr.status}`:"Unavailable"}.</div>`;
  q("seasonSummary").classList.remove("hide"); state.seasonSummaryViewed=true; saveGame(false);
}
function stakeholderSummerReset(v){ return Math.round(v*.70+70*.30); }
function processPlayerYearEnd(){
  DB.players.forEach(p=>{
    p.age=(p.age||0)+1;
    const potential=p.potential??p.overall,apps=state.playerStats?.[p.id]?.appearances||0;
    if(p.age<=24&&p.overall<potential){ let chance=.45+(apps>=25?.25:apps>=12?.10:0)+(state.playerMorale?.[p.id]==="Happy"?.08:0); if(Math.random()<chance)p.overall+=Math.min(potential-p.overall,Math.random()<.20?2:1); }
    else if(p.age>=31){ let chance=Math.min(.90,.45+(p.age-31)*.08); if(Math.random()<chance)p.overall=Math.max(55,p.overall-(Math.random()<.20?2:1)); }
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
function updateReputationFromSeason(finish){ const c=byClub(state.club); if(!c)return; const target=c.target||10; let d=finish<=target-3?2:finish<=target-1?1:finish>=target+5?-2:finish>=target+3?-1:0; c.reputation=clamp((c.reputation||70)+d,60,99); }

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

function performSeasonRollover(){
  const archive=state.careerHistory?.seasons?.find(x=>x.year===currentSeasonStartYear()) || archiveCurrentSeason();
  const offSeasonCarryPL=(state.seasonPL||0)-(archive.seasonProfitLoss||0);

  processPlayerYearEnd();
  if(typeof processFacilityYearEnd==="function") processFacilityYearEnd();
  expireContractsAndHandleFreeAgents();
  updateReputationFromSeason(archive.leagueFinish);

  state.season.year+=1;
  state.season.number+=1;
  state.season.label=`${state.season.year}/${String((state.season.year+1)%100).padStart(2,"0")}`;
  state.season.phase="preseason";
  state.week=0;
  state.seasonComplete=false;
  state.seasonSummaryViewed=false;

  state.fixtures=generateFixtures(DB.clubs.map(x=>x.name),state.season.year);
  state.table=blankTable();
  state.results={};
  state.form=[];
  state.matchdayStats={revenue:0,attendance:0,homeGames:0};
  state.seasonPL=offSeasonCarryPL;
  state.transferFinance={spent:0,received:0};
  state.managerChangesThisSeason=0;
  state.managerPressureNotified=false;
  state.managerRequests=[];
  state.managerRequestCooldowns={};
  state.managerRequestsByWeek={};
  state.managerRoleFulfilledUntil={};
  state.managerSquadVacancies=[];
  state.transferReviewsRun={};
  state.incomingTransferOffers=[];
  state.transferNegotiations={};
  state.aiTransferPlans={};

  resetSeasonPlayerStats();
  resetMonthlyTracker();
  state.calendar.monthlyMonthKey=currentGameDateISO().slice(0,7);

  Object.keys(state.happiness).forEach(k=>state.happiness[k]=stakeholderSummerReset(state.happiness[k]));
  state.budget=nextSeasonBudgetForUser(archive);
  resetAIClubFinancesForNewSeason();

  if(state.sponsorship){
    if(state.sponsorship.seasonsRemaining==null) state.sponsorship.seasonsRemaining=state.sponsorship.years||1;
    state.sponsorship.seasonsRemaining=Math.max(0,state.sponsorship.seasonsRemaining-1);
    if(state.sponsorship.seasonsRemaining<=0){
      addNews(`${state.sponsorship.name}'s sponsorship agreement has expired.`);
      state.sponsorship=null;
      state.sponsorOffers=[];
    }else{
      state.sponsorOffers=[];
      state.sponsorship.totalValue=state.sponsorship.annualValue*state.sponsorship.seasonsRemaining;
    }
  }else state.sponsorOffers=[];

  state.pricingLocked=false;
  if(!state.pricing) state.pricing=defaultPricing(state.club);
  state.managerBacking=Math.round((state.managerBacking||70)*.75+70*.25);

  addNews(`The ${currentSeasonLabel()} season has begun. The board has confirmed a transfer budget of ${money(state.budget)}.`);
  openSeasonSetup();
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
function renderFixtures(){
  q("fixturesList").innerHTML=state.fixtures.map(r=>`<div class="fixture">
    <div class="sectiontitle"><b>Matchweek ${r.week}</b><span class="pill">${r.week<=state.week?"Played":"Upcoming"}</span></div>
    ${r.games.map(g=>{
      const z=state.results[`${r.week}-${g.home}-${g.away}`];
      return `<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;padding:5px 0">
        <span style="text-align:right">${g.home}</span><b>${z?z.hg+" – "+z.ag:"vs"}</b><span>${g.away}</span>
      </div>`;
    }).join("")}
  </div>`).join("");
}
function renderFinances(){
  if(!q("financeCards")) return;
  const sq=squad(state.club);
  const wages=sq.reduce((s,p)=>s+(state.playerContracts?.[p.id]?.wage??p.wage??0),0);
  const vals=sq.reduce((s,p)=>s+(p.value||0),0);
  const staffWages=(state.staff?.manager?.wage||0)+(state.staff?.dof?.wage||0)+(state.staff?.physio?.wage||0);
  const transferNet=(state.transferFinance?.received||0)-(state.transferFinance?.spent||0);
  const scr=typeof userSCRSnapshot==="function"?userSCRSnapshot():null;
  q("financeCards").innerHTML=`${scr?`<div class="scr-card scr-${scr.status.toLowerCase()}">
    <div class="sectiontitle"><div><div class="k">Squad Cost Ratio (SCR)</div><div class="scr-value">${(scr.ratio*100).toFixed(1)}%</div></div><span class="scr-status">${scr.status}</span></div>
    <div class="progress scr-progress"><span style="width:${Math.min(100,(scr.ratio/1.15)*100)}%"></span></div>
    <div class="scr-scale"><span>0%</span><span>85% green limit</span><span>115% max</span></div>
    <div class="grid3 scr-metrics">
      <div><span>Football revenue</span><b>${money(scr.revenue)}</b></div>
      <div><span>Projected squad cost</span><b>${money(scr.squadCost)}</b></div>
      <div><span>85% headroom</span><b class="${scr.greenHeadroom<0?"bad":"good"}">${money(scr.greenHeadroom)}</b></div>
    </div>
    <div class="muted small" style="margin-top:8px">Green ≤85% • Amber 85–115% • Red above 115%</div>
  </div>`:""}<div class="grid3">
    <div class="metric"><div class="k">Transfer budget</div><div class="v">${money(state.budget)}</div></div>
    <div class="metric"><div class="k">Squad value</div><div class="v">${money(vals)}</div></div>
    <div class="metric"><div class="k">Player wages</div><div class="v">${money(wages)}/wk</div></div>
  </div>
  <div class="grid3" style="margin-top:10px">
    <div class="metric"><div class="k">Staff wages</div><div class="v">${money(staffWages)}/wk</div></div>
    <div class="metric"><div class="k">Staff compensation</div><div class="v">${money(state.staffSpend||0)}</div></div>
    <div class="metric"><div class="k">Season P/L</div><div class="v">${money(state.seasonPL)}</div></div>
    <div class="metric"><div class="k">Est. annual operating costs</div><div class="v">${money(annualisedOperatingCosts())}</div><div class="muted small">Stadium, admin, matchday staff & general overheads</div></div>
    <div class="metric"><div class="k">Facility running costs</div><div class="v">${money(totalFacilityAnnualCost())}</div><div class="muted small">Training, medical, academy & recruitment</div></div>
    <div class="metric"><div class="k">Transfer P/L</div><div class="v ${transferNet>0?"good":transferNet<0?"bad":""}">${money(transferNet)}</div><div class="muted small">${money(state.transferFinance?.received||0)} received • ${money(state.transferFinance?.spent||0)} spent</div></div>
  </div>`;
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
  q("stadiumCapacity").textContent=STADIUMS[state.club].capacity.toLocaleString("en-GB");
  q("projectedMatchdayRevenue").textContent=money(md.revenue);
  q("demandPercent").textContent=pct+"%";
  q("demandBar").style.width=pct+"%";

  q("demandLabel").textContent=pct>=98?"Sell-out likely":pct>=90?"Very strong":pct>=80?"Good":pct>=70?"Soft demand":"Supporter resistance";
  q("homeGamesCount").textContent=state.matchdayStats.homeGames+" home games";
  q("matchdayRevenue").textContent=money(state.matchdayStats.revenue);
  q("averageAttendance").textContent=state.matchdayStats.homeGames ? Math.round(state.matchdayStats.attendance/state.matchdayStats.homeGames).toLocaleString("en-GB") : "—";
  q("averageOccupancy").textContent=state.matchdayStats.homeGames ? Math.round((state.matchdayStats.attendance/state.matchdayStats.homeGames)/STADIUMS[state.club].capacity*100)+"%" : "—";

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

function renderSeasonSetup(){
  if(!state) return;
  const p=state.pricing, rec=recommendedPricing(state.club);
  q("setupTicketPrice").textContent=money(p.ticket);
  q("setupConcessionPrice").textContent=money(p.concession);
  q("setupHospitalityPrice").textContent=money(p.hospitality);
  q("setupFoodPrice").textContent=money(p.food);

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

function confirmSeasonSetup(){
  if(!selectedSponsorId) return;
  state.seasonTicketDiscount=Number(q("seasonTicketDiscount").value);
  const chosen=state.sponsorship ? null : state.sponsorOffers.find(s=>s.id===selectedSponsorId);
  if(chosen) state.sponsorship={...chosen,seasonsRemaining:chosen.years};

  if(chosen?.fanOpposed){
    state.happiness.fans=clamp(state.happiness.fans-3,0,100);
    addNews(`Supporters have criticised the club's new sponsorship agreement with ${chosen.name}.`);
  }else if(chosen){
    state.happiness.fans=clamp(state.happiness.fans+1,0,100);
    addNews(`${chosen.name} has been announced as the club's main sponsor.`);
  }

  if(chosen){
    const avgOffer=state.sponsorOffers.reduce((s,x)=>s+x.annualValue,0)/Math.max(1,state.sponsorOffers.length);
    if(chosen.annualValue>avgOffer*1.08) state.happiness.owners=clamp(state.happiness.owners+2,0,100);
  }

  state.pricingLocked=true;
  updateStakeholderDrivers();
  q("seasonSetup").classList.add("hide");
  saveGame(false);
  renderAll();
}


let currentStaffMarketRole=null;

function renderStaff(){
  if(!state || !q("managerName")) return;
  ensureStaffState();

  const mgr=state.staff.manager;
  q("managerName").textContent=mgr?.name || "Vacant";
  q("managerRating").textContent=mgr?.rating ?? "—";
  q("managerEffect").innerHTML=mgr
    ? `<b>Reputation ${mgr.rating}/100</b><br><span class="muted small">Weekly wage: ${money(mgr.wage)}. Higher-rated managers are more costly to poach from rival clubs.</span>`
    : `<span class="bad"><b>Position vacant.</b></span><br><span class="muted small">The team is operating under a caretaker until you appoint a manager.</span>`;

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
  const candidates=pool.filter(x=>x.name!==currentName).sort((a,b)=>b.rating-a.rating);

  q("staffMarket").innerHTML=candidates.map(c=>{
    const poachClub=role==="manager" ? managerClub(c.name) : null;
    const fee=role==="manager" ? managerCompensation(c) : 0;
    const wage=staffSalary(role,c.rating);
    return `<div class="candidate">
      <div>
        <b>${c.name}</b>
        <div class="muted small">${poachClub ? poachClub : "Available candidate"}</div>
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
  }

  state.staff[role]={...candidate,wage};
  state.staffSpend+=fee;
  state.seasonPL-=fee;

  if(role==="manager"){
    state.happiness.manager=75;
    state.managerBacking=70;
    state.managerChangesThisSeason=(state.managerChangesThisSeason||0)+1;
    state.happiness.players=clamp(state.happiness.players+(candidate.rating-(old?.rating||70)>=5?2:0),0,100);
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

  if(role==="manager"){
    state.staffAssignments.managers[state.club]="Caretaker Manager";
    state.staff.manager=null;
    state.happiness.manager=35;
    state.managerChangesThisSeason=(state.managerChangesThisSeason||0)+1;
    state.managerBacking=40;
    state.happiness.players=clamp(state.happiness.players-3,0,100);
    state.happiness.fans=clamp(state.happiness.fans-1,0,100);
  }else{
    state.staff[role]=null;
  }

  addNews(`${person.name} has been dismissed. Severance cost: ${money(severance)}.`);
  saveGame(false);
  renderStaff();
  renderDashboard();
  renderFinances();
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
  q("toggleInboxBtn")?.addEventListener("click",()=>{
    const inbox=q("inbox");
    if(!inbox) return;
    const opening=inbox.classList.contains("hide");
    inbox.classList.toggle("hide");
    q("toggleInboxBtn").textContent=opening?"Close full inbox":"Open full inbox";
  });
  document.querySelectorAll(".squad-view-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      squadView=btn.dataset.squadView||"stats";
      renderSquad();
    });
  });
  q("advanceBtn")?.addEventListener("click",()=>{
    try{
      advanceDay();
    }catch(err){
      console.error("Continue failed:",err);
      addNews(`A simulation error prevented the calendar from advancing: ${err?.message||"Unknown error"}.`);
      saveGame(false);
      renderDashboard();
      renderInbox();
    }
  });
  q("importSaveStartBtn")?.addEventListener("click",triggerImportSave);
  q("importSaveManagerBtn")?.addEventListener("click",triggerImportSave);
  q("importSaveInput")?.addEventListener("change",e=>importSaveFile(e.target.files?.[0]));
  q("manualSaveBtn")?.addEventListener("click",()=>saveGame(true));
  q("exportCurrentSaveBtn")?.addEventListener("click",exportCurrentSave);
  q("closeSaveManagerBtn")?.addEventListener("click",closeSaveManager);
  q("saveManagerModal")?.addEventListener("click",e=>{if(e.target===q("saveManagerModal")) closeSaveManager();});
  document.querySelectorAll("#matchday .step-btn").forEach(btn=>{
    btn.addEventListener("click",()=>updatePrice(btn.dataset.price,Number(btn.dataset.step)));
  });
  document.querySelectorAll(".setup-step").forEach(btn=>{
    btn.addEventListener("click",()=>adjustSetupPrice(btn.dataset.price,Number(btn.dataset.step)));
  });
  q("seasonTicketDiscount")?.addEventListener("change",e=>{
    state.seasonTicketDiscount=Number(e.target.value);
  });
  q("confirmSeasonSetup")?.addEventListener("click",confirmSeasonSetup);
  q("browseManagersBtn")?.addEventListener("click",()=>openStaffMarket("manager"));
  q("browseDofBtn")?.addEventListener("click",()=>openStaffMarket("dof"));
  q("browsePhysioBtn")?.addEventListener("click",()=>openStaffMarket("physio"));
  q("fireManagerBtn")?.addEventListener("click",()=>fireStaff("manager"));
  q("fireDofBtn")?.addEventListener("click",()=>fireStaff("dof"));
  q("firePhysioBtn")?.addEventListener("click",()=>fireStaff("physio"));
  q("continueNextSeasonBtn")?.addEventListener("click",beginNextSeason);
  q("closeMonthlySummaryBtn")?.addEventListener("click",closeMonthlySummary);
  q("continueMonthlySummaryBtn")?.addEventListener("click",closeMonthlySummary);
  q("monthlySummary")?.addEventListener("click",e=>{if(e.target===q("monthlySummary")) closeMonthlySummary();});
  q("closeManagerShortlist")?.addEventListener("click",()=>q("managerShortlistModal")?.classList.add("hide"));
  q("managerShortlistModal")?.addEventListener("click",e=>{if(e.target===q("managerShortlistModal")) q("managerShortlistModal").classList.add("hide");});
  q("closePlayerModal")?.addEventListener("click",closePlayerProfile);
  q("playerModal")?.addEventListener("click",e=>{if(e.target===q("playerModal")) closePlayerProfile();});
  q("negotiateContractBtn")?.addEventListener("click",e=>beginContractNegotiation(e.currentTarget.dataset.playerId));
  q("submitContractOfferBtn")?.addEventListener("click",submitContractOffer);
  q("cancelContractBtn")?.addEventListener("click",()=>q("contractNegotiation")?.classList.add("hide"));
  q("transferListBtn")?.addEventListener("click",e=>toggleTransferList(e.currentTarget.dataset.playerId));
  q("loanListBtn")?.addEventListener("click",e=>toggleLoanList(e.currentTarget.dataset.playerId));
  migrateLegacySave();
  renderSavedCareers();
  updateSaveStatus();
}
window.addEventListener("pagehide",()=>{ if(state && activeSaveId) safeSetSave(); });
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden" && state && activeSaveId) safeSetSave(); });
document.addEventListener("DOMContentLoaded",init);
