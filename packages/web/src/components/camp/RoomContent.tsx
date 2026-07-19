'use client';
import { logger, toDriveImageUrl, getFieldValue, type STSheetFieldConfig } from '@smis-mentor/shared';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { stSheetService, jobCodesService, placementOverrideService, STSheetStudent, CampCode, CampType } from '@/lib/stSheetService';
import { authenticatedPost, authenticatedGet } from '@/lib/apiClient';

type EditPermission = 'readonly' | 'all' | 'mentor';

function canEditField(permission: EditPermission, role: string): boolean {
  if (permission === 'readonly') return false;
  if (role === 'admin') return true;
  if (permission === 'all') return true;
  if (permission === 'mentor') return role === 'mentor' || role === 'mentor_temp';
  return false;
}

// 주민등록번호 마스킹 함수
const maskSSN = (ssn: string | null | undefined, isAdmin: boolean, groupRole?: string): string => {
  if (!ssn) return '-';
  // admin 또는 mentor 중 매니저/부매니저는 전체 공개
  const isManagerRole = groupRole === '매니저' || groupRole === '부매니저';
  if (isAdmin || isManagerRole) return ssn;
  // 형식: 980619-1****** (앞 6자리 + - + 첫번째 숫자 + 나머지 *)
  const parts = ssn.split('-');
  if (parts.length !== 2) return ssn; // 형식이 다르면 원본 반환
  const front = parts[0];
  const back = parts[1];
  if (back.length === 0) return ssn;
  return `${front}-${back[0]}${'*'.repeat(back.length - 1)}`;
};


