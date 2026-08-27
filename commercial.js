/* FOOTBALL CEO — COMMERCIAL & TICKETING MODULE v0.21
   Real season-ticket inventory, waiting lists, supporter demand and attendance. */
(function(){
  function n(v,d=0){v=Number(v);return Number.isFinite(v)?v:d;}
  function cap(){ return typeof currentStadiumCapacity==='function'?currentStadiumCapacity():(STADIUMS?.[state.club]?.capacity||0); }
  function opCap(){ return typeof currentOperationalCapacity==='function'?currentOperationalCapacity():cap(); }
  function cclamp(v,a,b){return Math.max(a,Math.min(b,v));}

  window.ensureTicketingState=function(){
    if(!state) return null;
    if(typeof ensureDynamicStadiumState==='function') ensureDynamicStadiumState();
    const capacity=cap();
    const c=typeof byClub==='function'?byClub(state.club):null;
    if(!state.supporters){
      const rep=n(c?.reputation,72);
      // Starting demand reflects club profile but is absolute, never a % of all future stadia.
      const multiplier=cclamp(0.82+(rep-70)*0.011,0.72,1.28);
      state.supporters={
        demand:Math.round(capacity*multiplier),
        lastSeasonDemand:null,
        growthThisSeason:0,
        capacityPressure:0
      };
    }
    if(state.supporters.demand==null) state.supporters.demand=Math.round(capacity*.9);

    if(!state.seasonTickets){
      const allocation=Math.round(capacity*.70);
      const initialDemand=Math.max(0,Math.round(state.supporters.demand*.58));
      const sold=Math.min(allocation,initialDemand);
      state.seasonTickets={
        season:state.season?.label||null,
        allocation,sold,
        waitingList:Math.max(0,initialDemand-allocation),
        previousSold:sold,
        renewals:sold,
        newSales:0,
        applications:initialDemand,
        avgPrice:0,
        revenue:0,
        processed:false,
        selloutStreak:sold>=allocation&&allocation>0?1:0
      };
    }
    const st=state.seasonTickets;
    ['allocation','sold','waitingList','previousSold','renewals','newSales','applications','avgPrice','revenue','selloutStreak'].forEach(k=>{if(st[k]==null)st[k]=0;});
    return st;
  };

  window.seasonTicketAllocation=function(){ return Math.round(Math.max(0,cap())*.70); };

  window.averageSeasonTicketUnitPrice=function(){
    const p=state.pricing||defaultPricing(state.club);
    const avgMatch=n(p.ticket)*.76+n(p.concession)*.24;
    const discount=cclamp(n(state.seasonTicketDiscount,15),0,60)/100;
    return Math.max(1,Math.round(avgMatch*19*(1-discount)));
  };

  function fanDemandFactor(){
    const h=n(state.happiness?.fans,70);
    return cclamp(.78+h/330,.82,1.08);
  }

  function performanceApplicationFactor(){
    let result=1;
    const target=typeof byClub==='function'?(byClub(state.club)?.target||10):10;
    const pos=typeof clubLeaguePosition==='function'?clubLeaguePosition(state.club):target;
    if(state.week>=5){
      if(pos<=target-4) result+=.10;
      else if(pos<=target-2) result+=.05;
      else if(pos>=target+5) result-=.08;
    }
    const form=state.form||[];
    const pts=form.reduce((s,r)=>s+(r==='W'?3:r==='D'?1:0),0);
    if(form.length>=3){
      const ppg=pts/form.length;
      if(ppg>=2) result+=.05;
      else if(ppg<=.8) result-=.05;
    }
    return cclamp(result,.78,1.18);
  }

  window.projectSeasonTicketSales=function(){
    const st=ensureTicketingState();
    const allocation=seasonTicketAllocation();
    const prevSold=Math.min(n(st.previousSold,st.sold),allocation||n(st.sold));
    const discount=n(state.seasonTicketDiscount,15);
    const priceFactor=cclamp(1.08-(15-discount)*.008,.87,1.16);
    const renewalRate=cclamp((.79+n(state.happiness?.fans,70)*.0018)*priceFactor,0.72,0.97);
    const renewals=Math.min(allocation,Math.round(prevSold*renewalRate));

    const committedPool=Math.round(Math.max(0,n(state.supporters?.demand))*cclamp(.54+discount*.0045,.54,.69)*fanDemandFactor()*performanceApplicationFactor());
    const applications=Math.max(renewals,committedPool);
    const available=Math.max(0,allocation-renewals);
    const oldWaiting=Math.max(0,n(st.waitingList));
    const waitingAccepted=Math.min(available,oldWaiting);
    const afterWaiting=available-waitingAccepted;
    const brandNewDemand=Math.max(0,applications-renewals-oldWaiting);
    const brandNewSales=Math.min(afterWaiting,brandNewDemand);
    const sold=Math.min(allocation,renewals+waitingAccepted+brandNewSales);
    const waitingList=Math.max(0,oldWaiting-waitingAccepted)+Math.max(0,brandNewDemand-brandNewSales);
    const avgPrice=averageSeasonTicketUnitPrice();
    return {allocation,previousSold:prevSold,renewalRate,renewals,waitingAccepted,newSales:waitingAccepted+brandNewSales,applications,sold,waitingList,avgPrice,revenue:sold*avgPrice};
  };

  window.processSeasonTicketSales=function(){
    const st=ensureTicketingState();
    const season=state.season?.label||'';
    if(st.processed && st.season===season) return st;
    const p=projectSeasonTicketSales();
    const previousStreak=n(st.selloutStreak);
    Object.assign(st,p,{season,processed:true,selloutStreak:p.sold>=p.allocation&&p.allocation>0?previousStreak+1:0});
    if(typeof ensureClubFinanceState==='function'){
      const f=ensureClubFinanceState();
      if(!st.cashPostedSeason || st.cashPostedSeason!==season){
        recordClubCash(p.revenue,`${season} season-ticket sales`,'season_tickets');
        f.seasonTicketCashThisSeason=(f.seasonTicketCashThisSeason||0)+p.revenue;
        st.cashPostedSeason=season;
      }
    }
    if(state.matchdayStats) state.matchdayStats.seasonTicketRevenue=p.revenue;
    return st;
  };

  window.updateSupporterDemandWeekly=function(){
    const st=ensureTicketingState();
    const s=state.supporters;
    const target=byClub(state.club)?.target||10;
    const pos=typeof clubLeaguePosition==='function'?clubLeaguePosition(state.club):target;
    const h=n(state.happiness?.fans,70);
    let weekly=0;
    if(pos<=target-4) weekly+=.0024;
    else if(pos<=target-2) weekly+=.0013;
    else if(pos>=target+5) weekly-=.0015;
    if(h>=80) weekly+=.0007;
    else if(h<40) weekly-=.0010;
    const rep=n(typeof savedClubReputation==='function'?savedClubReputation():byClub(state.club)?.reputation,75);
    if(rep>=88) weekly+=.0004;
    weekly=cclamp(weekly,-.003,.0035);
    const before=s.demand;
    s.demand=Math.max(Math.round(cap()*.45),Math.round(s.demand*(1+weekly)));
    s.growthThisSeason=n(s.growthThisSeason)+(s.demand-before);

    // The waiting list is live during the season. It grows from committed demand
    // but never substitutes for the broader supporter-demand figure.
    const committed=Math.round(s.demand*cclamp(.55+n(state.seasonTicketDiscount,15)*.004,.55,.68)*fanDemandFactor());
    if(st.sold>=st.allocation){
      st.waitingList=Math.max(st.waitingList,Math.max(0,committed-st.allocation));
    }else{
      st.waitingList=Math.max(0,Math.min(st.waitingList,Math.max(0,committed-st.sold)));
    }
    if(typeof calculateCapacityPressure==='function') s.capacityPressure=calculateCapacityPressure();
  };

  window.seasonTicketShowRate=function(){
    const h=n(state.happiness?.fans,70);
    let rate=.94+(h-70)*.0007;
    const form=state.form||[];
    const pts=form.reduce((s,r)=>s+(r==='W'?3:r==='D'?1:0),0);
    if(form.length>=3){ const ppg=pts/form.length; if(ppg>=2)rate+=.018; else if(ppg<=.8)rate-=.025; }
    return cclamp(rate,.88,.995);
  };

  function matchdayPriceDemand(){
    const rec=recommendedPricing(state.club),p=state.pricing;
    const ticketRatio=p.ticket/rec.ticket;
    const concessionRatio=p.concession/rec.concession;
    const foodRatio=p.food/rec.food;
    let mult=1.03;
    mult-=Math.max(0,ticketRatio-.90)*.55;
    mult-=Math.max(0,concessionRatio-.90)*.12;
    mult-=Math.max(0,foodRatio-.95)*.07;
    return cclamp(mult,.55,1.08);
  }

  window.projectedMatchdayV21=function(){
    ensureTicketingState();
    const capacity=Math.max(0,opCap());
    const st=state.seasonTickets;
    const fanMultiplier=typeof fanAttendanceMultiplier==='function'?fanAttendanceMultiplier():1;
    const showRate=seasonTicketShowRate();
    const stAttendance=Math.min(capacity,Math.round(st.sold*showRate));
    const hospitalitySeats=Math.min(Math.round(capacity*.045),Math.max(0,capacity-stAttendance));
    const hospPrice=state.pricing.hospitality/recommendedPricing(state.club).hospitality;
    const hospitalitySold=Math.min(hospitalitySeats,Math.round(hospitalitySeats*cclamp(1.05-(hospPrice-1)*.45,.48,1)*fanMultiplier));

    const ordinaryInventory=Math.max(0,capacity-stAttendance-hospitalitySold);
    const supporterDemand=Math.max(0,n(state.supporters?.demand)-stAttendance);
    const casualDemand=Math.max(0,Math.round(supporterDemand*matchdayPriceDemand()*fanMultiplier));
    const matchdayTickets=Math.min(ordinaryInventory,casualDemand);
    const attendance=Math.min(capacity,stAttendance+hospitalitySold+matchdayTickets);

    const adult=Math.round(matchdayTickets*.76);
    const concessions=matchdayTickets-adult;
    const ticketRevenue=adult*state.pricing.ticket+concessions*state.pricing.concession;
    const hospitalityRevenue=hospitalitySold*state.pricing.hospitality;
    const foodTake=attendance*state.pricing.food*.68;
    const revenue=Math.round(ticketRevenue+hospitalityRevenue+foodTake);
    const seasonTicketRecognized=Math.round((st.revenue||0)/19);
    const accountingRevenue=revenue+seasonTicketRecognized;
    const demand=capacity?attendance/capacity:0;
    return {
      demand,pricingOnlyDemand:matchdayPriceDemand(),fanHappinessAttendanceMultiplier:fanMultiplier,
      attendance,revenue,accountingRevenue,seasonTicketRecognized,hospitalitySold,stAttendance,matchdayTickets,showRate,
      supporterDemand:n(state.supporters?.demand),capacity
    };
  };

  window.prepareTicketingForNewSeason=function(){
    const st=ensureTicketingState();
    st.previousSold=st.sold;
    st.allocation=seasonTicketAllocation();
    st.season=state.season?.label||st.season;
    st.processed=false;
    st.renewals=0;st.newSales=0;st.applications=0;st.revenue=0;st.cashPostedSeason=null;
    state.supporters.lastSeasonDemand=state.supporters.demand;
    state.supporters.growthThisSeason=0;
  };
})();
