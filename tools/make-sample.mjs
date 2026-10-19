#!/usr/bin/env node
/* Generates the synthetic sample data in data/ (no real people or sites).
   Deterministic, so re-running gives the same files.  node tools/make-sample.mjs */
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];

/* [city, zip, country (as people type it), region, weight] */
const PLACES = [
  ['Basel','4051','Switzerland','BS',30], ['Zürich','8001','CH','ZH',22], ['Genève','1201','Schweiz','',8],
  ['Bern','3011','Switzerland','',6], ['Zug','6300','CH','',6], ['Lausanne','1003','Suisse','',5],
  ['München','80331','Germany','Bayern',16], ['Berlin','10115','Deutschland','',10], ['Frankfurt am Main','60311','DE','',8],
  ['Lörrach','79539','Germany','',9], ['Hamburg','20095','DEU','',5],
  ['Milano','20121','Italy','Lombardia',14], ['Roma','184','Italia','Lazio',7], ['Torino','10121','IT','',4],
  ['Paris','75001','France','',9], ['Lyon','69001','FR','',4],
  ['London','SW1A 1AA','United Kingdom','',12], ['Manchester','M1 1AE','UK','',4],
  ['Amsterdam','1012 AB','Netherlands','',6], ['Madrid','28001','Spain','',5], ['Barcelona','8001','España','',4],
  ['Wien','1010','Austria','',4], ['Warszawa','00-001','Poland','',3], ['Stockholm','111 20','Sweden','',3],
  ['Dubai','','United Arab Emirates','',4], ['Johannesburg','2001','South Africa','',3], ['Tel Aviv','','Israel','',2],
  ['San Mateo','94401','United States','CA',20], ['New York','10001','USA','NY',14], ['Boston','2108','US','MA',8],
  ['Morristown','7960','United States','NJ',10], ['Chicago','60601','US','IL',5], ['Raleigh','27601','US','NC',6],
  ['Toronto','M5H 2N2','Canada','ON',6], ['Ciudad de México','06600','Mexico','',4], ['São Paulo','01310-100','Brazil','',5],
  ['Buenos Aires','C1002','Argentina','',3],
  ['Tokyo','100-0001','Japan','',6], ['Singapore','018956','Singapore','',5], ['Sydney','2000','Australia','NSW',5],
  ['Bengaluru','560001','India','',6], ['Seoul','','Korea, Republic of','',3], ['Shanghai','','China','',4]
];
const FIRST = ['Anna','Luca','Mia','Noah','Lea','Elias','Sofia','Leon','Emma','Marco','Giulia','Jonas','Sara','David','Laura','Tom','Nina','Paul','Chiara','Ben','Yuki','Priya','Diego','Fatima','Olivia','Liam'];
const LAST  = ['Muster','Rossi','Meier','Schmid','Bianchi','Keller','Weber','Dubois','Smith','Garcia','Tanaka','Kumar','Silva','Nguyen','Brown','Moreau','Huber','Fischer','Ricci','Novak'];
const TAGS = ['', '', '', '', 'VIP', 'Travel', 'Remote', 'Exec', 'First aid'];

const emp = [['id','name','email','tag','type','city','zip','country','region']];
/* the example from the project brief */
emp.push(['3','John','john@example.com','VIP','employee','Milano','20121','Italy','Lombardia']);
const pool = PLACES.flatMap(p => Array(p[4]).fill(p));
for(let i = 4; i <= 330; i++){
  const p = pick(pool);
  const named = rnd() < 0.6;
  const fn = pick(FIRST), ln = pick(LAST);
  const type = rnd() < 0.12 ? 'resident' : 'employee';
  emp.push([String(i), named ? `${fn} ${ln}` : '', named && rnd() < .7 ? `${fn}.${ln}@example.com`.toLowerCase() : '',
    pick(TAGS), type, p[0], rnd() < 0.85 ? p[1] : '', p[2], p[3]]);
}
/* edge cases the import report should show */
emp.push(['331','Coord Override','','','employee','Somewhere','','Switzerland','','47.5596','7.5886']);
emp.push(['332','','','','employee','Atlantis','99999','Atlantis','']);
emp.push(['333','','','','contractor','Basel','4051','CH','']);
emp.push(['334','','','','employee','','','Norway','']);
emp[0].push('lat','lon');

const assets = [['id','name','email','tag','type','city','zip','country','region','lat','lon']];
[
  ['56','Italy office','italy@example.com','offices','office','Milano','20121','Italy','Lombardia'],
  ['10','Basel HQ','','offices','office','Basel','4051','Switzerland','BS'],
  ['11','Munich office','','offices','office','München','80331','Germany',''],
  ['12','London office','','offices','office','London','EC2V 7HH','United Kingdom',''],
  ['13','Paris office','','offices','office','Paris','75008','France',''],
  ['14','San Mateo office','','offices','office','San Mateo','94403','United States','CA'],
  ['15','New Jersey office','','offices','office','Morristown','07960','United States','NJ'],
  ['16','Singapore office','','offices','office','Singapore','018956','Singapore',''],
  ['17','Tokyo office','','offices','office','Tokyo','100-0005','Japan',''],
  ['20','Logistics partner','ops@partner.example','partners','partner','Lörrach','79539','Germany',''],
  ['21','Research partner','','partners','partner','Boston','02115','United States','MA'],
  ['22','Distribution partner','','partners','partner','Madrid','28020','Spain',''],
  ['30','Warehouse North','','sites','site','Hamburg','20457','Germany',''],
  ['31','Plant Ticino','','sites','site','Mendrisio','6850','Switzerland','TI'],
  ['32','Data centre','','sites','site','Frankfurt am Main','60314','Germany','','50.1109','8.7270'],
  ['33','Lab São Paulo','','sites','site','São Paulo','04547-004','Brazil','']
].forEach(r => assets.push(r));

const types = [['category','type','label','marker','color'],
  ['human','employee','Employee','circle','#5D9CEC'],
  ['human','resident','Resident','circle','#3FB6A0'],
  ['physical','office','Office','square','#E11D2E'],
  ['physical','partner','Partner','diamond','#B57EDC'],
  ['physical','site','Site','triangle','#F2A93B']];

const settings = [['key','value'],
  ['map_title','Asset Map — Sample'], ['company_name','Example Corp'], ['classification_label','Internal — Sample data'],
  ['default_rings_km','5;25;100'], ['postal_countries',''], ['default_basemap','offline'], ['theme','dark']];

const incident = [['record','name','lat','lon','rings_km','note','visible','created'],
  ['incident','Sample — wildfires near Basel','','','5;15;40','Fire','','2026-10-19T08:00:00Z'],
  ['marker','Fire 1','47.5210','7.6170','','first report','yes',''],
  ['marker','Fire 2','47.4870','7.7320','','','yes',''],
  ['marker','Fire 3','47.6060','7.6610','2;10','spot fire','yes','']];

const cell = v => /[",\n;]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
const write = (n, rows) => fs.writeFileSync(path.join(root, 'data', n), rows.map(r => r.map(x => cell(String(x ?? ''))).join(',')).join('\r\n') + '\r\n');
write('employees.csv', emp); write('assets.csv', assets); write('types.csv', types);
write('settings.csv', settings); write('incident-sample.csv', incident);
console.log(`employees ${emp.length-1}, assets ${assets.length-1}`);
