import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Readable } from 'stream';

// Entities
import { Order, OrderStatus } from 'src/database/entities/order.entity';
import { Shipment } from 'src/database/entities/shipment.entity';

// Utils
import { getShippingDateRange, calculateShippingDate } from 'src/utils/shipping-date.util';

// PDFKit
const PDFDocument = require('pdfkit');

@Injectable()
export class ShipmentExportService {
  private readonly logger = new Logger(ShipmentExportService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Shipment)
    private shipmentRepository: Repository<Shipment>,
  ) {}

  /**
   * 📄 Genera PDF export spedizioni per giorno - PALINSESTO COMPLETO
   */
  async generateShipmentsPDF(shippingDate: string): Promise<Buffer> {
    this.logger.log(`📄 [EXPORT PDF] Generating for date: ${shippingDate}`);

    const orders = await this.getOrdersByShippingDate(shippingDate);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    // ==================== HEADER ====================
    doc.fontSize(18).font('Helvetica-Bold');
    doc.fillColor('#C5A352');
    doc.text('PALINSESTO SPEDIZIONI GIORNALIERO', { align: 'center' });
    doc.fillColor('#000000');
    
    doc.fontSize(11).font('Helvetica');
    doc.moveDown(0.3);
    doc.text(`Data: ${new Date(shippingDate).toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
    doc.text(`Totale Ordini: ${orders.length}`, { align: 'center' });
    doc.moveDown(1);

    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#C5A352');
    doc.moveDown(0.5);

    // ==================== ORDINI ====================
    orders.forEach((order, index) => {
      if (index > 0) doc.moveDown(1.5);

      const addr = order.shippingAddress as any;
      const totalWeight = this.calculateTotalWeight(order);
      const totalParcels = this.calculateTotalParcels(order);

      // Box ordine con bordo
      const boxY = doc.y;
      
      // TITOLO ORDINE con sfondo
      doc.rect(40, boxY, 515, 26).fillAndStroke('#F5F5F5', '#C5A352');
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#C5A352');
      doc.text(`ORDINE #${order.orderNumber}`, 50, boxY + 8);
      
      doc.fontSize(8).font('Helvetica').fillColor('#666666');
      doc.text(`Creato: ${new Date(order.createdAt).toLocaleString('it-IT')}`, 360, boxY + 10);

      doc.fillColor('#000000');
      doc.moveDown(0.8);

      // CLIENTE con sfondo
      const clientY = doc.y;
      doc.rect(40, clientY - 4, 515, (addr?.phone ? 54 : 44)).fillAndStroke('#FAFAFA', '#E0E0E0');
      
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
      doc.text('DATI CLIENTE', 50, clientY);
      doc.font('Helvetica').fontSize(9).fillColor('#000000');
      
      doc.text('Nome:', 70, clientY + 16);
      doc.text(`${addr?.name || 'N/A'}`, 200, clientY + 16);
      
      doc.text('Email:', 70, clientY + 29);
      doc.text(`${order.customerEmail || order.user?.email || 'N/A'}`, 200, clientY + 29);
      
      if (addr?.phone) {
        doc.text('Tel:', 70, clientY + 42);
        doc.text(`${addr.phone}`, 200, clientY + 42);
      }
      
      doc.moveDown(addr?.phone ? 4.5 : 3.5);

      // INDIRIZZO SPEDIZIONE con sfondo
      const addrBoxY = doc.y;
      doc.rect(40, addrBoxY - 4, 515, (addr?.country ? 54 : 44)).fillAndStroke('#FAFAFA', '#E0E0E0');
      
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
      doc.text('INDIRIZZO SPEDIZIONE', 50, addrBoxY);
      doc.font('Helvetica').fontSize(9).fillColor('#000000');
      
      doc.text('Via:', 70, addrBoxY + 16);
      doc.text(`${addr?.street || ''} ${addr?.civicNumber || ''}`, 200, addrBoxY + 16);
      
      doc.text('Città:', 70, addrBoxY + 29);
      doc.text(`${addr?.postalCode || ''} ${addr?.city || ''} (${addr?.provinceCode || addr?.province || ''})`, 200, addrBoxY + 29);
      
      if (addr?.country) {
        doc.text('Paese:', 70, addrBoxY + 42);
        doc.text(`${addr.country}`, 200, addrBoxY + 42);
      }
      
      doc.moveDown(addr?.country ? 4.5 : 3.5);

      // PRODOTTI ORDINATI
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
      doc.text('PRODOTTI ORDINATI', 50);
      doc.moveDown(0.4);

      // Tabella prodotti
      let tableY = doc.y;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.rect(40, tableY, 515, 18).fillAndStroke('#C5A352', '#C5A352');
      doc.text('PRODOTTO', 50, tableY + 6, { width: 255 });
      doc.text('QTÀ', 310, tableY + 6, { width: 40, align: 'center' });
      doc.text('PESO (kg)', 360, tableY + 6, { width: 60, align: 'right' });
      doc.text('PREZZO', 430, tableY + 6, { width: 60, align: 'right' });
      doc.text('TOTALE', 500, tableY + 6, { width: 55, align: 'right' });

      tableY += 20;
      doc.fillColor('#000000');

      let orderTotal = 0;
      let orderTotalWeightGrams = 0;

      order.items?.forEach((item, idx) => {
        const product = item.variant?.product as any;

        // Usa il peso REALE dal database (weightGrams)
        const weightPerUnit = product?.weightGrams || 100; // fallback 100g se mancante
        const itemWeightGrams = weightPerUnit * item.quantity;
        const itemWeightKg = itemWeightGrams / 1000;
        
        const itemTotal = Number(item.unitPrice) * item.quantity;
        orderTotal += itemTotal;
        orderTotalWeightGrams += itemWeightGrams;

        doc.font('Helvetica').fontSize(8);
        const bg = idx % 2 === 0 ? '#F9F9F9' : '#FFFFFF';
        doc.rect(40, tableY - 2, 515, 16).fillAndStroke(bg, '#E0E0E0');

        doc.fillColor('#000000');
        doc.text(item.productName || product?.name || 'Prodotto', 50, tableY, { width: 250 });
        doc.text(item.quantity.toString(), 310, tableY, { width: 40, align: 'center' });
        doc.text(itemWeightKg.toFixed(3), 360, tableY, { width: 60, align: 'right' });
        doc.text(`€${Number(item.unitPrice).toFixed(2)}`, 430, tableY, { width: 60, align: 'right' });
        doc.text(`€${itemTotal.toFixed(2)}`, 500, tableY, { width: 55, align: 'right' });

        tableY += 16;
      });

      // TOTALI
      const orderTotalKg = orderTotalWeightGrams / 1000;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.rect(40, tableY, 515, 20).fillAndStroke('#F0F0F0', '#C5A352');
      doc.fillColor('#000000');
      doc.text('TOTALE ORDINE', 50, tableY + 6, { width: 250 });
      doc.text(`${order.items?.reduce((sum, i) => sum + i.quantity, 0)} pz`, 310, tableY + 6, { width: 40, align: 'center' });
      doc.text(`${orderTotalKg.toFixed(3)} kg`, 360, tableY + 6, { width: 60, align: 'right' });
      doc.text('', 430, tableY + 6);
      doc.text(`€${Number(order.total).toFixed(2)}`, 500, tableY + 6, { width: 55, align: 'right' });

      doc.moveDown(0.8);

      // INFO SPEDIZIONE con sfondo
      const shipBoxY = doc.y;
      let shipBoxHeight = 55; // base: colli + peso + valore (3 righe x 13px spacing)
      if (order.shipment?.trackingCode) shipBoxHeight += 13;
      if (order.notes) shipBoxHeight += 18;
      
      doc.rect(40, shipBoxY - 4, 515, shipBoxHeight).fillAndStroke('#FAFAFA', '#E0E0E0');
      
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
      doc.text('INFO SPEDIZIONE', 50, shipBoxY);
      doc.font('Helvetica').fontSize(9).fillColor('#000000');
      
      let currentShipY = shipBoxY + 16;
      doc.text('Numero Colli:', 70, currentShipY);
      doc.text(`${totalParcels}`, 200, currentShipY);
      
      currentShipY += 13;
      doc.text('Peso Totale:', 70, currentShipY);
      doc.text(`${(orderTotalWeightGrams / 1000).toFixed(3)} kg (${orderTotalWeightGrams}g)`, 200, currentShipY);
      
      currentShipY += 13;
      doc.text('Valore Dichiarato:', 70, currentShipY);
      doc.text(`€${Number(order.total).toFixed(2)}`, 200, currentShipY);
      
      if (order.shipment?.trackingCode) {
        currentShipY += 13;
        doc.text('Tracking:', 70, currentShipY);
        doc.text(`${order.shipment.trackingCode}`, 200, currentShipY);
      }
      if (order.notes) {
        currentShipY += 13;
        doc.text('Note:', 70, currentShipY);
        doc.text(`${order.notes}`, 200, currentShipY, { width: 345 });
      }
      
      doc.moveDown(0.8);

      // Separatore tra ordini
      doc.moveDown(0.5);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1.5).stroke('#C5A352');
      doc.moveDown(0.8);

      // Nuova pagina se necessario
      if (doc.y > 700 && index < orders.length - 1) {
        doc.addPage();
      }
    });

    // ==================== FOOTER ====================
    doc.fontSize(7).fillColor('#999999');
    doc.text(
      `Documento generato il ${new Date().toLocaleString('it-IT')} - Haraldica Firenze E-Commerce`,
      40,
      780,
      { align: 'center' },
    );

    doc.end();

    return new Promise((resolve, reject) => {
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        this.logger.log(`✅ [EXPORT PDF] Generated: ${pdfBuffer.length} bytes`);
        resolve(pdfBuffer);
      });

      doc.on('error', reject);
    });
  }

  /**
   * 📊 Genera CSV export spedizioni per giorno
   */
  async generateShipmentsCSV(shippingDate: string): Promise<string> {
    this.logger.log(`📊 [EXPORT CSV] Generating for date: ${shippingDate}`);

    const orders = await this.getOrdersByShippingDate(shippingDate);

    // Header CSV
    const headers = [
      'N. Ordine',
      'Cliente',
      'Indirizzo',
      'Civico',
      'CAP',
      'Città',
      'Provincia',
      'Telefono',
      'Colli',
      'Peso (kg)',
      'Valore (€)',
      'Note',
    ];

    let csv = headers.join(';') + '\n';

    // Data rows
    orders.forEach((order) => {
      const totalWeight = this.calculateTotalWeight(order);
      const totalParcels = this.calculateTotalParcels(order);

      const row = [
        order.orderNumber,
        order.shippingAddress?.name || '',
        order.shippingAddress?.street || '',
        order.shippingAddress?.civicNumber || '',
        order.shippingAddress?.postalCode || '',
        order.shippingAddress?.city || '',
        order.shippingAddress?.province || '',
        order.shippingAddress?.phone || '',
        totalParcels.toString(),
        totalWeight.toFixed(2),
        order.total.toFixed(2),
        (order.notes || '').replace(/;/g, ','), // Rimuovi ; dalle note
      ];

      csv += row.join(';') + '\n';
    });

    this.logger.log(`✅ [EXPORT CSV] Generated: ${orders.length} orders`);

    return csv;
  }

  /**
   * Query ordini per data spedizione - SENZA LIMITAZIONE 19:00
   */
  private async getOrdersByShippingDate(shippingDate: string): Promise<Order[]> {
    // Parse data selezionata (tutto il giorno 00:00 - 23:59)
    const selectedDate = new Date(shippingDate);
    const startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0, 0);
    const endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59, 999);

    this.logger.log(`📅 [EXPORT] Date range: ${startDate.toISOString()} - ${endDate.toISOString()}`);

    const orders = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('order.shipment', 'shipment')
      .leftJoinAndSelect('order.user', 'user')
      .where('order.status IN (:...statuses)', {
        statuses: [
          OrderStatus.CONFIRMED,
          OrderStatus.PROCESSING,
          OrderStatus.READY_TO_SHIP,
        ],
      })
      .andWhere('order.createdAt >= :startDate', { startDate })
      .andWhere('order.createdAt <= :endDate', { endDate })
      .orderBy('order.createdAt', 'ASC')
      .getMany();

    this.logger.log(
      `📦 Found ${orders.length} orders for shipping date ${shippingDate}`,
    );

    return orders;
  }

  /**
   * Calcola peso totale ordine
   */
  private calculateTotalWeight(order: Order): number {
    if (!order.items || order.items.length === 0) return 0.5; // Peso default

    const totalWeight = order.items.reduce((sum, item) => {
      const product = item.variant?.product as any;
      const weight = product?.weight || 0.5; // Default 500g per prodotto
      return sum + weight * item.quantity;
    }, 0);

    return totalWeight;
  }

  /**
   * Calcola numero colli
   */
  private calculateTotalParcels(order: Order): number {
    if (!order.items || order.items.length === 0) return 1;

    const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);

    // Logica: 1 collo ogni 3 prodotti (personalizzabile)
    return Math.ceil(totalItems / 3);
  }
}
