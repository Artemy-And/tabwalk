import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvCell, toCsv } from './csv.js';

test('plain values are left as they are', () => {
  assert.equal(csvCell('color-contrast'), 'color-contrast');
  assert.equal(csvCell(3), '3');
  assert.equal(csvCell(null), '');
});

test('commas, quotes and line breaks are quoted', () => {
  assert.equal(csvCell('a, b'), '"a, b"');
  assert.equal(csvCell('<a href="#">'), '"<a href=""#"">"');
  assert.equal(csvCell('one\ntwo'), '"one\ntwo"');
});

test('cells that a spreadsheet would run as a formula are neutralized', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-1'), "'-1");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
});

test('the file starts with a BOM and uses CRLF', () => {
  assert.equal(toCsv(['A', 'B'], [['1', '2']]), '﻿A,B\r\n1,2\r\n');
});
