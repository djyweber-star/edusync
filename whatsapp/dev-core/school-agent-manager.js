'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(process.cwd(), 'data');
const SCHOOLS_FILE = path.join(DATA_DIR, 'schools.json');
const AGENTS_FILE = path.join(DATA_DIR, 'school-agents.json');

const PAYMENT_SECURITY_FILE_HELPER = path.join(
  DATA_DIR,
  'schools'
);

function clearFinancialAgentFromPaymentSecurity(schoolId, removedPhone) {
  const cleanSchoolId = String(schoolId || '').trim();
  const cleanPhone = normalizePhone(removedPhone);

  if (!cleanSchoolId || !cleanPhone) {
    return;
  }

  const securityFile = path.join(
    PAYMENT_SECURITY_FILE_HELPER,
    cleanSchoolId,
    'payment-security.json'
  );

  if (!fs.existsSync(securityFile)) {
    return;
  }

  let security;

  try {
    security = JSON.parse(
      fs.readFileSync(securityFile, 'utf8')
    );
  } catch (error) {
    console.error(
      '[SCHOOL AGENT MANAGER] Lecture payment-security impossible:',
      error.message
    );
    return;
  }

  const currentPaymentPhone =
    normalizePhone(security?.agentPaymentPhone);

  const currentDisciplinePhone =
    normalizePhone(security?.agentDisciplinePhone);

  let changed = false;

  if (currentPaymentPhone === cleanPhone) {
    security.agentPaymentPhone = '';
    changed = true;
  }

  if (currentDisciplinePhone === cleanPhone) {
    security.agentDisciplinePhone = '';
    changed = true;
  }

  if (!changed) {
    return;
  }

  security.updatedAt = new Date().toISOString();

  fs.writeFileSync(
    securityFile,
    JSON.stringify(security, null, 2),
    'utf8'
  );

  console.log(
    '[SCHOOL AGENT MANAGER] Agent financier supprimé de payment-security.json :',
    cleanPhone
  );
}


function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;

    return JSON.parse(
      fs.readFileSync(file, 'utf8')
    );
  } catch (error) {
    console.error(
      '[SCHOOL AGENT MANAGER] Lecture impossible:',
      file,
      error.message
    );

    return fallback;
  }
}

function writeJson(file, data) {
  const tempFile =
    file + '.tmp-' + process.pid + '-' + Date.now();

  fs.writeFileSync(
    tempFile,
    JSON.stringify(data, null, 2),
    'utf8'
  );

  fs.renameSync(tempFile, file);
}

function loadSchools() {
  const schools = readJson(SCHOOLS_FILE, []);

  return Array.isArray(schools)
    ? schools
    : [];
}

function loadAgentsConfig() {
  const config = readJson(
    AGENTS_FILE,
    {
      enabled: true,
      agents: []
    }
  );

  return {
    enabled: config?.enabled !== false,
    agents: Array.isArray(config?.agents)
      ? config.agents
      : []
  };
}

function saveAgentsConfig(config) {
  writeJson(
    AGENTS_FILE,
    {
      enabled: config.enabled !== false,
      agents: Array.isArray(config.agents)
        ? config.agents
        : []
    }
  );
}

function findSchool(schoolId) {
  const normalizedId = String(
    schoolId || ''
  ).trim();

  if (!normalizedId) return null;

  return (
    loadSchools().find(
      school =>
        String(school?.id || '') === normalizedId
    ) || null
  );
}

function getSchoolName(school) {
  return String(
    school?.schoolName ||
    school?.name ||
    'Établissement sans nom'
  ).trim();
}

function listSchools() {
  return loadSchools().map(school => ({
    id: String(school.id || ''),
    name: getSchoolName(school)
  }));
}

function listAgents(schoolId) {
  const school = findSchool(schoolId);

  if (!school) {
    return {
      success: false,
      message: 'Établissement introuvable.',
      school: null,
      agents: []
    };
  }

  const normalizedSchoolId =
    String(school.id);

  const config = loadAgentsConfig();

  const agents = config.agents
    .filter(agent => {
      return (
        String(agent?.schoolId || '') ===
        normalizedSchoolId
      );
    })
    .map(agent => ({
      id: String(
        agent.id ||
        ''
      ),
      name: String(
        agent.name ||
        'Agent'
      ),
      role: String(
        agent.role ||
        'autre'
      ),
      phone: normalizePhone(
        agent.phone
      ),
      schoolId: normalizedSchoolId,
      schoolName: getSchoolName(school),
      active:
        agent.active !== false,
      permissions:
        Array.isArray(agent.permissions)
          ? agent.permissions
          : []
    }));

  return {
    success: true,
    school: {
      id: normalizedSchoolId,
      name: getSchoolName(school)
    },
    agents
  };
}

function createAgentId() {
  return (
    'AGENT-' +
    crypto
      .randomBytes(6)
      .toString('hex')
      .toUpperCase()
  );
}

