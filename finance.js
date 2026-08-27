/* FOOTBALL CEO — CLUB FINANCE MODULE v0.23
   Unified cash, revenue, transfer-payment and infrastructure finance model.
   state.budget remains the CEO-set football/transfer allocation for compatibility. */
(function(){
  const ROUND=250000;
  const round250=n=>Math.round((Number(n)||0)/ROUND)*ROUND;
  const clampF=(v,a,b)=>Math.max(a,Math.min(b,v));

  function profile(){
    if(typeof financialProfileForClub==='function' && state?.club) return financialProfileForClub(state.club);
    const c=typeof byClub==='function'&&state?.club?byClub(state.club):null;
    return {revenue:Math.round((150_000_000+Math.max(0,(c?.reputation||70)-70)*8_000_000)/1_000_000)*1_000_000,sponsorBaseline:14_000_000,startingRatio:.65};
  }
  function expectedLeagueFinish(){
    if(typeof DB==='undefined'||!Array.isArray(DB.clubs)||!state?.club) return 10;
    const ordered=[...DB.clubs].sort((a,b)=>(b.reputation||70)-(a.reputation||70));
    const idx=ordered.findIndex(c=>c.name===state.club); return idx>=0?idx+1:10;
  }
  function seasonKey(){ return state?.season?.label||null; }
  function today(){ return typeof currentGameDateISO==='function'?currentGameDateISO():(state?.calendar?.date||'2025-08-01'); }
  function addYears(dateISO,years){ const d=new Date(`${dateISO}T12:00:00Z`);d.setUTCFullYear(d.getUTCFullYear()+years);return d.toISOString().slice(0,10); }
  function seedCash(){
    const c=typeof byClub==='function'&&state?.club?byClub(state.club):null;
    const transfer=Number(state?.budget??c?.transferBudget??40_000_000),p=profile();
    return round250(Math.max(25_000_000,transfer*1.30,p.revenue*.16));
  }

  window.ensureClubFinanceState=function(){
    if(!state) return null;
    if(!state.clubFinances){
      const cash=seedCash();
      state.clubFinances={version:2,cash,openingCash:cash,debts:[],ledger:[],transferPayables:[],transferReceivables:[],capitalSpentThisSeason:0,debtInterestThisSeason:0,debtPrincipalPaidThisSeason:0,seasonTicketCashThisSeason:0,ownerFundingThisSeason:0,ownerFootballFundingThisSeason:0,emergencyOwnerFundingThisSeason:0,acquisitionFeesThisSeason:0,workingCapitalDrawnThisSeason:0,lastDebtPaymentMonth:null,lastLiquidityWarningSeason:null,revenueModel:null,premierLeague:{},seasonRevenue:{},seasonCosts:{}};
    }
    const f=state.clubFinances; f.version=2;
    if(!Array.isArray(f.debts))f.debts=[];if(!Array.isArray(f.ledger))f.ledger=[];if(!Array.isArray(f.transferPayables))f.transferPayables=[];if(!Array.isArray(f.transferReceivables))f.transferReceivables=[];
    if(!f.premierLeague)f.premierLeague={};if(!f.seasonRevenue)f.seasonRevenue={};if(!f.seasonCosts)f.seasonCosts={};
    ['capitalSpentThisSeason','debtInterestThisSeason','debtPrincipalPaidThisSeason','seasonTicketCashThisSeason','ownerFundingThisSeason','ownerFootballFundingThisSeason','emergencyOwnerFundingThisSeason','acquisitionFeesThisSeason','workingCapitalDrawnThisSeason'].forEach(k=>{if(f[k]==null)f[k]=0;});
    if(f.cash==null)f.cash=seedCash();if(f.openingCash==null)f.openingCash=f.cash;
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

  /* -------------------------- Revenue model -------------------------- */
  window.premierLeagueRevenueForFinish=function(finish=10){
    finish=clampF(Math.round(Number(finish)||10),1,20);const placeWeight=21-finish,equalCentral=88_000_000;
    const merit=round250(placeWeight*3_000_000),broadcastFacility=round250(12_000_000+placeWeight*550_000);
    return {finish,equalCentral,merit,broadcastFacility,total:equalCentral+merit+broadcastFacility};
  };
  window.calibrateClubRevenueModel=function(){
    if(!state)return null;const f=state.clubFinances||{},p=profile(),expectedFinish=expectedLeagueFinish(),pl=premierLeagueRevenueForFinish(expectedFinish);let matchday=0;
    try{if(typeof projectedMatchday==='function')matchday=(projectedMatchday().accountingRevenue??projectedMatchday().revenue??0)*19;}catch(e){}
    const sponsor=p.sponsorBaseline||0,commercialRetail=Math.max(10_000_000,round250(p.revenue-pl.total-sponsor-matchday));
    f.revenueModel={calibratedSeason:seasonKey(),baseFootballRevenue:p.revenue,expectedFinish,commercialRetailAnnual:commercialRetail,baselineSponsor:sponsor,baselineMatchday:matchday,europeanCompetitionAnnual:0};state.clubFinances=f;return f.revenueModel;
  };
  window.clubRevenueModel=function(){const f=ensureClubFinanceState();if(!f.revenueModel)calibrateClubRevenueModel();return f.revenueModel;};
  window.annualCommercialRetailRevenue=function(){
    const m=clubRevenueModel(),base=m?.commercialRetailAnnual||25_000_000,c=typeof byClub==='function'?byClub(state.club):null,startingRep=Number(c?.reputation||72),currentRep=typeof savedClubReputation==='function'?savedClubReputation():startingRep;
    const repFactor=clampF(1+(currentRep-startingRep)*.035,.72,1.60),supporterFactor=state.supporters?.demand&&typeof currentStadiumCapacity==='function'?clampF(.92+(state.supporters.demand/Math.max(1,currentStadiumCapacity()))*.055,.90,1.18):1;
    return round250(base*repFactor*supporterFactor);
  };
  window.premierLeagueSeasonState=function(){const f=ensureClubFinanceState(),key=seasonKey()||'season';if(!f.premierLeague[key]){const base=premierLeagueRevenueForFinish(20);f.premierLeague[key]={season:key,centralPaid:0,baseFacilityPaid:0,settled:false,settlement:null,equalCentralTarget:base.equalCentral,baseFacilityTarget:12_000_000};}return f.premierLeague[key];};
  window.processWeeklyCoreRevenue=function(){
    const f=ensureClubFinanceState(),pl=premierLeagueSeasonState(),commercial=annualCommercialRetailRevenue()/52,sponsor=state.sponsorship?Number(state.sponsorship.annualValue||0)/52:0,centralTarget=88_000_000,facilityBase=12_000_000;
    const central=pl.settled?0:Math.max(0,Math.min(centralTarget-pl.centralPaid,centralTarget/52));
    const baseFacility=pl.settled?0:Math.max(0,Math.min(facilityBase-pl.baseFacilityPaid,facilityBase/52));
    pl.centralPaid+=central;pl.baseFacilityPaid+=baseFacility;const leagueIncome=central+baseFacility;
    f.seasonRevenue.commercialRetail=(f.seasonRevenue.commercialRetail||0)+commercial;f.seasonRevenue.sponsorship=(f.seasonRevenue.sponsorship||0)+sponsor;f.seasonRevenue.premierLeagueCentral=(f.seasonRevenue.premierLeagueCentral||0)+central;f.seasonRevenue.premierLeagueFacility=(f.seasonRevenue.premierLeagueFacility||0)+baseFacility;
    return {commercial,sponsor,leagueIncome,central,baseFacility};
  };
  function ordinal(n){n=Number(n)||0;const j=n%10,k=n%100;return n+(j===1&&k!==11?'st':j===2&&k!==12?'nd':j===3&&k!==13?'rd':'th');}
  function fm(n){n=Math.abs(Number(n)||0);if(n>=1e9)return `£${(n/1e9).toFixed(2)}bn`;if(n>=1e6)return `£${(n/1e6).toFixed(n>=100e6?0:1)}m`;if(n>=1e3)return `£${Math.round(n/1e3)}k`;return `£${Math.round(n)}`;}
  window.settlePremierLeagueRevenue=function(finish=null){
    const f=ensureClubFinanceState(),pl=premierLeagueSeasonState();if(pl.settled)return pl.settlement;if(finish==null&&typeof seasonTableFinish==='function')finish=seasonTableFinish(state.club);const dist=premierLeagueRevenueForFinish(finish||20);
    const centralTrueUp=Math.max(0,dist.equalCentral-(pl.centralPaid||0)),facilityTrueUp=Math.max(0,dist.broadcastFacility-(pl.baseFacilityPaid||0)),cashSettlement=round250(centralTrueUp+facilityTrueUp+dist.merit);
    if(cashSettlement){recordClubCash(cashSettlement,'Premier League season distribution settlement','competition',{competition:'Premier League',finish:dist.finish});if(state.monthlyFinance)state.monthlyFinance.leagueIncome=(state.monthlyFinance.leagueIncome||0)+cashSettlement;state.seasonPL=(state.seasonPL||0)+cashSettlement;}
    f.seasonRevenue.premierLeagueCentral=(f.seasonRevenue.premierLeagueCentral||0)+centralTrueUp;f.seasonRevenue.premierLeagueFacility=(f.seasonRevenue.premierLeagueFacility||0)+facilityTrueUp;f.seasonRevenue.premierLeagueMerit=(f.seasonRevenue.premierLeagueMerit||0)+dist.merit;
    const previous=(state.careerHistory?.seasons||[]).slice().reverse().find(s=>s.premierLeagueRevenue?.merit!=null),previousMerit=previous?.premierLeagueRevenue?.merit,previousFinish=previous?.leagueFinish;
    pl.settled=true;pl.settlement={...dist,cashSettlement,settledDate:today(),previousMerit,previousFinish};
    if(typeof addNews==='function'){let comparison='';if(previousMerit!=null&&previousFinish!=null){const delta=dist.merit-previousMerit;comparison=delta!==0?` Finishing ${ordinal(dist.finish)} generated ${fm(Math.abs(delta))} ${delta>0?'more':'less'} in merit payments than last season's ${ordinal(previousFinish)}-place finish.`:` Merit payments were unchanged from last season's ${ordinal(previousFinish)}-place finish.`;}addNews(`PREMIER LEAGUE REVENUE — Final position: ${ordinal(dist.finish)}. Equal central distribution: ${fm(dist.equalCentral)} • Merit payment: ${fm(dist.merit)} • Broadcast/facility payments: ${fm(dist.broadcastFacility)} • Total Premier League income: ${fm(dist.total)}.${comparison}`);}
    return pl.settlement;
  };
  window.coreFootballRevenueForSCR=function(){
    const commercial=annualCommercialRetailRevenue(),sponsor=Number(state.sponsorship?.annualValue??clubRevenueModel()?.baselineSponsor??0);let matchday=clubRevenueModel()?.baselineMatchday||0;try{if(typeof projectedMatchday==='function')matchday=(projectedMatchday().accountingRevenue??projectedMatchday().revenue??0)*19;}catch(e){}
    let finish=expectedLeagueFinish();try{if(typeof seasonTableFinish==='function'&&state?.week>0)finish=seasonTableFinish(state.club)||finish;}catch(e){}const settled=premierLeagueSeasonState()?.settlement,league=settled?.total||premierLeagueRevenueForFinish(finish).total,europe=0;return Math.max(20_000_000,Math.round(commercial+sponsor+matchday+league+europe));
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
    const f=ensureClubFinanceState(),p=profile(),cash=clubCash(),reserve=round250(Math.max(12_000_000,p.revenue*.06));
    const liquidityDebt=(f.debts||[]).filter(d=>d.status==='active'&&(d.kind==='working_capital'||d.kind==='emergency_refinance')).reduce((sum,d)=>sum+(d.outstanding||0),0);
    const distressed=cash<reserve*.75||liquidityDebt>p.revenue*.05;
    const severe=cash<0||liquidityDebt>p.revenue*.18;
    return {distressed,severe,cash,reserve,liquidityDebt};
  };
  window.ceoPlayingBudgetResources=function(){
    const f=ensureClubFinanceState(),cash=Math.max(0,clubCash()),p=profile(),reserve=round250(Math.max(12_000_000,p.revenue*.06)),payable12=futureTransferCommitments(370),receivable12=futureTransferReceivables(370),selfFunded=Math.max(0,round250(cash-reserve-payable12+receivable12*.65));
    const distress=clubFinancialDistressStatus();
    /* Emergency liquidity support is not a transfer kitty. Once the club is under
       liquidity pressure, new owner football funding is suspended until cash/debt recover. */
    const normalOwnerFunding=round250(Math.max(0,Math.min(p.revenue*.10,(state.happiness?.owners??70)>=60?p.revenue*.075:p.revenue*.035)));
    const ownerFundingUsed=Math.max(0,Number(f.ownerFootballFundingThisSeason)||0);
    const ownerFunding=distress.distressed?0:Math.max(0,normalOwnerFunding-ownerFundingUsed);
    const maxAllocation=Math.max(0,round250(selfFunded+ownerFunding));
    return {cash,reserve,payable12,receivable12,selfFunded,ownerFunding,ownerFundingLimit:normalOwnerFunding,ownerFundingUsed,maxAllocation,distressed:distress.distressed,severeDistress:distress.severe,liquidityDebt:distress.liquidityDebt};
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
    const sustainableTotal=Math.max(spent,round250(spent+(resources.maxAllocation||0)));
    return {season:seasonKey(),allocated:currentTotal,spent,remaining,minAllocation:spent,sustainableTotal,sliderMax:Math.max(currentTotal,sustainableTotal),resources,distressed:resources.distressed};
  };
  window.setInitialPlayingBudgetAllocation=function(amount){
    amount=Math.max(0,round250(amount));const pb=ensurePlayingBudgetState();if(!pb)return null;pb.season=seasonKey()||pb.season;pb.allocated=amount;pb.initialAllocated=amount;pb.lastChangedDate=today();pb.changes=[];state.budget=amount;return playingBudgetStatus();
  };
  window.applyPlayingBudgetAllocation=function(amount,{notify=true,source='in-season'}={}){
    let st=playingBudgetStatus();if(!st)return {ok:false,reason:'No active career'};
    const step=5_000_000,spent=st.spent,current=st.allocated;
    let selected=Math.max(spent,spent+Math.round(((Number(amount)||spent)-spent)/step)*step);
    // If completed spend is between £5m steps, preserve it as the absolute floor.
    if(selected<spent)selected=spent;
    let desiredRemaining=Math.max(0,selected-spent),resources=ceoPlayingBudgetResources();
    if(desiredRemaining>resources.selfFunded){
      const needed=Math.max(0,desiredRemaining-resources.selfFunded);
      if(needed>0)commitOwnerFootballFunding(needed);
      resources=ceoPlayingBudgetResources();
    }
    const liveMax=Math.max(spent,round250(spent+(resources.maxAllocation||0)));
    // A previously sanctioned allocation may sit above today's safe ceiling; it can be maintained or reduced, never increased further.
    const hardMax=Math.max(current,liveMax);
    selected=Math.min(selected,hardMax);
    if(selected>current&&selected>liveMax)selected=current;
    const delta=selected-current;
    state.budget=Math.max(0,selected-spent);
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
    const f=ensureClubFinanceState();
    if(f.cash>=0)return {ok:true,drawn:0,ownerEquity:0,cash:f.cash};
    const p=profile(),target=5_000_000;
    let need=round250(Math.abs(f.cash)+target),drawn=0,ownerEquity=0;

    // Tier 1: short-term working-capital facility, capped at 8% of annual revenue.
    const wcLimit=Math.max(10_000_000,round250(p.revenue*.08));
    const wcExisting=(f.debts||[]).filter(d=>d.status==='active'&&d.kind==='working_capital').reduce((s,d)=>s+(d.outstanding||0),0);
    const wcDraw=Math.min(need,Math.max(0,wcLimit-wcExisting));
    if(wcDraw>0){
      addInfrastructureLoan({principal:wcDraw,annualRate:.085,termMonths:24,label:'Working-capital facility',projectId:null,kind:'working_capital'});
      f.workingCapitalDrawnThisSeason+=wcDraw;drawn+=wcDraw;need=Math.max(0,round250(target-f.cash));
      if(typeof addNews==='function')addNews(`LIQUIDITY: The club drew ${fm(wcDraw)} from a short-term working-capital facility after ${reason}.`);
    }

    // Tier 2: emergency refinancing. This is explicit debt, not hidden negative cash.
    if(need>0){
      const refiLimit=Math.max(15_000_000,round250(p.revenue*.22));
      const refiExisting=(f.debts||[]).filter(d=>d.status==='active'&&d.kind==='emergency_refinance').reduce((s,d)=>s+(d.outstanding||0),0);
      const refiDraw=Math.min(need,Math.max(0,refiLimit-refiExisting));
      if(refiDraw>0){
        addInfrastructureLoan({principal:refiDraw,annualRate:.105,termMonths:60,label:'Emergency refinancing facility',projectId:null,kind:'emergency_refinance'});
        drawn+=refiDraw;need=Math.max(0,round250(target-f.cash));
        if(typeof addNews==='function')addNews(`FINANCIAL DISTRESS: The club arranged ${fm(refiDraw)} of emergency refinancing after its working-capital headroom was exhausted.`);
        if(typeof stakeholderDecision==='function')stakeholderDecision({owners:-3},'Emergency refinancing required',{notify:false});
      }
    }

    // Tier 3: owner rescue equity. The club cannot continue with impossible negative cash.
    // This is deliberately separate from owner football investment and hurts owner confidence.
    if(need>0){
      ownerEquity=need;
      recordClubCash(ownerEquity,'Emergency owner equity injection to restore liquidity','owner_rescue');
      f.ownerFundingThisSeason=(f.ownerFundingThisSeason||0)+ownerEquity;
      f.emergencyOwnerFundingThisSeason=(f.emergencyOwnerFundingThisSeason||0)+ownerEquity;
      if(typeof addNews==='function')addNews(`OWNER RESCUE: Ownership injected ${fm(ownerEquity)} of emergency equity to keep the club solvent. Playing-budget flexibility will remain restricted until finances recover.`);
      if(typeof stakeholderDecision==='function')stakeholderDecision({owners:-6},'Emergency owner rescue required',{notify:false});
    }

    f.lastLiquidityWarningSeason=seasonKey();
    return {ok:f.cash>=0,drawn,ownerEquity,cash:f.cash,distress:clubFinancialDistressStatus()};
  };

  /* ---------------------------- Debt ---------------------------- */
  window.amortisingMonthlyPayment=function(principal,annualRate,termMonths){principal=Math.max(0,Number(principal)||0);termMonths=Math.max(1,Math.round(Number(termMonths)||1));const r=Math.max(0,Number(annualRate)||0)/12;if(!r)return principal/termMonths;return principal*r/(1-Math.pow(1+r,-termMonths));};
  window.addInfrastructureLoan=function({principal,annualRate,termMonths,label='Infrastructure loan',projectId=null,kind='infrastructure'}){const f=ensureClubFinanceState();principal=Math.max(0,Math.round(Number(principal)||0));if(!principal)return null;const debt={id:`debt-${Date.now()}-${Math.floor(Math.random()*10000)}`,label,projectId,kind,originalPrincipal:principal,outstanding:principal,annualRate:Number(annualRate)||0,termMonths:Math.max(1,Math.round(termMonths||120)),monthsPaid:0,monthlyPayment:Math.round(amortisingMonthlyPayment(principal,annualRate,termMonths)),started:today(),status:'active'};f.debts.push(debt);recordClubCash(principal,`${label} proceeds received`,'financing',{debtId:debt.id,projectId});return debt;};
  window.processMonthlyDebtPayments=function(dateISO){const f=ensureClubFinanceState();if(!f||!dateISO)return[];const monthKey=String(dateISO).slice(0,7);if(f.lastDebtPaymentMonth===monthKey)return[];f.lastDebtPaymentMonth=monthKey;const paid=[];(f.debts||[]).filter(d=>d.status==='active'&&d.outstanding>0).forEach(d=>{const monthlyRate=(Number(d.annualRate)||0)/12,interest=Math.round(d.outstanding*monthlyRate),scheduled=Math.min(Math.round(d.monthlyPayment||0),Math.round(d.outstanding+interest)),principal=Math.max(0,Math.min(d.outstanding,scheduled-interest)),total=Math.max(0,interest+principal);if(total<=0)return;recordClubCash(-total,`${d.label} monthly repayment`,'debt_service',{debtId:d.id,interest,principal});d.outstanding=Math.max(0,d.outstanding-principal);d.monthsPaid=(d.monthsPaid||0)+1;f.debtInterestThisSeason+=interest;f.debtPrincipalPaidThisSeason+=principal;f.seasonCosts.financeInterest=(f.seasonCosts.financeInterest||0)+interest;if(typeof state.seasonPL==='number')state.seasonPL-=interest;if(state.monthlyFinance){state.monthlyFinance.debtInterest=(state.monthlyFinance.debtInterest||0)+interest;state.monthlyFinance.debtPrincipal=(state.monthlyFinance.debtPrincipal||0)+principal;}if(d.outstanding<=1||d.monthsPaid>=d.termMonths){d.outstanding=0;d.status='paid';}paid.push({debt:d,total,interest,principal});});return paid;};

  window.clubFinanceSeasonSnapshot=function(){const f=ensureClubFinanceState();return {openingCash:f.openingCash,closingCash:f.cash,revenue:{...f.seasonRevenue},costs:{...f.seasonCosts},ownerFunding:f.ownerFundingThisSeason||0,emergencyOwnerFunding:f.emergencyOwnerFundingThisSeason||0,workingCapitalDrawn:f.workingCapitalDrawnThisSeason||0,futureTransferCommitments:futureTransferCommitments(),futureTransferReceivables:futureTransferReceivables(),outstandingDebt:totalClubDebt()};};
  window.resetClubFinanceForNewSeason=function(){const f=ensureClubFinanceState();if(!f)return;f.openingCash=f.cash;f.capitalSpentThisSeason=0;f.debtInterestThisSeason=0;f.debtPrincipalPaidThisSeason=0;f.seasonTicketCashThisSeason=0;f.ownerFundingThisSeason=0;f.ownerFootballFundingThisSeason=0;f.emergencyOwnerFundingThisSeason=0;f.acquisitionFeesThisSeason=0;f.workingCapitalDrawnThisSeason=0;f.seasonRevenue={};f.seasonCosts={};calibrateClubRevenueModel();};
})();
