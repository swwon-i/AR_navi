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
}

/** 카메라 화면 위에 얹는 방향 안내. */
export function ArrowOverlay({
  delta,
  instruction,
  distanceToTurn,
  nextTurnDirection,
  headingSource,
}: Props) {
  if (delta === null || instruction === null) {
    return (
      <div className="overlay">
        <p className="overlay-hint">위치를 잡는 중…</p>
      </div>
    );
  }

  const off = isOffCourse(instruction);

  return (
    <div className="overlay">
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

      <div className="instruction">
        <strong>{instructionLabel(instruction)}</strong>
        {distanceToTurn !== null && nextTurnDirection && (
          <span className="next-turn">
            {distanceToTurn}m 앞 {nextTurnDirection === 'left' ? '좌' : '우'}회전
          </span>
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
