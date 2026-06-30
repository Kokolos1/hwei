// ── ABILITY EXPAND TOGGLE ──
function toggleAbility(key) {
  const keys = ['passive','q','w','e','r'];
  const wasOpen = document.getElementById('panel-' + key).classList.contains('open');

  // Close all panels first
  keys.forEach(k => {
    document.getElementById('panel-' + k).classList.remove('open');
    document.getElementById('abl-' + k).classList.remove('active');
  });

  // If it wasn't already open, open it and scroll the ability row into view
  if (!wasOpen) {
    document.getElementById('panel-' + key).classList.add('open');
    document.getElementById('abl-' + key).classList.add('active');

    // Scroll so the ability card row stays pinned just below the sticky navs
    const row = document.getElementById('ability-row');
    const navHeight = (document.getElementById('topnav')?.offsetHeight || 0)
                    + (document.querySelector('.page-subnav')?.offsetHeight || 0)
                    + 12;
    const rowTop = row.getBoundingClientRect().top + window.scrollY - navHeight;
    setTimeout(() => {
      window.scrollTo({ top: rowTop, behavior: 'smooth' });
    }, 30);
  }
}

function switchSpellVariant(btn, id) {
  const shell = btn.closest('.spell-detail-shell');
  if (!shell) return;
  shell.querySelectorAll('.spell-variant-tab').forEach(tab => tab.classList.remove('active'));
  shell.querySelectorAll('.spell-variant-pane').forEach(pane => pane.classList.remove('active'));
  btn.classList.add('active');
  shell.querySelector('#' + id)?.classList.add('active');
}

// ── SUBNAV SCROLL ──
function subnavScroll(el, targetId) {
  // Update active state within this subnav
  const subnav = el.closest('.page-subnav');
  subnav.querySelectorAll('.subnav-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  // Scroll to section
  const target = document.getElementById(targetId);
  if (target) {
    setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  }
}

// ── LANGUAGE ──
const langLabels = { en:'English',es:'Español',fr:'Français',de:'Deutsch',pt:'Brasileiro',it:'Italiano',ro:'Română',tr:'Türkçe',pl:'Polski',ru:'Русский',ko:'한국어',ja:'日本語' };
const langStorageKey = 'hweiGuideLanguage';
const translationCachePrefix = 'hweiGuideTranslation:';
const translationSkipSelector = [
  'script',
  'style',
  'noscript',
  'code',
  'pre',
  'svg',
  'canvas',
  'iframe',
  'video',
  'audio',
  '.lang-grid',
  '.rune-node-name',
  '.rune-selected-list',
  '.item-icon',
  '.matchup-name',
  '.tier-champ',
  '.toc-link',
  '.matchup-image-link',
  '.champion-icon',
  '[data-no-translate]'
].join(',');
const translationPreserveText = new Set([
  'Hwei', 'Mel', 'Aphelios', 'Ashe', 'Aurelion Sol', 'Brand', 'Caitlyn', 'Corki', 'Draven', 'Ezreal',
  'Heimerdinger', 'Jhin', 'Jinx', "Kai'Sa", 'Kalista', 'Karma', 'Karthus', "Kog'Maw", 'Lucian', 'Lux',
  'Miss Fortune', 'Morgana', 'Nilah', 'Samira', 'Senna', 'Seraphine', 'Sivir', 'Smolder', 'Syndra',
  'Tristana', 'Twitch', 'Varus', 'Vayne', 'Xayah', 'Yunara', 'Zeri', 'Ziggs', 'Zyra',
  'Q', 'W', 'E', 'R', 'QQ', 'QW', 'QE', 'WQ', 'WW', 'WE', 'EQ', 'EW', 'EE'
]);
const memoryStorage = {};
function safeStorageGet(key) {
  try {
    return window.localStorage?.getItem(key) ?? memoryStorage[key] ?? null;
  } catch (error) {
    return memoryStorage[key] ?? null;
  }
}
function safeStorageSet(key, value) {
  memoryStorage[key] = value;
  try {
    window.localStorage?.setItem(key, value);
  } catch (error) {
    // In private or sandboxed contexts, in-memory storage keeps this page functional.
  }
}
let selLangCode = safeStorageGet(langStorageKey) || 'en';
let translationNodes = [];
let translationAttributes = [];

function selLang(btn) {
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  selLangCode = btn.dataset.lang || 'en';
}

function openLang() {
  const overlay = document.getElementById('lang-overlay');
  if (!overlay) return;
  syncLanguageButtons(selLangCode);
  overlay.style.display = 'flex';
}

function syncLanguageButtons(lang) {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('sel', btn.dataset.lang === lang);
  });
  const label = document.getElementById('lang-label');
  if (label) label.textContent = langLabels[lang] || 'English';
}

function normalizeTranslationText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function shouldTranslateText(text) {
  const value = normalizeTranslationText(text);
  if (!value || value.length < 2) return false;
  if (translationPreserveText.has(value)) return false;
  if (/^[\d\s.,:+\-/%()]+$/.test(value)) return false;
  return /[A-Za-z]/.test(value);
}

function isTranslatableNode(node) {
  const parent = node.parentElement;
  if (!parent || parent.closest(translationSkipSelector)) return false;
  return shouldTranslateText(node.nodeValue);
}

function captureTranslationTargets() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return isTranslatableNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  translationNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    node.__hweiOriginalText = node.__hweiOriginalText || node.nodeValue;
    translationNodes.push(node);
  }

  translationAttributes = [];
  document.querySelectorAll('[placeholder], [title], [aria-label], img[alt]').forEach(el => {
    if (el.closest(translationSkipSelector)) return;
    ['placeholder', 'title', 'aria-label', 'alt'].forEach(attr => {
      const value = el.getAttribute(attr);
      if (!shouldTranslateText(value)) return;
      const key = `hweiOriginal${attr.replace(/[^a-z]/gi, '')}`;
      el.dataset[key] = el.dataset[key] || value;
      translationAttributes.push({ el, attr, original: el.dataset[key] });
    });
  });
}

function restoreEnglishText() {
  translationNodes.forEach(node => {
    if (node.__hweiOriginalText != null) node.nodeValue = node.__hweiOriginalText;
  });
  translationAttributes.forEach(item => item.el.setAttribute(item.attr, item.original));
}

