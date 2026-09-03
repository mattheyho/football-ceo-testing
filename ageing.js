/* FOOTBALL CEO — AGEING & LONGEVITY v0.24.5
   One career seed -> deterministic, save-specific longevity profiles.
   Longevity is derived lazily from player ID + world seed and never updated.
   Biological ageing is calculated once per season at year-end so the three
   in-season development checkpoints can never multiply veteran decline. */
(function(){
  const PROFILE_NAMES=["Early","Normal","Durable","Exceptional"];
  const PROFILE_SHIFT=[-1,0,1.5,3];

  function clampLocal(v,a,b){return Math.max(a,Math.min(b,v));}
  function hash32(input){
    const str=String(input??"");
    let h=2166136261>>>0;
    for(let i=0;i<str.length;i++){
      h^=str.charCodeAt(i);
      h=Math.imul(h,16777619)>>>0;
      h^=h>>>13;
      h=Math.imul(h,0x5bd1e995)>>>0;
    }
    h^=h>>>15;
    return h>>>0;
  }
  function hashUnit(input){return hash32(input)/4294967295;}
  function gameState(){
    try{if(typeof state!=="undefined"&&state)return state;}catch(e){}
    return globalThis.state||null;
  }
  function generateCareerWorldSeed(){
    try{
      if(globalThis.crypto?.getRandomValues){
        const a=new Uint32Array(1);globalThis.crypto.getRandomValues(a);return a[0]>>>0;
      }
    }catch(e){}
    return Math.floor(Math.random()*4294967296)>>>0;
  }
  function ensureCareerWorldSeed(){
    const s=gameState();
    if(!s)return 0;
    if(!Number.isInteger(s.worldSeed))s.worldSeed=generateCareerWorldSeed();
    return s.worldSeed>>>0;
  }
  function playerIdentity(p){return String(p?.id??p?.name??"unknown-player");}
  function playerLongevityProfile(p,worldSeed=null){
    const seed=worldSeed==null?ensureCareerWorldSeed():(Number(worldSeed)>>>0);
    const key=`${seed}|${playerIdentity(p)}`;
    const roll=hashUnit(`${key}|longevity`);
    const code=roll<.12?0:roll<.75?1:roll<.95?2:3;
    return {code,name:PROFILE_NAMES[code],shiftYears:PROFILE_SHIFT[code],roll};
  }
  function positionTokens(p){return String(p?.positions||"").toUpperCase().split(/[^A-Z]+/).filter(Boolean);}
  function primaryAgeingGroup(p){
    const t=positionTokens(p);
    // Use the natural/first listed position where possible. If source ordering
    // is ambiguous, choose the most career-relevant family rather than the role
    // the manager happens to use this season.
    const first=t[0]||"CM";
    if(first==="GK")return "GK";
    if(["CB"].includes(first))return "CB";
    if(["CDM","DM"].includes(first))return "DM";
    if(["CM","CAM","AM"].includes(first))return first==="CM"?"CM":"AM";
    if(["ST","CF"].includes(first))return "ST";
    if(["RB","RWB","LB","LWB","RW","RM","LW","LM"].includes(first))return "EXPLOSIVE";
    // Fallback to any recognised token if the first token is unusual.
    if(t.includes("GK"))return "GK";
    if(t.includes("CB"))return "CB";
    if(t.some(x=>["CDM","DM"].includes(x)))return "DM";
    if(t.some(x=>["ST","CF"].includes(x)))return "ST";
    if(t.some(x=>["RB","RWB","LB","LWB","RW","RM","LW","LM"].includes(x)))return "EXPLOSIVE";
    return "CM";
  }
  function baseDeclineStartAge(p){
    switch(primaryAgeingGroup(p)){
      case "GK":return 34;
      case "CB":return 32;
      case "DM":return 31.5;
      case "CM":case "AM":return 31;
      case "ST":return 30.5;
      default:return 30;
    }
  }
  function playerDeclineStartAge(p,worldSeed=null){
    return baseDeclineStartAge(p)+playerLongevityProfile(p,worldSeed).shiftYears;
  }
  function declineCurve(yearsIntoDecline){
    if(yearsIntoDecline<0)return 0;
    const pts=[[0,.25],[1,.60],[2,1.10],[3,1.60],[4,2.00],[5,2.40],[6,2.70],[7,3.00],[8,3.00]];
    if(yearsIntoDecline>=8)return 3;
    for(let i=1;i<pts.length;i++){
      if(yearsIntoDecline<=pts[i][0]){
        const [xa,ya]=pts[i-1],[xb,yb]=pts[i];
        const r=(yearsIntoDecline-xa)/(xb-xa);
        return ya+(yb-ya)*r;
      }
    }
    return 3;
  }
  function minimumProtectionRatio(age,p){
    if(primaryAgeingGroup(p)==="GK"){
      if(age>=40)return .84;
      if(age>=38)return .74;
      if(age>=36)return .62;
      return .45;
    }
    if(age>=38)return .88;
    if(age>=36)return .78;
    if(age>=33)return .65;
    return .42;
  }
  function minutesAgeingMultiplier(projectedMinutes){
    const m=Number(projectedMinutes||0);
    if(m>=2600)return .88;
    if(m>=1800)return .96;
    if(m>=900)return 1.05;
    if(m>=400)return 1.10;
    return 1.18;
  }
  function performanceAgeingMultiplier(performanceFactor=1){
    const p=Number(performanceFactor||1);
    if(p>=1.20)return .82;
    if(p>=1.08)return .90;
    if(p>=.92)return 1;
    if(p>=.78)return 1.07;
    return 1.16;
  }
  function playerExpectedAnnualAgeDecline(p,context={}){
    const age=Number(context.age??p?.age??25);
    const start=playerDeclineStartAge(p,context.worldSeed);
    const biological=declineCurve(age-start);
    if(biological<=0)return 0;
    const minutesMult=minutesAgeingMultiplier(context.projectedMinutes??1800);
    const performanceMult=performanceAgeingMultiplier(context.performanceFactor??1);
    const injuryPenalty=clampLocal(Number(context.injuryPenalty||0),0,.5);
    let modifier=minutesMult*performanceMult*(1+injuryPenalty*.80);
    modifier=Math.max(modifier,minimumProtectionRatio(age,p));
    return clampLocal(biological*modifier,0,3);
  }
  function playerAnnualAgeDeclineTarget(p,context={}){
    const expected=playerExpectedAnnualAgeDecline(p,context);
    if(expected<=0)return 0;
    const whole=Math.floor(expected);
    const frac=expected-whole;
    const seasonYear=Number(context.seasonYear??gameState()?.season?.year??0);
    const seed=context.worldSeed==null?ensureCareerWorldSeed():(Number(context.worldSeed)>>>0);
    const roll=hashUnit(`${seed}|${playerIdentity(p)}|age-decline|${seasonYear}`);
    let loss=whole+(roll<frac?1:0);
    // Outfield players at 38+ who have reached their decline phase should almost
    // never remain completely untouched by age, even after an excellent season.
    if(primaryAgeingGroup(p)!=="GK"&&Number(context.age??p?.age??25)>=38&&expected>=.72)loss=Math.max(1,loss);
    return clampLocal(loss,0,3);
  }
  function projectedAgeingLoss(p,years=2,context={}){
    let loss=0;
    const startAge=Number(context.age??p?.age??25);
    const baseYear=Number(context.seasonYear??gameState()?.season?.year??0);
    for(let i=0;i<Math.max(0,years);i++){
      loss+=playerExpectedAnnualAgeDecline(p,{...context,age:startAge+i,seasonYear:baseYear+i,projectedMinutes:context.projectedMinutes??2000,performanceFactor:context.performanceFactor??1});
    }
    return loss;
  }
  function ageingDevelopmentOpportunity(age,p){
    age=Number(age||0);
    const gk=primaryAgeingGroup(p)==="GK";
    if(age<=18)return 1;
    if(age<=21)return .94;
    if(age<=24)return .82;
    if(age===25)return gk?.62:.50;
    if(age===26)return gk?.52:.35;
    if(age===27)return gk?.42:.20;
    if(age===28)return gk?.30:.08;
    if(age===29)return gk?.20:.03;
    if(age===30)return gk?.11:0;
    if(age===31)return gk?.04:0;
    return 0;
  }
  function playerInAgeDeclinePhase(p,worldSeed=null){return Number(p?.age||0)>=playerDeclineStartAge(p,worldSeed);}
  function clearAgeingCache(){ /* Deterministic hash is cheap; no per-player cache is retained. */ }

  globalThis.generateCareerWorldSeed=generateCareerWorldSeed;
  globalThis.ensureCareerWorldSeed=ensureCareerWorldSeed;
  globalThis.playerLongevityProfile=playerLongevityProfile;
  globalThis.primaryAgeingGroup=primaryAgeingGroup;
  globalThis.playerDeclineStartAge=playerDeclineStartAge;
  globalThis.playerExpectedAnnualAgeDecline=playerExpectedAnnualAgeDecline;
  globalThis.playerAnnualAgeDeclineTarget=playerAnnualAgeDeclineTarget;
  globalThis.projectedAgeingLoss=projectedAgeingLoss;
  globalThis.ageingDevelopmentOpportunity=ageingDevelopmentOpportunity;
  globalThis.playerInAgeDeclinePhase=playerInAgeDeclinePhase;
  globalThis.clearAgeingCache=clearAgeingCache;
})();
