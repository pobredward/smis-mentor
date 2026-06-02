'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { searchStudents, groupStudentResults, StudentGroup } from '@/lib/stSheetService';
import { STSheetStudent } from '@smis-mentor/shared';
import {
  IoSearch, IoChevronDown, IoChevronUp, IoArrowBack,
  IoPerson, IoCalendar, IoHome, IoPeople, IoCall,
  IoMail, IoShirt, IoAirplane, IoCard, IoLocation,
  IoInformationCircle, IoMedical, IoDocumentText,
} from 'react-icons/io5';
import toast from 'react-hot-toast';

// ─── 유틸 ─────────────────────────────────────────────────

function formatCampLabel(campCode: string): string {
  const match = campCode.match(/^([A-Za-z]+)(\d+)(?:_(\d+))?$/);
  if (!match) return campCode;
  const [, type, gen, idx] = match;
  const label = `${gen}기 ${type}캠프`;
  return idx ? `${label} (${idx})` : label;
}

function campTypeBadgeClass(campCode: string): string {
  const type = campCode.replace(/\d.*/, '').toUpperCase();
  switch (type) {
    case 'S':  return 'bg-blue-100 text-blue-800';
    case 'E':
    case 'J':  return 'bg-green-100 text-green-800';
    case 'D':
    case 'G':
    case 'K':  return 'bg-orange-100 text-orange-800';
    case 'F':  return 'bg-pink-100 text-pink-800';
    default:   return 'bg-gray-100 text-gray-800';
  }
}

function GenderBadge({ gender }: { gender: string }) {
  const isMale = gender === 'M';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${isMale ? 'bg-blue-50 text-blue-700' : 'bg-pink-50 text-pink-700'}`}>
      {isMale ? '남' : '여'}
    </span>
  );
}

// 정보 행 하나 (아이콘 + 라벨 + 값)
function InfoRow({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | undefined | null;
  highlight?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={`flex items-start gap-1.5 text-xs ${highlight ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
      <span className="mt-0.5 text-gray-400 flex-shrink-0">{icon}</span>
      <span className="text-gray-400 flex-shrink-0 min-w-[52px]">{label}</span>
      <span className="break-all">{value}</span>
    </div>
  );
}

