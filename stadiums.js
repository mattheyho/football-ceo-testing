/* FOOTBALL CEO — STADIUM DEVELOPMENT MODULE v0.21
   Dynamic stadiums, capacity pressure, supporter consultation, persistent plans,
   owner funding, planning, financing, construction and a hidden test lab. */
(function(){
  const PROFILES={
    'Arsenal':{attachment:78,tradition:78,localIdentity:86,expansionCeiling:68000,difficulty:82},
    'Aston Villa':{attachment:98,tradition:96,localIdentity:96,expansionCeiling:55000,difficulty:72},
    'Bournemouth':{attachment:50,tradition:48,localIdentity:82,expansionCeiling:18500,difficulty:82},
    'Brentford':{attachment:56,tradition:50,localIdentity:82,expansionCeiling:22000,difficulty:76},
    'Brighton':{attachment:62,tradition:58,localIdentity:80,expansionCeiling:38000,difficulty:70},
    'Burnley':{attachment:91,tradition:92,localIdentity:94,expansionCeiling:28000,difficulty:73},
    'Chelsea':{attachment:94,tradition:94,localIdentity:96,expansionCeiling:48000,difficulty:92},
    'Crystal Palace':{attachment:88,tradition:87,localIdentity:92,expansionCeiling:35000,difficulty:82},
    'Everton':{attachment:66,tradition:76,localIdentity:88,expansionCeiling:62000,difficulty:60},
    'Fulham':{attachment:96,tradition:95,localIdentity:96,expansionCeiling:34000,difficulty:88},
    'Leeds United':{attachment:92,tradition:92,localIdentity:94,expansionCeiling:55000,difficulty:67},
    'Liverpool':{attachment:98,tradition:98,localIdentity:98,expansionCeiling:68000,difficulty:88},
    'Manchester City':{attachment:61,tradition:62,localIdentity:82,expansionCeiling:65000,difficulty:60},
    'Manchester United':{attachment:96,tradition:97,localIdentity:96,expansionCeiling:85000,difficulty:75},
    'Newcastle United':{attachment:97,tradition:97,localIdentity:98,expansionCeiling:65000,difficulty:86},
    'Nottingham Forest':{attachment:92,tradition:91,localIdentity:94,expansionCeiling:40000,difficulty:78},
    'Sunderland':{attachment:75,tradition:80,localIdentity:93,expansionCeiling:58000,difficulty:62},
    'Tottenham Hotspur':{attachment:58,tradition:62,localIdentity:86,expansionCeiling:70000,difficulty:58},
    'West Ham United':{attachment:60,tradition:78,localIdentity:82,expansionCeiling:68000,difficulty:72},
    'Wolverhampton Wanderers':{attachment:91,tradition:91,localIdentity:94,expansionCeiling:42000,difficulty:78}
  };
  function clamp2(v,a,b){return Math.max(a,Math.min(b,v));}
  function daysBetween(a,b){return Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000);}
  function addDays(iso,days){const d=new Date(iso+'T12:00:00');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
  function baseStadium(){ return STADIUMS?.[state.club]||{name:`${state.club} Stadium`,capacity:30000}; }

  window.ensureDynamicStadiumState=function(){
    if(!state) return null;
    if(!state.stadium){
      const b=baseStadium();
      const p=PROFILES[state.club]||{attachment:70,tradition:70,localIdentity:82,expansionCeiling:Math.round(b.capacity*1.35),difficulty:70};
      state.stadium={
        name:b.name,capacity:b.capacity,operationalCapacity:b.capacity,
        originalName:b.name,originalCapacity:b.capacity,
        profile:{...p},project:null,events:[],fanSentiment:null,lastReviewSeason:null
      };
    }
    if(!state.stadium.profile) state.stadium.profile={...(PROFILES[state.club]||{})};
    if(!Array.isArray(state.stadium.events)) state.stadium.events=[];
    if(state.stadium.operationalCapacity==null) state.stadium.operationalCapacity=state.stadium.capacity;
    return state.stadium;
  };
  window.currentStadiumCapacity=function(){ return ensureDynamicStadiumState()?.capacity||0; };
  window.currentOperationalCapacity=function(){ return ensureDynamicStadiumState()?.operationalCapacity||currentStadiumCapacity(); };
  window.currentStadiumName=function(){ return ensureDynamicStadiumState()?.name||state.club; };

  window.calculateCapacityPressure=function(){
    ensureDynamicStadiumState(); if(typeof ensureTicketingState==='function') ensureTicketingState();
    const capacity=Math.max(1,currentStadiumCapacity());
    const stats=state.matchdayStats||{};
    const occupancy=stats.homeGames?clamp2((stats.attendance/stats.homeGames)/capacity,0,1.2):clamp2((state.supporters?.demand||0)/capacity,0,1.2);
    const st=state.seasonTickets||{};
    const stUtil=st.allocation?clamp2(st.sold/st.allocation,0,1):0;
    const waitRatio=clamp2((st.waitingList||0)/capacity,0,1.2);
    const demandRatio=clamp2((state.supporters?.demand||0)/capacity,0,1.8);
    const streak=clamp2(st.selloutStreak||0,0,4);
    return Math.round(clamp2(occupancy*32+stUtil*18+waitRatio*27+Math.max(0,demandRatio-.8)*36+streak*3,0,100));
  };
  window.capacityPressureLabel=function(score=calculateCapacityPressure()){
    return score>=85?'SEVERE':score>=68?'HIGH':score>=48?'MODERATE':'LOW';
  };

  function costPerSeat(type){ return type==='new'?6900:4300; }
  function makeReviewOptions(){
    const s=ensureDynamicStadiumState(),cap=s.capacity,ceiling=Math.max(cap,s.profile.expansionCeiling||Math.round(cap*1.35));
    const options=[];
    if(ceiling>cap+1200){
      const minor=Math.min(ceiling,Math.round((cap+Math.max(3000,cap*.22))/500)*500);
      const major=Math.min(ceiling,Math.round((cap+Math.max(6500,cap*.48))/500)*500);
      [minor,major].filter((x,i,a)=>x>cap&&a.indexOf(x)===i).forEach((newCap,i)=>{
        const seats=newCap-cap;
        const difficulty=1+(s.profile.difficulty||70)/260;
        const cost=Math.round(seats*costPerSeat('expand')*difficulty/250000)*250000;
        options.push({id:i?'major-expansion':'minor-expansion',type:'expand',label:i?'Major redevelopment':'Stadium expansion',capacity:newCap,cost,durationDays:i?620:330,local:true});
      });
    }
    const demand=Math.max(state.supporters?.demand||cap,cap);
    const newCap=Math.round(Math.max(cap*1.45,demand*1.28,cap+10000)/1000)*1000;
    const cost=Math.round((newCap*costPerSeat('new')+28_000_000)/250000)*250000;
    options.push({id:'new-stadium',type:'new',label:'New local stadium',capacity:newCap,cost,durationDays:900,local:true});
    options.push({id:'new-stadium-remote',type:'new',label:'New stadium outside current area',capacity:Math.round(newCap*1.08/1000)*1000,cost:Math.round(cost*.91/250000)*250000,durationDays:840,local:false});
    return options;
  }

  window.commissionStadiumReview=function(){
    const s=ensureDynamicStadiumState();
    if(s.project && !['completed','cancelled'].includes(s.project.status)) return s.project;
    s.project={
      id:`stadium-${Date.now()}`,status:'review',created:currentGameDateISO(),season:state.season.label,
      pressureAtReview:calculateCapacityPressure(),options:makeReviewOptions(),consultation:null,selectedOptionId:null,
      ownerAgreement:null,planning:null,financing:null,construction:null
    };
    s.lastReviewSeason=state.season.label;
    if(typeof addNews==='function') addNews(`The board has commissioned a stadium capacity review after assessing supporter demand and the club's long-term needs.`);
    return s.project;
  };

  function consultationSupport(option){
    const s=ensureDynamicStadiumState(),p=s.profile,pressure=calculateCapacityPressure();
    const capacity=s.capacity,demand=state.supporters?.demand||capacity,wait=state.seasonTickets?.waitingList||0;
    let support=28+pressure*.45+clamp2(wait/capacity,0,1)*24+clamp2((demand/capacity)-1,0,1)*20;
    if(option.type==='expand') support+=20+(p.attachment||70)*.12;
    else{
      support-= (p.attachment||70)*.52+(p.tradition||70)*.34;
      support+=Math.max(0,(pressure-70))*.35;
      if(option.local) support+=(p.localIdentity||80)*.12;
      else support-=(p.localIdentity||80)*.34;
    }
    const oversize=Math.max(0,option.capacity/Math.max(demand,1)-1.45);
    support-=oversize*32;
    return Math.round(clamp2(support,5,95));
  }

  window.holdStadiumFanConsultation=function(){
    const p=ensureDynamicStadiumState().project;if(!p) return null;
    p.consultation={date:currentGameDateISO(),results:{}};
    p.options.forEach(o=>p.consultation.results[o.id]=consultationSupport(o));
    p.status='consulted';
    if(typeof addNews==='function') addNews(`Supporter consultation on the club's stadium options has concluded. The findings are now available in Stadium Development.`);
    return p.consultation;
  };

  function ownerFundingFor(option){
    const happiness=Number(state.happiness?.owners||70);
    const cash=typeof clubCash==='function'?clubCash():0;
    const debt=typeof totalClubDebt==='function'?totalClubDebt():0;
    const ownerShare=clamp2(.12+(happiness-50)*.0025,0.08,.24);
    const ownerContribution=Math.round(option.cost*ownerShare/250000)*250000;
    const maxDebt=Math.max(0,Math.round(Math.min(option.cost*.72,Math.max(25_000_000,(byClub(state.club)?.reputation||70)*1_250_000-debt*.3))/250000)*250000);
    const clubContribution=Math.max(0,option.cost-ownerContribution-maxDebt);
    return {ownerContribution,maxDebt,clubContribution,availableCash:cash};
  }

  window.selectStadiumOption=function(optionId){
    const s=ensureDynamicStadiumState(),p=s.project;if(!p) return null;
    const option=p.options.find(o=>o.id===optionId);if(!option)return null;
    p.selectedOptionId=optionId;
    p.ownerAgreement={...ownerFundingFor(option),agreed:false,date:null};
    p.status='owner-negotiation';
    return option;
  };

  window.agreeStadiumPlanWithOwners=function(){
    const s=ensureDynamicStadiumState(),p=s.project;if(!p?.selectedOptionId)return false;
    const option=p.options.find(o=>o.id===p.selectedOptionId);if(!option)return false;
    p.ownerAgreement={...ownerFundingFor(option),agreed:true,date:currentGameDateISO()};
    p.status='board-approved';
    const support=p.consultation?.results?.[option.id]??50;
    const delta=support>=75?3:support>=60?1:support<30?-8:support<45?-4:0;
    if(delta&&typeof stakeholderChange==='function') stakeholderChange('fans',delta,`${support}% supporter backing for stadium plan`,{notify:true});
    if(option.type==='new'&&support<50) s.fanSentiment={label:'Opposition to stadium relocation',value:support<30?-6:-3,started:currentGameDateISO(),support};
    if(typeof addNews==='function') addNews(`The board has approved the ${option.label.toLowerCase()} plan for ${option.capacity.toLocaleString('en-GB')} seats at an estimated cost of ${typeof money==='function'?money(option.cost):option.cost}. The CEO can submit it for planning now or park the plan.`);
    return true;
  };

  window.submitStadiumPlanning=function(){
    const p=ensureDynamicStadiumState().project;if(!p||!['board-approved','deferred'].includes(p.status))return false;
    const option=p.options.find(o=>o.id===p.selectedOptionId);if(!option)return false;
    const decisionDate=addDays(currentGameDateISO(),option.type==='new'?120:75);
    p.planning={status:'pending',submitted:currentGameDateISO(),decisionDate,expires:null};
    p.status='planning';
    if(typeof addNews==='function') addNews(`Planning has been submitted for the ${option.label.toLowerCase()}. A decision is expected by ${decisionDate}.`);
    return true;
  };

  window.deferStadiumProject=function(){
    const p=ensureDynamicStadiumState().project;if(!p)return false;
    if(['construction','completed','cancelled'].includes(p.status))return false;
    p.status='deferred';p.deferredDate=currentGameDateISO();
    if(typeof addNews==='function') addNews(`The stadium development plan has been parked. It remains accessible and can be resumed when the club is ready to commit.`);
    return true;
  };

  function planningChance(option){
    const s=ensureDynamicStadiumState();
    let chance=option.type==='new'?.78:.91;
    chance-=(s.profile.difficulty||70)*.0012;
    if(option.local) chance+=.05; else chance-=.08;
    return clamp2(chance,.55,.95);
  }

  window.processStadiumDay=function(dateISO=currentGameDateISO()){
    const s=ensureDynamicStadiumState(),p=s.project;if(!p)return;
    if(['planning','deferred'].includes(p.status)&&p.planning?.status==='pending'&&dateISO>=p.planning.decisionDate){
      const option=p.options.find(o=>o.id===p.selectedOptionId);
      // Stable deterministic roll so save/reload does not reroll the decision.
      const seed=[...`${p.id}-${option.id}`].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,2166136261);
      const roll=(seed%10000)/10000;
      if(roll<planningChance(option)){
        p.planning.status='approved';p.planning.approved=dateISO;p.planning.expires=addDays(dateISO,1460);if(p.status!=='deferred')p.status='planning-approved';
        if(typeof addNews==='function') addNews(`Planning permission has been granted for the ${option.label.toLowerCase()}. The approved project can now be financed, started or left parked for a later season.`);
      }else{
        p.planning.status='rejected';p.status='board-approved';
        if(typeof addNews==='function') addNews(`Planning permission for the stadium proposal has been refused. The approved club plan remains on file, but a revised application will be required.`);
      }
    }
    if(p.planning?.status==='approved'&&p.planning.expires&&dateISO>p.planning.expires&&!['construction','completed'].includes(p.status)){
      p.planning.status='expired';p.status='board-approved';
      if(typeof addNews==='function') addNews(`Planning permission for the stadium project has expired. The agreed masterplan remains saved, but a fresh planning application is required.`);
    }
    if(p.status==='construction'&&p.construction){
      const elapsed=Math.max(0,daysBetween(p.construction.start,dateISO));
      p.construction.progress=clamp2(elapsed/p.construction.durationDays,0,1);
      if(dateISO>=p.construction.completionDate) completeStadiumProject();
    }
  };

  window.generateStadiumLoanOffers=function(){
    const p=ensureDynamicStadiumState().project;if(!p||!['planning-approved','deferred','financing'].includes(p.status))return [];
    if(p.planning?.status!=='approved') return [];
    const option=p.options.find(o=>o.id===p.selectedOptionId);if(!option)return [];
    const terms=p.ownerAgreement||ownerFundingFor(option);
    const required=Math.max(0,Math.min(terms.maxDebt,option.cost-terms.ownerContribution-terms.clubContribution));
    const rep=byClub(state.club)?.reputation||70;
    const existingDebt=typeof totalClubDebt==='function'?totalClubDebt():0;
    const risk=Math.max(0,(existingDebt/Math.max(50_000_000,rep*1_500_000))*.018);
    const base=clamp2(.062-(rep-70)*.00045+risk,.038,.095);
    p.financing={required,generated:currentGameDateISO(),offers:[
      {id:'loan-10',principal:required,termMonths:120,annualRate:Number((base-.003).toFixed(4))},
      {id:'loan-15',principal:required,termMonths:180,annualRate:Number((base+.002).toFixed(4))},
      {id:'loan-20',principal:required,termMonths:240,annualRate:Number((base+.007).toFixed(4))}
    ]};
    p.status='financing';
    return p.financing.offers;
  };

  window.acceptStadiumLoanOffer=function(offerId){
    const p=ensureDynamicStadiumState().project;if(!p?.financing)return false;
    const offer=p.financing.offers.find(x=>x.id===offerId);if(!offer)return false;
    // This is a committed facility, not a cash drawdown. Debt and repayments
    // begin only when the CEO actually starts construction.
    p.financing.acceptedOfferId=offerId;
    p.financing.acceptedTerms={...offer};
    p.financing.loan=null;
    p.status='ready';
    if(typeof addNews==='function') addNews(`Financing has been agreed for the stadium project. The facility will be drawn when construction starts, so no interest is due while the project remains parked.`);
    return true;
  };

  window.startStadiumConstruction=function(){
    const s=ensureDynamicStadiumState(),p=s.project;if(!p||!['ready','deferred'].includes(p.status))return false;
    const option=p.options.find(o=>o.id===p.selectedOptionId);if(!option)return false;
    if(!p.financing && (p.ownerAgreement?.maxDebt||0)>0) return false;
    const owner=p.ownerAgreement?.ownerContribution||0;
    const accepted=p.financing?.acceptedTerms||p.financing?.offers?.find(x=>x.id===p.financing?.acceptedOfferId)||null;
    const debt=accepted?.principal||0;
    const clubRequired=Math.max(0,option.cost-owner-debt);
    if(typeof canClubAfford==='function'&&!canClubAfford(clubRequired)){
      if(typeof addNews==='function') addNews(`Construction cannot start: the club needs ${money(clubRequired)} of its own cash but currently has ${money(clubCash())}.`);
      return false;
    }
    if(debt>0 && !p.financing.loan) p.financing.loan=addInfrastructureLoan({...accepted,label:'Stadium development loan',projectId:p.id});
    const projectCashPayment=Math.max(0,option.cost-owner);
    if(projectCashPayment>0&&typeof spendClubCapital==='function'){
      const paid=spendClubCapital(projectCashPayment,`${option.label} construction`,{projectId:p.id});
      if(!paid) return false;
    }
    p.construction={start:currentGameDateISO(),durationDays:option.durationDays,completionDate:addDays(currentGameDateISO(),option.durationDays),progress:0,clubContribution:clubRequired,ownerContribution:owner,debtFunding:debt};
    p.status='construction';
    if(option.type==='expand'){
      const reduction=Math.min(Math.round(s.capacity*.16),Math.max(900,Math.round((option.capacity-s.capacity)*.32)));
      const stFloor=Math.ceil((state.seasonTickets?.sold||0)*1.03);
      s.operationalCapacity=Math.max(stFloor,s.capacity-reduction);
    }
    if(typeof addNews==='function') addNews(`Construction has started on the ${option.label.toLowerCase()}. Completion is scheduled for ${p.construction.completionDate}.`);
    return true;
  };

  window.completeStadiumProject=function(){
    const s=ensureDynamicStadiumState(),p=s.project;if(!p||p.status!=='construction')return false;
    const option=p.options.find(o=>o.id===p.selectedOptionId);if(!option)return false;
    const oldName=s.name,oldCapacity=s.capacity;
    if(option.type==='new') s.name=`${state.club} Stadium`;
    s.capacity=option.capacity;s.operationalCapacity=option.capacity;
    p.status='completed';p.completed=currentGameDateISO();p.construction.progress=1;
    s.events.push({season:state.season.label,date:currentGameDateISO(),type:option.type==='new'?'new_stadium':'expansion',label:option.type==='new'?`${s.name} opened`:`${oldName} expanded`,fromCapacity:oldCapacity,toCapacity:s.capacity});
    if(s.fanSentiment&&option.type==='new') s.fanSentiment.value=Math.min(-1,s.fanSentiment.value+2);
    if(typeof stakeholderChange==='function') stakeholderChange('fans',option.type==='new'?2:3,option.type==='new'?'New stadium opened':'Stadium expansion completed',{notify:true});
    if(typeof addNews==='function') addNews(`${option.type==='new'?s.name:'The stadium redevelopment'} has opened with a capacity of ${s.capacity.toLocaleString('en-GB')}. Additional season tickets will be released during the next pre-season sales cycle.`);
    return true;
  };

  window.stadiumStakeholderDriver=function(){
    const s=ensureDynamicStadiumState();
    if(s.fanSentiment?.value) return {label:s.fanSentiment.label,value:s.fanSentiment.value};
    const pressure=calculateCapacityPressure();
    const p=s.project;
    if(pressure>=88 && (!p||['review','consulted','owner-negotiation','cancelled'].includes(p.status))) return {label:'Frustration over stadium capacity',value:-3};
    if(pressure>=78 && !p) return {label:'Stadium capacity concerns',value:-1};
    return null;
  };

  window.rollStadiumSeason=function(){
    const s=ensureDynamicStadiumState();
    if(s.fanSentiment?.value<0){
      // Time and successful operation slowly soften opposition; it never flips
      // positive merely because time passed.
      s.fanSentiment.value=Math.min(0,s.fanSentiment.value+1);
      if(s.fanSentiment.value===0) s.fanSentiment=null;
    }
    const p=s.project;
    if(p&&p.status==='deferred'){
      p.options.forEach(o=>o.cost=Math.round(o.cost*1.035/250000)*250000);
      if(p.ownerAgreement?.agreed){
        const selected=p.options.find(o=>o.id===p.selectedOptionId);
        p.ownerAgreement={...ownerFundingFor(selected),agreed:true,date:p.ownerAgreement.date};
      }
      if(p.financing && !p.financing.acceptedOfferId) p.financing=null;
    }
  };

  window.buildStadiumHistorySnapshot=function(){
    const s=ensureDynamicStadiumState();if(typeof ensureTicketingState==='function')ensureTicketingState();
    const stats=state.matchdayStats||{},avg=stats.homeGames?Math.round(stats.attendance/stats.homeGames):0;
    return {
      name:s.name,capacity:s.capacity,operationalCapacity:s.operationalCapacity,
      averageAttendance:avg,occupancy:s.capacity&&stats.homeGames?avg/s.capacity:0,
      seasonTicketAllocation:state.seasonTickets?.allocation||0,seasonTicketsSold:state.seasonTickets?.sold||0,
      waitingList:state.seasonTickets?.waitingList||0,supporterDemand:state.supporters?.demand||0,
      seasonTicketRevenue:state.seasonTickets?.revenue||0,matchdayRevenue:stats.revenue||0,
      averageTicketPrice:state.pricing?.ticket||0,averageSeasonTicketPrice:state.seasonTickets?.avgPrice||0,
      capacityPressure:calculateCapacityPressure()
    };
  };

  // Test helpers are deliberately exposed only when ?dev=stadium is present.
  window.stadiumDevMode=function(){ try{return new URLSearchParams(location.search).get('dev')==='stadium';}catch(e){return false;} };
  window.loadStadiumTestScenario=function(name){
    if(!stadiumDevMode()) return false;
    ensureDynamicStadiumState();ensureTicketingState();ensureClubFinanceState();
    const s=state.stadium,st=state.seasonTickets;
    if(name==='bournemouth-pressure'){
      s.capacity=11307;s.operationalCapacity=11307;s.name='Vitality Stadium';s.profile={...PROFILES['Bournemouth']};
      state.supporters.demand=17400;st.allocation=7915;st.sold=7915;st.previousSold=7915;st.waitingList=5100;st.selloutStreak=3;st.processed=true;
      state.matchdayStats={revenue:7_800_000,attendance:11_125*12,homeGames:12,seasonTicketRevenue:4_600_000};s.project=null;
    }else if(name==='villa-opposition'){
      s.capacity=42657;s.operationalCapacity=42657;s.name='Villa Park';s.profile={...PROFILES['Aston Villa']};
      state.supporters.demand=62500;st.allocation=Math.round(42657*.7);st.sold=st.allocation;st.previousSold=st.sold;st.waitingList=18200;st.selloutStreak=4;st.processed=true;
      state.matchdayStats={revenue:22_000_000,attendance:42100*15,homeGames:15,seasonTicketRevenue:17_000_000};s.project=null;
    }else if(name==='history-15'){
      if(!state.careerHistory)state.careerHistory={seasons:[]};
      state.careerHistory.seasons=[];
      let capacity=s.capacity,attendance=Math.round(capacity*.88),wait=300,demand=Math.round(capacity*.95);
      for(let i=0;i<15;i++){
        if(i===5){capacity=Math.round(capacity*1.55);wait=Math.round(wait*.28);}
        attendance=Math.min(capacity,Math.round(attendance*1.055));wait=Math.max(0,Math.round(wait*1.22+250));demand=Math.round(Math.max(attendance,demand*1.06));
        state.careerHistory.seasons.push({season:`${2025+i}/${String(26+i).slice(-2)}`,year:2025+i,stadium:{name:s.name,capacity,averageAttendance:attendance,occupancy:attendance/capacity,seasonTicketAllocation:Math.round(capacity*.7),seasonTicketsSold:Math.min(Math.round(capacity*.7),Math.round(demand*.6)),waitingList:wait,supporterDemand:demand,seasonTicketRevenue:0,matchdayRevenue:0,capacityPressure:70}});
      }
    }else if(name==='construction'){
      loadStadiumTestScenario(state.club==='Aston Villa'?'villa-opposition':'bournemouth-pressure');commissionStadiumReview();holdStadiumFanConsultation();selectStadiumOption(state.stadium.project.options.find(o=>o.type==='expand')?.id||'new-stadium');agreeStadiumPlanWithOwners();state.stadium.project.planning={status:'approved',approved:currentGameDateISO(),expires:addDays(currentGameDateISO(),1460)};state.stadium.project.status='planning-approved';generateStadiumLoanOffers();acceptStadiumLoanOffer(state.stadium.project.financing.offers[1].id);startStadiumConstruction();const p=state.stadium.project;p.construction.start=addDays(currentGameDateISO(),-Math.round(p.construction.durationDays*.5));p.construction.completionDate=addDays(p.construction.start,p.construction.durationDays);p.construction.progress=.5;
    }else if(name==='completion'){
      loadStadiumTestScenario('construction');const p=state.stadium.project;p.construction.completionDate=addDays(currentGameDateISO(),1);p.construction.start=addDays(p.construction.completionDate,-p.construction.durationDays);p.construction.progress=.99;
    }
    if(typeof calculateCapacityPressure==='function') state.supporters.capacityPressure=calculateCapacityPressure();
    if(typeof saveGame==='function')saveGame(false);if(typeof renderAll==='function')renderAll();if(typeof renderStadium==='function')renderStadium();
    return true;
  };

  window.runStadiumSelfTest=function(){
    if(!stadiumDevMode()||!state) return {passed:false,checks:[{name:'Dev mode',ok:false,detail:'Use ?dev=stadium'}]};
    const snapshot=JSON.stringify(state);
    const checks=[];
    const check=(name,ok,detail='')=>checks.push({name,ok:!!ok,detail});
    try{
      loadStadiumTestScenario('bournemouth-pressure');
      ensureDynamicStadiumState();ensureTicketingState();ensureClubFinanceState();
      check('ST allocation is 70%',state.seasonTickets.allocation===Math.round(currentStadiumCapacity()*.70),`${state.seasonTickets.allocation}/${currentStadiumCapacity()}`);
      const md=projectedMatchdayV21();
      check('STs create attendance floor',md.attendance>=Math.floor(state.seasonTickets.sold*.88),`${md.attendance} attendance from ${state.seasonTickets.sold} STs`);
      check('Attendance respects operational capacity',md.attendance<=currentOperationalCapacity(),`${md.attendance}/${currentOperationalCapacity()}`);
      const transferBudgetBefore=state.budget,cashBefore=clubCash();
      spendClubCapital(1000,'Self-test capital spend');
      check('Capital spend does not consume transfer budget',state.budget===transferBudgetBefore,`${state.budget}`);
      check('Capital spend moves club cash',clubCash()===cashBefore-1000,`${cashBefore} -> ${clubCash()}`);

      const project=commissionStadiumReview();
      check('Review creates development options',project.options.length>=3,`${project.options.length} options`);
      holdStadiumFanConsultation();
      check('Consultation saved',!!project.consultation&&Object.keys(project.consultation.results).length===project.options.length,'');
      const expand=project.options.find(o=>o.type==='expand')||project.options[0];
      selectStadiumOption(expand.id);agreeStadiumPlanWithOwners();
      check('Owner agreement persisted',project.ownerAgreement?.agreed===true,stageLabelSafe(project.status));
      deferStadiumProject();
      check('Project can be parked',project.status==='deferred','');
      project.status='board-approved';submitStadiumPlanning();
      check('Planning submission created',project.planning?.status==='pending',project.planning?.decisionDate||'');
      project.planning.status='approved';project.planning.approved=currentGameDateISO();project.planning.expires=addDays(currentGameDateISO(),1460);project.status='planning-approved';
      const offers=generateStadiumLoanOffers();
      check('Loan offers generated',offers.length===3,`${offers.length}`);
      check('Amortisation payment calculated',offers.every(o=>amortisingMonthlyPayment(o.principal,o.annualRate,o.termMonths)>=0),'');
      const debtBefore=totalClubDebt();acceptStadiumLoanOffer(offers[1].id);
      check('Parked finance does not draw debt',totalClubDebt()===debtBefore,`${debtBefore} -> ${totalClubDebt()}`);
      const oldCap=currentStadiumCapacity();
      const started=startStadiumConstruction();
      check('Construction can start when funded',started===true,project.status);
      check('Construction drawdown creates debt',totalClubDebt()>debtBefore,`${debtBefore} -> ${totalClubDebt()}`);
      check('Expansion operational capacity valid',currentOperationalCapacity()<=oldCap&&currentOperationalCapacity()>=state.seasonTickets.sold,`${currentOperationalCapacity()}`);
      project.construction.completionDate=currentGameDateISO();processStadiumDay(currentGameDateISO());
      check('Completion changes permanent capacity',currentStadiumCapacity()===expand.capacity,`${oldCap} -> ${currentStadiumCapacity()}`);
      const snap=buildStadiumHistorySnapshot();
      check('History snapshot stores waiting list',Number.isFinite(snap.waitingList),'');
      check('History snapshot stores attendance',Number.isFinite(snap.averageAttendance),'');
    }catch(err){ checks.push({name:'Unexpected exception',ok:false,detail:String(err?.stack||err)}); }
    const passed=checks.every(x=>x.ok);
    try{ state=JSON.parse(snapshot); if(typeof renderAll==='function')renderAll(); }catch(e){}
    return {passed,checks};
  };
  function stageLabelSafe(s){return String(s||'');}
})();
