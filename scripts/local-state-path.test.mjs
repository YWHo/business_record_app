import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertLocalStatePath } from './local-state-path.mjs';

for (const [platform, paths, project] of [
  ['Windows', path.win32, 'C:\\projects\\business records'],
  ['POSIX', path.posix, '/projects/business records'],
]) {
  describe(`${platform} local reset safety`, () => {
    for (const testProfile of [false, true]) {
      it(`accepts only the exact ${testProfile ? 'test' : 'showcase'} state directory`, () => {
        const target = paths.resolve(
          project,
          '.wrangler/state',
          ...(testProfile ? ['e2e'] : []),
        );
        expect(() =>
          assertLocalStatePath(project, target, testProfile, paths),
        ).not.toThrow();
      });

      it(`rejects unexpected targets with test profile ${testProfile}`, () => {
        const targets = [
          project,
          paths.dirname(project),
          paths.resolve(project, '.wrangler'),
          paths.resolve(project, '.wrangler/state', testProfile ? '' : 'e2e'),
          paths.resolve(project, '.wrangler/state/e2e/nested'),
          paths.resolve(project, '../another-project/.wrangler/state'),
          paths.resolve(project, '../another-project/.wrangler/state/e2e'),
          paths.resolve(project, '.wrangler/state-backup'),
          '.wrangler/state',
        ];
        for (const target of targets) {
          expect(() =>
            assertLocalStatePath(project, target, testProfile, paths),
          ).toThrow('Refusing to reset unexpected path');
        }
      });
    }

    it('rejects a relative project directory', () => {
      expect(() =>
        assertLocalStatePath(
          'project',
          paths.resolve(project, '.wrangler/state/e2e'),
          true,
          paths,
        ),
      ).toThrow('Refusing to reset unexpected path');
    });
  });
}
