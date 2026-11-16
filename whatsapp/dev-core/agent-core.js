'use strict';

const fs = require('fs');
const path = require('path');
const DEV_CORE_AGENT_CONFIG = path.join(__dirname, 'agent-config.json');

const CONFIG_FILE = path.join(__dirname, 'agent-config.json');

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return {
        enabled: true,
        agents: [],
        security: {
          allowRemoteUpdates: false,
          requireConfirmationForChanges: true
        }
      };
    }

    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

    return {
      enabled: data.enabled !== false,
      agents: Array.isArray(data.agents) ? data.agents : [],
      security: {
        allowRemoteUpdates: data.security?.allowRemoteUpdates === true,
        requireConfirmationForChanges:
          data.security?.requireConfirmationForChanges !== false
      }
    };
  } catch (error) {
    console.error('[DEV CORE] Erreur lecture configuration:', error.message);

    return {
      enabled: false,
      agents: [],
      security: {
        allowRemoteUpdates: false,
        requireConfirmationForChanges: true
      }
    };
  }
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function getSenderPhone(message) {
  if (!message) return '';

  /*
   * WhatsApp/Baileys peut livrer les messages privés avec
   * remoteJid sous forme de LID (@lid).
   *
   * Dans ce cas, senderPn contient le vrai numéro WhatsApp.
   * On donne donc priorité à senderPn pour l'identification
   * des agents SCHOOL FLOW.
   */

  const pnCandidates = [
    message?.key?.senderPn,
    message?.key?.participantPn
  ];

  for (const candidate of pnCandidates) {
    if (!candidate) continue;

    const phone = normalizePhone(
      String(candidate).split('@')[0].split(':')[0]
    );

    if (phone) return phone;
  }

  const remoteJid = message?.key?.remoteJid || '';

  if (
    remoteJid &&
    !remoteJid.endsWith('@g.us') &&
    !remoteJid.endsWith('@broadcast') &&
    !remoteJid.endsWith('@lid')
  ) {
    const phone = normalizePhone(
      String(remoteJid).split('@')[0].split(':')[0]
    );

    if (phone) return phone;
  }

  const candidates = [
    message?.key?.participant,
    message?.sender,
    message?.from,
    message?.participant
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const phone = normalizePhone(
      String(candidate).split('@')[0].split(':')[0]
    );

    if (phone) return phone;
  }

  return '';
}

function findAgent(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const config = loadConfig();

  if (!config.enabled) return null;

  return (
    config.agents.find(agent => {
      if (agent?.active === false) return false;
      return normalizePhone(agent.phone) === normalized;
    }) || null
  );
}

function isAgent(phone) {
  return Boolean(findAgent(phone));
}


function getOfficialContact() {
  return (
    '╔══════════════════════════════╗\n' +
    '║    SCHOOL FLOW // ASSISTANCE ║\n' +
    '╚══════════════════════════════╝\n\n' +
    '🛠️ BESOIN D’ASSISTANCE ?\n\n' +
    'Pour un problème technique, une\n' +
    'maintenance ou une difficulté avec\n' +
    'SCHOOL FLOW, contactez notre agent\n' +
    'officiel.\n\n' +
    '👤 WEBER\n' +
    'Fondateur — SCHOOL FLOW\n\n' +
    '📱 WhatsApp :\n' +
    '+243 900 969 383\n\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    '🔐 Assistance officielle SCHOOL FLOW'
  );
}

function getAgentMenu(agent) {
  const name = agent?.name || 'Agent';
  const role = agent?.role || 'agent';
  const level = agent?.level || 'standard';

  return [
    '╔════════════════════════════════════╗',
    '║       SCHOOL FLOW — DEV CORE      ║',
    '╚════════════════════════════════════╝',
    '',
    'AGENT   : ' + name,
    'RÔLE    : ' + role,
    'NIVEAU  : ' + level,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'COMMANDES DISPONIBLES',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    'menu',
    'status',
    'schools',
    'whatsapp',
    'diagnostic',
    'modules',
    'interface',
    'configuration',
    'agents',
    'update',
    'restart',
    'help',
    'contact',
    '',
    'GESTION DES AGENTS',
    '',
    'agents',
    'agents list',
    'agents add',
    'agents update',
    'agents activate',
    'agents deactivate',
    'agents remove',
    '',
    'Les modifications sensibles',
    'restent protégées par DEV CORE.',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'SCHOOL FLOW',
    'Centre de contrôle développeur',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  ].join('\n');
}

