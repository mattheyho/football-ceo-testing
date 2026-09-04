/* Football CEO v0.24.16 — Loan Development Rebalance
   Lightweight but persistent loan ecosystem built on the existing world-club database.
*/

function ensureLoanState(){
  if(!state.loans) state.loans=[];
  if(!state.incomingLoanOffers) state.incomingLoanOffers=[];
  if(!state.loanListingMeta) state.loanListingMeta={};
  if(!state.loanReviews) state.loanReviews=[];
  if(!state.loanHistory) state.loanHistory=[];
  if(!state.loanReports) state.loanReports=[];

  // v0.24.23 repair: older builds created final loan reports/news for every
  // AI-to-AI loan in the world. The CEO should only receive development reports
  // for players owned by their club and sent out on loan.
  if(!state.loanReportOwnershipRepairV02423){
    state.loanReportOwnershipRepairV02423=true;
    state.loanReports=state.loanReports.filter(r=>r && r.parentClub===state.club);
    const validReportIds=new Set(state.loanReports.map(r=>String(r.id)));
    if(Array.isArray(state.news)){
      state.news=state.news.filter(n=>!n?.loanReportId || validReportIds.has(String(n.loanReportId)));
    }
  }
}
function activeLoanForPlayer(pOrId){
  ensureLoanState(); const id=typeof pOrId==='object'?pOrId.id:pOrId;
  return state.loans.find(l=>String(l.playerId)===String(id)&&l.status==='active')||null;
}
function currentSeasonLoanRecordsForPlayer(pOrId){
  ensureLoanState(); const id=typeof pOrId==='object'?pOrId.id:pOrId;
  const sy=typeof currentSeasonStartYear==='function'?currentSeasonStartYear():2025;
  return [...state.loans,...state.loanHistory].filter(l=>String(l.playerId)===String(id)&&Number(l.seasonStartYear)===Number(sy));
}
function loanExpectedMinutes(role){return ({'Important Player':3000,'Regular Starter':2450,'Squad Player':1450,'Fringe Player':650})[role]||1200;}
function loanRoleRank(role){return ({'Important Player':4,'Regular Starter':3,'Squad Player':2,'Fringe Player':1})[role]||0;}
function loanPlayerGroup(p){return typeof primaryRecruitmentGroup==='function'?primaryRecruitmentGroup(p):String(p?.positions||'').split(',')[0].trim();}
function loanClubProfile(name){
  const wc=typeof worldClubByName==='function'?worldClubByName(name):null;
  if(wc){
    if(wc.loanSystemEnabled===false)return null;const lg=typeof leagueForClub==='function'?leagueForClub(name):null;const light=wc.simulationLevel==='loan-only';
    return {name,reputation:wc.reputation||70,standard:wc.standard||70,maxWage:light&&typeof nonLeagueEstimatedMaxWage==='function'?nonLeagueEstimatedMaxWage(name):(wc.maxWage||50000),leagueId:wc.leagueId||'',league:lg?.name||wc.division||'World',country:lg?.country||wc.country||'',squadBearing:!light,loanOnly:light,developmentSuitability:wc.developmentSuitability||wc.reputation||60,loanAttractiveness:wc.loanAttractiveness||wc.reputation||60};
  }
  const ec=typeof externalTransferClub==='function'?externalTransferClub(name):null;
  if(ec)return {name,reputation:ec.reputation||65,standard:ec.standard||68,maxWage:ec.maxWage||35000,leagueId:'external',league:ec.division||'External',country:ec.country||'',squadBearing:false,loanOnly:false};
  return null;
}
function allLoanDestinationProfiles(parentClub){
  const seen=new Set(),out=[];
  const add=n=>{if(!n||n===parentClub||seen.has(n))return;const p=loanClubProfile(n);if(!p||p.leagueId==='saudi-pro-league')return;seen.add(n);out.push(p);};
  (typeof allWorldClubs==='function'?allWorldClubs():[]).forEach(c=>add(c.name));
  if(typeof EXTERNAL_TRANSFER_CLUBS!=='undefined')EXTERNAL_TRANSFER_CLUBS.forEach(c=>add(c.name));
  return out;
}
function projectedLoanRole(player,destination){
  const p=typeof destination==='string'?loanClubProfile(destination):destination;if(!p)return 'Fringe Player';
  const o=player.overall||0,group=loanPlayerGroup(player);
  if(p.squadBearing&&typeof clubSquadPlayers==='function'&&group){
    const peers=clubSquadPlayers(p.name).filter(x=>typeof playsPositionGroup==='function'?playsPositionGroup(x,group):true).sort((a,b)=>(b.overall||0)-(a.overall||0));
    const ahead=peers.filter(x=>(x.overall||0)>o+1).length;
    if(ahead===0&&o>=p.standard-1)return 'Important Player';
    if(ahead<=1&&o>=p.standard-4)return 'Regular Starter';
    if(ahead<=2&&o>=p.standard-7)return 'Squad Player';
    return 'Fringe Player';
  }
  const delta=o-p.standard;
  if(delta>=2)return 'Important Player'; if(delta>=-2)return 'Regular Starter'; if(delta>=-6)return 'Squad Player'; return 'Fringe Player';
}
function loanTrainingQuality(destination){const p=typeof destination==='string'?loanClubProfile(destination):destination;if(!p)return .90;if(p.loanOnly)return clamp(.82+((p.developmentSuitability||55)-45)*.0065,.82,1.08);return clamp(.84+(p.reputation-60)*.006,.82,1.12);}
function loanSuitabilityScore(player,destination,role=null){
  const d=typeof destination==='string'?loanClubProfile(destination):destination;if(!d)return 0;
  role=role||projectedLoanRole(player,d); const o=player.overall||0,pot=Math.max(o,player.potential||o),age=player.age||25;
  const levelGap=Math.abs(o-d.standard), levelScore=Math.max(0,32-levelGap*4);
  const minutesScore=({4:34,3:31,2:18,1:4})[loanRoleRank(role)]||8;
  const training=(loanTrainingQuality(d)-.82)*45;
  const ageBonus=age<=19?8:age<=21?6:age<=23?3:0;
  const upside=Math.min(10,Math.max(0,pot-o)*1.1);
  const tooEasy=o-d.standard>=8?-9:0, tooHard=d.standard-o>=9?-14:0;
  let needFit=0;
  if(d.loanOnly&&typeof nonLeagueSeasonalPositionNeeds==='function'){
    const needs=nonLeagueSeasonalPositionNeeds(d.name,typeof currentSeasonStartYear==='function'?currentSeasonStartYear():2025,4);
    const g=loanPlayerGroup(player);const matches=typeof nonLeagueNeedMatches==='function'?nonLeagueNeedMatches(g,needs):needs.includes(g);
    needFit=matches?11:-7;
  }
  return clamp(Math.round(levelScore+minutesScore+training+ageBonus+upside+tooEasy+tooHard+needFit),0,100);
}
function loanSuitabilityLabel(score){if(score>=82)return 'Excellent';if(score>=68)return 'Good';if(score>=52)return 'Fair';return 'Poor';}
function recommendedLoanDestinations(player,limit=8){
  return allLoanDestinationProfiles(player.club).map(d=>{const role=projectedLoanRole(player,d),score=loanSuitabilityScore(player,d,role);return {club:d,role,score,minutes:loanExpectedMinutes(role)};})
    .filter(x=>x.score>=48&&loanRoleRank(x.role)>=2).sort((a,b)=>b.score-a.score||b.minutes-a.minutes).slice(0,limit);
}
function managerLoanOutRecommendations(club=state.club){
  ensureLoanState(); if(club!==state.club)return[];
  const standards=typeof managerClubSquadStandards==='function'?managerClubSquadStandards(club):{competition:76,backup:72};
  const selection=typeof managerSelectXI==='function'?managerSelectXI(club):null;
  const starters=new Set((selection?.xi||[]).map(x=>String(x.playerId||x.player?.id||'')));
  return (typeof clubSquadPlayers==='function'?clubSquadPlayers(club):squad(club)).filter(p=>{
    if(activeLoanForPlayer(p)||state.playerListStatus?.[p.id]==='Transfer')return false;
    const age=p.age||25,o=p.overall||0,pot=Math.max(o,p.potential||o),gap=pot-o;
    if(age>23||gap<3||pot<Math.max(76,standards.competition||76))return false;
    if(starters.has(String(p.id)))return false;
    const role=typeof managerInternalSquadRole==='function'?managerInternalSquadRole(p,club):'Backup / rotation option';
    return /Prospect|Backup/.test(role)||o<(standards.competition||76)-1;
  }).map(p=>{
    const dests=recommendedLoanDestinations(p,3),best=dests[0];
    const age=p.age||25,o=p.overall||0,pot=p.potential||o;
    let priority=4+Math.min(5,pot-o)+(age<=20?2:0)+(best?.score>=75?2:0);
    return {type:'loan',playerId:p.id,priority,reason:best?`A loan with regular senior football would provide a stronger development pathway. Best current destination fit: ${best.club.name} (${best.role}, ${loanSuitabilityLabel(best.score)}).`:'The player needs senior minutes beyond what the current first-team pathway can offer.'};
  }).sort((a,b)=>b.priority-a.priority).slice(0,5);
}
function loanOfferTerms(player,destination,role,score){
  const wage=state.playerContracts?.[player.id]?.wage??player.wage??1000;
  let contrib=role==='Important Player'?100:role==='Regular Starter'?80:role==='Squad Player'?60:40;
  if(destination.reputation<(typeof byClub==='function'?(byClub(state.club)?.reputation||80):80)-15)contrib=Math.max(30,contrib-20);
  if(destination.loanOnly){
    // Lightweight non-league loans use role + wage contribution only. No loan fee.
    const affordable=Math.floor((Math.max(250,destination.maxWage||750)/Math.max(1,wage))*100);
    contrib=clamp(Math.min(contrib,affordable),10,100);
    return {wageContribution:contrib,loanFee:0,weeklyWage:wage};
  }
  const value=typeof dynamicPlayerMarketValue==='function'?dynamicPlayerMarketValue(player):(player.value||0);
  const fee=Math.max(0,Math.round((value*(role==='Important Player'?.035:role==='Regular Starter'?.022:.01)*(0.8+score/250))/250000)*250000);
  return {wageContribution:clamp(contrib,0,100),loanFee:fee,weeklyWage:wage};
}
function createLoanOfferForPlayer(player,{preferredClub=null}={}){
  ensureLoanState(); if(!player||activeLoanForPlayer(player)||state.incomingLoanOffers.some(o=>String(o.playerId)===String(player.id)&&o.status==='pending'))return false;
  let dests=recommendedLoanDestinations(player,12); if(preferredClub)dests=dests.sort((a,b)=>(a.club.name===preferredClub?-1:0)-(b.club.name===preferredClub?-1:0));
  if(!dests.length)return false;
  const pick=dests[Math.min(dests.length-1,Math.floor(Math.random()*Math.min(4,dests.length)))];
  const terms=loanOfferTerms(player,pick.club,pick.role,pick.score),summer=currentTransferWindowKey().startsWith('summer');
  const sy=currentSeasonStartYear(),endDate=summer?`${sy+1}-05-31`:`${sy+1}-05-31`;
  const offer={id:`lo${Date.now()}${Math.floor(Math.random()*10000)}`,playerId:player.id,parentClub:player.club,loanClub:pick.club.name,competition:`${pick.club.league}${pick.club.country?` • ${pick.club.country}`:''}`,expectedRole:pick.role,suitability:pick.score,estimatedMinutes:pick.minutes,wageContribution:terms.wageContribution,loanFee:terms.loanFee,startDate:currentGameDateISO(),endDate,recallAllowed:true,status:'pending',seasonStartYear:sy};
  state.incomingLoanOffers.push(offer);
  state.news.unshift({week:state.week,date:currentGameDateISO(),loanOfferId:offer.id,text:`Loan offer: ${pick.club.name} want ${player.name} until the end of the season. They propose ${pick.role.toLowerCase()} usage, ${terms.wageContribution}% of wages and a ${money(terms.loanFee)} loan fee.`});
  return offer;
}
function setLoanListed(id,listed=true,source='CEO'){
  ensureLoanState();const p=DB.players.find(x=>String(x.id)===String(id));if(!p||activeLoanForPlayer(p))return false;
  if(typeof setPlayerListStatus==='function')setPlayerListStatus(id,listed?'Loan':'None',source);else state.playerListStatus[id]=listed?'Loan':'None';
  if(listed)state.loanListingMeta[id]={listedDay:currentCareerDay(),lastMarketCheckDay:null,failedChecks:0};else delete state.loanListingMeta[id];
  return true;
}
function movePlayerForLoan(player,newClub,fromClub,kind){
  if(!player)return; if(!state.playerWorldOverrides)state.playerWorldOverrides={};if(!state.playerClubOverrides)state.playerClubOverrides={};if(!state.transferLedger)state.transferLedger=[];
  state.playerWorldOverrides[player.id]={...(state.playerWorldOverrides[player.id]||{}),club:newClub};state.playerClubOverrides[player.id]=newClub;player.club=newClub;
  if(typeof invalidateClubSquadCache==='function')invalidateClubSquadCache(fromClub,newClub);if(typeof invalidateWorldStrengthCache==='function'){invalidateWorldStrengthCache(fromClub);invalidateWorldStrengthCache(newClub);}
  state.transferLedger.push({id:`ln${Date.now()}${Math.floor(Math.random()*1000)}`,week:state.week,date:currentGameDateISO(),careerDay:currentCareerDay(),playerId:player.id,playerName:player.name,fromClub,toClub:newClub,fee:0,kind,joined:player.joined||'',season:currentSeasonLabel()});state.transferLedger=state.transferLedger.slice(-160);
}
function startLoanFromOffer(offer){
  ensureLoanState();const p=DB.players.find(x=>String(x.id)===String(offer.playerId));if(!p)return false;
  const parent=offer.parentClub||p.club;
  const usageRoll=typeof stablePlayerTrait==='function'?stablePlayerTrait(p,`loan-usage-${offer.loanClub}-${offer.seasonStartYear}`):Math.random();
  const usageFactor=clamp(.55+usageRoll*.62+((offer.suitability||60)-60)*.004,.48,1.15);
  const record={...offer,status:'active',parentClub:parent,actualMinutes:0,startedOverall:p.overall||0,realisedMinutesTarget:Math.round((offer.estimatedMinutes||loanExpectedMinutes(offer.expectedRole))*usageFactor),stats:{appearances:0,starts:0,minutes:0,goals:0,assists:0,ratingTotal:0,ratedApps:0},progressWeeks:[],usageMomentum:0,lastNotifiedStatus:null,lastNotifiedRole:offer.expectedRole,lastNotifiedOverall:p.overall||0,lastNotifiedDate:offer.startDate};
  state.loans.push(record);offer.status='accepted';
  if(parent===state.club&&offer.loanFee>0&&typeof recordClubCash==='function')recordClubCash(offer.loanFee,`Loan fee received: ${p.name}`,'transfer',{playerId:p.id,loanId:record.id});
  if(offer.loanClub===state.club&&offer.loanFee>0&&typeof recordClubCash==='function')recordClubCash(-offer.loanFee,`Loan fee paid: ${p.name}`,'transfer',{playerId:p.id,loanId:record.id});
  movePlayerForLoan(p,offer.loanClub,parent,'loan');
  state.playerListStatus[p.id]='None'; delete state.loanListingMeta[p.id];
  if(parent===state.club)addNews(`${p.name} has joined ${offer.loanClub} on loan. Expected role: ${offer.expectedRole}. Development suitability: ${loanSuitabilityLabel(offer.suitability)}.`);
  else if(offer.loanClub===state.club)addNews(`${p.name} has joined ${state.club} on loan from ${parent}.`);
  return true;
}
function resolveLoanOffer(id,action){
  ensureLoanState();const o=state.incomingLoanOffers.find(x=>x.id===id);if(!o||o.status!=='pending')return false;
  if(action==='accept')startLoanFromOffer(o);else{o.status='rejected';const p=DB.players.find(x=>String(x.id)===String(o.playerId));addNews(`${state.club} rejected ${o.loanClub}'s loan offer for ${p?.name||'the player'}.`);} 
  if(typeof saveGame==='function')saveGame(false);if(typeof renderAll==='function')renderAll();return true;
}
function loanElapsedFraction(l,dateISO=currentGameDateISO()){
  const start=Date.parse(l.startDate+'T00:00:00Z'),end=Date.parse(l.endDate+'T00:00:00Z'),now=Date.parse(dateISO+'T00:00:00Z');
  return clamp((now-start)/Math.max(86400000,end-start),0,1);
}
function loanStableRoll(l,salt){
  const p=DB.players.find(x=>String(x.id)===String(l.playerId));
  if(p&&typeof stablePlayerTrait==='function')return stablePlayerTrait(p,`loan-${l.loanClub}-${l.seasonStartYear}-${salt}`);
  const str=`${l.playerId}|${l.loanClub}|${l.seasonStartYear}|${salt}`;let h=2166136261;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return ((h>>>0)%100000)/100000;
}
function loanStats(l){
  if(!l.stats)l.stats={appearances:0,starts:0,minutes:0,goals:0,assists:0,ratingTotal:0,ratedApps:0};
  if(!l.progressWeeks)l.progressWeeks=[];
  return l.stats;
}
function loanActualRoleFromStats(stats,recent=null){
  const s=recent||stats||{};const apps=Math.max(0,s.appearances||0),starts=Math.max(0,s.starts||0);
  if(apps<2)return 'Fringe Player';const startRate=starts/Math.max(1,apps);
  if(startRate>=.76)return 'Important Player';if(startRate>=.53)return 'Regular Starter';if(startRate>=.24)return 'Squad Player';return 'Fringe Player';
}
function loanOutcomeStatus(l){
  const st=loanStats(l),elapsed=Math.max(.08,loanElapsedFraction(l)),expected=(l.estimatedMinutes||loanExpectedMinutes(l.expectedRole))*elapsed,ratio=st.minutes/Math.max(1,expected);
  const roleGap=loanRoleRank(loanActualRoleFromStats(st))-loanRoleRank(l.expectedRole),avg=st.ratedApps?st.ratingTotal/st.ratedApps:0;
  if(st.appearances>=5&&ratio>=1.15&&(roleGap>0||avg>=7.0))return 'Thriving';
  if(st.appearances>=4&&ratio>=.84&&roleGap>=0)return 'Progressing well';
  if(st.appearances<3&&elapsed<.14)return 'Settling in';
  if(ratio>=.63)return 'Progressing normally';
  if(ratio>=.38)return 'Struggling';
  return 'Limited opportunities';
}
function loanOutcomeSeverity(status){return ({'Thriving':2,'Progressing well':1,'Progressing normally':0,'Settling in':0,'Struggling':-1,'Limited opportunities':-2})[status]??0;}
function loanWeekNumber(l,dateISO=currentGameDateISO()){
  const start=Date.parse(l.startDate+'T00:00:00Z'),now=Date.parse(dateISO+'T00:00:00Z');return Math.max(0,Math.floor((now-start)/604800000));
}
function loanSimulateWeek(l,weekNo){
  const p=DB.players.find(x=>String(x.id)===String(l.playerId));if(!p)return null;const st=loanStats(l),d=loanClubProfile(l.loanClub)||{standard:p.overall||60};
  const baseStart=({'Important Player':.73,'Regular Starter':.55,'Squad Player':.24,'Fringe Player':.06})[l.expectedRole]||.24;
  const fit=((l.suitability||60)-60)*.0025,level=((p.overall||0)-(d.standard||60))*.018;
  const roll=loanStableRoll(l,`usage-${weekNo}`),formRoll=loanStableRoll(l,`form-${weekNo}`),scheduleRoll=loanStableRoll(l,`schedule-${weekNo}`);
  const momentum=clamp(Number(l.usageMomentum||0),-.08,.08);
  const startChance=clamp(baseStart+fit+level+momentum+(roll-.5)*.20,.02,.92);
  let matches=scheduleRoll>.82?2:(scheduleRoll<.10?0:1);let starts=0,subs=0;
  // Lightweight loan injuries exist only inside the destination simulation so
  // they are not incorrectly treated by the user's medical staff.
  l.pendingEvents=l.pendingEvents||[];
  if((l.loanInjuryWeeksRemaining||0)>0){
    matches=0;l.loanInjuryWeeksRemaining=Math.max(0,l.loanInjuryWeeksRemaining-1);
    if(l.loanInjuryWeeksRemaining===0)l.pendingEvents.push({type:'injury-return',weekNo});
  }else if(loanStableRoll(l,`injury-${weekNo}`)<.009){
    const ir=loanStableRoll(l,`injury-length-${weekNo}`);let weeks=1+Math.floor(loanStableRoll(l,`injury-length2-${weekNo}`)*4);
    if(ir>.82)weeks=5+Math.floor(loanStableRoll(l,`injury-long-${weekNo}`)*4);if(ir>.97)weeks=9+Math.floor(loanStableRoll(l,`injury-severe-${weekNo}`)*4);
    l.loanInjuryWeeksRemaining=weeks;matches=0;l.pendingEvents.push({type:'injury',weekNo,weeks});
  }
  for(let m=0;m<matches;m++){
    const sr=loanStableRoll(l,`start-${weekNo}-${m}`);if(sr<startChance)starts++;else{
      const roleSub=({'Important Player':.50,'Regular Starter':.60,'Squad Player':.72,'Fringe Player':.50})[l.expectedRole]||.58;
      const subChance=clamp(roleSub+(Number(l.suitability||60)-60)*.0015+(roll-.5)*.14,.18,.80);if(loanStableRoll(l,`sub-${weekNo}-${m}`)<subChance)subs++;
    }
  }
  const apps=starts+subs;let minutes=0;
  for(let m=0;m<starts;m++)minutes+=70+Math.round(loanStableRoll(l,`sm-${weekNo}-${m}`)*20);
  for(let m=0;m<subs;m++)minutes+=12+Math.round(loanStableRoll(l,`bm-${weekNo}-${m}`)*24);
  const avgRating=apps?clamp(6.15+fit*1.5+level*.7+(formRoll-.5)*1.25,5.6,7.8):0;
  const group=loanPlayerGroup(p);const attack=/^(ST|W|AM)$/.test(group),mid=/^(CM|DM)$/.test(group);
  const goals=apps&&attack&&loanStableRoll(l,`g-${weekNo}`)<clamp(.10+avgRating*.012,0,.28)?1:0;
  const assists=apps&&(attack||mid)&&loanStableRoll(l,`a-${weekNo}`)<clamp(.08+avgRating*.010,0,.22)?1:0;
  st.appearances+=apps;st.starts+=starts;st.minutes+=minutes;st.goals+=goals;st.assists+=assists;if(apps){st.ratingTotal+=avgRating*apps;st.ratedApps+=apps;}
  const weeklyStartRate=apps?starts/apps:0;
  if(matches&&apps===0)l.usageMomentum=clamp(momentum-.025,-.08,.08);else if(weeklyStartRate>=.5)l.usageMomentum=clamp(momentum+.012,-.08,.08);else l.usageMomentum=clamp(momentum-.008,-.08,.08);
  const seg={weekNo,apps,starts,minutes,goals,assists,avgRating:apps?Math.round(avgRating*10)/10:0};l.progressWeeks.push(seg);return seg;
}
function loanRecentStats(l,weeks=4){const segs=(l.progressWeeks||[]).slice(-weeks);return segs.reduce((a,x)=>{a.appearances+=x.apps||0;a.starts+=x.starts||0;a.minutes+=x.minutes||0;a.goals+=x.goals||0;a.assists+=x.assists||0;return a;},{appearances:0,starts:0,minutes:0,goals:0,assists:0});}
function loanSimulateProgress(l,dateISO=currentGameDateISO()){
  if(!l||l.status!=='active')return loanStats(l);const target=loanWeekNumber(l,dateISO),st=loanStats(l);let next=(l.progressWeeks?.length||0);
  while(next<target){loanSimulateWeek(l,next);next++;}
  l.actualMinutes=st.minutes;l.actualRole=loanActualRoleFromStats(st,loanRecentStats(l,5));l.currentStatus=loanOutcomeStatus(l);return st;
}
function loanEstimatedMinutesToDate(l,dateISO=currentGameDateISO()){if(l?.status==='active')return loanSimulateProgress(l,dateISO).minutes;return Math.max(l?.finalMinutes||0,l?.actualMinutes||0);}
function loanSeasonMinutesForPlayer(pOrId){
  const id=typeof pOrId==='object'?pOrId.id:pOrId;let total=0;
  currentSeasonLoanRecordsForPlayer(id).forEach(l=>{if(l.loanClub===state.club)return; total+=l.status==='active'?loanEstimatedMinutesToDate(l):Math.max(l.actualMinutes||0,l.finalMinutes||0);});
  return total;
}
function loanDevelopmentEnvironmentFactor(player){
  const l=activeLoanForPlayer(player);if(!l)return 1;
  const fit=clamp(.86+(l.suitability||55)*.0032,.88,1.15);return fit*loanTrainingQuality(l.loanClub);
}
function loanCreateReport(l,type='final'){
  ensureLoanState();const p=DB.players.find(x=>String(x.id)===String(l.playerId));if(!p)return null;const st=loanStats(l),avg=st.ratedApps?st.ratingTotal/st.ratedApps:0;
  const report={id:`lrp${Date.now()}${Math.floor(Math.random()*10000)}`,type,date:currentGameDateISO(),loanId:l.id,playerId:l.playerId,name:p.name,club:l.loanClub,parentClub:l.parentClub,expectedRole:l.expectedRole,actualRole:l.actualRole||loanActualRoleFromStats(st),status:l.currentStatus||loanOutcomeStatus(l),appearances:st.appearances,starts:st.starts,minutes:st.minutes,goals:st.goals,assists:st.assists,avgRating:avg?Math.round(avg*100)/100:null,startOverall:l.startedOverall??p.overall,endOverall:p.overall||0,suitability:l.suitability||0};
  state.loanReports.unshift(report);state.loanReports=state.loanReports.slice(0,80);return report;
}
function completeLoan(l,{recalled=false}={}){
  const p=DB.players.find(x=>String(x.id)===String(l.playerId));if(!p||l.status!=='active')return false;
  loanSimulateProgress(l,currentGameDateISO());const st=loanStats(l);l.actualMinutes=st.minutes;l.finalMinutes=st.minutes;l.actualRole=loanActualRoleFromStats(st,loanRecentStats(l,6));l.currentStatus=loanOutcomeStatus(l);l.status=recalled?'recalled':'completed';l.completedDate=currentGameDateISO();l.endedOverall=p.overall||0;
  const userOutgoing=l.parentClub===state.club;
  const userIncoming=l.loanClub===state.club;
  const report=userOutgoing?loanCreateReport(l,recalled?'recall':'final'):null;
  movePlayerForLoan(p,l.parentClub,l.loanClub,recalled?'loan-recall':'loan-return');
  state.loanHistory.push({...l});state.loanHistory=state.loanHistory.slice(-300);state.loans=state.loans.filter(x=>x.id!==l.id);
  const outcome=l.currentStatus||'Completed';
  if(userOutgoing){
    state.news.unshift({week:state.week,date:currentGameDateISO(),loanReportId:report?.id,text:`${p.name}'s loan at ${l.loanClub} has ${recalled?'been recalled':'ended'}. ${st.starts} starts, ${st.appearances} appearances and ${Number(st.minutes||0).toLocaleString('en-GB')} minutes. Outcome: ${outcome}.`});
  }else if(userIncoming){
    state.news.unshift({week:state.week,date:currentGameDateISO(),text:`${p.name}'s loan spell at ${state.club} has ended. The player has returned to ${l.parentClub}.`});
  }
  return true;
}
function recallLoan(id){ensureLoanState();const l=state.loans.find(x=>x.id===id&&x.status==='active');if(!l||!l.recallAllowed||l.parentClub!==state.club)return false;const ok=completeLoan(l,{recalled:true});if(ok){saveGame(false);renderAll();}return ok;}
function processLoanListedInterest(){
  if(!isTransferWindowOpen())return;ensureLoanState();const day=currentCareerDay();
  squad(state.club).filter(p=>state.playerListStatus?.[p.id]==='Loan'&&!activeLoanForPlayer(p)).forEach(p=>{
    const m=state.loanListingMeta[p.id]||(state.loanListingMeta[p.id]={listedDay:day,lastMarketCheckDay:null,failedChecks:0});
    if(state.incomingLoanOffers.some(o=>String(o.playerId)===String(p.id)&&o.status==='pending'))return;
    if(m.lastMarketCheckDay!=null&&day-m.lastMarketCheckDay<2)return;
    const chance=clamp(.22+(m.failedChecks||0)*.05,0.22,.62);m.lastMarketCheckDay=day;
    if(Math.random()<chance){if(!createLoanOfferForPlayer(p))m.failedChecks=(m.failedChecks||0)+1;}else m.failedChecks=(m.failedChecks||0)+1;
  });
}
function loanDestinationNeedsPlayer(player,club){
  const g=loanPlayerGroup(player);if(!g)return false;const d=loanClubProfile(club);if(!d)return false;
  if(d.loanOnly&&typeof nonLeagueSeasonalPositionNeeds==='function'){const needs=nonLeagueSeasonalPositionNeeds(d.name,typeof currentSeasonStartYear==='function'?currentSeasonStartYear():2025,4);return typeof nonLeagueNeedMatches==='function'?nonLeagueNeedMatches(g,needs):needs.includes(g);}
  if(d.squadBearing&&typeof clubSquadPlayers==='function'){
    const peers=clubSquadPlayers(club).filter(x=>playsPositionGroup(x,g));const good=peers.filter(x=>(x.overall||0)>=d.standard-4).length;return good<2;
  }
  return true;
}
function simulateOneAILoan(){
  ensureLoanState();if(!isTransferWindowOpen())return false;
  const pool=DB.players.filter(p=>!p.retired&&p.club&&p.club!==state.club&&p.club!=='Free Agent'&&p.club!=='Retired'&&!(typeof isLoanOnlyWorldClub==='function'&&isLoanOnlyWorldClub(p.club))&&!activeLoanForPlayer(p)&&(p.age||25)<=23&&(p.potential||p.overall||0)>=(p.overall||0)+4);
  if(!pool.length)return false;
  for(let tries=0;tries<8;tries++){
    const p=pool[Math.floor(Math.random()*pool.length)],parent=p.club;
    const dests=recommendedLoanDestinations(p,6).filter(x=>x.club.name!==state.club).filter(x=>loanDestinationNeedsPlayer(p,x.club.name));if(!dests.length)continue;
    const pick=dests[0],terms=loanOfferTerms(p,pick.club,pick.role,pick.score),sy=currentSeasonStartYear();
    const o={id:`ail${Date.now()}${Math.floor(Math.random()*10000)}`,playerId:p.id,parentClub:parent,loanClub:pick.club.name,competition:pick.club.league,expectedRole:pick.role,suitability:pick.score,estimatedMinutes:pick.minutes,wageContribution:terms.wageContribution,loanFee:terms.loanFee,startDate:currentGameDateISO(),endDate:`${sy+1}-05-31`,recallAllowed:true,status:'pending',seasonStartYear:sy};
    return startLoanFromOffer(o);
  }return false;
}
function loanShouldNotifyProgress(l,dateISO=currentGameDateISO()){
  if(l.parentClub!==state.club||l.status!=='active'||dateISO>=l.endDate)return null;loanSimulateProgress(l,dateISO);const st=loanStats(l),status=l.currentStatus||loanOutcomeStatus(l),actualRole=l.actualRole||loanActualRoleFromStats(st),ovr=(DB.players.find(x=>String(x.id)===String(l.playerId))?.overall||l.startedOverall||0);
  const priorStatus=l.lastNotifiedStatus||null,priorRole=l.lastNotifiedRole||l.expectedRole,priorOvr=l.lastNotifiedOverall??l.startedOverall??ovr;
  const severity=loanOutcomeSeverity(status),priorSeverity=priorStatus==null?0:loanOutcomeSeverity(priorStatus),roleDelta=loanRoleRank(actualRole)-loanRoleRank(priorRole),ovrDelta=ovr-priorOvr;
  const roleCross=(loanRoleRank(actualRole)>=3)!==(loanRoleRank(priorRole)>=3);
  const significant=ovrDelta!==0||roleCross||Math.abs(roleDelta)>=2||Math.abs(severity-priorSeverity)>=2||(!priorStatus&&(severity>=2||severity<=-1));
  if(!significant)return null;
  return {status,actualRole,ovr,ovrDelta,roleDelta,severity,starts:st.starts,appearances:st.appearances,minutes:st.minutes};
}
function loanSendProgressUpdate(l,snap,dateISO=currentGameDateISO(),reason='progress'){
  const p=DB.players.find(x=>String(x.id)===String(l.playerId));if(!p||!snap)return false;
  const roleText=snap.actualRole!==l.expectedRole?` Agreed role: ${l.expectedRole}; actual role: ${snap.actualRole}.`: ` He is currently operating as the agreed ${l.expectedRole.toLowerCase()}.`;
  const dev=snap.ovrDelta?` OVR has moved ${snap.ovrDelta>0?'+':''}${snap.ovrDelta} since the last update.`:'';
  const rec=snap.severity<=-1?' Consider a recall if opportunities do not improve.':'';
  state.news.unshift({week:state.week,date:dateISO,text:`Loan update — ${snap.status}: ${p.name} at ${l.loanClub}. ${snap.starts} starts, ${snap.appearances} appearances, ${Number(snap.minutes).toLocaleString('en-GB')} minutes.${roleText}${dev}${rec}`});
  l.lastNotifiedStatus=snap.status;l.lastNotifiedRole=snap.actualRole;l.lastNotifiedOverall=snap.ovr;l.lastNotifiedDate=dateISO;l.lastNotifiedMonth=dateISO.slice(0,7);return true;
}
function processLoanPendingEvents(l,dateISO){
  if(l.parentClub!==state.club)return;const p=DB.players.find(x=>String(x.id)===String(l.playerId));if(!p)return;
  const events=(l.pendingEvents||[]).filter(e=>!e.notified);events.forEach(e=>{
    if(e.type==='injury')state.news.unshift({week:state.week,date:dateISO,text:`Loan update — Injury: ${p.name} has suffered an injury while on loan at ${l.loanClub} and is expected to miss around ${e.weeks} week${e.weeks===1?'':'s'}.`});
    if(e.type==='injury-return')state.news.unshift({week:state.week,date:dateISO,text:`Loan update — Return to fitness: ${p.name} is available again for ${l.loanClub} after his injury.`});
    e.notified=true;
  });
}
function processLoanProgressNotifications(dateISO){
  ensureLoanState();state.loans.filter(l=>l.parentClub===state.club&&l.status==='active').forEach(l=>{
    loanSimulateProgress(l,dateISO);processLoanPendingEvents(l,dateISO);const p=DB.players.find(x=>String(x.id)===String(l.playerId));if(!p||dateISO>=l.endDate)return;
    const snap=loanShouldNotifyProgress(l,dateISO);if(snap){loanSendProgressUpdate(l,snap,dateISO,'event');return;}
    // Monthly fallback only when the player's situation has meaningfully moved
    // since the previous notification; no routine "everything is fine" spam.
    const month=dateISO.slice(0,7),day=Number(dateISO.slice(8,10));if(day>3||l.lastMonthlyCheck===month)return;l.lastMonthlyCheck=month;
    const st=loanStats(l),recent=loanRecentStats(l,4),actualRole=loanActualRoleFromStats(st,recent),status=loanOutcomeStatus(l),ovr=p.overall||0;
    const priorMonthlyStatus=l.lastMonthlyStatus??null,priorMonthlyRole=l.lastMonthlyRole??l.expectedRole,priorMonthlyOverall=l.lastMonthlyOverall??l.startedOverall??ovr;
    const roleCross=(loanRoleRank(actualRole)>=3)!==(loanRoleRank(priorMonthlyRole)>=3);
    const meaningful=recent.appearances===0||status!==priorMonthlyStatus&&priorMonthlyStatus!==null||roleCross||ovr!==priorMonthlyOverall;
    l.lastMonthlyStatus=status;l.lastMonthlyRole=actualRole;l.lastMonthlyOverall=ovr;
    if(meaningful&&month!==l.lastNotifiedMonth)loanSendProgressUpdate(l,{status,actualRole,ovr,ovrDelta:ovr-(l.lastNotifiedOverall??l.startedOverall??ovr),severity:loanOutcomeSeverity(status),starts:st.starts,appearances:st.appearances,minutes:st.minutes},dateISO,'monthly');
  });
}
function processLoanReviews(dateISO){
  ensureLoanState();if(!/-01-0[2-7]$/.test(dateISO))return;const key=`${currentSeasonStartYear()}-jan`;if(state.loanReviews.some(r=>r.key===key))return;
  const loans=state.loans.filter(l=>l.parentClub===state.club&&l.status==='active');if(!loans.length)return;
  const rows=loans.map(l=>{loanSimulateProgress(l,dateISO);const p=DB.players.find(x=>String(x.id)===String(l.playerId)),st=loanStats(l),status=loanOutcomeStatus(l),actualRole=l.actualRole||loanActualRoleFromStats(st),recallRecommended=loanOutcomeSeverity(status)<0||loanRoleRank(actualRole)<loanRoleRank(l.expectedRole)-1;return {loanId:l.id,playerId:l.playerId,name:p?.name||'Player',club:l.loanClub,minutes:st.minutes,starts:st.starts,appearances:st.appearances,expectedRole:l.expectedRole,actualRole,status,recallRecommended};});
  const review={id:`lr${Date.now()}`,key,date:dateISO,rows};state.loanReviews.push(review);
  const poor=rows.filter(r=>r.recallRecommended).length;state.news.unshift({week:state.week,date:dateISO,loanReviewId:review.id,text:`January loan review: ${rows.length} outgoing loan${rows.length===1?'':'s'} assessed${poor?`; ${poor} should be considered for recall`:'.'}`});
}
function processLoanDay(dateISO=currentGameDateISO()){
  ensureLoanState();
  if(typeof processNonLeagueFreeAgentMarket==='function')processNonLeagueFreeAgentMarket(dateISO);
  // Simulate lightweight loan matches before reporting/expiry so final and
  // mid-season reports use actual accumulated starts/apps/minutes.
  state.loans.filter(l=>l.status==='active').forEach(l=>loanSimulateProgress(l,dateISO));
  processLoanProgressNotifications(dateISO);
  processLoanReviews(dateISO);
  [...state.loans].filter(l=>l.status==='active'&&dateISO>=l.endDate).forEach(l=>completeLoan(l));
  if(!isTransferWindowOpen())return;
  processLoanListedInterest();
  if(Math.random()<0.32)simulateOneAILoan();
}
function userLoanWeeklyWageAdjustment(){
  // Base payroll already includes players currently at the user club. Add the
  // retained share for outgoing loans and subtract the lender-paid share for
  // incoming loans so only the agreed contribution hits weekly costs.
  ensureLoanState();let total=0;
  state.loans.filter(l=>l.status==='active').forEach(l=>{const p=DB.players.find(x=>String(x.id)===String(l.playerId));if(!p)return;const wage=state.playerContracts?.[p.id]?.wage??p.wage??0;
    if(l.parentClub===state.club)total+=wage*(1-(l.wageContribution||0)/100);
    else if(l.loanClub===state.club)total-=wage*(1-(l.wageContribution||0)/100);
  });return Math.round(total);
}
function loanDevelopmentSeasonCap(player){
  const age=player?.age||25;
  const records=currentSeasonLoanRecordsForPlayer(player);
  if(!records.length)return 3;
  if(age<=19)return 6;
  if(age<=21)return 5;
  if(age<=23)return 4;
  return 3;
}
function loanDevelopmentTarget(player){
  const age=player?.age||25;if(age>23)return 0;
  const records=currentSeasonLoanRecordsForPlayer(player);if(!records.length)return 0;
  const minutes=loanSeasonMinutesForPlayer(player),overall=player.overall||0;
  const gap=Math.max(0,(player.potential||overall)-overall);if(gap<2||minutes<450)return 0;
  const best=records.slice().sort((a,b)=>Math.max(b.actualMinutes||0,b.finalMinutes||0,b.stats?.minutes||0)-Math.max(a.actualMinutes||0,a.finalMinutes||0,a.stats?.minutes||0))[0];
  const st=best.stats||{};
  const status=best.currentStatus||((best.status==='active'&&typeof loanOutcomeStatus==='function')?loanOutcomeStatus(best):'Progressing normally');
  const avg=st.ratedApps?st.ratingTotal/st.ratedApps:(best.avgRating||0);

  // Competitive football is a primary development route. The target below is
  // total season growth for the loan spell, not an automatic bonus on top of a
  // separate +3. Minutes create the base opportunity; role/outcome, fit, age,
  // performance and remaining upside determine how much of it is realised.
  let target=minutes>=2850?5:minutes>=2300?4:minutes>=1700?3:minutes>=1100?2:minutes>=650?1:0;
  if(status==='Thriving')target+=1;
  else if(status==='Progressing normally'||status==='Settling in')target-=1;
  else if(status==='Struggling')target-=2;
  else if(status==='Limited opportunities')target-=3;

  if((best.suitability||0)<52)target-=1;
  if(age===21)target-=1;else if(age===22)target-=1;else if(age===23)target-=2;
  if(avg>=7.20&&st.ratedApps>=8)target+=1;
  else if(avg>0&&avg<6.20&&st.ratedApps>=8)target-=1;

  const gapCap=gap<=2?1:gap<=4?2:gap<=7?3:gap<=11?4:gap<=15?5:6;
  const ageCap=loanDevelopmentSeasonCap(player);
  target=clamp(target,0,Math.min(gapCap,ageCap,gap));

  // Small deterministic variance prevents identical loan seasons from always
  // producing identical growth. Breakout +5/+6 seasons remain possible but
  // require both the football and the upside to justify them.
  const roll=typeof stablePlayerTrait==='function'?stablePlayerTrait(player,`loan-development-target-${best.loanClub}-${currentSeasonStartYear()}`):Math.random();
  if(target>=2&&roll<.10)target-=1;
  else if(target>=2&&roll>.92&&status!=='Struggling'&&status!=='Limited opportunities'&&gap>target)
    target=Math.min(target+1,gapCap,ageCap,gap);
  return Math.max(0,target);
}
function loanDevelopmentBonus(player,currentDelta=0){
  const target=loanDevelopmentTarget(player);
  if(target<=currentDelta)return 0;
  return Math.max(0,target-currentDelta);
}

