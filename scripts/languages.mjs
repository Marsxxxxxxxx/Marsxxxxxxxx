// Node.js 18+; no npm packages required. Keep LANGUAGE_STATS_TOKEN in an Actions Secret.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const API = 'https://api.github.com';
// Reuse the existing soft colors, ordered from cool to warm instead of by language name.
const RANK_COLOR_STOPS = ['#9B8AFB', '#64A8EC', '#65BFB0', '#A5C589', '#E8C96D', '#E9957A']
  .map((hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)));

const CARD_WIDTH = 840;
const PADDING = 20;
const BAR_WIDTH = CARD_WIDTH - PADDING * 2;
const LEGEND_COLUMNS = 3;
const COLUMN_WIDTH = BAR_WIDTH / LEGEND_COLUMNS;

async function apiJson(path, token, fetchImpl) {
  const url = new URL(path, API);
  if (url.origin !== API) throw new Error('Refusing to send the token outside GitHub API.');
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetchImpl(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2026-03-10',
          'User-Agent': 'profile-languages',
        },
      });
    } catch {
      if (attempt === 2) throw new Error('Cannot reach GitHub API. Run the workflow again.');
      await new Promise((done) => setTimeout(done, 1000 * (attempt + 1)));
      continue;
    }
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
    await new Promise((done) => setTimeout(done, 1000 * (attempt + 1)));
  }
  if (!response.ok) {
    const advice = {
      401: 'LANGUAGE_STATS_TOKEN is invalid or expired. Replace the repository secret.',
      403: 'Check token access (All repositories, Metadata: Read) and GitHub API rate limits.',
      404: 'A repository is unavailable. Check token access and run the workflow again.',
    };
    // Do not print API response bodies, request URLs or private repository names.
    throw new Error(advice[response.status] ?? `GitHub API returned HTTP ${response.status}. Try again later.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error('GitHub API returned invalid JSON. Run the workflow again.');
  }
}

export async function collectLanguages({ token, owner, fetchImpl = fetch }) {
  if (!token?.trim()) throw new Error('Create the LANGUAGE_STATS_TOKEN repository secret first.');
  if (!owner?.trim()) throw new Error('STATS_OWNER must contain the profile repository owner.');
  const expectedOwner = owner.trim().toLowerCase();
  const account = await apiJson('/user', token, fetchImpl);
  if (account.login?.toLowerCase() !== expectedOwner) {
    throw new Error('The token account does not match the profile owner. Create a token using the correct account.');
  }

  const repositories = new Map();
  // Read all pages; a full page is followed by another request, including an empty final page.
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      visibility: 'all', affiliation: 'owner', per_page: '100',
      sort: 'full_name', direction: 'asc', page: String(page),
    });
    const batch = await apiJson(`/user/repos?${query}`, token, fetchImpl);
    if (!Array.isArray(batch)) throw new Error('GitHub returned an unexpected repository list.');
    for (const repo of batch) {
      if (repo.owner?.login?.toLowerCase() === expectedOwner) {
        if (!Number.isSafeInteger(repo.id) || typeof repo.name !== 'string') {
          throw new Error('GitHub returned invalid repository metadata.');
        }
        // Public, private, forked and archived repositories are included intentionally.
        repositories.set(repo.id, repo);
      }
    }
    if (batch.length < 100) break;
  }
  if (repositories.size === 0) {
    throw new Error('No accessible repositories. Check Resource owner and All repositories in the token settings.');
  }

  const totals = new Map();
  for (const repo of repositories.values()) {
    const path = `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/languages`;
    const languages = await apiJson(path, token, fetchImpl);
    if (!languages || Array.isArray(languages) || typeof languages !== 'object') {
      throw new Error('GitHub returned unexpected language data.');
    }
    for (const [language, bytes] of Object.entries(languages)) {
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('GitHub returned invalid language sizes.');
      if (bytes === 0) continue;
      const next = (totals.get(language) ?? 0) + bytes;
      if (!Number.isSafeInteger(next)) throw new Error('Language sizes exceed supported numeric precision.');
      totals.set(language, next);
    }
  }
  return totals;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

export function rankColors(count) {
  return Array.from({ length: count }, (_, rank) => {
    const position = count <= 1 ? 0 : rank / (count - 1) * (RANK_COLOR_STOPS.length - 1);
    const start = Math.min(Math.floor(position), RANK_COLOR_STOPS.length - 2);
    const blend = position - start;
    const channels = RANK_COLOR_STOPS[start].map((channel, index) =>
      Math.round(channel + (RANK_COLOR_STOPS[start + 1][index] - channel) * blend));
    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  });
}

export function renderSvg(totals, dark = false) {
  const entries = [...totals].filter(([, bytes]) => bytes > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const colors = rankColors(entries.length);
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Total code size exceeds supported numeric precision.');
  const rows = Math.max(1, Math.ceil(entries.length / LEGEND_COLUMNS));
  const height = 95 + rows * 28;
  const foreground = dark ? '#f0f6fc' : '#1f2328';
  const secondary = dark ? '#9198a1' : '#59636e';
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${height}" viewBox="0 0 ${CARD_WIDTH} ${height}" role="img" aria-labelledby="title description">`,
    '<title id="title">All Languages · Usage</title>',
    '<desc id="description">Language shares across all owned public and private repositories, weighted by code bytes. Forked and archived repositories are included.</desc>',
    `<g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei, PingFang SC, Noto Sans CJK SC, Arial, sans-serif">`,
    `<text x="20" y="27" fill="${foreground}" font-size="17" font-weight="600">Languages</text>`,
    `<defs><clipPath id="bar"><rect x="${PADDING}" y="43" width="${BAR_WIDTH}" height="9" rx="4.5"/></clipPath></defs>`,
    `<rect x="${PADDING}" y="43" width="${BAR_WIDTH}" height="9" rx="4.5" fill="${dark ? '#21262d' : '#eff2f5'}"/>`,
    '<g clip-path="url(#bar)">',
  ];
  let x = PADDING;
  for (let index = 0; index < entries.length; index += 1) {
    const [, bytes] = entries[index];
    const width = index === entries.length - 1 ? CARD_WIDTH - PADDING - x : (bytes / total) * BAR_WIDTH;
    parts.push(`<rect x="${x.toFixed(6)}" y="43" width="${width.toFixed(6)}" height="9" fill="${colors[index]}"/>`);
    x += width;
  }
  parts.push('</g>');
  // No fixed-width gaps, so separators cannot erase very small language shares.
  for (let index = 0; index < entries.length; index += 1) {
    const [language, bytes] = entries[index];
    const percent = (bytes / total) * 100;
    const share = percent < 0.1 ? '<0.1%' : `${percent.toFixed(1)}%`;
    const columnX = PADDING + (index % LEGEND_COLUMNS) * COLUMN_WIDTH;
    const y = 80 + Math.floor(index / LEGEND_COLUMNS) * 28;
    const label = `${language}  ${share}`;
    const labelWidth = Math.floor(COLUMN_WIDTH - 39);
    const fitted = [...label].length * 7.5 > labelWidth ? ` textLength="${labelWidth}" lengthAdjust="spacingAndGlyphs"` : '';
    parts.push(`<circle cx="${(columnX + 5).toFixed(3)}" cy="${y - 4}" r="5" fill="${colors[index]}"/>`);
    parts.push(`<text x="${(columnX + 19).toFixed(3)}" y="${y}" font-size="14"${fitted}><tspan fill="${foreground}" font-weight="600">${escapeXml(language)}</tspan><tspan fill="${secondary}" dx="8">${escapeXml(share)}</tspan></text>`);
  }
  if (!entries.length) parts.push(`<text x="20" y="80" font-size="14" fill="${secondary}">No language data in the accessible repositories.</text>`);
  parts.push(`<text x="20" y="${height - 15}" font-size="12" fill="${secondary}">All Languages · Usage</text>`, '</g>', '</svg>', '');
  return parts.join('\n');
}

