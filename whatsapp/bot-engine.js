const fs = require('fs');
const localKnowledge = require('./local-knowledge');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const paymentSecurity = require('../security/payment-security');
const paymentAlerts = require('../security/payment-alerts');
const devCore = require('./dev-core/agent-core');
const schoolAgentManager = require('./dev-core/school-agent-manager');

const menuSessions = new Map();
const paymentPinSessions = new Map();
const schoolFeesSessions = new Map();
const paymentAccessSessions = new Map();
const schoolAgentManagerSessions = new Map();



function getSchoolAgentManagerSession(jid) {
  return schoolAgentManagerSessions.get(jid) || null;
}

function setSchoolAgentManagerSession(jid, session) {
  schoolAgentManagerSessions.set(jid, session);
}

function clearSchoolAgentManagerSession(jid) {
  schoolAgentManagerSessions.delete(jid);
}

function buildSchoolManagerMenu() {
  return [
    '+--------------------------------------+',
    '| SCHOOL FLOW - GESTION ETABLISSEMENTS |',
    '+--------------------------------------+',
    '',
    '1. Voir les etablissements',
    '2. Voir les agents',
    '3. Ajouter un agent',
    '4. Modifier un agent',
    '5. Supprimer un agent',
    '6. Configurer un agent financier',
    '',
    'Pour quitter : retour',
    '',
    'Repondez avec le numero de votre choix.'
  ].join('\n');
}

function buildSchoolList() {
  const schools = schoolAgentManager.listSchools();

  if (!schools.length) {
    return [
      'SCHOOL FLOW - ETABLISSEMENTS',
      '',
      'Aucun etablissement enregistre.',
      '',
      'Pour quitter : retour'
    ].join('\n');
  }

  const lines = [
    '╔══════════════════════════════════════╗',
    '║       SCHOOL FLOW • ÉCOLES           ║',
    '╚══════════════════════════════════════╝',
    ''
  ];

  schools.forEach((school, index) => {
    lines.push(
      (index + 1) + '. ' + school.name
    );
    lines.push(
      '   ID : ' + school.id
    );
    lines.push('');
  });

  lines.push(
    'Repondez avec le numero de l etablissement.'
  );
  lines.push('');
  lines.push('Pour quitter : retour');

  return lines.join('\n');
}

function buildAgentsList(schoolId) {
  const result =
    schoolAgentManager.listAgents(schoolId);

  if (!result.success) {
    return result.message;
  }

  const lines = [
    '╔══════════════════════════════════════╗',
    '║        SCHOOL FLOW • AGENTS          ║',
    '╚══════════════════════════════════════╝',
    '',
    'Établissement : ' + result.school.name,
    ''
  ];

  if (!result.agents.length) {
    lines.push('Aucun agent enregistre.');
  } else {
    result.agents.forEach((agent, index) => {
      lines.push(
        (index + 1) + '. ' + agent.name
      );
      lines.push(
        '   Role : ' + agent.role
      );
      lines.push(
        '   WhatsApp : ' + agent.phone
      );
      lines.push(
        '   Statut : ' +
        (agent.active ? 'ACTIF' : 'INACTIF')
      );
      lines.push(
        '   ID : ' + agent.id
      );
      lines.push('');
    });
  }

  lines.push(
    'Les donnees des eleves et des parents ne sont pas affichees.'
  );
  lines.push('');
  lines.push('Pour quitter : retour');

  return lines.join('\n');
}

async function handleSchoolAgentManager(
  sock,
  jid,
  text
) {
  const input = String(text || '').trim();
  const normalized = normalizeText(input);
  const current =
    getSchoolAgentManagerSession(jid);

  if (
    normalized === 'retour' ||
    normalized === 'annuler' ||
    normalized === 'cancel'
  ) {
    clearSchoolAgentManagerSession(jid);

    return sock.sendMessage(jid, {
      text: buildSchoolManagerMenu()
    });
  }

  if (!current) {
    if (
      normalized === 'ecole' ||
      normalized === 'etablissement' ||
      normalized === 'etablissements' ||
      normalized === 'ecoles'
    ) {
      setSchoolAgentManagerSession(jid, {
        step: 'menu'
      });

      return sock.sendMessage(jid, {
        text: buildSchoolManagerMenu()
      });
    }

    return false;
  }

  if (current.step === 'menu') {
    if (input === '1') {
      return sock.sendMessage(jid, {
        text: buildSchoolList()
      });
    }

    if (input === '2') {
      setSchoolAgentManagerSession(jid, {
        step: 'select-school-agents'
      });

      return sock.sendMessage(jid, {
        text: buildSchoolList()
      });
    }

    if (input === '3') {
      setSchoolAgentManagerSession(jid, {
        step: 'select-school-add'
      });

      return sock.sendMessage(jid, {
        text: buildSchoolList()
      });
    }

    if (input === '4') {
      setSchoolAgentManagerSession(jid, {
        step: 'select-school-edit'
      });

      return sock.sendMessage(jid, {
        text: buildSchoolList()
      });
    }

    if (input === '5') {
      setSchoolAgentManagerSession(jid, {
        step: 'select-school-delete'
      });

      return sock.sendMessage(jid, {
        text: buildSchoolList()
      });
    }

    if (input === '6') {
      setSchoolAgentManagerSession(jid, {
        step: 'select-school-financial'
      });

      return sock.sendMessage(jid, {
        text: buildSchoolList()
      });
    }

    return sock.sendMessage(jid, {
      text: buildSchoolManagerMenu()
    });
  }

  const schools =
    schoolAgentManager.listSchools();

  const schoolIndex =
    Number.parseInt(input, 10) - 1;

  const selectedSchool =
    schools[schoolIndex];

  if (
    current.step === 'select-school-agents' ||
    current.step === 'select-school-add' ||
    current.step === 'select-school-edit' ||
    current.step === 'select-school-delete' ||
    current.step === 'select-school-financial'
  ) {
    if (!selectedSchool) {
      return sock.sendMessage(jid, {
        text:
          'Numero d etablissement invalide.\n\n' +
          buildSchoolList()
      });
    }

    if (current.step === 'select-school-agents') {
      clearSchoolAgentManagerSession(jid);

      return sock.sendMessage(jid, {
        text: buildAgentsList(selectedSchool.id)
      });
    }

    if (current.step === 'select-school-add') {
      setSchoolAgentManagerSession(jid, {
        step: 'add-name',
        schoolId: selectedSchool.id
      });

      return sock.sendMessage(jid, {
        text:
          'AJOUT D UN AGENT\n\n' +
          'Etablissement : ' +
          selectedSchool.name +
          '\n\n' +
          'Nom complet de l agent :'
      });
    }

    if (current.step === 'select-school-edit') {
      const result =
        schoolAgentManager.listAgents(
          selectedSchool.id
        );

      if (!result.success || !result.agents.length) {
        clearSchoolAgentManagerSession(jid);

        return sock.sendMessage(jid, {
          text:
            'Aucun agent a modifier pour cet etablissement.'
        });
      }

      setSchoolAgentManagerSession(jid, {
        step: 'edit-agent',
        schoolId: selectedSchool.id
      });

      const lines = [
        'MODIFIER UN AGENT',
        '',
        'Etablissement : ' + selectedSchool.name,
        ''
      ];

      result.agents.forEach((agent, index) => {
        lines.push(
          (index + 1) + '. ' +
          agent.name +
          ' - ' +
          agent.role
        );
      });

      lines.push('');
      lines.push('Repondez avec le numero de l agent.');

      return sock.sendMessage(jid, {
        text: lines.join('\n')
      });
    }

    if (current.step === 'select-school-delete') {
      const result =
        schoolAgentManager.listAgents(
          selectedSchool.id
        );

      if (!result.success || !result.agents.length) {
        clearSchoolAgentManagerSession(jid);

        return sock.sendMessage(jid, {
          text:
            'Aucun agent a supprimer pour cet etablissement.'
        });
      }

      setSchoolAgentManagerSession(jid, {
        step: 'delete-agent',
        schoolId: selectedSchool.id
      });

      const lines = [
        'SUPPRIMER UN AGENT',
        '',
        'Etablissement : ' + selectedSchool.name,
        ''
      ];

      result.agents.forEach((agent, index) => {
        lines.push(
          (index + 1) + '. ' +
          agent.name +
          ' - ' +
          agent.role
        );
      });

      lines.push('');
      lines.push('Repondez avec le numero de l agent.');

      return sock.sendMessage(jid, {
        text: lines.join('\n')
      });
    }

    if (current.step === 'select-school-financial') {
      setSchoolAgentManagerSession(jid, {
        step: 'financial-name',
        schoolId: selectedSchool.id
      });

      return sock.sendMessage(jid, {
        text:
          'CONFIGURATION AGENT FINANCIER\n\n' +
          'Etablissement : ' +
          selectedSchool.name +
          '\n\n' +
          'Nom complet de l agent financier :'
      });
    }
  }

  if (current.step === 'add-name') {
    setSchoolAgentManagerSession(jid, {
      ...current,
      step: 'add-phone',
      name: input
    });

    return sock.sendMessage(jid, {
      text:
        'Numero WhatsApp de l agent :'
    });
  }

  if (current.step === 'add-phone') {
    setSchoolAgentManagerSession(jid, {
      ...current,
      step: 'add-role',
      phone: input
    });

    return sock.sendMessage(jid, {
      text:
        'Role de l agent :\n\n' +
        '1. direction\n' +
        '2. administration\n' +
        '3. financier\n' +
        '4. rh\n' +
        '5. discipline\n' +
        '6. autre\n\n' +
        'Repondez avec le numero du role.'
    });
  }

  if (current.step === 'add-role') {
    const roles = [
      'direction',
      'administration',
      'financier',
      'rh',
      'discipline',
      'autre'
    ];

    const roleIndex =
      Number.parseInt(input, 10) - 1;

    const role =
      roles[roleIndex] || normalizeText(input);

    const result =
      schoolAgentManager.addAgent({
        schoolId: current.schoolId,
        name: current.name,
        phone: current.phone,
        role
      });

    clearSchoolAgentManagerSession(jid);

    return sock.sendMessage(jid, {
      text:
        result.success
          ? 'AGENT AJOUTE AVEC SUCCES.\n\n' +
            'Nom : ' + result.agent.name + '\n' +
            'WhatsApp : ' + result.agent.phone + '\n' +
            'Role : ' + result.agent.role
          : 'ERREUR : ' + result.message
    });
  }

  if (current.step === 'financial-name') {
    setSchoolAgentManagerSession(jid, {
      ...current,
      step: 'financial-phone',
      name: input
    });

    return sock.sendMessage(jid, {
      text:
        'Numero WhatsApp de l agent financier :'
    });
  }

  if (current.step === 'financial-phone') {
    const result =
      schoolAgentManager.addAgent({
        schoolId: current.schoolId,
        name: current.name,
        phone: input,
        role: 'financier'
      });

    clearSchoolAgentManagerSession(jid);

    return sock.sendMessage(jid, {
      text:
        result.success
          ? [
              'AGENT FINANCIER CONFIGURE',
              '',
              'Nom : ' + result.agent.name,
              'WhatsApp : ' + result.agent.phone,
              'Role : financier',
              '',
              'SECURITE :',
              'Le PIN financier n est pas configure ici.',
              'L agent financier devra definir son propre PIN.'
            ].join('\n')
          : 'ERREUR : ' + result.message
    });
  }

  if (current.step === 'edit-agent') {
    const result =
      schoolAgentManager.listAgents(
        current.schoolId
      );

    const agentIndex =
      Number.parseInt(input, 10) - 1;

    const agent =
      result.agents[agentIndex];

    if (!agent) {
      return sock.sendMessage(jid, {
        text:
          'Numero d agent invalide.'
      });
    }

    setSchoolAgentManagerSession(jid, {
      ...current,
      step: 'edit-name',
      agentId: agent.id,
      currentAgent: agent
    });

    return sock.sendMessage(jid, {
      text:
        'Nouveau nom de l agent :'
    });
  }

  if (current.step === 'edit-name') {
    setSchoolAgentManagerSession(jid, {
      ...current,
      step: 'edit-phone',
      name: input
    });

    return sock.sendMessage(jid, {
      text:
        'Nouveau numero WhatsApp :'
    });
  }

  if (current.step === 'edit-phone') {
    setSchoolAgentManagerSession(jid, {
      ...current,
      step: 'edit-role',
      phone: input
    });

    return sock.sendMessage(jid, {
      text:
        'Nouveau role :\n\n' +
        '1. direction\n' +
        '2. administration\n' +
        '3. financier\n' +
        '4. rh\n' +
        '5. discipline\n' +
        '6. autre'
    });
  }

  if (current.step === 'edit-role') {
    const roles = [
      'direction',
      'administration',
      'financier',
      'rh',
      'discipline',
      'autre'
    ];

    const roleIndex =
      Number.parseInt(input, 10) - 1;

    const role =
      roles[roleIndex] || normalizeText(input);

    const result =
      schoolAgentManager.updateAgent({
        schoolId: current.schoolId,
        agentId: current.agentId,
        name: current.name,
        phone: current.phone,
        role
      });

    clearSchoolAgentManagerSession(jid);

    return sock.sendMessage(jid, {
      text:
        result.success
          ? 'AGENT MODIFIE AVEC SUCCES.'
          : 'ERREUR : ' + result.message
    });
  }

  if (current.step === 'delete-agent') {
    const result =
      schoolAgentManager.listAgents(
        current.schoolId
      );

    const agentIndex =
      Number.parseInt(input, 10) - 1;

    const agent =
      result.agents[agentIndex];

    if (!agent) {
      return sock.sendMessage(jid, {
        text:
          'Numero d agent invalide.'
      });
    }

    const removed =
      schoolAgentManager.removeAgent({
        schoolId: current.schoolId,
        agentId: agent.id
      });

    clearSchoolAgentManagerSession(jid);

    return sock.sendMessage(jid, {
      text:
        removed.success
          ? 'AGENT SUPPRIME AVEC SUCCES.'
          : 'ERREUR : ' + removed.message
    });
  }

  clearSchoolAgentManagerSession(jid);

  return sock.sendMessage(jid, {
    text:
      'Session de gestion terminee. Tapez ecole pour recommencer.'
  });
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getIncomingText(message) {
  try {
    const msg = message?.message;
    if (!msg) return '';

    return (
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.imageMessage?.caption ||
      msg.videoMessage?.caption ||
      msg.documentMessage?.caption ||
      msg.ephemeralMessage?.message?.conversation ||
      msg.ephemeralMessage?.message?.extendedTextMessage?.text ||
      msg.viewOnceMessage?.message?.conversation ||
      msg.viewOnceMessage?.message?.extendedTextMessage?.text ||
      ''
    ).trim();
  } catch (error) {
    console.error('GET MESSAGE TEXT ERROR:', error);
    return '';
  }
}

function getSenderJid(message) {
  const key = message?.key || {};
  const remoteJid = String(key.remoteJid || '');
  const participant = String(key.participant || '');

  // WhatsApp LID : privilégier le numéro réel fourni par Baileys.
  if (remoteJid.endsWith('@lid')) {
    const phoneJid = String(
      key.senderPn ||
      key.participantPn ||
      ''
    );

    if (phoneJid.endsWith('@s.whatsapp.net')) {
      return phoneJid;
    }
  }

  // Conserver les conversations privées classiques et les groupes.
  return remoteJid || participant || '';
}

function getActiveSchool(schoolId) {
  try {
    let selectedSchoolId = schoolId ? String(schoolId) : null;

    // Les anciennes connexions gardent le fonctionnement existant.
    if (!selectedSchoolId) {
      const sessionFile = path.join(DATA_DIR, 'session.json');
      if (!fs.existsSync(sessionFile)) return null;

      const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      if (!session?.schoolId) return null;

      selectedSchoolId = String(session.schoolId);
    }

    const schoolsFile = path.join(DATA_DIR, 'schools.json');
    if (!fs.existsSync(schoolsFile)) return null;

    const schools = JSON.parse(fs.readFileSync(schoolsFile, 'utf8'));

    return Array.isArray(schools)
      ? schools.find(school => String(school.id) === selectedSchoolId) || null
      : null;
  } catch (error) {
    console.error('GET ACTIVE SCHOOL BOT ERROR:', error);
    return null;
  }
}

function getBotConfig(school) {
  if (!school?.id) return null;

  const file = path.join(
    DATA_DIR,
    'schools',
    school.id,
    'bot.json'
  );

  if (!fs.existsSync(file)) return null;

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error('READ BOT CONFIG ERROR:', error);
    return null;
  }
}

