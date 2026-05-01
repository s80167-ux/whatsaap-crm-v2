# Live Visual Pass

This project now includes a Playwright-based visual pass for the frontend.

## What it does

- Opens the site in a real Chromium browser
- Captures desktop and mobile screenshots
- Fails if the page throws browser console errors or page runtime errors
- Can review only the login screen or a signed-in dashboard flow

Artifacts are written to `visual-pass-artifacts/`.

## One-time setup

```bash
npm install
npm run visual:install
```

## Fastest way to run

1. Start the backend stack you need.
2. Start the frontend:

```bash
npm run dev:frontend
```

3. In a second terminal, run:

```bash
npm run visual:pass
```

Without credentials, the visual pass will review the login page only.

## Signed-in visual pass

Set these environment variables before running:

- `VISUAL_PASS_EMAIL`
- `VISUAL_PASS_PASSWORD`

Optional variables:

- `VISUAL_PASS_BASE_URL` default: `http://127.0.0.1:5173`
- `VISUAL_PASS_ROUTES` comma-separated routes such as `/dashboard,/inbox,/sales`
- `VISUAL_PASS_START_SERVER=1` to let Playwright start the frontend dev server itself

PowerShell example:

```powershell
$env:VISUAL_PASS_EMAIL="owner@example.com"
$env:VISUAL_PASS_PASSWORD="StrongPass123"
$env:VISUAL_PASS_START_SERVER="1"
npm run visual:pass
```

If your frontend is already running, you can skip `VISUAL_PASS_START_SERVER`.

## Headed mode

To watch the browser while it runs:

```bash
npm run visual:pass:headed
```

## Output

- Screenshots: `visual-pass-artifacts/*.png`
- Summary: `visual-pass-artifacts/summary.json`
- Playwright HTML report: `playwright-report/index.html`
