# Football CEO v0.24.7

Football CEO is a mobile-first football club CEO simulation: you appoint senior staff, control finances and recruitment resources, respond to your manager, develop the club and manage relationships while the manager runs the football team.

## v0.24.7 — League-Linked Youth Ecosystem

This build turns youth generation into part of the football pyramid rather than producing every future player from one generic world pool.

### Club + league-linked intakes

World prospects are now attached to a youth-origin club when they are created. Their **starting OVR** is influenced strongly by:

- club academy quality
- the league's current football standard
- age
- potential

Their **potential** is deliberately less dependent on league strength. Academy quality and national talent depth matter more, with only a small league modifier. This means a League One/League Two academy can still rarely produce a future elite player, but most of its 16–19-year-olds will enter senior football at a much lower current level than an elite-academy prospect.

The user's intake uses the club's actual Academy facility rating. AI clubs use a stable academy estimate based on club reputation plus club-specific variance, so academy strength is not simply a duplicate of league position.

### Dynamic league quality

Each simulated league has a youth-environment rating based on the quality of senior squads and the league's club standards. It moves only 20% toward the newly observed value each year, so one unusual season does not instantly transform academy output.

In the current database the measured starting environments are approximately:

- Premier League: 79.1
- La Liga: 77.6
- Serie A: 76.9
- Bundesliga: 76.7
- Ligue 1: 75.0
- Championship: 70.8

Future leagues automatically use the same model once they are added to the world data.

### A real pyramid rather than rating inflation

A synthetic 10-year pathway test using the production generator produced this prime-age cohort from 1,200 players:

- average OVR: 74.31
- 75+: 48.0%
- 80+: 20.1%
- 85+: 5.0%
- 90+: 0.25%

A larger 10,000-player stress run produced 74.56 average OVR, 20.0% at 80+, 5.4% at 85+ and 0.37% at 90+.

For comparison, the current loaded Premier League + Championship + La Liga + Bundesliga + Serie A + Ligue 1 database at ages 26–29 is 74.97 average OVR, 17.25% at 80+, 4.31% at 85+ and 0.35% at 90+.

The generated world therefore sustains the elite tier without making every prospect a top-flight player. Championship-origin players remain materially weaker on average, and future lower divisions will add a larger 50s/60s/low-70s professional population naturally.

### Forward player pipeline

Youth intake volume now anticipates future squad needs rather than waiting until stars retire and then creating teenagers too late.

The target scales with:

- number of simulated clubs
- active player-world size
- retirement pressure when unusually high

With the current world, the target is 151 global prospects per year plus the user's 2–4 academy players. In testing, adding 48 synthetic League One/League Two clubs immediately increased the pipeline to 168, before adding their full player databases.

### Pathway integration

All v0.24.6 loan mechanics remain active. Starting OVR determines which level is initially appropriate, while loans/minutes/development determine how much potential is actually realised.

Generated players now also retain `youthOriginClub`, `youthLeagueQuality` and `youthAcademyQuality`, ready for the planned Club/CEO History and player-career-history features.

## Testing

From the project root:

```bash
node tests/youth-ecosystem-regression.js
node tests/loan-world-10yr-sanity.js
node tests/loans-pathways-regression.js
node tests/loan-development-cohort.js
node tests/ageing-longevity-regression.js
node tests/squad-planning-regression.js
node tests/v0245-continuity-regression.js
node tests/villa-ageing-projection.js
```

See `TEST_REPORT.txt` for packaged results.
