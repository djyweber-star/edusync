'use strict';

const fs = require('fs');
const path = require('path');
const P = require('pino');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const ROOT = path.resolve(__dirname, 'multi-sessions');
const sessions = new Map();
let messageHandler = null;

function validId(value) {
  const id = String(value || '');
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) {
    throw new Error('Identifiant invalide : utilisez lettres, chiffres, _ ou -.');
  }
  return id;
}

function schoolFolder(schoolId) {
  const id = String(schoolId || '');
  if (!id || id.length > 200) {
    throw new Error('Identifiant d’établissement invalide.');
  }
  return Buffer.from(id).toString('base64url');
}

function getKey(schoolId, sessionId) {
  return `${String(schoolId)}:${validId(sessionId)}`;
}

function getDirectory(schoolId, sessionId) {
  return path.join(ROOT, schoolFolder(schoolId), validId(sessionId));
}

function readMeta(directory) {
  const file = path.join(directory, 'session.json');
  if (!fs.existsSync(file)) return null;

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeMeta(directory, meta) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(directory, 'session.json'),
    JSON.stringify(meta, null, 2),
    { mode: 0o600 }
  );
}

function getEntry(schoolId, sessionId) {
  return sessions.get(getKey(schoolId, sessionId)) || null;
}

function publicStatus(entry) {
  return {
    sessionId: entry.sessionId,
    status: entry.status,
    connected: entry.status === 'connected',
    phone: entry.phone || null,
    qr: entry.qr || null,
    pairingCode: entry.pairingCode || null
  };
}

function setMessageHandler(handler) {
  if (typeof handler !== 'function') {
    throw new Error('Le gestionnaire de messages doit être une fonction.');
  }
  messageHandler = handler;
}

function listSessions(schoolId) {
  const base = path.join(ROOT, schoolFolder(schoolId));
  if (!fs.existsSync(base)) return [];

  const results = [];

  for (const sessionId of fs.readdirSync(base)) {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(sessionId)) continue;

    const directory = path.join(base, sessionId);
    if (!fs.statSync(directory).isDirectory()) continue;

    const meta = readMeta(directory);
    if (!meta || String(meta.schoolId) !== String(schoolId)) continue;

    const entry = getEntry(schoolId, sessionId);

    results.push(entry ? publicStatus(entry) : {
      sessionId,
      status: meta.status || 'disconnected',
      connected: false,
      phone: meta.phone || null,
      qr: null,
      pairingCode: null
    });
  }

  return results;
}

function createSession(schoolId, sessionId, phone) {
  const id = validId(sessionId);
  const directory = getDirectory(schoolId, id);
  const existing = readMeta(directory);

  if (existing && String(existing.schoolId) !== String(schoolId)) {
    throw new Error('Cette session ne correspond pas à cet établissement.');
  }

  const cleanPhone = String(phone || '').replace(/\D/g, '');
  const meta = {
    schoolId: String(schoolId),
    sessionId: id,
    phone: cleanPhone || existing?.phone || '',
    status: existing?.status || 'disconnected',
    createdAt: existing?.createdAt || new Date().toISOString()
  };

  writeMeta(directory, meta);
  return meta;
}

