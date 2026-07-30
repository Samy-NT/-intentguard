# Aurel Loom Demo Assets

This folder contains the prepared Loom demo materials for Aurel.

## Files

- `aurel-product-demo.webm` - Browser-recorded product walkthrough using the live app demo.
- `aurel-simple-animated-demo.webm` - Simplified animated explainer with a dark visual style.
- `aurel-simple-white-demo.webm` - 66-second narrative demo with a discreet rhythmic background track: a Northstar Bank execution agent is prompt-injected through a counterparty document, then Aurel blocks the unsafe transfer and restores the approved hedge workflow.
- `simple-white-demo.html` - Source HTML for the narrative animated version.

The recommended version for a Loom insert is `aurel-simple-white-demo.webm`.

## Regenerating Videos

Install dependencies first with `npm install`, then run:

- `npm run record:simple-white`
- `npm run record:simple-animated`
- `npm run record:loom` after starting the app with `npm run dev`

`record:loom` targets `http://localhost:3000` by default. Set `LOOM_DEMO_URL` to record another local or deployed URL.

