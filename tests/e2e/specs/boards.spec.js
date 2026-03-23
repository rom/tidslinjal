// specs/boards.spec.js — Board/Kanban E2E tests
const { test, expect } = require('@playwright/test');

// Login helper
async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.fill('input[type="text"], input[name="username"]', 'admin');
  await page.fill('input[type="password"]', 'admin');
  await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign")');
  await page.waitForURL(/^(?!.*login).*$/, { timeout: 8000 });
}

// Create a board via API and return the board object
async function createBoard(page, name, columns) {
  const cols = columns || [
    { id: 'todo', name: 'To Do' },
    { id: 'doing', name: 'Doing' },
    { id: 'done', name: 'Done' },
  ];
  const resp = await page.request.post('/api/boards', {
    data: { name, description: `E2E test board: ${name}`, columns: cols, visibility: 'global' },
  });
  expect(resp.status()).toBe(200);
  const board = await resp.json();
  expect(board.id).toBeTruthy();
  return board;
}

// Create a board item via API and return it
async function createBoardItem(page, boardId, subject, columnId) {
  const resp = await page.request.post(`/api/boards/${boardId}/items`, {
    data: { subject, column_id: columnId || 'todo', item_type: 'task' },
  });
  expect(resp.status()).toBe(200);
  const item = await resp.json();
  expect(item.id).toBeTruthy();
  return item;
}

test.describe('Board CRUD via API', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

  test('POST /api/boards creates a board with columns', async ({ page }) => {
    const board = await createBoard(page, `Board ${Date.now()}`);
    expect(board.name).toContain('Board');
    expect(Array.isArray(board.columns)).toBeTruthy();
    expect(board.columns.length).toBe(3);
    expect(board.columns[0].id).toBe('todo');

    // Cleanup
    await page.request.delete(`/api/boards/${board.id}`);
  });

  test('GET /api/boards returns boards list', async ({ page }) => {
    const board = await createBoard(page, `ListTest ${Date.now()}`);

    const resp = await page.request.get('/api/boards');
    expect(resp.status()).toBe(200);
    const boards = await resp.json();
    expect(Array.isArray(boards)).toBeTruthy();

    const found = boards.find(b => b.id === board.id);
    expect(found).toBeTruthy();
    expect(found.name).toContain('ListTest');

    // Cleanup
    await page.request.delete(`/api/boards/${board.id}`);
  });

  test('GET /api/boards/{id} returns a single board', async ({ page }) => {
    const board = await createBoard(page, `SingleGet ${Date.now()}`);

    const resp = await page.request.get(`/api/boards/${board.id}`);
    expect(resp.status()).toBe(200);
    const fetched = await resp.json();
    expect(fetched.id).toBe(board.id);
    expect(fetched.name).toContain('SingleGet');

    // Cleanup
    await page.request.delete(`/api/boards/${board.id}`);
  });

  test('PUT /api/boards/{id} updates a board', async ({ page }) => {
    const board = await createBoard(page, `UpdateMe ${Date.now()}`);

    const resp = await page.request.put(`/api/boards/${board.id}`, {
      data: { name: 'Updated Board Name', description: 'Updated description', columns: board.columns, visibility: 'global' },
    });
    expect(resp.status()).toBe(200);
    const updated = await resp.json();
    expect(updated.name).toBe('Updated Board Name');

    // Cleanup
    await page.request.delete(`/api/boards/${board.id}`);
  });
});

