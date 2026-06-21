require('dotenv').config();
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const crypto = require('crypto');
const path = require('path');
const { importRunePage, lcuErrorResponse } = require('./lcu');

const app = express();
const PORT = process.env.PORT || 3000;
const webRoot = path.join(__dirname, '..');
const HOME_FILE = path.join(webRoot, 'index.html');
const SIGNIN_FILE = path.join(webRoot, 'signin.html');
const PROTECTED_PAGE_FILES = new Set([
  'index.html',
  'abilities.html',
  'laning.html',
  'lategame.html',
  'matchups.html',
  'midgame.html',
  'pregame.html'
]);
const PROTECTED_ROOT_FILES = new Set(['versions.json']);
const PROTECTED_STATIC_DIRS = ['css', 'images', 'js', 'shared'];

const IN_PROD = process.env.NODE_ENV === 'production';
const DEPLOY_MARKER = process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.RAILWAY_DEPLOYMENT_ID
  || 'local';
const CLIENT_ID = process.env.PATREON_CLIENT_ID;
const CLIENT_SECRET = process.env.PATREON_CLIENT_SECRET;
const REDIRECT_URI = process.env.PATREON_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:${PORT}`;
const SCOPES = 'identity identity[email] identity.memberships';
const REQUIRED_TIER_ID = (process.env.PATREON_ALLOWED_TIER_ID || '').trim();
const REQUIRED_TIER_NAME = (process.env.PATREON_ALLOWED_TIER_NAME || 'Hwei Apprentice').trim();
const ALLOWED_EMAILS = new Set(
  (process.env.PATREON_ALLOWED_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.warn('Warning: PATREON_CLIENT_ID, PATREON_CLIENT_SECRET and PATREON_REDIRECT_URI should be set in environment.');
}

if (IN_PROD) {
  app.set('trust proxy', 1);
}

function preventStaleGuideCache(req, res, next) {
  res.set('X-Hwei-Guide-Server', 'express');
  res.set('X-Hwei-Guide-Deploy', DEPLOY_MARKER);

  if (req.method !== 'GET') return next();

  const requestPath = req.path || '/';
  const ext = path.extname(requestPath).toLowerCase();
  const shouldBypassCache = requestPath === '/'
    || !ext
    || ['.html', '.css', '.js', '.json'].includes(ext);

  if (shouldBypassCache) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }

  return next();
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  proxy: IN_PROD,
  cookie: { secure: IN_PROD, httpOnly: true, sameSite: 'lax' }
}));
app.use(preventStaleGuideCache);

function makeState() {
  return crypto.randomBytes(16).toString('hex');
}

function normalizeTierName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hasSiteAccess(req) {
  return Boolean(req.session && req.session.user && req.session.user.has_access);
}

function clearPatreonSession(req, keepReturnTo = false) {
  if (!req.session) return;
  delete req.session.oauthState;
  delete req.session.tokens;
  delete req.session.user;
  if (!keepReturnTo) delete req.session.returnTo;
}

function rememberReturnTo(req) {
  if (!req.session || req.method !== 'GET') return;

  const requestPath = req.path || '/';
  const originalUrl = req.originalUrl || requestPath;
  const ext = path.extname(requestPath).toLowerCase();
  const isHtmlRequest = requestPath === '/' || !ext || ext === '.html';

  if (!isHtmlRequest) return;
  if (originalUrl === '/signin' || originalUrl.startsWith('/auth/') || originalUrl.startsWith('/api/')) return;
  if (originalUrl.startsWith('//')) return;

  req.session.returnTo = originalUrl;
}

function consumeReturnTo(req) {
  if (!req.session) return null;

  const returnTo = req.session.returnTo;
  delete req.session.returnTo;

  if (typeof returnTo !== 'string') return null;
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) return null;
  return returnTo;
}

function buildSigninRedirect(reason) {
  const params = new URLSearchParams();
  if (reason) params.set('error', reason);
  const query = params.toString();
  return query ? `/signin?${query}` : '/signin';
}

function getEntitledTierRefs(memberResource) {
  const tierData = memberResource
    && memberResource.relationships
    && memberResource.relationships.currently_entitled_tiers
    && memberResource.relationships.currently_entitled_tiers.data;

  return Array.isArray(tierData) ? tierData : [];
}

function extractPatreonAccess(identityJson) {
  const included = Array.isArray(identityJson && identityJson.included) ? identityJson.included : [];
  const tiersById = new Map();

  included.forEach((resource) => {
    if (!resource || resource.type !== 'tier' || !resource.id) return;
    tiersById.set(resource.id, {
      id: resource.id,
      title: resource.attributes && resource.attributes.title ? resource.attributes.title : '',
      amount_cents: resource.attributes && resource.attributes.amount_cents
    });
  });

  const entitledTiers = [];
  included.forEach((resource) => {
    if (!resource || (resource.type !== 'member' && resource.type !== 'membership')) return;
    getEntitledTierRefs(resource).forEach((tierRef) => {
      if (!tierRef || !tierRef.id) return;
      entitledTiers.push(tiersById.get(tierRef.id) || { id: tierRef.id, title: '' });
    });
  });

  const uniqueEntitledTiers = Array.from(new Map(
    entitledTiers.map((tier) => [tier.id || normalizeTierName(tier.title), tier])
  ).values());

  const matchedTier = uniqueEntitledTiers.find((tier) => {
    if (REQUIRED_TIER_ID) return tier.id === REQUIRED_TIER_ID;
    return normalizeTierName(tier.title) === normalizeTierName(REQUIRED_TIER_NAME);
  }) || null;

  return {
    entitledTiers: uniqueEntitledTiers,
    matchedTier,
    hasAccess: Boolean(matchedTier)
  };
}

function denyAccess(req, res, reason) {
  rememberReturnTo(req);

  const requestPath = req.path || '/';
  const ext = path.extname(requestPath).toLowerCase();
  const requestUrl = req.originalUrl || requestPath;
  const isApiRequest = requestUrl.startsWith('/api/');

  if (isApiRequest) {
    return res.status(401).json({ authenticated: false, error: reason });
  }

  if (ext && ext !== '.html') {
    return res.status(403).send('Forbidden');
  }

  return res.redirect(buildSigninRedirect(reason));
}

function requireSiteAccess(req, res, next) {
  if (hasSiteAccess(req)) return next();
  return denyAccess(req, res, 'sign_in_required');
}

function sendProtectedRootFile(req, res, next) {
  const fileName = req.params.fileName;
  if (!PROTECTED_PAGE_FILES.has(fileName) && !PROTECTED_ROOT_FILES.has(fileName)) {
    return next();
  }

  if (!hasSiteAccess(req)) {
    return denyAccess(req, res, 'sign_in_required');
  }

  return res.sendFile(path.join(webRoot, fileName));
}

app.get('/', (req, res) => {
  if (hasSiteAccess(req)) {
    return res.sendFile(HOME_FILE);
  }
  return res.redirect('/signin');
});

app.get('/signin', (req, res) => {
  if (hasSiteAccess(req)) {
    return res.redirect('/');
  }
  return res.sendFile(SIGNIN_FILE);
});

app.get('/api/deploy-info', (req, res) => {
  res.json({
    ok: true,
    server: 'express',
    deploy: DEPLOY_MARKER,
    nodeEnv: process.env.NODE_ENV || 'development'
  });
});

// Start OAuth flow
app.get('/auth/patreon', (req, res) => {
  if (typeof req.query.next === 'string' && req.query.next.startsWith('/') && !req.query.next.startsWith('//')) {
    req.session.returnTo = req.query.next;
  } else if (!req.session.returnTo) {
    req.session.returnTo = '/';
  }

  const state = makeState();
  req.session.oauthState = state;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state
  });
  const url = `https://www.patreon.com/oauth2/authorize?${params.toString()}`;
  console.log('PATREON AUTHORIZE URL ->', url);
  console.log('Configured PATREON_REDIRECT_URI ->', REDIRECT_URI);
  res.redirect(url);
});

