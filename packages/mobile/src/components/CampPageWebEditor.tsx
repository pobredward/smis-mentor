import React, { useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import WebView from 'react-native-webview';
import { logger } from '@smis-mentor/shared';

interface CampPageWebEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  editable?: boolean; // 편집 모드 여부
}

export function CampPageWebEditor({
  content,
  onChange,
  placeholder = '내용을 입력하세요...',
  editable = true, // 기본값은 편집 가능
}: CampPageWebEditorProps) {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 간단한 contenteditable 기반 에디터 HTML
  const editorHTML = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta charset="UTF-8">
    <script>
      // 편집 모드 여부
      const IS_EDITABLE = ${editable};
    </script>
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        margin: 0;
        padding: 0;
        background: #fff;
      }
      
      #toolbar {
        position: sticky;
        top: 0;
        left: 0;
        right: 0;
        background: #f9fafb;
        border-bottom: 1px solid #e5e7eb;
        padding: 8px;
        display: flex;
        flex-wrap: nowrap;
        gap: 4px;
        z-index: 100;
        overflow-x: auto;
        overflow-y: hidden;
        height: 56px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        -webkit-overflow-scrolling: touch;
      }
      
      #toolbar::-webkit-scrollbar {
        display: none;
      }
      
      .toolbar-button {
        padding: 8px 12px;
        border: none;
        background: white;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        min-width: 40px;
        text-align: center;
        -webkit-tap-highlight-color: transparent;
        border: 1px solid #e5e7eb;
      }
      
      .toolbar-button:active {
        background: #e5e7eb;
      }
      
      .toolbar-button.is-active {
        background: #3b82f6;
        color: white;
        border-color: #3b82f6;
      }
      
      .toolbar-divider {
        width: 1px;
        height: 24px;
        background: #d1d5db;
        margin: 0 4px;
        align-self: center;
      }
      
      #editor {
        padding: 16px;
        min-height: calc(100vh - 120px);
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
    <div id="toolbar">
      <button class="toolbar-button" onclick="undo()" id="undoBtn" title="실행 취소">↶</button>
      <button class="toolbar-button" onclick="redo()" id="redoBtn" title="재실행">↷</button>
      
      <div class="toolbar-divider"></div>
      
      <button class="toolbar-button" onclick="execCommand('bold')" title="굵게">B</button>
      <button class="toolbar-button" onclick="execCommand('italic')" title="기울임">I</button>
      <button class="toolbar-button" onclick="execCommand('underline')" title="밑줄">U</button>
      
      <div class="toolbar-divider"></div>
      
      <button class="toolbar-button" onclick="changeBlockType('h1')" title="제목 1">H1</button>
      <button class="toolbar-button" onclick="changeBlockType('h2')" title="제목 2">H2</button>
      <button class="toolbar-button" onclick="changeBlockType('h3')" title="제목 3">H3</button>
      <button class="toolbar-button" onclick="changeBlockType('p')" title="본문">P</button>
      
      <div class="toolbar-divider"></div>
      
      <button class="toolbar-button" onclick="execCommand('insertUnorderedList')" title="글머리 기호">•</button>
      <button class="toolbar-button" onclick="execCommand('insertOrderedList')" title="번호 매기기">1.</button>
      <button class="toolbar-button" onclick="toggleBlockquote()" title="인용구">"</button>
      
      <div class="toolbar-divider"></div>
      
      <button class="toolbar-button" onclick="insertToggle()" title="토글">▼</button>
      
      <div class="toolbar-divider"></div>
      
      <button class="toolbar-button" onclick="insertLink()" title="링크">🔗</button>
      <button class="toolbar-button" onclick="insertTable()" title="표 삽입">📊</button>
    </div>
    
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
      
      // History 버튼 상태 업데이트
      function updateHistoryButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        if (undoBtn) {
          if (historyStep <= 0) {
            undoBtn.style.opacity = '0.3';
            undoBtn.style.cursor = 'not-allowed';
          } else {
            undoBtn.style.opacity = '1';
            undoBtn.style.cursor = 'pointer';
          }
        }
        
        if (redoBtn) {
          if (historyStep >= history.length - 1) {
            redoBtn.style.opacity = '0.3';
            redoBtn.style.cursor = 'not-allowed';
          } else {
            redoBtn.style.opacity = '1';
            redoBtn.style.cursor = 'pointer';
          }
        }
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
          }
        } catch (error) {
          sendMessage('ERROR', { error: error.message });
        }
      });
      
      // 초기화 완료
      setTimeout(() => {
        sendMessage('EDITOR_READY');
      }, 100);
    </script>
  </body>
</html>
  `;

  const handleMessage = (event: any) => {
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
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
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
