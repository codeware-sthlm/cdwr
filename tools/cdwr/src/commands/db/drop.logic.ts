export interface ClusterDatabase {
  name: string;
  owner: string;
  encoding: string;
  size: string;
}

const SYSTEM_DATABASES = new Set(['postgres', 'template0', 'template1']);

/** Parse `psql -t -A -F,` output into databases, dropping Postgres system ones */
export function parseDatabaseList(output: string): ClusterDatabase[] {
  return output
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [name, owner, encoding, size] = line.split(',') as [
        string,
        string,
        string,
        string
      ];
      return { name, owner, encoding, size };
    })
    .filter((db) => !SYSTEM_DATABASES.has(db.name));
}

/** A `DROP DATABASE` statement for one name, quoted for psql */
export const dropStatement = (name: string): string =>
  `DROP DATABASE IF EXISTS "${name.replace(/"/g, '""')}" WITH (FORCE);`;
