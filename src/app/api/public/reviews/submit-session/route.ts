import { NextRequest, NextResponse } from 'next/server';
import { cleanupSessionClips, listSessionClips } from '@/lib/server/clipSessionStore';
import { createSubmission, toPublicSubmitResult } from '@/lib/server/reviewStore';
import { renderClipsOnServer } from '@/lib/server/serverClipRenderer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const sanitizeText = (value: FormDataEntryValue | null, max = 200) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
};

function collectExpectedClips(form: FormData) {
  const count = Number(sanitizeText(form.get('clipCount'), 10));
  const total = Number.isFinite(count) ? Math.max(0, Math.min(20, count)) : 0;
  const expected = new Map<string, number>();

  for (let i = 0; i < total; i++) {
    const step = Number(sanitizeText(form.get(`clipStep${i}`), 10));
    const takeId = Number(sanitizeText(form.get(`clipTakeId${i}`), 20));
    const mediaType = sanitizeText(form.get(`clipMediaType${i}`), 12);
    if (!Number.isInteger(step) || step < 1 || step > 20) continue;
    if (!Number.isSafeInteger(takeId) || takeId < 0) continue;
    if (mediaType !== 'video' && mediaType !== 'audio') continue;
    expected.set(`${step}:${mediaType}`, takeId);
  }

  return expected;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const slug = sanitizeText(form.get('slug'), 120);
    const consentAccepted = sanitizeText(form.get('consentAccepted'), 10) === 'true';
    const socialHandle = sanitizeText(form.get('socialHandle'), 120) || null;
    const deviceKey = sanitizeText(form.get('deviceKey'), 200) || null;
    const tableId = sanitizeText(form.get('tableId'), 80) || null;
    const sessionId = sanitizeText(form.get('sessionId'), 100);
    const expectedClips = collectExpectedClips(form);

    if (!consentAccepted) {
      return NextResponse.json({ error: 'Consent is required' }, { status: 400 });
    }

    const clips = (await listSessionClips(sessionId)).filter((clip) => {
      if (expectedClips.size === 0) return true;
      return expectedClips.get(`${clip.step}:${clip.mediaType}`) === clip.takeId;
    });
    const videoClips = clips
      .filter((clip) => clip.mediaType === 'video')
      .map((clip) => ({ filePath: clip.filePath, ext: clip.ext }));
    const audioClips = clips
      .filter((clip) => clip.mediaType === 'audio')
      .map((clip) => ({ filePath: clip.filePath, ext: clip.ext }));

    if (videoClips.length === 0) {
      return NextResponse.json({ error: 'No video clips were uploaded' }, { status: 400 });
    }

    const rendered = await renderClipsOnServer({ videoClips, audioClips });
    const videoBytes = new Uint8Array(rendered.bytes.byteLength);
    videoBytes.set(rendered.bytes);
    const video = new File([videoBytes], rendered.filename, { type: 'video/mp4' });

    const result = await createSubmission({
      slug,
      consentAccepted,
      socialHandle,
      deviceKey,
      tableId,
      durationSeconds: rendered.durationSeconds,
      video,
    });

    await cleanupSessionClips(sessionId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(toPublicSubmitResult(result.submission));
  } catch (err) {
    console.error('[matcha-moments/submit-session] failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Session submission failed' },
      { status: 500 },
    );
  }
}
