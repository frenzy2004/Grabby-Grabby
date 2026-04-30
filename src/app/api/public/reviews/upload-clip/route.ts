import { NextRequest, NextResponse } from 'next/server';
import { saveSessionClip } from '@/lib/server/clipSessionStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const sanitizeText = (value: FormDataEntryValue | null, max = 200) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
};

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const sessionId = sanitizeText(form.get('sessionId'), 100);
    const step = Number(sanitizeText(form.get('step'), 10));
    const mediaType = sanitizeText(form.get('mediaType'), 12);
    const ext = sanitizeText(form.get('ext'), 12);
    const file = form.get('clip');

    if (mediaType !== 'video' && mediaType !== 'audio') {
      return NextResponse.json({ error: 'Invalid clip type' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Clip file is required' }, { status: 400 });
    }

    const clip = await saveSessionClip({
      sessionId,
      step,
      mediaType,
      ext,
      file,
    });

    return NextResponse.json({ clip });
  } catch (err) {
    console.error('[matcha-moments/upload-clip] failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Clip upload failed' },
      { status: 500 },
    );
  }
}
