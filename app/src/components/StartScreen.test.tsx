// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StartScreen from './StartScreen';

describe('StartScreen', () => {
  it('renders 2 name inputs by default', () => {
    render(<StartScreen onStart={() => {}} />);
    expect(screen.getByLabelText('Gracz 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Gracz 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Gracz 3')).not.toBeInTheDocument();
  });

  it('adds more name inputs when player count increases, preserving existing names', async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={() => {}} />);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), 'Ola');
    await user.selectOptions(screen.getByLabelText('Liczba graczy'), '4');

    expect(screen.getByLabelText('Gracz 1')).toHaveValue('Ola');
    expect(screen.getByLabelText('Gracz 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Gracz 4')).toBeInTheDocument();
  });

  it('disables the start button when a name is blank', async () => {
    const user = userEvent.setup();
    render(<StartScreen onStart={() => {}} />);

    await user.clear(screen.getByLabelText('Gracz 1'));

    expect(
      screen.getByRole('button', { name: 'Rozpocznij grę' })
    ).toBeDisabled();
  });

  it('calls onStart with trimmed player names when clicked', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);

    await user.clear(screen.getByLabelText('Gracz 1'));
    await user.type(screen.getByLabelText('Gracz 1'), '  Ola  ');
    await user.clear(screen.getByLabelText('Gracz 2'));
    await user.type(screen.getByLabelText('Gracz 2'), 'Kuba');

    await user.click(screen.getByRole('button', { name: 'Rozpocznij grę' }));

    expect(onStart).toHaveBeenCalledWith(['Ola', 'Kuba']);
  });
});
