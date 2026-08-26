Football CEO v0.19.3 — Expanded World / Recruitment / Database Fix

Season flow
- PL can finish before the rest of Europe.
- Continue remains available until 1 June.
- Season Review appears on 1 June after background leagues complete.
- Off-season begins after the review.

Manager recruitment
- Rejected positional requests return as reminders.
- Reminder shortlists refresh.
- Actions: Review suggestions / Decline for now (or Decline again) / Close until next window.
- Material squad changes such as a sale or meaningful injury override suppression.

Recruitment strategy
- Target scoring now includes club strategy, age profile and value retention.
- Top-six/European-chasing clubs favour prime/upside players.
- Older short-term targets are downgraded unless club context supports them.

Development
- Potential sets the ceiling.
- Competitive minutes are the main practical growth lever.
- Performance materially affects growth.
- Training/manager environment remains a modifier.
- Zero/low-minute youngsters no longer gain automatically at each checkpoint.
- This creates the foundation for loans to matter later.

Decline
- Slower and less deterministic.
- Strong minutes/performance can protect players.
- Goalkeepers decline later.
- Serious injuries can still accelerate decline.

Performance architecture retained
- Staggered AI reviews and development.
- Scheduled world market updates.
- Cached squad strength.
- Paginated player database.
- Continue spinner.
- New-season preparation progress UI.


v0.19.3 database correction
- 3,067 embedded world players now use their real source birthdate/age instead of the former age=25 fallback.
- Reference date for starting ages: 1 August 2025.
- Age range in imported world: 16–41; 242 players are genuinely age 25.
- Correct ages now feed recruitment strategy, Saudi targeting, development, decline and dynamic market values.
- Potential remains a Football CEO estimate, not an FC/EA potential field.
- Initial values are Football CEO estimates adjusted for the corrected age/potential.
- Wages remain Football CEO estimates.
- Player ageing is now saved into world overrides at season rollover.


Squad planning / SCR visibility
- Recruitment improvement requests can now be paired with an outgoing recommendation when the position is already overstocked.
- The manager considers the existing formation requirement, credible senior depth, player wages, likely usage, age, potential, contract and versatility.
- High-upside young development players are protected from being treated as obvious wage-cut candidates.
- The CEO decides whether to follow the outgoing recommendation.
- Finance now displays projected annual SCR sanctions using the same thresholds/formula as the actual season assessment.


Recruitment investment planning
- Manager recruitment now chooses an investment strategy before ranking targets.
- Direct replacement: used when a recently sold starter can realistically be replaced close to the lost quality.
- Best attainable replacement: used when the lost quality is not realistically available to the club; the manager fills the role at the strongest attainable level while preserving money for other needs.
- Marquee/transformational signing: large usable budgets can be concentrated into one meaningful first-XI improvement rather than split across several marginal upgrades.
- Succession: ageing-player requests prioritise younger comparable replacements.
- Normal upgrade: ideal target should materially improve the current starter where the market/budget allows it.
- Club reputation, player interest, availability, transfer cost and SCR still constrain every plan. A large budget does not make elite unavailable players realistically signable.
- Manager shortlist requests remain open through negotiations; backing out or failing to agree terms returns to the shortlist.
