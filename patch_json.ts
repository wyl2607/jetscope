import * as fs from 'fs';

function updateJson(file: string, updateCards: boolean, newHeadline: string) {
  let content = fs.readFileSync(file, 'utf-8');
  let data = JSON.parse(content);
  
  if (data.home) {
    if (data.home.thesis && data.home.thesis.headline) {
      data.home.thesis.headline = newHeadline;
    }
    if (updateCards && data.home.entry_cards) {
      data.home.entry_cards = data.home.entry_cards.filter((card: any) => {
        return !['grid', 'heat', 'research'].includes(card.navId);
      });
    }
  }
  
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

updateJson('apps/web/src/locales/zh.json', true, "当碳价与航油价格变化时，SAF 什么时候从合规成本变成经营上理性的选择？");
updateJson('apps/web/src/locales/en.json', true, "When carbon and jet fuel prices change, when does SAF shift from a compliance cost to an operationally rational choice?");
updateJson('apps/web/src/locales/de.json', true, "Wenn sich CO2- und Kerosinpreise ändern, wann wird SAF von reinen Compliance-Kosten zu einer betriebswirtschaftlich rationalen Wahl?");

console.log("JSON patched");
