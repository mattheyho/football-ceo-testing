/* Football CEO v0.24.11 — Long-term player lifecycle + rebalanced youth ecosystem
   - Persistent generated-player intake
   - Retirement planning and retirement processing
   - Save rehydration for generated/retired players
   This is intentionally a world-maintenance system rather than a full academy simulator. */
(function(){
  const GENERATED_MARKER="football-ceo-generated";
  const BASE_PLAYER_IDS=new Set((typeof DB!=="undefined"&&Array.isArray(DB.players)?DB.players:[]).map(p=>String(p.id)));
  const BASE_PLAYER_CLUBS=new Map((typeof DB!=="undefined"&&Array.isArray(DB.players)?DB.players:[]).map(p=>[String(p.id),p.club]));
  let PLAYER_LIFECYCLE_APPLIED_STATE=null;

  const FIRST_NAMES={
    England:["Oliver","George","Harry","Jack","Charlie","Thomas","Alfie","Theo","Jacob","Leo","Archie","Ethan"],
    Spain:["Alejandro","Hugo","Pablo","Diego","Álvaro","Mateo","Sergio","Iker","Martín","Nico","Adrián","Lucas"],
    Germany:["Lukas","Felix","Jonas","Leon","Noah","Finn","Maximilian","Elias","Paul","Anton","Julian","Florian"],
    France:["Lucas","Hugo","Enzo","Mathis","Theo","Louis","Nathan","Rayan","Noé","Jules","Ethan","Malo"],
    Italy:["Lorenzo","Matteo","Alessandro","Tommaso","Riccardo","Gabriele","Davide","Nicolò","Marco","Pietro","Andrea","Simone"],
    Portugal:["João","Tiago","Gonçalo","Diogo","Afonso","Rodrigo","Tomás","Duarte","Pedro","Rafael","Miguel","André"],
    Netherlands:["Daan","Sem","Lucas","Finn","Milan","Levi","Jesse","Noah","Thijs","Mees","Bram","Mats"],
    Belgium:["Arthur","Louis","Jules","Noah","Liam","Victor","Mathis","Milan","Elias","Seppe","Nathan","Maxime"],
    Brazil:["Gabriel","Lucas","Matheus","João","Pedro","Rafael","Caio","Bruno","Gustavo","Vinícius","Thiago","Renan"],
    Argentina:["Mateo","Santiago","Tomás","Lautaro","Joaquín","Franco","Valentín","Nicolás","Facundo","Agustín","Thiago","Bruno"],
    Colombia:["Santiago","Juan","Mateo","Nicolás","Daniel","Sebastián","Samuel","David","Andrés","Julián","Kevin","Miguel"],
    Uruguay:["Santiago","Facundo","Agustín","Joaquín","Matías","Nicolás","Franco","Juan","Thiago","Bruno","Emiliano","Lucas"],
    Croatia:["Luka","Ivan","Marko","Josip","Ante","Petar","Dino","Karlo","Lovro","Nikola","Matej","Fran"],
    Serbia:["Luka","Nikola","Stefan","Filip","Mihajlo","Aleksa","Marko","Nemanja","Dušan","Vuk","Andrija","Ognjen"],
    Denmark:["William","Oscar","Oliver","Noah","Emil","Lucas","Victor","Magnus","Mikkel","Frederik","Christian","Rasmus"],
    Sweden:["William","Hugo","Lucas","Noah","Oliver","Elias","Alexander","Viktor","Oscar","Isak","Anton","Albin"],
    Norway:["Jakob","Emil","Noah","Oliver","William","Magnus","Sander","Oscar","Elias","Henrik","Marius","Tobias"],
    Turkey:["Emir","Arda","Kerem","Yusuf","Efe","Mert","Ömer","Ali","Can","Berk","Kaan","Deniz"],
    Morocco:["Youssef","Amine","Adam","Rayan","Ilyas","Mehdi","Anas","Ayoub","Zakaria","Bilal","Omar","Nabil"],
    Nigeria:["Samuel","Daniel","David","Victor","Emmanuel","Michael","Chinedu","Ibrahim","Peter","Tobi","Joseph","Caleb"],
    Ghana:["Kwame","Daniel","Samuel","Kofi","Emmanuel","Joseph","Michael","Isaac","Ibrahim","David","Nana","Benjamin"],
    Senegal:["Mamadou","Ibrahima","Amadou","Cheikh","Ousmane","Abdoulaye","Moussa","Pape","Ismaïla","Aliou","Saliou","Moustapha"],
    Japan:["Haruto","Yuto","Ren","Sota","Riku","Kaito","Yuki","Takumi","Daichi","Ryota","Hiroto","Ao"],
    "South Korea":["Min-jun","Ji-ho","Seo-jun","Hyun-woo","Jun-ho","Tae-hyun","Jae-min","Woo-jin","Seung-ho","Dong-hyun","Jin-woo","Sang-min"],
    USA:["Ethan","Noah","Liam","Mason","Logan","Caleb","Aiden","Jackson","Owen","Luke","Cameron","Ryan"]
  };
  const LAST_NAMES={
    England:["Bennett","Walker","Turner","Collins","Harrison","Ward","Foster","Palmer","Cooper","Brooks","Watson","Griffiths"],
    Spain:["García","Martínez","López","Sánchez","Romero","Navarro","Torres","Ruiz","Molina","Castro","Vega","Ortega"],
    Germany:["Schneider","Fischer","Weber","Wagner","Becker","Hoffmann","Schulz","Neumann","Hartmann","Keller","Krause","Vogel"],
    France:["Martin","Bernard","Dubois","Thomas","Robert","Petit","Moreau","Laurent","Simon","Michel","Leroy","Garnier"],
    Italy:["Romano","Gallo","Costa","Greco","Conti","De Luca","Mancini","Lombardi","Moretti","Rinaldi","Marino","Ferrara"],
    Portugal:["Silva","Santos","Ferreira","Pereira","Costa","Rodrigues","Martins","Sousa","Fernandes","Gomes","Lopes","Correia"],
    Netherlands:["De Jong","Jansen","De Vries","Van Dijk","Bakker","Visser","Smit","Meijer","De Boer","Mulder","Bos","Vos"],
    Belgium:["Peeters","Janssens","Maes","Willems","Claes","Goossens","Jacobs","Mertens","Vermeulen","Wouters","De Smet","Lambert"],
    Brazil:["Silva","Santos","Oliveira","Souza","Pereira","Costa","Rodrigues","Almeida","Nascimento","Lima","Rocha","Barbosa"],
    Argentina:["Fernández","Gómez","López","Martínez","Pérez","Romero","Sosa","Torres","Álvarez","Ruiz","Molina","Castro"],
    Colombia:["Rodríguez","Martínez","García","Gómez","López","Hernández","Sánchez","Ramírez","Torres","Díaz","Moreno","Rojas"],
    Uruguay:["Rodríguez","González","Martínez","Fernández","Pérez","García","Silva","López","Pereira","Sosa","Viera","Suárez"],
    Croatia:["Horvat","Kovačević","Babić","Marić","Jurić","Novak","Kovačić","Petrović","Tomić","Pavlović","Šarić","Božić"],
    Serbia:["Jovanović","Petrović","Nikolić","Marković","Đorđević","Stojanović","Ilić","Pavlović","Milošević","Savić","Popović","Kostić"],
    Denmark:["Jensen","Nielsen","Hansen","Pedersen","Andersen","Christensen","Larsen","Sørensen","Rasmussen","Jørgensen","Madsen","Kristensen"],
    Sweden:["Andersson","Johansson","Karlsson","Nilsson","Eriksson","Larsson","Olsson","Persson","Svensson","Gustafsson","Pettersson","Jonsson"],
    Norway:["Hansen","Johansen","Olsen","Larsen","Andersen","Pedersen","Nilsen","Kristiansen","Jensen","Karlsen","Johnsen","Pettersen"],
    Turkey:["Yılmaz","Kaya","Demir","Şahin","Çelik","Yıldız","Aydın","Öztürk","Arslan","Doğan","Kılıç","Koç"],
    Morocco:["El Amrani","Benali","Alaoui","Bennani","Idrissi","Tahiri","Mansouri","Haddad","Berrada","Saidi","Naciri","Karim"],
    Nigeria:["Okafor","Adeyemi","Eze","Okeke","Nwosu","Balogun","Adebayo","Uche","Obi","Iheanacho","Olawale","Musa"],
    Ghana:["Mensah","Owusu","Boateng","Asante","Osei","Acheampong","Appiah","Adjei","Amoah","Opoku","Frimpong","Tetteh"],
    Senegal:["Diop","Ndiaye","Ba","Fall","Gueye","Sarr","Diallo","Faye","Sy","Kane","Cissé","Mbaye"],
    Japan:["Sato","Suzuki","Takahashi","Tanaka","Watanabe","Ito","Yamamoto","Nakamura","Kobayashi","Kato","Yoshida","Yamada"],
    "South Korea":["Kim","Lee","Park","Choi","Jung","Kang","Cho","Yoon","Jang","Lim","Han","Shin"],
    USA:["Johnson","Williams","Brown","Davis","Miller","Wilson","Moore","Taylor","Anderson","Thomas","Jackson","White"]
  };
  const NATIONALITIES=[
    ["England",13],["Spain",8],["Germany",8],["France",10],["Italy",7],["Portugal",5],["Netherlands",5],["Belgium",3],
    ["Brazil",8],["Argentina",6],["Colombia",2],["Uruguay",2],["Croatia",2],["Serbia",2],["Denmark",2],["Sweden",2],["Norway",2],
    ["Turkey",2],["Morocco",3],["Nigeria",4],["Ghana",2],["Senegal",3],["Japan",2],["South Korea",1],["USA",2]
  ];
  const POSITION_PROFILES=[
    ["GK",10],["CB",15],["RB, RWB",7],["LB, LWB",7],["CDM, CM",12],["CM",12],["CAM, CM",9],["RW, RM",8],["LW, LM",8],["ST",12]
  ];

  function clampLocal(v,min,max){return Math.max(min,Math.min(max,v));}
  function hash32(str){let h=2166136261;for(let i=0;i<String(str).length;i++)h=Math.imul(h^String(str).charCodeAt(i),16777619);return h>>>0;}
  function seededRandom(seed){let a=hash32(seed);return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
  function weightedChoice(items,rng){const total=items.reduce((s,x)=>s+x[1],0);let roll=rng()*total;for(const x of items){roll-=x[1];if(roll<=0)return x[0];}return items[items.length-1][0];}
  function currentYear(){return typeof currentSeasonStartYear==="function"?currentSeasonStartYear():(state?.season?.year||2025);}
  function currentLabel(){return typeof currentSeasonLabel==="function"?currentSeasonLabel():`${currentYear()}/${String((currentYear()+1)%100).padStart(2,"0")}`;}

  function ensurePlayerLifecycleState(){
    if(typeof state==="undefined"||!state)return;
    if(!Array.isArray(state.generatedPlayers))state.generatedPlayers=[];
    if(!state.generatedIntakes)state.generatedIntakes=[];
    if(!state.userAcademyIntakes)state.userAcademyIntakes=[];
    if(!state.retirementPlans)state.retirementPlans={};
    if(!Array.isArray(state.retiredPlayers))state.retiredPlayers=[];
    if(!state.playerLifecycleMeta)state.playerLifecycleMeta={nextGeneratedId:1};
    if(!state.playerLifecycleMeta.nextGeneratedId)state.playerLifecycleMeta.nextGeneratedId=1;

    // Rehydrate only when a different career state object is loaded. Rebuilding
    // on every intake call would reset generated players to their original age/OVR.
    if(PLAYER_LIFECYCLE_APPLIED_STATE!==state && typeof DB!=="undefined"&&Array.isArray(DB.players)){
      DB.players=DB.players.filter(p=>!p.generatedPlayer);
      const existing=new Set(DB.players.map(p=>String(p.id)));
      state.generatedPlayers.forEach(saved=>{
        if(existing.has(String(saved.id)))return;
        DB.players.push({...saved,generatedPlayer:true,dataSource:saved.dataSource||GENERATED_MARKER});
        existing.add(String(saved.id));
      });
      const retiredIds=new Set(state.retiredPlayers.map(x=>String(x.playerId)));
      DB.players.forEach(p=>{
        const id=String(p.id);
        if(!p.generatedPlayer && p.retired && !retiredIds.has(id)){p.retired=false;if(BASE_PLAYER_CLUBS.has(id))p.club=BASE_PLAYER_CLUBS.get(id);}
        if(retiredIds.has(id)){p.retired=true;p.club="Retired";}
      });
      PLAYER_LIFECYCLE_APPLIED_STATE=state;
      if(typeof invalidateClubSquadCache==="function")invalidateClubSquadCache();
    }
  }

  function isGoalkeeper(p){return String(p?.positions||"").toUpperCase().split(/[^A-Z]+/).includes("GK");}
  function retirementChance(p){
    const age=Number(p?.age||0),gk=isGoalkeeper(p),effective=age-(gk?2:0);
    if(effective<33)return 0;
    if(effective>=40)return 1;
    const base={33:.04,34:.08,35:.16,36:.29,37:.46,38:.66,39:.84}[effective]||.92;
    const ovr=Number(p?.overall||65);
    let factor=1;
    if(ovr>=86)factor*=.50; else if(ovr>=82)factor*=.66; else if(ovr<=68)factor*=1.28;
    let projected=0;
    try{projected=typeof projectedSeasonMinutes==="function"?projectedSeasonMinutes(p):0;}catch(e){}
    if(projected>=2200)factor*=.66; else if(projected>=1200)factor*=.82; else if(projected<400)factor*=1.22;
    return clampLocal(base*factor,0,1);
  }

  function processRetirementAnnouncements(dateISO){
    ensurePlayerLifecycleState();
    if(!dateISO||!/-03-01$/.test(dateISO))return [];
    const seasonYear=currentYear();
    const announced=[];
    DB.players.forEach(p=>{
      if(p.retired||p.generatedPlayer&&p.age<32)return;
      if(state.retirementPlans[String(p.id)])return;
      const chance=retirementChance(p);if(chance<=0)return;
      const roll=typeof stablePlayerTrait==="function"?stablePlayerTrait(p,`retirement-${seasonYear}`):seededRandom(`${p.id}-${seasonYear}`)();
      if(roll>=chance)return;
      const plan={playerId:p.id,name:p.name,club:p.club,age:p.age,overall:p.overall,announcedDate:dateISO,retireAfterSeason:seasonYear,status:"announced"};
      state.retirementPlans[String(p.id)]=plan;announced.push(plan);
      if(p.club===state.club&&typeof addNews==="function")addNews(`${p.name} has announced that they will retire from professional football at the end of the ${currentLabel()} season.`);
    });
    return announced;
  }

  function removeRetiredPlayerFromCareer(p,plan){
    const oldClub=p.club;
    const record={playerId:p.id,name:p.name,club:oldClub,age:p.age,overall:p.overall,season:currentLabel(),year:currentYear(),generatedPlayer:Boolean(p.generatedPlayer)};
    if(!state.retiredPlayers.some(x=>String(x.playerId)===String(p.id)))state.retiredPlayers.push(record);
    p.retired=true;p.club="Retired";
    state.playerWorldOverrides=state.playerWorldOverrides||{};
    state.playerWorldOverrides[p.id]={...(state.playerWorldOverrides[p.id]||{}),retired:true,club:"Retired"};
    if(state.playerClubOverrides)state.playerClubOverrides[p.id]="Retired";
    if(state.playerContracts)delete state.playerContracts[p.id];
    if(state.playerListStatus)delete state.playerListStatus[p.id];
    if(state.incomingTransferOffers)state.incomingTransferOffers=state.incomingTransferOffers.filter(x=>String(x.playerId)!==String(p.id));
    if(state.transferNegotiations)delete state.transferNegotiations[p.id];
    if(oldClub===state.club&&typeof addNews==="function")addNews(`${p.name} has retired from professional football at the age of ${p.age}.`);
    return record;
  }

  function processSeasonRetirements(){
    ensurePlayerLifecycleState();
    const seasonYear=currentYear();
    // Anyone at the forced-retirement age is captured even if the March notice
    // was missed because the user loaded a late-season legacy save.
    DB.players.forEach(p=>{
      if(p.retired)return;
      const forced=(p.age||0)>=(isGoalkeeper(p)?42:40);
      if(forced&&!state.retirementPlans[String(p.id)])state.retirementPlans[String(p.id)]={playerId:p.id,name:p.name,club:p.club,age:p.age,overall:p.overall,announcedDate:null,retireAfterSeason:seasonYear,status:"forced"};
    });
    const retired=[];
    Object.values(state.retirementPlans).forEach(plan=>{
      if(Number(plan.retireAfterSeason)>seasonYear||plan.status==="retired")return;
      const p=DB.players.find(x=>String(x.id)===String(plan.playerId));
      if(!p||p.retired){plan.status="retired";return;}
      retired.push(removeRetiredPlayerFromCareer(p,plan));plan.status="retired";
    });
    if(retired.length&&typeof invalidateClubSquadCache==="function")invalidateClubSquadCache();
    return retired;
  }

  // Youth generation is linked to the environment the player emerges from.
  // Starting ability is strongly shaped by academy + league standard; potential
  // is deliberately less league-dependent so a lower-league club can still
  // occasionally produce an elite talent.
  const NATIONAL_TALENT={
    England:79,Spain:81,Germany:80,France:83,Italy:79,Portugal:81,Netherlands:80,Belgium:79,
    Brazil:85,Argentina:84,Colombia:77,Uruguay:81,Croatia:80,Serbia:77,Denmark:77,Sweden:76,Norway:77,
    Turkey:74,Morocco:78,Nigeria:79,Ghana:76,Senegal:79,Japan:73,"South Korea":73,USA:73
  };
  const COUNTRY_TO_NATIONALITY={
    England:"England",Spain:"Spain",Germany:"Germany",France:"France",Italy:"Italy",Portugal:"Portugal",
    Netherlands:"Netherlands",Belgium:"Belgium",Brazil:"Brazil",Argentina:"Argentina",Colombia:"Colombia",
    Uruguay:"Uruguay",Croatia:"Croatia",Serbia:"Serbia",Denmark:"Denmark",Sweden:"Sweden",Norway:"Norway",
    Turkey:"Turkey",Morocco:"Morocco",Nigeria:"Nigeria",Ghana:"Ghana",Senegal:"Senegal",Japan:"Japan",
    "South Korea":"South Korea",USA:"USA","United States":"USA"
  };
  function stableUnit(key){return hash32(key)/4294967295;}
  function worldClubObject(club){
    return typeof worldClubByName==="function"?worldClubByName(club):[...(DB.clubs||[]),...(DB.worldClubs||[])].find(x=>x.name===club)||null;
  }
  function activeGenerationClubs(){
    return (typeof allWorldClubs==="function"?allWorldClubs():[...(DB.clubs||[]),...(DB.worldClubs||[])])
      .filter(c=>c&&c.name&&c.name!==state.club&&c.leagueId!=="saudi-pro-league"&&c.simulationLevel!=="market-feature"&&c.generatesYouth!==false);
  }
  function clubSquadQualityForYouth(club){
    const c=worldClubObject(club);if(!c)return 68;
    const players=(DB.players||[]).filter(p=>!p.retired&&p.club===club).sort((a,b)=>(b.overall||0)-(a.overall||0)).slice(0,18);
    const roster=players.length>=8?players.reduce((sum,p)=>sum+Number(p.overall||60),0)/players.length:null;
    const seed=Number(c.standard||c.strength||c.reputation||70);
    return clampLocal(roster==null?seed:roster*.78+seed*.22,50,90);
  }
  function rawLeagueYouthQuality(leagueId){
    const clubs=(typeof clubsInLeague==="function"?clubsInLeague(leagueId):activeGenerationClubs().filter(c=>c.leagueId===leagueId));
    if(!clubs.length)return 68;
    const values=clubs.map(c=>clubSquadQualityForYouth(c.name));
    return clampLocal(values.reduce((a,b)=>a+b,0)/values.length,50,90);
  }
  function leagueYouthQuality(leagueId,{update=false}={}){
    ensurePlayerLifecycleState();
    state.playerLifecycleMeta.leagueYouthEnvironment=state.playerLifecycleMeta.leagueYouthEnvironment||{};
    const raw=rawLeagueYouthQuality(leagueId);
    const prev=Number(state.playerLifecycleMeta.leagueYouthEnvironment[leagueId]);
    if(update){
      const next=Number.isFinite(prev)?prev*.80+raw*.20:raw;
      state.playerLifecycleMeta.leagueYouthEnvironment[leagueId]=Math.round(next*100)/100;
      return next;
    }
    return Number.isFinite(prev)?prev:raw;
  }
  function refreshLeagueYouthEnvironments(){
    const ids=new Set(activeGenerationClubs().map(c=>c.leagueId).filter(Boolean));
    const out={};ids.forEach(id=>{out[id]=leagueYouthQuality(id,{update:true});});return out;
  }
  function academyQualityForClub(club){
    if(club===state.club&&typeof facilityRating==="function")return clampLocal(Number(facilityRating("academy")||70),40,100);
    const c=worldClubObject(club);if(!c)return 65;
    if(Number.isFinite(Number(c.academyRating)))return clampLocal(Number(c.academyRating),40,100);
    const rep=Number(c.reputation||c.standard||70);
    const variance=(stableUnit(`academy|${c.id||c.name}`)-.5)*6;
    return clampLocal(52+(rep-60)*1.05+variance,42,94);
  }
  function nationalityTalentScore(nationality){return Number(NATIONAL_TALENT[nationality]||75);}
  // v0.24.10: academy quality changes the odds of better prospect types rather
  // than simply adding points to every generated player's POT/OVR. Strong
  // academies can still have poor intakes and limited-ceiling graduates.
  function prospectPotentialProfile(rng,{academyRating=70,leagueQuality=70,nationality="England"}={}){
    const academy=clampLocal((Number(academyRating)-50)/45,0,1);
    const bands=[
      {key:"limited",min:56,max:67,weight:.36-.18*academy},
      {key:"steady",min:63,max:73,weight:.34-.08*academy},
      {key:"development",min:70,max:81,weight:.22+.08*academy},
      {key:"high-upside",min:80,max:88,weight:.06+.12*academy},
      {key:"elite",min:89,max:95,weight:.02+.06*academy}
    ];
    const total=bands.reduce((sum,b)=>sum+b.weight,0);
    let roll=rng()*total,selected=bands[bands.length-1];
    for(const band of bands){roll-=band.weight;if(roll<=0){selected=band;break;}}
    let potential=selected.min+Math.floor(rng()*(selected.max-selected.min+1));
    // National/league context is only a light nudge. Academy quality has already
    // acted through the probability bands above, so it does not raise the floor.
    const nation=(nationalityTalentScore(nationality)-75)/18;
    const league=(Number(leagueQuality)-70)/24;
    const modifier=clampLocal(Math.round(nation+league+(rng()-.5)*1.2),-2,2);
    potential=clampLocal(potential+modifier,55,95);
    return {potential,band:selected.key};
  }
  function playerPotentialForEnvironment(rng,context={}){
    return prospectPotentialProfile(rng,context).potential;
  }
  function prospectAgeRoll(rng){
    const r=rng();
    if(r<.45)return 16;
    if(r<.80)return 17;
    if(r<.96)return 18;
    return 19;
  }
  function initialOverallForProspect(age,potential,rng,context={}){
    const academy=Number(context.academyRating??70),leagueQ=Number(context.leagueQuality??70);
    // Readiness is deliberately generated largely independently from potential.
    // A player can therefore be 58/65 (already decent, limited growth) or 52/76
    // (rawer, higher upside) without every high-POT player arriving first-team ready.
    const r=rng();
    let readiness,readinessBonus;
    // The annual intake represents the small group promoted into the senior-game
    // database, not every scholar in the academy. Very low current ability can
    // still occur, but most selected graduates should already be credible
    // development players for their club level.
    if(r<.08){readiness="near-ready";readinessBonus=7+Math.floor(rng()*5);}
    else if(r<.40){readiness="balanced";readinessBonus=3+Math.floor(rng()*5);}
    else if(r<.93){readiness="raw";readinessBonus=-1+Math.floor(rng()*5);}
    else{readiness="very-raw";readinessBonus=-4+Math.floor(rng()*4);}
    const ageN=Math.max(0,Number(age||16)-16);
    const leagueBase=50.5+(leagueQ-60)*.18;
    const academyNudge=clampLocal((academy-70)*.03,-.6,.9);
    let ovr=leagueBase+ageN*2+academyNudge+readinessBonus+(rng()-.5)*2;
    // A genuinely exceptional elite-academy prospect can be unusually advanced,
    // but this combination is rare because both elite POT and near-ready profile
    // must already have been rolled.
    if(Number(potential)>=92&&academy>=90&&readiness==="near-ready")ovr+=2;
    const ageFloor=48+ageN*2;
    let ageCap=Number(age||16)<=16?65:Number(age||16)===17?68:Number(age||16)===18?71:74;
    if(leagueQ>=75)ageCap+=2;else if(leagueQ>=70)ageCap+=1;else if(leagueQ<60)ageCap-=1;
    ovr=clampLocal(Math.round(ovr),ageFloor,Math.min(Number(potential),ageCap));
    return ovr;
  }
  function generatedWage(overall,clubStandard){
    const base=Math.max(1200,Math.pow(Math.max(1,overall-48),1.72)*145);
    return Math.round((base*(.75+Math.max(55,clubStandard||70)/180))/500)*500;
  }
  function basicGeneratedValue(overall,potential,age,context={}){
    // Initial youth valuations are deliberately conservative, especially below
    // the Championship. The previous curve could value a League One academy
    // graduate at £50m+ before he had played a senior match.
    const leagueQ=Number(context.leagueQuality??70);
    const base=Math.max(40000,40000*Math.pow(1.32,Math.max(0,Number(overall)-50)));
    const potPremium=1+Math.max(0,Number(potential)-Number(overall))*.045;
    const youth=age<=17?1.10:age===18?1.05:1;
    const marketScale=clampLocal(.38+(leagueQ-60)*.031,.38,1);
    const value=base*potPremium*youth*marketScale;
    return Math.max(50000,Math.round(value/50000)*50000);
  }
  function generatedHeight(positions,rng){
    if(positions.includes("GK"))return 185+Math.floor(rng()*16);
    if(positions.includes("CB"))return 180+Math.floor(rng()*15);
    if(positions==="ST")return 174+Math.floor(rng()*18);
    return 165+Math.floor(rng()*21);
  }
  function chooseGeneratedOriginClub(rng){
    const clubs=activeGenerationClubs();if(!clubs.length)return null;
    const weights=clubs.map(c=>.72+academyQualityForClub(c.name)/180);
    const total=weights.reduce((a,b)=>a+b,0);let roll=rng()*total;
    for(let i=0;i<clubs.length;i++){roll-=weights[i];if(roll<=0)return clubs[i];}
    return clubs[clubs.length-1];
  }
  function homeNationalityForLeagueId(leagueId){
    const league=typeof leagueById==="function"?leagueById(leagueId):(DB.leagues||[]).find(l=>l.id===leagueId);
    return COUNTRY_TO_NATIONALITY[league?.country]||null;
  }
  function generatedNationalityForClub(clubObj,rng){
    const home=homeNationalityForLeagueId(clubObj?.leagueId);
    if(home&&FIRST_NAMES[home]&&rng()<.64)return home;
    return weightedChoice(NATIONALITIES,rng);
  }
  function leagueIdForClubName(club){
    const c=typeof worldClubByName==="function"?worldClubByName(club):[...(DB.clubs||[]),...(DB.worldClubs||[])].find(x=>x.name===club);
    return c?.leagueId||null;
  }
  function clubStandardForName(club){
    const c=typeof worldClubByName==="function"?worldClubByName(club):[...(DB.clubs||[]),...(DB.worldClubs||[])].find(x=>x.name===club);
    return c?.standard||c?.strength||c?.reputation||70;
  }
  function nextGeneratedId(year,index){
    state.playerLifecycleMeta.nextGeneratedId=(state.playerLifecycleMeta.nextGeneratedId||1)+1;
    return `regen-${year}-${index}-${state.playerLifecycleMeta.nextGeneratedId}`;
  }
  function createGeneratedPlayer(year,index,rng){
    const origin=chooseGeneratedOriginClub(rng);
    const club=origin?.name||"Free Agent";
    const leagueId=origin?.leagueId||leagueIdForClubName(club);
    const nationality=generatedNationalityForClub(origin,rng);
    const firstPool=FIRST_NAMES[nationality]||FIRST_NAMES.England,lastPool=LAST_NAMES[nationality]||LAST_NAMES.England;
    const first=firstPool[Math.floor(rng()*firstPool.length)],last=lastPool[Math.floor(rng()*lastPool.length)];
    const fullName=`${first} ${last}`;
    const age=prospectAgeRoll(rng);
    const academyRating=club==="Free Agent"?65:academyQualityForClub(club);
    const leagueQuality=leagueId?leagueYouthQuality(leagueId):68;
    const talent=prospectPotentialProfile(rng,{academyRating,leagueQuality,nationality});
    const potential=talent.potential;
    const overall=initialOverallForProspect(age,potential,rng,{academyRating,leagueQuality});
    const positions=weightedChoice(POSITION_PROFILES,rng);
    const standard=clubStandardForName(club);
    const foot=rng()<.27?"Left":"Right";
    const id=nextGeneratedId(year,index);
    return {
      id,name:fullName,fullName,club,leagueId,positions,overall,potential,age,nationality,
      value:basicGeneratedValue(overall,potential,age,{leagueQuality}),wage:generatedWage(overall,standard),contract:year+3+Math.floor(rng()*3),
      number:null,foot,preferredFoot:foot,weakFoot:2+Math.floor(rng()*3),skills:positions.includes("GK")?1:2+Math.floor(rng()*3),height:generatedHeight(positions,rng),
      joined:`Jul ${year}`,joinedSource:"club youth intake",generatedPlayer:true,dataSource:GENERATED_MARKER,potentialSource:"Football CEO club/league-linked career potential",
      youthOriginClub:club,youthLeagueQuality:Math.round(leagueQuality*10)/10,youthAcademyQuality:Math.round(academyRating),youthPotentialBand:talent.band,
      birthdate:`${year-age}-${String(1+Math.floor(rng()*12)).padStart(2,"0")}-${String(1+Math.floor(rng()*27)).padStart(2,"0")}`
    };
  }

  function homeNationalityForClub(club=state.club){
    const leagueId=leagueIdForClubName(club);
    return homeNationalityForLeagueId(leagueId)||"England";
  }

  function userAcademyNationality(rng){
    const home=homeNationalityForClub();
    // Academy intakes remain predominantly local while still reflecting modern
    // international recruitment. This is deliberately broad until a scouting/
    // academy recruitment system exists.
    if(rng()<.58)return home;
    return weightedChoice(NATIONALITIES,rng);
  }

  function userAcademyPotential(rng,academyRating,nationality=null){
    const leagueId=leagueIdForClubName(state.club);
    return playerPotentialForEnvironment(rng,{academyRating,leagueQuality:leagueYouthQuality(leagueId),nationality:nationality||homeNationalityForClub()});
  }

  function userAcademyIntakeCount(rng,academyRating){
    const academy=Number(academyRating||70);
    let count=2;
    const thirdChance=clampLocal(.30+(academy-55)*.008,.22,.64);
    const fourthChance=clampLocal((academy-72)*.006,0,.18);
    if(rng()<thirdChance)count++;
    if(rng()<fourthChance)count++;
    return clampLocal(count,2,4);
  }

  function uniqueAcademyName(nationality,rng,usedNames){
    const firstPool=FIRST_NAMES[nationality]||FIRST_NAMES.England;
    const lastPool=LAST_NAMES[nationality]||LAST_NAMES.England;
    for(let tries=0;tries<40;tries++){
      const first=firstPool[Math.floor(rng()*firstPool.length)];
      const last=lastPool[Math.floor(rng()*lastPool.length)];
      const name=`${first} ${last}`;
      if(!usedNames.has(name.toLowerCase()))return name;
    }
    // Long careers can eventually exhaust a small name combination pool. A
    // believable double surname is preferable to duplicate player identities.
    const first=firstPool[Math.floor(rng()*firstPool.length)];
    const a=lastPool[Math.floor(rng()*lastPool.length)];
    let b=lastPool[Math.floor(rng()*lastPool.length)];
    if(b===a)b=lastPool[(lastPool.indexOf(b)+1)%lastPool.length];
    return `${first} ${a}-${b}`;
  }

  function createUserAcademyPlayer(year,index,rng,academyRating,usedNames){
    const nationality=userAcademyNationality(rng);
    const fullName=uniqueAcademyName(nationality,rng,usedNames);
    usedNames.add(fullName.toLowerCase());
    const age=prospectAgeRoll(rng);
    const leagueQuality=leagueYouthQuality(leagueIdForClubName(state.club));
    const talent=prospectPotentialProfile(rng,{academyRating,leagueQuality,nationality});
    const potential=talent.potential;
    const overall=initialOverallForProspect(age,potential,rng,{academyRating,leagueQuality});
    const positions=weightedChoice(POSITION_PROFILES,rng);
    const club=state.club;
    const leagueId=leagueIdForClubName(club);
    const foot=rng()<.27?"Left":"Right";
    const id=nextGeneratedId(year,`academy-${index}`);
    const youthWage=Math.max(500,Math.round((650+Math.max(0,overall-50)*145)/250)*250);
    return {
      id,name:fullName,fullName,club,leagueId,positions,overall,potential,age,nationality,
      value:basicGeneratedValue(overall,potential,age,{leagueQuality}),wage:youthWage,contract:year+3+Math.floor(rng()*2),
      number:null,foot,preferredFoot:foot,weakFoot:2+Math.floor(rng()*3),skills:positions.includes("GK")?1:2+Math.floor(rng()*3),height:generatedHeight(positions,rng),
      joined:`Jul ${year}`,joinedSource:"academy intake",generatedPlayer:true,userAcademyGraduate:true,dataSource:GENERATED_MARKER,
      potentialSource:"Football CEO club/league-linked academy potential",
      youthOriginClub:club,youthLeagueQuality:Math.round(leagueQuality*10)/10,youthAcademyQuality:Math.round(Number(academyRating||70)),youthPotentialBand:talent.band,
      birthdate:`${year-age}-${String(1+Math.floor(rng()*12)).padStart(2,"0")}-${String(1+Math.floor(rng()*27)).padStart(2,"0")}`
    };
  }

  function generateUserAcademyIntake(intakeYear,rng){
    ensurePlayerLifecycleState();
    if(state.userAcademyIntakes.some(x=>Number(x.year)===Number(intakeYear)))return [];
    const academyRating=typeof facilityRating==="function"?facilityRating("academy"):70;
    const count=userAcademyIntakeCount(rng,academyRating);
    const usedNames=new Set(DB.players.map(p=>String(p.name).toLowerCase()));
    const created=[];
    for(let i=0;i<count;i++){
      const p=createUserAcademyPlayer(intakeYear,i,rng,academyRating,usedNames);
      state.generatedPlayers.push({...p});DB.players.push(p);created.push(p);
    }
    state.userAcademyIntakes.push({
      year:intakeYear,season:`${intakeYear}/${String((intakeYear+1)%100).padStart(2,"0")}`,academyRating,
      count:created.length,playerIds:created.map(p=>p.id),bestPotential:Math.max(...created.map(p=>p.potential))
    });
    return created;
  }

  function annualWorldIntakeTarget(retiredCount=0){
    const activePlayers=(DB.players||[]).filter(p=>!p.retired&&p.club!=="Retired").length;
    const clubCount=activeGenerationClubs().length+1;
    const pipeline=Math.max(clubCount,Math.round(activePlayers/24));
    const retirementSupport=Math.round(Number(retiredCount||0)*.55);
    return clampLocal(Math.max(pipeline,retirementSupport),72,360);
  }

  function generateAnnualPlayerIntake(retiredCount=0){
    ensurePlayerLifecycleState();
    const intakeYear=currentYear()+1;
    if(state.generatedIntakes.some(x=>Number(x.year)===intakeYear))return [];
    refreshLeagueYouthEnvironments();
    const count=annualWorldIntakeTarget(retiredCount);
    const rng=seededRandom(`${state.worldSeed??state.saveId??state.club??"career"}-intake-${intakeYear}`);
    const userIntake=generateUserAcademyIntake(intakeYear,rng);
    const created=[];const usedNames=new Set(DB.players.map(p=>String(p.name).toLowerCase()));
    for(let i=0;i<count;i++){
      let p=createGeneratedPlayer(intakeYear,i,rng),tries=0;
      while(usedNames.has(String(p.name).toLowerCase())&&tries<8){p=createGeneratedPlayer(intakeYear,i+tries+1,rng);tries++;}
      usedNames.add(String(p.name).toLowerCase());
      state.generatedPlayers.push({...p});DB.players.push(p);created.push(p);
    }
    const elite=created.filter(p=>p.potential>=88).length,high=created.filter(p=>p.potential>=83&&p.potential<88).length;
    state.generatedIntakes.push({year:intakeYear,season:`${intakeYear}/${String((intakeYear+1)%100).padStart(2,"0")}`,count:created.length,elite,high,userCount:userIntake.length,leagueYouthEnvironment:{...(state.playerLifecycleMeta.leagueYouthEnvironment||{})}});
    if(typeof ensurePlayerDevelopmentState==="function"){state._developmentKnownCount=0;ensurePlayerDevelopmentState();}
    if(typeof invalidateClubSquadCache==="function")invalidateClubSquadCache();
    return created;
  }

  function maintainGeneratedPlayerContracts(nextYear=currentYear()+1){
    ensurePlayerLifecycleState();
    state.playerWorldOverrides=state.playerWorldOverrides||{};
    DB.players.filter(p=>p.generatedPlayer&&!p.retired&&p.club!==state.club).forEach(p=>{
      if(Number(p.contract||9999)>nextYear)return;
      const roll=typeof stablePlayerTrait==="function"?stablePlayerTrait(p,`regen-contract-${nextYear}`):seededRandom(`${p.id}-contract-${nextYear}`)();
      p.contract=nextYear+2+Math.floor(roll*3);
      state.playerWorldOverrides[p.id]={...(state.playerWorldOverrides[p.id]||{}),contract:p.contract};
    });
  }

  function processPlayerLifecycleSeasonRollover(){
    ensurePlayerLifecycleState();
    const retired=processSeasonRetirements();
    maintainGeneratedPlayerContracts(currentYear()+1);
    const generated=generateAnnualPlayerIntake(retired.length);
    const intakeYear=currentYear()+1;
    const intakeRecord=state.userAcademyIntakes.find(x=>Number(x.year)===intakeYear);
    const userIds=new Set(intakeRecord?.playerIds||[]);
    const userIntake=DB.players.filter(p=>userIds.has(p.id));
    return {retired,generated,userIntake};
  }

  function generatedPlayerSummary(){
    ensurePlayerLifecycleState();
    return {generated:state.generatedPlayers.length,retired:state.retiredPlayers.length,intakes:[...state.generatedIntakes],academyIntakes:[...state.userAcademyIntakes]};
  }

  window.ensurePlayerLifecycleState=ensurePlayerLifecycleState;
  window.processRetirementAnnouncements=processRetirementAnnouncements;
  window.processSeasonRetirements=processSeasonRetirements;
  window.generateAnnualPlayerIntake=generateAnnualPlayerIntake;
  window.generateUserAcademyIntake=generateUserAcademyIntake;
  window.maintainGeneratedPlayerContracts=maintainGeneratedPlayerContracts;
  window.processPlayerLifecycleSeasonRollover=processPlayerLifecycleSeasonRollover;
  window.generatedPlayerSummary=generatedPlayerSummary;
  window.retirementChance=retirementChance;
  window.leagueYouthQuality=leagueYouthQuality;
  window.refreshLeagueYouthEnvironments=refreshLeagueYouthEnvironments;
  window.academyQualityForClub=academyQualityForClub;
  window.playerPotentialForEnvironment=playerPotentialForEnvironment;
  window.initialOverallForProspect=initialOverallForProspect;
  window.createGeneratedPlayer=createGeneratedPlayer;
  window.annualWorldIntakeTarget=annualWorldIntakeTarget;
})();
