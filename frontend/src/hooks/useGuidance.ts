/**
 * 경로와 현재 위치로부터 안내 상태를 계산한다.
 *
 * 화면 코드가 계산에 관여하지 않도록 분리했다. 주행 화면과 지도 화면이 같은 값을 쓴다.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bearing,
  cumulativeDistances,
  distanceAlongRoute,
  distanceMeters,
  extractTurns,
  interpolateAlongRoute,
  nearestIndex,
  normalizeDegrees,
  projectOnRoute,
  routeProgress,
  type Point,
  type RouteProgress,
  type Turn,
} from '../lib/geo';
import { resolveInstruction, type Instruction } from '../lib/guidance';
import type { Route } from '../lib/route';

/** 목표 지점을 지났다고 볼 반경(m) */
const WAYPOINT_RADIUS_M = 8;

/**
 * 로드뷰를 현재 위치보다 이만큼 앞에서 보여준다.
 *
 * 걷는 중에는 "지금 서 있는 자리"보다 "곧 보게 될 풍경"이 쓸모 있다. 지금 자리를
 * 띄우면 이미 눈으로 본 장면을 다시 보는 셈이라, 대조할 것이 없다.
 *
 * 보행 1.3m/s 기준 약 12초 앞이다. 더 멀리 잡으면 화면과 실제 풍경의 간극이 커져
 * 대조가 어렵고, 짧으면 앞당긴 효과가 없다.
 */
const ROADVIEW_LOOKAHEAD_M = 15;

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
  /** 경로를 따라 잰 진행 상황. 화면에 보여줄 "얼마나 왔나"는 이 값이다 */
  progress: RouteProgress | null;
  /** 현재 위치를 경로 위로 투영한 좌표. 로드뷰가 이 값을 쓴다 */
  snapped: Point | null;
  /** 투영된 지점이 속한 구간의 시작 인덱스. 지나온 구간을 그릴 때 쓴다 */
  snappedIndex: number | null;
  /** 경로를 따라 조금 앞선 좌표. 로드뷰가 이 지점의 풍경을 보여준다 */
  lookahead: Point | null;
  /** 경로에서 벗어난 거리(m) */
  offRouteM: number | null;
}

export function useGuidance(
  route: Route | null,
  position: Point | null,
  heading: number | null,
): Guidance {
  const turns = useMemo(() => (route ? extractTurns(route.points) : []), [route]);

  // 경로가 바뀔 때만 만든다. 진행률을 매 좌표마다 처음부터 더하지 않기 위한 것이다.
  const cumulative = useMemo(
    () => (route ? cumulativeDistances(route.points) : null),
    [route],
  );

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
        progress: null,
        snapped: null,
        snappedIndex: null,
        lookahead: null,
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
      progress:
        projection && cumulative
          ? routeProgress(route.points, cumulative, projection, route.totalDistance)
          : null,
      snapped: projection?.point ?? null,
      snappedIndex: projection?.index ?? null,
      lookahead:
        projection && cumulative
          ? interpolateAlongRoute(
              route.points,
              cumulative,
              distanceAlongRoute(route.points, cumulative, projection) + ROADVIEW_LOOKAHEAD_M,
            )
          : null,
      offRouteM: projection ? Math.round(projection.offRouteM) : null,
    };
  }, [route, position, heading, turns, targetIndex, cumulative]);

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