function getAgentGreeting(agent) {
  const name = agent?.name || 'Agent';

  return [
    'SCHOOL FLOW - DEV CORE',
    '',
    'Bienvenue ' + name + '.',
    '',
    'Acces DEV CORE confirme.',
    'Identite authentifiee.',
    '',
    'Tapez menu pour afficher les outils disponibles.'
  ].join('\n');
}

function getAgentHelp() {
  return [
    '╔════════════════════════════════════╗',
    '║       SCHOOL FLOW — AIDE          ║',
    '╚════════════════════════════════════╝',
    '',
    'COMMANDES PRINCIPALES',
    '',
    'menu',
    '  Affiche le centre de contrôle.',
    '',
    'status',
    '  Vérifie l’état général du système.',
    '',
    'schools',
    '  Affiche les établissements enregistrés.',
    '',
    'whatsapp',
    '  Vérifie l’état de la connexion WhatsApp.',
    '',
    'diagnostic',
    '  Lance un diagnostic général.',
    '',
    'modules',
    '  Affiche les modules SCHOOL FLOW.',
    '',
    'interface',
    '  Vérifie l’interface SCHOOL FLOW.',
    '',
    'configuration',
    '  Affiche la configuration DEV CORE.',
    '',
    'agents',
    '  Gestion des agents internes SCHOOL FLOW.',
    '',
    'agents add',
    '  Ajoute un agent interne.',
    '',
    'agents update',
    '  Modifie un agent.',
    '',
    'agents activate',
    '  Active un agent.',
    '',
    'agents deactivate',
    '  Désactive un agent.',
    '',
    'agents remove',
    '  Supprime un agent.',
    '',
    'update',
    '  Vérifie l’état des mises à jour.',
    '',
    'restart',
    '  Redémarre proprement la connexion WhatsApp.',
    '',
    'contact',
    '  Affiche le contact officiel SCHOOL FLOW.',
    '',
    'Les commandes sensibles nécessitent',
    'les permissions DEV CORE appropriées.'
  ].join('\n');
}

