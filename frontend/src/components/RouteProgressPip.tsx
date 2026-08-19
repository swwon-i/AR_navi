import { useMemo } from 'react';
import { traveledPath, type Point, type RouteProgress } from '../lib/geo';

interface Props {
  points: Point[];
  /** 현재 위치를 경로 위로 투영한 좌표. GPS 원본을 쓰면 점이 경로 밖에서 떠다닌다 */
  snapped: Point | null;
  /** 투영 구간의 시작 인덱스. 지나온 구간을 어디서 끊을지 정한다 */
  snappedIndex: number | null;
  progress: RouteProgress | null;
  onExpand: () => void;
}

/** SVG 뷰박스. 정사각형으로 두고 경로 종횡비는 안에서 맞춘다 */
const BOX = 100;
/** 선 굵기와 현재 위치 점이 잘리지 않도록 두는 여백 */
const PAD = 10;

type XY = [number, number];

/**
 * 위경도를 뷰박스 좌표로 펴는 변환을 만든다.
 *
 * 수백 m 범위라 등장방형 근사로 충분하다. 경도에 cos(위도) 를 곱해 가로 왜곡만
 * 잡아주면 눈으로 보는 경로 모양이 실제와 일치한다.
 *
 * 가로/세로 중 긴 쪽으로 배율을 정해 종횡비를 유지한다. 각각 따로 늘리면 직선
 * 구간이 비스듬해 보여 경로 모양을 알아볼 수 없다.
 *
 * 함수를 돌려주는 이유는 현재 위치 점이 경로와 반드시 같은 변환을 써야 하기
 * 때문이다. 따로 계산하면 점이 선에서 미세하게 떠 보인다.
 */
function makeProjector(points: Point[]): (p: Point) => XY {
  const lonScale = Math.cos((points[0][1] * Math.PI) / 180);

  const xs = points.map((p) => p[0] * lonScale);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = (BOX - PAD * 2) / span;

  // 짧은 쪽은 남는 공간의 절반만큼 밀어 가운데 놓는다
  const offsetX = (BOX - (maxX - minX) * scale) / 2;
  const offsetY = (BOX - (maxY - minY) * scale) / 2;

  return ([lng, lat]) => [
    (lng * lonScale - minX) * scale + offsetX,
    // SVG 는 y 가 아래로 자라므로 뒤집는다. 안 하면 경로가 남북 반전된다
    BOX - ((lat - minY) * scale + offsetY),
  ];
}

function toPath(coords: XY[]): string {
  return coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
}

/**
 * 주행 화면 우측 상단의 진행 상황 미니맵.
 *
 * 카카오 지도를 띄우지 않고 경로 좌표만으로 그린다. 카메라와 로드뷰가 이미 돌고
 * 있는 위에 지도 인스턴스를 하나 더 얹으면 폰에서 부담이 크고, 크기가 바뀔 때마다
 * relayout 을 관리해야 한다. 이 크기에서는 지도 타일이 어차피 읽히지 않고, 필요한
 * 정보는 "경로 모양과 내가 그 위 어디쯤"이 전부다.
 */
export function RouteProgressPip({ points, snapped, snappedIndex, progress, onExpand }: Props) {
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const project = makeProjector(points);
    return { project, coords: points.map(project) };
  }, [points]);

  if (!geometry) return null;
  const { project, coords } = geometry;

  const me = snapped ? project(snapped) : null;
  const walkedPath =
    snapped && snappedIndex !== null
      ? toPath(traveledPath(points, snappedIndex, snapped).map(project))
      : null;

  const end = coords[coords.length - 1];

  return (
    <button type="button" className="pip" onClick={onExpand} aria-label="전체 경로 보기">
      <svg viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden>
        <path className="pip-route" d={toPath(coords)} />
        {walkedPath && <path className="pip-walked" d={walkedPath} />}
        <circle className="pip-end" cx={end[0]} cy={end[1]} r="4" />
        {me && <circle className="pip-me" cx={me[0]} cy={me[1]} r="5" />}
      </svg>

      <span className="pip-label">
        {progress
          ? `${Math.round(progress.traveledM)} / ${Math.round(progress.totalM)}m`
          : '위치 확인 중'}
      </span>
    </button>
  );
}
