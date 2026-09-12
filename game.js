'use strict';
/* =========================================================
   샷핑! (SHOT-PING) — 새총 화살 × 쇼핑 슈팅 게임
   · 앵그리버드처럼 화면을 누른 채 뒤로 당겼다 놓으면 화살이 포물선으로 날아간다
   · 화장품·옷 타겟 = 점수 ↑ / 💣 폭탄 = 점수 ↓   (등장 비율 4 : 1)
   · BGM: 로시니 〈윌리엄 텔 서곡〉 피날레 — 사과를 쏜 명사수의 곡 (퍼블릭 도메인)
   · 응모: 이름·이메일 → coupon-pop 과 같은 Make.com 웹훅
   ========================================================= */

/* ---------------- 1. 설정 ---------------- */
const CONFIG = {
  brandName: '샷핑!',
  duration: 40,                 // 한 판 길이(초)
  countdown: 3,

  // 맞추면 점수가 오르는 타겟 — 화장품 4종 + 옷 4종
  targets: [
    { id:'lip',   emoji:'💄', name:'립스틱',   c:'#ff4f8b' },
    { id:'cream', emoji:'🧴', name:'수분크림', c:'#35b6f0' },
    { id:'nail',  emoji:'💅', name:'네일',     c:'#ff7ad0' },
    { id:'soap',  emoji:'🧼', name:'클렌저',   c:'#2ec79a' },
    { id:'dress', emoji:'👗', name:'원피스',   c:'#9c6bff' },
    { id:'shirt', emoji:'👕', name:'티셔츠',   c:'#4a8dff' },
    { id:'jeans', emoji:'👖', name:'청바지',   c:'#3d6bc4' },
    { id:'coat',  emoji:'🧥', name:'코트',     c:'#d08a45' }
  ],

  // 등장 비율: 타겟 4장 + 폭탄 1장을 섞은 덱에서 한 장씩 뽑는다 → 정확히 4:1
  deck: { targets:4, bombs:1 },

  points: {
    target: 100,
    comboStep: 20,     // 연속 명중(화살 기준) 1단계마다 +20
    comboMax: 10,      // 콤보 보너스 상한 (+200)
    pierce: 50,        // 한 발로 두 번째 이후 타겟을 뚫으면 추가
    bomb: -200
  },

  maxOnScreen: [5, 8],  // 동시 표시 개수 (시작 → 끝)
  lifeSec: [6.0, 3.8],  // 타겟이 머무는 시간 (시작 → 끝)
  spawnGap: 0.35,
  maxArrows: 6,         // 동시에 날아가는 화살 수

  clearScore: 1500,     // 이 점수 이상이면 웹훅 cleared=true
  grades: [
    { min:3000, grade:'S', label:'전설의 명사수' },
    { min:2000, grade:'A', label:'골드 아처' },
    { min:1000, grade:'B', label:'실버 아처' },
    { min:0,    grade:'C', label:'루키 아처' }
  ],
  idleReturn: 90        // 결과 화면 방치 시 대기 화면 복귀(초)
};

/* ============ BGM ============
   1순위: 실제 녹음 음원 (audio/william-tell-finale.mp3)
     · 로시니 〈윌리엄 텔 서곡〉 피날레 / 미 해병대 군악대 연주.
       미국 정부 저작물 → 퍼블릭 도메인. 출처: Wikimedia Commons
   2순위: 음원이 없거나 재생이 막히면 아래 합성 시퀀서로 자동 폴백        */
const AUDIO = {
  src: 'audio/william-tell-finale.mp3',   // 원곡 7:01 트럼펫 팡파르 ~ 끝 (236초)
  startAt: 42,       // 파일 0:42 = 원곡 7:43, 말발굽 갤럽 주제가 시작되는 지점
  volume: 0.5
};

/* 폴백용 합성 시퀀서 — 〈윌리엄 텔〉 갤럽 리듬 (따가닥 따가닥 딴) */
const MUSIC = { bpm: 152, vol: 0.08 };
const GALLOP = [   // [midi, 16분음표 길이]  0 = 쉼
  [64,1],[64,1],[64,2], [64,1],[64,1],[64,2], [64,1],[64,1],[69,2], [71,2],[72,2],
  [64,1],[64,1],[64,2], [64,1],[64,1],[69,2], [72,1],[72,1],[71,2], [67,2],[71,2],
  [64,1],[64,1],[64,2], [64,1],[64,1],[64,2], [64,1],[64,1],[69,2], [71,2],[72,2],
  [69,1],[72,1],[76,2], [74,2],[71,2], [69,4], [0,4]
];
const BASS = [45,52,45,52, 45,52,40,47];   // A2 / E3 반복

/* ============ 응모 정보 웹훅 ============
   coupon-pop 과 동일한 Make.com 웹훅. source 로 어느 게임에서 온 응모인지 구분.
   전송은 application/x-www-form-urlencoded — JSON 이면 CORS preflight 를 Make 가 거부한다. */
const WEBHOOK = {
  url: 'https://hook.eu1.make.com/iv6p47wuoc7rqnh1fb8884y0n5l6buuf',
  source: 'shot-ping-game',
  retrySec: 45,
  maxTries: 5
};

const STORE_BEST   = 'shotping_best';
const STORE_LEADS  = 'shotping_leads';
const STORE_OUTBOX = 'shotping_outbox';

/* ---------------- 2. DOM · 유틸 ---------------- */
const $ = id => document.getElementById(id);
const canvas = $('stage'), ctx = canvas.getContext('2d');
const el = {
  hud:$('hud'), score:$('score'), scorePill:$('scorePill'), time:$('time'), timefill:$('timefill'),
  combo:$('combo'), comboX:$('comboX'), hint:$('hint'), hitFlash:$('hitFlash'), banner:$('banner'),
  nowPlaying:$('nowPlaying'), npPerformer:$('npPerformer'),
  scAttract:$('scAttract'), scCount:$('scCount'), scResult:$('scResult'), countNum:$('countNum'),
  lineup:$('lineup'), rules:$('rules'), bestLine:$('bestLine'),
  rGrade:$('rGrade'), rGradeLabel:$('rGradeLabel'), rScore:$('rScore'), rBest:$('rBest'),
  rHits:$('rHits'), rBombs:$('rBombs'), rAcc:$('rAcc'), rCombo:$('rCombo'),
  leadBox:$('leadBox'), toast:$('toast')
};

const TAU = Math.PI * 2;
const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",-apple-system,sans-serif';
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const rand  = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const easeOutBack = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function buzz(p){ if (navigator.vibrate){ try { navigator.vibrate(p); } catch(e){} } }
function loadJSON(key, fallback){ try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch(e){ return fallback; } }
function saveJSON(key, v){ try { localStorage.setItem(key, JSON.stringify(v)); } catch(e){} }

/* ---------------- 3. 상태 ---------------- */
const S = { ATTRACT:'attract', COUNT:'count', PLAY:'play', END:'end', RESULT:'result' };
let state = S.ATTRACT;

