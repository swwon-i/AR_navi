package com.arnavi.route;

import com.arnavi.route.dto.RouteResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/route")
public class RouteController {

    private final KakaoRouteClient kakaoRouteClient;

    public RouteController(KakaoRouteClient kakaoRouteClient) {
        this.kakaoRouteClient = kakaoRouteClient;
    }

    /**
     * 도보 경로를 조회한다. 좌표는 WGS84.
     *
     * <pre>
     * GET /api/route?startX=127.0276&startY=37.4979&endX=127.0363&endY=37.5006
     * </pre>
     */
    @GetMapping
    public RouteResponse findRoute(
            @RequestParam double startX,
            @RequestParam double startY,
            @RequestParam double endX,
            @RequestParam double endY
    ) {
        return kakaoRouteClient.findWalkingRoute(startX, startY, endX, endY);
    }
}
