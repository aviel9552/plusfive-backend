const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin user
  const adminHashedPassword = await bcrypt.hash('Admin123#', 12);
  
  // Check if admin user already exists
  let adminUser = await prisma.user.findFirst({
    where: { 
      email: 'admin@plusfive.com',
      isDeleted: false
    }
  });
  
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: 'admin@plusfive.com',
        password: adminHashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        phoneNumber: '+972523042776',
        businessName: 'PlusFive Admin',
        businessType: 'Administration',
        address: 'Admin Office, PlusFive HQ',
        whatsappNumber: '+972523042776',
        directChatMessage: 'Welcome to PlusFive Admin Panel!',
        role: 'admin',
        emailVerified: new Date(),
        referralCode: (() => {
          const currentYear = new Date().getFullYear();
          const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          let randomCode = '';
          for (let i = 0; i < 6; i++) {
            randomCode += characters.charAt(Math.floor(Math.random() * characters.length));
          }
          return `PLUSFIVE${currentYear}${randomCode}`;
        })(),
      },
    });
  }

  console.log('✅ Admin user created:', adminUser.email);

  // Create test user
  const userHashedPassword = await bcrypt.hash('User123#', 12);
  
  // Check if test user already exists
  let testUser = await prisma.user.findFirst({
    where: { 
      email: 'user@plusfive.com',
      isDeleted: false
    }
  });
  
  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        email: 'user@plusfive.com',
        password: userHashedPassword,
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+972523042777',
        businessName: 'Jamili Barbershop RMG',
        businessType: 'Technology',
        address: '123 Test Street, Test City',
        whatsappNumber: '+972523042777',
        directChatMessage: 'Hello! How can I help you today?',
        role: 'user',
        emailVerified: new Date(),
        referralCode: (() => {
          const currentYear = new Date().getFullYear();
          const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          let randomCode = '';
          for (let i = 0; i < 6; i++) {
            randomCode += characters.charAt(Math.floor(Math.random() * characters.length));
          }
          return `PLUSFIVE${currentYear}${randomCode}`;
        })(),
      },
    });
  }

  console.log('✅ Test user created:', testUser.email);

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