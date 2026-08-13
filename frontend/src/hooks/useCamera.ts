/**
 * 후면 카메라 프리뷰.
 *
 * 카메라를 못 켜도 안내 자체는 계속돼야 한다. 실패하면 배경만 비고 화살표는 그대로 뜬다.
 * (권한 거부, 데스크톱에 카메라 없음, HTTPS 아님 등)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'starting' | 'ready' | 'denied' | 'unavailable';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (streamRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      setError('이 브라우저는 카메라를 지원하지 않는다. HTTPS 또는 localhost 인지 확인해라.');
      return;
    }

    setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // 후면 카메라 우선. 없으면 브라우저가 알아서 다른 카메라를 준다.
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus('ready');
      setError(null);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'NotAllowedError') {
        setStatus('denied');
        setError('카메라 권한이 거부됐다. 주소창의 권한 설정에서 허용해라.');
      } else if (name === 'NotFoundError') {
        setStatus('unavailable');
        setError('사용 가능한 카메라가 없다 (데스크톱에서는 정상이다).');
      } else {
        setStatus('unavailable');
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
  }, []);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  return { videoRef, status, error, start, stop };
}

/**
 * iOS Safari는 DeviceOrientationEvent 권한을 사용자 제스처 안에서만 요청할 수 있다.
 * 반드시 버튼 클릭 핸들러 안에서 호출해야 한다 (스펙 4장).
 */
export async function requestOrientationPermission(): Promise<boolean> {
  const anyEvent = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };

  // iOS 13+ 가 아니면 requestPermission 자체가 없다. 그 경우 그냥 이벤트가 온다.
  if (typeof anyEvent.requestPermission !== 'function') return true;

  try {
    return (await anyEvent.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}
