import type { Place } from '../lib/places';

interface Props {
  destination: Place | null;
  /** 현재 위치를 잡았는지. 출발지는 항상 현재 위치이므로 이게 없으면 길찾기가 불가능하다 */
  hasCurrentPosition: boolean;
  loading: boolean;
  onEditDestination: () => void;
  onSubmit: () => void;
}

/**
 * 홈 화면. 목적지만 정한다.
 *
 * 출발지는 언제나 현재 위치다. 이 앱의 가치는 실제로 그 자리에 서서 카메라와 로드뷰를
 * 대조하는 데서 나오므로, 경로 위에 있지 않은 상태를 만들 수 있게 열어둘 이유가 없다.
 */
export function HomeScreen({
  destination,
  hasCurrentPosition,
  loading,
  onEditDestination,
  onSubmit,
}: Props) {
  const ready = destination !== null && hasCurrentPosition;

  return (
    <div className="home">
      <div className="home-hero">
        <h2>로드뷰로 확인하며 걷는 길찾기</h2>
        <p>실제 거리 풍경과 카메라 화면을 나란히 보며 방향을 확인한다</p>
      </div>

      <div className="field-rows">
        <div className="field static">
          <span className="dot start" aria-hidden />
          <span className="label">출발</span>
          <span className={`value ${hasCurrentPosition ? 'muted' : 'placeholder'}`}>
            {hasCurrentPosition ? '현재 위치' : '위치를 잡는 중…'}
          </span>
        </div>

        <button type="button" className="field" onClick={onEditDestination}>
          <span className="dot end" aria-hidden />
          <span className="label">도착</span>
          <span className={`value ${destination ? '' : 'placeholder'}`}>
            {destination ? destination.name : '어디로 갈까?'}
          </span>
        </button>
      </div>

      {!hasCurrentPosition && (
        <p className="home-note">
          위치 권한을 허용해야 길찾기를 시작할 수 있다. 실내에서는 위치를 잡는 데
          시간이 걸릴 수 있다.
        </p>
      )}

      <button type="button" className="primary" onClick={onSubmit} disabled={!ready || loading}>
        {loading ? '경로를 찾는 중…' : '길찾기'}
      </button>
    </div>
  );
}
