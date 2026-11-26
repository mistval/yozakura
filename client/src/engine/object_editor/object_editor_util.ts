import { applyOperation, compare, unescapePathComponent, type Operation } from 'fast-json-patch';
import _ from 'lodash';
import z from 'zod';
import { newId } from '../../util/id.js';

const jsonPointerSchema = z
  .string()
  .refine((value) => value === '' || value.startsWith('/'), 'JSON Pointer must be empty or start with "/"');

export const jsonPatchOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), path: jsonPointerSchema, value: z.unknown() }),
  z.object({ op: z.literal('remove'), path: jsonPointerSchema }),
  z.object({ op: z.literal('replace'), path: jsonPointerSchema, value: z.unknown() }),
  z.object({ op: z.literal('move'), from: jsonPointerSchema, path: jsonPointerSchema }),
  z.object({ op: z.literal('copy'), from: jsonPointerSchema, path: jsonPointerSchema }),
  z.object({ op: z.literal('test'), path: jsonPointerSchema, value: z.unknown() }),
]);

export type JsonPatchOperation = z.infer<typeof jsonPatchOperationSchema>;

const fieldMetaSchema = z
  .object({
    title: z.string().optional(),
    readOnly: z.boolean().optional(),
    labelField: z.string().optional(),
  })
  .loose();

type FieldMeta = z.infer<typeof fieldMetaSchema>;

export interface ObjectEditorHumanReadableChange {
  op: JsonPatchOperation['op'];
  path: string;
  name: string;
  beforeValue: unknown;
  afterValue: unknown;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePointerSegments(pointer: string): string[] {
  if (pointer === '') {
    return [];
  }
  return pointer.slice(1).split('/').map(unescapePathComponent);
}

function buildPointerFromSegments(segments: readonly string[]): string {
  if (segments.length === 0) {
    return '';
  }
  return `/${segments.map((s) => s.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`;
}

function readValueAtSegments(root: unknown, segments: readonly string[]): unknown {
  let cursor: unknown = root;

  for (const segment of segments) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return undefined;
      }
      cursor = cursor[index];
      continue;
    }

    if (isPlainRecord(cursor) && Object.hasOwn(cursor, segment)) {
      cursor = cursor[segment];
      continue;
    }

    return undefined;
  }

  return cursor;
}

