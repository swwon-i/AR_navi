package com.arnavi.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/**
 * 프론트엔드가 원인을 알 수 있는 형태로 오류를 내려준다.
 *
 * <p>이전에는 카카오가 400을 주든 키가 만료되든 전부 스택트레이스와 함께 500 으로만
 * 나가서, 화면에서는 "HTTP 500"밖에 볼 수 없었다.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(KakaoApiException.class)
    public ResponseEntity<Map<String, Object>> handleKakao(KakaoApiException e) {
        log.error("{}", e.getMessage());

        // 카카오가 준 상태코드를 그대로 흘리지 않는다. 우리 API 입장에서는
        // 상류 서비스 오류이므로 502 가 맞다.
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of(
                "error", "kakao_api_error",
                "upstreamStatus", e.getStatus().value(),
                "message", e.getBody()
        ));
    }
}
