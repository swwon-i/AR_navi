package com.arnavi.place;

import com.arnavi.place.dto.PlaceResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/places")
public class PlaceController {

    private final KakaoPlaceClient kakaoPlaceClient;

    public PlaceController(KakaoPlaceClient kakaoPlaceClient) {
        this.kakaoPlaceClient = kakaoPlaceClient;
    }

    /**
     * 키워드로 장소를 검색한다.
     *
     * <pre>
     * GET /api/places?query=스타벅스&amp;x=127.0219&amp;y=37.5205
     * </pre>
     *
     * @param x 기준 경도. 함께 주면 가까운 순으로 정렬된다
     * @param y 기준 위도
     */
    @GetMapping
    public PlaceResponse search(
            @RequestParam String query,
            @RequestParam(required = false) Double x,
            @RequestParam(required = false) Double y
    ) {
        double[] origin = (x != null && y != null) ? new double[] { x, y } : null;
        return kakaoPlaceClient.search(query, origin);
    }
}
