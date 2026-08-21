import { useEffect, useMemo, useRef, useState } from 'react';
import { PlaceSearch } from './components/PlaceSearch';
import { useCamera, requestOrientationPermission } from './hooks/useCamera';
import { useGuidance } from './hooks/useGuidance';
import { useNavigation } from './hooks/useNavigation';
import type { Point } from './lib/geo';
import { placePoint, type Place } from './lib/places';
import { fetchRoute, type Route } from './lib/route';
import { isSimulationMode } from './lib/simulation';
import { DoneScreen } from './screens/DoneScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MapScreen } from './screens/MapScreen';
import { WalkScreen } from './screens/WalkScreen';

/**
 * 시뮬레이션 모드의 가상 현재 위치.
 *
 * 실제 모드에서는 GPS로 잡은 위치를 쓴다. 시뮬레이션에는 GPS가 없으므로 고정 좌표가
 * 필요하다. 로드뷰가 촘촘한 지상 구간으로 골랐다.
 */
const SIM_POSITION: Point = [127.0219, 37.5205]; // 가로수길 북단

type Screen = 'home' | 'map' | 'walk' | 'done';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState<Place | null>(null);

  /** 주행 시작 시각. 완료 화면의 소요 시간은 카카오 예상치가 아니라 실제 경과다 */
  const startedAt = useRef<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  /** "재안내"로 도착 판정을 무시한 상태. 목적지에서 다시 멀어질 때까지 유지된다 */
  const [arrivalSuppressed, setArrivalSuppressed] = useState(false);

  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simMode = isSimulationMode();
  const camera = useCamera();
  const nav = useNavigation(route?.points ?? null);

  /**
   * GPS(또는 시뮬레이션)로 잡은 현재 위치. 출발지는 언제나 이 값이다.
   *
   * 출발지를 임의로 지정할 수 있게 하면 경로 위에 있지 않은 상태를 사용자가 만들 수
   * 있는데, 이 앱은 그 자리에 서 있을 때만 쓸모가 있다. 시연은 시뮬레이션 모드로 한다.
   */
  const currentPosition: Point | null = simMode ? (nav.position ?? SIM_POSITION) : nav.position;

  // 실제 모드에서는 화면을 열자마자 위치 추적을 시작한다.
  // 위치 권한은 사용자 제스처가 필요 없다. 방향센서 권한만 "길안내 시작"에서 요청한다.
  useEffect(() => {
    if (simMode) return;
    return nav.startTracking();
  }, [simMode, nav.startTracking]);

  const destinationPoint = useMemo(
    () => (destination ? placePoint(destination) : null),
    [destination],
  );

  const guidance = useGuidance(
    route,
    nav.position,
    nav.heading,
    destinationPoint,
    arrivalSuppressed,
  );

  async function findRoute() {
    if (!destination || !currentPosition) return;

    setLoading(true);
    setError(null);
    try {
      setRoute(await fetchRoute(currentPosition, placePoint(destination)));
      setScreen('map');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  /**
   * 길안내 시작.
   *
   * iOS는 방향센서 권한을 사용자 제스처 안에서만 요청할 수 있으므로 이 핸들러에서 연다.
   * 카메라는 실패하거나 거부될 수 있으므로 내비게이션을 먼저 시작한다.
   */
  async function startWalking() {
    setScreen('walk');
    startedAt.current = Date.now();
    setArrivalSuppressed(false);
    await requestOrientationPermission();

    if (simMode) nav.startSimulation();
    else nav.startTracking();

    camera.start().catch(() => undefined);
  }

  function stopWalking() {
    nav.stopSimulation();
    camera.stop();
    setScreen('map');
  }

  /**
   * 완료 상태로 들어간다. 자동 판정과 "도착했어요" 버튼이 같은 경로를 쓴다.
   *
   * 여기서 카메라·추적을 끄지 않는 것이 중요하다. 완료 표시는 주행 화면 위에 얹히는
   * 반투명 오버레이라, 뒤의 로드뷰를 계속 쓸 수 있어야 한다. 정리는 "안내 종료"에서.
   */
  function markArrived() {
    setElapsedSec(
      startedAt.current === null ? 0 : Math.round((Date.now() - startedAt.current) / 1000),
    );
    setScreen('done');
  }

  /*
   * 도착 감지.
   *
   * 판정 자체는 useGuidance 가 경로 잔여 거리로 한다. 여기서는 결과를 받아 완료
   * 상태로 넘기는 일만 한다.
   *
   * "재안내"로 무시한 상태는 목적지에서 충분히 멀어지면(=단계가 'far') 자동으로 푼다.
   */
  useEffect(() => {
    if (screen !== 'walk') return;

    if (guidance.arrival !== 'arrived') {
      if (arrivalSuppressed && guidance.arrival === 'far') setArrivalSuppressed(false);
      return;
    }
    markArrived();
  }, [screen, guidance.arrival, arrivalSuppressed]);

  /** "안내 종료". 여기서 비로소 카메라·시뮬레이션을 정리하고 홈으로 돌아간다. */
  function finishGuidance() {
    nav.stopSimulation();
    camera.stop();
    setScreen('home');
    setDestination(null);
    setRoute(null);
    setArrivalSuppressed(false);
    startedAt.current = null;
  }

  /**
   * "재안내". 판정이 어긋났을 때 안내로 돌아간다.
   *
   * 경로는 다시 조회하지 않는다 — 도보 경로 API 는 하루 1,000건이라 왕복마다 쓰면
   * 금방 소진된다. 시뮬레이션도 다시 시작하지 않는다. 처음부터 다시 걷게 되어
   * 위치가 출발지로 순간이동하기 때문이다.
   */
  function resumeGuidance() {
    setArrivalSuppressed(true);
    setScreen('walk');
  }

  function selectDestination(place: Place | null) {
    if (place) setDestination(place);
    setSearching(false);
    setRoute(null);
  }

  return (
    <div className="app">
      <header>
        <h1>AR navi</h1>
        {simMode && <span className="sim-tag">시뮬레이션</span>}
      </header>

      {error && <div className="banner error">{error}</div>}
      {nav.error && <div className="banner error">{nav.error}</div>}

      {screen === 'home' && (
        <HomeScreen
          destination={destination}
          hasCurrentPosition={currentPosition !== null}
          loading={loading}
          onEditDestination={() => setSearching(true)}
          onSubmit={findRoute}
        />
      )}

      {screen === 'map' && route && (
        <MapScreen
          route={route}
          turns={guidance.turns}
          destination={destination}
          position={nav.position}
          onBack={() => setScreen('home')}
          onStart={startWalking}
        />
      )}

      {/*
        완료 상태에서도 주행 화면을 그대로 둔다. 완료 표시는 그 위에 얹히는 반투명
        오버레이라, 뒤의 로드뷰로 건물을 찾을 수 있어야 한다.
      */}
      {(screen === 'walk' || screen === 'done') && route && (
        <WalkScreen
          route={route}
          guidance={guidance}
          position={nav.position}
          heading={nav.heading}
          headingSource={nav.headingSource}
          destination={destination}
          camera={camera}
          onBack={stopWalking}
          onFinishManually={screen === 'walk' ? markArrived : null}
        />
      )}

      {screen === 'done' && route && (
        <DoneScreen
          distanceM={route.totalDistance}
          elapsedSec={elapsedSec}
          onFinish={finishGuidance}
          onResume={resumeGuidance}
        />
      )}

      {searching && (
        <PlaceSearch
          title="도착지 검색"
          origin={currentPosition}
          onSelect={selectDestination}
          onClose={() => setSearching(false)}
        />
      )}
    </div>
  );
}
