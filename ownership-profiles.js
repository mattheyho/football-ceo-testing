/* Football CEO — English ownership profiles (2025/26 gameplay baseline)
   Piece 8A.

   These are bespoke gameplay profiles for the 92 Premier League/EFL clubs, not
   legal descriptions of ownership structures or reproductions of club accounts.

   Ratings use a 0-100 scale. playerTradingPreference means how strongly the
   ownership model favours recruiting for value, developing assets and recycling
   transfer proceeds; a low score favours retaining established players / buying
   primarily for immediate sporting performance.

   lossTolerance is the approximate annual structural-loss level (GBP) at which
   sustained losses become a serious owner-confidence issue. It is deliberately
   separate from fundingStrength: wealthy ownership can still demand discipline.
*/

const ENGLISH_OWNERSHIP_PROFILES = {
  // Premier League
  "Arsenal": {model:"Major private ownership",fundingStrength:88,lossTolerance:60000000,performancePressure:92,sustainabilityPriority:76,academyPriority:88,infrastructurePriority:84,playerTradingPreference:68},
  "Aston Villa": {model:"Ambitious private ownership",fundingStrength:90,lossTolerance:65000000,performancePressure:86,sustainabilityPriority:58,academyPriority:84,infrastructurePriority:92,playerTradingPreference:72},
  "Bournemouth": {model:"Growth-focused private ownership",fundingStrength:78,lossTolerance:35000000,performancePressure:72,sustainabilityPriority:66,academyPriority:68,infrastructurePriority:86,playerTradingPreference:78},
  "Brentford": {model:"Analytics-led private ownership",fundingStrength:67,lossTolerance:24000000,performancePressure:66,sustainabilityPriority:93,academyPriority:74,infrastructurePriority:78,playerTradingPreference:98},
  "Brighton": {model:"Analytics-led private ownership",fundingStrength:76,lossTolerance:36000000,performancePressure:70,sustainabilityPriority:91,academyPriority:90,infrastructurePriority:88,playerTradingPreference:99},
  "Burnley": {model:"Investor-backed private ownership",fundingStrength:61,lossTolerance:18000000,performancePressure:72,sustainabilityPriority:73,academyPriority:73,infrastructurePriority:68,playerTradingPreference:77},
  "Chelsea": {model:"High-capital investor consortium",fundingStrength:97,lossTolerance:100000000,performancePressure:94,sustainabilityPriority:49,academyPriority:92,infrastructurePriority:82,playerTradingPreference:84},
  "Crystal Palace": {model:"Multi-investor private ownership",fundingStrength:73,lossTolerance:30000000,performancePressure:72,sustainabilityPriority:72,academyPriority:88,infrastructurePriority:84,playerTradingPreference:75},
  "Everton": {model:"Ambitious private ownership",fundingStrength:80,lossTolerance:30000000,performancePressure:80,sustainabilityPriority:72,academyPriority:82,infrastructurePriority:90,playerTradingPreference:66},
  "Fulham": {model:"Benefactor-backed private ownership",fundingStrength:86,lossTolerance:45000000,performancePressure:72,sustainabilityPriority:61,academyPriority:80,infrastructurePriority:82,playerTradingPreference:61},
  "Leeds United": {model:"Investor consortium",fundingStrength:83,lossTolerance:40000000,performancePressure:84,sustainabilityPriority:68,academyPriority:88,infrastructurePriority:86,playerTradingPreference:70},
  "Liverpool": {model:"Strategic private ownership",fundingStrength:84,lossTolerance:50000000,performancePressure:96,sustainabilityPriority:86,academyPriority:91,infrastructurePriority:88,playerTradingPreference:78},
  "Manchester City": {model:"State-linked high-capital ownership",fundingStrength:100,lossTolerance:120000000,performancePressure:99,sustainabilityPriority:54,academyPriority:94,infrastructurePriority:98,playerTradingPreference:72},
  "Manchester United": {model:"Major private ownership",fundingStrength:92,lossTolerance:65000000,performancePressure:98,sustainabilityPriority:69,academyPriority:96,infrastructurePriority:95,playerTradingPreference:58},
  "Newcastle United": {model:"State-backed high-capital ownership",fundingStrength:99,lossTolerance:95000000,performancePressure:91,sustainabilityPriority:52,academyPriority:82,infrastructurePriority:97,playerTradingPreference:62},
  "Nottingham Forest": {model:"Ambitious private ownership",fundingStrength:82,lossTolerance:45000000,performancePressure:84,sustainabilityPriority:55,academyPriority:72,infrastructurePriority:79,playerTradingPreference:74},
  "Sunderland": {model:"Long-term private ownership",fundingStrength:75,lossTolerance:26000000,performancePressure:76,sustainabilityPriority:79,academyPriority:94,infrastructurePriority:80,playerTradingPreference:82},
  "Tottenham Hotspur": {model:"Major private ownership",fundingStrength:90,lossTolerance:60000000,performancePressure:91,sustainabilityPriority:78,academyPriority:87,infrastructurePriority:99,playerTradingPreference:66},
  "West Ham United": {model:"Private ownership group",fundingStrength:78,lossTolerance:35000000,performancePressure:79,sustainabilityPriority:67,academyPriority:91,infrastructurePriority:70,playerTradingPreference:68},
  "Wolverhampton Wanderers": {model:"International private ownership",fundingStrength:70,lossTolerance:22000000,performancePressure:75,sustainabilityPriority:82,academyPriority:73,infrastructurePriority:72,playerTradingPreference:88},

  // Championship
  "Birmingham City": {model:"High-growth investor ownership",fundingStrength:90,lossTolerance:30000000,performancePressure:92,sustainabilityPriority:53,academyPriority:84,infrastructurePriority:99,playerTradingPreference:69},
  "Blackburn Rovers": {model:"Long-term private ownership",fundingStrength:55,lossTolerance:9000000,performancePressure:67,sustainabilityPriority:78,academyPriority:90,infrastructurePriority:66,playerTradingPreference:84},
  "Bristol City": {model:"Benefactor-backed private ownership",fundingStrength:72,lossTolerance:15000000,performancePressure:74,sustainabilityPriority:70,academyPriority:84,infrastructurePriority:84,playerTradingPreference:72},
  "Charlton Athletic": {model:"Investor consortium",fundingStrength:61,lossTolerance:9000000,performancePressure:73,sustainabilityPriority:74,academyPriority:87,infrastructurePriority:69,playerTradingPreference:76},
  "Coventry City": {model:"Private ownership",fundingStrength:63,lossTolerance:10000000,performancePressure:78,sustainabilityPriority:78,academyPriority:76,infrastructurePriority:82,playerTradingPreference:78},
  "Derby County": {model:"Local private ownership",fundingStrength:67,lossTolerance:12000000,performancePressure:77,sustainabilityPriority:82,academyPriority:89,infrastructurePriority:83,playerTradingPreference:66},
  "Hull City": {model:"Ambitious private ownership",fundingStrength:70,lossTolerance:14000000,performancePressure:79,sustainabilityPriority:65,academyPriority:70,infrastructurePriority:74,playerTradingPreference:73},
  "Ipswich Town": {model:"Institutional investor ownership",fundingStrength:86,lossTolerance:28000000,performancePressure:88,sustainabilityPriority:72,academyPriority:88,infrastructurePriority:91,playerTradingPreference:74},
  "Leicester City": {model:"Benefactor-style private ownership",fundingStrength:79,lossTolerance:24000000,performancePressure:91,sustainabilityPriority:68,academyPriority:90,infrastructurePriority:88,playerTradingPreference:72},
  "Middlesbrough": {model:"Long-term local ownership",fundingStrength:74,lossTolerance:18000000,performancePressure:82,sustainabilityPriority:72,academyPriority:96,infrastructurePriority:82,playerTradingPreference:72},
  "Millwall": {model:"Long-term private ownership",fundingStrength:58,lossTolerance:9000000,performancePressure:70,sustainabilityPriority:81,academyPriority:78,infrastructurePriority:78,playerTradingPreference:72},
  "Norwich City": {model:"Sustainability-led private ownership",fundingStrength:60,lossTolerance:9000000,performancePressure:76,sustainabilityPriority:91,academyPriority:90,infrastructurePriority:83,playerTradingPreference:90},
  "Oxford United": {model:"Investor-backed private ownership",fundingStrength:66,lossTolerance:11000000,performancePressure:72,sustainabilityPriority:68,academyPriority:68,infrastructurePriority:98,playerTradingPreference:70},
  "Portsmouth": {model:"Long-term private ownership",fundingStrength:69,lossTolerance:13000000,performancePressure:80,sustainabilityPriority:79,academyPriority:70,infrastructurePriority:88,playerTradingPreference:67},
  "Preston North End": {model:"Family/private ownership",fundingStrength:55,lossTolerance:8000000,performancePressure:67,sustainabilityPriority:84,academyPriority:67,infrastructurePriority:64,playerTradingPreference:80},
  "Queens Park Rangers": {model:"Investor consortium",fundingStrength:68,lossTolerance:13000000,performancePressure:75,sustainabilityPriority:76,academyPriority:75,infrastructurePriority:86,playerTradingPreference:74},
  "Sheffield United": {model:"International private ownership",fundingStrength:72,lossTolerance:16000000,performancePressure:84,sustainabilityPriority:68,academyPriority:82,infrastructurePriority:78,playerTradingPreference:73},
  "Sheffield Wednesday": {model:"Private ownership",fundingStrength:58,lossTolerance:10000000,performancePressure:82,sustainabilityPriority:57,academyPriority:67,infrastructurePriority:70,playerTradingPreference:62},
  "Southampton": {model:"Multi-club investor ownership",fundingStrength:80,lossTolerance:24000000,performancePressure:89,sustainabilityPriority:75,academyPriority:98,infrastructurePriority:88,playerTradingPreference:94},
  "Stoke City": {model:"Wealthy local private ownership",fundingStrength:78,lossTolerance:20000000,performancePressure:82,sustainabilityPriority:71,academyPriority:82,infrastructurePriority:86,playerTradingPreference:64},
  "Swansea City": {model:"Investor consortium",fundingStrength:59,lossTolerance:8500000,performancePressure:72,sustainabilityPriority:83,academyPriority:84,infrastructurePriority:72,playerTradingPreference:88},
  "Watford": {model:"Football-trading private ownership",fundingStrength:67,lossTolerance:12000000,performancePressure:88,sustainabilityPriority:68,academyPriority:72,infrastructurePriority:73,playerTradingPreference:96},
  "West Bromwich Albion": {model:"Private investment ownership",fundingStrength:69,lossTolerance:14000000,performancePressure:82,sustainabilityPriority:77,academyPriority:86,infrastructurePriority:78,playerTradingPreference:72},
  "Wrexham": {model:"High-growth private ownership",fundingStrength:91,lossTolerance:22000000,performancePressure:90,sustainabilityPriority:55,academyPriority:70,infrastructurePriority:97,playerTradingPreference:64},

  // League One
  "AFC Wimbledon": {model:"Supporter-owned",fundingStrength:12,lossTolerance:700000,performancePressure:55,sustainabilityPriority:98,academyPriority:86,infrastructurePriority:92,playerTradingPreference:86},
  "Barnsley": {model:"Investor consortium",fundingStrength:52,lossTolerance:3500000,performancePressure:77,sustainabilityPriority:82,academyPriority:89,infrastructurePriority:70,playerTradingPreference:94},
  "Blackpool": {model:"Local private ownership",fundingStrength:49,lossTolerance:3000000,performancePressure:72,sustainabilityPriority:78,academyPriority:67,infrastructurePriority:75,playerTradingPreference:79},
  "Bolton Wanderers": {model:"Private ownership group",fundingStrength:58,lossTolerance:4500000,performancePressure:82,sustainabilityPriority:74,academyPriority:78,infrastructurePriority:82,playerTradingPreference:69},
  "Bradford City": {model:"Private ownership",fundingStrength:48,lossTolerance:2800000,performancePressure:77,sustainabilityPriority:79,academyPriority:69,infrastructurePriority:74,playerTradingPreference:74},
  "Burton Albion": {model:"Long-term local ownership",fundingStrength:35,lossTolerance:1500000,performancePressure:56,sustainabilityPriority:92,academyPriority:70,infrastructurePriority:84,playerTradingPreference:84},
  "Cardiff City": {model:"Wealthy private ownership",fundingStrength:70,lossTolerance:8500000,performancePressure:87,sustainabilityPriority:61,academyPriority:83,infrastructurePriority:76,playerTradingPreference:67},
  "Doncaster Rovers": {model:"Local private ownership",fundingStrength:42,lossTolerance:2200000,performancePressure:65,sustainabilityPriority:84,academyPriority:71,infrastructurePriority:72,playerTradingPreference:77},
  "Exeter City": {model:"Supporters' Trust",fundingStrength:8,lossTolerance:500000,performancePressure:45,sustainabilityPriority:99,academyPriority:97,infrastructurePriority:90,playerTradingPreference:93},
  "Huddersfield Town": {model:"Ambitious private ownership",fundingStrength:65,lossTolerance:7500000,performancePressure:84,sustainabilityPriority:69,academyPriority:80,infrastructurePriority:84,playerTradingPreference:75},
  "Leyton Orient": {model:"Investor-backed private ownership",fundingStrength:50,lossTolerance:3200000,performancePressure:70,sustainabilityPriority:74,academyPriority:69,infrastructurePriority:76,playerTradingPreference:74},
  "Lincoln City": {model:"Community-minded private ownership",fundingStrength:45,lossTolerance:2500000,performancePressure:67,sustainabilityPriority:88,academyPriority:69,infrastructurePriority:82,playerTradingPreference:80},
  "Luton Town": {model:"Supporter-rooted private ownership",fundingStrength:61,lossTolerance:6500000,performancePressure:84,sustainabilityPriority:88,academyPriority:70,infrastructurePriority:99,playerTradingPreference:84},
  "Mansfield Town": {model:"Benefactor-backed private ownership",fundingStrength:55,lossTolerance:3500000,performancePressure:72,sustainabilityPriority:73,academyPriority:64,infrastructurePriority:77,playerTradingPreference:69},
  "Northampton Town": {model:"Local private ownership",fundingStrength:41,lossTolerance:2000000,performancePressure:64,sustainabilityPriority:83,academyPriority:68,infrastructurePriority:73,playerTradingPreference:75},
  "Peterborough United": {model:"Trading-led private ownership",fundingStrength:56,lossTolerance:3800000,performancePressure:78,sustainabilityPriority:82,academyPriority:88,infrastructurePriority:71,playerTradingPreference:99},
  "Plymouth Argyle": {model:"Private ownership group",fundingStrength:54,lossTolerance:4000000,performancePressure:78,sustainabilityPriority:80,academyPriority:79,infrastructurePriority:86,playerTradingPreference:79},
  "Port Vale": {model:"Community-minded private ownership",fundingStrength:43,lossTolerance:2300000,performancePressure:66,sustainabilityPriority:87,academyPriority:67,infrastructurePriority:82,playerTradingPreference:72},
  "Reading": {model:"Transitional private ownership",fundingStrength:45,lossTolerance:2500000,performancePressure:80,sustainabilityPriority:91,academyPriority:96,infrastructurePriority:67,playerTradingPreference:86},
  "Rotherham United": {model:"Long-term local ownership",fundingStrength:46,lossTolerance:2800000,performancePressure:72,sustainabilityPriority:85,academyPriority:66,infrastructurePriority:80,playerTradingPreference:74},
  "Stevenage": {model:"Long-term private ownership",fundingStrength:39,lossTolerance:1800000,performancePressure:61,sustainabilityPriority:88,academyPriority:69,infrastructurePriority:73,playerTradingPreference:81},
  "Stockport County": {model:"Ambitious benefactor ownership",fundingStrength:68,lossTolerance:6500000,performancePressure:86,sustainabilityPriority:66,academyPriority:75,infrastructurePriority:96,playerTradingPreference:72},
  "Wigan Athletic": {model:"Private ownership group",fundingStrength:44,lossTolerance:3000000,performancePressure:73,sustainabilityPriority:86,academyPriority:82,infrastructurePriority:70,playerTradingPreference:80},
  "Wycombe Wanderers": {model:"Private ownership",fundingStrength:43,lossTolerance:2200000,performancePressure:64,sustainabilityPriority:89,academyPriority:63,infrastructurePriority:78,playerTradingPreference:84},

  // League Two
  "Accrington Stanley": {model:"Long-term local ownership",fundingStrength:24,lossTolerance:600000,performancePressure:50,sustainabilityPriority:96,academyPriority:57,infrastructurePriority:64,playerTradingPreference:89},
  "Barnet": {model:"Long-term private ownership",fundingStrength:45,lossTolerance:1800000,performancePressure:68,sustainabilityPriority:78,academyPriority:58,infrastructurePriority:93,playerTradingPreference:72},
  "Barrow": {model:"Local/private ownership",fundingStrength:31,lossTolerance:900000,performancePressure:58,sustainabilityPriority:90,academyPriority:54,infrastructurePriority:73,playerTradingPreference:82},
  "Bristol Rovers": {model:"Private ownership",fundingStrength:48,lossTolerance:2200000,performancePressure:75,sustainabilityPriority:74,academyPriority:68,infrastructurePriority:79,playerTradingPreference:72},
  "Bromley": {model:"Ambitious private ownership",fundingStrength:52,lossTolerance:2500000,performancePressure:74,sustainabilityPriority:70,academyPriority:56,infrastructurePriority:89,playerTradingPreference:70},
  "Cambridge United": {model:"Community/private ownership",fundingStrength:35,lossTolerance:1200000,performancePressure:61,sustainabilityPriority:90,academyPriority:79,infrastructurePriority:79,playerTradingPreference:83},
  "Cheltenham Town": {model:"Local private ownership",fundingStrength:30,lossTolerance:900000,performancePressure:57,sustainabilityPriority:91,academyPriority:68,infrastructurePriority:69,playerTradingPreference:84},
  "Chesterfield": {model:"Community-rooted private ownership",fundingStrength:50,lossTolerance:2300000,performancePressure:76,sustainabilityPriority:76,academyPriority:62,infrastructurePriority:83,playerTradingPreference:72},
  "Colchester United": {model:"Long-term private ownership",fundingStrength:46,lossTolerance:1800000,performancePressure:63,sustainabilityPriority:80,academyPriority:94,infrastructurePriority:84,playerTradingPreference:86},
  "Crawley Town": {model:"Investor-backed private ownership",fundingStrength:41,lossTolerance:1700000,performancePressure:66,sustainabilityPriority:73,academyPriority:61,infrastructurePriority:68,playerTradingPreference:80},
  "Crewe Alexandra": {model:"Development-led private ownership",fundingStrength:33,lossTolerance:1000000,performancePressure:58,sustainabilityPriority:93,academyPriority:98,infrastructurePriority:77,playerTradingPreference:99},
  "Fleetwood Town": {model:"Private ownership",fundingStrength:47,lossTolerance:2200000,performancePressure:66,sustainabilityPriority:75,academyPriority:85,infrastructurePriority:84,playerTradingPreference:90},
  "Gillingham": {model:"Ambitious private ownership",fundingStrength:60,lossTolerance:3500000,performancePressure:84,sustainabilityPriority:66,academyPriority:65,infrastructurePriority:87,playerTradingPreference:68},
  "Grimsby Town": {model:"Community-minded private ownership",fundingStrength:34,lossTolerance:1200000,performancePressure:63,sustainabilityPriority:91,academyPriority:58,infrastructurePriority:78,playerTradingPreference:82},
  "Harrogate Town": {model:"Benefactor-backed local ownership",fundingStrength:47,lossTolerance:2000000,performancePressure:58,sustainabilityPriority:75,academyPriority:53,infrastructurePriority:83,playerTradingPreference:68},
  "Milton Keynes Dons": {model:"Private ownership",fundingStrength:52,lossTolerance:2600000,performancePressure:82,sustainabilityPriority:72,academyPriority:83,infrastructurePriority:91,playerTradingPreference:75},
  "Newport County": {model:"Community/private ownership",fundingStrength:25,lossTolerance:700000,performancePressure:55,sustainabilityPriority:95,academyPriority:56,infrastructurePriority:70,playerTradingPreference:88},
  "Notts County": {model:"Ambitious private ownership",fundingStrength:53,lossTolerance:2600000,performancePressure:79,sustainabilityPriority:73,academyPriority:59,infrastructurePriority:82,playerTradingPreference:75},
  "Oldham Athletic": {model:"Local private ownership",fundingStrength:50,lossTolerance:2300000,performancePressure:78,sustainabilityPriority:76,academyPriority:67,infrastructurePriority:89,playerTradingPreference:72},
  "Salford City": {model:"Investor-backed private ownership",fundingStrength:63,lossTolerance:4000000,performancePressure:86,sustainabilityPriority:59,academyPriority:64,infrastructurePriority:82,playerTradingPreference:62},
  "Shrewsbury Town": {model:"Local private ownership",fundingStrength:32,lossTolerance:1100000,performancePressure:62,sustainabilityPriority:91,academyPriority:68,infrastructurePriority:74,playerTradingPreference:83},
  "Swindon Town": {model:"Private ownership",fundingStrength:42,lossTolerance:1700000,performancePressure:76,sustainabilityPriority:74,academyPriority:75,infrastructurePriority:72,playerTradingPreference:76},
  "Tranmere Rovers": {model:"Long-term local ownership",fundingStrength:37,lossTolerance:1400000,performancePressure:67,sustainabilityPriority:88,academyPriority:70,infrastructurePriority:80,playerTradingPreference:79},
  "Walsall": {model:"Private ownership group",fundingStrength:39,lossTolerance:1500000,performancePressure:67,sustainabilityPriority:86,academyPriority:75,infrastructurePriority:77,playerTradingPreference:82}
};

