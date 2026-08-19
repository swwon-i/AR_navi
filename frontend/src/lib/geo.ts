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

export interface RouteProjection {
  /** 경로 위로 투영된 좌표 */
  point: Point;
  /** 투영된 지점이 속한 구간의 시작 인덱스 */
  index: number;
  /** 실제 위치에서 경로까지의 거리(m). 경로 이탈 판정에 쓴다 */
  offRouteM: number;
}

/**
 * 현재 위치를 경로 폴리라인 위로 투영한다.
 *
 * 로드뷰는 GPS 원본이 아니라 이 값을 쓴다. 도심 GPS는 ±10~20m 튀는데, 원본으로
 * 파노라마를 찾으면 내가 걷는 길이 아니라 평행한 옆 골목이나 건물 뒤편 파노라마가
 * 잡힌다. 그러면 "여기서 보여야 할 풍경"이 다른 길 풍경이 되어 오히려 헷갈린다.
 *
 * 꼭짓점이 아니라 구간 위의 임의 지점으로 투영한다. 경로 점 간격이 28~50m라
 * 꼭짓점만 쓰면 구간 중간에서 20m 이상 어긋난다.
 */
export function projectOnRoute(points: Point[], position: Point): RouteProjection | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    return { point: points[0], index: 0, offRouteM: distanceMeters(points[0], position) };
  }

  // 위경도를 미터 평면으로 근사한다. 수백 m 범위에서는 오차가 무시할 수준이다.
  const mPerLon = 111_320 * Math.cos(toRad(position[1]));
  const mPerLat = 110_540;
  const toXY = ([lng, lat]: Point): [number, number] => [lng * mPerLon, lat * mPerLat];

  const p = toXY(position);
  let best: RouteProjection | null = null;

  for (let i = 0; i < points.length - 1; i++) {
    const a = toXY(points[i]);
    const b = toXY(points[i + 1]);
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lengthSq = abx * abx + aby * aby;

    // 구간 위에서의 위치 비율. 0~1로 잘라 구간 밖으로 벗어나지 않게 한다.
    const t =
      lengthSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / lengthSq));

    const projected: Point = [
      points[i][0] + (points[i + 1][0] - points[i][0]) * t,
      points[i][1] + (points[i + 1][1] - points[i][1]) * t,
    ];
    const offRouteM = distanceMeters(projected, position);

    if (!best || offRouteM < best.offRouteM) {
      best = { point: projected, index: i, offRouteM };
    }
  }

  return best;
}

/**
 * 시작점부터 각 점까지의 누적 거리(m). `cumulative[i]` = `points[0]`~`points[i]`.
 *
 * 진행률은 위치가 갱신될 때마다 다시 구해야 하는데, 매번 경로 전체를 더하면
 * 낭비다. 경로는 한 번 정해지면 바뀌지 않으므로 이 배열을 한 번만 만들어 둔다.
 */
export function cumulativeDistances(points: Point[]): number[] {
  const out = new Array<number>(points.length);
  out[0] = 0;
  for (let i = 1; i < points.length; i++) {
    out[i] = out[i - 1] + distanceMeters(points[i - 1], points[i]);
  }
  return out;
}

export interface RouteProgress {
  /** 경로를 따라 걸어온 거리(m) */
  traveledM: number;
  /** 경로 전체 길이(m) */
  totalM: number;
  /** 경로를 따라 남은 거리(m). 직선거리와 달리 실제로 걸어야 할 거리다 */
  remainingM: number;
  /** 0~1 */
  ratio: number;
}

/**
 * 경로 위 진행 상황.
 *
 * 도착지까지의 직선거리는 경로가 꺾이면 실제 걸을 거리와 크게 어긋난다. 여기서는
 * 투영점까지의 경로 길이를 재므로 "얼마나 왔나"가 실제 보행 거리로 나온다.
 *
 * 경로를 벗어나도 투영점 기준이라 값이 유지된다 (이탈 자체는 offRouteM 이 알린다).
 *
 * @param totalOverrideM 표시에 쓸 총거리. 폴리라인을 더한 값은 카카오가 준 공식
 *   총거리보다 조금 짧게 나온다(같은 경로를 374m / 339m 로 재는 식). 두 화면이
 *   다른 숫자를 보이면 안 되므로, 위치는 폴리라인으로 재되 거리는 공식 값으로
 *   환산해 내보낸다.
 */
export function routeProgress(
  points: Point[],
  cumulative: number[],
  projection: RouteProjection,
  totalOverrideM?: number,
): RouteProgress | null {
  if (points.length < 2) return null;

  const polylineM = cumulative[cumulative.length - 1];
  // 구간 시작점까지의 누적 + 그 구간 안에서 투영점까지의 거리
  const walkedOnPolyline = Math.min(
    polylineM,
    cumulative[projection.index] + distanceMeters(points[projection.index], projection.point),
  );
  const ratio = polylineM === 0 ? 0 : walkedOnPolyline / polylineM;

  const totalM = totalOverrideM ?? polylineM;
  const traveledM = totalM * ratio;

  return {
    traveledM,
    totalM,
    remainingM: Math.max(0, totalM - traveledM),
    ratio,
  };
}

/**
 * 지나온 구간의 좌표열. 경로 시작부터 투영된 현재 위치까지다.
 *
 * 진행률을 경로 위에 색으로 보여줄 때 쓴다. 경로 점 개수를 비율로 자르면 안 되는데,
 * 점 간격이 28~50m 로 고르지 않아 "절반쯤 왔다"와 "점의 절반을 지났다"가 다르기
 * 때문이다. 투영 결과의 구간 인덱스를 쓰면 그 문제가 없다.
 */
export function traveledPath(points: Point[], index: number, snapped: Point): Point[] {
  return [...points.slice(0, index + 1), snapped];
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
