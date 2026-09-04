/* Football CEO — English academy profiles (2025/26 baseline)
   Stage 1 of the EFL/finance refactor.

   academyRating is a Football CEO gameplay rating (0-100), not an EPPP category.
   It blends programme standard/resources with recent & historic player-development
   productivity. This deliberately allows a productive Category 3 academy such as
   Exeter City to rate above less productive higher-category programmes.

   epppCategory is kept separately because academy classification primarily describes
   programme structure/resources and should not dictate youth output by itself.
*/

const ENGLISH_ACADEMY_PROFILES = {
  // Premier League
  "Arsenal": {academyRating:95,epppCategory:1},
  "Aston Villa": {academyRating:91,epppCategory:1},
  "Bournemouth": {academyRating:78,epppCategory:2},
  "Brentford": {academyRating:77,epppCategory:2},
  "Brighton": {academyRating:92,epppCategory:1},
  "Burnley": {academyRating:85,epppCategory:1},
  "Chelsea": {academyRating:96,epppCategory:1},
  "Crystal Palace": {academyRating:90,epppCategory:1},
  "Everton": {academyRating:89,epppCategory:1},
  "Fulham": {academyRating:87,epppCategory:1},
  "Leeds United": {academyRating:90,epppCategory:1},
  "Liverpool": {academyRating:94,epppCategory:1},
  "Manchester City": {academyRating:97,epppCategory:1},
  "Manchester United": {academyRating:96,epppCategory:1},
  "Newcastle United": {academyRating:86,epppCategory:1},
  "Nottingham Forest": {academyRating:86,epppCategory:1},
  "Sunderland": {academyRating:91,epppCategory:1},
  "Tottenham Hotspur": {academyRating:92,epppCategory:1},
  "West Ham United": {academyRating:93,epppCategory:1},
  "Wolverhampton Wanderers": {academyRating:87,epppCategory:1},

  // Championship
  "Birmingham City": {academyRating:88,epppCategory:1},
  "Blackburn Rovers": {academyRating:89,epppCategory:1},
  "Bristol City": {academyRating:83,epppCategory:2},
  "Charlton Athletic": {academyRating:86,epppCategory:2},
  "Coventry City": {academyRating:82,epppCategory:2},
  "Derby County": {academyRating:87,epppCategory:1},
  "Hull City": {academyRating:79,epppCategory:2},
  "Ipswich Town": {academyRating:86,epppCategory:1},
  "Leicester City": {academyRating:90,epppCategory:1},
  "Middlesbrough": {academyRating:92,epppCategory:1},
  "Millwall": {academyRating:82,epppCategory:2},
  "Norwich City": {academyRating:89,epppCategory:1},
  "Oxford United": {academyRating:71,epppCategory:3},
  "Portsmouth": {academyRating:74,epppCategory:3},
  "Preston North End": {academyRating:75,epppCategory:3},
  "Queens Park Rangers": {academyRating:80,epppCategory:2},
  "Sheffield United": {academyRating:84,epppCategory:2},
  "Sheffield Wednesday": {academyRating:78,epppCategory:2},
  "Southampton": {academyRating:96,epppCategory:1},
  "Stoke City": {academyRating:86,epppCategory:1},
  "Swansea City": {academyRating:85,epppCategory:2},
  "Watford": {academyRating:80,epppCategory:2},
  "West Bromwich Albion": {academyRating:88,epppCategory:1},
  "Wrexham": {academyRating:68,epppCategory:3},

  // League One
  "AFC Wimbledon": {academyRating:78,epppCategory:3},
  "Barnsley": {academyRating:84,epppCategory:2},
  "Blackpool": {academyRating:73,epppCategory:3},
  "Bolton Wanderers": {academyRating:81,epppCategory:2},
  "Bradford City": {academyRating:71,epppCategory:3},
  "Burton Albion": {academyRating:68,epppCategory:3},
  "Cardiff City": {academyRating:85,epppCategory:2},
  "Doncaster Rovers": {academyRating:73,epppCategory:3},
  "Exeter City": {academyRating:82,epppCategory:3},
  "Huddersfield Town": {academyRating:82,epppCategory:2},
  "Leyton Orient": {academyRating:72,epppCategory:3},
  "Lincoln City": {academyRating:71,epppCategory:3},
  "Luton Town": {academyRating:73,epppCategory:3},
  "Mansfield Town": {academyRating:67,epppCategory:3},
  "Northampton Town": {academyRating:69,epppCategory:3},
  "Peterborough United": {academyRating:84,epppCategory:2},
  "Plymouth Argyle": {academyRating:79,epppCategory:3},
  "Port Vale": {academyRating:69,epppCategory:3},
  "Reading": {academyRating:90,epppCategory:1},
  "Rotherham United": {academyRating:69,epppCategory:3},
  "Stevenage": {academyRating:71,epppCategory:3},
  "Stockport County": {academyRating:73,epppCategory:3},
  "Wigan Athletic": {academyRating:82,epppCategory:2},
  "Wycombe Wanderers": {academyRating:67,epppCategory:3},

  // League Two
  "Accrington Stanley": {academyRating:58,epppCategory:4},
  "Barnet": {academyRating:60,epppCategory:null},
  "Barrow": {academyRating:56,epppCategory:4},
  "Bristol Rovers": {academyRating:70,epppCategory:3},
  "Bromley": {academyRating:58,epppCategory:null},
  "Cambridge United": {academyRating:75,epppCategory:3},
  "Cheltenham Town": {academyRating:69,epppCategory:3},
  "Chesterfield": {academyRating:64,epppCategory:null},
  "Colchester United": {academyRating:85,epppCategory:2},
  "Crawley Town": {academyRating:65,epppCategory:3},
  "Crewe Alexandra": {academyRating:85,epppCategory:3},
  "Fleetwood Town": {academyRating:79,epppCategory:2},
  "Gillingham": {academyRating:68,epppCategory:3},
  "Grimsby Town": {academyRating:59,epppCategory:4},
  "Harrogate Town": {academyRating:55,epppCategory:4},
  "Milton Keynes Dons": {academyRating:78,epppCategory:3},
  "Newport County": {academyRating:57,epppCategory:4},
  "Notts County": {academyRating:61,epppCategory:4},
  "Oldham Athletic": {academyRating:68,epppCategory:3},
  "Salford City": {academyRating:63,epppCategory:3},
  "Shrewsbury Town": {academyRating:70,epppCategory:3},
  "Swindon Town": {academyRating:75,epppCategory:3},
  "Tranmere Rovers": {academyRating:72,epppCategory:3},
  "Walsall": {academyRating:74,epppCategory:3}
};

