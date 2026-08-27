/* Football CEO v0.24.1 — Long-term player lifecycle + user academy intakes
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

  function playerPotential(rng){
    const r=rng();
    if(r<.006)return 93+Math.floor(rng()*3);       // generational: very rare
    if(r<.035)return 88+Math.floor(rng()*5);       // elite prospect
    if(r<.13)return 83+Math.floor(rng()*5);        // high potential
    if(r<.35)return 78+Math.floor(rng()*5);        // strong professional
    if(r<.68)return 72+Math.floor(rng()*6);        // ordinary top-level depth
    return 64+Math.floor(rng()*8);                 // lower-level career
  }
  function initialOverallForProspect(age,potential,rng){
    const gapBase=age<=16?20:age===17?17:age===18?14:11;
    const gap=gapBase+Math.floor(rng()*8);
    let ovr=potential-gap;
    if(potential>=90&&rng()<.28)ovr+=3;
    return clampLocal(Math.round(ovr),50,74);
  }
  function generatedWage(overall,clubStandard){
    const base=Math.max(1200,Math.pow(Math.max(1,overall-48),1.72)*145);
    return Math.round((base*(.75+Math.max(55,clubStandard||70)/180))/500)*500;
  }
  function basicGeneratedValue(overall,potential,age){
    const base=Math.max(250000,Math.pow(Math.max(1,overall-48),2.45)*6500);
    const potPremium=1+Math.max(0,potential-overall)*.07;
    const youth=age<=17?1.18:age===18?1.10:1;
    return Math.max(250000,Math.round(base*potPremium*youth/250000)*250000);
  }
  function generatedHeight(positions,rng){
    if(positions.includes("GK"))return 185+Math.floor(rng()*16);
    if(positions.includes("CB"))return 180+Math.floor(rng()*15);
    if(positions==="ST")return 174+Math.floor(rng()*18);
    return 165+Math.floor(rng()*21);
  }
  function chooseGeneratedClub(potential,nationality,rng){
    const clubs=(typeof allWorldClubs==="function"?allWorldClubs():[...(DB.clubs||[]),...(DB.worldClubs||[])]).filter(c=>c&&c.name&&c.name!==state.club&&c.leagueId!=="saudi-pro-league");
    if(!clubs.length)return "Free Agent";
    const countryLeague={England:["premier-league","championship"],Spain:["la-liga"],Germany:["bundesliga"],France:["ligue-1"],Italy:["serie-a"]}[nationality];
    let pool=countryLeague?clubs.filter(c=>countryLeague.includes(c.leagueId)):clubs;
    if(!pool.length)pool=clubs;
    // Most elite prospects join strong clubs, but a meaningful minority emerge
    // at smaller sides so the transfer market can still discover breakout talent.
    if(potential>=88&&rng()>.38){const strong=pool.filter(c=>(c.reputation||c.standard||70)>=82);if(strong.length)pool=strong;}
    else if(potential<=75){const modest=pool.filter(c=>(c.reputation||c.standard||70)<=80);if(modest.length)pool=modest;}
    return pool[Math.floor(rng()*pool.length)]?.name||"Free Agent";
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
    const nationality=weightedChoice(NATIONALITIES,rng);
    const first=FIRST_NAMES[nationality][Math.floor(rng()*FIRST_NAMES[nationality].length)];
    const last=LAST_NAMES[nationality][Math.floor(rng()*LAST_NAMES[nationality].length)];
    const fullName=`${first} ${last}`;
    const age=16+Math.floor(rng()*4);
    const potential=playerPotential(rng);
    const overall=initialOverallForProspect(age,potential,rng);
    const positions=weightedChoice(POSITION_PROFILES,rng);
    const club=chooseGeneratedClub(potential,nationality,rng);
    const leagueId=leagueIdForClubName(club);
    const standard=clubStandardForName(club);
    const foot=rng()<.27?"Left":"Right";
    const id=nextGeneratedId(year,index);
    return {
      id,name:fullName,fullName,club,leagueId,positions,overall,potential,age,nationality,
      value:basicGeneratedValue(overall,potential,age),wage:generatedWage(overall,standard),contract:year+3+Math.floor(rng()*3),
      number:null,foot,preferredFoot:foot,weakFoot:2+Math.floor(rng()*3),skills:positions.includes("GK")?1:2+Math.floor(rng()*3),height:generatedHeight(positions,rng),
      joined:`Jul ${year}`,joinedSource:"generated",generatedPlayer:true,dataSource:GENERATED_MARKER,potentialSource:"Football CEO generated career potential",
      birthdate:`${year-age}-${String(1+Math.floor(rng()*12)).padStart(2,"0")}-${String(1+Math.floor(rng()*27)).padStart(2,"0")}`
    };
  }

  function homeNationalityForClub(club=state.club){
    const leagueId=leagueIdForClubName(club);
    const map={
      "premier-league":"England","championship":"England","la-liga":"Spain","bundesliga":"Germany",
      "ligue-1":"France","serie-a":"Italy"
    };
    return map[leagueId]||"England";
  }

  function userAcademyNationality(rng){
    const home=homeNationalityForClub();
    // Academy intakes remain predominantly local while still reflecting modern
    // international recruitment. This is deliberately broad until a scouting/
    // academy recruitment system exists.
    if(rng()<.58)return home;
    return weightedChoice(NATIONALITIES,rng);
  }

  function userAcademyPotential(rng,academyRating){
    const q=clampLocal((Number(academyRating||70)-50)/45,0,1);
    const elite=.010+.035*q;
    const veryGood=.080+.080*q;
    const good=.230+.100*q;
    const r=rng();
    if(r<elite){
      if(rng()<.07)return 93+Math.floor(rng()*3); // exceptional academy graduate
      return 88+Math.floor(rng()*5);
    }
    if(r<elite+veryGood)return 83+Math.floor(rng()*5);
    if(r<elite+veryGood+good)return 77+Math.floor(rng()*6);
    return 68+Math.floor(rng()*9);
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
    const age=16+Math.floor(rng()*4);
    const potential=userAcademyPotential(rng,academyRating);
    let overall=initialOverallForProspect(age,potential,rng);
    overall=clampLocal(overall+Math.round((Number(academyRating||70)-70)/25),50,76);
    const positions=weightedChoice(POSITION_PROFILES,rng);
    const club=state.club;
    const leagueId=leagueIdForClubName(club);
    const foot=rng()<.27?"Left":"Right";
    const id=nextGeneratedId(year,`academy-${index}`);
    const youthWage=Math.max(500,Math.round((650+Math.max(0,overall-50)*145)/250)*250);
    return {
      id,name:fullName,fullName,club,leagueId,positions,overall,potential,age,nationality,
      value:basicGeneratedValue(overall,potential,age),wage:youthWage,contract:year+3+Math.floor(rng()*2),
      number:null,foot,preferredFoot:foot,weakFoot:2+Math.floor(rng()*3),skills:positions.includes("GK")?1:2+Math.floor(rng()*3),height:generatedHeight(positions,rng),
      joined:`Jul ${year}`,joinedSource:"academy intake",generatedPlayer:true,userAcademyGraduate:true,dataSource:GENERATED_MARKER,
      potentialSource:"Football CEO generated academy potential",
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

  function generateAnnualPlayerIntake(retiredCount=0){
    ensurePlayerLifecycleState();
    const intakeYear=currentYear()+1;
    if(state.generatedIntakes.some(x=>Number(x.year)===intakeYear))return [];
    // A minimum cohort prevents the world ageing faster than replacements during
    // the early years; later, retirements naturally determine most of the volume.
    const count=clampLocal(Math.max(72,Number(retiredCount||0)),72,260);
    const rng=seededRandom(`${state.saveId||state.club||"career"}-intake-${intakeYear}`);
    const userIntake=generateUserAcademyIntake(intakeYear,rng);
    const created=[];const usedNames=new Set(DB.players.map(p=>String(p.name).toLowerCase()));
    for(let i=0;i<count;i++){
      let p=createGeneratedPlayer(intakeYear,i,rng),tries=0;
      while(usedNames.has(String(p.name).toLowerCase())&&tries<8){p=createGeneratedPlayer(intakeYear,i+tries+1,rng);tries++;}
      usedNames.add(String(p.name).toLowerCase());
      state.generatedPlayers.push({...p});DB.players.push(p);created.push(p);
    }
    const elite=created.filter(p=>p.potential>=88).length,high=created.filter(p=>p.potential>=83&&p.potential<88).length;
    state.generatedIntakes.push({year:intakeYear,season:`${intakeYear}/${String((intakeYear+1)%100).padStart(2,"0")}`,count:created.length,elite,high,userCount:userIntake.length});
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
})();