function getTranslationCache(lang, pageKey) {
  try {
    return JSON.parse(safeStorageGet(`${translationCachePrefix}${lang}:${pageKey}`) || '{}');
  } catch (error) {
    return {};
  }
}

function setTranslationCache(lang, pageKey, cache) {
  safeStorageSet(`${translationCachePrefix}${lang}:${pageKey}`, JSON.stringify(cache));
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function fetchTranslations(texts, target) {
  const translations = [];
  for (const chunk of chunkArray(texts, 45)) {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, texts: chunk })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.message || 'Translation failed.');
    translations.push(...result.translations);
  }
  return translations;
}

async function applyLanguage(lang) {
  const targetLang = lang || 'en';
  captureTranslationTargets();
  restoreEnglishText();
  document.documentElement.lang = targetLang;
  syncLanguageButtons(targetLang);
  safeStorageSet(langStorageKey, targetLang);

  if (targetLang === 'en') return;

  const pageKey = window.location.pathname.split('/').pop() || 'index.html';
  const cache = getTranslationCache(targetLang, pageKey);
  const targets = [
    ...translationNodes.map(node => ({ type: 'node', ref: node, original: normalizeTranslationText(node.__hweiOriginalText) })),
    ...translationAttributes.map(item => ({ type: 'attribute', ref: item, original: normalizeTranslationText(item.original) }))
  ].filter(item => item.original);

  const missing = Array.from(new Set(targets.map(item => item.original).filter(text => !cache[text])));
  if (missing.length) {
    const label = document.getElementById('lang-label');
    if (label) label.textContent = 'Translating...';
    const translated = await fetchTranslations(missing, targetLang);
    missing.forEach((text, index) => { cache[text] = translated[index] || text; });
    setTranslationCache(targetLang, pageKey, cache);
  }

  targets.forEach(item => {
    const translated = cache[item.original] || item.original;
    if (item.type === 'node') item.ref.nodeValue = item.ref.__hweiOriginalText.replace(item.original, translated);
    else item.ref.el.setAttribute(item.ref.attr, translated);
  });
  syncLanguageButtons(targetLang);
}

async function confirmLang() {
  const overlay = document.getElementById('lang-overlay');
  const confirmButton = overlay?.querySelector('.lang-confirm');
  const originalConfirmText = confirmButton?.textContent;
  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.textContent = selLangCode === 'en' ? 'Loading English...' : 'Translating...';
  }
  try {
    await applyLanguage(selLangCode);
    if (overlay) overlay.style.display = 'none';
  } catch (error) {
    console.warn(error);
    syncLanguageButtons('en');
  } finally {
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = originalConfirmText || 'Continue to Guide';
    }
  }
}

