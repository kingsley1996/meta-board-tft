// Chạy DDL của chùa. Nội dung nằm ở schema.sql cùng thư mục — một nguồn duy nhất,
// không có bản sao trong TypeScript để mà lệch.
//
// ensureAccountTables đi trước vì bảng chùa khoá ngoại vào users(id): một database
// chưa từng có users thì câu ALTER đầu tiên sẽ chết, và lỗi đó phải là "tạo users
// trước", không phải "thiếu bảng chùa".
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureAccountTables } from '../accounts.ts';
import { pool } from '../db.ts';

let tablesReady: Promise<void> | undefined;

export function ensureTempleTables(): Promise<void> {
  // Một lần DDL fail (DB chập chờn đúng lúc khởi động) không được khóa cả chùa: promise
  // reject mà được giữ lại thì mọi request sau đó chết theo, tới khi restart process.
  tablesReady ??= (async () => {
    await ensureAccountTables();
    await pool.query(await readFile(join(import.meta.dirname, 'schema.sql'), 'utf8'));
  })().catch((error: unknown) => {
    tablesReady = undefined;
    throw error;
  });
  return tablesReady;
}
