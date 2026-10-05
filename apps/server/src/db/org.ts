import { db } from './index.js';
import { organizations } from './schema.js';

export async function defaultOrgId(): Promise<string> {
  const existing = await db.query.organizations.findFirst();
  if (existing) return existing.id;

  const [created] = await db.insert(organizations).values({ name: 'My organization' }).returning();

  if (!created) throw new Error('Could not create the default organization');
  return created.id;
}
