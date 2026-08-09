/* Football CEO core controller
   Current shared gameplay controller.
   Transfer/contract logic has now been extracted to transfers.js.
   Other systems will be moved out gradually and tested after each extraction.
*/

const STORAGE_KEY="footballCEO2526";

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
    if(!state.playerStats[p.id]) state.playerStats[p.id]={appearances:0,goals:0};
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
  squad(state.club).forEach(p=>{
    let score=teamMood;
    if(state.injuries?.[p.id]) score-=4;
    if(mgrChanges>=2) score-=8;
    const pos=clubLeaguePosition(state.club), target=byClub(state.club).target||10;
    if(state.week>=8 && p.overall>=82 && pos>=target+4) score-=7;
    if(score>=80) state.playerMorale[p.id]="Happy";
    else if(score>=58) state.playerMorale[p.id]="Content";
    else if(score>=38) state.playerMorale[p.id]="Unhappy";
    else state.playerMorale[p.id]="Wants to leave";
  });
}

function selectMatchSquad(){
  ensurePlayerState();
  const healthy=squad(state.club).filter(p=>!state.injuries?.[p.id]).sort((a,b)=>b.overall-a.overall);
  return healthy.slice(0,11);
}

function trackPlayerMatchStats(myGoals){
  ensurePlayerState();
  const starters=selectMatchSquad();
  starters.forEach(p=>state.playerStats[p.id].appearances+=1);

  const scorers=starters.filter(p=>!String(p.positions).includes("GK"));
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
      if(r<=0){ chosen=scorers[i]; break; }
    }
    state.playerStats[chosen.id].goals+=1;
  }
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
  q("profileJoined").textContent=p.joined || "Unknown";
  q("profileAge").textContent=p.age;
  q("profileNationality").textContent=p.nationality;
  const contract=state.playerContracts[p.id]||{wage:p.wage,endYear:p.contract};
  q("profileContract").textContent=contract.endYear;
  q("profilePosition").textContent=p.positions;
  q("profileValue").textContent=money(p.value);
  q("profileWage").textContent=money(contract.wage)+"/wk";
  q("profileAvailability").innerHTML=state.injuries?.[p.id]
    ? `<span class="bad">Injured — ${state.injuries[p.id].weeksLeft} week${state.injuries[p.id].weeksLeft===1?"":"s"} remaining</span>`
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
  // Existing injuries recover by one week.
  Object.keys(state.injuries).forEach(pid=>{
    state.injuries[pid].weeksLeft-=1;
    if(state.injuries[pid].weeksLeft<=0){
      const p=DB.players.find(x=>String(x.id)===String(pid));
      if(p) addNews(`${p.name} has returned to full training.`);
      delete state.injuries[pid];
    }
  });

  // New injuries. Approx base weekly probability per player ~0.55%.
  const healthy=squad(state.club).filter(p=>!state.injuries[p.id]);
  const chance=0.0055*physioInjuryChanceModifier();
  healthy.forEach(p=>{
    if(Math.random()<chance){
      const raw=injuryBaseDuration();
      const weeks=Math.max(1,Math.round(raw*physioRecoveryModifier()));
      state.injuries[p.id]={weeksLeft:weeks,totalWeeks:weeks};
      addNews(`${p.name} has suffered an injury and is expected to miss around ${weeks} week${weeks===1?"":"s"}.`);
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

  const facilityRating=state.trainingFacilities?.rating ?? Math.round(byClub(state.club).reputation-4);
  const squadStandard=Math.round(strength(state.club));
  const facilityGap=facilityRating-squadStandard;
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
const ordinal=n=>{
  const s=["th","st","nd","rd"],v=n%100;
  return n+(s[(v-20)%10]||s[v]||s[0]);
};

function generateFixtures(names){
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
  return [...rounds,...second].map((games,i)=>({week:i+1,games}));
}

function blankTable(){
  const table={};
  DB.clubs.forEach(c=>table[c.name]={p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0});
  return table;
}

function createCareer(club){
  resetWorldDatabase();
  const c=byClub(club);
  if(!c) return;
  state={
    club,
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
    trainingFacilities:{rating:clamp(Math.round(c.reputation-4),65,92)},
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
    matchdayStats:{revenue:0,attendance:0,homeGames:0},
    form:[],
    fixtures:generateFixtures(DB.clubs.map(x=>x.name)),
    table:blankTable(),
    results:{},
    news:[{week:0,text:`You have been appointed CEO of ${club}. ${c.manager} remains in charge of first-team football.`}]
  };
  // Build the initial recruitment picture before the first matchweek so the
  // manager and AI clubs enter the season with real squad priorities.
  if(typeof runAITransferReview==="function") runAITransferReview();
  if(typeof maybeGenerateManagerSquadRequest==="function") maybeGenerateManagerSquadRequest();
  enterGame();
  saveGame(false);
}

function enterGame(){
  ensureStaffState();
  ensurePlayerState();
  updateIndividualMorale();
  if(!state.ownerProfile) state.ownerProfile={lossTolerance:15_000_000};
  if(state.managerBacking==null) state.managerBacking=70;
  if(state.managerChangesThisSeason==null) state.managerChangesThisSeason=0;
  if(!state.trainingFacilities) state.trainingFacilities={rating:clamp(Math.round(byClub(state.club).reputation-4),65,92)};
  if(!state.transferSentiment) state.transferSentiment={fans:[],owners:[],players:[],manager:[]};
  if(!state.transferFinance) state.transferFinance={spent:0,received:0};
  if(!state.aiClubFinances) state.aiClubFinances={};
  if(typeof ensureAIClubFinances==="function") ensureAIClubFinances();
  if(!state.happinessDrivers) state.happinessDrivers={fans:[],owners:[],players:[],manager:[]};
  if(!state.pricing) state.pricing=defaultPricing(state.club);
  if(state.seasonTicketDiscount==null) state.seasonTicketDiscount=15;
  if(state.pricingLocked==null) state.pricingLocked=false;
  if(!state.matchdayStats) state.matchdayStats={revenue:0,attendance:0,homeGames:0};
  if(!state.clubHistory) state.clubHistory={recentFinishes:[byClub(state.club).target+1,byClub(state.club).target]};
  if(!state.sponsorOffers) state.sponsorOffers=[];
  q("startScreen").classList.add("hide");
  q("game").classList.remove("hide");
  showTab("dashboard");
  renderAll();
  if(!state.pricingLocked) openSeasonSetup();
}

let storageAvailable=true;

function safeGetSave(){
  try{
    return window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : null;
  }catch(e){
    storageAvailable=false;
    return null;
  }
}

function safeSetSave(){
  try{
    if(!window.localStorage) throw new Error("Storage unavailable");
    window.localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    storageAvailable=true;
    return true;
  }catch(e){
    storageAvailable=false;
    return false;
  }
}

function saveGame(show=true){
  const saved=safeSetSave();
  if(show){
    if(saved) addNews("Career saved locally on this device.");
    else addNews("Career is active in this session. This viewer blocks persistent browser storage, so the save cannot yet persist after closing the file.");
  }
}

function loadGame(){
  try{
    const raw=safeGetSave();
    if(!raw) return;
    state=JSON.parse(raw);
    resetWorldDatabase();
    enterGame();
  }catch(e){
    alert("The save could not be loaded.");
  }
}
function newCareer(){
  if(confirm("Start a new career? Your current save will be replaced.")){
    try{ window.localStorage?.removeItem(STORAGE_KEY); }catch(e){}
    state=null;
    q("game").classList.add("hide");
    q("startScreen").classList.remove("hide");
  }
}

function addNews(text){
  state.news.unshift({week:state.week,text});
  state.news=state.news.slice(0,12);
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

function renderAll(){
  const c=byClub(state.club);
  q("clubTitle").textContent=state.club;
  q("subTitle").textContent=`CEO • ${state.staff.manager.name} is manager • Season 2025/26 • Matchweek ${state.week}` + (storageAvailable ? "" : " • Session save only");
  renderDashboard();
  renderInbox();
  renderSquad();
  renderTable();
  renderFinances();
  renderMatchday();
  renderStaff();
}

function renderDashboard(){
  updateStakeholderDrivers();

  q("dashboardWeek").textContent=state.week===0?"Pre-season":`After MW ${state.week}`;

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
    if(state.week>=38){
      q("dashboardNextFixture").innerHTML=`<div class="fixture"><div class="teams">Season complete</div></div>`;
    }else{
      const r=state.fixtures[state.week];
      const g=r.games.find(x=>x.home===state.club||x.away===state.club);
      q("dashboardNextFixture").innerHTML=`<div class="fixture">
        <div class="muted small">MATCHWEEK ${r.week} • ${g.home===state.club?"HOME":"AWAY"}</div>
        <div class="teams">${g.home} <span class="muted">vs</span> ${g.away}</div>
      </div>`;
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
    ? display.map(n=>`<div class="inbox-preview-item"><span class="pill">MW ${n.week}</span>${n.text}</div>`).join("")
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
    return `<div class="news"><span class="pill">MW ${n.week}</span> &nbsp; ${n.text}${actions}</div>`;
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
      ? `<tr><th>Player</th><th>Pos</th><th>OVR</th><th>Morale</th><th class="num">Apps</th><th class="num">Goals</th></tr>`
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

function advanceMatchweek(){
  if(state.week>=38) return;
  const r=state.fixtures[state.week];
  r.games.forEach(g=>{
    const [hg,ag]=simulateGame(g.home,g.away);
    state.results[`${r.week}-${g.home}-${g.away}`]={hg,ag};
    applyResult(g.home,g.away,hg,ag);
  });

  const mine=r.games.find(g=>g.home===state.club||g.away===state.club);
  const res=state.results[`${r.week}-${mine.home}-${mine.away}`];
  const myGoals=mine.home===state.club?res.hg:res.ag;
  const opGoals=mine.home===state.club?res.ag:res.hg;
  const opp=mine.home===state.club?mine.away:mine.home;
  const outcome=myGoals>opGoals?"W":myGoals===opGoals?"D":"L";
  trackPlayerMatchStats(myGoals);
  state.form.push(outcome);
  state.form=state.form.slice(-5);



  // Weekly operating model: matchday pricing now drives home-game income.
  const playerWages=squad(state.club).reduce((s,p)=>s+(state.playerContracts?.[p.id]?.wage??p.wage??0),0);
  const staffWages=(state.staff.manager?.wage||0)+(state.staff.dof?.wage||0)+(state.staff.physio?.wage||0);
  const weeklyWages=playerWages+staffWages;
  let homeIncome=0;
  if(mine.home===state.club){
    const md=projectedMatchday();
    homeIncome=md.revenue;
    state.matchdayStats.revenue+=md.revenue;
    state.matchdayStats.attendance+=md.attendance;
    state.matchdayStats.homeGames+=1;

    const fanPriceEffect=pricingFanEffect();
    state.happiness.fans=clamp(state.happiness.fans+fanPriceEffect,0,100);

    addNews(`${md.attendance.toLocaleString("en-GB")} supporters attended the home match, generating ${money(md.revenue)} in matchday revenue.`);
  }
  const commercialIncome=byClub(state.club).reputation*65000;
  const sponsorIncome=state.sponsorship ? state.sponsorship.annualValue/38 : 0;
  state.seasonPL += homeIncome + commercialIncome + sponsorIncome - weeklyWages;

  applyStakeholderHappiness();
  updateIndividualMorale();
  processInjuries();
  maybeGenerateManagerSquadRequest();
  if(typeof processTransferWeek==="function") processTransferWeek();
  state.week++;
  addNews(`${state.club} ${myGoals}–${opGoals} ${opp}.`);
  saveGame(false);
  renderAll();
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
  q("pricingAdvice").textContent=(state.pricingLocked ? "Pricing is locked for the 2025/26 season. " : "")+advice;

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
  if(!state.sponsorOffers || state.sponsorOffers.length===0){
    state.sponsorOffers=generateSponsorOffers(state.club);
  }
  selectedSponsorId=state.sponsorship?.id || null;
  q("seasonSetup").classList.remove("hide");
  q("seasonTicketDiscount").value=String(state.seasonTicketDiscount||15);
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

  q("sponsorOptions").innerHTML=state.sponsorOffers.map(s=>`
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

  q("confirmSeasonSetup").disabled=!selectedSponsorId;
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
  const chosen=state.sponsorOffers.find(s=>s.id===selectedSponsorId);
  state.sponsorship={...chosen};

  if(chosen.fanOpposed){
    state.happiness.fans=clamp(state.happiness.fans-3,0,100);
    addNews(`Supporters have criticised the club's new sponsorship agreement with ${chosen.name}.`);
  }else{
    state.happiness.fans=clamp(state.happiness.fans+1,0,100);
    addNews(`${chosen.name} has been announced as the club's main sponsor.`);
  }

  // Small owner happiness boost for financially stronger deals.
  const avgOffer=state.sponsorOffers.reduce((s,x)=>s+x.annualValue,0)/state.sponsorOffers.length;
  if(chosen.annualValue>avgOffer*1.08) state.happiness.owners=clamp(state.happiness.owners+2,0,100);

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
  q("advanceBtn")?.addEventListener("click",advanceMatchweek);
  q("continueBtn")?.addEventListener("click",loadGame);
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
  q("closePlayerModal")?.addEventListener("click",closePlayerProfile);
  q("playerModal")?.addEventListener("click",e=>{if(e.target===q("playerModal")) closePlayerProfile();});
  q("negotiateContractBtn")?.addEventListener("click",e=>beginContractNegotiation(e.currentTarget.dataset.playerId));
  q("submitContractOfferBtn")?.addEventListener("click",submitContractOffer);
  q("cancelContractBtn")?.addEventListener("click",()=>q("contractNegotiation")?.classList.add("hide"));
  q("transferListBtn")?.addEventListener("click",e=>toggleTransferList(e.currentTarget.dataset.playerId));
  q("loanListBtn")?.addEventListener("click",e=>toggleLoanList(e.currentTarget.dataset.playerId));
  if(safeGetSave()) q("continueBtn")?.classList.remove("hide");
}
document.addEventListener("DOMContentLoaded",init);