async function connectSession(schoolId, sessionId) {
  const id = validId(sessionId);
  const key = getKey(schoolId, id);
  const directory = getDirectory(schoolId, id);
  const meta = readMeta(directory);

  if (!meta || String(meta.schoolId) !== String(schoolId)) {
    throw new Error('Session introuvable. Créez-la d’abord.');
  }

  let entry = sessions.get(key);

  if (entry?.status === 'connected') return publicStatus(entry);
  if (entry?.startingPromise) return entry.startingPromise;

  if (!entry) {
    entry = {
      schoolId: String(schoolId),
      sessionId: id,
      directory,
      phone: meta.phone || '',
      status: 'disconnected',
      qr: null,
      pairingCode: null,
      sock: null,
      startingPromise: null,
      reconnectTimer: null,
      intentionalDisconnect: false,
      connectedAt: 0
    };
    sessions.set(key, entry);
  }

  entry.intentionalDisconnect = false;
  entry.status = 'connecting';
  entry.qr = null;
  entry.pairingCode = null;

  entry.startingPromise = (async () => {
    const { state, saveCreds } = await useMultiFileAuthState(directory);

    if (entry.intentionalDisconnect || sessions.get(key) !== entry) {
      entry.status = 'disconnected';
      return publicStatus(entry);
    }

    const sock = makeWASocket({
      auth: state,
      logger: P({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['School Flow', 'Chrome', '1.0']
    });

    entry.sock = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (
        type !== 'notify' ||
        !messageHandler ||
        entry.sock !== sock ||
        entry.status !== 'connected'
      ) return;

      for (const message of messages || []) {
        if (!message || message.key?.fromMe) continue;

        const rawTimestamp = message.messageTimestamp;
        const messageSeconds =
          typeof rawTimestamp === 'number'
            ? rawTimestamp
            : rawTimestamp && typeof rawTimestamp.toNumber === 'function'
              ? rawTimestamp.toNumber()
              : Number(rawTimestamp);

        if (
          Number.isFinite(messageSeconds) &&
          messageSeconds > 0 &&
          entry.connectedAt > 0 &&
          messageSeconds * 1000 < entry.connectedAt
        ) {
          console.log(
            '[MULTI-WA] Ancien message ignoré après reconnexion :',
            entry.sessionId
          );
          continue;
        }

        try {
          await messageHandler(sock, message, entry.schoolId);
        } catch (error) {
          console.error(
            '[MULTI-WA] Erreur message session',
            entry.sessionId,
            error?.message || error
          );
        }
      }
    });

    sock.ev.on('connection.update', async update => {
      if (entry.sock !== sock) return;

      if (update.qr) {
        try {
          entry.qr = await QRCode.toDataURL(update.qr);
          entry.pairingCode = null;
          entry.status = 'qr';
        } catch (error) {
          console.error('[MULTI-WA] Erreur QR :', error.message);
        }
      }

      if (update.connection === 'open') {
        entry.connectedAt = Date.now();
        entry.status = 'connected';
        entry.qr = null;
        entry.pairingCode = null;
        entry.phone = String(sock.user?.id || '').split(':')[0].split('@')[0]
          || entry.phone;
        writeMeta(directory, {
          ...readMeta(directory),
          phone: entry.phone,
          status: 'connected'
        });
        console.log('[MULTI-WA] Session connectée :', id);

        // SCHOOL FLOW — CONFIRMATION POUR CETTE SESSION
        (async () => {
          try {
            const selfJid = String(sock?.user?.id || '');
            if (!selfJid || !entry.phone) return;

            let schoolName = 'Établissement';
            try {
              const schoolManager = require('./dev-core/school-agent-manager');
              const school = schoolManager.findSchool(entry.schoolId);
              if (school) {
                schoolName = schoolManager.getSchoolName
                  ? schoolManager.getSchoolName(school)
                  : String(school.schoolName || school.name || schoolName);
              }
            } catch (error) {
              console.warn('[MULTI-WA] Nom établissement indisponible :', error.message);
            }

            await sock.sendMessage(selfJid, {
              text: [
                '╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
                '          SCHOOL FLOW',
                '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
                '',
                '🟢 ÉCOLE CONNECTÉE',
                '',
                'ÉTABLISSEMENT : ' + schoolName,
                'ID : ' + entry.schoolId,
                'SESSION : ' + entry.sessionId,
                'NUMÉRO CONNECTÉ : +' + entry.phone,
                '',
                'Connexion WhatsApp établie.',
                '',
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                'School Flow',
                'Développé par NEXORA TECHNOLOGIES'
              ].join('\n')
            });

            console.log('[MULTI-WA] Confirmation envoyée :', id);
          } catch (error) {
            console.error('[MULTI-WA] Confirmation impossible :', error.message);
          }
        })();
      }

      if (update.connection === 'close') {
        const code = update.lastDisconnect?.error?.output?.statusCode;
        entry.sock = null;
        entry.qr = null;
        entry.pairingCode = null;

        if (entry.intentionalDisconnect) {
          entry.status = 'disconnected';
        } else if (code === DisconnectReason.loggedOut) {
          entry.status = 'loggedOut';
          console.warn(
            '[MULTI-WA] Session déconnectée par WhatsApp :',
            id,
            '- identifiants conservés'
          );
        } else if (code === 403) {
          entry.status = 'disconnected';
          console.warn(
            '[MULTI-WA] Refus WhatsApp 403 : reconnexion automatique arrêtée pour',
            id
          );
        } else {
          entry.status = 'disconnected';
          if (!entry.reconnectTimer) {
            entry.reconnectTimer = setTimeout(() => {
              entry.reconnectTimer = null;
              if (!entry.intentionalDisconnect) {
                connectSession(schoolId, id).catch(error => {
                  console.error('[MULTI-WA] Reconnexion :', error.message);
                });
              }
            }, 5000);
          }
        }

        writeMeta(directory, {
          ...readMeta(directory),
          status: entry.status
        });
      }
    });

    return publicStatus(entry);
  })();

  try {
    return await entry.startingPromise;
  } catch (error) {
    entry.status = 'disconnected';
    entry.sock = null;
    throw error;
  } finally {
    entry.startingPromise = null;
  }
}

