'use strict';

/*
============================================================
SCHOOL FLOW — CLIENT IA LOCALE / DISTANTE
============================================================
Le modèle IA ne tourne PAS sur le téléphone.

School Flow pourra communiquer avec :
  - un serveur IA local distant
  - Ollama
  - un autre moteur compatible HTTP

Variables .env :
  LOCAL_AI_URL=http://ADRESSE_DU_SERVEUR:11434
  LOCAL_AI_MODEL=MODEL_NAME
============================================================
*/

const LOCAL_AI_URL = String(
  process.env.LOCAL_AI_URL || ''
).trim().replace(/\/+$/, '');

const LOCAL_AI_MODEL = String(
  process.env.LOCAL_AI_MODEL || ''
).trim();

function isConfigured() {
  return Boolean(LOCAL_AI_URL && LOCAL_AI_MODEL);
}

async function healthCheck() {
  if (!LOCAL_AI_URL) {
    return {
      available: false,
      configured: false,
      error: 'LOCAL_AI_URL non configurée.'
    };
  }

  try {
    const response = await fetch(
      `${LOCAL_AI_URL}/api/tags`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      }
    );

    if (!response.ok) {
      return {
        available: false,
        configured: isConfigured(),
        status: response.status
      };
    }

    const data = await response.json();

    return {
      available: true,
      configured: isConfigured(),
      models: Array.isArray(data.models)
        ? data.models.map(model => model.name).filter(Boolean)
        : []
    };
  } catch (error) {
    return {
      available: false,
      configured: isConfigured(),
      error: error.message
    };
  }
}

async function askLocalAI({
  prompt,
  system = '',
  temperature = 0.3,
  maxTokens = 500
}) {
  if (!LOCAL_AI_URL) {
    throw new Error('LOCAL_AI_URL non configurée.');
  }

  if (!LOCAL_AI_MODEL) {
    throw new Error('LOCAL_AI_MODEL non configuré.');
  }

  const safePrompt = String(prompt || '').slice(0, 6000);
  const safeSystem = String(system || '').slice(0, 8000);

  const response = await fetch(
    `${LOCAL_AI_URL}/api/generate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({
        model: LOCAL_AI_MODEL,
        prompt: safePrompt,
        system: safeSystem,
        stream: false,
        options: {
          temperature,
          num_predict: Math.min(Number(maxTokens) || 500, 700)
        }
      })
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `IA locale HTTP ${response.status}: ${body.slice(0, 500)}`
    );
  }

  const data = await response.json();

  return String(
    data.response ||
    data.message?.content ||
    ''
  ).trim();
}

module.exports = {
  askLocalAI,
  healthCheck,
  isConfigured
};