const OWNERSHIP_PROFILE_VERSION = 1;
const OWNERSHIP_PROFILE_RATING_FIELDS = [
  'fundingStrength','performancePressure','sustainabilityPriority',
  'academyPriority','infrastructurePriority','playerTradingPreference'
];

function ownershipProfileForClub(name){
  const p=ENGLISH_OWNERSHIP_PROFILES[name];
  return p?{...p}:null;
}

function ensureOwnershipProfileState(){
  if(typeof state==='undefined'||!state?.club) return null;
  const baseline=ownershipProfileForClub(state.club);
  if(!baseline) return state.ownerProfile||null;

  // Piece 8A migration: old saves only had {lossTolerance: 15000000}. Move
  // them onto the club-specific baseline once; after that preserve state so a
  // future takeover/owner-change system can legitimately modify the profile.
  if(Number(state.ownerProfileVersion||0)<OWNERSHIP_PROFILE_VERSION){
    state.ownerProfile={...baseline};
    state.ownerProfileVersion=OWNERSHIP_PROFILE_VERSION;
  }else{
    state.ownerProfile={...baseline,...(state.ownerProfile||{})};
  }
  return state.ownerProfile;
}

function ownerPriority(name,key,fallback=50){
  const p=(typeof state!=='undefined'&&state?.club===name&&state?.ownerProfile)
    ? state.ownerProfile
    : ENGLISH_OWNERSHIP_PROFILES[name];
  const v=Number(p?.[key]);
  return Number.isFinite(v)?Math.max(0,Math.min(100,v)):fallback;
}