function classifyCommand(text) {
  const value = String(text || '')
    .trim()
    .toLowerCase();

  if (!value) return 'unknown';

  if (
    value === 'menu' ||
    value === '0' ||
    value === 'start'
  ) {
    return 'menu';
  }

  if (
    value === 'status' ||
    value === 'statut'
  ) {
    return 'status';
  }

  if (
    value === 'schools' ||
    value === 'school' ||
    value === 'ecoles' ||
    value === 'écoles' ||
    value === 'ecole' ||
    value === 'école'
  ) {
    return 'schools';
  }

  if (
    value === 'whatsapp' ||
    value === 'wa'
  ) {
    return 'whatsapp';
  }

  if (
    value === 'diagnostic' ||
    value === 'diag'
  ) {
    return 'diagnostic';
  }

  if (
    value === 'modules' ||
    value === 'module'
  ) {
    return 'modules';
  }

  if (
    value === 'interface' ||
    value === 'ui'
  ) {
    return 'interface';
  }

  if (
    value === 'configuration' ||
    value === 'config'
  ) {
    return 'configuration';
  }

  if (
    value === 'agents' ||
    value === 'agent'
  ) {
    return 'agents';
  }

  if (
    value === 'update' ||
    value === 'updates' ||
    value === 'mise à jour' ||
    value === 'mise a jour'
  ) {
    return 'update';
  }

  if (
    value === 'restart' ||
    value === 'redémarrer' ||
    value === 'redemarrer' ||
    value === 'reconnect'
  ) {
    return 'restart';
  }

  if (
    value === 'help' ||
    value === 'aide'
  ) {
    return 'help';
  }

  if (
    value === 'contact' ||
    value === 'support'
  ) {
    return 'contact';
  }

  return 'unknown';
}
function getSchoolsOverview(dataDir) {
  try {
    const fsLocal = require('fs');
    const pathLocal = require('path');

    const schoolsFile = pathLocal.join(
      dataDir,
      'schools.json'
    );

    if (!fsLocal.existsSync(schoolsFile)) {
      return {
        success: false,
        count: 0,
        schools: [],
        message: 'Fichier des établissements introuvable.'
      };
    }

    const schools = JSON.parse(
      fsLocal.readFileSync(schoolsFile, 'utf8')
    );

    if (!Array.isArray(schools)) {
      return {
        success: false,
        count: 0,
        schools: [],
        message: 'Structure des établissements invalide.'
      };
    }

    let activeSchoolId = null;

    const sessionFile = pathLocal.join(
      dataDir,
      'session.json'
    );

    if (fsLocal.existsSync(sessionFile)) {
      try {
        const session = JSON.parse(
          fsLocal.readFileSync(sessionFile, 'utf8')
        );

        activeSchoolId = session?.schoolId
          ? String(session.schoolId)
          : null;
      } catch (_) {}
    }

    return {
      success: true,
      count: schools.length,
      schools: schools.map((school) => ({
        id: String(school.id || ''),
        name: String(
          school.schoolName ||
          school.name ||
          'Établissement sans nom'
        ),
        active:
          activeSchoolId !== null &&
          String(school.id) === activeSchoolId
      }))
    };
  } catch (error) {
    console.error(
      '[DEV CORE] Erreur écoles:',
      error.message
    );

    return {
      success: false,
      count: 0,
      schools: [],
      message: 'Impossible de lire les établissements.'
    };
  }
}

function formatSchoolsOverview(dataDir) {
  const result = getSchoolsOverview(dataDir);

  if (!result.success) {
    return [
      '*SCHOOL FLOW // NETWORK*',
      '',
      '❌ ' + result.message
    ].join('\n');
  }

  const lines = [
    '*SCHOOL FLOW // NETWORK*',
    '',
    'Établissements enregistrés : *' + result.count + '*',
    ''
  ];

  for (const school of result.schools) {
    const marker = school.active ? '🟢' : '⚪';
    const activeText = school.active
      ? ' — ACTIF'
      : '';

    lines.push(
      marker + ' ' + school.name + activeText
    );
  }

  lines.push('');
  lines.push(
    '🔐 Confidentialité : *ACTIVE*'
  );
  lines.push(
    'Contenu des conversations : *NON ACCESSIBLE*'
  );
  lines.push(
    'Données élèves/parents : *NON EXPOSÉES*'
  );

  return lines.join('\n');
}

function formatAgentStatus(whatsappStatus, dataDir) {
  const schools = getSchoolsOverview(dataDir);

  return [
    '*SCHOOL FLOW // SYSTEM STATUS*',
    '',
    '🧠 DEV CORE : *OPÉRATIONNEL*',
    '🏫 Établissements : *' +
      (schools.success ? schools.count : 'indisponible') +
      '*',
    '📡 WhatsApp : *' +
      String(
        whatsappStatus?.status || 'inconnu'
      ).toUpperCase() +
      '*',
    '🟢 Connexion : *' +
      (
        whatsappStatus?.connected
          ? 'ACTIVE'
          : 'INACTIVE'
      ) +
      '*',
    '',
    '🔐 Confidentialité : *ACTIVE*',
    '💬 Contenu des conversations : *NON ACCESSIBLE*',
    '',
    'SCHOOL FLOW // DEVELOPER CHANNEL'
  ].join('\n');
}


function loadSchoolAgents() {
  try {
    const file = path.join(process.cwd(), 'data', 'school-agents.json');

    if (!fs.existsSync(file)) {
      return {
        enabled: true,
        agents: []
      };
    }

    const data = JSON.parse(
      fs.readFileSync(file, 'utf8')
    );

    return {
      enabled: data?.enabled !== false,
      agents: Array.isArray(data?.agents) ? data.agents : []
    };

  } catch (error) {
    console.error('SCHOOL AGENTS LOAD ERROR:', error);

    return {
      enabled: false,
      agents: []
    };
  }
}

