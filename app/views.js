// The four surfaces: board list, bounty page, leaderboard, profile. The
// router keeps the board list in its pane beside the detail pane; each view
// below renders into one pane and fetches only what it shows, leaving the
// header, footer and the other pane untouched.

import {
  avatarUrl,
  getCompetition,
  getLeaderboard,
  getProfile,
} from './api.js';
import {
  acceptingEntries,
  buildCost,
  buildTime,
  closingSoon,
  count,
  escapeText,
  kilobytes,
  shortDate,
  timeLeft,
  usd,
  utcDate,
  winRate,
} from './format.js';

const LEADERBOARD_PAGE = 50;
const RULES_PREVIEW = 3000;

let boardTab = 'live';
let boardSort = 'closing';

function loadingView(label) {
  return `<p class="state" role="status">${escapeText(label)}</p>`;
}

function noticeView(title, body, retryLabel) {
  return `<div class="state-block" role="status">
    <h1>${escapeText(title)}</h1>
    <p>${escapeText(body)}</p>
    ${retryLabel ? `<p><button type="button" class="btn" data-retry>${escapeText(retryLabel)}</button></p>` : ''}
  </div>`;
}

function onRetry(root, rerun) {
  const button = root.querySelector('[data-retry]');
  if (button) button.addEventListener('click', rerun);
}

function isNotFound(error) {
  return /answered 404/.test(String(error?.message || error));
}

/** An avatar image: crossorigin set before src, as the API's images require. */
function avatar(image, handle, size) {
  const url = avatarUrl(image);
  if (!url) return `<span class="avatar-fallback" aria-hidden="true">${escapeText((handle || '?')[0].toUpperCase())}</span>`;
  return `<img crossorigin="anonymous" src="${escapeText(url)}" alt="" width="${size}" height="${size}" class="avatar" loading="lazy">`;
}

function entryFeeLabel(competition) {
  const fee = Number(competition.entryFeeUsd);
  if (Number.isFinite(fee) && fee > 0) return usd(fee);
  return 'No fee';
}

function sortBounties(items, sort, live) {
  const rows = [...items];
  if (sort === 'pot') rows.sort((a, b) => (Number(b.potUsd) || 0) - (Number(a.potUsd) || 0));
  else if (sort === 'entries') rows.sort((a, b) => (b.submissionCount || 0) - (a.submissionCount || 0));
  else if (live) rows.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  else rows.sort((a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime());
  return rows;
}

function miniRow(competition, selected, live) {
  const slug = encodeURIComponent(competition.slug);
  const soon = live && closingSoon(competition.deadline);
  const fee = Number(competition.entryFeeUsd);
  const feeFigure = Number.isFinite(fee) && fee > 0
    ? `<span><b>${usd(fee)}</b> fee</span>`
    : '<span><b>No fee</b></span>';
  const time = live
    ? `<span class="${soon ? 'soon' : ''}"><b>${escapeText(timeLeft(competition.deadline))}</b></span>`
    : `<span>Ended ${escapeText(shortDate(competition.deadline))}</span>`;
  return `<li class="mini-row${selected ? ' is-selected' : ''}">
    <a class="mini-link" href="#/bounty/${slug}"${selected ? ' aria-current="true"' : ''}>
      <span class="mini-title">${escapeText(competition.title)}${selected ? '<span class="visually-hidden"> (viewing)</span>' : ''}</span>
      <span class="mini-meta">${escapeText(competition.category || 'Bounty')} · ${count(competition.submissionCount)} ${competition.submissionCount === 1 ? 'entry' : 'entries'}</span>
      <span class="mini-figures">
        <span><b>${usd(competition.potUsd ?? competition.rewardAmount)}</b> pot</span>
        ${feeFigure}
        ${time}
      </span>
    </a>
  </li>`;
}

/** The board list pane: Live/Ended tabs and a sort control, rows link to details. */
export function renderBoardList(pane, items, selectedSlug) {
  const live = items.filter(acceptingEntries);
  const closed = items.filter((c) => !acceptingEntries(c));
  const livePot = live.reduce((sum, c) => sum + (Number(c.potUsd) || 0), 0);
  pane.innerHTML = `<p class="pane-title"><strong>Bounties</strong></p>
  <p class="pane-sub">${count(live.length)} open now · ${usd(livePot)} in live pots</p>
  <div class="tabs" role="group" aria-label="Filter bounties">
    <button type="button" class="tab" data-tab="live" aria-pressed="${boardTab === 'live'}">Live (${count(live.length)})</button>
    <button type="button" class="tab" data-tab="ended" aria-pressed="${boardTab === 'ended'}">Ended (${count(closed.length)})</button>
  </div>
  <p class="sort-row"><label for="board-sort">Sort by</label>
    <select id="board-sort">
      <option value="closing"${boardSort === 'closing' ? ' selected' : ''}>Closing soonest</option>
      <option value="pot"${boardSort === 'pot' ? ' selected' : ''}>Largest pot</option>
      <option value="entries"${boardSort === 'entries' ? ' selected' : ''}>Most entries</option>
    </select>
  </p>
  <ol class="mini-list" data-rows></ol>`;
  const paint = () => {
    const showingLive = boardTab === 'live';
    const rows = sortBounties(showingLive ? live : closed, boardSort, showingLive);
    const list = pane.querySelector('[data-rows]');
    list.setAttribute('aria-label', showingLive ? 'Live bounties' : 'Ended bounties');
    list.innerHTML = rows.length
      ? rows.map((c) => miniRow(c, c.slug === selectedSlug, showingLive)).join('')
      : `<li class="state">${showingLive ? 'No live bounties right now.' : 'No ended bounties listed.'}</li>`;
    pane.querySelectorAll('[data-tab]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-tab') === boardTab));
    });
  };
  pane.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      boardTab = button.getAttribute('data-tab');
      paint();
    });
  });
  pane.querySelector('#board-sort').addEventListener('change', (event) => {
    boardSort = event.target.value;
    paint();
  });
  paint();
}

