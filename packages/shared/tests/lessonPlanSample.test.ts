import { describe, expect, it } from './_expect';
import { cellsLabel, layoutPlan, planCalendar } from '../src/utils/lessonPlanEngine';
import { SAMPLE_CAMP, lessonPlanSamples, sampleContext, sampleFor, sampleTipsFor } from '../src/utils/lessonPlanSample';

const cal = planCalendar(SAMPLE_CAMP.start, SAMPLE_CAMP.end, SAMPLE_CAMP.set, SAMPLE_CAMP.campCode);
const lay = (key: 'speaking' | 'reading' | 'writing', cls: string) => layoutPlan(lessonPlanSamples()[key].plan, cal, cls);
const on = (key: 'speaking' | 'reading' | 'writing', cls: string, date: string) => lay(key, cls).rows.find((r) => r.day?.date === date)!;

describe('lessonPlanSample', () => {
  it('every sample fits its schedule with no warnings, in every class', () => {
    (['speaking', 'reading', 'writing'] as const).forEach((k) => {
      lessonPlanSamples()[k].plan.classCodes.forEach((c) => {
        const l = lay(k, c);
        expect([k, c, l.warnings]).toEqual([k, c, []]);
        expect(l.filled).toBe(l.total);
      });
    });
  });

  it('reading: pushed activity, continued unit and a sick day', () => {
    expect(cellsLabel(on('reading', 'J07', '2026-07-30').activity)).toBe('— Story ran long');
    expect(cellsLabel(on('reading', 'J07', '2026-07-30').book)).toContain('U4');
    expect(cellsLabel(on('reading', 'J07', '2026-08-02').book).startsWith('(cont.) U4')).toBe(true);
    expect(on('reading', 'J07', '2026-08-03').type).toBe('skipped');
    expect(cellsLabel(on('reading', 'J07', '2026-08-10').book)).toBe('Review all units · Final test prep (U1–U8 word quiz)');
  });

  it('speaking: two days per unit, camp event, and catch-up', () => {
    expect(on('speaking', 'J07', '2026-08-04').type).toBe('skipped');
    expect(on('speaking', 'J07', '2026-08-09').book.map((c) => c.item.part)).toEqual(['Part 1', 'Part 2']);
  });

  it('writing: only J08 moved', () => {
    expect(on('writing', 'J07', '2026-08-02').type).toBe('lesson');
    expect(on('writing', 'J08', '2026-08-02').type).toBe('skipped');
    expect(on('writing', 'J08', '2026-08-10').book.length).toBe(2);
    expect(sampleTipsFor(sampleFor('Writing'), '2026-08-02', 'J08')[0]).toContain('Only J08');
    expect(sampleTipsFor(sampleFor('Writing'), '2026-08-02', 'J07')[0]).toContain('Open the J08 tab');
  });

  it('sample lookup and context', () => {
    expect(sampleFor('Speaking').key).toBe('speaking');
    expect(sampleFor('mix').key).toBe('reading');
    expect(sampleContext(null).settings.dayPlan!.sets.length).toBe(1);
  });
});