export default function RoomContent() {
  const { userData } = useAuth();
  const [students, setStudents] = useState<STSheetStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMentor, setSelectedMentor] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<STSheetStudent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [campCode, setCampCode] = useState<CampCode | null>(null);
  const [campType, setCampType] = useState<CampType>('EJ');
  const [isTemporaryData, setIsTemporaryData] = useState(false);
  const [useTemporaryDataSetting, setUseTemporaryDataSetting] = useState(true);
  const [hasRealData, setHasRealData] = useState(false);
  const [fieldConfig, setFieldConfig] = useState<STSheetFieldConfig | null>(null);

  const [editingField, setEditingField] = useState<{
    key: string; value: string; sheetHeader: string; isLegacy: boolean;
  } | null>(null);
  const [fieldSaving, setFieldSaving] = useState(false);

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

  // 학생 카드 클릭 — override 병합 후 모달 열기
  const handleSelectStudent = useCallback(async (student: STSheetStudent) => {
    if (!campCode) return;
    const override = await placementOverrideService.getOverride(campCode, student.studentId);
    setSelectedStudent(placementOverrideService.mergeOverride(student, override));
    setEditingField(null);
  }, [campCode]);

  const handleStartFieldEdit = useCallback(
    (fieldKey: string, sheetHeader: string, isLegacy: boolean) => {
      if (!selectedStudent) return;
      const value = getFieldValue(selectedStudent, { fieldKey, sheetHeader, isLegacy });
      setEditingField({ key: fieldKey, value, sheetHeader, isLegacy });
    },
    [selectedStudent],
  );

  // 편집 취소
  const handleCancelFieldEdit = useCallback(() => {
    setEditingField(null);
  }, []);

  // 단일 필드 저장
  const handleSaveField = useCallback(async () => {
    if (!selectedStudent || !campCode || !editingField) return;
    setFieldSaving(true);
    try {
      await authenticatedPost('/api/st/update-placement', {
        campCode,
        studentId: selectedStudent.studentId,
        rowNumber: selectedStudent.rowNumber,
        fields: { [editingField.key]: editingField.value },
      });
      setSelectedStudent(prev => {
        if (!prev) return null;
        if (editingField.isLegacy) {
          const updated = { ...prev } as unknown as Record<string, unknown>;
          updated[editingField.key] = editingField.value || undefined;
          return updated as unknown as STSheetStudent;
        }
        return {
          ...prev,
          displayFields: {
            ...(prev.displayFields ?? {}),
            [editingField.sheetHeader]: editingField.value,
          },
        };
      });
      setEditingField(null);
    } catch (e) {
      logger.error('학생 카드 저장 실패:', e);
      alert('저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setFieldSaving(false);
    }
  }, [selectedStudent, campCode, editingField]);

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
          // 동적 필드 설정 로드 (Admin SDK 경유 → Firestore 규칙 의존성 없음)
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
    if (!campCode) return; // campCode가 없으면 로드하지 않음
    
    try {
      setLoading(true);
      logger.info('📥 [RoomContent] 학생 데이터 로딩 시작...', { campCode });
      const data = await stSheetService.getCachedData(campCode);
      logger.info('📊 [RoomContent] 로드된 학생 수:', data.length);
      
      // 처음 몇 명의 프로필사진 정보 출력
      const studentsWithPhotos = data.filter(s => s.profilePhoto);
      logger.info('📸 [RoomContent] 프로필사진 있는 학생:', studentsWithPhotos.length);
      if (studentsWithPhotos.length > 0) {
        logger.info('📸 [RoomContent] 프로필사진 샘플:', studentsWithPhotos.slice(0, 3).map(s => ({
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
      logger.error('❌ [RoomContent] 학생 목록 로드 실패:', error);
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
      logger.error('동기화 실패:', error);
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
      logger.error('설정 변경 실패:', error);
      alert('설정 변경에 실패했습니다.');
    }
  };

  // 유닛멘토별로 그룹화
  const groupedByMentor = useMemo(() => {
    return students.reduce((acc, student) => {
      const mentorKey = student.unitMentor || '';
      if (!mentorKey) return acc;
      
      if (!acc[mentorKey]) {
        acc[mentorKey] = [];
      }
      acc[mentorKey].push(student);
      return acc;
    }, {} as Record<string, STSheetStudent[]>);
  }, [students]);

  // 멘토별 성별 판단
  const getMentorGender = useCallback((mentorKey: string): 'M' | 'F' | null => {
    const students = groupedByMentor[mentorKey];
    if (!students || students.length === 0) return null;
    return students[0].gender || null;
  }, [groupedByMentor]);

  // 멘토를 성별로 분류
  const mentorsByGender = useMemo(() => {
    return Object.keys(groupedByMentor).reduce((acc, mentor) => {
      const gender = getMentorGender(mentor);
      if (gender === 'M') {
        acc.male.push(mentor);
      } else if (gender === 'F') {
        acc.female.push(mentor);
      }
      return acc;
    }, { male: [] as string[], female: [] as string[] });
  }, [groupedByMentor, getMentorGender]);

  // 검색 필터링
  const displayStudents = searchQuery.trim()
    ? students.filter(student => student.name?.includes(searchQuery.trim())).sort((a, b) => (a.roomNumber || '').localeCompare(b.roomNumber || ''))
    : selectedMentor
    ? (groupedByMentor[selectedMentor] || []).sort((a, b) => (a.roomNumber || '').localeCompare(b.roomNumber || ''))
    : [];

  // 호수별로 그룹화
  const roomGroups = Object.entries(
    displayStudents
      .sort((a, b) => (a.roomNumber || '').localeCompare(b.roomNumber || ''))
      .reduce((acc, student) => {
        const room = student.roomNumber || '미배정';
        if (!acc[room]) acc[room] = [];
        acc[room].push(student);
        return acc;
      }, {} as Record<string, STSheetStudent[]>)
  ).sort(([roomA], [roomB]) => roomA.localeCompare(roomB));

  // 첫 번째 멘토 자동 선택
  useEffect(() => {
    const allMentors = [...mentorsByGender.male.sort(), ...mentorsByGender.female.sort()];
    if (allMentors.length > 0 && !selectedMentor && !searchQuery.trim()) {
      setSelectedMentor(allMentors[0]);
    }
  }, [mentorsByGender.male.length, mentorsByGender.female.length, selectedMentor, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">{isForeign ? 'Loading room roster...' : '방명단 로딩 중...'}</p>
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
        <p className="text-center">{isForeign ? 'Please sign in to continue.' : '로그인 후 이용 가능합니다.'}</p>
      </div>
    );
  }

  if (!activeJobCodeId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{isForeign ? 'No active camp selected' : '활성 캠프를 선택해주세요'}</h3>
        {isForeign ? (
          <>
            <p className="text-sm text-gray-600">Activate a camp on My Page to</p>
            <p className="text-sm text-gray-600">view the room roster for that camp.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600">마이페이지에서 참여 중인 캠프를 활성화하면</p>
            <p className="text-sm text-gray-600">해당 캠프의 방명단을 확인할 수 있습니다.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">{isForeign ? 'Room Roster' : '방 명단'}</h1>
        <div className="flex items-center gap-2">
          {isSearchExpanded ? (
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isForeign ? 'Search by name...' : '이름 검색...'}
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
              <span className="font-semibold">{isForeign ? 'This is temporary data.' : '임시 데이터입니다.'}</span>
              <span className="ml-1">
                {hasRealData 
                  ? (isForeign ? 'Temporary data display has been enabled by the administrator.' : '관리자가 임시 데이터 표시를 활성화했습니다.')
                  : (isForeign ? 'The actual roster will be shown once room assignments are complete.' : '방 배정이 완료되면 실제 명단으로 표기됩니다.')}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* 멘토 토글 - 성별로 2줄 */}
      {!searchQuery.trim() && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 space-y-2">
          {/* 남성 멘토 */}
          {mentorsByGender.male.length > 0 && (
            <div className="overflow-x-auto">
              <div className="flex gap-2">
                {mentorsByGender.male.sort().map(mentor => (
                  <button
                    key={mentor}
                    onClick={() => setSelectedMentor(mentor)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      selectedMentor === mentor
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    {mentor}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* 여성 멘토 */}
          {mentorsByGender.female.length > 0 && (
            <div className="overflow-x-auto">
              <div className="flex gap-2">
                {mentorsByGender.female.sort().map(mentor => (
                  <button
                    key={mentor}
                    onClick={() => setSelectedMentor(mentor)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      selectedMentor === mentor
                        ? 'bg-pink-600 text-white'
                        : 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                    }`}
                  >
                    {mentor}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 검색 결과 안내 */}
      {searchQuery.trim() && (
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <p className="text-sm text-gray-600">
            {isForeign
              ? `Search results for "${searchQuery}": ${displayStudents.length} students`
              : `"${searchQuery}" 검색 결과: ${displayStudents.length}명`}
          </p>
        </div>
      )}

      {/* 학생 목록 - 호수별 그룹화, 4열 그리드 (모바일 최적화) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayStudents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">{isForeign ? 'Please select a unit.' : '유닛을 선택해주세요.'}</p>
          </div>
        ) : (
          roomGroups.map(([roomNumber, students]) => (
            <div key={roomNumber} className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-bold text-gray-700 mb-3">{isForeign ? `Room ${roomNumber}` : `${roomNumber}호`}</h3>
              <div className="grid grid-cols-4 gap-1">
                {students.map(student => {
                  const gradeNum = student.grade?.replace(/[^0-9]/g, '') ?? '';
                  const gradePrefix = student.grade?.replace(/[0-9].*/g, '') ?? 'G';
                  const gradeBadge = gradeNum ? `${gradePrefix}${gradeNum}${student.gender === 'M' ? 'M' : 'F'}` : '';
                  return (
                  <button
                    key={student.studentId}
                    onClick={() => handleSelectStudent(student)}
                    className="bg-white rounded-lg p-2.5 border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left"
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
                        {student.classNumber || '-'}
                      </p>
                    </div>
                    
                    <div className="h-px bg-gray-200 my-1.5"></div>
                    
                    <div className="space-y-0.5 text-[10px] text-gray-600">
                      <p className="truncate">{student.englishName || '-'}</p>
                      <p className="truncate text-[9px]">
                        {isForeign ? 'Class' : '반'}: {student.classMentor || '-'}{student.className ? ` (${student.className}반)` : ''}
                      </p>
                      <p className="truncate text-[9px]">
                        {isForeign ? 'Unit' : '유닛'}: {student.unitMentor || '-'}{student.roomNumber ? ` (${student.roomNumber}호)` : ''}
                      </p>
                    </div>
                  </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 학생 상세 모달 */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedStudent(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-h-[85vh] flex flex-col md:max-w-4xl md:flex-row md:max-h-[80vh]" onClick={(e) => e.stopPropagation()}>

            {/* 데스크탑: 왼쪽 사진 패널 (고정) */}
            <div className="hidden md:flex md:flex-col md:items-center md:justify-start md:w-96 md:flex-shrink-0 md:p-6 md:border-r md:border-gray-200 md:bg-gray-50 md:rounded-l-2xl">
              {(() => {
                const profilePhotoUrl = toDriveImageUrl(selectedStudent.profilePhoto);
                logger.info('🖼️ [RoomContent] 학생 정보:', {
                  name: selectedStudent.name,
                  studentId: selectedStudent.studentId,
                  profilePhoto: selectedStudent.profilePhoto,
                  convertedUrl: profilePhotoUrl,
                  profilePhotoType: typeof selectedStudent.profilePhoto,
                  profilePhotoLength: selectedStudent.profilePhoto?.length,
                  hasProfilePhoto: !!selectedStudent.profilePhoto
                });
                return (
                  <>
                    {profilePhotoUrl ? (
                      <img
                        src={profilePhotoUrl}
                        alt={`${selectedStudent.name} 프로필`}
                        className="w-full aspect-square rounded-2xl object-cover border border-gray-200 mb-4"
                        onLoad={() => {
                          logger.info('✅ [RoomContent] 프로필사진 로드 성공:', selectedStudent.name, profilePhotoUrl);
                        }}
                        onError={(e) => {
                          const imgElement = e.currentTarget as HTMLImageElement;
                          logger.error('❌ [RoomContent] 프로필사진 로드 실패:', {
                            name: selectedStudent.name,
                            originalUrl: selectedStudent.profilePhoto,
                            convertedUrl: profilePhotoUrl,
                            naturalWidth: imgElement.naturalWidth,
                            naturalHeight: imgElement.naturalHeight,
                            complete: imgElement.complete,
                            error: e,
                          });
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
                  </>
                );
              })()}
            </div>

            {/* 오른쪽(데스크탑) / 전체(모바일) 콘텐츠 영역 */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden rounded-2xl md:rounded-l-none">
              {/* 헤더 - 이름 + 닫기 버튼 */}
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
                {/* 모바일: 사진을 스크롤 영역 최상단에 표시 */}
                <div className="md:hidden">
                  {(() => {
                    const profilePhotoUrl = toDriveImageUrl(selectedStudent.profilePhoto);
                    return (
                      <div className="flex justify-center mb-4">
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
                      </div>
                    );
                  })()}
                </div>
              {/* 캠프 정보 */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">{isForeign ? 'Camp Info' : '캠프 정보'}</h4>
                <div className="space-y-2">
                  {selectedStudent.studentId && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">{isForeign ? 'Student ID' : '고유번호'}</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.studentId}</span>
                    </div>
                  )}
                  {(selectedStudent.classNumber || selectedStudent.className || selectedStudent.classMentor) && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">{isForeign ? 'Class Info' : '반 정보'}</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">
                        {selectedStudent.classNumber || '-'} | {selectedStudent.className || '-'}{isForeign ? ' class' : '반'} | {selectedStudent.classMentor || '-'} {isForeign ? 'mentor' : '멘토'}
                      </span>
                    </div>
                  )}
                  {(selectedStudent.unit || selectedStudent.unitMentor || selectedStudent.roomNumber) && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">{isForeign ? 'Unit Info' : '유닛 정보'}</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">
                        {selectedStudent.unit || selectedStudent.unitMentor || '-'} {isForeign ? 'unit' : '유닛'} | {isForeign ? 'Room' : ''}{selectedStudent.roomNumber || '-'}{isForeign ? '' : '호'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 기본 정보 */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">{isForeign ? 'Basic Info' : '기본 정보'}</h4>
                <div className="space-y-2">
                  <div className="flex py-2 border-b border-gray-100">
                    <span className="flex-1 text-xs text-gray-500">{isForeign ? 'Profile' : '신상'}</span>
                    <span className="flex-[2] text-xs text-gray-900 font-medium">
                      {selectedStudent.name} | {selectedStudent.englishName || '-'} | {selectedStudent.grade} | {selectedStudent.gender === 'M' ? (isForeign ? 'M' : '남') : (isForeign ? 'F' : '여')}
                    </span>
                  </div>
                  {selectedStudent.ssn && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">{isForeign ? 'ID Number' : '주민등록번호'}</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{maskSSN(selectedStudent.ssn, isAdmin, groupRole)}</span>
                    </div>
                  )}
                  {selectedStudent.address && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">{isForeign ? 'Address' : '도로명 주소'}</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.address}</span>
                    </div>
                  )}
                  {selectedStudent.addressDetail && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">{isForeign ? 'Address Detail' : '세부 주소'}</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.addressDetail}</span>
                    </div>
                  )}
                  {campType === 'EJ' && (selectedStudent.departureRoute || selectedStudent.arrivalRoute) && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">{isForeign ? 'Airport' : '입퇴소공항'}</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">
                        {isForeign
                          ? `Arrival: ${selectedStudent.departureRoute || '-'} | Departure: ${selectedStudent.arrivalRoute || '-'}`
                          : `${selectedStudent.departureRoute || '-'} 입소 | ${selectedStudent.arrivalRoute || '-'} 퇴소`}
                      </span>
                    </div>
                  )}
                  {campType === 'S' && selectedStudent.shirtSize && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">{isForeign ? 'Shirt Size' : '단체티 사이즈'}</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.shirtSize}</span>
                    </div>
                  )}
                  {campType === 'S' && (selectedStudent.passportName || selectedStudent.passportNumber || selectedStudent.passportExpiry) && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">{isForeign ? 'Passport' : '여권정보'}</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">
                        {selectedStudent.passportName || '-'} | {selectedStudent.passportNumber || '-'} | {selectedStudent.passportExpiry || '-'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 보호자 정보 */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">{isForeign ? 'Guardian Info' : '보호자 정보'}</h4>
                <div className="space-y-2">
                  {(selectedStudent.parentPhone || selectedStudent.parentName) && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">{isForeign ? 'Primary Guardian' : '대표 보호자'}</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">
                        {selectedStudent.parentPhone || '-'} | {selectedStudent.parentName || '-'}
                      </span>
                    </div>
                  )}
                  {selectedStudent.email && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">{isForeign ? 'Primary Email' : '대표 이메일'}</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.email}</span>
                    </div>
                  )}
                  {(selectedStudent.otherPhone || selectedStudent.otherName) && (
                    <div className="flex py-2 border-b border-gray-100">
                      <span className="flex-1 text-xs text-gray-500">{isForeign ? 'Other Guardian' : '기타 보호자'}</span>
                      <span className="flex-[2] text-xs text-gray-900 font-medium">
                        {selectedStudent.otherPhone || '-'} | {selectedStudent.otherName || '-'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 동적 섹션 — fieldConfig 기반 렌더링 */}
              {fieldConfig && fieldConfig.sections
                .filter(sec => sec.isVisible)
                .sort((a, b) => a.order - b.order)
                .map(section => {
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
                          const canEdit = canEditField(field.permission as EditPermission, userRole) && field.isEditable;
                          const isThisEditing = editingField?.key === field.fieldKey;
                          const isSavingThis = isThisEditing && fieldSaving;
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
                              {isThisEditing ? (
                                <>
                                  {isTextArea ? (
                                    <textarea
                                      autoFocus
                                      rows={3}
                                      value={editingField.value}
                                      onChange={e => setEditingField(prev => prev ? { ...prev, value: e.target.value } : null)}
                                      onKeyDown={e => { if (e.key === 'Escape') handleCancelFieldEdit(); }}
                                      className="flex-1 text-xs text-gray-900 border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                                      placeholder="내용을 입력하세요"
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editingField.value}
                                      onChange={e => setEditingField(prev => prev ? { ...prev, value: e.target.value } : null)}
                                      onKeyDown={e => { if (e.key === 'Enter') handleSaveField(); if (e.key === 'Escape') handleCancelFieldEdit(); }}
                                      className="flex-1 text-xs text-gray-900 border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                      placeholder="-"
                                    />
                                  )}
                                  <div className={`flex ${isTextArea ? 'flex-col' : ''} gap-1 shrink-0`}>
                                    <button onClick={handleSaveField} disabled={isSavingThis} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
                                      {isSavingThis ? '…' : '저장'}
                                    </button>
                                    <button onClick={handleCancelFieldEdit} disabled={isSavingThis} className="text-xs text-gray-500 px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-50">
                                      취소
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <span className={`flex-1 text-xs text-gray-900 font-medium ${isTextArea ? 'whitespace-pre-wrap break-words' : ''}`}>
                                    {displayValue !== '-' ? displayValue : <span className="text-gray-300">-</span>}
                                  </span>
                                  {canEdit && !editingField && (
                                    <button
                                      onClick={() => handleStartFieldEdit(field.fieldKey, field.sheetHeader, field.isLegacy)}
                                      className="text-xs text-blue-500 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50 shrink-0 transition-colors"
                                    >
                                      수정
                                    </button>
                                  )}
                                </>
                              )}
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
                  {isForeign ? 'Close' : '닫기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
