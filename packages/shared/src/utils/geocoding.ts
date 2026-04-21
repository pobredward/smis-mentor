// Geocoding 유틸리티 함수 (모바일/웹 공용)
import { Timestamp } from 'firebase/firestore';
import { logger } from './logger';

/**
 * Kakao Geocoding API를 사용하여 주소를 위도/경도로 변환
 */
export async function geocodeAddress(address: string, apiKey?: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // React Native에서는 환경변수 접근 방법이 다르므로 apiKey를 직접 받음
    const kakaoApiKey = apiKey || process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY || process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
    
    if (!kakaoApiKey || kakaoApiKey === 'YOUR_KAKAO_REST_API_KEY') {
      logger.warn('Kakao API 키가 설정되지 않았습니다.');
      return null;
    }

    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
      {
        headers: {
          Authorization: `KakaoAK ${kakaoApiKey}`,
        },
      }
    );

    if (!response.ok) {
      logger.error('Kakao API 오류:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.documents && data.documents.length > 0) {
      const result = data.documents[0];
      return {
        lat: parseFloat(result.y),
        lng: parseFloat(result.x),
      };
    }

    return null;
  } catch (error) {
    logger.error('Geocoding 오류:', error);
    return null;
  }
}

/**
 * 주소 변경 시 자동으로 좌표를 업데이트하는 함수
 */
export async function updateGeocodeIfAddressChanged(
  oldAddress: string | undefined,
  newAddress: string | undefined,
  apiKey?: string
): Promise<{ geocode?: { lat: number; lng: number; updatedAt: Timestamp } }> {
  // 주소가 변경되지 않았으면 업데이트 안 함
  if (oldAddress === newAddress || !newAddress) {
    return {};
  }

  logger.info('📍 주소 변경 감지, 좌표 변환 시작:', newAddress);

  try {
    const coords = await geocodeAddress(newAddress, apiKey);
    
    if (coords) {
      logger.info('✅ 좌표 변환 성공:', coords);
      return {
        geocode: {
          lat: coords.lat,
          lng: coords.lng,
          updatedAt: Timestamp.now(),
        },
      };
    } else {
      logger.warn('⚠️ 좌표 변환 실패, 기존 geocode 유지');
      return {};
    }
  } catch (error) {
    logger.error('❌ 좌표 변환 중 오류:', error);
    return {};
  }
}

/**
 * 두 좌표 간 거리를 계산 (Haversine formula)
 * @param lat1 위도1
 * @param lng1 경도1
 * @param lat2 위도2
 * @param lng2 경도2
 * @returns 거리 (km)
 */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // 지구의 반지름 (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}