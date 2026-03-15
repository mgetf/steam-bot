import { setupErrorHandlers } from '@/utils/error-handler.ts';
import { client, login } from '@/bot.ts';

setupErrorHandlers(() => {
  client.logOff();
});

console.log('[index] Starting Steam bot...');

login();
