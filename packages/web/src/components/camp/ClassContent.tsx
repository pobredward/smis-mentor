'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { stSheetService, jobCodesService, STSheetStudent, CampCode, CampType } from '@/lib/stSheetService';

// 주민등록번호 마스킹 함수
const maskSSN = (ssn: string | null | undefined, isAdmin: boolean, groupRole?: string): string => {
  if (!ssn) return '-';
  // 관리자만 전체 공개
  if (isAdmin) return ssn;
  // 형식: 980619-1****** (앞 6자리 + - + 첫번째 숫자 + 나머지 *)
  const parts = ssn.split('-');
  if (parts.length !== 2) return ssn; // 형식이 다르면 원본 반환
  const front = parts[0];
  const back = parts[1];
  if (back.length === 0) return ssn;
  return `${front}-${back[0]}${'*'.repeat(back.length - 1)}`;
};

// Google Drive 링크를 직접 이미지 URL로 변환
const convertGoogleDriveUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  
  // 이미 변환된 URL이면 그대로 반환
  if (url.includes('drive.google.com/uc?') || url.includes('drive.google.com/thumbnail?')) {
    return url;
  }
  
  // Google Drive 공유 링크 형식 체크
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^\/]+)/);
  if (driveMatch && driveMatch[1]) {
    const fileId = driveMatch[1];
    
    // 방법 1: 썸네일 API 사용 (더 안정적, CORS 문제 없음)
    const thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
    
    // 방법 2: 직접 다운로드 (백업용)
    // const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    
    // 방법 3: 기존 방식
    // const viewUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    
    console.log('🔄 [convertGoogleDriveUrl] URL 변환:', {
      original: url,
      converted: thumbnailUrl,
      fileId,
      note: '썸네일 API 사용 (sz=w400)'
    });
    return thumbnailUrl;
  }
  
  // Google Drive 링크가 아니면 원본 반환
  return url;
};

