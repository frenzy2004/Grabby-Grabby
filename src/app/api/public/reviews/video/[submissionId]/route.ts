import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import {
  fetchSupabaseVideoObject,
  getSubmissionVideo,
} from '@/lib/server/reviewStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: { submissionId: string } };

function parseRange(rangeHeader: string | null, size: number) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return null;

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return { invalid: true as const };
  }

  return {
    invalid: false as const,
    start,
    end: Math.min(end, size - 1),
  };
}

export async function GET(req: NextRequest, { params }: Params) {
  const video = await getSubmissionVideo(params.submissionId);
  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const range = parseRange(req.headers.get('range'), video.size);

  if (range?.invalid) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${video.size}`,
      },
    });
  }

  if (video.kind === 'supabase') {
    const upstreamRange =
      range && !range.invalid ? `bytes=${range.start}-${range.end}` : null;
    const upstream = await fetchSupabaseVideoObject(video, upstreamRange);

    if (!upstream) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Type': upstream.headers.get('content-type') ?? video.contentType,
    });
    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');

    if (contentLength) headers.set('Content-Length', contentLength);
    if (contentRange) headers.set('Content-Range', contentRange);

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  }

  if (range && !range.invalid) {
    const stream = Readable.toWeb(
      createReadStream(video.filePath, { start: range.start, end: range.end }),
    ) as ReadableStream;
    const chunkSize = range.end - range.start + 1;

    return new NextResponse(stream, {
      status: 206,
      headers: {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${range.start}-${range.end}/${video.size}`,
        'Content-Type': video.contentType,
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(video.filePath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Length': String(video.size),
      'Content-Type': video.contentType,
    },
  });
}
