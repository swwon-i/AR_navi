import type { MutableRefObject } from 'react';
import { ArrowOverlay } from '../components/ArrowOverlay';
import { CameraView } from '../components/CameraView';
import { RoadviewPanel } from '../components/RoadviewPanel';
import type { CameraStatus } from '../hooks/useCamera';
import type { Guidance } from '../hooks/useGuidance';
import type { Point } from '../lib/geo';
import type { Place } from '../lib/places';

/** 이 거리 이상 벗어나면 경로 이탈로 본다. GPS 오차보다 충분히 커야 한다 */
const OFF_ROUTE_M = 40;

interface Props {
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
  guidance,
  position,
  heading,
  headingSource,
  destination,
  camera,
  onBack,
}: Props) {
  return (
    <div className="screen">
      <header className="walk-head">
        <button type="button" onClick={onBack}>← 경로</button>
        <span className="walk-dest">{destination?.name ?? '주행 중'}</span>
        <span className="walk-remain">
          {guidance.remaining !== null ? `${guidance.remaining}m 남음` : ''}
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
            {/*
              GPS 원본이 아니라 경로 위로 투영한 좌표를 넘긴다. 원본을 쓰면 도심
              GPS 오차(±10~20m)로 평행한 옆 골목 파노라마가 잡혀, 걷는 길과 다른
              풍경이 뜬다.
            */}
            <RoadviewPanel
              position={guidance.snapped ?? position}
              targetBearing={guidance.target}
              distanceToTurn={guidance.distanceToTurn}
            />
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
