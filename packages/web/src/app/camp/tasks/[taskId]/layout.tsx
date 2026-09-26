import { Metadata } from 'next';
import { logger, L } from '@smis-mentor/shared';
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
        title: L('misc.taskNotFoundSmisMentor'),
        description: L('misc.theRequestedTaskCouldNot'),
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
      title: L('misc.smisMentorTask', { v0: task.title }),
      description: description,
      openGraph: {
        title: task.title,
        description: description,
        url: url,
        siteName: 'SMIS 멘토',
        type: 'article',
        images: [
          {
            url: '/logo-wide-metadata.png',
            width: 1200,
            height: 630,
            alt: 'SMIS 멘토 플랫폼',
          }
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: task.title,
        description: description,
        images: ['/logo-wide-metadata.png'],
      },
    };
  } catch (error) {
    logger.error('메타데이터 생성 오류:', error);
    return {
      title: L('misc.loadingTaskSmisMentor'),
      description: L('misc.loadingTaskInformation'),
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