function parseFieldMeta(schema: z.ZodType): FieldMeta {
  const raw = schema.meta();
  if (!raw) {
    return {};
  }
  const parsed = fieldMetaSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

function mergeFieldMeta(inner: FieldMeta, outer: FieldMeta): FieldMeta {
  return {
    ...inner,
    ...outer,
    title: outer.title ?? inner.title,
    readOnly: outer.readOnly ?? inner.readOnly,
    labelField: outer.labelField ?? inner.labelField,
  };
}

function asZodType(candidate: unknown): z.ZodType | undefined {
  return candidate instanceof z.ZodType ? candidate : undefined;
}

function unwrapSchemaWithMeta(schema: z.ZodType): { schema: z.ZodType; meta: FieldMeta } {
  let current: z.ZodType = schema;
  let mergedMeta = parseFieldMeta(current);

  while (true) {
    let next: z.ZodType | undefined;

    if (
      current instanceof z.ZodOptional ||
      current instanceof z.ZodNullable ||
      current instanceof z.ZodDefault ||
      current instanceof z.ZodReadonly ||
      current instanceof z.ZodCatch
    ) {
      next = asZodType(current.def.innerType);
    } else if (current instanceof z.ZodPipe) {
      next = asZodType(current.def.in);
    }

    if (!next) {
      break;
    }

    mergedMeta = mergeFieldMeta(parseFieldMeta(next), mergedMeta);
    current = next;
  }

  return { schema: current, meta: mergedMeta };
}

type SchemaPathStep = {
  segment: string;
  schema: z.ZodType | undefined;
  meta: FieldMeta;
  kind: 'object_field' | 'array_item' | 'record_entry' | 'unknown';
};

function resolveSchemaPath(
  rootSchema: z.ZodType,
  segments: readonly string[]
): { rootMeta: FieldMeta; steps: SchemaPathStep[] } {
  const unwrappedRoot = unwrapSchemaWithMeta(rootSchema);
  let currentSchema: z.ZodType | undefined = unwrappedRoot.schema;
  const steps: SchemaPathStep[] = [];

  for (const segment of segments) {
    if (!currentSchema) {
      steps.push({ segment, schema: undefined, meta: {}, kind: 'unknown' });
      continue;
    }

    const unwrapped = unwrapSchemaWithMeta(currentSchema);
    const core = unwrapped.schema;

    if (core instanceof z.ZodObject) {
      const shape = core.shape;
      const propSchema = Object.hasOwn(shape, segment) ? shape[segment] : undefined;
      if (propSchema instanceof z.ZodType) {
        const propUnwrapped = unwrapSchemaWithMeta(propSchema);
        steps.push({
          segment,
          schema: propUnwrapped.schema,
          meta: propUnwrapped.meta,
          kind: 'object_field',
        });
        currentSchema = propUnwrapped.schema;
      } else {
        steps.push({ segment, schema: undefined, meta: {}, kind: 'object_field' });
        currentSchema = undefined;
      }
      continue;
    }

    if (core instanceof z.ZodArray) {
      const elemSchema = asZodType(core.element);
      const elemUnwrapped = elemSchema ? unwrapSchemaWithMeta(elemSchema) : undefined;
      steps.push({
        segment,
        schema: elemUnwrapped?.schema,
        meta: elemUnwrapped?.meta ?? {},
        kind: 'array_item',
      });
      currentSchema = elemUnwrapped?.schema;
      continue;
    }

    if (core instanceof z.ZodRecord) {
      const valSchema = asZodType(core.valueType);
      const valUnwrapped = valSchema ? unwrapSchemaWithMeta(valSchema) : undefined;
      steps.push({
        segment,
        schema: valUnwrapped?.schema,
        meta: valUnwrapped?.meta ?? {},
        kind: 'record_entry',
      });
      currentSchema = valUnwrapped?.schema;
      continue;
    }

    steps.push({ segment, schema: undefined, meta: {}, kind: 'unknown' });
    currentSchema = undefined;
  }

  return { rootMeta: unwrappedRoot.meta, steps };
}

function collectModifiedReadOnlyViolationsForReplaceRoot(
  rootSchema: z.ZodType,
  beforeDoc: unknown,
  afterDoc: unknown
): string | undefined {
  const diffOps = compareToJsonPatch(beforeDoc, afterDoc);
  for (const op of diffOps) {
    const violation = findReadOnlyViolationForOperation(rootSchema, beforeDoc, beforeDoc, op);
    if (violation) {
      return violation;
    }
  }
  return undefined;
}

function findReadOnlyViolationForOperation(
  rootSchema: z.ZodType,
  initialBeforeDoc: unknown,
  runningDoc: unknown,
  op: JsonPatchOperation
): string | undefined {
  if (op.op === 'test') {
    return undefined;
  }

  const checkTargetPath = (
    pointer: string,
    mode: 'write_existing_or_create' | 'remove_or_replace',
    newValue?: unknown
  ): string | undefined => {
    const segments = parsePointerSegments(pointer);
    if (segments.length === 0) {
      if (mode === 'remove_or_replace' && op.op === 'remove') {
        return 'Cannot remove root object.';
      }
      return collectModifiedReadOnlyViolationsForReplaceRoot(rootSchema, runningDoc, newValue);
    }

    const { steps } = resolveSchemaPath(rootSchema, segments);

    // Any ancestor segment marked readOnly blocks all descendant mutations.
    for (let i = 0; i < steps.length - 1; i += 1) {
      if (steps[i]?.meta.readOnly) {
        return `Cannot modify read-only field "${buildPointerFromSegments(segments.slice(0, i + 1))}"`;
      }
    }

    const leafStep = steps.at(-1);
    if (!leafStep?.meta.readOnly) {
      return undefined;
    }

    if (mode === 'remove_or_replace') {
      return `Cannot modify read-only field "${pointer}"`;
    }

    // For 'add': allow initializing readOnly fields on brand-new objects/items that didn't exist before the patch,
    // but block overwriting or adding readOnly properties inside already-existing objects.
    const parentSegments = segments.slice(0, -1);
    const parentInInitial = readValueAtSegments(initialBeforeDoc, parentSegments);
    const targetInRunning = readValueAtSegments(runningDoc, segments);
    if (parentInInitial !== undefined || targetInRunning !== undefined) {
      return `Cannot modify read-only field "${pointer}"`;
    }

    return undefined;
  };

  if (op.op === 'remove') {
    return checkTargetPath(op.path, 'remove_or_replace');
  }

  if (op.op === 'replace') {
    return checkTargetPath(op.path, 'remove_or_replace', op.value);
  }

  if (op.op === 'move') {
    return (
      checkTargetPath(op.from, 'remove_or_replace') ??
      checkTargetPath(
        op.path,
        'write_existing_or_create',
        readValueAtSegments(runningDoc, parsePointerSegments(op.from))
      )
    );
  }

  if (op.op === 'copy') {
    return checkTargetPath(
      op.path,
      'write_existing_or_create',
      readValueAtSegments(runningDoc, parsePointerSegments(op.from))
    );
  }

  return checkTargetPath(op.path, 'write_existing_or_create', op.value);
}

export function assertNoReadOnlyViolations(
  rootSchema: z.ZodType,
  beforeDoc: unknown,
  patch: readonly JsonPatchOperation[]
): void {
  let runningDoc = beforeDoc;

  for (const op of patch) {
    const violation = findReadOnlyViolationForOperation(rootSchema, beforeDoc, runningDoc, op);
    if (violation) {
      throw new Error(violation);
    }
    runningDoc = applyOperation(runningDoc, op, true, false).newDocument;
  }
}

function schemaHasReadOnlyDescendant(schema: z.ZodType): boolean {
  const { schema: unwrapped, meta } = unwrapSchemaWithMeta(schema);
  if (meta.readOnly) {
    return true;
  }

  if (unwrapped instanceof z.ZodObject) {
    return Object.values(unwrapped.shape).some(
      (fieldSchema) => fieldSchema instanceof z.ZodType && schemaHasReadOnlyDescendant(fieldSchema)
    );
  }

  if (unwrapped instanceof z.ZodArray) {
    const elementSchema = asZodType(unwrapped.element);
    return elementSchema ? schemaHasReadOnlyDescendant(elementSchema) : false;
  }

  if (unwrapped instanceof z.ZodRecord) {
    const valueSchema = asZodType(unwrapped.valueType);
    return valueSchema ? schemaHasReadOnlyDescendant(valueSchema) : false;
  }

  return false;
}

function getObjectWithIdElementInfo(schema: z.ZodType):
  | {
      elementSchema: z.ZodType;
      unwrappedObject: z.ZodObject;
    }
  | undefined {
  const { schema: unwrapped } = unwrapSchemaWithMeta(schema);
  if (!(unwrapped instanceof z.ZodArray)) {
    return undefined;
  }
  const elementSchema = asZodType(unwrapped.element);
  if (!elementSchema) {
    return undefined;
  }
  const unwrappedElement = unwrapSchemaWithMeta(elementSchema).schema;
  if (
    !(unwrappedElement instanceof z.ZodObject) ||
    !Object.hasOwn(unwrappedElement.shape, 'id') ||
    !isStringLikeSchema(unwrappedElement.shape.id)
  ) {
    return undefined;
  }
  return { elementSchema, unwrappedObject: unwrappedElement };
}

function indexPlainRecordsById(items: unknown): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(items)) {
    return byId;
  }
  for (const item of items) {
    if (isPlainRecord(item) && typeof item.id === 'string' && item.id !== '') {
      byId.set(item.id, item);
    }
  }
  return byId;
}

