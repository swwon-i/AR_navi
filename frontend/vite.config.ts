import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 컨테이너 안에서는 백엔드를 서비스 이름으로 찾고, 호스트에서 직접 돌릴 때는 localhost.
// docker-compose 가 BACKEND_URL 을 넘기지 않으므로 기본값이 양쪽 모두를 커버한다.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8081';

export default defineConfig({
  plugins: [react()],
  // .env 는 저장소 루트에 하나만 둔다 (백엔드의 REST_KEY 와 같은 파일).
  // VITE_ 접두사가 붙은 값만 브라우저로 노출되므로 REST_KEY 는 새어나가지 않는다.
  envDir: '..',
  server: {
    // 카카오 JS 키에 등록된 도메인과 반드시 일치시킬 것 (http://localhost:8080)
    port: 8080,
    strictPort: true,
    // 컨테이너 밖에서 접속하려면 0.0.0.0 에 바인드해야 한다.
    host: true,
    // 실기기 테스트용 터널 도메인을 허용한다. Vite 6 는 등록되지 않은 Host 헤더로 오는
    // 요청을 차단하므로(DNS 리바인딩 방어) 여기에 없으면 폰에서 접속이 막힌다.
    allowedHosts: ['localhost', '.ngrok-free.app', '.ngrok.app', '.trycloudflare.com'],
    watch: {
      // Windows 호스트 → Linux 컨테이너 바인드 마운트에서는 파일 변경 이벤트가
      // 전달되지 않는다. 폴링으로 바꿔야 HMR 이 동작한다.
      usePolling: true,
      interval: 300,
    },
    proxy: {
      // 같은 오리진으로 보이므로 브라우저 CORS 가 개입하지 않는다.
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
    },
  },
});
