import type { MapZone } from '../types.js';

export function getEffectiveZones(scenarioId: string, mapId: string, allZones: MapZone[]): MapZone[] {
  const scenarioZones = allZones.filter((zone) => zone.scenarioId === scenarioId);

  const overriddenGlobalZoneIds = new Set(
    scenarioZones
      .map((zone) => zone.parentZoneId)
      .filter((parentZoneId): parentZoneId is string => parentZoneId !== undefined)
  );

  const globalZones = allZones.filter(
    (zone) =>
      zone.scenarioId === undefined && zone.mapId === mapId && !overriddenGlobalZoneIds.has(zone.id)
  );

  return scenarioZones.concat(globalZones);
}

export function resolveZoneById(zoneId: string, effectiveZones: MapZone[]): MapZone | undefined {
  return (
    effectiveZones.find((zone) => zone.parentZoneId === zoneId) ??
    effectiveZones.find((zone) => zone.id === zoneId)
  );
}

export function buildDesyncedScenarioZoneFields(globalZone: MapZone, scenarioId: string) {
  return {
    mapId: globalZone.mapId,
    scenarioId,
    parentZoneId: globalZone.id,
    name: globalZone.name,
    locationIds: [...globalZone.locationIds],
    privateToGroupIds: [...globalZone.privateToGroupIds],
  };
}

export function buildPushedGlobalZone(scenarioZone: MapZone, globalZone: MapZone): MapZone {
  return {
    ...globalZone,
    name: scenarioZone.name,
    locationIds: [...scenarioZone.locationIds],
    privateToGroupIds: [],
  };
}
