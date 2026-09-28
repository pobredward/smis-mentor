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
 * 뷰어 → 호스트: postMessage { source:'lodging-viewer', type:'room'|'place'|'floor'|'ready'|'inside', num|id|floor }
 *   (mobile 은 window.ReactNativeWebView.postMessage 로 JSON 문자열; 'inside' 는 방 안에 들어가거나(num|id) 나올 때(null))
 * 호스트 → 뷰어: window.lodgingCmd({ type:'goTo', num }) / { type:'enter', num|id } (안으로 들어가 둘러보기) / { type:'exit' }
 *   / { type:'setFloor', floor } / { type:'setMode', mode } / { type:'setRooms', rooms } (lodgingViewerRooms 결과)
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
.gl .fade{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .18s;z-index:4}
.seg.in button{color:#2B5FD9;font-weight:600}
.lbl.in{color:#1B1F24;font-size:12px;letter-spacing:0}
`;

const VIEWER_BODY = String.raw`
<section class="view" id="v-gl">
  <div class="bar">
    <span class="lbl">모드</span><div class="seg" id="gl-mode"><button aria-pressed="true" data-m="orbit">돌려보기</button><button data-m="walk">걷기</button></div>
    <span class="lbl" style="margin-left:6px">층</span><div class="seg" id="gl-floor"><button data-f="0">전체</button><button data-f="-1">B1</button><button data-f="1">1층</button><button data-f="2">2층</button><button data-f="3">3층</button><button data-f="4">4층</button></div>
    <div class="seg in" id="gl-in" style="display:none;margin-left:6px"><button data-act="exit">← 나가기</button></div><span class="lbl in" id="gl-in-name"></span>
  </div>
  <div class="fill"><div class="gl" id="gl"><div class="tip" id="gl-tip"></div><div class="where" id="gl-where"></div><canvas class="mini" id="gl-mini"></canvas><div class="hint" id="gl-hint"></div><div class="fade" id="gl-fade"></div></div></div>
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
    var fade = document.getElementById('gl-fade'), inBar = document.getElementById('gl-in'), inName = document.getElementById('gl-in-name');
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
    // 방·장소의 안쪽 자리 — 들어가서 둘러볼 때 쓴다. c: 가운데, ang: rotation.y (안쪽 +z 가 문에서 창 쪽), w: 복도 방향 폭, d: 깊이
    var roomGeom = {}, placeGeom = {};
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
        roomGeom[n] = { f: f, c: c, ang: rot + (upper ? Math.PI : 0), w: lu1 - lu0, d: vb - va };   // 위쪽 줄은 창이 -v 쪽
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
            roomGeom[n] = { f: f, c: [x, z], ang: s * Math.PI / 2, w: RW - WALL, d: RD - WALL };   // 창은 복도 반대쪽(바깥)
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
        if (MAJOR.indexOf(p.kind) >= 0) placeGeom[p.id] = { f: -1, c: [c[0], c[1]], ang: rot, w: w, d: d, name: p.name, kind: p.kind };   // 홀·식당·상점·오락실은 들어가 볼 수 있다
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
      inBar.style.display = inRoom ? '' : 'none'; inName.textContent = inRoom ? inRoom.title : '';
    }
    function isVis(ud) {
      var f = ud.f;
      if (ud.room) return mode === 'walk' && !!inRoom && inRoom.key === ud.room;                        // 방 안 살림은 그 방에 들어갔을 때만
      if (inRoom && ((ud.num && ud.num === inRoom.num) || (ud.pid && ud.pid === inRoom.pid))) return false;   // 들어간 방의 상자·팻말은 치운다
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
    // 격자 키: 층 번호(복도·로비·지하) 또는 방 안('r:215', 'p:b1-halla'). 방 안은 좁아서 칸을 잘게 쓴다
    var grids = {}, CS = 0.5;
    function navGrid(f) {
      if (grids[f]) return grids[f];
      var cs = typeof f === 'string' ? 0.2 : CS;
      var A = (areas[f] || []).map(function (a) { return { pts: a.pts, b: grow(newBox(), a.pts) }; }), O = (obst[f] || []).map(function (p) { return { pts: p, b: grow(newBox(), p) }; });
      var bx = newBox(); A.forEach(function (a) { grow(bx, [[a.b.x0, a.b.z0], [a.b.x1, a.b.z1]]); });
      var x0 = bx.x0 - cs * 2, z0 = bx.z0 - cs * 2, nx = Math.ceil((bx.x1 - x0) / cs) + 4, nz = Math.ceil((bx.z1 - z0) / cs) + 4;
      var raw = new Uint8Array(nx * nz), free = new Uint8Array(nx * nz);
      function inside(list, x, z) { for (var k = 0; k < list.length; k++) { var q = list[k], b = q.b; if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue; if (pip(q.pts, x, z)) return true; } return false; }
      for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++) { var x = x0 + (i + 0.5) * cs, z = z0 + (j + 0.5) * cs; if (inside(A, x, z) && !inside(O, x, z)) raw[j * nx + i] = 1; }
      for (j = 1; j < nz - 1; j++) for (i = 1; i < nx - 1; i++) {   // 벽에서 한 칸 띄운다
        var k = j * nx + i; if (!raw[k]) continue;
        free[k] = raw[k - 1] & raw[k + 1] & raw[k - nx] & raw[k + nx] & raw[k - nx - 1] & raw[k - nx + 1] & raw[k + nx - 1] & raw[k + nx + 1];
      }
      return (grids[f] = { x0: x0, z0: z0, nx: nx, nz: nz, free: free, cs: cs });
    }
    function cellAt(g, x, z) { var i = Math.floor((x - g.x0) / g.cs), j = Math.floor((z - g.z0) / g.cs); return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : j * g.nx + i; }
    function isFree(g, x, z) { var k = cellAt(g, x, z); return k >= 0 && g.free[k] === 1; }
    function cellXZ(g, k) { return { x: g.x0 + ((k % g.nx) + 0.5) * g.cs, z: g.z0 + (Math.floor(k / g.nx) + 0.5) * g.cs }; }
    function nearestFree(g, x, z) {
      var ci = Math.floor((x - g.x0) / g.cs), cj = Math.floor((z - g.z0) / g.cs), best = -1, bd = 1e18;
      for (var r = 0; r < 120 && best < 0; r++) for (var j = cj - r; j <= cj + r; j++) for (var i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
        var k = j * g.nx + i; if (!g.free[k]) continue;
        var p = cellXZ(g, k), d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < bd) { bd = d; best = k; }
      }
      return best;
    }
    function snapFree(f, p) { var g = navGrid(f); if (isFree(g, p.x, p.z)) return { x: p.x, z: p.z }; var k = nearestFree(g, p.x, p.z); return k < 0 ? null : cellXZ(g, k); }
    function los(g, a, b) { var d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / (g.cs * 0.5)); for (var i = 1; i < n; i++) { var t = i / n; if (!isFree(g, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false; } return true; }
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
    /** 지금 걷는 격자 — 방 안이면 그 방, 아니면 층 */
    var inRoom = null;
    function navKey() { return inRoom ? inRoom.key : walkFloor; }
    function destFor(key, x, z) { return snapFree(navKey(), onLine(key, x, z)); }
    function areaAt(x, z) { var A = areas[navKey()] || []; for (var i = 0; i < A.length; i++) if (pip(A[i].pts, x, z)) return A[i]; return null; }
    function placeName(x, z) {
      if (inRoom) return inRoom.title + ' 안';
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
      var pts = findPath(navKey(), { x: eye.x, z: eye.z }, d); if (!pts) return;
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
      if (inRoom) leaveRoom(false);   // 방 안에서 지도를 누르면 문 앞으로 나온 뒤 간다
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
      if (ud.room && inRoom && !ud.walk && !ud.exit && !ud.info) {   // 방 안 가구·벽을 눌러도 그 아래 바닥으로 — 좁은 방에서 바닥만 골라 누르기 어렵다
        var fp = new THREE.Vector3(); if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(floorY(inRoom.f) + 0.22)), fp)) return null;
        return { point: fp, object: { userData: { walk: 'room' } } };
      }
      return ud.num || ud.pid || ud.walk || ud.exit || ud.info ? h : null;
    }
    function enterable(ud) { return mode === 'walk' && !inRoom && !!((ud.num && roomGeom[ud.num]) || (ud.pid && placeGeom[ud.pid])); }
    function labelOf(ud) {
      if (ud.exit) return '문 · 나가기';
      if (ud.info) return '명단·상세 보기';
      var s;
      if (ud.num) { var r = roomOf(ud.num); s = ud.num + ' ' + r.purpose + (r.people.length ? ' · ' + r.people.length + '명' + (r.caption && r.caption !== r.purpose ? ' · ' + r.caption : '') : ''); }
      else { var p = placeMap[ud.pid]; s = p ? p.name : ''; }
      return enterable(ud) ? s + ' · 들어가기' : s;
    }
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
      if (ud.exit) { leaveRoom(true); return; }
      if (ud.info && inRoom) { if (inRoom.num) send({ type: 'room', num: inRoom.num }); else send({ type: 'place', id: inRoom.pid }); return; }
      if (ud.walk) { glideTo(destFor(ud.walk, hit.point.x, hit.point.z)); return; }
      if (enterable(ud)) { enterRoom(ud.num ? { num: ud.num } : { pid: ud.pid }); return; }   // 걷기에서 팻말·장소를 누르면 안으로
      if (ud.num) send({ type: 'room', num: ud.num }); else if (ud.pid) send({ type: 'place', id: ud.pid });
    }

    // ── 방 안 — 걷기에서 방 팻말·장소를 누르면 들어가서 둘러본다 ──────────────────
    // 안쪽 살림은 들어갈 때 그 방 상자 자리에 만들고(한 번 만들면 둔다), 나가면 숨긴다.
    // 강의실은 사진을 보고 꾸몄다. 다른 종류(학생방·식당·홀…)는 사진이 오면 채우고, 그때까지는 빈 껍데기.
    var interiors = {}, roomLight = new THREE.PointLight(0xfff1dc, 0, 18); scene.add(roomLight);
    var IH = TOP - 0.1 - 0.02, WT = 0.08;   // 안쪽 천장 높이, 벽 두께
    var texCache = {};
    function texCanvas(name, w, h, draw) {
      if (texCache[name]) return texCache[name];
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
      var tx = new THREE.CanvasTexture(cv); tx.anisotropy = 4; return (texCache[name] = tx);
    }
    /** 마루 — 널빤지 8줄, 한 장이 1.2m × 1.2m */
    function woodTex() {
      return texCanvas('wood', 256, 256, function (g, W, H) {
        var seed = 5; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
        var n = 8, pw = W / n;
        for (var i = 0; i < n; i++) {
          var t = 0.9 + rnd() * 0.2; g.fillStyle = 'rgb(' + Math.round(196 * t) + ',' + Math.round(160 * t) + ',' + Math.round(118 * t) + ')'; g.fillRect(i * pw, 0, pw, H);
          g.strokeStyle = 'rgba(80,50,25,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(i * pw + 0.5, 0); g.lineTo(i * pw + 0.5, H); g.stroke();
          var jy = (i * 97 + 40) % H; g.beginPath(); g.moveTo(i * pw, jy + 0.5); g.lineTo((i + 1) * pw, jy + 0.5); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,.12)'; for (var k = 0; k < 3; k++) { var gx = i * pw + 4 + rnd() * (pw - 8); g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx + (rnd() - 0.5) * 6, H); g.stroke(); }
        }
        g.strokeStyle = 'rgba(0,0,0,0)';
      });
    }
    /** 커튼 — 세로 주름 */
    function curtainTex() {
      return texCanvas('curtain', 64, 8, function (g, W, H) {
        for (var x = 0; x < W; x++) { var t = 0.82 + 0.18 * Math.abs(Math.sin((x / W) * Math.PI * 6)); g.fillStyle = 'rgb(' + Math.round(216 * t) + ',' + Math.round(201 * t) + ',' + Math.round(174 * t) + ')'; g.fillRect(x, 0, 1, H); }
      });
    }
    /** 화이트보드 — 파란 마커로 몇 자 */
    function boardTex() {
      return texCanvas('board', 512, 352, function (g, W, H) {
        g.fillStyle = '#fbfbfa'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#2650b8'; g.font = 'italic 600 34px sans-serif';
        g.fillText('Time :', 26, 60); g.fillText('Reading', 300, 60); g.fillText('Goal', 26, 150); g.fillText('Wonder', 220, 150);
        g.strokeStyle = '#2650b8'; g.lineWidth = 3; g.beginPath(); g.moveTo(24, 76); g.lineTo(150, 78); g.stroke();
        g.fillStyle = '#c33'; g.font = '600 30px sans-serif'; g.fillText('✓', 430, 150);
      });
    }
    function titleOf(t) { if (t.num) { var r = roomOf(t.num); return t.num + '호 · ' + r.purpose; } var p = placeMap[t.pid]; return p ? p.name : t.pid; }
    /** 방 종류 → 꾸미기. 강의실만 살림이 있고, 나머지는 사진이 오면 */
    function styleOf(t) {
      if (t.num) return roomOf(t.num).purpose === '강의실' ? 'classroom' : 'shell';
      return 'shell';
    }
    function buildInterior(key, g, t) {
      var y0 = floorY(g.f) + 0.1, ig = new THREE.Group(); ig.position.set(g.c[0], y0, g.c[1]); ig.rotation.y = g.ang; group.add(ig);
      var cs = Math.cos(g.ang), sn = Math.sin(g.ang), style = styleOf(t), basement = g.f === -1;
      function lw(lx, lz) { return [g.c[0] + lx * cs + lz * sn, g.c[1] - lx * sn + lz * cs]; }   // 안쪽 좌표 → 세계 좌표 (rotation.y 와 같은 방향)
      var W2 = g.w / 2, D2 = g.d / 2, wIn = g.w - 2 * WT, dIn = g.d - 2 * WT, obs = [], ud = { room: key, f: g.f };
      function im(mesh, extra) { mesh.userData = extra ? Object.assign({}, ud, extra) : ud; ig.add(mesh); meshes.push(mesh); return mesh; }
      function bx(w, h, d, color, lx, ly, lz, ry, extra) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' ? lam(color) : color); m.position.set(lx, ly, lz); if (ry) m.rotation.y = ry; return im(m, extra); }
      function block(lx, lz, w, d) { var c = lw(lx, lz); obs.push(boxPts(c[0], c[1], w, d, g.ang)); }   // 못 지나가는 자리 (세계 좌표)
      /** 같은 모양 여럿 — 한 번에 그린다. list: [lx, ly, lz] */
      function inst(geo, color, list) { var m = new THREE.InstancedMesh(geo, lam(color), list.length), o = new THREE.Object3D(); list.forEach(function (p, i) { o.position.set(p[0], p[1], p[2]); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); return im(m); }
      var wallC = '#efe9dc', trimC = '#6b4a2e', frameC = '#f4f4f2';
      if (style === 'classroom') return buildClassroom();
      /** 강의실 — 사용자가 그려 준 평면도(1389×675 그림)를 그대로 옮긴다. 걸어 다니기 편하게 실제보다 넉넉히 약 0.73cm/px (폭 약 4.9m, 문→창 약 10m).
          그림 가로 → 문(복도)에서 창(바깥) 쪽 z, 그림 세로 → x (그림 위쪽 벽이 교실 앞 — 화이트보드·TV) */
      function buildClassroom() {
        var S = 10.1 / 1389, wallC2 = '#efe9dc';
        var SX = -1;   // 문에서 창을 볼 때 그림 위쪽(앞)이 왼쪽에 오게 x 를 뒤집는다
        function PX(v) { return SX * ((v - 115) * S - (675 * S) / 2); }
        function PZ(u) { return -D2 + WT * 1.5 + (u - 28) * S; }   // 문 쪽 벽이 복도 벽보다 안쪽에 오게
        var X0 = PX(115), X1 = PX(790), Z0 = PZ(28), Z1 = PZ(1417), W = Math.abs(X1 - X0), L = Z1 - Z0, CX = 0, CZ = (Z0 + Z1) / 2;
        var TH = 0.72, obs2 = [];
        function blk(xa, xb, z0, z1) { var x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), c = lw((x0 + x1) / 2, (z0 + z1) / 2); obs2.push(boxPts(c[0], c[1], x1 - x0, z1 - z0, g.ang)); }
        function wallX(x, za, zb, h, y) { h = h || IH; bx(WT, h, zb - za, wallC2, x, (y || 0) + h / 2, (za + zb) / 2); }
        function wallZ(z, xa, xb, h, y) { h = h || IH; bx(Math.abs(xb - xa), h, WT, wallC2, (xa + xb) / 2, (y || 0) + h / 2, z); }
        // 바닥·천장
        var ft = woodTex().clone(); ft.needsUpdate = true; ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(W / 1.2, L / 1.2);
        var fl = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshLambertMaterial({ map: ft })); fl.rotation.x = -Math.PI / 2; fl.position.set(CX, 0.012, CZ); im(fl);
        var ce = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshBasicMaterial({ color: 0xf4f2ee })); ce.rotation.x = Math.PI / 2; ce.position.set(CX, IH - 0.01, CZ); im(ce);
        // 바깥 벽 — 양옆은 막힌 벽, 문 쪽 벽은 문 자리만 비운다
        var dX0 = PX(580), dX1 = X1, doorX = (dX0 + dX1) / 2, DW = Math.min(0.9, dX1 - dX0 - 0.04);
        wallX(X0 - SX * WT / 2, Z0 - WT, Z1 + WT); wallX(X1 + SX * WT / 2, Z0 - WT, Z1 + WT);
        wallZ(Z0 - WT / 2, X0, doorX - DW / 2); wallZ(Z0 - WT / 2, doorX + DW / 2, X1); wallZ(Z0 - WT / 2, doorX - DW / 2, doorX + DW / 2, IH - 2.12, 2.12);
        // 창 — 끝 벽 전체
        var fz = Z1 + WT / 2, WY0 = 0.45, WY1 = 2.3, pier = 0.25, WW = W - 2 * pier;
        wallZ(fz, X0, X0 + SX * pier); wallZ(fz, X1 - SX * pier, X1); wallZ(fz, X0 + SX * pier, X1 - SX * pier, WY0); wallZ(fz, X0 + SX * pier, X1 - SX * pier, IH - WY1, WY1);
        bx(WW, 0.06, 0.1, frameC, CX, WY0 + 0.03, fz); bx(WW, 0.06, 0.1, frameC, CX, WY1 - 0.03, fz);
        [-0.5, 0, 0.5].forEach(function (k) { bx(0.06, WY1 - WY0, 0.1, frameC, CX + k * (WW - 0.06), (WY0 + WY1) / 2, fz); });
        bx(WW - 0.1, WY1 - WY0 - 0.1, 0.02, new THREE.MeshLambertMaterial({ color: 0xcfe6f3, transparent: true, opacity: 0.28, depthWrite: false }), CX, (WY0 + WY1) / 2, fz);
        var ct = curtainTex(), cw = 0.55, cz = Z1 - 0.12;
        [-1, 1].forEach(function (k) { var cx = CX + k * (WW / 2 - cw / 2 + 0.15), m = new THREE.Mesh(new THREE.BoxGeometry(cw, IH - 0.18, 0.14), new THREE.MeshLambertMaterial({ map: ct })); m.position.set(cx, (IH - 0.18) / 2 + 0.02, cz); im(m); blk(cx - cw / 2, cx + cw / 2, cz - 0.1, cz + 0.1); });
        bx(W - 0.1, 0.04, 0.04, '#d9d5cc', CX, IH - 0.09, cz);
        // 걸레받이·천장 몰딩
        [[CX, Z0, W, 0.024], [CX, Z1, W, 0.024], [X0, CZ, 0.024, L], [X1, CZ, 0.024, L]].forEach(function (q) { bx(q[2], 0.1, q[3], trimC, q[0], 0.05, q[1]); bx(q[2], 0.06, q[3], trimC, q[0], IH - 0.04, q[1]); });
        // 화장실 — 왼쪽 위 칸. 벽으로 막고 통로 쪽에 문
        var tX1 = PX(580), tZ1 = PZ(305);
        wallX(tX1 + SX * WT / 2, Z0, tZ1 + WT); wallZ(tZ1 + WT / 2, X0, tX1);
        var tdz = PZ(200); bx(0.8, 2.05, 0.05, trimC, tX1 + SX * (WT + 0.02), 1.025, tdz, Math.PI / 2); bx(0.72, 1.98, 0.05, '#f1ece2', tX1 + SX * (WT + 0.045), 0.99, tdz, Math.PI / 2);
        bx(0.03, 0.12, 0.03, '#c9c9c4', tX1 + SX * (WT + 0.09), 1.0, tdz - 0.28);
        var wcp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ map: nameTex('화장실', '#e5e7eb', '#374151', 320, 112), transparent: true })); wcp.position.set(tX1 + SX * (WT + 0.08), 2.25, tdz); wcp.rotation.y = SX * Math.PI / 2; im(wcp);
        blk(X0, tX1 + SX * WT, Z0, tZ1 + WT);
        // 현관 — 문 앞 한 단 낮은 타일, 신발
        var sZ1 = PZ(150);
        var vt = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(dX1 - dX0) - WT, sZ1 - Z0), lam('#b3aea4')); vt.rotation.x = -Math.PI / 2; vt.position.set((dX0 + SX * WT + dX1) / 2, 0.02, (Z0 + sZ1) / 2); im(vt);
        bx(Math.abs(dX1 - dX0) - WT, 0.07, 0.06, trimC, (dX0 + SX * WT + dX1) / 2, 0.035, sZ1);
        [[-0.25, 0.25, '#2b2b2b'], [0.08, 0.45, '#f2f2f2'], [0.28, 0.2, '#3b5b8a']].forEach(function (q) { [-0.06, 0.06].forEach(function (d2) { bx(0.1, 0.08, 0.26, q[2], doorX + q[0] + d2, 0.06, Z0 + q[1] + 0.15); }); });
        // 세면대·서랍 — 화장실 벽에 붙어 교실 쪽을 본다. 아래 냉장고
        var kZ0 = tZ1 + WT, kZ1 = PZ(443), kd = kZ1 - kZ0, sx0 = X0, sx1 = PX(475);
        bx(Math.abs(sx1 - sx0), 0.85, kd, '#a87a4f', (sx0 + sx1) / 2, 0.425, (kZ0 + kZ1) / 2); bx(Math.abs(sx1 - sx0) + 0.02, 0.03, kd + 0.02, '#7d7f80', (sx0 + sx1) / 2, 0.865, (kZ0 + kZ1) / 2);
        for (var di = 0; di < 3; di++) { var dx2 = sx0 + (di + 0.5) * ((sx1 - sx0) / 3); bx(Math.abs(sx1 - sx0) / 3 - 0.04, 0.005, 0.005, '#6b4a2e', dx2, 0.62, kZ1 + 0.003); bx(0.02, 0.02, 0.12, '#d6d2c8', dx2, 0.75, kZ1 + 0.01); }
        var skx = sx0 + SX * 0.55; bx(0.42, 0.02, 0.5, '#b8bcc0', skx, 0.885, (kZ0 + kZ1) / 2); bx(0.03, 0.28, 0.03, '#c9c9c4', skx, 1.02, kZ0 + 0.1); bx(0.03, 0.03, 0.14, '#c9c9c4', skx, 1.15, kZ0 + 0.16);
        var mir = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.7), new THREE.MeshLambertMaterial({ color: 0xdfe8ee })); mir.position.set(skx, 1.55, kZ0 + 0.01); im(mir);
        bx(Math.abs(sx1 - sx0), 0.65, 0.33, '#c49a6c', (sx0 + sx1) / 2, 2.0, kZ0 + 0.165);
        var fx0 = sx1 + SX * 0.02, fx1 = PX(580);
        bx(Math.abs(fx1 - fx0), 1.75, kd - 0.04, '#9fa8b1', (fx0 + fx1) / 2, 0.875, (kZ0 + kZ1) / 2); bx(Math.abs(fx1 - fx0) - 0.02, 0.012, 0.012, '#6b737b', (fx0 + fx1) / 2, 1.2, kZ1 - 0.015);   // 냉장고 — 은회색, 위아래 문 틈
        bx(0.025, 0.35, 0.03, '#4b5259', fx0 + SX * 0.08, 1.45, kZ1 - 0.01); bx(0.025, 0.3, 0.03, '#4b5259', fx0 + SX * 0.08, 0.95, kZ1 - 0.01);
        blk(X0, fx1, kZ0, kZ1);
        // 소화기
        var ex = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 12), lam('#c62828')); ex.position.set(fx1 + SX * 0.15, 0.26, kZ1 - 0.12); im(ex);
        // 앞 — 그림 위쪽 벽(x0): 화이트보드, TV책상(TV), 에어컨
        var wbZ = (PZ(540) + PZ(770)) / 2, wbW = PZ(770) - PZ(540);   // 그림보다 조금 넓게
        bx(0.03, 1.16, wbW + 0.06, '#c8c8c4', X0 + SX * 0.015, 1.55, wbZ);
        var bd = new THREE.Mesh(new THREE.PlaneGeometry(wbW, 1.1), new THREE.MeshBasicMaterial({ map: boardTex() })); bd.position.set(X0 + SX * 0.035, 1.55, wbZ); bd.rotation.y = SX * Math.PI / 2; im(bd);
        bx(0.06, 0.03, wbW * 0.8, '#c8c8c4', X0 + SX * 0.045, 0.98, wbZ);
        var acZ = PZ(1201); bx(0.24, 0.3, 1.0, '#e6e8ea', X0 + SX * 0.13, 2.4, acZ); bx(0.02, 0.05, 0.9, '#8d949b', X0 + SX * 0.255, 2.29, acZ); bx(0.01, 0.03, 0.08, '#4caf50', X0 + SX * 0.255, 2.48, acZ + 0.38);   // 벽에어컨 — 앞벽 창가 쪽 끝
        var tz0 = PZ(778), tz1 = PZ(1123), tdx = 0.5, tcz = (tz0 + tz1) / 2;
        bx(tdx, 0.04, tz1 - tz0, '#cdb58c', X0 + SX * tdx / 2, TH - 0.02, tcz); [[0.05, 0.05], [tdx - 0.05, 0.05], [0.05, tz1 - tz0 - 0.05], [tdx - 0.05, tz1 - tz0 - 0.05]].forEach(function (q) { bx(0.04, TH - 0.04, 0.04, '#f2f2f0', X0 + SX * q[0], (TH - 0.04) / 2, tz0 + q[1]); });
        var tvz = tcz + 0.2; bx(0.05, 0.62, 1.05, '#141414', X0 + SX * 0.2, TH + 0.35, tvz); bx(0.012, 0.56, 0.98, '#26292e', X0 + SX * 0.23, TH + 0.35, tvz); bx(0.2, 0.03, 0.3, '#141414', X0 + SX * 0.2, TH + 0.015, tvz);
        blk(X0, X0 + SX * tdx, tz0, tz1);
        // 선생님 의자 — 화이트보드와 TV책상 사이, 학생 쪽을 본다
        var tcx = PX(158), tcz2 = PZ(766);
        bx(0.44, 0.06, 0.44, '#6b2440', tcx, 0.46, tcz2); bx(0.05, 0.5, 0.44, '#6b2440', tcx - SX * 0.2, 0.76, tcz2);
        [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b2) { bx(0.03, 0.44, 0.03, '#b08a4a', tcx + a * 0.17, 0.22, tcz2 + b2 * 0.17); }); });
        blk(tcx - 0.24, tcx + 0.24, tcz2 - 0.24, tcz2 + 0.24);
        // 책상 2×2 — 그림 그대로. 앞(x0)을 보고 앉고, 책상마다 의자 3개. 책상 앞판은 검정, 의자는 자주 쿠션에 금색 다리
        var TD = 0.5, legs = [], panels = [], seats = [], backs = [], clegs = [];
        [[328, 408], [549, 629]].forEach(function (row) {
          var dxc = PX(row[0]), chx = PX(row[1]) + SX * 0.05;
          [[529, 887], [928, 1285]].forEach(function (span) {
            var z0 = PZ(span[0]), z1 = PZ(span[1]), zc = (z0 + z1) / 2, TW = z1 - z0;
            bx(TD, 0.04, TW, '#d8c29a', dxc, TH - 0.02, zc);
            [-1, 1].forEach(function (e) { legs.push([dxc + SX * 0.12, (TH - 0.04) / 2, zc + e * (TW / 2 - 0.08)]); });
            panels.push([dxc - SX * (TD / 2 - 0.03), TH - 0.3, zc]);
            [-TW / 3, 0, TW / 3].forEach(function (d3) { var cz2 = zc + d3; seats.push([chx, 0.46, cz2]); backs.push([chx + SX * 0.2, 0.76, cz2]); [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) { clegs.push([chx + a * 0.17, 0.22, cz2 + b * 0.17]); }); }); });
            blk(dxc - TD / 2, dxc + TD / 2, z0, z1); blk(chx - 0.22, chx + 0.24, z0, z1);
          });
        });
        inst(new THREE.BoxGeometry(0.05, TH - 0.04, 0.05), '#f2f2f0', legs);
        inst(new THREE.BoxGeometry(0.03, 0.52, (PZ(887) - PZ(529)) - 0.06), '#1b1b1b', panels);
        inst(new THREE.BoxGeometry(0.42, 0.06, 0.42), '#6b2440', seats); inst(new THREE.BoxGeometry(0.05, 0.5, 0.42), '#6b2440', backs); inst(new THREE.BoxGeometry(0.03, 0.44, 0.03), '#b08a4a', clegs);
        // 천장 등 — 교실 셋, 통로 하나
        var lm = new THREE.MeshBasicMaterial({ color: 0xffffff });
        [PZ(650), PZ(900), PZ(1150)].forEach(function (z) { bx(0.62, 0.05, 1.25, lm, CX, IH - 0.035, z); }); bx(0.5, 0.05, 0.5, lm, doorX, IH - 0.035, PZ(250));
        // 문 — 누르면 나간다. 위에 이름판
        bx(DW + 0.12, 2.18, 0.05, trimC, doorX, 1.09, Z0 + 0.02);
        bx(DW - 0.04, 2.08, 0.05, '#4a2f1d', doorX, 1.04, Z0 + 0.045, 0, { exit: true });
        bx(0.12, 0.03, 0.03, '#c9c9c4', doorX - DW / 2 + 0.12, 1.0, Z0 + 0.1, 0, { exit: true });
        var r2 = roomOf(t.num), np2 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), new THREE.MeshBasicMaterial({ map: nameTex(titleOf(t), r2.bg, r2.ink, 512, 128), transparent: true }));
        np2.position.set(doorX, 2.42, Z0 + 0.012); im(np2, { info: true });
        // 걸을 수 있는 곳 — 통로 + 교실
        var A = [[dX0 + SX * WT, X1, Z0, PZ(443)], [X0, X1, PZ(443), Z1]].map(function (q) { var c = lw((q[0] + q[1]) / 2, (q[2] + q[3]) / 2); return { key: 'room', name: titleOf(t), pts: boxPts(c[0], c[1], Math.abs(q[1] - q[0]), q[3] - q[2], g.ang) }; });
        areas[key] = A; obst[key] = obs2;
        A.forEach(function (a) { flat(a.pts, floorY(g.f) + 0.22, true, pickMat, { room: key, f: g.f, walk: 'room' }); });
        var e0 = lw(doorX, PZ(120)), ent = snapFree(key, { x: e0[0], z: e0[1] }) || { x: e0[0], z: e0[1] };
        return { group: ig, entry: { x: ent.x, z: ent.z, yaw: g.ang + Math.PI }, light: lw(CX, PZ(900)), size: Math.hypot(W, L) };
      }
      // 바닥·천장
      var ft = woodTex().clone(); ft.needsUpdate = true; ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(wIn / 1.2, dIn / 1.2);
      var fl = new THREE.Mesh(new THREE.PlaneGeometry(wIn, dIn), new THREE.MeshLambertMaterial({ map: ft })); fl.rotation.x = -Math.PI / 2; fl.position.y = 0.012; im(fl);
      var ce = new THREE.Mesh(new THREE.PlaneGeometry(wIn, dIn), new THREE.MeshBasicMaterial({ color: 0xf4f2ee })); ce.rotation.x = Math.PI / 2; ce.position.y = IH - 0.01; im(ce);   // 천장은 빛을 안 받으니 그냥 밝게
      // 벽 — 뒤(문 쪽). 창은 강의실이면 양옆, 다른 방은 앞(바깥)
      bx(g.w, IH, WT, wallC, 0, IH / 2, -D2 + WT / 2);
      var WY0 = 0.3, WY1 = 2.3, glassMat = new THREE.MeshLambertMaterial({ color: 0xcfe6f3, transparent: true, opacity: 0.28, depthWrite: false }), ct = curtainTex();
      /** 옆벽(s = -1 오른쪽·+1 왼쪽, 창을 보고) — zc 가운데로 폭 WW 창 */
      function sideWall(s, zc, WW) {
        var x = s * (W2 - WT / 2);
        if (!WW) { bx(WT, IH, g.d, wallC, x, IH / 2, 0); return; }
        var za = zc - WW / 2, zb = zc + WW / 2, ix = x - s * (WT / 2 + 0.09), cw = 0.6;
        bx(WT, IH, za + D2, wallC, x, IH / 2, (za - D2) / 2); bx(WT, IH, D2 - zb, wallC, x, IH / 2, (zb + D2) / 2);
        bx(WT, WY0, WW, wallC, x, WY0 / 2, zc); bx(WT, IH - WY1, WW, wallC, x, (IH + WY1) / 2, zc);
        bx(0.1, 0.06, WW, frameC, x, WY0 + 0.03, zc); bx(0.1, 0.06, WW, frameC, x, WY1 - 0.03, zc);
        bx(0.1, WY1 - WY0, 0.06, frameC, x, (WY0 + WY1) / 2, za + 0.03); bx(0.1, WY1 - WY0, 0.06, frameC, x, (WY0 + WY1) / 2, zb - 0.03); bx(0.1, WY1 - WY0, 0.05, frameC, x, (WY0 + WY1) / 2, zc);
        bx(0.02, WY1 - WY0 - 0.12, WW - 0.12, glassMat, x, (WY0 + WY1) / 2, zc);
        [-1, 1].forEach(function (k) { var cz = zc + k * (WW / 2 + cw / 2 - 0.3), m = new THREE.Mesh(new THREE.BoxGeometry(0.14, IH - 0.18, cw), new THREE.MeshLambertMaterial({ map: ct })); m.position.set(ix, (IH - 0.18) / 2 + 0.02, cz); im(m); block(ix, cz, 0.2, cw); });
        bx(0.04, 0.04, WW + 2 * cw, '#d9d5cc', ix, IH - 0.09, zc);
      }
      var fz = D2 - WT / 2;
      if (style === 'classroom' && !basement) {
        var wzc = (-D2 + WT + 1.0 + D2 - WT) / 2, wWW = Math.min(2.4, g.d - 2.4);   // 현관 앞 네모난 교실 가운데
        sideWall(-1, wzc, wWW); sideWall(1, wzc, wWW);
        bx(g.w, IH, WT, wallC, 0, IH / 2, fz);
      } else {
        sideWall(-1); sideWall(1);
        if (basement) bx(g.w, IH, WT, wallC, 0, IH / 2, fz);
        else {
          var WW = Math.min(wIn - 1.2, 3.6), pier = (g.w - WW) / 2;
          bx(pier, IH, WT, wallC, -(W2 - pier / 2), IH / 2, fz); bx(pier, IH, WT, wallC, W2 - pier / 2, IH / 2, fz);
          bx(WW, WY0, WT, wallC, 0, WY0 / 2, fz); bx(WW, IH - WY1, WT, wallC, 0, (IH + WY1) / 2, fz);
          bx(WW, 0.06, 0.1, frameC, 0, WY0 + 0.03, fz); bx(WW, 0.06, 0.1, frameC, 0, WY1 - 0.03, fz);
          bx(0.06, WY1 - WY0, 0.1, frameC, -WW / 2 + 0.03, (WY0 + WY1) / 2, fz); bx(0.06, WY1 - WY0, 0.1, frameC, WW / 2 - 0.03, (WY0 + WY1) / 2, fz); bx(0.05, WY1 - WY0, 0.1, frameC, 0, (WY0 + WY1) / 2, fz);
          bx(WW - 0.12, WY1 - WY0 - 0.12, 0.02, glassMat, 0, (WY0 + WY1) / 2, fz);
          bx(WW, 0.08, 0.16, frameC, 0, WY0 - 0.02, fz - 0.05);   // 창턱
          var cw = Math.min(0.7, pier + 0.3);
          [-1, 1].forEach(function (k) { var cx = k * (WW / 2 + cw / 2 - 0.35), m = new THREE.Mesh(new THREE.BoxGeometry(cw, IH - 0.18, 0.14), new THREE.MeshLambertMaterial({ map: ct })); m.position.set(cx, (IH - 0.18) / 2 + 0.02, D2 - WT - 0.14); im(m); block(cx, D2 - WT - 0.14, cw, 0.2); });
          bx(WW + 2 * cw, 0.04, 0.04, '#d9d5cc', 0, IH - 0.09, D2 - WT - 0.14);   // 커튼 봉
        }
      }
      // 걸레받이·천장 몰딩 (짙은 나무)
      [[0, -D2 + WT + 0.012, wIn, 0.024], [0, D2 - WT - 0.012, wIn, 0.024], [-W2 + WT + 0.012, 0, 0.024, dIn], [W2 - WT - 0.012, 0, 0.024, dIn]].forEach(function (s) { bx(s[2], 0.1, s[3], trimC, s[0], 0.05, s[1]); bx(s[2], 0.06, s[3], trimC, s[0], IH - 0.04, s[1]); });
      // 천장 등 — 큰 곳은 여러 개
      var lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff }), nlx = Math.max(1, Math.round(wIn / 4)), nlz = Math.max(1, Math.round(dIn / 4));
      for (var li = 0; li < nlx; li++) for (var lj = 0; lj < nlz; lj++) bx(1.25, 0.05, 0.62, lightMat, (li + 0.5) * (wIn / nlx) - wIn / 2, IH - 0.035, (lj + 0.5) * (dIn / nlz) - dIn / 2);
      // 문 — 뒤 벽. 누르면 나간다
      var doorX = style === 'classroom' ? W2 - WT - 0.95 : 0, dz = -D2 + WT;   // 강의실 문은 한쪽 구석 — 옆이 현관
      bx(1.0, 2.15, 0.05, trimC, doorX, 1.075, dz + 0.02);
      bx(0.86, 2.05, 0.05, '#4a2f1d', doorX, 1.025, dz + 0.045, 0, { exit: true });
      bx(0.03, 0.03, 0.12, '#c9c9c4', doorX + 0.34, 1.0, dz + 0.1, 0, { exit: true });
      // 이름판 — 문 옆
      var r = t.num ? roomOf(t.num) : placeColor(g.kind);
      var np = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: nameTex(titleOf(t), r.bg, r.ink, 512, 128), transparent: true }));
      np.position.set(style === 'classroom' ? doorX : doorX - 1.3, style === 'classroom' ? 2.45 : 2.0, dz + 0.012); im(np, { info: true });   // 누르면 명단·상세
      if (style === 'classroom') {
        var x0 = -W2 + WT, x1 = W2 - WT, z0 = dz, z1 = D2 - WT;
        // 현관 — 문 앞 한 단 낮은 타일에 신발, 옆에 신발장. 턱을 넘어야 교실
        var vx0 = doorX - 0.75, vz1 = z0 + 1.0;
        var vt = new THREE.Mesh(new THREE.PlaneGeometry(x1 - vx0, vz1 - z0), lam('#b3aea4')); vt.rotation.x = -Math.PI / 2; vt.position.set((vx0 + x1) / 2, 0.02, (z0 + vz1) / 2); im(vt);
        bx(x1 - vx0, 0.07, 0.06, trimC, (vx0 + x1) / 2, 0.035, vz1); bx(0.06, 0.07, vz1 - z0, trimC, vx0, 0.035, (z0 + vz1) / 2);
        bx(0.34, 1.05, 0.8, '#e8e1d2', x1 - 0.17, 0.525, z0 + 0.5); bx(0.01, 0.9, 0.02, '#cfc7b6', x1 - 0.345, 0.55, z0 + 0.5); block(x1 - 0.17, z0 + 0.5, 0.34, 0.8);
        [[-0.25, 0.35, '#2b2b2b'], [0.05, 0.4, '#f2f2f2'], [0.3, 0.32, '#3b5b8a']].forEach(function (q) { [-0.06, 0.06].forEach(function (d2) { bx(0.1, 0.08, 0.26, q[2], doorX + q[0] + d2, 0.06, z0 + q[1] + 0.3); }); });
        // 문 쪽 — 냉장고·서랍·세면대(개수대)·윗장
        var kx0 = x0, kx1 = vx0 - 0.06, kd = 0.6;
        bx(0.7, 1.8, 0.66, '#e9ecef', kx0 + 0.35, 0.9, z0 + 0.33); bx(0.66, 0.01, 0.01, '#b9bec4', kx0 + 0.35, 1.15, z0 + 0.665); bx(0.03, 0.4, 0.03, '#b9bec4', kx0 + 0.62, 1.45, z0 + 0.68); block(kx0 + 0.35, z0 + 0.33, 0.7, 0.66);
        var cx0 = kx0 + 0.75, cL = kx1 - cx0, ccx = (cx0 + kx1) / 2;
        if (cL > 0.8) {
          bx(cL, 0.85, kd, '#efe9dc', ccx, 0.425, z0 + kd / 2); bx(cL + 0.02, 0.03, kd + 0.02, '#d9d6d0', ccx, 0.865, z0 + kd / 2);
          for (var di = 0; di < Math.floor(cL / 0.5); di++) { var dxx = cx0 + 0.25 + di * 0.5; bx(0.46, 0.005, 0.005, '#bdb6a8', dxx, 0.62, z0 + kd + 0.003); bx(0.12, 0.02, 0.02, '#9a9488', dxx, 0.75, z0 + kd + 0.01); }
          var skx = cx0 + Math.min(cL - 0.35, 1.0); bx(0.55, 0.02, 0.42, '#b8bcc0', skx, 0.885, z0 + 0.3); bx(0.03, 0.28, 0.03, '#c9c9c4', skx, 1.02, z0 + 0.12); bx(0.03, 0.03, 0.14, '#c9c9c4', skx, 1.15, z0 + 0.18);
          bx(cL, 0.7, 0.35, '#f3efe6', ccx, 1.95, z0 + 0.175);
          block(ccx, z0 + kd / 2, cL, kd);
        }
        // 소화기 — 현관 턱 옆
        var ex = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 12), lam('#c62828')); ex.position.set(vx0 - 0.15, 0.26, vz1 + 0.12); im(ex);
        // 앞 — 화이트보드(에어컨이 위), 선생님 책상에 TV
        var bx0 = 0.55, bz = z1;
        bx(1.66, 1.16, 0.03, '#c8c8c4', bx0, 1.6, bz - 0.015);
        var bd = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshBasicMaterial({ map: boardTex() })); bd.position.set(bx0, 1.6, bz - 0.035); bd.rotation.y = Math.PI; im(bd);
        bx(1.2, 0.03, 0.06, '#c8c8c4', bx0, 1.03, bz - 0.045);
        bx(0.9, 0.3, 0.24, '#f6f6f4', bx0, 2.45, bz - 0.12);
        var tvx = -1.45, TH = 0.72;
        bx(1.2, 0.04, 0.5, '#cdb58c', tvx, TH - 0.02, bz - 0.3); [-1, 1].forEach(function (k) { bx(0.05, TH - 0.04, 0.05, '#f2f2f0', tvx + k * 0.55, (TH - 0.04) / 2, bz - 0.3); });
        bx(1.05, 0.62, 0.05, '#141414', tvx, TH + 0.33, bz - 0.28); bx(0.98, 0.56, 0.012, '#26292e', tvx, TH + 0.33, bz - 0.31);
        block(tvx, bz - 0.3, 1.3, 0.6);
        // 책상 2×2 — 사진처럼 책상 두 개를 이어 붙인 줄이 앞(화이트보드)을 향해 두 줄. 의자는 줄마다 한쪽에만 책상당 3개,
        // 옆을 보고 앉아 고개를 돌려 앞을 본다. 책상 앞판은 검정, 의자는 자주 쿠션에 금색 다리(연회장 의자)
        var TW = 1.4, TD = 0.5, zEnd = z1 - 0.65, zA = zEnd - 2 * TW, legs = [], panels = [], seats = [], backs = [], clegs = [];
        [x0 + 1.5, x0 + 3.75].forEach(function (rx) {
          if (rx + TD / 2 > x1 - 0.2) rx = x1 - 0.2 - TD / 2;
          [0, 1].forEach(function (k) {
            var rz = zA + TW / 2 + k * TW;
            bx(TD, 0.04, TW - 0.01, '#d8c29a', rx, TH - 0.02, rz);
            [-1, 1].forEach(function (e) { legs.push([rx - TD / 2 + 0.06, (TH - 0.04) / 2, rz + e * (TW / 2 - 0.08)]); });
            panels.push([rx + TD / 2 - 0.03, TH - 0.3, rz]);
            [-TW / 3, 0, TW / 3].forEach(function (dz2) { var cx = rx - TD / 2 - 0.24, cz = rz + dz2; seats.push([cx, 0.46, cz]); backs.push([cx - 0.2, 0.76, cz]); [-1, 1].forEach(function (a2) { [-1, 1].forEach(function (b2) { clegs.push([cx + a2 * 0.17, 0.22, cz + b2 * 0.17]); }); }); });
          });
          block(rx, zA + TW, TD, 2 * TW); block(rx - TD / 2 - 0.24, zA + TW, 0.44, 2 * TW);
        });
        inst(new THREE.BoxGeometry(0.05, TH - 0.04, 0.05), '#f2f2f0', legs);
        inst(new THREE.BoxGeometry(0.03, 0.52, TW - 0.06), '#1b1b1b', panels);
        inst(new THREE.BoxGeometry(0.42, 0.06, 0.42), '#6b2440', seats); inst(new THREE.BoxGeometry(0.05, 0.5, 0.42), '#6b2440', backs); inst(new THREE.BoxGeometry(0.03, 0.44, 0.03), '#b08a4a', clegs);
      } else {
        // 아직 사진이 없는 종류 — 안내판만
        var sp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshBasicMaterial({ map: nameTex('안 모습은 준비 중이에요', '#f3f4f6', '#6b7280', 640, 128), transparent: true }));
        sp.position.set(-W2 + WT + 0.02, 1.6, 0); sp.rotation.y = Math.PI / 2; im(sp);   // 오른쪽 벽
      }
      // 걸을 수 있는 자리 — 안쪽 바닥. 누르면 그리로
      var pts = boxPts(g.c[0], g.c[1], wIn, dIn, g.ang);
      areas[key] = [{ key: 'room', name: titleOf(t), pts: pts }]; obst[key] = obs;
      flat(pts, floorY(g.f) + 0.22, true, pickMat, { room: key, f: g.f, walk: 'room' });   // 복도 바닥판(0.21)보다 살짝 위 — 먼저 맞는다
      var e0 = lw(doorX, dz + 0.6), ent = snapFree(key, { x: e0[0], z: e0[1] }) || { x: e0[0], z: e0[1] };   // 문 안쪽, 걸을 수 있는 칸
      return { group: ig, entry: { x: ent.x, z: ent.z, yaw: g.ang + Math.PI }, light: lw(0, 0), size: Math.hypot(wIn, dIn) };
    }
    var fading = false;
    function fadeSwitch(fn) {
      if (fading) return; fading = true; fade.style.opacity = '1';
      setTimeout(function () { fn(); setTimeout(function () { fade.style.opacity = '0'; fading = false; }, 40); }, 200);
    }
    /** 방 문 앞(복도)·장소 앞 — 나갈 때 서는 자리 */
    function doorFront(t, g) {
      if (t.num) { var d = roomDoor[t.num]; return { x: d.x + d.nx * (HW + 1), z: d.z + d.nz * (HW + 1), yaw: Math.atan2(d.nx, d.nz), pitch: -0.1 }; }
      var cs = Math.cos(g.ang), sn = Math.sin(g.ang), p = { x: g.c[0] - (g.d / 2 + 1.2) * sn, z: g.c[1] - (g.d / 2 + 1.2) * cs };
      p = snapFree(g.f, p) || p; return { x: p.x, z: p.z, yaw: g.ang + Math.PI, pitch: -0.1 };
    }
    function enterRoom(t) {
      var g = t.num ? roomGeom[t.num] : placeGeom[t.pid]; if (!g || fading) return;
      var key = t.num ? 'r:' + t.num : 'p:' + t.pid;
      var back = mode === 'walk' && walkFloor === g.f && !inRoom ? { x: eye.x, z: eye.z, yaw: yaw, pitch: pitch } : doorFront(t, g);
      if (inRoom) leaveRoom(false);
      if (mode !== 'walk') setMode('walk');
      if (walkFloor !== g.f) setWalkFloor(g.f);
      var it = interiors[key] || (interiors[key] = buildInterior(key, g, t));
      fadeSwitch(function () {
        inRoom = { key: key, num: t.num, pid: t.pid, f: g.f, title: titleOf(t), back: back };
        resetWalkState(); eye.set(it.entry.x, floorY(g.f) + 1.6, it.entry.z); yaw = it.entry.yaw; pitch = -0.04;
        roomLight.position.set(it.light[0], floorY(g.f) + IH - 0.2, it.light[1]); roomLight.distance = Math.max(12, it.size * 1.6); roomLight.intensity = 0.3;
        hint.textContent = '끌어서 둘러보기 · 바닥을 눌러 이동 · 문을 누르면 나가기 · 이름판을 누르면 명단';
        applyVis(); send({ type: 'inside', num: t.num || null, id: t.pid || null });
      });
    }
    function leaveRoom(withFade) {
      if (!inRoom) return;
      var r = inRoom;
      function done() {
        inRoom = null; roomLight.intensity = 0; hint.textContent = '';
        resetWalkState(); eye.x = r.back.x; eye.z = r.back.z; yaw = r.back.yaw; pitch = r.back.pitch;
        applyVis(); send({ type: 'inside', num: null, id: null });
      }
      if (withFade) fadeSwitch(done); else done();
    }
    inBar.querySelector('button').onclick = function () { leaveRoom(true); };

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
      if (inRoom) leaveRoom(false);
      walkFloor = f; resetWalkState(); eye.y = floorY(f) + 1.6;
      if (!isFree(navGrid(f), eye.x, eye.z)) walkStart(f);   // 층마다 모양이 달라 벽 속이면 그 층 시작점으로
      applyVis(); miniSetup();
    }
    function setMode(m) {
      if (inRoom) leaveRoom(false);
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
          var g = navGrid(navKey()), ns = Math.max(1, Math.ceil(dir.length() / (g.cs * 0.4)));   // 느린 화면에서 한 번에 크게 뛰면 좁은 곳에 걸린다 — 잘게 나눠 간다
          for (var si = 0; si < ns; si++) {
            var nx = eye.x + dir.x / ns, nz = eye.z + dir.z / ns;
            if (isFree(g, nx, nz)) { eye.x = nx; eye.z = nz; } else if (isFree(g, nx, eye.z)) eye.x = nx; else if (isFree(g, eye.x, nz)) eye.z = nz; else break;   // 벽에 막히면 벽을 따라 미끄러진다
          }
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
    gl = { setFloor: setFloorCmd, setMode: setMode, goTo: goTo, enter: enterRoom, exit: function () { leaveRoom(true); }, pose: function (p) { if (p.x != null) eye.x = +p.x; if (p.z != null) eye.z = +p.z; if (p.yaw != null) yaw = +p.yaw; if (p.pitch != null) pitch = +p.pitch; }, state: function () { return { x: eye.x, z: eye.z, yaw: yaw, gliding: !!glide, floor: walkFloor, mode: mode, room: inRoom ? inRoom.key : null, sel: selList(), labels: Object.keys(labelSets).map(Number), roof: roofOn(), dist: dist, rotX: rotX, rotY: rotY, target: [target.x, target.y, target.z] }; } };
    ALLF.forEach(function (g) { sel[g] = P.floor ? g === P.floor : g > 0; });
    hint.textContent = ''; miniSetup(); setMode('orbit'); frameSel();
  }

  // 밖에서 부르는 명령 — web: iframe.contentWindow.postMessage, mobile: injectJavaScript
  window.lodgingState = function () { return gl && gl.state(); };
  window.lodgingCmd = function (m) {
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
    if (!m) return;
    if (m.type === 'goTo' && gl) gl.goTo(String(m.num));
    if (m.type === 'enter' && gl) gl.enter(m.num != null ? { num: String(m.num) } : { pid: String(m.id) });
    if (m.type === 'exit' && gl) gl.exit();
    if (m.type === 'pose' && gl) gl.pose(m);   // 걷기 시점 바로 놓기 { x, z, yaw, pitch }
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
