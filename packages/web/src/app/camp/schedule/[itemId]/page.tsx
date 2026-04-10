import CampDetailView from '@/components/camp/CampDetailView';

interface PageProps {
  params: Promise<{
    itemId: string;
  }>;
}

export default async function ScheduleDetailPage({ params }: PageProps) {
  const { itemId } = await params;
  
  return <CampDetailView category="schedule" itemId={itemId} />;
}
