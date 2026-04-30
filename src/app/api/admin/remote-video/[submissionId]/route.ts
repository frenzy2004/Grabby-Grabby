import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: { submissionId: string } };

function remoteBaseUrl() {
  const explicitRecorder = process.env.REMOTE_PUBLIC_RECORDER_URL;
  const adminUrl = process.env.REMOTE_ADMIN_REVIEWS_URL;
  const source = explicitRecorder || adminUrl;

  if (!source) return null;

  try {
    return new URL(source).origin;
  } catch {
    return null;
  }
}

function responseHeaders(upstream: Response) {
  const headers = new Headers();
  for (const [key, value] of upstream.headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower === 'connection' ||
      lower === 'content-encoding' ||
      lower === 'transfer-encoding'
    ) {
      continue;
    }
    headers.set(key, value);
  }

  headers.set('Cache-Control', 'no-store');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return headers;
}

export async function GET(req: NextRequest, { params }: Params) {
  const baseUrl = remoteBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      { error: 'Remote admin video source is not configured' },
      { status: 404 },
    );
  }

  const target = new URL(
    `/api/public/reviews/video/${encodeURIComponent(params.submissionId)}`,
    baseUrl,
  );
  const headers = new Headers();
  const range = req.headers.get('range');
  if (range) headers.set('range', range);

  const upstream = await fetch(target, {
    headers,
    cache: 'no-store',
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders(upstream),
  });
}
