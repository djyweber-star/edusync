const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getSecurityFile(dataDir, school) {
  return path.join(
    dataDir,
    'schools',
    String(school.id),
    'payment-security.json'
  );
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function validPin(pin) {
  return /^\d{4}$/.test(String(pin || ''));
}

function hashPin(pin, salt) {
  const realSalt =
    salt ||
    crypto.randomBytes(16).toString('hex');

  const hash = crypto
    .scryptSync(String(pin), realSalt, 64)
    .toString('hex');

  return {
    hash,
    salt: realSalt
  };
}

function verifyPin(pin, security) {
  if (
    !security ||
    !security.pinHash ||
    !security.pinSalt
  ) {
    return false;
  }

  try {
    const calculated = crypto.scryptSync(
      String(pin),
      String(security.pinSalt),
      64
    );

    const stored = Buffer.from(
      String(security.pinHash),
      'hex'
    );

    if (calculated.length !== stored.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      calculated,
      stored
    );
  } catch (error) {
    return false;
  }
}

function readPaymentSecurity(dataDir, school) {
  const file = getSecurityFile(dataDir, school);

  if (!fs.existsSync(file)) {
    return {
      configured: false,
      agentPaymentPhone: '',
      agentDisciplinePhone: '',
      pinHash: '',
      pinSalt: '',
      updatedAt: ''
    };
  }

  try {
    const data = JSON.parse(
      fs.readFileSync(file, 'utf8')
    );

    return {
      configured: Boolean(
        data?.pinHash &&
        data?.pinSalt
      ),
      agentPaymentPhone:
        normalizePhone(data?.agentPaymentPhone),
      agentDisciplinePhone:
        normalizePhone(data?.agentDisciplinePhone),
      pinHash: String(data?.pinHash || ''),
      pinSalt: String(data?.pinSalt || ''),
      updatedAt: String(data?.updatedAt || '')
    };
  } catch (error) {
    console.error(
      'READ PAYMENT SECURITY ERROR:',
      error
    );

    return {
      configured: false,
      agentPaymentPhone: '',
      agentDisciplinePhone: '',
      pinHash: '',
      pinSalt: '',
      updatedAt: ''
    };
  }
}

function savePaymentSecurity(
  dataDir,
  school,
  data
) {
  const dir = path.dirname(
    getSecurityFile(dataDir, school)
  );

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
      recursive: true
    });
  }

  const file = getSecurityFile(
    dataDir,
    school
  );

  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        agentPaymentPhone:
          normalizePhone(
            data.agentPaymentPhone
          ),
        agentDisciplinePhone:
          normalizePhone(
            data.agentDisciplinePhone
          ),
        pinHash:
          String(data.pinHash || ''),
        pinSalt:
          String(data.pinSalt || ''),
        updatedAt:
          new Date().toISOString()
      },
      null,
      2
    )
  );
}

function setPaymentPin(
  dataDir,
  school,
  current,
  newPin,
  agentPaymentPhone,
  agentDisciplinePhone
) {
  if (!validPin(newPin)) {
    throw new Error(
      'Le code paiement doit contenir exactement 4 chiffres.'
    );
  }

  const existing =
    current ||
    readPaymentSecurity(
      dataDir,
      school
    );

  const hashed = hashPin(newPin);

  savePaymentSecurity(
    dataDir,
    school,
    {
      agentPaymentPhone,
      agentDisciplinePhone,
      pinHash: hashed.hash,
      pinSalt: hashed.salt
    }
  );

  return readPaymentSecurity(
    dataDir,
    school
  );
}

module.exports = {
  getSecurityFile,
  normalizePhone,
  validPin,
  hashPin,
  verifyPin,
  readPaymentSecurity,
  savePaymentSecurity,
  setPaymentPin
};
