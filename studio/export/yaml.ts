/**
 * The little YAML a DESIGN.md frontmatter needs: maps, lists, strings and
 * numbers, two-space indented, strings quoted whenever YAML could read them
 * as something else. No dependency, because the emitter is a page of code
 * and a parser is not: nothing here reads YAML.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

const PLAIN = /^[A-Za-z][A-Za-z0-9 _\-./]*$/;
const RESERVED = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~']);

/** A string as YAML reads it back as the same string. */
export function yamlString(s: string): string {
  if (s !== '' && PLAIN.test(s) && !RESERVED.has(s.toLowerCase()) && !/^\d/.test(s) && !/^[-.]/.test(s) && s.trim() === s) return s;
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

const key = (k: string): string => (/^[A-Za-z_][A-Za-z0-9_\-]*$/.test(k) ? k : yamlString(k));

export function toYaml(value: YamlValue, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return yamlString(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value
      .map((v) => {
        const inner = toYaml(v, indent + 1);
        return typeof v === 'object' && v !== null ? `${pad}-\n${inner}` : `${pad}- ${inner}`;
      })
      .join('\n');
  }
  const entries = Object.entries(value);
  if (!entries.length) return '{}';
  return entries
    .map(([k, v]) => {
      const scalar = v === null || typeof v !== 'object' || (Array.isArray(v) && !v.length) || (!Array.isArray(v) && !Object.keys(v).length);
      return scalar ? `${pad}${key(k)}: ${toYaml(v, indent + 1)}` : `${pad}${key(k)}:\n${toYaml(v, indent + 1)}`;
    })
    .join('\n');
}
