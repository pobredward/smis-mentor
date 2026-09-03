'use client';
import { logger, toDriveImageUrl, getFieldValue, getFixedFieldValue, getDefaultFieldConfig, type STSheetFieldConfig } from '@smis-mentor/shared';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { stSheetService, jobCodesService, placementOverrideService, STSheetStudent, CampCode, CampType } from '@/lib/stSheetService';
import { authenticatedGet } from '@/lib/apiClient';

type EditPermission = 'readonly' | 'all' | 'mentor';

function canEditField(permission: EditPermission, role: string): boolean {
  if (permission === 'readonly') return false;
  if (role === 'admin') return true;
  if (permission === 'all') return true;
  if (permission === 'mentor') return role === 'mentor' || role === 'mentor_temp';
  return false;
}

interface DepartureStudent extends STSheetStudent {
  departureGroup?: string;
  departureInstructor?: string;
}

export default function DepartureContent() {
  const { userData } = useAuth();
  const [students, setStudents] = useState<DepartureStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<DepartureStudent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [campCode, setCampCode] = useState<CampCode | null>(null);
  const [campType, setCampType] = useState<CampType>('EJ');
  const [isTemporaryData, setIsTemporaryData] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);
  const [useTemporaryDataSetting, setUseTemporaryDataSetting] = useState(true);
  const [fieldConfig, setFieldConfig] = useState<STSheetFieldConfig | null>(null);

  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;
  const isAdmin = userData?.role === 'admin';
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const activeJobExp = userData?.jobExperiences?.find(exp => exp.id === activeJobCodeId);
  const groupRole = activeJobExp?.groupRole;

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedStudent(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectStudent = useCallback(async (student: DepartureStudent) => {
    if (!campCode) return;
    const override = await placementOverrideService.getOverride(campCode, student.studentId);
    setSelectedStudent(placementOverrideService.mergeOverride(student, override) as DepartureStudent);
  }, [campCode]);

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
          const type = stSheetService.getCampType(code);
          setCampCode(code);
          setCampType(type);
          const cfg = await authenticatedGet<STSheetFieldConfig>(
            `/api/st/field-config?campType=${type}`
          ).catch(() => null);
          setFieldConfig(cfg);
        } else {
          setLoading(false);
        }
      } catch (error) {
        logger.error('캠프 코드 로드 실패:', error);
        setLoading(false);
      }
    };
    loadCampCode();
  }, [activeJobCodeId]);

  const loadAllStudents = useCallback(async () => {
    if (!campCode) return;
    try {
      setLoading(true);
      const data = await stSheetService.getCachedData(campCode);
      setStudents(data as DepartureStudent[]);
      const isTemp = await stSheetService.isTemporaryData(campCode);
      const useTempSetting = await stSheetService.getUseTemporaryDataSetting(campCode);
      const hasReal = await stSheetService.hasRealData(campCode);
      setIsTemporaryData(isTemp);
      setUseTemporaryDataSetting(useTempSetting);
      setHasRealData(hasReal);
    } catch (error) {
      logger.error('❌ [DepartureContent] 학생 목록 로드 실패:', error);
      alert('학생 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [campCode]);

  useEffect(() => {
    if (campCode) loadAllStudents();
  }, [campCode, loadAllStudents]);

  // 입소공항조별 그룹화
  const groupedByDepartureGroup = useMemo(() => {
    return students.reduce((acc, student) => {
      const group = student.departureGroup?.trim() || '미배정';
      if (!acc[group]) acc[group] = [];
      acc[group].push(student);
      return acc;
    }, {} as Record<string, DepartureStudent[]>);
  }, [students]);

  // 각 조의 인솔자 추출
  const instructorMap = useMemo(() => {
    const map: Record<string, string> = {};
    Object.keys(groupedByDepartureGroup).forEach(group => {
      const groupStudents = groupedByDepartureGroup[group];
      const instructor = groupStudents.find(s => s.departureInstructor)?.departureInstructor || '';
      map[group] = instructor;
    });
    return map;
  }, [groupedByDepartureGroup]);

  // 공항 정렬 우선순위: 김포 → 청주 → 광주 → 김해 → 직접 → 공항 → 나머지 → 미배정
  const AIRPORT_ORDER = ['김포', '청주', '광주', '김해', '직접', '공항'];

  const sortGroupKey = (key: string): [number, string] => {
    if (key === '미배정') return [99, key];
    const idx = AIRPORT_ORDER.findIndex(prefix => key.includes(prefix));
    return [idx >= 0 ? idx : 10, key];
  };

  // '미배정'은 항상 맨 뒤, 나머지는 공항 순서대로
  const sortedGroups = useMemo(() => {
    const keys = Object.keys(groupedByDepartureGroup);
    return keys.sort((a, b) => {
      const [ai, an] = sortGroupKey(a);
      const [bi, bn] = sortGroupKey(b);
      if (ai !== bi) return ai - bi;
      return an.localeCompare(bn, 'ko', { numeric: true });
    });
  }, [groupedByDepartureGroup]);

  // 학생 정렬: 여자 먼저 → 낮은 학년 → 반번호 → 고유번호
  const sortStudents = (list: DepartureStudent[]): DepartureStudent[] => {
    return [...list].sort((a, b) => {
      // 1. 여자(F) 먼저
      const genderA = a.gender === 'F' ? 0 : 1;
      const genderB = b.gender === 'F' ? 0 : 1;
      if (genderA !== genderB) return genderA - genderB;

      // 2. 학년 숫자 오름차순 (G3 → 3, G4 → 4)
      const gradeA = parseInt(a.grade?.replace(/[^0-9]/g, '') || '99', 10);
      const gradeB = parseInt(b.grade?.replace(/[^0-9]/g, '') || '99', 10);
      if (gradeA !== gradeB) return gradeA - gradeB;

      // 3. 반번호
      const classA = a.classNumber || '';
      const classB = b.classNumber || '';
      if (classA !== classB) return classA.localeCompare(classB, 'ko');

      // 4. 고유번호
      return (a.studentId || '').localeCompare(b.studentId || '');
    });
  };

  // 검색 및 선택 조 필터링
  const displayStudents = searchQuery.trim()
    ? sortStudents(students.filter(s => {
        const q = searchQuery.trim();
        return s.name?.includes(q) || s.englishName?.toLowerCase().includes(q.toLowerCase());
      }))
    : selectedGroup
    ? sortStudents(groupedByDepartureGroup[selectedGroup] || [])
    : [];

  // 첫 번째 조 자동 선택
  useEffect(() => {
    if (sortedGroups.length > 0 && !selectedGroup && !searchQuery.trim()) {
      setSelectedGroup(sortedGroups[0]);
    }
  }, [sortedGroups.length, selectedGroup, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">입소명단 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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
        <p className="text-sm text-gray-600">해당 캠프의 입소명단을 확인할 수 있습니다.</p>
      </div>
    );
  }

  // E/J 캠프가 아니면 안내
  if (campType !== 'EJ') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
        <p className="text-sm font-medium text-gray-600">입소명단은 E/J 캠프에서만 사용 가능합니다.</p>
      </div>
    );
  }

  // 입소공항조 데이터가 없는 경우
  const hasGroupData = students.some(s => s.departureGroup);
  if (!hasGroupData && students.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm font-medium text-gray-600">ST시트에 입소공항조 데이터가 없습니다.</p>
        <p className="text-xs text-gray-400 mt-1">ST시트에 "입소공항조", "입소공항인솔" 컬럼을 추가한 후 동기화해주세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">입소명단</h1>
        <div className="flex items-center gap-2">
          {isSearchExpanded ? (
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름 검색 (한글/영문)..."
                className="bg-transparent border-none outline-none text-sm w-40"
                autoFocus
              />
              <button
                onClick={() => { setSearchQuery(''); setIsSearchExpanded(false); }}
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
                {hasRealData ? '관리자가 임시 데이터 표시를 활성화했습니다.' : '공항 조 배정이 완료되면 실제 명단으로 표기됩니다.'}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* 조 토글 */}
      {!searchQuery.trim() && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 overflow-x-auto">
          <div className="flex gap-2">
            {sortedGroups.map(group => {
              const isUnclassified = group === '미배정';
              const isSelected = selectedGroup === group;
              const instructor = instructorMap[group];
              return (
                <button
                  key={group}
                  onClick={() => setSelectedGroup(group)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex flex-col items-center ${
                    isSelected
                      ? isUnclassified ? 'bg-gray-500 text-white' : 'bg-green-600 text-white'
                      : isUnclassified ? 'bg-gray-200 text-gray-500 hover:bg-gray-300' : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  <span>{group}</span>
                  {instructor ? (
                    <span className={`text-[10px] font-normal mt-0.5 ${isSelected ? 'text-green-100' : 'text-green-600'}`}>
                      {instructor}
                    </span>
                  ) : isUnclassified ? (
                    <span className={`text-[10px] font-normal mt-0.5 ${isSelected ? 'text-gray-200' : 'text-gray-400'}`}>
                      {groupedByDepartureGroup[group].length}명
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 검색 결과 안내 */}
      {searchQuery.trim() && (
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <p className="text-sm text-gray-600">"{searchQuery}" 검색 결과: {displayStudents.length}명</p>
        </div>
      )}

      {/* 학생 목록 — 4열 그리드 */}
      <div className="flex-1 overflow-y-auto p-4">
        {students.length === 0 && !useTemporaryDataSetting ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium text-gray-600">실제 데이터가 없습니다.</p>
            <p className="text-xs text-gray-400">ST 시트를 동기화하거나 임시 데이터를 켜서 미리 확인하세요.</p>
          </div>
        ) : displayStudents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">조를 선택해주세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {displayStudents.map((student, idx) => {
              const gradeNum = student.grade?.replace(/[^0-9]/g, '') ?? '';
              const gradePrefix = student.grade?.replace(/[0-9].*/g, '') ?? 'G';
              const gradeBadge = gradeNum ? `${gradePrefix}${gradeNum}${student.gender === 'M' ? 'M' : 'F'}` : '';
              return (
                <button
                  key={student.studentId || `student-${idx}`}
                  onClick={() => handleSelectStudent(student)}
                  className="bg-white rounded-lg p-2.5 border border-gray-200 hover:border-green-300 hover:shadow-md transition-all text-left"
                >
                  {/* 프로필 사진 */}
                  {(() => {
                    const photoUrl = toDriveImageUrl(student.profilePhoto);
                    return photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={student.name}
                        className="w-full aspect-square rounded-md object-cover mb-2 border border-gray-100"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null;
                  })()}
                  <div
                    className={`w-full aspect-square rounded-md flex items-center justify-center mb-2 border border-gray-100 ${toDriveImageUrl(student.profilePhoto) ? 'hidden' : ''}`}
                    style={{ backgroundColor: student.gender === 'M' ? '#dbeafe' : '#fef9c3' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
                      className="w-1/2 h-1/2"
                      style={{ color: student.gender === 'M' ? '#93c5fd' : '#fcd34d' }}
                    >
                      <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
                    </svg>
                  </div>

                  <div className="mb-1.5">
                    <h3 className={`text-sm font-bold truncate leading-tight ${
                      student.gender === 'M' ? 'text-blue-600' : 'text-yellow-600'
                    }`}>
                      {student.name}{gradeBadge ? ` (${gradeBadge})` : ''}
                    </h3>
                    <p className="text-[10px] text-gray-900 font-medium truncate">
                      {student.classNumber || '-'} | {student.studentId || '-'}
                    </p>
                  </div>

                  <div className="h-px bg-gray-200 my-1.5"></div>

                  <div className="space-y-0.5 text-[10px] text-gray-600">
                    <p className="truncate">{student.englishName || '-'}</p>
                    <p className="truncate text-[8px]">
                      반:{student.classMentor || '-'}{student.className ? `(${student.className}반)` : ''}
                    </p>
                    <p className="truncate text-[8px]">
                      방:{student.unitMentor || '-'}{student.roomNumber ? `(${student.roomNumber}호)` : ''}
                    </p>
                    <p className="truncate text-[8px] text-green-600 font-medium">
                      {student.departureGroup || '-'}{student.departureInstructor ? ` (${student.departureInstructor})` : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 학생 상세 모달 */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedStudent(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-h-[85vh] flex flex-col md:max-w-4xl md:flex-row md:max-h-[80vh]" onClick={(e) => e.stopPropagation()}>

            {/* 데스크탑: 왼쪽 사진 패널 */}
            <div className="hidden md:flex md:flex-col md:items-center md:justify-start md:w-96 md:flex-shrink-0 md:p-6 md:border-r md:border-gray-200 md:bg-gray-50 md:rounded-l-2xl">
              {(() => {
                const profilePhotoUrl = toDriveImageUrl(selectedStudent.profilePhoto);
                return (
                  <>
                    {profilePhotoUrl ? (
                      <img
                        src={profilePhotoUrl}
                        alt={`${selectedStudent.name} 프로필`}
                        className="w-full aspect-square rounded-2xl object-cover border border-gray-200 mb-4"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div
                      className={`w-full aspect-square rounded-2xl border border-gray-200 flex items-center justify-center mb-4 ${profilePhotoUrl ? 'hidden' : ''}`}
                      style={{ backgroundColor: selectedStudent.gender === 'M' ? '#dbeafe' : '#fef9c3' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
                        className="w-1/2 h-1/2"
                        style={{ color: selectedStudent.gender === 'M' ? '#93c5fd' : '#fcd34d' }}
                      >
                        <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 text-center">{selectedStudent.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{selectedStudent.englishName || ''}</p>
                    {/* 입소 정보 요약 */}
                    {(selectedStudent.departureGroup || selectedStudent.departureInstructor) && (
                      <div className="mt-3 w-full bg-green-50 rounded-xl p-3 border border-green-100">
                        {selectedStudent.departureGroup && (
                          <p className="text-xs text-green-700 font-semibold text-center">✈ 입소 {selectedStudent.departureGroup}</p>
                        )}
                        {selectedStudent.departureInstructor && (
                          <p className="text-xs text-green-600 text-center mt-0.5">인솔: {selectedStudent.departureInstructor}</p>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* 오른쪽(데스크탑) / 전체(모바일) 콘텐츠 영역 */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden rounded-2xl md:rounded-l-none">
              {/* 헤더 */}
              <div className="flex items-center justify-center px-6 py-3 border-b border-gray-200 relative flex-shrink-0">
                <h3 className="text-xl font-bold text-gray-900">{selectedStudent.name}</h3>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              {/* 내용 스크롤 영역 */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {/* 모바일: 사진 + 입소정보 */}
                <div className="md:hidden">
                  {(() => {
                    const profilePhotoUrl = toDriveImageUrl(selectedStudent.profilePhoto);
                    return (
                      <div className="flex flex-col items-center mb-4">
                        {profilePhotoUrl ? (
                          <img
                            src={profilePhotoUrl}
                            alt={`${selectedStudent.name} 프로필`}
                            className="w-80 h-80 rounded-2xl object-cover border border-gray-200"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div
                          className={`w-80 h-80 rounded-2xl border border-gray-200 flex items-center justify-center ${profilePhotoUrl ? 'hidden' : ''}`}
                          style={{ backgroundColor: selectedStudent.gender === 'M' ? '#dbeafe' : '#fef9c3' }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
                            className="w-24 h-24"
                            style={{ color: selectedStudent.gender === 'M' ? '#93c5fd' : '#fcd34d' }}
                          >
                            <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
                          </svg>
                        </div>
                        {/* 입소 정보 요약 (모바일) */}
                        {(selectedStudent.departureGroup || selectedStudent.departureInstructor) && (
                          <div className="mt-3 w-full max-w-xs bg-green-50 rounded-xl p-3 border border-green-100">
                            {selectedStudent.departureGroup && (
                              <p className="text-xs text-green-700 font-semibold text-center">✈ 입소 {selectedStudent.departureGroup}</p>
                            )}
                            {selectedStudent.departureInstructor && (
                              <p className="text-xs text-green-600 text-center mt-0.5">인솔: {selectedStudent.departureInstructor}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* fieldConfig 기반 섹션 렌더링 */}
                {(fieldConfig ?? getDefaultFieldConfig(campType ?? 'EJ')).sections
                  .filter(sec => sec.isVisible)
                  .sort((a, b) => a.order - b.order)
                  .map(section => {
                    if (section.isFixed) {
                      const visibleFields = section.fields
                        .filter(f => f.isVisible)
                        .sort((a, b) => a.order - b.order);
                      const rows = visibleFields
                        .map(f => ({
                          label: f.label,
                          value: f.isLegacy
                            ? getFixedFieldValue(selectedStudent!, f.fieldKey, campType ?? 'EJ', { isForeign, isAdmin, groupRole })
                            : (getFieldValue(selectedStudent!, { fieldKey: f.fieldKey, sheetHeader: f.sheetHeader, isLegacy: false }) || null),
                        }))
                        .filter(r => r.value !== null);
                      if (rows.length === 0) return null;
                      return (
                        <div key={section.id} className="mb-5">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">{section.label}</h4>
                          <div className="space-y-2">
                            {rows.map(r => (
                              <div key={r.label} className="flex py-2 border-b border-gray-100">
                                <span className="flex-1 text-xs text-gray-500">{r.label}</span>
                                <span className="flex-[2] text-xs text-gray-900 font-medium">{r.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    const userRole = userData?.role ?? '';
                    const visibleFields = section.fields
                      .filter(f => f.isVisible)
                      .sort((a, b) => a.order - b.order)
                      .filter(f => {
                        if (!f.isEditable && f.permission === 'readonly') {
                          return !!getFieldValue(selectedStudent!, { fieldKey: f.fieldKey, sheetHeader: f.sheetHeader, isLegacy: f.isLegacy });
                        }
                        return true;
                      });
                    if (visibleFields.length === 0) return null;
                    return (
                      <div key={section.id} className="mb-5">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">{section.label}</h4>
                        <div className="space-y-1">
                          {visibleFields.map(field => {
                            const rawValue = getFieldValue(selectedStudent!, {
                              fieldKey: field.fieldKey,
                              sheetHeader: field.sheetHeader,
                              isLegacy: field.isLegacy,
                            });
                            const displayValue = rawValue
                              ? (field.fieldType === 'score' && field.maxScore ? `${rawValue} / ${field.maxScore}` : rawValue)
                              : '-';
                            const isTextArea = field.fieldType === 'text' && !field.maxScore;
                            return (
                              <div
                                key={field.fieldKey}
                                className={`flex ${isTextArea ? 'items-start' : 'items-center'} py-1.5 border-b border-gray-100 gap-2`}
                              >
                                <span className="w-28 shrink-0 text-xs text-gray-500 pt-0.5">{field.label}</span>
                                <span className={`flex-1 text-xs text-gray-900 font-medium ${isTextArea ? 'whitespace-pre-wrap break-words' : ''}`}>
                                  {displayValue !== '-' ? displayValue : <span className="text-gray-300">-</span>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* 닫기 버튼 */}
              <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0">
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
