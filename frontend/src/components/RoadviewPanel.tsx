import { useCallback, useEffect, useRef, useState } from 'react';
import { loadKakaoSdk } from '../lib/kakao';
import { bearing, distanceMeters, normalizeDegrees, type Point } from '../lib/geo';

interface Props {
  position: Point | null;
  /** 지금 향해야 하는 방위각. 파노라마가 새로 뜰 때 이 방향을 보게 맞춘다 */
  targetBearing: number | null;
  /** 풍경 위에 "이쪽으로" 표시를 박을 좌표 */
  marker: Point | null;
  /** 다음 회전까지 남은 거리(m). 회전이 가까우면 강조 표시한다 */
  distanceToTurn: number | null;
}

/**
 * 파노라마를 다시 요청할 최소 이동 거리(m).
 *
 * 매 좌표마다 부르면 통신·발열이 심해 문턱을 둔다 (스펙 4장). 다만 25m 로 잡았더니
 * 보행 속도(1.3m/s)에서 최대 19초, 평균 10초쯤 지난 풍경이 떠서 "지나가고 나서야
 * 로드뷰가 바뀐다"는 문제가 됐다.
 *
 * 로드뷰 파노라마는 대략 10m 간격으로 촬영돼 있다 (가로수길·화곡 두 곳에서 확인).
 * 그보다 촘촘히 요청해도 같은 파노라마가 잡혀 낭비이므로 촬영 간격에 맞춘다.
 */
const REFRESH_DISTANCE_M = 10;

/**
 * 이 반경 안에 로드뷰가 없으면 미지원 구간으로 본다.
 *
 * 넓게 잡으면 뒤쪽이나 평행한 옆 골목 파노라마까지 후보에 들어와 지금 걷는 길과
 * 다른 풍경이 잡힌다. 촬영 간격의 두어 배면 충분하다.
 */
const SEARCH_RADIUS_M = 25;

/**
 * 방향 표시를 이 각도 넘게 벗어나 보고 있으면 화면 밖으로 본다.
 *
 * 로드뷰 화각은 문서화돼 있지 않아 정확한 값을 알 수 없지만, 여기서는 "화면 안에
 * 있나"만 가리면 되므로 대략치로 충분하다. 실기기에서 눈으로 맞춘다.
 */
const OFF_SCREEN_DEG = 40;

/** 표시의 고도(m). 0이면 노면에 붙어 잘 안 보이고, 너무 높으면 하늘에 뜬다 */
const MARKER_ALTITUDE_M = 3;

/** 이 거리 안에서만 표시가 보인다 */
const MARKER_RANGE_M = 120;

type Coverage = 'unknown' | 'available' | 'none';

/**
 * 파노라마를 지정한 방위각으로 돌린다.
 * pan 은 정북 기준 시계방향이므로 방위각을 그대로 넣는다.
 */
