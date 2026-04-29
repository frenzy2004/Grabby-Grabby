import { notFound } from 'next/navigation';
import { LandingClient } from './LandingClient';
import { getCampaign } from '@/lib/humeoApi';

type PageProps = {
  params: { slug: string };
  searchParams: { t?: string };
};

export default async function CafeLandingPage({ params, searchParams }: PageProps) {
  let campaign;
  try {
    campaign = await getCampaign(params.slug);
  } catch {
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
