import { findChannelAccessibleToUser } from '../messages/messages.service.js';

export async function assertJoinableVoiceChannel(channelId: number, userId: number) {
  const ch = await findChannelAccessibleToUser(channelId, userId);
  if (!ch) {
    return { ok: false as const, code: 'VOICE_CHANNEL_NOT_FOUND' };
  }
  if (ch.channelType !== 'VOICE') {
    return { ok: false as const, code: 'INVALID_CHANNEL_TYPE' };
  }
  return { ok: true as const };
}