function ownerPriorityLabel(value){
  const v=Math.max(0,Math.min(100,Number(value)||0));
  if(v>=92) return 'Very high';
  if(v>=80) return 'High';
  if(v>=65) return 'Above average';
  if(v>=45) return 'Moderate';
  if(v>=25) return 'Low';
  return 'Very low';
}

function ownerFundingLabel(value){
  const v=Math.max(0,Math.min(100,Number(value)||0));
  if(v>=95) return 'Exceptional';
  if(v>=85) return 'Very strong';
  if(v>=70) return 'Strong';
  if(v>=50) return 'Moderate';
  if(v>=30) return 'Limited';
  return 'Minimal';
}

function ownerActionReaction(action,context={},name=(typeof state!=='undefined'?state?.club:null)){
  const p=(typeof state!=='undefined'&&state?.club===name&&state?.ownerProfile)?state.ownerProfile:ownershipProfileForClub(name);
  if(!p) return 0;
  const priority=k=>Math.max(0,Math.min(100,Number(p[k])||50));
  if(action==='academy-investment'){
    const score=priority('academyPriority');
    return score>=92?3:score>=80?2:score>=65?1:score<35?-1:0;
  }
  if(action==='infrastructure-investment'){
    const score=priority('infrastructurePriority');
    return score>=92?3:score>=80?2:score>=65?1:score<35?-1:0;
  }
  if(action==='player-sale'){
    const trading=priority('playerTradingPreference');
    const feeRatio=Number(context.feeRatio||1);
    const isStar=Boolean(context.isStar);
    const replaced=Boolean(context.replaced);
    let delta=feeRatio>=1.15?1:feeRatio<.90?-2:0;
    if(trading>=90 && feeRatio>=1.05) delta+=isStar?1:2;
    else if(trading>=80 && feeRatio>=1.10) delta+=1;
    if(trading<=55 && isStar && !replaced) delta-=1;
    return Math.max(-3,Math.min(3,delta));
  }
  if(action==='transfer-spend'){
    const trading=priority('playerTradingPreference'),sustain=priority('sustainabilityPriority');
    const feeRatio=Number(context.feeRatio||1);
    const age=Number(context.age||25);
    let delta=feeRatio>1.30?-2:feeRatio<=1.05?1:0;
    if(trading>=88 && age<=24 && feeRatio<=1.15) delta+=1;
    if(sustain>=90 && feeRatio>1.20) delta-=1;
    return Math.max(-3,Math.min(3,delta));
  }
  return 0;
}

