import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { optionSets } from '../public/assets/expanded-options.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const mapPath = join(root, 'public', 'assets', 'online-images.js');
const attributionPath = join(root, 'public', 'assets', 'online-image-attribution.json');
const userAgent = 'WasanerLingaraLocalGame/1.0 (local educational project)';
const concurrency = 2;

const categoryQueries = {
  animals: (text) => `${text} animal`,
  foods: (text) => `${text} food`,
  locations: (text) => text,
  countries: (text) => `Flag of ${text}`,
  movies: (text) => `${text} film`,
  jobs: (text) => `${text} occupation`,
  technologies: (text) => `${text} technology`,
  imaginations: (text) => `${text} illustration`,
  supes: (text) => `${text} cosplay`,
  nature: (text) => `${text} nature`,
  histories: (text) => text,
  sports: (text) => `${text} sport`
};

const categoryDescriptions = {
  animals: ['animal', 'bird', 'fish', 'mammal', 'reptile', 'insect', 'species'],
  foods: ['food', 'dish', 'cuisine', 'fruit', 'vegetable', 'drink'],
  locations: ['building', 'place', 'facility', 'station', 'area'],
  countries: ['country', 'state', 'nation'],
  movies: ['film', 'movie', 'television'],
  jobs: ['occupation', 'profession', 'worker', 'specialist'],
  technologies: ['technology', 'device', 'software', 'hardware', 'system'],
  imaginations: ['mythological', 'fictional', 'legendary', 'fantasy'],
  supes: ['superhero', 'fictional character', 'comic'],
  nature: ['natural', 'geographical', 'weather', 'phenomenon'],
  histories: ['historical', 'history', 'war', 'event', 'civilization', 'person'],
  sports: ['sport', 'game', 'athletic']
};

const strictDescriptionKeywords = {
  movies: ['film', 'movie', 'television', 'series', 'media franchise', 'animation'],
  supes: ['superhero', 'fictional character', 'comic', 'manga', 'anime']
};

const extensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/svg+xml': '.svg'
};

const extensionMimes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

function cleanHtml(value = '') {
  return value
    .replace(/<[^>]+>/g, '')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&amp;', '&')
    .trim();
}

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/^file:/, '')
    .replace(extname(value), '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isRelevantDescription(categoryId, description = '') {
  const keywords = strictDescriptionKeywords[categoryId];

  if (!keywords) {
    return true;
  }

  const normalizedDescription = normalize(description);

  return keywords.some((keyword) => normalizedDescription.includes(keyword));
}

function scoreResult(title, query) {
  const normalizedTitle = normalize(title);
  const queryWords = normalize(query)
    .split(' ')
    .filter((word) => word.length > 2 && !['the', 'film', 'food', 'sport', 'animal'].includes(word));

  return queryWords.reduce(
    (score, word) => score + (normalizedTitle.includes(word) ? 3 : -2),
    normalizedTitle.startsWith(normalize(query)) ? 8 : 0
  );
}

async function getCommonsFile(filename) {
  const parameters = new URLSearchParams({
    action: 'query',
    titles: `File:${filename}`,
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '500',
    iiextmetadatafilter:
      'Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|AttributionRequired|ImageDescription|Categories',
    format: 'json',
    origin: '*'
  });
  const response = await fetchWithRetry(`https://commons.wikimedia.org/w/api.php?${parameters}`, {
    headers: { 'User-Agent': userAgent }
  });

  if (!response.ok) {
    throw new Error(`Commons file lookup failed with ${response.status}`);
  }

  const payload = await response.json();
  const page = Object.values(payload.query?.pages ?? {})[0];
  const image = page?.imageinfo?.[0];

  if (!page || page.missing || !image?.thumburl || !extensions[image.mime]) {
    return null;
  }

  return { page, image, score: 100 };
}

function summaryTitle(categoryId, text) {
  if (categoryId === 'countries') {
    return `Flag of ${text}`;
  }

  return text;
}