function getSchoolStudents(school) {
  if (!school?.id) return [];

  const file = path.join(
    DATA_DIR,
    'schools',
    school.id,
    'students.json'
  );

  if (!fs.existsSync(file)) return [];

  try {
    const students = JSON.parse(
      fs.readFileSync(file, 'utf8')
    );

    return Array.isArray(students) ? students : [];
  } catch (error) {
    console.error('READ SCHOOL STUDENTS ERROR:', error);
    return [];
  }
}

function buildMenu() {
  return [
    '╔══════════════════════════════╗',
    '        SCHOOL FLOW',
    '      ASSISTANT PARENT',
    '╚══════════════════════════════╝',
    '',
    '📚 INFORMATIONS',
    '',
    '1. Informations générales',
    '2. Inscriptions',
    '3. Horaires',
    '4. Adresse de l’établissement',
    '5. Contacter l’assistance',
    '6. Informations sur mon enfant',
    '7. Absences',
    '8. Retards',
    '9. Justification d’absence',
    '10. Règlement de l’établissement',
    '',
    '🏫 VIE SCOLAIRE',
    '',
    '11. Discipline',
    '12. Convocation',
    '13. Communiqués',
    '14. Calendrier scolaire',
    '15. Examens',
    '16. Résultats scolaires',
    '17. Classes',
    '18. Enseignants',
    '',
    '💰 FINANCES',
    '',
    '19. Frais scolaires',
    '20. Paiements',
    '21. Reçu de paiement',
    '22. Solde scolaire',
    '23. Paiement manquant',
    '24. Confirmation de paiement',
    '25. Réclamation concernant un paiement',
    '',
    '⚙️ SERVICES',
    '',
    '26. Administration',
    '27. Assistance technique',
    '28. Confidentialité',
    '29. Aide School Flow',
    '30. Retour au menu',
    '',
    '👉 Répondez simplement avec le numéro correspondant.',
    '💡 Vous pouvez aussi écrire : *menu*, *aide* ou *contact*.'
  ].join('\n');
}

function saveMenuSession(jid, option) {
  menuSessions.set(jid, {
    option,
    expiresAt: Date.now() + 10 * 60 * 1000
  });
}

function getMenuSession(jid) {
  const session = menuSessions.get(jid);

  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    menuSessions.delete(jid);
    return null;
  }

  return session;
}

function clearMenuSession(jid) {
  menuSessions.delete(jid);
}


function readSchoolFeeData(school) {
  const result = {
    settings: { classFees: {} },
    payments: []
  };

  if (!school || !school.id) {
    return result;
  }

  const schoolDir = path.join(
    DATA_DIR,
    'schools',
    String(school.id)
  );

  const settingsFile = path.join(
    schoolDir,
    'payment-settings.json'
  );

  const paymentsFile = path.join(
    schoolDir,
    'payments.json'
  );

  try {
    if (fs.existsSync(settingsFile)) {
      const data =
        JSON.parse(
          fs.readFileSync(
            settingsFile,
            'utf8'
          )
        );

      if (
        data &&
        typeof data === 'object'
      ) {
        result.settings = data;
      }
    }
  } catch (error) {
    console.error(
      '[SCHOOL FLOW] Erreur lecture payment-settings.json:',
      error
    );
  }

  try {
    if (fs.existsSync(paymentsFile)) {
      const data =
        JSON.parse(
          fs.readFileSync(
            paymentsFile,
            'utf8'
          )
        );

      if (Array.isArray(data)) {
        result.payments = data;
      }
    }
  } catch (error) {
    console.error(
      '[SCHOOL FLOW] Erreur lecture payments.json:',
      error
    );
  }

  return result;
}

function getParentFeeSummary(
  school,
  student
) {
  const data =
    readSchoolFeeData(school);

  const className =
    String(
      student?.className || ''
    ).trim();

  const feeConfig =
    data.settings?.classFees?.[className] ||
    {};

  const feeAmount =
    Number(
      feeConfig.amount || 0
    );

  const currency =
    String(
      feeConfig.currency || 'USD'
    ).trim();

  const studentPayments =
    data.payments.filter(
      payment =>
        String(
          payment.studentId
        ) ===
        String(student.id)
    );

  const totalPaid =
    Math.round(
      studentPayments.reduce(
        (total, payment) =>
          total +
          Number(
            payment.amount || 0
          ),
        0
      ) * 100
    ) / 100;

  const remaining =
    Math.max(
      0,
      Math.round(
        (feeAmount - totalPaid) * 100
      ) / 100
    );

  let status =
    'FRAIS NON PAYÉS';

  if (
    feeAmount > 0 &&
    remaining <= 0
  ) {
    status =
      'FRAIS SOLDÉS';
  } else if (
    totalPaid > 0
  ) {
    status =
      'PAIEMENT PARTIEL';
  }

  return {
    feeAmount,
    totalPaid,
    remaining,
    currency,
    status
  };
}

function buildParentFeeMessage(
  school,
  student,
  parentIdentity
) {
  const summary =
    getParentFeeSummary(
      school,
      student
    );

  const studentName =
    student?.fullName ||
    student?.name ||
    'Élève';

  const className =
    student?.className ||
    '-';

  const greeting =
    getParentGreeting(
      parentIdentity
    );

  if (summary.feeAmount <= 0) {
    return [
      '╔══════════════════════════════╗',
      '        SCHOOL FLOW',
      '       FRAIS SCOLAIRES',
      '╚══════════════════════════════╝',
      '',
      greeting + ',',
      '',
      '👨‍🎓 *Élève :* ' +
        studentName,
      '🏫 *Classe :* ' +
        className,
      '',
      '⚠️ Les frais scolaires de cette classe',
      'ne sont pas encore configurés.',
      '',
      'Veuillez contacter l’administration',
      'de l’établissement.',
      '',
      '— *SCHOOL FLOW* —'
    ].join('\n');
  }

  return [
    '╔══════════════════════════════╗',
    '        SCHOOL FLOW',
    '       FRAIS SCOLAIRES',
    '╚══════════════════════════════╝',
    '',
    greeting + ',',
    '',
    '👨‍🎓 *Élève :* ' +
      studentName,
    '🏫 *Classe :* ' +
      className,
    '',
    '💰 *Frais scolaires :* ' +
      summary.feeAmount +
      ' ' +
      summary.currency,
    '💵 *Montant déjà payé :* ' +
      summary.totalPaid +
      ' ' +
      summary.currency,
    '📌 *Solde restant :* ' +
      summary.remaining +
      ' ' +
      summary.currency,
    '',
    '📋 *Statut : ' +
      summary.status +
      '*',
    '',
    'Les informations affichées concernent',
    'uniquement votre enfant.',
    '',
    '— *SCHOOL FLOW* —'
  ].join('\n');
}

function findStudent(students, name, className) {
  const wantedName = normalizeText(name);
  const wantedClass = normalizeText(className);

  return students.find(student => {
    const studentName = normalizeText(
      student.name || student.fullName
    );

    const studentClass = normalizeText(
      student.className
    );

    return (
      studentName === wantedName &&
      studentClass === wantedClass
    );
  });
}

