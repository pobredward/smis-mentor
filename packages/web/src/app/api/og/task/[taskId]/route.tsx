import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { getTaskById } from '@/lib/taskService';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const task = await getTaskById(taskId);
    
    if (!task) {
      return new ImageResponse(
        (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f3f4f6',
            }}
          >
            <div style={{ fontSize: 48, fontWeight: 'bold', color: '#374151' }}>
              업무를 찾을 수 없습니다
            </div>
          </div>
        ),
        {
          width: 1200,
          height: 630,
        }
      );
    }

    const date = task.date.toDate();
    const dateStr = date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
    
    const timeStr = task.time || '';

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#ffffff',
            padding: '60px',
          }}
        >
          {/* 헤더 - SMIS 로고 영역 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '40px',
            }}
          >
            <div
              style={{
                fontSize: 36,
                fontWeight: 'bold',
                color: '#3b82f6',
              }}
            >
              SMIS 멘토
            </div>
          </div>

          {/* 업무 제목 */}
          <div
            style={{
              fontSize: 56,
              fontWeight: 'bold',
              color: '#111827',
              marginBottom: '30px',
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {task.title}
          </div>

          {/* 날짜 및 시간 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              marginTop: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: 28,
                color: '#6b7280',
              }}
            >
              {dateStr}
            </div>
            {timeStr && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 28,
                  color: '#6b7280',
                }}
              >
                {timeStr}
              </div>
            )}
          </div>

          {/* 하단 브랜드 */}
          <div
            style={{
              marginTop: '40px',
              paddingTop: '20px',
              borderTop: '2px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: 20,
                color: '#9ca3af',
              }}
            >
              smis-mentor.com
            </div>
            <div
              style={{
                fontSize: 18,
                color: '#9ca3af',
              }}
            >
              {task.targetRoles.join(', ')}
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('OG Image 생성 오류:', error);
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f3f4f6',
          }}
        >
          <div style={{ fontSize: 48, fontWeight: 'bold', color: '#374151' }}>
            오류가 발생했습니다
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  }
}
