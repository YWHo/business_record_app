import { describe, expect, it } from 'vitest';
import configuration from '../wrangler.jsonc?raw';

const demoStart = configuration.indexOf('"demo": {');
const productionStart = configuration.indexOf('"production": {');
const demo = configuration.slice(demoStart, productionStart);
const production = configuration.slice(productionStart);
const captures = (source: string, pattern: RegExp) =>
  new Set([...source.matchAll(pattern)].map((match) => match[1]));

describe('deployed environment resource separation', () => {
  it('keeps demo resources disjoint and omits document storage', () => {
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
    expect(demo).toContain('"r2_buckets": []');
    expect(demo).not.toContain('"binding": "DOCUMENTS"');
    expect(demo).not.toContain('business-records-production');
    expect(demo).toContain('"name": "DEMO_BURST_RATE_LIMITER"');
    expect(production).toContain('"binding": "DOCUMENTS"');
    expect(production).not.toContain('"name": "DEMO_BURST_RATE_LIMITER"');
    expect(production).not.toContain('business-records-demo-documents');
  });

  it('does not configure server-side demo authentication identities', () => {
    expect(demo).not.toContain('DEMO_AUTH_ENABLED');
    expect(demo).not.toContain('DEMO_OWNER_EMAIL');
    expect(production).not.toContain('DEMO_AUTH_ENABLED');
  });
});
