import { Metadata } from 'next';
import { getTaskById } from '@/lib/taskService';

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ taskId: string }> 
}): Promise<Metadata> {
  try {
    const { taskId } = await params;
    const task = await getTaskById(taskId);
    
    if (!task) {
      return {
        title: '업무를 찾을 수 없습니다 - SMIS 멘토',
        description: '요청하신 업무를 찾을 수 없습니다.',
      };
    }

    const date = task.date.toDate();
    const dateStr = date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
    
    const timeStr = task.time ? ` ${task.time}` : '';
    const description = `${dateStr}${timeStr}`;
    const url = `https://www.smis-mentor.com/camp/tasks/${taskId}`;

    return {
      title: `${task.title} - SMIS 멘토 업무`,
      description: description,
      openGraph: {
        title: task.title,
        description: description,
        url: url,
        siteName: 'SMIS 멘토',
        type: 'article',
        images: [
          {
            url: 'https://www.smis-mentor.com/logo-wide.png',
            width: 1200,
            height: 630,
            alt: 'SMIS 멘토',
          }
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: task.title,
        description: description,
        images: ['https://www.smis-mentor.com/logo-wide.png'],
      },
    };
  } catch (error) {
    console.error('메타데이터 생성 오류:', error);
    return {
      title: '업무 로딩 중 - SMIS 멘토',
      description: '업무 정보를 불러오는 중입니다.',
    };
  }
}

export default function TaskDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
