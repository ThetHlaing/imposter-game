# Imposter Game

A local runnable copy of the Wasaner Lingara browser game referenced at:

`https://wazanerlingara.one-project-one-month.com/onboarding`

The clone includes the complete public production experience: onboarding, settings, player setup, category and game-mode selection, role reveal, voting, results, custom Burmese font, illustrations, sound effects, background music, and PWA metadata.

## Run

```bash
npm start
```

Open `http://localhost:4173`.

## Test

```bash
npm test
```

The app is served by a dependency-free Node static server with SPA route fallback.

## Deploy To GitHub Pages

This repository now includes an Actions workflow at `.github/workflows/deploy-pages.yml`.

1. Push to `main` (or run the workflow manually from Actions).
2. In GitHub repo settings, set Pages source to `GitHub Actions`.
3. The workflow prepares static files into `output/pages` and deploys them.

You can also test the artifact locally:

```bash
npm run pages:prepare
npm start
```

### Custom domain

This project is configured to publish with `CNAME` set to `imposter.thethlaing.info`.

DNS setup:

1. Create a `CNAME` record for `imposter` pointing to `thethlaing.github.io`.
2. In GitHub repo settings -> Pages -> Custom domain, enter `imposter.thethlaing.info`.
3. Enable `Enforce HTTPS` after DNS is verified.

Note: this is a prebuilt production bundle that uses root-absolute app paths. For a project site URL like `https://<user>.github.io/<repo>/`, in-app routing and asset paths may need a re-build with a configured basename. It works best when published at domain root (for example, `<user>.github.io`).

## Refresh option images

Expanded word options use exact-page images hosted by Wikimedia Commons when a reliable match is available. Ambiguous and unavailable matches remain text-only.

```bash
npm run images:source
```

For a slower Wikidata and Commons search on unresolved entries:

```bash
npm run images:source:deep
```

Image source and attribution metadata is stored in `public/assets/online-image-attribution.json`.
