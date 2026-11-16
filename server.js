/* SCHOOL_FLOW_SECURITY_V4_ALL_IN_ONE */
/* SCHOOL_FLOW_AUTH_V3_CORRECTED */
require('dotenv').config();
const crypto = require('crypto');

/* =========================================================
   SCHOOL_FLOW_REMOTE_AI_V1
========================================================= */

const schoolFlowRemoteAI = require('./ai/local-ai-client');

const express = require('express');
const path = require('path');
const fs = require('fs');

const {
  startWhatsApp,
  getWhatsAppStatus,
  requestPairingCode,
  disconnectWhatsApp,
  deleteWhatsAppConnection,
  connectNewWhatsApp,
  sendMessage
} = require('./whatsapp/connection');


/* =========================================================
   SCHOOL_FLOW_AUTH_V1
========================================================= */

const { AsyncLocalStorage } = require('async_hooks');
const multiSessionManager = require('./whatsapp/multi-session-manager');
const { handleIncomingMessage } = require('./whatsapp/bot-engine');


const schoolFlowWebSessions = new Map();
const SCHOOL_FLOW_SESSION_TTL = 8 * 60 * 60 * 1000;
const schoolFlowAuthContext = new AsyncLocalStorage();

multiSessionManager.setMessageHandler((sock, message, schoolId) => {
  return schoolFlowAuthContext.run(
    { schoolId: String(schoolId) },
    () => handleIncomingMessage(sock, message, schoolId)
  );
});


function createSchoolFlowSession(schoolId) {
  const token = crypto.randomBytes(32).toString('hex');

  schoolFlowWebSessions.set(token, {
    schoolId: String(schoolId),
    createdAt: Date.now(),
    expiresAt: Date.now() + SCHOOL_FLOW_SESSION_TTL
  });

  return token;
}

function getSchoolFlowSession(req) {
  const cookieHeader = String(req.headers.cookie || '');

  const token = cookieHeader
    .split(';')
    .map(item => item.trim())
    .find(item => item.startsWith('school_flow_session='))
    ?.split('=')
    .slice(1)
    .join('=') || '';

  if (!token) {
    return null;
  }

  const session = schoolFlowWebSessions.get(token);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    schoolFlowWebSessions.delete(token);
    return null;
  }

  session.expiresAt = Date.now() + SCHOOL_FLOW_SESSION_TTL;

  return {
    token,
    ...session
  };
}

function setSchoolFlowSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    'school_flow_session=' +
      encodeURIComponent(token) +
      '; HttpOnly; Path=/; SameSite=Lax; Max-Age=' +
      Math.floor(SCHOOL_FLOW_SESSION_TTL / 1000)
  );
}

function clearSchoolFlowSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    'school_flow_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
  );
}

function requireSchoolFlowAuth(req, res, next) {
  const session = getSchoolFlowSession(req);

  if (!session) {
    return res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'Authentification SCHOOL FLOW requise.'
    });
  }

  return schoolFlowAuthContext.run(
    {
      schoolId: String(session.schoolId)
    },
    () => next()
  );
}

function getRequestSchoolId() {
  const context = schoolFlowAuthContext.getStore();

  if (context && context.schoolId) {
    return String(context.schoolId);
  }

  return null;
}

/* =========================================================
   FIN SCHOOL_FLOW_AUTH_V1
========================================================= */


const app = express();
const PORT = process.env.PORT || 3000;

const paymentWebSessions = new Map();
const paymentWebAttempts = new Map();
const PAYMENT_WEB_TTL = 15 * 60 * 1000;
const PAYMENT_WEB_MAX_ATTEMPTS = 3;
const PAYMENT_WEB_BLOCK = 15 * 60 * 1000;

const DATA_DIR = path.join(__dirname, 'data');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STUDENTS_FILE)) fs.writeFileSync(STUDENTS_FILE, '[]');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* SCHOOL_FLOW_AUTH_REQUEST_CONTEXT */

app.use((req, res, next) => {
  const session = getSchoolFlowSession(req);

  if (!session) {
    return next();
  }

  return schoolFlowAuthContext.run(
    {
      schoolId: String(session.schoolId)
    },
    () => next()
  );
});


app.use(express.static(path.join(__dirname, 'public')));

/* =========================================================
   SCHOOL_FLOW_AUTH_V2_ROUTE_LOCK
   Protection serveur des routes SCHOOL FLOW
========================================================= */

app.use('/api/school', requireSchoolFlowAuth);
app.use('/api/whatsapp', requireSchoolFlowAuth);
app.use('/api/students', requireSchoolFlowAuth);
app.use('/api/bot', requireSchoolFlowAuth);
app.use('/api/payments', requireSchoolFlowAuth);

/* =========================================================
   FIN SCHOOL_FLOW_AUTH_V2_ROUTE_LOCK
========================================================= */



/* =========================================================
   SCHOOL FLOW — PROTECTION FINANCIÈRE WEB
========================================================= */

function getPaymentWebKey(req, school) {
  const ip = String(
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    req.ip ||
    ''
  ).split(',')[0].trim();

  return String(school.id) + '|' + ip;
}

function getPaymentWebToken(req) {
  return String(
    req.headers['x-school-flow-payment-token'] || ''
  ).trim();
}

function requirePaymentWebAccess(req, res, next) {
  const school = getActiveSchoolForPayments();

  if (!school) {
    return res.status(404).json({
      success: false,
      message: 'Établissement introuvable.'
    });
  }

  const token = getPaymentWebToken(req);
  const session = paymentWebSessions.get(token);

  if (!session) {
    return res.status(403).json({
      success: false,
      code: 'PAYMENT_LOCKED',
      message: 'Accès financier verrouillé.'
    });
  }

  if (
    session.schoolId !== String(school.id) ||
    session.expiresAt <= Date.now()
  ) {
    paymentWebSessions.delete(token);

    return res.status(403).json({
      success: false,
      code: 'PAYMENT_LOCKED',
      message: 'Session financière expirée.'
    });
  }

  session.expiresAt =
    Date.now() + PAYMENT_WEB_TTL;

  next();
}

app.post('/api/payments/access', async (req, res) => {
  try {
    const school = getActiveSchoolForPayments();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const security =
      paymentSecurity.readPaymentSecurity(
        DATA_DIR,
        school
      );

    if (!security.configured) {
      return res.status(403).json({
        success: false,
        code: 'PAYMENT_NOT_CONFIGURED',
        message:
          'Le code PIN financier n’est pas configuré.'
      });
    }

    const key =
      getPaymentWebKey(req, school);

    const old =
      paymentWebAttempts.get(key);

    if (
      old &&
      Number(old.attempts || 0) >= PAYMENT_WEB_MAX_ATTEMPTS &&
      old.blockedUntil > Date.now()
    ) {
      return res.status(429).json({
        success: false,
        code: 'PAYMENT_BLOCKED',
        message:
          'Accès temporairement bloqué après plusieurs tentatives.'
      });
    }

    const pin =
      String(req.body?.pin || '').trim();

    if (!paymentSecurity.validPin(pin)) {
      return res.status(400).json({
        success: false,
        message:
          'Le code PIN doit contenir exactement 4 chiffres.'
      });
    }

    if (
      paymentSecurity.verifyPin(
        pin,
        security
      )
    ) {
      paymentWebAttempts.delete(key);

      const token =
        crypto.randomBytes(32).toString('hex');

      paymentWebSessions.set(token, {
        schoolId: String(school.id),
        expiresAt:
          Date.now() + PAYMENT_WEB_TTL
      });

      return res.json({
        success: true,
        token
      });
    }

    const attempts =
      Number(old?.attempts || 0) + 1;

    if (attempts >= PAYMENT_WEB_MAX_ATTEMPTS) {

      paymentWebAttempts.set(key, {
        attempts,
        blockedUntil:
          Date.now() + PAYMENT_WEB_BLOCK
      });

      const alert = {
        source: 'web',
        event: 'payment_web_access_failed',
        phone: '',
        ip: String(
          req.headers['x-forwarded-for'] ||
          req.socket?.remoteAddress ||
          req.ip ||
          ''
        ).split(',')[0].trim(),
        location: '',
        attempts,
        reason:
          'Trois codes PIN financiers incorrects depuis l’interface Web',
        userAgent:
          String(
            req.headers['user-agent'] || ''
          )
      };

      paymentAlerts.saveAlert(
        DATA_DIR,
        school,
        alert
      );

      const agentPhone =
        paymentSecurity.normalizePhone(
          security.agentPaymentPhone
        );

      if (agentPhone) {
        try {
          await sendMessage(
            agentPhone,
            paymentAlerts.buildWhatsAppAlert(
              alert,
              school
            )
          );
        } catch (error) {
          console.error(
            'ALERTE WEB WHATSAPP ERROR:',
            error
          );
        }
      }

      return res.status(429).json({
        success: false,
        code: 'PAYMENT_BLOCKED',
        message:
          'Trois codes incorrects. Accès bloqué et alerte envoyée.'
      });
    }

    paymentWebAttempts.set(key, {
      attempts,
      blockedUntil:
        attempts >= PAYMENT_WEB_MAX_ATTEMPTS
          ? Date.now() + PAYMENT_WEB_BLOCK
          : 0
    });

    return res.status(401).json({
      success: false,
      code: 'PAYMENT_PIN_INCORRECT',
      message: 'Code PIN incorrect.',
      attempts,
      remaining:
        PAYMENT_WEB_MAX_ATTEMPTS - attempts
    });

  } catch (error) {
    console.error(
      'PAYMENT WEB ACCESS ERROR:',
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});



const { readSchools, findSchool } = require('./school-auth');
const QRCode = require('qrcode');

const paymentSecurity = require('./security/payment-security');
const paymentAlerts = require('./security/payment-alerts');

app.get('/api/student-registration/qr', async (req, res) => {
  try {
    const activeSchoolId = getRequestSchoolId();

    if (!activeSchoolId) {
      return res.status(401).json({
        success: false,
        message: 'Session SCHOOL FLOW introuvable.'
      });
    }

    if (!activeSchoolId) {
      return res.status(401).json({
        success: false,
        message: 'Aucun établissement connecté.'
      });
    }

    const schools = readSchools();
    const school = schools.find(s => s.id === activeSchoolId);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    if (!school.registrationCode) {
      return res.status(500).json({
        success: false,
        message: 'Code d’inscription absent pour cet établissement.'
      });
    }

    const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const registrationUrl =
      `${baseUrl}/inscription-eleve.html?school=${encodeURIComponent(school.registrationCode)}`;

    const qrDataUrl = await QRCode.toDataURL(registrationUrl, {
      width: 500,
      margin: 2
    });

    res.json({
      success: true,
      schoolName: school.schoolName,
      registrationUrl,
      qr: qrDataUrl
    });

  } catch (error) {
    console.error('QR ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Impossible de générer le QR code.'
    });
  }
});

app.post('/api/student-registration/submit', (req, res) => {
  try {
    const {
      schoolCode,
      fullName,
      fatherName,
      fatherPhone,
      motherName,
      motherPhone,
      className
    } = req.body;

    if (!schoolCode || !fullName || !fatherName || !fatherPhone ||
        !motherName || !motherPhone || !className) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs sont obligatoires.'
      });
    }

    const schools = readSchools();
    const school = schools.find(s => s.registrationCode === String(schoolCode));

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Code établissement invalide.'
      });
    }

    const schoolDir = path.join(DATA_DIR, 'schools', school.id);
    const studentsFile = path.join(schoolDir, 'students.json');

    if (!fs.existsSync(schoolDir)) {
      fs.mkdirSync(schoolDir, { recursive: true });
    }

    let students = [];

    if (fs.existsSync(studentsFile)) {
      try {
        students = JSON.parse(fs.readFileSync(studentsFile, 'utf8'));
      } catch {
        students = [];
      }
    }

    const student = {
      id: crypto.randomUUID(),
      fullName: String(fullName).trim(),
      fatherName: String(fatherName).trim(),
      fatherPhone: String(fatherPhone).trim(),
      motherName: String(motherName).trim(),
      motherPhone: String(motherPhone).trim(),
      className: String(className).trim(),
      schoolId: school.id,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    students.push(student);

    fs.writeFileSync(
      studentsFile,
      JSON.stringify(students, null, 2)
    );

    res.json({
      success: true,
      message: 'Inscription envoyée avec succès.',
      student: {
        id: student.id,
        fullName: student.fullName,
        className: student.className
      }
    });

  } catch (error) {
    console.error('STUDENT REGISTRATION ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Impossible d’enregistrer l’élève.'
    });
  }
});


