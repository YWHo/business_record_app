import { describe, expect, it } from 'vitest';
import configuration from '../wrangler.jsonc?raw';

const demoStart = configuration.indexOf('"demo": {');
const productionStart = configuration.indexOf('"production": {');
const demo = configuration.slice(demoStart, productionStart);
const production = configuration.slice(productionStart);
const captures = (source: string, pattern: RegExp) =>
  new Set([...source.matchAll(pattern)].map((match) => match[1]));

describe('deployed environment resource separation', () => {
  it('uses disjoint demo and production storage and rate-limit bindings', () => {
    expect(demoStart).toBeGreaterThan(-1);
    expect(productionStart).toBeGreaterThan(demoStart);
    const demoResources = captures(
      demo,
      /"(?:database_id|bucket_name|namespace_id)":\s*"([^"]+)"/g,
    );
    const productionResources = captures(
      production,
      /"(?:database_id|bucket_name|namespace_id)":\s*"([^"]+)"/g,
    );

    expect(demoResources.size).toBeGreaterThan(0);
    for (const resource of demoResources) {
      expect(productionResources.has(resource)).toBe(false);
    }
    expect(demo).not.toContain('business-records-production');
    expect(production).not.toContain('business-records-demo-documents');
  });

  it('does not configure server-side demo authentication identities', () => {
    expect(demo).not.toContain('DEMO_AUTH_ENABLED');
    expect(demo).not.toContain('DEMO_OWNER_EMAIL');
    expect(production).not.toContain('DEMO_AUTH_ENABLED');
  });
});
