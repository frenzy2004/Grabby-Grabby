import { NextResponse } from 'next/server';
import { listAdminReviewSubmissions } from '@/lib/server/reviewStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const submissions = await listAdminReviewSubmissions();
  return NextResponse.json({ submissions });
}
