'use client';
import { resolveActiveJobCodeId } from '@smis-mentor/shared';
import { logger, toDriveImageUrl, type STSheetFieldConfig } from '@smis-mentor/shared';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import StudentDetailModal from './StudentDetailModal';
import { stSheetService, jobCodesService, STSheetStudent, CampCode, CampType } from '@/lib/stSheetService';
import { authenticatedGet } from '@/lib/apiClient';
import { L, isEnglishUI } from '@smis-mentor/shared';

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
  // 동적 필드 설정
  const [fieldConfig, setFieldConfig] = useState<STSheetFieldConfig | null>(null);


  const activeJobCodeId = resolveActiveJobCodeId(userData); // 관리자 임시 캠프 포함
  const isAdmin = userData?.role === 'admin';

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
      logger.info('📥 [ClassContent] 학생 데이터 로딩 시작...', { campCode });
      const data = await stSheetService.getCachedData(campCode);
      logger.info('📊 [ClassContent] 로드된 학생 수:', data.length);
      
      // 처음 몇 명의 프로필사진 정보 출력
      const studentsWithPhotos = data.filter(s => s.profilePhoto);
      logger.info('📸 [ClassContent] 프로필사진 있는 학생:', studentsWithPhotos.length);
      if (studentsWithPhotos.length > 0) {
        logger.info('📸 [ClassContent] 프로필사진 샘플:', studentsWithPhotos.slice(0, 3).map(s => ({
          name: s.name,
          profilePhoto: s.profilePhoto,
          photoLength: s.profilePhoto?.length
        })));
      }
      
      setStudents(data);
    } catch (error) {
      logger.error('❌ [ClassContent] 학생 목록 로드 실패:', error);
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

  // 반별로 그룹화 + 담당 멘토 추출
  const groupedByClass = useMemo(() => {
    return students.reduce((acc, student) => {
      const classPrefix = student.classNumber?.substring(0, 3) || '';
      const key = classPrefix || '미정';
      if (!acc[key]) acc[key] = [];
      acc[key].push(student);
      return acc;
    }, {} as Record<string, STSheetStudent[]>);
  }, [students]);

  // 각 반의 담당 멘토 이름 추출
  const classMentorMap = useMemo(() => {
    const map: Record<string, string> = {};
    Object.keys(groupedByClass).forEach(classKey => {
      const studentsInClass = groupedByClass[classKey];
      // 첫 번째 학생의 classMentor 사용 (같은 반은 같은 멘토)
      const mentorName = studentsInClass[0]?.classMentor || '';
      map[classKey] = mentorName;
    });
    return map;
  }, [groupedByClass]);

  // '미정'은 항상 맨 뒤에
  const sortedClasses = useMemo(() => {
    const keys = Object.keys(groupedByClass);
    return [...keys.filter(k => k !== '미정').sort(), ...keys.filter(k => k === '미정')];
  }, [groupedByClass]);

  // 검색 필터링 (한글 이름 + 영어 이름 모두 검색)
  const displayStudents = searchQuery.trim()
    ? students.filter(student => {
        const q = searchQuery.trim();
        return student.name?.includes(q) || student.englishName?.toLowerCase().includes(q.toLowerCase());
      }).sort((a, b) => (a.classNumber || '').localeCompare(b.classNumber || ''))
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
          <p className="text-sm text-gray-600">{L('students.loadingClassRoster')}</p>
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
            <p className="text-sm text-gray-600">view the class roster for that camp.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600">{L('common.activateYourCampOnMy')}</p>
            <p className="text-sm text-gray-600">{L('students.toViewThatCampS2')}</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">{L('students.classRoster')}</h1>
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

      {/* 반 토글 */}
      {!searchQuery.trim() && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 overflow-x-auto">
          <div className="flex gap-2">
            {sortedClasses.map(classKey => {
              const isUnclassified = classKey === '미정';
              const isSelected = selectedClass === classKey;
              return (
                <button
                  key={classKey}
                  onClick={() => setSelectedClass(classKey)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex flex-col items-center ${
                    isSelected
                      ? isUnclassified ? 'bg-gray-500 text-white' : 'bg-blue-600 text-white'
                      : isUnclassified ? 'bg-gray-200 text-gray-500 hover:bg-gray-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>{isEnglishUI() && isUnclassified ? 'TBD' : classKey}</span>
                  {isUnclassified ? (
                    <span className={`text-[10px] font-normal mt-0.5 ${isSelected ? 'text-gray-200' : 'text-gray-400'}`}>
                      {groupedByClass[classKey].length}{L('common.people2')}
                    </span>
                  ) : !isUnclassified && classMentorMap[classKey] ? (
                    <span className={`text-[10px] font-normal mt-0.5 ${isSelected ? 'text-blue-100' : 'text-gray-500'}`}>
                      {classMentorMap[classKey]}
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
          <p className="text-sm text-gray-600">
            {L('common.searchResultsForV0V1', { v0: searchQuery, v1: displayStudents.length })}
          </p>
        </div>
      )}

      {/* 학생 목록 - 4열 그리드 (모바일 최적화) */}
      <div className="flex-1 overflow-y-auto p-4">
        {students.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium text-gray-600">
              {L('students.noRealDataAvailable')}
            </p>
            <p className="text-xs text-gray-400">
              {L('students.syncTheStSheetOr')}
            </p>
          </div>
        ) : displayStudents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">{L('students.pleaseSelectAClass')}</p>
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
        )}
      </div>

      {/* 학생 상세 모달 */}
      {selectedStudent && (
        <StudentDetailModal
          students={displayStudents}
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