/**
 * Verifies across the entire resulting document that no `readOnly` field was changed relative to `beforeDoc`,
 * catching container-level `replace`, `remove`+`add` ID laundering, and array index shifts.
 */
export function assertNoReadOnlyStateViolations(
  rootSchema: z.ZodType,
  beforeDoc: unknown,
  afterDoc: unknown
): void {
  const check = (
    schema: z.ZodType,
    beforeVal: unknown,
    afterVal: unknown,
    segments: readonly string[]
  ): void => {
    const { schema: unwrapped, meta } = unwrapSchemaWithMeta(schema);
    if (meta.readOnly) {
      if (!_.isEqual(beforeVal, afterVal)) {
        throw new Error(`Cannot modify read-only field "${buildPointerFromSegments(segments) || '/'}"`);
      }
      return;
    }

    if (unwrapped instanceof z.ZodObject) {
      if (!isPlainRecord(beforeVal)) {
        return;
      }
      if (!isPlainRecord(afterVal) && !schemaHasReadOnlyDescendant(unwrapped)) {
        return;
      }
      const afterRecord = isPlainRecord(afterVal) ? afterVal : {};
      for (const [key, fieldSchema] of Object.entries(unwrapped.shape)) {
        if (!(fieldSchema instanceof z.ZodType)) {
          continue;
        }
        const childBefore = Object.hasOwn(beforeVal, key) ? beforeVal[key] : undefined;
        const childAfter = Object.hasOwn(afterRecord, key) ? afterRecord[key] : undefined;
        check(fieldSchema, childBefore, childAfter, [...segments, key]);
      }
      return;
    }

    if (unwrapped instanceof z.ZodArray) {
      if (!Array.isArray(beforeVal)) {
        return;
      }
      const elementSchema = asZodType(unwrapped.element);
      if (!elementSchema) {
        return;
      }
      if (!Array.isArray(afterVal)) {
        if (beforeVal.length > 0 && schemaHasReadOnlyDescendant(elementSchema)) {
          throw new Error(`Cannot modify read-only fields in "${buildPointerFromSegments(segments) || '/'}"`);
        }
        return;
      }

      const idArrayInfo = getObjectWithIdElementInfo(unwrapped);
      if (idArrayInfo) {
        const beforeById = indexPlainRecordsById(beforeVal);
        const matchedBeforeIds = new Set<string>();
        afterVal.forEach((item, index) => {
          if (
            isPlainRecord(item) &&
            typeof item.id === 'string' &&
            beforeById.has(item.id) &&
            !matchedBeforeIds.has(item.id)
          ) {
            matchedBeforeIds.add(item.id);
            check(idArrayInfo.elementSchema, beforeById.get(item.id), item, [...segments, String(index)]);
          }
        });
        return;
      }

      if (schemaHasReadOnlyDescendant(elementSchema)) {
        const sharedCount = Math.min(beforeVal.length, afterVal.length);
        for (let i = 0; i < sharedCount; i += 1) {
          check(elementSchema, beforeVal[i], afterVal[i], [...segments, String(i)]);
        }
      }
      return;
    }

    if (unwrapped instanceof z.ZodRecord) {
      if (!isPlainRecord(beforeVal) || !isPlainRecord(afterVal)) {
        return;
      }
      const valueSchema = asZodType(unwrapped.valueType);
      if (!valueSchema) {
        return;
      }
      for (const [key, afterEntry] of Object.entries(afterVal)) {
        if (Object.hasOwn(beforeVal, key)) {
          check(valueSchema, beforeVal[key], afterEntry, [...segments, key]);
        }
      }
    }
  };

  check(rootSchema, beforeDoc, afterDoc, []);
}

