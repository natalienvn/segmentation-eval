import { NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';

// GET — list all saved runs or fetch a specific one
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('id');

  try {
    if (runId) {
      // Fetch specific run
      const { blobs } = await list({ prefix: `runs/${runId}` });
      if (blobs.length === 0) {
        return NextResponse.json({ error: 'Run not found' }, { status: 404 });
      }
      const resp = await fetch(blobs[0].url);
      const data = await resp.json();
      return NextResponse.json(data);
    } else {
      // List all runs (just metadata)
      const { blobs } = await list({ prefix: 'runs/' });
      const runs = [];
      for (const blob of blobs) {
        try {
          const resp = await fetch(blob.url);
          const data = await resp.json();
          runs.push({
            id: data.id,
            name: data.name,
            timestamp: data.timestamp,
            sampleSize: data.sampleSize,
            prompt1Label: data.prompt1Label,
            prompt2Label: data.prompt2Label,
            s1: data.s1,
            s2: data.s2,
            total: data.total,
            disagreeCount: data.disagreeCount,
          });
        } catch (e) {}
      }
      runs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return NextResponse.json(runs);
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — save a new run
export async function POST(request) {
  try {
    const body = await request.json();
    const id = body.id || Date.now().toString();
    const blob = await put(`runs/${id}.json`, JSON.stringify(body), {
      contentType: 'application/json',
      access: 'public',
      addRandomSuffix: false,
    });
    return NextResponse.json({ id, url: blob.url });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — delete a run
export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('id');
  if (!runId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    const { blobs } = await list({ prefix: `runs/${runId}` });
    for (const blob of blobs) {
      await del(blob.url);
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
