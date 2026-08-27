/* FOOTBALL CEO — SAVE / STATE MODULE v0.24
   Central migration hook for the stadium, ticketing and club-finance systems.
   The legacy state.budget field deliberately remains the football/transfer budget
   so the existing recruitment engine does not need to be rewritten. */
(function(){
  const FEATURE_VERSION=24;

  function ensureFootballCEOFeatureState(){
    if(!window.state && typeof state==='undefined') return;
    const s=typeof state!=='undefined'?state:window.state;
    if(!s) return;
    s.schemaVersion=Math.max(Number(s.schemaVersion||0),FEATURE_VERSION);
    if(typeof ensureClubFinanceState==='function') ensureClubFinanceState();
    if(typeof ensureDynamicStadiumState==='function') ensureDynamicStadiumState();
    if(typeof ensureTicketingState==='function') ensureTicketingState();
  }

  window.ensureFootballCEOFeatureState=ensureFootballCEOFeatureState;
  window.FOOTBALL_CEO_SCHEMA_VERSION=FEATURE_VERSION;
})();
