type ParsedPromptTemplatesPath = {
  isValid: boolean;
  groupIds: string[];
  chainId: string | undefined;
};

function sanitizePath(path: string): string {
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}

export function parsePromptTemplatesPath(
  pathname: string,
  promptTemplatesBasePath: string
): ParsedPromptTemplatesPath {
  const sanitizedPathname = sanitizePath(pathname);
  const sanitizedBasePath = sanitizePath(promptTemplatesBasePath);

  if (sanitizedPathname === sanitizedBasePath) {
    return {
      isValid: true,
      groupIds: [],
      chainId: undefined,
    };
  }

  if (!sanitizedPathname.startsWith(`${sanitizedBasePath}/`)) {
    return {
      isValid: false,
      groupIds: [],
      chainId: undefined,
    };
  }

  const relativePath = sanitizedPathname.slice(sanitizedBasePath.length + 1);
  const segments = relativePath.split('/').filter(Boolean);

  const groupIds: string[] = [];
  let index = 0;
  for (; index + 1 < segments.length; index += 2) {
    const groupId = segments[index + 1];
    if (!groupId) {
      return {
        isValid: false,
        groupIds: [],
        chainId: undefined,
      };
    }

    groupIds.push(groupId);
  }

  const remainingSegments = segments.slice(index);

  return {
    isValid: true,
    groupIds,
    chainId: remainingSegments[0],
  };
}

export function buildPromptTemplatesPath(
  promptTemplatesBasePath: string,
  groupIds: string[],
  chainId?: string | undefined
): string {
  const sanitizedBasePth = sanitizePath(promptTemplatesBasePath);
  if (groupIds.length === 0 && !chainId) {
    return sanitizedBasePth;
  }

  const pathSegments = groupIds.flatMap((groupId) => ['children', groupId]);
  if (chainId) {
    pathSegments.push(chainId);
  }

  return `${sanitizedBasePth}/${pathSegments.join('/')}`;
}

export function getPromptTemplatesBackPath(
  pathname: string,
  promptTemplatesBasePath: string,
  settingsBasePath: string
): string {
  const parsed = parsePromptTemplatesPath(pathname, promptTemplatesBasePath);
  if (!parsed.isValid) {
    return settingsBasePath;
  }

  if (parsed.groupIds.length === 0 && !parsed.chainId) {
    return settingsBasePath;
  }

  if (parsed.chainId) {
    return buildPromptTemplatesPath(promptTemplatesBasePath, parsed.groupIds);
  }

  return buildPromptTemplatesPath(promptTemplatesBasePath, parsed.groupIds.slice(0, -1));
}
