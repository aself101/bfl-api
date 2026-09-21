#!/usr/bin/env tsx
/**
 * check-spec-drift — compare this wrapper against the live BFL OpenAPI spec.
 *
 * For every model in MODELS it checks, against https://api.bfl.ai/openapi.json:
 *
 *   1. the request path still exists and takes POST;
 *   2. the request schema's property set equals MODEL_FIELDS[model] exactly —
 *      a field the API added is a FAIL (the wrapper can't send it), and a field
 *      the API dropped is a FAIL (the wrapper sends a key the server no longer
 *      declares, which on a strict schema is a 422);
 *   3. every numeric range / enum the spec states has a matching entry in
 *      MODEL_CONSTRAINTS with the same bounds;
 *   4. the spec's output_format default equals MODELS[model].defaultOutputFormat.
 *
 * Where the wrapper is *stricter* than the spec (a max the spec doesn't state,
 * a divisibility rule) it reports INFO, not FAIL — those are deliberate.
 *
 * This exists because 1.7.1 shipped with `prompt_upsampling` on flux-2-pro,
 * which the API had already replaced with `disable_pup`, and nothing noticed
 * (docs/DECISIONS.md #6).
 *
 * Usage:
 *   npx tsx scripts/check-spec-drift.ts               # fetch live spec
 *   npx tsx scripts/check-spec-drift.ts --snapshot docs/openapi-snapshot-2026-09-20.json
 *   npx tsx scripts/check-spec-drift.ts --save docs/openapi-snapshot-<date>.json
 *   npx tsx scripts/check-spec-drift.ts --control     # prove the check can fail
 *
 * Exit 1 on any FAIL. `--control` exits 0 only if the seeded drift is caught.
 */

import { readFileSync, writeFileSync } from 'fs';
import { MODELS, MODEL_FIELDS, MODEL_CONSTRAINTS } from '../src/config.js';
import type { ModelEndpointKey, ModelConstraint, RangeConstraint } from '../src/types/index.js';

const SPEC_URL = 'https://api.bfl.ai/openapi.json';

type Json = Record<string, unknown>;
interface Prop {
  type?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  default?: unknown;
  const?: unknown;
}

/**
 * Spec fields the wrapper deliberately does not forward. Each needs a reason.
 */
const IGNORED_SPEC_FIELDS: Partial<Record<ModelEndpointKey, Record<string, string>>> = {
  'flux-2-flex': {
    input_image_blob_path: 'internal storage path, not a client input',
  },
};

/**
 * Legacy camelCase constraint keys → API field. Fields introduced in 2.0 live
 * under ModelConstraint.fields keyed by API name and need no mapping.
 */
const LEGACY_CONSTRAINT_FIELDS: Record<string, keyof ModelConstraint> = {
  width: 'width',
  height: 'height',
  steps: 'steps',
  guidance: 'guidance',
  image_prompt_strength: 'imagePromptStrength',
  safety_tolerance: 'safetyTolerance',
  finetune_strength: 'finetuneStrength',
  output_format: 'outputFormats',
  aspect_ratio: 'aspectRatios',
  top: 'top',
  bottom: 'bottom',
  left: 'left',
  right: 'right',
};

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const control = args.includes('--control');
const snapshotPath = flag('--snapshot');
const savePath = flag('--save');

async function loadSpec(): Promise<Json> {
  if (snapshotPath) {
    return JSON.parse(readFileSync(snapshotPath, 'utf8')) as Json;
  }
  const res = await fetch(SPEC_URL);
  if (!res.ok) throw new Error(`GET ${SPEC_URL} → ${res.status}`);
  const spec = (await res.json()) as Json;
  if (savePath) {
    writeFileSync(savePath, JSON.stringify(spec, null, 2) + '\n');
    console.log(`saved spec to ${savePath}`);
  }
  return spec;
}

