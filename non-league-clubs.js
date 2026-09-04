/* Football CEO v0.24.13 — Piece 3: lightweight English non-league player ecosystem.
   2025/26 National League, National League North and National League South.
   These clubs are intentionally NOT full simulated squads yet. They exist as
   loan destinations and lightweight homes for released/free-agent players,
   without fixtures, youth generation or full transfer-market simulation. */

const NON_LEAGUE_LEAGUES = [{"id":"national-league","name":"National League","country":"England","tier":5,"clubCount":24,"simulationLevel":"loan-only","playable":false,"promotionTo":"league-two","relegationTo":null,"isEFL":false,"loanDestination":true,"worldGeneration":false},{"id":"national-league-north","name":"National League North","country":"England","tier":6,"clubCount":24,"simulationLevel":"loan-only","playable":false,"promotionTo":"national-league","relegationTo":null,"isEFL":false,"loanDestination":true,"worldGeneration":false},{"id":"national-league-south","name":"National League South","country":"England","tier":6,"clubCount":24,"simulationLevel":"loan-only","playable":false,"promotionTo":"national-league","relegationTo":null,"isEFL":false,"loanDestination":true,"worldGeneration":false}];

const NON_LEAGUE_CLUB_PROFILES = [{"name":"Aldershot Town","leagueId":"national-league","division":"National League","country":"England","reputation":51,"standard":54,"developmentSuitability":56,"loanAttractiveness":56,"positionNeedSeed":94755},{"name":"Altrincham","leagueId":"national-league","division":"National League","country":"England","reputation":50,"standard":55,"developmentSuitability":62,"loanAttractiveness":54,"positionNeedSeed":64344},{"name":"Boreham Wood","leagueId":"national-league","division":"National League","country":"England","reputation":50,"standard":54,"developmentSuitability":56,"loanAttractiveness":54,"positionNeedSeed":71320},{"name":"Boston United","leagueId":"national-league","division":"National League","country":"England","reputation":48,"standard":53,"developmentSuitability":55,"loanAttractiveness":49,"positionNeedSeed":85065},{"name":"Brackley Town","leagueId":"national-league","division":"National League","country":"England","reputation":47,"standard":53,"developmentSuitability":57,"loanAttractiveness":52,"positionNeedSeed":54727},{"name":"Braintree Town","leagueId":"national-league","division":"National League","country":"England","reputation":46,"standard":52,"developmentSuitability":57,"loanAttractiveness":48,"positionNeedSeed":24344},{"name":"Carlisle United","leagueId":"national-league","division":"National League","country":"England","reputation":58,"standard":59,"developmentSuitability":65,"loanAttractiveness":60,"positionNeedSeed":11160},{"name":"Eastleigh","leagueId":"national-league","division":"National League","country":"England","reputation":50,"standard":55,"developmentSuitability":58,"loanAttractiveness":52,"positionNeedSeed":23380},{"name":"FC Halifax Town","leagueId":"national-league","division":"National League","country":"England","reputation":50,"standard":55,"developmentSuitability":62,"loanAttractiveness":56,"positionNeedSeed":63229},{"name":"Forest Green Rovers","leagueId":"national-league","division":"National League","country":"England","reputation":55,"standard":57,"developmentSuitability":65,"loanAttractiveness":57,"positionNeedSeed":76603},{"name":"Gateshead","leagueId":"national-league","division":"National League","country":"England","reputation":52,"standard":57,"developmentSuitability":63,"loanAttractiveness":58,"positionNeedSeed":3181},{"name":"Hartlepool United","leagueId":"national-league","division":"National League","country":"England","reputation":55,"standard":56,"developmentSuitability":64,"loanAttractiveness":61,"positionNeedSeed":22944},{"name":"Morecambe","leagueId":"national-league","division":"National League","country":"England","reputation":55,"standard":56,"developmentSuitability":62,"loanAttractiveness":61,"positionNeedSeed":61652},{"name":"Rochdale","leagueId":"national-league","division":"National League","country":"England","reputation":56,"standard":58,"developmentSuitability":66,"loanAttractiveness":61,"positionNeedSeed":78708},{"name":"Scunthorpe United","leagueId":"national-league","division":"National League","country":"England","reputation":53,"standard":57,"developmentSuitability":65,"loanAttractiveness":59,"positionNeedSeed":18023},{"name":"Solihull Moors","leagueId":"national-league","division":"National League","country":"England","reputation":51,"standard":56,"developmentSuitability":60,"loanAttractiveness":55,"positionNeedSeed":98195},{"name":"Southend United","leagueId":"national-league","division":"National League","country":"England","reputation":57,"standard":58,"developmentSuitability":67,"loanAttractiveness":60,"positionNeedSeed":61834},{"name":"Sutton United","leagueId":"national-league","division":"National League","country":"England","reputation":53,"standard":56,"developmentSuitability":63,"loanAttractiveness":59,"positionNeedSeed":3533},{"name":"Tamworth","leagueId":"national-league","division":"National League","country":"England","reputation":47,"standard":53,"developmentSuitability":58,"loanAttractiveness":50,"positionNeedSeed":18258},{"name":"Truro City","leagueId":"national-league","division":"National League","country":"England","reputation":45,"standard":52,"developmentSuitability":56,"loanAttractiveness":47,"positionNeedSeed":88188},{"name":"Wealdstone","leagueId":"national-league","division":"National League","country":"England","reputation":47,"standard":53,"developmentSuitability":55,"loanAttractiveness":50,"positionNeedSeed":30375},{"name":"Woking","leagueId":"national-league","division":"National League","country":"England","reputation":50,"standard":54,"developmentSuitability":56,"loanAttractiveness":54,"positionNeedSeed":87555},{"name":"Yeovil Town","leagueId":"national-league","division":"National League","country":"England","reputation":52,"standard":55,"developmentSuitability":58,"loanAttractiveness":56,"positionNeedSeed":28380},{"name":"York City","leagueId":"national-league","division":"National League","country":"England","reputation":56,"standard":59,"developmentSuitability":65,"loanAttractiveness":58,"positionNeedSeed":450},{"name":"AFC Fylde","leagueId":"national-league-north","division":"National League North","country":"England","reputation":49,"standard":53,"developmentSuitability":56,"loanAttractiveness":54,"positionNeedSeed":11376},{"name":"AFC Telford United","leagueId":"national-league-north","division":"National League North","country":"England","reputation":45,"standard":50,"developmentSuitability":53,"loanAttractiveness":50,"positionNeedSeed":67538},{"name":"Alfreton Town","leagueId":"national-league-north","division":"National League North","country":"England","reputation":44,"standard":50,"developmentSuitability":53,"loanAttractiveness":45,"positionNeedSeed":88893},{"name":"Bedford Town","leagueId":"national-league-north","division":"National League North","country":"England","reputation":42,"standard":49,"developmentSuitability":49,"loanAttractiveness":46,"positionNeedSeed":36026},{"name":"Buxton","leagueId":"national-league-north","division":"National League North","country":"England","reputation":44,"standard":51,"developmentSuitability":51,"loanAttractiveness":45,"positionNeedSeed":42055},{"name":"Chester","leagueId":"national-league-north","division":"National League North","country":"England","reputation":50,"standard":54,"developmentSuitability":56,"loanAttractiveness":52,"positionNeedSeed":51895},{"name":"Chorley","leagueId":"national-league-north","division":"National League North","country":"England","reputation":47,"standard":53,"developmentSuitability":58,"loanAttractiveness":52,"positionNeedSeed":4943},{"name":"Curzon Ashton","leagueId":"national-league-north","division":"National League North","country":"England","reputation":44,"standard":51,"developmentSuitability":55,"loanAttractiveness":47,"positionNeedSeed":454},{"name":"Darlington","leagueId":"national-league-north","division":"National League North","country":"England","reputation":49,"standard":53,"developmentSuitability":56,"loanAttractiveness":54,"positionNeedSeed":98091},{"name":"Hereford","leagueId":"national-league-north","division":"National League North","country":"England","reputation":49,"standard":53,"developmentSuitability":56,"loanAttractiveness":52,"positionNeedSeed":91131},{"name":"Kidderminster Harriers","leagueId":"national-league-north","division":"National League North","country":"England","reputation":51,"standard":55,"developmentSuitability":59,"loanAttractiveness":53,"positionNeedSeed":76021},{"name":"King's Lynn Town","leagueId":"national-league-north","division":"National League North","country":"England","reputation":48,"standard":53,"developmentSuitability":56,"loanAttractiveness":52,"positionNeedSeed":52861},{"name":"Leamington","leagueId":"national-league-north","division":"National League North","country":"England","reputation":44,"standard":50,"developmentSuitability":54,"loanAttractiveness":45,"positionNeedSeed":33654},{"name":"Macclesfield","leagueId":"national-league-north","division":"National League North","country":"England","reputation":51,"standard":55,"developmentSuitability":59,"loanAttractiveness":55,"positionNeedSeed":51686},{"name":"Marine","leagueId":"national-league-north","division":"National League North","country":"England","reputation":44,"standard":50,"developmentSuitability":50,"loanAttractiveness":46,"positionNeedSeed":58980},{"name":"Merthyr Town","leagueId":"national-league-north","division":"National League North","country":"Wales","reputation":46,"standard":52,"developmentSuitability":57,"loanAttractiveness":51,"positionNeedSeed":71484},{"name":"Oxford City","leagueId":"national-league-north","division":"National League North","country":"England","reputation":46,"standard":51,"developmentSuitability":52,"loanAttractiveness":50,"positionNeedSeed":7486},{"name":"Peterborough Sports","leagueId":"national-league-north","division":"National League North","country":"England","reputation":43,"standard":50,"developmentSuitability":50,"loanAttractiveness":44,"positionNeedSeed":1680},{"name":"Radcliffe","leagueId":"national-league-north","division":"National League North","country":"England","reputation":43,"standard":50,"developmentSuitability":53,"loanAttractiveness":46,"positionNeedSeed":75158},{"name":"Scarborough Athletic","leagueId":"national-league-north","division":"National League North","country":"England","reputation":46,"standard":52,"developmentSuitability":53,"loanAttractiveness":47,"positionNeedSeed":2330},{"name":"South Shields","leagueId":"national-league-north","division":"National League North","country":"England","reputation":48,"standard":54,"developmentSuitability":60,"loanAttractiveness":53,"positionNeedSeed":23299},{"name":"Southport","leagueId":"national-league-north","division":"National League North","country":"England","reputation":46,"standard":51,"developmentSuitability":52,"loanAttractiveness":49,"positionNeedSeed":91071},{"name":"Spennymoor Town","leagueId":"national-league-north","division":"National League North","country":"England","reputation":47,"standard":53,"developmentSuitability":59,"loanAttractiveness":52,"positionNeedSeed":69354},{"name":"Worksop Town","leagueId":"national-league-north","division":"National League North","country":"England","reputation":44,"standard":51,"developmentSuitability":52,"loanAttractiveness":48,"positionNeedSeed":70356},{"name":"AFC Totton","leagueId":"national-league-south","division":"National League South","country":"England","reputation":44,"standard":51,"developmentSuitability":53,"loanAttractiveness":48,"positionNeedSeed":6487},{"name":"Bath City","leagueId":"national-league-south","division":"National League South","country":"England","reputation":47,"standard":52,"developmentSuitability":53,"loanAttractiveness":49,"positionNeedSeed":77360},{"name":"Chelmsford City","leagueId":"national-league-south","division":"National League South","country":"England","reputation":47,"standard":53,"developmentSuitability":55,"loanAttractiveness":51,"positionNeedSeed":5300},{"name":"Chesham United","leagueId":"national-league-south","division":"National League South","country":"England","reputation":44,"standard":51,"developmentSuitability":53,"loanAttractiveness":48,"positionNeedSeed":76347},{"name":"Chippenham Town","leagueId":"national-league-south","division":"National League South","country":"England","reputation":43,"standard":50,"developmentSuitability":53,"loanAttractiveness":48,"positionNeedSeed":64848},{"name":"Dagenham & Redbridge","leagueId":"national-league-south","division":"National League South","country":"England","reputation":52,"standard":54,"developmentSuitability":56,"loanAttractiveness":54,"positionNeedSeed":74280},{"name":"Dorking Wanderers","leagueId":"national-league-south","division":"National League South","country":"England","reputation":50,"standard":55,"developmentSuitability":62,"loanAttractiveness":54,"positionNeedSeed":31154},{"name":"Dover Athletic","leagueId":"national-league-south","division":"National League South","country":"England","reputation":49,"standard":53,"developmentSuitability":57,"loanAttractiveness":54,"positionNeedSeed":84572},{"name":"Eastbourne Borough","leagueId":"national-league-south","division":"National League South","country":"England","reputation":47,"standard":53,"developmentSuitability":57,"loanAttractiveness":52,"positionNeedSeed":30882},{"name":"Ebbsfleet United","leagueId":"national-league-south","division":"National League South","country":"England","reputation":51,"standard":54,"developmentSuitability":58,"loanAttractiveness":53,"positionNeedSeed":2912},{"name":"Enfield Town","leagueId":"national-league-south","division":"National League South","country":"England","reputation":43,"standard":50,"developmentSuitability":54,"loanAttractiveness":46,"positionNeedSeed":28174},{"name":"Farnborough","leagueId":"national-league-south","division":"National League South","country":"England","reputation":46,"standard":52,"developmentSuitability":57,"loanAttractiveness":47,"positionNeedSeed":17349},{"name":"Hampton & Richmond Borough","leagueId":"national-league-south","division":"National League South","country":"England","reputation":45,"standard":51,"developmentSuitability":53,"loanAttractiveness":47,"positionNeedSeed":47017},{"name":"Hemel Hempstead Town","leagueId":"national-league-south","division":"National League South","country":"England","reputation":44,"standard":51,"developmentSuitability":52,"loanAttractiveness":47,"positionNeedSeed":3771},{"name":"Hornchurch","leagueId":"national-league-south","division":"National League South","country":"England","reputation":44,"standard":51,"developmentSuitability":53,"loanAttractiveness":48,"positionNeedSeed":27442},{"name":"Horsham","leagueId":"national-league-south","division":"National League South","country":"England","reputation":43,"standard":50,"developmentSuitability":52,"loanAttractiveness":46,"positionNeedSeed":81097},{"name":"Maidenhead United","leagueId":"national-league-south","division":"National League South","country":"England","reputation":49,"standard":53,"developmentSuitability":56,"loanAttractiveness":50,"positionNeedSeed":35401},{"name":"Maidstone United","leagueId":"national-league-south","division":"National League South","country":"England","reputation":50,"standard":54,"developmentSuitability":58,"loanAttractiveness":55,"positionNeedSeed":79176},{"name":"Salisbury","leagueId":"national-league-south","division":"National League South","country":"England","reputation":44,"standard":51,"developmentSuitability":54,"loanAttractiveness":49,"positionNeedSeed":85313},{"name":"Slough Town","leagueId":"national-league-south","division":"National League South","country":"England","reputation":46,"standard":52,"developmentSuitability":56,"loanAttractiveness":51,"positionNeedSeed":68163},{"name":"Tonbridge Angels","leagueId":"national-league-south","division":"National League South","country":"England","reputation":45,"standard":52,"developmentSuitability":57,"loanAttractiveness":48,"positionNeedSeed":90904},{"name":"Torquay United","leagueId":"national-league-south","division":"National League South","country":"England","reputation":53,"standard":55,"developmentSuitability":60,"loanAttractiveness":55,"positionNeedSeed":83082},{"name":"Weston-super-Mare","leagueId":"national-league-south","division":"National League South","country":"England","reputation":46,"standard":52,"developmentSuitability":57,"loanAttractiveness":51,"positionNeedSeed":95489},{"name":"Worthing","leagueId":"national-league-south","division":"National League South","country":"England","reputation":49,"standard":54,"developmentSuitability":58,"loanAttractiveness":50,"positionNeedSeed":14717}];