function loanSeasonEnvironmentFactorForPlayer(player){
  const rs=currentSeasonLoanRecordsForPlayer(player);if(!rs.length)return 1;
  const weighted=rs.map(l=>clamp(.88+(l.suitability||55)*.0028,.90,1.13)*loanTrainingQuality(l.loanClub));
  return clamp(weighted.reduce((a,b)=>a+b,0)/weighted.length,.88,1.14);
}
function loanParentWillingToLend(player){
  if(!player||player.club===state.club||activeLoanForPlayer(player)||(typeof isLoanOnlyWorldClub==='function'&&isLoanOnlyWorldClub(player.club)))return false;
  const age=player.age||25,o=player.overall||0,pot=player.potential||o;if(age>24||pot<o+2)return false;
  const group=loanPlayerGroup(player),peers=typeof clubSquadPlayers==='function'?clubSquadPlayers(player.club).filter(x=>playsPositionGroup(x,group)).sort((a,b)=>(b.overall||0)-(a.overall||0)):[];
  const rank=peers.findIndex(x=>String(x.id)===String(player.id));
  if(rank===0)return false;
  if(rank===1){if(peers.length<3)return false;if(((peers[0]?.overall||0)-o)<2)return false;}
  return true;
}
function managerIncomingLoanOption(position,squadRole='competition'){
  const standards=typeof managerClubSquadStandards==='function'?managerClubSquadStandards(state.club):{starter:80,competition:77,backup:73};
  const floor=squadRole==='starter'?standards.starter-3:squadRole==='competition'?standards.competition-2:standards.backup-2;
  const pool=(typeof transferPlayersForPosition==='function'?transferPlayersForPosition(position):DB.players.filter(p=>playsPositionGroup(p,position)))
    .filter(p=>!p.retired&&p.club!==state.club&&p.club!=='Free Agent'&&!activeLoanForPlayer(p)&&loanParentWillingToLend(p))
    .filter(p=>(p.age||25)<=24&&(p.overall||0)>=floor)
    .map(p=>{const interest=typeof playerInterestScore==='function'?playerInterestScore(p,state.club):60;const dest=loanClubProfile(state.club)||{name:state.club,reputation:80,standard:standards.starter};const promised=squadRole==='starter'?'Important Player':squadRole==='competition'?'Regular Starter':'Squad Player';const suitability=loanSuitabilityScore(p,dest,promised);const terms=loanOfferTerms(p,dest,promised,suitability);let score=(p.overall||0)*3+(p.potential||p.overall||0)*.45+interest*.16+suitability*.35-(p.age||25)*.4;return {player:p,score,interest,loanTerms:{...terms,expectedRole:promised,suitability,estimatedMinutes:loanExpectedMinutes(promised)}};})
    .filter(x=>x.interest>=38&&x.loanTerms.suitability>=48).sort((a,b)=>b.score-a.score);
  return pool[0]||null;
}
function injectManagerLoanOption(shortlist,position,squadRole='competition',context={}){
  const out=[...(shortlist||[])];
  // Loans are a strategic alternative for depth/competition, or for a starter
  // only when the permanent budget is restrictive.
  const allow=squadRole!=='starter'||Number(context.budgetCap||state.budget||0)<35_000_000;if(!allow)return out;
  const opt=managerIncomingLoanOption(position,squadRole);if(!opt||out.some(x=>String(x.player.id)===String(opt.player.id)))return out;
  const entry={player:opt.player,role:'Alternative',descriptor:'Loan',asking:opt.loanTerms.loanFee,interest:opt.interest,planType:'loan',loanOption:true,loanTerms:opt.loanTerms};
  if(out.length>=3)out[2]=entry;else out.push(entry);return out.slice(0,3);
}
function pursueManagerLoanTarget(requestId,playerId){
  ensureLoanState();if(typeof isTransferWindowOpen==='function'&&!isTransferWindowOpen())return false;const req=state.managerRequests?.find(r=>String(r.id)===String(requestId)),p=DB.players.find(x=>String(x.id)===String(playerId));if(!req||!p)return false;
  const entry=(req.shortlist||[]).find(x=>String(x.playerId)===String(playerId));if(!entry?.loanOption||!loanParentWillingToLend(p))return false;
  const t=entry.loanTerms||{},fee=t.loanFee||0;if((state.budget||0)<fee){addNews(`${p.club} are willing to discuss a loan for ${p.name}, but the proposed loan fee is outside the remaining playing budget.`);return false;}
  const sy=currentSeasonStartYear(),offer={id:`uli${Date.now()}`,playerId:p.id,parentClub:p.club,loanClub:state.club,competition:'Premier League • England',expectedRole:t.expectedRole||'Squad Player',suitability:t.suitability||60,estimatedMinutes:t.estimatedMinutes||loanExpectedMinutes(t.expectedRole),wageContribution:t.wageContribution??60,loanFee:fee,startDate:currentGameDateISO(),endDate:`${sy+1}-05-31`,recallAllowed:false,status:'pending',seasonStartYear:sy};
  startLoanFromOffer(offer);state.budget=Math.max(0,(state.budget||0)-fee);if(state.transferFinance)state.transferFinance.spent=(state.transferFinance.spent||0)+fee;
  req.resolved=true;req.selectedPlayerId=p.id;req.selectedRole='Loan';if(state.managerRoleFulfilledUntil)state.managerRoleFulfilledUntil[`${req.position}-${req.squadRole||'competition'}`]=currentCareerDay()+120;
  state.managerBacking=clamp((state.managerBacking||70)+2,0,100);addNews(`${req.manager}'s ${positionLabel(req.position)} request has been addressed with the loan signing of ${p.name}.`);if(typeof scheduleManagerReassessment==='function')scheduleManagerReassessment(1);saveGame(false);renderAll();return true;
}
function ensureLoanOfferModal(){
  let modal=document.getElementById('loanOfferModal');if(modal)return modal;
  modal=document.createElement('div');modal.id='loanOfferModal';modal.className='manager-shortlist-overlay hide';modal.innerHTML=`<div class="manager-shortlist-card"><div class="sectiontitle"><div><div class="eyebrow">PLAYER PATHWAY</div><h2 id="loanOfferTitle" style="margin:4px 0 0">Loan offer</h2></div><button class="close-x" id="closeLoanOfferModal" type="button">×</button></div><div id="loanOfferBody"></div></div>`;document.body.appendChild(modal);
  modal.querySelector('#closeLoanOfferModal').addEventListener('click',()=>{modal.classList.add('hide');if(typeof setModalScrollLock==='function')setModalScrollLock(false);});return modal;
}
function openLoanOffer(id){
  ensureLoanState();const o=state.incomingLoanOffers.find(x=>x.id===id),p=o&&DB.players.find(x=>String(x.id)===String(o.playerId));if(!o||!p||o.status!=='pending')return;
  const modal=ensureLoanOfferModal();modal.querySelector('#loanOfferTitle').textContent=`Loan offer for ${p.name}`;
  modal.querySelector('#loanOfferBody').innerHTML=`<p class="muted">${o.loanClub} • ${o.competition}</p><div class="transfer-grid"><div class="transfer-metric"><span>Expected role</span><b>${o.expectedRole}</b></div><div class="transfer-metric"><span>Development fit</span><b>${loanSuitabilityLabel(o.suitability)}</b><div class="muted small">${o.suitability}/100</div></div><div class="transfer-metric"><span>Expected minutes</span><b>${Number(o.estimatedMinutes||0).toLocaleString('en-GB')}</b></div><div class="transfer-metric"><span>Wages paid</span><b>${o.wageContribution}%</b></div><div class="transfer-metric"><span>Loan fee</span><b>${money(o.loanFee)}</b></div><div class="transfer-metric"><span>Recall</span><b>${o.recallAllowed?'Allowed':'Not allowed'}</b></div></div><div class="notice small muted" style="margin-top:12px">Development depends on actual senior minutes, the level of the destination, training environment and the player's remaining potential. A promised role does not guarantee a successful loan.</div><div class="transfer-actions" style="margin-top:14px"><button class="btn primary" id="acceptLoanOfferBtn">Accept loan</button><button class="btn secondary" id="rejectLoanOfferBtn">Reject</button></div>`;
  modal.querySelector('#acceptLoanOfferBtn').addEventListener('click',()=>{modal.classList.add('hide');resolveLoanOffer(id,'accept');if(typeof setModalScrollLock==='function')setModalScrollLock(false);});modal.querySelector('#rejectLoanOfferBtn').addEventListener('click',()=>{modal.classList.add('hide');resolveLoanOffer(id,'reject');if(typeof setModalScrollLock==='function')setModalScrollLock(false);});modal.classList.remove('hide');if(typeof setModalScrollLock==='function')setModalScrollLock(true);
}
function ensureLoanReviewModal(){
  let modal=document.getElementById('loanReviewModal');if(modal)return modal;
  modal=document.createElement('div');modal.id='loanReviewModal';modal.className='manager-shortlist-overlay hide';modal.innerHTML=`<div class="manager-shortlist-card"><div class="sectiontitle"><div><div class="eyebrow">PLAYER PATHWAYS</div><h2 style="margin:4px 0 0">January loan review</h2></div><button class="close-x" id="closeLoanReviewModal" type="button">×</button></div><div id="loanReviewBody"></div></div>`;document.body.appendChild(modal);modal.querySelector('#closeLoanReviewModal').addEventListener('click',()=>{modal.classList.add('hide');if(typeof setModalScrollLock==='function')setModalScrollLock(false);});return modal;
}
function openLoanReview(id){
  ensureLoanState();const r=state.loanReviews.find(x=>x.id===id);if(!r)return;const modal=ensureLoanReviewModal();
  modal.querySelector('#loanReviewBody').innerHTML=`<p class="muted small">Review whether each loan is providing the senior football promised when the move was agreed.</p>${r.rows.map(row=>`<div class="manager-squad-plan" style="margin-top:10px"><div class="manager-squad-plan-row"><div><b>${row.name}</b> • ${row.club}<div class="muted small">${row.starts||0} starts • ${row.appearances||0} apps • ${Number(row.minutes||0).toLocaleString('en-GB')} mins</div><div class="muted small">Agreed: ${row.expectedRole||'—'} • Actual: ${row.actualRole||'—'} • ${row.status}</div></div>${row.recallRecommended?`<button class="btn secondary recall-loan-btn" data-loan-id="${row.loanId}" type="button">Recall</button>`:`<span class="pill">${row.status}</span>`}</div></div>`).join('')}`;
  modal.querySelectorAll('.recall-loan-btn').forEach(btn=>btn.addEventListener('click',()=>{recallLoan(btn.dataset.loanId);modal.classList.add('hide');if(typeof setModalScrollLock==='function')setModalScrollLock(false);}));modal.classList.remove('hide');if(typeof setModalScrollLock==='function')setModalScrollLock(true);
}


