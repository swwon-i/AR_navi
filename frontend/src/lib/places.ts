/**
 * 장소 검색 클라이언트.
 *
 * 카카오 로컬 API는 REST 키가 필요하므로 백엔드를 거친다.
 */

import type { Point } from './geo';

export interface Place {
  name: string;
  category: string;
  address: string;
  x: number;
  y: number;
  /** 검색 기준 좌표로부터의 거리(m). 기준 좌표를 주지 않으면 null */
  distance: number | null;
}

export function placePoint(place: Place): Point {
  return [place.x, place.y];
}

/**
 * @param origin 기준 좌표. 주면 가까운 순으로 정렬된다
 */
export async function searchPlaces(query: string, origin: Point | null): Promise<Place[]> {
  const params = new URLSearchParams({ query });
  if (origin) {
    params.set('x', String(origin[0]));
    params.set('y', String(origin[1]));
  }

  const response = await fetch(`/api/places?${params}`);
  if (!response.ok) {
    throw new Error(`장소 검색 실패 (HTTP ${response.status})`);
  }
  const body: { places: Place[] } = await response.json();
  return body.places;
}
