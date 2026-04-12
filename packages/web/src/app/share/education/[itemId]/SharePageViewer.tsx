'use client';

import dynamic from 'next/dynamic';

const CampPageViewer = dynamic(() => import('@/components/camp/CampPageViewer'), {
  ssr: false,
});

interface SharePageViewerProps {
  content: string;
}

export default function SharePageViewer({ content }: SharePageViewerProps) {
  return <CampPageViewer content={content} />;
}
