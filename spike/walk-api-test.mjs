// M0 스파이크 — 카카오 도보 경로 조회 API 실물 확인
//
//   REST_KEY=xxxx node spike/walk-api-test.mjs
//
// 확인 목적:
//   1. REST 키만으로 호출되는가 (제휴 불필요 확인)
//   2. guidance 문자열에 좌/우회전이 명시되는가  ← 스펙 2-1의 미확정 항목
//   3. step 경계가 회전 지점과 실제로 일치하는가

// 저장소 루트의 .env(gitignore 대상)에서 읽거나, 환경변수로 직접 넘겨도 된다.
import { readFileSync } from 'node:fs';

function loadKey() {
  if (process.env.REST_KEY) return process.env.REST_KEY;
  try {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const m = env.match(/^\s*REST_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* .env 없음 */ }
  return null;
}

const KEY = loadKey();
if (!KEY) {
  console.error('REST_KEY 없음. 저장소 루트에 .env 파일을 만들고 REST_KEY=... 를 넣거나,');
  console.error('REST_KEY=xxxx node spike/walk-api-test.mjs 로 실행해라.');
  console.error('키 위치: 카카오디벨로퍼스 > 앱 > 앱 키 > REST API 키 (JS 키와 다른 키)');
  process.exit(1);
}

// 강남역 → 역삼역 (회전이 섞인 짧은 도보 경로)
const params = new URLSearchParams({
  start_x: '127.027618', start_y: '37.497942',
  end_x:   '127.036377', end_y:   '37.500622',
  input_coord: 'WGS84', output_coord: 'WGS84',
  route_mode: 'BROAD_FIRST',
});

const res = await fetch(`https://dapi.kakao.com/v2/routing/walk?${params}`, {
  headers: { Authorization: `KakaoAK ${KEY}` },
});

console.log(`HTTP ${res.status}`);
const body = await res.json();
if (!res.ok) { console.error(JSON.stringify(body, null, 2)); process.exit(1); }

const { properties: rp, legs } = body.route;
console.log(`총 ${rp.totalDistance}m / ${rp.totalTime}초 / legs ${legs.length}개\n`);

// ── 핵심: guidance 문자열을 있는 그대로 나열
const bearing = (a, b) => {
  const [x1, y1] = a, [x2, y2] = b;
  const φ1 = y1 * Math.PI / 180, φ2 = y2 * Math.PI / 180;
  const Δλ = (x2 - x1) * Math.PI / 180;
  const θ = Math.atan2(Math.sin(Δλ) * Math.cos(φ2),
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ));
  return (θ * 180 / Math.PI + 360) % 360;
};

legs.forEach((leg, li) => {
  console.log(`── leg ${li} (${leg.properties.distance}m)`);
  leg.steps.forEach((s, si) => {
    const p = s.properties, pts = s.path?.points ?? [];
    // step 진입/진출 방위각 → guidance 텍스트와 실제 회전각이 맞는지 대조
    const inB  = pts.length > 1 ? bearing(pts[0], pts[1]) : null;
    const outB = pts.length > 1 ? bearing(pts[pts.length - 2], pts[pts.length - 1]) : null;
    console.log(
      `  [${si}] ${String(p.distance).padStart(5)}m  ` +
      `guidance="${p.guidance}"  ` +
      `pts=${pts.length}  ` +
      (inB !== null ? `bearing ${inB.toFixed(0)}°→${outB.toFixed(0)}°` : '')
    );
  });
});

console.log('\n── 원본 첫 step 전체 ──');
console.log(JSON.stringify(legs[0].steps[0], null, 2).slice(0, 800));
