import { env } from '@/env.ts';

const Color = {
  success: 0x57f287,
  warning: 0xfee75c,
  error: 0xed4245
} as const;

type Severity = keyof typeof Color;

export function notify(title: string, description: string, severity: Severity): void {
  const url = env.DISCORD_STATUS_WEBHOOK_URL;
  if (!url) return;

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [
        {
          title,
          description,
          color: Color[severity],
          timestamp: new Date().toISOString()
        }
      ]
    })
  }).catch(() => {
    console.error('[discord] Failed to send status notification');
  });
}
