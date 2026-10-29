/**
 * Self-declared business types for wholesale trading accounts (not verified).
 * Ali FMCG serves bulk traders, so retail/consumer formats are deliberately absent.
 */
export const BUSINESS_TYPES = [
    'Wholesaler',
    'Distributor',
    'Importer',
    'Exporter / re-exporter',
    'Import–export trading company',
    'Brand owner / manufacturer',
    'Sourcing or procurement agent',
    'Other bulk-trading business',
] as const;
