import { NextRequest, NextResponse } from 'next/server';
import { createSubmission, toPublicSubmitResult } from '@/lib/server/reviewStore';
import { renderClipsOnServer } from '@/lib/server/serverClipRenderer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_CLIP_BYTES = 120 * 1024 * 1024;
const MAX_TOTAL_BYTES = 280 * 1024 * 1024;

const sanitizeText = (value: FormDataEntryValue | null, max = 200) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
};

function collectFiles(form: FormData, prefix: string) {
  const files: Array<{ file: File; ext: string }> = [];
  const count = Number(sanitizeText(form.get(`${prefix}Count`), 10));
  const total = Number.isFinite(count) ? Math.max(0, Math.min(20, count)) : 0;

  for (let i = 0; i < total; i++) {
    const file = form.get(`${prefix}${i}`);
    if (!(file instanceof File) || file.size <= 0) continue;
    if (file.size > MAX_CLIP_BYTES) {
      throw new Error('One of the clips is too large. Please record shorter shots.');
    }
    files.push({
      file,
      ext: sanitizeText(form.get(`${prefix}${i}Ext`), 12) || 'webm',
    });
  }

  return files;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const slug = sanitizeText(form.get('slug'), 120);
    const consentAccepted = sanitizeText(form.get('consentAccepted'), 10) === 'true';
    const socialHandle = sanitizeText(form.get('socialHandle'), 120) || null;
    const deviceKey = sanitizeText(form.get('deviceKey'), 200) || null;
    const tableId = sanitizeText(form.get('tableId'), 80) || null;

    const videoClips = collectFiles(form, 'videoClip');
    const audioClips = collectFiles(form, 'audioClip');
    const totalBytes = [...videoClips, ...audioClips].reduce(
      (total, clip) => total + clip.file.size,
      0,
    );

    if (!consentAccepted) {
      return NextResponse.json({ error: 'Consent is required' }, { status: 400 });
    }
    if (videoClips.length === 0) {
      return NextResponse.json({ error: 'At least one video clip is required' }, { status: 400 });
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: 'The clips are too large. Please record shorter shots.' },
        { status: 400 },
      );
    }

    const rendered = await renderClipsOnServer({ videoClips, audioClips });
    const videoBytes = new Uint8Array(rendered.bytes.byteLength);
    videoBytes.set(rendered.bytes);
    const video = new File([videoBytes], rendered.filename, { type: 'video/webm' });
    const result = await createSubmission({
      slug,
      consentAccepted,
      socialHandle,
      deviceKey,
      tableId,
      durationSeconds: rendered.durationSeconds,
      video,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(toPublicSubmitResult(result.submission));
  } catch (err) {
    console.error('[matcha-moments/submit-clips] failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Clip submission failed' },
      { status: 500 },
    );
  }
}
