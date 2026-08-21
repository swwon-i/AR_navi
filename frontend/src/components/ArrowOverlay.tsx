import type { ArrivalPhase } from '../hooks/useGuidance';
import { instructionLabel, isOffCourse, type Instruction } from '../lib/guidance';

interface Props {
  /** 목표 방위각 − 진행 방향 (−180~180). 화살표 회전량 */
  delta: number | null;
  instruction: Instruction | null;
  /** 다음 회전까지 남은 거리(m) */
  distanceToTurn: number | null;
  nextTurnDirection: 'left' | 'right' | null;
  /** heading 소스. stale이면 안내 신뢰도가 낮다는 표시를 띄운다 */
  headingSource: 'trail' | 'compass' | 'stale' | null;
  /** 도착 단계. 'near'부터 회전 안내 대신 도착 예고를 보여준다 */
  arrival: ArrivalPhase;
  /** 경로를 따라 남은 거리(m). 헤더의 "Xm 남음"과 같은 값이어야 한다 */
  remainingM: number | null;
}

/** 카메라 화면 위에 얹는 방향 안내. */
export function ArrowOverlay({
  delta,
  instruction,
  distanceToTurn,
  nextTurnDirection,
  headingSource,
  arrival,
  remainingM,
}: Props) {
  /*
   * 방향을 아직 모르면 화살표를 그릴 수 없다. 다만 도착 예고는 방향과 무관하므로
   * 이때도 보여준다 — 정지 상태라 방향이 안 잡히는 순간에 하필 도착 안내가 사라지면
   * "갑자기 끝"을 없애려는 목적이 그대로 무너진다.
   */
  const known = delta !== null && instruction !== null;
  if (!known && arrival === 'far') {
    return (
      <div className="overlay">
        <p className="overlay-hint">위치를 잡는 중…</p>
      </div>
    );
  }

  const off = instruction !== null && isOffCourse(instruction);

  return (
    <div className="overlay">
      {known && (
      <div className={`arrow ${off ? 'off' : 'ok'}`} style={{ transform: `rotate(${delta}deg)` }}>
        <svg viewBox="0 0 100 100" width="140" height="140" aria-hidden>
          <path
            d="M50 8 L82 74 L50 58 L18 74 Z"
            fill="currentColor"
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      )}

      {/*
        목적지가 가까우면 회전 안내 대신 도착 예고를 띄운다. 마지막 구간에서 남은
        회전을 알려봐야 쓸모가 없고, "갑자기 끝"으로 느껴지지 않게 하는 것이 목적이다.
      */}
      <div className="instruction">
        {arrival === 'far' && instruction !== null ? (
          <>
            <strong>{instructionLabel(instruction)}</strong>
            {distanceToTurn !== null && nextTurnDirection && (
              <span className="next-turn">
                {distanceToTurn}m 앞 {nextTurnDirection === 'left' ? '좌' : '우'}회전
              </span>
            )}
          </>
        ) : (
          <>
            <strong className="arriving">곧 도착</strong>
            {remainingM !== null && (
              <span className="next-turn">{Math.round(remainingM)}m 남음</span>
            )}
          </>
        )}
      </div>

      {headingSource === 'stale' && (
        <p className="overlay-warn">방향 정보를 갱신하지 못하는 중 — 잠시 걸어보라</p>
      )}
      {headingSource === 'compass' && (
        <p className="overlay-warn">나침반 기준 (정지 중) — 도심에서는 오차가 클 수 있다</p>
      )}
    </div>
  );
}
