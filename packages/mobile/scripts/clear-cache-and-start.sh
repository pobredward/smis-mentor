#!/bin/bash

echo "🧹 Clearing all React Native and Expo caches..."

# Metro bundler 캐시 클리어
rm -rf $TMPDIR/metro-*
rm -rf $TMPDIR/haste-map-*
rm -rf $TMPDIR/react-*

# Expo 캐시 클리어
rm -rf .expo
rm -rf node_modules/.cache

# Watchman 캐시 클리어 (설치되어 있는 경우)
if command -v watchman &> /dev/null; then
    echo "Clearing watchman cache..."
    watchman watch-del-all
fi

echo "✅ Cache cleared successfully!"
echo ""
echo "Now starting Expo with clear cache..."
echo ""

# CI 변수 명시적으로 제거 (Cursor IDE에서 설정된 경우가 있음)
unset CI

# Expo 시작
npx expo start -c
