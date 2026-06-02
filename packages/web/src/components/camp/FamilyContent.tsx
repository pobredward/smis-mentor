'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { stSheetService, jobCodesService, CampCode, FamilyUnit } from '@/lib/stSheetService';
import { logger } from '@smis-mentor/shared';

// ── 유틸 ─────────────────────────────────────────────────────────────────────

const FAMILY_TYPE_STYLE: Record<string, {
  cardBg: string; cardBorder: string;
  badgeBg: string; badgeText: string;
  sectionBg: string; sectionText: string;
}> = {
  '2인 가족': {
    cardBg: 'bg-white', cardBorder: 'border-gray-200',
    badgeBg: 'bg-blue-500', badgeText: 'text-white',
    sectionBg: 'bg-blue-500', sectionText: 'text-white',
  },
  '3인 가족': {
    cardBg: 'bg-white', cardBorder: 'border-gray-200',
    badgeBg: 'bg-emerald-500', badgeText: 'text-white',
    sectionBg: 'bg-emerald-500', sectionText: 'text-white',
  },
  '4인 가족': {
    cardBg: 'bg-white', cardBorder: 'border-gray-200',
    badgeBg: 'bg-amber-500', badgeText: 'text-white',
    sectionBg: 'bg-amber-500', sectionText: 'text-white',
  },
  '5인 가족': {
    cardBg: 'bg-white', cardBorder: 'border-gray-200',
    badgeBg: 'bg-rose-500', badgeText: 'text-white',
    sectionBg: 'bg-rose-500', sectionText: 'text-white',
  },
};

const DEFAULT_STYLE = {
  cardBg: 'bg-white', cardBorder: 'border-gray-200',
  badgeBg: 'bg-gray-500', badgeText: 'text-white',
  sectionBg: 'bg-gray-500', sectionText: 'text-white',
};

// 가족 유형 정렬 순서
const FAMILY_TYPE_ORDER = ['2인 가족', '3인 가족', '4인 가족', '5인 가족'];