/** The list pane's error state, with a retry that reloads the route. */
export function renderListError(pane, onRetryRoute) {
  pane.innerHTML = `<p class="pane-title"><strong>Bounties</strong></p>
  <p class="state" role="status">The board did not load: make.fun’s API did not answer.</p>
  <p><button type="button" class="btn" data-retry>Try again</button></p>`;
  onRetry(pane, onRetryRoute);
}

/** The detail pane when no bounty is live to show beside the board. */
export function renderEmptyDetail(pane) {
  pane.innerHTML = noticeView(
    'No live bounties',
    'Every bounty on the board has passed its deadline. New bounties appear here as soon as make.fun opens them.',
  );
}

export function notFoundView() {
  return `<div class="state-block" role="status">
    <h1>No page at this address</h1>
    <p>This address names no board, bounty, leaderboard or profile. The board lists every bounty.</p>
    <p><a class="btn" href="#/">Back to the board</a></p>
  </div>`;
}

function rewardsTable(competition) {
  const rows = Array.isArray(competition.rewardsNow) ? competition.rewardsNow : [];
  if (!rows.length) return '';
  const fees = Number(competition.entryFeesUsd) || 0;
  return `<section aria-labelledby="rewards-heading">
    <h2 id="rewards-heading">Rewards</h2>
    <p class="section-note">Live pot ${usd(competition.potUsd ?? competition.rewardAmount)}${fees > 0 ? `, including ${usd(fees)} in entry fees from ${count(competition.entryFeePayers)} ${competition.entryFeePayers === 1 ? 'payer' : 'payers'}` : ''}. Places split the pot as below.</p>
    <table class="rewards">
      <thead><tr><th scope="col">Place</th><th scope="col">Prize</th><th scope="col">Fee share</th><th scope="col">Total now</th></tr></thead>
      <tbody>${rows.map((r) => `<tr${r.place === 1 ? ' class="row-first"' : ''}>
        <th scope="row">${r.place}</th><td>${usd(r.baseUsd)}</td><td>${usd(r.feeShareUsd)}</td><td>${usd(r.amountUsd)}</td>
      </tr>`).join('')}</tbody>
    </table>
  </section>`;
}