async function searchWikipediaSummary(categoryId, text) {
  const title = summaryTitle(categoryId, text).replaceAll(' ', '_');
  const response = await fetchWithRetry(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    {
      headers: {
        'Api-User-Agent': userAgent,
        'User-Agent': userAgent
      }
    }
  );

  if (!response.ok) {
    return null;
  }

  const summary = await response.json();
  const imageUrl = summary.thumbnail?.source;

  if (
    summary.type !== 'standard' ||
    !imageUrl?.includes('upload.wikimedia.org/wikipedia/commons/') ||
    !isRelevantDescription(
      categoryId,
      `${summary.description ?? ''} ${summary.extract ?? ''}`
    )
  ) {
    return null;
  }

  const parts = new URL(imageUrl).pathname.split('/');
  const filename = decodeURIComponent(
    parts.includes('thumb') ? parts.at(-2) : parts.at(-1)
  ).replaceAll('_', ' ');
  const mime = extensionMimes[extname(filename).toLowerCase()];

  if (!mime) {
    return null;
  }

  return {
    page: {
      title: `File:${filename}`
    },
    image: {
      thumburl: imageUrl,
      url: summary.originalimage?.source ?? imageUrl,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename.replaceAll(' ', '_'))}`,
      mime,
      extmetadata: {
        ImageDescription: { value: summary.description ?? summary.extract ?? '' },
        LicenseShortName: { value: 'See Wikimedia Commons source page' }
      }
    },
    score: 100
  };
}

async function getWikidataEntityImage(entityId, categoryId) {
  const parameters = new URLSearchParams({
    action: 'wbgetentities',
    ids: entityId,
    props: 'claims',
    format: 'json',
    origin: '*'
  });
  const response = await fetchWithRetry(`https://www.wikidata.org/w/api.php?${parameters}`, {
    headers: { 'User-Agent': userAgent }
  });

  if (!response.ok) {
    throw new Error(`Wikidata entity lookup failed with ${response.status}`);
  }

  const entity = (await response.json()).entities?.[entityId];
  const preferredProperties = categoryId === 'countries' ? ['P41', 'P18'] : ['P18'];

  for (const property of preferredProperties) {
    const filename = entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;

    if (filename) {
      const result = await getCommonsFile(filename);

      if (result) {
        return result;
      }
    }
  }

  return null;
}

async function searchWikidata(categoryId, text) {
  const parameters = new URLSearchParams({
    action: 'wbsearchentities',
    search: text,
    language: 'en',
    uselang: 'en',
    type: 'item',
    limit: '8',
    format: 'json',
    origin: '*'
  });
  const response = await fetchWithRetry(`https://www.wikidata.org/w/api.php?${parameters}`, {
    headers: { 'User-Agent': userAgent }
  });

  if (!response.ok) {
    throw new Error(`Wikidata search failed with ${response.status}`);
  }

  const normalizedText = normalize(text);
  const descriptors = categoryDescriptions[categoryId];
  const results = (await response.json()).search ?? [];
  const ranked = results
    .map((result) => {
      const label = normalize(result.label ?? '');
      const description = normalize(result.description ?? '');
      const exactLabelScore = label === normalizedText ? 30 : label.includes(normalizedText) ? 12 : 0;
      const categoryScore = descriptors.reduce(
        (score, descriptor) => score + (description.includes(descriptor) ? 4 : 0),
        0
      );

      return { result, score: exactLabelScore + categoryScore };
    })
    .filter(({ score }) => score >= 12)
    .sort((left, right) => right.score - left.score);

  for (const { result } of ranked.slice(0, 3)) {
    const image = await getWikidataEntityImage(result.id, categoryId);

    if (image) {
      return image;
    }
  }

  return null;
}

async function searchWikipedia(categoryId, text) {
  const query = categoryQueries[categoryId](text);
  const parameters = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '0',
    gsrlimit: '5',
    prop: 'pageimages',
    piprop: 'name',
    redirects: '1',
    format: 'json',
    origin: '*'
  });
  const response = await fetchWithRetry(`https://en.wikipedia.org/w/api.php?${parameters}`, {
    headers: { 'User-Agent': userAgent }
  });

  if (!response.ok) {
    throw new Error(`Wikipedia search failed with ${response.status}`);
  }

  const payload = await response.json();
  const pages = Object.values(payload.query?.pages ?? {})
    .filter((page) => page.pageimage)
    .sort(
      (left, right) =>
        scoreResult(right.title, text) * 3 +
        scoreResult(right.title, query) -
        (scoreResult(left.title, text) * 3 + scoreResult(left.title, query))
    );

  for (const page of pages) {
    const result = await getCommonsFile(page.pageimage);

    if (result) {
      return result;
    }
  }

  return null;
}

async function fetchWithRetry(url, options = {}, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, options);

    if (response.status !== 429 && response.status < 500) {
      return response;
    }

    if (attempt === attempts) {
      return response;
    }

    const retryAfter = Number(response.headers.get('retry-after') ?? 0);
    const delay = retryAfter > 0 ? retryAfter * 1000 : attempt * 1500;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function readExistingAttributions() {
  try {
    return Object.fromEntries(
      Object.entries(JSON.parse(await readFile(attributionPath, 'utf8'))).filter(
        ([, attribution]) =>
          isRelevantDescription(attribution.categoryId, attribution.description)
      )
    );
  } catch {
    return {};
  }
}