// OAuth callback
app.get('/auth/patreon/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing code');
  if (!state || state !== req.session.oauthState) return res.status(400).send('Invalid state');

  delete req.session.oauthState;

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('redirect_uri', REDIRECT_URI);

    const tokenRes = await fetch('https://www.patreon.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const tokenJson = await tokenRes.json();

    if (!tokenJson.access_token) {
      console.error('Token exchange error', tokenJson);
      clearPatreonSession(req, true);
      return res.redirect(buildSigninRedirect('oauth_failed'));
    }

    // store tokens in session (for dev). In production persist encrypted.
    req.session.tokens = tokenJson;

    // fetch identity with entitled tiers so access can be matched to an exact Patreon tier
    const identityParams = new URLSearchParams({
      include: 'memberships.currently_entitled_tiers',
      'fields[user]': 'email,full_name,image_url',
      'fields[member]': 'patron_status,is_free_trial,is_gifted',
      'fields[tier]': 'title,amount_cents'
    });

    const identityRes = await fetch(`https://www.patreon.com/api/oauth2/v2/identity?${identityParams.toString()}`, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` }
    });
    const identityJson = await identityRes.json();

    const access = extractPatreonAccess(identityJson);
    const userEmail = normalizeEmail(identityJson.data && identityJson.data.attributes && identityJson.data.attributes.email);
    const hasEmailAccess = userEmail && ALLOWED_EMAILS.has(userEmail);

    if (!access.hasAccess && !hasEmailAccess) {
      const entitledTierSummary = access.entitledTiers.map((tier) => tier.title || tier.id).filter(Boolean);
      console.warn('Patreon login denied: required tier missing.', {
        requiredTierId: REQUIRED_TIER_ID || null,
        requiredTierName: REQUIRED_TIER_NAME,
        allowedEmailCount: ALLOWED_EMAILS.size,
        userEmail: userEmail || null,
        entitledTiers: entitledTierSummary
      });
      clearPatreonSession(req, true);
      return res.redirect(buildSigninRedirect('tier_required'));
    }

    req.session.user = {
      id: identityJson.data && identityJson.data.id,
      attributes: identityJson.data && identityJson.data.attributes,
      entitled_tiers: access.entitledTiers,
      matched_tier: access.matchedTier,
      access_source: hasEmailAccess ? 'email' : 'tier',
      has_access: true,
      raw: identityJson
    };

    // redirect back to the protected page the visitor originally requested, or home
    const dest = consumeReturnTo(req) || FRONTEND_URL || '/';
    res.redirect(dest);
  } catch (err) {
    console.error(err);
    clearPatreonSession(req, true);
    res.redirect(buildSigninRedirect('oauth_failed'));
  }
});

PROTECTED_STATIC_DIRS.forEach((dirName) => {
  app.use(`/${dirName}`, requireSiteAccess, express.static(path.join(webRoot, dirName)));
});

app.get('/:fileName', sendProtectedRootFile);

// Refresh endpoint
app.post('/auth/patreon/refresh', requireSiteAccess, express.json(), async (req, res) => {
  const refreshToken = req.session.tokens && req.session.tokens.refresh_token;
  if (!refreshToken) return res.status(400).json({ error: 'no refresh token' });

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    const tokenRes = await fetch('https://www.patreon.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const tokenJson = await tokenRes.json();
    req.session.tokens = tokenJson;
    res.json(tokenJson);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'refresh failed' });
  }
});

// API for frontend to check current user
app.get('/api/me', requireSiteAccess, (req, res) => {
  res.json({ authenticated: true, user: req.session.user });
});

app.post('/api/lcu/runes', requireSiteAccess, express.json({ limit: '32kb' }), async (req, res) => {
  try {
    const result = await importRunePage(req.body);
    res.json({
      ok: true,
      message: `Imported ${result.page.name} into League Client.`,
      page: result.page
    });
  } catch (error) {
    const response = lcuErrorResponse(error);
    res.status(response.status).json(response.body);
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.listen(PORT, () => console.log(`Patreon OAuth API listening on http://localhost:${PORT}`));
