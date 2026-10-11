# CLAUDE.md

이 파일은 이 저장소에서 작업할 때 Claude Code가 따라야 할 지침입니다.

## 프로젝트 개요

마크다운(`.md`) 파일로 작성한 글을 읽어 블로그 웹사이트로 보여주는 정적 사이트입니다.

- **프레임워크·빌드 도구 없음**: 순수 HTML, CSS, JavaScript(ES Modules)만 사용합니다.
- React, Vue, Tailwind, jQuery, 번들러(Webpack/Vite 등), npm 패키지를 추가하지 않습니다.
- 마크다운 파서도 외부 라이브러리 없이 직접 구현합니다(`js/markdown.js`).
- 디자인 목표: 깔끔하고 읽기 좋은 타이포그래피, 다크 모드 지원, 모바일 친화적 반응형 레이아웃.

## 디렉터리 구조

```
my-blog/
├── index.html          # 단일 진입점 (글 목록 + 글 본문을 해시 라우팅으로 표시)
├── css/
│   └── style.css       # 전체 스타일 (CSS 변수 기반 테마)
├── js/
│   ├── app.js          # 라우팅, 데이터 로딩, 렌더링
│   ├── markdown.js     # 마크다운 → HTML 변환기
│   └── theme.js        # 다크/라이트 모드 전환
└── posts/
    ├── index.json      # 글 목록 매니페스트
    └── *.md            # 블로그 글
```

## 글 작성 방식

브라우저는 디렉터리 목록을 읽을 수 없으므로, 새 글을 추가하면 **반드시 `posts/index.json`에도 항목을 추가**합니다.

```json
[
  {
    "slug": "hello-world",
    "title": "첫 번째 글",
    "date": "2026-10-11",
    "description": "목록에 표시될 짧은 요약",
    "tags": ["일상"]
  }
]
```

- 파일 이름은 `posts/{slug}.md` 입니다.
- 목록은 `date` 기준 최신순으로 정렬해 표시합니다. 날짜가 같으면 `index.json`에 나중에 추가한 글이 위에 옵니다(새 글은 배열 끝에 추가).
- 글 상단에 front matter(`---`로 감싼 YAML 블록)가 있으면 파서가 제거하고 본문만 렌더링합니다.
- 글 안의 상대 경로는 `.md` 파일 기준으로 씁니다. 이미지(`images/a.png`)는 `posts/`를 붙여 불러오고, 다른 글 링크(`other-post.md`)는 `#/post/other-post`로 바뀝니다(`js/app.js`의 `resolveRelativeUrls`).
- 이미지는 `posts/images/`에 둡니다.

## 라우팅

해시 기반 라우팅을 사용합니다(서버 설정 없이 동작하도록).

- `#/` → 글 목록
- `#/post/{slug}` → 글 본문
- 존재하지 않는 slug → "글을 찾을 수 없습니다" 안내와 목록으로 돌아가는 링크

## 마크다운 파서 (`js/markdown.js`)

지원 범위:

- 제목(`#` ~ `######`), 문단, 줄바꿈
- 굵게, 기울임, 취소선, 인라인 코드
- 링크, 이미지
- 순서 있는/없는 목록(중첩 포함), 할 일 목록(`- [ ]`, `- [x]`)
- 자동 링크(`<https://...>`), 백슬래시 이스케이프(`\*`)
- 인용문(`>`)
- 코드 블록(``` ``` ```, 언어 이름은 `class="language-xxx"`로 부여)
- 수평선(`---`)
- 표(GFM 테이블)

지원하지 않는 것: 원시 HTML(글자 그대로 표시됨), 4칸 들여쓰기 코드 블록, setext 제목(`===` 밑줄), 참조형 링크(`[a][1]`). 새 문법을 추가하면 `posts/markdown-guide.md`에도 예시를 넣습니다.

규칙:

- **보안**: 원문 텍스트는 항상 HTML 이스케이프(`& < > " '`)한 뒤 마크다운 문법만 태그로 변환합니다. `innerHTML`에 넣기 전 이스케이프 누락이 없어야 합니다. `javascript:` 링크는 허용하지 않습니다.
- 코드 블록 내부는 마크다운 변환을 하지 않습니다.
- 파서는 DOM에 의존하지 않는 순수 함수(`parseMarkdown(text) → html`)로 유지합니다.

## 디자인 가이드

### 타이포그래피
- 본문 폭은 `max-width: 68ch` 정도로 제한해 한 줄 길이를 읽기 좋게 유지합니다.
- 본문 `font-size: 1.0625rem`(17px) 전후, `line-height: 1.75`.
- 한글 가독성을 위해 시스템 폰트 스택 사용:
  `-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", "Segoe UI", sans-serif`
- 한글 줄바꿈: `word-break: keep-all; overflow-wrap: break-word;`
- 코드: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

### 색상과 다크 모드
- 모든 색상은 `:root`의 CSS 변수로 정의하고, 컴포넌트에서는 변수만 참조합니다(하드코딩 금지).
- 테마 결정 순서:
  1. 사용자가 토글로 선택한 값(`localStorage`의 `theme` 키)
  2. 없으면 시스템 설정(`prefers-color-scheme`)
- `<html data-theme="light|dark">` 속성으로 테마를 적용합니다.
- 깜빡임(FOUC) 방지를 위해 테마 적용 스크립트는 `<head>`에서 CSS보다 먼저, 동기적으로 실행합니다.
- `localStorage` 접근은 `try/catch`로 감쌉니다(사파리 비공개 모드 등).
- 헤더에 테마 토글 버튼을 두고 `aria-label`을 제공합니다.
- 대비율은 WCAG AA(본문 4.5:1) 이상을 유지합니다.

### 반응형
- 모바일 우선(mobile-first)으로 작성하고 `min-width` 미디어 쿼리로 확장합니다.
- 모바일 좌우 여백 최소 16px, 가로 스크롤이 생기지 않아야 합니다.
- 이미지: `max-width: 100%; height: auto;`
- 코드 블록과 표는 자체적으로 가로 스크롤(`overflow-x: auto`)되게 하여 페이지 전체가 넘치지 않게 합니다.
- 터치 대상(버튼, 링크)은 최소 44×44px.
- `<meta name="viewport" content="width=device-width, initial-scale=1">` 필수.

## 코딩 규칙

- ES Modules(`<script type="module">`)를 사용하고 전역 변수를 만들지 않습니다.
- `const`/`let`만 사용, `var` 금지. 비동기는 `async/await`.
- `fetch` 실패 시 사용자에게 오류 메시지를 표시합니다(빈 화면 금지).
- 시맨틱 HTML(`header`, `main`, `article`, `nav`, `time`)을 사용합니다.
- 글 이동 시 `document.title`을 글 제목으로 갱신하고 스크롤을 맨 위로 이동합니다.
- 들여쓰기 2칸, 문자열은 작은따옴표, 세미콜론 사용.

## 로컬 실행

`fetch()`로 마크다운 파일을 불러오므로 `file://`로 직접 열면 동작하지 않습니다. 로컬 서버로 실행합니다.

```bash
python3 -m http.server 8000
```

그 후 브라우저에서 `http://localhost:8000` 을 엽니다.

## 작업 시 확인 사항

변경 후 다음을 확인합니다.

- [ ] 라이트/다크 모드 모두에서 글 목록과 본문이 잘 보이는지
- [ ] 모바일 폭(375px)에서 가로 스크롤이 없는지
- [ ] 새 글이 `posts/index.json`에 등록되어 목록에 나타나는지
- [ ] 브라우저 콘솔에 오류가 없는지