export default function ClassContent() {
  const { userData } = useAuth();
  const [students, setStudents] = useState<STSheetStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<STSheetStudent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [campCode, setCampCode] = useState<CampCode | null>(null);
  const [campType, setCampType] = useState<CampType>('EJ');
  const [isTemporaryData, setIsTemporaryData] = useState(false);
  const [useTemporaryDataSetting, setUseTemporaryDataSetting] = useState(true);
  const [hasRealData, setHasRealData] = useState(false);

  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;
  const isAdmin = userData?.role === 'admin';
  const activeJobExp = userData?.jobExperiences?.find(exp => exp.id === activeJobCodeId);
  const groupRole = activeJobExp?.groupRole;

  useEffect(() => {
    const loadCampCode = async () => {
      if (!activeJobCodeId || typeof activeJobCodeId !== 'string') {
        setLoading(false);
        return;
      }
      
      try {
        const jobCodes = await jobCodesService.getJobCodesByIds([activeJobCodeId]);
        if (jobCodes.length > 0 && jobCodes[0].code) {
          const code = jobCodes[0].code as CampCode;
          setCampCode(code);
          setCampType(stSheetService.getCampType(code));
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error('캠프 코드 로드 실패:', error);
        setLoading(false);
      }
    };
    
    loadCampCode();
  }, [activeJobCodeId]);

  const loadAllStudents = useCallback(async () => {
    if (!campCode) return; // campCode가 없으면 로드하지 않음
    
    try {
      setLoading(true);
      console.log('📥 [ClassContent] 학생 데이터 로딩 시작...', { campCode });
      const data = await stSheetService.getCachedData(campCode);
      console.log('📊 [ClassContent] 로드된 학생 수:', data.length);
      
      // 처음 몇 명의 프로필사진 정보 출력
      const studentsWithPhotos = data.filter(s => s.profilePhoto);
      console.log('📸 [ClassContent] 프로필사진 있는 학생:', studentsWithPhotos.length);
      if (studentsWithPhotos.length > 0) {
        console.log('📸 [ClassContent] 프로필사진 샘플:', studentsWithPhotos.slice(0, 3).map(s => ({
          name: s.name,
          profilePhoto: s.profilePhoto,
          photoLength: s.profilePhoto?.length
        })));
      }
      
      const isTemp = await stSheetService.isTemporaryData(campCode);
      const useTempSetting = await stSheetService.getUseTemporaryDataSetting(campCode);
      const hasReal = await stSheetService.hasRealData(campCode);
      setStudents(data);
      setIsTemporaryData(isTemp);
      setUseTemporaryDataSetting(useTempSetting);
      setHasRealData(hasReal);
    } catch (error) {
      console.error('❌ [ClassContent] 학생 목록 로드 실패:', error);
      alert('학생 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [campCode]);

  useEffect(() => {
    if (campCode) {
      loadAllStudents();
    }
  }, [campCode, loadAllStudents]);

  const handleSync = async () => {
    if (!isAdmin) {
      alert('동기화는 관리자만 수행할 수 있습니다.');
      return;
    }

    if (!campCode) {
      alert('캠프 코드를 불러오는 중입니다.');
      return;
    }

    try {
      setSyncing(true);
      await stSheetService.syncSTSheet(campCode);
      await loadAllStudents();
      alert('데이터 동기화가 완료되었습니다.');
    } catch (error) {
      console.error('동기화 실패:', error);
      alert('동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleTemporaryData = async () => {
    if (!isAdmin) {
      alert('설정 변경은 관리자만 수행할 수 있습니다.');
      return;
    }

    if (!campCode) {
      alert('캠프 코드를 불러오는 중입니다.');
      return;
    }

    try {
      const newSetting = !useTemporaryDataSetting;
      await stSheetService.setUseTemporaryDataSetting(campCode, newSetting);
      setUseTemporaryDataSetting(newSetting);
      await loadAllStudents();
      alert(`임시 데이터 표시가 ${newSetting ? '활성화' : '비활성화'}되었습니다.`);
    } catch (error) {
      console.error('설정 변경 실패:', error);
      alert('설정 변경에 실패했습니다.');
    }
  };

  // 반별로 그룹화
  const groupedByClass = useMemo(() => {
    return students.reduce((acc, student) => {
      const classPrefix = student.classNumber?.substring(0, 3) || '';
      if (!classPrefix) return acc;
      
      if (!acc[classPrefix]) {
        acc[classPrefix] = [];
      }
      acc[classPrefix].push(student);
      return acc;
    }, {} as Record<string, STSheetStudent[]>);
  }, [students]);

  const sortedClasses = useMemo(() => Object.keys(groupedByClass).sort(), [groupedByClass]);

  // 검색 필터링
  const displayStudents = searchQuery.trim()
    ? students.filter(student => student.name?.includes(searchQuery.trim())).sort((a, b) => (a.classNumber || '').localeCompare(b.classNumber || ''))
    : selectedClass
    ? (groupedByClass[selectedClass] || []).sort((a, b) => (a.classNumber || '').localeCompare(b.classNumber || ''))
    : [];

  // 첫 번째 반 자동 선택
  useEffect(() => {
    if (sortedClasses.length > 0 && !selectedClass && !searchQuery.trim()) {
      setSelectedClass(sortedClasses[0]);
    }
  }, [sortedClasses.length, selectedClass, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">반명단 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
          <svg
            className="w-6 h-6 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <p className="text-center">로그인 후 이용 가능합니다.</p>
      </div>
    );
  }

  if (!activeJobCodeId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">활성 캠프를 선택해주세요</h3>
        <p className="text-sm text-gray-600">마이페이지에서 참여 중인 캠프를 활성화하면</p>
        <p className="text-sm text-gray-600">해당 캠프의 반명단을 확인할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">반 명단</h1>
        <div className="flex items-center gap-2">
          {isSearchExpanded ? (
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름 검색..."
                className="bg-transparent border-none outline-none text-sm w-40"
                autoFocus
              />
              <button
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchExpanded(false);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsSearchExpanded(true)}
              className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg"
            >
              🔍
            </button>
          )}
          {isAdmin && (
            <>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {syncing ? '동기화 중...' : '동기화'}
              </button>
              <button
                onClick={handleToggleTemporaryData}
                className={`px-3 py-1.5 text-xs rounded-lg ${
                  useTemporaryDataSetting
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-gray-600 text-white hover:bg-gray-700'
                }`}
                title={useTemporaryDataSetting ? '임시 데이터 표시 중' : '실제 데이터 표시 중'}
              >
                {useTemporaryDataSetting ? '임시데이터 OFF' : '임시데이터 ON'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 임시 데이터 안내 배너 */}
      {isTemporaryData && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-amber-800">
              <span className="font-semibold">임시 데이터입니다.</span>
              <span className="ml-1">
                {hasRealData 
                  ? '관리자가 임시 데이터 표시를 활성화했습니다.'
                  : '반 배정이 완료되면 실제 명단으로 표기됩니다.'}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* 반 토글 */}
      {!searchQuery.trim() && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 overflow-x-auto">
          <div className="flex gap-2">
            {sortedClasses.map(classKey => (
              <button
                key={classKey}
                onClick={() => setSelectedClass(classKey)}
                className={`px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedClass === classKey
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {classKey}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 검색 결과 안내 */}
      {searchQuery.trim() && (
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <p className="text-sm text-gray-600">
            "{searchQuery}" 검색 결과: {displayStudents.length}명
          </p>
        </div>
      )}

      {/* 학생 목록 - 4열 그리드 (모바일 최적화) */}
      <div className="flex-1 overflow-y-auto p-4">
        {displayStudents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">반을 선택해주세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {displayStudents.map(student => (
              <button
                key={student.studentId}
                onClick={() => setSelectedStudent(student)}
                className="bg-white rounded-lg p-2.5 border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left"
              >
                <div className="mb-1.5">
                  <h3 className={`text-sm font-bold truncate leading-tight ${
                    student.gender === 'M' ? 'text-blue-600' : 'text-yellow-600'
                  }`}>
                    {student.name}
                  </h3>
                  <p className="text-[10px] text-gray-900 font-medium truncate">
                    {student.classNumber || '-'}
                  </p>
                </div>
                
                <div className="h-px bg-gray-200 my-1.5"></div>
                
                <div className="space-y-0.5 text-[10px] text-gray-600">
                  <p className="truncate">{student.englishName || '-'}</p>
                  <p className="truncate">
                    <span>{student.gender === 'M' ? '남' : '여'}</span>
                    <span className="mx-1">•</span>
                    <span>{student.grade}</span>
                  </p>
                  <p className="truncate text-[9px]">반: {student.classMentor || '-'}</p>
                  <p className="truncate text-[9px]">유닛: {student.unitMentor || '-'}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 학생 상세 모달 */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedStudent(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[75vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex flex-col items-center justify-center px-6 py-4 border-b border-gray-200 relative">
              {/* 프로필 사진 */}
              {(() => {
                const profilePhotoUrl = convertGoogleDriveUrl(selectedStudent.profilePhoto);
                console.log('🖼️ [ClassContent] 학생 정보:', {
                  name: selectedStudent.name,
                  studentId: selectedStudent.studentId,
                  profilePhoto: selectedStudent.profilePhoto,
                  convertedUrl: profilePhotoUrl,
                  profilePhotoType: typeof selectedStudent.profilePhoto,
                  profilePhotoLength: selectedStudent.profilePhoto?.length,
                  hasProfilePhoto: !!selectedStudent.profilePhoto
                });
                return profilePhotoUrl ? (
                  <div className="mb-3">
                    <img 
                      src={profilePhotoUrl} 
                      alt={`${selectedStudent.name} 프로필`}
                      className="w-48 h-48 rounded-full object-cover border-2 border-gray-200"
                      onLoad={(e) => {
                        console.log('✅ [ClassContent] 프로필사진 로드 성공:', selectedStudent.name, profilePhotoUrl);
                      }}
                      onError={(e) => {
                        const imgElement = e.currentTarget as HTMLImageElement;
                        console.error('❌ [ClassContent] 프로필사진 로드 실패:', {
                          name: selectedStudent.name,
                          originalUrl: selectedStudent.profilePhoto,
                          convertedUrl: profilePhotoUrl,
                          naturalWidth: imgElement.naturalWidth,
                          naturalHeight: imgElement.naturalHeight,
                          complete: imgElement.complete,
                          error: e,
                          troubleshooting: [
                            '1. Google Drive 파일이 "링크가 있는 모든 사용자"로 공개 설정되어 있는지 확인',
                            '2. 파일 형식이 이미지(jpg, png, gif 등)인지 확인',
                            '3. 파일 ID가 올바른지 확인',
                            '4. 대안: 이미지를 Imgur, Cloudinary 등 이미지 호스팅 서비스에 업로드'
                          ]
                        });
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                ) : null;
              })()}
              <h3 className="text-xl font-bold text-gray-900">{selectedStudent.name}</h3>
              <button
                onClick={() => setSelectedStudent(null)}
                className="absolute right-4 top-4 text-gray-500 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            
            {/* 내용 - 스크롤 가능 */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* 캠프 정보 */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">캠프 정보</h4>
                <div className="space-y-2">
                  {selectedStudent.studentId && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">고유번호</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.studentId}</span>
                    </div>
                  )}
                  {(selectedStudent.classNumber || selectedStudent.className || selectedStudent.classMentor) && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">반 정보</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">
                        {selectedStudent.classNumber || '-'} | {selectedStudent.className || '-'}반 | {selectedStudent.classMentor || '-'} 멘토
                      </span>
                    </div>
                  )}
                  {(selectedStudent.unit || selectedStudent.unitMentor || selectedStudent.roomNumber) && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">유닛 정보</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">
                        {selectedStudent.unit || selectedStudent.unitMentor || '-'} 유닛 | {selectedStudent.roomNumber || '-'}호
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 기본 정보 */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">기본 정보</h4>
                <div className="space-y-2">
                  <div className="flex py-2 border-b border-gray-100">
                    <span className="flex-1 text-xs text-gray-500">신상</span>
                    <span className="flex-[2] text-xs text-gray-900 font-medium">
                      {selectedStudent.name} | {selectedStudent.englishName || '-'} | {selectedStudent.grade} | {selectedStudent.gender === 'M' ? '남' : '여'}
                    </span>
                  </div>
                  {selectedStudent.ssn && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">주민등록번호</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{maskSSN(selectedStudent.ssn, isAdmin, groupRole)}</span>
                    </div>
                  )}
                  {selectedStudent.address && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">도로명 주소</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.address}</span>
                    </div>
                  )}
                  {selectedStudent.addressDetail && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">세부 주소</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.addressDetail}</span>
                    </div>
                  )}
                  {campType === 'EJ' && (selectedStudent.departureRoute || selectedStudent.arrivalRoute) && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">입퇴소공항</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">
                        {selectedStudent.departureRoute || '-'} 입소 | {selectedStudent.arrivalRoute || '-'} 퇴소
                      </span>
                    </div>
                  )}
                  {campType === 'S' && selectedStudent.shirtSize && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">단체티 사이즈</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.shirtSize}</span>
                    </div>
                  )}
                  {campType === 'S' && (selectedStudent.passportName || selectedStudent.passportNumber || selectedStudent.passportExpiry) && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">여권정보</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">
                        {selectedStudent.passportName || '-'} | {selectedStudent.passportNumber || '-'} | {selectedStudent.passportExpiry || '-'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 보호자 정보 */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">보호자 정보</h4>
                <div className="space-y-2">
                  {(selectedStudent.parentPhone || selectedStudent.parentName) && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">대표 보호자</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">
                        {selectedStudent.parentPhone || '-'} | {selectedStudent.parentName || '-'}
                      </span>
                    </div>
                  )}
                  {selectedStudent.email && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">대표 이메일</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.email}</span>
                    </div>
                  )}
                  {(selectedStudent.otherPhone || selectedStudent.otherName) && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">기타 보호자</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">
                        {selectedStudent.otherPhone || '-'} | {selectedStudent.otherName || '-'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 상세 정보 */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">상세 정보</h4>
                <div className="space-y-2">
                  {selectedStudent.medication && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">복용약 & 알레르기</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.medication}</span>
                    </div>
                  )}
                  {selectedStudent.notes && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">특이사항</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.notes}</span>
                    </div>
                  )}
                  {selectedStudent.etc && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">기타</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.etc}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* 닫기 버튼 */}
            <div className="px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => setSelectedStudent(null)}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
