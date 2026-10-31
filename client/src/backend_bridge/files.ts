import * as Api from './api';
import type { Character } from '../engine/types';
import { addOrReplaceVersionQueryParam } from '../util/id';

const CHARACTER_IMAGE_FOLDER = 'character_cards';
const SCENARIO_FOLDER = 'scenario';
const DEFAULT_IMAGE_MIME_TYPE = 'image/png';

export function getGlobalCharacterImagePath(characterId: string) {
  return `/api/files/${CHARACTER_IMAGE_FOLDER}/${characterId}.png`;
}

export function isApiFilePath(path: string | undefined): boolean {
  return typeof path === 'string' && path.startsWith('/api/files/');
}

export function extractApiFileRelativePath(filePath: string | undefined): string | undefined {
  if (!isApiFilePath(filePath)) {
    return undefined;
  }
  return (filePath as string).slice('/api/files/'.length).split('?')[0] || undefined;
}

export function getCharacterZipImagePath(character: Pick<Character, 'imagePath'>): string | undefined {
  return extractApiFileRelativePath(character.imagePath);
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
  const response = await fetch(addOrReplaceVersionQueryParam(imagePath));
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

export async function copyCharacterImageToGlobal(
  character: Character,
  globalCharacterId: string
): Promise<string> {
  if (character.imagePath.startsWith('/images/')) {
    return character.imagePath;
  }

  const globalImagePath = getGlobalCharacterImagePath(globalCharacterId);
  const sourceBlob = await resolveCharacterImageSourceBlob(character);

  await Api.putFile(globalImagePath, sourceBlob, sourceBlob.type || DEFAULT_IMAGE_MIME_TYPE);
  return globalImagePath;
}

export async function upload(path: string, file: Blob, contentType?: string) {
  return Api.putFile(path, file, contentType);
}
