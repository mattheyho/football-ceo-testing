/* Football CEO — Multi-league world foundation v0.19
   Loaded after database.js and before transfers/game.
   Keeps the current Premier League simulation intact while registering
   Championship (standard) + La Liga/Bundesliga (lite) as future-playable leagues.
*/

const WORLD_LEAGUES = [
  {id:'premier-league',name:'Premier League',country:'England',tier:1,clubCount:20,simulationLevel:'full',playable:true,promotionTo:null,relegationTo:'championship'},
  {id:'championship',name:'Championship',country:'England',tier:2,clubCount:24,simulationLevel:'standard',playable:false,promotionTo:'premier-league',relegationTo:'league-one'},
  {id:'la-liga',name:'La Liga',country:'Spain',tier:1,clubCount:20,simulationLevel:'lite',playable:false,promotionTo:null,relegationTo:'segunda'},
  {id:'bundesliga',name:'Bundesliga',country:'Germany',tier:1,clubCount:18,simulationLevel:'lite',playable:false,promotionTo:null,relegationTo:'2-bundesliga'}
];

const WORLD_CLUB_SEEDS = [
  // Championship 2025/26
  ['Birmingham City','championship',73,73,38_000_000,75_000],
  ['Blackburn Rovers','championship',70,71,18_000_000,45_000],
  ['Bristol City','championship',70,71,20_000_000,48_000],
  ['Charlton Athletic','championship',68,69,14_000_000,36_000],
  ['Coventry City','championship',72,72,25_000_000,55_000],
  ['Derby County','championship',71,71,20_000_000,48_000],
  ['Hull City','championship',69,70,18_000_000,43_000],
  ['Ipswich Town','championship',75,74,45_000_000,80_000],
  ['Leicester City','championship',78,75,48_000_000,95_000],
  ['Middlesbrough','championship',73,73,30_000_000,60_000],
  ['Millwall','championship',69,70,16_000_000,40_000],
  ['Norwich City','championship',73,73,30_000_000,62_000],
  ['Oxford United','championship',66,68,10_000_000,30_000],
  ['Portsmouth','championship',70,70,17_000_000,42_000],
  ['Preston North End','championship',68,69,13_000_000,34_000],
  ['Queens Park Rangers','championship',69,70,16_000_000,40_000],
  ['Sheffield United','championship',75,74,38_000_000,75_000],
  ['Sheffield Wednesday','championship',70,70,15_000_000,38_000],
  ['Southampton','championship',76,75,45_000_000,85_000],
  ['Stoke City','championship',71,71,22_000_000,50_000],
  ['Swansea City','championship',70,71,18_000_000,45_000],
  ['Watford','championship',72,72,25_000_000,55_000],
  ['West Bromwich Albion','championship',74,73,30_000_000,65_000],
  ['Wrexham','championship',72,72,32_000_000,60_000],

  // La Liga 2025/26
  ['Athletic Club','la-liga',85,81,50_000_000,120_000],
  ['Atlético Madrid','la-liga',92,84,90_000_000,220_000],
  ['Osasuna','la-liga',79,77,28_000_000,75_000],
  ['Celta Vigo','la-liga',80,78,32_000_000,85_000],
  ['Alavés','la-liga',75,75,22_000_000,60_000],
  ['Elche','la-liga',74,74,20_000_000,55_000],
  ['Barcelona','la-liga',98,87,120_000_000,350_000],
  ['Getafe','la-liga',77,76,25_000_000,70_000],
  ['Girona','la-liga',80,78,30_000_000,82_000],
  ['Levante','la-liga',74,74,20_000_000,55_000],
  ['Mallorca','la-liga',79,77,28_000_000,75_000],
  ['Rayo Vallecano','la-liga',78,76,26_000_000,72_000],
  ['Espanyol','la-liga',78,76,28_000_000,75_000],
  ['Real Betis','la-liga',84,80,45_000_000,110_000],
  ['Real Madrid','la-liga',99,88,180_000_000,400_000],
  ['Real Oviedo','la-liga',73,73,19_000_000,50_000],
  ['Real Sociedad','la-liga',84,80,45_000_000,110_000],
  ['Sevilla','la-liga',82,79,40_000_000,105_000],
  ['Valencia','la-liga',82,79,38_000_000,100_000],
  ['Villarreal','la-liga',84,80,45_000_000,110_000],

  // Bundesliga 2025/26
  ['Augsburg','bundesliga',77,76,28_000_000,75_000],
  ['Union Berlin','bundesliga',78,76,30_000_000,80_000],
  ['Werder Bremen','bundesliga',80,78,35_000_000,90_000],
  ['Borussia Dortmund','bundesliga',91,83,80_000_000,180_000],
  ['Eintracht Frankfurt','bundesliga',84,80,50_000_000,110_000],
  ['Freiburg','bundesliga',82,79,42_000_000,100_000],
  ['Hamburger SV','bundesliga',78,76,30_000_000,80_000],
  ['1. FC Heidenheim','bundesliga',74,74,22_000_000,58_000],
  ['Hoffenheim','bundesliga',79,77,32_000_000,85_000],
  ['1. FC Köln','bundesliga',78,76,30_000_000,80_000],
  ['RB Leipzig','bundesliga',86,81,70_000_000,145_000],
  ['Bayer Leverkusen','bundesliga',90,83,85_000_000,175_000],
  ['Mainz 05','bundesliga',81,78,36_000_000,92_000],
  ['Borussia Mönchengladbach','bundesliga',81,78,38_000_000,95_000],
  ['Bayern Munich','bundesliga',97,87,140_000_000,320_000],
  ['St. Pauli','bundesliga',75,74,24_000_000,62_000],
  ['VfB Stuttgart','bundesliga',85,81,55_000_000,125_000],
  ['Wolfsburg','bundesliga',81,79,40_000_000,100_000]
];

