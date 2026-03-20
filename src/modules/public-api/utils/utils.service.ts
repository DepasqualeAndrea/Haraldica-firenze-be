// src/modules/public-api/utils/utils.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// Struttura completa del comune dal JSON
export interface ComuneData {
  nome: string;
  codice: string;
  zona: { codice: string; nome: string };
  regione: { codice: string; nome: string };
  provincia: { codice: string; nome: string };
  sigla: string;
  codiceCatastale: string;
  cap: string[];
  popolazione: number;
}

// Risultato completo per il FE
export interface CapLookupResult {
  city: string;
  province: string;        // Nome completo provincia (es. "Ascoli Piceno")
  provinceCode: string;    // Sigla provincia (es. "AP")
  region: string;
  fullData: ComuneData;
}

// Risultato semplificato (per compatibilità)
export interface CapLookupResultSimple {
  city: string;
  province: string;
  region?: string;
}

@Injectable()
export class UtilsService implements OnModuleInit {
  private readonly logger = new Logger(UtilsService.name);

  // Map CAP → ComuneData (dati completi)
  private capIndex = new Map<string, ComuneData>();

  async onModuleInit() {
    await this.loadCapData();
  }

  /**
   * Carica i dati dei comuni italiani e crea l'indice CAP
   */
  private async loadCapData(): Promise<void> {
    try {
      // Prova a caricare da file locale
      const dataPath = this.resolveDataPath();

      if (dataPath && fs.existsSync(dataPath)) {
        const rawData = fs.readFileSync(dataPath, 'utf-8');
        const comuni: ComuneData[] = JSON.parse(rawData);

        this.buildCapIndex(comuni);
        this.logger.log(`✅ CAP index loaded: ${this.capIndex.size} CAP codes`);
      } else {
        // Fallback: carica dati inline (subset più comuni)
        this.loadFallbackData();
        this.logger.warn('⚠️ Using fallback CAP data (limited coverage)');
      }
    } catch (error) {
      this.logger.error('❌ Failed to load CAP data:', error);
      this.loadFallbackData();
    }
  }