/** One bounty's page: summary, facts, rewards, description and rules. */
export async function bountyView(root, slug, onRetryRoute) {
  root.innerHTML = loadingView('Loading the bounty from make.fun…');
  let competition;
  try {
    competition = await getCompetition(slug);
  } catch (error) {
    root.innerHTML = isNotFound(error)
      ? noticeView('No bounty at this address', `make.fun has no bounty with the address “${slug}”. Check the link, or pick a bounty from the board.`)
      : noticeView('The bounty did not load', 'make.fun’s API did not answer. Check your connection and try again.', 'Try again');
    onRetry(root, onRetryRoute);
    return;
  }
  const live = acceptingEntries(competition);
  const rules = String(competition.rules || '');
  const rulesShown = rules.length > RULES_PREVIEW ? `${rules.slice(0, RULES_PREVIEW)}…` : rules;
  const skills = competition.skills || [];
  const skillsShown = skills.length > 3
    ? `${skills.slice(0, 3).join(', ')} +${skills.length - 3} more`
    : skills.join(', ') || 'None listed';
  const pageUrl = `https://make.fun${competition.url || `/bounty/${competition.slug}`}`;
  root.innerHTML = `<p class="crumb"><a href="#/">All bounties</a></p>
  <div class="page-head">
    <h1>${escapeText(competition.title)}</h1>
    ${competition.summary ? `<p class="lede">${escapeText(competition.summary)}</p>` : ''}
  </div>
  <dl class="facts">
    <div><dt>Status</dt><dd>${live ? `Open now, ${escapeText(timeLeft(competition.deadline))}` : 'Closed to entries'}</dd></div>
    <div><dt>Live pot</dt><dd>${usd(competition.potUsd ?? competition.rewardAmount)}</dd></div>
    <div><dt>Entry fee</dt><dd>${escapeText(entryFeeLabel(competition))}</dd></div>
    <div><dt>Entries</dt><dd>${count(competition.submissionCount)}</dd></div>
    <div><dt>Opened</dt><dd>${escapeText(utcDate(competition.publishedAt || competition.opensAt))}</dd></div>
    <div><dt>Deadline</dt><dd>${escapeText(utcDate(competition.deadline))}</dd></div>
    <div><dt>Category</dt><dd>${escapeText(competition.category || 'Bounty')}</dd></div>
    <div><dt>Skills</dt><dd>${escapeText(skillsShown)}</dd></div>
  </dl>
  <p class="actions">
    <a class="btn" href="#/bounty/${encodeURIComponent(competition.slug)}/leaderboard">Leaderboard</a>
    <a class="btn-ghost" href="${escapeText(pageUrl)}">This bounty on make.fun</a>
  </p>
  ${rewardsTable(competition)}
  ${competition.resolution?.summary ? `<section aria-labelledby="judging-heading">
    <h2 id="judging-heading">How it is judged</h2>
    <p>${escapeText(competition.resolution.summary)}</p>
  </section>` : ''}
  ${competition.description ? `<section aria-labelledby="about-heading">
    <h2 id="about-heading">About this bounty</h2>
    <div class="prose">${escapeText(competition.description)}</div>
  </section>` : ''}
  ${rules ? `<section aria-labelledby="rules-heading">
    <h2 id="rules-heading">Rules</h2>
    <div class="prose rules-text">${escapeText(rulesShown)}</div>
    ${rules.length > RULES_PREVIEW ? `<p><a href="${escapeText(pageUrl)}">Read the full rules on make.fun</a></p>` : ''}
  </section>` : ''}`;
}

function leaderboardColumns(data) {
  const visible = (data.columns || []).filter((c) => !c.hidden && c.key !== 'valid');
  const hasJudge = visible.some((c) => c.key === 'judge');
  if (!hasJudge) return { judge: false, columns: visible };
  return {
    judge: true,
    columns: visible.filter((c) => !['judge', 'judge_low', 'judge_high'].includes(c.key)),
  };
}

function columnCell(column, entry) {
  const value = entry.values?.[column.key];
  if (column.key === 'bytes') return kilobytes(value);
  if (value === undefined || value === null) return 'n/a';
  const shown = entry.display?.[column.key];
  return escapeText(shown ?? String(value));
}

function leaderboardRow(entry, extraColumns, showJudge) {
  const interval = entry.interval;
  const judgeCell = interval
    ? `${winRate(entry.values?.judge)} <span class="interval">(${winRate(interval.low)} to ${winRate(interval.high)})</span>`
    : winRate(entry.values?.judge);
  const cost = entry.cost ? `${buildTime(entry.build_wall_ms)} · ${buildCost(entry.cost.micro_usd)}` : 'n/a';
  return `<tr>
    <td class="rank">${entry.rank ?? 'n/a'}</td>
    <td class="entry-cell">
      <a class="entry-link" href="#/u/${encodeURIComponent(entry.handle)}">${avatar(entry.image, entry.handle, 28)}<span class="handle">${escapeText(entry.handle)}</span></a>
      <span class="entry-title">${escapeText(entry.title || 'Untitled entry')}</span>
    </td>
    ${showJudge ? `<td class="figure-cell">${judgeCell}</td>` : ''}
    ${extraColumns.map((c) => `<td class="figure-cell">${columnCell(c, entry)}</td>`).join('')}
    <td class="figure-cell optional">${escapeText(cost)}</td>
  </tr>`;
}

