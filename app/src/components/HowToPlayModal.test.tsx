// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HowToPlayModal from './HowToPlayModal';

describe('HowToPlayModal', () => {
  it('renders as a labeled dialog', () => {
    render(<HowToPlayModal onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: 'Jak grać?' })).toBeInTheDocument();
  });

  it('calls onClose when "Zamknij" is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HowToPlayModal onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Zamknij' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<HowToPlayModal onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when clicking the overlay background', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<HowToPlayModal onClose={onClose} />);

    const overlay = container.querySelector('.how-to-play-overlay');
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);

    expect(onClose).not.toHaveBeenCalled();
  });
});
