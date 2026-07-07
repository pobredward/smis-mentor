#!/usr/bin/env python3
"""
Firebase Auth UID ↔ Firestore UID 불일치 감지 및 수정 스크립트

사용법:
  # 1. 불일치 목록만 확인 (dry-run)
  python3 scripts/fix-auth-uid-mismatch.py --check

  # 2. 특정 유저 1명만 수정
  python3 scripts/fix-auth-uid-mismatch.py --fix --firestore-uid DTOzJidv4zQImrFx6ntc --old-auth-uid bzljjAYgjpamKy4OwU0p1DJzEfu2

  # 3. 전체 불일치 유저 자동 수정 (주의: 영향 범위 큼)
  python3 scripts/fix-auth-uid-mismatch.py --fix-all

사전 조건:
  - Firebase CLI 로그인 완료 (firebase login)
  - 프로젝트 루트에서 실행
  - smis-mentor 프로젝트가 current로 설정되어 있을 것
"""

import argparse
import json
import os
import ssl
import subprocess
import sys
import tempfile
import urllib.request
import urllib.error

# macOS Python 3.13은 번들 SSL 인증서를 사용하지 않으므로 certifi로 우회
try:
    import certifi
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    # certifi 없으면 시스템 기본값 사용
    _SSL_CONTEXT = ssl.create_default_context()

# ─── 설정 ─────────────────────────────────────────────────────────────────────
PROJECT_ID = "smis-mentor"
FIREBASE_CONFIG_PATH = os.path.expanduser("~/.config/configstore/firebase-tools.json")
# ─────────────────────────────────────────────────────────────────────────────


def get_access_token() -> str:
    """Firebase CLI 캐시에서 액세스 토큰을 가져옵니다."""
    if not os.path.exists(FIREBASE_CONFIG_PATH):
        print("❌ Firebase CLI 설정 파일을 찾을 수 없습니다.")
        print("   'firebase login' 을 먼저 실행하세요.")
        sys.exit(1)

    with open(FIREBASE_CONFIG_PATH) as f:
        config = json.load(f)

    token = config.get("tokens", {}).get("access_token")
    if not token:
        print("❌ Firebase 액세스 토큰이 없습니다. 'firebase login' 을 다시 실행하세요.")
        sys.exit(1)
    return token


def export_auth_users() -> list[dict]:
    """Firebase Auth 전체 유저를 내보냅니다."""
    print(f"[Auth] Firebase Auth 유저 내보내는 중... (project: {PROJECT_ID})")
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        tmp_path = f.name

    result = subprocess.run(
        ["firebase", "auth:export", tmp_path, "--format", "json", "--project", PROJECT_ID],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print("❌ Auth export 실패:", result.stderr)
        sys.exit(1)

    with open(tmp_path) as f:
        data = json.load(f)
    os.unlink(tmp_path)

    users = data.get("users", [])
    print(f"[Auth] {len(users)}명 내보내기 완료")
    return users


def export_firestore_uids() -> dict[str, dict]:
    """
    Firestore users 컬렉션에서 uid(문서 ID)와 email 매핑을 가져옵니다.
    Firebase REST API를 사용합니다.
    """
    print(f"[Firestore] users 컬렉션 조회 중... (project: {PROJECT_ID})")
    token = get_access_token()

    firestore_users: dict[str, dict] = {}
    page_token = None
    page = 1

    while True:
        url = (
            f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}"
            f"/databases/(default)/documents/users?pageSize=300"
        )
        if page_token:
            url += f"&pageToken={page_token}"

        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {token}"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30, context=_SSL_CONTEXT) as resp:
                result = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f"❌ Firestore API 오류 ({e.code}): {body[:300]}")
            sys.exit(1)

        docs = result.get("documents", [])
        for doc in docs:
            # 문서 이름: projects/.../documents/users/{uid}
            uid = doc["name"].split("/")[-1]
            fields = doc.get("fields", {})
            email = fields.get("email", {}).get("stringValue", "")
            name = fields.get("name", {}).get("stringValue", "")
            firestore_users[uid] = {"email": email, "name": name, "uid": uid}

        page_token = result.get("nextPageToken")
        print(f"[Firestore] 페이지 {page}: {len(docs)}개 문서 조회")
        if not page_token:
            break
        page += 1

    print(f"[Firestore] 총 {len(firestore_users)}명 조회 완료")
    return firestore_users