/** A bouty's leaderboard: ranked entries, 50 rows at a time. */
export async function leaderboardView(root, slug, view, onRetryRoute) {
  root.innerHTML = loadingView('Loading the leaderboard from make.fun…');
  let data;
  try {
    data = await getLeaderboard(slug, view);
  } catch (error) {
    root.innerHTML = isNotFound(error)
      ? noticeView('No leaderboard at this address', `make.fun has no bounty with the address “${slug}”. Check the link, or pick a bounty from the board.`)
      : noticeView('The leaderboard did not load', 'make.fun’s API did not answer. Check your connection and try again.', 'Try again');
    onRetry(root, onRetryRoute);
    return;
  }
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const { judge, columns } = leaderboardColumns(data);
  const views = Array.isArray(data?.views) ? data.views : [];
  const title = data?.competition?.title || slug;
  const phase = data?.phase?.title || '';
  let shown = 0;
  const renderRows = () => {
    shown = Math.min(shown + LEADERBOARD_PAGE, entries.length);
    return entries.slice(0, shown).map((e) => leaderboardRow(e, columns, judge)).join('');
  };
  root.innerHTML = `<p class="crumb"><a href="#/bounty/${encodeURIComponent(slug)}">${escapeText(title)}</a></p>
  <div class="page-head">
    <h1>Leaderboard</h1>
    <p>${count(entries.length)} ${entries.length === 1 ? 'entry' : 'entries'}${phase ? ` · ${escapeText(phase)} phase` : ''}${data?.tie_break?.title ? ` · ties broken by ${escapeText(data.tie_break.title.toLowerCase())}` : ''}</p>
  </div>
  ${views.length > 1 ? `<div class="view-switch" role="group" aria-label="Leaderboard view">
    ${views.map((v) => `<a class="btn-ghost${v === view ? ' is-active' : ''}" href="#/bounty/${encodeURIComponent(slug)}/leaderboard?view=${encodeURIComponent(v)}"${v === view ? ' aria-current="page"' : ''}>${escapeText(v[0].toUpperCase() + v.slice(1))}</a>`).join('')}
  </div>` : ''}
  ${entries.length === 0 ? noticeView('No entries yet', 'Nobody has entered this bounty yet, or no entry has been ranked. Entries appear here as soon as they are judged.') : `
  <div class="table-wrap">
  <table class="standings">
    <thead><tr>
      <th scope="col">Rank</th>
      <th scope="col">Entry</th>
      ${judge ? '<th scope="col">Win rate</th>' : ''}
      ${columns.map((c) => `<th scope="col">${escapeText(c.title)}</th>`).join('')}
      <th scope="col" class="optional">Build · cost</th>
    </tr></thead>
    <tbody data-rows>${renderRows()}</tbody>
  </table>
  </div>
  ${entries.length > shown ? `<p><button type="button" class="btn" data-more>Show more entries (${count(entries.length - shown)} left)</button></p>` : ''}`}`;
  const more = root.querySelector('[data-more]');
  if (more) {
    more.addEventListener('click', () => {
      root.querySelector('[data-rows]').innerHTML = renderRows();
      if (shown >= entries.length) more.remove();
      else more.textContent = `Show more entries (${count(entries.length - shown)} left)`;
    });
  }
}

function solutionRow(solution) {
  const comp = solution.competition || {};
  const slug = encodeURIComponent(comp.slug || '');
  const placed = solution.placement;
  const score = solution.score;
  let result = 'Entered, awaiting a rank';
  if (placed !== null && placed !== undefined) result = `Placed ${placed}`;
  else if (score?.column?.key === 'judge') result = `Win rate ${winRate(score.value)}`;
  else if (score?.display) result = `Score ${score.display}`;
  const prize = Number(solution.prize_usd);
  return `<li class="row row-solution">
    <div class="row-main">
      <h2><a href="#/bounty/${slug}">${escapeText(comp.title || comp.slug || 'Unknown bounty')}</a></h2>
      <p class="row-meta">${escapeText(solution.title || 'Untitled entry')}</p>
    </div>
    <p class="row-figure"><span class="figure">${escapeText(result)}</span><span class="figure-label">result</span></p>
    <p class="row-figure"><span class="figure">${Number.isFinite(prize) && prize > 0 ? usd(prize) : 'No prize'}</span><span class="figure-label">prize</span></p>
    <p class="row-figure"><span class="figure">${escapeText(shortDate(solution.entered_at))}</span><span class="figure-label">entered</span></p>
  </li>`;
}

