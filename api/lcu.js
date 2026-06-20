const childProcess = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const fetch = require('node-fetch');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function commonLockfilePaths() {
  if (process.platform !== 'win32') return [];

  const candidates = [
    process.env.LEAGUE_LOCKFILE,
    'C:\\Riot Games\\League of Legends\\lockfile',
    'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
    'C:\\Program Files (x86)\\Riot Games\\League of Legends\\lockfile'
  ];

  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'Riot Games', 'League of Legends', 'lockfile'));
  }
  if (process.env.PROGRAMDATA) {
    candidates.push(path.join(process.env.PROGRAMDATA, 'Riot Games', 'League of Legends', 'lockfile'));
  }

  return candidates;
}

function processLockfilePaths() {
  if (process.platform !== 'win32') return [];

  const commands = [
    ['powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name = 'LeagueClientUx.exe'\" | Select-Object -ExpandProperty ExecutablePath"]],
    ['wmic.exe', ['process', 'where', "name='LeagueClientUx.exe'", 'get', 'ExecutablePath', '/value']]
  ];

  for (const [command, args] of commands) {
    try {
      const output = childProcess.execFileSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 1500 });
      const paths = output
        .split(/\r?\n/)
        .map(line => line.replace(/^ExecutablePath=/, '').trim())
        .filter(line => line && /^[A-Z]:\\/i.test(line))
        .map(executable => path.join(path.dirname(executable), 'lockfile'));
      if (paths.length) return paths;
    } catch (error) {
      // Some Windows environments block process inspection. Common install paths still cover most local clients.
    }
  }

  return [];
}

function findLockfile() {
  const candidates = unique([...commonLockfilePaths(), ...processLockfilePaths()]);
  return candidates.find(candidate => {
    try {
      return fs.existsSync(candidate);
    } catch (error) {
      return false;
    }
  });
}

function parseLockfile(raw) {
  const [name, pid, port, password, protocol] = String(raw).trim().split(':');
  if (!name || !pid || !port || !password || !protocol) {
    throw new Error('League Client lockfile has an unexpected format.');
  }
  return { name, pid, port, password, protocol };
}

function readLeagueClientAuth() {
  const lockfile = findLockfile();
  if (!lockfile) {
    const error = new Error('League Client is not running, or its lockfile could not be found.');
    error.code = 'LCU_LOCKFILE_NOT_FOUND';
    throw error;
  }

  const lock = parseLockfile(fs.readFileSync(lockfile, 'utf8'));
  return { ...lock, lockfile };
}

async function requestLcu(lock, method, route, body) {
  const auth = Buffer.from(`riot:${lock.password}`).toString('base64');
  const response = await fetch(`${lock.protocol}://127.0.0.1:${lock.port}${route}`, {
    method,
    agent: httpsAgent,
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      json = { message: text };
    }
  }

  if (!response.ok) {
    const error = new Error((json && (json.message || json.error)) || `League Client API returned ${response.status}.`);
    error.status = response.status;
    error.details = json;
    throw error;
  }

  return json;
}

function validateRunePage(input) {
  const page = input && typeof input === 'object' ? input : {};
  const selectedPerkIds = Array.isArray(page.selectedPerkIds)
    ? page.selectedPerkIds.map(Number).filter(Number.isInteger)
    : [];

  const validationError = (message) => {
    const error = new Error(message);
    error.status = 400;
    return error;
  };

  if (!page.name || typeof page.name !== 'string') throw validationError('Missing rune page name.');
  if (!Number.isInteger(Number(page.primaryStyleId))) throw validationError('Missing primary style id.');
  if (!Number.isInteger(Number(page.subStyleId))) throw validationError('Missing secondary style id.');
  if (selectedPerkIds.length !== 9) throw validationError('A League rune page requires 6 runes and 3 stat shards.');

  return {
    name: page.name.slice(0, 60),
    primaryStyleId: Number(page.primaryStyleId),
    subStyleId: Number(page.subStyleId),
    selectedPerkIds,
    current: true
  };
}

async function importRunePage(input) {
  const page = validateRunePage(input);
  const lock = readLeagueClientAuth();
  const pages = await requestLcu(lock, 'GET', '/lol-perks/v1/pages');
  const existing = Array.isArray(pages)
    ? pages.find(candidate => candidate && candidate.name === page.name && candidate.isDeletable !== false)
    : null;

  let importedPage;
  if (existing && existing.id) {
    importedPage = await requestLcu(lock, 'PUT', `/lol-perks/v1/pages/${existing.id}`, {
      ...existing,
      ...page,
      id: existing.id
    });
  } else {
    importedPage = await requestLcu(lock, 'POST', '/lol-perks/v1/pages', page);
  }

  return {
    ok: true,
    page: importedPage || page,
    lockfile: lock.lockfile
  };
}

function lcuErrorResponse(error) {
  if (error.code === 'LCU_LOCKFILE_NOT_FOUND') {
    return {
      status: 503,
      body: {
        ok: false,
        code: error.code,
        message: 'Open League Client, then try importing again.'
      }
    };
  }

  return {
    status: error.status || 500,
    body: {
      ok: false,
      code: 'LCU_IMPORT_FAILED',
      message: error.message || 'Unable to import rune page into League Client.',
      details: error.details
    }
  };
}

module.exports = {
  importRunePage,
  lcuErrorResponse
};
