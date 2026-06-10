var fs = require('fs');
var p = 'D:/qclaw/skills/html-ppt-to-video/generate_spoken_script.js';
var c = fs.readFileSync(p, 'utf8');

// 移除 minimist 依赖，改为手写参数解析
var old = "const argv = require('minimist')(process.argv.slice(2));";
var neu = "var argv={};for(var i=2;i<process.argv.length;i++){if(process.argv[i]==='--config')argv.config=process.argv[++i];else if(process.argv[i]==='--output')argv.output=process.argv[++i];}";
if (c.includes(old)) {
  c = c.replace(old, neu);
  fs.writeFileSync(p, c, 'utf8');
  console.log('OK: minimist removed');
} else {
  console.log('NOT FOUND: ' + old);
}