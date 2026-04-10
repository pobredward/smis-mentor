import CampDetailView from '@/components/camp/CampDetailView';

interface PageProps {
  params: Promise<{
    itemId: string;
  }>;
}

export default async function GuideDetailPage({ params }: PageProps) {
  const { itemId } = await params;
  
  return <CampDetailView category="guide" itemId={itemId} />;
}
