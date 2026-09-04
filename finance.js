/* FOOTBALL CEO — CLUB FINANCE MODULE v0.24.34
   Division-aware club cash + CEO allocation architecture.
   state.budget / state.wageBudget remain compatibility mirrors for recruitment code.
   EFL central distributions use the 2024/25 pooled-payment benchmark; EFL merit-by-place is zero.
   Club-specific profiles are supplied by financial-profiles.js. Premier League parachute payments are supplied by parachute-payments.js. */
(function(){
  const ROUND=250000;
  const round250=n=>Math.round((Number(n)||0)/ROUND)*ROUND;
  const clampF=(v,a,b)=>Math.max(a,Math.min(b,v));

  const LEAGUE_FINANCE_ARCHITECTURE={
    'premier-league':{name:'Premier League',clubs:20,homeGames:19,budgetStep:5_000_000,cashSeedRate:.12,liquidityReserveRate:.06,operatingCostMultiplier:1.00,equalCentral:88_000_000,baseFacility:12_000_000,meritPerPlace:3_000_000,facilityPerPlace:550_000,provisional:false},
    'championship':{name:'Championship',clubs:24,homeGames:23,budgetStep:500_000,cashSeedRate:.05,liquidityReserveRate:.045,operatingCostMultiplier:.09,equalCentral:10_750_000,baseFacility:0,meritPerPlace:0,facilityPerPlace:0,provisional:false},
    'league-one':{name:'League One',clubs:24,homeGames:23,budgetStep:100_000,cashSeedRate:.04,liquidityReserveRate:.04,operatingCostMultiplier:.03,equalCentral:2_000_000,baseFacility:0,meritPerPlace:0,facilityPerPlace:0,provisional:false},
    'league-two':{name:'League Two',clubs:24,homeGames:23,budgetStep:50_000,cashSeedRate:.035,liquidityReserveRate:.035,operatingCostMultiplier:.02,equalCentral:1_500_000,baseFacility:0,meritPerPlace:0,facilityPerPlace:0,provisional:false}
  };
  function clubLeagueId(){
    if(state?.leagueId)return state.leagueId;
    try{const l=typeof leagueForClub==='function'?leagueForClub(state?.club):null;if(l?.id)return l.id;}catch(e){}
    try{const c=typeof byClub==='function'&&state?.club?byClub(state.club):null;if(c?.leagueId)return c.leagueId;}catch(e){}
    return 'premier-league';
  }
  function leagueFinanceArchitecture(id=clubLeagueId()){
    const base=LEAGUE_FINANCE_ARCHITECTURE[id]||LEAGUE_FINANCE_ARCHITECTURE['premier-league'];
    // Piece 9A owns competition shape; finance owns only monetary calibration.
    // Pull club/home-game counts from the shared division framework when present.
    const d=typeof englishCompetitionDefinition==='function'?englishCompetitionDefinition(id):null;
    return d?{...base,clubs:d.clubCount,homeGames:d.homeMatchesPerClub}:base;
  }
  function leagueRound(n,id=clubLeagueId()){const step=id==='premier-league'?250_000:id==='championship'?50_000:25_000;return Math.round((Number(n)||0)/step)*step;}
  window.currentUserLeagueId=clubLeagueId;
  window.leagueFinanceArchitecture=leagueFinanceArchitecture;
  window.playingBudgetAllocationStep=function(){return leagueFinanceArchitecture().budgetStep;};
  window.leagueOperatingCostMultiplier=function(){return leagueFinanceArchitecture().operatingCostMultiplier;};
  // Buildings do not become several times more expensive simply because the club
  // changes division. Facility quality + club scale now do the heavy lifting.
  // This helper remains for compatibility and represents only a modest standards uplift.
  window.leagueFacilityCostMultiplier=function(id=clubLeagueId()){return id==='premier-league'?1.08:id==='championship'?1:id==='league-one'?.92:.86;};
  // New appointments are priced at the market for the current level. Existing staff
  // are handled separately by applyStaffDivisionMovement so promotion does not instantly
  // rewrite an agreed contract to the full divisional market rate.
  window.leagueStaffSalaryMultiplier=function(id=clubLeagueId()){return id==='championship'?.55:id==='league-one'?.32:id==='league-two'?.24:1;};
  window.leagueHomeMatchCount=function(){return leagueFinanceArchitecture().homeGames;};
  const LEAGUE_RANK={'premier-league':1,'championship':2,'league-one':3,'league-two':4};
  window.applyStaffDivisionMovement=function(fromLeagueId,toLeagueId){
    if(!state?.staff||!fromLeagueId||!toLeagueId||fromLeagueId===toLeagueId)return {changed:false,multiplier:1};
    const from=LEAGUE_RANK[fromLeagueId]||2,to=LEAGUE_RANK[toLeagueId]||2;
    const promoted=to<from,relegated=to>from;
    const multiplier=promoted?1.20:relegated?.85:1;
    ['manager','dof','physio'].forEach(role=>{const person=state.staff?.[role];if(person?.wage)person.wage=Math.max(500,Math.round((person.wage*multiplier)/500)*500);});
    state.staffDivisionAdjustment={season:state.season?.label||null,fromLeagueId,toLeagueId,type:promoted?'promotion':relegated?'relegation':'movement',multiplier};
    return {changed:true,promoted,relegated,multiplier};
  };

  function profile(){
    if(typeof financialProfileForClub==='function' && state?.club) return financialProfileForClub(state.club);
    const c=typeof byClub==='function'&&state?.club?byClub(state.club):null;
    return {revenue:Math.round((150_000_000+Math.max(0,(c?.reputation||70)-70)*8_000_000)/1_000_000)*1_000_000,sponsorBaseline:14_000_000,startingRatio:.65};
  }
  window.divisionAdjustedFootballRevenueTarget=function(club=state?.club){
    if(!club)return 0;
    const p=typeof financialProfileForClub==='function'?financialProfileForClub(club):(club===state?.club?profile():null),base=Math.max(0,Number(p?.revenue)||0);
    const current=(()=>{try{return (typeof leagueForClub==='function'?leagueForClub(club)?.id:null)||(typeof worldClubByName==='function'?worldClubByName(club)?.leagueId:null)||p?.leagueId||'premier-league';}catch(e){return p?.leagueId||'premier-league';}})();
    const original=p?.leagueId||current;if(current===original)return base;
    const c=typeof byClub==='function'?byClub(club):null,rep=Number(c?.reputation||70);
    if(original==='premier-league'&&current==='championship'){
      // Relegation removes most PL broadcast exposure but large brands retain more
      // commercial/matchday income. Parachute support is added separately.
      const brand=clampF((rep-65)/35,0,1),retention=.28+brand*.08;
      let target=base*retention;
      const e=typeof parachuteEntitlementForClub==='function'?parachuteEntitlementForClub(club):null;
      if(e?.firstEligibleSeasonYear&&state?.season?.year){const years=Math.max(0,Number(state.season.year)-Number(e.firstEligibleSeasonYear));target*=Math.max(.85,1-years*.05);}
      return leagueRound(Math.max(35_000_000,target),'championship');
    }
    if(original==='championship'&&current==='premier-league'){
      // A promoted EFL club gains the PL central-distribution floor immediately,
      // while its own commercial scale remains much smaller than an established giant.
      return round250(Math.max(base*1.75,125_000_000+Math.max(0,rep-70)*2_000_000));
    }
    return base;
  };
  function expectedLeagueFinish(){
    if(!state?.club)return 10;
    const leagueId=clubLeagueId();
    let clubs=[];try{clubs=typeof clubsInLeague==='function'?clubsInLeague(leagueId):[];}catch(e){}
    if(!clubs.length&&typeof DB!=='undefined')clubs=DB.clubs||[];
    const ordered=[...clubs].sort((a,b)=>(b.reputation||70)-(a.reputation||70)),idx=ordered.findIndex(c=>c.name===state.club);return idx>=0?idx+1:Math.ceil((leagueFinanceArchitecture().clubs||20)/2);
  }
  function seasonKey(){ return state?.season?.label||null; }
  function today(){ return typeof currentGameDateISO==='function'?currentGameDateISO():(state?.calendar?.date||'2025-08-01'); }
  function addYears(dateISO,years){ const d=new Date(`${dateISO}T12:00:00Z`);d.setUTCFullYear(d.getUTCFullYear()+years);return d.toISOString().slice(0,10); }
  function seedCash(){
    const c=typeof byClub==='function'&&state?.club?byClub(state.club):null,p=profile(),arch=leagueFinanceArchitecture();
    if(Number.isFinite(Number(p?.startingCash)))return Math.round(Number(p.startingCash));
    const transfer=Number(state?.budget??c?.transferBudget??0),revenueSeed=Math.max(0,Number(p?.revenue)||0)*arch.cashSeedRate;
    const transferSeed=clubLeagueId()==='premier-league'?transfer*.80:0;
    return Math.max(0,leagueRound(Math.max(revenueSeed,transferSeed)));
  }

  window.ensureClubFinanceState=function(){
    if(!state) return null;
    if(!state.clubFinances){
      const cash=seedCash();
      state.clubFinances={version:3,cash,openingCash:cash,debts:[],ledger:[],transferPayables:[],transferReceivables:[],capitalSpentThisSeason:0,debtInterestThisSeason:0,debtPrincipalPaidThisSeason:0,seasonTicketCashThisSeason:0,ownerFundingThisSeason:0,ownerFootballFundingThisSeason:0,emergencyOwnerFundingThisSeason:0,acquisitionFeesThisSeason:0,workingCapitalDrawnThisSeason:0,lastDebtPaymentMonth:null,lastLiquidityWarningSeason:null,lastLiquidityWarningMonth:null,revenueModel:null,premierLeague:{},leagueDistributions:{},allocations:null,allocationHistory:[],seasonRevenue:{},seasonCosts:{}};
    }
    const f=state.clubFinances; f.version=3;
    if(!Array.isArray(f.debts))f.debts=[];if(!Array.isArray(f.ledger))f.ledger=[];if(!Array.isArray(f.transferPayables))f.transferPayables=[];if(!Array.isArray(f.transferReceivables))f.transferReceivables=[];
    if(!f.premierLeague)f.premierLeague={};if(!f.leagueDistributions)f.leagueDistributions={};if(!Array.isArray(f.allocationHistory))f.allocationHistory=[];if(!f.seasonRevenue)f.seasonRevenue={};if(!f.seasonCosts)f.seasonCosts={};
    ['capitalSpentThisSeason','debtInterestThisSeason','debtPrincipalPaidThisSeason','seasonTicketCashThisSeason','ownerFundingThisSeason','ownerFootballFundingThisSeason','emergencyOwnerFundingThisSeason','acquisitionFeesThisSeason','workingCapitalDrawnThisSeason'].forEach(k=>{if(f[k]==null)f[k]=0;});
    if(f.cash==null)f.cash=seedCash();if(f.openingCash==null)f.openingCash=f.cash;
    if(!f.allocations)f.allocations={transferRemaining:Math.max(0,Number(state.budget)||0),wageWeekly:Math.max(0,Number(state.wageBudget)||0),infrastructure:0,lastChangedDate:today()};
    if(f.allocations.transferRemaining==null)f.allocations.transferRemaining=Math.max(0,Number(state.budget)||0);
    if(f.allocations.wageWeekly==null)f.allocations.wageWeekly=Math.max(0,Number(state.wageBudget)||0);
    if(f.allocations.infrastructure==null)f.allocations.infrastructure=0;
    f.allocations.transferRemaining=Math.max(0,Number(state.budget??f.allocations.transferRemaining)||0);
    f.allocations.wageWeekly=Math.max(0,Number(state.wageBudget??f.allocations.wageWeekly)||0);
    if(!f.revenueModel) window.calibrateClubRevenueModel?.();
    return f;
  };
  window.clubCash=function(){return ensureClubFinanceState()?.cash||0;};
  window.totalClubDebt=function(){const f=ensureClubFinanceState();return (f?.debts||[]).filter(d=>d.status!=='paid').reduce((s,d)=>s+Math.max(0,Number(d.outstanding||0)),0);};
  window.recordClubCash=function(amount,description,category='operating',meta={}){
    const f=ensureClubFinanceState();if(!f)return 0;amount=Math.round(Number(amount)||0);f.cash=Math.round((f.cash||0)+amount);
    f.ledger.unshift({id:`cash-${Date.now()}-${Math.floor(Math.random()*10000)}`,date:today(),season:seasonKey(),amount,description,category,...meta});f.ledger=f.ledger.slice(0,500);return f.cash;
  };
  window.canClubAfford=function(amount){return clubCash()>=Math.max(0,Number(amount)||0);};
  window.spendClubCapital=function(amount,description,meta={}){amount=Math.max(0,Math.round(Number(amount)||0));if(!canClubAfford(amount))return false;const f=ensureClubFinanceState();recordClubCash(-amount,description,'capital',meta);f.capitalSpentThisSeason+=amount;return true;};

  window.clubFinanceAllocationStatus=function(){
    const f=ensureClubFinanceState(),a=f.allocations||{},transferRemaining=Math.max(0,Number(state.budget??a.transferRemaining)||0),infrastructure=Math.max(0,Number(a.infrastructure)||0),wageWeekly=Math.max(0,Number(state.wageBudget??a.wageWeekly)||0);
    const payroll=typeof currentClubWeeklyPlayerWages==='function'?currentClubWeeklyPlayerWages(state.club):0,committed12=typeof futureTransferCommitments==='function'?futureTransferCommitments(370):0;
    return {cash:clubCash(),transferRemaining,wageWeekly,currentWeeklyWages:payroll,wageHeadroom:Math.max(0,wageWeekly-payroll),infrastructure,committed12,unallocatedCash:clubCash()-transferRemaining-infrastructure-committed12};
  };
  window.setWageBudgetAllocation=function(weekly,{source='finance',notify=false}={}){
    const f=ensureClubFinanceState(),from=Math.max(0,Number(state.wageBudget??f.allocations.wageWeekly)||0),to=Math.max(0,Math.round(Number(weekly)||0));
    state.wageBudget=to;f.allocations.wageWeekly=to;f.allocations.lastChangedDate=today();f.allocationHistory.unshift({date:today(),season:seasonKey(),type:'wage',from,to,delta:to-from,source});f.allocationHistory=f.allocationHistory.slice(0,120);
    if(notify&&typeof addNews==='function')addNews(`WAGE ALLOCATION: You changed the weekly wage allocation from ${fm(from)} to ${fm(to)}.`);return clubFinanceAllocationStatus();
  };
  window.setInfrastructureBudgetAllocation=function(amount,{source='finance',notify=false}={}){
    const f=ensureClubFinanceState(),from=Math.max(0,Number(f.allocations.infrastructure)||0),to=Math.max(0,Math.round(Number(amount)||0));
    f.allocations.infrastructure=to;f.allocations.lastChangedDate=today();f.allocationHistory.unshift({date:today(),season:seasonKey(),type:'infrastructure',from,to,delta:to-from,source});f.allocationHistory=f.allocationHistory.slice(0,120);
    if(notify&&typeof addNews==='function')addNews(`INFRASTRUCTURE ALLOCATION: You changed the infrastructure allocation from ${fm(from)} to ${fm(to)}.`);return clubFinanceAllocationStatus();
  };

  /* -------------------------- Revenue model -------------------------- */
  window.leagueRevenueForFinish=function(finish=10,leagueId=clubLeagueId()){
    const arch=leagueFinanceArchitecture(leagueId),clubs=arch.clubs||20;finish=clampF(Math.round(Number(finish)||Math.ceil(clubs/2)),1,clubs);const placeWeight=clubs+1-finish,equalCentral=arch.equalCentral||0;
    const merit=leagueRound(placeWeight*(arch.meritPerPlace||0),leagueId),broadcastFacility=leagueRound((arch.baseFacility||0)+placeWeight*(arch.facilityPerPlace||0),leagueId);
    return {leagueId,leagueName:arch.name,finish,equalCentral,merit,broadcastFacility,total:equalCentral+merit+broadcastFacility,provisional:!!arch.provisional};
  };
  window.premierLeagueRevenueForFinish=function(finish=10){return leagueRevenueForFinish(finish,'premier-league');};
  window.calibrateClubRevenueModel=function(){
    if(!state)return null;
    const f=state.clubFinances||{},p=profile(),leagueId=clubLeagueId(),arch=leagueFinanceArchitecture(leagueId),expectedFinish=expectedLeagueFinish(),dist=leagueRevenueForFinish(expectedFinish,leagueId);
    let rawMatchday=0;
    state._calibratingRevenueModel=true;
    try{if(typeof projectedMatchday==='function'){const md=projectedMatchday();rawMatchday=(md.unscaledAccountingRevenue??md.accountingRevenue??md.revenue??0)*(arch.homeGames||19);}}catch(e){}finally{state._calibratingRevenueModel=false;}
    const totalRevenue=Math.max(0,Number(typeof divisionAdjustedFootballRevenueTarget==='function'?divisionAdjustedFootballRevenueTarget(state.club):p.revenue)||0),sponsor=Math.max(0,Number(typeof commercialSponsorBenchmark==='function'?commercialSponsorBenchmark(state.club):p.sponsorBaseline)||0),availableAfterCentral=Math.max(0,totalRevenue-dist.total-sponsor);
    // Keep a meaningful commercial/retail stream even for clubs with large grounds.
    // Matchday income can still outperform/underperform this baseline through pricing,
    // attendances and stadium growth; it simply no longer swamps the club profile at day one.
    const commercialFloor=Math.max(leagueId==='premier-league'?8_000_000:leagueId==='championship'?1_500_000:leagueId==='league-one'?350_000:200_000,totalRevenue*(leagueId==='premier-league'?.22:.20));
    const targetMatchday=Math.max(0,Math.min(rawMatchday,Math.max(0,availableAfterCentral-commercialFloor)));
    const commercialRetail=Math.max(0,leagueRound(availableAfterCentral-targetMatchday,leagueId));
    const matchdayScale=rawMatchday>0?clampF(targetMatchday/rawMatchday,.08,1):1;
    f.revenueModel={calibratedSeason:seasonKey(),leagueId,baseFootballRevenue:totalRevenue,expectedFinish,commercialRetailAnnual:commercialRetail,baselineSponsor:sponsor,baselineMatchday:targetMatchday,rawBaselineMatchday:rawMatchday,matchdayScale,europeanCompetitionAnnual:0,provisionalLeagueModel:!!arch.provisional};state.clubFinances=f;return f.revenueModel;
  };
  window.currentMatchdayRevenueScale=function(){if(state?._calibratingRevenueModel)return 1;const m=state?.clubFinances?.revenueModel;return clampF(Number(m?.matchdayScale??1),.08,1);};
  window.clubRevenueModel=function(){const f=ensureClubFinanceState();if(!f.revenueModel||f.revenueModel.leagueId!==clubLeagueId())calibrateClubRevenueModel();return f.revenueModel;};
  window.annualCommercialRetailRevenue=function(){
    const m=clubRevenueModel(),base=m?.commercialRetailAnnual||0,c=typeof byClub==='function'?byClub(state.club):null,startingRep=Number(c?.reputation||72),currentRep=typeof savedClubReputation==='function'?savedClubReputation():startingRep;
    const repFactor=clampF(1+(currentRep-startingRep)*.035,.72,1.60),supporterFactor=state.supporters?.demand&&typeof currentStadiumCapacity==='function'?clampF(.92+(state.supporters.demand/Math.max(1,currentStadiumCapacity()))*.055,.90,1.18):1;
    return leagueRound(base*repFactor*supporterFactor);
  };
  window.leagueDistributionSeasonState=function(){
    const f=ensureClubFinanceState(),key=seasonKey()||'season',leagueId=clubLeagueId(),id=`${key}:${leagueId}`,arch=leagueFinanceArchitecture(leagueId);
    if(!f.leagueDistributions[id])f.leagueDistributions[id]={season:key,leagueId,leagueName:arch.name,centralPaid:0,baseFacilityPaid:0,settled:false,settlement:null,equalCentralTarget:arch.equalCentral||0,baseFacilityTarget:arch.baseFacility||0,provisional:!!arch.provisional};
    return f.leagueDistributions[id];
  };
  window.premierLeagueSeasonState=function(){return leagueDistributionSeasonState();};
  window.processWeeklyCoreRevenue=function(){
    const f=ensureClubFinanceState(),ls=leagueDistributionSeasonState(),arch=leagueFinanceArchitecture(),commercial=annualCommercialRetailRevenue()/52,sponsor=state.sponsorship?Number(state.sponsorship.annualValue||0)/52:0,centralTarget=arch.equalCentral||0,facilityBase=arch.baseFacility||0;
    const central=ls.settled?0:Math.max(0,Math.min(centralTarget-ls.centralPaid,centralTarget/52)),baseFacility=ls.settled?0:Math.max(0,Math.min(facilityBase-ls.baseFacilityPaid,facilityBase/52));
    ls.centralPaid+=central;ls.baseFacilityPaid+=baseFacility;const leagueIncome=central+baseFacility,prefix=clubLeagueId();
    f.seasonRevenue.commercialRetail=(f.seasonRevenue.commercialRetail||0)+commercial;f.seasonRevenue.sponsorship=(f.seasonRevenue.sponsorship||0)+sponsor;f.seasonRevenue[`${prefix}Central`]=(f.seasonRevenue[`${prefix}Central`]||0)+central;f.seasonRevenue[`${prefix}Facility`]=(f.seasonRevenue[`${prefix}Facility`]||0)+baseFacility;
    return {commercial,sponsor,leagueIncome,central,baseFacility,leagueId:prefix,leagueName:arch.name,provisional:!!arch.provisional};
  };
  function ordinal(n){n=Number(n)||0;const j=n%10,k=n%100;return n+(j===1&&k!==11?'st':j===2&&k!==12?'nd':j===3&&k!==13?'rd':'th');}
  function fm(n){n=Math.abs(Number(n)||0);if(n>=1e9)return `£${(n/1e9).toFixed(2)}bn`;if(n>=1e6)return `£${(n/1e6).toFixed(n>=100e6?0:1)}m`;if(n>=1e3)return `£${Math.round(n/1e3)}k`;return `£${Math.round(n)}`;}
  window.settleLeagueRevenue=function(finish=null){
    const f=ensureClubFinanceState(),ls=leagueDistributionSeasonState(),leagueId=clubLeagueId(),arch=leagueFinanceArchitecture(leagueId);if(ls.settled)return ls.settlement;if(finish==null&&typeof seasonTableFinish==='function')finish=seasonTableFinish(state.club);const dist=leagueRevenueForFinish(finish||arch.clubs,leagueId);
    const centralTrueUp=Math.max(0,dist.equalCentral-(ls.centralPaid||0)),facilityTrueUp=Math.max(0,dist.broadcastFacility-(ls.baseFacilityPaid||0)),cashSettlement=leagueRound(centralTrueUp+facilityTrueUp+dist.merit);
    if(cashSettlement){recordClubCash(cashSettlement,`${arch.name} season distribution settlement`,'competition',{competition:arch.name,finish:dist.finish});if(state.monthlyFinance)state.monthlyFinance.leagueIncome=(state.monthlyFinance.leagueIncome||0)+cashSettlement;state.seasonPL=(state.seasonPL||0)+cashSettlement;}
    const prefix=leagueId;f.seasonRevenue[`${prefix}Central`]=(f.seasonRevenue[`${prefix}Central`]||0)+centralTrueUp;f.seasonRevenue[`${prefix}Facility`]=(f.seasonRevenue[`${prefix}Facility`]||0)+facilityTrueUp;f.seasonRevenue[`${prefix}Merit`]=(f.seasonRevenue[`${prefix}Merit`]||0)+dist.merit;
    ls.settled=true;ls.settlement={...dist,cashSettlement,settledDate:today()};
    if(typeof addNews==='function'){const meritText=dist.merit?` • Merit payment: ${fm(dist.merit)}`:'';addNews(`${arch.name.toUpperCase()} REVENUE — Final position: ${ordinal(dist.finish)}. Central distribution: ${fm(dist.equalCentral)}${meritText}${dist.broadcastFacility?` • Broadcast/facility: ${fm(dist.broadcastFacility)}`:''} • Total competition income: ${fm(dist.total)}.${arch.provisional?' (Interim model pending the club-finance audit.)':''}`);}
    return ls.settlement;
  };
  window.settlePremierLeagueRevenue=function(finish=null){return settleLeagueRevenue(finish);};
  window.coreFootballRevenueForSCR=function(){
    const commercial=annualCommercialRetailRevenue(),sponsor=Number(state.sponsorship?.annualValue??clubRevenueModel()?.baselineSponsor??0),arch=leagueFinanceArchitecture();let matchday=clubRevenueModel()?.baselineMatchday||0;try{if(typeof projectedMatchday==='function')matchday=(projectedMatchday().accountingRevenue??projectedMatchday().revenue??0)*(arch.homeGames||19);}catch(e){}
    let finish=expectedLeagueFinish();try{if(typeof seasonTableFinish==='function'&&state?.week>0)finish=seasonTableFinish(state.club)||finish;}catch(e){}const settled=leagueDistributionSeasonState()?.settlement,league=settled?.total||leagueRevenueForFinish(finish,clubLeagueId()).total,parachute=typeof currentParachuteAnnualForClub==='function'?currentParachuteAnnualForClub(state.club):0,europe=0;return Math.max(0,Math.round(commercial+sponsor+matchday+league+parachute+europe));
  };

  /* ---------------------- Transfer payment terms --------------------- */
  window.normaliseTransferPaymentTerms=function(fee,upfrontPercent=100,installmentYears=0,startDate=today()){
    fee=Math.max(0,round250(fee));upfrontPercent=clampF(Math.round(Number(upfrontPercent)||100),25,100);if(upfrontPercent>=100)installmentYears=0;else installmentYears=clampF(Math.round(Number(installmentYears)||1),1,3);
    let upfront=upfrontPercent>=100?fee:round250(fee*upfrontPercent/100);upfront=Math.min(fee,Math.max(0,upfront));let deferred=fee-upfront,installments=[];
    if(deferred>0&&installmentYears>0){
      // Avoid meaningless £0/£250k tails: use fewer years when the balance is small.
      installmentYears=Math.min(installmentYears,Math.max(1,Math.floor(deferred/250000)));
      let remaining=deferred;
      for(let y=1;y<=installmentYears;y++){
        const left=installmentYears-y+1;let amount=y===installmentYears?remaining:round250(remaining/left);amount=Math.max(250000,Math.min(remaining,amount));remaining-=amount;installments.push({dueDate:addYears(startDate,y),amount,status:'scheduled'});
      }
      deferred=installments.reduce((s,x)=>s+x.amount,0);
    }else{installmentYears=0;deferred=0;upfront=fee;installments=[];upfrontPercent=100;}
    return {fee,upfrontPercent,upfront,deferred,installmentYears,installments};
  };
  window.transferTermsSellerValue=function(terms){terms=terms||normaliseTransferPaymentTerms(0,100,0);let v=(terms.upfront||0)*1.04;(terms.installments||[]).forEach((x,i)=>v+=(x.amount||0)/Math.pow(1.08,i+1));return round250(v);};
  window.transferTermsBuyerCostValue=function(terms){terms=terms||normaliseTransferPaymentTerms(0,100,0);let v=(terms.upfront||0)*1.03;(terms.installments||[]).forEach((x,i)=>v+=(x.amount||0)/Math.pow(1.05,i+1));return round250(v);};
  window.headlineFeeForSellerValue=function(target,upfrontPercent=100,years=0){const probe=normaliseTransferPaymentTerms(10_000_000,upfrontPercent,years),ratio=transferTermsSellerValue(probe)/10_000_000||1;return Math.max(250000,round250(target/ratio));};
  window.headlineFeeForBuyerValue=function(target,upfrontPercent=100,years=0){const probe=normaliseTransferPaymentTerms(10_000_000,upfrontPercent,years),ratio=transferTermsBuyerCostValue(probe)/10_000_000||1;return Math.max(250000,round250(target/ratio));};
  window.transferTermsLabel=function(t){t=t||normaliseTransferPaymentTerms(0,100,0);if((t.upfrontPercent||100)>=100||!(t.installments||[]).length)return '100% paid upfront';return `${t.upfrontPercent}% upfront • ${t.installmentYears} annual instalment${t.installmentYears===1?'':'s'}`;};

  function addTransferSchedule(kind,player,club,terms){
    const f=ensureClubFinanceState(),arr=kind==='payable'?f.transferPayables:f.transferReceivables,items=(terms.installments||[]).filter(x=>x.amount>0).map(x=>({...x}));if(!items.length)return null;
    const entry={id:`${kind}-${Date.now()}-${Math.floor(Math.random()*10000)}`,kind,playerId:player?.id??null,playerName:player?.name||'Player',club,headlineFee:terms.fee,created:today(),remaining:items.reduce((s,x)=>s+x.amount,0),installments:items,status:'active'};arr.push(entry);return entry;
  }
  window.futureTransferCommitments=function(withinDays=null){const f=ensureClubFinanceState(),cut=withinDays==null?null:new Date(`${today()}T00:00:00Z`).getTime()+withinDays*86400000;return f.transferPayables.filter(e=>e.status==='active').reduce((s,e)=>s+e.installments.filter(i=>i.status==='scheduled'&&(cut==null||new Date(`${i.dueDate}T00:00:00Z`).getTime()<=cut)).reduce((a,i)=>a+i.amount,0),0);};
  window.futureTransferReceivables=function(withinDays=null){const f=ensureClubFinanceState(),cut=withinDays==null?null:new Date(`${today()}T00:00:00Z`).getTime()+withinDays*86400000;return f.transferReceivables.filter(e=>e.status==='active').reduce((s,e)=>s+e.installments.filter(i=>i.status==='scheduled'&&(cut==null||new Date(`${i.dueDate}T00:00:00Z`).getTime()<=cut)).reduce((a,i)=>a+i.amount,0),0);};
  window.transferScheduleDetails=function(kind='payable'){
    const f=ensureClubFinanceState(),arr=kind==='receivable'?f.transferReceivables:f.transferPayables;
    return (arr||[]).filter(e=>e.status==='active'&&e.installments?.some(i=>i.status==='scheduled')).map(e=>{
      const scheduled=(e.installments||[]).filter(i=>i.status==='scheduled').sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate)));
      return {...e,remaining:scheduled.reduce((sum,i)=>sum+(Number(i.amount)||0),0),nextDue:scheduled[0]?.dueDate||null,finalDue:scheduled[scheduled.length-1]?.dueDate||null,scheduled};
    }).sort((a,b)=>String(a.nextDue||'9999').localeCompare(String(b.nextDue||'9999')));
  };
  window.processDueTransferInstallments=function(dateISO=today()){
    const f=ensureClubFinanceState(),done=[];
    const run=(arr,sign,label)=>arr.forEach(e=>{if(e.status!=='active')return;e.installments.forEach(i=>{if(i.status==='scheduled'&&i.dueDate<=dateISO){i.status='paid';e.remaining=Math.max(0,(e.remaining||0)-i.amount);recordClubCash(sign*i.amount,`${label}: ${e.playerName}`,'transfer_installment',{scheduleId:e.id,playerId:e.playerId});if(state.monthlyFinance){if(sign<0)state.monthlyFinance.transferSpent=(state.monthlyFinance.transferSpent||0)+i.amount;else state.monthlyFinance.transferReceived=(state.monthlyFinance.transferReceived||0)+i.amount;}done.push({entry:e,installment:i});}});if(e.remaining<=0||e.installments.every(i=>i.status!=='scheduled')){e.remaining=0;e.status='complete';}});
    run(f.transferPayables,-1,'Transfer instalment paid');run(f.transferReceivables,+1,'Transfer instalment received');return done;
  };
  window.playerAcquisitionCost=function(fee){return Math.max(250000,round250(Math.max(0,Number(fee)||0)*.05));};
  window.postUserTransferPurchase=function(player,seller,terms){
    const f=ensureClubFinanceState(),agent=playerAcquisitionCost(terms.fee),cashDue=terms.upfront+agent;if(clubCash()<cashDue)return {ok:false,required:cashDue,cash:clubCash(),agent};
    recordClubCash(-terms.upfront,`Transfer fee paid upfront: ${player.name}`,'transfer',{playerId:player.id,seller});recordClubCash(-agent,`Player acquisition/agent costs: ${player.name}`,'player_acquisition',{playerId:player.id});f.acquisitionFeesThisSeason+=agent;f.seasonCosts.playerAcquisition=(f.seasonCosts.playerAcquisition||0)+agent;addTransferSchedule('payable',player,seller,terms);return {ok:true,upfront:terms.upfront,agent,schedule:terms.installments};
  };
  window.postUserTransferSale=function(player,buyer,terms){recordClubCash(terms.upfront,`Transfer fee received upfront: ${player.name}`,'transfer',{playerId:player.id,buyer});addTransferSchedule('receivable',player,buyer,terms);return {ok:true,upfront:terms.upfront,schedule:terms.installments};};

  /* -------------------- CEO resource / liquidity model -------------------- */
  window.clubFinancialDistressStatus=function(){
    const f=ensureClubFinanceState(),p=profile(),cash=clubCash(),arch=leagueFinanceArchitecture(),revenueBase=Math.max(0,Number(typeof divisionAdjustedFootballRevenueTarget==='function'?divisionAdjustedFootballRevenueTarget(state.club):p.revenue)||0),reserve=leagueRound(revenueBase*arch.liquidityReserveRate);
    const liquidityDebt=(f.debts||[]).filter(d=>d.status==='active'&&(d.kind==='working_capital'||d.kind==='emergency_refinance')).reduce((sum,d)=>sum+(d.outstanding||0),0),distressed=cash<reserve*.75||liquidityDebt>revenueBase*.05,severe=cash<0||liquidityDebt>revenueBase*.18;
    return {distressed,severe,cash,reserve,liquidityDebt};
  };
  window.ceoPlayingBudgetResources=function(){
    const f=ensureClubFinanceState(),cash=Math.max(0,clubCash()),p=profile(),arch=leagueFinanceArchitecture(),revenueBase=Math.max(0,Number(typeof divisionAdjustedFootballRevenueTarget==='function'?divisionAdjustedFootballRevenueTarget(state.club):p.revenue)||0),reserve=leagueRound(revenueBase*arch.liquidityReserveRate),payable12=futureTransferCommitments(370),receivable12=futureTransferReceivables(370);
    // Reserve is now a warning benchmark, not a hard CEO spending floor. The player
    // can allocate the club into a dangerous liquidity position if they choose.
    const selfFunded=Math.max(0,leagueRound(cash-payable12+receivable12*.65)),distress=clubFinancialDistressStatus();
    const revenue=revenueBase,profileFundingRate=typeof ownerFundingRate==='function'?ownerFundingRate(state.club):.075,ownerConfidence=Number(state.happiness?.owners??70),confidenceMultiplier=ownerConfidence>=60?1:ownerConfidence>=40?.65:.35;
    // Ownership determines willingness/capacity to add NEW equity only. It never
    // ring-fences existing club cash or vetoes CEO spending decisions.
    const normalOwnerFunding=leagueRound(Math.max(0,revenue*profileFundingRate*confidenceMultiplier)),ownerFundingUsed=Math.max(0,Number(f.ownerFootballFundingThisSeason)||0),ownerFunding=distress.distressed?0:Math.max(0,normalOwnerFunding-ownerFundingUsed),maxAllocation=Math.max(0,leagueRound(selfFunded+ownerFunding));
    return {cash,reserve,payable12,receivable12,selfFunded,ownerFunding,ownerFundingLimit:normalOwnerFunding,ownerFundingUsed,ownerFundingRate:profileFundingRate,maxAllocation,distressed:distress.distressed,severeDistress:distress.severe,liquidityDebt:distress.liquidityDebt};
  };
  window.commitOwnerFootballFunding=function(amount){const f=ensureClubFinanceState(),r=ceoPlayingBudgetResources(),allowed=Math.max(0,Math.min(round250(amount),r.ownerFunding));if(!allowed)return 0;recordClubCash(allowed,'Owner equity injection following CEO playing-budget allocation','owner_equity');f.ownerFundingThisSeason+=allowed;f.ownerFootballFundingThisSeason=(f.ownerFootballFundingThisSeason||0)+allowed;return allowed;};

  /* -------------------- Live CEO playing-budget allocation -------------------- */
  window.ensurePlayingBudgetState=function(){
    if(!state)return null;
    const key=seasonKey()||'season',spent=Math.max(0,Number(state.transferFinance?.spent)||0),remaining=Math.max(0,Number(state.budget)||0);
    if(!state.playingBudget||state.playingBudget.season!==key){
      const allocated=round250(spent+remaining);
      state.playingBudget={version:1,season:key,allocated,initialAllocated:allocated,lastChangedDate:today(),changes:[]};
    }
    const pb=state.playingBudget;if(!Array.isArray(pb.changes))pb.changes=[];if(pb.allocated==null)pb.allocated=round250(spent+remaining);if(pb.initialAllocated==null)pb.initialAllocated=pb.allocated;
    // Completed purchases are irreversible commitments. Never allow a stale save to report less allocation than already spent.
    if(pb.allocated<spent){pb.allocated=spent;state.budget=0;}
    return pb;
  };
  window.playingBudgetStatus=function(){
    const pb=ensurePlayingBudgetState(),spent=Math.max(0,Number(state.transferFinance?.spent)||0),remaining=Math.max(0,Number(state.budget)||0),resources=ceoPlayingBudgetResources();
    const currentTotal=Math.max(spent,round250(spent+remaining));
    if(pb&&Math.abs((pb.allocated||0)-currentTotal)>125000)pb.allocated=currentTotal;
    const sustainableTotal=Math.max(spent,leagueRound(spent+(resources.maxAllocation||0)));
    return {season:seasonKey(),allocated:currentTotal,spent,remaining,minAllocation:spent,sustainableTotal,sliderMax:Math.max(currentTotal,sustainableTotal),resources,distressed:resources.distressed};
  };
  window.setInitialPlayingBudgetAllocation=function(amount){
    amount=Math.max(0,leagueRound(amount));const pb=ensurePlayingBudgetState();if(!pb)return null;pb.season=seasonKey()||pb.season;pb.allocated=amount;pb.initialAllocated=amount;pb.lastChangedDate=today();pb.changes=[];state.budget=amount;const finance=ensureClubFinanceState();finance.allocations.transferRemaining=state.budget;finance.allocations.lastChangedDate=today();return playingBudgetStatus();
  };
  window.applyPlayingBudgetAllocation=function(amount,{notify=true,source='in-season'}={}){
    let st=playingBudgetStatus();if(!st)return {ok:false,reason:'No active career'};
    const step=playingBudgetAllocationStep(),spent=st.spent,current=st.allocated;
    let selected=Math.max(spent,spent+Math.round(((Number(amount)||spent)-spent)/step)*step);
    // If completed spend is between £5m steps, preserve it as the absolute floor.
    if(selected<spent)selected=spent;
    let desiredRemaining=Math.max(0,selected-spent),resources=ceoPlayingBudgetResources();
    if(desiredRemaining>resources.selfFunded){
      const needed=Math.max(0,desiredRemaining-resources.selfFunded);
      if(needed>0)commitOwnerFootballFunding(needed);
      resources=ceoPlayingBudgetResources();
    }
    const liveMax=Math.max(spent,leagueRound(spent+(resources.maxAllocation||0)));
    // A previously sanctioned allocation may sit above today's safe ceiling; it can be maintained or reduced, never increased further.
    const hardMax=Math.max(current,liveMax);
    selected=Math.min(selected,hardMax);
    if(selected>current&&selected>liveMax)selected=current;
    const delta=selected-current;
    state.budget=Math.max(0,selected-spent);
    const finance=ensureClubFinanceState();finance.allocations.transferRemaining=state.budget;finance.allocations.lastChangedDate=today();
    const pb=ensurePlayingBudgetState();pb.allocated=selected;pb.lastChangedDate=today();pb.changes.unshift({date:today(),season:seasonKey(),from:current,to:selected,delta,source});pb.changes=pb.changes.slice(0,80);
    const material=Math.abs(delta)>=Math.max(10_000_000,current*.15);
    if(notify&&material&&typeof addNews==='function'){
      const manager=state.staff?.manager?.name||'The manager';
      if(delta>0){
        if(typeof stakeholderDecision==='function')stakeholderDecision({manager:+2,owners:resources.distressed?-2:0},'CEO increased playing investment allocation',{notify:false});
        addNews(`PLAYING BUDGET: You increased the playing investment allocation by ${fm(delta)} to ${fm(selected)}. ${manager} has welcomed the additional recruitment flexibility.`);
      }else if(delta<0){
        const distress=clubFinancialDistressStatus();
        if(typeof stakeholderDecision==='function')stakeholderDecision({manager:distress.distressed?-1:-2,owners:distress.distressed?+2:+1},'CEO reduced playing investment allocation',{notify:false});
        addNews(`PLAYING BUDGET: You reduced the playing investment allocation by ${fm(Math.abs(delta))} to ${fm(selected)}. ${manager} ${distress.distressed?"accepts the need to protect the club's finances":"is disappointed that less funding is now available for incoming signings"}.`);
      }
    }
    return {ok:true,from:current,to:selected,delta,...playingBudgetStatus()};
  };
  window.protectClubLiquidity=function(reason='operating requirements'){
    const f=ensureClubFinanceState();if(f.cash>=0)return {ok:true,drawn:0,ownerEquity:0,cash:f.cash,distress:clubFinancialDistressStatus()};const month=String(today()).slice(0,7);
    if(f.lastLiquidityWarningMonth!==month){f.lastLiquidityWarningMonth=month;f.lastLiquidityWarningSeason=seasonKey();if(typeof addNews==='function')addNews(`FINANCIAL DISTRESS: Club cash has fallen below £0 after ${reason}. Payments and investment options may now be blocked. No automatic owner rescue has been applied.`);if(typeof stakeholderDecision==='function')stakeholderDecision({owners:-3},'Club cash fell below zero',{notify:false});}
    return {ok:false,drawn:0,ownerEquity:0,cash:f.cash,distress:clubFinancialDistressStatus()};
  };

  /* ---------------------------- Debt ---------------------------- */
  window.amortisingMonthlyPayment=function(principal,annualRate,termMonths){principal=Math.max(0,Number(principal)||0);termMonths=Math.max(1,Math.round(Number(termMonths)||1));const r=Math.max(0,Number(annualRate)||0)/12;if(!r)return principal/termMonths;return principal*r/(1-Math.pow(1+r,-termMonths));};
  window.addInfrastructureLoan=function({principal,annualRate,termMonths,label='Infrastructure loan',projectId=null,kind='infrastructure'}){const f=ensureClubFinanceState();principal=Math.max(0,Math.round(Number(principal)||0));if(!principal)return null;const debt={id:`debt-${Date.now()}-${Math.floor(Math.random()*10000)}`,label,projectId,kind,originalPrincipal:principal,outstanding:principal,annualRate:Number(annualRate)||0,termMonths:Math.max(1,Math.round(termMonths||120)),monthsPaid:0,monthlyPayment:Math.round(amortisingMonthlyPayment(principal,annualRate,termMonths)),started:today(),status:'active'};f.debts.push(debt);recordClubCash(principal,`${label} proceeds received`,'financing',{debtId:debt.id,projectId});return debt;};
  window.processMonthlyDebtPayments=function(dateISO){const f=ensureClubFinanceState();if(!f||!dateISO)return[];const monthKey=String(dateISO).slice(0,7);if(f.lastDebtPaymentMonth===monthKey)return[];f.lastDebtPaymentMonth=monthKey;const paid=[];(f.debts||[]).filter(d=>d.status==='active'&&d.outstanding>0).forEach(d=>{const monthlyRate=(Number(d.annualRate)||0)/12,interest=Math.round(d.outstanding*monthlyRate),scheduled=Math.min(Math.round(d.monthlyPayment||0),Math.round(d.outstanding+interest)),principal=Math.max(0,Math.min(d.outstanding,scheduled-interest)),total=Math.max(0,interest+principal);if(total<=0)return;recordClubCash(-total,`${d.label} monthly repayment`,'debt_service',{debtId:d.id,interest,principal});d.outstanding=Math.max(0,d.outstanding-principal);d.monthsPaid=(d.monthsPaid||0)+1;f.debtInterestThisSeason+=interest;f.debtPrincipalPaidThisSeason+=principal;f.seasonCosts.financeInterest=(f.seasonCosts.financeInterest||0)+interest;if(typeof state.seasonPL==='number')state.seasonPL-=interest;if(state.monthlyFinance){state.monthlyFinance.debtInterest=(state.monthlyFinance.debtInterest||0)+interest;state.monthlyFinance.debtPrincipal=(state.monthlyFinance.debtPrincipal||0)+principal;}if(d.outstanding<=1||d.monthsPaid>=d.termMonths){d.outstanding=0;d.status='paid';}paid.push({debt:d,total,interest,principal});});return paid;};

  window.clubFinanceSeasonOverview=function(){
    const f=ensureClubFinanceState(),revenue=f.seasonRevenue||{},costs=f.seasonCosts||{},season=seasonKey();
    const ledger=(f.ledger||[]).filter(x=>!season||x.season===season);
    const sum=(obj,keys)=>keys.reduce((t,k)=>t+(Number(obj?.[k])||0),0);
    const leagueIncome=Object.entries(revenue).reduce((t,[k,v])=>/(Central|Facility|Merit)$/.test(k)?t+(Number(v)||0):t,0);
    const sponsorship=Number(revenue.sponsorship)||0,commercial=Number(revenue.commercialRetail)||0,matchday=Number(revenue.matchday)||0,parachute=Number(revenue.parachutePayments)||0;
    const knownRevenueKeys=new Set(['sponsorship','commercialRetail','matchday','parachutePayments']);
    Object.keys(revenue).forEach(k=>{if(/(Central|Facility|Merit)$/.test(k))knownRevenueKeys.add(k);});
    let otherIncome=Object.entries(revenue).reduce((t,[k,v])=>knownRevenueKeys.has(k)?t:t+(Number(v)||0),0);
    const staffChanges=ledger.filter(x=>x.category==='staff'&&Number(x.amount)<0).reduce((t,x)=>t-Math.min(0,Number(x.amount)||0),0);
    const regulation=ledger.filter(x=>x.category==='regulatory'&&Number(x.amount)<0).reduce((t,x)=>t-Math.min(0,Number(x.amount)||0),0);
    const playerWages=Number(costs.playerWages)||0,staffWages=Number(costs.staffWages)||0,matchdayCosts=Number(costs.matchday)||0,financeInterest=Number(costs.financeInterest)||0;
    const operatingRecorded=Number(costs.operating)||0;
    const hasSplit=!!(Number.isFinite(Number(costs.clubOperations))&&Number.isFinite(Number(costs.facilities))&&(Number(costs.clubOperations)||Number(costs.facilities)));
    const facilities=hasSplit?Number(costs.facilities)||0:0;
    const clubOperations=hasSplit?(Number(costs.clubOperations)||0)+matchdayCosts:operatingRecorded+matchdayCosts;
    const knownIncome=leagueIncome+parachute+sponsorship+commercial+matchday+otherIncome;
    let knownCosts=playerWages+staffWages+clubOperations+facilities+financeInterest+staffChanges+regulation;
    const reportedPL=Number(state?.seasonPL)||0;
    const reconciliation=reportedPL-(knownIncome-knownCosts);
    let otherCosts=0;
    if(reconciliation>25000)otherIncome+=reconciliation;
    else if(reconciliation<-25000)otherCosts=-reconciliation;
    knownCosts+=otherCosts;
    const operatingIncome=knownIncome+Math.max(0,reconciliation>25000?reconciliation:0);
    const operatingCosts=knownCosts;

    const ledgerNet=(categories)=>ledger.filter(x=>categories.includes(x.category)).reduce((t,x)=>t+(Number(x.amount)||0),0);
    const transfers=ledgerNet(['transfer','transfer_installment']);
    const ownerFunding=ledgerNet(['owner_equity']);
    const borrowing=ledgerNet(['financing']);
    const capital=ledgerNet(['capital']);
    const debtService=ledgerNet(['debt_service']);
    const seasonTickets=ledgerNet(['season_tickets']);
    const acquisition=ledgerNet(['player_acquisition']);
    const cashMovement=(Number(f.cash)||0)-(Number(f.openingCash)||0);
    const captured=transfers+ownerFunding+borrowing+capital+debtService+seasonTickets+acquisition;
    const otherCash=cashMovement-captured;
    return {
      openingCash:Number(f.openingCash)||0,currentCash:Number(f.cash)||0,cashMovement,
      operatingPL:reportedPL,operatingIncome,operatingCosts,
      income:{league:leagueIncome,parachute,sponsorship,commercial,matchday,other:otherIncome},
      costs:{playerWages,staffWages,clubOperations,facilities,financeInterest,staffChanges,regulation,other:otherCosts,hasSplit},
      cash:{transfers,ownerFunding,borrowing,capital,debtService,seasonTickets,acquisition,other:otherCash},
      debt:totalClubDebt(),capitalSpent:Number(f.capitalSpentThisSeason)||0
    };
  };
  window.activeDebtScheduleDetails=function(){
    const f=ensureClubFinanceState();
    return (f.debts||[]).filter(d=>d.status==='active'&&Number(d.outstanding)>0).map(d=>({
      id:d.id,label:d.label||'Club financing',kind:d.kind||'financing',outstanding:Number(d.outstanding)||0,
      originalPrincipal:Number(d.originalPrincipal)||0,annualRate:Number(d.annualRate)||0,monthlyPayment:Number(d.monthlyPayment)||0,
      termMonths:Number(d.termMonths)||0,monthsPaid:Number(d.monthsPaid)||0,remainingMonths:Math.max(0,(Number(d.termMonths)||0)-(Number(d.monthsPaid)||0))
    })).sort((a,b)=>b.outstanding-a.outstanding);
  };
  window.clubFinanceSeasonSnapshot=function(){const f=ensureClubFinanceState();return {openingCash:f.openingCash,closingCash:f.cash,leagueId:clubLeagueId(),allocations:{...(f.allocations||{})},revenue:{...f.seasonRevenue},costs:{...f.seasonCosts},ownerFunding:f.ownerFundingThisSeason||0,emergencyOwnerFunding:f.emergencyOwnerFundingThisSeason||0,workingCapitalDrawn:f.workingCapitalDrawnThisSeason||0,futureTransferCommitments:futureTransferCommitments(),futureTransferReceivables:futureTransferReceivables(),outstandingDebt:totalClubDebt()};};
  window.resetClubFinanceForNewSeason=function(){const f=ensureClubFinanceState();if(!f)return;f.openingCash=f.cash;f.capitalSpentThisSeason=0;f.debtInterestThisSeason=0;f.debtPrincipalPaidThisSeason=0;f.seasonTicketCashThisSeason=0;f.ownerFundingThisSeason=0;f.ownerFootballFundingThisSeason=0;f.emergencyOwnerFundingThisSeason=0;f.acquisitionFeesThisSeason=0;f.workingCapitalDrawnThisSeason=0;f.seasonRevenue={};f.seasonCosts={};calibrateClubRevenueModel();};
})();
