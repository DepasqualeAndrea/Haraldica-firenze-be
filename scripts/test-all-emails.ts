// import { NestFactory } from '@nestjs/core';
// import { AppModule } from '../src/app.module';
// import { EmailService } from '../src/modules/notifications/email.service';

// async function testAllEmails() {
//   console.log('🧪 TEST COMPLETO SISTEMA EMAIL\n');
//   console.log('='.repeat(60));

//   const app = await NestFactory.createApplicationContext(AppModule);
//   const emailService = app.get(EmailService);

//   const testEmail = 'andre.dep1994@gmail.com';
//   const testOrderNumber = `TEST-${Date.now()}`;

//   console.log(`📧 Invio test a: ${testEmail}\n`);

//   // ===========================
//   // 1. ORDER CONFIRMATION
//   // ===========================
//   console.log('📧 1/9 - Order Confirmation...');
//   try {
//     await emailService.sendOrderConfirmation({
//       email: testEmail,
//       orderNumber: testOrderNumber,
//       orderTotal: 149.99,
//       items: [
//         {
//           name: 'Siero Vitamina C Luxury',
//           quantity: 1,
//           price: 45.00,
//         },
//         {
//           name: 'Crema Viso Anti-Age',
//           quantity: 2,
//           price: 52.49,
//         },
//       ],
//       shippingAddress: {
//         name: 'Andrea Rossi',
//         street: 'Via Test 123',
//         city: 'Roma',
//         postalCode: '00100',
//         country: 'Italia',
//       },
//       estimatedDelivery: 'Venerdì 25 Ottobre 2024',
//     });
//     console.log('   ✅ Inviata\n');
//   } catch (error) {
//     console.log('   ❌ Errore:', error.message, '\n');
//   }

//   await sleep(1000);

//   // ===========================
//   // 2. PAYMENT CONFIRMATION
//   // ===========================
//   console.log('📧 2/9 - Payment Confirmation...');
//   try {
//     await emailService.sendPaymentConfirmation({
//       email: testEmail,
//       orderNumber: testOrderNumber,
//       amount: 149.99,
//       paymentMethod: 'Carta di Credito •••• 4242',
//     });
//     console.log('   ✅ Inviata\n');
//   } catch (error) {
//     console.log('   ❌ Errore:', error.message, '\n');
//   }

//   await sleep(1000);

//   // ===========================
//   // 3. SHIPPING NOTIFICATION
//   // ===========================
//   console.log('📧 3/9 - Shipping Notification...');
//   try {
//     await emailService.sendShippingNotification({
//       email: testEmail,
//       orderNumber: testOrderNumber,
//       trackingNumber: 'BRT123456789IT',
//       trackingUrl: 'https://track.brt.it/?tracking=BRT123456789IT',
//       carrier: 'BRT',
//       estimatedDelivery: 'Venerdì 25 Ottobre 2024',
//     });
//     console.log('   ✅ Inviata\n');
//   } catch (error) {
//     console.log('   ❌ Errore:', error.message, '\n');
//   }

//   await sleep(1000);

//   // ===========================
//   // 4. DELIVERY UPDATE - IN TRANSIT
//   // ===========================
//   console.log('📧 4/9 - Delivery Update (In Transit)...');
//   try {
//     await emailService.sendDeliveryUpdate({
//       email: testEmail,
//       orderNumber: testOrderNumber,
//       status: 'in_transit',
//       trackingNumber: 'BRT123456789IT',
//       message: 'Il tuo pacco ha lasciato il centro di smistamento ed è in viaggio verso la tua città.',
//     });
//     console.log('   ✅ Inviata\n');
//   } catch (error) {
//     console.log('   ❌ Errore:', error.message, '\n');
//   }

//   await sleep(1000);

//   // ===========================
//   // 5. DELIVERY UPDATE - OUT FOR DELIVERY
//   // ===========================
//   console.log('📧 5/9 - Delivery Update (Out for Delivery)...');
//   try {
//     await emailService.sendDeliveryUpdate({
//       email: testEmail,
//       orderNumber: testOrderNumber,
//       status: 'out_for_delivery',
//       trackingNumber: 'BRT123456789IT',
//       message: 'Il corriere sta per consegnare il tuo ordine entro le 18:00 di oggi.',
//     });
//     console.log('   ✅ Inviata\n');
//   } catch (error) {
//     console.log('   ❌ Errore:', error.message, '\n');
//   }

//   await sleep(1000);

//   // ===========================
//   // 6. DELIVERY UPDATE - DELIVERED
//   // ===========================
//   console.log('📧 6/9 - Delivery Update (Delivered)...');
//   try {
//     await emailService.sendDeliveryUpdate({
//       email: testEmail,
//       orderNumber: testOrderNumber,
//       status: 'delivered',
//       trackingNumber: 'BRT123456789IT',
//       message: 'Pacco consegnato alle ore 14:32. Firma: A. Rossi',
//     });
//     console.log('   ✅ Inviata\n');
//   } catch (error) {
//     console.log('   ❌ Errore:', error.message, '\n');
//   }

