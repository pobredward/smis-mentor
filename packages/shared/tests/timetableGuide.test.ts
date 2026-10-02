import { describe, expect, it } from './_expect';
import {
  cleanGuide,
  copyGuideBody,
  DEFAULT_FOREIGN_GUIDE_SECTIONS,
  findGuide,
  guideAudienceOf,
  guideBodyFor,
  hasGuideContent,
  normalizeGuide,
  type TimetableGuide,
} from '../src/types/timetableGuide';

const textItem = (id: string, text: string) => ({ id, type: 'text' as const, text });

describe('칸 설명 — 보는 사람별 (멘토·부매니저 / 원어민)', () => {
  it('역할 → 보이는 설명', () => {
    expect(guideAudienceOf('foreign')).toBe('foreign');
    expect(guideAudienceOf('foreign_temp')).toBe('foreign');
    expect(guideAudienceOf('mentor')).toBe('mentor');
    expect(guideAudienceOf('mentor_temp')).toBe('mentor');
    expect(guideAudienceOf('admin')).toBe('mentor');
    expect(guideAudienceOf(undefined)).toBe('mentor');
    expect(guideAudienceOf(null)).toBe('mentor');
    expect(DEFAULT_FOREIGN_GUIDE_SECTIONS).toEqual(['Description', 'How it works', 'Materials']);
  });

  it('guideBodyFor — 멘토용은 바깥 값, 원어민용은 foreign', () => {
    const g: TimetableGuide = {
      summary: '아침 식사',
      sections: [{ id: 's1', title: '설명', items: [textItem('i1', '식당')] }],
      foreign: { summary: 'Breakfast' },
      updatedAt: '2026-01-01',
    };
    expect(guideBodyFor(g, 'mentor')).toEqual({ summary: '아침 식사', sections: g.sections });
    expect(guideBodyFor(g, 'foreign')).toEqual({ summary: 'Breakfast' });
    expect(guideBodyFor({ summary: 'x' }, 'foreign')).toBeUndefined();
    expect(guideBodyFor({ foreign: { summary: 'y' } }, 'mentor')).toEqual({});
    expect(guideBodyFor(undefined, 'mentor')).toBeUndefined();
  });

  it('hasGuideContent — audience 를 주면 그 사람 것만, 안 주면 둘 중 하나라도', () => {
    const mentorOnly: TimetableGuide = { summary: '아침 식사' };
    const foreignOnly: TimetableGuide = {
      sections: [{ id: 's1', title: '설명', items: [] }], // 제목만 있는 빈 섹션은 내용이 아니다
      foreign: { sections: [{ id: 'f1', title: 'How it works', items: [{ id: 'x', type: 'link', url: 'https://a.b' }] }] },
    };
    const both: TimetableGuide = { summary: 'a', foreign: { summary: 'b' } };
    const emptyForeign: TimetableGuide = { summary: 'a', foreign: { summary: '  ', sections: [] } };

    // 예전처럼 audience 없이 부르면 — 관리자 기준 (둘 중 하나라도)
    expect(hasGuideContent(mentorOnly)).toBe(true);
    expect(hasGuideContent(foreignOnly)).toBe(true);
    expect(hasGuideContent(both)).toBe(true);
    expect(hasGuideContent(undefined)).toBe(false);
    expect(hasGuideContent({})).toBe(false);

    expect(hasGuideContent(mentorOnly, 'mentor')).toBe(true);
    expect(hasGuideContent(mentorOnly, 'foreign')).toBe(false);
    expect(hasGuideContent(foreignOnly, 'mentor')).toBe(false);
    expect(hasGuideContent(foreignOnly, 'foreign')).toBe(true);
    expect(hasGuideContent(both, 'mentor')).toBe(true);
    expect(hasGuideContent(both, 'foreign')).toBe(true);
    expect(hasGuideContent(emptyForeign, 'foreign')).toBe(false);
  });

  it('normalizeGuide — 원어민용도 예전 모양(문자열 줄·links)을 맞춰 주고 남긴다', () => {
    const g = normalizeGuide({
      summary: '아침',
      sections: [{ id: 's1', title: '설명', items: ['식당에서'] }],
      foreign: {
        summary: 'Breakfast',
        sections: [{ title: 'How it works', items: ['Line up', { id: 'v', type: 'video', url: 'https://v', storagePath: 'p/v.mp4' }] }],
        links: [{ label: 'Menu', url: 'https://menu' }],
      },
      updatedAt: '2026-01-01',
    });
    expect(g?.summary).toBe('아침');
    expect(g?.sections?.[0].items[0]).toEqual({ id: g!.sections![0].items[0].id, type: 'text', text: '식당에서' });
    expect(g?.updatedAt).toBe('2026-01-01');

    const f = g?.foreign;
    expect(f?.summary).toBe('Breakfast');
    expect(f?.sections?.length).toBe(2);
    expect(f?.sections?.[0].title).toBe('How it works');
    expect(f?.sections?.[0].items[0].type).toBe('text');
    expect(f?.sections?.[0].items[0].text).toBe('Line up');
    expect(f?.sections?.[0].items[1].storagePath).toBe('p/v.mp4');
    expect(f?.sections?.[1].title).toBe('자료');
    expect(f?.sections?.[1].items[0].url).toBe('https://menu');

    // 멘토용 id 와 원어민용 id 가 겹치지 않는다
    const ids = [...(g?.sections ?? []), ...(f?.sections ?? [])].flatMap((s) => [s.id, ...s.items.map((i) => i.id)]);
    expect(new Set(ids).size).toBe(ids.length);

    // 원어민용이 없으면 그대로 없다 / 이상한 값이면 버린다
    expect('foreign' in (normalizeGuide({ summary: 'a' }) ?? {})).toBe(false);
    expect('foreign' in (normalizeGuide({ summary: 'a', foreign: 'oops' }) ?? {})).toBe(false);
    // findGuide 도 원어민용을 같이 돌려준다
    expect(findGuide('Breakfast ', { breakfast: { foreign: { summary: 'B' } } })?.foreign).toEqual({ summary: 'B' });
  });

  it('cleanGuide — 둘 다 정리하고, 빈 원어민용은 통째로 뺀다', () => {
    const cleaned = cleanGuide({
      summary: ' 아침 ',
      sections: [{ id: 's1', title: '설명', items: [textItem('i1', ' 식당 '), textItem('i2', '  ')] }],
      foreign: {
        summary: ' Breakfast ',
        sections: [
          { id: 'f1', title: ' How it works ', items: [textItem('j1', ' Line up '), { id: 'j2', type: 'image' }] },
          { id: 'f2', title: '  ', items: [] },
        ],
      },
      updatedAt: 'x',
    });
    expect(cleaned).toEqual({
      summary: '아침',
      sections: [{ id: 's1', title: '설명', items: [{ id: 'i1', type: 'text', text: '식당' }] }],
      foreign: {
        summary: 'Breakfast',
        sections: [{ id: 'f1', title: 'How it works', items: [{ id: 'j1', type: 'text', text: 'Line up' }] }],
      },
    });

    // 기본 섹션만 깔고 아무것도 안 쓴 원어민용은 남기지 않는다
    const skeleton = cleanGuide({
      summary: 'a',
      foreign: { sections: DEFAULT_FOREIGN_GUIDE_SECTIONS.map((title, i) => ({ id: `d${i}`, title, items: [] })) },
    });
    expect(skeleton).toEqual({ summary: 'a' });
    // 원어민용만 있는 칸도 남는다
    expect(cleanGuide({ foreign: { summary: 'Only EN' } })).toEqual({ foreign: { summary: 'Only EN' } });
  });

  it('copyGuideBody — 새 id, 파일 주소는 같이 쓰되 storagePath 는 넘기지 않는다', () => {
    let n = 0;
    const newId = () => `n${(n += 1)}`;
    const copy = copyGuideBody(
      {
        summary: '아침',
        sections: [
          {
            id: 's1',
            title: '설명',
            items: [textItem('i1', '식당'), { id: 'i2', type: 'image', url: 'https://img', text: 'a.jpg', storagePath: 'timetableGuides/J1/b/a.jpg' }],
          },
        ],
      },
      newId
    );
    expect(copy).toEqual({
      summary: '아침',
      sections: [
        {
          id: 'n1',
          title: '설명',
          items: [
            { id: 'n2', type: 'text', text: '식당' },
            { id: 'n3', type: 'image', text: 'a.jpg', url: 'https://img' },
          ],
        },
      ],
    });
    expect(copyGuideBody(undefined, newId)).toEqual({ sections: [] });
  });
});
