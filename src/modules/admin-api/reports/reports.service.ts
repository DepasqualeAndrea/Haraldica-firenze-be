import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Order, OrderStatus } from 'src/database/entities/order.entity';
import { Payment } from 'src/database/entities/payment.entity';
import {
  ReportFilterDto,
  AccountingReportData,
  AccountingOrderData,
} from './dto/report.dto';

const PDFDocument = require('pdfkit');

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly IVA_RATE = 0.22; // 22% IVA italiana

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {}

  /**
   * Scorpora l'IVA da un importo IVA inclusa
   * Formula: Imponibile = Totale / (1 + IVA%), IVA = Totale - Imponibile
   */
  private calculateVATFromTotal(totalWithVAT: number): { net: number; vat: number } {
    const net = totalWithVAT / (1 + this.IVA_RATE);
    const vat = totalWithVAT - net;
    return {
      net: this.round(net),
      vat: this.round(vat),
    };
  }

  /**
   * Genera il report contabile per il commercialista
   */
  async generateAccountingReport(
    filters: ReportFilterDto,
  ): Promise<AccountingReportData> {
    const startDate = filters.startDate
      ? new Date(filters.startDate)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1); // Primo del mese corrente

    const endDate = filters.endDate
      ? new Date(filters.endDate)
      : new Date(); // Oggi

    // Imposta fine giornata per endDate
    endDate.setHours(23, 59, 59, 999);

    this.logger.log(
      `📊 Generazione report contabile: ${startDate.toISOString()} - ${endDate.toISOString()}`,
    );

    // Recupera ordini completati nel periodo
    const orders = await this.orderRepository.find({
      where: {
        createdAt: Between(startDate, endDate),
        status: In([
          OrderStatus.CONFIRMED,
          OrderStatus.SHIPPED,
          OrderStatus.DELIVERED,
        ]),
      },
      relations: ['items', 'items.variant', 'items.variant.product', 'payment'],
      order: { createdAt: 'ASC' },
    });

    // Calcola sommario
    const summary = this.calculateSummary(orders);

    // Formatta ordini per il report
    const formattedOrders = orders.map((order) =>
      this.formatOrderForReport(order),
    );

    // Raggruppa per metodo di pagamento
    const paymentMethods = this.groupByPaymentMethod(orders);

    return {
      generatedAt: new Date().toISOString(),
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      summary,
      orders: formattedOrders,
      paymentMethods,
    };
  }

  private calculateSummary(orders: Order[]) {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const totalShipping = orders.reduce(
      (sum, o) => sum + Number(o.shippingCost || 0),
      0,
    );
    
    // Scorporiamo l'IVA dal totale (prezzi IVA inclusa)
    // Togliamo le spese di spedizione prima di calcolare l'IVA sui prodotti
    const revenueWithoutShipping = totalRevenue - totalShipping;
    const { vat: productVAT } = this.calculateVATFromTotal(revenueWithoutShipping);
    
    // IVA sulle spedizioni (se applicabile, di solito sì)
    const { vat: shippingVAT } = this.calculateVATFromTotal(totalShipping);
    
    const totalTax = productVAT + shippingVAT;
    const totalNet = totalRevenue - totalTax;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      totalOrders,
      totalRevenue: this.round(totalRevenue),
      totalShipping: this.round(totalShipping),
      totalTax: this.round(totalTax),
      totalNet: this.round(totalNet),
      averageOrderValue: this.round(averageOrderValue),
    };
  }

  private formatOrderForReport(order: Order): AccountingOrderData {
    const customerName =
      order.shippingAddress?.name ||
      order.billingAddress?.name ||
      'N/A';

    // Scorporiamo IVA dal totale dell'ordine
    const orderTotal = Number(order.total);
    const shippingCost = Number(order.shippingCost || 0);
    const subtotal = orderTotal - shippingCost;
    
    // Calcola IVA su prodotti e spedizione
    const { vat: productVAT } = this.calculateVATFromTotal(subtotal);
    const { vat: shippingVAT } = this.calculateVATFromTotal(shippingCost);
    const totalVAT = productVAT + shippingVAT;

    return {
      orderNumber: order.orderNumber,
      date: order.createdAt.toISOString(),
      customerEmail: order.customerEmail || 'N/A',
      customerName,
      subtotal: this.round(subtotal),
      shippingCost: this.round(shippingCost),
      taxAmount: this.round(totalVAT),
      discountAmount: this.round(Number(order.discountAmount || 0)),
      total: this.round(Number(order.total)),
      status: order.status,
      paymentMethod: order.payment?.method || 'card',
      stripePaymentIntentId: order.stripePaymentIntentId || 'N/A',
      items: order.items.map((item) => ({
        name: item.productName,
        sku: item.productSku || 'N/A',
        size: item.size || 'N/A',
        colorName: item.variant?.colorName || 'N/A',
        quantity: item.quantity,
        unitPrice: this.round(Number(item.unitPrice)),
        total: this.round(Number(item.total)),
      })),
    };
  }

  private groupByPaymentMethod(orders: Order[]) {
    const grouped = new Map<string, { count: number; total: number }>();

    orders.forEach((order) => {
      const method = order.payment?.method || 'card';
      const current = grouped.get(method) || { count: 0, total: 0 };
      grouped.set(method, {
        count: current.count + 1,
        total: current.total + Number(order.total),
      });
    });

    return Array.from(grouped.entries()).map(([method, data]) => ({
      method,
      count: data.count,
      total: this.round(data.total),
    }));
  }

  /**
   * Genera il PDF del report contabile
   */
  async generateAccountingPdf(filters: ReportFilterDto): Promise<Buffer> {
    const data = await this.generateAccountingReport(filters);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: `Report Contabile - ${data.period.startDate.split('T')[0]} / ${data.period.endDate.split('T')[0]}`,
            Author: 'Haraldica Firenze E-commerce',
          },
        });

        const chunks: Buffer[] = [];
        
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          this.logger.log(`✅ PDF generato: ${buffer.length} bytes`);
          resolve(buffer);
        });
        doc.on('error', (err) => {
          this.logger.error(`❌ Errore PDF: ${err.message}`);
          reject(err);
        });

      // Header
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('REPORT CONTABILE', { align: 'center' });
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .font('Helvetica')
        .text('Haraldica Firenze S.r.l.', { align: 'center' });
      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .text(
          `Periodo: ${this.formatDate(data.period.startDate)} - ${this.formatDate(data.period.endDate)}`,
          { align: 'center' },
        );
      doc.text(`Generato il: ${this.formatDate(data.generatedAt)}`, {
        align: 'center',
      });

      doc.moveDown(1.5);

      // Linea separatrice
      doc
        .strokeColor('#C5A352')
        .lineWidth(2)
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .stroke();

      doc.moveDown(1);

      // Riepilogo
      doc.fontSize(14).font('Helvetica-Bold').text('RIEPILOGO');
      doc.moveDown(0.5);

      const summaryData = [
        ['Totale Ordini:', data.summary.totalOrders.toString()],
        ['Fatturato Totale:', `€ ${data.summary.totalRevenue.toFixed(2)}`],
        ['Spese di Spedizione:', `€ ${data.summary.totalShipping.toFixed(2)}`],
        ['IVA Totale (22%):', `€ ${data.summary.totalTax.toFixed(2)}`],
        ['Netto (Fatturato - IVA):', `€ ${data.summary.totalNet.toFixed(2)}`],
        [
          'Valore Medio Ordine:',
          `€ ${data.summary.averageOrderValue.toFixed(2)}`,
        ],
      ];

      doc.fontSize(10).font('Helvetica');
      summaryData.forEach(([label, value]) => {
        doc.text(`${label}`, 50, doc.y, { continued: true, width: 200 });
        doc.font('Helvetica-Bold').text(value, { align: 'right' });
        doc.font('Helvetica');
      });

      doc.moveDown(1.5);

      // Metodi di pagamento
      if (data.paymentMethods.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('METODI DI PAGAMENTO');
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');

        data.paymentMethods.forEach((pm) => {
          doc.text(
            `${pm.method.toUpperCase()}: ${pm.count} ordini - € ${pm.total.toFixed(2)}`,
          );
        });

        doc.moveDown(1.5);
      }

      // Dettaglio Ordini
      doc.fontSize(14).font('Helvetica-Bold').text('DETTAGLIO ORDINI');
      doc.moveDown(0.5);

      // Intestazione tabella
      const tableTop = doc.y;
      const tableHeaders = [
        'Data',
        'N. Ordine',
        'Cliente',
        'Subtotale',
        'Spediz.',
        'IVA',
        'Totale',
      ];
      const colWidths = [70, 90, 120, 55, 50, 45, 55];
      let xPos = 50;

      doc.fontSize(8).font('Helvetica-Bold');
      doc
        .rect(50, tableTop - 5, 495, 15)
        .fill('#f0f0f0')
        .stroke();
      doc.fillColor('#000000');

      tableHeaders.forEach((header, i) => {
        doc.text(header, xPos, tableTop, { width: colWidths[i] });
        xPos += colWidths[i];
      });

      doc.moveDown(0.8);

      // Righe tabella
      doc.font('Helvetica').fontSize(7);

      data.orders.forEach((order, index) => {
        // Nuova pagina se necessario
        if (doc.y > 750) {
          doc.addPage();
          doc.y = 50;
        }

        const rowY = doc.y;

        // Sfondo alternato
        if (index % 2 === 0) {
          doc.rect(50, rowY - 2, 495, 12).fill('#fafafa').stroke();
          doc.fillColor('#000000');
        }

        xPos = 50;
        const rowData = [
          this.formatDateShort(order.date),
          order.orderNumber,
          order.customerEmail.substring(0, 20),
          `€ ${order.subtotal.toFixed(2)}`,
          `€ ${order.shippingCost.toFixed(2)}`,
          `€ ${order.taxAmount.toFixed(2)}`,
          `€ ${order.total.toFixed(2)}`,
        ];

        rowData.forEach((cell, i) => {
          doc.text(cell, xPos, rowY, { width: colWidths[i] });
          xPos += colWidths[i];
        });

        doc.moveDown(0.6);
      });

      // Riga TOTALI sotto la tabella
      doc.moveDown(0.5);
      const totalsY = doc.y;
      
      // Linea separatrice
      doc
        .strokeColor('#C5A352')
        .lineWidth(1)
        .moveTo(50, totalsY)
        .lineTo(545, totalsY)
        .stroke();
      
      doc.moveDown(0.5);
      
      // Calcola totali colonne
      const totalShippingSum = data.orders.reduce((sum, o) => sum + o.shippingCost, 0);
      const totalTaxSum = data.orders.reduce((sum, o) => sum + o.taxAmount, 0);
      const totalSum = data.orders.reduce((sum, o) => sum + o.total, 0);
      
      const totalsRowY = doc.y;
      xPos = 50;
      
      // Sfondo totali
      doc.rect(50, totalsRowY - 2, 495, 14).fill('#FFF9E6').stroke();
      doc.fillColor('#000000');
      
      doc.fontSize(8).font('Helvetica-Bold');
      
      const totalsData = [
        'TOTALI', // Data
        data.orders.length.toString(), // N. Ordine (numero ordini)
        '', // Cliente
        '', // Subtotale
        `€ ${totalShippingSum.toFixed(2)}`, // Spediz.
        `€ ${totalTaxSum.toFixed(2)}`, // IVA
        `€ ${totalSum.toFixed(2)}`, // Totale
      ];
      
      totalsData.forEach((cell, i) => {
        doc.text(cell, xPos, totalsRowY, { width: colWidths[i], align: 'left' });
        xPos += colWidths[i];
      });

      doc.moveDown(2);

      // Footer
      doc
        .fontSize(8)
        .fillColor('#666666')
        .text(
          'Documento generato automaticamente dal sistema Haraldica Firenze E-commerce',
          50,
          doc.y,
          { align: 'center' },
        );
      doc.text(
        'I dati fiscali sono da verificare con i movimenti Stripe e le fatture emesse.',
        { align: 'center' },
      );

        doc.end();
      } catch (error) {
        this.logger.error(`❌ Errore creazione PDF: ${error.message}`);
        reject(error);
      }
    });
  }

  /**
   * Genera CSV del report
   */
  async generateAccountingCsv(filters: ReportFilterDto): Promise<string> {
    const data = await this.generateAccountingReport(filters);

    const headers = [
      'Data',
      'N. Ordine',
      'Email Cliente',
      'Nome Cliente',
      'Subtotale',
      'Spedizione',
      'IVA',
      'Sconto',
      'Totale',
      'Stato',
      'Metodo Pagamento',
      'Stripe PI',
    ];

    const rows = data.orders.map((order) => [
      this.formatDateShort(order.date),
      order.orderNumber,
      order.customerEmail,
      order.customerName,
      order.subtotal.toFixed(2),
      order.shippingCost.toFixed(2),
      order.taxAmount.toFixed(2),
      order.discountAmount.toFixed(2),
      order.total.toFixed(2),
      order.status,
      order.paymentMethod,
      order.stripePaymentIntentId,
    ]);

    // Aggiungi riga riepilogo
    rows.push([]);
    rows.push(['RIEPILOGO']);
    rows.push(['Totale Ordini', data.summary.totalOrders.toString()]);
    rows.push(['Fatturato Totale', `€ ${data.summary.totalRevenue.toFixed(2)}`]);
    rows.push(['Spedizioni Totali', `€ ${data.summary.totalShipping.toFixed(2)}`]);
    rows.push(['IVA Totale', `€ ${data.summary.totalTax.toFixed(2)}`]);
    rows.push(['Netto', `€ ${data.summary.totalNet.toFixed(2)}`]);

    const csvContent = [
      headers.join(';'),
      ...rows.map((row) => row.join(';')),
    ].join('\n');

    return csvContent;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatDateShort(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
}
