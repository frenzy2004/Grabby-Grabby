import { NextRequest, NextResponse } from 'next/server';
import {
  getSubmission,
  toPublicSubmitResult,
} from '@/lib/server/reviewStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: { submissionId: string } };

const sanitizeText = (value: string | null, max = 200) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
};

/**
 * GET /api/public/reviews/submission/[submissionId]?slug=…
 *
 * Mirrors reference/src/app/api/public/reviews/submission/[submissionId]/route.ts
 * Response shape: { submission: PublicSubmitResult }
 */
export async function GET(req: NextRequest, { params }: Params) {
  const slug = sanitizeText(req.nextUrl.searchParams.get('slug'), 120);
  if (!slug) {
    return NextResponse.json({ error: 'Missing campaign slug' }, { status: 400 });
  }

  const result = await getSubmission(params.submissionId, slug);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ submission: toPublicSubmitResult(result.submission) });
}
