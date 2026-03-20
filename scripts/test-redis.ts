import { createClient } from 'redis';
import * as dotenv from 'dotenv';

dotenv.config();

async function testUpstashRedis() {
  console.log('🔌 Testing Upstash Redis connection...\n');

  const isUpstash = process.env.REDIS_HOST?.includes('upstash.io');
  
  const config: any = {
    socket: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
    password: process.env.REDIS_PASSWORD,
  };

  // Add TLS if Upstash
  if (isUpstash) {
    config.socket.tls = true;
    config.socket.rejectUnauthorized = true;
  }

  console.log('📡 Connection config:');
  console.log(`   Host: ${config.socket.host}`);
  console.log(`   Port: ${config.socket.port}`);
  console.log(`   TLS: ${isUpstash ? 'Yes' : 'No'}`);
  console.log(`   Password: ${config.password ? '***' : 'None'}\n`);

  const client = createClient(config);

  client.on('error', (err) => {
    console.error('❌ Redis Client Error:', err.message);
    process.exit(1);
  });

  try {
    await client.connect();
    console.log('✅ Redis connected successfully!\n');

    // Test SET
    console.log('📝 Testing SET command...');
    await client.set('test:meravien', 'Hello from Meravien!');
    console.log('✅ SET successful\n');

    // Test GET
    console.log('📖 Testing GET command...');
    const value = await client.get('test:meravien');
    console.log(`✅ GET successful: "${value}"\n`);

    // Test TTL (expiry)
    console.log('⏱️  Testing EXPIRE command...');
    await client.set('test:temp', 'temporary', { EX: 10 });
    const ttl = await client.ttl('test:temp');
    console.log(`✅ EXPIRE successful: TTL = ${ttl} seconds\n`);

    // Test DEL
    console.log('🗑️  Testing DEL command...');
    await client.del('test:meravien');
    await client.del('test:temp');
    console.log('✅ DEL successful\n');

    // Test INFO
    console.log('ℹ️  Redis Server Info:');
    const info = await client.info('server');
    const lines = info.split('\n');
    const version = lines.find(l => l.startsWith('redis_version'))?.split(':')[1]?.trim();
    const mode = lines.find(l => l.startsWith('redis_mode'))?.split(':')[1]?.trim();
    console.log(`   Version: ${version}`);
    console.log(`   Mode: ${mode}\n`);

    await client.disconnect();
    console.log('✅ All tests passed! Redis is ready to use.\n');
    console.log('🎉 You can now proceed with Fase 1.1 completion!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('1. Check REDIS_HOST in .env');
    console.error('2. Check REDIS_PORT in .env');
    console.error('3. Check REDIS_PASSWORD in .env');
    console.error('4. Verify Upstash database is active');
    process.exit(1);
  }
}

testUpstashRedis();