import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, DataSource, Not } from 'typeorm';
import { CartItem } from 'src/database/entities/cart-item.entity';
import { Cart } from 'src/database/entities/cart.entity';
import { Address } from 'src/database/entities/address.entity';
import { User, UserRole } from 'src/database/entities/user.entity';

export interface CreateAddressForUserDto {
  name: string;
  street: string;
  city: string;
  province?: string;
  provinceCode?: string;
  postalCode: string;
  country: string;
  phone?: string;
  company?: string;
  vatNumber?: string;
  isDefault?: boolean;
  type?: 'shipping' | 'billing';
  notes?: string;
}

@Injectable()
export class AddressService {
  private readonly logger = new Logger(AddressService.name);

  constructor(
    @InjectRepository(Address)
    private addressRepository: Repository<Address>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Cart)  // ✅ AGGIUNGI
    private cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)  // ✅ AGGIUNGI
    private cartItemRepository: Repository<CartItem>,
    private dataSource: DataSource,
  ) { }

  private normalizePhone(phone?: string): string | undefined {
    if (!phone) return undefined;

    // Rimuovi spazi e caratteri speciali
    let normalized = phone.trim().replace(/[\s\-\(\)]/g, '');

    // Se è vuoto dopo cleaning, ritorna undefined
    if (!normalized) return undefined;

    // Rimuovi prefix alternativi (0039 o 39) e sostituisci con +39
    if (normalized.startsWith('0039')) {
      normalized = '+39' + normalized.slice(4);
    } else if (normalized.startsWith('39') && !normalized.startsWith('+39')) {
      normalized = '+39' + normalized.slice(2);
    } else if (!normalized.startsWith('+39')) {
      // Se non ha prefix, aggiungilo
      normalized = '+39' + normalized;
    }

    // Valida lunghezza (deve essere +39 + 9-10 cifre)
    const digitsOnly = normalized.replace(/\D/g, '');
    if (digitsOnly.length < 11 || digitsOnly.length > 12) {
      this.logger.warn(`⚠️ Telefono con lunghezza non valida: ${phone} → ${normalized}`);
    }

    return normalized;
  }

  private normalizeEmail(email?: string): string | undefined {
    if (!email) return undefined;
    return email.trim().toLowerCase();
  }

  // ===========================
  // CREAZIONE INDIRIZZI
  // ===========================

  async createAddressForUser(
    userId: string,
    createAddressDto: CreateAddressForUserDto,
    manager?: EntityManager
  ): Promise<Address> {
    if (manager) {
      return this.createAddressForUserInternal(userId, createAddressDto, manager);
    }
    return this.dataSource.transaction(async (transactionManager) => {
      return this.createAddressForUserInternal(userId, createAddressDto, transactionManager);
    });
  }

  private async createAddressForUserInternal(
    userId: string,
    createAddressDto: CreateAddressForUserDto,
    manager: EntityManager
  ): Promise<Address> {
    // Verifica che l'utente esista
    const user = await manager.findOne(User, { where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Utente ${userId} non trovato`);
    }

    // ✅ Calcola province e provinceCode se mancanti
    const province = createAddressDto.province || 'N/A';
    const provinceCode = createAddressDto.provinceCode || this.extractProvinceCode(province);

    // ✅ NORMALIZZA phone prima di salvare
    const normalizedDto = {
      ...createAddressDto,
      phone: this.normalizePhone(createAddressDto.phone),
      province,
      provinceCode,
    };

    // Valida indirizzo
    this.validateAddressData(normalizedDto);

    // Gestisci default
    if (normalizedDto.isDefault) {
      await this.clearDefaultAddresses(userId, normalizedDto.type || 'shipping', manager);
    }

    // Crea indirizzo
    const address = manager.create(Address, {
      ...normalizedDto,
      userId,
      type: normalizedDto.type || 'shipping',
    });

    const savedAddress = await manager.save(Address, address);

    this.logger.log(
      `✅ Indirizzo creato per utente ${userId}: ${savedAddress.id} (${savedAddress.type}) - Phone: ${savedAddress.phone}`
    );

    return savedAddress;
  }
  // ===========================
  // SALVATAGGIO DA CHECKOUT
  // ===========================
  // ============================================
  // 🔧 FIX ADDRESS SERVICE - saveAddressFromCheckout
  // ============================================
  // File: src/modules/public-api/addresses/addresses.service.ts
  // ============================================

  /**
   * ✅ METODO AGGIORNATO: Salva indirizzo da checkout nella tabella addresses
   */
  async saveAddressFromCheckout(
    orderAddress: {
      name: string;
      street: string;
      city: string;
      postalCode: string;
      country: string;
      provinceCode?: string;
      province?: string;
      phone?: string;
      company?: string;
      vatNumber?: string;
    },
    userId?: string,
    type: 'shipping' | 'billing' = 'shipping',
    manager?: EntityManager
  ): Promise<Address | null> {
    const repo = manager
      ? manager.getRepository(Address)
      : this.addressRepository;

    try {
      // ✅ Estrai provincia e provinceCode
      const province = orderAddress.province || orderAddress.provinceCode || 'N/A';
      const provinceCode = orderAddress.provinceCode || this.extractProvinceCode(province);

      // ✅ Verifica se indirizzo esiste già
      const existingAddress = await repo.findOne({
        where: {
          userId,
          street: orderAddress.street,
          city: orderAddress.city,
          postalCode: orderAddress.postalCode,
          type,
        },
      });

      if (existingAddress) {
        this.logger.log(
          `📍 Indirizzo ${type} già esistente, aggiorno usage: ${existingAddress.id}`,
        );

        existingAddress.markAsUsed();

        await repo.save(existingAddress);
        return existingAddress;
      }

      // ✅ Crea nuovo indirizzo
      const newAddress = repo.create({
        userId,
        name: orderAddress.name,
        street: orderAddress.street,
        city: orderAddress.city,
        postalCode: orderAddress.postalCode,
        country: orderAddress.country || 'IT',
        province: province,
        provinceCode: provinceCode,
        phone: orderAddress.phone,
        company: orderAddress.company,
        vatNumber: orderAddress.vatNumber,
        type,
        isDefault: false,
        lastUsedAt: new Date(),
        usageCount: 1,
      });

      const saved = await repo.save(newAddress);

      this.logger.log(`✅ Nuovo indirizzo ${type} salvato: ${saved.id}`);

      return saved;
    } catch (error: any) {
      this.logger.error(
        `❌ Errore salvataggio indirizzo ${type}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * ✅ HELPER: Estrae codice provincia da nome
   */
  private extractProvinceCode(provinceName: string): string {
    const PROVINCE_CODES: Record<string, string> = {
      'agrigento': 'AG', 'alessandria': 'AL', 'ancona': 'AN', 'aosta': 'AO',
      'ascoli piceno': 'AP', "l'aquila": 'AQ', 'arezzo': 'AR', 'asti': 'AT',
      'avellino': 'AV', 'bari': 'BA', 'bergamo': 'BG', 'biella': 'BI',
      'belluno': 'BL', 'benevento': 'BN', 'bologna': 'BO', 'brindisi': 'BR',
      'brescia': 'BS', 'barletta-andria-trani': 'BT', 'bolzano': 'BZ',
      'cagliari': 'CA', 'campobasso': 'CB', 'caserta': 'CE', 'chieti': 'CH',
      'caltanissetta': 'CL', 'cuneo': 'CN', 'como': 'CO', 'cremona': 'CR',
      'cosenza': 'CS', 'catania': 'CT', 'catanzaro': 'CZ', 'enna': 'EN',
      'forlì-cesena': 'FC', 'ferrara': 'FE', 'foggia': 'FG', 'firenze': 'FI',
      'fermo': 'FM', 'frosinone': 'FR', 'genova': 'GE', 'gorizia': 'GO',
      'grosseto': 'GR', 'imperia': 'IM', 'isernia': 'IS', 'crotone': 'KR',
      'lecco': 'LC', 'lecce': 'LE', 'livorno': 'LI', 'lodi': 'LO',
      'latina': 'LT', 'lucca': 'LU', 'monza e brianza': 'MB', 'macerata': 'MC',
      'messina': 'ME', 'milano': 'MI', 'mantova': 'MN', 'modena': 'MO',
      'massa-carrara': 'MS', 'matera': 'MT', 'napoli': 'NA', 'novara': 'NO',
      'nuoro': 'NU', 'oristano': 'OR', 'palermo': 'PA', 'piacenza': 'PC',
      'padova': 'PD', 'pescara': 'PE', 'perugia': 'PG', 'pisa': 'PI',
      'pordenone': 'PN', 'prato': 'PO', 'parma': 'PR', 'pistoia': 'PT',
      'pesaro e urbino': 'PU', 'pavia': 'PV', 'potenza': 'PZ', 'ravenna': 'RA',
      'reggio calabria': 'RC', 'reggio emilia': 'RE', 'ragusa': 'RG',
      'rieti': 'RI', 'roma': 'RM', 'rimini': 'RN', 'rovigo': 'RO',
      'salerno': 'SA', 'siena': 'SI', 'sondrio': 'SO', 'la spezia': 'SP',
      'siracusa': 'SR', 'sassari': 'SS', 'sud sardegna': 'SU', 'savona': 'SV',
      'taranto': 'TA', 'teramo': 'TE', 'trento': 'TN', 'torino': 'TO',
      'trapani': 'TP', 'terni': 'TR', 'trieste': 'TS', 'treviso': 'TV',
      'udine': 'UD', 'varese': 'VA', 'verbano-cusio-ossola': 'VB',
      'vercelli': 'VC', 'venezia': 'VE', 'vicenza': 'VI', 'verona': 'VR',
      'viterbo': 'VT', 'vibo valentia': 'VV',
    };

    const normalized = provinceName.toLowerCase().trim();
    return PROVINCE_CODES[normalized] || provinceName.toUpperCase().slice(0, 2);
  }

  async getAddressesForCheckout(
    userId?: string
  ): Promise<{
    shipping: Address[];
    billing: Address[];
    defaultShipping?: Address;
    defaultBilling?: Address;
  }> {
    if (!userId) {
      return {
        shipping: [],
        billing: [],
      };
    }

    try {
      const [shipping, billing] = await Promise.all([
        this.addressRepository.find({
          where: { userId, type: 'shipping' },
          order: { isDefault: 'DESC', lastUsedAt: 'DESC' },
          take: 5,
        }),
        this.addressRepository.find({
          where: { userId, type: 'billing' },
          order: { isDefault: 'DESC', lastUsedAt: 'DESC' },
          take: 5,
        }),
      ]);

      return {
        shipping,
        billing,
        defaultShipping: shipping.find((a) => a.isDefault),
        defaultBilling: billing.find((a) => a.isDefault),
      };
    } catch (error) {
      this.logger.error('❌ Errore getAddressesForCheckout:', error);
      return {
        shipping: [],
        billing: [],
      };
    }
  }


  /**
   * Crea o trova guest user per email (con merge intelligente)
   */
  // src/modules/addresses/addresses.service.ts

  async ensureGuestByEmail(
    email: string,
    guestData: {
      name?: string;
      phone?: string;
      userId: string;
    },
    manager?: EntityManager
  ): Promise<User> {
    const em = manager || this.dataSource.manager;

    // ✅ NORMALIZZA email e phone
    const normalizedEmail = this.normalizeEmail(email);
    const normalizedPhone = this.normalizePhone(guestData.phone);

    if (!normalizedEmail) {
      throw new BadRequestException('Email non valida');
    }

    this.logger.log(
      `👤 [Address] Ensure guest by email START: email=${normalizedEmail}, phone=${normalizedPhone}, userId=${guestData.userId}`,
    );

    try {
      // 1️⃣ Cerca se esiste utente REGISTRATO con questa email
      const existingRegistered = await em.findOne(User, {
        where: {
          email: normalizedEmail,
          role: Not(UserRole.GUEST),
        },
      });

      if (existingRegistered) {
        this.logger.log(
          `🔄 [Address] Email ${normalizedEmail} appartiene a utente REGISTRATO ${existingRegistered.id}.`,
        );

        // ✅ Aggiorna phone se presente
        if (normalizedPhone && !existingRegistered.phone) {
          existingRegistered.phone = normalizedPhone;
          await em.save(User, existingRegistered);
        }

        // ✅ Aggiorna lastCheckoutEmail per completezza
        if (existingRegistered.lastCheckoutEmail !== normalizedEmail) {
          existingRegistered.lastCheckoutEmail = normalizedEmail;
          await em.save(User, existingRegistered);
        }

        return existingRegistered;
      }

      // 2️⃣ Cerca guest user con questo userId
      let guestUser = await em.findOne(User, {
        where: {
          id: guestData.userId,
          role: UserRole.GUEST,
        },
      });

      if (!guestUser) {
        this.logger.error(
          `❌ [Address] Guest user ${guestData.userId} non trovato. ` +
          `Dovrebbe essere già stato creato da GuestTokenService.`,
        );
        throw new NotFoundException(`Guest user ${guestData.userId} not found`);
      }

      this.logger.log(
        `👤 [Address] Guest trovato: ${guestUser.id} - emailTecnica=${guestUser.email}, lastCheckoutEmail=${guestUser.lastCheckoutEmail}`,
      );

      if (guestUser.lastCheckoutEmail !== normalizedEmail) {
        this.logger.log(
          `📧 [Address] Aggiorno lastCheckoutEmail per guest ${guestUser.id}: ` +
          `${guestUser.lastCheckoutEmail || 'none'} → ${normalizedEmail}`,
        );
        guestUser.lastCheckoutEmail = normalizedEmail;
      }

      // ✅ Aggiorna name e phone
      if (guestData.name) {
        const [firstName, ...lastNameParts] = guestData.name.split(' ');
        guestUser.firstName = firstName;
        guestUser.lastName = lastNameParts.join(' ') || '';
      }

      if (normalizedPhone) {
        guestUser.phone = normalizedPhone;
      }

      guestUser.extendExpiry(90);

      guestUser = await em.save(User, guestUser);

      this.logger.log(
        `✅ [Address] Guest user aggiornato OK: ${guestUser.id} - emailTecnica=${guestUser.email} - lastCheckoutEmail=${guestUser.lastCheckoutEmail} - Phone: ${guestUser.phone}`,
      );

      return guestUser;
    } catch (e) {
      this.logger.error(
        `❌ [Address] ensureGuestByEmail FAILED: email=${normalizedEmail}, userId=${guestData.userId} - ${e?.message}`,
        e instanceof Error ? e.stack : e,
      );
      throw e;
    }
  }
  /**
   * Migra carrello da session guest a userId
   */
  private async migrateGuestCartToUser(
    guestUserId: string,
    targetUserId: string,
    manager: EntityManager
  ): Promise<void> {
    try {
      this.logger.log(`🔄 Migrating cart: guest ${guestUserId} → user ${targetUserId}`);

      // Cart del guest
      const guestCart = await manager.findOne(Cart, {
        where: { userId: guestUserId },
        relations: ['items'],
      });

      if (!guestCart || guestCart.items.length === 0) {
        this.logger.debug(`ℹ️ Nessun cart guest da migrare`);
        return;
      }

      // Cart dell'utente target
      let targetCart = await manager.findOne(Cart, {
        where: { userId: targetUserId },
        relations: ['items'],
      });

      if (!targetCart) {
        // Crea cart per target user
        targetCart = manager.create(Cart, {
          userId: targetUserId,
          items: [],
        });
        targetCart = await manager.save(Cart, targetCart);
      }

      // Migra items unificando quantità
      for (const guestItem of guestCart.items) {
        const existingItem = targetCart.items.find(
          (item) => item.variantId === guestItem.variantId
        );

        if (existingItem) {
          // Somma quantità
          await manager.update(CartItem, existingItem.id, {
            quantity: existingItem.quantity + guestItem.quantity,
          });
        } else {
          // Sposta item
          await manager.update(CartItem, guestItem.id, {
            cartId: targetCart.id,
          });
        }
      }

      // Rimuovi guest cart
      await manager.remove(Cart, guestCart);

      this.logger.log(
        `✅ Cart migrato da guest ${guestUserId} a user ${targetUserId}`
      );
    } catch (error) {
      this.logger.error(
        `❌ Errore migrazione cart guest → user: ${error.message}`,
        error.stack
      );
    }
  }

  // ✅ NUOVI METODI HELPER

  private buildFullStreet(addressData: any): string {
    let street = addressData.street || '';

    if (addressData.streetNumber) {
      street += `, ${addressData.streetNumber}`;
    }

    if (addressData.additionalInfo) {
      street += ` (${addressData.additionalInfo})`;
    }

    return street;
  }

  private buildAddressNotes(addressData: any): string | undefined {
    const notes: string[] = [];

    if (addressData.province) {
      notes.push(`Provincia: ${addressData.province}`);
    }

    if (addressData.firstName && addressData.lastName) {
      notes.push(`Nome completo: ${addressData.firstName} ${addressData.lastName}`);
    }

    if (addressData.additionalInfo) {
      notes.push(`Info aggiuntive: ${addressData.additionalInfo}`);
    }

    return notes.length > 0 ? notes.join('; ') : undefined;
  }

  private async findSimilarAddress(
    addressData: any,
    userId?: string,
    type?: string,
    manager?: EntityManager
  ): Promise<Address | null> {
    const repo = manager ? manager.getRepository(Address) : this.addressRepository;

    const whereCondition: any = {
      street: addressData.street,
      city: addressData.city,
      postalCode: addressData.postalCode,
      country: addressData.country,
      name: addressData.name,
    };

    if (type) whereCondition.type = type;
    if (userId) whereCondition.userId = userId;

    return repo.findOne({ where: whereCondition });
  }

  // ===========================
  // RECUPERO INDIRIZZI
  // ===========================

  async findUserAddresses(
    userId: string,
    type?: 'shipping' | 'billing'
  ): Promise<Address[]> {
    const whereCondition: any = { userId };
    if (type) whereCondition.type = type;

    return this.addressRepository.find({
      where: whereCondition,
      order: {
        isDefault: 'DESC',
        lastUsedAt: 'DESC',
        createdAt: 'DESC'
      },
    });
  }

  async getDefaultAddress(
    userId?: string,
    type: 'shipping' | 'billing' = 'shipping'
  ): Promise<Address | null> {
    if (!userId) return null;

    return this.addressRepository.findOne({
      where: {
        userId,
        isDefault: true,
        type
      },
      relations: ['user']
    });
  }


  // ===========================
  // GESTIONE DEFAULT
  // ===========================

  async setDefaultAddress(
    addressId: string,
    userId?: string,
  ): Promise<Address> {
    return this.dataSource.transaction(async (manager) => {
      const address = await manager.findOne(Address, {
        where: { id: addressId },
        relations: ['user']
      });

      if (!address) {
        throw new NotFoundException(`Indirizzo ${addressId} non trovato`);
      }

      // Verifica ownership
      if (userId && address.userId !== userId) {
        throw new BadRequestException('Indirizzo non appartiene all\'utente specificato');
      }


      // Rimuovi default dagli altri indirizzi dello stesso tipo
      await this.clearDefaultAddresses(
        address.userId || undefined,
        address.type,
        manager
      );

      // Imposta questo come default
      address.isDefault = true;
      return manager.save(Address, address);
    });
  }

  private async clearDefaultAddresses(
    userId?: string,
    type: 'shipping' | 'billing' = 'shipping',
    manager?: EntityManager
  ): Promise<void> {
    if (!userId) return;

    const repo = manager ? manager.getRepository(Address) : this.addressRepository;

    await repo.update(
      {
        userId,
        isDefault: true,
        type
      },
      { isDefault: false }
    );
  }

  // ===========================
  // MIGRAZIONE E CLEANUP
  // ===========================

  async migrateOrderAddressToTable(
    orderAddress: any,
    orderId: string,
    userId?: string,
    type: 'shipping' | 'billing' = 'shipping'
  ): Promise<Address | null> {
    try {
      if (!orderAddress || !orderAddress.name) {
        this.logger.warn(`Indirizzo ordine ${orderId} non valido per migrazione`);
        return null;
      }

      return this.saveAddressFromCheckout(
        orderAddress,
        userId,
        type
      );
    } catch (error) {
      this.logger.error(`Errore migrazione indirizzo ordine ${orderId}:`, error);
      return null;
    }
  }


  // ===========================
  // VALIDAZIONE
  // ===========================

  private isValidPostalCode(postalCode: string, country: string): boolean {
    const patterns = {
      IT: /^\d{5}$/,
      FR: /^\d{5}$/,
      DE: /^\d{5}$/,
      ES: /^\d{5}$/,
      AT: /^\d{4}$/,
      BE: /^\d{4}$/,
      NL: /^\d{4}\s?[A-Z]{2}$/,
      PT: /^\d{4}-\d{3}$/,
      GR: /^\d{5}$/,
    };

    const pattern = patterns[country.toUpperCase()];
    return pattern ? pattern.test(postalCode) : true;
  }

  // ===========================
  // STATISTICHE
  // ===========================

  async getAddressStats(
    userId?: string,
  ): Promise<{
    totalAddresses: number;
    shippingAddresses: number;
    billingAddresses: number;
    hasDefaultShipping: boolean;
    hasDefaultBilling: boolean;
  }> {
    const whereCondition: any = {};
    if (userId) whereCondition.userId = userId;

    const addresses = await this.addressRepository.find({ where: whereCondition });

    const shippingAddresses = addresses.filter(a => a.type === 'shipping');
    const billingAddresses = addresses.filter(a => a.type === 'billing');

    return {
      totalAddresses: addresses.length,
      shippingAddresses: shippingAddresses.length,
      billingAddresses: billingAddresses.length,
      hasDefaultShipping: shippingAddresses.some(a => a.isDefault),
      hasDefaultBilling: billingAddresses.some(a => a.isDefault),
    };
  }

  // ===========================
  // METODI AGGIUNTIVI PER CONTROLLER
  // ===========================

  async findOne(
    addressId: string,
    userId?: string,
  ): Promise<Address | null> {
    const whereCondition: any = { id: addressId };
    if (userId) whereCondition.userId = userId;

    return this.addressRepository.findOne({
      where: whereCondition,
      relations: ['user'],
    });
  }

  async updateAddress(
    addressId: string,
    updateData: Partial<CreateAddressForUserDto>,
    userId?: string,
    manager?: EntityManager
  ): Promise<Address> {
    if (manager) {
      return this.updateAddressInternal(addressId, updateData, userId, manager);
    }
    return this.dataSource.transaction(async (transactionManager) => {
      return this.updateAddressInternal(addressId, updateData, userId, transactionManager);
    });
  }

  private async updateAddressInternal(
    addressId: string,
    updateData: Partial<CreateAddressForUserDto>,
    userId?: string,
    manager?: EntityManager
  ): Promise<Address> {
    const repo = manager ? manager.getRepository(Address) : this.addressRepository;

    const address = await this.findOne(addressId, userId);
    if (!address) {
      throw new NotFoundException(`Indirizzo ${addressId} non trovato`);
    }

    // Verifica ownership
    if (userId && address.userId !== userId) {
      throw new BadRequestException('Indirizzo non appartiene all\'utente specificato');
    }

    // ✅ NORMALIZZA phone se presente
    if (updateData.phone) {
      updateData.phone = this.normalizePhone(updateData.phone);
    }

    // ✅ Calcola provinceCode se presente province ma non code (per coerenza con la create)
    if (updateData.province && !updateData.provinceCode) {
      updateData.provinceCode = this.extractProvinceCode(updateData.province);
    }

    // Valida i nuovi dati
    if (
      Object.keys(updateData).some((key) =>
        ['name', 'street', 'city', 'postalCode', 'country'].includes(key)
      )
    ) {
      this.validateAddressData({ ...address, ...updateData });
    }

    // Gestisci il cambio di default
    if (updateData.isDefault === true && !address.isDefault) {
      await this.clearDefaultAddresses(address.userId || undefined, address.type, manager);
    }

    // Aggiorna i campi
    Object.assign(address, updateData);

    const savedAddress = await repo.save(address);

    this.logger.log(
      `✅ Indirizzo aggiornato: ${savedAddress.id} - Phone: ${savedAddress.phone}`
    );

    return savedAddress;
  }

  async removeAddress(
    addressId: string,
    userId?: string,
    manager?: EntityManager
  ): Promise<void> {
    if (manager) {
      return this.removeAddressInternal(addressId, userId, manager);
    }
    return this.dataSource.transaction(async (transactionManager) => {
      return this.removeAddressInternal(addressId, userId, transactionManager);
    });
  }

  private async removeAddressInternal(
    addressId: string,
    userId?: string,
    manager?: EntityManager
  ): Promise<void> {
    const repo = manager ? manager.getRepository(Address) : this.addressRepository;

    const address = await this.findOne(addressId, userId);
    if (!address) {
      throw new NotFoundException(`Indirizzo ${addressId} non trovato`);
    }

    // Verifica ownership
    if (userId && address.userId !== userId) {
      throw new BadRequestException('Indirizzo non appartiene all\'utente specificato');
    }

    await repo.remove(address);

    this.logger.log(`Indirizzo eliminato: ${addressId}`);
  }

  async validateAddressData(addressData: any): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestions?: {
      formattedAddress?: string;
      normalizedPostalCode?: string;
      suggestedCity?: string;
      normalizedPhone?: string;
    };
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validazioni base
    if (!addressData.name) errors.push('Nome richiesto');
    if (!addressData.street) errors.push('Via richiesta');
    if (!addressData.city) errors.push('Città richiesta');
    if (!addressData.postalCode) errors.push('Codice postale richiesto');
    if (!addressData.country) errors.push('Paese richiesto');

    // Validazione paese supportato
    const supportedCountries = ['IT', 'FR', 'DE', 'ES', 'AT', 'BE', 'NL', 'PT', 'GR'];
    if (addressData.country && !supportedCountries.includes(addressData.country.toUpperCase())) {
      errors.push(`Paese non supportato: ${addressData.country}`);
    }

    // Validazione codice postale
    if (addressData.postalCode && addressData.country) {
      const isValidPostal = this.isValidPostalCode(addressData.postalCode, addressData.country);
      if (!isValidPostal) {
        errors.push(
          `Codice postale non valido per ${addressData.country}: ${addressData.postalCode}`
        );
      }
    }

    // ✅ Validazione telefono
    if (addressData.phone) {
      const normalizedPhone = this.normalizePhone(addressData.phone);

      if (!normalizedPhone || normalizedPhone.length < 12) {
        warnings.push('Numero di telefono potrebbe non essere valido');
      }
    }

    // Suggerimenti
    const suggestions: any = {};
    if (errors.length === 0) {
      suggestions.formattedAddress = `${addressData.street}, ${addressData.city} ${addressData.postalCode}, ${addressData.country}`;
      suggestions.normalizedPostalCode = addressData.postalCode?.replace(/\s+/g, '').toUpperCase();

      // ✅ Suggerisci phone normalizzato
      if (addressData.phone) {
        suggestions.normalizedPhone = this.normalizePhone(addressData.phone);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions: Object.keys(suggestions).length > 0 ? suggestions : undefined,
    };
  }
}