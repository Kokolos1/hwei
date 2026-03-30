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
let selLangCode = 'en';
function selLang(btn) {
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  selLangCode = btn.dataset.lang;
}
function confirmLang() {
  document.getElementById('lang-overlay').style.display = 'none';
  document.getElementById('lang-label').textContent = langLabels[selLangCode] || 'English';
}
function openLang() { document.getElementById('lang-overlay').style.display = 'flex'; }

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

// ── SET ACTIVE NAVIGATION BASED ON CURRENT PAGE ──
document.addEventListener('DOMContentLoaded', function() {
  const currentPath = window.location.pathname;
  const pageName = currentPath.split('/').pop().replace('.html', '');

  // Map page names to nav items
  const navMap = {
    'home': 'Intro / Home',
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
});

function transformMatchupCards() {
  const idToImage = {
    aphelios:'Aphelios', ashe:'Ashe', 'aurelion-sol':'AurelionSol', brand:'Brand', caitlyn:'Caitlyn', corki:'Corki', draven:'Draven', ezreal:'Ezreal', heimerdinger:'Heimerdinger', hwei:'Hwei', jhin:'Jhin', jinx:'Jinx', 'kaisa':'KaiSa', kalista:'Kalista', karma:'Karma', karthus:'Karthus', 'kogmaw':'KogMaw', lucian:'Lucian', lux:'Lux', mel:'Mel', 'miss-fortune':'MissFortune', morgana:'Morgana', nilah:'Nilah', samira:'Samira', senna:'Senna', seraphine:'Seraphine', sivir:'Sivir', smolder:'Smolder', tristana:'Tristana', twitch:'Twitch', varus:'Varus', vayne:'Vayne', xayah:'Xayah', yunara:'Yunara', zeri:'Zeri', ziggs:'Ziggs', zyra:'Zyra'
  };

  const standardSummoners = [
    'Flash.png',
    'teleport.png'
  ];
  const standardBuild = ['blackfireTorch.jpg','sorcBoots.jpg','cosmicDrive.jpg','Shadowflame.jpg','rabadons.jpg','voidStaff.jpg','zhonyas.jpg'];

  const difficultyMap = {
    aphelios: 3, ashe: 3, 'aurelion-sol': 4, brand: 5, caitlyn: 4, corki: 4, draven: 5, ezreal: 3,
    heimerdinger: 6, hwei: 6, jhin: 4, jinx: 4, 'kaisa': 5, kalista: 5, karma: 2, karthus: 4,
    'kogmaw': 5, lucian: 4, lux: 3, mel: 2, 'miss-fortune': 4, morgana: 3, nilah: 5, samira: 5,
    senna: 3, seraphine: 4, sivir: 4, smolder: 5, tristana: 4, twitch: 5, varus: 5, vayne: 7,
    xayah: 5, yunara: 6, zeri: 6, ziggs: 4, zyra: 4
  };

  const tierMap = {
    aphelios: 'heavily-mel-favored', draven: 'heavily-mel-favored', jinx: 'heavily-mel-favored',
    nilah: 'heavily-mel-favored', varus: 'heavily-mel-favored', twitch: 'heavily-mel-favored', seraphine: 'heavily-mel-favored',
    ashe: 'mel-favored', caitlyn: 'mel-favored', corki: 'mel-favored', kalista: 'mel-favored', ziggs: 'mel-favored',
    'miss-fortune': 'mel-favored', senna: 'mel-favored', samira: 'mel-favored', hwei: 'mel-favored', xayah: 'mel-favored',
    'aurelion-sol': 'mel-favored', brand: 'mel-favored', heimerdinger: 'mel-favored', karma: 'mel-favored', 'kogmaw': 'mel-favored',
    lux: 'mel-favored', morgana: 'mel-favored', smolder: 'mel-favored', yunara: 'mel-favored', zeri: 'mel-favored',
    ezreal: 'even', jhin: 'even', 'kaisa': 'even', tristana: 'even', vayne: 'even', zyra: 'even', mel: 'even',
    lucian: 'enemy-favored', karthus: 'enemy-favored',
    sivir: 'unfavorable'
  };
  const tierLabels = {
    'heavily-mel-favored': 'Heavily Favored', 'mel-favored': 'Mel Favored',
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
    const difficultyValue = difficultyMap[id] || 4;
    const difficultySteps = calcDifficultyBox(difficultyValue);

    const existingDetails = Array.from(card.children).filter(el => !el.classList.contains('card-title'));
    const strategyHtml = existingDetails.map(el => el.outerHTML).join('');

    const imageKey = idToImage[id] || name.replace(/[^a-zA-Z]/g,'');
    const imagePath = `images/champions/${imageKey}.png`;
    const tierClass = tierMap[id] || 'even';
    const tierLabel = tierLabels[tierClass] || 'Even';

    card.classList.add('matchup-card');
    card.innerHTML = `
      <div class="matchup-entry">
        <img class="matchup-image" src="${imagePath}" alt="${name}">
        <div class="matchup-meta">
          <div class="matchup-header-row">
            <div class="matchup-name-group">
              <h3 class="matchup-name">${name}</h3>
              <span class="matchup-tier-badge ${tierClass}">${tierLabel}</span>
            </div>
            <div class="matchup-diff-badge">
              <div class="matchup-difficulty-title">Difficulty</div>
              ${difficultySteps}
            </div>
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
