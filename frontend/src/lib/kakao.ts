/**
 * 카카오맵 SDK 로더.
 *
 * autoload=false + kakao.maps.load 로 준비 완료를 보장한다. 스크립트 onload 시점에는
 * kakao.maps가 아직 없을 수 있다 (M0 스파이크에서 확인).
 */

let loading: Promise<void> | null = null;

export function loadKakaoSdk(): Promise<void> {
  if (loading) return loading;

  const key = import.meta.env.VITE_KAKAO_JS_KEY;
  if (!key) {
    return Promise.reject(
      new Error('VITE_KAKAO_JS_KEY 없음. 저장소 루트 .env 에 추가해라.'),
    );
  }

  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () =>
      reject(
        new Error(
          'SDK 로드 실패. 키가 틀렸거나 도메인 미등록(401) 또는 카카오맵 제품 비활성(403)이다.',
        ),
      );
    document.head.appendChild(script);
  });

  return loading;
}
