# SupeRR Selector web showcase

This is a static, responsive showcase of the SupeRR Selector results. It presents separate top-10 batter and bowler rankings, a balanced five-plus-five must-target shortlist, and an all-player score explorer with search, eligibility filters, pagination, and CSV downloads. Player names in the ranking tables and explorer open a keyboard-accessible dashboard with role-specific eligibility checks, pressure-versus-baseline metrics and paired bar charts, and score components. The v0.2 dashboard covers the complete scored pool; the S2 detail view is limited to players present in its bundled top-25 exports. The page uses the user-provided Rajasthan Royals logo image and a jersey-inspired navy/blue/pink palette. This is an independent research showcase and is not affiliated with Rajasthan Royals.

The complete 200,999-delivery pack was verified against the raw files in `data/raw/`. The v0.2 pipeline analyzes the brief's IPL + T20I scope (837 matches, 194,014 selected deliveries), scores 824 batter and 596 bowler profiles, and marks eligibility separately. S2 results are retained as a distinct comparison model. The site uses bundled, generated CSVs; it does not rerun Python scoring in a visitor's browser and does not bundle raw ball-by-ball records.

## Preview locally

From the project root:

```bash
python3 -m http.server 8000 --directory web
```

Open <http://localhost:8000>.

Do not open `index.html` directly as a `file://` URL: browsers block the CSV `fetch()` requests in that mode.

## Deploy with Vercel

The repository includes a root-level `vercel.json` that publishes this directory as a static site.

1. Sign in to Vercel with GitHub and import `iman2004-explorer/SuperRR_Selector`.
2. Keep the project root at `.` so Vercel can read the root `vercel.json`.
3. Deploy with the Hobby plan; no build command or paid add-on is needed.

Vercel's Hobby plan is free for personal, non-commercial use. It has usage limits; exceeding a limit can pause a feature until the limit resets. Do not upgrade or enable paid usage if you want to remain on the free plan. Anyone with the deployment URL can view the page and download the bundled ranking CSVs. Publish only data and project material intended for public access.