export const NEW_ID_PLACEHOLDER_PATTERN = /^new_id_[a-z0-9_]+$/;

export function replaceNewIdPlaceholdersInValue(
  value: unknown,
  newIdByPlaceholder: Map<string, string> = new Map()
): { value: unknown; generatedIds: Set<string> } {
  const replaceInner = (candidate: unknown): unknown => {
    if (typeof candidate === 'string') {
      if (NEW_ID_PLACEHOLDER_PATTERN.test(candidate)) {
        return newIdByPlaceholder.getOrInsertComputed(candidate, newId);
      }
      return candidate;
    }

    if (Array.isArray(candidate)) {
      let changed = false;
      const nextArray = candidate.map((item) => {
        const updatedItem = replaceInner(item);
        if (updatedItem !== item) {
          changed = true;
        }
        return updatedItem;
      });
      return changed ? nextArray : candidate;
    }

    if (isPlainRecord(candidate)) {
      let changed = false;
      const nextRecord: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(candidate)) {
        const updatedEntry = replaceInner(entry);
        if (updatedEntry !== entry) {
          changed = true;
        }
        nextRecord[key] = updatedEntry;
      }
      return changed ? nextRecord : candidate;
    }

    return candidate;
  };

  const nextValue = replaceInner(value);
  return {
    value: nextValue,
    generatedIds: new Set(newIdByPlaceholder.values()),
  };
}