/** An account's public profile: record, entries and payouts. */
export async function profileView(root, handle, onRetryRoute) {
  root.innerHTML = loadingView('Loading the profile from make.fun…');
  let profile;
  try {
    profile = await getProfile(handle);
  } catch (error) {
    root.innerHTML = isNotFound(error)
      ? noticeView('No account at this address', `make.fun has no account with the handle “${handle}”. Check the link, or pick a bounty from the board.`)
      : noticeView('The profile did not load', 'make.fun’s API did not answer. Check your connection and try again.', 'Try again');
    onRetry(root, onRetryRoute);
    return;
  }
  const record = profile.record || {};
  const solutions = Array.isArray(profile.solutions) ? profile.solutions : [];
  const payouts = Array.isArray(profile.payouts) ? profile.payouts : [];
  const links = [];
  if (profile.github_login) links.push(`<a href="https://github.com/${encodeURIComponent(profile.github_login)}">GitHub</a>`);
  if (profile.profile_url) links.push(`<a href="https://make.fun${escapeText(profile.profile_url)}">Profile on make.fun</a>`);
  if (profile.x) links.push(`<span>X: ${escapeText(profile.x)}</span>`);
  if (profile.discord) links.push(`<span>Discord: ${escapeText(profile.discord)}</span>`);
  const best = record.best_placement;
  root.innerHTML = `<div class="profile-head">
    ${avatar(profile.image || profile.avatar?.url, profile.handle, 64)}
    <div>
      <h1>${escapeText(profile.display_name || profile.handle)}</h1>
      <p class="handle-line"><span class="handle">${escapeText(profile.handle)}</span> · joined ${escapeText(utcDate(profile.joined_at))}</p>
      ${profile.bio ? `<p class="lede">${escapeText(profile.bio)}</p>` : ''}
      ${links.length ? `<p class="profile-links">${links.join(' · ')}</p>` : ''}
    </div>
  </div>
  <dl class="facts facts-3">
    <div><dt>Entered</dt><dd>${count(record.competitions_entered)}</dd></div>
    <div><dt>Placed</dt><dd>${count(record.competitions_placed)}</dd></div>
    <div><dt>Won</dt><dd>${count(record.competitions_won)}</dd></div>
    <div><dt>Podiums</dt><dd>${count(record.podium_finishes)}</dd></div>
    <div><dt>Best place</dt><dd>${best === null || best === undefined ? 'None yet' : `#${best}`}</dd></div>
    <div><dt>Prize money</dt><dd>${usd(record.prize_usd)}</dd></div>
  </dl>
  <section aria-labelledby="entries-heading">
    <h2 id="entries-heading">Entries (${count(solutions.length)})</h2>
    ${solutions.length ? `<ol class="board">${solutions.map(solutionRow).join('')}</ol>` : '<p class="section-note">No entries yet. Entries appear here once this account enters a bounty.</p>'}
  </section>
  <section aria-labelledby="payouts-heading">
    <h2 id="payouts-heading">Payouts (${count(payouts.length)})</h2>
    ${payouts.length ? `<table class="rewards">
      <thead><tr><th scope="col">Competition</th><th scope="col">Place</th><th scope="col">Amount</th><th scope="col">Paid</th></tr></thead>
      <tbody>${payouts.map((p) => `<tr>
        <th scope="row"><a href="#/bounty/${encodeURIComponent(p.competition?.slug || '')}">${escapeText(p.competition?.title || p.competition?.slug || 'Unknown bounty')}</a></th>
        <td>${p.place ?? 'n/a'}</td><td>${usd(p.amount_usd)}</td><td>${escapeText(utcDate(p.paid_at))}</td>
      </tr>`).join('')}</tbody>
    </table>` : '<p class="section-note">No payouts yet. Payouts appear here once this account wins a paid place.</p>'}
  </section>`;
}