async function searchCommons(categoryId, text) {
  const query = categoryQueries[categoryId](text);
  const parameters = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `File:${query}`,
    gsrnamespace: '6',
    gsrlimit: '6',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '500',
    iiextmetadatafilter:
      'Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|AttributionRequired|ImageDescription|Categories',
    format: 'json',
    origin: '*'
  });
  const response = await fetchWithRetry(`https://commons.wikimedia.org/w/api.php?${parameters}`, {
    headers: { 'User-Agent': userAgent }
  });

  if (!response.ok) {
    throw new Error(`Commons search failed with ${response.status}`);
  }

  const payload = await response.json();
  const results = Object.values(payload.query?.pages ?? {})
    .map((page) => ({
      page,
      image: page.imageinfo?.[0],
      score: scoreResult(
        `${page.title} ${page.imageinfo?.[0]?.extmetadata?.ImageDescription?.value ?? ''} ${page.imageinfo?.[0]?.extmetadata?.Categories?.value ?? ''}`,
        query
      )
    }))
    .filter(({ image }) => image?.thumburl && extensions[image.mime])
    .sort((left, right) => right.score - left.score);

  return results[0] ?? null;
}

function buildAttribution(categoryId, text, result, path) {
  const metadata = result.image.extmetadata ?? {};

  return {
    categoryId,
    text,
    path,
    sourceTitle: result.page.title,
    sourcePage: result.image.descriptionurl,
    originalUrl: result.image.url,
    thumbnailUrl: result.image.thumburl,
    description: cleanHtml(metadata.ImageDescription?.value),
    creator: cleanHtml(metadata.Artist?.value || metadata.Credit?.value),
    license: cleanHtml(metadata.LicenseShortName?.value || metadata.UsageTerms?.value),
    licenseUrl: metadata.LicenseUrl?.value ?? '',
    attributionRequired: metadata.AttributionRequired?.value === 'true'
  };
}

async function writeOutputs(attributions) {
  const sortedEntries = Object.entries(attributions).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  const map = Object.fromEntries(
    sortedEntries.map(([key, attribution]) => [
      key,
      {
        path: attribution.path,
        sourcePage: attribution.sourcePage,
        license: attribution.license
      }
    ])
  );

  await writeFile(
    mapPath,
    `export const onlineImages = ${JSON.stringify(map, null, 2)};\n`
  );
  await writeFile(attributionPath, `${JSON.stringify(Object.fromEntries(sortedEntries), null, 2)}\n`);
}

async function processEntry(entry, attributions) {
  const key = `${entry.categoryId}:${entry.text}`;

  if (attributions[key]) {
    return 'existing';
  }

  try {
    const deepSearch = process.argv.includes('--deep');
    const result =
      (await searchWikipediaSummary(entry.categoryId, entry.text)) ??
      (deepSearch
        ? (await searchWikidata(entry.categoryId, entry.text)) ??
          (await searchWikipedia(entry.categoryId, entry.text)) ??
          (await searchCommons(entry.categoryId, entry.text))
        : null);

    if (!result || result.score < 1) {
      return 'missing';
    }

    const path = result.image.thumburl;
    attributions[key] = buildAttribution(entry.categoryId, entry.text, result, path);
    console.log(`✓ ${key} → ${result.page.title}`);

    return 'downloaded';
  } catch (error) {
    console.warn(`✗ ${key}: ${error.message}`);
    return 'failed';
  }
}

async function main() {
  const categoryArgument = process.argv.find((argument) => argument.startsWith('--category='));
  const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
  const category = categoryArgument?.split('=')[1];
  const limit = Number(limitArgument?.split('=')[1] ?? Number.POSITIVE_INFINITY);
  const entries = Object.entries(optionSets)
    .filter(([categoryId]) => !category || categoryId === category)
    .flatMap(([categoryId, values]) =>
      values
        .split('|')
        .slice(0, 100)
        .map((text) => ({ categoryId, text }))
    )
    .slice(0, limit);
  const attributions = await readExistingAttributions();
  const totals = { downloaded: 0, existing: 0, missing: 0, failed: 0 };
  let cursor = 0;

  async function worker() {
    while (cursor < entries.length) {
      const entry = entries[cursor];
      cursor += 1;
      totals[await processEntry(entry, attributions)] += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (cursor % 20 === 0) {
        await writeOutputs(attributions);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await writeOutputs(attributions);
  console.log(totals);
}

await main();
