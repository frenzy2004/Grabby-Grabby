import { notFound } from 'next/navigation';
import { GuidedRecordingClient } from './GuidedRecordingClient';
import { getCampaign } from '@/lib/humeoApi';

type PageProps = {
  params: { slug: string };
  searchParams: { t?: string };
};

export default async function RecordPage({ params, searchParams }: PageProps) {
  let campaign;
  try {
    campaign = await getCampaign(params.slug);
  } catch {
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
