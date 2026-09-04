/* Football CEO v0.24.26 — lightweight background league simulation.
   The user's active league is excluded; the other configured leagues run in the background.
   Saudi Pro League is deliberately transfer-market only. */

const BACKGROUND_LEAGUE_CONFIG={
  'premier-league':{start:'08-16',end:'05-24'},
  'championship':{start:'08-09',end:'05-02'},
  'league-one':{start:'08-02',end:'05-02'},
  'league-two':{start:'08-02',end:'05-02'},
  'la-liga':{start:'08-16',end:'05-24'},
  'bundesliga':{start:'08-22',end:'05-16'},
  'serie-a':{start:'08-23',end:'05-24'},
  'ligue-1':{start:'08-15',end:'05-16'}
};

let WORLD_STRENGTH_CACHE=new Map();
let WORLD_STRENGTH_CACHE_PLAYER_COUNT=0;
function invalidateWorldStrengthCache(club=null){
  if(club) WORLD_STRENGTH_CACHE.delete(club); else WORLD_STRENGTH_CACHE.clear();
}
function worldMatchStrength(club){
  if(WORLD_STRENGTH_CACHE_PLAYER_COUNT!==DB.players.length){WORLD_STRENGTH_CACHE.clear();WORLD_STRENGTH_CACHE_PLAYER_COUNT=DB.players.length;}
  if(WORLD_STRENGTH_CACHE.has(club))return WORLD_STRENGTH_CACHE.get(club);
  const players=DB.players.filter(p=>p.club===club).sort((a,b)=>(b.overall||0)-(a.overall||0)).slice(0,16);
  const fallback=worldClubByName(club)?.standard||72;
  const strength=players.length?players.reduce((s,p)=>s+(p.overall||0),0)/players.length:fallback;
  WORLD_STRENGTH_CACHE.set(club,strength);return strength;
}
function worldRoundRobin(names){
  let arr=[...names]; if(arr.length%2)arr.push(null); const n=arr.length,rounds=[];
  for(let r=0;r<n-1;r++){
    const games=[];
    for(let i=0;i<n/2;i++){const a=arr[i],b=arr[n-1-i];if(a&&b)games.push(r%2?{home:b,away:a}:{home:a,away:b});}
    rounds.push(games);arr=[arr[0],arr[n-1],...arr.slice(1,n-1)];
  }
  return [...rounds,...rounds.map(gs=>gs.map(g=>({home:g.away,away:g.home})))];
}
function blankWorldTable(id){const t={};clubsInLeague(id).forEach(c=>t[c.name]={p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0});return t;}
function ensureWorldCompetitionState(id){
  if(!BACKGROUND_LEAGUE_CONFIG[id])return null;
  state.worldCompetitions=state.worldCompetitions||{};
  const names=clubsInLeague(id).map(c=>c.name);
  let c=state.worldCompetitions[id];
  if(!c||!Array.isArray(c.fixtures)||c.clubCount!==names.length){c=state.worldCompetitions[id]={leagueId:id,clubCount:names.length,week:0,fixtures:worldRoundRobin(names),table:blankWorldTable(id),results:{}};}
  return c;
}
function ensureChampionshipState(){return ensureWorldCompetitionState('championship');}
function worldGoalSample(strength,opp,home=false){
  const edge=(strength-opp)*0.035+(home?0.16:0);let lambda=Math.max(.45,1.28+edge);let goals=0;
  for(let x=Math.random(),p=Math.exp(-lambda);x>p&&goals<7;goals++)x*=Math.random();return goals;
}
function applyWorldResult(t,home,away,hg,ag){
  const h=t[home],a=t[away]; if(!h||!a)return; h.p++;a.p++;h.gf+=hg;h.ga+=ag;a.gf+=ag;a.ga+=hg;
  if(hg>ag){h.w++;a.l++;h.pts+=3;}else if(ag>hg){a.w++;h.l++;a.pts+=3;}else{h.d++;a.d++;h.pts++;a.pts++;}
}
function simulateWorldLeagueRound(id,roundNo){
  const c=ensureWorldCompetitionState(id); if(!c||roundNo<1||roundNo>c.fixtures.length||roundNo<=c.week)return false;
  const games=c.fixtures[roundNo-1];
  games.forEach((g,i)=>{const hs=worldMatchStrength(g.home),as=worldMatchStrength(g.away);const hg=worldGoalSample(hs,as,true),ag=worldGoalSample(as,hs,false);c.results[`${roundNo}-${i}`]={home:g.home,away:g.away,hg,ag};applyWorldResult(c.table,g.home,g.away,hg,ag);});
  c.week=roundNo;return true;
}
function worldLeagueStandings(id){
  const active=typeof careerLeagueId==='function'?careerLeagueId():state?.leagueId;
  if(id===active&&state?.table){return Object.entries(state.table).map(([name,x])=>({name,...x,gd:x.gf-x.ga})).sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||a.name.localeCompare(b.name));}
  const c=ensureWorldCompetitionState(id);if(!c)return[];
  const rows=Object.entries(c.table).map(([name,x])=>({name,...x,gd:x.gf-x.ga}));return typeof sortEnglishStandings==='function'?sortEnglishStandings(rows,id):rows.sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||a.name.localeCompare(b.name));
}
function backgroundDate(year,md){const [m,d]=md.split('-');const y=Number(m)<=6?year+1:year;return `${y}-${m}-${d}`;}
function bgDateDiff(a,b){return Math.round((Date.parse(`${b}T00:00:00Z`)-Date.parse(`${a}T00:00:00Z`))/86400000);}
function backgroundLeagueProgressTarget(id,dateISO){
  const cfg=BACKGROUND_LEAGUE_CONFIG[id],c=ensureWorldCompetitionState(id);if(!cfg||!c)return 0;
  const y=typeof currentSeasonStartYear==='function'?currentSeasonStartYear():2025;const start=backgroundDate(y,cfg.start),end=backgroundDate(y,cfg.end);
  if(dateISO<start)return 0;if(dateISO>=end)return c.fixtures.length;
  const total=Math.max(1,bgDateDiff(start,end)),done=Math.max(0,bgDateDiff(start,dateISO));return Math.min(c.fixtures.length,Math.floor((done/total)*c.fixtures.length));
}
function processBackgroundLeaguesDay(dateISO){
  const active=typeof careerLeagueId==='function'?careerLeagueId():state?.leagueId;
  Object.keys(BACKGROUND_LEAGUE_CONFIG).forEach(id=>{if(id===active)return;const c=ensureWorldCompetitionState(id);const target=backgroundLeagueProgressTarget(id,dateISO);while(c.week<target)simulateWorldLeagueRound(id,c.week+1);});
}
function processChampionshipDay(dateISO){return processBackgroundLeaguesDay(dateISO);}
function championshipStandings(){return worldLeagueStandings('championship');}
function leagueOneStandings(){return worldLeagueStandings('league-one');}
function leagueTwoStandings(){return worldLeagueStandings('league-two');}
function worldPromotionPlaces(id){
  const s=worldLeagueStandings(id),rules=leagueById(id)?.promotionRules;
  if(!rules)return{automatic:[],playoffs:[]};
  return{automatic:s.slice(0,rules.automatic||0),playoffs:s.slice(Math.max(0,(rules.playoffFrom||1)-1),rules.playoffTo||0)};
}
function championshipPromotionPlaces(){return worldPromotionPlaces('championship');}
function leagueOnePromotionPlaces(){return worldPromotionPlaces('league-one');}
function leagueTwoPromotionPlaces(){return worldPromotionPlaces('league-two');}
function resetChampionshipCompetitionForSeason(){
  const active=typeof careerLeagueId==='function'?careerLeagueId():state?.leagueId;
  state.worldCompetitions={};Object.keys(BACKGROUND_LEAGUE_CONFIG).forEach(id=>{if(id!==active)ensureWorldCompetitionState(id);});invalidateWorldStrengthCache();
}
