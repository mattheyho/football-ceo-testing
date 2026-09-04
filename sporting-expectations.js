/* FOOTBALL CEO — DYNAMIC SPORTING EXPECTATIONS v0.24.24
   Ownership pressure is a stable personality trait. This module calculates the
   reasonable sporting expectation for the club's current circumstances and lets
   the owner stakeholder react to performance relative to that expectation.

   Designed for the current PL build and the forthcoming playable EFL expansion.
   Promotion/relegation code can call recordLeagueMovement() when that system lands.
*/
(function(){
  const VERSION=1;
  const clampE=(v,a,b)=>Math.max(a,Math.min(b,v));
  const LEAGUE_RULES={
    'premier-league':{name:'Premier League',clubs:20,relegationPlaces:3,promotionPlaces:0},
    'championship':{name:'Championship',clubs:24,relegationPlaces:3,promotionPlaces:3,automatic:2,playoffFrom:3,playoffTo:6},
    'league-one':{name:'League One',clubs:24,relegationPlaces:4,promotionPlaces:3,automatic:2,playoffFrom:3,playoffTo:6},
    'league-two':{name:'League Two',clubs:24,relegationPlaces:0,promotionPlaces:4,automatic:3,playoffFrom:4,playoffTo:7}
  };

  function leagueRule(id){
    // Piece 9A makes the English pyramid definition canonical for all PL/EFL
    // competition shape. Keep the local fallback for old saves/test harnesses.
    if(typeof englishCompetitionDefinition==='function'){
      const d=englishCompetitionDefinition(id);
      if(d) return {name:d.name,clubs:d.clubCount,relegationPlaces:d.relegation?.count||0,promotionPlaces:d.promotion?.total||0,automatic:d.promotion?.automatic||0,playoffFrom:d.promotion?.playoff?.from||null,playoffTo:d.promotion?.playoff?.to||null,staticFloor:Boolean(d.relegation?.staticFloor)};
    }
    if(LEAGUE_RULES[id]) return LEAGUE_RULES[id];
    const l=typeof leagueById==='function'?leagueById(id):null;
    return {name:l?.name||String(id||'League'),clubs:l?.clubCount||20,relegationPlaces:Number(l?.relegationPlaces??3),promotionPlaces:l?.promotionRules?.total||0,automatic:l?.promotionRules?.automatic||0,playoffFrom:l?.promotionRules?.playoffFrom||null,playoffTo:l?.promotionRules?.playoffTo||null,staticFloor:Boolean(l?.staticBottom)};
  }

  function clubObj(name){
    if(typeof worldClubByName==='function') return worldClubByName(name);
    if(typeof byClub==='function') return byClub(name);
    const all=[...(globalThis.DB?.clubs||[]),...(globalThis.DB?.worldClubs||[])];
    return all.find(c=>c.name===name)||null;
  }

  function currentLeagueId(name,opts={}){
    if(opts.leagueId) return opts.leagueId;
    if(typeof state!=='undefined'&&state?.club===name&&state?.leagueId) return state.leagueId;
    const c=clubObj(name);
    return c?.leagueId||'premier-league';
  }

  function clubsForLeague(id,focusClub){
    let clubs=[];
    try{clubs=typeof clubsInLeague==='function'?clubsInLeague(id):[];}catch(e){}
    if(!clubs.length){
      clubs=[...(globalThis.DB?.clubs||[]),...(globalThis.DB?.worldClubs||[])].filter(c=>(c.leagueId||'premier-league')===id);
    }
    const focus=clubObj(focusClub);
    if(focus&&!clubs.some(c=>c.name===focusClub)) clubs=[...clubs,{...focus,leagueId:id}];
    return clubs;
  }

  function financialProfile(name){
    try{return typeof financialProfileForClub==='function'?financialProfileForClub(name):null;}catch(e){return null;}
  }

  function ownerProfile(name){
    try{return typeof ownershipProfileForClub==='function'?ownershipProfileForClub(name):null;}catch(e){return null;}
  }

  function playingStrength(c){
    if(!c) return 60;
    if(Number.isFinite(Number(c.strength))) return Number(c.strength);
    if(Number.isFinite(Number(c.standard))) return Number(c.standard);
    return Number(c.reputation)||60;
  }

  function financeScale(c){
    const p=financialProfile(c?.name);
    const payroll=Number(p?.playerPayrollWeekly||p?.wageBudgetWeekly||c?.wageBudget||c?.maxWage*22||0);
    const budget=Number(p?.transferAllocation||c?.transferBudget||0);
    // Log scaling keeps Premier League values from overwhelming lower divisions.
    return Math.log10(Math.max(1,payroll*52+budget))+3;
  }

  function ordinalRank(clubs,valueFn,focusName){
    const ordered=[...clubs].sort((a,b)=>valueFn(b)-valueFn(a));
    const idx=ordered.findIndex(c=>c.name===focusName);
    return idx>=0?idx+1:Math.ceil((clubs.length||20)/2);
  }

  function powerRank(name,leagueId){
    const clubs=clubsForLeague(leagueId,name);
    if(!clubs.length) return 10;
    const repRank=ordinalRank(clubs,c=>Number(c.reputation)||60,name);
    const squadRank=ordinalRank(clubs,playingStrength,name);
    const financeRank=ordinalRank(clubs,financeScale,name);
    const weighted=repRank*.30+squadRank*.45+financeRank*.25;
    return clampE(Math.round(weighted),1,clubs.length);
  }

  function movementContext(name,leagueId,opts={}){
    if(opts.newlyPromoted!=null || opts.newlyRelegated!=null){
      return {newlyPromoted:Boolean(opts.newlyPromoted),newlyRelegated:Boolean(opts.newlyRelegated),graceSeason:Number(opts.promotionGraceSeason||1)};
    }
    if(typeof state==='undefined'||state?.club!==name) return {newlyPromoted:false,newlyRelegated:false,graceSeason:0};
    const movement=state.sportingContext?.lastMovement||null;
    if(!movement) return {newlyPromoted:false,newlyRelegated:false,graceSeason:0};
    const seasonNo=Number(state.season?.number||1);
    const age=Math.max(0,seasonNo-Number(movement.seasonNumber||seasonNo));
    const promoted=movement.type==='promotion'&&movement.toLeagueId===leagueId;
    const relegated=movement.type==='relegation'&&movement.toLeagueId===leagueId;
    return {newlyPromoted:promoted&&age===0,newlyRelegated:relegated&&age===0,graceSeason:promoted&&age<=1?age+1:0,movement};
  }

  function previousSameLeagueFinish(name,leagueId){
    if(typeof state==='undefined'||state?.club!==name) return null;
    const seasons=state.careerHistory?.seasons||[];
    const prev=seasons[seasons.length-1];
    if(!prev) return null;
    const prevLeague=prev.leagueId||prev.finance?.leagueId||'premier-league';
    return prevLeague===leagueId&&Number.isFinite(Number(prev.leagueFinish))?Number(prev.leagueFinish):null;
  }

  function expectationBand(leagueId,target,context={}){
    const r=leagueRule(leagueId),survival=Math.max(1,r.clubs-r.relegationPlaces);
    if(context.newlyPromoted){
      return {key:'survival',label:'Fight for survival',shortLabel:'Survival',min:Math.max(1,survival-3),max:survival,description:'Newly promoted. Staying up would represent a successful first season at this level.'};
    }
    if(context.newlyRelegated && r.promotionPlaces){
      return {key:'promotion',label:'Challenge for promotion',shortLabel:'Promotion challenge',min:1,max:Math.max(r.playoffTo||6,r.promotionPlaces),description:'Recently relegated. Ownership expects the club to compete near the top of the division.'};
    }
    if(leagueId==='premier-league'){
      if(target<=2)return {key:'title',label:'Challenge for the title',shortLabel:'Title challenge',min:1,max:2,description:'The club is equipped to compete for the Premier League title.'};
      if(target<=4)return {key:'champions-league',label:'Qualify for the Champions League',shortLabel:'Top four',min:1,max:4,description:'Ownership expects a Champions League-level league campaign.'};
      if(target<=7)return {key:'europe',label:'Qualify for Europe',shortLabel:'Europe',min:5,max:7,description:'A European qualification place is the reasonable benchmark.'};
      if(target<=10)return {key:'top-half',label:'Finish in the top half',shortLabel:'Top half',min:8,max:10,description:'Ownership expects the club to finish in the Premier League top half.'};
      if(target<=14)return {key:'comfortable',label:'Establish a comfortable mid-table position',shortLabel:'Mid-table',min:10,max:14,description:'A stable season clear of the relegation fight is the benchmark.'};
      if(target<=survival)return {key:'survival',label:'Avoid relegation',shortLabel:'Survival',min:Math.max(1,survival-3),max:survival,description:'Premier League survival is the primary sporting expectation.'};
      return {key:'survival',label:'Fight for survival',shortLabel:'Survival',min:Math.max(1,survival-2),max:survival,description:'The squad is expected to be in a relegation battle; staying up would be a success.'};
    }
    if(r.promotionPlaces){
      if(target<=Math.max(1,r.automatic||2))return {key:'automatic-promotion',label:'Win automatic promotion',shortLabel:'Automatic promotion',min:1,max:r.automatic||2,description:'The club has the resources to expect automatic promotion.'};
      if(target<=Math.max(r.playoffTo||6,r.promotionPlaces))return {key:'playoffs',label:'Reach the play-offs',shortLabel:'Play-offs',min:1,max:r.playoffTo||6,description:'Ownership expects a promotion play-off place.'};
      if(target<=10)return {key:'promotion-challenge',label:'Challenge for the play-offs',shortLabel:'Play-off challenge',min:(r.playoffFrom||3),max:10,description:'The club should remain in the promotion conversation.'};
      if(target<=16)return {key:'top-half',label:'Finish in the top half',shortLabel:'Top half',min:8,max:16,description:'A solid upper/mid-table season is the benchmark.'};
      if(r.relegationPlaces===0)return {key:'competitive',label:'Build a competitive League Two side',shortLabel:'Competitive',min:17,max:r.clubs,description:'League Two is the bottom playable division. Ownership expects progress without a relegation threat.'};
      if(target<=survival)return {key:'survival',label:'Stay clear of relegation',shortLabel:'Stay up',min:Math.max(1,survival-4),max:survival,description:'Ownership expects the club to preserve its place in the division.'};
      return {key:'survival',label:'Fight for survival',shortLabel:'Survival',min:Math.max(1,survival-2),max:survival,description:'Resources point to a relegation fight; survival would be a successful season.'};
    }
    return {key:'competitive',label:'Remain competitive',shortLabel:'Competitive',min:1,max:r.clubs,description:'Ownership expects a competitive league campaign.'};
  }

  function calculate(name,opts={}){
    const leagueId=currentLeagueId(name,opts),r=leagueRule(leagueId),context=movementContext(name,leagueId,opts);
    const rawPower=powerRank(name,leagueId);
    const c=clubObj(name);
    let target=rawPower;
    // Existing PL targets are a useful calibration input, but not a permanent
    // identity. They are ignored once a club moves division.
    if(leagueId==='premier-league' && c?.playable!==false && Number.isFinite(Number(c?.target)) && !context.newlyPromoted){
      target=Math.round(rawPower*.55+Number(c.target)*.45);
    }
    const previous=previousSameLeagueFinish(name,leagueId);
    if(previous!=null&&!context.newlyPromoted&&!context.newlyRelegated) target=Math.round(target*.78+previous*.22);

    const survival=Math.max(1,r.clubs-r.relegationPlaces);
    if(context.newlyPromoted){
      // First year after promotion: ownership asks for survival, irrespective of
      // how demanding its personality is. Pressure affects the reaction to a miss.
      target=survival;
    }else if(context.graceSeason===2){
      // The second year still carries a smaller amount of earned goodwill.
      target=Math.min(survival,target+2);
    }
    if(context.newlyRelegated&&r.promotionPlaces) target=Math.min(target,Math.max(r.playoffTo||6,r.promotionPlaces));
    target=clampE(target,1,survival);

    const band=expectationBand(leagueId,target,context);
    const op=ownerProfile(name)||{};
    const pressure=clampE(Number(op.performancePressure??70),0,100);
    return {
      version:VERSION,club:name,leagueId,leagueName:r.name,clubCount:r.clubs,
      targetPosition:target,powerForecastPosition:rawPower,range:{min:band.min,max:band.max},
      key:band.key,label:band.label,shortLabel:band.shortLabel,description:band.description,
      ownerPressure:pressure,context,
      rationale:{squadAndResources:rawPower,previousFinish:previous,newlyPromoted:context.newlyPromoted,newlyRelegated:context.newlyRelegated,promotionGraceSeason:context.graceSeason||0}
    };
  }

  function ensureState(){
    if(typeof state==='undefined'||!state?.club) return null;
    state.sportingContext=state.sportingContext||{};
    const leagueId=currentLeagueId(state.club);
    const seasonKey=String(state.season?.year||state.season?.label||'2025');
    if(!state.sportingExpectation || state.sportingExpectation.seasonKey!==seasonKey || state.sportingExpectation.leagueId!==leagueId){
      state.sportingExpectation={...calculate(state.club),seasonKey,seasonNumber:Number(state.season?.number||1),setDate:state.calendar?.date||null};
    }
    state.sportingExpectationVersion=VERSION;
    return state.sportingExpectation;
  }

  function recordLeagueMovement(type,fromLeagueId,toLeagueId,extra={}){
    if(typeof state==='undefined'||!state) return null;
    state.sportingContext=state.sportingContext||{};
    const phase=String(state.season?.phase||'');
    const defaultSeasonNumber=Number(state.season?.number||1)+(['postseason','complete','offseason'].includes(phase)?1:0);
    const movement={type,fromLeagueId,toLeagueId,seasonNumber:defaultSeasonNumber,date:state.calendar?.date||null,...extra};
    state.sportingContext.lastMovement=movement;
    state.sportingExpectation=null;
    return movement;
  }

  function outcome(finish,expectation=ensureState(),performance={}){
    if(!expectation||!Number.isFinite(Number(finish))) return null;
    const pos=Number(finish),min=expectation.range.min,max=expectation.range.max;
    let key,label,baseDelta;
    if(pos===1 && expectation.targetPosition>2){key='exceptional';label='Exceptional achievement';baseDelta=7;}
    else if(pos<=Math.max(1,min-3)){key='exceptional';label='Far above expectations';baseDelta=6;}
    else if(pos<min){key='above';label='Above expectations';baseDelta=3;}
    else if(pos<=max){key='met';label='Expectation met';baseDelta=1;}
    else if(pos<=max+2){key='slight-miss';label='Slightly below expectations';baseDelta=-1;}
    else if(pos<=max+5){key='under';label='Below expectations';baseDelta=-3;}
    else {key='severe';label='Severe underperformance';baseDelta=-6;}

    const played=Number(performance.played??performance.p??0);
    const points=Number(performance.points??performance.pts??((Number(performance.w)||0)*3+(Number(performance.d)||0)));
    const ppg=played>0?points/played:null;
    if(pos>max && ppg!=null && played>=10 && ppg<0.65){
      key='collapse';label='Competitive collapse';baseDelta=-8;
    }

    const pressure=clampE(Number(expectation.ownerPressure??70),0,100);
    let delta=baseDelta;
    if(delta<0){
      const pressureMult=.65+(pressure/100)*.70;
      delta=-Math.max(1,Math.round(Math.abs(delta)*pressureMult));
      const grace=expectation.context?.newlyPromoted?0.45:expectation.context?.promotionGraceSeason===2?0.72:1;
      delta=-Math.max(1,Math.round(Math.abs(delta)*grace));
      // Promotion earns patience, not immunity. A side that is plainly
      // uncompetitive still creates a serious confidence problem.
      if(ppg!=null&&ppg<0.45&&played>=10) delta=Math.min(delta,-4);
      else if(ppg!=null&&ppg<0.65&&played>=10) delta=Math.min(delta,-3);
    }else if(delta>0){
      // Patient owners still appreciate success; high-pressure ownership gives
      // slightly less bonus for merely doing what was expected.
      if(key==='met'&&pressure>=90) delta=0;
      else if(key==='exceptional') delta=Math.min(8,delta+(pressure<=55?1:0));
    }
    return {key,label,finish:pos,baseDelta,delta,ppg,expectation};
  }

  function weeklyDriver(position,expectation=ensureState()){
    if(!expectation||!Number.isFinite(Number(position))) return null;
    const pos=Number(position),min=expectation.range.min,max=expectation.range.max,pressure=expectation.ownerPressure||70;
    if(pos<min) return {label:'League position above sporting expectation',value:pos<=Math.max(1,min-3)?3:2};
    if(pos<=max) return {label:'Meeting current sporting expectation',value:pressure>=90?0:1};
    const miss=pos-max;
    if(miss<=1) return {label:'Slightly below sporting expectation',value:pressure>=85?-2:pressure<=50?0:-1};
    if(miss<=3) return {label:'Below current sporting expectation',value:pressure>=85?-3:pressure<=50?-1:-2};
    return {label:'Severe sporting underperformance',value:-3};
  }

  globalThis.FootballCEOSportingExpectations={VERSION,leagueRule,calculate,ensureState,recordLeagueMovement,outcome,weeklyDriver,powerRank};
  if(typeof window!=='undefined'){
    window.sportingExpectationForClub=calculate;
    window.ensureSportingExpectationState=ensureState;
    window.currentSportingExpectation=ensureState;
    window.recordLeagueMovement=recordLeagueMovement;
    window.sportingExpectationOutcome=outcome;
    window.sportingExpectationWeeklyDriver=weeklyDriver;
  }
})();
