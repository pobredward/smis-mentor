'use client';
import { resolveActiveJobCodeId } from '@smis-mentor/shared';
import { logger, toDriveImageUrl, type STSheetFieldConfig } from '@smis-mentor/shared';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import StudentDetailModal from './StudentDetailModal';
import { stSheetService, jobCodesService, STSheetStudent, CampCode, CampType } from '@/lib/stSheetService';
import { authenticatedGet } from '@/lib/apiClient';
import { L, isEnglishUI } from '@smis-mentor/shared';


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
  const [fieldConfig, setFieldConfig] = useState<STSheetFieldConfig | null>(null);


  const activeJobCodeId = resolveActiveJobCodeId(userData); // 관리자 임시 캠프 포함
  const isAdmin = userData?.role === 'admin';

  // 학생 카드 클릭 — override 병합 후 모달 열기
  const handleSelectStudent = useCallback((student: STSheetStudent) => {
    setSelectedStudent(student);
  }, []);


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
      
      setStudents(data);
    } catch (error) {
      logger.error('❌ [RoomContent] 학생 목록 로드 실패:', error);
      alert(L('common.failedToLoadTheStudent'));
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
      alert(L('common.onlyAdministratorsCanSync'));
      return;
    }

    if (!campCode) {
      alert(L('common.loadingCampCode'));
      return;
    }

    try {
      setSyncing(true);
      await stSheetService.syncSTSheet(campCode);
      await loadAllStudents();
      alert(L('common.dataSyncComplete'));
    } catch (error) {
      logger.error('동기화 실패:', error);
      alert(L('common.syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  // 유닛멘토별로 그룹화 (unitMentor 없으면 '미분류')
  const groupedByMentor = useMemo(() => {
    return students.reduce((acc, student) => {
      const mentorKey = student.unitMentor || '미정';
      if (!acc[mentorKey]) acc[mentorKey] = [];
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

  // 멘토를 성별로 분류 ('미정'은 별도 처리)
  const mentorsByGender = useMemo(() => {
    return Object.keys(groupedByMentor).reduce((acc, mentor) => {
      if (mentor === '미정') return acc;
      const gender = getMentorGender(mentor);
      if (gender === 'M') {
        acc.male.push(mentor);
      } else if (gender === 'F') {
        acc.female.push(mentor);
      }
      return acc;
    }, { male: [] as string[], female: [] as string[] });
  }, [groupedByMentor, getMentorGender]);

  // 검색 필터링 (한글 이름 + 영어 이름 모두 검색)
  const displayStudents = searchQuery.trim()
    ? students.filter(student => {
        const q = searchQuery.trim();
        return student.name?.includes(q) || student.englishName?.toLowerCase().includes(q.toLowerCase());
      }).sort((a, b) => (a.roomNumber || '').localeCompare(b.roomNumber || ''))
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

  // 첫 번째 멘토 자동 선택 ('미정' 포함)
  useEffect(() => {
    const hasUnclassified = !!groupedByMentor['미정'];
    const allMentors = [
      ...mentorsByGender.male.sort(),
      ...mentorsByGender.female.sort(),
      ...(hasUnclassified ? ['미정'] : []),
    ];
    if (allMentors.length > 0 && !selectedMentor && !searchQuery.trim()) {
      setSelectedMentor(allMentors[0]);
    }
  }, [mentorsByGender.male.length, mentorsByGender.female.length, groupedByMentor, selectedMentor, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">{L('lodging.loadingRoomRoster')}</p>
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
        <p className="text-center">{L('common.pleaseSignInToContinue')}</p>
      </div>
    );
  }

  if (!activeJobCodeId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{L('common.noActiveCampSelected')}</h3>
        {isEnglishUI() ? (
          <>
            <p className="text-sm text-gray-600">Activate a camp on My Page to</p>
            <p className="text-sm text-gray-600">view the room roster for that camp.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600">{L('common.activateYourCampOnMy')}</p>
            <p className="text-sm text-gray-600">{L('lodging.toViewThatCampS')}</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">{L('common.roomRoster')}</h1>
        <div className="flex items-center gap-2">
          {isSearchExpanded ? (
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={L('common.searchByNameKrEn')}
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
                {syncing ? L('students.syncing') : L('students.sync')}
              </button>
            </>
          )}
        </div>
      </div>

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

          {/* 미정 (유닛멘토 없는 학생) */}
          {groupedByMentor['미정'] && (
            <div className="overflow-x-auto">
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedMentor('미정')}
                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    selectedMentor === '미정'
                      ? 'bg-gray-500 text-white'
                      : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                  }`}
                >
                  <span>{L('lodging.tbd')}</span>
                  <span className={`text-[10px] font-normal ${selectedMentor === '미정' ? 'text-gray-200' : 'text-gray-400'}`}>
                    {groupedByMentor['미정'].length}{L('common.people2')}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 검색 결과 안내 */}
      {searchQuery.trim() && (
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <p className="text-sm text-gray-600">
            {L('common.searchResultsForV0V1', { v0: searchQuery, v1: displayStudents.length })}
          </p>
        </div>
      )}

      {/* 학생 목록 - 호수별 그룹화, 4열 그리드 (모바일 최적화) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayStudents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">{L('common.pleaseSelectAUnit')}</p>
          </div>
        ) : (
          roomGroups.map(([roomNumber, students], roomIdx) => (
            <div key={`room-${roomNumber}-${roomIdx}`} className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-bold text-gray-700 mb-3">{L('lodging.roomV0', { v0: roomNumber })}</h3>
              <div className="grid grid-cols-4 gap-1">
                {students.map((student, studentIdx) => {
                  const gradeNum = student.grade?.replace(/[^0-9]/g, '') ?? '';
                  const gradePrefix = student.grade?.replace(/[0-9].*/g, '') ?? 'G';
                  const gradeBadge = gradeNum ? `${gradePrefix}${gradeNum}${student.gender === 'M' ? 'M' : 'F'}` : '';
                  return (
                  <button
                    key={student.studentId ? `${student.studentId}-${roomNumber}` : `${roomIdx}-${studentIdx}`}
                    onClick={() => handleSelectStudent(student)}
                    className="bg-white rounded-lg overflow-hidden border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left"
                  >
                    {/* 프로필 사진 */}
                    {(() => {
                      const photoUrl = toDriveImageUrl(student.profilePhoto);
                      return photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={student.name}
                          className="w-full aspect-square object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null;
                    })()}
                    <div
                      className={`w-full aspect-square flex items-center justify-center ${toDriveImageUrl(student.profilePhoto) ? 'hidden' : ''}`}
                      style={{ backgroundColor: student.gender === 'M' ? '#dbeafe' : '#fef9c3' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
                        className="w-1/2 h-1/2"
                        style={{ color: student.gender === 'M' ? '#93c5fd' : '#fcd34d' }}
                      >
                        <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
                      </svg>
                    </div>

                    <div className="px-2 pt-1.5 pb-2">
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
                        {L('common.class')}:{student.classMentor || '-'}{student.className ? L('common.class2', { v0: student.className }) : ''}
                      </p>
                      <p className="truncate text-[8px]">
                        {L('common.room')}:{student.unitMentor || '-'}{student.roomNumber ? L('common.room2', { v0: student.roomNumber }) : ''}
                      </p>
                    </div>
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
        <StudentDetailModal
          students={roomGroups.flatMap(([, list]) => list)}
          initialStudentId={selectedStudent.studentId}
          onClose={() => setSelectedStudent(null)}
          campCode={campCode}
          campType={campType}
          fieldConfig={fieldConfig}
        />
      )}
    </div>
  );
}
