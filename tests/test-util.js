T.group('util');
T.test('fold strips accents, case and punctuation', () => {
  T.eq(AM.fold('  Zürich '), 'zurich');
  T.eq(AM.fold('São Paulo'), 'sao paulo');
  T.eq(AM.fold('Frankfurt-am-Main'), 'frankfurt am main');
  T.eq(AM.fold('Straße'), 'strasse');
});
T.test('haversine Basel–Zürich ≈ 74 km', () => T.near(AM.haversine(47.5596, 7.5886, 47.3769, 8.5417), 74.4, 1.5));
T.test('haversine zero distance', () => T.eq(AM.haversine(10, 10, 10, 10), 0));
T.test('parseCoords formats', () => {
  T.eq(AM.parseCoords('47.1202, 8.5808'), [47.1202, 8.5808]);
  T.eq(AM.parseCoords('47.1202 8.5808'), [47.1202, 8.5808]);
  T.eq(AM.parseCoords('33.86S 151.2E'), [-33.86, 151.2]);
  T.eq(AM.parseCoords('47,1202; 8,5808'), [47.1202, 8.5808]);
  T.eq(AM.parseCoords('40.7128, -74.0060 New York'), [40.7128, -74.006]);
  T.eq(AM.parseCoords('91, 10'), null);
  T.eq(AM.parseCoords('hello'), null);
});
T.test('parseRings sorts, dedups and drops junk', () => {
  T.eq(AM.parseRings('100; 5, 25'), [5, 25, 100]);
  T.eq(AM.parseRings('2,5;10'), [2, 5, 10]);
  T.eq(AM.parseRings('x;0;-3;7'), [7]);
  T.eq(AM.parseRings(''), []);
  T.eq(AM.parseRings([3, 3, 1]), [1, 3]);
});
T.test('esc escapes HTML', () => T.eq(AM.esc('<a href="x">&\''), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;'));
