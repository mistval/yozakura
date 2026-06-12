import * as Api from './api';
import type { Character } from '../engine/types';

const CHARACTER_IMAGE_FOLDER = 'character_cards';
const SCENARIO_FOLDER = 'scenario';
const DEFAULT_IMAGE_MIME_TYPE = 'image/png';

export function getGlobalCharacterImagePath(characterId: string) {
  return `/api/files/${CHARACTER_IMAGE_FOLDER}/${characterId}.png`;
}

function getScenarioCharacterPath(scenarioId: string, characterId: string) {
  return `/api/files/${SCENARIO_FOLDER}/${scenarioId}/${CHARACTER_IMAGE_FOLDER}/${characterId}.png`;
}

export function deleteCharacterImage(imageGetPath: string) {
  if (imageGetPath.startsWith('/images')) {
    return; // It's a default image, can't delete
  }

  return Api.deleteFile(imageGetPath);
}

export function deleteScenarioFolder(scenarioId: string) {
  return Api.deleteFile(`/api/files/${SCENARIO_FOLDER}/${scenarioId}`);
}

async function fetchDataImageBlob(imagePath: string): Promise<Blob | undefined> {
  const response = await fetch(`${imagePath}?v=${Date.now()}`);
  if (!response.ok) {
    return undefined;
  }

  return response.blob();
}

async function fetchDefaultCharacterImageBlob(): Promise<Blob> {
  const response = await fetch('/images/character/default_character.png');
  if (!response.ok) {
    throw new Error('Default character image is unavailable');
  }

  return response.blob();
}

async function resolveCharacterImageSourceBlob(character: Character): Promise<Blob> {
  const existingImage = await fetchDataImageBlob(character.imagePath);
  if (existingImage) {
    return existingImage;
  }

  return fetchDefaultCharacterImageBlob();
}

export async function copyCharacterImageForScenario(scenarioId: string, character: Character) {
  const scenarioImagePath = getScenarioCharacterPath(scenarioId, character.id);
  const sourceBlob = await resolveCharacterImageSourceBlob(character);

  await Api.putFile(scenarioImagePath, sourceBlob, sourceBlob.type || DEFAULT_IMAGE_MIME_TYPE);
  const getPath = getScenarioCharacterPath(scenarioId, character.id);

  return getPath;
}

export async function upload(path: string, file: Blob, contentType?: string) {
  return Api.putFile(path, file, contentType);
}