function academyProfileForClub(name){
  return ENGLISH_ACADEMY_PROFILES[name] || null;
}
function clubAcademyRating(name){
  const profile=academyProfileForClub(name);
  if(profile && Number.isFinite(Number(profile.academyRating))) return Number(profile.academyRating);
  const club=(typeof worldClubByName==='function'?worldClubByName(name):[...(DB?.clubs||[]),...(DB?.worldClubs||[])].find(c=>c.name===name));
  const rep=Number(club?.reputation||club?.standard||70);
  return Math.max(40,Math.min(95,Math.round(52+(rep-60)*1.05)));
}
function clubAcademyCategory(name){
  const value=academyProfileForClub(name)?.epppCategory;
  return Number.isFinite(Number(value))?Number(value):null;
}
function academyProgrammeLabel(name){
  const cat=clubAcademyCategory(name);
  return cat?`Category ${cat}`:'Development programme';
}

// Attach profiles to the club database so both the user-career facility system and
// the background youth ecosystem consume exactly the same academy rating.
if(typeof DB!=='undefined'){
  [...(DB.clubs||[]),...(DB.worldClubs||[])].forEach(club=>{
    const profile=academyProfileForClub(club.name);
    if(!profile) return;
    club.academyRating=profile.academyRating;
    club.epppCategory=profile.epppCategory;
  });
}
