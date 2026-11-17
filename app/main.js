// Hash router shell: one address per surface, the board list kept beside
// the detail on wide screens. The views load lazily, after this shell
// paints, so the first load stays a shell, a stylesheet and this module.
//
//   #/                            board, first live bounty beside it
//   #/bounty/<slug>              board + one bounty's page
//   #/bounty/<slug>/leaderboard  board + that bouty's leaderboard
//   #/u/<handle>                 board + an account's public profile

const layout = document.getElementById('layout');
const listPane = document.getElementById('pane-list');
const detailPane = document.getElementById('pane-detail');
const boardLink = document.querySelector('nav a[href="#/"]');
const LEADERBOARD_VIEWS = ['overall', 'performance', 'cost', 'efficiency'];

let modules = null;
function loadModules() {
  if (!modules) {
    modules = Promise.all([import('./views.js'), import('./api.js'), import('./format.js')]);
  }
  return modules;
}

function parseHash() {
  const [path, query] = (location.hash.replace(/^#/, '') || '/').split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query || '') };
}

async function renderRoute() {
  window.__shotReady = false;
  const { parts, params } = parseHash();
  const [first, second, third] = parts;
  const isBoard = parts.length === 0;
  layout.dataset.mode = isBoard ? 'board' : 'detail';
  if (boardLink) {
    if (isBoard) boardLink.setAttribute('aria-current', 'page');
    else boardLink.removeAttribute('aria-current');
  }
  const [views, api, format] = await loadModules();
  let items = [];
  let listFailed = false;
  try {
    const data = await api.listCompetitions();
    items = Array.isArray(data?.items) ? data.items : [];
  } catch {
    listFailed = true;
  }
  const live = items
    .filter(format.acceptingEntries)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  const showList = (selected) => {
    if (listFailed) views.renderListError(listPane, renderRoute);
    else views.renderBoardList(listPane, items, selected);
  };
  if (isBoard) {
    document.title = 'Bounties · make.fun board';
    const selected = live[0]?.slug || null;
    showList(selected);
    if (selected) await views.bountyView(detailPane, selected, renderRoute);
    else views.renderEmptyDetail(detailPane);
  } else if (first === 'bounty' && second && third === 'leaderboard') {
    const slug = decodeURIComponent(second);
    const view = LEADERBOARD_VIEWS.includes(params.get('view')) ? params.get('view') : 'performance';
    document.title = 'Leaderboard · make.fun board';
    showList(slug);
    await views.leaderboardView(detailPane, slug, view, renderRoute);
  } else if (first === 'bounty' && second && !third) {
    const slug = decodeURIComponent(second);
    document.title = 'Bounty · make.fun board';
    showList(slug);
    await views.bountyView(detailPane, slug, renderRoute);
  } else if (first === 'u' && second && !third) {
    document.title = 'Profile · make.fun board';
    showList(null);
    await views.profileView(detailPane, decodeURIComponent(second), renderRoute);
  } else {
    document.title = 'Not found · make.fun board';
    showList(null);
    detailPane.innerHTML = views.notFoundView();
  }
  window.scrollTo(0, 0);
  window.__shotReady = true;
}

window.addEventListener('hashchange', renderRoute);
renderRoute();