function deref(spec: Json, node: Json): Json {
  const ref = node.$ref as string | undefined;
  if (!ref) return node;
  const name = ref.split('/').pop() as string;
  const schemas = (spec.components as Json).schemas as Json;
  return schemas[name] as Json;
}

/** Unwrap `anyOf: [X, null]` to X and pull the default up. */
function normalizeProp(spec: Json, raw: Json): Prop {
  const node = deref(spec, raw);
  const alts = (node.anyOf as Json[] | undefined)?.map((a) => deref(spec, a)) ?? [node];
  const core = alts.find((a) => a.type !== 'null') ?? alts[0];
  // A `oneOf`/`anyOf` of enum + const (video aspect_ratio: enum | 'auto') → merge into one enum
  const enumValues: unknown[] = [];
  for (const a of alts) {
    if (Array.isArray(a.enum)) enumValues.push(...(a.enum as unknown[]));
    if ('const' in a) enumValues.push(a.const);
  }
  const prop: Prop = { ...(core as Prop) };
  if (enumValues.length) prop.enum = [...new Set(enumValues)];
  if (raw.default !== undefined) prop.default = raw.default;
  return prop;
}

/**
 * Request properties for a path. For a discriminated `oneOf` body (flux-3-video)
 * the union of every variant's properties.
 */
function requestProps(spec: Json, path: string): { props: Record<string, Prop>; required: Set<string> } {
  const op = ((spec.paths as Json)[path] as Json | undefined)?.post as Json | undefined;
  if (!op) throw new Error(`no POST ${path}`);
  const body = deref(spec, ((op.requestBody as Json).content as Json)['application/json'] as Json);
  const schema = deref(spec, body.schema as Json);
  const variants = (schema.oneOf as Json[] | undefined)?.map((v) => deref(spec, v)) ?? [schema];
  const props: Record<string, Prop> = {};
  const required = new Set<string>();
  for (const v of variants) {
    for (const [name, raw] of Object.entries((v.properties ?? {}) as Record<string, Json>)) {
      const p = normalizeProp(spec, raw);
      // Merge ranges across variants (duration 5-20 vs 5-15): keep the widest.
      const existing = props[name];
      if (existing) {
        if (p.maximum !== undefined && existing.maximum !== undefined) p.maximum = Math.max(p.maximum, existing.maximum);
        if (p.minimum !== undefined && existing.minimum !== undefined) p.minimum = Math.min(p.minimum, existing.minimum);
        if (p.enum && existing.enum) p.enum = [...new Set([...existing.enum, ...p.enum])];
        if (p.default === undefined) p.default = existing.default;
      }
      props[name] = p;
    }
    for (const r of (v.required ?? []) as string[]) required.add(r);
  }
  return { props, required };
}

function ourConstraint(model: ModelEndpointKey, field: string): { range?: RangeConstraint; enum?: readonly unknown[] } | null {
  const c = MODEL_CONSTRAINTS[model];
  const fromFields = c.fields?.[field];
  if (fromFields) return fromFields;
  const legacyKey = LEGACY_CONSTRAINT_FIELDS[field];
  if (!legacyKey) return null;
  const v = c[legacyKey];
  if (v === undefined) return null;
  if (Array.isArray(v)) return { enum: v };
  return { range: v as RangeConstraint };
}

interface Finding {
  level: 'FAIL' | 'INFO';
  model: ModelEndpointKey;
  message: string;
}

