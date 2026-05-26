import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import QRCode from "qrcode";
import { print } from './print.js';
import logger from './logger.js';
import dotenv from 'dotenv';

dotenv.config();

export const initInvoice = async (data) => {
    // Resolve __dirname in ES module

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const pdfDirPath = path.resolve(__dirname, './pdf');
    if (!fs.existsSync(pdfDirPath)) {
        fs.mkdirSync(pdfDirPath);
    }

    const printedDirPath = path.resolve(__dirname, './printed');
    if (!fs.existsSync(printedDirPath)) {
        fs.mkdirSync(printedDirPath);
    }

    // const fileName = `${data.invoice_no}.pdf`;
    const now = new Date();

    const timestamp =
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0') +
        String(now.getMilliseconds()).padStart(3, '0');

    const fileName = `${data.invoice_no}_${timestamp}.pdf`;
    const filePath = path.join(pdfDirPath, fileName);
    const printedPath = path.join(printedDirPath, fileName);

    const doc = new jsPDF('p', 'mm', 'a4'); // A4 size page
    const printCount = Number(data.no_printed ?? 1);
    const safePrintCount = Number.isNaN(printCount) ? 1 : printCount;
    const printTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const copyLabel = safePrintCount <= 1 ? 'ORIGINAL' : `COPY ${safePrintCount}`;

    doc.setFont("helvetica", "bold");
    const totalPages = () => doc.getNumberOfPages();
    const addPageNumber = () => {
        const pageCount = totalPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.text(`Page ${i} of ${pageCount}`, 200, 12, { align: 'right' });
        }
    };

    const addPrintHeader = () => {
        const headerX = 150;

        doc.setPage(1);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Sales - Invoice", headerX, 10);
        doc.text(copyLabel, headerX, 16);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        // doc.text(`Printed By: ${data.printed_by || ''}`, headerX, 22);
        doc.text(`Printed At: ${printTime}`, headerX, 22);
    };

    doc.setFontSize(12);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(data.customer_name, 15, 15)

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    let y = 35; // Starting Y position
    const originalLineSpacing = 8; // Current line spacing
    const adjustedLineSpacing = originalLineSpacing * 0.7; // Reduce spacing to 0.8 times

    // ----------------Line----------------
    doc.text('Customer\'s PIN:', 15, y);
    doc.text(data.customer_pin, 50, y);

    y += adjustedLineSpacing;

    let xA = 50
    let xB = 146
    let yA = 110

    // ----------------Line----------------
    doc.text('Bill-to Customer No:', 15, y);
    doc.text(data.customer_no, xA, y);

    doc.text('LPO No:', yA, y);
    doc.text(data.lpo_no, xB, y);

    y += adjustedLineSpacing;

    // ----------------Line----------------
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text('Mpesa:', 15, y);
    doc.text(data.mpesa_code, xA, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    doc.text('Email:', yA, y);
    doc.text(data.email, xB, y);

    y += adjustedLineSpacing;

    // ----------------Line----------------
    doc.text('Invoice No:', 15, y);
    doc.text(data.invoice_no, xA, y);

    doc.text('Home Page:', yA, y);
    doc.text(data.home_page, xB, y);

    y += adjustedLineSpacing;

    // ----------------Line----------------
    doc.text('Order No:', 15, y);
    doc.text(data.order_no, xA, y);

    doc.text('VAT Reg No:', yA, y);
    doc.text(data.vat_reg_no, xB, y);

    y += adjustedLineSpacing;

    // ----------------Line----------------
    doc.text('Posting Date:', 15, y);
    doc.text(data.posting_date, xA, y);

    y += adjustedLineSpacing;

    // ----------------Line----------------
    doc.text('SalesPerson Code:', yA, y);
    doc.text(data.sales_person_code, xB, y);

    y += adjustedLineSpacing;

    // ----------------Line----------------
    doc.text('Payment Terms:', 15, y);
    doc.text(data.payment_terms, xA, y);

    doc.text('SalesPerson Name:', yA, y);
    doc.text(data.sales_person_name, xB, y);

    y += adjustedLineSpacing;

    // ----------------Line----------------
    doc.text('Shipment Method:', 15, y);
    doc.text(data.shipment_method, xA, y);

    doc.text('Company PIN:', yA, y);
    doc.text(data.company_pin, xB, y);

    y += adjustedLineSpacing;

    // ----------------Line----------------
    doc.text('Ext Doc No:', 15, y);
    doc.text(data.external_doc_no, xA, y);

    doc.text('Ship-To:', yA, y);
    doc.text(data.ship_to, xB, y);

    y += adjustedLineSpacing;

    doc.setFontSize(10);

    const tableColumnNames = [
        'No.', 'Description', 'No. Of Units', 'Qty',
        'UOM', 'VAT \nIdentifier', 'Amount', 'Crates'
    ];

    const tableData = data.lines.map(line => [
        line.item_no,
        line.item_description,
        line.units,
        line.qty,
        line.uom,
        line.vat_id,
        line.amount,
        line.crates
    ]);

    let rowCount = 0;
    doc.autoTable({
        head: [tableColumnNames],
        body: tableData,
        startY: 92,
        startX: 15,
        margin: { left: 15, top: 38, bottom: 50, right: 15 },
        columnStyles: {
            0: { cellWidth: 25, fillColor: null, halign: 'left' },
            1: { cellWidth: 65, fillColor: null, halign: 'left' },
            2: { cellWidth: 15, fillColor: null, halign: 'center' },
            3: { cellWidth: 10, fillColor: null, halign: 'center' },
            4: { cellWidth: 15, fillColor: null, halign: 'center' },
            5: { cellWidth: 20, fillColor: null, halign: 'center' },
            6: { cellWidth: 20, fillColor: null, halign: 'center' },
            7: { cellWidth: 15, fillColor: null, halign: 'center' },
        },
        headStyles: {
            fillColor: null,
            textColor: [0, 0, 0],
            fontSize: 9,
            fontStyle: 'bold',
            halign: 'left',
            valign: 'bottom'
        },
        didDrawCell: (data) => {
            if (data.section === 'head' && data.row.index === 0) {
                const lineY = data.cell.y + data.cell.height;
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.line(15, lineY, 200, lineY);
            }

            if (data.section === 'body')
                rowCount++;
        },
        didParseCell: (data) => {
            if (data.section === 'body') {
                data.cell.styles.fontStyle = 'normal'
                data.cell.styles.fontSize = 8
            } else {
                data.cell.styles.fontStyle = 'bold'
                data.cell.styles.fontSize = 9
            }

            data.cell.styles.textColor = [0, 0, 0]
        },
        didDrawPage: (tableData) => { },
    });


    addPageNumber();

    let afterY = doc.lastAutoTable.finalY + 10

    if (rowCount > 0) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");

        // ----------------Line----------------
        doc.text('Total Amt. Ex. VAT', 110, afterY);
        doc.text('KSH', 160, afterY)
        doc.text(data.total_ex_vat, 175, afterY)

        afterY += adjustedLineSpacing;

        // ----------------Line----------------
        doc.setFont("helvetica", "normal");

        doc.text('VAT Amount', 110, afterY);
        doc.text('KSH', 160, afterY)
        doc.text(data.vat, 175, afterY)

        doc.setFont("helvetica", "bold");

        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.line(170, afterY + 2, 198, afterY + 2);

        afterY += adjustedLineSpacing;

        // ----------------Line----------------
        doc.text('Total Amt. Inc. VAT', 110, afterY);
        doc.text('KSH', 160, afterY)
        doc.text(data.total_inc_vat, 175, afterY)
    }

    if (data.kra_invoice) {
        let kra = data.kra_invoice
        const pageHeight = doc.internal.pageSize.height;

        if (kra.qr_url) {
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            const qrCodeDataURL = await QRCode.toDataURL(kra.qr_url);
            doc.addImage(qrCodeDataURL, "PNG", 15, pageHeight - 35, 20, 20); // x, y, width, height
        }

        doc.text("CU Invoice No.", 40, pageHeight - 30)
        doc.text(kra.cu_invoice_no, 70, pageHeight - 30)

        doc.text("CU Serial No.", 40, pageHeight - 25)
        doc.text(kra.cu_serial_no, 70, pageHeight - 25)

        doc.text("Signet At", 40, pageHeight - 20)
        doc.text(kra.signed_at, 70, pageHeight - 20)
    }

    addPrintHeader();

    doc.save(filePath);

    logger.info(`Invoice ${data.invoice_no} prepared for print at ${printTime} as ${copyLabel}${data.printed_by ? ` by ${data.printed_by}` : ''}.`);

    const printer = process.env.PRINTER_INVOICE;
    print(filePath, printedPath, printer, 'A4', 'portrait')
}
