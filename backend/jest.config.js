/** Unit tests: `npm test` (ts-jest, no database needed). */
module.exports = {
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: 'src',
    testRegex: '.*\\.spec\\.ts$',
    transform: { '^.+\\.(t|j)s$': 'ts-jest' },
    testEnvironment: 'node',
};