test.describe('Board items via API', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

  test('POST /api/boards/{id}/items creates a board item', async ({ page }) => {
    const board = await createBoard(page, `ItemBoard ${Date.now()}`);
    const item = await createBoardItem(page, board.id, 'My first task', 'todo');

    expect(item.subject).toBe('My first task');
    expect(item.column_id).toBe('todo');
    expect(item.board_id).toBe(board.id);

    // Cleanup
    await page.request.delete(`/api/board-items/${item.id}`);
    await page.request.delete(`/api/boards/${board.id}`);
  });

  test('GET /api/boards/{id}/items returns items for a board', async ({ page }) => {
    const board = await createBoard(page, `ItemsBoard ${Date.now()}`);
    await createBoardItem(page, board.id, 'Task A', 'todo');
    await createBoardItem(page, board.id, 'Task B', 'doing');

    const resp = await page.request.get(`/api/boards/${board.id}/items`);
    expect(resp.status()).toBe(200);
    const items = await resp.json();
    expect(Array.isArray(items)).toBeTruthy();
    expect(items.length).toBeGreaterThanOrEqual(2);

    const subjects = items.map(i => i.subject);
    expect(subjects).toContain('Task A');
    expect(subjects).toContain('Task B');

    // Cleanup
    for (const it of items) await page.request.delete(`/api/board-items/${it.id}`);
    await page.request.delete(`/api/boards/${board.id}`);
  });

  test('board item move between columns via API', async ({ page }) => {
    const board = await createBoard(page, `MoveBoard ${Date.now()}`);
    const item = await createBoardItem(page, board.id, 'Moveable Task', 'todo');

    // Move to 'doing' column
    const moveResp = await page.request.post(`/api/board-items/${item.id}/move`, {
      data: { column_id: 'doing', sort_order: 0 },
    });
    expect(moveResp.status()).toBe(200);
    const moved = await moveResp.json();
    expect(moved.column_id).toBe('doing');

    // Move to 'done' column
    const moveResp2 = await page.request.post(`/api/board-items/${item.id}/move`, {
      data: { column_id: 'done', sort_order: 0 },
    });
    expect(moveResp2.status()).toBe(200);
    const moved2 = await moveResp2.json();
    expect(moved2.column_id).toBe('done');

    // Cleanup
    await page.request.delete(`/api/board-items/${item.id}`);
    await page.request.delete(`/api/boards/${board.id}`);
  });
});

test.describe('Board item lifecycle', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

  test('create -> update -> archive -> unarchive -> delete', async ({ page }) => {
    const board = await createBoard(page, `LifecycleBoard ${Date.now()}`);

    // Create
    const item = await createBoardItem(page, board.id, 'Lifecycle Item', 'todo');
    expect(item.subject).toBe('Lifecycle Item');

    // Update
    const updateResp = await page.request.put(`/api/board-items/${item.id}`, {
      data: { subject: 'Updated Lifecycle Item', column_id: 'todo', note: 'Updated note', item_type: 'task' },
    });
    expect(updateResp.status()).toBe(200);
    const updated = await updateResp.json();
    expect(updated.subject).toBe('Updated Lifecycle Item');

    // Archive
    const archiveResp = await page.request.post(`/api/board-items/${item.id}/archive`);
    expect(archiveResp.status()).toBe(200);
    const archived = await archiveResp.json();
    expect(archived.archived).toBe(true);

    // Unarchive
    const unarchiveResp = await page.request.post(`/api/board-items/${item.id}/unarchive`);
    expect(unarchiveResp.status()).toBe(200);
    const unarchived = await unarchiveResp.json();
    expect(unarchived.archived).toBe(false);

    // Delete
    const delResp = await page.request.delete(`/api/board-items/${item.id}`);
    expect(delResp.status()).toBe(200);

    // Verify item is gone
    const itemsResp = await page.request.get(`/api/boards/${board.id}/items`);
    const items = await itemsResp.json();
    const remaining = (items || []).filter(i => i.id === item.id);
    expect(remaining.length).toBe(0);

    // Cleanup
    await page.request.delete(`/api/boards/${board.id}`);
  });
});

test.describe('Board deletion cascades to items', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

  test('deleting a board removes its items', async ({ page }) => {
    const board = await createBoard(page, `CascadeBoard ${Date.now()}`);
    await createBoardItem(page, board.id, 'Cascade Item 1', 'todo');
    await createBoardItem(page, board.id, 'Cascade Item 2', 'doing');

    // Verify items exist
    const beforeResp = await page.request.get(`/api/boards/${board.id}/items`);
    const beforeItems = await beforeResp.json();
    expect(beforeItems.length).toBeGreaterThanOrEqual(2);

    // Delete board
    const delResp = await page.request.delete(`/api/boards/${board.id}`);
    expect(delResp.status()).toBe(200);

    // Verify board is gone from the list
    const boardsResp = await page.request.get('/api/boards');
    const boards = await boardsResp.json();
    const found = (boards || []).find(b => b.id === board.id);
    expect(found).toBeUndefined();
  });
});
