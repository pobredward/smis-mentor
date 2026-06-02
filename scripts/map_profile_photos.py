#!/usr/bin/env python3
"""
ST시트 프로필사진 열(BF)에 구글 드라이브 링크를 학생 이름으로 매핑하여 업데이트하는 스크립트.

사용법:
  python3 scripts/map_profile_photos.py

필요 패키지:
  pip install google-auth google-api-python-client
"""

import re
from google.oauth2 import service_account
from googleapiclient.discovery import build

SERVICE_ACCOUNT_FILE = 'functions/managesheet-export-fb9c3744de0f.json'
SPREADSHEET_ID = '1E34jLaYvrffb8jBHFPcH8RNQBXdh2KDylPGda5qTGiQ'
SHEET_NAME = 'ST'
PROFILE_FOLDER_ID = '1Imr36hKEdHJZgcYAhipHHthVD1R-poF0'

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly',
]


def get_services():
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    return (
        build('sheets', 'v4', credentials=creds),
        build('drive', 'v3', credentials=creds),
    )


def list_subfolders(drive, parent_id: str) -> list[dict]:
    res = drive.files().list(
        q=f"'{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields="files(id, name)",
    ).execute()
    return res.get('files', [])


def list_files_in_folder(drive, folder_id: str) -> list[dict]:
    res = drive.files().list(
        q=f"'{folder_id}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false",
        fields="files(id, name)",
        pageSize=1000,
    ).execute()
    return res.get('files', [])


def normalize(name: str) -> str:
    """이름 비교용 정규화 (공백 제거, 소문자)"""
    return name.strip().replace(' ', '').lower()


def strip_extension(filename: str) -> str:
    return re.sub(r'\.(jpe?g|png|gif|webp|heic?f?)$', '', filename, flags=re.IGNORECASE).strip()


def drive_link(file_id: str) -> str:
    return f"https://drive.google.com/file/d/{file_id}/view?usp=drivesdk"


def col_to_a1(idx: int) -> str:
    """0-based 열 인덱스 → A1 열 표기 (예: 57 → BF)"""
    result, idx = '', idx + 1
    while idx > 0:
        idx, r = divmod(idx - 1, 26)
        result = chr(65 + r) + result
    return result


def build_name_map(drive) -> dict[str, tuple[str, str]]:
    """드라이브 폴더 전체를 탐색해 {정규화이름: (fileId, fileName)} 반환"""
    name_map: dict[str, tuple[str, str]] = {}
    subfolders = list_subfolders(drive, PROFILE_FOLDER_ID)
    print(f"드라이브 하위 폴더 {len(subfolders)}개 탐색 중...")

    for folder in subfolders:
        for f in list_files_in_folder(drive, folder['id']):
            student_name = strip_extension(f['name'])
            key = normalize(student_name)
            if key in name_map:
                print(f"  ⚠️  중복 파일명: '{f['name']}' vs '{name_map[key][1]}' — 먼저 발견된 파일 사용")
            else:
                name_map[key] = (f['id'], f['name'])

    print(f"총 {len(name_map)}명의 사진 파일 확인\n")
    return name_map


def load_sheet(sheets) -> list[list[str]]:
    res = sheets.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"{SHEET_NAME}!A1:BF",
    ).execute()
    return res.get('values', [])


def main():
    sheets, drive = get_services()

    name_map = build_name_map(drive)

    rows = load_sheet(sheets)
    if not rows:
        print("시트 데이터를 가져올 수 없습니다.")
        return

    header = rows[0]
    try:
        name_col = header.index('학생 이름')
        photo_col = header.index('프로필사진')
    except ValueError as e:
        print(f"헤더 오류: {e}\n헤더: {header}")
        return

    photo_col_a1 = col_to_a1(photo_col)

    updates: list[tuple[int, str]] = []
    unmatched: list[str] = []

    for row_idx, row in enumerate(rows[1:], start=2):
        if len(row) <= name_col:
            continue
        student_name = row[name_col].strip()
        if not student_name:
            continue

        key = normalize(student_name)
        if key in name_map:
            file_id, file_name = name_map[key]
            updates.append((row_idx, drive_link(file_id)))
            print(f"  ✓ 행{row_idx:3d}: {student_name} → {file_name}")
        else:
            unmatched.append(f"  행{row_idx:3d}: {student_name}")

    print(f"\n매칭 성공: {len(updates)}명 / 실패: {len(unmatched)}명")
    if unmatched:
        print("드라이브 파일 없음:")
        for u in unmatched:
            print(u)

    if not updates:
        print("\n업데이트할 항목이 없습니다.")
        return

    print(f"\n총 {len(updates)}개 셀을 업데이트합니다.")
    if input("계속하시겠습니까? (y/n): ").strip().lower() != 'y':
        print("취소되었습니다.")
        return

    result = sheets.spreadsheets().values().batchUpdate(
        spreadsheetId=SPREADSHEET_ID,
        body={
            'valueInputOption': 'RAW',
            'data': [
                {'range': f"{SHEET_NAME}!{photo_col_a1}{row_num}", 'values': [[link]]}
                for row_num, link in updates
            ],
        },
    ).execute()

    print(f"\n✅ 완료! {result.get('totalUpdatedCells', 0)}개 셀 업데이트됨")


if __name__ == '__main__':
    main()