function check(spec: Json): Finding[] {
  const findings: Finding[] = [];
  const fail = (model: ModelEndpointKey, message: string) => findings.push({ level: 'FAIL', model, message });
  const info = (model: ModelEndpointKey, message: string) => findings.push({ level: 'INFO', model, message });

  for (const model of Object.keys(MODELS) as ModelEndpointKey[]) {
    const { path } = MODELS[model];
    let props: Record<string, Prop>;
    try {
      ({ props } = requestProps(spec, path));
    } catch (e) {
      fail(model, `endpoint missing from spec: ${(e as Error).message}`);
      continue;
    }

    // 2. field set equality
    const specFields = new Set(Object.keys(props));
    const ignored = IGNORED_SPEC_FIELDS[model] ?? {};
    const ours = new Set(MODEL_FIELDS[model]);
    for (const f of specFields) {
      if (ours.has(f)) continue;
      if (f in ignored) {
        info(model, `spec field "${f}" ignored: ${ignored[f]}`);
        continue;
      }
      const p = props[f];
      const shape = p.enum ? `enum ${JSON.stringify(p.enum)}` : p.type ?? '?';
      fail(model, `API added field "${f}" (${shape}) that the wrapper does not forward`);
    }
    for (const f of ours) {
      if (!specFields.has(f)) fail(model, `wrapper forwards "${f}" but the API no longer declares it`);
    }

    // 3. ranges / enums
    for (const [field, p] of Object.entries(props)) {
      const hasRange = p.minimum !== undefined || p.maximum !== undefined;
      const hasEnum = Array.isArray(p.enum) && p.enum.length > 0;
      if (!hasRange && !hasEnum) continue;
      if (field === 'mode' && model !== 'flux-3-video' && model !== 'flux-outpaint') continue;

      const mine = ourConstraint(model, field);
      if (!mine) {
        // Fields with only a minimum and no maximum (FLUX.2 width/height) are
        // checked when we have a range; a missing constraint is still a FAIL
        // because the spec states something we don't enforce.
        fail(model, `spec constrains "${field}" (${describe(p)}) but MODEL_CONSTRAINTS has no entry`);
        continue;
      }
      if (hasRange) {
        if (!mine.range) {
          fail(model, `spec gives "${field}" a numeric range (${describe(p)}) but ours is an enum`);
        } else {
          if (p.minimum !== undefined && p.minimum !== mine.range.min)
            fail(model, `"${field}" minimum: spec ${p.minimum}, ours ${mine.range.min}`);
          if (p.maximum !== undefined && p.maximum !== mine.range.max)
            fail(model, `"${field}" maximum: spec ${p.maximum}, ours ${mine.range.max}`);
          if (p.maximum === undefined)
            info(model, `"${field}": spec states no maximum; wrapper enforces ${mine.range.max}`);
          const divisible = (mine.range as { divisibleBy?: number }).divisibleBy;
          if (divisible !== undefined && divisible > 1 && p.multipleOf === undefined)
            info(model, `"${field}": spec states no multipleOf; wrapper enforces ${divisible}`);
          if (p.multipleOf !== undefined && p.multipleOf !== divisible)
            fail(model, `"${field}" multipleOf: spec ${p.multipleOf}, ours ${divisible ?? 'none'}`);
        }
      }
      if (hasEnum) {
        if (!mine.enum) {
          fail(model, `spec gives "${field}" an enum ${JSON.stringify(p.enum)} but ours is a range`);
        } else {
          const specSet = new Set((p.enum as unknown[]).map(String));
          const ourSet = new Set(mine.enum.map(String));
          const missing = [...specSet].filter((v) => !ourSet.has(v));
          const extra = [...ourSet].filter((v) => !specSet.has(v));
          if (missing.length) fail(model, `"${field}" enum: spec has ${JSON.stringify(missing)} that ours lacks`);
          if (extra.length) fail(model, `"${field}" enum: ours has ${JSON.stringify(extra)} the spec lacks`);
        }
      }
    }

    // Ranges we enforce that the spec does not state at all
    const c = MODEL_CONSTRAINTS[model];
    for (const [field, key] of Object.entries(LEGACY_CONSTRAINT_FIELDS)) {
      if (c[key] !== undefined && !props[field]) {
        fail(model, `MODEL_CONSTRAINTS.${String(key)} set but the spec has no "${field}" field`);
      }
      if (c[key] !== undefined && props[field] && !props[field].enum && props[field].minimum === undefined && props[field].maximum === undefined) {
        info(model, `"${field}": wrapper constrains it; spec states nothing`);
      }
    }
    for (const field of Object.keys(c.fields ?? {})) {
      if (!props[field]) fail(model, `MODEL_CONSTRAINTS.fields.${field} set but the spec has no such field`);
    }

    // 4. output_format default
    const of = props.output_format;
    const declared = MODELS[model].defaultOutputFormat;
    if (of && of.default !== undefined && of.default !== declared)
      fail(model, `output_format default: spec "${String(of.default)}", MODELS "${declared}"`);
    if (!of && declared !== undefined)
      fail(model, `MODELS declares defaultOutputFormat "${declared}" but the spec has no output_format`);
    if (of && declared === undefined) fail(model, `spec has output_format but MODELS declares no defaultOutputFormat`);
  }

  return findings;
}