let W = 0, H = 0, DPR = 1, sceneT = 0;
const L = {};                                  // 레이아웃 (화면 크기에 따라 계산)
const objs = [], arrows = [], parts = [], texts = [], clouds = [];
let aim = null;                                // { id, x0, y0, x, y }
let shake = 0, demoT = 1.2;

const G = {
  score:0, timeLeft:CONFIG.duration, elapsed:0,
  combo:0, bestCombo:0, shots:0, hitShots:0, targetsHit:0, bombsHit:0,
  deck:[], lastProd:null, spawnT:0, countT:0, countShown:0, endT:0, lastTick:0,
  code:'', grade:null, leadDone:false, idleAt:0
};

/* ---------------- 4. 캔버스 · 레이아웃 ---------------- */
function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  layout();
  if (!clouds.length){
    for (let i = 0; i < 5; i++) clouds.push({ x:rand(0, W), y:rand(H * 0.08, H * 0.4), s:rand(0.6, 1.3), v:rand(6, 18) });
  }
}

function layout(){
  const u = Math.min(W, H);
  const land = W >= H * 1.05;
  L.r = clamp(u * 0.068, 26, 54);
  L.ground = H - clamp(H * 0.1, 44, 96);
  L.maxPull = clamp(u * 0.2, 70, 160);
  L.arrowLen = clamp(u * 0.13, 52, 96);
  const top = 92 + L.r;

  if (land){
    L.sx = clamp(W * 0.15, 90, 260);
    L.sy = L.ground - clamp(H * 0.24, 90, 210);
    L.zone = { x0:Math.max(W * 0.38, L.sx + L.maxPull * 1.8), x1:W - L.r - 18, y0:top, y1:L.ground - L.r - 40 };
  } else {
    L.sx = clamp(W * 0.24, 70, 200);
    L.sy = L.ground - clamp(H * 0.15, 90, 180);
    L.zone = { x0:L.r + 14, x1:W - L.r - 14, y0:top, y1:Math.min(H * 0.6, L.sy - L.maxPull * 1.5) };
  }
  if (L.zone.y1 < L.zone.y0 + L.r * 3) L.zone.y1 = L.zone.y0 + L.r * 3;

  L.g = H * 1.2;
  // 존의 가장 먼 모서리까지 닿는 최소 발사속도 v² = g(dy + √(dx²+dy²)) 에 여유 20%
  const z = L.zone;
  let need = 0;
  for (const [cx, cy] of [[z.x0, z.y0], [z.x1, z.y0], [z.x1, z.y1], [z.x0, z.y1]]){
    const dx = cx - L.sx, dy = L.sy - cy;
    need = Math.max(need, Math.sqrt(L.g * (dy + Math.hypot(dx, dy))));
  }
  L.vmax = need * 1.2;

  el.hint.style.left = L.sx + 'px';
  el.hint.style.top  = (L.sy - L.maxPull * 0.9) + 'px';
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
resize();

/* ---------------- 5. 오디오 ---------------- */
let actx = null, master = null, soundOn = true, noiseBuf = null;
function audioOn(){
  if (!actx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    master = actx.createGain(); master.gain.value = soundOn ? 1 : 0;
    master.connect(actx.destination);
  }
  if (actx.state === 'suspended') actx.resume();
}
function toggleSound(){
  soundOn = !soundOn;
  if (master) master.gain.setTargetAtTime(soundOn ? 1 : 0, actx.currentTime, 0.02);
  if (music.el) music.el.volume = soundOn ? AUDIO.volume : 0;
  $('btnSound').textContent = soundOn ? '🔊' : '🔇';
  $('btnSound').classList.toggle('off', !soundOn);
}
function tone(freq, dur, o = {}){
  if (!actx) return;
  const t = actx.currentTime + (o.delay || 0);
  const osc = actx.createOscillator(), g = actx.createGain();
  osc.type = o.type || 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol || 0.15, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t); osc.stop(t + dur + 0.05);
}
function whoosh(dur, vol, f0, f1){
  if (!actx) return;
  if (!noiseBuf){
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.8, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = actx.currentTime;
  const src = actx.createBufferSource(); src.buffer = noiseBuf;
  const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}
const sfx = {
  stretch(){ tone(170, .09, { type:'sine', vol:.06, to:260 }); },
  shoot(p){ tone(240 + p * 140, .12, { type:'triangle', vol:.16, to:110 }); whoosh(.35, .06 + p * .22, 2600, 450); },
  hit(combo){
    const f = 560 * Math.pow(1.06, Math.min(combo, 16));
    tone(f, .08, { type:'square', vol:.09, to:f * 1.5 });
    tone(f * 1.5, .18, { type:'sine', vol:.13, delay:.05 });
  },
  pierce(){ [880, 1175, 1568].forEach((f, i) => tone(f, .16, { type:'sine', vol:.12, delay:i * .05 })); },
  bomb(){
    tone(180, .45, { type:'sawtooth', vol:.28, to:38 });
    tone(90, .55, { type:'square', vol:.2, to:30 });
    whoosh(.6, .45, 1400, 80);
  },
  tick(){ tone(1046, .07, { type:'sine', vol:.11 }); },
  go(){ tone(1318, .24, { type:'sine', vol:.18, to:1760 }); },
  end(){ [784, 659, 523, 392].forEach((f, i) => tone(f, .22, { type:'triangle', vol:.14, delay:i * .09 })); },
  win(){ [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, .4, { type:'triangle', vol:.14, delay:i * .09 })); }
};

/* ---------------- 6. BGM (음원 → 합성 폴백) ---------------- */
const music = { mode:'none', el:null, fileBroken:false, on:false, idx:0, step:0, next:0, timer:0, fade:0 };
const mid2f = m => 440 * Math.pow(2, (m - 69) / 12);

function prepareAudioFile(){
  if (music.el || music.fileBroken) return;
  const a = new Audio();
  a.src = AUDIO.src; a.preload = 'auto'; a.loop = true;
  a.volume = soundOn ? AUDIO.volume : 0;
  a.addEventListener('error', () => { music.fileBroken = true; music.el = null; }, { once:true });
  music.el = a;
}
prepareAudioFile();

