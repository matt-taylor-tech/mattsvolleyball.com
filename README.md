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
```

## Project Structure

```text
src/
├── components/
│   ├── Header.astro         # Sticky nav with mobile menu & dropdown
│   ├── Footer.astro         # 3-column footer with social links
│   ├── ChampionCard.astro   # Champion team card with R2 image support
│   ├── LeagueCard.astro     # League info card with day-colored header
│   ├── FAQAccordion.astro   # Accessible accordion
│   └── GalleryGrid.astro    # Responsive image grid
├── content/
│   ├── config.ts            # Content collection schemas
│   ├── champions/           # Champion team markdown files
│   └── seasons/             # Season info markdown files
├── layouts/
│   └── Layout.astro         # Base layout with SEO meta tags
├── pages/
│   ├── index.astro          # Home
│   ├── leagues.astro        # Leagues + FAQ
│   ├── rules.astro          # Full rules
│   ├── contact.astro        # Contact form + social links
│   └── image-gallery.astro  # Photo gallery
└── styles/
    └── global.css           # Tailwind config + custom classes
```

## Content Collections

### Adding a Champion

Create a markdown file in `src/content/champions/`:

```markdown
---
teamName: "Team Name"
season: "Spring"
year: 2026
league: "4v4"
division: "Competitive"
day: "Tuesday"
photo: "/champions/team-photo.jpg"
players:
  - "Player One"
  - "Player Two"
---

Optional description of the team's season.
```

The `photo` path is relative to the R2 base URL.

### Adding a Season

Create a markdown file in `src/content/seasons/`:

```markdown
---
name: "Summer 2026"
year: 2026
startDate: "2026-06-01"
endDate: "2026-07-24"
status: "upcoming"
registrationOpen: true
registrationUrl: "https://app.teamlinkt.com/register/find/mattsvolleyball"
leagues:
  - day: "Tuesday"
    format: "4v4"
    maxTeams: 14
    fee: "$50/team"
---

Season description here.
```

## Deployment (Cloudflare Pages)

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment variables:**
  - `PUBLIC_R2_BASE_URL` = `https://r2.afterhoursds.com/mattsvolleyball`

## Images

Images are served from Cloudflare R2. Place your logo at `public/images/vbenginelite.png`. All other images (champion photos, gallery) should be uploaded to R2 and referenced via the `PUBLIC_R2_BASE_URL`.

## Contact Form

The contact form uses Formspree. Replace `YOUR_ID` in `src/pages/contact.astro` with your Formspree form ID.

## External Links

- [Registration](https://app.teamlinkt.com/register/find/mattsvolleyball)
- [Schedule/Teams/Standings/Scores](https://app.teamlinkt.com)
- [Facebook](https://www.facebook.com/groups/mattsvolleyball/)
- [Instagram](https://instagram.com/mattsvolleyball/)
- [WhatsApp](https://chat.whatsapp.com/BQmVIkBv1bc7AN7KZlzxjU)
