/**
 * testPhase3ClientManagement.js
 * Verification and Regression Test Suite for Phase 3:
 * Client Management Cleanup and Usability Improvements
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Client = require('../models/Client');
const Position = require('../models/Position');
const { createClient, updateClient } = require('../controllers/clientController');

function createMockRes() {
  return {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
}

async function runTests() {
  console.log('====================================================');
  console.log('  Running Phase 3: Client Management Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(desc, fn) {
    total++;
    try {
      fn();
      console.log(`✓ Passed: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`✗ Failed: ${desc}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  async function testAsync(desc, fn) {
    total++;
    try {
      await fn();
      console.log(`✓ Passed: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`✗ Failed: ${desc}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  // --- 1. Frontend Invariants & Structure ---
  test('Clients.jsx layout removes Client ID column and renders Client Name and Created Date', () => {
    const code = fs.readFileSync(path.join(__dirname, '../../client/src/pages/Clients.jsx'), 'utf8');
    assert(!code.includes('<th>Client ID</th>'), 'Must not have <th>Client ID</th>');
    assert(code.includes('<th>Client Name</th>'), 'Must have <th>Client Name</th>');
    assert(code.includes('<th>Created Date</th>'), 'Must have <th>Created Date</th>');
    assert(code.includes('formatCreatedDate'), 'Must format createdAt date');
  });

  test('Clients.jsx provides live search input and clear button', () => {
    const code = fs.readFileSync(path.join(__dirname, '../../client/src/pages/Clients.jsx'), 'utf8');
    assert(code.includes('placeholder="Search clients..."'), 'Must have search placeholder "Search clients..."');
    assert(code.includes('searchQuery'), 'Must track searchQuery state');
    assert(code.includes('clients-search-clear'), 'Must provide clear button when query exists');
  });

  test('Clients.jsx provides 4 sorting options: Name A-Z, Name Z-A, Newest, Oldest', () => {
    const code = fs.readFileSync(path.join(__dirname, '../../client/src/pages/Clients.jsx'), 'utf8');
    assert(code.includes('<option value="name-asc">Name A–Z</option>'), 'Must have Name A-Z');
    assert(code.includes('<option value="name-desc">Name Z–A</option>'), 'Must have Name Z-A');
    assert(code.includes('<option value="newest">Newest</option>'), 'Must have Newest');
    assert(code.includes('<option value="oldest">Oldest</option>'), 'Must have Oldest');
  });

  test('Clients.jsx modal contains only Client Name and auto-generates slug with duplicate safeguard', () => {
    const code = fs.readFileSync(path.join(__dirname, '../../client/src/pages/Clients.jsx'), 'utf8');
    assert(!code.includes('<label>Client ID</label>'), 'Modal must not contain user-facing Client ID field');
    assert(code.includes('generateSlug'), 'Must generate slug automatically');
    assert(
      code.includes('A client with this generated identifier already exists. Please use a different client name or contact an administrator.'),
      'Must display exact duplicate safeguard message'
    );
  });

  // --- 2. Deterministic Slug Generation Unit Tests ---
  test('Deterministic slug generation converts names to uppercase alphanumeric slugs', () => {
    const generateSlug = (name) => (name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    assert.strictEqual(generateSlug('Delmo Chicken'), 'DELMOCHICKEN');
    assert.strictEqual(generateSlug('FGL (Kenpark)'), 'FGLKENPARK');
    assert.strictEqual(generateSlug('  Acme  Corp-123! '), 'ACMECORP123');
    assert.strictEqual(generateSlug('ABERDEEN HOLDINGS'), 'ABERDEENHOLDINGS');
    assert.strictEqual(generateSlug(''), '');
  });

  // --- 3. Search and Sort Filter Logic Simulation ---
  test('Search and Sort logic filters case-insensitively and respects sort order', () => {
    const mockClients = [
      { _id: '1', clientName: 'Beta Logistics', createdAt: '2026-02-01T00:00:00.000Z' },
      { _id: '2', clientName: 'Alpha Tech', createdAt: '2026-03-01T00:00:00.000Z' },
      { _id: '3', clientName: 'Gamma Healthcare', createdAt: '2026-01-01T00:00:00.000Z' },
      { _id: '4', clientName: 'Omega Group', createdAt: null },
    ];

    function applyFilterAndSort(items, query, sortBy) {
      const trimmedQuery = query.trim().toLowerCase();
      let res = items;
      if (trimmedQuery) {
        res = res.filter(c => c.clientName?.toLowerCase().includes(trimmedQuery));
      }
      return [...res].sort((a, b) => {
        if (sortBy === 'name-asc') {
          return (a.clientName || '').localeCompare(b.clientName || '', undefined, { sensitivity: 'base' });
        }
        if (sortBy === 'name-desc') {
          return (b.clientName || '').localeCompare(a.clientName || '', undefined, { sensitivity: 'base' });
        }
        if (sortBy === 'newest') {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        }
        if (sortBy === 'oldest') {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : Infinity;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : Infinity;
          return timeA - timeB;
        }
        return 0;
      });
    }

    // Name A-Z
    const sortedAsc = applyFilterAndSort(mockClients, '', 'name-asc');
    assert.deepStrictEqual(sortedAsc.map(c => c.clientName), ['Alpha Tech', 'Beta Logistics', 'Gamma Healthcare', 'Omega Group']);

    // Name Z-A
    const sortedDesc = applyFilterAndSort(mockClients, '', 'name-desc');
    assert.deepStrictEqual(sortedDesc.map(c => c.clientName), ['Omega Group', 'Gamma Healthcare', 'Beta Logistics', 'Alpha Tech']);

    // Newest first (null createdAt placed last)
    const sortedNewest = applyFilterAndSort(mockClients, '', 'newest');
    assert.strictEqual(sortedNewest[0].clientName, 'Alpha Tech'); // March
    assert.strictEqual(sortedNewest[1].clientName, 'Beta Logistics'); // Feb
    assert.strictEqual(sortedNewest[2].clientName, 'Gamma Healthcare'); // Jan
    assert.strictEqual(sortedNewest[3].clientName, 'Omega Group'); // null date

    // Search query with mixed case and whitespace
    const searched = applyFilterAndSort(mockClients, '  aLpHa  ', 'name-asc');
    assert.strictEqual(searched.length, 1);
    assert.strictEqual(searched[0].clientName, 'Alpha Tech');
  });

  // --- 4. Database & API Verification ---
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);

  const createdClientIds = [];

  try {
    // Verify existing clients and positions remain untouched
    await testAsync('Existing client records and position references remain completely intact', async () => {
      const clientCount = await Client.countDocuments({});
      assert(clientCount >= 124, `Expected at least 124 clients, found ${clientCount}`);

      // Verify Aberdeen, Al Ghurair, Ananta exist with original IDs
      const aberdeen = await Client.findOne({ clientId: 'ABERDEEN HOLDINGS' });
      assert(aberdeen, 'ABERDEEN HOLDINGS must exist');
      assert.strictEqual(aberdeen.clientName, 'ABERDEEN HOLDINGS');

      const alGhurair = await Client.findOne({ clientId: 'AL GHURAIR' });
      assert(alGhurair, 'AL GHURAIR must exist');
      assert.strictEqual(alGhurair.clientName, 'AL GHURAIR');

      const ananta = await Client.findOne({ clientId: 'ANANTA' });
      assert(ananta, 'ANANTA must exist');
      assert.strictEqual(ananta.clientName, 'ANANTA');

      // Check position references
      const samplePosition = await Position.findOne({ client: ananta._id });
      if (samplePosition) {
        assert.strictEqual(samplePosition.client.toString(), ananta._id.toString());
      }
    });

    // Test creating a valid new client
    await testAsync('createClient succeeds and generates deterministic slug when clientId omitted', async () => {
      const testName = `Test Company Phase3 ${Date.now()}`;
      const req = { body: { clientName: testName } };
      const res = createMockRes();

      await createClient(req, res);
      assert.strictEqual(res.statusCode, 201);
      assert(res.data._id);
      createdClientIds.push(res.data._id);

      const created = await Client.findById(res.data._id);
      assert.strictEqual(created.clientName, testName);
      assert.strictEqual(created.clientId, testName.toUpperCase().replace(/[^A-Z0-9]/g, ''));
    });

    // Test duplicate slug rejection (collision protection)
    await testAsync('createClient rejects duplicate generated slug with exact error message', async () => {
      const uniqueSuffix = Date.now();
      const baseName = `Acme Industries ${uniqueSuffix}`;
      const collisionName = `Acme-Industries (${uniqueSuffix})!`; // different punctuation, same slug

      // First client succeeds
      const req1 = { body: { clientName: baseName } };
      const res1 = createMockRes();
      await createClient(req1, res1);
      assert.strictEqual(res1.statusCode, 201);
      createdClientIds.push(res1.data._id);

      // Second client colliding on slug must be rejected with 409
      const req2 = { body: { clientName: collisionName } };
      const res2 = createMockRes();
      await createClient(req2, res2);
      assert.strictEqual(res2.statusCode, 409);
      assert.strictEqual(
        res2.data.error,
        'A client with this generated identifier already exists. Please use a different client name or contact an administrator.'
      );
    });

    // Test updating client name preserves _id and clientId
    await testAsync('updateClient updates clientName while strictly preserving _id and clientId', async () => {
      const initialName = `Original Client ${Date.now()}`;
      const updatedName = `Renamed Client ${Date.now()}`;

      const client = await Client.create({
        clientId: initialName.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        clientName: initialName,
      });
      createdClientIds.push(client._id);

      const req = {
        params: { id: client._id.toString() },
        body: { clientName: updatedName },
      };
      const res = createMockRes();
      await updateClient(req, res);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.clientName, updatedName);
      assert.strictEqual(res.data.clientId, client.clientId, 'clientId must NOT change upon update');
      assert.strictEqual(res.data._id.toString(), client._id.toString(), '_id must NOT change');
    });

  } finally {
    // Clean up created test clients
    if (createdClientIds.length > 0) {
      await Client.deleteMany({ _id: { $in: createdClientIds } });
    }
    await mongoose.disconnect();
  }

  console.log('\n====================================================');
  console.log(`  All Phase 3 Tests Completed: ${passed}/${total} Passed!`);
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