const WORLD_CLUBS = WORLD_CLUB_SEEDS.map((x,i)=>({
  id:`world-${i+1}`,name:x[0],leagueId:x[1],reputation:x[2],standard:x[3],
  transferBudget:x[4],maxWage:x[5],simulationLevel:WORLD_LEAGUES.find(l=>l.id===x[1])?.simulationLevel||'lite',
  playable:false
}));

if(typeof DB!=='undefined'){
  DB.leagues = Array.isArray(DB.leagues) ? DB.leagues : [];
  WORLD_LEAGUES.forEach(l=>{ if(!DB.leagues.some(x=>x.id===l.id)) DB.leagues.push({...l}); });
  DB.worldClubs = Array.isArray(DB.worldClubs) ? DB.worldClubs : [];
  WORLD_CLUBS.forEach(c=>{ if(!DB.worldClubs.some(x=>x.name===c.name) && !DB.clubs.some(x=>x.name===c.name)) DB.worldClubs.push({...c}); });
  // Mark the current active clubs explicitly without changing current fixture logic.
  DB.clubs.forEach(c=>{ if(!c.leagueId) c.leagueId='premier-league'; if(!c.simulationLevel)c.simulationLevel='full'; if(c.playable==null)c.playable=true; });
}

function allWorldClubs(){ return [...(DB?.clubs||[]),...(DB?.worldClubs||[])]; }
function worldClubByName(name){ return allWorldClubs().find(c=>c.name===name)||null; }
function leagueById(id){ return (DB?.leagues||WORLD_LEAGUES).find(l=>l.id===id)||null; }
function leagueForClub(name){ const c=worldClubByName(name); return c?leagueById(c.leagueId):null; }
function clubsInLeague(id){ return allWorldClubs().filter(c=>c.leagueId===id); }
function isLiteWorldClub(name){ return leagueForClub(name)?.simulationLevel==='lite'; }
function isStandardWorldClub(name){ return leagueForClub(name)?.simulationLevel==='standard'; }

// Player data generated by tools/fc26_importer.py can assign leagueId directly.
function hydrateWorldPlayerLeagueIds(){
  if(typeof DB==='undefined'||!Array.isArray(DB.players)) return;
  DB.players.forEach(p=>{
    if(!p.leagueId){ const c=worldClubByName(p.club); if(c)p.leagueId=c.leagueId; }
  });
}
hydrateWorldPlayerLeagueIds();
