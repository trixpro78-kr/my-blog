import { parseMarkdown, escapeHtml } from './markdown.js';
import { initThemeToggle } from './theme.js';

const SITE_TITLE = 'My Blog';
const POSTS_DIR = 'posts/';
const LOADING_DELAY = 200;

const app = document.getElementById('app');
const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

let postsCache = null;
let navigationId = 0;

/* ---------- Data ---------- */

async function loadIndex() {
  if (!postsCache) {
    const res = await fetch(`${POSTS_DIR}index.json`);
    if (!res.ok) throw new Error(`글 목록을 불러오지 못했습니다. (${res.status})`);
    const posts = await res.json();
    // 최신 날짜순. 날짜가 같으면 index.json에 나중에 추가된 글이 먼저 옵니다.
    postsCache = posts
      .map((post, order) => ({ post, order }))
      .sort((a, b) => String(b.post.date).localeCompare(String(a.post.date)) || b.order - a.order)
      .map(({ post }) => post);
  }
  return postsCache;
}

async function loadPost(slug) {
  const res = await fetch(`${POSTS_DIR}${encodeURIComponent(slug)}.md`);
  if (!res.ok) throw new Error(`글을 불러오지 못했습니다. (${res.status})`);
  return res.text();
}

/* ---------- Helpers ---------- */

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return escapeHtml(value || '');
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dateFormatter.format(date);
}

function renderMeta(post) {
  const date = post.date
    ? `<time datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>`
    : '';
  const tags = Array.isArray(post.tags) && post.tags.length
    ? `<ul class="tags">${post.tags.map((tag) => `<li class="tag">${escapeHtml(tag)}</li>`).join('')}</ul>`
    : '';
  return `<div class="post-meta">${date}${tags}</div>`;
}

function postHref(slug) {
  return `#/post/${encodeURIComponent(slug)}`;
}

// 마크다운 안의 상대 경로를 posts/ 기준으로 바꾸고, 다른 글(.md) 링크는 라우트로 연결합니다.
function resolveRelativeUrls(container) {
  const isRelative = (url) => url && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url);

  container.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    if (isRelative(src)) img.setAttribute('src', POSTS_DIR + src);
  });

  container.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!isRelative(href)) return;
    const mdLink = /^(?:\.\/)?([\w-]+)\.md$/.exec(href);
    link.setAttribute('href', mdLink ? postHref(mdLink[1]) : POSTS_DIR + href);
  });
}

function setView(html, title) {
  app.innerHTML = html;
  document.title = title ? `${title} — ${SITE_TITLE}` : SITE_TITLE;
  window.scrollTo(0, 0);
}

/* ---------- Views ---------- */

async function renderList(id) {
  const posts = await loadIndex();
  if (id !== navigationId) return;

  if (!posts.length) {
    setView('<p class="status">아직 작성된 글이 없습니다.</p>');
    return;
  }

  const items = posts
    .map(
      (post) => `
      <li class="post-item">
        <a class="post-link" href="${postHref(post.slug)}">
          <h2 class="post-item-title">${escapeHtml(post.title)}</h2>
          ${renderMeta(post)}
          ${post.description ? `<p class="post-item-desc">${escapeHtml(post.description)}</p>` : ''}
        </a>
      </li>`
    )
    .join('');

  setView(`
    <h1 class="page-heading">최근 글</h1>
    <ul class="post-list">${items}</ul>
  `);
}

async function renderPost(id, slug) {
  const posts = await loadIndex();
  if (id !== navigationId) return;

  // 매니페스트에 등록된 글만 불러옵니다.
  const post = posts.find((p) => p.slug === slug);
  if (!post) {
    renderNotFound();
    return;
  }

  const markdown = await loadPost(slug);
  if (id !== navigationId) return;

  setView(
    `
    <a class="back-link" href="#/">← 목록으로</a>
    <article>
      <header class="post-header">
        <h1 class="post-title">${escapeHtml(post.title)}</h1>
        ${renderMeta(post)}
      </header>
      <div class="prose">${parseMarkdown(markdown)}</div>
    </article>
  `,
    post.title
  );
  resolveRelativeUrls(app.querySelector('.prose'));
}

function renderNotFound() {
  setView(
    `
    <div class="status">
      <h1>글을 찾을 수 없습니다</h1>
      <p>주소가 잘못되었거나 삭제된 글입니다.</p>
      <p><a href="#/">목록으로 돌아가기</a></p>
    </div>
  `,
    '페이지를 찾을 수 없습니다'
  );
}

function renderError(error) {
  setView(
    `
    <div class="status" role="alert">
      <h1>문제가 발생했습니다</h1>
      <p>${escapeHtml(error.message)}</p>
      <p><a href="#/">목록으로 돌아가기</a></p>
    </div>
  `,
    '오류'
  );
}

/* ---------- Router ---------- */

function parseRoute() {
  const path = location.hash.replace(/^#/, '') || '/';
  if (path === '/') return { view: 'list' };

  const match = /^\/post\/([^/]+)\/?$/.exec(path);
  if (match) {
    try {
      return { view: 'post', slug: decodeURIComponent(match[1]) };
    } catch (e) {
      return { view: 'notFound' };
    }
  }
  return { view: 'notFound' };
}

async function router() {
  const id = ++navigationId;
  const route = parseRoute();

  const loadingTimer = setTimeout(() => {
    if (id === navigationId) app.innerHTML = '<p class="status">불러오는 중…</p>';
  }, LOADING_DELAY);

  try {
    if (route.view === 'list') await renderList(id);
    else if (route.view === 'post') await renderPost(id, route.slug);
    else renderNotFound();
  } catch (error) {
    if (id === navigationId) renderError(error);
  } finally {
    clearTimeout(loadingTimer);
  }
}

initThemeToggle(document.querySelector('.theme-toggle'));

window.addEventListener('hashchange', async () => {
  await router();
  app.focus({ preventScroll: true });
});

router();
