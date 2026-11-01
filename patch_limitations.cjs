const fs = require('fs');

function addLimitation(file, message) {
  let content = fs.readFileSync(file, 'utf-8');
  let data = JSON.parse(content);
  
  if (data.home && data.home.limitations) {
    data.home.limitations.push(message);
  }
  
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

addLimitation('apps/web/src/locales/zh.json', "价格数据带来源与状态标签，缺失的数据会明确标出。");
addLimitation('apps/web/src/locales/en.json', "Price data carries source and status tags; missing data is explicitly marked.");
addLimitation('apps/web/src/locales/de.json', "Preisdaten sind mit Quellen- und Statusangaben versehen; fehlende Daten werden ausdrücklich gekennzeichnet.");

console.log("Limitations patched");