const { createSchool, normalizeEmail } = require('./school-auth');


function hashAccountPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

function verifyAccountPassword(password, passwordHash, passwordSalt) {
  if (!passwordHash || !passwordSalt) return false;

  const hash = crypto.scryptSync(
    String(password),
    String(passwordSalt),
    64
  ).toString('hex');

  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(String(passwordHash), 'hex')
  );
}


app.post('/api/account/register', (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const schoolName = String(req.body.schoolName || '').trim();
    const password = String(req.body.password || '');
    const passwordConfirm = String(req.body.passwordConfirm || '');

    if (!email || !schoolName || !password || !passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs sont obligatoires.'
      });
    }

    if (!email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Adresse email invalide.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins 8 caractères.'
      });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Les deux mots de passe ne correspondent pas.'
      });
    }

    if (findSchool(email)) {
      return res.status(409).json({
        success: false,
        message: 'Cette adresse email est déjà enregistrée.'
      });
    }

    const school = createSchool(email, schoolName);
    const passwordData = hashAccountPassword(password);

    school.passwordHash = passwordData.hash;
    school.passwordSalt = passwordData.salt;

    const schools = readSchools();
    const index = schools.findIndex(item => item.id === school.id);

    if (index === -1) {
      throw new Error('Impossible d’enregistrer le mot de passe.');
    }

    schools[index] = school;
    fs.writeFileSync(
      path.join(DATA_DIR, 'schools.json'),
      JSON.stringify(schools, null, 2)
    );

    if (typeof saveActiveSchool === 'function') {
      saveActiveSchool(school.id);
    }

    res.json({
      success: true,
      message: 'Établissement créé avec succès.',
      school
    });
  } catch (error) {
    console.error('REGISTER ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la création.'
    });
  }
});

app.post('/api/account/login', (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const school = findSchool(email);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Aucun établissement trouvé avec cette adresse email.'
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Mot de passe obligatoire.'
      });
    }

    if (!school.passwordHash || !school.passwordSalt) {
      return res.status(403).json({
        success: false,
        message: 'Ce compte doit d’abord définir un mot de passe.'
      });
    }

    if (!verifyAccountPassword(password, school.passwordHash, school.passwordSalt)) {
      return res.status(401).json({
        success: false,
        message: 'Adresse email ou mot de passe incorrect.'
      });
    }

    if (typeof saveActiveSchool === 'function') {
      saveActiveSchool(school.id);
    }

    const authToken = createSchoolFlowSession(school.id);
    setSchoolFlowSessionCookie(res, authToken);

    res.json({
      success: true,
      message: 'Connexion réussie.',
      school
    });
  } catch (error) {
    console.error('LOGIN ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur de connexion.'
    });
  }
});


/* SCHOOL_FLOW_AUTH_ACCOUNT_ROUTES */

app.get('/api/account/session', (req, res) => {
  const session = getSchoolFlowSession(req);

  if (!session) {
    return res.json({
      success: true,
      authenticated: false
    });
  }

  const school = findSchool(session.schoolId);

  if (!school) {
    schoolFlowWebSessions.delete(session.token);
    clearSchoolFlowSessionCookie(res);

    return res.json({
      success: true,
      authenticated: false
    });
  }

  return res.json({
    success: true,
    authenticated: true,
    school
  });
});

app.post('/api/account/logout', (req, res) => {
  const session = getSchoolFlowSession(req);

  if (session) {
    schoolFlowWebSessions.delete(session.token);
  }

  clearSchoolFlowSessionCookie(res);

  return res.json({
    success: true,
    message: 'Déconnexion réussie.'
  });
});

app.post('/api/account/select', requireSchoolFlowAuth, (req, res) => {
  try {
    const authenticatedSchoolId = getRequestSchoolId();

    if (!authenticatedSchoolId) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'Session SCHOOL FLOW requise.'
      });
    }

    const requestedEmail =
      String(
        req.body?.email ||
        req.body?.schoolEmail ||
        ''
      )
        .trim()
        .toLowerCase();

    if (requestedEmail) {
      const schoolsForAuthCheck = readSchools();

      const requestedSchool = schoolsForAuthCheck.find(
        school =>
          String(
            school.email ||
            school.contactEmail ||
            ''
          )
            .trim()
            .toLowerCase() === requestedEmail
      );

      if (
        requestedSchool &&
        String(requestedSchool.id) !== String(authenticatedSchoolId)
      ) {
        return res.status(403).json({
          success: false,
          code: 'SCHOOL_SWITCH_FORBIDDEN',
          message:
            'Cette session est déjà liée à un autre établissement.'
        });
      }
    }
    const email = normalizeEmail(req.body.email);
    const school = findSchool(email);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    if (typeof saveActiveSchool === 'function') {
      saveActiveSchool(school.id);
    }

    res.json({
      success: true,
      school
    });
  } catch (error) {
    console.error('SELECT SCHOOL ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Impossible de sélectionner l’établissement.'
    });
  }
});



const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({
    schoolName: ''
  }, null, 2));
}

function readConfig() {
  try {
    const sessionFile = path.join(DATA_DIR, 'session.json');

    if (fs.existsSync(sessionFile)) {
      const session = JSON.parse(
        fs.readFileSync(sessionFile, 'utf8')
      );

      if (session.schoolId) {
        const schools = readSchools();

        const activeSchool = schools.find(
          school => school.id === session.schoolId
        );

        if (activeSchool) {
          const schoolConfigFile = path.join(
            DATA_DIR,
            'schools',
            activeSchool.id,
            'config.json'
          );

          if (fs.existsSync(schoolConfigFile)) {
            const config = JSON.parse(
              fs.readFileSync(schoolConfigFile, 'utf8')
            );

            return {
              ...config,
              schoolName: activeSchool.schoolName || config.schoolName || ''
            };
          }

          return {
            schoolName: activeSchool.schoolName || '',
            address: '',
            description: '',
            educationalStyle: '',
            logo: ''
          };
        }
      }
    }

    return {
      schoolName: ''
    };
  } catch (error) {
    console.error('READ CONFIG ERROR:', error);
    return {
      schoolName: ''
    };
  }
}

function saveConfig(config) {
  const sessionFile = path.join(DATA_DIR, 'session.json');

  if (!fs.existsSync(sessionFile)) {
    throw new Error('Aucun établissement actif.');
  }

  const session = JSON.parse(
    fs.readFileSync(sessionFile, 'utf8')
  );

  if (!session.schoolId) {
    throw new Error('Aucun établissement actif.');
  }

  const schools = readSchools();

  const activeSchool = schools.find(
    school => school.id === session.schoolId
  );

  if (!activeSchool) {
    throw new Error('Établissement actif introuvable.');
  }

  const schoolDir = path.join(
    DATA_DIR,
    'schools',
    activeSchool.id
  );

  fs.mkdirSync(schoolDir, { recursive: true });

  const schoolConfigFile = path.join(
    schoolDir,
    'config.json'
  );

  const existingConfig = fs.existsSync(schoolConfigFile)
    ? JSON.parse(fs.readFileSync(schoolConfigFile, 'utf8'))
    : {};

  const finalConfig = {
    ...existingConfig,
    ...config,
    schoolName: activeSchool.schoolName || config.schoolName || ''
  };

  fs.writeFileSync(
    schoolConfigFile,
    JSON.stringify(finalConfig, null, 2)
  );
}


// ============================================================
// SCHOOL FLOW — SESSION ÉTABLISSEMENT
// Sélectionne l'établissement actif sans toucher aux données
// des autres établissements.
// ============================================================
function saveActiveSchool(schoolId) {
  const id = String(schoolId || '').trim();

  if (!id) {
    throw new Error('Identifiant établissement invalide.');
  }

  const schools = readSchools();

  const school = schools.find(
    item => String(item.id) === id
  );

  if (!school) {
    throw new Error('Établissement introuvable.');
  }

  const sessionFile = path.join(DATA_DIR, 'session.json');

  fs.writeFileSync(
    sessionFile,
    JSON.stringify({
      schoolId: school.id
    }, null, 2)
  );

  console.log(
    '🏫 SCHOOL FLOW — ÉTABLISSEMENT ACTIF :',
    school.schoolName,
    school.id
  );

  return school;
}


// Retourne l'établissement actuellement connecté.
function getActiveSchool() {
  /* SCHOOL_FLOW_AUTH_CONTEXT_getActiveSchool */

  const requestSchoolId = getRequestSchoolId();

  if (requestSchoolId) {
    const schools = readSchools();

    return schools.find(
      school => String(school.id) === String(requestSchoolId)
    ) || null;
  }

  try {
    const sessionFile = path.join(DATA_DIR, 'session.json');

    if (!fs.existsSync(sessionFile)) {
      return null;
    }

    const session = JSON.parse(
      fs.readFileSync(sessionFile, 'utf8')
    );

    if (!session || !session.schoolId) {
      return null;
    }

    const schools = readSchools();

    return schools.find(
      school => String(school.id) === String(session.schoolId)
    ) || null;

  } catch (error) {
    console.error('getActiveSchool ERROR:', error);
    return null;
  }
}


// ============================================================
// ============================================================
// SCHOOL_FLOW_GROUPS_ENGINE_V2
// GROUPES & COMMUNICATION SCHOOL FLOW
// ============================================================

const GROUP_TYPES = {
  establishment: "Groupe officiel de l'établissement",
  parents: "Groupe Parents",
  teachers: "Groupe Professeurs",
  parents_teachers: "Groupe Parents-Professeurs",
  channel: "Canal d'information"
};

