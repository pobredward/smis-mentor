import React, { useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform, ScrollView, TouchableOpacity, Alert } from 'react-native';
import WebView from 'react-native-webview';
import { logger } from '@smis-mentor/shared';

interface CampPageWebEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  editable?: boolean;
}

// Toolbar 버튼 정의
const TOOLBAR_BUTTONS = [
  { id: 'undo', label: '↶', title: '실행 취소', command: 'undo' },
  { id: 'redo', label: '↷', title: '재실행', command: 'redo' },
  { id: 'divider1', type: 'divider' },
  { id: 'bold', label: 'B', title: '굵게', command: 'bold' },
  { id: 'italic', label: 'I', title: '기울임', command: 'italic' },
  { id: 'underline', label: 'U', title: '밑줄', command: 'underline' },
  { id: 'divider2', type: 'divider' },
  { id: 'h1', label: 'H1', title: '제목 1', command: 'h1' },
  { id: 'h2', label: 'H2', title: '제목 2', command: 'h2' },
  { id: 'h3', label: 'H3', title: '제목 3', command: 'h3' },
  { id: 'p', label: 'P', title: '본문', command: 'p' },
  { id: 'divider3', type: 'divider' },
  { id: 'ul', label: '•', title: '글머리 기호', command: 'insertUnorderedList' },
  { id: 'ol', label: '1.', title: '번호 매기기', command: 'insertOrderedList' },
  { id: 'quote', label: '"', title: '인용구', command: 'blockquote' },
  { id: 'divider4', type: 'divider' },
  { id: 'toggle', label: '▼', title: '토글', command: 'toggle' },
  { id: 'divider5', type: 'divider' },
  { id: 'link', label: '🔗', title: '링크', command: 'link' },
  { id: 'table', label: '📊', title: '표 삽입', command: 'table' },
] as const;

