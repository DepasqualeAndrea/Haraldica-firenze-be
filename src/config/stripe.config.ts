import { registerAs } from '@nestjs/config';

export default registerAs('stripe', () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY è richiesta nelle variabili ambiente');
  }

  if (!secretKey.startsWith('sk_')) {
    throw new Error('STRIPE_SECRET_KEY formato invalido (deve iniziare con sk_)');
  }

  if (!publishableKey) {
    throw new Error('STRIPE_PUBLISHABLE_KEY è richiesta nelle variabili ambiente');
  }

  if (!publishableKey.startsWith('pk_')) {
    throw new Error('STRIPE_PUBLISHABLE_KEY formato invalido (deve iniziare con pk_)');
  }

  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET è richiesta nelle variabili ambiente');
  }

  if (!webhookSecret.startsWith('whsec_')) {
    throw new Error('STRIPE_WEBHOOK_SECRET formato invalido (deve iniziare con whsec_)');
  }

  const isSecretTest = secretKey.startsWith('sk_test_');
  const isPublishableTest = publishableKey.startsWith('pk_test_');
  const isProduction = process.env.NODE_ENV === 'production';

  if (isSecretTest !== isPublishableTest) {
    throw new Error('STRIPE_SECRET_KEY e STRIPE_PUBLISHABLE_KEY devono essere entrambe test o entrambe live');
  }
  if (isProduction && isSecretTest) {
    throw new Error('In produzione non sono ammesse chiavi Stripe TEST');
  }

  return {
    secretKey,
    publishableKey,
    webhookSecret,
    currency: 'eur',
    apiVersion: '2024-11-20.acacia' as const,
    config: {
      timeout: 15000,
      maxNetworkRetries: 3,
      telemetry: false,
    },


    paymentMethods: {
      enabled: [
        'card',
        'link',        // ✅ LINK (one-click, salva dati)
        'paypal',      // ✅ PayPal
        'klarna',      // ✅ Klarna
      ],

      byCountry: {
        'IT': ['card', 'klarna', 'paypal', 'sepa_debit'],
        'FR': ['card', 'klarna', 'paypal', 'sepa_debit'],
        'DE': ['card', 'klarna', 'paypal', 'sepa_debit'],
        'ES': ['card', 'klarna', 'paypal', 'sepa_debit'],
        'NL': ['card', 'klarna', 'paypal', 'sepa_debit'],
        'BE': ['card', 'klarna', 'paypal', 'sepa_debit'],
        'AT': ['card', 'klarna', 'paypal', 'sepa_debit'],
        'CH': ['card', 'paypal'],
      },


      limits: {
        klarna: {
          minAmount: 1,
          maxAmount: 1000,
          currencies: ['eur'],
          countries: ['IT', 'DE', 'AT', 'NL', 'BE'],
        },
        paypal: {
          minAmount: 1,
          maxAmount: 10000,
          currencies: ['eur'],
          countries: ['IT', 'FR', 'DE', 'ES', 'NL', 'BE', 'AT'],
        },
        sepa_debit: {
          minAmount: 1,
          maxAmount: 5000,
          currencies: ['eur'],
          countries: ['IT', 'FR', 'DE', 'ES', 'NL', 'BE', 'AT'],
          processingDays: '1-2 giorni lavorativi',
        },
      },
    },


    elements: {
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#C5A352',
          colorBackground: '#ffffff',
          colorText: '#2C2C2C',
          colorDanger: '#dc2626',
          fontFamily: '"Lora", serif',
          spacingUnit: '4px',
          borderRadius: '8px',
        },
        rules: {
          '.Tab': {
            border: '1px solid #e0e0e0',
            borderRadius: '999px',
            padding: '10px 18px',
            backgroundColor: '#ffffff',
            color: '#2C2C2C',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
          },
          '.Tab:hover': {
            borderColor: '#e4dbc3c2',
            backgroundColor: '#FAF8F3',
          },
          '.Tab--selected': {
            backgroundColor: '#C5A352',
            color: '#ffffff',
            borderColor: '#C5A352',
          },
          '.Input': {
            border: '1px solid #e7e7e7',
            borderRadius: '8px',
            fontSize: '15px',
            padding: '12px 14px',
            boxShadow: 'none',
          },
          '.Input:focus': {
            border: '1px solid #C5A352',
            outline: 'none',
            boxShadow: '0 0 0 3px rgba(197, 163, 82, 0.1)',
          },
          '.Label': {
            fontSize: '13px',
            fontWeight: '600',
            color: '#5A5A5A',
            marginBottom: '6px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          },
          '.Error': {
            color: '#dc2626',
            fontSize: '13px',
            marginTop: '6px',
          },
        },
      },


      layout: {
        type: 'tabs',
        defaultCollapsed: false,
        radios: false,
        spacedAccordionItems: true,
      },


      business: {
        name: 'Haraldica Firenze S.r.l.a',
        supportEmail: 'Amministrazione@haraldicafirenze.com',
        supportPhone: '+39 02 1234 5678',
        returnPolicy: 'Resi gratuiti entro 30 giorni',
      },


      checkout: {
        allowPromotionCodes: true,
        shippingAddressCollection: {
          allowedCountries: ['IT', 'FR', 'DE', 'ES', 'NL', 'BE', 'AT', 'CH'],
        },
        billingAddressCollection: 'required',
        phoneNumberCollection: {
          enabled: true,
        },
        customFields: [],
        locale: 'it',
      },
    },


    checkout: {

      sessionTTL: 24 * 60 * 60,


      urlTemplates: {
        success: '/thank-you?session_id={CHECKOUT_SESSION_ID}', 
        cancel: '/order-canceled',  
      },

      customerCreation: 'if_required',

      automaticTax: {
        enabled: true,
        liability: { type: 'self' },
      },

      taxIdCollection: {
        enabled: true,
      },

      invoiceCreation: {
        enabled: false,
      },

      shippingOptions: [],
    },

    tax: {
      enabled: true,
      businessLocation: {
        country: 'IT',
        state: null,
      },
      taxCodes: {
        COSMETICS: 'txcd_99999999',
        SKINCARE: 'txcd_20060004',
        MAKEUP: 'txcd_99999999',
        PERFUMES: 'txcd_20060001',
        SHAMPOO: 'txcd_20060002',
        SUPPLEMENTS: 'txcd_30070000',
        ACCESSORIES: 'txcd_99999999',
        GIFT_SETS: 'txcd_99999999',
        DIGITAL_GOODS: 'txcd_10000000',

        SHIPPING: 'txcd_92010001', // Spedizione
        GIFT_CARD: 'txcd_10000000', // Gift card
        SERVICE: 'txcd_10103000', // Servizi
      },
      defaultTaxCode: 'txcd_99999999',
      automaticTax: {
        enabled: true,
        liability: { type: 'self' },
      },

      customRates: {
        'IT': 22, // IVA Italia 22%
        'FR': 20, // TVA Francia 20%
        'DE': 19, // MwSt Germania 19%
        'ES': 21, // IVA Spagna 21%
      },
    },

    // ===========================
    // 🚚 SHIPPING CONFIGURATION
    // ===========================
    shipping: {
      // ID dello Shipping Rate configurato su Stripe Dashboard
      // Test: shr_xxx | Live: shr_xxx
      shippingRateId: process.env.STRIPE_SHIPPING_RATE_ID || 'shr_1RuaCsRvhRajetIzF4uyti7t',

      // Soglia per spedizione gratuita (in EUR)
      freeShippingThreshold: Number(process.env.FREE_SHIPPING_THRESHOLD) || 50,

      // Costo spedizione standard (in EUR) - usato come fallback
      standardShippingCost: Number(process.env.STANDARD_SHIPPING_COST) || 5.90,

      // Giorni stimati di consegna
      estimatedDeliveryDays: {
        min: 1,
        max: 3,
      },
    },

    webhooks: {
      enabledEvents: [
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
        'payment_intent.canceled',
        'payment_intent.processing',
        'payment_intent.requires_action',

        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',

        'customer.created',
        'customer.updated',
        'customer.deleted',

        'payment_method.attached',
        'payment_method.detached',

        'setup_intent.succeeded',
        'setup_intent.setup_failed',
        'setup_intent.canceled',

        'charge.refunded',
        'refund.created',
        'refund.updated',

        'charge.dispute.created',
        'charge.dispute.updated',

        'invoice.payment_succeeded',
        'invoice.payment_failed',
      ],

      retryConfig: {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelay: 1000, // 1 secondo
      },
    },

    features: {
      enableElements: true,
      enableCheckoutSessions: true, // Mantieni per compatibilità
      enableAutomaticTax: true,
      enablePromotionCodes: true,
      enableCustomerPortal: false,
      enableSubscriptions: false, // Per ora disabilitato
      enableConnect: false, // Per marketplace

      experimental: {
        enableExpressCheckout: true,  // ✅ ABILITA EXPRESS CHECKOUT (Apple Pay, Google Pay, Link)
        enableSavedPaymentMethods: true,  // ✅ ABILITA LINK per salvare metodi
        enableInstantCheckout: true,
      },
    },

    security: {
      require3DSecure: 'automatic', // 'automatic' | 'any' | 'challenge'

      radar: {
        enabled: true,
        riskLevel: 'normal', // 'low' | 'normal' | 'high'
      },

      rateLimits: {
        paymentsPerMinute: 20,
        customersPerHour: 100,
        webhooksPerMinute: 100,
      },
    },
  };
});