function getSchoolGroups(school) {
  if (!school.communicationGroups ||
      typeof school.communicationGroups !== 'object') {
    school.communicationGroups = {};
  }

  return school.communicationGroups;
}

function cleanGroupLink(value) {
  if (value === undefined || value === null) return '';

  const link = String(value).trim();

  if (!link) return '';

  if (
    !link.startsWith('https://') &&
    !link.startsWith('http://')
  ) {
    return '';
  }

  return link;
}

function getGroupByType(school, type) {
  const groups = getSchoolGroups(school);
  const group = groups[type];

  if (!group || group.enabled !== true) return null;

  const link = cleanGroupLink(group.link);

  if (!link) return null;

  return {
    type,
    label: GROUP_TYPES[type],
    link
  };
}

function saveActiveSchoolData(updatedSchool) {
  const schools = readSchools();

  const index = schools.findIndex(
    school => String(school.id) === String(updatedSchool.id)
  );

  if (index === -1) {
    return false;
  }

  schools[index] = updatedSchool;

  fs.writeFileSync(
    path.join(__dirname, 'data', 'schools.json'),
    JSON.stringify(schools, null, 2)
  );

  return true;
}

app.get('/api/school/groups', (req, res) => {
  try {
    const school = getActiveSchool();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: "Aucun établissement actif."
      });
    }

    const groups = getSchoolGroups(school);
    const result = {};

    for (const type of Object.keys(GROUP_TYPES)) {
      result[type] = {
        label: GROUP_TYPES[type],
        enabled: groups[type]?.enabled === true,
        link: cleanGroupLink(groups[type]?.link)
      };
    }

    res.json({
      success: true,
      schoolName: school.schoolName || '',
      groups: result
    });

  } catch (error) {
    console.error('GET /api/school/groups ERROR:', error);

    res.status(500).json({
      success: false,
      message: "Impossible de récupérer les groupes."
    });
  }
});

app.post('/api/school/groups', (req, res) => {
  try {
    const school = getActiveSchool();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: "Aucun établissement actif."
      });
    }

    const input = req.body || {};
    const groups = getSchoolGroups(school);

    for (const type of Object.keys(GROUP_TYPES)) {
      const item = input[type];

      if (!item || typeof item !== 'object') {
        continue;
      }

      groups[type] = {
        enabled: item.enabled === true,
        link: cleanGroupLink(item.link)
      };
    }

    school.communicationGroups = groups;

    const saved = saveActiveSchoolData(school);

    if (!saved) {
      return res.status(500).json({
        success: false,
        message: "Impossible d'enregistrer les groupes."
      });
    }

    res.json({
      success: true,
      message: "Groupes enregistrés avec succès.",
      groups
    });

  } catch (error) {
    console.error('POST /api/school/groups ERROR:', error);

    res.status(500).json({
      success: false,
      message: "Impossible d'enregistrer les groupes."
    });
  }
});

app.post('/api/school/groups/find', (req, res) => {
  try {
    const school = getActiveSchool();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: "Aucun établissement actif."
      });
    }

    const query = String(req.body?.query || '').trim().toLowerCase();

    if (!query) {
      return res.json({
        success: true,
        found: false,
        message: "Précisez le groupe recherché."
      });
    }

    let type = null;

    if (
      query.includes('parent') &&
      (
        query.includes('prof') ||
        query.includes('enseign')
      )
    ) {
      type = 'parents_teachers';

    } else if (query.includes('parent')) {
      type = 'parents';

    } else if (
      query.includes('prof') ||
      query.includes('enseign')
    ) {
      type = 'teachers';

    } else if (
      query.includes('canal') ||
      query.includes('chaine') ||
      query.includes('chaîne')
    ) {
      type = 'channel';

    } else if (
      query.includes('ecole') ||
      query.includes('école') ||
      query.includes('etablissement') ||
      query.includes('établissement') ||
      query.includes('officiel')
    ) {
      type = 'establishment';
    }

    if (!type) {
      return res.json({
        success: true,
        found: false,
        message: "Je n'ai pas identifié le groupe demandé."
      });
    }

    const group = getGroupByType(school, type);

    if (!group) {
      return res.json({
        success: true,
        found: false,
        type,
        label: GROUP_TYPES[type],
        message: "Le lien de ce groupe n'est pas encore configuré."
      });
    }

    res.json({
      success: true,
      found: true,
      group
    });

  } catch (error) {
    console.error('POST /api/school/groups/find ERROR:', error);

    res.status(500).json({
      success: false,
      message: "Impossible de rechercher le groupe."
    });
  }
});

app.get('/api/school', (req, res) => {
  try {
    const school = getActiveSchool();

    if (!school) {
      return res.json({
        success: true,
        schoolName: ''
      });
    }

    res.json({
      success: true,
      schoolName: String(school.schoolName || '').trim(),
      schoolId: school.id || ''
    });
  } catch (error) {
    console.error('GET /api/school ERROR:', error);

    res.status(500).json({
      success: false,
      message: 'Impossible de récupérer l’établissement actif.'
    });
  }
});

app.post('/api/school', (req, res) => {
  const schoolName = String(req.body.schoolName || '').trim();

  if (!schoolName) {
    return res.status(400).json({
      success: false,
      message: "Le nom de l'école est obligatoire."
    });
  }

  try {
    const school = getActiveSchool();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Aucun établissement actif.'
      });
    }

    const schools = readSchools();
    const index = schools.findIndex(item => item.id === school.id);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    schools[index].schoolName = schoolName;

    fs.writeFileSync(
      path.join(DATA_DIR, 'schools.json'),
      JSON.stringify(schools, null, 2)
    );

    res.json({
      success: true,
      message: "Nom de l'école enregistré.",
      schoolName,
      schoolId: school.id
    });

  } catch (error) {
    console.error('POST /api/school ERROR:', error);

    res.status(500).json({
      success: false,
      message: "Impossible d'enregistrer le nom de l'établissement."
    });
  }
});

function readStudents() {
  try {
    const school = getActiveSchoolForStudents();

    if (school) {
      return readSchoolStudents(school);
    }

    return [];
  } catch (error) {
    console.error('READ STUDENTS ERROR:', error);
    return [];
  }
}

function saveStudents(students) {
  try {
    const school = getActiveSchoolForStudents();

    if (!school) {
      throw new Error('Aucun établissement actif.');
    }

    saveSchoolStudents(school, students);
  } catch (error) {
    console.error('SAVE STUDENTS ERROR:', error);
    throw error;
  }
}


/* SCHOOL FLOW — API MULTI-SESSIONS WHATSAPP */
function getMultiSessionSchoolId(req, res) {
  const schoolId = getRequestSchoolId();
  if (schoolId === undefined || schoolId === null || String(schoolId) === '') {
    res.status(403).json({
      success: false,
      message: 'Établissement non identifié.'
    });
    return null;
  }
  return String(schoolId);
}

