import { NextRequest, NextResponse } from 'next/server';
import {
  createSubmission,
  toPublicSubmitResult,
} from '@/lib/server/reviewStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

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
    const durationSecondsRaw = Number(sanitizeText(form.get('durationSeconds'), 20));
    const durationSeconds = Number.isFinite(durationSecondsRaw)
      ? Math.max(0, durationSecondsRaw)
      : 0;
    const video = form.get('video');

    if (!(video instanceof File) || video.size <= 0) {
      return NextResponse.json({ error: 'A video file is required' }, { status: 400 });
    }
    if (video.size > MAX_VIDEO_BYTES) {
      return NextResponse.json({ error: 'Video file is too large' }, { status: 400 });
    }

    const result = await createSubmission({
      slug,
      consentAccepted,
      socialHandle,
      deviceKey,
      tableId,
      durationSeconds,
      video,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(toPublicSubmitResult(result.submission));
  } catch (err) {
    console.error('[matcha-moments/submit] failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Submission failed' },
      { status: 500 },
    );
  }
}
