console.log('Testing electron module resolution...');
try {
  const electron = require('electron');
  console.log('Type of electron:', typeof electron);
  console.log('Is string:', typeof electron === 'string');
  console.log('Value:', electron);
  console.log('Keys:', Object.keys(electron || {}));
  console.log('Has app:', !!electron.app);
  console.log('Has BrowserWindow:', !!electron.BrowserWindow);
} catch (err) {
  console.error('Error requiring electron:', err.message);
}
setTimeout(() => process.exit(0), 1000);
