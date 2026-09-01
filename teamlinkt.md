# TeamLinkt Reference

Quick runbook for updating Matt's Volleyball season IDs and division IDs.

## Source Pages

Use these TeamLinkt pages because they expose the active season and division dropdown values in HTML:

- https://app.mattsvolleyball.com/mattsvolleyball/Schedule
- https://app.mattsvolleyball.com/mattsvolleyball/Teams
- https://app.mattsvolleyball.com/mattsvolleyball/Standings
- https://app.mattsvolleyball.com/mattsvolleyball/Scores

## What To Capture

From the page source, look for:

- season select: `<select id="season_id">`
- division select: `<select id="hierarchy_filter">`

Example values (Fall 2026):

- season: `60566`
- divisions:
  - `324563` Monday 3v3 Coed (exists in TeamLinkt, does NOT run in Fall 2026)
  - `324560` Tuesday 4v4 Competitive
  - `324559` Tuesday 4v4 Recreational
  - `324564` Wednesday Shuffle
  - `324561` Thursday 4v4 Competitive
  - `324562` Thursday 4v4 Recreational

Previous season (Summer Redux 2026): season `57274`, divisions `305890`-`305895`.

## Commands

Get season + divisions quickly from Schedule page:

```bash
curl -Ls "https://app.mattsvolleyball.com/mattsvolleyball/Schedule" \
  | grep -n "<option value=\"[0-9]\+\"\|season_id\|All Divisions\|Summer\|Spring"
```

Validate a division returns successfully for a season (may still have 0 teams before registration completes):

```bash
curl -Ls -X POST "https://app.mattsvolleyball.com/leagues/getTeams/10757/60566" \
  --data "group_ids[division]=324560&season_id=60566"
```

## Where To Update In This Repo

Primary file:

- src/lib/seasonConfig.ts

Update:

1. `CURRENT_SEASON` + `CURRENT_DIVISIONS` for live data pages:
  - Schedule / Teams / Standings / Scores / Playoffs / Team page
  - Both must move together. If you change the season id but leave the old
    division ids, the live pages ask the new season for divisions it does not
    have and come back empty. `npm run check:teamlinkt` catches this.
2. `NEXT_SEASON` + `UPCOMING_DIVISIONS` for promo pages:
  - Home hero / Leagues registration content
3. `UPCOMING_SEASON_START_DATETIME`: the new season's first game day. This one
   date does three jobs, so there is nothing else to time by hand:
   - the site stops leading with registration and says the season is underway
   - the live data pages switch from CURRENT to NEXT (`ACTIVE_ROLLOVER_DATE`
     is this date), so the old season stays up through its own playoffs
   - the "Season starts ..." copy reads from it
   Set `UPCOMING_SEASON_START_LABEL_OVERRIDE` only when the exact date is not
   fixed yet and you need fuzzy wording like "the week of July 27".
4. `UPCOMING_REG_OPEN_DATETIME` + `UPCOMING_REGULAR_SEASON_WEEKS`: the
   announcement copy shown before TeamLinkt publishes the registration forms.
   Live TeamLinkt data takes over on its own once the forms are public.
   Registration close dates always come from TeamLinkt, never from this file.
5. The caps that drive the "spots left" counters and the GroupMe registration
   digest:
   - `UPCOMING_MAX_TEAMS_BY_NIGHT` - a whole night shares one team cap, and the
     split between that night's divisions follows signups. Fall 2026 uses this.
   - `UPCOMING_MAX_TEAMS_BY_DIVISION` - one division has its own team cap.
   - `UPCOMING_PLAYER_CAPS_BY_DIVISION` - shuffle-style player cap.
6. `scripts/post-missing-scores.mjs`: the `CAPTAINS_TOPICS` map is keyed by
   division id, so add the new season's ids there too.

Run `npm run check:teamlinkt` after any change here. It confirms both seasons and
all division ids still resolve against TeamLinkt.

The file also exports `DIVISIONS` as an alias of `ACTIVE_DIVISIONS` to keep live stats pages on the active season.

## Preflight Check

Run this before publishing season changes:

```bash
npm run check:teamlinkt
```

This validates configured season/division IDs against TeamLinkt dropdowns and endpoint responses.

## Auto Rollover

- `src/lib/seasonConfig.ts` includes `ACTIVE_ROLLOVER_DATE`.
- After this date, active live-data pages promote `NEXT_SEASON` to active on the next build.

## Notes

- Registration cards on home/leagues pages come from TeamLinkt registration scraping in `src/lib/registration.ts`.
- League data pages (schedule, standings, scores, teams, team, playoffs, upcoming games widget) use `src/lib/seasonConfig.ts`.