export function replaceNewIdPlaceholdersInPatch(patch: readonly JsonPatchOperation[]): {
  patch: JsonPatchOperation[];
  generatedIds: Set<string>;
} {
  const newIdByPlaceholder = new Map<string, string>();
  const nextPatch = patch.map((op) => {
    if (!('value' in op)) {
      return op;
    }
    const { value: updatedValue } = replaceNewIdPlaceholdersInValue(op.value, newIdByPlaceholder);
    if (updatedValue === op.value) {
      return op;
    }
    return {
      ...op,
      value: updatedValue,
    };
  });

  return {
    patch: nextPatch,
    generatedIds: new Set(newIdByPlaceholder.values()),
  };
}

function isStringLikeSchema(schema: z.ZodType | undefined): boolean {
  if (!schema) {
    return false;
  }
  const { schema: unwrapped } = unwrapSchemaWithMeta(schema);
  return unwrapped instanceof z.ZodString;
}

function assertObjectIdValue(
  id: unknown,
  expectedOldId: string | undefined,
  pointer: string,
  generatedIds: ReadonlySet<string>,
  seenIds: Set<string>
): void {
  if (typeof id !== 'string' || id === '') {
    throw new Error(
      `Missing or empty "id" at "${pointer}". Newly created objects must use a unique "new_id_<name>" placeholder.`
    );
  }

  if (id !== expectedOldId && !generatedIds.has(id)) {
    throw new Error(
      `Invalid "id" "${id}" at "${pointer}". Newly created objects must use a unique "new_id_<name>" placeholder instead of hardcoding an ID.`
    );
  }

  if (seenIds.has(id)) {
    throw new Error(
      `Duplicate "id" "${id}" at "${pointer}". Every object "id" must be globally unique; use distinct "new_id_<name>" placeholders for new objects.`
    );
  }

  seenIds.add(id);
}

/**
 * Validates that every schema object with an `id` field keeps its container-matched existing ID
 * or uses a unique ID generated from a `new_id_*` placeholder in this edit.
 */
export function assertValidObjectIds(
  schema: z.ZodType,
  oldDoc: unknown,
  nextDoc: unknown,
  generatedIds: ReadonlySet<string>
): void {
  const seenIds = new Set<string>();

  const validateObjectFields = (
    objectSchema: z.ZodObject,
    oldObj: Record<string, unknown> | undefined,
    nextObj: Record<string, unknown>,
    segments: readonly string[],
    skipIdCheck: boolean
  ): void => {
    const shape = objectSchema.shape;
    if (!skipIdCheck && Object.hasOwn(shape, 'id') && isStringLikeSchema(shape.id)) {
      const oldId = oldObj && typeof oldObj.id === 'string' && oldObj.id !== '' ? oldObj.id : undefined;
      assertObjectIdValue(
        nextObj.id,
        oldId,
        buildPointerFromSegments([...segments, 'id']),
        generatedIds,
        seenIds
      );
    }

    for (const [key, fieldSchema] of Object.entries(shape)) {
      if (key === 'id' || !(fieldSchema instanceof z.ZodType) || !Object.hasOwn(nextObj, key)) {
        continue;
      }
      const childOld = oldObj && Object.hasOwn(oldObj, key) ? oldObj[key] : undefined;
      validateNode(fieldSchema, childOld, nextObj[key], [...segments, key]);
    }
  };

  const validateNode = (
    nodeSchema: z.ZodType,
    oldVal: unknown,
    nextVal: unknown,
    segments: readonly string[]
  ): void => {
    const { schema: unwrapped } = unwrapSchemaWithMeta(nodeSchema);

    if (unwrapped instanceof z.ZodArray && Array.isArray(nextVal)) {
      const idArrayInfo = getObjectWithIdElementInfo(unwrapped);
      if (idArrayInfo) {
        const oldById = indexPlainRecordsById(oldVal);
        nextVal.forEach((nextItem, index) => {
          const itemSegments = [...segments, String(index)];
          if (!isPlainRecord(nextItem)) {
            validateNode(idArrayInfo.elementSchema, undefined, nextItem, itemSegments);
            return;
          }
          const matchedOld = typeof nextItem.id === 'string' ? oldById.get(nextItem.id) : undefined;
          assertObjectIdValue(
            nextItem.id,
            matchedOld && typeof matchedOld.id === 'string' ? matchedOld.id : undefined,
            buildPointerFromSegments([...itemSegments, 'id']),
            generatedIds,
            seenIds
          );
          validateObjectFields(idArrayInfo.unwrappedObject, matchedOld, nextItem, itemSegments, true);
        });
        return;
      }

      const elementSchema = asZodType(unwrapped.element);
      if (!elementSchema) {
        return;
      }
      const oldArr = Array.isArray(oldVal) ? oldVal : undefined;
      nextVal.forEach((item, index) => {
        validateNode(elementSchema, oldArr?.[index], item, [...segments, String(index)]);
      });
      return;
    }

    if (unwrapped instanceof z.ZodRecord && isPlainRecord(nextVal)) {
      const valueSchema = asZodType(unwrapped.valueType);
      if (!valueSchema) {
        return;
      }
      const oldRecord = isPlainRecord(oldVal) ? oldVal : undefined;
      for (const [key, nextEntry] of Object.entries(nextVal)) {
        const oldEntry = oldRecord && Object.hasOwn(oldRecord, key) ? oldRecord[key] : undefined;
        validateNode(valueSchema, oldEntry, nextEntry, [...segments, key]);
      }
      return;
    }

    if (unwrapped instanceof z.ZodObject && isPlainRecord(nextVal)) {
      const oldObj = isPlainRecord(oldVal) ? oldVal : undefined;
      validateObjectFields(unwrapped, oldObj, nextVal, segments, false);
    }
  };

  validateNode(schema, oldDoc, nextDoc, []);
}

