'use client';

/**
 * 원어민 레슨플랜 — 캠프 구글 드라이브 폴더 연결 · 원어민별 폴더의 파일 목록.
 * 드라이브는 서버(/api/admin/lesson-plan-drive)가 서비스 계정으로 읽는다. 규칙은 shared/utils/lessonPlanDrive.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  driveKindLabel,
  driveFolderIdFromUrl,
  matchTeacherDriveFolder,
  type DriveItem,
  type LessonPlanDriveRoot,
} from '@smis-mentor/shared';
import { authenticatedGet, authenticatedPost } from '@/lib/apiClient';

const API = '/api/admin/lesson-plan-drive';

export interface LessonPlanDriveState {
  data: LessonPlanDriveRoot | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** 캠프 레슨플랜 폴더 (캠프를 바꾸면 다시 읽는다) */
export function useLessonPlanDrive(campCode: string | null | undefined, enabled = true): LessonPlanDriveState {
  const [data, setData] = useState<LessonPlanDriveRoot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!campCode || !enabled) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    authenticatedGet<LessonPlanDriveRoot>(`${API}?campCode=${encodeURIComponent(campCode)}`)
      .then((d) => alive && setData(d))
      .catch((e: Error) => {
        if (!alive) return;
        setData(null);
        setError(e.message || '레슨플랜 드라이브를 불러오지 못했습니다');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [campCode, enabled, v]);
  const reload = useCallback(() => setV((x) => x + 1), []);
  return { data, loading, error, reload };
}

const fmtDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
};

const DriveIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 87.3 78" aria-hidden="true">
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
  </svg>
);

