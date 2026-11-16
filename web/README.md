# SupeRR Selector web showcase

This is a static, responsive showcase of the SupeRR Selector results. It presents separate top-10 batter and bowler rankings, a balanced five-plus-five must-target shortlist, and an all-player score explorer with search, eligibility filters, pagination, and CSV downloads. The page uses the user-provided Rajasthan Royals logo image and a jersey-inspired navy/blue/pink palette. This is an independent research showcase and is not affiliated with Rajasthan Royals.

The complete 200,999-delivery pack was verified against the raw files in `data/raw/`. The v0.2 pipeline analyzes the brief's IPL + T20I scope (837 matches, 194,014 selected deliveries), scores 824 batter and 596 bowler profiles, and marks eligibility separately. S2 results are retained as a distinct comparison model. The site uses bundled, generated CSVs; it does not rerun Python scoring in a visitor's browser and does not bundle raw ball-by-ball records.

## Preview locally

From the project root:

```bash
python3 -m http.server 8000 --directory web
```

Open <http://localhost:8000>.

Do not open `index.html` directly as a `file://` URL: browsers block the CSV `fetch()` requests in that mode.

## Publish as a public URL with GitHub Pages

1. Push this project to a GitHub repository, including `web/` and `.github/workflows/publish-showcase.yml`.
2. In the repository, open **Settings → Pages** and set the source to **GitHub Actions**.
3. Push to `main` or `master`, or manually run **Publish SupeRR Selector showcase** under the **Actions** tab.
4. When the deployment completes, open **Settings → Pages** or the workflow run to copy the public URL for your presentation.

The site is static and needs no server-side secrets. Anyone with the URL can view the page and download the bundled ranking CSVs. Publish only data and project material intended for public access.
