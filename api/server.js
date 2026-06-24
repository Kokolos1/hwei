require('dotenv').config();
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');
const Stripe = require('stripe');

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
const SUPPORTED_TRANSLATION_LANGUAGES = new Set(['en', 'es', 'fr', 'de', 'pt', 'it', 'ro', 'tr', 'pl', 'ru', 'ko', 'ja']);
const translationCache = new Map();
const DATABASE_URL = process.env.DATABASE_URL;
const db = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('sslmode=require') || process.env.PGSSLMODE === 'require'
        ? { rejectUnauthorized: false }
        : undefined
    })
  : null;

const IN_PROD = process.env.NODE_ENV === 'production';
const DEPLOY_MARKER = process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.RAILWAY_DEPLOYMENT_ID
  || 'local';
const CLIENT_ID = process.env.PATREON_CLIENT_ID;
const CLIENT_SECRET = process.env.PATREON_CLIENT_SECRET;
const REDIRECT_URI = process.env.PATREON_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:${PORT}`;
const STRIPE_PRICE_ID_HWEI_LIFETIME = process.env.STRIPE_PRICE_ID_HWEI_LIFETIME;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
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

async function initDatabase() {
  if (!db) {
    console.warn('DATABASE_URL is not set; lifetime access storage is disabled.');
    return;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS lifetime_access (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL DEFAULT 'stripe',
      stripe_customer_id TEXT,
      stripe_checkout_session_id TEXT UNIQUE,
      stripe_payment_intent_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS lifetime_access_email_lower_idx
      ON lifetime_access (lower(email));
  `);
}

async function hasLifetimeAccess(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!db || !normalizedEmail) return false;

  const result = await db.query(
    'SELECT 1 FROM lifetime_access WHERE lower(email) = lower($1) LIMIT 1',
    [normalizedEmail]
  );
  return result.rowCount > 0;
}

function getCheckoutSessionEmail(session) {
  return normalizeEmail(
    session
      && session.customer_details
      && session.customer_details.email
      || session
      && session.customer_email
  );
}

function isLifetimeAccessSession(session) {
  return Boolean(
    session
      && session.mode === 'payment'
      && session.payment_status === 'paid'
      && session.metadata
      && session.metadata.product === 'hwei_lifetime_access'
  );
}

async function fulfillStripeCheckoutSession(event) {
  if (!db) {
    const error = new Error('Database is not configured.');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }

  const session = event.data && event.data.object;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const eventInsert = await client.query(
      'INSERT INTO stripe_events (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id',
      [event.id]
    );

    if (eventInsert.rowCount === 0) {
      await client.query('COMMIT');
      return { processed: false, reason: 'duplicate_event' };
    }

    if (!isLifetimeAccessSession(session)) {
      await client.query('COMMIT');
      return { processed: true, granted: false, reason: 'not_lifetime_access_session' };
    }

    const email = getCheckoutSessionEmail(session);
    if (!email) {
      throw new Error('Stripe checkout session is missing a customer email.');
    }

    await client.query(
      `
        INSERT INTO lifetime_access (
          email,
          source,
          stripe_customer_id,
          stripe_checkout_session_id,
          stripe_payment_intent_id
        )
        VALUES ($1, 'stripe', $2, $3, $4)
        ON CONFLICT (email) DO UPDATE SET
          source = EXCLUDED.source,
          stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, lifetime_access.stripe_customer_id),
          stripe_checkout_session_id = COALESCE(EXCLUDED.stripe_checkout_session_id, lifetime_access.stripe_checkout_session_id),
          stripe_payment_intent_id = COALESCE(EXCLUDED.stripe_payment_intent_id, lifetime_access.stripe_payment_intent_id)
      `,
      [
        email,
        typeof session.customer === 'string' ? session.customer : null,
        session.id || null,
        typeof session.payment_intent === 'string' ? session.payment_intent : null
      ]
    );

    await client.query('COMMIT');
    return { processed: true, granted: true, email };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function translateBatch(texts, target) {
  const normalizedTexts = texts.map((text) => String(text || '').replace(/\s+/g, ' ').trim());
  const cacheKey = `${target}:${JSON.stringify(normalizedTexts)}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);

  const body = new URLSearchParams();
  body.append('q', normalizedTexts.join('\n'));

  const response = await fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(target)}&dt=t`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }
  );

  if (!response.ok) {
    throw new Error(`Translation request failed with status ${response.status}.`);
  }

  const parsed = await response.json();
  const combined = (parsed[0] || []).map((part) => part[0]).join('');
  const translated = combined.split('\n').map((value) => value.trim());
  const padded = normalizedTexts.map((value, index) => translated[index] || value);

  translationCache.set(cacheKey, padded);
  return padded;
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
    const hasStripeLifetimeAccess = !access.hasAccess && !hasEmailAccess
      ? await hasLifetimeAccess(userEmail)
      : false;

    if (!access.hasAccess && !hasEmailAccess && !hasStripeLifetimeAccess) {
      const entitledTierSummary = access.entitledTiers.map((tier) => tier.title || tier.id).filter(Boolean);
      console.warn('Patreon login denied: required tier missing.', {
        requiredTierId: REQUIRED_TIER_ID || null,
        requiredTierName: REQUIRED_TIER_NAME,
        allowedEmailCount: ALLOWED_EMAILS.size,
        stripeLifetimeAccess: false,
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
      access_source: hasEmailAccess ? 'email' : (hasStripeLifetimeAccess ? 'stripe_lifetime' : 'tier'),
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

app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ ok: false, message: 'Stripe webhook is not configured.' });
  }

  const signature = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.warn('Stripe webhook signature verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const result = await fulfillStripeCheckoutSession(event);
      return res.json({ received: true, ...result });
    }

    return res.json({ received: true, ignored: true });
  } catch (error) {
    console.error('Stripe webhook fulfillment failed:', error);
    return res.status(500).json({ received: false, message: 'Stripe webhook fulfillment failed.' });
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

app.post('/api/stripe/create-checkout-session', express.json({ limit: '8kb' }), async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ ok: false, message: 'Stripe is not configured.' });
  }

  if (!STRIPE_PRICE_ID_HWEI_LIFETIME) {
    return res.status(500).json({ ok: false, message: 'Stripe lifetime price is not configured.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: STRIPE_PRICE_ID_HWEI_LIFETIME,
          quantity: 1
        }
      ],
      success_url: `${FRONTEND_URL}/signin?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/signin?purchase=cancelled`,
      metadata: {
        product: 'hwei_lifetime_access'
      }
    });

    return res.json({ ok: true, url: session.url });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, message: 'Unable to create checkout session.' });
  }
});

app.post('/api/translate', requireSiteAccess, express.json({ limit: '128kb' }), async (req, res) => {
  const target = String(req.body.target || 'en').toLowerCase();
  const texts = Array.isArray(req.body.texts) ? req.body.texts : [];

  if (!SUPPORTED_TRANSLATION_LANGUAGES.has(target)) {
    return res.status(400).json({ ok: false, message: 'Unsupported language.' });
  }

  if (target === 'en') {
    return res.json({ ok: true, translations: texts.map((text) => String(text || '')) });
  }

  try {
    const translations = await translateBatch(texts.slice(0, 60), target);
    return res.json({ ok: true, translations });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ ok: false, message: 'Translation service unavailable.' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`Patreon OAuth API listening on http://localhost:${PORT}`));
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
