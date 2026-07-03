// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileForm from './ProfileForm';
import { AVATAR_OPTIONS } from './avatarOptions';

describe('ProfileForm', () => {
  it('pre-fills the name and selected avatar from initial props', () => {
    render(
      <ProfileForm
        initialDisplayName="Ola"
        initialAvatarId={AVATAR_OPTIONS[1].id}
        submitLabel="Zapisz"
        submitting={false}
        error={null}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByLabelText('Nazwa wyświetlana')).toHaveValue('Ola');
    expect(
      screen.getByRole('button', { name: `Avatar ${AVATAR_OPTIONS[1].id}` })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('selecting a different avatar updates aria-pressed', async () => {
    const user = userEvent.setup();
    render(
      <ProfileForm
        initialDisplayName="Ola"
        initialAvatarId={AVATAR_OPTIONS[0].id}
        submitLabel="Zapisz"
        submitting={false}
        error={null}
        onSubmit={() => {}}
      />
    );
    await user.click(
      screen.getByRole('button', { name: `Avatar ${AVATAR_OPTIONS[2].id}` })
    );
    expect(
      screen.getByRole('button', { name: `Avatar ${AVATAR_OPTIONS[2].id}` })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: `Avatar ${AVATAR_OPTIONS[0].id}` })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('submits the trimmed name and selected avatar', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ProfileForm
        initialDisplayName=""
        initialAvatarId={AVATAR_OPTIONS[0].id}
        submitLabel="Zapisz"
        submitting={false}
        error={null}
        onSubmit={onSubmit}
      />
    );
    await user.type(screen.getByLabelText('Nazwa wyświetlana'), '  Ola  ');
    await user.click(
      screen.getByRole('button', { name: `Avatar ${AVATAR_OPTIONS[3].id}` })
    );
    await user.click(screen.getByRole('button', { name: 'Zapisz' }));
    expect(onSubmit).toHaveBeenCalledWith({
      displayName: 'Ola',
      avatarId: AVATAR_OPTIONS[3].id,
    });
  });

  it('disables submit when the name is blank', () => {
    render(
      <ProfileForm
        initialDisplayName=""
        initialAvatarId={AVATAR_OPTIONS[0].id}
        submitLabel="Zapisz"
        submitting={false}
        error={null}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Zapisz' })).toBeDisabled();
  });

  it('shows the error message when provided', () => {
    render(
      <ProfileForm
        initialDisplayName="Ola"
        initialAvatarId={AVATAR_OPTIONS[0].id}
        submitLabel="Zapisz"
        submitting={false}
        error="Coś poszło nie tak. Spróbuj ponownie."
        onSubmit={() => {}}
      />
    );
    expect(
      screen.getByText('Coś poszło nie tak. Spróbuj ponownie.')
    ).toBeInTheDocument();
  });
});
