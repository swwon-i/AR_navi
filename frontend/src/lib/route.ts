/**
 * 경로 조회 API 클라이언트.
 *
 * REST 키는 백엔드가 들고 있으므로 프론트는 /api/route 만 호출한다.
 * dev에서는 Vite 프록시가 :8081(Spring)로 넘긴다.
 */

import type { Point } from './geo';

export interface RouteStep {
  distance: number;
  time: number;
  /** 랜드마크 기반 서술. 좌/우회전 정보는 없다 (M0 실측) */
  guidance: string;
  /** points 배열에서 이 구간이 시작되는 인덱스 */
  startIndex: number;
}

export interface Route {
  totalDistance: number;
  totalTime: number;
  points: Point[];
  steps: RouteStep[];
}

export async function fetchRoute(start: Point, end: Point): Promise<Route> {
  const params = new URLSearchParams({
    startX: String(start[0]),
    startY: String(start[1]),
    endX: String(end[0]),
    endY: String(end[1]),
  });

  const response = await fetch(`/api/route?${params}`);
  if (!response.ok) {
    throw new Error(`경로 조회 실패 (HTTP ${response.status}). 백엔드가 :8081에 떠 있는지 확인해라.`);
  }
  return response.json();
}
