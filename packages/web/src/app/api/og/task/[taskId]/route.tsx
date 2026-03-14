import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    
    // 간단한 SMIS 브랜드 이미지 생성
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
            backgroundColor: '#ffffff',
            backgroundImage: 'linear-gradient(to bottom right, #dbeafe, #ffffff)',
          }}
        >
          {/* SMIS 로고 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
            }}
          >
            <div
              style={{
                fontSize: 120,
                fontWeight: 'bold',
                background: 'linear-gradient(to right, #3b82f6, #2563eb)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                color: 'transparent',
                letterSpacing: '-0.05em',
              }}
            >
              SMIS
            </div>
            <div
              style={{
                fontSize: 40,
                fontWeight: '600',
                color: '#1e40af',
                letterSpacing: '0.1em',
              }}
            >
              멘토 업무
            </div>
          </div>
          
          {/* 하단 */}
          <div
            style={{
              position: 'absolute',
              bottom: '40px',
              fontSize: 24,
              color: '#94a3b8',
            }}
          >
            smis-mentor.com
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
    
    // 오류 발생 시 기본 이미지
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
          <div style={{ fontSize: 80, fontWeight: 'bold', color: '#3b82f6' }}>
            SMIS 멘토
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
