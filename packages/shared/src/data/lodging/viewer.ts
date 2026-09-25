import type { LodgingBuilding, LodgingPlaceView, LodgingRoomView } from '../../types/lodging';
import {
  isLodgingRoomDimmed,
  LODGING_PLACE_COLORS,
  lodgingRoomCaption,
  lodgingRoomColor,
  lodgingRoomTone,
} from '../../types/lodging';

/** 뷰어 모드 — 3D 한 가지 */
export type LodgingViewerMode = '3d';

export interface LodgingViewerPayload {
  building: LodgingBuilding;
  /** 방 번호 → 방 뷰. 명단은 이름·학년만 넘긴다 */
  rooms: Map<string, LodgingRoomView> | LodgingRoomView[];
  places?: LodgingPlaceView[];
  mode?: LodgingViewerMode;
  /** 처음 보여 줄 층 (0 = 전체, -1 = B1) */
  floor?: number;
}

/** 뷰어 안에서 쓰는 방 한 칸 — 이름·학년만 */
export type LodgingViewerRooms = Record<string, unknown>;

const THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

/** JSON 을 <script> 안에 넣어도 안전하게 */
const embed = (v: unknown) =>
  JSON.stringify(v)
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/**
 * 뷰어에 넘길 방 목록. 필터를 바꿀 때는 문서를 새로 띄우지 않고 이것만 다시 보낸다
 * ({ type:'setRooms', rooms }) — 3D 시점이 그대로 유지된다.
 */
export function lodgingViewerRooms(rooms: Map<string, LodgingRoomView> | LodgingRoomView[]): LodgingViewerRooms {
  const list = rooms instanceof Map ? Array.from(rooms.values()) : rooms;
  const out: LodgingViewerRooms = {};
  list.forEach((r) => {
    const c = lodgingRoomColor(r);
    out[r.num] = {
      purpose: lodgingRoomTone(r),
      caption: lodgingRoomCaption(r),
      bg: c.bg,
      ink: c.ink,
      ...(r.label ? { label: r.label } : {}),
      people: r.students.map((s) => ({ name: s.name, grade: s.grade })),
      ...(r.teachers.length ? { teachers: r.teachers } : {}),
      ...(isLodgingRoomDimmed(r) ? { dim: true } : {}),
      ...(r.hiddenCount ? { hidden: r.hiddenCount } : {}),
    };
  });
  return out;
}

/**
 * 숙소 3D 뷰어 한 장짜리 HTML.
 * web 은 <iframe srcDoc>, mobile 은 WebView source.html 로 그대로 띄운다.
 *
 * 뷰어 → 호스트: postMessage { source:'lodging-viewer', type:'room'|'place'|'floor'|'ready', num|id|floor }
 *   (mobile 은 window.ReactNativeWebView.postMessage 로 JSON 문자열)
 * 호스트 → 뷰어: window.lodgingCmd({ type:'goTo', num }) / { type:'setFloor', floor } / { type:'setMode', mode }
 *   / { type:'setRooms', rooms } (lodgingViewerRooms 결과)
 *   web 은 iframe.contentWindow.postMessage({ source:'lodging-host', ...cmd }, '*'), mobile 은 injectJavaScript
 */
export function lodgingViewerHtml(payload: LodgingViewerPayload): string {
  const places: Record<string, unknown> = {};
  (payload.places ?? []).forEach((p) => {
    if (p.purpose) places[p.id] = { purpose: p.purpose };
  });
  const data = {
    building: payload.building,
    rooms: lodgingViewerRooms(payload.rooms),
    places,
    placeColors: LODGING_PLACE_COLORS,
    floor: payload.floor ?? 0,
  };
  const three = '<script id="three-src" src="' + THREE_SRC + '"></script>';
  return (
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">' +
    '<style>' + VIEWER_CSS + '</style></head><body>' +
    VIEWER_BODY +
    '<script>window.__LODGING__=' + embed(data) + ';</script>' +
    three +
    '<script>' + VIEWER_JS + '</script>' +
    '</body></html>'
  );
}

const VIEWER_CSS = String.raw`
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#F6F6F3;color:#1B1F24;font:13px/1.4 "Apple SD Gothic Neo","Noto Sans KR",system-ui,-apple-system,sans-serif;-webkit-text-size-adjust:100%;overflow:hidden}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;background:#fff;border-bottom:1px solid #DDE0E4}
.lbl{font-size:11px;color:#8A929E;font-weight:600;letter-spacing:.06em}
.seg{display:inline-flex;gap:2px;background:#ECEEF1;border-radius:8px;padding:2px}
.seg button{border:0;background:transparent;color:#4B5563;font:inherit;font-size:12px;font-weight:500;padding:5px 10px;border-radius:6px;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.seg button[aria-pressed="true"]{background:#fff;color:#2B5FD9;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.view{display:none;position:absolute;left:0;right:0;top:0;bottom:0;flex-direction:column}
.view[style*="block"]{display:flex!important}
.fill{flex:1;position:relative;min-height:0}
.gl{position:absolute;inset:0;overflow:hidden;background:linear-gradient(#d7e9f5,#f6fafc 55%)}
.gl canvas{display:block;width:100%;height:100%;touch-action:none}
.gl .tip{position:absolute;pointer-events:none;background:#1B1F24;color:#F6F6F3;font-size:12px;padding:5px 8px;border-radius:6px;transform:translate(10px,-24px);display:none;white-space:nowrap;z-index:3}
.gl .hint:empty{display:none}
.gl .hint{position:absolute;left:10px;bottom:8px;font-size:11px;color:#8A929E;background:rgba(255,255,255,.9);padding:4px 8px;border-radius:6px;max-width:70%}
.gl .where{position:absolute;right:10px;top:8px;font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:600;background:rgba(255,255,255,.9);padding:4px 8px;border-radius:6px;color:#4B5563;z-index:3}
.gl .where:empty{display:none}
.gl canvas.mini{position:absolute;right:10px;bottom:10px;width:auto;height:auto;display:none;background:rgba(255,255,255,.94);border:1px solid #DDE0E4;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.12);z-index:3;cursor:pointer}
`;

const VIEWER_BODY = String.raw`
<section class="view" id="v-gl">
  <div class="bar">
    <span class="lbl">모드</span><div class="seg" id="gl-mode"><button aria-pressed="true" data-m="orbit">돌려보기</button><button data-m="walk">걷기</button></div>
    <span class="lbl" style="margin-left:6px">층</span><div class="seg" id="gl-floor"><button data-f="0">전체</button><button data-f="-1">B1</button><button data-f="1">1층</button><button data-f="2">2층</button><button data-f="3">3층</button><button data-f="4">4층</button></div>
  </div>
  <div class="fill"><div class="gl" id="gl"><div class="tip" id="gl-tip"></div><div class="where" id="gl-where"></div><canvas class="mini" id="gl-mini"></canvas><div class="hint" id="gl-hint"></div></div></div>
</section>
`;