export function autoPopulatePersistedSubObjectFields(
  schema: z.ZodType,
  value: unknown,
  nowIso: string
): unknown {
  const { schema: unwrapped } = unwrapSchemaWithMeta(schema);

  if (unwrapped instanceof z.ZodArray && Array.isArray(value)) {
    const elementSchema = asZodType(unwrapped.element);
    if (!elementSchema) {
      return value;
    }
    let changed = false;
    const nextArray = value.map((item) => {
      const updatedItem = autoPopulatePersistedSubObjectFields(elementSchema, item, nowIso);
      if (updatedItem !== item) {
        changed = true;
      }
      return updatedItem;
    });
    return changed ? nextArray : value;
  }

  if (unwrapped instanceof z.ZodRecord && isPlainRecord(value)) {
    const valueSchema = asZodType(unwrapped.valueType);
    if (!valueSchema) {
      return value;
    }
    let changed = false;
    const nextRecord: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const updatedEntry = autoPopulatePersistedSubObjectFields(valueSchema, entry, nowIso);
      if (updatedEntry !== entry) {
        changed = true;
      }
      nextRecord[key] = updatedEntry;
    }
    return changed ? nextRecord : value;
  }

  if (unwrapped instanceof z.ZodObject && isPlainRecord(value)) {
    const shape = unwrapped.shape;
    let changed = false;
    const nextObj: Record<string, unknown> = { ...value };

    if (
      Object.hasOwn(shape, 'createdAt') &&
      isStringLikeSchema(shape.createdAt) &&
      (nextObj.createdAt === undefined || nextObj.createdAt === '')
    ) {
      nextObj.createdAt = nowIso;
      changed = true;
    }

    if (
      Object.hasOwn(shape, 'updatedAt') &&
      isStringLikeSchema(shape.updatedAt) &&
      (nextObj.updatedAt === undefined || nextObj.updatedAt === '')
    ) {
      nextObj.updatedAt = nowIso;
      changed = true;
    }

    for (const [key, fieldSchema] of Object.entries(shape)) {
      if (Object.hasOwn(nextObj, key) && fieldSchema instanceof z.ZodType) {
        const updatedChild = autoPopulatePersistedSubObjectFields(fieldSchema, nextObj[key], nowIso);
        if (updatedChild !== nextObj[key]) {
          nextObj[key] = updatedChild;
          changed = true;
        }
      }
    }

    return changed ? nextObj : value;
  }

  return value;
}

