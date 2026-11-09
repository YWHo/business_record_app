import path from 'node:path';

export function assertLocalStatePath(
  projectDirectory,
  stateDirectory,
  testProfile,
  paths = path,
) {
  const expected = testProfile
    ? paths.join('.wrangler', 'state', 'e2e')
    : paths.join('.wrangler', 'state');
  if (
    !paths.isAbsolute(projectDirectory) ||
    !paths.isAbsolute(stateDirectory) ||
    paths.relative(projectDirectory, stateDirectory) !== expected
  ) {
    throw new Error(`Refusing to reset unexpected path: ${stateDirectory}`);
  }
}
