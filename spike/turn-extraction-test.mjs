// M0 스파이크 — 회전 지점 추출 임계값 검증
//
//   node spike/turn-extraction-test.mjs
//
// 배경: guidance에 좌/우회전 정보가 없고 step 경계도 회전 지점이 아니므로,
//       path.points의 방위각 변화에서 회전을 직접 뽑아야 한다.
// 확인 목적: 임계값을 얼마로 잡아야 하는가 / 튜닝이 얼마나 민감한가

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
if (!KEY) { console.error('REST_KEY 없음. .env 를 만들거나 환경변수로 넘겨라.'); process.exit(1); }

const ROUTES = {
  '강남역→역삼역 (지하 포함)': ['127.027618', '37.497942', '127.036377', '37.500622'],
  '가로수길 일대 (지상)':      ['127.021900', '37.520500', '127.026500', '37.516800'],
  '북촌 골목 (좁은 길)':        ['126.985200', '37.582500', '126.983000', '37.579000'],
};

// 좌표는 모두 [lng, lat] 순서 (카카오 응답 그대로)
const bearing = ([x1, y1], [x2, y2]) => {
  const φ1 = y1 * Math.PI / 180, φ2 = y2 * Math.PI / 180, Δλ = (x2 - x1) * Math.PI / 180;
  return (Math.atan2(Math.sin(Δλ) * Math.cos(φ2),
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)) * 180 / Math.PI + 360) % 360;
};
const dist = ([x1, y1], [x2, y2]) => {
  const R = 6371000, φ1 = y1 * Math.PI / 180, φ2 = y2 * Math.PI / 180;
  const Δφ = φ2 - φ1, Δλ = (x2 - x1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const norm = d => ((d + 540) % 360) - 180;

for (const [name, [sx, sy, ex, ey]] of Object.entries(ROUTES)) {
  const p = new URLSearchParams({
    start_x: sx, start_y: sy, end_x: ex, end_y: ey,
    input_coord: 'WGS84', output_coord: 'WGS84', route_mode: 'BROAD_FIRST',
  });
  const r = await fetch(`https://dapi.kakao.com/v2/routing/walk?${p}`,
    { headers: { Authorization: `KakaoAK ${KEY}` } });
  if (!r.ok) { console.log(`\n### ${name}\n  HTTP ${r.status}`); continue; }
  const b = await r.json();

  // step 경계는 회전과 무관하므로 모든 points를 하나로 이어붙인다 (중복점 제거)
  const pts = [];
  for (const leg of b.route.legs) for (const s of leg.steps)
    for (const pt of (s.path?.points ?? []))
      if (!pts.length || dist(pts[pts.length - 1], pt) > 0.5) pts.push(pt);

  const segs = [];
  for (let i = 0; i < pts.length - 1; i++)
    segs.push({ d: dist(pts[i], pts[i + 1]), b: bearing(pts[i], pts[i + 1]) });
  const spacing = segs.map(s => s.d).sort((a, b) => a - b);

  console.log(`\n### ${name}`);
  console.log(`  총 ${b.route.properties.totalDistance}m / step ${b.route.legs.flatMap(l => l.steps).length}개 / point ${pts.length}개`);
  console.log(`  점 간격: 최소 ${spacing[0].toFixed(0)}m / 중앙 ${spacing[spacing.length >> 1].toFixed(0)}m / 최대 ${spacing[spacing.length - 1].toFixed(0)}m`);

  for (const th of [20, 30, 45, 60]) {
    const turns = [];
    for (let i = 1; i < segs.length; i++) {
      const Δ = norm(segs[i].b - segs[i - 1].b);
      if (Math.abs(Δ) >= th) turns.push(`${Δ > 0 ? '우' : '좌'}${Math.abs(Δ).toFixed(0)}°`);
    }
    console.log(`  임계 ${String(th).padStart(2)}° → 회전 ${String(turns.length).padStart(2)}개  ${turns.join(' ')}`);
  }
}