// ── NAVIGATION ──
function goPage(pageId, navEl, scrollTo) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Show target
  document.getElementById('page-' + pageId).classList.add('active');
  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const target = navEl || document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (target) target.classList.add('active');
  // Scroll to subsection if specified
  if (scrollTo) {
    setTimeout(() => {
      const el = document.getElementById(scrollTo);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  // Close mobile sidebar (no-op now, kept for safety)
  const sb = document.getElementById('sidebar');
  if (sb) sb.classList.remove('open');
}

// ── HORIZONTAL NAV DROPDOWNS ──
function toggleNav(navEl, subId) {
  const sub = document.getElementById(subId);
  const pageId = navEl.dataset.page;
  const isOpen = sub.classList.contains('open');

  // Close all dropdowns
  document.querySelectorAll('.nav-sub').forEach(s => s.classList.remove('open'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('open'));

  if (!isOpen) {
    sub.classList.add('open');
    navEl.classList.add('open');
    navEl.classList.add('active');
    goPage(pageId, navEl);
  }
}

// Close dropdowns when clicking outside nav
document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-dropdown-wrapper') && !e.target.closest('.topnav-nav')) {
    document.querySelectorAll('.nav-sub').forEach(s => s.classList.remove('open'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('open'));
  }
});

// ── ACCORDIONS ──
function toggleAccordion(header) {
  const body = header.nextElementSibling;
  const isOpen = header.classList.contains('open');
  header.classList.toggle('open', !isOpen);
  body.classList.toggle('open', !isOpen);
}

const MATCHUP_DIFFICULTY_MAP = {
  aphelios: 2, ashe: 3, 'aurelion-sol': 3, brand: 3, caitlyn: 4, corki: 4, draven: 2, ezreal: 5,
  heimerdinger: 3, hwei: 4, jhin: 5, jinx: 2, 'kaisa': 5, kalista: 5, karma: 3, karthus: 7,
  'kogmaw': 4, lucian: 6, lux: 3, mel: 2, 'miss-fortune': 4, morgana: 3, nilah: 1, samira: 4,
  senna: 3, syndra: 8, seraphine: 1, sivir: 10, smolder: 3, tristana: 5, twitch: 2, varus: 2,
  vayne: 5, xayah: 4, yunara: 4, zeri: 4, ziggs: 3, zyra: 5
};

function getMatchupCardName(card) {
  return card.querySelector('.matchup-name')?.textContent?.trim()
    || card.querySelector('.card-title')?.textContent?.trim()
    || '';
}

function getMatchupCardDifficulty(card) {
  const id = card.id || '';
  return MATCHUP_DIFFICULTY_MAP[id] || 4;
}

function sortMatchupCards(mode) {
  const container = document.getElementById('matchup-cards');
  if (!container) return;

  const cards = Array.from(container.querySelectorAll(':scope > .card'));
  if (!cards.length) return;

  cards.sort((a, b) => {
    if (mode === 'difficulty') {
      const diffDelta = getMatchupCardDifficulty(a) - getMatchupCardDifficulty(b);
      if (diffDelta !== 0) return diffDelta;
    }
    return getMatchupCardName(a).localeCompare(getMatchupCardName(b));
  });

  cards.forEach(card => container.appendChild(card));
}

function setMatchupSortMode(mode) {
  const btn = document.getElementById('matchup-sort-btn');
  if (!btn) return;

  const normalizedMode = mode === 'difficulty' ? 'difficulty' : 'alphabetical';
  btn.dataset.sortMode = normalizedMode;
  btn.textContent = normalizedMode === 'difficulty'
    ? 'Sort By: Difficulty (Easy -> Hard)'
    : 'Sort By: Alphabetical (A-Z)';

  sortMatchupCards(normalizedMode);
}

function toggleMatchupSort() {
  const btn = document.getElementById('matchup-sort-btn');
  if (!btn) return;
  const nextMode = btn.dataset.sortMode === 'difficulty' ? 'alphabetical' : 'difficulty';
  setMatchupSortMode(nextMode);
}

function initMatchupSortControls() {
  const btn = document.getElementById('matchup-sort-btn');
  if (!btn) return;
  btn.addEventListener('click', toggleMatchupSort);
  setMatchupSortMode('alphabetical');
}

function smoothScrollElementToCenter(target) {
  if (!target) return;
  const targetRect = target.getBoundingClientRect();
  const targetHeight = targetRect.height;
  const viewportHeight = window.innerHeight;
  const centerOffset = Math.max((viewportHeight - targetHeight) / 2, 0);
  const top = Math.max(window.scrollY + targetRect.top - centerOffset, 0);
  window.scrollTo({ top, behavior: 'smooth' });
}

function initMatchupDifficultyJump() {
  document.addEventListener('click', (event) => {
    const jumpLink = event.target.closest('.matchup-diff-badge-link');
    if (!jumpLink) return;

    event.preventDefault();
    const target = document.getElementById('matchup-toc');
    smoothScrollElementToCenter(target);
  });
}

function initTierListSmoothJump() {
  document.addEventListener('click', (event) => {
    const tierLink = event.target.closest('#tierlist-sec a.tier-champ');
    if (!tierLink) return;

    const href = tierLink.getAttribute('href') || '';
    if (!href.startsWith('#')) return;

    const targetId = href.slice(1);
    const target = document.getElementById(targetId);
    if (!target) return;

    event.preventDefault();
    smoothScrollElementToCenter(target);
  });
}

function initTocSmoothJump() {
  document.addEventListener('click', (event) => {
    const tocLink = event.target.closest('#matchup-toc a.toc-link');
    if (!tocLink) return;

    const href = tocLink.getAttribute('href') || '';
    if (!href.startsWith('#')) return;

    const targetId = href.slice(1);
    const target = document.getElementById(targetId);
    if (!target) return;

    event.preventDefault();
    smoothScrollElementToCenter(target);
  });
}

// ── TABS ──
function switchTab(btn, id) {
  const sec = btn.closest('section, .page-body, div');
  // Find tab bar parent
  const tabBar = btn.closest('.tab-bar') || btn.parentElement;
  tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  // Find panes — siblings after tab bar
  document.querySelectorAll(`#${id}`).forEach(p => {});
  btn.classList.add('active');
  // Toggle panes in same container
  const container = tabBar.parentElement;
  container.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  container.querySelector('#' + id).classList.add('active');
}

function switchCoreBuild(btn, id) {
  const shell = btn.closest('.core-builds-shell');
  if (!shell) return;
  shell.querySelectorAll('.core-build-tab').forEach(tab => tab.classList.remove('active'));
  shell.querySelectorAll('.core-build-pane').forEach(pane => pane.classList.remove('active'));
  btn.classList.add('active');
  shell.querySelector('#' + id)?.classList.add('active');
}

const HWEI_RUNE_PAGES = {
  default: {
    kicker: 'Recommended Page',
    title: 'Recommended Comet',
    summary: 'Default Hwei rune page. Generally just the strongest runes you can take outside of special circumstances. Run this in 80% of games.',
    primary: {
      type: 'Primary',
      tree: 'Sorcery',
      mark: 'S',
      runes: ['Arcane Comet', 'Manaflow Band', 'Transcendence', 'Gathering Storm']
    },
    secondary: {
      type: 'Secondary',
      tree: 'Precision',
      mark: 'P',
      runes: ['Legend: Haste', 'Cut Down']
    },
    shards: ['Ability Haste', 'Adaptive Force', 'Flat Health'],
    useCase: 'Default into pretty much every lane unless you need aery into a melee comp, or scorch/second adaptive shard for stronger early trades.',
    swapNote: 'Can be swapped if you generally prefer scorch (not much difference with gathering storm). Precision secondary is mandatory.'
  },
  early: {
    kicker: 'Lane Pressure',
    title: 'Early Game Comet',
    summary: 'Early-focused Comet page. Run into snowball lanes (Draven). Essentially just scorch & second adaptive shard for max poke damage early',
    primary: {
      type: 'Primary',
      tree: 'Sorcery',
      mark: 'S',
      runes: ['Arcane Comet', 'Manaflow Band', 'Transcendence', 'Scorch']
    },
    secondary: {
      type: 'Secondary',
      tree: 'Precision',
      mark: 'P',
      runes: ['Legend: Haste', 'Cut Down']
    },
    shards: ['Adaptive Force', 'Adaptive Force', 'Flat Health'],
    useCase: 'Take this when Hwei can contest early waves, your support can trade, or the lane is decided before first dragon.',
    swapNote: 'Go back to Recommended when both teams are farming and you can comfortably wait for Gathering Storm.'
  },
  melee: {
    kicker: 'Versus Melee',
    title: 'Aery Melee Comp',
    summary: 'Aery variation for melee-heavy enemy comps. Only run when you can proc aery frequently.',
    primary: {
      type: 'Primary',
      tree: 'Sorcery',
      mark: 'S',
      runes: ['Summon Aery', 'Manaflow Band', 'Transcendence', 'Gathering Storm']
    },
    secondary: {
      type: 'Secondary',
      tree: 'Precision',
      mark: 'P',
      runes: ['Legend: Haste', 'Cut Down']
    },
    shards: ['Ability Haste', 'Adaptive Force', 'Flat Health'],
    useCase: 'Use when the enemy bot lane or team comp has multiple melee champions walking into Hwei spell range.',
    swapNote: 'Use Comet instead when the main threats are ranged and you need longer-range poke to connect.'
  }
};

const HWEI_RUNE_FAQS = [
  {
    question: 'Which page should I use by default?',
    answer: 'Use Recommended Comet in most games. It gives reliable poke, scaling damage, ability haste, and enough lane stability for standard bot/APC matchups. Basically just the highest WR/best runes for Hwei.'
  },
  {
    question: 'When should I take the Early Game Comet page?',
    answer: 'Take it when the lane will be decided early. Obvious lanes include Draven, or other snowbally ADCS. Check matchups for more information. I only run this rune page about 10% of the time.'
  },
  {
    question: 'When is Aery better than Comet?',
    answer: 'Aery is best when enemies are low-range & you can proc it frequently. Strongest when you dont land long-range poke. Theoretically, Aery also scales marginally better than Comet.'
  },
  {
    question: 'Why Legend: Haste instead of POM (Presence of Mind)?',
    answer: 'Hwei already runs manaflow band inside of sorcery in all pages for his primary setup. You CAN run POM if you find yourself needing extra mana, though personally, I never go OOM after lane-phase with just manaflow.'
  },
  {
    question: 'Why Cut Down as the second Precision rune?',
    answer: 'Cut Down is insanely broken. Does almost the same damage as your Keystone rune on average. Highest winrate of the runes  in this row (and averages 600 more than the 2nd best option). Super OP and a must-take every game.'
  },
  {
    question: 'Why not Deathfire Touch?',
    answer: 'This rune is really really bad on Hwei. On average, it does several hundred damage less than comet/aery. This is due to Hwei having mostly periodic (except EQ/EW) spells. These only proc DFT for 2 seconds each.'
  }
];

const RUNE_TREE_ICONS = {
  Sorcery: 'images/runes/sorcery.png',
  Precision: 'images/runes/precision.png',
  Inspiration: 'images/runes/inspiration.png'
};

const RUNE_ICONS = {
  'Summon Aery': 'images/runes/summon-aery.png',
  'Arcane Comet': 'images/runes/arcane-comet.png',
  "Stormraider's Surge": 'images/runes/stormraiders-surge.png',
  'Deathfire Touch': 'images/runes/deathfire-touch.png',
  'Axiom Arcanist': 'images/runes/axiom-arcanist.png',
  'Manaflow Band': 'images/runes/manaflow-band.png',
  'Nimbus Cloak': 'images/runes/nimbus-cloak.png',
  Transcendence: 'images/runes/transcendence.png',
  Celerity: 'images/runes/celerity.png',
  'Absolute Focus': 'images/runes/absolute-focus.png',
  Scorch: 'images/runes/scorch.png',
  Waterwalking: 'images/runes/waterwalking.png',
  'Gathering Storm': 'images/runes/gathering-storm.png',
  'Absorb Life': 'images/runes/absorb-life.png',
  Triumph: 'images/runes/triumph.png',
  'Presence of Mind': 'images/runes/presence-of-mind.png',
  'Legend: Alacrity': 'images/runes/legend-alacrity.png',
  'Legend: Haste': 'images/runes/legend-haste.png',
  'Legend: Bloodline': 'images/runes/legend-bloodline.png',
  'Coup de Grace': 'images/runes/coup-de-grace.png',
  'Cut Down': 'images/runes/cut-down.png',
  'Last Stand': 'images/runes/last-stand.png',
  'First Strike': 'images/runes/first-strike.png',
  'Magical Footwear': 'images/runes/magical-footwear.png',
  'Cash Back': 'images/runes/cash-back.png',
  'Triple Tonic': 'images/runes/triple-tonic.png',
  'Biscuit Delivery': 'images/runes/biscuit-delivery.png',
  'Cosmic Insight': 'images/runes/cosmic-insight.png'
};

const RUNE_DESCRIPTIONS = {
  'Summon Aery': 'Your attacks and abilities send Aery to a target, damaging enemies or shielding allies.',
  'Arcane Comet': 'Damaging a champion with an ability hurls a damaging comet at their location.',
  "Stormraider's Surge": 'Dealing a large chunk of a champion\'s maximum health grants a burst of move speed and slow resist.',
  'Deathfire Touch': 'Damaging a champion with an ability burns them over time.',
  'Axiom Arcanist': 'Your ultimate is stronger, and champion takedowns reduce its current cooldown.',
  'Manaflow Band': 'Hitting enemy champions with abilities permanently increases maximum mana, then restores missing mana over time.',
  'Nimbus Cloak': 'After casting a summoner spell, gain a short burst of move speed and pass through units.',
  Transcendence: 'Gain ability haste at levels 5 and 8. At level 11, takedowns reduce basic ability cooldowns.',
  Celerity: 'Move speed bonuses are more effective on you, and you gain a small amount of move speed.',
  'Absolute Focus': 'While above 70% health, gain extra adaptive damage.',
  Scorch: 'Your first damaging ability hit every few seconds burns enemy champions.',
  Waterwalking: 'Gain move speed and adaptive damage while in the river.',
  'Gathering Storm': 'Gain increasing adaptive damage as the game goes longer.',
  'Absorb Life': 'Killing a target heals you.',
  Triumph: 'Champion takedowns restore missing health and grant additional gold.',
  'Presence of Mind': 'Damaging enemy champions restores mana or energy. Takedowns restore more.',
  'Legend: Alacrity': 'Champion takedowns grant permanent attack speed.',
  'Legend: Haste': 'Champion takedowns grant permanent basic ability haste.',
  'Legend: Bloodline': 'Champion takedowns grant permanent life steal up to a cap, then increase maximum health.',
  'Coup de Grace': 'Deal more damage to low-health enemy champions.',
  'Cut Down': 'Deal more damage to high-health enemy champions.',
  'Last Stand': 'Deal more damage to champions while you are low on health.',
  'First Strike': 'When you initiate champion combat, deal extra damage briefly and gain gold based on damage dealt.',
  'Magical Footwear': 'Get free boots later in the game. Takedowns make them arrive sooner.',
  'Cash Back': 'Get some gold back when you purchase legendary items.',
  'Triple Tonic': 'Gain elixirs at levels 3, 6, and 9 for gold, combat power, and a skill point.',
  'Biscuit Delivery': 'Gain biscuits during early lane. Consuming or selling one increases max health and restores health.',
  'Cosmic Insight': 'Gain summoner spell haste and item haste.'
};

const RUNE_ROWS = {
  Sorcery: [
    ['Summon Aery', 'Arcane Comet', "Stormraider's Surge", 'Deathfire Touch'],
    ['Axiom Arcanist', 'Manaflow Band', 'Nimbus Cloak'],
    ['Transcendence', 'Celerity', 'Absolute Focus'],
    ['Scorch', 'Waterwalking', 'Gathering Storm']
  ],
  Precision: [
    ['Absorb Life', 'Triumph', 'Presence of Mind'],
    ['Legend: Alacrity', 'Legend: Haste', 'Legend: Bloodline'],
    ['Coup de Grace', 'Cut Down', 'Last Stand']
  ],
  Inspiration: [
    ['First Strike'],
    ['Magical Footwear', 'Cash Back', 'Triple Tonic'],
    ['Biscuit Delivery'],
    ['Cosmic Insight']
  ]
};

const KEYSTONE_RUNES = new Set(['Summon Aery', 'Arcane Comet', "Stormraider's Surge", 'Deathfire Touch', 'First Strike']);

const SHARD_MARKS = {
  'Ability Haste': 'AH',
  'Adaptive Force': 'AP',
  'Scaling Health': 'HP',
  'Flat Health': '+HP'
};

const SHARD_ICONS = {
  'Ability Haste': 'images/runes/stat-haste.png',
  'Adaptive Force': 'images/runes/stat-adaptive.png',
  'Scaling Health': 'images/runes/stat-health-flat.png',
  'Flat Health': 'images/runes/stat-health-scaling.png'
};

const SHARD_DESCRIPTIONS = {
  'Ability Haste': 'Grants ability haste for more frequent spell rotations.',
  'Adaptive Force': 'Grants adaptive damage, converting to ability power for Hwei.',
  'Scaling Health': 'Grants health that increases as the game progresses.',
  'Flat Health': 'Grants immediate health for a stronger early lane.'
};

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function runeInitials(name) {
  return name
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function renderRuneIcon(name, className = '') {
  const icon = RUNE_ICONS[name];
  const classes = ['rune-node-icon', className].filter(Boolean).join(' ');
  if (!icon) {
    return `<span class="${classes}"><span>${runeInitials(name)}</span></span>`;
  }
  return `<span class="${classes}"><img src="${icon}" alt="${name}"></span>`;
}

function renderRuneTree(treeData) {
  const treeIcon = RUNE_TREE_ICONS[treeData.tree];
  const selectedRunes = new Set(treeData.runes);
  const rows = (RUNE_ROWS[treeData.tree] || [treeData.runes]).filter(row => {
    return treeData.type === 'Primary' || !row.some(rune => KEYSTONE_RUNES.has(rune));
  });
  return `
    <div class="rune-tree-heading">
      <div class="rune-tree-mark">${treeIcon ? `<img src="${treeIcon}" alt="${treeData.tree}">` : treeData.mark}</div>
      <div>
        <div class="rune-tree-name">${treeData.tree}</div>
        <div class="rune-tree-type">${treeData.type}</div>
      </div>
    </div>
    <div class="rune-list">
      ${rows.map((row, rowIndex) => `
        <div class="rune-choice-row${treeData.type === 'Primary' && rowIndex === 0 ? ' keystone-row' : ''}">
          ${row.map(rune => `
            <div class="rune-node${selectedRunes.has(rune) ? ' selected' : ' muted'}${KEYSTONE_RUNES.has(rune) ? ' keystone' : ''}" data-rune-name="${escapeAttribute(rune)}" tabindex="0" aria-label="${escapeAttribute(rune)}">
              ${renderRuneIcon(rune)}
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
    <div class="rune-selected-list">
      ${treeData.runes.map(rune => `<span>${rune}</span>`).join('')}
    </div>
  `;
}

function renderRunePreview(page) {
  return [...page.primary.runes.slice(0, 4), ...page.secondary.runes.slice(0, 2)]
    .map((rune, index) => renderRuneIcon(rune, index === 0 ? 'preview-keystone' : 'preview-icon'))
    .join('');
}

function renderShard(shard) {
  const mark = SHARD_MARKS[shard] || runeInitials(shard);
  const icon = SHARD_ICONS[shard];
  return `<span class="rune-shard" data-rune-name="${escapeAttribute(shard)}" tabindex="0" aria-label="${escapeAttribute(shard)}"><span class="rune-shard-icon">${icon ? `<img src="${icon}" alt="">` : mark}</span><span>${shard}</span></span>`;
}

function renderRuneFaq() {
  return `
    <div class="rune-faq-grid">
      ${HWEI_RUNE_FAQS.map(item => `
        <article class="rune-faq-card">
          <h5>${item.question}</h5>
          <p>${item.answer}</p>
        </article>
      `).join('')}
    </div>
  `;
}

function getRuneTooltipContent(name) {
  return {
    name,
    description: RUNE_DESCRIPTIONS[name] || SHARD_DESCRIPTIONS[name] || 'Rune details unavailable.'
  };
}

function getRuneTooltip() {
  let tooltip = document.getElementById('rune-tooltip');
  if (tooltip) return tooltip;

  tooltip = document.createElement('div');
  tooltip.id = 'rune-tooltip';
  tooltip.className = 'rune-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.innerHTML = '<div class="rune-tooltip-title"></div><div class="rune-tooltip-copy"></div>';
  document.body.appendChild(tooltip);
  return tooltip;
}

function positionRuneTooltip(target, tooltip) {
  const rect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gap = 12;
  let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
  let top = rect.top - tooltipRect.height - gap;

  if (top < 12) top = rect.bottom + gap;
  left = Math.max(12, Math.min(left, window.innerWidth - tooltipRect.width - 12));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showRuneTooltip(target) {
  const name = target.dataset.runeName;
  if (!name) return;

  const tooltip = getRuneTooltip();
  const content = getRuneTooltipContent(name);
  tooltip.querySelector('.rune-tooltip-title').textContent = content.name;
  tooltip.querySelector('.rune-tooltip-copy').textContent = content.description;
  tooltip.classList.add('visible');
  target.setAttribute('aria-describedby', 'rune-tooltip');
  positionRuneTooltip(target, tooltip);
}

function hideRuneTooltip(target) {
  const tooltip = document.getElementById('rune-tooltip');
  if (tooltip) tooltip.classList.remove('visible');
  if (target) target.removeAttribute('aria-describedby');
}

function initRuneTooltips() {
  const selector = document.querySelector('.rune-selector');
  if (!selector) return;

  selector.addEventListener('mouseover', event => {
    const target = event.target.closest('.rune-page-display [data-rune-name]');
    if (target && selector.contains(target)) showRuneTooltip(target);
  });
  selector.addEventListener('mouseout', event => {
    const target = event.target.closest('.rune-page-display [data-rune-name]');
    if (target && !target.contains(event.relatedTarget)) hideRuneTooltip(target);
  });
  selector.addEventListener('focusin', event => {
    const target = event.target.closest('.rune-page-display [data-rune-name]');
    if (target) showRuneTooltip(target);
  });
  selector.addEventListener('focusout', event => {
    const target = event.target.closest('.rune-page-display [data-rune-name]');
    if (target) hideRuneTooltip(target);
  });
  window.addEventListener('scroll', () => hideRuneTooltip(document.querySelector('[aria-describedby="rune-tooltip"]')), true);
  window.addEventListener('resize', () => hideRuneTooltip(document.querySelector('[aria-describedby="rune-tooltip"]')));
}

function setRunePage(pageId) {
  const selector = document.querySelector('.rune-selector');
  if (!selector) return;

  selector.dataset.selectedRunePage = pageId;
  document.querySelectorAll('.rune-page-option').forEach(option => {
    const active = option.dataset.runePage === pageId;
    option.classList.toggle('active', active);
    option.setAttribute('aria-selected', active ? 'true' : 'false');
    const preview = option.querySelector('.rune-page-icons');
    const optionPage = HWEI_RUNE_PAGES[option.dataset.runePage];
    if (preview) preview.innerHTML = optionPage ? renderRunePreview(optionPage) : '';
  });

  const kicker = document.getElementById('rune-display-kicker');
  const title = document.getElementById('rune-display-title');
  const summary = document.getElementById('rune-display-summary');
  const primary = document.getElementById('rune-primary-tree');
  const secondary = document.getElementById('rune-secondary-tree');
  const shards = document.getElementById('rune-shards');
  const useCase = document.getElementById('rune-use-case');
  const swapNote = document.getElementById('rune-swap-note');
  const pageContent = document.getElementById('rune-page-content');
  const faqPanel = document.getElementById('rune-faq-panel');

  if (pageId === 'faq') {
    if (kicker) kicker.textContent = 'Runes Reference';
    if (title) title.textContent = 'Runes FAQ';
    if (summary) summary.textContent = 'Answers for choosing and swapping Hwei rune pages.';
    if (pageContent) pageContent.hidden = true;
    if (faqPanel) {
      faqPanel.hidden = false;
      faqPanel.innerHTML = renderRuneFaq();
    }
    hideRuneTooltip(document.querySelector('[aria-describedby="rune-tooltip"]'));
    return;
  }

  const page = HWEI_RUNE_PAGES[pageId] || HWEI_RUNE_PAGES.default;
  if (pageContent) pageContent.hidden = false;
  if (faqPanel) faqPanel.hidden = true;

  if (kicker) kicker.textContent = page.kicker;
  if (title) title.textContent = page.title;
  if (summary) summary.textContent = page.summary;
  if (primary) primary.innerHTML = renderRuneTree(page.primary);
  if (secondary) secondary.innerHTML = renderRuneTree(page.secondary);
  if (shards) shards.innerHTML = page.shards.map(renderShard).join('');
  if (useCase) useCase.textContent = page.useCase;
  if (swapNote) swapNote.textContent = page.swapNote;
}

function initRuneSelector() {
  const selector = document.querySelector('.rune-selector');
  if (!selector) return;

  selector.querySelectorAll('.rune-page-option').forEach(option => {
    option.addEventListener('click', () => setRunePage(option.dataset.runePage));
  });

  setRunePage(selector.dataset.selectedRunePage || 'default');
  initRuneTooltips();
}

const ITEM_SET_IDS = {
  doransRing: '1056',
  healthPotion: '2003',
  wardingTotem: '3340',
  sorcerersShoes: '3020',
  ionianBoots: '3158',
  seraphsEmbrace: '3040',
  liandrysTorment: '6653',
  cosmicDrive: '4629',
  blackfireTorch: '2503',
  shadowflame: '4645',
  tearOfTheGoddess: '3070',
  echoesOfHelia: '6620',
  diademOfSongs: '2530',
  voidStaff: '3135',
  cryptbloom: '3137',
  zhonyasHourglass: '3157',
  rabadonsDeathcap: '3089',
  bloodlettersCurse: '4010',
  bansheesVeil: '3102',
  morellonomicon: '3165',
  stormsurge: '4646'
};

const HWEI_ITEM_SET_BLOCKS = {
  starting: {
    type: 'Starting Items',
    items: [
      { id: ITEM_SET_IDS.doransRing, count: 1 },
      { id: ITEM_SET_IDS.healthPotion, count: 2 },
      { id: ITEM_SET_IDS.wardingTotem, count: 1 }
    ]
  },
  boots: {
    type: 'Boots',
    items: [
      { id: ITEM_SET_IDS.sorcerersShoes, count: 1 },
      { id: ITEM_SET_IDS.ionianBoots, count: 1 }
    ]
  },
  situational: {
    type: 'Situational',
    items: [
      { id: ITEM_SET_IDS.shadowflame, count: 1 },
      { id: ITEM_SET_IDS.voidStaff, count: 1 },
      { id: ITEM_SET_IDS.cryptbloom, count: 1 },
      { id: ITEM_SET_IDS.zhonyasHourglass, count: 1 },
      { id: ITEM_SET_IDS.rabadonsDeathcap, count: 1 },
      { id: ITEM_SET_IDS.bloodlettersCurse, count: 1 },
      { id: ITEM_SET_IDS.bansheesVeil, count: 1 },
      { id: ITEM_SET_IDS.morellonomicon, count: 1 }
    ]
  }
};

const HWEI_ITEM_SET_BUILDS = {
  'tempo-burst': {
    title: 'Hwei Bot - Primary BFT Build',
    label: 'Primary BFT Build',
    coreType: 'Core - Primary BFT Build',
    items: [
      { id: ITEM_SET_IDS.blackfireTorch, count: 1 },
      { id: ITEM_SET_IDS.cosmicDrive, count: 1 },
      { id: ITEM_SET_IDS.shadowflame, count: 1 }
    ]
  },
  'scaling-burn': {
    title: 'Hwei Bot - Scaling Burn',
    label: 'Scaling Burn',
    coreType: 'Core - Scaling Burn',
    items: [
      { id: ITEM_SET_IDS.seraphsEmbrace, count: 1 },
      { id: ITEM_SET_IDS.liandrysTorment, count: 1 },
      { id: ITEM_SET_IDS.cosmicDrive, count: 1 }
    ]
  },
  'full-magic-pen': {
    title: 'Hwei Bot - Full Magic Pen',
    label: 'Full Magic Pen',
    coreType: 'Core - Full Magic Pen',
    items: [
      { id: ITEM_SET_IDS.blackfireTorch, count: 1 },
      { id: ITEM_SET_IDS.shadowflame, count: 1 },
      { id: ITEM_SET_IDS.stormsurge, count: 1 }
    ]
  },
  'utility-weave': {
    title: 'Hwei Bot - Utility Weave',
    label: 'Utility Weave',
    coreType: 'Core - Utility Weave',
    items: [
      { id: ITEM_SET_IDS.tearOfTheGoddess, count: 1 },
      { id: ITEM_SET_IDS.liandrysTorment, count: 1 },
      { id: ITEM_SET_IDS.echoesOfHelia, count: 1 },
      { id: ITEM_SET_IDS.diademOfSongs, count: 1 }
    ]
  }
};

function cloneItemBlock(block) {
  return {
    type: block.type,
    recMath: false,
    minSummonerLevel: -1,
    maxSummonerLevel: -1,
    showIfSummonerSpell: '',
    hideIfSummonerSpell: '',
    items: block.items.map(item => ({ id: String(item.id), count: item.count }))
  };
}

function createItemSet(title, blocks, sortrank = 0) {
  return {
    title,
    type: 'custom',
    map: 'any',
    mode: 'any',
    priority: false,
    sortrank,
    associatedChampions: [910],
    associatedMaps: [11],
    blocks: blocks.map(cloneItemBlock)
  };
}

function buildHweiItemSet(copyType) {
  const build = HWEI_ITEM_SET_BUILDS[copyType];
  if (build) {
    return createItemSet(build.title, [
      HWEI_ITEM_SET_BLOCKS.starting,
      HWEI_ITEM_SET_BLOCKS.boots,
      { type: build.coreType, items: build.items },
      HWEI_ITEM_SET_BLOCKS.situational
    ]);
  }

  return createItemSet('Hwei Bot - All Builds', [
    HWEI_ITEM_SET_BLOCKS.starting,
    HWEI_ITEM_SET_BLOCKS.boots,
    ...Object.values(HWEI_ITEM_SET_BUILDS).map(itemBuild => ({
      type: itemBuild.coreType,
      items: itemBuild.items
    })),
    HWEI_ITEM_SET_BLOCKS.situational
  ]);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Fall through to the legacy copy path when browser permissions block Clipboard API.
    }
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);
  if (!copied) throw new Error('Clipboard copy was blocked by the browser.');
}

function setItemCopyStatus(message, state = '') {
  const status = document.getElementById('item-copy-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('success', state === 'success');
  status.classList.toggle('error', state === 'error');
}

function initItemSetCopy() {
  const buttons = document.querySelectorAll('[data-item-set-copy]');
  if (!buttons.length) return;

  buttons.forEach(button => {
    button.addEventListener('click', async () => {
      const copyType = button.dataset.itemSetCopy || 'all';
      const itemSet = buildHweiItemSet(copyType);
      const label = copyType === 'all' ? 'all Hwei builds' : (HWEI_ITEM_SET_BUILDS[copyType]?.label || itemSet.title);
      const originalText = button.textContent;

      button.disabled = true;
      button.textContent = 'Copying';
      setItemCopyStatus(`Copying ${label} item set...`);

      try {
        await copyTextToClipboard(JSON.stringify(itemSet, null, 2));
        button.textContent = 'Copied';
        setItemCopyStatus(`Copied ${label}. In League: Collection > Items > Import Item Sets > Paste copied set.`, 'success');
      } catch (error) {
        button.textContent = 'Copy Failed';
        setItemCopyStatus(error.message || 'Clipboard copy failed. Try again from the browser page.', 'error');
      } finally {
        setTimeout(() => {
          button.disabled = false;
          button.textContent = originalText;
        }, 1800);
      }
    });
  });
}

// ── SET ACTIVE NAVIGATION BASED ON CURRENT PAGE ──
document.addEventListener('DOMContentLoaded', function() {
  const currentPath = window.location.pathname;
  const pageName = currentPath.split('/').pop().replace('.html', '');

  // Map page names to nav items
  const navMap = {
    'home': 'Intro / Home',
    'index': 'Intro / Home',
    'identity': 'Hwei Identity',
    'abilities': 'Abilities',
    'laning': 'Laning / Early Game',
    'pregame': 'Pregame',
    'midgame': 'Mid Game',
    'lategame': 'Late Game',
    'matchups': 'Matchups'
  };

  const navText = navMap[pageName];
  if (navText) {
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.textContent.trim() === navText) {
        item.classList.add('active');
      }
    });
  }
  transformMatchupCards();
  initRuneSelector();
  initItemSetCopy();
  initMatchupSortControls();
  initMatchupDifficultyJump();
  initTierListSmoothJump();
  initTocSmoothJump();
  applyLanguage(selLangCode).catch(error => {
    console.warn(error);
    syncLanguageButtons('en');
  });
});

function transformMatchupCards() {
  const idToImageFile = {
    aphelios:'Aphelios.png', ashe:'Ashe.png', 'aurelion-sol':'AurelionSol.png', brand:'Brand.png', caitlyn:'Caitlyn.png', corki:'Corki.png', draven:'Draven.png', ezreal:'Ezreal.png', heimerdinger:'Heimerdinger.png', hwei:'Hwei.jpg', jhin:'Jhin.png', jinx:'Jinx.png', 'kaisa':'KaiSa.png', kalista:'Kalista.png', karma:'Karma.png', karthus:'Karthus.png', 'kogmaw':'KogMaw.png', lucian:'Lucian.png', lux:'Lux.png', 'miss-fortune':'MissFortune.png', morgana:'Morgana.png', nilah:'Nilah.png', samira:'Samira.png', senna:'Senna.png', syndra:'Syndra.png', seraphine:'Seraphine.png', sivir:'Sivir.png', smolder:'Smolder.jpg', tristana:'Tristana.png', twitch:'Twitch.png', varus:'Varus.png', vayne:'Vayne.png', xayah:'Xayah.png', yunara:'Yunara.jpg', zeri:'Zeri.png', ziggs:'Ziggs.png', zyra:'Zyra.png'
  };
  const wikiById = {
    aphelios:'Aphelios', ashe:'Ashe', 'aurelion-sol':'Aurelion_Sol', brand:'Brand', caitlyn:'Caitlyn', corki:'Corki', draven:'Draven', ezreal:'Ezreal', heimerdinger:'Heimerdinger', hwei:'Hwei', jhin:'Jhin', jinx:'Jinx', kaisa:"Kai'Sa", kalista:'Kalista', karma:'Karma', karthus:'Karthus', kogmaw:"Kog'Maw", lucian:'Lucian', lux:'Lux', 'miss-fortune':'Miss_Fortune', morgana:'Morgana', nilah:'Nilah', samira:'Samira', senna:'Senna', syndra:'Syndra', seraphine:'Seraphine', sivir:'Sivir', smolder:'Smolder', tristana:'Tristana', twitch:'Twitch', varus:'Varus', vayne:'Vayne', xayah:'Xayah', yunara:'Yunara', zeri:'Zeri', ziggs:'Ziggs', zyra:'Zyra'
  };
  const wikiBase = 'https://wiki.leagueoflegends.com/en-us/';

  const standardSummoners = [
    'Flash.png',
    'teleport.png'
  ];
  const standardBuild = ['blackfireTorch.jpg','sorcBoots.jpg','cosmicDrive.jpg','Shadowflame.jpg','rabadons.jpg','voidStaff.jpg','zhonyas.jpg'];

  const tierMap = {
    aphelios: 'heavily-hwei-favored', draven: 'heavily-hwei-favored', jinx: 'heavily-hwei-favored',
    nilah: 'heavily-hwei-favored', varus: 'heavily-hwei-favored', twitch: 'heavily-hwei-favored', seraphine: 'heavily-hwei-favored',
    ashe: 'hwei-favored', caitlyn: 'hwei-favored', corki: 'hwei-favored', kalista: 'hwei-favored', ziggs: 'hwei-favored',
    'miss-fortune': 'hwei-favored', senna: 'hwei-favored', samira: 'hwei-favored', hwei: 'hwei-favored', xayah: 'hwei-favored',
    'aurelion-sol': 'hwei-favored', brand: 'hwei-favored', heimerdinger: 'hwei-favored', karma: 'hwei-favored', 'kogmaw': 'hwei-favored',
    lux: 'hwei-favored', morgana: 'hwei-favored', smolder: 'hwei-favored', yunara: 'hwei-favored', zeri: 'hwei-favored', mel: 'hwei-favored',
    ezreal: 'even', jhin: 'even', 'kaisa': 'even', tristana: 'even', vayne: 'even', zyra: 'even',
    lucian: 'enemy-favored', syndra: 'enemy-favored', karthus: 'enemy-favored',
    sivir: 'unfavorable'
  };
  const tierLabels = {
    'heavily-hwei-favored': 'Heavily Hwei Favored', 'hwei-favored': 'Hwei Favored',
    'even': 'Even', 'enemy-favored': 'Enemy Favored', 'unfavorable': 'Unfavorable'
  };

  const getDifficultyColor = (score) => {
    if (score <= 2) return '#31cc45';
    if (score <= 4) return '#c6d12d';
    if (score <= 6) return '#ff9b1a';
    if (score <= 8) return '#ff5733';
    return '#cc0000';
  };

  const calcDifficultyBox = (score) => {
    const color = getDifficultyColor(score);
    return `<div class="matchup-difficulty-box" style="background:${color};">${score}</div>`;
  };

  const cards = document.querySelectorAll('#matchup-cards .card');
  cards.forEach(card => {
    const titleEl = card.querySelector('.card-title');
    const name = titleEl ? titleEl.textContent.trim() : '';
    const id = card.id || name.toLowerCase().replace(/[^a-z\d]+/g, '-');
    const difficultyValue = MATCHUP_DIFFICULTY_MAP[id] || 4;
    const difficultySteps = calcDifficultyBox(difficultyValue);

    const existingDetails = Array.from(card.children).filter(el => !el.classList.contains('card-title'));
    const strategyHtml = existingDetails.map(el => el.outerHTML).join('');

    const fallbackImage = `${name.replace(/[^a-zA-Z]/g,'')}.png`;
    const imageFile = idToImageFile[id] || fallbackImage;
    const imagePath = `images/champions/${imageFile}`;
    const wikiSlug = wikiById[id];
    const wikiUrl = wikiSlug ? `${wikiBase}${wikiSlug}` : '#';
    const tierClass = tierMap[id] || 'even';
    const tierLabel = tierLabels[tierClass] || 'Even';

    card.classList.add('matchup-card');
    card.innerHTML = `
      <div class="matchup-entry">
        <a class="matchup-image-link" href="${wikiUrl}" target="_blank" rel="noopener" aria-label="Open ${name} wiki page" title="Open ${name} wiki page">
          <img class="matchup-image" src="${imagePath}" alt="${name}">
        </a>
        <div class="matchup-meta">
          <div class="matchup-header-row">
            <div class="matchup-name-group">
              <h3 class="matchup-name">${name}</h3>
              <span class="matchup-tier-badge ${tierClass}">${tierLabel}</span>
            </div>
            <a class="matchup-diff-badge matchup-diff-badge-link" href="#matchup-toc" aria-label="Jump to champions table of contents" title="Jump to champions list">
              <div class="matchup-difficulty-title">Difficulty</div>
              ${difficultySteps}
            </a>
          </div>
          <div class="matchup-stats">
            <div class="matchup-block">
              <span>Summoners</span>
              <div class="matchup-icons">
                ${standardSummoners.map(s => `<img src="images/${s}" alt="${s.split('.')[0]}">`).join('')}
              </div>
            </div>
            <div class="matchup-block">
              <span>Recommended Build</span>
              <div class="matchup-icons">
                ${standardBuild.map(item => `<img src="images/${item}" alt="${item.split('.')[0]}">`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="matchup-strategy">
        <h4>Strategy</h4>
        ${strategyHtml}
      </div>
    `;
  });
}
