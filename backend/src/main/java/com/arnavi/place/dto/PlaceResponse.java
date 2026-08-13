package com.arnavi.place.dto;

import java.util.List;

/**
 * 장소 검색 결과.
 *
 * @param places 거리순으로 정렬된 검색 결과
 */
public record PlaceResponse(List<Place> places) {

    /**
     * @param name     장소명
     * @param category 카테고리 (예: "음식점 > 카페")
     * @param address  도로명 주소. 없으면 지번 주소
     * @param x        경도(WGS84)
     * @param y        위도(WGS84)
     * @param distance 검색 기준 좌표로부터의 거리(m). 기준 좌표가 없으면 null
     */
    public record Place(
            String name,
            String category,
            String address,
            double x,
            double y,
            Integer distance
    ) {}
}
