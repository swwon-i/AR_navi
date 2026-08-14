import type { Place } from '../lib/places';

interface Props {
  /** null 이면 "현재 위치" */
  origin: Place | null;
  destination: Place | null;
  /** 현재 위치를 아직 못 잡았으면 false. 출발지가 현재 위치일 때 안내를 띄운다 */
  hasCurrentPosition: boolean;
  loading: boolean;
  onEditOrigin: () => void;
  onEditDestination: () => void;
  onSwap: () => void;
  onSubmit: () => void;
}

/** 홈 화면. 출발지와 도착지를 정한다. */
export function HomeScreen({
  origin,
  destination,
  hasCurrentPosition,
  loading,
  onEditOrigin,
  onEditDestination,
  onSwap,
  onSubmit,
}: Props) {
  const originLabel = origin ? origin.name : '현재 위치';
  const ready = destination !== null && (origin !== null || hasCurrentPosition);

  return (
    <div className="home">
      <div className="home-hero">
        <h2>로드뷰로 확인하며 걷는 길찾기</h2>
        <p>실제 거리 풍경과 카메라 화면을 나란히 보며 방향을 확인한다</p>
      </div>

      <div className="fields">
        <div className="field-rows">
          <button type="button" className="field" onClick={onEditOrigin}>
            <span className="dot start" aria-hidden />
            <span className="label">출발</span>
            <span className={`value ${origin ? '' : 'muted'}`}>{originLabel}</span>
          </button>

          <button type="button" className="field" onClick={onEditDestination}>
            <span className="dot end" aria-hidden />
            <span className="label">도착</span>
            <span className={`value ${destination ? '' : 'placeholder'}`}>
              {destination ? destination.name : '어디로 갈까?'}
            </span>
          </button>
        </div>

        <button
          type="button"
          className="swap"
          onClick={onSwap}
          disabled={!destination}
          aria-label="출발지와 도착지 바꾸기"
        >
          ⇅
        </button>
      </div>

      {!origin && !hasCurrentPosition && (
        <p className="home-note">현재 위치를 잡는 중이다. 위치 권한을 허용했는지 확인해라.</p>
      )}

      <button type="button" className="primary" onClick={onSubmit} disabled={!ready || loading}>
        {loading ? '경로를 찾는 중…' : '길찾기'}
      </button>
    </div>
  );
}
