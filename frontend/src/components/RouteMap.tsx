import { useEffect, useRef } from 'react';
import { loadKakaoSdk } from '../lib/kakao';
import type { Point, Turn } from '../lib/geo';

interface Props {
  points: Point[];
  turns: Turn[];
  position: Point | null;
  heading: number | null;
}

/** M1 확인용 지도. 경로 폴리라인 + 회전 지점 + 현재 위치를 표시한다. */
export function RouteMap({ points, turns, position, heading }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const polyline = useRef<any>(null);
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
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, []);

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
      strokeColor: '#2b7fff',
      strokeOpacity: 0.85,
    });
    polyline.current.setMap(map.current);

    turnMarkers.current = turns.map((turn) => {
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(turn.point[1], turn.point[0]),
        content:
          `<div class="turn-pin ${turn.direction}">` +
          `${turn.direction === 'left' ? '↰' : '↱'}${Math.abs(Math.round(turn.delta))}°</div>`,
      });
      overlay.setMap(map.current);
      return overlay;
    });

    const bounds = new kakao.maps.LatLngBounds();
    path.forEach((p: any) => bounds.extend(p));
    map.current.setBounds(bounds);
  }, [points, turns]);

  // 현재 위치
  useEffect(() => {
    if (!map.current || !position) return;
    const latLng = new kakao.maps.LatLng(position[1], position[0]);

    if (!marker.current) {
      marker.current = new kakao.maps.CustomOverlay({ position: latLng, content: '' });
      marker.current.setMap(map.current);
    }
    marker.current.setPosition(latLng);
    marker.current.setContent(
      `<div class="me" style="transform: rotate(${heading ?? 0}deg)">➤</div>`,
    );
    map.current.panTo(latLng);
  }, [position, heading]);

  return <div ref={container} className="map" />;
}
