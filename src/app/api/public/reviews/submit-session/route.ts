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

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const slug = sanitizeText(form.get('slug'), 120);
    const consentAccepted = sanitizeText(form.get('consentAccepted'), 10) === 'true';
    const socialHandle = sanitizeText(form.get('socialHandle'), 120) || null;
    const deviceKey = sanitizeText(form.get('deviceKey'), 200) || null;
    const tableId = sanitizeText(form.get('tableId'), 80) || null;
    const sessionId = sanitizeText(form.get('sessionId'), 100);

    if (!consentAccepted) {
      return NextResponse.json({ error: 'Consent is required' }, { status: 400 });
    }

    const clips = await listSessionClips(sessionId);
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