function musicStart(){
  audioOn();
  clearInterval(music.fade);
  if (music.el && !music.fileBroken){
    music.mode = 'file';
    const a = music.el;
    // 메타데이터가 로드되기 전의 currentTime 지정은 무시되므로, 그때는 로드 직후에 건다
    const seek = () => { try { a.currentTime = AUDIO.startAt; } catch(e){} };
    if (a.readyState >= 1) seek(); else a.addEventListener('loadedmetadata', seek, { once:true });
    a.volume = soundOn ? AUDIO.volume : 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => synthStart());   // 재생 거부 → 합성으로
    return;
  }
  synthStart();
}
function synthStart(){
  if (!actx) return;
  music.mode = 'synth'; music.on = true; music.idx = 0; music.step = 0;
  music.next = actx.currentTime + 0.1;
  clearInterval(music.timer);
  music.timer = setInterval(musicSchedule, 25);
  musicSchedule();
}
function musicStop(){
  music.on = false; clearInterval(music.timer);
  const a = music.el;
  if (a && !a.paused){
    const v0 = a.volume; let k = 0;
    clearInterval(music.fade);
    music.fade = setInterval(() => {
      k++; a.volume = Math.max(0, v0 * (1 - k / 12));
      if (k >= 12){ clearInterval(music.fade); a.pause(); a.volume = soundOn ? AUDIO.volume : 0; }
    }, 50);
  }
}
function musicSchedule(){
  if (!music.on || !actx) return;
  const six = 60 / MUSIC.bpm / 4;
  const horizon = actx.currentTime + 0.12;
  let guard = 0;
  while (music.next < horizon && guard++ < 32){
    const [midi, len] = GALLOP[music.idx % GALLOP.length];
    if (midi) synthNote(mid2f(midi), music.next, six * len * 0.8, MUSIC.vol, 'square');
    if (music.step % 4 === 0) synthNote(mid2f(BASS[(music.step / 4) % BASS.length]), music.next, six * 1.6, MUSIC.vol * 1.3, 'triangle');
    // 8분음표마다 따가닥 하는 말발굽 소리
    if (music.step % 2 === 0) synthNote(music.step % 4 === 0 ? 150 : 220, music.next, 0.03, MUSIC.vol * 0.9, 'sine');
    music.next += six * len;
    music.step += len;
    music.idx++;
  }
}
function synthNote(f, t, dur, vol, type){
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function showNowPlaying(){
  el.npPerformer.textContent = music.mode === 'synth' ? '실시간 합성 연주' : '로시니 · 미 해병대 군악대';
  el.nowPlaying.classList.add('show');
  setTimeout(() => el.nowPlaying.classList.remove('show'), 5000);
}

/* ---------------- 7. 스폰 (4:1 덱) ---------------- */
function peekDeck(){
  if (!G.deck.length){
    G.deck = shuffle([
      ...Array(CONFIG.deck.targets).fill('target'),
      ...Array(CONFIG.deck.bombs).fill('bomb')
    ]);
  }
  return G.deck[G.deck.length - 1];
}
function pickProduct(){
  let p;
  do { p = CONFIG.targets[Math.random() * CONFIG.targets.length | 0]; } while (p === G.lastProd && CONFIG.targets.length > 1);
  G.lastProd = p;
  return p;
}

function spawnObj(progress){
  const type = peekDeck();
  const r = type === 'bomb' ? L.r * 0.92 : L.r;
  const z = L.zone;
  const moving = Math.random() < lerp(0.15, 0.7, progress);
  let driftA = moving ? rand(0.6, 2.0) * L.r * lerp(0.6, 1.3, progress) : 0;
  driftA = Math.min(driftA, Math.max(0, (z.x1 - z.x0) / 2 - 4));

  for (let i = 0; i < 18; i++){
    const bx = rand(z.x0 + driftA, z.x1 - driftA);
    const by = rand(z.y0, z.y1);
    if (Math.hypot(bx - L.sx, by - L.sy) < L.maxPull * 1.6 + r) continue;   // 새총 코앞은 피한다
    let ok = true;
    for (const o of objs){
      if (o.dead) continue;
      if (Math.hypot(bx - o.bx, by - o.by) < r + o.r + L.r * 0.7 + driftA + o.driftA){ ok = false; break; }
    }
    if (!ok) continue;

    G.deck.pop();
    objs.push({
      type, prod: type === 'target' ? pickProduct() : null,
      bx, by, x:bx, y:by, r, driftA,
      driftW: rand(0.8, 1.5) * (Math.random() < 0.5 ? -1 : 1),
      bobA: rand(3, 8), phase: rand(0, TAU),
      born: sceneT,
      life: lerp(CONFIG.lifeSec[0], CONFIG.lifeSec[1], progress) * rand(0.85, 1.15),
      scale: 0, alpha: 1, dead: false
    });
    return true;
  }
  return false;   // 자리가 없으면 덱을 소모하지 않는다 → 비율 유지
}

function updateObjs(){
  for (let i = objs.length - 1; i >= 0; i--){
    const o = objs[i];
    const age = sceneT - o.born;
    if (o.dead || age > o.life){ objs.splice(i, 1); continue; }
    o.x = o.bx + Math.sin(age * o.driftW + o.phase) * o.driftA;
    o.y = o.by + Math.sin(age * 2.2 + o.phase) * o.bobA;
    const tin = clamp(age / 0.3, 0, 1), tout = clamp((o.life - age) / 0.35, 0, 1);
    o.scale = easeOutBack(tin) * (0.5 + 0.5 * tout);
    o.alpha = tout;
  }
}

/* ---------------- 8. 발사 · 화살 ---------------- */
function pullVector(){
  if (!aim) return null;
  let px = aim.x - aim.x0, py = aim.y - aim.y0;
  const len = Math.hypot(px, py);
  if (len > L.maxPull){ px *= L.maxPull / len; py *= L.maxPull / len; }
  return { px, py, len:Math.min(len, L.maxPull) };
}
function launchState(pv){
  // 당긴 반대 방향으로, 당긴 거리에 비례한 속도
  const nx = -pv.px / pv.len, ny = -pv.py / pv.len;
  const power = pv.len / L.maxPull;
  const nockX = L.sx + pv.px, nockY = L.sy + pv.py;
  return {
    x: nockX + nx * L.arrowLen, y: nockY + ny * L.arrowLen,
    vx: nx * L.vmax * power, vy: ny * L.vmax * power, power
  };
}
function fireAt(ls, demo){
  if (arrows.filter(a => !a.stuck).length >= CONFIG.maxArrows) return;
  arrows.push({ x:ls.x, y:ls.y, vx:ls.vx, vy:ls.vy, ang:Math.atan2(ls.vy, ls.vx), hits:0, dead:false, ended:false, stuck:0, trail:[], demo });
  if (!demo){ G.shots++; sfx.shoot(ls.power); buzz(12); el.hint.classList.remove('show'); }
}

function updateArrows(dt){
  for (let i = arrows.length - 1; i >= 0; i--){
    const a = arrows[i];
    if (a.stuck > 0){ a.stuck -= dt; if (a.stuck <= 0) arrows.splice(i, 1); continue; }

    const n = Math.max(1, Math.ceil(Math.hypot(a.vx, a.vy) * dt / (L.r * 0.4)));  // 터널링 방지 서브스텝
    const h = dt / n;
    for (let s = 0; s < n && !a.dead; s++){
      a.vy += L.g * h; a.x += a.vx * h; a.y += a.vy * h;
      collide(a);
    }
    a.ang = Math.atan2(a.vy, a.vx);
    a.trail.push(a.x, a.y); if (a.trail.length > 14) a.trail.splice(0, 2);

    if (a.dead){ endArrow(a); arrows.splice(i, 1); continue; }
    if (a.y >= L.ground){ a.y = L.ground; a.stuck = 1.2; endArrow(a); continue; }   // 땅에 꽂힘
    if (a.x < -160 || a.x > W + 160 || a.y > H + 160){ endArrow(a); arrows.splice(i, 1); }
  }
}
function endArrow(a){
  if (a.ended) return;
  a.ended = true;
  if (!a.demo && !a.bombed && a.hits === 0 && (state === S.PLAY || state === S.END)){
    if (G.combo >= 2) popText(L.sx, L.sy - L.maxPull, '콤보 끊김', 16, '#fff', '#555');
    G.combo = 0;
  }
}

function collide(a){
  for (const o of objs){
    if (o.dead || o.scale < 0.5) continue;
    const rr = o.r * o.scale;
    if ((a.x - o.x) ** 2 + (a.y - o.y) ** 2 > rr * rr) continue;
    o.dead = true;
    if (o.type === 'bomb'){ hitBomb(o, a); a.dead = true; a.bombed = true; return; }
    hitTarget(o, a);                       // 타겟은 관통 — 화살은 계속 날아간다
  }
}

function hitTarget(o, a){
  burst(o.x, o.y, o.prod.c, 22);
  ring(o.x, o.y, o.r, o.prod.c);
  if (a.demo || (state !== S.PLAY && state !== S.END)){ sfx.hit(0); return; }

  if (a.hits === 0){ G.combo++; G.hitShots++; G.bestCombo = Math.max(G.bestCombo, G.combo); }
  a.hits++; G.targetsHit++;
  const P = CONFIG.points;
  const pts = P.target + P.comboStep * Math.min(G.combo - 1, P.comboMax) + (a.hits > 1 ? P.pierce * (a.hits - 1) : 0);
  addScore(pts);

  popText(o.x, o.y - o.r * 0.2, '+' + pts, 30, '#fff', o.prod.c);
  if (a.hits > 1){ popText(o.x, o.y - o.r - 26, `관통 x${a.hits}!`, 18, '#ffd76a', '#6a3500'); sfx.pierce(); }
  else if (G.combo >= 2) popText(o.x, o.y - o.r - 26, `${G.combo} COMBO`, 18, '#ffd76a', '#6a3500');
  sfx.hit(G.combo); buzz(18);
}

function hitBomb(o, a){
  explosion(o.x, o.y, o.r);
  shake = 18;
  sfx.bomb();
  if (a.demo || (state !== S.PLAY && state !== S.END)) return;

  G.bombsHit++; G.combo = 0;
  addScore(CONFIG.points.bomb);
  popText(o.x, o.y - o.r * 0.2, String(CONFIG.points.bomb).replace('-', '−'), 38, '#fff', '#d91f3c');
  el.hitFlash.classList.remove('on'); void el.hitFlash.offsetWidth; el.hitFlash.classList.add('on');
  buzz([70, 40, 110]);
}

function addScore(v){
  G.score = Math.max(0, G.score + v);
  const pill = el.scorePill;
  pill.classList.remove('up', 'down'); void pill.offsetWidth;
  pill.classList.add(v >= 0 ? 'up' : 'down');
}

/* ---------------- 9. 파티클 · 텍스트 ---------------- */
function burst(x, y, c, n){
  for (let i = 0; i < n; i++){
    const ang = rand(0, TAU), sp = rand(120, 460);
    parts.push({ k:'dot', x, y, vx:Math.cos(ang) * sp, vy:Math.sin(ang) * sp - 80, g:700,
      life:0, max:rand(.45, .8), size:rand(3, 7), c: Math.random() < .3 ? '#fff' : c });
  }
}
function ring(x, y, r, c){ parts.push({ k:'ring', x, y, r0:r * .6, r1:r * 2, life:0, max:.4, c, w:5 }); }
function explosion(x, y, r){
  const cs = ['#ffd23f', '#ff8a00', '#ff3b3b', '#fff3b0'];
  for (let i = 0; i < 34; i++){
    const ang = rand(0, TAU), sp = rand(160, 620);
    parts.push({ k:'dot', x, y, vx:Math.cos(ang) * sp, vy:Math.sin(ang) * sp, g:500,
      life:0, max:rand(.4, .9), size:rand(4, 10), c:cs[i % cs.length] });
  }
  for (let i = 0; i < 8; i++){
    parts.push({ k:'smoke', x:x + rand(-r, r) * .6, y:y + rand(-r, r) * .6, vx:rand(-40, 40), vy:rand(-90, -30), g:0,
      life:0, max:rand(.8, 1.3), size:r * rand(.5, .9), c:'rgba(70,60,80,' });
  }
  parts.push({ k:'ring', x, y, r0:r * .5, r1:r * 3.4, life:0, max:.5, c:'#ff8a00', w:10 });
  parts.push({ k:'ring', x, y, r0:r * .3, r1:r * 2.2, life:0, max:.35, c:'#fff', w:6 });
}
function popText(x, y, txt, size, fill, stroke){
  texts.push({ x, y, txt, size, fill, stroke, life:0, max:.9 });
}
function updateParts(dt){
  for (let i = parts.length - 1; i >= 0; i--){
    const p = parts[i];
    p.life += dt;
    if (p.life >= p.max){ parts.splice(i, 1); continue; }
    if (p.k !== 'ring'){ p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; }
  }
  for (let i = texts.length - 1; i >= 0; i--){
    const t = texts[i];
    t.life += dt; t.y -= 42 * dt;
    if (t.life >= t.max) texts.splice(i, 1);
  }
}

/* ---------------- 10. 그리기 ---------------- */
function draw(){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawSky();
  ctx.save();
  if (shake > 0.3) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawGround();
  drawSling(false);
  for (const o of objs) drawObj(o);
  drawTrajectory();
  for (const a of arrows) drawFlyingArrow(a);
  drawNockedArrow();
  drawSling(true);
  drawParts();
  drawTexts();
  ctx.restore();
}

function drawSky(){
  const g = ctx.createLinearGradient(0, 0, 0, L.ground);
  g.addColorStop(0, '#6ec6ff');
  g.addColorStop(0.65, '#bfe6ff');
  g.addColorStop(1, '#ffe0ef');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // 해
  const sx = W * 0.82, sy = H * 0.16, sr = Math.min(W, H) * 0.07;
  const sg = ctx.createRadialGradient(sx, sy, sr * .2, sx, sy, sr * 2.4);
  sg.addColorStop(0, 'rgba(255,248,200,.95)'); sg.addColorStop(.4, 'rgba(255,240,170,.45)'); sg.addColorStop(1, 'rgba(255,240,170,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr * 2.4, 0, TAU); ctx.fill();

  // 구름
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  for (const c of clouds){
    const s = c.s * Math.min(W, H) * 0.06;
    ctx.beginPath();
    ctx.arc(c.x, c.y, s, 0, TAU);
    ctx.arc(c.x + s * 1.1, c.y + s * .2, s * .8, 0, TAU);
    ctx.arc(c.x - s * 1.1, c.y + s * .25, s * .7, 0, TAU);
    ctx.arc(c.x + s * .3, c.y - s * .5, s * .7, 0, TAU);
    ctx.fill();
  }

  // 먼 언덕 두 겹
  hill(L.ground - H * 0.14, H * 0.05, 0.004, '#a6dc9c', 0.3);
  hill(L.ground - H * 0.06, H * 0.035, 0.007, '#86cf73', 1.7);
}
function hill(base, amp, freq, color, ph){
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, L.ground);
  for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, base + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 2.3 + ph) * amp * .4);
  ctx.lineTo(W, L.ground); ctx.closePath(); ctx.fill();
}
function drawGround(){
  ctx.fillStyle = '#6cc04a'; ctx.fillRect(0, L.ground, W, H - L.ground);
  ctx.fillStyle = '#58a83a'; ctx.fillRect(0, L.ground, W, 6);
  ctx.fillStyle = '#9a6a3a'; ctx.fillRect(0, L.ground + (H - L.ground) * 0.45, W, H);
  ctx.fillStyle = 'rgba(0,0,0,.08)';
  for (let x = 0; x < W; x += 34) ctx.fillRect(x, L.ground + (H - L.ground) * 0.45, 17, H);
}

