// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CopyRoomCodeButton from './CopyRoomCodeButton';

describe('CopyRoomCodeButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('copies the room id to the clipboard when clicked', async () => {
    let clipboardWriteText = vi.fn().mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<CopyRoomCodeButton roomId="AAAAA" />);

    // Immediately replace the clipboard after render
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      writable: true,
      configurable: true,
    });

    await user.click(screen.getByRole('button', { name: 'Kopiuj kod' }));

    expect(clipboardWriteText).toHaveBeenCalledWith('AAAAA');
  });

  it('shows "Skopiowano!" after copying, then reverts after 1500ms', async () => {
    let clipboardWriteText = vi.fn().mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<CopyRoomCodeButton roomId="AAAAA" />);

    // Replace the clipboard after render
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      writable: true,
      configurable: true,
    });

    await user.click(screen.getByRole('button', { name: 'Kopiuj kod' }));

    // Wait for the "Skopiowano!" text to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Skopiowano!' })).toBeInTheDocument();
    });

    // Wait 1500ms for the text to revert
    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'Kopiuj kod' })).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });
});