function Row({ label, value, wide }: { label: string; value?: string; wide?: boolean }) {
  if (!value) return null;
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? 'col-span-2' : ''}`}>
      <span className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-xs text-gray-800 break-words">{value}</span>
    </div>
  );
}

// ── 가족 카드 ────────────────────────────────────────────────────────────────

interface FamilyCardProps {
  family: FamilyUnit;
  isAdmin: boolean;
}

function FamilyCard({ family, isAdmin }: FamilyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const style = FAMILY_TYPE_STYLE[family.familyType] ?? DEFAULT_STYLE;

  const maskSSN = (ssn?: string) => {
    if (!ssn) return undefined;
    if (isAdmin) return ssn;
    const parts = ssn.split('-');
    if (parts.length !== 2) return ssn;
    return `${parts[0]}-${parts[1][0]}${'*'.repeat(parts[1].length - 1)}`;
  };

  // 부모 이름 전원
  const parentNames = family.parents.map(p => p.name).join(' · ');
  // 학생 이름 전원 (학년 포함)
  const studentNames = family.students
    .map(s => `${s.name}${s.grade ? `(${s.grade})` : ''}`)
    .join(' · ');
  // 방호수
  const roomDisplay = family.roomNumber || '-';

  return (
    <div className={`rounded-xl border ${style.cardBorder} ${style.cardBg} overflow-hidden`}>
      {/* 카드 헤더 */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:brightness-95 transition-all"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        {/* 번호 배지 */}
        <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-lg ${style.badgeBg} ${style.badgeText}`}>
          #{family.familyId}
        </span>

        {/* 이름 요약 */}
        <div className="flex-1 min-w-0 space-y-0.5">
          {/* 부모 이름 전원 */}
          <p className="text-xs font-semibold text-gray-800 truncate">{parentNames || '–'}</p>
          {/* 학생 이름 전원 */}
          {studentNames && (
            <p className="text-xs text-gray-500 truncate">{studentNames}</p>
          )}
        </div>

        {/* 방호수 */}
        <span className="shrink-0 text-xs font-medium text-gray-600 bg-white/70 border border-gray-200 rounded px-2 py-0.5">
          {roomDisplay}호
        </span>

        {/* 화살표 */}
        <svg
          className={`shrink-0 w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 상세 */}
      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {/* 부모 */}
          {family.parents.map((parent, idx) => (
            <div key={parent.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                  부모{family.parents.length > 1 ? ` ${idx + 1}` : ''}
                </span>
                <span className="text-sm font-bold text-gray-800">{parent.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Row label="연락처"    value={parent.phone} />
                <Row label="지역"      value={parent.region} />
                <Row label="원어민수업" value={
                  parent.nativeEnglish && parent.nativeEnglish !== '신청 X' && parent.nativeEnglish !== '-'
                    ? parent.nativeEnglish : undefined
                } />
                <Row label="이메일"    value={parent.email} />
                {isAdmin && <Row label="주민번호" value={maskSSN(parent.ssn)} />}
                <Row label="여권이름"  value={parent.passportName} />
                <Row label="여권번호"  value={parent.passportNumber} />
                <Row label="여권만료"  value={parent.passportExpiry !== '0000.00.00' ? parent.passportExpiry : undefined} />
                <Row label="방호수"    value={parent.roomNumber} />
                <Row label="주소"      value={parent.address}  wide />
                <Row label="기타"      value={parent.notes}    wide />
              </div>
            </div>
          ))}

          {/* 학생 */}
          {family.students.map((student, idx) => (
            <div key={student.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  student.gender === 'M' ? 'bg-sky-100 text-sky-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  학생{family.students.length > 1 ? ` ${idx + 1}` : ''}
                </span>
                <span className={`text-sm font-bold ${student.gender === 'M' ? 'text-sky-700' : 'text-amber-600'}`}>
                  {student.name}
                </span>
                {student.englishName && (
                  <span className="text-xs text-gray-500">({student.englishName})</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Row label="학년/성별" value={`${student.grade} · ${student.gender === 'M' ? '남' : '여'}`} />
                <Row label="학생ID"   value={student.id} />
                <Row label="부모연락처" value={student.parentPhone} />
                <Row label="등록처"   value={student.registrationSource} />
                {isAdmin && <Row label="주민번호"  value={maskSSN(student.ssn)} />}
                <Row label="여권이름"  value={student.passportName} />
                <Row label="여권번호"  value={student.passportNumber} />
                <Row label="여권만료"  value={student.passportExpiry !== '0000.00.00' ? student.passportExpiry : undefined} />
                <Row label="건강정보"  value={student.medication} wide />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function FamilyContent() {
  const { userData } = useAuth();
  const [families, setFamilies] = useState<FamilyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [campCode, setCampCode] = useState<CampCode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  const isAdmin = userData?.role === 'admin';
  const activeJobCodeId = userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;

  // 캠프 코드 로드
  useEffect(() => {
    if (!activeJobCodeId) { setLoading(false); return; }
    jobCodesService.getJobCodesByIds([activeJobCodeId]).then(codes => {
      if (codes.length > 0 && codes[0].code) {
        setCampCode(codes[0].code as CampCode);
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, [activeJobCodeId]);

  // 가족 데이터 로드
  const loadFamilies = useCallback(async () => {
    if (!campCode) return;
    try {
      setLoading(true);
      const data = await stSheetService.getCachedFamilies(campCode);
      logger.info(`[FamilyContent] ${campCode} 가족 ${data.length}팀 로드`);
      setFamilies(data);
    } catch (err) {
      logger.error('[FamilyContent] 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [campCode]);

  useEffect(() => { if (campCode) loadFamilies(); }, [campCode, loadFamilies]);

  // 동기화
  const handleSync = async () => {
    if (!isAdmin) { alert('동기화는 관리자만 수행할 수 있습니다.'); return; }
    if (!campCode) { alert('캠프 코드를 불러오는 중입니다.'); return; }
    try {
      setSyncing(true);
      await stSheetService.syncSTSheet(campCode);
      await loadFamilies();
      alert('가족 데이터 동기화가 완료되었습니다.');
    } catch (err) {
      logger.error('동기화 실패:', err);
      const msg = err instanceof Error ? err.message : '동기화에 실패했습니다.';
      alert(`동기화 실패: ${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  // 검색 필터 (이름 + 휴대폰번호)
  const filtered = searchQuery.trim()
    ? families.filter(f =>
        f.parents.some(p => p.name.includes(searchQuery) || p.phone?.includes(searchQuery)) ||
        f.students.some(s =>
          s.name.includes(searchQuery) ||
          s.englishName?.includes(searchQuery) ||
          s.parentPhone?.includes(searchQuery)
        )
      )
    : families;

  const totalStudents = filtered.reduce((s, f) => s + f.students.length, 0);

  // 가족 유형별 섹션 그룹화 (정해진 순서 + 기타)
  const groupedFamilies = (() => {
    const map = new Map<string, FamilyUnit[]>();
    // 정해진 순서대로 먼저 키 세팅
    FAMILY_TYPE_ORDER.forEach(t => map.set(t, []));
    filtered.forEach(f => {
      const key = FAMILY_TYPE_ORDER.includes(f.familyType) ? f.familyType : '기타';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    });
    // 비어있는 섹션 제거
    return Array.from(map.entries()).filter(([, list]) => list.length > 0);
  })();

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800">가족명단</h2>
          {!loading && (
            <span className="text-xs text-gray-400">
              {filtered.length}가족 · 학생 {totalStudents}명
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 검색 */}
          {isSearchExpanded ? (
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-3 h-8">
              <input
                className="bg-transparent text-sm outline-none w-40 text-gray-800 placeholder-gray-400"
                placeholder="이름 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button
                onClick={() => { setSearchQuery(''); setIsSearchExpanded(false); }}
                className="text-gray-400 hover:text-gray-600 text-xs"
              >✕</button>
            </div>
          ) : (
            <button
              onClick={() => setIsSearchExpanded(true)}
              className="p-2 text-gray-500 hover:text-gray-700"
              aria-label="검색"
            >
              🔍
            </button>
          )}

          {/* 동기화 (관리자) */}
          {isAdmin && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
            >
              {syncing ? '동기화 중...' : '동기화'}
            </button>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <svg className="animate-spin w-8 h-8" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm">가족 데이터 로딩 중...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2 text-gray-400">
            <span className="text-4xl">👨‍👩‍👧‍👦</span>
            <span className="text-sm">
              {searchQuery.trim() ? '검색 결과가 없습니다.' : '가족 데이터가 없습니다.'}
            </span>
            {!searchQuery.trim() && isAdmin && (
              <button
                onClick={handleSync}
                className="mt-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                동기화하기
              </button>
            )}
          </div>
        ) : (
          groupedFamilies.map(([type, list]) => {
            const style = FAMILY_TYPE_STYLE[type] ?? DEFAULT_STYLE;
            return (
              <div key={type} className="space-y-2">
                {/* 섹션 제목 */}
                <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${style.sectionBg} ${style.sectionText}`}>
                  <span className="text-sm font-bold">{type}</span>
                  <span className="text-xs opacity-80">{list.length}가족 · 학생 {list.reduce((s, f) => s + f.students.length, 0)}명</span>
                </div>
                {/* 카드 목록 */}
                {list.map(family => (
                  <FamilyCard key={family.familyId} family={family} isAdmin={isAdmin} />
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