/* 새총: back=false 면 뒤쪽 가지·고무줄, true 면 앞쪽 */
function slingPoints(){
  const w = L.r * 0.62;
  return {
    fork:{ x:L.sx, y:L.sy + L.r * 1.0 },
    left:{ x:L.sx - w, y:L.sy - L.r * 0.1 },
    right:{ x:L.sx + w, y:L.sy - L.r * 0.1 }
  };
}
function nockPoint(){
  const pv = pullVector();
  return pv && pv.len > 0 ? { x:L.sx + pv.px, y:L.sy + pv.py } : { x:L.sx, y:L.sy };
}
function drawSling(front){
  const p = slingPoints(), n = nockPoint();
  const lw = Math.max(8, L.r * 0.26);
  ctx.lineCap = 'round';
  if (!front){
    // 몸통 + 뒤 가지
    ctx.strokeStyle = '#6b3e1c'; ctx.lineWidth = lw * 1.25;
    ctx.beginPath(); ctx.moveTo(L.sx, L.ground + 4); ctx.lineTo(p.fork.x, p.fork.y); ctx.stroke();
    ctx.strokeStyle = '#7d4a22'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(p.fork.x, p.fork.y); ctx.lineTo(p.left.x, p.left.y); ctx.stroke();
    band(p.left, n);
  } else {
    band(p.right, n);
    ctx.strokeStyle = '#8f5629'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(p.fork.x, p.fork.y); ctx.lineTo(p.right.x, p.right.y); ctx.stroke();
    // 가죽 주머니
    ctx.fillStyle = '#4a2a14';
    ctx.beginPath(); ctx.arc(n.x, n.y, lw * 0.55, 0, TAU); ctx.fill();
  }
}
function band(from, to){
  ctx.strokeStyle = '#3a1e0c';
  ctx.lineWidth = Math.max(4, L.r * 0.11) * (aim ? 0.8 : 1);
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
}