//   await sleep(1000);

//   // ===========================
//   // 7. ORDER STATUS UPDATE
//   // ===========================
//   console.log('📧 7/9 - Order Status Update...');
//   try {
//     await emailService.sendOrderStatusUpdate({
//       email: testEmail,
//       orderNumber: testOrderNumber,
//       oldStatus: 'PENDING',
//       newStatus: 'CONFIRMED',
//       message: 'Il tuo pagamento è stato confermato e il tuo ordine è stato preso in carico dal nostro team.',
//     });
//     console.log('   ✅ Inviata\n');
//   } catch (error) {
//     console.log('   ❌ Errore:', error.message, '\n');
//   }

//   await sleep(1000);

//   // ===========================
//   // 8. PASSWORD RESET
//   // ===========================
//   console.log('📧 8/9 - Password Reset...');
//   try {
//     await emailService.sendPasswordReset({
//       email: testEmail,
//       resetToken: 'test-token-abc123xyz',
//       resetUrl: 'https://meravien.com/reset-password?token=test-token-abc123xyz',
//     });
//     console.log('   ✅ Inviata\n');
//   } catch (error) {
//     console.log('   ❌ Errore:', error.message, '\n');
//   }

//   await sleep(1000);

//   // ===========================
//   // 9. WELCOME EMAIL
//   // ===========================
//   console.log('📧 9/9 - Welcome Email...');
//   try {
//     await emailService.sendWelcomeEmail({
//       email: testEmail,
//       firstName: 'Andrea',
//       welcomeCode: 'WELCOMEANDRE15',
//     });
//     console.log('   ✅ Inviata\n');
//   } catch (error) {
//     console.log('   ❌ Errore:', error.message, '\n');
//   }

//   await sleep(1000);

//   // ===========================
//   // 10. REFUND NOTIFICATION (BONUS)
//   // ===========================
//   console.log('📧 BONUS 1/2 - Refund Notification (Full)...');
//   try {
//     await emailService.sendCustomEmail({
//       to: testEmail,
//       subject: `Rimborso Confermato - Ordine ${testOrderNumber}`,
//       template: 'refund-notification',
//       context: {
//         customerName: 'Andrea Rossi',
//         orderNumber: testOrderNumber,
//         refundAmount: 149.99,
//         isFullRefund: true,
//         reason: 'Richiesto dal cliente',
//         estimatedArrival: '5-10 giorni lavorativi',
//         originalAmount: 149.99,
//         refundPercentage: 100,
//       },
//       type: 'orders',
//     });
//     console.log('   ✅ Inviata\n');
//   } catch (error) {
//     console.log('   ❌ Errore:', error.message, '\n');
//   }

//   await sleep(1000);

//   // ===========================
//   // 11. LOW STOCK ALERT (BONUS ADMIN)
//   // ===========================
//   console.log('📧 BONUS 2/2 - Low Stock Alert (Admin)...');
//   try {
//     await emailService.sendLowStockAlert({
//       products: [
//         {
//           id: '1',
//           name: 'Siero Vitamina C Premium',
//           sku: 'SER-VIT-C-001',
//           currentStock: 0,
//           minStockThreshold: 10,
//           category: 'Skincare',
//           price: 45.99,
//         },
//         {
//           id: '2',
//           name: 'Crema Viso Anti-Age',
//           sku: 'CRM-ANTI-AGE-002',
//           currentStock: 3,
//           minStockThreshold: 15,
//           category: 'Skincare',
//           price: 67.50,
//         },
//         {
//           id: '3',
//           name: 'Maschera Purificante',
//           sku: 'MSK-PUR-003',
//           currentStock: 5,
//           minStockThreshold: 20,
//           category: 'Maschere',
//           price: 28.00,
//         },
//       ],
//       totalProductsLow: 3,
//     });
//     console.log('   ✅ Inviata (a amministrazione@meravien.com)\n');
//   } catch (error) {
//     console.log('   ❌ Errore:', error.message, '\n');
//   }

//   // ===========================
//   // RIEPILOGO
//   // ===========================
//   console.log('='.repeat(60));
//   console.log('\n✅ TEST COMPLETATO!\n');
//   console.log('📬 Controlla la tua inbox: ' + testEmail);
//   console.log('📬 Controlla anche: amministrazione@meravien.com (per low stock alert)\n');
//   console.log('📊 Email Inviate:');
//   console.log('   ✉️  9 email essenziali per ordini');
//   console.log('   ✉️  2 email bonus (refund + low stock)\n');
//   console.log('💡 Suggerimento: Controlla anche la cartella SPAM se non vedi le email\n');

//   await app.close();
// }

// function sleep(ms: number): Promise<void> {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

// testAllEmails().catch(console.error);