import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBySlug } from '@/lib/server/reviewStore';

export const dynamic = 'force-dynamic';

type Params = { params: { slug: string } };

/**
 * GET /api/public/reviews/campaign/[slug]
 *
 * Mirrors reference/src/app/api/public/reviews/campaign/[slug]/route.ts
 * Response shape: { campaign: PublicReviewCampaign }
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const campaign = getCampaignBySlug(params.slug);
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }
  return NextResponse.json({ campaign });
}