function ownershipPresentation(name){
  const p=ownershipProfileForClub(name);
  if(!p) return null;
  return {
    model:p.model,
    backing:ownerFundingLabel(p.fundingStrength),
    expectations:ownerPriorityLabel(p.performancePressure),
    sustainability:ownerPriorityLabel(p.sustainabilityPriority),
    academy:ownerPriorityLabel(p.academyPriority),
    infrastructure:ownerPriorityLabel(p.infrastructurePriority),
    trading:ownerPriorityLabel(p.playerTradingPreference)
  };
}

function ownerFundingRate(name){
  const strength=ownerPriority(name,'fundingStrength',50)/100;
  // 0.5% to 10% of modelled annual revenue. This is willingness/capacity to
  // inject fresh equity, not permission to spend cash the club already owns.
  return 0.005+0.095*Math.pow(strength,1.35);
}

if(typeof DB!=='undefined'){
  [...(DB.clubs||[]),...(DB.worldClubs||[])].forEach(club=>{
    const p=ENGLISH_OWNERSHIP_PROFILES[club.name];
    if(p) club.ownershipProfile={...p};
  });
}

if(typeof globalThis!=='undefined'){
  globalThis.FootballCEOOwnership={
    version:OWNERSHIP_PROFILE_VERSION,
    profiles:ENGLISH_OWNERSHIP_PROFILES,
    ratingFields:[...OWNERSHIP_PROFILE_RATING_FIELDS],
    getProfile:ownershipProfileForClub,
    ensureState:ensureOwnershipProfileState,
    getPriority:ownerPriority,
    getFundingRate:ownerFundingRate,
    actionReaction:ownerActionReaction,
    presentation:ownershipPresentation
  };
}

if(typeof window!=='undefined'){
  window.ENGLISH_OWNERSHIP_PROFILES=ENGLISH_OWNERSHIP_PROFILES;
  window.OWNERSHIP_PROFILE_VERSION=OWNERSHIP_PROFILE_VERSION;
  window.ownershipProfileForClub=ownershipProfileForClub;
  window.ensureOwnershipProfileState=ensureOwnershipProfileState;
  window.ownerPriority=ownerPriority;
  window.ownerFundingRate=ownerFundingRate;
  window.ownerActionReaction=ownerActionReaction;
  window.ownershipPresentation=ownershipPresentation;
  window.ownerPriorityLabel=ownerPriorityLabel;
  window.ownerFundingLabel=ownerFundingLabel;
}