function humanizeKey(key: string): string {
  const spaced = key
    .replaceAll('_', ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  if (!spaced) {
    return key;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function getItemDisplayLabel(value: unknown, meta: FieldMeta): string | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const customLabel = meta.labelField ? value[meta.labelField] : undefined;
  if (typeof customLabel === 'string' && customLabel.trim()) {
    return customLabel.trim();
  }

  if (typeof value.name === 'string' && value.name.trim()) {
    return value.name.trim();
  }

  if (typeof value.firstName === 'string' && value.firstName.trim()) {
    const last = typeof value.lastName === 'string' ? value.lastName.trim() : '';
    return last ? `${value.firstName.trim()} ${last}` : value.firstName.trim();
  }

  if (typeof value.title === 'string' && value.title.trim()) {
    return value.title.trim();
  }

  if (typeof value.text === 'string' && value.text.trim()) {
    const trimmed = value.text.trim();
    return trimmed.length > 32 ? `${trimmed.slice(0, 29)}...` : trimmed;
  }

  if (typeof value.id === 'string' && value.id.trim()) {
    return value.id.trim();
  }

  return undefined;
}

function formatSemanticPathName(
  rootSchema: z.ZodType,
  segments: readonly string[],
  beforeDoc: unknown,
  afterDoc: unknown
): string {
  const { rootMeta, steps } = resolveSchemaPath(rootSchema, segments);
  const parts: string[] = [];

  if (rootMeta.title) {
    const rootLabel = getItemDisplayLabel(afterDoc, rootMeta) ?? getItemDisplayLabel(beforeDoc, rootMeta);
    parts.push(rootLabel ? `${rootLabel} (${rootMeta.title})` : rootMeta.title);
  }

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    const subSegments = segments.slice(0, i + 1);

    if (step.kind === 'array_item') {
      const itemValue =
        readValueAtSegments(afterDoc, subSegments) ?? readValueAtSegments(beforeDoc, subSegments);
      const itemLabel = getItemDisplayLabel(itemValue, step.meta);
      const typeLabel = step.meta.title;
      const numericIndex = Number(step.segment);
      const indexFallback = Number.isInteger(numericIndex) ? `#${numericIndex + 1}` : step.segment;

      if (itemLabel && typeLabel) {
        parts.push(`${itemLabel} (${typeLabel})`);
      } else if (itemLabel) {
        parts.push(itemLabel);
      } else if (typeLabel) {
        parts.push(`${typeLabel} ${indexFallback}`);
      } else {
        parts.push(indexFallback);
      }
      continue;
    }

    parts.push(step.meta.title ?? humanizeKey(step.segment));
  }

  return parts.join(' -> ') || 'Root Object';
}

export function compareToJsonPatch(beforeObj: unknown, afterObj: unknown): JsonPatchOperation[] {
  const ops: Operation[] = compare(
    isPlainRecord(beforeObj) || Array.isArray(beforeObj) ? beforeObj : {},
    isPlainRecord(afterObj) || Array.isArray(afterObj) ? afterObj : {}
  );
  return jsonPatchOperationSchema.array().parse(ops.filter((op) => op.op !== '_get'));
}

export function computeHumanReadableChanges(
  schema: z.ZodType,
  oldObject: unknown,
  patch: readonly JsonPatchOperation[]
): ObjectEditorHumanReadableChange[] {
  const changes: ObjectEditorHumanReadableChange[] = [];
  let runningDoc = oldObject;

  for (const op of patch) {
    const rawSegments = parsePointerSegments(op.path);
    const effectiveSegments = [...rawSegments];

    if (op.op === 'add' && effectiveSegments.at(-1) === '-') {
      const parentVal = readValueAtSegments(runningDoc, effectiveSegments.slice(0, -1));
      if (Array.isArray(parentVal)) {
        effectiveSegments[effectiveSegments.length - 1] = String(parentVal.length);
      }
    }

    const nextDoc = applyOperation(runningDoc, op, true, false).newDocument;
    const beforeValue = op.op === 'add' ? undefined : readValueAtSegments(runningDoc, effectiveSegments);
    const afterValue = op.op === 'remove' ? undefined : readValueAtSegments(nextDoc, effectiveSegments);

    changes.push({
      op: op.op,
      path: buildPointerFromSegments(effectiveSegments),
      name: formatSemanticPathName(schema, effectiveSegments, runningDoc, nextDoc),
      beforeValue,
      afterValue,
    });

    runningDoc = nextDoc;
  }

  return changes;
}
