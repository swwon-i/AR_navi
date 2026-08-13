package com.arnavi.place;

import com.arnavi.place.dto.PlaceResponse;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.ArrayList;
import java.util.List;

/**
 * 카카오 로컬 API(키워드 장소 검색) 클라이언트.
 *
 * <p>도보 경로 조회와 같은 REST 키를 쓰므로 마찬가지로 서버에서만 호출한다.
 */
@Component
public class KakaoPlaceClient {

    private static final int DEFAULT_SIZE = 10;

    private final RestClient restClient;
    private final String restKey;
    private final String searchUrl;

    public KakaoPlaceClient(RestClient restClient,
                            @Value("${kakao.rest-key}") String restKey,
                            @Value("${kakao.place-search-url}") String searchUrl) {
        this.restClient = restClient;
        this.restKey = restKey;
        this.searchUrl = searchUrl;
    }

    /**
     * @param query  검색어
     * @param origin 기준 좌표 {@code [경도, 위도]}. 주어지면 가까운 순으로 정렬된다. null 가능
     */
    public PlaceResponse search(String query, double[] origin) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(searchUrl)
                .queryParam("query", query)
                .queryParam("size", DEFAULT_SIZE);

        // 기준 좌표가 있으면 거리순 정렬. 사용자는 대개 자기 근처를 찾는다.
        if (origin != null) {
            builder.queryParam("x", origin[0])
                    .queryParam("y", origin[1])
                    .queryParam("sort", "distance");
        }

        // 검색어에 한글·공백이 들어오므로 반드시 인코딩한다.
        // build(true) 는 "이미 인코딩된 값"이라는 뜻이라 여기서는 쓰면 안 된다.
        JsonNode body = restClient.get()
                .uri(builder.build().encode().toUri())
                .header(HttpHeaders.AUTHORIZATION, "KakaoAK " + restKey)
                .retrieve()
                .body(JsonNode.class);

        List<PlaceResponse.Place> places = new ArrayList<>();
        for (JsonNode document : body.path("documents")) {
            String roadAddress = document.path("road_address_name").asText("");
            String distance = document.path("distance").asText("");

            places.add(new PlaceResponse.Place(
                    document.path("place_name").asText(),
                    document.path("category_group_name").asText(""),
                    roadAddress.isBlank() ? document.path("address_name").asText("") : roadAddress,
                    document.path("x").asDouble(),
                    document.path("y").asDouble(),
                    distance.isBlank() ? null : Integer.valueOf(distance)
            ));
        }

        return new PlaceResponse(places);
    }
}
