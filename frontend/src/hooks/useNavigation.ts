/**
 * 현재 위치·진행 방향을 관리한다.
 *
 * 실제 GPS와 시뮬레이션을 같은 인터페이스로 다루므로, 화면 코드는 어느 쪽인지 몰라도 된다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { headingFromTrail, smoothAngle, type Point } from '../lib/geo';
import { createWalkSimulation, type WalkSimulation } from '../lib/simulation';

/**
 * 궤적 버퍼 길이.
 *
 * headingFromTrail이 3m 이상 떨어진 점을 찾아야 하므로, 느린 보행에서도 그 거리가
 * 확보될 만큼 길어야 한다. 8개였을 때 곡선 구간에서 시작점-끝점 직선거리가 3m 아래로
 * 떨어져 heading이 간헐적으로 null이 되는 것을 시뮬레이션에서 확인했다.
 */
const TRAIL_LENGTH = 24;

export interface NavigationState {
  position: Point | null;
  /** 진행 방향(0~360). 이동 중에는 GPS 궤적 기반, 정지 시 나침반 폴백 */
  heading: number | null;
  /** stale = 새 값이 없어 직전 방향을 유지하는 중 */
  headingSource: 'trail' | 'compass' | 'stale' | null;
  error: string | null;
}

export function useNavigation(simulationPath: Point[] | null) {
  const [state, setState] = useState<NavigationState>({
    position: null,
    heading: null,
    headingSource: null,
    error: null,
  });

  const trail = useRef<Point[]>([]);
  const smoothed = useRef<number | null>(null);
  const compass = useRef<number | null>(null);
  const simulation = useRef<WalkSimulation | null>(null);

  /** 좌표 하나를 반영한다. 실제 GPS든 시뮬레이션이든 여기로 들어온다. */
  const pushFix = useCallback((point: Point) => {
    trail.current = [...trail.current, point].slice(-TRAIL_LENGTH);

    // 이동 중이면 궤적 기반 heading, 정지 상태면 나침반으로 폴백 (스펙 2-2)
    const fromTrail = headingFromTrail(trail.current);
    const raw = fromTrail ?? compass.current;

    // 둘 다 없을 때 방향을 null로 되돌리지 않는다. 화살표가 사라졌다 나타나는 것보다
    // 마지막으로 알던 방향을 유지하는 편이 낫다 (source를 stale로 표시해 구분한다).
    const source: NavigationState['headingSource'] =
      fromTrail !== null ? 'trail'
        : compass.current !== null ? 'compass'
          : smoothed.current !== null ? 'stale' : null;

    if (raw !== null) smoothed.current = smoothAngle(smoothed.current, raw);

    setState((prev) => ({
      ...prev,
      position: point,
      heading: smoothed.current,
      headingSource: source,
    }));
  }, []);

  // 나침반은 폴백용으로만 받아둔다.
  useEffect(() => {
    const onOrientation = (event: DeviceOrientationEvent) => {
      // iOS는 webkitCompassHeading(정북 기준), 그 외는 alpha(반시계) → 360에서 뺀다
      const webkit = (event as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof webkit === 'number') compass.current = webkit;
      else if (event.alpha !== null) compass.current = (360 - event.alpha) % 360;
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, []);

  /** 시뮬레이션 모드: 경로 위를 일정 속도로 이동시킨다. */
  const startSimulation = useCallback(() => {
    if (!simulationPath || simulationPath.length < 2) return;
    simulation.current?.stop();
    const sim = createWalkSimulation(simulationPath, { speedMps: 1.3, intervalMs: 400 });
    simulation.current = sim;
    trail.current = [];
    smoothed.current = null;
    sim.start((fix) => pushFix(fix.point));
  }, [simulationPath, pushFix]);

  const stopSimulation = useCallback(() => {
    simulation.current?.stop();
  }, []);

  /** 실제 GPS 추적 시작. HTTPS 또는 localhost 필요. */
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({ ...prev, error: '이 브라우저는 geolocation을 지원하지 않는다.' }));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => pushFix([pos.coords.longitude, pos.coords.latitude]),
      (err) => setState((prev) => ({ ...prev, error: `위치 오류: ${err.message}` })),
      { enableHighAccuracy: true, maximumAge: 1000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [pushFix]);

  useEffect(() => () => simulation.current?.stop(), []);

  return { ...state, startSimulation, stopSimulation, startTracking };
}
