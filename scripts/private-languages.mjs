// Node.js 18+; no npm packages required. Keep PRIVATE_STATS_TOKEN in an Actions Secret.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const API = 'https://api.github.com';
const PALETTE_URL = 'https://raw.githubusercontent.com/github-linguist/linguist/main/lib/linguist/languages.yml';
const FALLBACK_COLORS = new Map(Object.entries({
  'C#': '#7355dd', 'C++': '#f34b7d', C: '#555555', Python: '#3572A5',
  JavaScript: '#f1e05a', TypeScript: '#3178c6', HTML: '#e34c26', CSS: '#663399',
  PowerShell: '#012456', Shell: '#89e051', Java: '#b07219', Go: '#00ADD8',
  Rust: '#dea584', Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138',
  Kotlin: '#A97BFF', Dart: '#00B4AB', Vue: '#41b883', Lua: '#000080',
}));

// A coordinated display palette. Statistics still use the original GitHub byte counts.
const DISPLAY_COLORS = new Map(Object.entries({
  'C#': '#9B8AFB', TypeScript: '#64A8EC', JavaScript: '#E8C96D',
  HTML: '#E9957A', XML: '#65BFB0', Python: '#78BBD3',
  'C++': '#E38EB2', CSS: '#BC96DF', Lua: '#909CE4', Java: '#D6AC76',
  PowerShell: '#8EAAC8', HLSL: '#A5C589', C: '#9CA8B8',
  CMake: '#CE8492', Batchfile: '#C1D58B',
}));

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
      401: 'PRIVATE_STATS_TOKEN is invalid or expired. Replace the repository secret.',
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
  if (!token?.trim()) throw new Error('Create the PRIVATE_STATS_TOKEN repository secret first.');
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

export function parseLinguistColors(yaml) {
  const colors = new Map();
  let language;
  for (const line of yaml.split(/\r?\n/)) {
    const heading = /^([^\s#].*):\s*$/.exec(line);
    if (heading) {
      language = heading[1];
      if (language.startsWith('"') && language.endsWith('"')) language = JSON.parse(language);
      else if (language.startsWith("'") && language.endsWith("'")) language = language.slice(1, -1).replaceAll("''", "'");
    }
    const color = /^  color:\s*["']?(#[\da-fA-F]{6})["']?\s*$/.exec(line);
    if (language && color) colors.set(language, color[1]);
  }
  return colors;
}

async function languageColors() {
  try {
    // The public color catalog request deliberately has no Authorization header.
    const response = await fetch(PALETTE_URL, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error();
    const colors = parseLinguistColors(await response.text());
    if (colors.size < 100) throw new Error();
    return colors;
  } catch {
    console.log('GitHub color catalog unavailable; using fallback language colors.');
    return FALLBACK_COLORS;
  }
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

function colorFor(language, colors) {
  const color = DISPLAY_COLORS.get(language) ?? colors.get(language) ?? FALLBACK_COLORS.get(language);
  if (/^#[\da-fA-F]{6}$/.test(color ?? '')) return color;
  let hash = 0;
  for (const char of language) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return `hsl(${hash % 360}, 55%, 50%)`;
}

export function renderSvg(totals, colors = FALLBACK_COLORS, dark = false) {
  const entries = [...totals].filter(([, bytes]) => bytes > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
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
    const [language, bytes] = entries[index];
    const width = index === entries.length - 1 ? CARD_WIDTH - PADDING - x : (bytes / total) * BAR_WIDTH;
    parts.push(`<rect x="${x.toFixed(6)}" y="43" width="${width.toFixed(6)}" height="9" fill="${colorFor(language, colors)}"/>`);
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
    parts.push(`<circle cx="${(columnX + 5).toFixed(3)}" cy="${y - 4}" r="5" fill="${colorFor(language, colors)}"/>`);
    parts.push(`<text x="${(columnX + 19).toFixed(3)}" y="${y}" font-size="14"${fitted}><tspan fill="${foreground}" font-weight="600">${escapeXml(language)}</tspan><tspan fill="${secondary}" dx="8">${escapeXml(share)}</tspan></text>`);
  }
  if (!entries.length) parts.push(`<text x="20" y="80" font-size="14" fill="${secondary}">No language data in the accessible repositories.</text>`);
  parts.push(`<text x="20" y="${height - 15}" font-size="12" fill="${secondary}">All Languages · Usage</text>`, '</g>', '</svg>', '');
  return parts.join('\n');
}

export async function main(env = process.env) {
  const [totals, colors] = await Promise.all([
    collectLanguages({ token: env.PRIVATE_STATS_TOKEN, owner: env.STATS_OWNER }),
    languageColors(),
  ]);
  const light = renderSvg(totals, colors);
  const dark = renderSvg(totals, colors, true);
  // Only aggregate SVGs are written. No repository lists, names, URLs or raw JSON.
  const directory = resolve('assets');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'private-languages.svg'), light, 'utf8');
  await writeFile(resolve(directory, 'private-languages-dark.svg'), dark, 'utf8');
  console.log('Updated language cards. Only aggregate language shares were saved.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Language statistics failed: ${error.message}`);
    process.exitCode = 1;
  });
}
