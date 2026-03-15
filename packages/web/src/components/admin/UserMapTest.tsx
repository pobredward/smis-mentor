'use client';

import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { User } from '@/types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface UserWithCoords extends User {
  lat: number;
  lng: number; 
}

interface UserMapTestProps {
  users: User[];
}

// 마커 아이콘 생성 함수 - 전체 이름 표시
const createCustomIcon = (role: string, name: string) => {
  const color = 
    role === 'admin' ? '#9333ea' :
    role === 'mentor' ? '#3b82f6' :
    role === 'foreign' ? '#10b981' :
    role === 'mentor_temp' ? '#94a3b8' :
    role === 'foreign_temp' ? '#94a3b8' :
    '#6b7280';

  // 이름이 길면 줄바꿈
  const displayName = name.length > 3 ? name.substring(0, 3) + '...' : name;

  const html = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
    ">
      <div style="
        min-width: 32px;
        height: 32px;
        border-radius: 50%;
        background-color: ${color};
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 12px;
        font-weight: bold;
        padding: 0 4px;
      ">${name.charAt(0)}</div>
      <div style="
        margin-top: 2px;
        padding: 2px 6px;
        background-color: white;
        border: 1px solid ${color};
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        color: ${color};
        white-space: nowrap;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      ">${name}</div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-marker',
    iconSize: [60, 50],
    iconAnchor: [30, 50],
    popupAnchor: [0, -50],
  });
};

