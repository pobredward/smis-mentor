// Geocoding 유틸리티 함수

import { Timestamp } from 'firebase/firestore';

/**
 * Kakao Geocoding API를 사용하여 주소를 위도/경도로 변환
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
    
    if (!apiKey || apiKey === 'YOUR_KAKAO_REST_API_KEY') {
      console.warn('Kakao API 키가 설정되지 않았습니다.');
      return null;
    }

    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
      {
        headers: {
          Authorization: `KakaoAK ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      console.error('Kakao API 오류:', response.status);
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
    console.error('Geocoding 오류:', error);
    return null;
  }
}

/**
 * 주소 변경 시 자동으로 좌표를 업데이트하는 함수
 */
export async function updateGeocodeIfAddressChanged(
  oldAddress: string | undefined,
  newAddress: string | undefined
): Promise<{ geocode?: { lat: number; lng: number; updatedAt: Timestamp } }> {
  // 주소가 변경되지 않았으면 업데이트 안 함
  if (oldAddress === newAddress || !newAddress) {
    return {};
  }

  console.log('📍 주소 변경 감지, 좌표 변환 시작:', newAddress);

  try {
    const coords = await geocodeAddress(newAddress);
    
    if (coords) {
      console.log('✅ 좌표 변환 성공:', coords);
      return {
        geocode: {
          lat: coords.lat,
          lng: coords.lng,
          updatedAt: Timestamp.now(),
        },
      };
    } else {
      console.warn('⚠️ 좌표 변환 실패, 기존 geocode 유지');
      return {};
    }
  } catch (error) {
    console.error('❌ 좌표 변환 중 오류:', error);
    return {};
  }
}
