import { describe, expect, it } from './_expect';
import {
  omitLegacyInterviewFields,
  pickJobBoardInterview,
  resolveApplicantInterview,
} from '../src/services/jobBoard/interview';

describe('jobBoard interview (private/interview)', () => {
  it('면접 필드만 골라낸다 (형식이 틀린 값·다른 필드는 뺀다)', () => {
    expect(pickJobBoardInterview({ interviewBaseLink: 'https://zoom.us/j/1?pwd=x', interviewBaseNotes: '암호 1234', interviewBaseDuration: '20', title: '공고' }))
      .toEqual({ interviewBaseLink: 'https://zoom.us/j/1?pwd=x', interviewBaseNotes: '암호 1234', interviewBaseDuration: 20 });
    expect(pickJobBoardInterview({ interviewBaseDuration: 'abc', interviewBaseLink: 3 })).toEqual({});
    expect(pickJobBoardInterview(null)).toEqual({});
  });

  it('공고 문서에 쓸 데이터에서 예전 면접 필드를 뺀다', () => {
    expect(omitLegacyInterviewFields({ title: 'A', interviewBaseLink: 'x', interviewBaseNotes: 'y', interviewBaseDuration: 30, interviewPassword: '' }))
      .toEqual({ title: 'A' });
  });

  it('지원자 면접 안내: 지원서 → 공고 → 기본 링크 순', () => {
    expect(resolveApplicantInterview({ interviewBaseLink: 'app' }, { interviewBaseLink: 'board', interviewBaseNotes: 'n', interviewBaseDuration: 30 }, 'default'))
      .toEqual({ link: 'app', notes: 'n', duration: 30 });
    expect(resolveApplicantInterview({}, {}, 'default')).toEqual({ link: 'default', notes: '', duration: null });
    expect(resolveApplicantInterview({ interviewBaseLink: '' }, {})).toEqual({ link: '', notes: '', duration: null });
  });
});
