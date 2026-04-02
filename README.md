# Segmentation Eval Tool

Side-by-side prompt evaluation tool for comparing legal intake classification prompts. Built for evaluating JustAnswer ↔ Fount routing accuracy.

## What it does
- Runs two segmentation prompt variants against historical conversations via the Anthropic API
- Cross-references AI predictions with actual user conversion data
- Shows confusion matrices, accuracy/precision/recall side by side
- Highlights where the two prompts disagree — the most valuable conversations for prompt iteration
- Chat-style conversation viewer for drilling into specific mismatches
- CSV export of all results

## Setup

```bash
npm install
cp .env.example .env.local
# Add your Anthropic API key to .env.local
npm run dev
```

## Deploy to Vercel

1. Push to GitHub
2. Import in Vercel
3. Add `ANTHROPIC_API_KEY` as an environment variable in Vercel project settings
4. Deploy

## How to use

1. **Paste your two prompt variants** in the side-by-side editors
2. **Upload two CSVs**: one with conversations, one with ground truth conversion data
3. **Map the columns**: which column has the conversation text, which has the outcome, and how to join the files
4. **Run** — the tool processes each conversation through both prompts and compares results
5. **Analyze** — filter by disagreements, missed leads, or wasted routing to find patterns

## Architecture

- **Next.js App Router** with a server-side API route (`/api/classify`) that proxies Anthropic calls
- API key stays server-side — never exposed to the browser
- All CSV parsing and data joining happens client-side
