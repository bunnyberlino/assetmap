T.group('csv');
T.test('comma CSV with header aliases', () => {
  const r = AM.parseCSV('ID,Name,PLZ,Land,Latitude\n1,Anna,4051,CH,47.5\n');
  T.eq(r.header, ['id','name','zip','country','lat']);
  T.eq(r.rows[0].zip, '4051'); T.eq(r.rows[0].country, 'CH'); T.eq(r.rows[0]._line, 2);
});
T.test('semicolon delimiter (Excel DE/CH/IT)', () => {
  const r = AM.parseCSV('id;city;zip\n7;Genève;1201\n');
  T.eq(r.delimiter, ';'); T.eq(r.rows[0].city, 'Genève');
});
T.test('tab delimiter', () => T.eq(AM.parseCSV('id\tcity\n1\tBern').rows[0].city, 'Bern'));
T.test('quoted fields, escaped quotes, embedded delimiter and newline', () => {
  const r = AM.parseCSV('id,name,note\n1,"Rossi, Mario","said ""hi""\nthen left"\n2,x,y');
  T.eq(r.rows[0].name, 'Rossi, Mario'); T.eq(r.rows[0].note, 'said "hi"\nthen left'); T.eq(r.rows.length, 2);
});
T.test('CRLF and blank lines ignored', () => T.eq(AM.parseCSV('id,city\r\n1,A\r\n\r\n2,B\r\n').rows.length, 2));
T.test('zip stays a string with leading zeros', () => T.eq(AM.parseCSV('id,zip\n1,02108').rows[0].zip, '02108'));
T.test('UTF-8 BOM stripped', () => {
  const bytes = new Uint8Array([0xEF,0xBB,0xBF, ...new TextEncoder().encode('id,city\n1,Zürich')]);
  const t = AM.decode(bytes.buffer);
  T.eq(AM.parseCSV(t).header[0], 'id'); T.eq(AM.parseCSV(t).rows[0].city, 'Zürich');
});
T.test('Windows-1252 fallback (Excel on Windows)', () => {
  const bytes = new Uint8Array([0x69,0x64,0x2C,0x63,0x69,0x74,0x79,0x0A,0x31,0x2C,0x5A,0xFC,0x72,0x69,0x63,0x68]); // "id,city\n1,Zürich" in cp1252
  T.eq(AM.parseCSV(AM.decode(bytes)).rows[0].city, 'Zürich');
});
T.test('toCSV quotes when needed and round-trips', () => {
  const csv = AM.toCSV(['a','b'], [['x,y', 'he said "no"'], ['1', '']]);
  const r = AM.parseRows(csv);
  T.eq(r[1], ['x,y', 'he said "no"']); T.eq(r[2], ['1', '']);
});
