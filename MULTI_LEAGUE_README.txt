Football CEO v0.19.1 — Expanded World Architecture

SIMULATION LEVELS
Premier League: full / playable.
Championship: standard background simulation.
La Liga: standard background simulation.
Bundesliga: standard background simulation.
Serie A: standard background simulation.
Ligue 1: standard background simulation.
Saudi Pro League: market-feature only.

BACKGROUND COMPETITIONS
Championship: 24 clubs, 46 rounds, 552 matches.
La Liga: 20 clubs, 38 rounds, 380 matches.
Bundesliga: 18 clubs, 34 rounds, 306 matches.
Serie A: 20 clubs, 38 rounds, 380 matches.
Ligue 1: 18 clubs, 34 rounds, 306 matches.
Saudi Arabia deliberately has no worldCompetition entry.

PERFORMANCE MODEL
Normal Continue days only do daily work: calendar, relevant PL fitness/injuries, transfer events and any scheduled fixtures.
AI PL recruitment reviews are staggered across seven daily cohorts rather than all 19 clubs on one Monday.
Background market-value/availability maintenance is staggered across days 1-7 of each calendar month.
Foreign club squad strengths are cached and invalidated only when their squad changes.

DEVELOPMENT WINDOWS
1 Oct / 1 Jan / 1 Apr: user club processed immediately.
2-7 Oct / Jan / Apr: rest of football world divided into deterministic club cohorts.
A manager inbox Development Review is created only when at least one user player changes OVR.

SEASON PREPARATION
The June rollover is intentionally a visible staged operation. The UI displays real completed-stage percentages and status text including:
5% closing previous season
18-40% player updates by cohort
45% player market values
52% contracts/infrastructure
60% rebuilding club squads
70% background squad strengths
80% league competitions
86% season records
90% transfer market
96% budgets/expectations
100% new season ready

DATA
world-players.js is embedded locally from the supplied ea_fc26_players.csv dataset.
Source-backed fields include identity, team, league, nationality, age/birth information, positions, OVR, preferred foot, weak foot, skill moves and height.
Football CEO derives gameplay-only potential, market value, wage and contract estimates.
No runtime network data fetch is used.
