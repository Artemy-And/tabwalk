import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { dismissals, issues } from './schema.js';

// keeps a query on issues to the findings nobody dismissed on the site
export function notDismissed(siteId: SQLWrapper | string): SQL {
  return sql`not exists (select 1 from ${dismissals} where ${dismissals.siteId} = ${siteId} and ${dismissals.fingerprint} = ${issues.fingerprint})`;
}