function findSchoolAgent(phone) {
  const normalized = normalizePhone(phone);

  if (!normalized) return null;

  const config = loadSchoolAgents();

  if (!config.enabled) return null;

  return (
    config.agents.find(agent => {
      if (!agent) return false;
      if (agent.active === false) return false;

      return normalizePhone(agent.phone) === normalized;
    }) || null
  );
}

function isSchoolAgent(phone) {
  return Boolean(findSchoolAgent(phone));
}

function getSchoolAgentIdentity(message) {
  const phone = getSenderPhone(message);
  const agent = findSchoolAgent(phone);

  return {
    isAgent: Boolean(agent),
    phone,
    agent
  };
}

function getSchoolAgentMenu(agent) {
  const schoolName = agent?.schoolName || 'Établissement';

  return [
    '*SCHOOL FLOW // ADMINISTRATION*',
    '',
    'Bienvenue ' + (agent?.name || 'Agent') + '.',
    '',
    'Établissement : *' + schoolName + '*',
    '',
    '*MENU ADMINISTRATION*',
    '',
    '01 • ÉLÈVES',
    '02 • PARENTS',
    '03 • CONVOCATIONS',
    '04 • COMMUNIQUÉS',
    '05 • CLASSES',
    '06 • STATISTIQUES',
    '07 • CONFIGURATION',
    '',
    '00 • RETOUR',
    '',
    'SCHOOL FLOW // SCHOOL ADMIN'
  ].join('\n');
}

function getAgentIdentity(message) {
  const phone = getSenderPhone(message);
  const agent = findAgent(phone);

  return {
    isAgent: Boolean(agent),
    phone,
    agent
  };
}

function normalizeInternalAgentPhone(value) {
  return String(value || '')
    .replace(/[^0-9]/g, '')
    .replace(/^00/, '');
}

function loadInternalAgentConfig() {
  if (!fs.existsSync(DEV_CORE_AGENT_CONFIG)) {
    return {
      enabled: true,
      agents: [],
      security: {
        allowRemoteUpdates: false,
        requireConfirmationForChanges: true
      }
    };
  }

  const data = JSON.parse(
    fs.readFileSync(
      DEV_CORE_AGENT_CONFIG,
      'utf8'
    )
  );

  if (!Array.isArray(data.agents)) {
    data.agents = [];
  }

  if (!data.security) {
    data.security = {};
  }

  if (
    typeof data.security.allowRemoteUpdates !==
    'boolean'
  ) {
    data.security.allowRemoteUpdates = false;
  }

  if (
    typeof data.security.requireConfirmationForChanges !==
    'boolean'
  ) {
    data.security.requireConfirmationForChanges = true;
  }

  return data;
}

function saveInternalAgentConfig(data) {
  const temp =
    DEV_CORE_AGENT_CONFIG +
    '.tmp-' +
    process.pid;

  fs.writeFileSync(
    temp,
    JSON.stringify(data, null, 2) + '\n',
    'utf8'
  );

  fs.renameSync(
    temp,
    DEV_CORE_AGENT_CONFIG
  );
}

function getInternalAgents() {
  return loadInternalAgentConfig()
    .agents
    .map(agent => ({ ...agent }));
}

function getInternalAgentByPhone(phone) {
  const normalized =
    normalizeInternalAgentPhone(phone);

  return loadInternalAgentConfig()
    .agents
    .find(agent =>
      normalizeInternalAgentPhone(agent.phone) ===
      normalized
    ) || null;
}

function hasAgentPermission(agent, permission) {
  if (!agent || !agent.active) {
    return false;
  }

  if (agent.level === 'owner') {
    return true;
  }

  return Array.isArray(agent.permissions) &&
    agent.permissions.includes(permission);
}

