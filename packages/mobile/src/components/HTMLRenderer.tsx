import React, { useState } from 'react';
import { logger } from '@smis-mentor/shared';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface HTMLRendererProps {
  html: string;
}

export function HTMLRenderer({ html }: HTMLRendererProps) {
  const [webViewHeight, setWebViewHeight] = useState(300);

  // HTML 템플릿 생성
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 15px;
            line-height: 1.6;
            color: #374151;
            padding: 0;
            background-color: transparent;
          }
          h1, h2, h3, h4, h5, h6 {
            color: #111827;
            font-weight: bold;
            margin-top: 16px;
            margin-bottom: 12px;
          }
          h1 { font-size: 24px; }
          h2 { font-size: 20px; }
          h3 { font-size: 18px; }
          h4 { font-size: 16px; }
          p {
            margin-bottom: 12px;
            line-height: 1.6;
          }
          ul, ol {
            margin-left: 20px;
            margin-bottom: 12px;
          }
          li {
            margin-bottom: 6px;
            line-height: 1.5;
          }
          strong, b {
            font-weight: bold;
            color: #111827;
          }
          em, i {
            font-style: italic;
          }
          a {
            color: #3b82f6;
            text-decoration: underline;
          }
          blockquote {
            border-left: none;
            padding-left: 0;
            margin: 0;
            color: #374151;
          }
          blockquote p {
            margin-bottom: 12px;
            line-height: 1.6;
          }
          code {
            background-color: #f3f4f6;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
          }
          pre {
            background-color: #f3f4f6;
            padding: 12px;
            border-radius: 8px;
            overflow-x: auto;
            margin-bottom: 12px;
          }
          pre code {
            background-color: transparent;
            padding: 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
          }
          th, td {
            border: 1px solid #e5e7eb;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f9fafb;
            font-weight: bold;
          }
          img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 12px 0;
            border-radius: 8px;
          }
          hr {
            border: none;
            border-top: 1px solid #e5e7eb;
            margin: 16px 0;
          }
          
          /* 토글 블록 스타일 */
          .toggle-block {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 12px;
            margin: 8px 0;
            background-color: #f9fafb;
          }
          
          .toggle-header {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
          }
          
          .toggle-header:active {
            opacity: 0.7;
          }
          
          .toggle-icon {
            transition: transform 0.2s ease;
            font-size: 14px;
            display: inline-block;
          }
          
          .toggle-block[data-collapsed="false"] .toggle-icon {
            transform: rotate(90deg);
          }
          
          .toggle-content {
            margin-top: 8px;
            padding-left: 24px;
          }
        </style>
        <script>
          window.addEventListener('load', function() {
            const height = document.body.scrollHeight;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', height: height }));
            
            // 토글 클릭 이벤트 추가
            const toggleHeaders = document.querySelectorAll('.toggle-header');
            toggleHeaders.forEach(function(header) {
              header.addEventListener('click', function() {
                const toggleBlock = header.parentElement;
                if (!toggleBlock) return;
                
                const content = toggleBlock.querySelector('.toggle-content');
                const isCollapsed = toggleBlock.getAttribute('data-collapsed') === 'true';
                
                if (isCollapsed) {
                  // 펼치기
                  toggleBlock.setAttribute('data-collapsed', 'false');
                  if (content) {
                    content.style.display = 'block';
                  }
                } else {
                  // 접기
                  toggleBlock.setAttribute('data-collapsed', 'true');
                  if (content) {
                    content.style.display = 'none';
                  }
                }
                
                // 높이 재계산
                setTimeout(function() {
                  const newHeight = document.body.scrollHeight;
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', height: newHeight }));
                }, 100);
              });
            });
          });
        </script>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;

  const onMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'height') {
        setWebViewHeight(data.height + 20); // 약간의 여백 추가
      }
    } catch (error) {
      logger.error('WebView message parsing error:', error);
    }
  };

  return (
    <View style={[styles.container, { height: webViewHeight }]}>
      <WebView
        source={{ html: htmlContent }}
        style={styles.webview}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        originWhitelist={['*']}
        scalesPageToFit={false}
        bounces={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        onMessage={onMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  webview: {
    backgroundColor: 'transparent',
  },
});
