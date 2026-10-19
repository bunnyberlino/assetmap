T.group('settings & types');
T.test('settings.csv parsed with defaults and unknown-key warning', () => {
  const {settings, warnings} = AM.parseSettings('key,value\nmap_title,My Map\ncompany_name,ACME\nfoo,bar\n');
  T.eq(settings.map_title, 'My Map'); T.eq(settings.company_name, 'ACME');
  T.eq(settings.default_rings_km, '5;25;100'); T.eq(warnings.length, 1);
});
T.test('settings.csv with semicolons and no header', () => {
  T.eq(AM.parseSettings('map_title;Karte\n').settings.map_title, 'Karte');
});
T.test('types.csv: shapes, colours, categories, warnings', () => {
  const {types, warnings} = AM.parseTypes('category,type,label,marker,color\nhuman,Employee,Employee,circle,#5D9CEC\nPhysical,office,Office,SQUARE,red\nasset,depot,Depot,blob,nope\n');
  T.eq(types.length, 3);
  T.eq(types[0].type, 'employee'); T.eq(types[1].marker, 'square'); T.eq(types[1].color, '#E11D2E');
  T.eq(types[2].category, 'physical'); T.eq(types[2].marker, 'circle'); T.eq(types[2].color, '#8794A5');
  T.eq(warnings.length, 2);
});
T.test('typeIndex matches category first, then any', () => {
  const ix = AM.typeIndex([{category:'human', type:'vip', label:'H'}, {category:'physical', type:'vip', label:'P'}, {category:'', type:'misc', label:'M'}]);
  T.eq(ix('physical','VIP').label, 'P'); T.eq(ix('human','vip').label, 'H'); T.eq(ix('human','misc').label, 'M'); T.eq(ix('human','none'), null);
});
T.test('markerSVG renders every shape with colour and halo', () => {
  AM.MARKERS.forEach(m => { const s = AM.markerSVG(m, '#123456', 20, '#FF0000'); T.ok(s.startsWith('<svg') && s.includes('#123456') && s.includes('#FF0000'), m); });
});
T.test('settingsToCSV round-trips', () => {
  const s = Object.assign({}, AM.DEFAULT_SETTINGS, {map_title:'A, "B"'});
  T.eq(AM.parseSettings(AM.settingsToCSV(s)).settings.map_title, 'A, "B"');
});
