import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import * as JSZip from 'jszip';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

export interface ValidationRow {
    rowNumber: number;
    success: boolean;
    data?: any;
    errors?: string[];
}

export interface ExcelReport {
    totalRows: number;
    successCount: number;
    errorCount: number;
    results: ValidationRow[];
}

@Injectable()
export class ExcelService {
    async processProductsExcel(buffer: Buffer, dtoClass: any): Promise<ExcelReport> {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error('Excel file has no sheets');
        }
        
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

        // 1. Extract embedded images mapping
        const imageMapping = await this.extractImagesFromZip(buffer, sheetName);
        console.log(`[ExcelService] Extracted ${Object.keys(imageMapping).length} embedded images.`);

        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
        if (rows.length === 0) throw new Error('Sheet is empty');

        console.log(`[ExcelService] Processing ${rows.length} raw rows from sheet: ${sheetName}`);

        const normalize = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '').trim();

        const headerAliases: Record<string, string> = {
            // ── name ──────────────────────────────────────────────────────────
            'name': 'name', 'title': 'name', 'productname': 'name', 'product': 'name',
            'label': 'name', 'item': 'name', 'itemname': 'name',
            'اسمبالعربي': 'name', 'الاسم': 'name', 'اسم': 'name', 'اسمالمنتج': 'name',
            'المنتج': 'name', 'اسمباحث': 'name',
            // ── description ───────────────────────────────────────────────────
            'description': 'description', 'desc': 'description', 'details': 'description',
            'info': 'description', 'note': 'description', 'notes': 'description',
            'الوصف': 'description', 'التفاصيل': 'description', 'وصف': 'description', 'ملاحظات': 'description',
            // ── price ─────────────────────────────────────────────────────────
            'price': 'price', 'cost': 'price', 'rate': 'price', 'amount': 'price',
            'unitprice': 'price', 'saleprice': 'price', 'sellingprice': 'price', 'baseprice': 'price',
            'السعر': 'price', 'سعرالبيع': 'price', 'سعر': 'price', 'القيمة': 'price', 'ثمن': 'price',
            // ── stock ─────────────────────────────────────────────────────────
            'stock': 'stock', 'stockcount': 'stock', 'quantity': 'stock', 'qty': 'stock',
            'count': 'stock', 'inventory': 'stock', 'available': 'stock',
            'availablephysicalincases': 'stock', 'availableincases': 'stock',
            'availablephysical': 'stock', 'physicalqty': 'stock',
            'الكمية': 'stock', 'المخزون': 'stock', 'العدد': 'stock', 'كمية': 'stock',
            // ── category ──────────────────────────────────────────────────────
            'category': 'category', 'type': 'category', 'dept': 'category',
            'department': 'category', 'group': 'category', 'section': 'category',
            'الفئة': 'category', 'القسم': 'category', 'التصنيف': 'category',
            'نوع': 'category', 'فئة': 'category', 'صنف': 'category',
            'المجموعة': 'category', 'مجموعة': 'category',
            // ── ean / item number ─────────────────────────────────────────────
            'ean': 'ean', 'barcode': 'ean', 'upc': 'ean', 'sku': 'ean',
            'code': 'ean', 'productcode': 'ean', 'itemnumber': 'ean', 'itemno': 'ean',
            'itemnr': 'ean', 'artikelnummer': 'ean', 'articlenumber': 'ean',
            'الباركود': 'ean', 'كودالمنتج': 'ean', 'كود': 'ean', 'رقم': 'ean',
            // ── unitsPerCase (Pcs/case — values like "C24") ───────────────────
            'unitspercase': 'unitsPerCase', 'pcspercase': 'unitsPerCase',
            'pcscase': 'unitsPerCase', 'piecespercase': 'unitsPerCase',
            'itemspercase': 'unitsPerCase', 'qtypercase': 'unitsPerCase',
            'percase': 'unitsPerCase',
            'عددالوحداتفيالكرتون': 'unitsPerCase', 'وحداتالكرتون': 'unitsPerCase',
            // ── casesPerPallet ────────────────────────────────────────────────
            'casesperpallet': 'casesPerPallet', 'boxesperpallet': 'casesPerPallet',
            'cartonsperpallets': 'casesPerPallet', 'caseperpallet': 'casesPerPallet',
            'كراتينالبالتة': 'casesPerPallet', 'عددالكراتينفيالبالتة': 'casesPerPallet',
            // ── unitsPerPallet ────────────────────────────────────────────────
            'unitsperpallet': 'unitsPerPallet', 'itemsperpallet': 'unitsPerPallet',
            'palletunits': 'unitsPerPallet', 'palletqty': 'unitsPerPallet',
            'availablephysicalinpallets': 'unitsPerPallet',
            'عددالوحداتفيالبالتة': 'unitsPerPallet', 'وحداتالبالتة': 'unitsPerPallet',
            'البالتةفيهاكام': 'unitsPerPallet',
            // ── palletsPerShipment ────────────────────────────────────────────
            'palletspershipment': 'palletsPerShipment', 'palletsperload': 'palletsPerShipment',
            'shipmentpallets': 'palletsPerShipment',
            'عددالبالتاتفيالشحنة': 'palletsPerShipment', 'البالتاتفيالشحنة': 'palletsPerShipment',
            'بالتاتالشحنة': 'palletsPerShipment',
            // ── brand ─────────────────────────────────────────────────────────
            'brand': 'brand', 'make': 'brand', 'manufacturer': 'brand',
            'براند': 'brand', 'الماركة': 'brand', 'الشركةالمصنعة': 'brand',
            // ── unit ──────────────────────────────────────────────────────────
            'unit': 'unit', 'measure': 'unit', 'packaging': 'unit',
            'الوحدة': 'unit', 'التعبئة': 'unit',
            // ── shelfLife / expiry ────────────────────────────────────────────
            'expirydate': 'shelfLife', 'expiry': 'shelfLife', 'bestbefore': 'shelfLife',
            'batchnumber': 'ean', 'batchno': 'ean', 'lot': 'ean', 'lotnumber': 'ean',
        };

        // ── Header detection ────────────────────────────────────────────────
        // Some supplier files split the header across TWO rows, e.g.:
        //   Row 0: "Item number" | "Item name" | "Batch number/" | "Available physical" | "Pcs/case" | ...
        //   Row 1:  <empty>      |   <empty>   | "Expiry Date"   | "in CASES !!"        |   <empty>  | ...
        // We merge consecutive candidate rows to handle this pattern.
        const matchRow = (row: any[]): { mapping: Record<number, string>; matches: number } => {
            const tempMapping: Record<number, string> = {};
            let matches = 0;
            row.forEach((cell, idx) => {
                if (cell === undefined || cell === null || cell === '') return;
                const normalizedCell = normalize(String(cell));
                if (headerAliases[normalizedCell]) {
                    tempMapping[idx] = headerAliases[normalizedCell];
                    matches++;
                } else {
                    for (const [alias, target] of Object.entries(headerAliases)) {
                        if (normalizedCell.length > 2 && (normalizedCell.includes(alias) || alias.includes(normalizedCell))) {
                            tempMapping[idx] = target;
                            matches++;
                            break;
                        }
                    }
                }
            });
            return { mapping: tempMapping, matches };
        };

        let headerRowIndex = -1;
        let mapping: Record<number, string> = {};

        for (let i = 0; i < Math.min(rows.length, 30); i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const { mapping: m1, matches: c1 } = matchRow(row);

            // If next row exists and is a sub-header continuation, merge it
            let mergedMapping = { ...m1 };
            let totalMatches = c1;

            if (i + 1 < rows.length) {
                const nextRow = rows[i + 1] || [];
                const { mapping: m2, matches: c2 } = matchRow(nextRow);
                // Accept the merge if the next row has at least 1 match AND
                // most of its non-empty cells are header-like (not data)
                const nextNonEmpty = nextRow.filter(c => c !== undefined && c !== null && String(c).trim() !== '').length;
                const nextIsSubHeader = c2 >= 1 && (c2 / Math.max(nextNonEmpty, 1)) > 0.3;
                if (nextIsSubHeader) {
                    // Merge: second row fills gaps where first row had no match
                    for (const [col, target] of Object.entries(m2)) {
                        if (!mergedMapping[col]) {
                            mergedMapping[col] = target;
                            totalMatches++;
                        }
                    }
                }
            }

            if (totalMatches >= 2) {
                headerRowIndex = i;
                mapping = mergedMapping;
                // Skip the sub-header row in data processing
                if (i + 1 < rows.length) {
                    const nextRow = rows[i + 1] || [];
                    const { matches: c2 } = matchRow(nextRow);
                    const nextNonEmpty = nextRow.filter(c => c !== undefined && c !== null && String(c).trim() !== '').length;
                    if (c2 >= 1 && (c2 / Math.max(nextNonEmpty, 1)) > 0.3) {
                        headerRowIndex = i + 1; // data starts after sub-header
                    }
                }
                console.log(`[ExcelService] Header found at row ${i} with ${totalMatches} matches. Mapping:`, mapping);
                break;
            }
        }

        // FALLBACK: try sheet_to_json with auto headers
        if (headerRowIndex === -1) {
            console.warn('[ExcelService] No header via matching, trying auto-json fallback...');
            const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];
            if (jsonRows.length > 0) {
                const firstKeys = Object.keys(jsonRows[0]);
                const autoMapping: Record<string, string> = {};
                for (const key of firstKeys) {
                    const nk = normalize(key);
                    if (headerAliases[nk]) {
                        autoMapping[key] = headerAliases[nk];
                    } else {
                        for (const [alias, target] of Object.entries(headerAliases)) {
                            if (nk.length > 2 && (nk.includes(alias) || alias.includes(nk))) {
                                autoMapping[key] = target;
                                break;
                            }
                        }
                    }
                }
                return this.processJsonRows(jsonRows, autoMapping, dtoClass);
            }
            throw new Error('Could not identify header row in Excel file. Please use the provided template.');
        }

        const results: ValidationRow[] = [];
        let successCount = 0;
        let errorCount = 0;

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            
            const hasData = row.some(c => c !== undefined && c !== null && String(c).trim() !== '');
            if (!hasData) continue;

            const normalizedRow: Record<string, any> = {};
            row.forEach((cell, idx) => {
                const targetKey = mapping[idx];
                if (targetKey) normalizedRow[targetKey] = cell;
            });

            this.coerceTypes(normalizedRow);

            // Attach embedded image if exists for this row
            if (imageMapping[i]) {
                normalizedRow.images = [imageMapping[i]];
            }

            const instance = plainToInstance(dtoClass, normalizedRow, { enableImplicitConversion: true });
            const errors = await validate(instance as any);

            if (errors.length > 0) {
                errorCount++;
                const errorMessages = errors.map(err =>
                    `${err.property}: ${Object.values(err.constraints || {}).join(', ')}`
                );
                results.push({ rowNumber: i + 1, success: false, errors: errorMessages });
            } else {
                successCount++;
                results.push({ rowNumber: i + 1, success: true, data: instance });
            }
        }

        return { totalRows: results.length, successCount, errorCount, results };
    }

    private coerceTypes(row: Record<string, any>) {
        const arabicToEnglish = (s: string) => {
            const map: any = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
            return s.replace(/[٠-٩]/g, m => map[m]);
        };

        // ── Helper: strip "C24" / "P12" prefix formats to get the number ──────
        const parseQtyField = (raw: any): number => {
            if (raw === undefined || raw === null) return 0;
            // Handle "C24", "P12", "c 24", Arabic numerals, commas as decimals, etc.
            const s = arabicToEnglish(String(raw))
                .replace(/^[a-zA-Z\s]+/, '') // strip leading letters (C, P, BOX …)
                .replace(/,/g, '.')           // European decimal comma → dot
                .replace(/[^0-9.]/g, '');
            const v = parseFloat(s);
            return isNaN(v) ? 0 : Math.round(v); // logistics fields are always integers
        };

        // Force strings
        if (row.name !== undefined && row.name !== null) row.name = String(row.name).trim();
        if (row.description !== undefined && row.description !== null) row.description = String(row.description).trim();
        if (row.category !== undefined && row.category !== null) row.category = String(row.category).trim();
        if (row.ean !== undefined && row.ean !== null) row.ean = String(row.ean).trim();
        if (row.brand !== undefined && row.brand !== null) row.brand = String(row.brand).trim();
        if (row.unit !== undefined && row.unit !== null) row.unit = String(row.unit).trim().toLowerCase();
        if (row.shelfLife !== undefined && row.shelfLife !== null) row.shelfLife = String(row.shelfLife).trim();

        // Force price to number (handle European decimals like "1.58", "0.38")
        if (row.price !== undefined && row.price !== null) {
            const cleanStr = arabicToEnglish(String(row.price))
                .replace(/,/g, '.')
                .replace(/[^0-9.-]/g, '');
            const p = parseFloat(cleanStr);
            row.price = isNaN(p) ? 0 : p;
        }

        // Force stock to number — strip "in CASES" suffix if present
        if (row.stock !== undefined && row.stock !== null) {
            const cleanStr = arabicToEnglish(String(row.stock)).replace(/[^0-9-]/g, '');
            const s = parseInt(cleanStr, 10);
            row.stock = isNaN(s) ? 10 : Math.min(Math.max(s, 0), 2147483647);
        }

        // Logistics fields — all handle "C24" / "P403" style values
        if (row.unitsPerCase !== undefined && row.unitsPerCase !== null) {
            row.unitsPerCase = parseQtyField(row.unitsPerCase);
        }
        if (row.casesPerPallet !== undefined && row.casesPerPallet !== null) {
            row.casesPerPallet = parseQtyField(row.casesPerPallet);
        }
        if (row.unitsPerPallet !== undefined && row.unitsPerPallet !== null) {
            // If both unitsPerCase and casesPerPallet are set, derive unitsPerPallet
            if (row.unitsPerCase && row.casesPerPallet) {
                row.unitsPerPallet = row.unitsPerCase * row.casesPerPallet;
            } else {
                row.unitsPerPallet = parseQtyField(row.unitsPerPallet);
            }
        } else if (row.unitsPerCase && row.casesPerPallet) {
            // Auto-derive unitsPerPallet even if column wasn't in the file
            row.unitsPerPallet = row.unitsPerCase * row.casesPerPallet;
        }

        if (row.palletsPerShipment !== undefined && row.palletsPerShipment !== null) {
            row.palletsPerShipment = parseQtyField(row.palletsPerShipment);
        }

        // Defaults for missing required fields
        if (!row.name || String(row.name).trim() === '') row.name = 'Unnamed Product';
        if (!row.category || String(row.category).trim() === '') row.category = 'General';
        if (!row.description) row.description = "";
        if (row.price === undefined || row.price === null) row.price = 0;
        if (row.stock === undefined || row.stock === null) row.stock = 10;
    }

    private async processJsonRows(jsonRows: Record<string, any>[], keyMapping: Record<string, string>, dtoClass: any): Promise<ExcelReport> {
        const results: ValidationRow[] = [];
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < jsonRows.length; i++) {
            const raw = jsonRows[i];
            const hasData = Object.values(raw).some(v => v !== undefined && v !== null && String(v).trim() !== '');
            if (!hasData) continue;

            const normalizedRow: Record<string, any> = {};
            for (const [originalKey, value] of Object.entries(raw)) {
                const targetKey = keyMapping[originalKey];
                if (targetKey) {
                    normalizedRow[targetKey] = value;
                } else {
                    const nk = originalKey.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (['name', 'description', 'price', 'stock', 'category', 'ean'].includes(nk)) {
                        normalizedRow[nk] = value;
                    }
                }
            }

            this.coerceTypes(normalizedRow);

            if (i === 0) {
                console.log('[ExcelService] First JSON row after coercion:', JSON.stringify(normalizedRow));
            }

            const instance = plainToInstance(dtoClass, normalizedRow, { enableImplicitConversion: true });
            const errors = await validate(instance as any);

            if (errors.length > 0) {
                errorCount++;
                const errorMessages = errors.map(err =>
                    `${err.property}: ${Object.values(err.constraints || {}).join(', ')}`
                );
                results.push({ rowNumber: i + 2, success: false, errors: errorMessages });
            } else {
                successCount++;
                results.push({ rowNumber: i + 2, success: true, data: instance });
            }
        }

        return { totalRows: results.length, successCount, errorCount, results };
    }

    /**
     * Attempts to extract floating/embedded images from the XLSX ZIP archive.
     * Returns a map of row indices (0-based) to base64 data URIs.
     */
    private async extractImagesFromZip(buffer: Buffer, sheetName: string): Promise<Record<number, string>> {
        const imageMapping: Record<number, string> = {};
        try {
            const zip = await JSZip.loadAsync(buffer);

            // XLSX structure:
            // xl/worksheets/sheet1.xml -> defines relationship to drawing (e.g. rId1)
            // xl/worksheets/_rels/sheet1.xml.rels -> maps rId1 to Target="../drawings/drawing1.xml"
            // xl/drawings/drawing1.xml -> defines anchor cells (row/col) and relationship to image (e.g. rId1)
            // xl/drawings/_rels/drawing1.xml.rels -> maps rId1 to Target="../media/image1.jpeg"
            // xl/media/image1.jpeg -> actual physical image

            // Simplify: Just find drawing1.xml and its rels for now, assuming 1 main sheet.
            let drawingPath: string | null = null;
            let relsPath: string | null = null;

            // Find drawings
            zip.folder('xl/drawings/')?.forEach((relativePath, file) => {
                if (relativePath.endsWith('.xml') && !relativePath.includes('_rels')) {
                    drawingPath = `xl/drawings/${relativePath}`;
                    relsPath = `xl/drawings/_rels/${relativePath}.rels`;
                }
            });

            if (!drawingPath || !relsPath) {
                console.log('[ExcelService] No drawings found in workbook.');
                return imageMapping;
            }

            const drawingXml = await zip.file(drawingPath)?.async('string');
            const relsXml = await zip.file(relsPath)?.async('string');

            if (!drawingXml || !relsXml) return imageMapping;

            // Simple regex parsers (XML parsing in Node can be heavy, regex is sufficient for standard anchors)
            // Parse rels to map rId -> media path
            const relMap: Record<string, string> = {};
            const relMatchRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g;
            let relMatch;
            while ((relMatch = relMatchRegex.exec(relsXml)) !== null) {
                const target = relMatch[2]; // e.g. "../media/image1.jpeg"
                const cleanTarget = target.replace('../', 'xl/');
                relMap[relMatch[1]] = cleanTarget;
            }

            // Parse drawings to map row -> rId
            // TwoCellAnchor or OneCellAnchor contain <xdr:from><xdr:row>Y</xdr:row>... and <a:blip r:embed="rIdX">
            const anchorBlocks = drawingXml.split(/<xdr:(?:one|two)CellAnchor/i);

            for (let i = 1; i < anchorBlocks.length; i++) {
                const block = anchorBlocks[i];

                // Extract Row
                const rowMatch = block.match(/<xdr:row>([^<]+)<\/xdr:row>/);
                if (!rowMatch) continue;
                const rowIndex = parseInt(rowMatch[1], 10);

                // Extract embed ID
                const embedMatch = block.match(/<a:blip[^>]*r:embed="([^"]+)"/i);
                if (!embedMatch) continue;
                const embedId = embedMatch[1];

                const mediaPath = relMap[embedId];
                if (mediaPath && rowIndex >= 0) {
                    const mediaFile = zip.file(mediaPath);
                    if (mediaFile) {
                        const ext = mediaPath.split('.').pop()?.toLowerCase() || 'jpeg';
                        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
                        const base64 = await mediaFile.async('base64');
                        imageMapping[rowIndex] = `data:${mime};base64,${base64}`;
                    }
                }
            }

            return imageMapping;
        } catch (error) {
            console.error('[ExcelService] Error extracting images from ZIP:', error);
            return {};
        }
    }

    async generateOrdersExcel(orders: any[]): Promise<Buffer> {
        const data = orders.map(order => ({
            'Order ID': order.id,
            'Date': new Date(order.date).toLocaleDateString(),
            'Status': order.status,
            'Customer Name': order.customer,
            'Supplier Name': order.supplier,
            'Total Amount': order.total,
            'Supplier Share': order.supplierProfit || 0,
            'Admin Commission': order.adminProfit || 0,
            'Shipping Company': order.shippingCompany || 'N/A',
            'Shipping Cost': order.shippingCost || 0,
            'Order Items': order.items.map((i: any) => `${i.product} (x${i.quantity})`).join('; ')
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Detailed Orders');
        
        return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    }

    async generateFinancialStatementExcel(summary: any, transactions: any[]): Promise<Buffer> {
        const workbook = XLSX.utils.book_new();

        // 1. Summary Sheet
        const summaryRows = [
            ['Atlantis Financial Statement'],
            ['Generated At', new Date().toLocaleString()],
            ['Period', summary.period],
            [],
            ['Metrics', 'Value'],
            ['Total Orders', summary.totalOrders],
            ['Gross Revenue', summary.totalRevenue],
            ['Platform Gross Profit', summary.platformRevenue],
            ['Supplier Net Payouts', summary.supplierRevenue],
            ['Paid Orders', summary.paidOrders],
            ['Pending Orders', summary.pendingOrders],
            ['Cancelled Orders', summary.cancelledOrders],
        ];
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

        // 2. Transactions Sheet
        const txData = transactions.map(tx => ({
            'Order ID': tx.orderId,
            'Date': tx.createdAt,
            'Status': tx.status,
            'Total Amount': tx.totalAmount,
            'Platform Fee': tx.platformFee,
            'Supplier Share': tx.supplierAmount,
            'Payment Status': tx.paymentStatus,
            'Settled': tx.escrowStatus === 'RELEASED' ? 'Yes' : 'No'
        }));
        const txSheet = XLSX.utils.json_to_sheet(txData);
        XLSX.utils.book_append_sheet(workbook, txSheet, 'Transactions');

        // 3. Full Details Sheet (Combined)
        const fullDetailsData = [
            ['Financial Statement Full Export'],
            ['Total Platform Revenue', summary.totalRevenue],
            ['Platform Gross Profit', summary.platformRevenue],
            ['Supplier Net Payouts', summary.supplierRevenue],
            [],
            ['Transaction Details'],
            ...txData.map(tx => Object.values(tx))
        ];
        const fullDetailsSheet = XLSX.utils.aoa_to_sheet(fullDetailsData);
        XLSX.utils.book_append_sheet(workbook, fullDetailsSheet, 'Full Details');

        return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    }
}