function addInternalAgent(data) {
  const config =
    loadInternalAgentConfig();

  const phone =
    normalizeInternalAgentPhone(data?.phone);

  const name =
    String(data?.name || '').trim();

  if (!phone) {
    throw new Error('Numero agent invalide.');
  }

  if (!name) {
    throw new Error('Nom agent obligatoire.');
  }

  const exists =
    config.agents.some(agent =>
      normalizeInternalAgentPhone(
        agent.phone
      ) === phone
    );

  if (exists) {
    throw new Error(
      'Ce numero est deja utilise par un agent.'
    );
  }

  const agent = {
    phone,
    name,
    role:
      String(
        data?.role || 'agent'
      ).trim(),
    level:
      String(
        data?.level || 'standard'
      ).trim(),
    active: true,
    permissions:
      Array.isArray(data?.permissions)
        ? data.permissions
            .map(String)
            .map(value => value.trim())
            .filter(Boolean)
        : []
  };

  config.agents.push(agent);

  saveInternalAgentConfig(config);

  return agent;
}

function updateInternalAgent(phone, changes) {
  const config =
    loadInternalAgentConfig();

  const normalized =
    normalizeInternalAgentPhone(phone);

  const index =
    config.agents.findIndex(agent =>
      normalizeInternalAgentPhone(
        agent.phone
      ) === normalized
    );

  if (index === -1) {
    throw new Error('Agent introuvable.');
  }

  const current =
    config.agents[index];

  if (changes.name !== undefined) {
    const name =
      String(changes.name || '').trim();

    if (!name) {
      throw new Error('Nom invalide.');
    }

    current.name = name;
  }

  if (changes.phone !== undefined) {
    const newPhone =
      normalizeInternalAgentPhone(
        changes.phone
      );

    if (!newPhone) {
      throw new Error('Numero invalide.');
    }

    const duplicate =
      config.agents.some(
        (agent, i) =>
          i !== index &&
          normalizeInternalAgentPhone(
            agent.phone
          ) === newPhone
      );

    if (duplicate) {
      throw new Error(
        'Ce numero est deja utilise.'
      );
    }

    current.phone = newPhone;
  }

  if (changes.role !== undefined) {
    current.role =
      String(changes.role || '').trim();
  }

  if (changes.level !== undefined) {
    current.level =
      String(changes.level || '').trim();
  }

  if (changes.permissions !== undefined) {
    if (!Array.isArray(changes.permissions)) {
      throw new Error(
        'Permissions invalides.'
      );
    }

    current.permissions =
      changes.permissions
        .map(String)
        .map(value => value.trim())
        .filter(Boolean);
  }

  if (changes.active !== undefined) {
    if (
      current.level === 'owner' &&
      changes.active === false
    ) {
      const activeOwners =
        config.agents.filter(agent =>
          agent.level === 'owner' &&
          agent.active
        ).length;

      if (activeOwners <= 1) {
        throw new Error(
          'Impossible de desactiver le dernier owner.'
        );
      }
    }

    current.active =
      Boolean(changes.active);
  }

  config.agents[index] =
    current;

  saveInternalAgentConfig(config);

  return current;
}

function removeInternalAgent(phone) {
  const config =
    loadInternalAgentConfig();

  const normalized =
    normalizeInternalAgentPhone(phone);

  const index =
    config.agents.findIndex(agent =>
      normalizeInternalAgentPhone(
        agent.phone
      ) === normalized
    );

  if (index === -1) {
    throw new Error('Agent introuvable.');
  }

  const target =
    config.agents[index];

  if (target.level === 'owner') {
    const owners =
      config.agents.filter(agent =>
        agent.level === 'owner'
      ).length;

    if (owners <= 1) {
      throw new Error(
        'Impossible de supprimer le dernier owner.'
      );
    }
  }

  config.agents.splice(index, 1);

  saveInternalAgentConfig(config);

  return target;
}

function setInternalAgentActive(phone, active) {
  return updateInternalAgent(
    phone,
    {
      active: Boolean(active)
    }
  );
}