function arrowShape(tx, ty, ang, len, alpha){
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.translate(tx, ty); ctx.rotate(ang);
  const w = Math.max(3, len * 0.055);
  ctx.strokeStyle = '#6b4424'; ctx.lineWidth = w; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(-len * 0.14, 0); ctx.stroke();
  // 촉
  ctx.fillStyle = '#dfe6ea'; ctx.strokeStyle = '#46505a'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-len * 0.22, -len * 0.09); ctx.lineTo(-len * 0.16, 0); ctx.lineTo(-len * 0.22, len * 0.09);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // 깃
  ctx.fillStyle = '#ff4f8b';
  for (const s of [-1, 1]){
    ctx.beginPath();
    ctx.moveTo(-len * 0.98, 0); ctx.lineTo(-len * 0.76, 0);
    ctx.lineTo(-len * 0.86, s * len * 0.1); ctx.lineTo(-len * 1.06, s * len * 0.1);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawFlyingArrow(a){
  if (a.trail.length >= 4){
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a.trail[0], a.trail[1]);
    for (let i = 2; i < a.trail.length; i += 2) ctx.lineTo(a.trail[i], a.trail[i + 1]);
    ctx.stroke();
  }
  arrowShape(a.x, a.y, a.ang, L.arrowLen, a.stuck > 0 ? Math.min(1, a.stuck / 0.4) : 1);
}
function drawNockedArrow(){
  if (state === S.RESULT || state === S.END) return;
  const pv = pullVector();
  if (pv && pv.len > 4){
    const n = nockPoint(), ang = Math.atan2(-pv.py, -pv.px);
    arrowShape(n.x + Math.cos(ang) * L.arrowLen, n.y + Math.sin(ang) * L.arrowLen, ang, L.arrowLen);
  } else {
    // 대기 중인 화살은 타겟 존 가운데를 겨눈다
    const z = L.zone;
    const ang = Math.atan2((z.y0 + z.y1) / 2 - L.sy, (z.x0 + z.x1) / 2 - L.sx) + Math.sin(sceneT * 2) * 0.04;
    arrowShape(L.sx + Math.cos(ang) * L.arrowLen, L.sy + Math.sin(ang) * L.arrowLen, ang, L.arrowLen);
  }
}
function drawTrajectory(){
  const pv = pullVector();
  if (!pv || pv.len < 14 || state !== S.PLAY) return;
  const ls = launchState(pv);
  let x = ls.x, y = ls.y, vx = ls.vx, vy = ls.vy;
  const dtp = 0.035;
  for (let i = 1; i <= 16; i++){
    for (let k = 0; k < 2; k++){ vy += L.g * dtp / 2; x += vx * dtp / 2; y += vy * dtp / 2; }
    if (y > L.ground) break;
    ctx.fillStyle = `rgba(255,255,255,${0.95 - i * 0.05})`;
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.8, 5.5 - i * 0.25), 0, TAU); ctx.fill();
  }
}