function getStudentParentPhones(student) {
  const phones = [];

  const values = [
    student?.fatherPhone,
    student?.motherPhone,
    student?.parents?.father?.phone,
    student?.parents?.mother?.phone
  ];

  for (const value of values) {
    const phone = String(value || '').replace(/\D/g, '');

    if (phone && !phones.includes(phone)) {
      phones.push(phone);
    }
  }

  return phones;
}

function isAuthorizedParent(student, senderJid) {
  const senderPhone = String(senderJid || '')
    .split('@')[0]
    .replace(/\D/g, '');

  if (!senderPhone) return false;

  const parentPhones = getStudentParentPhones(student);

  return parentPhones.some(phone =>
    phone.endsWith(senderPhone) ||
    senderPhone.endsWith(phone)
  );
}

function getStudentHistory(student) {
  return Array.isArray(student?.history)
    ? student.history
    : [];
}

function formatStudentInfo(student) {
  const history = getStudentHistory(student);

  const retards = history.filter(
    item => normalizeText(item.type) === 'retard'
  );

  const absences = history.filter(
    item => normalizeText(item.type) === 'absence'
  );

  return [
    '╔════════════════════════════╗',
    '      INFORMATIONS ÉLÈVE',
    '╚════════════════════════════╝',
    '',
    `👤 Nom : ${student.name || student.fullName || '-'}`,
    `🏫 Classe : ${student.className || '-'}`,
    '',
    `⏰ Retards enregistrés : ${retards.length}`,
    `📅 Absences enregistrées : ${absences.length}`,
    '',
    'Les informations affichées concernent uniquement votre établissement.'
  ].join('\n');
}


function getRealSenderPhone(message, jid) {
  const candidates = [
    message?.key?.senderPn,
    message?.key?.participantPn
  ];

  for (const candidate of candidates) {
    const normalized =
      paymentSecurity.normalizePhone(
        String(candidate || '')
      );

    if (normalized) {
      return normalized;
    }
  }

  const remote =
    String(jid || '');

  if (
    remote &&
    !remote.includes('@lid')
  ) {
    return paymentSecurity.normalizePhone(
      remote.split('@')[0]
    );
  }

  return '';
}

function getFinancialIdentity(school, phone) {
  const security =
    paymentSecurity.readPaymentSecurity(
      DATA_DIR,
      school
    );

  const registeredPhone =
    paymentSecurity.normalizePhone(
      security.agentPaymentPhone
    );

  const realPhone =
    paymentSecurity.normalizePhone(
      phone
    );

  if (
    !registeredPhone ||
    !realPhone ||
    registeredPhone !== realPhone
  ) {
    return null;
  }

  return {
    type: 'financial_agent',
    phone: registeredPhone,
    security
  };
}

function buildFinancialMenu(school) {
  const schoolName =
    String(
      school?.name ||
      school?.schoolName ||
      'Établissement'
    ).trim();

  return [
    '╔══════════════════════════════╗',
    '          SCHOOL FLOW',
    '       ESPACE FINANCIER',
    '╚══════════════════════════════╝',
    '',
    '🏫 *' + schoolName + '*',
    '',
    '💰 *GESTION FINANCIÈRE*',
    '',
    '1. Tableau financier',
    '2. Paiements',
    '3. Reçus de paiement',
    '4. Soldes scolaires',
    '5. Paiements manquants',
    '6. Modifier mon PIN',
    '7. Aide financière',
    '8. Sécurité et alertes',
    '9. Contacter SCHOOL FLOW',
    '10. 🔓 Débloquer / recommencer',
    '',
    '👉 Répondez simplement avec le numéro correspondant.',
    '',
    '💡 Tapez *menu* pour réafficher ce menu.'
  ].join('\n');
}


async function handleMenuChoice(sock, jid, choice, school, config) {
  clearMenuSession(jid);

  const schoolName = school?.schoolName || 'Établissement';

  switch (choice) {
    case '1':
      return sock.sendMessage(jid, {
        text:
          `🏫 *INFORMATIONS GÉNÉRALES*\n\n` +
          `Bienvenue dans l’espace d’assistance de *${schoolName}*.\n\n` +
          'School Flow permet aux parents de recevoir les informations et communications de leur établissement.'
      });

    case '2':
      return sock.sendMessage(jid, {
        text:
          '📝 *INSCRIPTIONS*\n\n' +
          'Pour connaître les modalités d’inscription, veuillez contacter l’administration de l’établissement.'
      });

    case '3':
      return sock.sendMessage(jid, {
        text:
          '🕐 *HORAIRES*\n\n' +
          'Les horaires de l’établissement peuvent être communiqués par l’administration.'
      });

    case '4':
      return sock.sendMessage(jid, {
        text:
          '📍 *ADRESSE DE L’ÉTABLISSEMENT*\n\n' +
          `${school.address || 'L’adresse n’est pas encore renseignée dans la configuration de l’établissement.'}`
      });

    case '5':
      if (config?.humanContact?.phone) {
        return sock.sendMessage(jid, {
          text:
            '👤 *ASSISTANCE HUMAINE*\n\n' +
            `${config.humanContact.name || 'Assistance de l’établissement'}\n` +
            `📞 ${config.humanContact.phone}`
        });
      }

      return sock.sendMessage(jid, {
        text:
          '👤 *ASSISTANCE HUMAINE*\n\n' +
          'Le numéro d’assistance n’est pas encore configuré par cet établissement.'
      });

    case '6':
      saveMenuSession(jid, 'student-info');

      return sock.sendMessage(jid, {
        text:
          '👤 *INFORMATIONS SUR MON ENFANT*\n\n' +
          'Choisissez votre méthode de recherche :\n\n' +
          '1️⃣ Envoyez directement le *numéro matricule* de votre enfant.\n\n' +
          '2️⃣ Ou envoyez son *nom et sa classe*, séparés par une virgule.\n\n' +
          'Exemple matricule : *12345*\n' +
          'Exemple nom : *Merdy Inatshauya, 6e ETRI*\n\n' +
          '🔐 Votre numéro WhatsApp sera vérifié avant toute communication des informations.'
      });

    case '7':
      return sock.sendMessage(jid, {
        text:
          '📅 *ABSENCES*\n\n' +
          'Pour consulter les absences enregistrées concernant votre enfant, utilisez l’option *6. Informations sur mon enfant*.'
      });

    case '8':
      return sock.sendMessage(jid, {
        text:
          '⏰ *RETARDS*\n\n' +
          'Pour consulter les retards enregistrés concernant votre enfant, utilisez l’option *6. Informations sur mon enfant*.'
      });

    case '9':
      return sock.sendMessage(jid, {
        text:
          '📄 *JUSTIFICATION D’ABSENCE*\n\n' +
          'Veuillez transmettre le justificatif ou contacter l’administration de l’établissement.'
      });

    case '10':
      return sock.sendMessage(jid, {
        text:
          '📘 *RÈGLEMENT DE L’ÉTABLISSEMENT*\n\n' +
          'Pour obtenir le règlement scolaire, veuillez vous rapprocher de l’administration.'
      });

    case '11':
      return sock.sendMessage(jid, {
        text:
          '⚖️ *DISCIPLINE*\n\n' +
          'Pour toute question concernant la discipline ou le comportement d’un élève, veuillez contacter l’administration.'
      });

    case '12':
      return sock.sendMessage(jid, {
        text:
          '📨 *CONVOCATION*\n\n' +
          'Les convocations sont communiquées aux parents par l’établissement.'
      });

    case '13':
      return sock.sendMessage(jid, {
        text:
          '📢 *COMMUNIQUÉS*\n\n' +
          'Les communiqués officiels sont transmis aux parents par School Flow.'
      });

    case '14':
      return sock.sendMessage(jid, {
        text:
          '🗓️ *CALENDRIER SCOLAIRE*\n\n' +
          'Pour connaître les dates importantes, veuillez consulter les communications officielles de l’établissement.'
      });

    case '15':
      return sock.sendMessage(jid, {
        text:
          '📝 *EXAMENS*\n\n' +
          'Les informations relatives aux examens sont communiquées par l’établissement.'
      });

    case '16':
      return sock.sendMessage(jid, {
        text:
          '🎓 *RÉSULTATS SCOLAIRES*\n\n' +
          'Pour obtenir les résultats scolaires, veuillez suivre les communications de l’établissement ou contacter l’administration.'
      });

    case '17':
      return sock.sendMessage(jid, {
        text:
          '🏫 *CLASSES*\n\n' +
          'Pour toute information concernant une classe, veuillez contacter l’administration.'
      });

    case '18':
      return sock.sendMessage(jid, {
        text:
          '👨‍🏫 *ENSEIGNANTS*\n\n' +
          'Pour obtenir des informations concernant les enseignants, veuillez vous adresser à l’administration.'
      });

    case '19':
      schoolFeesSessions.set(jid, {
        schoolId: String(school?.id || ''),
        expiresAt:
          Date.now() +
          10 * 60 * 1000
      });

      return sock.sendMessage(jid, {
        text:
          '💰 *FRAIS SCOLAIRES*\n\n' +
          'Veuillez envoyer :\n\n' +
          '*Nom de l’élève, classe*\n\n' +
          'Exemple : *Merdy Inatshauya, 6e ETRI*\n\n' +
          '🔐 Votre numéro WhatsApp sera vérifié avant l’affichage des informations.'
      });

    case '20': {
      const security =
        paymentSecurity.readPaymentSecurity(
          DATA_DIR,
          school
        );

      const paymentAgentPhone =
        paymentSecurity.normalizePhone(
          security.agentPaymentPhone
        );

      const realSenderPhone =
        paymentSecurity.normalizePhone(
          String(
            message?.key?.senderPn ||
            message?.key?.participantPn ||
            String(jid).split('@')[0] ||
            ''
          )
        );

      if (!paymentAgentPhone) {
        return sock.sendMessage(jid, {
          text:
            '🔒 *ACCÈS AUX PAIEMENTS*\n\n' +
            'Aucun agent de paiement n’est encore enregistré pour cet établissement.\n\n' +
            'La configuration doit être effectuée par un agent SCHOOL FLOW autorisé.'
        });
      }

      if (
        realSenderPhone !== paymentAgentPhone
      ) {
        return sock.sendMessage(jid, {
          text:
            '🚫 *ACCÈS REFUSÉ*\n\n' +
            'Cette section est réservée à l’agent de paiement enregistré par l’établissement.'
        });
      }

      if (!security.configured) {
        return sock.sendMessage(jid, {
          text:
            '🔐 *PAIEMENTS*\n\n' +
            'L’accès aux paiements est bien réservé à votre numéro, mais le code PIN n’est pas encore configuré.\n\n' +
            'Veuillez contacter un agent SCHOOL FLOW autorisé pour terminer la configuration.'
        });
      }

      paymentAccessSessions.set(
        jid,
        {
          schoolId: String(school.id),
          phone: realSenderPhone,
          attempts: 0,
          expiresAt: Date.now() + 5 * 60 * 1000
        }
      );

      return sock.sendMessage(jid, {
        text:
          '🔐 *ACCÈS SÉCURISÉ AUX PAIEMENTS*\n\n' +
          'Numéro reconnu : *AGENT DE PAIEMENT*\n\n' +
          'Veuillez envoyer votre *code PIN à 4 chiffres*.\n\n' +
          '⏱️ Cette demande expire dans 5 minutes.'
      });
    }

    case '21':
      return sock.sendMessage(jid, {
        text:
          '🧾 *REÇU DE PAIEMENT*\n\n' +
          'Les reçus de paiement sont délivrés par l’établissement après enregistrement du paiement.'
      });

    case '22':
      return sock.sendMessage(jid, {
        text:
          '💰 *SOLDE SCOLAIRE*\n\n' +
          'Pour connaître le solde scolaire de votre enfant, veuillez utiliser les services financiers prévus par l’établissement.'
      });

    case '23':
      return sock.sendMessage(jid, {
        text:
          '⚠️ *PAIEMENT MANQUANT*\n\n' +
          'Si un paiement n’apparaît pas encore, veuillez conserver votre preuve de paiement et contacter le service financier.'
      });

    case '24':
      return sock.sendMessage(jid, {
        text:
          '✅ *CONFIRMATION DE PAIEMENT*\n\n' +
          'La confirmation d’un paiement dépend de son enregistrement par l’établissement.'
      });

    case '25':
      return sock.sendMessage(jid, {
        text:
          '📋 *RÉCLAMATION CONCERNANT UN PAIEMENT*\n\n' +
          'Veuillez conserver votre preuve de paiement et contacter le service financier de l’établissement.'
      });

    case '26':
      return sock.sendMessage(jid, {
        text:
          '🏢 *ADMINISTRATION*\n\n' +
          'Pour contacter l’administration, utilisez l’option *5. Contacter l’assistance* ou adressez-vous directement à l’établissement.'
      });

    case '27':
      return sock.sendMessage(jid, {
        text:
          '🛠️ *ASSISTANCE TECHNIQUE*\n\n' +
          'Pour un problème technique avec School Flow, veuillez contacter l’assistance de l’établissement.'
      });

    case '28':
      return sock.sendMessage(jid, {
        text:
          '🔒 *CONFIDENTIALITÉ*\n\n' +
          'Les informations concernant les élèves sont destinées aux parents ou responsables enregistrés et autorisés.'
      });

    case '29':
      return sock.sendMessage(jid, {
        text:
          '🤖 *AIDE SCHOOL FLOW*\n\n' +
          'Tapez */menu* pour afficher toutes les options.\n' +
          'Vous pouvez aussi écrire */contact* pour joindre l’assistance configurée par votre établissement.'
      });

    case '30':
      return sock.sendMessage(jid, {
        text: buildMenu()
      });

    default:
      return sock.sendMessage(jid, {
        text:
          '❌ Option invalide.\n\n' +
          'Veuillez choisir un numéro de *1 à 30* ou taper */menu*.'
      });
  }
}


