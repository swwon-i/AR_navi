import { useEffect, useRef, useState } from 'react';
import { loadKakaoSdk } from '../lib/kakao';
import type { Point, Turn } from '../lib/geo';

interface Props {
  points: Point[];
  turns: Turn[];
  position: Point | null;
  /**
   * 지나온 구간. 주면 경로 위에 다른 색으로 덧그려 진행률이 선으로 보인다.
   * 주지 않으면 경로 전체가 한 색으로 그려진다 (경로 확인 화면).
   */
  traveled?: Point[] | null;
  /** 출발·도착 지점에 핀을 표시한다. 경로 확인 화면에서 쓴다 */
  showEndpoints?: boolean;
  /** 회전 지점 핀. 작은 화면에서는 과해서 끌 수 있게 한다 */
  showTurns?: boolean;
  /**
   * 위치가 갱신될 때마다 지도를 현재 위치로 끌고 갈지.
   *
   * 주행 화면에서 펼쳐 보는 지도는 "전체 경로 중 어디쯤"을 보려는 것이므로 꺼야
   * 한다. 켜두면 계속 현재 위치로 따라붙어 전체를 볼 수 없다.
   */
  followPosition?: boolean;
}

/** 경로 지도. 경로 폴리라인 + 회전 지점 + 현재 위치를 표시한다. */
export function RouteMap({
  points,
  turns,
  position,
  traveled = null,
  showEndpoints = false,
  showTurns = true,
  followPosition = true,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  /**
   * SDK 로드는 비동기다. 경로를 이미 가진 채로 마운트되면 그리기 effect 가 지도보다
   * 먼저 돌아 아무것도 안 그려진다. 준비 상태를 의존성에 넣어 다시 그리게 한다.
   */
  const [ready, setReady] = useState(false);
  const polyline = useRef<any>(null);
  const walkedLine = useRef<any>(null);
  const marker = useRef<any>(null);
  const turnMarkers = useRef<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadKakaoSdk()
      .then(() => {
        if (cancelled || !container.current) return;
        map.current = new kakao.maps.Map(container.current, {
          center: new kakao.maps.LatLng(37.4979, 127.0276),
          level: 4,
        });
        setReady(true);
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, []);

  // 지나온 구간이 있는지. traveled 자체는 매 좌표마다 바뀌므로 의존성에는 쓸 수 없다.
  const hasProgress = traveled !== null;

  // 경로 폴리라인 + 회전 지점 마커
  useEffect(() => {
    if (!map.current || points.length === 0) return;

    polyline.current?.setMap(null);
    turnMarkers.current.forEach((m) => m.setMap(null));
    turnMarkers.current = [];

    const path = points.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng));
    polyline.current = new kakao.maps.Polyline({
      path,
      strokeWeight: 5,
      // 진행률을 함께 보여줄 때는 전체 경로가 "남은 길"이 되므로 흐린 색으로 깔고,
      // 지나온 구간을 그 위에 진한 색으로 덧그린다.
      strokeColor: hasProgress ? '#39415a' : '#2b7fff',
      strokeOpacity: 0.85,
    });
    polyline.current.setMap(map.current);

    if (showEndpoints) {
      const endpoints = [
        { point: points[0], className: 'start', text: '출발' },
        { point: points[points.length - 1], className: 'end', text: '도착' },
      ];
      endpoints.forEach(({ point, className, text }) => {
        const overlay = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(point[1], point[0]),
          content: `<div class="endpoint-pin ${className}">${text}</div>`,
          zIndex: 3,
        });
        overlay.setMap(map.current);
        turnMarkers.current.push(overlay);
      });
    }

    turnMarkers.current = turnMarkers.current.concat((showTurns ? turns : []).map((turn) => {
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(turn.point[1], turn.point[0]),
        content:
          `<div class="turn-pin ${turn.direction}">` +
          `${turn.direction === 'left' ? '↰' : '↱'}${Math.abs(Math.round(turn.delta))}°</div>`,
      });
      overlay.setMap(map.current);
      return overlay;
    }));

    const bounds = new kakao.maps.LatLngBounds();
    path.forEach((p: any) => bounds.extend(p));
    map.current.setBounds(bounds);
  }, [ready, points, turns, showEndpoints, showTurns, hasProgress]);

  /*
   * 지나온 구간.
   *
   * 경로 그리기 effect 와 분리한 이유는 그쪽이 setBounds 를 부르기 때문이다. 위치가
   * 갱신될 때마다 지도 축척이 다시 맞춰지면 화면이 계속 튄다.
   */
  useEffect(() => {
    if (!map.current) return;

    walkedLine.current?.setMap(null);
    walkedLine.current = null;
    if (!traveled || traveled.length < 2) return;

    walkedLine.current = new kakao.maps.Polyline({
      path: traveled.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng)),
      strokeWeight: 6,
      strokeColor: '#2b7fff',
      strokeOpacity: 0.95,
      zIndex: 2,
    });
    walkedLine.current.setMap(map.current);
  }, [ready, traveled]);

  // 현재 위치
  useEffect(() => {
    if (!map.current || !position) return;
    const latLng = new kakao.maps.LatLng(position[1], position[0]);

    if (!marker.current) {
      // 지나온 구간 선(zIndex 2) 위에 올라와야 가려지지 않는다.
      marker.current = new kakao.maps.CustomOverlay({
        position: latLng,
        content: '<div class="me"></div>',
        zIndex: 4,
      });
      marker.current.setMap(map.current);
    }
    marker.current.setPosition(latLng);
    if (followPosition) map.current.panTo(latLng);
  }, [position, followPosition]);

  return <div ref={container} className="map" />;
}