function ensureLoanReportModal(){
  let modal=document.getElementById('loanReportModal');if(modal)return modal;
  modal=document.createElement('div');modal.id='loanReportModal';modal.className='manager-shortlist-overlay hide';modal.innerHTML=`<div class="manager-shortlist-card"><div class="sectiontitle"><div><div class="eyebrow">PLAYER PATHWAYS</div><h2 id="loanReportTitle" style="margin:4px 0 0">Loan report</h2></div><button class="close-x" id="closeLoanReportModal" type="button">×</button></div><div id="loanReportBody"></div></div>`;document.body.appendChild(modal);modal.querySelector('#closeLoanReportModal').addEventListener('click',()=>{modal.classList.add('hide');if(typeof setModalScrollLock==='function')setModalScrollLock(false);});return modal;
}
function openLoanReport(id){
  ensureLoanState();const r=state.loanReports.find(x=>x.id===id);if(!r)return;const modal=ensureLoanReportModal();modal.querySelector('#loanReportTitle').textContent=`Loan report — ${r.name}`;
  const change=(r.endOverall||0)-(r.startOverall||0),outcome=loanOutcomeSeverity(r.status)>=1?'Successful loan':loanOutcomeSeverity(r.status)<=-1?'Disappointing loan':'Useful loan spell';
  modal.querySelector('#loanReportBody').innerHTML=`<p class="muted">${r.club} • ${r.status}</p><div class="transfer-grid"><div class="transfer-metric"><span>Appearances</span><b>${r.appearances}</b></div><div class="transfer-metric"><span>Starts</span><b>${r.starts}</b></div><div class="transfer-metric"><span>Minutes</span><b>${Number(r.minutes||0).toLocaleString('en-GB')}</b></div><div class="transfer-metric"><span>Goals / assists</span><b>${r.goals} / ${r.assists}</b></div><div class="transfer-metric"><span>Average form</span><b>${r.avgRating?r.avgRating.toFixed(2):'—'}</b></div><div class="transfer-metric"><span>OVR</span><b>${r.startOverall} → ${r.endOverall}${change?` (${change>0?'+':''}${change})`:''}</b></div></div><div class="notice" style="margin-top:12px"><b>${outcome}</b><br><span class="muted small">Agreed role: ${r.expectedRole} • Actual role: ${r.actualRole}. ${r.minutes>=2000?'The player received a substantial volume of senior football.':r.minutes>=1000?'The player received a useful amount of senior football.':'The player received limited competitive football.'}</span></div>`;
  modal.classList.remove('hide');if(typeof setModalScrollLock==='function')setModalScrollLock(true);
}
function loanProfileSummary(player){
  ensureLoanState();const live=activeLoanForPlayer(player);if(live){loanSimulateProgress(live,currentGameDateISO());const st=loanStats(live),avg=st.ratedApps?st.ratingTotal/st.ratedApps:null;return {active:true,club:live.loanClub,expectedRole:live.expectedRole,actualRole:live.actualRole||loanActualRoleFromStats(st),status:live.currentStatus||loanOutcomeStatus(live),starts:st.starts,appearances:st.appearances,minutes:st.minutes,goals:st.goals,assists:st.assists,avgRating:avg,injuryWeeksRemaining:live.loanInjuryWeeksRemaining||0};}
  const hist=state.loanHistory.filter(l=>String(l.playerId)===String(player.id)).sort((a,b)=>String(b.completedDate||'').localeCompare(String(a.completedDate||'')))[0];if(!hist)return null;const st=hist.stats||{};return {active:false,club:hist.loanClub,expectedRole:hist.expectedRole,actualRole:hist.actualRole||loanActualRoleFromStats(st),status:hist.currentStatus||'Completed',starts:st.starts||0,appearances:st.appearances||0,minutes:hist.finalMinutes||st.minutes||0,goals:st.goals||0,assists:st.assists||0,avgRating:st.ratedApps?st.ratingTotal/st.ratedApps:null};
}
