import CampDetailView from '@/components/camp/CampDetailView';

interface PageProps {
  params: Promise<{
    itemId: string;
  }>;
}

export default async function EducationDetailPage({ params }: PageProps) {
  const { itemId } = await params;
  
  return <CampDetailView category="education" itemId={itemId} />;
}