/* =========================================================
   SCHOOL FLOW — IDENTITÉ PARENT ENREGISTRÉE
   La source d'identité est exclusivement la base de l'école.
   Le nom du profil WhatsApp n'est jamais utilisé.
   ========================================================= */
function findRegisteredParentIdentity(students, phone) {
  const normalizedPhone = paymentSecurity.normalizePhone(
    String(phone || '')
  );

  if (!normalizedPhone || !Array.isArray(students)) {
    return null;
  }

  for (const student of students) {
    const father =
      student?.parents?.father ||
      {};

    const mother =
      student?.parents?.mother ||
      {};

    const fatherPhone = paymentSecurity.normalizePhone(
      String(
        father.phone ||
        student?.fatherPhone ||
        ''
      )
    );

    const motherPhone = paymentSecurity.normalizePhone(
      String(
        mother.phone ||
        student?.motherPhone ||
        ''
      )
    );

    const fatherName =
      String(
        father.name ||
        student?.fatherName ||
        ''
      ).trim();

    const motherName =
      String(
        mother.name ||
        student?.motherName ||
        ''
      ).trim();

    if (
      fatherPhone &&
      fatherPhone === normalizedPhone &&
      fatherName
    ) {
      return {
        type: 'father',
        title: 'Monsieur',
        name: fatherName,
        phone: normalizedPhone,
        student
      };
    }

    if (
      motherPhone &&
      motherPhone === normalizedPhone &&
      motherName
    ) {
      return {
        type: 'mother',
        title: 'Madame',
        name: motherName,
        phone: normalizedPhone,
        student
      };
    }
  }

  return null;
}

function getParentGreeting(identity) {
  if (!identity) {
    return 'Bonjour cher parent';
  }

  return 'Bonjour ' + identity.title + ' ' + identity.name;
}


// SCHOOL_FLOW_CUSTOM_COMMANDS_V1
const schoolFlowCustomCommandSessions = new Map();

