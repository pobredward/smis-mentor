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
        </style>
        <script>
          window.addEventListener('load', function() {
            const height = document.body.scrollHeight;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', height: height }));
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