export function updateReadmeImages(readme, version, { repository, ref = 'main' } = {}) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('STATS_REPOSITORY must contain the profile repository in owner/name format.');
  }
  if (!ref?.trim()) throw new Error('STATS_REF must contain the branch used for the language images.');
  const imageBase = `https://raw.githubusercontent.com/${repository}/${ref.split('/').map(encodeURIComponent).join('/')}/assets/`;
  let references = 0;
  const updated = readme.replace(
    /(?<![^\s"'(<])(?:(?:https:\/\/(?:raw\.githubusercontent\.com|github\.com)\/[^\s"'()<>?#]*\/)|\.\/|\/)?assets\/(?:private-)?languages(-dark)?\.svg(?=[?\#"'()\s<>]|$)(?:\?([^"'()\s<>\#]*))?/g,
    (_, theme = '', query = '') => {
      references += 1;
      const parameters = new URLSearchParams(query.replaceAll('&amp;', '&'));
      parameters.set('v', version);
      const suffix = parameters.toString();
      // Relative GitHub /raw/ redirects drop query parameters, defeating image cache versions.
      return `${imageBase}languages${theme}.svg?${query.includes('&amp;') ? suffix.replaceAll('&', '&amp;') : suffix}`;
    },
  );
  if (!references) {
    throw new Error('README.md has no language image references. Add the supplied picture block first.');
  }
  return updated;
}

export async function main(env = process.env) {
  const totals = await collectLanguages({ token: env.LANGUAGE_STATS_TOKEN, owner: env.STATS_OWNER });
  const light = renderSvg(totals);
  const dark = renderSvg(totals, true);
  let readme;
  try {
    readme = await readFile(resolve('README.md'), 'utf8');
  } catch {
    throw new Error('Cannot read README.md. Add the supplied picture block to the profile README first.');
  }
  // The version changes only when the displayed image changes, so unchanged runs create no commit.
  const version = createHash('sha256').update(light).update('\0').update(dark).digest('hex').slice(0, 12);
  const updatedReadme = updateReadmeImages(readme, version, {
    repository: env.STATS_REPOSITORY || env.GITHUB_REPOSITORY || `${env.STATS_OWNER.trim()}/${env.STATS_OWNER.trim()}`,
    ref: env.STATS_REF || env.GITHUB_REF_NAME || 'main',
  });
  // Only aggregate SVGs and their README references are written. No raw repository data is saved.
  const directory = resolve('assets');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'languages.svg'), light, 'utf8');
  await writeFile(resolve(directory, 'languages-dark.svg'), dark, 'utf8');
  if (updatedReadme !== readme) await writeFile(resolve('README.md'), updatedReadme, 'utf8');
  // Remove obsolete generated images and entry points after successful generation.
  await rm(resolve(directory, 'private-languages.svg'), { force: true });
  await rm(resolve(directory, 'private-languages-dark.svg'), { force: true });
  await rm(resolve('.github', 'workflows', 'private-languages.yml'), { force: true });
  await rm(resolve('scripts', 'private-languages.mjs'), { force: true });
  console.log('Updated language cards and README image versions. Only aggregate language shares were saved.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Language statistics failed: ${error.message}`);
    process.exitCode = 1;
  });
}
