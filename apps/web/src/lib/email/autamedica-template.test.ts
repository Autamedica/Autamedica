import { describe, it, expect } from 'vitest';
import { buildStreamingAnnouncementEmail } from './autamedica-template';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Email Templates', () => {
  it('should render buildStreamingAnnouncementEmail correctly', () => {
    const recipientName = 'Eduardo Marques';
    const actionUrl = 'https://www.autamedica.com/streams';
    const email = buildStreamingAnnouncementEmail(recipientName, actionUrl);

    expect(email.subject).toContain('Stream en Vivo');
    expect(email.html).toContain('Twitch');
    expect(email.html).toContain('YouTube');
    expect(email.html).toContain(recipientName);
    expect(email.html).toContain(actionUrl);
    expect(email.html).toContain('stream-preview-twitch.png');
    expect(email.html).toContain('stream-preview-youtube.png');

    // Write to a temporary file in artifacts directory for manual visual check
    const artifactDir = '/home/edu/.gemini/antigravity-cli/brain/22aa53bc-5e0c-4ef3-99c9-d40f7ad2481c';
    try {
      mkdirSync(artifactDir, { recursive: true });
      writeFileSync(join(artifactDir, 'email_preview.html'), email.html);
      console.log('✓ email_preview.html generated in artifact directory');
    } catch (e) {
      console.error('Failed to write artifact:', e);
    }
  });
});
