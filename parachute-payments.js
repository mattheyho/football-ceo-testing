/* FOOTBALL CEO — PREMIER LEAGUE PARACHUTE PAYMENTS v0.24.34
   Club-owned relegation support for the Premier League -> Championship boundary.
   Entitlement is temporary operating revenue, follows the club rather than the CEO,
   stops on promotion, and is derived from the PL equal central distribution.
*/
(function(){
  const VERSION=1;
  const START_YEAR=2025;
  const PCTS=[0.55,0.45,0.20];
  // The playable Championship calendar has 39 Sunday operating cycles between
  // 1 August and the final regular-season weekend; spread support across those
  // cycles so there is no giant August cheque or material May true-up.
  const PAYMENT_WEEKS=39;
  const INITIAL_2025_PROMOTED_PL=new Set(['Leeds United','Burnley','Sunderland']);
  const initialLeagueByClub=new Map();
  const clubs=()=>typeof allWorldClubs==='function'?allWorldClubs():[...(globalThis.DB?.clubs||[]),...(globalThis.DB?.worldClubs||[])];
  clubs().forEach(c=>initialLeagueByClub.set(c.name,c.leagueId||c.divisionId||null));
  const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
  const currentSeasonYear=()=>Number(globalThis.state?.season?.year||START_YEAR);
  const clubLeague=club=>{
    try{const c=typeof worldClubByName==='function'?worldClubByName(club):clubs().find(x=>x.name===club);return c?.leagueId||c?.divisionId||null;}catch(e){return null;}
  };
  const plEqualShare=()=>{
    try{return Number(typeof leagueFinanceArchitecture==='function'?leagueFinanceArchitecture('premier-league')?.equalCentral:88_000_000)||88_000_000;}catch(e){return 88_000_000;}
  };
  const roundMoney=n=>Math.round((Number(n)||0)/50_000)*50_000;

  function ensureState(){
    if(typeof state==='undefined'||!state)return null;
    state.englishPyramidState=state.englishPyramidState||{};
    const s=state.englishPyramidState;
    s.parachuteVersion=VERSION;
    s.parachuteEntitlements=s.parachuteEntitlements||{};
    s.parachuteHistory=Array.isArray(s.parachuteHistory)?s.parachuteHistory:[];
    s.parachuteEvents=s.parachuteEvents||{};
    // v0.24.33 saves may already contain completed PL<->Championship movements.
    // Rebuild entitlement ownership once from that history so upgrading a save does
    // not silently erase parachute rights. Past seasons are not back-paid; the
    // current eligible season will simply true-up by its normal season settlement.
    if(Number(s.parachuteMigrationVersion||0)<VERSION){
      s.parachuteMigrationVersion=VERSION;
      const history=[...(s.movementHistory||[])].sort((a,b)=>(Number(a.seasonYear)||0)-(Number(b.seasonYear)||0));
      for(const m of history){
        const year=Number(m.seasonYear)||START_YEAR;
        for(const club of (m.promoted||[])){
          const e=s.parachuteEntitlements[club];if(e?.active){e.active=false;e.status='cancelled-promotion';e.cancelledSeasonYear=year;e.cancelledReason='promotion';}
        }
        for(const club of (m.relegated||[])){
          const plSeasons=spellLengthFromHistory(club,year,history),maxYears=plSeasons>=2?3:2,id=`${year}:${club}:pl-parachute`;
          const e={id,club,source:'Premier League',destination:'Championship',relegationSeasonYear:year,firstEligibleSeasonYear:year+1,sourcePLSeasons:plSeasons,maxYears,percentages:PCTS.slice(0,maxYears),status:'active',active:true,createdDate:m.date||null,payments:{},cancelledSeasonYear:null,cancelledReason:null,completedSeasonYear:null,migrated:true};
          s.parachuteEntitlements[club]=e;s.parachuteHistory.push(e);
        }
      }
      const now=currentSeasonYear();
      Object.values(s.parachuteEntitlements).forEach(e=>{if(e?.active&&now>e.firstEligibleSeasonYear+e.maxYears-1){e.active=false;e.status='completed';e.completedSeasonYear=e.firstEligibleSeasonYear+e.maxYears-1;}});
    }
    return s;
  }

  function snapshotState(){
    const s=ensureState();
    return s?clone({parachuteVersion:s.parachuteVersion,parachuteEntitlements:s.parachuteEntitlements,parachuteHistory:s.parachuteHistory,parachuteEvents:s.parachuteEvents}):null;
  }
  function restoreState(snapshot){
    const s=ensureState();if(!s||!snapshot)return false;
    s.parachuteVersion=snapshot.parachuteVersion||VERSION;
    s.parachuteEntitlements=clone(snapshot.parachuteEntitlements||{});
    s.parachuteHistory=clone(snapshot.parachuteHistory||[]);
    s.parachuteEvents=clone(snapshot.parachuteEvents||{});
    return true;
  }

  function spellLengthFromHistory(club,relegationSeasonYear,history=[]){
    const year=Number(relegationSeasonYear)||currentSeasonYear();
    const moves=(history||[]).filter(m=>Number(m.seasonYear)<year&&Array.isArray(m.promoted)&&Array.isArray(m.relegated));
    let latestPromotion=null,latestRelegation=null;
    for(const m of moves){
      if(m.promoted.includes(club))latestPromotion=Math.max(latestPromotion??-Infinity,Number(m.seasonYear));
      if(m.relegated.includes(club))latestRelegation=Math.max(latestRelegation??-Infinity,Number(m.seasonYear));
    }
    if(latestPromotion!=null&&(latestRelegation==null||latestPromotion>latestRelegation))return Math.max(1,year-latestPromotion);
    if(initialLeagueByClub.get(club)==='premier-league'){
      const initial=INITIAL_2025_PROMOTED_PL.has(club)?1:2;
      return Math.max(1,initial+Math.max(0,year-START_YEAR));
    }
    return 1;
  }
  function movementHistory(){return ensureState()?.movementHistory||[];}
  function premierLeagueSpellLengthBeforeRelegation(club,relegationSeasonYear){
    const year=Number(relegationSeasonYear)||currentSeasonYear();
    const moves=movementHistory();
    return spellLengthFromHistory(club,year,moves);
  }

  function createEntitlement(club,seasonYear,plSeasons=null){
    const s=ensureState();if(!s||!club)return null;
    const year=Number(seasonYear)||currentSeasonYear();
    const id=`${year}:${club}:pl-parachute`;
    if(s.parachuteEvents[id])return s.parachuteEntitlements[club]||s.parachuteHistory.find(x=>x.id===id)||null;
    plSeasons=Number(plSeasons)||premierLeagueSpellLengthBeforeRelegation(club,year);
    const maxYears=plSeasons>=2?3:2;
    const entitlement={
      id,club,source:'Premier League',destination:'Championship',relegationSeasonYear:year,firstEligibleSeasonYear:year+1,
      sourcePLSeasons:plSeasons,maxYears,percentages:PCTS.slice(0,maxYears),status:'active',active:true,createdDate:state.calendar?.date||null,
      payments:{},cancelledSeasonYear:null,cancelledReason:null,completedSeasonYear:null
    };
    const previous=s.parachuteEntitlements[club];
    if(previous?.active){previous.active=false;previous.status='superseded';previous.cancelledSeasonYear=year;previous.cancelledReason='new-relegation-entitlement';}
    s.parachuteEntitlements[club]=entitlement;s.parachuteHistory.push(entitlement);s.parachuteEvents[id]={type:'created',club,seasonYear:year,id};
    if(state.club===club&&typeof addNews==='function'){
      const schedule=entitlement.percentages.map((p,i)=>`Year ${i+1}: ${formatMoney(plEqualShare()*p)}`).join(' • ');
      addNews(`<strong>PARACHUTE PAYMENTS:</strong> Following relegation, ${club} are entitled to ${maxYears} season${maxYears===1?'':'s'} of Premier League parachute support. ${schedule}. Payments cease immediately if the club is promoted.`);
    }
    return entitlement;
  }

  function cancelEntitlement(club,seasonYear,reason='promotion'){
    const s=ensureState();if(!s||!club)return null;
    const year=Number(seasonYear)||currentSeasonYear(),e=s.parachuteEntitlements[club];
    const eventId=`${year}:${club}:cancel-parachute:${reason}`;
    if(s.parachuteEvents[eventId])return e||null;
    s.parachuteEvents[eventId]={type:'cancelled',club,seasonYear:year,reason};
    if(!e||!e.active)return e||null;
    e.active=false;e.status=reason==='promotion'?'cancelled-promotion':'cancelled';e.cancelledSeasonYear=year;e.cancelledReason=reason;
    if(state.club===club&&typeof addNews==='function'&&reason==='promotion')addNews(`<strong>PARACHUTE PAYMENTS:</strong> Promotion to the Premier League ends the club's remaining parachute-payment entitlement.`);
    return e;
  }

  function applyBoundaryMovement({year,promoted=[],relegated=[]}={}){
    const s=ensureState();if(!s)return null;
    const eventId=`${Number(year)||currentSeasonYear()}:pl-championship:parachutes`;
    if(s.parachuteEvents[eventId])return s.parachuteEvents[eventId];
    const result={type:'boundary',seasonYear:Number(year)||currentSeasonYear(),created:[],cancelled:[]};
    promoted.forEach(club=>{const e=cancelEntitlement(club,year,'promotion');if(e)result.cancelled.push(club);});
    relegated.forEach(club=>{const e=createEntitlement(club,year);if(e)result.created.push({club,id:e.id,maxYears:e.maxYears,sourcePLSeasons:e.sourcePLSeasons});});
    s.parachuteEvents[eventId]=result;return result;
  }

  function entitlementForClub(club){return ensureState()?.parachuteEntitlements?.[club]||null;}
  function entitlementYearForSeason(e,seasonYear){return e?Number(seasonYear)-Number(e.firstEligibleSeasonYear)+1:0;}
  function annualTargetForClub(club,seasonYear=currentSeasonYear()){
    const e=entitlementForClub(club);if(!e||!e.active)return 0;
    if(clubLeague(club)==='premier-league')return 0;
    const y=entitlementYearForSeason(e,Number(seasonYear));
    if(y>e.maxYears){e.active=false;e.status='completed';e.completedSeasonYear=e.firstEligibleSeasonYear+e.maxYears-1;return 0;}
    if(y<1)return 0;
    return roundMoney(plEqualShare()*(Number(e.percentages[y-1])||0));
  }
  function currentInfo(club=state?.club,seasonYear=currentSeasonYear()){
    const e=entitlementForClub(club);if(!e)return null;
    const y=entitlementYearForSeason(e,Number(seasonYear)),target=annualTargetForClub(club,seasonYear),payment=e.payments?.[String(seasonYear)]||{paid:0};
    const schedule=[];
    for(let i=0;i<e.maxYears;i++){
      const sy=e.firstEligibleSeasonYear+i,sTarget=roundMoney(plEqualShare()*e.percentages[i]);
      schedule.push({entitlementYear:i+1,seasonYear:sy,percent:e.percentages[i],target:sTarget,paid:Number(e.payments?.[String(sy)]?.paid)||0,status:!e.active&&sy>Number(e.cancelledSeasonYear||-Infinity)?'cancelled':sy<Number(seasonYear)?'past':sy===Number(seasonYear)?'current':'future'});
    }
    return {entitlement:e,entitlementYear:y,target,paid:Number(payment.paid)||0,remaining:Math.max(0,target-(Number(payment.paid)||0)),schedule,active:e.active&&target>0};
  }

  function processWeeklyUserRevenue(){
    if(typeof state==='undefined'||!state?.club)return {amount:0};
    const info=currentInfo(state.club);if(!info?.active||!info.target)return {amount:0,info};
    const e=info.entitlement,key=String(currentSeasonYear());e.payments=e.payments||{};
    const p=e.payments[key]||(e.payments[key]={seasonYear:currentSeasonYear(),entitlementYear:info.entitlementYear,target:info.target,paid:0,settled:false});
    p.target=info.target;
    const amount=Math.max(0,Math.min(info.target-(Number(p.paid)||0),Math.round(info.target/PAYMENT_WEEKS)));
    if(amount<=0)return {amount:0,info:currentInfo(state.club)};
    p.paid=(Number(p.paid)||0)+amount;p.lastPaidDate=state.calendar?.date||null;
    return {amount,info:currentInfo(state.club)};
  }

  function settleUserRevenue(){
    if(typeof state==='undefined'||!state?.club)return {amount:0};
    const info=currentInfo(state.club);if(!info?.active||!info.target)return {amount:0,info};
    const e=info.entitlement,key=String(currentSeasonYear());e.payments=e.payments||{};
    const p=e.payments[key]||(e.payments[key]={seasonYear:currentSeasonYear(),entitlementYear:info.entitlementYear,target:info.target,paid:0,settled:false});
    if(p.settled)return {amount:0,info:currentInfo(state.club)};
    const amount=Math.max(0,Math.round(info.target-(Number(p.paid)||0)));
    if(amount>0){p.paid=(Number(p.paid)||0)+amount;p.lastPaidDate=state.calendar?.date||null;}
    p.settled=true;p.settledDate=state.calendar?.date||null;
    if(info.entitlementYear>=e.maxYears){e.active=false;e.status='completed';e.completedSeasonYear=currentSeasonYear();}
    return {amount,info:currentInfo(state.club),settled:true};
  }

  function forecast(club=state?.club,seasonYear=currentSeasonYear()){
    const info=currentInfo(club,seasonYear);if(!info)return null;
    const current=info.schedule.find(x=>x.seasonYear===Number(seasonYear));
    const future=info.schedule.filter(x=>x.seasonYear>Number(seasonYear)&&x.status!=='cancelled');
    return {club,current,future,active:info.entitlement.active,status:info.entitlement.status,maxYears:info.entitlement.maxYears,sourcePLSeasons:info.entitlement.sourcePLSeasons};
  }

  function formatMoney(n){n=Math.abs(Number(n)||0);if(n>=1e6)return `£${(n/1e6).toFixed(n>=10e6?1:2)}m`;if(n>=1e3)return `£${Math.round(n/1e3)}k`;return `£${Math.round(n)}`;}

  globalThis.FootballCEOParachutePayments={VERSION,PCTS,PAYMENT_WEEKS,ensureState,snapshotState,restoreState,premierLeagueSpellLengthBeforeRelegation,createEntitlement,cancelEntitlement,applyBoundaryMovement,entitlementForClub,annualTargetForClub,currentInfo,processWeeklyUserRevenue,settleUserRevenue,forecast};
  globalThis.ensureParachutePaymentState=ensureState;
  globalThis.snapshotParachutePaymentState=snapshotState;
  globalThis.restoreParachutePaymentState=restoreState;
  globalThis.applyParachuteBoundaryMovement=applyBoundaryMovement;
  globalThis.parachuteEntitlementForClub=entitlementForClub;
  globalThis.currentParachuteAnnualForClub=annualTargetForClub;
  globalThis.currentParachutePaymentInfo=currentInfo;
  globalThis.processWeeklyParachuteRevenue=processWeeklyUserRevenue;
  globalThis.settleParachuteRevenue=settleUserRevenue;
  globalThis.parachutePaymentForecast=forecast;
})();
