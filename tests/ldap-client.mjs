import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { createManagedLdapClient } from '../server/src/services/ldapClient.js';

test('connection refusal rejects bind without an unhandled client error', {timeout:5000}, async () => {
  const server = net.createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const client = createManagedLdapClient({url:`ldap://127.0.0.1:${port}`,reconnect:false,connectTimeout:100,timeout:100});
  try {
    await assert.rejects(new Promise((resolve,reject) => client.bind('test','test',err => err ? reject(err) : resolve())));
    await new Promise(resolve => setTimeout(resolve,100));
    assert.equal(client.destroyed,true);
  } finally { client.destroy(); }
});

test('connect-timeout and late errors are handled and clean up the client', () => {
  const client = createManagedLdapClient({url:'ldap://127.0.0.1:1',reconnect:false,connectTimeout:100,timeout:100});
  const error = new Error('connectTimeout: connection timeout');
  assert.doesNotThrow(() => client.emit('error',error));
  assert.equal(client.destroyed,true);
  assert.doesNotThrow(() => client.emit('error',error));
});
