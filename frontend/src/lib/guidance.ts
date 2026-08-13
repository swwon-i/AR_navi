/**
 * 방위각 차이를 사용자가 읽을 안내로 바꾼다.
 *
 * 임계값을 그냥 비교하면 경계 근처에서 값이 오갈 때(44°/46°/44°) 문구가 초당 몇 번씩
 * 바뀐다. 밴드를 벗어날 때와 돌아올 때의 기준을 다르게 둬서(히스테리시스) 이를 막는다.
 */

export type Instruction =
  | 'straight'
  | 'slight-left'
  | 'slight-right'
  | 'left'
  | 'right'
  | 'around';

/** 각 밴드의 상한(도). 절댓값 기준 */
const BOUNDS = {
  straight: 20,
  slight: 50,
  turn: 135,
} as const;

/** 밴드를 바꾸려면 경계를 이만큼 넘어서야 한다. 되돌아올 때도 같은 폭이 필요하다. */
const HYSTERESIS_DEG = 8;

function bandOf(abs: number): 'straight' | 'slight' | 'turn' | 'around' {
  if (abs <= BOUNDS.straight) return 'straight';
  if (abs <= BOUNDS.slight) return 'slight';
  if (abs <= BOUNDS.turn) return 'turn';
  return 'around';
}

function bandOfInstruction(instruction: Instruction) {
  switch (instruction) {
    case 'straight': return 'straight' as const;
    case 'slight-left':
    case 'slight-right': return 'slight' as const;
    case 'left':
    case 'right': return 'turn' as const;
    case 'around': return 'around' as const;
  }
}

const ORDER = ['straight', 'slight', 'turn', 'around'] as const;

/**
 * @param delta   목표 방위각 − 현재 진행 방향 (−180~180). 양수면 오른쪽
 * @param previous 직전 안내. 없으면 히스테리시스 없이 판정한다
 */
export function resolveInstruction(delta: number, previous: Instruction | null): Instruction {
  const abs = Math.abs(delta);
  let band = bandOf(abs);

  if (previous) {
    const previousBand = bandOfInstruction(previous);
    // 밴드를 옮기려면 경계를 히스테리시스만큼 확실히 넘어야 한다.
    if (band !== previousBand) {
      const movingUp = ORDER.indexOf(band) > ORDER.indexOf(previousBand);
      const boundary = movingUp
        ? boundaryAbove(previousBand)
        : boundaryBelow(previousBand);

      if (boundary !== null) {
        const cleared = movingUp
          ? abs > boundary + HYSTERESIS_DEG
          : abs < boundary - HYSTERESIS_DEG;
        if (!cleared) band = previousBand;
      }
    }
  }

  if (band === 'straight') return 'straight';
  if (band === 'around') return 'around';
  const right = delta > 0;
  if (band === 'slight') return right ? 'slight-right' : 'slight-left';
  return right ? 'right' : 'left';
}

function boundaryAbove(band: 'straight' | 'slight' | 'turn' | 'around'): number | null {
  if (band === 'straight') return BOUNDS.straight;
  if (band === 'slight') return BOUNDS.slight;
  if (band === 'turn') return BOUNDS.turn;
  return null;
}

function boundaryBelow(band: 'straight' | 'slight' | 'turn' | 'around'): number | null {
  if (band === 'around') return BOUNDS.turn;
  if (band === 'turn') return BOUNDS.slight;
  if (band === 'slight') return BOUNDS.straight;
  return null;
}

const LABELS: Record<Instruction, string> = {
  straight: '직진',
  'slight-left': '왼쪽으로 조금',
  'slight-right': '오른쪽으로 조금',
  left: '왼쪽으로 도세요',
  right: '오른쪽으로 도세요',
  around: '뒤로 도세요',
};

export function instructionLabel(instruction: Instruction): string {
  return LABELS[instruction];
}

/** 화살표가 정상 범위인지. 오차가 크면 색으로 경고한다. */
export function isOffCourse(instruction: Instruction): boolean {
  return instruction === 'left' || instruction === 'right' || instruction === 'around';
}