function drawObj(o){
  if (o.scale <= 0.01) return;
  const age = sceneT - o.born;
  ctx.save();
  ctx.translate(o.x, o.y); ctx.scale(o.scale, o.scale);
  ctx.globalAlpha = o.alpha;
  // 남은 시간 링 (라벨이 위에 오도록 먼저 그린다)
  const left = clamp(1 - age / o.life, 0, 1);
  ctx.strokeStyle = o.type === 'bomb' ? 'rgba(255,80,100,.9)' : 'rgba(255,255,255,.95)';
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, o.r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * left); ctx.stroke();
  if (o.type === 'bomb') drawBomb(o, age); else drawTarget(o);
  ctx.restore();
}
function drawTarget(o){
  const r = o.r, c = o.prod.c;
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, TAU); ctx.fill();
  ctx.strokeStyle = c; ctx.globalAlpha *= 0.35; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.stroke();
  ctx.globalAlpha /= 0.35;

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(r * 0.9)}px ${EMOJI_FONT}`;
  ctx.fillText(o.prod.emoji, 0, r * 0.05);

  label(o.prod.name, r, '#fff', c, '#2a1f4a');
}
function drawBomb(o, age){
  const r = o.r;
  // 회전하는 붉은 경고 점선
  ctx.save();
  ctx.rotate(age * 1.4);
  ctx.setLineDash([r * 0.24, r * 0.16]);
  ctx.strokeStyle = 'rgba(255,40,70,.85)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, TAU); ctx.stroke();
  ctx.restore();

  const g = ctx.createRadialGradient(-r * .35, -r * .35, r * .1, 0, 0, r);
  g.addColorStop(0, '#62627a'); g.addColorStop(1, '#101018');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();

  ctx.save(); ctx.rotate(0.7);
  ctx.fillStyle = '#2b2b36'; ctx.fillRect(-r * .22, -r * 1.12, r * .44, r * .32);
  ctx.restore();

  ctx.strokeStyle = '#c8a26a'; ctx.lineWidth = r * .08; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(r * .74, -r * .88); ctx.quadraticCurveTo(r * 1.12, -r * .86, r * 1.02, -r * 1.24); ctx.stroke();

  // 불꽃 (깜빡임)
  const fl = r * (0.18 + Math.random() * 0.12);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  for (let i = 0; i < 10; i++){
    const rr = i % 2 ? fl * .45 : fl, a = i / 10 * TAU;
    ctx.lineTo(r * 1.02 + Math.cos(a) * rr, -r * 1.24 + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff5a00'; ctx.beginPath(); ctx.arc(r * 1.02, -r * 1.24, fl * .3, 0, TAU); ctx.fill();

  // 광택
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath(); ctx.ellipse(-r * .38, -r * .4, r * .22, r * .12, -0.7, 0, TAU); ctx.fill();

  label(`폭탄 ${String(CONFIG.points.bomb).replace('-', '−')}`, r, '#d91f3c', '#fff', '#fff');
}
function label(txt, r, bg, border, ink){
  const fs = Math.round(clamp(r * 0.34, 11, 17));
  ctx.font = `800 ${fs}px ${FONT}`;
  const tw = ctx.measureText(txt).width + fs * 1.2, th = fs * 1.5, y = r - fs * 0.2;
  roundRect(-tw / 2, y, tw, th, th / 2);
  ctx.fillStyle = bg; ctx.fill();
  ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, 0, y + th / 2 + 1);
}
function roundRect(x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawParts(){
  for (const p of parts){
    const t = p.life / p.max;
    if (p.k === 'dot'){
      ctx.globalAlpha = 1 - t; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - t * .5), 0, TAU); ctx.fill();
    } else if (p.k === 'ring'){
      ctx.globalAlpha = 1 - t; ctx.strokeStyle = p.c; ctx.lineWidth = p.w * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, lerp(p.r0, p.r1, t), 0, TAU); ctx.stroke();
    } else {
      ctx.globalAlpha = 1; ctx.fillStyle = p.c + (0.45 * (1 - t)) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + t), 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
function drawTexts(){
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of texts){
    const k = t.life / t.max;
    const s = k < 0.15 ? easeOutBack(k / 0.15) : 1;
    ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    ctx.font = `900 ${Math.round(t.size * s)}px ${FONT}`;
    ctx.lineWidth = Math.max(3, t.size * 0.18); ctx.lineJoin = 'round';
    ctx.strokeStyle = t.stroke; ctx.strokeText(t.txt, t.x, t.y);
    ctx.fillStyle = t.fill; ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

/* ---------------- 11. 입력 (당겼다 놓기) ---------------- */
canvas.addEventListener('pointerdown', e => {
  audioOn();
  if (state !== S.PLAY || aim) return;
  aim = { id:e.pointerId, x0:e.clientX, y0:e.clientY, x:e.clientX, y:e.clientY };
  try { canvas.setPointerCapture(e.pointerId); } catch(err){}
  sfx.stretch();
});
canvas.addEventListener('pointermove', e => {
  if (!aim || e.pointerId !== aim.id) return;
  aim.x = e.clientX; aim.y = e.clientY;
});
function release(e, cancel){
  if (!aim || e.pointerId !== aim.id) return;
  const pv = pullVector();
  aim = null;
  if (!cancel && state === S.PLAY && pv.len >= 14) fireAt(launchState(pv), false);
}
canvas.addEventListener('pointerup', e => release(e, false));
canvas.addEventListener('pointercancel', e => release(e, true));

/* ---------------- 12. 게임 흐름 ---------------- */
function showScreen(sc){
  for (const s of [el.scAttract, el.scCount, el.scResult]) s.classList.toggle('show', s === sc);
}
function resetRound(){
  objs.length = 0; arrows.length = 0; parts.length = 0; texts.length = 0;
  Object.assign(G, {
    score:0, timeLeft:CONFIG.duration, elapsed:0,
    combo:0, bestCombo:0, shots:0, hitShots:0, targetsHit:0, bombsHit:0,
    deck:[], spawnT:0, lastTick:0, code:'', grade:null, leadDone:false
  });
  aim = null;
}

function startCountdown(){
  audioOn();
  resetRound();
  state = S.COUNT;
  G.countT = CONFIG.countdown; G.countShown = 0;
  el.banner.classList.remove('show');
  el.hud.classList.add('show');
  updateHUD(true);
  showScreen(el.scCount);
}
function startPlay(){
  state = S.PLAY;
  el.countNum.textContent = 'GO!';
  el.countNum.classList.remove('bump'); void el.countNum.offsetWidth; el.countNum.classList.add('bump');
  sfx.go();
  setTimeout(() => { if (state === S.PLAY) showScreen(null); }, 450);
  musicStart();
  showNowPlaying();
  el.hint.classList.add('show');
  for (let i = 0; i < 3; i++) spawnObj(0);
}
function endPlay(){
  state = S.END;
  aim = null;
  G.endT = 1.3;
  el.hint.classList.remove('show');
  el.banner.classList.add('show');
  musicStop();
  sfx.end();
}
function showResult(){
  state = S.RESULT;
  el.banner.classList.remove('show');
  el.hud.classList.remove('show');

  const grade = CONFIG.grades.find(g => G.score >= g.min);
  G.grade = grade;
  G.code = 'SHOT-' + Array.from({ length:4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random() * 32 | 0]).join('');

  const prevBest = loadJSON(STORE_BEST, 0);
  const isBest = G.score > prevBest;
  if (isBest) saveJSON(STORE_BEST, G.score);

  el.rGrade.textContent = grade.grade;
  el.rGradeLabel.textContent = grade.label;
  el.rScore.textContent = G.score.toLocaleString();
  el.rBest.className = 'best' + (isBest && G.score > 0 ? ' new' : '');
  el.rBest.innerHTML = isBest && G.score > 0 ? '🏆 이 기기 최고 기록 경신!' : `최고 기록 <b>${prevBest.toLocaleString()}</b>점`;
  el.rHits.textContent = G.targetsHit;
  el.rBombs.textContent = G.bombsHit;
  el.rAcc.textContent = accuracy() + '%';
  el.rCombo.textContent = G.bestCombo;

  el.leadBox.innerHTML = leadMarkup();
  bindLead();
  el.scResult.scrollTop = 0;
  showScreen(el.scResult);
  G.idleAt = sceneT;
  if (G.score >= CONFIG.clearScore) sfx.win();
}
function goAttract(){
  state = S.ATTRACT;
  resetRound();
  el.hud.classList.remove('show');
  el.banner.classList.remove('show');
  renderBest();
  showScreen(el.scAttract);
}
const accuracy = () => G.shots ? Math.round(G.hitShots / G.shots * 100) : 0;

/* ---------------- 13. HUD ---------------- */
const hudCache = {};
function updateHUD(force){
  const t = Math.ceil(G.timeLeft);
  if (force || hudCache.score !== G.score){ hudCache.score = G.score; el.score.textContent = G.score.toLocaleString(); }
  if (force || hudCache.t !== t){
    hudCache.t = t; el.time.textContent = t;
    el.time.parentNode.classList.toggle('low', t <= 5);
    el.timefill.parentNode.classList.toggle('low', t <= 5);
  }
  el.timefill.style.transform = `scaleX(${clamp(G.timeLeft / CONFIG.duration, 0, 1)})`;
  if (force || hudCache.combo !== G.combo){
    const up = G.combo > (hudCache.combo || 0);
    hudCache.combo = G.combo;
    el.combo.classList.toggle('on', G.combo >= 2);
    if (G.combo >= 2){
      el.comboX.textContent = 'x' + G.combo;
      if (up){ el.combo.classList.remove('bump'); void el.combo.offsetWidth; el.combo.classList.add('bump'); }
    }
  }
}

/* ---------------- 14. 이름 · 이메일 응모 ---------------- */
function leadMarkup(){
  return `<p class="lead-title">이름·이메일을 남기고 <b>경품 응모</b>하기 🎁</p>
    <form id="leadForm" autocomplete="off" novalidate>
      <input id="leadName" type="text" placeholder="이름" maxlength="20" enterkeyhint="next">
      <input id="leadEmail" type="email" inputmode="email" placeholder="이메일 주소" enterkeyhint="done"
             maxlength="80" autocapitalize="off" autocorrect="off" spellcheck="false">
      <label class="agree">
        <input type="checkbox" id="leadAgree">
        <span>개인정보 수집·이용에 동의합니다
          <em>이벤트 안내·경품 발송 목적 / 이름·이메일 / 6개월 보관</em></span>
      </label>
      <button type="submit" class="btn primary small">응모하기</button>
    </form>`;
}
function bindLead(){
  const form = $('leadForm'); if (!form) return;
  // 휴대폰 키보드가 제출 버튼을 가리지 않도록 폼을 화면 가운데로
  ['leadName', 'leadEmail'].forEach(id => {
    $(id).addEventListener('focus', () => setTimeout(() => form.scrollIntoView({ block:'center', behavior:'smooth' }), 320));
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name  = $('leadName').value.trim();
    const email = $('leadEmail').value.trim();
    if (!name){ toast('이름을 입력해 주세요'); $('leadName').focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){ toast('이메일 주소를 확인해 주세요'); $('leadEmail').focus(); return; }
    if (!$('leadAgree').checked){ toast('개인정보 수집·이용 동의가 필요해요'); return; }
    if (G.leadDone) return;
    G.leadDone = true;

    const now = new Date();
    const kst = new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Seoul', dateStyle:'short', timeStyle:'medium' })
      .format(now).split(' ');
    const payload = {
      name, email, code:G.code,
      score:G.score, grade:G.grade.grade,
      hits:G.targetsHit, bombs:G.bombsHit, shots:G.shots, accuracy:accuracy(), bestCombo:G.bestCombo,
      cleared: G.score >= CONFIG.clearScore,
      date:kst[0], time:kst[1], agreedAt:now.toISOString(), tries:0
    };
    const leads = loadJSON(STORE_LEADS, []); leads.push(payload); saveJSON(STORE_LEADS, leads.slice(-500));

    // 화면은 즉시 완료 처리 — 전송 결과 때문에 손님을 기다리게 하지 않는다
    el.leadBox.innerHTML =
      `<p class="lead-title">✅ ${esc(name)}님, <b>응모 완료!</b></p>
       <small>응모 코드 <b>${G.code}</b> · ${G.score.toLocaleString()}점</small>
       <p class="send-status" id="sendStatus">📨 응모 접수 중…</p>`;
    sfx.win(); buzz(30);

    postLead(payload).then(r => {
      if (r.ok) setSendStatus('✅ 접수 완료', 'ok');
      else {
        outboxAdd(payload);
        setSendStatus('📨 저장됨 — 연결되면 자동으로 접수돼요', 'warn');
        setTimeout(outboxFlush, 3000);
        setTimeout(outboxFlush, 10000);
      }
    });
  });
}
function setSendStatus(text, kind){
  const n = $('sendStatus'); if (!n) return;
  n.textContent = text; n.className = 'send-status ' + (kind || '');
}

/* ---------------- 15. 웹훅 전송 ---------------- */
const FORM_TYPE = 'application/x-www-form-urlencoded;charset=UTF-8';
function buildBody(p){
  return {
    // coupon-pop · price-slasher 시나리오가 이미 매핑한 필드
    date:p.date, time:p.time, email:p.email, code:p.code,
    score:String(p.score), cleared:String(p.cleared), agreedAt:p.agreedAt,
    source:WEBHOOK.source,
    // ↓ 이 게임 전용 값
    name:p.name, grade:p.grade, hits:String(p.hits), bombs:String(p.bombs),
    shots:String(p.shots), accuracy:String(p.accuracy), bestCombo:String(p.bestCombo)
  };
}
function postLead(p){
  if (!WEBHOOK.url) return Promise.resolve({ ok:false, reason:'no-url' });
  const body = new URLSearchParams(buildBody(p)).toString();
  return fetch(WEBHOOK.url, { method:'POST', headers:{ 'Content-Type':FORM_TYPE }, body, keepalive:true })
    .then(res => ({ ok:res.ok, status:res.status }))
    .catch(() => {
      // 응답을 못 읽었을 뿐 요청은 갔을 수 있다 → sendBeacon 으로 한 번 더 (성공하면 큐에 넣지 않음)
      try {
        const sent = navigator.sendBeacon && navigator.sendBeacon(WEBHOOK.url, new Blob([body], { type:FORM_TYPE }));
        return sent ? { ok:true, via:'beacon' } : { ok:false, reason:'network' };
      } catch(e){ return { ok:false, reason:'network' }; }
    });
}

/* 실패분은 기기에 쌓아두고 연결되면 재시도 */
const outboxLoad = () => loadJSON(STORE_OUTBOX, []);
const outboxSave = a => saveJSON(STORE_OUTBOX, a.slice(-100));
function outboxAdd(p){ const a = outboxLoad(); a.push(p); outboxSave(a); }
let outboxBusy = false;
function outboxFlush(){
  if (outboxBusy || !WEBHOOK.url || navigator.onLine === false) return;
  const queue = outboxLoad();
  if (!queue.length) return;
  outboxBusy = true;
  const rest = [];
  const step = i => {
    if (i >= queue.length){ outboxSave(rest); outboxBusy = false; return; }
    const item = queue[i];
    postLead(item).then(r => {
      if (!r.ok){ item.tries = (item.tries || 0) + 1; if (item.tries < WEBHOOK.maxTries) rest.push(item); }
      step(i + 1);
    });
  };
  step(0);
}
/* 페이지가 닫히거나 백그라운드로 갈 때의 마지막 기회 — sendBeacon 은 브라우저가 끝까지 보내준다 */
function outboxBeacon(){
  if (!WEBHOOK.url || !navigator.sendBeacon) return;
  const queue = outboxLoad();
  if (!queue.length) return;
  const left = [];
  for (const item of queue){
    let sent = false;
    try { sent = navigator.sendBeacon(WEBHOOK.url, new Blob([new URLSearchParams(buildBody(item)).toString()], { type:FORM_TYPE })); } catch(e){}
    if (!sent) left.push(item);
  }
  outboxSave(left);
}
window.addEventListener('pagehide', outboxBeacon);
document.addEventListener('visibilitychange', () => { if (document.hidden) outboxBeacon(); });
setInterval(outboxFlush, WEBHOOK.retrySec * 1000);
window.addEventListener('online', outboxFlush);
outboxFlush();

let toastT = 0;
function toast(msg){
  el.toast.textContent = msg; el.toast.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.toast.classList.remove('on'), 1900);
}

/* ---------------- 16. 대기 화면 ---------------- */
function renderAttract(){
  el.lineup.innerHTML = CONFIG.targets.map((p, i) =>
    `<div class="item" style="animation-delay:${i * 90}ms"><span class="e">${p.emoji}</span>${p.name}</div>`
  ).join('') + `<div class="item bomb" style="animation-delay:${CONFIG.targets.length * 90}ms"><span class="e">💣</span>폭탄</div>`;

  const P = CONFIG.points;
  el.rules.innerHTML = `
    <li><span class="ic">🎯</span><b>타겟 명중</b><em>+${P.target}</em></li>
    <li class="bad"><span class="ic">💣</span><b>폭탄 명중</b><em>−${Math.abs(P.bomb)}</em></li>
    <li><span class="ic">🔥</span><b>연속 명중</b><em>+${P.comboStep}씩 추가</em></li>
    <li><span class="ic">🏹</span><b>한 발 관통</b><em>+${P.pierce} 추가</em></li>`;
  renderBest();
}
function renderBest(){
  const best = loadJSON(STORE_BEST, 0);
  el.bestLine.hidden = !best;
  if (best) el.bestLine.innerHTML = `이 기기 최고 기록 <b>${best.toLocaleString()}</b>점`;
}
renderAttract();

/* 대기 화면 뒤에서 자동으로 한 발씩 쏘는 데모 */
function demoShot(){
  const cands = objs.filter(o => o.type === 'target' && o.scale > 0.8);
  if (!cands.length) return;
  const o = cands[Math.random() * cands.length | 0];
  const dx = o.x - L.sx, dy = L.sy - o.y, adx = Math.abs(dx);
  const v = L.vmax * 0.85, g = L.g;
  const disc = v ** 4 - g * (g * adx * adx + 2 * dy * v * v);
  if (disc < 0 || adx < 1) return;
  const th = Math.atan((v * v - Math.sqrt(disc)) / (g * adx));   // 낮은 탄도
  const nx = Math.sign(dx) * Math.cos(th), ny = -Math.sin(th);
  fireAt({ x:L.sx, y:L.sy, vx:nx * v, vy:ny * v }, true);
}

/* ---------------- 17. 메인 루프 ---------------- */
function update(dt){
  sceneT += dt;
  for (const c of clouds){ c.x += c.v * dt; if (c.x > W + 120) { c.x = -120; c.y = rand(H * 0.08, H * 0.4); } }

  if (state === S.COUNT){
    G.countT -= dt;
    const n = Math.ceil(G.countT);
    if (n > 0 && n !== G.countShown){
      G.countShown = n;
      el.countNum.textContent = n;
      el.countNum.classList.remove('bump'); void el.countNum.offsetWidth; el.countNum.classList.add('bump');
      sfx.tick();
    }
    if (G.countT <= 0) startPlay();
  } else if (state === S.PLAY){
    G.timeLeft -= dt; G.elapsed += dt;
    const sec = Math.ceil(G.timeLeft);
    if (sec <= 5 && sec > 0 && sec !== G.lastTick){ G.lastTick = sec; sfx.tick(); }
    if (G.timeLeft <= 0){ G.timeLeft = 0; endPlay(); }

    const prog = clamp(G.elapsed / CONFIG.duration, 0, 1);
    const maxOn = Math.round(lerp(CONFIG.maxOnScreen[0], CONFIG.maxOnScreen[1], prog));
    G.spawnT -= dt;
    if (state === S.PLAY && G.spawnT <= 0 && objs.length < maxOn){ spawnObj(prog); G.spawnT = CONFIG.spawnGap; }
  } else if (state === S.END){
    G.endT -= dt;
    if (G.endT <= 0) showResult();
  } else if (state === S.ATTRACT){
    G.spawnT -= dt;
    if (G.spawnT <= 0 && objs.length < 5){ spawnObj(0.2); G.spawnT = 0.6; }
    demoT -= dt;
    if (demoT <= 0){ demoShot(); demoT = rand(1.6, 2.6); }
  } else if (state === S.RESULT){
    if (sceneT - G.idleAt > CONFIG.idleReturn) goAttract();
  }

  updateObjs();
  updateArrows(dt);
  updateParts(dt);
  shake *= Math.pow(0.001, dt);
  if (state === S.PLAY || state === S.END || state === S.COUNT) updateHUD(false);
}

let last = performance.now();
function frame(now){
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------------- 18. 버튼 ---------------- */
$('btnStart').addEventListener('click', () => { if (state === S.ATTRACT) startCountdown(); });
$('btnRetry').addEventListener('click', startCountdown);
$('btnHome').addEventListener('click', goAttract);
$('btnSound').addEventListener('click', () => { audioOn(); toggleSound(); });
$('btnFs').addEventListener('click', () => {
  const d = document, r = d.documentElement;
  if (!d.fullscreenElement && !d.webkitFullscreenElement) (r.requestFullscreen || r.webkitRequestFullscreen || (() => {})).call(r);
  else (d.exitFullscreen || d.webkitExitFullscreen || (() => {})).call(d);
});
// 결과 화면에서 무언가 만지고 있으면 대기 복귀 타이머를 미룬다
['pointerdown', 'keydown', 'input'].forEach(ev => document.addEventListener(ev, () => { G.idleAt = sceneT; }, true));