  private resolveDataPath(): string | null {
    const candidates = [
      path.resolve(__dirname, 'data', 'comuni.json'),
      path.resolve(process.cwd(), 'src', 'modules', 'public-api', 'utils', 'data', 'comuni.json'),
      path.resolve(process.cwd(), 'data', 'comuni.json'),
      path.resolve(process.cwd(), 'dist', 'modules', 'public-api', 'utils', 'data', 'comuni.json'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private buildCapIndex(comuni: ComuneData[]): void {
    for (const comune of comuni) {
      if (comune.cap && Array.isArray(comune.cap)) {
        for (const cap of comune.cap) {
          // Se il CAP è già presente, non sovrascriviamo (primo match vince)
          if (!this.capIndex.has(cap)) {
            this.capIndex.set(cap, comune);
          }
        }
      }
    }
  }

  /**
   * Dati di fallback per i CAP più comuni (capoluoghi di provincia)
   */
  private loadFallbackData(): void {
    const fallbackComuni: ComuneData[] = [
      // Nord
      { nome: 'Torino', codice: '001272', zona: { codice: '1', nome: 'Nord-ovest' }, regione: { codice: '01', nome: 'Piemonte' }, provincia: { codice: '001', nome: 'Torino' }, sigla: 'TO', codiceCatastale: 'L219', cap: ['10100', '10121', '10122', '10123', '10124', '10125', '10126', '10127', '10128', '10129', '10130', '10131', '10132', '10133', '10134', '10135', '10136', '10137', '10138', '10139', '10140', '10141', '10142', '10143', '10144', '10145', '10146', '10147', '10148', '10149', '10150', '10151', '10152', '10153', '10154', '10155', '10156'], popolazione: 847000 },
      { nome: 'Milano', codice: '015146', zona: { codice: '1', nome: 'Nord-ovest' }, regione: { codice: '03', nome: 'Lombardia' }, provincia: { codice: '015', nome: 'Milano' }, sigla: 'MI', codiceCatastale: 'F205', cap: ['20100', '20121', '20122', '20123', '20124', '20125', '20126', '20127', '20128', '20129', '20130', '20131', '20132', '20133', '20134', '20135', '20136', '20137', '20138', '20139', '20140', '20141', '20142', '20143', '20144', '20145', '20146', '20147', '20148', '20149', '20150', '20151', '20152', '20153', '20154', '20155', '20156', '20157', '20158', '20159', '20160', '20161', '20162'], popolazione: 1352000 },
      { nome: 'Venezia', codice: '027042', zona: { codice: '2', nome: 'Nord-est' }, regione: { codice: '05', nome: 'Veneto' }, provincia: { codice: '027', nome: 'Venezia' }, sigla: 'VE', codiceCatastale: 'L736', cap: ['30100', '30121', '30122', '30123', '30124', '30125', '30126', '30127', '30128', '30129', '30130', '30131', '30132', '30133', '30134', '30135', '30136', '30137', '30138', '30139', '30140', '30141', '30142', '30143', '30144', '30145', '30146', '30147', '30148', '30149', '30150', '30151', '30152', '30153', '30154', '30155', '30156', '30157', '30158', '30159', '30160', '30161', '30162', '30163', '30164', '30165', '30166', '30167', '30168', '30169', '30170', '30171', '30172', '30173', '30174', '30175', '30176'], popolazione: 258000 },
      { nome: 'Bologna', codice: '037006', zona: { codice: '2', nome: 'Nord-est' }, regione: { codice: '08', nome: 'Emilia-Romagna' }, provincia: { codice: '037', nome: 'Bologna' }, sigla: 'BO', codiceCatastale: 'A944', cap: ['40100', '40121', '40122', '40123', '40124', '40125', '40126', '40127', '40128', '40129', '40130', '40131', '40132', '40133', '40134', '40135', '40136', '40137', '40138', '40139', '40140', '40141'], popolazione: 390000 },
      { nome: 'Genova', codice: '010025', zona: { codice: '1', nome: 'Nord-ovest' }, regione: { codice: '07', nome: 'Liguria' }, provincia: { codice: '010', nome: 'Genova' }, sigla: 'GE', codiceCatastale: 'D969', cap: ['16100', '16121', '16122', '16123', '16124', '16125', '16126', '16127', '16128', '16129', '16130', '16131', '16132', '16133', '16134', '16135', '16136', '16137', '16138', '16139', '16140', '16141', '16142', '16143', '16144', '16145', '16146', '16147', '16148', '16149', '16150', '16151', '16152', '16153', '16154', '16155', '16156', '16157', '16158', '16159', '16160', '16161', '16162', '16163', '16164', '16165', '16166', '16167'], popolazione: 566000 },

      // Centro
      { nome: 'Roma', codice: '058091', zona: { codice: '3', nome: 'Centro' }, regione: { codice: '12', nome: 'Lazio' }, provincia: { codice: '058', nome: 'Roma' }, sigla: 'RM', codiceCatastale: 'H501', cap: ['00100', '00118', '00119', '00120', '00121', '00122', '00123', '00124', '00125', '00126', '00127', '00128', '00129', '00130', '00131', '00132', '00133', '00134', '00135', '00136', '00137', '00138', '00139', '00140', '00141', '00142', '00143', '00144', '00145', '00146', '00147', '00148', '00149', '00150', '00151', '00152', '00153', '00154', '00155', '00156', '00157', '00158', '00159', '00160', '00161', '00162', '00163', '00164', '00165', '00166', '00167', '00168', '00169', '00170', '00171', '00172', '00173', '00174', '00175', '00176', '00177', '00178', '00179', '00180', '00181', '00182', '00183', '00184', '00185', '00186', '00187', '00188', '00189', '00190', '00191', '00192', '00193', '00194', '00195', '00196', '00197', '00198', '00199'], popolazione: 2870000 },
      { nome: 'Firenze', codice: '048017', zona: { codice: '3', nome: 'Centro' }, regione: { codice: '09', nome: 'Toscana' }, provincia: { codice: '048', nome: 'Firenze' }, sigla: 'FI', codiceCatastale: 'D612', cap: ['50100', '50121', '50122', '50123', '50124', '50125', '50126', '50127', '50128', '50129', '50130', '50131', '50132', '50133', '50134', '50135', '50136', '50137', '50138', '50139', '50140', '50141', '50142', '50143', '50144', '50145'], popolazione: 367000 },
      { nome: 'Ancona', codice: '042002', zona: { codice: '3', nome: 'Centro' }, regione: { codice: '11', nome: 'Marche' }, provincia: { codice: '042', nome: 'Ancona' }, sigla: 'AN', codiceCatastale: 'A271', cap: ['60100', '60121', '60122', '60123', '60124', '60125', '60126', '60127', '60128', '60129', '60130', '60131'], popolazione: 100000 },
      { nome: 'Ascoli Piceno', codice: '044007', zona: { codice: '3', nome: 'Centro' }, regione: { codice: '11', nome: 'Marche' }, provincia: { codice: '044', nome: 'Ascoli Piceno' }, sigla: 'AP', codiceCatastale: 'A462', cap: ['63100'], popolazione: 47000 },
      { nome: 'Castel di Lama', codice: '044011', zona: { codice: '3', nome: 'Centro' }, regione: { codice: '11', nome: 'Marche' }, provincia: { codice: '044', nome: 'Ascoli Piceno' }, sigla: 'AP', codiceCatastale: 'C093', cap: ['63082'], popolazione: 8470 },
      { nome: 'Fermo', codice: '109006', zona: { codice: '3', nome: 'Centro' }, regione: { codice: '11', nome: 'Marche' }, provincia: { codice: '109', nome: 'Fermo' }, sigla: 'FM', codiceCatastale: 'D542', cap: ['63900'], popolazione: 37000 },
      { nome: 'Pesaro', codice: '041044', zona: { codice: '3', nome: 'Centro' }, regione: { codice: '11', nome: 'Marche' }, provincia: { codice: '041', nome: 'Pesaro e Urbino' }, sigla: 'PU', codiceCatastale: 'G479', cap: ['61100', '61121', '61122'], popolazione: 95000 },
      { nome: 'Macerata', codice: '043022', zona: { codice: '3', nome: 'Centro' }, regione: { codice: '11', nome: 'Marche' }, provincia: { codice: '043', nome: 'Macerata' }, sigla: 'MC', codiceCatastale: 'E783', cap: ['62100'], popolazione: 41000 },
      { nome: 'Perugia', codice: '054039', zona: { codice: '3', nome: 'Centro' }, regione: { codice: '10', nome: 'Umbria' }, provincia: { codice: '054', nome: 'Perugia' }, sigla: 'PG', codiceCatastale: 'G478', cap: ['06100', '06121', '06122', '06123', '06124', '06125', '06126', '06127', '06128', '06129', '06130', '06131', '06132', '06133', '06134', '06135'], popolazione: 162000 },

      // Sud
      { nome: 'Napoli', codice: '063049', zona: { codice: '4', nome: 'Sud' }, regione: { codice: '15', nome: 'Campania' }, provincia: { codice: '063', nome: 'Napoli' }, sigla: 'NA', codiceCatastale: 'F839', cap: ['80100', '80121', '80122', '80123', '80124', '80125', '80126', '80127', '80128', '80129', '80130', '80131', '80132', '80133', '80134', '80135', '80136', '80137', '80138', '80139', '80140', '80141', '80142', '80143', '80144', '80145', '80146', '80147'], popolazione: 914000 },
      { nome: 'Bari', codice: '072006', zona: { codice: '4', nome: 'Sud' }, regione: { codice: '16', nome: 'Puglia' }, provincia: { codice: '072', nome: 'Bari' }, sigla: 'BA', codiceCatastale: 'A662', cap: ['70100', '70121', '70122', '70123', '70124', '70125', '70126', '70127', '70128', '70129', '70130', '70131', '70132'], popolazione: 316000 },
      { nome: 'Teramo', codice: '067041', zona: { codice: '4', nome: 'Sud' }, regione: { codice: '13', nome: 'Abruzzo' }, provincia: { codice: '067', nome: 'Teramo' }, sigla: 'TE', codiceCatastale: 'L103', cap: ['64100'], popolazione: 54000 },
      { nome: 'Tortoreto', codice: '067043', zona: { codice: '4', nome: 'Sud' }, regione: { codice: '13', nome: 'Abruzzo' }, provincia: { codice: '067', nome: 'Teramo' }, sigla: 'TE', codiceCatastale: 'L307', cap: ['64018'], popolazione: 11500 },
      { nome: 'Pescara', codice: '068028', zona: { codice: '4', nome: 'Sud' }, regione: { codice: '13', nome: 'Abruzzo' }, provincia: { codice: '068', nome: 'Pescara' }, sigla: 'PE', codiceCatastale: 'G482', cap: ['65100', '65121', '65122', '65123', '65124', '65125', '65126', '65127', '65128', '65129'], popolazione: 119000 },
      { nome: "L'Aquila", codice: '066049', zona: { codice: '4', nome: 'Sud' }, regione: { codice: '13', nome: 'Abruzzo' }, provincia: { codice: '066', nome: "L'Aquila" }, sigla: 'AQ', codiceCatastale: 'A345', cap: ['67100'], popolazione: 69000 },
      { nome: 'Chieti', codice: '069022', zona: { codice: '4', nome: 'Sud' }, regione: { codice: '13', nome: 'Abruzzo' }, provincia: { codice: '069', nome: 'Chieti' }, sigla: 'CH', codiceCatastale: 'C632', cap: ['66100'], popolazione: 50000 },

      // Isole
      { nome: 'Palermo', codice: '082053', zona: { codice: '5', nome: 'Isole' }, regione: { codice: '19', nome: 'Sicilia' }, provincia: { codice: '082', nome: 'Palermo' }, sigla: 'PA', codiceCatastale: 'G273', cap: ['90100', '90121', '90122', '90123', '90124', '90125', '90126', '90127', '90128', '90129', '90130', '90131', '90132', '90133', '90134', '90135', '90136', '90137', '90138', '90139', '90140', '90141', '90142', '90143', '90144', '90145', '90146', '90147', '90148', '90149', '90150', '90151'], popolazione: 648000 },
      { nome: 'Catania', codice: '087015', zona: { codice: '5', nome: 'Isole' }, regione: { codice: '19', nome: 'Sicilia' }, provincia: { codice: '087', nome: 'Catania' }, sigla: 'CT', codiceCatastale: 'C351', cap: ['95100', '95121', '95122', '95123', '95124', '95125', '95126', '95127', '95128', '95129', '95130', '95131'], popolazione: 296000 },
      { nome: 'Cagliari', codice: '092009', zona: { codice: '5', nome: 'Isole' }, regione: { codice: '20', nome: 'Sardegna' }, provincia: { codice: '092', nome: 'Cagliari' }, sigla: 'CA', codiceCatastale: 'B354', cap: ['09100', '09121', '09122', '09123', '09124', '09125', '09126', '09127', '09128', '09129', '09130', '09131', '09132', '09133', '09134'], popolazione: 149000 },
    ];

    for (const comune of fallbackComuni) {
      for (const cap of comune.cap) {
        if (!this.capIndex.has(cap)) {
          this.capIndex.set(cap, comune);
        }
      }
    }
  }

  /**
   * Lookup CAP → dati completi comune
   * @param cap - Codice di avviamento postale (5 cifre)
   * @returns CapLookupResult completo se trovato, null altrimenti
   */
  lookupCap(cap: string): CapLookupResult | null {
    // Normalizza: rimuovi spazi e assicurati 5 cifre
    const normalizedCap = cap.trim().padStart(5, '0');

    // Lookup diretto
    let comune = this.capIndex.get(normalizedCap);

    // Se non trovato, prova con il CAP generico del capoluogo (es. 63xxx → 63100)
    if (!comune) {
      const genericCap = normalizedCap.slice(0, 2) + '100';
      comune = this.capIndex.get(genericCap);
    }

    if (!comune) {
      this.logger.debug(`CAP ${normalizedCap} not found in database`);
      return null;
    }

    return {
      city: comune.nome,
      province: comune.provincia.nome,
      provinceCode: comune.sigla,
      region: comune.regione.nome,
      fullData: comune,
    };
  }

  /**
   * Verifica se un CAP esiste nel database
   */
  isValidCap(cap: string): boolean {
    return this.lookupCap(cap) !== null;
  }

  /**
   * Ritorna statistiche sul database CAP
   */
  getCapStats(): { totalCaps: number; lastUpdated: string } {
    return {
      totalCaps: this.capIndex.size,
      lastUpdated: new Date().toISOString(),
    };
  }
}
