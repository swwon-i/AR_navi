// 카카오맵 JS SDK는 공식 타입 정의를 제공하지 않는다.
// 사용하는 범위가 좁고 M3에서 로드뷰까지만 쓰므로 느슨하게 둔다.
declare const kakao: any;

interface Window {
  kakao: any;
}
