FOOTBALL CEO v0.19 MULTI-LEAGUE FOUNDATION PATCH
================================================

WHAT IS BUILT
- League registry: Premier League (full), Championship (standard), La Liga (lite), Bundesliga (lite).
- 2026/27 club registry for Championship (24), La Liga (20), Bundesliga (18).
- All new clubs use a future-playable shared schema: leagueId, reputation, standard, budgets, simulationLevel, playable.
- byClub() now resolves active PL clubs and registered world clubs.
- Existing transfer-only blocker no longer treats registered Championship/La Liga/Bundesliga clubs as buyer-only actors.
- Championship has an independent 46-match round-robin/table simulation foundation and promotion-place helper.
- FC26 importer included at tools/fc26_importer.py. It maps common EA/SoFIFA CSV schemas to Football CEO player objects.
- world-players.js is the generated payload slot, kept separate from game.js.

IMPORTANT SOURCE-PACKAGE ISSUE
The ZIP supplied for v0.18.1 references database.js, state.js, stakeholders.js, staff.js, commercial.js,
simulation.js and ui.js in index.html, but those files are absent from the ZIP. This means the supplied ZIP is not itself a complete runnable build.
For that reason this package DOES NOT fabricate/replace those missing canonical modules.

FC26 PLAYER DATA
A public FC26 dataset was identified with 18k+ players and the required OVR/potential/contract fields.
The importer is ready, but world-players.js is deliberately left empty in this patch because the canonical database.js was absent;
blindly generating against an unknown PL database would risk ID/club-name collisions.
Once the main build chat supplies/merges the actual database.js, run:
  python tools/fc26_importer.py <FC26 players.csv> world-players.js
Then verify club-name aliases and player counts before release.

PROMOTION / RELEGATION NEXT STEP
- End-of-season PL bottom 3 -> Championship.
- Championship top 2 + play-off winner -> PL.
- Swap leagueId/simulationLevel/playable flags; do not recreate clubs or players.
- Championship play-off format is currently exposed as places 3-8 to match the 2026/27 six-team format; bracket logic is the next implementation step.
- League One can remain unsimulated until added.

CHECKS FOR MAIN BUILD CHAT
1. Restore the missing modular JS files from the canonical v0.18.1 source.
2. Run syntax/load-order tests.
3. Generate world-players.js from the chosen FC26 source.
4. Confirm player-club aliases for all 62 new clubs.
5. Confirm manager target pool sees new players.
6. Confirm external player approach no longer shows 'external recruitment unavailable'.
7. Simulate 10 seasons and inspect player development, AI buying and save size.
8. Wire Championship simulation to the canonical daily/weekly simulation hook rather than the compatibility hook if simulation.js owns it.


v0.19 INTEGRATION NOTE
- League memberships are now aligned to the 2025/26 game world.
- A licensed FC26 CSV can be converted directly with tools/fc26_importer.py.
- Recommended source schema: SoFIFA/Kaggle-style FC26 export with club_name, overall, potential, age, positions, value and wage fields.
- The full third-party source dataset is not embedded in this patch; world-players.js remains the generated payload target.



FINAL v0.19 PLAYER-DATA BEHAVIOUR — EMBEDDED BUILD
- The uploaded ea_fc26_players.csv was filtered during development.
- 1,665 FC26 player records from the 2025/26 Championship, La Liga and Bundesliga are embedded directly in world-players.js.
- Football CEO makes NO runtime request to Hugging Face, Kaggle, GitHub or any other player-data source.
- The service worker caches world-players.js as part of the app shell, so the expanded database is part of the game itself.
- Source-backed fields: identity, club, nationality, age/birthdate basis, positions, foot, weak foot, skill moves, height and FC26 OVR.
- Football CEO-derived fields: potential, value, wage and contract expiry.
