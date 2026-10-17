import landing from './landing';
import supplierShell from './supplierShell';
import supplierCatalog from './supplierCatalog';
import supplierOps from './supplierOps';
import supplierMoney from './supplierMoney';
import buyerAccount from './buyerAccount';
import support from './support';
import legacySupplier from './legacySupplier';
import catalogImport from './catalogImport';
import targetsPage from './targetsPage';
import productTour from './productTour';
import catalogFields from './catalogFields';
import supplierOverview from './supplierOverview';
import imageDiscovery from './imageDiscovery';

/** Every area dictionary (see define.ts). Order doesn't matter; names must be unique. */
export const SECTIONS = [landing, supplierShell, supplierCatalog, supplierOps, supplierMoney, buyerAccount, support, legacySupplier, catalogImport, targetsPage, productTour, catalogFields, supplierOverview, imageDiscovery] as const;
export type SectionName = (typeof SECTIONS)[number]['name'];