function getInternalAgentConfigStatus() {
  const config =
    loadInternalAgentConfig();

  return {
    enabled: Boolean(config.enabled),
    agentCount: config.agents.length,
    activeCount:
      config.agents.filter(
        agent => agent.active
      ).length,
    allowRemoteUpdates:
      Boolean(
        config.security.allowRemoteUpdates
      ),
    requireConfirmationForChanges:
      Boolean(
        config.security.requireConfirmationForChanges
      )
  };
}

module.exports = {
  getInternalAgentConfigStatus,
  setInternalAgentActive,
  removeInternalAgent,
  updateInternalAgent,
  addInternalAgent,
  hasAgentPermission,
  getInternalAgentByPhone,
  getInternalAgents,
  loadConfig,
  normalizePhone,
  getSenderPhone,
  findAgent,
  isAgent,
  getAgentMenu,
  getAgentGreeting,
  getAgentHelp,
    getOfficialContact,
  classifyCommand,
  getAgentIdentity,
  getSchoolsOverview,
  formatSchoolsOverview,
  formatAgentStatus,
  loadSchoolAgents,
  findSchoolAgent,
  isSchoolAgent,
  getSchoolAgentIdentity,
  getSchoolAgentMenu
};

/* ============================================================
   SCHOOL FLOW — GESTION DES AGENTS D'ÉTABLISSEMENT
   DEV CORE uniquement
   ============================================================ */


function getSchoolAgentManagerMenu() {
  return [
    'SCHOOL FLOW - GESTION ETABLISSEMENTS',
    '',
    'Gestion des agents des etablissements.',
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

function formatManagedSchools(schools) {
  if (!Array.isArray(schools) || !schools.length) {
    return [
      'SCHOOL FLOW - ETABLISSEMENTS',
      '',
      'Aucun etablissement enregistre.',
      '',
      'Pour quitter : retour'
    ].join('\n');
  }

  const lines = [
    'SCHOOL FLOW - ETABLISSEMENTS',
    '',
    'Liste des etablissements',
    ''
  ];

  schools.forEach((school, index) => {
    lines.push(
      (index + 1) + '. ' + String(school.name || 'Etablissement')
    );
    lines.push(
      '   ID : ' + String(school.id || '')
    );
    lines.push('');
  });

  lines.push('Repondez avec le numero de l etablissement.');
  lines.push('');
  lines.push('Pour quitter : retour');

  return lines.join('\n');
}

function formatManagedAgents(result) {
  if (!result?.success) {
    return String(
      result?.message || 'Impossible de charger les agents.'
    );
  }

  const school = result.school || {};
  const agents = Array.isArray(result.agents)
    ? result.agents
    : [];

  const lines = [
    'SCHOOL FLOW - AGENTS',
    '',
    'Etablissement : ' +
      String(school.name || 'Etablissement'),
    ''
  ];

  if (!agents.length) {
    lines.push('Aucun agent enregistre.');
  } else {
    agents.forEach((agent, index) => {
      lines.push(
        (index + 1) + '. ' +
        String(agent.name || 'Agent')
      );

      lines.push(
        '   Role : ' +
        String(agent.role || 'autre')
      );

      lines.push(
        '   WhatsApp : ' +
        String(agent.phone || '')
      );

      lines.push(
        '   Statut : ' +
        (agent.active ? 'ACTIF' : 'INACTIF')
      );

      if (
        String(agent.role || '').toLowerCase() === 'financial' ||
        String(agent.role || '').toLowerCase() === 'financier'
      ) {
        lines.push('   Fonction : AGENT FINANCIER');
      }

      lines.push(
        '   ID : ' +
        String(agent.id || '')
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

function getSchoolAgentRoles() {
  return [
    '1. direction',
    '2. administration',
    '3. financier',
    '4. rh',
    '5. discipline',
    '6. autre'
  ].join('\n');
}

module.exports.getSchoolAgentManagerMenu =
  getSchoolAgentManagerMenu;

module.exports.formatManagedSchools =
  formatManagedSchools;

module.exports.formatManagedAgents =
  formatManagedAgents;

module.exports.getSchoolAgentRoles =
  getSchoolAgentRoles;

