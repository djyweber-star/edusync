const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const SCHOOLS_FILE = path.join(DATA_DIR, 'schools.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(SCHOOLS_FILE)) {
  fs.writeFileSync(SCHOOLS_FILE, '[]');
}

function readSchools() {
  try {
    return JSON.parse(fs.readFileSync(SCHOOLS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveSchools(schools) {
  fs.writeFileSync(
    SCHOOLS_FILE,
    JSON.stringify(schools, null, 2)
  );
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function createSchool(email, schoolName) {
  email = normalizeEmail(email);
  schoolName = String(schoolName || '').trim();

  if (!email || !schoolName) {
    throw new Error('Adresse email et nom de l’établissement obligatoires.');
  }

  const schools = readSchools();

  const existing = schools.find(school => school.email === email);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const registrationCode = crypto.randomBytes(12).toString('hex');

  const communicationGroups = {
    establishment: {
      enabled: false,
      link: ''
    },
    parents: {
      enabled: false,
      link: ''
    },
    teachers: {
      enabled: false,
      link: ''
    },
    parents_teachers: {
      enabled: false,
      link: ''
    },
    channel: {
      enabled: false,
      link: ''
    }
  };

  const school = {
    id,
    email,
    schoolName,
    createdAt: new Date().toISOString(),
    registrationCode,
    communicationGroups
  };

  schools.push(school);
  saveSchools(schools);

  const schoolDir = path.join(DATA_DIR, 'schools', id);
  fs.mkdirSync(schoolDir, { recursive: true });

  fs.writeFileSync(
    path.join(schoolDir, 'students.json'),
    '[]'
  );

  fs.writeFileSync(
    path.join(schoolDir, 'config.json'),
    JSON.stringify({
      schoolName,
      address: '',
      description: '',
      educationalStyle: '',
      logo: ''
    }, null, 2)
  );

  fs.writeFileSync(
    path.join(schoolDir, 'bot.json'),
    JSON.stringify({
      enabled: false,
      assistantName: 'Assistant School Flow',
      welcomeMessage: 'Bonjour cher parent, je suis l’assistant School Flow. En quoi puis-je vous aider ?',
      unknownMessage: 'Désolé, je ne suis pas programmé pour répondre à cette demande. Veuillez contacter l’assistance de l’établissement.',
      humanContact: {
        name: 'Assistance de l’établissement',
        phone: ''
      },
      menu: {
        enabled: true,
        text: '1. Informations générales\n2. Inscriptions\n3. Frais scolaires\n4. Horaires\n5. Adresse de l’établissement\n6. Contacter l’assistance'
      },
      greetings: [
        'bonjour',
        'bonsoir',
        'salut',
        'hello'
      ]
    }, null, 2)
  );

  fs.writeFileSync(
    path.join(schoolDir, 'payments.json'),
    '[]'
  );

  console.log('🏫 SCHOOL FLOW — NOUVEL ÉTABLISSEMENT CRÉÉ :', schoolName);
  console.log('📁 DOSSIER :', schoolDir);
  console.log('🔑 CODE INSCRIPTION :', registrationCode);

  return school;
}
function findSchool(email) {
  email = normalizeEmail(email);

  return readSchools().find(
    school => school.email === email
  ) || null;
}

module.exports = {
  readSchools,
  saveSchools,
  createSchool,
  findSchool,
  normalizeEmail
};
