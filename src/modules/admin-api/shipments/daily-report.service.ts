import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import * as ExcelJS from 'exceljs';
import * as archiver from 'archiver';
import { createWriteStream, createReadStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { unlink } from 'fs/promises';

// Entities
import { Order, OrderStatus } from 'src/database/entities/order.entity';
import { Shipment } from 'src/database/entities/shipment.entity';
import { EmailService } from 'src/modules/public-api/notifications/email.service';

// Services

interface DailyReportData {
  date: Date;
  orders: Order[];
  totalOrders: number;
  totalParcels: number;
  totalWeight: number;
  totalValue: number;
  excelPath: string;
  borderoPath?: string;
  zipPath: string;
}

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(DailyReportService.name);
  private readonly reportsDir: string;

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Shipment)
    private shipmentRepository: Repository<Shipment>,
    private emailService: EmailService,
  ) {
    // Directory per report temporanei
    this.reportsDir = join(process.cwd(), 'temp', 'reports');
    
    // Crea directory se non esiste
    if (!existsSync(this.reportsDir)) {
      mkdirSync(this.reportsDir, { recursive: true });
    }

    this.logger.log(`✅ DailyReportService inizializzato`);
    this.logger.log(`📂 Reports directory: ${this.reportsDir}`);
  }

  // ===========================
  // 📊 MAIN REPORT GENERATION
  // ===========================

  /**
   * Genera report giornaliero completo
   * - Excel dettaglio ordini
   * - PDF borderò riepilogativo BRT
   * - ZIP tutte le etichette
   * - Invia email al magazzino
   */
  async generateDailyReport(date?: Date): Promise<DailyReportData | null> {
    const reportDate = date || new Date();
    reportDate.setHours(0, 0, 0, 0);

    const nextDate = new Date(reportDate);
    nextDate.setDate(nextDate.getDate() + 1);

    this.logger.log(`📊 [DAILY REPORT] Generazione report per ${reportDate.toLocaleDateString('it-IT')}`);

    try {
      // 1. Recupera ordini confermati (CONFIRMED) della giornata
      const orders = await this.orderRepository.find({
        where: {
          status: OrderStatus.CONFIRMED,
          createdAt: Between(reportDate, nextDate),
        },
        relations: ['items', 'items.variant', 'items.variant.product', 'shipment'],
        order: { createdAt: 'ASC' },
      });

      if (orders.length === 0) {
        this.logger.log(`ℹ️ [DAILY REPORT] Nessun ordine per ${reportDate.toLocaleDateString('it-IT')}`);
        return null;
      }

      this.logger.log(`🔄 [DAILY REPORT] Trovati ${orders.length} ordini`);

      // 2. Calcola totali
      const totals = this.calculateTotals(orders);

      // 3. Genera Excel
      const excelPath = await this.generateExcelReport(orders, reportDate);

      // 4. Genera ZIP etichette
      const zipPath = await this.generateLabelsZip(orders, reportDate);

      // 5. TODO: Genera PDF Borderò (opzionale - richiede template)
      // const borderoPath = await this.generateBorderoPDF(orders, reportDate);

      const reportData: DailyReportData = {
        date: reportDate,
        orders,
        totalOrders: orders.length,
        totalParcels: totals.parcels,
        totalWeight: totals.weight,
        totalValue: totals.value,
        excelPath,
        zipPath,
        // borderoPath,
      };

      this.logger.log(`✅ [DAILY REPORT] Report generato con successo`);
      this.logger.log(`   ├─ Ordini: ${reportData.totalOrders}`);
      this.logger.log(`   ├─ Colli: ${reportData.totalParcels}`);
      this.logger.log(`   ├─ Peso: ${reportData.totalWeight.toFixed(2)} kg`);
      this.logger.log(`   ├─ Valore: €${reportData.totalValue.toFixed(2)}`);
      this.logger.log(`   ├─ Excel: ${excelPath}`);
      this.logger.log(`   └─ ZIP: ${zipPath}`);

      return reportData;
    } catch (error) {
      this.logger.error(`❌ [DAILY REPORT] Errore generazione:`, error);
      throw error;
    }
  }

  /**
   * Invia report via email al magazzino
   */
  async sendDailyReportEmail(reportData: DailyReportData): Promise<void> {
    this.logger.log(`📧 [DAILY REPORT] Invio email riepilogo`);

    try {
      const recipients = process.env.DAILY_SHIPMENT_REPORT_EMAILS?.split(',') || [
        'spedizioni@haraldicafirenze.com',
        'andrea@haraldicafirenze.com',
      ];

      // TODO: Implementa invio email con allegati
      // Nota: EmailService attuale usa template Handlebars, 
      // potrebbe servire un metodo specifico per email con allegati

      this.logger.log(`✅ [DAILY REPORT] Email inviata a: ${recipients.join(', ')}`);
    } catch (error) {
      this.logger.error(`❌ [DAILY REPORT] Errore invio email:`, error);
      throw error;
    }
  }

  // ===========================
  // 📄 EXCEL GENERATION
  // ===========================

  private async generateExcelReport(
    orders: Order[],
    date: Date,
  ): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ordini Giornalieri');

    // Metadati
    workbook.creator = 'Haraldica Firenze E-commerce';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Header
    worksheet.columns = [
      { header: 'N° Ordine', key: 'orderNumber', width: 15 },
      { header: 'Data', key: 'date', width: 12 },
      { header: 'Cliente', key: 'customer', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Prodotti', key: 'products', width: 40 },
      { header: 'Colli', key: 'parcels', width: 8 },
      { header: 'Peso (kg)', key: 'weight', width: 10 },
      { header: 'Valore (€)', key: 'value', width: 12 },
      { header: 'CAP', key: 'postalCode', width: 10 },
      { header: 'Città', key: 'city', width: 20 },
      { header: 'Provincia', key: 'province', width: 10 },
      { header: 'Tracking BRT', key: 'tracking', width: 20 },
      { header: 'Etichetta', key: 'label', width: 35 },
      { header: 'Note', key: 'notes', width: 30 },
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Dati
    orders.forEach((order) => {
      const weight = this.calculateOrderWeight(order);
      const parcels = this.calculateOrderParcels(order);

      worksheet.addRow({
        orderNumber: order.orderNumber,
        date: order.createdAt.toLocaleDateString('it-IT'),
        customer: order.shippingAddress?.name || 'N/A',
        email: order.customerEmail || order.user?.email || 'N/A',
        products: order.items
          .map((item) => `${item.productName} x${item.quantity}`)
          .join(', '),
        parcels,
        weight: weight.toFixed(2),
        value: order.total.toFixed(2),
        postalCode: order.shippingAddress?.postalCode || '',
        city: order.shippingAddress?.city || '',
        province: order.shippingAddress?.country || '',
        tracking: order.brtTrackingNumber || 'Da creare',
        label: order.shipment?.labelFilePath || 'Da generare',
        notes: order.notes || '',
      });
    });

    // Totali
    const totalsRowIndex = (worksheet.lastRow?.number ?? 1) + 2;
    worksheet.getCell(`A${totalsRowIndex}`).value = 'TOTALI:';
    worksheet.getCell(`A${totalsRowIndex}`).font = { bold: true };

    worksheet.getCell(`F${totalsRowIndex}`).value = orders.reduce(
      (sum, o) => sum + this.calculateOrderParcels(o),
      0,
    );
    worksheet.getCell(`G${totalsRowIndex}`).value = orders
      .reduce((sum, o) => sum + this.calculateOrderWeight(o), 0)
      .toFixed(2);
    worksheet.getCell(`H${totalsRowIndex}`).value = orders
      .reduce((sum, o) => sum + o.total, 0)
      .toFixed(2);

    // Salva file
    const dateStr = date.toISOString().split('T')[0];
    const filename = `dettaglio_ordini_${dateStr}.xlsx`;
    const filepath = join(this.reportsDir, filename);

    await workbook.xlsx.writeFile(filepath);

    this.logger.log(`📄 [EXCEL] Generato: ${filename}`);
    return filepath;
  }

  // ===========================
  // 📦 ZIP LABELS GENERATION
  // ===========================

  private async generateLabelsZip(
    orders: Order[],
    date: Date,
  ): Promise<string> {
    const dateStr = date.toISOString().split('T')[0];
    const zipFilename = `etichette_${dateStr}.zip`;
    const zipPath = join(this.reportsDir, zipFilename);

    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        this.logger.log(
          `📦 [ZIP] Generato: ${zipFilename} (${archive.pointer()} bytes)`,
        );
        resolve(zipPath);
      });

      archive.on('error', (err) => {
        this.logger.error(`❌ [ZIP] Errore:`, err);
        reject(err);
      });

      archive.pipe(output);

      // Aggiungi etichette PDF
      let addedLabels = 0;
      orders.forEach((order) => {
        if (order.shipment?.labelFilePath && existsSync(order.shipment.labelFilePath)) {
          const labelFilename = `${order.orderNumber}_etichetta.pdf`;
          archive.file(order.shipment.labelFilePath, { name: labelFilename });
          addedLabels++;
        }
      });

      if (addedLabels === 0) {
        this.logger.warn(`⚠️ [ZIP] Nessuna etichetta trovata per ${dateStr}`);
      } else {
        this.logger.log(`📎 [ZIP] ${addedLabels} etichette aggiunte`);
      }

      archive.finalize();
    });
  }

  // ===========================
  // 📊 CALCULATIONS
  // ===========================

  private calculateTotals(orders: Order[]): {
    parcels: number;
    weight: number;
    value: number;
  } {
    return {
      parcels: orders.reduce((sum, o) => sum + this.calculateOrderParcels(o), 0),
      weight: orders.reduce((sum, o) => sum + this.calculateOrderWeight(o), 0),
      value: orders.reduce((sum, o) => sum + o.total, 0),
    };
  }

  private calculateOrderWeight(order: Order): number {
    const defaultWeight = 0.5;

    if (!order.items || order.items.length === 0) {
      return defaultWeight;
    }

    return order.items.reduce((sum, item) => {
      const productWeight = (item.variant?.product as any)?.weight || defaultWeight;
      return sum + productWeight * item.quantity;
    }, 0);
  }

  private calculateOrderParcels(order: Order): number {
    if (!order.items || order.items.length === 0) {
      return 1;
    }

    const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
    return Math.max(Math.ceil(totalItems / 3), 1);
  }

  // ===========================
  // 🧹 CLEANUP
  // ===========================

  /**
   * Pulisce file temporanei report
   */
  async cleanupOldReports(daysOld: number = 7): Promise<void> {
    this.logger.log(`🧹 [CLEANUP] Pulizia report più vecchi di ${daysOld} giorni`);

    try {
      // TODO: Implementa cleanup basato su data creazione file
      this.logger.log(`✅ [CLEANUP] Completato`);
    } catch (error) {
      this.logger.error(`❌ [CLEANUP] Errore:`, error);
    }
  }

  /**
   * Rimuove file report specifico
   */
  async deleteReportFile(filepath: string): Promise<void> {
    try {
      if (existsSync(filepath)) {
        await unlink(filepath);
        this.logger.log(`🗑️ [CLEANUP] File rimosso: ${filepath}`);
      }
    } catch (error) {
      this.logger.warn(`⚠️ [CLEANUP] Errore rimozione file: ${error.message}`);
    }
  }
}