def find_mismatches(auth_users: list[dict], firestore_users: dict[str, dict]) -> list[dict]:
    """
    Firestore uid와 Auth uid가 불일치하는 케이스를 찾습니다.
    
    불일치 기준: Firestore에 존재하는 uid가 Auth에는 없지만,
    같은 email의 Auth 계정이 다른 uid로 존재하는 경우
    """
    # Auth: email → uid 매핑
    auth_email_to_uid: dict[str, str] = {}
    auth_uid_set: set[str] = set()
    for u in auth_users:
        uid = u.get("localId", "")
        auth_uid_set.add(uid)
        email = u.get("email", "")
        if not email:
            # 소셜 로그인 전용 계정은 providerUserInfo에서 email 추출
            for p in u.get("providerUserInfo", []):
                if p.get("email"):
                    email = p["email"]
                    break
        if email:
            auth_email_to_uid[email] = uid

    mismatches = []
    for fs_uid, fs_data in firestore_users.items():
        email = fs_data.get("email", "")

        # Firestore uid가 Auth에도 그대로 존재하면 정상
        if fs_uid in auth_uid_set:
            continue

        # Firestore uid가 Auth에 없음 → 같은 email의 Auth 계정이 있는지 확인
        if email and email in auth_email_to_uid:
            auth_uid = auth_email_to_uid[email]
            mismatches.append({
                "firestore_uid": fs_uid,
                "old_auth_uid": auth_uid,
                "email": email,
                "name": fs_data.get("name", ""),
            })

    return mismatches


def delete_auth_user(uid: str) -> bool:
    """Firebase Identity Toolkit REST API로 Auth 유저를 삭제합니다."""
    token = get_access_token()
    url = f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT_ID}/accounts:delete"
    body = json.dumps({"localId": uid}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=15, context=_SSL_CONTEXT) as resp:
            result = json.loads(resp.read())
        return "kind" in result
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ❌ 삭제 실패 ({e.code}): {body[:200]}")
        return False


def import_auth_user_with_new_uid(auth_users: list[dict], old_uid: str, new_uid: str) -> bool:
    """
    기존 Auth 유저 데이터를 새 uid로 바꿔서 firebase auth:import로 가져옵니다.
    """
    # 기존 유저 데이터 찾기
    old_user = None
    for u in auth_users:
        if u.get("localId") == old_uid:
            old_user = u
            break

    if not old_user:
        print(f"  ❌ Auth에서 uid {old_uid} 를 찾을 수 없습니다.")
        return False

    # uid만 교체
    new_user = dict(old_user)
    new_user["localId"] = new_uid

    import_data = {"users": [new_user]}

    with tempfile.NamedTemporaryFile(suffix=".json", mode="w", delete=False) as f:
        json.dump(import_data, f, ensure_ascii=False)
        tmp_path = f.name

    result = subprocess.run(
        ["firebase", "auth:import", tmp_path, "--project", PROJECT_ID],
        capture_output=True, text=True
    )
    os.unlink(tmp_path)

    if result.returncode != 0 or "error" in result.stderr.lower():
        print(f"  ❌ import 실패: {result.stderr[:200]}")
        return False

    return True


def fix_single(auth_users: list[dict], firestore_uid: str, old_auth_uid: str, email: str = "", name: str = "") -> bool:
    """단일 유저의 UID 불일치를 수정합니다."""
    print(f"\n  수정 대상: {name or email or firestore_uid}")
    print(f"  Firestore uid : {firestore_uid}")
    print(f"  기존 Auth uid : {old_auth_uid}")

    # 1. 새 uid로 Auth 계정 생성
    print(f"  [1/2] uid {firestore_uid} 로 새 Auth 계정 생성 중...")
    if not import_auth_user_with_new_uid(auth_users, old_auth_uid, firestore_uid):
        return False
    print(f"  ✅ 새 Auth 계정 생성 완료")

    # 2. 기존 Auth 계정 삭제
    print(f"  [2/2] 기존 Auth 계정 {old_auth_uid} 삭제 중...")
    if not delete_auth_user(old_auth_uid):
        print(f"  ⚠️  새 계정은 생성됐지만 기존 계정 삭제에 실패했습니다. 수동으로 삭제하세요.")
        return False
    print(f"  ✅ 기존 Auth 계정 삭제 완료")

    return True


