interface Props {
  /** 경로 총 거리(m) */
  distanceM: number;
  /** 실제로 걸린 시간(초). 카카오 예상치가 아니라 주행 시작부터의 경과다 */
  elapsedSec: number;
  onFinish: () => void;
  onResume: () => void;
}

function formatDuration(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

/**
 * 도착 완료 표시.
 *
 * 화면을 갈아끼우지 않고 주행 화면 위에 얹는다. 도착 직후야말로 "저 건물이 맞나"를
 * 확인하고 싶은 순간이라, 뒤로 로드뷰가 계속 보여야 한다.
 *
 * 그래서 배경은 터치를 통과시키고(styles.css) 카드만 이벤트를 받는다. 뒤의 로드뷰를
 * 드래그해 둘러볼 수 있어야 하기 때문이다. 카드를 아래쪽에 두는 것도 같은 이유다 —
 * 위쪽 절반이 로드뷰다.
 *
 * 목적지 이름은 넣지 않는다. 방금 그 자리에 서 있는 사람에게 어디에 왔는지 알려줄
 * 이유가 없다.
 *
 * "재안내"가 있는 이유는 판정이 어긋났을 때 빠져나올 수단이 필요하기 때문이다.
 * 없으면 경로를 다시 조회해야 하는데 도보 경로 API 는 하루 1,000건 제한이 있다.
 */
export function DoneScreen({ distanceM, elapsedSec, onFinish, onResume }: Props) {
  return (
    <div className="done-layer">
      <div className="done-card">
        <p className="done-title">도착!!</p>
        <p className="done-stats">
          {distanceM}m · {formatDuration(elapsedSec)}
        </p>

        <div className="route-actions">
          <button type="button" onClick={onFinish}>안내 종료</button>
          <button type="button" className="primary" onClick={onResume}>재안내</button>
        </div>
      </div>
    </div>
  );
}
