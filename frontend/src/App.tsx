import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowOverlay } from './components/ArrowOverlay';
import { CameraView } from './components/CameraView';
import { DestinationSearch } from './components/DestinationSearch';
import { RoadviewPanel } from './components/RoadviewPanel';
import { RouteMap } from './components/RouteMap';
import { useCamera, requestOrientationPermission } from './hooks/useCamera';
import { useNavigation } from './hooks/useNavigation';
import {
  extractTurns,
  bearing,
  distanceMeters,
  normalizeDegrees,
  nearestIndex,
  type Point,
} from './lib/geo';
import { resolveInstruction, type Instruction } from './lib/guidance';
import { placePoint, type Place } from './lib/places';
import { fetchRoute, type Route } from './lib/route';
import { isSimulationMode } from './lib/simulation';

/**
 * 시뮬레이션 모드의 가상 출발지.
 *
 * 실제 모드에서는 GPS로 잡은 현재 위치를 출발지로 쓴다. 시뮬레이션에는 GPS가 없으므로
 * 고정 좌표가 필요하다. 로드뷰가 촘촘한 지상 구간으로 골랐다.
 */
const SIM_ORIGIN: Point = [127.0219, 37.5205]; // 가로수길 북단

/** 목표 지점을 지났다고 볼 반경(m) */
const WAYPOINT_RADIUS_M = 8;

/** walk = 로드뷰(위) + 카메라(아래) 분할, map = 경로 전체 확인용 */
type View = 'walk' | 'map';

export default function App() {
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>('walk');
  const [started, setStarted] = useState(false);
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState<Place | null>(null);
  const simMode = isSimulationMode();

  const camera = useCamera();
  const nav = useNavigation(route?.points ?? null);

  /**
   * 출발지. 실제 모드에서는 현재 위치, 시뮬레이션에서는 고정 좌표.
   * 경로를 받기 전에도 장소 검색의 거리순 정렬에 쓰인다.
   */
  const origin: Point | null = simMode ? SIM_ORIGIN : nav.position;

  // 실제 모드에서는 화면을 열자마자 위치 추적을 시작한다.
  // (위치 권한은 사용자 제스처가 필요 없다. 방향센서 권한만 "체험 시작" 버튼에서 요청한다)
  useEffect(() => {
    if (simMode) return;
    return nav.startTracking();
  }, [simMode, nav.startTracking]);

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
    if (!route || !nav.position) return;

    if (routeRef.current !== route) {
      routeRef.current = route;
      setTargetIndex(
        Math.min(nearestIndex(route.points, nav.position) + 1, route.points.length - 1),
      );
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

  const guidance = useMemo(() => {
    if (!route || !nav.position) return null;
    const target = bearing(nav.position, route.points[targetIndex]);
    const delta = nav.heading === null ? null : normalizeDegrees(target - nav.heading);
    const upcoming = turns.find((t) => t.index >= targetIndex) ?? null;
    const distanceToTurn = upcoming
      ? Math.round(distanceMeters(nav.position, upcoming.point))
      : null;
    return { target, delta, upcoming, distanceToTurn };
  }, [route, nav.position, nav.heading, turns, targetIndex]);

  // 안내 문구는 히스테리시스를 거쳐 결정한다. 직전 값이 입력에 포함되므로 ref로 들고 있는다.
  const previousInstruction = useRef<Instruction | null>(null);
  const instruction = useMemo(() => {
    if (guidance?.delta == null) return null;
    const next = resolveInstruction(guidance.delta, previousInstruction.current);
    previousInstruction.current = next;
    return next;
  }, [guidance?.delta]);

  async function selectDestination(place: Place) {
    setSearching(false);
    setDestination(place);

    if (!origin) {
      setError('현재 위치를 아직 못 잡았다. 위치 권한을 확인해라.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setRoute(await fetchRoute(origin, placePoint(place)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  /**
   * 체험 시작. iOS는 방향센서 권한을 사용자 제스처 안에서만 요청할 수 있으므로
   * 이 핸들러 안에서 카메라·센서·위치추적을 한 번에 연다 (스펙 4장).
   */
  async function startExperience() {
    setStarted(true);
    await requestOrientationPermission();
    await camera.start();
    if (simMode) nav.startSimulation();
    else nav.startTracking();
  }

  return (
    <div className="app">
      <header>
        <h1>AR navi <small>M3</small></h1>
        <div className="controls">
          <button onClick={() => setSearching(true)} disabled={loading}>
            {loading ? '조회 중…' : destination ? '목적지 변경' : '목적지 검색'}
          </button>
          <button onClick={startExperience} disabled={!route || started}>
            체험 시작
          </button>
          {simMode && started && (
            <button onClick={nav.stopSimulation}>⏸ 정지</button>
          )}
          <button onClick={() => setView(view === 'walk' ? 'map' : 'walk')}>
            {view === 'walk' ? '지도' : '주행'}
          </button>
        </div>
      </header>

      {simMode && <div className="banner">시뮬레이션 모드 — 실제 GPS를 쓰지 않는다</div>}
      {(error || nav.error) && <div className="banner error">{error ?? nav.error}</div>}

      {searching && (
        <DestinationSearch
          origin={origin}
          onSelect={selectDestination}
          onClose={() => setSearching(false)}
        />
      )}

      <main className="stage">
        {view === 'walk' ? (
          // 위 = 여기서 보여야 할 풍경(로드뷰), 아래 = 지금 보이는 풍경(카메라).
          // 대조를 사용자 머릿속이 아니라 화면에서 하게 만드는 구성이다.
          <div className="split">
            <div className="split-top">
              <RoadviewPanel
                position={nav.position}
                targetBearing={guidance?.target ?? null}
                distanceToTurn={guidance?.distanceToTurn ?? null}
              />
            </div>
            <div className="split-bottom">
              <CameraView videoRef={camera.videoRef} status={camera.status} error={camera.error} />
              <ArrowOverlay
                delta={guidance?.delta ?? null}
                instruction={instruction}
                distanceToTurn={guidance?.distanceToTurn ?? null}
                nextTurnDirection={guidance?.upcoming?.direction ?? null}
                headingSource={nav.headingSource}
              />
            </div>
          </div>
        ) : (
          <RouteMap
            points={route?.points ?? []}
            turns={turns}
            position={nav.position}
            heading={nav.heading}
          />
        )}
      </main>

      <section className="info">
        {destination && (
          <p className="dest">→ {destination.name} <span className="src">{destination.address}</span></p>
        )}
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
              <strong className={Math.abs(guidance.delta) > 50 ? 'off' : 'ok'}>
                {' '}차이 {Math.round(guidance.delta)}°
              </strong>
            )}
          </p>
        )}
      </section>
    </div>
  );
}
