declare module "better-sqlite3" {
  type BindParameter = string | number | bigint | Buffer | null;
  type BindParameters = BindParameter[];

  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Statement {
    run(...params: BindParameters): RunResult;
    get(...params: BindParameters): unknown;
    all(...params: BindParameters): unknown[];
  }

  interface Database {
    prepare(sql: string): Statement;
    pragma(statement: string): unknown;
    exec(sql: string): this;
  }

  class Database {
    constructor(filename: string);
    prepare(sql: string): Statement;
    pragma(statement: string): unknown;
    exec(sql: string): this;
  }

  export = Database;
}