// 지도 중심 맞추기 컴포넌트
function MapBounds({ users }: { users: UserWithCoords[] }) {
  const map = useMap();

  useEffect(() => {
    if (users.length > 0) {
      const bounds = L.latLngBounds(users.map(user => [user.lat, user.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [users, map]);

  return null;
}

export default function UserMapTest({ users }: UserMapTestProps) {
  const [usersWithCoords, setUsersWithCoords] = useState<UserWithCoords[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  // 클라이언트 사이드에서만 렌더링
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Kakao Geocoding API를 사용한 주소 → 좌표 변환
  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const apiKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
      
      if (!apiKey || apiKey === 'YOUR_KAKAO_REST_API_KEY') {
        console.warn('Kakao API 키가 설정되지 않았습니다. 모킹 데이터를 사용합니다.');
        return mockGeocodeAddress(address);
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
        return mockGeocodeAddress(address);
      }

      const data = await response.json();
      
      if (data.documents && data.documents.length > 0) {
        const result = data.documents[0];
        return {
          lat: parseFloat(result.y),
          lng: parseFloat(result.x),
        };
      }

      // 주소를 찾지 못하면 모킹 데이터 사용
      return mockGeocodeAddress(address);
    } catch (error) {
      console.error('Geocoding 오류:', error);
      return mockGeocodeAddress(address);
    }
  };

  // 간단한 모킹 함수 - API 키가 없을 때 백업용
  const mockGeocodeAddress = (address: string): { lat: number; lng: number } | null => {
    // 주요 지역 키워드 기반 간단한 매핑
    const regionMap: Record<string, { lat: number; lng: number; range: number }> = {
      '서울': { lat: 37.5665, lng: 126.9780, range: 0.3 },
      '강남': { lat: 37.4979, lng: 127.0276, range: 0.1 },
      '강북': { lat: 37.6396, lng: 127.0252, range: 0.1 },
      '송파': { lat: 37.5145, lng: 127.1059, range: 0.1 },
      '종로': { lat: 37.5735, lng: 126.9790, range: 0.1 },
      '마포': { lat: 37.5663, lng: 126.9019, range: 0.1 },
      '부산': { lat: 35.1796, lng: 129.0756, range: 0.3 },
      '대구': { lat: 35.8714, lng: 128.6014, range: 0.3 },
      '인천': { lat: 37.4563, lng: 126.7052, range: 0.3 },
      '광주': { lat: 35.1595, lng: 126.8526, range: 0.3 },
      '대전': { lat: 36.3504, lng: 127.3845, range: 0.3 },
      '울산': { lat: 35.5384, lng: 129.3114, range: 0.3 },
      '수원': { lat: 37.2636, lng: 127.0286, range: 0.2 },
      '성남': { lat: 37.4201, lng: 127.1262, range: 0.2 },
      '고양': { lat: 37.6584, lng: 126.8320, range: 0.2 },
    };

    // 주소에서 지역 키워드 찾기
    let baseCoords = { lat: 37.5665, lng: 126.9780, range: 0.5 }; // 기본값: 서울
    
    for (const [keyword, coords] of Object.entries(regionMap)) {
      if (address.includes(keyword)) {
        baseCoords = coords;
        break;
      }
    }

    // 랜덤 오프셋 추가 (같은 지역 내에서 분산)
    const latOffset = (Math.random() - 0.5) * baseCoords.range;
    const lngOffset = (Math.random() - 0.5) * baseCoords.range;

    return {
      lat: baseCoords.lat + latOffset,
      lng: baseCoords.lng + lngOffset,
    };
  };

  // 사용자 주소를 좌표로 변환
  useEffect(() => {
    const processUsers = async () => {
      setIsGeocoding(true);
      const processed: UserWithCoords[] = [];

      // 순차적으로 처리 (API Rate Limit 고려)
      for (const user of users) {
        if (user.address) {
          const coords = await geocodeAddress(user.address);
          
          if (coords) {
            processed.push({
              ...user,
              lat: coords.lat,
              lng: coords.lng,
            });
          }
          
          // API Rate Limit 방지를 위한 짧은 대기
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ ${processed.length}명의 좌표 변환 완료`);
      setUsersWithCoords(processed);
      setIsGeocoding(false);
    };

    processUsers();
  }, [users]);

  if (isGeocoding || !isMounted) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">주소를 좌표로 변환하는 중...</p>
        </div>
      </div>
    );
  }

  if (usersWithCoords.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <svg
            className="mx-auto h-16 w-16 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">주소 정보 없음</h3>
          <p className="mt-1 text-sm text-gray-500">주소를 등록한 사용자가 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={[37.5665, 126.9780]}
        zoom={8}
        style={{ width: '100%', height: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapBounds users={usersWithCoords} />
        
        {usersWithCoords.map((user) => (
          <Marker
            key={user.userId || user.id}
            position={[user.lat, user.lng]}
            icon={createCustomIcon(user.role, user.name)}
          >
            <Popup>
              <div className="p-2 min-w-[200px]">
                <div className="flex items-center mb-2">
                  {user.profileImage ? (
                    <img
                      src={user.profileImage}
                      alt={user.name}
                      className="w-10 h-10 rounded-full mr-2"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mr-2">
                      <span className="text-gray-600">{user.name.charAt(0)}</span>
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-gray-900">{user.name}</h3>
                    <span className="text-xs text-gray-500">
                      {user.role === 'admin' ? '관리자' :
                       user.role === 'mentor' ? '멘토' :
                       user.role === 'foreign' ? '원어민' :
                       user.role === 'mentor_temp' ? '멘토(임시)' :
                       user.role === 'foreign_temp' ? '원어민(임시)' : '사용자'}
                    </span>
                  </div>
                </div>
                <div className="text-sm space-y-1">
                  <p className="text-gray-700">
                    <span className="font-medium">📞</span> {user.phoneNumber}
                  </p>
                  <p className="text-gray-700">
                    <span className="font-medium">📧</span> {user.email || '-'}
                  </p>
                  <p className="text-gray-700">
                    <span className="font-medium">📍</span> {user.address}
                    {user.addressDetail && ` ${user.addressDetail}`}
                  </p>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* 범례 */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 text-sm z-[1000]">
        <h4 className="font-semibold mb-2 text-gray-900">범례</h4>
        <div className="space-y-1">
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-blue-600 mr-2"></div>
            <span className="text-gray-700">멘토</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-green-600 mr-2"></div>
            <span className="text-gray-700">원어민</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-purple-600 mr-2"></div>
            <span className="text-gray-700">관리자</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-gray-400 mr-2"></div>
            <span className="text-gray-700">임시 계정</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          총 {usersWithCoords.length}명
        </p>
      </div>
    </div>
  );
}
