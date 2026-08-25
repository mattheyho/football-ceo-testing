/* Championship standard-simulation foundation v0.19.
   Designed to coexist with the current PL engine and become the source for
   promotion/relegation once season rollover is wired in. */
function worldRoundRobin(names){
  const arr=[...names]; if(arr.length%2)arr.push(null);
  const n=arr.length, rounds=[]; let rot=[...arr];
  for(let r=0;r<n-1;r++){
    const games=[];
    for(let i=0;i<n/2;i++){
      const a=rot[i],b=rot[n-1-i]; if(a&&b)games.push(r%2?{home:b,away:a}:{home:a,away:b});
    }
    rounds.push(games); rot=[rot[0],rot[n-1],...rot.slice(1,n-1)];
  }
  return [...rounds,...rounds.map(g=>g.map(x=>({home:x.away,away:x.home})))];
}
function blankWorldTable(clubs){const t={};clubs.forEach(c=>t[c.name]={p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0});return t;}
function ensureChampionshipState(){
  if(!state)return;
  state.worldCompetitions=state.worldCompetitions||{};
  if(state.worldCompetitions.championship)return;
  const clubs=clubsInLeague('championship');
  state.worldCompetitions.championship={leagueId:'championship',seasonYear:state.season?.year||2025,week:0,
    fixtures:worldRoundRobin(clubs.map(c=>c.name)),table:blankWorldTable(clubs),results:{}};
}
function worldMatchStrength(name){const s=typeof strength==='function'?strength(name):70;const c=worldClubByName(name);return (s&&s>60)?s:(c?.standard||70);}
function simulateChampionshipWeek(targetWeek){
  ensureChampionshipState(); const comp=state.worldCompetitions.championship; if(!comp||targetWeek<=comp.week)return;
  for(let w=comp.week+1;w<=Math.min(targetWeek,comp.fixtures.length);w++){
    const games=comp.fixtures[w-1]||[];
    games.forEach(g=>{
      const hs=worldMatchStrength(g.home)+2.2,as=worldMatchStrength(g.away);
      const hg=Math.max(0,Math.round(1.25+(hs-as)/13+(Math.random()-.5)*2.1));
      const ag=Math.max(0,Math.round(1.05+(as-hs)/13+(Math.random()-.5)*2.1));
      const H=comp.table[g.home],A=comp.table[g.away]; if(!H||!A)return;
      H.p++;A.p++;H.gf+=hg;H.ga+=ag;A.gf+=ag;A.ga+=hg;
      if(hg>ag){H.w++;A.l++;H.pts+=3;}else if(ag>hg){A.w++;H.l++;A.pts+=3;}else{H.d++;A.d++;H.pts++;A.pts++;}
      comp.results[`${w}:${g.home}:${g.away}`]={home:g.home,away:g.away,hg,ag};
    }); comp.week=w;
  }
}
function championshipStandings(){
  ensureChampionshipState();const t=state.worldCompetitions?.championship?.table||{};
  return Object.entries(t).map(([club,r])=>({club,...r,gd:r.gf-r.ga})).sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf);
}
function championshipPromotionPlaces(){const s=championshipStandings();return {automatic:s.slice(0,2),playoffs:s.slice(2,8)};}


function championshipSeasonProgressTarget(dateISO=currentGameDateISO()){
  ensureChampionshipState();
  const comp=state.worldCompetitions?.championship;
  if(!comp) return 0;
  const y=comp.seasonYear||currentSeasonStartYear();
  const start=Date.parse(`${y}-08-09T00:00:00Z`);
  const end=Date.parse(`${y+1}-05-02T00:00:00Z`);
  const now=Date.parse(`${dateISO}T00:00:00Z`);
  if(now<=start) return 0;
  if(now>=end) return comp.fixtures.length;
  const ratio=(now-start)/(end-start);
  return Math.min(comp.fixtures.length,Math.floor(ratio*comp.fixtures.length));
}

function processChampionshipDay(dateISO=currentGameDateISO()){
  ensureChampionshipState();
  const comp=state.worldCompetitions?.championship;
  if(!comp) return;
  if(comp.seasonYear!==currentSeasonStartYear()){
    delete state.worldCompetitions.championship;
    ensureChampionshipState();
  }
  simulateChampionshipWeek(championshipSeasonProgressTarget(dateISO));
}

function resetChampionshipCompetitionForSeason(){
  if(!state) return;
  state.worldCompetitions=state.worldCompetitions||{};
  delete state.worldCompetitions.championship;
  ensureChampionshipState();
}
