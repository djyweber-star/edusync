

const P = require('pino');
const { handleIncomingMessage } = require('./bot-engine');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.resolve('./whatsapp/session');
const SESSION_BACKUP_PREFIX = 'whatsapp/session-backup';

let sock = null;
let currentQR = null;
let currentPairingCode = null;
let connectionStatus = 'disconnected';
let reconnectTimer = null;
let intentionalDisconnect = false;
let startingPromise = null;
let sessionRecoveryInProgress = false;

function ensureSessionDirectory() {
  fs.mkdirSync(SESSION_DIR, {
    recursive: true
  });
}

function clearConnectionState() {
  currentQR = null;
  currentPairingCode = null;
  connectionStatus = 'disconnected';
  sock = null;
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function createSessionBackupPath(label) {
  const safeLabel = String(label || 'backup')
    .replace(/[^a-zA-Z0-9_-]/g, '-');

  return path.resolve(
    `${SESSION_BACKUP_PREFIX}-${safeLabel}-${Date.now()}`
  );
}

function moveCurrentSessionToBackup(label) {
  if (!fs.existsSync(SESSION_DIR)) {
    return null;
  }

  const entries = fs.readdirSync(SESSION_DIR);

  if (!entries.length) {
    return null;
  }

  const backupPath = createSessionBackupPath(label);

  fs.renameSync(
    SESSION_DIR,
    backupPath
  );

  fs.mkdirSync(
    SESSION_DIR,
    { recursive: true }
  );

  console.log(
    '📦 SESSION WHATSAPP MISE EN SAUVEGARDE :',
    backupPath
  );

  return backupPath;
}

function readCurrentCredentials() {
  const credsPath = path.join(
    SESSION_DIR,
    'creds.json'
  );

  if (!fs.existsSync(credsPath)) {
    return null;
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        credsPath,
        'utf8'
      )
    );
  } catch (error) {
    console.error(
      '⚠️ IMPOSSIBLE DE LIRE creds.json :',
      error.message
    );

    return null;
  }
}

function isSessionRegistered() {
  const creds = readCurrentCredentials();

  if (!creds) {
    return false;
  }

  return creds.registered === true;
}

async function prepareSession() {
  ensureSessionDirectory();

  const creds = readCurrentCredentials();

  if (!creds) {
    return;
  }

  if (creds.registered === false) {
    const backupPath =
      moveCurrentSessionToBackup(
        'incomplete'
      );

    if (backupPath) {
      console.log(
        '🧹 SESSION WHATSAPP INCOMPLÈTE ISOLÉE.'
      );
    }
  }
}

let whatsappConnectedAt = 0;