function schoolFlowReadCustomCommands() {
  const fs = require('fs');
  const path = require('path');
  const p = path.join(process.cwd(), 'data', 'custom-whatsapp-commands.json');
  if (!fs.existsSync(p)) fs.writeFileSync(p, '{}\n');
  const value = JSON.parse(fs.readFileSync(p, 'utf8'));
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function schoolFlowSaveCustomCommands(commands) {
  const fs = require('fs');
  const path = require('path');
  const p = path.join(process.cwd(), 'data', 'custom-whatsapp-commands.json');
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(commands, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

function schoolFlowNormalizeCommand(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/^\./, '')
    .replace(/[^a-z0-9_-]/g, '');
}


async function handleIncomingMessage(sock, message, schoolId) {
  const devIdentity = devCore.getAgentIdentity(message);
  if (sock && typeof sock.sendMessage === 'function' && !sock.__schoolFlowStyledMessages) {
    const originalSendMessage = sock.sendMessage.bind(sock);

    sock.sendMessage = async (jid, content, options) => {
      if (content && typeof content === 'object') {
        const formatSchoolFlowMessage = (value) => {
          if (typeof value !== 'string' || !value.trim()) return value;

          let body = value.trim();

          // Nettoyage des anciennes signatures finales.
          for (let i = 0; i < 10; i++) {
            const previousBody = body;

            body = body.replace(
              /(?:\r?\n)*(?:[─━═-]{4,}\s*)?(?:School Flow\s*\r?\n)?(?:Développé par NEXORA TECHNOLOGIES|La Direction)\s*$/i,
              ''
            ).trim();

            if (body === previousBody) break;
          }

          const normalized = body.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

          let messageHeading = '✦ NOTIFICATION ✦';

          if (/paiement|pay(e|é)|montant|versement|frais|facture|solde|transaction|recu financier/.test(normalized)) {
            messageHeading = '✦ SERVICE FINANCIER ✦';
          } else if (/retard|en retard|arrivee tardive|arrive tard|heure d'arrivee|absence apres/.test(normalized)) {
            messageHeading = '✦ AVIS DE RETARD ✦';
          }

          return [
            '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
            '       ' + messageHeading,
            '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            '',
            body,
            '',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            'School Flow',
            'Développé par NEXORA TECHNOLOGIES'
          ].join('\n');
        };

        if (typeof content.text === 'string') {
          content = { ...content, text: formatSchoolFlowMessage(content.text) };
        }

        if (typeof content.caption === 'string') {
          content = { ...content, caption: formatSchoolFlowMessage(content.caption) };
        }
      }

      return originalSendMessage(jid, content, options);
    };

    Object.defineProperty(sock, '__schoolFlowStyledMessages', {
      value: true,
      configurable: false
    });
  }

    // SCHOOL FLOW — COMMANDES PERSONNALISÉES
    try {
      const customText = getIncomingText(message).trim();
      const customJid = getSenderJid(message);
      const customPhone = String(devIdentity.phone || '').replace(/\D/g, '');
      const customIsOwner =
        customPhone === '243856868015' &&
        devIdentity.isAgent === true;

      if (customText && customJid) {
        const customSession = schoolFlowCustomCommandSessions.get(customJid);

        if (customIsOwner && customSession) {
          if (/^(annuler|cancel)$/i.test(customText)) {
            schoolFlowCustomCommandSessions.delete(customJid);
            await sock.sendMessage(customJid, {
              text: 'Création annulée.'
            });
            return;
          }

          if (customSession.step === 'name') {
            const commandName = schoolFlowNormalizeCommand(customText);
            if (!commandName || commandName.length < 2 || commandName.length > 32) {
              await sock.sendMessage(customJid, {
                text: 'Nom invalide. Envoie un nom simple, par exemple : vente'
              });
              return;
            }

            const reserved = [
              'ajoutercommande', 'menu', 'admin', 'ecole', 'ecoles',
              'etablissement', 'etablissements', 'annuler'
            ];
            if (reserved.includes(commandName)) {
              await sock.sendMessage(customJid, {
                text: 'Ce nom est réservé. Choisis un autre nom.'
              });
              return;
            }

            customSession.name = commandName;
            customSession.step = 'response';
            schoolFlowCustomCommandSessions.set(customJid, customSession);
            await sock.sendMessage(customJid, {
              text:
                'Nom enregistré : *.' + commandName + '*\n\n' +
                'Maintenant, envoie exactement le texte que cette commande devra afficher.\n' +
                'Envoie *annuler* pour arrêter.'
            });
            return;
          }

          if (customSession.step === 'response') {
            if (customText.length > 3000) {
              await sock.sendMessage(customJid, {
                text: 'Réponse trop longue. Limite : 3000 caractères.'
              });
              return;
            }

            const commands = schoolFlowReadCustomCommands();
            commands[customSession.name] = {
              response: customText,
              createdBy: '243856868015',
              updatedAt: new Date().toISOString()
            };
            schoolFlowSaveCustomCommands(commands);
            schoolFlowCustomCommandSessions.delete(customJid);

            await sock.sendMessage(customJid, {
              text:
                'Commande enregistrée avec succès.\n\n' +
                'Nom : *.' + customSession.name + '*\n' +
                'Utilisation : envoie *.' + customSession.name + '* dans la discussion du bot.\n\n' +
                'Pour en créer une autre, envoie *.ajoutercommande*.'
            });
            return;
          }
        }

        if (customIsOwner && /^\.ajoutercommande$/i.test(customText)) {
          schoolFlowCustomCommandSessions.set(customJid, { step: 'name' });
          await sock.sendMessage(customJid, {
            text:
              '*SCHOOL FLOW — Nouvelle commande*\n\n' +
              '1/2 — Quel sera le nom de la commande ?\n' +
              'Exemple : *vente* (sans le point).\n\n' +
              'Envoie *annuler* pour arrêter.'
          });
          return;
        }

        if (/^\.[a-zA-Z0-9_-]{2,32}$/.test(customText)) {
          const name = schoolFlowNormalizeCommand(customText);
          const commands = schoolFlowReadCustomCommands();
          if (commands[name] && typeof commands[name].response === 'string') {
            await sock.sendMessage(customJid, {
              text: commands[name].response
            });
            return;
          }
        }
      }
    } catch (customCommandError) {
      console.error('SCHOOL FLOW — ERREUR COMMANDE PERSONNALISÉE :', customCommandError);
    }

  try {
    // =========================================================
    // SCHOOL FLOW — DEV CORE
    // Les agents autorisés utilisent un canal développeur
    // séparé du fonctionnement scolaire normal.
    // =========================================================

    // =========================================================
    console.log('🧪 IDENTITÉ WHATSAPP BRUTE —', JSON.stringify({
  remoteJid: message?.key?.remoteJid || '',
  senderLid: message?.key?.senderLid || '',
  senderPn: message?.key?.senderPn || '',
  participant: message?.key?.participant || '',
  participantLid: message?.key?.participantLid || '',
  participantPn: message?.key?.participantPn || ''
}));

    /*
     * SCHOOL FLOW - GESTION ETABLISSEMENTS
     * Les commandes ecole et etablissement
     * utilisent le gestionnaire des etablissements.
     *
     * La commande schools reste reservee au DEV CORE.
     */
    const incomingTextForSchoolManager =
      getIncomingText(message).trim();

    const normalizedForSchoolManager =
      normalizeText(incomingTextForSchoolManager);

    const isSchoolManagerCommand =
      normalizedForSchoolManager === 'ecole' ||
      normalizedForSchoolManager === 'ecoles' ||
      normalizedForSchoolManager === 'etablissement' ||
      normalizedForSchoolManager === 'etablissements';

    const schoolManagerJid =
      getSenderJid(message);

    const hasSchoolManagerSession =
      schoolAgentManagerSessions.has(schoolManagerJid);

    if (
      devIdentity.isAgent &&
      (isSchoolManagerCommand || hasSchoolManagerSession)
    ) {
      return handleSchoolAgentManager(
        sock,
        schoolManagerJid,
        incomingTextForSchoolManager
      );
    }


    console.log(
      '🧪 DEV CORE ROUTAGE —',
      'phone=', devIdentity.phone || 'VIDE',
      '| isAgent=', devIdentity.isAgent,
      '| remoteJid=', message?.key?.remoteJid || 'VIDE',
      '| participant=', message?.key?.participant || 'VIDE',
      '| fromMe=', message?.key?.fromMe
    );

    if (devIdentity.isAgent) {
  const devJid = getSenderJid(message);
  const devText = getIncomingText(message).trim();
  const devCommand = devCore.classifyCommand(devText);
  const normalizedDevText = devText.toLowerCase().trim();

  console.log(
    '🧑‍💻 SCHOOL FLOW DEV CORE —',
    devIdentity.agent?.name || 'Agent',
    '|',
    devIdentity.phone,
    '|',
    devCommand
  );

  if (!devText) {
    return;
  }

  /*
   * CONTACT
   */
  if (
    devCommand === 'contact' ||
    normalizedDevText === 'contacter'
  ) {
    return sock.sendMessage(devJid, {
      text: devCore.getOfficialContact()
    });
  }

  /*
   * MENU
   */
  if (devCommand === 'menu') {
    return sock.sendMessage(devJid, {
      text: devCore.getAgentMenu(devIdentity.agent)
    });
  }

  /*
   * AIDE
   */
  if (devCommand === 'help') {
    return sock.sendMessage(devJid, {
      text: devCore.getAgentHelp()
    });
  }

  /*
   * SALUTATION
   */
  if (devCommand === 'greeting') {
    return sock.sendMessage(devJid, {
      text: devCore.getAgentGreeting(devIdentity.agent)
    });
  }

  /*
   * ECOLES
   */
  if (
    devCommand === 'schools' ||
    normalizedDevText === 'ecole' ||
    normalizedDevText === 'ecoles' ||
    normalizedDevText === 'établissement' ||
    normalizedDevText === 'établissements'
  ) {
    try {
      return sock.sendMessage(devJid, {
        text: devCore.formatSchoolsOverview(DATA_DIR)
      });
    } catch (error) {
      console.error(
        'DEV CORE — SCHOOLS ERROR:',
        error.message
      );

      return sock.sendMessage(devJid, {
        text:
          'SCHOOL FLOW — ÉTABLISSEMENTS\n\n' +
          'Impossible de charger la liste actuellement.\n\n' +
          'Erreur : ' + error.message
      });
    }
  }

  /*
   * STATUS
   */
  if (devCommand === 'status') {
    let whatsappStatus = {
      status: 'unknown',
      connected: false
    };

    try {
      const connection = require('./connection');

      if (
        typeof connection.getWhatsAppStatus ===
        'function'
      ) {
        whatsappStatus =
          connection.getWhatsAppStatus();
      }
    } catch (error) {
      console.error(
        'DEV CORE — STATUS ERROR:',
        error.message
      );
    }

    return sock.sendMessage(devJid, {
      text: devCore.formatAgentStatus(
        whatsappStatus,
        DATA_DIR
      )
    });
  }

  /*
   * WHATSAPP
   */
  if (devCommand === 'whatsapp') {
    try {
      const connection = require('./connection');

      const status =
        typeof connection.getWhatsAppStatus ===
        'function'
          ? connection.getWhatsAppStatus()
          : {
              status: 'unknown',
              connected: false
            };

      return sock.sendMessage(devJid, {
        text: [
          '╔════════════════════════════════════╗',
          '║       SCHOOL FLOW — WHATSAPP      ║',
          '╚════════════════════════════════════╝',
          '',
          'STATUT : ' +
            String(status.status || 'unknown'),
          'CONNECTÉ : ' +
            (status.connected ? 'OUI' : 'NON'),
          '',
          'Connexion WhatsApp vérifiée.',
          'Aucune modification automatique.'
        ].join('\n')
      });
    } catch (error) {
      return sock.sendMessage(devJid, {
        text:
          'SCHOOL FLOW — WHATSAPP\n\n' +
          'Impossible de lire le statut.\n' +
          error.message
      });
    }
  }

  /*
   * DIAGNOSTIC
   */
  if (devCommand === 'diagnostic') {
    let whatsappStatus = {
      status: 'unknown',
      connected: false
    };

    try {
      const connection = require('./connection');

      if (
        typeof connection.getWhatsAppStatus ===
        'function'
      ) {
        whatsappStatus =
          connection.getWhatsAppStatus();
      }
    } catch (_) {}

    let configStatus = null;

    try {
      if (
        typeof devCore.getInternalAgentConfigStatus ===
        'function'
      ) {
        configStatus =
          devCore.getInternalAgentConfigStatus();
      }
    } catch (_) {}

    return sock.sendMessage(devJid, {
      text: [
        '╔════════════════════════════════════╗',
        '║      SCHOOL FLOW — DIAGNOSTIC     ║',
        '╚════════════════════════════════════╝',
        '',
        'DEV CORE',
        '  Agent : ' +
          (devIdentity.agent?.name || 'Inconnu'),
        '  Téléphone : ' +
          (devIdentity.phone || 'Inconnu'),
        '  Authentifié : OUI',
        '',
        'WHATSAPP',
        '  Statut : ' +
          String(whatsappStatus.status || 'unknown'),
        '  Connecté : ' +
          (whatsappStatus.connected ? 'OUI' : 'NON'),
        '',
        'AGENTS INTERNES',
        configStatus
          ? '  Actifs : ' +
            String(
              configStatus.activeCount ??
              configStatus.agentCount ??
              0
            )
          : '  Configuration : disponible',
        '',
        'Diagnostic terminé.'
      ].join('\n')
    });
  }

  /*
   * MODULES
   */
  if (devCommand === 'modules') {
    return sock.sendMessage(devJid, {
      text: [
        '╔════════════════════════════════════╗',
        '║       SCHOOL FLOW — MODULES       ║',
        '╚════════════════════════════════════╝',
        '',
        '✓ WhatsApp',
        '✓ Parents',
        '✓ Élèves',
        '✓ Classes',
        '✓ Convocations',
        '✓ Communiqués',
        '✓ Retards',
        '✓ Paiements',
        '✓ Agents',
        '✓ DEV CORE',
        '✓ Sécurité',
        '',
        'Les modules sont actuellement chargés',
        'sans modification automatique.'
      ].join('\n')
    });
  }

  /*
   * INTERFACE
   */
  if (devCommand === 'interface') {
    return sock.sendMessage(devJid, {
      text: [
        'SCHOOL FLOW — INTERFACE',
        '',
        'Interface web : DISPONIBLE',
        'Serveur : Express / Node.js',
        'Port attendu : 3000',
        '',
        'DEV CORE : ACTIF',
        'WhatsApp : module chargé',
        '',
        'Commande de diagnostic terminée.'
      ].join('\n')
    });
  }

  /*
   * CONFIGURATION
   */
  if (devCommand === 'configuration') {
    try {
      const status =
        typeof devCore.getInternalAgentConfigStatus ===
        'function'
          ? devCore.getInternalAgentConfigStatus()
          : null;

      return sock.sendMessage(devJid, {
        text: [
          '╔════════════════════════════════════╗',
          '║     SCHOOL FLOW — CONFIGURATION   ║',
          '╚════════════════════════════════════╝',
          '',
          'DEV CORE : ACTIF',
          'Agents enregistrés : ' +
            String(status?.agentCount ?? 'N/D'),
          'Agents actifs : ' +
            String(status?.activeCount ?? 'N/D'),
          'Mises à jour distantes : ' +
            (status?.allowRemoteUpdates
              ? 'AUTORISÉES'
              : 'DÉSACTIVÉES'),
          'Confirmation modifications : ' +
            (status?.requireConfirmationForChanges
              ? 'REQUISE'
              : 'NON REQUISE'),
          '',
          'Configuration chargée avec succès.'
        ].join('\n')
      });
    } catch (error) {
      return sock.sendMessage(devJid, {
        text:
          'SCHOOL FLOW — CONFIGURATION\n\n' +
          'Erreur : ' + error.message
      });
    }
  }

  /*
   * GESTION DES AGENTS INTERNES
   */
  if (
    devCommand === 'agents' ||
    normalizedDevText.startsWith('agents ')
  ) {
    const parts = devText.trim().split(/\\s+/);
    const action =
      (parts[1] || 'list').toLowerCase();

    if (
      !devIdentity.agent?.permissions?.includes(
        'agents.manage'
      )
    ) {
      return sock.sendMessage(devJid, {
        text:
          '🚫 ACCÈS REFUSÉ\n\n' +
          'La gestion des agents internes est réservée ' +
          'aux agents SCHOOL FLOW disposant de la ' +
          'permission agents.manage.'
      });
    }

    /*
     * LIST
     */
    if (
      action === 'list' ||
      action === 'liste'
    ) {
      try {
        const status =
          typeof devCore.getInternalAgentConfigStatus ===
          'function'
            ? devCore.getInternalAgentConfigStatus()
            : null;

        const agents =
          status?.agents ||
          (
            typeof devCore.loadInternalAgents ===
            'function'
              ? devCore.loadInternalAgents()
              : []
          );

        if (!Array.isArray(agents) || !agents.length) {
          return sock.sendMessage(devJid, {
            text:
              'SCHOOL FLOW — AGENTS INTERNES\n\n' +
              'Aucun agent enregistré.'
          });
        }

        const lines = [
          '╔════════════════════════════════════╗',
          '║      AGENTS INTERNES SCHOOL FLOW  ║',
          '╚════════════════════════════════════╝',
          ''
        ];

        agents.forEach((agent, index) => {
          lines.push(
            (index + 1) + '. ' +
            String(agent.name || 'Sans nom')
          );
          lines.push(
            '   Téléphone : ' +
            String(agent.phone || 'N/D')
          );
          lines.push(
            '   Rôle : ' +
            String(agent.role || 'N/D')
          );
          lines.push(
            '   Niveau : ' +
            String(agent.level || 'standard')
          );
          lines.push(
            '   Statut : ' +
            (agent.active ? 'ACTIF' : 'INACTIF')
          );
          lines.push('');
        });

        return sock.sendMessage(devJid, {
          text: lines.join('\n')
        });
      } catch (error) {
        return sock.sendMessage(devJid, {
          text:
            'SCHOOL FLOW — AGENTS\n\n' +
            'Erreur : ' + error.message
        });
      }
    }

    /*
     * AJOUT
     * Format :
     * agents add | téléphone | nom | rôle | niveau
     */
    if (
      action === 'add' ||
      action === 'ajouter'
    ) {
      const data = devText
        .split('|')
        .map(v => v.trim());

      if (data.length < 5) {
        return sock.sendMessage(devJid, {
          text: [
            'SCHOOL FLOW — AJOUT AGENT',
            '',
            'Format :',
            'agents add | téléphone | nom | rôle | niveau',
            '',
            'Exemple :',
            'agents add | 243900000000 | JEAN | support | standard'
          ].join('\n')
        });
      }

      try {
        if (
          typeof devCore.addInternalAgent !==
          'function'
        ) {
          throw new Error(
            'Fonction addInternalAgent indisponible.'
          );
        }

        const result =
          devCore.addInternalAgent({
            phone: data[1],
            name: data[2],
            role: data[3],
            level: data[4],
            active: true,
            permissions: []
          });

        return sock.sendMessage(devJid, {
          text: [
            '✅ AGENT INTERNE AJOUTÉ',
            '',
            'Nom : ' + data[2],
            'Téléphone : ' + data[1],
            'Rôle : ' + data[3],
            'Niveau : ' + data[4],
            '',
            'Configuration enregistrée.'
          ].join('\n')
        });
      } catch (error) {
        return sock.sendMessage(devJid, {
          text:
            '❌ AJOUT IMPOSSIBLE\n\n' +
            error.message
        });
      }
    }

    /*
     * ACTIVATION / DÉSACTIVATION
     * agents activate | téléphone
     * agents deactivate | téléphone
     */
    if (
      action === 'activate' ||
      action === 'activer' ||
      action === 'deactivate' ||
      action === 'desactiver'
    ) {
      const data = devText
        .split('|')
        .map(v => v.trim());

      if (data.length < 2) {
        return sock.sendMessage(devJid, {
          text:
            'Format :\n' +
            'agents activate | téléphone\n' +
            'ou\n' +
            'agents deactivate | téléphone'
        });
      }

      try {
        if (
          typeof devCore.setInternalAgentActive !==
          'function'
        ) {
          throw new Error(
            'Fonction setInternalAgentActive indisponible.'
          );
        }

        devCore.setInternalAgentActive(
          data[1],
          action === 'activate' ||
          action === 'activer'
        );

        return sock.sendMessage(devJid, {
          text:
            '✅ AGENT MIS À JOUR\n\n' +
            'Téléphone : ' + data[1] + '\n' +
            'Statut : ' +
            (
              action === 'activate' ||
              action === 'activer'
                ? 'ACTIF'
                : 'INACTIF'
            )
        });
      } catch (error) {
        return sock.sendMessage(devJid, {
          text:
            '❌ OPÉRATION IMPOSSIBLE\n\n' +
            error.message
        });
      }
    }

    /*
     * SUPPRESSION
     * agents remove | téléphone
     */
    if (
      action === 'remove' ||
      action === 'supprimer'
    ) {
      const data = devText
        .split('|')
        .map(v => v.trim());

      if (data.length < 2) {
        return sock.sendMessage(devJid, {
          text:
            'Format : agents remove | téléphone'
        });
      }

      try {
        if (
          typeof devCore.removeInternalAgent !==
          'function'
        ) {
          throw new Error(
            'Fonction removeInternalAgent indisponible.'
          );
        }

        devCore.removeInternalAgent(data[1]);

        return sock.sendMessage(devJid, {
          text:
            '✅ AGENT SUPPRIMÉ\n\n' +
            'Téléphone : ' + data[1]
        });
      } catch (error) {
        return sock.sendMessage(devJid, {
          text:
            '❌ SUPPRESSION IMPOSSIBLE\n\n' +
            error.message
        });
      }
    }

    /*
     * MODIFICATION
     * agents update | téléphone | champ | valeur
     */
    if (
      action === 'update' ||
      action === 'modifier'
    ) {
      const data = devText
        .split('|')
        .map(v => v.trim());

      if (data.length < 4) {
        return sock.sendMessage(devJid, {
          text: [
            'Format :',
            'agents update | téléphone | champ | valeur',
            '',
            'Champs :',
            'name',
            'phone',
            'role',
            'level'
          ].join('\n')
        });
      }

      try {
        if (
          typeof devCore.updateInternalAgent !==
          'function'
        ) {
          throw new Error(
            'Fonction updateInternalAgent indisponible.'
          );
        }

        devCore.updateInternalAgent(
          data[1],
          {
            [data[2]]: data[3]
          }
        );

        return sock.sendMessage(devJid, {
          text: [
            '✅ AGENT MODIFIÉ',
            '',
            'Téléphone : ' + data[1],
            'Champ : ' + data[2],
            'Nouvelle valeur : ' + data[3],
            '',
            'Modification enregistrée.'
          ].join('\n')
        });
      } catch (error) {
        return sock.sendMessage(devJid, {
          text:
            '❌ MODIFICATION IMPOSSIBLE\n\n' +
            error.message
        });
      }
    }

    return sock.sendMessage(devJid, {
      text: [
        'SCHOOL FLOW — GESTION DES AGENTS',
        '',
        'Commandes :',
        '',
        'agents list',
        'agents add | téléphone | nom | rôle | niveau',
        'agents update | téléphone | champ | valeur',
        'agents activate | téléphone',
        'agents deactivate | téléphone',
        'agents remove | téléphone'
      ].join('\n')
    });
  }

  /*
   * UPDATE
   * Sécurisé : ne télécharge ni n'exécute aucun code.
   */
  if (devCommand === 'update') {
    return sock.sendMessage(devJid, {
      text: [
        'SCHOOL FLOW — MISE À JOUR',
        '',
        'État : CONTRÔLE DISPONIBLE',
        '',
        'Les mises à jour distantes automatiques',
        'sont désactivées pour des raisons de sécurité.',
        '',
        'Aucun code externe n’a été téléchargé',
        'ou exécuté.'
      ].join('\n')
    });
  }

  /*
   * RESTART
   * Redémarre uniquement la connexion WhatsApp,
   * pas le serveur Node.js.
   */
  if (devCommand === 'restart') {
    try {
      const connection = require('./connection');

      if (
        typeof connection.disconnectWhatsApp ===
        'function'
      ) {
        await connection.disconnectWhatsApp();
      }

      if (
        typeof connection.startWhatsApp ===
        'function'
      ) {
        setTimeout(() => {
          connection
            .startWhatsApp()
            .catch(error =>
              console.error(
                'DEV CORE — RESTART WHATSAPP ERROR:',
                error.message
              )
            );
        }, 1500);
      }

      return sock.sendMessage(devJid, {
        text: [
          'SCHOOL FLOW — RESTART',
          '',
          'Redémarrage de la connexion WhatsApp lancé.',
          '',
          'Le serveur Node.js n’a pas été arrêté.'
        ].join('\n')
      });
    } catch (error) {
      return sock.sendMessage(devJid, {
        text:
          '❌ RESTART IMPOSSIBLE\n\n' +
          error.message
      });
    }
  }

  /*
   * COMMANDE INCONNUE
   */
  return sock.sendMessage(devJid, {
    text: [
      'SCHOOL FLOW — DEV CORE',
      '',
      'Commande non reconnue.',
      '',
      'Tapez menu pour afficher les commandes disponibles.'
    ].join('\n')
  });
}

    if (!message || message.key?.fromMe) return;
    if (!message || message.key?.fromMe) return;

    const jid = getSenderJid(message);
  
  // SCHOOL FLOW — CONTACT OFFICIEL 243900969383
  const schoolFlowContactText =
    normalizeText(getIncomingText(message));

  if (
    schoolFlowContactText === 'contacter school flow' ||
    schoolFlowContactText === 'contacter schoolflow' ||
    schoolFlowContactText === 'contact school flow' ||
    schoolFlowContactText === 'contact schoolflow'
  ) {
    return sock.sendMessage(jid, {
      text:
        '📞 *CONTACTER SCHOOL FLOW*\\n\\n' +
        'Pour toute assistance ou demande concernant SCHOOL FLOW :\\n\\n' +
        '📱 *Contact officiel :*\\n' +
        '+243 900 969 383\\n\\n' +
        '💬 *WhatsApp :*\\n' +
        'https://wa.me/243900969383\\n\\n' +
        '👉 Cliquez sur le lien pour contacter directement SCHOOL FLOW.'
    });
  }


    if (!jid || jid === 'status@broadcast') return;

    // SCHOOL FLOW : MODE PRIVÉ UNIQUEMENT
    // Les groupes WhatsApp sont totalement ignorés.
    /* SCHOOL_FLOW_PRIVATE_ONLY_V1 */
const isGroupMessage =
  String(message?.key?.remoteJid || '').endsWith('@g.us');

if (isGroupMessage) {
  return;
}

    const text = getIncomingText(message);

    if (!text) return;

    const normalized = normalizeText(text);

    const school = getActiveSchool(schoolId);

    if (!school) {
      console.error('BOT: aucun établissement actif.');
      return;
    }

    const config = getBotConfig(school);

    if (!config || config.enabled !== true) return;

    // Numéro WhatsApp réel déjà extrait depuis senderPn.
    // La recherche est strictement limitée aux élèves de cette école.
    const schoolStudents = getSchoolStudents(school);

    const parentPhone =
      paymentSecurity.normalizePhone(
        String(
          message?.key?.senderPn ||
          message?.key?.participantPn ||
          String(jid).split('@')[0] ||
          ''
        )
      );

    const parentIdentity =
      findRegisteredParentIdentity(
        schoolStudents,
        parentPhone
      );

    const parentJid =
      parentPhone
        ? parentPhone + '@s.whatsapp.net'
        : jid;

    console.log(
      '👤 SCHOOL FLOW — IDENTITÉ PARENT :',
      parentIdentity
        ? parentIdentity.title + ' ' + parentIdentity.name
        : 'NON ENREGISTRÉ',
      '| téléphone =',
      parentPhone || 'VIDE',
      '| école =',
      school.id
    );



    // SCHOOL FLOW — SCHOOL ADMIN
    // Verification des agents de l'etablissement.
    // Cette verification arrive avant le traitement parent.
    // =========================================================

    const schoolAgentIdentity =
      devCore.getSchoolAgentIdentity(message);

    if (schoolAgentIdentity.isAgent) {
      const schoolAgentJid = getSenderJid(message);
      const schoolAgentText = getIncomingText(message);

      console.log(
        'SCHOOL FLOW SCHOOL ADMIN — AGENT :',
        schoolAgentIdentity.agent?.name || 'Agent',
        '|',
        schoolAgentIdentity.phone,
        '| ROLE :',
        schoolAgentIdentity.agent?.role || 'INCONNU',
        '| SCHOOL :',
        schoolAgentIdentity.agent?.schoolId || 'INCONNUE'
      );

      if (!schoolAgentText) return;

      const normalizedSchoolAgentText =
        normalizeText(schoolAgentText);

      const schoolAgentRole =
        normalizeText(
          schoolAgentIdentity.agent?.role || ''
        );

      /*
       * IMPORTANT :
       * Un agent financier ne doit JAMAIS être intercepté
       * par l'espace ADMINISTRATION.
       *
       * Il continue vers le ROUTAGE FINANCIER plus bas.
       */
      if (schoolAgentRole === 'financier') {
        console.log(
          '💰 SCHOOL FLOW — AGENT FINANCIER DETECTE :',
          schoolAgentIdentity.agent?.name || 'Agent',
          '| téléphone =',
          schoolAgentIdentity.phone
        );
      } else {
        if (
          normalizedSchoolAgentText === 'menu' ||
          normalizedSchoolAgentText === 'aide' ||
          normalizedSchoolAgentText === 'admin' ||
          normalizedSchoolAgentText === 'administration'
        ) {
          return sock.sendMessage(schoolAgentJid, {
            text: devCore.getSchoolAgentMenu(
              schoolAgentIdentity.agent
            )
          });
        }

        return sock.sendMessage(schoolAgentJid, {
          text:
            '*SCHOOL FLOW // ADMINISTRATION*\n\n' +
            'Commande reçue.\n\n' +
            'Tapez *menu* pour afficher les outils de votre établissement.'
        });
      }
    }



    // =========================================================
    // SCHOOL FLOW — VERIFICATION ACCES ZONE PAIEMENTS
    // =========================================================

    const paymentAccessSession =
      paymentAccessSessions.get(jid);

    if (
      paymentAccessSession &&
      paymentAccessSession.schoolId ===
        String(school.id)
    ) {
      if (
        paymentAccessSession.expiresAt <=
        Date.now()
      ) {
        paymentAccessSessions.delete(jid);

        return sock.sendMessage(jid, {
          text:
            '⏱️ *ACCÈS PAIEMENTS EXPIRÉ*\n\n' +
            'Veuillez recommencer depuis l’option *20. Paiements*.'
        });
      }

      const securityForAccess =
        paymentSecurity.readPaymentSecurity(
          DATA_DIR,
          school
        );

      const realSenderPhone =
        paymentSecurity.normalizePhone(
          String(
            parentPhone ||
            message?.key?.senderPn ||
            message?.key?.participantPn ||
            String(jid).split('@')[0] ||
            ''
          )
        );

      const registeredPaymentPhone =
        paymentSecurity.normalizePhone(
          securityForAccess.agentPaymentPhone
        );

      if (
        !registeredPaymentPhone ||
        realSenderPhone !== registeredPaymentPhone ||
        realSenderPhone !== paymentAccessSession.phone
      ) {
        paymentAccessSessions.delete(jid);

        return sock.sendMessage(jid, {
          text:
            '🚫 *ACCÈS REFUSÉ*\n\n' +
            'Votre numéro ne correspond pas à l’agent de paiement enregistré.'
        });
      }

      if (
        !paymentSecurity.validPin(
          text.trim()
        )
      ) {
        return sock.sendMessage(jid, {
          text:
            '⚠️ *CODE INVALIDE*\n\n' +
            'Veuillez envoyer exactement *4 chiffres*.'
        });
      }

      if (
        paymentSecurity.verifyPin(
          text.trim(),
          securityForAccess
        )
      ) {
        paymentAccessSessions.delete(jid);

        return sock.sendMessage(jid, {
          text:
            '✅ *ACCÈS AUTORISÉ*\n\n' +
            'Bienvenue dans la zone sécurisée des *paiements*.\n\n' +
            '🔓 Votre identité d’agent de paiement a été vérifiée.\n' +
            '🔐 Votre code PIN a été validé.\n\n' +
            'La gestion des opérations de paiement peut maintenant être utilisée.'
        });
      }

      paymentAccessSession.attempts =
        Number(paymentAccessSession.attempts || 0) + 1;

      if (
        paymentAccessSession.attempts >= 3
      ) {

        await paymentAlerts.notifyPaymentAgent(
          sock,
          DATA_DIR,
          school,
          securityForAccess,
          {
            source: 'whatsapp',
            event: 'payment_access_failed',
            phone: realSenderPhone,
            attempts:
              paymentAccessSession.attempts,
            reason:
              'Trois codes PIN incorrects'
          }
        );

      paymentAccessSessions.delete(jid);

        return sock.sendMessage(jid, {
          text:
            '🚫 *ACCÈS BLOQUÉ*\n\n' +
            'Trois codes incorrects ont été saisis.\n\n' +
            'Veuillez recommencer depuis *20. Paiements*.'
        });
      }

      paymentAccessSessions.set(
        jid,
        paymentAccessSession
      );

      return sock.sendMessage(jid, {
        text:
          '❌ *CODE INCORRECT*\n\n' +
          'Code PIN incorrect.\n' +
          'Tentative ' +
          paymentAccessSession.attempts +
          '/3.'
      });
    }

    // =========================================================
    // SCHOOL FLOW — GESTION SECURISEE DU CODE PAIEMENT
    // =========================================================

    const senderPhone =
      paymentSecurity.normalizePhone(
        String(
          parentPhone ||
          message?.key?.senderPn ||
          message?.key?.participantPn ||
          String(jid).split('@')[0] ||
          ''
        )
      );

    const security =
      paymentSecurity.readPaymentSecurity(
        DATA_DIR,
        school
      );

    const paymentCommand =
      normalized === 'changer code paiement' ||
      normalized === 'change code paiement' ||
      normalized === 'modifier code paiement' ||
      normalized === '/code-paiement' ||
      normalized === '/changer-code-paiement' ||
      normalized === '.code-paiement';

    if(paymentCommand){

      if(
        !security.configured
      ){
        return sock.sendMessage(jid, {
          text:
            '🔒 *CODE PAIEMENT*\n\n' +
            'Le code paiement n’est pas encore configuré dans les paramètres de l’établissement.'
        });
      }

      if(
        senderPhone !==
        paymentSecurity.normalizePhone(
          security.agentPaymentPhone
        )
      ){
        return sock.sendMessage(jid, {
          text:
            '🚫 *ACCÈS REFUSÉ*\n\n' +
            'Cette opération est réservée à l’agent de paiement enregistré par l’établissement.'
        });
      }

      paymentPinSessions.set(
        jid,
        {
          schoolId: String(
            school.id
          ),
          step: 'old',
          expiresAt:
            Date.now() +
            5 * 60 * 1000
        }
      );

      return sock.sendMessage(jid, {
        text:
          '🔐 *MODIFICATION DU CODE PAIEMENT*\n\n' +
          'Veuillez envoyer votre *ancien code à 4 chiffres*.'
      });
    }

    const paymentPinSession =
      paymentPinSessions.get(jid);

    if(
      paymentPinSession &&
      paymentPinSession.schoolId ===
        String(school.id)
    ){

      if(
        paymentPinSession.expiresAt <=
        Date.now()
      ){
        paymentPinSessions.delete(jid);

        return sock.sendMessage(jid, {
          text:
            '⏱️ La demande a expiré.\n\n' +
            'Veuillez recommencer avec *code paiement*.'
        });
      }

      const securityNow =
        paymentSecurity.readPaymentSecurity(
          DATA_DIR,
          school
        );

      if(
        paymentPinSession.step === 'old'
      ){

        if(
          !paymentSecurity.verifyPin(
            text.trim(),
            securityNow
          )
        ){
          return sock.sendMessage(jid, {
            text:
              '❌ *Ancien code incorrect.*\n\n' +
              'Veuillez réessayer avec votre ancien code à 4 chiffres.'
          });
        }

        paymentPinSession.step =
          'new';

        paymentPinSession.expiresAt =
          Date.now() +
          5 * 60 * 1000;

        paymentPinSessions.set(
          jid,
          paymentPinSession
        );

        return sock.sendMessage(jid, {
          text:
            '✅ Ancien code vérifié.\n\n' +
            'Veuillez maintenant envoyer le *nouveau code à 4 chiffres*.'
        });
      }

      if(
        paymentPinSession.step === 'new'
      ){

        const newPin =
          String(
            text || ''
          ).trim();

        if(
          !paymentSecurity.validPin(
            newPin
          )
        ){
          return sock.sendMessage(jid, {
            text:
              '⚠️ Le nouveau code doit contenir exactement *4 chiffres*.'
          });
        }

        const hashed =
          paymentSecurity.hashPin(
            newPin
          );

        paymentSecurity.savePaymentSecurity(
          DATA_DIR,
          school,
          {
            agentPaymentPhone:
              securityNow.agentPaymentPhone,
            agentDisciplinePhone:
              securityNow.agentDisciplinePhone,
            pinHash:
              hashed.hash,
            pinSalt:
              hashed.salt
          }
        );

        paymentPinSessions.delete(
          jid
        );

        return sock.sendMessage(jid, {
          text:
            '✅ *CODE PAIEMENT MODIFIÉ*\n\n' +
            'Votre nouveau code paiement a été enregistré avec succès.\n\n' +
            'Il sera nécessaire pour accéder à la gestion des paiements.'
        });
      }
    }

    // =========================================================
    // SCHOOL FLOW — ROUTAGE FINANCIER
    // =========================================================
    const financialPhone =
      getRealSenderPhone(
        message,
        jid
      );

    const financialSecurity =
      paymentSecurity.readPaymentSecurity(
        DATA_DIR,
        school
      );

    const schoolAgentIsFinancial =
      schoolAgentIdentity.isAgent &&
      normalizeText(
        schoolAgentIdentity.agent?.role || ''
      ) === 'financier';

    const financialIdentity =
      getFinancialIdentity(
        school,
        financialPhone
      ) ||
      (
        schoolAgentIsFinancial
          ? {
              type: 'financial_agent',
              phone: financialPhone,
              security: financialSecurity
            }
          : null
      );

    if (financialIdentity) {
      console.log(
        '💰 SCHOOL FLOW — IDENTITÉ FINANCIÈRE :',
        'AGENT DE PAIEMENT',
        '| téléphone =',
        financialPhone,
        '| école =',
        school.id
      );

      if (
        normalized === 'menu' ||
        normalized === '/menu' ||
        normalized === '.menu'
      ) {
        clearMenuSession(jid);

        return sock.sendMessage(jid, {
          text:
            buildFinancialMenu(school)
        });
      }

      if (
        normalized === 'aide' ||
        normalized === '/aide' ||
        normalized === '.aide'
      ) {
        return sock.sendMessage(jid, {
          text:
            '💰 *AIDE FINANCIÈRE — SCHOOL FLOW*\n\n' +
            'Vous êtes reconnu comme *agent de paiement*.\n\n' +
            'Utilisez *menu* pour afficher vos fonctions financières.\n\n' +
            '🔐 Les opérations sensibles restent protégées par votre code PIN.'
        });
      }

      if (/^(?:[1-9]|10)$/.test(normalized)) {
        switch (normalized) {

          case '1':
            return sock.sendMessage(jid, {
              text:
                '📊 *TABLEAU FINANCIER*\n\n' +
                'Accès financier sécurisé confirmé.\n\n' +
                'Les données financières de cet établissement sont accessibles uniquement à l’agent de paiement autorisé.'
            });

          case '2':
            return sock.sendMessage(jid, {
              text:
                '💳 *PAIEMENTS*\n\n' +
                'Vous êtes reconnu comme agent de paiement.\n\n' +
                '🔐 Une vérification par code PIN est requise pour accéder à la gestion des paiements.'
            });

          case '3':
            return sock.sendMessage(jid, {
              text:
                '🧾 *REÇUS DE PAIEMENT*\n\n' +
                'La consultation des reçus financiers est réservée à l’agent de paiement autorisé.'
            });

          case '4':
            return sock.sendMessage(jid, {
              text:
                '💰 *SOLDES SCOLAIRES*\n\n' +
                'La consultation des soldes est réservée à l’agent financier enregistré.'
            });

          case '5':
            return sock.sendMessage(jid, {
              text:
                '⚠️ *PAIEMENTS MANQUANTS*\n\n' +
                'Cette fonction est réservée à l’espace financier de l’établissement.'
            });

          case '6':
            if (
              !financialIdentity.security.configured
            ) {
              return sock.sendMessage(jid, {
                text:
                  '🔒 *MODIFICATION DU PIN*\n\n' +
                  'Le code PIN financier n’est pas encore configuré.'
              });
            }

            paymentPinSessions.set(
              jid,
              {
                schoolId:
                  String(school.id),
                step: 'old',
                expiresAt:
                  Date.now() +
                  5 * 60 * 1000
              }
            );

            return sock.sendMessage(jid, {
              text:
                '🔐 *MODIFICATION DU CODE PIN*\n\n' +
                'Identité confirmée : *AGENT DE PAIEMENT*.\n\n' +
                'Veuillez envoyer votre *ancien code à 4 chiffres*.\n\n' +
                '⏱️ Cette demande expire dans 5 minutes.'
            });

          case '7':
            return sock.sendMessage(jid, {
              text:
                '🆘 *AIDE FINANCIÈRE*\n\n' +
                'Vous pouvez utiliser le menu financier pour consulter les paiements, reçus, soldes et paiements manquants.\n\n' +
                'Pour une assistance technique, utilisez *9. Contacter SCHOOL FLOW*.'
            });

          case '8':
            return sock.sendMessage(jid, {
              text:
                '🔐 *SÉCURITÉ FINANCIÈRE*\n\n' +
                'Votre numéro est reconnu comme *agent de paiement autorisé*.\n\n' +
                'Les tentatives incorrectes sur les fonctions sensibles sont surveillées et peuvent générer une alerte de sécurité.'
            });

          case '9':
            return sock.sendMessage(jid, {
              text:
                '📞 *ASSISTANCE SCHOOL FLOW*\n\n' +
                'Pour obtenir une assistance technique concernant votre espace financier, contactez SCHOOL FLOW via le canal officiel prévu par votre établissement.'
            });
          case '10':
            paymentAccessSessions.delete(jid);
            clearMenuSession(jid);

            return sock.sendMessage(jid, {
              text:
                '🔓 *ACCÈS FINANCIER RÉINITIALISÉ*\n\n' +
                'Votre tentative précédente a été réinitialisée.\n\n' +
                '🔐 Aucun accès financier n’est accordé automatiquement.\n' +
                'Vous devrez saisir à nouveau votre *PIN à 4 chiffres*.\n\n' +
                '👉 Envoyez *20* ou tapez *menu* pour recommencer.'
            });

        }
      }
    }

    // MENU
    if (
      normalized === 'menu' ||
      normalized === '/menu' ||
      normalized === '.menu'
    ) {
      clearMenuSession(jid);

      return sock.sendMessage(jid, {
        text: buildMenu()
      });
    }

    // AIDE
    if (
      normalized === 'aide' ||
      normalized === '/aide' ||
      normalized === '.aide' ||
      normalized === 'help'
    ) {
      return sock.sendMessage(jid, {
        text:
          '🤖 *AIDE SCHOOL FLOW*\n\n' +
          'Tapez */menu* pour afficher les options disponibles.\n\n' +
          'Vous pouvez également taper */contact* pour obtenir l’assistance.'
      });
    }

    // CONTACT
    if (
      normalized === 'contact' ||
      normalized === '/contact' ||
      normalized === '.contact' ||
      normalized === 'bon contact' ||
      normalized === 'bon contact' ||
      normalized === 'numero contact' ||
      normalized === 'numéro contact' ||
      normalized === 'numero de contact' ||
      normalized === 'numéro de contact'
    ) {
      return handleMenuChoice(
        sock,
        jid,
        '5',
        school,
        config
      );
    }

    // CHOIX NUMÉRIQUE DU MENU
    if (/^(?:[1-9]|[12][0-9]|30)$/.test(normalized)) {
      return handleMenuChoice(
        sock,
        jid,
        normalized,
        school,
        config
      );
    }

    // CONTEXTE : INFORMATIONS ÉLÈVE
    const session = getMenuSession(jid);

    
    if (session?.option === 'school-fees') {
      const feeSession =
        schoolFeesSessions.get(jid);

      if (!feeSession) {
        return;
      }

      if (
        Date.now() >
        feeSession.expiresAt
      ) {
        schoolFeesSessions.delete(jid);

        return sock.sendMessage(jid, {
          text:
            '⏱️ *SESSION EXPIRÉE*\n\n' +
            'Veuillez recommencer avec l’option *19. Frais scolaires*.'
        });
      }

      if (
        String(feeSession.schoolId) !==
        String(school?.id || '')
      ) {
        schoolFeesSessions.delete(jid);

        return sock.sendMessage(jid, {
          text:
            '🔒 *ACCÈS REFUSÉ*\n\n' +
            'Cette demande ne correspond pas à l’établissement actif.'
        });
      }

      const students = getSchoolStudents(school);
      const input = String(text || '').trim();
      let student = null;

      if (/^[0-9]{5}$/.test(input)) {
        student = students.find(
          item => String(item.studentCode || '') === input
        ) || null;
      } else {
        const parts = input.split(',').map(part => part.trim()).filter(Boolean);

        if (parts.length < 2) {
          return sock.sendMessage(jid, {
            text:
              '⚠️ *FORMAT INCORRECT*\n\n' +
              'Envoyez le code élève à 5 chiffres ou le nom et la classe.\n\n' +
              'Exemple : *12345*\n' +
              'Ou : *Merdy Inatshauya, 6e ETRI*'
          });
        }

        const studentName = parts.slice(0, -1).join(',').trim();
        const className = parts[parts.length - 1].trim();

        student = findStudent(students, studentName, className);
      }

      if (!student) {
        schoolFeesSessions.delete(jid);

        return sock.sendMessage(jid, {
          text:
            '❌ *ÉLÈVE INTROUVABLE*\n\n' +
            'Aucun élève correspondant à ce nom et cette classe n’a été trouvé.'
        });
      }

      const senderPhone =
        getRealSenderPhone(
          message,
          jid
        );

      const parentIdentity =
        findRegisteredParentIdentity([student], senderPhone);

      if (!parentIdentity) {
        schoolFeesSessions.delete(jid);

        return sock.sendMessage(jid, {
          text:
            '🔒 *ACCÈS REFUSÉ*\n\n' +
            'Votre numéro WhatsApp n’est pas reconnu comme numéro de parent enregistré dans cet établissement.\n\n' +
            'Aucune information financière n’a été affichée.'
        });
      }

      if (
        String(
          parentIdentity.student?.id || ''
        ) !==
        String(
          student.id || ''
        )
      ) {
        schoolFeesSessions.delete(jid);

        return sock.sendMessage(jid, {
          text:
            '🔒 *ACCÈS REFUSÉ*\n\n' +
            'Votre numéro de parent ne correspond pas à cet élève.\n\n' +
            'Aucune information financière n’a été affichée.'
        });
      }

      schoolFeesSessions.delete(jid);

      return sock.sendMessage(jid, {
        text:
          buildParentFeeMessage(
            school,
            student,
            parentIdentity
          )
      });
    }

if (session?.option === 'student-info') {
      const input = String(text || '').trim();
      const students = getSchoolStudents(school);

      let student = null;

      /*
       * RECHERCHE PAR MATRICULE
       * Le matricule est recherché dans le champ réel
       * student.matricule de la base de l'établissement.
       */
      if (!input.includes(',')) {
        const normalizeMatricule = value =>
          String(value || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');

        const wantedMatricule =
          normalizeMatricule(input);

        if (!wantedMatricule) {
          return sock.sendMessage(jid, {
            text:
              '⚠️ *MATRICULE INCORRECT*\n\n' +
              'Veuillez saisir le numéro matricule de votre enfant.'
          });
        }

        student = students.find(item =>
          normalizeMatricule(item.matricule) === wantedMatricule
        ) || null;

      } else {
        /*
         * ANCIENNE RECHERCHE PAR NOM ET CLASSE
         * Elle reste disponible.
         */
        const parts = input
          .split(',')
          .map(part => part.trim())
          .filter(Boolean);

        if (parts.length < 2) {
          return sock.sendMessage(jid, {
            text:
              '⚠️ *FORMAT INCORRECT*\n\n' +
              'Envoyez le matricule ou le nom et la classe.\n\n' +
              'Exemple : *12345*\n' +
              'Ou : *Merdy Inatshauya, 6e ETRI*'
          });
        }

        const studentName =
          parts.slice(0, -1).join(',').trim();

        const className =
          parts[parts.length - 1].trim();

        student = findStudent(
          students,
          studentName,
          className
        );
      }

      if (!student) {
        clearMenuSession(jid);

        return sock.sendMessage(jid, {
          text:
            '❌ *ÉLÈVE INTROUVABLE*\n\n' +
            'Aucun élève ne correspond à cette recherche dans votre établissement.\n\n' +
            'Vérifiez le matricule ou les informations saisies.'
        });
      }

      /*
       * SÉCURITÉ :
       * On récupère le véritable numéro WhatsApp
       * et on le compare exactement aux numéros
       * du père et de la mère enregistrés.
       */
      const senderPhone =
        paymentSecurity.normalizePhone(
          getRealSenderPhone(message, jid)
        );

      const registeredPhones =
        getStudentParentPhones(student).map(phone =>
          paymentSecurity.normalizePhone(phone)
        );

      const authorized =
        Boolean(senderPhone) &&
        registeredPhones.includes(senderPhone);

      if (!authorized) {
        clearMenuSession(jid);

        return sock.sendMessage(jid, {
          text:
            '🔒 *ACCÈS REFUSÉ*\n\n' +
            'Le numéro WhatsApp utilisé ne correspond pas exactement à un numéro de parent enregistré pour cet élève.\n\n' +
            'Aucune information concernant cet enfant ne sera communiquée.\n\n' +
            'Veuillez contacter l’établissement pour vérifier les numéros enregistrés.'
        });
      }

      clearMenuSession(jid);

      return sock.sendMessage(jid, {
        text: formatStudentInfo(student)
      });
    }

    // SALUTATIONS
    const greetings = Array.isArray(config.greetings)
      ? config.greetings
      : [];

    const isGreeting = greetings.some(greeting => {
      return normalized === normalizeText(greeting);
    });

    if (
      isGreeting ||
      ['bjr', 'bsr', 'cc', 'coucou'].includes(normalized)
    ) {
      const personalizedGreeting =
        getParentGreeting(parentIdentity);

      return sock.sendMessage(jid, {
        text:
          personalizedGreeting +
          ', je suis l’assistant School Flow. En quoi puis-je vous aider ?'
      });
    }

    // QUESTIONS CONNUES DE L'ÉTABLISSEMENT
    if (Array.isArray(config.knowledge)) {
      const found = config.knowledge.find(item => {
        const question = normalizeText(item.question);

        return (
          question &&
          (
            normalized === question ||
            normalized.includes(question) ||
            question.includes(normalized)
          )
        );
      });

      if (found?.answer) {
        return sock.sendMessage(jid, {
          text: found.answer
        });
      }
    }

    // =========================================================
    // SCHOOL FLOW — MOTEUR LOCAL DE CONVERSATION
    // =========================================================
    //
    // La base locale contient plusieurs milliers de variantes.
    // Elle est consultée avant toute requête vers l'IA distante.
    //
    // Avantage :
    // - réponses immédiates ;
    // - aucune API externe pour les demandes connues ;
    // - fonctionnement même si l'IA distante est indisponible ;
    // - réduction importante des appels API.
    
    try {
      const localResult = localKnowledge.findLocalAnswer(text);

      if (localResult?.answer) {
        console.log(
          '🧠 SCHOOL FLOW — RÉPONSE LOCALE :',
          localResult.intent,
          'score:',
          localResult.score
        );

        return sock.sendMessage(jid, {
          text: String(localResult.answer)
        });
      }
    } catch (error) {
      console.error(
        'SCHOOL FLOW LOCAL KNOWLEDGE ERROR:',
        error
      );
    }

    // SCHOOL FLOW — ROUTEUR INTELLIGENT
    // Le moteur IA décide automatiquement du type de demande.
    //
    // Modules prévus :
    // 1. SCOLAIRE       : établissement, élèves, parents, horaires...
    // 2. RECHERCHE WEB  : informations publiques à vérifier
    // 3. GROUPES        : liens de communication configurés
    // 4. MUSIQUE        : recherche d'informations musicales
    // 5. VIDÉO          : recherche de vidéos et ressources
    // 6. GÉNÉRAL        : questions générales
    //
    // Le téléchargement de contenus protégés n'est pas exécuté
    // automatiquement. Le bot privilégie les sources officielles.

    try {
      console.log('🤖 SCHOOL FLOW — ROUTAGE IA :', text);

      const controller = new AbortController();

      const timeout = setTimeout(() => {
        controller.abort();
      }, 12000);

      let aiResponse;

      try {
        aiResponse = await fetch(
          'http://127.0.0.1:3000/api/bot/ask',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              question: text
            }),
            signal: controller.signal
          }
        );
      } finally {
        clearTimeout(timeout);
      }

      if (!aiResponse.ok) {
        throw new Error(
          'IA HTTP ' + aiResponse.status
        );
      }

      const aiData = await aiResponse.json();

      if (aiData?.success && aiData?.answer) {
        console.log(
          '🤖 SCHOOL FLOW — MODULE :',
          aiData.verification || 'general'
        );

        return sock.sendMessage(jid, {
          text: String(aiData.answer)
        });
      }

      console.error(
        'SCHOOL FLOW AI — réponse invalide :',
        aiData?.error || 'réponse vide'
      );

    } catch (error) {
      console.error(
        'SCHOOL FLOW AI ROUTER ERROR:',
        error?.name === 'AbortError'
          ? 'Délai IA dépassé (12 secondes)'
          : error
      );
    }

    return sock.sendMessage(jid, {
      text:
        '❓ *Je n’ai pas compris votre demande.*\n\n' +
        'Tapez *.menu* pour voir toutes les options disponibles.'
    });

  } catch (error) {
    console.error('BOT ENGINE ERROR:', error);
  }
}

module.exports = {
  handleIncomingMessage
};
