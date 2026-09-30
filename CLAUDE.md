# 작업 규칙 (Claude)

## git — 커밋은 사용자가 Cursor에서 직접

Claude는 **커밋·푸시·stash 등 git 쓰기 명령을 실행하지 않는다.** 변경만 하고 커밋은 사용자가 Cursor에서 한다.

상태를 확인할 때는 **반드시 잠금을 만들지 않는 형태로** 읽는다.

```bash
GIT_OPTIONAL_LOCKS=0 git status --porcelain
GIT_OPTIONAL_LOCKS=0 git diff --stat
```

이유: 이 저장소는 Claude 쪽에서 FUSE 마운트로 접근한다. 평범한 `git status`도 인덱스를 갱신하려고
`.git/index.lock` 을 만드는데, 삭제 권한이 없는 세션에서는 git이 그 파일을 스스로 지우지 못하고 남긴다.
잠금이 남으면 **Cursor에서 커밋이 조용히 실패한다** (`Unable to create '.git/index.lock': File exists`).

증상이 보이면:

```bash
rm -f .git/index.lock      # 실행 중인 git 프로세스가 없을 때만
```

## 캠프 그룹 순서 (공통)
- 그룹 순서는 `packages/shared/src/types/campTimetable.ts` 의 `CAMP_GROUP_ORDER` 한 곳에서 관리한다: Junior → Middle → Senior → Spring → Summer → Autumn → Winter → (그 밖) → Common → 단기1~4 → 매니저.
- 정렬은 `compareGroupNames(a, b)` 또는 `groupRank(g)` 를 쓴다 (매니저를 맨 위로 두는 명단은 `{ managerFirst: true }`). 화면마다 순서 배열을 새로 만들지 않는다.
- 캠프 코드 순서는 `packages/shared/src/types/camp.ts` 의 `compareCampCodes(a, b)` 하나를 쓴다: J·E → S → F → 그 밖 (기수 정렬이 먼저면 그 뒤에).