async function requestPairingCode(schoolId, sessionId, phone) {
  const cleanPhone = String(phone || '').replace(/\D/g, '');

  if (cleanPhone.length < 8 || cleanPhone.length > 15) {
    throw new Error('Numéro invalide. Utilisez le format international sans +.');
  }

  createSession(schoolId, sessionId, cleanPhone);
  await connectSession(schoolId, sessionId);

  const entry = getEntry(schoolId, sessionId);
  if (!entry?.sock) throw new Error('La session WhatsApp n’a pas démarré.');

  if (entry.status === 'connected') {
    throw new Error('Cette session est déjà connectée.');
  }

  const startedAt = Date.now();
  while (
    entry.sock &&
    entry.status === 'connecting' &&
    Date.now() - startedAt < 15000
  ) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  if (!entry.sock) throw new Error('Connexion fermée avant l’appairage.');
  if (entry.status === 'connected') {
    throw new Error('Cette session est déjà connectée.');
  }

  const code = await entry.sock.requestPairingCode(cleanPhone);
  entry.phone = cleanPhone;
  entry.pairingCode = code;
  entry.qr = null;
  entry.status = 'pairing';

  writeMeta(entry.directory, {
    ...readMeta(entry.directory),
    phone: cleanPhone,
    status: 'pairing'
  });

  return { ...publicStatus(entry), pairingCode: code };
}

async function disconnectSession(schoolId, sessionId) {
  const entry = getEntry(schoolId, sessionId);
  if (!entry) return { sessionId, status: 'disconnected', connected: false };

  entry.intentionalDisconnect = true;

  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }

  const sock = entry.sock;
  entry.sock = null;
  entry.status = 'disconnected';
  entry.qr = null;
  entry.pairingCode = null;

  if (sock) {
    try {
      sock.end(new Error('Session mise en pause'));
    } catch {}
  }

  writeMeta(entry.directory, {
    ...readMeta(entry.directory),
    status: 'disconnected'
  });

  return publicStatus(entry);
}

async function deleteSession(schoolId, sessionId) {
  const id = validId(sessionId);
  const key = getKey(schoolId, id);
  const directory = getDirectory(schoolId, id);
  const meta = readMeta(directory);

  if (!meta || String(meta.schoolId) !== String(schoolId)) {
    throw new Error('Session introuvable pour cet établissement.');
  }

  const entry = sessions.get(key);

  if (entry) {
    entry.intentionalDisconnect = true;

    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }

    if (entry.startingPromise) {
      try {
        await entry.startingPromise;
      } catch {}
    }

    const sock = entry.sock;
    entry.sock = null;
    entry.status = 'disconnected';
    entry.qr = null;
    entry.pairingCode = null;

    if (sock) {
      try {
        sock.end(new Error('Session supprimée'));
      } catch {}
    }

    sessions.delete(key);
  }

  fs.rmSync(directory, { recursive: true, force: true });

  console.log('[MULTI-WA] Session supprimée :', id);

  return {
    sessionId: id,
    status: 'deleted',
    connected: false
  };
}

function getSessionStatus(schoolId, sessionId) {
  const entry = getEntry(schoolId, sessionId);
  if (entry) return publicStatus(entry);

  const meta = readMeta(getDirectory(schoolId, sessionId));
  if (!meta || String(meta.schoolId) !== String(schoolId)) return null;

  return {
    sessionId: meta.sessionId,
    status: meta.status || 'disconnected',
    connected: false,
    phone: meta.phone || null,
    qr: null,
    pairingCode: null
  };
}


async function sendSessionMessage(schoolId, sessionId, phone, message) {
  const entry = getEntry(schoolId, sessionId);
  if (!entry || !entry.sock || entry.status !== 'connected') {
    throw new Error('Cette session WhatsApp n’est pas connectée.');
  }

  const cleanPhone = String(phone || '').replace(/\D/g, '');
  const text = String(message || '').trim();
  if (cleanPhone.length < 8 || cleanPhone.length > 15) {
    throw new Error('Numéro de destinataire invalide.');
  }
  if (!text || text.length > 10000) {
    throw new Error('Message vide ou trop long.');
  }

  let jid = cleanPhone + '@s.whatsapp.net';
  if (typeof entry.sock.onWhatsApp === 'function') {
    const results = await entry.sock.onWhatsApp(cleanPhone);
    if (!results || !results.length || !results[0].exists) {
      throw new Error('Numéro non confirmé sur WhatsApp.');
    }
    jid = results[0].jid || jid;
  }

  await entry.sock.sendMessage(jid, { text });
  return { success: true, sessionId: entry.sessionId, phone: cleanPhone };
}

module.exports = {
  setMessageHandler,
  createSession,
  listSessions,
  connectSession,
  requestPairingCode,
  disconnectSession,
  deleteSession,
  getSessionStatus,
  sendSessionMessage
};