export function CampPageWebEditor({
  content,
  onChange,
  placeholder = '내용을 입력하세요...',
  editable = true,
}: CampPageWebEditorProps) {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Toolbar 버튼 클릭 핸들러
  const handleToolbarCommand = (command: string) => {
    if (!webViewRef.current) return;
    
    // WebView에 명령 전송
    const jsCode = `
      (function() {
        try {
          if ('${command}' === 'undo') {
            undo();
          } else if ('${command}' === 'redo') {
            redo();
          } else if ('${command}' === 'h1' || '${command}' === 'h2' || '${command}' === 'h3' || '${command}' === 'p') {
            changeBlockType('${command}');
          } else if ('${command}' === 'blockquote') {
            toggleBlockquote();
          } else if ('${command}' === 'toggle') {
            insertToggle();
          } else if ('${command}' === 'link') {
            insertLink();
          } else if ('${command}' === 'table') {
            insertTable();
          } else {
            execCommand('${command}');
          }
        } catch(e) {
          console.error('Command error:', e);
        }
      })();
      true;
    `;
    
    webViewRef.current.injectJavaScript(jsCode);
  };

  // contenteditable 기반 에디터 HTML (Toolbar 제거)
  const editorHTML = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta charset="UTF-8">
    <script>
      const IS_EDITABLE = ${editable};
    </script>
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      html, body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        margin: 0;
        padding: 0;
        background: #fff;
        height: 100%;
        overflow: visible;
      }
      
      body {
        position: relative;
        padding-top: 0px;
      }
      
      #editor {
        padding: 16px;
        min-height: calc(100vh - 16px);
        outline: none;
        font-size: 16px;
        line-height: 1.6;
        color: #1f2937;
      }
      
      #editor:empty:before {
        content: attr(data-placeholder);
        color: #9ca3af;
        pointer-events: none;
      }
      
      #editor h1 {
        font-size: 28px;
        font-weight: bold;
        margin: 16px 0 8px 0;
        line-height: 1.2;
      }
      
      #editor h2 {
        font-size: 24px;
        font-weight: bold;
        margin: 14px 0 7px 0;
        line-height: 1.3;
      }
      
      #editor h3 {
        font-size: 20px;
        font-weight: bold;
        margin: 12px 0 6px 0;
        line-height: 1.3;
      }
      
      #editor p {
        margin: 0 0 8px 0;
      }
      
      /* 빈 단락 처리 - 웹과 동일 */
      #editor p:empty,
      #editor p:has(br:only-child) {
        min-height: 1.75rem;
        display: block;
      }
      
      #editor ul, #editor ol {
        margin: 0 0 8px 0;
        padding-left: 24px;
      }
      
      #editor li {
        margin-bottom: 4px;
      }
      
      #editor a {
        color: #2563eb;
        text-decoration: underline;
      }
      
      #editor blockquote {
        border-left: 4px solid #3b82f6;
        padding-left: 16px;
        padding: 12px 16px;
        margin: 8px 0;
        background-color: #eff6ff;
        border-radius: 4px;
      }
      
      #editor blockquote p {
        margin: 0;
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
      
      #editor table {
        border-collapse: collapse;
        table-layout: auto;
        width: auto;
        margin: 12px 0;
        font-size: 13px;
      }
      
      #editor table td,
      #editor table th {
        border: 1px solid #d1d5db;
        padding: 5px;
        min-width: 60px;
        vertical-align: top;
        white-space: normal;
        word-break: break-word;
        font-size: 13px;
        line-height: 1.3;
      }
      
      #editor table th {
        background: #f3f4f6;
        font-weight: bold;
      }
      
      #editor table.editable {
        opacity: 1;
        cursor: auto;
      }
      
      #editor table.readonly {
        opacity: 0.7;
        cursor: not-allowed;
      }
      
      .table-controls {
        display: flex;
        gap: 4px;
        margin: 8px 0;
        padding: 8px;
        background: #f3f4f6;
        border-radius: 4px;
      }
      
      .table-controls button {
        padding: 4px 8px;
        font-size: 12px;
        background: white;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        cursor: pointer;
      }
      
      .table-controls button:active {
        background: #e5e7eb;
      }
    </style>
  </head>
  <body>
    <div 
      id="editor" 
      contenteditable="true"
      data-placeholder="${placeholder}"
    ></div>
    
    <script>
      const editor = document.getElementById('editor');
      let isInitialized = false;
      
      // History 관리
      let history = [];
      let historyStep = -1;
      let isUndoRedo = false;
      
      // React Native로 메시지 전송
      function sendMessage(type, data = {}) {
        window.ReactNativeWebView?.postMessage(JSON.stringify({ type, ...data }));
      }
      
      // History 저장
      function saveHistory() {
        if (isUndoRedo) return;
        
        const currentContent = editor.innerHTML;
        
        // 현재 단계 이후의 기록 제거
        history = history.slice(0, historyStep + 1);
        
        // 새 기록 추가
        history.push(currentContent);
        historyStep++;
        
        // 최대 100개까지만 저장
        if (history.length > 100) {
          history.shift();
          historyStep--;
        }
        
        updateHistoryButtons();
      }
      
      // Undo
      function undo() {
        if (historyStep > 0) {
          isUndoRedo = true;
          historyStep--;
          editor.innerHTML = history[historyStep];
          isUndoRedo = false;
          updateHistoryButtons();
          sendMessage('CONTENT_CHANGED', { content: editor.innerHTML });
        }
      }
      
      // Redo
      function redo() {
        if (historyStep < history.length - 1) {
          isUndoRedo = true;
          historyStep++;
          editor.innerHTML = history[historyStep];
          isUndoRedo = false;
          updateHistoryButtons();
          sendMessage('CONTENT_CHANGED', { content: editor.innerHTML });
        }
      }
      
      // History 버튼 상태 업데이트 (React Native로 전송)
      function updateHistoryButtons() {
        sendMessage('HISTORY_STATE', {
          canUndo: historyStep > 0,
          canRedo: historyStep < history.length - 1
        });
      }
      
      // 에디터 명령 실행
      function execCommand(command, value = null) {
        document.execCommand(command, false, value);
        editor.focus();
      }
      
      // 제목/단락 스타일 변경
      function changeBlockType(tag) {
        try {
          const selection = window.getSelection();
          if (!selection.rangeCount) {
            console.log('선택 영역 없음');
            return;
          }
          
          const range = selection.getRangeAt(0);
          
          // 현재 커서 위치의 블록 요소 찾기
          let currentBlock = range.startContainer;
          
          // 텍스트 노드면 부모 요소로
          while (currentBlock && currentBlock.nodeType === 3) {
            currentBlock = currentBlock.parentElement;
          }
          
          // 블록 레벨 요소(P, H1, H2, H3, DIV) 찾기
          while (currentBlock && currentBlock !== editor) {
            const tagName = currentBlock.tagName;
            if (['P', 'H1', 'H2', 'H3', 'DIV', 'LI'].includes(tagName)) {
              break;
            }
            currentBlock = currentBlock.parentElement;
          }
          
          if (!currentBlock || currentBlock === editor || currentBlock.tagName === 'LI') {
            console.log('블록 요소를 찾을 수 없거나 LI 내부입니다');
            return;
          }
          
          console.log('현재 블록:', currentBlock.tagName, '→', tag.toUpperCase());
          
          // 현재 커서 오프셋 저장
          const textContent = currentBlock.textContent || '';
          const cursorOffset = range.startOffset;
          
          // 새 요소 생성
          const targetTag = currentBlock.tagName === tag.toUpperCase() ? 'P' : tag.toUpperCase();
          const newElement = document.createElement(targetTag);
          
          // 내용 복사 (빈 블록이면 <br> 추가)
          if (currentBlock.innerHTML.trim()) {
            newElement.innerHTML = currentBlock.innerHTML;
          } else {
            newElement.innerHTML = '<br>';
          }
          
          // 요소 교체
          currentBlock.parentNode.replaceChild(newElement, currentBlock);
          
          // 커서 복원 - 텍스트 노드를 찾아서 배치
          const textNode = newElement.firstChild;
          if (textNode && textNode.nodeType === 3) {
            const newRange = document.createRange();
            const offset = Math.min(cursorOffset, textNode.textContent.length);
            newRange.setStart(textNode, offset);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          } else if (newElement.firstChild) {
            // <br> 등의 경우
            const newRange = document.createRange();
            newRange.setStart(newElement, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
          
          console.log('변경 완료:', newElement.tagName);
          editor.focus();
          editor.dispatchEvent(new Event('input'));
        } catch (error) {
          console.error('changeBlockType 오류:', error);
          alert('스타일 변경 중 오류가 발생했습니다: ' + error.message);
        }
      }
      
      // 인용구 토글
      function toggleBlockquote() {
        try {
          const selection = window.getSelection();
          if (!selection.rangeCount) return;
          
          const range = selection.getRangeAt(0);
          let currentBlock = range.startContainer;
          
          // 텍스트 노드면 부모 요소로
          while (currentBlock && currentBlock.nodeType === 3) {
            currentBlock = currentBlock.parentElement;
          }
          
          // blockquote 안에 있는지 확인
          let blockquoteElement = currentBlock;
          while (blockquoteElement && blockquoteElement !== editor) {
            if (blockquoteElement.tagName === 'BLOCKQUOTE') {
              break;
            }
            blockquoteElement = blockquoteElement.parentElement;
          }
          
          if (blockquoteElement && blockquoteElement.tagName === 'BLOCKQUOTE') {
            // blockquote 제거 - 내용을 <p>로 변환
            const content = blockquoteElement.innerHTML;
            const newP = document.createElement('p');
            newP.innerHTML = content || '<br>';
            blockquoteElement.parentNode.replaceChild(newP, blockquoteElement);
            
            // 커서 복원
            const newRange = document.createRange();
            newRange.selectNodeContents(newP);
            newRange.collapse(false);
            selection.removeAllRanges();
            selection.addRange(newRange);
          } else {
            // 현재 블록을 blockquote로 감싸기
            // 블록 레벨 요소 찾기
            while (currentBlock && currentBlock !== editor) {
              const tagName = currentBlock.tagName;
              if (['P', 'H1', 'H2', 'H3', 'DIV'].includes(tagName)) {
                break;
              }
              currentBlock = currentBlock.parentElement;
            }
            
            if (currentBlock && currentBlock !== editor) {
              const content = currentBlock.innerHTML;
              const blockquote = document.createElement('blockquote');
              const p = document.createElement('p');
              p.innerHTML = content || '<br>';
              blockquote.appendChild(p);
              
              currentBlock.parentNode.replaceChild(blockquote, currentBlock);
              
              // 커서 복원
              const newRange = document.createRange();
              newRange.selectNodeContents(p);
              newRange.collapse(false);
              selection.removeAllRanges();
              selection.addRange(newRange);
            }
          }
          
          editor.focus();
          editor.dispatchEvent(new Event('input'));
        } catch (error) {
          console.error('toggleBlockquote 오류:', error);
          alert('인용구 적용 중 오류가 발생했습니다: ' + error.message);
        }
      }
      
      // 링크 삽입
      function insertLink() {
        const url = prompt('링크 URL을 입력하세요:');
        if (url) {
          execCommand('createLink', url);
        }
      }
      
      // 토글 삽입
      function insertToggle() {
        const title = prompt('토글 제목을 입력하세요:', '토글 제목');
        if (!title) return;
        
        const toggleHTML = \`
          <div class="toggle-block" data-collapsed="true" contenteditable="false">
            <div class="toggle-header">
              <span class="toggle-icon">▶</span>
              <strong>\${title}</strong>
            </div>
            <div class="toggle-content" style="display: none;" contenteditable="true">
              <p>내용을 입력하세요...</p>
            </div>
          </div>
          <p><br></p>
        \`;
        
        document.execCommand('insertHTML', false, toggleHTML);
        
        // 토글 클릭 이벤트 추가
        attachToggleEvents();
      }
      
      // 토글 클릭 이벤트 연결
      function attachToggleEvents() {
        const toggleHeaders = editor.querySelectorAll('.toggle-header');
        toggleHeaders.forEach(header => {
          // 기존 이벤트 제거
          const newHeader = header.cloneNode(true);
          header.parentNode.replaceChild(newHeader, header);
          
          // 새 이벤트 추가
          newHeader.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const toggleBlock = newHeader.parentElement;
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
          });
        });
      }
      
      // 표 삽입
      function insertTable() {
        const rows = prompt('행 개수를 입력하세요:', '3');
        const cols = prompt('열 개수를 입력하세요:', '3');
        
        if (!rows || !cols) return;
        
        const rowCount = parseInt(rows);
        const colCount = parseInt(cols);
        
        if (rowCount < 1 || colCount < 1) {
          alert('1 이상의 숫자를 입력하세요.');
          return;
        }
        
        let tableHTML = '<table class="editable" contenteditable="true"><thead><tr>';
        for (let i = 0; i < colCount; i++) {
          tableHTML += '<th contenteditable="true">제목 ' + (i + 1) + '</th>';
        }
        tableHTML += '</tr></thead><tbody>';
        
        for (let i = 0; i < rowCount - 1; i++) {
          tableHTML += '<tr>';
          for (let j = 0; j < colCount; j++) {
            tableHTML += '<td contenteditable="true">셀</td>';
          }
          tableHTML += '</tr>';
        }
        tableHTML += '</tbody></table><p><br></p>';
        
        // 표 삽입
        document.execCommand('insertHTML', false, tableHTML);
        
        // 표 컨트롤 추가
        addTableControls();
      }
      
      // 표 컨트롤 추가
      function addTableControls() {
        const tables = editor.querySelectorAll('table.editable');
        tables.forEach(table => {
          if (table.previousElementSibling?.classList.contains('table-controls')) {
            return;
          }
          
          const controls = document.createElement('div');
          controls.className = 'table-controls';
          controls.contentEditable = 'false';
          controls.innerHTML = \`
            <button onclick="addTableRow(this)">+행</button>
            <button onclick="addTableColumn(this)">+열</button>
            <button onclick="deleteTableRow(this)">-행</button>
            <button onclick="deleteTableColumn(this)">-열</button>
            <button onclick="deleteTable(this)">표 삭제</button>
          \`;
          
          table.parentNode.insertBefore(controls, table);
        });
      }
      
      // 표 행 추가
      function addTableRow(btn) {
        const table = btn.closest('.table-controls').nextElementSibling;
        const colCount = table.rows[0].cells.length;
        const row = table.insertRow(-1);
        
        for (let i = 0; i < colCount; i++) {
          const cell = row.insertCell(i);
          cell.contentEditable = 'true';
          cell.textContent = '셀';
        }
        
        sendMessage('CONTENT_CHANGED', { content: editor.innerHTML });
      }
      
      // 표 열 추가
      function addTableColumn(btn) {
        const table = btn.closest('.table-controls').nextElementSibling;
        
        for (let i = 0; i < table.rows.length; i++) {
          const cell = i === 0 ? document.createElement('th') : document.createElement('td');
          cell.contentEditable = 'true';
          cell.textContent = i === 0 ? '제목' : '셀';
          table.rows[i].appendChild(cell);
        }
        
        sendMessage('CONTENT_CHANGED', { content: editor.innerHTML });
      }
      
      // 표 행 삭제
      function deleteTableRow(btn) {
        const table = btn.closest('.table-controls').nextElementSibling;
        if (table.rows.length > 2) {
          table.deleteRow(-1);
          sendMessage('CONTENT_CHANGED', { content: editor.innerHTML });
        } else {
          alert('최소 2개 행이 필요합니다 (헤더 + 1행).');
        }
      }
      
      // 표 열 삭제
      function deleteTableColumn(btn) {
        const table = btn.closest('.table-controls').nextElementSibling;
        const colCount = table.rows[0].cells.length;
        
        if (colCount > 1) {
          for (let i = 0; i < table.rows.length; i++) {
            table.rows[i].deleteCell(-1);
          }
          sendMessage('CONTENT_CHANGED', { content: editor.innerHTML });
        } else {
          alert('최소 1개 열이 필요합니다.');
        }
      }
      
      // 표 삭제
      function deleteTable(btn) {
        const controls = btn.closest('.table-controls');
        const table = controls.nextElementSibling;
        
        if (confirm('표를 삭제하시겠습니까?')) {
          controls.remove();
          table.remove();
          sendMessage('CONTENT_CHANGED', { content: editor.innerHTML });
        }
      }
      
      // 콘텐츠 변경 감지
      editor.addEventListener('input', function() {
        const html = editor.innerHTML;
        saveHistory(); // 매 입력마다 즉시 기록
        sendMessage('CONTENT_CHANGED', { content: html });
      });
      
      // 커서 이동 시 툴바 버튼 상태 업데이트
      editor.addEventListener('selectionchange', function() {
        updateToolbarState();
      });
      
      document.addEventListener('selectionchange', function() {
        updateToolbarState();
      });
      
      // 툴바 버튼 활성 상태 업데이트
      function updateToolbarState() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        let currentNode = range.startContainer;
        if (currentNode.nodeType === 3) {
          currentNode = currentNode.parentElement;
        }
        
        // 현재 블록 타입 확인
        let blockElement = currentNode;
        while (blockElement && blockElement !== editor) {
          const tagName = blockElement.tagName;
          if (['P', 'H1', 'H2', 'H3'].includes(tagName)) {
            // 모든 제목 버튼 비활성화
            document.querySelectorAll('.toolbar-button').forEach(btn => {
              btn.classList.remove('is-active');
            });
            
            // 현재 블록 타입 버튼 활성화는 생략 (간단하게)
            break;
          }
          blockElement = blockElement.parentElement;
        }
      }
      
      // Enter 키 처리 개선 (리스트 및 일반 텍스트)
      editor.addEventListener('keydown', function(e) {
        // Tab 키 - 들여쓰기/내어쓰기
        if (e.key === 'Tab') {
          e.preventDefault();
          
          const selection = window.getSelection();
          if (!selection.rangeCount) return;
          
          const range = selection.getRangeAt(0);
          let parentLi = range.startContainer;
          
          while (parentLi && parentLi !== editor && parentLi.tagName !== 'LI') {
            parentLi = parentLi.nodeType === 3 ? parentLi.parentElement : parentLi.parentElement;
          }
          
          if (parentLi && parentLi.tagName === 'LI') {
            // 리스트 내에서 Tab - 들여쓰기
            if (!e.shiftKey) {
              document.execCommand('indent');
            } else {
              document.execCommand('outdent');
            }
          } else {
            // 일반 텍스트에서 Tab - 공백 4개 삽입
            document.execCommand('insertText', false, '    ');
          }
          
          editor.dispatchEvent(new Event('input'));
          return;
        }
        
        if (e.key === 'Enter' && !e.shiftKey) {
          const selection = window.getSelection();
          if (!selection.rangeCount) return;
          
          const range = selection.getRangeAt(0);
          const currentNode = range.startContainer;
          
          // 현재 노드가 어떤 요소 안에 있는지 확인
          let parentLi = currentNode.nodeType === 3 ? currentNode.parentElement : currentNode;
          while (parentLi && parentLi !== editor && parentLi.tagName !== 'LI') {
            parentLi = parentLi.parentElement;
          }
          
          // 리스트 아이템 안에 있는 경우
          if (parentLi && parentLi.tagName === 'LI') {
            e.preventDefault();
            
            // 빈 리스트 아이템이면 리스트 종료
            if (!parentLi.textContent.trim()) {
              const listParent = parentLi.parentElement;
              parentLi.remove();
              
              // 리스트 뒤에 새 단락 생성
              const newP = document.createElement('p');
              newP.innerHTML = '<br>';
              listParent.parentNode.insertBefore(newP, listParent.nextSibling);
              
              // 커서 이동
              const newRange = document.createRange();
              newRange.setStart(newP, 0);
              newRange.collapse(true);
              selection.removeAllRanges();
              selection.addRange(newRange);
            } else {
              // 새 리스트 아이템 생성
              const newLi = document.createElement('li');
              newLi.innerHTML = '<br>';
              
              // 현재 리스트 아이템 뒤에 삽입
              parentLi.parentNode.insertBefore(newLi, parentLi.nextSibling);
              
              // 커서를 새 리스트 아이템으로 이동
              const newRange = document.createRange();
              newRange.setStart(newLi, 0);
              newRange.collapse(true);
              selection.removeAllRanges();
              selection.addRange(newRange);
            }
            
            editor.dispatchEvent(new Event('input'));
            return;
          }
          
          // 일반 텍스트 영역에서는 새 <p> 태그 생성
          e.preventDefault();
          
          const newP = document.createElement('p');
          newP.innerHTML = '<br>';
          
          range.deleteContents();
          range.insertNode(newP);
          
          const newRange = document.createRange();
          newRange.setStart(newP, 0);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
          
          editor.dispatchEvent(new Event('input'));
        }
        
        // Backspace 처리 개선
        if (e.key === 'Backspace') {
          const selection = window.getSelection();
          if (!selection.rangeCount) return;
          
          const range = selection.getRangeAt(0);
          
          // 선택된 텍스트가 있으면 기본 동작 허용
          if (!range.collapsed) return;
          
          const currentNode = range.startContainer;
          let parentElement = currentNode.nodeType === 3 ? currentNode.parentElement : currentNode;
          
          // 커서가 맨 앞에 있을 때만 특별 처리
          if (range.startOffset === 0) {
            // LI 요소인 경우
            let parentLi = parentElement;
            while (parentLi && parentLi !== editor && parentLi.tagName !== 'LI') {
              parentLi = parentLi.parentElement;
            }
            
            if (parentLi && parentLi.tagName === 'LI') {
              const prevLi = parentLi.previousElementSibling;
              const listParent = parentLi.parentElement;
              
              // 빈 리스트 아이템이면 제거
              if (!parentLi.textContent.trim() || parentLi.innerHTML === '<br>') {
                e.preventDefault();
                
                if (prevLi) {
                  // 이전 리스트 아이템으로 커서 이동
                  parentLi.remove();
                  const newRange = document.createRange();
                  newRange.selectNodeContents(prevLi);
                  newRange.collapse(false);
                  selection.removeAllRanges();
                  selection.addRange(newRange);
                } else {
                  // 첫 번째 리스트 아이템이면 리스트를 일반 단락으로 변환
                  const newP = document.createElement('p');
                  newP.innerHTML = '<br>';
                  listParent.parentNode.insertBefore(newP, listParent);
                  listParent.remove();
                  
                  const newRange = document.createRange();
                  newRange.setStart(newP, 0);
                  newRange.collapse(true);
                  selection.removeAllRanges();
                  selection.addRange(newRange);
                }
                
                editor.dispatchEvent(new Event('input'));
                return;
              }
              
              // 리스트 아이템 맨 앞에서 Backspace - 이전 아이템과 병합
              if (prevLi) {
                e.preventDefault();
                
                const prevContent = prevLi.innerHTML;
                const currentContent = parentLi.innerHTML;
                
                // 이전 아이템에 현재 내용 추가
                prevLi.innerHTML = prevContent + currentContent;
                parentLi.remove();
                
                // 커서를 병합 지점으로 이동
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = prevContent;
                const offset = tempDiv.textContent.length;
                
                const textNode = prevLi.firstChild;
                if (textNode) {
                  const newRange = document.createRange();
                  newRange.setStart(textNode, Math.min(offset, textNode.textContent.length));
                  newRange.collapse(true);
                  selection.removeAllRanges();
                  selection.addRange(newRange);
                }
                
                editor.dispatchEvent(new Event('input'));
                return;
              } else {
                // 첫 번째 리스트 아이템이면 일반 단락으로 변환
                e.preventDefault();
                
                const content = parentLi.innerHTML;
                const newP = document.createElement('p');
                newP.innerHTML = content;
                
                listParent.parentNode.insertBefore(newP, listParent);
                parentLi.remove();
                
                // 리스트가 비었으면 제거
                if (listParent.children.length === 0) {
                  listParent.remove();
                }
                
                const newRange = document.createRange();
                newRange.setStart(newP, 0);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
                
                editor.dispatchEvent(new Event('input'));
                return;
              }
            }
            
            // P 요소에서 Backspace - 이전 요소와 병합
            if (parentElement.tagName === 'P') {
              const prevElement = parentElement.previousElementSibling;
              
              if (prevElement) {
                e.preventDefault();
                
                // 이전 요소가 리스트면 마지막 아이템과 병합
                if (prevElement.tagName === 'UL' || prevElement.tagName === 'OL') {
                  const lastLi = prevElement.lastElementChild;
                  if (lastLi) {
                    const prevContent = lastLi.innerHTML;
                    const currentContent = parentElement.innerHTML;
                    
                    lastLi.innerHTML = prevContent + currentContent;
                    parentElement.remove();
                    
                    // 커서를 병합 지점으로 이동
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = prevContent;
                    const offset = tempDiv.textContent.length;
                    
                    const textNode = lastLi.firstChild;
                    if (textNode) {
                      const newRange = document.createRange();
                      newRange.setStart(textNode, Math.min(offset, textNode.textContent ? textNode.textContent.length : 0));
                      newRange.collapse(true);
                      selection.removeAllRanges();
                      selection.addRange(newRange);
                    }
                  }
                }
                // 이전 요소가 단락이면 병합
                else if (prevElement.tagName === 'P') {
                  const prevContent = prevElement.innerHTML;
                  const currentContent = parentElement.innerHTML;
                  
                  prevElement.innerHTML = prevContent + currentContent;
                  parentElement.remove();
                  
                  // 커서를 병합 지점으로 이동
                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = prevContent;
                  const offset = tempDiv.textContent.length;
                  
                  const textNode = prevElement.firstChild;
                  if (textNode) {
                    const newRange = document.createRange();
                    newRange.setStart(textNode, Math.min(offset, textNode.textContent ? textNode.textContent.length : 0));
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                  }
                }
                
                editor.dispatchEvent(new Event('input'));
                return;
              }
            }
          }
        }
      });
      
      // 초기 콘텐츠 설정
      function setContent(html) {
        editor.innerHTML = html || '';
        
        // History 초기화
        history = [editor.innerHTML];
        historyStep = 0;
        updateHistoryButtons();
        
        // 편집 모드일 때만 테이블 컨트롤 추가
        if (IS_EDITABLE) {
          // 기존 표에 편집 가능 속성 추가
          const tables = editor.querySelectorAll('table');
          tables.forEach(table => {
            table.classList.add('editable');
            table.contentEditable = 'true';
            
            // 모든 셀을 편집 가능하게
            const cells = table.querySelectorAll('td, th');
            cells.forEach(cell => {
              cell.contentEditable = 'true';
            });
            
            // 컨트롤 추가 (편집 모드에만)
            if (!table.previousElementSibling?.classList.contains('table-controls')) {
              const controls = document.createElement('div');
              controls.className = 'table-controls';
              controls.contentEditable = 'false';
              controls.innerHTML = \`
                <button onclick="addTableRow(this)">+행</button>
                <button onclick="addTableColumn(this)">+열</button>
                <button onclick="deleteTableRow(this)">-행</button>
                <button onclick="deleteTableColumn(this)">-열</button>
                <button onclick="deleteTable(this)">표 삭제</button>
              \`;
              table.parentNode.insertBefore(controls, table);
            }
          });
        }
        
        // 토글 이벤트 연결
        attachToggleEvents();
        
        if (!isInitialized) {
          isInitialized = true;
          sendMessage('EDITOR_READY');
        }
      }
      
      // React Native에서 메시지 수신
      document.addEventListener('message', function(event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'SET_CONTENT') {
            setContent(data.content);
          } else if (data.type === 'INSERT_NOTION_HTML') {
            insertNotionContent(data.html);
          }
        } catch (error) {
          sendMessage('ERROR', { error: error.message });
        }
      });
      
      // iOS용 메시지 수신
      window.addEventListener('message', function(event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'SET_CONTENT') {
            setContent(data.content);
          } else if (data.type === 'INSERT_NOTION_HTML') {
            insertNotionContent(data.html);
          }
        } catch (error) {
          sendMessage('ERROR', { error: error.message });
        }
      });
      
      // ───────────────────────────────────────────────────────
      // 노션 HTML → 에디터 내부 HTML 변환
      // ───────────────────────────────────────────────────────

      // 노션 토글 <li> 판별: 첫 자식이 <p>이고 자식 2개 이상이거나 <img>를 포함
      function isToggleLi(li) {
        const children = Array.from(li.children);
        if (children.length === 0) return false;
        const first = children[0];
        if (first.tagName !== 'P') return false;
        return children.length >= 2 || first.querySelector('img') !== null;
      }

      // 인라인 요소 → HTML 문자열 (볼드/이탤릭/링크 등 마크 보존)
      function inlineToHtml(node) {
        if (node.nodeType === 3) return node.textContent || '';
        const tag = node.tagName;
        const inner = Array.from(node.childNodes).map(inlineToHtml).join('');
        if (tag === 'STRONG' || tag === 'B') return '<strong>' + inner + '</strong>';
        if (tag === 'EM' || tag === 'I') return '<em>' + inner + '</em>';
        if (tag === 'U') return '<u>' + inner + '</u>';
        if (tag === 'CODE') return '<code>' + inner + '</code>';
        if (tag === 'A') return '<a href="' + (node.getAttribute('href') || '') + '">' + inner + '</a>';
        if (tag === 'IMG') {
          const src = node.getAttribute('src') || '';
          const alt = node.getAttribute('alt') || '';
          return '<img src="' + src + '" alt="' + alt + '" style="max-width:100%;">';
        }
        return inner;
      }

      // 요소 → 에디터 내부 HTML 문자열 (재귀)
      function notionElToHtml(node) {
        if (node.nodeType === 3) return node.textContent || '';
        const tag = node.tagName;
        if (!tag) return '';

        if (tag === 'H1') return '<h1>' + Array.from(node.childNodes).map(inlineToHtml).join('') + '</h1>';
        if (tag === 'H2') return '<h2>' + Array.from(node.childNodes).map(inlineToHtml).join('') + '</h2>';
        if (tag === 'H3') return '<h3>' + Array.from(node.childNodes).map(inlineToHtml).join('') + '</h3>';

        if (tag === 'P') {
          const imgEl = node.querySelector('img');
          if (imgEl) return '<p>' + inlineToHtml(imgEl) + '</p>';
          return '<p>' + Array.from(node.childNodes).map(inlineToHtml).join('') + '</p>';
        }

        if (tag === 'BLOCKQUOTE') {
          const inner = Array.from(node.children).map(notionElToHtml).join('');
          return '<blockquote><p>' + inner + '</p></blockquote>';
        }

        if (tag === 'UL') {
          const parts = [];
          Array.from(node.children).filter(c => c.tagName === 'LI').forEach(li => {
            if (isToggleLi(li)) {
              parts.push(liToToggleHtml(li));
            } else {
              const inner = Array.from(li.childNodes).map(n => {
                if (n.nodeType === 3) return n.textContent || '';
                return notionElToHtml(n);
              }).join('');
              parts.push('<ul><li>' + inner + '</li></ul>');
            }
          });
          return parts.join('');
        }

        if (tag === 'OL') {
          const items = Array.from(node.children).filter(c => c.tagName === 'LI').map(li => {
            const inner = Array.from(li.childNodes).map(n => {
              if (n.nodeType === 3) return n.textContent || '';
              return notionElToHtml(n);
            }).join('');
            return '<li>' + inner + '</li>';
          });
          return '<ol>' + items.join('') + '</ol>';
        }

        // 기타 → 텍스트 단락
        const text = node.textContent || '';
        return text ? '<p>' + text + '</p>' : '';
      }

      // 토글 <li> → .toggle-block HTML
      function liToToggleHtml(li) {
        const titleEl = li.querySelector(':scope > p');
        const titleHtml = titleEl ? Array.from(titleEl.childNodes).map(inlineToHtml).join('') : '';
        const contentNodes = Array.from(li.children).filter(c => c !== titleEl);
        const contentHtml = contentNodes.length
          ? contentNodes.map(notionElToHtml).join('')
          : '<p>내용을 입력하세요...</p>';

        return (
          '<div class="toggle-block" data-collapsed="false" contenteditable="false">' +
            '<div class="toggle-header">' +
              '<span class="toggle-icon">▶</span>' +
              '<strong>' + titleHtml + '</strong>' +
            '</div>' +
            '<div class="toggle-content" contenteditable="true">' +
              contentHtml +
            '</div>' +
          '</div>' +
          '<p><br></p>'
        );
      }

      // 노션 HTML 전체를 에디터 내부 HTML로 변환
      function convertNotionHtmlToEditorHtml(htmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        return Array.from(doc.body.children).map(notionElToHtml).join('');
      }

      // ───────────────────────────────────────────────────────
      // paste 이벤트: 노션 콘텐츠 감지 → RN으로 전달
      // ───────────────────────────────────────────────────────
      editor.addEventListener('paste', function(e) {
        if (!IS_EDITABLE) return;

        const clipboardData = e.clipboardData;
        if (!clipboardData) return;

        const html = clipboardData.getData('text/html') || '';
        const isFromNotion = html.includes('notionvc:') || html.includes('notion-block');

        // 노션 출처가 아니면 기본 붙여넣기 허용
        if (!isFromNotion) return;

        e.preventDefault();
        e.stopPropagation();

        const notionBlocksV3 =
          clipboardData.getData('text/_notion-blocks-v3-production') ||
          clipboardData.getData('text/_notion-blocks-v3-staging') ||
          '';

        // 이미지 blob 확인
        const imageItem = Array.from(clipboardData.items || []).find(
          item => item.type.startsWith('image/')
        );

        if (imageItem) {
          // 이미지 blob → base64로 변환 후 RN으로 전달
          const file = imageItem.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = function(ev) {
              const base64 = ev.target ? ev.target.result : null;
              sendMessage('NOTION_PASTE', {
                html: html,
                notionBlocksV3: notionBlocksV3,
                imageBlob: base64,
                imageMime: file.type,
              });
            };
            reader.readAsDataURL(file);
            return;
          }
        }

        // 이미지 없이 전달
        sendMessage('NOTION_PASTE', {
          html: html,
          notionBlocksV3: notionBlocksV3,
          imageBlob: null,
          imageMime: null,
        });
      });

      // ───────────────────────────────────────────────────────
      // INSERT_NOTION_HTML 메시지 수신: 변환된 HTML 삽입
      // ───────────────────────────────────────────────────────
      function insertNotionContent(rawHtml) {
        const editorHtml = convertNotionHtmlToEditorHtml(rawHtml);
        if (!editorHtml) return;
        document.execCommand('insertHTML', false, editorHtml);
        // 새로 삽입된 토글에 이벤트 연결
        attachToggleEvents();
        saveHistory();
        sendMessage('CONTENT_CHANGED', { content: editor.innerHTML });
      }

      // 초기화 완료
      setTimeout(() => {
        sendMessage('EDITOR_READY');
      }, 100);
    </script>
  </body>
</html>
  `;

  // 웹 서버 API URL (노션 이미지 업로드용)
  const WEB_API_BASE = (process.env.EXPO_PUBLIC_WEBSITE_URL || 'https://smis-mentor.com').replace(/\/$/, '');

  // 노션 이미지 업로드: notion-image API 호출
  const uploadViaNotionApi = async (block: {
    blockId: string;
    spaceId: string;
    fileId: string;
    originalSrc: string;
  }): Promise<string | null> => {
    try {
      const res = await fetch(`${WEB_API_BASE}/api/notion-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockId: block.blockId,
          spaceId: block.spaceId,
          fileId: block.fileId,
          originalUrl: block.originalSrc,
        }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '업로드 실패');
      return data.url ?? null;
    } catch (err) {
      logger.error('[모바일] 노션 이미지 업로드 실패:', err);
      return null;
    }
  };

  // 이미지 blob(base64) 업로드: upload-from-url API 호출
  const uploadImageBlob = async (base64DataUrl: string, mime: string): Promise<string | null> => {
    try {
      const ext = mime.split('/')[1]?.toLowerCase() || 'png';
      const formData = new FormData();
      // React Native에서는 uri를 직접 FormData에 첨부
      formData.append('file', {
        uri: base64DataUrl,
        type: mime,
        name: `paste_${Date.now()}.${ext}`,
      } as unknown as Blob);
      const res = await fetch(`${WEB_API_BASE}/api/upload-from-url`, {
        method: 'POST',
        body: formData as unknown as BodyInit_,
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '업로드 실패');
      return data.url ?? null;
    } catch (err) {
      logger.error('[모바일] 이미지 blob 업로드 실패:', err);
      return null;
    }
  };

  // NOTION_PASTE 처리: 이미지 업로드 후 HTML 주입
  const handleNotionPaste = async (data: {
    html: string;
    notionBlocksV3: string;
    imageBlob: string | null;
    imageMime: string | null;
  }) => {
    const { html, notionBlocksV3, imageBlob, imageMime } = data;

    // 노션 S3 이미지 URL 수집
    const isNotionImgSrc = (src: string) =>
      src.includes('prod-files-secure.s3') ||
      src.includes('notion.so') ||
      src.includes('notionusercontent.com');

    // 이미지 blob이 있으면 blob 업로드 처리
    if (imageBlob && imageMime) {
      const uploadedUrl = await uploadImageBlob(imageBlob, imageMime);
      if (!uploadedUrl) {
        Alert.alert('오류', '이미지 업로드에 실패했습니다.');
        return;
      }
      // 단일 이미지 삽입
      const imgHtml = `<p><img src="${uploadedUrl}" style="max-width:100%;"></p>`;
      const message = JSON.stringify({ type: 'INSERT_NOTION_HTML', html: imgHtml });
      webViewRef.current?.postMessage(message);
      return;
    }

    // notionBlocksV3에서 이미지 블록 추출
    interface ImageBlock { blockId: string; spaceId: string; fileId: string; originalSrc: string; }
    const imageBlocks: ImageBlock[] = [];
    if (notionBlocksV3) {
      try {
        const v3Data = JSON.parse(notionBlocksV3) as {
          blocks: Array<{
            blockId: string;
            blockSubtree: {
              block: Record<string, {
                value: {
                  type: string;
                  properties?: { source?: string[][] };
                  file_ids?: string[];
                  space_id?: string;
                };
              }>;
            };
          }>;
        };
        for (const b of v3Data.blocks) {
          for (const [blockId, blockData] of Object.entries(b.blockSubtree.block)) {
            const val = blockData?.value;
            if (val?.type === 'image' && val?.file_ids?.length && val?.space_id) {
              const originalSrc = val.properties?.source?.[0]?.[0] ?? '';
              if (originalSrc) {
                imageBlocks.push({
                  blockId,
                  spaceId: val.space_id,
                  fileId: val.file_ids[0],
                  originalSrc,
                });
              }
            }
          }
        }
      } catch { /* JSON 파싱 실패 시 무시 */ }
    }

    // HTML에서 노션 이미지 URL 수집 (v3 데이터 없을 때 fallback)
    const htmlImgUrls: string[] = [];
    if (imageBlocks.length === 0) {
      const imgMatches = html.match(/<img[^>]+src="([^"]+)"/g) || [];
      imgMatches.forEach((imgTag) => {
        const match = imgTag.match(/src="([^"]+)"/);
        if (match && isNotionImgSrc(match[1])) htmlImgUrls.push(match[1]);
      });
    }

    const hasImages = imageBlocks.length > 0 || htmlImgUrls.length > 0;

    if (!hasImages) {
      // 이미지 없으면 바로 삽입
      const message = JSON.stringify({ type: 'INSERT_NOTION_HTML', html });
      webViewRef.current?.postMessage(message);
      return;
    }

    // 이미지 업로드
    const urlMap = new Map<string, string>();
    if (imageBlocks.length > 0) {
      const results = await Promise.all(
        imageBlocks.map(async (block) => {
          const uploaded = await uploadViaNotionApi(block);
          return { original: block.originalSrc, uploaded };
        })
      );
      results.forEach(({ original, uploaded }) => {
        if (uploaded) urlMap.set(original, uploaded);
      });
    } else {
      const results = await Promise.all(
        htmlImgUrls.map(async (srcUrl) => {
          try {
            const r = await fetch(srcUrl);
            if (!r.ok) throw new Error(`S3 fetch 실패 (${r.status})`);
            const blob = await r.blob();
            const ext = blob.type.split('/')[1]?.toLowerCase() || 'jpg';
            const formData = new FormData();
            formData.append('file', {
              uri: srcUrl,
              type: blob.type,
              name: `notion_${Date.now()}.${ext}`,
            } as unknown as Blob);
            const res = await fetch(`${WEB_API_BASE}/api/upload-from-url`, {
              method: 'POST',
              body: formData as unknown as BodyInit_,
            });
            const data = await res.json() as { url?: string; error?: string };
            if (!res.ok) throw new Error(data.error ?? '업로드 실패');
            return { original: srcUrl, uploaded: data.url ?? null };
          } catch (err) {
            logger.error('[모바일] S3 이미지 업로드 실패:', err);
            return { original: srcUrl, uploaded: null };
          }
        })
      );
      results.forEach(({ original, uploaded }) => {
        if (uploaded) urlMap.set(original, uploaded);
      });
    }

    if (urlMap.size === 0) {
      Alert.alert('알림', '이미지를 가져오지 못했습니다. 텍스트 내용만 삽입됩니다.');
      const message = JSON.stringify({ type: 'INSERT_NOTION_HTML', html });
      webViewRef.current?.postMessage(message);
      return;
    }

    // HTML 내 이미지 src 교체
    let processedHtml = html;
    urlMap.forEach((uploadedUrl, originalUrl) => {
      processedHtml = processedHtml.replace(new RegExp(originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), uploadedUrl);
    });

    const message = JSON.stringify({ type: 'INSERT_NOTION_HTML', html: processedHtml });
    webViewRef.current?.postMessage(message);
  };

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      switch (data.type) {
        case 'EDITOR_READY':
          logger.info('✅ 에디터 준비 완료');
          setIsLoading(false);
          // 초기 콘텐츠 설정
          if (content) {
            const message = JSON.stringify({
              type: 'SET_CONTENT',
              content,
            });
            webViewRef.current?.postMessage(message);
          }
          break;
          
        case 'CONTENT_CHANGED':
          onChange(data.content);
          break;
          
        case 'HISTORY_STATE':
          setCanUndo(data.canUndo);
          setCanRedo(data.canRedo);
          break;
          
        case 'NOTION_PASTE':
          // 비동기 처리 — void 반환 의도적
          void handleNotionPaste({
            html: data.html ?? '',
            notionBlocksV3: data.notionBlocksV3 ?? '',
            imageBlob: data.imageBlob ?? null,
            imageMime: data.imageMime ?? null,
          });
          break;
          
        case 'TABLE_DETECTED':
          logger.warn('테이블 감지됨 - 편집 제한');
          break;
          
        case 'ERROR':
          logger.error('에디터 오류:', data.error);
          break;
          
        default:
          logger.warn('알 수 없는 메시지 타입:', data.type);
      }
    } catch (error) {
      logger.error('메시지 파싱 오류:', error);
    }
  };

  return (
    <View style={styles.container}>
      {/* React Native Toolbar - 헤더 아래에 고정 */}
      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolbarContent}
        >
          {TOOLBAR_BUTTONS.map((button) => {
            if ('type' in button && button.type === 'divider') {
              return <View key={button.id} style={styles.toolbarDivider} />;
            }
            
            const btn = button as { id: string; label: string; title: string; command: string };
            const isDisabled = 
              (btn.id === 'undo' && !canUndo) ||
              (btn.id === 'redo' && !canRedo);
            
            return (
              <TouchableOpacity
                key={btn.id}
                style={[
                  styles.toolbarButton,
                  isDisabled && styles.toolbarButtonDisabled
                ]}
                onPress={() => handleToolbarCommand(btn.command)}
                disabled={isDisabled}
              >
                <Text style={[
                  styles.toolbarButtonText,
                  isDisabled && styles.toolbarButtonTextDisabled
                ]}>
                  {btn.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* WebView - Toolbar 없이 에디터만 */}
      <WebView
        ref={webViewRef}
        source={{ html: editorHTML }}
        onMessage={handleMessage}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={false}
        showsVerticalScrollIndicator={true}
        originWhitelist={['*']}
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView={false}
        allowsFullscreenVideo={false}
      />
      
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>에디터 로딩 중...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  toolbar: {
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    height: 56,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  toolbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 4,
  },
  toolbarButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  toolbarButtonDisabled: {
    opacity: 0.3,
  },
  toolbarButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  toolbarButtonTextDisabled: {
    color: '#9ca3af',
  },
  toolbarDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#d1d5db',
    marginHorizontal: 4,
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 56, // toolbar 높이만큼 아래에서 시작
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
});
