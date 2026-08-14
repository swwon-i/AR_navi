package com.arnavi.common;

import org.springframework.http.HttpStatusCode;

/**
 * 카카오 API 호출이 실패했을 때 던진다.
 *
 * <p>기본 RestClient 예외는 응답 본문을 메시지에 담지 않아 "400 Bad Request"만 남는다.
 * 원인 파악에 필요한 건 카카오가 돌려준 본문이므로 그것을 함께 보관한다.
 */
public class KakaoApiException extends RuntimeException {

    private final HttpStatusCode status;
    private final String body;

    public KakaoApiException(String api, HttpStatusCode status, String body) {
        super("카카오 %s 호출 실패: %s / 응답: %s".formatted(api, status, body));
        this.status = status;
        this.body = body;
    }

    public HttpStatusCode getStatus() {
        return status;
    }

    public String getBody() {
        return body;
    }
}
