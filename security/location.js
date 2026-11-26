cat > security/location.js <<'EOF'
'use strict';

/**
 * Gestion des coordonnées GPS avec consentement explicite.
 * Ce module ne demande pas lui-même la permission au navigateur.
 */

function normalizeCoordinates(data) {
  if (!data || data.consent !== true) {
    return null;
  }

  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  const accuracy = Number(data.accuracy);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy)
      ? Math.max(0, accuracy)
      : null,
    consent: true,
    capturedAt: new Date().toISOString()
  };
}

function formatLocation(data) {
  const coordinates = normalizeCoordinates(data);

  if (!coordinates) {
    return '';
  }

  let location =
    `GPS: ${coordinates.latitude}, ${coordinates.longitude}`;

  if (coordinates.accuracy !== null) {
    location +=
      ` (précision environ ${Math.round(coordinates.accuracy)} m)`;
  }

  return location;
}

module.exports = {
  normalizeCoordinates,
  formatLocation
};
EOF