// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConnectionBanner from './ConnectionBanner';

describe('ConnectionBanner', () => {
  it('renders the disconnected message when visible', () => {
    render(<ConnectionBanner visible={true} />);
    expect(
      screen.getByText('Utracono połączenie — próbuję ponownie…')
    ).toBeInTheDocument();
  });

  it('renders nothing when not visible', () => {
    const { container } = render(<ConnectionBanner visible={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
