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

/**
 * 방향 표시를 로드뷰 위치보다 이만큼 더 앞에 놓는다.
 *
 * 파노라마가 서 있는 자리에 표시를 두면 발밑이라 보이지 않는다. 충분히 앞에 둬야
 * 풍경 속 한 지점으로 보이고 "저기로 가라"가 성립한다.
 */
const MARKER_AHEAD_M = 25;

/**
 * 다음 회전이 이 거리 안이면 표시를 회전 지점에 놓는다.
 *
 * 일정 거리 앞에 기계적으로 두면 회전 직전에 표시가 코너를 지나쳐 엉뚱한 방향을
 * 가리킨다. 회전이 가까울 때는 "여기서 꺾어라"를 그대로 보여주는 편이 맞다.
 */
const MARKER_TURN_RANGE_M = 40;

/**
 * 경로 잔여가 이 거리 안이면 "곧 도착" 단계.
 *
 * "갑자기 끝"을 없애는 것이 목적이라 예고가 필요하다. 이 단계부터는 로드뷰 표시도
 * 경로 위 이정표가 아니라 목적지 자체를 짚는다.
 */
const ARRIVAL_NEAR_M = 60;

/**
 * 경로 잔여가 이 거리 안이면 도착으로 본다. 걷는 속도로 7초, 건물 바로 앞이다.
 *
 * 처음에는 목적지와의 직선거리 20m 로 판정했는데 두 가지가 어긋났다. 길이 휘면 아직
 * 걸을 길이 남았는데도 도착으로 잡혔고(경로 281m 중 234m 지점에서 완료 화면),
 * 20m 는 로드뷰에서 건물이 저 멀리 보이는 거리라 "도착"이 오히려 헷갈렸다.
 *
 * 경로 잔여를 쓰면 도심 GPS 오차(±10~20m) 걱정도 줄어든다. projectOnRoute 가 위치를
 * 경로 위로 투영하므로 옆 방향 오차는 제거되고 길 방향 오차만 남는다.
 */
const ARRIVAL_REMAINING_M = 10;

/**
 * 경로를 벗어난 상태에서 목적지가 이 거리 안이면 도착으로 본다.
 *
 * 질러가면 경로 잔여는 남아 있는데 이미 목적지 앞일 수 있다. 다만 단독 조건으로
 * 쓰면 위의 문제가 그대로 재발하므로, 경로에서 실제로 벗어났을 때만 인정한다.
 */
const ARRIVAL_SHORTCUT_M = 15;

/** 이만큼 벗어나야 "경로를 벗어났다"고 본다. GPS 오차보다 충분히 커야 한다 */
const OFF_ROUTE_M = 25;

/** 경로 잔여가 이 안으로 들어오면 "도착했어요" 수동 버튼을 띄운다 */
const MANUAL_ARRIVAL_M = 30;

/**
 * 경로 잔여가 이 안으로 들어와야 로드뷰 표시를 목적지로 옮긴다.
 *
 * "곧 도착"(60m)과 일부러 분리한 값이다. 처음엔 둘을 묶어놨는데, 60m 는 마커에
 * 너무 멀어 엉뚱한 건물을 짚는 일이 생겼다. 로드뷰 오버레이는 가림 처리가 없어서
 * 목적지가 앞 건물에 가려 있어도 그 위에 그대로 그려지기 때문이다. 멀수록 사이에
 * 건물이 낄 확률이 높다.
 *
 * 이 거리 전까지는 경로 위 이정표가 계속 길을 안내하므로 비는 구간은 없다.
 */
const DESTINATION_MARKER_M = 35;

/** 로드뷰 표시가 무엇을 가리키는지. 로드뷰가 글자와 고도를 달리한다 */
export type MarkerKind = 'waypoint' | 'destination';

/** 목적지까지의 거리로 나눈 단계 */
export type ArrivalPhase = 'far' | 'near' | 'arrived';

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
  /** 로드뷰 풍경 위에 표시를 박을 좌표 */
  marker: Point | null;
  /** 그 표시가 길 안내 이정표인지 목적지인지 */
  markerKind: MarkerKind;
  /** 목적지까지 남은 직선 거리(m). 참고용이고, 판정의 주 기준은 경로 잔여다 */
  toDestination: number | null;
  /** 도착 단계 */
  arrival: ArrivalPhase;
  /** 경로 끝에 다다랐는지. 자동 판정이 안 걸릴 때를 대비한 수동 버튼을 띄운다 */
  canFinishManually: boolean;
  /** 경로에서 벗어난 거리(m) */
  offRouteM: number | null;
}

