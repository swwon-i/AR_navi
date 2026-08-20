import { useState, type MutableRefObject } from 'react';
import { ArrowOverlay } from '../components/ArrowOverlay';
import { CameraView } from '../components/CameraView';
import { RoadviewPanel } from '../components/RoadviewPanel';
import { RouteMap } from '../components/RouteMap';
import { RouteProgressPip } from '../components/RouteProgressPip';
import type { CameraStatus } from '../hooks/useCamera';
import type { Guidance } from '../hooks/useGuidance';
import { traveledPath, type Point } from '../lib/geo';
import type { Place } from '../lib/places';
import type { Route } from '../lib/route';

/** 이 거리 이상 벗어나면 경로 이탈로 본다. GPS 오차보다 충분히 커야 한다 */
const OFF_ROUTE_M = 40;

interface Props {
  route: Route;
  guidance: Guidance;
  position: Point | null;
  heading: number | null;
  headingSource: 'trail' | 'compass' | 'stale' | null;
  destination: Place | null;
  camera: {
    videoRef: MutableRefObject<HTMLVideoElement | null>;
    status: CameraStatus;
    error: string | null;
  };
  onBack: () => void;
}

/**
 * 주행 화면.
 *
 * 위 = 여기서 보여야 할 풍경(로드뷰), 아래 = 지금 보이는 풍경(카메라).
 * 대조를 사용자 머릿속이 아니라 화면에서 하게 만드는 구성이다.
 */
export function WalkScreen({
  route,
  guidance,
  position,
  heading,
  headingSource,
  destination,
  camera,
  onBack,
}: Props) {
  // 지도를 펼쳐도 아래쪽 카메라·화살표는 그대로 두어 안내가 끊기지 않게 한다.
  const [mapOpen, setMapOpen] = useState(false);

  return (
    <div className="screen">
      <header className="walk-head">
        <button type="button" onClick={onBack}>← 경로</button>
        <span className="walk-dest">{destination?.name ?? '주행 중'}</span>
        {/* 직선거리가 아니라 경로를 따라 남은 거리다. 길이 꺾이면 둘이 크게 다르다 */}
        <span className="walk-remain">
          {guidance.progress !== null ? `${Math.round(guidance.progress.remainingM)}m 남음` : ''}
        </span>
      </header>

      {guidance.offRouteM !== null && guidance.offRouteM > OFF_ROUTE_M && (
        <div className="banner warn">
          경로에서 {guidance.offRouteM}m 벗어나 있다 — 로드뷰는 가장 가까운 경로 지점을 보여준다
        </div>
      )}

      <div className="stage">
        <div className="split">
          <div className="split-top">
            {mapOpen ? (
              <>
                {/*
                  전체 경로 중 어디쯤인지 보려는 것이므로 현재 위치를 따라가지 않는다.
                  회전 핀도 이 크기에서는 과해서 끈다.
                */}
                <RouteMap
                  points={route.points}
                  turns={guidance.turns}
                  position={guidance.snapped ?? position}
                  traveled={
                    guidance.snapped && guidance.snappedIndex !== null
                      ? traveledPath(route.points, guidance.snappedIndex, guidance.snapped)
                      : null
                  }
                  followPosition={false}
                  showTurns={false}
                  showEndpoints
                />
                <div className="map-progress">
                  {guidance.progress !== null &&
                    `${Math.round(guidance.progress.traveledM)} / ` +
                    `${Math.round(guidance.progress.totalM)}m · ` +
                    `${Math.round(guidance.progress.ratio * 100)}%`}
                </div>
                <button type="button" className="map-close" onClick={() => setMapOpen(false)}>
                  닫기
                </button>
              </>
            ) : (
              <>
                {/*
                  경로를 따라 조금 앞선 지점을 넘긴다. 지금 자리를 띄우면 이미 눈으로
                  본 장면이라 대조할 것이 없다.

                  GPS 원본이 아니라 경로 위 좌표라는 점도 중요하다. 원본을 쓰면 도심
                  GPS 오차(±10~20m)로 평행한 옆 골목 파노라마가 잡혀, 걷는 길과 다른
                  풍경이 뜬다.
                */}
                <RoadviewPanel
                  position={guidance.lookahead ?? guidance.snapped ?? position}
                  targetBearing={guidance.target}
                  marker={guidance.marker}
                  distanceToTurn={guidance.distanceToTurn}
                />
                <RouteProgressPip
                  points={route.points}
                  snapped={guidance.snapped}
                  snappedIndex={guidance.snappedIndex}
                  progress={guidance.progress}
                  onExpand={() => setMapOpen(true)}
                />
              </>
            )}
          </div>
          <div className="split-bottom">
            <CameraView videoRef={camera.videoRef} status={camera.status} error={camera.error} />
            <ArrowOverlay
              delta={guidance.delta}
              instruction={guidance.instruction}
              distanceToTurn={guidance.distanceToTurn}
              nextTurnDirection={guidance.upcoming?.direction ?? null}
              headingSource={headingSource}
            />
          </div>
        </div>
      </div>

      <section className="info">
        <p>
          진행방향 {heading === null ? '—' : `${Math.round(heading)}°`}
          <span className="src">({headingSource ?? '없음'})</span>
          {guidance.target !== null && <> {' → '}목표 {Math.round(guidance.target)}°</>}
          {guidance.delta !== null && (
            <strong className={Math.abs(guidance.delta) > 50 ? 'off' : 'ok'}>
              {' '}차이 {Math.round(guidance.delta)}°
            </strong>
          )}
          {guidance.offRouteM !== null && (
            <span className="src">· 경로에서 {guidance.offRouteM}m</span>
          )}
        </p>
      </section>
    </div>
  );
}
