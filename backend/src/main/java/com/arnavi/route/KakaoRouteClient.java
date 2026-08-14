package com.arnavi.route;

import com.arnavi.common.KakaoApiException;
import com.arnavi.route.dto.RouteResponse;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 카카오 도보 경로 조회 API 클라이언트.
 *
 * <p>REST 키는 이 계층 밖으로 나가지 않는다. 프론트엔드는 백엔드의 {@code /api/route}만 호출한다.
 */
@Component
public class KakaoRouteClient {

    private static final Logger log = LoggerFactory.getLogger(KakaoRouteClient.class);

    /** 동일 좌표로 간주할 거리(m). 카카오 응답에는 step 경계에서 중복점이 섞여 있다. */
    private static final double DUPLICATE_THRESHOLD_M = 0.5;

    private final RestClient restClient;
    private final String restKey;
    private final String walkUrl;

    public KakaoRouteClient(RestClient restClient,
                            @Value("${kakao.rest-key}") String restKey,
                            @Value("${kakao.walk-url}") String walkUrl) {
        this.restClient = restClient;
        this.restKey = restKey;
        this.walkUrl = walkUrl;
        if (restKey == null || restKey.isBlank()) {
            log.warn("REST_KEY가 비어 있다. 저장소 루트 .env 에 REST_KEY=... 를 넣어라.");
        }
    }

    public RouteResponse findWalkingRoute(double startX, double startY, double endX, double endY) {
        String uri = UriComponentsBuilder.fromUriString(walkUrl)
                .queryParam("start_x", startX)
                .queryParam("start_y", startY)
                .queryParam("end_x", endX)
                .queryParam("end_y", endY)
                .queryParam("input_coord", "WGS84")
                .queryParam("output_coord", "WGS84")
                .queryParam("route_mode", "BROAD_FIRST")
                .toUriString();

        JsonNode body = restClient.get()
                .uri(uri)
                .header(HttpHeaders.AUTHORIZATION, "KakaoAK " + restKey)
                .retrieve()
                .onStatus(HttpStatusCode::isError, (request, response) -> {
                    // 응답 본문에 실제 원인이 담겨 있다. 이것 없이는 "400"만 남는다.
                    String errorBody = new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8);
                    throw new KakaoApiException("도보 경로 조회", response.getStatusCode(), errorBody);
                })
                .body(JsonNode.class);

        return normalize(body);
    }

    /** 카카오 응답을 폴리라인 + step 목록으로 정규화한다. */
    private RouteResponse normalize(JsonNode body) {
        JsonNode route = body.path("route");
        JsonNode properties = route.path("properties");

        List<double[]> points = new ArrayList<>();
        List<RouteResponse.Step> steps = new ArrayList<>();

        for (JsonNode leg : route.path("legs")) {
            for (JsonNode step : leg.path("steps")) {
                int startIndex = points.size();

                for (JsonNode point : step.path("path").path("points")) {
                    double[] coordinate = { point.get(0).asDouble(), point.get(1).asDouble() };
                    if (points.isEmpty()
                            || distanceMeters(points.get(points.size() - 1), coordinate) > DUPLICATE_THRESHOLD_M) {
                        points.add(coordinate);
                    }
                }

                JsonNode stepProperties = step.path("properties");
                steps.add(new RouteResponse.Step(
                        stepProperties.path("distance").asInt(),
                        stepProperties.path("time").asInt(),
                        stepProperties.path("guidance").asText(),
                        Math.min(startIndex, Math.max(points.size() - 1, 0))
                ));
            }
        }

        return new RouteResponse(
                properties.path("totalDistance").asInt(),
                properties.path("totalTime").asInt(),
                points,
                steps
        );
    }

    /** Haversine. 좌표는 {@code [경도, 위도]} 순서다. */
    private static double distanceMeters(double[] a, double[] b) {
        final double earthRadius = 6_371_000;
        double lat1 = Math.toRadians(a[1]);
        double lat2 = Math.toRadians(b[1]);
        double deltaLat = lat2 - lat1;
        double deltaLon = Math.toRadians(b[0] - a[0]);

        double h = Math.pow(Math.sin(deltaLat / 2), 2)
                + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(deltaLon / 2), 2);
        return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }
}
