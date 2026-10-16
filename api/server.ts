import serverModule from '../dist/server.cjs';

// In Node ESM importing a CommonJS bundle where module.exports = __toCommonJS(...)
// often attaches the exported object to default. We normalize this robustly:
const app = (serverModule && typeof serverModule === 'object' && 'default' in serverModule)
  ? (serverModule.default && typeof serverModule.default === 'object' && 'default' in serverModule.default ? serverModule.default.default : serverModule.default)
  : serverModule;

export default app;
