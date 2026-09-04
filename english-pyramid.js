/* FOOTBALL CEO — ENGLISH LEAGUE PYRAMID FRAMEWORK v0.24.25
   Piece 9A: one canonical competition structure for the 92 PL/EFL clubs.

   This module deliberately does NOT execute promotion/relegation or make the EFL
   playable yet. It defines the shape those later pieces must use, including a
   static League Two floor with promotion upward but no National League relegation.
*/
(function(){
  const VERSION=1;
  const SYSTEM_ID='english-league-system';
  const MOVEMENT_ENABLED=false;
  const PLAYOFF_EXECUTION_ENABLED=false;

  const TABLE_RULES={pointsWin:3,pointsDraw:1,pointsLoss:0,sort:['points','goalDifference','goalsFor']};
  const DIVISIONS=[
    {
      id:'premier-league',name:'Premier League',tier:1,clubCount:20,rounds:2,matchesPerClub:38,totalLeagueFixtures:380,homeMatchesPerClub:19,
      playable:true,futurePlayable:true,isEFL:false,
      promotion:null,
      relegation:{count:3,to:'championship',staticFloor:false},
      tableRules:TABLE_RULES
    },
    {
      id:'championship',name:'Championship',tier:2,clubCount:24,rounds:2,matchesPerClub:46,totalLeagueFixtures:552,homeMatchesPerClub:23,
      playable:false,futurePlayable:true,isEFL:true,
      promotion:{total:3,to:'premier-league',automatic:2,playoff:{from:3,to:6,winners:1}},
      relegation:{count:3,to:'league-one',staticFloor:false},
      tableRules:TABLE_RULES
    },
    {
      id:'league-one',name:'League One',tier:3,clubCount:24,rounds:2,matchesPerClub:46,totalLeagueFixtures:552,homeMatchesPerClub:23,
      playable:false,futurePlayable:true,isEFL:true,
      promotion:{total:3,to:'championship',automatic:2,playoff:{from:3,to:6,winners:1}},
      relegation:{count:4,to:'league-two',staticFloor:false},
      tableRules:TABLE_RULES
    },
    {
      id:'league-two',name:'League Two',tier:4,clubCount:24,rounds:2,matchesPerClub:46,totalLeagueFixtures:552,homeMatchesPerClub:23,
      playable:false,futurePlayable:true,isEFL:true,
      promotion:{total:4,to:'league-one',automatic:3,playoff:{from:4,to:7,winners:1}},
      // Intentional project rule: League Two is the bottom playable division.
      // There is no National League relegation in the Football CEO alpha scope.
      relegation:{count:0,to:null,staticFloor:true},
      tableRules:TABLE_RULES
    }
  ];
  const BY_ID=Object.fromEntries(DIVISIONS.map(d=>[d.id,d]));

  function allClubs(){
    if(typeof allWorldClubs==='function') return allWorldClubs();
    return [...(globalThis.DB?.clubs||[]),...(globalThis.DB?.worldClubs||[])];
  }
  function divisionIds(){return DIVISIONS.map(d=>d.id);}
  function divisionById(id){return BY_ID[id]||null;}
  function isEnglishDivision(id){return Boolean(BY_ID[id]);}
  function clubsInDivision(id){return allClubs().filter(c=>(c.divisionId||c.leagueId)==id);}
  function clubDivisionId(name){
    const c=allClubs().find(x=>x.name===name);
    return c&&isEnglishDivision(c.divisionId||c.leagueId)?(c.divisionId||c.leagueId):null;
  }
  function divisionForClub(name){return divisionById(clubDivisionId(name));}
  function movementRules(id){
    const d=divisionById(id);if(!d)return null;
    return {promotion:d.promotion?{...d.promotion,playoff:d.promotion.playoff?{...d.promotion.playoff}:null}:null,relegation:{...d.relegation}};
  }
  function competitionDefinition(id){
    const d=divisionById(id);return d?JSON.parse(JSON.stringify(d)):null;
  }
  function fixtureShape(id){
    const d=divisionById(id);if(!d)return null;
    return {clubCount:d.clubCount,rounds:d.rounds,matchesPerClub:d.matchesPerClub,totalLeagueFixtures:d.totalLeagueFixtures,homeMatchesPerClub:d.homeMatchesPerClub};
  }
  function currentPlayableDivisionIds(){return DIVISIONS.filter(d=>d.playable).map(d=>d.id);}
  function futurePlayableDivisionIds(){return DIVISIONS.filter(d=>d.futurePlayable).map(d=>d.id);}

  function ensureClubMetadata(){
    allClubs().forEach(c=>{
      const id=c.divisionId||c.leagueId;
      if(!isEnglishDivision(id))return;
      c.leagueId=id; // leagueId remains the runtime compatibility field.
      c.divisionId=id;
      c.competitionSystemId=SYSTEM_ID;
      c.englishTier=BY_ID[id].tier;
    });
    if(typeof DB!=='undefined'){
      DB.competitions=Array.isArray(DB.competitions)?DB.competitions:[];
      const snapshot={id:SYSTEM_ID,name:'English League System',country:'England',version:VERSION,movementEnabled:MOVEMENT_ENABLED,playoffExecutionEnabled:PLAYOFF_EXECUTION_ENABLED,divisionIds:divisionIds()};
      const idx=DB.competitions.findIndex(x=>x.id===SYSTEM_ID);
      if(idx>=0)DB.competitions[idx]=snapshot;else DB.competitions.push(snapshot);
    }
  }


  function ensureUserCompetitionState(){
    if(typeof state==='undefined'||!state?.club)return null;
    const mapped=clubDivisionId(state.club);
    if(!state.leagueId&&mapped)state.leagueId=mapped;
    if(state.leagueId&&isEnglishDivision(state.leagueId)){
      state.competitionSystemId=SYSTEM_ID;
      state.englishPyramidVersion=VERSION;
    }
    return state.leagueId||mapped||null;
  }

  function validate(){
    ensureClubMetadata();
    const errors=[],warnings=[],counts={};
    DIVISIONS.forEach(d=>{
      const clubs=clubsInDivision(d.id);counts[d.id]=clubs.length;
      if(clubs.length!==d.clubCount) errors.push(`${d.name}: expected ${d.clubCount} clubs, found ${clubs.length}.`);
      const expectedMatches=(d.clubCount-1)*d.rounds;
      const expectedFixtures=(d.clubCount*expectedMatches)/2;
      if(d.matchesPerClub!==expectedMatches) errors.push(`${d.name}: matchesPerClub should be ${expectedMatches}.`);
      if(d.totalLeagueFixtures!==expectedFixtures) errors.push(`${d.name}: totalLeagueFixtures should be ${expectedFixtures}.`);
    });
    const total=DIVISIONS.reduce((s,d)=>s+(counts[d.id]||0),0);
    if(total!==92) errors.push(`English pyramid: expected 92 clubs, found ${total}.`);
    const l2=BY_ID['league-two'];
    if(l2.relegation.count!==0||l2.relegation.to!==null||!l2.relegation.staticFloor) errors.push('League Two must remain the static bottom division with no relegation.');
    if(MOVEMENT_ENABLED) warnings.push('Movement execution is enabled; Piece 9A expects it to remain disabled.');
    return {ok:errors.length===0,version:VERSION,systemId:SYSTEM_ID,totalClubs:total,counts,errors,warnings,movementEnabled:MOVEMENT_ENABLED,playoffExecutionEnabled:PLAYOFF_EXECUTION_ENABLED};
  }

  // Future pieces can use this to inspect the intended links without mutating club
  // state. There is intentionally no apply/move function in Piece 9A.
  function movementBlueprint(){
    return DIVISIONS.map(d=>({divisionId:d.id,promotion:d.promotion?{...d.promotion,playoff:d.promotion.playoff?{...d.promotion.playoff}:null}:null,relegation:{...d.relegation}}));
  }

  ensureClubMetadata();

  globalThis.ENGLISH_PYRAMID={
    version:VERSION,id:SYSTEM_ID,country:'England',movementEnabled:MOVEMENT_ENABLED,playoffExecutionEnabled:PLAYOFF_EXECUTION_ENABLED,
    divisions:DIVISIONS,tableRules:TABLE_RULES
  };
  globalThis.englishDivisionIds=divisionIds;
  globalThis.englishDivisionById=divisionById;
  globalThis.englishDivisionForClub=divisionForClub;
  globalThis.englishClubDivisionId=clubDivisionId;
  globalThis.englishClubsInDivision=clubsInDivision;
  globalThis.englishMovementRules=movementRules;
  globalThis.englishCompetitionDefinition=competitionDefinition;
  globalThis.englishFixtureShape=fixtureShape;
  globalThis.currentPlayableEnglishDivisionIds=currentPlayableDivisionIds;
  globalThis.futurePlayableEnglishDivisionIds=futurePlayableDivisionIds;
  globalThis.ensureEnglishPyramidClubMetadata=ensureClubMetadata;
  globalThis.ensureUserEnglishCompetitionState=ensureUserCompetitionState;
  globalThis.validateEnglishPyramidStructure=validate;
  globalThis.englishMovementBlueprint=movementBlueprint;
})();
