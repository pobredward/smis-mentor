'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Layout from '@/components/common/Layout';
import { db } from '@/lib/firebase';
import {
  getEslBooks,
  updateEslBooks,
  type EslBookList,
  type EslBookSet,
} from '@smis-mentor/shared';

type Row = { code: string; speaking: string; reading: string; writing: string };

const FIELDS = [
  { key: 'speaking' as const, label: 'Speaking' },
  { key: 'reading' as const, label: 'Reading' },
  { key: 'writing' as const, label: 'Writing' },
];

const DEFAULT_BANDS: Record<string, string> = {
  A: '0-2학년',
  B: '3-4학년',
  C: '5-6학년',
  D: '중등부',
  E: '부모님',
};

function toRows(list: EslBookList | null): Row[] {
  return Object.entries(list?.codes ?? {})
    .map(([code, s]) => ({
      code,
      speaking: s.speaking ?? '',
      reading: s.reading ?? '',
      writing: s.writing ?? '',
    }))
    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true, sensitivity: 'base' }));
}

/** 줄바꿈·탭이 든 값은 시트에서 복사한 표로 본다 */
function parseTable(text: string): string[][] | null {
  const rows = (text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '')
    .split('\n')
    .map((l) => l.split('\t').map((c) => c.trim()));
  if (!rows.length || (rows.length === 1 && rows[0].length <= 1)) return null;
  return rows;
}

/**
 * 학년별 ESL 교재 리스트.
 * 반에는 코드만 붙고 교재명은 여기서 조회하므로, 이 표를 고치면
 * 그 코드를 쓰는 모든 캠프·모든 반의 교재가 함께 바뀐다.
 */
export default function EslBooksPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [bands, setBands] = useState<Record<string, string>>(DEFAULT_BANDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    getEslBooks(db)
      .then((list) => {
        setRows(toRows(list));
        if (list.bands && Object.keys(list.bands).length) setBands(list.bands);
      })
      .catch(() => toast.error('교재 리스트를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  const patch = (i: number, field: keyof Row, value: string) => {
    setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, [field]: value } : r)));
    setDirty(true);
  };

  const addRow = () => {
    setRows((prev) => [...prev, { code: '', speaking: '', reading: '', writing: '' }]);
    setDirty(true);
  };

  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, ri) => ri !== i));
    setDirty(true);
  };

  /** 시트에서 표를 복사해 붙여넣으면 아래 행까지 채운다 */
  const onPaste =
    (row: number, col: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
      const grid = parseTable(e.clipboardData.getData('text/plain'));
      if (!grid) return;
      e.preventDefault();
      const order: (keyof Row)[] = ['code', 'speaking', 'reading', 'writing'];
      setRows((prev) => {
        const next = [...prev];
        grid.forEach((cells, r) => {
          const i = row + r;
          while (next.length <= i) next.push({ code: '', speaking: '', reading: '', writing: '' });
          cells.forEach((v, c) => {
            const f = order[col + c];
            if (f) next[i] = { ...next[i], [f]: v };
          });
        });
        return next;
      });
      setDirty(true);
      toast.success(`${grid.length}개 코드를 붙여넣었습니다.`);
    };

  // 저장 전에 걸러야 할 것들
  const problems = useMemo(() => {
    const out: string[] = [];
    const seen = new Map<string, number>();
    rows.forEach((r, i) => {
      const code = r.code.trim();
      if (!code) {
        if (r.speaking || r.reading || r.writing) out.push(`${i + 1}번째 줄: 코드가 비어 있습니다.`);
        return;
      }
      if (seen.has(code)) out.push(`코드 "${code}" 가 ${seen.get(code)! + 1}번째 줄과 겹칩니다.`);
      else seen.set(code, i);
    });
    return out;
  }, [rows]);

  const handleSave = async () => {
    if (problems.length) {
      toast.error('겹치거나 비어 있는 코드를 먼저 정리하세요.');
      return;
    }
    setSaving(true);
    try {
      const codes: Record<string, EslBookSet> = {};
      rows.forEach((r) => {
        const code = r.code.trim();
        if (!code) return;
        const speaking = r.speaking.trim();
        const reading = r.reading.trim();
        const writing = r.writing.trim();
        codes[code] = {
          ...(speaking ? { speaking } : {}),
          ...(reading ? { reading } : {}),
          ...(writing ? { writing } : {}),
        };
      });
      await updateEslBooks(db, { codes, bands });
      setDirty(false);
      toast.success(`${Object.keys(codes).length}개 코드를 저장했습니다.`);
    } catch (e) {
      toast.error('저장에 실패했습니다.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // 학년대별로 묶어서 보여 준다 (코드 첫 글자 기준)
  const grouped = useMemo(() => {
    const map = new Map<string, number[]>();
    rows.forEach((r, i) => {
      const band = (r.code.trim().charAt(0) || '?').toUpperCase();
      if (!map.has(band)) map.set(band, []);
      map.get(band)!.push(i);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <Layout requireAuth requireAdmin>
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-gray-900">ESL 교재 리스트</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={addRow}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              + 코드 추가
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          반에는 코드(Bc)만 붙이고 교재 세 권은 여기서 가져갑니다. 이 표는 캠프·기수와 무관한 전사 공용이라,
          한 줄을 고치면 그 코드를 쓰는 <strong>모든 캠프의 모든 반</strong>에 반영됩니다. 시트에서 표를 복사해
          붙여넣을 수 있습니다.
        </p>

        {problems.length > 0 && (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {problems.map((p, i) => (
              <div key={i}>{p}</div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-500">불러오는 중…</div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([band, indexes]) => (
              <section key={band} className="rounded-lg border border-gray-200">
                <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
                  <span className="text-sm font-semibold text-gray-900">{band}</span>
                  <input
                    value={bands[band] ?? ''}
                    onChange={(e) => {
                      setBands((prev) => ({ ...prev, [band]: e.target.value }));
                      setDirty(true);
                    }}
                    placeholder="학년대 이름"
                    className="w-32 rounded border border-gray-300 px-2 py-0.5 text-xs"
                  />
                  <span className="text-xs text-gray-400">{indexes.length}개 코드</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="w-24 px-3 py-2 font-medium">코드</th>
                        {FIELDS.map((f) => (
                          <th key={f.key} className="px-3 py-2 font-medium">
                            {f.label}
                          </th>
                        ))}
                        <th className="w-14 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {indexes.map((i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-1.5">
                            <input
                              value={rows[i].code}
                              onChange={(e) => patch(i, 'code', e.target.value)}
                              onPaste={onPaste(i, 0)}
                              placeholder="Bc"
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm font-medium"
                            />
                          </td>
                          {FIELDS.map((f, fi) => (
                            <td key={f.key} className="px-3 py-1.5">
                              <input
                                value={rows[i][f.key]}
                                onChange={(e) => patch(i, f.key, e.target.value)}
                                onPaste={onPaste(i, fi + 1)}
                                placeholder="—"
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                              />
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-right">
                            <button
                              onClick={() => removeRow(i)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
