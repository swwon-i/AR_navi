import { useState, type FormEvent } from 'react';
import { searchPlaces, type Place } from '../lib/places';
import type { Point } from '../lib/geo';

interface Props {
  /** 화면 상단 제목. "출발지 검색" / "도착지 검색" */
  title: string;
  /** 검색 기준 좌표(현재 위치). 있으면 가까운 순으로 정렬된다 */
  origin: Point | null;
  onSelect: (place: Place | null) => void;
  onClose: () => void;
}

/** 장소 검색 시트. */
export function PlaceSearch({ title, origin, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    try {
      setResults(await searchPlaces(query.trim(), origin));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sheet">
      <header className="sheet-head">
        <strong>{title}</strong>
        <button type="button" onClick={onClose}>닫기</button>
      </header>

      <form onSubmit={submit} className="search-form">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="장소명을 입력 (예: 까치산역)"
          autoFocus
        />
        <button type="submit" disabled={loading || !query.trim()}>
          {loading ? '…' : '검색'}
        </button>
      </form>

      {!origin && <p className="search-note">현재 위치를 아직 못 잡아 거리순 정렬은 생략된다</p>}
      {error && <p className="search-error">{error}</p>}

      {results && (
        <ul className="search-results">
          {results.length === 0 && <li className="empty">검색 결과가 없다</li>}
          {results.map((place, i) => (
            <li key={`${place.name}-${i}`}>
              <button type="button" onClick={() => onSelect(place)}>
                <span className="name">{place.name}</span>
                {place.distance !== null && <span className="dist">{place.distance}m</span>}
                <span className="addr">{place.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
