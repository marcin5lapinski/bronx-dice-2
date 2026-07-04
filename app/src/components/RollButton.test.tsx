// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RollButton from './RollButton';

describe('RollButton', () => {
  it('shows the number of rolls left', () => {
    render(<RollButton rollsLeft={3} onRoll={() => {}} />);
    expect(screen.getByText('Pozostałe rzuty: 3')).toBeInTheDocument();
  });

  it('calls onRoll when clicked and rolls remain', async () => {
    const user = userEvent.setup();
    const onRoll = vi.fn();
    render(<RollButton rollsLeft={2} onRoll={onRoll} />);
    await user.click(screen.getByRole('button', { name: 'Rzuć kośćmi' }));
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it('is disabled when no rolls are left', async () => {
    const user = userEvent.setup();
    const onRoll = vi.fn();
    render(<RollButton rollsLeft={0} onRoll={onRoll} />);
    const button = screen.getByRole('button', { name: 'Rzuć kośćmi' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onRoll).not.toHaveBeenCalled();
  });

  it('is disabled when interactive is false even with rolls remaining', () => {
    render(<RollButton rollsLeft={3} onRoll={() => {}} interactive={false} />);
    expect(screen.getByRole('button', { name: 'Rzuć kośćmi' })).toBeDisabled();
  });
});
