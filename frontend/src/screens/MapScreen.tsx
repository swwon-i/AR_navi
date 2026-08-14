import { RouteMap } from '../components/RouteMap';
import type { Point, Turn } from '../lib/geo';
import type { Place } from '../lib/places';
import type { Route } from '../lib/route';

interface Props {
  route: Route;
  turns: Turn[];
  origin: Place | null;
  destination: Place | null;
  position: Point | null;
  heading: number | null;
  onBack: () => void;
  onStart: () => void;
}

/** 경로 확인 화면. 전체 경로를 2D 지도로 보여주고 주행 화면으로 넘어간다. */
export function MapScreen({
  route,
  turns,
  origin,
  destination,
  position,
  heading,
  onBack,
  onStart,
}: Props) {
  const minutes = Math.max(1, Math.round(route.totalTime / 60));

  return (
    <div className="screen">
      <div className="stage">
        <RouteMap
          points={route.points}
          turns={turns}
          position={position}
          heading={heading}
          showEndpoints
        />
        <div className="route-badge">도보 {minutes}분</div>
      </div>

      <section className="route-summary">
        <div className="route-line">
          <span className="dot start" aria-hidden />
          <span className="text">{origin ? origin.name : '현재 위치'}</span>
        </div>
        <div className="route-line">
          <span className="dot end" aria-hidden />
          <span className="text">{destination?.name ?? '도착지'}</span>
        </div>

        <p className="route-meta">
          {route.totalDistance}m · 약 {minutes}분 · 회전 {turns.length}곳
        </p>

        <div className="route-actions">
          <button type="button" onClick={onBack}>다시 설정</button>
          <button type="button" className="primary" onClick={onStart}>
            길안내 시작
          </button>
        </div>
      </section>
    </div>
  );
}
