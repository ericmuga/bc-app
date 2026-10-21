import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adIdentity,escapeLdapFilter} from '../server/src/services/adIdentity.js';

test('AD identity trims names and preserves explicit UPN suffixes', () => {
  assert.deepEqual(adIdentity('  jane  ', 'example.test'), {sam:'jane',upn:'jane@example.test'});
  assert.deepEqual(adIdentity('DOMAIN\\jane', 'example.test'), {sam:'jane',upn:'jane@example.test'});
  assert.deepEqual(adIdentity(' jane@alternate.test ', 'example.test'), {sam:'jane',upn:'jane@alternate.test'});
  assert.throws(() => adIdentity('   ', 'example.test'));
  assert.throws(() => adIdentity({}, 'example.test'));
});
test('LDAP profile filters escape special characters', () => {
  assert.equal(escapeLdapFilter('a*(b)\\\0'), 'a\\2a\\28b\\29\\5c\\00');
});