export function useGuidance(
  route: Route | null,
  position: Point | null,
  heading: number | null,
  /**
   * 목적지 좌표. 경로 마지막 점이 아니라 사용자가 고른 장소의 좌표다.
   *
   * 도보 경로는 보행 가능한 가장 가까운 지점에서 끝나므로 목적지와 몇 미터
   * 어긋난다. 도착은 "그 자리에 서 있는 것"이라 목적지 기준으로 재야 맞다.
   */
  destination: Point | null,
  /** 사용자가 "재안내"로 도착 판정을 무시한 상태. 다시 멀어질 때까지 판정하지 않는다 */
  arrivalSuppressed = false,
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
        marker: null,
        markerKind: 'waypoint' as MarkerKind,
        toDestination: null,
        arrival: 'far' as ArrivalPhase,
        canFinishManually: false,
        offRouteM: null,
      };
    }
    const target = bearing(position, route.points[targetIndex]);
    const delta = heading === null ? null : normalizeDegrees(target - heading);
    const upcoming = turns.find((t) => t.index >= targetIndex) ?? null;
    const projection = projectOnRoute(route.points, position);

    const walked =
      projection && cumulative ? distanceAlongRoute(route.points, cumulative, projection) : null;

    const progress =
      projection && cumulative
        ? routeProgress(route.points, cumulative, projection, route.totalDistance)
        : null;

    /*
     * 도착 단계.
     *
     * 주 기준은 경로 잔여 거리다. 직선거리는 경로를 실제로 벗어났을 때만 보조로 쓴다
     * (상수 설명 참고).
     *
     * "재안내"로 무시한 동안에는 도착으로 올리지 않는다. 그러지 않으면 돌아오자마자
     * 같은 자리에서 다시 완료로 튕긴다. 억제를 푸는 것은 호출자 몫인데,
     * 'far'(목적지에서 충분히 멀어진 상태)가 그 신호가 된다.
     */
    const toDestination = destination === null ? null : distanceMeters(position, destination);
    const remainingOnRoute = progress?.remainingM ?? null;
    const offRoute = projection !== null && projection.offRouteM > OFF_ROUTE_M;

    let arrival: ArrivalPhase = 'far';
    if (remainingOnRoute !== null) {
      if (remainingOnRoute <= ARRIVAL_REMAINING_M) arrival = 'arrived';
      else if (remainingOnRoute <= ARRIVAL_NEAR_M) arrival = 'near';
    }
    if (arrival !== 'arrived' && offRoute && toDestination !== null && toDestination <= ARRIVAL_SHORTCUT_M) {
      arrival = 'arrived';
    }
    if (arrivalSuppressed && arrival === 'arrived') arrival = 'near';

    const canFinishManually =
      arrival !== 'arrived' && remainingOnRoute !== null && remainingOnRoute <= MANUAL_ARRIVAL_M;

    // 회전이 가까우면 회전 지점, 아니면 경로를 따라 일정 거리 앞
    const turnDistance = upcoming ? distanceMeters(position, upcoming.point) : null;
    const aheadMarker =
      upcoming && turnDistance !== null && turnDistance <= MARKER_TURN_RANGE_M
        ? upcoming.point
        : walked !== null && cumulative
          ? interpolateAlongRoute(
              route.points,
              cumulative,
              walked + ROADVIEW_LOOKAHEAD_M + MARKER_AHEAD_M,
            )
          : null;

    /*
     * 목적지가 가까우면 표시를 목적지 자체로 옮긴다.
     *
     * 경로 위 이정표는 남은 거리가 짧아지면 경로 마지막 점(도로 위)에 멈춰 서서,
     * 정작 도착할 무렵에 어디를 봐야 하는지 알려주지 못한다.
     *
     * 기준은 "곧 도착" 문구와 분리한 별도 거리다 (상수 설명 참고). 질러가서 경로를
     * 벗어난 경우는 경로 잔여가 실제보다 크게 남으므로 도착 판정과 같은 보조 조건을
     * 함께 본다.
     */
    const useDestination =
      destination !== null &&
      ((remainingOnRoute !== null && remainingOnRoute <= DESTINATION_MARKER_M) ||
        (offRoute && toDestination !== null && toDestination <= ARRIVAL_SHORTCUT_M));
    const marker = useDestination ? destination : aheadMarker;
    const markerKind: MarkerKind = useDestination ? 'destination' : 'waypoint';

    return {
      target,
      marker,
      markerKind,
      toDestination,
      arrival,
      canFinishManually,
      delta,
      upcoming,
      distanceToTurn: turnDistance === null ? null : Math.round(turnDistance),
      remaining: Math.round(distanceMeters(position, route.points[route.points.length - 1])),
      progress,
      snapped: projection?.point ?? null,
      snappedIndex: projection?.index ?? null,
      lookahead:
        walked !== null && cumulative
          ? interpolateAlongRoute(route.points, cumulative, walked + ROADVIEW_LOOKAHEAD_M)
          : null,
      offRouteM: projection ? Math.round(projection.offRouteM) : null,
    };
  }, [route, position, heading, turns, targetIndex, cumulative, destination, arrivalSuppressed]);

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
