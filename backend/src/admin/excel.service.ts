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
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // 1. Extract embedded images mapping
        const imageMapping = await this.extractImagesFromZip(buffer, sheetName);
        console.log(`[ExcelService] Extracted ${Object.keys(imageMapping).length} embedded images.`);

        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
        if (rows.length === 0) throw new Error('Sheet is empty');

        console.log(`[ExcelService] Processing ${rows.length} raw rows from sheet: ${sheetName}`);
        console.log(`[ExcelService] First row:`, JSON.stringify(rows[0]));
        if (rows.length > 1) console.log(`[ExcelService] Second row:`, JSON.stringify(rows[1]));

        const normalize = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '').trim();

        const headerAliases: Record<string, string> = {
            'name': 'name', 'title': 'name', 'productname': 'name', 'product': 'name', 'label': 'name', 'item': 'name', 'itemname': 'name',
            'اسمبالعربي': 'name', 'الاسم': 'name', 'اسم': 'name', 'اسمالمنتج': 'name', 'المنتج': 'name', 'اسمباحث': 'name',
            'description': 'description', 'desc': 'description', 'details': 'description', 'info': 'description', 'note': 'description', 'notes': 'description',
            'الوصف': 'description', 'التفاصيل': 'description', 'وصف': 'description', 'ملاحظات': 'description',
            'price': 'price', 'cost': 'price', 'rate': 'price', 'amount': 'price', 'unitprice': 'price', 'saleprice': 'price', 'sellingprice': 'price',
            'السعر': 'price', 'سعرالبيع': 'price', 'سعر': 'price', 'القيمة': 'price', 'ثمن': 'price',
            'stock': 'stock', 'stockcount': 'stock', 'quantity': 'stock', 'qty': 'stock', 'count': 'stock', 'inventory': 'stock', 'available': 'stock',
            'الكمية': 'stock', 'المخزون': 'stock', 'العدد': 'stock', 'كمية': 'stock',
            'category': 'category', 'type': 'category', 'dept': 'category', 'department': 'category', 'group': 'category', 'section': 'category',
            'الفئة': 'category', 'القسم': 'category', 'التصنيف': 'category', 'نوع': 'category', 'فئة': 'category', 'صنف': 'category', 'المجموعة': 'category', 'مجموعة': 'category',
            'ean': 'ean', 'barcode': 'ean', 'upc': 'ean', 'sku': 'ean', 'code': 'ean', 'productcode': 'ean',
            'الباركود': 'ean', 'كودالمنتج': 'ean', 'كود': 'ean', 'رقم': 'ean',
            'unitsperpallet': 'unitsPerPallet', 'itemsperpallet': 'unitsPerPallet', 'palletunits': 'unitsPerPallet', 'palletqty': 'unitsPerPallet',
            'عددالوحداتفيالبالتة': 'unitsPerPallet', 'وحداتالبالتة': 'unitsPerPallet', 'البالتةفيهاكام': 'unitsPerPallet',
            'palletspershipment': 'palletsPerShipment', 'palletsperload': 'palletsPerShipment', 'shipmentpallets': 'palletsPerShipment',
            'عددالبالتاتفيالشحنة': 'palletsPerShipment', 'البالتاتفيالشحنة': 'palletsPerShipment', 'بالتاتالشحنة': 'palletsPerShipment',
        };

        // Find header row
        let headerRowIndex = -1;
        let mapping: Record<number, string> = {};

        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const tempMapping: Record<number, string> = {};
            let matches = 0;

            row.forEach((cell, idx) => {
                if (cell === undefined || cell === null || cell === '') return;
                const normalizedCell = normalize(String(cell));
                if (headerAliases[normalizedCell]) {
                    tempMapping[idx] = headerAliases[normalizedCell];
                    matches++;
                } else {
                    // Partial match
                    for (const [alias, target] of Object.entries(headerAliases)) {
                        if (normalizedCell.includes(alias) || alias.includes(normalizedCell)) {
                            tempMapping[idx] = target;
                            matches++;
                            break;
                        }
                    }
                }
            });

            if (matches >= 2) {
                headerRowIndex = i;
                mapping = tempMapping;
                console.log(`[ExcelService] Header found at row ${i} with ${matches} matches`);
                break;
            }
        }

        // FALLBACK: try sheet_to_json with auto headers
        if (headerRowIndex === -1) {
            console.warn('[ExcelService] No header via 2D array, trying auto-json...');
            const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];
            if (jsonRows.length > 0) {
                const firstKeys = Object.keys(jsonRows[0]);
                console.log('[ExcelService] Auto keys:', firstKeys);

                const autoMapping: Record<string, string> = {};
                for (const key of firstKeys) {
                    const nk = normalize(key);
                    if (headerAliases[nk]) {
                        autoMapping[key] = headerAliases[nk];
                    } else {
                        for (const [alias, target] of Object.entries(headerAliases)) {
                            if (nk.includes(alias) || alias.includes(nk)) {
                                autoMapping[key] = target;
                                break;
                            }
                        }
                    }
                }
                console.log('[ExcelService] Auto mapping:', autoMapping);
                return this.processJsonRows(jsonRows, autoMapping, dtoClass);
            }

            // Last resort
            headerRowIndex = 0;
            rows[0].forEach((cell, idx) => {
                const normalizedCell = normalize(String(cell));
                mapping[idx] = headerAliases[normalizedCell] || normalizedCell;
            });
        }

        console.log('[ExcelService] Final Mapping:', mapping);

        const results: ValidationRow[] = [];
        let successCount = 0;
        let errorCount = 0;

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const hasData = row.some(c => c !== undefined && c !== null && String(c).trim() !== '');
            if (!hasData) continue;

            const normalizedRow: Record<string, any> = {};
            row.forEach((cell, idx) => {
                const targetKey = mapping[idx];
                if (targetKey) normalizedRow[targetKey] = cell;
            });

            this.coerceTypes(normalizedRow);

            // 2. Attach embedded image if exists for this row
            if (imageMapping[i]) {
                normalizedRow.images = [imageMapping[i]];
            }

            if (i === headerRowIndex + 1) {
                console.log('[ExcelService] First data row after coercion:', JSON.stringify(normalizedRow));
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
        // Force strings
        if (row.name !== undefined && row.name !== null) row.name = String(row.name).trim();
        if (row.description !== undefined && row.description !== null) row.description = String(row.description).trim();
        if (row.category !== undefined && row.category !== null) row.category = String(row.category).trim();
        if (row.ean !== undefined && row.ean !== null) row.ean = String(row.ean).trim();

        // Force price to number
        if (row.price !== undefined && row.price !== null) {
            const p = parseFloat(String(row.price).replace(/[^0-9.-]/g, ''));
            row.price = isNaN(p) ? 0 : p;
        }
        // Force stock to number and clamp to max INT4 to prevent Prisma crashes
        if (row.stock !== undefined && row.stock !== null) {
            const s = parseInt(String(row.stock).replace(/[^0-9-]/g, ''), 10);
            row.stock = isNaN(s) ? 10 : Math.min(Math.max(s, 0), 2147483647);
        }

        if (row.unitsPerPallet !== undefined && row.unitsPerPallet !== null) {
            const val = parseInt(String(row.unitsPerPallet).replace(/[^0-9]/g, ''), 10);
            row.unitsPerPallet = isNaN(val) ? 0 : val;
        }

        if (row.palletsPerShipment !== undefined && row.palletsPerShipment !== null) {
            const val = parseInt(String(row.palletsPerShipment).replace(/[^0-9]/g, ''), 10);
            row.palletsPerShipment = isNaN(val) ? 0 : val;
        }

        // Defaults for missing required fields
        if (!row.name || String(row.name).trim() === '') row.name = 'Unnamed Product';
        if (!row.category || String(row.category).trim() === '') row.category = 'General';
        // Note: Do NOT default description to name to preserve the warning state for users
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
            'Date': order.date,
            'Customer': order.customer,
            'Supplier': order.supplier,
            'Total Amount': order.total,
            'Supplier Profit': order.supplierProfit,
            'Admin Profit': order.adminProfit,
            'Status': order.status,
            'Shipping Company': order.shippingCompany || 'N/A',
            'Shipping Cost': order.shippingCost || 0,
            'Items': order.items.map((i: any) => `${i.product} (x${i.quantity})`).join(', ')
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
        
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

        return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    }
}
