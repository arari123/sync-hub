# PRD: 보안/운영 하드닝 (문서/관리자 API, 안건 HTML, 다운로드) (2026-02-15)

## 문제
1. 관리자용 API(`/api/admin/*`)가 인증/권한 없이 노출되어 있어, 검색 디버그 정보 노출 및 dedup 정책 변경(ignored/primary 지정) 같은 고위험 동작이 누구나 가능하다.
2. 문서 API(`/documents/*`)가 인증 없이 사용 가능하고, 업로드 저장 경로가 원본 파일명 기반이라 경로 탈출/덮어쓰기 위험이 있다. 또한 문서 상세 응답에서 서버 내부 파일 경로 등 민감 정보가 노출될 수 있다.
3. 안건 본문 HTML을 그대로 저장하고 `dangerouslySetInnerHTML`로 렌더링하여 XSS 위험이 있다.
   - 단, 리치 텍스트 기능(폰트 크기/색상/굵기, 표, 본문 사진첨부)은 유지되어야 한다.
4. 문서/첨부 다운로드가 `<a href>` 기반인 경우 Authorization 헤더가 붙지 않아(현재 Bearer 토큰 방식) 다운로드가 실패하거나(401) 인증 정책 변경 시 UI가 깨질 수 있다.

## 목표
1. 관리자용 API는 **관리자만** 접근 가능하도록 한다.
2. 문서 API는 **로그인 사용자만** 접근 가능하도록 하고, 업로드 저장을 안전화한다(경로 탈출/덮어쓰기/과다 업로드 방지).
3. 안건 HTML은 서버에서 **허용 리스트 기반으로 sanitize**하여 XSS를 차단하되, 리치 텍스트 기능은 유지한다.
4. 문서/안건 첨부 다운로드는 인증이 필요한 경우에도 브라우저에서 정상 동작하도록 한다.
5. 운영 스크립트/설정의 불일치(포트/CORS/중복 schema init)를 정리한다.

## 요구사항
### 권한/인증
- BE-REQ-001: `/api/admin/*` 엔드포인트는 `get_current_admin_user`를 통해 **관리자만** 접근 가능해야 한다.
- BE-REQ-002: 관리자 식별자는 `ADMIN_IDENTIFIERS` 환경변수(기본값은 `BUDGET_ADMIN_IDENTIFIERS` fallback)로 관리한다.
- BE-REQ-003: `/documents/*` 엔드포인트는 `get_current_user`를 통해 **로그인 사용자만** 접근 가능해야 한다.
  - 문서/안건의 접근제어는 **예산과 동일 규칙을 강제하지 않는다**(예산의 review/confirmed 가시성 규칙과 분리).

### 문서 업로드/다운로드
- BE-REQ-004: 문서 업로드는 저장 파일명을 UUID 기반으로 생성하고, 저장 위치는 `uploads/documents`(또는 env로 재정의 가능) 하위로 제한한다.
- BE-REQ-005: 업로드는 최대 용량 제한을 가진다(초과 시 413).
- BE-REQ-006: 문서 상세(`GET /documents/{doc_id}`) 응답은 내부 경로(`file_path`)를 포함하지 않는 안전한 스키마로 반환한다.
- FE-REQ-001: 문서 다운로드는 `<a href>` 대신 인증 헤더가 포함되는 방식(XHR blob 다운로드)으로 동작해야 한다.

### 안건 HTML sanitize (리치 기능 유지)
- BE-REQ-007: 안건 작성/임시저장/답변 등록 시 `content_html`은 서버에서 sanitize 후 저장한다.
- BE-REQ-008: sanitize 허용 기능
  - 폰트 크기/색상/굵기(예: `<font size>`, `<font color>`, `<b>/<strong>`)
  - 정렬(예: `text-align`)
  - 표(`<table>/<thead>/<tbody>/<tr>/<th>/<td>` + 제한된 스타일)
  - 본문 이미지 첨부(`<img src="data:image/*;base64,..." ...>`, 단 `svg` 등 위험 포맷은 차단)
- BE-REQ-009: 안건 첨부 다운로드는 첨부가 속한 스레드의 접근 정책을 준수해야 한다(초안은 작성자만).
- FE-REQ-002: 안건 첨부 다운로드 역시 XHR blob 방식으로 동작해야 한다.

### 운영 안정성
- OPS-REQ-001: `scripts/verify.sh`는 Docker compose 포트 구성과 일치하는 API 포트를 사용해야 한다(현재 호스트 `8001`).
- OPS-REQ-002: 기본 CORS allow origins에 `http://localhost:9000`/`127.0.0.1:9000`을 포함한다.
- OPS-REQ-003: 앱 시작 시 schema init은 중복 호출하지 않는다.

## 수용 기준(AC)
1. 비로그인 사용자가 `/documents/search`, `/documents/{id}/download` 호출 시 401을 반환한다.
2. 관리자가 아닌 사용자가 `/api/admin/search_debug`, `/api/admin/dedup/*` 호출 시 403을 반환한다.
3. 문서 업로드는 `../a.pdf` 같은 파일명으로 업로드해도 서버 파일 시스템 임의 경로에 저장되지 않는다.
4. 안건 본문에 `<script>alert(1)</script>`를 포함해 저장해도, 저장된 `content_html`에 `<script>`가 남지 않는다.
5. 리치 기능(표/폰트 크기/색상/굵기/이미지)이 sanitize 이후에도 유지된다.
6. 로그인 상태에서 문서/안건 첨부 다운로드 버튼이 정상 동작한다.
7. 컨테이너에서 `bash scripts/verify_fast.sh` 및 `bash scripts/verify.sh`가 통과한다.

