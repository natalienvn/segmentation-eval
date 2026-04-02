# Segmentation Eval Tool

Side-by-side prompt evaluation tool for JustAnswer ↔ Fount legal intake routing.

## What it does
- Runs two segmentation prompt variants against historical conversations via the Anthropic API
- Cross-references predictions with actual conversion data
- Shows confusion matrices, accuracy/precision/recall, and disagreement analysis
- Chat-style conversation viewer for drilling into mismatches
- CSV export of all results

## Setup
```bash
npm install
npm run dev
```

## Deploy
Connected to Vercel via GitHub. Push to `main` to deploy.
