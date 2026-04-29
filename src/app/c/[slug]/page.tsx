import { notFound } from 'next/navigation';
import { LandingClient } from './LandingClient';
import { getCampaignBySlug } from '@/lib/server/reviewStore';

type PageProps = {
  params: { slug: string };
  searchParams: { t?: string };
};

export default function CafeLandingPage({ params, searchParams }: PageProps) {
  const campaign = getCampaignBySlug(params.slug);
  if (!campaign) {
    notFound();
  }

  return (
    <LandingClient
      slug={params.slug}
      tableId={searchParams.t ?? null}
      campaign={campaign}
    />
  );
}