app.get('/api/whatsapp/sessions', (req, res) => {
  const schoolId = getMultiSessionSchoolId(req, res);
  if (schoolId === null) return;

  try {
    res.json({
      success: true,
      sessions: multiSessionManager.listSessions(schoolId)
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/whatsapp/sessions', (req, res) => {
  const schoolId = getMultiSessionSchoolId(req, res);
  if (schoolId === null) return;

  try {
    const { sessionId, phone } = req.body || {};
    const session = multiSessionManager.createSession(
      schoolId,
      sessionId,
      phone
    );

    res.status(201).json({
      success: true,
      message: 'Session créée. Elle est indépendante des autres sessions.',
      session: {
        sessionId: session.sessionId,
        status: session.status,
        phone: session.phone || null
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});


app.post('/api/whatsapp/sessions/:sessionId/send', async (req, res) => {
  const schoolId = getMultiSessionSchoolId(req, res);
  if (schoolId === null) return;

  try {
    const { phone, message } = req.body || {};
    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: 'Numéro et message obligatoires.'
      });
    }

    const result = await multiSessionManager.sendSessionMessage(
      schoolId, req.params.sessionId, phone, message
    );
    res.json({ success: true, result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/api/whatsapp/sessions/:sessionId/status', (req, res) => {
  const schoolId = getMultiSessionSchoolId(req, res);
  if (schoolId === null) return;

  try {
    const session = multiSessionManager.getSessionStatus(
      schoolId,
      req.params.sessionId
    );

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session introuvable pour cet établissement.'
      });
    }

    res.json({ success: true, session });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/whatsapp/sessions/:sessionId/connect', async (req, res) => {
  const schoolId = getMultiSessionSchoolId(req, res);
  if (schoolId === null) return;

  try {
    const session = await multiSessionManager.connectSession(
      schoolId,
      req.params.sessionId
    );
    res.json({
      success: true,
      message: 'Démarrage de la session demandé.',
      session
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/whatsapp/sessions/:sessionId/pairing-code', async (req, res) => {
  const schoolId = getMultiSessionSchoolId(req, res);
  if (schoolId === null) return;

  try {
    const result = await multiSessionManager.requestPairingCode(
      schoolId,
      req.params.sessionId,
      req.body && req.body.phone
    );

    res.json({
      success: true,
      message: 'Code d’appairage généré.',
      session: result
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/whatsapp/sessions/:sessionId/disconnect', async (req, res) => {
  const schoolId = getMultiSessionSchoolId(req, res);
  if (schoolId === null) return;

  try {
    const session = await multiSessionManager.disconnectSession(
      schoolId,
      req.params.sessionId
    );

    res.json({
      success: true,
      message: 'Session mise en pause ; les identifiants sont conservés.',
      session
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
app.delete('/api/whatsapp/sessions/:sessionId', async (req, res) => {
  const schoolId = getMultiSessionSchoolId(req, res);
  if (schoolId === null) return;

  try {
    const session = await multiSessionManager.deleteSession(
      schoolId,
      req.params.sessionId
    );

    res.json({
      success: true,
      message: 'Session supprimée.',
      session
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/* FIN API MULTI-SESSIONS WHATSAPP */


app.post('/api/whatsapp/connect', async (req, res) => {
  try {
    await startWhatsApp();

    res.json({
      success: true,
      message: 'Connexion WhatsApp démarrée.',
      ...getWhatsAppStatus()
    });
  } catch (error) {
    console.error('Erreur connexion WhatsApp :', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    success: true,
    ...getWhatsAppStatus()
  });
});

app.post('/api/whatsapp/pairing-code', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Numéro de téléphone requis.'
      });
    }

    const code = await requestPairingCode(phone);

    res.json({
      success: true,
      message: 'Code d’appairage généré.',
      pairingCode: code,
      ...getWhatsAppStatus()
    });

  } catch (error) {
    console.error('Erreur code d’appairage WhatsApp :', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    await disconnectWhatsApp();

    res.json({
      success: true,
      message: 'WhatsApp déconnecté.',
      ...getWhatsAppStatus()
    });

  } catch (error) {
    console.error('Erreur déconnexion WhatsApp :', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.delete('/api/whatsapp/connection', async (req, res) => {
  try {
    await deleteWhatsAppConnection();

    res.json({
      success: true,
      message: 'Connexion WhatsApp supprimée.',
      ...getWhatsAppStatus()
    });

  } catch (error) {
    console.error('Erreur suppression connexion WhatsApp :', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/whatsapp/new-number', async (req, res) => {
  try {
    await connectNewWhatsApp();

    res.json({
      success: true,
      message: 'Nouvelle connexion WhatsApp prête.',
      ...getWhatsAppStatus()
    });

  } catch (error) {
    console.error('Erreur nouvelle connexion WhatsApp :', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/api/whatsapp/qr', (req, res) => {
  const data = getWhatsAppStatus();

  if (!data.qr) {
    return res.json({
      success: false,
      message: 'QR code non disponible.',
      status: data.status
    });
  }

  res.json({
    success: true,
    qr: data.qr,
    status: data.status
  });
});

app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: 'Numéro et message obligatoires.'
      });
    }

    await sendMessage(phone, message);

    res.json({
      success: true,
      message: 'Message WhatsApp envoyé.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});



// ============================================================
// SCHOOL FLOW — MODULE PAIEMENTS
// Isolation stricte par établissement
// ============================================================

function getActiveSchoolForPayments() {
  /* SCHOOL_FLOW_AUTH_CONTEXT_getActiveSchoolForPayments */

  const requestSchoolId = getRequestSchoolId();

  if (requestSchoolId) {
    const schools = readSchools();

    return schools.find(
      school => String(school.id) === String(requestSchoolId)
    ) || null;
  }

  try {
    const sessionFile = path.join(DATA_DIR, 'session.json');

    if (!fs.existsSync(sessionFile)) return null;

    const session = JSON.parse(
      fs.readFileSync(sessionFile, 'utf8')
    );

    if (!session || !session.schoolId) return null;

    const schools = readSchools();

    return schools.find(
      school => String(school.id) === String(session.schoolId)
    ) || null;

  } catch (error) {
    console.error('getActiveSchoolForPayments ERROR:', error);
    return null;
  }
}

function getPaymentFiles(school) {
  const schoolDir = path.join(
    DATA_DIR,
    'schools',
    school.id
  );

  if (!fs.existsSync(schoolDir)) {
    fs.mkdirSync(schoolDir, { recursive: true });
  }

  const settingsFile = path.join(
    schoolDir,
    'payment-settings.json'
  );

  const paymentsFile = path.join(
    schoolDir,
    'payments.json'
  );

  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({
        classFees: {}
      }, null, 2)
    );
  }

  if (!fs.existsSync(paymentsFile)) {
    fs.writeFileSync(
      paymentsFile,
      '[]'
    );
  }

  return {
    settingsFile,
    paymentsFile
  };
}

function readPaymentSettings(school) {
  const { settingsFile } = getPaymentFiles(school);

  try {
    const data = JSON.parse(
      fs.readFileSync(settingsFile, 'utf8')
    );

    return data && typeof data === 'object'
      ? data
      : { classFees: {} };

  } catch (error) {
    console.error('READ PAYMENT SETTINGS ERROR:', error);
    return { classFees: {} };
  }
}

function readPayments(school) {
  const { paymentsFile } = getPaymentFiles(school);

  try {
    const data = JSON.parse(
      fs.readFileSync(paymentsFile, 'utf8')
    );

    return Array.isArray(data) ? data : [];

  } catch (error) {
    console.error('READ PAYMENTS ERROR:', error);
    return [];
  }
}

function savePayments(school, payments) {
  const { paymentsFile } = getPaymentFiles(school);

  fs.writeFileSync(
    paymentsFile,
    JSON.stringify(payments, null, 2)
  );
}

function savePaymentSettings(school, settings) {
  const { settingsFile } = getPaymentFiles(school);

  fs.writeFileSync(
    settingsFile,
    JSON.stringify(settings, null, 2)
  );
}

function moneyNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return 0;

  return Math.round(number * 100) / 100;
}

function paymentStudentSummary(
  student,
  feeAmount,
  payments
) {
  const studentPayments = payments.filter(
    payment =>
      String(payment.studentId) === String(student.id)
  );

  const totalPaid = moneyNumber(
    studentPayments.reduce(
      (total, payment) =>
        total + Number(payment.amount || 0),
      0
    )
  );

  const remaining = Math.max(
    0,
    moneyNumber(feeAmount) - totalPaid
  );

  let status = 'non-paye';

  if (remaining <= 0 && feeAmount > 0) {
    status = 'paye';
  } else if (totalPaid > 0) {
    status = 'partiel';
  }

  return {
    studentId: student.id,
    studentName: student.fullName || student.name || '',
    className: student.className || '',
    feeAmount: moneyNumber(feeAmount),
    totalPaid,
    remaining,
    status,
    paymentCount: studentPayments.length
  };
}

// ------------------------------------------------------------
// PARAMÈTRES DES FRAIS PAR CLASSE
// ------------------------------------------------------------

app.get('/api/payments/settings', requirePaymentWebAccess, (req, res) => {
  try {
    const school = getActiveSchoolForPayments();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const settings = readPaymentSettings(school);

    res.json({
      success: true,
      schoolId: school.id,
      schoolName: school.schoolName || '',
      classFees: settings.classFees || {}
    });

  } catch (error) {
    console.error('GET PAYMENT SETTINGS ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/payments/settings', requirePaymentWebAccess, (req, res) => {
  try {
    const school = getActiveSchoolForPayments();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const className = String(
      req.body.className || ''
    ).trim();

    const amount = moneyNumber(
      req.body.amount
    );

    // Montant reçu et monnaie à rendre
    const cashReceived = moneyNumber(
      req.body.cashReceived ??
      req.body.amountReceived ??
      amount
    );

    if (cashReceived < amount) {
      return res.status(400).json({
        success: false,
        message: 'Le montant reçu est inférieur au montant du paiement.'
      });
    }

    const change = moneyNumber(
      cashReceived - amount
    );

    const currency = String(
      req.body.currency || 'USD'
    ).trim().toUpperCase();

    if (!className) {
      return res.status(400).json({
        success: false,
        message: 'Classe obligatoire.'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Le montant des frais doit être supérieur à zéro.'
      });
    }

    const settings = readPaymentSettings(school);

    if (!settings.classFees) {
      settings.classFees = {};
    }

    settings.classFees[className] = {
      amount,
      currency,
      updatedAt: new Date().toISOString()
    };

    savePaymentSettings(school, settings);

    res.json({
      success: true,
      message: 'Frais de la classe enregistrés.',
      className,
      amount,
      currency
    });

  } catch (error) {
    console.error('SAVE PAYMENT SETTINGS ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ------------------------------------------------------------
// VUE DES PAIEMENTS D'UNE CLASSE
// ------------------------------------------------------------

app.get('/api/payments/overview', requirePaymentWebAccess, (req, res) => {
  try {
    const school = getActiveSchoolForPayments();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const className = String(
      req.query.className || ''
    ).trim();

    if (!className) {
      return res.status(400).json({
        success: false,
        message: 'Classe obligatoire.'
      });
    }

    const studentsFile = path.join(
      DATA_DIR,
      'schools',
      school.id,
      'students.json'
    );

    const students = fs.existsSync(studentsFile)
      ? JSON.parse(
          fs.readFileSync(studentsFile, 'utf8')
        )
      : [];

    const settings = readPaymentSettings(school);
    const payments = readPayments(school);

    const feeConfig =
      settings.classFees?.[className];

    const feeAmount = moneyNumber(
      feeConfig?.amount || 0
    );

    const currency =
      feeConfig?.currency || 'USD';

    const classStudents = students
      .filter(
        student =>
          String(student.className || '').trim() === className
      )
      .map(
        student =>
          paymentStudentSummary(
            student,
            feeAmount,
            payments
          )
      );

    res.json({
      success: true,
      schoolId: school.id,
      schoolName: school.schoolName || '',
      className,
      feeAmount,
      currency,
      configured: feeAmount > 0,
      students: classStudents
    });

  } catch (error) {
    console.error('GET PAYMENT OVERVIEW ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ------------------------------------------------------------
// HISTORIQUE D'UN ÉLÈVE
// ------------------------------------------------------------

app.get('/api/payments/student/:studentId', requirePaymentWebAccess, (req, res) => {
  try {
    const school = getActiveSchoolForPayments();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const studentsFile = path.join(
      DATA_DIR,
      'schools',
      school.id,
      'students.json'
    );

    const students = fs.existsSync(studentsFile)
      ? JSON.parse(
          fs.readFileSync(studentsFile, 'utf8')
        )
      : [];

    const student = students.find(
      item =>
        String(item.id) === String(req.params.studentId)
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Élève introuvable.'
      });
    }

    const settings = readPaymentSettings(school);
    const payments = readPayments(school);

    const className =
      String(student.className || '').trim();

    const feeConfig =
      settings.classFees?.[className];

    const feeAmount = moneyNumber(
      feeConfig?.amount || 0
    );

    const currency =
      feeConfig?.currency || 'USD';

    const summary =
      paymentStudentSummary(
        student,
        feeAmount,
        payments
      );

    const history = payments
      .filter(
        payment =>
          String(payment.studentId) ===
          String(student.id)
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt) -
          new Date(a.createdAt)
      );

    res.json({
      success: true,
      student: {
        id: student.id,
        name: student.fullName || student.name || '',
        className
      },
      feeAmount,
      currency,
      summary,
      history
    });

  } catch (error) {
    console.error('GET PAYMENT STUDENT ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ------------------------------------------------------------
// ENREGISTRER UN PAIEMENT
// ------------------------------------------------------------

app.post('/api/payments', requirePaymentWebAccess, async (req, res) => {
  try {
    const school = getActiveSchoolForPayments();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const studentId = String(
      req.body.studentId || ''
    ).trim();

    const amount = moneyNumber(
      req.body.amount
    );

    const cashReceived =
      req.body.cashReceived === undefined ||
      req.body.cashReceived === null ||
      req.body.cashReceived === ''
        ? amount
        : moneyNumber(req.body.cashReceived);

    const change = moneyNumber(
      Math.max(0, cashReceived - amount)
    );

    if (cashReceived < amount) {
      return res.status(400).json({
        success: false,
        message: 'L’argent remis est inférieur au montant du paiement.'
      });
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Élève obligatoire.'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Le montant du paiement doit être supérieur à zéro.'
      });
    }

    const studentsFile = path.join(
      DATA_DIR,
      'schools',
      school.id,
      'students.json'
    );

    const students = fs.existsSync(studentsFile)
      ? JSON.parse(
          fs.readFileSync(studentsFile, 'utf8')
        )
      : [];

    const student = students.find(
      item =>
        String(item.id) === studentId
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Élève introuvable dans cet établissement.'
      });
    }

    const className =
      String(student.className || '').trim();

    const settings = readPaymentSettings(school);
    const payments = readPayments(school);

    const feeConfig =
      settings.classFees?.[className];

    const feeAmount = moneyNumber(
      feeConfig?.amount || 0
    );

    const currency =
      feeConfig?.currency || 'USD';

    if (feeAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Les frais de cette classe ne sont pas encore configurés.'
      });
    }

    const previousPaid = moneyNumber(
      payments
        .filter(
          payment =>
            String(payment.studentId) === studentId
        )
        .reduce(
          (total, payment) =>
            total + Number(payment.amount || 0),
          0
        )
    );

    const remainingBefore = Math.max(
      0,
      moneyNumber(feeAmount - previousPaid)
    );

    if (amount > remainingBefore) {
      return res.status(400).json({
        success: false,
        message:
          `Le paiement dépasse le solde restant de ${remainingBefore} ${currency}.`,
        remaining: remainingBefore
      });
    }

    const totalPaid = moneyNumber(
      previousPaid + amount
    );

    const remaining = Math.max(
      0,
      moneyNumber(feeAmount - totalPaid)
    );

    const payment = {
      id: `PAY-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`,
      schoolId: school.id,
      studentId: student.id,
      studentName:
        student.fullName ||
        student.name ||
        '',
      className,
      feeAmount,
      amount,
      cashReceived,
      change,
      paidBefore: previousPaid,
      paidAfter: totalPaid,
      remaining,
      currency,
      createdAt: new Date().toISOString()
    };

    payments.push(payment);

    savePayments(
      school,
      payments
    );

    // --------------------------------------------------------
    // NOTIFICATION WHATSAPP
    // --------------------------------------------------------

    const message = `*SCHOOL FLOW — CONFIRMATION DE PAIEMENT*

Madame, Monsieur,

Nous vous confirmons la réception du paiement de *${amount} ${currency}* pour l’élève *${payment.studentName}*, en classe de *${className}*.

• Total payé : ${totalPaid} ${currency}
• Solde restant : ${remaining} ${currency}
• Statut : ${remaining <= 0 ? "Frais soldés" : "Paiement partiel"}

Nous vous remercions pour votre confiance et votre collaboration.

*School Flow — Développé par NEXORA TECHNOLOGIES*`;
    let whatsapp = {
      attempted: false,
      success: false,
      message: 'Notification WhatsApp non envoyée.'
    };

    try {
      const whatsappStatus =
        getWhatsAppStatus();

      if (whatsappStatus.connected) {

        const parents = [
          student.parents?.father?.phone,
          student.parents?.mother?.phone,
          student.fatherPhone,
          student.motherPhone
        ]
          .filter(Boolean)
          .map(
            phone =>
              String(phone).replace(/\D/g, '')
          )
          .filter(Boolean)
          .filter(
            (phone, index, array) =>
              array.indexOf(phone) === index
          );

        if (parents.length) {

          whatsapp.attempted = true;

          const results = [];

          for (const phone of parents) {
            try {
              await sendMessage(
                phone,
                message
              );

              results.push({
                phone,
                success: true
              });

            } catch (error) {
              results.push({
                phone,
                success: false,
                error:
                  error?.message ||
                  'Erreur WhatsApp.'
              });
            }
          }

          const sent =
            results.filter(
              result => result.success
            ).length;

          whatsapp.success = sent > 0;
          whatsapp.sent = sent;
          whatsapp.totalParents =
            parents.length;
          whatsapp.results = results;

          whatsapp.message =
            sent === parents.length
              ? 'Notification envoyée aux parents.'
              : sent > 0
                ? 'Notification envoyée à un des parents.'
                : 'Notification WhatsApp non envoyée.';
        }

      } else {
        whatsapp.message =
          'Paiement enregistré, mais WhatsApp n’est pas connecté.';
      }

    } catch (whatsappError) {

      console.error(
        '[SCHOOL FLOW] PAYMENT WHATSAPP ERROR:',
        whatsappError
      );

      whatsapp.message =
        'Paiement enregistré, mais la notification WhatsApp a échoué.';
    }

    res.json({
      success: true,
      message: 'Paiement enregistré avec succès.',
      payment,
      whatsapp
    });

  } catch (error) {

    console.error(
      'CREATE PAYMENT ERROR:',
      error
    );

    res.status(500).json({
      success: false,
      message: error?.message ||
        'Erreur serveur lors de l’enregistrement du paiement.'
    });
  }
});

// ============================================================
// FIN MODULE PAIEMENTS
// ============================================================


app.post('/api/whatsapp/send-communication', async (req, res) => {
  try {

    const studentIds = Array.isArray(req.body?.studentIds)
      ? [...new Set(req.body.studentIds.map(String))]
      : [];

    const message = String(req.body?.message || '').trim();

    if(!studentIds.length || !message){
      return res.status(400).json({
        success: false,
        message: 'Sélectionnez des élèves et saisissez un message.'
      });
    }

    const requestSchoolId = getRequestSchoolId();

    if(!requestSchoolId){
      return res.status(401).json({
        success: false,
        message: 'Session SCHOOL FLOW introuvable.'
      });
    }

    const schools = readSchools();

    const school = schools.find(
      s => String(s.id) === String(requestSchoolId)
    );

    if(!school){
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const studentsFile = path.join(
      DATA_DIR,
      'schools',
      school.id,
      'students.json'
    );

    if(!fs.existsSync(studentsFile)){
      return res.status(404).json({
        success: false,
        message: 'Fichier élèves introuvable.'
      });
    }

    const allStudents = JSON.parse(
      fs.readFileSync(studentsFile, 'utf8')
    );

    if(!Array.isArray(allStudents)){
      return res.status(500).json({
        success: false,
        message: 'Données des élèves invalides.'
      });
    }

    const selectedIds = new Set(studentIds);

    const selectedStudents = allStudents.filter(
      student => selectedIds.has(String(student.id))
    );

    if(selectedStudents.length !== studentIds.length){
      return res.status(400).json({
        success: false,
        message: 'Certains élèves sélectionnés sont introuvables dans cet établissement.'
      });
    }

    const parents = [...new Set(
      selectedStudents.flatMap(student => [
        student.parents?.father?.phone,
        student.parents?.mother?.phone,
        student.fatherPhone,
        student.motherPhone
      ])
      .filter(Boolean)
      .map(phone => String(phone).replace(/\D/g, ''))
      .filter(Boolean)
    )];

    if(!parents.length){
      return res.status(400).json({
        success: false,
        message: 'Aucun numéro de parent enregistré pour cette sélection.',
        sent: 0,
        totalParents: 0
      });
    }

    const whatsappStatus = getWhatsAppStatus();

    if(!whatsappStatus.connected){
      return res.status(503).json({
        success: false,
        message: 'WhatsApp n’est pas connecté.',
        sent: 0,
        totalParents: parents.length
      });
    }

    const results = [];

    for(const phone of parents){

      try{

        console.log(
          '[SCHOOL FLOW] Communication collective vers:',
          phone
        );

        await sendMessage(phone, message);

        results.push({
          phone,
          success: true
        });

      }catch(error){

        console.error(
          '[SCHOOL FLOW] Échec communication:',
          phone,
          error?.message || error
        );

        results.push({
          phone,
          success: false,
          error: error?.message || 'Erreur WhatsApp inconnue.'
        });
      }
    }

    const sent = results.filter(r => r.success).length;
    const totalParents = results.length;

    return res.json({
      success: sent > 0,
      sent,
      totalParents,
      totalStudents: selectedStudents.length,
      results,
      message:
        sent === totalParents
          ? 'Communication envoyée à tous les parents concernés.'
          : sent > 0
            ? 'Communication envoyée à une partie des parents.'
            : 'Aucun message n’a pu être envoyé.'
    });

  }catch(error){

    console.error(
      '[SCHOOL FLOW] COMMUNICATION SEND ERROR:',
      error
    );

    return res.status(500).json({
      success: false,
      message: error?.message || 'Erreur serveur lors de la communication.'
    });
  }
});

app.post('/api/whatsapp/send-to-parents', async (req, res) => {
  try {
    const { studentId, message } = req.body;

    if (!studentId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Élève et message obligatoires.'
      });
    }

    const requestSchoolId = getRequestSchoolId();

    if (!requestSchoolId) {
      return res.status(401).json({
        success: false,
        message: 'Session SCHOOL FLOW introuvable.'
      });
    }

    const schools = readSchools();

    const school = schools.find(
      s => String(s.id) === String(requestSchoolId)
    );

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const studentsFile = path.join(
      DATA_DIR,
      'schools',
      school.id,
      'students.json'
    );

    if (!fs.existsSync(studentsFile)) {
      return res.status(404).json({
        success: false,
        message: 'Fichier élèves introuvable.'
      });
    }

    const students = JSON.parse(
      fs.readFileSync(studentsFile, 'utf8')
    );

    const student = students.find(
      s => String(s.id) === String(studentId)
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Élève introuvable.'
      });
    }

    const parents = [
      student.parents?.father?.phone,
      student.parents?.mother?.phone,
      student.fatherPhone,
      student.motherPhone
    ]
      .filter(Boolean)
      .map(phone =>
        String(phone).replace(/\D/g, '')
      )
      .filter(Boolean)
      .filter(
        (phone, index, array) =>
          array.indexOf(phone) === index
      );

    if (!parents.length) {
      return res.status(400).json({
        success: false,
        message: 'Aucun numéro de parent enregistré.'
      });
    }

    const whatsappStatus = getWhatsAppStatus();

    if (!whatsappStatus.connected) {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp n’est pas connecté.',
        sent: 0,
        totalParents: parents.length,
        results: parents.map(phone => ({
          phone,
          success: false,
          error: 'WhatsApp n’est pas connecté.'
        }))
      });
    }

    const results = [];

    for (const phone of parents) {
      try {
        console.log(
          '[SCHOOL FLOW] Envoi WhatsApp vers:',
          phone
        );

        await sendMessage(phone, String(message));

        console.log(
          '[SCHOOL FLOW] Message envoyé:',
          phone
        );

        results.push({
          phone,
          success: true
        });

      } catch (error) {
        console.error(
          '[SCHOOL FLOW] Échec:',
          phone,
          error?.message || error
        );

        results.push({
          phone,
          success: false,
          error:
            error?.message ||
            'Erreur WhatsApp inconnue.'
        });
      }
    }

    const sent = results.filter(
      r => r.success
    ).length;

    const totalParents = results.length;

    return res.json({
      success: sent > 0,
      sent,
      totalParents,
      results,
      message:
        sent === totalParents
          ? 'Message envoyé aux deux parents.'
          : sent > 0
            ? 'Message envoyé à un des parents.'
            : 'Aucun message n’a pu être envoyé.'
    });

  } catch (error) {
    console.error(
      '[SCHOOL FLOW] SEND ERROR:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        'Erreur serveur lors de l’envoi.'
    });
  }
});

app.post('/api/students/late', async (req, res) => {
  try {
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Élève obligatoire.'
      });
    }

    const requestSchoolId = getRequestSchoolId();

    if (!requestSchoolId) {
      return res.status(401).json({
        success: false,
        message: 'Session SCHOOL FLOW introuvable.'
      });
    }

    const schools = readSchools();

    const school = schools.find(
      s => String(s.id) === String(requestSchoolId)
    );

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const studentsFile = path.join(
      DATA_DIR,
      'schools',
      school.id,
      'students.json'
    );

    if (!fs.existsSync(studentsFile)) {
      return res.status(404).json({
        success: false,
        message: 'Fichier élèves introuvable.'
      });
    }

    const students = JSON.parse(
      fs.readFileSync(studentsFile, 'utf8')
    );

    const student = students.find(
      s => String(s.id) === String(studentId)
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Élève introuvable.'
      });
    }

    const now = new Date();

    const date = now.toLocaleDateString('fr-FR', {
      timeZone: 'Africa/Kinshasa'
    });

    const time = now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Kinshasa'
    });

    const event = {
      id: crypto.randomUUID(),
      type: 'retard',
      date,
      time,
      reason: 'Arrivée tardive',
      recordedBy: 'Direction',
      createdAt: now.toISOString()
    };

    if (!Array.isArray(student.history)) {
      student.history = [];
    }

    student.history.push(event);

    fs.writeFileSync(
      studentsFile,
      JSON.stringify(students, null, 2),
      'utf8'
    );

    const studentName = String(
      student.name ||
      student.fullName ||
      'Votre enfant'
    ).trim();

    const className = String(
      student.className ||
      'Classe non précisée'
    ).trim();

    const schoolName = String(
      school.schoolName ||
      school.name ||
      'Notre établissement'
    ).trim();

    const parents = [
      student?.parents?.father?.phone,
      student?.parents?.mother?.phone,
      student?.fatherPhone,
      student?.motherPhone
    ]
      .map(phone => String(phone || '').replace(/\D/g, ''))
      .filter(Boolean)
      .filter(
        (phone, index, array) =>
          array.indexOf(phone) === index
      );

    const message = [
      '┌──────────────────────────────┐',
      '│ ' + schoolName,
      '│ NOTIFICATION SCOLAIRE',
      '└──────────────────────────────┘',
      '',
      '*Objet : Arrivée tardive*',
      '',
      'Chers parents,',
      '',
      'Nous vous informons que *' +
        studentName +
        '*, élève de la classe *' +
        className +
        '*, a été enregistré(e) en retard ce jour à *' +
        time +
        '*.',
      '',
      'Cette notification vous est communiquée afin d’assurer un suivi régulier de la présence et de la ponctualité de votre enfant.',
      '',
      'Nous vous remercions pour votre collaboration.',
      '',
      '*La Direction*',
      '*' + schoolName + '*',
      '',
      '— *SCHOOL FLOW* —'
    ].join('\n');

    console.log(
      '[SCHOOL FLOW] RETARD — établissement :',
      schoolName
    );

    console.log(
      '[SCHOOL FLOW] RETARD — élève :',
      studentName,
      '| classe :',
      className
    );

    console.log(
      '[SCHOOL FLOW] RETARD — parents :',
      parents.length
    );

    const results = [];

    for (const phone of parents) {
      try {
        await sendMessage(
          phone,
          message
        );

        console.log(
          '[SCHOOL FLOW] RETARD WHATSAPP ENVOYÉ :',
          phone
        );

        results.push({
          phone,
          success: true
        });

      } catch (error) {
        console.error(
          '[SCHOOL FLOW] RETARD WHATSAPP ÉCHEC :',
          phone,
          error?.message || error
        );

        results.push({
          phone,
          success: false,
          error:
            error?.message ||
            'Erreur WhatsApp.'
        });
      }
    }

    const sent = results.filter(
      result => result.success
    ).length;

    return res.json({
      success: true,
      recorded: true,
      message:
        sent === parents.length && sent > 0
          ? 'Retard enregistré et message envoyé aux parents.'
          : sent > 0
            ? 'Retard enregistré et message envoyé à un parent.'
            : parents.length === 0
              ? 'Retard enregistré, mais aucun numéro de parent n’est enregistré.'
              : 'Retard enregistré, mais aucun message WhatsApp n’a pu être envoyé.',
      event,
      sent,
      totalParents: parents.length,
      results
    });

  } catch (error) {
    console.error(
      'ERREUR RETARD WHATSAPP:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        'Erreur serveur lors de l’enregistrement du retard.'
    });
  }
});



app.post('/api/students/exclusion', async (req, res) => {
  try {
    const {
      studentId,
      exclusionType,
      startDate,
      days,
      reason
    } = req.body || {};

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Élève obligatoire.'
      });
    }

    if (!['temporary', 'permanent'].includes(String(exclusionType))) {
      return res.status(400).json({
        success: false,
        message: 'Type d’exclusion invalide.'
      });
    }

    if (!startDate) {
      return res.status(400).json({
        success: false,
        message: 'Date obligatoire.'
      });
    }

    if (!String(reason || '').trim()) {
      return res.status(400).json({
        success: false,
        message: 'Motif obligatoire.'
      });
    }

    if (
      String(exclusionType) === 'temporary' &&
      (!Number.isInteger(Number(days)) || Number(days) < 1)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Le nombre de jours doit être supérieur ou égal à 1.'
      });
    }

    const schoolId = getRequestSchoolId();

    if (!schoolId) {
      return res.status(401).json({
        success: false,
        message: 'Session SCHOOL FLOW introuvable.'
      });
    }

    const schools = readSchools();
    const school = schools.find(
      s => String(s.id) === String(schoolId)
    );

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const studentsFile = path.join(
      DATA_DIR,
      'schools',
      school.id,
      'students.json'
    );

    if (!fs.existsSync(studentsFile)) {
      return res.status(404).json({
        success: false,
        message: 'Fichier élèves introuvable.'
      });
    }

    const students = JSON.parse(
      fs.readFileSync(studentsFile, 'utf8')
    );

    const student = students.find(
      s => String(s.id) === String(studentId)
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Élève introuvable.'
      });
    }

    const parseLocalDate = value => {
      const parts = String(value).split('-').map(Number);

      if (
        parts.length !== 3 ||
        !parts[0] ||
        !parts[1] ||
        !parts[2]
      ) {
        return null;
      }

      return new Date(
        parts[0],
        parts[1] - 1,
        parts[2]
      );
    };

    const formatLocalDate = date => {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();

      return day + '/' + month + '/' + year;
    };

    const start = parseLocalDate(startDate);

    if (!start || Number.isNaN(start.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Date de début invalide.'
      });
    }

    let endDate = startDate;

    if (String(exclusionType) === 'temporary') {
      const end = new Date(start.getTime());

      // Exemple : 3 jours à partir du 08 = 08, 09, 10.
      end.setDate(
        end.getDate() + Number(days) - 1
      );

      const year = end.getFullYear();
      const month = String(end.getMonth() + 1).padStart(2, '0');
      const day = String(end.getDate()).padStart(2, '0');

      endDate = year + '-' + month + '-' + day;
    }

    const exclusion = {
      id: crypto.randomUUID(),
      type:
        String(exclusionType) === 'temporary'
          ? 'exclusion_temporaire'
          : 'exclusion_definitive',
      exclusionType: String(exclusionType),
      startDate: String(startDate),
      endDate: String(endDate),
      days:
        String(exclusionType) === 'temporary'
          ? Number(days)
          : null,
      reason: String(reason).trim(),
      date: formatLocalDate(start),
      recordedBy: 'Direction',
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(student.history)) {
      student.history = [];
    }

    student.history.push(exclusion);

    fs.writeFileSync(
      studentsFile,
      JSON.stringify(students, null, 2),
      'utf8'
    );

    const disciplineDir = path.join(
      DATA_DIR,
      'schools',
      school.id
    );

    const disciplineFile = path.join(
      disciplineDir,
      'discipline.json'
    );

    let discipline = [];

    if (fs.existsSync(disciplineFile)) {
      try {
        const parsed = JSON.parse(
          fs.readFileSync(disciplineFile, 'utf8')
        );

        if (Array.isArray(parsed)) {
          discipline = parsed;
        }
      } catch (_) {
        discipline = [];
      }
    }

    discipline.push({
      ...exclusion,
      studentId: student.id,
      studentName:
        student.name ||
        student.fullName ||
        'Élève',
      className:
        student.className ||
        'Classe non précisée',
      schoolId: school.id
    });

    fs.writeFileSync(
      disciplineFile,
      JSON.stringify(discipline, null, 2),
      'utf8'
    );

    return res.json({
      success: true,
      message:
        String(exclusionType) === 'temporary'
          ? 'Exclusion temporaire enregistrée.'
          : 'Exclusion définitive enregistrée.',
      exclusion,
      studentId: student.id,
      student: {
        name:
          student.name ||
          student.fullName ||
          'Élève',
        className:
          student.className ||
          'Classe non précisée'
      }
    });

  } catch (error) {
    console.error(
      '[SCHOOL FLOW] EXCLUSION ERROR:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        'Erreur serveur lors de l’enregistrement de l’exclusion.'
    });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    app: 'SchoolFlow',
    status: 'online',
    version: '1.1.0'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'SchoolFlow fonctionne correctement.'
  });
});

/* =========================
   ÉLÈVES
========================= */

/* =========================
   ÉLÈVES — PAR ÉTABLISSEMENT
========================= */

function getActiveSchoolForStudents() {
  /* SCHOOL_FLOW_AUTH_CONTEXT_getActiveSchoolForStudents */

  const requestSchoolId = getRequestSchoolId();

  if (requestSchoolId) {
    const schools = readSchools();

    return schools.find(
      school => String(school.id) === String(requestSchoolId)
    ) || null;
  }

  const sessionFile = path.join(DATA_DIR, 'session.json');

  if (!fs.existsSync(sessionFile)) {
    return null;
  }

  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  const schools = readSchools();

  return schools.find(school => school.id === session.schoolId) || null;
}

function getSchoolStudentsFile(school) {
  const schoolDir = path.join(DATA_DIR, 'schools', school.id);

  if (!fs.existsSync(schoolDir)) {
    fs.mkdirSync(schoolDir, { recursive: true });
  }

  const studentsFile = path.join(schoolDir, 'students.json');

  if (!fs.existsSync(studentsFile)) {
    fs.writeFileSync(studentsFile, '[]');
  }

  return studentsFile;
}

function readSchoolStudents(school) {
  const studentsFile = getSchoolStudentsFile(school);

  try {
    const data = JSON.parse(fs.readFileSync(studentsFile, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

function saveSchoolStudents(school, students) {
  const studentsFile = getSchoolStudentsFile(school);
  fs.writeFileSync(
    studentsFile,
    JSON.stringify(students, null, 2)
  );
}

app.get('/api/students', (req, res) => {
  try {
    const school = getActiveSchoolForStudents();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const students = readSchoolStudents(school);

    res.json({
      success: true,
      students
    });

  } catch (error) {
    console.error('GET STUDENTS ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/api/students/:id', (req, res) => {
  try {
    const school = getActiveSchoolForStudents();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const students = readSchoolStudents(school);

    const student = students.find(
      student => String(student.id) === String(req.params.id)
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Élève introuvable.'
      });
    }

    res.json({
      success: true,
      student
    });

  } catch (error) {
    console.error('GET STUDENT ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/students', (req, res) => {
  try {
    const {
      name,
      className,
      fatherName,
      fatherPhone,
      motherName,
      motherPhone
    } = req.body;

    if (
      !name ||
      !className ||
      !fatherName ||
      !fatherPhone ||
      !motherName ||
      !motherPhone
    ) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs sont obligatoires.'
      });
    }

    const school = getActiveSchoolForStudents();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const students = readSchoolStudents(school);

    // Matricule : une lettre + quatre chiffres mélangés, unique dans l'établissement.
    const existingMatricules = new Set(
      students.map(s => String(s.matricule || '').toUpperCase().replace(/\s/g, ''))
    );

    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let matricule = '';

    function chiffresValides(s) {
      if (/^(\d)\1{3}$/.test(s)) return false;

      const suites = [
        '0123','1234','2345','3456','4567','5678','6789',
        '7890','8901','9012',
        '9876','8765','7654','6543','5432','4321',
        '3210','2109','1098','0987'
      ];

      return !suites.some(suite => s.includes(s));
    }

    for (let attempt = 0; attempt < 50000; attempt++) {
      const letter = letters[Math.floor(Math.random() * letters.length)];
      const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');

      if (!chiffresValides(digits)) continue;

      const candidate = letter + digits;
      if (!existingMatricules.has(candidate)) {
        matricule = candidate;
        break;
      }
    }

    if (!matricule) {
      return res.status(500).json({
        success: false,
        message: 'Impossible de générer un matricule unique. Réessayez.'
      });
    }

    const student = {
      id: `STU-${Date.now()}`,
      matricule,
      name: String(name).trim(),
      fullName: String(name).trim(),
      className: String(className).trim(),

      parents: {
        father: {
          name: String(fatherName).trim(),
          phone: String(fatherPhone).trim()
        },
        mother: {
          name: String(motherName).trim(),
          phone: String(motherPhone).trim()
        }
      },

      fatherName: String(fatherName).trim(),
      fatherPhone: String(fatherPhone).trim(),
      motherName: String(motherName).trim(),
      motherPhone: String(motherPhone).trim(),

      schoolId: school.id,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    students.push(student);
    saveSchoolStudents(school, students);

    res.status(201).json({
      success: true,
      message: 'Élève enregistré avec succès.',
      student
    });

  } catch (error) {
    console.error('POST STUDENT ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.delete('/api/students/:id', (req, res) => {
  try {
    const school = getActiveSchoolForStudents();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const students = readSchoolStudents(school);

    const index = students.findIndex(
      student => String(student.id) === String(req.params.id)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: 'Élève introuvable.'
      });
    }

    const deleted = students.splice(index, 1)[0];

    saveSchoolStudents(school, students);

    res.json({
      success: true,
      message: 'Élève supprimé.',
      student: deleted
    });

  } catch (error) {
    console.error('DELETE STUDENT ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/* =========================
   CLASSES
========================= */

app.get('/api/classes', (req, res) => {
  try {
    const school = getActiveSchoolForStudents();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Établissement introuvable.'
      });
    }

    const students = readSchoolStudents(school);
    const grouped = {};

    for (const student of students) {
      const className =
        student.className ||
        'Classe non définie';

      if (!grouped[className]) {
        grouped[className] = [];
      }

      grouped[className].push(student);
    }

    const classes = Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .map(name => ({
        name,
        className: name,
        students: grouped[name],
        count: grouped[name].length
      }));

    res.json({
      success: true,
      classes
    });

  } catch (error) {
    console.error('GET CLASSES ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});





/* =========================
   SCHOOL FLOW — CONFIGURATION BOT
========================= */

function getActiveSchoolForBot() {
  /* SCHOOL_FLOW_AUTH_CONTEXT_getActiveSchoolForBot */

  const requestSchoolId = getRequestSchoolId();

  if (requestSchoolId) {
    const schools = readSchools();

    return schools.find(
      school => String(school.id) === String(requestSchoolId)
    ) || null;
  }

  try {
    const sessionFile = path.join(DATA_DIR, 'session.json');

    if (!fs.existsSync(sessionFile)) {
      return null;
    }

    const session = JSON.parse(
      fs.readFileSync(sessionFile, 'utf8')
    );

    if (!session || !session.schoolId) {
      return null;
    }

    const schools = readSchools();

    return schools.find(
      school => String(school.id) === String(session.schoolId)
    ) || null;

  } catch (error) {
    console.error('getActiveSchoolForBot ERROR:', error);
    return null;
  }
}

function getSchoolBotFile(school) {
  if (!school || !school.id) {
    throw new Error('Établissement invalide.');
  }

  const schoolDir = path.join(
    DATA_DIR,
    'schools',
    school.id
  );

  if (!fs.existsSync(schoolDir)) {
    fs.mkdirSync(schoolDir, { recursive: true });
  }

  return path.join(schoolDir, 'bot.json');
}

function getDefaultBotConfig(school) {
  return {
    enabled: false,
    assistantName: 'Assistant School Flow',

    // Paramètres de fonctionnement de l'agent depuis l'interface
    mode: 'test',
    autoReplies: true,
    unknownReplyEnabled: true,

    welcomeMessage:
      'Bonjour cher parent, je suis l’assistant School Flow. En quoi puis-je vous aider ?',

    unknownMessage:
      'Désolé, je ne suis pas programmé pour répondre à ce type de demande. Je peux vous aider concernant les informations de l’établissement, les inscriptions, les horaires, l’adresse ou vous orienter vers l’assistance humaine.',

    humanContact: {
      name: 'Assistance de l’établissement',
      phone: ''
    },

    menu: {
      enabled: true,
      text:
        '1. Informations générales\\n' +
        '2. Inscriptions\\n' +
        '3. Horaires\\n' +
        '4. Adresse de l’établissement\\n' +
        '5. Contacter l’assistance'
    },

    greetings: [
      'bonjour',
      'bonsoir',
      'salut',
      'hello',
      'hola',
      'hi',
      'bon matin',
      'bonne journée'
    ],

    knowledge: [],

    commands: {
      menu: true,
      help: true,
      contact: true
    }
  };
}

function readSchoolBotConfig(school) {
  const file = getSchoolBotFile(school);

  if (!fs.existsSync(file)) {
    const config = getDefaultBotConfig(school);

    fs.writeFileSync(
      file,
      JSON.stringify(config, null, 2)
    );

    return config;
  }

  try {
    const data = JSON.parse(
      fs.readFileSync(file, 'utf8')
    );

    return {
      ...getDefaultBotConfig(school),
      ...data,
      humanContact: {
        ...getDefaultBotConfig(school).humanContact,
        ...(data.humanContact || {})
      },
      menu: {
        ...getDefaultBotConfig(school).menu,
        ...(data.menu || {})
      },
      commands: {
        ...getDefaultBotConfig(school).commands,
        ...(data.commands || {})
      },
      greetings: Array.isArray(data.greetings)
        ? data.greetings
        : getDefaultBotConfig(school).greetings,

      knowledge: Array.isArray(data.knowledge)
        ? data.knowledge
        : []
    };

  } catch (error) {
    console.error('READ BOT CONFIG ERROR:', error);
    return getDefaultBotConfig(school);
  }
}

function saveSchoolBotConfig(school, config) {
  const file = getSchoolBotFile(school);

  fs.writeFileSync(
    file,
    JSON.stringify(config, null, 2)
  );

  return config;
}


/* =========================
   API BOT
========================= */

app.get('/api/bot/config', (req, res) => {
  try {
    const school = getActiveSchoolForBot();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Aucun établissement actif.'
      });
    }

    const config = readSchoolBotConfig(school);

    res.json({
      success: true,
      schoolId: school.id,
      schoolName: school.schoolName || '',
      config
    });

  } catch (error) {
    console.error('GET /api/bot/config ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


app.post('/api/bot/config', (req, res) => {
  try {
    const school = getActiveSchoolForBot();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Aucun établissement actif.'
      });
    }

    const current = readSchoolBotConfig(school);
    const body = req.body || {};

    const config = {
      ...current,
      ...body,

      humanContact: {
        ...current.humanContact,
        ...(body.humanContact || {})
      },

      menu: {
        ...current.menu,
        ...(body.menu || {})
      },

      commands: {
        ...current.commands,
        ...(body.commands || {})
      },

      greetings: Array.isArray(body.greetings)
        ? body.greetings
        : current.greetings,

      knowledge: Array.isArray(body.knowledge)
        ? body.knowledge
        : current.knowledge
    };

    saveSchoolBotConfig(school, config);

    res.json({
      success: true,
      message: 'Configuration de l’agent enregistrée.',
      schoolId: school.id,
      config
    });

  } catch (error) {
    console.error('POST /api/bot/config ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


/* =========================
   SERVEUR
========================= */



/* =========================================================
   SCHOOL_FLOW_AI_ENGINE_V2
   Intelligence officielle School Flow
========================================================= */

let schoolFlowOpenAIClient = null;

function getSchoolFlowOpenAIClient() {
  if (schoolFlowOpenAIClient) return schoolFlowOpenAIClient;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY absente du fichier .env');
  }

  const OpenAI = require('openai');

  schoolFlowOpenAIClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  return schoolFlowOpenAIClient;
}

function schoolFlowCleanAIText(value, maxLength = 10000) {
  return String(value || '')
    .replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function schoolFlowAIGroupContext(school) {
  const groups = school?.communicationGroups || {};
  const result = {};

  for (const [type, group] of Object.entries(groups)) {
    if (!group || typeof group !== 'object') continue;

    result[type] = {
      label: schoolFlowCleanAIText(group.label, 200),
      enabled: Boolean(group.enabled),
      link:
        group.enabled &&
        /^https?:\/\//i.test(String(group.link || ''))
          ? String(group.link)
          : ''
    };
  }

  return result;
}

function schoolFlowAIContext(school) {
  if (!school) {
    return {
      establishment: null,
      groups: {}
    };
  }

  return {
    establishment: {
      id: school.id || '',
      name: school.schoolName || school.name || '',
      description: school.description || '',
      address: school.address || '',
      phone: school.phone || '',
      email: school.email || '',
      website: school.website || ''
    },
    groups: schoolFlowAIGroupContext(school)
  };
}

function schoolFlowAISources(response) {
  const sources = [];

  try {
    const output = Array.isArray(response.output)
      ? response.output
      : [];

    for (const item of output) {
      const content = Array.isArray(item.content)
        ? item.content
        : [];

      for (const part of content) {
        const annotations = Array.isArray(part.annotations)
          ? part.annotations
          : [];

        for (const annotation of annotations) {
          const url =
            annotation?.url ||
            annotation?.href ||
            annotation?.source?.url ||
            '';

          if (
            url &&
            /^https?:\/\//i.test(url) &&
            !sources.includes(url)
          ) {
            sources.push(url);
          }
        }
      }
    }
  } catch (error) {
    console.error(
      'SCHOOL_FLOW_AI_SOURCES_ERROR:',
      error.message
    );
  }

  return sources.slice(0, 10);
}

/* =========================================================
   API BOT SETTINGS — INTERFACE SCHOOL FLOW
   Configuration par établissement
========================================================= */

app.get('/api/bot/settings', (req, res) => {
  try {
    const school = getActiveSchoolForBot();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Aucun établissement actif.'
      });
    }

    const current = readSchoolBotConfig(school);

    const settings = {
      mode:
        current.mode === 'official'
          ? 'official'
          : 'test',

      autoReplies:
        current.autoReplies !== false,

      unknownReplyEnabled:
        current.unknownReplyEnabled !== false,

      enabled:
        current.enabled === true,

      assistantName:
        current.assistantName || 'Assistant School Flow'
    };

    res.json({
      success: true,
      schoolId: school.id,
      schoolName: school.schoolName || '',
      settings,
      knowledge: {
        count:
          typeof require('./whatsapp/local-knowledge').getScenarioCount === 'function'
            ? require('./whatsapp/local-knowledge').getScenarioCount()
            : 0,
        status: 'available'
      },
      contact: {
        phone: '+243 856 868 015',
        whatsapp: 'https://wa.me/243856868015'
      }
    });

  } catch (error) {
    console.error('GET /api/bot/settings ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


app.post('/api/bot/settings', (req, res) => {
  try {
    const school = getActiveSchoolForBot();

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Aucun établissement actif.'
      });
    }

    const current = readSchoolBotConfig(school);
    const body = req.body || {};

    const mode =
      body.mode === 'official'
        ? 'official'
        : 'test';

    const config = {
      ...current,

      mode,

      autoReplies:
        body.autoReplies !== false,

      unknownReplyEnabled:
        body.unknownReplyEnabled !== false,

      enabled:
        body.enabled !== undefined
          ? Boolean(body.enabled)
          : current.enabled
    };

    saveSchoolBotConfig(school, config);

    res.json({
      success: true,
      message: 'Paramètres du bot enregistrés.',
      schoolId: school.id,
      schoolName: school.schoolName || '',
      settings: {
        mode: config.mode,
        autoReplies: config.autoReplies,
        unknownReplyEnabled: config.unknownReplyEnabled,
        enabled: config.enabled
      }
    });

  } catch (error) {
    console.error('POST /api/bot/settings ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


app.post('/api/bot/test-knowledge', (req, res) => {
  try {
    const question = String(
      (req.body || {}).question || ''
    ).trim();

    if (!question) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez saisir une question.'
      });
    }

    const localKnowledge =
      require('./whatsapp/local-knowledge');

    const answer =
      localKnowledge.findLocalAnswer(question);

    let count = 0;

    if (
      typeof localKnowledge.getScenarioCount === 'function'
    ) {
      count = localKnowledge.getScenarioCount();
    }

    res.json({
      success: true,
      question,
      found: Boolean(answer),
      answer: answer || null,
      knowledgeCount: count
    });

  } catch (error) {
    console.error('POST /api/bot/test-knowledge ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


app.post('/api/bot/ask', async (req, res) => {

  if (Date.now() < schoolFlowAIRateLimitUntil) {
    const remaining = Math.ceil(
      (schoolFlowAIRateLimitUntil - Date.now()) / 1000
    );

    return res.status(429).json({
      success: false,
      rateLimited: true,
      retryAfterSeconds: remaining,
      error: schoolFlowRateLimitMessage()
    });
  }


  try {
    const question = schoolFlowCleanAIText(
      req.body?.question,
      6000
    );

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'La question est obligatoire.'
      });
    }

    let school = null;

    if (typeof getActiveSchoolForBot === 'function') {
      school = getActiveSchoolForBot();
    }

    if (!school && typeof getActiveSchool === 'function') {
      school = getActiveSchool();
    }

    const localContext = schoolFlowAIContext(school);

    let botConfig = {};

    if (
      school &&
      typeof readSchoolBotConfig === 'function'
    ) {
      botConfig = readSchoolBotConfig(school);
    }

    const instructions = [
      'Tu es l’assistant intelligent officiel de School Flow.',
      '',
      'MISSION :',
      'Répondre aux utilisateurs de manière naturelle, professionnelle et fiable.',
      '',
      'RÈGLES DE FIABILITÉ :',
      '1. Ne jamais inventer une information.',
      '2. Ne jamais inventer une adresse, un téléphone, un horaire ou un lien.',
      '3. Pour les informations de l’établissement, utiliser d’abord les données School Flow fournies ci-dessous.',
      '4. Pour une information publique, récente, locale ou susceptible d’avoir changé, utiliser la recherche Web.',
      '5. Si les sources sont contradictoires, le signaler clairement.',
      '6. Si une information ne peut pas être confirmée, dire clairement qu’elle n’est pas confirmée.',
      '7. Ne jamais présenter une supposition comme un fait.',
      '8. Pour les groupes WhatsApp, utiliser uniquement les liens configurés dans School Flow.',
      '9. Ne jamais fabriquer un lien WhatsApp.',
      '10. Répondre en français sauf demande contraire.',
      '11. Répondre de façon concise mais suffisamment complète.',
      '',
      'DONNÉES LOCALES SCHOOL FLOW :',
      JSON.stringify(localContext),
      '',
      'CONFIGURATION DU BOT :',
      JSON.stringify({
        assistantName:
          botConfig.assistantName ||
          'Assistant School Flow',
        knowledge:
          Array.isArray(botConfig.knowledge)
            ? botConfig.knowledge.slice(0, 30)
            : []
      })
    ].join('\\n');

    const client =
      getSchoolFlowOpenAIClient();

    const response =
      await client.responses.create({
        model: 'gpt-6-luna',
      max_output_tokens: SCHOOL_FLOW_AI_MAX_OUTPUT_TOKENS,
        instructions,
        tools: [
          {
            type: 'web_search'
          }
        ],
        input: question
      });

    const answer =
      typeof response.output_text === 'string'
        ? response.output_text.trim()
        : '';

    if (!answer) {
      return res.status(502).json({
        success: false,
        error:
          'Aucune réponse exploitable reçue du moteur intelligent.'
      });
    }

    const sources =
      schoolFlowAISources(response);

    const verification =
      sources.length > 0
        ? 'verified_with_sources'
        : 'local_or_general';

    return res.json({
      success: true,
      answer,
      verification,
      sources,
      schoolName:
        localContext.establishment?.name || '',
      assistantName:
        botConfig.assistantName ||
        'Assistant School Flow'
    });

  } catch (error) {

    if (schoolFlowIsRateLimitError(error)) {
      const waitMs = schoolFlowGetRateLimitWait(error);
      schoolFlowAIRateLimitUntil = Date.now() + waitMs;

      console.error('SCHOOL FLOW AI — 429 RATE LIMIT');
      console.error('Cooldown interne :', Math.ceil(waitMs / 1000), 'secondes');

      return res.status(429).json({
        success: false,
        rateLimited: true,
        retryAfterSeconds: Math.ceil(waitMs / 1000),
        error: schoolFlowRateLimitMessage()
      });
    }


    console.error(
      'SCHOOL_FLOW_AI_ERROR:',
      error?.message || error
    );

    return res.status(500).json({
      success: false,
      error:
        'Le moteur intelligent School Flow est temporairement indisponible.'
    });
  }
});

console.log(
  '===== SCHOOL FLOW AI ENGINE V2 ACTIVÉ ====='
);


/* =========================================================
   SCHOOL_FLOW_AI_ENGINE_V3
========================================================= */

const SCHOOL_FLOW_AI_MAX_QUESTION_CHARS = 1200;
const SCHOOL_FLOW_AI_MAX_CONTEXT_CHARS = 7000;
const SCHOOL_FLOW_AI_MAX_OUTPUT_TOKENS = 500;

/*
 * Quand OpenAI renvoie 429, on évite de renvoyer immédiatement
 * d'autres requêtes qui aggraveraient la limite TPM.
 */
let schoolFlowAIRateLimitUntil = 0;

function schoolFlowLimitAIText(value, maxChars) {
  const text = String(value || '');
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n[CONTENU RÉDUIT POUR ÉCONOMISER LES TOKENS]';
}


function schoolFlowOptimizeAIContext(value) {
  return schoolFlowLimitAIText(
    value,
    SCHOOL_FLOW_AI_MAX_CONTEXT_CHARS
  );
}

function schoolFlowIsRateLimitError(error) {
  const status = Number(
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    0
  );

  const message = String(error?.message || error || '').toLowerCase();

  return (
    status === 429 ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('tokens per min') ||
    message.includes('tpm')
  );
}

function schoolFlowGetRateLimitWait(error) {
  const message = String(error?.message || error || '');

  const match = message.match(/try again in\s+([0-9]+(?:\.[0-9]+)?)\s*(ms|s|m|h)/i);

  if (!match) {
    return 60 * 1000;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  let milliseconds = amount * 1000;

  if (unit === 'ms') milliseconds = amount;
  if (unit === 'm') milliseconds = amount * 60 * 1000;
  if (unit === 'h') milliseconds = amount * 60 * 60 * 1000;

  /*
   * On ne garde pas un cooldown absurde de plusieurs jours
   * dans le processus Node.
   */
  return Math.min(Math.max(milliseconds, 30 * 1000), 60 * 60 * 1000);
}

function schoolFlowRateLimitMessage() {
  return 'Je suis momentanément très sollicité. Je préfère ne pas vous donner une réponse approximative. Veuillez réessayer dans quelques instants.';
}



/* =========================================================
   SCHOOL FLOW — TEST SERVEUR IA DISTANT
========================================================= */

app.get('/api/ai/local/status', async (req, res) => {
  try {
    const status = await schoolFlowRemoteAI.healthCheck();

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/ai/local/test', async (req, res) => {
  try {
    const prompt = String(
      req.body?.question || 'Bonjour, présente-toi en une phrase.'
    ).trim();

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Question obligatoire.'
      });
    }

    const answer = await schoolFlowRemoteAI.askLocalAI({
      prompt: prompt.slice(0, 1200),
      system:
        'Tu es l’assistant IA de School Flow. ' +
        'Réponds simplement, clairement et sans inventer.',
      temperature: 0.3,
      maxTokens: 300
    });

    res.json({
      success: true,
      answer
    });
  } catch (error) {
    console.error('SCHOOL FLOW REMOTE AI ERROR:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════╗');
  console.log('║            SchoolFlow               ║');
  console.log('║     Communication scolaire       ║');
  console.log('╚══════════════════════════════════╝');
  console.log('');
  console.log(`🚀 Serveur : http://127.0.0.1:${PORT}`);
  console.log('🟢 Statut  : ONLINE');
  console.log('👨‍🎓 Élèves : API ACTIVE');
  console.log('🏫 Classes : API ACTIVE');
  console.log('👨‍👩‍👧 Parents : API ACTIVE');
  console.log('');
});