function nonLeagueNeedHash(text){
  let h=2166136261>>>0;for(let i=0;i<String(text).length;i++){h^=String(text).charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;
}
const NON_LEAGUE_LOAN_POSITIONS=['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','ST'];
function nonLeagueSeasonalPositionNeeds(clubName,seasonYear=2025,count=3){
  const club=NON_LEAGUE_CLUB_PROFILES.find(c=>c.name===clubName);if(!club)return[];
  const scored=NON_LEAGUE_LOAN_POSITIONS.map(pos=>({pos,score:nonLeagueNeedHash(`${club.positionNeedSeed}|${seasonYear}|${pos}`)}));
  return scored.sort((a,b)=>b.score-a.score).slice(0,Math.max(1,Math.min(5,count))).map(x=>x.pos);
}
function nonLeagueLoanDestinations(){
  return (typeof DB!=='undefined'&&Array.isArray(DB.worldClubs)?DB.worldClubs:[]).filter(c=>c.simulationLevel==='loan-only'&&c.loanDestination===true);
}
function isLoanOnlyWorldClub(name){
  const c=typeof worldClubByName==='function'?worldClubByName(name):(typeof DB!=='undefined'?DB.worldClubs?.find(x=>x.name===name):null);
  return Boolean(c&&c.simulationLevel==='loan-only');
}
if(typeof DB!=='undefined'){
  DB.leagues=Array.isArray(DB.leagues)?DB.leagues:[];
  NON_LEAGUE_LEAGUES.forEach(l=>{if(!DB.leagues.some(x=>x.id===l.id))DB.leagues.push({...l});});
  DB.worldClubs=Array.isArray(DB.worldClubs)?DB.worldClubs:[];
  NON_LEAGUE_CLUB_PROFILES.forEach((p,i)=>{
    if(DB.worldClubs.some(x=>x.name===p.name)||(DB.clubs||[]).some(x=>x.name===p.name))return;
    DB.worldClubs.push({
      id:`nonleague-${p.leagueId}-${i+1}`,...p,
      simulationLevel:'loan-only',playable:false,loanDestination:true,
      transferMarketEnabled:false,generatesYouth:false,recruitableSquad:true,loanSystemEnabled:true,freeAgentMarketEnabled:true,
      transferBudget:0,maxWage:0
    });
  });
}


/* --------------------------------------------------------------------------
   PIECE 3 — LIGHTWEIGHT NON-LEAGUE PLAYER MARKET
   --------------------------------------------------------------------------
   These clubs still do not simulate fixtures or full squads. They may:
   - take suitable young players on loan (handled by loans.js)
   - sign a small number of released/free-agent players permanently
   - retain those players in DB.players so they remain scoutable/recruitable
*/
function nonLeagueClubProfile(name){return NON_LEAGUE_CLUB_PROFILES.find(c=>c.name===name)||null;}
function nonLeagueEstimatedMaxWage(clubOrName){
  const c=typeof clubOrName==='string'?nonLeagueClubProfile(clubOrName):clubOrName;if(!c)return 900;
  const tier=c.leagueId==='national-league'?5:6;
  const base=tier===5?1350:650;
  const rep=Math.max(0,(c.reputation||45)-(tier===5?46:42));
  return Math.round((base+rep*(tier===5?110:65))/50)*50;
}
function ensureNonLeagueMarketState(){
  if(typeof state==='undefined'||!state)return null;
  if(!state.nonLeagueMarket)state.nonLeagueMarket={lastMarketDay:null,signings:[],releases:[],lastSeasonRollover:null};
  if(!Array.isArray(state.nonLeagueMarket.signings))state.nonLeagueMarket.signings=[];
  if(!Array.isArray(state.nonLeagueMarket.releases))state.nonLeagueMarket.releases=[];
  return state.nonLeagueMarket;
}
function nonLeagueTrackedPlayers(clubName){
  return (typeof DB!=='undefined'&&Array.isArray(DB.players)?DB.players:[]).filter(p=>!p.retired&&p.club===clubName);
}
function nonLeaguePositionGroup(player){
  if(typeof primaryRecruitmentGroup==='function')return primaryRecruitmentGroup(player);
  const pos=String(player?.positions||'').toUpperCase();
  if(pos.includes('GK'))return'GK';if(pos.includes('CB'))return'CB';if(pos.includes('LB')||pos.includes('LWB'))return'LB';if(pos.includes('RB')||pos.includes('RWB'))return'RB';
  if(pos.includes('CDM')||pos.includes('DM'))return'CDM';if(pos.includes('CAM')||pos.includes('AM'))return'CAM';if(pos.includes('CM'))return'CM';
  if(pos.includes('LW')||pos.includes('LM'))return'LW';if(pos.includes('RW')||pos.includes('RM'))return'RW';if(pos.includes('ST')||pos.includes('CF'))return'ST';return null;
}
function nonLeagueNeedMatches(group,needs){
  if(!group)return false;if(needs.includes(group))return true;
  if(group==='DM'&&needs.includes('CDM'))return true;if(group==='AM'&&needs.includes('CAM'))return true;
  if(group==='CM'&&(needs.includes('CDM')||needs.includes('CAM')))return true;
  if(group==='LB'&&needs.includes('LM'))return true;if(group==='RB'&&needs.includes('RM'))return true;
  return false;
}
function freeAgentReleasedFromEFL(player){
  const lid=player?.releasedFromLeagueId||player?.previousLeagueId||'';
  return ['championship','league-one','league-two'].includes(lid);
}
function nonLeagueFreeAgentEligible(player){
  if(!player||player.retired||player.club!=='Free Agent')return false;
  const age=Number(player.age||25),ovr=Number(player.overall||0);
  if(age<17||age>34||ovr<43||ovr>64)return false;
  return true;
}
function nonLeagueFreeAgentWage(player,club){
  const c=typeof club==='string'?nonLeagueClubProfile(club):club;if(!c)return 500;
  const ceiling=nonLeagueEstimatedMaxWage(c),ovr=Number(player?.overall||50),age=Number(player?.age||24);
  const levelBase=c.leagueId==='national-league'?500:260;
  let wage=levelBase+Math.max(0,ovr-45)*(c.leagueId==='national-league'?85:48);
  if(age<=22&&Number(player?.potential||ovr)>=ovr+6)wage*=1.08;
  return Math.max(250,Math.min(ceiling,Math.round(wage/50)*50));
}
function nonLeagueFreeAgentFitScore(player,club,seasonYear){
  const c=typeof club==='string'?nonLeagueClubProfile(club):club;if(!c||!nonLeagueFreeAgentEligible(player))return -999;
  const tracked=nonLeagueTrackedPlayers(c.name);if(tracked.length>=8)return -999;
  const ovr=Number(player.overall||0),pot=Math.max(ovr,Number(player.potential||ovr)),age=Number(player.age||25);
  const gap=Math.abs(ovr-(c.standard||52));
  if(ovr<(c.standard||52)-9||ovr>(c.standard||52)+8)return -999;
  const needs=nonLeagueSeasonalPositionNeeds(c.name,seasonYear,4),group=nonLeaguePositionGroup(player);
  let score=62-gap*5;
  if(nonLeagueNeedMatches(group,needs))score+=18;else score-=5;
  if(freeAgentReleasedFromEFL(player))score+=12;
  if(age<=23)score+=5;if(age>=31)score-=5;
  score+=Math.min(7,Math.max(0,pot-ovr)*.55);
  const groupCount=tracked.filter(p=>nonLeaguePositionGroup(p)===group).length;if(groupCount>=2)score-=10*groupCount;
  return Math.max(-999,Math.min(120,score));
}
function nonLeagueSignFreeAgent(player,clubName,{silent=true}={}){
  const c=nonLeagueClubProfile(clubName);if(!c||!nonLeagueFreeAgentEligible(player))return false;
  const market=ensureNonLeagueMarketState();if(!market)return false;
  const oldClub=player.club,wage=nonLeagueFreeAgentWage(player,c),sy=typeof currentSeasonStartYear==='function'?currentSeasonStartYear():2025;
  const years=(Number(player.age||25)<=23&&Number(player.potential||player.overall||0)>=Number(player.overall||0)+4)?2:1;
  if(typeof transferPlayerToClub==='function')transferPlayerToClub(player,clubName,0,oldClub,{kind:'free-agent'});
  else{
    if(!state.playerWorldOverrides)state.playerWorldOverrides={};if(!state.playerClubOverrides)state.playerClubOverrides={};
    player.club=clubName;player.joined=`Jul ${sy}`;player.leagueId=c.leagueId;state.playerClubOverrides[player.id]=clubName;
    state.playerWorldOverrides[player.id]={...(state.playerWorldOverrides[player.id]||{}),club:clubName,leagueId:c.leagueId,joined:player.joined};
  }
  player.wage=wage;player.contract=sy+years;
  state.playerWorldOverrides=state.playerWorldOverrides||{};
  state.playerWorldOverrides[player.id]={...(state.playerWorldOverrides[player.id]||{}),wage,contract:player.contract,leagueId:c.leagueId,nonLeaguePermanent:true};
  market.signings.push({playerId:player.id,name:player.name,club:clubName,date:typeof currentGameDateISO==='function'?currentGameDateISO():null,season:sy,wage,contractEnd:player.contract});
  market.signings=market.signings.slice(-500);
  if(!silent&&typeof addNews==='function')addNews(`${player.name} has joined ${clubName} as a free agent.`);
  return true;
}
function markPlayerReleasedToFreeAgency(player,fromClub,reason='released'){
  if(!player||!fromClub)return false;const market=ensureNonLeagueMarketState();
  const oldLeague=typeof byClub==='function'?byClub(fromClub)?.leagueId:player.leagueId;
  if(typeof transferPlayerToClub==='function')transferPlayerToClub(player,'Free Agent',0,fromClub,{kind:'released'});
  else{player.club='Free Agent';if(state){state.playerWorldOverrides=state.playerWorldOverrides||{};state.playerClubOverrides=state.playerClubOverrides||{};state.playerClubOverrides[player.id]='Free Agent';}}
  player.releasedFromClub=fromClub;player.releasedFromLeagueId=oldLeague||player.leagueId||null;player.releaseReason=reason;
  if(state){state.playerWorldOverrides=state.playerWorldOverrides||{};state.playerWorldOverrides[player.id]={...(state.playerWorldOverrides[player.id]||{}),club:'Free Agent',releasedFromClub:fromClub,releasedFromLeagueId:player.releasedFromLeagueId,releaseReason:reason};}
  if(market){market.releases.push({playerId:player.id,name:player.name,fromClub,leagueId:player.releasedFromLeagueId,reason,date:typeof currentGameDateISO==='function'?currentGameDateISO():null});market.releases=market.releases.slice(-500);}
  return true;
}
function processLowerLeagueGeneratedReleases(){
  const market=ensureNonLeagueMarketState();if(!market)return[];
  const sy=typeof currentSeasonStartYear==='function'?currentSeasonStartYear():2025,key=`${sy}-rollover`;
  if(market.lastSeasonRollover===key)return[];
  market.lastSeasonRollover=key;const released=[];
  const clubs=(typeof DB!=='undefined'?[...(DB.worldClubs||[])]:[]).filter(c=>['championship','league-one','league-two'].includes(c.leagueId));
  clubs.forEach(c=>{
    const squad=(DB.players||[]).filter(p=>!p.retired&&p.club===c.name&&!((typeof activeLoanForPlayer==='function')&&activeLoanForPlayer(p)));
    if(squad.length<=20)return;
    const generated=squad.filter(p=>p.generatedPlayer&&(p.age||17)>=18&&!((typeof playerRecentlyTransferred==='function')&&playerRecentlyTransferred(p,120)));
    const standard=Number(c.standard||64);
    const candidates=generated.filter(p=>{
      const age=Number(p.age||18),o=Number(p.overall||0),pot=Math.max(o,Number(p.potential||o));
      if(age<=19)return o<=standard-8&&pot<=standard+2;
      if(age<=22)return o<=standard-5&&pot<=standard+1;
      return o<=standard-3;
    }).sort((a,b)=>(a.overall||0)-(b.overall||0)||((a.potential||0)-(b.potential||0)));
    const maxRelease=Math.min(2,Math.max(0,squad.length-20));
    candidates.slice(0,maxRelease).forEach(p=>{if(markPlayerReleasedToFreeAgency(p,c.name,'EFL squad release'))released.push(p);});
  });
  return released;
}
function processNonLeagueContractChurn(){
  const sy=typeof currentSeasonStartYear==='function'?currentSeasonStartYear():2025;const released=[];
  NON_LEAGUE_CLUB_PROFILES.forEach(c=>{
    nonLeagueTrackedPlayers(c.name).filter(p=>Number(p.contract||9999)<=sy+1).forEach(p=>{
      const keep=Number(p.overall||0)>=Number(c.standard||52)-4&&Number(p.age||25)<=32;
      const roll=typeof stablePlayerTrait==='function'?stablePlayerTrait(p,`nl-renew-${sy}`):Math.random();
      if(keep&&roll>.28){p.contract=sy+1+(Number(p.age||25)<=24?1:0);state.playerWorldOverrides=state.playerWorldOverrides||{};state.playerWorldOverrides[p.id]={...(state.playerWorldOverrides[p.id]||{}),contract:p.contract};}
      else if(markPlayerReleasedToFreeAgency(p,c.name,'Non-league contract expiry'))released.push(p);
    });
  });
  return released;
}
function processNonLeagueFreeAgentMarket(dateISO){
  const market=ensureNonLeagueMarketState();if(!market||typeof currentCareerDay!=='function')return[];
  const day=currentCareerDay();if(market.lastMarketDay!=null&&day-market.lastMarketDay<7)return[];market.lastMarketDay=day;
  const sy=typeof currentSeasonStartYear==='function'?currentSeasonStartYear():2025;
  const free=(DB.players||[]).filter(nonLeagueFreeAgentEligible).sort((a,b)=>{
    const ar=freeAgentReleasedFromEFL(a)?1:0,br=freeAgentReleasedFromEFL(b)?1:0;if(ar!==br)return br-ar;
    return (b.overall||0)-(a.overall||0)||((b.potential||0)-(a.potential||0));
  });
  if(!free.length)return[];const signed=[];
  // Keep this layer intentionally light: at most four tracked permanent moves per market check.
  for(const player of free){
    if(signed.length>=4)break;
    const fits=NON_LEAGUE_CLUB_PROFILES.map(c=>({c,score:nonLeagueFreeAgentFitScore(player,c,sy)})).filter(x=>x.score>=48).sort((a,b)=>b.score-a.score);
    if(!fits.length)continue;
    const best=fits.slice(0,Math.min(4,fits.length));
    const roll=typeof stablePlayerTrait==='function'?stablePlayerTrait(player,`nl-free-${sy}-${Math.floor(day/7)}`):Math.random();
    const pick=best[Math.min(best.length-1,Math.floor(roll*best.length))];
    if(nonLeagueSignFreeAgent(player,pick.c.name,{silent:true}))signed.push({player,club:pick.c.name});
  }
  return signed;
}
function processLightweightNonLeagueSeasonRollover(){
  const efl=processLowerLeagueGeneratedReleases();const nl=processNonLeagueContractChurn();
  // Do not instantly consume the whole free-agent pool: the weekly market will
  // move suitable players organically during pre-season and the season.
  return {eflReleased:efl.length,nonLeagueReleased:nl.length};
}
