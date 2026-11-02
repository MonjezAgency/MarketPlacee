import type { default as Sharp } from 'sharp';

/** The package's types describe an ES default export; under require() the function is the module itself. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const sharp: typeof Sharp = require('sharp');
