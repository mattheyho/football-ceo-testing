/* FOOTBALL CEO — PLAY-OFFS & PL/CHAMPIONSHIP MOVEMENT v0.24.34
   Piece 9C/9D: Championship play-offs plus real Premier League <-> Championship
   promotion/relegation. League One/League Two movement remains disabled until
   those divisions become playable.
*/
(function(){
  const VERSION=2;
  const INITIAL_DIVISIONS=new Map();
  const allClubs=()=>typeof allWorldClubs==='function'?allWorldClubs():[...(globalThis.DB?.clubs||[]),...(globalThis.DB?.worldClubs||[])];
  allClubs().forEach(c=>INITIAL_DIVISIONS.set(c.name,c.leagueId||c.divisionId||null));

  const clampP=(v,a,b)=>Math.max(a,Math.min(b,v));
  const addDays=(iso,days)=>{const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
  const fm=n=>{n=Math.abs(Number(n)||0);if(n>=1e6)return `£${(n/1e6).toFixed(n>=10e6?1:2)}m`;if(n>=1e3)return `£${Math.round(n/1e3)}k`;return `£${Math.round(n)}`;};

  function ensureMovementState(){
    if(typeof state==='undefined'||!state)return null;
    state.englishPyramidState=state.englishPyramidState||{};
    const s=state.englishPyramidState;
    s.version=VERSION;
    s.clubDivisions=s.clubDivisions||{};
    s.playoffs=s.playoffs||{};
    s.movementHistory=Array.isArray(s.movementHistory)?s.movementHistory:[];
    s.movementTransactions=s.movementTransactions||{};
    s.seasonOutcomes=s.seasonOutcomes||{};
    return s;
  }

  function setClubRuntimeDivision(clubName,leagueId,{persist=true}={}){
    const c=allClubs().find(x=>x.name===clubName);if(!c||!leagueId)return false;
    c.leagueId=leagueId;c.divisionId=leagueId;
    const d=typeof englishDivisionById==='function'?englishDivisionById(leagueId):null;
    if(d)c.englishTier=d.tier;
    if(persist&&typeof state!=='undefined'&&state){const s=ensureMovementState();s.clubDivisions[clubName]=leagueId;}
    if(typeof DB!=='undefined'&&Array.isArray(DB.players)){DB.players.forEach(p=>{if(p.club===clubName)p.leagueId=leagueId;});}
    return true;
  }

  function resetRuntimeDivisions(){
    allClubs().forEach(c=>{const id=INITIAL_DIVISIONS.get(c.name);if(!id)return;c.leagueId=id;c.divisionId=id;const d=typeof englishDivisionById==='function'?englishDivisionById(id):null;if(d)c.englishTier=d.tier;});
  }

  function syncPlayerLeagueIds(){
    if(typeof DB==='undefined'||!Array.isArray(DB.players))return;
    const byName=new Map(allClubs().map(c=>[c.name,c.leagueId]));
    DB.players.forEach(p=>{const id=byName.get(p.club);if(id)p.leagueId=id;});
  }

  function applySavedDivisionState(){
    if(typeof state==='undefined'||!state)return;
    resetRuntimeDivisions();
    const s=ensureMovementState();
    Object.entries(s.clubDivisions||{}).forEach(([club,id])=>setClubRuntimeDivision(club,id,{persist:false}));
    if(s.clubDivisions?.[state.club])state.leagueId=s.clubDivisions[state.club];
    syncPlayerLeagueIds();
  }

  function leagueMatchRecords(id){
    const active=typeof careerLeagueId==='function'?careerLeagueId():state?.leagueId;
    if(id===active&&Array.isArray(state?.fixtures)&&state?.results){
      const out=[];state.fixtures.forEach(round=>(round.games||[]).forEach(g=>{const r=state.results[`${round.week}-${g.home}-${g.away}`];if(r&&Number.isFinite(Number(r.hg))&&Number.isFinite(Number(r.ag)))out.push({home:g.home,away:g.away,hg:Number(r.hg),ag:Number(r.ag)});}));return out;
    }
    if(typeof ensureWorldCompetitionState==='function'){
      const c=ensureWorldCompetitionState(id);return Object.values(c?.results||{}).filter(r=>r?.home&&r?.away&&Number.isFinite(Number(r.hg))&&Number.isFinite(Number(r.ag))).map(r=>({home:r.home,away:r.away,hg:Number(r.hg),ag:Number(r.ag)}));
    }
    return [];
  }

  function tieMiniStats(names,records){
    const set=new Set(names),stats=Object.fromEntries(names.map(n=>[n,{pts:0,gf:0,ga:0,away:0}]));
    records.forEach(r=>{if(!set.has(r.home)||!set.has(r.away))return;const h=stats[r.home],a=stats[r.away];h.gf+=r.hg;h.ga+=r.ag;a.gf+=r.ag;a.ga+=r.hg;a.away+=r.ag;if(r.hg>r.ag)h.pts+=3;else if(r.ag>r.hg)a.pts+=3;else{h.pts++;a.pts++;}});return stats;
  }

  function overallAwayGoals(names,records){const stats=Object.fromEntries(names.map(n=>[n,0]));records.forEach(r=>{if(Object.prototype.hasOwnProperty.call(stats,r.away))stats[r.away]+=Number(r.ag)||0;});return stats;}

  function sortEnglishStandings(rows,id){
    rows=(rows||[]).map(x=>({...x,gd:Number(x.gd??((x.gf||0)-(x.ga||0)))}));
    const records=leagueMatchRecords(id);
    const groups=new Map();rows.forEach(r=>{const k=`${Number(r.pts)||0}|${r.gd}|${Number(r.gf)||0}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r.name);});
    const miniByKey=new Map(),awayByKey=new Map();for(const [key,names] of groups){if(names.length>1){miniByKey.set(key,tieMiniStats(names,records));awayByKey.set(key,overallAwayGoals(names,records));}}
    return rows.sort((a,b)=>{
      const base=(Number(b.pts)||0)-(Number(a.pts)||0)||b.gd-a.gd||(Number(b.gf)||0)-(Number(a.gf)||0);if(base)return base;
      const key=`${Number(a.pts)||0}|${a.gd}|${Number(a.gf)||0}`,mini=miniByKey.get(key)||{},ma=mini[a.name]||{pts:0,gf:0,ga:0,away:0},mb=mini[b.name]||{pts:0,gf:0,ga:0,away:0};
      if(id==='premier-league'){
        const h2h=mb.pts-ma.pts||mb.away-ma.away;if(h2h)return h2h;
      }else{
        const h2h=mb.pts-ma.pts||((mb.gf-mb.ga)-(ma.gf-ma.ga))||mb.gf-ma.gf;if(h2h)return h2h;
        const wins=(Number(b.w)||0)-(Number(a.w)||0);if(wins)return wins;
        const away=awayByKey.get(key)||{},awayDiff=(away[b.name]||0)-(away[a.name]||0);if(awayDiff)return awayDiff;
      }
      // Disciplinary/neutral-playoff edge cases are not simulated; alphabetical is
      // retained only as a final deterministic fallback after every modelled rule.
      return a.name.localeCompare(b.name);
    });
  }

  function standings(id){
    const active=typeof careerLeagueId==='function'?careerLeagueId():state?.leagueId;
    if(id===active&&state?.table)return sortEnglishStandings(Object.entries(state.table).map(([name,x])=>({name,...x,gd:(x.gf||0)-(x.ga||0)})),id);
    const rows=typeof worldLeagueStandings==='function'?worldLeagueStandings(id):[];return sortEnglishStandings(rows,id);
  }

  function championshipRegularComplete(){
    const active=typeof careerLeagueId==='function'?careerLeagueId():state?.leagueId;
    if(active==='championship')return Boolean(state?.leagueSeasonFinished)||(state?.week||0)>=46;
    const c=typeof ensureWorldCompetitionState==='function'?ensureWorldCompetitionState('championship'):null;
    return Boolean(c&&c.week>=46);
  }

  function championshipLastLeagueDate(year){
    if(typeof generateLeagueRoundDates==='function'){
      const dates=generateLeagueRoundDates(year,'championship');if(dates?.length)return dates[dates.length-1];
    }
    return `${year+1}-05-02`;
  }

  function playoffDates(year){
    const last=championshipLastLeagueDate(year);
    return {semiA1:addDays(last,6),semiB1:addDays(last,7),semiA2:addDays(last,9),semiB2:addDays(last,10),final:addDays(last,21)};
  }

  function ensureChampionshipPlayoffs(year=(typeof currentSeasonStartYear==='function'?currentSeasonStartYear():state?.season?.year||2025)){
    const s=ensureMovementState();if(!s||!championshipRegularComplete())return null;
    const key=String(year);if(s.playoffs[key]?.championship)return s.playoffs[key].championship;
    const table=standings('championship');if(table.length<6)return null;
    const seeds=table.slice(2,6).map((x,i)=>({seed:i+3,club:x.name}));
    const seed=n=>seeds.find(x=>x.seed===n)?.club;
    const dates=playoffDates(year);
    const po={version:VERSION,leagueId:'championship',seasonYear:year,seeds,dates,status:'semi-finals',winner:null,finalists:[],semiWinners:{},semiRevenuePaid:false,finalRevenuePaid:false,matches:[
      {id:`${year}-CHA-SFA1`,stage:'semi-final',semi:'A',leg:1,date:dates.semiA1,home:seed(6),away:seed(3),status:'scheduled'},
      {id:`${year}-CHA-SFB1`,stage:'semi-final',semi:'B',leg:1,date:dates.semiB1,home:seed(5),away:seed(4),status:'scheduled'},
      {id:`${year}-CHA-SFA2`,stage:'semi-final',semi:'A',leg:2,date:dates.semiA2,home:seed(3),away:seed(6),status:'scheduled'},
      {id:`${year}-CHA-SFB2`,stage:'semi-final',semi:'B',leg:2,date:dates.semiB2,home:seed(4),away:seed(5),status:'scheduled'}
    ]};
    s.playoffs[key]=s.playoffs[key]||{};s.playoffs[key].championship=po;
    if(state?.club&&seeds.some(x=>x.club===state.club)&&typeof addNews==='function')addNews(`PLAY-OFFS: ${state.club} have qualified for the Championship play-offs. A place at Wembley — and promotion — is now two ties away.`);
    return po;
  }

  function clubStrength(name){
    try{if(typeof worldMatchStrength==='function')return Number(worldMatchStrength(name))||70;}catch(e){}
    const players=(typeof DB!=='undefined'?DB.players:[]).filter(p=>p.club===name&&!p.retired).sort((a,b)=>(b.overall||0)-(a.overall||0)).slice(0,16);
    return players.length?players.reduce((s,p)=>s+(p.overall||0),0)/players.length:(allClubs().find(c=>c.name===name)?.standard||70);
  }

  function weightedWinner(a,b){
    const edge=(clubStrength(a)-clubStrength(b))*.015,p=clampP(.5+edge,.25,.75);return Math.random()<p?a:b;
  }

  function lightweightGoals(home,away){
    if(typeof worldGoalSample==='function')return {hg:worldGoalSample(clubStrength(home),clubStrength(away),true),ag:worldGoalSample(clubStrength(away),clubStrength(home),false)};
    const edge=clubStrength(home)-clubStrength(away),hg=Math.max(0,Math.min(5,Math.round(1.35+edge*.035+(Math.random()-.5)*2))),ag=Math.max(0,Math.min(5,Math.round(1.10-edge*.035+(Math.random()-.5)*2)));return {hg,ag};
  }

  function detailedPlayoffSimulation(match){
    const userInvolved=match.home===state?.club||match.away===state?.club;
    if(typeof simulateGameWithManagerSubs!=='function'||!userInvolved)return {...lightweightGoals(match.home,match.away),userInvolved:false};
    const hi=100;
    const homeSelection=typeof managerSelectMatchdaySquad==='function'?managerSelectMatchdaySquad(match.home,{opponent:match.away,importance:hi}):null;
    const awaySelection=typeof managerSelectMatchdaySquad==='function'?managerSelectMatchdaySquad(match.away,{opponent:match.home,importance:hi}):null;
    const sim=simulateGameWithManagerSubs(match.home,match.away,{homeSelection,awaySelection,homeImportance:hi,awayImportance:hi});
    if(typeof applyMatchUsageCondition==='function'){applyMatchUsageCondition(match.home,sim.homeInitial,sim.homeUsage);applyMatchUsageCondition(match.away,sim.awayInitial,sim.awayUsage);}
    return {...sim,userInvolved:true,homeSelection,awaySelection};
  }

  function playoffResultKey(match){return `PO-${match.id}`;}
  function matchResult(po,match){return match.result||state?.results?.[playoffResultKey(match)]||null;}

  function tieBreaker(home,away,result){
    const winner=weightedWinner(home,away);
    if(Math.random()<.34){
      if(winner===home)result.hg+=1;else result.ag+=1;
      result.decidedBy='extra-time';result.winner=winner;
    }else{
      result.decidedBy='penalties';result.winner=winner;
      const loserScore=3+Math.floor(Math.random()*2),winnerScore=loserScore+1;
      result.penalties={home:winner===home?winnerScore:loserScore,away:winner===away?winnerScore:loserScore};
    }
    return winner;
  }

  function semiAggregate(po,semi){
    const legs=po.matches.filter(m=>m.stage==='semi-final'&&m.semi===semi).sort((a,b)=>a.leg-b.leg);
    if(legs.length!==2||legs.some(m=>m.status!=='played'))return null;
    const clubs=[...new Set(legs.flatMap(m=>[m.home,m.away]))],totals=Object.fromEntries(clubs.map(c=>[c,0]));
    legs.forEach(m=>{const r=matchResult(po,m);totals[m.home]+=r.hg;totals[m.away]+=r.ag;});
    let winner=po.semiWinners?.[semi]||null;
    if(!winner&&totals[clubs[0]]!==totals[clubs[1]])winner=totals[clubs[0]]>totals[clubs[1]]?clubs[0]:clubs[1];
    else if(!winner){
      const leg2=legs[1],r=matchResult(po,leg2);
      winner=r?.winner||tieBreaker(leg2.home,leg2.away,r);leg2.result=r;if(state?.results)state.results[playoffResultKey(leg2)]=r;
    }
    po.semiWinners=po.semiWinners||{};po.semiWinners[semi]=winner;
    return {clubs,totals,winner};
  }

  function stadiumCapacityFor(club){
    if(typeof STADIUMS!=='undefined'&&STADIUMS?.[club]?.capacity)return Number(STADIUMS[club].capacity);
    try{if(typeof currentStadiumCapacity==='function'&&club===state?.club)return Number(currentStadiumCapacity())||20000;}catch(e){}
    return 20000;
  }
  function semiGrossForClub(club){
    const cap=stadiumCapacityFor(club),attendance=Math.round(cap*.94),ticket=clampP(24+(Number(allClubs().find(c=>c.name===club)?.reputation||70)-65)*.65,24,42);return attendance*ticket;
  }
  function semiFinalClubShare(po){
    const hosts=po.matches.filter(m=>m.stage==='semi-final').map(m=>m.home),gross=hosts.reduce((s,c)=>s+semiGrossForClub(c),0),netBeforeLevy=gross*.70,netAfterLevy=netBeforeLevy*.97;
    return Math.round((netAfterLevy*.50/4)/1000)*1000;
  }
  function wembleyRevenueForClub(club){
    const reach=typeof commercialReachScore==='function'?Number(commercialReachScore(club)||60):60;
    const attendance=83500,gross=attendance*55,netBeforeLevy=gross*.62,netAfterLevy=netBeforeLevy*.97,gateShare=netAfterLevy*.25;
    const commercialUplift=180000+reach*4500;
    return {attendance,gateShare:Math.round(gateShare/1000)*1000,commercialUplift:Math.round(commercialUplift/1000)*1000,total:Math.round((gateShare+commercialUplift)/1000)*1000};
  }

  function creditOperatingRevenue(amount,label,kind='matchday',meta={}){
    if(!state||!amount)return;
    amount=Math.round(amount);state.seasonPL=(state.seasonPL||0)+amount;
    if(typeof recordClubCash==='function')recordClubCash(amount,label,'competition',meta);
    if(!state.monthlyFinance&&typeof createEmptyMonthlyFinance==='function')state.monthlyFinance=createEmptyMonthlyFinance();
    if(state.monthlyFinance){if(kind==='commercial')state.monthlyFinance.commercialIncome=(state.monthlyFinance.commercialIncome||0)+amount;else state.monthlyFinance.matchdayRevenue=(state.monthlyFinance.matchdayRevenue||0)+amount;}
    if(typeof ensureClubFinanceState==='function'){
      const f=ensureClubFinanceState();f.seasonRevenue=f.seasonRevenue||{};
      const key=kind==='commercial'?'commercialRetail':'matchday';f.seasonRevenue[key]=(f.seasonRevenue[key]||0)+amount;
      f.seasonRevenue.playoffs=(f.seasonRevenue.playoffs||0)+amount;
    }
  }

  function paySemiRevenueIfDue(po){
    if(po.semiRevenuePaid||!po.seeds.some(x=>x.club===state?.club))return;
    if(!['A','B'].every(s=>semiAggregate(po,s)))return;
    const share=semiFinalClubShare(po);po.semiRevenuePaid=true;po.userSemiRevenue=share;
    creditOperatingRevenue(share,'Championship play-off semi-final gate pool share','matchday',{competition:'Championship Play-Offs',stage:'semi-final'});
    if(typeof addNews==='function')addNews(`PLAY-OFF REVENUE: The semi-final gate pool has added ${fm(share)} to club income after match costs, the EFL levy and pooled distribution.`);
  }

  function prepareFinalIfReady(po){
    const a=semiAggregate(po,'A'),b=semiAggregate(po,'B');if(!a||!b)return;
    po.semiWinners={A:a.winner,B:b.winner};po.finalists=[a.winner,b.winner];po.status='final';
    if(!po.matches.some(m=>m.stage==='final')){
      // Nominal home designation is random because Wembley is neutral.
      const flip=Math.random()<.5;po.matches.push({id:`${po.seasonYear}-CHA-F`,stage:'final',leg:1,date:po.dates.final,home:flip?a.winner:b.winner,away:flip?b.winner:a.winner,venue:'Wembley Stadium',neutral:true,status:'scheduled'});
    }
    if(state?.club&&po.finalists.includes(state.club)&&!po.wembleyNewsSent&&typeof addNews==='function'){
      po.wembleyNewsSent=true;addNews(`<strong>WEMBLEY:</strong> ${state.club} have reached the Championship Play-Off Final at Wembley. Beyond the promotion opportunity, the trip will deliver a significant one-off gate and commercial revenue boost.`);
    }
  }

  function payFinalRevenueIfDue(po){
    if(po.finalRevenuePaid||!po.finalists.includes(state?.club))return;
    const w=wembleyRevenueForClub(state.club);po.finalRevenuePaid=true;po.userWembleyRevenue=w;
    creditOperatingRevenue(w.gateShare,'Wembley play-off final gate share','matchday',{competition:'Championship Play-Off Final',venue:'Wembley Stadium'});
    creditOperatingRevenue(w.commercialUplift,'Wembley play-off final commercial uplift','commercial',{competition:'Championship Play-Off Final',venue:'Wembley Stadium'});
    // A Wembley appearance is also a small lasting exposure event, even if the club
    // loses the final. Promotion itself produces the much larger league-exposure jump.
    if(!po.userWembleyReachBoost&&typeof ensureCommercialReachState==='function'){
      const cr=ensureCommercialReachState();if(cr){cr.score=clampP(Number(cr.score||50)+1.5,25,100);po.userWembleyReachBoost=1.5;}
    }
    if(typeof addNews==='function')addNews(`WEMBLEY REVENUE: The Play-Off Final generated approximately ${fm(w.total)} for ${state.club}: ${fm(w.gateShare)} from the club's net gate share plus ${fm(w.commercialUplift)} of matchday commercial and merchandising uplift.`);
  }

  function userPlayoffReport(match,result,sim){
    if(!sim?.userInvolved)return null;
    const homeUser=match.home===state.club,myGoals=homeUser?result.hg:result.ag,oppGoals=homeUser?result.ag:result.hg,opp=homeUser?match.away:match.home;
    const mySelection=homeUser?sim.homeSelection:sim.awaySelection,myUsage=homeUser?sim.homeUsage:sim.awayUsage,mySubs=homeUser?sim.homeSubs:sim.awaySubs;
    let report=typeof trackPlayerMatchStats==='function'?trackPlayerMatchStats(myGoals,oppGoals,mySelection,{usage:myUsage,substitutions:mySubs}):{};
    const winner=result.winner||((result.hg>result.ag)?match.home:(result.ag>result.hg?match.away:null));
    let outcome=winner?(winner===state.club?'W':'L'):(myGoals===oppGoals?'D':myGoals>oppGoals?'W':'L');
    let roundLabel=match.stage==='final'?'Play-Off Final':`Semi-final • ${match.leg===1?'First leg':'Second leg'}`;
    if(result.aggregate){const userAgg=result.aggregate[state.club]||0,oppAgg=result.aggregate[opp]||0;roundLabel+=` • ${userAgg}–${oppAgg} agg`;}
    report={...report,date:match.date,week:state.week,home:match.home,away:match.away,userClub:state.club,opponent:opp,userHome:homeUser,goalsFor:myGoals,goalsAgainst:oppGoals,outcome,competitionLabel:'Championship Play-Offs',roundLabel,venue:match.venue||null,decidedBy:result.decidedBy||null,penalties:result.penalties||null,engine:sim.homeContext?{version:'2.1-playoff',homeXG:Math.round((sim.homeXG||0)*100)/100,awayXG:Math.round((sim.awayXG||0)*100)/100}:null};
    result.matchReport=report;
    state.form=state.form||[];state.form.push(outcome);state.form=state.form.slice(-5);
    state.monthlyResults=state.monthlyResults||[];state.monthlyResults.push({week:state.week,date:match.date,opponent:opp,home:homeUser,goalsFor:myGoals,goalsAgainst:oppGoals,outcome,competition:'Championship Play-Offs'});
    return report;
  }

  function simulatePlayoffMatch(po,match){
    if(match.status==='played')return match.result?.matchReport||null;
    const sim=detailedPlayoffSimulation(match),result={hg:sim.hg,ag:sim.ag,date:match.date,home:match.home,away:match.away};
    if(match.stage==='final'&&result.hg===result.ag)tieBreaker(match.home,match.away,result);
    if(match.stage==='final'&&!result.winner)result.winner=result.hg>result.ag?match.home:match.away;
    match.result=result;match.status='played';state.results=state.results||{};state.results[playoffResultKey(match)]=result;
    if(match.stage==='semi-final'&&match.leg===2){const agg=semiAggregate(po,match.semi);if(agg){result.aggregate={...agg.totals};result.tieWinner=agg.winner;}}
    const report=userPlayoffReport(match,result,sim);
    if(match.stage==='semi-final'&&match.leg===2){prepareFinalIfReady(po);paySemiRevenueIfDue(po);}
    if(match.stage==='final'){
      po.winner=result.winner;po.status='complete';payFinalRevenueIfDue(po);
      if(state?.club&&po.finalists.includes(state.club)){
        const won=po.winner===state.club;
        if(typeof stakeholderChange==='function'){
          stakeholderChange('fans',won?8:3,won?'Promotion via the Championship play-offs':'Reaching the Championship Play-Off Final',{notify:true});
          stakeholderChange('owners',won?7:2,won?'Promotion achieved':'Championship Play-Off Final reached',{notify:true});
          stakeholderChange('sponsors',won?5:2,won?'Premier League promotion':'Wembley exposure',{notify:true});
        }
        if(typeof addNews==='function')addNews(won?`<strong>PROMOTED:</strong> ${state.club} have won the Championship Play-Off Final and will play in the Premier League next season.`:`PLAY-OFF FINAL: ${state.club}'s promotion bid ends at Wembley. The club remains in the Championship.`);
      }
    }
    return report;
  }

  function processPlayoffDay(dateISO){
    const po=ensureChampionshipPlayoffs();if(!po)return null;
    let report=null;
    po.matches.filter(m=>m.date===dateISO&&m.status==='scheduled').forEach(m=>{const r=simulatePlayoffMatch(po,m);if(r)report=r;});
    // A second leg may have created the final on this same processing pass.
    prepareFinalIfReady(po);paySemiRevenueIfDue(po);
    return report;
  }

  function forceCompleteChampionshipPlayoffs(){
    const po=ensureChampionshipPlayoffs();if(!po)return null;
    po.matches.filter(m=>m.stage==='semi-final'&&m.status!=='played').sort((a,b)=>a.date.localeCompare(b.date)).forEach(m=>simulatePlayoffMatch(po,m));
    prepareFinalIfReady(po);
    const final=po.matches.find(m=>m.stage==='final');if(final&&final.status!=='played')simulatePlayoffMatch(po,final);
    return po;
  }


  function currentChampionshipPlayoffState(year=(typeof currentSeasonStartYear==='function'?currentSeasonStartYear():state?.season?.year||2025)){
    return ensureMovementState()?.playoffs?.[String(year)]?.championship||null;
  }

  function nextUserPlayoffFixture(){
    if(!state?.club)return null;
    const po=currentChampionshipPlayoffState()||ensureChampionshipPlayoffs();
    if(!po)return null;
    const today=typeof currentGameDateISO==='function'?currentGameDateISO():(state.calendar?.date||`${po.seasonYear+1}-05-01`);
    const match=po.matches.filter(m=>m.status==='scheduled'&&(m.home===state.club||m.away===state.club)&&m.date>=today).sort((a,b)=>a.date.localeCompare(b.date))[0];
    if(!match)return null;
    const label=match.stage==='final'?'Play-Off Final':`Play-Off Semi-final • ${match.leg===1?'First leg':'Second leg'}`;
    return {match,round:{date:match.date,week:null,competitionLabel:'Championship Play-Offs',roundLabel:label,venue:match.venue||null,playoff:true}};
  }
  function userSeasonOutcome(year=(typeof currentSeasonStartYear==='function'?currentSeasonStartYear():state?.season?.year||2025)){
    if(!state?.club)return null;const league=state.leagueId||allClubs().find(c=>c.name===state.club)?.leagueId;
    const table=standings(league),pos=table.findIndex(x=>x.name===state.club)+1;
    if(league==='premier-league'&&pos>0&&pos>=18)return {type:'relegation',from:'premier-league',to:'championship',label:'Relegated to the Championship',position:pos};
    if(league==='championship'&&pos>0){
      if(pos<=2)return {type:'promotion',from:'championship',to:'premier-league',label:'Promoted automatically to the Premier League',position:pos,via:'automatic'};
      const po=ensureMovementState()?.playoffs?.[String(year)]?.championship;
      if(po?.winner===state.club)return {type:'promotion',from:'championship',to:'premier-league',label:'Promoted to the Premier League via the play-offs',position:pos,via:'playoffs'};
      if(pos>=3&&pos<=6)return {type:'playoff',label:po?.status==='complete'?'Championship play-off campaign':'Championship play-offs',position:pos};
    }
    return pos?{type:'none',label:'No divisional movement',position:pos}:null;
  }

  function seasonOutcomeNotice(){
    const s=ensureMovementState(),year=String(typeof currentSeasonStartYear==='function'?currentSeasonStartYear():state?.season?.year||2025);if(!s||s.seasonOutcomes[year])return s?.seasonOutcomes?.[year]||null;
    const o=userSeasonOutcome(Number(year));if(!o||o.type==='playoff')return o;
    // Automatic promotion/relegation can be acknowledged as soon as the regular season ends.
    if((o.type==='promotion'||o.type==='relegation')&&state?.leagueSeasonFinished){
      s.seasonOutcomes[year]=o;
      if(typeof addNews==='function')addNews(o.type==='promotion'?`<strong>PROMOTED:</strong> ${state.club} have secured automatic promotion to the Premier League.`:`<strong>RELEGATED:</strong> ${state.club} will play in the Championship next season.`);
      if(typeof stakeholderChange==='function'){
        stakeholderChange('fans',o.type==='promotion'?8:-6,o.type==='promotion'?'Automatic promotion':'Premier League relegation',{notify:true});
        stakeholderChange('owners',o.type==='promotion'?7:-6,o.type==='promotion'?'Automatic promotion':'Premier League relegation',{notify:true});
        stakeholderChange('sponsors',o.type==='promotion'?5:-4,o.type==='promotion'?'Premier League promotion':'Premier League relegation',{notify:true});
      }
    }
    return o;
  }

  function boundaryIntegrity(){
    const pl=clubsInLeague('premier-league').map(c=>c.name),ch=clubsInLeague('championship').map(c=>c.name),combined=[...pl,...ch];
    const duplicates=combined.filter((name,i)=>combined.indexOf(name)!==i);
    return {ok:pl.length===20&&ch.length===24&&combined.length===44&&new Set(combined).size===44&&duplicates.length===0,premierLeague:pl,championship:ch,duplicates};
  }

  function completeBackgroundLeagueForMovement(id){
    const active=typeof careerLeagueId==='function'?careerLeagueId():state?.leagueId;
    if(id===active){
      const required=id==='premier-league'?38:id==='championship'?46:0;
      return required>0&&Boolean(state?.leagueSeasonFinished||(state?.week||0)>=required);
    }
    if(typeof ensureWorldCompetitionState!=='function'||typeof simulateWorldLeagueRound!=='function')return standings(id).length>0;
    const c=ensureWorldCompetitionState(id);if(!c)return false;
    while(c.week<c.fixtures.length)simulateWorldLeagueRound(id,c.week+1);
    return c.week===c.fixtures.length;
  }

  function boundaryReadyForMovement(){
    const plComplete=completeBackgroundLeagueForMovement('premier-league');
    const chComplete=completeBackgroundLeagueForMovement('championship');
    return {ok:Boolean(plComplete&&chComplete),plComplete,chComplete};
  }

  function rollbackDivisions(before){
    Object.entries(before||{}).forEach(([club,id])=>setClubRuntimeDivision(club,id,{persist:false}));
    syncPlayerLeagueIds();
  }

  function commitBoundaryMovement({year,promoted,relegated,playoffWinner}){
    const s=ensureMovementState();if(!s)return null;
    const key=`${year}:pl-championship`;
    const existing=s.movementHistory.find(x=>x.seasonYear===year&&x.boundary==='pl-championship');
    if(existing)return existing;
    const participants=[...promoted,...relegated];
    if(promoted.length!==3||relegated.length!==3||new Set(participants).size!==6)return null;
    if(promoted.some(c=>worldClubByName(c)?.leagueId!=='championship')||relegated.some(c=>worldClubByName(c)?.leagueId!=='premier-league'))return null;
    const before=Object.fromEntries(participants.map(c=>[c,worldClubByName(c)?.leagueId]));
    const desired=Object.fromEntries([...promoted.map(c=>[c,'premier-league']),...relegated.map(c=>[c,'championship'])]);
    const userOld=state.leagueId||worldClubByName(state.club)?.leagueId;
    // Parachute entitlement is part of the same six-club transaction. Snapshot it
    // so a failed movement can never leave finance state half-applied.
    const parachuteBefore=typeof snapshotParachutePaymentState==='function'?snapshotParachutePaymentState():null;
    const tx=s.movementTransactions[key]||{id:key,seasonYear:year,boundary:'pl-championship',status:'prepared',before:{...before},desired:{...desired},promoted:[...promoted],relegated:[...relegated],playoffWinner,preparedAt:state.calendar?.date||null};
    s.movementTransactions[key]=tx;
    try{
      Object.entries(desired).forEach(([club,id])=>{if(!setClubRuntimeDivision(club,id,{persist:false}))throw new Error(`Could not move ${club} to ${id}`);});
      const check=boundaryIntegrity();
      if(!check.ok)throw new Error(`Boundary integrity failed after movement: PL ${check.premierLeague.length}, Championship ${check.championship.length}`);
      // Persist only after all six runtime assignments have validated. This keeps the
      // save override map as an atomic representation of the completed swap.
      Object.entries(desired).forEach(([club,id])=>{s.clubDivisions[club]=id;});
      syncPlayerLeagueIds();
      tx.status='divisions-committed';tx.committedAt=state.calendar?.date||null;
      if(typeof applyParachuteBoundaryMovement==='function')tx.parachute=applyParachuteBoundaryMovement({year,promoted,relegated});
      const userNew=s.clubDivisions[state.club]||userOld;
      if(userNew!==userOld){
        state.leagueId=userNew;
        const type=userNew==='premier-league'?'promotion':'relegation';
        const userVia=promoted.includes(state.club)?(playoffWinner===state.club?'playoffs':'automatic'):null;
        const movementId=`${key}:${state.club}:${type}`;
        if(typeof recordLeagueMovement==='function')tx.userMovement=recordLeagueMovement(type,userOld,userNew,{seasonYear:year,via:userVia,movementId});
        else{
          try{if(typeof applyStaffDivisionMovement==='function')applyStaffDivisionMovement(userOld,userNew);}catch(e){}
          try{if(typeof refreshCommercialReach==='function')refreshCommercialReach({seasonRollover:false});}catch(e){}
        }
      }
      // Buyer-division and affordability assumptions are part of the cached database
      // expected-cost calculation, so a same-day promotion/relegation must clear it.
      try{if(typeof invalidateDatabaseCostCache==='function')invalidateDatabaseCostCache();}catch(e){}
      try{if(typeof invalidateClubSquadCache==='function')invalidateClubSquadCache(...participants);}catch(e){}
      try{if(typeof invalidateWorldStrengthCache==='function')invalidateWorldStrengthCache();}catch(e){}
      const record={seasonYear:year,boundary:'pl-championship',movementId:key,date:state.calendar?.date||null,promoted:[...promoted],relegated:[...relegated],playoffWinner,userOldLeague:userOld,userNewLeague:s.clubDivisions[state.club]||userOld};
      s.movementHistory.push(record);tx.status='complete';tx.record={...record};
      if(typeof addNews==='function'&&record.userNewLeague!==record.userOldLeague)addNews(`${typeLabel(record.userNewLeague)} CONFIRMED: ${state.club} will begin ${year+1}/${String((year+2)%100).padStart(2,'0')} in the ${record.userNewLeague==='premier-league'?'Premier League':'Championship'}. Staff contract clauses and commercial exposure have been updated.`);
      return record;
    }catch(err){
      rollbackDivisions(before);
      Object.keys(desired).forEach(club=>{if(s.clubDivisions[club]===desired[club]){if(before[club]===INITIAL_DIVISIONS.get(club))delete s.clubDivisions[club];else s.clubDivisions[club]=before[club];}});
      if(parachuteBefore&&typeof restoreParachutePaymentState==='function')restoreParachutePaymentState(parachuteBefore);
      state.leagueId=userOld;tx.status='rolled-back';tx.error=String(err?.message||err);tx.rolledBackAt=state.calendar?.date||null;
      return null;
    }
  }

  function finaliseMovement(){
    const s=ensureMovementState();if(!s)return null;const year=typeof currentSeasonStartYear==='function'?currentSeasonStartYear():state?.season?.year||2025;
    const existing=s.movementHistory.find(x=>x.seasonYear===year&&x.boundary==='pl-championship');if(existing)return existing;
    const ready=boundaryReadyForMovement();if(!ready.ok)return null;
    const po=forceCompleteChampionshipPlayoffs(),pl=standings('premier-league'),ch=standings('championship');
    if(pl.length!==20||ch.length!==24||!po?.winner)return null;
    const relegated=pl.slice(-3).map(x=>x.name),promoted=[ch[0].name,ch[1].name,po.winner];
    return commitBoundaryMovement({year,promoted,relegated,playoffWinner:po.winner});
  }
  function typeLabel(newLeague){return newLeague==='premier-league'?'PROMOTION':'RELEGATION';}

  function archiveSnapshot(){
    const s=ensureMovementState(),year=String(typeof currentSeasonStartYear==='function'?currentSeasonStartYear():state?.season?.year||2025),po=s?.playoffs?.[year]?.championship;
    const outcome=userSeasonOutcome(Number(year));
    return {outcome,playoffs:po?{qualified:po.seeds.some(x=>x.club===state?.club),seeds:po.seeds.map(x=>({...x})),finalists:[...po.finalists],winner:po.winner,userSemiRevenue:po.userSemiRevenue||0,userWembleyRevenue:po.userWembleyRevenue?{...po.userWembleyRevenue}:null}:null};
  }

  globalThis.FootballCEOEnglishMovement={VERSION,ensureMovementState,resetRuntimeDivisions,applySavedDivisionState,syncPlayerLeagueIds,setClubRuntimeDivision,standings,ensureChampionshipPlayoffs,processPlayoffDay,forceCompleteChampionshipPlayoffs,finaliseMovement,userSeasonOutcome,seasonOutcomeNotice,archiveSnapshot,playoffDates,wembleyRevenueForClub,semiFinalClubShare,currentChampionshipPlayoffState,nextUserPlayoffFixture,boundaryIntegrity,boundaryReadyForMovement,commitBoundaryMovement,sortEnglishStandings};
  globalThis.ensureEnglishMovementState=ensureMovementState;
  globalThis.resetEnglishPyramidRuntimeDivisions=resetRuntimeDivisions;
  globalThis.applySavedEnglishDivisionState=applySavedDivisionState;
  globalThis.syncPlayerLeagueIdsToClubDivisions=syncPlayerLeagueIds;
  globalThis.ensureChampionshipPlayoffs=ensureChampionshipPlayoffs;
  globalThis.processEnglishPlayoffDay=processPlayoffDay;
  globalThis.finaliseEnglishSeasonMovements=finaliseMovement;
  globalThis.englishSeasonOutcomeForUser=userSeasonOutcome;
  globalThis.processEnglishSeasonOutcomeNotice=seasonOutcomeNotice;
  globalThis.englishMovementArchiveSnapshot=archiveSnapshot;
  globalThis.currentChampionshipPlayoffState=currentChampionshipPlayoffState;
  globalThis.nextUserEnglishPlayoffFixture=nextUserPlayoffFixture;
  globalThis.sortEnglishStandings=sortEnglishStandings;
})();