const VIEWER_JS = String.raw`
/* 숙소 3D 뷰어 — web(iframe srcdoc)·mobile(WebView) 공용.
   payload: { building, rooms:{num:{purpose,caption,bg,ink,label,people:[{name,grade}],dim,hidden}}, places:{id:{purpose}}, floor }
   명단이 바뀌면 { type:'setRooms', rooms } 로 칸만 다시 그린다 (시점은 그대로). */
(function () {
  var P = window.__LODGING__;
  var B = P.building, L = B.layout, ROOMS = P.rooms || {};
  var onRooms = [];   // 명단이 바뀌면 부를 것들
  var MAJOR = ['hall', 'dining', 'shop', 'fun'];
  var PLACE_COLOR = P.placeColors || {};
  var FLOORS = B.floors;
  var COLS = B.mainCols;
  var placeMap = {}; B.b1.places.forEach(function (p) { placeMap[p.id] = p; });

  function send(m) {
    try {
      if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); return; }
      if (window.parent && window.parent !== window) window.parent.postMessage(Object.assign({ source: 'lodging-viewer' }, m), '*');
    } catch (e) { /* noop */ }
  }
  function corridorRow(f) {
    var jr = L.annexJunction[f] || [], a = L.annex[f] || [];
    return jr.length >= 2 ? jr[jr.length - 2] : Math.floor(a.length / 2);
  }
  function roomOf(n) { return ROOMS[n] || { purpose: '빈방', bg: '#f3f4f6', ink: '#6b7280', people: [] }; }
  function placeColor(kind) { return PLACE_COLOR[kind] || { bg: '#e5e7eb', ink: '#374151' }; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  /** 점이 다각형([x,z]…) 안에 있나 */
  function pip(pts, x, z) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  var gl = null;
  function renderGL() {
    if (gl || !window.THREE) return;
    var host = document.getElementById('gl'), tip = document.getElementById('gl-tip'), where = document.getElementById('gl-where'), hint = document.getElementById('gl-hint'), mini = document.getElementById('gl-mini');
    var W = host.clientWidth, H = host.clientHeight;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 3000);
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(W, H); host.insertBefore(renderer.domElement, host.firstChild);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8)); var dl = new THREE.DirectionalLight(0xffffff, 0.55); dl.position.set(80, 160, 60); scene.add(dl);
    var hex = function (v) { return new THREE.Color(v || '#cccccc'); };
    var meshes = [], pick = []; var group = new THREE.Group(); scene.add(group);

    // ── 치수 ─────────────────────────────────────────────────────────
    var RW = 6, RD = 5, HALL = 3, FH = 3.2, WALL = 0.25;
    var HW = HALL / 2, CW = HALL / 2 + WALL / 2, CWW = CW + 0.04, TOP = FH - 0.3, FRONT = HW + RD;
    var mainLen = COLS * RW, XW = -mainLen / 2;          // 본관 서쪽 끝
    var jx = XW - HALL / 2 - RD;                         // 별관 복도 가운데
    // 본관은 mainBend.col 칸부터 deg 만큼 앞마당(+z) 쪽으로 꺾인다 — 일성콘도는 x13 과 x12 사이, 30°
    var BEND = L.mainBend && L.mainBend.col > 0 && L.mainBend.col < COLS ? L.mainBend : null;
    var KB = BEND ? BEND.col : COLS, TH = BEND ? (BEND.deg * Math.PI) / 180 : 0, TT = Math.tan(TH / 2);
    var UB = KB * RW, LE = mainLen - UB, PX = XW + UB;   // PX: 꺾이는 점 (복도 가운데, z = 0)
    var AX = Math.cos(TH), AZ = Math.sin(TH), NX = -Math.sin(TH), NZ = Math.cos(TH), ROT_E = -TH;
    function wp(u, v) { return [XW + u, v]; }                                  // 서쪽 토막: u 는 서쪽 끝부터
    function ep(u, v) { return [PX + u * AX + v * NX, u * AZ + v * NZ]; }       // 동쪽 토막: u 는 꺾인 점부터
    function mp(U, v) { return BEND && U > UB ? ep(U - UB, v) : wp(U, v); }     // 본관 어디든 (U 는 서쪽 끝부터)
    function toEast(x, z) { var dx = x - PX; return { u: dx * AX + z * AZ, v: dx * NX + z * NZ }; }
    var SITE = B.site || {}, LOBBY_F = SITE.lobbyFloor || 0, ENT_U = SITE.entranceCol != null ? SITE.entranceCol * RW : null;
    var TOWER = SITE.towerCols ? [SITE.towerCols[0] * RW, SITE.towerCols[1] * RW] : null;
    var COLOR_FLOOR = '#b8b0a2', COLOR_WALL = '#e9e6df', COLOR_CEIL = '#ecebe7', COLOR_LINK = '#BFDBFE', COLOR_GROUND = '#b9d6a0', COLOR_ROOF = '#a4502a';
    var slabMat = new THREE.MeshLambertMaterial({ color: hex(COLOR_FLOOR) });
    var wallMat = new THREE.MeshLambertMaterial({ color: hex(COLOR_WALL), side: THREE.DoubleSide });
    var ceilMat = new THREE.MeshBasicMaterial({ color: hex(COLOR_CEIL) });                   // 아래를 보는 면만 — 위에서 내려다보면 안 보인다
    var pickMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    var matCache = {};
    function lam(color) { return matCache[color] || (matCache[color] = new THREE.MeshLambertMaterial({ color: hex(color) })); }

    function add(m, ud) { m.userData = ud || {}; group.add(m); meshes.push(m); if (ud && (ud.num || ud.pid)) pick.push(m); return m; }
    function box(w, h, d, color, x, y, z, ud, rot) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? lam(color) : new THREE.MeshLambertMaterial({ color: color })); m.position.set(x, y, z); if (rot) m.rotation.y = rot; return add(m, ud); }
    function shapeOf(pts, flipZ) { var s = new THREE.Shape(); pts.forEach(function (p, i) { var y = flipZ ? -p[1] : p[1]; if (i) s.lineTo(p[0], y); else s.moveTo(p[0], y); }); return s; }
    /** 바닥 다각형([x,z]…)을 y0 부터 h 만큼 세운 기둥 */
    function prism(pts, y0, h, color, ud, mat) {
      var m = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeOf(pts, true), { depth: h, bevelEnabled: false }), mat || new THREE.MeshLambertMaterial({ color: color }));
      m.rotation.x = -Math.PI / 2; m.position.y = y0; return add(m, ud);
    }
    /** 납작한 판 — up 이면 위를, 아니면 아래를 본다 */
    function flat(pts, y, up, mat, ud) {
      var m = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(pts, up)), mat);
      m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2; m.position.y = y; return add(m, ud);
    }
    /** 바닥선 a→b 위에 세운 벽 */
    function wallSeg(a, b, y0, h, f) {
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.01) return null;
      var m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), wallMat);
      m.position.set((a[0] + b[0]) / 2, y0 + h / 2, (a[1] + b[1]) / 2); m.rotation.y = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);   // 판의 가로(x)를 a→b 에 맞춘다 (양면이라 앞뒤는 상관없다)
      return add(m, { f: f, shell: true });
    }
    /** 다각형 둘레를 벽으로 */
    function wallLoop(pts, y0, h, f) { pts.forEach(function (a, i) { wallSeg(a, pts[(i + 1) % pts.length], y0, h, f); }); }
    function rectPts(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
    /** 가운데 (cx,cz), 크기 w×d, rotation.y = rot 인 상자의 바닥 네 귀 */
    function boxPts(cx, cz, w, d, rot) {
      var c = Math.cos(rot || 0), s = Math.sin(rot || 0);
      return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(function (p) { return [cx + p[0] * c + p[1] * s, cz - p[0] * s + p[1] * c]; });
    }
    function circlePts(cx, cz, r, n) { var o = []; for (var i = 0; i < n; i++) { var a = (i / n) * Math.PI * 2; o.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return o; }
    function nameTex(text, bg, ink, W, H) {
      W = W || 512; H = H || 128;
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var g = cv.getContext('2d');
      g.fillStyle = bg; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = Math.max(3, H * 0.04); g.strokeRect(2, 2, W - 4, H - 4);
      var fs = Math.round(H * 0.56); g.font = '700 ' + fs + 'px sans-serif';
      var tw = g.measureText(text).width; if (tw > W * 0.88) { fs = Math.floor((fs * W * 0.88) / tw); g.font = '700 ' + fs + 'px sans-serif'; }
      g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2 + 2);
      var tx = new THREE.CanvasTexture(cv); tx.anisotropy = 4; return tx;
    }
    function panel(tex, w, h, x, y, z, rotY, ud, flatUp) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true }));
      m.position.set(x, y, z); if (flatUp) { m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, rotY || 0, 0); } else m.rotation.y = rotY || 0;
      return add(m, ud);
    }
    function signTex(text, bg, ink) { var cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; var g = cv.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 256, 96); g.fillStyle = ink || '#111'; g.font = 'bold 54px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 50); var tx = new THREE.CanvasTexture(cv); tx.anisotropy = 4; return tx; }
    // 지붕 라벨 — 방 지붕 크기에 맞춰 그린 그림. 위에서 내려다보면 그대로 읽힌다.
    function labelTex(n, W, H) {
      var r = roomOf(n);
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var g = cv.getContext('2d');
      g.fillStyle = r.bg; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = Math.max(2, H * 0.016); g.strokeRect(0, 0, W, H);
      g.fillStyle = r.ink; g.textBaseline = 'top';
      var pad = W * 0.06;
      g.font = 'bold ' + Math.round(H * 0.19) + 'px monospace';
      g.fillText(String(n), pad, H * 0.04);
      g.font = '500 ' + Math.round(H * 0.085) + 'px sans-serif';
      g.textAlign = 'right'; g.fillText(r.caption || r.purpose, W - pad, H * 0.08); g.textAlign = 'left';
      var y = H * 0.27;
      if (r.label) { g.font = '600 ' + Math.round(H * 0.085) + 'px sans-serif'; g.fillText(r.label, pad, y); y += H * 0.1; }
      var names = r.people.length ? r.people : r.hidden ? [] : (r.teachers || []).map(function (t) { return { name: t, grade: '' }; });
      var shown = names.slice(0, 6);
      var lh = Math.min(H * 0.135, (H - y - pad) / Math.max(shown.length, 1));
      shown.forEach(function (p, i) {
        var ty = y + i * lh;
        g.font = '500 ' + Math.round(lh * 0.8) + 'px sans-serif'; g.textAlign = 'left'; g.fillText(p.name, pad, ty);
        if (p.grade) { g.font = '400 ' + Math.round(lh * 0.6) + 'px sans-serif'; g.textAlign = 'right'; g.fillText(p.grade, W - pad, ty + lh * 0.18); g.textAlign = 'left'; }
      });
      var tx = new THREE.CanvasTexture(cv); tx.anisotropy = 4; return tx;
    }
    // 지붕 라벨 — 층마다 미리 만들면 그림이 너무 많아진다. 자리만 적어 두고, 지붕이 드러난 층만 만든다.
    var labels = [], labelPlan = {}, labelSets = {}, LABEL_PX = 56;
    function planLabel(n, x, y, z, w, d, f, rot) { (labelPlan[f] = labelPlan[f] || []).push({ n: n, x: x, y: y, z: z, w: w, d: d, rot: rot || 0 }); }
    function dropLabels(f) {
      (labelSets[f] || []).forEach(function (m) { group.remove(m); if (m.material.map) m.material.map.dispose(); m.material.dispose(); m.geometry.dispose(); });
      delete labelSets[f];
    }
    function makeLabels(f) {
      labelSets[f] = (labelPlan[f] || []).map(function (s) {
        var m = new THREE.Mesh(
          new THREE.PlaneGeometry(s.w, s.d),
          new THREE.MeshBasicMaterial({ map: labelTex(s.n, Math.round(s.w * LABEL_PX), Math.round(s.d * LABEL_PX)), transparent: true, opacity: roomOf(s.n).dim ? 0.35 : 1 })
        );
        m.position.set(s.x, s.y, s.z);
        m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, s.rot, 0);   // 지붕에 눕히고, 꺾인 토막이면 그만큼 돌린다
        m.userData = { num: s.n, f: f, label: true };
        group.add(m); return m;
      });
    }
    // 방 팻말 — 걷기에서만. 호수 아래 명단이 눈높이에서 읽힌다
    var PLATE_W = 1.9, PLATE_H = 1.8;
    function plateTex(n) {
      var r = roomOf(n), W = 384, H = 364;
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var g = cv.getContext('2d');
      g.fillStyle = r.bg; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 8; g.strokeRect(4, 4, W - 8, H - 8);
      g.fillStyle = r.ink; g.textBaseline = 'top';
      g.font = 'bold 66px monospace'; g.fillText(String(n), 20, 14);
      g.font = '600 28px sans-serif'; g.textAlign = 'right'; g.fillText(r.caption || r.purpose, W - 20, 34); g.textAlign = 'left';
      var y = 94;
      if (r.label) { g.font = '600 28px sans-serif'; g.fillText(r.label, 20, y); y += 36; }
      var names = r.people.length ? r.people : r.hidden ? [] : (r.teachers || []).map(function (t) { return { name: t, grade: '' }; });
      var shown = names.slice(0, 5), more = names.length > 5, lh = Math.min(54, (H - y - 12) / Math.max(1, shown.length + (more ? 1 : 0)));
      shown.forEach(function (p, i) {
        var ty = y + i * lh;
        g.font = '600 ' + Math.round(lh * 0.84) + 'px sans-serif'; g.fillText(p.name, 20, ty);
        if (p.grade) { g.textAlign = 'right'; g.font = '400 ' + Math.round(lh * 0.58) + 'px sans-serif'; g.fillText(p.grade, W - 20, ty + lh * 0.2); g.textAlign = 'left'; }
      });
      if (more) { g.font = '400 ' + Math.round(lh * 0.6) + 'px sans-serif'; g.fillText('외 ' + (names.length - 5) + '명', 20, y + 5 * lh); }
      var tx = new THREE.CanvasTexture(cv); tx.anisotropy = 4; return tx;
    }
    function plate(n, x, y, z, rotY, f) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(PLATE_W, PLATE_H), new THREE.MeshBasicMaterial({ map: plateTex(n), side: THREE.DoubleSide, transparent: true, opacity: roomOf(n).dim ? 0.35 : 1 }));
      m.position.set(x, y, z); m.rotation.y = rotY;
      return add(m, { f: f, num: n, walkOnly: true });
    }
    function sign(text, bg, ink, x, y, z, rotY, f, ud) { var m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshBasicMaterial({ map: signTex(text, bg, ink), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = rotY; m.userData = Object.assign({ f: f }, ud || {}); group.add(m); meshes.push(m); if (ud) pick.push(m); return m; }
    var floorY = function (f) { return f === -1 ? -FH : (f - 1) * FH; };
    var roomBox = {}, roomSign = {}, roomDoor = {};
    var mapPolys = {}, floorPicks = [], floorBounds = {}, areas = {}, obst = {};
    function grow(bx, pts) { pts.forEach(function (p) { bx.x0 = Math.min(bx.x0, p[0]); bx.x1 = Math.max(bx.x1, p[0]); bx.z0 = Math.min(bx.z0, p[1]); bx.z1 = Math.max(bx.z1, p[1]); }); return bx; }
    function newBox() { return { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 }; }
    function annexZ(f) { var rows = (L.annex[f] || []).length, jr = corridorRow(f) + 0.5; return rows ? [-jr * RW - RW / 2, (rows - 1 - jr) * RW + RW / 2] : null; }
    /** 걸을 수 있는 곳 (key: west/east/annex 는 복도 — 누르면 가운데 줄로, free 는 누른 자리로) */
    function addArea(f, key, name, pts, pickIt) {
      (areas[f] = areas[f] || []).push({ key: key, name: name, pts: pts });
      if (pickIt !== false) floorPicks.push(flat(pts, floorY(f) + 0.21, true, pickMat, { f: f, walk: key }));
    }
    function addObst(f, pts) { (obst[f] = obst[f] || []).push(pts); }
    /** 본관을 꺾인 점에서 두 토막으로 — 이음매는 두 토막 사이 각을 반으로 가르는 선 */
    function mainStrip(V, uw, ue) {
      if (!BEND) return [[wp(uw, -V), wp(mainLen + ue, -V), wp(mainLen + ue, V), wp(uw, V)]];
      return [[wp(uw, -V), wp(UB + V * TT, -V), wp(UB - V * TT, V), wp(uw, V)], [ep(-V * TT, -V), ep(LE + ue, -V), ep(LE + ue, V), ep(V * TT, V)]];
    }

    FLOORS.forEach(function (f) {
      var y = floorY(f), m = L.main[f], polys = (mapPolys[f] = []), fb = (floorBounds[f] = newBox());
      var offU = COLS - m.upper.length, offL = COLS - m.lower.length, lobby = f === LOBBY_F;
      mainStrip(FRONT + 1, -1, 1).forEach(function (pts) { prism(pts, y - 0.075, 0.15, null, { f: f }, slabMat); grow(fb, pts); });

      // 본관 방 — 꺾인 점 바로 옆 방은 이음매를 따라 사다리꼴
      function mainRoom(n, i, upper) {
        var va = upper ? -FRONT + WALL / 2 : HW + WALL / 2, vb = upper ? -HW - WALL / 2 : FRONT - WALL / 2;
        var east = i >= KB, U0 = i * RW + WALL / 2, U1 = (i + 1) * RW - WALL / 2;
        var u0 = function (v) { return east ? (i === KB ? v * TT + WALL / 2 : U0 - UB) : U0; };
        var u1 = function (v) { return east ? U1 - UB : (BEND && i === KB - 1 ? UB - v * TT - WALL / 2 : U1); };
        var T = east ? ep : wp, rot = east ? ROT_E : 0, r = roomOf(n);
        var pts = [T(u0(va), va), T(u1(va), va), T(u1(vb), vb), T(u0(vb), vb)];
        roomBox[n] = prism(pts, y + 0.1, FH - 0.4, hex(r.bg), { num: n, f: f });
        var vd = upper ? vb : va, pp = T((u0(vd) + u1(vd)) / 2, vd + (upper ? 0.02 : -0.02));
        roomSign[n] = plate(n, pp[0], y + 1.65, pp[1], (upper ? 0 : Math.PI) + rot, f);
        var s = upper ? 1 : -1;
        roomDoor[n] = { x: pp[0], z: pp[1], nx: s * (east ? NX : 0), nz: s * (east ? NZ : 1), f: f };
        var lu0 = Math.max(u0(va), u0(vb)), lu1 = Math.min(u1(va), u1(vb)), c = T((lu0 + lu1) / 2, (va + vb) / 2);
        planLabel(n, c[0], y + TOP + 0.02, c[1], lu1 - lu0, vb - va, f, rot);
        polys.push({ pts: pts, num: n }); grow(fb, pts);
      }
      m.upper.forEach(function (n, i) { mainRoom(n, i + offU, true); });
      m.lower.forEach(function (n, i) { mainRoom(n, i + offL, false); });

      // 본관 복도 — 천장, 양옆 벽(방 사이 틈을 막는다), 동쪽 끝 벽. 로비 층은 방이 없는 칸이 로비라 벽을 트고 바깥벽을 두른다
      var wy = y + 0.075, wh = TOP - 0.075, ceilY = y + TOP;
      mainStrip(CW, 0, 0).forEach(function (pts) { flat(pts, ceilY, false, ceilMat, { f: f, shell: true }); polys.push({ pts: pts, corr: true }); });
      var cs = mainStrip(HW, 0, 0); cs[0][0] = [jx + HW, -HW]; cs[0][3] = [jx + HW, HW];            // 서쪽 판은 통로까지
      addArea(f, 'west', '본관 복도', cs[0]); if (cs[1]) addArea(f, 'east', '본관 복도', cs[1]);
      function sideWall(sgn, uStart) {
        var V = sgn * CWW;
        if (BEND) { if (uStart < UB) wallSeg(wp(uStart, V), wp(UB - V * TT, V), wy, wh, f); wallSeg(ep(V * TT, V), ep(LE, V), wy, wh, f); }
        else wallSeg(wp(uStart, V), wp(mainLen, V), wy, wh, f);
      }
      sideWall(-1, lobby ? offU * RW : 0); sideWall(1, lobby ? offL * RW : 0);
      wallSeg(mp(mainLen, -CWW), mp(mainLen, CWW), wy, wh, f);
      if (lobby) {
        var nU = offU * RW, sU = offL * RW;
        var lobN = [wp(0, -FRONT), wp(nU, -FRONT), wp(nU, -HW), wp(0, -HW)], lobS = [wp(0, HW), wp(sU, HW), wp(sU, FRONT), wp(0, FRONT)];
        [lobN, lobS].forEach(function (pts) {
          if (pts[1][0] - pts[0][0] < 0.5) return;
          flat(pts, y + 0.085, true, lam('#a89c86'), { f: f });   // 위에서 빛을 받으면 밝아진다 — 조금 어둡게
          flat(pts, ceilY, false, ceilMat, { f: f, shell: true });
          addArea(f, 'free', '로비', pts); polys.push({ pts: pts, lobby: true });
        });
        if (nU > 0) { wallSeg(wp(0, -FRONT), wp(nU, -FRONT), wy, wh, f); wallSeg(wp(0, -FRONT), wp(0, -HW), wy, wh, f); }
        if (sU > 0) {
          wallSeg(wp(0, HW), wp(0, FRONT), wy, wh, f);
          if (ENT_U != null && ENT_U > 2.5 && ENT_U < sU - 2.5) { wallSeg(wp(0, FRONT), wp(ENT_U - 2.5, FRONT), wy, wh, f); wallSeg(wp(ENT_U + 2.5, FRONT), wp(sU, FRONT), wy, wh, f); }
          else wallSeg(wp(0, FRONT), wp(sU, FRONT), wy, wh, f);
        }
        // 프런트 데스크
        if (nU >= 12) { var dk = boxPts(XW + nU / 2, -FRONT + 1.4, Math.min(10, nU - 4), 0.9, 0); prism(dk, y + 0.08, 1.1, '#8b6b4a', { f: f }); addObst(f, dk); }
        var lobTex = nameTex('로비·프런트', '#e7e0d2', '#6b5b45', 512, 128);
        var lc = sU >= nU ? wp(sU / 2, (HW + FRONT) / 2) : wp(nU / 2, -(HW + FRONT) / 2);
        panel(lobTex, 7, 1.75, lc[0], y + 0.1, lc[1], 0, { f: f, orbitOnly: true }, true);
      }

      // 별관 — 세로 복도 양옆 [왼쪽, 오른쪽]
      var a = L.annex[f] || [], jrow = corridorRow(f) + 0.5, az = annexZ(f);
      if (az) {
        var VA = FRONT + 1, sp = rectPts(jx - VA, jx + VA, az[0] - 1, az[1] + 1);
        prism(sp, y - 0.075, 0.15, null, { f: f }, slabMat); grow(fb, sp);
        a.forEach(function (pair, i) {
          var z = (i - jrow) * RW;
          [[pair[0], -1], [pair[1], 1]].forEach(function (ps) {
            var n = ps[0], s = ps[1]; if (!n) return; var r = roomOf(n); var x = jx + s * (HALL / 2 + RD / 2);
            var hx = (RD - WALL) / 2, hz = (RW - WALL) / 2, pts = rectPts(x - hx, x + hx, z - hz, z + hz);
            roomBox[n] = prism(pts, y + 0.1, FH - 0.4, hex(r.bg), { num: n, f: f });
            var face = x - s * (RD / 2 - WALL / 2 + 0.02);   // 복도 쪽 벽 바로 바깥
            roomSign[n] = plate(n, face, y + 1.65, z, s < 0 ? Math.PI / 2 : -Math.PI / 2, f);
            roomDoor[n] = { x: face, z: z, nx: -s, nz: 0, f: f };
            planLabel(n, x, y + TOP + 0.02, z, RD - WALL, RW - WALL, f, 0);
            polys.push({ pts: pts, num: n });
          });
        });
        var ac = rectPts(jx - CW, jx + CW, az[0], az[1]);
        flat(ac, ceilY, false, ceilMat, { f: f, shell: true }); polys.push({ pts: ac, corr: true });
        addArea(f, 'annex', '별관 복도', rectPts(jx - HW, jx + HW, az[0], az[1]));
        wallSeg([jx - CWW, az[0]], [jx - CWW, az[1]], wy, wh, f);
        wallSeg([jx + CWW, az[0]], [jx + CWW, -HW - 0.08], wy, wh, f);    // 통로 자리는 비운다
        wallSeg([jx + CWW, HW + 0.08], [jx + CWW, az[1]], wy, wh, f);
        wallSeg([jx - CWW, az[0]], [jx + CWW, az[0]], wy, wh, f);
        wallSeg([jx - CWW, az[1]], [jx + CWW, az[1]], wy, wh, f);
      }
      // 본관 서쪽 끝 ↔ 별관 복도 사이 통로 (유리 연결동)
      var lx0 = jx + HW, lx1 = XW, lcx = (lx0 + lx1) / 2, llen = lx1 - lx0;
      box(llen, 0.2, HALL, hex(COLOR_LINK), lcx, y + 0.1, 0, { f: f, link: true });
      box(llen, TOP - 0.1, 0.15, hex('#d1d5db'), lcx, y + 0.1 + (TOP - 0.1) / 2, -HW - 0.08, { f: f, link: true });
      box(llen, TOP - 0.1, 0.15, hex('#d1d5db'), lcx, y + 0.1 + (TOP - 0.1) / 2, HW + 0.08, { f: f, link: true });
      var lp = rectPts(lx0, lx1, -HW, HW);
      flat(lp, ceilY, false, ceilMat, { f: f, shell: true }); polys.push({ pts: lp, corr: true });
    });

    // ── 지하 1층 — 배치도 그림 좌표를 본관 바닥에 펴고, 꺾인 점 동쪽은 같이 꺾는다 ──
    var b1Box = newBox(), B1Y = floorY(-1), b1Start = null, b1Centers = [];
    (function () {
      var y = B1Y, vb = B.b1.viewBox, vx = vb[0], vy = vb[1], vw = vb[2], vh = vb[3], sx = (mainLen + 16) / vw, sz = (FRONT * 2 + 30) / vh, V = (FRONT * 2 + 30) / 2;
      var polys = (mapPolys[-1] = []);
      function at(px, py) { var U = (px - vx) * sx - 8, v = (py - vy - vh / 2) * sz; return { c: mp(U, v), rot: BEND && U > UB - v * TT ? ROT_E : 0 }; }
      b1Start = at(vx + vw * 0.48, 396).c;
      var strip = mainStrip(V, -8, 8);
      strip.forEach(function (pts) { prism(pts, y - 0.075, 0.15, null, { f: -1 }, slabMat); flat(pts, y + TOP, false, ceilMat, { f: -1, shell: true }); grow(b1Box, pts); addArea(-1, 'free', '지하 1층', pts); polys.push({ pts: pts, corr: true }); });
      wallLoop(strip.length > 1 ? [strip[0][0], strip[0][1], strip[1][1], strip[1][2], strip[0][2], strip[0][3]] : strip[0], y + 0.075, TOP - 0.075, -1);
      B.b1.gray.forEach(function (g) {
        var q = at((g[0] + g[2]) / 2, (g[1] + g[3]) / 2), w = (g[2] - g[0]) * sx, d = (g[3] - g[1]) * sz, pts = boxPts(q.c[0], q.c[1], w, d, q.rot);
        box(w, TOP - 0.1, d, '#d6d3cc', q.c[0], y + 0.1 + (TOP - 0.1) / 2, q.c[1], { f: -1 }, q.rot); addObst(-1, pts); polys.push({ pts: pts, gray: true });
      });
      B.b1.places.forEach(function (p) {
        var q = at((p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2), w = Math.max((p.box[2] - p.box[0]) * sx - 0.3, 0.6), d = Math.max((p.box[3] - p.box[1]) * sz - 0.3, 0.6), pc = placeColor(p.kind), c = q.c, rot = q.rot;
        box(w, TOP - 0.1, d, hex(pc.bg), c[0], y + 0.1 + (TOP - 0.1) / 2, c[1], { pid: p.id, f: -1 }, rot);
        var pts = boxPts(c[0], c[1], w, d, rot); addObst(-1, pts); polys.push({ pts: pts, place: p }); b1Centers.push({ name: p.name, x: c[0], z: c[1], r: Math.max(w, d) / 2 });
        if (MAJOR.indexOf(p.kind) >= 0) { var s = sign(p.name, pc.bg, pc.ink, c[0], y + TOP + 0.05, c[1], 0, -1, { pid: p.id }); s.scale.set(Math.max(2, w / 3), Math.max(2, w / 3) * 0.5, 1); s.rotation.order = 'YXZ'; s.rotation.set(-Math.PI / 2, rot, 0); s.userData.orbitOnly = true; }
        // 걷기용 이름판 — 네 벽마다
        [[w / 2, 0, Math.PI / 2, d], [-w / 2, 0, -Math.PI / 2, d], [0, d / 2, 0, w], [0, -d / 2, Math.PI, w]].forEach(function (sd) {
          var len = sd[3]; if (len < 1.2) return;
          var pw = Math.min(len - 0.4, 2.8), ph = 0.55, cc = Math.cos(rot), ss = Math.sin(rot), ox = sd[0] ? sd[0] + Math.sign(sd[0]) * 0.03 : 0, oz = sd[1] ? sd[1] + Math.sign(sd[1]) * 0.03 : 0;
          var tex = nameTex(p.name, pc.bg, pc.ink, Math.round((128 * pw) / ph), 128);
          panel(tex, pw, ph, c[0] + ox * cc + oz * ss, y + 2.0, c[1] - ox * ss + oz * cc, rot + sd[2], { f: -1, pid: p.id, walkOnly: true });
        });
      });
    })();
    // 땅·해안·바다 — 서로 겹치지 않게 이어 붙인다.
    // 겹쳐 두면 멀리서 볼 때 깊이 값이 거의 같아 녹색과 하늘색이 번갈아 비친다(z-fighting).
    var sea = new THREE.Group(); scene.add(sea);
    var SHORE = (function () { var nz = 0; FLOORS.forEach(function (f) { var az = annexZ(f); if (az) nz = Math.max(nz, -az[0]); }); return -(nz || 30) - 9; })();
    function strip(z0, z1, color) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(700, z1 - z0), new THREE.MeshLambertMaterial({ color: hex(color) }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0, (z0 + z1) / 2); sea.add(m); return m;
    }
    var ground = strip(SHORE, 360, COLOR_GROUND);   // 땅 (해안선부터 남쪽)
    strip(SHORE - 5, SHORE, '#3c3f42');              // 현무암 해안
    strip(-360, SHORE - 5, '#78a9c7');               // 바다
    function setGround(y) { sea.position.y = y; }

    // ── 1층 앞마당 — 정문, 로터리, 주차장, 진입로, 야자수 (항공사진 참고) ──
    var siteBox = newBox();
    if (LOBBY_F && ENT_U != null) (function () {
      var f = LOBBY_F, y0 = floorY(f), gy = y0 - 0.12, polys = mapPolys[f];
      var seed = 11; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
      var fz = FRONT + 3;                                          // 건물 앞 잔디 3칸 띄우고 아스팔트
      var A0 = [XW + 1, fz], A1 = BEND ? wp(UB - fz * TT, fz) : wp(mainLen + 3, fz), A2 = BEND ? ep(LE + 3, fz) : null;
      var east = A2 ? A2[0] + 6 : A1[0], SZ = 50;
      var asphalt = A2 ? [A0, A1, A2, [east, SZ], [XW + 1, SZ]] : [A0, A1, [A1[0], SZ], [XW + 1, SZ]];
      var C = wp(ENT_U, FRONT + 16), RR = 5.5;
      var road = rectPts(C[0] - 5, C[0] + 5, SZ - 0.5, SZ + 11);
      var portico = [wp(ENT_U - 5, FRONT), wp(ENT_U + 5, FRONT), wp(ENT_U + 5, FRONT + 7), wp(ENT_U - 5, FRONT + 7)];
      flat(asphalt, gy + 0.05, true, lam('#4a5260'), { f: f }); flat(road, gy + 0.05, true, lam('#4a5260'), { f: f });
      flat(portico, gy + 0.07, true, lam('#9d9483'), { f: f });   // 정문 앞 포장
      flat(rectPts(-200, 200, SZ + 10.5, SZ + 17), gy + 0.02, true, lam('#3d434d'), { f: f });
      flat(rectPts(-200, 200, SZ + 9, SZ + 10.5), gy + 0.02, true, lam('#9b4a3c'), { f: f });
      polys.push({ pts: asphalt, site: '#8a919c' }, { pts: road, site: '#8a919c' }, { pts: portico, lobby: true });
      addArea(f, 'free', '주차장', asphalt); addArea(f, 'free', '주차장', road); addArea(f, 'free', '입구', portico);
      // 흰 선 — 주차칸·진입로 가운데 점선을 한 덩어리로
      var lines = [];
      function line(x0, z0, x1, z1, wd) { var dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * wd / 2, nz = (dx / l) * wd / 2; lines.push([[x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz], [x0 - nx, z0 - nz]]); }
      var cars = [];
      function stallRow(xa, xb, z0, z1) {
        var SW = 2.6, n = Math.floor((xb - xa) / SW), kept = [];
        for (var i = 0; i < n; i++) { var sx0 = xa + i * SW, sx1 = sx0 + SW; if ([[sx0, z0], [sx1, z0], [sx1, z1], [sx0, z1]].every(function (p) { return pip(asphalt, p[0], p[1]); })) kept.push([sx0, sx1]); }
        if (!kept.length) return;
        kept.forEach(function (k, i) { line(k[0], z0, k[0], z1, 0.12); if (i === kept.length - 1) line(k[1], z0, k[1], z1, 0.12); if (rnd() < 0.55) cars.push([(k[0] + k[1]) / 2, (z0 + z1) / 2]); });
        line(kept[0][0], z1, kept[kept.length - 1][1], z1, 0.12);
      }
      var wx0 = XW + 2, wx1 = C[0] - RR - 3.5, ex0 = C[0] + RR + 3.5, ex1 = east;
      [[fz + 0.7, fz + 5.9], [24, 29.2], [29.2, 34.4], [42, 47.2]].forEach(function (r) { stallRow(wx0, wx1, r[0], r[1]); stallRow(ex0, ex1, r[0], r[1]); });
      for (var dz = SZ + 0.5; dz < SZ + 9; dz += 2.2) line(C[0], dz, C[0], dz + 1.1, 0.15);
      var lg = new THREE.BufferGeometry(), lv = [];
      lines.forEach(function (q) { [0, 1, 2, 0, 2, 3].forEach(function (k) { lv.push(q[k][0], gy + 0.1, q[k][1]); }); });
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lv, 3)); lg.computeVertexNormals();
      add(new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0xf5f5f5, side: THREE.DoubleSide })), { f: f });
      // 차 — 흰 차가 많다
      var dummy = new THREE.Object3D(), CC = ['#f4f5f7', '#f4f5f7', '#f4f5f7', '#c9ced6', '#2f3540', '#9aa3ad'];
      var body = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.8, 4.2), new THREE.MeshLambertMaterial({ color: 0xffffff }), cars.length);
      var cab = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), new THREE.MeshLambertMaterial({ color: 0xffffff }), cars.length);
      cars.forEach(function (cp, i) {
        var col = hex(CC[Math.floor(rnd() * CC.length)]);
        dummy.position.set(cp[0], gy + 0.47, cp[1]); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); body.setMatrixAt(i, dummy.matrix); body.setColorAt(i, col);
        dummy.position.set(cp[0], gy + 1.17, cp[1] + 0.2); dummy.updateMatrix(); cab.setMatrixAt(i, dummy.matrix); cab.setColorAt(i, col.clone().multiplyScalar(0.85));
        addObst(f, boxPts(cp[0], cp[1], 1.9, 4.3, 0));
      });
      if (cars.length) { add(body, { f: f }); add(cab, { f: f }); }
      // 로터리 — 잔디 원 + 흰 조형물
      var ring = new THREE.Mesh(new THREE.CylinderGeometry(RR, RR, 0.35, 40), lam('#7fae5b')); ring.position.set(C[0], gy + 0.17, C[1]); add(ring, { f: f });
      var ped = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.8, 16), lam('#d9d6cf')); ped.position.set(C[0], gy + 0.75, C[1]); add(ped, { f: f });
      var art = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.22, 10, 32), lam('#f2f2f0')); art.position.set(C[0], gy + 2.45, C[1]); add(art, { f: f });
      addObst(f, circlePts(C[0], C[1], RR + 0.3, 20)); polys.push({ pts: circlePts(C[0], C[1], RR, 20), site: '#7fae5b' });
      // 정문 차양 — 기둥 넷 + 흰 처마 + 주황 모임지붕
      var pu0 = ENT_U - 5, pu1 = ENT_U + 5, pv0 = FRONT, pv1 = FRONT + 7;
      [[pu0 + 0.5, pv1 - 0.5], [pu1 - 0.5, pv1 - 0.5], [pu0 + 0.5, pv0 + 2.2], [pu1 - 0.5, pv0 + 2.2]].forEach(function (q) { var c = wp(q[0], q[1]); box(0.5, 2.8, 0.5, '#f2f0ea', c[0], y0 + 1.5, c[1], { f: f }); addObst(f, boxPts(c[0], c[1], 0.6, 0.6, 0)); });
      var cc = wp(ENT_U, (pv0 + pv1) / 2); box(10.4, 0.45, 7.2, '#f2f0ea', cc[0], y0 + 3.1, cc[1], { f: f });
      var sgn = wp(ENT_U, pv1 + 0.24); panel(nameTex('입구', '#f2f0ea', '#374151', 384, 128), 2.4, 0.8, sgn[0], y0 + 3.1, sgn[1], 0, { f: f });
      (function () {
        var tris = [], ry = y0 + 3.33, rh = 1.5, a = wp(pu0 - 0.4, pv0), b = wp(pu1 + 0.4, pv0), c2 = wp(pu1 + 0.4, pv1 + 0.4), d = wp(pu0 - 0.4, pv1 + 0.4), r1 = wp(pu0 - 0.4 + 3.8, (pv0 + pv1 + 0.4) / 2), r2 = wp(pu1 + 0.4 - 3.8, (pv0 + pv1 + 0.4) / 2);
        function P3(p, h) { return [p[0], ry + h, p[1]]; }
        [[a, b, r2, r1], [c2, d, r1, r2]].forEach(function (q) { tris.push(P3(q[0], 0), P3(q[1], 0), P3(q[2], rh), P3(q[0], 0), P3(q[2], rh), P3(q[3], rh)); });
        tris.push(P3(b, 0), P3(c2, 0), P3(r2, rh), P3(d, 0), P3(a, 0), P3(r1, rh));
        var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([].concat.apply([], tris), 3)); g.computeVertexNormals();
        add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: hex(COLOR_ROOF), side: THREE.DoubleSide })), { f: f });
      })();
      // 야자수
      var trees = [];
      for (var tx = XW + 3; tx < east; tx += 7) if (Math.abs(tx - C[0]) > 8) trees.push([tx, SZ + 4]);
      [-13, -21, 11, 19].forEach(function (du) { trees.push(wp(ENT_U + du, FRONT + 1.6)); });
      if (BEND) [6, 14, 22].forEach(function (du) { trees.push(ep(du, FRONT + 1.6)); });
      trees.push([C[0] - 7.5, SZ + 3], [C[0] + 7.5, SZ + 3]);
      var trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 4.6, 6), lam('#8a6a4c'), trees.length);
      var crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 0), lam('#3f7d3a'), trees.length);
      trees.forEach(function (t, i) {
        var h = 4.2 + rnd() * 1.4;
        dummy.position.set(t[0], gy + h / 2, t[1]); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, h / 4.6, 1); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix);
        dummy.position.set(t[0], gy + h + 0.2, t[1]); dummy.rotation.set(0, rnd() * 3, 0); dummy.scale.set(1.3, 0.5, 1.3); dummy.updateMatrix(); crown.setMatrixAt(i, dummy.matrix);
        addObst(f, boxPts(t[0], t[1], 0.8, 0.8, 0));
      });
      dummy.scale.set(1, 1, 1);
      add(trunk, { f: f }); add(crown, { f: f });
      grow(siteBox, asphalt); grow(siteBox, road);
    })();

    // ── 지붕 — 사진처럼 주황 기와 모임지붕, 가운데 흰 탑은 한 층 더 ──
    var roofMeshes = [], TOPF = FLOORS[FLOORS.length - 1], RY = floorY(TOPF) + TOP, RH = 2.4, EAVE = 0.6, RV = FRONT + EAVE;
    (function () {
      var tris = [], gables = [];
      function P3(p, h) { return [p[0], RY + h, p[1]]; }
      function tri(list, a, b, c) { list.push(a, b, c); }
      /** 한 토막 지붕. 끝마다 hip(모임) / gable(박공, 흰 벽) / miter(꺾인 이음매) */
      function piece(T, ua, ub, ta, tb, eastFrame) {
        var nA = ta === 'miter' ? -RV * TT : 0, sA = ta === 'miter' ? RV * TT : 0, nB = tb === 'miter' ? RV * TT : 0, sB = tb === 'miter' ? -RV * TT : 0;
        var NA = T(ua + nA, -RV), SA = T(ua + sA, RV), NB = T(ub + nB, -RV), SB = T(ub + sB, RV);
        var RA = T(ua + (ta === 'hip' ? RV : 0), 0), RB = T(ub - (tb === 'hip' ? RV : 0), 0);
        tri(tris, P3(NA, 0), P3(NB, 0), P3(RB, RH)); tri(tris, P3(NA, 0), P3(RB, RH), P3(RA, RH));
        tri(tris, P3(SB, 0), P3(SA, 0), P3(RA, RH)); tri(tris, P3(SB, 0), P3(RA, RH), P3(RB, RH));
        if (ta !== 'miter') tri(ta === 'hip' ? tris : gables, P3(NA, 0), P3(RA, RH), P3(SA, 0));
        if (tb !== 'miter') tri(tb === 'hip' ? tris : gables, P3(NB, 0), P3(RB, RH), P3(SB, 0));
      }
      var endW = BEND ? UB : mainLen + EAVE, tW = BEND ? 'miter' : 'hip';
      if (TOWER && TOWER[0] > 2 && TOWER[1] < endW - 2) { piece(wp, -EAVE, TOWER[0], 'hip', 'gable'); piece(wp, TOWER[1], endW, 'gable', tW); }
      else piece(wp, -EAVE, endW, 'hip', tW);
      if (BEND) piece(ep, 0, LE + EAVE, 'miter', 'hip');
      var z0 = 1e9, z1 = -1e9; FLOORS.forEach(function (f) { var az = annexZ(f); if (az) { z0 = Math.min(z0, az[0]); z1 = Math.max(z1, az[1]); } });
      if (z1 > z0) {
        var n0 = z0 - EAVE, n1 = z1 + EAVE, w0 = [jx - RV, n0], w1 = [jx - RV, n1], e0 = [jx + RV, n0], e1 = [jx + RV, n1], q0 = [jx, n0 + RV], q1 = [jx, n1 - RV];
        tri(tris, P3(w0, 0), P3(w1, 0), P3(q1, RH)); tri(tris, P3(w0, 0), P3(q1, RH), P3(q0, RH));
        tri(tris, P3(e1, 0), P3(e0, 0), P3(q0, RH)); tri(tris, P3(e1, 0), P3(q0, RH), P3(q1, RH));
        tri(tris, P3(w0, 0), P3(q0, RH), P3(e0, 0)); tri(tris, P3(w1, 0), P3(e1, 0), P3(q1, RH));
      }
      function mesh(list, color) { var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([].concat.apply([], list), 3)); g.computeVertexNormals(); var m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: hex(color), side: THREE.DoubleSide })); m.userData = { roof: true }; group.add(m); roofMeshes.push(m); }
      mesh(tris, COLOR_ROOF); if (gables.length) mesh(gables, '#f2f0ea');
      var glass = new THREE.Mesh(new THREE.BoxGeometry(XW - (jx + HW), 0.12, HALL + 0.4), new THREE.MeshLambertMaterial({ color: hex('#9CC3E6') }));
      glass.position.set((XW + jx + HW) / 2, RY + 0.06, 0); glass.userData = { roof: true }; group.add(glass); roofMeshes.push(glass);
      if (TOWER) {   // 흰 탑 — 5층 한 칸 + 옥상 기계실
        var tw = TOWER[1] - TOWER[0], tc = wp((TOWER[0] + TOWER[1]) / 2, 0), td = FRONT * 2 + 0.6;
        [[tw, FH, td, RY + FH / 2, '#f4f3ef'], [tw + 0.3, 0.35, td + 0.3, RY + FH + 0.17, '#e3e1db'], [tw * 0.45, 1.8, td * 0.4, RY + FH + 1.25, '#f4f3ef']].forEach(function (b) {
          var m = new THREE.Mesh(new THREE.BoxGeometry(b[0], b[1], b[2]), lam(b[4])); m.position.set(tc[0], b[3], tc[1]); m.userData = { roof: true }; group.add(m); roofMeshes.push(m);
        });
      }
    })();
    var bounds = newBox(); FLOORS.forEach(function (f) { var b = floorBounds[f]; grow(bounds, [[b.x0, b.z0], [b.x1, b.z1]]); });

    // ── 카메라 ───────────────────────────────────────────────────────
    var mode = 'orbit', rotY = 0.75, rotX = 0.55, dist = 115, target = new THREE.Vector3(-14, 6, 4), camTouched = false;
    var yaw = -Math.PI / 2, pitch = -0.12; var eye = new THREE.Vector3(jx, floorY(2) + 1.6, 0);
    var keys = {};
    var c = renderer.domElement;
    function placeOrbit() { camera.position.set(target.x + Math.sin(rotY) * Math.cos(rotX) * dist, target.y + Math.sin(rotX) * dist, target.z + Math.cos(rotY) * Math.cos(rotX) * dist); camera.lookAt(target); }
    function placeWalk() { camera.position.copy(eye); camera.rotation.set(0, 0, 0, 'YXZ'); camera.rotation.y = yaw; camera.rotation.x = pitch; }
    function cornerPts(b, y0, y1) { var o = []; [b.x0, b.x1].forEach(function (x) { [b.z0, b.z1].forEach(function (z) { [y0, y1].forEach(function (y) { o.push(new THREE.Vector3(x, y, z)); }); }); }); return o; }
    /** 점들이 화면에 다 들어오게 거리를 맞춘다 — 기울이면 계산이 잘 안 맞아 몇 번 찍어 보고 조인다 */
    function fitPts(pts, lo, hi) {
      for (var it = 0; it < 6; it++) {
        placeOrbit(); camera.updateMatrixWorld(true);
        var mx = 0; pts.forEach(function (p) { var q = p.clone().project(camera); mx = Math.max(mx, Math.abs(q.x), Math.abs(q.y)); });
        var over = mx / 0.9; if (!isFinite(over) || over <= 0 || Math.abs(over - 1) < 0.01) break;
        dist = clamp(dist * over, lo, hi);
      }
    }
    // 드래그로 화면 옮기기 (오른쪽 버튼·Shift·두 손가락)
    function panBy(dx, dy) {
      var k = dist * 0.0017;
      target.x += -dx * k * Math.cos(rotY) + dy * k * -Math.sin(rotY);
      target.z += -dx * k * -Math.sin(rotY) + dy * k * -Math.cos(rotY);
    }

    // ── 층 고르기 — 돌려보기는 여러 층을 켜고 끄고, 걷기는 한 층 ─────────────
    var ALLF = [-1].concat(FLOORS), sel = {}, walkFloor = 1;
    function selList() { return ALLF.filter(function (f) { return sel[f]; }); }
    function roofOn() { return mode === 'orbit' ? FLOORS.every(function (f) { return sel[f]; }) : walkFloor >= 1; }
    function syncLabels() {
      // 바로 위층이 꺼져 지붕이 드러난 층에만 라벨. 1~4층을 다 켜면 기와지붕이 덮는다
      var want = mode !== 'orbit' || roofOn() ? [] : FLOORS.filter(function (f) { return sel[f] && !sel[f + 1]; });
      Object.keys(labelSets).forEach(function (k) { if (want.indexOf(+k) < 0) dropLabels(+k); });
      want.forEach(function (f) { if (!labelSets[f]) makeLabels(f); });
      labels = [].concat.apply([], Object.keys(labelSets).map(function (k) { return labelSets[k]; }));
    }
    var floorBar = document.getElementById('gl-floor'), modeBar = document.getElementById('gl-mode');
    function drawBars() {
      floorBar.querySelectorAll('button').forEach(function (b) {
        var f = +b.dataset.f;
        if (mode === 'walk') { b.style.display = f !== 0 ? '' : 'none'; b.setAttribute('aria-pressed', String(f === walkFloor)); }
        else { b.style.display = ''; b.setAttribute('aria-pressed', String(f === 0 ? FLOORS.every(function (g) { return sel[g]; }) : !!sel[f])); }
      });
      modeBar.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.m === mode)); });
    }
    function isVis(ud) {
      var f = ud.f;
      if (ud.walkOnly && mode !== 'walk') return false;
      if (ud.orbitOnly && mode === 'walk') return false;
      if (mode === 'walk') {
        if (ud.walk || ud.walkOnly) return f === walkFloor;
        return walkFloor === -1 ? f === -1 : f >= 1;          // 지상에서는 건물 전체(밖에서 봐도 건물이다), 지하는 지하만
      }
      return !!sel[f];
    }
    function applyVis() {
      meshes.forEach(function (m) { m.visible = isVis(m.userData); });
      var ro = roofOn(); roofMeshes.forEach(function (m) { m.visible = ro; });
      setGround(mode === 'orbit' && sel[-1] ? -FH - 0.2 : -0.15);
      syncLabels(); drawBars();
    }
    /** 고른 층에 맞춰 카메라 — 한 층이면 위에서 그 층을 꽉 차게, 여러 층이면 앞마당 쪽에서 비스듬히 */
    function frameSel() {
      var S = selList();
      if (S.length === 1 && S[0] > 0) {
        var f = S[0], fb = floorBounds[f]; rotY = 0; rotX = 1.15; target.set((fb.x0 + fb.x1) / 2, floorY(f) + 1.5, (fb.z0 + fb.z1) / 2);
        fitPts(cornerPts(fb, floorY(f), floorY(f)), 25, 170);
      } else if (S.length === 1) {
        rotY = 0; rotX = 1.1; target.set((b1Box.x0 + b1Box.x1) / 2, B1Y + 1, (b1Box.z0 + b1Box.z1) / 2); fitPts(cornerPts(b1Box, B1Y, B1Y), 25, 170);
      } else {
        var ys = S.map(floorY), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys) + FH + (roofOn() ? RH + (TOWER ? FH + 2 : 0) : 0);
        var vb = { x0: bounds.x0, x1: bounds.x1, z0: bounds.z0, z1: Math.max(bounds.z1, sel[LOBBY_F] && ENT_U != null ? FRONT + 24 : bounds.z1) };
        rotY = 0.2; rotX = 0.5; target.set((vb.x0 + vb.x1) / 2, (y0 + y1) / 2, (vb.z0 + vb.z1) / 2);
        fitPts(cornerPts(vb, y0, y1), 25, 260);
      }
    }
    /** reframe: 사용자가 '전체'·'이 층만'을 고른 때만 카메라를 옮긴다. 켜고 끄기만 할 때는 보던 자리 그대로 */
    function selectFloors(list, reframe) {
      ALLF.forEach(function (g) { sel[g] = list.indexOf(g) >= 0; });
      applyVis(); if (reframe) frameSel();
    }
    function toggleFloor(f) {
      camTouched = true;
      if (f === 0) { selectFloors(FLOORS.slice(), true); return; }   // 전체 = 지상 1~4층 (B1 은 따로)
      var S = selList();
      if (sel[f] && S.length === 1) return;          // 하나도 안 켜진 상태는 없다
      selectFloors(sel[f] ? S.filter(function (g) { return g !== f; }) : S.concat([f]), false);
    }

    // ── 걷기: 칸 격자로 길 찾기 — 복도를 누르면 그 복도 가운데로, 로비·주차장·지하는 누른 자리로 ──
    var grids = {}, CS = 0.5;
    function navGrid(f) {
      if (grids[f]) return grids[f];
      var A = (areas[f] || []).map(function (a) { return { pts: a.pts, b: grow(newBox(), a.pts) }; }), O = (obst[f] || []).map(function (p) { return { pts: p, b: grow(newBox(), p) }; });
      var bx = newBox(); A.forEach(function (a) { grow(bx, [[a.b.x0, a.b.z0], [a.b.x1, a.b.z1]]); });
      var x0 = bx.x0 - CS * 2, z0 = bx.z0 - CS * 2, nx = Math.ceil((bx.x1 - x0) / CS) + 4, nz = Math.ceil((bx.z1 - z0) / CS) + 4;
      var raw = new Uint8Array(nx * nz), free = new Uint8Array(nx * nz);
      function inside(list, x, z) { for (var k = 0; k < list.length; k++) { var q = list[k], b = q.b; if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue; if (pip(q.pts, x, z)) return true; } return false; }
      for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++) { var x = x0 + (i + 0.5) * CS, z = z0 + (j + 0.5) * CS; if (inside(A, x, z) && !inside(O, x, z)) raw[j * nx + i] = 1; }
      for (j = 1; j < nz - 1; j++) for (i = 1; i < nx - 1; i++) {   // 벽에서 한 칸 띄운다
        var k = j * nx + i; if (!raw[k]) continue;
        free[k] = raw[k - 1] & raw[k + 1] & raw[k - nx] & raw[k + nx] & raw[k - nx - 1] & raw[k - nx + 1] & raw[k + nx - 1] & raw[k + nx + 1];
      }
      return (grids[f] = { x0: x0, z0: z0, nx: nx, nz: nz, free: free });
    }
    function cellAt(g, x, z) { var i = Math.floor((x - g.x0) / CS), j = Math.floor((z - g.z0) / CS); return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : j * g.nx + i; }
    function isFree(g, x, z) { var k = cellAt(g, x, z); return k >= 0 && g.free[k] === 1; }
    function cellXZ(g, k) { return { x: g.x0 + ((k % g.nx) + 0.5) * CS, z: g.z0 + (Math.floor(k / g.nx) + 0.5) * CS }; }
    function nearestFree(g, x, z) {
      var ci = Math.floor((x - g.x0) / CS), cj = Math.floor((z - g.z0) / CS), best = -1, bd = 1e18;
      for (var r = 0; r < 80 && best < 0; r++) for (var j = cj - r; j <= cj + r; j++) for (var i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
        var k = j * g.nx + i; if (!g.free[k]) continue;
        var p = cellXZ(g, k), d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < bd) { bd = d; best = k; }
      }
      return best;
    }
    function snapFree(f, p) { var g = navGrid(f); if (isFree(g, p.x, p.z)) return { x: p.x, z: p.z }; var k = nearestFree(g, p.x, p.z); return k < 0 ? null : cellXZ(g, k); }
    function los(g, a, b) { var d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / (CS * 0.5)); for (var i = 1; i < n; i++) { var t = i / n; if (!isFree(g, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false; } return true; }
    function findPath(f, from, to) {
      var g = navGrid(f), nx = g.nx, nz = g.nz, free = g.free;
      var s = isFree(g, from.x, from.z) ? cellAt(g, from.x, from.z) : nearestFree(g, from.x, from.z), t = cellAt(g, to.x, to.z);
      if (s < 0 || t < 0 || !free[t]) return null;
      var N = nx * nz, gs = new Float32Array(N), came = new Int32Array(N), closed = new Uint8Array(N);
      for (var q = 0; q < N; q++) { gs[q] = Infinity; came[q] = -1; }
      var hk = [], hf = [], ti = t % nx, tj = (t / nx) | 0;
      function hh(k) { var dx = Math.abs((k % nx) - ti), dz = Math.abs(((k / nx) | 0) - tj); return dx + dz - 0.5858 * Math.min(dx, dz); }
      function push(k, v) { hk.push(k); hf.push(v); var i = hk.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; var a = hk[p]; hk[p] = hk[i]; hk[i] = a; a = hf[p]; hf[p] = hf[i]; hf[i] = a; i = p; } }
      function pop() {
        var top = hk[0], lk = hk.pop(), lf = hf.pop();
        if (hk.length) { hk[0] = lk; hf[0] = lf; var i = 0, n = hk.length; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < n && hf[l] < hf[m]) m = l; if (r < n && hf[r] < hf[m]) m = r; if (m === i) break; var a = hk[m]; hk[m] = hk[i]; hk[i] = a; a = hf[m]; hf[m] = hf[i]; hf[i] = a; i = m; } }
        return top;
      }
      var DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
      gs[s] = 0; push(s, hh(s));
      while (hk.length) {
        var k = pop(); if (closed[k]) continue; closed[k] = 1; if (k === t) break;
        var i = k % nx, j = (k / nx) | 0;
        for (var d = 0; d < 8; d++) {
          var ni = i + DI[d], nj = j + DJ[d]; if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
          var nk = nj * nx + ni; if (!free[nk] || closed[nk]) continue;
          if (d >= 4 && (!free[j * nx + ni] || !free[nj * nx + i])) continue;   // 모서리는 못 자른다
          var ng = gs[k] + (d >= 4 ? 1.4142 : 1);
          if (ng < gs[nk]) { gs[nk] = ng; came[nk] = k; push(nk, ng + hh(nk)); }
        }
      }
      if (s !== t && came[t] < 0) return null;
      var cells = []; for (var cc = t; cc >= 0; cc = cc === s ? -1 : came[cc]) cells.push(cc); cells.reverse();
      var pts = [{ x: from.x, z: from.z }].concat(cells.slice(1, -1).map(function (k2) { return cellXZ(g, k2); }), [{ x: to.x, z: to.z }]);
      var out = [pts[0]], a = 0;   // 보이는 데까지는 곧장 — 꺾이는 곳만 남긴다
      while (a < pts.length - 1) { var b = pts.length - 1; while (b > a + 1 && !los(g, pts[a], pts[b])) b--; out.push(pts[b]); a = b; }
      return out;
    }
    var END = RW / 2;   // 복도 끝에서는 마지막 방 문 앞에 선다
    /** 복도 k 의 가운데 줄에서 (x,z) 에 가장 가까운 점 */
    function onLine(k, x, z) {
      if (k === 'annex') { var az = annexZ(walkFloor); return { x: jx, z: clamp(z, az[0] + END, az[1] - END) }; }
      if (k === 'east') { var u = clamp(toEast(x, z).u, 0, LE - END); return { x: PX + u * AX, z: u * AZ }; }
      if (k === 'west') return { x: clamp(x, jx, BEND ? PX : XW + mainLen - END), z: 0 };
      return { x: x, z: z };
    }
    function destFor(key, x, z) { return snapFree(walkFloor, onLine(key, x, z)); }
    function areaAt(x, z) { var A = areas[walkFloor] || []; for (var i = 0; i < A.length; i++) if (pip(A[i].pts, x, z)) return A[i]; return null; }
    function placeName(x, z) {
      var A = areaAt(x, z); if (!A) return '';
      if (A.key === 'annex') return Math.abs(z) <= HW ? '갈림목' : '별관 복도';
      if (A.key === 'west' && x < XW) return x <= jx + HW ? '갈림목' : '본관↔별관 통로';
      if (walkFloor === -1) {   // 지하는 가장 가까운 곳 이름
        var best = '', bd = 1e9; b1Centers.forEach(function (p) { var d = Math.max(0, Math.hypot(p.x - x, p.z - z) - p.r); if (d < bd && d < 5) { bd = d; best = p.name + ' 앞'; } });
        return best || A.name;
      }
      return A.name;
    }
    // 도착 표시 — 파란 고리
    var marker = new THREE.Group();
    (function () {
      var ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 40), new THREE.MeshBasicMaterial({ color: 0x2B5FD9, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false }));
      var disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), new THREE.MeshBasicMaterial({ color: 0x2B5FD9, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthTest: false }));
      [ring, disc].forEach(function (m) { m.rotation.x = -Math.PI / 2; m.renderOrder = 10; marker.add(m); });
    })();
    marker.visible = false; scene.add(marker);
    var markerUntil = 0;
    function showMarker(d, until) { if (!d) return; marker.position.set(d.x, floorY(walkFloor) + 0.23, d.z); marker.visible = true; markerUntil = until || 0; }
    function hideMarker() { if (!markerUntil) marker.visible = false; }
    var glide = null;
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function angTo(from, to) { var d = to - from; return from + Math.atan2(Math.sin(d), Math.cos(d)); }
    function glideTo(d) {
      if (!d) return;
      var pts = findPath(walkFloor, { x: eye.x, z: eye.z }, d); if (!pts) return;
      var lens = [0], total = 0;
      for (var i = 1; i < pts.length; i++) { total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); lens.push(total); }
      if (total < 0.05) return;
      // 모퉁이를 돌아가면 마지막으로 가는 쪽을 본다. 곧장 가면 보던 방향 그대로.
      var yawTo = null;
      if (pts.length > 2) { var pa = pts[pts.length - 2], dx = d.x - pa.x, dz = d.z - pa.z; if (Math.hypot(dx, dz) > 0.3) yawTo = Math.atan2(-dx, -dz); }
      glide = { pts: pts, lens: lens, total: total, t0: performance.now(), ms: clamp(260 + total * 7, 320, 1300), fy: yaw, ty: yawTo == null ? null : angTo(yaw, yawTo) };
      showMarker(d, glide.t0 + glide.ms + 250);
    }
    function stepGlide(now) {
      var g = glide, k = Math.min(1, (now - g.t0) / g.ms), s = ease(k) * g.total, i = 1;
      while (i < g.lens.length - 1 && g.lens[i] < s) i++;
      var a = g.pts[i - 1], b = g.pts[i], seg = g.lens[i] - g.lens[i - 1], u = seg > 0 ? (s - g.lens[i - 1]) / seg : 1;
      eye.x = a.x + (b.x - a.x) * u; eye.z = a.z + (b.z - a.z) * u;
      if (g.ty != null) yaw = g.fy + (g.ty - g.fy) * ease(k);
      if (k >= 1) glide = null;
    }

    // ── 미니맵 — 걷기 중 그 층 평면도에 지금 자리와 보는 쪽. 누르면 그리로 간다 ──────────
    var miniBase = document.createElement('canvas'), mctx = mini.getContext('2d'), MW = 0, MH = 0, MS = 1, MPAD = 8, MDPR = 1, miniKey = '', miniVer = 0, mb = bounds;
    function miniBounds(f) {
      if (f === -1) return b1Box;
      var b = floorBounds[f] || bounds; b = { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 };
      return f === LOBBY_F && siteBox.x1 > siteBox.x0 ? grow(b, [[siteBox.x0, siteBox.z0], [siteBox.x1, siteBox.z1]]) : b;
    }
    function miniSetup() {
      mb = miniBounds(walkFloor);
      var bw = mb.x1 - mb.x0, bh = mb.z1 - mb.z0, maxW = clamp(W * 0.34, 130, 220), maxH = clamp(H * 0.3, 90, 160);
      MS = Math.min((maxW - MPAD * 2) / bw, (maxH - MPAD * 2) / bh);
      MW = Math.round(bw * MS + MPAD * 2); MH = Math.round(bh * MS + MPAD * 2); MDPR = Math.min(window.devicePixelRatio || 1, 2);
      mini.style.width = MW + 'px'; mini.style.height = MH + 'px';
      mini.width = miniBase.width = Math.round(MW * MDPR); mini.height = miniBase.height = Math.round(MH * MDPR);
      drawMiniBase();
    }
    function mX(x) { return MPAD + (x - mb.x0) * MS; }
    function mZ(z) { return MPAD + (z - mb.z0) * MS; }
    function drawMiniBase() {
      var g = miniBase.getContext('2d'); g.setTransform(MDPR, 0, 0, MDPR, 0, 0); g.clearRect(0, 0, MW, MH);
      (mapPolys[walkFloor] || []).forEach(function (it) {
        g.beginPath(); it.pts.forEach(function (p, i) { if (i) g.lineTo(mX(p[0]), mZ(p[1])); else g.moveTo(mX(p[0]), mZ(p[1])); }); g.closePath();
        if (it.site) { g.fillStyle = it.site; g.fill(); }
        else if (it.corr) { g.fillStyle = '#cfd4dc'; g.fill(); }
        else if (it.lobby) { g.fillStyle = '#e2d8c4'; g.fill(); }
        else if (it.gray) { g.fillStyle = '#d6d3cc'; g.fill(); }
        else if (it.place) { g.fillStyle = placeColor(it.place.kind).bg; g.fill(); g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 0.6; g.stroke(); }
        else { var r = roomOf(it.num); g.globalAlpha = r.dim ? 0.35 : 1; g.fillStyle = r.bg; g.fill(); g.globalAlpha = 1; g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 0.6; g.stroke(); }
      });
      g.fillStyle = '#4B5563'; g.font = '700 10px ui-monospace,Menlo,monospace'; g.textBaseline = 'top'; g.fillText(walkFloor === -1 ? 'B1' : walkFloor + 'F', 5, 4);
      miniVer++;
    }
    function drawMini() {
      var key = [eye.x.toFixed(2), eye.z.toFixed(2), yaw.toFixed(3), glide ? 1 : 0, miniVer].join(',');
      if (key === miniKey) return; miniKey = key;
      mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, mini.width, mini.height); mctx.drawImage(miniBase, 0, 0);
      mctx.setTransform(MDPR, 0, 0, MDPR, 0, 0);
      if (glide) { var d = glide.pts[glide.pts.length - 1]; mctx.beginPath(); mctx.arc(mX(d.x), mZ(d.z), 3.5, 0, Math.PI * 2); mctx.strokeStyle = '#2B5FD9'; mctx.lineWidth = 1.5; mctx.stroke(); }
      var px = mX(eye.x), pz = mZ(eye.z), ang = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
      mctx.beginPath(); mctx.moveTo(px, pz); mctx.arc(px, pz, 20, ang - 0.55, ang + 0.55); mctx.closePath(); mctx.fillStyle = 'rgba(43,95,217,.28)'; mctx.fill();
      mctx.beginPath(); mctx.arc(px, pz, 4, 0, Math.PI * 2); mctx.fillStyle = '#2B5FD9'; mctx.fill(); mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5; mctx.stroke();
    }
    mini.addEventListener('pointerdown', function (e) {
      e.stopPropagation(); e.preventDefault(); if (mode !== 'walk') return;
      var b = mini.getBoundingClientRect(), x = mb.x0 + (e.clientX - b.left - MPAD) / MS, z = mb.z0 + (e.clientY - b.top - MPAD) / MS;
      // 로비·주차장·지하 안을 누르면 그 자리, 아니면 가장 가까운 복도 가운데
      var A = areaAt(x, z), d;
      if (A && A.key === 'free') d = snapFree(walkFloor, { x: x, z: z });
      else if (walkFloor >= 1) {
        var ks = ['west']; if (BEND) ks.push('east'); if (annexZ(walkFloor)) ks.push('annex');
        var bd = 1e9; ks.forEach(function (k) { var p = onLine(k, x, z), dd = Math.hypot(p.x - x, p.z - z); if (dd < bd) { bd = dd; d = p; } });
        if (A == null && walkFloor === LOBBY_F) { var fr = snapFree(walkFloor, { x: x, z: z }); if (fr && Math.hypot(fr.x - x, fr.z - z) < bd) d = fr; }
        d = d && snapFree(walkFloor, d);
      } else d = snapFree(walkFloor, { x: x, z: z });
      glideTo(d);
    });

    // ── 입력: 손가락/마우스 하나 — 끌면 돌려보기(걷기에서는 둘러보기), 톡 누르면 선택/이동 ──
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    var drag = null, nPtr = 0, multi = false, pinch = null;
    c.addEventListener('pointerdown', function (e) {
      nPtr++;
      if (nPtr > 1) { multi = true; if (drag) drag.moved = true; return; }
      multi = false;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, touch: e.pointerType === 'touch', pan: mode === 'orbit' && (e.button === 2 || e.shiftKey) };
      try { c.setPointerCapture(e.pointerId); } catch (x) { }
    });
    function onUp(e, cancel) {
      nPtr = Math.max(0, nPtr - 1);
      if (drag && e.pointerId === drag.id) {
        var d = drag; drag = null;
        if (!cancel && !d.moved && !multi && performance.now() - d.t < 600) tap(e);
      }
      if (!nPtr) multi = false;
    }
    c.addEventListener('pointerup', function (e) { onUp(e, false); });
    c.addEventListener('pointercancel', function (e) { onUp(e, true); });
    c.addEventListener('pointermove', function (e) {
      if (drag && e.pointerId === drag.id) {
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) { drag.moved = true; camTouched = true; tip.style.display = 'none'; hideMarker(); c.style.cursor = ''; }
        if (drag.moved && !pinch) {
          var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          if (mode === 'orbit') { if (drag.pan) panBy(dx, dy); else { rotY -= dx * 0.008; rotX = Math.max(0.05, Math.min(1.45, rotX + dy * 0.006)); } }
          else { var k = drag.touch ? 0.006 : 0.005; yaw -= dx * k; pitch = Math.max(-1.2, Math.min(1.2, pitch - dy * k)); if (glide) glide.ty = null; }
        }
        drag.x = e.clientX; drag.y = e.clientY;
      }
      if (!drag || !drag.moved) hover(e);
    });
    c.addEventListener('pointerleave', function () { tip.style.display = 'none'; hideMarker(); });
    c.addEventListener('wheel', function (e) { e.preventDefault(); camTouched = true; if (mode === 'orbit') dist = Math.max(20, Math.min(400, dist + e.deltaY * 0.15)); }, { passive: false });
    function touchMid(t) { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }
    c.addEventListener('touchstart', function (e) { var t = e.targetTouches; if (mode === 'orbit' && t.length === 2) { camTouched = true; var m = touchMid(t); pinch = { d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY), dist: dist, x: m.x, y: m.y }; } }, { passive: true });
    c.addEventListener('touchmove', function (e) { var t = e.targetTouches; if (pinch && t.length === 2 && mode === 'orbit') { var d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); dist = Math.max(20, Math.min(400, pinch.dist * pinch.d / d)); var m = touchMid(t); panBy(m.x - pinch.x, m.y - pinch.y); pinch.x = m.x; pinch.y = m.y; } }, { passive: true });
    c.addEventListener('touchend', function (e) { if (e.targetTouches.length < 2) pinch = null; });
    window.addEventListener('keydown', function (e) { keys[e.key.toLowerCase()] = true; if (mode === 'walk' && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(e.key.toLowerCase()) >= 0) e.preventDefault(); });
    window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });

    var ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    function hitAt(e) {
      var b = c.getBoundingClientRect(); mouse.x = ((e.clientX - b.left) / b.width) * 2 - 1; mouse.y = -((e.clientY - b.top) / b.height) * 2 + 1; ray.setFromCamera(mouse, camera);
      // 벽·지붕·차처럼 누를 수 없는 것도 광선을 막는다 — 맨 앞에 맞은 것이 누를 수 있는 것일 때만
      var objs = meshes.concat(labels, roofMeshes); if (mode !== 'walk') objs = objs.filter(function (m) { return !m.userData.walk; });
      var h = ray.intersectObjects(objs.filter(function (m) { return m.visible; }))[0];
      if (!h) return null; var ud = h.object.userData || {};
      return ud.num || ud.pid || ud.walk ? h : null;
    }
    function labelOf(ud) { if (ud.num) { var r = roomOf(ud.num); return ud.num + ' ' + r.purpose + (r.people.length ? ' · ' + r.people.length + '명' + (r.caption && r.caption !== r.purpose ? ' · ' + r.caption : '') : ''); } var p = placeMap[ud.pid]; return p ? p.name : ''; }
    function hover(e) {
      if (e.pointerType === 'touch') return;
      var hit = hitAt(e), ud = hit && hit.object.userData;
      c.style.cursor = hit ? 'pointer' : '';
      if (ud && ud.walk) { tip.style.display = 'none'; if (!glide) showMarker(destFor(ud.walk, hit.point.x, hit.point.z)); return; }
      hideMarker();
      if (hit) { var b = c.getBoundingClientRect(); tip.style.display = 'block'; tip.style.left = (e.clientX - b.left) + 'px'; tip.style.top = (e.clientY - b.top) + 'px'; tip.textContent = labelOf(ud); } else tip.style.display = 'none';
    }
    function tap(e) {
      var hit = hitAt(e); if (!hit) return; var ud = hit.object.userData;
      if (ud.walk) { glideTo(destFor(ud.walk, hit.point.x, hit.point.z)); return; }
      if (ud.num) send({ type: 'room', num: ud.num }); else if (ud.pid) send({ type: 'place', id: ud.pid });
    }

    // ── 모드 ─────────────────────────────────────────────────────────
    function resetWalkState() { glide = null; markerUntil = 0; marker.visible = false; tip.style.display = 'none'; drag = null; }
    /** 층마다 걷기 시작점 — 로비 층은 정문을 바라보며, 지하는 가운데 통로, 나머지는 본관·별관 갈림목에서 본관 쪽 */
    function walkStart(f) {
      var p, yw = -Math.PI / 2;
      if (f === -1) p = { x: b1Start[0], z: b1Start[1] };
      else if (f === LOBBY_F && ENT_U != null) { var q = wp(ENT_U, 0); p = { x: q[0], z: q[1] }; yw = Math.PI; }
      else p = { x: jx, z: 0 };
      p = snapFree(f, p) || p; eye.set(p.x, floorY(f) + 1.6, p.z); yaw = yw; pitch = -0.12;
    }
    function setWalkFloor(f) {
      walkFloor = f; resetWalkState(); eye.y = floorY(f) + 1.6;
      if (!isFree(navGrid(f), eye.x, eye.z)) walkStart(f);   // 층마다 모양이 달라 벽 속이면 그 층 시작점으로
      applyVis(); miniSetup();
    }
    function setMode(m) {
      mode = m; host.classList.toggle('walk', m === 'walk'); resetWalkState();
      if (m === 'walk') {
        var S = selList();
        walkFloor = S.length === 1 ? S[0] : sel[LOBBY_F] ? LOBBY_F : S.filter(function (f) { return f > 0; })[0] || FLOORS[0];
        walkStart(walkFloor); mini.style.display = 'block'; miniSetup();
      } else mini.style.display = 'none';
      applyVis();
    }
    function goTo(num) {
      var d = roomDoor[num]; if (!d) return; setMode('walk'); setWalkFloor(d.f);
      eye.x = d.x + d.nx * (HW + 1); eye.z = d.z + d.nz * (HW + 1); yaw = Math.atan2(d.nx, d.nz); pitch = -0.1;   // 복도 건너편에서 문을 본다
    }
    function setFloorCmd(f) {
      if (mode === 'walk') { if (f !== 0) setWalkFloor(f); return; }
      selectFloors(f === 0 ? FLOORS.slice() : [f], true);
    }

    var last = performance.now();
    (function loop(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (mode === 'walk') {
        var fx = 0, fz = 0; if (keys['w'] || keys['arrowup']) fz -= 1; if (keys['s'] || keys['arrowdown']) fz += 1; if (keys['a'] || keys['arrowleft']) fx -= 1; if (keys['d'] || keys['arrowright']) fx += 1;
        if (fx || fz) {
          glide = null;
          var dir = new THREE.Vector3(fx, 0, fz).normalize().multiplyScalar(8 * dt).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
          var g = navGrid(walkFloor), nx = eye.x + dir.x, nz = eye.z + dir.z;
          if (isFree(g, nx, nz)) { eye.x = nx; eye.z = nz; } else if (isFree(g, nx, eye.z)) eye.x = nx; else if (isFree(g, eye.x, nz)) eye.z = nz;   // 벽에 막히면 벽을 따라 미끄러진다
        }
        if (glide) stepGlide(now);
        if (markerUntil && now > markerUntil) { markerUntil = 0; marker.visible = false; }
        placeWalk(); where.textContent = (walkFloor === -1 ? 'B1' : walkFloor + 'F') + ' · ' + placeName(eye.x, eye.z); drawMini();
      } else { placeOrbit(); where.textContent = ''; }
      // 가까운 면(near)을 멀리 볼 땐 뒤로 민다 — 깊이 정밀도가 올라가 멀리 있는 땅·바다·도로가 서로 비치지 않는다
      var wantNear = mode === 'walk' ? 0.2 : clamp(dist * 0.02, 0.5, 6);
      if (Math.abs(camera.near - wantNear) > wantNear * 0.1) { camera.near = wantNear; camera.updateProjectionMatrix(); }
      renderer.render(scene, camera); requestAnimationFrame(loop);
    })(last);
    if (window.ResizeObserver) new ResizeObserver(function () {
      W = host.clientWidth; H = host.clientHeight; if (!W || !H) return; renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix();
      miniSetup(); if (mode === 'orbit' && !camTouched) frameSel();   // 아직 손대지 않았을 때만 다시 맞춘다
    }).observe(host);
    floorBar.querySelectorAll('button').forEach(function (b) {
      var f = +b.dataset.f, lpT = null, lpFired = false;
      // 두 번 누르거나(PC) 길게 누르면(폰) 그 층만
      function only() { if (mode === 'orbit' && f !== 0) { camTouched = true; selectFloors([f], true); } }
      b.addEventListener('pointerdown', function () { lpFired = false; clearTimeout(lpT); lpT = setTimeout(function () { lpFired = true; only(); }, 450); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, function () { clearTimeout(lpT); }); });
      b.onclick = function () { if (lpFired) { lpFired = false; return; } if (mode === 'walk') { if (f !== 0) setWalkFloor(f); } else toggleFloor(f); };
      b.ondblclick = only;
    });
    modeBar.querySelectorAll('button').forEach(function (b) { b.onclick = function () { setMode(b.dataset.m); }; });
    // 팻말에 명단이 들어가니, 색·명단이 바뀐 방만 다시 그린다
    var painted = {};
    function plateKey(r) { return [r.bg, r.caption, r.label, r.dim ? 1 : 0, r.people.map(function (p) { return p.name; }).join(',')].join('|'); }
    function paintRoom(n) {
      var r = roomOf(n), b = roomBox[n], sg = roomSign[n], key = plateKey(r);
      if (b) { b.material.color.set(r.bg); b.material.transparent = !!r.dim; b.material.opacity = r.dim ? 0.3 : 1; b.material.needsUpdate = true; }
      if (sg && painted[n] !== undefined && painted[n] !== key) { if (sg.material.map) sg.material.map.dispose(); sg.material.map = plateTex(n); sg.material.opacity = r.dim ? 0.35 : 1; sg.material.needsUpdate = true; }
      painted[n] = key;
    }
    Object.keys(roomBox).forEach(paintRoom);
    onRooms.push(function () {
      Object.keys(roomBox).forEach(paintRoom);
      Object.keys(labelSets).forEach(function (k) { dropLabels(+k); }); syncLabels();
      drawMiniBase();
    });
    gl = { setFloor: setFloorCmd, setMode: setMode, goTo: goTo, state: function () { return { x: eye.x, z: eye.z, yaw: yaw, gliding: !!glide, floor: walkFloor, mode: mode, sel: selList(), labels: Object.keys(labelSets).map(Number), roof: roofOn(), dist: dist, rotX: rotX, rotY: rotY, target: [target.x, target.y, target.z] }; } };
    ALLF.forEach(function (g) { sel[g] = P.floor ? g === P.floor : g > 0; });
    hint.textContent = ''; miniSetup(); setMode('orbit'); frameSel();
  }

  // 밖에서 부르는 명령 — web: iframe.contentWindow.postMessage, mobile: injectJavaScript
  window.lodgingState = function () { return gl && gl.state(); };
  window.lodgingCmd = function (m) {
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
    if (!m) return;
    if (m.type === 'goTo' && gl) gl.goTo(String(m.num));
    if (m.type === 'setFloor' && gl) gl.setFloor(+m.floor);
    if (m.type === 'setMode' && gl) gl.setMode(m.mode);
    if (m.type === 'setRooms' && m.rooms) { ROOMS = m.rooms; onRooms.forEach(function (fn) { fn(); }); }
  };
  window.addEventListener('message', function (e) { if (e.data && e.data.source === 'lodging-host') window.lodgingCmd(e.data); });
  document.addEventListener('message', function (e) { try { window.lodgingCmd(JSON.parse(e.data)); } catch (x) { } });

  function boot() {
    document.getElementById('v-gl').style.display = 'block';
    if (window.THREE) renderGL();
    else { var s = document.getElementById('three-src'); if (s) s.addEventListener('load', renderGL); var t = 0; var iv = setInterval(function () { if (window.THREE) { clearInterval(iv); renderGL(); } else if (++t > 100) { clearInterval(iv); document.getElementById('gl-hint').textContent = '3D 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.'; } }, 100); }
    send({ type: 'ready' });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
`;