def cmd_check():
    """불일치 목록만 출력합니다."""
    auth_users = export_auth_users()
    firestore_users = export_firestore_uids()
    mismatches = find_mismatches(auth_users, firestore_users)

    print(f"\n{'─'*60}")
    if not mismatches:
        print("✅ 불일치 케이스 없음 — 모든 유저의 UID가 정상입니다.")
        return

    print(f"⚠️  불일치 케이스 {len(mismatches)}건 발견:\n")
    for i, m in enumerate(mismatches, 1):
        print(f"  [{i}] {m['name'] or '이름없음'} ({m['email']})")
        print(f"       Firestore uid : {m['firestore_uid']}")
        print(f"       Auth uid      : {m['old_auth_uid']}")
        print()

    print("수정하려면 다음 명령어를 실행하세요:")
    print("  python3 scripts/fix-auth-uid-mismatch.py --fix-all")
    print("  또는 개별 수정:")
    for m in mismatches:
        print(f"  python3 scripts/fix-auth-uid-mismatch.py --fix "
              f"--firestore-uid {m['firestore_uid']} --old-auth-uid {m['old_auth_uid']}")


def cmd_fix_one(firestore_uid: str, old_auth_uid: str):
    """특정 유저 1명만 수정합니다."""
    auth_users = export_auth_users()

    # 해당 유저 정보 찾기
    target = next((u for u in auth_users if u.get("localId") == old_auth_uid), None)
    email = ""
    if target:
        email = target.get("email", "")
        if not email:
            for p in target.get("providerUserInfo", []):
                if p.get("email"):
                    email = p["email"]
                    break

    print(f"\n{'─'*60}")
    success = fix_single(auth_users, firestore_uid, old_auth_uid, email=email)
    print(f"\n{'─'*60}")
    if success:
        print(f"✅ 완료: Auth uid가 {firestore_uid} 로 수정되었습니다.")
    else:
        print(f"❌ 실패: 수동으로 Firebase Console에서 처리하세요.")
        sys.exit(1)


def cmd_fix_all():
    """전체 불일치 유저를 자동으로 수정합니다."""
    auth_users = export_auth_users()
    firestore_users = export_firestore_uids()
    mismatches = find_mismatches(auth_users, firestore_users)

    print(f"\n{'─'*60}")
    if not mismatches:
        print("✅ 불일치 케이스 없음 — 할 작업이 없습니다.")
        return

    print(f"⚠️  불일치 케이스 {len(mismatches)}건을 수정합니다.\n")

    # 확인 프롬프트
    print("계속하시겠습니까? (y/N): ", end="")
    answer = input().strip().lower()
    if answer != "y":
        print("취소되었습니다.")
        sys.exit(0)

    success_count = 0
    fail_list = []

    for m in mismatches:
        ok = fix_single(
            auth_users,
            firestore_uid=m["firestore_uid"],
            old_auth_uid=m["old_auth_uid"],
            email=m["email"],
            name=m["name"],
        )
        if ok:
            success_count += 1
        else:
            fail_list.append(m)

    print(f"\n{'─'*60}")
    print(f"✅ 성공: {success_count}건 / 실패: {len(fail_list)}건")
    if fail_list:
        print("\n실패한 케이스:")
        for m in fail_list:
            print(f"  - {m['email']} (Firestore: {m['firestore_uid']}, Auth: {m['old_auth_uid']})")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Firebase Auth UID ↔ Firestore UID 불일치 감지 및 수정"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="불일치 목록 확인만 (변경 없음)")
    group.add_argument("--fix", action="store_true", help="특정 유저 1명 수정")
    group.add_argument("--fix-all", action="store_true", help="전체 불일치 자동 수정")

    parser.add_argument("--firestore-uid", help="Firestore 문서 ID (--fix 시 필수)")
    parser.add_argument("--old-auth-uid", help="기존 잘못된 Auth UID (--fix 시 필수)")

    args = parser.parse_args()

    # 프로젝트 루트에서 실행 중인지 확인
    if not os.path.exists(".firebaserc"):
        print("❌ 프로젝트 루트 디렉토리에서 실행하세요.")
        print("   cd /path/to/smis-mentor && python3 scripts/fix-auth-uid-mismatch.py ...")
        sys.exit(1)

    if args.check:
        cmd_check()
    elif args.fix:
        if not args.firestore_uid or not args.old_auth_uid:
            print("❌ --fix 옵션에는 --firestore-uid 와 --old-auth-uid 가 필요합니다.")
            parser.print_help()
            sys.exit(1)
        cmd_fix_one(args.firestore_uid, args.old_auth_uid)
    elif args.fix_all:
        cmd_fix_all()


if __name__ == "__main__":
    main()
