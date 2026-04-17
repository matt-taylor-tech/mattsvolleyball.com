# mattsvolleyball.com

Coed sand volleyball leagues in the Lake Norman area, NC. Built with Astro, Tailwind CSS, and deployed to Cloudflare Pages.

## Tech Stack

- **Astro** (static output)
- **Tailwind CSS** with custom sand/ocean/coral palette
- **Cloudflare Pages** for hosting
- **Cloudflare R2** for image storage
- **Formspree** for contact form
- **TeamLinkt** for schedule, teams, standings, scores, and registration

## Getting Started

```bash
npm install
npm run dev      # Start dev server
npm run build    # Build to dist/
npm run preview  # Preview production build
npm run check:teamlinkt  # Validate season/division IDs against TeamLinkt
```

TeamLinkt maintenance notes and endpoint references live in [teamlinkt.md](teamlinkt.md).

## Project Structure

```text
src/
├── components/
│   ├── Header.astro         # Sticky nav with mobile menu & dropdown
│   ├── Footer.astro         # 3-column footer with social links
│   ├── ChampionCard.astro   # Champion team card with R2 image support
│   ├── LeagueCard.astro     # League info card with registration state CTA
│   ├── FAQAccordion.astro   # Accessible accordion
│   └── GalleryGrid.astro    # Responsive image grid
├── content/
│   ├── config.ts            # Content collection schemas
│   └── seasons/             # Season info markdown files
├── lib/
│   ├── registration.ts      # TeamLinkt scrape + regStatus logic
│   └── champions.ts         # R2 object listing + champion filename parsing
├── layouts/
│   └── Layout.astro         # Base layout with SEO meta tags
├── pages/
│   ├── index.astro          # Home
│   ├── champions.astro      # Hall of Champions
│   ├── contact.astro        # Contact form + social links
│   ├── image-gallery.astro  # Photo gallery
│   ├── playlists.astro      # Curated playlists
│   ├── rainout-info.astro   # Weather/rainout policy
│   ├── leagues/
│   │   ├── index.astro      # Leagues + FAQ
│   │   └── *.astro          # schedule/standings/scores/shuffle/etc.
│   └── rules/
│       ├── index.astro      # Rules home
│       └── skill-levels.astro
└── styles/
    └── global.css           # Tailwind config + custom classes
```

## Dynamic Registration & Season Status

The site automatically determines what to show based on live data from TeamLinkt. The logic lives in `src/lib/registration.ts` (`getRegistrationData()`), which scrapes TeamLinkt's registration page at build time.

### How `regStatus` works

The system resolves to one of four states:

| Status | Condition | Hero (home) | Nav button | Footer link |
| --- | --- | --- | --- | --- |
| `open` | Any registration window is currently open | "Sign Up for SPRING 2026!" + Register Now | Sign Up | Register Now → |
| `coming-soon` | All registration windows are in the future | "SPRING 2026 Is Coming!" + opens date | View Leagues | View Leagues → |
| `in-progress` | Current date is between season start and end dates | "SPRING 2026 Is Underway!" | View Leagues | View Leagues → |
| `closed` | All registration windows have passed and season has ended | "Matt's Volleyball" (generic) | View Leagues | View Leagues → |

Season start/end dates are scraped from the TeamLinkt registration detail page ("Season Dates" field).

### Season transitions

- When you open registration for the **next** season on TeamLinkt (e.g., Summer while Spring is still playing), the site automatically switches to promoting the new season because it always picks the newest season.
- No manual content changes are needed — just manage registration windows in TeamLinkt and the site updates on the next build.

### Where `regStatus` is used

- `src/pages/index.astro` — Hero heading, subtitle, and CTA buttons
- `src/pages/leagues/index.astro` — Hero badge, subtitle, and register button
- `src/pages/leagues/shuffle.astro` — Bottom CTA section
- `src/components/Header.astro` — Nav button (Sign Up vs View Leagues)
- `src/components/Footer.astro` — Quick links (Register Now vs View Leagues)
- `src/layouts/Layout.astro` — Fetches data once and passes to Header/Footer

## Content Collections

Legacy Astro content collections for seasons were removed because they were unused.
Season labels, dates, and registration status are read directly from TeamLinkt via `src/lib/registration.ts`.

### Champions (R2 filename-driven)

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

If you're bulk uploading and normalizing names, use:

```bash
node scripts/upload-champions.mjs
```

Dry run:

```bash
node scripts/upload-champions.mjs --dry-run
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

If the private R2 credentials are missing, the champions page safely renders without entries.

## Images

Images are served from Cloudflare R2. Place your logo at `public/images/vbenginelite.png`. All other images (champion photos, gallery) should be uploaded to R2 and referenced via the `PUBLIC_R2_BASE_URL`.

## Contact Form

The contact form uses Formspree via `src/pages/contact.astro`.
Update the form `action` URL there if you switch Formspree projects.

## External Links

- [Registration](https://app.teamlinkt.com/register/find/mattsvolleyball)
- [Schedule/Teams/Standings/Scores](https://app.teamlinkt.com)
- [Facebook](https://www.facebook.com/groups/mattsvolleyball/)
- [Instagram](https://instagram.com/mattsvolleyball/)
- [WhatsApp](https://chat.whatsapp.com/BQmVIkBv1bc7AN7KZlzxjU)
