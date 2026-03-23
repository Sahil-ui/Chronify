const path = require('path');
const { execSync } = require('child_process');

// Build Next.js frontend
console.log('📦 Building frontend...');
try {
  execSync('cd frontend && npm run build', { stdio: 'inherit' });
  console.log('✅ Frontend build complete');
} catch (err) {
  console.error('❌ Frontend build failed:', err.message);
  process.exit(1);
}

// Start the backend server
console.log('🚀 Starting backend server...');
require('./backend/server.js');