function describe(p: Prop): string {
  const bits: string[] = [];
  if (p.minimum !== undefined) bits.push(`min ${p.minimum}`);
  if (p.maximum !== undefined) bits.push(`max ${p.maximum}`);
  if (p.enum) bits.push(`enum ${JSON.stringify(p.enum)}`);
  return bits.join(', ');
}

/** Seed three kinds of drift into a copy of the spec and require each to be caught. */
function runControl(spec: Json): number {
  const clone = JSON.parse(JSON.stringify(spec)) as Json;
  const schemas = (clone.components as Json).schemas as Json;
  const erase = (schemas.Flux2EraseInputs as Json).properties as Json;
  // (a) range change
  (erase.dilate_pixels as Json).maximum = 30;
  // (b) added field
  erase.feather = { type: 'integer', title: 'Feather' };
  // (c) removed field
  delete (((schemas.Flux2Inputs as Json).properties as Json) as Json).disable_pup;
  // (d) default change
  ((((schemas.FluxKontextProInputs as Json).properties as Json).output_format as Json)).default = 'jpeg';

  const findings = check(clone).filter((f) => f.level === 'FAIL');
  const expect = [
    /flux-erase.*"dilate_pixels" maximum: spec 30, ours 25/,
    /flux-erase.*API added field "feather"/,
    /flux-2-pro.*forwards "disable_pup" but the API no longer declares it/,
    /flux-2-max.*forwards "disable_pup" but the API no longer declares it/,
    /kontext-pro.*output_format default: spec "jpeg", MODELS "png"/,
  ];
  let ok = true;
  for (const re of expect) {
    const hit = findings.some((f) => re.test(`${f.model} ${f.message}`));
    console.log(`${hit ? 'caught ' : 'MISSED '} ${re}`);
    if (!hit) ok = false;
  }
  // and the unmodified spec must be clean, or a "passing" run means nothing
  const baseline = check(spec).filter((f) => f.level === 'FAIL');
  console.log(`baseline FAIL count: ${baseline.length} (must be 0 for control to be meaningful)`);
  if (baseline.length) {
    ok = false;
    for (const f of baseline) console.log(`  ${f.model}: ${f.message}`);
  }
  console.log(ok ? '\ncontrol OK — the check can fail and passes on the real spec' : '\ncontrol FAILED');
  return ok ? 0 : 1;
}

const spec = await loadSpec();
if (control) {
  process.exit(runControl(spec));
}

const findings = check(spec);
const fails = findings.filter((f) => f.level === 'FAIL');
const infos = findings.filter((f) => f.level === 'INFO');
for (const f of infos) console.log(`INFO  ${f.model}: ${f.message}`);
for (const f of fails) console.log(`FAIL  ${f.model}: ${f.message}`);
console.log(
  `\n${Object.keys(MODELS).length} models checked against ${snapshotPath ?? SPEC_URL}: ${fails.length} FAIL, ${infos.length} INFO`
);
process.exit(fails.length ? 1 : 0);
