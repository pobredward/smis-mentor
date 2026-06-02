'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/common/Layout';
import {
  loadAllStudentRecords,
  filterStudents,
  groupStudentResults,
  StudentGroup,
  StudentHistoryResult,
} from '@/lib/stSheetService';
import { STSheetStudent, FamilyUnit } from '@smis-mentor/shared';
import {
  IoSearch, IoArrowBack,
  IoPerson, IoCalendar, IoHome, IoPeople, IoCall,
  IoMail, IoShirt, IoAirplane, IoCard, IoLocation,
  IoInformationCircle, IoMedical, IoDocumentText,
} from 'react-icons/io5';

// ─── 유틸 ─────────────────────────────────────────────────

/**
 * Google Drive 공유 링크를 <img>에서 직접 로드 가능한 썸네일 URL로 변환.
 * 형식: https://drive.google.com/file/d/{ID}/view... → https://lh3.googleusercontent.com/d/{ID}
 * /uc?export=view 는 리다이렉트가 많아 브라우저에서 막히는 경우가 있어 lh3 방식 사용.
 */
function toDriveImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/\/file\/d\/([^/]+)/);
  if (!match) return url;
  return `https://lh3.googleusercontent.com/d/${match[1]}`;
}

// 이미지 전체화면 모달
function PhotoModal({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          className="w-full rounded-2xl shadow-2xl object-cover"
        />
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors"
          aria-label="닫기"
        >
          <span className="text-sm font-bold">✕</span>
        </button>
        <p className="mt-2 text-center text-white text-sm font-semibold drop-shadow">{name}</p>
      </div>
    </div>
  );
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
      {/* 기본 정보 (그 당시 학년/성별/영문명) */}
      <InfoSection title="기본 정보">
        <InfoRow icon={<IoPerson className="w-3 h-3" />} label="학년" value={student.grade} highlight />
        <InfoRow icon={<IoPerson className="w-3 h-3" />} label="성별" value={student.gender === 'M' ? '남' : student.gender === 'F' ? '여' : student.gender} />
        {student.englishName && (
          <InfoRow icon={<IoPerson className="w-3 h-3" />} label="영문명" value={student.englishName} />
        )}
      </InfoSection>

      {/* 반 / 배정 정보 */}
      <InfoSection title="반 · 배정">
        <InfoRow icon={<IoPeople className="w-3 h-3" />} label="반번호"   value={student.classNumber} highlight />
        <InfoRow icon={<IoPeople className="w-3 h-3" />} label="반이름"   value={student.className} highlight />
        <InfoRow icon={<IoPerson className="w-3 h-3" />} label="담임멘토" value={student.classMentor} highlight />
        <InfoRow icon={<IoPeople className="w-3 h-3" />} label="유닛"     value={student.unit} />
        <InfoRow icon={<IoPerson className="w-3 h-3" />} label="유닛멘토" value={student.unitMentor} />
        <InfoRow icon={<IoHome className="w-3 h-3" />}   label="방호수"   value={student.roomNumber} highlight />
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
      {(student.parentPhone || student.parentName || student.otherPhone || student.otherName || student.email) && (
        <InfoSection title="추가 연락처">
          <InfoRow icon={<IoPerson className="w-3 h-3" />} label="보호자"     value={student.parentName} highlight />
          <InfoRow icon={<IoCall className="w-3 h-3" />}   label="보호자 연락처" value={student.parentPhone} />
          <InfoRow icon={<IoPerson className="w-3 h-3" />} label="기타 보호자" value={student.otherName} />
          <InfoRow icon={<IoCall className="w-3 h-3" />}   label="기타 연락처" value={student.otherPhone} />
          <InfoRow icon={<IoMail className="w-3 h-3" />}   label="이메일"     value={student.email} />
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

// ─── F캠프 전용 상세 패널 ────────────────────────────────────

function FamilyCampDetail({ campCode, family, studentId }: {
  campCode: string;
  family: FamilyUnit;
  studentId?: string;
}) {
  const syncDate = family.lastSyncedAt
    ? new Date(family.lastSyncedAt as unknown as string).toLocaleDateString('ko-KR')
    : null;

  const thisStudent = family.students.find((s) => s.id === studentId) ?? family.students[0];

  return (
    <div className="px-4 py-4 bg-pink-50 space-y-4">
      {/* 가족 기본 */}
      <InfoSection title="가족 정보">
        <InfoRow icon={<IoPeople className="w-3 h-3" />} label="가족번호" value={`#${family.familyId}`} highlight />
        <InfoRow icon={<IoPeople className="w-3 h-3" />} label="가족유형" value={family.familyType} highlight />
        <InfoRow icon={<IoHome className="w-3 h-3" />}   label="방호수"   value={family.roomNumber || '-'} highlight />
      </InfoSection>

      {/* 보호자 */}
      {family.parents.map((p, idx) => (
        <InfoSection key={p.id} title={family.parents.length > 1 ? `보호자 ${idx + 1}` : '보호자'}>
          <InfoRow icon={<IoPerson className="w-3 h-3" />} label="성함"   value={p.name} highlight />
          <InfoRow icon={<IoCall className="w-3 h-3" />}   label="연락처" value={p.phone} />
          <InfoRow icon={<IoLocation className="w-3 h-3" />} label="지역" value={p.region} />
          <InfoRow icon={<IoMail className="w-3 h-3" />}   label="이메일" value={p.email} />
          <InfoRow icon={<IoCard className="w-3 h-3" />}   label="여권이름" value={p.passportName} />
          <InfoRow icon={<IoCard className="w-3 h-3" />}   label="여권번호" value={p.passportNumber} />
          <InfoRow icon={<IoCard className="w-3 h-3" />}   label="주민번호" value={
            p.ssn ? (p.ssn.length >= 7 ? `${p.ssn.slice(0, 6)}-${p.ssn.slice(6, 7)}******` : p.ssn) : undefined
          } />
        </InfoSection>
      ))}

      {/* 해당 학생 */}
      {thisStudent && (
        <InfoSection title="학생 정보">
          <InfoRow icon={<IoPerson className="w-3 h-3" />}       label="이름"   value={thisStudent.name} highlight />
          <InfoRow icon={<IoPerson className="w-3 h-3" />}       label="학년/성별" value={`${thisStudent.grade} · ${thisStudent.gender === 'M' ? '남' : '여'}`} />
          <InfoRow icon={<IoCard className="w-3 h-3" />}         label="여권이름" value={thisStudent.passportName} />
          <InfoRow icon={<IoCard className="w-3 h-3" />}         label="여권번호" value={thisStudent.passportNumber} />
          <InfoRow icon={<IoMedical className="w-3 h-3" />}      label="건강정보" value={thisStudent.medication} />
          <InfoRow icon={<IoDocumentText className="w-3 h-3" />} label="등록처"  value={thisStudent.registrationSource} />
          <InfoRow icon={<IoCard className="w-3 h-3" />}         label="주민번호" value={
            thisStudent.ssn
              ? (thisStudent.ssn.length >= 7 ? `${thisStudent.ssn.slice(0, 6)}-${thisStudent.ssn.slice(6, 7)}******` : thisStudent.ssn)
              : undefined
          } />
        </InfoSection>
      )}

      {/* 형제자매 */}
      {family.students.length > 1 && (
        <InfoSection title="형제자매">
          {family.students
            .filter((s) => s.id !== thisStudent?.id)
            .map((s) => (
              <InfoRow
                key={s.id}
                icon={<IoPerson className="w-3 h-3" />}
                label={s.grade}
                value={`${s.name}${s.englishName ? ` (${s.englishName})` : ''}`}
              />
            ))}
        </InfoSection>
      )}

      {syncDate && (
        <div className="text-[10px] text-gray-400 flex items-center gap-1 pt-1 border-t border-pink-200">
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
  const [photoOpen, setPhotoOpen] = useState(false);

  const toggleCamp = (code: string) => {
    setExpandedCamp((prev) => (prev === code ? null : code));
  };

  // 캠프 이력 중 가장 최신 프로필 사진 사용 (Drive URL → 임베드 가능 URL 변환)
  const profilePhoto = toDriveImageUrl(
    group.history.find((h) => h.student.profilePhoto)?.student.profilePhoto
  );
  const closePhoto = useCallback(() => setPhotoOpen(false), []);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      {/* 프로필 사진 모달 */}
      {photoOpen && profilePhoto && (
        <PhotoModal src={profilePhoto} name={group.name} onClose={closePhoto} />
      )}

      {/* 학생 요약 — 항상 표시 */}
      <div className="px-4 pt-3.5 pb-2 flex items-center gap-3">
        {/* 아바타 (클릭 시 크게 보기) */}
        <div
          className={`flex-shrink-0 w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center overflow-hidden ${profilePhoto ? 'cursor-pointer ring-2 ring-transparent hover:ring-purple-400 transition-all' : ''}`}
          onClick={() => profilePhoto && setPhotoOpen(true)}
          role={profilePhoto ? 'button' : undefined}
          aria-label={profilePhoto ? `${group.name} 사진 크게 보기` : undefined}
        >
          {profilePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profilePhoto}
              alt={group.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                (e.currentTarget.parentElement as HTMLElement).innerHTML =
                  '<svg class="w-6 h-6 text-purple-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>';
              }}
            />
          ) : (
            <IoPerson className="w-7 h-7 text-purple-600" />
          )}
        </div>

        {/* 이름 / 나이 / 연락처 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-base">{group.name}</span>
            <GenderBadge gender={group.gender} />
            {group.age !== null && (
              <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                {group.age}세
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-gray-500 flex items-center gap-1">
            <IoCall className="w-3 h-3 flex-shrink-0" />
            {group.parentPhone}
          </div>
        </div>

        {/* 캠프 수 뱃지 */}
        <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0">
          {group.history.length}개 캠프
        </span>
      </div>

      {/* 캠프 코드 탭 — 항상 표시 */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {group.history.map(({ campCode, isFamily }) => (
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
            {isFamily && (
              <span className="ml-1 text-[9px] text-pink-500">가족</span>
            )}
          </button>
        ))}
      </div>

      {/* 선택한 캠프 상세 */}
      {expandedCamp && (() => {
        const found = group.history.find((h) => h.campCode === expandedCamp);
        if (!found) return null;
        return found.isFamily && found.familyUnit ? (
          <FamilyCampDetail
            key={expandedCamp}
            campCode={found.campCode}
            family={found.familyUnit}
            studentId={found.student.studentId}
          />
        ) : (
          <CampDetail key={expandedCamp} campCode={found.campCode} student={found.student} />
        );
      })()}
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────

const DEBOUNCE_MS = 200;
const MIN_QUERY_LEN = 2;

export function StudentSearchClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // 페이지 진입 시 1회 전체 로드
  const [allRecords, setAllRecords] = useState<StudentHistoryResult[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    loadAllStudentRecords()
      .then((records) => setAllRecords(records))
      .catch(() => setLoadError(true))
      .finally(() => setIsLoadingData(false));
  }, []);

  // 입력값 & debounce된 검색어
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // 클라이언트 사이드 필터링 (Firestore 호출 없음)
  const groups = useMemo<StudentGroup[]>(() => {
    if (debouncedQuery.trim().length < MIN_QUERY_LEN) return [];
    const filtered = filterStudents(allRecords, debouncedQuery);
    return groupStudentResults(filtered);
  }, [allRecords, debouncedQuery]);

  const isSearching = query.trim().length >= MIN_QUERY_LEN && query !== debouncedQuery;
  const hasQuery = debouncedQuery.trim().length >= MIN_QUERY_LEN;

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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">학생 조회</h1>
            {/* 데이터 로드 상태 */}
            {isLoadingData && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <span className="w-3 h-3 border border-gray-300 border-t-purple-400 rounded-full animate-spin inline-block" />
                데이터 로딩 중...
              </span>
            )}
            {!isLoadingData && !loadError && (
              <span className="text-xs text-gray-400">
                {allRecords.length.toLocaleString()}건 로드됨
              </span>
            )}
            {loadError && (
              <span className="text-xs text-red-400">데이터 로드 실패</span>
            )}
          </div>
        </div>

        {/* 검색 바 */}
        <div className="relative mb-6">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {isSearching
              ? <span className="w-4 h-4 border-2 border-gray-300 border-t-purple-400 rounded-full animate-spin" />
              : <IoSearch className="h-5 w-5 text-gray-400" />
            }
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="학생 이름 또는 부모님 연락처 입력"
            disabled={isLoadingData}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
              aria-label="지우기"
            >
              <span className="text-sm">✕</span>
            </button>
          )}
        </div>

        {/* 안내 (초기) */}
        {!hasQuery && !isLoadingData && (
          <div className="text-center py-16 text-gray-400">
            <IoSearch className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">이름 또는 부모님 연락처 2자 이상 입력 시</p>
            <p className="text-sm">캠프 참여 이력이 바로 표시됩니다.</p>
          </div>
        )}

        {/* 초기 로딩 */}
        {isLoadingData && (
          <div className="text-center py-16 text-gray-400">
            <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">전체 캠프 데이터를 불러오는 중...</p>
            <p className="text-xs mt-1 opacity-60">로드 후 실시간 검색이 시작됩니다</p>
          </div>
        )}

        {/* 검색 결과 */}
        {hasQuery && !isLoadingData && (
          <>
            <p className="text-sm text-gray-500 mb-3">
              총 <span className="font-semibold text-gray-800">{groups.length}명</span>의 학생 찾음
              <span className="ml-2 text-gray-400">· 카드를 클릭하면 캠프 이력을 볼 수 있습니다</span>
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