function applyViewpoint(instance: any, pan: number | null) {
  if (!instance || pan === null) return;
  try {
    instance.setViewpoint({ pan, tilt: 0, zoom: 0 });
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
export function RoadviewPanel({ position, targetBearing, marker, distanceToTurn }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const roadview = useRef<any>(null);
  const client = useRef<any>(null);
  const lastQueried = useRef<Point | null>(null);
  const markerOverlay = useRef<any>(null);
  const [coverage, setCoverage] = useState<Coverage>('unknown');
  /**
   * SDK 로드가 비동기라, 위치를 이미 가진 채로 마운트되면 파노라마 요청 effect 가
   * 인스턴스보다 먼저 돌아 아무것도 요청하지 않는다. 준비 상태를 의존성에 넣는다.
   */
  const [ready, setReady] = useState(false);

  /**
   * 사용자가 패널을 직접 조작 중인지.
   *
   * 켜지면 파노라마 자동 갱신과 시점 자동 정렬을 모두 멈춘다. 그래야 손으로 돌려놓은
   * 각도가 유지되고, 화살표로 옮겨간 자리도 다시 끌려오지 않는다. 복귀 버튼으로만
   * 자동 상태로 돌아온다.
   */
  const [manual, setManual] = useState(false);

  /** 방향 표시가 시야 밖일 때 어느 쪽으로 돌려야 하는지. 화면 안이면 null */
  const [offScreen, setOffScreen] = useState<'left' | 'right' | null>(null);

  /**
   * 파노라마가 실제로 떠 있는지.
   *
   * 인스턴스가 만들어진 것과 파노라마가 들어온 것은 다르다. 파노라마가 없는 로드뷰에
   * 오버레이를 붙이면 SDK 내부에서 예외가 나고, 그게 렌더 중이면 화면이 통째로
   * 날아간다. 지도를 펼쳤다 닫아 패널이 다시 마운트될 때 실제로 그랬다 — 그때는
   * 표시할 좌표가 이미 있어서 파노라마보다 오버레이가 먼저 붙는다.
   */
  const [panoReady, setPanoReady] = useState(false);

  // 최신 값들. 이벤트 콜백과 버튼 핸들러가 오래된 값을 잡지 않도록 ref 로 들고 있는다.
  const bearingRef = useRef<number | null>(null);
  bearingRef.current = targetBearing;
  const positionRef = useRef<Point | null>(null);
  positionRef.current = position;
  const manualRef = useRef(false);
  manualRef.current = manual;
  const markerRef = useRef<Point | null>(null);
  markerRef.current = marker;

  /**
   * 파노라마가 서 있는 자리에서 방향 표시를 보려면 필요한 pan.
   *
   * 표시가 없으면 목표 방위각으로 대신한다. 표시가 있으면 그쪽을 쓰는 편이 정확하다 —
   * 목표 방위각은 사용자의 실제 위치에서 잰 값인데, 파노라마는 그보다 앞에 있어서
   * 둘이 조금 어긋난다.
   */
  const panToMarker = useCallback((instance: any): number | null => {
    const target = markerRef.current;
    if (!instance || !target) return bearingRef.current;
    try {
      const here = instance.getPosition();
      return bearing([here.getLng(), here.getLat()], target);
    } catch {
      return bearingRef.current;
    }
  }, []);

  /** 방향 표시가 지금 시야 안에 있는지 판정한다. */
  const updateOffScreen = useCallback(() => {
    const instance = roadview.current;
    const wanted = markerRef.current ? panToMarker(instance) : null;
    if (!instance || wanted === null) {
      setOffScreen(null);
      return;
    }
    try {
      const delta = normalizeDegrees(wanted - instance.getViewpoint().pan);
      setOffScreen(Math.abs(delta) <= OFF_SCREEN_DEG ? null : delta > 0 ? 'right' : 'left');
    } catch {
      /* 파노라마가 아직 준비되지 않음 */
    }
  }, [panToMarker]);

  /** 새 파노라마를 가야 할 방향으로 돌려놓는다. 둘러보는 중이면 건드리지 않는다. */
  const faceForward = useCallback(
    (instance: any) => {
      if (manualRef.current) return;
      applyViewpoint(instance, panToMarker(instance));
    },
    [panToMarker],
  );

  /** 지정한 좌표의 파노라마를 띄운다. 위치 갱신 effect 와 복귀 버튼이 함께 쓴다. */
  const showPanoramaAt = useCallback((point: Point) => {
    if (!roadview.current || !client.current) return;

    lastQueried.current = point;
    const latLng = new kakao.maps.LatLng(point[1], point[0]);
    client.current.getNearestPanoId(latLng, SEARCH_RADIUS_M, (panoId: number | null) => {
      if (!panoId) {
        setCoverage('none');
        return;
      }
      setCoverage('available');
      // 조회는 비동기다. 응답이 오기 전에 패널이 사라졌을 수 있다.
      try {
        roadview.current?.setPanoId(panoId, latLng);
      } catch (e) {
        console.error('파노라마를 띄우지 못했다', e);
      }
    });
  }, []);

  /** 경로 위 제자리로 돌아온다. 시점도 가야 할 방향으로 맞춘다. */
  const recenter = useCallback(() => {
    manualRef.current = false;
    setManual(false);
    if (positionRef.current) showPanoramaAt(positionRef.current);
    /*
     * 같은 파노라마로 돌아오는 경우 panoid_changed 가 오지 않아 정렬 이벤트가 없다.
     * 여기서 직접 맞춘다. manualRef 를 먼저 내려야 faceForward 가 건너뛰지 않는다
     * (setManual 은 다음 렌더에나 반영된다).
     */
    applyViewpoint(roadview.current, panToMarker(roadview.current));
    updateOffScreen();
  }, [showPanoramaAt, panToMarker, updateOffScreen]);

  // SDK 로드 및 로드뷰 인스턴스 생성 (1회)
  useEffect(() => {
    let cancelled = false;
    let instance: any = null;
    let onInit: (() => void) | null = null;
    let onPanoId: (() => void) | null = null;
    let onViewpoint: (() => void) | null = null;
    let observer: ResizeObserver | null = null;
    let node: HTMLDivElement | null = null;
    const onPointerDown = () => setManual(true);

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
          setPanoReady(true);
          faceForward(instance);
          updateOffScreen();
        };
        kakao.maps.event.addListener(instance, 'init', onInit);

        /*
         * init 은 인스턴스가 처음 초기화될 때 한 번만 온다. setPanoId 로 파노라마를
         * 바꿀 때는 오지 않으므로, 걷다가 갱신된 파노라마는 정렬되지 않는다.
         * 파노라마 변경 이벤트에서 다시 맞춘다.
         */
        onPanoId = () => {
          setPanoReady(true);
          faceForward(instance);
          updateOffScreen();
        };
        kakao.maps.event.addListener(instance, 'panoid_changed', onPanoId);

        // 시점이 바뀌면 방향 표시가 아직 화면 안인지 다시 본다.
        onViewpoint = updateOffScreen;
        kakao.maps.event.addListener(instance, 'viewpoint_changed', onViewpoint);

        // 화면 전환·회전으로 패널 크기가 바뀌어도 다시 맞춰준다.
        observer = new ResizeObserver(() => instance.relayout());
        observer.observe(container.current);

        /*
         * 손을 대는 순간 수동으로 전환한다.
         *
         * 카카오의 viewpoint_changed / panoid_changed 는 우리가 setViewpoint·setPanoId 를
         * 부를 때도 발생해서 사용자 조작과 구분하려면 별도 플래그가 필요하다. pointerdown
         * 은 사람이 만졌을 때만 오고, 드래그든 이동 화살표 탭이든 똑같이 잡힌다.
         */
        node = container.current;
        node.addEventListener('pointerdown', onPointerDown);

        setReady(true);
      })
      .catch((e) => console.error(e));

    return () => {
      cancelled = true;
      observer?.disconnect();
      node?.removeEventListener('pointerdown', onPointerDown);
      markerOverlay.current?.setMap(null);
      markerOverlay.current = null;
      // 카카오 API 는 addListener 가 핸들을 반환하지 않는다. 등록할 때와 같은 인자로 해제한다.
      if (instance && onInit) kakao.maps.event.removeListener(instance, 'init', onInit);
      if (instance && onPanoId) {
        kakao.maps.event.removeListener(instance, 'panoid_changed', onPanoId);
      }
      if (instance && onViewpoint) {
        kakao.maps.event.removeListener(instance, 'viewpoint_changed', onViewpoint);
      }
    };
  }, [faceForward, updateOffScreen]);

  // 위치가 충분히 바뀌면 파노라마를 갱신한다
  useEffect(() => {
    if (!position) return;
    // 둘러보는 중에는 끌고 오지 않는다. 복귀 버튼으로만 돌아온다.
    if (manual) return;

    const previous = lastQueried.current;
    if (previous && distanceMeters(previous, position) < REFRESH_DISTANCE_M) return;
    showPanoramaAt(position);
  }, [ready, position, manual, showPanoramaAt]);

  /*
   * 가야 할 방향을 풍경 위에 고정 표시한다.
   *
   * 좌표를 주면 SDK 가 파노라마 안 제자리에 그려주고, 시점을 돌리면 풍경과 함께
   * 따라 움직인다. 화면 좌표를 직접 계산하지 않는 이유는 로드뷰 화각이 문서화돼
   * 있지 않아 픽셀 위치를 정확히 맞출 수 없기 때문이다.
   *
   * 오버레이는 한 번 만들어 재사용한다. 매번 새로 만들면 파노라마가 갱신될 때마다
   * 깜빡인다.
   */
  useEffect(() => {
    // 파노라마가 들어오기 전에 붙이면 SDK 가 예외를 던진다 (panoReady 설명 참고).
    if (!panoReady || !roadview.current) return;

    if (!marker) {
      markerOverlay.current?.setMap(null);
      markerOverlay.current = null;
      setOffScreen(null);
      return;
    }

    // SDK 호출이 실패해도 화면 전체가 날아가지 않게 막는다. 표시는 안내의 보조 수단이라
    // 없어도 카메라·화살표 안내는 계속돼야 한다.
    try {
      const latLng = new kakao.maps.LatLng(marker[1], marker[0]);
      if (!markerOverlay.current) {
        markerOverlay.current = new kakao.maps.CustomOverlay({
          position: latLng,
          content: '<div class="rv-marker">이쪽</div>',
          altitude: MARKER_ALTITUDE_M,
          range: MARKER_RANGE_M,
        });
        markerOverlay.current.setMap(roadview.current);
      } else {
        markerOverlay.current.setPosition(latLng);
      }
    } catch (e) {
      console.error('방향 표시를 올리지 못했다', e);
      markerOverlay.current = null;
      return;
    }

    updateOffScreen();
  }, [panoReady, marker, updateOffScreen]);

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

      {/* 표시가 시야 밖이면 어느 쪽으로 돌려야 하는지 가장자리에 알려준다 */}
      {coverage === 'available' && offScreen && (
        <div className={`rv-hint ${offScreen}`}>{offScreen === 'left' ? '←' : '→'}</div>
      )}

      {coverage === 'available' && (
        <div className={`roadview-badge ${turnClose && !manual ? 'close' : ''}`}>
          {manual
            ? '둘러보는 중 — 경로와 다를 수 있다'
            : turnClose
              ? '이 풍경이 보이면 여기서 회전'
              : '곧 보게 될 풍경'}
        </div>
      )}

      {manual && (
        <button type="button" className="roadview-recenter" onClick={recenter}>
          현재 위치로
        </button>
      )}
    </div>
  );
}
