import 'dotenv/config';


import ldap from 'ldapjs';

const client = ldap.createClient({
  url: process.env.AD_URL,
  connectTimeout: 5000,
});

// Step 1: bind as service account
client.bind(process.env.AD_SERVICE_DN, process.env.AD_SERVICE_PASS, (err) => {
  if (err) { console.error('❌ Bind failed:', err.message); process.exit(1); }
  console.log('✅ Service bind OK');

  // Step 2: search for a known user — replace jsmith with a real username
  const testUser = process.argv[1] || 'emuga';   // pass username as argument
  
  client.search(process.env.AD_BASE_DN, {
    scope:      'sub',
    filter:     `(sAMAccountName=${testUser})`,
    attributes: ['dn', 'displayName', 'mail', 'sAMAccountName', 'memberOf'],
    sizeLimit:  5,
  }, (err, res) => {
    if (err) { console.error('❌ Search error:', err.message, err.code); client.destroy(); return; }

    let found = 0;
    res.on('searchEntry', (entry) => {
      found++;
      console.log('\n✅ Found entry:');
      console.log('   DN         :', entry.pojo.objectName);
      entry.pojo.attributes.forEach(a => {
        console.log(`   ${a.type.padEnd(15)}: ${a.values.join(' | ')}`);
      });
    });
    res.on('searchReference', (ref) => {
      console.log('⚠️  Referral (ignored):', ref.uris);
    });
    res.on('error', (e) => {
      console.error('❌ Search result error:', e.message, '| code:', e.code);
      client.destroy();
    });
    res.on('end', (result) => {
      console.log(`\nSearch ended. Status: ${result.status}. Entries found: ${found}`);
      if (found === 0) {
        console.log('\n⚠️  No entries — try these checks:');
        console.log('   1. Is AD_BASE_DN correct?   Current:', process.env.AD_BASE_DN);
        console.log('   2. Does the user exist in AD under that base?');
        console.log('   3. Try a broader base DN — e.g. just DC=farmerschoice,DC=co,DC=ke');
      }
      client.destroy();
    });
  });
});
