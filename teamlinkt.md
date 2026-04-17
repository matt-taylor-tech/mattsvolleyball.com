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

Example values (Summer I 2026):

- season: `52672`
- divisions:
  - `293497` Monday 3v3 Coed
  - `280407` Tuesday 4v4 Competitive
  - `280406` Tuesday 4v4 Recreational
  - `280410` Wednesday 4v4 Shuffle
  - `280408` Thursday 4v4 Competitive
  - `280409` Thursday 4v4 Recreational

## Commands

Get season + divisions quickly from Schedule page:

```bash
curl -Ls "https://app.mattsvolleyball.com/mattsvolleyball/Schedule" \
  | grep -n "<option value=\"[0-9]\+\"\|season_id\|All Divisions\|Summer\|Spring"
```

Validate a division returns successfully for a season (may still have 0 teams before registration completes):

```bash
curl -Ls -X POST "https://app.mattsvolleyball.com/leagues/getTeams/10757/52672" \
  --data "group_ids[division]=293497&season_id=52672"
```

## Where To Update In This Repo

Primary file:

- src/lib/seasonConfig.ts

Update:

1. `ACTIVE_SEASON_ID` + `ACTIVE_DIVISIONS` for live data pages:
  - Schedule / Teams / Standings / Scores / Playoffs / Team page
2. `UPCOMING_SEASON_ID` + `UPCOMING_DIVISIONS` for promo pages:
  - Home hero / Leagues registration content

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