async function startWhatsApp() {
  if (
    sock &&
    (
      connectionStatus === 'connecting' ||
      connectionStatus === 'qr' ||
      connectionStatus === 'pairing' ||
      connectionStatus === 'connected'
    )
  ) {
    return sock;
  }

  if (startingPromise) {
    return startingPromise;
  }

  startingPromise = (async () => {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestWaWebVersion
    } = await import('@whiskeysockets/baileys');
    intentionalDisconnect = false;

    await prepareSession();

    connectionStatus = 'connecting';
    currentQR = null;
    currentPairingCode = null;

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(
      SESSION_DIR
    );

    let waVersion = null;

    try {
      const latest =
        await fetchLatestWaWebVersion();

      if (latest?.version) {
        waVersion = latest.version;

        console.log(
          '🌐 VERSION WHATSAPP WEB UTILISÉE :',
          waVersion.join('.')
        );
      }
    } catch (error) {
      console.warn(
        '⚠️ VERSION WHATSAPP WEB NON RÉCUPÉRÉE :',
        error.message
      );
    }

    const socketOptions = {
      auth: state,
      logger: P({
        level: 'debug'
      }),
      printQRInTerminal: false,
      browser: ['Mac OS', 'Chrome', '14.4.1']
    };

    if (waVersion) {
      socketOptions.version =
        waVersion;
    }

    const newSock =
      makeWASocket(socketOptions);

    sock = newSock;

    sock.ev.on(
      'creds.update',
      saveCreds
    );

    sock.ev.on(
      'messages.upsert',
      async ({ messages, type }) => {
        // Ignorer l'historique et les événements non destinés
        // aux nouveaux messages reçus.
        if (type !== 'notify' || sock !== newSock || connectionStatus !== 'connected') return;

        for (const message of messages || []) {
          if (!message || message.key?.fromMe) continue;

          // Ignorer tout message antérieur à la dernière connexion.
          const rawTimestamp = message.messageTimestamp;
          const messageSeconds = typeof rawTimestamp === 'number'
            ? rawTimestamp
            : rawTimestamp && typeof rawTimestamp.toNumber === 'function'
              ? rawTimestamp.toNumber()
              : Number(rawTimestamp);

          if (
            Number.isFinite(messageSeconds) &&
            messageSeconds > 0 &&
            typeof whatsappConnectedAt === 'number' &&
            messageSeconds * 1000 < whatsappConnectedAt
          ) {
            console.log('⏭️ Ancien message ignoré après reconnexion.');
            continue;
          }

          try {
            await handleIncomingMessage(newSock, message);
          } catch (error) {
            console.error(
              '❌ ERREUR TRAITEMENT MESSAGE SCHOOL FLOW :',
              error?.message || error
            );
          }
        }
      }
    );

    sock.ev.on(
      'connection.update',
      async (update) => {
        if (sock !== newSock) return;

        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        if (qr) {
          try {
            currentQR =
              await QRCode.toDataURL(
                qr
              );

            currentPairingCode = null;
            connectionStatus = 'qr';

            console.log(
              '📱 QR CODE WHATSAPP DISPONIBLE'
            );
          } catch (error) {
            console.error(
              '❌ ERREUR GÉNÉRATION QR :',
              error
            );
          }
        }

        if (connection === 'open') {
          whatsappConnectedAt = Date.now();
          connectionStatus =
            'connected';

          currentQR = null;
          currentPairingCode = null;
          sessionRecoveryInProgress =
            false;

          clearReconnectTimer();

          const number =
            getConnectedNumber();

          console.log(
            '🟢 WHATSAPP SCHOOL FLOW CONNECTÉ',
            number
              ? `(${number})`
              : ''
          );

          // SCHOOL FLOW — CONFIRMATION DANS LA DISCUSSION DU NUMÉRO CONNECTÉ
          (async () => {
            try {
              const selfJid = String(sock?.user?.id || '');
              if (!selfJid || !number) return;

              await sock.sendMessage(selfJid, {
                text: [
                  '╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
                  '          SCHOOL FLOW',
                  '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
                  '',
                  '🟢 ÉCOLE CONNECTÉE',
                  '',
                  'ID : ÉCOLE',
                  'NUMÉRO CONNECTÉ : +' + number,
                  '',
                  'Connexion WhatsApp établie.',
                  '',
                  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                  'School Flow',
                  'Développé par NEXORA TECHNOLOGIES'
                ].join('\n')
              });

              console.log('✅ Confirmation de connexion envoyée au numéro principal.');
            } catch (error) {
              console.error('❌ Confirmation principale impossible :', error.message);
            }
          })();
        }

        if (connection === 'close') {
          const code =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          const wasIntentional =
            intentionalDisconnect;

          const disconnectError = lastDisconnect?.error;
          const disconnectData = disconnectError?.data || {};
          const disconnectDetails = {
            message: disconnectError?.message || null,
            statusCode: disconnectError?.output?.statusCode || code || null,
            code: disconnectData.code || null,
            text: disconnectData.text || null,
            type: disconnectData.type || null,
            reason: disconnectData.reason || null,
            location: disconnectData.location || null
          };

          console.log(
            '🔴 WHATSAPP DÉCONNECTÉ :',
            code || 'inconnu'
          );

          console.warn(
            '🔎 DÉTAILS DU REFUS WHATSAPP :',
            JSON.stringify(disconnectDetails, null, 2)
          );

          clearConnectionState();

          /*
           * 401 = session rejetée par WhatsApp.
           *
           * On ne réutilise jamais une session
           * que WhatsApp vient de rejeter.
           *
           * Elle est déplacée en sauvegarde,
           * puis une session propre est créée.
           */
          if (
            code ===
              DisconnectReason.loggedOut
          ) {
            clearReconnectTimer();

            if (
              !sessionRecoveryInProgress
            ) {
              sessionRecoveryInProgress =
                true;

              try {
                const backupPath =
                  moveCurrentSessionToBackup(
                    '401'
                  );

                console.log(
                  '🔐 SESSION 401 ISOLÉE.',
                  backupPath
                    ? backupPath
                    : 'AUCUNE SESSION À SAUVEGARDER'
                );

                ensureSessionDirectory();

                connectionStatus =
                  'disconnected';

                console.log(
                  '🆕 NOUVELLE SESSION WHATSAPP PRÊTE POUR QR / APPAIRAGE.'
                );
              } catch (error) {
                console.error(
                  '❌ ERREUR RÉCUPÉRATION SESSION 401 :',
                  error
                );

                connectionStatus =
                  'disconnected';
              }
            }

            return;
          }

          /*
           * Refus WhatsApp 403 :
           * aucune reconnexion automatique.
           * Les identifiants sont conservés.
           */
          if (code === 403) {
            clearReconnectTimer();
            connectionStatus = 'disconnected';
            console.warn(
              '⛔ WHATSAPP REFUSE LA CONNEXION (403). RECONNEXION AUTOMATIQUE ARRÊTÉE.'
            );
            return;
          }

          /*
           * Déconnexion volontaire :
           * aucune reconnexion automatique.
           */
          if (wasIntentional) {
            clearReconnectTimer();
            return;
          }

          /*
           * Pour les autres erreurs réseau,
           * on tente une reconnexion contrôlée.
           */
          clearReconnectTimer();

          reconnectTimer =
            setTimeout(() => {
              startWhatsApp()
                .catch((error) => {
                  console.error(
                    '❌ ERREUR RECONNEXION WHATSAPP :',
                    error
                  );
                });
            }, 5000);
        }
      }
    );

    return sock;
  })();

  try {
    return await startingPromise;
  } finally {
    startingPromise = null;
  }
}

