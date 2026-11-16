const fs = require('fs');
const path = require('path');

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function getAlertsFile(dataDir, school) {
  return path.join(
    dataDir,
    'schools',
    String(school?.id || 'unknown'),
    'payment-security-alerts.json'
  );
}

function readAlerts(dataDir, school) {
  const file = getAlertsFile(dataDir, school);

  if (!fs.existsSync(file)) {
    return [];
  }

  try {
    const data = JSON.parse(
      fs.readFileSync(file, 'utf8')
    );

    return Array.isArray(data)
      ? data
      : [];
  } catch (error) {
    console.error(
      'READ PAYMENT ALERTS ERROR:',
      error
    );

    return [];
  }
}

function saveAlert(dataDir, school, alert) {
  const file = getAlertsFile(
    dataDir,
    school
  );

  const dir = path.dirname(file);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
      recursive: true
    });
  }

  const alerts =
    readAlerts(
      dataDir,
      school
    );

  alerts.push({
    id:
      'PAY-ALERT-' +
      Date.now(),
    schoolId:
      String(school?.id || ''),
    source:
      String(alert?.source || 'unknown'),
    event:
      String(alert?.event || 'security_attempt'),
    phone:
      normalizePhone(alert?.phone),
    ip:
      String(alert?.ip || ''),
    location:
      String(alert?.location || ''),
    attempts:
      Number(alert?.attempts || 0),
    reason:
      String(alert?.reason || ''),
    userAgent:
      String(alert?.userAgent || ''),
    createdAt:
      new Date().toISOString()
  });

  /*
   * On conserve uniquement les 100 dernières
   * alertes pour éviter une croissance infinie.
   */
  const limited =
    alerts.slice(-100);

  fs.writeFileSync(
    file,
    JSON.stringify(
      limited,
      null,
      2
    )
  );

  return limited[limited.length - 1];
}

function buildWhatsAppAlert(alert, school) {
  const schoolName =
    String(
      school?.name ||
      school?.schoolName ||
      'Établissement'
    ).trim();

  const phone =
    normalizePhone(
      alert?.phone
    );

  const attempts =
    Number(
      alert?.attempts || 0
    );

  const now =
    new Date();

  const date =
    now.toLocaleDateString(
      'fr-FR',
      {
        timeZone:
          'Africa/Kinshasa'
      }
    );

  const time =
    now.toLocaleTimeString(
      'fr-FR',
      {
        timeZone:
          'Africa/Kinshasa',
        hour:
          '2-digit',
        minute:
          '2-digit'
      }
    );

  let message =
    '🚨 *ALERTE SÉCURITÉ — SCHOOL FLOW*\n\n' +
    'Une tentative de sécurité a été détectée.\n\n' +
    '🏫 *Établissement :* ' +
    schoolName +
    '\n' +
    '📡 *Origine :* ' +
    (
      alert?.source === 'web'
        ? 'INTERFACE WEB'
        : 'WHATSAPP'
    ) +
    '\n';

  if (phone) {
    message +=
      '📱 *Numéro détecté :* ' +
      phone +
      '\n';
  }

  if (alert?.ip) {
    message +=
      '🌐 *Adresse IP :* ' +
      String(alert.ip) +
      '\n';
  }

  if (alert?.location) {
    message +=
      '📍 *Localisation estimée :* ' +
      String(alert.location) +
      '\n';
  }

  message +=
    '🔢 *Tentatives :* ' +
    attempts +
    '\n' +
    '⚠️ *Motif :* ' +
    String(
      alert?.reason ||
      'Tentative non autorisée'
    ) +
    '\n' +
    '📅 *Date :* ' +
    date +
    '\n' +
    '🕐 *Heure :* ' +
    time +
    '\n\n' +
    '🔒 *Résultat :* tentative bloquée.';

  return message;
}

async function notifyPaymentAgent(
  sock,
  dataDir,
  school,
  security,
  alert
) {
  const agentPhone =
    normalizePhone(
      security?.agentPaymentPhone
    );

  if (!agentPhone) {
    console.log(
      '⚠️ ALERTE SÉCURITÉ : agent financier principal non configuré.'
    );

    return null;
  }

  const saved =
    saveAlert(
      dataDir,
      school,
      alert
    );

  if (!sock) {
    return saved;
  }

  let jid =
    agentPhone +
    '@s.whatsapp.net';

  try {
    if (typeof sock.onWhatsApp === 'function') {
      const results =
        await sock.onWhatsApp(agentPhone);

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
            '📡 JID AGENT FINANCIER RÉSOLU —',
            agentPhone,
            '→',
            jid
          );
        }
      }
    }

    await sock.sendMessage(
      jid,
      {
        text:
          buildWhatsAppAlert(
            alert,
            school
          )
      }
    );

    return saved;
  } catch (error) {
    console.error(
      'SEND PAYMENT SECURITY ALERT ERROR:',
      error
    );

    return saved;
  }
}

module.exports = {
  normalizePhone,
  getAlertsFile,
  readAlerts,
  saveAlert,
  buildWhatsAppAlert,
  notifyPaymentAgent
};