// 섹션 구분 박스
function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// 캠프별 상세 정보 패널
function CampDetail({ campCode, student }: { campCode: string; student: STSheetStudent }) {
  const syncDate = student.lastSyncedAt
    ? new Date(student.lastSyncedAt as unknown as string).toLocaleDateString('ko-KR')
    : null;

  return (
    <div className="px-4 py-4 bg-gray-50 space-y-4">
      {/* 캠프 헤더 */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${campTypeBadgeClass(campCode)}`}>
          {campCode}
        </span>
        <span className="text-sm font-semibold text-gray-800">{formatCampLabel(campCode)}</span>
      </div>

      {/* 반 / 배정 정보 */}
      <InfoSection title="반 · 배정">
        <InfoRow icon={<IoPeople className="w-3 h-3" />} label="반번호" value={student.classNumber} highlight />
        <InfoRow icon={<IoPeople className="w-3 h-3" />} label="반이름" value={student.className} highlight />
        <InfoRow icon={<IoPerson className="w-3 h-3" />} label="담임멘토" value={student.classMentor} highlight />
        <InfoRow icon={<IoPeople className="w-3 h-3" />} label="유닛" value={student.unit} />
        <InfoRow icon={<IoHome className="w-3 h-3" />} label="방호수" value={student.roomNumber} highlight />
        <InfoRow icon={<IoDocumentText className="w-3 h-3" />} label="등록처" value={student.registrationSource} />
      </InfoSection>

      {/* 여정 (E/J캠프 전용) */}
      {(student.departureRoute || student.arrivalRoute) && (
        <InfoSection title="여정">
          <InfoRow icon={<IoAirplane className="w-3 h-3" />} label="입소여정" value={student.departureRoute} />
          <InfoRow icon={<IoAirplane className="w-3 h-3" />} label="퇴소여정" value={student.arrivalRoute} />
        </InfoSection>
      )}

      {/* 여권 (S캠프 전용) */}
      {(student.passportName || student.passportNumber || student.passportExpiry || student.shirtSize) && (
        <InfoSection title="여권 · 단체티">
          <InfoRow icon={<IoCard className="w-3 h-3" />} label="여권 영문명" value={student.passportName} />
          <InfoRow icon={<IoCard className="w-3 h-3" />} label="여권번호" value={student.passportNumber} />
          <InfoRow icon={<IoCard className="w-3 h-3" />} label="여권만료일" value={student.passportExpiry} />
          <InfoRow icon={<IoShirt className="w-3 h-3" />} label="단체티" value={student.shirtSize} />
        </InfoSection>
      )}

      {/* 건강 / 특이사항 */}
      {(student.medication || student.notes) && (
        <InfoSection title="건강 · 특이사항">
          <InfoRow icon={<IoMedical className="w-3 h-3" />} label="복용약/알레르기" value={student.medication} />
          <InfoRow icon={<IoInformationCircle className="w-3 h-3" />} label="특이사항" value={student.notes} />
        </InfoSection>
      )}

      {/* 연락처 상세 */}
      {(student.otherPhone || student.otherName || student.email) && (
        <InfoSection title="추가 연락처">
          <InfoRow icon={<IoCall className="w-3 h-3" />} label="기타연락처" value={student.otherPhone} />
          <InfoRow icon={<IoPerson className="w-3 h-3" />} label="기타성함" value={student.otherName} />
          <InfoRow icon={<IoMail className="w-3 h-3" />} label="이메일" value={student.email} />
        </InfoSection>
      )}

      {/* 주소 */}
      {(student.region || student.address || student.addressDetail) && (
        <InfoSection title="주소">
          <InfoRow icon={<IoLocation className="w-3 h-3" />} label="지역" value={student.region} />
          <InfoRow icon={<IoLocation className="w-3 h-3" />} label="주소" value={student.address} />
          <InfoRow icon={<IoLocation className="w-3 h-3" />} label="세부주소" value={student.addressDetail} />
        </InfoSection>
      )}

      {/* 개인정보 (주민번호 마스킹) */}
      {student.ssn && (
        <InfoSection title="개인정보">
          <InfoRow
            icon={<IoCard className="w-3 h-3" />}
            label="주민번호"
            value={student.ssn.length >= 7
              ? `${student.ssn.slice(0, 6)}-${student.ssn.slice(6, 7)}******`
              : student.ssn}
          />
        </InfoSection>
      )}

      {/* 기타 */}
      {(student.etc || student.studentId) && (
        <InfoSection title="기타">
          {student.studentId && (
            <InfoRow icon={<IoDocumentText className="w-3 h-3" />} label="고유번호" value={student.studentId} />
          )}
          <InfoRow icon={<IoDocumentText className="w-3 h-3" />} label="기타" value={student.etc} />
        </InfoSection>
      )}

      {/* 동기화 메타 */}
      {syncDate && (
        <div className="text-[10px] text-gray-400 flex items-center gap-1 pt-1 border-t border-gray-200">
          <IoCalendar className="w-3 h-3" />
          <span>마지막 동기화: {syncDate}</span>
        </div>
      )}
    </div>
  );
}

// ─── 학생 카드 ──────────────────────────────────────────────

function StudentHistoryCard({ group }: { group: StudentGroup }) {
  const [expandedCamp, setExpandedCamp] = useState<string | null>(null);
  const [headerExpanded, setHeaderExpanded] = useState(false);

  const toggleCamp = (code: string) => {
    setExpandedCamp((prev) => (prev === code ? null : code));
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      {/* 학생 요약 헤더 */}
      <button
        className="w-full text-left px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
        onClick={() => setHeaderExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
            <IoPerson className="w-5 h-5 text-purple-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-base">{group.name}</span>
              <GenderBadge gender={group.gender} />
              <span className="text-xs text-gray-500 font-medium">{group.grade}</span>
              {group.parentName && (
                <span className="text-xs text-gray-400">보호자: {group.parentName}</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-0.5">
                <IoCall className="w-3 h-3" />{group.parentPhone}
              </span>
              {group.history[0]?.student.englishName && (
                <span className="text-gray-400">{group.history[0].student.englishName}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full whitespace-nowrap">
            {group.history.length}개 캠프
          </span>
          {headerExpanded
            ? <IoChevronUp className="w-4 h-4 text-gray-400" />
            : <IoChevronDown className="w-4 h-4 text-gray-400" />
          }
        </div>
      </button>

      {/* 확장: 캠프 목록 + 상세 */}
      {headerExpanded && (
        <div className="border-t border-gray-100">
          {/* 캠프 이력 탭 목록 */}
          <div className="flex flex-wrap gap-1.5 px-4 py-3 bg-white border-b border-gray-100">
            {group.history.map(({ campCode }) => (
              <button
                key={campCode}
                onClick={() => toggleCamp(campCode)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                  expandedCamp === campCode
                    ? 'border-purple-400 bg-purple-50 text-purple-700 shadow-sm'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {campCode}
              </button>
            ))}
          </div>

          {/* 선택한 캠프 상세 */}
          {expandedCamp && (() => {
            const found = group.history.find((h) => h.campCode === expandedCamp);
            return found ? (
              <CampDetail key={expandedCamp} campCode={found.campCode} student={found.student} />
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────

export function StudentSearchClient() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      toast.error('이름 또는 부모님 연락처를 입력해주세요.');
      inputRef.current?.focus();
      return;
    }
    if (trimmed.length < 2) {
      toast.error('2자 이상 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setHasSearched(false);
    try {
      const results = await searchStudents(trimmed);
      const grouped = groupStudentResults(results);
      setGroups(grouped);
      setHasSearched(true);
      if (grouped.length === 0) {
        toast('검색 결과가 없습니다.', { icon: '🔍' });
      }
    } catch {
      toast.error('검색 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="뒤로가기"
          >
            <IoArrowBack className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">학생 조회</h1>
        </div>

        {/* 검색 바 */}
        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <IoSearch className="h-5 w-5 text-gray-400" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="학생 이름 또는 부모님 연락처 입력"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
            />
          </div>
          <Button
            onClick={handleSearch}
            isLoading={isLoading}
            disabled={isLoading}
            className="px-5"
          >
            검색
          </Button>
        </div>

        {/* 안내 (첫 방문) */}
        {!hasSearched && !isLoading && (
          <div className="text-center py-16 text-gray-400">
            <IoSearch className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">이름 또는 부모님 연락처로 검색하면</p>
            <p className="text-sm">해당 학생의 캠프 참여 이력을 확인할 수 있습니다.</p>
          </div>
        )}

        {/* 로딩 */}
        {isLoading && (
          <div className="text-center py-16 text-gray-400">
            <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">모든 캠프 데이터를 검색하는 중...</p>
          </div>
        )}

        {/* 검색 결과 */}
        {hasSearched && !isLoading && (
          <>
            <p className="text-sm text-gray-500 mb-3">
              총 <span className="font-semibold text-gray-800">{groups.length}명</span>의 학생 찾음
              <span className="ml-2 text-gray-400">· 학생 카드를 클릭하면 캠프 이력을 볼 수 있습니다</span>
            </p>

            {groups.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm">검색 결과가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map((group) => (
                  <StudentHistoryCard key={group.key} group={group} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
