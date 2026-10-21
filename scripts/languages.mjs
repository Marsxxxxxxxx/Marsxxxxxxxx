// Node.js 18+; no npm packages required. Keep LANGUAGE_STATS_TOKEN in an Actions Secret.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const API = 'https://api.github.com';
// A soft full-wheel palette with consistent perceptual lightness and chroma.
const COLOR_LIGHTNESS = 0.74;
const COLOR_CHROMA = 0.12;
const HUE_START = 290;

const CARD_WIDTH = 840;
const PADDING = 20;
const CONTENT_WIDTH = CARD_WIDTH - PADDING * 2;
const LEGEND_COLUMNS = 3;
const COLUMN_WIDTH = CONTENT_WIDTH / LEGEND_COLUMNS;
const BAR_WIDTH = CONTENT_WIDTH;

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

function colorAtHue(hue) {
  const angle = hue * Math.PI / 180;
  let chroma = COLOR_CHROMA;
  let rgb;
  // OKLCH -> linear sRGB; reduce chroma only when a hue falls outside sRGB.
  // Conversion reference: https://www.w3.org/TR/css-color-4/#color-conversion-code
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const a = chroma * Math.cos(angle);
    const b = chroma * Math.sin(angle);
    const l = (COLOR_LIGHTNESS + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (COLOR_LIGHTNESS - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (COLOR_LIGHTNESS - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    rgb = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
    if (rgb.every((channel) => channel >= 0 && channel <= 1)) break;
    chroma *= 0.95;
  }
  return `#${rgb.map((channel) => {
    const linear = Math.min(1, Math.max(0, channel));
    const encoded = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255).toString(16).padStart(2, '0');
  }).join('').toUpperCase()}`;
}

export function rankColors(weights) {
  if (!Array.isArray(weights) || weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) {
    throw new Error('Color weights must be positive finite numbers.');
  }
  const count = weights.length;
  if (count === 0) return [];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let accumulated = 0;
  const centers = weights.map((weight) => {
    const center = (accumulated + weight / 2) / total;
    accumulated += weight;
    return center;
  });
  // Leave one color slot open so the first and last language do not share a hue.
  const hueSpan = 360 * (count - 1) / count;
  return centers.map((center, rank) => {
    const position = count === 1 ? 0 : 0.5 * rank / (count - 1) +
      0.5 * (center - centers[0]) / (centers[count - 1] - centers[0]);
    return colorAtHue(HUE_START - hueSpan * position);
  });
}

export function renderBarSeparators(widths, dark = false) {
  const parts = [];
  let x = PADDING;
  for (let index = 0; index < widths.length; index += 1) {
    if (index > 0 && widths[index - 1] >= 6 && widths[index] >= 6) {
      parts.push(`<path class="bar-divider" d="M${x.toFixed(6)} 43.5V51.5" stroke="${dark ? '#0d1117' : '#ffffff'}" stroke-width="1.1"/>`);
    }
    x += widths[index];
  }
  return parts.join('\n');
}

export function renderSvg(totals, dark = false) {
  const entries = [...totals].filter(([, bytes]) => bytes > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const colors = rankColors(entries.map(([, bytes]) => bytes));
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
  const widths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const [, bytes] = entries[index];
    const width = index === entries.length - 1 ? CARD_WIDTH - PADDING - x : (bytes / total) * BAR_WIDTH;
    widths.push(width);
    parts.push(`<rect class="bar-segment" data-language="${escapeXml(entries[index][0])}" data-share="${(bytes / total).toPrecision(16)}" x="${x.toFixed(6)}" y="43" width="${width.toFixed(6)}" height="9" fill="${colors[index]}"/>`);
    x += width;
  }
  parts.push(renderBarSeparators(widths, dark), '</g>');
  // Separators are omitted next to tiny segments, keeping every language visible.
  for (let index = 0; index < entries.length; index += 1) {
    const [language, bytes] = entries[index];
    const percent = (bytes / total) * 100;
    const share = percent < 0.1 ? '<0.1%' : `${percent.toFixed(1)}%`;
    const columnX = PADDING + (index % LEGEND_COLUMNS) * COLUMN_WIDTH;
    const y = 80 + Math.floor(index / LEGEND_COLUMNS) * 28;
    const label = `${language}  ${share}`;
    const labelWidth = Math.floor(COLUMN_WIDTH - 39);
    const fitted = [...label].length * 7.5 > labelWidth ? ` textLength="${labelWidth}" lengthAdjust="spacingAndGlyphs"` : '';
    parts.push(`<circle class="legend-dot" cx="${(columnX + 5).toFixed(3)}" cy="${y - 4}" r="5" fill="${colors[index]}" stroke="${foreground}" stroke-opacity="0.35" stroke-width="0.7"/>`);
    parts.push(`<text class="legend-label" x="${(columnX + 19).toFixed(3)}" y="${y}" font-size="14"${fitted}><tspan fill="${foreground}" font-weight="600">${escapeXml(language)}</tspan><tspan fill="${secondary}" dx="8">${escapeXml(share)}</tspan></text>`);
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
