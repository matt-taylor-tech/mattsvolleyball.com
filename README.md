# mattsvolleyball.com

Coed sand volleyball leagues in the Lake Norman area, NC. Built with Astro, Tailwind CSS, and deployed to Cloudflare Pages.

## Tech Stack

- **Astro** (static output)
- **Tailwind CSS** with custom sand/ocean/coral palette
- **Cloudflare Pages** for hosting, plus Pages Functions for a small live registration API
- **Cloudflare R2** for image storage
- **Formspree** for contact form
- **TeamLinkt** for schedule, teams, standings, scores, and registration
- **GroupMe** for league chat, fed by scheduled bots running on GitHub Actions

## Getting Started

```bash
npm install
npm run dev      # Start dev server
npm run build    # Build to dist/
npm run preview  # Preview production build
npm run check:teamlinkt  # Validate season/division IDs against TeamLinkt
```

TeamLinkt maintenance notes and endpoint references live in [teamlinkt.md](teamlinkt.md). It is the runbook for setting up each new season.

### Local secrets

Neither file is committed.

- `.env` holds the R2 credentials (see [Deployment](#deployment-cloudflare-pages)). The build and the champions scripts read it.
- `.groupme.local.json` holds a GroupMe user access token as `{ "access_token": "..." }`. The GroupMe scripts read the token from the `GROUPME_TOKEN` environment variable, so pass it in when running one locally:

```bash
GROUPME_TOKEN=$(node -p "require('./.groupme.local.json').access_token") \
  npm run post:schedule -- --test --dry-run
```

## Project Structure

```text
.github/workflows/           # Scheduled GroupMe bots + daily site rebuild
emails/                      # HTML registration email templates
functions/api/               # Cloudflare Pages Functions (live registration status)
public/scripts/              # Browser script that refreshes register buttons
scripts/                     # GroupMe bots, TeamLinkt preflight, R2 champion tools
│   └── lib/mv.mjs           # Shared GroupMe, date, and config helpers for the bots
src/
├── components/
│   ├── Header.astro         # Sticky nav with mobile menu & dropdown
│   ├── Footer.astro         # 3-column footer with social links
│   ├── ChampionCard.astro   # Champion team card with R2 image support
│   ├── LeagueCard.astro     # League info card with registration state CTA
│   ├── SpotsCounter.astro   # "X of Y teams · Z spots left" placeholders
│   ├── UpcomingGames.astro  # Upcoming games widget
│   ├── FindYourNight.astro  # Home page league-night cards (reuses LeagueCard)
│   ├── ExternalRedirect.astro  # Instant redirect page to an external URL (currently unused)
│   ├── FAQAccordion.astro   # Accessible accordion
│   └── GalleryGrid.astro    # Responsive image grid
├── data/
│   └── champions.fallback.json  # Committed champions snapshot for R2 outages
├── lib/
│   ├── seasonConfig.ts      # Season/division ids, dates, caps, playoff nights
│   ├── registration.ts      # TeamLinkt scrape + regStatus logic
│   ├── spotsCounter.ts      # Browser-side spots-left counters
│   ├── teamCounts.ts        # Live team counts per division
│   ├── community.ts         # GroupMe links used across the site
│   └── champions.ts         # R2 object listing + champion filename parsing
├── layouts/
│   └── Layout.astro         # Base layout with SEO meta tags
├── pages/
│   ├── index.astro          # Home
│   ├── 404.astro
│   ├── champions.astro      # Hall of Champions
│   ├── contact.astro        # Contact form + social links
│   ├── image-gallery.astro  # Photo gallery
│   ├── playlists.astro      # Curated playlists
│   ├── rainout-info.astro   # Weather/rainout policy
│   ├── terms.astro
│   ├── leagues/
│   │   ├── index.astro      # Leagues + FAQ
│   │   └── *.astro          # schedule/standings/scores/teams/team/playoffs/shuffle
│   └── rules/
│       ├── index.astro      # Rules home
│       └── skill-levels.astro
└── styles/
    └── global.css           # Tailwind config + custom classes
```

## Dynamic Registration & Season Status

The site automatically determines what to show based on live data from TeamLinkt. The logic lives in `src/lib/registration.ts` (`getRegistrationData()`), which scrapes TeamLinkt's registration page at build time.

Because the site is static, anything that depends on today's date is decided at build time. The [daily rebuild](#scheduled-jobs-github-actions) publishes those changes on their own.

### How `regStatus` works

The system resolves to one of four states:

| Status | Condition | Hero (home) | Nav button | Footer link |
| --- | --- | --- | --- | --- |
| `open` | Any registration window is currently open | "Sign Up for {SEASON}!" + Register Now | Sign Up | Register Now → |
| `coming-soon` | All registration windows are in the future | "{SEASON} Is Coming!" + opens date | View Leagues | View Leagues → |
| `in-progress` | Current date is between season start and end dates | "{SEASON} Is Underway!" | View Leagues | View Leagues → |
| `closed` | All registration windows have passed and season has ended | "Matt's Volleyball" (generic) | View Leagues | View Leagues → |

Season start/end dates are scraped from the TeamLinkt registration detail page ("Season Dates" field).

### Season transitions

- When you open registration for the **next** season on TeamLinkt (e.g., Summer while Spring is still playing), the site automatically switches to promoting the new season because it always picks the newest season.
- Registration windows and close dates come from TeamLinkt, so no manual content changes are needed for those.
- Before TeamLinkt publishes the forms there is nothing to scrape. For that window, `src/lib/seasonConfig.ts` carries the announcement: `UPCOMING_REG_OPEN_DATETIME`, `UPCOMING_SEASON_START_LABEL`, and `UPCOMING_REGULAR_SEASON_WEEKS`. Live data takes over on its own once the forms go public.
- `UPCOMING_SEASON_START_DATETIME` is the new season's first game day. On that date the home and leagues pages switch from "registration" to "the season is underway", the home page moves the schedule above the league nights, and the live data pages roll over to the new season. Because the rollover waits for the new season's first game, the old season stays up through its own playoffs and there is no playoff end date to guess.
- Playoff nights are listed by date on each season (`playoffDates`), because playoff games are sometimes entered in TeamLinkt as regular-season games and nothing in the API marks them. Games on those dates are labelled PLAYOFFS whichever way they were entered, and `PLAYOFFS_ACTIVE` follows the list, so there is no flag to remember.
- Registration forms are read through a `cid` link. TeamLinkt's bare find page lists only forms that are open right now, so before registration opens both the site and its visitors see nothing. See [teamlinkt.md](teamlinkt.md).
- Season ids, division ids, playoff dates, registration container ids, and the roster caps do need a manual update each season. [teamlinkt.md](teamlinkt.md) is the runbook, and `npm run check:teamlinkt` validates the result.

### Roster caps and the "spots left" counters

The home and leagues pages show a live "X of Y teams · Z spots left" line under each night. `src/lib/spotsCounter.ts` fills these in from TeamLinkt in the browser, so a slow or failed call never blocks the page. `src/components/SpotsCounter.astro` renders the placeholders.

Three cap shapes are supported, all in `src/lib/seasonConfig.ts`:

| Cap | Meaning | Counter |
| --- | --- | --- |
| `UPCOMING_MAX_TEAMS_BY_NIGHT` | A whole night shares one team cap, and the split between that night's divisions follows signups | One line per night, adding up both divisions |
| `UPCOMING_MAX_TEAMS_BY_DIVISION` | One division has its own team cap | One line per division |
| `UPCOMING_PLAYER_CAPS_BY_DIVISION` | Shuffle-style leagues where individuals fill one roster | One line per division, counted in players |

Fall 2026 caps Tuesday and Thursday by night (12 teams each) and Wednesday by players (30). The GroupMe registration digest (`npm run check:registration`) reads the same maps, so its report matches the site.

### Live register buttons between builds

Registration can open or close between daily builds. To keep the buttons current, `public/scripts/update-registration-cta.js` calls `/api/registration-status` after the page loads and updates any element marked with `data-cta-type`. That endpoint is a Cloudflare Pages Function (`functions/api/registration-status.ts`), cached for 5 minutes. `functions/api/registration.ts` returns the full scraped registration data as JSON.

`update-registration-cta.js` cannot import the config, so it holds the registration URL as text. [teamlinkt.md](teamlinkt.md) lists it among the files to check when registration links change.

### Where `regStatus` is used

- `src/pages/index.astro` - Hero heading, subtitle, and CTA buttons
- `src/pages/leagues/index.astro` - Hero badge, subtitle, and register button
- `src/pages/leagues/shuffle.astro` - Bottom CTA section
- `src/components/Header.astro` - Nav button (Sign Up vs View Leagues)
- `src/components/Footer.astro` - Quick links (Register Now vs View Leagues)
- `src/layouts/Layout.astro` - Fetches data once and passes to Header/Footer
- `functions/api/registration-status.ts` + `public/scripts/update-registration-cta.js` - Live button updates after page load

## GroupMe Automation

The league's GroupMe chats are fed by Node scripts in `scripts/`. Shared helpers, including each night's GroupMe conversation ids, live in `scripts/lib/mv.mjs`.

| Script | npm script | What it does |
| --- | --- | --- |
| `post-daily-schedule.mjs` | `post:schedule` | Posts a screenshot of today's schedule to that night's topic (text fallback). On Wednesday Shuffle days it creates an RSVP calendar event instead. |
| `post-missing-scores.mjs` | `post:missing` | The morning after a game night, nudges each division's captains topic about unsubmitted scores. Silent when everything is scored. |
| `post-results.mjs` | `post:results` | Weekly recap: last week's set-by-set results and current standings, one message per division. |
| `post-registration-status.mjs` | `check:registration` | While registration is open, posts a spots-left digest to the main group when counts change. `--shuffle` posts to each player-cap night's own group instead. |
| `check-shuffle-rsvp.mjs` | `check:rsvp` | On shuffle Wednesdays, reads the RSVP count and posts either a "need a few more" nudge or a "we're on" confirmation. |
| `check-weather.mjs` | `check:weather` | On league nights, checks the NWS hourly forecast for the game window and warns when rain or storms look likely. The rainout call itself stays manual. |
| `bulk-add-members.mjs` | none | Adds registered players to the GroupMe groups from a TeamLinkt registration CSV export. Dry run unless `--send` is passed. |

Common flags (not every script takes every one; each script's header comment lists its own):

- `--dry-run` prints the message instead of posting
- `--test` routes posts to the Bot Test Group instead of the real chats
- `--date=YYYY-MM-DD` overrides "today" (Eastern time)
- `--force` skips the registration-window or game-day gate

All of them need `GROUPME_TOKEN`. See [Local secrets](#local-secrets) for running one locally.

When division ids change each season, also update `CAPTAINS_TOPICS` in `scripts/post-missing-scores.mjs` (see [teamlinkt.md](teamlinkt.md)).

### Scheduled jobs (GitHub Actions)

Each workflow in `.github/workflows/` runs on a schedule and can also be started by hand from the Actions tab, with inputs for dry run, test group, and date overrides. Times are Eastern daylight time; the crons are in UTC, so they run an hour earlier in winter, and GitHub can start scheduled jobs up to about 45 minutes late.

| Workflow | When | Runs |
| --- | --- | --- |
| `daily-rebuild.yml` | Daily, 1:10 AM | Triggers a Cloudflare Pages deploy so date-driven changes publish |
| `daily-schedule.yml` | Mon-Fri, 9:15 AM | `post-missing-scores.mjs`, then `post-daily-schedule.mjs` |
| `registration-alerts.yml` | Daily, 10:15 AM | `post-registration-status.mjs` |
| `shuffle-spots.yml` | Mon + Thu, 10:15 AM | `post-registration-status.mjs --shuffle` |
| `weekly-recap.yml` | Mon, 11:15 AM | `post-results.mjs` |
| `weather-check.yml` | Mon-Thu, 2:15 PM | `check-weather.mjs` |
| `shuffle-rsvp.yml` | Wed, 2:15 PM | `check-shuffle-rsvp.mjs` |

Repository secrets:

- `GROUPME_TOKEN` - GroupMe user access token (all bots)
- `GROUPME_BOT_ID`, `GROUPME_BOT_ID_TEST` - bot ids used as a fallback for posting to a group's main chat
- `CLOUDFLARE_DEPLOY_HOOK_URL` - Cloudflare Pages deploy hook for the daily rebuild

## Champions (R2 filename-driven)

Champions are not read from markdown files. The champions page reads image object keys from R2 and parses metadata from each filename.

Expected R2 key format:

```text
mattsvolleyball/images/champions/{year}/{season}_{day}_{division}_{team-name}.jpg
```

Examples:

```text
mattsvolleyball/images/champions/2026/spring_tuesday_competitive_spike-squad.jpg
mattsvolleyball/images/champions/2026/summer-i_thursday_recreational_beach-bums.jpg
```

Where this is implemented:

- `src/lib/champions.ts` (`getChampions()`)
- `src/pages/champions.astro`

### Adding champion photos

Use the champion wizard instead of naming and uploading files by hand:

```bash
npm run champions
```

It opens a local page (`http://127.0.0.1:4390`) where you:

1. Pick the season. It offers `CURRENT_SEASON` and `NEXT_SEASON` from `src/lib/seasonConfig.ts`, with the current season first.
2. Drop in the photos.
3. Pick each champion team from that season's TeamLinkt teams, grouped by night and division. This fills in the year, season, night and division. "Edit details" lets you override them, for example for an older season.
4. Drag the square crop, then upload.

The wizard builds the file name, crops the photo to 1200×1200 JPEG, uploads it to R2, and refreshes `src/data/champions.fallback.json`. Commit that file afterwards. A checklist shows which divisions already have a photo, and you get a warning before replacing an existing file. New photos go live at the nightly rebuild. To publish right away, set `CLOUDFLARE_DEPLOY_HOOK_URL` in `.env`, which adds a "Rebuild site now" button.

After each upload, the wizard also renames the original photo to `{year}/{R2 name}`, keeping its file type. It looks for the photo by name and size in `G:/My Drive/MattsVolleyball/pictures/Champions` and its year folders. To use a different folder, set `CHAMPION_PHOTOS_DIR` in `.env`. It never overwrites an existing file, and a checkbox on the page turns renaming off.

Export iPhone HEIC photos as JPEG first. The shared R2 and image code is in `scripts/lib/champions-r2.mjs`.

### Fallback snapshot

If the R2 credentials are missing, the listing fails, or R2 returns no results at build time, the champions page reads `src/data/champions.fallback.json` instead. The wizard refreshes it after each upload. If you change R2 any other way, refresh it by hand and commit it:

```bash
npm run sync:champions
```

## Deployment (Cloudflare Pages)

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment variables:**
  - `PUBLIC_R2_BASE_URL` = `https://r2.afterhoursds.com/mattsvolleyball`
  - `R2_ACCOUNT_ID` = Cloudflare account ID for the champions bucket
  - `R2_ACCESS_KEY_ID` = R2 access key ID (read/list permissions)
  - `R2_SECRET_ACCESS_KEY` = R2 secret access key
  - `R2_BUCKET_NAME` = bucket name

If the private R2 credentials are missing, the champions page falls back to the committed snapshot (see [Fallback snapshot](#fallback-snapshot)).

The `functions/` directory is deployed with the site as Cloudflare Pages Functions.

## Images

Images are served from Cloudflare R2 and referenced via `PUBLIC_R2_BASE_URL`. That includes the logo (`logos/vbenginelite.png`, used by the header, footer, and social preview image), champion photos, and the gallery.

## Registration Emails

`emails/` holds standalone HTML email templates for registration announcements: one league-wide, one for Wednesday Shuffle, and one for Monday 3v3 Coed. They are not part of the site build. Update the season details in them before each send.

## Contact Form

The contact form uses Formspree via `src/pages/contact.astro`.
Update the form `action` URL there if you switch Formspree projects.

## External Links

- [Registration](https://app.teamlinkt.com/register/find/mattsvolleyball)
- [Schedule/Teams/Standings/Scores](https://app.teamlinkt.com)
- [Facebook](https://www.facebook.com/groups/mattsvolleyball/)
- [Instagram](https://instagram.com/mattsvolleyball/)
- [GroupMe](https://groupme.com/join_group/115950918/jG3kZJ04)

## License

The code in this repository is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE). You're welcome to read it, learn from it, and use it for noncommercial purposes. Commercial use requires permission.

The Matt's Volleyball name, logo, photos, and league content are not covered by the license and may not be reused.
