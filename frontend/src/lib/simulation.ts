/**
 * 보행 시뮬레이션.
 *
 * 실외에 나가지 않고 경로를 따라 걷는 상황을 재현한다. GPS/방위각 로직을 고칠 때마다
 * 폰을 들고 나가지 않아도 되도록, 개발 초기부터 넣어둔다.
 *
 * 주의: 이건 어디까지나 이상적인 값이다. 실제 나침반 오차·GPS 튐·발열은 재현되지 않으므로
 * M2의 필터 품질은 반드시 실기기 야외 테스트로 확인해야 한다 (스펙 4장).
 */

import { distanceMeters, type Point } from './geo';

export interface SimulatedFix {
  point: Point;
  /** 시뮬레이터가 알고 있는 진행 방향. 실제 GPS의 coords.heading에 대응한다. */
  heading: number;
  /** 경로 시작점부터의 누적 이동 거리(m) */
  traveled: number;
}

export interface SimulationOptions {
  /** 보행 속도(m/s). 성인 평균 보행이 대략 1.3 */
  speedMps?: number;
  /** 위치 갱신 주기(ms) */
  intervalMs?: number;
  /** 좌표에 섞을 GPS 오차 반경(m). 0이면 완벽한 좌표 */
  jitterM?: number;
}

/**
 * 폴리라인 위를 일정 속도로 이동하는 위치 소스를 만든다.
 *
 * 경로 점들은 간격이 28~50m로 듬성듬성하므로(M0 실측), 점 사이를 선형 보간해
 * 실제 보행처럼 연속적인 좌표를 만들어낸다.
 */
export function createWalkSimulation(points: Point[], options: SimulationOptions = {}) {
  const { speedMps = 1.3, intervalMs = 500, jitterM = 0 } = options;

  // 각 구간의 누적 거리 테이블. 진행 거리 → 좌표 변환에 쓴다.
  const cumulative: number[] = [0];
  for (let i = 0; i < points.length - 1; i++) {
    cumulative.push(cumulative[i] + distanceMeters(points[i], points[i + 1]));
  }
  const totalDistance = cumulative[cumulative.length - 1];

  let traveled = 0;
  let timer: number | null = null;

  /** 누적 거리 위치를 실제 좌표로 변환한다. */
  function pointAt(distance: number): { point: Point; heading: number } {
    const clamped = Math.max(0, Math.min(distance, totalDistance));

    let segment = 0;
    while (segment < cumulative.length - 2 && cumulative[segment + 1] < clamped) segment++;

    const segmentStart = cumulative[segment];
    const segmentLength = cumulative[segment + 1] - segmentStart;
    const ratio = segmentLength > 0 ? (clamped - segmentStart) / segmentLength : 0;

    const [x1, y1] = points[segment];
    const [x2, y2] = points[segment + 1];
    const point: Point = [x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio];

    // 진행 방향은 현재 구간의 방향
    const heading =
      (Math.atan2(
        Math.sin(((x2 - x1) * Math.PI) / 180) * Math.cos((y2 * Math.PI) / 180),
        Math.cos((y1 * Math.PI) / 180) * Math.sin((y2 * Math.PI) / 180) -
          Math.sin((y1 * Math.PI) / 180) *
            Math.cos((y2 * Math.PI) / 180) *
            Math.cos(((x2 - x1) * Math.PI) / 180),
      ) *
        180) /
        Math.PI;

    return { point: applyJitter(point), heading: (heading + 360) % 360 };
  }

  function applyJitter(point: Point): Point {
    if (jitterM <= 0) return point;
    // 위도 1도 ≈ 111km, 경도는 위도에 따라 축소된다
    const latOffset = ((Math.random() - 0.5) * 2 * jitterM) / 111_000;
    const lonOffset =
      ((Math.random() - 0.5) * 2 * jitterM) /
      (111_000 * Math.cos((point[1] * Math.PI) / 180));
    return [point[0] + lonOffset, point[1] + latOffset];
  }

  return {
    totalDistance,

    /** 위치 갱신 구독. 실제 watchPosition과 같은 모양으로 쓴다. */
    start(onFix: (fix: SimulatedFix) => void) {
      if (timer !== null) return;
      const step = speedMps * (intervalMs / 1000);

      timer = window.setInterval(() => {
        const { point, heading } = pointAt(traveled);
        onFix({ point, heading, traveled });

        if (traveled >= totalDistance) {
          this.stop();
          return;
        }
        traveled = Math.min(traveled + step, totalDistance);
      }, intervalMs);
    },

    stop() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    },

    /** 특정 지점으로 건너뛴다. 회전 지점 동작을 반복 확인할 때 쓴다. */
    seek(distance: number) {
      traveled = Math.max(0, Math.min(distance, totalDistance));
    },

    reset() {
      traveled = 0;
    },

    get progress() {
      return totalDistance > 0 ? traveled / totalDistance : 0;
    },
  };
}

export type WalkSimulation = ReturnType<typeof createWalkSimulation>;

/** URL에 ?sim=1 이 있으면 시뮬레이션 모드. */
export function isSimulationMode(): boolean {
  return new URLSearchParams(window.location.search).get('sim') === '1';
}
