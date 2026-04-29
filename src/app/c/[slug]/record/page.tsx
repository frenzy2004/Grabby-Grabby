import { notFound } from 'next/navigation';
import { GuidedRecordingClient } from './GuidedRecordingClient';
import { getCampaignBySlug } from '@/lib/server/reviewStore';

type PageProps = {
  params: { slug: string };
  searchParams: { t?: string };
};

export default function RecordPage({ params, searchParams }: PageProps) {
  const campaign = getCampaignBySlug(params.slug);
  if (!campaign) {
    notFound();
  }

  return (
    <GuidedRecordingClient
      slug={params.slug}
      tableId={searchParams.t ?? null}
      campaign={campaign}
    />
  );
}
