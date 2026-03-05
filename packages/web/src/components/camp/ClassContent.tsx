'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { stSheetService, jobCodesService, STSheetStudent, CampCode, CampType } from '@/lib/stSheetService';

export default function ClassContent() {
  const { userData } = useAuth();
  const [students, setStudents] = useState<STSheetStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<STSheetStudent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [campCode, setCampCode] = useState<CampCode>('E27');
  const [campType, setCampType] = useState<CampType>('EJ');

  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;
  const isAdmin = userData?.role === 'admin';

  useEffect(() => {
    const loadCampCode = async () => {
      if (!activeJobCodeId || typeof activeJobCodeId !== 'string') {
        setCampCode('E27');
        setCampType(stSheetService.getCampType('E27'));
        return;
      }
      
      try {
        const jobCodes = await jobCodesService.getJobCodesByIds([activeJobCodeId]);
        if (jobCodes.length > 0 && jobCodes[0].code) {
          const code = jobCodes[0].code as CampCode;
          setCampCode(code);
          setCampType(stSheetService.getCampType(code));
        } else {
          setCampCode('E27');
          setCampType(stSheetService.getCampType('E27'));
        }
      } catch (error) {
        console.error('캠프 코드 로드 실패:', error);
        setCampCode('E27');
        setCampType(stSheetService.getCampType('E27'));
      }
    };
    
    loadCampCode();
  }, [activeJobCodeId]);

  const loadAllStudents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await stSheetService.getCachedData(campCode);
      setStudents(data);
    } catch (error) {
      console.error('학생 목록 로드 실패:', error);
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

  // 반별로 그룹화
  const groupedByClass = students.reduce((acc, student) => {
    const classPrefix = student.classNumber?.substring(0, 3) || '';
    if (!classPrefix) return acc;
    
    if (!acc[classPrefix]) {
      acc[classPrefix] = [];
    }
    acc[classPrefix].push(student);
    return acc;
  }, {} as Record<string, STSheetStudent[]>);

  // 검색 필터링
  const displayStudents = searchQuery.trim()
    ? students.filter(student => student.name?.includes(searchQuery.trim())).sort((a, b) => (a.classNumber || '').localeCompare(b.classNumber || ''))
    : selectedClass
    ? (groupedByClass[selectedClass] || []).sort((a, b) => (a.classNumber || '').localeCompare(b.classNumber || ''))
    : [];

  const sortedClasses = Object.keys(groupedByClass).sort();

  // 첫 번째 반 자동 선택
  useEffect(() => {
    if (sortedClasses.length > 0 && !selectedClass) {
      setSelectedClass(sortedClasses[0]);
    }
  }, [students]);

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
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {syncing ? '동기화 중...' : '동기화'}
            </button>
          )}
        </div>
      </div>

      {/* 반 토글 */}
      {!searchQuery.trim() && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 overflow-x-auto">
          <div className="flex gap-2">
            {sortedClasses.map(classKey => (
              <button
                key={classKey}
                onClick={() => setSelectedClass(classKey)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
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

      {/* 학생 목록 - 4열 그리드 */}
      <div className="flex-1 overflow-y-auto p-4">
        {displayStudents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">반을 선택해주세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {displayStudents.map(student => (
              <button
                key={student.studentId}
                onClick={() => setSelectedStudent(student)}
                className="bg-white rounded-lg p-3 border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className={`text-base font-bold truncate ${
                    student.gender === 'M' ? 'text-blue-600' : 'text-yellow-600'
                  }`}>
                    {student.name}
                  </h3>
                  <span className="text-xs text-gray-900 font-medium ml-1 flex-shrink-0">
                    {student.classNumber || '-'}
                  </span>
                </div>
                
                <div className="h-px bg-gray-200 my-2"></div>
                
                <div className="space-y-0.5 text-xs text-gray-600">
                  <p className="truncate">{student.englishName || '-'}</p>
                  <p>
                    <span>{student.gender === 'M' ? '남' : '여'}</span>
                    <span className="mx-1">•</span>
                    <span>{student.grade}</span>
                  </p>
                  <p className="truncate text-[11px]">반: {student.classMentor || '-'}</p>
                  <p className="truncate text-[11px]">유닛: {student.unitMentor || '-'}</p>
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
              <h3 className="text-xl font-bold text-gray-900">{selectedStudent.name}</h3>
              <button
                onClick={() => setSelectedStudent(null)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
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
                      <span className="flex-[2] text-xs text-gray-900 font-medium">{selectedStudent.ssn}</span>
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
