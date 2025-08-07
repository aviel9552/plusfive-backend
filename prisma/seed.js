const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin user
  const adminHashedPassword = await bcrypt.hash('Admin123#', 12);
  
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@plusfive.com' },
    update: {},
    create: {
      email: 'admin@plusfive.com',
      password: adminHashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      phoneNumber: '1234567890',
      businessName: 'PlusFive Admin',
      businessType: 'Administration',
      address: 'Admin Office, PlusFive HQ',
      whatsappNumber: '1234567890',
      directChatMessage: 'Welcome to PlusFive Admin Panel!',
      role: 'admin',
      emailVerified: new Date(),
    },
  });

  console.log('✅ Admin user created:', adminUser.email);

  // Create test user
  const userHashedPassword = await bcrypt.hash('User123#', 12);
  
  const testUser = await prisma.user.upsert({
    where: { email: 'user@plusfive.com' },
    update: {},
    create: {
      email: 'user@plusfive.com',
      password: userHashedPassword,
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '1234567892',
      businessName: 'Test Business',
      businessType: 'Technology',
      address: '123 Test Street, Test City',
      whatsappNumber: '1234567892',
      directChatMessage: 'Hello! How can I help you today?',
      role: 'user',
      emailVerified: new Date(),
    },
  });

  console.log('✅ Test user created:', testUser.email);

  // Create sample orders for admin
  const adminOrders = await Promise.all([
    prisma.order.create({
      data: {
        userId: adminUser.id,
        amount: 199.99,
        currency: 'USD',
        description: 'Enterprise Plan Subscription',
        status: 'completed',
      },
    }),
    prisma.order.create({
      data: {
        userId: adminUser.id,
        amount: 299.99,
        currency: 'USD',
        description: 'Premium Enterprise Plan',
        status: 'completed',
      },
    }),
  ]);

  console.log('✅ Admin orders created:', adminOrders.length);

  // Create sample orders for test user
  const orders = await Promise.all([
    prisma.order.create({
      data: {
        userId: testUser.id,
        amount: 99.99,
        currency: 'USD',
        description: 'Premium Plan Subscription',
        status: 'completed',
      },
    }),
    prisma.order.create({
      data: {
        userId: testUser.id,
        amount: 49.99,
        currency: 'USD',
        description: 'Basic Plan Subscription',
        status: 'pending',
      },
    }),
  ]);

  console.log('✅ Sample orders created:', orders.length);

  // Create sample payments
  const payments = await Promise.all([
    prisma.payment.create({
      data: {
        orderId: orders[0].id,
        userId: testUser.id,
        amount: 99.99,
        currency: 'USD',
        status: 'completed',
        paymentMethod: 'stripe',
        transactionId: 'txn_test_123456',
      },
    }),
    prisma.payment.create({
      data: {
        orderId: adminOrders[0].id,
        userId: adminUser.id,
        amount: 199.99,
        currency: 'USD',
        status: 'completed',
        paymentMethod: 'stripe',
        transactionId: 'txn_admin_123456',
      },
    }),
  ]);

  console.log('✅ Sample payments created:', payments.length);

  // Create sample QR codes
  const qrCodes = await Promise.all([
                   prisma.qRCode.create({
        data: {
          userId: testUser.id,
          name: 'Business Card QR',
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/qr/redirect/PKZcsL`,
          qrData: 'PKZcsL',
          qrCodeImage: await QRCode.toDataURL('PKZcsL', {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          }),
          isActive: true,
          shareCount: 5,
        },
      }),
                   prisma.qRCode.create({
        data: {
          userId: testUser.id,
          name: 'Menu QR',
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/qr/redirect/8eDnMm`,
          qrData: '8eDnMm',
          qrCodeImage: await QRCode.toDataURL('8eDnMm', {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          }),
          isActive: true,
        },
      }),
                   prisma.qRCode.create({
        data: {
          userId: adminUser.id,
          name: 'Admin Dashboard QR',
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/qr/redirect/vsFY1S`,
          qrData: 'vsFY1S',
          qrCodeImage: await QRCode.toDataURL('vsFY1S', {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          }),
          isActive: true,
        },
      }),
          prisma.qRCode.create({
        data: {
          userId: testUser.id,
          name: 'WhatsApp Contact QR',
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/qr/redirect/oy2o9B`,
          qrData: 'oy2o9B',
          qrCodeImage: await QRCode.toDataURL('oy2o9B', {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          }),
          isActive: true,
        },
      }),
      prisma.qRCode.create({
        data: {
          userId: testUser.id,
          name: 'Restaurant Menu QR',
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/qr/redirect/ecBYhU`,
          qrData: 'ecBYhU',
          qrCodeImage: await QRCode.toDataURL('ecBYhU', {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          }),
          isActive: false,
        },
      }),
      prisma.qRCode.create({
        data: {
          userId: testUser.id,
          name: 'Product QR',
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/qr/redirect/MW45gk`,
          qrData: 'MW45gk',
          qrCodeImage: await QRCode.toDataURL('MW45gk', {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          }),
          isActive: true,
        },
      }),
      prisma.qRCode.create({
        data: {
          userId: adminUser.id,
          name: 'Event Ticket QR',
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/qr/redirect/7pvX04`,
          qrData: '7pvX04',
          qrCodeImage: await QRCode.toDataURL('7pvX04', {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          }),
          isActive: true,
        },
      }),
      prisma.qRCode.create({
        data: {
          userId: testUser.id,
          name: 'Location QR',
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/qr/redirect/Pw8AvL`,
          qrData: 'Pw8AvL',
          qrCodeImage: await QRCode.toDataURL('Pw8AvL', {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          }),
          isActive: true,
        },
      }),
      prisma.qRCode.create({
        data: {
          userId: testUser.id,
          name: 'App Download QR',
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/qr/redirect/6ud6x4`,
          qrData: '6ud6x4',
          qrCodeImage: await QRCode.toDataURL('6ud6x4', {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          }),
          isActive: true,
        },
      }),
      prisma.qRCode.create({
        data: {
          userId: adminUser.id,
          name: 'Support QR',
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/qr/redirect/tD2qo0`,
          qrData: 'tD2qo0',
          qrCodeImage: await QRCode.toDataURL('tD2qo0', {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          }),
          isActive: true,
        },
      }),
  ]);

  console.log('✅ Sample QR codes created:', qrCodes.length);

  // Create sample support tickets
  const supportTickets = await Promise.all([
    prisma.supportTicket.create({
      data: {
        userId: testUser.id,
        subject: 'Payment Issue',
        description: 'I am having trouble with my payment processing.',
        priority: 'high',
        category: 'billing',
        status: 'open',
      },
    }),
    prisma.supportTicket.create({
      data: {
        userId: testUser.id,
        subject: 'Feature Request',
        description: 'I would like to request a new feature for QR code customization.',
        priority: 'medium',
        category: 'feature',
        status: 'in_progress',
      },
    }),
    prisma.supportTicket.create({
      data: {
        userId: adminUser.id,
        subject: 'System Maintenance',
        description: 'Scheduled maintenance for database optimization.',
        priority: 'urgent',
        category: 'system',
        status: 'resolved',
      },
    }),
  ]);

  console.log('✅ Sample support tickets created:', supportTickets.length);

  console.log('🎉 Database seeding completed successfully!');
  console.log('\n📋 Login Credentials:');
  console.log('👑 Admin: admin@plusfive.com / Admin123#');
  console.log('👤 User: user@plusfive.com / User123#');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 