function getConnectedNumber() {
  try {
    if (!sock?.user?.id) {
      return null;
    }

    return String(sock.user.id)
      .split(':')[0]
      .split('@')[0];
  } catch {
    return null;
  }
}

function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    connected:
      connectionStatus === 'connected',
    qr: currentQR,
    pairingCode:
      currentPairingCode,
    phone:
      getConnectedNumber(),
    sessionRegistered:
      isSessionRegistered()
  };
}

async function requestPairingCode(phone) {
  const cleanPhone =
    String(phone || '')
      .replace(/\D/g, '');

  if (!cleanPhone) {
    throw new Error(
      'Numéro de téléphone invalide.'
    );
  }

  if (
    sock &&
    connectionStatus === 'connected'
  ) {
    throw new Error(
      'Un numéro WhatsApp est déjà connecté. Déconnectez-le avant.'
    );
  }

  if (
    !sock ||
    connectionStatus ===
      'disconnected'
  ) {
    await startWhatsApp();
  }

  if (!sock) {
    throw new Error(
      'Impossible de démarrer WhatsApp.'
    );
  }

  if (
    connectionStatus !== 'connected' &&
    connectionStatus !== 'qr' &&
    connectionStatus !== 'pairing'
  ) {
    const startedAt =
      Date.now();

    while (
      sock &&
      connectionStatus ===
        'connecting' &&
      Date.now() - startedAt <
        15000
    ) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            250
          )
      );
    }
  }

  if (!sock) {
    throw new Error(
      'La connexion WhatsApp a été fermée avant la génération du code. Réessayez.'
    );
  }

  if (
    connectionStatus ===
    'connected'
  ) {
    throw new Error(
      'Un numéro WhatsApp est déjà connecté. Déconnectez-le avant.'
    );
  }

  if (
    connectionStatus ===
    'disconnected'
  ) {
    throw new Error(
      'WhatsApp n’est pas prêt pour l’appairage. Réessayez.'
    );
  }

  connectionStatus =
    'pairing';

  currentQR = null;

  try {
    const code =
      await sock.requestPairingCode(
        cleanPhone
      );

    currentPairingCode =
      code;

    console.log(
      '🔐 CODE D’APPAIRAGE WHATSAPP :',
      code
    );

    return code;
  } catch (error) {
    currentPairingCode = null;

    console.error(
      '❌ ERREUR CODE APPAIRAGE :',
      error?.message || error
    );

    throw error;
  }
}

