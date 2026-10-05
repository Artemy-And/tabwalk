import nodemailer from 'nodemailer';
import type { Channel } from '../db/schema.js';
import { env } from '../env.js';
import { emailMessage, type ScanNews, webRequest } from './message.js';

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

export function emailReady(): boolean {
  return Boolean(env.SMTP_URL);
}

export async function deliver(
  channel: Pick<Channel, 'kind' | 'target'>,
  news: ScanNews,
): Promise<void> {
  if (channel.kind === 'email') {
    if (!env.SMTP_URL) throw new Error('Email is not set up: add SMTP_URL to .env');
    // a fixed greeting name saves a slow lookup of the machine name
    transport ??= nodemailer.createTransport({
      url: env.SMTP_URL,
      name: env.PUBLIC_URL ? new URL(env.PUBLIC_URL).hostname : 'localhost',
    });
    const { subject, text } = emailMessage(news);
    await transport.sendMail({
      from: env.SMTP_FROM ?? 'Tabwalk <tabwalk@localhost>',
      to: channel.target,
      subject,
      text,
    });
    return;
  }

  const { url, init } = webRequest(channel.kind, channel.target, news);
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`The ${channel.kind} endpoint answered ${res.status}`);
}
