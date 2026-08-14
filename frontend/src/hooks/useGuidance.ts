/**
 * 경로와 현재 위치로부터 안내 상태를 계산한다.
 *
 * 화면 코드가 계산에 관여하지 않도록 분리했다. 주행 화면과 지도 화면이 같은 값을 쓴다.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bearing,
  distanceMeters,
  extractTurns,
  nearestIndex,
  normalizeDegrees,
  projectOnRoute,
  type Point,
  type Turn,
} from '../lib/geo';
import { resolveInstruction, type Instruction } from '../lib/guidance';
import type { Route } from '../lib/route';

/** 목표 지점을 지났다고 볼 반경(m) */
const WAYPOINT_RADIUS_M = 8;

export interface Guidance {
  turns: Turn[];
  /** 목표 방위각 */
  target: number | null;
  /** 목표 방위각 − 진행 방향 (−180~180) */
  delta: number | null;
  instruction: Instruction | null;
  upcoming: Turn | null;
  distanceToTurn: number | null;
  /** 도착지까지 남은 직선 거리(m) */
  remaining: number | null;
  /** 현재 위치를 경로 위로 투영한 좌표. 로드뷰가 이 값을 쓴다 */
  snapped: Point | null;
  /** 경로에서 벗어난 거리(m) */
  offRouteM: number | null;
}

export function useGuidance(
  route: Route | null,
  position: Point | null,
  heading: number | null,
): Guidance {
  const turns = useMemo(() => (route ? extractTurns(route.points) : []), [route]);

  /**
   * 지금 향해 가고 있는 경로 점의 인덱스.
   *
   * "가장 가까운 점의 다음"으로 잡으면 구간 중간을 지나는 순간 목표가 한 구간 통째로
   * 건너뛰어, 모퉁이에 닿기도 전에 회전 안내가 뜬다. 목표에 충분히 접근했을 때만 넘긴다.
   */
  const [targetIndex, setTargetIndex] = useState(1);
  const routeRef = useRef<Route | null>(null);

  useEffect(() => {
    if (!route || !position) return;

    if (routeRef.current !== route) {
      routeRef.current = route;
      setTargetIndex(Math.min(nearestIndex(route.points, position) + 1, route.points.length - 1));
      return;
    }

    setTargetIndex((current) => {
      let next = current;
      while (
        next < route.points.length - 1 &&
        distanceMeters(position, route.points[next]) < WAYPOINT_RADIUS_M
      ) {
        next++;
      }
      return next;
    });
  }, [route, position]);

  const core = useMemo(() => {
    if (!route || !position) {
      return {
        target: null,
        delta: null,
        upcoming: null,
        distanceToTurn: null,
        remaining: null,
        snapped: null,
        offRouteM: null,
      };
    }
    const target = bearing(position, route.points[targetIndex]);
    const delta = heading === null ? null : normalizeDegrees(target - heading);
    const upcoming = turns.find((t) => t.index >= targetIndex) ?? null;
    const projection = projectOnRoute(route.points, position);

    return {
      target,
      delta,
      upcoming,
      distanceToTurn: upcoming ? Math.round(distanceMeters(position, upcoming.point)) : null,
      remaining: Math.round(distanceMeters(position, route.points[route.points.length - 1])),
      snapped: projection?.point ?? null,
      offRouteM: projection ? Math.round(projection.offRouteM) : null,
    };
  }, [route, position, heading, turns, targetIndex]);

  // 안내 문구는 히스테리시스를 거쳐 결정한다. 직전 값이 입력에 포함되므로 ref 로 들고 있는다.
  const previousInstruction = useRef<Instruction | null>(null);
  const instruction = useMemo(() => {
    if (core.delta === null) return null;
    const next = resolveInstruction(core.delta, previousInstruction.current);
    previousInstruction.current = next;
    return next;
  }, [core.delta]);

  return { turns, instruction, ...core };
}
