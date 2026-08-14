import { useEffect, useState } from 'react';
import { PlaceSearch } from './components/PlaceSearch';
import { useCamera, requestOrientationPermission } from './hooks/useCamera';
import { useGuidance } from './hooks/useGuidance';
import { useNavigation } from './hooks/useNavigation';
import type { Point } from './lib/geo';
import { placePoint, type Place } from './lib/places';
import { fetchRoute, type Route } from './lib/route';
import { isSimulationMode } from './lib/simulation';
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

type Screen = 'home' | 'map' | 'walk';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState<Place | null>(null);

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

  const guidance = useGuidance(route, nav.position, nav.heading);

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
          heading={nav.heading}
          onBack={() => setScreen('home')}
          onStart={startWalking}
        />
      )}

      {screen === 'walk' && route && (
        <WalkScreen
          guidance={guidance}
          position={nav.position}
          heading={nav.heading}
          headingSource={nav.headingSource}
          destination={destination}
          camera={camera}
          onBack={stopWalking}
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
