import { useEffect, useRef, useState } from 'react';
import { loadKakaoSdk } from '../lib/kakao';
import { distanceMeters, type Point } from '../lib/geo';

interface Props {
  position: Point | null;
  /** 지금 향해야 하는 방위각. 파노라마를 이 방향으로 돌린다 */
  targetBearing: number | null;
  /** 다음 회전까지 남은 거리(m). 회전이 가까우면 강조 표시한다 */
  distanceToTurn: number | null;
}

/** 파노라마를 다시 요청할 최소 이동 거리(m). 매 좌표마다 부르면 통신·발열이 심하다 (스펙 4장). */
const REFRESH_DISTANCE_M = 25;

/** 이 반경 안에 로드뷰가 없으면 미지원 구간으로 본다 */
const SEARCH_RADIUS_M = 50;

type Coverage = 'unknown' | 'available' | 'none';

/**
 * 파노라마를 지정한 방위각으로 돌린다.
 * pan 은 정북 기준 시계방향이므로 방위각을 그대로 넣는다.
 */
function applyViewpoint(instance: any, bearing: number | null) {
  if (!instance || bearing === null) return;
  try {
    instance.setViewpoint({ pan: bearing, tilt: 0, zoom: 0 });
  } catch {
    /* 파노라마가 아직 준비되지 않음 */
  }
}

/**
 * 로드뷰 패널.
 *
 * "여기서 보여야 할 풍경"을 보여준다. 아래쪽 카메라 화면("지금 보이는 풍경")과 나란히
 * 놓여, 사용자가 머릿속이 아니라 화면에서 대조할 수 있게 한다.
 *
 * 로드뷰가 없는 구간에서는 패널만 비고 카메라·화살표 안내는 그대로 계속된다 (스펙 2-5).
 */
export function RoadviewPanel({ position, targetBearing, distanceToTurn }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const roadview = useRef<any>(null);
  const client = useRef<any>(null);
  const lastQueried = useRef<Point | null>(null);
  const [coverage, setCoverage] = useState<Coverage>('unknown');
  /**
   * SDK 로드가 비동기라, 위치를 이미 가진 채로 마운트되면 파노라마 요청 effect 가
   * 인스턴스보다 먼저 돌아 아무것도 요청하지 않는다. 준비 상태를 의존성에 넣는다.
   */
  const [ready, setReady] = useState(false);

  // 최신 목표 방위각. init 이벤트 콜백이 매번 새로 등록되지 않도록 ref 로 들고 있는다.
  const bearingRef = useRef<number | null>(null);
  bearingRef.current = targetBearing;

  // SDK 로드 및 로드뷰 인스턴스 생성 (1회)
  useEffect(() => {
    let cancelled = false;
    let instance: any = null;
    let onInit: (() => void) | null = null;
    let observer: ResizeObserver | null = null;

    loadKakaoSdk()
      .then(() => {
        if (cancelled || !container.current) return;
        instance = new kakao.maps.Roadview(container.current);
        roadview.current = instance;
        client.current = new kakao.maps.RoadviewClient();

        // 파노라마가 준비된 시점에 시점을 맞춘다. setPanoId 직후에는 아직 초기화 전이다.
        onInit = () => {
          // 컨테이너 크기가 확정된 뒤 relayout 을 부르지 않으면 파노라마가 회색으로 남는다.
          instance.relayout();
          applyViewpoint(instance, bearingRef.current);
        };
        kakao.maps.event.addListener(instance, 'init', onInit);

        // 화면 전환·회전으로 패널 크기가 바뀌어도 다시 맞춰준다.
        observer = new ResizeObserver(() => instance.relayout());
        observer.observe(container.current);

        setReady(true);
      })
      .catch((e) => console.error(e));

    return () => {
      cancelled = true;
      observer?.disconnect();
      // 카카오 API 는 addListener 가 핸들을 반환하지 않는다. 등록할 때와 같은 인자로 해제한다.
      if (instance && onInit) kakao.maps.event.removeListener(instance, 'init', onInit);
    };
  }, []);

  // 위치가 충분히 바뀌면 파노라마를 갱신한다
  useEffect(() => {
    if (!position || !roadview.current || !client.current) return;

    const previous = lastQueried.current;
    if (previous && distanceMeters(previous, position) < REFRESH_DISTANCE_M) return;
    lastQueried.current = position;

    const latLng = new kakao.maps.LatLng(position[1], position[0]);
    client.current.getNearestPanoId(latLng, SEARCH_RADIUS_M, (panoId: number | null) => {
      if (!panoId) {
        setCoverage('none');
        return;
      }
      setCoverage('available');
      roadview.current.setPanoId(panoId, latLng);
    });
  }, [ready, position]);

  // 파노라마를 목표 방위각으로 돌린다
  useEffect(() => {
    if (coverage !== 'available') return;
    applyViewpoint(roadview.current, targetBearing);
  }, [targetBearing, coverage]);

  const turnClose = distanceToTurn !== null && distanceToTurn <= 30;

  return (
    <div className="roadview">
      <div ref={container} className="roadview-canvas" />

      {coverage === 'none' && (
        <div className="roadview-fallback">
          <p>이 구간은 로드뷰가 없다</p>
          <span>카메라 안내로 계속 진행하면 된다</span>
        </div>
      )}

      {coverage === 'available' && (
        <div className={`roadview-badge ${turnClose ? 'close' : ''}`}>
          {turnClose ? '이 풍경이 보이면 여기서 회전' : '이 방향으로 진행'}
        </div>
      )}
    </div>
  );
}
