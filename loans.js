/* Football CEO v0.24.6 — Loans & Player Pathways
   Lightweight but persistent loan ecosystem built on the existing world-club database.
*/

function ensureLoanState(){
  if(!state.loans) state.loans=[];
  if(!state.incomingLoanOffers) state.incomingLoanOffers=[];
  if(!state.loanListingMeta) state.loanListingMeta={};
  if(!state.loanReviews) state.loanReviews=[];
  if(!state.loanHistory) state.loanHistory=[];
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
  if(wc){const lg=typeof leagueForClub==='function'?leagueForClub(name):null;return {name,reputation:wc.reputation||70,standard:wc.standard||70,maxWage:wc.maxWage||50000,leagueId:wc.leagueId||'',league:lg?.name||'World',country:lg?.country||'',squadBearing:true};}
  const ec=typeof externalTransferClub==='function'?externalTransferClub(name):null;
  if(ec)return {name,reputation:ec.reputation||65,standard:ec.standard||68,maxWage:ec.maxWage||35000,leagueId:'external',league:ec.division||'External',country:ec.country||'',squadBearing:false};
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
function loanTrainingQuality(destination){const p=typeof destination==='string'?loanClubProfile(destination):destination;return p?clamp(.84+(p.reputation-60)*.006,.82,1.12):.90;}
function loanSuitabilityScore(player,destination,role=null){
  const d=typeof destination==='string'?loanClubProfile(destination):destination;if(!d)return 0;
  role=role||projectedLoanRole(player,d); const o=player.overall||0,pot=Math.max(o,player.potential||o),age=player.age||25;
  const levelGap=Math.abs(o-d.standard), levelScore=Math.max(0,32-levelGap*4);
  const minutesScore=({4:34,3:31,2:18,1:4})[loanRoleRank(role)]||8;
  const training=(loanTrainingQuality(d)-.82)*45;
  const ageBonus=age<=19?8:age<=21?6:age<=23?3:0;
  const upside=Math.min(10,Math.max(0,pot-o)*1.1);
  const tooEasy=o-d.standard>=8?-9:0, tooHard=d.standard-o>=9?-14:0;
  return clamp(Math.round(levelScore+minutesScore+training+ageBonus+upside+tooEasy+tooHard),0,100);
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
  const record={...offer,status:'active',parentClub:parent,actualMinutes:0,startedOverall:p.overall||0,realisedMinutesTarget:Math.round((offer.estimatedMinutes||loanExpectedMinutes(offer.expectedRole))*usageFactor)};
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
function loanEstimatedMinutesToDate(l,dateISO=currentGameDateISO()){return Math.round((l.realisedMinutesTarget||l.estimatedMinutes||loanExpectedMinutes(l.expectedRole))*loanElapsedFraction(l,dateISO));}
function loanSeasonMinutesForPlayer(pOrId){
  const id=typeof pOrId==='object'?pOrId.id:pOrId;let total=0;
  currentSeasonLoanRecordsForPlayer(id).forEach(l=>{if(l.loanClub===state.club)return; total+=l.status==='active'?loanEstimatedMinutesToDate(l):Math.max(l.actualMinutes||0,l.finalMinutes||0);});
  return total;
}
function loanDevelopmentEnvironmentFactor(player){
  const l=activeLoanForPlayer(player);if(!l)return 1;
  const fit=clamp(.86+(l.suitability||55)*.0032,.88,1.15);return fit*loanTrainingQuality(l.loanClub);
}
function completeLoan(l,{recalled=false}={}){
  const p=DB.players.find(x=>String(x.id)===String(l.playerId));if(!p||l.status!=='active')return false;
  l.actualMinutes=loanEstimatedMinutesToDate(l);l.finalMinutes=l.actualMinutes;l.status=recalled?'recalled':'completed';l.completedDate=currentGameDateISO();l.endedOverall=p.overall||0;
  movePlayerForLoan(p,l.parentClub,l.loanClub,recalled?'loan-recall':'loan-return');
  state.loanHistory.push({...l});state.loanHistory=state.loanHistory.slice(-300);state.loans=state.loans.filter(x=>x.id!==l.id);
  addNews(`${p.name}'s loan at ${l.loanClub} has ${recalled?'been recalled':'ended'}. He returns to ${l.parentClub} after approximately ${l.finalMinutes} minutes of senior football.`);
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
  if(d.squadBearing&&typeof clubSquadPlayers==='function'){
    const peers=clubSquadPlayers(club).filter(x=>playsPositionGroup(x,g));const good=peers.filter(x=>(x.overall||0)>=d.standard-4).length;return good<2;
  }
  return true;
}
function simulateOneAILoan(){
  ensureLoanState();if(!isTransferWindowOpen())return false;
  const pool=DB.players.filter(p=>!p.retired&&p.club&&p.club!==state.club&&p.club!=='Free Agent'&&p.club!=='Retired'&&!activeLoanForPlayer(p)&&(p.age||25)<=23&&(p.potential||p.overall||0)>=(p.overall||0)+4);
  if(!pool.length)return false;
  for(let tries=0;tries<8;tries++){
    const p=pool[Math.floor(Math.random()*pool.length)],parent=p.club;
    const dests=recommendedLoanDestinations(p,6).filter(x=>x.club.name!==state.club).filter(x=>loanDestinationNeedsPlayer(p,x.club.name));if(!dests.length)continue;
    const pick=dests[0],terms=loanOfferTerms(p,pick.club,pick.role,pick.score),sy=currentSeasonStartYear();
    const o={id:`ail${Date.now()}${Math.floor(Math.random()*10000)}`,playerId:p.id,parentClub:parent,loanClub:pick.club.name,competition:pick.club.league,expectedRole:pick.role,suitability:pick.score,estimatedMinutes:pick.minutes,wageContribution:terms.wageContribution,loanFee:terms.loanFee,startDate:currentGameDateISO(),endDate:`${sy+1}-05-31`,recallAllowed:true,status:'pending',seasonStartYear:sy};
    return startLoanFromOffer(o);
  }return false;
}
function processLoanReviews(dateISO){
  ensureLoanState();if(!/-01-0[2-7]$/.test(dateISO))return;const key=`${currentSeasonStartYear()}-jan`;if(state.loanReviews.some(r=>r.key===key))return;
  const loans=state.loans.filter(l=>l.parentClub===state.club&&l.status==='active');if(!loans.length)return;
  const rows=loans.map(l=>{const p=DB.players.find(x=>String(x.id)===String(l.playerId)),mins=loanEstimatedMinutesToDate(l,dateISO),expected=(l.estimatedMinutes||1200)*loanElapsedFraction(l,dateISO),ratio=mins/Math.max(1,expected),status=(loanRoleRank(l.expectedRole)<=1||l.suitability<50||ratio<.62)?'Poor':ratio>=.82?'Good':'Monitor';return {loanId:l.id,playerId:l.playerId,name:p?.name||'Player',club:l.loanClub,minutes:mins,status,recallRecommended:status==='Poor'};});
  const review={id:`lr${Date.now()}`,key,date:dateISO,rows};state.loanReviews.push(review);
  const poor=rows.filter(r=>r.recallRecommended).length;state.news.unshift({week:state.week,date:dateISO,loanReviewId:review.id,text:`January loan review: ${rows.length} outgoing loan${rows.length===1?'':'s'} assessed${poor?`; ${poor} should be considered for recall`:'.'}`});
}
function processLoanDay(dateISO=currentGameDateISO()){
  ensureLoanState();
  [...state.loans].filter(l=>l.status==='active'&&dateISO>=l.endDate).forEach(l=>completeLoan(l));
  processLoanReviews(dateISO);
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
function loanDevelopmentBonus(player,currentDelta=0){
  const age=player?.age||25;if(age>23||currentDelta>=3)return 0;
  const records=currentSeasonLoanRecordsForPlayer(player);if(!records.length)return 0;
  const best=records.slice().sort((a,b)=>(b.suitability||0)-(a.suitability||0))[0];
  const minutes=loanSeasonMinutesForPlayer(player),gap=Math.max(0,(player.potential||player.overall||0)-(player.overall||0));
  if(minutes<1400||gap<3||(best.suitability||0)<55)return 0;
  let chance=age<=20?.58:age===21?.50:age===22?.38:.28;
  chance+=Math.max(0,(best.suitability||60)-65)*.006;
  chance+=minutes>=2400?.10:minutes>=1900?.05:0;
  chance*=clamp(gap/7,.55,1.15);
  const roll=typeof stablePlayerTrait==='function'?stablePlayerTrait(player,`loan-development-${best.loanClub}-${currentSeasonStartYear()}`):Math.random();
  if(roll>=clamp(chance,.12,.82))return 0;
  let bonus=1;
  const eliteChance=age<=20&&minutes>=2400&&(best.suitability||0)>=80&&gap>=8?.12:0;
  if(eliteChance&&roll<eliteChance&&currentDelta<=1)bonus=2;
  return Math.min(bonus,3-currentDelta,gap);
}
function loanSeasonEnvironmentFactorForPlayer(player){
  const rs=currentSeasonLoanRecordsForPlayer(player);if(!rs.length)return 1;
  const weighted=rs.map(l=>clamp(.88+(l.suitability||55)*.0028,.90,1.13)*loanTrainingQuality(l.loanClub));
  return clamp(weighted.reduce((a,b)=>a+b,0)/weighted.length,.88,1.14);
}
function loanParentWillingToLend(player){
  if(!player||player.club===state.club||activeLoanForPlayer(player))return false;
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
  modal.querySelector('#loanReviewBody').innerHTML=`<p class="muted small">Review whether each loan is providing the senior football promised when the move was agreed.</p>${r.rows.map(row=>`<div class="manager-squad-plan" style="margin-top:10px"><div class="manager-squad-plan-row"><div><b>${row.name}</b> • ${row.club}<div class="muted small">Approx. ${Number(row.minutes||0).toLocaleString('en-GB')} minutes • Status: ${row.status}</div></div>${row.recallRecommended?`<button class="btn secondary recall-loan-btn" data-loan-id="${row.loanId}" type="button">Recall</button>`:`<span class="pill">${row.status}</span>`}</div></div>`).join('')}`;
  modal.querySelectorAll('.recall-loan-btn').forEach(btn=>btn.addEventListener('click',()=>{recallLoan(btn.dataset.loanId);modal.classList.add('hide');if(typeof setModalScrollLock==='function')setModalScrollLock(false);}));modal.classList.remove('hide');if(typeof setModalScrollLock==='function')setModalScrollLock(true);
}