/** 페이지 위 — 이 캠프의 레슨플랜 폴더 연결 상태 · 연결 · 바꾸기 */
export function LessonPlanDriveBar({ campCode, drive }: { campCode: string; drive: LessonPlanDriveState }) {
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const d = drive.data;

  const save = async (folderUrl: string | null) => {
    if (folderUrl !== null && !driveFolderIdFromUrl(folderUrl)) {
      setMsg('구글 드라이브 폴더 링크를 붙여 넣으세요 (drive.google.com/drive/folders/…)');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await authenticatedPost(API, { campCode, folderUrl });
      setEditing(false);
      setLink('');
      drive.reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (drive.loading && !d) return <p className="text-xs text-gray-400">레슨플랜 드라이브 확인 중…</p>;
  const form = (
    <div className="flex flex-wrap items-center gap-2 w-full">
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save(link)}
        placeholder={`${campCode} 레슨플랜 폴더 링크 (https://drive.google.com/drive/folders/…)`}
        className="flex-1 min-w-[260px] border rounded-lg px-3 py-1.5 text-sm"
        autoFocus
      />
      <button type="button" disabled={busy || !link.trim()} onClick={() => save(link)} className="px-3 py-1.5 rounded-lg text-sm bg-[#2E26D3] text-white disabled:opacity-40">
        {busy ? '확인 중…' : '연결'}
      </button>
      {d?.configured && (
        <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-sm border bg-white text-gray-600">
          취소
        </button>
      )}
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <DriveIcon /> 레슨플랜 드라이브
        </span>
        {d?.configured && !editing ? (
          <>
            {d.error === 'no-access' ? (
              <span className="text-xs text-amber-700">
                폴더를 읽을 수 없습니다 — 드라이브에서 이 폴더를 <b className="select-all">{d.serviceAccount}</b> 와 &lsquo;뷰어&rsquo;로 공유하세요
              </span>
            ) : (
              <span className="text-xs text-gray-600">
                <b className="text-gray-900">{d.root?.name || campCode}</b> · 원어민 폴더 {d.folders?.length ?? 0}개
              </span>
            )}
            <span className="flex-1" />
            {d.root?.url && (
              <a href={d.root.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#2E26D3] hover:underline">
                드라이브에서 열기 ↗
              </a>
            )}
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-gray-500 hover:text-gray-800">
              바꾸기
            </button>
            <button
              type="button"
              onClick={() => window.confirm(`${campCode} 레슨플랜 폴더 연결을 끊을까요? (드라이브 파일은 그대로)`) && save(null)}
              className="text-xs text-gray-400 hover:text-red-600"
            >
              연결 끊기
            </button>
          </>
        ) : (
          <>
            {!editing && !d?.configured && (
              <span className="text-xs text-gray-500">
                {campCode} 레슨플랜 폴더를 연결하면 원어민 카드를 눌렀을 때 그 선생님 폴더의 레슨플랜이 보입니다.
              </span>
            )}
            {editing || !d?.configured ? form : null}
          </>
        )}
      </div>
      {(msg || drive.error) && <p className="mt-2 text-xs text-red-600">{msg || drive.error}</p>}
    </div>
  );
}

/** 원어민 카드를 눌렀을 때 — 그 선생님 폴더의 레슨플랜 */
export function TeacherLessonPlans({
  campCode,
  teacher,
  drive,
}: {
  campCode: string;
  teacher: { userId?: string; name?: string; englishName?: string };
  drive: LessonPlanDriveState;
}) {
  const d = drive.data;
  const match = d?.folders ? matchTeacherDriveFolder(d.folders, teacher, d.teachers) : { folder: null, how: null };
  const folder = match.folder;
  const [items, setItems] = useState<DriveItem[] | null>(null);
  const [open, setOpen] = useState<Record<string, DriveItem[] | 'loading'>>({});
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setItems(null);
    setOpen({});
    setErr(null);
    if (!folder) return;
    let alive = true;
    authenticatedGet<{ items: DriveItem[] }>(`${API}?campCode=${encodeURIComponent(campCode)}&folderId=${encodeURIComponent(folder.id)}`)
      .then((r) => alive && setItems(r.items))
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [campCode, folder?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pin = async (folderId: string | null) => {
    if (!teacher.userId) return;
    setBusy(true);
    try {
      await authenticatedPost(API, { campCode, userId: teacher.userId, folderId });
      setPicking(false);
      drive.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggleSub = async (f: DriveItem) => {
    if (open[f.id]) {
      setOpen((m) => {
        const n = { ...m };
        delete n[f.id];
        return n;
      });
      return;
    }
    setOpen((m) => ({ ...m, [f.id]: 'loading' }));
    try {
      const r = await authenticatedGet<{ items: DriveItem[] }>(`${API}?campCode=${encodeURIComponent(campCode)}&folderId=${encodeURIComponent(f.id)}`);
      setOpen((m) => ({ ...m, [f.id]: r.items }));
    } catch {
      setOpen((m) => {
        const n = { ...m };
        delete n[f.id];
        return n;
      });
    }
  };

  const title = (
    <p className="text-[10px] font-semibold text-gray-400 tracking-wider mb-2 flex items-center gap-1.5">
      <DriveIcon className="w-3.5 h-3.5" /> LESSON PLANS · {campCode}
    </p>
  );
  if (drive.loading && !d) return <div>{title}<p className="text-xs text-gray-300">불러오는 중…</p></div>;
  if (!d?.configured) {
    return (
      <div>
        {title}
        <p className="text-xs text-gray-400">{campCode} 레슨플랜 폴더가 아직 연결되지 않았습니다 — 페이지 위 &lsquo;레슨플랜 드라이브&rsquo;에서 연결하세요.</p>
      </div>
    );
  }
  if (d.error === 'no-access') {
    return (
      <div>
        {title}
        <p className="text-xs text-amber-700">레슨플랜 폴더를 읽을 수 없습니다 (공유 설정 확인).</p>
      </div>
    );
  }

  const row = (f: DriveItem, depth = 0) => (
    <div key={f.id}>
      <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50" style={{ paddingLeft: 8 + depth * 18 }}>
        {f.iconUrl ? <img src={f.iconUrl} alt="" className="w-4 h-4 shrink-0" /> : <span className="w-4 h-4 shrink-0" />}
        {f.isFolder ? (
          <button type="button" onClick={() => toggleSub(f)} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-gray-800">
            {open[f.id] ? '▾' : '▸'} {f.name}
          </button>
        ) : (
          <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 hover:text-[#2E26D3] hover:underline" title={f.name}>
            {f.name}
          </a>
        )}
        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{driveKindLabel(f.mimeType, f.name)}</span>
        <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-gray-400">{fmtDate(f.modifiedTime)}</span>
      </div>
      {f.isFolder && open[f.id] === 'loading' && <p className="text-[11px] text-gray-300" style={{ paddingLeft: 30 + depth * 18 }}>불러오는 중…</p>}
      {f.isFolder && Array.isArray(open[f.id]) && (open[f.id] as DriveItem[]).map((x) => row(x, depth + 1))}
    </div>
  );

  const picker = (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select
        defaultValue=""
        disabled={busy}
        onChange={(e) => e.target.value && pin(e.target.value)}
        className="border rounded-lg px-2 py-1 text-xs bg-white"
      >
        <option value="">이 선생님 폴더 고르기…</option>
        {(d.folders ?? []).map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      {match.how === 'pinned' && (
        <button type="button" disabled={busy} onClick={() => pin(null)} className="text-xs text-gray-500 hover:text-gray-800">
          고정 해제 (이름으로 찾기)
        </button>
      )}
      {folder && (
        <button type="button" onClick={() => setPicking(false)} className="text-xs text-gray-400">
          취소
        </button>
      )}
    </div>
  );

  return (
    <div>
      {title}
      {folder ? (
        <>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <a href={folder.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-[#2E26D3] ring-1 ring-indigo-100 hover:bg-indigo-100">
              📁 {folder.name} ↗
            </a>
            <span className="text-[10px] text-gray-400">{match.how === 'pinned' ? '직접 고른 폴더' : '이름으로 찾은 폴더'}</span>
            {teacher.userId && !picking && (
              <button type="button" onClick={() => setPicking(true)} className="ml-auto text-[11px] text-gray-400 hover:text-gray-700">
                다른 폴더
              </button>
            )}
          </div>
          {picking && picker}
          {err ? (
            <p className="text-xs text-red-600">{err}</p>
          ) : items === null ? (
            <p className="text-xs text-gray-300">파일 불러오는 중…</p>
          ) : items.length ? (
            <div className="rounded-xl ring-1 ring-gray-100 py-1">{items.map((f) => row(f))}</div>
          ) : (
            <p className="text-xs text-gray-400">폴더가 비어 있습니다.</p>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-gray-500">
            {campCode} 레슨플랜 폴더에서 {teacher.englishName || teacher.name} 선생님 폴더를 찾지 못했습니다.
            {d.root?.url && (
              <>
                {' '}
                <a href={d.root.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#2E26D3] hover:underline">
                  캠프 폴더 열기 ↗
                </a>
              </>
            )}
          </p>
          {teacher.userId ? picker : null}
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </>
      )}
    </div>
  );
}
