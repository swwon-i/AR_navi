package com.arnavi.route.dto;

import java.util.List;

/**
 * 프론트엔드로 내려주는 정규화된 경로.
 *
 * <p>카카오 응답을 그대로 넘기지 않고 아래 두 가지를 정리한다.
 * <ul>
 *   <li>legs/steps에 흩어진 좌표를 하나의 폴리라인으로 이어붙인다.
 *       회전 지점은 step 경계가 아니라 이 연속된 좌표열의 꺾임에서 나오기 때문이다
 *       (근거: 스펙 5장 M0 실측).</li>
 *   <li>step은 안내 문구 표시용으로만 남기고, 폴리라인 상의 시작 위치를
 *       {@code startIndex}로 참조하게 한다.</li>
 * </ul>
 *
 * @param totalDistance 총 거리(m)
 * @param totalTime     예상 소요 시간(초)
 * @param points        전체 폴리라인. 각 원소는 {@code [경도, 위도]} (카카오 응답 순서 유지)
 * @param steps         구간별 안내 정보
 */
public record RouteResponse(
        int totalDistance,
        int totalTime,
        List<double[]> points,
        List<Step> steps
) {
    /**
     * @param distance   구간 거리(m)
     * @param time       구간 소요 시간(초)
     * @param guidance   안내 문구. 랜드마크 서술이며 좌/우회전 정보는 없다
     * @param startIndex 이 구간이 시작되는 {@code points} 배열의 인덱스
     */
    public record Step(
            int distance,
            int time,
            String guidance,
            int startIndex
    ) {}
}
