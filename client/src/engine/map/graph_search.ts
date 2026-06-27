export function breadthFirstSearch<T>(
  start: T,
  getNeighbors: (node: T) => Iterable<T>,
  options?: {
    canEnter?: (node: T) => boolean;
  }
): {
  order: T[];
  distance: Map<T, number>;
} {
  const order: T[] = [];
  const distance = new Map<T, number>([[start, 0]]);
  const queue: T[] = [start];

  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]!;
    order.push(node);

    const nextDistance = distance.get(node)! + 1;
    for (const neighbor of getNeighbors(node)) {
      if (distance.has(neighbor) || (options?.canEnter && !options.canEnter(neighbor))) {
        continue;
      }
      distance.set(neighbor, nextDistance);
      queue.push(neighbor);
    }
  }

  return { order, distance };
}

export function findNearestReachable<T>(
  start: T,
  getNeighbors: (node: T) => Iterable<T>,
  isTarget: (node: T) => boolean,
  canEnter: (node: T) => boolean
): {
  targets: T[];
  firstStepsToward: (target: T) => T[];
} {
  const { order, distance } = breadthFirstSearch(start, getNeighbors, { canEnter });

  const nearest = order.find(isTarget);
  const nearestDistance = nearest === undefined ? undefined : distance.get(nearest);
  const targets =
    nearestDistance === undefined
      ? []
      : order.filter((node) => distance.get(node) === nearestDistance && isTarget(node));

  const firstStepsToward = (target: T): T[] => {
    const targetDistance = distance.get(target);
    if (targetDistance === undefined || targetDistance === 0) {
      return [];
    }

    let frontier = [target];
    for (let depth = targetDistance; depth > 1; depth--) {
      const closer = new Set<T>();
      for (const node of frontier) {
        for (const neighbor of getNeighbors(node)) {
          if (distance.get(neighbor) === depth - 1) {
            closer.add(neighbor);
          }
        }
      }
      frontier = [...closer];
    }

    return frontier;
  };

  return { targets, firstStepsToward };
}
