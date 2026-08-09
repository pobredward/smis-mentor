'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
  STSheetFieldConfig,
  FieldSectionConfig,
  FieldItemConfig,
  FieldPermission,
  FieldType,
} from '@smis-mentor/shared';

interface Props {
  config: STSheetFieldConfig;
  availableHeaders: string[];
  onSave: (config: STSheetFieldConfig) => Promise<void>;
  isSaving: boolean;
}

const PERMISSION_LABELS: Record<FieldPermission, string> = {
  readonly: '읽기 전용',
  mentor:   '멘토·관리자',
  all:      '전체',
};

function generateSectionId(): string {
  return `section_${Date.now()}`;
}

function sortedSections(sections: FieldSectionConfig[]): FieldSectionConfig[] {
  return [...sections]
    .sort((a, b) => a.order - b.order)
    .map(s => ({
      ...s,
      fields: [...s.fields].sort((a, b) => a.order - b.order),
    }));
}

export default function StFieldConfigEditor({ config, availableHeaders, onSave, isSaving }: Props) {
  const [sections, setSections] = useState<FieldSectionConfig[]>(() => sortedSections(config.sections));
  const [newSectionLabel, setNewSectionLabel] = useState('');

  // config prop이 외부에서 변경될 때(캠프 타입 탭 전환, 저장 후 리로드 등) sections state를 동기화
  useEffect(() => {
    setSections(sortedSections(config.sections));
  }, [config]);

  // 섹션에 이미 등록된 헤더 집합
  const registeredHeaders = new Set(
    sections.flatMap((s) => s.fields.map((f) => f.sheetHeader)),
  );
  const unregisteredHeaders = availableHeaders.filter((h) => !registeredHeaders.has(h));

  const handleAddSection = useCallback(() => {
    const label = newSectionLabel.trim();
    if (!label) return;
    setSections((prev) => [
      ...prev,
      {
        id: generateSectionId(),
        label,
        order: prev.length,
        isVisible: true,
        fields: [],
      },
    ]);
    setNewSectionLabel('');
  }, [newSectionLabel]);

  const handleDeleteSection = useCallback((sectionId: string) => {
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
  }, []);

  const handleMoveSectionUp = useCallback((idx: number) => {
    if (idx === 0) return;
    setSections((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  }, []);

  const handleMoveSectionDown = useCallback((idx: number) => {
    setSections((prev) => {
      if (idx === prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  }, []);

  const handleToggleSectionVisible = useCallback((sectionId: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, isVisible: !s.isVisible } : s)),
    );
  }, []);

  const handleSectionLabelChange = useCallback((sectionId: string, label: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, label } : s)),
    );
  }, []);

  const handleAddField = useCallback((sectionId: string, sheetHeader: string) => {
    const newField: FieldItemConfig = {
      sheetHeader,
      fieldKey: sheetHeader,   // 신규 필드는 displayFields[sheetHeader] 에 저장
      label: sheetHeader,
      isLegacy: false,
      permission: 'mentor',
      isEditable: true,
      fieldType: 'text',
      order: 0,
      isVisible: true,
    };
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          fields: [...s.fields, { ...newField, order: s.fields.length }],
        };
      }),
    );
  }, []);

  const handleDeleteField = useCallback((sectionId: string, sheetHeader: string) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          fields: s.fields
            .filter((f) => f.sheetHeader !== sheetHeader)
            .map((f, i) => ({ ...f, order: i })),
        };
      }),
    );
  }, []);

  const handleFieldChange = useCallback(
    (sectionId: string, sheetHeader: string, patch: Partial<FieldItemConfig>) => {
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== sectionId) return s;
          return {
            ...s,
            fields: s.fields.map((f) =>
              f.sheetHeader === sheetHeader ? { ...f, ...patch } : f,
            ),
          };
        }),
      );
    },
    [],
  );

  const handleMoveFieldUp = useCallback((sectionId: string, idx: number) => {
    if (idx === 0) return;
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const fields = [...s.fields];
        [fields[idx - 1], fields[idx]] = [fields[idx], fields[idx - 1]];
        return { ...s, fields: fields.map((f, i) => ({ ...f, order: i })) };
      }),
    );
  }, []);

  const handleMoveFieldDown = useCallback((sectionId: string, idx: number) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        if (idx === s.fields.length - 1) return s;
        const fields = [...s.fields];
        [fields[idx], fields[idx + 1]] = [fields[idx + 1], fields[idx]];
        return { ...s, fields: fields.map((f, i) => ({ ...f, order: i })) };
      }),
    );
  }, []);

  const handleSave = useCallback(async () => {
    await onSave({
      ...config,
      sections: sections.map((s, i) => ({
        ...s,
        order: i,
        // fields의 order도 현재 배열 인덱스 기준으로 재설정 (ClassContent의 sort와 일치)
        fields: s.fields.map((f, j) => ({ ...f, order: j })),
      })),
      updatedAt: new Date().toISOString(),
    });
  }, [config, sections, onSave]);

  return (
    <div className="space-y-6">
      {/* 미등록 헤더 패널 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          시트에서 감지된 미배치 헤더
          <span className="ml-2 text-xs font-normal text-gray-500">
            (클릭하면 원하는 섹션에 추가)
          </span>
        </h3>
        {unregisteredHeaders.length === 0 ? (
          <p className="text-xs text-gray-400">모든 헤더가 섹션에 배치되어 있습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {unregisteredHeaders.map((header) => (
              <UnregisteredHeaderBadge
                key={header}
                header={header}
                sections={sections}
                onAdd={handleAddField}
              />
            ))}
          </div>
        )}
      </div>

      {/* 섹션 목록 */}
      {sections.map((section, sIdx) => {
        const isFixed = !!section.isFixed;
        // 고정 섹션이 아닌 섹션의 실제 인덱스 (순서 이동 버튼 활성화 계산용)
        const dynamicSections = sections.filter(s => !s.isFixed);
        const dynamicIdx = isFixed ? -1 : dynamicSections.findIndex(s => s.id === section.id);

        return (
          <div key={section.id} className={`border rounded-lg overflow-hidden ${isFixed ? 'border-indigo-100' : 'border-gray-200'}`}>
            {/* 섹션 헤더 */}
            <div className={`flex items-center gap-2 px-4 py-3 border-b ${isFixed ? 'bg-indigo-50 border-indigo-100' : 'bg-white border-gray-100'}`}>
              {/* 고정 섹션은 순서 변경 불가 */}
              {isFixed ? (
                <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded shrink-0 mr-1">고정</span>
              ) : (
                <div className="flex flex-col gap-0.5 mr-1">
                  <button
                    onClick={() => handleMoveSectionUp(sIdx)}
                    disabled={dynamicIdx === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 leading-none"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => handleMoveSectionDown(sIdx)}
                    disabled={dynamicIdx === dynamicSections.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 leading-none"
                  >
                    ▼
                  </button>
                </div>
              )}

              {/* 고정 섹션은 이름 변경 불가 */}
              {isFixed ? (
                <span className="flex-1 text-sm font-semibold text-indigo-800">{section.label}</span>
              ) : (
                <input
                  value={section.label}
                  onChange={(e) => handleSectionLabelChange(section.id, e.target.value)}
                  className="flex-1 text-sm font-semibold text-gray-800 border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1"
                />
              )}

              <button
                onClick={() => handleToggleSectionVisible(section.id)}
                className={`text-xs px-2 py-0.5 rounded ${
                  section.isVisible
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {section.isVisible ? '표시' : '숨김'}
              </button>

              {/* 고정 섹션은 삭제 불가 */}
              {!isFixed && (
                <button
                  onClick={() => handleDeleteSection(section.id)}
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-0.5 rounded hover:bg-red-50"
                >
                  섹션 삭제
                </button>
              )}
            </div>

            {/* 필드 목록 */}
            <div className="divide-y divide-gray-50 bg-white">
              {section.fields.length === 0 && (
                <p className="text-xs text-gray-400 px-4 py-3">필드 없음 — 위 패널에서 헤더를 추가하세요.</p>
              )}
              {section.fields.map((field, fIdx) => (
                <FieldRow
                  key={field.sheetHeader}
                  field={field}
                  idx={fIdx}
                  totalFields={section.fields.length}
                  isFixedSection={isFixed}
                  onMoveUp={() => handleMoveFieldUp(section.id, fIdx)}
                  onMoveDown={() => handleMoveFieldDown(section.id, fIdx)}
                  onChange={(patch) => handleFieldChange(section.id, field.sheetHeader, patch)}
                  onDelete={() => handleDeleteField(section.id, field.sheetHeader)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* 섹션 추가 */}
      <div className="flex gap-2">
        <input
          value={newSectionLabel}
          onChange={(e) => setNewSectionLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
          placeholder="새 섹션 이름"
          className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={handleAddSection}
          disabled={!newSectionLabel.trim()}
          className="px-4 py-2 bg-gray-800 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-40"
        >
          섹션 추가
        </button>
      </div>

      {/* 저장 버튼 */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {isSaving ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 서브 컴포넌트: 미등록 헤더 배지 (섹션 선택 드롭다운 포함)
// ─────────────────────────────────────────────
function UnregisteredHeaderBadge({
  header,
  sections,
  onAdd,
}: {
  header: string;
  sections: FieldSectionConfig[];
  onAdd: (sectionId: string, header: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="text-xs px-2 py-1 bg-white border border-gray-300 rounded-full hover:border-blue-400 hover:text-blue-600 transition"
      >
        + {header}
      </button>
      {open && (
        <div className="absolute z-10 left-0 top-7 bg-white border border-gray-200 rounded-lg shadow-lg min-w-max py-1">
          {sections.length === 0 && (
            <p className="text-xs text-gray-400 px-3 py-2">먼저 섹션을 추가하세요</p>
          )}
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                onAdd(s.id, header);
                setOpen(false);
              }}
              className="w-full text-left text-xs px-3 py-1.5 hover:bg-blue-50 hover:text-blue-700"
            >
              {s.label}에 추가
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 서브 컴포넌트: 필드 행
// ─────────────────────────────────────────────
function FieldRow({
  field,
  idx,
  totalFields,
  isFixedSection,
  onMoveUp,
  onMoveDown,
  onChange,
  onDelete,
}: {
  field: FieldItemConfig;
  idx: number;
  totalFields: number;
  isFixedSection: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChange: (patch: Partial<FieldItemConfig>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
      {/* 순서 변경 — 고정 섹션은 비활성화 */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={onMoveUp} disabled={isFixedSection || idx === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none">▲</button>
        <button onClick={onMoveDown} disabled={isFixedSection || idx === totalFields - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none">▼</button>
      </div>

      {/* 시트 헤더 (읽기 전용) */}
      <span className="w-28 shrink-0 text-xs text-gray-400 truncate" title={field.sheetHeader}>
        {field.sheetHeader}
      </span>

      {/* 표시명 — 고정 섹션은 읽기 전용 */}
      {isFixedSection ? (
        <span className="w-36 text-xs text-gray-700 truncate">{field.label}</span>
      ) : (
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-36 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder="표시명"
        />
      )}

      {/* 권한 — 고정 섹션은 읽기 전용으로 고정 (표시 여부만 변경 가능) */}
      {isFixedSection ? (
        <span className="w-28 text-xs text-gray-400 px-1">읽기 전용</span>
      ) : (
        <select
          value={field.permission}
          onChange={(e) => onChange({ permission: e.target.value as FieldPermission })}
          className="w-28 text-xs border border-gray-200 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          {(Object.keys(PERMISSION_LABELS) as FieldPermission[]).map((p) => (
            <option key={p} value={p}>{PERMISSION_LABELS[p]}</option>
          ))}
        </select>
      )}

      {/* 필드 타입 — 고정 섹션은 숨김 */}
      {!isFixedSection && (
        <select
          value={field.fieldType}
          onChange={(e) => onChange({ fieldType: e.target.value as FieldType })}
          className="w-20 text-xs border border-gray-200 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="text">텍스트</option>
          <option value="score">점수</option>
        </select>
      )}

      {/* 만점 (score 타입만, 동적 섹션) */}
      {!isFixedSection && field.fieldType === 'score' && (
        <input
          type="number"
          value={field.maxScore ?? ''}
          onChange={(e) => onChange({ maxScore: Number(e.target.value) || undefined })}
          className="w-16 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder="만점"
          min={0}
        />
      )}

      {/* 편집 가능 여부 — 고정 섹션은 숨김 */}
      {!isFixedSection && (
        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={field.isEditable}
            onChange={(e) => onChange({ isEditable: e.target.checked })}
            disabled={field.permission === 'readonly'}
            className="rounded"
          />
          편집
        </label>
      )}

      {/* 표시 여부 */}
      <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer shrink-0">
        <input
          type="checkbox"
          checked={field.isVisible}
          onChange={(e) => onChange({ isVisible: e.target.checked })}
          className="rounded"
        />
        표시
      </label>

      {/* legacy 뱃지 */}
      {field.isLegacy && !isFixedSection && (
        <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded shrink-0">기존</span>
      )}

      {/* 삭제 — 고정 섹션의 내장 필드(isLegacy)는 불가, 추가한 신규 필드는 가능 */}
      {(!isFixedSection || !field.isLegacy) ? (
        <button
          onClick={onDelete}
          className="ml-auto text-xs text-red-400 hover:text-red-600 shrink-0"
        >
          ✕
        </button>
      ) : (
        <div className="ml-auto" />
      )}
    </div>
  );
}
