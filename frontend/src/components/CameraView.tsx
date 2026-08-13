import type { MutableRefObject } from 'react';
import type { CameraStatus } from '../hooks/useCamera';

interface Props {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
}

/**
 * 카메라 프리뷰 배경.
 *
 * 카메라를 못 켠 경우에도 레이아웃은 그대로 유지한다. 위에 얹힌 화살표 안내는
 * 카메라와 무관하게 동작해야 하기 때문이다.
 */
export function CameraView({ videoRef, status, error }: Props) {
  return (
    <div className="camera">
      <video ref={videoRef} playsInline muted autoPlay className="camera-video" />
      {status !== 'ready' && (
        <div className="camera-fallback">
          {status === 'starting' && <p>카메라를 켜는 중…</p>}
          {status === 'idle' && <p>체험을 시작하면 카메라가 켜진다</p>}
          {(status === 'denied' || status === 'unavailable') && (
            <p className="muted">{error}<br />카메라 없이도 방향 안내는 계속된다.</p>
          )}
        </div>
      )}
    </div>
  );
}
