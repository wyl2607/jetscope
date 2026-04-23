import { readFileSync } from 'fs';

const appJs = readFileSync('public/app.js', 'utf-8');

const functions = [
  'renderRealtimeCostMatrix',
  'updateRealtimeDisplays'
];

let allFound = true;
functions.forEach(fn => {
  if (appJs.includes(`function ${fn}`)) {
    console.log(`✓ Found: ${fn}`);
  } else {
    console.log(`✗ Missing: ${fn}`);
    allFound = false;
  }
});

if (allFound) {
  console.log('\n✅ Realtime functions present!');
} else {
  console.log('\n❌ Missing functions');
}