async function disconnectWhatsApp() {
  intentionalDisconnect = true;

  clearReconnectTimer();

  currentQR = null;
  currentPairingCode = null;

  if (sock) {
    try {
      await sock.logout();
    } catch (error) {
      console.log(
        'Déconnexion WhatsApp :',
        error?.message || error
      );
    }
  }

  sock = null;
  connectionStatus =
    'disconnected';

  /*
   * Après un logout volontaire, les credentials
   * ne doivent pas être réutilisés comme une
   * ancienne session valide.
   *
   * On les conserve toutefois dans une sauvegarde.
   */
  try {
    moveCurrentSessionToBackup(
      'logout'
    );
  } catch (error) {
    console.error(
      '⚠️ Impossible de sauvegarder la session déconnectée :',
      error
    );
  }

  ensureSessionDirectory();

  intentionalDisconnect = false;

  console.log(
    '🔌 WHATSAPP DÉCONNECTÉ PROPREMENT.'
  );

  return true;
}

async function deleteWhatsAppConnection() {
  intentionalDisconnect = true;

  clearReconnectTimer();

  currentQR = null;
  currentPairingCode = null;

  if (sock) {
    try {
      await sock.logout();
    } catch (error) {
      console.log(
        'Suppression connexion WhatsApp :',
        error?.message || error
      );
    }
  }

  sock = null;
  connectionStatus =
    'disconnected';

  /*
   * Même lors d'une suppression demandée
   * par l'utilisateur, on garde une copie
   * de sécurité avant nettoyage.
   */
  try {
    moveCurrentSessionToBackup(
      'deleted'
    );
  } catch (error) {
    console.error(
      '⚠️ Impossible de sauvegarder avant suppression :',
      error
    );
  }

  ensureSessionDirectory();

  intentionalDisconnect = false;

  console.log(
    '🗑️ CONNEXION WHATSAPP SUPPRIMÉE PROPREMENT.'
  );

  return true;
}

async function connectNewWhatsApp() {
  await deleteWhatsAppConnection();

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        500
      )
  );

  return startWhatsApp();
}

async function sendMessage(
  phone,
  message
) {
  if (
    !sock ||
    connectionStatus !==
      'connected'
  ) {
    throw new Error(
      'WhatsApp n’est pas connecté.'
    );
  }

  const cleanPhone =
    String(phone || '')
      .replace(/\D/g, '');

  if (!cleanPhone) {
    throw new Error(
      'Numéro de téléphone invalide.'
    );
  }

  let jid =
    cleanPhone +
    '@s.whatsapp.net';

  try {
    if (
      typeof sock.onWhatsApp ===
      'function'
    ) {
      const results =
        await sock.onWhatsApp(
          cleanPhone
        );

      if (
        Array.isArray(results) &&
        results.length
      ) {
        const resolved =
          results.find(
            item =>
              item &&
              item.exists &&
              item.jid
          );

        if (resolved?.jid) {
          jid = resolved.jid;

          console.log(
            '📡 JID WHATSAPP RÉSOLU —',
            cleanPhone,
            '→',
            jid
          );
        }
      }
    }
  } catch (error) {
    console.warn(
      '⚠️ RÉSOLUTION JID IMPOSSIBLE — FALLBACK NUMÉRO :',
      cleanPhone,
      error?.message || error
    );
  }

  await sock.sendMessage(
    jid,
    {
      text: String(
        message ?? ''
      )
    }
  );

  return true;
}

module.exports = {
  startWhatsApp,
  getWhatsAppStatus,
  requestPairingCode,
  disconnectWhatsApp,
  deleteWhatsAppConnection,
  connectNewWhatsApp,
  sendMessage
};
