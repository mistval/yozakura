import { applyOperation, compare, unescapePathComponent, type Operation } from 'fast-json-patch';
import z from 'zod';
import { assert } from '../../errors/application_error.js';
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

export function replaceNewIdPlaceholdersInPatch(patch: readonly JsonPatchOperation[]): JsonPatchOperation[] {
  const newIdByPlaceholder = new Map<number, string>();
  const getOrCreateId = (digits: string) => {
    const num = Number(digits);
    assert(Number.isInteger(num), `Invalid newId placeholder argument: "${digits}"`);
    return newIdByPlaceholder.getOrInsertComputed(num, newId);
  };

  const serialized = JSON.stringify(patch);
  const replaced = serialized.replaceAll(/newId\(([0-9]+)\)/g, (_match, digits: string) =>
    getOrCreateId(digits)
  );
  if (replaced === serialized) {
    return [...patch];
  }

  return jsonPatchOperationSchema.array().parse(JSON.parse(replaced));
}

function isStringLikeSchema(schema: z.ZodType | undefined): boolean {
  if (!schema) {
    return false;
  }
  const { schema: unwrapped } = unwrapSchemaWithMeta(schema);
  return unwrapped instanceof z.ZodString;
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
      Object.hasOwn(shape, 'id') &&
      isStringLikeSchema(shape.id) &&
      (nextObj.id === undefined || nextObj.id === '')
    ) {
      nextObj.id = newId();
      changed = true;
    }

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
