/**
 * 좌표·방위각 계산. 전부 순수 함수이며 서버를 거치지 않는다 (스펙 2-2).
 *
 * 좌표는 카카오 응답 순서를 그대로 유지한다: [경도(lng), 위도(lat)]
 */

export type Point = [number, number];

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** 두 점 사이 거리(m). Haversine. */
export function distanceMeters([x1, y1]: Point, [x2, y2]: Point): number {
  const lat1 = toRad(y1);
  const lat2 = toRad(y2);
  const dLat = lat2 - lat1;
  const dLon = toRad(x2 - x1);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** a에서 b를 향하는 방위각(0~360, 정북 기준 시계방향). */
export function bearing([x1, y1]: Point, [x2, y2]: Point): number {
  const lat1 = toRad(y1);
  const lat2 = toRad(y2);
  const dLon = toRad(x2 - x1);
  const theta = Math.atan2(
    Math.sin(dLon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon),
  );
  return (toDeg(theta) + 360) % 360;
}

/** 각도 차이를 −180~180으로 정규화. 좌회전이 음수, 우회전이 양수. */
export function normalizeDegrees(delta: number): number {
  return ((delta + 540) % 360) - 180;
}

export interface Turn {
  /** points 배열에서 회전이 일어나는 지점의 인덱스 */
  index: number;
  point: Point;
  /** 진입 대비 진출 방위각 차이 (−180~180). 음수 = 좌회전 */
  delta: number;
  direction: 'left' | 'right';
  /** 경로 시작점부터 이 회전까지의 누적 거리(m) */
  distanceFromStart: number;
}

/**
 * 폴리라인에서 회전 지점을 뽑는다.
 *
 * step 경계는 회전 지점이 아니다. 895m 경로가 step 4개로만 나뉘고 한 step 내부에서
 * 방위각이 339°→165°로 뒤집히는 사례를 M0에서 확인했다 (스펙 5장).
 *
 * 임계값 30°는 실측 근거가 있다. 방위각 변화가 사실상 이분법(직진 ≈0°, 회전 ≈90°)이라
 * 20°~60° 어디를 잡아도 결과가 거의 같았다. 즉 이 값은 민감하지 않다.
 */
export function extractTurns(points: Point[], thresholdDeg = 30): Turn[] {
  if (points.length < 3) return [];

  const segments: { bearing: number; distance: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      bearing: bearing(points[i], points[i + 1]),
      distance: distanceMeters(points[i], points[i + 1]),
    });
  }

  const turns: Turn[] = [];
  let cumulative = segments[0].distance;

  for (let i = 1; i < segments.length; i++) {
    const delta = normalizeDegrees(segments[i].bearing - segments[i - 1].bearing);
    if (Math.abs(delta) >= thresholdDeg) {
      turns.push({
        index: i,
        point: points[i],
        delta,
        direction: delta > 0 ? 'right' : 'left',
        distanceFromStart: cumulative,
      });
    }
    cumulative += segments[i].distance;
  }

  return turns;
}

/**
 * 최근 이동 궤적에서 진행 방향을 계산한다.
 *
 * 도심에서는 자기장 간섭으로 나침반이 ±30~50° 틀어지므로, 이동 중에는 이 값을 쓰고
 * 정지 상태에서만 DeviceOrientationEvent로 폴백한다 (스펙 2-2).
 *
 * @param trail 최근 좌표들 (오래된 것 → 최신 순)
 * @param minDistanceM 이 거리 미만으로 움직였으면 정지로 보고 null을 반환
 */
export function headingFromTrail(trail: Point[], minDistanceM = 3): number | null {
  if (trail.length < 2) return null;

  const latest = trail[trail.length - 1];
  // 뒤에서부터 훑어 충분히 떨어진 점을 찾는다. GPS 지터에 방위각이 요동치는 것을 막는다.
  for (let i = trail.length - 2; i >= 0; i--) {
    if (distanceMeters(trail[i], latest) >= minDistanceM) {
      return bearing(trail[i], latest);
    }
  }
  return null;
}

/**
 * 각도 저역통과 필터. 0°/360° 경계를 넘을 때 값이 튀지 않도록 각도차 기준으로 보간한다.
 * 미적용 시 화살표가 떨리고 안내 문구가 초당 몇 번씩 바뀐다 (스펙 2-2).
 */
export function smoothAngle(previous: number | null, next: number, alpha = 0.2): number {
  if (previous === null) return next;
  return (previous + alpha * normalizeDegrees(next - previous) + 360) % 360;
}

/** 경로에서 현재 위치와 가장 가까운 점의 인덱스. */
export function nearestIndex(points: Point[], current: Point): number {
  let best = 0;
  let bestDistance = Infinity;
  points.forEach((p, i) => {
    const d = distanceMeters(p, current);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best;
}
