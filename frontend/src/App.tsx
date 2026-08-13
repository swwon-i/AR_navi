import { useEffect, useMemo, useRef, useState } from 'react';
import { RouteMap } from './components/RouteMap';
import { useNavigation } from './hooks/useNavigation';
import {
  extractTurns,
  bearing,
  distanceMeters,
  normalizeDegrees,
  nearestIndex,
  type Point,
} from './lib/geo';
import { fetchRoute, type Route } from './lib/route';
import { isSimulationMode } from './lib/simulation';

// M1 확인용 고정 경로. 지상 구간이라 M3에서 로드뷰를 붙이기에도 적합하다.
const DEMO_START: Point = [127.0219, 37.5205]; // 가로수길 북단
const DEMO_END: Point = [127.0265, 37.5168]; // 신사역 방면

export default function App() {
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const simMode = isSimulationMode();

  const turns = useMemo(
    () => (route ? extractTurns(route.points) : []),
    [route],
  );

  const nav = useNavigation(route?.points ?? null);

  async function loadRoute() {
    setLoading(true);
    setError(null);
    try {
      setRoute(await fetchRoute(DEMO_START, DEMO_END));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  /**
   * 지금 향해 가고 있는 경로 점의 인덱스.
   *
   * "가장 가까운 점의 다음"으로 잡으면 구간 중간을 지나는 순간 목표가 한 구간 통째로
   * 건너뛰어, 모퉁이에 닿기도 전에 회전 안내가 뜬다. 목표에 충분히 접근했을 때만
   * 앞으로 넘긴다.
   */
  const [targetIndex, setTargetIndex] = useState(1);
  const routeRef = useRef<Route | null>(null);

  const WAYPOINT_RADIUS_M = 8;

  useEffect(() => {
    if (!route || !nav.position) return;

    // 경로가 새로 로드되면 현재 위치에서 가장 가까운 점의 다음부터 시작한다.
    if (routeRef.current !== route) {
      routeRef.current = route;
      setTargetIndex(Math.min(nearestIndex(route.points, nav.position) + 1, route.points.length - 1));
      return;
    }

    setTargetIndex((current) => {
      let next = current;
      while (
        next < route.points.length - 1 &&
        distanceMeters(nav.position!, route.points[next]) < WAYPOINT_RADIUS_M
      ) {
        next++;
      }
      return next;
    });
  }, [route, nav.position]);

  // 목표 지점까지의 방위각과, 현재 진행 방향과의 차이
  const guidance = useMemo(() => {
    if (!route || !nav.position) return null;
    const target = bearing(nav.position, route.points[targetIndex]);
    const delta = nav.heading === null ? null : normalizeDegrees(target - nav.heading);
    const upcoming = turns.find((t) => t.index >= targetIndex);
    const distanceToTurn = upcoming
      ? Math.round(distanceMeters(nav.position, upcoming.point))
      : null;
    return { target, delta, upcoming, distanceToTurn };
  }, [route, nav.position, nav.heading, turns, targetIndex]);

  return (
    <div className="app">
      <header>
        <h1>AR navi <small>M1</small></h1>
        <div className="controls">
          <button onClick={loadRoute} disabled={loading}>
            {loading ? '조회 중…' : '경로 조회'}
          </button>
          {simMode ? (
            <>
              <button onClick={nav.startSimulation} disabled={!route}>▶ 시뮬레이션</button>
              <button onClick={nav.stopSimulation} disabled={!route}>⏸ 정지</button>
            </>
          ) : (
            <button onClick={nav.startTracking}>실제 위치 추적</button>
          )}
        </div>
      </header>

      {simMode && <div className="banner">시뮬레이션 모드 — 실제 GPS를 쓰지 않는다</div>}
      {(error || nav.error) && <div className="banner error">{error ?? nav.error}</div>}

      <RouteMap
        points={route?.points ?? []}
        turns={turns}
        position={nav.position}
        heading={nav.heading}
      />

      <section className="info">
        {route && (
          <p>
            총 {route.totalDistance}m / 약 {Math.round(route.totalTime / 60)}분 ·
            좌표 {route.points.length}개 · <strong>회전 {turns.length}곳</strong>
          </p>
        )}
        {guidance && (
          <p>
            진행방향 {nav.heading === null ? '—' : `${Math.round(nav.heading)}°`}
            <span className="src">({nav.headingSource ?? '없음'})</span>
            {' → '}목표 {Math.round(guidance.target)}°
            {guidance.delta !== null && (
              <strong className={Math.abs(guidance.delta) > 30 ? 'off' : 'ok'}>
                {' '}차이 {Math.round(guidance.delta)}°
              </strong>
            )}
          </p>
        )}
        {guidance?.upcoming && (
          <p className="next">
            {guidance.distanceToTurn}m 앞{' '}
            {guidance.upcoming.direction === 'left' ? '좌' : '우'}회전
            {' '}{Math.abs(Math.round(guidance.upcoming.delta))}°
          </p>
        )}
      </section>
    </div>
  );
}
