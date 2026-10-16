import landing from './landing';
import supplierShell from './supplierShell';
import supplierCatalog from './supplierCatalog';
import supplierOps from './supplierOps';
import supplierMoney from './supplierMoney';
import buyerAccount from './buyerAccount';
import support from './support';
import legacySupplier from './legacySupplier';

/** Every area dictionary (see define.ts). Order doesn't matter; names must be unique. */
export const SECTIONS = [landing, supplierShell, supplierCatalog, supplierOps, supplierMoney, buyerAccount, support, legacySupplier] as const;
export type SectionName = (typeof SECTIONS)[number]['name'];
