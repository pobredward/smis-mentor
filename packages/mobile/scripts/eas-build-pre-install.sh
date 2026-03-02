#!/bin/bash

# GoogleService-Info.plist 생성 (iOS 빌드 시에만)
if [ -n "$GOOGLE_SERVICES_INFOPLIST_BASE64" ]; then
  echo "$GOOGLE_SERVICES_INFOPLIST_BASE64" | base64 --decode > GoogleService-Info.plist
  echo "✅ GoogleService-Info.plist created from environment variable"
else
  echo "⚠️  GOOGLE_SERVICES_INFOPLIST_BASE64 not found in environment (skipping for Android builds)"
fi