function addAgent({
  schoolId,
  name,
  phone,
  role,
  permissions
}) {
  const school = findSchool(schoolId);

  if (!school) {
    return {
      success: false,
      message: 'Établissement introuvable.'
    };
  }

  const cleanName =
    String(name || '').trim();

  const cleanPhone =
    normalizePhone(phone);

  const cleanRole =
    String(role || 'autre')
      .trim()
      .toLowerCase();

  if (!cleanName) {
    return {
      success: false,
      message: 'Le nom de l’agent est obligatoire.'
    };
  }

  if (!cleanPhone) {
    return {
      success: false,
      message: 'Le numéro WhatsApp est obligatoire.'
    };
  }

  if (!cleanRole) {
    return {
      success: false,
      message: 'Le rôle de l’agent est obligatoire.'
    };
  }

  const config =
    loadAgentsConfig();

  const duplicate =
    config.agents.find(agent => {
      return (
        agent?.active !== false &&
        normalizePhone(agent.phone) ===
          cleanPhone
      );
    });

  if (duplicate) {
    return {
      success: false,
      message:
        'Ce numéro est déjà enregistré comme agent.'
    };
  }

  const agent = {
    id: createAgentId(),
    phone: cleanPhone,
    name: cleanName,
    role: cleanRole,
    schoolId: String(school.id),
    schoolName: getSchoolName(school),
    active: true,
    permissions:
      Array.isArray(permissions)
        ? permissions
        : [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString()
  };

  config.agents.push(agent);

  saveAgentsConfig(config);

  return {
    success: true,
    message: 'Agent ajouté avec succès.',
    agent
  };
}

function updateAgent({
  agentId,
  schoolId,
  name,
  phone,
  role,
  permissions,
  active
}) {
  const school = findSchool(schoolId);

  if (!school) {
    return {
      success: false,
      message: 'Établissement introuvable.'
    };
  }

  const config =
    loadAgentsConfig();

  const index =
    config.agents.findIndex(agent => {
      return (
        String(agent?.id || '') ===
          String(agentId || '') &&
        String(agent?.schoolId || '') ===
          String(school.id)
      );
    });

  if (index === -1) {
    return {
      success: false,
      message: 'Agent introuvable.'
    };
  }

  const agent =
    config.agents[index];

  if (name !== undefined) {
    const cleanName =
      String(name || '').trim();

    if (!cleanName) {
      return {
        success: false,
        message: 'Le nom ne peut pas être vide.'
      };
    }

    agent.name = cleanName;
  }

  if (phone !== undefined) {
    const cleanPhone =
      normalizePhone(phone);

    if (!cleanPhone) {
      return {
        success: false,
        message:
          'Le numéro WhatsApp ne peut pas être vide.'
      };
    }

    const duplicate =
      config.agents.find(
        (other, otherIndex) =>
          otherIndex !== index &&
          other?.active !== false &&
          normalizePhone(other.phone) ===
            cleanPhone
      );

    if (duplicate) {
      return {
        success: false,
        message:
          'Ce numéro est déjà utilisé par un autre agent.'
      };
    }

    agent.phone = cleanPhone;
  }

  if (role !== undefined) {
    const cleanRole =
      String(role || '').trim().toLowerCase();

    if (!cleanRole) {
      return {
        success: false,
        message: 'Le rôle ne peut pas être vide.'
      };
    }

    agent.role = cleanRole;
  }

  if (Array.isArray(permissions)) {
    agent.permissions =
      permissions;
  }

  if (active !== undefined) {
    agent.active =
      Boolean(active);
  }

  agent.schoolName =
    getSchoolName(school);

  agent.updatedAt =
    new Date().toISOString();

  saveAgentsConfig(config);

  return {
    success: true,
    message: 'Agent modifié avec succès.',
    agent
  };
}

function removeAgent({
  agentId,
  schoolId
}) {
  const school = findSchool(schoolId);

  if (!school) {
    return {
      success: false,
      message: 'Établissement introuvable.'
    };
  }

  const config =
    loadAgentsConfig();

  const index =
    config.agents.findIndex(agent => {
      return (
        String(agent?.id || '') ===
          String(agentId || '') &&
        String(agent?.schoolId || '') ===
          String(school.id)
      );
    });

  if (index === -1) {
    return {
      success: false,
      message: 'Agent introuvable.'
    };
  }

  const removed =
    config.agents[index];

  config.agents.splice(
    index,
    1
  );

  saveAgentsConfig(config);

  if (
    String(removed?.role || '').trim().toLowerCase() ===
    'financier'
  ) {
    clearFinancialAgentFromPaymentSecurity(
      school.id,
      removed.phone
    );
  }

  return {
    success: true,
    message: 'Agent supprimé.',
    agent: removed
  };
}

module.exports = {
  normalizePhone,
  listSchools,
  listAgents,
  addAgent,
  updateAgent,
  removeAgent,
  findSchool
};
